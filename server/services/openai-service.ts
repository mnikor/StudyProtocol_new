import OpenAI from "openai";

const DEFAULT_OPENAI_MODEL = "gpt-4.1";
const chooseOpenAIModel = (value: string | undefined, fallback = DEFAULT_OPENAI_MODEL) =>
  value && !/4o/i.test(value) ? value : fallback;
const MODEL = chooseOpenAIModel(process.env.OPENAI_MODEL);
const REVIEW_MODEL = chooseOpenAIModel(process.env.OPENAI_REVIEW_MODEL);
const SCHEDULE_MODEL = chooseOpenAIModel(process.env.OPENAI_SCHEDULE_MODEL);

const M11_SECTION_OUTPUT_SHAPES: Record<string, string> = {
  synopsis: "Use protocol-ready narrative paragraphs for Rationale, Trial Design, Trial Population, Trial Intervention and Comparator, Endpoints, Key Assessments, and Statistical Approach. Use bullets only for objective or endpoint lists that are naturally enumerated. Keep this a true summary, but do not reduce supported content to outline fragments. Do not reproduce full inclusion/exclusion criteria here; summarize eligibility at a high level and leave full criteria to the Eligibility Criteria section.",
  trial_schema: "Use narrative participant-flow text and a concise schema summary only. Do not include the Schedule of Activities, SoA markdown tables, assessment grids, or full visit-by-assessment tables; those are exported from section 1.3. Do not convert the whole section into bullets. Do not restate full inclusion/exclusion criteria. Do not include image-only instructions.",
  schedule: "Do not draft the Schedule of Activities as prose. The application exports the SoA from the structured SoA tab data. Provide only a short protocol note if needed.",
  schedule_of_activities: "Do not draft the Schedule of Activities as prose. The application exports the SoA from the structured SoA tab data. Provide only a short protocol note if needed.",
  objectives: "Use subsections: Primary Objective; Secondary Objectives; Exploratory Objectives; Associated Estimands. Objective statements may be bullets, but estimand explanations should be short narrative paragraphs. Do not create estimand details that are not source-supported.",
  design: "Use subsections: Overall Trial Design; Scientific Rationale; Randomization and Blinding; Trial Arms; Duration; Design Justification. Write substantive narrative paragraphs, not an outline.",
  population: "Use subsections: Trial Population; Eligibility Summary; Recruitment and Screening; Lifestyle or Special Population Considerations. Use narrative summaries only. Do not reproduce full inclusion/exclusion criteria here; the full eligibility list belongs only in the Eligibility Criteria section.",
  criteria: "Use separate subsections: Inclusion Criteria; Exclusion Criteria. Keep each criterion as a real bullet item and preserve source criteria wording unless improvement is clearly needed.",
  treatments: "Use subsections: Trial Interventions; Comparator; Administration; Concomitant Therapy; Treatment Accountability. Write narrative operational text and use placeholders for unsupported drug handling details.",
  discontinuation: "Use subsections: Discontinuation of Trial Intervention; Participant Withdrawal; Lost to Follow-up; Safety Follow-up; Data Collection after Discontinuation. Use narrative paragraphs unless the source contains a discrete list of discontinuation reasons.",
  assessments: "Use subsections by assessment family: Efficacy; Safety; PK/PD; Biomarker; Patient-reported Outcomes; Other Assessments. Write narrative paragraphs describing methods, responsibility, timing references, and source-document dependencies. Do not duplicate the SoA table.",
  safety: "Use subsections: AE/SAE Definitions; Reporting Timelines; AESIs; Pregnancy/Overdose/Medication Error; Product Complaints; Safety Follow-up. Use narrative paragraphs and product-specific placeholders if source documents are missing.",
  safetyDrugHandling: "Use product-by-product subsections when more than one study product exists. For each product write narrative operational paragraphs covering dosing, preparation/dispensing, storage, accountability, dose modification/interruption, contraception/pregnancy precautions, and required source document placeholders where unsupported.",
  statistics: "Use subsections: Estimands and Analysis Objectives; Analysis Populations; Sample Size; Primary Analysis; Secondary Analyses; Missing Data and Intercurrent Events; Multiplicity; Interim/Subgroup/Sensitivity Analyses. Use narrative statistical-method text with bullets only for analysis-population definitions or estimand attributes.",
  data_management: "Use subsections: Data Capture; Source Data; Data Quality Control; Coding; Database Lock; Retention and Confidentiality. Write narrative operational text.",
  monitoring: "Use subsections: Monitoring Approach; Quality Assurance; Protocol Deviations; Audit and Inspection; Investigator Responsibilities. Write narrative operational text.",
  ethical: "Use subsections: Ethics and Regulatory Compliance; Informed Consent; Confidentiality/Data Protection; Oversight; Publication and Conflict-of-interest Considerations. Write narrative regulatory text.",
  administrative: "Use sponsor-template placeholders for amendment history, signature pages, glossary, references, and appendices. Do not invent names, dates, signatures, or approvals.",
};

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || "missing-openai-api-key",
});

function getOpenAISetupError(error: any): string | null {
  const status = error?.status;
  const code = error?.code || error?.error?.code;
  const message = String(error?.message || error?.error?.message || "");

  if (status === 401 || code === "invalid_api_key" || message.includes("Incorrect API key") || message.includes("missing-openai-api-key")) {
    return "OpenAI API key is missing or invalid. Restart the app with a valid OPENAI_API_KEY.";
  }

  if (status === 429 && /quota|billing|plan/i.test(message)) {
    return "OpenAI quota is exhausted for the configured API key. Add credits/update billing or switch to another API key, then retry.";
  }

  if (status === 429) {
    return "OpenAI rate limit was reached. Wait briefly and retry, or use a higher-limit API key.";
  }

  return null;
}

function throwOpenAIServiceError(error: any, fallback: string): never {
  const setupError = getOpenAISetupError(error);
  if (setupError) {
    throw new Error(setupError);
  }
  throw new Error(fallback);
}

// Reusable interfaces for OpenAI responses
interface ElementStatus {
  element: string;
  status: "missing" | "partial" | "complete";
  details: string;
}

interface AnalysisResponse {
  assessment: string;
  readinessLevel?: "ready" | "partial" | "insufficient";
  extractedFields?: Array<{
    label: string;
    value: string;
    status: "found" | "missing" | "unclear";
  }>;
  elements: ElementStatus[];
  missingElements: string[];
  sourceDocumentsNeeded?: string[];
  nextSteps?: string[];
  sourceUseRecommendations?: Array<{
    protocolArea: string;
    sourceStatus: "present" | "partial" | "missing" | "unclear";
    recommendedAction: "use_as_is" | "improve" | "generate" | "needs_source";
    why: string;
    proposedHandling: string;
    sourceEvidence?: string;
    specificWeakPoints?: string[];
    proposedAdditions?: Array<{
      draftText: string;
      whyNeeded: string;
      sourceBasis?: string;
      requiresUserConfirmation?: boolean;
    }>;
    medicalWriterQuestions?: string[];
  }>;
  studyLogicAssessment?: Array<{
    area: string;
    conclusion: string;
    reasoning: string;
    riskLevel?: "low" | "medium" | "high";
    recommendedFollowUp?: string;
  }>;
  assumptionsRequiringReview?: string[];
}

interface ProtocolComponent {
  content: any;
  explanation?: string;
}

/**
 * Handles JSON parsing of OpenAI responses safely
 */
function safeParseJson(content: string | null): any {
  try {
    return JSON.parse(content || "{}");
  } catch (error) {
    console.error("Error parsing JSON from OpenAI response:", error);
    return {};
  }
}

async function createJsonReviewCompletion(messages: Array<{ role: "system" | "user"; content: string }>) {
  const models = Array.from(new Set([REVIEW_MODEL, MODEL].filter(Boolean)));
  let lastError: any = null;

  for (const model of models) {
    try {
      return await openai.chat.completions.create({
        model,
        messages,
        response_format: { type: "json_object" },
      });
    } catch (error) {
      lastError = error;
      console.warn(`Review completion failed with model ${model}; trying fallback if available.`, error);
    }
  }

  throw lastError || new Error("Review completion failed");
}

type SupplementaryPromptChunk = {
  text: string;
  sourceLabel: string;
  usage: string;
  type: string;
  index: number;
};

function compactTableForPrompt(table: any, index: number): string {
  const headers = Array.isArray(table?.headers) ? table.headers.map((header: any) => String(header || "").trim()).filter(Boolean) : [];
  const rows = Array.isArray(table?.rows) ? table.rows : [];
  const rowText = rows
    .slice(0, 80)
    .map((row: any[]) => Array.isArray(row) ? row.map(cell => String(cell || "").trim()).join(" | ") : String(row || ""))
    .join("\n");
  const cellText = Array.isArray(table?.cells)
    ? table.cells
      .slice(0, 30)
      .map((row: any[]) => Array.isArray(row)
        ? row.map(cell => `${cell?.text || ""}${cell?.colSpan && cell.colSpan > 1 ? ` [colspan ${cell.colSpan}]` : ""}${cell?.rowSpan && cell.rowSpan > 1 ? ` [rowspan ${cell.rowSpan}]` : ""}`).join(" | ")
        : ""
      )
      .join("\n")
    : "";

  return [
    `TABLE ${index + 1}: ${table?.title || "Untitled table"}`,
    `Source: ${table?.source || "uploaded source"}`,
    `Confidence: ${table?.confidence || "unknown"}`,
    headers.length ? `Headers: ${headers.join(" | ")}` : "",
    rowText ? `Rows:\n${rowText}` : "",
    cellText ? `Merged-cell context:\n${cellText}` : "",
    table?.rawText ? `Raw text:\n${String(table.rawText).slice(0, 9000)}` : "",
  ].filter(Boolean).join("\n");
}

export async function reconstructScheduleTablesFromExtraction(
  filename: string,
  structuredExtraction: any,
  usage: string
): Promise<any> {
  if (!process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY === "missing-openai-api-key") {
    return structuredExtraction;
  }

  const sourceTables = Array.isArray(structuredExtraction?.tables)
    ? structuredExtraction.tables.filter((table: any) => table?.recommendedUse === "schedule_of_activities")
    : [];

  const sourceText = [
    ...sourceTables.slice(0, 6).map(compactTableForPrompt),
    structuredExtraction?.plainText
      ? `DOCUMENT TEXT EXCERPT:\n${String(structuredExtraction.plainText).slice(0, 18000)}`
      : "",
  ].filter(Boolean).join("\n\n---\n\n");

  const hasScheduleSignals = /schedule of activities|schedule of assessments|time and events|schedule of events|screening|follow[- ]?up|end[- ]?of[- ]?treatment|\beot\b|\bcycle\b|\bc\d+\b/i.test(sourceText);
  if (!sourceText.trim() || !hasScheduleSignals) {
    return structuredExtraction;
  }

  const prompt = `
    You are reconstructing a clinical trial Schedule of Activities (SoA) from an uploaded document for a protocol authoring application.

    User instruction for this uploaded source:
    ${usage || "Reproduce the schedule of activities from the uploaded source."}

    Source file: ${filename}

    TASK:
    Return clean JSON tables that can be rendered as editable SoA grids.

    STRICT RULES:
    - Reconstruct only table content supported by the uploaded source. Do not invent visits, assessments, or X marks.
    - Preserve source table count when the source clearly has separate SoA tables/pages, such as earlier/later period schedules or extension phase schedules.
    - Preserve merged/nested headers by flattening them into readable column labels. Keep parent phase labels, child cohort/arm labels, timing windows, EOT, follow-up, and crossover labels.
    - Preserve row group/category labels such as Screening, Study Drug Administration, Clinical Laboratory, Ongoing Subject Review, Biomarkers, Additional Endpoints.
    - Preserve X marks, continuous dosing arrows, cycle/day labels, timing notes, footnotes, and conditional text in the most appropriate cell.
    - Do not turn abbreviations or ordinary paragraphs into assessment rows unless they are explicitly table footnotes.
    - If text extraction is incomplete or ambiguous, return best-effort rows and include qualityIssues.

    OUTPUT JSON SHAPE:
    {
      "tables": [
        {
          "title": "Time and Events Schedule",
          "headers": ["Assessment", "Notes", "Crossover Eligibility Phase - Within 28 days before start of crossover Treatment Phase", "Open-Label Treatment Phase - Subjects not requiring cross-over and were receiving apalutamide - D1 of C1 then D1 of q4 cycles", "EOT", "Follow-up Phase"],
          "rows": [
            ["Study Drug Administration", "", "", "", "", ""],
            ["Dosing compliance and dispense study drug", "See Section 7", "", "X", "X (compliance only)", ""]
          ],
          "notes": ["Abbreviations: ..."],
          "confidence": "high|medium|low",
          "qualityIssues": []
        }
      ]
    }

    SOURCE EXTRACTION:
    ${sourceText.slice(0, 30000)}
  `;

  try {
    const response = await openai.chat.completions.create({
      model: MODEL,
      messages: [
        { role: "system", content: "You are a clinical trial SoA table reconstruction specialist. Return valid JSON only." },
        { role: "user", content: prompt },
      ],
      response_format: { type: "json_object" },
      temperature: 0.1,
    });

    const parsed = safeParseJson(response.choices[0].message.content);
    const reconstructedTables = Array.isArray(parsed?.tables)
      ? parsed.tables
        .filter((table: any) => Array.isArray(table?.headers) && Array.isArray(table?.rows) && table.headers.length >= 2 && table.rows.length >= 1)
        .slice(0, 6)
        .map((table: any, index: number) => ({
          id: `ai-reconstructed-soa-${index + 1}`,
          title: String(table.title || `Reconstructed SoA table ${index + 1}`),
          source: filename,
          confidence: table.confidence === "low" || table.confidence === "medium" ? table.confidence : "high",
          headers: table.headers.map((header: any) => String(header || "").trim()).filter(Boolean),
          rows: table.rows.map((row: any[]) => {
            const normalized = Array.isArray(row) ? row.map(cell => String(cell || "").trim()) : [String(row || "").trim()];
            while (normalized.length < table.headers.length) normalized.push("");
            return normalized.slice(0, table.headers.length);
          }),
          rawText: [
            "AI reconstructed from uploaded source table/text extraction.",
            table.notes?.length ? `Notes: ${table.notes.join(" ")}` : "",
            table.qualityIssues?.length ? `Quality issues: ${table.qualityIssues.join(" ")}` : "",
          ].filter(Boolean).join("\n"),
          recommendedUse: "schedule_of_activities",
          extractionMethod: "ai_reconstructed_from_source",
        }))
      : [];

    if (reconstructedTables.length === 0) {
      return structuredExtraction;
    }

    return {
      ...structuredExtraction,
      tables: [
        ...reconstructedTables,
        ...(structuredExtraction.tables || []),
      ],
      warnings: [
        ...(structuredExtraction.warnings || []),
        "Schedule of Activities was reconstructed with AI from the uploaded source extraction. Review against the original document before finalizing.",
      ],
      extractionSummary: `${structuredExtraction.extractionSummary || "Structured extraction complete."} AI reconstructed ${reconstructedTables.length} Schedule of Activities table${reconstructedTables.length === 1 ? "" : "s"} for the SoA tab.`,
    };
  } catch (error) {
    console.error("Error reconstructing SoA tables from upload:", error);
    return {
      ...structuredExtraction,
      warnings: [
        ...(structuredExtraction.warnings || []),
        "AI Schedule of Activities reconstruction failed; using text/table extraction fallback.",
      ],
    };
  }
}

const SUPPLEMENTARY_PROMPT_CHUNK_SIZE = 1800;
const SUPPLEMENTARY_PROMPT_CHUNK_OVERLAP = 220;

function getSupplementaryPromptQueryTerms(query: string): string[] {
  return Array.from(new Set(
    String(query || "")
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter(term => term.length > 2)
  ));
}

function createSupplementaryPromptChunks(
  text: string,
  sourceLabel: string,
  usage: string,
  type: string,
  idPrefix: string
): SupplementaryPromptChunk[] {
  const normalizedText = String(text || "").replace(/\s+/g, " ").trim();
  if (!normalizedText) return [];

  const chunks: SupplementaryPromptChunk[] = [];
  let start = 0;

  while (start < normalizedText.length) {
    const end = Math.min(start + SUPPLEMENTARY_PROMPT_CHUNK_SIZE, normalizedText.length);
    const chunkText = normalizedText.slice(start, end).trim();
    if (chunkText) {
      chunks.push({
        text: chunkText,
        sourceLabel,
        usage,
        type,
        index: chunks.length + 1
      });
    }
    if (end >= normalizedText.length) break;
    start = Math.max(0, end - SUPPLEMENTARY_PROMPT_CHUNK_OVERLAP);
  }

  return chunks;
}

function normalizeSupplementaryInfoForPrompt(supplementaryInfo: any, query = "", maxChunks = 10): string[] {
  let items = supplementaryInfo;

  if (typeof items === "string") {
    try {
      items = JSON.parse(items);
    } catch {
      items = items.trim() ? [items] : [];
    }
  }

  if (!Array.isArray(items)) {
    items = items ? [items] : [];
  }

  const queryTerms = getSupplementaryPromptQueryTerms(query);
  const chunks: SupplementaryPromptChunk[] = [];

  items.forEach((item: any, index: number) => {
    if (!item) return;

    if (typeof item === "string") {
      chunks.push(...createSupplementaryPromptChunks(
        item,
        `Supplementary note ${index + 1}`,
        "Use as supporting reference for protocol generation.",
        "text",
        `legacy-${index + 1}`
      ));
      return;
    }

    if (Array.isArray(item.ragChunks) && item.ragChunks.length > 0) {
      chunks.push(...item.ragChunks.map((chunk: any, chunkIndex: number) => ({
        text: String(chunk.text || ""),
        sourceLabel: chunk.sourceLabel || item.fileName || item.text || `Supplementary item ${index + 1}`,
        usage: chunk.usage || item.context || "Use as supporting reference for protocol generation.",
        type: chunk.type || item.type || "text",
        index: chunk.index || chunkIndex + 1
      })));
      return;
    }

    const type = item.type || "text";
    const label = item.fileName || item.text || `Supplementary item ${index + 1}`;
    const usage = item.context || "Use as supporting reference for protocol generation.";
    const content = item.fileContent || item.text || "";
    chunks.push(...createSupplementaryPromptChunks(content, label, usage, type, item.id || `item-${index + 1}`));
  });

  return chunks
    .map(chunk => {
      const haystack = `${chunk.sourceLabel} ${chunk.usage} ${chunk.text}`.toLowerCase();
      const score = queryTerms.length === 0
        ? 1
        : queryTerms.reduce((sum, term) => sum + (haystack.split(term).length - 1), 0);
      return { chunk, score };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, maxChunks)
    .map(({ chunk }) => [
      `RETRIEVED SUPPLEMENTARY ${String(chunk.type).toUpperCase()} CHUNK: ${chunk.sourceLabel} (chunk ${chunk.index})`,
      `USAGE INSTRUCTION: ${chunk.usage}`,
      `CONTENT:\n${chunk.text}`
    ].join("\n"))
    .filter((item: string) => item.trim().length > 0);
}

function truncatePromptText(value: any, maxChars: number): string {
  const text = String(value ?? "");
  if (text.length <= maxChars) return text;
  const headLength = Math.max(0, Math.floor(maxChars * 0.68));
  const tailLength = Math.max(0, maxChars - headLength - 120);
  return [
    text.slice(0, headLength),
    `\n...[truncated ${text.length - headLength - tailLength} characters for prompt size]...\n`,
    tailLength > 0 ? text.slice(text.length - tailLength) : ""
  ].join("");
}

function stringifyPromptValue(value: any): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function compactPromptField(value: any, maxChars: number): any {
  if (value === null || value === undefined || value === "") return value;
  const serialized = stringifyPromptValue(value);
  if (serialized.length <= maxChars) return value;
  return truncatePromptText(serialized, maxChars);
}

function compactProtocolForInputReview(protocol: any, supplementaryInfo: string[]) {
  return {
    id: protocol?.id,
    title: protocol?.title,
    phase: protocol?.phase,
    indication: protocol?.indication,
    protocolType: protocol?.protocolType,
    synopsis: compactPromptField(protocol?.synopsis, 350000),
    tableHeaders: compactPromptField(protocol?.tableHeaders, 50000),
    tableData: compactPromptField(protocol?.tableData, 250000),
    inclusionCriteria: compactPromptField(protocol?.inclusionCriteria, 120000),
    exclusionCriteria: compactPromptField(protocol?.exclusionCriteria, 120000),
    dataVariables: compactPromptField(protocol?.dataVariables, 80000),
    studySchema: compactPromptField(protocol?.studySchema, 80000),
    safetyDrugHandling: compactPromptField(protocol?.safetyDrugHandling, 120000),
    statisticalAnalysisPlan: compactPromptField(protocol?.statisticalAnalysisPlan, 120000),
    supplementaryInfo: supplementaryInfo.slice(0, 20).map((item) => truncatePromptText(item, 12000)),
    components: compactPromptField(protocol?.components, 180000)
  };
}

function hasNonEmptyScheduleData(protocol: any): boolean {
  const headers = protocol?.tableHeaders;
  const data = protocol?.tableData;
  const parsedHeaders = typeof headers === "string"
    ? (() => {
        try { return JSON.parse(headers); } catch { return headers.trim() ? [headers] : []; }
      })()
    : headers;
  const parsedData = typeof data === "string"
    ? (() => {
        try { return JSON.parse(data); } catch { return data.trim() ? { schedule: data } : {}; }
      })()
    : data;

  return (Array.isArray(parsedHeaders) && parsedHeaders.length > 0) ||
    (parsedData && typeof parsedData === "object" && Object.keys(parsedData).length > 0);
}

function hasScheduleSourceEvidence(protocol: any): boolean {
  if (hasNonEmptyScheduleData(protocol)) return true;
  const sourceTables = [
    ...(Array.isArray(protocol?.sourceExtraction?.tables) ? protocol.sourceExtraction.tables : []),
    ...(Array.isArray(protocol?.soaSourceTables) ? protocol.soaSourceTables : []),
  ];
  return sourceTables.some((table: any) =>
    table?.recommendedUse === "schedule_of_activities" ||
    /schedule of activities|schedule of assessments|time and events|schedule of events/i.test(
      `${table?.title || ""} ${table?.rawText || ""}`
    )
  );
}

function parseReviewValue(value: any): any {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function hasMeaningfulReviewValue(value: any): boolean {
  const parsed = parseReviewValue(value);
  if (parsed === null || parsed === undefined) return false;
  if (typeof parsed === "string") return parsed.trim().length > 0;
  if (Array.isArray(parsed)) return parsed.some((item) => hasMeaningfulReviewValue(item));
  if (typeof parsed === "object") return Object.values(parsed).some((item) => hasMeaningfulReviewValue(item));
  return Boolean(parsed);
}

function getFallbackSectionContent(protocol: any, sectionKey: string): any {
  const dataBySection: Record<string, any> = {
    criteria: {
      inclusionCriteria: protocol?.inclusionCriteria,
      exclusionCriteria: protocol?.exclusionCriteria,
    },
    variables: protocol?.dataVariables,
    studySchema: protocol?.studySchema,
    safetyDrugHandling: protocol?.safetyDrugHandling,
    analysisplan: protocol?.statisticalAnalysisPlan,
  };
  return dataBySection[sectionKey];
}

function buildFallbackSectionReview(protocol: any, sectionKey: string, sectionName: string) {
  if (sectionKey === "schedule" && hasScheduleSourceEvidence(protocol)) {
    return {
      summary: "Schedule of Activities source or current schedule data is available.",
      recommendedMode: "preserve" as const,
      sourceStatus: "usable" as const,
      sourceEvidence: ["Existing Schedule of Activities table data or source table evidence is available."],
      improvements: [],
      missingItems: [],
      risks: ["Review the copied schedule against the source document before final protocol generation."],
      rationale: "The AI review service was unavailable, so the app used deterministic schedule source checks."
    };
  }

  const currentContent = sectionKey === "schedule"
    ? null
    : getFallbackSectionContent(protocol, sectionKey);
  const hasCurrentContent = hasMeaningfulReviewValue(currentContent);

  if (sectionKey !== "schedule" && hasCurrentContent) {
    return {
      summary: `${sectionName} has current tab content, but source coverage could not be reviewed.`,
      recommendedMode: "augment" as const,
      sourceStatus: "partial" as const,
      sourceEvidence: [`Current ${sectionName} tab content is present.`],
      improvements: [
        "Use the current content as the working draft and rerun source review when the AI review service is available."
      ],
      missingItems: [],
      risks: [
        "Source coverage was not confirmed because the AI review request failed."
      ],
      rationale: "The AI review service was unavailable, so the app used deterministic current-content checks."
    };
  }

  return {
    summary: sectionKey === "schedule"
      ? `No structured ${sectionName} source table is available; generate a draft from the synopsis.`
      : `No current ${sectionName} content was detected; generate a draft from the synopsis.`,
    recommendedMode: "generate" as const,
    sourceStatus: "not_found" as const,
    sourceEvidence: [
      sectionKey === "schedule"
        ? "No current Schedule of Activities table or extracted source SoA table was detected."
        : `No current ${sectionName} tab content was detected.`
    ],
    improvements: [],
    missingItems: [
      sectionKey === "schedule"
        ? "Generate a draft Schedule of Activities from the synopsis, then review visit timing and assessment frequency."
        : `Generate draft ${sectionName} content from the synopsis, then review it against source documents.`
    ],
    risks: [
      sectionKey === "schedule"
        ? "Generated schedules require medical/clinical operations review because no source SoA table was available."
        : "Generated content requires review because source coverage was not confirmed."
    ],
    rationale: "The AI review service was unavailable, so the app used deterministic current-content checks."
  };
}

/**
 * Parses randomization ratios like "2:1:1" into specific arm allocations
 */
function parseRandomizationRatio(sampleSize: any): any {
  if (!sampleSize || !sampleSize.randomizationRatio || !sampleSize.total) {
    return sampleSize; // Return as-is if no ratio to parse
  }

  const ratio = sampleSize.randomizationRatio.trim();
  const total = sampleSize.total;

  // Parse ratio string (e.g., "2:1:1", "1:1", "3:2:1")
  const ratioMatch = ratio.match(/^(\d+(?:\.\d+)?(?::\d+(?:\.\d+)?)*)/);
  if (!ratioMatch) {
    console.warn(`Invalid randomization ratio format: ${ratio}`);
    return sampleSize;
  }

  const ratioParts = ratioMatch[1].split(':').map((part: string) => parseFloat(part));
  
  if (ratioParts.length < 2) {
    console.warn(`Randomization ratio must have at least 2 arms: ${ratio}`);
    return sampleSize;
  }

  // Calculate total ratio sum
  const ratioSum = ratioParts.reduce((sum: number, part: number) => sum + part, 0);
  
  // Generate arms with calculated sample sizes
  const arms = ratioParts.map((ratioPart: number, index: number) => {
    const plannedN = Math.round((ratioPart / ratioSum) * total);
    const percentage = Math.round((ratioPart / ratioSum) * 100 * 100) / 100; // Round to 2 decimal places
    
    // Generate arm names based on index
    const armName = index === 0 ? "Control" : 
                   index === 1 ? "Treatment A" :
                   index === 2 ? "Treatment B" :
                   `Treatment ${String.fromCharCode(65 + index - 1)}`;
    
    return {
      id: `arm_${index + 1}`,
      name: armName,
      plannedN,
      percentage
    };
  });

  // Validate that arm totals match the specified total (within rounding tolerance)
  const armSum = arms.reduce((sum: number, arm: any) => sum + arm.plannedN, 0);
  const tolerance = Math.max(1, Math.ceil(total * 0.02)); // 2% tolerance or minimum 1
  
  if (Math.abs(armSum - total) > tolerance) {
    console.warn(`Arm allocation sum (${armSum}) differs from total (${total}) by more than tolerance (${tolerance})`);
    
    // Adjust the largest arm to make the sum equal to total
    const difference = total - armSum;
    const largestArmIndex = arms.reduce((maxIndex: number, arm: any, index: number) => 
      arm.plannedN > arms[maxIndex].plannedN ? index : maxIndex, 0);
    
    arms[largestArmIndex].plannedN += difference;
    arms[largestArmIndex].percentage = Math.round((arms[largestArmIndex].plannedN / total) * 100 * 100) / 100;
  }

  return {
    ...sampleSize,
    approach: "ratio_based",
    arms,
    // Keep the original ratio for reference
    randomizationRatio: ratio
  };
}

/**
 * Normalizes sample size data for different protocol types
 * Handles post-processing of parsed results to ensure consistency
 */
function normalizeSampleSize(sampleSize: any, protocolType: string): any {
  if (!sampleSize) {
    return sampleSize;
  }

  const isObservational = protocolType === "prospective_cohort_study" || protocolType === "retrospective_cohort_study";
  
  // For observational studies, remove ratio_based approach and use cohort terminology
  if (isObservational) {
    // Remove ratio_based approach for observational studies
    if (sampleSize.approach === "ratio_based") {
      sampleSize.approach = "custom_arms";
    }
    
    // Ensure arms use cohort terminology
    if (sampleSize.arms && Array.isArray(sampleSize.arms)) {
      sampleSize.arms = sampleSize.arms.map((arm: any, index: number) => ({
        ...arm,
        id: arm.id && arm.id.startsWith('cohort-') ? arm.id : `cohort-${index + 1}`,
        name: arm.name || (index === 0 ? "Exposed Cohort" : index === 1 ? "Control Cohort" : `Cohort ${index + 1}`)
      }));
    }
    
    // Remove randomization ratio as it doesn't apply to observational studies
    delete sampleSize.randomizationRatio;
  } else {
    // For interventional studies, ensure proper arm terminology
    if (sampleSize.arms && Array.isArray(sampleSize.arms)) {
      sampleSize.arms = sampleSize.arms.map((arm: any, index: number) => ({
        ...arm,
        id: arm.id && arm.id.startsWith('arm-') ? arm.id : `arm-${index + 1}`,
        name: arm.name || (index === 0 ? "Control" : `Treatment ${String.fromCharCode(64 + index)}`)
      }));
    }
  }
  
  return sampleSize;
}

/**
 * Generates AI-powered alternative study designs based on current design
 * @param baseState The current design state to use as a foundation for alternatives
 * @param count The number of alternative designs to generate
 * @returns Array of alternative design states
 */
export async function generateAIAlternativeDesigns(baseState: any, count: number = 3): Promise<any[]> {
  // Extract protocol type
  const protocolType = baseState.protocolType || "interventional_clinical_trial";
  
  // Determine design characteristics for proper context
  const isObservationalStudy = protocolType.includes("observational") || 
                             protocolType.includes("cohort") || 
                             protocolType.includes("secondary_data") || 
                             baseState.studyParameters?.design?.type === "observational";
  
  // List of possible study types for truly varied alternatives
  const studyTypeOptions = [
    "interventional_clinical_trial", 
    "prospective_cohort_study", 
    "retrospective_cohort_study", 
    "secondary_data_analysis",
    "cross_sectional_survey"
  ];
  
  // Extract the primary objective for context
  const primaryObjective = baseState.studyParameters?.outcomes?.primary?.[0]?.description || 
                          "Not explicitly stated in the synopsis";
  
  // Prepare prompt based on protocol type
  let systemPrompt = `You are a clinical research methodology expert with expertise across multiple study designs including interventional trials, observational studies, and real-world evidence approaches.
  
Your task is to generate ${count} FUNDAMENTALLY DIFFERENT alternative study designs that could address the same research objectives.

The current protocol has these characteristics:
- Protocol Type: ${protocolType}
- Study Type: ${isObservationalStudy ? 'Observational' : 'Interventional'}
- Synopsis: ${baseState.synopsis || "Not provided"}
- Primary Research Objective: ${primaryObjective}

CRITICALLY IMPORTANT GUIDELINES:
1. Create RADICALLY DIFFERENT designs that use entirely different methodological approaches
2. Include at least one alternative from a completely different study category (e.g., if original is observational, include an interventional design)
3. Each alternative must have a different protocolType value from this list: ${studyTypeOptions.join(", ")}
4. For each alternative, explicitly set its protocolType field to the appropriate type
5. Each design should have a descriptive label that clearly indicates the fundamental methodology difference
6. Ensure the designs have appropriately different cost implications and feasibility metrics
7. Make each alternative scientifically sound while representing a fundamentally different approach
8. Only include parameters that make sense for each specific study type (e.g., no blinding for observational studies)`;

  try {
    const response = await openai.chat.completions.create({
      model: MODEL,
      messages: [
        { role: "system", content: systemPrompt },
        { 
          role: "user", 
          content: `Current study parameters: ${JSON.stringify(baseState.studyParameters, null, 2)}

Generate ${count} FUNDAMENTALLY DIFFERENT alternative designs for this protocol.
These alternatives should use completely different methodological approaches while addressing the same research objectives.

Each alternative should be a complete design state object with the same structure as the current design but with a different protocol type. Choose from:
- interventional_clinical_trial
- prospective_cohort_study 
- retrospective_cohort_study
- secondary_data_analysis
- cross_sectional_survey

For each alternative:
1. Give it a clear, descriptive label that emphasizes the fundamental methodological difference (e.g., "Retrospective Claims Database Analysis" or "Randomized Controlled Trial with Adaptive Design")
2. Include a different "protocolType" value for each alternative
3. Include complete studyParameters that make sense for the chosen protocol type
4. Include a costImpact object with percentChange (can be positive or negative)
5. Include scientificValue, clinicalRelevance, and feasibilityMetrics with varied scores
6. Make sure each design is scientifically sound but represents a completely different approach

Format your response as a JSON object with an "alternatives" array containing these designs:
{
  "alternatives": [
    {
      "label": "Alternative 1 Name",
      "protocolType": "protocol_type_1",
      "studyParameters": { /* parameters */ },
      "costImpact": { /* impact details */ },
      "scientificValue": { /* metrics */ },
      "clinicalRelevance": { /* metrics */ },
      "feasibilityMetrics": { /* metrics */ }
    },
    {
      "label": "Alternative 2 Name",
      "protocolType": "protocol_type_2",
      /* and so on */
    }
  ]
}

IMPORTANT: Only include fields that make sense for each protocol type (e.g., no blinding for observational studies, add dataSource for secondary analyses).
CRITICAL: The root JSON structure MUST have an "alternatives" array as shown above.`
        }
      ],
      response_format: { type: "json_object" },
      temperature: 0.7,
      max_tokens: 4000,
    });

    // Extract content from the response
    const responseContent = response.choices[0].message.content;
    if (!responseContent) {
      console.error("No content in OpenAI response for alternative designs");
      return [];
    }

    // Parse the response
    const parsedResponse = safeParseJson(responseContent);
    
    // Check for both possible response formats (alternatives or alternativeDesigns)
    if (!parsedResponse) {
      console.error("Invalid response from OpenAI for alternative designs", parsedResponse);
      return [];
    }
    
    // Handle both possible response formats - OpenAI sometimes returns 'alternatives' and other times 'alternativeDesigns'
    let alternatives;
    if (parsedResponse.alternatives && Array.isArray(parsedResponse.alternatives)) {
      alternatives = parsedResponse.alternatives;
    } else if (parsedResponse.alternativeDesigns && Array.isArray(parsedResponse.alternativeDesigns)) {
      alternatives = parsedResponse.alternativeDesigns;
      console.log("Using alternativeDesigns format from OpenAI response");
    } else {
      console.error("Invalid response structure from OpenAI for alternative designs", parsedResponse);
      return [];
    }
    
    // Replace the parsed response with our normalized structure
    parsedResponse.alternatives = alternatives;

    // Process and return the alternatives
    return parsedResponse.alternatives.map((alt: any, index: number) => {
      // Ensure each alternative gets different scoring metrics
      // Generate varied default values for each alternative based on index
      const getVariedDefaultValue = (index: number, metric: string) => {
        // Generate pseudo-random but deterministic variations based on the alternative index
        const baseValues = {
          // Innovation values that increase with alternative complexity
          innovationScore: [0.6, 0.7, 0.8][index] || 0.5,
          knowledgeGapRelevance: [0.5, 0.65, 0.8][index] || 0.5,
          potentialImpact: [0.4, 0.6, 0.7][index] || 0.5,
          evidenceQuality: [0.7, 0.6, 0.5][index] || 0.5,
          
          // Clinical relevance values have a different pattern
          patientCenteredOutcomes: [0.7, 0.5, 0.8][index] || 0.5,
          translationalPotential: [0.5, 0.8, 0.6][index] || 0.5,
          unmetNeedAlignment: [0.6, 0.7, 0.5][index] || 0.5,
          
          // Feasibility metrics - sometimes lower is better
          recruitmentSpeedImpact: [0.8, 0.6, 0.4][index] || 0.5,
          operationalComplexity: [0.4, 0.6, 0.8][index] || 0.5,
          participantBurden: [0.4, 0.5, 0.7][index] || 0.5,
          dataQualityRisk: [0.3, 0.5, 0.7][index] || 0.5,
        };
        
        return baseValues[metric as keyof typeof baseValues] || 0.5;
      };
      
      const defaultScientificValue = {
        innovationScore: getVariedDefaultValue(index, 'innovationScore'),
        knowledgeGapRelevance: getVariedDefaultValue(index, 'knowledgeGapRelevance'),
        potentialImpact: getVariedDefaultValue(index, 'potentialImpact'),
        evidenceQuality: getVariedDefaultValue(index, 'evidenceQuality'),
        innovationRationale: `${["Enhanced", "Novel", "Advanced"][index] || "AI-generated"} approach to design with ${["advanced", "innovative", "pioneering"][index] || "modern"} methodology`,
        knowledgeGapRationale: `Addresses ${["specific", "critical", "fundamental"][index] || "important"} knowledge gaps in this area`,
        potentialImpactRationale: `Could have ${["measurable", "substantial", "transformative"][index] || "significant"} impact on clinical practice`,
      };
      
      const defaultClinicalRelevance = {
        patientCenteredOutcomes: getVariedDefaultValue(index, 'patientCenteredOutcomes'),
        translationalPotential: getVariedDefaultValue(index, 'translationalPotential'),
        unmetNeedAlignment: getVariedDefaultValue(index, 'unmetNeedAlignment'),
        patientCenteredRationale: `${["Incorporates", "Prioritizes", "Centers on"][index] || "Focuses on"} outcomes important to patients`,
        translationalRationale: `${["Directly", "Readily", "Effectively"][index] || "Easily"} translates to real-world clinical settings`,
        unmetNeedRationale: `${["Addresses", "Tackles", "Resolves"][index] || "Targets"} currently unmet clinical needs`
      };
      
      const defaultFeasibilityMetrics = {
        recruitmentSpeedImpact: getVariedDefaultValue(index, 'recruitmentSpeedImpact'),
        operationalComplexity: getVariedDefaultValue(index, 'operationalComplexity'),
        participantBurden: getVariedDefaultValue(index, 'participantBurden'),
        dataQualityRisk: getVariedDefaultValue(index, 'dataQualityRisk')
      };
      
      // Add debugging to see what's coming from the OpenAI response
      console.log(`Alternative ${index} scores from OpenAI:`, {
        innovationScore: alt.scientificValue?.innovationScore,
        knowledgeGapRelevance: alt.scientificValue?.knowledgeGapRelevance,
        potentialImpact: alt.scientificValue?.potentialImpact,
        patientCenteredOutcomes: alt.clinicalRelevance?.patientCenteredOutcomes,
        translationalPotential: alt.clinicalRelevance?.translationalPotential,
        unmetNeedAlignment: alt.clinicalRelevance?.unmetNeedAlignment
      });
      
      // Ensure each alternative has different scores by enforcing our varied default values
      const scientificValue = {
        ...defaultScientificValue,
        // Only use the AI-provided values if they're explicitly defined 
        // Otherwise use our varied defaults
        ...(alt.scientificValue ? {
          innovationScore: alt.scientificValue.innovationScore ?? defaultScientificValue.innovationScore,
          knowledgeGapRelevance: alt.scientificValue.knowledgeGapRelevance ?? defaultScientificValue.knowledgeGapRelevance,
          potentialImpact: alt.scientificValue.potentialImpact ?? defaultScientificValue.potentialImpact,
          evidenceQuality: alt.scientificValue.evidenceQuality ?? defaultScientificValue.evidenceQuality,
          // Add the rationales if provided
          innovationRationale: alt.scientificValue.innovationRationale || defaultScientificValue.innovationRationale,
          knowledgeGapRationale: alt.scientificValue.knowledgeGapRationale || defaultScientificValue.knowledgeGapRationale,
          potentialImpactRationale: alt.scientificValue.potentialImpactRationale || defaultScientificValue.potentialImpactRationale,
        } : {})
      };
      
      const clinicalRelevance = {
        ...defaultClinicalRelevance,
        // Only use the AI-provided values if they're explicitly defined
        ...(alt.clinicalRelevance ? {
          patientCenteredOutcomes: alt.clinicalRelevance.patientCenteredOutcomes ?? defaultClinicalRelevance.patientCenteredOutcomes,
          translationalPotential: alt.clinicalRelevance.translationalPotential ?? defaultClinicalRelevance.translationalPotential,
          unmetNeedAlignment: alt.clinicalRelevance.unmetNeedAlignment ?? defaultClinicalRelevance.unmetNeedAlignment,
          // Add the rationales if provided
          patientCenteredRationale: alt.clinicalRelevance.patientCenteredRationale || defaultClinicalRelevance.patientCenteredRationale,
          translationalRationale: alt.clinicalRelevance.translationalRationale || defaultClinicalRelevance.translationalRationale,
          unmetNeedRationale: alt.clinicalRelevance.unmetNeedRationale || defaultClinicalRelevance.unmetNeedRationale,
        } : {})
      };
      
      const feasibilityMetrics = {
        ...defaultFeasibilityMetrics,
        // Only use the AI-provided values if they're explicitly defined
        ...(alt.feasibilityMetrics ? {
          recruitmentSpeedImpact: alt.feasibilityMetrics.recruitmentSpeedImpact ?? defaultFeasibilityMetrics.recruitmentSpeedImpact,
          operationalComplexity: alt.feasibilityMetrics.operationalComplexity ?? defaultFeasibilityMetrics.operationalComplexity,
          participantBurden: alt.feasibilityMetrics.participantBurden ?? defaultFeasibilityMetrics.participantBurden,
          dataQualityRisk: alt.feasibilityMetrics.dataQualityRisk ?? defaultFeasibilityMetrics.dataQualityRisk,
        } : {})
      };
      
      // Log the final values we're using
      console.log(`Alternative ${index} final scores:`, {
        innovationScore: scientificValue.innovationScore,
        knowledgeGapRelevance: scientificValue.knowledgeGapRelevance,
        potentialImpact: scientificValue.potentialImpact,
        patientCenteredOutcomes: clinicalRelevance.patientCenteredOutcomes,
        translationalPotential: clinicalRelevance.translationalPotential,
        unmetNeedAlignment: clinicalRelevance.unmetNeedAlignment
      });
      
      return {
        ...baseState,
        id: `${baseState.id}-alt-${index + 1}`,
        label: alt.label || `Alternative ${index + 1}`,
        timestamp: new Date(),
        studyParameters: alt.studyParameters || baseState.studyParameters,
        costImpact: alt.costImpact || { percentChange: 0 },
        scientificValue,
        methodologyQuality: alt.methodologyQuality || {},
        clinicalRelevance,
        feasibilityMetrics,
        // Use the alternative's protocol type if provided, otherwise fallback to the base state's type
        protocolType: alt.protocolType || baseState.protocolType
      };
    });
  } catch (error) {
    console.error("Error generating AI alternative designs:", error);
    return [];
  }
}

/**
 * Analyzes a clinical study synopsis to identify missing elements and provide feedback
 */
// Interface for study parameters returned from synopsis analysis
export interface StudyParameters {
  // Common properties for all protocol types
  population: {
    ageRange: {
      min: number;
      max: number;
    };
    gender: "male" | "female" | "both";
    healthStatus: string;
    keyInclusion: string[];
    keyExclusion: string[];
  };
  // Structured outcomes format
  outcomes: {
    primary: {
      name: string;
      description: string;
      timepoint: string;
      // Added measurement details
      measurement?: string;         // How the outcome is measured (e.g., PFS, OS, RECIST)
      method?: string;              // Method of assessment (e.g., CT scan, questionnaire)
      scale?: string;               // Scale used (e.g., Likert scale, FACT-G)
      statisticalApproach?: string; // Statistical approach (e.g., Cox regression)
      // Protocol-specific fields
      instrument?: string;          // For surveys - instrument used 
      dataSource?: string;          // For retrospective studies - source of outcome data
      consensusThreshold?: string;  // For Delphi - threshold for consensus
      consensusProcess?: string;    // For Delphi - process for reaching consensus
    }[];
    secondary?: {
      name: string;
      description: string;
      timepoint: string;
      // Added measurement details
      measurement?: string;
      method?: string;
      scale?: string;
      statisticalApproach?: string;
      // Protocol-specific fields
      instrument?: string;
      dataSource?: string;
      consensusThreshold?: string;
      consensusProcess?: string;
    }[];
  };
  timing: {
    studyDuration: string;
    visitFrequency?: string;
    followUpPeriod?: string;
    dataCutoffs?: string;
    roundDuration?: string; // For Delphi studies
  };
  design: {
    type: string;
    blinding?: string;
    randomization?: string;
    controlType?: string;
    suggestedProtocolType?: string; // The AI-suggested protocol type (which we'll ignore if it differs from user selection)
  };
  
  // Study design information
  studyDesign?: {
    type?: string;
    phase?: string;
    suggestedProtocolType?: string; // We will explicitly ignore this if set by AI
  };
  
  // Optional properties based on protocol type
  // For interventional trials
  intervention?: {
    name: string;
    description: string;
    dosage?: string;
    frequency?: string;
    duration?: string;
    comparator?: string;
  };
  
  // For secondary data analysis
  dataSource?: {
    name: string;
    description: string;
    type: string;
    timeframe: string;
    variables: string[];
  };
  
  // For Delphi consensus studies
  consensusMethod?: {
    name: string;
    rounds: number;
    scoringSystem: string;
    threshold: string;
  };
  
  // For Delphi consensus studies
  expertPanel?: {
    size: number;
    composition: string;
  };
  
  // For cohort studies (both prospective and retrospective)
  exposureAssessment?: {
    method: string;
    frequency: string;
    variables: string[];
  };
  
  // For any study type with statistical considerations
  sampleSize?: {
    total: number;
    approach: "equal_arms" | "ratio_based" | "custom_arms";
    
    // For backward compatibility
    perArm?: number; 
    
    // For ratio-based approach
    randomizationRatio?: string; // "1:1", "2:1:1", etc.
    
    // For custom approach
    arms?: Array<{
      id: string;
      name: string; // "Control", "Treatment A", etc.
      plannedN: number;
      percentage: number; // auto-calculated
    }>;
    
    justification: string;
  };
}

export async function analyzeSynopsis(
  synopsis: string,
  protocolType?: string
): Promise<AnalysisResponse> {
  try {
    // Determine what kind of study we're analyzing
    const isInterventional = !protocolType || protocolType === "interventional_clinical_trial";
    const isObservational = protocolType === "prospective_cohort_study" || protocolType === "retrospective_cohort_study";
    const isSecondaryData = protocolType === "secondary_data_analysis";
    const isDelphi = protocolType === "delphi_consensus";
    const isSurvey = protocolType === "cross_sectional_survey" || protocolType === "qualitative_study";
    const isMAIC = protocolType === "maic";
    
    // Different elements based on protocol type
    let requiredElements = '';
    
    if (isInterventional) {
      requiredElements = `
      A good interventional clinical trial synopsis should include these elements:
      1. Study title and identifier
      2. Study objectives (primary and secondary)
      3. Study design (randomization, blinding, etc.)
      4. Study population (inclusion/exclusion criteria)
      5. Intervention details and dosing
      6. Primary and secondary endpoints
      7. Study duration and timeline
      8. Sample size justification
      9. Statistical analysis plan`;
    } else if (isObservational) {
      requiredElements = `
      A good ${protocolType === "prospective_cohort_study" ? "prospective" : "retrospective"} cohort study synopsis should include these elements:
      1. Study title and identifier
      2. Study objectives (primary and secondary)
      3. Study design (cohort definition, data collection method)
      4. Study population (eligibility criteria)
      5. Exposure/predictor variables and measurement
      6. Outcome measures and assessment methods
      7. Study duration and follow-up timeline
      8. Sample size justification
      9. Statistical analysis approach`;
    } else if (isSecondaryData) {
      requiredElements = `
      A good secondary data analysis/RWE study synopsis should include these elements:
      1. Study title and identifier
      2. Study objectives (primary and secondary)
      3. Data source description and time period
      4. Study population definition (inclusion/exclusion criteria)
      5. Variables of interest and operational definitions
      6. Primary and secondary outcomes with database codes
      7. Study timeframe and lookback periods
      8. Statistical analysis approach
      9. Limitations and bias considerations`;
    } else if (isDelphi) {
      requiredElements = `
      A good Delphi consensus study synopsis should include these elements:
      1. Study title and identifier
      2. Research question/focus area
      3. Expert panel composition and selection criteria
      4. Consensus methodology (number of rounds, scoring system)
      5. Statement/item development process
      6. Consensus definition and thresholds
      7. Timeline and procedure
      8. Analysis plan for consensus measurement
      9. Dissemination strategy

      Note: The synopsis should NOT be evaluated for:
      - Intervention details (not applicable for consensus studies)
      - Randomization or blinding (not applicable for consensus studies)
      - Treatment dosing (not applicable for consensus studies)`;
    } else if (isSurvey) {
      requiredElements = `
      A good ${protocolType === "cross_sectional_survey" ? "cross-sectional survey" : "qualitative study"} synopsis should include these elements:
      1. Study title and identifier
      2. Research question and objectives
      3. Study design and methodology
      4. Target population and sampling approach
      5. Survey instrument/interview guide development
      6. Data collection procedures
      7. Sample size justification
      8. Analysis plan (statistical for surveys, thematic for qualitative)
      9. Timeline and resources
      
      Note: The synopsis should NOT be evaluated for:
      - Intervention details (not applicable for surveys/qualitative studies)
      - Randomization or blinding (not applicable for surveys/qualitative studies)
      - Treatment dosing (not applicable for surveys/qualitative studies)`;
    } else if (isMAIC) {
      requiredElements = `
      A good Matching-Adjusted Indirect Comparison (MAIC) study synopsis should include these elements:
      1. Study title and identifier
      2. Study objectives (primary and secondary)
      3. Source data description (IPD availability, variables)
      4. Target study data (published study details being compared against)
      5. Population alignment criteria (for matching)
      6. Intervention and comparator definitions
      7. Outcome measures (definition and measurement)
      8. Matching algorithm specifications (weighting approach)
      9. Statistical methods (including sensitivity analyses)
      
      Note: The synopsis should NOT be evaluated for:
      - Randomization or blinding (not applicable for MAIC studies)
      - Direct comparison between treatment arms (as MAIC is for indirect comparisons)
      - Traditional inclusion/exclusion criteria (as criteria are used for matching/adjustment)`;
    } else {
      // Default to interventional if unrecognized type
      requiredElements = `
      A good clinical study synopsis should include these elements:
      1. Study title and identifier
      2. Study objectives (primary and secondary)
      3. Study design (randomization, blinding, etc.)
      4. Study population (inclusion/exclusion criteria)
      5. Intervention details
      6. Primary and secondary endpoints
      7. Study duration and timeline
      8. Sample size justification
      9. Statistical analysis plan`;
    }
    
    const prompt = `
      You are an expert ${isInterventional ? "clinical trial protocol" : isObservational ? "observational study" : isSecondaryData ? "real-world evidence" : isDelphi ? "consensus method" : isMAIC ? "Matching-Adjusted Indirect Comparison (MAIC)" : "research"} intake reviewer.

      Analyze the following ${isInterventional ? "clinical study" : isObservational ? "cohort study" : isSecondaryData ? "secondary data analysis" : isDelphi ? "Delphi consensus study" : isMAIC ? "MAIC study" : "research"} synopsis as a SOURCE INTAKE CHECK for protocol development.

      Your job is not to write the protocol. Your job is to produce a decision-ready source assessment that a medical writer can share with the study team before downstream generation.

      IMPORTANT:
      - Focus specifically on the ${isInterventional ? "disease, treatment, products, comparator, and patient population" : isObservational ? "exposure, population, and outcomes" : isSecondaryData ? "data source, variables, and analysis approach" : isDelphi ? "research question, expert panel, and consensus methodology" : isMAIC ? "source data, target study data, and matching algorithm" : "research question, methodology, and population"} mentioned in the synopsis.
      - Do not default to any disease or condition unless it is present in the synopsis.
      - Be concise and decision-oriented.
      - Clearly separate information that is present from information that should be uploaded or entered later.
      - Do not recommend "improve" just because wording could be polished. Recommend improvement only when there is a material clarity, completeness, regulatory, operational, traceability, or consistency issue.
      - When source text is protocol-ready, recommend "use_as_is".
      - When the source does not contain enough information, recommend "generate" only for standard protocol framing that can be safely drafted from known facts, or "needs_source" when a source document or team decision is required.
      - Reason through the study design, objectives, population, intervention/comparator, endpoints, estimands, schedule, safety/drug handling, sample size/statistics, and operational feasibility. Identify contradictions, unsupported assumptions, and source gaps.
      
      ${requiredElements}
      
      For each element, determine if it is:
      - "missing": Not present in the synopsis
      - "partial": Mentioned but lacking important details
      - "complete": Fully described with appropriate details

      Specificity requirements for elements:
      - The "details" field must be actionable. Do not write generic statements such as "detailed inclusion/exclusion criteria are not fully described" or "more detail is needed."
      - For every "partial" or "missing" element, state exactly which domains, decisions, thresholds, or source documents are missing.
      - For study population / inclusion-exclusion criteria, explicitly list the weak or missing eligibility domains that are relevant to this study context. Include examples of draft criteria or bracketed placeholders when the synopsis does not support final wording.
      - If an element is "complete", explain briefly what source facts make it complete.
      
      CRITICAL SCHEDULE OF ACTIVITIES ASSESSMENT CRITERIA:
      ${isInterventional || isObservational ? `
      When evaluating "Schedule of Activities" or any assessment timeline information:
      - "complete": Synopsis contains a comprehensive schedule with ≥4 distinct timepoints, multiple assessment categories (safety, efficacy, biomarkers, etc.), detailed timing for procedures/visits, and proper study phases (screening, baseline, treatment/follow-up)
      - "partial": Synopsis mentions some schedule elements but lacks comprehensive detail (only 2-3 timepoints, limited assessment categories, or missing key study phases)
      - "missing": No schedule information present, or only very basic timeline without specific assessments
      
      DO NOT mark minimal schedule text as "complete". A complete schedule should demonstrate:
      1. Multiple distinct timepoints (not just "baseline and follow-up")
      2. Diverse assessment categories covering study objectives
      3. Specific procedures/assessments with timing details
      4. Proper clinical study phases
      ` : `
      Note: Schedule of Activities assessment is not applicable for ${protocolType} studies.
      `}
      
      SYNOPSIS:
      ${synopsis}
      
      Determine an overall readinessLevel:
      - "ready": source includes enough core facts to start section generation, with only minor gaps
      - "partial": source is usable, but important protocol fields or source documents are missing
      - "insufficient": source is too thin or ambiguous to proceed without major user input

      Extract the most important source facts. For interventional studies, include at least: study title, indication, phase, investigational product(s), comparator/control, population, intervention/dose, primary endpoint, key secondary endpoints, sample size, schedule/timeline, safety/drug handling. For other study types, adapt these labels to the study design.

      Recommend source documents only when they are genuinely useful. Examples: Investigator's Brochure, pharmacy manual, full protocol reference, statistical analysis plan, data specification, CRF/data collection forms, product label, safety management plan.

      For sourceUseRecommendations, cover the major protocol areas that matter for this study. For each area, tell the user what can be copied as-is, what should be improved and why, what may be generated by AI and why, and what cannot be generated safely without additional source input.

      Specificity requirements for sourceUseRecommendations:
      - Do not write generic weaknesses such as "expand exclusion criteria", "add more safety detail", or "clarify statistical methods" unless you also state exactly what should be added or clarified.
      - For every recommendation with recommendedAction "improve", "generate", or "needs_source", include:
        1. "specificWeakPoints": 2-6 concrete weaknesses or missing decision points.
        2. "proposedAdditions": protocol-ready draft bullets or paragraphs that could be inserted, improved, or used as placeholders. Each addition must include draftText, whyNeeded, sourceBasis, and requiresUserConfirmation.
        3. "medicalWriterQuestions": focused questions for the study team when thresholds, rules, documents, or final decisions are not supported by the source.
      - For every recommendation with recommendedAction "use_as_is", include "specificWeakPoints": [] and "proposedAdditions": [] unless a minor caveat is useful.
      - Proposed additions must be study-specific. Use the disease, population, intervention, comparator, endpoints, timing, and design facts from the synopsis. Do not paste generic template text unless you label it as standard protocol framing requiring confirmation.
      - If a proposed addition cannot be safely finalized from the synopsis, still provide a draft placeholder in bracketed form and set requiresUserConfirmation=true.
      - Tie every proposed addition to sourceBasis: "source-supported", "source-inferred", "standard protocol control requiring confirmation", or "requires external source document".
      - For eligibility criteria, never stop at "expand inclusion/exclusion criteria." Identify exact domains that need criteria, such as prior therapy/washout, prohibited concomitant medication, active CNS disease, uncontrolled cardiovascular disease, clinically significant infection, organ-function/laboratory thresholds, concurrent malignancy, hypersensitivity, pregnancy/contraception, QTc or seizure risk, recent surgery/radiation, investigational-product exposure, or disease-specific severity/diagnostic confirmation. Only include domains that are relevant to the study context or clearly mark them as requiring team confirmation.
      - For exclusion criteria specifically, provide draft criterion language for each missing or weak domain. Example style: "Exclude participants with prior exposure to [drug/class] or known hypersensitivity to [product/excipients]." Do not invent numeric thresholds; use bracketed placeholders when the source does not provide them.
      - For safety/drug handling, distinguish what belongs in the protocol from what should come from the Investigator's Brochure, pharmacy manual, product label, safety management plan, contraception guidance, or dose-modification guidance.

      For studyLogicAssessment, assess whether the source information is clinically and operationally coherent, not only whether fields are present.

      Respond with JSON in this format:
      {
        "assessment": "Brief source-readiness summary in 1-3 sentences",
        "readinessLevel": "ready|partial|insufficient",
        "extractedFields": [
          { "label": "Study title", "value": "extracted value or Not found", "status": "found|missing|unclear" },
          { "label": "Indication", "value": "extracted value or Not found", "status": "found|missing|unclear" }
        ],
        "elements": [
          {
            "element": "Study title and identifier",
            "status": "missing|partial|complete",
            "details": "Specific explanation. If partial/missing, name exact missing domains and practical additions or questions; if complete, state the source facts that support completeness."
          },
          {
            "element": "Study objectives (primary and secondary)",
            "status": "missing|partial|complete",
            "details": "Specific explanation. If partial/missing, name exact missing domains and practical additions or questions; if complete, state the source facts that support completeness."
          },
          ...and so on for each element
        ],
        "missingElements": ["important missing or weak protocol inputs"],
        "sourceDocumentsNeeded": ["documents the user should consider uploading, only if needed"],
        "sourceUseRecommendations": [
          {
            "protocolArea": "Study title",
            "sourceStatus": "present|partial|missing|unclear",
            "recommendedAction": "use_as_is|improve|generate|needs_source",
            "why": "Why this action is recommended, tied to source quality or protocol risk",
            "proposedHandling": "How the app/user should handle this area during generation",
            "sourceEvidence": "Short source phrase or summary supporting the recommendation",
            "specificWeakPoints": ["Concrete weak point or missing decision point. Empty array if none."],
            "proposedAdditions": [
              {
                "draftText": "Protocol-ready proposed text, criterion, or bracketed placeholder.",
                "whyNeeded": "Why this text is needed for protocol quality, operations, or regulatory review.",
                "sourceBasis": "source-supported|source-inferred|standard protocol control requiring confirmation|requires external source document",
                "requiresUserConfirmation": true
              }
            ],
            "medicalWriterQuestions": ["Focused question for the study team or source owner. Empty array if none."]
          }
        ],
        "studyLogicAssessment": [
          {
            "area": "Objectives and endpoints",
            "conclusion": "Clear conclusion",
            "reasoning": "Clinical/design reasoning, not just presence/absence",
            "riskLevel": "low|medium|high",
            "recommendedFollowUp": "Team question, source needed, or no action needed"
          }
        ],
        "assumptionsRequiringReview": ["specific assumptions or team decisions that should be discussed before final protocol generation"],
        "nextSteps": ["short next steps for the user before moving to downstream tabs"]
      }
    `;

    // Create protocol-specific system prompts
    let systemPrompt = "";
    if (isInterventional) {
      systemPrompt = "You are a clinical trial protocol expert who specializes in interventional study design and regulatory requirements.";
    } else if (isObservational) {
      systemPrompt = "You are an epidemiology expert who specializes in observational study design and bias minimization strategies.";
    } else if (isSecondaryData) {
      systemPrompt = "You are a real-world evidence expert who specializes in secondary data analysis, database research, and observational methodology.";
    } else if (isDelphi) {
      systemPrompt = "You are a consensus methodology expert who specializes in Delphi techniques, expert panel management, and statement development.";
    } else if (isSurvey) {
      systemPrompt = "You are a survey research expert who specializes in questionnaire design, sampling methodology, and cross-sectional studies.";
    } else if (isMAIC) {
      systemPrompt = "You are a Matching-Adjusted Indirect Comparison (MAIC) expert who specializes in indirect treatment comparisons, statistical matching, and population adjustment techniques.";
    } else {
      systemPrompt = "You are a clinical protocol expert assistant.";
    }

    const response = await openai.chat.completions.create({
      model: MODEL,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: prompt },
      ],
      response_format: { type: "json_object" },
      temperature: 0.3,
    });

    const result = safeParseJson(response.choices[0].message.content);
    return result as AnalysisResponse;
  } catch (error) {
    console.error("Error analyzing synopsis:", error);
    throw new Error("Failed to analyze synopsis");
  }
}

/**
 * Creates a clean prompt template for interventional clinical trials
 */
function createInterventionalPrompt(synopsis: string): string {
  return `
    You are an expert clinical trial protocol developer.
    
    Extract specific study parameters from the following clinical study synopsis.
    Focus ONLY on information that is explicitly stated in the text.
    Pay special attention to disease-specific details like:
    
    1. If it's a cancer study, identify the type of cancer precisely (e.g., prostate cancer, NSCLC, etc.)
    2. If it mentions specific drugs or treatments, capture the exact drug names and dosages
    3. If it mentions a specific population (age restrictions, gender-specific conditions)
    4. Note any phase information (Phase 1, Phase 2, Phase 3, etc.)
    
    SYNOPSIS:
    ${synopsis}
    
    Extract and return the following parameters in a structured JSON format:
    
    1. Population details:
       - Age range (minimum and maximum age in years)
       - Gender (male, female, or both)
       - Health status or disease condition (be specific about the condition, stage, prior therapies)
       - 2-5 key inclusion criteria (prioritize those related to disease characteristics)
       - 2-5 key exclusion criteria (prioritize clinically significant exclusions)
    
    2. Intervention details:
       - Drug/intervention name (be specific, use the exact name from the synopsis e.g., "Apalutamide" not "Study Drug")
       - Brief description (mechanism of action, class of drug if mentioned)
       - Dosage (if specified)
       - Comparator (if applicable, be specific about placebo or active comparator)
    
    3. Study design details:
       - Type (e.g., randomized, open-label, etc.)
       - Blinding (double-blind, single-blind, open-label)
       - Phase (Phase 1, 2, 3, 4)
       - Number of arms and randomization ratio if specified
    
    4. Sample size details (ENHANCED EXTRACTION):
       - Total planned enrollment number
       - Look for randomization ratios (e.g., "2:1 randomization", "1:1:1", "equal randomization")
       - Look for arm-specific numbers (e.g., "Control: 150 patients, Treatment: 75 patients")
       - Identify arm names/descriptions from the synopsis (e.g., "Control", "Treatment A", "Placebo")
       - Note any unequal allocation rationale
       - Extract sample size justification or power calculation details
    
    5. Timing details:
       - Study duration (total duration and treatment duration if different)
       - Visit frequency (how often participants are seen)
    
    6. Outcome details:
       - Primary endpoint (be specific about the exact endpoint measurement, e.g., PFS, OS, etc.)
       - How the primary outcome is measured (measurement method, e.g., CT scan, questionnaire)
       - Scale or instrument used for measurement (if applicable, e.g., RECIST, Likert scale)
       - Statistical approach for analysis (e.g., Cox regression, logistic regression)
       - 2-3 secondary endpoints (list the most important ones)
       - Key timepoint for assessment
    
    IMPORTANT INSTRUCTIONS:
    1. For gender, if the condition is gender-specific (e.g., prostate cancer = male only, ovarian cancer = female only), specify that gender
    2. For cancer studies, include cancer type, stage, and prior treatment requirements in health status
    3. Use the exact drug names mentioned in the synopsis, not generic terms like "Study Drug"
    4. If information for any field is not explicitly provided, use "Not specified in synopsis" rather than making assumptions
    
    Respond with JSON exactly in this format:
    {
      "population": {
        "ageRange": {
          "min": 18,
          "max": 75
        },
        "gender": "both",
        "healthStatus": "string describing condition",
        "keyInclusion": ["criterion 1", "criterion 2", "criterion 3", "criterion 4", "criterion 5"],
        "keyExclusion": ["criterion 1", "criterion 2", "criterion 3", "criterion 4", "criterion 5"]
      },
      "intervention": {
        "name": "specific drug/intervention name",
        "description": "brief description",
        "dosage": "dosage information if available",
        "comparator": "comparator if applicable"
      },
      "design": {
        "type": "study design type",
        "blinding": "blinding approach",
        "phase": "study phase",
        "arms": 2,
        "ratio": "randomization ratio"
      },
      "sampleSize": {
        "total": 100,
        "approach": "equal_arms",
        "perArm": 50,
        "randomizationRatio": "1:1",
        "arms": [
          {
            "id": "arm-1",
            "name": "Control",
            "plannedN": 50,
            "percentage": 50
          },
          {
            "id": "arm-2", 
            "name": "Treatment A",
            "plannedN": 50,
            "percentage": 50
          }
        ],
        "justification": "sample size justification text"
      },
      "timing": {
        "studyDuration": "duration of study",
        "visitFrequency": "frequency of visits"
      },
      "outcome": {
        "primaryEndpoint": "primary endpoint description",
        "measurement": "how the outcome is measured (e.g., PFS, OS, RECIST)",
        "method": "method of assessment (e.g., CT scan, questionnaire)",
        "scale": "scale or instrument used (if applicable)",
        "statisticalApproach": "statistical approach for analysis",
        "secondaryEndpoints": ["endpoint 1", "endpoint 2", "endpoint 3"],
        "timepoint": "assessment timepoint"
      }
    }
  `;
}

/**
 * Creates a clean prompt template for observational cohort studies
 */
function createObservationalPrompt(synopsis: string, protocolType: string): string {
  const studyTypeLabel = protocolType === "prospective_cohort_study" ? "prospective cohort study" : "retrospective cohort study";
  
  return `
    You are an expert in observational study methodology and ${studyTypeLabel} design.
    
    Extract specific study parameters from the following ${studyTypeLabel} synopsis.
    Focus ONLY on information that is explicitly stated in the text.
    Pay special attention to:
    
    1. If it's a disease-specific study, identify the condition precisely
    2. If it mentions specific exposures or risk factors, capture them exactly
    3. If it mentions a specific population (age restrictions, gender-specific conditions)
    4. Note the observational design and data collection approach
    
    SYNOPSIS:
    ${synopsis}
    
    Extract and return the following parameters in a structured JSON format:
    
    1. Population details:
       - Age range (minimum and maximum age in years)
       - Gender (male, female, or both)
       - Health status or disease condition (be specific about the condition)
       - 2-5 key inclusion criteria for cohort membership
       - 2-5 key exclusion criteria for cohort membership
    
    2. Exposure/Risk Factor details:
       - Primary exposure or risk factor being studied
       - How exposure is measured or defined
       - Control or comparison group definition
    
    3. Study design details:
       - Type of cohort study (prospective vs retrospective)
       - Data collection method
       - Follow-up approach and duration
       - Number of cohorts being compared
    
    4. Sample size details:
       - Total planned enrollment number
       - Look for cohort-specific numbers (e.g., "Exposed cohort: 150 patients, Control cohort: 75 patients")
       - Identify cohort names/descriptions from the synopsis (e.g., "Exposed", "Unexposed", "Control Cohort")
       - Note any sampling strategy or allocation rationale
       - Extract sample size justification or power calculation details
    
    5. Timing details:
       - Study duration (total follow-up period)
       - Data collection frequency (how often participants are assessed)
    
    6. Outcome details:
       - Primary outcome or endpoint being measured
       - How the primary outcome is measured (measurement method)
       - Scale or instrument used for measurement (if applicable)
       - Statistical approach for analysis (e.g., Cox regression, logistic regression)
       - 2-3 secondary outcomes (list the most important ones)
       - Key timepoints for assessment
    
    IMPORTANT INSTRUCTIONS:
    1. This is an observational study - do NOT include randomization, blinding, or intervention details
    2. Focus on exposure assessment and outcome measurement methods
    3. Use cohort terminology rather than treatment arm terminology
    4. If information for any field is not explicitly provided, use "Not specified in synopsis" rather than making assumptions
    
    Respond with JSON exactly in this format:
    {
      "population": {
        "ageRange": {
          "min": 18,
          "max": 75
        },
        "gender": "both",
        "healthStatus": "string describing condition or population",
        "keyInclusion": ["criterion 1", "criterion 2", "criterion 3", "criterion 4", "criterion 5"],
        "keyExclusion": ["criterion 1", "criterion 2", "criterion 3", "criterion 4", "criterion 5"]
      },
      "exposureAssessment": {
        "method": "how exposure is measured",
        "frequency": "frequency of assessment",
        "variables": ["exposure variable 1", "exposure variable 2", "exposure variable 3"]
      },
      "design": {
        "type": "observational",
        "cohortType": "${studyTypeLabel}",
        "followUpDuration": "duration of follow-up",
        "dataCollection": "data collection approach"
      },
      "sampleSize": {
        "total": 200,
        "approach": "equal_arms",
        "perArm": 100,
        "arms": [
          {
            "id": "cohort-1",
            "name": "Exposed Cohort",
            "plannedN": 100,
            "percentage": 50
          },
          {
            "id": "cohort-2",
            "name": "Control Cohort", 
            "plannedN": 100,
            "percentage": 50
          }
        ],
        "justification": "sample size justification text"
      },
      "timing": {
        "studyDuration": "duration of study",
        "followUpPeriod": "follow-up period",
        "visitFrequency": "frequency of assessments"
      },
      "outcome": {
        "primaryEndpoint": "primary outcome description",
        "measurement": "how the outcome is measured",
        "method": "method of assessment",
        "scale": "scale or instrument used (if applicable)",
        "statisticalApproach": "statistical approach for analysis",
        "secondaryEndpoints": ["outcome 1", "outcome 2", "outcome 3"],
        "timepoint": "assessment timepoint"
      }
    }
  `;
}

/**
 * Extracts specific study parameters from the synopsis for design state generation
 */
export async function extractStudyParameters(
  synopsis: string,
  protocolType?: string
): Promise<StudyParameters> {
  // Ensure we have a valid protocol type
  const effectiveProtocolType = protocolType || 'interventional_clinical_trial';
  try {
    // Different prompts based on protocol type
    let prompt;
    
    // Determine which fields to extract based on protocol type
    if (protocolType === "secondary_data_analysis" || protocolType === "retrospective_cohort_study") {
      prompt = `
        You are an expert in Real-World Evidence (RWE) and secondary data analysis studies.
        
        Extract specific study parameters from the following study synopsis for a ${protocolType === "secondary_data_analysis" ? "Secondary Data Analysis/RWE Study" : "Retrospective Cohort Study"}.
        Focus ONLY on information that is explicitly stated in the text.
        Pay special attention to details like:
        
        1. Data source details (what database or registry is being used)
        2. Time period for the data
        3. Target population specifics (disease, conditions, demographics)
        4. Specific covariates, confounders, or variables mentioned
        
        SYNOPSIS:
        ${synopsis}
        
        Extract and return the following parameters in a structured JSON format:
        
        1. Population details:
           - Age range (minimum and maximum age in years)
           - Gender (male, female, or both)
           - Health status or disease condition (be specific about the condition)
           - 2-5 key inclusion criteria for database records to be included
           - 2-5 key exclusion criteria for database records to be excluded
        
        2. Data source details:
           - Name of database/registry (be specific)
           - Type of data source (EMR, claims, registry, etc.)
           - Time period for data extraction
           - Geographic scope
        
        3. Study design details:
           - Type of analysis (e.g., matched cohort, case-control, etc.)
           - Primary variables of interest 
           - Study period (retrospective timeframe)
        
        4. Analysis details:
           - Primary statistical approach
           - Key adjustment variables or confounders
        
        5. Outcome details:
           - Primary outcome or endpoint (be specific about what is being measured)
           - How the outcome is measured (measurement tools, methods, or metrics e.g., data fields, codes)
           - Assessment methods used to extract the outcome data
           - 2-3 secondary outcomes or endpoints
           - Key timepoints for assessment
           - Data source for outcome variables
           - Statistical approach for analyzing outcomes
        
        IMPORTANT INSTRUCTIONS:
        1. Focus on data-specific parameters rather than interventional trial concepts
        2. Do not include blinding or randomization details as these don't apply to database studies
        3. If information for any field is not explicitly provided, use "Not specified in synopsis" rather than making assumptions
        
        Respond with JSON in this format:
        {
          "population": {
            "ageRange": {
              "min": number,
              "max": number
            },
            "gender": "male" | "female" | "both",
            "healthStatus": "string describing condition",
            "keyInclusion": ["criterion 1", "criterion 2", "criterion 3", "criterion 4", "criterion 5"],
            "keyExclusion": ["criterion 1", "criterion 2", "criterion 3", "criterion 4", "criterion 5"]
          },
          "dataSource": {
            "name": "database or registry name",
            "type": "type of data source",
            "timePeriod": "data extraction period",
            "geographicScope": "geographic coverage of data"
          },
          "design": {
            "type": "study design type",
            "primaryVariables": ["variable 1", "variable 2"],
            "studyPeriod": "retrospective study period",
            "analyticalApproach": "statistical approach"
          },
          "timing": {
            "studyDuration": "duration of data analysis",
            "dataCutoffs": "key timepoints for data extraction"
          },
          "outcome": {
            "primaryEndpoint": "primary outcome description",
            "secondaryEndpoints": ["outcome 1", "outcome 2", "outcome 3"],
            "adjustmentFactors": ["factor 1", "factor 2", "factor 3"]
          }
        }
      `;
    } else if (protocolType === "delphi_consensus") {
      prompt = `
        You are an expert in Delphi consensus methodology.
        
        Extract specific study parameters from the following synopsis for a Delphi consensus study.
        Focus ONLY on information that is explicitly stated in the text.
        Pay special attention to details like:
        
        1. Expert panel composition and selection criteria
        2. Consensus methodology (number of rounds, scoring systems)
        3. Statement development and consensus thresholds
        4. Clinical area of focus for the consensus
        
        SYNOPSIS:
        ${synopsis}
        
        Extract and return the following parameters in a structured JSON format:
        
        1. Expert panel details:
           - Size of panel (number of experts)
           - Composition (specialties or expertise required)
           - Selection criteria (years of experience, qualifications)
           - Geographic scope (local, national, international)
        
        2. Consensus method details:
           - Method type (e.g., Modified Delphi, RAND/UCLA, etc.)
           - Number of rounds
           - Scoring system (e.g., 9-point Likert scale)
           - Consensus threshold (e.g., ≥7 by ≥70% of participants)
        
        3. Focus area details:
           - Clinical condition or topic
           - Key domains for consensus
           - Target patient population
        
        4. Process details:
           - Timeline for rounds
           - Feedback mechanisms between rounds
           - Analysis approach for consensus measurement
           
        5. Output details:
           - Intended deliverables (guidelines, recommendations, etc.)
           - Implementation plans
           - Dissemination strategy
        
        IMPORTANT INSTRUCTIONS:
        1. Focus on consensus methodology parameters rather than interventional trial concepts
        2. Do NOT include any blinding, randomization, or intervention arms as these DON'T APPLY to Delphi consensus studies
        3. If information for any field is not explicitly provided, use "Not specified in synopsis" rather than making assumptions
        
        Respond with JSON in this format:
        {
          "population": {
            "ageRange": {
              "min": 0,
              "max": 0
            },
            "gender": "both",
            "healthStatus": "string describing clinical focus area",
            "keyInclusion": ["expert criterion 1", "expert criterion 2", "expert criterion 3"],
            "keyExclusion": ["expert exclusion 1", "expert exclusion 2"]
          },
          "expertPanel": {
            "size": number,
            "composition": "panel composition description",
            "selectionCriteria": ["criterion 1", "criterion 2", "criterion 3"],
            "geographicScope": "geographic scope of experts"
          },
          "consensusMethod": {
            "name": "specific methodology name",
            "rounds": number,
            "scoringSystem": "scoring system description",
            "threshold": "consensus threshold description"
          },
          "design": {
            "type": "consensus",
            "domains": ["domain area 1", "domain area 2", "domain area 3"],
            "timeline": "study timeline description"
          },
          "timing": {
            "studyDuration": "duration of consensus process",
            "roundIntervals": "time between rounds"
          },
          "output": {
            "primaryDeliverable": "main consensus output",
            "secondaryDeliverables": ["output 1", "output 2", "output 3"],
            "disseminationPlan": "publication or distribution plan"
          }
        }
      `;
    } else if (protocolType === "prospective_cohort_study" || protocolType === "retrospective_cohort_study") {
      // Use the clean observational prompt
      prompt = createObservationalPrompt(synopsis, protocolType);
    } else {
      // Use the clean interventional prompt for all other study types
      prompt = createInterventionalPrompt(synopsis);
    }

    const response = await openai.chat.completions.create({
      model: MODEL,
      messages: [
        { 
          role: "system", 
          content: "You are a clinical protocol expert assistant specialized in extracting structured parameters from clinical trial synopses. You're extremely thorough and never miss disease-specific details." 
        },
        { role: "user", content: prompt },
      ],
      response_format: { type: "json_object" },
      temperature: 0.1, // Lower temperature for more precise extraction
    });

    const result = safeParseJson(response.choices[0].message.content);
    
    // If we have a protocol type specified, make sure it's not overridden by the AI
    if (effectiveProtocolType && result.studyDesign && result.studyDesign.suggestedProtocolType) {
      console.log(`Preserving user-selected protocol type: ${effectiveProtocolType}, AI suggested: ${result.studyDesign.suggestedProtocolType}`);
      delete result.studyDesign.suggestedProtocolType;
    }
    
    // Transform the old format to match our new interface if needed
    if (result && result.outcome && !result.outcomes) {
      const transformedResult: StudyParameters = {
        ...result,
        outcomes: {
          primary: [{
            name: result.outcome.primaryEndpoint,
            description: "Primary study endpoint",
            timepoint: result.outcome.timepoint || "End of study",
            // Add measurement information if available
            measurement: result.outcome.measurement || result.outcome.primaryMeasurement || null,
            method: result.outcome.assessmentMethod || result.outcome.method || null,
            scale: result.outcome.scale || null,
            statisticalApproach: result.outcome.statisticalApproach || result.outcome.analysisMethod || null
          }],
          secondary: result.outcome.secondaryEndpoints ? 
            result.outcome.secondaryEndpoints.map((endpoint: string) => ({
              name: endpoint,
              description: "Secondary study endpoint",
              timepoint: result.outcome.timepoint || "End of study",
              // Add measurement information if available
              measurement: result.outcome.secondaryMeasurement || null,
              method: result.outcome.assessmentMethod || null,
              scale: result.outcome.scale || null
            })) : []
        }
      };
      
      // Delete the old outcome property using type casting to avoid TypeScript errors
      delete (transformedResult as any).outcome;
      
      // Apply ratio parsing to sample size if present
      if (transformedResult.sampleSize) {
        transformedResult.sampleSize = parseRandomizationRatio(transformedResult.sampleSize);
        // Normalize sample size for protocol type-specific terminology and approaches
        transformedResult.sampleSize = normalizeSampleSize(transformedResult.sampleSize, effectiveProtocolType);
      }
      
      return transformedResult;
    }
    
    // Apply ratio parsing to sample size if present in the main result path
    if (result.sampleSize) {
      result.sampleSize = parseRandomizationRatio(result.sampleSize);
      // Normalize sample size for protocol type-specific terminology and approaches
      result.sampleSize = normalizeSampleSize(result.sampleSize, effectiveProtocolType);
    }
    
    return result as StudyParameters;
  } catch (error) {
    console.error("Error extracting study parameters:", error);
    // Return default parameters if extraction fails that match our new interface
    return {
      population: {
        ageRange: { min: 18, max: 75 },
        gender: "both",
        healthStatus: "Not specified",
        keyInclusion: ["Age ≥ 18 years", "Provides written informed consent"],
        keyExclusion: ["Prior participation in this study", "Pregnancy or breastfeeding"]
      },
      outcomes: {
        primary: [{
          name: "Primary Endpoint",
          description: "Main study outcome measure",
          timepoint: "Study completion"
        }],
        secondary: [
          {
            name: "Secondary Endpoint 1",
            description: "Additional outcome measure",
            timepoint: "Study completion"
          },
          {
            name: "Secondary Endpoint 2",
            description: "Additional outcome measure",
            timepoint: "Study completion"
          }
        ]
      },
      design: {
        type: "Randomized",
        blinding: "Double-Blind"
      },
      timing: {
        studyDuration: "12 months",
        visitFrequency: "Every 4 weeks"
      }
    };
  }
}

/**
 * Generates a Schedule of Activities based on the synopsis
 */
function normalizeScheduleLabel(value: string) {
  return String(value || "")
    .toLowerCase()
    .replace(/[-–—_/]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractScheduleSourceRequirements(sourceText: string) {
  const text = String(sourceText || "");
  const requirements = [
    {
      id: "treatmentPhase",
      label: "Treatment Phase",
      pattern: /\btreatment\s+phase\b/i,
      aliases: [/treatment\s+phase/i],
    },
    {
      id: "crossover",
      label: "Crossover Eligibility Phase",
      pattern: /crossover\s+eligibility\s+phase/i,
      aliases: [/crossover/i],
    },
    {
      id: "openLabel",
      label: "Open-Label Treatment Phase",
      pattern: /open[- ]label\s+treatment\s+phase/i,
      aliases: [/open[- ]label/i, /treatment\s+phase/i],
    },
    {
      id: "openLabelExtension",
      label: "Open-Label Extension Phase",
      pattern: /open[- ]label\s+extension\s+phase/i,
      aliases: [/open[- ]label\s+extension/i],
    },
    {
      id: "openLabelNoCrossover",
      label: "Open-Label Treatment Phase - Subjects not requiring cross-over and receiving apalutamide",
      pattern: /subjects\s+not\s+requiring\s+cross[- ]over\s+and\s+were\s+receiving\s+apalutamide/i,
      aliases: [/not\s+requiring\s+cross/i, /receiving\s+apalutamide/i],
    },
    {
      id: "openLabelCrossover",
      label: "Open-Label Treatment Phase - Subjects crossing over from placebo to apalutamide",
      pattern: /subjects\s+crossing\s+over\s+from\s+placebo\s+to\s+apalutamide/i,
      aliases: [/crossing\s+over\s+from\s+placebo/i],
    },
    {
      id: "eot",
      label: "EOT",
      pattern: /\bEOT\b|end[- ]of[- ]treatment/i,
      aliases: [/\bEOT\b/i, /end[- ]of[- ]treatment/i],
    },
    {
      id: "followUp",
      label: "Follow-up Phase",
      pattern: /follow[- ]up\s+phase/i,
      aliases: [/follow[- ]up/i],
    },
  ];

  return requirements
    .filter((requirement) => requirement.pattern.test(text))
    .map((requirement) => ({ id: requirement.id, label: requirement.label, aliases: requirement.aliases }));
}

function validateScheduleSourceCoverage(result: any, sourceRequirements: ReturnType<typeof extractScheduleSourceRequirements>) {
  const headers = Array.isArray(result?.tableHeaders)
    ? result.tableHeaders.map((header: any) => normalizeScheduleLabel(typeof header === "string" ? header : header?.label || header?.name || ""))
    : [];
  const headerText = headers.join(" | ");
  const missing = sourceRequirements.filter((requirement) =>
    !requirement.aliases.some((alias) => alias.test(headerText))
  );
  return {
    passed: missing.length === 0,
    missingHeaders: missing.map((item) => item.label),
  };
}

async function createScheduleJsonCompletion(messages: Array<{ role: "system" | "user"; content: string }>, temperature = 0.3) {
  const models = Array.from(new Set([SCHEDULE_MODEL, MODEL].filter(Boolean)));
  let lastError: any = null;

  for (const model of models) {
    for (let attempt = 1; attempt <= 2; attempt += 1) {
      try {
        return await openai.chat.completions.create({
          model,
          messages,
          response_format: { type: "json_object" },
          temperature,
        });
      } catch (error) {
        lastError = error;
        console.warn(`Schedule completion failed with model ${model} attempt ${attempt}; retrying if possible.`, error);
      }
    }
  }

  throw lastError || new Error("Schedule completion failed");
}

async function createCriteriaJsonCompletion(messages: Array<{ role: "system" | "user"; content: string }>, temperature = 0.3) {
  let lastError: any = null;

  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      return await openai.chat.completions.create({
        model: MODEL,
        messages,
        response_format: { type: "json_object" },
        temperature,
      });
    } catch (error) {
      lastError = error;
      console.warn(`Eligibility criteria completion failed with model ${MODEL} attempt ${attempt}; retrying if possible.`, error);
    }
  }

  throw lastError || new Error("Eligibility criteria completion failed");
}

function buildFallbackGeneratedSchedule(synopsis: string, contentStrategy: string): ProtocolComponent {
  const lowerSynopsis = String(synopsis || "").toLowerCase();
  const isOncology = /cancer|tumou?r|oncolog|carcinoma|lymphoma|leukemia|melanoma|metastatic|prostate|breast|lung|nsclc/i.test(lowerSynopsis);
  const hasPK = /\bpk\b|pharmacokinetic|concentration|exposure/i.test(lowerSynopsis);
  const hasBiomarker = /biomarker|genomic|mutation|ctdna|pcr|immunogenicity|antibody/i.test(lowerSynopsis);
  const headers = [
    "Screening",
    "Baseline / Day 1",
    "Early treatment visit",
    "Regular treatment visits",
    isOncology ? "Tumor assessment visits" : "Primary endpoint assessment",
    "End of Treatment",
    "Safety Follow-up",
  ];
  const values = {
    screeningBaselineTreatmentFollowup: ["X", "X", "X", "X", "", "X", "X"],
    baselineTreatmentFollowup: ["", "X", "X", "X", "", "X", "X"],
    treatmentOnly: ["", "", "X", "X", "", "", ""],
    endpoint: ["", "X", "", "", "X", "X", ""],
    followup: ["", "", "", "", "", "X", "X"],
  };

  const tableData: Record<string, any[]> = {
    "Administrative and Eligibility": [
      { assessment: "Informed consent", values: ["X", "", "", "", "", "", ""], origin: "generated" },
      { assessment: "Eligibility confirmation", values: ["X", "X", "", "", "", "", ""], origin: "generated" },
      { assessment: "Demographics and medical history", values: ["X", "", "", "", "", "", ""], origin: "generated" },
      { assessment: "Concomitant medications", values: values.screeningBaselineTreatmentFollowup, origin: "generated" },
    ],
    "Safety Assessments": [
      { assessment: "Adverse event review", values: values.screeningBaselineTreatmentFollowup, origin: "generated" },
      { assessment: "Physical examination", values: ["X", "X", "", "X", "", "X", ""], origin: "generated" },
      { assessment: "Vital signs", values: values.baselineTreatmentFollowup, origin: "generated" },
      { assessment: "Clinical laboratory assessments", values: values.screeningBaselineTreatmentFollowup, origin: "generated" },
      { assessment: "ECG", values: ["X", "X", "", "X", "", "X", ""], origin: "generated" },
    ],
    "Treatment and Accountability": [
      { assessment: "Study intervention administration / dispensing", values: values.treatmentOnly, origin: "generated" },
      { assessment: "Treatment compliance and accountability", values: ["", "", "X", "X", "", "X", ""], origin: "generated" },
    ],
    "Efficacy / Endpoint Assessments": [
      {
        assessment: isOncology ? "Disease / tumor assessment" : "Primary endpoint assessment",
        values: values.endpoint,
        origin: "generated",
      },
      { assessment: "Secondary endpoint assessments", values: values.endpoint, origin: "generated" },
    ],
  };

  if (hasPK) {
    tableData["PK / PD Assessments"] = [
      { assessment: "PK sample collection", values: ["", "X", "X", "X", "", "", ""], origin: "generated" },
    ];
  }
  if (hasBiomarker) {
    tableData["Biomarker Assessments"] = [
      { assessment: "Biomarker sample collection", values: ["X", "X", "", "X", "X", "", ""], origin: "generated" },
    ];
  }

  return {
    tableHeaders: headers,
    headerOrigins: headers.map(() => "generated"),
    tableData,
    explanation: "OpenAI schedule generation was unavailable, so the app created a conservative draft Schedule of Activities from the study synopsis. Review and adjust all visit windows, assessment timing, and procedure details before finalizing.",
    sourceStatus: contentStrategy === "preserve" ? "not_found" : "not_found",
    sourceStatusMessage: "No structured source SoA table was available; fallback draft generated from the synopsis.",
    removedItems: [],
    qualityCheck: {
      sourcePhaseCoverage: {
        passed: true,
        missingHeaders: [],
      },
      fallbackGenerated: true,
    },
  } as ProtocolComponent;
}

export async function generateScheduleOfActivities(
  synopsis: string,
  supplementaryInfo?: string[],
  alignmentAnalysis?: any,
  contentStrategyOverride?: string
): Promise<ProtocolComponent> {
  try {
    // Determine content strategy based on alignment analysis
    let contentStrategy = 'generate';
    let existingContentContext = '';
    
    if (contentStrategyOverride === "preserve" || contentStrategyOverride === "augment" || contentStrategyOverride === "generate") {
      contentStrategy = contentStrategyOverride;
      existingContentContext = `
        USER SELECTED CONTENT STRATEGY: ${contentStrategy.toUpperCase()}
      `;
    } else if (alignmentAnalysis?.alignmentAnalysis?.scheduleOfAssessments) {
      const scheduleStatus = alignmentAnalysis.alignmentAnalysis.scheduleOfAssessments.status;
      const scheduleDetails = alignmentAnalysis.alignmentAnalysis.scheduleOfAssessments.details;
      
      if (scheduleStatus === 'aligned' || scheduleStatus === 'well_defined') {
        contentStrategy = 'preserve';
      } else if (scheduleStatus === 'partial' || scheduleStatus === 'partially_aligned') {
        contentStrategy = 'augment';
      } else {
        contentStrategy = 'generate';
      }
      
      existingContentContext = `
        SCHEDULE ALIGNMENT ANALYSIS:
        - Status: ${scheduleStatus}
        - Details: ${scheduleDetails}
        - Content Strategy: ${contentStrategy.toUpperCase()}
      `;
    }

    const supplementaryText = supplementaryInfo && supplementaryInfo.length > 0 ? supplementaryInfo.join('\n') : '';
    const sourceRequirements = extractScheduleSourceRequirements(`${synopsis}\n${supplementaryText}`);
    const sourceRequirementText = sourceRequirements.length > 0 ? `
      SOURCE SOA STRUCTURE DETECTED:
      The source documents appear to contain these SoA phase/header labels:
      ${sourceRequirements.map((requirement) => `- ${requirement.label}`).join('\n')}

      You must preserve these source phase/header labels in the output. If the app's SoA data model cannot represent nested table headers directly, flatten them into descriptive tableHeaders such as:
      "Open-Label Treatment Phase - Subjects crossing over from placebo to apalutamide - D1 of C1 to C7, then D1 of q2 cycles to C13, then D1 of q4 cycles until EOT".
      Do not drop parent phase labels such as Treatment Phase, Crossover Eligibility Phase, EOT, or Follow-up Phase.
    ` : '';

    const prompt = `
      You are an expert clinical trial protocol developer with advanced content analysis capabilities.
      
      ${existingContentContext}
      
      CRITICAL INSTRUCTIONS - CONTENT STRATEGY: ${contentStrategy.toUpperCase()}
      
      ${contentStrategy === 'preserve' ? 
        `PRESERVATION MODE: Extract-only source check for Schedule of Activities.
        - First determine whether the supplied synopsis or supplementary source chunks contain an actual Schedule of Activities, visit/timepoint table, or explicit assessment timing.
        - If source content contains this information, EXTRACT it exactly as documented and set "sourceStatus": "found".
        - If source content does NOT contain this information, do NOT infer, improve, or generate a schedule.
        - In that case return "sourceStatus": "not_found", tableHeaders: [], tableData: {}, and explain that no Schedule of Activities information was found in the source documents.
        - MAINTAIN original timepoints and assessments when found.
        - DO NOT modify existing schedule structure.` :
      contentStrategy === 'augment' ? 
        `AUGMENTATION MODE: The synopsis contains partial schedule information.
        - EXTRACT existing schedule elements as foundation (preserve original structure)
        - IDENTIFY gaps in timepoints, assessments, or completeness
        - ENHANCE existing schedule with missing assessments and timepoints
        - ADD missing assessment categories based on study design
        - CLEARLY indicate what was preserved vs enhanced vs added new` :
        `GENERATION MODE: Create comprehensive new schedule of activities.
        - GENERATE complete schedule appropriate for this study design
        - Base schedule on study objectives, endpoints, and visit requirements
        - Ensure schedule aligns with protocol type and duration`}
      
      Based on the following clinical study synopsis, ${contentStrategy === 'preserve' ? 'extract and preserve' : contentStrategy === 'augment' ? 'augment and enhance' : 'generate'} a comprehensive Schedule of Activities (SoA) table.
      IMPORTANT: Focus specifically on the disease, treatment, and population mentioned in the synopsis.
      DO NOT default to generating content for NSCLC or any specific disease unless it's mentioned in the synopsis.
      Tailor the schedule specifically to the condition and intervention described in the synopsis.
      
      The SoA should include:
      1. All timepoints of the study (screening, baseline, treatment visits, follow-up)
      2. All assessments to be performed at each timepoint
      3. Appropriate categorization of assessments (e.g., safety, efficacy, PK/PD, etc.)
      
      SYNOPSIS:
      ${synopsis}
      
      ${supplementaryText ? `ADDITIONAL INFORMATION:\n${supplementaryText}\n` : ''}

      ${sourceRequirementText}
      
      ${contentStrategy !== 'generate' ? `
      CONTENT ANALYSIS REQUIREMENT:
      First, carefully analyze the synopsis to identify any existing schedule of activities content.
      Report what you found and your processing approach before generating the final output.
      ` : ''}
      
      Generate a Schedule of Activities in a structured format that can be represented as a table.
      If ADDITIONAL INFORMATION contains one or more "STRUCTURED SOURCE SOA TABLE" or "STRUCTURED TABLE EXTRACTS" blocks, treat those tables as first-class source evidence:
      - In preservation mode, keep the same SoA table content and table count where possible. Do not collapse two source SoA tables into one unless the source clearly shows one logical table split only for page layout.
      - In augmentation mode, preserve the source visit structure and assessment rows as the foundation, then mark only true changes as improved or generated.
      - Preserve complex visit labels, table footnotes, arm/cohort-specific rows, and conditional timing notes instead of simplifying them away.
      - Preserve all parent phase headers and child headers. Because the app uses a flat editable grid, combine nested headers into descriptive column labels instead of dropping the parent header.
      - If the source has separate SoA tables for different periods, cohorts, or arms, mention that separation in explanation and return the best compatible representation in tableHeaders/tableData.
      Your response should be in JSON format with:
      1. tableHeaders: Array of strings representing timepoints
      2. headerOrigins: Array matching tableHeaders. Use "use_as_is", "improved", or "generated" for each timepoint/visit.
      3. tableData: Object with assessment categories as keys, each containing an array of rows with "assessment", "values", "origin", and optional cell-level provenance properties.
      3. explanation: Brief explanation of the generated schedule
      4. sourceStatus: "found" when source content for this section was found, or "not_found" when preserve mode found no usable source content
      5. sourceStatusMessage: Brief user-facing source finding message
      6. removedItems: Optional array describing any source rows, visits, or cells intentionally removed. Each item should include type, label, sourceText, and reason.
      
      For each row and header, set origin/headerOrigins to:
      - "use_as_is" if copied directly from source/synopsis without wording or content changes
      - "improved" if source content was reworded, clarified, or completed
      - "generated" if newly added by AI because the source was missing it

      For each row, include cellOrigins only for cell-level changes. cellOrigins must be an array matching values:
      - Use null or "use_as_is" for cells copied directly from source.
      - Use "generated" only when AI added that specific assessment/timepoint relationship.
      - Use "improved" only when AI changed or normalized that specific timing.
      - Use "removed" only when a source cell was intentionally removed; leave the displayed value blank.
      Include optional cellReasons and sourceValues arrays when cellOrigins contains generated, improved, or removed.
      Do not mark every cell generated just because the row is generated. If the whole row is new, set row origin "generated" and omit cellOrigins unless some cells need specific explanation.
      
      For example:
      {
        "tableHeaders": ["Screening", "Baseline", "Week 1", "Week 2", "End of Study"],
        "headerOrigins": ["use_as_is", "use_as_is", "generated", "generated", "improved"],
        "tableData": {
          "Safety Assessments": [
            { "assessment": "Physical Examination", "values": ["X", "X", "", "X", "X"], "origin": "generated" },
            {
              "assessment": "Vital Signs",
              "values": ["X", "X", "X", "X", "X"],
              "origin": "improved",
              "cellOrigins": ["use_as_is", "use_as_is", "generated", "generated", "improved"],
              "sourceValues": ["X", "X", "", "", "X"],
              "cellReasons": ["", "", "Added for routine safety monitoring during treatment.", "Added for routine safety monitoring during treatment.", "Normalized end-of-study timing."]
            }
          ],
          "Efficacy Assessments": [
            { "assessment": "Primary Endpoint Measure", "values": ["", "X", "", "", "X"], "origin": "use_as_is" }
          ]
        },
        "removedItems": [
          { "type": "cell", "label": "Unscheduled ECG at Week 2", "sourceText": "ECG at Week 2", "reason": "Not supported by the current synopsis safety monitoring requirements." }
        ],
        "explanation": "This schedule was designed based on the study duration and endpoints mentioned in the synopsis."
      }
    `;

    const response = await createScheduleJsonCompletion([
        { role: "system", content: "You are a clinical protocol expert assistant." },
        { role: "user", content: prompt },
      ], 0.3);

    let result = safeParseJson(response.choices[0].message.content);
    const firstCoverage = validateScheduleSourceCoverage(result, sourceRequirements);

    if (sourceRequirements.length > 0 && !firstCoverage.passed) {
      const correctionPrompt = `
        You previously generated a Schedule of Activities JSON, but it dropped source phase/header labels.

        REQUIRED SOURCE PHASE/HEADER LABELS:
        ${sourceRequirements.map((requirement) => `- ${requirement.label}`).join('\n')}

        SOURCE EXCERPT:
        ${`${synopsis}\n${supplementaryText}`.slice(0, 14000)}

        DRAFT JSON TO CORRECT:
        ${JSON.stringify(result).slice(0, 18000)}

        Correct the JSON so tableHeaders preserves the required source phase/header labels.
        If source headers are nested, flatten them into descriptive tableHeaders that retain both parent and child labels.
        Preserve source assessment rows and values. Do not invent a new simplified schedule if the source table is present.
        Add qualityCheck.sourcePhaseCoverage with passed and missingHeaders.
        Return corrected JSON only.
      `;

      const correctionResponse = await createScheduleJsonCompletion([
          { role: "system", content: "You are a clinical protocol SoA quality-control expert. Return corrected JSON only." },
          { role: "user", content: correctionPrompt },
        ], 0.1);

      result = safeParseJson(correctionResponse.choices[0].message.content);
    }

    const finalCoverage = validateScheduleSourceCoverage(result, sourceRequirements);
    const resultAny = result as any;

    return {
      ...resultAny,
      qualityCheck: {
        ...resultAny?.qualityCheck,
        sourcePhaseCoverage: finalCoverage,
      },
      sourceStatusMessage: finalCoverage.passed
        ? resultAny?.sourceStatusMessage
        : `${resultAny?.sourceStatusMessage || "Generated schedule may need review."} Missing source phase headers: ${finalCoverage.missingHeaders.join(", ")}.`,
    } as ProtocolComponent;
  } catch (error) {
    console.error("Error generating schedule of activities:", error);
    if (contentStrategyOverride === "generate" || contentStrategyOverride === "augment" || !contentStrategyOverride) {
      return buildFallbackGeneratedSchedule(synopsis, contentStrategyOverride || "generate");
    }
    throwOpenAIServiceError(error, "Failed to generate schedule of activities");
  }
}

function buildFallbackGeneratedCriteria(synopsis: string, contentStrategy: string): ProtocolComponent {
  if (contentStrategy === "preserve") {
    return {
      inclusionCriteria: [],
      exclusionCriteria: [],
      explanation: "No eligibility criteria were generated because preserve mode requires source eligibility criteria, and AI generation was unavailable.",
      sourceStatus: "not_found",
      sourceStatusMessage: "No source eligibility criteria could be confirmed. Choose Generate with AI to create a draft from the synopsis.",
    } as any;
  }

  const lowerSynopsis = String(synopsis || "").toLowerCase();
  const isOncology = /cancer|tumou?r|oncolog|carcinoma|lymphoma|leukemia|melanoma|metastatic|prostate|breast|lung|nsclc/i.test(lowerSynopsis);
  const isInterventional = /randomi[sz]ed|intervention|treatment|dose|drug|therapy|placebo|arm|phase\s+[123]/i.test(lowerSynopsis);
  const interventionLabel = isInterventional ? "study intervention" : "study procedures";

  const generatedCriterion = (id: number, text: string, impact: string) => ({
    id,
    text,
    impact,
    aiSuggestion: "Confirm criterion wording and thresholds against the final protocol source documents before use.",
    origin: "generated",
    sourceUse: "generated",
    classification: "generated",
  });

  const inclusionCriteria = [
    generatedCriterion(
      1,
      "Participant is able and willing to provide written informed consent before any study-specific procedures.",
      "Ensures ethical enrollment and confirms the participant can authorize study participation."
    ),
    generatedCriterion(
      2,
      "Participant meets the target population, diagnosis, disease status, and/or condition requirements described in the study synopsis.",
      "Aligns enrolled participants with the intended study population."
    ),
    generatedCriterion(
      3,
      "Participant meets age requirements for the study population [minimum and maximum age to be confirmed].",
      "Defines the eligible population and supports regulatory and safety review."
    ),
    generatedCriterion(
      4,
      isOncology
        ? "Participant has adequate performance status for study participation [ECOG or other performance-status threshold to be confirmed]."
        : "Participant is clinically suitable for participation based on protocol-specified medical history and screening assessments.",
      "Reduces risk by confirming the participant can complete required study assessments."
    ),
    generatedCriterion(
      5,
      "Participant has adequate organ function and laboratory values according to protocol-specified thresholds [laboratory thresholds to be confirmed].",
      "Supports safe participation and consistent baseline eligibility assessment."
    ),
    generatedCriterion(
      6,
      `Participant is willing and able to comply with study visits, assessments, ${interventionLabel}, and follow-up requirements.`,
      "Supports protocol adherence and completeness of study data."
    ),
  ];

  const exclusionCriteria = [
    generatedCriterion(
      1,
      `Known hypersensitivity, contraindication, or unacceptable risk related to the ${interventionLabel} or required study procedures.`,
      "Reduces avoidable safety risk."
    ),
    generatedCriterion(
      2,
      "Clinically significant uncontrolled illness, active infection, or medical condition that could interfere with study participation or interpretation of results.",
      "Protects participant safety and data interpretability."
    ),
    generatedCriterion(
      3,
      "Prior or concomitant therapy that is prohibited by the protocol or could confound study endpoints [washout window to be confirmed].",
      "Reduces confounding and supports endpoint validity."
    ),
    generatedCriterion(
      4,
      "Participation in another interventional clinical study or receipt of an investigational product within a protocol-defined period [window to be confirmed].",
      "Avoids overlapping investigational exposure and confounding."
    ),
    generatedCriterion(
      5,
      "Pregnancy, breastfeeding, or unwillingness to follow protocol-specified contraception requirements, where applicable.",
      "Addresses reproductive safety considerations."
    ),
    generatedCriterion(
      6,
      "Any condition that, in the investigator's judgment, would compromise participant safety, protocol compliance, or the reliability of study data.",
      "Provides investigator discretion for safety and data-quality concerns."
    ),
  ];

  return {
    inclusionCriteria,
    exclusionCriteria,
    explanation: "Eligibility criteria were generated from the synopsis because the AI criteria service was unavailable during generation. Items are intentionally conservative and require review of protocol-specific thresholds.",
    sourceStatus: "generated_from_synopsis",
    sourceStatusMessage: "No source eligibility criteria were confirmed; a generated draft was created from the synopsis for review.",
    qualityCheck: {
      fallbackGenerated: true,
      requiresClinicalReview: true,
      contentStrategy,
    },
  } as any;
}

/**
 * Generates Inclusion/Exclusion Criteria based on the synopsis
 */
export async function generateInclusionExclusionCriteria(
  synopsis: string,
  supplementaryInfo?: string[],
  alignmentAnalysis?: any,
  contentStrategyOverride?: string
): Promise<ProtocolComponent> {
  try {
    // Determine content strategy based on alignment analysis
    let contentStrategy = 'generate';
    let existingContentContext = '';
    
    if (contentStrategyOverride === "preserve" || contentStrategyOverride === "augment" || contentStrategyOverride === "generate") {
      contentStrategy = contentStrategyOverride;
      existingContentContext = `
        USER SELECTED CONTENT STRATEGY: ${contentStrategy.toUpperCase()}
      `;
    } else if (alignmentAnalysis?.alignmentAnalysis?.inclusionExclusionCriteria) {
      const criteriaStatus = alignmentAnalysis.alignmentAnalysis.inclusionExclusionCriteria.status;
      const criteriaDetails = alignmentAnalysis.alignmentAnalysis.inclusionExclusionCriteria.details;
      
      if (criteriaStatus === 'aligned' || criteriaStatus === 'well_defined') {
        contentStrategy = 'preserve';
      } else if (criteriaStatus === 'partial' || criteriaStatus === 'partially_aligned') {
        contentStrategy = 'augment';
      } else {
        contentStrategy = 'generate';
      }
      
      existingContentContext = `
        ALIGNMENT ANALYSIS RESULTS:
        - Status: ${criteriaStatus}
        - Details: ${criteriaDetails}
        - Content Strategy: ${contentStrategy.toUpperCase()}
      `;
    }

    const prompt = `
      You are an expert clinical trial protocol developer with advanced content analysis capabilities.
      
      ${existingContentContext}
      
      CRITICAL INSTRUCTIONS - CONTENT STRATEGY: ${contentStrategy.toUpperCase()}
      
      ${contentStrategy === 'preserve' ? 
        `PRESERVATION MODE: Extract-only source check for inclusion/exclusion criteria.
        - First determine whether the supplied synopsis or supplementary source chunks contain actual inclusion criteria and/or exclusion criteria.
        - If source content contains criteria, EXTRACT them exactly as documented and set "sourceStatus": "found".
        - If source content does NOT contain criteria, do NOT infer, improve, or generate criteria.
        - In that case return "sourceStatus": "not_found", inclusionCriteria: [], exclusionCriteria: [], and explain that no eligibility criteria were found in the source documents.
        - MAINTAIN original wording and specifications when found.
        - DO NOT modify or enhance existing content.` :
      contentStrategy === 'augment' ? 
        `AUGMENTATION MODE: The synopsis contains partial inclusion/exclusion criteria.
        - EXTRACT existing criteria as foundation (preserve original wording)
        - IDENTIFY gaps in completeness and specificity
        - ENHANCE existing criteria with missing details and parameters
        - ADD missing criterion categories based on study design
        - CLEARLY indicate what was preserved vs enhanced vs added new` :
        `GENERATION MODE: Create comprehensive new inclusion/exclusion criteria.
        - GENERATE complete criteria appropriate for this study design
        - Base criteria on the study population, intervention, and objectives described
        - Ensure medical accuracy and clinical feasibility`}
      
      Based on the following clinical study synopsis, ${contentStrategy === 'preserve' ? 'extract and preserve' : contentStrategy === 'augment' ? 'augment and enhance' : 'generate comprehensive'} Inclusion and Exclusion Criteria.
      
      IMPORTANT: Focus specifically on the disease, treatment, and population mentioned in the synopsis.
      DO NOT default to generating content for NSCLC or any specific disease unless it's mentioned in the synopsis.
      Tailor the criteria specifically to the condition and intervention described in the synopsis.
      
      The criteria should be:
      1. Clear and specific
      2. Medically accurate
      3. Aligned with the study objectives and design
      4. Feasible to implement in a clinical setting
      
      SYNOPSIS:
      ${synopsis}
      
      ${supplementaryInfo && supplementaryInfo.length > 0 ? `ADDITIONAL INFORMATION:\n${supplementaryInfo.join('\n')}\n` : ''}
      
      ${contentStrategy !== 'generate' ? `
      CONTENT ANALYSIS REQUIREMENT:
      First, carefully analyze the synopsis to identify any existing inclusion/exclusion criteria content.
      Report what you found and your processing approach before generating the final output.
      ` : ''}
      
      Generate Inclusion and Exclusion Criteria in a structured format.
      Your response should be in JSON format with:
      1. inclusionCriteria: Array of criteria objects
      2. exclusionCriteria: Array of criteria objects
      3. explanation: Brief explanation of the generated criteria
      4. sourceStatus: "found" when source content for this section was found, or "not_found" when preserve mode found no usable source content
      5. sourceStatusMessage: Brief user-facing source finding message
      
      Each criterion object should have:
      - id: Numeric identifier
      - text: The criterion text
      - impact: Brief statement on why this criterion is important
      - aiSuggestion: Any AI suggestion for improving or considering alternatives
      - origin: "use_as_is" if copied directly from source, "improved" if AI rewrote/enhanced source text, or "generated" if newly added by AI
      
      For example:
      {
        "inclusionCriteria": [
          {
            "id": 1,
            "text": "Adult patients aged 18-75 years",
            "impact": "Ensures the study population matches the intended treatment population",
            "aiSuggestion": "Consider extending upper age limit if elderly patients are part of the target population"
          }
        ],
        "exclusionCriteria": [
          {
            "id": 1,
            "text": "History of cardiovascular disease within 6 months prior to screening",
            "impact": "Reduces risk of adverse events related to study intervention",
            "aiSuggestion": "Consider specifying types of cardiovascular events for clarity"
          }
        ],
        "explanation": "These criteria were developed based on the patient population, intervention, and safety considerations described in the synopsis."
      }
    `;

    const response = await createCriteriaJsonCompletion(
      [
        { role: "system", content: "You are a clinical protocol expert assistant." },
        { role: "user", content: prompt },
      ],
      0.3
    );

    const result = safeParseJson(response.choices[0].message.content);
    return result as ProtocolComponent;
  } catch (error) {
    console.error("Error generating inclusion/exclusion criteria:", error);
    if (contentStrategyOverride === "generate" || contentStrategyOverride === "augment" || !contentStrategyOverride) {
      return buildFallbackGeneratedCriteria(synopsis, contentStrategyOverride || "generate");
    }
    if (contentStrategyOverride === "preserve") {
      return buildFallbackGeneratedCriteria(synopsis, "preserve");
    }
    throwOpenAIServiceError(error, "Failed to generate inclusion/exclusion criteria");
  }
}

/**
 * Generates Data Variables based on the synopsis
 */
export async function generateDataVariables(
  synopsis: string,
  supplementaryInfo?: string[] | any[], // Accept string array or tableHeaders
  tableData?: any,
  additionalInfo?: any,
  protocolType?: string,
  alignmentAnalysis?: any,
  contentStrategyOverride?: string
): Promise<ProtocolComponent> {
  try {
    // Determine protocol type from synopsis if not provided
    if (!protocolType) {
      // Basic heuristics to determine protocol type from synopsis text
      const synopsisLower = synopsis.toLowerCase();
      if (synopsisLower.includes('real world') || synopsisLower.includes('database analysis') || synopsisLower.includes('electronic health record')) {
        protocolType = 'secondary_data_analysis';
      } else if (synopsisLower.includes('retrospective') && synopsisLower.includes('cohort')) {
        protocolType = 'retrospective_cohort_study';
      } else if (synopsisLower.includes('prospective') && synopsisLower.includes('cohort')) {
        protocolType = 'prospective_cohort_study';
      } else if (synopsisLower.includes('delphi') || synopsisLower.includes('consensus')) {
        protocolType = 'delphi_consensus';
      } else if (synopsisLower.includes('survey') || synopsisLower.includes('questionnaire')) {
        protocolType = 'cross_sectional_survey';
      } else {
        protocolType = 'interventional_clinical_trial';
      }
    }
    
    // Handle array of strings or tableHeaders
    let scheduleText = "";
    let tableHeaders: string[] = [];
    
    // Check if supplementaryInfo is an array of strings (old format) or tableHeaders (new format)
    if (Array.isArray(supplementaryInfo)) {
      if (supplementaryInfo.length > 0 && typeof supplementaryInfo[0] === 'string') {
        // Old format - array of strings
        scheduleText = supplementaryInfo.join('\n');
      } else {
        // New format - tableHeaders
        tableHeaders = supplementaryInfo as string[];
      }
    }
    
    // Format schedule of assessments if provided
    const isDataVariableScheduleRelevant = !protocolType || 
                           protocolType === 'interventional_clinical_trial' || 
                           protocolType === 'prospective_cohort_study';
    
    if (isDataVariableScheduleRelevant && tableHeaders && tableHeaders.length > 0 && tableData) {
      scheduleText = "\nSCHEDULE OF ASSESSMENTS:\n";
      scheduleText += `Timepoints: ${tableHeaders.join(', ')}\n`;
      
      Object.entries(tableData).forEach(([category, assessments]) => {
        scheduleText += `\n${category}:\n`;
        // @ts-ignore
        assessments.forEach(assessment => {
          scheduleText += `- ${assessment.assessment}: ${assessment.values.join(', ')}\n`;
        });
      });
    }
    
    // Create protocol-specific instructions
    let protocolSpecificInstructions = '';
    let variableCategories = '';
    let variableNamingConvention = '';
    let protocolSectionGuidance = '';
    
    if (protocolType === 'secondary_data_analysis' || protocolType === 'retrospective_cohort_study') {
      protocolSpecificInstructions = `
        This is a ${protocolType.replace(/_/g, ' ')}. For this type of study, you MUST define highly specific variables with:
        
        1. Exact database field names (e.g., "diagnosis_date" instead of just "date")
        2. Specific code systems and values (e.g., "Primary diagnosis of Prostate Cancer (ICD-10 codes: C61)")
        3. Precise measurement periods (e.g., "Prior medication use in 180-day lookback period before index date")
        4. Detailed algorithms for derived variables
        5. Exact database sources for each variable
      `;
      
      variableCategories = `
        For a secondary data analysis study, the variables must include:
        1. Data Source Identification (database name, version, extraction date)
        2. Index Date Definition (precise criteria and calculation method)
        3. Cohort Identification (exact codes and algorithms)
        4. Baseline Variables (with explicit lookback periods)
        5. Exposure Variables (with detailed coding and duration definitions)
        6. Outcome Variables (with precise outcome definitions and validation criteria)
        7. Covariate Variables (for adjustment, with specific definitions)
        8. Temporal Variables (study periods, follow-up times)
      `;
      
      variableNamingConvention = `
        VARIABLE NAMING CONVENTION:
        For secondary data analysis/RWE studies, use snake_case (lowercase with underscores) for all variable names. 
        This follows database naming conventions and will be directly usable in SQL and data analysis code.
        
        Examples:
        - "data_source_name" (not "dataSourceName" or "Data Source Name")
        - "index_date" (not "indexDate" or "Index Date")
        - "prior_treatment_flag" (not "priorTreatmentFlag" or "Prior Treatment Flag")
        - "days_to_event" (not "daysToEvent" or "Days to Event")
      `;
      
      protocolSectionGuidance = `
        PROTOCOL DOCUMENT FORMAT:
        In the final protocol document, these variables should be presented in a structured table format with columns for:
        1. Variable Name (using the database field name in snake_case)
        2. Definition (detailed operational definition)
        3. Source (specific table/database)
        4. Type (categorical, continuous, etc.)
        5. Format (numeric, date, text, etc.)
        6. Coding (if applicable - ICD, CPT, etc.)
        
        The Variables section should be preceded by a "Data Source" section that describes the databases in detail.
        Variables should be grouped by their functional categories (e.g., "Exposure Variables", "Outcome Variables").
      `;
    } else if (protocolType === 'prospective_cohort_study') {
      protocolSpecificInstructions = `
        This is a prospective cohort study. For this type of study, you MUST define highly specific variables with:
        
        1. Exact measurement timepoints (baseline, 3 months, etc.)
        2. Detailed collection methods (blood draw, questionnaire, etc.)
        3. Precise instruments and scales (with version numbers)
        4. Specific biomarker assay details
        5. Clear assessment protocols
      `;
      
      variableCategories = `
        For a prospective cohort study, the variables must include:
        1. Demographic Variables (with precise categorization)
        2. Baseline Characteristics (with standardized measurement methods)
        3. Exposure Assessment Variables (with detailed measurement protocols)
        4. Outcome Measurement Variables (with exact assessment criteria)
        5. Follow-up Variables (with specific timepoints and windows)
        6. Confounding Variables (with standardized collection methods)
        7. Data Quality Variables (for validation and verification)
      `;
      
      variableNamingConvention = `
        VARIABLE NAMING CONVENTION:
        For prospective cohort studies, use a hybrid naming approach that combines clarity with structure:
        - Use camelCase for variable names (first word lowercase, subsequent words capitalized)
        - Include timepoint designations where applicable (BL = baseline, FU1 = first follow-up, etc.)
        
        Examples:
        - "heightBL" (height at baseline)
        - "bpSystolicFU3M" (systolic blood pressure at 3-month follow-up)
        - "exposureStatusInitial" (initial exposure status)
        - "outcomeEventDate" (date of outcome event)
      `;
      
      protocolSectionGuidance = `
        PROTOCOL DOCUMENT FORMAT:
        In the final protocol document, these variables should be presented in these formats:
        1. A structured "Data Collection" section organized by visit/timepoint
        2. A "Study Procedures" section detailing collection methods
        3. Tabular format with columns for:
           - Variable Name
           - Assessment Method
           - Timepoints Collected
           - Unit of Measurement
           - Normal Ranges (if applicable)
        
        Variables in the protocol text should use proper capitalization and spaces (e.g., "Height at Baseline")
        rather than the variable names used in datasets.
      `;
    } else if (protocolType === 'interventional_clinical_trial') {
      protocolSpecificInstructions = `
        This is an interventional clinical trial. For this type of study, you MUST define highly specific variables with:
        
        1. Exact treatment administration details
        2. Precise efficacy measurements with assessment methods
        3. Detailed safety parameters with grading criteria
        4. Specific pharmacokinetic sampling timepoints
        5. Clear randomization and stratification factors
      `;
      
      variableCategories = `
        For an interventional trial, the variables must include:
        1. Demographic Variables (with precise categorization)
        2. Screening/Baseline Variables (with standardized measurement methods)
        3. Treatment Variables (with exact dosing, timing, duration)
        4. Efficacy Variables (with specific assessment criteria and timepoints)
        5. Safety Variables (with precise AE grading and causality assessment)
        6. Laboratory Variables (with detailed collection protocols and reference ranges)
        7. Pharmacokinetic Variables (if applicable, with exact sampling timepoints)
        8. Quality of Life Variables (with validated instruments and scoring)
      `;
      
      variableNamingConvention = `
        VARIABLE NAMING CONVENTION:
        For interventional clinical trials, use the CDISC (Clinical Data Interchange Standards Consortium) inspired format:
        - Use uppercase for domain abbreviations (VS for vital signs, LB for lab tests, etc.)
        - Use abbreviated naming with underscores between components
        - Include study timepoint codes (SCR for screening, BL for baseline, etc.)
        
        Examples:
        - "DM_AGE" (demographics - age)
        - "VS_HT_BL" (vital signs - height at baseline)
        - "LB_HGB_W4" (laboratory - hemoglobin at week 4)
        - "EFF_RECIST_C2" (efficacy - RECIST evaluation at cycle 2)
        - "AE_SEVERITY" (adverse event severity)
      `;
      
      protocolSectionGuidance = `
        PROTOCOL DOCUMENT FORMAT:
        In the final protocol document, these variables should be presented according to ICH E6 Good Clinical Practice guidelines:
        1. In the "Study Assessments" section, variables should be listed by timepoint in the Schedule of Activities table
        2. Each assessment should have a dedicated subsection explaining:
           - Purpose and rationale
           - Method of assessment
           - Timing of assessment
           - Equipment/instruments used
           - Reference ranges and clinical significance
        
        The protocol should use proper clinical terminology rather than variable names
        (e.g., "Hemoglobin" rather than "LB_HGB_BL" in the text, though the latter may be 
        referenced in data management sections).
      `;
    } else if (protocolType === 'delphi_consensus') {
      protocolSpecificInstructions = `
        This is a Delphi consensus study. For this type of study, you MUST define highly specific variables with:
        
        1. Exact expert panel qualification criteria
        2. Detailed statement scoring systems
        3. Precise consensus threshold definitions
        4. Specific feedback mechanisms
        5. Clear stability measurement criteria
      `;
      
      variableCategories = `
        For a Delphi consensus study, the variables must include:
        1. Expert Panel Variables (qualifications, experience metrics)
        2. Statement Variables (topic areas, wording, revision tracking)
        3. Rating Variables (scales, thresholds, definitions)
        4. Consensus Measurement Variables (agreement levels, stability metrics)
        5. Round-specific Variables (feedback type, response tracking)
        6. Analysis Variables (agreement calculation methods)
      `;
      
      variableNamingConvention = `
        VARIABLE NAMING CONVENTION:
        For Delphi consensus studies, use descriptive camelCase that includes round information:
        
        Examples:
        - "expertID" (unique identifier for each expert)
        - "statementR1S3" (statement 3 in round 1)
        - "ratingR2S5" (rating for statement 5 in round 2)
        - "consensusThreshold" (threshold for determining consensus)
        - "expertSpecialty" (specialty/expertise area of the panel member)
      `;
      
      protocolSectionGuidance = `
        PROTOCOL DOCUMENT FORMAT:
        In the final protocol document, these variables should be presented in:
        1. A "Methodology" section detailing the consensus process
        2. A "Statement Development" section explaining how statements were created
        3. A "Rating Scale" section defining the scoring system
        4. An "Analysis Plan" section explaining how consensus will be determined
        
        The protocol should include example templates of the rating forms and feedback reports.
        Variables should be described in proper text form in the protocol, not using technical variable names.
      `;
    } else if (protocolType === 'cross_sectional_survey') {
      protocolSpecificInstructions = `
        This is a cross-sectional survey. For this type of study, you MUST define highly specific variables with:
        
        1. Exact survey question wording
        2. Detailed response option definitions
        3. Precise scoring algorithms for composite scales
        4. Specific validation criteria
        5. Clear sampling and recruitment metrics
      `;
      
      variableCategories = `
        For a cross-sectional survey, the variables must include:
        1. Demographic Variables (with precise categorization)
        2. Survey Administration Variables (method, timing, completion tracking)
        3. Primary Outcome Variables (with exact question wording and response options)
        4. Composite Score Variables (with detailed calculation methods)
        5. Quality Control Variables (validation checks, response consistency)
        6. Sampling Variables (recruitment method, response rate calculation)
      `;
      
      variableNamingConvention = `
        VARIABLE NAMING CONVENTION:
        For survey studies, use descriptive camelCase with section and item numbers:
        
        Examples:
        - "demoAge" (demographic section - age)
        - "q12Response" (response to question 12)
        - "sectionAScore" (composite score for section A)
        - "scaleSF36PF" (SF-36 Physical Functioning scale score)
        - "surveyCompletionTime" (time taken to complete survey)
      `;
      
      protocolSectionGuidance = `
        PROTOCOL DOCUMENT FORMAT:
        In the final protocol document, survey variables should be presented as:
        1. The full questionnaire should be included as an appendix
        2. Main outcome measures should be described in detail in the main text
        3. For validated instruments, cite reference and version number
        4. For novel questions, provide rationale for their inclusion
        
        The variables section should be organized by survey section or construct being measured,
        rather than by question order. Composite scoring algorithms should be clearly explained.
      `;
    }
    
    // Add content strategy instructions based on alignment analysis
    let existingContentContext = '';
    let contentStrategy = 'generate';
    
    if (contentStrategyOverride === "preserve" || contentStrategyOverride === "augment" || contentStrategyOverride === "generate") {
      contentStrategy = contentStrategyOverride;
      existingContentContext = `
        USER SELECTED CONTENT STRATEGY: ${contentStrategy.toUpperCase()}
      `;
    } else if (alignmentAnalysis?.alignmentAnalysis?.dataVariables) {
      const variablesStatus = alignmentAnalysis.alignmentAnalysis.dataVariables.status;
      const variablesDetails = alignmentAnalysis.alignmentAnalysis.dataVariables.details;
      
      if (variablesStatus === 'aligned' || variablesStatus === 'well_defined') {
        contentStrategy = 'preserve';
      } else if (variablesStatus === 'partial' || variablesStatus === 'partially_aligned') {
        contentStrategy = 'augment';
      }
      
      existingContentContext = `
        DATA VARIABLES ALIGNMENT ANALYSIS:
        - Status: ${variablesStatus}
        - Details: ${variablesDetails}
        - Content Strategy: ${contentStrategy.toUpperCase()}
      `;
    }
    
    const strategyInstructions = `
      ${existingContentContext}
      
      CRITICAL INSTRUCTIONS - CONTENT STRATEGY: ${contentStrategy.toUpperCase()}
      
      ${contentStrategy === 'preserve' ? 
        `PRESERVATION MODE: Extract-only source check for data variables.
        - First determine whether the supplied synopsis, schedule text, or supplementary source chunks contain actual data variable definitions, CRF fields, endpoint variables, or source data fields.
        - If source content contains variables, EXTRACT them exactly as documented and set "sourceStatus": "found".
        - If source content does NOT contain variables, do NOT infer, improve, or generate variables.
        - In that case return "sourceStatus": "not_found", dataVariables: [], and explain that no data variable information was found in the source documents.
        - MAINTAIN original naming and specifications when found.
        - DO NOT modify existing variable definitions.` :
      contentStrategy === 'augment' ? 
        `AUGMENTATION MODE: The synopsis contains partial data variable information.
        - EXTRACT existing variables as foundation (preserve original definitions)
        - IDENTIFY gaps in variable coverage and detail
        - ENHANCE existing variables with missing specifications
        - ADD missing variable categories based on study design
        - CLEARLY indicate what was preserved vs enhanced vs added new` :
        `GENERATION MODE: Create comprehensive new data variable definitions.
        - GENERATE complete variable set appropriate for this study design
        - Base variables on study objectives, endpoints, and data collection needs
        - Ensure variables align with schedule of assessments when provided`}
    `;
    
    const prompt = `
      You are a clinical research data specialist with expertise in designing precise, unambiguous data collection variables for ${protocolType.replace(/_/g, ' ')} studies.
      
      ${strategyInstructions}
      
      Based on the following clinical study synopsis, generate a comprehensive list of highly specific data variables that should be collected in the study.
      
      ${protocolSpecificInstructions}
      
      STUDY SYNOPSIS:
      ${synopsis}
      
      ${scheduleText ? `\n${scheduleText}\n` : ''}
      
      ${variableCategories}
      
      ${variableNamingConvention}
      
      ${protocolSectionGuidance}
      
      INSTRUCTIONS FOR CREATING PRECISE DATA VARIABLES:
      
      Create a list of data variables that meets these strict requirements:
      
      1. SPECIFICITY: Each variable must have a precise, unambiguous definition
         - WRONG: "Age" (too vague)
         - RIGHT: "Age at enrollment in years, calculated from date of birth to study entry date"
      
      2. MEASURABILITY: Each variable must specify exactly how it's measured
         - WRONG: "Pain level" (measurement method unclear)
         - RIGHT: "Pain level measured using 10-point Visual Analog Scale (0=no pain, 10=worst possible pain)"
      
      3. CATEGORIZATION: All categorical variables must list all possible values
         - WRONG: "Tumor response" (categories undefined)
         - RIGHT: "Tumor response categorized as: Complete Response, Partial Response, Stable Disease, or Progressive Disease per RECIST v1.1 criteria"
      
      4. OPERATIONAL CLARITY: Variables must be directly actionable for data collection
         - WRONG: "Kidney function" (too abstract)
         - RIGHT: "Estimated Glomerular Filtration Rate (eGFR) calculated using CKD-EPI equation, measured in mL/min/1.73m²"
      
      5. CONTEXTUAL PRECISION: Include relevant thresholds, time periods, and methods
         - WRONG: "Prior medication use" (timeframe undefined)
         - RIGHT: "Prior medication use within 30 days before screening, recorded by drug name, dose, route, frequency, and indication"
      
      6. NAMING CONVENTION ADHERENCE: Follow the variable naming convention specified for this protocol type EXACTLY
         - For secondary data analysis: use snake_case (e.g., "prior_medication_flag")
         - For interventional trials: use CDISC-inspired format (e.g., "VS_HT_BL" for height at baseline)
         - For prospective cohort studies: use camelCase with timepoints (e.g., "heightBL" for height at baseline)
      
      Your response should be in JSON format with:
      1. dataVariables: Array of variable objects
      2. explanation: Brief explanation of the generated variables
      3. sourceStatus: "found" when source content for this section was found, or "not_found" when preserve mode found no usable source content
      4. sourceStatusMessage: Brief user-facing source finding message
      
      Each variable object should have:
      - id: Numeric identifier
      - category: Category of the variable
      - name: Precise name of the variable FOLLOWING THE NAMING CONVENTION for this protocol type
      - definition: DETAILED definition specifying exactly what is being measured, how it's measured, and any thresholds or criteria
      - dataType: Data type (e.g., "numeric", "categorical", "date", "text")
      - possibleValues: For categorical variables, list all possible values/options
      - required: Boolean indicating if variable is required
      - type: The variable's data type as a string (must be one of: "Numeric", "Categorical", "Date", "Text", "Binary")
      - aiSuggestion: A SPECIFIC and ACTIONABLE methodological recommendation focused on measurement approach, timing, or important considerations
      - origin: "use_as_is" if copied directly from source, "improved" if AI rewrote/enhanced source text, or "generated" if newly added by AI
      
      The definition field is CRITICAL - it must be extremely detailed and specific, providing enough information that anyone could implement the data collection consistently without needing additional clarification.
      
      IMPORTANT: For EVERY variable, be sure to:
      1. Set an appropriate type from the allowed types: "Numeric", "Categorical", "Date", "Text", or "Binary"
      2. For the aiSuggestion field, provide SPECIFIC METHODOLOGICAL ADVICE, not just importance statements
      
      INSTRUCTIONS FOR CREATING USEFUL AI SUGGESTIONS:
      
      Your aiSuggestion should focus on HOW to best measure/collect the variable, not just WHY it's important.
      
      POOR SUGGESTIONS (avoid these):
      - "This is an important variable for the study"
      - "This variable is required for the primary endpoint"
      - "This demographic variable is standard in clinical trials"
      
      EXCELLENT SUGGESTIONS (use these patterns):
      - "Consider using RECIST 1.1 criteria with independent radiological review for more objective assessment"
      - "Measure at baseline and every 6 weeks (±3 days) until disease progression to capture transient effects"
      - "Use a validated instrument like EORTC QLQ-C30 with the LC13 module specific to lung cancer"
      - "Record exact time (not just date) of drug administration for accurate PK analysis"
      - "Collect as continuous variable rather than categories for greater statistical power in analysis"
      
      SPECIAL GUIDANCE FOR KEY ENDPOINTS:
      
      For progression-free survival (PFS/rwPFS):
      - "Define PFS as time from randomization to disease progression per RECIST v1.1 or death. Schedule CT scans at 6-week intervals with central radiologic review to minimize bias."
      - "For rwPFS, use clear progression definitions based on radiology reports/ICD codes with sensitivity analyses to verify robustness of measurement approach."
      
      For overall survival (OS):
      - "Verify vital status for all subjects at regular intervals (every 3 months) even after treatment discontinuation to minimize missing data."
      
      For quality of life:
      - "Implement electronic PRO collection with scheduled reminders to minimize missing data. Use disease-specific modules alongside general QoL instruments."
      
      For safety variables:
      - "Grade adverse events using CTCAE v5.0. Implement lab-specific alerts for values exceeding predetermined thresholds to ensure timely reporting."
    `;

    const response = await openai.chat.completions.create({
      model: MODEL,
      messages: [
        { role: "system", content: "You are a clinical protocol expert assistant." },
        { role: "user", content: prompt },
      ],
      response_format: { type: "json_object" },
      temperature: 0.3,
    });

    const result = safeParseJson(response.choices[0].message.content);
    return result as ProtocolComponent;
  } catch (error) {
    console.error("Error generating data variables:", error);
    throwOpenAIServiceError(error, "Failed to generate data variables");
  }
}

/**
 * Validates protocol components for consistency and completeness
 */
export async function validateProtocolComponents(
  protocol: any
): Promise<{ validationResults: any }> {
  try {
    const prompt = `
      You are an expert clinical protocol reviewer.
      
      Review the following protocol components for consistency, completeness, and quality.
      Identify any issues, inconsistencies, or areas for improvement.
      
      IMPORTANT: Focus specifically on the disease, treatment, and population mentioned in the protocol.
      DO NOT default to analyzing content for NSCLC or any specific disease unless it's mentioned in the protocol.
      Tailor your feedback specifically to the condition and intervention described in the protocol.
      
      PROTOCOL COMPONENTS:
      ${JSON.stringify(protocol, null, 2)}
      
      Provide a detailed validation analysis in JSON format with:
      1. overall: Overall assessment and score (1-10)
      2. componentAnalysis: Assessment of each component (synopsis, schedule, criteria, variables)
      3. inconsistencies: Any inconsistencies between components
      4. recommendations: Specific recommendations for improvement
      
      Your response should be in this format:
      {
        "overall": {
          "score": 8,
          "assessment": "The protocol is generally well-designed with minor issues to address."
        },
        "componentAnalysis": {
          "synopsis": {
            "score": 9,
            "strengths": ["Clear objectives", "Well-defined endpoints"],
            "weaknesses": ["Sample size justification incomplete"]
          },
          "schedule": {
            "score": 7,
            "strengths": ["Comprehensive safety assessments"],
            "weaknesses": ["Some efficacy measurements have timing inconsistencies"]
          }
        },
        "inconsistencies": [
          "The primary endpoint in the synopsis differs from what's measured in the schedule",
          "Exclusion criterion #3 mentions a test not included in the schedule of assessments"
        ],
        "recommendations": [
          "Align primary endpoint description across all sections",
          "Add missing lab tests to schedule of assessments"
        ]
      }
    `;

    const response = await openai.chat.completions.create({
      model: MODEL,
      messages: [
        { role: "system", content: "You are a clinical protocol expert assistant." },
        { role: "user", content: prompt },
      ],
      response_format: { type: "json_object" },
      temperature: 0.3,
    });

    const result = safeParseJson(response.choices[0].message.content);
    return { validationResults: result };
  } catch (error) {
    console.error("Error validating protocol components:", error);
    throw new Error("Failed to validate protocol components");
  }
}

/**
 * Analyzes alignment between protocol components
 * This function specifically checks for alignment between objectives, 
 * schedule of assessments, inclusion/exclusion criteria, and data variables
 */
export async function analyzeProtocolAlignment(
  protocol: any,
  protocolType?: string
): Promise<any> {
  try {
    console.log("Alignment check received data:", Object.keys(protocol));
    
    // Determine the protocol type if not provided
    if (!protocolType) {
      protocolType = protocol.protocolType;
      
      // If protocolType isn't explicitly provided, try to determine it from the synopsis
      if (!protocolType && protocol.synopsis) {
        // Some basic heuristics to guess the protocol type from content
        const synopsis = protocol.synopsis.toLowerCase();
        if (synopsis.includes('maic') || synopsis.includes('matching-adjusted indirect comparison') || synopsis.includes('matching adjusted indirect comparison')) {
          protocolType = 'maic';
        } else if (synopsis.includes('real world') || synopsis.includes('database') || synopsis.includes('electronic health record')) {
          protocolType = 'secondary_data_analysis';
        } else if (synopsis.includes('cohort') && synopsis.includes('retrospective')) {
          protocolType = 'retrospective_cohort_study';
        } else if (synopsis.includes('cohort') && synopsis.includes('prospective')) {
          protocolType = 'prospective_cohort_study';
        } else if (synopsis.includes('delphi') || synopsis.includes('consensus')) {
          protocolType = 'delphi_consensus';
        } else if (synopsis.includes('survey') || synopsis.includes('questionnaire')) {
          protocolType = 'cross_sectional_survey';
        } else {
          // Default to interventional if we can't determine
          protocolType = 'interventional_clinical_trial';
        }
      }
    }
    
    console.log(`Protocol alignment check for protocol type: ${protocolType}`);
    
    // Check if this is a MAIC protocol
    const isMAIC = protocolType === 'maic';
    
    // Check if schedule of assessments is relevant for this protocol type
    const isAlignCheckScheduleRelevant = protocolType === 'interventional_clinical_trial' || 
                            protocolType === 'prospective_cohort_study';
    
    // Check if components exist
    const hasSynopsis = !!protocol.synopsis && typeof protocol.synopsis === 'string' && protocol.synopsis.trim().length > 0;
    
    // Enhanced schedule assessment for comprehensiveness
    let hasSchedule: boolean | string = 'not_applicable';
    if (isAlignCheckScheduleRelevant) {
      // Basic existence check
      const hasBasicScheduleData = Array.isArray(protocol.tableHeaders) && protocol.tableHeaders.length > 0 && 
                                  !!protocol.tableData && typeof protocol.tableData === 'object';
      
      if (!hasBasicScheduleData) {
        hasSchedule = false;
      } else {
        // Comprehensive assessment of schedule quality
        const tableHeaders = Array.isArray(protocol.tableHeaders) ? protocol.tableHeaders : [];
        const tableData = protocol.tableData || {};
        
        // Calculate schedule comprehensiveness score
        let comprehensivenessScore = 0;
        
        // 1. Check for adequate number of timepoints (25 points)
        if (tableHeaders.length >= 4) comprehensivenessScore += 25;
        else if (tableHeaders.length >= 2) comprehensivenessScore += 15;
        else if (tableHeaders.length >= 1) comprehensivenessScore += 5;
        
        // 2. Check for diverse assessment categories (30 points)
        const categoryCount = Object.keys(tableData).length;
        if (categoryCount >= 5) comprehensivenessScore += 30;
        else if (categoryCount >= 3) comprehensivenessScore += 20;
        else if (categoryCount >= 2) comprehensivenessScore += 10;
        else if (categoryCount >= 1) comprehensivenessScore += 5;
        
        // 3. Check for assessment density (30 points)
        let totalAssessments = 0;
        let assessmentCells = 0;
        Object.values(tableData).forEach((assessments: any) => {
          if (Array.isArray(assessments)) {
            totalAssessments += assessments.length;
            assessments.forEach((assessment: any) => {
              if (assessment.values && Array.isArray(assessment.values)) {
                assessmentCells += assessment.values.filter(v => v === 'X' || v === '✓' || v === 'Yes').length;
              }
            });
          }
        });
        
        if (totalAssessments >= 8 && assessmentCells >= (tableHeaders.length * 3)) comprehensivenessScore += 30;
        else if (totalAssessments >= 5 && assessmentCells >= (tableHeaders.length * 2)) comprehensivenessScore += 20;
        else if (totalAssessments >= 3 && assessmentCells >= tableHeaders.length) comprehensivenessScore += 10;
        else if (totalAssessments >= 1) comprehensivenessScore += 5;
        
        // 4. Check for proper study phases (15 points)
        const hasScreening = tableHeaders.some(h => h.toLowerCase().includes('screen'));
        const hasBaseline = tableHeaders.some(h => h.toLowerCase().includes('baseline') || h.toLowerCase().includes('day') || h.toLowerCase().includes('visit'));
        const hasFollowup = tableHeaders.some(h => h.toLowerCase().includes('week') || h.toLowerCase().includes('month') || h.toLowerCase().includes('follow'));
        
        if (hasScreening && hasBaseline && hasFollowup) comprehensivenessScore += 15;
        else if ((hasScreening && hasBaseline) || (hasBaseline && hasFollowup)) comprehensivenessScore += 10;
        else if (hasBaseline) comprehensivenessScore += 5;
        
        // Determine schedule quality based on score
        // Above 70: comprehensive schedule
        // 40-70: adequate but could be improved  
        // Below 40: minimal/incomplete
        hasSchedule = comprehensivenessScore >= 40;
        
        console.log(`Schedule comprehensiveness assessment: ${comprehensivenessScore}/100 points - ${hasSchedule ? 'Adequate' : 'Insufficient'}`);
      }
    }
    
    // Parse inclusion/exclusion criteria if stored as strings
    const parsedInclusion = protocol.inclusionCriteria ? 
      (typeof protocol.inclusionCriteria === 'string' ? 
        JSON.parse(protocol.inclusionCriteria) : 
        protocol.inclusionCriteria) : 
      [];
    
    const parsedExclusion = protocol.exclusionCriteria ? 
      (typeof protocol.exclusionCriteria === 'string' ? 
        JSON.parse(protocol.exclusionCriteria) : 
        protocol.exclusionCriteria) : 
      [];
    
    const hasInclusion = Array.isArray(parsedInclusion) && parsedInclusion.length > 0;
    const hasExclusion = Array.isArray(parsedExclusion) && parsedExclusion.length > 0;
    const hasCriteria = hasInclusion && hasExclusion;
    
    // Check if study schema exists
    const hasSchema = protocol.schema && 
                     (Array.isArray(protocol.schema.nodes) && protocol.schema.nodes.length > 0) && 
                     (Array.isArray(protocol.schema.edges) && protocol.schema.edges.length > 0);
    
    // Check if statistical analysis plan exists
    const hasSAP = protocol.analysisPlan && 
                  (protocol.analysisPlan.sampleSize || 
                   (Array.isArray(protocol.analysisPlan.primaryEndpoints) && protocol.analysisPlan.primaryEndpoints.length > 0) ||
                   (Array.isArray(protocol.analysisPlan.secondaryEndpoints) && protocol.analysisPlan.secondaryEndpoints.length > 0) ||
                   (Array.isArray(protocol.analysisPlan.analysisPopulations) && protocol.analysisPlan.analysisPopulations.length > 0) ||
                   (Array.isArray(protocol.analysisPlan.statisticalMethods) && protocol.analysisPlan.statisticalMethods.length > 0));
    const hasVariables = Array.isArray(protocol.dataVariables) && protocol.dataVariables.length > 0;
    
    console.log("Component availability:", {
      hasSynopsis,
      hasSchedule,
      hasInclusion,
      hasExclusion,
      hasCriteria,
      hasVariables,
      hasSchema,
      hasSAP
    });
    
    // If any core component is missing, return immediately with basic check
    if (!hasSynopsis || !hasSchedule || !hasCriteria || !hasVariables) {
      // Instead of using a separate function, we'll generate the basic alignment check here
      console.log("Running basic alignment check due to missing components");
      
      // Create alignment status message based on missing components
      const getStatusMessage = (hasComponent: boolean | string, componentName: string): string => {
        if (hasComponent === 'not_applicable') return `${componentName} is not applicable for this protocol type`;
        return hasComponent ? `${componentName} is present` : `${componentName} is missing`;
      };
      
      // Generate analysis for each component
      const componentAnalysis = {
        synopsis: {
          status: hasSynopsis ? "aligned" : "not-aligned",
          explanation: getStatusMessage(hasSynopsis, "Synopsis")
        },
        schedule: {
          status: hasSchedule === 'not_applicable' ? "not_applicable" : (hasSchedule ? "aligned" : "not-aligned"),
          explanation: getStatusMessage(hasSchedule, "Schedule of Activities")
        },
        criteria: {
          status: hasCriteria ? "aligned" : "not-aligned",
          explanation: getStatusMessage(hasCriteria, "Eligibility Criteria")
        },
        variables: {
          status: hasVariables ? "aligned" : "not-aligned",
          explanation: getStatusMessage(hasVariables, "Data Variables")
        },
        schema: {
          status: hasSchema ? "aligned" : "not-aligned",
          explanation: getStatusMessage(hasSchema, "Study Schema")
        },
        analysisPlan: {
          status: hasSAP ? "aligned" : "not-aligned",
          explanation: getStatusMessage(hasSAP, "Statistical Analysis Plan")
        }
      };
      
      // Determine overall alignment status
      const criticalComponentsMissing = !hasSynopsis || 
                                      (hasSchedule !== 'not_applicable' && !hasSchedule) || 
                                      !hasCriteria || 
                                      !hasVariables;
      
      const overallStatus = criticalComponentsMissing ? "not-aligned" : "partially-aligned";
      
      // Generate recommendations based on missing components
      const recommendations = [];
      
      if (!hasSynopsis) {
        recommendations.push("Create a detailed study synopsis that clearly defines the study objectives, population, and design.");
      }
      
      if (hasSchedule !== 'not_applicable' && !hasSchedule) {
        recommendations.push("Develop a schedule of assessments that includes all necessary timepoints and measurements.");
      }
      
      if (!hasCriteria) {
        recommendations.push("Define comprehensive inclusion and exclusion criteria aligned with the study objectives.");
      }
      
      if (!hasVariables) {
        recommendations.push("Specify all required data variables with clear operational definitions.");
      }
      
      if (!hasSchema) {
        recommendations.push("Create a study schema that visually represents the study design and patient flow.");
      }
      
      if (!hasSAP) {
        recommendations.push("Develop a statistical analysis plan that addresses all study endpoints.");
      }
      
      // Return the basic alignment analysis
      return {
        alignmentAnalysis: {
          studyObjectives: {
            status: hasSynopsis ? "aligned" : "not-aligned",
            explanation: hasSynopsis ? "Study objectives are present in synopsis" : "Study synopsis is missing"
          },
          scheduleOfAssessments: {
            status: hasSchedule === 'not_applicable' ? "not_applicable" : (hasSchedule ? "aligned" : "not-aligned"),
            explanation: hasSchedule === 'not_applicable' ? 
              "Schedule of assessments is not applicable for this protocol type" : 
              (hasSchedule ? "Schedule of assessments is present" : "Schedule of assessments is missing")
          },
          inclusionExclusionCriteria: {
            status: hasCriteria ? "aligned" : "not-aligned",
            explanation: hasCriteria ? "Inclusion/exclusion criteria are present" : "Inclusion/exclusion criteria are missing or incomplete"
          },
          dataVariables: {
            status: hasVariables ? "aligned" : "not-aligned",
            explanation: hasVariables ? "Data variables are present" : "Data variables are missing"
          },
          studySchema: {
            status: hasSchema ? "aligned" : "not-aligned",
            explanation: hasSchema ? "Study schema is present" : "Study schema is missing"
          },
          statisticalAnalysisPlan: {
            status: hasSAP ? "aligned" : "not-aligned",
            explanation: hasSAP ? "Statistical analysis plan is present" : "Statistical analysis plan is missing"
          }
        },
        componentAnalysis: componentAnalysis,
        overallStatus: overallStatus,
        recommendations: recommendations
      };
    }
    
    // Prepare the protocol data for LLM analysis
    // First extract key concepts from the synopsis
    const synopsisText = protocol.synopsis || '';
    
    // Determine if schedule is applicable based on protocol type
    const isAnalyzeProtocolScheduleRelevant = !protocolType || 
                            protocolType === 'interventional_clinical_trial' || 
                            protocolType === 'prospective_cohort_study';
    
    // Format schedules into a readable string for the AI
    let scheduleText = "";
    if (isAnalyzeProtocolScheduleRelevant) {
      scheduleText = "Schedule of Activities:\n";
      
      // Ensure tableHeaders is properly parsed if it's a string
      const tableHeaders = typeof protocol.tableHeaders === 'string' ? 
        JSON.parse(protocol.tableHeaders) : protocol.tableHeaders;
      
      // Ensure tableData is properly parsed if it's a string  
      const tableData = typeof protocol.tableData === 'string' ? 
        JSON.parse(protocol.tableData) : protocol.tableData;
      
      if (tableHeaders && tableHeaders.length > 0 && tableData) {
        scheduleText += `Timepoints: ${tableHeaders.join(', ')}\n`;
        
        Object.entries(tableData).forEach(([category, assessments]) => {
          scheduleText += `\n${category}:\n`;
          // @ts-ignore
          assessments.forEach(assessment => {
            scheduleText += `- ${assessment.assessment}: ${assessment.values.join(', ')}\n`;
          });
        });
      }
    } else {
      scheduleText = "Schedule of Activities: Not applicable for this protocol type (Secondary Data Analysis / Retrospective Study).\n";
    }
    
    // Format inclusion criteria
    let inclusionText = "Inclusion Criteria:\n";
    const inclusionCriteria = parsedInclusion;
    inclusionCriteria.forEach((criterion: any, index: number) => {
      inclusionText += `${index + 1}. ${criterion.text}\n`;
    });
    
    // Format exclusion criteria
    let exclusionText = "Exclusion Criteria:\n";
    const exclusionCriteria = parsedExclusion;
    exclusionCriteria.forEach((criterion: any, index: number) => {
      exclusionText += `${index + 1}. ${criterion.text}\n`;
    });
    
    // Format data variables
    let variablesText = "Data Variables:\n";
    protocol.dataVariables.forEach((variable: any) => {
      variablesText += `- ${variable.name} (${variable.category}): ${variable.definition || 'No definition provided'}\n`;
    });
    
    // Format study schema if available
    let schemaText = "";
    if (protocol.schema && protocol.schema.nodes && protocol.schema.nodes.length > 0) {
      schemaText = "Study Schema:\n";
      // Add information about key phases
      const phaseNodes = protocol.schema.nodes.filter((node: any) => node.type === "studyPhase");
      if (phaseNodes.length > 0) {
        schemaText += "Study Phases:\n";
        phaseNodes.forEach((node: any) => {
          schemaText += `- ${node.data.label}\n`;
        });
      }
      
      // Add information about treatment arms
      const treatmentNodes = protocol.schema.nodes.filter((node: any) => node.type === "treatment");
      if (treatmentNodes.length > 0) {
        schemaText += "\nTreatment Arms:\n";
        treatmentNodes.forEach((node: any) => {
          schemaText += `- ${node.data.label}${node.data.description ? `: ${node.data.description}` : ''}\n`;
        });
      }
      
      // Add information about endpoints
      const endpointNodes = protocol.schema.nodes.filter((node: any) => node.type === "endpoint");
      if (endpointNodes.length > 0) {
        schemaText += "\nEndpoints:\n";
        endpointNodes.forEach((node: any) => {
          schemaText += `- ${node.data.label}${node.data.description ? `: ${node.data.description}` : ''}\n`;
        });
      }
    }
    
    // Format statistical analysis plan if available
    let sapText = "";
    if (protocol.analysisPlan) {
      sapText = "Statistical Analysis Plan:\n";
      
      // Sample size information
      if (protocol.analysisPlan.sampleSize) {
        sapText += `\nSample Size: ${protocol.analysisPlan.sampleSize.total} patients`;
        if (protocol.analysisPlan.sampleSize.perArm) {
          sapText += ` (${protocol.analysisPlan.sampleSize.perArm} per arm)`;
        }
        if (protocol.analysisPlan.sampleSize.justification) {
          sapText += `\nJustification: ${protocol.analysisPlan.sampleSize.justification}\n`;
        }
      }
      
      // Primary endpoints
      if (protocol.analysisPlan.primaryEndpoints && protocol.analysisPlan.primaryEndpoints.length > 0) {
        sapText += "\nPrimary Endpoints:\n";
        protocol.analysisPlan.primaryEndpoints.forEach((endpoint: any) => {
          sapText += `- ${endpoint.name} (${endpoint.type}): Measured at ${endpoint.timepoint}\n`;
          sapText += `  Method: ${endpoint.method}\n`;
        });
      }
      
      // Secondary endpoints
      if (protocol.analysisPlan.secondaryEndpoints && protocol.analysisPlan.secondaryEndpoints.length > 0) {
        sapText += "\nSecondary Endpoints:\n";
        protocol.analysisPlan.secondaryEndpoints.forEach((endpoint: any) => {
          sapText += `- ${endpoint.name} (${endpoint.type}): Measured at ${endpoint.timepoint}\n`;
          sapText += `  Method: ${endpoint.method}\n`;
        });
      }
      
      // Analysis populations
      if (protocol.analysisPlan.analysisPopulations && protocol.analysisPlan.analysisPopulations.length > 0) {
        sapText += "\nAnalysis Populations:\n";
        protocol.analysisPlan.analysisPopulations.forEach((population: any) => {
          sapText += `- ${population.name}: ${population.definition}\n`;
        });
      }
      
      // Statistical methods
      if (protocol.analysisPlan.statisticalMethods && protocol.analysisPlan.statisticalMethods.length > 0) {
        sapText += "\nStatistical Methods:\n";
        protocol.analysisPlan.statisticalMethods.forEach((method: any) => {
          sapText += `- ${method.name} (${method.type}): ${method.description}\n`;
        });
      }
    }
    
    // Create protocol type specific instructions
    let protocolTypeInstructions = '';
    
    if (protocolType === 'secondary_data_analysis' || protocolType === 'retrospective_cohort_study') {
      protocolTypeInstructions = `
        IMPORTANT: This is a ${protocolType.replace(/_/g, ' ')} protocol.
        - Schedule of Activities is NOT applicable for this type of study
        - Focus on database selection criteria (inclusion/exclusion criteria)
        - Check alignment between data variables and statistical analysis plan
        - Verify that study schema represents data extraction and analysis workflow
        - NEVER recommend creating a Schedule of Activities for this protocol type
        - For recommendations, focus on data source definitions, variable specificity, and analytical methods
      `;
    } else if (protocolType === 'delphi_consensus') {
      protocolTypeInstructions = `
        IMPORTANT: This is a Delphi consensus study protocol.
        - Focus on expert panel selection and consensus methodology
        - Check alignment between research questions and rating scales
        - Verify that the analysis plan includes appropriate consensus calculations
        - For recommendations, focus on statement development, consensus thresholds, and stability measurements
      `;
    } else if (protocolType === 'cross_sectional_survey' || protocolType === 'qualitative_study') {
      protocolTypeInstructions = `
        IMPORTANT: This is a ${protocolType.replace(/_/g, ' ')} protocol.
        - Focus on survey instrument design and sampling methodology
        - Verify alignment between research questions and survey items
        - Check that analysis plan includes appropriate statistical or qualitative methods
        - For recommendations, focus on instrument validation, sampling approach, and data quality
      `;
    } else {
      // Interventional clinical trial or prospective cohort study
      protocolTypeInstructions = `
        IMPORTANT: This is a ${protocolType ? protocolType.replace(/_/g, ' ') : 'clinical trial'} protocol.
        - Schedule of Activities is REQUIRED for this type of study
        - Verify alignment between endpoints in synopsis and measurements in schedule
        - Check that inclusion/exclusion criteria align with the study population
        - Ensure data variables capture all necessary endpoints and safety parameters
        - Verify that statistical methods are appropriate for the study design and endpoints
      `;
    }
    
    // Create the full analysis prompt for the AI
    const analysisPrompt = `
      You are a clinical protocol expert tasked with analyzing the alignment between different components of a clinical study protocol.
      You need to determine if the components are properly aligned with each other and with best practices.
      
      ${protocolTypeInstructions}
      
      PROTOCOL COMPONENTS:
      
      === STUDY SYNOPSIS ===
      ${synopsisText.substring(0, 2000)}
      ${synopsisText.length > 2000 ? '... [synopsis truncated]' : ''}
      
      ${scheduleText ? `=== SCHEDULE OF ASSESSMENTS ===\n${scheduleText}\n` : ''}
      
      === ELIGIBILITY CRITERIA ===
      ${inclusionText}
      ${exclusionText}
      
      === DATA VARIABLES ===
      ${variablesText}
      
      ${schemaText ? `=== STUDY SCHEMA ===\n${schemaText}\n` : ''}
      
      ${sapText ? `=== STATISTICAL ANALYSIS PLAN ===\n${sapText}\n` : ''}
      
      ANALYSIS INSTRUCTIONS:
      1. Analyze the alignment between these protocol components
      2. For each component (Study Objectives, Schedule of Activities, Inclusion/Exclusion Criteria, Data Variables, 
         Study Schema, Statistical Analysis Plan), determine if it is:
         - "aligned" (properly aligned with other components and meets best practices),
         - "partially-aligned" (has some alignment issues or gaps),
         - "not-aligned" (significant misalignment or major gaps), or
         - "not_applicable" (component is not relevant for this protocol type)
      
      3. Perform specific cross-checks appropriate for this protocol type:
         ${protocolType === 'secondary_data_analysis' || protocolType === 'retrospective_cohort_study' ? `
         - Verify that Study Schema accurately represents the data extraction and analytical workflow
         - Check that database selection criteria (inclusion/exclusion) align with research question
         - Ensure that data variables include all necessary fields for outcomes and covariates
         - Confirm statistical methods address potential biases in observational data
         - Verify that temporal definitions (index dates, lookback periods) are consistent
         ` : protocolType === 'delphi_consensus' ? `
         - Verify that expert panel criteria align with study objectives
         - Check that consensus methodology is appropriate for the research question
         - Ensure that statement development approach is clearly defined
         - Confirm that analysis plan includes appropriate consensus calculations
         ` : protocolType === 'cross_sectional_survey' || protocolType === 'qualitative_study' ? `
         - Verify that survey instruments align with study objectives
         - Check that sampling methodology is appropriate for the target population
         - Ensure that data collection approach is well-defined
         - Confirm analysis plan includes appropriate methods for survey data
         ` : `
         - Verify that Study Schema accurately represents the patient flow described in the synopsis
         - Check that treatment arms in Study Schema match those in the synopsis
         - Ensure Statistical Analysis Plan endpoints align with those mentioned in synopsis and schedule
         - Confirm analysis populations in Statistical Analysis Plan align with eligibility criteria
         - Verify statistical methods are appropriate for the defined endpoints
         
         CRITICAL SCHEDULE OF ACTIVITIES ASSESSMENT CRITERIA:
         When evaluating the Schedule of Activities, assess these specific elements:
         - Table Structure: Does it have adequate timepoints (≥4 for comprehensive, ≥2 for basic)?
         - Assessment Categories: Are diverse categories present (safety, efficacy, PK, biomarkers, etc.)?
         - Assessment Density: Are there sufficient assessments per timepoint (not just sparse entries)?
         - Study Phases: Does it include appropriate phases (screening, baseline, treatment, follow-up)?
         - Content Quality: Are assessments clinically relevant and aligned with study objectives?
         - Completeness: Does it cover all endpoints mentioned in synopsis and statistical plan?
         
         Mark Schedule as:
         - "aligned": Comprehensive table with ≥4 timepoints, ≥5 categories, adequate assessment density, proper phases
         - "partially-aligned": Basic table with 2-3 timepoints, 3-4 categories, some gaps in coverage
         - "not-aligned": Minimal table with <2 timepoints, <3 categories, or major gaps in assessment coverage
         `}
      
      4. Provide a brief explanation for each assessment, being VERY SPECIFIC about any gaps or issues
      5. Provide 2-3 targeted recommendations to improve alignment for THIS SPECIFIC protocol type
      
      Your analysis should be structured and thoughtful, focusing on key scientific and operational considerations.
      REMEMBER: For ${protocolType ? protocolType.replace(/_/g, ' ') : 'this protocol'}, ${protocolType === 'secondary_data_analysis' || protocolType === 'retrospective_cohort_study' ? 'do NOT recommend creating a Schedule of Activities as it is not applicable' : 'ensure all components are properly aligned'}.
      
      Format your response as a valid JSON object with the following structure:
      {
        "alignmentAnalysis": {
          "studyObjectives": { "status": "[alignment-status]", "details": "[explanation]" },
          "scheduleOfAssessments": { "status": "${protocolType === 'secondary_data_analysis' || protocolType === 'retrospective_cohort_study' ? 'not_applicable' : '[alignment-status]'}", "details": "${protocolType === 'secondary_data_analysis' || protocolType === 'retrospective_cohort_study' ? 'Schedule of assessments is not applicable for secondary data analysis or retrospective studies' : '[explanation]'}" },
          "inclusionExclusionCriteria": { "status": "[alignment-status]", "details": "[explanation]" },
          "dataVariables": { "status": "[alignment-status]", "details": "[explanation]" },
          "studySchema": { "status": "[alignment-status]", "details": "[explanation]" },
          "statisticalAnalysisPlan": { "status": "[alignment-status]", "details": "[explanation]" }
        },
        "recommendations": [
          { "id": "rec-1", "title": "[recommendation-title]", "description": "[recommendation-details]" },
          { "id": "rec-2", "title": "[recommendation-title]", "description": "[recommendation-details]" }
        ]
      }
    `;
    
    // Call the OpenAI API for the advanced analysis
    const response = await openai.chat.completions.create({
      model: MODEL,
      messages: [
        {
          role: "system",
          content: "You are a clinical protocol design expert with years of experience helping pharmaceutical companies design aligned, efficient clinical trial protocols."
        },
        {
          role: "user",
          content: analysisPrompt
        }
      ],
      temperature: 0.1,
      response_format: { type: "json_object" },
      max_tokens: 2000,
    });
    
    // Parse the AI response
    try {
      const result = JSON.parse(response.choices[0].message.content || "{}");
      
      // Ensure the result has the expected structure
      if (!result.alignmentAnalysis) {
        throw new Error("Invalid response format - missing alignmentAnalysis");
      }
      
      return result;
    } catch (parseError) {
      console.error("Error parsing OpenAI response:", parseError);
      console.log("OpenAI raw response:", response.choices[0].message.content);
      
      // Fall back to basic alignment check
      return generateBasicAlignmentCheck(
        hasSynopsis, 
        hasSchedule, 
        hasCriteria, 
        hasVariables,
        hasSchema,
        hasSAP,
        protocolType
      );
    }
  } catch (error) {
    console.error("Error analyzing protocol alignment:", error);
    return {
      alignmentAnalysis: {
        studyObjectives: {
          status: "not-aligned",
          details: "Error during analysis. Please try again."
        },
        scheduleOfAssessments: {
          status: "not-aligned",
          details: "Error during analysis. Please try again."
        },
        inclusionExclusionCriteria: {
          status: "not-aligned",
          details: "Error during analysis. Please try again."
        },
        dataVariables: {
          status: "not-aligned",
          details: "Error during analysis. Please try again."
        },
        studySchema: {
          status: "not-aligned",
          details: "Error during analysis. Please try again."
        },
        statisticalAnalysisPlan: {
          status: "not-aligned",
          details: "Error during analysis. Please try again."
        }
      },
      recommendations: [
        {
          id: "error-rec",
          title: "Error During Analysis",
          description: "There was an error analyzing your protocol alignment. Please try again or check your protocol components."
        }
      ]
    };
  }
}

/**
 * Helper function to generate a basic alignment check based on component availability
 */
export function generateBasicAlignmentCheck(
  hasSynopsis: boolean,
  hasSchedule: boolean | string,
  hasCriteria: boolean,
  hasVariables: boolean,
  hasSchema: boolean = false,
  hasSAP: boolean = false,
  protocolType?: string
): any {
  // Check if schedule of assessments is relevant for this protocol type
  const isScheduleRelevant = !protocolType || 
                            protocolType === 'interventional_clinical_trial' || 
                            protocolType === 'prospective_cohort_study';
                            
  // Check if this is a MAIC protocol
  const isMAIC = protocolType === 'maic';
  const baseAlignmentResponse = {
    alignmentAnalysis: {
      studyObjectives: {
        status: "unknown",
        details: "Could not analyze study objectives."
      },
      scheduleOfActivities: {
        status: "unknown",
        details: "Could not analyze schedule of activities."
      },
      inclusionExclusionCriteria: {
        status: "unknown",
        details: "Could not analyze inclusion/exclusion criteria."
      },
      dataVariables: {
        status: "unknown",
        details: "Could not analyze data variables."
      },
      studySchema: {
        status: "unknown",
        details: "Could not analyze study schema."
      },
      statisticalAnalysisPlan: {
        status: "unknown",
        details: "Could not analyze statistical analysis plan."
      }
    },
    recommendations: [] as Array<{id: string, title: string, description: string}>
  };
  
  // Add MAIC-specific alignment checks if this is a MAIC protocol
  const maicAlignmentAnalysis = isMAIC ? {
    sourceData: {
      status: "unknown",
      details: "Could not analyze source data configuration."
    },
    targetStudy: {
      status: "unknown",
      details: "Could not analyze target study extraction."
    },
    matchingAlgorithm: {
      status: "unknown",
      details: "Could not analyze matching algorithm."
    },
    sensitivityAnalysis: {
      status: "unknown",
      details: "Could not analyze sensitivity analysis approach."
    },
    effectEstimation: {
      status: "unknown",
      details: "Could not analyze effect size estimation."
    }
  } : {};
  
  // Merge the base alignment response with any protocol-specific checks
  const alignmentResponse = {
    alignmentAnalysis: {
      ...baseAlignmentResponse.alignmentAnalysis,
      ...(isMAIC ? maicAlignmentAnalysis : {})
    },
    recommendations: baseAlignmentResponse.recommendations
  };
  
  // Study objectives analysis
  if (hasSynopsis) {
    alignmentResponse.alignmentAnalysis.studyObjectives = {
      status: "aligned",
      details: "The study objectives are extracted from the synopsis and are available."
    };
  } else {
    alignmentResponse.alignmentAnalysis.studyObjectives = {
      status: "not-aligned",
      details: "Study synopsis is missing. Please provide study objectives in the Synopsis tab."
    };
    alignmentResponse.recommendations.push({
      id: `rec-objectives-${Date.now()}`,
      title: "Add Study Synopsis",
      description: "Add a study synopsis to provide clarity on study objectives, endpoints, and design."
    });
  }
  
  // Schedule of activities analysis - only relevant for certain protocol types
  if (hasSchedule === 'not_applicable') {
    // For secondary data analysis, retrospective studies, etc. where schedule isn't relevant
    alignmentResponse.alignmentAnalysis.scheduleOfActivities = {
      status: "not_applicable",
      details: "Schedule of activities is not applicable for this protocol type."
    };
  } else if (hasSchedule) {
    alignmentResponse.alignmentAnalysis.scheduleOfActivities = {
      status: hasSynopsis ? "aligned" : "partially-aligned",
      details: hasSynopsis ? 
        "The schedule of activities is aligned with the study objectives." : 
        "Schedule of activities is defined but may not be fully aligned with study objectives which are missing."
    };
  } else {
    // Only add this recommendation for protocol types where schedule is relevant (interventional, prospective)
    alignmentResponse.alignmentAnalysis.scheduleOfActivities = {
      status: "not-aligned",
      details: "Schedule of activities is missing. Please generate or add a schedule in the Schedule tab."
    };
    if (isScheduleRelevant) {
      alignmentResponse.recommendations.push({
        id: `rec-schedule-${Date.now()}`,
        title: "Generate Schedule of Activities",
        description: "Define a comprehensive schedule of activities that aligns with your study objectives and endpoints."
      });
    }
  }
  
  // Inclusion/exclusion criteria analysis
  if (hasCriteria) {
    alignmentResponse.alignmentAnalysis.inclusionExclusionCriteria = {
      status: hasSynopsis ? "aligned" : "partially-aligned",
      details: hasSynopsis ? 
        "The inclusion and exclusion criteria are appropriate for the study population described in the objectives." : 
        "Inclusion and exclusion criteria are defined but may not be fully aligned with study objectives which are missing."
    };
  } else {
    alignmentResponse.alignmentAnalysis.inclusionExclusionCriteria = {
      status: "not-aligned",
      details: "Inclusion and/or exclusion criteria are missing. Please define criteria in the Criteria tab."
    };
    alignmentResponse.recommendations.push({
      id: `rec-criteria-${Date.now()}`,
      title: "Define Eligibility Criteria",
      description: "Define comprehensive inclusion and exclusion criteria based on your study population and objectives."
    });
  }
  
  // Data variables analysis
  if (hasVariables) {
    if (hasSchedule === 'not_applicable') {
      // For studies without schedule of assessments
      alignmentResponse.alignmentAnalysis.dataVariables = {
        status: hasSynopsis ? "aligned" : "partially-aligned",
        details: hasSynopsis ? 
          "The data variables are appropriate for the study endpoints." : 
          "Data variables are defined but may not be fully aligned with study objectives which are incomplete."
      };
    } else {
      // For studies with schedule of assessments
      alignmentResponse.alignmentAnalysis.dataVariables = {
        status: (hasSynopsis && hasSchedule) ? "aligned" : "partially-aligned",
        details: (hasSynopsis && hasSchedule) ? 
          "The data variables are appropriate for the study endpoints and align with the schedule of assessments." : 
          "Data variables are defined but may not be fully aligned with study objectives or schedule which are incomplete."
      };
    }
  } else {
    alignmentResponse.alignmentAnalysis.dataVariables = {
      status: "not-aligned",
      details: "Data variables are missing. Please define variables in the Variables tab."
    };
    
    // Provide more specific variable recommendations for different protocol types
    if (protocolType === 'secondary_data_analysis' || protocolType === 'retrospective_cohort_study') {
      alignmentResponse.recommendations.push({
        id: `rec-variables-${Date.now()}`,
        title: "Define Data Variables",
        description: "Specify all variables needed for your secondary data analysis, including outcome measures, exposure variables, and important covariates. Include clear definitions of how each variable will be extracted or calculated from the source data."
      });
    } else {
      alignmentResponse.recommendations.push({
        id: `rec-variables-${Date.now()}`,
        title: "Define Data Variables",
        description: "Define key data variables that will be collected to support your study objectives and endpoints."
      });
    }
  }
  
  // Study Schema analysis
  if (hasSchema) {
    alignmentResponse.alignmentAnalysis.studySchema = {
      status: (hasSynopsis && hasCriteria) ? "aligned" : "partially-aligned",
      details: (hasSynopsis && hasCriteria) ? 
        "The study schema appears to be aligned with the study objectives and eligibility criteria." : 
        "Study schema is defined but may not be fully aligned with other protocol components which are incomplete."
    };
  } else {
    alignmentResponse.alignmentAnalysis.studySchema = {
      status: "not-aligned",
      details: "Study schema is missing. Please generate a study schema in the Schema tab."
    };
    alignmentResponse.recommendations.push({
      id: `rec-schema-${Date.now()}`,
      title: "Generate Study Schema",
      description: "Generate a visual representation of your study flow to clarify study design and participant journey."
    });
  }
  
  // Statistical Analysis Plan analysis
  if (hasSAP) {
    if (hasSchedule === 'not_applicable') {
      // For studies without schedule of assessments
      alignmentResponse.alignmentAnalysis.statisticalAnalysisPlan = {
        status: hasSynopsis ? "aligned" : "partially-aligned",
        details: hasSynopsis ? 
          "The statistical analysis plan appears to be aligned with the study objectives and endpoints." : 
          "Statistical analysis plan is defined but may not be fully aligned with study objectives which are incomplete."
      };
    } else {
      // For studies with schedule of assessments
      alignmentResponse.alignmentAnalysis.statisticalAnalysisPlan = {
        status: (hasSynopsis && hasSchedule) ? "aligned" : "partially-aligned",
        details: (hasSynopsis && hasSchedule) ? 
          "The statistical analysis plan appears to be aligned with the study objectives and endpoints." : 
          "Statistical analysis plan is defined but may not be fully aligned with study objectives or endpoints which are incomplete."
      };
    }
  } else {
    alignmentResponse.alignmentAnalysis.statisticalAnalysisPlan = {
      status: "not-aligned",
      details: "Statistical analysis plan is missing. Please generate an analysis plan in the SAP tab."
    };
    
    // Different guidance based on protocol type
    if (protocolType === 'secondary_data_analysis' || protocolType === 'retrospective_cohort_study') {
      alignmentResponse.recommendations.push({
        id: `rec-sap-${Date.now()}`,
        title: "Generate Statistical Analysis Plan",
        description: "Create a statistical analysis plan specifically designed for secondary data analysis, including approaches for controlling confounding, handling missing data, and assessing the robustness of your findings through sensitivity analyses."
      });
    } else {
      alignmentResponse.recommendations.push({
        id: `rec-sap-${Date.now()}`,
        title: "Generate Statistical Analysis Plan",
        description: "Define your statistical analysis approach to ensure proper evaluation of study endpoints and objectives."
      });
    }
  }

  // Additional recommendations based on overall alignment
  const scheduleComplete = hasSchedule === true || hasSchedule === 'not_applicable';
  
  // General protocol alignment recommendations
  if (!isMAIC) {
    if (hasSynopsis && scheduleComplete && hasCriteria && hasVariables && hasSchema && hasSAP) {
      alignmentResponse.recommendations.push({
        id: `rec-generate-${Date.now()}`,
        title: "Ready to Generate Full Protocol",
        description: "All components are aligned. You can now proceed to generate the full protocol document."
      });
    } else if (hasSynopsis && !scheduleComplete && !hasCriteria && !hasVariables) {
      // For protocols that need schedule of assessments
      if (isScheduleRelevant) {
        alignmentResponse.recommendations.push({
          id: `rec-components-${Date.now()}`,
          title: "Generate Protocol Components",
          description: "Use the Synopsis to generate Schedule of Activities, Eligibility Criteria, and Data Variables."
        });
      } else {
        // For protocols without schedule of assessments (secondary data analysis, etc.)
        alignmentResponse.recommendations.push({
          id: `rec-components-${Date.now()}`,
          title: "Generate Protocol Components",
          description: "Use the Synopsis to generate Eligibility Criteria and Data Variables for your secondary data analysis."
        });
      }
    } else if (hasSynopsis && scheduleComplete && hasCriteria && hasVariables && (!hasSchema || !hasSAP)) {
      alignmentResponse.recommendations.push({
        id: `rec-advanced-components-${Date.now()}`,
        title: "Generate Advanced Protocol Components",
        description: "Your core protocol components are complete. Generate Study Schema and Statistical Analysis Plan to enhance your protocol."
      });
    }
  }
  
  // MAIC-specific alignment analysis
  if (isMAIC) {
    // MAIC-specific components - Since these checks depend on the actual protocol values
    // and this is just a basic checker, we'll create simpler, more generic checks
    
    // Add MAIC-specific sections to the alignment analysis
    alignmentResponse.alignmentAnalysis.sourceData = {
      status: "unknown",
      details: "Source data configuration is required for MAIC analysis."
    };
    
    alignmentResponse.alignmentAnalysis.targetStudy = {
      status: "unknown",
      details: "Target study extraction is required for MAIC analysis."
    };
    
    alignmentResponse.alignmentAnalysis.matchingAlgorithm = {
      status: "unknown",
      details: "Matching algorithm configuration is required for MAIC analysis."
    };
    
    alignmentResponse.alignmentAnalysis.sensitivityAnalysis = {
      status: "unknown",
      details: "Sensitivity analysis approach is required for MAIC analysis."
    };
    
    alignmentResponse.alignmentAnalysis.effectEstimation = {
      status: "unknown",
      details: "Effect size estimation methodology is required for MAIC analysis."
    };
    
    // Add MAIC-specific recommendations
    alignmentResponse.recommendations.push({
      id: `rec-maic-source-${Date.now()}`,
      title: "Configure Source Data",
      description: "Define your source individual patient data (IPD) dataset configuration including key variables and population characteristics."
    });
    
    alignmentResponse.recommendations.push({
      id: `rec-maic-target-${Date.now()}`,
      title: "Extract Target Study Data",
      description: "Extract and define the target study population characteristics, outcome measures, and effect sizes from published literature."
    });
    
    alignmentResponse.recommendations.push({
      id: `rec-maic-matching-${Date.now()}`,
      title: "Configure Matching Algorithm",
      description: "Define your matching algorithm approach, including propensity score method, variables for matching, and weighting approach."
    });
    
    alignmentResponse.recommendations.push({
      id: `rec-maic-sensitivity-${Date.now()}`,
      title: "Define Sensitivity Analyses",
      description: "Specify sensitivity analyses to assess robustness of your MAIC results under different assumptions and matching approaches."
    });
    
    if (!hasSAP) {
      alignmentResponse.recommendations.push({
        id: `rec-maic-effect-${Date.now()}`,
        title: "Define Effect Size Estimation",
        description: "Specify statistical methods for treatment effect estimation, including outcome measures and confidence interval approach."
      });
    }
    
    // Update other sections to be appropriate for MAIC
    // Add type guard to check if alignmentAnalysis exists and has the expected structure
    if (alignmentResponse.alignmentAnalysis && 
        typeof alignmentResponse.alignmentAnalysis === 'object') {
      // Use type assertion to safely access and modify the property
      (alignmentResponse.alignmentAnalysis as any).scheduleOfAssessments = {
        status: "not_applicable",
        details: "Schedule of assessments is not applicable for MAIC analysis."
      };
    }
  }
  
  return alignmentResponse;
}

/**
 * Generates a study schema (flow diagram) based on the protocol synopsis and eligibility criteria
 */
export async function generateStudySchema(
  synopsis: string,
  inclusionCriteria?: any,
  exclusionCriteria?: any,
  protocolType?: string,
  supplementaryInfo?: string[],
  contentStrategyOverride?: string
): Promise<ProtocolComponent> {
  try {
    // Determine what kind of study we're analyzing
    const isInterventional = !protocolType || protocolType === "interventional_clinical_trial";
    const isObservational = protocolType === "prospective_cohort_study" || protocolType === "retrospective_cohort_study";
    const isSecondaryData = protocolType === "secondary_data_analysis";
    const isDelphi = protocolType === "delphi_consensus";
    const isSurvey = protocolType === "cross_sectional_survey" || protocolType === "qualitative_study";
    
    const isMAIC = protocolType === "maic";
    // Prepare the inclusion/exclusion criteria text if available
    let criteriaText = "";
    if (inclusionCriteria && inclusionCriteria.categories) {
      criteriaText += "\nINCLUSION CRITERIA:\n";
      inclusionCriteria.categories.forEach((category: any) => {
        criteriaText += `${category.name}:\n`;
        category.criteria.forEach((criterion: string, i: number) => {
          criteriaText += `${i+1}. ${criterion}\n`;
        });
      });
    }
    if (exclusionCriteria && exclusionCriteria.categories) {
      criteriaText += "\nEXCLUSION CRITERIA:\n";
      exclusionCriteria.categories.forEach((category: any) => {
        criteriaText += `${category.name}:\n`;
        category.criteria.forEach((criterion: string, i: number) => {
          criteriaText += `${i+1}. ${criterion}\n`;
        });
      });
    }
    
    // Different schema requirements based on protocol type
    let schemaRequirements = '';
    let nodeTypes = '';
    let schemaExample = '';
    
    // Schema generation already has the isMAIC variable defined
    
    if (isInterventional) {
      schemaRequirements = `
      The Study Schema should represent the flow of participants through the clinical trial, including:
      1. Screening phase
      2. Randomization (if applicable)
      3. Treatment arms with appropriate labels
      4. Assessment timepoints
      5. Primary and secondary endpoints
      6. Study phases (e.g., screening, treatment, follow-up)`;
      
      nodeTypes = `
      1. nodes: Array of node objects with the following properties:
         - id: Unique identifier
         - type: One of "studyPhase", "screening", "randomization", "treatment", "assessment", "endpoint"
         - position: {x, y} coordinates for positioning
         - data: Object containing label and optional description`;
         
      schemaExample = `
      For example, for an interventional trial, your nodes might include:
      [
        { "id": "1", "type": "studyPhase", "position": { "x": 250, "y": 25 }, "data": { "label": "Screening Phase" } },
        { "id": "2", "type": "screening", "position": { "x": 250, "y": 100 }, "data": { "label": "Screening", "description": "Assess eligibility via inclusion/exclusion criteria" } },
        { "id": "3", "type": "randomization", "position": { "x": 250, "y": 175 }, "data": { "label": "Randomization", "description": "1:1 ratio" } },
        { "id": "4", "type": "treatment", "position": { "x": 100, "y": 250 }, "data": { "label": "Treatment Arm A", "description": "Drug X 10mg daily" } },
        { "id": "5", "type": "treatment", "position": { "x": 400, "y": 250 }, "data": { "label": "Treatment Arm B", "description": "Placebo daily" } },
        { "id": "6", "type": "studyPhase", "position": { "x": 250, "y": 325 }, "data": { "label": "Follow-up Phase" } },
        { "id": "7", "type": "assessment", "position": { "x": 250, "y": 400 }, "data": { "label": "Efficacy Assessment", "description": "Week 12" } },
        { "id": "8", "type": "endpoint", "position": { "x": 250, "y": 475 }, "data": { "label": "Primary Endpoint", "description": "Change in disease severity score from baseline" } }
      ]`;
    } 
    else if (isMAIC) {
      schemaRequirements = `
      The Study Schema for this Matching-Adjusted Indirect Comparison (MAIC) analysis should represent the data flow and analytical process, including:
      1. Source data configuration (IPD dataset)
      2. Target study data extraction
      3. Matching algorithm application
      4. Effect size estimation
      5. Sensitivity analyses
      6. Key study phases (e.g., data preparation, matching, analysis)`;
      
      nodeTypes = `
      1. nodes: Array of node objects with the following properties:
         - id: Unique identifier
         - type: One of "studyPhase", "dataSource", "dataPreparation", "matching", "analysis", "outcome", "sensitivity"
         - position: {x, y} coordinates for positioning
         - data: Object containing label and optional description`;
         
      schemaExample = `
      For example, for a MAIC analysis, your nodes might include:
      [
        { "id": "1", "type": "studyPhase", "position": { "x": 250, "y": 25 }, "data": { "label": "Data Preparation Phase" } },
        { "id": "2", "type": "dataSource", "position": { "x": 100, "y": 100 }, "data": { "label": "Source IPD Dataset", "description": "Individual patient data from clinical trial X" } },
        { "id": "3", "type": "dataSource", "position": { "x": 400, "y": 100 }, "data": { "label": "Target Study Data", "description": "Published aggregate data from study Y" } },
        { "id": "4", "type": "dataPreparation", "position": { "x": 250, "y": 175 }, "data": { "label": "Variable Alignment", "description": "Aligning variables between source and target datasets" } },
        { "id": "5", "type": "studyPhase", "position": { "x": 250, "y": 250 }, "data": { "label": "Matching Phase" } },
        { "id": "6", "type": "matching", "position": { "x": 250, "y": 325 }, "data": { "label": "Propensity Score Weighting", "description": "Method of moments optimization" } },
        { "id": "7", "type": "studyPhase", "position": { "x": 250, "y": 400 }, "data": { "label": "Analysis Phase" } },
        { "id": "8", "type": "analysis", "position": { "x": 250, "y": 475 }, "data": { "label": "Effect Size Estimation", "description": "Hazard ratio calculation with confidence intervals" } },
        { "id": "9", "type": "sensitivity", "position": { "x": 250, "y": 550 }, "data": { "label": "Sensitivity Analyses", "description": "Alternative matching variables and model specifications" } },
        { "id": "10", "type": "outcome", "position": { "x": 250, "y": 625 }, "data": { "label": "MAIC Result", "description": "Indirect treatment comparison result" } }
      ]`;
    }
    else if (isSecondaryData) {
      schemaRequirements = `
      The Study Schema for this secondary data analysis should represent the data extraction and analysis workflow, including:
      1. Data source identification
      2. Database extraction parameters
      3. Cohort definition with inclusion/exclusion criteria
      4. Variable extraction and transformation
      5. Analysis approach
      6. Primary and secondary outcomes
      7. Key study phases (e.g., data extraction, cohort building, analysis)`;
      
      nodeTypes = `
      1. nodes: Array of node objects with the following properties:
         - id: Unique identifier
         - type: One of "studyPhase", "dataSource", "cohort", "dataExtraction", "analysis", "outcome"
         - position: {x, y} coordinates for positioning
         - data: Object containing label and optional description`;
         
      schemaExample = `
      For example, for a secondary data analysis, your nodes might include:
      [
        { "id": "1", "type": "studyPhase", "position": { "x": 250, "y": 25 }, "data": { "label": "Data Extraction Phase" } },
        { "id": "2", "type": "dataSource", "position": { "x": 250, "y": 100 }, "data": { "label": "Data Source", "description": "Electronic Health Records from Regional Hospital Network 2020-2023" } },
        { "id": "3", "type": "cohort", "position": { "x": 250, "y": 175 }, "data": { "label": "Apply Database Inclusion Criteria", "description": "Adults with ICD-10 code C61 (prostate cancer)" } },
        { "id": "4", "type": "cohort", "position": { "x": 250, "y": 250 }, "data": { "label": "Apply Exclusion Criteria", "description": "Exclude patients with prior systemic therapy" } },
        { "id": "5", "type": "dataExtraction", "position": { "x": 100, "y": 325 }, "data": { "label": "Treatment Cohort", "description": "Patients receiving Apalutamide" } },
        { "id": "6", "type": "dataExtraction", "position": { "x": 400, "y": 325 }, "data": { "label": "Comparison Cohort", "description": "Patients receiving Enzalutamide" } },
        { "id": "7", "type": "studyPhase", "position": { "x": 250, "y": 400 }, "data": { "label": "Analysis Phase" } },
        { "id": "8", "type": "analysis", "position": { "x": 250, "y": 475 }, "data": { "label": "Statistical Analysis", "description": "Propensity score matching" } },
        { "id": "9", "type": "outcome", "position": { "x": 250, "y": 550 }, "data": { "label": "Primary Outcome", "description": "Overall Survival at 24 months" } }
      ]`;
    }
    else if (isObservational) {
      schemaRequirements = `
      The Study Schema should represent the flow of this observational cohort study, including:
      1. Participant identification and enrollment (not screening)
      2. Baseline data collection
      3. Exposure assessment (IMPORTANT: Treatment/exposure starts BEFORE study participation in observational studies)
      4. Follow-up procedures and timepoints
      5. Primary and secondary outcomes measurement
      6. Key study phases (e.g., enrollment, follow-up, analysis)
      
      IMPORTANT: For observational studies, unlike interventional trials:
      - There is no screening phase (use "Enrollment Phase" instead)
      - There is no randomization
      - Treatments/exposures are not assigned by researchers but observed (patients are already receiving treatments)
      - Focus on data collection, not treatment administration`;
      
      nodeTypes = `
      1. nodes: Array of node objects with the following properties:
         - id: Unique identifier
         - type: One of "studyPhase", "enrollment", "cohort", "exposure", "assessment", "outcome"
         - position: {x, y} coordinates for positioning
         - data: Object containing label and optional description`;
         
      schemaExample = `
      For example, for a prospective cohort study, your nodes might include:
      [
        { "id": "1", "type": "studyPhase", "position": { "x": 250, "y": 25 }, "data": { "label": "Enrollment Phase" } },
        { "id": "2", "type": "enrollment", "position": { "x": 250, "y": 100 }, "data": { "label": "Enrollment", "description": "Identify eligible participants already receiving treatment" } },
        { "id": "3", "type": "cohort", "position": { "x": 250, "y": 175 }, "data": { "label": "Baseline Assessment", "description": "Complete baseline measurements and exposure documentation" } },
        { "id": "4", "type": "exposure", "position": { "x": 100, "y": 250 }, "data": { "label": "Treatment Group", "description": "Participants already receiving treatment of interest" } },
        { "id": "5", "type": "exposure", "position": { "x": 400, "y": 250 }, "data": { "label": "Comparison Group", "description": "Participants receiving standard of care" } },
        { "id": "6", "type": "studyPhase", "position": { "x": 250, "y": 325 }, "data": { "label": "Follow-up Phase" } },
        { "id": "7", "type": "assessment", "position": { "x": 250, "y": 400 }, "data": { "label": "Follow-up Assessments", "description": "6, 12, and 24 months" } },
        { "id": "8", "type": "outcome", "position": { "x": 250, "y": 475 }, "data": { "label": "Primary Outcome", "description": "Incidence of outcome at 24 months" } }
      ]`;
    }
    else if (isDelphi) {
      schemaRequirements = `
      The Study Schema should represent the flow of the Delphi consensus process, including:
      1. Expert panel recruitment
      2. Statement development phase
      3. Delphi rounds
      4. Consensus determination
      5. Final report/outcome
      6. Study phases (e.g., preparation, rounds, analysis)`;
      
      nodeTypes = `
      1. nodes: Array of node objects with the following properties:
         - id: Unique identifier
         - type: One of "studyPhase", "panelRecruitment", "statementDevelopment", "delphiRound", "consensusAnalysis", "outcome"
         - position: {x, y} coordinates for positioning
         - data: Object containing label and optional description`;
         
      schemaExample = `
      For example, for a Delphi consensus study, your nodes might include:
      [
        { "id": "1", "type": "studyPhase", "position": { "x": 250, "y": 25 }, "data": { "label": "Preparation Phase" } },
        { "id": "2", "type": "panelRecruitment", "position": { "x": 250, "y": 100 }, "data": { "label": "Expert Panel Recruitment", "description": "25 experts from across multiple disciplines" } },
        { "id": "3", "type": "statementDevelopment", "position": { "x": 250, "y": 175 }, "data": { "label": "Statement Development", "description": "Literature review and expert input to develop initial statements" } },
        { "id": "4", "type": "studyPhase", "position": { "x": 250, "y": 250 }, "data": { "label": "Consensus Phase" } },
        { "id": "5", "type": "delphiRound", "position": { "x": 250, "y": 325 }, "data": { "label": "Round 1", "description": "Rating of 40 statements on 9-point Likert scale" } },
        { "id": "6", "type": "delphiRound", "position": { "x": 250, "y": 400 }, "data": { "label": "Round 2", "description": "Re-rating after reviewing anonymous group feedback" } },
        { "id": "7", "type": "delphiRound", "position": { "x": 250, "y": 475 }, "data": { "label": "Round 3", "description": "Final rating for statements without consensus" } },
        { "id": "8", "type": "consensusAnalysis", "position": { "x": 250, "y": 550 }, "data": { "label": "Consensus Analysis", "description": "Analysis of agreement and stability" } },
        { "id": "9", "type": "outcome", "position": { "x": 250, "y": 625 }, "data": { "label": "Final Consensus Statements", "description": "30 statements with consensus approval" } }
      ]`;
    }
    else if (isSurvey) {
      schemaRequirements = `
      The Study Schema should represent the flow of the ${protocolType === "cross_sectional_survey" ? "cross-sectional survey" : "qualitative study"}, including:
      1. Participant recruitment
      2. Survey/interview administration
      3. Data collection phases
      4. Analysis approach
      5. Primary and secondary outcomes
      6. Study phases (e.g., preparation, data collection, analysis)`;
      
      nodeTypes = `
      1. nodes: Array of node objects with the following properties:
         - id: Unique identifier
         - type: One of "studyPhase", "recruitment", "survey", "dataCollection", "analysis", "outcome"
         - position: {x, y} coordinates for positioning
         - data: Object containing label and optional description`;
         
      schemaExample = `
      For example, for a ${protocolType === "cross_sectional_survey" ? "cross-sectional survey" : "qualitative study"}, your nodes might include:
      [
        { "id": "1", "type": "studyPhase", "position": { "x": 250, "y": 25 }, "data": { "label": "Preparation Phase" } },
        { "id": "2", "type": "recruitment", "position": { "x": 250, "y": 100 }, "data": { "label": "Participant Recruitment", "description": "Online and community-based recruitment" } },
        { "id": "3", "type": "survey", "position": { "x": 250, "y": 175 }, "data": { "label": "Survey Development", "description": "Instrument validation and pilot testing" } },
        { "id": "4", "type": "studyPhase", "position": { "x": 250, "y": 250 }, "data": { "label": "Data Collection Phase" } },
        { "id": "5", "type": "dataCollection", "position": { "x": 250, "y": 325 }, "data": { "label": "Survey Administration", "description": "Online survey completion with follow-up" } },
        { "id": "6", "type": "studyPhase", "position": { "x": 250, "y": 400 }, "data": { "label": "Analysis Phase" } },
        { "id": "7", "type": "analysis", "position": { "x": 250, "y": 475 }, "data": { "label": "Statistical Analysis", "description": "Descriptive and multivariate analysis" } },
        { "id": "8", "type": "outcome", "position": { "x": 250, "y": 550 }, "data": { "label": "Primary Outcome", "description": "Prevalence of key variables and associated factors" } }
      ]`;
    }
    else {
      // Default to interventional if unrecognized type
      schemaRequirements = `
      The Study Schema should represent the flow of participants through the trial, including:
      1. Screening phase
      2. Randomization (if applicable)
      3. Treatment arms with appropriate labels
      4. Assessment timepoints
      5. Primary and secondary endpoints
      6. Study phases (e.g., screening, treatment, follow-up)`;
      
      nodeTypes = `
      1. nodes: Array of node objects with the following properties:
         - id: Unique identifier
         - type: One of "studyPhase", "screening", "randomization", "treatment", "assessment", "endpoint"
         - position: {x, y} coordinates for positioning
         - data: Object containing label and optional description`;
    }

    const schemaStrategy = contentStrategyOverride === "preserve" || contentStrategyOverride === "augment" || contentStrategyOverride === "generate"
      ? contentStrategyOverride
      : "augment";

    const prompt = `
      You are an expert ${isInterventional ? "clinical trial protocol" : isObservational ? "observational study" : isSecondaryData ? "real-world evidence" : isMAIC ? "MAIC methodology" : isDelphi ? "consensus method" : "research"} developer with expertise in Schedule of Activities design and reproduction.

      USER SELECTED CONTENT STRATEGY: ${schemaStrategy.toUpperCase()}
      ${schemaStrategy === "preserve" ? "Extract-only mode: use documented study schema, participant flow, arms, visits, or schedule structure only if it is present in the source documents. If no such source content is present, return sourceStatus: \"not_found\", nodes: [], edges: [], and a clear explanation. Do not invent a schema in preserve mode." : schemaStrategy === "augment" ? "Use documented source structure as the foundation, improve clarity, and fill only important gaps." : "Generate a complete study schema from the current synopsis and relevant references."}
      
      CRITICAL FIRST STEP: Carefully examine the provided synopsis to determine if it contains an existing Schedule of Activities, visit schedule, assessment timeline, or study timepoint table. Look for:
      - Tables with visit timepoints or assessment schedules
      - Detailed timing of procedures, assessments, or visits
      - Study phase descriptions with specific timepoints
      - Assessment windows or visit schedules
      - Complex tabular data showing when specific procedures occur

      CRITICAL SOURCE FIGURE HANDLING:
      - If the synopsis or supplementary information contains "IMAGE / FIGURE EXTRACTS", "IMAGE / FIGURE DETECTED", "Vision/OCR interpretation", or "Study schema figure candidate", treat that as an existing source schema/participant-flow figure.
      - In preserve mode, reproduce the documented figure as closely as possible using the available lanes, nodes, and edges. Do not replace it with a generic trial flow.
      - Preserve period labels, date/day ranges, randomization ratio, planned N by arm, treatment/dose labels, endpoint milestone timing, and follow-up timing when present.
      - Use parallel rows for treatment arms/cohorts and chronological columns for periods such as Screening, Double-blinded, Open-label, and Follow-up.
      - If a figure is detected but some visual details are uncertain, create the closest faithful editable schema and add a short note that user confirmation against the source figure is needed.
      
      CONDITIONAL APPROACH:
      
      IF YOU IDENTIFY AN EXISTING SCHEDULE OF ACTIVITIES:
      - REPRODUCTION MODE: You MUST accurately reproduce the existing schedule information
      - Extract the exact visit timepoints, assessment names, and timing from the document
      - Preserve the specific study phases and their timepoints as documented
      - Create nodes that match the documented timepoints (e.g., "Screening", "Day 1", "Week 4", "Month 6", "End of Study")
      - Use the actual assessment names and procedures from the existing schedule
      - Maintain the complexity and detail of the original tabular schedule
      - DO NOT invent new timepoints or assessments not mentioned in the existing schedule
      - Focus on converting the existing tabular information into a visual flow diagram
      
      IF NO EXISTING SCHEDULE IS PRESENT:
      - In preserve mode: return sourceStatus "not_found", empty nodes and edges, and explain that no source schema/flow/schedule structure was found
      - In improve or generate mode: create a comprehensive study schema based on the study design and protocol described
      
      IMPORTANT: Focus specifically on the ${isInterventional ? "disease, treatment, and population" : isObservational ? "exposure, population, and outcomes" : isSecondaryData ? "data source, variables, and analysis approach" : isMAIC ? "source data, target data, matching algorithm, and effect estimation" : isDelphi ? "research question, expert panel, and consensus methodology" : "research question, methodology, and population"} mentioned in the synopsis.
      DO NOT default to generating content for any specific disease unless it's mentioned in the synopsis.
      Tailor the schema specifically to the ${isInterventional ? "condition and intervention" : isObservational ? "exposure and outcomes" : isSecondaryData ? "data sources and outcomes" : isMAIC ? "source data, target study, matching approach, and outcome measures" : "research focus and methodology"} described in the synopsis.
      
      SYNOPSIS:
      ${synopsis}

      ${supplementaryInfo && supplementaryInfo.length > 0 ? `SUPPLEMENTARY INFORMATION AND FILE USAGE INSTRUCTIONS:\nUse these items only according to their usage instructions.\n${supplementaryInfo.join('\n\n---\n\n')}\n` : ""}
      
      ${criteriaText ? criteriaText : ""}
      
      ${schemaRequirements}
      
      Your response must be JSON for a one-slide executive study schema, not SVG and not ReactFlow.
      Return this exact top-level structure:
      {
        "mode": "flow|timeline",
        "title": "concise schema title",
        "schemaType": "interventional_trial_flow|cohort_flow|data_flow|consensus_flow|data_collection_flow|indirect_comparison_flow",
        "orientation": "horizontal|vertical",
        "detailLevel": "simple|standard|detailed",
        "sourceStatus": "found|not_found",
        "sourceStatusMessage": "short source-use explanation",
        "explanation": "what was created and why",
        "sourceFigure": {
          "sourceLabel": "source file or figure label if known",
          "pageHint": "page or section hint if known",
          "extractedText": "short extracted source-figure text used to build the schema",
          "confidence": "high|medium|low"
        },
        "timelineSchema": {
          "periods": [
            { "id": "short-id", "label": "Screening Period", "range": "Day -13 to Day 0", "column": 0 }
          ],
          "arms": [
            { "id": "short-id", "label": "Arm 1", "n": "N=10", "description": "optional short arm description" }
          ],
          "cells": [
            { "id": "short-id", "armId": "matching arm id", "periodId": "matching period id", "text": "HBM9161 680 mg (QW, 6 doses)", "kind": "screening|treatment|placebo|followup|assessment" }
          ],
          "milestones": [
            { "id": "short-id", "label": "Primary endpoint analysis: Day 43", "periodId": "matching period id", "armId": "optional arm id", "position": "bottom|top|cell" }
          ],
          "connectors": [
            { "id": "short-id", "from": "source id", "to": "target id", "label": "optional label" }
          ]
        },
        "lanes": [
          { "id": "short-id", "label": "Lane label", "description": "optional short lane description" }
        ],
        "nodes": [
          {
            "id": "short-id",
            "laneId": "matching lane id",
            "label": "short node label",
            "subtitle": "short detail shown inside the card",
            "kind": "start|screening|decision|arm|cohort|database|assessment|analysis|output|milestone",
            "column": 0,
            "row": 0
          }
        ],
        "edges": [
          { "id": "short-id", "from": "source node id", "to": "target node id", "label": "optional label", "style": "solid|dashed" }
        ],
        "notes": ["short caveat or source-use note"]
      }

      Keep the schema readable:
      - If an existing source schema figure is detected, set mode to "timeline" and populate timelineSchema. Keep lanes/nodes/edges as a minimal fallback only.
      - For timeline mode, every source treatment arm must be a separate arm row. Do not combine Arm 1, Arm 2, and Arm 3 into one node or cell.
      - For timeline mode, every source study period must be a separate period column. Preserve day ranges in the period range field.
      - For timeline mode, put dosing/treatment text into cells at the intersection of the correct arm and period.
      - For timeline mode, put randomization ratio and total N in sourceStatusMessage or milestones if present.
      - Use 1 to 3 lanes.
      - Use 4 to 9 nodes unless the source clearly requires more.
      - Use short labels that fit inside cards.
      - Use columns from left to right in chronological or analytical order.
      - Put parallel treatment arms or cohorts in the same column with different rows.
      - Use notes only for important protocol caveats that must be shown to the user.
      - Do not add generic notes such as "schema is based on the study design as described" or "without a specific Schedule of Activities found".

      If no source flow or schedule exists and the selected strategy is preserve, return sourceStatus "not_found", lanes: [], nodes: [], edges: [], and a clear sourceStatusMessage. Do not invent a schema.
      
      COMPLEX TABLE HANDLING: If you identified an existing Schedule of Activities with complex tabular data, ensure you:
      1. Capture all the timepoints from the table columns (e.g., Screening, Day 1, Week 2, Week 4, etc.)
      2. Include key assessments from the table rows with their specific timing
      3. Represent study phases that span multiple timepoints
      4. Preserve the granular detail of when specific procedures occur
      5. Create assessment nodes that reflect the actual complexity of the original schedule
      
      ${schemaExample}
      Be specific with labels based on the provided protocol information.
      ${isInterventional ? "If the study includes randomization, specify the randomization ratio in the description.\nFor treatment arms, specify the treatment in each arm according to the protocol." : isMAIC ? "For MAIC analysis, specify the source data, target study, matching algorithm details, and effect measure used." : isObservational || isSecondaryData ? "For cohort groups, specify the exposure or cohort definition in each group according to the protocol." : ""}
      ${!isMAIC ? "For assessment nodes, if reproducing an existing schedule, use the exact timepoints and assessment names from the document. If generating new, specify appropriate timing in the description." : ""}
      For ${isInterventional ? "endpoint" : isMAIC ? "outcome" : "outcome"} nodes, use the appropriate ${isInterventional ? "endpoint" : isMAIC ? "effect estimate" : "outcome"} from the protocol.
      
      IMPORTANT: Begin your analysis by clearly stating whether you identified an existing Schedule of Activities in the synopsis, then proceed accordingly.
    `;

    const response = await openai.chat.completions.create({
      model: MODEL,
      messages: [
        { role: "system", content: "You are a clinical protocol expert assistant." },
        { role: "user", content: prompt },
      ],
      response_format: { type: "json_object" },
      temperature: 0.3,
    });

    const result = safeParseJson(response.choices[0].message.content);
    return result as ProtocolComponent;
  } catch (error) {
    console.error("Error generating study schema:", error);
    throwOpenAIServiceError(error, "Failed to generate study schema");
  }
}

/**
 * Generates a statistical analysis plan based on the protocol synopsis and eligibility criteria
 */
export async function generateStatisticalAnalysisPlan(
  synopsis: string,
  inclusionCriteria?: any,
  exclusionCriteria?: any,
  protocolType?: string,
  alignmentAnalysis?: any,
  supplementaryInfo?: string[],
  contentStrategyOverride?: string
): Promise<ProtocolComponent> {
  try {
    // Determine what kind of study we're analyzing
    const isInterventional = !protocolType || protocolType === "interventional_clinical_trial";
    const isObservational = protocolType === "prospective_cohort_study" || protocolType === "retrospective_cohort_study";
    const isSecondaryData = protocolType === "secondary_data_analysis";
    const isDelphi = protocolType === "delphi_consensus";
    const isSurvey = protocolType === "cross_sectional_survey" || protocolType === "qualitative_study";
    const isMAIC = protocolType === "maic";
    
    // Prepare the inclusion/exclusion criteria text if available
    let criteriaText = "";
    if (inclusionCriteria && inclusionCriteria.categories) {
      criteriaText += "\nINCLUSION CRITERIA:\n";
      inclusionCriteria.categories.forEach((category: any) => {
        criteriaText += `${category.name}:\n`;
        category.criteria.forEach((criterion: string, i: number) => {
          criteriaText += `${i+1}. ${criterion}\n`;
        });
      });
    }
    if (exclusionCriteria && exclusionCriteria.categories) {
      criteriaText += "\nEXCLUSION CRITERIA:\n";
      exclusionCriteria.categories.forEach((category: any) => {
        criteriaText += `${category.name}:\n`;
        category.criteria.forEach((criterion: string, i: number) => {
          criteriaText += `${i+1}. ${criterion}\n`;
        });
      });
    }

    // Different analysis requirements based on protocol type
    let analysisRequirements;
    let outputFormat;
    
    if (isInterventional) {
      analysisRequirements = `
      The Statistical Analysis Plan should include:
      1. Sample size calculation and justification
      2. Primary endpoint(s) definition and analysis method
      3. Secondary endpoint(s) definition and analysis method
      4. Exploratory endpoint(s) for hypothesis generation
      5. Estimands following ICH E9(R1) guidelines with four key components:
         - Population (target trial population)
         - Variable (outcome measure)
         - Population-level summary (how the variable is combined across patients)
         - Intercurrent event handling strategy (treatment policy, composite, hypothetical, while-on-treatment, or principal stratum)
      6. Analysis populations (e.g., ITT, PP, Safety)
      7. Statistical methods for primary and secondary analyses
      8. Interim analysis planning (if study duration >6 months or safety concerns)
      9. Data monitoring committee structure and stopping rules
      10. Multiplicity adjustments for multiple endpoints/comparisons
      11. Missing data handling strategy with comprehensive approach:
          - Primary analysis approach (Complete Case, Multiple Imputation, etc.)
          - Missing mechanism assumption justification (MCAR, MAR, MNAR)
          - Sensitivity analyses for assessing robustness
          - Study-specific considerations based on protocol type
          - Detailed reporting plan for transparency`;
      
      outputFormat = `
      {
        "sampleSize": {
          "total": number,
          "perArm": number, 
          "justification": string
        },
        "primaryEndpoints": [
          {
            "id": number,
            "name": string,
            "type": string,
            "timepoint": string,
            "method": string,
            "description": string
          }
        ],
        "secondaryEndpoints": [
          {
            "id": number,
            "name": string,
            "type": string,
            "timepoint": string,
            "method": string,
            "description": string
          }
        ],
        "exploratoryEndpoints": [
          {
            "id": number,
            "name": string,
            "type": string,
            "timepoint": string,
            "method": string,
            "description": string
          }
        ],
        "estimands": [
          {
            "id": number,
            "endpointName": string,
            "population": string,
            "variable": string,
            "populationLevelSummary": string,
            "intercurrentEventStrategy": "treatment_policy" | "composite" | "hypothetical" | "while_on_treatment" | "principal_stratum",
            "intercurrentEventHandling": string,
            "justification": string,
            "estimandType": "primary" | "secondary" | "exploratory"
          }
        ],
        "analysisPopulations": [
          {
            "id": number,
            "name": string,
            "definition": string
          }
        ],
        "statisticalMethods": [
          {
            "id": number,
            "name": string,
            "type": string,
            "description": string
          }
        ],
        "interimAnalysis": {
          "planned": boolean,
          "rationale": string,
          "analyses": [
            {
              "id": number,
              "timepoint": string,
              "type": "efficacy" | "futility" | "safety",
              "sampleSizeAtAnalysis": number,
              "stoppingBoundaries": string,
              "methodology": string
            }
          ],
          "dataMonitoringCommittee": {
            "structure": string,
            "responsibilities": string,
            "meetingFrequency": string
          },
          "alphaSpending": {
            "function": string,
            "justification": string
          }
        },
        "multiplicityControl": {
          "approach": string,
          "method": string,
          "justification": string
        },
        "missingDataStrategy": {
          "primaryApproach": "complete_case" | "available_case" | "multiple_imputation" | "last_observation" | "mixed_model" | "other",
          "primaryJustification": string,
          "missingMechanismAssumption": "mcar" | "mar" | "mnar",
          "mechanismJustification": string,
          "imputationMethods": [string],
          "sensitivityAnalyses": [
            {
              "method": string,
              "description": string
            }
          ],
          "reportingPlan": string,
          "studySpecificConsiderations": string
        }
      }`;
    }
    else if (isObservational || isSecondaryData) {
      analysisRequirements = `
      The Statistical Analysis Plan for this ${isObservational ? "observational cohort study" : "secondary data analysis"} should include:
      1. Sample size/power considerations
      2. Primary outcome(s) definition and analysis method
      3. Secondary outcome(s) definition and analysis method
      4. Cohort definition and data sources
      5. Comprehensive bias assessment and mitigation strategies
      6. Causal inference methodology (if applicable)
      7. Propensity score analysis (when appropriate)
      8. Negative control analyses for unmeasured confounding
      9. Multiple sensitivity analyses for key assumptions
      10. Missing data handling strategy with bias implications:
          - Primary analysis approach considering observational study biases
          - Missing mechanism assumption with clinical rationale
          - Multiple sensitivity analyses for bias assessment
          - Study-specific considerations for cohort studies
          - Comprehensive reporting plan
      ${protocolType === "prospective_cohort_study" ? "11. Interim analysis planning for monitoring baseline characteristics, recruitment, safety, and data quality" : ""}`;
      
      outputFormat = `
      {
        "sampleSize": {
          "estimatedTotal": number,
          "powerConsiderations": string,
          "justification": string
        },
        "primaryOutcomes": [
          {
            "id": number,
            "name": string,
            "definition": string,
            "method": string,
            "description": string
          }
        ],
        "secondaryOutcomes": [
          {
            "id": number,
            "name": string,
            "definition": string,
            "method": string,
            "description": string
          }
        ],
        "cohortDefinition": {
          "definition": string,
          "dataSources": [string],
          "timeframe": string
        },
        "biasAssessment": {
          "overallRisk": "low" | "moderate" | "high",
          "selectionBias": {
            "riskLevel": "low" | "moderate" | "high",
            "specificTypes": [
              {
                "type": "healthy_user_bias" | "channeling_bias" | "immortal_time_bias" | "collider_bias" | "protopathic_bias" | "survivor_bias",
                "description": string,
                "mitigation": string
              }
            ]
          },
          "informationBias": {
            "riskLevel": "low" | "moderate" | "high",
            "mitigationStrategies": [string]
          },
          "confoundingBias": {
            "riskLevel": "low" | "moderate" | "high",
            "identifiedConfounders": [string],
            "residualConfounding": string
          }
        },
        "causalInference": {
          "applicable": boolean,
          "framework": string,
          "assumptions": [string],
          "methodology": string
        },
        "propensityScoreAnalysis": {
          "indicated": boolean,
          "method": "matching" | "stratification" | "weighting" | "covariate_adjustment",
          "covariates": [string],
          "balanceAssessment": string
        },
        "negativeControls": {
          "outcomeControls": [
            {
              "outcome": string,
              "rationale": string
            }
          ],
          "exposureControls": [
            {
              "exposure": string,
              "rationale": string
            }
          ]
        },
        "statisticalMethods": [
          {
            "id": number,
            "name": string,
            "type": string,
            "description": string,
            "biasConsiderations": string
          }
        ],
        "sensitivityAnalyses": [
          {
            "id": number,
            "scenario": string,
            "approach": string,
            "biasTarget": string,
            "interpretation": string
          }
        ],
        "missingDataStrategy": {
          "primaryApproach": "complete_case" | "available_case" | "multiple_imputation" | "last_observation" | "mixed_model" | "other",
          "primaryJustification": string,
          "missingMechanismAssumption": "mcar" | "mar" | "mnar",
          "mechanismJustification": string,
          "imputationMethods": [string],
          "sensitivityAnalyses": [
            {
              "method": string,
              "description": string
            }
          ],
          "reportingPlan": string,
          "studySpecificConsiderations": string
        }${protocolType === "prospective_cohort_study" ? `,
        "interimAnalysis": {
          "planned": boolean,
          "rationale": string,
          "analyses": [
            {
              "id": number,
              "timepoint": string,
              "type": "baseline" | "recruitment" | "safety" | "data_quality",
              "sampleSizeAtAnalysis": number,
              "methodology": string,
              "stoppingCriteria": string
            }
          ],
          "dataMonitoringCommittee": {
            "structure": string,
            "responsibilities": string,
            "meetingFrequency": string
          }
        }` : ""}
      }`;
    }
    else if (isMAIC) {
      analysisRequirements = `
      The Statistical Analysis Plan for this Matching-Adjusted Indirect Comparison (MAIC) should include:
      1. Source data description and preparation approach
      2. Target study data extraction methods
      3. Matching algorithm and propensity score methods
      4. Effect size estimation approaches
      5. Sensitivity analyses to test robustness
      6. Subgroup analyses (if applicable)
      7. Missing data handling in both source and target studies
      8. Approaches to handling uncertainty`;
      
      outputFormat = `
      {
        "sourceData": {
          "description": string,
          "preparationSteps": [string],
          "variables": [string]
        },
        "targetStudyData": {
          "extractionMethod": string,
          "aggregatedData": [string],
          "publications": [string]
        },
        "matchingAlgorithm": {
          "method": string,
          "covariates": [string],
          "weightingApproach": string,
          "balanceAssessment": string
        },
        "effectSizeEstimation": {
          "measures": [string],
          "statisticalModels": [string],
          "confidenceIntervals": string
        },
        "sensitivityAnalyses": [
          {
            "id": number,
            "scenario": string,
            "approach": string,
            "rationale": string
          }
        ],
        "uncertaintyHandling": {
          "approach": string,
          "limitations": [string]
        },
        "missingDataStrategy": {
          "primaryApproach": "complete_case" | "available_case" | "multiple_imputation" | "last_observation" | "mixed_model" | "other",
          "primaryJustification": string,
          "missingMechanismAssumption": "mcar" | "mar" | "mnar",
          "mechanismJustification": string,
          "imputationMethods": [string],
          "sensitivityAnalyses": [
            {
              "method": string,
              "description": string
            }
          ],
          "reportingPlan": string,
          "studySpecificConsiderations": string
        }
      }`;
    }
    else if (isDelphi || isSurvey) {
      analysisRequirements = `
      The Analysis Plan for this ${isDelphi ? "Delphi consensus study" : "survey/qualitative study"} should include:
      1. Sample size/recruitment considerations
      2. Data collection approach
      3. Analysis methods (qualitative and/or quantitative)
      4. Consensus definitions (for Delphi) or validation approach (for surveys)
      5. Data coding or categorization approach`;
      
      outputFormat = `
      {
        "sampleSize": {
          "target": number,
          "justification": string
        },
        "dataCollection": {
          "approach": string,
          "tools": [string],
          "timeline": string
        },
        "analysisMethods": [
          {
            "id": number,
            "type": string,
            "name": string,
            "description": string
          }
        ],
        "consensusApproach": {
          "definition": string,
          "thresholds": string,
          "rounds": number
        },
        "dataHandling": {
          "approach": string,
          "framework": string,
          "validation": string
        }
      }`;
    }
    else {
      // Default to interventional if type not recognized
      analysisRequirements = `
      The Statistical Analysis Plan should include:
      1. Sample size calculation and justification
      2. Primary endpoint(s) definition and analysis method
      3. Secondary endpoint(s) definition and analysis method
      4. Exploratory endpoint(s) for hypothesis generation
      5. Estimands following ICH E9(R1) guidelines with four key components
      6. Analysis populations (e.g., ITT, PP, Safety)
      7. Statistical methods for primary and secondary analyses`;
      
      outputFormat = `
      {
        "sampleSize": {
          "total": number,
          "perArm": number, 
          "justification": string
        },
        "primaryEndpoints": [
          {
            "id": number,
            "name": string,
            "type": string,
            "timepoint": string,
            "method": string,
            "description": string
          }
        ],
        "secondaryEndpoints": [
          {
            "id": number,
            "name": string,
            "type": string,
            "timepoint": string,
            "method": string,
            "description": string
          }
        ],
        "exploratoryEndpoints": [
          {
            "id": number,
            "name": string,
            "type": string,
            "timepoint": string,
            "method": string,
            "description": string
          }
        ],
        "estimands": [
          {
            "id": number,
            "endpointName": string,
            "population": string,
            "variable": string,
            "populationLevelSummary": string,
            "intercurrentEventStrategy": "treatment_policy" | "composite" | "hypothetical" | "while_on_treatment" | "principal_stratum",
            "intercurrentEventHandling": string,
            "justification": string,
            "estimandType": "primary" | "secondary" | "exploratory"
          }
        ],
        "analysisPopulations": [
          {
            "id": number,
            "name": string,
            "definition": string
          }
        ],
        "statisticalMethods": [
          {
            "id": number,
            "name": string,
            "type": string,
            "description": string
          }
        ]
      }`;
    }

    const sapStrategy = contentStrategyOverride === "preserve" || contentStrategyOverride === "augment" || contentStrategyOverride === "generate"
      ? contentStrategyOverride
      : "augment";

    const prompt = `
      You are an expert ${isInterventional ? "clinical trial" : isObservational ? "observational study" : isSecondaryData ? "real-world evidence" : isDelphi ? "consensus methodology" : "research"} statistician and protocol developer with expertise in protocol-ready statistical planning and explicit assumption control.

      USER SELECTED CONTENT STRATEGY: ${sapStrategy.toUpperCase()}
      ${sapStrategy === "preserve" ? "Extract-only mode: use documented statistical content only if sample size, endpoints/outcomes, analysis populations, estimands, or statistical methods are present in the source documents. If no such source content is present, return sourceStatus: \"not_found\", empty arrays, sampleSize with zero values, and a clear explanation. Do not invent a statistical analysis plan in preserve mode." : sapStrategy === "augment" ? "Use documented endpoints and methods as the foundation, improve protocol wording, and add only statistical details that are required for protocol completeness. Any detail not supported by source text must be clearly marked as a placeholder or requiresConfirmation item." : "Generate a complete statistical analysis plan from the current synopsis and relevant references, but clearly mark unsupported assumptions as placeholders or requiresConfirmation items."}
      
      Based on the following ${isInterventional ? "clinical study" : isObservational ? "cohort study" : isSecondaryData ? "secondary data analysis" : isDelphi ? "Delphi consensus study" : "research"} synopsis${criteriaText ? " and eligibility criteria" : ""}, generate a comprehensive ${isInterventional ? "Statistical Analysis Plan" : isObservational || isSecondaryData ? "Statistical Analysis Plan with comprehensive bias assessment" : "Analysis Plan"}.
      
      IMPORTANT: Focus specifically on the ${isInterventional ? "disease, treatment, and endpoints" : isObservational ? "exposure, outcomes, and population" : isSecondaryData ? "data source, variables, and outcomes" : isDelphi ? "research question, consensus methodology, and analysis approach" : "research question, methodology, and analytical approach"} mentioned in the synopsis.
      DO NOT default to generating content for any specific disease unless it's mentioned in the synopsis.
      Tailor the analysis plan specifically to the ${isInterventional ? "condition, intervention, and endpoints" : isObservational ? "exposure-outcome relationships" : isSecondaryData ? "data sources and outcomes" : "research focus and methodology"} described in the synopsis.
      
      SYNOPSIS:
      ${synopsis}

      ${supplementaryInfo && supplementaryInfo.length > 0 ? `SUPPLEMENTARY INFORMATION AND FILE USAGE INSTRUCTIONS:\nUse these items only according to their usage instructions.\n${supplementaryInfo.join('\n\n---\n\n')}\n` : ""}
      
      ${criteriaText ? criteriaText : ""}

      ORIGIN METADATA:
      For every endpoint, analysis population, statistical method, and estimand object, include an "origin" field:
      - "use_as_is" if copied directly from source/synopsis without wording or content changes
      - "improved" if source content was reworded, clarified, or completed
      - "generated" if newly added by AI because the source was missing it
      Also include top-level sourceStatus: "found" or "not_found", sourceStatusMessage, and explanation. In preserve mode, return sourceStatus "not_found" and do not generate missing SAP content when no SAP/statistical content is present in the source documents.

      ASSUMPTION CONTROL:
      - Do not invent exact effect sizes, hazard ratios, alpha allocation, power, interim timing, stopping boundaries, sample-size re-estimation rules, or multiplicity hierarchies unless they are explicitly present in source text or user instructions.
      - If a required SAP detail is missing, add a placeholder such as "[PLACEHOLDER: statistician to confirm ...]" and set origin "generated" with a justification that source support is missing.
      - Prefer concise "requires confirmation" statements over unsupported precision.
      - If a total sample size is in the source but no formal justification is provided, preserve the total and state that power assumptions require confirmation.
      
      ${isInterventional ? `
      ENDPOINTS AND ESTIMANDS GUIDANCE:
      - Generate 1-3 primary endpoints, 3-5 secondary endpoints, 2-4 exploratory endpoints
      - For each endpoint, create corresponding estimands following ICH E9(R1) guidelines
      - Estimands must include: population, variable, population-level summary, intercurrent event strategy
      - Common intercurrent event strategies: treatment_policy (intent-to-treat), while_on_treatment, hypothetical (if treatment continued)
      - Justification should explain why the specific strategy was chosen for each estimand
      
      INTERIM ANALYSIS GUIDANCE:
      - Do not plan interim efficacy, futility, alpha-spending, or sample-size re-estimation unless source text or user instructions explicitly specify it.
      - Safety oversight may be described at a high level only if supported by source text or standard protocol boilerplate; otherwise mark as requiring confirmation.
      - If an interim analysis may be needed but is not documented, add it as a recommendation/placeholder requiring statistician and sponsor confirmation, not as a final planned analysis.
      
      MULTIPLICITY CONTROL:
      - Use Hochberg or Holm-Bonferroni for multiple primary endpoints
      - Consider hierarchical testing for primary/secondary endpoints
      - Address multiple dose comparisons in dose-finding studies
      ` : ""}
      
      ${isObservational || isSecondaryData ? `
      BIAS ASSESSMENT PRIORITIES:
      - Selection Bias: Assess healthy user bias, channeling bias, immortal time bias
      - Information Bias: Address differential misclassification, recall bias
      - Confounding: Identify time-varying confounders, unmeasured confounders
      - Temporal Bias: Consider protopathic bias, time-varying exposures
      
      CAUSAL INFERENCE REQUIREMENTS:
      - Apply Hill's criteria for causal assessment when appropriate
      - Use DAGs (Directed Acyclic Graphs) to identify confounding pathways
      - Consider instrumental variables if available (e.g., prescriber preference)
      - Plan negative control analyses to detect unmeasured confounding
      
      PROPENSITY SCORE GUIDANCE:
      - Use when >10 confounders or small sample size concerns
      - Include all potential confounders, avoid post-outcome variables
      - Assess balance using standardized mean differences <0.1
      - Consider matching, stratification, weighting, or adjustment
      ` : ""}
      
      MISSING DATA STRATEGY GUIDANCE:
      - Provide comprehensive missing data handling strategy
      - Primary approach: Choose from complete_case, available_case, multiple_imputation, last_observation, mixed_model based on study design and missing data pattern
      - Primary justification: Explain why the chosen approach is appropriate for this specific study
      - Missing mechanism assumption: Specify MCAR (missing completely at random), MAR (missing at random), or MNAR (missing not at random) with clinical rationale
      - Mechanism justification: Provide detailed clinical reasoning for the missing mechanism assumption
      - Imputation methods: Specify concrete imputation techniques if applicable (e.g., MICE, LOCF, PMM)
      - Sensitivity analyses: Design 2-3 sensitivity analyses using different missing data approaches to test robustness
      - Reporting plan: Detail how missing data patterns, reasons, and impact will be reported
      - Study-specific considerations: Address missing data concerns specific to this protocol type and clinical context
      
      ${analysisRequirements}
      
      Your response should be in JSON format with the following structure:
      ${outputFormat}
      
      ${isInterventional ? 
      `For sample size, use the sample size documented in the source when available. If no sample size or formal assumptions are documented, do not calculate a final number; use placeholders that require statistician confirmation.
      For primary/secondary/exploratory endpoints, include accurate statistical methods appropriate for each endpoint type.
      For estimands, create one estimand per major endpoint, ensure each estimand has all four required components per ICH E9(R1).
      For analysis populations, define standard populations relevant to the study.` : 
      isObservational || isSecondaryData ? 
      `For sample size, consider realistic power calculations for observational research.
      For outcomes, define appropriate measurements and analyses for non-randomized designs.
      For cohort definition, specify clear inclusion and exclusion criteria.
      For statistical methods, emphasize approaches to control for confounding and bias.` :
      `For sample size, consider appropriate recruitment targets based on methodology.
      For analysis methods, focus on approaches relevant to the study design.
      Ensure all analytical decisions align with the overall study objectives.`}
      For statistical methods, describe analyses aligned with the study objectives and ${isInterventional ? "endpoints" : "outcomes"}.
      
      CRITICAL: For missing data strategy, provide comprehensive, clinically relevant content for ALL fields:
      - primaryApproach: Select appropriate method from the available options
      - primaryJustification: Explain why this approach is suitable for this specific study context
      - missingMechanismAssumption: Choose appropriate assumption (mcar/mar/mnar) based on clinical context
      - mechanismJustification: Provide detailed clinical rationale for the mechanism assumption
      - imputationMethods: List specific imputation techniques if applicable
      - sensitivityAnalyses: Design concrete sensitivity analyses with method and description
      - reportingPlan: Detail how missing data will be reported and analyzed
      - studySpecificConsiderations: Address unique missing data challenges for this protocol type
    `;

    const response = await openai.chat.completions.create({
      model: MODEL,
      messages: [
        { role: "system", content: "You are a clinical protocol statistical expert assistant." },
        { role: "user", content: prompt },
      ],
      response_format: { type: "json_object" },
      temperature: 0.3,
    });

    const result = safeParseJson(response.choices[0].message.content);
    return result as ProtocolComponent;
  } catch (error) {
    console.error("Error generating statistical analysis plan:", error);
    throwOpenAIServiceError(error, "Failed to generate statistical analysis plan");
  }
}

/**
 * Generates a single section of a protocol based on context
 */
export async function reviewProtocolInputs(data: {
  protocol: any;
  selectedSections?: { id: string; title: string }[];
  alignment?: any;
  additionalInstructions?: string;
  tabReadiness?: any[];
}): Promise<{ summary: string; items: any[]; tabReadiness: any[] }> {
  try {
    const { protocol, selectedSections, alignment, additionalInstructions, tabReadiness } = data;
    const sectionCount = selectedSections?.length || 0;
    const reviewQuery = [
      "protocol input review",
      ...(selectedSections || []).map(section => `${section.id} ${section.title}`)
    ].join(" ");
    const normalizedSupplementaryInfo = normalizeSupplementaryInfoForPrompt(protocol?.supplementaryInfo, reviewQuery, 12);
    const compactProtocol = compactProtocolForInputReview(protocol, normalizedSupplementaryInfo);
    const criticalPlaceholders = [
      "protocol number",
      "sponsor name",
      "protocol version",
      "protocol date",
      "principal investigator",
      "study sites",
      "registry identifier",
      "ethics committee details",
      "funding source"
    ];

    const prompt = `
      You are reviewing the final inputs for a clinical study protocol before document generation.
      Classify source and app content into editorial decisions for the final protocol.

      Return JSON only with:
      {
        "summary": "short summary",
        "tabReadiness": [
          {
            "sectionKey": "schedule|criteria|variables|studySchema|safetyDrugHandling|analysisplan",
            "sectionName": "human label",
            "status": "current|stale|not_reviewed",
            "readiness": "ready|needs_update|blocked",
            "summary": "short final-readiness summary",
            "recommendedAction": "short action for user or generator",
            "blockers": ["short bullets"]
          }
        ],
        "items": [
          {
            "id": "stable-kebab-id",
            "section": "title|synopsis|trial_schema|schedule|introduction|objectives|design|population|procedures|treatments|discontinuation|assessments|safety|statistics|data_management|monitoring|ethical|administrative|global",
            "label": "short field/content label",
            "classification": "use_as_is|improve|add|needs_user_input|placeholder",
            "sourceText": "exact source excerpt or empty string",
            "proposedText": "protocol-ready text, placeholder text, or empty string",
            "reason": "why this decision is recommended",
            "confidence": 0.0,
            "riskLevel": "low|medium|high"
          }
        ]
      }

      Rules:
      - Use "use_as_is" when text is protocol-ready and can be copied.
      - Use "improve" when content exists but needs protocol-quality wording or specificity.
      - Use "add" when content is missing but AI can safely draft standard protocol text.
      - Use "needs_user_input" when a factual identifier or sponsor/site/admin fact should not be invented.
      - Use "placeholder" when missing factual text can be represented as a bracketed placeholder.
      - Do not invent real protocol numbers, sponsor names, investigator names, site names, registry IDs, or ethics approvals.
      - For missing critical administrative fields, propose bracketed placeholders such as [PROTOCOL NUMBER TO BE ASSIGNED].
      - Include at least one item for EVERY selected final protocol section. This is mandatory.
      - Use the exact selected section id in each item's section field whenever possible.
      - Then add separate items for missing critical administrative fields: ${criticalPlaceholders.join(", ")}.
      - Expected minimum item count: ${Math.max(sectionCount, 1)} section items plus any missing critical administrative items.
      - Do not stop after Study Population. Continue through all selected sections.
      - Use TAB READINESS as evidence for sections that have their own app tab. Do not duplicate every tab detail in the items list unless it affects final protocol generation.
      - If a tab review is stale or not_reviewed, include that in tabReadiness and add item-level guidance only when the final protocol needs a decision.
      - Also analyze final protocol sections that do not have their own tab, especially title, synopsis, objectives, design, population, treatments, procedures, ethics, monitoring, data management, and administrative identifiers.
      - For safety and drug handling, do not invent product-specific AESIs, dose modification rules, stopping rules, contraception requirements, product complaints, storage, preparation, dispensing, accountability, return, or destruction requirements without source evidence. Flag missing product-specific safety sources as blockers or placeholders.

      SELECTED FINAL PROTOCOL SECTIONS:
      ${JSON.stringify(selectedSections || [], null, 2)}

      TAB READINESS FROM PER-TAB REVIEWS:
      ${JSON.stringify(tabReadiness || [], null, 2)}

      CURRENT ALIGNMENT STATE:
      ${JSON.stringify(alignment || {}, null, 2)}

      ADDITIONAL USER INSTRUCTIONS:
      ${additionalInstructions || ""}

      CURRENT APP PROTOCOL DATA:
      ${JSON.stringify(compactProtocol, null, 2)}
    `;

    const response = await createJsonReviewCompletion([
        {
          role: "system",
          content: "You are a senior clinical protocol editor. You identify what to copy, improve, add, or leave as user-controlled placeholders before final protocol generation."
        },
        { role: "user", content: prompt }
      ]);

    const result = safeParseJson(response.choices[0].message.content);
    const items = Array.isArray(result.items) ? result.items : [];
    const reviewedTabReadiness = Array.isArray(result.tabReadiness) ? result.tabReadiness : (tabReadiness || []);
    return {
      summary: result.summary || "Protocol input review completed.",
      tabReadiness: reviewedTabReadiness.map((item: any) => ({
        sectionKey: item.sectionKey || "unknown",
        sectionName: item.sectionName || "Protocol tab",
        status: item.status || "not_reviewed",
        readiness: item.readiness || (item.status === "current" ? "ready" : "needs_update"),
        summary: item.summary || "",
        recommendedAction: item.recommendedAction || "",
        blockers: Array.isArray(item.blockers) ? item.blockers : [],
        recommendedMode: item.recommendedMode,
        sourceStatus: item.sourceStatus,
        missingItems: Array.isArray(item.missingItems) ? item.missingItems : [],
        risks: Array.isArray(item.risks) ? item.risks : []
      })),
      items: items.map((item: any, index: number) => ({
        id: item.id || `review-${index + 1}`,
        section: item.section || "global",
        label: item.label || "Protocol input",
        classification: item.classification || "improve",
        sourceText: item.sourceText || "",
        proposedText: item.proposedText || "",
        reason: item.reason || "",
        confidence: typeof item.confidence === "number" ? item.confidence : 0.75,
        riskLevel: item.riskLevel || "medium",
        decision: item.classification === "needs_user_input" ? "placeholder" : "accept",
        finalText: item.proposedText || item.sourceText || ""
      }))
    };
  } catch (error) {
    console.error("Error reviewing protocol inputs:", error);
    throwOpenAIServiceError(error, "Failed to review protocol inputs");
  }
}

export async function reviewSectionInputs(data: {
  protocol: any;
  sectionKey: string;
  sectionName: string;
  referenceExamples?: string;
  strictness?: "normal" | "conservative";
}): Promise<{
  summary: string;
  recommendedMode: "preserve" | "augment" | "generate";
  sourceStatus: "not_found" | "partial" | "usable" | "strong";
  sourceEvidence: string[];
  improvements: string[];
  missingItems: string[];
  risks: string[];
  rationale: string;
}> {
  try {
    const { protocol, sectionKey, sectionName, referenceExamples, strictness = "conservative" } = data;
    const reviewQuery = [
      sectionKey,
      sectionName,
      referenceExamples || "",
      "source content protocol section review recommendation"
    ].join(" ");
    const normalizedSupplementaryInfo = normalizeSupplementaryInfoForPrompt(protocol?.supplementaryInfo, reviewQuery, 10);

    const sectionData = {
      schedule: {
        tableHeaders: protocol?.tableHeaders,
        tableData: protocol?.tableData,
        soaProvenance: protocol?.soaProvenance
      },
      criteria: {
        inclusionCriteria: protocol?.inclusionCriteria,
        exclusionCriteria: protocol?.exclusionCriteria
      },
      variables: {
        dataVariables: protocol?.dataVariables
      },
      studySchema: {
        studySchema: protocol?.studySchema
      },
      safetyDrugHandling: {
        safetyDrugHandling: protocol?.safetyDrugHandling
      },
      analysisplan: {
        statisticalAnalysisPlan: protocol?.statisticalAnalysisPlan
      }
    } as Record<string, any>;

    const prompt = `
      You are reviewing one protocol-builder tab before the user generates or updates that section.
      Tell the user what source content is available, what can be used as-is, what should be improved, and what is missing.
      IMPORTANT: You are a source coverage reviewer first, not a rewriting assistant.
      Do not recommend improvement just because wording could be polished. Only recommend improvement when the change materially reduces protocol risk, ambiguity, incompleteness, inconsistency, or operational/regulatory uncertainty.

      Return JSON only:
      {
        "summary": "one-sentence section review summary",
        "recommendedMode": "preserve|augment|generate",
        "sourceStatus": "not_found|partial|usable|strong",
        "sourceEvidence": ["short bullets describing source content found"],
        "improvements": ["short bullets describing what should be improved and how"],
        "missingItems": ["short bullets describing missing content"],
        "risks": ["short bullets describing assumptions or risk if user proceeds"],
        "rationale": "why this generation mode is recommended"
      }

      Mode rules:
      - preserve = source content is adequate and protocol-ready enough; use source as-is.
      - augment = source content exists but has a concrete important defect: missing threshold, ambiguous timing/window, inconsistent terminology, incomplete endpoint/assessment definition, missing safety/regulatory detail, or not protocol-ready enough for this section.
      - generate = source content for this section is missing or too thin to preserve safely.
      - If sourceStatus is "not_found", recommendedMode must be "generate".
      - If sourceStatus is "partial", recommendedMode is usually "augment".
      - If sourceStatus is "usable" or "strong", recommendedMode should be "preserve" unless you can name a specific material defect.
      - For each improvement, name the concrete defect and practical consequence. If you cannot name both, do not list the improvement.
      - Do not list generic style improvements, completeness theater, or recommendations that are merely "nice to have".
      - The default answer is preserve when source content supports the section without material gaps.
      ${strictness === "conservative" ? `
      Conservative recommendation policy:
      - Be skeptical of your own tendency to improve everything.
      - Use "augment" only for important protocol-quality gaps, not general polishing.
      - Use "generate" only when source evidence is absent or insufficient.
      - It is acceptable and often correct to return no improvements and recommend preserve.
      ` : ""}
      - Do not invent source evidence. If no source text is present for this section, say so.
      - Keep bullets concise and useful to a non-technical protocol author.
      ${sectionKey === "safetyDrugHandling" ? `
      Safety & Drug Handling rules:
      - Treat product-specific safety and drug handling as source-dependent content.
      - Consider that the study may include several products: investigational product, comparator, placebo, background therapy, rescue medication, required concomitant medication, and combination components.
      - Review each listed product separately when protocol.safetyDrugHandling.products is present.
      - If IB, label/SmPC/USPI, RMP, safety management plan, pharmacy manual, or prior protocol content is not available, explicitly tell the user to upload the relevant document.
      - MissingItems must include concrete upload actions when product-specific requirements are absent, for example:
        "Upload Investigator's Brochure or label/SmPC/USPI for drug-specific risks, AESIs, contraindications, contraception, and monitoring."
        "Upload Safety Management Plan or RMP for SAE/AESI escalation and reporting expectations."
        "Upload Pharmacy Manual or prior protocol for storage, preparation, dispensing, accountability, return/destruction, and unblinding."
      - Do not say simply "add dose modification rules" if no source is available; say that those rules must be confirmed from a product-specific source document.
      - Use recommendedMode "augment" only when source content exists but required product-specific documents are incomplete; use "generate" when no reliable safety source content exists.
      ` : ""}

      SECTION:
      ${JSON.stringify({ sectionKey, sectionName, referenceExamples }, null, 2)}

      PROTOCOL CONTEXT:
      ${JSON.stringify({
        id: protocol?.id,
        title: protocol?.title,
        phase: protocol?.phase,
        indication: protocol?.indication,
        protocolType: protocol?.protocolType,
        synopsis: protocol?.synopsis,
        currentSectionData: sectionData[sectionKey] || {},
        supplementaryInfo: normalizedSupplementaryInfo
      }, null, 2)}
    `;

    const response = await createJsonReviewCompletion([
        {
          role: "system",
          content: "You are a senior clinical protocol editor helping users choose whether to preserve, improve, or generate one protocol section."
        },
        { role: "user", content: prompt }
      ]);

    const result = safeParseJson(response.choices[0].message.content);
    const sourceStatus = ["not_found", "partial", "usable", "strong"].includes(result.sourceStatus)
      ? result.sourceStatus
      : "partial";
    let recommendedMode = ["preserve", "augment", "generate"].includes(result.recommendedMode)
      ? result.recommendedMode
      : sourceStatus === "not_found"
        ? "generate"
        : sourceStatus === "strong"
          ? "preserve"
          : "augment";
    const materialImprovements = Array.isArray(result.improvements) ? result.improvements.filter(Boolean) : [];
    const materialMissingItems = Array.isArray(result.missingItems) ? result.missingItems.filter(Boolean) : [];
    if (sourceStatus === "not_found") recommendedMode = "generate";
    if ((sourceStatus === "usable" || sourceStatus === "strong") && materialImprovements.length === 0 && materialMissingItems.length === 0) {
      recommendedMode = "preserve";
    }

    return {
      summary: result.summary || `${sectionName} inputs reviewed.`,
      recommendedMode,
      sourceStatus,
      sourceEvidence: Array.isArray(result.sourceEvidence) ? result.sourceEvidence : [],
      improvements: materialImprovements,
      missingItems: materialMissingItems,
      risks: Array.isArray(result.risks) ? result.risks : [],
      rationale: result.rationale || "Recommendation based on available source content and current section completeness."
    };
  } catch (error) {
    console.error("Error reviewing section inputs:", error);
    const fallbackReview = buildFallbackSectionReview(data.protocol, data.sectionKey, data.sectionName);
    if (fallbackReview) {
      return fallbackReview;
    }
    throwOpenAIServiceError(error, "Failed to review section inputs");
  }
}

export const DEFAULT_SECTION_REVIEW_SECTIONS = [
  {
    sectionKey: "schedule",
    sectionName: "Schedule of Activities",
    referenceExamples: "visit schedule, assessment rows, visit windows, footnotes, SoA table"
  },
  {
    sectionKey: "criteria",
    sectionName: "Inclusion/Exclusion Criteria",
    referenceExamples: "eligibility criteria, thresholds, disease confirmation, prior therapy restrictions"
  },
  {
    sectionKey: "variables",
    sectionName: "Data Variables",
    referenceExamples: "endpoint variables, covariates, safety variables, operational definitions"
  },
  {
    sectionKey: "studySchema",
    sectionName: "Study Schema",
    referenceExamples: "participant flow, randomization, treatment arms, periods, follow-up"
  },
  {
    sectionKey: "safetyDrugHandling",
    sectionName: "Safety & Drug Handling",
    referenceExamples: "drug-specific safety requirements, IB/label/SmPC, pharmacy manual, contraception, AE/SAE reporting"
  },
  {
    sectionKey: "analysisplan",
    sectionName: "Statistical Analysis Plan",
    referenceExamples: "endpoints, estimands, populations, sample size, statistical methods"
  }
];

export async function reviewAllSectionInputs(data: {
  protocol: any;
  sections?: Array<{ sectionKey: string; sectionName: string; referenceExamples?: string }>;
}): Promise<{
  version: string;
  sections: Array<{ sectionKey: string; sectionName: string; referenceExamples?: string }>;
  reviews: Record<string, any>;
  errors: Record<string, string>;
  updatedAt: string;
}> {
  const sections = Array.isArray(data.sections) && data.sections.length > 0
    ? data.sections
    : DEFAULT_SECTION_REVIEW_SECTIONS;

  const results = await Promise.allSettled(
    sections.map(async (section) => ({
      section,
      review: await reviewSectionInputs({
        protocol: data.protocol,
        sectionKey: section.sectionKey,
        sectionName: section.sectionName,
        referenceExamples: section.referenceExamples,
        strictness: "conservative"
      })
    }))
  );

  const reviews: Record<string, any> = {};
  const errors: Record<string, string> = {};

  results.forEach((result, index) => {
    const section = sections[index];
    if (result.status === "fulfilled") {
      reviews[section.sectionKey] = {
        ...result.value.review,
        sectionKey: section.sectionKey,
        sectionName: section.sectionName,
        updatedAt: new Date().toISOString()
      };
    } else {
      errors[section.sectionKey] = result.reason instanceof Error ? result.reason.message : String(result.reason);
    }
  });

  return {
    version: "section-review-v2",
    sections,
    reviews,
    errors,
    updatedAt: new Date().toISOString()
  };
}

export async function detectSafetyProducts(data: {
  protocol: any;
}): Promise<{ products: any[] }> {
  try {
    const { protocol } = data;
    const normalizedSupplementaryInfo = normalizeSupplementaryInfoForPrompt(
      protocol?.supplementaryInfo,
      "study products investigational product comparator placebo background therapy rescue medication concomitant medication",
      12
    );

    const prompt = `
      Identify every study product or protocol-required medication that may need separate safety and drug handling controls.

      Return JSON only:
      {
        "products": [
          {
            "name": "product or medication name",
            "role": "investigational product|comparator|placebo|background therapy|rescue medication|required concomitant medication|combination component|other",
            "safetyRequirements": "known source-supported safety requirements, or empty string",
            "handlingRequirements": "known source-supported handling requirements, or empty string",
            "unresolvedItems": ["specific source document or clarification needed"]
          }
        ]
      }

      Rules:
      - Include investigational products, comparators, placebo, background therapy, rescue medication, and required concomitant medications.
      - Do not include generic optional concomitant medications unless they are required by the protocol.
      - Do not invent product-specific safety or handling rules. If source support is absent, put the missing source need in unresolvedItems.
      - For oncology ADT examples, separate androgen receptor inhibitor, ADT/GnRHa therapy, placebo/comparator, and any mandated supportive medications if present.
      - Use concise product names.

      PROTOCOL DATA:
      ${JSON.stringify({
        title: protocol?.title,
        phase: protocol?.phase,
        indication: protocol?.indication,
        protocolType: protocol?.protocolType,
        synopsis: protocol?.synopsis,
        safetyDrugHandling: protocol?.safetyDrugHandling,
        supplementaryInfo: normalizedSupplementaryInfo
      }, null, 2)}
    `;

    const response = await createJsonReviewCompletion([
        {
          role: "system",
          content: "You are a clinical protocol safety reviewer. You identify products requiring separate safety and handling controls without inventing unsupported facts."
        },
        { role: "user", content: prompt }
      ]);

    const result = safeParseJson(response.choices[0].message.content);
    const products = Array.isArray(result.products) ? result.products : [];
    return {
      products: products
        .filter((product: any) => product?.name)
        .map((product: any, index: number) => ({
          id: product.id || `detected-product-${index + 1}`,
          name: String(product.name || "Study product"),
          role: product.role || "other",
          safetyRequirements: product.safetyRequirements || "",
          handlingRequirements: product.handlingRequirements || "",
          unresolvedItems: Array.isArray(product.unresolvedItems) ? product.unresolvedItems : []
        }))
    };
  } catch (error) {
    console.error("Error detecting safety products:", error);
    throwOpenAIServiceError(error, "Failed to detect study products");
  }
}

export async function generateProtocolSection(
  data: {
    protocol: any;
    sectionId: string;
    sectionTitle: string;
    additionalInstructions?: string;
    previousSections?: { title: string; content: string }[];
    sourceReviewDecisions?: any[];
    boilerplateText?: string;
  }
): Promise<{ id: string; title: string; content: string }> {
  try {
    console.log(`Generating protocol section: ${data.sectionTitle} (${data.sectionId})`);
    
    // Extract protocol data
    const { protocol, sectionId, sectionTitle, additionalInstructions, previousSections, sourceReviewDecisions, boilerplateText } = data;
    const requiredBoilerplateText = typeof boilerplateText === "string" ? boilerplateText.trim() : "";
    const normalizedSupplementaryInfo = normalizeSupplementaryInfoForPrompt(
      protocol?.supplementaryInfo,
      `${sectionId} ${sectionTitle} protocol section generation`,
      10
    );
    
    // Special handling for Schedule of Activities - use the actual schedule data directly
    if (sectionId === "schedule" || sectionTitle.toLowerCase().includes("schedule of activities")) {
      try {
        // Get the table headers and data from the protocol
        const tableHeaders = typeof protocol.tableHeaders === 'string' 
          ? JSON.parse(protocol.tableHeaders) 
          : protocol.tableHeaders;
          
        const tableData = typeof protocol.tableData === 'string' 
          ? JSON.parse(protocol.tableData) 
          : protocol.tableData;
        
        // Check if we have valid schedule data to format
        if (tableHeaders && Array.isArray(tableHeaders) && tableHeaders.length > 0 && 
            tableData && typeof tableData === 'object' && Object.keys(tableData).length > 0) {
          
          console.log("Using actual Schedule of Activities data from protocol");
          
          // Format the schedule as a proper HTML table
          let scheduleContent = "<p>The Schedule of Activities below summarizes planned trial visits, procedures, and assessments. Visit windows, procedure details, and any country-specific requirements should be confirmed in the applicable operational manuals or source documents.</p>\n\n";
          
          // Start HTML table with appropriate classes
          scheduleContent += '<table class="schedule-table min-w-full border-collapse border border-gray-300">\n';
          
          // Add table header
          scheduleContent += '<thead>\n<tr>\n';
          scheduleContent += '<th class="border border-gray-300 bg-blue-50 p-3 text-left font-semibold">Assessment Type</th>\n';
          
          // Add header cells for each timepoint
          tableHeaders.forEach(header => {
            scheduleContent += `<th class="border border-gray-300 bg-blue-50 p-3 text-center font-semibold">${header}</th>\n`;
          });
          scheduleContent += '</tr>\n</thead>\n\n';
          
          // Start table body
          scheduleContent += '<tbody>\n';
          
          // Add each category and assessment row
          for (const [category, assessments] of Object.entries(tableData)) {
            // Add category as a header row
            scheduleContent += `<tr>\n<td colspan="${tableHeaders.length + 1}" class="border border-gray-300 bg-gray-100 p-3 font-semibold">${category}</td>\n</tr>\n`;
            
            // Add assessment rows
            if (Array.isArray(assessments)) {
              assessments.forEach((item: any) => {
                if (item && item.assessment && Array.isArray(item.values)) {
                  scheduleContent += '<tr>\n';
                  scheduleContent += `<td class="border border-gray-300 p-3 font-medium">${item.assessment}</td>\n`;
                  
                  // Add X or the value for each timepoint
                  item.values.forEach((value: string) => {
                    if (value === 'X' || value === 'x') {
                      scheduleContent += `<td class="border border-gray-300 p-3 text-center"><span class="x-mark">X</span></td>\n`;
                    } else {
                      scheduleContent += `<td class="border border-gray-300 p-3 text-center">${value || ''}</td>\n`;
                    }
                  });
                  
                  scheduleContent += '</tr>\n';
                }
              });
            }
          }
          
          // Close the table
          scheduleContent += '</tbody>\n</table>';
          
          // Add M11-compatible explanatory note without inventing operational flexibility.
          scheduleContent += "\n\n<p><em>Protocol note:</em> Procedures should be performed at the visits indicated unless otherwise specified in the protocol, pharmacy manual, laboratory manual, imaging charter, or other approved trial-specific source documents.</p>";
          
          if (requiredBoilerplateText) {
            scheduleContent += `\n\n## Section Boilerplate\n\n${requiredBoilerplateText}`;
          }

          // Return the formatted schedule as the section content
          return {
            id: sectionId,
            title: sectionTitle,
            content: scheduleContent
          };
        }
      } catch (error) {
        console.error("Error preparing Schedule of Activities:", error);
        // Fall through to standard generation method if there's an error
      }
    }
    
    // Determine the protocol type
    const protocolType = protocol.protocolType || "interventional_clinical_trial";
    const isInterventional = protocolType === "interventional_clinical_trial";
    const isObservational = protocolType === "prospective_cohort_study" || protocolType === "retrospective_cohort_study";
    const isSecondaryData = protocolType === "secondary_data_analysis";
    const isDelphi = protocolType === "delphi_consensus";
    const isSurvey = protocolType === "cross_sectional_survey";
    const isQualitative = protocolType === "qualitative_study";
    const isMAIC = protocolType === "maic";
    
    console.log(`Generating section for protocol type: ${protocolType}`);
    
    // Create context from previous sections
    let previousSectionsContext = "";
    if (previousSections && previousSections.length > 0) {
      previousSectionsContext = `
        PREVIOUSLY GENERATED SECTIONS (for reference and consistency):
        ${previousSections.map(s => 
          `Section: ${s.title}
           Content: ${s.content.substring(0, 500)}${s.content.length > 500 ? '...' : ''}
          `
        ).join('\n\n')}
      `;
    }
    
    const applicableReviewDecisions = Array.isArray(sourceReviewDecisions)
      ? sourceReviewDecisions.filter((item: any) => {
          const itemSection = String(item.section || "").toLowerCase();
          const currentId = String(sectionId || "").toLowerCase();
          const currentTitle = String(sectionTitle || "").toLowerCase();
          return itemSection === currentId ||
            currentTitle.includes(itemSection.replace(/_/g, " ")) ||
            itemSection === "global" ||
            (itemSection === "administrative" && ["title", "administrative"].includes(currentId));
        })
      : [];
    
    const sourceReviewContext = applicableReviewDecisions.length > 0
      ? `
        APPROVED PROTOCOL INPUT REVIEW DECISIONS:
        Use these decisions as binding editorial guidance for this section. Do not invent factual identifiers where a placeholder is approved. Do not include rejected proposals.
        ${JSON.stringify(applicableReviewDecisions.map((item: any) => ({
          section: item.section,
          classification: item.classification,
          decision: item.decision,
          label: item.label,
          finalText: item.finalText || item.proposedText || item.sourceText,
          reason: item.reason
        })), null, 2)}
      `
      : "";
    
    // Generate section prompt based on sectionId AND protocol type
    let sectionPrompt = "";
    
    // Common sections across all protocol types
    if (sectionId === "title") {
      sectionPrompt = `Generate the M11-style title page content and protocol identifiers. Include the full protocol title, protocol identifier, version/date placeholders where not provided, investigational product/intervention, indication, sponsor placeholder when unavailable, and confidentiality statement if appropriate. The title should reflect the ${isInterventional ? "trial design, indication, intervention, and comparator" : isObservational ? "cohort definition, exposure, and outcome" : isSecondaryData ? "data source, research question, and analytical approach" : isDelphi ? "consensus topic, expert panel, and methodology" : "research question and methodology"}.`;
    } 
    else if (sectionId === "synopsis") {
      sectionPrompt = `Generate the ICH M11 Protocol Summary. Summarize the key elements of the ${isInterventional ? "clinical trial" : isObservational ? "cohort study" : isSecondaryData ? "secondary data analysis" : isDelphi ? "Delphi consensus study" : isSurvey ? "cross-sectional survey" : "study"} including ${isInterventional ? "rationale, objectives, estimands where available, endpoints, design, trial population, trial intervention, comparator, duration, and high-level statistical approach" : isObservational ? "objectives, cohort definition, exposures, outcomes, and analysis plan" : isSecondaryData ? "objectives, data source, variables, and analytical approach" : isDelphi ? "objectives, expert panel composition, consensus methodology, and analysis approach" : "objectives, sampling strategy, data collection methods, and analysis approach"}.`;
    }
    else if (sectionId === "trial_schema") {
      sectionPrompt = "Create the ICH M11 Trial Schema section. Describe the participant flow from screening through treatment, follow-up, and end of trial. Include randomization, arms, intervention/comparator, key visit windows, treatment duration, and follow-up duration. Do not include or recreate the Schedule of Activities, SoA markdown table, assessment grid, or visit-by-assessment matrix; those belong only in section 1.3 Schedule of Activities.";
    }
    else if (sectionId === "objectives") {
      sectionPrompt = `Define the primary, secondary, and exploratory objectives of the ${isInterventional ? "clinical trial" : isObservational ? "cohort study" : isSecondaryData ? "secondary data analysis" : isDelphi ? "Delphi consensus" : isSurvey ? "survey" : "study"}. For interventional trials, align with ICH M11 by describing associated estimands when enough information exists: treatment condition, population, variable/endpoint, intercurrent events strategy if known, and summary measure. Use placeholders rather than inventing missing estimand details.`;
    }
    else if (sectionId === "design") {
      if (isInterventional) {
        sectionPrompt = "Describe the ICH M11 Trial Design section, including overall design, scientific rationale, trial type, randomization, blinding/masking, arms, treatment duration, follow-up, dose/regimen rationale, and any design-specific justifications.";
      } else if (isObservational) {
        sectionPrompt = `Describe the ${protocolType === "prospective_cohort_study" ? "prospective" : "retrospective"} cohort study design in detail, including cohort definition, exposure assessment, outcome measurement, and follow-up procedures.`;
      } else if (isSecondaryData) {
        sectionPrompt = "Describe the secondary data analysis design in detail, including data source characteristics, database linkage (if applicable), variable definitions, and analytical approach.";
      } else if (isDelphi) {
        sectionPrompt = "Describe the Delphi consensus methodology in detail, including the number of rounds, scoring system, consensus threshold, and feedback mechanism between rounds.";
      } else if (isSurvey) {
        sectionPrompt = "Describe the cross-sectional survey design in detail, including sampling methodology, survey administration method, validation procedures, and analysis approach.";
      } else {
        sectionPrompt = "Describe the study design in detail, including key methodological elements, timeline, and procedures.";
      }
    }
    else if (sectionId === "population") {
      if (isInterventional || isObservational) {
        sectionPrompt = "Define the trial population in ICH M11 style, including eligibility criteria summary, demographic and disease characteristics, recruitment considerations, vulnerable populations if applicable, lifestyle restrictions if known, and screen failure/rescreening approach where available.";
      } else if (isSecondaryData) {
        sectionPrompt = "Define the study population in detail, including database inclusion criteria, cohort entry criteria, and index dates.";
      } else if (isDelphi) {
        sectionPrompt = "Define the expert panel composition in detail, including selection criteria, expertise requirements, and panel size.";
      } else if (isSurvey) {
        sectionPrompt = "Define the target population and sampling framework in detail, including inclusion criteria, exclusion criteria, and recruitment methods.";
      } else {
        sectionPrompt = "Define the study population in detail, including all relevant characteristics for recruitment or selection.";
      }
    }
    // Specific sections for different protocol types
    else if (sectionId === "procedures") {
      if (isInterventional) {
        sectionPrompt = "Describe all trial procedures in detail, including screening, informed consent, randomization, treatment administration, visit conduct, follow-up, and end-of-trial procedures.";
      } else if (isObservational) {
        sectionPrompt = "Describe all study procedures in detail, including recruitment, data collection methods, follow-up assessments, and retention strategies.";
      } else if (isSecondaryData) {
        sectionPrompt = "Describe all data extraction and processing procedures in detail, including database querying, quality control, and variable transformations.";
      } else if (isDelphi) {
        sectionPrompt = "Describe all consensus procedures in detail, including statement development, round execution, feedback mechanisms, and final consensus determination.";
      } else if (isSurvey) {
        sectionPrompt = "Describe all survey procedures in detail, including instrument development, validation, administration, and data collection.";
      } else {
        sectionPrompt = "Describe all study procedures in detail, with focus on methodological rigor and reproducibility.";
      }
    }
    else if (sectionId === "assessments") {
      if (isInterventional) {
        sectionPrompt = "Write the ICH M11 Trial Assessments and Procedures section. Detail efficacy, safety, pharmacokinetic/pharmacodynamic, biomarker, patient-reported outcome, and other assessments where applicable, including methods, timing, allowable windows, and responsibilities. Do not recreate the Schedule of Activities table unless specifically needed.";
      } else if (isObservational) {
        sectionPrompt = "Detail all exposure and outcome assessments, including measurement methods, timing, and validation procedures.";
      } else if (isSecondaryData) {
        sectionPrompt = "Detail all variable definitions, including outcome variables, exposure variables, and covariates with corresponding database codes and algorithms.";
      } else if (isDelphi) {
        sectionPrompt = "Detail all assessment methods for consensus, including scoring systems, feedback presentation, and consensus calculation algorithms.";
      } else if (isSurvey) {
        sectionPrompt = "Detail all survey instruments, including scales, question types, validation methods, and response options.";
      } else {
        sectionPrompt = "Detail all assessment methods, instruments, and measurement strategies used in the study.";
      }
    }
    else if (sectionId === "statistics") {
      if (isInterventional) {
        sectionPrompt = "Outline the ICH M11 Statistical Considerations section, including estimand-aligned analysis objectives, sample size justification, analysis populations, primary and secondary endpoint methods, multiplicity, missing data, intercurrent events, interim analyses, subgroup/sensitivity analyses, and data monitoring considerations where applicable.";
      } else if (isObservational) {
        // For observational studies, incorporate bias assessment if available
        let biasAssessmentContext = "";
        if (protocol.biasAssessment) {
          const biasAssessment = protocol.biasAssessment;
          biasAssessmentContext = `
            
            BIAS ASSESSMENT DATA TO INCORPORATE:
            - Overall Risk Level: ${biasAssessment.overallRisk}
            ${biasAssessment.selectionBias ? `
            - Selection Bias Risk: ${biasAssessment.selectionBias.riskLevel}
            ${biasAssessment.selectionBias.specificTypes ? `
            - Specific Selection Bias Types:
              ${biasAssessment.selectionBias.specificTypes.map((bias: any) => 
                `• ${bias.type.replace(/_/g, ' ')}: ${bias.description}\n    Mitigation: ${bias.mitigation}`
              ).join('\n  ')}` : ''}` : ''}
            ${biasAssessment.confoundingBias ? `
            - Confounding Risk: ${biasAssessment.confoundingBias.riskLevel}
            - Identified Confounders: ${biasAssessment.confoundingBias.identifiedConfounders?.join(', ') || 'None specified'}
            - Residual Confounding: ${biasAssessment.confoundingBias.residualConfounding || 'Standard approaches'}` : ''}
            ${biasAssessment.informationBias ? `
            - Information Bias Risk: ${biasAssessment.informationBias.riskLevel}
            - Mitigation Strategies: ${biasAssessment.informationBias.mitigationStrategies?.join(', ') || 'Standard validation'}` : ''}
          `;
        }
        
        let propensityScoreContext = "";
        if (protocol.propensityScoreAnalysis?.indicated) {
          const ps = protocol.propensityScoreAnalysis;
          propensityScoreContext = `
            
            PROPENSITY SCORE ANALYSIS TO INCLUDE:
            - Method: ${ps.method}
            - Covariates: ${ps.covariates?.join(', ') || 'To be determined'}
            - Balance Assessment: ${ps.balanceAssessment || 'Standardized mean differences <0.1'}
          `;
        }
        
        let negativeControlsContext = "";
        if (protocol.negativeControls?.outcomeControls?.length > 0 || protocol.negativeControls?.exposureControls?.length > 0) {
          const nc = protocol.negativeControls;
          negativeControlsContext = `
            
            NEGATIVE CONTROLS TO INCLUDE:
            ${nc.outcomeControls?.length > 0 ? `
            - Negative Outcome Controls:
              ${nc.outcomeControls.map((control: any) => 
                `• ${control.outcome}: ${control.rationale}`
              ).join('\n  ')}` : ''}
            ${nc.exposureControls?.length > 0 ? `
            - Negative Exposure Controls:
              ${nc.exposureControls.map((control: any) => 
                `• ${control.exposure}: ${control.rationale}`
              ).join('\n  ')}` : ''}
          `;
        }
        
        sectionPrompt = `Outline the statistical analysis plan for this observational study, including sample size calculation, confounding control methods, and analytical approaches for time-to-event data if applicable.
        
        IMPORTANT: Incorporate the following bias assessment and mitigation strategies that have been specifically identified for this study:${biasAssessmentContext}${propensityScoreContext}${negativeControlsContext}
        
        Structure the statistical analysis plan to address the specific bias risks identified and implement the planned mitigation strategies.`;
      } else if (isSecondaryData) {
        sectionPrompt = "Outline the statistical analysis plan, including power calculations based on database size, methods for addressing missing data, and approaches for sensitivity analyses.";
      } else if (isDelphi) {
        sectionPrompt = "Outline the statistical analysis plan, including methods for analyzing consensus levels, inter-rater reliability, and stability between rounds.";
      } else if (isMAIC) {
        sectionPrompt = "Outline the statistical analysis plan for the MAIC study, including propensity score methods, effect size estimations, confidence interval calculations, and approaches for handling population differences.";
      } else if (isSurvey) {
        sectionPrompt = "Outline the statistical analysis plan, including sample size justification, descriptive statistics, and analytical approaches for hypothesis testing.";
      } else {
        sectionPrompt = "Outline the statistical analysis plan appropriate for the study design and research questions.";
      }
    }
    else if (sectionId === "bias_management") {
      if (isObservational || isSecondaryData) {
        // Bias management section specific to observational studies
        let biasAssessmentContext = "";
        if (protocol.biasAssessment) {
          const biasAssessment = protocol.biasAssessment;
          biasAssessmentContext = `
            
            BIAS ASSESSMENT DATA TO INCORPORATE:
            - Overall Risk Level: ${biasAssessment.overallRisk}
            ${biasAssessment.selectionBias ? `
            - Selection Bias Assessment:
              Risk Level: ${biasAssessment.selectionBias.riskLevel}
              ${biasAssessment.selectionBias.specificTypes ? `
              Specific Types Identified:
              ${biasAssessment.selectionBias.specificTypes.map((bias: any) => 
                `• ${bias.type.replace(/_/g, ' ').toUpperCase()}: ${bias.description}\n    Mitigation Strategy: ${bias.mitigation}`
              ).join('\n  ')}` : ''}` : ''}
            ${biasAssessment.confoundingBias ? `
            - Confounding Bias Assessment:
              Risk Level: ${biasAssessment.confoundingBias.riskLevel}
              Identified Confounders: ${biasAssessment.confoundingBias.identifiedConfounders?.join(', ') || 'None specified'}
              Residual Confounding Approach: ${biasAssessment.confoundingBias.residualConfounding || 'Standard sensitivity analysis'}` : ''}
            ${biasAssessment.informationBias ? `
            - Information Bias Assessment:
              Risk Level: ${biasAssessment.informationBias.riskLevel}
              Mitigation Strategies: ${biasAssessment.informationBias.mitigationStrategies?.join('; ') || 'Standard validation procedures'}` : ''}
          `;
        }
        
        let causalInferenceContext = "";
        if (protocol.causalInference?.applicable) {
          const ci = protocol.causalInference;
          causalInferenceContext = `
            
            CAUSAL INFERENCE FRAMEWORK:
            - Framework: ${ci.framework}
            - Key Assumptions: ${ci.assumptions?.join(', ') || 'Standard causal assumptions'}
            - Methodology: ${ci.methodology || 'Standard causal analysis approach'}
          `;
        }
        
        sectionPrompt = `Generate a comprehensive Bias Management section for this observational study that addresses the specific bias risks identified and outlines concrete mitigation strategies.
        
        IMPORTANT: Use the following specific bias assessment data that has been generated for this study:${biasAssessmentContext}${causalInferenceContext}
        
        The section should include:
        1. Overview of identified bias risks
        2. Specific mitigation strategies for each bias type
        3. Sensitivity analysis plans
        4. Quality control measures
        5. Validation procedures
        
        Write in a professional, protocol-appropriate style suitable for regulatory review.`;
      } else {
        sectionPrompt = "Generate a bias management section appropriate for the study design, addressing potential sources of bias and mitigation strategies.";
      }
    }
    else if (sectionId === "ethical") {
      if (isInterventional || isObservational) {
        sectionPrompt = "Write the ICH M11 Trial Oversight and Other General Considerations section, including regulatory and ethical compliance, IRB/IEC review, informed consent, participant confidentiality/data protection, safety oversight, quality assurance, monitoring, protocol deviations, direct access to source data, record retention, publication policy, and conflict-of-interest considerations.";
      } else if (isSecondaryData) {
        sectionPrompt = "Address ethical considerations, including data usage agreements, privacy protections, de-identification procedures, and regulatory compliance.";
      } else if (isDelphi || isSurvey) {
        sectionPrompt = "Address ethical considerations, including participant anonymity, consent procedures, confidentiality, and management of conflicts of interest.";
      } else {
        sectionPrompt = "Address ethical considerations appropriate for the research methodology, including relevant regulatory requirements.";
      }
    }
    else if (sectionId === "administrative") {
      sectionPrompt = "Prepare the administrative and reference appendices content. Include placeholders for protocol amendment history, sponsor and investigator responsibilities, signature pages, glossary/abbreviations, references, and appendices required by the study. Do not invent real names, dates, signatures, approvals, or registry identifiers.";
    }
    else if (sectionId === "discontinuation") {
      sectionPrompt = "Write the ICH M11 section on trial intervention discontinuation and participant discontinuation or withdrawal. Include criteria for stopping trial intervention, withdrawal from trial, lost-to-follow-up handling, replacement/rescreening rules if applicable, continued safety follow-up, and data collection after discontinuation.";
    }
    else if (sectionId === "safety") {
      sectionPrompt = `Write the ICH M11 safety reporting section, including definitions and reporting of adverse events, serious adverse events, adverse events of special interest if applicable, product complaints, pregnancy reporting, overdose/medication error reporting, causality/severity assessment, reporting timelines, and safety follow-up.
      If approved Safety & Drug Handling tab content is provided, use it as the primary source for this section. Do not invent product-specific safety risks, AESIs, dose modification rules, stopping rules, contraception requirements, or product handling requirements without source support; use bracketed placeholders for unresolved product-specific items.`;
      if (Array.isArray(protocol?.safetyDrugHandling?.products) && protocol.safetyDrugHandling.products.length > 0) {
        sectionPrompt += `
        The Safety & Drug Handling tab lists multiple study products. Structure product-specific requirements separately for each product and keep global AE/SAE reporting procedures separate from product-specific risks and handling controls.`;
      }
    }
    else if (sectionId === "data_management") {
      sectionPrompt = "Write the data management and data governance content in ICH M11-compatible protocol language, including data capture, data quality checks, database lock, source data expectations, confidentiality, coding dictionaries, handling of missing data operationally, and record retention.";
    }
    else if (sectionId === "monitoring") {
      sectionPrompt = "Write the monitoring, quality assurance, and compliance content, including monitoring approach, audit/inspection readiness, protocol deviation management, investigator responsibilities, source data access, and essential document retention.";
    }
    // Protocol-specific sections
    else if (sectionId === "data_source" && (isSecondaryData || protocolType === "retrospective_cohort_study")) {
      sectionPrompt = "Provide a comprehensive description of the data source(s), including database characteristics, coverage, validation status, and limitations.";
    }
    else if (sectionId === "expert_panel" && isDelphi) {
      sectionPrompt = "Describe the expert panel in detail, including selection criteria, recruitment approach, panel size, and expertise distribution.";
    }
    else if (sectionId === "consensus_methodology" && isDelphi) {
      sectionPrompt = "Detail the consensus methodology, including statement development, scoring system, consensus thresholds, and methods for managing disagreement.";
    }
    else if (sectionId === "sampling_strategy" && (isSurvey || isQualitative)) {
      sectionPrompt = "Describe the sampling strategy in detail, including approach (random, stratified, purposive, etc.), sample size justification, and recruitment methods.";
    }
    else if (sectionId === "survey_instrument" && isSurvey) {
      sectionPrompt = "Describe the survey instrument in detail, including development process, validation status, structure, and administration method.";
    }
    else if (sectionId === "exposure_assessment" && isObservational) {
      sectionPrompt = "Detail the exposure assessment methodology, including measurement tools, timing, and procedures to ensure validity and reliability.";
    }
    // MAIC-specific sections
    else if (sectionId === "source_data" && isMAIC) {
      sectionPrompt = "Describe the source data configuration in detail, including individual patient data sources, key variables, inclusion/exclusion criteria for source data, and data quality assessment methods. Specify the software tools and approaches used for data preparation.";
    }
    else if (sectionId === "target_study" && isMAIC) {
      sectionPrompt = "Detail the target study extraction process, including published study selection criteria, outcome extraction methods, baseline characteristics collection, and approaches for handling missing or aggregated data from the target study publication.";
    }
    else if (sectionId === "matching_algorithm" && isMAIC) {
      sectionPrompt = "Describe the matching algorithm methodology in detail, including propensity score calculation, weighting approach, covariates included in the matching process, balance assessment methods, and effective sample size estimation.";
    }
    else if (sectionId === "sensitivity_analysis" && isMAIC) {
      sectionPrompt = "Detail the sensitivity analysis approach, including alternative matching specifications to be tested, subgroup analyses, different weighting approaches, and methods for assessing the robustness of findings to varying assumptions.";
    }
    else if (sectionId === "effect_estimation" && isMAIC) {
      sectionPrompt = "Describe the effect size estimation methodology, including statistical models, outcome measures, handling of time-to-event data if applicable, variance estimation approaches, and methods for computing confidence intervals.";
    }
    else if (sectionId === "limitations" && isMAIC) {
      sectionPrompt = "Discuss the limitations and assumptions of the MAIC methodology, including potential sources of bias, unanchored comparison considerations (if applicable), unmeasured confounding, challenges with published aggregate data, and guidance for interpreting results in light of these limitations.";
    }
    else {
      sectionPrompt = `Generate comprehensive content for the "${sectionTitle}" section that is appropriate for a ${protocolType.replace(/_/g, ' ')} protocol.`;
    }

    const templateOutputShape = M11_SECTION_OUTPUT_SHAPES[sectionId] || "";
    
    // Create a context-aware prompt for this section
    const contextPrompt = `
      You are an expert clinical protocol writer tasked with creating a specific section of a clinical trial protocol.
      
      IMPORTANT CONTEXT:
      - You are generating content for the "${sectionTitle}" section of a clinical protocol.
      - Use the ICH M11 Clinical electronic Structured Harmonised Protocol (CeSHarP) final template structure for interventional clinical trials.
      - Use substantive, protocol-ready narrative language with clear subsection headings, tables where useful, and bracketed placeholders for missing information.
      - Do not overuse bullets. Reserve bullet lists for true enumerations such as eligibility criteria, objectives, endpoint lists, analysis populations, required documents, and discrete procedures. For rationale, design, safety, treatment, assessment, statistical, ethics, and operational sections, prefer complete paragraphs.
      - Do not make the output unnecessarily short when source information supports fuller protocol wording. Include enough detail for a reviewer to understand what will be done, when relevant, by whom, and which details remain unresolved.
      - Avoid duplicating the same substantive content across sections. Full inclusion/exclusion criteria should appear only in the Eligibility Criteria section; other sections should reference or summarize them without restating item-by-item criteria.
      - Do not repeat the section title as the first line; the application supplies the section heading and numbering.
      - Prefer "trial" terminology for interventional clinical trials, including trial population, trial intervention, participant, and Schedule of Activities.
      - Ensure consistency with all other protocol components provided.
	      - Maintain the same terminology, dosing schedules, and endpoints across all sections.
	      - Use the appropriate clinical research terminology and formatting.
	      - Do not invent product-specific safety risks, dose-modification rules, pregnancy requirements, handling/storage conditions, sponsor names, dates, registry identifiers, or approval details without source support.
	      - Before drafting, actively use the source synopsis, accepted review decisions, tab content, and relevant supplementary files below. Preserve source facts unless the section-specific recommendation explicitly calls for protocol wording improvements.
	      - If a requested fact is absent from all available sources, write a bracketed placeholder instead of silently replacing it with generic content.
      
      PROTOCOL COMPONENTS CONTEXT (for reference and consistency):
      - Title: ${protocol.title || "Not available"}
      - Phase: ${protocol.phase || "Not specified"}
      - Indication: ${protocol.indication || "Not specified"}
      - Synopsis: ${protocol.synopsis ? "Provided" : "Not provided"}
      - Schedule of Activities: ${protocol.tableHeaders ? "Provided" : "Not provided"}
      - Inclusion/Exclusion Criteria: ${protocol.inclusionCriteria ? "Provided" : "Not provided"}
      - Data Variables: ${protocol.dataVariables ? "Provided" : "Not provided"}
      - Safety & Drug Handling: ${protocol.safetyDrugHandling ? "Provided" : "Not provided"}
      - Supplementary Information: ${normalizedSupplementaryInfo.length > 0 ? `${normalizedSupplementaryInfo.length} item(s) provided` : "Not provided"}
      
      ${previousSectionsContext}
      
      ${sourceReviewContext}

      ${requiredBoilerplateText ? `
      REQUIRED BOILERPLATE TEXT FOR THIS SECTION:
      Include this boilerplate in the generated section. Preserve required legal, safety, regulatory, or sponsor-standard wording unless it directly conflicts with approved source-review decisions. If it conflicts, keep the boilerplate wording and flag the conflict in bracketed text rather than silently dropping it.
      ${requiredBoilerplateText}
      ` : ""}

      ${normalizedSupplementaryInfo.length > 0 ? `
      SUPPLEMENTARY INFORMATION AND FILE USAGE INSTRUCTIONS:
      Use these items only according to their usage instructions. If a file is marked as template/style only, do not copy study-specific facts from it unless those facts are also present in the synopsis or approved review decisions.
      ${normalizedSupplementaryInfo.join('\n\n---\n\n')}
      ` : ""}
      
      SECTION-SPECIFIC INSTRUCTIONS:
      ${sectionPrompt}

      ${templateOutputShape ? `
      TEMPLATE OUTPUT SHAPE FOR THIS SECTION:
      ${templateOutputShape}
      Follow this shape unless the provided source documents clearly require a more specific sponsor-template structure. Keep markdown headings limited to subsections that should become Word Heading 2/3/4 styles. Use markdown tables only for true tabular content; do not flatten tables into prose.
      ` : ""}
      
      ${additionalInstructions ? `ADDITIONAL INSTRUCTIONS: ${additionalInstructions}` : ''}
      
      PROTOCOL DATA REFERENCE:
      ${JSON.stringify({
	        title: protocol.title,
	        phase: protocol.phase,
	        indication: protocol.indication,
	        synopsis: protocol.synopsis,
	        studySchema: protocol.studySchema,
	        scheduleHeaders: protocol.tableHeaders,
	        scheduleData: protocol.tableData,
	        dataVariables: protocol.dataVariables,
	        statisticalAnalysisPlan: protocol.statisticalAnalysisPlan,
	        safetyDrugHandling: protocol.safetyDrugHandling,
        supplementaryInfo: normalizedSupplementaryInfo,
        inclusionCriteria: protocol.inclusionCriteria ? 
          (typeof protocol.inclusionCriteria === 'string' ? 
            JSON.parse(protocol.inclusionCriteria) : 
            protocol.inclusionCriteria) : 
          [],
        exclusionCriteria: protocol.exclusionCriteria ? 
          (typeof protocol.exclusionCriteria === 'string' ? 
            JSON.parse(protocol.exclusionCriteria) : 
            protocol.exclusionCriteria) : 
          [],
      }, null, 2)}
      
      Generate professional, clear, and comprehensive content for the "${sectionTitle}" section.
      Format using markdown with appropriate headings, narrative paragraphs, tables only for true tabular content, and lists only where a list is the natural protocol format.
      Return markdown content only. Do not wrap the answer in fenced code blocks.
      For M11 alignment, use second- and third-level headings inside the section only, and keep administrative placeholders visibly bracketed.
      Focus on the specific disease, population, and intervention mentioned in the protocol.
      Don't include the section title in your response, just the content.
    `;
    
    // Generate content for this specific section
    const response = await openai.chat.completions.create({
      model: MODEL,
      messages: [
        { 
          role: "system", 
          content: "You are a clinical protocol expert who writes professional, precise, and well-structured protocol sections that maintain perfect consistency with other protocol elements."
        },
        { role: "user", content: contextPrompt },
      ],
      temperature: 0.2,
      max_tokens: 4000,
    });
    
    const sectionContent = (response.choices[0].message.content || "No content generated.")
      .replace(/^```(?:markdown|md)?\s*/i, "")
      .replace(/```\s*$/i, "")
      .trim();
    
    // Return the generated section
    return {
      id: sectionId,
      title: sectionTitle,
      content: sectionContent
    };
  } catch (error) {
    console.error(`Error generating protocol section ${data.sectionTitle}:`, error);
    throw new Error(`Failed to generate protocol section: ${data.sectionTitle}`);
  }
}

/**
 * Generates a complete protocol based on all components
 */
export async function generateFullProtocol(
  data: {
    protocol: any;
    sections: {
      id: string;
      title: string;
      prompt: string;
      isRequired: boolean;
    }[];
  }
): Promise<{ document: string; sections: { id: string; title: string; content: string }[]; documentUrl?: string }> {
  try {
    console.log(`Generating protocol with ${data.sections.length} sections`);
    
    // Extract protocol data
    const { protocol, sections } = data;
    
    // Process each section to generate content
    const generatedSections = [];
    
    for (const section of sections) {
      console.log(`Generating section: ${section.title}`);
      
      // Skip sections without prompts
      if (!section.prompt) {
        console.log(`Skipping section ${section.title} - no prompt provided`);
        generatedSections.push({
          id: section.id,
          title: section.title,
          content: "No content generated for this section."
        });
        continue;
      }
      
      // Create a context-aware prompt for this section that includes awareness
      // of other parts of the protocol to maintain consistency
      const contextPrompt = `
        You are an expert clinical protocol writer tasked with creating a specific section of a clinical trial protocol.
        
        IMPORTANT CONTEXT:
        - You are generating content for the "${section.title}" section of a clinical protocol.
        - Ensure consistency with all other protocol components provided.
        - Maintain the same terminology, dosing schedules, and endpoints across all sections.
        - Avoid redundancy with other sections while ensuring completeness.
        - Use the appropriate clinical research terminology and formatting.
        
        PROTOCOL COMPONENTS CONTEXT (for reference and consistency):
        - Synopsis: ${protocol.synopsis ? "Provided" : "Not provided"}
        - Schedule of Activities: ${protocol.tableHeaders ? "Provided" : "Not provided"}
        - Inclusion/Exclusion Criteria: ${protocol.inclusionCriteria ? "Provided" : "Not provided"}
        - Data Variables: ${protocol.dataVariables ? "Provided" : "Not provided"}
        
        SECTION-SPECIFIC INSTRUCTIONS:
        ${section.prompt}
        
        PROTOCOL DATA REFERENCE:
        ${JSON.stringify({
          ...protocol,
          inclusionCriteria: protocol.inclusionCriteria ? 
            (typeof protocol.inclusionCriteria === 'string' ? 
              JSON.parse(protocol.inclusionCriteria) : 
              protocol.inclusionCriteria) : 
            [],
          exclusionCriteria: protocol.exclusionCriteria ? 
            (typeof protocol.exclusionCriteria === 'string' ? 
              JSON.parse(protocol.exclusionCriteria) : 
              protocol.exclusionCriteria) : 
            [],
        }, null, 2)}
        
        Generate professional, clear, and comprehensive content for the "${section.title}" section.
        Format using markdown with appropriate headings, tables, and lists.
        Focus on the specific disease, population, and intervention mentioned in the protocol.
        Don't include the section title in your response, just the content.
      `;
      
      // Generate content for this specific section
      const response = await openai.chat.completions.create({
        model: MODEL,
        messages: [
          { 
            role: "system", 
            content: "You are a clinical protocol expert who writes professional, precise, and well-structured protocol sections that maintain perfect consistency with other protocol elements."
          },
          { role: "user", content: contextPrompt },
        ],
        temperature: 0.2,
        max_tokens: 4000,
      });
      
      const sectionContent = response.choices[0].message.content || "No content generated.";
      
      // Add section to the list of generated sections
      generatedSections.push({
        id: section.id,
        title: section.title,
        content: sectionContent
      });
      
      console.log(`Completed section: ${section.title} - ${sectionContent.length} characters`);
    }
    
    // Combine all sections into a single document
    let fullDocument = "";
    
    // Add title and metadata
    fullDocument += `# ${protocol.title || "Clinical Trial Protocol"}\n\n`;
    fullDocument += `Protocol ID: ${protocol.id || "TBD"}\n`;
    fullDocument += `Version: 1.0\n`;
    fullDocument += `Date: ${new Date().toISOString().split('T')[0]}\n\n`;
    
    // Add each section
    for (const section of generatedSections) {
      fullDocument += `## ${section.title}\n\n`;
      fullDocument += `${section.content}\n\n`;
    }
    
    // Include document generation information
    fullDocument += `\n\n---\n*This document was generated by Evidence Copilot*\n`;
    
    return { 
      document: fullDocument,
      sections: generatedSections,
      // In a real implementation, this would be a URL to the generated document
      documentUrl: "/protocol-document.pdf" 
    };
    
  } catch (error: any) {
    console.error("Error generating full protocol:", error);
    throw new Error(`Failed to generate full protocol: ${error.message || 'Unknown error'}`);
  }
}

/**
 * Analyzes the impact of inclusion/exclusion criteria on patient eligibility
 * and provides recommendations for optimization
 */
export async function analyzeCriteriaImpact(
  inclusionCriteria: any[],
  exclusionCriteria: any[],
  indication: string
): Promise<{
  eligibilityRate: number;
  potentialRate: number;
  missingCriteria: { text: string; category: string }[];
  ambiguousCriteria: { text: string; suggestion: string }[];
  highImpactCriteria: { id: number; text: string; type: "inclusion" | "exclusion" }[];
  suggestions: { criterion: string; suggestion: string; potentialImpact: string }[];
  regulatoryGuidance: { title: string; description: string }[];
}> {
  try {
    const prompt = `
      You are an expert clinical trial protocol reviewer specializing in patient eligibility criteria.
      
      Analyze the following inclusion and exclusion criteria for a clinical trial in ${indication}.
      Your task is to:
      1. Estimate the expected patient eligibility rate based on these criteria
      2. Identify overly restrictive or ambiguous criteria
      3. Suggest modifications that could improve patient recruitment while maintaining scientific integrity
      4. Analyze regulatory compliance and highlight any missing standard criteria
      
      INCLUSION CRITERIA:
      ${JSON.stringify(inclusionCriteria, null, 2)}
      
      EXCLUSION CRITERIA:
      ${JSON.stringify(exclusionCriteria, null, 2)}
      
      INDICATION: ${indication}
      
      Provide a detailed analysis in JSON format with:
      1. eligibilityRate: Estimated patient eligibility percentage (numeric value)
      2. potentialRate: Potential eligibility rate if all suggestions are implemented (numeric value)
      3. missingCriteria: Array of standard criteria that should be added
      4. ambiguousCriteria: Array of criteria that need clarification
      5. highImpactCriteria: Array of criteria that have the highest impact on eligibility
      6. suggestions: Array of specific modification suggestions
      7. regulatoryGuidance: Array of relevant regulatory considerations
      
      Format your response as follows:
      {
        "eligibilityRate": 42,
        "potentialRate": 68,
        "missingCriteria": [
          { "text": "Expected duration of participation", "category": "Standard" },
          { "text": "Prior/concurrent medication restrictions", "category": "Required" }
        ],
        "ambiguousCriteria": [
          { "text": "Adequate organ function", "suggestion": "Define specific laboratory parameters" }
        ],
        "highImpactCriteria": [
          { "id": 2, "text": "ECOG performance status of 0 or 1", "type": "inclusion" },
          { "id": 5, "text": "Prior anticancer therapy within 4 weeks", "type": "exclusion" }
        ],
        "suggestions": [
          { 
            "criterion": "Age 18-75 years", 
            "suggestion": "Consider extending upper age limit to 80 years with adequate organ function", 
            "potentialImpact": "Could increase eligibility by 8-10%" 
          }
        ],
        "regulatoryGuidance": [
          { 
            "title": "ICH E6(R2) Compliance", 
            "description": "Criteria comply with ICH guidelines for subject selection criteria" 
          },
          { 
            "title": "FDA Guidance for ${indication}", 
            "description": "Consider adding criteria for specific biomarkers relevant to this indication" 
          }
        ]
      }
    `;

    const response = await openai.chat.completions.create({
      model: MODEL,
      messages: [
        { role: "system", content: "You are a clinical protocol expert assistant specializing in eligibility criteria analysis." },
        { role: "user", content: prompt },
      ],
      response_format: { type: "json_object" },
      temperature: 0.3,
    });

    const result = safeParseJson(response.choices[0].message.content);
    return result;
  } catch (error: any) {
    console.error("Error analyzing criteria impact:", error);
    throw new Error(`Failed to analyze criteria impact: ${error.message || 'Unknown error'}`);
  }
}

/**
 * Analyzes the schedule of assessments for patient burden and other factors
 */
export async function analyzeScheduleBurden(
  tableHeaders: any[],
  tableData: any,
  indication: string,
  synopsis?: string | null
): Promise<any> {
  try {
    // Prepare the schedule data for analysis
    const headers = Array.isArray(tableHeaders) ? tableHeaders : JSON.parse(tableHeaders);
    const assessments = typeof tableData === 'string' ? JSON.parse(tableData) : tableData;
    
    // Format the table data for better readability in the prompt
    let tableFormatted = "Schedule of Activities:\n";
    tableFormatted += headers.join(" | ") + "\n";
    
    // Process assessments by category
    for (const [category, assessmentsList] of Object.entries(assessments)) {
      if (Array.isArray(assessmentsList)) {
        tableFormatted += `\nCategory: ${category}\n`;
        for (const item of assessmentsList) {
          if (item && item.assessment && Array.isArray(item.values)) {
            const assessmentName = item.assessment;
            const values = item.values.map((v: any) => v || "-");
            tableFormatted += `${assessmentName}: ${values.join(" | ")}\n`;
          }
        }
      }
    }
    
    // Convert table data to markdown format for the improved prompt
    let tableMarkdown = "| Assessment";
    headers.forEach((header: any) => {
      tableMarkdown += ` | ${header}`;
    });
    tableMarkdown += " |\n";
    
    // Add separator row
    tableMarkdown += "|" + "---".repeat(headers.length + 1).split("").join("|") + "|\n";
    
    // Add assessment rows
    for (const [category, assessmentsList] of Object.entries(assessments)) {
      if (Array.isArray(assessmentsList)) {
        for (const item of assessmentsList) {
          if (item && item.assessment && Array.isArray(item.values)) {
            tableMarkdown += `| ${item.assessment}`;
            item.values.forEach((value: any) => {
              tableMarkdown += ` | ${value || ""}`;
            });
            tableMarkdown += " |\n";
          }
        }
      }
    }

    // Use the improved prompt from the attached file
    const prompt = `You are a clinical-trial operations analyst with expertise in population-specific burden assessment.

────────────────────────────────────
TASK
────────────────────────────────────
Analyze the Schedule of Activities (SoA) table for a clinical trial in **${indication || "unspecified indication"}**.

${synopsis ? `
────────────────────────────────────
STUDY SYNOPSIS - EXTRACT SPECIFIC POPULATION
────────────────────────────────────
${synopsis}

**CRITICAL INSTRUCTION:** From the synopsis above, identify the EXACT patient population:
- Specific disease state/subtype (e.g., "metastatic hormone-sensitive prostate cancer" not just "prostate cancer")
- Disease stage/severity (e.g., "newly diagnosed", "advanced", "metastatic")  
- Previous treatment status (e.g., "treatment-naive", "failed prior therapy")
- Age/demographic specifics mentioned
- Performance status or functional requirements
- Specific inclusion criteria that define this population
- Any comorbidity or risk factors mentioned

**USE THIS SPECIFIC POPULATION** to tailor your burden assessment. Do not use generic disease categories.

**EXAMPLE FOR SPECIFIC ASSESSMENT:**
If synopsis mentions "metastatic hormone-sensitive prostate cancer (mHSPC)" - assess for:
- Elderly male population (median age 65-70) with potential mobility/frailty concerns
- Newly diagnosed metastatic disease patients dealing with emotional burden of diagnosis
- Specific procedural concerns: PSA monitoring frequency, bone health assessments, androgen deprivation therapy monitoring
- Site considerations: urology/oncology expertise required, specialized imaging capabilities

If synopsis mentions "treatment-naive" vs "previously treated" - adjust burden expectations accordingly.
If synopsis mentions "ECOG 0-1" vs "ECOG 0-2" - factor in performance status impact on visit tolerance.
` : ''}

────────────────────────────────────
INPUT FORMAT
────────────────────────────────────
- The table below is a Markdown table.  
  • **Rows** = visits (e.g., Screening, Week 4, Month 6, EOS).  
  • **Columns** = assessments/procedures (e.g., Labs, ECG, PROs).  
  • Cell "✓" (or any non-blank token) = assessment performed at that visit; blank = not performed.

${tableMarkdown}

────────────────────────────────────
POPULATION-SPECIFIC CONSIDERATIONS
────────────────────────────────────
Based on **${indication || "unspecified indication"}**, consider these factors in your assessment:

**AGE-RELATED FACTORS:**
• Elderly populations (65+): Higher burden for frequent visits, mobility challenges, cognitive assessments
• Pediatric populations: Caregiver burden, developmental considerations, child-friendly procedures
• Young adults: Work/school conflicts, long-term commitment concerns

**DISEASE-SPECIFIC FACTORS:**
• Oncology: Disease severity, treatment toxicity, immune status, performance status impact
• Cardiovascular: Exercise limitations, medication interactions, emergency risk
• Neurological: Cognitive burden, mobility issues, caregiver dependency
• Psychiatric: Stigma concerns, medication compliance, assessment sensitivity
• Rare diseases: Travel burden, specialized center requirements, family involvement

**THERAPEUTIC AREA CONSIDERATIONS:**
• Oncology trials: Higher tolerance for burden due to life-threatening condition
• Preventive trials: Lower tolerance, healthy volunteer considerations
• Chronic conditions: Long-term sustainability, quality of life preservation

**SOCIOECONOMIC FACTORS:**
• Employment considerations: Working-age populations may need evening/weekend visits
• Geographic factors: Rural populations may have longer travel times
• Technology access: Digital health assessments may not be feasible for all populations
• Insurance/healthcare access: May affect compliance with complex schedules

**COMORBIDITY CONSIDERATIONS:**
• Multiple chronic conditions: Additional medication interactions, monitoring needs
• Cognitive impairment: Simplified procedures, caregiver involvement
• Physical limitations: Mobility aids, accessibility requirements
• Mental health: Anxiety about procedures, need for supportive environment

────────────────────────────────────
SCORING RUBRICS
────────────────────────────────────
PATIENT BURDEN (1–10)  
• 1–3 = low, 4–6 = moderate, 7–10 = high  
• **Population-specific adjustments:**
  - Elderly/frail: +1-2 points for frequent visits, +1 point for invasive procedures
  - Oncology: Disease severity context (advanced stage = higher tolerance)
  - Rare disease: +2 points for travel to specialized centers
  - Pediatric: +1 point for caregiver time, school absence considerations
  - Working adults: +1 point for frequent weekday visits
  - Chronic conditions: Consider disease burden and treatment fatigue

SITE WORKLOAD (1–10)  
• 1–3 = low, 4–6 = moderate, 7–10 = high  
• **Indication-specific requirements:**
  - Oncology: +1-2 points for specialized infusion, safety monitoring, adverse event management
  - Cardiology: +1 point for ECG expertise, emergency preparedness, exercise testing
  - Neurology: +1 point for specialized cognitive assessments, mobility evaluation
  - Pediatric: +1-2 points for child-friendly facilities, specialized pediatric staff
  - Rare diseases: +1 point for specialized training, rare expertise requirements

────────────────────────────────────
REGULATORY CONTEXT
────────────────────────────────────
Assume ICH E6 (R3) plus indication-specific FDA guidance for **${indication || "unspecified indication"}**.

────────────────────────────────────
OUTPUT
────────────────────────────────────
Return only valid, minified JSON with the exact keys below (no extra keys, comments, or trailing commas).
If data are insufficient for a section, set that value to null.

{
  "patientBurdenAssessment":{
    "patientBurdenScore":7,
    "totalVisits":12,
    "totalProcedures":36,
    "visitFrequency":"2 per month",
    "populationContext":"Context explaining why this burden level is significant for the EXACT patient population identified from the synopsis (e.g., 'For mHSPC patients who are typically elderly males...' rather than generic 'oncology patients'), considering specific age demographics, disease characteristics, and population-specific challenges",
    "proceduralConcerns":["Specific procedures that contribute most to burden", "Frequency-related concerns", "Population-specific challenges"],
    "recommendations":["Combine lab tests", "Use remote assessments"]
  },
  "siteBurdenAssessment":{
    "siteWorkloadScore":6,
    "avgProceduresPerVisit":3.2,
    "staffTimeHoursPerVisit":2.5,
    "specialEquipment":["ECG machine", "Specialized lab equipment"],
    "operationalContext":"Explanation of why this workload level is challenging for sites treating the SPECIFIC patient population from the synopsis (e.g., 'mHSPC patients require specialized urology/oncology coordination...' rather than generic 'oncology sites'), including population-specific operational requirements",
    "staffingChallenges":["Specific staffing or expertise requirements", "Training needs", "Equipment constraints"],
    "recommendations":["Streamline data collection", "Provide additional training"]
  },
  "protocolEfficiency":{
    "redundantAssessments":["Duplicate vital signs"],
    "missingAssessments":["Drug-specific biomarkers"],
    "optimizationOpportunities":["Use central lab", "Implement telemedicine visits"]
  },
  "regulatoryConsiderations":{
    "requiredAssessments":["Safety labs", "ECG"],
    "potentialDeviations":["Missing PK samples", "Out-of-window visits"]
  },
  "overallAssessment":{
    "overallBurdenScore":6,
    "scheduleQualityScore":7,
    "contextualSummary":"Overall assessment explaining how the schedule burden relates to the SPECIFIC patient population identified from the synopsis (use exact terminology like 'mHSPC patients' rather than 'prostate cancer patients'), highlighting population-specific concerns and positive aspects",
    "riskFactorsAndMitigations":["High visit burden - implement remote monitoring"]
  }
}`;
    
    const response = await openai.chat.completions.create({
      model: MODEL,
      messages: [
        { 
          role: "system", 
          content: "You are an expert in clinical research operations analyzing study schedules. Provide detailed insights into patient burden and protocol efficiency." 
        },
        { 
          role: "user", 
          content: prompt 
        }
      ],
      response_format: { type: "json_object" },
      max_tokens: 1500,
      temperature: 0.5,
    });
    
    // Parse and return the response
    const analysisContent = response.choices[0].message.content || "{}";
    return safeParseJson(analysisContent);
    
  } catch (error: any) {
    console.error("Error analyzing schedule burden:", error);
    throw new Error(`Failed to analyze schedule burden: ${error.message || 'Unknown error'}`);
  }
}

/**
 * Generates Cohort Definition for a prospective cohort study
 */
export async function generateCohortDefinition(
  synopsis: string,
  supplementaryInfo?: string[]
): Promise<ProtocolComponent> {
  try {
    const prompt = `
      You are an expert epidemiologist specializing in cohort study design.
      
      Based on the following study synopsis, generate a comprehensive Cohort Definition for a prospective cohort study.
      IMPORTANT: Focus specifically on the research question, population, exposures, and outcomes mentioned in the synopsis.
      Tailor the cohort definition to the specific conditions and exposures described.
      
      The Cohort Definition should include:
      1. Target population description (demographics, health status, geographic scope)
      2. Exposure groups definition (specific exposures being studied)
      3. Comparison strategy (how exposed and unexposed or differently exposed groups will be compared)
      4. Follow-up duration (with scientific rationale)
      5. Recruitment sources and approach
      6. Retention strategies
      
      SYNOPSIS:
      ${synopsis}
      
      ${supplementaryInfo && supplementaryInfo.length > 0 ? `ADDITIONAL INFORMATION:\n${supplementaryInfo.join('\n')}\n` : ''}
      
      Generate a Cohort Definition in a structured format.
      Your response should be in JSON format with:
      {
        "content": {
          "population": "Target population description",
          "exposureGroups": [
            {
              "id": "unique identifier",
              "name": "name of exposure group",
              "definition": "specific definition of this exposure group",
              "expectedSize": "anticipated number of participants in this group if possible to estimate"
            }
          ],
          "comparisonStrategy": "description of how groups will be compared",
          "followupDuration": {
            "value": "numeric duration value",
            "unit": "one of: days, weeks, months, years",
            "rationale": "scientific rationale for this duration"
          },
          "recruitmentSource": ["list of recruitment sources"],
          "recruitmentApproach": "description of recruitment strategy",
          "retentionStrategy": "approach to maximize cohort retention"
        },
        "explanation": "Brief explanation of design decisions and considerations for this cohort definition"
      }
    `;

    const response = await openai.chat.completions.create({
      model: MODEL,
      messages: [
        { 
          role: "system", 
          content: "You are an epidemiology expert assistant specialized in cohort study design. You provide detailed, scientifically accurate cohort definitions based on research questions." 
        },
        { role: "user", content: prompt },
      ],
      response_format: { type: "json_object" },
      temperature: 0.3,
    });

    const result = safeParseJson(response.choices[0].message.content);
    return result as ProtocolComponent;
  } catch (error) {
    console.error("Error generating cohort definition:", error);
    throw new Error("Failed to generate cohort definition");
  }
}

/**
 * Generates Observation Schedule for a prospective cohort study
 */
export async function generateObservationSchedule(
  synopsis: string,
  supplementaryInfo?: string[]
): Promise<ProtocolComponent> {
  try {
    const prompt = `
      You are an expert epidemiologist specializing in cohort study design.
      
      Based on the following study synopsis, generate an Observation Schedule for a prospective cohort study.
      IMPORTANT: Focus specifically on the research question, exposures, and outcomes mentioned in the synopsis.
      Tailor the observation schedule to efficiently capture the exposures and outcomes of interest.
      
      The Observation Schedule should include:
      1. Baseline assessment (timing and measurements)
      2. Follow-up assessments (timing, windows, and measurements)
      3. Unscheduled assessments (if applicable, triggered by specific events)
      4. End of study assessment (if different from regular follow-up)
      
      SYNOPSIS:
      ${synopsis}
      
      ${supplementaryInfo && supplementaryInfo.length > 0 ? `ADDITIONAL INFORMATION:\n${supplementaryInfo.join('\n')}\n` : ''}
      
      Generate an Observation Schedule in a structured format.
      Your response should be in JSON format with:
      {
        "content": {
          "baselineAssessment": {
            "timing": "when baseline data will be collected",
            "measurements": [
              {
                "name": "measurement name",
                "method": "how it will be measured",
                "rationale": "why this measurement is important"
              }
            ]
          },
          "followupAssessments": [
            {
              "id": "unique identifier",
              "timing": "when follow-up will occur",
              "window": "acceptable timeframe for assessment",
              "measurements": [
                {
                  "name": "measurement name",
                  "method": "how it will be measured",
                  "rationale": "why this measurement is important"
                }
              ]
            }
          ],
          "unscheduledAssessments": [
            {
              "trigger": "event that triggers assessment",
              "measurements": ["list of measurements to collect"]
            }
          ],
          "endOfStudyAssessment": {
            "timing": "when end of study assessment occurs",
            "measurements": ["list of final measurements"]
          }
        },
        "explanation": "Brief explanation of the observation schedule design and scientific rationale"
      }
    `;

    const response = await openai.chat.completions.create({
      model: MODEL,
      messages: [
        { 
          role: "system", 
          content: "You are an epidemiology expert assistant specialized in cohort study design. You provide detailed, scientifically accurate observation schedules for longitudinal studies." 
        },
        { role: "user", content: prompt },
      ],
      response_format: { type: "json_object" },
      temperature: 0.3,
    });

    const result = safeParseJson(response.choices[0].message.content);
    return result as ProtocolComponent;
  } catch (error) {
    console.error("Error generating observation schedule:", error);
    throw new Error("Failed to generate observation schedule");
  }
}

/**
 * Generates Exposure Assessment methodology for a prospective cohort study
 */
export async function generateExposureAssessment(
  synopsis: string,
  supplementaryInfo?: string[]
): Promise<ProtocolComponent> {
  try {
    const prompt = `
      You are an expert epidemiologist specializing in exposure assessment for observational studies.
      
      Based on the following study synopsis, generate a comprehensive Exposure Assessment methodology for a prospective cohort study.
      IMPORTANT: Focus specifically on the exposures mentioned in the synopsis and how they should be measured.
      Tailor the exposure assessment to the specific exposures of interest and study context.
      
      The Exposure Assessment should include:
      1. Primary exposure definition and measurement method
      2. Secondary exposures (if applicable)
      3. Potential confounders and how they will be measured
      4. Exposure timeline (when and how often exposures will be assessed)
      5. Validation procedures for exposure measurements
      
      SYNOPSIS:
      ${synopsis}
      
      ${supplementaryInfo && supplementaryInfo.length > 0 ? `ADDITIONAL INFORMATION:\n${supplementaryInfo.join('\n')}\n` : ''}
      
      Generate an Exposure Assessment in a structured format.
      Your response should be in JSON format with:
      {
        "content": {
          "primaryExposure": {
            "name": "name of primary exposure",
            "definition": "clear definition of exposure",
            "measurementMethod": "how exposure will be measured",
            "frequency": "how often exposure will be assessed",
            "validation": "approach to validate exposure measurement"
          },
          "secondaryExposures": [
            {
              "name": "name of secondary exposure",
              "definition": "clear definition of exposure",
              "measurementMethod": "how exposure will be measured",
              "rationale": "why this secondary exposure is important"
            }
          ],
          "potentialConfounders": [
            {
              "name": "name of confounder",
              "relationship": "how it relates to exposure and outcome",
              "measurementMethod": "how confounder will be measured"
            }
          ],
          "exposureTimeline": "description of when exposures will be assessed throughout the study"
        },
        "explanation": "Brief explanation of exposure assessment approach and considerations"
      }
    `;

    const response = await openai.chat.completions.create({
      model: MODEL,
      messages: [
        { 
          role: "system", 
          content: "You are an epidemiology expert assistant specialized in exposure assessment for observational studies. You provide detailed, scientifically accurate exposure assessment methodologies." 
        },
        { role: "user", content: prompt },
      ],
      response_format: { type: "json_object" },
      temperature: 0.3,
    });

    const result = safeParseJson(response.choices[0].message.content);
    return result as ProtocolComponent;
  } catch (error) {
    console.error("Error generating exposure assessment:", error);
    throw new Error("Failed to generate exposure assessment");
  }
}

/**
 * Generates Data Source definition for a retrospective cohort study
 */
export async function generateDataSource(
  synopsis: string,
  supplementaryInfo?: string[]
): Promise<ProtocolComponent> {
  try {
    const prompt = `
      You are an expert epidemiologist specializing in retrospective cohort studies and medical database research.
      
      Based on the following study synopsis, generate a comprehensive Data Source definition for a retrospective cohort study.
      IMPORTANT: Focus specifically on the data sources needed to answer the research questions mentioned in the synopsis.
      Tailor the data source definition to the specific study context, disease/condition, and outcomes.
      
      The Data Source definition should include:
      1. Data sources to be used (electronic health records, claims databases, registries, etc.)
      2. Timeframe for data extraction
      3. Data extraction process
      4. Data quality assessment approach
      5. Missing data handling
      
      SYNOPSIS:
      ${synopsis}
      
      ${supplementaryInfo && supplementaryInfo.length > 0 ? `ADDITIONAL INFORMATION:\n${supplementaryInfo.join('\n')}\n` : ''}
      
      Generate a Data Source definition in a structured format.
      Your response should be in JSON format with:
      {
        "content": {
          "sources": [
            {
              "name": "name of data source",
              "type": "one of: medical_records, claims, registry, other",
              "timeframe": {
                "startDate": "start date for data extraction",
                "endDate": "end date for data extraction",
                "rationale": "rationale for chosen timeframe"
              },
              "accessApprovals": ["list of required approvals for access"]
            }
          ],
          "dataExtractionProcess": {
            "method": "one of: manual, automated, hybrid",
            "extractors": "who will extract the data",
            "validation": "approach to validate extracted data",
            "reconciliation": "how discrepancies will be handled"
          },
          "dataQualityAssessment": "approach to assess data quality and completeness",
          "missingDataDescription": "approach to handling missing data"
        },
        "explanation": "Brief explanation of data source selection and considerations"
      }
    `;

    const response = await openai.chat.completions.create({
      model: MODEL,
      messages: [
        { 
          role: "system", 
          content: "You are an epidemiology expert assistant specialized in retrospective cohort study design and medical database research. You provide detailed, scientifically accurate data source definitions." 
        },
        { role: "user", content: prompt },
      ],
      response_format: { type: "json_object" },
      temperature: 0.3,
    });

    const result = safeParseJson(response.choices[0].message.content);
    return result as ProtocolComponent;
  } catch (error) {
    console.error("Error generating data source definition:", error);
    throw new Error("Failed to generate data source definition");
  }
}

/**
 * Generates Retrospective Cohort Definition for a retrospective cohort study
 */
export async function generateRetrospectiveCohortDefinition(
  synopsis: string,
  supplementaryInfo?: string[]
): Promise<ProtocolComponent> {
  try {
    const prompt = `
      You are an expert epidemiologist specializing in retrospective cohort study design.
      
      Based on the following study synopsis, generate a comprehensive Retrospective Cohort Definition.
      IMPORTANT: Focus specifically on how to define the cohort using existing data sources.
      Tailor the definition to the specific research question, exposures, and outcomes mentioned.
      
      The Retrospective Cohort Definition should include:
      1. Index event definition (how cohort entry will be determined)
      2. Lookback period (pre-index period to establish baseline)
      3. Follow-up period (observation window post-index)
      4. Exposure group definitions
      5. Exposure assignment methodologies
      
      SYNOPSIS:
      ${synopsis}
      
      ${supplementaryInfo && supplementaryInfo.length > 0 ? `ADDITIONAL INFORMATION:\n${supplementaryInfo.join('\n')}\n` : ''}
      
      Generate a Retrospective Cohort Definition in a structured format.
      Your response should be in JSON format with:
      {
        "content": {
          "indexEvent": {
            "definition": "clear definition of the index event",
            "identification": "how it will be identified in records",
            "validationCriteria": "criteria to validate index event identification"
          },
          "lookback": {
            "period": "duration of lookback period",
            "purpose": "what will be established during this period"
          },
          "followup": {
            "period": "duration of follow-up period",
            "censoring": [
              {
                "event": "event that would censor follow-up",
                "handling": "how censoring will be handled analytically"
              }
            ]
          },
          "exposureGroups": [
            {
              "name": "name of exposure group",
              "definition": "definition of this group",
              "identificationCriteria": ["criteria used to identify this group"]
            }
          ],
          "exposureAssignment": {
            "timing": "when exposure will be assigned",
            "method": "methodology for exposure assignment"
          }
        },
        "explanation": "Brief explanation of cohort definition approach and key considerations"
      }
    `;

    const response = await openai.chat.completions.create({
      model: MODEL,
      messages: [
        { 
          role: "system", 
          content: "You are an epidemiology expert assistant specialized in retrospective cohort study design. You provide detailed, scientifically accurate cohort definitions for database research." 
        },
        { role: "user", content: prompt },
      ],
      response_format: { type: "json_object" },
      temperature: 0.3,
    });

    const result = safeParseJson(response.choices[0].message.content);
    return result as ProtocolComponent;
  } catch (error) {
    console.error("Error generating retrospective cohort definition:", error);
    throw new Error("Failed to generate retrospective cohort definition");
  }
}

/**
 * Generates AI assistant responses based on user queries
 */
export async function getAIAssistantResponse(
  query: string,
  protocol: any,
  context?: string
): Promise<string> {
  try {
    const prompt = `
      You are an expert clinical protocol assistant helping a clinical trial researcher.
      
      The researcher is working on the following protocol:
      ${JSON.stringify(protocol, null, 2)}
      
      IMPORTANT: Focus specifically on the disease, treatment, and population mentioned in the protocol.
      DO NOT default to referencing NSCLC or any specific disease unless it's mentioned in the protocol.
      Tailor your response specifically to the condition and intervention described in the protocol.
      
      ${context ? `CONTEXT:\n${context}\n` : ''}
      
      QUERY:
      ${query}
      
      Provide a helpful, informative response that directly addresses the query.
      Use your expertise in clinical trials and protocol development to give specific, actionable advice.
      Reference relevant sections of the protocol when appropriate.
      If you don't have enough information to properly answer, explain what additional details would be helpful.
    `;

    const response = await openai.chat.completions.create({
      model: MODEL,
      messages: [
        { role: "system", content: "You are a clinical protocol expert assistant." },
        { role: "user", content: prompt },
      ],
      temperature: 0.5,
    });

    const aiResponse = response.choices[0].message.content || "I'm sorry, I couldn't generate a response at this time.";
    
    // Log the response for debugging
    console.log("AI Assistant response generated, length:", aiResponse.length);
    console.log("AI Assistant response preview:", aiResponse.substring(0, 100) + "...");
    
    return aiResponse;
  } catch (error: any) {
    console.error("Error generating assistant response:", error);
    throw new Error(`Failed to generate assistant response: ${error.message || 'Unknown error'}`);
  }
}

/**
 * Generate estimands for a clinical study protocol
 * @param synopsis Study synopsis
 * @param protocolType Type of protocol
 * @param endpoints Available endpoints (primary, secondary, exploratory)
 * @returns Generated estimands following ICH E9(R1) guidelines
 */
export async function generateEstimands(
  synopsis: string,
  protocolType: string,
  endpoints: { primary?: any[], secondary?: any[], exploratory?: any[] }
): Promise<{ estimands: any[] }> {
  try {
    console.log("Generating estimands with AI for protocol type:", protocolType);

    // Create prompt for estimand generation
    const prompt = `
You are an expert biostatistician specialized in ICH E9(R1) estimand framework. Generate comprehensive estimands for a clinical study protocol.

Study Synopsis:
${synopsis}

Protocol Type: ${protocolType}

Available Endpoints:
${endpoints.primary?.length ? `Primary: ${endpoints.primary.map(ep => ep.name).join(', ')}` : ''}
${endpoints.secondary?.length ? `Secondary: ${endpoints.secondary.map(ep => ep.name).join(', ')}` : ''}
${endpoints.exploratory?.length ? `Exploratory: ${endpoints.exploratory.map(ep => ep.name).join(', ')}` : ''}

Generate estimands following ICH E9(R1) guidelines with these four key attributes:
1. Population: Target population for analysis
2. Variable: The specific measurement or outcome variable
3. Population-level summary: How the variable will be summarized (e.g., difference in means, hazard ratio)
4. Intercurrent event handling: Strategy for dealing with events that affect interpretation

For intercurrent event strategies, use one of these:
- treatment_policy: Ignore intercurrent events, include all subjects
- composite: Include intercurrent events as part of the variable
- hypothetical: Estimate what would happen if intercurrent events didn't occur
- while_on_treatment: Only consider outcomes while on assigned treatment
- principal_stratum: Focus on subpopulation that would not experience intercurrent events

Generate 1-3 estimands that cover the most important endpoints. Provide detailed justification for each strategy choice.

Respond in JSON format:
{
  "estimands": [
    {
      "endpointName": "Name of linked endpoint",
      "estimandType": "primary|secondary|exploratory",
      "population": "Description of target population",
      "variable": "Specific variable definition",
      "populationLevelSummary": "Statistical summary measure",
      "intercurrentEventStrategy": "treatment_policy|composite|hypothetical|while_on_treatment|principal_stratum",
      "intercurrentEventHandling": "Detailed description of how intercurrent events are handled",
      "justification": "Rationale for this estimand strategy"
    }
  ]
}`;

    const response = await openai.chat.completions.create({
      model: MODEL,
      messages: [
        {
          role: "system",
          content: "You are an expert biostatistician specializing in ICH E9(R1) estimand framework. Generate comprehensive, regulatory-compliant estimands."
        },
        {
          role: "user",
          content: prompt
        }
      ],
      response_format: { type: "json_object" },
      max_tokens: 2000,
      temperature: 0.3
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error("Empty response from OpenAI");
    }

    const result = safeParseJson(content);
    
    if (!result.estimands || !Array.isArray(result.estimands)) {
      throw new Error("Invalid estimands format in response");
    }

    console.log(`Generated ${result.estimands.length} estimands`);
    return result;
    
  } catch (error: any) {
    console.error("Error generating estimands:", error);
    throw new Error(`Failed to generate estimands: ${error.message || 'Unknown error'}`);
  }
}
