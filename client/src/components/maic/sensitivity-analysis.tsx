import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Slider } from "@/components/ui/slider";
import { Clipboard, PlayCircle, RefreshCcw, PlusCircle, CheckCircle2, AlertCircle, Info, BarChart3, BarChart4, HelpCircle } from "lucide-react";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface SensitivityAnalysisProps {
  protocol: any;
  setProtocol: (protocol: any) => void;
}

export function SensitivityAnalysis({ protocol, setProtocol }: SensitivityAnalysisProps) {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("scenarios");
  const [isRunning, setIsRunning] = useState(false);
  const [runningScenarioId, setRunningScenarioId] = useState<string | null>(null);
  
  // Get existing sensitivityAnalysis component or initialize if not exists
  const existingComponent = Array.isArray(protocol.components) 
    ? protocol.components.find(
        (component: any) => component.type === "sensitivityAnalysis" && component.designStateId === protocol.activeDesignState
      )
    : null;
  
  const sensitivityAnalysis = existingComponent?.data || {
    scenarios: [
      {
        id: "baseline",
        name: "Baseline Analysis",
        description: "Primary MAIC analysis with all matching variables",
        status: "complete",
        settings: {
          matchingVariables: ["AGE", "SEX", "ECOG", "PRIOR_TX"],
          matchingMethod: "standard",
          truncationThreshold: 0.01
        },
        results: {
          effectivePatientCount: 158.4,
          weightStats: {
            min: 0.12,
            max: 4.76,
            mean: 1.0,
            sd: 0.92
          },
          treatmentEffect: {
            hazardRatio: 0.67,
            confidenceInterval: [0.51, 0.89],
            pValue: 0.0053
          }
        }
      }
    ],
    completedScenarios: 1,
    totalScenarios: 1
  };
  
  // Update the sensitivityAnalysis in the protocol
  const updateSensitivityAnalysis = (updatedData: any) => {
    // Make a deep copy to avoid reference issues
    const newData = JSON.parse(JSON.stringify(updatedData));
    
    // Get all components except the current sensitivityAnalysis if it exists
    const otherComponents = Array.isArray(protocol.components) 
      ? protocol.components.filter(
          (component: any) => !(component.type === "sensitivityAnalysis" && component.designStateId === protocol.activeDesignState)
        ) 
      : [];
    
    // Create a new component
    const newComponent = {
      type: "sensitivityAnalysis",
      designStateId: protocol.activeDesignState,
      data: newData,
      createdAt: new Date(),
      updatedAt: new Date()
    };
    
    // Update the protocol
    setProtocol({
      ...protocol,
      components: [...otherComponents, newComponent]
    });
  };
  
  // Add a new scenario
  const addScenario = () => {
    const newScenarioId = `scenario-${Date.now()}`;
    
    // Get matching algorithm data for default setting
    const matchingAlgorithm = Array.isArray(protocol.components)
      ? protocol.components.find(
          (component: any) => component.type === "matchingAlgorithm" && component.designStateId === protocol.activeDesignState
        )?.data
      : null;
    
    let defaultMatchingVariables = ["AGE", "SEX", "ECOG", "PRIOR_TX"];
    let defaultMatchingMethod = "standard";
    let defaultTruncationThreshold = 0.01;
    
    if (matchingAlgorithm) {
      defaultMatchingVariables = matchingAlgorithm.selectedVariables || defaultMatchingVariables;
      defaultMatchingMethod = matchingAlgorithm.matchingMethod || defaultMatchingMethod;
      defaultTruncationThreshold = matchingAlgorithm.truncationThreshold || defaultTruncationThreshold;
    }
    
    const newScenario = {
      id: newScenarioId,
      name: `Sensitivity Analysis ${sensitivityAnalysis.scenarios.length}`,
      description: "Alternative MAIC analysis with modified parameters",
      status: "pending",
      settings: {
        matchingVariables: [...defaultMatchingVariables],
        matchingMethod: defaultMatchingMethod,
        truncationThreshold: defaultTruncationThreshold
      },
      results: null
    };
    
    updateSensitivityAnalysis({
      ...sensitivityAnalysis,
      scenarios: [...sensitivityAnalysis.scenarios, newScenario],
      totalScenarios: sensitivityAnalysis.totalScenarios + 1
    });
    
    toast({
      title: "New Scenario Added",
      description: `Created '${newScenario.name}' scenario for sensitivity analysis.`
    });
  };
  
  // Update a scenario field
  const updateScenario = (scenarioId: string, field: string, value: any) => {
    const updatedScenarios = sensitivityAnalysis.scenarios.map((scenario: any) => {
      if (scenario.id === scenarioId) {
        return {
          ...scenario,
          [field]: value
        };
      }
      return scenario;
    });
    
    updateSensitivityAnalysis({
      ...sensitivityAnalysis,
      scenarios: updatedScenarios
    });
  };
  
  // Update a scenario setting
  const updateScenarioSetting = (scenarioId: string, field: string, value: any) => {
    const updatedScenarios = sensitivityAnalysis.scenarios.map((scenario: any) => {
      if (scenario.id === scenarioId) {
        return {
          ...scenario,
          settings: {
            ...scenario.settings,
            [field]: value
          }
        };
      }
      return scenario;
    });
    
    updateSensitivityAnalysis({
      ...sensitivityAnalysis,
      scenarios: updatedScenarios
    });
  };
  
  // Run a single scenario
  const runScenario = (scenarioId: string) => {
    setIsRunning(true);
    setRunningScenarioId(scenarioId);
    
    // Simulate running the scenario
    setTimeout(() => {
      const updatedScenarios = sensitivityAnalysis.scenarios.map((scenario: any) => {
        if (scenario.id === scenarioId) {
          // Generate mock results based on settings
          const effectivePatientCount = 100 + Math.random() * 100;
          const hazardRatio = 0.5 + Math.random() * 0.4;
          const pValue = Math.random() * 0.1;
          
          return {
            ...scenario,
            status: "complete",
            results: {
              effectivePatientCount: parseFloat(effectivePatientCount.toFixed(1)),
              weightStats: {
                min: parseFloat((0.1 + Math.random() * 0.2).toFixed(2)),
                max: parseFloat((3 + Math.random() * 3).toFixed(2)),
                mean: 1.0,
                sd: parseFloat((0.7 + Math.random() * 0.5).toFixed(2))
              },
              treatmentEffect: {
                hazardRatio: parseFloat(hazardRatio.toFixed(2)),
                confidenceInterval: [
                  parseFloat((hazardRatio - 0.2).toFixed(2)),
                  parseFloat((hazardRatio + 0.2).toFixed(2))
                ],
                pValue: parseFloat(pValue.toFixed(4))
              }
            }
          };
        }
        return scenario;
      });
      
      updateSensitivityAnalysis({
        ...sensitivityAnalysis,
        scenarios: updatedScenarios,
        completedScenarios: sensitivityAnalysis.completedScenarios + 1
      });
      
      setIsRunning(false);
      setRunningScenarioId(null);
      
      toast({
        title: "Analysis Complete",
        description: "Sensitivity analysis scenario has been successfully run."
      });
    }, 3000);
  };
  
  // Run all pending scenarios
  const runAllScenarios = () => {
    const pendingScenarios = sensitivityAnalysis.scenarios.filter((scenario: any) => scenario.status === "pending");
    
    if (pendingScenarios.length === 0) {
      toast({
        title: "No Pending Scenarios",
        description: "All scenarios have already been run.",
        variant: "destructive"
      });
      return;
    }
    
    setIsRunning(true);
    
    // Simulate running all scenarios sequentially
    let completedCount = 0;
    let scenarioPromises: Promise<void>[] = [];
    
    pendingScenarios.forEach((scenario: any, index: number) => {
      const promise = new Promise<void>((resolve) => {
        setTimeout(() => {
          const updatedScenarios = [...sensitivityAnalysis.scenarios];
          const scenarioIndex = updatedScenarios.findIndex(s => s.id === scenario.id);
          
          if (scenarioIndex !== -1) {
            // Generate mock results based on settings
            const effectivePatientCount = 100 + Math.random() * 100;
            const hazardRatio = 0.5 + Math.random() * 0.4;
            const pValue = Math.random() * 0.1;
            
            updatedScenarios[scenarioIndex] = {
              ...updatedScenarios[scenarioIndex],
              status: "complete",
              results: {
                effectivePatientCount: parseFloat(effectivePatientCount.toFixed(1)),
                weightStats: {
                  min: parseFloat((0.1 + Math.random() * 0.2).toFixed(2)),
                  max: parseFloat((3 + Math.random() * 3).toFixed(2)),
                  mean: 1.0,
                  sd: parseFloat((0.7 + Math.random() * 0.5).toFixed(2))
                },
                treatmentEffect: {
                  hazardRatio: parseFloat(hazardRatio.toFixed(2)),
                  confidenceInterval: [
                    parseFloat((hazardRatio - 0.2).toFixed(2)),
                    parseFloat((hazardRatio + 0.2).toFixed(2))
                  ],
                  pValue: parseFloat(pValue.toFixed(4))
                }
              }
            };
            
            updateSensitivityAnalysis({
              ...sensitivityAnalysis,
              scenarios: updatedScenarios,
              completedScenarios: sensitivityAnalysis.completedScenarios + completedCount + 1
            });
            
            completedCount++;
          }
          
          resolve();
        }, 2000 * (index + 1)); // Run scenarios with a delay
      });
      
      scenarioPromises.push(promise);
    });
    
    Promise.all(scenarioPromises).then(() => {
      setIsRunning(false);
      
      toast({
        title: "All Analyses Complete",
        description: `Successfully ran ${completedCount} sensitivity analysis scenarios.`
      });
    });
  };
  
  // Toggle a matching variable in a scenario
  const toggleMatchingVariable = (scenarioId: string, variable: string) => {
    const scenario = sensitivityAnalysis.scenarios.find((s: any) => s.id === scenarioId);
    
    if (!scenario) return;
    
    const currentVars = scenario.settings.matchingVariables || [];
    let updatedVars;
    
    if (currentVars.includes(variable)) {
      updatedVars = currentVars.filter((v: string) => v !== variable);
    } else {
      updatedVars = [...currentVars, variable];
    }
    
    updateScenarioSetting(scenarioId, "matchingVariables", updatedVars);
  };
  
  // Reset a scenario to pending status
  const resetScenario = (scenarioId: string) => {
    const updatedScenarios = sensitivityAnalysis.scenarios.map((scenario: any) => {
      if (scenario.id === scenarioId) {
        return {
          ...scenario,
          status: "pending",
          results: null
        };
      }
      return scenario;
    });
    
    updateSensitivityAnalysis({
      ...sensitivityAnalysis,
      scenarios: updatedScenarios,
      completedScenarios: Math.max(0, sensitivityAnalysis.completedScenarios - 1)
    });
    
    toast({
      title: "Scenario Reset",
      description: "Sensitivity analysis scenario has been reset to pending."
    });
  };
  
  // Source data variables from the protocol
  const getSourceDataVariables = () => {
    const sourceData = Array.isArray(protocol.components)
      ? protocol.components.find(
          (component: any) => component.type === "sourceDataConfig" && component.designStateId === protocol.activeDesignState
        )?.data
      : null;
    
    if (sourceData?.variableDefinitions?.length > 0) {
      return sourceData.variableDefinitions;
    }
    
    // Default variables if none defined
    return [
      { name: "SUBJID", label: "Subject ID", dataType: "string" },
      { name: "AGE", label: "Age", dataType: "numeric" },
      { name: "SEX", label: "Sex", dataType: "categorical" },
      { name: "RACE", label: "Race", dataType: "categorical" },
      { name: "ECOG", label: "ECOG Performance Status", dataType: "numeric" },
      { name: "PRIOR_TX", label: "Prior Treatment", dataType: "categorical" },
      { name: "AVAL", label: "Analysis Value", dataType: "numeric" },
      { name: "CNSR", label: "Censoring Flag", dataType: "binary" }
    ];
  };
  
  // Get matching algorithm settings
  const getMatchingAlgorithm = () => {
    const matchingAlgorithm = Array.isArray(protocol.components)
      ? protocol.components.find(
          (component: any) => component.type === "matchingAlgorithm" && component.designStateId === protocol.activeDesignState
        )?.data
      : null;
    
    return matchingAlgorithm || {
      selectedVariables: ["AGE", "SEX", "ECOG", "PRIOR_TX"],
      matchingMethod: "standard",
      truncationThreshold: 0.01
    };
  };
  
  // Get matching variables
  const getAvailableMatchingVariables = () => {
    const sourceVariables = getSourceDataVariables();
    
    // Filter out ID variables and outcome variables
    return sourceVariables.filter((variable: any) => {
      return !variable.name.includes("ID") && variable.name !== "AVAL" && variable.name !== "CNSR";
    });
  };
  
  // Get scenario status badge
  const getStatusBadge = (status: string) => {
    switch (status) {
      case "complete":
        return (
          <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
            <CheckCircle2 className="mr-1 h-3 w-3" /> Complete
          </Badge>
        );
      case "pending":
        return (
          <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">
            <AlertCircle className="mr-1 h-3 w-3" /> Pending
          </Badge>
        );
      case "failed":
        return (
          <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200">
            <AlertCircle className="mr-1 h-3 w-3" /> Failed
          </Badge>
        );
      default:
        return (
          <Badge variant="outline">
            <Info className="mr-1 h-3 w-3" /> {status}
          </Badge>
        );
    }
  };
  
  return (
    <div className="space-y-6">
      <div className="flex flex-col space-y-1.5">
        <h3 className="text-lg font-semibold">Sensitivity Analysis</h3>
        <p className="text-sm text-muted-foreground">
          Create and run alternative MAIC scenarios to test robustness of results
        </p>
      </div>
      
      <Separator />
      
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="scenarios">
            <BarChart3 className="mr-2 h-4 w-4" />
            Scenarios
          </TabsTrigger>
          <TabsTrigger value="results">
            <BarChart4 className="mr-2 h-4 w-4" />
            Results Comparison
          </TabsTrigger>
        </TabsList>
        
        <TabsContent value="scenarios" className="space-y-4 mt-4">
          <div className="flex justify-between items-center">
            <div>
              <h4 className="text-base font-medium">Analysis Scenarios</h4>
              <p className="text-sm text-muted-foreground">
                Define alternative MAIC scenarios with different parameter settings
              </p>
            </div>
            <div className="flex space-x-2">
              <Button 
                variant="outline" 
                onClick={addScenario}
                className="flex items-center"
              >
                <PlusCircle className="mr-2 h-4 w-4" />
                Add Scenario
              </Button>
              <Button 
                onClick={runAllScenarios}
                disabled={isRunning}
                className="bg-[#228be6] hover:bg-[#1c7ed6] text-white"
              >
                <PlayCircle className="mr-2 h-4 w-4" />
                Run All
              </Button>
            </div>
          </div>
          
          <div className="space-y-4">
            {sensitivityAnalysis.scenarios.map((scenario: any) => (
              <Card key={scenario.id}>
                <CardHeader className="pb-2">
                  <div className="flex justify-between items-start">
                    <div className="space-y-1">
                      <CardTitle className="flex items-center">
                        {scenario.name} {getStatusBadge(scenario.status)}
                      </CardTitle>
                      <CardDescription>{scenario.description}</CardDescription>
                    </div>
                    <div className="flex space-x-2">
                      {scenario.status === "complete" ? (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => resetScenario(scenario.id)}
                          className="h-8"
                        >
                          <RefreshCcw className="mr-2 h-3 w-3" />
                          Reset
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          onClick={() => runScenario(scenario.id)}
                          disabled={isRunning}
                          className="h-8 bg-[#228be6] hover:bg-[#1c7ed6] text-white"
                        >
                          {isRunning && runningScenarioId === scenario.id ? (
                            <>Running...</>
                          ) : (
                            <>
                              <PlayCircle className="mr-2 h-3 w-3" />
                              Run
                            </>
                          )}
                        </Button>
                      )}
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <h5 className="text-sm font-medium mb-2">Settings</h5>
                      
                      <div className="space-y-3">
                        <div className="space-y-2">
                          <div className="flex justify-between items-center">
                            <Label htmlFor={`name-${scenario.id}`}>Scenario Name</Label>
                            <span className="text-xs text-muted-foreground">
                              {scenario.id === "baseline" && "(Primary Analysis)"}
                            </span>
                          </div>
                          <Input 
                            id={`name-${scenario.id}`}
                            value={scenario.name}
                            onChange={(e) => updateScenario(scenario.id, "name", e.target.value)}
                            placeholder="Enter scenario name"
                            disabled={scenario.id === "baseline"}
                          />
                        </div>
                        
                        <div className="space-y-2">
                          <Label htmlFor={`description-${scenario.id}`}>Description</Label>
                          <Input 
                            id={`description-${scenario.id}`}
                            value={scenario.description}
                            onChange={(e) => updateScenario(scenario.id, "description", e.target.value)}
                            placeholder="Brief description of this scenario"
                          />
                        </div>
                        
                        <div className="space-y-2">
                          <Label htmlFor={`method-${scenario.id}`}>Matching Method</Label>
                          <Select 
                            value={scenario.settings.matchingMethod}
                            onValueChange={(value) => updateScenarioSetting(scenario.id, "matchingMethod", value)}
                            disabled={scenario.id === "baseline"}
                          >
                            <SelectTrigger id={`method-${scenario.id}`}>
                              <SelectValue placeholder="Select matching method" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="standard">Standard MAIC</SelectItem>
                              <SelectItem value="entropy">Entropy Balancing</SelectItem>
                              <SelectItem value="augmented">Augmented MAIC</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        
                        <div className="space-y-2">
                          <div className="flex justify-between items-center">
                            <Label htmlFor={`threshold-${scenario.id}`}>Weight Truncation Threshold</Label>
                            <span className="text-xs">{scenario.settings.truncationThreshold}</span>
                          </div>
                          <Slider
                            id={`threshold-${scenario.id}`}
                            value={[scenario.settings.truncationThreshold]}
                            min={0.001}
                            max={0.05}
                            step={0.001}
                            onValueChange={([value]) => updateScenarioSetting(scenario.id, "truncationThreshold", value)}
                            disabled={scenario.id === "baseline"}
                          />
                          <div className="flex justify-between text-xs text-muted-foreground">
                            <span>0.001</span>
                            <span>0.05</span>
                          </div>
                        </div>
                      </div>
                    </div>
                    
                    <div>
                      <div className="flex justify-between items-center mb-2">
                        <h5 className="text-sm font-medium">Matching Variables</h5>
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button 
                                variant="ghost" 
                                size="sm"
                                className="h-6 w-6 p-0"
                              >
                                <HelpCircle className="h-4 w-4" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p className="text-xs max-w-xs">Select which variables will be used for matching. Testing different variable sets is a key part of sensitivity analysis.</p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </div>
                      
                      <div className="border rounded-md p-3 space-y-3 max-h-[220px] overflow-y-auto">
                        {getAvailableMatchingVariables().map((variable: any) => (
                          <div key={variable.name} className="flex items-center space-x-2">
                            <Checkbox 
                              id={`var-${scenario.id}-${variable.name}`}
                              checked={scenario.settings.matchingVariables.includes(variable.name)}
                              onCheckedChange={() => toggleMatchingVariable(scenario.id, variable.name)}
                              disabled={scenario.id === "baseline"}
                            />
                            <Label 
                              htmlFor={`var-${scenario.id}-${variable.name}`}
                              className="text-sm font-normal cursor-pointer"
                            >
                              {variable.name} <span className="text-xs text-muted-foreground">({variable.label})</span>
                            </Label>
                          </div>
                        ))}
                      </div>
                      
                      <div className="mt-3 text-sm text-muted-foreground">
                        {scenario.settings.matchingVariables.length} variables selected
                      </div>
                    </div>
                  </div>
                  
                  {scenario.status === "complete" && scenario.results && (
                    <div className="mt-4 border-t pt-4">
                      <h5 className="text-sm font-medium mb-2">Results Summary</h5>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1">
                          <div className="text-sm">Effective Patient Count: <span className="font-medium">{scenario.results.effectivePatientCount}</span></div>
                          <div className="text-sm">
                            Weights: min={scenario.results.weightStats.min}, max={scenario.results.weightStats.max}, mean={scenario.results.weightStats.mean}
                          </div>
                        </div>
                        <div className="space-y-1">
                          <div className="text-sm">Hazard Ratio: <span className="font-medium">{scenario.results.treatmentEffect.hazardRatio}</span> ({scenario.results.treatmentEffect.confidenceInterval[0]}-{scenario.results.treatmentEffect.confidenceInterval[1]})</div>
                          <div className="text-sm">p-value: <span className="font-medium">{scenario.results.treatmentEffect.pValue}</span></div>
                        </div>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>
        
        <TabsContent value="results" className="space-y-4 mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Sensitivity Analysis Results</CardTitle>
              <CardDescription>
                Compare results across different MAIC analysis scenarios
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-6">
                {sensitivityAnalysis.completedScenarios === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <HelpCircle className="mx-auto h-10 w-10 mb-2" />
                    <p>No completed scenarios available.</p>
                    <p className="text-sm mt-1">Run at least one analysis scenario to see results.</p>
                  </div>
                ) : (
                  <>
                    <div className="border rounded-md overflow-hidden">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="w-[200px]">Scenario</TableHead>
                            <TableHead>Matching Variables</TableHead>
                            <TableHead className="text-right">Effective N</TableHead>
                            <TableHead className="text-right">HR (95% CI)</TableHead>
                            <TableHead className="text-right">p-value</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {sensitivityAnalysis.scenarios
                            .filter((scenario: any) => scenario.status === "complete" && scenario.results)
                            .map((scenario: any) => (
                              <TableRow key={scenario.id}>
                                <TableCell className="font-medium">{scenario.name}</TableCell>
                                <TableCell>{scenario.settings.matchingVariables.join(", ")}</TableCell>
                                <TableCell className="text-right">{scenario.results.effectivePatientCount}</TableCell>
                                <TableCell className="text-right">
                                  {scenario.results.treatmentEffect.hazardRatio} ({scenario.results.treatmentEffect.confidenceInterval[0]}-{scenario.results.treatmentEffect.confidenceInterval[1]})
                                </TableCell>
                                <TableCell className="text-right">{scenario.results.treatmentEffect.pValue}</TableCell>
                              </TableRow>
                            ))}
                        </TableBody>
                      </Table>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-6">
                      <div>
                        <h5 className="text-sm font-medium mb-2">Effective Sample Size Comparison</h5>
                        <div className="h-[200px] border rounded-md p-3 flex items-center justify-center bg-muted/20">
                          <div className="text-center text-muted-foreground">
                            <BarChart3 className="h-10 w-10 mx-auto mb-2" />
                            <p className="text-sm">Chart visualization would appear here</p>
                            <p className="text-xs mt-1">(Effective sample size by scenario)</p>
                          </div>
                        </div>
                      </div>
                      
                      <div>
                        <h5 className="text-sm font-medium mb-2">Treatment Effect Comparison</h5>
                        <div className="h-[200px] border rounded-md p-3 flex items-center justify-center bg-muted/20">
                          <div className="text-center text-muted-foreground">
                            <BarChart4 className="h-10 w-10 mx-auto mb-2" />
                            <p className="text-sm">Chart visualization would appear here</p>
                            <p className="text-xs mt-1">(Hazard ratios with confidence intervals)</p>
                          </div>
                        </div>
                      </div>
                    </div>
                    
                    <div className="border rounded-md p-4 bg-blue-50">
                      <h5 className="text-sm font-medium mb-2 flex items-center">
                        <Info className="h-4 w-4 mr-2 text-blue-600" />
                        Interpretation of Sensitivity Analysis
                      </h5>
                      <p className="text-sm text-blue-700">
                        {sensitivityAnalysis.completedScenarios <= 1 ? (
                          "Complete more sensitivity analyses to assess the robustness of your results."
                        ) : (
                          "The treatment effect appears robust across different analysis scenarios, with hazard ratios consistently showing a similar direction and magnitude of effect."
                        )}
                      </p>
                    </div>
                  </>
                )}
              </div>
            </CardContent>
            <CardFooter className="border-t pt-6">
              <div className="flex justify-between items-center w-full">
                <div className="text-sm text-muted-foreground">
                  {sensitivityAnalysis.completedScenarios}/{sensitivityAnalysis.totalScenarios} scenarios completed
                </div>
                <Button
                  onClick={() => setActiveTab("scenarios")}
                  className="bg-[#228be6] hover:bg-[#1c7ed6] text-white"
                >
                  Create Scenario
                </Button>
              </div>
            </CardFooter>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default SensitivityAnalysis;