"use client"

import React, { useState } from "react"
import { 
  Plus, 
  Trash2, 
  AlertCircle,
  AlertTriangle,
  Target,
  ChevronDown,
  ChevronUp,
  Check,
  LineChart,
  Loader2,
  RefreshCw,
  Zap
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { AIGeneratedBadge } from "@/components/ai-generated-badge"
import { AIProcessingButton } from "@/components/ai-processing-button"
import { AIGenerationStatus } from "@/components/ai-generation-status"
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"

import { Protocol } from "@shared/schema"
import { useToast } from "@/hooks/use-toast"
import { InclusionExclusionComparison } from "@/components/inclusion-exclusion-comparison"

// Define local types for status tracking
type GenerationStatus = "pending" | "generating" | "complete" | "error";

interface SectionStatus {
  name: string;
  status: GenerationStatus;
  message?: string;
}

interface InclusionExclusionCriteriaProps {
  protocol: Protocol
  setProtocol: React.Dispatch<React.SetStateAction<Protocol>>
}

const InclusionExclusionCriteria: React.FC<InclusionExclusionCriteriaProps> = ({ protocol, setProtocol }) => {
  const { toast } = useToast()
  // State for new criteria
  const [newInclusionText, setNewInclusionText] = useState("")
  const [newExclusionText, setNewExclusionText] = useState("")
  
  // State for editing and deleting
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [deleteType, setDeleteType] = useState<"inclusion" | "exclusion">("inclusion")
  const [deleteId, setDeleteId] = useState<number | null>(null)
  
  // State for AI generation
  const [showGenerateDialog, setShowGenerateDialog] = useState(false)
  // We use the protocol's synopsis directly now
  const [isGenerating, setIsGenerating] = useState(false)
  const [generationStatus, setGenerationStatus] = useState<SectionStatus[]>([
    { name: "Inclusion Criteria", status: "pending" },
    { name: "Exclusion Criteria", status: "pending" }
  ])
  
  // State for UI controls
  const [showAiSuggestions, setShowAiSuggestions] = useState(true)
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [criteriaImpactAnalysis, setCriteriaImpactAnalysis] = useState({
    eligibilityRate: 0,
    potentialRate: 0,
    missingCriteria: [] as { text: string; category: string }[],
    ambiguousCriteria: [] as { text: string; suggestion: string }[],
    highImpactCriteria: [] as { id: number; text: string; type: "inclusion" | "exclusion" }[],
    suggestions: [] as { criterion: string; suggestion: string; potentialImpact: string }[],
    regulatoryGuidance: [] as { title: string; description: string }[]
  })
  
  // We'll use the InclusionExclusionComparison component for trial comparison functionality
  
  // Analyze criteria impact
  const analyzeCriteriaImpact = async () => {
    setIsAnalyzing(true)
    try {
      const response = await fetch('/api/analyze-criteria-impact', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          inclusionCriteria: protocol.inclusionCriteria,
          exclusionCriteria: protocol.exclusionCriteria,
          indication: protocol.indication || 'Not specified'
        }),
      })
      
      if (!response.ok) {
        throw new Error('Failed to analyze criteria impact')
      }
      
      const data = await response.json()
      setCriteriaImpactAnalysis(data)
      setShowAiSuggestions(true)
      
      toast({
        title: 'Analysis Complete',
        description: 'Criteria impact analysis has been updated',
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
  
  // Handle adding inclusion criterion
  const addInclusionCriterion = () => {
    if (!newInclusionText.trim()) return
    
    const newId = parsedInclusionCriteria.length > 0 
      ? Math.max(0, ...parsedInclusionCriteria.map((c: any) => c.id)) + 1
      : 1
    
    const updatedCriteria = [
      ...parsedInclusionCriteria,
      { id: newId, text: newInclusionText, impact: "Medium", aiSuggestion: "" }
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
      { id: newId, text: newExclusionText, impact: "Medium", aiSuggestion: "" }
    ]
    
    setProtocol({
      ...protocol,
      exclusionCriteria: JSON.stringify(updatedCriteria)
    })
    
    setNewExclusionText("")
  }
  
  // Setup delete dialog
  const setupDelete = (type: "inclusion" | "exclusion", id: number) => {
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
  }
  
  // Handle AI generation process
  const handleGenerateWithAI = async () => {
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
      
      // Call the actual API
      const response = await fetch('/api/generate-criteria', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          synopsis: protocol.synopsis || "",
          supplementaryInfo: protocol.supplementaryInfo || []
        }),
      });
      
      if (!response.ok) {
        throw new Error(`Failed to generate criteria: ${response.status}`);
      }
      
      const result = await response.json();
      
      // Update the protocol with AI-generated criteria
      if (result.inclusionCriteria && result.exclusionCriteria) {
        // Properly handle the structured data
        setProtocol({
          ...protocol,
          inclusionCriteria: JSON.stringify(result.inclusionCriteria),
          exclusionCriteria: JSON.stringify(result.exclusionCriteria)
        });
        
        // Log successful data processing
        console.log("Successfully processed inclusion/exclusion criteria:", {
          inclusion: result.inclusionCriteria,
          exclusion: result.exclusionCriteria
        });
        
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
      setGenerationStatus([
        { name: "Inclusion Criteria", status: "error", message: "Failed to generate" },
        { name: "Exclusion Criteria", status: "error", message: "Failed to generate" }
      ]);
    } finally {
      setIsGenerating(false);
      setShowGenerateDialog(false);
    }
  }
  
  // Helper to get appropriate impact color
  const getImpactColor = (impact: string) => {
    switch(impact) {
      case "Required":
        return { bg: "#ffe3e3", text: "#fa5252", dot: "#fa5252" }
      case "High":
        return { bg: "#fff3bf", text: "#e67700", dot: "#fcc419" }
      case "Medium":
        return { bg: "#e7f5ff", text: "#1864ab", dot: "#4dabf7" }
      default:
        return { bg: "#f1f3f5", text: "#495057", dot: "#adb5bd" }
    }
  }
  
  // Trial comparison functionality is now handled by the InclusionExclusionComparison component

  return (
    <div className="space-y-6 relative">
      {/* Top-level compare button for easy visibility */}
      <div className="bg-white p-4 rounded-md border border-[#dee2e6] flex justify-between items-center">
        <div>
          <h2 className="font-medium text-lg text-[#495057]">Inclusion/Exclusion Criteria</h2>
          <p className="text-sm text-[#6c757d]">Define eligibility requirements for study participants</p>
        </div>
        {/* Compare with Similar Trials button is now handled by the InclusionExclusionComparison component */}
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="col-span-2 space-y-6">
          {/* Inclusion Criteria Section */}
          <div className="bg-white rounded-md border border-[#dee2e6] overflow-hidden">
            <div className="flex items-center justify-between p-3 border-b border-[#dee2e6] bg-[#f8f9fa]">
              <div className="flex items-center">
                <h3 className="font-medium text-[#495057]">Inclusion Criteria</h3>
                <AIGeneratedBadge />
              </div>
              <div className="flex gap-2">
                <Button
                  variant="default"
                  size="sm"
                  className="h-8 text-sm bg-[#228be6] hover:bg-[#1864ab]"
                  onClick={() => setShowGenerateDialog(true)}
                >
                  <Zap size={14} className="mr-1.5" />
                  Generate with AI
                </Button>
                {/* Comparison button removed */}
              </div>
            </div>
            
            <div className="p-4">
              <ul className="space-y-6">
                {parsedInclusionCriteria.map((criterion: any) => (
                  <li key={criterion.id} className="relative group border border-[#e9ecef] rounded-md overflow-hidden">
                    {/* Impact level left border indicator */}
                    <div 
                      className="absolute left-0 top-0 bottom-0 w-1" 
                      style={{ 
                        backgroundColor: 
                          criterion.impact === "Required" ? "#fa5252" : 
                          criterion.impact === "High" ? "#fcc419" : 
                          criterion.impact === "Medium" ? "#4dabf7" : 
                          "#adb5bd" 
                      }}
                    ></div>
                    
                    <div className="grid grid-cols-[1fr_120px] bg-white">
                      <div className="p-3 pl-4">
                        <p className="text-sm text-[#495057] leading-relaxed">{criterion.text}</p>
                        
                        {showAiSuggestions && criterion.aiSuggestion && (
                          <div className="mt-3 text-xs text-[#1c7ed6] bg-[#e7f5ff] p-2.5 rounded-md flex items-start gap-2">
                            <AlertCircle size={14} className="mt-0.5 flex-shrink-0" />
                            <span>{criterion.aiSuggestion}</span>
                          </div>
                        )}
                      </div>
                      
                      <div className="border-l border-[#e9ecef] flex items-center justify-center bg-[#f8f9fa]">
                        <div className={`px-3 py-1.5 rounded text-xs font-medium ${getImpactColor(criterion.impact).bg} text-${getImpactColor(criterion.impact).text}`}>
                          {criterion.impact}
                        </div>
                      </div>
                    </div>
                    
                    <Button
                      variant="default"
                      size="icon"
                      className="h-6 w-6 opacity-0 group-hover:opacity-100 text-[#adb5bd] hover:text-[#fa5252] absolute top-2 right-2"
                      onClick={() => setupDelete("inclusion", criterion.id)}
                    >
                      <Trash2 size={14} />
                    </Button>
                  </li>
                ))}
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
          <div className="bg-white rounded-md border border-[#dee2e6] overflow-hidden">
            <div className="flex items-center justify-between p-3 border-b border-[#dee2e6] bg-[#f8f9fa]">
              <div className="flex items-center">
                <h3 className="font-medium text-[#495057]">Exclusion Criteria</h3>
                <AIGeneratedBadge />
              </div>
              <div className="flex gap-2">
                <Button
                  variant="default"
                  size="sm"
                  className="h-8 text-sm bg-[#228be6] hover:bg-[#1864ab]"
                  onClick={() => setShowGenerateDialog(true)}
                >
                  <Zap size={14} className="mr-1.5" />
                  Generate with AI
                </Button>
                {/* Comparison button removed */}
              </div>
            </div>
            
            <div className="p-4">
              <ul className="space-y-6">
                {parsedExclusionCriteria.map((criterion: any) => (
                  <li key={criterion.id} className="relative group border border-[#e9ecef] rounded-md overflow-hidden">
                    {/* Impact level left border indicator */}
                    <div 
                      className="absolute left-0 top-0 bottom-0 w-1" 
                      style={{ 
                        backgroundColor: 
                          criterion.impact === "Required" ? "#fa5252" : 
                          criterion.impact === "High" ? "#fcc419" : 
                          criterion.impact === "Medium" ? "#4dabf7" : 
                          "#adb5bd" 
                      }}
                    ></div>
                    
                    <div className="grid grid-cols-[1fr_120px] bg-white">
                      <div className="p-3 pl-4">
                        <p className="text-sm text-[#495057] leading-relaxed">{criterion.text}</p>
                        
                        {showAiSuggestions && criterion.aiSuggestion && (
                          <div className="mt-3 text-xs text-[#1c7ed6] bg-[#e7f5ff] p-2.5 rounded-md flex items-start gap-2">
                            <AlertCircle size={14} className="mt-0.5 flex-shrink-0" />
                            <span>{criterion.aiSuggestion}</span>
                          </div>
                        )}
                      </div>
                      
                      <div className="border-l border-[#e9ecef] flex items-center justify-center bg-[#f8f9fa]">
                        <div className={`px-3 py-1.5 rounded text-xs font-medium ${getImpactColor(criterion.impact).bg} text-${getImpactColor(criterion.impact).text}`}>
                          {criterion.impact}
                        </div>
                      </div>
                    </div>
                    
                    <Button
                      variant="default"
                      size="icon"
                      className="h-6 w-6 opacity-0 group-hover:opacity-100 text-[#adb5bd] hover:text-[#fa5252] absolute top-2 right-2"
                      onClick={() => setupDelete("exclusion", criterion.id)}
                    >
                      <Trash2 size={14} />
                    </Button>
                  </li>
                ))}
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
        
        {/* Sidebar Content */}
        <div className="space-y-5">
          {/* Criteria Impact Analysis */}
          <div className="bg-white rounded-md border border-[#dee2e6] overflow-hidden">
            <div className="p-3 border-b border-[#dee2e6] bg-[#f8f9fa] flex justify-between items-center">
              <h3 className="font-medium text-[#495057]">Criteria Impact Analysis</h3>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger>
                    <AlertCircle size={14} className="text-[#adb5bd]" />
                  </TooltipTrigger>
                  <TooltipContent className="max-w-xs">
                    <p>Estimated patient eligibility rate based on your inclusion and exclusion criteria</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
            
            <div className="p-4">
              {parsedInclusionCriteria.length > 0 && parsedExclusionCriteria.length > 0 && criteriaImpactAnalysis.eligibilityRate > 0 ? (
                <>
                  <div className="mb-4">
                    <div className="flex justify-between text-sm mb-1">
                      <span>Current eligibility rate</span>
                      <span className="font-medium">{criteriaImpactAnalysis.eligibilityRate}%</span>
                    </div>
                    <div className="w-full bg-[#e9ecef] rounded-full h-2">
                      <div
                        className="bg-[#228be6] h-2 rounded-full"
                        style={{ width: `${criteriaImpactAnalysis.eligibilityRate}%` }}
                      ></div>
                    </div>
                    <div className="flex justify-between text-sm text-[#6c757d] mt-1">
                      <span>Restrictive</span>
                      <span>Inclusive</span>
                    </div>
                  </div>
                  
                  {criteriaImpactAnalysis.potentialRate > criteriaImpactAnalysis.eligibilityRate && (
                    <div className="p-3 bg-[#e7f5ff] rounded-md mb-4">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-[#1864ab]">Potential eligibility</span>
                        <span className="text-sm font-medium text-[#1864ab]">{criteriaImpactAnalysis.potentialRate}%</span>
                      </div>
                      <p className="text-xs text-[#1864ab] mt-1">
                        Implementing AI suggestions could increase eligibility rate by {criteriaImpactAnalysis.potentialRate - criteriaImpactAnalysis.eligibilityRate}%
                      </p>
                    </div>
                  )}
                  
                  <div className="space-y-2 text-sm">
                    <div className="flex items-center gap-1.5">
                      <div className="w-3 h-3 rounded-full bg-[#fa5252]"></div>
                      <span>Required criteria</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <div className="w-3 h-3 rounded-full bg-[#fcc419]"></div>
                      <span>High impact criteria</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <div className="w-3 h-3 rounded-full bg-[#4dabf7]"></div>
                      <span>Medium impact criteria</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <div className="w-3 h-3 rounded-full bg-[#adb5bd]"></div>
                      <span>Standard criteria</span>
                    </div>
                  </div>
                </>
              ) : (
                <div className="flex flex-col items-center justify-center py-6 text-center">
                  <LineChart size={24} className="text-[#adb5bd] mb-2" />
                  <p className="text-[#6c757d] text-sm">
                    Click 'Analyze Impact' after generating criteria to view the analysis
                  </p>
                  <Button 
                    variant="default" 
                    size="sm" 
                    className="h-8 text-xs flex items-center gap-1.5 mt-4"
                    onClick={analyzeCriteriaImpact}
                    disabled={isAnalyzing || parsedInclusionCriteria.length === 0 || parsedExclusionCriteria.length === 0}
                  >
                    {isAnalyzing ? (
                      <>
                        <Loader2 size={14} className="animate-spin" />
                        <span>Analyzing...</span>
                      </>
                    ) : (
                      <>
                        <LineChart size={14} />
                        <span>Analyze Impact</span>
                      </>
                    )}
                  </Button>
                </div>
              )}
            </div>
          </div>
          
          {/* AI Suggestions Control */}
          {(parsedInclusionCriteria.some((c: any) => c.aiSuggestion) || parsedExclusionCriteria.some((c: any) => c.aiSuggestion)) && (
            <div className="flex items-center justify-between bg-white rounded-md border border-[#dee2e6] p-3">
              <div className="flex items-center gap-2">
                <AlertCircle size={16} className="text-[#228be6]" />
                <span className="text-sm font-medium">Show AI Suggestions</span>
              </div>
              <Button
                variant={showAiSuggestions ? "default" : "outline"}
                size="sm"
                className={showAiSuggestions ? "bg-[#228be6] hover:bg-[#1864ab]" : ""}
                onClick={() => setShowAiSuggestions(!showAiSuggestions)}
              >
                {showAiSuggestions ? <Check size={14} /> : "Show"}
              </Button>
            </div>
          )}
          
          {/* Validation Issues */}
          <div className="bg-white rounded-md border border-[#dee2e6] overflow-hidden">
            <div className="p-3 border-b border-[#dee2e6] bg-[#f8f9fa] flex justify-between items-center">
              <h3 className="font-medium text-[#495057]">Validation Issues</h3>
              
              <Button 
                variant="outline" 
                size="sm" 
                className="h-7 text-xs flex items-center gap-1.5"
                onClick={analyzeCriteriaImpact}
                disabled={isAnalyzing}
              >
                <RefreshCw size={12} className={isAnalyzing ? "animate-spin" : ""} />
                {isAnalyzing ? "Checking..." : "Check Now"}
              </Button>
            </div>
            
            <div className="p-4">
              {criteriaImpactAnalysis.missingCriteria.length > 0 || criteriaImpactAnalysis.ambiguousCriteria.length > 0 ? (
                <div className="space-y-4">
                  {/* Missing Criteria */}
                  {criteriaImpactAnalysis.missingCriteria.length > 0 && (
                    <div>
                      <h4 className="text-sm font-medium mb-2 text-[#fa5252]">Missing Criteria</h4>
                      <ul className="space-y-2">
                        {criteriaImpactAnalysis.missingCriteria.map((item, idx) => (
                          <li key={idx} className="flex items-start gap-2 text-sm">
                            <AlertTriangle size={16} className="text-[#fa5252] mt-0.5 flex-shrink-0" />
                            <div>
                              <p>{item.text}</p>
                              <p className="text-xs text-[#6c757d] mt-0.5">{item.category}</p>
                            </div>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  
                  {/* Ambiguous Criteria */}
                  {criteriaImpactAnalysis.ambiguousCriteria.length > 0 && (
                    <div>
                      <h4 className="text-sm font-medium mb-2 text-[#ff922b]">Ambiguous Criteria</h4>
                      <ul className="space-y-2">
                        {criteriaImpactAnalysis.ambiguousCriteria.map((item, idx) => (
                          <li key={idx} className="flex items-start gap-2 text-sm">
                            <AlertCircle size={16} className="text-[#ff922b] mt-0.5 flex-shrink-0" />
                            <div>
                              <p>{item.text}</p>
                              <p className="text-xs text-[#1c7ed6] mt-0.5">{item.suggestion}</p>
                            </div>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-center py-6">
                  <Target className="h-8 w-8 mx-auto mb-2 text-[#40c057]" />
                  <p className="text-[#495057] text-sm">No validation issues found</p>
                  <p className="text-[#6c757d] text-xs mt-1">Your criteria meet standard requirements</p>
                </div>
              )}
            </div>
          </div>
          
          {/* Trial Comparison Component */}
          <InclusionExclusionComparison protocol={{
            ...protocol,
            inclusionExclusionCriteria: {
              content: {
                inclusionCriteria: parsedInclusionCriteria,
                exclusionCriteria: parsedExclusionCriteria
              }
            }
          }} />
        </div>
      </div>
      
      {/* Delete Confirmation Dialog */}
      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete Criterion</DialogTitle>
          </DialogHeader>
          <p className="text-sm">
            Are you sure you want to delete this {deleteType} criterion? This action cannot be undone.
          </p>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => setShowDeleteDialog(false)}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
      {/* Generate with AI Dialog */}
      <Dialog open={showGenerateDialog} onOpenChange={setShowGenerateDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Generate Inclusion/Exclusion Criteria</DialogTitle>
          </DialogHeader>
          
          {isGenerating ? (
            <div className="py-6">
              <AIGenerationStatus sections={generationStatus} />
            </div>
          ) : (
            <div className="py-4">
              <p className="text-sm mb-6">
                Our AI will analyze your study synopsis and generate inclusion and exclusion criteria based on best practices for your indication.
              </p>
              
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Check size={16} className="text-[#40c057]" />
                  <span className="text-sm">Based on similar clinical trials</span>
                </div>
                <div className="flex items-center gap-2">
                  <Check size={16} className="text-[#40c057]" />
                  <span className="text-sm">Following regulatory guidelines</span>
                </div>
                <div className="flex items-center gap-2">
                  <Check size={16} className="text-[#40c057]" />
                  <span className="text-sm">Optimized for protocol design</span>
                </div>
              </div>
              
              <div className="p-3 bg-blue-50 rounded border border-blue-100 mt-6">
                <p className="text-xs text-blue-700">
                  This will replace your current criteria. Make sure to save any existing criteria you want to keep.
                </p>
              </div>
            </div>
          )}
          
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => setShowGenerateDialog(false)}
              disabled={isGenerating}
            >
              Cancel
            </Button>
            
            {!isGenerating && (
              <AIProcessingButton 
                onProcess={handleGenerateWithAI} 
                disabled={!protocol.synopsis}
              />
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
      {/* New Inclusion Exclusion Comparison Component */}
      <InclusionExclusionComparison protocol={{
        ...protocol,
        inclusionExclusionCriteria: {
          content: {
            inclusionCriteria: parsedInclusionCriteria,
            exclusionCriteria: parsedExclusionCriteria
          }
        }
      }} />
    </div>
  )
}

export default InclusionExclusionCriteria