import React, { useState, useEffect, useRef } from 'react';
import { DesignState } from '@shared/schema';
import { 
  Card, 
  CardContent, 
  CardDescription, 
  CardFooter, 
  CardHeader, 
  CardTitle 
} from '@/components/ui/card';
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Plus, Check, AlertTriangle, Lightbulb, Beaker, Microscope, Users, RefreshCw, BarChart3, Info } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { apiRequest } from '@/lib/queryClient';
import { DesignQualityAnalyzer } from './design-quality-analyzer';
import { AlternativeDesignCard } from './alternative-design-card';
import { FeasibilityMetricsMAIC } from './feasibility-metrics-maic';

// Note: The Overview tab and RegenerateOverview functionality has been removed 
// as it was not updating correctly across different study types

interface DesignStateNavigatorProps {
  protocolId: string;
  activeDesignState?: DesignState;
  onDesignStateChange: (designState: DesignState) => void;
}

export function DesignStateNavigator({ 
  protocolId, 
  activeDesignState, 
  onDesignStateChange 
}: DesignStateNavigatorProps) {
  const [designStates, setDesignStates] = useState<DesignState[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedStateId, setSelectedStateId] = useState<string | null>(null);
  // Set initial tab to 'scientific'
  const [selectedTab, setSelectedTab] = useState<string>('scientific');
  const [alternatives, setAlternatives] = useState<DesignState[]>([]);
  const [generatingAlternatives, setGeneratingAlternatives] = useState(false);

  // Fetch design states
  useEffect(() => {
    async function fetchDesignStates() {
      setLoading(true);
      try {
        const response = await fetch(`/api/protocols/${protocolId}/design-states`);
        
        if (!response.ok) {
          throw new Error('Failed to fetch design states');
        }
        
        const data = await response.json();
        setDesignStates(data);
        
        // If we have an active design state, select it
        if (activeDesignState) {
          setSelectedStateId(activeDesignState.id);
          
          // Set the tab based on protocol type
          if (activeDesignState.protocolType === 'delphi_consensus') {
            // For Delphi protocols, show Scientific Value tab by default instead of Overview
            // This prevents showing the Overview tab immediately which may have incomplete data
            setSelectedTab('scientific');
          } else {
            setSelectedTab('overview');
          }
        } else if (data.length > 0) {
          // Otherwise select the first one
          setSelectedStateId(data[0].id);
          
          // Set the tab based on protocol type
          if (data[0].protocolType === 'delphi_consensus') {
            setSelectedTab('scientific');
          } else {
            setSelectedTab('overview');
          }
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'An unknown error occurred');
      } finally {
        setLoading(false);
      }
    }
    
    fetchDesignStates();
    // Only depend on protocolId, not activeDesignState which causes a loop
  }, [protocolId]);

  // Use a ref to keep track of the last selected state ID
  const lastSelectedIdRef = useRef<string | null>(null);
  
  // When selectedStateId changes, notify parent component only once
  useEffect(() => {
    if (selectedStateId && designStates.length > 0 && selectedStateId !== lastSelectedIdRef.current) {
      const selectedState = designStates.find(state => state.id === selectedStateId);
      if (selectedState) {
        // Update ref to prevent excessive calls
        lastSelectedIdRef.current = selectedStateId;
        onDesignStateChange(selectedState);
      }
    }
  }, [selectedStateId, designStates]);

  // Handle design state selection
  const handleStateChange = (value: string) => {
    setSelectedStateId(value);
  };

  // Set the selected design state as active
  const makeActive = async () => {
    if (!selectedStateId) return;
    
    try {
      const response = await apiRequest('POST', `/api/protocols/${protocolId}/active-design-state/${selectedStateId}`);
      
      if (!response.ok) {
        throw new Error('Failed to set active design state');
      }
      
      // Find the selected design state and update the UI
      const selectedState = designStates.find(state => state.id === selectedStateId);
      if (selectedState) {
        onDesignStateChange(selectedState);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unknown error occurred');
    }
  };

  // Create a new design state based on the current one
  const createVariant = async () => {
    if (!selectedStateId) return;
    
    const selectedState = designStates.find(state => state.id === selectedStateId);
    if (!selectedState) return;
    
    try {
      // Create a new design state as a variant of the selected one
      const newState = {
        ...selectedState,
        id: `design-state-${Date.now()}`,
        label: `Variant of ${selectedState?.label || "Base Design"}`,
        timestamp: new Date(),
        protocolType: selectedState?.protocolType || 'interventional_clinical_trial'
      };
      
      const response = await apiRequest('POST', `/api/protocols/${protocolId}/design-states`, newState);
      
      if (!response.ok) {
        throw new Error('Failed to create design state variant');
      }
      
      const createdState = await response.json();
      
      // Update the design states list
      setDesignStates([...designStates, createdState]);
      
      // Select the new state
      setSelectedStateId(createdState.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unknown error occurred');
    }
  };

  // Generate alternative design states
  const generateAlternatives = async () => {
    if (!selectedStateId) return;
    
    setGeneratingAlternatives(true);
    
    try {
      const response = await apiRequest(
        'POST', 
        `/api/protocols/${protocolId}/design-states/${selectedStateId}/alternatives`,
        { count: 3 }
      );
      
      if (!response.ok) {
        throw new Error('Failed to generate alternative designs');
      }
      
      const alternativeDesigns = await response.json();
      setAlternatives(alternativeDesigns);
      setSelectedTab('alternatives');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unknown error occurred');
    } finally {
      setGeneratingAlternatives(false);
    }
  };

  // Apply an alternative design
  const applyAlternative = async (alternative: DesignState) => {
    try {
      // Find the original design state
      const originalState = designStates.find(state => state.id === selectedStateId) || designStates[0];
      
      let updatedSynopsis = alternative.synopsis || originalState?.synopsis || '';
      
      // Update synopsis text to reflect key design changes if original state has a synopsis
      if (originalState?.synopsis && originalState?.studyParameters) {
        try {
          // Identify key changes between original and new parameters
          const changes = [];
          
          // Check for comparator changes
          if (originalState.studyParameters?.comparator?.type !== alternative.studyParameters?.comparator?.type) {
            changes.push({
              parameter: 'comparator',
              from: `${originalState.studyParameters?.comparator?.type || 'none'} (${originalState.studyParameters?.comparator?.name || ''})`,
              to: `${alternative.studyParameters?.comparator?.type || 'none'} (${alternative.studyParameters?.comparator?.name || ''})`
            });
          }
          
          // Check for study duration changes
          if (originalState.studyParameters?.timing?.studyDuration !== alternative.studyParameters?.timing?.studyDuration) {
            changes.push({
              parameter: 'duration',
              from: originalState.studyParameters?.timing?.studyDuration || '',
              to: alternative.studyParameters?.timing?.studyDuration || ''
            });
          }
          
          // Check for endpoint changes
          const originalPrimaryEndpoint = originalState.studyParameters?.outcomes?.primary?.[0]?.name;
          const newPrimaryEndpoint = alternative.studyParameters?.outcomes?.primary?.[0]?.name;
          if (originalPrimaryEndpoint !== newPrimaryEndpoint) {
            changes.push({
              parameter: 'primary endpoint',
              from: originalPrimaryEndpoint || '',
              to: newPrimaryEndpoint || ''
            });
          }
          
          // Check for study design changes
          if (originalState.studyParameters?.design?.type !== alternative.studyParameters?.design?.type ||
              originalState.studyParameters?.design?.blinding !== alternative.studyParameters?.design?.blinding) {
            changes.push({
              parameter: 'study design',
              from: `${originalState.studyParameters?.design?.type || ''} ${originalState.studyParameters?.design?.blinding || ''}`,
              to: `${alternative.studyParameters?.design?.type || ''} ${alternative.studyParameters?.design?.blinding || ''}`
            });
          }
          
          // If significant changes exist, update the synopsis
          if (changes.length > 0) {
            const synopsisResponse = await apiRequest('POST', '/api/update-synopsis', {
              originalSynopsis: originalState.synopsis,
              changes,
              newParams: alternative.studyParameters
            });
            
            if (synopsisResponse.ok) {
              const result = await synopsisResponse.json();
              updatedSynopsis = result.updatedSynopsis;
            }
          }
        } catch (error) {
          console.error('Error updating synopsis:', error);
          // If there's an error, we'll just use the original synopsis
        }
      }
      
      // Explicitly log what protocol type is being used for the new design state
      const protocolTypeToUse = alternative.protocolType || originalState.protocolType || 'interventional_clinical_trial';
      console.log('Creating new design state with protocol type:', protocolTypeToUse);
      
      // Create a new design state based on the alternative with the updated synopsis
      const response = await apiRequest(
        'POST', 
        `/api/protocols/${protocolId}/design-states`, 
        {
          ...alternative,
          id: `design-state-${Date.now()}`,
          timestamp: new Date(),
          synopsis: updatedSynopsis,
          protocolType: protocolTypeToUse,
          needsRegeneration: true // Flag indicating components need regeneration
        }
      );
      
      if (!response.ok) {
        throw new Error('Failed to apply alternative design');
      }
      
      const createdState = await response.json();
      
      // Update the design states list
      setDesignStates([...designStates, createdState]);
      
      // Select the new state
      setSelectedStateId(createdState.id);
      
      // Make it the active design state
      await apiRequest('POST', `/api/protocols/${protocolId}/active-design-state/${createdState.id}`);
      onDesignStateChange(createdState);
      
      // Show regeneration notification
      alert("The design has been updated. Please regenerate the Schedule of Activities, Criteria, and other components to reflect these changes.");
      
      setSelectedTab('overview');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unknown error occurred');
    }
  };

  // Show a loading state
  if (loading) {
    return (
      <Card className="w-full">
        <CardHeader>
          <CardTitle>Design State</CardTitle>
          <CardDescription>Loading design states...</CardDescription>
        </CardHeader>
        <CardContent>
          <Progress value={undefined} className="w-full" />
        </CardContent>
      </Card>
    );
  }

  // Show an error state
  if (error) {
    return (
      <Alert variant="destructive">
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>Error</AlertTitle>
        <AlertDescription>
          Failed to load design states: {error}
        </AlertDescription>
      </Alert>
    );
  }

  // If no design states exist yet
  if (designStates.length === 0) {
    return (
      <Card className="w-full">
        <CardHeader>
          <CardTitle>Design State</CardTitle>
          <CardDescription>No design states found</CardDescription>
        </CardHeader>
        <CardContent>
          <Alert>
            <Lightbulb className="h-4 w-4" />
            <AlertTitle>No Design States</AlertTitle>
            <AlertDescription>
              No design states have been created for this protocol yet.
              Start by analyzing the synopsis to create the initial design state.
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }

  // Get the selected design state
  const selectedState = designStates.find(state => state.id === selectedStateId) || designStates[0];
  const isActive = activeDesignState && selectedState?.id === activeDesignState.id;

  return (
    <Card className="w-full">
      <CardHeader className="pb-3">
        <div className="flex justify-between items-center">
          <div>
            <CardTitle>Protocol Design Lab</CardTitle>
            <CardDescription>
              Explore and refine your study design to optimize clinical value and scientific impact
            </CardDescription>
          </div>
          {selectedState && isActive && (
            <Badge variant="outline" className="ml-2 bg-green-50 border-green-200 text-green-800">
              <Check className="h-3 w-3 mr-1" /> Active Design
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <div className="bg-blue-50 border border-blue-200 text-blue-800 p-3 rounded-md mb-4 flex items-center">
          <Info className="h-5 w-5 mr-2 text-blue-500" />
          <p className="text-sm">Hover over the blue info icons <Info className="h-4 w-4 inline-block text-blue-500 animate-pulse" /> next to metrics to see detailed AI analysis and explanations.</p>
        </div>
        
        <div className="flex mb-4 gap-2 items-center">
          <Select value={selectedStateId || ''} onValueChange={handleStateChange}>
            <SelectTrigger className="w-[250px]">
              <SelectValue placeholder="Select a design state" />
            </SelectTrigger>
            <SelectContent>
              {designStates.map((state) => (
                <SelectItem key={state.id} value={state.id}>
                  {state.label}
                  {activeDesignState && state.id === activeDesignState.id && " (Active)"}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          
          <div className="space-x-2">
            {!isActive && (
              <Button variant="outline" onClick={makeActive}>
                <Check className="h-4 w-4 mr-2" />
                Make Active
              </Button>
            )}
            <Button variant="outline" onClick={createVariant}>
              <Plus className="h-4 w-4 mr-2" />
              Create Variant
            </Button>
            <Button variant="outline" onClick={generateAlternatives} disabled={generatingAlternatives}>
              {generatingAlternatives ? (
                <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Beaker className="h-4 w-4 mr-2" />
              )}
              Generate Alternatives
            </Button>
          </div>
        </div>
        
        <Tabs value={selectedTab} onValueChange={setSelectedTab}>
          <TabsList className="mb-4">
            <TabsTrigger value="scientific">Scientific Value</TabsTrigger>
            <TabsTrigger value="clinical">Clinical Relevance</TabsTrigger>
            <TabsTrigger value="feasibility">Feasibility</TabsTrigger>
            <TabsTrigger value="alternatives">
              Alternatives
              {alternatives.length > 0 && (
                <Badge variant="secondary" className="ml-2">
                  {alternatives.length}
                </Badge>
              )}
            </TabsTrigger>
          </TabsList>
          
          {/* Overview tab section has been removed completely */}
          <TabsContent value="scientific">
            {!selectedState.scientificValue || 
             !selectedState.scientificValue.innovationScore ? (
              <div className="mb-6">
                <DesignQualityAnalyzer
                  protocolId={protocolId}
                  designState={selectedState}
                  onAnalysisComplete={(updatedState) => {
                    // Update the design states list
                    const updatedStates = designStates.map(state => 
                      state.id === updatedState.id ? updatedState : state
                    );
                    setDesignStates(updatedStates);
                    // Also update the active design state if it was modified
                    if (activeDesignState?.id === updatedState.id) {
                      onDesignStateChange(updatedState);
                    }
                  }}
                />
              </div>
            ) : null}
            
            {selectedState && selectedState.scientificValue && selectedState.scientificValue.innovationScore !== undefined ? (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <Card>
                    <CardHeader className="pb-2">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-base">Innovation Score</CardTitle>
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <div>
                                <Info className="h-5 w-5 ml-1 text-blue-500 animate-pulse cursor-help" />
                              </div>
                            </TooltipTrigger>
                            <TooltipContent className="w-80">
                              <p className="text-sm font-semibold mb-1">Innovation Score: {Math.round(selectedState.scientificValue.innovationScore * 100)}%</p>
                              <p className="text-sm mb-1">{selectedState.scientificValue.innovationRationale || 
                                (() => {
                                  // Protocol-specific tooltip text
                                  if (selectedState?.protocolType === 'delphi_consensus') {
                                    return "Evaluates novelty in consensus methodology. A great design (80-100%) introduces breakthrough approaches in panel composition, deliberation methods, or consensus determination. A moderate design (60-79%) modifies standard approaches with some innovative elements. A weaker design (<60%) follows conventional consensus methods with minimal innovation.";
                                  } else if (selectedState?.protocolType === 'secondary_data_analysis' || selectedState?.protocolType === 'retrospective_cohort_study') {
                                    return "Evaluates novelty in data analysis methodology. A great design (80-100%) employs cutting-edge analytical techniques, novel variable operationalization, or innovative database linking methods. A moderate design (60-79%) adapts established methods with some creative modifications. A weaker design (<60%) relies entirely on conventional analytical approaches with little methodological advancement.";
                                  } else if (selectedState?.protocolType === 'cross_sectional_survey') {
                                    return "Evaluates innovation in survey methodology. A great design (80-100%) introduces novel sampling strategies, questionnaire design approaches, or response collection methods. A moderate design (60-79%) incorporates some innovation within a conventional framework. A weaker design (<60%) follows standard survey methodologies with minimal technical advancement.";
                                  } else if (selectedState?.protocolType === 'prospective_cohort_study') {
                                    return "Evaluates novelty in cohort study methodology. A great design (80-100%) implements innovative exposure/outcome assessment, pioneering follow-up methods, or novel participant engagement strategies. A moderate design (60-79%) enhances conventional approaches with some innovative elements. A weaker design (<60%) adheres strictly to established cohort study methods.";
                                  } else if (selectedState?.protocolType === 'maic') {
                                    return "Evaluates innovation in matching-adjusted indirect comparison methodology. A great design (80-100%) features novel matching variables, advanced statistical techniques, or innovative approaches to address heterogeneity. A moderate design (60-79%) enhances standard MAIC methodology with some improvements. A weaker design (<60%) applies basic MAIC methodology without methodological advancement.";
                                  } else {
                                    return "Evaluates novelty compared to current research standards. A great design (80-100%) introduces groundbreaking methodology, technology applications, or conceptual frameworks. A moderate design (60-79%) makes incremental improvements to established approaches. A weaker design (<60%) follows conventional methods with minimal innovation.";
                                  }
                                })()
                              }</p>
                              {selectedState.scientificValue.innovationScore >= 0.8 ? (
                                <p className="text-sm text-green-600 font-medium pt-1 border-t border-gray-200">
                                  <strong>AI Analysis:</strong> This design introduces notably innovative elements or approaches that differentiate it from standard {
                                    selectedState?.protocolType === 'delphi_consensus' ? "consensus studies" :
                                    selectedState?.protocolType === 'secondary_data_analysis' ? "database studies" :
                                    selectedState?.protocolType === 'retrospective_cohort_study' ? "retrospective analyses" :
                                    selectedState?.protocolType === 'cross_sectional_survey' ? "survey research" :
                                    selectedState?.protocolType === 'prospective_cohort_study' ? "cohort studies" :
                                    "clinical trials"
                                  } in this therapeutic area.
                                </p>
                              ) : selectedState.scientificValue.innovationScore >= 0.6 ? (
                                <p className="text-sm text-amber-600 font-medium pt-1 border-t border-gray-200">
                                  <strong>AI Analysis:</strong> This design incorporates some innovative elements while following established methodological frameworks, representing a balanced approach to {
                                    selectedState?.protocolType === 'delphi_consensus' ? "consensus development" :
                                    selectedState?.protocolType === 'secondary_data_analysis' ? "secondary data analysis" :
                                    selectedState?.protocolType === 'retrospective_cohort_study' ? "retrospective research" :
                                    selectedState?.protocolType === 'cross_sectional_survey' ? "survey methodology" :
                                    selectedState?.protocolType === 'prospective_cohort_study' ? "observational research" :
                                    "interventional research"
                                  }.
                                </p>
                              ) : (
                                <p className="text-sm text-orange-600 font-medium pt-1 border-t border-gray-200">
                                  <strong>AI Analysis:</strong> This design primarily follows conventional approaches for {
                                    selectedState?.protocolType === 'delphi_consensus' ? "consensus studies" :
                                    selectedState?.protocolType === 'secondary_data_analysis' ? "database research" :
                                    selectedState?.protocolType === 'retrospective_cohort_study' ? "retrospective analysis" :
                                    selectedState?.protocolType === 'cross_sectional_survey' ? "survey research" :
                                    selectedState?.protocolType === 'prospective_cohort_study' ? "observational studies" :
                                    "clinical trials"
                                  } with limited novel elements. Consider exploring more innovative methodologies.
                                </p>
                              )}
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="flex items-center justify-between">
                        <Progress 
                          value={selectedState.scientificValue.innovationScore ? selectedState.scientificValue.innovationScore * 100 : 0} 
                          className="w-4/5" 
                        />
                        <span className="font-bold text-lg">
                          {selectedState.scientificValue.innovationScore ? 
                            Math.round(selectedState.scientificValue.innovationScore * 10) / 10 : 
                            "N/A"}
                        </span>
                      </div>
                    </CardContent>
                  </Card>
                  
                  <Card>
                    <CardHeader className="pb-2">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-base">Knowledge Gap Relevance</CardTitle>
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <div>
                                <Info className="h-5 w-5 ml-1 text-blue-500 animate-pulse cursor-help" />
                              </div>
                            </TooltipTrigger>
                            <TooltipContent className="w-80">
                              <p className="text-sm font-semibold mb-1">Knowledge Gap Relevance: {Math.round((selectedState.scientificValue?.knowledgeGapRelevance || 0) * 100)}%</p>
                              <p className="text-sm mb-1">{selectedState.scientificValue?.knowledgeGapRationale || 
                                (() => {
                                  // Protocol-specific tooltip text
                                  if (selectedState?.protocolType === 'delphi_consensus') {
                                    return "Evaluates how directly the consensus study targets critical areas of clinical disagreement or uncertainty. A great design (80-100%) tackles questions where clinical practice varies significantly due to lack of guidelines. A moderate design (60-79%) addresses areas with some variation but less urgency. A weaker design (<60%) focuses on topics where substantial consensus already exists.";
                                  } else if (selectedState?.protocolType === 'secondary_data_analysis' || selectedState?.protocolType === 'retrospective_cohort_study') {
                                    return "Evaluates how the analysis addresses unexplored questions in existing datasets. A great design (80-100%) examines relationships that could fundamentally change clinical understanding. A moderate design (60-79%) explores somewhat novel associations with incremental value. A weaker design (<60%) largely replicates well-established findings with minimal new insights.";
                                  } else if (selectedState?.protocolType === 'cross_sectional_survey') {
                                    return "Evaluates how the survey fills critical information gaps. A great design (80-100%) collects data on completely undocumented but clinically important phenomena. A moderate design (60-79%) gathers somewhat novel information with potential utility. A weaker design (<60%) collects data on well-characterized topics with minimal novelty.";
                                  } else if (selectedState?.protocolType === 'prospective_cohort_study') {
                                    return "Evaluates how the cohort study addresses longitudinal knowledge gaps. A great design (80-100%) tracks critical exposures/outcomes with no existing quality longitudinal data. A moderate design (60-79%) follows somewhat understudied patterns of moderate importance. A weaker design (<60%) duplicates existing longitudinal research with minimal novelty.";
                                  } else if (selectedState?.protocolType === 'maic') {
                                    return "Evaluates how the MAIC analysis addresses comparison gaps between treatments. A great design (80-100%) enables critical treatment comparisons with no existing head-to-head data. A moderate design (60-79%) provides somewhat useful indirect comparisons. A weaker design (<60%) compares treatments where sufficient direct comparison data already exists.";
                                  } else {
                                    return "Evaluates how the study addresses knowledge gaps in current research. A great design (80-100%) directly tackles major unanswered questions that could change practice. A moderate design (60-79%) contributes incrementally to partially understood areas. A weaker design (<60%) explores well-characterized topics with limited new insights.";
                                  }
                                })()
                              }</p>
                              {(selectedState.scientificValue?.knowledgeGapRelevance || 0) >= 0.8 ? (
                                <p className="text-sm text-green-600 font-medium pt-1 border-t border-gray-200">
                                  <strong>AI Analysis:</strong> This design directly addresses a significant knowledge gap in {
                                    selectedState?.protocolType === 'delphi_consensus' ? "clinical practice where consensus is lacking" :
                                    selectedState?.protocolType === 'secondary_data_analysis' ? "the analysis of existing datasets" :
                                    selectedState?.protocolType === 'retrospective_cohort_study' ? "retrospective outcome analysis" :
                                    selectedState?.protocolType === 'cross_sectional_survey' ? "current survey-based research" :
                                    selectedState?.protocolType === 'prospective_cohort_study' ? "longitudinal observations" :
                                    "the current understanding of the condition or treatment approach"
                                  }.
                                </p>
                              ) : (selectedState.scientificValue?.knowledgeGapRelevance || 0) >= 0.6 ? (
                                <p className="text-sm text-amber-600 font-medium pt-1 border-t border-gray-200">
                                  <strong>AI Analysis:</strong> This design addresses relevant but not critical knowledge gaps in {
                                    selectedState?.protocolType === 'delphi_consensus' ? "areas requiring clinical consensus" :
                                    selectedState?.protocolType === 'secondary_data_analysis' ? "secondary data exploration" :
                                    selectedState?.protocolType === 'retrospective_cohort_study' ? "retrospective research" :
                                    selectedState?.protocolType === 'cross_sectional_survey' ? "survey methodology" :
                                    selectedState?.protocolType === 'prospective_cohort_study' ? "observational research" :
                                    "the current research landscape"
                                  }.
                                </p>
                              ) : (
                                <p className="text-sm text-orange-600 font-medium pt-1 border-t border-gray-200">
                                  <strong>AI Analysis:</strong> This design examines topics that are already well-studied or only peripherally advances understanding of key unknowns in {
                                    selectedState?.protocolType === 'delphi_consensus' ? "consensus-based practice" :
                                    selectedState?.protocolType === 'secondary_data_analysis' ? "database analytics" :
                                    selectedState?.protocolType === 'retrospective_cohort_study' ? "retrospective analysis" :
                                    selectedState?.protocolType === 'cross_sectional_survey' ? "survey research" :
                                    selectedState?.protocolType === 'prospective_cohort_study' ? "observational studies" :
                                    "the field"
                                  }.
                                </p>
                              )}
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="flex items-center justify-between">
                        <Progress 
                          value={(selectedState.scientificValue?.knowledgeGapRelevance || 0) * 100} 
                          className="w-4/5" 
                        />
                        <span className="font-bold text-lg">
                          {selectedState.scientificValue?.knowledgeGapRelevance ?
                            Math.round(selectedState.scientificValue?.knowledgeGapRelevance * 10) / 10 :
                            "N/A"}
                        </span>
                      </div>
                    </CardContent>
                  </Card>
                  
                  <Card>
                    <CardHeader className="pb-2">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-base">Potential Impact</CardTitle>
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <div>
                                <Info className="h-5 w-5 ml-1 text-blue-500 animate-pulse cursor-help" />
                              </div>
                            </TooltipTrigger>
                            <TooltipContent className="w-80">
                              <p className="text-sm font-semibold mb-1">Potential Impact: {Math.round((selectedState.scientificValue?.potentialImpact || 0) * 100)}%</p>
                              <p className="text-sm mb-1">{selectedState.scientificValue?.potentialImpactRationale || 
                                (() => {
                                  // Protocol-specific tooltip text
                                  if (selectedState?.protocolType === 'delphi_consensus') {
                                    return "Assesses how likely the consensus outcomes are to influence clinical guidelines, standardize practice, or resolve contentious areas of clinical decision-making. Higher scores indicate greater potential for practice harmonization.";
                                  } else if (selectedState?.protocolType === 'secondary_data_analysis' || selectedState?.protocolType === 'retrospective_cohort_study') {
                                    return "Assesses how likely the analytical findings are to influence understanding of real-world outcomes, identify previously unrecognized patterns, or guide future research. Higher scores indicate greater informative potential.";
                                  } else if (selectedState?.protocolType === 'cross_sectional_survey') {
                                    return "Assesses how likely the survey findings are to influence policy, practice guidelines, or understanding of important stakeholder perspectives. Higher scores indicate greater potential to inform decision-making.";
                                  } else if (selectedState?.protocolType === 'prospective_cohort_study') {
                                    return "Assesses how likely the longitudinal findings are to establish causality, influence understanding of disease progression, or identify modifiable risk factors. Higher scores indicate greater potential clinical relevance.";
                                  } else {
                                    return "Assesses the potential influence on clinical practice, future research, or patient outcomes. Higher scores suggest greater potential to change practice or address important research gaps.";
                                  }
                                })()
                              }</p>
                              {(selectedState.scientificValue?.potentialImpact || 0) >= 0.9 ? (
                                <p className="text-sm text-green-600 font-medium pt-1 border-t border-gray-200">
                                  <strong>AI Analysis:</strong> This design has exceptional potential to {
                                    selectedState?.protocolType === 'delphi_consensus' ? "establish authoritative practice standards and resolve important clinical controversies" :
                                    selectedState?.protocolType === 'secondary_data_analysis' ? "reveal critical insights from existing data that impact treatment decisions" :
                                    selectedState?.protocolType === 'retrospective_cohort_study' ? "identify major outcome patterns that change treatment selection" :
                                    selectedState?.protocolType === 'cross_sectional_survey' ? "capture vital stakeholder perspectives that influence care delivery" :
                                    selectedState?.protocolType === 'prospective_cohort_study' ? "establish causal relationships with major implications for prevention or treatment" :
                                    "significantly influence clinical practice guidelines and directly impact treatment decisions"
                                  } for a large patient population.
                                </p>
                              ) : (selectedState.scientificValue?.potentialImpact || 0) >= 0.7 ? (
                                <p className="text-sm text-green-600 font-medium pt-1 border-t border-gray-200">
                                  <strong>AI Analysis:</strong> This design has substantial potential to {
                                    selectedState?.protocolType === 'delphi_consensus' ? "improve practice consistency and standardize approach in important clinical areas" :
                                    selectedState?.protocolType === 'secondary_data_analysis' ? "provide meaningful insights from existing data to inform clinical decisions" :
                                    selectedState?.protocolType === 'retrospective_cohort_study' ? "identify important associations that influence patient management" :
                                    selectedState?.protocolType === 'cross_sectional_survey' ? "capture important perspectives that help optimize care delivery" :
                                    selectedState?.protocolType === 'prospective_cohort_study' ? "identify important risk factors or predictors of outcomes" :
                                    "influence how patients are treated"
                                  } and could lead to meaningful changes in clinical practice if results are positive.
                                </p>
                              ) : (
                                <p className="text-sm text-amber-600 font-medium pt-1 border-t border-gray-200">
                                  <strong>AI Analysis:</strong> This design may have moderate impact on {
                                    selectedState?.protocolType === 'delphi_consensus' ? "clinical consensus formation" :
                                    selectedState?.protocolType === 'secondary_data_analysis' ? "data interpretation" :
                                    selectedState?.protocolType === 'retrospective_cohort_study' ? "understanding of retrospective outcomes" :
                                    selectedState?.protocolType === 'cross_sectional_survey' ? "stakeholder perspectives" :
                                    selectedState?.protocolType === 'prospective_cohort_study' ? "observational insights" :
                                    "clinical practice"
                                  } or contribute incrementally to the evidence base, but is unlikely to fundamentally change treatment approaches.
                                </p>
                              )}
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="flex items-center justify-between">
                        <Progress 
                          value={(selectedState.scientificValue?.potentialImpact || 0) * 100} 
                          className="w-4/5" 
                        />
                        <span className="font-bold text-lg">
                          {selectedState.scientificValue?.potentialImpact ?
                            Math.round(selectedState.scientificValue?.potentialImpact * 10) / 10 :
                            "N/A"}
                        </span>
                      </div>
                    </CardContent>
                  </Card>
                  
                  <Card>
                    <CardHeader className="pb-2">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-base">Evidence Quality</CardTitle>
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <div>
                                <Info className="h-5 w-5 ml-1 text-blue-500 animate-pulse cursor-help" />
                              </div>
                            </TooltipTrigger>
                            <TooltipContent className="w-80">
                              <p className="text-sm font-semibold mb-1">Evidence Quality: {Math.round((selectedState.scientificValue?.evidenceQuality || 0) * 100)}%</p>
                              <p className="text-sm mb-1">{selectedState.scientificValue?.evidenceQualityRationale || 
                                (() => {
                                  // Protocol-specific tooltip text
                                  if (selectedState?.protocolType === 'delphi_consensus') {
                                    return "Evaluates the anticipated reliability and credibility of the consensus process. A great design (80-100%) has detailed expert selection criteria, structured iteration processes, and well-defined consensus thresholds. A moderate design (60-79%) has adequate but not exceptional panel diversity and facilitation methods. A weaker design (<60%) lacks rigor in panel composition, feedback mechanisms, or consensus determination methods.";
                                  } else if (selectedState?.protocolType === 'secondary_data_analysis' || selectedState?.protocolType === 'retrospective_cohort_study') {
                                    return "Evaluates the validity and reliability of retrospective data analysis. A great design (80-100%) employs high-quality data sources with comprehensive confounding control and appropriate statistical methods. A moderate design (60-79%) uses adequate data with partial confounding control. A weaker design (<60%) has significant limitations in data completeness, variable definitions, or analytical approaches.";
                                  } else if (selectedState?.protocolType === 'cross_sectional_survey') {
                                    return "Evaluates the quality and representativeness of survey data. A great design (80-100%) uses validated instruments, rigorous sampling methodology, and robust methods to maximize response rates and minimize bias. A moderate design (60-79%) has reasonable but imperfect sampling and validation. A weaker design (<60%) has significant limitations in instrument validation, sampling strategy, or response bias control.";
                                  } else if (selectedState?.protocolType === 'prospective_cohort_study') {
                                    return "Evaluates the anticipated quality of observational data. A great design (80-100%) has comprehensive baseline assessment, rigorous follow-up protocols, and methods to minimize attrition and measurement error. A moderate design (60-79%) has adequate but not exceptional approaches to follow-up and exposure/outcome assessment. A weaker design (<60%) has significant limitations in follow-up procedures, attrition management, or exposure/outcome measurement.";
                                  } else if (selectedState?.protocolType === 'maic') {
                                    return "Evaluates the reliability of the matching-adjusted comparison. A great design (80-100%) has comprehensive matching variables, appropriate statistical methods, and robust sensitivity analyses for unmeasured confounders. A moderate design (60-79%) has adequate matching variables but some limitations in adjustments or sensitivity analyses. A weaker design (<60%) has significant limitations in matching criteria, statistical approach, or bias assessment.";
                                  } else {
                                    return "Evaluates the strength and reliability of the evidence this design will produce. A great design (80-100%) will generate robust, reproducible findings with appropriate controls and statistical power. A moderate design (60-79%) will produce acceptable evidence with some methodological limitations. A weaker design (<60%) has significant limitations in study design, control strategies, or analytical approach that may compromise validity.";
                                  }
                                })()
                              }</p>
                              {(selectedState.scientificValue?.evidenceQuality || 0) >= 0.8 ? (
                                <p className="text-sm text-green-600 font-medium pt-1 border-t border-gray-200">
                                  <strong>AI Analysis:</strong> This design will likely produce high-quality evidence with {
                                    selectedState?.protocolType === 'delphi_consensus' ? "strong panel composition, structured deliberation, and clear consensus criteria" :
                                    selectedState?.protocolType === 'secondary_data_analysis' ? "appropriate data source selection, robust statistical methods, and proper accounting for confounders" : 
                                    selectedState?.protocolType === 'retrospective_cohort_study' ? "careful cohort definition, appropriate control groups, and robust outcome assessment" :
                                    selectedState?.protocolType === 'cross_sectional_survey' ? "validated survey instruments, representative sampling, and rigorous data collection methods" :
                                    selectedState?.protocolType === 'prospective_cohort_study' ? "careful exposure assessment, complete follow-up, and comprehensive outcome tracking" :
                                    "robust statistical power, rigorous methodology, and clear interpretability of results"
                                  }.
                                </p>
                              ) : (selectedState.scientificValue?.evidenceQuality || 0) >= 0.6 ? (
                                <p className="text-sm text-amber-600 font-medium pt-1 border-t border-gray-200">
                                  <strong>AI Analysis:</strong> This design incorporates sound methodological principles that will produce acceptable evidence, with some limitations in {
                                    selectedState?.protocolType === 'delphi_consensus' ? "panel diversity, iteration process, or consensus threshold definition" :
                                    selectedState?.protocolType === 'secondary_data_analysis' ? "data completeness, variable definitions, or confounding control" : 
                                    selectedState?.protocolType === 'retrospective_cohort_study' ? "retrospective data quality, group matching, or bias control" :
                                    selectedState?.protocolType === 'cross_sectional_survey' ? "sampling approach, questionnaire validation, or response rate optimization" :
                                    selectedState?.protocolType === 'prospective_cohort_study' ? "exposure measurement, follow-up protocols, or attrition management" :
                                    "either statistical approach or control for bias"
                                  }.
                                </p>
                              ) : (
                                <p className="text-sm text-orange-600 font-medium pt-1 border-t border-gray-200">
                                  <strong>AI Analysis:</strong> This design has methodological weaknesses that may compromise evidence quality. Consider addressing issues with {
                                    selectedState?.protocolType === 'delphi_consensus' ? "expert selection criteria, facilitation methods, or feedback mechanisms" :
                                    selectedState?.protocolType === 'secondary_data_analysis' ? "data source quality, variable operationalization, or analytical approach" :
                                    selectedState?.protocolType === 'retrospective_cohort_study' ? "group selection, confounding control, or outcome assessment" :
                                    selectedState?.protocolType === 'cross_sectional_survey' ? "sampling strategy, instrument validation, or response bias" :
                                    selectedState?.protocolType === 'prospective_cohort_study' ? "baseline assessment, follow-up procedures, or dropout prevention" :
                                    selectedState?.protocolType === 'interventional_clinical_trial' ? "sample size, blinding, or control strategies" :
                                    "methodological approach and analytical strategies"
                                  } to strengthen the validity of findings.
                                </p>
                              )}
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="flex items-center justify-between">
                        <Progress 
                          value={(selectedState.scientificValue?.evidenceQuality || 0) * 100} 
                          className="w-4/5" 
                        />
                        <span className="font-bold text-lg">
                          {selectedState.scientificValue?.evidenceQuality ?
                            Math.round(selectedState.scientificValue?.evidenceQuality * 10) / 10 :
                            "N/A"}
                        </span>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </div>
            ) : (
              <Alert>
                <Microscope className="h-4 w-4" />
                <AlertTitle>Scientific Value Analysis</AlertTitle>
                <AlertDescription>
                  No scientific value analysis is available for this design state.
                </AlertDescription>
              </Alert>
            )}
          </TabsContent>
          
          <TabsContent value="clinical">
            {!selectedState.clinicalRelevance || 
             !selectedState.clinicalRelevance.patientCenteredOutcomes ? (
              <div className="mb-6">
                <DesignQualityAnalyzer
                  protocolId={protocolId}
                  designState={selectedState}
                  onAnalysisComplete={(updatedState) => {
                    // Update the design states list
                    const updatedStates = designStates.map(state => 
                      state.id === updatedState.id ? updatedState : state
                    );
                    setDesignStates(updatedStates);
                    // Also update the active design state if it was modified
                    if (activeDesignState?.id === updatedState.id) {
                      onDesignStateChange(updatedState);
                    }
                  }}
                />
              </div>
            ) : null}
            
            {selectedState && selectedState.clinicalRelevance && selectedState.clinicalRelevance.patientCenteredOutcomes !== undefined ? (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <Card>
                    <CardHeader className="pb-2">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-base">Patient-Centered Outcomes</CardTitle>
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <div>
                                <Info className="h-5 w-5 ml-1 text-blue-500 animate-pulse cursor-help" />
                              </div>
                            </TooltipTrigger>
                            <TooltipContent className="w-80">
                              <p className="text-sm font-semibold mb-1">Patient-Centered Outcomes: {Math.round(selectedState.clinicalRelevance.patientCenteredOutcomes * 100)}%</p>
                              <p className="text-sm mb-1">{selectedState.clinicalRelevance.patientCenteredRationale || 
                                (() => {
                                  // Protocol-specific tooltip text
                                  if (selectedState?.protocolType === 'delphi_consensus') {
                                    return "Evaluates how well the consensus study addresses questions that matter to patients. Higher scores indicate designs that involve patient representatives or prioritize patient-relevant topics.";
                                  } else if (selectedState?.protocolType === 'secondary_data_analysis' || selectedState?.protocolType === 'retrospective_cohort_study') {
                                    return "Evaluates how well the analysis examines outcomes that are meaningful to patients. Higher scores indicate designs that look beyond surrogate endpoints to include quality of life and functional outcomes.";
                                  } else if (selectedState?.protocolType === 'cross_sectional_survey') {
                                    return "Evaluates how well the survey captures patient priorities and lived experiences. Higher scores indicate designs that directly assess quality of life, symptom burden, and other patient-centered measures.";
                                  } else if (selectedState?.protocolType === 'prospective_cohort_study') {
                                    return "Evaluates how well the cohort study measures outcomes that matter to patients. Higher scores indicate designs that incorporate patient-reported outcomes alongside clinical measures.";
                                  } else {
                                    return "Evaluates how well the study incorporates outcomes that matter to patients. Higher scores indicate designs that prioritize patient-relevant endpoints.";
                                  }
                                })()
                              }</p>
                              {selectedState.clinicalRelevance.patientCenteredOutcomes >= 0.8 ? (
                                <p className="text-sm text-green-600 font-medium pt-1 border-t border-gray-200">
                                  <strong>AI Analysis:</strong> This design {
                                    selectedState?.protocolType === 'delphi_consensus' ? "incorporates patient representatives in the expert panel and focuses on patient-relevant topics" :
                                    selectedState?.protocolType === 'secondary_data_analysis' ? "analyzes important patient-centered outcomes from existing data sets" :
                                    selectedState?.protocolType === 'retrospective_cohort_study' ? "examines patient-reported outcomes and quality of life measures in the retrospective data" :
                                    selectedState?.protocolType === 'cross_sectional_survey' ? "directly assesses patient priorities and experiences with validated instruments" :
                                    selectedState?.protocolType === 'prospective_cohort_study' ? "comprehensively tracks patient-reported outcomes alongside clinical measures" :
                                    "incorporates strong patient-centered outcomes such as quality of life measures, functional assessments, and patient-reported symptom burden"
                                  }. These specific endpoints directly reflect patient priorities beyond traditional clinical measures.
                                </p>
                              ) : selectedState.clinicalRelevance.patientCenteredOutcomes >= 0.6 ? (
                                <p className="text-sm text-amber-600 font-medium pt-1 border-t border-gray-200">
                                  <strong>AI Analysis:</strong> This design includes some patient-centered aspects, but could benefit from {
                                    selectedState?.protocolType === 'delphi_consensus' ? "greater patient representation in the consensus process" :
                                    selectedState?.protocolType === 'secondary_data_analysis' ? "additional focus on patient-relevant variables in the dataset" :
                                    selectedState?.protocolType === 'retrospective_cohort_study' ? "more comprehensive patient outcome measures in the analysis" :
                                    selectedState?.protocolType === 'cross_sectional_survey' ? "more comprehensive quality of life and symptom assessment tools" :
                                    selectedState?.protocolType === 'prospective_cohort_study' ? "additional validated patient-reported outcome measures" :
                                    "additional measures of symptom burden and functional status"
                                  }. Consider adding quality of life assessments or patient experience metrics to strengthen patient relevance.
                                </p>
                              ) : (
                                <p className="text-sm text-orange-600 font-medium pt-1 border-t border-gray-200">
                                  <strong>AI Analysis:</strong> This design {
                                    selectedState?.protocolType === 'delphi_consensus' ? "has limited focus on patient-relevant issues and lacks patient representation" :
                                    selectedState?.protocolType === 'secondary_data_analysis' ? "primarily examines clinical or surrogate endpoints with minimal patient-centered measures" :
                                    selectedState?.protocolType === 'retrospective_cohort_study' ? "focuses mainly on clinical outcomes without adequate patient-reported measures" :
                                    selectedState?.protocolType === 'cross_sectional_survey' ? "collects limited information on patient-centered concerns or quality of life" :
                                    selectedState?.protocolType === 'prospective_cohort_study' ? "tracks primarily clinical variables with few patient-reported outcomes" :
                                    "relies primarily on surrogate markers and clinician-assessed outcomes"
                                  } with minimal patient-reported measures. To improve, incorporate validated quality of life instruments, symptom burden assessments, and functional status measures.
                                </p>
                              )}
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="flex items-center justify-between">
                        <Progress 
                          value={selectedState.clinicalRelevance.patientCenteredOutcomes ? selectedState.clinicalRelevance.patientCenteredOutcomes * 100 : 0} 
                          className="w-4/5" 
                        />
                        <span className="font-bold text-lg">
                          {selectedState.clinicalRelevance.patientCenteredOutcomes ?
                            Math.round(selectedState.clinicalRelevance.patientCenteredOutcomes * 10) / 10 :
                            "N/A"}
                        </span>
                      </div>
                    </CardContent>
                  </Card>
                  
                  <Card>
                    <CardHeader className="pb-2">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-base">Translational Potential</CardTitle>
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <div>
                                <Info className="h-5 w-5 ml-1 text-blue-500 animate-pulse cursor-help" />
                              </div>
                            </TooltipTrigger>
                            <TooltipContent className="w-80">
                              <p className="text-sm font-semibold mb-1">Translational Potential: {Math.round((selectedState.clinicalRelevance?.translationalPotential || 0) * 100)}%</p>
                              <p className="text-sm mb-1">{selectedState.clinicalRelevance?.translationalRationale || 
                                (() => {
                                  // Protocol-specific tooltip text
                                  if (selectedState?.protocolType === 'delphi_consensus') {
                                    return "Evaluates how likely the consensus recommendations can be implemented in clinical practice. Higher scores indicate practical, actionable consensus statements that address real-world clinical scenarios.";
                                  } else if (selectedState?.protocolType === 'secondary_data_analysis' || selectedState?.protocolType === 'retrospective_cohort_study') {
                                    return "Evaluates how applicable the retrospective findings are to current clinical decision-making. Higher scores indicate analysis of data sources and variables that closely match current practice patterns.";
                                  } else if (selectedState?.protocolType === 'cross_sectional_survey') {
                                    return "Evaluates how likely the survey findings can influence policy or practice change. Higher scores indicate survey designs that generate actionable insights for healthcare stakeholders.";
                                  } else if (selectedState?.protocolType === 'prospective_cohort_study') {
                                    return "Evaluates how applicable the cohort findings will be to routine clinical settings. Higher scores indicate designs with broad eligibility criteria and outcomes relevant to diverse practice environments.";
                                  } else {
                                    return "Evaluates how likely the study results can be translated into clinical practice. Higher scores indicate designs with results that can be readily applied to real-world settings.";
                                  }
                                })()
                              }</p>
                              {(selectedState.clinicalRelevance?.translationalPotential || 0) >= 0.8 ? (
                                <p className="text-sm text-green-600 font-medium pt-1 border-t border-gray-200">
                                  <strong>AI Analysis:</strong> This design has high translational potential due to {
                                    selectedState?.protocolType === 'delphi_consensus' ? "a well-structured consensus process with clear, actionable recommendations that directly address clinical decision points" :
                                    selectedState?.protocolType === 'secondary_data_analysis' ? "analysis of highly relevant, representative data sources with variables that closely match current clinical documentation" :
                                    selectedState?.protocolType === 'retrospective_cohort_study' ? "comprehensive inclusion criteria capturing a diverse, representative patient population and measuring outcomes directly relevant to current practice" :
                                    selectedState?.protocolType === 'cross_sectional_survey' ? "targeted sampling of key stakeholders and pragmatic questions that directly inform implementation decisions" :
                                    selectedState?.protocolType === 'prospective_cohort_study' ? "inclusive eligibility criteria and outcome measures that align closely with routine clinical assessment" :
                                    "pragmatic eligibility criteria and clinically relevant dosing regimens"
                                  }. The {
                                    selectedState?.protocolType === 'delphi_consensus' ? "consensus statements" :
                                    selectedState?.protocolType === 'secondary_data_analysis' || selectedState?.protocolType === 'retrospective_cohort_study' ? "findings" :
                                    selectedState?.protocolType === 'cross_sectional_survey' ? "survey results" :
                                    selectedState?.protocolType === 'prospective_cohort_study' ? "observations" :
                                    "protocol's streamlined procedures"
                                  } can be readily implemented in community practice settings without specialized infrastructure.
                                </p>
                              ) : (selectedState.clinicalRelevance?.translationalPotential || 0) >= 0.6 ? (
                                <p className="text-sm text-amber-600 font-medium pt-1 border-t border-gray-200">
                                  <strong>AI Analysis:</strong> This design has moderate translational potential but faces challenges in {
                                    selectedState?.protocolType === 'delphi_consensus' ? "generating consensus statements that are specific enough for direct clinical implementation" :
                                    selectedState?.protocolType === 'secondary_data_analysis' ? "relating historical data patterns to current practice environments" :
                                    selectedState?.protocolType === 'retrospective_cohort_study' ? "accounting for changes in practice patterns since the data was collected" :
                                    selectedState?.protocolType === 'cross_sectional_survey' ? "gathering responses from a sufficiently representative sample to inform broad practice change" :
                                    selectedState?.protocolType === 'prospective_cohort_study' ? "balancing comprehensive data collection with feasible follow-up procedures" :
                                    "adapting complex protocols to community settings"
                                  }. Consider addressing these limitations to improve implementation potential.
                                </p>
                              ) : (
                                <p className="text-sm text-orange-600 font-medium pt-1 border-t border-gray-200">
                                  <strong>AI Analysis:</strong> This design has limited translational potential due to {
                                    selectedState?.protocolType === 'delphi_consensus' ? "overly theoretical consensus topics or lack of implementation guidance in the consensus process" :
                                    selectedState?.protocolType === 'secondary_data_analysis' ? "outdated data sources or variables that don't match current documentation practices" :
                                    selectedState?.protocolType === 'retrospective_cohort_study' ? "highly selective historical cohorts that don't represent today's patient populations" :
                                    selectedState?.protocolType === 'cross_sectional_survey' ? "narrowly focused questions or biased sampling approach that limits generalizability" :
                                    selectedState?.protocolType === 'prospective_cohort_study' ? "restrictive eligibility criteria or specialized assessment procedures" :
                                    "highly restrictive eligibility criteria and complex intervention protocols"
                                  }. Consider revising to better align with real-world clinical practice scenarios.
                                </p>
                              )}
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="flex items-center justify-between">
                        <Progress 
                          value={(selectedState.clinicalRelevance?.translationalPotential || 0) * 100} 
                          className="w-4/5" 
                        />
                        <span className="font-bold text-lg">
                          {selectedState.clinicalRelevance?.translationalPotential ?
                            Math.round(selectedState.clinicalRelevance.translationalPotential * 10) / 10 :
                            "N/A"}
                        </span>
                      </div>
                    </CardContent>
                  </Card>
                  
                  <Card>
                    <CardHeader className="pb-2">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-base">Unmet Need Alignment</CardTitle>
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <div>
                                <Info className="h-5 w-5 ml-1 text-blue-500 animate-pulse cursor-help" />
                              </div>
                            </TooltipTrigger>
                            <TooltipContent className="w-80">
                              <p className="text-sm font-semibold mb-1">Unmet Need Alignment: {Math.round((selectedState.clinicalRelevance?.unmetNeedAlignment || 0) * 100)}%</p>
                              <p className="text-sm mb-1">{selectedState.clinicalRelevance?.unmetNeedRationale || 
                                (() => {
                                  // Protocol-specific tooltip text
                                  if (selectedState?.protocolType === 'delphi_consensus') {
                                    return "Evaluates how well the consensus study addresses areas of clinical controversy or practice variability. Higher scores indicate focusing on areas with significant practice heterogeneity that need harmonization.";
                                  } else if (selectedState?.protocolType === 'secondary_data_analysis' || selectedState?.protocolType === 'retrospective_cohort_study') {
                                    return "Evaluates how well the analysis addresses knowledge gaps preventing optimal care delivery. Higher scores indicate examining underutilized data that could resolve important clinical questions.";
                                  } else if (selectedState?.protocolType === 'cross_sectional_survey') {
                                    return "Evaluates how well the survey targets areas where patient or provider perspectives are missing from decision-making. Higher scores indicate collecting data on high-priority questions lacking stakeholder input.";
                                  } else if (selectedState?.protocolType === 'prospective_cohort_study') {
                                    return "Evaluates how well the cohort study addresses population groups or exposures with limited longitudinal data. Higher scores indicate following understudied groups with significant clinical relevance.";
                                  } else {
                                    return "Evaluates how well the study addresses unresolved clinical challenges or treatment gaps. Higher scores indicate designs that target significant unmet medical needs.";
                                  }
                                })()
                              }</p>
                              {(selectedState.clinicalRelevance?.unmetNeedAlignment || 0) >= 0.9 ? (
                                <p className="text-sm text-green-600 font-medium pt-1 border-t border-gray-200">
                                  <strong>AI Analysis:</strong> This design directly addresses a critical unmet need where {
                                    selectedState?.protocolType === 'delphi_consensus' ? "clinical practice shows substantial variability due to lack of evidence-based guidance" :
                                    selectedState?.protocolType === 'secondary_data_analysis' ? "valuable real-world data remains largely unexamined despite its potential to answer key clinical questions" :
                                    selectedState?.protocolType === 'retrospective_cohort_study' ? "historical outcomes data could reveal important patterns to guide current treatment decisions" :
                                    selectedState?.protocolType === 'cross_sectional_survey' ? "stakeholder perspectives are critically absent from current clinical decision-making" :
                                    selectedState?.protocolType === 'prospective_cohort_study' ? "longitudinal outcomes are poorly documented for key exposure patterns" :
                                    "current treatments are inadequate or non-existent"
                                  }. Specifically, it targets {
                                    selectedState?.protocolType === 'delphi_consensus' ? "a clinical area with high practice heterogeneity where standardization could significantly improve outcomes" :
                                    selectedState?.protocolType === 'secondary_data_analysis' ? "data sources that could identify optimal treatment pathways for patients currently receiving inconsistent care" :
                                    selectedState?.protocolType === 'retrospective_cohort_study' ? "a patient population with few therapeutic options and poorly documented outcomes" :
                                    selectedState?.protocolType === 'cross_sectional_survey' ? "critical gaps in understanding patient preferences that significantly impact treatment adherence and satisfaction" :
                                    selectedState?.protocolType === 'prospective_cohort_study' ? "an exposure pattern associated with poor outcomes that could be mitigated with better understanding" :
                                    "a patient population with few therapeutic options and poor prognosis"
                                  }.
                                </p>
                              ) : (selectedState.clinicalRelevance?.unmetNeedAlignment || 0) >= 0.7 ? (
                                <p className="text-sm text-green-600 font-medium pt-1 border-t border-gray-200">
                                  <strong>AI Analysis:</strong> This design addresses an important unmet need by {
                                    selectedState?.protocolType === 'delphi_consensus' ? "targeting an area where practice guidelines need updating or refinement" :
                                    selectedState?.protocolType === 'secondary_data_analysis' ? "analyzing data that could improve understanding of treatment outcomes in specific subgroups" :
                                    selectedState?.protocolType === 'retrospective_cohort_study' ? "examining historical outcomes in patient subsets with variable treatment responses" :
                                    selectedState?.protocolType === 'cross_sectional_survey' ? "gathering input from stakeholders whose perspectives are currently underrepresented" :
                                    selectedState?.protocolType === 'prospective_cohort_study' ? "following a cohort with moderate clinical uncertainties about optimal management" :
                                    "targeting a specific subpopulation that responds poorly to current standard of care"
                                  }. While not addressing the most critical gaps, this work will provide valuable insights for an important clinical scenario.
                                </p>
                              ) : (
                                <p className="text-sm text-amber-600 font-medium pt-1 border-t border-gray-200">
                                  <strong>AI Analysis:</strong> This design addresses an area {
                                    selectedState?.protocolType === 'delphi_consensus' ? "where clinical practice is already relatively standardized with acceptable consensus" :
                                    selectedState?.protocolType === 'secondary_data_analysis' ? "with substantial existing research and data analysis" :
                                    selectedState?.protocolType === 'retrospective_cohort_study' ? "where retrospective outcomes are already well-documented" :
                                    selectedState?.protocolType === 'cross_sectional_survey' ? "where stakeholder perspectives are already well-represented in the literature" :
                                    selectedState?.protocolType === 'prospective_cohort_study' ? "with existing cohort studies tracking similar exposures and outcomes" :
                                    "with established treatments that are moderately effective"
                                  }. While incremental improvements are valuable, consider refocusing on areas with greater knowledge gaps or clinical need.
                                </p>
                              )}
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="flex items-center justify-between">
                        <Progress 
                          value={(selectedState.clinicalRelevance?.unmetNeedAlignment || 0) * 100} 
                          className="w-4/5" 
                        />
                        <span className="font-bold text-lg">
                          {selectedState.clinicalRelevance?.unmetNeedAlignment ?
                            Math.round(selectedState.clinicalRelevance.unmetNeedAlignment * 10) / 10 :
                            "N/A"}
                        </span>
                      </div>
                    </CardContent>
                  </Card>
                  
                  <Card>
                    <CardHeader className="pb-2">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-base">Adoption Likelihood</CardTitle>
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <div>
                                <Info className="h-5 w-5 ml-1 text-blue-500 animate-pulse cursor-help" />
                              </div>
                            </TooltipTrigger>
                            <TooltipContent className="w-80">
                              <p className="text-sm font-semibold mb-1">Adoption Likelihood: {Math.round((selectedState.clinicalRelevance?.adoptionLikelihood || 0) * 100)}%</p>
                              <p className="text-sm mb-1">{selectedState.clinicalRelevance?.adoptionRationale || 
                                (() => {
                                  // Protocol-specific tooltip text
                                  if (selectedState?.protocolType === 'delphi_consensus') {
                                    return "Evaluates how likely the consensus findings will be embraced by the clinical community. Higher scores indicate designs with features like representative expert panels, transparent methodology, and clear implementation guidance.";
                                  } else if (selectedState?.protocolType === 'secondary_data_analysis' || selectedState?.protocolType === 'retrospective_cohort_study') {
                                    return "Evaluates how likely the retrospective findings will influence clinical decision-making. Higher scores indicate analyses with robust methodologies and clinically relevant outcomes.";
                                  } else if (selectedState?.protocolType === 'cross_sectional_survey') {
                                    return "Evaluates how likely the survey findings will influence practice change. Higher scores indicate designs with representative sampling, validated instruments, and stakeholder engagement.";
                                  } else if (selectedState?.protocolType === 'prospective_cohort_study') {
                                    return "Evaluates how likely the observational findings will impact clinical approaches. Higher scores indicate cohort designs with robust methods and clinically relevant endpoints.";
                                  } else {
                                    return "Evaluates how likely the intervention will be adopted in clinical practice if successful. Higher scores indicate designs with fewer barriers to implementation.";
                                  }
                                })()
                              }</p>
                              {(selectedState.clinicalRelevance?.adoptionLikelihood || 0) >= 0.8 ? (
                                <p className="text-sm text-green-600 font-medium pt-1 border-t border-gray-200">
                                  <strong>AI Analysis:</strong> This design has excellent adoption potential with minimal implementation barriers. Key facilitators include: {
                                    selectedState?.protocolType === 'delphi_consensus' ? 
                                      "1) Highly representative expert panel with key opinion leaders, 2) Rigorous and transparent methodology with clear consensus thresholds, and 3) Practical implementation guidance that addresses real-world constraints." :
                                    selectedState?.protocolType === 'secondary_data_analysis' ? 
                                      "1) Use of widely respected data sources, 2) Robust statistical methodology addressing confounders, and 3) Analysis of outcome measures directly relevant to clinical decisions." :
                                    selectedState?.protocolType === 'retrospective_cohort_study' ? 
                                      "1) Well-defined cohort representative of clinical populations, 2) Comprehensive outcome assessment aligned with clinical priorities, and 3) Robust analytical methods to address potential biases." :
                                    selectedState?.protocolType === 'cross_sectional_survey' ? 
                                      "1) Comprehensive sampling strategy reaching all key stakeholders, 2) Use of validated survey instruments with high reliability, and 3) Collection of actionable data directly applicable to practice improvement." :
                                    selectedState?.protocolType === 'prospective_cohort_study' ? 
                                      "1) Inclusion criteria aligned with real-world patient populations, 2) Follow-up procedures compatible with routine clinical care, and 3) Measurement of endpoints that directly influence clinical decisions." :
                                    "1) Compatibility with existing clinical workflows, 2) Oral administration that requires no special handling, and 3) Minimal monitoring requirements that align with routine practice."
                                  }
                                </p>
                              ) : (selectedState.clinicalRelevance?.adoptionLikelihood || 0) >= 0.6 ? (
                                <p className="text-sm text-amber-600 font-medium pt-1 border-t border-gray-200">
                                  <strong>AI Analysis:</strong> This design has moderate adoption potential with some implementation challenges. {
                                    selectedState?.protocolType === 'delphi_consensus' ? 
                                      "The expert panel has limited representation from community practitioners, and the consensus process lacks detailed implementation guidance for different practice settings." :
                                    selectedState?.protocolType === 'secondary_data_analysis' ? 
                                      "The data sources have some limitations in representativeness, and some important confounding variables may not be fully captured in the available data." :
                                    selectedState?.protocolType === 'retrospective_cohort_study' ? 
                                      "The historical cohort has selection biases that may limit generalizability, and some key outcome measures rely on inconsistently documented variables." :
                                    selectedState?.protocolType === 'cross_sectional_survey' ? 
                                      "The sampling approach may underrepresent certain stakeholder groups, and some survey instruments have limited validation in specific populations." :
                                    selectedState?.protocolType === 'prospective_cohort_study' ? 
                                      "The follow-up schedule is more intensive than routine care, and some assessments require specialized training or equipment not widely available." :
                                    "The weekly infusion regimen may limit adoption in community settings due to staffing constraints, and specialized monitoring requirements exceed standard practice patterns."
                                  }
                                </p>
                              ) : (
                                <p className="text-sm text-orange-600 font-medium pt-1 border-t border-gray-200">
                                  <strong>AI Analysis:</strong> This design faces significant adoption barriers including: {
                                    selectedState?.protocolType === 'delphi_consensus' ? 
                                      "1) Panel composition heavily weighted toward academic specialists, 2) Consensus methodology that doesn't adequately address implementation barriers, and 3) Lack of practical guidance for translating recommendations into practice." :
                                    selectedState?.protocolType === 'secondary_data_analysis' ? 
                                      "1) Use of outdated or highly specialized datasets, 2) Analytical approaches with significant limitations in controlling for confounders, and 3) Focus on outcomes with limited clinical actionability." :
                                    selectedState?.protocolType === 'retrospective_cohort_study' ? 
                                      "1) Highly selected historical cohort that doesn't represent current populations, 2) Retrospective data with significant missing values on key variables, and 3) Limited control for important confounding factors." :
                                    selectedState?.protocolType === 'cross_sectional_survey' ? 
                                      "1) Convenience sampling with significant selection bias, 2) Use of non-validated or modified assessment instruments, and 3) Focus on measures with limited connection to actionable change." :
                                    selectedState?.protocolType === 'prospective_cohort_study' ? 
                                      "1) Restrictive eligibility criteria limiting generalizability, 2) Burdensome follow-up procedures incompatible with routine care, and 3) Focus on specialized endpoints with limited clinical utility." :
                                    "1) Complex dosing regimen requiring multiple daily administrations, 2) Need for specialized testing not routinely available in community settings, and 3) Extensive monitoring requirements exceeding standard follow-up schedules."
                                  } Consider revising these elements to improve implementation potential.
                                </p>
                              )}
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="flex items-center justify-between">
                        <Progress 
                          value={(selectedState.clinicalRelevance?.adoptionLikelihood || 0) * 100} 
                          className="w-4/5" 
                        />
                        <span className="font-bold text-lg">
                          {selectedState.clinicalRelevance?.adoptionLikelihood ?
                            Math.round(selectedState.clinicalRelevance.adoptionLikelihood * 10) / 10 :
                            "N/A"}
                        </span>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </div>
            ) : (
              <Alert>
                <Users className="h-4 w-4" />
                <AlertTitle>Clinical Relevance Analysis</AlertTitle>
                <AlertDescription>
                  No clinical relevance analysis is available for this design state.
                </AlertDescription>
              </Alert>
            )}
          </TabsContent>
          
          <TabsContent value="feasibility">
            {!selectedState.feasibilityMetrics || 
             (selectedState.protocolType !== 'maic' && !selectedState.feasibilityMetrics.recruitmentSpeedImpact) ||
             (selectedState.protocolType === 'maic' && !selectedState.feasibilityMetrics.overallScore) ? (
              <div className="mb-6">
                <DesignQualityAnalyzer
                  protocolId={protocolId}
                  designState={selectedState}
                  onAnalysisComplete={(updatedState) => {
                    // Update the design states list
                    const updatedStates = designStates.map(state => 
                      state.id === updatedState.id ? updatedState : state
                    );
                    setDesignStates(updatedStates);
                    // Also update the active design state if it was modified
                    if (activeDesignState?.id === updatedState.id) {
                      onDesignStateChange(updatedState);
                    }
                  }}
                />
              </div>
            ) : null}
            
            {/* Use MAIC-specific metrics for MAIC protocol type */}
            {selectedState && selectedState.protocolType === 'maic' && selectedState.feasibilityMetrics && selectedState.feasibilityMetrics.overallScore !== undefined ? (
              <FeasibilityMetricsMAIC designState={selectedState} />
            ) : selectedState && selectedState.feasibilityMetrics && selectedState.feasibilityMetrics.recruitmentSpeedImpact !== undefined ? (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  {selectedState.feasibilityMetrics.recruitmentSpeedImpact !== undefined && (
                    <Card>
                      <CardHeader className="pb-2">
                        <div className="flex items-center justify-between">
                          <CardTitle className="text-base">Recruitment Speed Impact</CardTitle>
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <div>
                                  <Info className="h-5 w-5 ml-1 text-blue-500 animate-pulse cursor-help" />
                                </div>
                              </TooltipTrigger>
                              <TooltipContent className="w-80">
                                <p className="text-sm font-semibold mb-1">Recruitment Speed Impact: {selectedState.feasibilityMetrics.recruitmentSpeedImpact > 0 ? "+" : ""}{Math.round(selectedState.feasibilityMetrics.recruitmentSpeedImpact * 100)}%</p>
                                <p className="text-sm mb-1">{selectedState.feasibilityMetrics.recruitmentRationale || (() => {
                                  // Protocol-specific recruitment explanations
                                  if (selectedState?.protocolType === 'delphi_consensus') {
                                    return "Evaluates how expert panel recruitment affects engagement rate. A great design (+15% or higher) broadens expert eligibility criteria, offers flexible participation options, and minimizes time commitments. A moderate design (between 0% and +15%) uses standard recruitment approaches with minor enhancements. A challenging design (below 0%) has restrictive expert criteria, intensive time commitments, or inflexible participation requirements.";
                                  } else if (selectedState?.protocolType === 'secondary_data_analysis' || selectedState?.protocolType === 'retrospective_cohort_study') {
                                    return "Evaluates data acquisition speed for retrospective analyses. A great design (+15% or higher) uses readily accessible databases with standardized extraction protocols. A moderate design (between 0% and +15%) requires typical data access procedures with reasonable timeframes. A challenging design (below 0%) requires extensive data permission processes, manual chart reviews, or restricted-access datasets.";
                                  } else if (selectedState?.protocolType === 'cross_sectional_survey') {
                                    return "Evaluates how survey methodology affects response rates. A great design (+15% or higher) uses simplified eligibility criteria, multiple response channels, and effective incentive structures. A moderate design (between 0% and +15%) employs standard recruitment methods with reasonable response expectations. A challenging design (below 0%) has complex screening processes, burdensome participation requirements, or limited recruitment channels.";
                                  } else if (selectedState?.protocolType === 'prospective_cohort_study') {
                                    return "Evaluates how cohort recruitment affects enrollment timeline. A great design (+15% or higher) expands eligibility criteria, simplifies screening procedures, and offers flexible participation options. A moderate design (between 0% and +15%) uses standard recruitment approaches with typical enrollment expectations. A challenging design (below 0%) has restrictive inclusion criteria, complex screening procedures, or burdensome baseline assessments.";
                                  } else if (selectedState?.protocolType === 'maic') {
                                    return "Evaluates the efficiency of accessing and processing source data. A great design (+15% or higher) uses readily available datasets with minimal processing requirements. A moderate design (between 0% and +15%) requires typical data access and preparation procedures. A challenging design (below 0%) involves restricted datasets, extensive preprocessing, or complex variable mapping.";
                                  } else {
                                    return "Evaluates how eligibility criteria and procedures affect recruitment rates. A great design (+15% or higher) broadens inclusion criteria, simplifies screening processes, and offers participation incentives. A moderate design (between 0% and +15%) uses conventional recruitment methods with typical enrollment expectations. A challenging design (below 0%) has overly restrictive eligibility criteria, complex screening procedures, or burdensome baseline assessments.";
                                  }
                                })()}</p>
                                {selectedState.feasibilityMetrics.recruitmentSpeedImpact >= 0.15 ? (
                                  <p className="text-sm text-green-600 font-medium pt-1 border-t border-gray-200">
                                    <strong>AI Analysis:</strong> {(() => {
                                      // Protocol-specific high recruitment impact messages
                                      if (selectedState?.protocolType === 'delphi_consensus') {
                                        return "This design should significantly accelerate panel recruitment by: 1) Expanding expert criteria to include nurse practitioners and physician assistants, 2) Allowing virtual participation rather than in-person meetings, and 3) Reducing time commitment requirements from full-day to 2-hour sessions. These changes could improve expert acceptance rates by approximately 40%.";
                                      } else if (selectedState?.protocolType === 'secondary_data_analysis' || selectedState?.protocolType === 'retrospective_cohort_study') {
                                        return "This design should significantly accelerate data acquisition by: 1) Utilizing readily available national registry data rather than institution-specific records, 2) Focusing on core essential variables with high completion rates, and 3) Reducing the lookback period from 10 years to 5 years. These changes simplify data extraction and availability.";
                                      } else if (selectedState?.protocolType === 'cross_sectional_survey') {
                                        return "This design should significantly improve survey response rates by: 1) Shortening the questionnaire from 50 to 20 items, 2) Implementing mobile-friendly design with progress indicators, and 3) Offering multiple completion options (online, phone, paper). These changes could improve completion rates by approximately 30%.";
                                      } else if (selectedState?.protocolType === 'prospective_cohort_study') {
                                        return "This design should significantly accelerate cohort recruitment by: 1) Expanding the age range criteria, 2) Allowing stable medical comorbidities, and 3) Implementing multiple enrollment pathways including direct-to-patient options. These specific changes could increase eligible participation by approximately 35%.";
                                      } else {
                                        return "This design should significantly accelerate recruitment by: 1) Expanding the age range from 18-65 to 18-75, 2) Allowing stable medical comorbidities rather than requiring perfect health, and 3) Reducing the washout period for prior therapies from 6 months to 4 weeks. These specific changes could make approximately 40% more patients eligible.";
                                      }
                                    })()}
                                  </p>
                                ) : selectedState.feasibilityMetrics.recruitmentSpeedImpact >= 0 ? (
                                  <p className="text-sm text-amber-600 font-medium pt-1 border-t border-gray-200">
                                    <strong>AI Analysis:</strong> {(() => {
                                      // Protocol-specific moderate recruitment impact messages
                                      if (selectedState?.protocolType === 'delphi_consensus') {
                                        return "This design may slightly improve expert recruitment by offering more flexible participation options, but the requirement for extensive pre-reading materials and comprehensive expertise requirements may limit the potential expert pool.";
                                      } else if (selectedState?.protocolType === 'secondary_data_analysis' || selectedState?.protocolType === 'retrospective_cohort_study') {
                                        return "This design may moderately improve data acquisition timelines by using established databases, but the requirement for specialized variables not commonly collected in standard care may limit data completeness.";
                                      } else if (selectedState?.protocolType === 'cross_sectional_survey') {
                                        return "This design makes reasonable compromises between survey depth and participant burden, with standard incentives and completion time requirements that should yield average response rates.";
                                      } else if (selectedState?.protocolType === 'prospective_cohort_study') {
                                        return "This design may slightly improve recruitment efficiency through streamlined screening procedures, but still maintains moderately restrictive eligibility criteria that will limit the eligible population.";
                                      } else {
                                        return "This design may slightly improve recruitment speed by relaxing exclusion criteria around prior therapy exposure, but the requirement for specialized genetic testing (specifically KRAS mutation analysis) at screening may offset these gains by introducing a screening bottleneck.";
                                      }
                                    })()}
                                  </p>
                                ) : (
                                  <p className="text-sm text-orange-600 font-medium pt-1 border-t border-gray-200">
                                    <strong>AI Analysis:</strong> {(() => {
                                      // Protocol-specific low recruitment impact messages
                                      if (selectedState?.protocolType === 'delphi_consensus') {
                                        return "This design will likely slow expert recruitment due to: 1) Requiring in-person participation for all consensus rounds, 2) Demanding extensive clinical and research experience qualifications, and 3) Requiring significant time commitment with no compensation. Consider addressing these barriers to improve expert participation.";
                                      } else if (selectedState?.protocolType === 'secondary_data_analysis' || selectedState?.protocolType === 'retrospective_cohort_study') {
                                        return "This design will likely slow data acquisition due to: 1) Requiring specialized data elements not routinely collected, 2) Demanding complete longitudinal records with no missing values, and 3) Requiring manual chart review for key variables. Consider simplifying data requirements.";
                                      } else if (selectedState?.protocolType === 'cross_sectional_survey') {
                                        return "This design will likely reduce response rates due to: 1) Excessive survey length (>45 minutes to complete), 2) Complex branching logic creating participant confusion, and 3) Requiring sensitive information without clear privacy protection statements. Consider simplifying the survey design.";
                                      } else if (selectedState?.protocolType === 'prospective_cohort_study') {
                                        return "This design will likely slow recruitment due to: 1) Highly restrictive eligibility criteria, 2) Requiring extensive baseline testing before enrollment, and 3) Demanding long-term commitment with frequent study visits. Consider relaxing these requirements.";
                                      } else {
                                        return "This design will likely slow recruitment due to: 1) Adding a restrictive requirement for ECOG 0-1 status only, 2) Requiring normal organ function across all systems with no allowances for mild impairment, and 3) Adding exclusions for common comorbidities like controlled diabetes and hypertension. Consider relaxing these restrictive criteria.";
                                      }
                                    })()}
                                  </p>
                                )}
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        </div>
                      </CardHeader>
                      <CardContent>
                        <div className="flex items-center justify-between">
                          <div className="flex-1">
                            <Progress 
                              value={(selectedState.feasibilityMetrics.recruitmentSpeedImpact + 1) * 50} 
                              className="w-4/5" 
                            />
                            <div className="flex justify-between text-xs mt-1 w-4/5">
                              <span>Slower</span>
                              <span>No Impact</span>
                              <span>Faster</span>
                            </div>
                          </div>
                          <span className="font-bold text-lg">
                            {selectedState.feasibilityMetrics.recruitmentSpeedImpact > 0 ? "+" : ""}
                            {Math.round(selectedState.feasibilityMetrics.recruitmentSpeedImpact * 100)}%
                          </span>
                        </div>
                      </CardContent>
                    </Card>
                  )}
                  
                  {selectedState.feasibilityMetrics.operationalComplexity !== undefined && (
                    <Card>
                      <CardHeader className="pb-2">
                        <div className="flex items-center justify-between">
                          <CardTitle className="text-base">Operational Complexity</CardTitle>
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <div>
                                  <Info className="h-5 w-5 ml-1 text-blue-500 animate-pulse cursor-help" />
                                </div>
                              </TooltipTrigger>
                              <TooltipContent className="w-80">
                                <p className="text-sm font-semibold mb-1">Operational Complexity: {selectedState.feasibilityMetrics.operationalComplexity > 0 ? "+" : ""}{Math.round(selectedState.feasibilityMetrics.operationalComplexity * 100)}%</p>
                                <p className="text-sm mb-1">{selectedState.feasibilityMetrics.complexityRationale || (() => {
                                  // Protocol-specific complexity explanations
                                  if (selectedState?.protocolType === 'delphi_consensus') {
                                    return "Evaluates the logistical demands of implementing the consensus methodology. A great design (-15% or lower) uses streamlined electronic rating systems, centralized management software, and simplified voting procedures. A moderate design (between -15% and +10%) employs standard Delphi logistics with minor improvements. A complex design (above +10%) requires extensive coordination, multiple complex rounds, or uncommon methodological variations.";
                                  } else if (selectedState?.protocolType === 'secondary_data_analysis' || selectedState?.protocolType === 'retrospective_cohort_study') {
                                    return "Evaluates data management and analysis complexity. A great design (-15% or lower) uses consolidated datasets with standardized variables and established analytical pipelines. A moderate design (between -15% and +10%) requires typical data linking and cleaning with established methods. A complex design (above +10%) requires extensive harmonization of disparate datasets, complex temporal analyses, or specialized statistical expertise.";
                                  } else if (selectedState?.protocolType === 'cross_sectional_survey') {
                                    return "Evaluates survey administration and analysis complexity. A great design (-15% or lower) uses validated turnkey survey platforms, standardized instruments, and streamlined recruitment. A moderate design (between -15% and +10%) employs typical survey methods with reasonable coordination needs. A complex design (above +10%) requires extensive multilingual adaptation, complex sampling frames, or specialized distribution methods.";
                                  } else if (selectedState?.protocolType === 'prospective_cohort_study') {
                                    return "Evaluates operational demands of cohort management and follow-up. A great design (-15% or lower) minimizes visit complexity, uses electronic data capture, and streamlines assessment procedures. A moderate design (between -15% and +10%) uses standard follow-up procedures and typical biospecimen collection. A complex design (above +10%) requires intensive follow-up, complex biomarker collection, or specialized imaging at multiple timepoints.";
                                  } else if (selectedState?.protocolType === 'maic') {
                                    return "Evaluates operational demands of matching and comparative analysis. A great design (-15% or lower) uses well-structured datasets with common variables and established matching algorithms. A moderate design (between -15% and +10%) requires typical data transformation and standard matching procedures. A complex design (above +10%) involves extensive data imputation, complex matching variables, or specialized statistical expertise.";
                                  } else {
                                    return "Evaluates operational demands of implementing the design. A great design (-15% or lower) significantly simplifies site procedures, data collection, and study coordination. A moderate design (between -15% and +10%) maintains standard operational complexity with typical implementation requirements. A complex design (above +10%) introduces multiple procedural complexities, specialized assessments, or complicated intervention delivery.";
                                  }
                                })()}</p>
                                {selectedState.feasibilityMetrics.operationalComplexity <= -0.15 ? (
                                  <p className="text-sm text-green-600 font-medium pt-1 border-t border-gray-200">
                                    <strong>AI Analysis:</strong> {(() => {
                                      // Protocol-specific low complexity impact messages
                                      if (selectedState?.protocolType === 'delphi_consensus') {
                                        return "This design significantly reduces operational complexity by: 1) Using a standardized online platform for all rounds, 2) Implementing automated scoring and feedback algorithms, and 3) Centralizing panel management through a single coordinator. These changes streamline the consensus process and reduce administrative burden.";
                                      } else if (selectedState?.protocolType === 'secondary_data_analysis' || selectedState?.protocolType === 'retrospective_cohort_study') {
                                        return "This design significantly reduces analytical complexity by: 1) Using a single, well-structured database source with consistent data definitions, 2) Limiting analyses to clearly defined variables with minimal missingness, and 3) Adopting standardized analytical approaches with established code repositories. These changes simplify data management and analysis.";
                                      } else if (selectedState?.protocolType === 'cross_sectional_survey') {
                                        return "This design significantly reduces survey implementation complexity by: 1) Using a standardized electronic data capture system, 2) Implementing simple linear question flow without complex branching, and 3) Automating scoring and preliminary analysis processes. These changes streamline data collection and management.";
                                      } else if (selectedState?.protocolType === 'prospective_cohort_study') {
                                        return "This design significantly reduces operational complexity by: 1) Implementing remote data collection for most follow-up visits, 2) Streamlining the assessment schedule to essential measures only, and 3) Using electronic participant-reported outcomes rather than extensive site-administered tests. These changes simplify study execution.";
                                      } else {
                                        return "This design significantly reduces operational complexity by: 1) Eliminating the need for central lab processing of biomarkers, 2) Removing requirements for real-time PK sampling during infusion, and 3) Reducing mandatory imaging timepoints from 7 to 4. These specific changes should reduce site workload and simplify study conduct.";
                                      }
                                    })()}
                                  </p>
                                ) : selectedState.feasibilityMetrics.operationalComplexity <= 0.1 ? (
                                  <p className="text-sm text-amber-600 font-medium pt-1 border-t border-gray-200">
                                    <strong>AI Analysis:</strong> {(() => {
                                      // Protocol-specific moderate complexity impact messages
                                      if (selectedState?.protocolType === 'delphi_consensus') {
                                        return "This design maintains moderate operational complexity with typical Delphi methodology requirements. While the multi-round approach requires sustained coordination effort, the standardized scoring system and mixed virtual/in-person format creates a manageable implementation approach.";
                                      } else if (selectedState?.protocolType === 'secondary_data_analysis' || selectedState?.protocolType === 'retrospective_cohort_study') {
                                        return "This design maintains a moderate level of analytical complexity with standard database management techniques. The approach balances in-depth analysis with practical data handling requirements that are achievable with standard statistical expertise.";
                                      } else if (selectedState?.protocolType === 'cross_sectional_survey') {
                                        return "This design employs survey methods of moderate complexity with standard distribution and analysis approaches. The mixed-mode data collection creates some administrative challenges, but overall implementation complexity remains manageable.";
                                      } else if (selectedState?.protocolType === 'prospective_cohort_study') {
                                        return "This design maintains moderate operational complexity with a balanced assessment schedule and reasonable follow-up procedures. The data collection approach uses standard procedures that most research sites can implement effectively.";
                                      } else {
                                        return "This design maintains moderate operational complexity with standard imaging and biomarker collection protocols. While the addition of patient-reported outcomes creates some additional workflow requirements, the overall complexity remains manageable for sites with clinical trial experience.";
                                      }
                                    })()}
                                  </p>
                                ) : (
                                  <p className="text-sm text-orange-600 font-medium pt-1 border-t border-gray-200">
                                    <strong>AI Analysis:</strong> {(() => {
                                      // Protocol-specific high complexity impact messages
                                      if (selectedState?.protocolType === 'delphi_consensus') {
                                        return "This design introduces significant operational complexity through: 1) Required in-person attendance for multiple 2-day consensus meetings, 2) Complex weighted voting systems requiring real-time calculations, and 3) Extensive pre-meeting individual expert interviews and preparation materials. Consider simplifying the consensus methodology and meeting structure.";
                                      } else if (selectedState?.protocolType === 'secondary_data_analysis' || selectedState?.protocolType === 'retrospective_cohort_study') {
                                        return "This design introduces significant analytical complexity through: 1) Merging multiple disparate data sources with inconsistent variable definitions, 2) Required manual extraction and coding of unstructured text fields, and 3) Complex statistical approaches requiring specialized expertise. Consider simplifying the data sources and analytical methods.";
                                      } else if (selectedState?.protocolType === 'cross_sectional_survey') {
                                        return "This design introduces significant implementation complexity through: 1) Complex multi-language translation requirements, 2) Extensive branching logic creating hundreds of potential question paths, and 3) Required integration of biometric data collection alongside survey responses. Consider simplifying the survey design and administration.";
                                      } else if (selectedState?.protocolType === 'prospective_cohort_study') {
                                        return "This design introduces significant operational complexity through: 1) Frequent specialized assessments requiring trained personnel, 2) Extensive biospecimen collection with strict processing requirements, and 3) Complex stratification and follow-up schedules varying by participant characteristics. Consider streamlining procedures.";
                                      } else {
                                        return "This design introduces significant operational complexity through: 1) Required fresh tissue biopsies at 3 timepoints, 2) Specialized PK sampling at precise intervals (15min, 30min, 1hr, 2hr post-dose), and 3) Mandatory processing and shipping of samples within 2 hours of collection. Consider simplifying these requirements.";
                                      }
                                    })()}
                                  </p>
                                )}
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        </div>
                      </CardHeader>
                      <CardContent>
                        <div className="flex items-center justify-between">
                          <div className="flex-1">
                            <Progress 
                              value={(selectedState.feasibilityMetrics.operationalComplexity + 1) * 50} 
                              className="w-4/5" 
                            />
                            <div className="flex justify-between text-xs mt-1 w-4/5">
                              <span>Simpler</span>
                              <span>No Change</span>
                              <span>More Complex</span>
                            </div>
                          </div>
                          <span className="font-bold text-lg">
                            {selectedState.feasibilityMetrics.operationalComplexity > 0 ? "+" : ""}
                            {Math.round(selectedState.feasibilityMetrics.operationalComplexity * 100)}%
                          </span>
                        </div>
                      </CardContent>
                    </Card>
                  )}
                  
                  {selectedState.feasibilityMetrics.participantBurden !== undefined && (
                    <Card>
                      <CardHeader className="pb-2">
                        <div className="flex items-center justify-between">
                          <CardTitle className="text-base">Participant Burden</CardTitle>
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <div>
                                  <Info className="h-5 w-5 ml-1 text-blue-500 animate-pulse cursor-help" />
                                </div>
                              </TooltipTrigger>
                              <TooltipContent className="w-80">
                                <p className="text-sm font-semibold mb-1">Participant Burden: {selectedState.feasibilityMetrics.participantBurden > 0 ? "+" : ""}{Math.round(selectedState.feasibilityMetrics.participantBurden * 100)}%</p>
                                <p className="text-sm mb-1">{selectedState.feasibilityMetrics.participantBurdenRationale || (() => {
                                  // Protocol-specific participant burden explanations
                                  if (selectedState?.protocolType === 'delphi_consensus') {
                                    return "Evaluates time and effort demands on expert panelists. A great design (-15% or lower) requires minimal time commitment, offers asynchronous participation, and streamlines response submissions. A moderate design (between -15% and +10%) maintains typical expert involvement levels. A high burden design (above +10%) requires extensive preparation, lengthy questionnaires, or numerous real-time meetings.";
                                  } else if (selectedState?.protocolType === 'secondary_data_analysis' || selectedState?.protocolType === 'retrospective_cohort_study') {
                                    return "Evaluates data extraction and cleaning burden. A great design (-15% or lower) uses standardized extraction templates, automated quality checks, and streamlined processing. A moderate design (between -15% and +10%) requires typical data preparation effort. A high burden design (above +10%) involves extensive manual extraction, complex data cleaning, or labor-intensive harmonization.";
                                  } else if (selectedState?.protocolType === 'cross_sectional_survey') {
                                    return "Evaluates time and effort demands on survey respondents. A great design (-15% or lower) features brief questionnaires, intuitive interfaces, and adaptive question branching. A moderate design (between -15% and +10%) has typical completion times and question complexity. A high burden design (above +10%) uses lengthy surveys, complex response formats, or frequent follow-up requests.";
                                  } else if (selectedState?.protocolType === 'prospective_cohort_study') {
                                    return "Evaluates demands placed on cohort participants. A great design (-15% or lower) minimizes visit frequency, reduces assessment duration, and offers convenient participation options. A moderate design (between -15% and +10%) maintains typical participant obligations. A high burden design (above +10%) requires frequent visits, lengthy assessments, or demanding sample collection.";
                                  } else if (selectedState?.protocolType === 'maic') {
                                    return "Evaluates data handling burden. A great design (-15% or lower) uses standardized variable definitions, efficient matching algorithms, and streamlined sensitivity analyses. A moderate design (between -15% and +10%) requires typical analytical effort. A high burden design (above +10%) involves complex variable transformations, intensive iterative matching, or extensive manual data processing.";
                                  } else {
                                    return "Evaluates burden placed on study participants. A great design (-15% or lower) significantly reduces visit frequency, assessment duration, and procedural complexity. A moderate design (between -15% and +10%) maintains standard participant requirements. A high burden design (above +10%) introduces multiple demanding procedures, lengthy assessments, or frequent interventions.";
                                  }
                                })()}</p>
                                {selectedState.feasibilityMetrics.participantBurden <= -0.15 ? (
                                  <p className="text-sm text-green-600 font-medium pt-1 border-t border-gray-200">
                                    <strong>AI Analysis:</strong> {(() => {
                                      // Protocol-specific low burden impact messages
                                      if (selectedState?.protocolType === 'delphi_consensus') {
                                        return "This design significantly reduces expert burden by: 1) Using asynchronous online participation for most rounds, 2) Limiting time commitment to 1-hour sessions, and 3) Providing pre-populated response templates. These changes respect experts' time constraints while maintaining quality input.";
                                      } else if (selectedState?.protocolType === 'secondary_data_analysis' || selectedState?.protocolType === 'retrospective_cohort_study') {
                                        return "This design is based entirely on existing data sources, requiring no new participant involvement. The streamlined data extraction process further minimizes resource demands.";
                                      } else if (selectedState?.protocolType === 'cross_sectional_survey') {
                                        return "This design significantly reduces respondent burden through: 1) A concise 10-minute questionnaire focusing only on essential items, 2) Mobile-optimized interface with progress tracking, and 3) Ability to save and return to complete later. These features enhance the response experience.";
                                      } else if (selectedState?.protocolType === 'prospective_cohort_study') {
                                        return "This design significantly reduces participant burden through: 1) Minimal follow-up visits (only annual check-ins), 2) Remote electronic data collection for 80% of assessments, and 3) Focusing only on non-invasive measurements. This approach greatly improves the participant experience.";
                                      } else {
                                        return "This design significantly reduces participant burden by: 1) Decreasing the frequency of on-site visits from biweekly to monthly, 2) Allowing local lab testing rather than requiring travel to central facilities, and 3) Implementing a decentralized assessment model where 60% of study activities can be completed remotely.";
                                      }
                                    })()}
                                  </p>
                                ) : selectedState.feasibilityMetrics.participantBurden <= 0.1 ? (
                                  <p className="text-sm text-amber-600 font-medium pt-1 border-t border-gray-200">
                                    <strong>AI Analysis:</strong> {(() => {
                                      // Protocol-specific moderate burden impact messages
                                      if (selectedState?.protocolType === 'delphi_consensus') {
                                        return "This design maintains a moderate expert burden with standard Delphi methodology requirements. The mixed asynchronous/synchronous approach provides reasonable flexibility while still ensuring thorough consensus development.";
                                      } else if (selectedState?.protocolType === 'secondary_data_analysis' || selectedState?.protocolType === 'retrospective_cohort_study') {
                                        return "This design uses existing data with no direct participant burden. The data extraction process has a reasonable scope that balances comprehensive analysis with practical time constraints.";
                                      } else if (selectedState?.protocolType === 'cross_sectional_survey') {
                                        return "This design maintains a moderate respondent burden with a 15-20 minute survey that most participants can complete in a single session. The balanced approach captures necessary data without excessive time demands.";
                                      } else if (selectedState?.protocolType === 'prospective_cohort_study') {
                                        return "This design maintains a reasonable participant burden with quarterly follow-up assessments and standard data collection procedures. The protocol balances research needs with participant experience.";
                                      } else {
                                        return "This design maintains a moderate participant burden with a typical visit schedule and standard assessments. While the addition of quality of life questionnaires increases time commitment slightly, the design balances data collection needs with participant experience.";
                                      }
                                    })()}
                                  </p>
                                ) : (
                                  <p className="text-sm text-orange-600 font-medium pt-1 border-t border-gray-200">
                                    <strong>AI Analysis:</strong> {(() => {
                                      // Protocol-specific high burden impact messages
                                      if (selectedState?.protocolType === 'delphi_consensus') {
                                        return "This design imposes substantial expert burden with: 1) Required attendance at multiple full-day in-person meetings, 2) Extensive pre-meeting preparation materials (30+ hours of reading), and 3) Complex between-round assessment tasks. Consider reducing time requirements to improve expert participation and retention.";
                                      } else if (selectedState?.protocolType === 'secondary_data_analysis' || selectedState?.protocolType === 'retrospective_cohort_study') {
                                        return "While this design has no direct participant burden, the data extraction approach creates excessive workload for research staff, requiring manual chart review of thousands of records and extensive data cleaning.";
                                      } else if (selectedState?.protocolType === 'cross_sectional_survey') {
                                        return "This design imposes substantial respondent burden with: 1) A lengthy 45+ minute questionnaire, 2) Extensive open-text response requirements, and 3) Requests for sensitive information without clear purpose. Consider shortening and streamlining to improve response rates.";
                                      } else if (selectedState?.protocolType === 'prospective_cohort_study') {
                                        return "This design imposes substantial participant burden with: 1) Frequent assessments (monthly visits), 2) Extensive questionnaire batteries at each timepoint, and 3) Multiple biological samples including optional biopsies. Consider reducing assessment frequency and invasiveness to improve retention.";
                                      } else {
                                        return "This design creates high participant burden due to: 1) Required twice-weekly clinic visits for the first 8 weeks, 2) Multiple invasive procedures including repeated biopsies at weeks 2, 8, and 16, and 3) Extended on-site visits lasting 4-6 hours for PK sampling. Consider reducing visit frequency and invasive procedures.";
                                      }
                                    })()}
                                  </p>
                                )}
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        </div>
                      </CardHeader>
                      <CardContent>
                        <div className="flex items-center justify-between">
                          <div className="flex-1">
                            <Progress 
                              value={(selectedState.feasibilityMetrics.participantBurden + 1) * 50} 
                              className="w-4/5" 
                            />
                            <div className="flex justify-between text-xs mt-1 w-4/5">
                              <span>Less Burden</span>
                              <span>No Change</span>
                              <span>More Burden</span>
                            </div>
                          </div>
                          <span className="font-bold text-lg">
                            {selectedState.feasibilityMetrics.participantBurden > 0 ? "+" : ""}
                            {Math.round(selectedState.feasibilityMetrics.participantBurden * 100)}%
                          </span>
                        </div>
                      </CardContent>
                    </Card>
                  )}
                  
                  {selectedState.feasibilityMetrics.siteRequirements && (
                    <Card>
                      <CardHeader className="pb-2">
                        <div className="flex items-center justify-between">
                          <CardTitle className="text-base">Site Requirements</CardTitle>
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <div>
                                  <Info className="h-5 w-5 ml-1 text-blue-500 animate-pulse cursor-help" />
                                </div>
                              </TooltipTrigger>
                              <TooltipContent className="w-80">
                                <p className="text-sm font-semibold mb-1">Site Requirements</p>
                                <p className="text-sm mb-1">{(() => {
                                  // Protocol-specific site requirements explanations
                                  if (selectedState?.protocolType === 'delphi_consensus') {
                                    return "Summarizes the coordination expertise, facilitation capabilities, and technology infrastructure required to conduct the consensus process.";
                                  } else if (selectedState?.protocolType === 'secondary_data_analysis' || selectedState?.protocolType === 'retrospective_cohort_study') {
                                    return "Summarizes the data management, analytical expertise, and computing infrastructure needed to conduct the analysis.";
                                  } else if (selectedState?.protocolType === 'cross_sectional_survey') {
                                    return "Summarizes the survey administration capabilities, participant recruitment channels, and analytical expertise required.";
                                  } else if (selectedState?.protocolType === 'prospective_cohort_study') {
                                    return "Summarizes the participant tracking systems, follow-up capabilities, and data collection expertise required for cohort management.";
                                  } else {
                                    return "Summarizes the equipment, expertise, and facilities required for sites to participate in this study.";
                                  }
                                })()}</p>
                                <p className="text-sm text-blue-600 font-medium pt-1 border-t border-gray-200">
                                  <strong>AI Analysis:</strong> {(() => {
                                    // Protocol-specific site requirements analysis
                                    if (selectedState?.protocolType === 'delphi_consensus') {
                                      return "This design requires specific coordination and technology capabilities to manage the expert consensus process effectively. Ensure your team has experience with multi-round facilitation and access to appropriate communication platforms.";
                                    } else if (selectedState?.protocolType === 'secondary_data_analysis' || selectedState?.protocolType === 'retrospective_cohort_study') {
                                      return "This design requires specific data management and analytical capabilities. Ensure you have access to the necessary databases, statistical expertise, and computing infrastructure for this analysis.";
                                    } else if (selectedState?.protocolType === 'cross_sectional_survey') {
                                      return "This design requires specific survey administration and analysis capabilities. Review the requirements to ensure you have appropriate survey distribution channels and analytical expertise.";
                                    } else if (selectedState?.protocolType === 'prospective_cohort_study') {
                                      return "This design requires robust participant tracking and longitudinal data management capabilities. Review the requirements to ensure you can maintain high follow-up rates and data quality over time.";
                                    } else {
                                      return "This design requires specific capabilities from participating sites. Review the requirements carefully to ensure selected sites can meet all necessary criteria for successful study implementation.";
                                    }
                                  })()}
                                </p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        </div>
                      </CardHeader>
                      <CardContent>
                        <p className="text-sm">
                          {selectedState.feasibilityMetrics.siteRequirements}
                        </p>
                      </CardContent>
                    </Card>
                  )}
                </div>
                
                {selectedState.costImpact && (
                  <Card>
                    <CardHeader className="pb-2">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-base">Cost Impact</CardTitle>
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <div>
                                <Info className="h-5 w-5 ml-1 text-blue-500 animate-pulse cursor-help" />
                              </div>
                            </TooltipTrigger>
                            <TooltipContent className="w-80">
                              <p className="text-sm font-semibold mb-1">Cost Impact: {selectedState.costImpact.percentChange > 0 ? "+" : ""}{selectedState.costImpact.percentChange}%</p>
                              <p className="text-sm mb-1">Analyzes the estimated budget impact of design changes compared to standard approaches. Negative values indicate cost savings, positive values indicate increased costs.</p>
                              {selectedState.costImpact.percentChange <= -10 ? (
                                <p className="text-sm text-green-600 font-medium pt-1 border-t border-gray-200">
                                  <strong>AI Analysis:</strong> This design achieves substantial cost savings through: 1) Reducing the frequency of high-cost imaging procedures by 40%, 2) Eliminating unnecessary laboratory tests worth approximately $2,000 per patient, and 3) Implementing a streamlined monitoring approach that reduces site management costs by 25%.
                                </p>
                              ) : selectedState.costImpact.percentChange <= 10 ? (
                                <p className="text-sm text-amber-600 font-medium pt-1 border-t border-gray-200">
                                  <strong>AI Analysis:</strong> This design has a moderate cost impact with some areas showing increased costs (additional biomarker testing) balanced by savings in other areas (fewer imaging procedures). The net effect is within typical budget variations for studies of this complexity.
                                </p>
                              ) : (
                                <p className="text-sm text-orange-600 font-medium pt-1 border-t border-gray-200">
                                  <strong>AI Analysis:</strong> This design significantly increases costs primarily due to: 1) Addition of multiple biomarker assays at $3,500 per patient, 2) Increased site monitoring requirements adding approximately $8,000 per site, and 3) Extended treatment duration requiring 50% more drug supply. Consider targeting cost reductions in non-critical assessments.
                                </p>
                              )}
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="flex items-center gap-4 mb-4">
                        <span className={`text-2xl font-bold ${selectedState.costImpact.percentChange < 0 ? 'text-green-600' : 'text-red-600'}`}>
                          {selectedState.costImpact.percentChange > 0 ? "+" : ""}
                          {selectedState.costImpact.percentChange}%
                        </span>
                        <span className="text-gray-600">Overall Cost Impact</span>
                      </div>
                      
                      {selectedState.costImpact.areaBreakdown && (
                        <div>
                          <h4 className="text-sm font-medium mb-2">Cost Breakdown by Area</h4>
                          <div className="grid grid-cols-3 gap-4">
                            {Object.entries(selectedState.costImpact.areaBreakdown).map(([area, impact]) => (
                              <div key={area} className="text-center p-2 border rounded-md">
                                <p className="capitalize text-sm">{area}</p>
                                <p className={`font-bold ${Number(impact) < 0 ? 'text-green-600' : 'text-red-600'}`}>
                                  {Number(impact) > 0 ? "+" : ""}
                                  {impact}%
                                </p>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      
                      {selectedState.costImpact.explanation && (
                        <div className="mt-4">
                          <h4 className="text-sm font-medium mb-1">Explanation</h4>
                          <p className="text-sm text-gray-600">{selectedState.costImpact.explanation}</p>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                )}
              </div>
            ) : (
              <Alert>
                <AlertTitle>Feasibility Analysis</AlertTitle>
                <AlertDescription>
                  No feasibility analysis is available for this design state.
                </AlertDescription>
              </Alert>
            )}
          </TabsContent>
          
          <TabsContent value="alternatives">
            {alternatives.length > 0 ? (
              <div className="space-y-4">
                <div className="grid grid-cols-3 gap-4">
                  {alternatives.map((alternative, index) => (
                    <AlternativeDesignCard
                      key={index}
                      design={{
                        ...alternative,
                        // Preserve AI-generated label if present, otherwise use generic alternative name
                        label: alternative.label || `Alternative ${index + 1}`
                      }}
                      onApply={applyAlternative}
                      isApplying={false}
                    />
                  ))}
                </div>
              </div>
            ) : (
              <Alert>
                <Beaker className="h-4 w-4" />
                <AlertTitle>Design Alternatives</AlertTitle>
                <AlertDescription>
                  No design alternatives have been generated yet. 
                  Click the "Generate Alternatives" button to create variations of the current design.
                </AlertDescription>
              </Alert>
            )}
          </TabsContent>
        </Tabs>
      </CardContent>
      <CardFooter className="bg-gray-50 border-t">
        {!isActive && (
          <Alert className="w-full bg-amber-50 border-amber-200">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>This is not the active design</AlertTitle>
            <AlertDescription>
              Changes to this design state won't affect the protocol until you make it active.
            </AlertDescription>
          </Alert>
        )}
      </CardFooter>
    </Card>
  );
}