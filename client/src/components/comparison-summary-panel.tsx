"use client"

import { X, BarChart, BarChart2, Activity, FileCheck, Download, AlertTriangle, CheckCircle, Info, ThumbsUp, Lightbulb } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { AIGeneratedBadge } from "@/components/ai-generated-badge"
import { 
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"

interface ComparisonSummaryPanelProps {
  onClose: () => void
  section?: "schedule" | "criteria" | "variables"
  comparisonData?: any
}

export function ComparisonSummaryPanel({ onClose, section = "criteria", comparisonData }: ComparisonSummaryPanelProps) {
  // If we have no comparison data, display a default UI
  const hasComparisonData = comparisonData && 
    (comparisonData.inclusionAnalysis || 
     comparisonData.exclusionAnalysis || 
     comparisonData.summary);
     
  console.log("ComparisonSummaryPanel received data:", comparisonData ? Object.keys(comparisonData) : 'No data');
  
  // Get total counts for different criteria types
  const getRestrictiveCount = () => {
    let count = 0;
    
    if (comparisonData?.inclusionAnalysis) {
      Object.values(comparisonData.inclusionAnalysis).forEach((category: any) => {
        Object.values(category).forEach((criterion: any) => {
          if (criterion.comparisonType === "restrictive") count++;
        });
      });
    }
    
    if (comparisonData?.exclusionAnalysis) {
      Object.values(comparisonData.exclusionAnalysis).forEach((category: any) => {
        Object.values(category).forEach((criterion: any) => {
          if (criterion.comparisonType === "restrictive") count++;
        });
      });
    }
    
    return count;
  };
  
  const getMissingCount = () => {
    return comparisonData?.missingCriteria?.length || 0;
  };
  
  const getStandardCount = () => {
    let count = 0;
    
    if (comparisonData?.inclusionAnalysis) {
      Object.values(comparisonData.inclusionAnalysis).forEach((category: any) => {
        Object.values(category).forEach((criterion: any) => {
          if (criterion.comparisonType === "standard") count++;
        });
      });
    }
    
    if (comparisonData?.exclusionAnalysis) {
      Object.values(comparisonData.exclusionAnalysis).forEach((category: any) => {
        Object.values(category).forEach((criterion: any) => {
          if (criterion.comparisonType === "standard") count++;
        });
      });
    }
    
    return count;
  };
  
  return (
    <div className="bg-white rounded-md border border-[#dee2e6] p-4 mb-4">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <BarChart2 size={18} className="text-[#228be6]" />
          <h3 className="font-medium">Comparison Summary</h3>
          <AIGeneratedBadge />
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="h-8 flex items-center text-xs"
          >
            <Download size={14} className="mr-1.5" />
            Export Report
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={onClose}
          >
            <X size={16} />
          </Button>
        </div>
      </div>

      {!hasComparisonData ? (
        // No data available - show placeholder UI
        <div className="p-8 text-center space-y-4">
          <div className="mx-auto w-12 h-12 rounded-full bg-blue-50 flex items-center justify-center">
            <Info size={24} className="text-blue-500" />
          </div>
          <h3 className="text-lg font-medium">No Comparison Data Available</h3>
          <p className="text-sm text-muted-foreground max-w-md mx-auto">
            Select trials to compare using the "Compare with Similar Trials" button to see a detailed analysis of how your protocol compares to other studies.
          </p>
        </div>
      ) : (
        // Display actual comparison data
        <ScrollArea className="max-h-[calc(100vh-250px)]">
          <div className="space-y-4">
            {/* Summary metrics */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="border border-[#dee2e6] rounded-md p-3 bg-[#f8f9fa]">
                <div className="flex items-center gap-2 mb-2">
                  <CheckCircle size={16} className="text-[#51cf66]" />
                  <h4 className="text-sm font-medium">Standard Criteria</h4>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm">Total</span>
                  <span className="text-sm font-medium">{getStandardCount()}</span>
                </div>
                <div className="mt-2 flex items-center gap-1 text-[#51cf66] text-xs">
                  <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><path d="M12 16v-4"></path><path d="M12 8h.01"></path></svg>
                  <span>Criteria well-aligned with similar trials</span>
                </div>
              </div>

              <div className="border border-[#dee2e6] rounded-md p-3 bg-[#f8f9fa]">
                <div className="flex items-center gap-2 mb-2">
                  <AlertTriangle size={16} className="text-[#fcc419]" />
                  <h4 className="text-sm font-medium">Restrictive Criteria</h4>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm">Total</span>
                  <span className="text-sm font-medium">{getRestrictiveCount()}</span>
                </div>
                <div className="mt-2 flex items-center gap-1 text-[#fcc419] text-xs">
                  <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><path d="M12 16v-4"></path><path d="M12 8h.01"></path></svg>
                  <span>May limit patient enrollment compared to similar trials</span>
                </div>
              </div>

              <div className="border border-[#dee2e6] rounded-md p-3 bg-[#f8f9fa]">
                <div className="flex items-center gap-2 mb-2">
                  <Lightbulb size={16} className="text-[#228be6]" />
                  <h4 className="text-sm font-medium">Missing Criteria</h4>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm">Total</span>
                  <span className="text-sm font-medium">{getMissingCount()}</span>
                </div>
                <div className="mt-2 flex items-center gap-1 text-[#228be6] text-xs">
                  <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><path d="M12 16v-4"></path><path d="M12 8h.01"></path></svg>
                  <span>Common criteria found in similar trials but missing in yours</span>
                </div>
              </div>
            </div>

            {/* Main comparison tabs */}
            <Tabs defaultValue="summary" className="w-full">
              <TabsList className="mb-2 w-full">
                <TabsTrigger value="summary">Summary</TabsTrigger>
                <TabsTrigger value="inclusion">Inclusion Criteria</TabsTrigger>
                <TabsTrigger value="exclusion">Exclusion Criteria</TabsTrigger>
              </TabsList>
              
              {/* Summary Tab */}
              <TabsContent value="summary">
                <div className="border border-[#dee2e6] rounded-md overflow-hidden">
                  <div className="bg-[#f8f9fa] p-3 border-b border-[#dee2e6]">
                    <h4 className="text-sm font-medium">Analysis Overview</h4>
                  </div>
                  <div className="p-4">
                    <p className="text-sm mb-4">
                      {comparisonData?.summary?.overview || 
                       "This analysis compares your protocol's eligibility criteria with similar clinical trials in the same therapeutic area."}
                    </p>
                    
                    {/* Population Impact */}
                    {comparisonData?.summary?.populationImpact && (
                      <div className="mb-4 p-3 bg-[#fff9db] rounded-md">
                        <h5 className="text-sm font-medium mb-1 flex items-center gap-1">
                          <AlertTriangle size={14} className="text-[#f08c00]" />
                          Population Impact
                        </h5>
                        <p className="text-sm">{comparisonData.summary.populationImpact}</p>
                      </div>
                    )}
                    
                    {/* Strengths and Weaknesses */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                      {/* Strengths */}
                      <div className="border border-[#51cf66]/20 rounded-md p-3 bg-[#d3f9d8]/50">
                        <h5 className="text-sm font-medium mb-2 flex items-center gap-1 text-[#2b8a3e]">
                          <ThumbsUp size={14} />
                          Strengths
                        </h5>
                        <ul className="space-y-2">
                          {comparisonData?.summary?.strengths?.map((strength: string, idx: number) => (
                            <li key={idx} className="flex items-start gap-2">
                              <CheckCircle size={14} className="text-[#2b8a3e] mt-0.5 flex-shrink-0" />
                              <span className="text-sm">{strength}</span>
                            </li>
                          )) || (
                            <li className="text-sm text-muted-foreground">No strengths identified</li>
                          )}
                        </ul>
                      </div>
                      
                      {/* Weaknesses */}
                      <div className="border border-[#fa5252]/20 rounded-md p-3 bg-[#ffe3e3]/50">
                        <h5 className="text-sm font-medium mb-2 flex items-center gap-1 text-[#c92a2a]">
                          <AlertTriangle size={14} />
                          Areas for Improvement
                        </h5>
                        <ul className="space-y-2">
                          {comparisonData?.summary?.weaknesses?.map((weakness: string, idx: number) => (
                            <li key={idx} className="flex items-start gap-2">
                              <AlertTriangle size={14} className="text-[#c92a2a] mt-0.5 flex-shrink-0" />
                              <span className="text-sm">{weakness}</span>
                            </li>
                          )) || (
                            <li className="text-sm text-muted-foreground">No weaknesses identified</li>
                          )}
                        </ul>
                      </div>
                    </div>
                  </div>
                </div>
                
                {/* Recommendations */}
                {comparisonData?.summary?.recommendations && comparisonData.summary.recommendations.length > 0 && (
                  <div className="mt-4 border border-[#228be6]/20 rounded-md overflow-hidden">
                    <div className="bg-[#e7f5ff] p-3 border-b border-[#228be6]/20">
                      <h4 className="text-sm font-medium text-[#1864ab]">AI Recommendations</h4>
                    </div>
                    <div className="p-4">
                      <ul className="space-y-3">
                        {comparisonData.summary.recommendations.map((recommendation: string, idx: number) => (
                          <li key={idx} className="flex items-start gap-2">
                            <Lightbulb size={16} className="text-[#228be6] mt-0.5 flex-shrink-0" />
                            <span className="text-sm">{recommendation}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                )}
              </TabsContent>
              
              {/* Inclusion Criteria Tab */}
              <TabsContent value="inclusion">
                <div className="border border-[#dee2e6] rounded-md overflow-hidden">
                  <div className="bg-[#f8f9fa] p-3 border-b border-[#dee2e6] flex justify-between items-center">
                    <h4 className="text-sm font-medium">Inclusion Criteria Analysis</h4>
                    <Badge variant="outline" className="h-6 font-normal">
                      {Object.keys(comparisonData?.inclusionAnalysis || {}).reduce((total, category) => {
                        return total + Object.keys(comparisonData.inclusionAnalysis[category]).length;
                      }, 0)} criteria analyzed
                    </Badge>
                  </div>
                  
                  <div className="p-4">
                    <Accordion type="multiple" className="w-full">
                      {Object.entries(comparisonData?.inclusionAnalysis || {}).map(([category, criteria]: [string, any], idx) => (
                        <AccordionItem key={idx} value={`inclusion-${category}`}>
                          <AccordionTrigger className="text-sm">
                            {category}
                          </AccordionTrigger>
                          <AccordionContent>
                            <ul className="space-y-3">
                              {Object.entries(criteria).map(([summary, details]: [string, any], critIdx) => {
                                const comparisonTypeColor = 
                                  details.comparisonType === "restrictive" ? "text-[#fa5252]" :
                                  details.comparisonType === "missing" ? "text-[#228be6]" :
                                  details.comparisonType === "unique" ? "text-[#be4bdb]" :
                                  "text-[#212529]";
                                
                                const icon = 
                                  details.comparisonType === "restrictive" ? <AlertTriangle size={14} className="text-[#fa5252] mt-0.5 flex-shrink-0" /> :
                                  details.comparisonType === "missing" ? <Lightbulb size={14} className="text-[#228be6] mt-0.5 flex-shrink-0" /> :
                                  details.comparisonType === "unique" ? <Info size={14} className="text-[#be4bdb] mt-0.5 flex-shrink-0" /> :
                                  <CheckCircle size={14} className="text-[#51cf66] mt-0.5 flex-shrink-0" />;
                                
                                return (
                                  <li key={critIdx} className="flex items-start gap-2">
                                    {icon}
                                    <div>
                                      <p className="text-sm font-medium">{summary}</p>
                                      <div className="flex items-center gap-2 mt-1">
                                        <Badge variant="outline" className="h-5 text-xs px-1.5 font-normal">
                                          {details.prevalence}/{details.totalTrials} trials
                                        </Badge>
                                        <span className={`text-xs ${comparisonTypeColor}`}>
                                          {details.comparisonType.charAt(0).toUpperCase() + details.comparisonType.slice(1)}
                                        </span>
                                        <span className="text-xs">Impact: {details.impact}</span>
                                      </div>
                                      {details.notes && (
                                        <p className="text-xs text-muted-foreground mt-1">{details.notes}</p>
                                      )}
                                    </div>
                                  </li>
                                );
                              })}
                            </ul>
                          </AccordionContent>
                        </AccordionItem>
                      ))}
                    </Accordion>
                  </div>
                </div>
                
                {/* Missing Inclusion Criteria */}
                {comparisonData?.missingCriteria && comparisonData.missingCriteria.filter((c: any) => c.criterionType === "inclusion").length > 0 && (
                  <div className="mt-4 border border-[#228be6]/20 rounded-md overflow-hidden">
                    <div className="bg-[#e7f5ff] p-3 border-b border-[#228be6]/20">
                      <h4 className="text-sm font-medium text-[#1864ab]">Missing Inclusion Criteria</h4>
                    </div>
                    <div className="p-4">
                      <ul className="space-y-3">
                        {comparisonData.missingCriteria
                          .filter((c: any) => c.criterionType === "inclusion")
                          .map((criterion: any, idx: number) => (
                            <li key={idx} className="flex items-start gap-2">
                              <Lightbulb size={16} className="text-[#228be6] mt-0.5 flex-shrink-0" />
                              <div>
                                <p className="text-sm font-medium">{criterion.criterion}</p>
                                <div className="flex items-center gap-2 mt-1">
                                  <Badge variant="outline" className="h-5 text-xs px-1.5 font-normal">
                                    {criterion.prevalence} trials
                                  </Badge>
                                  <span className="text-xs">Importance: {criterion.importance}</span>
                                </div>
                                <Button 
                                  variant="outline" 
                                  size="sm" 
                                  className="mt-2 h-7 text-xs"
                                >
                                  Add to Protocol
                                </Button>
                              </div>
                            </li>
                          ))}
                      </ul>
                    </div>
                  </div>
                )}
              </TabsContent>
              
              {/* Exclusion Criteria Tab */}
              <TabsContent value="exclusion">
                <div className="border border-[#dee2e6] rounded-md overflow-hidden">
                  <div className="bg-[#f8f9fa] p-3 border-b border-[#dee2e6] flex justify-between items-center">
                    <h4 className="text-sm font-medium">Exclusion Criteria Analysis</h4>
                    <Badge variant="outline" className="h-6 font-normal">
                      {Object.keys(comparisonData?.exclusionAnalysis || {}).reduce((total, category) => {
                        return total + Object.keys(comparisonData.exclusionAnalysis[category]).length;
                      }, 0)} criteria analyzed
                    </Badge>
                  </div>
                  
                  <div className="p-4">
                    <Accordion type="multiple" className="w-full">
                      {Object.entries(comparisonData?.exclusionAnalysis || {}).map(([category, criteria]: [string, any], idx) => (
                        <AccordionItem key={idx} value={`exclusion-${category}`}>
                          <AccordionTrigger className="text-sm">
                            {category}
                          </AccordionTrigger>
                          <AccordionContent>
                            <ul className="space-y-3">
                              {Object.entries(criteria).map(([summary, details]: [string, any], critIdx) => {
                                const comparisonTypeColor = 
                                  details.comparisonType === "restrictive" ? "text-[#fa5252]" :
                                  details.comparisonType === "missing" ? "text-[#228be6]" :
                                  details.comparisonType === "unique" ? "text-[#be4bdb]" :
                                  "text-[#212529]";
                                
                                const icon = 
                                  details.comparisonType === "restrictive" ? <AlertTriangle size={14} className="text-[#fa5252] mt-0.5 flex-shrink-0" /> :
                                  details.comparisonType === "missing" ? <Lightbulb size={14} className="text-[#228be6] mt-0.5 flex-shrink-0" /> :
                                  details.comparisonType === "unique" ? <Info size={14} className="text-[#be4bdb] mt-0.5 flex-shrink-0" /> :
                                  <CheckCircle size={14} className="text-[#51cf66] mt-0.5 flex-shrink-0" />;
                                
                                return (
                                  <li key={critIdx} className="flex items-start gap-2">
                                    {icon}
                                    <div>
                                      <p className="text-sm font-medium">{summary}</p>
                                      <div className="flex items-center gap-2 mt-1">
                                        <Badge variant="outline" className="h-5 text-xs px-1.5 font-normal">
                                          {details.prevalence}/{details.totalTrials} trials
                                        </Badge>
                                        <span className={`text-xs ${comparisonTypeColor}`}>
                                          {details.comparisonType.charAt(0).toUpperCase() + details.comparisonType.slice(1)}
                                        </span>
                                        <span className="text-xs">Impact: {details.impact}</span>
                                      </div>
                                      {details.notes && (
                                        <p className="text-xs text-muted-foreground mt-1">{details.notes}</p>
                                      )}
                                    </div>
                                  </li>
                                );
                              })}
                            </ul>
                          </AccordionContent>
                        </AccordionItem>
                      ))}
                    </Accordion>
                  </div>
                </div>
                
                {/* Missing Exclusion Criteria */}
                {comparisonData?.missingCriteria && comparisonData.missingCriteria.filter((c: any) => c.criterionType === "exclusion").length > 0 && (
                  <div className="mt-4 border border-[#228be6]/20 rounded-md overflow-hidden">
                    <div className="bg-[#e7f5ff] p-3 border-b border-[#228be6]/20">
                      <h4 className="text-sm font-medium text-[#1864ab]">Missing Exclusion Criteria</h4>
                    </div>
                    <div className="p-4">
                      <ul className="space-y-3">
                        {comparisonData.missingCriteria
                          .filter((c: any) => c.criterionType === "exclusion")
                          .map((criterion: any, idx: number) => (
                            <li key={idx} className="flex items-start gap-2">
                              <Lightbulb size={16} className="text-[#228be6] mt-0.5 flex-shrink-0" />
                              <div>
                                <p className="text-sm font-medium">{criterion.criterion}</p>
                                <div className="flex items-center gap-2 mt-1">
                                  <Badge variant="outline" className="h-5 text-xs px-1.5 font-normal">
                                    {criterion.prevalence} trials
                                  </Badge>
                                  <span className="text-xs">Importance: {criterion.importance}</span>
                                </div>
                                <Button 
                                  variant="outline" 
                                  size="sm" 
                                  className="mt-2 h-7 text-xs"
                                >
                                  Add to Protocol
                                </Button>
                              </div>
                            </li>
                          ))}
                      </ul>
                    </div>
                  </div>
                )}
              </TabsContent>
            </Tabs>
          </div>
        </ScrollArea>
      )}
    </div>
  )
}
