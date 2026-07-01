import fs from 'fs';
import path from 'path';
import os from 'os';
import util from 'util';
import DocxParser from 'docx-parser';
import mammoth from 'mammoth';
import PizZip from 'pizzip';
import { extractPdfText } from './custom-pdf-parser';

const writeFileAsync = util.promisify(fs.writeFile);
const readFileAsync = util.promisify(fs.readFile);
const unlinkAsync = util.promisify(fs.unlink);

export type ExtractedTable = {
  id: string;
  title: string;
  source: string;
  confidence: 'high' | 'medium' | 'low';
  sourceFormat?: 'docx_table' | 'html_table' | 'text_table' | 'pdf_text_window' | 'ai_reconstructed';
  exactSourceAvailable?: boolean;
  preservationNote?: string;
  rawOoxml?: string;
  pageLayout?: ExtractedPageLayout;
  headers: string[];
  rows: string[][];
  cells?: ExtractedTableCell[][];
  rawText: string;
  recommendedUse: 'schedule_of_activities' | 'study_schema' | 'general_reference';
};

export type ExtractedPageLayout = {
  orientation: 'portrait' | 'landscape';
  widthTwips?: number;
  heightTwips?: number;
  margins?: {
    top?: number;
    right?: number;
    bottom?: number;
    left?: number;
    header?: number;
    footer?: number;
    gutter?: number;
  };
  source?: 'docx_section' | 'inferred';
};

export type ExtractedTableCell = {
  text: string;
  colSpan?: number;
  rowSpan?: number;
  isHeader?: boolean;
};

export type ExtractedImage = {
  id: string;
  source: string;
  filename?: string;
  mediaType?: string;
  recommendedUse: 'study_schema' | 'general_reference';
  note: string;
  visionSummary?: string;
  dataUri?: string;
};

export type StructuredDocumentExtraction = {
  text: string;
  plainText: string;
  tables: ExtractedTable[];
  images: ExtractedImage[];
  warnings: string[];
  extractionSummary: string;
};

const IMAGE_MEDIA_TYPES: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
};

function decodeXmlEntities(value: string): string {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)));
}

function stripHtml(value: string): string {
  return decodeXmlEntities(
    value
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/p>/gi, '\n')
      .replace(/<[^>]+>/g, ' ')
      .replace(/[ \t]+/g, ' ')
      .trim()
  );
}

function tableUseFromText(text: string): ExtractedTable['recommendedUse'] {
  const lower = text.toLowerCase();
  const soaSignals = [
    lower.includes('schedule of activities') || lower.includes('schedule of assessments') || lower.includes('time and events') || lower.includes('schedule of events'),
    lower.includes('screening'),
    lower.includes('baseline'),
    /\bcycle\b|\bc\d+\b/.test(lower),
    /\bvisit\b|day\s*-?\d+/.test(lower),
    lower.includes('follow-up') || lower.includes('follow up') || lower.includes('end of treatment') || /\beot\b/.test(lower),
    (lower.match(/\bx\b/g) || []).length >= 3,
  ].filter(Boolean).length;
  if (soaSignals >= 4 || lower.includes('schedule of activities') || lower.includes('schedule of assessments')) {
    return 'schedule_of_activities';
  }
  if (
    lower.includes('schema') ||
    lower.includes('randomization') ||
    lower.includes('treatment period') ||
    lower.includes('follow-up') ||
    lower.includes('study flow')
  ) {
    return 'study_schema';
  }
  return 'general_reference';
}

function titleForTable(rawText: string, index: number): string {
  const lower = rawText.toLowerCase();
  if (lower.includes('schedule of activities') || lower.includes('schedule of assessments')) {
    return `Schedule of Activities table ${index}`;
  }
  if (lower.includes('inclusion') && lower.includes('exclusion')) {
    return `Eligibility criteria table ${index}`;
  }
  if (lower.includes('schema') || lower.includes('randomization')) {
    return `Study schema table ${index}`;
  }
  return `Extracted table ${index}`;
}

function formatStructuredExtractionContext(tables: ExtractedTable[], images: ExtractedImage[], warnings: string[]): string {
  const sections: string[] = [];

  if (tables.length > 0) {
    sections.push('STRUCTURED TABLE EXTRACTS');
    for (const table of tables) {
      const headerLine = table.headers.length > 0 ? table.headers.join(' | ') : '';
      const rowLines = table.rows.map(row => row.join(' | ')).join('\n');
      sections.push([
        `[${table.id}] ${table.title}`,
        `Source: ${table.source}`,
        `Recommended use: ${table.recommendedUse}`,
        `Confidence: ${table.confidence}`,
        headerLine,
        rowLines
      ].filter(Boolean).join('\n'));
    }
  }

  if (images.length > 0) {
    sections.push('IMAGE / FIGURE EXTRACTS');
    for (const image of images) {
      sections.push([
        `[${image.id}] ${image.filename || 'Embedded image'}`,
        `Source: ${image.source}`,
        `Recommended use: ${image.recommendedUse}`,
        image.visionSummary ? `Vision interpretation: ${image.visionSummary}` : '',
        image.note
      ].filter(Boolean).join('\n'));
    }
  }

  if (warnings.length > 0) {
    sections.push(`EXTRACTION WARNINGS\n${warnings.map(warning => `- ${warning}`).join('\n')}`);
  }

  return sections.length > 0 ? sections.join('\n\n') : '';
}

type DocxTableArtifact = {
  rawOoxml?: string;
  rawText: string;
  pageLayout?: ExtractedPageLayout;
};

function getXmlAttribute(tag: string | undefined, attrName: string): string | undefined {
  if (!tag) return undefined;
  return tag.match(new RegExp(`\\b${attrName}=["']([^"']+)["']`, 'i'))?.[1];
}

function parseTwipAttribute(tag: string | undefined, attrName: string): number | undefined {
  const value = getXmlAttribute(tag, attrName);
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function parseSectionPageLayout(sectPrXml: string | undefined): ExtractedPageLayout | undefined {
  if (!sectPrXml) return undefined;

  const pgSzTag = sectPrXml.match(/<w:pgSz\b[^>]*\/?>/i)?.[0];
  const pgMarTag = sectPrXml.match(/<w:pgMar\b[^>]*\/?>/i)?.[0];
  const widthTwips = parseTwipAttribute(pgSzTag, 'w:w');
  const heightTwips = parseTwipAttribute(pgSzTag, 'w:h');
  const explicitOrientation = getXmlAttribute(pgSzTag, 'w:orient');
  const orientation = explicitOrientation === 'landscape' || (
    !explicitOrientation && widthTwips != null && heightTwips != null && widthTwips > heightTwips
  ) ? 'landscape' : 'portrait';

  return {
    orientation,
    widthTwips,
    heightTwips,
    margins: pgMarTag ? {
      top: parseTwipAttribute(pgMarTag, 'w:top'),
      right: parseTwipAttribute(pgMarTag, 'w:right'),
      bottom: parseTwipAttribute(pgMarTag, 'w:bottom'),
      left: parseTwipAttribute(pgMarTag, 'w:left'),
      header: parseTwipAttribute(pgMarTag, 'w:header'),
      footer: parseTwipAttribute(pgMarTag, 'w:footer'),
      gutter: parseTwipAttribute(pgMarTag, 'w:gutter'),
    } : undefined,
    source: 'docx_section',
  };
}

function extractTextFromWordXml(xml: string): string {
  const parts: string[] = [];
  const normalized = xml
    .replace(/<w:tab\b[^>]*\/>/gi, '\t')
    .replace(/<w:br\b[^>]*\/>/gi, '\n')
    .replace(/<\/w:p>/gi, '\n')
    .replace(/<\/w:tc>/gi, ' | ');

  for (const match of normalized.matchAll(/<w:t\b[^>]*>([\s\S]*?)<\/w:t>/gi)) {
    parts.push(decodeXmlEntities(match[1]));
  }

  return parts.join(' ').replace(/[ \t]+/g, ' ').replace(/\s+\|\s+/g, ' | ').trim();
}

function findFollowingSectionLayout(documentXml: string, fromIndex: number): ExtractedPageLayout | undefined {
  const followingSectionStart = documentXml.indexOf('<w:sectPr', fromIndex);
  if (followingSectionStart !== -1) {
    const followingSectionEnd = documentXml.indexOf('</w:sectPr>', followingSectionStart);
    if (followingSectionEnd !== -1) {
      return parseSectionPageLayout(documentXml.slice(followingSectionStart, followingSectionEnd + '</w:sectPr>'.length));
    }
  }

  const bodyEnd = documentXml.lastIndexOf('</w:body>');
  const finalSectionStart = documentXml.lastIndexOf('<w:sectPr', bodyEnd);
  if (finalSectionStart !== -1) {
    const finalSectionEnd = documentXml.indexOf('</w:sectPr>', finalSectionStart);
    if (finalSectionEnd !== -1) {
      return parseSectionPageLayout(documentXml.slice(finalSectionStart, finalSectionEnd + '</w:sectPr>'.length));
    }
  }

  return undefined;
}

function extractDocxTableArtifacts(buffer: Buffer): DocxTableArtifact[] {
  try {
    const zip = new PizZip(buffer);
    const documentXml = zip.file('word/document.xml')?.asText();
    if (!documentXml) return [];

    const artifacts: DocxTableArtifact[] = [];
    const tableRegex = /<w:tbl[\s\S]*?<\/w:tbl>/gi;
    let match: RegExpExecArray | null;
    while ((match = tableRegex.exec(documentXml)) !== null) {
      const rawOoxml = match[0];
      const rawText = extractTextFromWordXml(rawOoxml);
      if (!rawText) continue;

      artifacts.push({
        rawOoxml,
        rawText,
        pageLayout: findFollowingSectionLayout(documentXml, match.index + rawOoxml.length)
      });
    }
    return artifacts;
  } catch (error) {
    console.warn('Could not inspect DOCX raw table XML:', error);
    return [];
  }
}

function inferTableLayout(rows: string[][], artifact?: DocxTableArtifact): ExtractedPageLayout | undefined {
  if (artifact?.pageLayout) return artifact.pageLayout;
  const columnCount = Math.max(...rows.map(row => row.length), 0);
  if (columnCount >= 7) {
    return {
      orientation: 'landscape',
      widthTwips: 15840,
      heightTwips: 12240,
      source: 'inferred',
    };
  }
  return undefined;
}

function extractTablesFromHtml(html: string, source: string, docxArtifacts: DocxTableArtifact[] = []): ExtractedTable[] {
  const tables: ExtractedTable[] = [];
  const tableMatches = html.match(/<table[\s\S]*?<\/table>/gi) || [];

  tableMatches.forEach((tableHtml, tableIndex) => {
    const artifact = docxArtifacts[tableIndex];
    const cellRows = (tableHtml.match(/<tr[\s\S]*?<\/tr>/gi) || [])
      .map(rowHtml => (rowHtml.match(/<t[dh][\s\S]*?<\/t[dh]>/gi) || [])
        .map(cellHtml => {
          const openTag = cellHtml.match(/^<t[dh]\b([^>]*)>/i)?.[1] || '';
          const colSpan = Number(openTag.match(/\bcolspan=["']?(\d+)/i)?.[1] || 1);
          const rowSpan = Number(openTag.match(/\browspan=["']?(\d+)/i)?.[1] || 1);
          return {
            text: stripHtml(cellHtml),
            colSpan: colSpan > 1 ? colSpan : undefined,
            rowSpan: rowSpan > 1 ? rowSpan : undefined,
            isHeader: /^<th\b/i.test(cellHtml)
          };
        }))
      .filter(row => row.some(cell => cell.text.length > 0));

    const rows = cellRows
      .map(row => row.map(cell => cell.text))
      .filter(row => row.some(cell => cell.length > 0));

    if (rows.length < 2) return;

    const rawText = rows.map(row => row.join(' | ')).join('\n');
    tables.push({
      id: `table-${tableIndex + 1}`,
      title: titleForTable(rawText, tableIndex + 1),
      source,
      confidence: 'high',
      sourceFormat: 'docx_table',
      exactSourceAvailable: true,
      preservationNote: artifact?.rawOoxml
        ? 'Copied from a DOCX table. The original Word table XML and source page layout are available for exact DOCX export.'
        : 'Copied from a DOCX table. Text, row order, column order, and merged-cell spans are preserved where available.',
      rawOoxml: artifact?.rawOoxml,
      pageLayout: inferTableLayout(rows, artifact),
      headers: rows[0] || [],
      rows: rows.slice(1),
      cells: cellRows,
      rawText,
      recommendedUse: tableUseFromText(rawText)
    });
  });

  return tables;
}

function extractDocxImages(buffer: Buffer, source: string): ExtractedImage[] {
  try {
    const zip = new PizZip(buffer);
    return Object.keys(zip.files)
      .filter(name => name.startsWith('word/media/') && !zip.files[name].dir)
      .map((name, index) => {
        const lower = name.toLowerCase();
        const mediaType = lower.endsWith('.png') ? 'image/png'
          : lower.endsWith('.jpg') || lower.endsWith('.jpeg') ? 'image/jpeg'
          : lower.endsWith('.gif') ? 'image/gif'
          : undefined;
        let dataUri: string | undefined;
        try {
          const imageBuffer = zip.files[name].asNodeBuffer();
          if (mediaType && imageBuffer.length < 4 * 1024 * 1024) {
            dataUri = `data:${mediaType};base64,${imageBuffer.toString('base64')}`;
          }
        } catch (error) {
          console.warn(`Could not read DOCX image ${name}:`, error);
        }
        return {
          id: `image-${index + 1}`,
          source,
          filename: path.basename(name),
          mediaType,
          recommendedUse: 'study_schema' as const,
          dataUri,
          note: dataUri
            ? 'Embedded image detected and queued for optional vision interpretation.'
            : 'Embedded image detected. The image could not be prepared for vision interpretation, so user review is required.'
        };
      });
  } catch (error) {
    console.warn('Could not inspect DOCX embedded images:', error);
    return [];
  }
}

async function interpretImagesWithVision(images: ExtractedImage[]): Promise<ExtractedImage[]> {
  const apiKey = process.env.OPENAI_API_KEY;
  const imagesForVision = images.filter(image => image.dataUri).slice(0, 3);
  if (!apiKey || imagesForVision.length === 0) {
    return images.map(image => ({
      ...image,
      note: image.dataUri
        ? 'Embedded image detected. Vision interpretation is available when OPENAI_API_KEY is configured; until then, user review is required.'
        : image.note
    }));
  }

  try {
    const OpenAI = (await import('openai')).default;
    const openai = new OpenAI({ apiKey });

    const interpreted = await Promise.all(images.map(async image => {
      if (!image.dataUri || !imagesForVision.some(candidate => candidate.id === image.id)) {
        return image;
      }

      try {
        const visionModel = process.env.OPENAI_VISION_MODEL && !/4o/i.test(process.env.OPENAI_VISION_MODEL)
          ? process.env.OPENAI_VISION_MODEL
          : 'gpt-4.1-mini';
        const response = await openai.chat.completions.create({
          model: visionModel,
          max_tokens: 300,
          messages: [
            {
              role: 'user',
              content: [
                {
                  type: 'text',
                  text: [
                    'You are extracting clinical trial protocol source content from an embedded document image.',
                    'If this is a study schema, describe arms, randomization, treatment periods, visits, follow-up, and key flow steps.',
                    'If it is a table or figure, summarize the usable protocol information.',
                    'If it is not clinically useful, say so. Keep the output concise and factual.'
                  ].join(' ')
                },
                {
                  type: 'image_url',
                  image_url: { url: image.dataUri }
                }
              ]
            }
          ]
        });

        const visionSummary = response.choices[0]?.message?.content?.trim();
        const lower = (visionSummary || '').toLowerCase();
        return {
          ...image,
          recommendedUse: lower.includes('schema') || lower.includes('random') || lower.includes('follow-up')
            ? 'study_schema' as const
            : image.recommendedUse,
          visionSummary,
          note: visionSummary
            ? 'Embedded image interpreted by AI vision. User should confirm before final protocol generation.'
            : image.note
        };
      } catch (error) {
        console.warn(`Vision interpretation failed for ${image.filename || image.id}:`, error);
        return {
          ...image,
          note: 'Embedded image detected, but AI vision interpretation failed. User review is required.'
        };
      }
    }));

    return interpreted;
  } catch (error) {
    console.warn('OpenAI vision interpretation could not be initialized:', error);
    return images;
  }
}

function splitLikelyTableLine(line: string): string[] {
  if (line.includes('|')) {
    return line.split('|').map(cell => cell.trim()).filter(Boolean);
  }
  if (line.includes('\t')) {
    return line.split('\t').map(cell => cell.trim()).filter(Boolean);
  }
  return line.split(/\s{2,}/).map(cell => cell.trim()).filter(Boolean);
}

function extractLikelyTablesFromText(text: string, source: string): ExtractedTable[] {
  const tables: ExtractedTable[] = [];
  const lines = text.split(/\n+/).map(line => line.trim()).filter(Boolean);
  let current: string[][] = [];

  const flush = () => {
    if (current.length >= 3 && Math.max(...current.map(row => row.length)) >= 3) {
      const normalizedWidth = Math.max(...current.map(row => row.length));
      const paddedRows = current.map(row => [...row, ...Array(Math.max(0, normalizedWidth - row.length)).fill('')]);
      const rawText = paddedRows.map(row => row.join(' | ')).join('\n');
      const recommendedUse = tableUseFromText(rawText);
      const lower = rawText.toLowerCase();
      const xCount = (lower.match(/\bx\b/g) || []).length;
      const hasSchedulePhrase = /schedule of activities|schedule of assessments|time and events|schedule of events/.test(lower);
      const hasVisitPattern = /screening/.test(lower) && (/baseline/.test(lower) || /\bcycle\b|\bc\d+\b/.test(lower) || /follow[- ]?up|end of treatment|eot/.test(lower));
      const likelyFragment = paddedRows.length <= 6 && normalizedWidth <= 5 && rawText.length > 400;
      if (recommendedUse === 'schedule_of_activities' && likelyFragment && !hasSchedulePhrase && xCount < 3) {
        current = [];
        return;
      }
      if (recommendedUse === 'general_reference' && !hasVisitPattern && !hasSchedulePhrase) {
        current = [];
        return;
      }
      tables.push({
        id: `table-${tables.length + 1}`,
        title: titleForTable(rawText, tables.length + 1),
        source,
        confidence: 'medium',
        sourceFormat: 'text_table',
        exactSourceAvailable: false,
        preservationNote: 'Reconstructed from plain text; source table geometry may not be exact.',
        headers: paddedRows[0] || [],
        rows: paddedRows.slice(1),
        cells: paddedRows.map(row => row.map(cell => ({ text: cell }))),
        rawText,
        recommendedUse
      });
    }
    current = [];
  };

  for (const line of lines) {
    const cells = splitLikelyTableLine(line);
    const looksLikeVisitLine = /(screening|baseline|cycle|day\s*\d+|visit|follow[- ]?up|end of treatment)/i.test(line);
    if (cells.length >= 3 || (looksLikeVisitLine && cells.length >= 2)) {
      current.push(cells);
    } else {
      flush();
    }
  }
  flush();

  return tables;
}

function extractScheduleWindowsFromText(text: string, source: string): ExtractedTable[] {
  const lines = text
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .split('\n')
    .map(line => line.replace(/\s{2,}/g, ' ').trim())
    .filter(Boolean);

  const windows: Array<ExtractedTable & { extractionScore: number }> = [];
  const usedStarts: number[] = [];

  const looksLikeScheduleContext = (context: string) => {
    const lower = context.toLowerCase();
    const score = [
      /time\s*(?:and|&)\s*events\s*schedule|schedule of activities|schedule of assessments|schedule of events/.test(lower),
      /screening phase|screening/.test(lower),
      /treatment phase|open[- ]?label treatment|double[- ]?blind/.test(lower),
      /follow[- ]?up phase|follow[- ]?up/.test(lower),
      /eot|end[- ]?of[- ]?treatment/.test(lower),
      /informed consent|eligibility|dosing compliance|clinical laboratory|adverse events|physical examination|vital signs|ecog|ct or mri|bone scans|epros/.test(lower),
      (lower.match(/\bx\b/g) || []).length >= 3 || /continuous dosing|q\s*\d+\s*(?:cycle|mo|month)|c\d+d\d|day\s*-?\d+/.test(lower),
    ].filter(Boolean).length;
    return score >= 4;
  };

  const scheduleTitlePattern = /time\s*(?:and|&)\s*events\s*schedule|schedule of activities|schedule of assessments|schedule of events/i;
  const isScheduleTitleLine = (line: string) => {
    if (!scheduleTitlePattern.test(line)) return false;
    if (/\brefer to\b|\bsee also\b|\bas specified\b|\bas indicated\b|\baccording to\b|\bwill be\b|\bshould be\b/i.test(line)) return false;
    if (line.length > 140 && !/^time\s*(?:and|&)\s*events\s*schedule/i.test(line)) return false;
    return /^time\s*(?:and|&)\s*events\s*schedule/i.test(line) ||
      /^schedule of/i.test(line) ||
      /^[A-Z0-9\s&()/-]+$/.test(line);
  };

  const makeWindow = (centerIndex: number, titleHint: string) => {
    let titleIndex = centerIndex;
    for (let i = centerIndex; i >= Math.max(0, centerIndex - 10); i -= 1) {
      if (isScheduleTitleLine(lines[i])) {
        titleIndex = i;
        break;
      }
    }

    const start = Math.max(0, titleIndex);
    if (usedStarts.some(existing => Math.abs(existing - start) < 35)) return;

    const end = Math.min(lines.length, centerIndex + 95);
    let contextLines = lines.slice(start, end);
    const nextMajorIndex = contextLines.findIndex((line, index) =>
      index > 25 && /^(abbreviations|1\.introduction|1\s+introduction|attachment\s+\d+|references)$/i.test(line)
    );
    if (nextMajorIndex > 0) {
      contextLines = contextLines.slice(0, nextMajorIndex);
    }

    const rawText = contextLines.join('\n');
    if (!looksLikeScheduleContext(rawText)) return;

    const compact = rawText.toLowerCase();
    const xCount = (rawText.match(/\bX\b/g) || []).length;
    const actualScheduleSignals = [
      /time\s*(?:and|&)\s*events\s*schedule|schedule of activities|schedule of assessments|schedule of events/i.test(rawText),
      /screening phase\s*treatment phase\s*follow[- ]?up phase/i.test(rawText),
      /crossover eligibility phase\s*open[- ]?label treatment\s*phase/i.test(rawText),
      /informed consent|eligibility|dosing compliance|dispense study drug|administer study drug/i.test(rawText),
      /clinical laboratory|hematology|serum chemistry|liver function|psa|fasting lipids|tsh/i.test(rawText),
      /adverse events|physical examination|vital signs|ecog|ct\/?mri|bone scans|epros/i.test(rawText),
      /continuous dosing|q\s*\d+\s*(?:cycle|mo|month)|c\d+d\d|d1\s+of\s+c\d|day\s*-?\d+/i.test(rawText),
      xCount >= 4,
    ].filter(Boolean).length;

    const amendmentSignals = [
      /applicable section\(s\)\s*description of change\(s\)/i.test(rawText),
      /\brationale\s*:/i.test(rawText),
      /\b(?:added|modified|revised|clarified|updated|deleted)\b/i.test(rawText.slice(0, 1600)),
      /amendment\s+\d+|substantial change|protocol amendment/i.test(rawText),
    ].filter(Boolean).length;

    const hasStrongTableHeader =
      /screening phase\s*treatment phase\s*follow[- ]?up phase/i.test(rawText) ||
      /crossover eligibility phase\s*open[- ]?label treatment\s*phase/i.test(rawText) ||
      /time\s*(?:and|&)\s*events\s*schedule\s*\(/i.test(rawText) ||
      /^time\s*(?:and|&)\s*events\s*schedule/i.test(titleHint);

    if (actualScheduleSignals < 3 && !hasStrongTableHeader) return;
    if (amendmentSignals >= 2 && actualScheduleSignals < 5) return;

    const extractionScore =
      actualScheduleSignals * 3 +
      (hasStrongTableHeader ? 6 : 0) +
      Math.min(6, xCount) -
      amendmentSignals * 4;
    if (extractionScore < 8) return;

    const headers = [
      compact.includes('screening') ? 'Screening' : '',
      compact.includes('treatment phase') || compact.includes('open-label treatment') ? 'Treatment Phase' : '',
      compact.includes('eot') || compact.includes('end-of-treatment') ? 'EOT' : '',
      compact.includes('follow-up') || compact.includes('follow up') ? 'Follow-up' : '',
    ].filter(Boolean);

    const rows = contextLines
      .filter(line => /informed consent|eligibility|dosing|administer study drug|physical examination|vital signs|ecog|clinical laboratory|hematology|serum chemistry|liver function|psa|adverse events|ct or mri|bone scan|epro|concomitant therapy|biomarker|survival status/i.test(line))
      .slice(0, 80)
      .map(line => [line]);

    usedStarts.push(start);
    windows.push({
      id: `schedule-window-${windows.length + 1}`,
      title: titleHint || `Schedule of Activities source window ${windows.length + 1}`,
      source,
      confidence: extractionScore >= 18 ? 'medium' : 'low',
      sourceFormat: 'pdf_text_window',
      exactSourceAvailable: false,
      preservationNote: 'Reconstructed from PDF text around a schedule heading; source table geometry is not exact.',
      headers: headers.length ? headers : ['Source schedule text'],
      rows: rows.length ? rows : contextLines.slice(0, 80).map(line => [line]),
      cells: rows.length
        ? rows.map(row => row.map(cell => ({ text: cell })))
        : contextLines.slice(0, 80).map(line => [{ text: line }]),
      rawText,
      recommendedUse: 'schedule_of_activities',
      extractionScore,
    });
  };

  lines.forEach((line, index) => {
    const lower = line.toLowerCase();
    if (scheduleTitlePattern.test(lower)) {
      const tocLike = /\.{5,}\s*\d+\s*$/.test(line);
      if (!tocLike && isScheduleTitleLine(line)) makeWindow(index, line);
    }
    if (
      /screening phase.*treatment phase.*follow[- ]?up phase/i.test(line) ||
      /crossover eligibility phase.*open[- ]?label treatment phase/i.test(line)
    ) {
      makeWindow(index, line.includes('Crossover') ? 'Time and Events Schedule (Open-label Extension Phase)' : 'Time and Events Schedule');
    }
  });

  return windows
    .sort((a, b) => b.extractionScore - a.extractionScore)
    .slice(0, 6)
    .map(({ extractionScore, ...table }, index) => ({
      ...table,
      id: `schedule-window-${index + 1}`,
      title: table.title || `Schedule of Activities source window ${index + 1}`,
    }));
}

function extractStudySchemaFigureCandidates(text: string, source: string): ExtractedImage[] {
  const lines = text
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .split('\n')
    .map(line => line.replace(/\s{2,}/g, ' ').trim())
    .filter(Boolean);

  const schemaTerms = [
    'study schema',
    'study schematic',
    'study design',
    'participant flow',
    'patient flow',
    'randomization',
    'randomisation',
    'screening period',
    'double-blinded period',
    'double-blind period',
    'open-label period',
    'follow-up',
    'primary endpoint analysis'
  ];

  const hitIndexes = lines
    .map((line, index) => ({ line, index }))
    .filter(({ line }) => schemaTerms.some(term => line.toLowerCase().includes(term)))
    .map(hit => hit.index);

  if (hitIndexes.length === 0) return [];

  const candidateWindows = hitIndexes.map(index => {
    const start = Math.max(0, index - 4);
    const end = Math.min(lines.length, index + 22);
    const context = lines.slice(start, end).join('\n');
    const score = [
      /study design|study schema|participant flow|patient flow/i.test(context),
      /screening/i.test(context),
      /randomi[sz]ation|1\s*:\s*1/i.test(context),
      /double[- ]?blind|blinded/i.test(context),
      /open[- ]?label/i.test(context),
      /follow[- ]?up/i.test(context),
      /arm|group|treatment/i.test(context),
      /dose|mg|placebo|q\d?w|once weekly|every 2 weeks/i.test(context),
      /primary endpoint|endpoint analysis/i.test(context),
    ].filter(Boolean).length;
    return { start, end, context, score };
  }).sort((a, b) => b.score - a.score);

  const best = candidateWindows[0];
  if (!best || best.score < 5) return [];

  let context = best.context;
  const studyDesignIndex = context.search(/Study Design\s*:/i);
  if (studyDesignIndex >= 0) {
    const fromStudyDesign = context.slice(studyDesignIndex);
    const stop = fromStudyDesign.search(/\nStudy Population\s*:|\nMain inclusion|\nInclusion Criteria\s*:/i);
    context = (stop > 0 ? fromStudyDesign.slice(0, stop) : fromStudyDesign).trim();
  }

  return [{
    id: 'pdf-schema-figure-1',
    source,
    filename: 'Study schema figure candidate',
    recommendedUse: 'study_schema',
    note: 'Potential study schema figure detected from the PDF text layer. Use it to reproduce the participant flow as closely as possible; user should confirm against the source figure.',
    visionSummary: [
      'Potential study schema / participant-flow figure detected from PDF text.',
      'Use this as source evidence for the Study Schema tab.',
      'Preserve documented periods, randomization, treatment arms, dose labels, planned N, endpoint timing, and follow-up timing when present.',
      'Extracted figure/context text:',
      context.slice(0, 3200)
    ].join('\n')
  }];
}

/**
 * Parse PDF file content to extract text
 * @param buffer PDF file buffer
 * @returns Extracted text from PDF
 */
export async function parsePdfContent(buffer: Buffer): Promise<string> {
  try {
    // Use our custom PDF text extractor
    return await extractPdfText(buffer);
  } catch (error) {
    console.error('Error parsing PDF:', error);
    throw new Error('Failed to parse PDF content');
  }
}

/**
 * Parse DOCX file content to extract text using mammoth.js
 * Mammoth converts DOCX to HTML with good structural preservation
 * @param buffer DOCX file buffer
 * @returns Extracted text from DOCX
 */
export async function parseDocxContent(buffer: Buffer): Promise<string> {
  try {
    console.log('Parsing DOCX using mammoth.js');
    
    // Use mammoth to convert DOCX to plain text
    const result = await mammoth.extractRawText({ 
      buffer: buffer
    });
    
    // Extract the text from result
    const extractedText = result.value;
    
    // Log warnings for debugging
    if (result.messages.length > 0) {
      console.log('Mammoth conversion warnings:', result.messages);
    }
    
    // If mammoth fails to extract meaningful content, fall back to docx-parser
    if (!extractedText || extractedText.trim().length < 50) {
      console.log('Mammoth extraction yielded minimal content, trying docx-parser fallback');
      return await legacyParseDocxContent(buffer);
    }
    
    // Clean up the extracted text
    return extractedText;
  } catch (error) {
    console.error('Error parsing DOCX with mammoth:', error);
    // Fallback to the legacy parser if mammoth fails
    try {
      console.log('Trying docx-parser as fallback');
      return await legacyParseDocxContent(buffer);
    } catch (fallbackError) {
      console.error('Both DOCX parsers failed:', fallbackError);
      throw new Error('Failed to parse DOCX content');
    }
  }
}

export async function parseDocxStructuredContent(buffer: Buffer, filename: string): Promise<StructuredDocumentExtraction> {
  const source = filename;
  const warnings: string[] = [];
  let plainText = '';
  let tables: ExtractedTable[] = [];
  const docxTableArtifacts = extractDocxTableArtifacts(buffer);

  try {
    const htmlResult = await mammoth.convertToHtml({ buffer });
    tables = extractTablesFromHtml(htmlResult.value, source, docxTableArtifacts);
    if (htmlResult.messages.length > 0) {
      warnings.push(...htmlResult.messages.map(message => message.message));
    }
  } catch (error) {
    warnings.push('Could not preserve DOCX table structure; falling back to text-only extraction.');
    console.warn('DOCX HTML/table extraction failed:', error);
  }

  plainText = await parseDocxContent(buffer);

  if (tables.length === 0) {
    tables = extractLikelyTablesFromText(plainText, source);
  }

  const images = await interpretImagesWithVision(extractDocxImages(buffer, source));
  const structuredContext = formatStructuredExtractionContext(tables, images, warnings);
  const text = [cleanExtractedText(plainText), structuredContext].filter(Boolean).join('\n\n');

  return {
    text,
    plainText: cleanExtractedText(plainText),
    tables,
    images,
    warnings,
    extractionSummary: `Extracted ${tables.length} table(s) and detected ${images.length} embedded image(s) from ${filename}.`
  };
}

export async function parsePdfStructuredContent(buffer: Buffer, filename: string): Promise<StructuredDocumentExtraction> {
  const source = filename;
  const warnings: string[] = [];
  const rawText = await parsePdfContent(buffer);
  const plainText = cleanExtractedText(rawText);
  const tableCandidates = [
    ...extractLikelyTablesFromText(rawText, source),
    ...extractScheduleWindowsFromText(rawText, source),
  ];
  const tables = tableCandidates.filter((table, index, all) => {
    const raw = table.rawText.slice(0, 1200);
    return index === all.findIndex(candidate => candidate.recommendedUse === table.recommendedUse && candidate.rawText.slice(0, 1200) === raw);
  });
  const images: ExtractedImage[] = extractStudySchemaFigureCandidates(rawText, source);

  const textPerPageSignal = rawText.replace(/\s+/g, '').length;
  if (textPerPageSignal < 600) {
    warnings.push('PDF text extraction returned limited text. The file may be scanned or image-heavy and may require OCR/vision review.');
    images.push({
      id: 'pdf-image-review-1',
      source,
      recommendedUse: 'study_schema',
      note: 'PDF may contain image-based content. If a study schema or SoA is present only as an image, use a vision/OCR extraction step before relying on generation.'
    });
  }

  const structuredContext = formatStructuredExtractionContext(tables, images, warnings);

  return {
    text: [plainText, structuredContext].filter(Boolean).join('\n\n'),
    plainText,
    tables,
    images,
    warnings,
    extractionSummary: `Extracted ${tables.length} likely table(s) and detected ${images.length} schema figure candidate(s) from ${filename}. PDF table and figure reconstruction confidence depends on source formatting.`
  };
}

async function parseImageStructuredContent(buffer: Buffer, filename: string): Promise<StructuredDocumentExtraction> {
  const extension = path.extname(filename).toLowerCase();
  const mediaType = IMAGE_MEDIA_TYPES[extension] || 'application/octet-stream';
  const source = filename;
  const warnings: string[] = [];
  let dataUri: string | undefined;

  if (buffer.length <= 4 * 1024 * 1024) {
    dataUri = `data:${mediaType};base64,${buffer.toString('base64')}`;
  } else {
    warnings.push('Image is larger than the inline preview limit. Upload a smaller image if you want exact source-image insertion.');
  }

  const images = await interpretImagesWithVision([{
    id: 'uploaded-schema-image-1',
    source,
    filename,
    mediaType,
    recommendedUse: 'study_schema',
    dataUri,
    note: dataUri
      ? 'Uploaded image saved as a Study Schema source figure. User can insert it as-is or create an editable AI redraw.'
      : 'Uploaded image detected, but it is too large to embed as an exact source figure.'
  }]);

  const plainText = images[0]?.visionSummary ||
    'Uploaded Study Schema image. Use this as an exact source figure or as evidence for an editable redraw.';
  const structuredContext = formatStructuredExtractionContext([], images, warnings);

  return {
    text: [plainText, structuredContext].filter(Boolean).join('\n\n'),
    plainText,
    tables: [],
    images,
    warnings,
    extractionSummary: `Detected uploaded image ${filename} as a Study Schema source figure.`
  };
}

/**
 * Legacy DOCX parsing method using docx-parser (fallback)
 * @param buffer DOCX file buffer
 * @returns Extracted text from DOCX
 */
async function legacyParseDocxContent(buffer: Buffer): Promise<string> {
  try {
    // Write the buffer to a temporary file as docx-parser requires a file path
    const tempFilePath = path.join(os.tmpdir(), `docx-${Date.now()}.docx`);
    await writeFileAsync(tempFilePath, buffer);
    
    // Create a promise to handle the callback-based docx-parser
    return new Promise((resolve, reject) => {
      DocxParser.parseDocx(tempFilePath, (error: Error | null, output: string) => {
        // Clean up the temporary file
        unlinkAsync(tempFilePath).catch(e => console.error('Error removing temp file:', e));
        
        if (error) {
          console.error('Error with docx-parser:', error);
          reject(new Error('Failed to parse DOCX content'));
        } else {
          resolve(output);
        }
      });
    });
  } catch (error) {
    console.error('Error with legacy DOCX parsing:', error);
    throw new Error('Failed to parse DOCX content with fallback method');
  }
}

/**
 * Clean up text extracted from documents
 * Removes non-printable characters and normalizes whitespace
 */
export function cleanExtractedText(text: string): string {
  return text
    .replace(/[^\x20-\x7E\u00A0-\u00FF\u0100-\u017F\u0180-\u024F\r\n\t]/g, '') // Keep basic Latin, Latin-1 Supplement, Latin Extended A/B
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/\n{3,}/g, '\n\n') // Normalize excessive newlines
    .replace(/[ \t]{2,}/g, ' ') // Normalize horizontal whitespace without destroying line/table boundaries
    .trim();
}

/**
 * Save a file buffer to a temporary location
 * @param buffer File buffer to save
 * @param filename Original filename
 * @returns Path to the saved temporary file
 */
export async function saveTempFile(buffer: Buffer, filename: string): Promise<string> {
  const tempDir = os.tmpdir();
  const tempFilePath = path.join(tempDir, `synopsis-${Date.now()}-${path.basename(filename)}`);
  
  await writeFileAsync(tempFilePath, buffer);
  return tempFilePath;
}

/**
 * Extract text from a file based on its extension
 * @param buffer File buffer
 * @param filename Original filename with extension
 * @returns Extracted text content
 */
export async function extractTextFromFile(buffer: Buffer, filename: string): Promise<string> {
  return (await extractStructuredContentFromFile(buffer, filename)).text;
}

export async function extractStructuredContentFromFile(buffer: Buffer, filename: string): Promise<StructuredDocumentExtraction> {
  const extension = path.extname(filename).toLowerCase();
  
  try {
    if (extension === '.pdf') {
      return await parsePdfStructuredContent(buffer, filename);
    } else if (extension === '.docx') {
      return await parseDocxStructuredContent(buffer, filename);
    } else if (IMAGE_MEDIA_TYPES[extension]) {
      return await parseImageStructuredContent(buffer, filename);
    } else if (extension === '.doc') {
      // For .doc files provide a helpful message as they're not directly supported
      const text = "Microsoft Word .doc format detected. Please save your file as .docx or convert to PDF for better compatibility.";
      return {
        text,
        plainText: text,
        tables: [],
        images: [],
        warnings: ["Legacy .doc files are not table/image parsed. Convert to .docx or PDF."],
        extractionSummary: "Legacy .doc file detected; no structured extraction performed."
      };
    } else {
      // For text files, just convert buffer to string
      const plainText = cleanExtractedText(buffer.toString('utf8'));
      const tables = extractLikelyTablesFromText(buffer.toString('utf8'), filename);
      const structuredContext = formatStructuredExtractionContext(tables, [], []);
      return {
        text: [plainText, structuredContext].filter(Boolean).join('\n\n'),
        plainText,
        tables,
        images: [],
        warnings: [],
        extractionSummary: `Extracted ${tables.length} likely table(s) from ${filename}.`
      };
    }
  } catch (error) {
    console.error(`Error extracting text from ${extension} file:`, error);
    throw new Error(`Failed to extract text from ${extension} file`);
  }
}

/**
 * Remove a temporary file
 * @param filePath Path to temporary file
 */
export async function removeTempFile(filePath: string): Promise<void> {
  try {
    await unlinkAsync(filePath);
  } catch (error) {
    console.error('Error removing temporary file:', error);
  }
}
