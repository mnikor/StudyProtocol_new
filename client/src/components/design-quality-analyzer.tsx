import React, { useState } from 'react';
import { DesignState } from '@shared/schema';
import { 
  Card, 
  CardContent, 
  CardDescription, 
  CardFooter, 
  CardHeader, 
  CardTitle 
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Beaker, AlertTriangle, Loader2, Info, RefreshCw } from 'lucide-react';
import { apiRequest } from '@/lib/queryClient';

interface DesignQualityAnalyzerProps {
  protocolId: string;
  designState: DesignState;
  onAnalysisComplete: (updatedState: DesignState) => void;
}

export function DesignQualityAnalyzer({
  protocolId,
  designState,
  onAnalysisComplete
}: DesignQualityAnalyzerProps) {
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Add a separate state to track whether automatic analysis should happen
  const [autoAnalyzed, setAutoAnalyzed] = useState(false);

  const analyzeQuality = async () => {
    // Set autoAnalyzed to true to indicate user has manually triggered analysis
    setAutoAnalyzed(true);
    setAnalyzing(true);
    setError(null);
    
    try {
      const response = await apiRequest(
        'POST',
        `/api/protocols/${protocolId}/design-states/${designState.id}/quality-metrics`,
        {}
      );
      
      if (!response.ok) {
        throw new Error('Failed to analyze design quality metrics');
      }
      
      const result = await response.json();
      
      // Call the callback with the updated design state
      if (result.designState) {
        onAnalysisComplete(result.designState);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unknown error occurred');
    } finally {
      setAnalyzing(false);
    }
  };

  // Check if quality analysis is already available
  const hasQualityAnalysis = (
    (designState.scientificValue && designState.scientificValue.innovationScore !== undefined) || 
    (designState.clinicalRelevance && designState.clinicalRelevance.patientCenteredOutcomes !== undefined) || 
    (designState.feasibilityMetrics && designState.feasibilityMetrics.recruitmentSpeedImpact !== undefined)
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Design Quality Analysis</CardTitle>
        <CardDescription>
          Evaluate scientific value, clinical relevance, and feasibility metrics
        </CardDescription>
      </CardHeader>
      <CardContent>
        {error && (
          <Alert variant="destructive" className="mb-4">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        
        {!hasQualityAnalysis && !analyzing && (
          <div className="text-center py-6">
            <Beaker className="h-12 w-12 mx-auto text-gray-400 mb-3" />
            <p className="text-sm text-gray-600 mb-4">
              Click "Run Evaluation" to assess the scientific value, clinical relevance, and feasibility of this design.
            </p>
            <Button 
              className="bg-[#228be6] hover:bg-[#1c7ed6] text-white" 
              onClick={analyzeQuality} 
              disabled={analyzing}
            >
              <Beaker className="h-4 w-4 mr-2" />
              Run Evaluation
            </Button>
          </div>
        )}
        
        {analyzing && (
          <div className="text-center py-4">
            <Loader2 className="h-8 w-8 mx-auto text-primary animate-spin mb-2" />
            <p className="text-sm text-gray-600 mb-2">Analyzing design quality metrics...</p>
            <div className="relative h-2 w-full overflow-hidden rounded-full bg-secondary">
              <div className="h-full bg-primary animate-pulse absolute top-0 left-0 w-1/2" />
            </div>
          </div>
        )}
        
        {hasQualityAnalysis && !analyzing && (
          <div className="space-y-4">
            <div className="rounded-md border p-4">
              <h3 className="font-medium text-sm mb-2">Quality Analysis Summary</h3>
              
              <div className="flex items-center gap-2 mb-3 px-3 py-2 bg-blue-50 rounded-md border border-blue-100">
                <Info className="h-4 w-4 text-blue-500 shrink-0" />
                <p className="text-xs text-blue-700">
                  <strong>Hover over the blue info icons</strong> next to each metric to see detailed AI analysis and recommendations
                </p>
              </div>
              
              {/* Scientific Value Section */}
              {designState.scientificValue && (
                <div className="mb-4">
                  <h4 className="text-xs uppercase text-gray-500 font-medium mb-1">Scientific Value</h4>
                  <div className="grid grid-cols-2 gap-2 mb-2">
                    {designState.scientificValue.innovationScore !== undefined && (
                      <div>
                        <div className="flex items-center">
                          <div className="flex items-center">
                            <span className="text-xs font-medium">Innovation</span>
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Info className="h-4 w-4 ml-1 text-blue-500 animate-pulse cursor-help" />
                                </TooltipTrigger>
                                <TooltipContent className="w-80">
                                  <p className="text-xs font-semibold mb-1">Innovation Score: {Math.round(designState.scientificValue.innovationScore * 100)}%</p>
                                  <p className="text-xs mb-1">{designState.scientificValue.innovationRationale || "Evaluates how novel the study design, intervention approach, or methodology is compared to existing research. Higher scores indicate more innovative approaches."}</p>
                                  {designState.scientificValue.innovationScore >= 0.8 ? (
                                    <p className="text-xs text-green-600 font-medium pt-1 border-t border-gray-200">
                                      AI analysis: This design introduces notably innovative elements or approaches that differentiate it from standard clinical trials in this therapeutic area.
                                    </p>
                                  ) : designState.scientificValue.innovationScore >= 0.6 ? (
                                    <p className="text-xs text-amber-600 font-medium pt-1 border-t border-gray-200">
                                      AI analysis: This design incorporates some innovative elements while following established methodological frameworks, representing a balanced approach.
                                    </p>
                                  ) : (
                                    <p className="text-xs text-orange-600 font-medium pt-1 border-t border-gray-200">
                                      AI analysis: This design primarily follows conventional approaches with limited novel elements. Consider exploring more innovative methodologies.
                                    </p>
                                  )}
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          </div>
                          <span className="ml-auto text-xs">{Math.round(designState.scientificValue.innovationScore * 100)}%</span>
                        </div>
                        <div className="relative h-2 w-full overflow-hidden rounded-full bg-secondary mt-1">
                          <div 
                            className="h-full bg-amber-500 transition-all absolute top-0 left-0"
                            style={{ width: `${Math.round(designState.scientificValue.innovationScore * 100)}%` }}
                          />
                        </div>
                      </div>
                    )}
                    
                    {designState.scientificValue.potentialImpact !== undefined && (
                      <div>
                        <div className="flex items-center">
                          <div className="flex items-center">
                            <span className="text-xs font-medium">Impact</span>
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Info className="h-4 w-4 ml-1 text-blue-500 animate-pulse cursor-help" />
                                </TooltipTrigger>
                                <TooltipContent className="w-80">
                                  <p className="text-xs font-semibold mb-1">Potential Impact: {Math.round(designState.scientificValue.potentialImpact * 100)}%</p>
                                  <p className="text-xs mb-1">{designState.scientificValue.potentialImpactRationale || "Assesses the potential influence on clinical practice, future research, or patient outcomes. Higher scores suggest greater potential to change practice or address important research gaps."}</p>
                                  {designState.scientificValue.potentialImpact >= 0.9 ? (
                                    <p className="text-xs text-green-600 font-medium pt-1 border-t border-gray-200">
                                      AI analysis: This design has exceptional potential to significantly influence clinical practice guidelines and directly impact treatment decisions for a large patient population.
                                    </p>
                                  ) : designState.scientificValue.potentialImpact >= 0.7 ? (
                                    <p className="text-xs text-green-600 font-medium pt-1 border-t border-gray-200">
                                      AI analysis: This design has substantial potential to influence how patients are treated and could lead to meaningful changes in clinical practice if results are positive.
                                    </p>
                                  ) : (
                                    <p className="text-xs text-amber-600 font-medium pt-1 border-t border-gray-200">
                                      AI analysis: This design may have moderate impact on clinical practice or contribute incrementally to the evidence base, but is unlikely to fundamentally change treatment approaches.
                                    </p>
                                  )}
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          </div>
                          <span className="ml-auto text-xs">{Math.round(designState.scientificValue.potentialImpact * 100)}%</span>
                        </div>
                        <div className="relative h-2 w-full overflow-hidden rounded-full bg-secondary mt-1">
                          <div 
                            className="h-full bg-green-500 transition-all absolute top-0 left-0"
                            style={{ width: `${Math.round(designState.scientificValue.potentialImpact * 100)}%` }}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
              
              {/* Clinical Relevance Section */}
              {designState.clinicalRelevance && (
                <div className="mb-4">
                  <h4 className="text-xs uppercase text-gray-500 font-medium mb-1">Clinical Relevance</h4>
                  <div className="grid grid-cols-2 gap-2 mb-2">
                    {designState.clinicalRelevance.patientCenteredOutcomes !== undefined && (
                      <div>
                        <div className="flex items-center">
                          <div className="flex items-center">
                            <span className="text-xs font-medium">Patient-Centered</span>
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Info className="h-4 w-4 ml-1 text-blue-500 animate-pulse cursor-help" />
                                </TooltipTrigger>
                                <TooltipContent className="w-80">
                                  <p className="text-xs font-semibold mb-1">Patient-Centered Outcomes: {Math.round(designState.clinicalRelevance.patientCenteredOutcomes * 100)}%</p>
                                  <p className="text-xs mb-1">{designState.clinicalRelevance.patientCenteredRationale || "Evaluates how well the study captures outcomes that matter to patients, such as quality of life, symptom relief, and functional improvement. Higher scores indicate greater focus on patient-important outcomes."}</p>
                                  {designState.clinicalRelevance.patientCenteredOutcomes >= 0.8 ? (
                                    <p className="text-xs text-green-600 font-medium pt-1 border-t border-gray-200">
                                      AI analysis: This design excels at incorporating meaningful patient-centered outcomes that directly reflect quality of life and functional improvements important to patients.
                                    </p>
                                  ) : designState.clinicalRelevance.patientCenteredOutcomes >= 0.6 ? (
                                    <p className="text-xs text-amber-600 font-medium pt-1 border-t border-gray-200">
                                      AI analysis: This design includes some patient-relevant outcomes, but could be enhanced with additional measures that reflect quality of life or symptom burden.
                                    </p>
                                  ) : (
                                    <p className="text-xs text-orange-600 font-medium pt-1 border-t border-gray-200">
                                      AI analysis: This design primarily focuses on conventional endpoints with limited attention to outcomes that directly matter to patients in their daily lives.
                                    </p>
                                  )}
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          </div>
                          <span className="ml-auto text-xs">{Math.round(designState.clinicalRelevance.patientCenteredOutcomes * 100)}%</span>
                        </div>
                        <div className="relative h-2 w-full overflow-hidden rounded-full bg-secondary mt-1">
                          <div 
                            className="h-full bg-violet-500 transition-all absolute top-0 left-0"
                            style={{ width: `${Math.round(designState.clinicalRelevance.patientCenteredOutcomes * 100)}%` }}
                          />
                        </div>
                      </div>
                    )}
                    
                    {designState.clinicalRelevance.unmetNeedAlignment !== undefined && (
                      <div>
                        <div className="flex items-center">
                          <div className="flex items-center">
                            <span className="text-xs font-medium">Unmet Need</span>
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Info className="h-4 w-4 ml-1 text-blue-500 animate-pulse cursor-help" />
                                </TooltipTrigger>
                                <TooltipContent className="w-80">
                                  <p className="text-xs font-semibold mb-1">Unmet Need Alignment: {Math.round(designState.clinicalRelevance.unmetNeedAlignment * 100)}%</p>
                                  <p className="text-xs mb-1">{designState.clinicalRelevance.unmetNeedRationale || "Measures how well the study addresses significant gaps in current treatment options or clinical knowledge. Higher scores indicate addressing critical needs in the field."}</p>
                                  {designState.clinicalRelevance.unmetNeedAlignment >= 0.9 ? (
                                    <p className="text-xs text-green-600 font-medium pt-1 border-t border-gray-200">
                                      AI analysis: This design directly addresses a critical unmet need where few or no effective treatment options currently exist, representing a significant potential advancement.
                                    </p>
                                  ) : designState.clinicalRelevance.unmetNeedAlignment >= 0.7 ? (
                                    <p className="text-xs text-green-600 font-medium pt-1 border-t border-gray-200">
                                      AI analysis: This design targets an important clinical gap where current treatments have significant limitations or only work for a subset of patients.
                                    </p>
                                  ) : (
                                    <p className="text-xs text-amber-600 font-medium pt-1 border-t border-gray-200">
                                      AI analysis: This design addresses an area where some treatment options already exist, offering incremental rather than transformative improvement.
                                    </p>
                                  )}
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          </div>
                          <span className="ml-auto text-xs">{Math.round(designState.clinicalRelevance.unmetNeedAlignment * 100)}%</span>
                        </div>
                        <div className="relative h-2 w-full overflow-hidden rounded-full bg-secondary mt-1">
                          <div 
                            className="h-full bg-sky-500 transition-all absolute top-0 left-0"
                            style={{ width: `${Math.round(designState.clinicalRelevance.unmetNeedAlignment * 100)}%` }}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
              
              {/* Feasibility Section */}
              {designState.feasibilityMetrics && (
                <div className="mb-3">
                  <h4 className="text-xs uppercase text-gray-500 font-medium mb-1">Feasibility</h4>
                  <div className="grid grid-cols-2 gap-2 mb-2">
                    {designState.feasibilityMetrics.recruitmentSpeedImpact !== undefined && (
                      <div>
                        <div className="flex items-center">
                          <div className="flex items-center">
                            <span className="text-xs font-medium">Recruitment</span>
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Info className="h-3 w-3 ml-1 text-gray-400" />
                                </TooltipTrigger>
                                <TooltipContent className="w-64">
                                  <p className="text-xs font-semibold mb-1">Recruitment Speed Impact: {Math.round(designState.feasibilityMetrics.recruitmentSpeedImpact * 100)}%</p>
                                  <p className="text-xs">{designState.feasibilityMetrics.recruitmentRationale || "Evaluates how easily and quickly participants can be enrolled given the eligibility criteria and study procedures. Higher scores indicate faster, more efficient recruitment potential."}</p>
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          </div>
                          <span className="ml-auto text-xs">{Math.round(designState.feasibilityMetrics.recruitmentSpeedImpact * 100)}%</span>
                        </div>
                        <div className="relative h-2 w-full overflow-hidden rounded-full bg-secondary mt-1">
                          <div 
                            className="h-full bg-orange-500 transition-all absolute top-0 left-0"
                            style={{ width: `${Math.round(designState.feasibilityMetrics.recruitmentSpeedImpact * 100)}%` }}
                          />
                        </div>
                      </div>
                    )}
                    
                    {designState.feasibilityMetrics.participantBurden !== undefined && (
                      <div>
                        <div className="flex items-center">
                          <div className="flex items-center">
                            <span className="text-xs font-medium">Patient Burden</span>
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Info className="h-3 w-3 ml-1 text-gray-400" />
                                </TooltipTrigger>
                                <TooltipContent className="w-64">
                                  <p className="text-xs">Higher percentages are better - indicating lower burden on patients. The metric has been inverted to match the pattern where higher is better.</p>
                                  <p className="text-xs font-semibold mb-1">Patient Burden Score: {Math.round((1 - (designState.feasibilityMetrics.participantBurden || 0)) * 100)}%</p>
                                  <p className="text-xs">{designState.feasibilityMetrics.participantBurdenRationale || "Measures the burden placed on study participants in terms of visit frequency, procedure complexity, and time commitment. Higher percentages here indicate lower burden (better for patients)."}</p>
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          </div>
                          <span className="ml-auto text-xs">{Math.round((1 - (designState.feasibilityMetrics.participantBurden || 0)) * 100)}%</span>
                        </div>
                        <div className="relative h-2 w-full overflow-hidden rounded-full bg-secondary mt-1">
                          <div 
                            className="h-full bg-rose-500 transition-all absolute top-0 left-0"
                            style={{ width: `${Math.round((1 - (designState.feasibilityMetrics.participantBurden || 0)) * 100)}%` }}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Methodology Quality Section */}
              {designState.methodologyQuality && (
                <div className="mb-3">
                  <h4 className="text-xs uppercase text-gray-500 font-medium mb-1">Methodology Quality</h4>
                  <div className="grid grid-cols-2 gap-2 mb-2">
                    {designState.methodologyQuality.designAppropriateness !== undefined && (
                      <div>
                        <div className="flex items-center">
                          <div className="flex items-center">
                            <span className="text-xs font-medium">Design</span>
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Info className="h-3 w-3 ml-1 text-gray-400" />
                                </TooltipTrigger>
                                <TooltipContent className="w-64">
                                  <p className="text-xs font-semibold mb-1">Design Appropriateness: {Math.round(designState.methodologyQuality.designAppropriateness * 100)}%</p>
                                  <p className="text-xs">Evaluates whether the chosen study design is appropriate for the research question and objectives.</p>
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          </div>
                          <span className="ml-auto text-xs">{Math.round(designState.methodologyQuality.designAppropriateness * 100)}%</span>
                        </div>
                        <div className="relative h-2 w-full overflow-hidden rounded-full bg-secondary mt-1">
                          <div 
                            className="h-full bg-indigo-500 transition-all absolute top-0 left-0"
                            style={{ width: `${Math.round(designState.methodologyQuality.designAppropriateness * 100)}%` }}
                          />
                        </div>
                      </div>
                    )}
                    
                    {designState.methodologyQuality.controlArmSelection !== undefined && (
                      <div>
                        <div className="flex items-center">
                          <div className="flex items-center">
                            <span className="text-xs font-medium">Control Arm</span>
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Info className="h-3 w-3 ml-1 text-gray-400" />
                                </TooltipTrigger>
                                <TooltipContent className="w-64">
                                  <p className="text-xs font-semibold mb-1">Control Arm Selection: {Math.round(designState.methodologyQuality.controlArmSelection * 100)}%</p>
                                  <p className="text-xs">Assesses the appropriateness of the control arm selection (placebo, active control, standard of care).</p>
                                  {designState.methodologyQuality.alternativeControl && (
                                    <>
                                      <p className="text-xs font-semibold mt-2">Alternative: {designState.methodologyQuality.alternativeControl.type === 'active' ? 'Active Control' : 'Placebo Control'}</p>
                                      <p className="text-xs">{designState.methodologyQuality.alternativeControl.implications}</p>
                                    </>
                                  )}
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          </div>
                          <span className="ml-auto text-xs">{Math.round(designState.methodologyQuality.controlArmSelection * 100)}%</span>
                        </div>
                        <div className="relative h-2 w-full overflow-hidden rounded-full bg-secondary mt-1">
                          <div 
                            className="h-full bg-teal-500 transition-all absolute top-0 left-0"
                            style={{ width: `${Math.round(designState.methodologyQuality.controlArmSelection * 100)}%` }}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Real-World Impact Section */}
              {designState.realWorldImpact && (
                <div className="mb-3">
                  <h4 className="text-xs uppercase text-gray-500 font-medium mb-1">Real-World Impact</h4>
                  <div className="grid grid-cols-3 gap-2 mb-2">
                    {designState.realWorldImpact.labelingChange !== undefined && (
                      <div>
                        <div className="flex items-center">
                          <div className="flex items-center">
                            <span className="text-xs font-medium">Label</span>
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Info className="h-3 w-3 ml-1 text-gray-400" />
                                </TooltipTrigger>
                                <TooltipContent className="w-64">
                                  <p className="text-xs font-semibold mb-1">Labeling Change: {Math.round(designState.realWorldImpact.labelingChange * 100)}%</p>
                                  <p className="text-xs">Potential to influence product labeling changes with regulatory authorities.</p>
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          </div>
                          <span className="ml-auto text-xs">{Math.round(designState.realWorldImpact.labelingChange * 100)}%</span>
                        </div>
                        <div className="relative h-2 w-full overflow-hidden rounded-full bg-secondary mt-1">
                          <div 
                            className="h-full bg-blue-500 transition-all absolute top-0 left-0"
                            style={{ width: `${Math.round(designState.realWorldImpact.labelingChange * 100)}%` }}
                          />
                        </div>
                      </div>
                    )}
                    
                    {designState.realWorldImpact.guidelinesInclusion !== undefined && (
                      <div>
                        <div className="flex items-center">
                          <div className="flex items-center">
                            <span className="text-xs font-medium">Guidelines</span>
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Info className="h-3 w-3 ml-1 text-gray-400" />
                                </TooltipTrigger>
                                <TooltipContent className="w-64">
                                  <p className="text-xs font-semibold mb-1">Guidelines Inclusion: {Math.round(designState.realWorldImpact.guidelinesInclusion * 100)}%</p>
                                  <p className="text-xs">Likelihood that study results will be incorporated into clinical practice guidelines.</p>
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          </div>
                          <span className="ml-auto text-xs">{Math.round(designState.realWorldImpact.guidelinesInclusion * 100)}%</span>
                        </div>
                        <div className="relative h-2 w-full overflow-hidden rounded-full bg-secondary mt-1">
                          <div 
                            className="h-full bg-purple-500 transition-all absolute top-0 left-0"
                            style={{ width: `${Math.round(designState.realWorldImpact.guidelinesInclusion * 100)}%` }}
                          />
                        </div>
                      </div>
                    )}
                    
                    {designState.realWorldImpact.clinicalPracticeChange !== undefined && (
                      <div>
                        <div className="flex items-center">
                          <div className="flex items-center">
                            <span className="text-xs font-medium">Practice</span>
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Info className="h-3 w-3 ml-1 text-gray-400" />
                                </TooltipTrigger>
                                <TooltipContent className="w-64">
                                  <p className="text-xs font-semibold mb-1">Clinical Practice Change: {Math.round(designState.realWorldImpact.clinicalPracticeChange * 100)}%</p>
                                  <p className="text-xs">Potential to change standard clinical practice in the relevant therapeutic area.</p>
                                  {designState.realWorldImpact.marketAccess && (
                                    <p className="text-xs mt-1">{designState.realWorldImpact.marketAccess}</p>
                                  )}
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          </div>
                          <span className="ml-auto text-xs">{Math.round(designState.realWorldImpact.clinicalPracticeChange * 100)}%</span>
                        </div>
                        <div className="relative h-2 w-full overflow-hidden rounded-full bg-secondary mt-1">
                          <div 
                            className="h-full bg-emerald-500 transition-all absolute top-0 left-0"
                            style={{ width: `${Math.round(designState.realWorldImpact.clinicalPracticeChange * 100)}%` }}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
              
              <p className="text-xs text-gray-500 mt-3">
                View detailed metrics with explanations in all assessment tabs.
              </p>
            </div>
          </div>
        )}
      </CardContent>
      {hasQualityAnalysis && (
        <CardFooter>
          <Button 
            variant="outline" 
            className="w-full" 
            onClick={analyzeQuality} 
            disabled={analyzing}
          >
            {analyzing ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Analyzing...
              </>
            ) : (
              <>
                <RefreshCw className="h-4 w-4 mr-2" />
                Re-run Evaluation
              </>
            )}
          </Button>
        </CardFooter>
      )}
    </Card>
  );
}