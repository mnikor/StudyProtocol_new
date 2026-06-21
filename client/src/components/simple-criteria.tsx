"use client"

import React, { useState } from "react"
import { 
  Plus, 
  Trash2, 
  AlertCircle,
  AlertTriangle,
  Target,
  Check,
  LineChart,
  Loader2,
  Edit,
  FileSearch
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Textarea } from "@/components/ui/textarea"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { AIOriginBadge } from "@/components/ai-origin-badge"
import { ProvenanceInfo, getProvenance, ProvenanceOrigin } from "@/components/provenance-info"
import { AIProcessingButton } from "@/components/ai-processing-button"
import { AIGenerationStatus, SectionStatus } from "@/components/ai-generation-status"
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
import { Protocol } from "@shared/schema"
import { useToast } from "@/hooks/use-toast"
import { formatSupplementaryInfoForAI } from "@/lib/supplementary-info"
import { SectionGenerationMode, SectionSourcePanel } from "@/components/section-source-panel"
import { getApiErrorMessage } from "@/lib/api-error"

interface InclusionExclusionCriteriaProps {
  protocol: Protocol
  setProtocol: React.Dispatch<React.SetStateAction<Protocol>>
  activeDesignState?: any
  isActive?: boolean
}

type CriteriaTraceabilityOrigin = "source" | "improved" | "generated" | "manual"
type CriteriaTraceabilityItem = {
  label: string
  type: "Inclusion" | "Exclusion"
  detail?: string
  source?: string
  why?: string
}
type CriteriaTraceabilityBucket = {
  key: CriteriaTraceabilityOrigin
  label: string
  description: string
  count: number
  items: CriteriaTraceabilityItem[]
}
type CriteriaTraceabilitySummary = {
  reviewedAt: string
  summary: string
  recommendation: string
  sourceDocuments: string[]
  totalCriteria: number
  inclusionCount: number
  exclusionCount: number
  buckets: Record<CriteriaTraceabilityOrigin, CriteriaTraceabilityBucket>
}

const truncateTraceText = (value: any, max = 180) => {
  const text = String(value ?? "").replace(/\s+/g, " ").trim()
  return text.length > max ? `${text.slice(0, max - 1)}...` : text
}

const makeCriteriaTraceBucket = (
  key: CriteriaTraceabilityOrigin,
  label: string,
  description: string
): CriteriaTraceabilityBucket => ({ key, label, description, count: 0, items: [] })

const mapCriteriaTraceOrigin = (origin: ProvenanceOrigin): CriteriaTraceabilityOrigin => {
  if (origin === "source" || origin === "supporting_source") return "source"
  if (origin === "ai_improved") return "improved"
  if (origin === "manual") return "manual"
  return "generated"
}

const SimpleCriteria: React.FC<InclusionExclusionCriteriaProps> = ({ protocol, setProtocol, isActive = false }) => {
  const { toast } = useToast()
  const [newInclusionText, setNewInclusionText] = useState("")
  const [newExclusionText, setNewExclusionText] = useState("")
  const [isGenerating, setIsGenerating] = useState(false)
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [showGenerateDialog, setShowGenerateDialog] = useState(false)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [deleteType, setDeleteType] = useState<"inclusion" | "exclusion">("inclusion")
  const [deleteId, setDeleteId] = useState<number | null>(null)
  const [criteriaView, setCriteriaView] = useState<"stacked" | "sideBySide">("stacked")
  
  // Edit functionality states
  const [editingInclusion, setEditingInclusion] = useState<number | null>(null)
  const [editingExclusion, setEditingExclusion] = useState<number | null>(null)
  const [editText, setEditText] = useState("")
  const [needsAnalysisUpdate, setNeedsAnalysisUpdate] = useState(false)
  const [showTraceabilityDialog, setShowTraceabilityDialog] = useState(false)
  const [traceabilitySummary, setTraceabilitySummary] = useState<CriteriaTraceabilitySummary | null>(null)
  
  const [generationStatus, setGenerationStatus] = useState<SectionStatus[]>([
    { name: "Inclusion Criteria", status: "pending" },
    { name: "Exclusion Criteria", status: "pending" }
  ])
  
  const [criteriaImpactAnalysis, setCriteriaImpactAnalysis] = useState({
    eligibilityRate: 0,
    potentialRate: 0,
    missingCriteria: [] as { text: string; category: string }[],
    ambiguousCriteria: [] as { text: string; suggestion: string }[],
    highImpactCriteria: [] as { id: number; text: string; type: "inclusion" | "exclusion" }[],
    suggestions: [] as { criterion: string; suggestion: string; potentialImpact: string }[],
    regulatoryGuidance: [] as { title: string; description: string }[]
  })
  
  // State to track which specific missing criteria are being added
  const [generatingCriteria, setGeneratingCriteria] = useState<Record<string, boolean>>({})
  
  // Track if analysis has been run at least once
  const [analysisHasRun, setAnalysisHasRun] = useState(false)
  
  // Parse criteria from JSON strings if needed
  const parsedInclusionCriteria = React.useMemo(() => {
    try {
      if (!protocol.inclusionCriteria) return []
      return typeof protocol.inclusionCriteria === 'string' 
        ? JSON.parse(protocol.inclusionCriteria) 
        : protocol.inclusionCriteria
    } catch (e) {
      console.error('Failed to parse inclusion criteria:', e)
      return []
    }
  }, [protocol.inclusionCriteria])
  
  const parsedExclusionCriteria = React.useMemo(() => {
    try {
      if (!protocol.exclusionCriteria) return []
      return typeof protocol.exclusionCriteria === 'string' 
        ? JSON.parse(protocol.exclusionCriteria) 
        : protocol.exclusionCriteria
    } catch (e) {
      console.error('Failed to parse exclusion criteria:', e)
      return []
    }
  }, [protocol.exclusionCriteria])

  const buildTraceabilitySummary = React.useCallback((): CriteriaTraceabilitySummary => {
    const buckets: Record<CriteriaTraceabilityOrigin, CriteriaTraceabilityBucket> = {
      source: makeCriteriaTraceBucket(
        "source",
        "Source as-is",
        "Criteria reproduced from source eligibility language without AI rewriting."
      ),
      improved: makeCriteriaTraceBucket(
        "improved",
        "AI improved",
        "Source-supported criteria that AI clarified, structured, or made protocol-ready."
      ),
      generated: makeCriteriaTraceBucket(
        "generated",
        "AI generated",
        "Criteria added by AI where the source did not provide direct final wording."
      ),
      manual: makeCriteriaTraceBucket(
        "manual",
        "Manual edits",
        "Criteria entered or edited directly by the user."
      )
    }

    const sourceDocuments = new Set<string>()
    const addCriterion = (criterion: any, type: "Inclusion" | "Exclusion") => {
      const provenance = getProvenance(criterion)
      const origin = mapCriteriaTraceOrigin(provenance.origin)
      if (provenance.sourceName) sourceDocuments.add(provenance.sourceName)

      buckets[origin].count += 1
      if (buckets[origin].items.length < 8) {
        buckets[origin].items.push({
          label: truncateTraceText(criterion?.text || criterion?.criterion || "Criterion", 140),
          type,
          detail: provenance.sourceExcerpt
            ? `Source excerpt: ${truncateTraceText(provenance.sourceExcerpt, 150)}`
            : provenance.action,
          source: provenance.sourceName,
          why: provenance.why
        })
      }
    }

    parsedInclusionCriteria.forEach((criterion: any) => addCriterion(criterion, "Inclusion"))
    parsedExclusionCriteria.forEach((criterion: any) => addCriterion(criterion, "Exclusion"))

    const totalCriteria = parsedInclusionCriteria.length + parsedExclusionCriteria.length
    const sourceCount = buckets.source.count
    const improvedCount = buckets.improved.count
    const generatedCount = buckets.generated.count
    const manualCount = buckets.manual.count

    return {
      reviewedAt: new Date().toLocaleString(),
      summary: `${sourceCount} source as-is criteria, ${improvedCount} AI-improved criteria, ${generatedCount} AI-generated criteria, and ${manualCount} manual edits were identified.`,
      recommendation: generatedCount > 0
        ? "Review AI-generated eligibility criteria against the source protocol before final approval, especially thresholds and washout windows."
        : improvedCount > 0
          ? "Review AI-improved criteria for faithful preservation of source intent and clinical thresholds."
          : "Eligibility criteria are traceable from the current item metadata.",
      sourceDocuments: Array.from(sourceDocuments),
      totalCriteria,
      inclusionCount: parsedInclusionCriteria.length,
      exclusionCount: parsedExclusionCriteria.length,
      buckets
    }
  }, [parsedInclusionCriteria, parsedExclusionCriteria])

  const handleAnalyzeTraceability = () => {
    if (parsedInclusionCriteria.length === 0 && parsedExclusionCriteria.length === 0) {
      toast({
        title: "Traceability Unavailable",
        description: "No inclusion or exclusion criteria are available to analyze yet.",
        variant: "destructive",
        duration: 3000
      })
      return
    }

    setTraceabilitySummary(buildTraceabilitySummary())
    setShowTraceabilityDialog(true)
  }
  
  // Analyze criteria impact
  const analyzeCriteriaImpact = async () => {
    setIsAnalyzing(true)
    setNeedsAnalysisUpdate(false) // Reset flag since we're running the analysis now
    
    try {
      // Always use the current parsed criteria to ensure edits are included
      const currentInclusionCriteria = JSON.stringify(parsedInclusionCriteria)
      const currentExclusionCriteria = JSON.stringify(parsedExclusionCriteria)
      
      const response = await fetch('/api/analyze-criteria-impact', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          inclusionCriteria: currentInclusionCriteria,
          exclusionCriteria: currentExclusionCriteria,
          indication: protocol.indication || 'Not specified'
        }),
      })
      
      if (!response.ok) {
        throw new Error('Failed to analyze criteria impact')
      }
      
      const data = await response.json()
      setCriteriaImpactAnalysis(data)
      setShowAiSuggestions(true)
      
      // Mark that analysis has been run at least once
      setAnalysisHasRun(true)
      
      toast({
        title: 'Analysis Complete',
        description: 'Criteria impact analysis has been updated with your changes',
      })
    } catch (error) {
      console.error('Error analyzing criteria impact:', error)
      toast({
        title: 'Analysis Failed',
        description: 'Failed to analyze criteria impact. Please try again.',
        variant: 'destructive',
      })
    } finally {
      setIsAnalyzing(false)
    }
  }
  
  // Handle adding inclusion criterion
  const addInclusionCriterion = () => {
    if (!newInclusionText.trim()) return
    
    const newId = parsedInclusionCriteria.length > 0 
      ? Math.max(0, ...parsedInclusionCriteria.map((c: any) => c.id)) + 1
      : 1
    
    const updatedCriteria = [
      ...parsedInclusionCriteria,
      { id: newId, text: newInclusionText, impact: "Medium", aiSuggestion: "", origin: "manual" }
    ]
    
    setProtocol({
      ...protocol,
      inclusionCriteria: JSON.stringify(updatedCriteria)
    })
    
    setNewInclusionText("")
  }
  
  // Handle adding exclusion criterion
  const addExclusionCriterion = () => {
    if (!newExclusionText.trim()) return
    
    const newId = parsedExclusionCriteria.length > 0 
      ? Math.max(0, ...parsedExclusionCriteria.map((c: any) => c.id)) + 1
      : 1
    
    const updatedCriteria = [
      ...parsedExclusionCriteria,
      { id: newId, text: newExclusionText, impact: "Medium", aiSuggestion: "", origin: "manual" }
    ]
    
    setProtocol({
      ...protocol,
      exclusionCriteria: JSON.stringify(updatedCriteria)
    })
    
    setNewExclusionText("")
  }
  
  // Setup delete
  const handleDeleteClick = (id: number, type: "inclusion" | "exclusion") => {
    setDeleteType(type)
    setDeleteId(id)
    setShowDeleteDialog(true)
  }
  
  // Handle criterion deletion
  const handleDelete = () => {
    if (deleteId === null) return
    
    if (deleteType === "inclusion") {
      const updatedCriteria = parsedInclusionCriteria.filter((c: any) => c.id !== deleteId)
      setProtocol({
        ...protocol,
        inclusionCriteria: JSON.stringify(updatedCriteria)
      })
    } else {
      const updatedCriteria = parsedExclusionCriteria.filter((c: any) => c.id !== deleteId)
      setProtocol({
        ...protocol,
        exclusionCriteria: JSON.stringify(updatedCriteria)
      })
    }
    
    setShowDeleteDialog(false)
    setDeleteId(null)
    setNeedsAnalysisUpdate(true)
  }
  
  // Start editing criterion
  const handleEditClick = (id: number, type: "inclusion" | "exclusion", text: string) => {
    if (type === "inclusion") {
      setEditingInclusion(id)
      setEditingExclusion(null)
    } else {
      setEditingExclusion(id)
      setEditingInclusion(null)
    }
    setEditText(text)
  }
  
  // Save edited criterion
  const handleSaveEdit = (type: "inclusion" | "exclusion") => {
    if (!editText.trim()) return
    
    if (type === "inclusion" && editingInclusion !== null) {
      const updatedCriteria = parsedInclusionCriteria.map((c: any) => 
        c.id === editingInclusion ? { ...c, text: editText, origin: "manual", previousOrigin: c.origin } : c
      )
      
      setProtocol({
        ...protocol,
        inclusionCriteria: JSON.stringify(updatedCriteria)
      })
      
      setEditingInclusion(null)
    } else if (type === "exclusion" && editingExclusion !== null) {
      const updatedCriteria = parsedExclusionCriteria.map((c: any) => 
        c.id === editingExclusion ? { ...c, text: editText, origin: "manual", previousOrigin: c.origin } : c
      )
      
      setProtocol({
        ...protocol,
        exclusionCriteria: JSON.stringify(updatedCriteria)
      })
      
      setEditingExclusion(null)
    }
    
    setEditText("")
    setNeedsAnalysisUpdate(true)
    
    // Show notification to user
    toast({
      title: "Criterion Updated",
      description: "You should update the impact analysis to reflect these changes.",
    })
  }
  
  // Cancel editing
  const handleCancelEdit = () => {
    setEditingInclusion(null)
    setEditingExclusion(null)
    setEditText("")
  }
  
  // Handle AI generation process
  const handleGenerateWithAI = async (generationMode: SectionGenerationMode = "augment") => {
    if (!protocol.synopsis) {
      alert("Please provide a study synopsis in the Synopsis tab first");
      return;
    }
    
    try {
      setIsGenerating(true)
      setGenerationStatus([
        { name: "Inclusion Criteria", status: "generating" },
        { name: "Exclusion Criteria", status: "generating" }
      ])
      
      // Call the API
      const response = await fetch('/api/generate-criteria', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          synopsis: protocol.synopsis || "",
          supplementaryInfo: formatSupplementaryInfoForAI(
            protocol.supplementaryInfo,
            "inclusion exclusion eligibility criteria population diagnosis disease stage prior therapy laboratory values contraception"
          ),
          generationMode
        }),
      });
      
      if (!response.ok) {
        throw new Error(await getApiErrorMessage(response, `Failed to generate criteria: ${response.status}`));
      }
      
      const result = await response.json();

      if (result?.sourceStatus === "not_found") {
        toast({
          title: "Source Content Not Found",
          description: result.sourceStatusMessage || result.explanation || "No eligibility criteria were found in the source documents.",
          duration: 5000
        });
        setGenerationStatus([
          { name: "Inclusion Criteria", status: "pending" },
          { name: "Exclusion Criteria", status: "pending" }
        ]);
        return;
      }
      
      // Update the protocol with AI-generated criteria
      if (result.inclusionCriteria && result.exclusionCriteria) {
        // Process the criteria data to ensure impact levels are properly set
        // The API already includes impact values, but this ensures consistent mapping to categories
        const processedInclusionCriteria = result.inclusionCriteria.map((criterion: any) => {
          return {
            ...criterion,
            impact: criterion.impact || "Ensures appropriate study population", // Default impact if missing
            origin: criterion.origin || criterion.sourceUse || criterion.classification || "generated"
          };
        });
        
        const processedExclusionCriteria = result.exclusionCriteria.map((criterion: any) => {
          return {
            ...criterion,
            impact: criterion.impact || "Reduces risk of adverse events", // Default impact if missing
            origin: criterion.origin || criterion.sourceUse || criterion.classification || "generated"
          };
        });
        
        setProtocol({
          ...protocol,
          inclusionCriteria: JSON.stringify(processedInclusionCriteria),
          exclusionCriteria: JSON.stringify(processedExclusionCriteria)
        });
        
        // Set analysis has run flag to true so colors display immediately
        setAnalysisHasRun(true);
        
        toast({
          title: "Criteria Generated",
          description: "Inclusion and exclusion criteria have been generated successfully.",
          variant: "default",
        });
      } else {
        console.error("API response missing criteria data:", result);
        throw new Error("Invalid API response format");
      }
      
      setGenerationStatus([
        { name: "Inclusion Criteria", status: "complete" },
        { name: "Exclusion Criteria", status: "complete" }
      ]);
    } catch (error) {
      console.error("Error generating criteria:", error);
      toast({
        title: "Generation Failed",
        description: error instanceof Error ? error.message : "Failed to generate criteria. Please try again.",
        variant: "destructive",
      })
      setGenerationStatus([
        { name: "Inclusion Criteria", status: "error", message: "Failed to generate" },
        { name: "Exclusion Criteria", status: "error", message: "Failed to generate" }
      ]);
    } finally {
      setIsGenerating(false);
      setShowGenerateDialog(false);
    }
  }

  // Handler to add missing criteria to inclusion list
  const handleAddMissingCriterion = async (text: string) => {
    if (!text.trim()) return;
    
    // Show loading state for this specific criterion only
    setGeneratingCriteria(prev => ({ ...prev, [text]: true }));
    toast({
      title: "Generating criterion",
      description: "Using AI to create a specific criterion based on the recommendation...",
    });
    
    try {
      // Use AI to generate a specific criterion based on the recommendation and protocol context
      const response = await fetch('/api/assistant-response', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query: `Based on the clinical protocol for ${protocol.indication || 'this study'} with phase ${protocol.phase || 'not specified'}, 
                  generate a HIGHLY SPECIFIC and DETAILED inclusion criterion to address this missing element: "${text}".
                  
                  For example:
                  - If it's about "Prior/concurrent medication restrictions", specify EXACTLY which medications are restricted, for how long before the study, and any exceptions
                  - If it's about "Adequate organ function", specify the exact laboratory values required for liver, kidney, bone marrow function, etc.
                  - If it's about participation duration, specify the exact minimum and maximum duration expected
                  
                  Use precise clinical language with specific measurements, timeframes, and conditions.
                  Include numeric thresholds where applicable (lab values, timeframes, doses).
                  Write ONLY the criterion text with no explanations, labels or prefixes.`,
          protocol: {
            indication: protocol.indication,
            phase: protocol.phase,
            synopsis: protocol.synopsis
          },
          context: protocol.synopsis || ''
        }),
      });
      
      if (!response.ok) {
        throw new Error('Failed to generate specific criterion');
      }
      
      const result = await response.json();
      const criterionText = result.response.trim();
      
      // Create new criterion with the AI-generated text
      const newId = parsedInclusionCriteria.length > 0 
        ? Math.max(0, ...parsedInclusionCriteria.map((c: any) => c.id)) + 1
        : 1;
      
      const newCriterion = {
        id: newId,
        text: criterionText,
        impact: "high", // Most missing criteria are high impact
        aiGenerated: true,
        aiSuggestion: "",
        notes: `Added to address: ${text}`
      };
      
      const updatedCriteria = [...parsedInclusionCriteria, newCriterion];
      
      // Update protocol in storage
      const updatedProtocol = {
        ...protocol,
        inclusionCriteria: JSON.stringify(updatedCriteria),
        lastEdited: new Date()
      };
      
      setProtocol(updatedProtocol);
      
      // Show confirmation toast
      toast({
        title: "Criterion Added",
        description: "An AI-generated criterion has been added based on the recommendation.",
        duration: 3000
      });
    } catch (error) {
      console.error("Error generating specific criterion:", error);
      
      // Fallback to the original behavior if AI generation fails
      const newId = parsedInclusionCriteria.length > 0 
        ? Math.max(0, ...parsedInclusionCriteria.map((c: any) => c.id)) + 1
        : 1;
      
      const newCriterion = {
        id: newId,
        text: text,
        impact: "high", // Most missing criteria are high impact
        aiGenerated: false,
        aiSuggestion: "",
        notes: "Added from analysis recommendations"
      };
      
      const updatedCriteria = [...parsedInclusionCriteria, newCriterion];
      setProtocol({
        ...protocol,
        inclusionCriteria: JSON.stringify(updatedCriteria),
        lastEdited: new Date()
      });
      
      toast({
        title: "Criterion Added",
        description: "The criterion has been added to your inclusion criteria.",
        duration: 3000
      });
    } finally {
      // Reset the loading state for this specific criterion
      setGeneratingCriteria(prev => ({ ...prev, [text]: false }));
    }
  };
  
  // Handler to fix ambiguous criteria 
  const handleFixAmbiguousCriterion = (text: string) => {
    // Find which list contains the ambiguous criterion
    const inclusionIndex = parsedInclusionCriteria.findIndex((c: any) => c.text.includes(text));
    const exclusionIndex = parsedExclusionCriteria.findIndex((c: any) => c.text.includes(text));
    
    // Determine which list to update
    let updatedList;
    let criterionType;
    let index;
    
    if (inclusionIndex >= 0) {
      updatedList = [...parsedInclusionCriteria];
      criterionType = "inclusion";
      index = inclusionIndex;
    } else if (exclusionIndex >= 0) {
      updatedList = [...parsedExclusionCriteria];
      criterionType = "exclusion";
      index = exclusionIndex;
    } else {
      // If criterion isn't found, show error and return
      toast({
        title: "Error",
        description: "Could not locate the ambiguous criterion.",
        variant: "destructive"
      });
      return;
    }
    
    // Mark the criterion for review with a note
    const updatedCriterion = {
      ...updatedList[index],
      notes: updatedList[index].notes 
        ? `${updatedList[index].notes}\nFlagged for clarity improvement from analysis.` 
        : "Flagged for clarity improvement from analysis."
    };
    
    updatedList[index] = updatedCriterion;
    
    // Update protocol in storage
    const updatedProtocol = {
      ...protocol,
      [criterionType === "inclusion" ? "inclusionCriteria" : "exclusionCriteria"]: JSON.stringify(updatedList),
      lastEdited: new Date()
    };
    
    setProtocol(updatedProtocol);
    
    // Show confirmation toast
    toast({
      title: "Criterion Flagged",
      description: "The ambiguous criterion has been flagged for improvement. Please edit it to provide more clarity.",
      duration: 5000
    });
    
    // Trigger edit mode for this criterion
    if (criterionType === "inclusion") {
      handleEditClick(updatedList[index].id, "inclusion", updatedList[index].text);
    } else {
      handleEditClick(updatedList[index].id, "exclusion", updatedList[index].text);
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-white p-4 rounded-md border border-[#dee2e6]">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <h2 className="font-medium text-lg text-[#495057]">Eligibility Criteria</h2>
            <p className="text-sm text-[#6c757d]">
              Choose a source option below, then review and edit the final inclusion and exclusion criteria.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-9 bg-white text-sm"
              onClick={handleAnalyzeTraceability}
            >
              <FileSearch size={14} className="mr-1.5" />
              Source Traceability
            </Button>
            <div className="inline-flex self-start rounded-md border border-[#dee2e6] bg-[#f8f9fa] p-1">
              <Button
                type="button"
                size="sm"
                variant={criteriaView === "stacked" ? "default" : "ghost"}
                onClick={() => setCriteriaView("stacked")}
                className={criteriaView === "stacked" ? "h-8 bg-[#228be6] hover:bg-[#1864ab]" : "h-8 text-[#495057]"}
              >
                Stacked
              </Button>
              <Button
                type="button"
                size="sm"
                variant={criteriaView === "sideBySide" ? "default" : "ghost"}
                onClick={() => setCriteriaView("sideBySide")}
                className={criteriaView === "sideBySide" ? "h-8 bg-[#228be6] hover:bg-[#1864ab]" : "h-8 text-[#495057]"}
              >
                Side by side
              </Button>
            </div>
          </div>
        </div>
      </div>

      {protocol.synopsis && (
        <SectionSourcePanel
          protocol={protocol}
          setProtocol={setProtocol}
          sectionKey="criteria"
          sectionName="Eligibility Criteria"
          referenceExamples="Use eligibility wording and criteria structure from this file only if it fits the current study population."
          isGenerating={isGenerating}
          compact={parsedInclusionCriteria.length > 0 || parsedExclusionCriteria.length > 0}
          onGenerate={handleGenerateWithAI}
        />
      )}

      <div className={criteriaView === "sideBySide" ? "grid gap-6 xl:grid-cols-2" : "space-y-6"}>
          {/* Inclusion Criteria Section */}
          <div className="bg-[#f0fdf4] rounded-md border border-[#bbf7d0] overflow-hidden">
            <div className="flex items-center justify-between p-3 border-b border-[#bbf7d0] bg-[#dcfce7]">
              <div className="flex items-center">
                <h3 className="font-medium text-[#166534]">Inclusion Criteria</h3>
              </div>
            </div>
            
            <div className={criteriaView === "sideBySide" ? "p-4 xl:max-h-[720px] xl:overflow-y-auto" : "p-4"}>
              <ul className="space-y-6">
                {parsedInclusionCriteria.map((criterion: any) => {
                  return (
                    <li key={criterion.id} className="relative group border border-[#d8f3dc] bg-white rounded-md overflow-hidden">
                      {editingInclusion === criterion.id ? (
                        <div className="p-3 w-full">
                          <Textarea
                            value={editText}
                            onChange={(e) => setEditText(e.target.value)}
                            className="min-h-[100px] text-sm w-full"
                          />
                          <div className="flex justify-end gap-2 mt-2">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={handleCancelEdit}
                            >
                              Cancel
                            </Button>
                            <Button
                              size="sm"
                              onClick={() => handleSaveEdit("inclusion")}
                              disabled={!editText.trim()}
                              className="bg-[#228be6] hover:bg-[#1864ab]"
                            >
                              Save
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <div>
                            <div className="p-3 pr-20">
                              <div className="flex flex-wrap items-start gap-2">
                                <p className="text-sm text-[#495057] leading-relaxed">{criterion.text}</p>
                                <ProvenanceInfo item={criterion} section="Eligibility criteria" />
                                <AIOriginBadge item={criterion} />
                              </div>
                            </div>
                          </div>
                          
                          <div className="absolute top-2 right-2 flex">
                            {/* Edit button */}
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6 opacity-0 group-hover:opacity-100 text-[#adb5bd] hover:text-[#228be6] mr-1"
                              onClick={() => handleEditClick(criterion.id, "inclusion", criterion.text)}
                            >
                              <Edit size={14} />
                            </Button>
                            
                            {/* Delete button */}
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6 opacity-0 group-hover:opacity-100 text-[#adb5bd] hover:text-[#fa5252]"
                              onClick={() => handleDeleteClick(criterion.id, "inclusion")}
                            >
                              <Trash2 size={14} />
                            </Button>
                          </div>
                        </>
                      )}
                    </li>
                  );
                })}
              </ul>
              
              <div className="mt-6">
                <div className="flex gap-2">
                  <Textarea
                    placeholder="Add new inclusion criterion..."
                    value={newInclusionText}
                    onChange={(e) => setNewInclusionText(e.target.value)}
                    className="min-h-[60px] text-sm"
                  />
                </div>
                <div className="flex justify-end mt-2">
                  <Button
                    size="sm"
                    onClick={addInclusionCriterion}
                    disabled={!newInclusionText.trim()}
                    className="bg-[#228be6] hover:bg-[#1864ab]"
                  >
                    <Plus size={14} className="mr-1" />
                    Add
                  </Button>
                </div>
              </div>
            </div>
          </div>
          
          {/* Exclusion Criteria Section */}
          <div className="bg-[#fff1f2] rounded-md border border-[#fecdd3] overflow-hidden">
            <div className="flex items-center justify-between p-3 border-b border-[#fecdd3] bg-[#ffe4e6]">
              <div className="flex items-center">
                <h3 className="font-medium text-[#9f1239]">Exclusion Criteria</h3>
              </div>
            </div>
            
            <div className={criteriaView === "sideBySide" ? "p-4 xl:max-h-[720px] xl:overflow-y-auto" : "p-4"}>
              <ul className="space-y-6">
                {parsedExclusionCriteria.map((criterion: any) => {
                  return (
                    <li key={criterion.id} className="relative group border border-[#ffe4e6] bg-white rounded-md overflow-hidden">
                      {editingExclusion === criterion.id ? (
                        <div className="p-3 w-full">
                          <Textarea
                            value={editText}
                            onChange={(e) => setEditText(e.target.value)}
                            className="min-h-[100px] text-sm w-full"
                          />
                          <div className="flex justify-end gap-2 mt-2">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={handleCancelEdit}
                            >
                              Cancel
                            </Button>
                            <Button
                              size="sm"
                              onClick={() => handleSaveEdit("exclusion")}
                              disabled={!editText.trim()}
                              className="bg-[#228be6] hover:bg-[#1864ab]"
                            >
                              Save
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <div>
                            <div className="p-3 pr-20">
                              <div className="flex flex-wrap items-start gap-2">
                                <p className="text-sm text-[#495057] leading-relaxed">{criterion.text}</p>
                                <ProvenanceInfo item={criterion} section="Eligibility criteria" />
                                <AIOriginBadge item={criterion} />
                              </div>
                            </div>
                          </div>
                          
                          <div className="absolute top-2 right-2 flex">
                            {/* Edit button */}
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6 opacity-0 group-hover:opacity-100 text-[#adb5bd] hover:text-[#228be6] mr-1"
                              onClick={() => handleEditClick(criterion.id, "exclusion", criterion.text)}
                            >
                              <Edit size={14} />
                            </Button>
                            
                            {/* Delete button */}
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6 opacity-0 group-hover:opacity-100 text-[#adb5bd] hover:text-[#fa5252]"
                              onClick={() => handleDeleteClick(criterion.id, "exclusion")}
                            >
                              <Trash2 size={14} />
                            </Button>
                          </div>
                        </>
                      )}
                    </li>
                  );
                })}
              </ul>
              
              <div className="mt-6">
                <div className="flex gap-2">
                  <Textarea
                    placeholder="Add new exclusion criterion..."
                    value={newExclusionText}
                    onChange={(e) => setNewExclusionText(e.target.value)}
                    className="min-h-[60px] text-sm"
                  />
                </div>
                <div className="flex justify-end mt-2">
                  <Button
                    size="sm"
                    onClick={addExclusionCriterion}
                    disabled={!newExclusionText.trim()}
                    className="bg-[#228be6] hover:bg-[#1864ab]"
                  >
                    <Plus size={14} className="mr-1" />
                    Add
                  </Button>
                </div>
              </div>
            </div>
          </div>
      </div>

      {/* Delete Confirmation Dialog */}
      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-[#fa5252]">
              <AlertCircle size={18} />
              Confirm Deletion
            </DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <p className="text-sm">
              Are you sure you want to delete this {deleteType} criterion? This action cannot be undone.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDeleteDialog(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDelete}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Source Traceability Dialog */}
      <Dialog open={showTraceabilityDialog} onOpenChange={setShowTraceabilityDialog}>
        <DialogContent className="w-[94vw] max-w-[1180px]">
          <DialogHeader>
            <DialogTitle>Eligibility Criteria Source Traceability</DialogTitle>
          </DialogHeader>
          <div className="py-4 max-h-[82vh] overflow-auto">
            {traceabilitySummary ? (
              <div className="space-y-5">
                <div className="rounded-md border border-[#d0ebff] bg-[#f8fbff] p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h4 className="text-base font-semibold text-[#1c3d5a]">Traceability summary</h4>
                      <p className="mt-1 text-sm text-[#495057]">{traceabilitySummary.summary}</p>
                      <p className="mt-2 text-sm text-[#1c3d5a]">{traceabilitySummary.recommendation}</p>
                    </div>
                    <Badge variant="outline" className="bg-white text-[#495057]">
                      Reviewed {traceabilitySummary.reviewedAt}
                    </Badge>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                  <div className="rounded-md bg-[#f8f9fa] p-3">
                    <div className="text-xs font-medium text-[#6c757d]">Total criteria</div>
                    <div className="text-2xl font-bold text-[#343a40]">{traceabilitySummary.totalCriteria}</div>
                  </div>
                  <div className="rounded-md bg-[#f0fdf4] p-3">
                    <div className="text-xs font-medium text-[#166534]">Inclusion</div>
                    <div className="text-2xl font-bold text-[#166534]">{traceabilitySummary.inclusionCount}</div>
                  </div>
                  <div className="rounded-md bg-[#fff1f2] p-3">
                    <div className="text-xs font-medium text-[#9f1239]">Exclusion</div>
                    <div className="text-2xl font-bold text-[#9f1239]">{traceabilitySummary.exclusionCount}</div>
                  </div>
                  <div className="rounded-md bg-[#f8f9fa] p-3">
                    <div className="text-xs font-medium text-[#6c757d]">Sources</div>
                    <div className="text-2xl font-bold text-[#343a40]">{traceabilitySummary.sourceDocuments.length}</div>
                  </div>
                </div>

                {traceabilitySummary.sourceDocuments.length > 0 && (
                  <div>
                    <h4 className="mb-2 text-sm font-semibold text-[#343a40]">Source documents</h4>
                    <div className="flex flex-wrap gap-2">
                      {traceabilitySummary.sourceDocuments.map((source) => (
                        <Badge key={source} variant="outline" className="bg-white text-[#495057]">
                          {source}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

                <div className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-4">
                  {(["source", "improved", "generated", "manual"] as CriteriaTraceabilityOrigin[]).map((origin) => {
                    const bucket = traceabilitySummary.buckets[origin]
                    const colorClass = origin === "source"
                      ? "border-[#dee2e6] bg-white"
                      : origin === "improved"
                        ? "border-amber-200 bg-amber-50/40"
                        : origin === "generated"
                          ? "border-blue-200 bg-blue-50/40"
                          : "border-[#dee2e6] bg-[#f8f9fa]"
                    const badgeClass = origin === "source"
                      ? "bg-white text-[#495057]"
                      : origin === "improved"
                        ? "border-amber-200 bg-amber-50 text-amber-800"
                        : origin === "generated"
                          ? "border-blue-200 bg-blue-50 text-blue-700"
                          : "bg-white text-[#495057]"

                    return (
                      <div key={origin} className={`rounded-md border p-3 ${colorClass}`}>
                        <div className="mb-2 flex items-start justify-between gap-2">
                          <div>
                            <h4 className="text-sm font-semibold text-[#343a40]">{bucket.label}</h4>
                            <p className="mt-1 text-xs text-[#6c757d]">{bucket.description}</p>
                          </div>
                          <Badge variant="outline" className={badgeClass}>
                            {bucket.count}
                          </Badge>
                        </div>
                        {bucket.items.length > 0 ? (
                          <div className="space-y-2">
                            {bucket.items.map((item, index) => (
                              <div key={`${origin}-${index}`} className="rounded-md border border-[#dee2e6] bg-white p-2">
                                <div className="mb-1">
                                  <Badge variant="outline" className={item.type === "Inclusion" ? "bg-[#f0fdf4] text-[#166534]" : "bg-[#fff1f2] text-[#9f1239]"}>
                                    {item.type}
                                  </Badge>
                                </div>
                                <div className="text-sm font-medium text-[#343a40]">{item.label}</div>
                                {item.detail && <div className="mt-1 text-xs text-[#495057]">{item.detail}</div>}
                                {item.source && <div className="mt-1 text-xs text-[#6c757d]">Source: {item.source}</div>}
                                {item.why && <div className="mt-1 text-xs text-[#6c757d]">Reason: {truncateTraceText(item.why, 160)}</div>}
                              </div>
                            ))}
                            {bucket.count > bucket.items.length && (
                              <p className="text-xs text-[#6c757d]">
                                Showing {bucket.items.length} examples of {bucket.count} total items.
                              </p>
                            )}
                          </div>
                        ) : (
                          <div className="rounded-md border border-dashed border-[#dee2e6] bg-white p-3 text-xs text-[#6c757d]">
                            No items detected in this category.
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-8">
                <FileSearch size={36} className="mb-2 text-[#adb5bd]" />
                <p className="text-sm text-[#6c757d]">Run traceability analysis to review criteria source usage.</p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setTraceabilitySummary(buildTraceabilitySummary())}
            >
              <FileSearch size={14} className="mr-1.5" />
              Rerun Analysis
            </Button>
            <Button type="button" onClick={() => setShowTraceabilityDialog(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Generate with AI Dialog */}
      <Dialog open={showGenerateDialog} onOpenChange={(open) => {
        if (!isGenerating) setShowGenerateDialog(open)
      }}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle>Generate Criteria with AI</DialogTitle>
          </DialogHeader>
          
          {!isGenerating ? (
            <div className="py-4">
              <p className="text-sm mb-4">
                Review your study synopsis below. AI will generate appropriate inclusion and exclusion criteria aligned with regulatory requirements.
              </p>
              <div className="border rounded-md p-3 bg-gray-50 min-h-[150px] max-h-[300px] text-sm overflow-auto whitespace-pre-wrap">
                {protocol.synopsis || "Please add a synopsis in the Synopsis tab first."}
              </div>
              
              <div className="mt-4 flex justify-end">
                <AIProcessingButton
                  onProcess={() => handleGenerateWithAI("augment")}
                  disabled={!protocol.synopsis}
                />
              </div>
            </div>
          ) : (
            <div className="py-6">
              <AIGenerationStatus sections={generationStatus} />
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}

export default SimpleCriteria
