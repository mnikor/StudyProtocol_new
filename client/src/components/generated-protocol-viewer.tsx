import React, { useState } from "react";
import { 
  Card, 
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  CardFooter
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AlertCircle, Download, FileCheck, ArrowLeft, Eye, Info } from "lucide-react";
import { Protocol } from "@shared/schema";
import { AIGeneratedBadge } from "./ai-generated-badge";
import { apiRequest } from "../lib/apiRequest";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { ProvenanceInfo, getProvenance, ProvenanceOrigin } from "@/components/provenance-info";

interface GeneratedProtocolViewerProps {
  protocol: Protocol;
  onClose: () => void;
}

type GeneratedProtocolSection = {
  id: string;
  title: string;
  content: string;
  provenance?: {
    origin?: string;
    action?: string;
    why?: string;
    sourceName?: string;
    sourceExcerpt?: string;
  };
  traceability?: {
    boilerplateTitle?: string;
    boilerplateText?: string;
    reviewItems?: Array<{
      label?: string;
      classification?: string;
      decision?: string;
      sourceText?: string;
      proposedText?: string;
      finalText?: string;
      reason?: string;
      confidence?: number;
    }>;
    m11Template?: string;
    generatedAt?: string;
  };
};

const M11_TEMPLATE_VERSION = "ICH M11 CeSHarP final template, 19 Nov 2025";

const m11SectionTitles: Record<string, string> = {
  title: "Title Page and Protocol Identifiers",
  synopsis: "1 Protocol Summary",
  trial_schema: "1.2 Trial Schema",
  schedule: "1.3 Schedule of Activities",
  introduction: "2 Introduction",
  objectives: "3 Trial Objectives and Associated Estimands",
  design: "4 Trial Design",
  population: "5 Trial Population",
  treatments: "6 Trial Intervention and Concomitant Therapy",
  discontinuation: "7 Trial Intervention and Participant Discontinuation",
  assessments: "8 Trial Assessments and Procedures",
  safety: "9 Safety Reporting and Product Complaints",
  statistics: "10 Statistical Considerations",
  ethical: "11 Trial Oversight and Other General Considerations",
  administrative: "12 Administrative and Reference Appendices",
  data_management: "Data Management",
  monitoring: "Monitoring, Quality Assurance, and Compliance",
};

const originStyles: Record<ProvenanceOrigin, { label: string; className: string; dot: string }> = {
  source: {
    label: "Source as-is",
    className: "border-l-4 border-l-[#51cf66] bg-[#ebfbee]",
    dot: "bg-[#40c057]",
  },
  supporting_source: {
    label: "Supporting source",
    className: "border-l-4 border-l-[#20c997] bg-[#e6fcf5]",
    dot: "bg-[#12b886]",
  },
  ai_improved: {
    label: "AI improved",
    className: "border-l-4 border-l-[#fab005] bg-[#fff9db]",
    dot: "bg-[#f59f00]",
  },
  ai_generated: {
    label: "AI generated",
    className: "border-l-4 border-l-[#339af0] bg-[#e7f5ff]",
    dot: "bg-[#228be6]",
  },
  boilerplate: {
    label: "Boilerplate",
    className: "border-l-4 border-l-[#845ef7] bg-[#f3f0ff]",
    dot: "bg-[#7950f2]",
  },
  manual: {
    label: "Manual edit",
    className: "border-l-4 border-l-[#868e96] bg-[#f8f9fa]",
    dot: "bg-[#868e96]",
  },
  placeholder: {
    label: "Placeholder",
    className: "border-l-4 border-l-[#ff6b6b] bg-[#fff5f5]",
    dot: "bg-[#fa5252]",
  },
  removed: {
    label: "Removed",
    className: "border-l-4 border-l-[#fa5252] bg-[#fff5f5]",
    dot: "bg-[#fa5252]",
  },
  unknown: {
    label: "Traceability inferred",
    className: "border-l-4 border-l-[#339af0] bg-[#f8fbff]",
    dot: "bg-[#adb5bd]",
  },
};

const getM11Title = (section: GeneratedProtocolSection): string => {
  return m11SectionTitles[section.id] || section.title;
};

const isScheduleGeneratedSection = (section: GeneratedProtocolSection) =>
  section.id === "schedule" ||
  section.id === "schedule_of_activities" ||
  /^1\.3\s+Schedule of Activities/i.test(section.title) ||
  /^Schedule of Activities$/i.test(section.title);

const stripEmbeddedScheduleBlocks = (content: string, section: GeneratedProtocolSection) => {
  if (!content || isScheduleGeneratedSection(section)) return content;

  let cleaned = String(content);
  cleaned = cleaned.replace(
    /\n{0,2}#{0,6}\s*Schedule of Activities\s*\n+\|[\s\S]*?(?=\n{2,}(?:#{1,6}\s+|\d+(?:\.\d+)*\s+[A-Z][^\n]+)|\n{2,}[A-Z][A-Za-z][^\n]{0,80}\n|$)/gi,
    "\n\n"
  );
  cleaned = cleaned.replace(
    /\n{0,2}\|[^\n]*(?:Assessment\s*\/\s*Procedure|Assessment Type|Screening\s*(?:≤|<=)?)[^\n]*\|\s*\n\|[-:|\s]+\|\s*\n(?:\|[^\n]*\|\s*\n?)+/gi,
    "\n\n"
  );
  cleaned = cleaned.replace(/\n{0,2}Notes\s*\n(?:\s*[-*•]\s+[^\n]+\n?){2,}/gi, "\n\n");
  return cleaned.replace(/\n{3,}/g, "\n\n").trim();
};

const includesMeaningfulSnippet = (text: string, candidate?: string) => {
  const normalizedText = text.toLowerCase().replace(/\s+/g, " ").trim();
  const normalizedCandidate = String(candidate || "").toLowerCase().replace(/\s+/g, " ").trim();
  if (!normalizedText || normalizedText.length < 24 || !normalizedCandidate || normalizedCandidate.length < 24) {
    return false;
  }
  return normalizedCandidate.includes(normalizedText.slice(0, Math.min(normalizedText.length, 180))) ||
    normalizedText.includes(normalizedCandidate.slice(0, Math.min(normalizedCandidate.length, 180)));
};

const normalizeForTraceability = (value: any) => {
  return String(value || "")
    .toLowerCase()
    .replace(/<[^>]*>/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
};

const tokenOverlapScore = (needle: string, haystack: string) => {
  const needleTokens = new Set(normalizeForTraceability(needle).split(" ").filter((token) => token.length > 3));
  const haystackTokens = new Set(normalizeForTraceability(haystack).split(" ").filter((token) => token.length > 3));
  if (needleTokens.size < 3 || haystackTokens.size < 3) return 0;
  let overlap = 0;
  needleTokens.forEach((token) => {
    if (haystackTokens.has(token)) overlap += 1;
  });
  return overlap / needleTokens.size;
};

const textContainsBlock = (blockText: string, sourceText?: string) => {
  if (includesMeaningfulSnippet(blockText, sourceText)) return true;
  return tokenOverlapScore(blockText, String(sourceText || "")) >= 0.38;
};

const bestEvidenceMatch = (
  blockText: string,
  evidenceItems: Array<{ origin: ProvenanceOrigin; sourceName: string; text: string; why: string }>
) => {
  return evidenceItems
    .map((item) => ({ item, score: tokenOverlapScore(blockText, item.text) }))
    .filter(({ score }) => score >= 0.22)
    .sort((a, b) => b.score - a.score)[0];
};

const stringifySourceValue = (value: any): string => {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    return value.map((item) => stringifySourceValue(item)).join("\n");
  }
  if (typeof value === "object") {
    return Object.entries(value)
      .map(([key, item]) => `${key}: ${stringifySourceValue(item)}`)
      .join("\n");
  }
  return String(value);
};

const parseMaybeJson = (value: any) => {
  if (!value || typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
};

const getSupplementaryEvidence = (protocol: any) => {
  const supplementary = parseMaybeJson(protocol?.supplementaryInfo);
  const items = Array.isArray(supplementary) ? supplementary : [];
  return items
    .map((item: any) => ({
      origin: "supporting_source" as ProvenanceOrigin,
      sourceName: item?.fileName || item?.title || item?.type || "Supporting document",
      text: stringifySourceValue(item?.text || item?.content || item?.chunks || item),
      why: item?.context || item?.usage || "This content was available in an uploaded supporting source.",
    }))
    .filter((item) => item.text);
};

const getSectionTabEvidence = (protocol: any, sectionId: string) => {
  const parsedProtocol: any = protocol || {};
  const fieldsBySection: Record<string, Array<{ field: string; label: string; origin: ProvenanceOrigin }>> = {
    synopsis: [{ field: "synopsis", label: "Source Synopsis", origin: "source" }],
    introduction: [{ field: "synopsis", label: "Source Synopsis", origin: "source" }],
    objectives: [{ field: "synopsis", label: "Source Synopsis", origin: "source" }],
    design: [
      { field: "synopsis", label: "Source Synopsis", origin: "source" },
      { field: "studySchema", label: "Study Schema tab", origin: "ai_improved" },
    ],
    population: [
      { field: "synopsis", label: "Source Synopsis", origin: "source" },
      { field: "inclusionCriteria", label: "Eligibility Criteria tab", origin: "ai_improved" },
      { field: "exclusionCriteria", label: "Eligibility Criteria tab", origin: "ai_improved" },
    ],
    criteria: [
      { field: "inclusionCriteria", label: "Eligibility Criteria tab", origin: "ai_improved" },
      { field: "exclusionCriteria", label: "Eligibility Criteria tab", origin: "ai_improved" },
      { field: "synopsis", label: "Source Synopsis", origin: "source" },
    ],
    schedule: [
      { field: "tableData", label: "Schedule of Activities tab", origin: "ai_improved" },
      { field: "tableHeaders", label: "Schedule of Activities tab", origin: "ai_improved" },
    ],
    trial_schema: [
      { field: "studySchema", label: "Study Schema tab", origin: "ai_improved" },
      { field: "synopsis", label: "Source Synopsis", origin: "source" },
    ],
    treatments: [
      { field: "safetyDrugHandling", label: "Safety & Drug Handling tab", origin: "ai_improved" },
      { field: "synopsis", label: "Source Synopsis", origin: "source" },
    ],
    discontinuation: [
      { field: "safetyDrugHandling", label: "Safety & Drug Handling tab", origin: "ai_improved" },
      { field: "synopsis", label: "Source Synopsis", origin: "source" },
    ],
    assessments: [
      { field: "tableData", label: "Schedule of Activities tab", origin: "ai_improved" },
      { field: "dataVariables", label: "Data Variables tab", origin: "ai_improved" },
      { field: "synopsis", label: "Source Synopsis", origin: "source" },
    ],
    safety: [
      { field: "safetyDrugHandling", label: "Safety & Drug Handling tab", origin: "ai_improved" },
      { field: "synopsis", label: "Source Synopsis", origin: "source" },
    ],
    statistics: [
      { field: "statisticalAnalysisPlan", label: "Statistical Analysis Plan tab", origin: "ai_improved" },
      { field: "synopsis", label: "Source Synopsis", origin: "source" },
    ],
    ethical: [{ field: "synopsis", label: "Source Synopsis", origin: "source" }],
    administrative: [{ field: "synopsis", label: "Source Synopsis", origin: "source" }],
  };

  const fieldRefs = fieldsBySection[sectionId] || [{ field: "synopsis", label: "Source Synopsis", origin: "source" as ProvenanceOrigin }];
  return fieldRefs
    .map(({ field, label, origin }) => ({
      origin,
      sourceName: label,
      text: stringifySourceValue(parseMaybeJson(parsedProtocol[field])),
      why: origin === "source"
        ? "The paragraph is supported by information from the uploaded synopsis/PED source."
        : `The paragraph is supported by content prepared in the ${label}.`,
    }))
    .filter((item) => item.text);
};

const isStructuralHeading = (blockText: string) => {
  const clean = stripMarkdown(blockText).trim();
  if (!clean || clean.includes("\n")) return false;
  if (/^#{1,6}\s+/.test(blockText.trim())) return true;
  if (clean.length > 90) return false;
  if (/[.;]$/.test(clean)) return false;
  return /^(primary|secondary|exploratory|other|key|inclusion|exclusion|objectives|background|rationale|trial|study|safety|efficacy|statistical|estimand|endpoint|population|intervention|concomitant|discontinuation|assessment|procedure|data|administrative)/i.test(clean);
};

const getHeadingLevel = (blockText: string) => {
  const markdownLevel = blockText.trim().match(/^(#{1,6})\s+/)?.[1].length;
  if (markdownLevel) return Math.min(Math.max(markdownLevel, 2), 4);
  const clean = stripMarkdown(blockText).trim();
  if (/^(primary|secondary|exploratory|other|key)\b/i.test(clean)) return 3;
  return 2;
};

const inferBlockProvenance = (section: GeneratedProtocolSection, blockText: string, protocol?: Protocol) => {
  const reviewItems = section.traceability?.reviewItems || [];
  const matchingReview = reviewItems.find((item) =>
    textContainsBlock(blockText, item.finalText) ||
    textContainsBlock(blockText, item.proposedText) ||
    textContainsBlock(blockText, item.sourceText)
  );

  if (matchingReview) {
    const hasSourceSupport = Boolean(matchingReview.sourceText && tokenOverlapScore(blockText, matchingReview.sourceText) >= 0.2);
    const origin =
      matchingReview.decision === "source" || matchingReview.classification === "use_as_is"
        ? "source"
        : matchingReview.classification === "improve" || hasSourceSupport
          ? "ai_improved"
          : matchingReview.classification === "placeholder" || matchingReview.classification === "needs_user_input"
            ? "placeholder"
            : "ai_generated";

    return getProvenance({
      origin,
      sourceText: matchingReview.sourceText,
      reason: matchingReview.reason,
      confidence: matchingReview.confidence ? `${Math.round(Number(matchingReview.confidence) * 100)}%` : "",
      label: matchingReview.label,
    });
  }

  if (textContainsBlock(blockText, section.traceability?.boilerplateText)) {
    return getProvenance({
      origin: "boilerplate",
      sourceName: section.traceability?.boilerplateTitle || "Selected boilerplate",
      reason: "This paragraph matches the boilerplate text selected for this protocol section.",
    });
  }

  if (/\[(tbd|placeholder|to be confirmed|insert|not available|not provided|missing)[^\]]*\]/i.test(blockText) || /\b(TBD|to be confirmed)\b/i.test(blockText)) {
    return getProvenance({
      origin: "placeholder",
      reason: "The required protocol information was not available from the current source set.",
    });
  }

  const evidenceItems = [
    ...getSectionTabEvidence(protocol, section.id),
    ...getSupplementaryEvidence(protocol),
  ];
  const matchingEvidence = evidenceItems.find((item) => textContainsBlock(blockText, item.text));
  const scoredEvidence = matchingEvidence ? { item: matchingEvidence, score: 1 } : bestEvidenceMatch(blockText, evidenceItems);
  if (scoredEvidence?.item) {
    return getProvenance({
      origin: scoredEvidence.item.origin,
      sourceName: scoredEvidence.item.sourceName,
      sourceText: scoredEvidence.item.text,
      reason: scoredEvidence.item.why,
      confidence: `${Math.round(Math.min(1, scoredEvidence.score) * 100)}% source overlap`,
    });
  }

  if (section.provenance?.origin) {
    return getProvenance(section.provenance);
  }

  if (section.provenance?.sourceName || section.provenance?.why) {
    return getProvenance({
      ...section.provenance,
      origin: "ai_generated",
    });
  }

  if (section.traceability?.reviewItems && section.traceability.reviewItems.length > 0) {
    const improveCount = section.traceability.reviewItems.filter((item) => item.classification === "improve").length;
    const sourceCount = section.traceability.reviewItems.filter((item) => item.classification === "use_as_is" || item.decision === "source").length;
    const generatedCount = section.traceability.reviewItems.length - improveCount - sourceCount;
    const origin: ProvenanceOrigin =
      improveCount >= sourceCount && improveCount >= generatedCount
        ? "ai_improved"
        : sourceCount >= generatedCount
          ? "source"
          : "ai_generated";
    return getProvenance({
      origin,
      sourceName: "Protocol input review",
      reason: "This section was generated using accepted review decisions for source use, improvement, and missing content.",
    });
  }

  return getProvenance({
    origin: "ai_generated",
    reason: "This final protocol paragraph was produced during protocol generation. More precise row or sentence provenance was not available for this generated section.",
  });
};

const splitContentBlocks = (content: string) => {
  return content
    .replace(/<br\s*\/?>/gi, "\n")
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean);
};

const stripMarkdown = (text: string) => {
  return text
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/\*(.*?)\*/g, "$1");
};

const prepareSectionContentForDisplay = (content: string) => {
  const lines = content.split("\n");
  return lines.map((line, index) => {
    const trimmed = line.trim();
    if (!trimmed || /^#{1,6}\s+/.test(trimmed) || trimmed.startsWith("|") || trimmed.startsWith("<")) {
      return line;
    }

    const next = lines[index + 1]?.trim() || "";
    const previous = lines[index - 1]?.trim() || "";
    const looksLikeHeading = isStructuralHeading(trimmed) && (next || previous === "");
    if (!looksLikeHeading) return line;

    const level = getHeadingLevel(trimmed);
    return `${"#".repeat(level)} ${trimmed}`;
  }).join("\n");
};

// Helper function to format the Schedule of Activities as a proper HTML table
const formatScheduleTable = (content: string): string => {
  // Check if content already has HTML table markup
  if (content.includes("<table")) {
    return content;
  }
  
  // Handle markdown tables specially
  const hasScheduleMarkdownTable = /\|[^\n]*(Assessment\s*\/\s*Procedure|Assessment Type|Screening\s*(?:≤|<=)?)[^\n]*\|/i.test(content);
  if (hasScheduleMarkdownTable) {
    try {
      console.log("Converting markdown table to HTML table");
      
      // Split the content by lines
      const lines = content.split('\n');
      
      // Find the table start and end
      let tableStartIndex = -1;
      let tableEndIndex = -1;
      
      for (let i = 0; i < lines.length; i++) {
        if (/\|[^\n]*(Assessment\s*\/\s*Procedure|Assessment Type|Screening\s*(?:≤|<=)?)[^\n]*\|/i.test(lines[i])) {
          tableStartIndex = i;
          break;
        }
      }
      
      if (tableStartIndex >= 0) {
        // Find where the table ends (empty line after table or end of content)
        for (let i = tableStartIndex + 1; i < lines.length; i++) {
          if (lines[i].trim() === '') {
            tableEndIndex = i - 1;
            break;
          }
        }
        
        if (tableEndIndex < 0) {
          tableEndIndex = lines.length - 1; // Table goes to end of content
        }
        
        // Extract the markdown table
        const tableLines = lines.slice(tableStartIndex, tableEndIndex + 1);
        
        // Create HTML table
        let htmlTable = '<table class="min-w-full border-collapse border border-[#dee2e6]">\n<thead>\n<tr>';
        
        // Process header row
        const headerCells = tableLines[0].split('|').map(cell => cell.trim()).filter(cell => cell);
        for (const cell of headerCells) {
          htmlTable += `<th class="border border-[#dee2e6] bg-[#f8f9fa] p-2 text-center font-medium">${cell}</th>`;
        }
        htmlTable += '</tr>\n</thead>\n<tbody>\n';
        
        // Skip the header and separator rows, process data rows
        for (let i = 2; i < tableLines.length; i++) {
          const line = tableLines[i];
          if (line.trim() === '') continue;
          
          // Process each cell in the row
          const cells = line.split('|').map(cell => cell.trim()).filter(cell => cell);
          
          // Check if this is a category header row (has a single cell with **)
          if (cells.length === 1 && cells[0].includes('**')) {
            const categoryName = cells[0].replace(/\*\*/g, '');
            htmlTable += `<tr><td colspan="${headerCells.length}" class="border border-[#dee2e6] bg-gray-100 p-2 font-semibold">${categoryName}</td></tr>\n`;
          } else {
            // Regular data row
            htmlTable += '<tr>';
            for (let j = 0; j < cells.length; j++) {
              let cellContent = cells[j].trim();
              
              if (j === 0) {
                // First column (assessment name)
                htmlTable += `<td class="border border-[#dee2e6] p-2 font-medium">${cellContent}</td>`;
              } else if (cellContent === 'X' || cellContent === 'x') {
                // X mark cells
                htmlTable += `<td class="border border-[#dee2e6] p-2 text-center font-medium text-[#228be6]">X</td>`;
              } else {
                // Regular cells
                htmlTable += `<td class="border border-[#dee2e6] p-2 text-center">${cellContent}</td>`;
              }
            }
            htmlTable += '</tr>\n';
          }
        }
        
        htmlTable += '</tbody>\n</table>';
        
        // Replace the markdown table in the content with the HTML table
        const beforeTable = lines.slice(0, tableStartIndex).join('\n');
        const afterTable = lines.slice(tableEndIndex + 1).join('\n');
        return beforeTable + htmlTable + afterTable;
      }
    } catch (e) {
      console.error("Error converting markdown table to HTML:", e);
      // Fall back to other methods
    }
  }

  // Extract structured data if content appears to be JSON
  if (content.includes('"tableHeaders"') && content.includes('"tableData"')) {
    try {
      // Try to parse any JSON in the content
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const jsonData = JSON.parse(jsonMatch[0]);
        
        // Parse tableHeaders and tableData if they're strings
        const tableHeaders = typeof jsonData.tableHeaders === 'string' ? 
          JSON.parse(jsonData.tableHeaders) : jsonData.tableHeaders;
          
        const tableData = typeof jsonData.tableData === 'string' ? 
          JSON.parse(jsonData.tableData) : jsonData.tableData;
        
        if (tableHeaders && tableData) {
          // Create a nice HTML table from the structured data
          let htmlTable = '<table class="min-w-full border-collapse border border-[#dee2e6]">\n<thead>\n<tr>';
          
          // Add empty cell for the corner
          htmlTable += '<th class="border border-[#dee2e6] bg-[#f8f9fa] p-2 text-left font-medium">Assessment</th>';
          
          // Add column headers
          tableHeaders.forEach((header: string) => {
            htmlTable += `<th class="border border-[#dee2e6] bg-[#f8f9fa] p-2 text-center font-medium">${header}</th>`;
          });
          
          htmlTable += '</tr>\n</thead>\n<tbody>\n';
          
          // Process each category and its assessments
          for (const [category, assessments] of Object.entries(tableData)) {
            // Add category header
            htmlTable += `<tr><td colspan="${tableHeaders.length + 1}" class="border border-[#dee2e6] bg-gray-100 p-2 font-semibold">${category}</td></tr>\n`;
            
            // Add each assessment row
            if (Array.isArray(assessments)) {
              assessments.forEach((item: any) => {
                if (item && item.assessment && Array.isArray(item.values)) {
                  htmlTable += '<tr>';
                  
                  // Assessment name
                  htmlTable += `<td class="border border-[#dee2e6] p-2 font-medium">${item.assessment}</td>`;
                  
                  // Values (X marks)
                  item.values.forEach((value: string) => {
                    if (value === 'X' || value === 'x') {
                      htmlTable += `<td class="border border-[#dee2e6] p-2 text-center font-medium text-[#228be6]">X</td>`;
                    } else {
                      htmlTable += `<td class="border border-[#dee2e6] p-2 text-center">${value || ''}</td>`;
                    }
                  });
                  
                  htmlTable += '</tr>\n';
                }
              });
            }
          }
          
          htmlTable += '</tbody>\n</table>';
          return htmlTable;
        }
      }
    } catch (e) {
      console.error("Error parsing JSON table data:", e);
      // Fall through to other formatting options
    }
  }
  
  // If the schedule is in a vertical pipe format
  if (content.includes("|")) {
    // Convert the plain text table to HTML
    const lines = content.split('\n');
    let htmlTable = '<table class="min-w-full border-collapse border border-[#dee2e6]">\n<thead>\n<tr>';
    
    // Process headers
    let headers: string[] = [];
    let headerLineIndex = -1;
    
    // Find the header line
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes('|') && !lines[i].includes('---') && 
          (lines[i].includes('Assessment') || lines[i].includes('Type') || 
           lines[i].includes('Baseline') || lines[i].includes('Cycle'))) {
        headers = lines[i].split('|').map(h => h.trim()).filter(h => h);
        headerLineIndex = i;
        break;
      }
    }
    
    if (headerLineIndex >= 0) {
      // Process headers
      headers.forEach(header => {
        htmlTable += `<th class="border border-[#dee2e6] bg-[#f8f9fa] p-2 text-left font-medium">${header}</th>`;
      });
      htmlTable += '</tr>\n</thead>\n<tbody>\n';
      
      // Initialize for category tracking
      let currentCategory = '';
      
      // Process data rows, skipping any separator lines (those with --)
      for (let i = 0; i < lines.length; i++) {
        // Skip header or separator lines
        if (i === headerLineIndex || lines[i].trim() === '' || lines[i].includes('----')) continue;
        
        // Check if this is a category header
        if (lines[i].includes('|') && 
            (lines[i].toUpperCase().includes('ASSESSMENTS') || 
             lines[i].toUpperCase().includes('PROCEDURES'))) {
          
          // Extract category
          const categoryMatch = lines[i].match(/[A-Za-z\s]+(ASSESSMENTS|PROCEDURES)/i);
          if (categoryMatch) {
            currentCategory = categoryMatch[0].trim();
            htmlTable += `<tr><td colspan="${headers.length}" class="border border-[#dee2e6] bg-gray-100 p-2 font-semibold">${currentCategory}</td></tr>\n`;
            continue;
          }
        }
        
        if (lines[i].includes('|')) {
          htmlTable += '<tr>';
          const cells = lines[i].split('|').map(c => c.trim()).filter(c => c);
          
          cells.forEach((cell, index) => {
            // First column is typically the assessment name, give it a special style
            if (index === 0) {
              htmlTable += `<td class="border border-[#dee2e6] p-2 font-medium">${cell}</td>`;
            } else {
              // If cell contains X, format it specially
              if (cell.includes('X') || cell.includes('x')) {
                htmlTable += `<td class="border border-[#dee2e6] p-2 text-center font-medium text-[#228be6]">${cell}</td>`;
              } else {
                htmlTable += `<td class="border border-[#dee2e6] p-2 text-center">${cell}</td>`;
              }
            }
          });
          htmlTable += '</tr>\n';
        }
      }
    } else {
      // No header found, just process all lines with pipes
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].trim() === '' || lines[i].includes('----')) continue;
        
        if (lines[i].includes('|')) {
          // First line is header
          if (i === 0) {
            htmlTable += '<tr>';
            const cells = lines[i].split('|').map(c => c.trim()).filter(c => c);
            cells.forEach(cell => {
              htmlTable += `<th class="border border-[#dee2e6] bg-[#f8f9fa] p-2 text-left font-medium">${cell}</th>`;
            });
            htmlTable += '</tr>\n</thead>\n<tbody>\n';
          } else {
            htmlTable += '<tr>';
            const cells = lines[i].split('|').map(c => c.trim()).filter(c => c);
            cells.forEach((cell, index) => {
              if (index === 0) {
                htmlTable += `<td class="border border-[#dee2e6] p-2 font-medium">${cell}</td>`;
              } else if (cell.includes('X') || cell.includes('x')) {
                htmlTable += `<td class="border border-[#dee2e6] p-2 text-center font-medium text-[#228be6]">${cell}</td>`;
              } else {
                htmlTable += `<td class="border border-[#dee2e6] p-2 text-center">${cell}</td>`;
              }
            });
            htmlTable += '</tr>\n';
          }
        }
      }
    }
    
    htmlTable += '</tbody>\n</table>';
    return htmlTable;
  } else {
    // If the format is completely different, try to extract meaningful information
    const formattedContent = content.replace(/\n+/g, '\n').trim();
    
    // Check if it's just a series of rows with assessment names and Xs
    // This handles the format "| ORR | X | | X | X | |" without pipes
    if (formattedContent.includes("Assessment") || formattedContent.includes("ORR") || 
        formattedContent.includes("PFS") || formattedContent.includes("OS") || 
        formattedContent.includes("Laboratory")) {
      
      let lines = formattedContent.split('\n');
      let assessmentLines = lines.filter(line => 
        line.includes('X') || 
        line.includes('Assessment') || 
        line.includes('Type') || 
        line.includes('Cycle')
      );
      
      if (assessmentLines.length > 0) {
        // Create a simple two-column table
        let htmlTable = '<table class="min-w-full border-collapse border border-[#dee2e6]">\n<thead>\n<tr>';
        htmlTable += '<th class="border border-[#dee2e6] bg-[#f8f9fa] p-2 text-left font-medium">Assessment</th>';
        htmlTable += '<th class="border border-[#dee2e6] bg-[#f8f9fa] p-2 text-left font-medium">Timepoints</th>';
        htmlTable += '</tr>\n</thead>\n<tbody>\n';
        
        for (const line of assessmentLines) {
          // Skip header lines for this format
          if (line.includes('Assessment Type') || line.includes('Baseline') || line.includes('Cycle')) 
            continue;
          
          const parts = line.split('X').map(p => p.trim());
          const assessmentName = parts[0].replace(/\|/g, '').trim();
          
          if (assessmentName) {
            htmlTable += '<tr>';
            htmlTable += `<td class="border border-[#dee2e6] p-2 font-medium">${assessmentName}</td>`;
            htmlTable += `<td class="border border-[#dee2e6] p-2">Performed as indicated in the protocol</td>`;
            htmlTable += '</tr>\n';
          }
        }
        
        htmlTable += '</tbody>\n</table>';
        return htmlTable;
      }
    }
    
    // Last resort: just wrap in a pre tag
    return `<pre class="p-4 bg-[#f8f9fa] rounded-md border border-[#dee2e6] whitespace-pre-wrap">${content}</pre>`;
  }
};

const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const formatInlineMarkdown = (value: string): string =>
  escapeHtml(value)
    .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.*?)\*/g, "<em>$1</em>");

const renderMarkdownBlock = (content: string): string => {
  const lines = prepareSectionContentForDisplay(content).split("\n");
  const html: string[] = [];
  let listOpen = false;
  let paragraphLines: string[] = [];

  const closeParagraph = () => {
    if (!paragraphLines.length) return;
    html.push(`<p class="mb-3 leading-7 text-[#343a40]">${formatInlineMarkdown(paragraphLines.join(" "))}</p>`);
    paragraphLines = [];
  };

  const closeList = () => {
    if (!listOpen) return;
    html.push("</ul>");
    listOpen = false;
  };

  lines.forEach((rawLine) => {
    const line = rawLine.trim();
    if (!line) {
      closeParagraph();
      closeList();
      return;
    }

    const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
    if (headingMatch) {
      closeParagraph();
      closeList();
      const level = Math.min(Math.max(headingMatch[1].length, 2), 4);
      const className = level === 2
        ? "mt-5 mb-3 border-b border-[#dee2e6] pb-1 text-lg font-semibold text-[#343a40]"
        : level === 3
          ? "mt-4 mb-2 text-base font-semibold text-[#343a40]"
          : "mt-3 mb-2 text-sm font-semibold text-[#343a40]";
      html.push(`<h${level} class="${className}">${formatInlineMarkdown(headingMatch[2])}</h${level}>`);
      return;
    }

    const bulletMatch = rawLine.match(/^\s*(?:[-*•]|\d+[.)])\s+(.+)$/);
    if (bulletMatch) {
      closeParagraph();
      if (!listOpen) {
        html.push('<ul class="mb-3 ml-6 list-disc space-y-1 leading-7 text-[#343a40]">');
        listOpen = true;
      }
      html.push(`<li>${formatInlineMarkdown(bulletMatch[1].trim())}</li>`);
      return;
    }

    closeList();
    paragraphLines.push(line);
  });

  closeParagraph();
  closeList();
  return html.join("");
};

// Helper function to format regular section content with proper styling
const formatSectionContent = (content: string): string => {
  if (content.includes("<table")) {
    return content
      .split(/(<table[\s\S]*?<\/table>)/g)
      .map((part) => part.startsWith("<table") ? part : renderMarkdownBlock(part))
      .join("");
  }

  return renderMarkdownBlock(content);
};

export function GeneratedProtocolViewer({ protocol, onClose }: GeneratedProtocolViewerProps) {
  const { toast } = useToast();
  const [downloading, setDownloading] = useState(false);
  const [showTraceability, setShowTraceability] = useState(false);
  
  // Parse the generated protocol from JSON
  const protocolSections = React.useMemo(() => {
    console.log("GeneratedProtocolViewer: Initializing with protocol ID", protocol.id);
    try {
      try {
        localStorage.removeItem(`protocol-${protocol.id}-generated`);
      } catch {}

      if (protocol.generatedProtocol) {
        console.log("GeneratedProtocolViewer: Using data from protocol object");
        try {
          // Try to parse the current protocol data
          const parsedData = JSON.parse(protocol.generatedProtocol) as GeneratedProtocolSection[];
          
          if (Array.isArray(parsedData) && parsedData.length > 0) {
            return parsedData;
          }
        } catch (parseError) {
          console.error("GeneratedProtocolViewer: Error parsing protocol data:", parseError);
        }
      } else {
        console.log("GeneratedProtocolViewer: No protocol.generatedProtocol data available");
      }
      
      console.log("GeneratedProtocolViewer: No protocol data found anywhere");
      return [];
    } catch (error) {
      console.error("GeneratedProtocolViewer: Error handling protocol data:", error);
      return [];
    }
  }, [protocol.id, protocol.generatedProtocol]);

  const m11AlignedSections = React.useMemo(() => {
    let scheduleSeen = false;
    return (protocolSections as GeneratedProtocolSection[])
      .filter((section) => {
        if (!isScheduleGeneratedSection(section)) return true;
        if (scheduleSeen) return false;
        scheduleSeen = true;
        return true;
      })
      .map((section) => ({
        ...section,
        title: getM11Title(section),
        content: stripEmbeddedScheduleBlocks(section.content, section),
        traceability: {
          ...section.traceability,
          m11Template: section.traceability?.m11Template || M11_TEMPLATE_VERSION,
        },
      }));
  }, [protocolSections]);

  const renderTraceabilityLegend = () => (
    <div className="rounded-md border border-[#dee2e6] bg-white p-3">
      <div className="mb-2 flex items-center gap-2 text-sm font-medium text-[#343a40]">
        <Info className="h-4 w-4 text-[#1c7ed6]" />
        Traceability color key
      </div>
      <div className="flex flex-wrap gap-3 text-xs text-[#495057]">
        {(["source", "supporting_source", "ai_improved", "ai_generated", "boilerplate", "placeholder"] as ProvenanceOrigin[]).map((origin) => (
          <span key={origin} className="inline-flex items-center gap-1.5">
            <span className={`h-2.5 w-2.5 rounded-full ${originStyles[origin].dot}`} />
            {originStyles[origin].label}
          </span>
        ))}
      </div>
      <p className="mt-2 text-xs text-[#6c757d]">
        Clean exports remain protocol-ready. Use this view for review, traceability, and understanding why content was copied, improved, added, or left as a placeholder.
      </p>
    </div>
  );

  const renderM11Header = () => (
    <div className="rounded-md border border-[#d0ebff] bg-[#f8fbff] p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-[#1c7ed6]">M11-aligned protocol structure</p>
          <p className="mt-1 text-sm text-[#495057]">
            This document is ordered against {M11_TEMPLATE_VERSION}. Section numbering is normalized in the preview even when older generated section titles are stored.
          </p>
        </div>
        <Badge variant="outline" className="border-[#91a7ff] bg-white text-[#364fc7]">
          CeSHarP structure
        </Badge>
      </div>
    </div>
  );

  const renderAnnotatedContent = (section: GeneratedProtocolSection) => {
    if (section.title.includes("Schedule of Activities") || section.content.includes("<table")) {
      const sectionProvenance = inferBlockProvenance(section, section.content, protocol);
      const style = originStyles[sectionProvenance.origin];
      return (
        <div className={`rounded-md border border-[#dee2e6] p-3 ${style.className}`}>
          <div className="mb-3 flex items-center gap-2">
            <Badge variant="outline" className="bg-white">
              {style.label}
            </Badge>
            <ProvenanceInfo
              item={{
                origin: sectionProvenance.origin,
                sourceName: sectionProvenance.sourceName,
                sourceText: sectionProvenance.sourceExcerpt,
                reason: sectionProvenance.why,
                confidence: sectionProvenance.confidence,
              }}
              section={section.title}
            />
          </div>
          <div className="overflow-x-auto">
            <div
              className="prose max-w-none schedule-table"
              dangerouslySetInnerHTML={{
                __html: section.title.includes("Schedule of Activities")
                  ? formatScheduleTable(section.content)
                  : formatSectionContent(section.content),
              }}
            />
          </div>
        </div>
      );
    }

    const blocks = splitContentBlocks(section.content);
    return (
      <div className="space-y-3">
        {blocks.map((block, index) => {
          const blockProvenance = inferBlockProvenance(section, block, protocol);
          const style = originStyles[blockProvenance.origin];
          const cleanText = stripMarkdown(block);
          const isHeading = isStructuralHeading(block);
          const headingLevel = getHeadingLevel(block);

          if (isHeading) {
            const HeadingTag = (`h${headingLevel}` as React.ElementType);
            const headingClass =
              headingLevel <= 2
                ? "mt-5 border-b border-[#dee2e6] pb-2 text-lg font-semibold text-[#343a40]"
                : "mt-4 text-base font-semibold text-[#343a40]";

            return (
              <div key={`${section.id}-${index}`} className="flex items-center gap-2">
                <HeadingTag className={headingClass}>{cleanText}</HeadingTag>
                <ProvenanceInfo
                  item={{
                    origin: blockProvenance.origin,
                    sourceName: blockProvenance.sourceName,
                    sourceText: blockProvenance.sourceExcerpt,
                    reason: blockProvenance.why,
                    confidence: blockProvenance.confidence,
                  }}
                  section={section.title}
                  className="mt-4"
                />
              </div>
            );
          }

          return (
            <div key={`${section.id}-${index}`} className={`rounded-md border border-[#dee2e6] p-3 ${style.className}`}>
              <div className="mb-2 flex items-center gap-2">
                <Badge variant="outline" className="bg-white">
                  {style.label}
                </Badge>
                <ProvenanceInfo
                  item={{
                    origin: blockProvenance.origin,
                    sourceName: blockProvenance.sourceName,
                    sourceText: blockProvenance.sourceExcerpt,
                    reason: blockProvenance.why,
                    confidence: blockProvenance.confidence,
                  }}
                  section={section.title}
                />
              </div>
              <div
                className="prose prose-sm max-w-none"
                dangerouslySetInnerHTML={{ __html: formatSectionContent(block) }}
              />
            </div>
          );
        })}
      </div>
    );
  };
  
  // Download as DOCX
  const downloadProtocol = async () => {
    if (!protocol.generatedProtocol) {
      toast({
        title: "No Protocol Generated",
        description: "There is no protocol to download.",
        variant: "destructive"
      });
      return;
    }
    
    setDownloading(true);
    
    try {
      // Create a file name from the protocol title
      const fileName = `${protocol.title.replace(/\s+/g, '_').toLowerCase()}_protocol.docx`;
      
      // Call API to generate DOCX
      const response = await fetch('/api/generate-document', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          protocol,
          format: 'docx',
          sections: m11AlignedSections
        }),
      });
      
      if (!response.ok) {
        throw new Error('Failed to generate document');
      }
      
      // Get the blob from the response
      const blob = await response.blob();
      
      // Create a download link
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.style.display = 'none';
      a.href = url;
      a.download = fileName;
      
      // Trigger download
      document.body.appendChild(a);
      a.click();
      
      // Clean up
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      
      toast({
        title: "Protocol Downloaded",
        description: `Successfully downloaded protocol as ${fileName}`,
        variant: "default"
      });
    } catch (error) {
      console.error("Error downloading protocol:", error);
      toast({
        title: "Download Failed",
        description: "There was an error generating the DOCX file.",
        variant: "destructive"
      });
    } finally {
      setDownloading(false);
    }
  };
  
  // If there are no sections, show an error state
  if (protocolSections.length === 0) {
    return (
      <Card className="mb-8">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertCircle className="h-5 w-5 text-red-500" />
            No Protocol Generated
          </CardTitle>
          <CardDescription>
            There was an error parsing the generated protocol. Please try generating it again.
          </CardDescription>
        </CardHeader>
        <CardFooter>
          <Button onClick={onClose} variant="outline">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Go Back
          </Button>
        </CardFooter>
      </Card>
    );
  }
  
  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-2">
          <FileCheck className="h-6 w-6 text-blue-500" />
          <h1 className="text-2xl font-bold">Generated Protocol</h1>
          <AIGeneratedBadge />
        </div>
        
        <div className="flex items-center gap-2">
          <Button onClick={onClose} variant="outline">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Editor
          </Button>
          
          <Button
            onClick={() => setShowTraceability((current) => !current)}
            variant={showTraceability ? "default" : "outline"}
            className={showTraceability ? "bg-[#1c7ed6] hover:bg-[#1971c2] text-white" : ""}
          >
            <Eye className="h-4 w-4 mr-2" />
            {showTraceability ? "Clean View" : "Traceability View"}
          </Button>

          <Button 
            onClick={downloadProtocol}
            disabled={downloading}
            className="bg-blue-500 hover:bg-blue-600 text-white"
          >
            <Download className="h-4 w-4 mr-2" />
            Download as DOCX
          </Button>
        </div>
      </div>
      
      <Card className="overflow-hidden">
        <CardHeader className="bg-gray-50 border-b">
          <CardTitle>{protocol.title}</CardTitle>
          <CardDescription>
            Generated on {new Date().toLocaleDateString()} • {m11AlignedSections.length} sections • {M11_TEMPLATE_VERSION}
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <Tabs defaultValue="document" className="w-full">
            <div className="px-6 pt-6 border-b">
              <TabsList>
                <TabsTrigger value="document">Complete Document</TabsTrigger>
                <TabsTrigger value="sections">By Section</TabsTrigger>
              </TabsList>
            </div>
            
            <TabsContent value="document" className="p-6 pt-8 m-0">
              <div className="mb-6 space-y-4">
                {renderM11Header()}
                {showTraceability && renderTraceabilityLegend()}
              </div>

              {m11AlignedSections.map((section) => (
                <div key={section.id} className="mb-8">
                  <h2 className="text-xl font-bold mb-4 text-[#343a40] pb-2 border-b border-[#dee2e6]">{section.title}</h2>
                  {showTraceability ? (
                    renderAnnotatedContent(section)
                  ) : section.title.includes("Schedule of Activities") ? (
                    <div className="overflow-x-auto">
                      <div 
                        className="prose max-w-none schedule-table"
                        dangerouslySetInnerHTML={{ 
                          __html: formatScheduleTable(section.content)
                        }}
                      />
                    </div>
                  ) : (
                    <div 
                      className="prose max-w-none"
                      dangerouslySetInnerHTML={{ 
                        __html: formatSectionContent(section.content)
                      }}
                    />
                  )}
                </div>
              ))}
            </TabsContent>
            
            <TabsContent value="sections" className="m-0">
              <div className="border-b">
                <div className="px-6 py-3 flex items-center justify-between bg-gray-50">
                  <span className="font-medium">Protocol Sections</span>
                  <span className="text-gray-500 text-sm">{m11AlignedSections.length} sections</span>
                </div>
              </div>
              
              <Tabs 
                defaultValue={m11AlignedSections[0]?.id} 
                className="flex h-[calc(100vh-300px)]"
              >
                <TabsList className="h-full flex-col items-stretch bg-gray-50 rounded-none border-r w-64 space-y-0 p-0">
                  {m11AlignedSections.map((section) => (
                    <TabsTrigger 
                      key={section.id}
                      value={section.id}
                      className="rounded-none justify-start text-left px-4 h-auto py-3 data-[state=active]:bg-white data-[state=active]:shadow-none border-b last:border-b-0"
                    >
                      {section.title}
                    </TabsTrigger>
                  ))}
                </TabsList>
                
                {m11AlignedSections.map((section) => (
                  <TabsContent 
                    key={section.id}
                    value={section.id}
                    className="p-6 m-0 flex-1 overflow-auto"
                  >
                    <h2 className="text-xl font-semibold mb-4 flex items-center">
                      {section.title}
                      <AIGeneratedBadge className="ml-2" />
                    </h2>
                    {showTraceability ? (
                      <div className="space-y-4">
                        {renderTraceabilityLegend()}
                        {renderAnnotatedContent(section)}
                      </div>
                    ) : (
                      <div 
                        className="prose max-w-none"
                        dangerouslySetInnerHTML={{ 
                          __html: section.title.includes("Schedule of Activities") 
                            ? formatScheduleTable(section.content)
                            : formatSectionContent(section.content)
                        }}
                      />
                    )}
                  </TabsContent>
                ))}
              </Tabs>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
