import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { generateProtocolSchema, insertProtocolSchema, Protocol, DesignState, BoilerplateSection } from "@shared/schema";
import { fromZodError } from "zod-validation-error";
import * as openaiService from "./services/openai-service";
import * as clinicaltrialsService from "./services/clinicaltrials-service";
import { analyzeDesignQualityMetrics } from "./services/design-quality-service";
import { generateProtocolOverview } from "./services/protocol-overview-service";
import multer from "multer";
import path from "path";
import { extractStructuredContentFromFile } from "./utils/file-parser";

// Helper function to get boilerplate text content for a protocol
async function getBoilerplateSelectionsForProtocol(protocol: Protocol): Promise<Record<string, string | null> | undefined> {
  try {
    if (!protocol.id || !protocol.activeDesignState) {
      console.log("Protocol has no active design state");
      return undefined;
    }
    
    // Get the active design state directly from storage
    const activeDesignState = await storage.getDesignState(protocol.id, protocol.activeDesignState);
    if (!activeDesignState || !activeDesignState.boilerplateSelections) {
      console.log("Active design state not found or has no boilerplate selections");
      return undefined;
    }
    
    console.log(`Retrieved design state with ID ${activeDesignState.id} for protocol ${protocol.id}`);
    
    // If boilerplate selections exist, retrieve full text content for each selected boilerplate
    const result: Record<string, string | null> = {};
    
    for (const [section, textId] of Object.entries(activeDesignState.boilerplateSelections)) {
      if (!textId) {
        result[section] = null;
        continue;
      }
      
      // Get full boilerplate text content from storage
      try {
        const boilerplateText = await storage.getBoilerplateTextById(textId);
        if (boilerplateText) {
          console.log(`Retrieved boilerplate text ${textId} for section ${section}`);
          result[section as BoilerplateSection] = boilerplateText.content;
        } else {
          console.log(`Boilerplate text ${textId} not found for section ${section}`);
          result[section as BoilerplateSection] = null;
        }
      } catch (error) {
        console.error(`Error retrieving boilerplate text ${textId} for section ${section}:`, error);
        result[section as BoilerplateSection] = null;
      }
    }
    
    console.log(`Processed ${Object.keys(result).length} boilerplate sections`);
    return result;
  } catch (error) {
    console.error("Error retrieving boilerplate selections:", error);
    return undefined;
  }
}

type SupplementaryChunk = {
  id?: string;
  text: string;
  sourceLabel: string;
  usage: string;
  type: string;
  index: number;
};

const SUPPLEMENTARY_CHUNK_SIZE = 1800;
const SUPPLEMENTARY_CHUNK_OVERLAP = 220;

function getSupplementaryQueryTerms(query: string): string[] {
  return Array.from(new Set(
    String(query || "")
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter(term => term.length > 2)
  ));
}

function createServerSupplementaryChunks(
  text: string,
  sourceLabel: string,
  usage: string,
  type: string,
  idPrefix: string
): SupplementaryChunk[] {
  const normalizedText = String(text || "").replace(/\s+/g, " ").trim();
  if (!normalizedText) return [];

  const chunks: SupplementaryChunk[] = [];
  let start = 0;

  while (start < normalizedText.length) {
    const end = Math.min(start + SUPPLEMENTARY_CHUNK_SIZE, normalizedText.length);
    const chunkText = normalizedText.slice(start, end).trim();
    if (chunkText) {
      chunks.push({
        id: `${idPrefix}-chunk-${chunks.length + 1}`,
        text: chunkText,
        sourceLabel,
        usage,
        type,
        index: chunks.length + 1
      });
    }
    if (end >= normalizedText.length) break;
    start = Math.max(0, end - SUPPLEMENTARY_CHUNK_OVERLAP);
  }

  return chunks;
}

function parseSupplementaryInfoItems(supplementaryInfo: any): any[] {
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

  return items;
}

function normalizeSupplementaryInfo(supplementaryInfo: any, query = "", maxChunks = 8): string[] {
  const items = parseSupplementaryInfoItems(supplementaryInfo);
  const queryTerms = getSupplementaryQueryTerms(query);
  const chunks: SupplementaryChunk[] = [];

  items.forEach((item: any, index: number) => {
    if (!item) return;

    if (typeof item === "string") {
      chunks.push(...createServerSupplementaryChunks(
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
    chunks.push(...createServerSupplementaryChunks(content, label, usage, type, item.id || `item-${index + 1}`));
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

function isValidGenerationMode(mode: any): mode is "preserve" | "augment" | "generate" {
  return mode === "preserve" || mode === "augment" || mode === "generate";
}

// Type validation helper functions
const validDesignTypes = ["randomized", "non-randomized", "observational", "single-arm", "consensus"] as const;
type DesignType = typeof validDesignTypes[number];

function validateDesignType(type: string): DesignType {
  const normalized = type.toLowerCase();
  if (validDesignTypes.includes(normalized as DesignType)) {
    return normalized as DesignType;
  }
  return "randomized";
}

const validGenderTypes = ["male", "female", "both"] as const;
type GenderType = typeof validGenderTypes[number];

function validateGenderType(gender: string): GenderType {
  const normalized = gender.toLowerCase();
  if (validGenderTypes.includes(normalized as GenderType)) {
    return normalized as GenderType;
  }
  return "both";
}

// Helper function to sanitize study parameters to ensure type safety
function sanitizeStudyParameters(params: any, protocolType?: string): openaiService.StudyParameters {
  // Create a copy to avoid modifying the original
  const sanitized = JSON.parse(JSON.stringify(params));
  
  // Remove any suggested protocol type to prevent AI from changing the user selection
  if (sanitized.studyDesign && sanitized.studyDesign.suggestedProtocolType) {
    console.log(`Removing AI-suggested protocol type: ${sanitized.studyDesign.suggestedProtocolType}, keeping: ${protocolType || 'default type'}`);
    delete sanitized.studyDesign.suggestedProtocolType;
  }
  
  // Ensure population exists
  if (!sanitized.population) {
    sanitized.population = {
      ageRange: { min: 0, max: 0 },
      gender: "both" as GenderType,
      healthStatus: "",
      keyInclusion: [],
      keyExclusion: []
    };
  }
  
  // Validate gender
  if (sanitized.population.gender) {
    sanitized.population.gender = validateGenderType(String(sanitized.population.gender));
  } else {
    sanitized.population.gender = "both";
  }
  
  // Process based on protocol type
  if (protocolType === 'secondary_data_analysis' || protocolType === 'retrospective_cohort_study') {
    // For secondary data analysis/retrospective studies - observational design with no blinding
    sanitized.design = {
      type: "observational" as DesignType,
      analyticalApproach: sanitized.design?.analyticalApproach || "Retrospective data analysis"
    };
    
    // Ensure dataSource is present for secondary data analysis
    if (!sanitized.dataSource) {
      sanitized.dataSource = {
        name: "Electronic Health Records",
        type: "Healthcare database", 
        timePeriod: "Last 5 years",
        geographicScope: "National"
      };
    }
    
    // Remove intervention for observational studies as it's not applicable
    delete sanitized.intervention;
    
    // Set appropriate timing fields
    if (!sanitized.timing) {
      sanitized.timing = {
        studyDuration: "6 months of analysis",
        dataCutoffs: "Data from last 5 years"
      };
    } else if (!sanitized.timing.dataCutoffs) {
      sanitized.timing.dataCutoffs = "Data from last 5 years";
    }
    
    // Remove visitFrequency as it's not applicable
    if (sanitized.timing) {
      delete sanitized.timing.visitFrequency;
    }
    
  } else if (protocolType === 'delphi_consensus') {
    // For Delphi consensus studies
    sanitized.design = {
      type: "consensus" as DesignType
    };
    
    // Ensure consensusMethod is present
    if (!sanitized.consensusMethod) {
      sanitized.consensusMethod = {
        name: "Modified Delphi",
        rounds: 3,
        scoringSystem: "9-point Likert scale",
        threshold: "≥7 by ≥70% of participants"
      };
    }
    
    // Ensure expertPanel is present
    if (!sanitized.expertPanel) {
      sanitized.expertPanel = {
        size: 20,
        composition: "Multidisciplinary experts"
      };
    }
    
    // Remove intervention as it's not applicable
    delete sanitized.intervention;
    
  } else if (protocolType === 'prospective_cohort_study') {
    // For prospective cohort studies
    sanitized.design = {
      type: "observational" as DesignType,
    };
    
    // Rename intervention to exposure if needed
    if (sanitized.intervention) {
      sanitized.intervention.duration = sanitized.intervention.duration || "Throughout follow-up period";
    }
    
  } else {
    // Default for interventional clinical trials
    if (!sanitized.design) {
      sanitized.design = {
        type: "randomized" as DesignType,
        blinding: "none"
      };
    }
    
    // Validate design type
    if (sanitized.design.type) {
      sanitized.design.type = validateDesignType(String(sanitized.design.type));
    } else {
      sanitized.design.type = "randomized";
    }
  }
  
  return sanitized;
}

// Configure multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    const allowedExtensions = ['.txt', '.pdf', '.doc', '.docx', '.png', '.jpg', '.jpeg', '.webp', '.gif'];
    const ext = path.extname(file.originalname).toLowerCase();
    
    if (allowedExtensions.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error(`Only ${allowedExtensions.join(', ')} files are allowed`));
    }
  },
});

function publicStructuredExtraction(structuredExtraction: any) {
  const publicTables = (structuredExtraction.tables || []).map((table: any) => {
    if (!table || typeof table !== "object") return table;
    const { rawOoxml, ...publicTable } = table;
    return {
      ...publicTable,
      rawOoxmlAvailable: typeof rawOoxml === "string" && rawOoxml.length > 0,
      rawOoxmlLength: typeof rawOoxml === "string" ? rawOoxml.length : 0,
    };
  });

  return {
    tables: publicTables,
    images: (structuredExtraction.images || []).map((image: any) => {
      const { dataUri, ...publicImage } = image;
      const includePreview =
        image.recommendedUse === "study_schema" &&
        typeof dataUri === "string" &&
        dataUri.length > 0 &&
        dataUri.length <= 5_800_000;
      return {
        ...publicImage,
        imageDataUri: includePreview ? dataUri : undefined,
        imageDataUriAvailable: typeof dataUri === "string" && dataUri.length > 0,
        imageDataUriLength: typeof dataUri === "string" ? dataUri.length : 0
      };
    }),
    warnings: structuredExtraction.warnings || [],
    extractionSummary: structuredExtraction.extractionSummary
  };
}

function parseProtocolComponentsForRoute(components: any): any[] {
  if (Array.isArray(components)) return components;
  if (typeof components === "string") {
    try {
      const parsed = JSON.parse(components);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

function parseJsonFieldForRoute<T>(value: any, fallback: T): T {
  if (value == null) return fallback;
  if (typeof value !== "string") return value as T;
  const trimmed = value.trim();
  if (!trimmed) return fallback;
  try {
    return JSON.parse(trimmed);
  } catch {
    return fallback;
  }
}

function stringifyJsonFieldForRoute(value: any, fallback: any): string {
  const source = value == null || value === "" ? fallback : value;
  if (typeof source === "string") return source;
  try {
    return JSON.stringify(source);
  } catch {
    return JSON.stringify(fallback);
  }
}

function buildProtocolUpsertPayload(id: string, body: any) {
  return {
    id,
    title: body.title || id || "Untitled Protocol",
    phase: body.phase || "Not specified",
    indication: body.indication || "Not specified",
    status: body.status || "Draft",
    protocolType: body.protocolType || "interventional_clinical_trial",
    synopsis: body.synopsis || "",
    supplementaryInfo: stringifyJsonFieldForRoute(body.supplementaryInfo, []),
    createdBy: body.createdBy || "User",
    userId: typeof body.userId === "number" ? body.userId : null,
    tableData: stringifyJsonFieldForRoute(body.tableData, {}),
    tableHeaders: stringifyJsonFieldForRoute(body.tableHeaders, []),
    inclusionCriteria: stringifyJsonFieldForRoute(body.inclusionCriteria, []),
    exclusionCriteria: stringifyJsonFieldForRoute(body.exclusionCriteria, []),
    dataVariables: stringifyJsonFieldForRoute(body.dataVariables, []),
    studySchema: stringifyJsonFieldForRoute(body.studySchema, { nodes: [], edges: [] }),
    statisticalAnalysisPlan: stringifyJsonFieldForRoute(body.statisticalAnalysisPlan, {
      sampleSize: { total: 0, perArm: 0, justification: "" },
      primaryEndpoints: [],
      secondaryEndpoints: [],
      analysisPopulations: [],
      statisticalMethods: []
    }),
    generatedProtocol: stringifyJsonFieldForRoute(body.generatedProtocol, []),
    overview: body.overview || null,
    designStates: Array.isArray(body.designStates) ? body.designStates : parseJsonFieldForRoute(body.designStates, []),
    activeDesignState: body.activeDesignState || null,
    components: Array.isArray(body.components) ? body.components : parseJsonFieldForRoute(body.components, []),
  };
}

function getComponentDataForRoute(components: any[], ...types: string[]) {
  return components.find((component: any) => types.includes(component?.type))?.data;
}

function upsertSectionInputReviewsComponent(components: any[], data: any) {
  const now = new Date().toISOString();
  const existing = components.find((component) => component?.type === "sectionInputReviews");
  const component = {
    designStateId: existing?.designStateId || "default",
    type: "sectionInputReviews",
    data,
    createdAt: existing?.createdAt || now,
    updatedAt: now
  };
  return [
    ...components.filter((item) => item?.type !== "sectionInputReviews"),
    component
  ];
}

function upsertSourceAssessmentComponent(components: any[], data: any) {
  const now = new Date().toISOString();
  const existing = components.find((component) => component?.type === "sourceAssessment");
  const component = {
    designStateId: existing?.designStateId || "default",
    type: "sourceAssessment",
    data,
    createdAt: existing?.createdAt || now,
    updatedAt: now
  };
  return [
    ...components.filter((item) => item?.type !== "sourceAssessment"),
    component
  ];
}

export async function registerRoutes(app: Express): Promise<Server> {
  // put application routes here
  // prefix all routes with /api

  // Get all protocols
  app.get("/api/protocols", async (req: Request, res: Response) => {
    try {
      const protocols = await storage.getAllProtocols();
      
      // Format the response to match the expected format
      const formattedProtocols = protocols.map(protocol => ({
        id: protocol.id,
        title: protocol.title,
        phase: protocol.phase,
        indication: protocol.indication,
        status: protocol.status,
        lastEdited: protocol.lastEdited.toISOString(),
        createdBy: protocol.createdBy
      }));
      
      res.json(formattedProtocols);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch protocols", error: String(error) });
    }
  });
  
  // Get protocol by ID
  app.get("/api/protocols/:id", async (req: Request, res: Response) => {
    try {
      const protocol = await storage.getProtocolById(req.params.id);
      
      if (!protocol) {
        return res.status(404).json({ message: "Protocol not found" });
      }
      
      // Get the active design state to load component data
      const activeDesignState = await storage.getActiveDesignState(req.params.id);
      
      const allComponents = parseProtocolComponentsForRoute(protocol.components);
      const scheduleComponent = getComponentDataForRoute(allComponents, "schedule", "scheduleOfActivities");
      const criteriaComponent = getComponentDataForRoute(allComponents, "criteria", "eligibilityCriteria");
      const variablesComponent = getComponentDataForRoute(allComponents, "variables", "dataVariables");
      const schemaComponent = getComponentDataForRoute(allComponents, "studySchema");
      const analysisComponent = getComponentDataForRoute(allComponents, "analysisPlan", "statisticalAnalysisPlan");
      const safetyComponent = getComponentDataForRoute(allComponents, "safetyDrugHandling");
      const sectionInputReviewComponent = getComponentDataForRoute(allComponents, "sectionInputReviews");
      const sourceAssessmentComponent = getComponentDataForRoute(allComponents, "sourceAssessment");

      // Parse JSON strings to objects for client consumption and merge persisted component snapshots.
      let formattedProtocol: any = {
        ...protocol,
        components: allComponents,
        designStates: parseJsonFieldForRoute(protocol.designStates, []),
        supplementaryInfo: parseJsonFieldForRoute(protocol.supplementaryInfo, []),
        tableData: parseJsonFieldForRoute(protocol.tableData, {}),
        tableHeaders: parseJsonFieldForRoute(protocol.tableHeaders, []),
        inclusionCriteria: parseJsonFieldForRoute(protocol.inclusionCriteria, []),
        exclusionCriteria: parseJsonFieldForRoute(protocol.exclusionCriteria, []),
        dataVariables: parseJsonFieldForRoute(protocol.dataVariables, []),
        generatedProtocol: parseJsonFieldForRoute(protocol.generatedProtocol, protocol.generatedProtocol || null),
      };

      const activeStateFromProtocol = Array.isArray(formattedProtocol.designStates)
        ? formattedProtocol.designStates.find((state: any) => state?.id === protocol.activeDesignState) || formattedProtocol.designStates[0]
        : null;

      if (!formattedProtocol.synopsis && activeStateFromProtocol?.synopsis) {
        formattedProtocol.synopsis = activeStateFromProtocol.synopsis;
      }

      if (scheduleComponent) {
        if (scheduleComponent.tableData) formattedProtocol.tableData = scheduleComponent.tableData;
        if (scheduleComponent.tableHeaders) formattedProtocol.tableHeaders = scheduleComponent.tableHeaders;
        if (scheduleComponent.soaProvenance) formattedProtocol.soaProvenance = scheduleComponent.soaProvenance;
        if (scheduleComponent.soaSourceTables) formattedProtocol.soaSourceTables = scheduleComponent.soaSourceTables;
        if (scheduleComponent.soaTableLayout) formattedProtocol.soaTableLayout = scheduleComponent.soaTableLayout;
        if (scheduleComponent.soaSplitAfterIndex != null) formattedProtocol.soaSplitAfterIndex = scheduleComponent.soaSplitAfterIndex;
        if (scheduleComponent.tableHeaderOrigins) formattedProtocol.tableHeaderOrigins = scheduleComponent.tableHeaderOrigins;
      }

      if (criteriaComponent) {
        if (criteriaComponent.inclusionCriteria) formattedProtocol.inclusionCriteria = criteriaComponent.inclusionCriteria;
        if (criteriaComponent.exclusionCriteria) formattedProtocol.exclusionCriteria = criteriaComponent.exclusionCriteria;
      }

      if (variablesComponent?.dataVariables) formattedProtocol.dataVariables = variablesComponent.dataVariables;
      if (schemaComponent) formattedProtocol.studySchema = schemaComponent.studySchema || schemaComponent;
      if (analysisComponent) formattedProtocol.statisticalAnalysisPlan = analysisComponent.statisticalAnalysisPlan || analysisComponent;
      if (safetyComponent) formattedProtocol.safetyDrugHandling = safetyComponent;
      if (sectionInputReviewComponent) formattedProtocol.sectionInputReviews = sectionInputReviewComponent;
      if (sourceAssessmentComponent) formattedProtocol.sourceAssessment = sourceAssessmentComponent;
      
      // If we have an active design state, load component data and merge it
      if (activeDesignState) {
        try {
          const components = await storage.getComponentsByDesignState(req.params.id, activeDesignState.id);
          
          // Merge component data with protocol data
          for (const component of components) {
            if ((component.type === 'schedule' || component.type === 'scheduleOfActivities') && component.data) {
              if (component.data.tableData) formattedProtocol.tableData = component.data.tableData;
              if (component.data.tableHeaders) formattedProtocol.tableHeaders = component.data.tableHeaders;
              if (component.data.soaProvenance) formattedProtocol.soaProvenance = component.data.soaProvenance;
              if (component.data.soaSourceTables) formattedProtocol.soaSourceTables = component.data.soaSourceTables;
              if (component.data.soaTableLayout) formattedProtocol.soaTableLayout = component.data.soaTableLayout;
              if (component.data.soaSplitAfterIndex != null) formattedProtocol.soaSplitAfterIndex = component.data.soaSplitAfterIndex;
              if (component.data.tableHeaderOrigins) formattedProtocol.tableHeaderOrigins = component.data.tableHeaderOrigins;
            } else if ((component.type === 'criteria' || component.type === 'eligibilityCriteria') && component.data) {
              if (component.data.inclusionCriteria) formattedProtocol.inclusionCriteria = component.data.inclusionCriteria;
              if (component.data.exclusionCriteria) formattedProtocol.exclusionCriteria = component.data.exclusionCriteria;
            } else if ((component.type === 'variables' || component.type === 'dataVariables') && component.data) {
              if (component.data.dataVariables) formattedProtocol.dataVariables = component.data.dataVariables;
            } else if (component.type === 'studySchema' && component.data) {
              formattedProtocol.studySchema = component.data.studySchema || component.data;
            } else if ((component.type === 'analysisPlan' || component.type === 'statisticalAnalysisPlan') && component.data) {
              formattedProtocol.statisticalAnalysisPlan = component.data.statisticalAnalysisPlan || component.data;
            } else if (component.type === 'safetyDrugHandling' && component.data) {
              formattedProtocol.safetyDrugHandling = component.data;
            } else if (component.type === 'sectionInputReviews' && component.data) {
              formattedProtocol.sectionInputReviews = component.data;
            } else if (component.type === 'sourceAssessment' && component.data) {
              formattedProtocol.sourceAssessment = component.data;
            }
          }
        } catch (componentError) {
          console.warn("Error loading components for protocol:", componentError);
          // Continue with protocol data only
        }
      }
      
      res.json(formattedProtocol);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch protocol", error: String(error) });
    }
  });
  
  // Create new protocol
  app.post("/api/protocols", async (req: Request, res: Response) => {
    try {
      // Validate the request body
      const validatedData = insertProtocolSchema.safeParse(req.body);
      
      if (!validatedData.success) {
        const validationError = fromZodError(validatedData.error);
        return res.status(400).json({ message: "Invalid protocol data", errors: validationError.message });
      }
      
      // Generate a unique ID if not provided
      if (!validatedData.data.id) {
        const randomId = Math.floor(Math.random() * 10000);
        validatedData.data.id = `EV-${randomId}`;
      }
      
      // Create protocol
      const protocol = await storage.createProtocol(validatedData.data);
      
      // For all protocol types, we'll create an initial design state with parameters appropriate to the type,
      // but we won't generate an overview until the user explicitly requests it
      
      // First check if it's a type that should have an initial design state
      if (protocol.protocolType) {
        console.log(`Creating initial design state for ${protocol.protocolType} protocol ${protocol.id}`);
        
        // Create appropriate default study parameters based on protocol type
        let defaultStudyParameters: any = {};
        
        if (protocol.protocolType === 'secondary_data_analysis') {
          defaultStudyParameters = {
            population: {
              ageRange: { min: 18, max: 99 },
              gender: "both" as GenderType,
              healthStatus: "All eligible patients in database",
              keyInclusion: ["Patients in the selected database", "Diagnosis of condition of interest"],
              keyExclusion: ["Missing key data elements"]
            },
            // No intervention for secondary data analysis
            design: {
              type: "observational" as DesignType,
              analyticalApproach: "Retrospective data analysis"
            },
            outcomes: {
              primary: [{
                name: "Primary outcome",
                description: "Key outcome of interest",
                timepoint: "Study period"
              }]
            },
            timing: {
              studyDuration: "Database study period",
              dataCutoffs: "Data from last 5 years"
            },
            dataSource: {
              type: "electronic_health_records",
              name: "Database source",
              description: "Clinical or claims database",
              timeframe: "Database coverage period"
            }
          };
        } else if (protocol.protocolType === 'retrospective_cohort_study') {
          defaultStudyParameters = {
            population: {
              ageRange: { min: 18, max: 99 },
              gender: "both" as GenderType,
              healthStatus: "Patients with target condition",
              keyInclusion: ["Diagnosis of target condition", "Complete medical records"],
              keyExclusion: ["Missing outcome data"]
            },
            design: {
              type: "observational" as DesignType,
              analyticalApproach: "Retrospective cohort analysis"
            },
            outcomes: {
              primary: [{
                name: "Primary outcome",
                description: "Key outcome of interest",
                timepoint: "End of observation period"
              }]
            },
            timing: {
              studyDuration: "Retrospective analysis period",
              dataCutoffs: "Data from medical records"
            },
            dataSource: {
              type: "electronic_health_records",
              name: "Medical records",
              description: "Hospital/clinic records",
              timeframe: "Past 5 years"
            }
          };
        } else if (protocol.protocolType === 'interventional_clinical_trial') {
          defaultStudyParameters = {
            population: {
              ageRange: { min: 18, max: 85 },
              gender: "both" as GenderType,
              healthStatus: "Patients with target condition",
              keyInclusion: ["Adult patients", "Confirmed diagnosis"],
              keyExclusion: ["Contraindications to treatment"]
            },
            intervention: {
              name: "Study intervention",
              description: "Treatment under investigation"
            },
            design: {
              type: "randomized" as DesignType,
              blinding: "double-blind",
              allocation: "1:1"
            },
            outcomes: {
              primary: [{
                name: "Primary endpoint",
                description: "Key outcome measure",
                timepoint: "End of study period"
              }]
            },
            timing: {
              studyDuration: "12 months",
              visitFrequency: "Monthly"
            }
          };
        }
        
        // Always create a design state, with or without parameters
      // Create the initial design state with the customized parameters
      const initialDesignState = {
        id: `${protocol.id}-DS-001`,
        label: 'Initial Design',
        protocolId: protocol.id,
        timestamp: new Date(),
        synopsis: protocol.synopsis || "",
        protocolType: protocol.protocolType || 'interventional_clinical_trial',
        studyParameters: defaultStudyParameters
      };
      
      console.log(`Creating initial design state with ID ${initialDesignState.id} and protocol type ${initialDesignState.protocolType}`);
      
      // Always create a design state and set it as active
      await storage.createDesignState(protocol.id, initialDesignState);
      await storage.setActiveDesignState(protocol.id, initialDesignState.id);
      
      // Update the protocol to ensure the protocolType is consistent
      await storage.updateProtocol(protocol.id, {
        protocolType: protocol.protocolType || 'interventional_clinical_trial'
      });
      }
      
      res.status(201).json(protocol);
    } catch (error) {
      res.status(500).json({ message: "Failed to create protocol", error: String(error) });
    }
  });
  
  // Update protocol
  app.put("/api/protocols/:id", async (req: Request, res: Response) => {
    try {
      const protocol = await storage.getProtocolById(req.params.id);
      
      if (!protocol) {
        const createdProtocol = await storage.createProtocol(
          buildProtocolUpsertPayload(req.params.id, req.body)
        );
        return res.status(201).json(createdProtocol);
      }
      
      // Update protocol
      const updatedProtocol = await storage.updateProtocol(req.params.id, req.body);
      
      if (!updatedProtocol) {
        return res.status(404).json({ message: "Protocol not found" });
      }
      
      res.json(updatedProtocol);
    } catch (error) {
      res.status(500).json({ message: "Failed to update protocol", error: String(error) });
    }
  });
  
  // Delete protocol
  app.delete("/api/protocols/:id", async (req: Request, res: Response) => {
    try {
      const protocol = await storage.getProtocolById(req.params.id);
      
      if (!protocol) {
        return res.status(404).json({ message: "Protocol not found" });
      }
      
      // Delete protocol
      const deleted = await storage.deleteProtocol(req.params.id);
      
      if (!deleted) {
        return res.status(500).json({ message: "Failed to delete protocol" });
      }
      
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ message: "Failed to delete protocol", error: String(error) });
    }
  });
  
  // Generate protocol with AI
  app.post("/api/generate-protocol", async (req: Request, res: Response) => {
    try {
      // Validate the request body
      const validatedData = generateProtocolSchema.safeParse(req.body);
      
      if (!validatedData.success) {
        const validationError = fromZodError(validatedData.error);
        return res.status(400).json({ message: "Invalid generation data", errors: validationError.message });
      }
      
      // Generate protocol
      const protocol = await storage.generateProtocol(validatedData.data);
      
      res.status(201).json(protocol);
    } catch (error) {
      res.status(500).json({ message: "Failed to generate protocol", error: String(error) });
    }
  });
  
  // Analyze synopsis with AI
  app.post("/api/analyze-synopsis", async (req: Request, res: Response) => {
    try {
      const { synopsis, protocolId, protocolType } = req.body;
      
      if (!synopsis || typeof synopsis !== 'string') {
        return res.status(400).json({ message: "Synopsis text is required" });
      }
      
      // Get protocol to ensure protocol type is correctly applied
      let existingProtocol = null;
      if (protocolId) {
        existingProtocol = await storage.getProtocolById(protocolId);
      }
      
      // Use protocol type from request, or from protocol record if available
      const effectiveProtocolType = protocolType || existingProtocol?.protocolType || 'interventional_clinical_trial';
      console.log(`Analyzing synopsis with protocol type: ${effectiveProtocolType}`);
      
      // Call the OpenAI service to analyze the synopsis with protocol type
      const analysisResult = await openaiService.analyzeSynopsis(synopsis, effectiveProtocolType);
      
      // Extract detailed study parameters from the synopsis
      // Pass the protocol type to make extraction type-specific
      const studyParameters = await openaiService.extractStudyParameters(synopsis, effectiveProtocolType);
      
      // Ensure the study parameters don't override our explicitly chosen protocol type
      // This prevents AI from suggesting a different protocol type during analysis
      if (studyParameters && studyParameters.studyDesign) {
        delete studyParameters.studyDesign.suggestedProtocolType;
      }
      
      // Add nuanced completeness values based on recommendations
      if (analysisResult.missingElements && analysisResult.elements) {
        // Process elements to have more granular completeness values
        analysisResult.elements = analysisResult.elements.map(element => {
          const elementName = element.element.toLowerCase();
          
          // Find matching recommendations
          const matchingRecommendation = analysisResult.missingElements.find(
            rec => rec.toLowerCase().includes(elementName) ||
                  (elementName.includes("title") && rec.toLowerCase().includes("title")) ||
                  (elementName.includes("criter") && rec.toLowerCase().includes("inclusion")) ||
                  (elementName.includes("duration") && rec.toLowerCase().includes("duration")) ||
                  (elementName.includes("justification") && rec.toLowerCase().includes("sample size")) ||
                  (elementName.includes("analysis") && rec.toLowerCase().includes("statistical"))
          );
          
          // If there's a matching recommendation but element is marked complete, adjust it
          if (matchingRecommendation && element.status === "complete") {
            // Set appropriate partial value based on the element type
            let completeness = 65; // Default partial value
            
            const recLower = matchingRecommendation.toLowerCase();
            if (elementName.includes("title")) {
              completeness = recLower.includes("not clearly") ? 75 : 30;
            } 
            else if (elementName.includes("design")) {
              completeness = 80;
            }
            else if (elementName.includes("population") || elementName.includes("criteria")) {
              completeness = recLower.includes("some criteria") ? 60 : 30;
            }
            else if (elementName.includes("duration")) {
              completeness = recLower.includes("mentioned") ? 45 : 20;
            }
            else if (elementName.includes("sample size")) {
              completeness = recLower.includes("mentioned") ? 40 : 15;
            }
            else if (elementName.includes("statistical")) {
              completeness = recLower.includes("outlined") ? 55 : 25;
            }
            
            return {
              ...element,
              status: "partial",
              details: matchingRecommendation,
              completeness: completeness
            };
          }
          
          // Handle missing and partial cases explicitly
          if (element.status === "missing") {
            return { ...element, completeness: 0 };
          } else if (element.status === "partial") {
            return { ...element, completeness: 50 };
          } else {
            return { ...element, completeness: 100 };
          }
        });
      }
      
      // Generate a unique protocol ID if one isn't provided
      const currentDate = new Date();
      const randomId = Math.floor(1000 + Math.random() * 9000);
      // Format: EV-[random 4 digits]
      const processedId = protocolId || `EV-${randomId}`;
      
      // Check if protocol exists (override current value if found)
      let protocolRecord = await storage.getProtocolById(processedId);
      
      // Create the protocol if it doesn't exist
      if (!protocolRecord) {
        console.log(`Protocol with ID ${processedId} not found, creating new protocol...`);
        
        // Extract title from synopsis
        let title = "Clinical Trial Protocol";
        const firstLine = synopsis.split('\n')[0].trim();
        if (firstLine.length < 100) {
          title = firstLine;
        }
        
        // Create new protocol with the protocol type
        protocolRecord = await storage.createProtocol({
          id: processedId,
          title,
          phase: effectiveProtocolType === 'interventional_clinical_trial' ? 'Phase 3' : 'N/A',
          indication: 'Unknown', // Default indication
          status: 'draft',
          synopsis: synopsis,
          createdBy: 'system',
          userId: 1,
          tableData: '[]', // Empty JSON array
          tableHeaders: '[]', // Empty JSON array
          protocolType: effectiveProtocolType, // Store the protocol type
          lastEdited: new Date().toISOString(), // Ensure lastEdited is a proper ISO date string
          activeDesignState: null, // Will be set after design state creation
          designStates: JSON.stringify([]) // Initialize empty array
        });
        
        // Create initial design state with protocol-type specific defaults
        let defaultStudyParameters;
        
        // Set appropriate defaults based on protocol type
        if (protocolType === "secondary_data_analysis" || protocolType === "retrospective_cohort_study") {
          // Secondary data analysis/RWE defaults
          defaultStudyParameters = {
            population: {
              ageRange: { min: 0, max: 0 },
              gender: "both" as "male" | "female" | "both",
              healthStatus: "",
              keyInclusion: [],
              keyExclusion: []
            },
            // No intervention for secondary data analysis
            dataSource: {
              name: "Electronic Health Records",
              type: "Retrospective Database",
              timePeriod: "",
              geographicScope: ""
            },
            outcomes: {
              primary: [{
                name: "",
                description: "",
                timepoint: ""
              }]
            },
            timing: {
              studyDuration: "",
              dataCutoffs: "",
              // No visit frequency for secondary data analysis
            },
            design: {
              type: "observational", // Default for secondary data is observational
              analyticalApproach: "Multivariate regression"
            }
          };
        } else if (protocolType === "prospective_cohort_study") {
          // Prospective cohort study defaults
          defaultStudyParameters = {
            population: {
              ageRange: { min: 0, max: 0 },
              gender: "both" as "male" | "female" | "both",
              healthStatus: "",
              keyInclusion: [],
              keyExclusion: []
            },
            // Use intervention field for exposure
            intervention: {
              name: "Primary Exposure",
              description: "",
              duration: ""
            },
            outcomes: {
              primary: [{
                name: "",
                description: "",
                timepoint: ""
              }]
            },
            timing: {
              studyDuration: "",
              visitFrequency: "",
              followUpPeriod: ""
            },
            design: {
              type: "observational",
              exposureMeasurement: "Self-reported"
            }
          };
        } else if (protocolType === "delphi_consensus") {
          // Delphi consensus study defaults
          defaultStudyParameters = {
            population: {
              ageRange: { min: 0, max: 0 },
              gender: "both" as "male" | "female" | "both",
              healthStatus: "",
              keyInclusion: [],
              keyExclusion: []
            },
            expertPanel: {
              size: 0,
              composition: ""
            },
            consensusMethod: {
              name: "Delphi",
              rounds: 3,
              scoringSystem: "Likert 1-9",
              threshold: "70% agreement"
            },
            outcomes: {
              primary: [{
                name: "Consensus",
                description: "Consensus statements",
                timepoint: "Final Delphi round"
              }]
            },
            timing: {
              studyDuration: "",
              roundDuration: ""
            },
            design: {
              type: "consensus",
              feedbackMethod: "Anonymized"
            }
          };
        } else {
          // Default for interventional trials
          defaultStudyParameters = {
            population: {
              ageRange: { min: 0, max: 0 },
              gender: "both" as "male" | "female" | "both",
              healthStatus: "",
              keyInclusion: [],
              keyExclusion: []
            },
            intervention: {
              name: "",
              description: ""
            },
            comparator: {
              type: "none",
              name: "",
              description: ""
            },
            outcomes: {
              primary: [{
                name: "",
                description: "",
                timepoint: ""
              }]
            },
            timing: {
              studyDuration: "",
              visitFrequency: ""
            },
            design: {
              type: "randomized",
              blinding: "none"
            }
          };
        }
        
        // Use our sanitizeStudyParameters helper to ensure type safety
        const rawParams = studyParameters || defaultStudyParameters;
        // Pass protocol type to sanitize function to customize based on study type
        const sanitizedParams = sanitizeStudyParameters(rawParams, protocolType);
        
        // Create the design state with sanitized parameters
        const initialDesignState = {
          id: `${processedId}-DS-001`,
          label: 'Initial Design',
          protocolId: processedId,
          timestamp: new Date(),
          synopsis: synopsis,
          protocolType: effectiveProtocolType, // Use the same effective protocol type
          studyParameters: sanitizedParams
        };
        
        // Ensure that if there's a suggestedProtocolType in the parameters, we ignore it
        if (initialDesignState.studyParameters && 
            initialDesignState.studyParameters.studyDesign && 
            initialDesignState.studyParameters.studyDesign.suggestedProtocolType) {
          // Log that we're ignoring a suggested protocol type
          console.log(`Ignoring suggested protocol type: ${initialDesignState.studyParameters.studyDesign.suggestedProtocolType}, keeping user-selected type: ${effectiveProtocolType}`);
          delete initialDesignState.studyParameters.studyDesign.suggestedProtocolType;
        }
        
        console.log(`Creating initial design state with ID ${initialDesignState.id} and protocol type ${initialDesignState.protocolType}`);
        
        await storage.createDesignState(processedId, initialDesignState);
        await storage.setActiveDesignState(processedId, initialDesignState.id);
        
        // Get the updated protocol to ensure type consistency
        protocolRecord = await storage.getProtocolById(processedId);
        
        // Double-check for protocol type consistency between protocol and design state
        if (protocolRecord && protocolRecord.protocolType !== initialDesignState.protocolType) {
          console.log(`Protocol type mismatch detected. Protocol: ${protocolRecord.protocolType}, Design state: ${initialDesignState.protocolType}`);
          
          // Update protocol to match design state protocol type for consistency
          await storage.updateProtocol(processedId, {
            protocolType: initialDesignState.protocolType,
            activeDesignState: initialDesignState.id
          });
          
          // Refresh the protocol record
          protocolRecord = await storage.getProtocolById(processedId);
        }
        
        console.log(`Created initial design state for protocol ${processedId}`);
      }

      const sourceAssessment = {
        assessment: analysisResult.assessment,
        readinessLevel: analysisResult.readinessLevel,
        extractedFields: Array.isArray(analysisResult.extractedFields) ? analysisResult.extractedFields : [],
        elements: Array.isArray(analysisResult.elements) ? analysisResult.elements : [],
        missingElements: Array.isArray(analysisResult.missingElements) ? analysisResult.missingElements : [],
        sourceDocumentsNeeded: Array.isArray(analysisResult.sourceDocumentsNeeded) ? analysisResult.sourceDocumentsNeeded : [],
        nextSteps: Array.isArray(analysisResult.nextSteps) ? analysisResult.nextSteps : [],
        sourceUseRecommendations: Array.isArray((analysisResult as any).sourceUseRecommendations) ? (analysisResult as any).sourceUseRecommendations : [],
        studyLogicAssessment: Array.isArray((analysisResult as any).studyLogicAssessment) ? (analysisResult as any).studyLogicAssessment : [],
        assumptionsRequiringReview: Array.isArray((analysisResult as any).assumptionsRequiringReview) ? (analysisResult as any).assumptionsRequiringReview : [],
        protocolType: effectiveProtocolType,
        generatedAt: new Date().toISOString()
      };

      try {
        const existingComponents = parseProtocolComponentsForRoute(protocolRecord?.components);
        const updatedComponents = upsertSourceAssessmentComponent(existingComponents, sourceAssessment);
        await storage.updateProtocol(processedId, { components: updatedComponents } as any);
        protocolRecord = await storage.getProtocolById(processedId);
      } catch (persistError) {
        console.warn(`Could not persist source assessment for protocol ${processedId}:`, persistError);
      }
      
      // Combine the analysis results with the extracted study parameters and protocol info
      const response = {
        ...analysisResult,
        sourceAssessment,
        studyParameters,
        protocol: protocolRecord,
        protocolType: effectiveProtocolType // Explicitly include the protocol type in the response
      };
      
      // Log to confirm we're preserving the protocol type
      console.log(`Analyze synopsis response includes protocol type: ${effectiveProtocolType}`);
      
      res.json(response);
    } catch (error) {
      console.error("Error in analyze-synopsis endpoint:", error);
      res.status(500).json({ message: "Failed to analyze synopsis", error: String(error) });
    }
  });

  app.post("/api/export-source-assessment", async (req: Request, res: Response) => {
    try {
      const { protocol = {}, report = {} } = req.body || {};
      const {
        Document,
        Packer,
        Paragraph,
        TextRun,
        HeadingLevel,
      } = await import("docx");

      const cleanText = (value: any) => String(value ?? "").replace(/\s+/g, " ").trim();
      const safeFilename = cleanText(protocol.id || "protocol").replace(/[^a-zA-Z0-9_-]/g, "_");
      const paragraph = (text: any, options: any = {}) => new Paragraph({
        ...options,
        children: [new TextRun(cleanText(text) || "Not specified")]
      });
      const bullet = (text: any) => new Paragraph({
        bullet: { level: 0 },
        children: [new TextRun(cleanText(text) || "Not specified")]
      });
      const labeledParagraph = (label: string, text: any) => new Paragraph({
        children: [
          new TextRun({ text: `${label}: `, bold: true }),
          new TextRun(cleanText(text) || "Not specified")
        ]
      });
      const labeledBullet = (label: string, text: any) => new Paragraph({
        bullet: { level: 0 },
        children: [
          new TextRun({ text: `${label}: `, bold: true }),
          new TextRun(cleanText(text) || "Not specified")
        ]
      });
      const spacer = () => new Paragraph({ text: "" });
      const isGenericPopulationDetails = (element: any) => {
        const elementName = cleanText(element?.element).toLowerCase();
        const details = cleanText(element?.details).toLowerCase();
        return (
          (elementName.includes("population") || elementName.includes("inclusion") || elementName.includes("exclusion") || elementName.includes("eligibility")) &&
          element?.status !== "complete" &&
          (
            details.includes("not fully described") ||
            details.includes("lacking important details") ||
            details.includes("more detail") ||
            details.includes("should be expanded")
          )
        );
      };
      const actionableElementDetails = (element: any) => {
        if (!isGenericPopulationDetails(element)) return element?.details;
        return "The source gives the general population, but the team still needs protocol-ready eligibility detail. Review and add the exact inclusion/exclusion domains that apply to this study: disease confirmation and stage/severity, prior therapy and washout rules, ECOG/performance status, organ-function/laboratory thresholds, prohibited concomitant therapies, CNS disease or other clinically significant comorbidities, infection or concurrent malignancy exclusions, hypersensitivity to study treatment/class, reproductive status/contraception, recent surgery/radiation, and prior investigational-product exposure. Use bracketed placeholders where thresholds or time windows require team confirmation.";
      };

      const children: any[] = [
        new Paragraph({
          text: "Protocol Source Assessment Report",
          heading: HeadingLevel.TITLE
        }),
        paragraph(`Protocol: ${cleanText(protocol.title || protocol.id || "Untitled protocol")}`),
        paragraph(`Protocol ID: ${cleanText(protocol.id || "Not assigned")}`),
        paragraph(`Protocol type: ${cleanText(protocol.protocolType || "Not specified")}`),
        paragraph(`Generated: ${report.generatedAt ? new Date(report.generatedAt).toLocaleString() : new Date().toLocaleString()}`),
        new Paragraph({ text: "Executive Summary", heading: HeadingLevel.HEADING_1 }),
        paragraph(report.assessment || "No assessment summary was available."),
        paragraph(`Readiness: ${cleanText(report.readinessLevel || "not assessed")}`),
      ];

      const extractedFields = Array.isArray(report.extractedFields) ? report.extractedFields : [];
      if (extractedFields.length) {
        children.push(new Paragraph({ text: "Key Source Facts", heading: HeadingLevel.HEADING_1 }));
        extractedFields.forEach((field: any) => {
          children.push(labeledBullet(cleanText(field.label || "Field"), `${cleanText(field.value || "Not found")} (${cleanText(field.status || "status not specified")})`));
        });
      }

      const sourceUseRecommendations = Array.isArray(report.sourceUseRecommendations) ? report.sourceUseRecommendations : [];
      if (sourceUseRecommendations.length) {
        children.push(new Paragraph({ text: "Recommended Source Use Plan", heading: HeadingLevel.HEADING_1 }));
        sourceUseRecommendations.forEach((item: any) => {
          children.push(new Paragraph({ text: cleanText(item.protocolArea || "Protocol area"), heading: HeadingLevel.HEADING_2 }));
          children.push(labeledParagraph("Source status", item.sourceStatus || "Not specified"));
          children.push(labeledParagraph("Recommended action", item.recommendedAction || "Not specified"));
          children.push(labeledParagraph("Why", item.why || "Not specified"));
          children.push(labeledParagraph("Proposed handling", item.proposedHandling || "Not specified"));
          if (item.sourceEvidence) {
            children.push(labeledParagraph("Evidence", item.sourceEvidence));
          }

          const weakPoints = Array.isArray(item.specificWeakPoints) ? item.specificWeakPoints : [];
          if (weakPoints.length) {
            children.push(new Paragraph({ text: "Specific weak points", heading: HeadingLevel.HEADING_3 }));
            weakPoints.forEach((weakPoint: any) => children.push(bullet(weakPoint)));
          }

          const proposedAdditions = Array.isArray(item.proposedAdditions) ? item.proposedAdditions : [];
          if (proposedAdditions.length) {
            children.push(new Paragraph({ text: "Concrete proposed additions", heading: HeadingLevel.HEADING_3 }));
            proposedAdditions.forEach((addition: any, index: number) => {
              children.push(labeledParagraph(`Draft ${index + 1}`, addition?.draftText || addition));
              if (addition?.whyNeeded) {
                children.push(labeledParagraph("Why needed", addition.whyNeeded));
              }
              if (addition?.sourceBasis) {
                children.push(labeledParagraph("Source basis", addition.sourceBasis));
              }
              if (addition?.requiresUserConfirmation) {
                children.push(labeledParagraph("Confirmation", "Requires study team confirmation before final protocol use."));
              }
            });
          }

          const questions = Array.isArray(item.medicalWriterQuestions) ? item.medicalWriterQuestions : [];
          if (questions.length) {
            children.push(new Paragraph({ text: "Questions for study team", heading: HeadingLevel.HEADING_3 }));
            questions.forEach((question: any) => children.push(bullet(question)));
          }
          children.push(spacer());
        });
      }

      const studyLogicAssessment = Array.isArray(report.studyLogicAssessment) ? report.studyLogicAssessment : [];
      if (studyLogicAssessment.length) {
        children.push(new Paragraph({ text: "Study Logic Assessment", heading: HeadingLevel.HEADING_1 }));
        studyLogicAssessment.forEach((item: any) => {
          children.push(new Paragraph({ text: cleanText(item.area || "Assessment area"), heading: HeadingLevel.HEADING_2 }));
          children.push(labeledParagraph("Conclusion", item.conclusion || "Not specified"));
          children.push(labeledParagraph("Reasoning", item.reasoning || "Not specified"));
          if (item.riskLevel) {
            children.push(labeledParagraph("Risk", item.riskLevel));
          }
          if (item.recommendedFollowUp) {
            children.push(labeledParagraph("Recommended follow-up", item.recommendedFollowUp));
          }
          children.push(spacer());
        });
      }

      const elements = Array.isArray(report.elements) ? report.elements : [];
      if (elements.length) {
        children.push(new Paragraph({ text: "Protocol Input Coverage", heading: HeadingLevel.HEADING_1 }));
        elements.forEach((element: any) => {
          children.push(new Paragraph({ text: cleanText(element.element || "Protocol input"), heading: HeadingLevel.HEADING_2 }));
          children.push(labeledParagraph("Status", element.status || "Not specified"));
          children.push(labeledParagraph("Details", actionableElementDetails(element) || "Not specified"));
          children.push(spacer());
        });
      }

      const missingElements = Array.isArray(report.missingElements) ? report.missingElements : [];
      if (missingElements.length) {
        children.push(new Paragraph({ text: "Missing or Weak Inputs", heading: HeadingLevel.HEADING_1 }));
        missingElements.forEach((item: any) => children.push(bullet(item)));
      }

      const sourceDocumentsNeeded = Array.isArray(report.sourceDocumentsNeeded) ? report.sourceDocumentsNeeded : [];
      if (sourceDocumentsNeeded.length) {
        children.push(new Paragraph({ text: "Useful Additional Source Documents", heading: HeadingLevel.HEADING_1 }));
        sourceDocumentsNeeded.forEach((item: any) => children.push(bullet(item)));
      }

      const assumptionsRequiringReview = Array.isArray(report.assumptionsRequiringReview) ? report.assumptionsRequiringReview : [];
      if (assumptionsRequiringReview.length) {
        children.push(new Paragraph({ text: "Assumptions Requiring Team Review", heading: HeadingLevel.HEADING_1 }));
        assumptionsRequiringReview.forEach((item: any) => children.push(bullet(item)));
      }

      const nextSteps = Array.isArray(report.nextSteps) ? report.nextSteps : [];
      if (nextSteps.length) {
        children.push(new Paragraph({ text: "Suggested Next Steps", heading: HeadingLevel.HEADING_1 }));
        nextSteps.forEach((item: any) => children.push(bullet(item)));
      }

      const doc = new Document({
        sections: [{
          properties: {},
          children
        }]
      });
      const buffer = await Packer.toBuffer(doc);
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
      res.setHeader("Content-Disposition", `attachment; filename="${safeFilename}-source-assessment-report.docx"`);
      res.send(buffer);
    } catch (error) {
      console.error("Error exporting source assessment:", error);
      res.status(500).json({ message: "Failed to export source assessment", error: String(error) });
    }
  });
  
  // Generate Schedule of Activities with AI
  app.post("/api/generate-schedule", async (req: Request, res: Response) => {
    try {
      const { synopsis, supplementaryInfo, protocolId, designStateId, alignmentAnalysis, generationMode } = req.body;
      
      if (!synopsis || typeof synopsis !== 'string') {
        return res.status(400).json({ message: "Synopsis text is required" });
      }

      if (!isValidGenerationMode(generationMode)) {
        return res.status(400).json({ message: "Choose how to use the source content before generating the schedule." });
      }
      
      const supplementaryData = normalizeSupplementaryInfo(
        supplementaryInfo,
        "schedule of activities visit timepoints assessments procedures safety efficacy laboratory imaging treatment administration"
      );
        
      // Call the OpenAI service to generate schedule of activities
      const scheduleResult = await openaiService.generateScheduleOfActivities(
        synopsis, 
        supplementaryData,
        alignmentAnalysis,
        generationMode
      );
      
      // If protocol ID and design state ID are provided, save the component
      if (protocolId && designStateId) {
        try {
          // Store the schedule as a component linked to this design state
          await storage.createComponent(protocolId, {
            designStateId,
            type: "schedule",
            data: scheduleResult,
            createdAt: new Date(),
            updatedAt: new Date()
          });
          
          console.log(`Schedule component stored for design state ${designStateId}`);
        } catch (storageError) {
          console.error("Error storing schedule component:", storageError);
          // Continue anyway, as we can still return the generated schedule
        }
      }
      
      res.json(scheduleResult);
    } catch (error) {
      console.error("Error in generate-schedule endpoint:", error);
      res.status(500).json({ message: "Failed to generate schedule of assessments", error: String(error) });
    }
  });
  
  // Generate Inclusion/Exclusion Criteria with AI
  app.post("/api/generate-criteria", async (req: Request, res: Response) => {
    try {
      const { synopsis, supplementaryInfo, protocolId, designStateId, alignmentAnalysis, generationMode } = req.body;
      
      if (!synopsis || typeof synopsis !== 'string') {
        return res.status(400).json({ message: "Synopsis text is required" });
      }

      if (!isValidGenerationMode(generationMode)) {
        return res.status(400).json({ message: "Choose how to use the source content before generating eligibility criteria." });
      }
      
      const supplementaryData = normalizeSupplementaryInfo(
        supplementaryInfo,
        "inclusion exclusion eligibility criteria population diagnosis disease stage prior therapy laboratory values contraception"
      );
        
      // Call the OpenAI service to generate inclusion/exclusion criteria
      const criteriaResult = await openaiService.generateInclusionExclusionCriteria(
        synopsis, 
        supplementaryData,
        alignmentAnalysis,
        generationMode
      );
      
      // If protocol ID and design state ID are provided, save the component
      if (protocolId && designStateId) {
        try {
          // Store the criteria as a component linked to this design state
          await storage.createComponent(protocolId, {
            designStateId,
            type: "criteria",
            data: criteriaResult,
            createdAt: new Date(),
            updatedAt: new Date()
          });
          
          console.log(`Criteria component stored for design state ${designStateId}`);
        } catch (storageError) {
          console.error("Error storing criteria component:", storageError);
          // Continue anyway, as we can still return the generated criteria
        }
      }
      
      res.json(criteriaResult);
    } catch (error) {
      console.error("Error in generate-criteria endpoint:", error);
      res.status(500).json({ message: "Failed to generate inclusion/exclusion criteria", error: String(error) });
    }
  });
  
  // Generate Data Variables with AI
  app.post("/api/generate-variables", async (req: Request, res: Response) => {
    try {
      const { synopsis, supplementaryInfo, protocolId, designStateId, alignmentAnalysis, protocolType, generationMode } = req.body;
      
      if (!synopsis || typeof synopsis !== 'string') {
        return res.status(400).json({ message: "Synopsis text is required" });
      }

      if (!isValidGenerationMode(generationMode)) {
        return res.status(400).json({ message: "Choose how to use the source content before generating data variables." });
      }
      
      const supplementaryData = normalizeSupplementaryInfo(
        supplementaryInfo,
        "data variables endpoints assessments outcomes covariates CRF forms source data safety efficacy laboratory imaging"
      );
      
      // Call the OpenAI service to generate data variables
      const variablesResult = await openaiService.generateDataVariables(
        synopsis, 
        supplementaryData,
        undefined, // tableData
        undefined, // additionalInfo
        protocolType,
        alignmentAnalysis,
        generationMode
      );
      
      // If protocol ID and design state ID are provided, save the component
      if (protocolId && designStateId) {
        try {
          // Store the variables as a component linked to this design state
          await storage.createComponent(protocolId, {
            designStateId,
            type: "variables",
            data: variablesResult,
            createdAt: new Date(),
            updatedAt: new Date()
          });
          
          console.log(`Variables component stored for design state ${designStateId}`);
        } catch (storageError) {
          console.error("Error storing variables component:", storageError);
          // Continue anyway, as we can still return the generated variables
        }
      }
      
      res.json(variablesResult);
    } catch (error) {
      console.error("Error in generate-variables endpoint:", error);
      res.status(500).json({ message: "Failed to generate data variables", error: String(error) });
    }
  });
  
  // Validate protocol components with AI
  app.post("/api/validate-protocol", async (req: Request, res: Response) => {
    try {
      const protocol = req.body;
      
      if (!protocol || typeof protocol !== 'object') {
        return res.status(400).json({ message: "Protocol data is required" });
      }
      const protocolForAi = stripLargeReviewArtifacts(protocol);
      
      // Call the OpenAI service to validate protocol components
      const validationResult = await openaiService.validateProtocolComponents(protocolForAi);
      
      res.json(validationResult);
    } catch (error) {
      console.error("Error in validate-protocol endpoint:", error);
      res.status(500).json({ message: "Failed to validate protocol", error: String(error) });
    }
  });
  
  // Design State Management Routes
  
  // Get design states for a protocol
  app.get("/api/protocols/:id/design-states", async (req: Request, res: Response) => {
    try {
      const protocol = await storage.getProtocolById(req.params.id);
      
      if (!protocol) {
        return res.status(404).json({ message: "Protocol not found" });
      }
      
      const designStates = await storage.getDesignStates(req.params.id);
      res.json(designStates);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch design states", error: String(error) });
    }
  });
  
  // Get a specific design state
  app.get("/api/protocols/:id/design-states/:stateId", async (req: Request, res: Response) => {
    try {
      const protocol = await storage.getProtocolById(req.params.id);
      
      if (!protocol) {
        return res.status(404).json({ message: "Protocol not found" });
      }
      
      const designState = await storage.getDesignState(req.params.id, req.params.stateId);
      
      if (!designState) {
        return res.status(404).json({ message: "Design state not found" });
      }
      
      res.json(designState);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch design state", error: String(error) });
    }
  });
  
  // Get the active design state
  app.get("/api/protocols/:id/active-design-state", async (req: Request, res: Response) => {
    try {
      const protocol = await storage.getProtocolById(req.params.id);
      
      if (!protocol) {
        return res.status(404).json({ message: "Protocol not found" });
      }
      
      const activeDesignState = await storage.getActiveDesignState(req.params.id);
      
      if (!activeDesignState) {
        return res.status(404).json({ message: "No active design state found" });
      }
      
      res.json(activeDesignState);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch active design state", error: String(error) });
    }
  });
  
  // Create a new design state
  app.post("/api/protocols/:id/design-states", async (req: Request, res: Response) => {
    try {
      const protocol = await storage.getProtocolById(req.params.id);
      
      if (!protocol) {
        return res.status(404).json({ message: "Protocol not found" });
      }
      
      // Generate a unique ID if not provided
      if (!req.body.id) {
        const timestamp = new Date().getTime();
        req.body.id = `design-state-${timestamp}`;
      }
      
      // Set timestamp if not provided
      if (!req.body.timestamp) {
        req.body.timestamp = new Date();
      }
      
      // CRITICAL FIX: Ensure the design state has the correct protocol type
      // This ensures the AI can't override the user-selected protocol type
      if (protocol.protocolType) {
        // Only log if we're overriding a different value
        if (req.body.protocolType && req.body.protocolType !== protocol.protocolType) {
          console.log(`Correcting design state protocol type from ${req.body.protocolType} to match parent protocol: ${protocol.protocolType}`);
        }
        // Always set protocol type to match parent, regardless of what was provided
        req.body.protocolType = protocol.protocolType;
      }
      
      const newDesignState = await storage.createDesignState(req.params.id, req.body);
      res.status(201).json(newDesignState);
    } catch (error) {
      res.status(500).json({ message: "Failed to create design state", error: String(error) });
    }
  });
  
  // Update a design state
  app.put("/api/protocols/:id/design-states/:stateId", async (req: Request, res: Response) => {
    try {
      const protocol = await storage.getProtocolById(req.params.id);
      
      if (!protocol) {
        return res.status(404).json({ message: "Protocol not found" });
      }
      
      const designState = await storage.getDesignState(req.params.id, req.params.stateId);
      
      if (!designState) {
        return res.status(404).json({ message: "Design state not found" });
      }
      
      // CRITICAL FIX: Ensure the design state maintains the correct protocol type
      // This ensures the AI can't override the user-selected protocol type during updates
      if (protocol.protocolType) {
        // Only log if we're overriding a different value
        if (req.body.protocolType && req.body.protocolType !== protocol.protocolType) {
          console.log(`Correcting design state protocol type from ${req.body.protocolType} to match parent protocol: ${protocol.protocolType}`);
        }
        // Always set protocol type to match parent, regardless of what was provided
        req.body.protocolType = protocol.protocolType;
      }
      
      const updatedDesignState = await storage.updateDesignState(req.params.id, req.params.stateId, req.body);
      res.json(updatedDesignState);
    } catch (error) {
      res.status(500).json({ message: "Failed to update design state", error: String(error) });
    }
  });
  
  // Set the active design state
  app.post("/api/protocols/:id/active-design-state/:stateId", async (req: Request, res: Response) => {
    try {
      const protocol = await storage.getProtocolById(req.params.id);
      
      if (!protocol) {
        return res.status(404).json({ message: "Protocol not found" });
      }
      
      const designState = await storage.getDesignState(req.params.id, req.params.stateId);
      
      if (!designState) {
        return res.status(404).json({ message: "Design state not found" });
      }
      
      const updatedProtocol = await storage.setActiveDesignState(req.params.id, req.params.stateId);
      res.json(updatedProtocol);
    } catch (error) {
      res.status(500).json({ message: "Failed to set active design state", error: String(error) });
    }
  });
  
  // Delete a design state
  app.delete("/api/protocols/:id/design-states/:stateId", async (req: Request, res: Response) => {
    try {
      const protocol = await storage.getProtocolById(req.params.id);
      
      if (!protocol) {
        return res.status(404).json({ message: "Protocol not found" });
      }
      
      const designState = await storage.getDesignState(req.params.id, req.params.stateId);
      
      if (!designState) {
        return res.status(404).json({ message: "Design state not found" });
      }
      
      // Cannot delete the active design state
      if (protocol.activeDesignState === req.params.stateId) {
        return res.status(400).json({ message: "Cannot delete the active design state. Set another design state as active first." });
      }
      
      await storage.deleteDesignState(req.params.id, req.params.stateId);
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ message: "Failed to delete design state", error: String(error) });
    }
  });
  
  // Analyze design state for scientific value and clinical relevance
  app.post("/api/protocols/:id/design-states/:stateId/analyze", async (req: Request, res: Response) => {
    try {
      const protocol = await storage.getProtocolById(req.params.id);
      
      if (!protocol) {
        return res.status(404).json({ message: "Protocol not found" });
      }
      
      const designState = await storage.getDesignState(req.params.id, req.params.stateId);
      
      if (!designState) {
        return res.status(404).json({ message: "Design state not found" });
      }
      
      const analysis = await storage.analyzeDesignState(req.params.id, req.params.stateId);
      res.json(analysis);
    } catch (error) {
      res.status(500).json({ message: "Failed to analyze design state", error: String(error) });
    }
  });
  
  /**
   * Endpoint to analyze design quality metrics for a specific design state
   * This allows for separate evaluation of scientific value, clinical relevance, and feasibility
   */
  app.post("/api/protocols/:id/design-states/:stateId/quality-metrics", async (req: Request, res: Response) => {
    try {
      const protocol = await storage.getProtocolById(req.params.id);
      
      if (!protocol) {
        return res.status(404).json({ message: "Protocol not found" });
      }
      
      const designState = await storage.getDesignState(req.params.id, req.params.stateId);
      
      if (!designState) {
        return res.status(404).json({ message: "Design state not found" });
      }
      
      // Analyze design quality metrics
      const result = await analyzeDesignQualityMetrics(designState);
      
      // Update the design state with the new metrics
      const updatedDesignState = await storage.updateDesignState(req.params.id, req.params.stateId, result.designState);
      
      res.json({
        metrics: result.metrics,
        designState: updatedDesignState
      });
    } catch (error) {
      console.error("Error in design-quality-metrics endpoint:", error);
      res.status(500).json({ message: "Failed to analyze design quality metrics", error: String(error) });
    }
  });
  
  // Generate alternative design states
  app.post("/api/protocols/:id/design-states/:stateId/alternatives", async (req: Request, res: Response) => {
    try {
      const protocol = await storage.getProtocolById(req.params.id);
      
      if (!protocol) {
        return res.status(404).json({ message: "Protocol not found" });
      }
      
      const designState = await storage.getDesignState(req.params.id, req.params.stateId);
      
      if (!designState) {
        return res.status(404).json({ message: "Design state not found" });
      }
      
      // Number of alternatives to generate (default to 3)
      const count = req.body.count || 3;
      
      const alternatives = await storage.generateAlternativeDesigns(req.params.id, req.params.stateId, count);
      res.json(alternatives);
    } catch (error) {
      res.status(500).json({ message: "Failed to generate alternative designs", error: String(error) });
    }
  });



  // Analyze protocol component alignment with AI
  app.post("/api/analyze-protocol-alignment", async (req: Request, res: Response) => {
    try {
      const protocol = req.body;
      
      if (!protocol || typeof protocol !== 'object') {
        return res.status(400).json({ message: "Protocol data is required" });
      }
      
      // Extract protocolType if it's in the request body
      let protocolType = protocol.protocolType;
      
      // If protocolType isn't in the request body, try to extract it from the synopsis
      if (!protocolType && protocol.synopsis) {
        // Some basic heuristics to guess the protocol type from content
        const synopsis = protocol.synopsis.toLowerCase();
        if (synopsis.includes('real world') || synopsis.includes('database') || synopsis.includes('electronic health record')) {
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
      
      console.log(`Protocol alignment check for protocol type: ${protocolType}`);
      
      try {
        console.log("Protocol data for alignment analysis:", 
          JSON.stringify({
            synopsis: protocol.synopsis?.substring(0, 100) + "...",
            protocolType: protocolType,
            hasTableHeaders: Array.isArray(protocol.tableHeaders),
            tableHeadersCount: Array.isArray(protocol.tableHeaders) ? protocol.tableHeaders.length : 0,
            hasTableData: !!protocol.tableData && typeof protocol.tableData === 'object',
            hasInclusionCriteria: Array.isArray(protocol.inclusionCriteria),
            inclusionCriteriaCount: Array.isArray(protocol.inclusionCriteria) ? protocol.inclusionCriteria.length : 0,
            hasExclusionCriteria: Array.isArray(protocol.exclusionCriteria),
            exclusionCriteriaCount: Array.isArray(protocol.exclusionCriteria) ? protocol.exclusionCriteria.length : 0,
            hasDataVariables: Array.isArray(protocol.dataVariables),
            dataVariablesCount: Array.isArray(protocol.dataVariables) ? protocol.dataVariables.length : 0,
            hasSchema: !!protocol.schema && !!protocol.schema.nodes && Array.isArray(protocol.schema.nodes),
            schemaNodesCount: protocol.schema && Array.isArray(protocol.schema.nodes) ? protocol.schema.nodes.length : 0,
            hasAnalysisPlan: !!protocol.analysisPlan,
            hasSampleSize: protocol.analysisPlan && !!protocol.analysisPlan.sampleSize,
            hasPrimaryEndpoints: protocol.analysisPlan && Array.isArray(protocol.analysisPlan.primaryEndpoints) && protocol.analysisPlan.primaryEndpoints.length > 0
          })
        );
      } catch (logError) {
        console.error("Error logging protocol data:", logError);
      }
      
      // Log the components being sent to the alignment check
      const componentsReceived = Object.keys(protocol);
      console.log("Alignment check received data:", JSON.stringify(componentsReceived, null, 2));
      
      // Check if schedule of assessments is relevant for this protocol type
      const scheduleRelevant = protocolType === 'interventional_clinical_trial' || 
                               protocolType === 'prospective_cohort_study';
      
      // Log component availability to see what's accessible in the protocol object
      const componentAvailability = {
        hasSynopsis: !!protocol.synopsis,
        hasSchedule: scheduleRelevant ? (!!protocol.tableHeaders && !!protocol.tableData) : 'not_applicable',
        hasInclusion: Array.isArray(protocol.inclusionCriteria) && protocol.inclusionCriteria.length > 0,
        hasExclusion: Array.isArray(protocol.exclusionCriteria) && protocol.exclusionCriteria.length > 0,
        hasCriteria: Array.isArray(protocol.inclusionCriteria) && Array.isArray(protocol.exclusionCriteria),
        hasVariables: Array.isArray(protocol.dataVariables) && protocol.dataVariables.length > 0,
        hasSchema: !!protocol.schema && !!protocol.schema.nodes && Array.isArray(protocol.schema.nodes),
        hasSAP: !!protocol.analysisPlan
      };
      
      console.log("Component availability:", componentAvailability);
      
      // Check if we have the minimum required components to perform a meaningful alignment analysis
      const hasMinimumComponents = 
        (componentAvailability.hasSynopsis && 
        componentAvailability.hasCriteria && 
        componentAvailability.hasVariables &&
        (componentAvailability.hasSchedule === true || componentAvailability.hasSchedule === 'not_applicable'));
      
      // Only run deep AI analysis if we have sufficient components and OPENAI_API_KEY is available
      if (hasMinimumComponents && process.env.OPENAI_API_KEY) {
        console.log("Running full AI alignment analysis...");
        try {
          // Call the OpenAI service to analyze alignment between protocol components
          const alignmentAnalysis = await openaiService.analyzeProtocolAlignment(protocol, protocolType);
          return res.json(alignmentAnalysis);
        } catch (aiError) {
          console.error("Error in AI-powered alignment analysis:", aiError);
          // Fall back to basic alignment check if AI analysis fails
          const basicCheck = openaiService.generateBasicAlignmentCheck(
            componentAvailability.hasSynopsis,
            componentAvailability.hasSchedule,
            componentAvailability.hasCriteria,
            componentAvailability.hasVariables,
            componentAvailability.hasSchema,
            componentAvailability.hasSAP,
            protocolType
          );
          return res.json(basicCheck);
        }
      } else {
        console.log("Using basic alignment check due to missing components or OpenAI API key");
        // Fall back to basic alignment check if we don't have minimum components
        const basicCheck = openaiService.generateBasicAlignmentCheck(
          componentAvailability.hasSynopsis,
          componentAvailability.hasSchedule,
          componentAvailability.hasCriteria,
          componentAvailability.hasVariables,
          componentAvailability.hasSchema,
          componentAvailability.hasSAP,
          protocolType
        );
        return res.json(basicCheck);
      }
    } catch (error) {
      console.error("Error in analyze-protocol-alignment endpoint:", error);
      res.status(500).json({ message: "Failed to analyze protocol alignment", error: String(error) });
    }
  });
  
  // Analyze criteria impact with AI
  app.post("/api/analyze-criteria-impact", async (req: Request, res: Response) => {
    try {
      const { inclusionCriteria, exclusionCriteria, indication } = req.body;
      
      if (!inclusionCriteria || !exclusionCriteria) {
        return res.status(400).json({ message: "Both inclusion and exclusion criteria are required" });
      }
      
      // Call the OpenAI service to analyze criteria impact
      const impactAnalysis = await openaiService.analyzeCriteriaImpact(
        inclusionCriteria,
        exclusionCriteria,
        indication || "not specified"
      );
      
      res.json(impactAnalysis);
    } catch (error) {
      console.error("Error in analyze-criteria-impact endpoint:", error);
      res.status(500).json({ message: "Failed to analyze criteria impact", error: String(error) });
    }
  });
  
  const stripLargeReviewArtifacts = (value: any, seen = new WeakSet<object>()): any => {
    if (value == null) return value;
    if (typeof value === "string") {
      if (value.length > 12000 && /<\/?w:|<w:tbl|base64,/i.test(value)) {
        return `[large source artifact omitted: ${value.length} characters]`;
      }
      return value;
    }
    if (typeof value !== "object") return value;
    if (seen.has(value)) return undefined;
    seen.add(value);
    if (Array.isArray(value)) return value.map((item) => stripLargeReviewArtifacts(item, seen));
    const next: Record<string, any> = {};
    for (const [key, entry] of Object.entries(value)) {
      if (key === "rawOoxml") {
        next.rawOoxmlAvailable = typeof entry === "string" && entry.length > 0;
        next.rawOoxmlLength = typeof entry === "string" ? entry.length : 0;
      } else if (key === "imageDataUri") {
        next.imageAvailable = typeof entry === "string" && entry.length > 0;
        next.imageDataUriLength = typeof entry === "string" ? entry.length : 0;
      } else {
        next[key] = stripLargeReviewArtifacts(entry, seen);
      }
    }
    return next;
  };

  app.post("/api/review-protocol-inputs", async (req: Request, res: Response) => {
    try {
      const { protocol, selectedSections, alignment, additionalInstructions, tabReadiness } = req.body;
      
      if (!protocol || typeof protocol !== "object") {
        return res.status(400).json({ message: "Protocol data is required" });
      }
      
      const review = await openaiService.reviewProtocolInputs({
        protocol: stripLargeReviewArtifacts(protocol),
        selectedSections,
        alignment,
        additionalInstructions,
        tabReadiness
      });
      
      res.json(review);
    } catch (error) {
      console.error("Error in review-protocol-inputs endpoint:", error);
      res.status(500).json({ message: "Failed to review protocol inputs", error: String(error) });
    }
  });

  app.post("/api/review-section-inputs", async (req: Request, res: Response) => {
    try {
      const { protocol, sectionKey, sectionName, referenceExamples } = req.body;

      if (!protocol || typeof protocol !== "object") {
        return res.status(400).json({ message: "Protocol data is required" });
      }

      if (!sectionKey || !sectionName) {
        return res.status(400).json({ message: "Section key and section name are required" });
      }

      const review = await openaiService.reviewSectionInputs({
        protocol: stripLargeReviewArtifacts(protocol),
        sectionKey,
        sectionName,
        referenceExamples
      });

      res.json(review);
    } catch (error) {
      console.error("Error in review-section-inputs endpoint:", error);
      res.status(500).json({ message: "Failed to review section inputs", error: String(error) });
    }
  });

  app.post("/api/review-all-section-inputs", async (req: Request, res: Response) => {
    try {
      const { protocol, sections, signature } = req.body;

      if (!protocol || typeof protocol !== "object") {
        return res.status(400).json({ message: "Protocol data is required" });
      }

      const review = await openaiService.reviewAllSectionInputs({
        protocol: stripLargeReviewArtifacts(protocol),
        sections
      });

      const reviewRecord = {
        ...review,
        signature: signature || null
      };

      if (protocol.id) {
        try {
          const existingProtocol = await storage.getProtocolById(protocol.id);
          if (existingProtocol) {
            const existingComponents = parseProtocolComponentsForRoute((existingProtocol as any).components);
            await storage.updateProtocol(protocol.id, {
              components: upsertSectionInputReviewsComponent(existingComponents, reviewRecord)
            } as any);
          }
        } catch (persistError) {
          console.warn("Could not persist section input reviews:", persistError);
        }
      }

      res.json(reviewRecord);
    } catch (error) {
      console.error("Error in review-all-section-inputs endpoint:", error);
      res.status(500).json({ message: "Failed to review all section inputs", error: String(error) });
    }
  });

  app.post("/api/detect-safety-products", async (req: Request, res: Response) => {
    try {
      const { protocol } = req.body;

      if (!protocol || typeof protocol !== "object") {
        return res.status(400).json({ message: "Protocol data is required" });
      }

      const result = await openaiService.detectSafetyProducts({ protocol });
      res.json(result);
    } catch (error) {
      console.error("Error in detect-safety-products endpoint:", error);
      res.status(500).json({ message: "Failed to detect study products", error: String(error) });
    }
  });
  
  // Generate protocol document with AI - either full protocol or individual sections
  app.post("/api/generate-document", async (req: Request, res: Response) => {
    try {
      const { 
        protocol, 
        sections, 
        sectionId, 
        sectionTitle, 
        additionalInstructions, 
        previousSections,
        sourceReviewDecisions,
        boilerplateText,
        format // 'docx' or undefined for JSON
      } = req.body;
      
      if (!protocol || typeof protocol !== 'object') {
        return res.status(400).json({ message: "Protocol data is required" });
      }
      const protocolForAi = stripLargeReviewArtifacts(protocol);
      
      // Debug the current request
      console.log(`Document generation request: sectionId=${sectionId}, format=${format}, has sections=${!!sections && Array.isArray(sections)}`);
      console.log(`Protocol object has components: ${!!protocol.components}`);
      
      // If this is a specific section request, save it in the protocol components
      if (sectionId && protocol.id && !format) {
        try {
          // Store the section response in the protocol object for later use
          const existingProtocol = await storage.getProtocolById(protocol.id);
          if (existingProtocol) {
            console.log(`Saving generated content for section ${sectionId}`);
            
            // Initialize components as needed
            let components = {};
            if (existingProtocol.components) {
              if (typeof existingProtocol.components === 'string') {
                try {
                  components = JSON.parse(existingProtocol.components);
                } catch (e) {
                  console.error("Error parsing existing components:", e);
                }
              } else if (typeof existingProtocol.components === 'object') {
                components = existingProtocol.components;
              }
            }
            
            // Store response directly in components
            if (sections && sections.length > 0 && sections[0].content) {
              components[sectionId] = sections[0].content;
              
              // Update protocol with components
              await storage.updateProtocol({
                ...existingProtocol,
                components: components
              });
              
              console.log(`Saved generated content for section ${sectionId} in protocol ${protocol.id}`);
            }
          }
        } catch (storageError) {
          console.error("Error saving generated content:", storageError);
        }
      }
      
      // Handle document download request (DOCX format)
      if (format === 'docx' && sections && Array.isArray(sections)) {
        console.log("Generating DOCX document for download");
        
        try {
          // Debug logging
          console.log(`Preparing to generate document with ${sections.length} sections`);
          
          // Import the template-based docx document generator. This keeps the
          // sponsor/M11 Word template styles intact instead of rebuilding a
          // plain document from scratch.
          const { generateTemplateDocxDocument } = await import('./utils/template-docx-generator');

          let exportProtocol: any = protocol;
          if (protocol.id) {
            try {
              const storedProtocol = await storage.getProtocolById(protocol.id);
              if (storedProtocol) {
                exportProtocol = {
                  ...storedProtocol,
                  ...protocol,
                  tableData: protocol.tableData ?? storedProtocol.tableData,
                  tableHeaders: protocol.tableHeaders ?? storedProtocol.tableHeaders,
                  inclusionCriteria: protocol.inclusionCriteria ?? storedProtocol.inclusionCriteria,
                  exclusionCriteria: protocol.exclusionCriteria ?? storedProtocol.exclusionCriteria,
                  dataVariables: protocol.dataVariables ?? storedProtocol.dataVariables,
                  studySchema: protocol.studySchema ?? storedProtocol.studySchema,
                  statisticalAnalysisPlan: protocol.statisticalAnalysisPlan ?? storedProtocol.statisticalAnalysisPlan,
                  supplementaryInfo: protocol.supplementaryInfo ?? storedProtocol.supplementaryInfo,
                  components: protocol.components ?? storedProtocol.components,
                  generatedProtocol: protocol.generatedProtocol ?? storedProtocol.generatedProtocol,
                  activeDesignState: protocol.activeDesignState ?? storedProtocol.activeDesignState
                };
              }
            } catch (mergeError) {
              console.warn("Could not merge stored protocol data for DOCX export:", mergeError);
            }
          }
          
          // Retrieve design state if present
          let boilerplateContent = {};
          
          if (exportProtocol.id && exportProtocol.activeDesignState) {
            try {
              // Get active design state
              const designState = await storage.getDesignState(exportProtocol.id, exportProtocol.activeDesignState);
              
              // If design state contains boilerplate selections, convert IDs to actual content
              if (designState && designState.boilerplateSelections) {
                // Log the boilerplate selections being used
                console.log("Using boilerplate selections:", 
                  Object.entries(designState.boilerplateSelections)
                    .filter(([_, id]) => id !== null)
                    .map(([section, id]) => `${section}: ${id}`)
                    .join(', ')
                );
                
                // Fetch the actual content of boilerplate texts
                for (const [section, id] of Object.entries(designState.boilerplateSelections)) {
                  if (id) {
                    try {
                      const boilerplateText = await storage.getBoilerplateTextById(id);
                      if (boilerplateText) {
                        console.log(`Retrieved boilerplate text for section ${section}`);
                        boilerplateContent[section] = boilerplateText.content;
                      }
                    } catch (error) {
                      console.error(`Error retrieving boilerplate text ${id} for section ${section}:`, error);
                    }
                  }
                }
              }
            } catch (error) {
              console.error("Error retrieving design state:", error);
              // Continue without boilerplate if we can't get it
            }
          }
          
          // Add detailed logging of protocol components to diagnose issues
          console.log("Protocol structure:", JSON.stringify({
            id: exportProtocol.id,
            title: exportProtocol.title,
            componentsType: typeof exportProtocol.components,
            hasComponents: !!exportProtocol.components,
            componentKeys: exportProtocol.components ? Object.keys(exportProtocol.components) : []
          }, null, 2));
          
          // Log the sections we're generating
          console.log("Sections to generate:", JSON.stringify(sections, null, 2));
          
          // Extract and preprocess components for document generation
          const processedComponents: Record<string, string> = {};
          
          // If protocol has components, extract content from each section
          if (exportProtocol.components) {
            for (const section of sections) {
              const sectionId = section.id;
              const component = exportProtocol.components[sectionId];
              
              if (component) {
                console.log(`Section ${sectionId} has component data`);
                
                if (typeof component === 'string') {
                  processedComponents[sectionId] = component;
                } else if (typeof component === 'object') {
                  // For structured data, convert to string representation
                  try {
                    // If JSON string, parse it first to get the actual object
                    let componentData = component;
                    if (typeof component === 'string' && component.startsWith('{')) {
                      try {
                        componentData = JSON.parse(component);
                      } catch (e) {
                        // If can't parse, use as is
                        componentData = component;
                      }
                    }
                    
                    // Check for specific component types with known structures
                    if (sectionId === 'criteria' && componentData.inclusion && componentData.exclusion) {
                      // Format inclusion/exclusion criteria
                      let criteriaText = '## Inclusion Criteria\n\n';
                      criteriaText += componentData.inclusion.map((c: string) => `- ${c}`).join('\n');
                      criteriaText += '\n\n## Exclusion Criteria\n\n';
                      criteriaText += componentData.exclusion.map((c: string) => `- ${c}`).join('\n');
                      processedComponents[sectionId] = criteriaText;
                    } else if (componentData.content) {
                      // Some components might have their content in a 'content' field
                      processedComponents[sectionId] = componentData.content;
                    } else if (componentData.data) {
                      // Some components might have their content in a 'data' field
                      processedComponents[sectionId] = 
                        typeof componentData.data === 'string' 
                          ? componentData.data 
                          : JSON.stringify(componentData.data, null, 2);
                    } else {
                      // Default to JSON stringification
                      processedComponents[sectionId] = JSON.stringify(componentData, null, 2);
                    }
                  } catch (error) {
                    console.error(`Error processing component for section ${sectionId}:`, error);
                    processedComponents[sectionId] = `[Error processing content for ${section.title}]`;
                  }
                }
              } else {
                console.log(`No component data for section ${sectionId}`);
              }
            }
          }
          
          // Check if we need to load the complete protocol with generated content
          if (exportProtocol.id && (!exportProtocol.generatedProtocol || !exportProtocol.components)) {
            try {
              // Fetch the full protocol with all generated content
              const fullProtocol = await storage.getProtocolById(exportProtocol.id);
              if (fullProtocol && fullProtocol.generatedProtocol) {
                console.log("Retrieved full protocol with generated content");
                
                // Parse generatedProtocol if it's a string
                if (typeof fullProtocol.generatedProtocol === 'string') {
                  try {
                    const parsedSections = JSON.parse(fullProtocol.generatedProtocol);
                    
                    // Create components structure if needed
                    if (!exportProtocol.components) {
                      exportProtocol.components = {};
                    } else if (typeof exportProtocol.components === 'string') {
                      exportProtocol.components = JSON.parse(exportProtocol.components);
                    }
                    
                    // Add each generated section to the components
                    console.log("Adding generated sections to protocol components");
                    parsedSections.forEach((section: any) => {
                      if (section.id && section.content) {
                        exportProtocol.components[section.id] = section.content;
                        // Also add to processed components directly
                        processedComponents[section.id] = section.content;
                        console.log(`Added generated content for section: ${section.id}`);
                      }
                    });
                  } catch (parseError) {
                    console.error("Error parsing generated protocol:", parseError);
                  }
                }
              }
            } catch (fetchError) {
              console.error("Error fetching full protocol:", fetchError);
            }
          }
          
          // Generate the DOCX document with proper formatting
          console.log(`Calling generateDocxDocument with ${sections.length} sections and ${Object.keys(boilerplateContent).length} boilerplate sections`);
          console.log(`Processed components: ${Object.keys(processedComponents).join(', ')}`);
          
          const docBuffer = await generateTemplateDocxDocument(
            exportProtocol, 
            sections, 
            boilerplateContent,
            processedComponents
          );
          
          // Send the document
          res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
          res.setHeader('Content-Disposition', `attachment; filename="${exportProtocol.id}-protocol-document.docx"`);
          return res.send(docBuffer);
        } catch (error) {
          console.error("Error generating DOCX:", error);
          return res.status(500).json({ message: "Failed to generate DOCX document", error: String(error) });
        }
      }
      
      // Handle HTML preview format for in-app viewing
      if (format === 'html' && sections && Array.isArray(sections)) {
        console.log("Generating HTML preview");
        
        try {
          // Import the simplified document generator
          const { generateHtmlPreview } = await import('./utils/simple-docx-generator');
          
          // Retrieve design state if present
          let boilerplateContent = {};
          
          if (protocol.id && protocol.activeDesignState) {
            try {
              // Get active design state
              const designState = await storage.getDesignState(protocol.id, protocol.activeDesignState);
              
              // If design state contains boilerplate selections, convert IDs to actual content
              if (designState && designState.boilerplateSelections) {
                // Log the boilerplate selections being used
                console.log("Using boilerplate selections for HTML preview:", 
                  Object.entries(designState.boilerplateSelections)
                    .filter(([_, id]) => id !== null)
                    .map(([section, id]) => `${section}: ${id}`)
                    .join(', ')
                );
                
                // Fetch boilerplate content
                for (const [section, id] of Object.entries(designState.boilerplateSelections)) {
                  if (id) {
                    try {
                      const boilerplateText = await storage.getBoilerplateTextById(id);
                      if (boilerplateText) {
                        console.log(`Retrieved boilerplate text for HTML: ${section}`);
                        boilerplateContent[section] = boilerplateText.content;
                      }
                    } catch (error) {
                      console.error(`Error fetching boilerplate text ${id}:`, error);
                    }
                  }
                }
              }
            } catch (error) {
              console.error("Error retrieving design state:", error);
              // Continue without boilerplate if we can't get it
            }
          }
          
          // Add detailed logging of protocol components
          console.log("Protocol structure for HTML preview:", JSON.stringify({
            id: protocol.id,
            title: protocol.title,
            componentsType: typeof protocol.components,
            hasComponents: !!protocol.components,
            componentKeys: protocol.components ? Object.keys(protocol.components) : []
          }, null, 2));
          
          // Extract and preprocess components for HTML generation
          const processedComponents: Record<string, string> = {};
          
          // If protocol has components, extract content from each section
          if (protocol.components) {
            for (const section of sections) {
              const sectionId = section.id;
              const component = protocol.components[sectionId];
              
              if (component) {
                console.log(`Section ${sectionId} has component data for HTML`);
                
                if (typeof component === 'string') {
                  processedComponents[sectionId] = component;
                } else if (typeof component === 'object') {
                  // For structured data, convert to string representation
                  try {
                    // If JSON string, parse it first to get the actual object
                    let componentData = component;
                    if (typeof component === 'string' && component.startsWith('{')) {
                      try {
                        componentData = JSON.parse(component);
                      } catch (e) {
                        // If can't parse, use as is
                        componentData = component;
                      }
                    }
                    
                    // Check for specific component types with known structures
                    if (sectionId === 'criteria' && componentData.inclusion && componentData.exclusion) {
                      // Format inclusion/exclusion criteria
                      let criteriaText = '## Inclusion Criteria\n\n';
                      criteriaText += componentData.inclusion.map((c: string) => `- ${c}`).join('\n');
                      criteriaText += '\n\n## Exclusion Criteria\n\n';
                      criteriaText += componentData.exclusion.map((c: string) => `- ${c}`).join('\n');
                      processedComponents[sectionId] = criteriaText;
                    } else if (componentData.content) {
                      // Some components might have their content in a 'content' field
                      processedComponents[sectionId] = componentData.content;
                    } else if (componentData.data) {
                      // Some components might have their content in a 'data' field
                      processedComponents[sectionId] = 
                        typeof componentData.data === 'string' 
                          ? componentData.data 
                          : JSON.stringify(componentData.data, null, 2);
                    } else {
                      // Default to JSON stringification
                      processedComponents[sectionId] = JSON.stringify(componentData, null, 2);
                    }
                  } catch (error) {
                    console.error(`Error processing component for HTML section ${sectionId}:`, error);
                    processedComponents[sectionId] = `[Error processing content for ${section.title}]`;
                  }
                }
              }
            }
          }
          
          // Generate the HTML preview
          console.log(`Generating HTML preview with ${sections.length} sections and ${Object.keys(processedComponents).length} processed components`);
          const htmlContent = generateHtmlPreview(
            protocol, 
            sections, 
            boilerplateContent,
            processedComponents
          );
          
          return res.json({ html: htmlContent });
        } catch (error) {
          console.error("Error generating HTML preview:", error);
          return res.status(500).json({ message: "Failed to generate HTML preview", error: String(error) });
        }
      }
      
      // Log protocol generation request
      if (sectionId && sectionTitle) {
        console.log(`Generating protocol section: ${sectionTitle} (${sectionId})`);
        console.log(`Generating section: ${sectionTitle} (${sectionId})`);
        
        try {
          // Call the OpenAI service to generate single section
          const sectionResult = await openaiService.generateProtocolSection({
            protocol: protocolForAi,
            sectionId,
            sectionTitle,
            additionalInstructions: additionalInstructions || "",
            previousSections: previousSections || [],
            sourceReviewDecisions: sourceReviewDecisions || [],
            boilerplateText: boilerplateText || "",
          });
          
          return res.json({ sections: [sectionResult] });
        } catch (error) {
          console.error(`Error generating section '${sectionTitle}':`, error);
          return res.status(500).json({ 
            message: `Failed to generate section: ${sectionTitle}`, 
            error: String(error) 
          });
        }
      } else if (sections && Array.isArray(sections) && sections.length > 0) {
        // Original full protocol generation
        console.log(`Generating full protocol with ${sections.length} sections`);
        
        // Call the OpenAI service to generate full protocol document
        const documentResult = await openaiService.generateFullProtocol({
          protocol: protocolForAi,
          sections
        });
        
        // Save the generated protocol content to storage if protocol id exists
        if (protocol.id) {
          try {
            const existingProtocol = await storage.getProtocolById(protocol.id);
            if (existingProtocol) {
              // Update the protocol with the generated content
              await storage.updateProtocol(protocol.id, { 
                generatedProtocol: JSON.stringify(documentResult.sections)
              });
              
              console.log(`Updated protocol ${protocol.id} with generated content`);
            }
          } catch (storageError) {
            console.error("Error updating protocol with generated content:", storageError);
            // Continue with the response even if storage update fails
          }
        }
        
        return res.json(documentResult);
      } else {
        return res.status(400).json({ 
          message: "Either a specific section to generate (sectionId and sectionTitle) or an array of sections is required" 
        });
      }
    } catch (error) {
      console.error("Error in generate-document endpoint:", error);
      res.status(500).json({ message: "Failed to generate protocol document", error: String(error) });
    }
  });
  
  // Analyze schedule burden with AI
  app.post("/api/analyze-schedule-burden", async (req: Request, res: Response) => {
    try {
      const { tableHeaders, tableData, indication, synopsis } = req.body;
      
      if (!tableHeaders || !tableData) {
        return res.status(400).json({ message: "Schedule data is required (tableHeaders and tableData)" });
      }
      
      // Call the OpenAI service to analyze schedule burden with synopsis context
      const scheduleAnalysis = await openaiService.analyzeScheduleBurden(
        tableHeaders,
        tableData,
        indication || "not specified",
        synopsis || null
      );
      
      // Return the complete analysis with both patient and site burden assessments
      res.json(scheduleAnalysis);
      
    } catch (error) {
      console.error("Error in analyze-schedule-burden endpoint:", error);
      res.status(500).json({ message: "Failed to analyze schedule burden", error: String(error) });
    }
  });
  
  // Generate study schema with AI
  app.post("/api/generate-schema", async (req: Request, res: Response) => {
    try {
      const { synopsis, inclusionCriteria, exclusionCriteria, protocolId, designStateId, protocolType, supplementaryInfo, generationMode } = req.body;
      
      if (!synopsis) {
        return res.status(400).json({ message: "Synopsis is required" });
      }

      if (!isValidGenerationMode(generationMode)) {
        return res.status(400).json({ message: "Choose how to use the source content before generating the study schema." });
      }
      
      console.log("Generating study schema with AI for protocol with synopsis:", synopsis.substring(0, 100) + "...");
      
      try {
        // Use OpenAI to generate a study schema based on the protocol content
        const result = await openaiService.generateStudySchema(
          synopsis,
          inclusionCriteria,
          exclusionCriteria,
          protocolType,
          normalizeSupplementaryInfo(
            supplementaryInfo,
            "study schema patient flow screening randomization treatment arms follow up visits schedule timepoints"
          ),
          generationMode
        );
        
        // Check if the result has the expected structure
        if (result && (result.content || (result.nodes && result.edges) || result.timelineSchema)) {
          // Log successful response
          console.log("Successfully generated study schema with AI");
          
          let schemaResult;
          
          // If the content is directly in the result object (not in a content property)
          if ((result.nodes && result.edges) || result.timelineSchema) {
            console.log("AI returned schema directly in result object");
            schemaResult = result;
          } 
          // If the content is in a content property
          else if (result.content) {
            console.log("AI returned schema in content property");
            schemaResult = result.content;
          }
          
          // If protocol ID and design state ID are provided, save the component
          if (protocolId && designStateId && schemaResult) {
            try {
              // Store the schema as a component linked to this design state
              await storage.createComponent(protocolId, {
                designStateId,
                type: "studySchema",
                data: schemaResult,
                createdAt: new Date(),
                updatedAt: new Date()
              });
              
              console.log(`Study schema component stored for design state ${designStateId}`);
            } catch (storageError) {
              console.error("Error storing study schema component:", storageError);
              // Continue anyway, as we can still return the generated schema
            }
          }
          
          // Return the result to the client
          res.json(schemaResult);
          
        } else {
          console.error("Invalid AI response format - missing schema data:", result);
          return res.status(500).json({ message: "AI returned invalid response format" });
        }
      } catch (aiError) {
        console.error("AI error generating study schema:", aiError);
        
        // Return a fallback schema if AI generation fails
        console.log("Returning fallback schema due to AI error");
        
        // Determine protocol type for the fallback schema
        const isObservational = protocolType === "retrospective_cohort_study" || 
                                protocolType === "prospective_cohort_study";
        const isSecondaryData = protocolType === "secondary_data_analysis";
        
        // Different fallback schemas based on protocol type
        let fallbackSchema;
        
        if (isSecondaryData) {
          // Fallback schema for secondary data analysis studies
          fallbackSchema = {
            nodes: [
              {
                id: "study-start",
                type: "studyPhase",
                position: { x: 250, y: 5 },
                data: { label: "Data Extraction Phase" },
              },
              {
                id: "data-source",
                type: "dataSource",
                position: { x: 250, y: 75 },
                data: { label: "Data Source", description: "Database or registry access" },
              },
              {
                id: "cohort-definition",
                type: "cohort",
                position: { x: 250, y: 150 },
                data: { label: "Cohort Definition", description: "Inclusion/exclusion criteria application" },
              },
              {
                id: "data-extraction",
                type: "studyPhase",
                position: { x: 250, y: 220 },
                data: { label: "Variable Extraction" },
              },
              {
                id: "extraction-group-1",
                type: "dataExtraction",
                position: { x: 150, y: 290 },
                data: { label: "Exposure Group", description: "Extraction of primary exposure variables" },
              },
              {
                id: "extraction-group-2",
                type: "dataExtraction",
                position: { x: 350, y: 290 },
                data: { label: "Comparison Group", description: "Extraction of comparison variables" },
              },
              {
                id: "analysis-phase",
                type: "studyPhase",
                position: { x: 250, y: 360 },
                data: { label: "Analysis Phase" },
              },
              {
                id: "statistical-analysis",
                type: "analysis",
                position: { x: 250, y: 430 },
                data: { label: "Statistical Analysis", description: "Propensity score matching, regression models" },
              },
              {
                id: "outcome-measure",
                type: "outcome",
                position: { x: 250, y: 500 },
                data: { label: "Primary Outcome", description: "Outcome measurement" },
              }
            ],
            edges: [
              {
                id: "e1-2",
                source: "study-start",
                target: "data-source",
                type: "smoothstep",
                markerEnd: {
                  type: "arrowclosed",
                },
              },
              {
                id: "e2-3",
                source: "data-source",
                target: "cohort-definition",
                type: "smoothstep",
                markerEnd: {
                  type: "arrowclosed",
                },
              },
              {
                id: "e3-4",
                source: "cohort-definition",
                target: "data-extraction",
                type: "smoothstep",
                markerEnd: {
                  type: "arrowclosed",
                },
              },
              {
                id: "e4-5",
                source: "data-extraction",
                target: "extraction-group-1",
                type: "smoothstep",
                markerEnd: {
                  type: "arrowclosed",
                },
              },
              {
                id: "e4-6",
                source: "data-extraction",
                target: "extraction-group-2",
                type: "smoothstep",
                markerEnd: {
                  type: "arrowclosed",
                },
              },
              {
                id: "e5-7",
                source: "extraction-group-1",
                target: "analysis-phase",
                type: "smoothstep",
                markerEnd: {
                  type: "arrowclosed",
                },
              },
              {
                id: "e6-7",
                source: "extraction-group-2",
                target: "analysis-phase",
                type: "smoothstep",
                markerEnd: {
                  type: "arrowclosed",
                },
              },
              {
                id: "e7-8",
                source: "analysis-phase",
                target: "statistical-analysis",
                type: "smoothstep",
                markerEnd: {
                  type: "arrowclosed",
                },
              },
              {
                id: "e8-9",
                source: "statistical-analysis",
                target: "outcome-measure",
                type: "smoothstep",
                markerEnd: {
                  type: "arrowclosed",
                },
              }
            ]
          };
        }
        else if (isObservational) {
          // Fallback schema specifically for observational cohort studies
          fallbackSchema = {
            nodes: [
              {
                id: "enrollment-phase",
                type: "studyPhase",
                position: { x: 250, y: 5 },
                data: { label: "Enrollment Phase" },
              },
              {
                id: "enrollment",
                type: "enrollment",
                position: { x: 250, y: 75 },
                data: { label: "Enrollment", description: "Identify eligible participants already receiving treatment" },
              },
              {
                id: "baseline-assessment",
                type: "cohort",
                position: { x: 250, y: 150 },
                data: { label: "Baseline Assessment", description: "Document existing exposures and baseline data" },
              },
              {
                id: "follow-up-phase",
                type: "studyPhase",
                position: { x: 250, y: 220 },
                data: { label: "Follow-up Phase" },
              },
              {
                id: "exposure-group-1",
                type: "exposure",
                position: { x: 150, y: 290 },
                data: { label: "Treatment Group", description: "Participants already receiving treatment of interest" },
              },
              {
                id: "exposure-group-2",
                type: "exposure",
                position: { x: 350, y: 290 },
                data: { label: "Comparison Group", description: "Participants receiving standard of care" },
              },
              {
                id: "outcome-assessment",
                type: "assessment",
                position: { x: 250, y: 360 },
                data: { label: "Outcome Assessment", description: "Data extraction and validation" },
              },
              {
                id: "primary-outcome",
                type: "outcome",
                position: { x: 250, y: 430 },
                data: { label: "Primary Outcome" },
              },
              {
                id: "study-end",
                type: "studyPhase",
                position: { x: 250, y: 500 },
                data: { label: "Data Analysis Completion" },
              }
            ],
            edges: [
              {
                id: "e1-2",
                source: "enrollment-phase",
                target: "enrollment",
                type: "smoothstep",
                markerEnd: {
                  type: "arrowclosed",
                },
              },
              {
                id: "e2-3",
                source: "enrollment",
                target: "baseline-assessment",
                type: "smoothstep",
                markerEnd: {
                  type: "arrowclosed",
                },
              },
              {
                id: "e3-4",
                source: "baseline-assessment",
                target: "follow-up-phase",
                type: "smoothstep",
                markerEnd: {
                  type: "arrowclosed",
                },
              },
              {
                id: "e4-5",
                source: "follow-up-phase",
                target: "exposure-group-1",
                type: "smoothstep",
                markerEnd: {
                  type: "arrowclosed",
                },
              },
              {
                id: "e4-6",
                source: "follow-up-phase",
                target: "exposure-group-2",
                type: "smoothstep",
                markerEnd: {
                  type: "arrowclosed",
                },
              },
              {
                id: "e5-7",
                source: "exposure-group-1",
                target: "outcome-assessment",
                type: "smoothstep",
                markerEnd: {
                  type: "arrowclosed",
                },
              },
              {
                id: "e6-7",
                source: "exposure-group-2",
                target: "outcome-assessment",
                type: "smoothstep",
                markerEnd: {
                  type: "arrowclosed",
                },
              },
              {
                id: "e7-8",
                source: "outcome-assessment",
                target: "primary-outcome",
                type: "smoothstep",
                markerEnd: {
                  type: "arrowclosed",
                },
              },
              {
                id: "e8-9",
                source: "primary-outcome",
                target: "study-end",
                type: "smoothstep",
                markerEnd: {
                  type: "arrowclosed",
                },
              }
            ]
          };
        } else if (protocolType === 'delphi_consensus') {
          // Delphi consensus fallback schema
          fallbackSchema = {
            nodes: [
              {
                id: "preparation-phase",
                type: "studyPhase",
                position: { x: 250, y: 5 },
                data: { label: "Preparation Phase" },
              },
              {
                id: "panel-recruitment",
                type: "panelRecruitment",
                position: { x: 250, y: 75 },
                data: { label: "Expert Panel Recruitment", description: "Selection of experts with appropriate expertise" },
              },
              {
                id: "statement-development",
                type: "statementDevelopment",
                position: { x: 250, y: 150 },
                data: { label: "Statement Development", description: "Literature review and initial statement formulation" },
              },
              {
                id: "consensus-phase",
                type: "studyPhase",
                position: { x: 250, y: 220 },
                data: { label: "Consensus Phase" },
              },
              {
                id: "delphi-round-1",
                type: "delphiRound",
                position: { x: 250, y: 290 },
                data: { label: "Delphi Round 1", description: "Initial rating of statements" },
              },
              {
                id: "delphi-round-2",
                type: "delphiRound",
                position: { x: 250, y: 360 },
                data: { label: "Delphi Round 2", description: "Revised rating with feedback" },
              },
              {
                id: "delphi-round-3",
                type: "delphiRound",
                position: { x: 250, y: 430 },
                data: { label: "Delphi Round 3", description: "Final rating" },
              },
              {
                id: "consensus-analysis",
                type: "consensusAnalysis",
                position: { x: 250, y: 500 },
                data: { label: "Consensus Analysis", description: "Determination of consensus statements" },
              }
            ],
            edges: [
              {
                id: "e1-2",
                source: "preparation-phase",
                target: "panel-recruitment",
                type: "smoothstep",
                markerEnd: {
                  type: "arrowclosed",
                },
              },
              {
                id: "e2-3",
                source: "panel-recruitment",
                target: "statement-development",
                type: "smoothstep",
                markerEnd: {
                  type: "arrowclosed",
                },
              },
              {
                id: "e3-4",
                source: "statement-development",
                target: "consensus-phase",
                type: "smoothstep",
                markerEnd: {
                  type: "arrowclosed",
                },
              },
              {
                id: "e4-5",
                source: "consensus-phase",
                target: "delphi-round-1",
                type: "smoothstep",
                markerEnd: {
                  type: "arrowclosed",
                },
              },
              {
                id: "e5-6",
                source: "delphi-round-1",
                target: "delphi-round-2",
                type: "smoothstep",
                markerEnd: {
                  type: "arrowclosed",
                },
              },
              {
                id: "e6-7",
                source: "delphi-round-2",
                target: "delphi-round-3",
                type: "smoothstep",
                markerEnd: {
                  type: "arrowclosed",
                },
              },
              {
                id: "e7-8",
                source: "delphi-round-3",
                target: "consensus-analysis",
                type: "smoothstep",
                markerEnd: {
                  type: "arrowclosed",
                },
              }
            ]
          };
        } else if (protocolType === 'cross_sectional_survey' || protocolType === 'qualitative_study') {
          // Survey and qualitative study fallback schema
          fallbackSchema = {
            nodes: [
              {
                id: "preparation-phase",
                type: "studyPhase",
                position: { x: 250, y: 5 },
                data: { label: "Preparation Phase" },
              },
              {
                id: "recruitment",
                type: "recruitment",
                position: { x: 250, y: 75 },
                data: { label: "Participant Recruitment", description: "Recruitment strategy implementation" },
              },
              {
                id: "survey-development",
                type: "survey",
                position: { x: 250, y: 150 },
                data: { 
                  label: protocolType === "cross_sectional_survey" ? "Survey Development" : "Interview Guide Development", 
                  description: protocolType === "cross_sectional_survey" ? "Design and validation of survey instrument" : "Development of qualitative interview questions" 
                },
              },
              {
                id: "data-collection-phase",
                type: "studyPhase",
                position: { x: 250, y: 220 },
                data: { label: "Data Collection Phase" },
              },
              {
                id: "data-collection",
                type: "dataCollection",
                position: { x: 250, y: 290 },
                data: { 
                  label: protocolType === "cross_sectional_survey" ? "Survey Administration" : "Interviews/Focus Groups", 
                  description: protocolType === "cross_sectional_survey" ? "Collection of responses from participants" : "Collection of qualitative data" 
                },
              },
              {
                id: "data-analysis",
                type: "analysis",
                position: { x: 250, y: 360 },
                data: { 
                  label: "Data Analysis", 
                  description: protocolType === "cross_sectional_survey" ? "Statistical analysis of survey data" : "Thematic analysis of qualitative data" 
                },
              },
              {
                id: "findings",
                type: "outcome",
                position: { x: 250, y: 430 },
                data: { label: "Study Findings", description: "Key insights and results" },
              }
            ],
            edges: [
              {
                id: "e1-2",
                source: "preparation-phase",
                target: "recruitment",
                type: "smoothstep",
                markerEnd: {
                  type: "arrowclosed",
                },
              },
              {
                id: "e2-3",
                source: "recruitment",
                target: "survey-development",
                type: "smoothstep",
                markerEnd: {
                  type: "arrowclosed",
                },
              },
              {
                id: "e3-4",
                source: "survey-development",
                target: "data-collection-phase",
                type: "smoothstep",
                markerEnd: {
                  type: "arrowclosed",
                },
              },
              {
                id: "e4-5",
                source: "data-collection-phase",
                target: "data-collection",
                type: "smoothstep",
                markerEnd: {
                  type: "arrowclosed",
                },
              },
              {
                id: "e5-6",
                source: "data-collection",
                target: "data-analysis",
                type: "smoothstep",
                markerEnd: {
                  type: "arrowclosed",
                },
              },
              {
                id: "e6-7",
                source: "data-analysis",
                target: "findings",
                type: "smoothstep",
                markerEnd: {
                  type: "arrowclosed",
                },
              }
            ]
          };
        } else {
          // Default fallback schema for interventional trials
          fallbackSchema = {
            nodes: [
              {
                id: "phase-screening",
                type: "studyPhase",
                position: { x: 250, y: 5 },
                data: { label: "Screening Phase" },
              },
              {
                id: "screening",
                type: "screening",
                position: { x: 250, y: 75 },
                data: { label: "Screening" },
              },
              {
                id: "randomization",
                type: "randomization",
                position: { x: 250, y: 150 },
                data: { label: "Randomization", description: "1:1 ratio" },
              },
              {
                id: "phase-treatment",
                type: "studyPhase",
                position: { x: 250, y: 220 },
                data: { label: "Treatment Phase" },
              },
              {
                id: "treatment-1",
                type: "treatment",
                position: { x: 150, y: 290 },
                data: { label: "Treatment Arm A" },
              },
              {
                id: "treatment-2",
                type: "treatment",
                position: { x: 350, y: 290 },
                data: { label: "Treatment Arm B" },
              },
              {
                id: "assessment-1",
                type: "assessment",
                position: { x: 250, y: 360 },
                data: { label: "Primary Assessment", description: "Week 12" },
              },
              {
                id: "endpoint-1",
                type: "endpoint",
                position: { x: 250, y: 430 },
                data: { label: "Primary Endpoint" },
              }
            ],
            edges: [
              {
                id: "e1-2",
                source: "phase-screening",
                target: "screening",
                type: "smoothstep",
                markerEnd: {
                  type: "arrowclosed",
                },
              },
              {
                id: "e2-3",
                source: "screening",
                target: "randomization",
                type: "smoothstep",
                markerEnd: {
                  type: "arrowclosed",
                },
              },
              {
                id: "e3-4",
                source: "randomization",
                target: "phase-treatment",
                type: "smoothstep",
                markerEnd: {
                  type: "arrowclosed",
                },
              },
              {
                id: "e4-5",
                source: "phase-treatment",
                target: "treatment-1",
                type: "smoothstep",
                markerEnd: {
                  type: "arrowclosed",
                },
              },
              {
                id: "e4-6",
                source: "phase-treatment",
                target: "treatment-2",
                type: "smoothstep",
                markerEnd: {
                  type: "arrowclosed",
                },
              },
              {
                id: "e5-7",
                source: "treatment-1",
                target: "assessment-1",
                type: "smoothstep",
                markerEnd: {
                  type: "arrowclosed",
                },
              },
              {
                id: "e6-7",
                source: "treatment-2",
                target: "assessment-1",
                type: "smoothstep",
                markerEnd: {
                  type: "arrowclosed",
                },
              },
              {
                id: "e7-8",
                source: "assessment-1",
                target: "endpoint-1",
                type: "smoothstep",
                markerEnd: {
                  type: "arrowclosed",
                },
              }
            ]
          };
        }
        
        // If protocol ID and design state ID are provided, also save the fallback component
        if (protocolId && designStateId) {
          try {
            await storage.createComponent(protocolId, {
              designStateId,
              type: "studySchema",
              data: fallbackSchema,
              createdAt: new Date(),
              updatedAt: new Date()
            });
            console.log(`Fallback study schema component stored for design state ${designStateId}`);
          } catch (storageError) {
            console.error("Error storing fallback study schema component:", storageError);
          }
        }
        
        res.json(fallbackSchema);
      }
    } catch (error) {
      console.error("Error in generate-schema endpoint:", error);
      res.status(500).json({ message: "Failed to generate study schema", error: String(error) });
    }
  });

  // Generate statistical analysis plan with AI
  app.post("/api/generate-analysis-plan", async (req: Request, res: Response) => {
    try {
      const { synopsis, inclusionCriteria, exclusionCriteria, protocolId, designStateId, protocolType, alignmentAnalysis, supplementaryInfo, generationMode } = req.body;
      
      if (!synopsis) {
        return res.status(400).json({ message: "Synopsis is required" });
      }

      if (!isValidGenerationMode(generationMode)) {
        return res.status(400).json({ message: "Choose how to use the source content before generating the statistical analysis plan." });
      }
      
      console.log("Generating statistical analysis plan with AI for protocol with synopsis:", synopsis.substring(0, 100) + "...");
      
      try {
        // Use OpenAI to generate a statistical analysis plan based on the protocol content
        const result = await openaiService.generateStatisticalAnalysisPlan(
          synopsis,
          inclusionCriteria,
          exclusionCriteria,
          protocolType,
          alignmentAnalysis,
          normalizeSupplementaryInfo(
            supplementaryInfo,
            "statistical analysis plan endpoints estimands sample size power analysis populations missing data multiplicity interim subgroup sensitivity"
          ),
          generationMode
        );
        
        // Check if the result has the expected structure
        if (result) {
          // Log successful response
          console.log("Successfully generated statistical analysis plan with AI");
          
          let analysisPlan;
          
          // Check if the result has properties that would be expected in an analysis plan
          if (result.sampleSize || result.primaryEndpoints || result.secondaryEndpoints || 
              result.exploratoryEndpoints || result.estimands || result.analysisPopulations || result.statisticalMethods) {
            console.log("AI returned analysis plan directly in result object");
            analysisPlan = result;
          } 
          // If the content is in a content property
          else if (result.content) {
            console.log("AI returned analysis plan in content property");
            analysisPlan = result.content;
          }
          else {
            console.error("Invalid AI response format - missing expected analysis plan properties:", result);
            return res.status(500).json({ message: "AI returned invalid response format" });
          }
          
          // If protocol ID and design state ID are provided, save the component
          if (protocolId && designStateId && analysisPlan) {
            try {
              // Store the analysis plan as a component linked to this design state
              await storage.createComponent(protocolId, {
                designStateId,
                type: "analysisPlan",
                data: analysisPlan,
                createdAt: new Date(),
                updatedAt: new Date()
              });
              
              console.log(`Analysis plan component stored for design state ${designStateId}`);
            } catch (storageError) {
              console.error("Error storing analysis plan component:", storageError);
              // Continue anyway, as we can still return the generated analysis plan
            }
          }
          
          // Return the result to the client
          res.json(analysisPlan);
          
        } else {
          console.error("Invalid AI response format - missing result:", result);
          return res.status(500).json({ message: "AI returned invalid response format" });
        }
      } catch (aiError) {
        console.error("AI error generating statistical analysis plan:", aiError);
        
        // Return a fallback analysis plan if AI generation fails
        console.log("Returning fallback analysis plan due to AI error");
        
        // Default fallback analysis plan
        const fallbackPlan = {
          sampleSize: {
            total: 120,
            perArm: 40,
            justification: "Based on 80% power to detect a 20% difference between arms with alpha=0.05"
          },
          primaryEndpoints: [
            {
              id: 1,
              name: "Progression-Free Survival",
              type: "efficacy",
              timepoint: "Week 24",
              method: "cox",
              description: "Time from randomization to disease progression or death from any cause"
            }
          ],
          secondaryEndpoints: [
            {
              id: 2,
              name: "Overall Response Rate",
              type: "efficacy",
              timepoint: "Week 12",
              method: "chi-square",
              description: "Proportion of patients with complete or partial response"
            },
            {
              id: 3,
              name: "Treatment-Related Adverse Events",
              type: "safety",
              timepoint: "Throughout study",
              method: "descriptive",
              description: "Frequency and severity of adverse events according to CTCAE"
            }
          ],
          exploratoryEndpoints: [
            {
              id: 4,
              name: "Quality of Life Assessment",
              type: "exploratory",
              timepoint: "Week 12",
              method: "descriptive",
              description: "Patient-reported quality of life using validated questionnaires"
            }
          ],
          estimands: [
            {
              id: 1,
              endpointName: "Progression-Free Survival",
              population: "Intent-to-treat population",
              variable: "Time from randomization to disease progression or death",
              populationLevelSummary: "Median time to event",
              intercurrentEventStrategy: "treatment_policy",
              intercurrentEventHandling: "Events handled according to treatment policy strategy (intent-to-treat principle)",
              justification: "Treatment policy strategy chosen to assess effectiveness under real-world conditions",
              estimandType: "primary"
            }
          ],
          analysisPopulations: [
            {
              id: 1,
              name: "Intent-to-Treat (ITT)",
              definition: "All randomized patients regardless of treatment received"
            },
            {
              id: 2,
              name: "Per Protocol (PP)",
              definition: "All randomized patients who received at least one dose of study medication and had no major protocol violations"
            },
            {
              id: 3,
              name: "Safety Population",
              definition: "All patients who received at least one dose of study medication"
            }
          ],
          statisticalMethods: [
            {
              id: 1,
              name: "Survival Analysis",
              type: "primary",
              description: "Cox proportional hazards model to compare PFS between treatment arms, adjusted for stratification factors"
            },
            {
              id: 2,
              name: "Response Analysis",
              type: "secondary",
              description: "Chi-square test to compare ORR between treatment arms"
            }
          ]
        };
        
        // If protocol ID and design state ID are provided, also save the fallback component
        if (protocolId && designStateId) {
          try {
            await storage.createComponent(protocolId, {
              designStateId,
              type: "analysisPlan",
              data: fallbackPlan,
              createdAt: new Date(),
              updatedAt: new Date()
            });
            console.log(`Fallback analysis plan component stored for design state ${designStateId}`);
          } catch (storageError) {
            console.error("Error storing fallback analysis plan component:", storageError);
          }
        }
        
        res.json(fallbackPlan);
      }
    } catch (error) {
      console.error("Error in generate-analysis-plan endpoint:", error);
      res.status(500).json({ message: "Failed to generate statistical analysis plan", error: String(error) });
    }
  });

  // Generate estimands with AI
  app.post("/api/generate-estimands", async (req: Request, res: Response) => {
    try {
      const { synopsis, protocolType, protocolId, designStateId, endpoints } = req.body;
      
      if (!synopsis) {
        return res.status(400).json({ message: "Synopsis is required" });
      }
      
      if (!endpoints || (!endpoints.primary && !endpoints.secondary && !endpoints.exploratory)) {
        return res.status(400).json({ message: "At least one endpoint is required" });
      }
      
      console.log("Generating estimands with AI for protocol:", protocolId);
      
      try {
        // Use OpenAI to generate estimands based on the protocol content and endpoints
        const result = await openaiService.generateEstimands(
          synopsis,
          protocolType,
          endpoints
        );
        
        if (result && result.estimands && Array.isArray(result.estimands)) {
          console.log(`Successfully generated ${result.estimands.length} estimands with AI`);
          
          // Store the estimands as component data if protocol and design state are provided
          if (protocolId && designStateId) {
            try {
              await storage.createComponent(protocolId, {
                designStateId,
                type: "estimands",
                data: { estimands: result.estimands },
                createdAt: new Date(),
                updatedAt: new Date()
              });
              
              console.log(`Estimands component stored for design state ${designStateId}`);
            } catch (storageError) {
              console.error("Error storing estimands component:", storageError);
              // Continue anyway, as we can still return the generated estimands
            }
          }
          
          res.json(result);
        } else {
          console.error("Invalid AI response format for estimands:", result);
          
          // Return fallback estimands
          const fallbackEstimands = {
            estimands: [
              {
                endpointName: endpoints.primary?.[0]?.name || "Primary Endpoint",
                estimandType: "primary",
                population: "Intent-to-treat population",
                variable: "Primary efficacy variable",
                populationLevelSummary: "Difference in means",
                intercurrentEventStrategy: "treatment_policy",
                intercurrentEventHandling: "Include all randomized patients regardless of treatment discontinuation",
                justification: "Treatment policy strategy chosen to reflect regulatory perspective"
              }
            ]
          };
          
          res.json(fallbackEstimands);
        }
      } catch (aiError) {
        console.error("AI error generating estimands:", aiError);
        
        // Return fallback estimands on AI error
        const fallbackEstimands = {
          estimands: [
            {
              endpointName: endpoints.primary?.[0]?.name || "Primary Endpoint",
              estimandType: "primary",
              population: "Intent-to-treat population",
              variable: "Primary efficacy variable",
              populationLevelSummary: "Difference in means",
              intercurrentEventStrategy: "treatment_policy",
              intercurrentEventHandling: "Include all randomized patients regardless of treatment discontinuation",
              justification: "Treatment policy strategy chosen to reflect regulatory perspective"
            }
          ]
        };
        
        res.json(fallbackEstimands);
      }
    } catch (error) {
      console.error("Error in generate-estimands endpoint:", error);
      res.status(500).json({ message: "Failed to generate estimands", error: String(error) });
    }
  });
  
  // Get AI assistant response
  app.post("/api/assistant-response", async (req: Request, res: Response) => {
    try {
      const { query, protocol, context } = req.body;
      
      if (!query || typeof query !== 'string') {
        return res.status(400).json({ message: "Query text is required" });
      }
      
      if (!protocol || typeof protocol !== 'object') {
        return res.status(400).json({ message: "Protocol data is required" });
      }
      
      // Call the OpenAI service to get AI assistant response
      const assistantResponse = await openaiService.getAIAssistantResponse(
        query,
        protocol,
        context
      );
      
      console.log("AI response generated:", {
        length: assistantResponse?.length || 0,
        truncated: assistantResponse?.substring(0, 100) + '...'
      });
      
      // Make sure we have a valid response
      if (!assistantResponse) {
        return res.status(500).json({ message: "Empty assistant response" });
      }
      
      // Create a simple and consistent response structure
      const responseObject = { 
        response: assistantResponse
      };
      
      // Log what we're sending for debugging
      console.log("Sending simplified response object");
      
      // Send as a direct JSON response with minimal structure
      res.setHeader('Content-Type', 'application/json');
      return res.send(JSON.stringify(responseObject));
    } catch (error: any) {
      console.error("Error in assistant-response endpoint:", error);
      res.status(500).json({ 
        message: "Failed to generate assistant response",
        error: error.message || "Unknown error"
      });
    }
  });
  
  /**
   * Update synopsis text based on design parameter changes
   * This endpoint takes an original synopsis and applies changes based on new design parameters
   */
  app.post("/api/update-synopsis", async (req: Request, res: Response) => {
    try {
      const { originalSynopsis, changes, newParams } = req.body;
      
      if (!originalSynopsis || !changes || !newParams) {
        return res.status(400).json({ message: "Original synopsis, changes, and new parameters are required" });
      }
      
      // Create a prompt for the OpenAI service
      const prompt = `
      You are an expert clinical protocol writer. Update the following clinical trial synopsis to reflect specified design changes.
      
      ORIGINAL SYNOPSIS:
      ${originalSynopsis}
      
      DESIGN CHANGES TO APPLY:
      ${JSON.stringify(changes, null, 2)}
      
      NEW DESIGN PARAMETERS:
      ${JSON.stringify(newParams, null, 2)}
      
      IMPORTANT INSTRUCTIONS:
      1. Maintain the overall structure and flow of the original synopsis
      2. Specifically update references to: control/comparator arms, study duration, endpoints, and study design
      3. Make sure all mentions of the changed parameters are updated consistently throughout the text
      4. Do not add any disclaimers, notes, or annotations about the changes
      5. Maintain the same level of detail as the original
      6. Do not introduce new information not present in the original synopsis or provided parameters
      
      Return only the updated synopsis text without any additional commentary.
      `;
      
      // Call the OpenAI service
      const assistantResponse = await openaiService.getAIAssistantResponse(
        prompt,
        { type: "synopsis-update" },
        { changes, newParams }
      );
      
      res.json({
        updatedSynopsis: assistantResponse,
        changes
      });
    } catch (error) {
      console.error("Error updating synopsis:", error);
      res.status(500).json({ message: "Failed to update synopsis", error: String(error) });
    }
  });
  
  /**
   * Generate a comprehensive protocol overview from synopsis
   * This creates a detailed overview with clinical context, study objectives, endpoints, etc.
   */
  app.post("/api/generate-protocol-overview", async (req: Request, res: Response) => {
    try {
      const { protocolId, synopsis, activeDesignStateId, protocolType: requestProtocolType } = req.body;
      
      if (!synopsis || synopsis.trim().length < 50) {
        return res.status(400).json({ error: "Synopsis text is too short or missing" });
      }
      
      // Get the protocol from storage
      const protocol = protocolId ? await storage.getProtocolById(protocolId) : null;
      
      // Get the active design state if ID is provided
      let designState = null;
      if (protocol && activeDesignStateId) {
        designState = await storage.getDesignState(protocolId, activeDesignStateId);
      }
      
      // Determine the correct protocol type with priority:
      // 1. Request body specified type
      // 2. Protocol record type
      // 3. Design state type
      // 4. Default to interventional_clinical_trial
      const protocolType = requestProtocolType || 
                          protocol?.protocolType || 
                          designState?.protocolType || 
                          'interventional_clinical_trial';
      
      console.log(`Generating protocol overview for protocol type: ${protocolType}`);
      
      // Generate the overview with the correct protocol type
      const overview = await generateProtocolOverview(synopsis, protocolType);
      
      // If we have a protocol, update it with the overview
      if (protocol) {
        await storage.updateProtocol(protocolId, {
          overview
        });
      }
      
      // If we have a design state, update it with the overview too
      if (designState && protocol && activeDesignStateId) {
        await storage.updateDesignState(protocolId, activeDesignStateId, {
          ...designState,
          overview
        });
        console.log(`Updated design state ${activeDesignStateId} with new overview`);
      }
      
      res.json({ overview });
    } catch (error) {
      console.error('Error generating protocol overview:', error);
      res.status(500).json({ error: "Failed to generate protocol overview" });
    }
  });
  
  /**
   * Endpoint to regenerate overview for a specific design state
   * This allows users to manually refresh the overview when needed
   */
  app.post("/api/protocols/:id/design-states/:stateId/regenerate-overview", async (req: Request, res: Response) => {
    try {
      const protocol = await storage.getProtocolById(req.params.id);
      
      if (!protocol) {
        return res.status(404).json({ message: "Protocol not found" });
      }
      
      const designState = await storage.getDesignState(req.params.id, req.params.stateId);
      
      if (!designState) {
        return res.status(404).json({ message: "Design state not found" });
      }
      
      // Check if we have a synopsis to work with
      if (!designState.synopsis) {
        return res.status(400).json({ message: "Cannot generate overview without synopsis" });
      }
      
      // Generate a new overview based on the synopsis and protocol type
      console.log(`Regenerating overview for design state ${req.params.stateId} with protocol type ${designState.protocolType || 'interventional_clinical_trial'}`);
      const overview = await generateProtocolOverview(
        designState.synopsis,
        designState.protocolType || 'interventional_clinical_trial'
      );
      
      // Update the design state with the new overview
      const updatedDesignState = await storage.updateDesignState(req.params.id, req.params.stateId, {
        ...designState,
        overview: overview
      });
      
      res.json({
        overview: overview,
        designState: updatedDesignState
      });
    } catch (error) {
      console.error("Error regenerating overview:", error);
      res.status(500).json({ message: "Failed to regenerate overview", error: String(error) });
    }
  });
  
  // Upload synopsis file
  app.post("/api/upload-synopsis", upload.single('file'), async (req: Request, res: Response) => {
    try {
      if (!req.file) {
        return res.status(400).json({ message: "No file uploaded" });
      }
      
      const fileBuffer = req.file.buffer;
      const filename = req.file.originalname;
      // Generate a unique protocol ID if one isn't provided
      const randomId = Math.floor(1000 + Math.random() * 9000);
      const protocolId = req.body.protocolId || `EV-${randomId}`;
      // Get protocol type from request body, default to interventional_clinical_trial if not provided
      const protocolType = req.body.protocolType || 'interventional_clinical_trial';
      
      console.log(`Processing PDF: ${filename}${protocolId ? ` for protocol ${protocolId}` : ''} with type ${protocolType}`);
      
      // Extract text plus structured tables/images where possible.
      const structuredExtraction = await extractStructuredContentFromFile(fileBuffer, filename);
      const extractedText = structuredExtraction.text;
      
      // Check if the protocol exists
      let protocol = await storage.getProtocolById(protocolId);
      
      // If protocol doesn't exist, create it with basic information
      if (!protocol) {
        console.log(`Protocol with ID ${protocolId} not found, creating new protocol...`);
        
        // Extract a title from the filename or the first line of text
        let title = filename.replace(/\.[^/.]+$/, ""); // Remove file extension
        const firstLine = extractedText.split('\n')[0].trim();
        if (firstLine.length < 100) {
          title = firstLine;
        }
        
        // Create the protocol
        protocol = await storage.createProtocol({
          id: protocolId,
          title,
          phase: protocolType === 'interventional_clinical_trial' ? 'Phase 3' : 'N/A', // Phase only relevant for interventional trials
          indication: 'Unknown', // Default indication
          status: 'draft',
          synopsis: extractedText,
          createdBy: 'system',
          userId: 1, // Default user ID
          tableData: '[]', // Empty JSON array
          tableHeaders: '[]', // Empty JSON array
          protocolType: protocolType, // Store the protocol type
          // lastEdited will be set by database default
        });
        
        console.log(`Created new protocol with ID ${protocolId} of type ${protocolType}`);
        
        // Create an initial design state to make sure we have one available
        // Set default parameters based on protocol type
        let defaultStudyParameters;
        
        // Define type-specific parameters based on protocol type
        if (protocolType === 'secondary_data_analysis') {
          // Secondary RWE study defaults
          defaultStudyParameters = {
            population: {
              ageRange: { min: 18, max: 99 },
              gender: "both" as GenderType,
              healthStatus: "All eligible patients in database",
              keyInclusion: ["Patients in the selected database", "Diagnosis of condition of interest"],
              keyExclusion: ["Missing key data elements"]
            },
            intervention: {
              name: "Not applicable",
              description: "Retrospective data analysis"
            },
            comparator: {
              type: "cohort_comparison"
            },
            outcomes: {
              primary: [{
                name: "Primary outcome",
                description: "Key outcome of interest",
                timepoint: "Study period"
              }]
            },
            timing: {
              studyDuration: "Database study period",
              visitFrequency: "As recorded in database"
            },
            design: {
              type: "observational" as const,
              blinding: "none"
            },
            dataSource: {
              type: "electronic_health_records",
              name: "Database source",
              description: "Clinical or claims database",
              timeframe: "Database coverage period"
            }
          };
        } else if (protocolType === 'delphi_consensus') {
          // Delphi study defaults
          defaultStudyParameters = {
            population: {
              ageRange: { min: 25, max: 75 },
              gender: "both" as GenderType,
              healthStatus: "Expert panelists",
              keyInclusion: ["Subject matter expertise", "Minimum years of experience"],
              keyExclusion: ["Conflicts of interest"]
            },
            intervention: {
              name: "Not applicable",
              description: "Delphi consensus process"
            },
            comparator: {
              type: "none"
            },
            outcomes: {
              primary: [{
                name: "Consensus achievement",
                description: "Agreement level on key questions",
                timepoint: "Final Delphi round"
              }]
            },
            timing: {
              studyDuration: "3-6 months",
              visitFrequency: "Per Delphi round"
            },
            design: {
              type: "consensus" as const,
              blinding: "none"
            },
            consensusMethod: {
              rounds: 3,
              panelSize: 15,
              thresholdForConsensus: 70,
              feedbackType: "statistical_summary"
            }
          };
        } else if (protocolType === 'observational_cohort') {
          // Observational cohort defaults
          defaultStudyParameters = {
            population: {
              ageRange: { min: 18, max: 80 },
              gender: "both" as GenderType,
              healthStatus: "Target condition",
              keyInclusion: ["Diagnosis of target condition", "Ability to provide consent"],
              keyExclusion: ["Participation in interventional trial"]
            },
            intervention: {
              name: "Not applicable",
              description: "Observational study with no intervention"
            },
            comparator: {
              type: "none"
            },
            outcomes: {
              primary: [{
                name: "Primary outcome measure",
                description: "Key outcome of interest",
                timepoint: "End of follow-up period"
              }]
            },
            timing: {
              studyDuration: "12-24 months",
              visitFrequency: "Every 3-6 months"
            },
            design: {
              type: "observational" as const,
              blinding: "none"
            }
          };
        } else if (protocolType === 'cross_sectional_survey') {
          // Cross-sectional survey defaults
          defaultStudyParameters = {
            population: {
              ageRange: { min: 18, max: 90 },
              gender: "both" as GenderType,
              healthStatus: "Target population",
              keyInclusion: ["Member of target population", "Ability to complete survey"],
              keyExclusion: ["Unable to provide informed consent"]
            },
            intervention: {
              name: "Not applicable",
              description: "Cross-sectional survey study"
            },
            comparator: {
              type: "none"
            },
            outcomes: {
              primary: [{
                name: "Survey response rate",
                description: "Percentage of completed surveys",
                timepoint: "Survey completion"
              }]
            },
            timing: {
              studyDuration: "1-3 months",
              visitFrequency: "One-time survey"
            },
            design: {
              type: "observational" as const,
              blinding: "none"
            }
          };
        } else {
          // Default to interventional_clinical_trial
          defaultStudyParameters = {
            population: {
              ageRange: { min: 18, max: 75 },
              gender: "both" as GenderType,
              healthStatus: "Target condition",
              keyInclusion: ["Age ≥ 18 years", "Provides written informed consent"],
              keyExclusion: ["Prior participation in this study", "Pregnancy or breastfeeding"]
            },
            intervention: {
              name: "Study Treatment",
              description: "Investigational Product"
            },
            comparator: {
              type: "placebo"
            },
            outcomes: {
              primary: [{
                name: "Primary Endpoint",
                description: "Based on study objectives",
                timepoint: "Study completion"
              }]
            },
            timing: {
              studyDuration: "12 months",
              visitFrequency: "Every 4 weeks"
            },
            design: {
              type: "randomized" as const,
              blinding: "double"
            }
          };
        }
        
        const initialDesignState = {
          id: `${protocolId}-DS-001`,
          label: 'Initial Design',
          protocolId: protocolId,
          timestamp: new Date(),
          synopsis: extractedText,
          protocolType: protocolType, // Store the protocol type
          studyParameters: defaultStudyParameters
          // Scientific value, clinical relevance, and feasibility metrics are intentionally not included
          // These will only be added after explicit evaluation via the "Run Evaluation" button
        };
        
        await storage.createDesignState(protocolId, initialDesignState);
        await storage.setActiveDesignState(protocolId, initialDesignState.id);
        
        console.log(`Created initial design state for protocol ${protocolId}`);
      }
      
      // Return the extracted text and protocol info
      res.json({ 
        text: extractedText,
        plainText: structuredExtraction.plainText,
        structuredExtraction: publicStructuredExtraction(structuredExtraction),
        filename: filename,
        protocol
      });
    } catch (error) {
      console.error("Error in upload-synopsis endpoint:", error);
      res.status(500).json({ message: "Failed to process uploaded file", error: String(error) });
    }
  });

  // Upload supplementary reference file and extract usable text for retrieval
  app.post("/api/upload-supplementary", upload.single('file'), async (req: Request, res: Response) => {
    try {
      if (!req.file) {
        return res.status(400).json({ message: "No file uploaded" });
      }

      const filename = req.file.originalname;
      const sectionKey = typeof req.body.sectionKey === "string" ? req.body.sectionKey.trim() : "";
      const sectionName = typeof req.body.sectionName === "string" ? req.body.sectionName.trim() : "";
      const usage = typeof req.body.usage === "string" && req.body.usage.trim()
        ? req.body.usage.trim()
        : "Use information from this file as supporting reference for protocol generation.";
      let structuredExtraction = await extractStructuredContentFromFile(req.file.buffer, filename);

      if (sectionKey === "schedule") {
        structuredExtraction = await openaiService.reconstructScheduleTablesFromExtraction(
          filename,
          structuredExtraction,
          usage
        );
      }

      const extractedText = structuredExtraction.text;

      res.json({
        text: extractedText,
        plainText: structuredExtraction.plainText,
        structuredExtraction: publicStructuredExtraction(structuredExtraction),
        filename,
        sectionKey,
        sectionName,
        usage,
        characterCount: extractedText.length
      });
    } catch (error) {
      console.error("Error in upload-supplementary endpoint:", error);
      res.status(500).json({ message: "Failed to process supplementary file", error: String(error) });
    }
  });

  // Search for similar clinical trials
  app.post("/api/search-clinical-trials", async (req: Request, res: Response) => {
    console.log("Received search-clinical-trials request:", req.body);
    try {
      const { 
        indication, 
        phase, 
        additionalTerms, 
        maxResults, 
        protocolId, 
        synopsis, 
        inclusionCriteria, 
        exclusionCriteria,
        filters 
      } = req.body;
      
      console.log(`Clinical trials search:
        - Protocol ID: ${protocolId || 'Not provided'}
        - Indication: ${indication || 'Not provided'}
        - Phase: ${phase || 'Not provided'}
        - Additional terms: ${additionalTerms || 'None'}
        - Filters: ${filters ? JSON.stringify(filters) : 'None'}
        - Max results: ${maxResults || '5'}`);
      
      // If we have a direct indication, use that first
      if (indication) {
        console.log(`Manual search with parameters:
        - Indication: ${indication}
        - Phase: ${phase || 'Not specified'}
        - Additional terms: ${additionalTerms || 'None'}
        - Filters: ${filters ? JSON.stringify(filters) : 'None'}`);
        
        const searchResults = await clinicaltrialsService.searchClinicalTrials(
          indication,
          phase,
          filters, // Pass the filters to the search function
          additionalTerms,
          maxResults || 5
        );
        
        console.log(`Found ${searchResults.length} trials matching manual parameters`);
        const clientTrials = searchResults.map(({ briefSummary, eligibilityCriteria, ...trial }: any) => trial);
        
        return res.json({ 
          trials: clientTrials,
          searchParams: { indication, phase, additionalTerms, filters }
        });
      }
      
      // If protocolId is provided, use AI to extract search terms from protocol synopsis
      else if (protocolId) {
        try {
          // Get the protocol from storage
          console.log("Searching for protocol with ID:", protocolId);
          
          // Try to get the protocol with the exact ID
          let protocol = await storage.getProtocolById(protocolId);
          
          // If not found, try to convert the ID format (sometimes IDs are passed with different formats)
          if (!protocol) {
            console.log("Protocol not found with direct ID, trying to format the ID...");
            // If the protocol ID is in UUID format without dashes, try to add them
            if (protocolId.length === 32) {
              const formattedId = `${protocolId.slice(0, 8)}-${protocolId.slice(8, 12)}-${protocolId.slice(12, 16)}-${protocolId.slice(16, 20)}-${protocolId.slice(20)}`;
              console.log("Reformatted ID:", formattedId);
              protocol = await storage.getProtocolById(formattedId);
            }
          }
          
          if (!protocol) {
            console.error("Protocol not found with ID:", protocolId);
            if (synopsis || indication || inclusionCriteria || exclusionCriteria) {
              console.log("Using protocol data sent with the request for AI-assisted search.");
              protocol = {
                id: protocolId,
                title: req.body.title || "",
                synopsis: synopsis || "",
                indication: indication || "",
                phase: phase || "",
                inclusionCriteria,
                exclusionCriteria,
              } as any;
            } else {
              return res.status(404).json({ 
                message: "Protocol not found for AI-assisted search",
                error: `No protocol found with ID: ${protocolId}. Try using manual search parameters instead.`
              });
            }
          } else if (synopsis || indication || inclusionCriteria || exclusionCriteria || req.body.title) {
            console.log("Merging latest request data into stored protocol for AI-assisted search.");
            protocol = {
              ...protocol,
              title: req.body.title || protocol.title,
              synopsis: synopsis || protocol.synopsis,
              indication: indication || protocol.indication,
              phase: phase || protocol.phase,
              inclusionCriteria: inclusionCriteria || protocol.inclusionCriteria,
              exclusionCriteria: exclusionCriteria || protocol.exclusionCriteria,
            } as any;
          }
          
          console.log("Protocol found, extracting search parameters using AI...");
          
          // Extract search parameters from protocol using AI
          const searchParams = await clinicaltrialsService.analyzeProtocolForTrialSearch(protocol);
          
          console.log(`AI extracted search parameters:
            - Indication: ${searchParams.indication || 'Not extracted'}
            - Phase: ${searchParams.phase || 'Not extracted'}
            - Additional terms: ${searchParams.additionalTerms || 'None'}`);
          
          // Validation - make sure we have at least an indication
          if (!searchParams.indication) {
            console.error("AI failed to extract indication from protocol");
            return res.status(400).json({ 
              message: "Failed to extract indication from protocol for search",
              searchParams
            });
          }
          
          // Call the ClinicalTrials.gov service to search for trials with AI-generated parameters
          console.log("Searching ClinicalTrials.gov with AI-generated parameters...");
          
          const searchResults = await clinicaltrialsService.searchClinicalTrials(
            searchParams.indication,
            phase || searchParams.phase,
            filters, // Pass the filters to the search function
            searchParams.additionalTerms,
            maxResults || 5
          );
          
          console.log(`Found ${searchResults.length} trials matching AI-generated parameters`);
          const clientTrials = searchResults.map(({ briefSummary, eligibilityCriteria, ...trial }: any) => trial);
          
          return res.json({ 
            trials: clientTrials,
            searchParams // Include the AI-generated search parameters for reference
          });
        } catch (error: any) {
          console.error("Error in AI-assisted trial search:", error);
          
          // Check for specific API errors
          if (error.response) {
            console.error(`API Error in AI search: ${error.response.status} - ${JSON.stringify(error.response.data || {})}`);
          }
          
          return res.status(500).json({ 
            message: "Failed to perform AI-assisted search. Try using manual search parameters instead.",
            error: String(error),
            errorDetails: error.response ? {
              status: error.response.status,
              data: error.response.data
            } : "Unknown error"
          });
        }
      }
      
      // If no protocolId or if AI-assisted search failed, use a fallback
      if (!indication) {
        console.warn("No indication provided - using fallback for demo purposes");
        // Use a fallback for demonstration
        const fallbackParams = {
          indication: "cancer",
          phase: "Phase 3",
          additionalTerms: "solid tumor"
        };
        
        console.log(`Using fallback search parameters: ${JSON.stringify(fallbackParams)}`);
        
        const searchResults = await clinicaltrialsService.searchClinicalTrials(
          fallbackParams.indication,
          fallbackParams.phase,
          filters, // Pass the filters to the search function
          fallbackParams.additionalTerms,
          maxResults || 5
        );
        
        console.log(`Found ${searchResults.length} trials using fallback parameters`);
        const clientTrials = searchResults.map(({ briefSummary, eligibilityCriteria, ...trial }: any) => trial);
        
        return res.json({ 
          trials: clientTrials,
          searchParams: fallbackParams,
          message: "Using fallback parameters for demonstration. In production, specific disease indication would be required."
        });
      }
      
      console.log(`Manual search with parameters:
        - Indication: ${indication}
        - Phase: ${phase || 'Not specified'}
        - Additional terms: ${additionalTerms || 'None'}`);
      
      // Call the ClinicalTrials.gov service to search for trials with manual parameters
      const searchResults = await clinicaltrialsService.searchClinicalTrials(
        indication,
        phase,
        filters, // Pass the filters to the search function
        additionalTerms,
        maxResults || 5
      );
      
      console.log(`Found ${searchResults.length} trials matching manual parameters`);
      const clientTrials = searchResults.map(({ briefSummary, eligibilityCriteria, ...trial }: any) => trial);
      
      return res.json({ 
        trials: clientTrials,
        searchParams: { indication, phase, additionalTerms, filters }
      });
    } catch (error: any) {
      console.error("Error in search-clinical-trials endpoint:", error);
      
      // Check for specific API errors
      let errorDetails: string | Record<string, any> = "Unknown error";
      
      if (error.response) {
        console.error(`API Error: ${error.response.status} - ${JSON.stringify(error.response.data || {})}`);
        errorDetails = {
          status: error.response.status,
          data: error.response.data
        };
      } else if (error.request) {
        console.error("No response received from API");
        errorDetails = "No response received from API";
      }
      
      return res.status(500).json({ 
        message: "Failed to search clinical trials", 
        error: String(error),
        errorDetails
      });
    }
  });

  // Get details of a specific clinical trial
  app.get("/api/clinical-trials/:nctId", async (req: Request, res: Response) => {
    try {
      const { nctId } = req.params;
      
      if (!nctId) {
        return res.status(400).json({ message: "NCT ID is required" });
      }
      
      console.log(`Fetching trial details for ${nctId}...`);
      
      // Call the ClinicalTrials.gov service to get trial details
      const trialDetails = await clinicaltrialsService.getTrialDetails(nctId);
      
      // If trial details were returned successfully
      if (trialDetails) {
        console.log(`Successfully fetched trial details for ${nctId}`);
        return res.json({ trial: trialDetails });
      } else {
        // This shouldn't happen given our modifications to getTrialDetails, but just in case
        console.error(`No trial details returned for ${nctId}, but no error was thrown`);
        return res.status(404).json({ 
          message: `Trial ${nctId} not found or could not be retrieved`,
          trial: null
        });
      }
    } catch (error) {
      // Log the error
      console.error(`Error in clinical-trials/${req.params.nctId} endpoint:`, error);
      
      // Return a more descriptive error response
      return res.status(500).json({ 
        message: "Failed to fetch trial details", 
        error: String(error),
        nctId: req.params.nctId
      });
    }
  });

  // Extract eligibility criteria from a trial
  app.post("/api/extract-trial-criteria", async (req: Request, res: Response) => {
    try {
      console.log("Received extract-trial-criteria request:", JSON.stringify(req.body, null, 2));
      const { trialDetails, nctId } = req.body;
      
      // Handle both options: full trial details or just NCT ID
      if (!trialDetails && !nctId) {
        console.error("Missing required parameters: Neither trialDetails nor nctId provided");
        return res.status(400).json({ message: "Either trial details or NCT ID is required" });
      }
      
      let criteriaData;
      
      // Option 1: If trial details are provided directly
      if (trialDetails) {
        const trialId = trialDetails.protocolSection?.identificationModule?.nctId || 'Unknown ID';
        console.log(`Extracting eligibility criteria for trial from provided details: ${trialId}`);
        criteriaData = await clinicaltrialsService.extractEligibilityCriteria(trialDetails);
      } 
      // Option 2: If only NCT ID is provided, fetch the trial details first
      else if (nctId) {
        console.log(`Fetching details and extracting eligibility criteria for trial: ${nctId}`);
        
        try {
          const trialDetails = await clinicaltrialsService.getTrialDetails(nctId);
          
          if (!trialDetails) {
            console.error(`No trial details found for NCT ID: ${nctId}`);
            return res.status(404).json({ 
              message: `Trial not found: ${nctId}`,
              error: "Trial details could not be retrieved" 
            });
          }
          
          console.log(`Successfully retrieved trial details for ${nctId}, now extracting criteria`);
          criteriaData = await clinicaltrialsService.extractEligibilityCriteria(trialDetails);
        } catch (fetchError: any) {
          console.error(`Error fetching trial details for ${nctId}:`, fetchError);
          return res.status(500).json({
            message: `Failed to fetch trial details for ${nctId}`,
            error: fetchError.message
          });
        }
      }
      
      if (!criteriaData) {
        console.error("No criteria data could be extracted");
        return res.status(500).json({ 
          message: "Failed to extract criteria data",
          error: "No criteria could be extracted from the trial" 
        });
      }
      
      // Log the extracted criteria counts
      console.log(`Successfully extracted criteria for ${nctId || 'provided trial'}:`, 
        `${criteriaData.inclusionCriteria?.length || 0} inclusion criteria, ` +
        `${criteriaData.exclusionCriteria?.length || 0} exclusion criteria`);
      
      // Return just the criteriaData directly (no wrapping), matching what the client expects
      return res.json(criteriaData);
    } catch (error) {
      console.error("Error in extract-trial-criteria endpoint:", error);
      return res.status(500).json({ 
        message: "Failed to extract eligibility criteria", 
        error: String(error) 
      });
    }
  });

  // Compare current criteria with criteria from similar trials
  app.post("/api/compare-criteria", async (req: Request, res: Response) => {
    try {
      console.log("Received compare-criteria request");
      
      // Handle both parameter naming conventions
      const { currentCriteria, protocolCriteria, comparisonCriteria } = req.body;
      
      // Use protocolCriteria if provided, otherwise fall back to currentCriteria
      const criteriaToCompare = protocolCriteria || currentCriteria;
      
      if (!criteriaToCompare || !comparisonCriteria || !Array.isArray(comparisonCriteria)) {
        console.error("Missing required parameters for criteria comparison");
        return res.status(400).json({ 
          message: "Protocol criteria and an array of comparison criteria are required" 
        });
      }
      
      if (comparisonCriteria.length === 0) {
        console.error("Empty comparison criteria array provided");
        return res.status(400).json({ 
          message: "At least one trial must be provided for comparison" 
        });
      }
      
      // Validate current criteria structure
      if (!criteriaToCompare.inclusionCriteria || !criteriaToCompare.exclusionCriteria) {
        console.error("Invalid current criteria structure:", criteriaToCompare);
        return res.status(400).json({ 
          message: "Current criteria must include inclusionCriteria and exclusionCriteria properties" 
        });
      }
      
      // Validate comparison criteria structure
      let invalidTrials = comparisonCriteria.filter(trial => 
        !trial.nctId || 
        !trial.criteria || 
        !Array.isArray(trial.criteria.inclusionCriteria) || 
        !Array.isArray(trial.criteria.exclusionCriteria)
      );
      
      if (invalidTrials.length > 0) {
        console.error(`Found ${invalidTrials.length} invalid trials in comparison data`);
        return res.status(400).json({ 
          message: "All comparison trials must include valid criteria structure",
          invalidTrials: invalidTrials.map(t => t.nctId || 'unknown')
        });
      }
      
      console.log(`Comparing eligibility criteria with ${comparisonCriteria.length} similar trials`);
      console.log(`Current protocol has ${criteriaToCompare.inclusionCriteria.length} inclusion and ${criteriaToCompare.exclusionCriteria.length} exclusion criteria`);
      
      try {
        // Call the ClinicalTrials.gov service to compare criteria
        const comparisonResults = await clinicaltrialsService.compareCriteria(
          criteriaToCompare,
          comparisonCriteria
        );
        
        if (!comparisonResults) {
          throw new Error("Comparison service returned empty results");
        }
        
        console.log("Successfully completed criteria comparison with results:", 
          Object.keys(comparisonResults).join(', '));
        
        return res.json(comparisonResults);
      } catch (comparisonError: any) {
        console.error("Error during criteria comparison:", comparisonError);
        return res.status(500).json({
          message: "Error during criteria comparison",
          error: comparisonError.message || "Unknown comparison error"
        });
      }
    } catch (error) {
      console.error("Error in compare-criteria endpoint:", error);
      return res.status(500).json({ 
        message: "Failed to compare eligibility criteria", 
        error: String(error) 
      });
    }
  });

  // ========== Cohort Study Components Endpoints ==========

  // Generate Cohort Definition for prospective cohort studies
  app.post("/api/generate-cohort-definition", async (req: Request, res: Response) => {
    try {
      const { synopsis, supplementaryInfo, protocolId, designStateId } = req.body;
      
      if (!synopsis || typeof synopsis !== 'string') {
        return res.status(400).json({ message: "Synopsis text is required" });
      }
      
      const supplementaryData = normalizeSupplementaryInfo(
        supplementaryInfo,
        "cohort definition population eligibility exposure outcome follow up observation period"
      );
        
      // Call the OpenAI service to generate cohort definition
      const cohortDefinitionResult = await openaiService.generateCohortDefinition(
        synopsis, 
        supplementaryData
      );
      
      // If protocol ID and design state ID are provided, save the component
      if (protocolId && designStateId) {
        try {
          // Store the cohort definition as a component linked to this design state
          await storage.createComponent(protocolId, {
            designStateId,
            type: "cohortDefinition",
            data: cohortDefinitionResult,
            createdAt: new Date(),
            updatedAt: new Date()
          });
          
          console.log(`Cohort definition component stored for design state ${designStateId}`);
        } catch (storageError) {
          console.error("Error storing cohort definition component:", storageError);
          // Continue anyway, as we can still return the generated cohort definition
        }
      }
      
      res.json(cohortDefinitionResult);
    } catch (error) {
      console.error("Error in generate-cohort-definition endpoint:", error);
      res.status(500).json({ 
        message: "Failed to generate cohort definition", 
        error: String(error) 
      });
    }
  });

  // Generate Observation Schedule for prospective cohort studies
  app.post("/api/generate-observation-schedule", async (req: Request, res: Response) => {
    try {
      const { synopsis, supplementaryInfo, protocolId, designStateId } = req.body;
      
      if (!synopsis || typeof synopsis !== 'string') {
        return res.status(400).json({ message: "Synopsis text is required" });
      }
      
      const supplementaryData = normalizeSupplementaryInfo(
        supplementaryInfo,
        "observation schedule visits timepoints assessments follow up data collection procedures"
      );
        
      // Call the OpenAI service to generate observation schedule
      const observationScheduleResult = await openaiService.generateObservationSchedule(
        synopsis, 
        supplementaryData
      );
      
      // If protocol ID and design state ID are provided, save the component
      if (protocolId && designStateId) {
        try {
          // Store the observation schedule as a component linked to this design state
          await storage.createComponent(protocolId, {
            designStateId,
            type: "observationSchedule",
            data: observationScheduleResult,
            createdAt: new Date(),
            updatedAt: new Date()
          });
          
          console.log(`Observation schedule component stored for design state ${designStateId}`);
        } catch (storageError) {
          console.error("Error storing observation schedule component:", storageError);
          // Continue anyway, as we can still return the generated observation schedule
        }
      }
      
      res.json(observationScheduleResult);
    } catch (error) {
      console.error("Error in generate-observation-schedule endpoint:", error);
      res.status(500).json({ 
        message: "Failed to generate observation schedule", 
        error: String(error) 
      });
    }
  });

  // Generate Exposure Assessment for prospective cohort studies
  app.post("/api/generate-exposure-assessment", async (req: Request, res: Response) => {
    try {
      const { synopsis, supplementaryInfo, protocolId, designStateId } = req.body;
      
      if (!synopsis || typeof synopsis !== 'string') {
        return res.status(400).json({ message: "Synopsis text is required" });
      }
      
      const supplementaryData = normalizeSupplementaryInfo(
        supplementaryInfo,
        "exposure assessment exposure definition measurement timing dose duration data source"
      );
        
      // Call the OpenAI service to generate exposure assessment
      const exposureAssessmentResult = await openaiService.generateExposureAssessment(
        synopsis, 
        supplementaryData
      );
      
      // If protocol ID and design state ID are provided, save the component
      if (protocolId && designStateId) {
        try {
          // Store the exposure assessment as a component linked to this design state
          await storage.createComponent(protocolId, {
            designStateId,
            type: "exposureAssessment",
            data: exposureAssessmentResult,
            createdAt: new Date(),
            updatedAt: new Date()
          });
          
          console.log(`Exposure assessment component stored for design state ${designStateId}`);
        } catch (storageError) {
          console.error("Error storing exposure assessment component:", storageError);
          // Continue anyway, as we can still return the generated exposure assessment
        }
      }
      
      res.json(exposureAssessmentResult);
    } catch (error) {
      console.error("Error in generate-exposure-assessment endpoint:", error);
      res.status(500).json({ 
        message: "Failed to generate exposure assessment", 
        error: String(error) 
      });
    }
  });
  
  // Generate Data Source for retrospective cohort studies
  app.post("/api/generate-data-source", async (req: Request, res: Response) => {
    try {
      const { synopsis, supplementaryInfo, protocolId, designStateId } = req.body;
      
      if (!synopsis || typeof synopsis !== 'string') {
        return res.status(400).json({ message: "Synopsis text is required" });
      }
      
      const supplementaryData = normalizeSupplementaryInfo(
        supplementaryInfo,
        "data source database registry records claims EHR extraction quality linkage"
      );
        
      // Call the OpenAI service to generate data source definition
      const dataSourceResult = await openaiService.generateDataSource(
        synopsis, 
        supplementaryData
      );
      
      // If protocol ID and design state ID are provided, save the component
      if (protocolId && designStateId) {
        try {
          // Store the data source as a component linked to this design state
          await storage.createComponent(protocolId, {
            designStateId,
            type: "dataSource",
            data: dataSourceResult,
            createdAt: new Date(),
            updatedAt: new Date()
          });
          
          console.log(`Data source component stored for design state ${designStateId}`);
        } catch (storageError) {
          console.error("Error storing data source component:", storageError);
          // Continue anyway, as we can still return the generated data source
        }
      }
      
      res.json(dataSourceResult);
    } catch (error) {
      console.error("Error in generate-data-source endpoint:", error);
      res.status(500).json({ 
        message: "Failed to generate data source", 
        error: String(error) 
      });
    }
  });

  // Generate Retrospective Cohort Definition
  app.post("/api/generate-retrospective-cohort", async (req: Request, res: Response) => {
    try {
      const { synopsis, supplementaryInfo, protocolId, designStateId } = req.body;
      
      if (!synopsis || typeof synopsis !== 'string') {
        return res.status(400).json({ message: "Synopsis text is required" });
      }
      
      const supplementaryData = normalizeSupplementaryInfo(
        supplementaryInfo,
        "retrospective cohort definition population eligibility index date exposure outcome follow up"
      );
        
      // Call the OpenAI service to generate retrospective cohort definition
      const retroCohortResult = await openaiService.generateRetrospectiveCohortDefinition(
        synopsis, 
        supplementaryData
      );
      
      // If protocol ID and design state ID are provided, save the component
      if (protocolId && designStateId) {
        try {
          // Store the retrospective cohort as a component linked to this design state
          await storage.createComponent(protocolId, {
            designStateId,
            type: "retrospectiveCohortDefinition",
            data: retroCohortResult,
            createdAt: new Date(),
            updatedAt: new Date()
          });
          
          console.log(`Retrospective cohort component stored for design state ${designStateId}`);
        } catch (storageError) {
          console.error("Error storing retrospective cohort component:", storageError);
          // Continue anyway, as we can still return the generated retrospective cohort
        }
      }
      
      res.json(retroCohortResult);
    } catch (error) {
      console.error("Error in generate-retrospective-cohort endpoint:", error);
      res.status(500).json({ 
        message: "Failed to generate retrospective cohort definition", 
        error: String(error) 
      });
    }
  });

  // Boilerplate Text Routes
  
  // Get all boilerplate texts
  app.get("/api/boilerplate-texts", async (req: Request, res: Response) => {
    try {
      const { section, protocolType } = req.query;
      let boilerplateTexts;
      
      if (section && protocolType) {
        // Filter by both section and protocol type
        boilerplateTexts = await storage.getBoilerplateTextsBySectionAndType(
          section as string, 
          protocolType as string
        );
      } else if (section) {
        // Filter by section only
        boilerplateTexts = await storage.getBoilerplateTextsBySection(section as string);
      } else if (protocolType) {
        // Filter by protocol type only
        boilerplateTexts = await storage.getBoilerplateTextsByProtocolType(protocolType as string);
      } else {
        // Get all boilerplate texts
        boilerplateTexts = await storage.getAllBoilerplateTexts();
      }
      
      res.json(boilerplateTexts);
    } catch (error) {
      res.status(500).json({ 
        message: "Failed to fetch boilerplate texts", 
        error: String(error) 
      });
    }
  });
  
  // Get boilerplate text by ID
  app.get("/api/boilerplate-texts/:id", async (req: Request, res: Response) => {
    try {
      const boilerplateText = await storage.getBoilerplateTextById(req.params.id);
      
      if (!boilerplateText) {
        return res.status(404).json({ message: "Boilerplate text not found" });
      }
      
      res.json(boilerplateText);
    } catch (error) {
      res.status(500).json({ 
        message: "Failed to fetch boilerplate text", 
        error: String(error) 
      });
    }
  });
  
  // Create new boilerplate text
  app.post("/api/boilerplate-texts", async (req: Request, res: Response) => {
    try {
      // Generate a unique ID if not provided
      if (!req.body.id) {
        const randomId = Math.floor(Math.random() * 10000);
        req.body.id = `BPT-${randomId}`;
      }
      
      // Create boilerplate text
      const boilerplateText = await storage.createBoilerplateText(req.body);
      
      res.status(201).json(boilerplateText);
    } catch (error) {
      res.status(500).json({ 
        message: "Failed to create boilerplate text", 
        error: String(error) 
      });
    }
  });
  
  // Update boilerplate text
  app.put("/api/boilerplate-texts/:id", async (req: Request, res: Response) => {
    try {
      const boilerplateText = await storage.getBoilerplateTextById(req.params.id);
      
      if (!boilerplateText) {
        return res.status(404).json({ message: "Boilerplate text not found" });
      }
      
      // Update boilerplate text
      const updatedBoilerplateText = await storage.updateBoilerplateText(
        req.params.id, 
        req.body
      );
      
      if (!updatedBoilerplateText) {
        return res.status(404).json({ message: "Boilerplate text not found" });
      }
      
      res.json(updatedBoilerplateText);
    } catch (error) {
      res.status(500).json({ 
        message: "Failed to update boilerplate text", 
        error: String(error) 
      });
    }
  });
  
  // Delete boilerplate text
  app.delete("/api/boilerplate-texts/:id", async (req: Request, res: Response) => {
    try {
      const boilerplateText = await storage.getBoilerplateTextById(req.params.id);
      
      if (!boilerplateText) {
        return res.status(404).json({ message: "Boilerplate text not found" });
      }
      
      // Delete boilerplate text
      const deleted = await storage.deleteBoilerplateText(req.params.id);
      
      if (!deleted) {
        return res.status(500).json({ message: "Failed to delete boilerplate text" });
      }
      
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ 
        message: "Failed to delete boilerplate text", 
        error: String(error) 
      });
    }
  });
  
  // Update the protocol generation endpoint to support boilerplate text
  app.post("/api/generate-protocol-with-boilerplate", async (req: Request, res: Response) => {
    try {
      const { protocolId, designStateId, boilerplateSelections } = req.body;
      
      if (!protocolId || !designStateId) {
        return res.status(400).json({ 
          message: "Protocol ID and design state ID are required" 
        });
      }
      
      // Get the protocol and design state
      const protocol = await storage.getProtocolById(protocolId);
      if (!protocol) {
        return res.status(404).json({ message: "Protocol not found" });
      }
      
      const designState = await storage.getDesignStateById(designStateId);
      if (!designState) {
        return res.status(404).json({ message: "Design state not found" });
      }
      
      // Update the design state with boilerplate selections
      if (boilerplateSelections) {
        await storage.updateDesignStateBoilerplateSelections(
          designStateId, 
          boilerplateSelections
        );
      }
      
      return res.status(410).json({
        message: "This legacy boilerplate generation endpoint is deprecated. Use /api/generate-document with selected sections instead.",
        protocol
      });
    } catch (error) {
      res.status(500).json({ 
        message: "Failed to generate protocol", 
        error: String(error) 
      });
    }
  });

  // Comment routes
  app.get("/api/comments/:protocolId/:designStateId", async (req, res) => {
    try {
      const { protocolId, designStateId } = req.params;
      const { section, sectionItem } = req.query;

      let comments;
      if (section && sectionItem) {
        comments = await storage.getCommentsBySectionItem(protocolId, designStateId, section as string, sectionItem as string);
      } else if (section) {
        comments = await storage.getCommentsBySection(protocolId, designStateId, section as string);
      } else {
        comments = await storage.getComments(protocolId, designStateId);
      }

      res.json(comments);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch comments", error: String(error) });
    }
  });

  app.post("/api/comments/:protocolId/", async (req, res) => {
    try {
      const { protocolId } = req.params;
      const commentData = req.body;
      
      console.log("Comment creation request:", { protocolId, commentData });
      
      // Validate required fields
      if (!protocolId || !commentData.designStateId || !commentData.section || !commentData.content) {
        console.log("Missing required fields:", {
          protocolId: !!protocolId,
          designStateId: !!commentData.designStateId,
          section: !!commentData.section,
          content: !!commentData.content
        });
        return res.status(400).json({ message: "Missing required fields" });
      }

      const comment = await storage.createComment({
        id: `comment-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        protocolId,
        userId: "default-user", // TODO: Replace with actual user ID from session
        ...commentData,
        createdAt: new Date().toISOString(),
        resolved: commentData.resolved || false
      });

      res.status(201).json(comment);
    } catch (error) {
      console.error("Comment creation error:", error);
      res.status(500).json({ message: "Failed to create comment", error: String(error) });
    }
  });

  app.post("/api/comments", async (req, res) => {
    try {
      const commentData = req.body;
      
      // Validate required fields
      if (!commentData.protocolId || !commentData.designStateId || !commentData.userId || !commentData.section || !commentData.content) {
        return res.status(400).json({ message: "Missing required fields" });
      }

      const comment = await storage.createComment({
        id: `comment-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        ...commentData
      });

      res.status(201).json(comment);
    } catch (error) {
      res.status(500).json({ message: "Failed to create comment", error: String(error) });
    }
  });

  app.put("/api/comments/:commentId", async (req, res) => {
    try {
      const { commentId } = req.params;
      const updates = req.body;

      const comment = await storage.updateComment(commentId, updates);
      if (!comment) {
        return res.status(404).json({ message: "Comment not found" });
      }

      res.json(comment);
    } catch (error) {
      res.status(500).json({ message: "Failed to update comment", error: String(error) });
    }
  });

  app.delete("/api/comments/:commentId", async (req, res) => {
    try {
      const { commentId } = req.params;
      const success = await storage.deleteComment(commentId);
      
      if (!success) {
        return res.status(404).json({ message: "Comment not found" });
      }

      res.json({ message: "Comment deleted successfully" });
    } catch (error) {
      res.status(500).json({ message: "Failed to delete comment", error: String(error) });
    }
  });

  const httpServer = createServer(app);

  return httpServer;
}
