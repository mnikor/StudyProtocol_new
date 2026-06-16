import React, { useState } from "react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { AlertTriangle, Info, Plus, CheckCircle2, ArrowUpDown } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { 
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"
import { Separator } from "@/components/ui/separator"
import { TooltipProvider, Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip"
import { AIGeneratedBadge } from "@/components/ai-generated-badge"

interface TrialComparisonResultsProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  comparisonData: any
  onApplyRecommendations: (recommendedCriteria: any) => void
}

export function TrialComparisonResults({
  open,
  onOpenChange,
  comparisonData,
  onApplyRecommendations
}: TrialComparisonResultsProps) {
  const [activeTab, setActiveTab] = useState("summary")
  const [selectedRecommendations, setSelectedRecommendations] = useState<{
    inclusion: string[]
    exclusion: string[]
  }>({
    inclusion: [],
    exclusion: []
  })
  
  // Helper to count selected recommendations
  const selectedCount = selectedRecommendations.inclusion.length + 
    selectedRecommendations.exclusion.length
  
  // If no comparison data is available, show an empty state
  if (!comparisonData) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Trial Comparison</DialogTitle>
          </DialogHeader>
          <div className="py-6 text-center">
            <p>No comparison data available</p>
          </div>
        </DialogContent>
      </Dialog>
    )
  }
  
  // Helper to toggle selection of a recommendation
  const toggleRecommendation = (type: "inclusion" | "exclusion", text: string) => {
    setSelectedRecommendations(prev => {
      if (type === "inclusion") {
        return {
          ...prev,
          inclusion: prev.inclusion.includes(text)
            ? prev.inclusion.filter(t => t !== text)
            : [...prev.inclusion, text]
        }
      } else {
        return {
          ...prev,
          exclusion: prev.exclusion.includes(text)
            ? prev.exclusion.filter(t => t !== text)
            : [...prev.exclusion, text]
        }
      }
    })
  }
  
  // Helper to select all recommendations
  const selectAllRecommendations = () => {
    setSelectedRecommendations({
      inclusion: comparisonData.recommendations?.inclusion || [],
      exclusion: comparisonData.recommendations?.exclusion || []
    })
  }
  
  // Helper to clear all selections
  const clearSelections = () => {
    setSelectedRecommendations({
      inclusion: [],
      exclusion: []
    })
  }
  
  // Handle applying selected recommendations
  const handleApplyRecommendations = () => {
    onApplyRecommendations(selectedRecommendations)
  }
  
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle>Eligibility Criteria Comparison</DialogTitle>
            <div className="flex items-center gap-2">
              <AIGeneratedBadge />
            </div>
          </div>
        </DialogHeader>
        
        {/* Trial list shown at the top */}
        <div className="flex flex-wrap gap-2 my-2">
          {comparisonData.trials?.map((trial: any, index: number) => (
            <Badge key={index} variant="outline" className="font-normal">
              {trial.title?.length > 50 ? trial.title?.substring(0, 50) + '...' : trial.title}
            </Badge>
          ))}
        </div>
        
        <Tabs defaultValue="summary" value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col overflow-hidden">
          <TabsList className="grid grid-cols-3">
            <TabsTrigger value="summary">Summary</TabsTrigger>
            <TabsTrigger value="inclusion">Inclusion Criteria</TabsTrigger>
            <TabsTrigger value="exclusion">Exclusion Criteria</TabsTrigger>
          </TabsList>
          
          {/* Summary Tab */}
          <TabsContent value="summary" className="flex-1 overflow-hidden flex flex-col">
            <ScrollArea className="flex-1">
              <div className="space-y-6 p-4">
                {/* Overview section */}
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold">Overview</h3>
                  <p className="text-sm text-[#495057]">
                    {comparisonData.summary?.overview || "Comparison analysis complete."}
                  </p>
                  
                  {/* Statistics */}
                  <div className="grid grid-cols-2 gap-4 mt-6">
                    <div className="bg-[#f8f9fa] p-4 rounded-md border border-[#e9ecef]">
                      <h4 className="text-sm font-medium mb-2">Inclusion Criteria</h4>
                      <div className="flex justify-between items-center">
                        <div>
                          <p className="text-xs text-[#6c757d]">Criteria in your protocol</p>
                          <p className="text-xl font-semibold">{comparisonData.statistics?.totalInclusion || 0}</p>
                        </div>
                        <div>
                          <p className="text-xs text-[#6c757d]">Common in similar trials</p>
                          <p className="text-xl font-semibold">{comparisonData.statistics?.commonInclusion || 0}</p>
                        </div>
                      </div>
                    </div>
                    
                    <div className="bg-[#f8f9fa] p-4 rounded-md border border-[#e9ecef]">
                      <h4 className="text-sm font-medium mb-2">Exclusion Criteria</h4>
                      <div className="flex justify-between items-center">
                        <div>
                          <p className="text-xs text-[#6c757d]">Criteria in your protocol</p>
                          <p className="text-xl font-semibold">{comparisonData.statistics?.totalExclusion || 0}</p>
                        </div>
                        <div>
                          <p className="text-xs text-[#6c757d]">Common in similar trials</p>
                          <p className="text-xl font-semibold">{comparisonData.statistics?.commonExclusion || 0}</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
                
                {/* Strengths and Gaps */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
                  {/* Strengths */}
                  <div>
                    <h4 className="text-sm font-medium flex items-center mb-2">
                      <CheckCircle2 className="text-green-500 mr-2" size={16} />
                      Strengths
                    </h4>
                    <ul className="space-y-2">
                      {comparisonData.strengths && comparisonData.strengths.length > 0 ? (
                        comparisonData.strengths.map((strength: string, idx: number) => (
                          <li key={idx} className="text-sm flex items-start gap-2">
                            <span className="text-green-500 font-bold">•</span>
                            <span>{strength}</span>
                          </li>
                        ))
                      ) : (
                        <li className="text-sm text-[#6c757d]">No specific strengths identified</li>
                      )}
                    </ul>
                  </div>
                  
                  {/* Gaps */}
                  <div>
                    <h4 className="text-sm font-medium flex items-center mb-2">
                      <AlertTriangle className="text-amber-500 mr-2" size={16} />
                      Gaps
                    </h4>
                    <ul className="space-y-2">
                      {comparisonData.gaps && comparisonData.gaps.length > 0 ? (
                        comparisonData.gaps.map((gap: string, idx: number) => (
                          <li key={idx} className="text-sm flex items-start gap-2">
                            <span className="text-amber-500 font-bold">•</span>
                            <span>{gap}</span>
                          </li>
                        ))
                      ) : (
                        <li className="text-sm text-[#6c757d]">No significant gaps identified</li>
                      )}
                    </ul>
                  </div>
                </div>
                
                {/* Recommendations section */}
                <div className="mt-6">
                  <h4 className="text-sm font-medium flex items-center mb-3">
                    <Info className="text-blue-500 mr-2" size={16} />
                    Recommendations
                  </h4>
                  
                  <div className="bg-blue-50 border border-blue-100 rounded-md p-4">
                    <p className="text-sm text-blue-800">
                      {comparisonData.summary?.recommendations || 
                        "Based on the analysis, the following recommendations would improve your protocol's eligibility criteria."}
                    </p>
                    
                    <div className="mt-3 flex flex-wrap gap-2">
                      {(comparisonData.recommendations?.inclusion?.length > 0 || 
                       comparisonData.recommendations?.exclusion?.length > 0) ? (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-8 text-xs border-blue-300 text-blue-700 hover:bg-blue-100"
                          onClick={() => setActiveTab("inclusion")}
                        >
                          View Recommended Criteria
                        </Button>
                      ) : (
                        <Badge variant="secondary">No specific recommendations</Badge>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </ScrollArea>
          </TabsContent>
          
          {/* Inclusion Criteria Tab */}
          <TabsContent value="inclusion" className="flex-1 overflow-hidden flex flex-col">
            <ScrollArea className="flex-1">
              <div className="space-y-6 p-4">
                {/* Common Inclusion Criteria */}
                <div className="border rounded-md overflow-hidden">
                  <div className="bg-[#e7f5ff] p-3 border-b border-[#d0ebff]">
                    <h4 className="font-medium text-[#1864ab]">Common Inclusion Criteria</h4>
                    <p className="text-xs text-[#1864ab] mt-1">
                      Criteria that appear in both your protocol and similar trials
                    </p>
                  </div>
                  <div className="p-4">
                    {comparisonData.commonCriteria?.inclusion?.length ? (
                      <ul className="space-y-2">
                        {comparisonData.commonCriteria.inclusion.map((criterion: any, idx: number) => (
                          <li key={idx} className="border p-3 rounded-md flex items-start gap-2">
                            <Badge variant="outline" className="whitespace-nowrap mt-0.5">
                              {criterion.prevalence}%
                            </Badge>
                            <span className="text-sm">{criterion.text}</span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-sm text-muted-foreground">No common inclusion criteria found</p>
                    )}
                  </div>
                </div>
                
                {/* Missing Inclusion Criteria */}
                <div className="border rounded-md overflow-hidden">
                  <div className="bg-amber-50 p-3 border-b border-amber-100">
                    <h4 className="font-medium text-amber-700">Missing Inclusion Criteria</h4>
                    <p className="text-xs text-amber-700 mt-1">
                      Common in similar trials but not in your protocol
                    </p>
                  </div>
                  <div className="p-4">
                    {comparisonData.recommendations?.inclusion?.length ? (
                      <ul className="space-y-2">
                        {comparisonData.recommendations.inclusion.map((criterion: string, idx: number) => (
                          <li key={idx} className="border p-3 rounded-md flex items-start gap-2">
                            <div className="mt-0.5">
                              <Checkbox
                                id={`rec-inc-${idx}`}
                                checked={selectedRecommendations.inclusion.includes(criterion)}
                                onCheckedChange={() => toggleRecommendation("inclusion", criterion)}
                                className="mt-1"
                              />
                            </div>
                            <div className="flex-1">
                              <label 
                                htmlFor={`rec-inc-${idx}`} 
                                className="text-sm cursor-pointer"
                              >
                                {criterion}
                              </label>
                            </div>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-sm text-muted-foreground">No missing inclusion criteria found</p>
                    )}
                  </div>
                </div>
                
                {/* Unique Inclusion Criteria */}
                <div className="border rounded-md overflow-hidden">
                  <div className="bg-gray-50 p-3 border-b">
                    <h4 className="font-medium text-gray-700">Unique Inclusion Criteria</h4>
                    <p className="text-xs text-gray-600 mt-1">
                      Only in your protocol but not common in similar trials
                    </p>
                  </div>
                  <div className="p-4">
                    {comparisonData.uniqueCriteria?.inclusion?.length ? (
                      <ul className="space-y-2">
                        {comparisonData.uniqueCriteria.inclusion.map((criterion: string, idx: number) => (
                          <li key={idx} className="border p-3 rounded-md">
                            <p className="text-sm">{criterion}</p>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-sm text-muted-foreground">No unique inclusion criteria found</p>
                    )}
                  </div>
                </div>
              </div>
            </ScrollArea>
          </TabsContent>
          
          {/* Exclusion Criteria Tab */}
          <TabsContent value="exclusion" className="flex-1 overflow-hidden flex flex-col">
            <ScrollArea className="flex-1">
              <div className="space-y-6 p-4">
                {/* Common Exclusion Criteria */}
                <div className="border rounded-md overflow-hidden">
                  <div className="bg-[#e7f5ff] p-3 border-b border-[#d0ebff]">
                    <h4 className="font-medium text-[#1864ab]">Common Exclusion Criteria</h4>
                    <p className="text-xs text-[#1864ab] mt-1">
                      Criteria that appear in both your protocol and similar trials
                    </p>
                  </div>
                  <div className="p-4">
                    {comparisonData.commonCriteria?.exclusion?.length ? (
                      <ul className="space-y-2">
                        {comparisonData.commonCriteria.exclusion.map((criterion: any, idx: number) => (
                          <li key={idx} className="border p-3 rounded-md flex items-start gap-2">
                            <Badge variant="outline" className="whitespace-nowrap mt-0.5">
                              {criterion.prevalence}%
                            </Badge>
                            <span className="text-sm">{criterion.text}</span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-sm text-muted-foreground">No common exclusion criteria found</p>
                    )}
                  </div>
                </div>
                
                {/* Missing Exclusion Criteria */}
                <div className="border rounded-md overflow-hidden">
                  <div className="bg-amber-50 p-3 border-b border-amber-100">
                    <h4 className="font-medium text-amber-700">Missing Exclusion Criteria</h4>
                    <p className="text-xs text-amber-700 mt-1">
                      Common in similar trials but not in your protocol
                    </p>
                  </div>
                  <div className="p-4">
                    {comparisonData.recommendations?.exclusion?.length ? (
                      <ul className="space-y-2">
                        {comparisonData.recommendations.exclusion.map((criterion: string, idx: number) => (
                          <li key={idx} className="border p-3 rounded-md flex items-start gap-2">
                            <div className="mt-0.5">
                              <Checkbox
                                id={`rec-exc-${idx}`}
                                checked={selectedRecommendations.exclusion.includes(criterion)}
                                onCheckedChange={() => toggleRecommendation("exclusion", criterion)}
                                className="mt-1"
                              />
                            </div>
                            <div className="flex-1">
                              <label 
                                htmlFor={`rec-exc-${idx}`} 
                                className="text-sm cursor-pointer"
                              >
                                {criterion}
                              </label>
                            </div>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-sm text-muted-foreground">No missing exclusion criteria found</p>
                    )}
                  </div>
                </div>
                
                {/* Unique Exclusion Criteria */}
                <div className="border rounded-md overflow-hidden">
                  <div className="bg-gray-50 p-3 border-b">
                    <h4 className="font-medium text-gray-700">Unique Exclusion Criteria</h4>
                    <p className="text-xs text-gray-600 mt-1">
                      Only in your protocol but not common in similar trials
                    </p>
                  </div>
                  <div className="p-4">
                    {comparisonData.uniqueCriteria?.exclusion?.length ? (
                      <ul className="space-y-2">
                        {comparisonData.uniqueCriteria.exclusion.map((criterion: string, idx: number) => (
                          <li key={idx} className="border p-3 rounded-md">
                            <p className="text-sm">{criterion}</p>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-sm text-muted-foreground">No unique exclusion criteria found</p>
                    )}
                  </div>
                </div>
              </div>
            </ScrollArea>
          </TabsContent>
        </Tabs>
        
        <DialogFooter className="border-t border-gray-100 pt-3">
          <div className="flex items-center gap-2">
            {(comparisonData.recommendations?.inclusion?.length > 0 || 
             comparisonData.recommendations?.exclusion?.length > 0) && (
              <div className="flex flex-1 gap-2">
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={selectAllRecommendations}
                  className="text-xs"
                >
                  Select All
                </Button>
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={clearSelections}
                  className="text-xs"
                  disabled={selectedCount === 0}
                >
                  Clear
                </Button>
              </div>
            )}
            
            <Button
              variant="default"
              className="bg-[#228be6] hover:bg-[#1864ab]"
              disabled={selectedCount === 0}
              onClick={handleApplyRecommendations}
            >
              <Plus size={16} className="mr-1" />
              Apply Selected ({selectedCount})
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// Missing Checkbox component reference
const Checkbox = ({ id, checked, onCheckedChange, className }: any) => {
  return (
    <input
      type="checkbox"
      id={id}
      checked={checked}
      onChange={() => onCheckedChange(!checked)}
      className={className}
    />
  )
}