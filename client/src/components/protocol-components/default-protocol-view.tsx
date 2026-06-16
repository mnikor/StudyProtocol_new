import React from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { AIGeneratedBadge } from "@/components/ai-generated-badge";
import { RefreshCw } from "lucide-react";

interface DefaultProtocolViewProps {
  protocol: any;
  activeDesignState: any;
  overviewData: {
    summary: string;
    clinicalContext: string;
    objectives: string;
    endpoints: string;
    design: string;
    targetPopulation: string;
    significance: string;
  };
  onRefresh: () => void;
}

export function DefaultProtocolView({ 
  protocol, 
  activeDesignState, 
  overviewData, 
  onRefresh 
}: DefaultProtocolViewProps) {
  return (
    <div className="space-y-6">
      <Card className="mb-6">
        <CardHeader className="pb-2">
          <div className="flex justify-between items-center">
            <div>
              <CardTitle>Study Parameters</CardTitle>
              <CardDescription>Key elements extracted from your protocol</CardDescription>
            </div>
            <div className="flex items-center">
              <AIGeneratedBadge className="mr-2" />
              <Button 
                variant="outline" 
                size="sm" 
                onClick={onRefresh}
                className="flex items-center text-xs"
              >
                <RefreshCw className="h-3 w-3 mr-1" /> Refresh
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-4">
              <div>
                <h3 className="font-medium text-gray-800 mb-1">Population</h3>
                <Separator className="my-1" />
                <div className="p-3 bg-gray-50 rounded-md text-sm">
                  {overviewData.targetPopulation}
                </div>
              </div>
              
              {/* Only show intervention for appropriate protocol types */}
              {(protocol.protocolType === 'interventional_clinical_trial' || 
                !protocol.protocolType || 
                protocol.protocolType === 'prospective_cohort_study') && (
                <div>
                  <h3 className="font-medium text-gray-800 mb-1">
                    {protocol.protocolType === 'prospective_cohort_study' ? 'Exposure' : 'Intervention'}
                  </h3>
                  <Separator className="my-1" />
                  <div className="p-3 bg-gray-50 rounded-md text-sm">
                    {/* Only show intervention details if they've been populated by AI analysis */}
                    {(activeDesignState?.studyParameters?.intervention?.description && 
                      activeDesignState.studyParameters.intervention.description.trim().length > 0 &&
                      activeDesignState.studyParameters.intervention.description !== "Not specified") ? 
                      activeDesignState.studyParameters.intervention.description : 
                      (protocol.title ? 
                        `${protocol.protocolType === 'prospective_cohort_study' ? 'Exposure' : 'Intervention'} details for ${protocol.title.split(' ').slice(0, 2).join(' ')}... will appear here after analysis` : 
                        "Not available - run analysis first")}
                  </div>
                </div>
              )}
              
              {/* Show data source for secondary data analysis and RWE studies */}
              {(protocol.protocolType === 'secondary_data_analysis' || 
                protocol.protocolType === 'retrospective_cohort_study') && (
                <div>
                  <h3 className="font-medium text-gray-800 mb-1">Data Source</h3>
                  <Separator className="my-1" />
                  <div className="p-3 bg-gray-50 rounded-md text-sm">
                    {/* Display database details if available, otherwise show a placeholder */}
                    {activeDesignState?.studyParameters?.dataSource ? (
                      <div>
                        <p><strong>Name:</strong> {activeDesignState.studyParameters.dataSource.name || "Electronic Health Records"}</p>
                        <p><strong>Type:</strong> {activeDesignState.studyParameters.dataSource.type || "Not specified"}</p>
                        {activeDesignState.studyParameters.dataSource.timePeriod && 
                          <p><strong>Time Period:</strong> {activeDesignState.studyParameters.dataSource.timePeriod}</p>}
                        {activeDesignState.studyParameters.dataSource.geographicScope && 
                          <p><strong>Geographic Scope:</strong> {activeDesignState.studyParameters.dataSource.geographicScope}</p>}
                      </div>
                    ) : (
                      "Database details will appear here after analysis"
                    )}
                  </div>
                </div>
              )}
              
              <div>
                <h3 className="font-medium text-gray-800 mb-1">
                  {protocol.protocolType === 'cross_sectional_survey' ? "Survey Methodology" : "Study Design"}
                </h3>
                <Separator className="my-1" />
                <div className="p-3 bg-gray-50 rounded-md text-sm">
                  {(() => {
                    // Process design text based on protocol type
                    if (protocol.protocolType === 'secondary_data_analysis' || 
                        protocol.protocolType === 'retrospective_cohort_study') {
                      // For secondary data analysis, remove mentions of randomization/blinding
                      return overviewData.design
                        .replace(/randomized/gi, 'observational')
                        .replace(/randomization/gi, 'observational design')
                        .replace(/blinded|blinding|blind/gi, 'non-blinded observational')
                        .replace(/placebo/gi, 'comparison group')
                        .replace(/double-blind|triple-blind|single-blind|open-label/gi, 'observational');
                    } 
                    else if (protocol.protocolType === 'prospective_cohort_study') {
                      // For prospective cohort studies, remove mentions of randomization/blinding
                      return overviewData.design
                        .replace(/randomized/gi, 'non-randomized observational')
                        .replace(/randomization/gi, 'cohort allocation')
                        .replace(/blinded|blinding|blind/gi, 'open-label observational')
                        .replace(/placebo/gi, 'unexposed group')
                        .replace(/double-blind|triple-blind|single-blind|open-label/gi, 'prospective observational');
                    }
                    else if (protocol.protocolType === 'cross_sectional_survey') {
                      // For survey studies, adapt terminology
                      return overviewData.design
                        .replace(/randomized|randomization/gi, 'survey sampling')
                        .replace(/blinded|blinding|blind/gi, 'unbiased assessment')
                        .replace(/placebo/gi, 'comparison group')
                        .replace(/double-blind|triple-blind|single-blind|open-label/gi, 'cross-sectional');
                    }
                    // For interventional trials, use the original design text
                    return overviewData.design;
                  })()}
                </div>
              </div>
            </div>
            
            <div className="space-y-4">
              <div>
                <h3 className="font-medium text-gray-800 mb-1">Primary Objective</h3>
                <Separator className="my-1" />
                <div className="p-3 bg-gray-50 rounded-md text-sm">
                  {overviewData.objectives.split('\n')[0] || "Not specified"}
                </div>
              </div>
              
              <div>
                <h3 className="font-medium text-gray-800 mb-1">
                  {protocol.protocolType === 'cross_sectional_survey' ? "Primary Measure" :
                   protocol.protocolType === 'secondary_data_analysis' || 
                   protocol.protocolType === 'retrospective_cohort_study' || 
                   protocol.protocolType === 'prospective_cohort_study' ? "Primary Outcome" :
                   "Primary Endpoint"}
                </h3>
                <Separator className="my-1" />
                <div className="p-3 bg-gray-50 rounded-md text-sm">
                  {(() => {
                    // Only use activeDesignState data if we're sure it's been populated by AI analysis
                    const hasValidPrimaryEndpoint = activeDesignState?.studyParameters?.outcomes?.primary?.[0]?.name && 
                                                   activeDesignState.studyParameters.outcomes.primary[0].name.trim().length > 0;
                    
                    if (hasValidPrimaryEndpoint) {
                      return activeDesignState.studyParameters.outcomes.primary[0].name;
                    } else {
                      // Extract the first endpoint from the overview text
                      const firstEndpoint = overviewData.endpoints.split('\n')[0];
                      return firstEndpoint || "Not specified";
                    }
                  })()}
                </div>
              </div>
              
              <div>
                <h3 className="font-medium text-gray-800 mb-1">Clinical Significance</h3>
                <Separator className="my-1" />
                <div className="p-3 bg-gray-50 rounded-md text-sm">
                  {overviewData.significance}
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
      
      <Card>
        <CardHeader>
          <CardTitle>Protocol Summary</CardTitle>
          <CardDescription>At-a-glance overview of your study design</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm mb-4">{overviewData.summary}</p>
        </CardContent>
      </Card>
      
      {activeDesignState?.qualityMetrics && (
        <Card>
          <CardHeader>
            <CardTitle>Design Quality Assessment</CardTitle>
            <CardDescription>
              Evaluation of scientific value, clinical relevance, and feasibility
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {activeDesignState.qualityMetrics.scientificRigor && (
                <div>
                  <h3 className="font-medium text-gray-800 mb-1">Scientific Rigor</h3>
                  <Separator className="my-1" />
                  <div className="flex justify-between items-center">
                    <div className="p-3 bg-gray-50 rounded-md text-sm flex-1 mr-4">
                      {activeDesignState.qualityMetrics.scientificRigor.assessment}
                    </div>
                    <div className="w-16 h-16 rounded-full flex items-center justify-center text-xl font-semibold" 
                      style={{
                        backgroundColor: `rgba(${
                          activeDesignState.qualityMetrics.scientificRigor.score > 7 ? '52, 211, 153' : 
                          activeDesignState.qualityMetrics.scientificRigor.score > 4 ? '249, 168, 37' : 
                          '239, 68, 68'
                        }, 0.2)`,
                        color: `rgb(${
                          activeDesignState.qualityMetrics.scientificRigor.score > 7 ? '52, 211, 153' : 
                          activeDesignState.qualityMetrics.scientificRigor.score > 4 ? '249, 168, 37' : 
                          '239, 68, 68'
                        })`
                      }}
                    >
                      {activeDesignState.qualityMetrics.scientificRigor.score}/10
                    </div>
                  </div>
                </div>
              )}
              
              {activeDesignState.qualityMetrics.clinicalRelevance && (
                <div>
                  <h3 className="font-medium text-gray-800 mb-1">Clinical Relevance</h3>
                  <Separator className="my-1" />
                  <div className="flex justify-between items-center">
                    <div className="p-3 bg-gray-50 rounded-md text-sm flex-1 mr-4">
                      {activeDesignState.qualityMetrics.clinicalRelevance.assessment}
                    </div>
                    <div className="w-16 h-16 rounded-full flex items-center justify-center text-xl font-semibold" 
                      style={{
                        backgroundColor: `rgba(${
                          activeDesignState.qualityMetrics.clinicalRelevance.score > 7 ? '52, 211, 153' : 
                          activeDesignState.qualityMetrics.clinicalRelevance.score > 4 ? '249, 168, 37' : 
                          '239, 68, 68'
                        }, 0.2)`,
                        color: `rgb(${
                          activeDesignState.qualityMetrics.clinicalRelevance.score > 7 ? '52, 211, 153' : 
                          activeDesignState.qualityMetrics.clinicalRelevance.score > 4 ? '249, 168, 37' : 
                          '239, 68, 68'
                        })`
                      }}
                    >
                      {activeDesignState.qualityMetrics.clinicalRelevance.score}/10
                    </div>
                  </div>
                </div>
              )}
              
              {activeDesignState.qualityMetrics.feasibility && (
                <div>
                  <h3 className="font-medium text-gray-800 mb-1">Feasibility</h3>
                  <Separator className="my-1" />
                  <div className="flex justify-between items-center">
                    <div className="p-3 bg-gray-50 rounded-md text-sm flex-1 mr-4">
                      {activeDesignState.qualityMetrics.feasibility.assessment}
                    </div>
                    <div className="w-16 h-16 rounded-full flex items-center justify-center text-xl font-semibold" 
                      style={{
                        backgroundColor: `rgba(${
                          activeDesignState.qualityMetrics.feasibility.score > 7 ? '52, 211, 153' : 
                          activeDesignState.qualityMetrics.feasibility.score > 4 ? '249, 168, 37' : 
                          '239, 68, 68'
                        }, 0.2)`,
                        color: `rgb(${
                          activeDesignState.qualityMetrics.feasibility.score > 7 ? '52, 211, 153' : 
                          activeDesignState.qualityMetrics.feasibility.score > 4 ? '249, 168, 37' : 
                          '239, 68, 68'
                        })`
                      }}
                    >
                      {activeDesignState.qualityMetrics.feasibility.score}/10
                    </div>
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}