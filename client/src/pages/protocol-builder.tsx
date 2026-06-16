"use client"

import React, { useState, useEffect, useMemo, useRef } from "react"
import { useToast } from "@/hooks/use-toast"
import { useRoute } from "wouter"
import {
  ArrowLeft,
  BarChart2,
  Bot,
  ChevronDown,
  Download,
  Save,
  History,
} from "lucide-react"
import { Link } from "wouter"
import { apiRequest } from "@/lib/apiRequest"
import { sanitizeProtocolForLocalCache, sanitizeProtocolForReview } from "@/lib/protocol-sanitize"
import { safeSetLocalStorageItem } from "@/lib/browser-storage-recovery"
import { Button } from "@/components/ui/button"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { CompareTrialsModal } from "@/components/compare-trials-modal"
import { ComparisonSummaryPanel } from "@/components/comparison-summary-panel"
import { ComparisonLegend } from "@/components/comparison-legend"
import { AIChatAssistant } from "@/components/ai-chat-assistant"
import { GenerateProtocol } from "@/components/generate-protocol"
import ScheduleOfActivities from "@/components/schedule-of-activities"
import InclusionExclusionCriteria from "@/components/simple-criteria" 
import DataVariables from "@/components/data-variables"
import ProtocolDocument from "@/components/protocol-document"
import StudySchema from "@/components/study-schema"
import StatisticalAnalysisPlan from "@/components/statistical-analysis-plan"
import SafetyDrugHandling from "@/components/safety-drug-handling"
import { Protocol } from "@shared/schema"
import ProtocolSynopsis from "@/components/protocol-synopsis"

// Import MAIC-specific components
import SourceDataConfig from "@/components/maic/source-data-config"
import TargetStudyData from "@/components/maic/target-study-data"
import MatchingAlgorithm from "@/components/maic/matching-algorithm"
import SensitivityAnalysis from "@/components/maic/sensitivity-analysis"

const isEmptyProtocolValue = (value: any) => {
  if (value == null) return true
  if (typeof value === "string") {
    const trimmed = value.trim()
    return !trimmed || trimmed === "[]" || trimmed === "{}" || trimmed === "null"
  }
  if (Array.isArray(value)) return value.length === 0
  if (typeof value === "object") return Object.keys(value).length === 0
  return false
}

const componentByType = (components: any[], type: string) =>
  components.find((component: any) => component?.type === type)?.data

function safeSetLocalStorage(key: string, value: string) {
  safeSetLocalStorageItem(key, value)
}

function parseDesignStatesForHydration(value: any): any[] {
  if (Array.isArray(value)) return value
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value)
      return Array.isArray(parsed) ? parsed : []
    } catch {
      return []
    }
  }
  return []
}

const hydrateProtocolComponents = (protocolData: any) => {
  const components = Array.isArray(protocolData?.components)
    ? protocolData.components
    : typeof protocolData?.components === "string"
      ? (() => {
          try {
            const parsed = JSON.parse(protocolData.components)
            return Array.isArray(parsed) ? parsed : []
          } catch {
            return []
          }
        })()
      : []
  const scheduleComponent = componentByType(components, "scheduleOfActivities")
  const criteriaComponent = componentByType(components, "eligibilityCriteria")
  const variablesComponent = componentByType(components, "dataVariables")
  const schemaComponent = componentByType(components, "studySchema")
  const sapComponent = componentByType(components, "statisticalAnalysisPlan")
  const safetyComponent = componentByType(components, "safetyDrugHandling")
  const sectionInputReviews = components.find((component: any) => component?.type === "sectionInputReviews")?.data || protocolData?.sectionInputReviews || null
  const designStates = parseDesignStatesForHydration(protocolData?.designStates)
  const activeDesignState = designStates.find((state) => state?.id === protocolData?.activeDesignState) || designStates[0]

  return {
    ...protocolData,
    components,
    designStates,
    synopsis: isEmptyProtocolValue(protocolData?.synopsis) ? activeDesignState?.synopsis || "" : protocolData?.synopsis,
    tableHeaders: isEmptyProtocolValue(protocolData?.tableHeaders) ? scheduleComponent?.tableHeaders : protocolData?.tableHeaders,
    tableData: isEmptyProtocolValue(protocolData?.tableData) ? scheduleComponent?.tableData : protocolData?.tableData,
    soaProvenance: protocolData?.soaProvenance || scheduleComponent?.soaProvenance || null,
    soaSourceTables: protocolData?.soaSourceTables || scheduleComponent?.soaSourceTables || null,
    soaTableLayout: protocolData?.soaTableLayout || scheduleComponent?.soaTableLayout || "auto",
    soaSplitAfterIndex: protocolData?.soaSplitAfterIndex || scheduleComponent?.soaSplitAfterIndex || null,
    tableHeaderOrigins: protocolData?.tableHeaderOrigins || scheduleComponent?.tableHeaderOrigins || null,
    inclusionCriteria: isEmptyProtocolValue(protocolData?.inclusionCriteria) ? criteriaComponent?.inclusionCriteria : protocolData?.inclusionCriteria,
    exclusionCriteria: isEmptyProtocolValue(protocolData?.exclusionCriteria) ? criteriaComponent?.exclusionCriteria : protocolData?.exclusionCriteria,
    dataVariables: isEmptyProtocolValue(protocolData?.dataVariables) ? variablesComponent?.dataVariables : protocolData?.dataVariables,
    studySchema: isEmptyProtocolValue(protocolData?.studySchema) ? schemaComponent?.studySchema : protocolData?.studySchema,
    statisticalAnalysisPlan: isEmptyProtocolValue(protocolData?.statisticalAnalysisPlan) ? sapComponent?.statisticalAnalysisPlan : protocolData?.statisticalAnalysisPlan,
    safetyDrugHandling: protocolData?.safetyDrugHandling || safetyComponent || null,
    sectionInputReviews,
  }
}

const SECTION_INPUT_REVIEW_SECTIONS = [
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
]

function stableStringifyForReview(value: any) {
  try {
    return JSON.stringify(value ?? "")
  } catch {
    return String(value ?? "")
  }
}

function upsertSectionInputReviewsComponent(components: any[], data: any) {
  const now = new Date().toISOString()
  const existing = components.find((component) => component?.type === "sectionInputReviews")
  return [
    ...components.filter((component) => component?.type !== "sectionInputReviews"),
    {
      designStateId: existing?.designStateId || "default",
      type: "sectionInputReviews",
      data,
      createdAt: existing?.createdAt || now,
      updatedAt: now,
    }
  ]
}

function upsertComponentSnapshot(components: any[], type: string, data: any, designStateId?: string) {
  const now = new Date().toISOString()
  const existing = components.find((component) => component?.type === type)
  return [
    ...components.filter((component) => component?.type !== type),
    {
      designStateId: existing?.designStateId || designStateId || "default",
      type,
      data,
      createdAt: existing?.createdAt || now,
      updatedAt: now,
    }
  ]
}

function normalizeComponents(value: any): any[] {
  if (Array.isArray(value)) return value
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value)
      return Array.isArray(parsed) ? parsed : []
    } catch {
      return []
    }
  }
  return []
}

function buildProtocolComponentsSnapshot(protocol: any, designStateId?: string) {
  let components = normalizeComponents(protocol.components)

  components = upsertComponentSnapshot(components, "scheduleOfActivities", {
    tableHeaders: protocol.tableHeaders,
    tableData: protocol.tableData,
    soaProvenance: protocol.soaProvenance,
    soaSourceTables: protocol.soaSourceTables,
    soaTableLayout: protocol.soaTableLayout,
    soaSplitAfterIndex: protocol.soaSplitAfterIndex,
    tableHeaderOrigins: protocol.tableHeaderOrigins,
  }, designStateId)

  components = upsertComponentSnapshot(components, "eligibilityCriteria", {
    inclusionCriteria: protocol.inclusionCriteria,
    exclusionCriteria: protocol.exclusionCriteria,
  }, designStateId)

  components = upsertComponentSnapshot(components, "dataVariables", {
    dataVariables: protocol.dataVariables,
  }, designStateId)

  components = upsertComponentSnapshot(components, "studySchema", {
    studySchema: protocol.studySchema,
  }, designStateId)

  components = upsertComponentSnapshot(components, "statisticalAnalysisPlan", {
    statisticalAnalysisPlan: protocol.statisticalAnalysisPlan,
  }, designStateId)

  if (protocol.safetyDrugHandling) {
    components = upsertComponentSnapshot(components, "safetyDrugHandling", protocol.safetyDrugHandling, designStateId)
  }

  if ((protocol as any).sectionInputReviews) {
    components = upsertSectionInputReviewsComponent(components, (protocol as any).sectionInputReviews)
  }

  return components
}

function getCachedGeneratedProtocol(protocolId: string, current?: any) {
  if (current && current !== "[]" && current !== "{}") {
    return typeof current === "string" ? current : JSON.stringify(current)
  }
  return current || "[]"
}

function serializeProtocolForSave(protocol: any, designStateId?: string) {
  return {
    id: protocol.id,
    title: protocol.title,
    phase: protocol.phase || "Phase 1",
    indication: protocol.indication || "Not specified",
    status: protocol.status || "Draft",
    synopsis: protocol.synopsis || "",
    protocolType: protocol.protocolType || "interventional_clinical_trial",
    supplementaryInfo: typeof protocol.supplementaryInfo === 'string'
      ? protocol.supplementaryInfo
      : JSON.stringify(protocol.supplementaryInfo || []),
    createdBy: protocol.createdBy || "User",
    userId: protocol.userId || 1,
    tableData: typeof protocol.tableData === 'string'
      ? protocol.tableData
      : JSON.stringify(protocol.tableData || {}),
    tableHeaders: typeof protocol.tableHeaders === 'string'
      ? protocol.tableHeaders
      : JSON.stringify(protocol.tableHeaders || []),
    inclusionCriteria: typeof protocol.inclusionCriteria === 'string'
      ? protocol.inclusionCriteria
      : JSON.stringify(protocol.inclusionCriteria || []),
    exclusionCriteria: typeof protocol.exclusionCriteria === 'string'
      ? protocol.exclusionCriteria
      : JSON.stringify(protocol.exclusionCriteria || []),
    dataVariables: typeof protocol.dataVariables === 'string'
      ? protocol.dataVariables
      : JSON.stringify(protocol.dataVariables || []),
    studySchema: typeof protocol.studySchema === 'string'
      ? protocol.studySchema
      : JSON.stringify(protocol.studySchema || { nodes: [], edges: [] }),
    statisticalAnalysisPlan: typeof protocol.statisticalAnalysisPlan === 'string'
      ? protocol.statisticalAnalysisPlan
      : JSON.stringify(protocol.statisticalAnalysisPlan || {
        sampleSize: { total: 0, perArm: 0, justification: "" },
        primaryEndpoints: [],
        secondaryEndpoints: [],
        analysisPopulations: [],
        statisticalMethods: []
      }),
    generatedProtocol: getCachedGeneratedProtocol(protocol.id, protocol.generatedProtocol),
    overview: protocol.overview || null,
    designStates: protocol.designStates || [],
    activeDesignState: protocol.activeDesignState || null,
    components: buildProtocolComponentsSnapshot(protocol, designStateId),
  }
}

const ProtocolBuilder: React.FC = () => {
  const [, params] = useRoute("/protocol/:id")
  
  // Protocol data state with empty initial values
  const [protocol, setProtocol] = useState<Protocol>({
    id: params?.id || "EV-NEW-5636", 
    title: "New Clinical Protocol",
    phase: "Phase 1",
    indication: "Not specified",
    status: "Draft",
    createdBy: "User",
    userId: 1,
    createdAt: new Date(),
    lastEdited: new Date(),
    synopsis: "",
    protocolType: "interventional_clinical_trial", // Default to interventional clinical trial
    supplementaryInfo: JSON.stringify([]),
    tableData: JSON.stringify({}),
    tableHeaders: JSON.stringify([]),
    inclusionCriteria: JSON.stringify([]),
    exclusionCriteria: JSON.stringify([]),
    dataVariables: JSON.stringify([]),
    studySchema: JSON.stringify({ nodes: [], edges: [] }),
    statisticalAnalysisPlan: JSON.stringify({
      sampleSize: { total: 0, perArm: 0, justification: "" },
      primaryEndpoints: [],
      secondaryEndpoints: [],
      analysisPopulations: [],
      statisticalMethods: []
    }),
    components: [],
    safetyDrugHandling: null,
    generatedProtocol: null
  } as any)
  
  // UI state management
  const [activeTab, setActiveTab] = useState("synopsis")
  const [showAiAssistant, setShowAiAssistant] = useState(false)
  const [showCompareModal, setShowCompareModal] = useState(false)
  const [showComparisonSummary, setShowComparisonSummary] = useState(false)
  const [comparisonData, setComparisonData] = useState<{ selectedTrials: string[]; comparisonType: string } | null>(null)
  const sectionReviewInFlightRef = useRef<string | null>(null)
  const [hasLoadedProtocol, setHasLoadedProtocol] = useState(false)

  const protocolForReview = useMemo(() => sanitizeProtocolForReview(protocol), [protocol])
  const sectionInputReviewSignature = useMemo(() => stableStringifyForReview({
    version: "section-review-v2",
    protocolId: protocolForReview.id,
    protocolType: protocolForReview.protocolType,
    synopsis: protocolForReview.synopsis,
    supplementaryInfo: protocolForReview.supplementaryInfo,
    sourceExtraction: (protocolForReview as any).sourceExtraction,
  }), [
    protocolForReview.id,
    protocolForReview.protocolType,
    protocolForReview.synopsis,
    protocolForReview.supplementaryInfo,
    (protocolForReview as any).sourceExtraction,
  ])

  const runAllSectionInputReviews = React.useCallback((force = false) => {
    if (!protocol?.id || !protocol.synopsis || protocol.synopsis.trim().length < 50) return
    if (sectionReviewInFlightRef.current === sectionInputReviewSignature) return

    const existingReview = (protocol as any).sectionInputReviews
    if (!force && existingReview?.signature === sectionInputReviewSignature && existingReview?.reviews) {
      return
    }

    const cacheKey = `protocol-${protocol.id}-section-input-reviews-v2`
    if (!force) {
      try {
        const cached = localStorage.getItem(cacheKey)
        if (cached) {
          const parsed = JSON.parse(cached)
          if (parsed?.signature === sectionInputReviewSignature && parsed?.reviews) {
            setProtocol(prev => ({
              ...(prev as any),
              sectionInputReviewStatus: "complete",
              sectionInputReviews: parsed,
              components: upsertSectionInputReviewsComponent(
                Array.isArray((prev as any).components) ? (prev as any).components : [],
                parsed
              )
            } as any))
            return
          }
        }
      } catch (error) {
        console.error("Error loading cached section input reviews:", error)
      }
    }

    sectionReviewInFlightRef.current = sectionInputReviewSignature
    setProtocol(prev => ({
      ...(prev as any),
      sectionInputReviewStatus: "running",
      sectionInputReviewStartedAt: new Date().toISOString(),
    } as any))

    fetch("/api/review-all-section-inputs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        protocol: protocolForReview,
        sections: SECTION_INPUT_REVIEW_SECTIONS,
        signature: sectionInputReviewSignature,
      }),
    })
      .then(async response => {
        if (!response.ok) {
          throw new Error(`All-section review failed with status ${response.status}`)
        }
        return response.json()
      })
      .then(reviewRecord => {
        safeSetLocalStorage(cacheKey, JSON.stringify(reviewRecord))
        setProtocol(prev => ({
          ...(prev as any),
          sectionInputReviewStatus: "complete",
          sectionInputReviews: reviewRecord,
          components: upsertSectionInputReviewsComponent(
            Array.isArray((prev as any).components) ? (prev as any).components : [],
            reviewRecord
          )
        } as any))
      })
      .catch(error => {
        console.error("Error running background section input reviews:", error)
        setProtocol(prev => ({
          ...(prev as any),
          sectionInputReviewStatus: "error",
        } as any))
      })
      .finally(() => {
        sectionReviewInFlightRef.current = null
      })
  }, [protocol, protocolForReview, sectionInputReviewSignature])
  
  // Effect to save protocol state when it changes
  useEffect(() => {
    if (hasLoadedProtocol && protocol?.id) {
      // Don't save if we just loaded the protocol (to prevent overwriting with incomplete data)
      if (protocol.lastEdited) {
        console.log("Saving protocol state to localStorage");
        safeSetLocalStorage(`protocol_${protocol.id}`, JSON.stringify(sanitizeProtocolForLocalCache({
          ...protocol,
          lastEdited: new Date() // Update last edited time
        })));
      }
    }
  }, [protocol, hasLoadedProtocol]);

  useEffect(() => {
    if (hasLoadedProtocol) {
      runAllSectionInputReviews(false)
    }
  }, [runAllSectionInputReviews, hasLoadedProtocol])
  
  // Design state management
  const [activeDesignState, setActiveDesignState] = useState<any>(null)
  
  // Effect to save protocol state whenever active tab changes to ensure persistence
  useEffect(() => {
    // Only save if protocol has an id (existing protocol)
    if (hasLoadedProtocol && protocol.id && protocol.id !== "EV-NEW-5636") {
      // Create a protocol copy to save to localStorage
      const protocolToSave = {
        ...protocol,
        // Ensure tableData and tableHeaders are properly stored as objects/arrays
        tableData: typeof protocol.tableData === 'string' ? 
          (() => { try { return JSON.parse(protocol.tableData as any) } catch { return {} } })() : protocol.tableData,
        tableHeaders: typeof protocol.tableHeaders === 'string' ? 
          (() => { try { return JSON.parse(protocol.tableHeaders as any) } catch { return [] } })() : protocol.tableHeaders,
        lastEdited: new Date()
      }
      
      console.log("Saving protocol to localStorage on tab change:", protocolToSave)
      safeSetLocalStorage(`protocol_${protocol.id}`, JSON.stringify(sanitizeProtocolForLocalCache(protocolToSave)))
    }
  }, [activeTab, protocol.id, hasLoadedProtocol])

  // Toast for notifications
  const { toast } = useToast()
  const [isSaving, setIsSaving] = useState(false)
  const backendAutosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!hasLoadedProtocol || !protocol?.id || protocol.id.startsWith("EV-NEW")) return

    const payload = serializeProtocolForSave(protocol, activeDesignState?.id)
    try {
      safeSetLocalStorage(`protocol_${protocol.id}`, JSON.stringify(sanitizeProtocolForLocalCache({
        ...hydrateProtocolComponents(protocol),
        components: payload.components,
        lastEdited: new Date()
      })))
    } catch (error) {
      console.error("Error updating local protocol cache:", error)
    }

    if (backendAutosaveTimerRef.current) {
      clearTimeout(backendAutosaveTimerRef.current)
    }

    backendAutosaveTimerRef.current = setTimeout(() => {
      apiRequest(`/api/protocols/${protocol.id}`, "PUT", payload).catch((error) => {
        console.error("Autosave failed:", error)
      })
    }, 1500)

    return () => {
      if (backendAutosaveTimerRef.current) {
        clearTimeout(backendAutosaveTimerRef.current)
      }
    }
  }, [protocol, activeDesignState?.id, hasLoadedProtocol])

  // Load protocol data on component mount
  useEffect(() => {
    const protocolId = params?.id || "EV-NEW-5636"
    const loadProtocol = async () => {
      setHasLoadedProtocol(false)
      try {
        console.log("Loading protocol data for ID:", protocolId);
        
        // Generated protocols are intentionally loaded from the API only. They can exceed
        // browser storage quotas, so localStorage is used only for lightweight draft state.
        try {
          localStorage.removeItem(`protocol-${protocolId}-generated`);
        } catch {}
        
        // Always fetch fresh protocol data from API first to get latest component data
        try {
          const data = await apiRequest(`/api/protocols/${protocolId}`)
          if (data) {
            console.log("Protocol loaded from API with data:", {
              inclusionCriteria: Array.isArray(data.inclusionCriteria) ? data.inclusionCriteria.length : 'not array',
              exclusionCriteria: Array.isArray(data.exclusionCriteria) ? data.exclusionCriteria.length : 'not array',
              tableData: typeof data.tableData === 'object' ? Object.keys(data.tableData).length : 'not object',
              tableHeaders: Array.isArray(data.tableHeaders) ? data.tableHeaders.length : 'not array'
            });
            
            // Set protocol with fresh API data and generated protocol if available
            setProtocol({
              ...hydrateProtocolComponents(data),
              lastEdited: new Date(data.lastEdited), // Convert date string to Date object
              generatedProtocol: data.generatedProtocol
            } as any)
            console.log("Protocol loaded from API with generatedProtocol:", !!data.generatedProtocol);
            
            // Update localStorage with fresh data (but preserve generated protocol cache)
            safeSetLocalStorage(`protocol_${protocolId}`, JSON.stringify(sanitizeProtocolForLocalCache({
              ...hydrateProtocolComponents(data),
              lastEdited: new Date(), // Use current time as lastEdited
            })))
          }
        } catch (apiError) {
          console.error("Error loading protocol from API:", apiError);
          
          // Fallback to localStorage only if API fails
          const savedProtocol = localStorage.getItem(`protocol_${protocolId}`)
          if (savedProtocol) {
            try {
              const parsedProtocol = JSON.parse(savedProtocol)
              
              // Merge with generated protocol if available
              setProtocol({
                ...hydrateProtocolComponents(parsedProtocol),
                lastEdited: new Date(parsedProtocol.lastEdited), // Convert date string back to Date object
                generatedProtocol: parsedProtocol.generatedProtocol
              } as any)
              console.log("Protocol loaded from localStorage fallback with generatedProtocol:", !!parsedProtocol.generatedProtocol);
            } catch (e) {
              console.error("Error parsing protocol from localStorage:", e)
              try {
                localStorage.removeItem(`protocol_${protocolId}`)
              } catch {}
            }
          }
        }

        // Always try to fetch the active design state
        try {
          const designState = await apiRequest(`/api/protocols/${protocolId}/active-design-state`)
          console.log("Active design state loaded:", designState)
          
          if (designState) {
            setActiveDesignState(designState)
            
            // Update protocol with the design state's protocol type if available
            if (designState.protocolType) {
              console.log(`Updating protocol type from design state: ${designState.protocolType}`)
              setProtocol(prev => ({
                ...prev,
                protocolType: designState.protocolType
              }))
            }
          }
        } catch (designError) {
          console.error("Error loading active design state:", designError)
          // Protocol might be new, so we won't show an error to the user
        }
      } catch (error) {
        console.error("Error loading protocol:", error)
        // If both localStorage and API fail, we keep the default protocol state
      } finally {
        setHasLoadedProtocol(true)
      }
    }
    
    loadProtocol()
  }, [params?.id])

  // Effect to handle tab switching when protocol type changes
  useEffect(() => {
    // If the current active tab is not applicable for the protocol type, switch to a valid one
    const invalidTabForType = 
      (activeTab === "schedule" && 
        !(protocol.protocolType === "interventional_clinical_trial" || 
          protocol.protocolType === "prospective_cohort_study")) ||
      (activeTab === "criteria" && 
        (protocol.protocolType === "delphi_consensus" || protocol.protocolType === "maic")) ||
      (activeTab === "sourceData" && protocol.protocolType !== "maic") ||
      (activeTab === "targetStudy" && protocol.protocolType !== "maic") ||
      (activeTab === "matching" && protocol.protocolType !== "maic") ||
      (activeTab === "sensitivity" && protocol.protocolType !== "maic") ||
      (activeTab === "safetyDrugHandling" && protocol.protocolType !== "interventional_clinical_trial") ||
      (activeTab === "variables" && protocol.protocolType === "maic");

    if (invalidTabForType) {
      // Default to synopsis if the current tab is not valid
      setActiveTab("synopsis");
    }
  }, [protocol.protocolType, activeTab]);
  
  // Handle save protocol
  const handleSaveProtocol = async () => {
    setIsSaving(true)
    
    try {
      // Check if the protocol already exists
      let exists = false;
      try {
        const checkResponse = await apiRequest(`/api/protocols/${protocol.id}`);
        exists = !!checkResponse; // If we get a response, the protocol exists
      } catch (error) {
        // Protocol doesn't exist, which is fine for creating a new one
        exists = false;
      }
      
      // Format the data for saving, including generated tab content and review decisions.
      const protocolData = serializeProtocolForSave(protocol, activeDesignState?.id)
      
      // Update or create the protocol using apiRequest
      const savedProtocol = await apiRequest(
        exists ? `/api/protocols/${protocol.id}` : `/api/protocols`,
        exists ? 'PUT' : 'POST',
        protocolData
      )
      
      // Save protocol to localStorage for persistence between page refreshes
      // Convert date strings to Date objects before saving
      
      const protocolToSave = {
        ...hydrateProtocolComponents(savedProtocol),
        lastEdited: new Date(), // Use current time for lastEdited
        createdAt: savedProtocol.createdAt ? new Date(savedProtocol.createdAt) : new Date(),
        generatedProtocol: protocolData.generatedProtocol || savedProtocol.generatedProtocol || "[]"
      }
      
      console.log("Saving protocol to localStorage with generatedProtocol:", !!protocolToSave.generatedProtocol)
      safeSetLocalStorage(`protocol_${protocol.id}`, JSON.stringify(sanitizeProtocolForLocalCache(protocolToSave)))
      
      // Show success toast
      toast({
        title: "Protocol Saved",
        description: "Your protocol has been saved successfully.",
      })
      
      // Update the protocol state with the saved version
      // Make sure to preserve generatedProtocol in memory
      setProtocol({
        ...hydrateProtocolComponents(savedProtocol),
        lastEdited: new Date(), // Update the last edited time
        // Preserve the generatedProtocol field - use the one we've just saved to localStorage
        generatedProtocol: protocolToSave.generatedProtocol
      } as any)
    } catch (error) {
      console.error("Error saving protocol:", error)
      toast({
        title: "Error Saving Protocol",
        description: "There was an error saving your protocol. Please try again.",
        variant: "destructive"
      })
    } finally {
      setIsSaving(false)
    }
  }

  // Handle comparison from modal
  const handleCompare = (selectedTrials: string[], comparisonType: string) => {
    setComparisonData({ selectedTrials, comparisonType })
    setShowComparisonSummary(true)
  }

  const sectionInputReviewCount = Object.keys((protocol as any).sectionInputReviews?.reviews || {}).length
  const hasSectionInputReviews = sectionInputReviewCount > 0
  const formatLastEditedTime = (value: unknown) => {
    const date = value instanceof Date ? value : typeof value === "string" || typeof value === "number" ? new Date(value) : null
    return date && !Number.isNaN(date.getTime())
      ? date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      : 'recently'
  }

  return (
    <>
      {/* Top Navigation */}
      <header className="bg-white p-4 border-b border-[#dee2e6] flex justify-between items-center">
        <div className="flex items-center space-x-2">
          <Link href="/" className="text-[#6c757d] hover:text-[#343a40]">
            <ArrowLeft size={18} />
          </Link>
          <div>
            <h1 className="text-lg font-semibold">{protocol.title}</h1>
            <div className="flex items-center text-sm text-[#6c757d]">
              <span>Protocol ID: {protocol.id}</span>
              <span className="mx-2">•</span>
              <span>Last edited: {formatLastEditedTime(protocol.lastEdited)} ago</span>
            </div>
          </div>
        </div>
        <div className="flex items-center space-x-3">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="text-sm"
              >
                <History size={16} className="mr-1.5" />
                <span className="mr-1">Actions</span>
                <ChevronDown size={14} />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-72">
              <DropdownMenuLabel>Optional Tools</DropdownMenuLabel>
              {protocol.protocolType !== "maic" && (
                <DropdownMenuItem
                  onSelect={() => setActiveTab("variables")}
                  className="cursor-pointer"
                >
                  <BarChart2 size={16} className="mr-2 text-[#228be6]" />
                  <div>
                    <div className="font-medium">Data Variables</div>
                    <div className="text-xs text-[#6c757d]">For CRF/data capture planning, not required for protocol generation.</div>
                  </div>
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onSelect={handleSaveProtocol}
                className="cursor-pointer"
              >
                <Save size={16} className="mr-2 text-[#228be6]" />
                Save protocol
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button
            variant="outline"
            size="sm"
            className="text-sm text-[#228be6] font-medium bg-[#e7f5ff] border border-[#228be6]/20 hover:bg-[#e7f5ff]/70"
            onClick={() => setShowAiAssistant(!showAiAssistant)}
          >
            <Bot size={16} className="mr-1.5 ai-icon-animate" />
            AI Assistant
          </Button>
          <Button
            onClick={handleSaveProtocol}
            className="text-sm bg-[#228be6] hover:bg-[#1864ab] text-white"
          >
            <Save size={16} className="mr-1.5" />
            Save
          </Button>
        </div>
      </header>

      {/* Protocol Content Area */}
      <main className="flex-1 p-6">
        {protocol.synopsis && protocol.synopsis.trim().length >= 50 && (
          <div className="mb-4 rounded-md border border-[#d0ebff] bg-[#f8fbff] px-4 py-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-[#1c3d5a]">
                  {((protocol as any).sectionInputReviewStatus === "running")
                    ? "AI is checking protocol inputs in the background"
                    : (((protocol as any).sectionInputReviewStatus === "complete" && hasSectionInputReviews) || hasSectionInputReviews)
                      ? "Protocol input review is available"
                      : ((protocol as any).sectionInputReviewStatus === "error")
                        ? "Protocol input review needs attention"
                        : "Protocol input review will run in the background"}
                </div>
                <p className="text-xs text-[#6c757d]">
                  {((protocol as any).sectionInputReviewStatus === "running")
                    ? "The app is checking Schedule, Criteria, Study Schema, Safety & Drug Handling, and SAP together so recommendations are ready when you open each tab."
                    : hasSectionInputReviews
                      ? `${sectionInputReviewCount} of ${SECTION_INPUT_REVIEW_SECTIONS.length} tab reviews are available. Review and accept recommendations before final generation.`
                      : "This checks what can be used as-is, what needs improvement, and where source information is missing."}
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={(protocol as any).sectionInputReviewStatus === "running"}
                onClick={() => runAllSectionInputReviews(true)}
              >
                {((protocol as any).sectionInputReviewStatus === "running") ? "Reviewing..." : "Run Section Reviews"}
              </Button>
            </div>
          </div>
        )}

        {/* Protocol Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="mb-6">
          <TabsList className="border-b border-[#dee2e6] bg-transparent w-full h-auto rounded-none justify-start">
            {/* Synopsis - Always shown for all protocol types */}
            <TabsTrigger
              value="synopsis"
              className="px-4 py-2 data-[state=active]:border-b-2 data-[state=active]:border-[#228be6] data-[state=active]:text-[#228be6] data-[state=active]:bg-transparent rounded-none"
            >
              Synopsis
            </TabsTrigger>
            
            {/* Overview tab temporarily disabled while we fix UI issues */}
            {false && protocol.overview && protocol.analyzedAt && (
              <TabsTrigger
                value="overview"
                className="px-4 py-2 data-[state=active]:border-b-2 data-[state=active]:border-[#228be6] data-[state=active]:text-[#228be6] data-[state=active]:bg-transparent rounded-none"
              >
                Overview
              </TabsTrigger>
            )}

            {/* Show Schedule of Activities only for interventional trials and prospective cohort studies */}
            {(protocol.protocolType === "interventional_clinical_trial" || 
              protocol.protocolType === "prospective_cohort_study") && (
              <TabsTrigger
                value="schedule"
                className="px-4 py-2 data-[state=active]:border-b-2 data-[state=active]:border-[#228be6] data-[state=active]:text-[#228be6] data-[state=active]:bg-transparent rounded-none"
              >
                Schedule of Activities
              </TabsTrigger>
            )}
            
            {/* Criteria is shown for most protocol types except delphi_consensus and maic */}
            {protocol.protocolType !== "delphi_consensus" && protocol.protocolType !== "maic" && (
              <TabsTrigger
                value="criteria"
                className="px-4 py-2 data-[state=active]:border-b-2 data-[state=active]:border-[#228be6] data-[state=active]:text-[#228be6] data-[state=active]:bg-transparent rounded-none"
              >
                Inclusion/Exclusion Criteria
              </TabsTrigger>
            )}
            
            {/* MAIC-specific tabs */}
            {protocol.protocolType === "maic" && (
              <>
                <TabsTrigger
                  value="sourceData"
                  className="px-4 py-2 data-[state=active]:border-b-2 data-[state=active]:border-[#228be6] data-[state=active]:text-[#228be6] data-[state=active]:bg-transparent rounded-none"
                >
                  Source Data
                </TabsTrigger>
                <TabsTrigger
                  value="targetStudy"
                  className="px-4 py-2 data-[state=active]:border-b-2 data-[state=active]:border-[#228be6] data-[state=active]:text-[#228be6] data-[state=active]:bg-transparent rounded-none"
                >
                  Target Study
                </TabsTrigger>
                <TabsTrigger
                  value="matching"
                  className="px-4 py-2 data-[state=active]:border-b-2 data-[state=active]:border-[#228be6] data-[state=active]:text-[#228be6] data-[state=active]:bg-transparent rounded-none"
                >
                  Matching Algorithm
                </TabsTrigger>
                <TabsTrigger
                  value="sensitivity"
                  className="px-4 py-2 data-[state=active]:border-b-2 data-[state=active]:border-[#228be6] data-[state=active]:text-[#228be6] data-[state=active]:bg-transparent rounded-none"
                >
                  Sensitivity Analysis
                </TabsTrigger>
              </>
            )}
            
            {/* Study Schema is optional for some protocol types - for MAIC it's simplified */}
            <TabsTrigger
              value="studySchema"
              className="px-4 py-2 data-[state=active]:border-b-2 data-[state=active]:border-[#228be6] data-[state=active]:text-[#228be6] data-[state=active]:bg-transparent rounded-none"
            >
              {protocol.protocolType === "maic" ? "Study Flow" : "Study Schema"}
            </TabsTrigger>

            {protocol.protocolType === "interventional_clinical_trial" && (
              <TabsTrigger
                value="safetyDrugHandling"
                className="px-4 py-2 data-[state=active]:border-b-2 data-[state=active]:border-[#228be6] data-[state=active]:text-[#228be6] data-[state=active]:bg-transparent rounded-none"
              >
                Safety & Drug Handling
              </TabsTrigger>
            )}
            
            {/* Statistical Analysis Plan is shown for all protocol types except MAIC (which has its own analysis sections) */}
            {protocol.protocolType !== "maic" && (
              <TabsTrigger
                value="analysisplan"
                className="px-4 py-2 data-[state=active]:border-b-2 data-[state=active]:border-[#228be6] data-[state=active]:text-[#228be6] data-[state=active]:bg-transparent rounded-none"
              >
                Statistical Analysis Plan
              </TabsTrigger>
            )}
            
            {/* Generate is shown for all protocol types */}
            <TabsTrigger
              value="generate"
              className="px-4 py-2 data-[state=active]:border-b-2 data-[state=active]:border-[#228be6] data-[state=active]:text-[#228be6] data-[state=active]:bg-transparent rounded-none"
            >
              Generate
            </TabsTrigger>
            
            {/* Protocol Document is shown for all protocol types */}
            <TabsTrigger
              value="document"
              className="px-4 py-2 data-[state=active]:border-b-2 data-[state=active]:border-[#228be6] data-[state=active]:text-[#228be6] data-[state=active]:bg-transparent rounded-none"
            >
              Protocol Document
            </TabsTrigger>
          </TabsList>

          <TabsContent value="synopsis" className="mt-4">
            <div className="flex justify-between items-center mb-6">
              <div>
                <h2 className="text-xl font-semibold">Protocol Synopsis</h2>
                <p className="text-sm text-[#6c757d]">Define your study synopsis and get AI assistance</p>
              </div>
            </div>
            
            <div>
              <ProtocolSynopsis 
                protocol={protocol}
                setProtocol={setProtocol}
                onGenerateProtocol={() => {
                  // Navigate to the appropriate tab based on protocol type
                  // Overview tab is temporarily disabled, redirect all protocols to appropriate tabs
                  if (protocol.protocolType === 'interventional_clinical_trial' || 
                      protocol.protocolType === 'prospective_cohort_study') {
                    setActiveTab("schedule"); // For interventional trials, go to Schedule tab
                  } else if (protocol.protocolType === 'maic') {
                    setActiveTab("sourceData");
                  } else if (protocol.protocolType === 'delphi_consensus') {
                    setActiveTab("analysisplan");
                  } else {
                    setActiveTab(protocol.protocolType === "secondary_data_analysis" ? "analysisplan" : "criteria");
                  }
                }}
              />
              
              <AIChatAssistant isOpen={showAiAssistant} onClose={() => setShowAiAssistant(false)} protocol={protocol} />
            </div>
          </TabsContent>
          <TabsContent value="schedule" className="mt-4">
            <div className="flex justify-between items-center mb-6">
              <div>
                <h2 className="text-xl font-semibold">Schedule of Activities</h2>
                <p className="text-sm text-[#6c757d]">Define the timing and frequency of study procedures</p>
              </div>
            </div>

            {/* Comparison components removed from Schedule tab */}

            <div>
              <ScheduleOfActivities 
                protocol={protocol} 
                setProtocol={setProtocol}
                activeDesignState={activeDesignState}
                isActive={activeTab === "schedule"}
              />
              
              <AIChatAssistant isOpen={showAiAssistant} onClose={() => setShowAiAssistant(false)} protocol={protocol} />
            </div>
          </TabsContent>

          <TabsContent value="criteria" className="mt-4">
            <div className="flex justify-between items-center mb-6">
              <div>
                <h2 className="text-xl font-semibold">Inclusion/Exclusion Criteria</h2>
                <p className="text-sm text-[#6c757d]">Define eligibility requirements for study participants</p>
              </div>
              <div className="flex items-center space-x-3">
                <Button
                  variant="default"
                  className="text-sm font-medium bg-[#228be6] hover:bg-[#1864ab] text-white"
                  onClick={() => setShowCompareModal(true)}
                >
                  <BarChart2 size={16} className="mr-1.5" />
                  Compare with Similar Trials
                </Button>
              </div>
            </div>
            
            <div>
              <InclusionExclusionCriteria 
                protocol={protocol} 
                setProtocol={setProtocol}
                activeDesignState={activeDesignState}
                isActive={activeTab === "criteria"}
              />
              
              <AIChatAssistant isOpen={showAiAssistant} onClose={() => setShowAiAssistant(false)} protocol={protocol} />
            </div>
          </TabsContent>

          <TabsContent value="variables" className="mt-4">
            <div className="flex justify-between items-center mb-6">
              <div>
                <h2 className="text-xl font-semibold">Optional Data Variables</h2>
                <p className="text-sm text-[#6c757d]">Use this only when you also need CRF, endpoint variable, or data capture planning.</p>
              </div>
            </div>
            
            <div>
              <DataVariables 
                protocol={protocol} 
                setProtocol={setProtocol}
                activeDesignState={activeDesignState}
                isActive={activeTab === "variables"}
              />
              
              <AIChatAssistant isOpen={showAiAssistant} onClose={() => setShowAiAssistant(false)} protocol={protocol} />
            </div>
          </TabsContent>
          
          <TabsContent value="studySchema" className="mt-4">
            <div className="flex justify-between items-center mb-6">
              <div>
                <h2 className="text-xl font-semibold">Study Schema</h2>
                <p className="text-sm text-[#6c757d]">Design the visual flow of your study</p>
              </div>
            </div>

            <div>
              <StudySchema 
                protocol={protocol} 
                setProtocol={setProtocol}
                activeDesignState={activeDesignState}
                isActive={activeTab === "studySchema"}
              />
              
              <AIChatAssistant isOpen={showAiAssistant} onClose={() => setShowAiAssistant(false)} protocol={protocol} />
            </div>
          </TabsContent>

          <TabsContent value="safetyDrugHandling" className="mt-4">
            <div className="flex justify-between items-center mb-6">
              <div>
                <h2 className="text-xl font-semibold">Safety & Drug Handling</h2>
                <p className="text-sm text-[#6c757d]">Control safety reporting, product-specific risks, and trial intervention handling requirements</p>
              </div>
            </div>

            <div>
              <SafetyDrugHandling
                protocol={protocol}
                setProtocol={setProtocol as any}
                activeDesignState={activeDesignState}
                isActive={activeTab === "safetyDrugHandling"}
              />
              
              <AIChatAssistant isOpen={showAiAssistant} onClose={() => setShowAiAssistant(false)} protocol={protocol} />
            </div>
          </TabsContent>
          
          <TabsContent value="analysisplan" className="mt-4">
            <div className="flex justify-between items-center mb-6">
              <div>
                <h2 className="text-xl font-semibold">Statistical Analysis Plan</h2>
                <p className="text-sm text-[#6c757d]">Define endpoints, methods, and sample size calculations</p>
              </div>
            </div>

            <div>
              <StatisticalAnalysisPlan 
                protocol={protocol} 
                setProtocol={setProtocol}
                activeDesignState={activeDesignState}
                isActive={activeTab === "analysisplan"}
              />
              
              <AIChatAssistant isOpen={showAiAssistant} onClose={() => setShowAiAssistant(false)} protocol={protocol} />
            </div>
          </TabsContent>
          
          {/* MAIC-specific tabs content */}
          <TabsContent value="sourceData" className="mt-4">
            <div className="flex justify-between items-center mb-6">
              <div>
                <h2 className="text-xl font-semibold">Source Data Configuration</h2>
                <p className="text-sm text-[#6c757d]">Configure the source dataset containing individual patient data</p>
              </div>
              <div className="flex items-center space-x-3">
                <Button
                  variant="outline"
                  className="text-sm text-[#228be6] font-medium bg-[#e7f5ff] border border-[#228be6]/20 hover:bg-[#e7f5ff]/70"
                  onClick={() => setShowAiAssistant(!showAiAssistant)}
                >
                  <Bot size={16} className="mr-1.5 ai-icon-animate" />
                  AI Assistant
                </Button>
              </div>
            </div>
            
            <div>
              {/* Import the Source Data Configuration component */}
              {protocol.protocolType === "maic" && (
                <SourceDataConfig 
                  protocol={protocol} 
                  setProtocol={setProtocol} 
                />
              )}
              
              <AIChatAssistant isOpen={showAiAssistant} onClose={() => setShowAiAssistant(false)} protocol={protocol} />
            </div>
          </TabsContent>
          
          <TabsContent value="targetStudy" className="mt-4">
            <div className="flex justify-between items-center mb-6">
              <div>
                <h2 className="text-xl font-semibold">Target Study Configuration</h2>
                <p className="text-sm text-[#6c757d]">Define the target published study for indirect comparison</p>
              </div>
              <div className="flex items-center space-x-3">
                <Button
                  variant="outline"
                  className="text-sm text-[#228be6] font-medium bg-[#e7f5ff] border border-[#228be6]/20 hover:bg-[#e7f5ff]/70"
                  onClick={() => setShowAiAssistant(!showAiAssistant)}
                >
                  <Bot size={16} className="mr-1.5 ai-icon-animate" />
                  AI Assistant
                </Button>
              </div>
            </div>
            
            <div>
              {protocol.protocolType === "maic" && (
                <TargetStudyData 
                  protocol={protocol} 
                  setProtocol={setProtocol} 
                />
              )}
              
              <AIChatAssistant isOpen={showAiAssistant} onClose={() => setShowAiAssistant(false)} protocol={protocol} />
            </div>
          </TabsContent>
          
          <TabsContent value="matching" className="mt-4">
            <div className="flex justify-between items-center mb-6">
              <div>
                <h2 className="text-xl font-semibold">Matching Algorithm</h2>
                <p className="text-sm text-[#6c757d]">Configure and run the MAIC matching algorithm</p>
              </div>
              <div className="flex items-center space-x-3">
                <Button
                  variant="outline"
                  className="text-sm text-[#228be6] font-medium bg-[#e7f5ff] border border-[#228be6]/20 hover:bg-[#e7f5ff]/70"
                  onClick={() => setShowAiAssistant(!showAiAssistant)}
                >
                  <Bot size={16} className="mr-1.5 ai-icon-animate" />
                  AI Assistant
                </Button>
              </div>
            </div>
            
            <div>
              {protocol.protocolType === "maic" && (
                <MatchingAlgorithm 
                  protocol={protocol} 
                  setProtocol={setProtocol} 
                />
              )}
              
              <AIChatAssistant isOpen={showAiAssistant} onClose={() => setShowAiAssistant(false)} protocol={protocol} />
            </div>
          </TabsContent>
          
          <TabsContent value="sensitivity" className="mt-4">
            <div className="flex justify-between items-center mb-6">
              <div>
                <h2 className="text-xl font-semibold">Sensitivity Analysis</h2>
                <p className="text-sm text-[#6c757d]">Assess the robustness of MAIC results through sensitivity analyses</p>
              </div>
              <div className="flex items-center space-x-3">
                <Button
                  variant="outline"
                  className="text-sm text-[#228be6] font-medium bg-[#e7f5ff] border border-[#228be6]/20 hover:bg-[#e7f5ff]/70"
                  onClick={() => setShowAiAssistant(!showAiAssistant)}
                >
                  <Bot size={16} className="mr-1.5 ai-icon-animate" />
                  AI Assistant
                </Button>
              </div>
            </div>
            
            <div>
              {protocol.protocolType === "maic" && (
                <SensitivityAnalysis 
                  protocol={protocol} 
                  setProtocol={setProtocol} 
                />
              )}
              
              <AIChatAssistant isOpen={showAiAssistant} onClose={() => setShowAiAssistant(false)} protocol={protocol} />
            </div>
          </TabsContent>
          
          <TabsContent value="generate" className="mt-4">
            <div className="flex justify-between items-center mb-6">
              <div>
                <h2 className="text-xl font-semibold">Generate Protocol</h2>
                <p className="text-sm text-[#6c757d]">Verify alignment between protocol components and generate the final document</p>
              </div>
            </div>
            
            <div>
              <GenerateProtocol 
                protocol={protocol} 
                setProtocol={setProtocol}
                activeDesignState={activeDesignState}
              />
              
              <AIChatAssistant isOpen={showAiAssistant} onClose={() => setShowAiAssistant(false)} protocol={protocol} />
            </div>
          </TabsContent>

          <TabsContent value="document" className="mt-4">
            <div className="flex justify-between items-center mb-6">
              <div>
                <h2 className="text-xl font-semibold">Protocol Document</h2>
                <p className="text-sm text-[#6c757d]">Preview and edit the full protocol document</p>
              </div>
            </div>
            
            <div>
              <ProtocolDocument 
                protocol={protocol} 
              />
              
              <AIChatAssistant isOpen={showAiAssistant} onClose={() => setShowAiAssistant(false)} protocol={protocol} />
            </div>
          </TabsContent>
        </Tabs>
      </main>

      {/* Compare Trials Modal */}
      <CompareTrialsModal
        open={showCompareModal}
        onOpenChange={setShowCompareModal}
        onCompare={handleCompare}
        protocol={protocol}
      />
    </>
  )
}

export default ProtocolBuilder
