import React, { useState, useEffect } from "react"
import {
  AlertCircle,
  Upload,
  Plus,
  Pencil,
  Check,
  X,
  ArrowRight,
  AlertTriangle,
  Loader2,
  FileText,
  FileInput,
  Link as LinkIcon,
  Lightbulb,
  Microscope,
  Clock,
  Users,
  TrendingUp,
  RefreshCw,
  Activity,
  Download,
  ClipboardList,
  Brain
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Input } from "@/components/ui/input"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert"
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs"
import { Protocol, SupplementaryItem, StructuredDocumentExtraction, SupplementaryChunk } from "@/types"
import { protocolTypes, protocolTypeConfig } from "@shared/schema"
import { Badge } from "@/components/ui/badge"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { createSupplementaryChunks } from "@/lib/supplementary-info"
import { stripLargeSourceArtifactsForUploadExtraction } from "@/lib/protocol-sanitize"

const MAX_SUPPLEMENTARY_FILES = 12
const WARNING_SUPPLEMENTARY_FILES = 6
const MAX_SUPPLEMENTARY_FILE_SIZE_MB = 10
const MAX_SUPPLEMENTARY_FILE_SIZE_BYTES = MAX_SUPPLEMENTARY_FILE_SIZE_MB * 1024 * 1024
const WARNING_SUPPLEMENTARY_CHARACTERS = 300000
const DEFAULT_SUPPLEMENTARY_FILE_USAGE = "Use information from this file as supporting reference for protocol generation."

interface ProtocolSynopsisProps {
  protocol: Protocol
  setProtocol: React.Dispatch<React.SetStateAction<Protocol>>
  onGenerateProtocol: () => void
}

export default function ProtocolSynopsis({
  protocol,
  setProtocol,
  onGenerateProtocol
}: ProtocolSynopsisProps) {
  // Define element status interface
  interface ElementStatus {
    element: string;
    status: "missing" | "partial" | "complete";
    details: string;
    completeness?: number; // Percentage of completeness from 0-100
  }

  interface ExtractedSourceField {
    label: string;
    value: string;
    status: "found" | "missing" | "unclear";
  }

  type SourceRecommendationAction = "use_as_is" | "improve" | "generate" | "needs_source"

  interface SourceUseRecommendation {
    protocolArea: string;
    sourceStatus: "present" | "partial" | "missing" | "unclear";
    recommendedAction: SourceRecommendationAction;
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
  }

  interface StudyLogicAssessment {
    area: string;
    conclusion: string;
    reasoning: string;
    riskLevel?: "low" | "medium" | "high";
    recommendedFollowUp?: string;
  }

  interface SourceAssessmentReport {
    assessment?: string;
    readinessLevel?: "ready" | "partial" | "insufficient" | null;
    extractedFields?: ExtractedSourceField[];
    elements?: ElementStatus[];
    missingElements?: string[];
    sourceDocumentsNeeded?: string[];
    nextSteps?: string[];
    sourceUseRecommendations?: SourceUseRecommendation[];
    studyLogicAssessment?: StudyLogicAssessment[];
    assumptionsRequiringReview?: string[];
    generatedAt?: string;
  }
  
  // State management
  const [synopsis, setSynopsis] = useState(protocol.synopsis || "")
  const [aiAssessment, setAiAssessment] = useState<string | null>(null)
  const [sourceReadiness, setSourceReadiness] = useState<"ready" | "partial" | "insufficient" | null>(null)
  const [extractedFields, setExtractedFields] = useState<ExtractedSourceField[]>([])
  const [sourceDocumentsNeeded, setSourceDocumentsNeeded] = useState<string[]>([])
  const [nextSteps, setNextSteps] = useState<string[]>([])
  const [missingElements, setMissingElements] = useState<string[]>([])
  const [elementStatuses, setElementStatuses] = useState<ElementStatus[]>([])
  const [sourceUseRecommendations, setSourceUseRecommendations] = useState<SourceUseRecommendation[]>([])
  const [studyLogicAssessment, setStudyLogicAssessment] = useState<StudyLogicAssessment[]>([])
  const [assumptionsRequiringReview, setAssumptionsRequiringReview] = useState<string[]>([])
  const [assessmentGeneratedAt, setAssessmentGeneratedAt] = useState<string | null>(null)
  const [isExportingAssessment, setIsExportingAssessment] = useState(false)
  const [isGenerating, setIsGenerating] = useState(false)
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [fileUploaded, setFileUploaded] = useState(false)
  const [fileContent, setFileContent] = useState<string | null>(null)
  const [lastExtraction, setLastExtraction] = useState<StructuredDocumentExtraction | null>(null)
  
  // Enhanced supplementary info state
  const [supplementaryInfo, setSupplementaryInfo] = useState<SupplementaryItem[]>(
    Array.isArray(protocol.supplementaryInfo) 
      ? protocol.supplementaryInfo.map((info, index) => 
          typeof info === 'string' 
            ? { id: `legacy-${index}`, text: info, type: 'text' } 
            : info
        )
      : []
  )
  
  const [newSupplementaryInfo, setNewSupplementaryInfo] = useState("")
  const [newSupplementaryContext, setNewSupplementaryContext] = useState("")
  const [showContextField, setShowContextField] = useState(false)
  const [editingIndex, setEditingIndex] = useState<number | null>(null)
  const [editText, setEditText] = useState("")
  const [editContext, setEditContext] = useState("")
  const [uploadingSupplementaryFile, setUploadingSupplementaryFile] = useState(false)
  const [supplementaryFileUsage, setSupplementaryFileUsage] = useState(DEFAULT_SUPPLEMENTARY_FILE_USAGE)
  const [showProcessGuide, setShowProcessGuide] = useState(false)

  const getSavedSourceAssessment = (targetProtocol: Protocol): SourceAssessmentReport | null => {
    if (targetProtocol.sourceAssessment && typeof targetProtocol.sourceAssessment === "object") {
      return targetProtocol.sourceAssessment as SourceAssessmentReport
    }

    const components = Array.isArray(targetProtocol.components) ? targetProtocol.components : []
    const sourceAssessmentComponent = components.find((component) => component?.type === "sourceAssessment")
    return sourceAssessmentComponent?.data && typeof sourceAssessmentComponent.data === "object"
      ? sourceAssessmentComponent.data as SourceAssessmentReport
      : null
  }

  const applySourceAssessmentReport = (report: SourceAssessmentReport | null) => {
    if (!report) return

    setAiAssessment(report.assessment || null)
    setSourceReadiness(
      report.readinessLevel === "ready" || report.readinessLevel === "partial" || report.readinessLevel === "insufficient"
        ? report.readinessLevel
        : null
    )
    setExtractedFields(Array.isArray(report.extractedFields) ? report.extractedFields : [])
    setSourceDocumentsNeeded(Array.isArray(report.sourceDocumentsNeeded) ? report.sourceDocumentsNeeded : [])
    setNextSteps(Array.isArray(report.nextSteps) ? report.nextSteps : [])
    setMissingElements(Array.isArray(report.missingElements) ? report.missingElements : [])
    setElementStatuses(Array.isArray(report.elements) ? report.elements : [])
    setSourceUseRecommendations(Array.isArray(report.sourceUseRecommendations) ? report.sourceUseRecommendations : [])
    setStudyLogicAssessment(Array.isArray(report.studyLogicAssessment) ? report.studyLogicAssessment : [])
    setAssumptionsRequiringReview(Array.isArray(report.assumptionsRequiringReview) ? report.assumptionsRequiringReview : [])
    setAssessmentGeneratedAt(report.generatedAt || null)
  }

  const clearSourceAssessmentReport = () => {
    setAiAssessment(null)
    setSourceReadiness(null)
    setExtractedFields([])
    setSourceDocumentsNeeded([])
    setNextSteps([])
    setMissingElements([])
    setElementStatuses([])
    setSourceUseRecommendations([])
    setStudyLogicAssessment([])
    setAssumptionsRequiringReview([])
    setAssessmentGeneratedAt(null)
  }

  const buildCurrentSourceAssessmentReport = (): SourceAssessmentReport => ({
    assessment: aiAssessment || undefined,
    readinessLevel: sourceReadiness,
    extractedFields,
    elements: elementStatuses,
    missingElements,
    sourceDocumentsNeeded,
    nextSteps,
    sourceUseRecommendations,
    studyLogicAssessment,
    assumptionsRequiringReview,
    generatedAt: assessmentGeneratedAt || new Date().toISOString()
  })

  const getRecommendationLabel = (action: SourceRecommendationAction) => {
    switch (action) {
      case "use_as_is":
        return "Use source as-is"
      case "improve":
        return "Improve with AI"
      case "generate":
        return "Generate with AI"
      case "needs_source":
        return "Need source/user input"
      default:
        return "Review"
    }
  }

  const getRecommendationBadgeClass = (action: SourceRecommendationAction) => {
    switch (action) {
      case "use_as_is":
        return "border-[#b2f2bb] bg-[#ebfbee] text-[#2b8a3e]"
      case "improve":
        return "border-[#ffe066] bg-[#fff9db] text-[#8a5a00]"
      case "generate":
        return "border-[#d0ebff] bg-[#e7f5ff] text-[#1864ab]"
      case "needs_source":
        return "border-[#ffc9c9] bg-[#fff5f5] text-[#c92a2a]"
      default:
        return "border-[#dee2e6] bg-[#f8f9fa] text-[#495057]"
    }
  }

  const getActionableElementDetails = (element: ElementStatus) => {
    const details = element.details || ""
    const normalizedElement = element.element.toLowerCase()
    const normalizedDetails = details.toLowerCase()
    const isPopulationElement =
      normalizedElement.includes("population") ||
      normalizedElement.includes("inclusion") ||
      normalizedElement.includes("exclusion") ||
      normalizedElement.includes("eligibility")
    const looksGeneric =
      normalizedDetails.includes("not fully described") ||
      normalizedDetails.includes("lacking important details") ||
      normalizedDetails.includes("more detail") ||
      normalizedDetails.includes("should be expanded")

    if (isPopulationElement && element.status !== "complete" && looksGeneric) {
      return [
        "The source gives the general population, but the team still needs protocol-ready eligibility detail. Review and add the exact inclusion/exclusion domains that apply to this study: disease confirmation and stage/severity, prior therapy and washout rules, ECOG/performance status, organ-function/laboratory thresholds, prohibited concomitant therapies, CNS disease or other clinically significant comorbidities, infection or concurrent malignancy exclusions, hypersensitivity to study treatment/class, reproductive status/contraception, recent surgery/radiation, and prior investigational-product exposure. Use bracketed placeholders where thresholds or time windows require team confirmation."
      ].join(" ")
    }

    return details
  }

  useEffect(() => {
    const incomingSynopsis = protocol.synopsis || ""
    setSynopsis((current) => current === incomingSynopsis ? current : incomingSynopsis)
  }, [protocol.id, protocol.synopsis])

  useEffect(() => {
    applySourceAssessmentReport(getSavedSourceAssessment(protocol))
  }, [protocol.id, protocol.components, protocol.sourceAssessment])

  useEffect(() => {
    let incomingItems: SupplementaryItem[] = []

    if (Array.isArray(protocol.supplementaryInfo)) {
      incomingItems = protocol.supplementaryInfo.map((info, index) =>
        typeof info === "string"
          ? { id: `legacy-${index}`, text: info, type: "text" }
          : info
      )
    } else if (typeof protocol.supplementaryInfo === "string") {
      try {
        const parsed = JSON.parse(protocol.supplementaryInfo)
        incomingItems = Array.isArray(parsed)
          ? parsed.map((info, index) =>
              typeof info === "string"
                ? { id: `legacy-${index}`, text: info, type: "text" }
                : info
            )
          : []
      } catch {
        incomingItems = protocol.supplementaryInfo.trim()
          ? [{ id: "legacy-0", text: protocol.supplementaryInfo, type: "text" }]
          : []
      }
    }

    setSupplementaryInfo((current) => {
      try {
        return JSON.stringify(current) === JSON.stringify(incomingItems) ? current : incomingItems
      } catch {
        return incomingItems
      }
    })
  }, [protocol.id, protocol.supplementaryInfo])

  const getSupplementaryTextLength = (items: SupplementaryItem[]) => {
    return items.reduce((total, item) => {
      return total + (item.text?.length || 0) + (item.context?.length || 0) + (item.fileContent?.length || 0)
    }, 0)
  }

  const createStructuredExtractionChunks = (
    structuredExtraction: StructuredDocumentExtraction | null | undefined,
    sourceLabel: string,
    usage: string,
    idPrefix: string,
    startIndex: number
  ): SupplementaryChunk[] => {
    if (!structuredExtraction) return []

    const chunks: SupplementaryChunk[] = []
    structuredExtraction.tables?.forEach((table, tableIndex) => {
      chunks.push({
        id: `${idPrefix}-table-${tableIndex + 1}`,
        sourceLabel: `${sourceLabel} - ${table.title}`,
        usage: [
          usage,
          table.recommendedUse === 'schedule_of_activities'
            ? 'Use this structured table preferentially for Schedule of Activities generation.'
            : table.recommendedUse === 'study_schema'
              ? 'Use this structured table preferentially for Study Schema generation.'
              : 'Use this structured table as source evidence.'
        ].join(' '),
        type: 'file',
        index: startIndex + chunks.length,
        text: [
          `STRUCTURED TABLE: ${table.title}`,
          `Recommended use: ${table.recommendedUse}`,
          `Extraction confidence: ${table.confidence}`,
          table.headers?.length ? table.headers.join(' | ') : '',
          ...(table.rows || []).map(row => row.join(' | '))
        ].filter(Boolean).join('\n')
      })
    })

    structuredExtraction.images?.forEach((image, imageIndex) => {
      chunks.push({
        id: `${idPrefix}-image-${imageIndex + 1}`,
        sourceLabel: `${sourceLabel} - ${image.filename || 'embedded image'}`,
        usage: `${usage} ${
          image.recommendedUse === 'study_schema'
            ? 'Use this figure preferentially for Study Schema generation and preserve the documented flow as closely as possible.'
            : 'Treat this as a figure/image needing user confirmation or vision/OCR interpretation before exact protocol use.'
        }`,
        type: 'file',
        index: startIndex + chunks.length,
        text: [
          `IMAGE / FIGURE DETECTED: ${image.filename || image.id}`,
          `Recommended use: ${image.recommendedUse}`,
          image.visionSummary ? `Vision/OCR interpretation:\n${image.visionSummary}` : '',
          image.note
        ].filter(Boolean).join('\n')
      })
    })

    return chunks
  }

  const createStudySchemaSourceFigure = (structuredExtraction: StructuredDocumentExtraction | null | undefined, sourceLabel: string) => {
    const image = structuredExtraction?.images?.find(item => item.recommendedUse === "study_schema")
    if (!image) return null

    const imageDataUri = image.imageDataUri || (image as any).dataUri

    return {
      sourceLabel: image.source || sourceLabel,
      pageHint: image.filename || image.id,
      imageDataUri,
      extractedText: image.visionSummary || image.note || "",
      confidence: image.visionSummary ? "medium" : "low",
    }
  }

  const mergeSourceFigureIntoStudySchema = (existingStudySchema: any, sourceFigure: any) => {
    if (!sourceFigure) return existingStudySchema
    let parsed: any = null
    if (typeof existingStudySchema === "string" && existingStudySchema.trim()) {
      try {
        parsed = JSON.parse(existingStudySchema)
      } catch {
        parsed = null
      }
    } else if (existingStudySchema && typeof existingStudySchema === "object") {
      parsed = existingStudySchema
    }

    const presentationSchema = parsed?.presentationSchema || parsed || {}
    return JSON.stringify({
      presentationSchema: {
        ...presentationSchema,
        mode: presentationSchema.mode || "timeline",
        renderMode: sourceFigure.imageDataUri ? "source_image" : presentationSchema.renderMode,
        sourceStatus: presentationSchema.sourceStatus || "found",
        sourceStatusMessage: presentationSchema.sourceStatusMessage || "Source study schema figure detected during upload.",
        sourceFigure,
        timelineSchema: presentationSchema.timelineSchema || {
          periods: [],
          arms: [],
          cells: [],
          milestones: [],
          connectors: [],
        },
      },
    })
  }

  // Handle synopsis change
  const handleSynopsisChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newSynopsis = e.target.value
    setSynopsis(newSynopsis)
    
    // Update the protocol object immediately with the new synopsis
    setProtocol(prev => ({
      ...prev,
      synopsis: newSynopsis
    }))
    
    // Reset assessment when synopsis changes
    if (aiAssessment) {
      clearSourceAssessmentReport()
    }
  }

  // Handle file upload
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    try {
      // Create a FormData object to send the file
      const formData = new FormData()
      formData.append('file', file)
      // Also send the protocol type so the backend can use it
      formData.append('protocolType', protocol.protocolType || 'interventional_clinical_trial')
      // Include protocol ID if it exists to ensure we're updating the correct protocol
      if (protocol.id) {
        formData.append('protocolId', protocol.id)
        console.log("Sending protocol ID with upload:", protocol.id)
      }
      
      // Show loading state
      setIsAnalyzing(true)
      
      // Call the API endpoint for file processing
      const response = await fetch('/api/upload-synopsis', {
        method: 'POST',
        body: formData,
      })
      
      if (!response.ok) {
        throw new Error(`Error uploading file: ${response.statusText}`)
      }
      
      const data = await response.json()
      const structuredExtraction = data.structuredExtraction as StructuredDocumentExtraction | undefined
      const browserExtraction = stripLargeSourceArtifactsForUploadExtraction(structuredExtraction) as StructuredDocumentExtraction | undefined
      
      // Update the synopsis with the extracted text
      setSynopsis(data.text)
      setFileContent(data.text)
      setFileUploaded(true)
      setLastExtraction(browserExtraction || null)
      
      // Update the protocol object with the new synopsis and protocol data from server
      // This ensures we have the correct protocol ID for subsequent API calls
      if (data.protocol) {
        console.log("Updating protocol with server data:", data.protocol.id)
        const sourceFigure = createStudySchemaSourceFigure(browserExtraction, file.name)
        setProtocol(prev => ({
          ...prev,
          ...data.protocol,
          synopsis: data.text, // Ensure we use the latest extracted text
          sourceExtraction: browserExtraction,
          studySchema: mergeSourceFigureIntoStudySchema(data.protocol.studySchema || prev.studySchema, sourceFigure)
        }))
      } else {
        // Fallback if protocol data wasn't returned
        const sourceFigure = createStudySchemaSourceFigure(browserExtraction, file.name)
        setProtocol(prev => ({
          ...prev,
          synopsis: data.text,
          sourceExtraction: browserExtraction,
          studySchema: mergeSourceFigureIntoStudySchema(prev.studySchema, sourceFigure)
        }))
      }
    } catch (error) {
      console.error("Error uploading file:", error)
      alert("Failed to upload file. Please try again or paste the content manually.")
    } finally {
      setIsAnalyzing(false)
    }
  }

  // Handle analyze with AI
  const handleAnalyzeWithAI = async () => {
    if (!synopsis.trim()) return

    setIsAnalyzing(true)
    clearSourceAssessmentReport()

    try {
      // Call the API to analyze the synopsis with protocol type
      const response = await fetch('/api/analyze-synopsis', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          synopsis,
          protocolType: protocol.protocolType || 'interventional_clinical_trial',
          protocolId: protocol.id // Include protocol ID to ensure we're working with the same protocol
        }),
      })

      if (!response.ok) {
        throw new Error(`Error: ${response.statusText}`)
      }

      const data = await response.json()
      const sourceAssessmentReport: SourceAssessmentReport = data.sourceAssessment || {
        assessment: data.assessment,
        readinessLevel: data.readinessLevel,
        extractedFields: Array.isArray(data.extractedFields) ? data.extractedFields : [],
        elements: Array.isArray(data.elements) ? data.elements : [],
        missingElements: Array.isArray(data.missingElements) ? data.missingElements : [],
        sourceDocumentsNeeded: Array.isArray(data.sourceDocumentsNeeded) ? data.sourceDocumentsNeeded : [],
        nextSteps: Array.isArray(data.nextSteps) ? data.nextSteps : [],
        sourceUseRecommendations: Array.isArray(data.sourceUseRecommendations) ? data.sourceUseRecommendations : [],
        studyLogicAssessment: Array.isArray(data.studyLogicAssessment) ? data.studyLogicAssessment : [],
        assumptionsRequiringReview: Array.isArray(data.assumptionsRequiringReview) ? data.assumptionsRequiringReview : [],
        generatedAt: data.generatedAt || new Date().toISOString()
      }

      applySourceAssessmentReport(sourceAssessmentReport)
      
      // Store both missing elements and element statuses
      if (data.missingElements) {
        setMissingElements(data.missingElements)
      }
      
      // Set analyzedAt timestamp when AI analysis completes and ensure protocol type is in sync
      setProtocol(prev => {
        // Update the protocol with returned data and server timestamp
        // IMPORTANT: Always prioritize the existing protocol type to prevent AI from overriding user selection
        // We explicitly check if the protocol's type has been set by the user, and if so, we don't update it
        const updatedProtocol = {
          ...prev,
          analyzedAt: new Date(),
          sourceAssessment: sourceAssessmentReport,
          components: Array.isArray(data.protocol?.components) ? data.protocol.components : prev.components,
          // Always prioritize the user's existing protocol type choice
          protocolType: prev.protocolType || data.protocolType || data.protocol?.protocolType || 'interventional_clinical_trial'
        };
        
        console.log('Updating protocol after analysis:', {
          previousType: prev.protocolType,
          responseType: data.protocolType,
          updatedType: updatedProtocol.protocolType
        });
        
        // Log a warning if AI tried to suggest a different protocol type
        if (data.protocolType && data.protocolType !== prev.protocolType && prev.protocolType) {
          console.warn(`AI suggested protocol type ${data.protocolType} but keeping user selection ${prev.protocolType}`);
        }
        
        return updatedProtocol;
      })
      
      // Store detailed element statuses if available, with improvements to match recommendations
      if (data.elements && Array.isArray(data.elements)) {
        // First, ensure elements have the correct status type and initial completeness percentage
        const initialElements: ElementStatus[] = data.elements.map((element: any) => {
          // Use completeness from API if available, otherwise infer from status
          let completeness = element.completeness;
          if (completeness === undefined) {
            // Infer a completeness score if not provided by API
            if (element.status === "missing") completeness = 0;
            else if (element.status === "partial") completeness = 50;
            else if (element.status === "complete") completeness = 100;
            else completeness = 0;
          }
          
          return {
            element: element.element,
            status: (element.status === "missing" || element.status === "partial" || element.status === "complete") 
              ? element.status as "missing" | "partial" | "complete" 
              : "partial" as const, // Default to partial if invalid status
            details: element.details || "",
            completeness: completeness
          };
        });
        
        // Now adjust completeness based on recommendations
        // Sometimes API marks elements as complete (100%) but includes them in recommendations
        const adjustedElements: ElementStatus[] = initialElements.map((element: ElementStatus) => {
          // Check if this element is mentioned in any recommendations
          const matchingRecommendation = data.missingElements?.find((rec: string) => {
            const normalized = rec.toLowerCase();
            return normalized.includes(element.element.toLowerCase()) ||
                   element.element.toLowerCase().includes("title") && normalized.includes("title") ||
                   element.element.toLowerCase().includes("criter") && normalized.includes("inclusion") ||
                   element.element.toLowerCase().includes("duration") && normalized.includes("duration") ||
                   element.element.toLowerCase().includes("justification") && normalized.includes("sample size") ||
                   element.element.toLowerCase().includes("analysis") && normalized.includes("statistical");
          });
          
          // If element has a matching recommendation but is marked complete, make it partial
          if (matchingRecommendation) {
            // Element name in lowercase for matching
            const elementLower = element.element.toLowerCase();
            
            // Apply different completeness scores based on the specific element
            let completenessScore;
            if (elementLower.includes("title")) {
              // For title elements, check if it's about identity or just formatting
              completenessScore = matchingRecommendation.toLowerCase().includes("not clearly") ? 75 : 30;
            } 
            else if (elementLower.includes("design")) {
              completenessScore = 80; // Design is usually well-described but might be missing details
            }
            else if (elementLower.includes("population") || elementLower.includes("criteria")) {
              // For inclusion/exclusion, check how much is mentioned
              completenessScore = matchingRecommendation.toLowerCase().includes("some criteria") ? 60 : 30;
            }
            else if (elementLower.includes("duration")) {
              // For timeline elements, check if duration is mentioned but not detailed
              completenessScore = matchingRecommendation.toLowerCase().includes("mentioned") ? 45 : 20;
            }
            else if (elementLower.includes("sample size")) {
              // For sample size, check if there's a calculation or just a number
              completenessScore = matchingRecommendation.toLowerCase().includes("mentioned") ? 40 : 15;
            }
            else if (elementLower.includes("statistical")) {
              // For statistical analysis plan
              completenessScore = matchingRecommendation.toLowerCase().includes("outlined") ? 55 : 25;
            }
            else {
              // Default partial score for other elements
              completenessScore = 65;
            }
            
            return {
              ...element,
              status: "partial" as const,
              completeness: completenessScore,
              details: matchingRecommendation // Use the recommendation as the details
            };
          }
          
          // For elements NOT in recommendations, make sure they're actually 100% complete
          // If they're marked complete but have a low score, keep the score
          if (element.status === "complete" && element.completeness !== undefined && element.completeness < 100) {
            return element;
          }
          
          return element;
        });
        
        setElementStatuses(adjustedElements)
      } else {
        // Create basic statuses from missingElements if detailed are not available
        const missingFromData = Array.isArray(data.missingElements) ? data.missingElements : [];
        const statusElements = [
          "Study title and identifier",
          "Study objectives (primary and secondary)",
          "Study design (randomization, blinding, etc.)",
          "Study population (inclusion/exclusion criteria)",
          "Intervention details",
          "Primary and secondary endpoints",
          "Study duration and timeline",
          "Sample size justification",
          "Statistical analysis plan"
        ].map(element => {
          const isMissing = missingFromData.some(
            (missing: string) => missing.toLowerCase().includes(element.toLowerCase())
          );
          
          return {
            element,
            status: isMissing ? "missing" as const : "complete" as const,
            details: isMissing ? `${element} is missing from the synopsis` : `${element} is present in the synopsis`,
            completeness: isMissing ? 0 : 100
          };
        });
        
        setElementStatuses(statusElements);
      }
      
    } catch (error) {
      console.error("Error analyzing synopsis:", error)
      setAiAssessment("Error occurred during analysis. Please try again.")
      setSourceReadiness(null)
      setExtractedFields([])
      setSourceDocumentsNeeded([])
      setNextSteps([])
      setMissingElements(["The source readiness check could not be completed. Try running the analysis again."])
      setElementStatuses([])
    } finally {
      setIsAnalyzing(false)
    }
  }

  const handleExportSourceAssessment = async () => {
    if (!aiAssessment || isExportingAssessment) return

    setIsExportingAssessment(true)
    try {
      const report = buildCurrentSourceAssessmentReport()
      const response = await fetch('/api/export-source-assessment', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          protocol: {
            id: protocol.id,
            title: protocol.title,
            protocolType: protocol.protocolType,
            phase: protocol.phase,
            indication: protocol.indication,
          },
          report
        }),
      })

      if (!response.ok) {
        throw new Error(`Export failed: ${response.statusText}`)
      }

      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `${protocol.id || 'protocol'}-source-assessment-report.docx`
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.URL.revokeObjectURL(url)
    } catch (error) {
      console.error("Error exporting source assessment:", error)
      alert("Failed to export the source assessment report. Please try again.")
    } finally {
      setIsExportingAssessment(false)
    }
  }

  // Handle continue to next tab (without generating components)
  const handleContinueToNextTab = async () => {
    if (!synopsis.trim()) return
    
    setIsGenerating(true)
    
    try {
      // Update protocol with synopsis and supplementary info only
      setProtocol(prev => ({
        ...prev,
        synopsis: synopsis,
        supplementaryInfo: supplementaryInfo
      }))
      
      // Brief delay to show the processing state
      await new Promise(resolve => setTimeout(resolve, 500))
      
      // Navigate to the next tab
      onGenerateProtocol()
    } catch (error) {
      console.error("Error updating protocol:", error)
    } finally {
      setIsGenerating(false)
    }
  }
  
  // Enhanced supplementary info handlers
  const handleAddSupplementaryInfo = () => {
    if (!newSupplementaryInfo.trim()) return
    
    // Create new supplementary item with unique ID
    const id = `text-${Date.now()}`
    const usage = showContextField && newSupplementaryContext.trim()
      ? newSupplementaryContext.trim()
      : 'Use as supporting reference for protocol generation.'
    const newItem: SupplementaryItem = {
      id,
      text: newSupplementaryInfo,
      type: 'text',
      context: usage,
      ragChunks: createSupplementaryChunks(newSupplementaryInfo, `Supplementary note`, usage, 'text', id)
    }
    
    const updatedInfo = [...supplementaryInfo, newItem]
    setSupplementaryInfo(updatedInfo)
    
    // Update the main protocol object with supplementary info
    setProtocol(prev => ({
      ...prev,
      supplementaryInfo: updatedInfo
    }))
    
    // Reset input fields
    setNewSupplementaryInfo("")
    setNewSupplementaryContext("")
    setShowContextField(false)
  }

  // Handle supplementary file upload
  const handleSupplementaryFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    
    try {
      const currentFileCount = supplementaryInfo.filter(item => item.type === 'file').length
      if (currentFileCount >= MAX_SUPPLEMENTARY_FILES) {
        alert(`You can upload up to ${MAX_SUPPLEMENTARY_FILES} supplementary files. Remove an existing file before adding another.`)
        return
      }

      if (file.size > MAX_SUPPLEMENTARY_FILE_SIZE_BYTES) {
        alert(`This file is larger than ${MAX_SUPPLEMENTARY_FILE_SIZE_MB} MB. Use a smaller file or split it into focused documents before uploading.`)
        return
      }

      setUploadingSupplementaryFile(true)
      
      const usage = supplementaryFileUsage.trim() || DEFAULT_SUPPLEMENTARY_FILE_USAGE
      const formData = new FormData()
      formData.append('file', file)
      formData.append('usage', usage)

      const response = await fetch('/api/upload-supplementary', {
        method: 'POST',
        body: formData,
      })

      if (!response.ok) {
        throw new Error(`Error uploading supplementary file: ${response.statusText}`)
      }

      const data = await response.json()
      const fileContent = String(data.text || "")
      const structuredExtraction = data.structuredExtraction as StructuredDocumentExtraction | undefined
      const browserExtraction = stripLargeSourceArtifactsForUploadExtraction(structuredExtraction) as StructuredDocumentExtraction | undefined
      const baseChunks = createSupplementaryChunks(fileContent, file.name, usage, 'file', `file-${Date.now()}`)
      const structuredChunks = createStructuredExtractionChunks(
        browserExtraction,
        file.name,
        usage,
        `file-${Date.now()}-structured`,
        baseChunks.length + 1
      )
      
      // Create new supplementary item with file content
      const id = `file-${Date.now()}`
      const newItem: SupplementaryItem = {
        id,
        text: `Reference file: ${file.name}`,
        type: 'file',
        fileContent: fileContent,
        fileName: file.name,
        context: usage,
        structuredExtraction: browserExtraction,
        ragChunks: [
          ...baseChunks.map((chunk, index) => ({ ...chunk, id: `${id}-chunk-${index + 1}`, index: index + 1 })),
          ...structuredChunks.map((chunk, index) => ({ ...chunk, id: `${id}-structured-${index + 1}`, index: baseChunks.length + index + 1 }))
        ]
      }
      
      const updatedInfo = [...supplementaryInfo, newItem]
      setSupplementaryInfo(updatedInfo)
      
      // Update the main protocol object with supplementary info
      setProtocol(prev => ({
        ...prev,
        supplementaryInfo: updatedInfo,
        studySchema: mergeSourceFigureIntoStudySchema(
          (prev as any).studySchema,
          createStudySchemaSourceFigure(browserExtraction, file.name)
        )
      }))
      setSupplementaryFileUsage(DEFAULT_SUPPLEMENTARY_FILE_USAGE)
      
    } catch (error) {
      console.error("Error reading supplementary file:", error)
      alert("Failed to upload file. Please try again.")
    } finally {
      setUploadingSupplementaryFile(false)
      
      // Clear the file input
      const fileInput = document.getElementById('supplementary-file-upload') as HTMLInputElement
      if (fileInput) fileInput.value = ''
    }
  }

  // Add protocol reference
  const handleAddProtocolReference = () => {
    if (!newSupplementaryInfo.trim()) return
    
    // Create new reference item
    const id = `ref-${Date.now()}`
    const usage = newSupplementaryContext || 'Use as a reference for this protocol'
    const newItem: SupplementaryItem = {
      id,
      text: newSupplementaryInfo,
      type: 'reference',
      context: usage,
      ragChunks: createSupplementaryChunks(newSupplementaryInfo, `Protocol reference`, usage, 'reference', id)
    }
    
    const updatedInfo = [...supplementaryInfo, newItem]
    setSupplementaryInfo(updatedInfo)
    
    // Update the main protocol object with supplementary info
    setProtocol(prev => ({
      ...prev,
      supplementaryInfo: updatedInfo
    }))
    
    // Reset input fields
    setNewSupplementaryInfo("")
    setNewSupplementaryContext("")
    setShowContextField(false)
  }

  const handleEditSupplementaryInfo = (index: number) => {
    const item = supplementaryInfo[index]
    setEditingIndex(index)
    setEditText(item.text)
    setEditContext(item.context || '')
  }

  const handleSaveEdit = (index: number) => {
    const item = supplementaryInfo[index]
    const updatedInfo = [...supplementaryInfo]
    const usage = editContext || item.context || 'Use as supporting reference for protocol generation.'
    const sourceLabel = item.fileName || (item.type === 'reference' ? 'Protocol reference' : 'Supplementary note')
    const contentForChunks = item.fileContent || editText
    
    updatedInfo[index] = {
      ...item,
      text: editText,
      context: usage,
      ragChunks: createSupplementaryChunks(contentForChunks, sourceLabel, usage, item.type, item.id)
    }
    
    setSupplementaryInfo(updatedInfo)
    
    // Update the main protocol object with edited supplementary info
    setProtocol(prev => ({
      ...prev,
      supplementaryInfo: updatedInfo
    }))
    
    // Reset editing state
    setEditingIndex(null)
    setEditText("")
    setEditContext("")
  }

  const handleCancelEdit = () => {
    setEditingIndex(null)
    setEditText("")
    setEditContext("")
  }

  const handleDeleteSupplementaryInfo = (index: number) => {
    const updatedInfo = supplementaryInfo.filter((_, i) => i !== index)
    setSupplementaryInfo(updatedInfo)
    
    // Update the main protocol object after deleting supplementary info
    setProtocol(prev => ({
      ...prev,
      supplementaryInfo: updatedInfo
    }))
  }
  
  // Toggle context field visibility
  const toggleContextField = () => {
    setShowContextField(!showContextField)
  }

  const supplementaryFileCount = supplementaryInfo.filter(item => item.type === 'file').length
  const supplementaryCharacterCount = getSupplementaryTextLength(supplementaryInfo)
  const supplementaryLoadWarning =
    supplementaryFileCount >= MAX_SUPPLEMENTARY_FILES
      ? `File limit reached. Remove a file before uploading another.`
    : supplementaryFileCount >= WARNING_SUPPLEMENTARY_FILES
        ? `You have ${supplementaryFileCount} supplementary files. RAG will retrieve relevant chunks, but focused files with clear instructions give better results.`
        : supplementaryCharacterCount >= WARNING_SUPPLEMENTARY_CHARACTERS
          ? `Large supplementary content detected. The app will retrieve chunks instead of sending full files, but precise file instructions will improve selection.`
          : ""

  const processGuideSteps = [
    {
      title: "1. Start with synopsis or PED",
      icon: FileInput,
      description: "This is the study foundation. The app extracts design, population, objectives, treatments, endpoints, visits, and known protocol facts.",
      output: "Primary source facts",
    },
    {
      title: "2. Check source readiness",
      icon: Activity,
      description: "AI identifies what is strong, partial, unclear, or missing before you build protocol sections.",
      output: "Missing inputs and useful source documents",
    },
    {
      title: "3. Add supporting sources",
      icon: FileText,
      description: "Upload focused references such as an IB, SmPC, prior protocol, SAP example, or Schedule of Activities example. Add instructions for each file.",
      output: "RAG-ready reference chunks",
    },
    {
      title: "4. Review each section",
      icon: Microscope,
      description: "Each tab reviews the available source content and recommends whether to use source text, improve it, or generate missing content.",
      output: "Section-level recommendation",
    },
    {
      title: "5. Keep user control",
      icon: Check,
      description: "You accept the recommendation or choose a different approach. AI should support decisions, not silently decide the final protocol.",
      output: "Accepted section decision",
    },
    {
      title: "6. Use boilerplate carefully",
      icon: Lightbulb,
      description: "Boilerplate is for standard language and sponsor/regulatory wording. It should not replace study-specific evidence from source documents.",
      output: "Controlled standard text",
    },
    {
      title: "7. Run final input review",
      icon: AlertTriangle,
      description: "The Generate tab checks tab outputs plus required protocol sections such as title, synopsis, administrative details, safety, and statistical content.",
      output: "Final gaps and placeholders",
    },
    {
      title: "8. Generate protocol",
      icon: FileText,
      description: "The final document uses accepted section decisions, user edits, retrieved source context, boilerplate, and placeholders for unresolved missing information.",
      output: "Protocol draft with traceable AI use",
    },
  ]

  return (
    <div className="space-y-6">
      <Dialog open={showProcessGuide} onOpenChange={setShowProcessGuide}>
        <DialogContent className="max-h-[88vh] max-w-5xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>How Protocol Generation Works</DialogTitle>
            <DialogDescription>
              A quick guide to how source documents, AI review, supporting references, boilerplate, and final generation fit together.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5">
            <div className="overflow-hidden rounded-md border border-[#d0ebff] bg-white">
              <img
                src="/protocol-process-guide.png"
                alt="Schematic workflow showing how protocol sources, AI review, user decisions, boilerplate, and final generation fit together"
                className="w-full"
              />
            </div>

            <div className="rounded-md border border-[#d0ebff] bg-[#f8fbff] p-4">
              <div className="grid gap-3 md:grid-cols-4">
                <div className="rounded-md border border-[#d0ebff] bg-white p-3">
                  <p className="text-xs font-medium uppercase tracking-wide text-[#1c7ed6]">Source document</p>
                  <p className="mt-1 text-sm text-[#495057]">Factual study foundation from synopsis, PED, protocol, IB, SmPC, or other references.</p>
                </div>
                <div className="rounded-md border border-[#d0ebff] bg-white p-3">
                  <p className="text-xs font-medium uppercase tracking-wide text-[#1c7ed6]">AI improved</p>
                  <p className="mt-1 text-sm text-[#495057]">Source facts are preserved, wording is made protocol-ready, and clear gaps are filled.</p>
                </div>
                <div className="rounded-md border border-[#d0ebff] bg-white p-3">
                  <p className="text-xs font-medium uppercase tracking-wide text-[#1c7ed6]">AI generated</p>
                  <p className="mt-1 text-sm text-[#495057]">Content is created when the source is missing or too thin, with assumptions shown for review.</p>
                </div>
                <div className="rounded-md border border-[#d0ebff] bg-white p-3">
                  <p className="text-xs font-medium uppercase tracking-wide text-[#1c7ed6]">Boilerplate</p>
                  <p className="mt-1 text-sm text-[#495057]">Reusable standard language. Best for common regulatory or sponsor wording, not study facts.</p>
                </div>
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              {processGuideSteps.map((step, index) => {
                const StepIcon = step.icon
                return (
                  <div key={step.title} className="rounded-md border border-[#e9ecef] bg-white p-4">
                    <div className="flex items-start gap-3">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-[#e7f5ff] text-[#1c7ed6]">
                        <StepIcon size={18} />
                      </div>
                      <div>
                        <h3 className="text-sm font-medium text-[#212529]">{step.title}</h3>
                        <p className="mt-1 text-sm leading-6 text-[#5c6773]">{step.description}</p>
                        <div className="mt-2 inline-flex items-center rounded-full border border-[#dee2e6] bg-[#f8f9fa] px-2.5 py-1 text-xs text-[#495057]">
                          Output: {step.output}
                        </div>
                      </div>
                    </div>
                    {index < processGuideSteps.length - 1 && (
                      <div className="mt-3 hidden items-center gap-2 text-xs text-[#868e96] md:flex">
                        <ArrowRight size={14} />
                        Next controlled step
                      </div>
                    )}
                  </div>
                )
              })}
            </div>

            <div className="grid gap-3 md:grid-cols-3">
              <div className="rounded-md border border-[#fff3bf] bg-[#fff9db] p-4">
                <h3 className="text-sm font-medium text-[#8a5a00]">When information is missing</h3>
                <p className="mt-1 text-sm leading-6 text-[#5c4b00]">
                  The app should flag the gap, suggest a source document when needed, or use a visible placeholder for user confirmation.
                </p>
              </div>
              <div className="rounded-md border border-[#d3f9d8] bg-[#ebfbee] p-4">
                <h3 className="text-sm font-medium text-[#2b8a3e]">Where RAG helps</h3>
                <p className="mt-1 text-sm leading-6 text-[#2b5a35]">
                  Uploaded references are indexed into chunks, then relevant parts are retrieved for each tab instead of sending every file every time.
                </p>
              </div>
              <div className="rounded-md border border-[#ffc9c9] bg-[#fff5f5] p-4">
                <h3 className="text-sm font-medium text-[#c92a2a]">What AI should not do</h3>
                <p className="mt-1 text-sm leading-6 text-[#704343]">
                  It should not invent source facts, hide assumptions, or overwrite user decisions without review.
                </p>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Card className="border-[#dee2e6] shadow-sm">
        <CardHeader>
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div>
              <CardTitle className="flex items-center gap-2 text-lg">
                <span>Study Synopsis</span>
                {synopsis && (
                  <Badge variant="outline" className="border-[#d3f9d8] bg-[#ebfbee] text-[#2b8a3e]">
                    Source content
                  </Badge>
                )}
              </CardTitle>
              <CardDescription>
                Enter or upload your clinical study synopsis to generate protocol components
              </CardDescription>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="w-fit border-[#d0ebff] bg-[#f8fbff] text-[#1864ab] hover:bg-[#e7f5ff]"
              onClick={() => setShowProcessGuide(true)}
            >
              <Activity size={14} className="mr-2" />
              Process Guide
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {/* Protocol Type Selector */}
            <div className="flex flex-col space-y-2">
              <label htmlFor="protocol-type" className="text-sm font-medium text-[#52606d]">
                Protocol Type
              </label>
              <Select
                value={protocol.protocolType || 'interventional_clinical_trial'}
                onValueChange={(value) => {
                  // Update the protocol type
                  setProtocol(prev => ({
                    ...prev,
                    protocolType: value
                  }));
                }}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select protocol type" />
                </SelectTrigger>
                <SelectContent>
                  {protocolTypes.map((type) => (
                    <SelectItem key={type} value={type}>
                      {type in protocolTypeConfig 
                        ? protocolTypeConfig[type as keyof typeof protocolTypeConfig].label 
                        : type.replace(/_/g, ' ')}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {protocol.protocolType && protocol.protocolType in protocolTypeConfig ? 
                  protocolTypeConfig[protocol.protocolType as keyof typeof protocolTypeConfig].description : 
                  'Select a protocol type to continue'}
              </p>
            </div>

            <div className="flex flex-col space-y-2">
              <div className="flex justify-between">
                <label htmlFor="synopsis" className="text-sm font-medium text-[#52606d]">
                  Synopsis Text
                </label>
                <div className="flex items-center gap-2">
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div className="text-xs px-2 py-1 rounded bg-[#e7f5ff] border border-[#74c0fc] text-[#1864ab]">
                          {protocol.protocolType && protocol.protocolType in protocolTypeConfig 
                            ? protocolTypeConfig[protocol.protocolType as keyof typeof protocolTypeConfig].label 
                            : 'Clinical Trial'}
                        </div>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p className="text-xs max-w-[200px]">
                          The selected protocol type will be used when generating study components
                        </p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs text-[#228be6]"
                    onClick={() => {
                      const fileInput = document.getElementById('file-upload')
                      if (fileInput) {
                        fileInput.click()
                      }
                    }}
                  >
                    <Upload size={14} className="mr-1" />
                    Upload File
                  </Button>
                </div>
                <input
                  id="file-upload"
                  type="file"
                  accept=".txt,.doc,.docx,.pdf"
                  className="hidden"
                  onChange={handleFileUpload}
                />
              </div>
              <Textarea
                id="synopsis"
                value={synopsis}
                onChange={handleSynopsisChange}
                placeholder="Enter or paste your study synopsis here..."
                className="min-h-[200px] text-sm"
              />
            </div>

            {fileUploaded && (
              <Alert className="bg-[#e7f5ff] border-[#74c0fc] text-[#1864ab]">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>File uploaded successfully</AlertTitle>
                <AlertDescription>
                  The content has been loaded into the synopsis editor as a{' '}
                  <span className="font-medium">
                    {protocol.protocolType && protocol.protocolType in protocolTypeConfig 
                      ? protocolTypeConfig[protocol.protocolType as keyof typeof protocolTypeConfig].label 
                      : 'clinical trial'} protocol
                  </span>. 
                  {lastExtraction?.extractionSummary ? ` ${lastExtraction.extractionSummary}` : ' You can now analyze it with AI.'}
                  {lastExtraction?.warnings && lastExtraction.warnings.length > 0 && (
                    <div className="mt-2 text-xs">
                      {lastExtraction.warnings.slice(0, 2).map((warning, index) => (
                        <div key={index}>Note: {warning}</div>
                      ))}
                    </div>
                  )}
                </AlertDescription>
              </Alert>
            )}

            <div className="flex space-x-2">
              <Button
                type="button"
                variant="outline"
                className="text-sm text-[#228be6] font-medium bg-[#e7f5ff] border border-[#228be6]/20 hover:bg-[#e7f5ff]/70"
                onClick={handleAnalyzeWithAI}
                disabled={!synopsis.trim() || isAnalyzing}
              >
                {isAnalyzing ? "Analyzing..." : "Analyze with AI"}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {aiAssessment && (
        <Card className="border-[#dee2e6] shadow-sm">
          <CardHeader>
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div>
                <CardTitle className="text-lg">Protocol Source Assessment</CardTitle>
                <CardDescription>
                  Source-use plan and study logic review before section generation
                </CardDescription>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge
                  variant="outline"
                  className={
                    sourceReadiness === "ready"
                      ? "border-[#b2f2bb] bg-[#ebfbee] text-[#2b8a3e]"
                      : sourceReadiness === "insufficient"
                        ? "border-[#ffc9c9] bg-[#fff5f5] text-[#c92a2a]"
                        : sourceReadiness === "partial"
                          ? "border-[#ffe066] bg-[#fff9db] text-[#8a5a00]"
                          : "border-[#dee2e6] bg-[#f8f9fa] text-[#495057]"
                  }
                >
                  {sourceReadiness === "ready"
                    ? "Good foundation"
                    : sourceReadiness === "insufficient"
                      ? "More source needed"
                      : sourceReadiness === "partial"
                        ? "Partial foundation"
                        : "Review failed"}
                </Badge>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="gap-2"
                  onClick={handleExportSourceAssessment}
                  disabled={isExportingAssessment}
                >
                  {isExportingAssessment ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    <Download size={14} />
                  )}
                  Export Report
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-5">
              <div className="rounded-md border border-[#dee2e6] bg-[#f8f9fa] p-4">
                <p className="text-sm leading-6 text-[#343a40]">{aiAssessment}</p>
                {assessmentGeneratedAt && (
                  <p className="mt-2 text-xs text-[#868e96]">
                    Reviewed {new Date(assessmentGeneratedAt).toLocaleString()}
                  </p>
                )}
              </div>

              {sourceUseRecommendations.length > 0 && (
                <div>
                  <div className="mb-3 flex items-center gap-2">
                    <ClipboardList size={16} className="text-[#1c7ed6]" />
                    <h3 className="text-sm font-medium text-[#495057]">Recommended Source Use Plan</h3>
                  </div>
                  <div className="grid grid-cols-1 gap-3">
                    {sourceUseRecommendations.map((recommendation, index) => (
                      <div key={`${recommendation.protocolArea}-${index}`} className="rounded-md border border-[#e9ecef] p-4">
                        <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
                          <div>
                            <p className="text-sm font-medium text-[#212529]">{recommendation.protocolArea}</p>
                            <p className="mt-1 text-xs uppercase tracking-wide text-[#868e96]">
                              Source status: {recommendation.sourceStatus}
                            </p>
                          </div>
                          <Badge variant="outline" className={getRecommendationBadgeClass(recommendation.recommendedAction)}>
                            {getRecommendationLabel(recommendation.recommendedAction)}
                          </Badge>
                        </div>
                        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                          <div className="rounded-md bg-[#f8f9fa] p-3">
                            <p className="mb-1 text-xs font-medium uppercase tracking-wide text-[#868e96]">Why</p>
                            <p className="text-sm leading-5 text-[#343a40]">{recommendation.why}</p>
                          </div>
                          <div className="rounded-md bg-[#f8f9fa] p-3">
                            <p className="mb-1 text-xs font-medium uppercase tracking-wide text-[#868e96]">Proposed handling</p>
                            <p className="text-sm leading-5 text-[#343a40]">{recommendation.proposedHandling}</p>
                          </div>
                        </div>
                        {recommendation.sourceEvidence && (
                          <p className="mt-3 text-xs leading-5 text-[#5c6773]">
                            <span className="font-medium text-[#495057]">Evidence:</span> {recommendation.sourceEvidence}
                          </p>
                        )}
                        {Array.isArray(recommendation.specificWeakPoints) && recommendation.specificWeakPoints.length > 0 && (
                          <div className="mt-3 rounded-md border border-[#ffe066] bg-[#fff9db] p-3">
                            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-[#8a5a00]">Specific weak points</p>
                            <ul className="list-disc space-y-1 pl-5">
                              {recommendation.specificWeakPoints.map((weakPoint, weakIndex) => (
                                <li key={`${recommendation.protocolArea}-weak-${weakIndex}`} className="text-sm leading-5 text-[#5c3b00]">
                                  {weakPoint}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                        {Array.isArray(recommendation.proposedAdditions) && recommendation.proposedAdditions.length > 0 && (
                          <div className="mt-3 rounded-md border border-[#d0ebff] bg-[#f1f8ff] p-3">
                            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-[#1864ab]">Concrete proposed additions</p>
                            <div className="space-y-3">
                              {recommendation.proposedAdditions.map((addition, additionIndex) => (
                                <div key={`${recommendation.protocolArea}-addition-${additionIndex}`} className="rounded border border-[#d0ebff] bg-white p-3">
                                  <p className="text-sm leading-5 text-[#212529]">{addition.draftText}</p>
                                  <p className="mt-2 text-xs leading-5 text-[#5c6773]">
                                    <span className="font-medium text-[#495057]">Why:</span> {addition.whyNeeded}
                                  </p>
                                  {(addition.sourceBasis || addition.requiresUserConfirmation) && (
                                    <p className="mt-1 text-xs leading-5 text-[#5c6773]">
                                      {addition.sourceBasis && (
                                        <>
                                          <span className="font-medium text-[#495057]">Basis:</span> {addition.sourceBasis}
                                        </>
                                      )}
                                      {addition.requiresUserConfirmation && (
                                        <span className="ml-2 font-medium text-[#c92a2a]">Requires confirmation</span>
                                      )}
                                    </p>
                                  )}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                        {Array.isArray(recommendation.medicalWriterQuestions) && recommendation.medicalWriterQuestions.length > 0 && (
                          <div className="mt-3 rounded-md border border-[#e9ecef] bg-white p-3">
                            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-[#495057]">Questions for team</p>
                            <ul className="list-disc space-y-1 pl-5">
                              {recommendation.medicalWriterQuestions.map((question, questionIndex) => (
                                <li key={`${recommendation.protocolArea}-question-${questionIndex}`} className="text-sm leading-5 text-[#343a40]">
                                  {question}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {studyLogicAssessment.length > 0 && (
                <div>
                  <div className="mb-3 flex items-center gap-2">
                    <Brain size={16} className="text-[#7048e8]" />
                    <h3 className="text-sm font-medium text-[#495057]">Study Logic Assessment</h3>
                  </div>
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    {studyLogicAssessment.map((assessment, index) => (
                      <div key={`${assessment.area}-${index}`} className="rounded-md border border-[#e9ecef] p-4">
                        <div className="mb-2 flex items-start justify-between gap-2">
                          <p className="text-sm font-medium text-[#212529]">{assessment.area}</p>
                          {assessment.riskLevel && (
                            <Badge
                              variant="outline"
                              className={
                                assessment.riskLevel === "high"
                                  ? "border-[#ffc9c9] bg-[#fff5f5] text-[#c92a2a]"
                                  : assessment.riskLevel === "medium"
                                    ? "border-[#ffe066] bg-[#fff9db] text-[#8a5a00]"
                                    : "border-[#b2f2bb] bg-[#ebfbee] text-[#2b8a3e]"
                              }
                            >
                              {assessment.riskLevel} risk
                            </Badge>
                          )}
                        </div>
                        <p className="text-sm font-medium text-[#343a40]">{assessment.conclusion}</p>
                        <p className="mt-2 text-xs leading-5 text-[#5c6773]">{assessment.reasoning}</p>
                        {assessment.recommendedFollowUp && (
                          <p className="mt-2 text-xs leading-5 text-[#364fc7]">
                            <span className="font-medium">Follow-up:</span> {assessment.recommendedFollowUp}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {extractedFields.length > 0 && (
                <div>
                  <h3 className="mb-3 text-sm font-medium text-[#495057]">Key Facts Found</h3>
                  <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                    {extractedFields.map((field, index) => (
                      <div key={`${field.label}-${index}`} className="rounded-md border border-[#e9ecef] p-3">
                        <div className="mb-1 flex items-center justify-between gap-2">
                          <p className="text-xs font-medium uppercase tracking-wide text-[#868e96]">{field.label}</p>
                          {field.status !== "found" && (
                            <Badge variant="outline" className="border-[#ffe066] bg-[#fff9db] text-[#8a5a00]">
                              {field.status === "missing" ? "Not found" : "Unclear"}
                            </Badge>
                          )}
                        </div>
                        <p className="text-sm text-[#343a40]">{field.value || "Not found"}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {elementStatuses.length > 0 && (
                <div>
                  <h3 className="mb-3 text-sm font-medium text-[#495057]">Protocol Input Coverage</h3>
                  <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                    {elementStatuses.map((element, index) => (
                      <div key={`${element.element}-${index}`} className="rounded-md border border-[#e9ecef] p-3">
                        <div className="mb-2 flex items-start justify-between gap-3">
                          <p className="text-sm font-medium text-[#343a40]">{element.element}</p>
                          <Badge
                            variant="outline"
                            className={
                              element.status === "complete"
                                ? "border-[#b2f2bb] bg-[#ebfbee] text-[#2b8a3e]"
                                : element.status === "missing"
                                  ? "border-[#ffc9c9] bg-[#fff5f5] text-[#c92a2a]"
                                  : "border-[#ffe066] bg-[#fff9db] text-[#8a5a00]"
                            }
                          >
                            {element.status === "complete" ? "Found" : element.status === "missing" ? "Missing" : "Partial"}
                          </Badge>
                        </div>
                        {element.status !== "complete" && (
                          <p className="text-xs leading-5 text-[#5c6773]">{getActionableElementDetails(element)}</p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <div className="rounded-md border border-[#ffe066] bg-[#fff9db] p-4">
                  <div className="mb-2 flex items-center gap-2">
                    <AlertTriangle size={16} className="text-[#f08c00]" />
                    <h3 className="text-sm font-medium text-[#8a5a00]">Missing or Weak Inputs</h3>
                  </div>
                  {missingElements.length > 0 ? (
                    <ul className="ml-5 list-disc space-y-1 text-sm text-[#5c4b00]">
                      {missingElements.map((element, index) => (
                        <li key={index}>{element}</li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-sm text-[#5c6773]">No major missing inputs were identified in this intake check.</p>
                  )}
                </div>

                <div className="rounded-md border border-[#d0ebff] bg-[#f8fbff] p-4">
                  <div className="mb-2 flex items-center gap-2">
                    <FileText size={16} className="text-[#1c7ed6]" />
                    <h3 className="text-sm font-medium text-[#1c4d75]">Useful Additional Sources</h3>
                  </div>
                  {sourceDocumentsNeeded.length > 0 ? (
                    <ul className="ml-5 list-disc space-y-1 text-sm text-[#364fc7]">
                      {sourceDocumentsNeeded.map((document, index) => (
                        <li key={index}>{document}</li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-sm text-[#5c6773]">No specific additional source document was flagged as required.</p>
                  )}
                </div>
              </div>

              {assumptionsRequiringReview.length > 0 && (
                <div className="rounded-md border border-[#ffd8a8] bg-[#fff9f0] p-4">
                  <div className="mb-2 flex items-center gap-2">
                    <AlertCircle size={16} className="text-[#f08c00]" />
                    <h3 className="text-sm font-medium text-[#8a5a00]">Assumptions Requiring Team Review</h3>
                  </div>
                  <ul className="ml-5 list-disc space-y-1 text-sm text-[#5c4b00]">
                    {assumptionsRequiringReview.map((assumption, index) => (
                      <li key={index}>{assumption}</li>
                    ))}
                  </ul>
                </div>
              )}

              {nextSteps.length > 0 && (
                <div className="rounded-md border border-[#dee2e6] p-4">
                  <h3 className="mb-2 text-sm font-medium text-[#495057]">Suggested Next Step</h3>
                  <ul className="ml-5 list-disc space-y-1 text-sm text-[#343a40]">
                    {nextSteps.map((step, index) => (
                      <li key={index}>{step}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}
      
      <Card className="border-[#dee2e6] shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg">Supplementary Information</CardTitle>
          <CardDescription>
            Add additional details that may not be in the synopsis but are needed for protocol generation
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-6">
            {/* Input methods tabs */}
            <Tabs defaultValue="text" className="w-full">
              <TabsList className="mb-2">
                <TabsTrigger value="text">Text</TabsTrigger>
                <TabsTrigger value="file">File</TabsTrigger>
                <TabsTrigger value="reference">Protocol Reference</TabsTrigger>
              </TabsList>
              
              <TabsContent value="text">
                <div className="space-y-3">
                  <div className="flex flex-col gap-2">
                    <Textarea
                      value={newSupplementaryInfo}
                      onChange={(e) => setNewSupplementaryInfo(e.target.value)}
                      placeholder="Add additional study information, notes, or requirements..."
                      className="text-sm min-h-[100px] resize-y"
                    />
                    
                    {/* Context field toggle */}
                    {!showContextField ? (
                      <Button 
                        type="button" 
                        variant="outline" 
                        size="sm"
                        onClick={toggleContextField} 
                        className="w-fit text-xs"
                      >
                        <Plus size={12} className="mr-1" />
                        Add usage instructions
                      </Button>
                    ) : (
                      <div className="space-y-2">
                        <label className="text-xs text-muted-foreground">
                          Explain how this information should be used:
                        </label>
                        <Textarea
                          value={newSupplementaryContext}
                          onChange={(e) => setNewSupplementaryContext(e.target.value)}
                          placeholder="e.g., 'Use for dosing schedule' or 'Include in inclusion criteria'"
                          className="text-xs min-h-[60px]"
                        />
                      </div>
                    )}
                  </div>
                  
                  <Button
                    type="button"
                    onClick={handleAddSupplementaryInfo}
                    className="w-full"
                    disabled={!newSupplementaryInfo.trim()}
                  >
                    <Plus size={16} className="mr-1" />
                    Add Text
                  </Button>
                </div>
              </TabsContent>
              
              <TabsContent value="file">
                <div className="space-y-4">
                  <div className="rounded-md border border-[#d0ebff] bg-[#f8fbff] p-3 text-sm text-[#364fc7]">
                    Add files one by one. First write the instruction for the next file, then upload that file. Each uploaded file keeps its own saved instruction and can be edited later.
                  </div>

                  <div className="space-y-2">
                    <div>
                      <label className="text-sm font-medium text-[#52606d]">
                        1. Instruction for the next file
                      </label>
                      <p className="text-xs text-[#868e96]">
                        Example: use only for Schedule of Activities, use only as wording style, or treat as source of truth.
                      </p>
                    </div>
                    <Select
                      value={supplementaryFileUsage}
                      onValueChange={setSupplementaryFileUsage}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Select usage guidance" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Use information from this file as supporting reference for protocol generation.">
                          Supporting reference
                        </SelectItem>
                        <SelectItem value="Treat this file as the source of truth when it conflicts with other uploaded information.">
                          Source of truth
                        </SelectItem>
                        <SelectItem value="Use this file for protocol structure, formatting, and wording style only; do not copy study-specific facts unless explicitly present in the synopsis.">
                          Template and style only
                        </SelectItem>
                        <SelectItem value="Use this file only for the sections or details described in the instruction below.">
                          Specific sections only
                        </SelectItem>
                      </SelectContent>
                    </Select>
                    <Textarea
                      value={supplementaryFileUsage}
                      onChange={(e) => setSupplementaryFileUsage(e.target.value)}
                      placeholder="Example: Use this file for Schedule of Activities and safety monitoring only. Do not use its eligibility criteria."
                      className="min-h-[72px] text-sm"
                    />
                    <p className="text-xs text-[#868e96]">
                      This instruction will be saved only with the next uploaded file. The app indexes each file and retrieves the most relevant parts for each protocol tab.
                    </p>
                  </div>

                  {supplementaryLoadWarning && (
                    <Alert className="border-[#fcc419] bg-[#fff9db] text-[#8a5a00]">
                      <AlertTriangle className="h-4 w-4" />
                      <AlertTitle>Supplementary content warning</AlertTitle>
                      <AlertDescription>{supplementaryLoadWarning}</AlertDescription>
                    </Alert>
                  )}

                  <div className="border-2 border-dashed rounded-md p-6 text-center bg-[#f8f9fa]">
                    <FileText size={30} className="mx-auto mb-2 text-[#adb5bd]" />
                    <p className="text-sm mb-2">
                      2. {supplementaryFileCount > 0 ? "Add another file with this instruction" : "Upload the first supplementary file"}
                    </p>
                    <p className="text-xs text-[#868e96] mb-4">
                      PDF, DOCX, TXT files supported. Up to {MAX_SUPPLEMENTARY_FILE_SIZE_MB} MB per file. {supplementaryFileCount}/{MAX_SUPPLEMENTARY_FILES} files added.
                    </p>
                    
                    <div className="flex justify-center">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => {
                          const fileInput = document.getElementById('supplementary-file-upload')
                          if (fileInput) {
                            fileInput.click()
                          }
                        }}
                        disabled={uploadingSupplementaryFile || supplementaryFileCount >= MAX_SUPPLEMENTARY_FILES}
                        className="text-sm"
                      >
                        {uploadingSupplementaryFile ? (
                          <>
                            <Loader2 size={16} className="mr-2 animate-spin" />
                            Uploading...
                          </>
                        ) : (
                          <>
                            <Upload size={16} className="mr-2" />
                            {supplementaryFileCount > 0 ? "Add Another File" : "Select File"}
                          </>
                        )}
                      </Button>
                      <input
                        id="supplementary-file-upload"
                        type="file"
                        accept=".txt,.doc,.docx,.pdf"
                        className="hidden"
                        onChange={handleSupplementaryFileUpload}
                      />
                    </div>
                  </div>
                </div>
              </TabsContent>
              
              <TabsContent value="reference">
                <div className="space-y-3">
                  <div className="flex flex-col gap-2">
                    <Input
                      value={newSupplementaryInfo}
                      onChange={(e) => setNewSupplementaryInfo(e.target.value)}
                      placeholder="Reference to another protocol (e.g., 'Use schedule from TITAN-2 Phase 3')"
                      className="text-sm"
                    />
                    
                    <div className="space-y-2">
                      <label className="text-xs text-muted-foreground">
                        What to use from the reference protocol:
                      </label>
                      <Textarea
                        value={newSupplementaryContext}
                        onChange={(e) => setNewSupplementaryContext(e.target.value)}
                        placeholder="e.g., 'Use the same schedule of assessments from this protocol'"
                        className="text-xs min-h-[60px]"
                      />
                    </div>
                  </div>
                  
                  <Button
                    type="button"
                    onClick={handleAddProtocolReference}
                    className="w-full"
                    disabled={!newSupplementaryInfo.trim()}
                  >
                    <LinkIcon size={16} className="mr-1" />
                    Add Reference
                  </Button>
                </div>
              </TabsContent>
            </Tabs>

            {/* List of added supplementary items */}
            <div className="border-t pt-4">
              <h4 className="text-sm font-medium mb-1">Added Information</h4>
              <p className="text-xs text-[#868e96] mb-3">
                Each file, note, or reference keeps its own usage instruction. Use the pencil icon to change it.
              </p>
              
              {supplementaryInfo.length > 0 ? (
                <ul className="space-y-4">
                  {supplementaryInfo.map((item, index) => (
                    <li key={item.id} className="border rounded-md p-3 bg-[#f8f9fa]">
                      {editingIndex === index ? (
                        <div className="space-y-3">
                          <Textarea
                            value={editText}
                            onChange={(e) => setEditText(e.target.value)}
                            className="text-sm min-h-[80px]"
                          />
                          
                          <Textarea
                            value={editContext}
                            onChange={(e) => setEditContext(e.target.value)}
                            placeholder="Usage instructions (optional)"
                            className="text-xs min-h-[60px]"
                          />
                          
                          <div className="flex justify-end space-x-2">
                            <Button 
                              size="sm" 
                              variant="outline" 
                              onClick={handleCancelEdit} 
                              className="text-xs"
                            >
                              Cancel
                            </Button>
                            <Button 
                              size="sm" 
                              onClick={() => handleSaveEdit(index)} 
                              className="text-xs"
                            >
                              Save Changes
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          <div className="flex items-start justify-between">
                            <div className="flex items-center gap-2">
                              {item.type === 'file' && <FileText size={16} className="text-[#4dabf7]" />}
                              {item.type === 'reference' && <LinkIcon size={16} className="text-[#ae3ec9]" />}
                              {item.type === 'text' && <AlertCircle size={16} className="text-[#40c057]" />}
                              <span className="text-xs font-medium uppercase text-[#495057]">
                                {item.type === 'file' ? 'File' : item.type === 'reference' ? 'Reference' : 'Note'}
                              </span>
                            </div>
                            <div className="flex space-x-1">
                              <Button
                                size="icon"
                                variant="ghost"
                                onClick={() => handleEditSupplementaryInfo(index)}
                                className="h-6 w-6 text-[#228be6]"
                              >
                                <Pencil size={12} />
                              </Button>
                              <Button
                                size="icon"
                                variant="ghost"
                                onClick={() => handleDeleteSupplementaryInfo(index)}
                                className="h-6 w-6 text-[#fa5252]"
                              >
                                <X size={12} />
                              </Button>
                            </div>
                          </div>
                          
                          <div className="text-sm">{item.text}</div>
                          
                          {item.context && (
                            <div className="mt-1 p-2 bg-[#e9ecef] rounded text-xs text-[#495057]">
                              <span className="font-medium">Saved instruction:</span> {item.context}
                            </div>
                          )}
                          
                          {item.fileName && (
                            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-[#868e96]">
                              <span>File: {item.fileName}</span>
                              {item.ragChunks && item.ragChunks.length > 0 && (
                                <span className="rounded bg-[#edf2ff] px-2 py-0.5 text-[#364fc7]">
                                  Indexed into {item.ragChunks.length} chunks
                                </span>
                              )}
                              {item.structuredExtraction?.tables && item.structuredExtraction.tables.length > 0 && (
                                <span className="rounded bg-[#e7f5ff] px-2 py-0.5 text-[#1864ab]">
                                  {item.structuredExtraction.tables.length} structured table{item.structuredExtraction.tables.length === 1 ? '' : 's'}
                                </span>
                              )}
                              {item.structuredExtraction?.images && item.structuredExtraction.images.length > 0 && (
                                <span className="rounded bg-[#fff3bf] px-2 py-0.5 text-[#8d6b00]">
                                  {item.structuredExtraction.images.length} image{item.structuredExtraction.images.length === 1 ? '' : 's'} flagged
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="text-center py-6 text-[#adb5bd]">
                  <AlertCircle size={24} className="mx-auto mb-2" />
                  <p className="text-sm">No supplementary information added yet</p>
                  <p className="text-xs mt-1">Add text, files, or references to enhance your protocol</p>
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Removed generation status card as we're now generating components in each individual tab */}

      <div className="flex justify-end">
        <Button
          onClick={handleContinueToNextTab}
          disabled={!synopsis.trim() || isGenerating}
          className="bg-[#228be6] hover:bg-[#1864ab] w-full"
        >
          {isGenerating ? (
            <>
              <Loader2 size={16} className="mr-2 animate-spin" />
              Processing...
            </>
          ) : (
            <>
              <ArrowRight size={16} className="mr-2" />
              Continue to Next Step
            </>
          )}
        </Button>
      </div>
    </div>
  )
}
