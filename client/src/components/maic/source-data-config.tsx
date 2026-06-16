import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Upload, FileUp, Database, Table2, CheckCircle2, X, AlertCircle, HelpCircle } from "lucide-react";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";

interface SourceDataConfigProps {
  protocol: any;
  setProtocol: (protocol: any) => void;
}

export function SourceDataConfig({ protocol, setProtocol }: SourceDataConfigProps) {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("upload");
  const [file, setFile] = useState<File | null>(null);
  const [filePreview, setFilePreview] = useState<{ headers: string[]; rows: string[][] } | null>(null);
  const [uploading, setUploading] = useState(false);
  
  // Get existing sourceDataConfig component or initialize if not exists
  const existingComponent = Array.isArray(protocol.components) 
    ? protocol.components.find(
        (component: any) => component.type === "sourceDataConfig" && component.designStateId === protocol.activeDesignState
      )
    : null;
  
  const sourceData = existingComponent?.data || {
      datasetName: "",
      datasetDescription: "",
      datasetSize: 0,
      dataSource: {
        type: "clinical_trial",
        name: "",
        description: "",
        dateRange: "",
        identifier: ""
      },
      variableDefinitions: [],
      importMethod: "file_upload",
      dataFormat: "csv",
      validated: false
    };
  
  // Update the sourceDataConfig in the protocol
  const updateSourceData = (updatedData: any) => {
    // Make a deep copy to avoid reference issues
    const newData = JSON.parse(JSON.stringify(updatedData));
    
    // Get all components except the current sourceDataConfig if it exists
    const otherComponents = Array.isArray(protocol.components) 
      ? protocol.components.filter(
          (component: any) => !(component.type === "sourceDataConfig" && component.designStateId === protocol.activeDesignState)
        ) 
      : [];
    
    // Create a new component
    const newComponent = {
      type: "sourceDataConfig",
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
  
  // Handle file upload (mock implementation)
  const handleFileUpload = () => {
    if (!file) {
      toast({
        title: "No File Selected",
        description: "Please select a file to upload.",
        variant: "destructive"
      });
      return;
    }
    
    setUploading(true);
    
    // Simulate file processing
    setTimeout(() => {
      // Create mock data preview
      const mockHeaders = ["SUBJID", "AGE", "SEX", "RACE", "ECOG", "TRT01P", "AVAL", "CNSR"];
      const mockRows = [
        ["001", "65", "M", "WHITE", "1", "DRUG A", "425", "0"],
        ["002", "72", "F", "WHITE", "0", "DRUG A", "136", "1"],
        ["003", "58", "M", "BLACK", "1", "DRUG A", "365", "0"],
        ["004", "61", "F", "ASIAN", "2", "DRUG A", "189", "1"],
        ["005", "69", "M", "WHITE", "0", "DRUG A", "401", "0"]
      ];
      
      setFilePreview({ headers: mockHeaders, rows: mockRows });
      
      // Update source data config with file information
      updateSourceData({
        ...sourceData,
        datasetName: file.name.replace(/\.[^/.]+$/, ""),
        datasetSize: 250, // Mock dataset size
        dataFormat: file.name.split('.').pop()?.toLowerCase() || "csv",
        importMethod: "file_upload",
        variableDefinitions: mockHeaders.map(header => ({
          name: header,
          label: header,
          dataType: guessDataType(header),
          description: "",
          required: header === "SUBJID" || header === "TRT01P"
        })),
        validated: true
      });
      
      setUploading(false);
      
      toast({
        title: "File Processed Successfully",
        description: `Imported ${file.name} with 250 subjects and ${mockHeaders.length} variables`,
      });
    }, 2000);
  };
  
  // Guess data type based on variable name (simplified implementation)
  const guessDataType = (variableName: string) => {
    const name = variableName.toUpperCase();
    if (name.includes("ID") || name.includes("CODE")) return "string";
    if (name.includes("AGE") || name.includes("AVAL") || name.includes("WEIGHT") || name.includes("HEIGHT")) return "numeric";
    if (name.includes("DATE") || name.includes("DT")) return "date";
    if (name.includes("SEX") || name.includes("GENDER") || name.includes("RACE") || name.includes("ARM")) return "categorical";
    if (name.includes("FLAG") || name.includes("CNSR") || name.includes("COMP")) return "binary";
    return "string";
  };
  
  // Handle manual dataset definition update
  const updateDatasetField = (field: string, value: any) => {
    updateSourceData({
      ...sourceData,
      [field]: value
    });
  };
  
  // Handle data source update
  const updateDataSource = (field: string, value: any) => {
    updateSourceData({
      ...sourceData,
      dataSource: {
        ...sourceData.dataSource,
        [field]: value
      }
    });
  };
  
  // Update a variable definition
  const updateVariableDefinition = (index: number, field: string, value: any) => {
    const updatedDefinitions = [...sourceData.variableDefinitions];
    updatedDefinitions[index] = {
      ...updatedDefinitions[index],
      [field]: value
    };
    
    updateSourceData({
      ...sourceData,
      variableDefinitions: updatedDefinitions
    });
  };
  
  // Add a new variable definition
  const addVariableDefinition = () => {
    updateSourceData({
      ...sourceData,
      variableDefinitions: [
        ...sourceData.variableDefinitions,
        {
          name: "",
          label: "",
          dataType: "string",
          description: "",
          required: false
        }
      ]
    });
  };
  
  // Remove a variable definition
  const removeVariableDefinition = (index: number) => {
    const updatedDefinitions = [...sourceData.variableDefinitions];
    updatedDefinitions.splice(index, 1);
    
    updateSourceData({
      ...sourceData,
      variableDefinitions: updatedDefinitions
    });
  };
  
  return (
    <div className="space-y-6">
      <div className="flex flex-col space-y-1.5">
        <h3 className="text-lg font-semibold">Source Data Configuration</h3>
        <p className="text-sm text-muted-foreground">
          Define the Individual Patient Data (IPD) source dataset for the MAIC analysis
        </p>
      </div>
      
      <Separator />
      
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="upload">
            <Upload className="mr-2 h-4 w-4" />
            Data Upload
          </TabsTrigger>
          <TabsTrigger value="variables">
            <Table2 className="mr-2 h-4 w-4" />
            Variable Definitions
          </TabsTrigger>
        </TabsList>
        
        <TabsContent value="upload" className="space-y-4 mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Dataset Information</CardTitle>
              <CardDescription>
                Provide details about your Individual Patient Data (IPD) source
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="datasetName">Dataset Name</Label>
                  <Input 
                    id="datasetName" 
                    value={sourceData.datasetName}
                    onChange={(e) => updateDatasetField("datasetName", e.target.value)}
                    placeholder="e.g., HARMONY Phase 3 IPD"
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="datasetDescription">Dataset Description</Label>
                  <Textarea 
                    id="datasetDescription" 
                    value={sourceData.datasetDescription}
                    onChange={(e) => updateDatasetField("datasetDescription", e.target.value)}
                    placeholder="Brief description of the dataset, including key characteristics"
                    rows={3}
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="datasetSize">Dataset Size (Number of Patients)</Label>
                  <Input 
                    id="datasetSize" 
                    type="number"
                    min={1}
                    value={sourceData.datasetSize || ""}
                    onChange={(e) => updateDatasetField("datasetSize", parseInt(e.target.value) || 0)}
                    placeholder="e.g., 250"
                  />
                </div>
              </div>
              
              <Separator />
              
              <div className="space-y-4">
                <h4 className="text-sm font-medium">Data Source</h4>
                
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="sourceType">Source Type</Label>
                    <Select 
                      value={sourceData.dataSource.type}
                      onValueChange={(value) => updateDataSource("type", value)}
                    >
                      <SelectTrigger id="sourceType">
                        <SelectValue placeholder="Select source type" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="clinical_trial">Clinical Trial</SelectItem>
                        <SelectItem value="observational_study">Observational Study</SelectItem>
                        <SelectItem value="registry">Patient Registry</SelectItem>
                        <SelectItem value="electronic_health_records">Electronic Health Records</SelectItem>
                        <SelectItem value="claims_data">Claims Data</SelectItem>
                        <SelectItem value="other">Other</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="sourceName">Source Name</Label>
                    <Input 
                      id="sourceName" 
                      value={sourceData.dataSource.name}
                      onChange={(e) => updateDataSource("name", e.target.value)}
                      placeholder="e.g., HARMONY Trial"
                    />
                  </div>
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="sourceDescription">Source Description</Label>
                  <Textarea 
                    id="sourceDescription" 
                    value={sourceData.dataSource.description}
                    onChange={(e) => updateDataSource("description", e.target.value)}
                    placeholder="Brief description of the data source"
                    rows={2}
                  />
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="sourceDateRange">Date Range</Label>
                    <Input 
                      id="sourceDateRange" 
                      value={sourceData.dataSource.dateRange}
                      onChange={(e) => updateDataSource("dateRange", e.target.value)}
                      placeholder="e.g., 2018-2022"
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="sourceIdentifier">Identifier (e.g., NCT number)</Label>
                    <Input 
                      id="sourceIdentifier" 
                      value={sourceData.dataSource.identifier}
                      onChange={(e) => updateDataSource("identifier", e.target.value)}
                      placeholder="e.g., NCT01234567"
                    />
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader>
              <CardTitle>Data Upload</CardTitle>
              <CardDescription>
                Upload your dataset file in CSV, Excel, SAS, or R format
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid w-full items-center gap-4">
                <div className="flex flex-col items-center justify-center border-2 border-dashed rounded-md p-8 cursor-pointer hover:bg-muted/50"
                     onClick={() => document.getElementById('file-upload')?.click()}>
                  <FileUp className="h-10 w-10 text-muted-foreground mb-2" />
                  <p className="text-sm font-medium">
                    {file ? file.name : "Click to upload or drag and drop"}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    CSV, Excel, SAS datasets, or R data files
                  </p>
                  <input
                    id="file-upload"
                    type="file"
                    className="hidden"
                    accept=".csv,.xls,.xlsx,.sas7bdat,.rds,.rdata"
                    onChange={(e) => {
                      if (e.target.files && e.target.files.length > 0) {
                        setFile(e.target.files[0]);
                      }
                    }}
                  />
                </div>
                
                {file && (
                  <div className="flex justify-between items-center bg-blue-50 p-2 rounded-md">
                    <div className="flex items-center">
                      <Database className="h-4 w-4 text-blue-500 mr-2" />
                      <span className="text-sm">{file.name}</span>
                    </div>
                    <Button 
                      variant="ghost" 
                      size="sm"
                      onClick={() => setFile(null)}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                )}
                
                <Button 
                  onClick={handleFileUpload} 
                  disabled={!file || uploading}
                  className="bg-[#228be6] hover:bg-[#1c7ed6] text-white"
                >
                  {uploading ? "Processing..." : "Process Data File"}
                </Button>
              </div>
              
              {filePreview && (
                <div className="mt-4">
                  <h4 className="text-sm font-medium mb-2">Data Preview</h4>
                  <div className="border rounded-md overflow-hidden">
                    <ScrollArea className="h-[200px]">
                      <table className="w-full text-xs">
                        <thead className="bg-muted">
                          <tr>
                            {filePreview.headers.map((header, i) => (
                              <th key={i} className="px-2 py-1 text-left font-medium">
                                {header}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {filePreview.rows.map((row, i) => (
                            <tr key={i} className="border-t">
                              {row.map((cell, j) => (
                                <td key={j} className="px-2 py-1">
                                  {cell}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </ScrollArea>
                  </div>
                  <p className="text-xs text-muted-foreground mt-2">
                    Showing 5 of {sourceData.datasetSize} rows
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
        
        <TabsContent value="variables" className="space-y-4 mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                Variable Definitions
                {sourceData.validated ? (
                  <Badge variant="outline" className="ml-2 bg-green-50 text-green-700 border-green-200">
                    <CheckCircle2 className="mr-1 h-3 w-3" /> Validated
                  </Badge>
                ) : (
                  <Badge variant="outline" className="ml-2">
                    <AlertCircle className="mr-1 h-3 w-3" /> Pending
                  </Badge>
                )}
              </CardTitle>
              <CardDescription>
                Define the variables in your dataset that will be used for matching and outcomes
              </CardDescription>
            </CardHeader>
            <CardContent>
              {sourceData.variableDefinitions.length === 0 ? (
                <div className="text-center py-6 text-muted-foreground">
                  <HelpCircle className="mx-auto h-8 w-8 mb-2" />
                  <p>No variables defined yet. Upload a dataset or add variables manually.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {sourceData.variableDefinitions.map((variable: any, index: number) => (
                    <div key={index} className="border rounded-md p-4 space-y-4">
                      <div className="flex justify-between items-center">
                        <h5 className="font-medium text-sm">{variable.name || "New Variable"}</h5>
                        <Button 
                          variant="ghost" 
                          size="sm"
                          onClick={() => removeVariableDefinition(index)}
                        >
                          <X className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                      
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-2">
                          <Label htmlFor={`var-name-${index}`}>Variable Name</Label>
                          <Input 
                            id={`var-name-${index}`}
                            value={variable.name}
                            onChange={(e) => updateVariableDefinition(index, "name", e.target.value)}
                            placeholder="e.g., AGE"
                          />
                        </div>
                        
                        <div className="space-y-2">
                          <Label htmlFor={`var-label-${index}`}>Label/Description</Label>
                          <Input 
                            id={`var-label-${index}`}
                            value={variable.label}
                            onChange={(e) => updateVariableDefinition(index, "label", e.target.value)}
                            placeholder="e.g., Patient Age in Years"
                          />
                        </div>
                      </div>
                      
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-2">
                          <Label htmlFor={`var-type-${index}`}>Data Type</Label>
                          <Select 
                            value={variable.dataType}
                            onValueChange={(value) => updateVariableDefinition(index, "dataType", value)}
                          >
                            <SelectTrigger id={`var-type-${index}`}>
                              <SelectValue placeholder="Select data type" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="numeric">Numeric</SelectItem>
                              <SelectItem value="categorical">Categorical</SelectItem>
                              <SelectItem value="binary">Binary</SelectItem>
                              <SelectItem value="string">String</SelectItem>
                              <SelectItem value="date">Date</SelectItem>
                              <SelectItem value="time">Time</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        
                        <div className="flex items-center space-x-2 pt-7">
                          <input
                            type="checkbox"
                            id={`var-required-${index}`}
                            checked={variable.required}
                            onChange={(e) => updateVariableDefinition(index, "required", e.target.checked)}
                            className="form-checkbox h-4 w-4 text-[#228be6]"
                          />
                          <Label htmlFor={`var-required-${index}`}>Required for matching</Label>
                        </div>
                      </div>
                    </div>
                  ))}
                  
                  <Button
                    variant="outline"
                    onClick={addVariableDefinition}
                    className="w-full"
                  >
                    Add Variable
                  </Button>
                </div>
              )}
            </CardContent>
            <CardFooter className="border-t pt-4 flex justify-between">
              <p className="text-sm text-muted-foreground">
                {sourceData.variableDefinitions.length} variables defined
              </p>
              <Button
                className="bg-[#228be6] hover:bg-[#1c7ed6] text-white"
                disabled={sourceData.variableDefinitions.length === 0}
                onClick={() => {
                  // Mark as validated
                  updateSourceData({
                    ...sourceData,
                    validated: true
                  });
                  
                  toast({
                    title: "Variables Validated",
                    description: `${sourceData.variableDefinitions.length} variables have been validated for the MAIC analysis.`
                  });
                }}
              >
                Validate Variables
              </Button>
            </CardFooter>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default SourceDataConfig;