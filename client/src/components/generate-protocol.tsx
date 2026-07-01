import React, { useState, useEffect, useMemo } from "react";
import { 
  Card, 
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  CardFooter
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { 
  AlertCircle,
  ArrowRight, 
  Bot,
  Check, 
  FileCheck,
  FileText, 
  Shield, 
  Trash,
  CheckCircle,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  BookTemplate,
  PlusCircle,
  RefreshCw
} from "lucide-react";
import { Protocol } from "@shared/schema";
import { GeneratedProtocolViewer } from "./generated-protocol-viewer";
import { apiRequest } from "../lib/apiRequest";
import { sanitizeProtocolForReview, stripLargeSourceArtifacts } from "../lib/protocol-sanitize";
import { 
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { AIGeneratedBadge } from "./ai-generated-badge";
import { AIGenerationStatus } from "./ai-generation-status";
import { BoilerplateTextSelector, BoilerplateText } from "./boilerplate-text-selector";
import { CommentTrigger } from "./comment-trigger";

interface GenerateProtocolProps {
  protocol: Protocol;
  setProtocol: React.Dispatch<React.SetStateAction<Protocol>>;
  activeDesignState?: any;
}

// Alignment status types
type AlignmentStatus = "aligned" | "partial" | "misaligned" | "unknown";
type GenerationStatus = "pending" | "generating" | "complete" | "error";
type ReviewClassification = "use_as_is" | "improve" | "add" | "needs_user_input" | "placeholder";
type ReviewDecision = "accept" | "edit" | "reject" | "source" | "placeholder";
type SectionGenerationMode = "preserve" | "augment" | "generate";

interface ProtocolInputReviewItem {
  id: string;
  section: string;
  label: string;
  classification: ReviewClassification;
  sourceText: string;
  proposedText: string;
  reason: string;
  confidence: number;
  riskLevel: "low" | "medium" | "high";
  decision: ReviewDecision;
  finalText: string;
}

interface ProtocolTabReadiness {
  sectionKey: string;
  sectionName: string;
  status: "current" | "stale" | "not_reviewed";
  hasContent: boolean;
  recommendedMode?: SectionGenerationMode;
  sourceStatus?: "not_found" | "partial" | "usable" | "strong";
  summary?: string;
  sourceEvidence?: string[];
  improvements?: string[];
  missingItems?: string[];
  risks?: string[];
  rationale?: string;
  readiness?: "ready" | "needs_update" | "blocked";
  recommendedAction?: string;
  blockers?: string[];
}

const INPUT_REVIEW_CACHE_VERSION = 2;

const tabReviewConfigs = [
  { sectionKey: "schedule", sectionName: "Schedule of Activities" },
  { sectionKey: "criteria", sectionName: "Eligibility Criteria" },
  { sectionKey: "studySchema", sectionName: "Study Schema" },
  { sectionKey: "safetyDrugHandling", sectionName: "Safety & Drug Handling" },
  { sectionKey: "analysisplan", sectionName: "Statistical Analysis Plan" }
];

const tabStatusLabels: Record<ProtocolTabReadiness["status"], string> = {
  current: "Reviewed",
  stale: "Needs update",
  not_reviewed: "Needs acceptance"
};

const tabModeLabels: Record<SectionGenerationMode, string> = {
  preserve: "Use source as-is",
  augment: "Improve with AI",
  generate: "Generate with AI"
};

const tabSourceStatusLabels: Record<NonNullable<ProtocolTabReadiness["sourceStatus"]>, string> = {
  not_found: "No source found",
  partial: "Partial source",
  usable: "Usable source",
  strong: "Strong source"
};

const parseStoredArray = (value: any): any[] => {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return value.trim() ? [{ id: "legacy", type: "text", text: value }] : [];
    }
  }
  return [];
};

const parseMaybeJson = (value: any) => {
  if (!value || typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
};

const getProtocolComponents = (protocol: any): any[] => {
  if (!protocol?.components) return [];
  if (Array.isArray(protocol.components)) return protocol.components;
  if (typeof protocol.components === "string") {
    try {
      const parsed = JSON.parse(protocol.components);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
};

const getPersistedInputReview = (protocol: any) => {
  return getProtocolComponents(protocol).find((component) => component?.type === "protocolInputReview")?.data || null;
};

const upsertProtocolInputReviewComponent = (
  components: any[],
  data: any,
  designStateId?: string
) => {
  const now = new Date().toISOString();
  const existing = components.find((component) => component?.type === "protocolInputReview");
  const nextComponent = {
    designStateId: existing?.designStateId || designStateId || "default",
    type: "protocolInputReview",
    data,
    createdAt: existing?.createdAt || now,
    updatedAt: now
  };

  return [
    ...components.filter((component) => component?.type !== "protocolInputReview"),
    nextComponent
  ];
};

const hasMeaningfulContent = (value: any): boolean => {
  const parsed = parseMaybeJson(value);
  if (!parsed) return false;
  if (typeof parsed === "string") return parsed.trim().length > 0;
  if (Array.isArray(parsed)) return parsed.length > 0;
  if (typeof parsed === "object") return Object.keys(parsed).length > 0;
  return Boolean(parsed);
};

const getSectionCurrentDataForReview = (protocol: any, sectionKey: string) => {
  switch (sectionKey) {
    case "schedule":
      return {
        tableHeaders: protocol.tableHeaders,
        tableData: protocol.tableData,
        soaProvenance: protocol.soaProvenance,
      };
    case "criteria":
      return {
        inclusionCriteria: protocol.inclusionCriteria,
        exclusionCriteria: protocol.exclusionCriteria,
      };
    case "variables":
      return { dataVariables: protocol.dataVariables };
    case "studySchema":
      return { studySchema: protocol.studySchema };
    case "safetyDrugHandling":
      return { safetyDrugHandling: protocol.safetyDrugHandling };
    case "analysisplan":
      return { statisticalAnalysisPlan: protocol.statisticalAnalysisPlan };
    default:
      return {};
  }
};

const getSectionHasContent = (protocol: any, sectionKey: string): boolean => {
  switch (sectionKey) {
    case "schedule":
      return hasMeaningfulContent(protocol.tableHeaders) || hasMeaningfulContent(protocol.tableData);
    case "criteria":
      return hasMeaningfulContent(protocol.inclusionCriteria) || hasMeaningfulContent(protocol.exclusionCriteria);
    case "variables":
      return hasMeaningfulContent(protocol.dataVariables);
    case "studySchema":
      return hasMeaningfulContent(protocol.studySchema);
    case "safetyDrugHandling":
      return hasMeaningfulContent(protocol.safetyDrugHandling);
    case "analysisplan":
      return hasMeaningfulContent(protocol.statisticalAnalysisPlan);
    default:
      return false;
  }
};

const getSectionReferencesForReview = (items: any[], sectionKey: string, sectionName: string) => {
  const key = sectionKey.toLowerCase();
  const name = sectionName.toLowerCase();
  return items.filter((item) => {
    const context = String(item?.context || "").toLowerCase();
    return context.includes(`scope: ${key}`) || context.includes(`scope: ${name}`);
  });
};

const buildSectionReviewSignature = (protocol: any, sectionKey: string, sectionName: string) => {
  const supplementaryItems = parseStoredArray(protocol.supplementaryInfo);
  const sectionReferences = getSectionReferencesForReview(supplementaryItems, sectionKey, sectionName);
  return JSON.stringify({
    protocolId: protocol.id,
    sectionKey,
    sectionName,
    synopsis: protocol.synopsis || "",
    protocolType: protocol.protocolType || "",
    currentSectionData: stripLargeSourceArtifacts(getSectionCurrentDataForReview(protocol, sectionKey)),
    sectionReferences: sectionReferences.map((item) => ({
      id: item.id,
      text: stripLargeSourceArtifacts(item.text),
      fileName: item.fileName,
      context: item.context,
    })),
  });
};

const collectTabReadinessFromCache = (protocol: any): ProtocolTabReadiness[] => {
  if (typeof window === "undefined") {
    return tabReviewConfigs.map((config) => ({
      ...config,
      status: "not_reviewed",
      hasContent: getSectionHasContent(protocol, config.sectionKey)
    }));
  }

  return tabReviewConfigs.map((config) => {
    const base = {
      ...config,
      hasContent: getSectionHasContent(protocol, config.sectionKey)
    };
    try {
      const cacheKey = `protocol-${protocol.id}-section-review-${config.sectionKey}-v1`;
      const cached = localStorage.getItem(cacheKey);
      if (!cached) {
        return { ...base, status: "not_reviewed" as const };
      }

      const parsed = JSON.parse(cached);
      const status = parsed.signature === buildSectionReviewSignature(protocol, config.sectionKey, config.sectionName)
        ? "current"
        : "stale";
      const review = parsed.review || {};
      return {
        ...base,
        status,
        recommendedMode: review.recommendedMode,
        sourceStatus: review.sourceStatus,
        summary: review.summary,
        sourceEvidence: Array.isArray(review.sourceEvidence) ? review.sourceEvidence : [],
        improvements: Array.isArray(review.improvements) ? review.improvements : [],
        missingItems: Array.isArray(review.missingItems) ? review.missingItems : [],
        risks: Array.isArray(review.risks) ? review.risks : [],
        rationale: review.rationale
      };
    } catch (error) {
      console.error("Error loading section readiness:", error);
      return { ...base, status: "not_reviewed" as const };
    }
  });
};

// Common section types that apply to all protocol types
const commonProtocolSections = [
  { id: "title", title: "Study Title and Protocol ID", required: true, generationStatus: "pending" as GenerationStatus },
  { id: "synopsis", title: "Protocol Synopsis", required: true, generationStatus: "pending" as GenerationStatus },
  { id: "objectives", title: "Study Objectives", required: true, generationStatus: "pending" as GenerationStatus },
  { id: "design", title: "Study Design", required: true, generationStatus: "pending" as GenerationStatus },
  { id: "population", title: "Study Population", required: true, generationStatus: "pending" as GenerationStatus },
  { id: "ethical", title: "Ethical Considerations", required: true, generationStatus: "pending" as GenerationStatus },
  { id: "administrative", title: "Administrative Aspects", required: false, generationStatus: "pending" as GenerationStatus }
];

// Sections specific to interventional clinical trials
const interventionalTrialSections = [
  { id: "introduction", title: "2 Introduction", required: true, generationStatus: "pending" as GenerationStatus },
  { id: "treatments", title: "6 Trial Intervention and Concomitant Therapy", required: true, generationStatus: "pending" as GenerationStatus },
  { id: "discontinuation", title: "7 Trial Intervention and Participant Discontinuation", required: true, generationStatus: "pending" as GenerationStatus },
  { id: "assessments", title: "8 Trial Assessments and Procedures", required: true, generationStatus: "pending" as GenerationStatus },
  { id: "safety", title: "9 Safety Reporting and Product Complaints", required: true, generationStatus: "pending" as GenerationStatus },
  { id: "statistics", title: "10 Statistical Considerations", required: true, generationStatus: "pending" as GenerationStatus },
  { id: "ethical", title: "11 Trial Oversight and Other General Considerations", required: true, generationStatus: "pending" as GenerationStatus },
  { id: "administrative", title: "12 Administrative and Reference Appendices", required: false, generationStatus: "pending" as GenerationStatus }
];

const m11InterventionalProtocolSections = [
  { id: "title", title: "Title Page and Protocol Identifiers", required: true, generationStatus: "pending" as GenerationStatus },
  { id: "synopsis", title: "1 Protocol Summary", required: true, generationStatus: "pending" as GenerationStatus },
  { id: "trial_schema", title: "1.2 Trial Schema", required: true, generationStatus: "pending" as GenerationStatus },
  { id: "schedule", title: "1.3 Schedule of Activities", required: true, generationStatus: "pending" as GenerationStatus },
  { id: "introduction", title: "2 Introduction", required: true, generationStatus: "pending" as GenerationStatus },
  { id: "objectives", title: "3 Trial Objectives and Associated Estimands", required: true, generationStatus: "pending" as GenerationStatus },
  { id: "design", title: "4 Trial Design", required: true, generationStatus: "pending" as GenerationStatus },
  { id: "population", title: "5 Trial Population", required: true, generationStatus: "pending" as GenerationStatus },
  { id: "treatments", title: "6 Trial Intervention and Concomitant Therapy", required: true, generationStatus: "pending" as GenerationStatus },
  { id: "discontinuation", title: "7 Trial Intervention and Participant Discontinuation", required: true, generationStatus: "pending" as GenerationStatus },
  { id: "assessments", title: "8 Trial Assessments and Procedures", required: true, generationStatus: "pending" as GenerationStatus },
  { id: "safety", title: "9 Safety Reporting and Product Complaints", required: true, generationStatus: "pending" as GenerationStatus },
  { id: "statistics", title: "10 Statistical Considerations", required: true, generationStatus: "pending" as GenerationStatus },
  { id: "ethical", title: "11 Trial Oversight and Other General Considerations", required: true, generationStatus: "pending" as GenerationStatus },
  { id: "administrative", title: "12 Administrative and Reference Appendices", required: false, generationStatus: "pending" as GenerationStatus }
];

const isGeneratedScheduleSection = (section: { id?: string; title?: string }) =>
  section.id === "schedule" ||
  section.id === "schedule_of_activities" ||
  /^1\.3\s+Schedule of Activities/i.test(String(section.title || "")) ||
  /^Schedule of Activities$/i.test(String(section.title || ""));

const stripEmbeddedScheduleBlocksFromGenerated = (content: string, section: { id?: string; title?: string }) => {
  if (!content || isGeneratedScheduleSection(section)) return content;
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
  cleaned = cleaned.replace(/\n{0,2}#{1,6}\s*Source Review Notes[\s\S]*?(?=\n{2,}#{1,6}\s+|\n{2,}> Generation note:|$)/gi, "\n\n");
  cleaned = cleaned.replace(/\n{0,2}>?\s*Generation note:[\s\S]*?(?=\n{2,}#{1,6}\s+|$)/gi, "\n\n");
  return cleaned.replace(/\n{3,}/g, "\n\n").trim();
};

// Sections specific to secondary data analysis studies
const secondaryDataSections = [
  { id: "data_source", title: "Data Source", required: true, generationStatus: "pending" as GenerationStatus },
  { id: "variable_definitions", title: "Variable Definitions", required: true, generationStatus: "pending" as GenerationStatus },
  { id: "data_management", title: "Data Management", required: true, generationStatus: "pending" as GenerationStatus },
  { id: "quality_control", title: "Quality Control", required: true, generationStatus: "pending" as GenerationStatus },
  { id: "statistics", title: "Statistical Considerations", required: true, generationStatus: "pending" as GenerationStatus },
  { id: "limitations", title: "Limitations and Bias", required: true, generationStatus: "pending" as GenerationStatus }
];

// Sections specific to observational/cohort studies
const observationalStudySections = [
  { id: "schedule", title: "Schedule of Activities", required: true, generationStatus: "pending" as GenerationStatus },
  { id: "exposure_assessment", title: "Exposure Assessment", required: true, generationStatus: "pending" as GenerationStatus },
  { id: "outcome_assessment", title: "Outcome Assessment", required: true, generationStatus: "pending" as GenerationStatus },
  { id: "data_collection", title: "Data Collection Methods", required: true, generationStatus: "pending" as GenerationStatus },
  { id: "follow_up", title: "Follow-up Procedures", required: true, generationStatus: "pending" as GenerationStatus },
  { id: "statistics", title: "Statistical Considerations", required: true, generationStatus: "pending" as GenerationStatus },
  { id: "bias_management", title: "Bias Management", required: true, generationStatus: "pending" as GenerationStatus }
];

// Sections specific to Delphi consensus studies
const delphiConsensusSections = [
  { id: "expert_panel", title: "Expert Panel", required: true, generationStatus: "pending" as GenerationStatus },
  { id: "consensus_methodology", title: "Consensus Methodology", required: true, generationStatus: "pending" as GenerationStatus },
  { id: "statement_development", title: "Statement Development", required: true, generationStatus: "pending" as GenerationStatus },
  { id: "round_procedures", title: "Round Procedures", required: true, generationStatus: "pending" as GenerationStatus },
  { id: "data_analysis", title: "Data Analysis", required: true, generationStatus: "pending" as GenerationStatus },
  { id: "dissemination", title: "Dissemination Plan", required: false, generationStatus: "pending" as GenerationStatus }
];

// Sections specific to cross-sectional surveys
const crossSectionalSurveySections = [
  { id: "sampling_strategy", title: "Sampling Strategy", required: true, generationStatus: "pending" as GenerationStatus },
  { id: "survey_instrument", title: "Survey Instrument", required: true, generationStatus: "pending" as GenerationStatus },
  { id: "data_collection", title: "Data Collection", required: true, generationStatus: "pending" as GenerationStatus },
  { id: "statistics", title: "Statistical Considerations", required: true, generationStatus: "pending" as GenerationStatus },
  { id: "quality_control", title: "Quality Control", required: true, generationStatus: "pending" as GenerationStatus }
];

// Sections specific to MAIC (Matching-Adjusted Indirect Comparison) studies
const maicSections = [
  { id: "source_data", title: "Source Data Configuration", required: true, generationStatus: "pending" as GenerationStatus },
  { id: "target_study", title: "Target Study Extraction", required: true, generationStatus: "pending" as GenerationStatus },
  { id: "matching_algorithm", title: "Matching Algorithm", required: true, generationStatus: "pending" as GenerationStatus },
  { id: "sensitivity_analysis", title: "Sensitivity Analysis", required: true, generationStatus: "pending" as GenerationStatus },
  { id: "effect_estimation", title: "Effect Size Estimation", required: true, generationStatus: "pending" as GenerationStatus },
  { id: "limitations", title: "Limitations and Assumptions", required: true, generationStatus: "pending" as GenerationStatus },
  { id: "statistics", title: "Statistical Considerations", required: true, generationStatus: "pending" as GenerationStatus }
];

// Function to get the appropriate protocol sections based on protocol type
const getProtocolSectionsByType = (protocolType: string) => {
  switch (protocolType) {
    case 'interventional_clinical_trial':
      return m11InterventionalProtocolSections;
    case 'secondary_data_analysis':
      return [...commonProtocolSections, ...secondaryDataSections];
    case 'retrospective_cohort_study':
    case 'prospective_cohort_study':
      return [...commonProtocolSections, ...observationalStudySections];
    case 'delphi_consensus':
      return [...commonProtocolSections, ...delphiConsensusSections];
    case 'cross_sectional_survey':
      return [...commonProtocolSections, ...crossSectionalSurveySections];
    case 'maic':
      return [...commonProtocolSections, ...maicSections];
    default:
      // Default to interventional for unrecognized types
      return [...commonProtocolSections, ...interventionalTrialSections];
  }
};

// Default protocol sections - uses interventional as default
const defaultProtocolSections = [...commonProtocolSections, 
  { id: "procedures", title: "Study Procedures", required: true, generationStatus: "pending" as GenerationStatus },
  { id: "assessments", title: "Study Assessments", required: true, generationStatus: "pending" as GenerationStatus },
  { id: "statistics", title: "Statistical Considerations", required: true, generationStatus: "pending" as GenerationStatus }
];

const jsonStringForProtocolSave = (value: any, fallback: any) => {
  const source = value == null || value === "" ? fallback : value;
  if (typeof source === "string") return source;
  try {
    return JSON.stringify(source);
  } catch {
    return JSON.stringify(fallback);
  }
};

const buildGeneratedProtocolSavePayload = (protocol: Protocol, generatedProtocolJson: string) => ({
  id: protocol.id,
  title: protocol.title || protocol.id || "Untitled Protocol",
  phase: protocol.phase || "Not specified",
  indication: protocol.indication || "Not specified",
  status: protocol.status || "Draft",
  protocolType: protocol.protocolType || "interventional_clinical_trial",
  synopsis: protocol.synopsis || "",
  supplementaryInfo: jsonStringForProtocolSave(protocol.supplementaryInfo, []),
  createdBy: protocol.createdBy || "User",
  userId: typeof protocol.userId === "number" ? protocol.userId : null,
  tableData: jsonStringForProtocolSave(protocol.tableData, {}),
  tableHeaders: jsonStringForProtocolSave(protocol.tableHeaders, []),
  inclusionCriteria: jsonStringForProtocolSave(protocol.inclusionCriteria, []),
  exclusionCriteria: jsonStringForProtocolSave(protocol.exclusionCriteria, []),
  dataVariables: jsonStringForProtocolSave(protocol.dataVariables, []),
  studySchema: jsonStringForProtocolSave(protocol.studySchema, { nodes: [], edges: [] }),
  statisticalAnalysisPlan: jsonStringForProtocolSave(protocol.statisticalAnalysisPlan, {
    sampleSize: { total: 0, perArm: 0, justification: "" },
    primaryEndpoints: [],
    secondaryEndpoints: [],
    analysisPopulations: [],
    statisticalMethods: []
  }),
  overview: protocol.overview || null,
  designStates: Array.isArray(protocol.designStates) ? protocol.designStates : [],
  activeDesignState: protocol.activeDesignState || null,
  components: Array.isArray(protocol.components) ? protocol.components : [],
  generatedProtocol: generatedProtocolJson
});

export function GenerateProtocol({ protocol, setProtocol, activeDesignState }: GenerateProtocolProps) {
  const { toast } = useToast();

  // Initialize alignment data from localStorage or default values
  const defaultAlignmentState = {
    studyObjectives: { 
      status: "unknown" as AlignmentStatus, 
      details: "Protocol alignment has not been checked yet." 
    },
    scheduleOfAssessments: { 
      status: "unknown" as AlignmentStatus, 
      details: "Protocol alignment has not been checked yet." 
    },
    inclusionExclusionCriteria: { 
      status: "unknown" as AlignmentStatus, 
      details: "Protocol alignment has not been checked yet." 
    },
    dataVariables: { 
      status: "unknown" as AlignmentStatus, 
      details: "Protocol alignment has not been checked yet." 
    },
    studySchema: {
      status: "unknown" as AlignmentStatus,
      details: "Protocol alignment has not been checked yet."
    },
    statisticalAnalysisPlan: {
      status: "unknown" as AlignmentStatus,
      details: "Protocol alignment has not been checked yet."
    }
  };
  
  // Get stored alignment from localStorage
  const getCachedAlignment = () => {
    try {
      const alignmentKey = `protocol-${protocol.id}-alignment`;
      const cachedAlignment = localStorage.getItem(alignmentKey);
      
      if (cachedAlignment) {
        return JSON.parse(cachedAlignment);
      }
      
      return defaultAlignmentState;
    } catch (error) {
      console.error("Error parsing cached alignment:", error);
      return defaultAlignmentState;
    }
  };
  
  // Protocol alignment state
  const [alignment, setAlignment] = useState(getCachedAlignment());

  // Get cached recommendations from localStorage
  const getCachedRecommendations = () => {
    try {
      const recommendationsKey = `protocol-${protocol.id}-recommendations`;
      const cachedRecommendations = localStorage.getItem(recommendationsKey);
      
      if (cachedRecommendations) {
        return JSON.parse(cachedRecommendations);
      }
      
      return [];
    } catch (error) {
      console.error("Error parsing cached recommendations:", error);
      return [];
    }
  };
  
  // Recommendations state
  const [recommendations, setRecommendations] = useState<Array<{
    id: string;
    title: string;
    description: string;
  }>>(getCachedRecommendations());

  // UI state
  const [checking, setChecking] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [generationComplete, setGenerationComplete] = useState(false);
  const [additionalInstructions, setAdditionalInstructions] = useState("");
  const [showGeneratedProtocol, setShowGeneratedProtocol] = useState(false);
  const [generationProgress, setGenerationProgress] = useState(0);
  const [showInputReview, setShowInputReview] = useState(false);
  const [reviewingInputs, setReviewingInputs] = useState(false);
  const [reviewStartedAt, setReviewStartedAt] = useState<number | null>(null);
  const [reviewElapsedSeconds, setReviewElapsedSeconds] = useState(0);
  const [inputReviewSummary, setInputReviewSummary] = useState("");
  const [inputReviewItems, setInputReviewItems] = useState<ProtocolInputReviewItem[]>([]);
  const [inputReviewTabReadiness, setInputReviewTabReadiness] = useState<ProtocolTabReadiness[]>([]);
  const [reviewCacheLoaded, setReviewCacheLoaded] = useState(false);
  const [reviewClassFilter, setReviewClassFilter] = useState<ReviewClassification | "all">("all");
  const [reviewSectionFilter, setReviewSectionFilter] = useState<string>("all");
  const [inputReviewAppliedSignature, setInputReviewAppliedSignature] = useState("");
  const [generateAfterReview, setGenerateAfterReview] = useState(false);
  const [tabReadinessRefreshToken, setTabReadinessRefreshToken] = useState(0);
  const [inputReviewError, setInputReviewError] = useState("");
  const acceptedReviewItems = inputReviewItems.filter(item => item.decision !== "reject");
  const reviewSections = Array.from(new Set(inputReviewItems.map(item => item.section))).sort();
  const filteredReviewItems = inputReviewItems.filter(item => {
    const matchesClass = reviewClassFilter === "all" || item.classification === reviewClassFilter;
    const matchesSection = reviewSectionFilter === "all" || item.section === reviewSectionFilter;
    return matchesClass && matchesSection;
  });
  const getReviewTextRows = (text: string) => {
    const lineCount = text.split("\n").length;
    const wrappedLineCount = Math.ceil(text.length / 78);
    return Math.max(5, Math.min(40, lineCount + wrappedLineCount));
  };
  const getReviewFinalTextForDecision = (item: ProtocolInputReviewItem, decision: ReviewDecision) => {
    if (decision === "source") return item.sourceText || "";
    if (decision === "accept") return item.proposedText || item.finalText || item.sourceText || "";
    if (decision === "placeholder") return item.proposedText || item.finalText || item.sourceText || "";
    if (decision === "edit") return item.finalText || item.proposedText || item.sourceText || "";
    return item.finalText || item.proposedText || item.sourceText || "";
  };
  const getReviewOriginLabel = (item: ProtocolInputReviewItem): "AI Generated" | "AI Improved" | null => {
    if (item.decision === "reject" || item.decision === "source" || item.classification === "use_as_is") return null;
    if (item.classification === "improve") return "AI Improved";
    if (item.classification === "add" || item.classification === "placeholder" || item.classification === "needs_user_input") return "AI Generated";
    return null;
  };
  const buildInputReviewRecord = (
    items: ProtocolInputReviewItem[] = inputReviewItems,
    appliedSignature: string = inputReviewAppliedSignature,
    summary: string = inputReviewSummary,
    tabReadiness: ProtocolTabReadiness[] = inputReviewTabReadiness
  ) => ({
    version: INPUT_REVIEW_CACHE_VERSION,
    signature: inputReviewSignature,
    appliedSignature,
    summary,
    items,
    tabReadiness,
    acceptedItems: items.filter(item => item.decision !== "reject"),
    selectedSections: selectedSections.map(section => ({
      id: section.id,
      title: section.title
    })),
    additionalInstructions,
    updatedAt: new Date().toISOString()
  });
  const saveInputReviewLocalCache = (record: ReturnType<typeof buildInputReviewRecord>) => {
    try {
      localStorage.setItem(inputReviewCacheKey, JSON.stringify(stripLargeSourceArtifacts(record)));
      if (record.appliedSignature) {
        localStorage.setItem(inputReviewAppliedKey, record.appliedSignature);
      } else {
        localStorage.removeItem(inputReviewAppliedKey);
      }
    } catch (error) {
      console.error("Error saving input review cache:", error);
    }
  };
  const syncProtocolInputReviewComponent = (record: ReturnType<typeof buildInputReviewRecord>) => {
    setProtocol(prev => ({
      ...(prev as any),
      components: upsertProtocolInputReviewComponent(
        getProtocolComponents(prev),
        record,
        activeDesignState?.id
      )
    } as any));
  };
  const persistInputReviewRecord = async (record: ReturnType<typeof buildInputReviewRecord>) => {
    const updatedComponents = upsertProtocolInputReviewComponent(
      getProtocolComponents(protocol),
      record,
      activeDesignState?.id
    );

    setProtocol(prev => ({
      ...(prev as any),
      components: upsertProtocolInputReviewComponent(
        getProtocolComponents(prev),
        record,
        activeDesignState?.id
      )
    } as any));

    await apiRequest(`/api/protocols/${protocol.id}`, "PUT", {
      components: updatedComponents
    });
  };
  
  // Get the appropriate protocol sections based on protocol type
  const initialProtocolSections = useMemo(() => {
    return getProtocolSectionsByType(protocol.protocolType || 'interventional_clinical_trial');
  }, [protocol.protocolType]);
  
  // Protocol section management
  const [protocolSections, setProtocolSections] = useState<Array<{
    id: string;
    title: string;
    required: boolean;
    content?: string;
    generationStatus: GenerationStatus;
    generationMessage?: string;
    boilerplateText?: BoilerplateText;
  }>>(initialProtocolSections);
  
  const [selectedSections, setSelectedSections] = useState<Array<{
    id: string;
    title: string;
  }>>(initialProtocolSections.filter(section => section.required).map(section => ({
    id: section.id,
    title: section.title
  })));
  const latestTabReadiness = useMemo(() => {
    return collectTabReadinessFromCache(protocol);
  }, [protocol, tabReadinessRefreshToken]);
  const inputReviewCacheKey = `protocol-${protocol.id}-input-review-v${INPUT_REVIEW_CACHE_VERSION}`;
  const protocolForReview = useMemo(() => sanitizeProtocolForReview(protocol), [protocol]);
  const inputReviewSignature = JSON.stringify({
    protocolId: protocolForReview.id,
    protocolType: protocolForReview.protocolType,
    title: protocolForReview.title || "",
    synopsis: protocolForReview.synopsis || "",
    tableHeaders: protocolForReview.tableHeaders || "",
    tableData: protocolForReview.tableData || "",
    inclusionCriteria: protocolForReview.inclusionCriteria || "",
    exclusionCriteria: protocolForReview.exclusionCriteria || "",
    dataVariables: protocolForReview.dataVariables || "",
    studySchema: protocolForReview.studySchema || "",
    safetyDrugHandling: (protocolForReview as any).safetyDrugHandling || "",
    statisticalAnalysisPlan: (protocolForReview as any).statisticalAnalysisPlan || "",
    additionalInstructions,
    selectedSections: selectedSections.map(section => section.id)
  });
  const inputReviewAppliedKey = `${inputReviewCacheKey}-applied`;
  const inputReviewIsCurrent = reviewCacheLoaded && inputReviewItems.length > 0 && inputReviewAppliedSignature === inputReviewSignature;
  const inputReviewHasUnappliedDecisions = reviewCacheLoaded && inputReviewItems.length > 0 && !inputReviewAppliedSignature;
  const inputReviewNeedsUpdate = reviewCacheLoaded && inputReviewItems.length > 0 && Boolean(inputReviewAppliedSignature) && inputReviewAppliedSignature !== inputReviewSignature;
  const inputReviewStatusLabel = inputReviewIsCurrent
    ? "Reviewed"
    : inputReviewHasUnappliedDecisions
      ? "Apply Review"
      : inputReviewNeedsUpdate
      ? "Review Needs Update"
      : "Review Required";
  
  const [showAddSection, setShowAddSection] = useState(false);
  const [newSectionTitle, setNewSectionTitle] = useState("");
  const [sectionsExpanded, setSectionsExpanded] = useState(true);
  const [editingSectionId, setEditingSectionId] = useState<string | null>(null);
  const [showBoilerplateSelector, setShowBoilerplateSelector] = useState(false);
  const [currentSectionForBoilerplate, setCurrentSectionForBoilerplate] = useState<{id: string, title: string} | null>(null);
  
  // Effect to update protocol sections when protocol type changes
  useEffect(() => {
    // Get the appropriate sections for this protocol type
    const typeSections = getProtocolSectionsByType(protocol.protocolType || 'interventional_clinical_trial');
    
    // Update protocol sections while preserving any generated content
    setProtocolSections(prevSections => {
      // Create a map of previous sections by ID for quick lookup
      const prevSectionMap = new Map(
        prevSections.map(section => [section.id, section])
      );
      
      // Create new sections array, preserving content from existing sections
      return typeSections.map(section => {
        const existingSection = prevSectionMap.get(section.id);
        if (existingSection) {
          // Keep existing content and status if section already exists
          return {
            ...section,
            content: existingSection.content,
            generationStatus: existingSection.generationStatus,
            generationMessage: existingSection.generationMessage
          };
        }
        return section;
      });
    });
    
    // Update selected sections as well
    setSelectedSections(typeSections
      .filter(section => section.required)
      .map(section => ({
        id: section.id,
        title: section.title
      }))
    );
  }, [protocol.protocolType]);

  useEffect(() => {
    if (generating) return;

    const storedGenerated = parseMaybeJson(protocol.generatedProtocol);
    const generatedSections = Array.isArray(storedGenerated) ? storedGenerated : [];

    if (!generatedSections.length) {
      setGenerationComplete(false);
      setGenerationProgress(0);
      setProtocolSections(prevSections => prevSections.map(section => ({
        ...section,
        content: undefined,
        generationStatus: "pending",
        generationMessage: undefined
      })));
      return;
    }

    const generatedById = new Map(
      generatedSections
        .filter((section: any) => section?.id)
        .map((section: any) => [section.id, section])
    );

    setProtocolSections(prevSections => prevSections.map(section => {
      const generatedSection = generatedById.get(section.id) as any;
      if (!generatedSection) return section;
      return {
        ...section,
        content: generatedSection.content || section.content,
        generationStatus: "complete",
        generationMessage: "Loaded from saved protocol"
      };
    }));

    setGenerationProgress(100);
    setGenerationComplete(true);
  }, [protocol.id, protocol.generatedProtocol, generating]);

  useEffect(() => {
    const applyStoredReview = (storedReview: any, mirrorToLocalStorage = false) => {
      setInputReviewItems(storedReview.items);
      setInputReviewSummary(storedReview.summary || "");
      setInputReviewTabReadiness(Array.isArray(storedReview.tabReadiness) ? storedReview.tabReadiness : latestTabReadiness);
      setInputReviewAppliedSignature(storedReview.appliedSignature || "");

      if (mirrorToLocalStorage) {
        try {
          localStorage.setItem(inputReviewCacheKey, JSON.stringify(stripLargeSourceArtifacts(storedReview)));
          if (storedReview.appliedSignature) {
            localStorage.setItem(inputReviewAppliedKey, storedReview.appliedSignature);
          } else {
            localStorage.removeItem(inputReviewAppliedKey);
          }
        } catch (cacheError) {
          console.warn("Skipping protocol input review local cache mirror:", cacheError);
        }
      }
    };

    const clearStoredReview = () => {
      setInputReviewItems([]);
      setInputReviewSummary("");
      setInputReviewTabReadiness([]);
      setInputReviewAppliedSignature("");
    };

    try {
      const cached = localStorage.getItem(inputReviewCacheKey);
      if (cached) {
        const parsed = JSON.parse(cached);
        if (parsed.signature === inputReviewSignature && Array.isArray(parsed.items)) {
          applyStoredReview({
            ...parsed,
            appliedSignature: parsed.appliedSignature || localStorage.getItem(inputReviewAppliedKey) || ""
          });
          setReviewCacheLoaded(true);
          return;
        }
      }

      const persistedReview = getPersistedInputReview(protocol);
      if (
        persistedReview?.signature === inputReviewSignature &&
        Array.isArray(persistedReview.items)
      ) {
        applyStoredReview(persistedReview, true);
        setReviewCacheLoaded(true);
        return;
      }

      clearStoredReview();
    } catch (error) {
      console.error("Error loading protocol input review:", error);
      clearStoredReview();
    } finally {
      setReviewCacheLoaded(true);
    }
  }, [inputReviewCacheKey, inputReviewAppliedKey, inputReviewSignature, latestTabReadiness, protocol]);

  useEffect(() => {
    if (!reviewingInputs || !reviewStartedAt) {
      setReviewElapsedSeconds(0);
      return;
    }

    const intervalId = window.setInterval(() => {
      setReviewElapsedSeconds(Math.floor((Date.now() - reviewStartedAt) / 1000));
    }, 1000);

    return () => window.clearInterval(intervalId);
  }, [reviewingInputs, reviewStartedAt]);

  // Update section statuses for the progress indicator
  const sectionStatuses = protocolSections
    .filter(section => selectedSections.some(s => s.id === section.id))
    .map(section => ({
      name: section.title,
      status: section.generationStatus,
      message: section.generationMessage
    }));

  // Run alignment check
  const checkAlignment = async () => {
    setChecking(true);
    
    try {
      // Parse JSON strings from protocol data
      const parseJSON = (json: string | any[] | null | undefined) => {
        if (!json) return null;
        if (Array.isArray(json)) return json;
        try {
          return typeof json === 'string' ? JSON.parse(json) : json;
        } catch (error) {
          console.error("Error parsing JSON:", error);
          return null;
        }
      };
      
      // Call the API to analyze protocol alignment
      // Extract and parse the data for alignment analysis
      const alignmentData = {
        synopsis: protocol.synopsis,
        tableHeaders: parseJSON(protocol.tableHeaders),
        tableData: parseJSON(protocol.tableData),
        inclusionCriteria: parseJSON(protocol.inclusionCriteria),
        exclusionCriteria: parseJSON(protocol.exclusionCriteria),
        dataVariables: parseJSON(protocol.dataVariables),
        schema: parseJSON(protocol.studySchema),
        analysisPlan: parseJSON(protocol.statisticalAnalysisPlan)
      };
      
      console.log("Sending alignment data:", alignmentData);
      
      const result = await apiRequest(
        '/api/analyze-protocol-alignment',
        'POST',
        alignmentData
      );
      
      if (result) {
        // Map OpenAI alignment statuses to UI alignment statuses
        const mapAlignmentStatus = (status: string): AlignmentStatus => {
          switch (status) {
            case "aligned": return "aligned";
            case "partially-aligned": return "partial";
            case "not-aligned": return "misaligned";
            default: return "unknown";
          }
        };
        
        // Create new alignment state from the API response
        const newAlignmentState = {
          studyObjectives: { 
            status: mapAlignmentStatus(result.alignmentAnalysis?.studyObjectives?.status || ""), 
            details: result.alignmentAnalysis?.studyObjectives?.details || "Could not determine alignment." 
          },
          scheduleOfAssessments: { 
            status: mapAlignmentStatus(result.alignmentAnalysis?.scheduleOfAssessments?.status || ""), 
            details: result.alignmentAnalysis?.scheduleOfAssessments?.details || "Could not determine alignment." 
          },
          inclusionExclusionCriteria: { 
            status: mapAlignmentStatus(result.alignmentAnalysis?.inclusionExclusionCriteria?.status || ""), 
            details: result.alignmentAnalysis?.inclusionExclusionCriteria?.details || "Could not determine alignment." 
          },
          dataVariables: { 
            status: mapAlignmentStatus(result.alignmentAnalysis?.dataVariables?.status || ""), 
            details: result.alignmentAnalysis?.dataVariables?.details || "Could not determine alignment." 
          },
          studySchema: {
            status: mapAlignmentStatus(result.alignmentAnalysis?.studySchema?.status || ""),
            details: result.alignmentAnalysis?.studySchema?.details || "Could not determine alignment."
          },
          statisticalAnalysisPlan: {
            status: mapAlignmentStatus(result.alignmentAnalysis?.statisticalAnalysisPlan?.status || ""),
            details: result.alignmentAnalysis?.statisticalAnalysisPlan?.details || "Could not determine alignment."
          }
        };
        
        // Update alignment state
        setAlignment(newAlignmentState);
        
        // Store in localStorage for persistence across tabs
        try {
          const alignmentKey = `protocol-${protocol.id}-alignment`;
          localStorage.setItem(alignmentKey, JSON.stringify(newAlignmentState));
          console.log("Saved alignment data to localStorage");
        } catch (error) {
          console.error("Error saving alignment to localStorage:", error);
        }
        
        // Update recommendations if available
        if (result.recommendations && Array.isArray(result.recommendations)) {
          const newRecommendations = result.recommendations.map((rec: any, index: number) => ({
            id: `rec-${index+1}`,
            title: rec.title || "Recommendation",
            description: rec.description || ""
          }));
          
          // Update state
          setRecommendations(newRecommendations);
          
          // Save to localStorage
          try {
            const recommendationsKey = `protocol-${protocol.id}-recommendations`;
            localStorage.setItem(recommendationsKey, JSON.stringify(newRecommendations));
            console.log("Saved recommendations to localStorage");
          } catch (error) {
            console.error("Error saving recommendations to localStorage:", error);
          }
        }
        
        toast({
          title: "Alignment Check Complete",
          description: "Protocol alignment has been analyzed.",
          variant: "default"
        });
      } else {
        throw new Error("Invalid response from alignment check API");
      }
    } catch (error) {
      console.error("Error checking alignment:", error);
      toast({
        title: "Alignment Check Failed", 
        description: "There was an error checking protocol alignment.",
        variant: "destructive"
      });
      
      // Reset to unknown state with error message
      const errorState = {
        studyObjectives: { 
          status: "unknown" as AlignmentStatus, 
          details: "Protocol alignment check failed." 
        },
        scheduleOfAssessments: { 
          status: "unknown" as AlignmentStatus, 
          details: "Protocol alignment check failed." 
        },
        inclusionExclusionCriteria: { 
          status: "unknown" as AlignmentStatus, 
          details: "Protocol alignment check failed." 
        },
        dataVariables: { 
          status: "unknown" as AlignmentStatus, 
          details: "Protocol alignment check failed." 
        },
        studySchema: {
          status: "unknown" as AlignmentStatus,
          details: "Protocol alignment check failed."
        },
        statisticalAnalysisPlan: {
          status: "unknown" as AlignmentStatus,
          details: "Protocol alignment check failed."
        }
      };
      
      // Update state
      setAlignment(errorState);
      
      // Also save error state to localStorage to ensure consistency
      try {
        const alignmentKey = `protocol-${protocol.id}-alignment`;
        localStorage.setItem(alignmentKey, JSON.stringify(errorState));
      } catch (err) {
        console.error("Error saving error state to localStorage:", err);
      }
      
      // Clear recommendations from state and localStorage
      setRecommendations([]);
      
      // Remove recommendations from localStorage
      try {
        const recommendationsKey = `protocol-${protocol.id}-recommendations`;
        localStorage.removeItem(recommendationsKey);
      } catch (err) {
        console.error("Error removing recommendations from localStorage:", err);
      }
    } finally {
      setChecking(false);
    }
  };

  const reviewProtocolInputs = async () => {
    const tabReadinessForReview = collectTabReadinessFromCache(protocol);
    setTabReadinessRefreshToken(prev => prev + 1);
    setReviewingInputs(true);
    setReviewStartedAt(Date.now());
    setShowInputReview(true);
    setInputReviewItems([]);
    setInputReviewSummary("");
    setInputReviewTabReadiness(tabReadinessForReview);
    setInputReviewAppliedSignature("");
    setInputReviewError("");
    localStorage.removeItem(inputReviewAppliedKey);
    
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 90000);

    try {
      const result = await apiRequest(
        "/api/review-protocol-inputs",
        "POST",
        {
          protocol: protocolForReview,
          selectedSections,
          alignment,
          additionalInstructions,
          tabReadiness: tabReadinessForReview
        },
        { signal: controller.signal }
      );
      
      const items = Array.isArray(result.items) ? result.items : [];
      const tabReadiness = Array.isArray(result.tabReadiness)
        ? tabReadinessForReview.map((tab) => {
            const reviewed = result.tabReadiness.find((item: any) => item.sectionKey === tab.sectionKey);
            return reviewed ? { ...tab, ...reviewed } : tab;
          })
        : tabReadinessForReview;
      const summary = result.summary || "Protocol input review completed.";
      setInputReviewSummary(summary);
      setInputReviewItems(items);
      setInputReviewTabReadiness(tabReadiness);
      const record = buildInputReviewRecord(items, "", summary, tabReadiness);
      saveInputReviewLocalCache(record);
      await persistInputReviewRecord(record);
      
      toast({
        title: "Protocol Inputs Reviewed",
        description: `${items.length} source-use decisions are ready for review.`,
        variant: "default"
      });
      return true;
    } catch (error) {
      console.error("Error reviewing protocol inputs:", error);
      const isAbort = error instanceof DOMException && error.name === "AbortError";
      setInputReviewError(isAbort
        ? "The review took longer than expected and was stopped. Try again, or reduce selected sections and supplementary files."
        : "There was an error reviewing protocol inputs. Try again after checking the source content and connection."
      );
      toast({
        title: "Input Review Failed",
        description: isAbort ? "The review timed out before decisions were returned." : "There was an error reviewing protocol inputs.",
        variant: "destructive"
      });
      setGenerateAfterReview(false);
      return false;
    } finally {
      window.clearTimeout(timeout);
      setReviewingInputs(false);
      setReviewStartedAt(null);
    }
  };

  const openInputReview = () => {
    setTabReadinessRefreshToken(prev => prev + 1);
    setShowInputReview(true);
    if (reviewCacheLoaded && (inputReviewItems.length === 0 || inputReviewNeedsUpdate) && !reviewingInputs) {
      reviewProtocolInputs();
    }
  };

  const applyInputReviewDecisions = async () => {
    if (inputReviewItems.length === 0) {
      toast({
        title: "Review Required",
        description: "Run the protocol input review before applying decisions.",
        variant: "destructive"
      });
      return;
    }

    const record = buildInputReviewRecord(inputReviewItems, inputReviewSignature);
    setInputReviewAppliedSignature(inputReviewSignature);
    saveInputReviewLocalCache(record);
    setShowInputReview(false);

    try {
      await persistInputReviewRecord(record);
      toast({
        title: "Review Applied",
        description: "Protocol input decisions were saved and will be used for final generation.",
        variant: "default"
      });
    } catch (error) {
      console.error("Error saving protocol input review:", error);
      syncProtocolInputReviewComponent(record);
      toast({
        title: "Review Applied Locally",
        description: "The decisions are active in this browser, but saving them to the protocol failed.",
        variant: "destructive"
      });
    }

    if (generateAfterReview) {
      setGenerateAfterReview(false);
      generateProtocol();
    }
  };

  const updateReviewItem = (itemId: string, updates: Partial<ProtocolInputReviewItem>) => {
    setInputReviewAppliedSignature("");
    localStorage.removeItem(inputReviewAppliedKey);
    setInputReviewItems(prevItems => {
      const nextItems = prevItems.map(item => (
        item.id === itemId ? { ...item, ...updates } : item
      ));
      const record = buildInputReviewRecord(nextItems, "");
      saveInputReviewLocalCache(record);
      syncProtocolInputReviewComponent(record);
      return nextItems;
    });
  };

  const applyReviewDefaults = (decision: ReviewDecision, filter?: ReviewClassification) => {
    setInputReviewAppliedSignature("");
    localStorage.removeItem(inputReviewAppliedKey);
    setInputReviewItems(prevItems => {
      const nextItems = prevItems.map(item => {
        if (filter && item.classification !== filter) return item;
        const finalText = getReviewFinalTextForDecision(item, decision);
        return { ...item, decision, finalText };
      });
      const record = buildInputReviewRecord(nextItems, "");
      saveInputReviewLocalCache(record);
      syncProtocolInputReviewComponent(record);
      return nextItems;
    });
  };

  // Generate protocol document
  const generateProtocol = async () => {
    setGenerating(true);
    setGenerationProgress(0);
    setGenerationComplete(false);

    // Update all selected sections to "pending" status
    setProtocolSections(prevSections => {
      return prevSections.map(section => {
        if (selectedSections.some(s => s.id === section.id)) {
          return {
            ...section,
            generationStatus: "pending",
            generationMessage: undefined
          };
        }
        return section;
      });
    });

    // Calculate how much progress each section represents
    const progressPerSection = 100 / selectedSections.length;
    let completedSections = 0;
    
    // Generate each section in sequence
    const generatedSections: Array<{
      id: string;
      title: string;
      content: string;
      provenance?: any;
      traceability?: any;
    }> = [];
    
    for (const section of selectedSections) {
      // Update status to generating
      setProtocolSections(prevSections => {
        return prevSections.map(s => {
          if (s.id === section.id) {
            return {
              ...s,
              generationStatus: "generating",
              generationMessage: "AI is working on this section..."
            };
          }
          return s;
        });
      });
      
      try {
        // Context includes all previously generated sections
        const context = generatedSections.map(s => ({
          title: s.title,
          content: s.content
        }));
        
        // Get boilerplate text if any
        const sectionWithBoilerplate = protocolSections.find(s => s.id === section.id);
        const boilerplateText = sectionWithBoilerplate?.boilerplateText?.content || '';
        const sectionReviewItems = acceptedReviewItems.filter((item) => {
          const itemSection = String(item.section || "").toLowerCase();
          const currentId = String(section.id || "").toLowerCase();
          const currentTitle = String(section.title || "").toLowerCase();
          return itemSection === currentId ||
            currentTitle.includes(itemSection.replace(/_/g, " ")) ||
            itemSection === "global" ||
            (itemSection === "administrative" && ["title", "administrative"].includes(currentId));
        });
        const acceptedReviewMode = sectionReviewItems.some((item) => item.classification === "improve")
          ? "ai_improved"
          : sectionReviewItems.some((item) => item.classification === "add" || item.classification === "needs_user_input" || item.classification === "placeholder")
            ? "ai_generated"
            : sectionReviewItems.length > 0
              ? "source"
              : "ai_generated";
        
        // Call API to generate this section
        const result = await apiRequest(
          '/api/generate-document',
          'POST',
          {
            protocol: protocolForReview,
            sectionId: section.id,
            sectionTitle: section.title,
            additionalInstructions,
            previousSections: context,
            boilerplateText: boilerplateText,
            sourceReviewDecisions: acceptedReviewItems
          }
        );
        
        if (result.sections && result.sections.length > 0) {
          // Success - add to generated sections
          const generatedSection = {
            ...result.sections[0],
            content: stripEmbeddedScheduleBlocksFromGenerated(result.sections[0].content || "", section),
            provenance: {
              origin: acceptedReviewMode,
              sourceName: "Protocol input review",
              why: sectionReviewItems.length > 0
                ? "This section was generated using accepted protocol input review decisions."
                : "This section was generated from available protocol data and source context.",
            },
            traceability: {
              m11Template: "ICH M11 CeSHarP final template, 19 Nov 2025",
              generatedAt: new Date().toISOString(),
              boilerplateTitle: sectionWithBoilerplate?.boilerplateText?.title || "",
              boilerplateText,
              reviewItems: sectionReviewItems.map((item) => ({
                id: item.id,
                label: item.label,
                section: item.section,
                classification: item.classification,
                decision: item.decision,
                sourceText: item.sourceText,
                proposedText: item.proposedText,
                finalText: item.finalText,
                reason: item.reason,
                confidence: item.confidence,
              })),
            },
          };
          generatedSections.push(generatedSection);
          
          // Update section status to complete
          setProtocolSections(prevSections => {
            return prevSections.map(s => {
              if (s.id === section.id) {
                return {
                  ...s,
                  content: generatedSection.content,
                  generationStatus: "complete",
                  generationMessage: "Generation complete"
                };
              }
              return s;
            });
          });
        } else {
          throw new Error("No content was generated for this section");
        }
      } catch (error) {
        console.error(`Error generating section ${section.title}:`, error);
        
        // Update section status to error
        setProtocolSections(prevSections => {
          return prevSections.map(s => {
            if (s.id === section.id) {
              return {
                ...s,
                generationStatus: "error",
                generationMessage: "Failed to generate this section"
              };
            }
            return s;
          });
        });
      }
      
      // Update progress
      completedSections++;
      setGenerationProgress(Math.round(completedSections * progressPerSection));
    }
    
    // If we have generated sections, store them in the protocol
    if (generatedSections.length > 0) {
      try {
        let scheduleSeen = false;
        const sectionsToSave = generatedSections.filter((section) => {
          if (!isGeneratedScheduleSection(section)) return true;
          if (scheduleSeen) return false;
          scheduleSeen = true;
          return true;
        });
        const generatedProtocolJson = JSON.stringify(sectionsToSave);

        // Save the full generated document to the backend. Browser storage cannot
        // reliably hold large protocol payloads with source tables and DOCX data.
        await apiRequest(
          `/api/protocols/${protocol.id}`,
          'PUT',
          buildGeneratedProtocolSavePayload(protocol, generatedProtocolJson)
        );

        setProtocol(prev => ({
          ...prev,
          generatedProtocol: generatedProtocolJson
        }));
        
        toast({
          title: "Protocol Generated",
          description: `Successfully generated ${sectionsToSave.length} protocol sections.`,
          variant: "default"
        });
        
        // Show the generated protocol viewer
        setShowGeneratedProtocol(true);
      } catch (error) {
        console.error("Error saving generated protocol:", error);
        toast({
          title: "Warning",
          description: "Protocol was generated but could not be saved to the database.",
          variant: "destructive"
        });
      }
    } else {
      toast({
        title: "Generation Failed",
        description: "No protocol sections were generated. Please try again.",
        variant: "destructive"
      });
    }
    
    setGenerating(false);
    setGenerationComplete(true);
  };
  
  // Add a new custom section
  const addSection = () => {
    if (!newSectionTitle) return;
    
    const sectionId = newSectionTitle.toLowerCase().replace(/\s+/g, '_');
    
    setProtocolSections(prev => [
      ...prev,
      {
        id: sectionId,
        title: newSectionTitle,
        required: false,
        generationStatus: "pending"
      }
    ]);
    
    setNewSectionTitle("");
    setShowAddSection(false);
  };
  
  // Remove a section
  const removeSection = (sectionId: string) => {
    setProtocolSections(prev => prev.filter(section => section.id !== sectionId));
    setSelectedSections(prev => prev.filter(section => section.id !== sectionId));
  };
  
  // Open the boilerplate selector for a section
  const openBoilerplateSelector = (sectionId: string, sectionTitle: string) => {
    setCurrentSectionForBoilerplate({ id: sectionId, title: sectionTitle });
    setShowBoilerplateSelector(true);
  };
  
  // Handle boilerplate text selection
  const handleSelectBoilerplate = (boilerplateText: BoilerplateText) => {
    if (!currentSectionForBoilerplate) return;
    
    // Update the section with the selected boilerplate text
    setProtocolSections(prevSections => {
      return prevSections.map(section => {
        if (section.id === currentSectionForBoilerplate.id) {
          return {
            ...section,
            boilerplateText: boilerplateText
          };
        }
        return section;
      });
    });
    
    toast({
      title: "Boilerplate Text Added",
      description: `Boilerplate text "${boilerplateText.title}" has been added to "${currentSectionForBoilerplate.title}"`,
      variant: "default"
    });
  };
  
  // Remove boilerplate text from a section
  const removeBoilerplateText = (sectionId: string) => {
    setProtocolSections(prevSections => {
      return prevSections.map(section => {
        if (section.id === sectionId) {
          const { boilerplateText, ...restSection } = section;
          return {
            ...restSection,
          };
        }
        return section;
      });
    });
  };
  
  // Toggle section selection for generation
  const toggleSectionSelection = (sectionId: string, sectionTitle: string) => {
    setSelectedSections(prev => {
      if (prev.some(s => s.id === sectionId)) {
        return prev.filter(s => s.id !== sectionId);
      } else {
        return [...prev, { id: sectionId, title: sectionTitle }];
      }
    });
  };
  
  // Select all sections
  const selectAllSections = () => {
    setSelectedSections(protocolSections.map(section => ({
      id: section.id,
      title: section.title
    })));
  };
  
  // Deselect all sections
  const deselectAllSections = () => {
    setSelectedSections([]);
  };
  
  // Handle generating the protocol
  const handleGenerateProtocol = () => {
    if (selectedSections.length === 0) {
      toast({
        title: "No Sections Selected",
        description: "Please select at least one section to generate.",
        variant: "destructive"
      });
      return;
    }

    if (!inputReviewIsCurrent) {
      setGenerateAfterReview(true);
      setShowInputReview(true);

      toast({
        title: "Review Required Before Generation",
        description: inputReviewNeedsUpdate
          ? "Protocol inputs changed after the last review. Review and apply the updated decisions before generation."
          : inputReviewHasUnappliedDecisions
            ? "Apply the current review decisions before generation. Generation will start after you apply them."
            : "Review protocol inputs first. Generation will start after you apply the decisions.",
        variant: "default"
      });

      if (reviewCacheLoaded && (inputReviewItems.length === 0 || inputReviewNeedsUpdate) && !reviewingInputs) {
        reviewProtocolInputs();
      }
      return;
    }
    
    generateProtocol();
  };

  const handleRegenerateProtocol = () => {
    setShowGeneratedProtocol(false);
    setGenerationComplete(false);
    setGenerationProgress(0);
    setProtocolSections(prevSections => prevSections.map(section => (
      selectedSections.some(selected => selected.id === section.id)
        ? {
            ...section,
            generationStatus: "pending",
            generationMessage: undefined
          }
        : section
    )));
    handleGenerateProtocol();
  };

  // Get the alignment indicator icon
  const getAlignmentIcon = (status: AlignmentStatus) => {
    switch(status) {
      case "aligned":
        return <Check className="h-5 w-5 text-green-500" />;
      case "partial":
        return <AlertCircle className="h-5 w-5 text-amber-500" />;
      case "misaligned":
        return <AlertTriangle className="h-5 w-5 text-red-500" />;
      default:
        return <Shield className="h-5 w-5 text-gray-400" />;
    }
  };

  if (showGeneratedProtocol) {
    return (
      <GeneratedProtocolViewer 
        protocol={protocol}
        onClose={() => setShowGeneratedProtocol(false)}
      />
    );
  }

  return (
    <div className="space-y-8">
      {/* Protocol Alignment Dashboard */}
      <Card>
        <CardHeader>
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-2">
              <FileCheck className="h-5 w-5 text-blue-500" />
              <CardTitle>Protocol Alignment Dashboard</CardTitle>
            </div>
            <div className="flex items-center gap-2">
              <div className={`hidden rounded-full px-3 py-1 text-xs font-medium md:block ${
                inputReviewIsCurrent
                  ? "bg-green-100 text-green-800"
                  : inputReviewNeedsUpdate || inputReviewHasUnappliedDecisions
                    ? "bg-amber-100 text-amber-800"
                    : "bg-gray-100 text-gray-700"
              }`}>
                {inputReviewStatusLabel}
              </div>
              <Button
                variant={inputReviewIsCurrent ? "outline" : "default"}
                onClick={openInputReview}
                disabled={reviewingInputs || generating || selectedSections.length === 0}
                className={inputReviewIsCurrent ? "" : "bg-blue-500 hover:bg-blue-600 text-white"}
              >
                {reviewingInputs ? (
                  "Reviewing..."
                ) : (
                  <>
                    <FileCheck className="h-4 w-4 mr-2" />
                    {inputReviewIsCurrent ? "View Input Review" : inputReviewNeedsUpdate ? "Update Input Review" : inputReviewHasUnappliedDecisions ? "Apply Input Review" : "Review Protocol Inputs"}
                  </>
                )}
              </Button>
              <Button
              onClick={checkAlignment}
              disabled={checking}
              className="bg-blue-500 hover:bg-blue-600 text-white"
            >
              {checking ? (
                "Checking..."
              ) : (
                <>
                  <Bot className="h-4 w-4 mr-2" />
                  {protocol.protocolType === 'secondary_data_analysis' || 
                   protocol.protocolType === 'retrospective_cohort_study' ||
                   protocol.protocolType === 'delphi_consensus' ||
                   protocol.protocolType === 'cross_sectional_survey'
                    ? "Run Analysis Alignment Check"
                    : "Run Cross-Check Analysis"
                  }
                </>
              )}
            </Button>
            </div>
          </div>
          <CardDescription>
            {protocol.protocolType === 'secondary_data_analysis' || 
             protocol.protocolType === 'retrospective_cohort_study' ||
             protocol.protocolType === 'delphi_consensus' ||
             protocol.protocolType === 'cross_sectional_survey'
              ? "Verify alignment between study objectives and analysis plan before generating your protocol."
              : "Verify alignment between study objectives, schedule of assessments, eligibility, safety, and analysis plan before generating your protocol."
            }
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-6 mb-6">
            <div>
              <div className="flex items-center mb-2">
                {getAlignmentIcon(alignment.studyObjectives.status)}
                <span className="ml-2 font-medium">Study Objectives</span>
              </div>
              <div className={`text-sm p-2 rounded ${
                alignment.studyObjectives.status === "aligned" 
                  ? "text-green-800 bg-green-50" 
                  : alignment.studyObjectives.status === "partial"
                    ? "text-amber-800 bg-amber-50"
                    : alignment.studyObjectives.status === "misaligned"
                      ? "text-red-800 bg-red-50"
                      : "text-gray-800 bg-gray-50"
              }`}>
                {alignment.studyObjectives.status === "unknown" 
                  ? "Run analysis to check alignment"
                  : alignment.studyObjectives.details}
              </div>
            </div>
            
            {/* Hide Schedule of Activities for Secondary Data Analysis, Retrospective studies, Delphi and Cross-sectional */}
            {protocol.protocolType !== 'secondary_data_analysis' && 
             protocol.protocolType !== 'retrospective_cohort_study' &&
             protocol.protocolType !== 'delphi_consensus' &&
             protocol.protocolType !== 'cross_sectional_survey' && (
              <div>
                <div className="flex items-center mb-2">
                  {getAlignmentIcon(alignment.scheduleOfAssessments.status)}
                  <span className="ml-2 font-medium">Schedule of Activities</span>
                </div>
                <div className={`text-sm p-2 rounded ${
                  alignment.scheduleOfAssessments.status === "aligned" 
                    ? "text-green-800 bg-green-50" 
                    : alignment.scheduleOfAssessments.status === "partial"
                      ? "text-amber-800 bg-amber-50"
                      : alignment.scheduleOfAssessments.status === "misaligned"
                        ? "text-red-800 bg-red-50"
                        : "text-gray-800 bg-gray-50"
                }`}>
                  {alignment.scheduleOfAssessments.status === "unknown" 
                    ? "Run analysis to check alignment"
                    : alignment.scheduleOfAssessments.details}
                </div>
              </div>
            )}
            
            <div>
              <div className="flex items-center mb-2">
                {getAlignmentIcon(alignment.inclusionExclusionCriteria.status)}
                <span className="ml-2 font-medium">Inclusion/Exclusion Criteria</span>
              </div>
              <div className={`text-sm p-2 rounded ${
                alignment.inclusionExclusionCriteria.status === "aligned" 
                  ? "text-green-800 bg-green-50" 
                  : alignment.inclusionExclusionCriteria.status === "partial"
                    ? "text-amber-800 bg-amber-50"
                    : alignment.inclusionExclusionCriteria.status === "misaligned"
                      ? "text-red-800 bg-red-50"
                      : "text-gray-800 bg-gray-50"
              }`}>
                {alignment.inclusionExclusionCriteria.status === "unknown" 
                  ? "Run analysis to check alignment"
                  : alignment.inclusionExclusionCriteria.details}
              </div>
            </div>
            
            {hasMeaningfulContent(protocol.dataVariables) && (
              <div>
                <div className="flex items-center mb-2">
                  {getAlignmentIcon(alignment.dataVariables.status)}
                  <span className="ml-2 font-medium">Data Variables <span className="text-xs font-normal text-gray-500">(optional)</span></span>
                </div>
                <div className={`text-sm p-2 rounded ${
                  alignment.dataVariables.status === "aligned" 
                    ? "text-green-800 bg-green-50" 
                    : alignment.dataVariables.status === "partial"
                      ? "text-amber-800 bg-amber-50"
                      : alignment.dataVariables.status === "misaligned"
                        ? "text-red-800 bg-red-50"
                        : "text-gray-800 bg-gray-50"
                }`}>
                  {alignment.dataVariables.status === "unknown" 
                    ? "Optional CRF/data-capture check"
                    : alignment.dataVariables.details}
                </div>
              </div>
            )}
            
            <div>
              <div className="flex items-center mb-2">
                {getAlignmentIcon(alignment.studySchema.status)}
                <span className="ml-2 font-medium">Study Schema</span>
              </div>
              <div className={`text-sm p-2 rounded ${
                alignment.studySchema.status === "aligned" 
                  ? "text-green-800 bg-green-50" 
                  : alignment.studySchema.status === "partial"
                    ? "text-amber-800 bg-amber-50"
                    : alignment.studySchema.status === "misaligned"
                      ? "text-red-800 bg-red-50"
                      : "text-gray-800 bg-gray-50"
              }`}>
                {alignment.studySchema.status === "unknown" 
                  ? "Run analysis to check alignment"
                  : alignment.studySchema.details}
              </div>
            </div>
            
            <div>
              <div className="flex items-center mb-2">
                {getAlignmentIcon(alignment.statisticalAnalysisPlan.status)}
                <span className="ml-2 font-medium">Statistical Analysis Plan</span>
              </div>
              <div className={`text-sm p-2 rounded ${
                alignment.statisticalAnalysisPlan.status === "aligned" 
                  ? "text-green-800 bg-green-50" 
                  : alignment.statisticalAnalysisPlan.status === "partial"
                    ? "text-amber-800 bg-amber-50"
                    : alignment.statisticalAnalysisPlan.status === "misaligned"
                      ? "text-red-800 bg-red-50"
                      : "text-gray-800 bg-gray-50"
              }`}>
                {alignment.statisticalAnalysisPlan.status === "unknown" 
                  ? "Run analysis to check alignment"
                  : alignment.statisticalAnalysisPlan.details}
              </div>
            </div>
          </div>
          
          {/* Recommendations */}
          {recommendations.length > 0 && (
            <div className="mt-6">
              <h4 className="text-md font-medium mb-3">Identified Gaps & Recommendations</h4>
              <div className="space-y-3">
                {recommendations.map((recommendation) => (
                  <div key={recommendation.id} className="p-3 bg-amber-50 border border-amber-200 rounded-md">
                    <div className="flex items-center">
                      <AlertCircle className="h-4 w-4 text-amber-500 mr-2" />
                      <span className="font-medium text-amber-800">{recommendation.title}</span>
                    </div>
                    <p className="text-sm text-amber-700 mt-1 ml-6">
                      {recommendation.description}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
      
      {/* Generate Protocol */}
      <div>
        <h2 className="text-xl font-semibold mb-4">Generate protocol</h2>
        
        {/* Bias Assessment Integration Status - Show for observational studies */}
        {(protocol.protocolType === "prospective_cohort_study" || 
          protocol.protocolType === "retrospective_cohort_study" || 
          protocol.protocolType === "secondary_data_analysis") && (
          <Card className="border-blue-200 bg-blue-50 mb-6">
            <CardHeader>
              <div className="flex items-center gap-2">
                <Shield className="h-5 w-5 text-blue-600" />
                <CardTitle className="text-blue-800">Bias Assessment Integration</CardTitle>
              </div>
              <CardDescription className="text-blue-700">
                {(() => {
                  // Parse SAP data to check for bias assessment
                  let sapData = null;
                  try {
                    sapData = protocol.statisticalAnalysisPlan ? 
                      (typeof protocol.statisticalAnalysisPlan === 'string' ? 
                        JSON.parse(protocol.statisticalAnalysisPlan) : 
                        protocol.statisticalAnalysisPlan) : null;
                  } catch (e) {
                    sapData = null;
                  }
                  
                  const biasAssessment = sapData?.biasAssessment;
                  const propensityScore = sapData?.propensityScoreAnalysis;
                  const negativeControls = sapData?.negativeControls;
                  const interimAnalysis = sapData?.interimAnalysis;
                  
                  return biasAssessment ? (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <CheckCircle className="h-4 w-4 text-green-600" />
                        <span>Bias assessment data will be automatically integrated into Statistical Considerations and Bias Management sections</span>
                      </div>
                      <div className="text-sm">
                        <strong>Overall Bias Risk:</strong> <span className={`px-2 py-1 rounded text-xs ${
                          biasAssessment.overallRisk === 'low' ? 'bg-green-100 text-green-800' :
                          biasAssessment.overallRisk === 'moderate' ? 'bg-yellow-100 text-yellow-800' :
                          'bg-red-100 text-red-800'
                        }`}>
                          {biasAssessment.overallRisk?.toUpperCase()}
                        </span>
                      </div>
                      {propensityScore?.indicated && (
                        <div className="text-sm">
                          <strong>Propensity Score Analysis:</strong> {propensityScore.method} will be included
                        </div>
                      )}
                      {(negativeControls?.outcomeControls?.length > 0 || negativeControls?.exposureControls?.length > 0) && (
                        <div className="text-sm">
                          <strong>Negative Controls:</strong> {
                            (negativeControls.outcomeControls?.length || 0) + 
                            (negativeControls.exposureControls?.length || 0)
                          } negative controls will be included
                        </div>
                      )}
                      {interimAnalysis?.planned && (
                        <div className="text-sm">
                          <strong>Interim Analysis:</strong> {interimAnalysis.numberOfAnalyses || 1} planned analysis(es) will be included
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <AlertTriangle className="h-4 w-4 text-amber-600" />
                      <span>Complete the Statistical Analysis Plan tab to enable bias assessment integration</span>
                    </div>
                  );
                })()}
              </CardDescription>
            </CardHeader>
          </Card>
        )}
        
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Select the sections to include in your protocol</CardTitle>
            <CardDescription>
              You can reorder, add, or remove sections as needed. Required sections cannot be removed.
            </CardDescription>
            <div className="flex gap-2 mt-2">
              <Button
                variant="outline"
                size="sm"
                onClick={selectAllSections}
              >
                Select All
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={deselectAllSections}
              >
                Deselect All
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowAddSection(true)}
              >
                <FileText className="h-4 w-4 mr-2" />
                Add Custom Section
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="border rounded-md">
              <Accordion
                type="multiple"
                defaultValue={sectionsExpanded ? protocolSections.map(s => s.id) : []}
                className="w-full"
              >
                {protocolSections.map((section) => (
                  <AccordionItem key={section.id} value={section.id}>
                    <div className="flex items-center px-4 py-2 hover:bg-gray-50">
                      <div className="flex-1">
                        <div className="flex items-center">
                          <input
                            type="checkbox"
                            id={`section-${section.id}`}
                            checked={selectedSections.some(s => s.id === section.id)}
                            onChange={() => toggleSectionSelection(section.id, section.title)}
                            className="mr-3 h-4 w-4 rounded"
                          />
                          <AccordionTrigger className="p-0 hover:no-underline">
                            <span className="font-medium">{section.title}</span>
                            {section.required && (
                              <span className="ml-2 text-sm text-red-600">(Required)</span>
                            )}
                            {section.boilerplateText && (
                              <Badge 
                                variant="outline" 
                                className="ml-2 bg-blue-50 text-blue-700 border-blue-200"
                              >
                                <BookTemplate className="h-3 w-3 mr-1" />
                                Boilerplate
                              </Badge>
                            )}
                          </AccordionTrigger>
                        </div>
                      </div>
                      
                      <div className="flex items-center space-x-1">
                        <CommentTrigger
                          protocolId={protocol.id}
                          designStateId={activeDesignState?.id || ""}
                          section="generateProtocol"
                          sectionItem="protocolSection"
                          contextData={`section-${section.id}`}
                          size="icon"
                        />
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            openBoilerplateSelector(section.id, section.title);
                          }}
                          className="h-8 px-2 text-blue-600"
                          title="Add boilerplate text"
                        >
                          <BookTemplate className="h-4 w-4 mr-1" />
                          {section.boilerplateText ? "Change" : "Add"} Boilerplate
                        </Button>
                        
                        {section.boilerplateText && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              removeBoilerplateText(section.id);
                            }}
                            className="h-8 w-8 p-0 text-red-500"
                            title="Remove boilerplate text"
                          >
                            <Trash className="h-4 w-4" />
                          </Button>
                        )}
                        
                        {!section.required && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              removeSection(section.id);
                            }}
                            className="h-8 w-8 p-0"
                            title="Remove section"
                          >
                            <Trash className="h-4 w-4 text-gray-500" />
                          </Button>
                        )}
                      </div>
                    </div>
                    
                    <AccordionContent className="px-4 py-2 bg-gray-50">
                      <div className="space-y-3">
                        <div className="text-sm text-gray-600">
                          {section.generationStatus === "complete" ? (
                            <div className="flex items-center text-green-600">
                              <Check className="h-4 w-4 mr-1" />
                              <span>Generated successfully</span>
                            </div>
                          ) : section.generationStatus === "error" ? (
                            <div className="flex items-center text-red-600">
                              <AlertTriangle className="h-4 w-4 mr-1" />
                              <span>{section.generationMessage || "Generation failed"}</span>
                            </div>
                          ) : null}
                        </div>
                        
                        {section.boilerplateText && (
                          <div className="mt-3 p-3 bg-blue-50 border border-blue-200 rounded-md">
                            <div className="flex items-center mb-1">
                              <BookTemplate className="h-4 w-4 text-blue-600 mr-2" />
                              <span className="font-medium text-sm text-blue-800">Boilerplate: {section.boilerplateText.title}</span>
                            </div>
                            <p className="text-xs text-blue-800 line-clamp-2">{section.boilerplateText.content}</p>
                          </div>
                        )}
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            </div>
            
            {/* Add Section Dialog */}
            <Dialog open={showAddSection} onOpenChange={setShowAddSection}>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Add Custom Section</DialogTitle>
                  <DialogDescription>
                    Enter a title for your new protocol section.
                  </DialogDescription>
                </DialogHeader>
                
                <Input
                  value={newSectionTitle}
                  onChange={(e) => setNewSectionTitle(e.target.value)}
                  placeholder="Section Title"
                />
                
                <DialogFooter>
                  <Button variant="outline" onClick={() => setShowAddSection(false)}>
                    Cancel
                  </Button>
                  <Button onClick={addSection} disabled={!newSectionTitle}>
                    Add Section
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
            
            {/* Boilerplate Text Selector Dialog */}
            {currentSectionForBoilerplate && (
              <BoilerplateTextSelector
                open={showBoilerplateSelector}
                onOpenChange={setShowBoilerplateSelector}
                sectionId={currentSectionForBoilerplate.id}
                sectionTitle={currentSectionForBoilerplate.title}
                protocolType={protocol.protocolType || 'interventional_clinical_trial'}
                onSelectBoilerplate={handleSelectBoilerplate}
              />
            )}
          </CardContent>
        </Card>
        
        {/* Additional Instructions */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Additional Instructions</CardTitle>
            <CardDescription>
              Provide any specific instructions or guidelines for the AI to follow when generating your protocol.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Textarea
              placeholder="Enter any specific instructions for the AI to consider when generating the protocol (optional)"
              value={additionalInstructions}
              onChange={(e) => setAdditionalInstructions(e.target.value)}
              rows={3}
            />
          </CardContent>
        </Card>
        
        {/* Generation button and progress */}
        <div className="flex justify-end gap-2">
          <Button
            onClick={handleGenerateProtocol}
            disabled={generating || reviewingInputs || selectedSections.length === 0}
            className="bg-blue-500 hover:bg-blue-600 text-white px-6"
          >
            {generating ? 
              "Generating..." : 
              <>
                <FileText className="h-4 w-4 mr-2" />
                Generate Protocol Document
              </>
            }
          </Button>
        </div>
        
        {/* Generation Status */}
        {(generating || generationComplete) && (
          <Card className="mt-6">
            <CardHeader>
              <CardTitle>Generation Status</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="mb-4">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-sm font-medium">
                    Progress: {generationProgress}%
                  </span>
                  {generationComplete && (
                    <span className="flex items-center text-green-600 text-sm">
                      <Check className="h-4 w-4 mr-1" />
                      Complete
                    </span>
                  )}
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2.5">
                  <div
                    className="bg-blue-500 h-2.5 rounded-full"
                    style={{ width: `${generationProgress}%` }}
                  ></div>
                </div>
              </div>
              
              <AIGenerationStatus sections={sectionStatuses} />
              
              {generationComplete && (
                <div className="mt-6 flex justify-end gap-2">
                  <Button
                    variant="outline"
                    onClick={handleRegenerateProtocol}
                    disabled={generating || reviewingInputs || selectedSections.length === 0}
                  >
                    <RefreshCw className="h-4 w-4 mr-2" />
                    Regenerate Protocol
                  </Button>
                  <Button 
                    onClick={() => setShowGeneratedProtocol(true)}
                    className="bg-blue-500 hover:bg-blue-600 text-white"
                  >
                    View Generated Protocol
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>

      <Dialog
        open={showInputReview}
        onOpenChange={(open) => {
          setShowInputReview(open);
          if (!open) setGenerateAfterReview(false);
        }}
      >
        <DialogContent className="max-w-5xl max-h-[88vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Review Protocol Inputs</DialogTitle>
            <DialogDescription>
              Decide what the final generator should copy, improve, add, or leave as placeholder.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border bg-gray-50 p-3">
              <div>
                <p className="text-sm font-medium">{inputReviewSummary || "Run review to classify final protocol inputs."}</p>
                <p className="text-xs text-gray-600">
                  Showing {filteredReviewItems.length} of {inputReviewItems.length} decisions. {acceptedReviewItems.length} active, {inputReviewItems.filter(item => item.decision === "reject").length} rejected.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <select
                  className="rounded-md border px-2 py-1 text-sm"
                  value={reviewSectionFilter}
                  onChange={(event) => setReviewSectionFilter(event.target.value)}
                >
                  <option value="all">All sections</option>
                  {reviewSections.map(section => (
                    <option key={section} value={section}>{section}</option>
                  ))}
                </select>
                <select
                  className="rounded-md border px-2 py-1 text-sm"
                  value={reviewClassFilter}
                  onChange={(event) => setReviewClassFilter(event.target.value as ReviewClassification | "all")}
                >
                  <option value="all">All types</option>
                  <option value="use_as_is">Use as-is</option>
                  <option value="improve">Improve</option>
                  <option value="add">Add</option>
                  <option value="needs_user_input">Needs input</option>
                  <option value="placeholder">Placeholder</option>
                </select>
                <Button variant="outline" size="sm" onClick={() => applyReviewDefaults("source", "use_as_is")}>
                  Accept Use As-Is
                </Button>
                <Button variant="outline" size="sm" onClick={() => applyReviewDefaults("placeholder", "needs_user_input")}>
                  Use Placeholders
                </Button>
                <Button
                  size="sm"
                  onClick={reviewProtocolInputs}
                  disabled={reviewingInputs || selectedSections.length === 0}
                  className="bg-blue-500 hover:bg-blue-600 text-white"
                >
                  {reviewingInputs ? "Running..." : inputReviewItems.length > 0 ? "Run Again" : "Run Review"}
                </Button>
              </div>
            </div>

            {(inputReviewTabReadiness.length > 0 || latestTabReadiness.length > 0) && (
              <div className="rounded-md border p-3">
                <div className="mb-3 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-sm font-medium">Tab readiness</p>
                    <p className="text-xs text-gray-600">
                      The final review uses these tab-level analyses, then separately checks full protocol sections that do not have their own tab.
                    </p>
                  </div>
                  {inputReviewNeedsUpdate && (
                    <Badge className="w-fit bg-amber-100 text-amber-800">Review needs update</Badge>
                  )}
                </div>
                <div className="grid gap-2 md:grid-cols-2">
                  {(inputReviewTabReadiness.length > 0 ? inputReviewTabReadiness : latestTabReadiness).map((tab) => {
                    const statusClass =
                      tab.status === "current" ? "bg-green-100 text-green-800" :
                      tab.status === "stale" ? "bg-amber-100 text-amber-800" :
                      "bg-gray-100 text-gray-700";
                    return (
                      <div key={tab.sectionKey} className="rounded-md border bg-white p-3 text-sm">
                        <div className="mb-2 flex flex-wrap items-center gap-2">
                          <span className="font-medium">{tab.sectionName}</span>
                          <Badge className={statusClass}>{tabStatusLabels[tab.status]}</Badge>
                          {tab.recommendedMode && (
                            <Badge variant="outline">{tabModeLabels[tab.recommendedMode]}</Badge>
                          )}
                          {tab.sourceStatus && (
                            <Badge variant="outline">{tabSourceStatusLabels[tab.sourceStatus]}</Badge>
                          )}
                        </div>
                        <p className="text-xs text-gray-600">
                          {tab.summary || (tab.hasContent
                            ? "This tab has generated or entered content, but its source-use review has not been run yet."
                            : "This tab does not yet have generated content or a current source-use review.")}
                        </p>
                        {tab.recommendedAction && (
                          <p className="mt-2 text-xs font-medium text-gray-700">
                            Action: {tab.recommendedAction}
                          </p>
                        )}
                        {[...(tab.blockers || []), ...(tab.missingItems || []), ...(tab.risks || [])].length > 0 && (
                          <ul className="mt-2 space-y-1 text-xs text-gray-600">
                            {[...(tab.blockers || []), ...(tab.missingItems || []), ...(tab.risks || [])].slice(0, 3).map((item, index) => (
                              <li key={index}>- {item}</li>
                            ))}
                          </ul>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {inputReviewError && !reviewingInputs && (
              <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                {inputReviewError}
              </div>
            )}

            {reviewingInputs ? (
              <div className="rounded-md border p-6 text-sm text-gray-700">
                <div className="mb-3 flex items-center justify-between">
                  <span className="font-medium">AI is analyzing the latest protocol inputs</span>
                  <span className="text-xs text-gray-500">{reviewElapsedSeconds}s elapsed</span>
                </div>
                <div className="mb-3 h-2 w-full overflow-hidden rounded-full bg-gray-200">
                  <div className="h-full w-1/2 animate-pulse rounded-full bg-blue-500"></div>
                </div>
                <div className="grid gap-2 text-xs text-gray-600 md:grid-cols-3">
                  <div>1. Reading selected sections</div>
                  <div>2. Classifying source use</div>
                  <div>3. Preparing editable decisions</div>
                </div>
                <p className="mt-3 text-xs text-gray-500">
                  Full reviews usually take 20-60 seconds. Keep this modal open until decisions appear.
                </p>
              </div>
            ) : reviewCacheLoaded && inputReviewItems.length === 0 ? (
              <div className="rounded-md border p-6 text-center text-sm text-gray-600">
                <p>No review items yet.</p>
                <Button
                  className="mt-3 bg-blue-500 hover:bg-blue-600 text-white"
                  onClick={reviewProtocolInputs}
                  disabled={selectedSections.length === 0}
                >
                  Run Review
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                {filteredReviewItems.map((item) => (
                  <div key={item.id} className="rounded-md border p-4">
                    <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge variant="outline">{item.section}</Badge>
                          <Badge
                            className={
                              item.classification === "use_as_is" ? "bg-green-100 text-green-800" :
                              item.classification === "improve" ? "bg-amber-100 text-amber-800" :
                              item.classification === "add" ? "bg-blue-100 text-blue-800" :
                              "bg-gray-100 text-gray-800"
                            }
                          >
                            {item.classification.replace(/_/g, " ")}
                          </Badge>
                          <Badge variant="outline">{item.riskLevel} risk</Badge>
                        </div>
                        <h4 className="mt-2 font-medium">{item.label}</h4>
                      </div>
                      <select
                        className="rounded-md border px-2 py-1 text-sm"
                        value={item.decision}
                        onChange={(event) => {
                          const decision = event.target.value as ReviewDecision;
                          updateReviewItem(item.id, {
                            decision,
                            finalText: getReviewFinalTextForDecision(item, decision)
                          });
                        }}
                      >
                        <option value="accept">Accept proposal</option>
                        <option value="edit">Edit and accept</option>
                        <option value="source">Use source text (no AI changes)</option>
                        <option value="placeholder">Use placeholder</option>
                        <option value="reject">Exclude from final protocol</option>
                      </select>
                      <p className="mt-1 max-w-[240px] text-xs text-gray-500">
                        {item.decision === "source"
                          ? "Uses the source excerpt exactly, with no AI rewrite."
                          : item.decision === "reject"
                            ? "Removes this item from final generation guidance."
                            : "Uses the proposed or edited final text."}
                      </p>
                    </div>

                    <div className="grid gap-3 md:grid-cols-2">
                      <div>
                        <p className="mb-1 text-xs font-medium text-gray-600">Source</p>
                        <div className="min-h-[84px] whitespace-pre-wrap rounded-md bg-gray-50 p-3 text-sm leading-relaxed text-gray-700">
                          {item.sourceText || "No source text found."}
                        </div>
                      </div>
                      <div>
                        <div className="mb-1 flex items-center gap-2">
                          <p className="text-xs font-medium text-gray-600">Proposed final text for generation</p>
                          {getReviewOriginLabel(item) && (
                            <AIGeneratedBadge label={getReviewOriginLabel(item)!} />
                          )}
                        </div>
                        <Textarea
                          value={item.finalText || item.proposedText || ""}
                          onChange={(event) => updateReviewItem(item.id, {
                            finalText: event.target.value,
                            decision: item.decision === "reject" ? "edit" : item.decision
                          })}
                          rows={getReviewTextRows(item.finalText || item.proposedText || "")}
                          className="resize-y leading-relaxed"
                          disabled={item.decision === "reject"}
                        />
                      </div>
                    </div>

                    <p className="mt-3 text-sm text-gray-600">
                      <span className="font-medium">Why:</span> {item.reason}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowInputReview(false);
                setGenerateAfterReview(false);
              }}
            >
              Close
            </Button>
            <Button
              onClick={applyInputReviewDecisions}
              disabled={reviewingInputs || inputReviewItems.length === 0}
              className="bg-blue-500 hover:bg-blue-600 text-white"
            >
              {generateAfterReview ? "Apply Decisions and Generate" : "Apply Decisions"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      

    </div>
  );
}
