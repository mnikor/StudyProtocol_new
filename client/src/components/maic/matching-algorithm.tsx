import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Slider } from "@/components/ui/slider";
import { Plus, Trash2, GripVertical, InfoIcon, CheckCircle2, AlertCircle } from "lucide-react";
import { Separator } from "@/components/ui/separator";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";

interface MatchingAlgorithmProps {
  protocol: any;
  setProtocol: (protocol: any) => void;
}

export function MatchingAlgorithm({ protocol, setProtocol }: MatchingAlgorithmProps) {
  const { toast } = useToast();
  const [runningAlgorithm, setRunningAlgorithm] = useState(false);
  
  // Get source data and target study components to display variable options
  const sourceDataComponent = Array.isArray(protocol.components) 
    ? protocol.components.find(
        (component: any) => component.type === "sourceDataConfig" && component.designStateId === protocol.activeDesignState
      )
    : null;
  
  const sourceData = sourceDataComponent?.data || null;
  
  const targetStudyComponent = Array.isArray(protocol.components)
    ? protocol.components.find(
        (component: any) => component.type === "targetStudyData" && component.designStateId === protocol.activeDesignState
      )
    : null;
  
  const targetStudy = targetStudyComponent?.data || null;
  
  // Get matching variables component or initialize if not exists
  const matchingComponent = Array.isArray(protocol.components)
    ? protocol.components.find(
        (component: any) => component.type === "matchingVariables" && component.designStateId === protocol.activeDesignState
      )
    : null;
  
  const matchingData = matchingComponent?.data || {
    baselineCharacteristics: [
      {
        id: "var-" + Math.random().toString(36).substr(2, 9),
        variable: "Age",
        importance: "critical",
        sourceDataMapping: "AGE",
        targetValue: targetStudy?.baselineCharacteristics?.find((c: any) => c.variable === "Age")?.value || "",
        transformationNeeded: false,
        transformation: ""
      },
      {
        id: "var-" + Math.random().toString(36).substr(2, 9),
        variable: "Gender",
        importance: "important",
        sourceDataMapping: "SEX",
        targetValue: targetStudy?.baselineCharacteristics?.find((c: any) => c.variable === "Gender (% male)")?.value || "",
        transformationNeeded: false,
        transformation: ""
      }
    ],
    effectModifiers: [],
    weightingApproach: "entropy_balancing"
  };
  
  // Get matching algorithm component or initialize if not exists
  const algorithmComponent = Array.isArray(protocol.components) 
    ? protocol.components.find(
        (component: any) => component.type === "matchingAlgorithm" && component.designStateId === protocol.activeDesignState
      )
    : null;
  
  const algorithmData = algorithmComponent?.data || {
    method: "entropy_balancing",
    parameters: {
      convergenceCriteria: 0.001,
      maxIterations: 1000,
      tolerance: 0.1,
      weightConstraints: {
        minWeight: 0,
        maxWeight: null
      }
    },
    diagnostics: {
      balanceMetrics: ["standardized_mean_difference", "effective_sample_size"],
      acceptableThreshold: 0.1
    },
    results: null
  };
  
  // Update the matching variables in the protocol
  const updateMatchingVariables = (updatedData: any) => {
    // Make a deep copy to avoid reference issues
    const newData = JSON.parse(JSON.stringify(updatedData));
    
    // Get all components except the current matchingVariables if it exists
    const otherComponents = Array.isArray(protocol.components)
      ? protocol.components.filter(
          (component: any) => !(component.type === "matchingVariables" && component.designStateId === protocol.activeDesignState)
        )
      : [];
    
    // Create a new component
    const newComponent = {
      type: "matchingVariables",
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
  
  // Update the matching algorithm in the protocol
  const updateMatchingAlgorithm = (updatedData: any) => {
    // Make a deep copy to avoid reference issues
    const newData = JSON.parse(JSON.stringify(updatedData));
    
    // Get all components except the current matchingAlgorithm if it exists
    const otherComponents = Array.isArray(protocol.components)
      ? protocol.components.filter(
          (component: any) => !(component.type === "matchingAlgorithm" && component.designStateId === protocol.activeDesignState)
        )
      : [];
    
    // Create a new component
    const newComponent = {
      type: "matchingAlgorithm",
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
  
  // Add a new matching variable
  const addMatchingVariable = () => {
    const newVar = {
      id: "var-" + Math.random().toString(36).substr(2, 9),
      variable: "",
      importance: "important",
      sourceDataMapping: "",
      targetValue: "",
      transformationNeeded: false,
      transformation: ""
    };
    
    updateMatchingVariables({
      ...matchingData,
      baselineCharacteristics: [...matchingData.baselineCharacteristics, newVar]
    });
  };
  
  // Remove a matching variable
  const removeMatchingVariable = (id: string) => {
    if (matchingData.baselineCharacteristics.length <= 1) {
      toast({
        title: "Cannot Remove Variable",
        description: "At least one matching variable is required.",
        variant: "destructive"
      });
      return;
    }
    
    updateMatchingVariables({
      ...matchingData,
      baselineCharacteristics: matchingData.baselineCharacteristics.filter((v: any) => v.id !== id)
    });
  };
  
  // Update a matching variable field
  const updateVariableField = (varId: string, field: string, value: any) => {
    updateMatchingVariables({
      ...matchingData,
      baselineCharacteristics: matchingData.baselineCharacteristics.map((v: any) => 
        v.id === varId ? { ...v, [field]: value } : v
      )
    });
  };
  
  // Update a field in the algorithm data
  const updateAlgorithmField = (path: string[], value: any) => {
    const newData = { ...algorithmData };
    let current = newData;
    
    // Navigate to the nested object
    for (let i = 0; i < path.length - 1; i++) {
      current = current[path[i]];
    }
    
    // Update the field
    current[path[path.length - 1]] = value;
    
    updateMatchingAlgorithm(newData);
  };
  
  // Toggle a balance metric
  const toggleBalanceMetric = (metric: string) => {
    const currentMetrics = algorithmData.diagnostics.balanceMetrics;
    
    if (currentMetrics.includes(metric)) {
      updateAlgorithmField(
        ['diagnostics', 'balanceMetrics'], 
        currentMetrics.filter((m: string) => m !== metric)
      );
    } else {
      updateAlgorithmField(
        ['diagnostics', 'balanceMetrics'], 
        [...currentMetrics, metric]
      );
    }
  };
  
  // Run the matching algorithm (mock implementation)
  const runMatchingAlgorithm = () => {
    if (!sourceData || !targetStudy) {
      toast({
        title: "Missing Data",
        description: "Please complete both source data and target study sections first.",
        variant: "destructive"
      });
      return;
    }
    
    setRunningAlgorithm(true);
    
    // Simulate algorithm running
    setTimeout(() => {
      // Generate mock results
      const mockResults = {
        status: "complete",
        effectiveSampleSize: Math.floor(sourceData.datasetSize * 0.75),
        originalSampleSize: sourceData.datasetSize,
        date: new Date().toISOString(),
        balanceAchieved: true,
        balanceMetrics: {
          preMatching: {
            standardizedMeanDifferences: {
              Age: 0.62,
              Gender: 0.45,
              "Disease Duration": 0.38
            },
            varianceRatios: {
              Age: 1.3,
              Gender: 1.1,
              "Disease Duration": 1.2
            }
          },
          postMatching: {
            standardizedMeanDifferences: {
              Age: 0.08,
              Gender: 0.06,
              "Disease Duration": 0.09
            },
            varianceRatios: {
              Age: 1.05,
              Gender: 1.02,
              "Disease Duration": 1.04
            }
          }
        },
        weightSummary: {
          min: 0.1,
          max: 3.2,
          mean: 1.0,
          median: 0.9,
          skewness: 0.3
        }
      };
      
      updateMatchingAlgorithm({
        ...algorithmData,
        results: mockResults
      });
      
      setRunningAlgorithm(false);
      
      toast({
        title: "Matching Algorithm Complete",
        description: "The matching and weighting algorithm has been applied successfully.",
        variant: "default"
      });
    }, 3000);
  };
  
  return (
    <div className="space-y-6">
      <div className="flex flex-col space-y-1.5">
        <h3 className="text-lg font-semibold">Matching Algorithm Configuration</h3>
        <p className="text-sm text-muted-foreground">
          Configure the matching algorithm and variables for the MAIC analysis
        </p>
      </div>
      
      <Separator />
      
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Matching Variables</CardTitle>
              <CardDescription>
                Define the baseline characteristics to match between source and target data
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[180px]">Variable</TableHead>
                    <TableHead className="w-[130px]">Importance</TableHead>
                    <TableHead>Source Data Field</TableHead>
                    <TableHead>Target Value</TableHead>
                    <TableHead className="w-[80px]">Transform</TableHead>
                    <TableHead className="w-[50px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {matchingData.baselineCharacteristics.map((variable: any) => (
                    <TableRow key={variable.id}>
                      <TableCell>
                        <Input 
                          value={variable.variable}
                          onChange={(e) => updateVariableField(variable.id, "variable", e.target.value)}
                          placeholder="e.g., Age"
                        />
                      </TableCell>
                      <TableCell>
                        <Select 
                          value={variable.importance} 
                          onValueChange={(value) => updateVariableField(variable.id, "importance", value)}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Importance" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="critical">Critical</SelectItem>
                            <SelectItem value="important">Important</SelectItem>
                            <SelectItem value="helpful">Helpful</SelectItem>
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell>
                        <Input 
                          value={variable.sourceDataMapping}
                          onChange={(e) => updateVariableField(variable.id, "sourceDataMapping", e.target.value)}
                          placeholder="Field name in source"
                        />
                      </TableCell>
                      <TableCell>
                        <Input 
                          value={variable.targetValue}
                          onChange={(e) => updateVariableField(variable.id, "targetValue", e.target.value)}
                          placeholder="Value from target"
                        />
                      </TableCell>
                      <TableCell className="text-center">
                        <Checkbox 
                          checked={variable.transformationNeeded}
                          onCheckedChange={(checked) => {
                            updateVariableField(variable.id, "transformationNeeded", !!checked);
                            if (!checked) updateVariableField(variable.id, "transformation", "");
                          }}
                        />
                      </TableCell>
                      <TableCell>
                        <Button 
                          variant="ghost" 
                          size="sm"
                          onClick={() => removeMatchingVariable(variable.id)}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              
              {/* Transformations for variables that need them */}
              {matchingData.baselineCharacteristics.some((v: any) => v.transformationNeeded) && (
                <div className="mt-4 space-y-4">
                  <h4 className="text-sm font-medium">Variable Transformations</h4>
                  {matchingData.baselineCharacteristics
                    .filter((v: any) => v.transformationNeeded)
                    .map((variable: any) => (
                      <div key={`transform-${variable.id}`} className="space-y-2 border-b pb-3 last:border-0">
                        <div className="flex items-center">
                          <span className="font-medium text-sm mr-2">{variable.variable}</span>
                          <Badge variant="outline" className="ml-auto">Transformation</Badge>
                        </div>
                        <Textarea 
                          value={variable.transformation}
                          onChange={(e) => updateVariableField(variable.id, "transformation", e.target.value)}
                          placeholder={`Describe how ${variable.variable} should be transformed to match the target population...`}
                          rows={2}
                        />
                      </div>
                    ))
                  }
                </div>
              )}
              
              <div className="mt-4">
                <Button variant="outline" size="sm" onClick={addMatchingVariable}>
                  <Plus className="mr-2 h-4 w-4" />
                  Add Matching Variable
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
        
        <div>
          <Card>
            <CardHeader>
              <CardTitle>Weighting Approach</CardTitle>
              <CardDescription>
                Select the method for calculating weights
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="weightingMethod">Weighting Method</Label>
                  <Select 
                    value={matchingData.weightingApproach} 
                    onValueChange={(value) => {
                      updateMatchingVariables({
                        ...matchingData,
                        weightingApproach: value
                      });
                      updateAlgorithmField(['method'], value);
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select weighting method" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="entropy_balancing">Entropy Balancing</SelectItem>
                      <SelectItem value="propensity_score">Propensity Score</SelectItem>
                      <SelectItem value="method_of_moments">Method of Moments</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                
                <TooltipProvider>
                  <div className="border p-3 rounded-md bg-muted/50">
                    <div className="flex items-center mb-2">
                      <h4 className="text-sm font-medium">Method Description</h4>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button variant="ghost" size="sm" className="h-6 w-6 p-0 ml-1">
                            <InfoIcon className="h-4 w-4" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p className="max-w-xs">Information about the selected weighting method</p>
                        </TooltipContent>
                      </Tooltip>
                    </div>
                    <p className="text-xs">
                      {matchingData.weightingApproach === "entropy_balancing" && (
                        "Entropy balancing directly calculates weights to match moments of covariates while minimizing the entropy distance."
                      )}
                      {matchingData.weightingApproach === "propensity_score" && (
                        "Propensity score weighting estimates the probability of being in the target population and uses the inverse of this score as weights."
                      )}
                      {matchingData.weightingApproach === "method_of_moments" && (
                        "Method of moments directly solves for weights that match the moments (mean, variance) of covariates between populations."
                      )}
                    </p>
                  </div>
                </TooltipProvider>
              </div>
            </CardContent>
          </Card>
          
          <Card className="mt-6">
            <CardHeader>
              <CardTitle>Algorithm Parameters</CardTitle>
              <CardDescription>
                Fine-tune the matching algorithm settings
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="convergence">Convergence Criteria</Label>
                    <span className="text-xs text-muted-foreground">{algorithmData.parameters.convergenceCriteria}</span>
                  </div>
                  <Slider 
                    id="convergence"
                    min={0.0001}
                    max={0.01}
                    step={0.0001}
                    value={[algorithmData.parameters.convergenceCriteria]}
                    onValueChange={(value) => updateAlgorithmField(['parameters', 'convergenceCriteria'], value[0])}
                  />
                </div>
                
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="iterations">Maximum Iterations</Label>
                    <span className="text-xs text-muted-foreground">{algorithmData.parameters.maxIterations}</span>
                  </div>
                  <Slider 
                    id="iterations"
                    min={100}
                    max={10000}
                    step={100}
                    value={[algorithmData.parameters.maxIterations]}
                    onValueChange={(value) => updateAlgorithmField(['parameters', 'maxIterations'], value[0])}
                  />
                </div>
                
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="tolerance">Balance Tolerance</Label>
                    <span className="text-xs text-muted-foreground">{algorithmData.parameters.tolerance}</span>
                  </div>
                  <Slider 
                    id="tolerance"
                    min={0.01}
                    max={0.2}
                    step={0.01}
                    value={[algorithmData.parameters.tolerance]}
                    onValueChange={(value) => updateAlgorithmField(['parameters', 'tolerance'], value[0])}
                  />
                </div>
                
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="minWeight">Minimum Weight</Label>
                    <Input 
                      id="minWeight"
                      type="number"
                      className="w-20 text-right"
                      min={0}
                      step={0.1}
                      value={algorithmData.parameters.weightConstraints.minWeight || ""}
                      onChange={(e) => updateAlgorithmField(
                        ['parameters', 'weightConstraints', 'minWeight'], 
                        e.target.value === "" ? null : parseFloat(e.target.value)
                      )}
                    />
                  </div>
                </div>
                
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="maxWeight">Maximum Weight</Label>
                    <Input 
                      id="maxWeight"
                      type="number"
                      className="w-20 text-right"
                      min={0}
                      step={0.1}
                      value={algorithmData.parameters.weightConstraints.maxWeight || ""}
                      onChange={(e) => updateAlgorithmField(
                        ['parameters', 'weightConstraints', 'maxWeight'], 
                        e.target.value === "" ? null : parseFloat(e.target.value)
                      )}
                    />
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
          
          <Card className="mt-6">
            <CardHeader>
              <CardTitle>Diagnostic Metrics</CardTitle>
              <CardDescription>
                Select metrics to assess balance quality
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div className="flex items-center space-x-2">
                  <Checkbox 
                    id="metric-smd"
                    checked={algorithmData.diagnostics.balanceMetrics.includes("standardized_mean_difference")}
                    onCheckedChange={() => toggleBalanceMetric("standardized_mean_difference")}
                  />
                  <Label htmlFor="metric-smd">Standardized Mean Difference</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox 
                    id="metric-vr"
                    checked={algorithmData.diagnostics.balanceMetrics.includes("variance_ratio")}
                    onCheckedChange={() => toggleBalanceMetric("variance_ratio")}
                  />
                  <Label htmlFor="metric-vr">Variance Ratio</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox 
                    id="metric-ks"
                    checked={algorithmData.diagnostics.balanceMetrics.includes("kolmogorov_smirnov")}
                    onCheckedChange={() => toggleBalanceMetric("kolmogorov_smirnov")}
                  />
                  <Label htmlFor="metric-ks">Kolmogorov-Smirnov Test</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox 
                    id="metric-ess"
                    checked={algorithmData.diagnostics.balanceMetrics.includes("effective_sample_size")}
                    onCheckedChange={() => toggleBalanceMetric("effective_sample_size")}
                  />
                  <Label htmlFor="metric-ess">Effective Sample Size</Label>
                </div>
                
                <div className="space-y-2 pt-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="threshold">Acceptable Threshold (SMD)</Label>
                    <span className="text-xs text-muted-foreground">{algorithmData.diagnostics.acceptableThreshold}</span>
                  </div>
                  <Slider 
                    id="threshold"
                    min={0.05}
                    max={0.2}
                    step={0.01}
                    value={[algorithmData.diagnostics.acceptableThreshold]}
                    onValueChange={(value) => updateAlgorithmField(['diagnostics', 'acceptableThreshold'], value[0])}
                  />
                  <p className="text-xs text-muted-foreground">
                    Commonly used threshold is 0.1 (10%) for standardized mean differences
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
      
      {/* Results section (only shown after running the algorithm) */}
      {algorithmData.results && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <CheckCircle2 className="text-green-500 mr-2 h-5 w-5" />
              Matching Algorithm Results
            </CardTitle>
            <CardDescription>
              Results from applying the matching algorithm on {new Date(algorithmData.results.date).toLocaleDateString()}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm">Effective Sample Size:</span>
                  <span className="font-medium">
                    {algorithmData.results.effectiveSampleSize} / {algorithmData.results.originalSampleSize}
                    <span className="text-muted-foreground ml-2">
                      ({Math.round(algorithmData.results.effectiveSampleSize / algorithmData.results.originalSampleSize * 100)}%)
                    </span>
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm">Balance Achieved:</span>
                  <span>
                    {algorithmData.results.balanceAchieved ? (
                      <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                        <CheckCircle2 className="mr-1 h-3 w-3" /> Yes
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="bg-yellow-50 text-yellow-700 border-yellow-200">
                        <AlertCircle className="mr-1 h-3 w-3" /> Partial
                      </Badge>
                    )}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm">Weight Range:</span>
                  <span className="font-medium">
                    {algorithmData.results.weightSummary.min.toFixed(2)} - {algorithmData.results.weightSummary.max.toFixed(2)}
                  </span>
                </div>
              </div>
              
              <div className="md:col-span-2">
                <h4 className="text-sm font-medium mb-3">Standardized Mean Differences</h4>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Variable</TableHead>
                      <TableHead>Before Matching</TableHead>
                      <TableHead>After Matching</TableHead>
                      <TableHead>Improvement</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {Object.entries(algorithmData.results.balanceMetrics.postMatching.standardizedMeanDifferences).map(([variable, value]) => {
                      const before = algorithmData.results.balanceMetrics.preMatching.standardizedMeanDifferences[variable];
                      // Type guard to ensure numeric values
                      const numericBefore = typeof before === 'number' ? before : 0;
                      const numericValue = typeof value === 'number' ? value : 0;
                      const improvement = ((numericBefore - numericValue) / numericBefore * 100).toFixed(0);
                      
                      return (
                        <TableRow key={variable}>
                          <TableCell>{variable}</TableCell>
                          <TableCell className={numericBefore > 0.1 ? "text-amber-600" : "text-green-600"}>
                            {numericBefore.toFixed(2)}
                          </TableCell>
                          <TableCell className={numericValue > 0.1 ? "text-amber-600" : "text-green-600"}>
                            {numericValue.toFixed(2)}
                          </TableCell>
                          <TableCell>
                            {improvement}%
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </div>
          </CardContent>
          <CardFooter className="border-t bg-muted/50 pt-4 pb-3">
            <p className="text-sm text-muted-foreground">
              The matching algorithm has been applied to the source data. You can now proceed to the outcome analysis.
            </p>
          </CardFooter>
        </Card>
      )}
      
      <div className="flex justify-end">
        <Button
          className="bg-[#228be6] hover:bg-[#1c7ed6] text-white"
          disabled={runningAlgorithm}
          onClick={runMatchingAlgorithm}
        >
          {runningAlgorithm ? (
            <>Running Algorithm...</>
          ) : algorithmData.results ? (
            <>Rerun Matching Algorithm</>
          ) : (
            <>Run Matching Algorithm</>
          )}
        </Button>
      </div>
    </div>
  );
}

export default MatchingAlgorithm;