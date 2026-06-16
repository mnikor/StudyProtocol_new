import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertCircle, Download, Plus, Trash2, Zap } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { AIProcessingButton } from "./ai-processing-button";
import { AIOriginBadge } from "./ai-origin-badge";
import { ProvenanceInfo } from "@/components/provenance-info";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Protocol } from "@shared/schema";
import { DataVariable } from "@/types";
import { AIGenerationStatus } from "@/components/ai-generation-status";
import { exportVariablesToExcel } from "@/lib/export-utils";
import { formatSupplementaryInfoForAI } from "@/lib/supplementary-info";
import { CommentTrigger } from "@/components/comment-trigger";
import { SectionGenerationMode, SectionSourcePanel } from "@/components/section-source-panel";
import { getApiErrorMessage } from "@/lib/api-error";

interface DataVariablesProps {
  protocol: Protocol;
  setProtocol: React.Dispatch<React.SetStateAction<Protocol>>;
  activeDesignState?: any;
  isActive?: boolean;
}

export default function DataVariables({ protocol, setProtocol, activeDesignState, isActive = false }: DataVariablesProps) {
  const { toast } = useToast();
  const [variables, setVariables] = useState<DataVariable[]>(() => {
    try {
      // dataVariables can be either an array (already parsed) or a JSON string
      if (Array.isArray(protocol.dataVariables)) {
        return protocol.dataVariables;
      }
      return protocol.dataVariables ? JSON.parse(protocol.dataVariables) : [];
    } catch {
      return [];
    }
  });

  // Update variables when protocol data changes (e.g., when fresh data is loaded from API)
  useEffect(() => {
    try {
      // dataVariables can be either an array (already parsed) or a JSON string
      let newVariables: DataVariable[] = [];
      if (Array.isArray(protocol.dataVariables)) {
        newVariables = protocol.dataVariables;
      } else if (protocol.dataVariables) {
        newVariables = JSON.parse(protocol.dataVariables);
      }
      setVariables(newVariables);
    } catch (e) {
      console.error("Error parsing dataVariables from protocol:", e);
      setVariables([]);
    }
  }, [protocol.dataVariables]);
  
  const [newVariable, setNewVariable] = useState<DataVariable>({
    id: 0,
    category: "",
    name: "",
    type: "Numeric",
    required: false,
    aiSuggestion: ""
  });
  
  const [selectedCategory, setSelectedCategory] = useState<string>("All");
  const [isGenerating, setIsGenerating] = useState(false);
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isGenerateDialogOpen, setIsGenerateDialogOpen] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [generationStatus, setGenerationStatus] = useState<{
    name: string;
    status: "pending" | "generating" | "complete" | "error";
    message?: string;
  }[]>([]);
  
  // Get unique categories
  const categories = ["All", ...Array.from(new Set(variables.map((v: DataVariable) => v.category)))].filter(Boolean);
  
  // Filter variables by selected category
  const filteredVariables = selectedCategory === "All" 
    ? variables 
    : variables.filter(variable => variable.category === selectedCategory);
  
  // Variable types
  const variableTypes = ["Numeric", "Categorical", "Date", "Text", "Binary"];
  
  // Generate a unique ID for new variables
  const generateId = () => {
    const ids = variables.map((v: DataVariable) => v.id);
    return ids.length > 0 ? Math.max(...ids) + 1 : 1;
  };
  
  // Add a new variable
  const addVariable = () => {
    // Validate
    if (!newVariable.category.trim()) {
      setValidationError("Category is required");
      return;
    }
    
    if (!newVariable.name.trim()) {
      setValidationError("Name is required");
      return;
    }
    
    // Create new variable with a unique ID
    const variableToAdd = {
      ...newVariable,
      id: generateId(),
      origin: "manual"
    };
    
    const updatedVariables = [...variables, variableToAdd];
    setVariables(updatedVariables);
    
    // Update protocol
    setProtocol(prev => ({
      ...prev,
      dataVariables: JSON.stringify(updatedVariables)
    }));
    
    // Reset form
    setNewVariable({
      id: 0,
      category: "",
      name: "",
      type: "Numeric",
      required: false,
      aiSuggestion: ""
    });
    
    setValidationError(null);
    setIsAddDialogOpen(false);
    
    toast({
      title: "Variable Added",
      description: `${variableToAdd.name} has been added to ${variableToAdd.category}.`
    });
  };
  
  // Delete a variable
  const deleteVariable = (id: number) => {
    const updatedVariables = variables.filter((v: DataVariable) => v.id !== id);
    setVariables(updatedVariables);
    
    // Update protocol
    setProtocol(prev => ({
      ...prev,
      dataVariables: JSON.stringify(updatedVariables)
    }));
    
    toast({
      title: "Variable Removed",
      description: "The variable has been removed successfully."
    });
  };
  
  // Toggle required status
  const toggleRequired = (id: number) => {
    const updatedVariables = variables.map((v: DataVariable) => 
      v.id === id ? { ...v, required: !v.required } : v
    );
    
    setVariables(updatedVariables);
    
    // Update protocol
    setProtocol(prev => ({
      ...prev,
      dataVariables: JSON.stringify(updatedVariables)
    }));
  };
  
  // Update variable type
  const updateVariableType = (id: number, type: string) => {
    const updatedVariables = variables.map((v: DataVariable) => 
      v.id === id ? { ...v, type } : v
    );
    
    setVariables(updatedVariables);
    
    // Update protocol
    setProtocol(prev => ({
      ...prev,
      dataVariables: JSON.stringify(updatedVariables)
    }));
  };
  
  // Generate variables with AI
  const generateVariables = async () => {
    if (!protocol.synopsis || protocol.synopsis.trim() === "") {
      toast({
        title: "Missing Synopsis",
        description: "Please provide a study synopsis before generating variables.",
        variant: "destructive"
      });
      return;
    }
    
    setIsGenerating(true);
    
    try {
      const response = await apiRequest(
        "POST",
        "/api/generate-variables",
        {
          synopsis: protocol.synopsis,
          supplementaryInfo: formatSupplementaryInfoForAI(
            protocol.supplementaryInfo,
            "data variables endpoints assessments outcomes covariates CRF forms source data safety efficacy laboratory imaging"
          )
        }
      );
      
      if (response.ok) {
        const responseData = await response.json();
        
        if (responseData && responseData.content) {
          // Assign proper IDs to new variables
          const highestId = variables.length > 0 ? Math.max(...variables.map((v: DataVariable) => v.id)) : 0;
          const newVariables = responseData.content.map((variable: any, index: number) => {
            // Ensure variable has all required properties with correct types
            return {
              ...variable,
              id: highestId + index + 1,
              // Ensure type is set to one of the allowed values
              type: variableTypes.includes(variable.type) ? variable.type : "Numeric",
              // Ensure aiSuggestion is present
              aiSuggestion: variable.aiSuggestion || "",
              // Ensure required is set
              required: variable.required === undefined ? true : variable.required,
              origin: variable.origin || variable.sourceUse || variable.classification || "generated"
            };
          });
          
          setVariables(newVariables);
          
          // Update protocol
          setProtocol(prev => ({
            ...prev,
            dataVariables: JSON.stringify(newVariables)
          }));
          
          toast({
            title: "Data Variables Generated",
            description: `${newVariables.length} variables have been generated based on the study synopsis.`
          });
        }
      } else {
        throw new Error(await getApiErrorMessage(response, "Failed to generate variables. Server returned: " + response.status));
      }
    } catch (error) {
      console.error("Error generating variables:", error);
      toast({
        title: "Generation Failed",
        description: "Failed to generate data variables. Please try again.",
        variant: "destructive"
      });
    } finally {
      setIsGenerating(false);
    }
  };
  
  // Modified generate function to open the dialog
  const initializeGenerationStatus = () => {
    setGenerationStatus([
      { name: "Analyzing Synopsis", status: "pending" },
      { name: "Identifying Variables", status: "pending" },
      { name: "Generating Data Variables", status: "pending" }
    ]);
  };

  const handleGenerateClick = () => {
    if (!protocol.synopsis || protocol.synopsis.trim() === "") {
      toast({
        title: "Missing Synopsis",
        description: "Please provide a study synopsis before generating variables.",
        variant: "destructive"
      });
      return;
    }
    
    initializeGenerationStatus();
    setIsGenerateDialogOpen(true);
  };
  
  // Separated AI generation to show progress in dialog
  const startGeneration = async (generationMode: SectionGenerationMode = "augment") => {
    setIsGenerating(true);
    
    try {
      // Update status for synopsis analysis
      setGenerationStatus(prev => prev.map((item, i) => 
        i === 0 ? { ...item, status: "generating" } : item
      ));
      
      await new Promise(resolve => setTimeout(resolve, 500)); // Visual delay
      
      // Update status for variable identification
      setGenerationStatus(prev => prev.map((item, i) => 
        i === 0 ? { ...item, status: "complete" } : 
        i === 1 ? { ...item, status: "generating" } : item
      ));
      
      await new Promise(resolve => setTimeout(resolve, 500)); // Visual delay
      
      // Update status for final generation
      setGenerationStatus(prev => prev.map((item, i) => 
        i === 1 ? { ...item, status: "complete" } : 
        i === 2 ? { ...item, status: "generating" } : item
      ));
      
      // Retrieve alignment analysis from localStorage
      let alignmentAnalysis = null;
      try {
        const alignmentKey = `protocol-${protocol.id}-alignment`;
        const savedAlignment = localStorage.getItem(alignmentKey);
        if (savedAlignment) {
          alignmentAnalysis = JSON.parse(savedAlignment);
          console.log("Retrieved alignment analysis for variables generation:", alignmentAnalysis);
        }
      } catch (error) {
        console.error("Error retrieving alignment analysis:", error);
      }

      // Actual API call
      const response = await fetch('/api/generate-variables', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          synopsis: protocol.synopsis || "",
          supplementaryInfo: formatSupplementaryInfoForAI(
            protocol.supplementaryInfo,
            "data variables endpoints assessments outcomes covariates CRF forms source data safety efficacy laboratory imaging"
          ),
          protocolType: protocol.protocolType,
          alignmentAnalysis: alignmentAnalysis,
          generationMode
        }),
      });
      
      if (!response.ok) {
        throw new Error(await getApiErrorMessage(response, `Failed to generate variables: ${response.status}`));
      }
      
      const data = await response.json();

      if (data?.sourceStatus === "not_found") {
        setGenerationStatus(prev => prev.map(item => ({ ...item, status: "pending" })));
        setIsGenerateDialogOpen(false);
        toast({
          title: "Source Content Not Found",
          description: data.sourceStatusMessage || data.explanation || "No data variable information was found in the source documents.",
          duration: 5000
        });
        return;
      }
      
      if (data && data.dataVariables) {
        // Assign proper IDs to new variables
        const highestId = variables.length > 0 ? Math.max(...variables.map((v: DataVariable) => v.id)) : 0;
        const newVariables = data.dataVariables.map((variable: any, index: number) => {
          // Ensure variable has all required properties with correct types
          return {
            ...variable,
            id: highestId + index + 1,
            // Ensure type is set to one of the allowed values
            type: variableTypes.includes(variable.type) ? variable.type : "Numeric",
            // Ensure aiSuggestion is present
            aiSuggestion: variable.aiSuggestion || "",
            // Ensure required is set
            required: variable.required === undefined ? true : variable.required,
            origin: variable.origin || variable.sourceUse || variable.classification || "generated"
          };
        });
        
        setVariables(newVariables);
        
        // Update protocol
        setProtocol(prev => ({
          ...prev,
          dataVariables: JSON.stringify(newVariables)
        }));
        
        // Complete all status items
        setGenerationStatus(prev => prev.map(item => ({ ...item, status: "complete" })));
        
        // Close dialog after a delay
        setTimeout(() => {
          setIsGenerateDialogOpen(false);
          toast({
            title: "Data Variables Generated",
            description: `${newVariables.length} variables have been generated based on the study synopsis.`
          });
        }, 1000);
      }
    } catch (error) {
      console.error("Error generating variables:", error);
      
      // Set error status
      setGenerationStatus(prev => prev.map(item => 
        item.status === "generating" ? { ...item, status: "error", message: "Failed to generate" } : item
      ));
      
      toast({
        title: "Generation Failed",
        description: error instanceof Error ? error.message : "Failed to generate data variables. Please try again.",
        variant: "destructive"
      });
    } finally {
      setIsGenerating(false);
    }
  };

  // Handle export to Excel
  const handleExportToExcel = () => {
    try {
      // Export variables to Excel
      exportVariablesToExcel(variables, `${protocol.id || 'protocol'}_data_variables.xlsx`);
      
      // Show success toast
      toast({
        title: "Export Successful",
        description: "Data variables have been exported to Excel",
        duration: 3000,
      });
    } catch (error) {
      console.error("Error exporting data variables to Excel:", error);
      toast({
        title: "Export Failed",
        description: "Failed to export data variables. Please try again.",
        variant: "destructive",
        duration: 3000,
      });
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Data Variables</h2>
        <div className="flex items-center space-x-2">
          <Button
            variant="outline"
            size="sm"
            className="h-8 text-sm"
            onClick={handleExportToExcel}
            disabled={variables.length === 0}
          >
            <Download size={14} className="mr-1.5" />
            Export to Excel
          </Button>
          <Button onClick={() => setIsAddDialogOpen(true)}>
            <Plus className="h-4 w-4 mr-1" /> Add Variable
          </Button>
        </div>
      </div>

      {protocol.synopsis && (
        <SectionSourcePanel
          protocol={protocol}
          setProtocol={setProtocol}
          sectionKey="variables"
          sectionName="Data Variables"
          referenceExamples="Use variable lists, CRF structure, or endpoint data from this file only for this section."
          isGenerating={isGenerating}
          compact={variables.length > 0}
          onGenerate={(mode) => {
            initializeGenerationStatus();
            void startGeneration(mode);
          }}
        />
      )}
      
      {variables.length > 0 ? (
        <>
          <div className="flex items-center space-x-2 mb-4">
            <Label htmlFor="filter-category">Filter by Category:</Label>
            <Select
              value={selectedCategory}
              onValueChange={setSelectedCategory}
            >
              <SelectTrigger id="filter-category" className="w-[180px]">
                <SelectValue placeholder="Select Category" />
              </SelectTrigger>
              <SelectContent>
                {categories.map((category) => (
                  <SelectItem key={category} value={category}>
                    {category}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          
          <Tabs defaultValue="table" className="w-full">
            <TabsList className="mb-4">
              <TabsTrigger value="table">Table View</TabsTrigger>
              <TabsTrigger value="card">Card View</TabsTrigger>
            </TabsList>
            
            <TabsContent value="table">
              <div className="rounded-md border">
                <table className="w-full">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      <th className="py-3 px-4 text-left font-medium">Category</th>
                      <th className="py-3 px-4 text-left font-medium">Name</th>
                      <th className="py-3 px-4 text-left font-medium">Type</th>
                      <th className="py-3 px-4 text-left font-medium">Required</th>
                      <th className="py-3 px-4 text-center font-medium">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredVariables.map((variable) => (
                      <tr key={variable.id} className="border-b">
                        <td className="py-3 px-4">{variable.category}</td>
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-2">
                            <span className="flex-1">
                              {variable.name}
                              <AIOriginBadge item={variable} className="ml-2" />
                            </span>
                            <ProvenanceInfo item={variable} section="Data variables" />
                            <CommentTrigger
                              protocolId={protocol.id}
                              designStateId={activeDesignState?.id || ""}
                              section="dataVariables"
                              sectionItem="variable"
                              contextData={`variable-${variable.id}`}
                              size="icon"
                            />
                          </div>
                        </td>
                        <td className="py-3 px-4">
                          <Select
                            value={variable.type}
                            onValueChange={(value) => updateVariableType(variable.id, value)}
                          >
                            <SelectTrigger className="w-[120px]">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {variableTypes.map((type) => (
                                <SelectItem key={type} value={type}>
                                  {type}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </td>
                        <td className="py-3 px-4">
                          <Button
                            variant={variable.required ? "default" : "outline"}
                            size="sm"
                            onClick={() => toggleRequired(variable.id)}
                          >
                            {variable.required ? "Required" : "Optional"}
                          </Button>
                        </td>
                        <td className="py-3 px-4 text-center">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => deleteVariable(variable.id)}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </TabsContent>
            
            <TabsContent value="card">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredVariables.map((variable) => (
                  <Card key={variable.id} className="p-4">
                    <div className="flex justify-between items-start">
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="font-semibold flex items-center flex-1">
                            {variable.name}
                            <AIOriginBadge item={variable} className="ml-2" />
                          </h3>
                          <ProvenanceInfo item={variable} section="Data variables" />
                          <CommentTrigger
                            protocolId={protocol.id}
                            designStateId={activeDesignState?.id || ""}
                            section="dataVariables"
                            sectionItem="variable"
                            contextData={`variable-${variable.id}`}
                            size="icon"
                          />
                        </div>
                        <p className="text-sm text-muted-foreground">{variable.category}</p>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => deleteVariable(variable.id)}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                    
                    <div className="mt-4 space-y-2">
                      <div className="flex justify-between items-center">
                        <Label>Type</Label>
                        <Select
                          value={variable.type}
                          onValueChange={(value) => updateVariableType(variable.id, value)}
                        >
                          <SelectTrigger className="w-[120px]">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {variableTypes.map((type) => (
                              <SelectItem key={type} value={type}>
                                {type}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      
                      <div className="flex justify-between items-center">
                        <Label>Status</Label>
                        <Button
                          variant={variable.required ? "default" : "outline"}
                          size="sm"
                          onClick={() => toggleRequired(variable.id)}
                        >
                          {variable.required ? "Required" : "Optional"}
                        </Button>
                      </div>
                      
                      {variable.aiSuggestion && (
                        <div className="mt-2 pt-2 border-t">
                          <p className="text-xs text-muted-foreground">
                            <span className="font-semibold">AI Note:</span> {variable.aiSuggestion}
                          </p>
                        </div>
                      )}
                    </div>
                  </Card>
                ))}
              </div>
            </TabsContent>
          </Tabs>
        </>
      ) : (
        <div className="flex flex-col items-center justify-center p-8 border border-dashed rounded-lg">
          <h3 className="text-lg font-medium">No Data Variables Defined</h3>
          <p className="text-muted-foreground mb-4">
            Choose how to use the source content above, or add variables manually.
          </p>
        </div>
      )}
      
      {/* Add Variable Dialog */}
      <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Data Variable</DialogTitle>
            <DialogDescription>
              Define a new data variable for your clinical study.
            </DialogDescription>
          </DialogHeader>
          
          {validationError && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{validationError}</AlertDescription>
            </Alert>
          )}
          
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="category">Category *</Label>
              <Input
                id="category"
                placeholder="e.g., Demographics, Laboratory, Efficacy"
                value={newVariable.category}
                onChange={(e) => setNewVariable({...newVariable, category: e.target.value})}
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="name">Variable Name *</Label>
              <Input
                id="name"
                placeholder="e.g., Age, Tumor Size, ECOG Status"
                value={newVariable.name}
                onChange={(e) => setNewVariable({...newVariable, name: e.target.value})}
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="type">Variable Type</Label>
              <Select 
                value={newVariable.type} 
                onValueChange={(value) => setNewVariable({...newVariable, type: value})}
              >
                <SelectTrigger id="type">
                  <SelectValue placeholder="Select Type" />
                </SelectTrigger>
                <SelectContent>
                  {variableTypes.map((type) => (
                    <SelectItem key={type} value={type}>
                      {type}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div className="flex items-center space-x-2">
              <Label htmlFor="required">Required</Label>
              <input
                type="checkbox"
                id="required"
                checked={newVariable.required}
                onChange={(e) => setNewVariable({...newVariable, required: e.target.checked})}
                className="w-4 h-4"
              />
            </div>
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsAddDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={addVariable}>
              Add Variable
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
      {/* AI Generation Dialog */}
      <Dialog open={isGenerateDialogOpen} onOpenChange={setIsGenerateDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Zap size={18} className="text-[#228be6]" />
              Generate Data Variables with AI
            </DialogTitle>
          </DialogHeader>
          
          {!isGenerating ? (
            <div className="space-y-4">
              <div className="bg-[#f1f3f5] p-4 rounded-md">
                <p className="text-sm">
                  Review your study synopsis below. AI will generate appropriate data variables based on study type, endpoints, and requirements.
                </p>
              </div>
              
              <div className="border rounded-md p-3 bg-gray-50 min-h-[150px] max-h-[300px] text-sm overflow-auto whitespace-pre-wrap">
                {protocol.synopsis || "Please add a synopsis in the Synopsis tab first."}
              </div>
              
              {Array.isArray(protocol.supplementaryInfo) && protocol.supplementaryInfo.length > 0 && (
                <div>
                  <h4 className="text-sm font-semibold mb-2">Supplementary Information:</h4>
                  <ul className="text-sm space-y-1 ml-5 list-disc">
                    {protocol.supplementaryInfo.map((info, index) => (
                      <li key={index}>{info}</li>
                    ))}
                  </ul>
                </div>
              )}
              
              <div className="mt-4 flex justify-end">
                <AIProcessingButton
                  onProcess={() => startGeneration("augment")}
                  disabled={!protocol.synopsis}
                />
              </div>
            </div>
          ) : (
            <div className="py-4">
              <AIGenerationStatus sections={generationStatus} />
            </div>
          )}
        </DialogContent>
      </Dialog>
      
      {/* Floating Comment System */}

    </div>
  );
}
