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
  Loader2
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { AIGeneratedBadge } from "@/components/ai-generated-badge"
import { AIProcessingButton } from "@/components/ai-processing-button"
import { AIGenerationStatus, SectionStatus } from "@/components/ai-generation-status"
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
import { Protocol } from "@shared/schema"
import { useToast } from "@/hooks/use-toast"

interface InclusionExclusionCriteriaProps {
  protocol: Protocol
  setProtocol: React.Dispatch<React.SetStateAction<Protocol>>
}

const FixedCriteria: React.FC<InclusionExclusionCriteriaProps> = ({ protocol, setProtocol }) => {
  const { toast } = useToast()
  const [newInclusionText, setNewInclusionText] = useState("")
  const [newExclusionText, setNewExclusionText] = useState("")
  const [isGenerating, setIsGenerating] = useState(false)
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [showAiSuggestions, setShowAiSuggestions] = useState(true)
  const [showGenerateDialog, setShowGenerateDialog] = useState(false)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [deleteType, setDeleteType] = useState<"inclusion" | "exclusion">("inclusion")
  const [deleteId, setDeleteId] = useState<number | null>(null)
  
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
      
      // Call the API
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
        setProtocol({
          ...protocol,
          inclusionCriteria: JSON.stringify(result.inclusionCriteria),
          exclusionCriteria: JSON.stringify(result.exclusionCriteria)
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

  // Get CSS styles for impact colors
  const getImpactColorStyles = (impact: string) => {
    switch(impact) {
      case "Required":
        return {
          dot: "#fa5252",
          tagBg: "#ffe3e3",
          tagText: "#fa5252"
        };
      case "High":
        return {
          dot: "#fcc419",
          tagBg: "#fff3bf",
          tagText: "#e67700"
        };
      case "Medium":
        return {
          dot: "#4dabf7",
          tagBg: "#e7f5ff",
          tagText: "#1864ab"
        };
      default: // Standard
        return {
          dot: "#adb5bd",
          tagBg: "#f1f3f5", 
          tagText: "#495057"
        };
    }
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="col-span-2 space-y-6">
          {/* Inclusion Criteria Section */}
          <div className="bg-white rounded-md border border-[#dee2e6] overflow-hidden">
            <div className="flex items-center justify-between p-3 border-b border-[#dee2e6] bg-[#f8f9fa]">
              <div className="flex items-center">
                <h3 className="font-medium text-[#495057]">Inclusion Criteria</h3>
                <AIGeneratedBadge />
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 text-sm"
                onClick={() => setShowGenerateDialog(true)}
              >
                <Plus size={14} className="mr-1" />
                Generate with AI
              </Button>
            </div>
            
            <div className="p-4">
              <ul className="space-y-6">
                {parsedInclusionCriteria.map((criterion: any) => (
                  <li key={criterion.id} className="relative group border border-[#e9ecef] rounded-md overflow-hidden">
                    {/* Impact level left border indicator */}
                    <div 
                      className="absolute left-0 top-0 bottom-0 w-2.5" 
                      style={{ backgroundColor: getImpactColorStyles(criterion.impact).dot }}
                    ></div>
                    
                    <div className="grid grid-cols-[1fr,auto]">
                      <div className="p-3 pl-5">
                        <p className="text-sm text-[#495057] leading-relaxed">{criterion.text}</p>
                        
                        {showAiSuggestions && criterion.aiSuggestion && (
                          <div className="mt-3 text-xs text-[#1c7ed6] bg-[#e7f5ff] p-2.5 rounded-md flex items-start gap-2">
                            <AlertCircle size={14} className="mt-0.5 flex-shrink-0" />
                            <span>{criterion.aiSuggestion}</span>
                          </div>
                        )}
                      </div>
                      
                      <div className="border-l border-[#e9ecef] px-4 flex items-center bg-[#f8f9fa]">
                        <div className="flex items-center gap-1.5">
                          <div className="w-3 h-3 rounded-full" 
                              style={{ backgroundColor: getImpactColorStyles(criterion.impact).dot }}
                          ></div>
                          <div className="px-2 py-1 rounded text-xs font-medium"
                              style={{ 
                                backgroundColor: getImpactColorStyles(criterion.impact).tagBg,
                                color: getImpactColorStyles(criterion.impact).tagText
                              }}
                          >
                            {criterion.impact}
                          </div>
                        </div>
                      </div>
                    </div>
                    
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 opacity-0 group-hover:opacity-100 text-[#adb5bd] hover:text-[#fa5252] absolute top-2 right-2"
                      onClick={() => handleDeleteClick(criterion.id, "inclusion")}
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
            </div>
            
            <div className="p-4">
              <ul className="space-y-6">
                {parsedExclusionCriteria.map((criterion: any) => (
                  <li key={criterion.id} className="relative group border border-[#e9ecef] rounded-md overflow-hidden">
                    {/* Impact level left border indicator */}
                    <div 
                      className="absolute left-0 top-0 bottom-0 w-2.5" 
                      style={{ backgroundColor: getImpactColorStyles(criterion.impact).dot }}
                    ></div>
                    
                    <div className="grid grid-cols-[1fr,auto]">
                      <div className="p-3 pl-5">
                        <p className="text-sm text-[#495057] leading-relaxed">{criterion.text}</p>
                        
                        {showAiSuggestions && criterion.aiSuggestion && (
                          <div className="mt-3 text-xs text-[#1c7ed6] bg-[#e7f5ff] p-2.5 rounded-md flex items-start gap-2">
                            <AlertCircle size={14} className="mt-0.5 flex-shrink-0" />
                            <span>{criterion.aiSuggestion}</span>
                          </div>
                        )}
                      </div>
                      
                      <div className="border-l border-[#e9ecef] px-4 flex items-center bg-[#f8f9fa]">
                        <div className="flex items-center gap-1.5">
                          <div className="w-3 h-3 rounded-full" 
                              style={{ backgroundColor: getImpactColorStyles(criterion.impact).dot }}
                          ></div>
                          <div className="px-2 py-1 rounded text-xs font-medium"
                              style={{ 
                                backgroundColor: getImpactColorStyles(criterion.impact).tagBg,
                                color: getImpactColorStyles(criterion.impact).tagText
                              }}
                          >
                            {criterion.impact}
                          </div>
                        </div>
                      </div>
                    </div>
                    
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 opacity-0 group-hover:opacity-100 text-[#adb5bd] hover:text-[#fa5252] absolute top-2 right-2"
                      onClick={() => handleDeleteClick(criterion.id, "exclusion")}
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
                    variant="outline" 
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
                className="h-8 text-xs flex items-center gap-1.5"
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
            
            <div className="p-4">
              {parsedInclusionCriteria.length > 0 && parsedExclusionCriteria.length > 0 ? (
                <Accordion type="single" collapsible className="w-full">
                  {criteriaImpactAnalysis.missingCriteria && criteriaImpactAnalysis.missingCriteria.length > 0 ? (
                    <AccordionItem value="missing" className="border-b border-[#dee2e6]">
                      <AccordionTrigger className="py-2 text-sm hover:no-underline">
                        <div className="flex items-center gap-2 text-[#fa5252]">
                          <AlertTriangle size={14} />
                          <span>Missing criteria ({criteriaImpactAnalysis.missingCriteria.length})</span>
                        </div>
                      </AccordionTrigger>
                      <AccordionContent>
                        <ul className="space-y-2 text-xs">
                          {criteriaImpactAnalysis.missingCriteria.map((item, index) => (
                            <li key={index} className="flex items-center justify-between">
                              <span>{item.text}</span>
                              <Button variant="outline" size="sm" className="h-6 text-xs">Add</Button>
                            </li>
                          ))}
                        </ul>
                      </AccordionContent>
                    </AccordionItem>
                  ) : null}
                  
                  {criteriaImpactAnalysis.ambiguousCriteria && criteriaImpactAnalysis.ambiguousCriteria.length > 0 ? (
                    <AccordionItem value="ambiguous" className="border-b border-[#dee2e6]">
                      <AccordionTrigger className="py-2 text-sm hover:no-underline">
                        <div className="flex items-center gap-2 text-[#fcc419]">
                          <AlertTriangle size={14} />
                          <span>Ambiguous criteria ({criteriaImpactAnalysis.ambiguousCriteria.length})</span>
                        </div>
                      </AccordionTrigger>
                      <AccordionContent>
                        <ul className="space-y-2 text-xs">
                          {criteriaImpactAnalysis.ambiguousCriteria.map((item, index) => (
                            <li key={index} className="flex items-center justify-between">
                              <span>{item.text}</span>
                              <Button variant="outline" size="sm" className="h-6 text-xs">Fix</Button>
                            </li>
                          ))}
                        </ul>
                      </AccordionContent>
                    </AccordionItem>
                  ) : null}
                  
                  {(!criteriaImpactAnalysis.missingCriteria?.length && !criteriaImpactAnalysis.ambiguousCriteria?.length) && (
                    <div className="py-3 text-center text-sm text-[#6c757d]">
                      {isAnalyzing ? 
                        "Analyzing criteria..." : 
                        "Click 'Analyze Impact' to identify validation issues"}
                    </div>
                  )}
                </Accordion>
              ) : (
                <div className="text-center py-4">
                  <AlertCircle size={24} className="text-[#adb5bd] mb-2 mx-auto" />
                  <p className="text-[#6c757d] text-sm">
                    Generate inclusion/exclusion criteria first
                  </p>
                </div>
              )}
            </div>
          </div>
          
          {/* Regulatory Guidance */}
          <div className="bg-white rounded-md border border-[#dee2e6] overflow-hidden">
            <div className="p-3 border-b border-[#dee2e6] bg-[#f8f9fa]">
              <h3 className="font-medium text-[#495057]">Regulatory Guidance</h3>
            </div>
            
            <div className="p-4">
              {parsedInclusionCriteria.length > 0 && parsedExclusionCriteria.length > 0 && criteriaImpactAnalysis.eligibilityRate > 0 ? (
                criteriaImpactAnalysis.regulatoryGuidance && criteriaImpactAnalysis.regulatoryGuidance.length > 0 ? (
                  criteriaImpactAnalysis.regulatoryGuidance.map((guidance, index) => (
                    <div key={index} className="flex items-start gap-2 mb-3 last:mb-0">
                      <Target size={16} className="text-[#228be6] mt-0.5" />
                      <div>
                        <p className="text-sm font-medium">{guidance.title}</p>
                        <p className="text-xs text-[#6c757d]">
                          {guidance.description}
                        </p>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="flex flex-col items-center justify-center text-center">
                    <p className="text-[#6c757d] text-sm">
                      Regulatory guidance will be available after analysis
                    </p>
                  </div>
                )
              ) : (
                <div className="text-center py-2">
                  <p className="text-[#6c757d] text-sm">
                    Click 'Analyze Impact' after generating criteria to view regulatory compliance information
                  </p>
                </div>
              )}
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
                  onProcess={handleGenerateWithAI}
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

export default FixedCriteria