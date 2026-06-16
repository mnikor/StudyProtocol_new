import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AlertTriangle, Check, ChevronRight, Info, X } from "lucide-react";

interface TrialSummary {
  nctId: string;
  title: string;
}

interface ComparisonItem {
  text: string;
  category: string;
  prevalence: number;
}

interface ComparisonData {
  summary: {
    overview: string;
    recommendations: string;
    strengths: string[];
    gaps: string[];
  };
  statistics: {
    totalInclusion: number;
    totalExclusion: number;
    commonInclusion: number;
    commonExclusion: number;
    totalComparisonTrials: number;
  };
  commonCriteria: {
    inclusion: ComparisonItem[];
    exclusion: ComparisonItem[];
  };
  uniqueCriteria: {
    inclusion: string[];
    exclusion: string[];
  };
  recommendations: {
    inclusion: string[];
    exclusion: string[];
  };
  trials: TrialSummary[];
}

interface TrialComparisonResultsProps {
  comparisonData: ComparisonData;
  isLoading: boolean;
  onClose: () => void;
  onSave?: () => void;
}

export function TrialComparisonResults({
  comparisonData,
  isLoading,
  onClose,
  onSave
}: TrialComparisonResultsProps) {
  const [activeTab, setActiveTab] = useState("summary");
  
  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center p-8 h-full">
        <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full mb-4"></div>
        <p className="text-lg font-medium">Analyzing trial comparison data...</p>
        <p className="text-sm text-muted-foreground">This may take a moment as we perform an in-depth analysis.</p>
      </div>
    );
  }
  
  if (!comparisonData) {
    return (
      <div className="flex flex-col items-center justify-center p-8 h-full">
        <AlertTriangle className="w-12 h-12 text-destructive mb-4" />
        <p className="text-lg font-medium">No comparison data available</p>
        <p className="text-sm text-muted-foreground mb-4">We couldn't generate a comparison analysis. Please try again with different trials.</p>
        <Button onClick={onClose}>Close</Button>
      </div>
    );
  }
  
  // Helper function to determine badge color based on prevalence
  const getPrevalenceBadge = (prevalence: number) => {
    if (prevalence >= 80) return "bg-[#e6fcf5] text-[#0ca678] border-[#0ca678]";
    if (prevalence >= 50) return "bg-[#fff3bf] text-[#f08c00] border-[#f08c00]";
    return "bg-[#f1f3f5] text-[#495057] border-[#adb5bd]";
  };
  
  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between py-4 px-6 border-b">
        <div>
          <h2 className="text-lg font-semibold">Trial Comparison Analysis</h2>
          <p className="text-sm text-muted-foreground">
            Comparing current protocol with {comparisonData.statistics.totalComparisonTrials} similar trials
          </p>
        </div>
        <Button variant="ghost" size="icon" onClick={onClose}>
          <X className="h-5 w-5" />
        </Button>
      </div>
      
      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col">
        <div className="px-6 border-b">
          <TabsList className="mt-2">
            <TabsTrigger value="summary">Summary</TabsTrigger>
            <TabsTrigger value="criteria">Criteria Comparison</TabsTrigger>
            <TabsTrigger value="recommendations">Recommendations</TabsTrigger>
            <TabsTrigger value="trials">Comparison Trials</TabsTrigger>
          </TabsList>
        </div>
        
        <div className="flex-1 overflow-hidden">
          {/* Summary Tab */}
          <TabsContent value="summary" className="flex-1 p-6 h-full overflow-auto">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <Card className="md:col-span-2">
                <CardHeader>
                  <CardTitle>Overview</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm">{comparisonData.summary.overview}</p>
                </CardContent>
              </Card>
              
              <Card>
                <CardHeader>
                  <CardTitle>Criteria Statistics</CardTitle>
                </CardHeader>
                <CardContent>
                  <dl className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <dt>Inclusion Criteria:</dt>
                      <dd className="font-medium">{comparisonData.statistics.totalInclusion}</dd>
                    </div>
                    <div className="flex justify-between">
                      <dt>Exclusion Criteria:</dt>
                      <dd className="font-medium">{comparisonData.statistics.totalExclusion}</dd>
                    </div>
                    <div className="flex justify-between">
                      <dt>Common with Similar Trials:</dt>
                      <dd className="font-medium">
                        {comparisonData.statistics.commonInclusion + comparisonData.statistics.commonExclusion}
                      </dd>
                    </div>
                    <div className="flex justify-between">
                      <dt>Unique to This Protocol:</dt>
                      <dd className="font-medium">
                        {(comparisonData.uniqueCriteria.inclusion.length || 0) + 
                         (comparisonData.uniqueCriteria.exclusion.length || 0)}
                      </dd>
                    </div>
                    <div className="flex justify-between">
                      <dt>Recommended Additions:</dt>
                      <dd className="font-medium text-[#1971c2]">
                        {(comparisonData.recommendations.inclusion.length || 0) + 
                         (comparisonData.recommendations.exclusion.length || 0)}
                      </dd>
                    </div>
                  </dl>
                </CardContent>
              </Card>
              
              <Card>
                <CardHeader>
                  <CardTitle>Strengths</CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-2">
                    {comparisonData.summary.strengths.map((strength, idx) => (
                      <li key={idx} className="flex text-sm">
                        <Check className="h-5 w-5 mr-2 flex-shrink-0 text-green-600" />
                        <span>{strength}</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
              
              <Card>
                <CardHeader>
                  <CardTitle>Gaps</CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-2">
                    {comparisonData.summary.gaps.map((gap, idx) => (
                      <li key={idx} className="flex text-sm">
                        <AlertTriangle className="h-5 w-5 mr-2 flex-shrink-0 text-amber-500" />
                        <span>{gap}</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
              
              <Card className="md:col-span-2">
                <CardHeader>
                  <CardTitle>Recommendations</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm">{comparisonData.summary.recommendations}</p>
                </CardContent>
                <CardFooter>
                  <Button onClick={() => setActiveTab("recommendations")} variant="outline" className="w-full">
                    View Detailed Recommendations <ChevronRight className="ml-2 h-4 w-4" />
                  </Button>
                </CardFooter>
              </Card>
            </div>
          </TabsContent>
          
          {/* Criteria Comparison Tab */}
          <TabsContent value="criteria" className="flex-1 h-full overflow-auto">
            <div className="p-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Inclusion Criteria */}
                <Card>
                  <CardHeader className="bg-[#e7f5ff] border-b">
                    <CardTitle>Inclusion Criteria</CardTitle>
                    <CardDescription>
                      Criteria common with similar trials
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="p-0">
                    <ScrollArea className="h-[500px]">
                      {comparisonData.commonCriteria.inclusion.length > 0 ? (
                        <div className="p-4">
                          {/* Group criteria by category */}
                          {Object.entries(
                            comparisonData.commonCriteria.inclusion.reduce((acc, item) => {
                              if (!acc[item.category]) {
                                acc[item.category] = [];
                              }
                              acc[item.category].push(item);
                              return acc;
                            }, {} as Record<string, ComparisonItem[]>)
                          ).map(([category, items]) => (
                            <div key={category} className="mb-6">
                              <h3 className="font-medium text-sm mb-2">{category}</h3>
                              <ul className="space-y-3">
                                {items.map((item, idx) => (
                                  <li key={idx} className="flex">
                                    <span className="text-sm flex-1">{item.text}</span>
                                    <Badge variant="outline" className={`ml-2 ${getPrevalenceBadge(item.prevalence)}`}>
                                      {item.prevalence}% of trials
                                    </Badge>
                                  </li>
                                ))}
                              </ul>
                              <Separator className="my-4" />
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="p-6 text-center">
                          <Info className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
                          <p>No common inclusion criteria found</p>
                        </div>
                      )}
                    </ScrollArea>
                  </CardContent>
                </Card>
                
                {/* Exclusion Criteria */}
                <Card>
                  <CardHeader className="bg-[#fff5f5] border-b">
                    <CardTitle>Exclusion Criteria</CardTitle>
                    <CardDescription>
                      Criteria common with similar trials
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="p-0">
                    <ScrollArea className="h-[500px]">
                      {comparisonData.commonCriteria.exclusion.length > 0 ? (
                        <div className="p-4">
                          {/* Group criteria by category */}
                          {Object.entries(
                            comparisonData.commonCriteria.exclusion.reduce((acc, item) => {
                              if (!acc[item.category]) {
                                acc[item.category] = [];
                              }
                              acc[item.category].push(item);
                              return acc;
                            }, {} as Record<string, ComparisonItem[]>)
                          ).map(([category, items]) => (
                            <div key={category} className="mb-6">
                              <h3 className="font-medium text-sm mb-2">{category}</h3>
                              <ul className="space-y-3">
                                {items.map((item, idx) => (
                                  <li key={idx} className="flex">
                                    <span className="text-sm flex-1">{item.text}</span>
                                    <Badge variant="outline" className={`ml-2 ${getPrevalenceBadge(item.prevalence)}`}>
                                      {item.prevalence}% of trials
                                    </Badge>
                                  </li>
                                ))}
                              </ul>
                              <Separator className="my-4" />
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="p-6 text-center">
                          <Info className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
                          <p>No common exclusion criteria found</p>
                        </div>
                      )}
                    </ScrollArea>
                  </CardContent>
                </Card>
                
                {/* Unique Criteria */}
                <Card className="md:col-span-2">
                  <CardHeader className="bg-[#f8f9fa] border-b">
                    <CardTitle>Unique Criteria</CardTitle>
                    <CardDescription>
                      Criteria unique to your protocol (not found in comparison trials)
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="p-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <h3 className="font-medium text-sm mb-2">Unique Inclusion Criteria</h3>
                        {comparisonData.uniqueCriteria.inclusion.length > 0 ? (
                          <ul className="space-y-2">
                            {comparisonData.uniqueCriteria.inclusion.map((criterion, idx) => (
                              <li key={idx} className="text-sm flex items-start">
                                <span className="bg-[#e9ecef] text-[#495057] w-5 h-5 rounded-full flex items-center justify-center mr-2 flex-shrink-0">
                                  {idx + 1}
                                </span>
                                {criterion}
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <p className="text-sm text-muted-foreground italic">No unique inclusion criteria</p>
                        )}
                      </div>
                      
                      <div>
                        <h3 className="font-medium text-sm mb-2">Unique Exclusion Criteria</h3>
                        {comparisonData.uniqueCriteria.exclusion.length > 0 ? (
                          <ul className="space-y-2">
                            {comparisonData.uniqueCriteria.exclusion.map((criterion, idx) => (
                              <li key={idx} className="text-sm flex items-start">
                                <span className="bg-[#e9ecef] text-[#495057] w-5 h-5 rounded-full flex items-center justify-center mr-2 flex-shrink-0">
                                  {idx + 1}
                                </span>
                                {criterion}
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <p className="text-sm text-muted-foreground italic">No unique exclusion criteria</p>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>
          </TabsContent>
          
          {/* Recommendations Tab */}
          <TabsContent value="recommendations" className="flex-1 p-6 h-full overflow-auto">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Card>
                <CardHeader className="bg-[#e7f5ff] border-b">
                  <CardTitle>Recommended Inclusion Criteria</CardTitle>
                  <CardDescription>
                    Consider adding these criteria to improve your protocol
                  </CardDescription>
                </CardHeader>
                <CardContent className="p-4">
                  {comparisonData.recommendations.inclusion.length > 0 ? (
                    <ul className="space-y-3">
                      {comparisonData.recommendations.inclusion.map((criterion, idx) => (
                        <li key={idx} className="flex items-start p-2 rounded hover:bg-[#f1f3f5]">
                          <span className="bg-[#4dabf7] text-white w-5 h-5 rounded-full flex items-center justify-center mr-2 mt-0.5 flex-shrink-0">
                            {idx + 1}
                          </span>
                          <span className="text-sm">{criterion}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <div className="p-4 text-center">
                      <Check className="h-8 w-8 mx-auto mb-2 text-green-500" />
                      <p className="text-sm">No additional inclusion criteria recommended</p>
                    </div>
                  )}
                </CardContent>
                {onSave && comparisonData.recommendations.inclusion.length > 0 && (
                  <CardFooter>
                    <Button onClick={onSave} variant="outline" className="w-full">
                      Add Recommended Criteria
                    </Button>
                  </CardFooter>
                )}
              </Card>
              
              <Card>
                <CardHeader className="bg-[#fff5f5] border-b">
                  <CardTitle>Recommended Exclusion Criteria</CardTitle>
                  <CardDescription>
                    Consider adding these criteria to improve your protocol
                  </CardDescription>
                </CardHeader>
                <CardContent className="p-4">
                  {comparisonData.recommendations.exclusion.length > 0 ? (
                    <ul className="space-y-3">
                      {comparisonData.recommendations.exclusion.map((criterion, idx) => (
                        <li key={idx} className="flex items-start p-2 rounded hover:bg-[#f1f3f5]">
                          <span className="bg-[#ff6b6b] text-white w-5 h-5 rounded-full flex items-center justify-center mr-2 mt-0.5 flex-shrink-0">
                            {idx + 1}
                          </span>
                          <span className="text-sm">{criterion}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <div className="p-4 text-center">
                      <Check className="h-8 w-8 mx-auto mb-2 text-green-500" />
                      <p className="text-sm">No additional exclusion criteria recommended</p>
                    </div>
                  )}
                </CardContent>
                {onSave && comparisonData.recommendations.exclusion.length > 0 && (
                  <CardFooter>
                    <Button onClick={onSave} variant="outline" className="w-full">
                      Add Recommended Criteria
                    </Button>
                  </CardFooter>
                )}
              </Card>
            </div>
          </TabsContent>
          
          {/* Trials Tab */}
          <TabsContent value="trials" className="flex-1 p-6 h-full overflow-auto">
            <Card>
              <CardHeader>
                <CardTitle>Comparison Trials</CardTitle>
                <CardDescription>
                  Trials used for this comparison analysis
                </CardDescription>
              </CardHeader>
              <CardContent>
                {comparisonData.trials.length > 0 ? (
                  <ul className="divide-y">
                    {comparisonData.trials.map((trial) => (
                      <li key={trial.nctId} className="py-3">
                        <p className="font-medium">{trial.title}</p>
                        <div className="flex items-center mt-1">
                          <span className="text-sm text-muted-foreground">{trial.nctId}</span>
                          <a
                            href={`https://clinicaltrials.gov/study/${trial.nctId}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="ml-2 text-sm text-primary hover:underline"
                          >
                            View on ClinicalTrials.gov
                          </a>
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className="p-4 text-center">
                    <p>No comparison trials available</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
}