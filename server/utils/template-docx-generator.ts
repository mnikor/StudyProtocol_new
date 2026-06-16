import fs from "fs";
import path from "path";
import PizZip from "pizzip";
import { Protocol } from "@shared/schema";

type ProtocolSection = { id: string; title: string };
type ContentOrigin = "source" | "boilerplate" | "ai" | "placeholder" | "improved" | "generated" | "manual";

type SourceTableCell = {
  text?: string;
  colSpan?: number;
  rowSpan?: number;
  isHeader?: boolean;
};

type SourceSoATable = {
  id?: string;
  title?: string;
  source?: string;
  sourceFormat?: string;
  exactSourceAvailable?: boolean;
  preservationNote?: string;
  rawOoxml?: string;
  pageLayout?: SourcePageLayout;
  headers?: string[];
  rows?: string[][];
  cells?: SourceTableCell[][];
};

type SourcePageLayout = {
  orientation?: "portrait" | "landscape";
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
  source?: string;
};

const TEMPLATE_PATH = path.join(process.cwd(), "server", "templates", "clinical-protocol-template.docx");

const SECTION_ORDER = [
  "title",
  "synopsis",
  "trial_schema",
  "schedule",
  "schedule_of_activities",
  "introduction",
  "objectives",
  "design",
  "population",
  "criteria",
  "treatments",
  "discontinuation",
  "assessments",
  "safety",
  "safetyDrugHandling",
  "data_management",
  "statistics",
  "monitoring",
  "ethical",
  "administrative",
  "exposure_assessment",
  "outcome_assessment",
  "data_collection",
  "follow_up",
  "bias_management",
  "conclusion",
];

const M11_TITLES: Record<string, string> = {
  title: "Title Page and Protocol Identifiers",
  synopsis: "1 Protocol Summary",
  trial_schema: "1.2 Trial Schema",
  schedule: "1.3 Schedule of Activities",
  schedule_of_activities: "1.3 Schedule of Activities",
  introduction: "2 Introduction",
  objectives: "3 Trial Objectives and Associated Estimands",
  design: "4 Trial Design",
  population: "5 Trial Population",
  criteria: "5.1 Eligibility Criteria",
  treatments: "6 Trial Intervention and Concomitant Therapy",
  discontinuation: "7 Trial Intervention and Participant Discontinuation",
  assessments: "8 Trial Assessments and Procedures",
  safety: "9 Safety Reporting and Product Complaints",
  safetyDrugHandling: "9.1 Safety and Drug Handling",
  statistics: "10 Statistical Considerations",
  ethical: "11 Trial Oversight and Other General Considerations",
  administrative: "12 Administrative and Reference Appendices",
};

function sectionProperties(orientation: "portrait" | "landscape" = "portrait"): string {
  const isLandscape = orientation === "landscape";
  const width = isLandscape ? 15840 : 12240;
  const height = isLandscape ? 12240 : 15840;
  const orient = isLandscape ? ` w:orient="landscape"` : "";
  return [
    `<w:sectPr>`,
    `<w:type w:val="nextPage"/>`,
    `<w:pgSz w:w="${width}" w:h="${height}"${orient} w:code="1"/>`,
    `<w:pgMar w:top="1440" w:right="1152" w:bottom="1440" w:left="1152" w:header="547" w:footer="720" w:gutter="0"/>`,
    `</w:sectPr>`,
  ].join("");
}

function normalizeOrientation(value: any): "portrait" | "landscape" {
  return value === "landscape" ? "landscape" : "portrait";
}

function escapeXml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function sanitizeContent(content: string): string {
  return String(content || "")
    .replace(/\r\n/g, "\n")
    .replace(/^\s*```(?:markdown|md)?\s*/i, "")
    .replace(/```\s*$/i, "")
    .replace(/^\s*```(?:markdown|md)?\s*$/gim, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/\*(.*?)\*/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function stripHeadingSyntax(line: string): string {
  return line.replace(/^#{1,6}\s+/, "").replace(/^\d+(\.\d+)*\s+/, "").trim();
}

function paragraphStyleFor(style: string): string {
  const suppressStyleNumbering = /^Heading[1-6]$/.test(style) ? `<w:numPr><w:numId w:val="0"/></w:numPr>` : "";
  return `<w:pPr><w:pStyle w:val="${style}"/>${suppressStyleNumbering}</w:pPr>`;
}

function runStyleFor(origin: ContentOrigin): string {
  if (origin === "boilerplate") return `<w:rPr><w:rStyle w:val="PlaceholderText"/><w:color w:val="808080"/></w:rPr>`;
  if (origin === "placeholder") return `<w:rPr><w:rStyle w:val="CPTVariable"/></w:rPr>`;
  return "";
}

function textRun(text: string, origin: ContentOrigin = "source"): string {
  const parts = String(text ?? "").replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  const runText = parts.map((part, index) => {
    const preserve = /^\s|\s$/.test(part) ? ` xml:space="preserve"` : "";
    return `${index > 0 ? "<w:br/>" : ""}<w:t${preserve}>${escapeXml(part)}</w:t>`;
  }).join("");
  return `<w:r>${runStyleFor(origin)}${runText}</w:r>`;
}

function textRunsWithPlaceholders(text: string, origin: ContentOrigin = "source"): string {
  const value = String(text || "");
  const placeholderPattern = /(\[[A-Z0-9][A-Z0-9 _/-]{2,}\]|\[[^\]]*(?:TO BE|PLACEHOLDER|TBD|TBC|INSERT|ADD|ASSIGNED)[^\]]*\])/gi;
  let cursor = 0;
  let xml = "";
  for (const match of value.matchAll(placeholderPattern)) {
    const matchText = match[0];
    const index = match.index ?? 0;
    if (index > cursor) xml += textRun(value.slice(cursor, index), origin);
    xml += textRun(matchText, "placeholder");
    cursor = index + matchText.length;
  }
  if (cursor < value.length) xml += textRun(value.slice(cursor), origin);
  return xml || textRun(value, origin);
}

function pageBreakParagraph(): string {
  return `<w:p><w:r><w:br w:type="page"/></w:r></w:p>`;
}

function sectionBreakParagraph(orientation: "portrait" | "landscape"): string {
  return `<w:p><w:pPr>${sectionProperties(orientation)}</w:pPr></w:p>`;
}

function paragraph(text: string, style = "BodyText12", origin: ContentOrigin = "source"): string {
  if (!text.trim()) return `<w:p/>`;
  return `<w:p>${paragraphStyleFor(style)}${textRunsWithPlaceholders(text, origin)}</w:p>`;
}

function heading(text: string, level: 1 | 2 | 3 | 4 = 1): string {
  return paragraph(text, `Heading${level}`);
}

function bullet(text: string, level: number, origin: ContentOrigin): string {
  const indent = 720 + level * 360;
  const hanging = 240;
  return [
    `<w:p>`,
    `<w:pPr><w:pStyle w:val="Bullet12-1"/><w:ind w:left="${indent}" w:hanging="${hanging}"/></w:pPr>`,
    textRunsWithPlaceholders(text, origin),
    `</w:p>`,
  ].join("");
}

function tableParagraph(text: string, origin: ContentOrigin = "source", bold = false, align: "left" | "center" = "left"): string {
  const justification = align === "center" ? `<w:jc w:val="center"/>` : "";
  const rPr = bold ? `<w:rPr><w:b/></w:rPr>` : runStyleFor(origin);
  const parts = String(text ?? "").replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  const runText = parts.map((part, index) => {
    const preserve = /^\s|\s$/.test(part) ? ` xml:space="preserve"` : "";
    return `${index > 0 ? "<w:br/>" : ""}<w:t${preserve}>${escapeXml(part)}</w:t>`;
  }).join("");
  return `<w:p><w:pPr><w:pStyle w:val="TableText"/>${justification}</w:pPr><w:r>${rPr}${runText}</w:r></w:p>`;
}

function normalizeOrigin(value: any): ContentOrigin {
  const raw = String(value || "").trim().toLowerCase();
  if (["use_as_is", "use as is", "as_is", "as-is", "source", "source_text", "preserve", "preserved", "extracted"].includes(raw)) return "source";
  if (["improve", "improved", "enhance", "enhanced", "augment", "augmented", "rewritten"].includes(raw)) return "improved";
  if (["add", "added", "generate", "generated", "ai_generated", "new"].includes(raw)) return "generated";
  if (["boilerplate", "template"].includes(raw)) return "boilerplate";
  if (["placeholder", "missing"].includes(raw)) return "placeholder";
  return "manual";
}

function tableCell(
  text: string,
  width: number,
  options: {
    origin?: ContentOrigin;
    header?: boolean;
    category?: boolean;
    align?: "left" | "center";
    gridSpan?: number;
  } = {}
): string {
  const { origin = "source", header = false, category = false, align = "left", gridSpan } = options;
  const fill = header ? "EDEFF2" : category ? "F5F6F8" : origin === "boilerplate" ? "F2F2F2" : origin === "placeholder" ? "EAF2FF" : "FFFFFF";
  const gridSpanXml = gridSpan && gridSpan > 1 ? `<w:gridSpan w:val="${gridSpan}"/>` : "";
  const tcPr = [
    `<w:tcPr>`,
    `<w:tcW w:w="${width}" w:type="dxa"/>`,
    gridSpanXml,
    `<w:vAlign w:val="center"/>`,
    `<w:shd w:val="clear" w:color="auto" w:fill="${fill}"/>`,
    `<w:tcMar><w:top w:w="80" w:type="dxa"/><w:left w:w="100" w:type="dxa"/><w:bottom w:w="80" w:type="dxa"/><w:right w:w="100" w:type="dxa"/></w:tcMar>`,
    `</w:tcPr>`,
  ].join("");
  return `<w:tc>${tcPr}${tableParagraph(text, origin, header || category, align)}</w:tc>`;
}

function tableXml(rows: Array<Array<{ text: string; origin?: ContentOrigin; header?: boolean; category?: boolean; align?: "left" | "center"; colSpan?: number }>>, columnWidths: number[]): string {
  if (!rows.length || !columnWidths.length) return "";
  const tableWidth = columnWidths.reduce((sum, width) => sum + width, 0);
  const grid = columnWidths.map((width) => `<w:gridCol w:w="${width}"/>`).join("");
  const rowXml = rows.map((row, rowIndex) => {
    let columnIndex = 0;
    const cells = row.map((cell) => {
      const span = Math.max(1, Number(cell.colSpan || 1));
      const width = columnWidths.slice(columnIndex, columnIndex + span).reduce((sum, value) => sum + value, 0) || columnWidths[columnIndex] || 900;
      columnIndex += span;
      return tableCell(cell.text, width, {
        origin: cell.origin,
        header: cell.header ?? rowIndex === 0,
        category: cell.category,
        align: cell.align,
        gridSpan: span,
      });
    }).join("");
    const headerRepeat = rowIndex === 0 ? `<w:trPr><w:tblHeader/></w:trPr>` : "";
    return `<w:tr>${headerRepeat}${cells}</w:tr>`;
  }).join("");

  return [
    `<w:tbl>`,
    `<w:tblPr><w:tblStyle w:val="TableGrid"/><w:tblW w:w="${tableWidth}" w:type="dxa"/><w:tblLayout w:type="fixed"/><w:jc w:val="left"/></w:tblPr>`,
    `<w:tblGrid>${grid}</w:tblGrid>`,
    rowXml,
    `</w:tbl>`,
  ].join("");
}

function parseArray(value: any): any[] {
  const parsed = parseMaybeJson(value);
  return Array.isArray(parsed) ? parsed : [];
}

function parseObject(value: any): Record<string, any> {
  const parsed = parseMaybeJson(value);
  return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
}

function compactText(value: any): string {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function compactTableCellText(value: any): string {
  const text = String(value ?? "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n")
    .map((line) => compactText(line))
    .filter(Boolean)
    .join("\n");

  if (text.includes("\n")) return text;

  return text
    .replace(/^(Screening)\s+((?:≤|<=)\s*\d+\s*d)$/i, "$1\n$2")
    .replace(/^(Maintenance)\s+(Q\d+W)$/i, "$1\n$2")
    .replace(/^(Tumor Assess\.?)\s+(Q[0-9A-Z/]+)$/i, "$1\n$2")
    .replace(/^(SFU)\s+(.+)$/i, "$1\n$2")
    .replace(/^(LTFU)\s+(.+)$/i, "$1\n$2");
}

function displaySourceScheduleTableTitle(table: SourceSoATable, index: number, total: number): string {
  const title = compactText(table.title || "");
  if (!title || /^extracted table \d+$/i.test(title) || /^table-\d+$/i.test(title)) {
    return total > 1 ? `Source Schedule Table ${index + 1}` : "";
  }
  if (/^schedule of activities table \d+$/i.test(title)) {
    return total > 1 ? `Source Schedule Table ${index + 1}` : "";
  }
  return title;
}

function hasRawDocxTable(table: SourceSoATable): boolean {
  return typeof table.rawOoxml === "string" && /^<w:tbl[\s\S]*<\/w:tbl>\s*$/i.test(table.rawOoxml.trim());
}

function sourceTableLayout(table: SourceSoATable): "portrait" | "landscape" {
  const layout = parseObject(table.pageLayout);
  if (layout.orientation === "landscape") return "landscape";
  if (layout.orientation === "portrait") return "portrait";

  const columnCount = Array.isArray(table.cells) && table.cells.length > 0
    ? Math.max(...table.cells.map((row) => row.reduce((sum, cell) => sum + Math.max(1, Number(cell?.colSpan || 1)), 0)))
    : Math.max(Array.isArray(table.headers) ? table.headers.length : 0, ...(Array.isArray(table.rows) ? table.rows.map((row) => row.length) : [0]));

  return columnCount >= 7 ? "landscape" : "portrait";
}

function scheduleSectionOrientation(protocol: any): "portrait" | "landscape" {
  const sourceTables = parseArray(protocol?.soaSourceTables).filter((table) => table && typeof table === "object") as SourceSoATable[];
  if (sourceTables.length > 0) return sourceTableLayout(sourceTables[sourceTables.length - 1]);

  const tableHeaders = parseMaybeJson(protocol?.tableHeaders);
  if (Array.isArray(tableHeaders) && tableHeaders.length >= 7) return "landscape";

  const tableData = parseMaybeJson(protocol?.tableData);
  if (tableData && typeof tableData === "object" && !Array.isArray(tableData)) {
    if (Object.keys(tableData).length >= 7) return "landscape";
  }

  return "portrait";
}

function sourceTablesToXml(tables: SourceSoATable[]): string {
  const total = tables.length;
  const parts: string[] = [];
  tables.forEach((table, index) => {
    parts.push(sourceTableToXml(table, index, total));
    const nextTable = tables[index + 1];
    if (nextTable && sourceTableLayout(table) !== sourceTableLayout(nextTable)) {
      parts.push(sectionBreakParagraph(sourceTableLayout(table)));
    }
  });
  return parts.join("");
}

function sameText(a: string, b: string): boolean {
  const left = compactText(a).toLowerCase();
  const right = compactText(b).toLowerCase();
  if (!left || !right) return false;
  return left.includes(right) || right.includes(left);
}

function removeExactBoilerplateFromContent(content: string, boilerplate: string): string {
  if (!content || !boilerplate) return content;
  if (content.includes(boilerplate)) {
    return content.replace(boilerplate, "").replace(/\n{3,}/g, "\n\n").trim();
  }

  const strippedBoilerplate = sanitizeContent(boilerplate);
  if (strippedBoilerplate && content.includes(strippedBoilerplate)) {
    return content.replace(strippedBoilerplate, "").replace(/\n{3,}/g, "\n\n").trim();
  }

  if (sameText(content, boilerplate)) return "";
  return content;
}

function isFollowUpHeader(header: string): boolean {
  return /follow[- ]?up|long[- ]?term|survival|end of treatment/i.test(header);
}

function splitScheduleHeaderIndexes(headers: string[], layout: string, customSplitIndex?: number): Array<{ title: string; indexes: number[] }> {
  if (!headers.length) return [];
  const dense = headers.length >= 8;
  const followUpIndex = headers.findIndex((header, index) => index >= 2 && isFollowUpHeader(header));
  const autoSplitIndex = followUpIndex >= 2 && headers.length - followUpIndex >= 2 ? followUpIndex : Math.ceil(headers.length / 2);
  const splitIndex = layout === "split" && customSplitIndex && customSplitIndex >= 2 && headers.length - customSplitIndex >= 2
    ? customSplitIndex
    : autoSplitIndex;
  const shouldSplit = layout === "split" || (layout !== "single" && dense && splitIndex >= 2 && headers.length - splitIndex >= 2);

  if (!shouldSplit) return [{ title: "Schedule of Activities", indexes: headers.map((_, index) => index) }];

  return [
    { title: isFollowUpHeader(headers[splitIndex] || "") ? "Core schedule" : "Earlier visit schedule", indexes: headers.slice(0, splitIndex).map((_, index) => index) },
    { title: isFollowUpHeader(headers[splitIndex] || "") ? "Follow-up schedule" : "Later visit schedule", indexes: headers.slice(splitIndex).map((_, index) => index + splitIndex) },
  ];
}

function scheduleColumnWidths(visitCount: number): number[] {
  const tableWidth = 13536;
  const assessmentWidth = visitCount >= 7 ? 2100 : 2500;
  const visitWidth = Math.floor((tableWidth - assessmentWidth) / Math.max(visitCount, 1));
  const widths = [assessmentWidth, ...Array.from({ length: visitCount }, () => visitWidth)];
  widths[widths.length - 1] += tableWidth - widths.reduce((sum, width) => sum + width, 0);
  return widths;
}

function scheduleFromGrid(protocol: any): string {
  const headers = parseArray(protocol?.tableHeaders).map((header) => compactText(header)).filter(Boolean);
  const tableData = parseObject(protocol?.tableData);
  if (!headers.length || !Object.keys(tableData).length) return "";

  const layout = String(protocol?.soaTableLayout || "auto");
  const customSplitIndex = Number(protocol?.soaSplitAfterIndex || 0);
  const groups = splitScheduleHeaderIndexes(headers, layout, customSplitIndex);
  const xml: string[] = [];

  xml.push(paragraph(
    "The Schedule of Activities summarizes planned trial visits, procedures, and assessments. Visit windows and operational details should be confirmed against the approved protocol, pharmacy manual, laboratory manual, imaging charter, and other trial-specific source documents.",
    "BodyText12"
  ));

  groups.forEach((group, groupIndex) => {
    if (groups.length > 1) xml.push(paragraph(group.title, "SubheadingBold12"));
    const rows: Array<Array<{ text: string; origin?: ContentOrigin; header?: boolean; category?: boolean; align?: "left" | "center"; colSpan?: number }>> = [
      [
        { text: "Assessment", header: true },
        ...group.indexes.map((index) => ({
          text: headers[index],
          header: true,
          origin: normalizeOrigin(parseArray(protocol?.tableHeaderOrigins || protocol?.soaProvenance?.headerOrigins)[index]),
          align: "center" as const,
        })),
      ],
    ];

    Object.entries(tableData).forEach(([category, assessments]) => {
      rows.push([{ text: category, category: true, colSpan: group.indexes.length + 1 }]);
      if (!Array.isArray(assessments)) return;
      assessments.forEach((assessment: any) => {
        const values = Array.isArray(assessment?.values) ? assessment.values : [];
        const rowOrigin = normalizeOrigin(assessment?.rowOrigin || assessment?.origin || assessment?.sourceUse || assessment?.classification);
        rows.push([
          { text: compactText(assessment?.assessment || assessment?.name || ""), origin: rowOrigin },
          ...group.indexes.map((index) => ({
            text: compactText(values[index] || ""),
            origin: normalizeOrigin((assessment?.cellOrigins || assessment?.valueOrigins || [])[index]) || rowOrigin,
            align: "center" as const,
          })),
        ]);
      });
    });

    xml.push(tableXml(rows, scheduleColumnWidths(group.indexes.length)));
    if (groupIndex < groups.length - 1) xml.push(paragraph("", "BodyText12"));
  });

  const provenance = parseObject(protocol?.soaProvenance || protocol?.scheduleProvenance);
  const note = compactText(provenance?.explanation || provenance?.summary || "");
  if (note) xml.push(paragraph(`Source note: ${note}`, "BodyText12"));

  return xml.join("");
}

function sourceTableToXml(table: SourceSoATable, index: number, total = 1): string {
  const title = displaySourceScheduleTableTitle(table, index, total);
  if (hasRawDocxTable(table)) {
    return `${title ? paragraph(title, "SubheadingBold12") : ""}${table.rawOoxml!.trim()}`;
  }

  const rows: Array<Array<{ text: string; header?: boolean; colSpan?: number; align?: "left" | "center"; origin?: ContentOrigin }>> = [];

  if (Array.isArray(table.cells) && table.cells.length > 0) {
    const maxColumns = Math.max(...table.cells.map((row) => row.reduce((sum, cell) => sum + Math.max(1, Number(cell?.colSpan || 1)), 0)));
    table.cells.forEach((row, rowIndex) => {
      rows.push(row.map((cell) => ({
        text: compactTableCellText(cell?.text || ""),
        header: Boolean(cell?.isHeader || rowIndex === 0),
        colSpan: Math.max(1, Number(cell?.colSpan || 1)),
        align: rowIndex === 0 ? "center" : "left",
        origin: "source",
      })));
    });
    const tableWidth = maxColumns >= 8 ? 13536 : 10080;
    const evenWidth = Math.max(760, Math.floor(tableWidth / Math.max(maxColumns, 1)));
    return `${title ? paragraph(title, "SubheadingBold12") : ""}${tableXml(rows, Array.from({ length: maxColumns }, () => evenWidth))}`;
  }

  const headers = Array.isArray(table.headers) ? table.headers.map(compactTableCellText) : [];
  if (headers.length) {
    rows.push(headers.map((header) => ({ text: header, header: true, align: "center" as const, origin: "source" as const })));
  }
  (Array.isArray(table.rows) ? table.rows : []).forEach((row) => {
    rows.push((Array.isArray(row) ? row : []).map((cell, cellIndex) => ({
      text: compactTableCellText(cell),
      origin: "source" as const,
      align: cellIndex === 0 ? "left" as const : "center" as const,
    })));
  });
  const columnCount = Math.max(headers.length, ...rows.map((row) => row.length), 2);
  const widths = scheduleColumnWidths(Math.max(columnCount - 1, 1));
  return `${title ? paragraph(title, "SubheadingBold12") : ""}${tableXml(rows, widths)}`;
}

function scheduleToXml(protocol: any): string {
  const sourceTables = parseArray(protocol?.soaSourceTables).filter((table) => table && typeof table === "object");
  const hasExactSourceTables = sourceTables.some((table) =>
    table?.exactSourceAvailable === true || table?.sourceFormat === "docx_table"
  );
  const provenance = parseObject(protocol?.soaProvenance || protocol?.scheduleProvenance);
  const preserveSourceTables = hasExactSourceTables || provenance?.generationMode === "preserve";
  if (preserveSourceTables && sourceTables.length) {
    return [
      ...(hasExactSourceTables ? [] : [paragraph("The Schedule of Activities below is reproduced from the uploaded source table data.", "BodyText12")]),
      sourceTablesToXml(sourceTables),
    ].join("");
  }

  const grid = scheduleFromGrid(protocol);
  if (grid) return grid;

  if (!sourceTables.length) return "";

  return [
    paragraph("The Schedule of Activities below is reproduced from the uploaded source table data.", "BodyText12"),
    sourceTablesToXml(sourceTables),
  ].join("");
}

function parseInlineMarkdownTable(lines: string[], startIndex: number, origin: ContentOrigin): { xml: string; nextIndex: number } {
  const rows: string[][] = [];
  let index = startIndex;

  while (index < lines.length && /^\s*\|.*\|\s*$/.test(lines[index])) {
    const raw = lines[index].trim();
    if (!/^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(raw)) {
      rows.push(raw.replace(/^\|/, "").replace(/\|$/, "").split("|").map((cell) => cell.trim()));
    }
    index += 1;
  }

  if (rows.length === 0) return { xml: "", nextIndex: index };
  const maxCells = Math.max(...rows.map((row) => row.length));
  const grid = Array.from({ length: maxCells }, () => `<w:gridCol w:w="${Math.floor(9000 / Math.max(maxCells, 1))}"/>`).join("");
  const rowXml = rows.map((row, rowIndex) => {
    const cells = Array.from({ length: maxCells }, (_, cellIndex) => row[cellIndex] || "");
    return `<w:tr>${cells.map((cell) => {
      const shade = rowIndex === 0 ? `<w:shd w:val="clear" w:color="auto" w:fill="E0E0E0"/>` : "";
      return `<w:tc><w:tcPr><w:tcW w:w="${Math.floor(9000 / Math.max(maxCells, 1))}" w:type="dxa"/>${shade}</w:tcPr>${paragraph(cell, "TableText", origin)}</w:tc>`;
    }).join("")}</w:tr>`;
  }).join("");

  return {
    xml: `<w:tbl><w:tblPr><w:tblStyle w:val="TableGrid"/><w:tblW w:w="0" w:type="auto"/></w:tblPr><w:tblGrid>${grid}</w:tblGrid>${rowXml}</w:tbl>`,
    nextIndex: index,
  };
}

function contentToXml(content: string, origin: ContentOrigin, sectionTitle: string): string {
  const lines = sanitizeContent(content).split("\n");
  const xml: string[] = [];
  let index = 0;
  const normalizedSection = stripHeadingSyntax(sectionTitle).toLowerCase();

  while (index < lines.length) {
    const rawLine = lines[index] || "";
    const line = rawLine.trim();

    if (!line) {
      index += 1;
      continue;
    }

    if (/^\s*\|.*\|\s*$/.test(rawLine)) {
      const table = parseInlineMarkdownTable(lines, index, origin);
      xml.push(table.xml);
      index = table.nextIndex;
      continue;
    }

    if (/^#{1,6}\s+/.test(line)) {
      const text = stripHeadingSyntax(line);
      if (text.toLowerCase() !== normalizedSection) {
        const hashCount = line.match(/^#+/)?.[0].length || 2;
        xml.push(heading(text, hashCount <= 2 ? 2 : hashCount === 3 ? 3 : 4));
      }
      index += 1;
      continue;
    }

    const bulletMatch = rawLine.match(/^(\s*)([*\-•]|\d+[.)])\s+(.*)$/);
    if (bulletMatch) {
      xml.push(bullet(bulletMatch[3].trim(), Math.floor(bulletMatch[1].length / 2), origin));
      index += 1;
      continue;
    }

    xml.push(paragraph(line, "BodyText12", origin));
    index += 1;
  }

  return xml.join("");
}

function stripEmbeddedScheduleBlocks(content: string, sectionId: string): string {
  if (!content || sectionId === "schedule" || sectionId === "schedule_of_activities") return content;

  let cleaned = String(content);
  cleaned = cleaned.replace(
    /\n{0,2}#{0,6}\s*Schedule of Activities\s*\n+\|[\s\S]*?(?=\n{2,}(?:#{1,6}\s+|\d+(?:\.\d+)*\s+[A-Z][^\n]+)|\n{2,}[A-Z][A-Za-z][^\n]{0,80}\n|$)/gi,
    "\n\n"
  );
  cleaned = cleaned.replace(
    /\n{0,2}\|[^\n]*(?:Assessment\s*\/\s*Procedure|Assessment Type|Screening\s*(?:≤|<=)?)[^\n]*\|\s*\n\|[-:|\s]+\|\s*\n(?:\|[^\n]*\|\s*\n?)+/gi,
    "\n\n"
  );
  cleaned = cleaned.replace(
    /\n{0,2}Notes\s*\n(?:\s*[-*•]\s+[^\n]+\n?){2,}/gi,
    "\n\n"
  );

  return cleaned.replace(/\n{3,}/g, "\n\n").trim();
}

function getDisplaySectionTitle(section: ProtocolSection, fallbackNumber: number): string {
  if (M11_TITLES[section.id]) return M11_TITLES[section.id];
  if (/^\d+(\.\d+)*\s+/.test(section.title)) return section.title;
  return `${fallbackNumber}. ${section.title}`;
}

function isScheduleSection(section: ProtocolSection): boolean {
  return section.id === "schedule" ||
    section.id === "schedule_of_activities" ||
    /^1\.3\s+Schedule of Activities/i.test(section.title) ||
    /^Schedule of Activities$/i.test(section.title);
}

function dedupeSections(sections: ProtocolSection[]): ProtocolSection[] {
  let scheduleSeen = false;
  const ids = new Set<string>();
  return sections.filter((section) => {
    const key = section.id || section.title;
    if (ids.has(key)) return false;
    ids.add(key);

    if (isScheduleSection(section)) {
      if (scheduleSeen) return false;
      scheduleSeen = true;
    }

    return true;
  });
}

function parseMaybeJson(value: any): any {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function enrichProcessedComponents(protocol: any, processedComponents: Record<string, string>): Record<string, string> {
  const result = { ...processedComponents };

  const generated = parseMaybeJson(protocol.generatedProtocol);
  if (Array.isArray(generated)) {
    generated.forEach((section: any) => {
      if (section?.id && section?.content) result[section.id] = section.content;
    });
  }

  const components = parseMaybeJson(protocol.components);
  if (components && typeof components === "object" && !Array.isArray(components)) {
    Object.entries(components).forEach(([key, value]) => {
      if (result[key]) return;
      if (typeof value === "string") result[key] = value;
      else if (value && typeof value === "object" && typeof (value as any).content === "string") result[key] = (value as any).content;
      else if (value != null) result[key] = JSON.stringify(value, null, 2);
    });
  }

  if (!result.synopsis && protocol.synopsis) result.synopsis = protocol.synopsis;

  if (!result.criteria && (protocol.inclusionCriteria || protocol.exclusionCriteria)) {
    const inclusion = parseMaybeJson(protocol.inclusionCriteria);
    const exclusion = parseMaybeJson(protocol.exclusionCriteria);
    const criteriaLines: string[] = ["## Inclusion Criteria"];
    if (Array.isArray(inclusion)) criteriaLines.push(...inclusion.map((item: any) => `- ${typeof item === "object" && item?.text ? item.text : item}`));
    else if (typeof inclusion === "string") criteriaLines.push(inclusion);
    criteriaLines.push("", "## Exclusion Criteria");
    if (Array.isArray(exclusion)) criteriaLines.push(...exclusion.map((item: any) => `- ${typeof item === "object" && item?.text ? item.text : item}`));
    else if (typeof exclusion === "string") criteriaLines.push(exclusion);
    result.criteria = criteriaLines.join("\n");
  }

  return result;
}

function generatedSectionBoilerplate(protocol: any): Record<string, string> {
  const result: Record<string, string> = {};
  const generated = parseMaybeJson(protocol.generatedProtocol);
  if (!Array.isArray(generated)) return result;

  generated.forEach((section: any) => {
    const sectionId = String(section?.id || "").trim();
    const boilerplateText = String(section?.traceability?.boilerplateText || "").trim();
    if (sectionId && boilerplateText) result[sectionId] = boilerplateText;
  });

  return result;
}

function findSectionProperties(documentXml: string): string {
  const bodyEnd = documentXml.lastIndexOf("</w:body>");
  if (bodyEnd === -1) return "<w:sectPr/>";

  const sectionStart = documentXml.lastIndexOf("<w:sectPr", bodyEnd);
  if (sectionStart === -1) return "<w:sectPr/>";

  const sectionEnd = documentXml.indexOf("</w:sectPr>", sectionStart);
  if (sectionEnd === -1 || sectionEnd > bodyEnd) return "<w:sectPr/>";

  return documentXml.slice(sectionStart, sectionEnd + "</w:sectPr>".length);
}

function replaceBody(documentXml: string, bodyXml: string): string {
  const sectPr = sectionProperties("portrait");
  return documentXml.replace(/<w:body>[\s\S]*<\/w:body>/, `<w:body>${bodyXml}${sectPr}</w:body>`);
}

function ensureDrawingNamespaces(documentXml: string): string {
  const startMatch = documentXml.match(/<w:document\b[^>]*>/);
  if (!startMatch) return documentXml;
  let startTag = startMatch[0];
  const namespaces: Record<string, string> = {
    wp: "http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing",
    a: "http://schemas.openxmlformats.org/drawingml/2006/main",
    pic: "http://schemas.openxmlformats.org/drawingml/2006/picture",
    r: "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
  };
  Object.entries(namespaces).forEach(([prefix, uri]) => {
    if (!startTag.includes(`xmlns:${prefix}=`)) {
      startTag = startTag.replace(/>$/, ` xmlns:${prefix}="${uri}">`);
    }
  });
  return documentXml.replace(startMatch[0], startTag);
}

function parseImageDataUri(dataUri?: string): { buffer: Buffer; contentType: string; extension: string } | null {
  const match = String(dataUri || "").match(/^data:(image\/(?:png|jpeg|jpg|webp|gif));base64,([\s\S]+)$/i);
  if (!match) return null;
  const contentType = match[1].toLowerCase().replace("image/jpg", "image/jpeg");
  const extension = contentType === "image/jpeg" ? "jpg" : contentType.replace("image/", "");
  return { buffer: Buffer.from(match[2], "base64"), contentType, extension };
}

function imageDimensions(buffer: Buffer, contentType: string): { width: number; height: number } {
  if (contentType === "image/png" && buffer.length > 24) {
    return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
  }
  if (contentType === "image/jpeg") {
    let offset = 2;
    while (offset < buffer.length) {
      if (buffer[offset] !== 0xff) break;
      const marker = buffer[offset + 1];
      const length = buffer.readUInt16BE(offset + 2);
      if ([0xc0, 0xc1, 0xc2].includes(marker)) {
        return { height: buffer.readUInt16BE(offset + 5), width: buffer.readUInt16BE(offset + 7) };
      }
      offset += 2 + length;
    }
  }
  return { width: 1200, height: 700 };
}

function fitImageToPage(buffer: Buffer, contentType: string): { cx: number; cy: number; orientation: "portrait" | "landscape" } {
  const { width, height } = imageDimensions(buffer, contentType);
  const isWide = width / Math.max(1, height) > 1.15;
  const maxWidthIn = isWide ? 9.3 : 6.3;
  const maxHeightIn = isWide ? 6.1 : 7.3;
  const scale = Math.min(maxWidthIn / Math.max(1, width), maxHeightIn / Math.max(1, height), 1);
  return {
    cx: Math.round(width * scale * 914400),
    cy: Math.round(height * scale * 914400),
    orientation: isWide ? "landscape" : "portrait",
  };
}

function nextRelationshipId(relsXml: string): string {
  const ids = Array.from(relsXml.matchAll(/Id="rId(\d+)"/g)).map((match) => Number(match[1])).filter(Number.isFinite);
  return `rId${Math.max(0, ...ids) + 1}`;
}

function ensureImageContentType(zip: PizZip, extension: string, contentType: string) {
  const contentTypesFile = zip.file("[Content_Types].xml");
  if (!contentTypesFile) return;
  const xml = contentTypesFile.asText();
  if (new RegExp(`<Default\\s+Extension="${extension}"\\b`, "i").test(xml)) return;
  zip.file("[Content_Types].xml", xml.replace("</Types>", `<Default Extension="${extension}" ContentType="${contentType}"/></Types>`));
}

function addImageRelationship(zip: PizZip, dataUri: string, nameBase: string): { relId: string; buffer: Buffer; contentType: string; extension: string } | null {
  const parsed = parseImageDataUri(dataUri);
  if (!parsed) return null;
  const relsPath = "word/_rels/document.xml.rels";
  const relsFile = zip.file(relsPath);
  const relsXml = relsFile?.asText() || `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>`;
  const relId = nextRelationshipId(relsXml);
  const filename = `${nameBase}.${parsed.extension}`;
  zip.file(`word/media/${filename}`, parsed.buffer);
  zip.file(relsPath, relsXml.replace("</Relationships>", `<Relationship Id="${relId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/${filename}"/></Relationships>`));
  ensureImageContentType(zip, parsed.extension, parsed.contentType);
  return { relId, ...parsed };
}

function imageParagraphXml(relId: string, name: string, cx: number, cy: number): string {
  const safeName = escapeXml(name || "Study schema source figure");
  return `<w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${cx}" cy="${cy}"/><wp:effectExtent l="0" t="0" r="0" b="0"/><wp:docPr id="1" name="${safeName}"/><wp:cNvGraphicFramePr><a:graphicFrameLocks noChangeAspect="1"/></wp:cNvGraphicFramePr><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic><pic:nvPicPr><pic:cNvPr id="0" name="${safeName}"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="${relId}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>`;
}

function sourceStudySchemaImageToXml(zip: PizZip, protocol: any): { xml: string; orientation: "portrait" | "landscape" } | null {
  const parsed = parseMaybeJson(protocol?.studySchema);
  const schema = parsed?.presentationSchema || parsed;
  const sourceFigure = schema?.sourceFigure;
  if (schema?.renderMode !== "source_image" || !sourceFigure?.imageDataUri) return null;
  const image = addImageRelationship(zip, sourceFigure.imageDataUri, `study-schema-source-${String(protocol?.id || "protocol").replace(/[^a-z0-9_-]/gi, "")}`);
  if (!image) return null;
  const fit = fitImageToPage(image.buffer, image.contentType);
  return {
    xml: imageParagraphXml(image.relId, sourceFigure.sourceLabel || "Source study schema figure", fit.cx, fit.cy),
    orientation: fit.orientation,
  };
}

export async function generateTemplateDocxDocument(
  protocol: Protocol,
  sections: ProtocolSection[],
  boilerplateContent: Record<string, string> = {},
  processedComponents: Record<string, string> = {}
): Promise<Buffer> {
  if (!fs.existsSync(TEMPLATE_PATH)) {
    throw new Error(`Clinical protocol Word template not found at ${TEMPLATE_PATH}`);
  }

  const zip = new PizZip(fs.readFileSync(TEMPLATE_PATH));
  const documentFile = zip.file("word/document.xml");
  if (!documentFile) throw new Error("Template is missing word/document.xml");

  const enrichedComponents = enrichProcessedComponents(protocol, processedComponents);
  const traceBoilerplateContent = generatedSectionBoilerplate(protocol);
  const sortedSections = dedupeSections([...sections].sort((a, b) => {
    const indexA = SECTION_ORDER.indexOf(a.id);
    const indexB = SECTION_ORDER.indexOf(b.id);
    if (indexA !== -1 && indexB !== -1) return indexA - indexB;
    if (indexA !== -1) return -1;
    if (indexB !== -1) return 1;
    return 0;
  }));

  const body: string[] = [];

  body.push(heading("Title Page and Protocol Identifiers", 1));
  body.push(paragraph("Protocol Number", "SubheadingBold12"));
  body.push(paragraph(protocol.id || "[PROTOCOL NUMBER TO BE ASSIGNED]", "BodyText12", protocol.id ? "source" : "placeholder"));
  body.push(paragraph("Protocol Title", "SubheadingBold12"));
  body.push(paragraph(protocol.title || "[PROTOCOL TITLE TO BE ASSIGNED]", "Title", protocol.title ? "source" : "placeholder"));
  body.push(paragraph("Sponsor", "SubheadingBold12"));
  body.push(paragraph((protocol as any).sponsor || "[SPONSOR NAME]", "BodyText12", (protocol as any).sponsor ? "source" : "placeholder"));
  body.push(paragraph("Confidentiality Statement", "SubheadingBold12"));
  body.push(paragraph("Confidentiality statement and signature block to be added per sponsor template.", "BodyText12", "boilerplate"));
  body.push(pageBreakParagraph());

  body.push(heading("Table of Contents", 1));
  sortedSections
    .filter((section) => section.id !== "title")
    .forEach((section, index) => body.push(paragraph(getDisplaySectionTitle(section, index + 1), "TOC1")));
  body.push(pageBreakParagraph());

  sortedSections.forEach((section, index) => {
    if (section.id === "title") return;
    const displayTitle = getDisplaySectionTitle(section, index + 1);

    const scheduleSection = isScheduleSection(section);
    const scheduleXml = scheduleSection ? scheduleToXml(protocol as any) : "";
    const scheduleOrientation = scheduleXml ? scheduleSectionOrientation(protocol as any) : "portrait";
    const sourceSchemaImage = section.id === "trial_schema" ? sourceStudySchemaImageToXml(zip, protocol as any) : null;
    if (scheduleXml || sourceSchemaImage) body.push(sectionBreakParagraph("portrait"));
    body.push(heading(displayTitle, /^\d+\.\d+/.test(displayTitle) ? 2 : 1));

    let origin: ContentOrigin = "ai";
    let content = "";
    if (enrichedComponents[section.id]) {
      content = enrichedComponents[section.id];
      origin = section.id === "synopsis" ? "source" : "ai";
    } else {
      const alternatives: Record<string, string[]> = {
        schedule: ["schedule_of_activities", "scheduleOfActivities", "scheduleOfAssessments"],
        schedule_of_activities: ["schedule", "scheduleOfActivities", "scheduleOfAssessments"],
        statistics: ["statistical", "statisticalAnalysis", "analysisPlan"],
        safetyDrugHandling: ["safety", "drug_handling", "drugHandling"],
      };
      const match = alternatives[section.id]?.find((key) => enrichedComponents[key]);
      if (match) content = enrichedComponents[match];
    }

    const boilerplate = (boilerplateContent[section.id] || traceBoilerplateContent[section.id] || "").trim();
    if (boilerplate) {
      body.push(paragraph("Template boilerplate", "SubheadingBold12", "boilerplate"));
      body.push(contentToXml(boilerplate, "boilerplate", "Template boilerplate"));
      content = removeExactBoilerplateFromContent(content, boilerplate);
    }

    if (sourceSchemaImage) {
      body.push(paragraph("Source study schema figure reproduced from uploaded source.", "BodyText12", "source"));
      body.push(sourceSchemaImage.xml);
      body.push(sectionBreakParagraph(sourceSchemaImage.orientation));
      return;
    }

    if (scheduleXml) {
      body.push(scheduleXml);
      body.push(sectionBreakParagraph(scheduleOrientation));
      return;
    }

    content = stripEmbeddedScheduleBlocks(content, section.id);

    if (!content) {
      content = `[${displayTitle.toUpperCase()} TO BE COMPLETED]`;
      origin = "placeholder";
    }

    body.push(contentToXml(content, origin, displayTitle));
    body.push(paragraph("", "BodyText12"));
  });

  const originalDocumentXml = ensureDrawingNamespaces(documentFile.asText());
  zip.file("word/document.xml", replaceBody(originalDocumentXml, body.join("")));
  return zip.generate({ type: "nodebuffer", compression: "DEFLATE" });
}
