import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Upload, FileText, Download, Link as LinkIcon, Search, FileUp, ExternalLink, CheckCircle2, X, Info, HelpCircle } from "lucide-react";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface TargetStudyDataProps {
  protocol: any;
  setProtocol: (protocol: any) => void;
}

export function TargetStudyData({ protocol, setProtocol }: TargetStudyDataProps) {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("search");
  const [searchQuery, setSearchQuery] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [studyResults, setStudyResults] = useState<any[]>([]);
  const [selectedStudy, setSelectedStudy] = useState<any>(null);
  const [tableData, setTableData] = useState<{headers: string[], rows: string[][]}>({
    headers: [],
    rows: []
  });
  const [extractingData, setExtractingData] = useState(false);
  
  // Get existing targetStudyData component or initialize if not exists
  const existingComponent = Array.isArray(protocol.components) 
    ? protocol.components.find(
        (component: any) => component.type === "targetStudyData" && component.designStateId === protocol.activeDesignState
      )
    : null;
  
  const targetData = existingComponent?.data || {
    studyId: "",
    studyTitle: "",
    studySource: "clinicaltrials_gov",
    studyUrl: "",
    studyData: {
      population: {
        size: 0,
        description: "",
        inclusionCriteria: [],
        exclusionCriteria: []
      },
      outcomes: [],
      treatmentArms: [],
      dataTable: null
    },
    extracted: false
  };
  
  // Update the targetStudyData in the protocol
  const updateTargetData = (updatedData: any) => {
    // Make a deep copy to avoid reference issues
    const newData = JSON.parse(JSON.stringify(updatedData));
    
    // Get all components except the current targetStudyData if it exists
    const otherComponents = Array.isArray(protocol.components) 
      ? protocol.components.filter(
          (component: any) => !(component.type === "targetStudyData" && component.designStateId === protocol.activeDesignState)
        ) 
      : [];
    
    // Create a new component
    const newComponent = {
      type: "targetStudyData",
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
  
  // Handle study search
  const handleSearch = () => {
    if (!searchQuery) {
      toast({
        title: "Empty Search",
        description: "Please enter a search term to find clinical trials.",
        variant: "destructive"
      });
      return;
    }
    
    setIsSearching(true);
    
    // Simulate API call to ClinicalTrials.gov
    setTimeout(() => {
      // Mock search results
      const mockResults = [
        {
          nctId: "NCT04302454",
          title: "A Study of Apalutamide Plus Androgen Deprivation Therapy (ADT) Versus ADT for Management of Metastatic Hormone-Sensitive Prostate Cancer",
          phase: "Phase 3",
          status: "Recruiting",
          condition: "Metastatic Prostate Cancer",
          interventions: ["Drug: Apalutamide", "Drug: Androgen Deprivation Therapy"],
          url: "https://clinicaltrials.gov/study/NCT04302454"
        },
        {
          nctId: "NCT02257736",
          title: "A Study of Apalutamide (ARN-509) in Men With Non-Metastatic Castration-Resistant Prostate Cancer (SPARTAN)",
          phase: "Phase 3",
          status: "Completed",
          condition: "Prostate Cancer",
          interventions: ["Drug: ARN-509", "Drug: Placebo"],
          url: "https://clinicaltrials.gov/study/NCT02257736"
        },
        {
          nctId: "NCT01946204",
          title: "A Study of Apalutamide in Patients With Metastatic Castration-Resistant Prostate Cancer",
          phase: "Phase 2",
          status: "Completed",
          condition: "Prostatic Neoplasm",
          interventions: ["Drug: Apalutamide"],
          url: "https://clinicaltrials.gov/study/NCT01946204"
        }
      ];
      
      setStudyResults(mockResults);
      setIsSearching(false);
    }, 1500);
  };
  
  // Handle study selection
  const handleSelectStudy = (study: any) => {
    setSelectedStudy(study);
    
    // Update target data with selected study info
    updateTargetData({
      ...targetData,
      studyId: study.nctId,
      studyTitle: study.title,
      studySource: "clinicaltrials_gov",
      studyUrl: study.url
    });
    
    // Show toast notification
    toast({
      title: "Study Selected",
      description: `Selected ${study.nctId}: ${study.title}`
    });
  };
  
  // Extract data from the selected study
  const handleExtractData = () => {
    if (!selectedStudy && !targetData.studyId) {
      toast({
        title: "No Study Selected",
        description: "Please select a target study first.",
        variant: "destructive"
      });
      return;
    }
    
    setExtractingData(true);
    
    // Simulate data extraction
    setTimeout(() => {
      // Mock extracted data
      const mockPopulation = {
        size: 1207,
        description: "Adult males with metastatic hormone-sensitive prostate cancer",
        inclusionCriteria: [
          "Males aged ≥18 years",
          "Histologically confirmed adenocarcinoma of the prostate",
          "Metastatic disease documented by positive bone scan",
          "Testosterone level ≥ 150 ng/dL",
          "ECOG Performance Status 0-2"
        ],
        exclusionCriteria: [
          "Prior cytotoxic chemotherapy for prostate cancer",
          "Prior second-generation anti-androgen therapy",
          "Known brain metastases",
          "History of seizure or condition that may predispose to seizure",
          "Severe cardiovascular disease within 6 months"
        ]
      };
      
      const mockOutcomes = [
        {
          name: "Overall Survival",
          type: "Primary",
          description: "Time from randomization to death from any cause",
          timeFrame: "Up to 60 months"
        },
        {
          name: "Radiographic Progression-Free Survival",
          type: "Primary",
          description: "Time from randomization to first documented radiographic progression or death",
          timeFrame: "Up to 36 months"
        },
        {
          name: "Prostate-Specific Antigen Response Rate",
          type: "Secondary",
          description: "Percentage of participants with ≥50% reduction in PSA from baseline",
          timeFrame: "12 weeks"
        }
      ];
      
      const mockTreatmentArms = [
        {
          name: "Apalutamide + ADT",
          description: "Apalutamide 240 mg orally once daily + ADT",
          size: 604
        },
        {
          name: "Placebo + ADT",
          description: "Placebo orally once daily + ADT",
          size: 603
        }
      ];
      
      const mockTableHeaders = ["Treatment Arm", "n", "Median OS (months)", "HR (95% CI)", "p-value", "Median rPFS (months)"];
      const mockTableRows = [
        ["Apalutamide + ADT", "604", "Not Reached", "0.67 (0.51-0.89)", "0.0053", "22.1"],
        ["Placebo + ADT", "603", "52.2", "-", "-", "16.8"]
      ];
      
      setTableData({
        headers: mockTableHeaders,
        rows: mockTableRows
      });
      
      // Update target data with extracted information
      updateTargetData({
        ...targetData,
        studyData: {
          population: mockPopulation,
          outcomes: mockOutcomes,
          treatmentArms: mockTreatmentArms,
          dataTable: {
            headers: mockTableHeaders,
            rows: mockTableRows
          }
        },
        extracted: true
      });
      
      setExtractingData(false);
      
      toast({
        title: "Data Extraction Complete",
        description: "Successfully extracted target study data for MAIC analysis."
      });
    }, 2500);
  };
  
  // Handle manual field updates
  const updateField = (field: string, value: any) => {
    updateTargetData({
      ...targetData,
      [field]: value
    });
  };
  
  // Update nested study data
  const updateStudyData = (section: string, field: string, value: any) => {
    updateTargetData({
      ...targetData,
      studyData: {
        ...targetData.studyData,
        [section]: {
          ...targetData.studyData[section],
          [field]: value
        }
      }
    });
  };
  
  return (
    <div className="space-y-6">
      <div className="flex flex-col space-y-1.5">
        <h3 className="text-lg font-semibold">Target Study Data Extraction</h3>
        <p className="text-sm text-muted-foreground">
          Define and extract data from the target published study for the MAIC analysis
        </p>
      </div>
      
      <Separator />
      
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="search">
            <Search className="mr-2 h-4 w-4" />
            Find Study
          </TabsTrigger>
          <TabsTrigger value="manual">
            <FileText className="mr-2 h-4 w-4" />
            Manual Entry
          </TabsTrigger>
          <TabsTrigger value="results">
            <Download className="mr-2 h-4 w-4" />
            Extracted Data
          </TabsTrigger>
        </TabsList>
        
        <TabsContent value="search" className="space-y-4 mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Search Clinical Trials</CardTitle>
              <CardDescription>
                Find the target published study from clinical trial registries and databases
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex space-x-2">
                <div className="flex-1">
                  <Input
                    placeholder="Search for trials by keyword, drug name, or NCT number"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                  />
                </div>
                <Button 
                  onClick={handleSearch} 
                  disabled={isSearching}
                  className="bg-[#228be6] hover:bg-[#1c7ed6] text-white"
                >
                  {isSearching ? "Searching..." : "Search"}
                </Button>
              </div>
              
              <div className="text-xs text-muted-foreground flex space-x-1">
                <span>Example searches:</span>
                <button className="text-[#228be6] hover:underline" onClick={() => setSearchQuery("NCT04302454")}>NCT04302454</button>
                <span>|</span>
                <button className="text-[#228be6] hover:underline" onClick={() => setSearchQuery("Apalutamide metastatic prostate cancer")}>Apalutamide prostate</button>
                <span>|</span>
                <button className="text-[#228be6] hover:underline" onClick={() => setSearchQuery("SPARTAN trial")}>SPARTAN trial</button>
              </div>
              
              {studyResults.length > 0 && (
                <div className="border rounded-md overflow-hidden">
                  <ScrollArea className="h-[300px]">
                    <div className="p-4 space-y-4">
                      {studyResults.map((study, index) => (
                        <div 
                          key={index} 
                          className={`border rounded-md p-3 hover:bg-muted/30 cursor-pointer transition-colors ${selectedStudy?.nctId === study.nctId ? 'border-[#228be6] bg-blue-50' : ''}`}
                          onClick={() => handleSelectStudy(study)}
                        >
                          <div className="flex justify-between items-start">
                            <div>
                              <h4 className="font-medium">{study.title}</h4>
                              <div className="flex items-center space-x-2 mt-1 text-sm">
                                <Badge variant="outline">{study.nctId}</Badge>
                                <Badge variant="outline">{study.phase}</Badge>
                                <Badge variant="outline" className={
                                  study.status === "Completed" ? "bg-green-50 text-green-700 border-green-200" :
                                  study.status === "Recruiting" ? "bg-blue-50 text-blue-700 border-blue-200" :
                                  "bg-gray-50 text-gray-700 border-gray-200"
                                }>
                                  {study.status}
                                </Badge>
                              </div>
                              <div className="mt-2 text-sm">
                                <span className="font-medium">Condition:</span> {study.condition}
                              </div>
                              <div className="mt-1 text-sm">
                                <span className="font-medium">Interventions:</span> {study.interventions.join(", ")}
                              </div>
                            </div>
                            <a 
                              href={study.url} 
                              target="_blank" 
                              rel="noopener noreferrer"
                              className="text-[#228be6] hover:text-[#1c7ed6] mt-1"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <ExternalLink className="h-4 w-4" />
                            </a>
                          </div>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                </div>
              )}
            </CardContent>
            <CardFooter className="border-t pt-6 flex justify-between">
              <div className="text-sm text-muted-foreground">
                {selectedStudy ? (
                  <span>Selected: <span className="font-medium">{selectedStudy.nctId}</span></span>
                ) : (
                  <span>No study selected</span>
                )}
              </div>
              <Button
                onClick={handleExtractData}
                disabled={!selectedStudy && !targetData.studyId}
                className="bg-[#228be6] hover:bg-[#1c7ed6] text-white"
              >
                {extractingData ? "Extracting..." : "Extract Data"}
              </Button>
            </CardFooter>
          </Card>
        </TabsContent>
        
        <TabsContent value="manual" className="space-y-4 mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Manual Study Entry</CardTitle>
              <CardDescription>
                Manually enter details for the target study if not available in registries
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="studyId">Study ID (e.g., NCT number)</Label>
                  <Input 
                    id="studyId" 
                    value={targetData.studyId}
                    onChange={(e) => updateField("studyId", e.target.value)}
                    placeholder="e.g., NCT04302454"
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="studySource">Data Source</Label>
                  <Select 
                    value={targetData.studySource}
                    onValueChange={(value) => updateField("studySource", value)}
                  >
                    <SelectTrigger id="studySource">
                      <SelectValue placeholder="Select data source" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="clinicaltrials_gov">ClinicalTrials.gov</SelectItem>
                      <SelectItem value="published_paper">Published Paper</SelectItem>
                      <SelectItem value="study_csr">Clinical Study Report</SelectItem>
                      <SelectItem value="conference">Conference Abstract</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="studyTitle">Study Title</Label>
                <Input 
                  id="studyTitle" 
                  value={targetData.studyTitle}
                  onChange={(e) => updateField("studyTitle", e.target.value)}
                  placeholder="Full title of the study"
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="studyUrl">Study URL (optional)</Label>
                <div className="flex space-x-2">
                  <Input 
                    id="studyUrl" 
                    value={targetData.studyUrl}
                    onChange={(e) => updateField("studyUrl", e.target.value)}
                    placeholder="e.g., https://clinicaltrials.gov/study/NCT04302454"
                  />
                  {targetData.studyUrl && (
                    <a 
                      href={targetData.studyUrl} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="inline-flex items-center justify-center rounded-md text-sm font-medium h-10 px-4 py-2 bg-muted hover:bg-muted/90"
                    >
                      <LinkIcon className="h-4 w-4 mr-2" />
                      Visit
                    </a>
                  )}
                </div>
              </div>
              
              <Separator />
              
              <div className="space-y-4">
                <h4 className="text-sm font-medium">Study Population</h4>
                
                <div className="space-y-2">
                  <Label htmlFor="populationSize">Population Size</Label>
                  <Input 
                    id="populationSize" 
                    type="number"
                    min={1}
                    value={targetData.studyData?.population?.size || ''}
                    onChange={(e) => updateStudyData("population", "size", parseInt(e.target.value) || 0)}
                    placeholder="e.g., 1207"
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="populationDescription">Population Description</Label>
                  <Textarea 
                    id="populationDescription" 
                    value={targetData.studyData?.population?.description || ''}
                    onChange={(e) => updateStudyData("population", "description", e.target.value)}
                    placeholder="Brief description of the study population"
                    rows={2}
                  />
                </div>
              </div>
              
              <div className="space-y-4">
                <h4 className="text-sm font-medium">Treatment Arms</h4>
                
                {(targetData.studyData?.treatmentArms || []).map((arm: any, index: number) => (
                  <div key={index} className="border rounded-md p-3 space-y-3">
                    <div className="flex justify-between items-center">
                      <h5 className="text-sm font-medium">{arm.name || `Arm ${index + 1}`}</h5>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          const updatedArms = [...targetData.studyData.treatmentArms];
                          updatedArms.splice(index, 1);
                          
                          updateTargetData({
                            ...targetData,
                            studyData: {
                              ...targetData.studyData,
                              treatmentArms: updatedArms
                            }
                          });
                        }}
                      >
                        <X className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-2">
                        <Label htmlFor={`armName-${index}`}>Arm Name</Label>
                        <Input 
                          id={`armName-${index}`}
                          value={arm.name}
                          onChange={(e) => {
                            const updatedArms = [...targetData.studyData.treatmentArms];
                            updatedArms[index] = {
                              ...updatedArms[index],
                              name: e.target.value
                            };
                            
                            updateTargetData({
                              ...targetData,
                              studyData: {
                                ...targetData.studyData,
                                treatmentArms: updatedArms
                              }
                            });
                          }}
                          placeholder="e.g., Apalutamide + ADT"
                        />
                      </div>
                      
                      <div className="space-y-2">
                        <Label htmlFor={`armSize-${index}`}>Arm Size</Label>
                        <Input 
                          id={`armSize-${index}`}
                          type="number"
                          min={1}
                          value={arm.size || ''}
                          onChange={(e) => {
                            const updatedArms = [...targetData.studyData.treatmentArms];
                            updatedArms[index] = {
                              ...updatedArms[index],
                              size: parseInt(e.target.value) || 0
                            };
                            
                            updateTargetData({
                              ...targetData,
                              studyData: {
                                ...targetData.studyData,
                                treatmentArms: updatedArms
                              }
                            });
                          }}
                          placeholder="e.g., 604"
                        />
                      </div>
                    </div>
                    
                    <div className="space-y-2">
                      <Label htmlFor={`armDescription-${index}`}>Description</Label>
                      <Textarea 
                        id={`armDescription-${index}`}
                        value={arm.description}
                        onChange={(e) => {
                          const updatedArms = [...targetData.studyData.treatmentArms];
                          updatedArms[index] = {
                            ...updatedArms[index],
                            description: e.target.value
                          };
                          
                          updateTargetData({
                            ...targetData,
                            studyData: {
                              ...targetData.studyData,
                              treatmentArms: updatedArms
                            }
                          });
                        }}
                        placeholder="e.g., Apalutamide 240 mg orally once daily + ADT"
                        rows={2}
                      />
                    </div>
                  </div>
                ))}
                
                <Button
                  variant="outline"
                  onClick={() => {
                    const currentArms = targetData.studyData?.treatmentArms || [];
                    updateTargetData({
                      ...targetData,
                      studyData: {
                        ...targetData.studyData,
                        treatmentArms: [
                          ...currentArms,
                          {
                            name: "",
                            description: "",
                            size: 0
                          }
                        ]
                      }
                    });
                  }}
                  className="w-full"
                >
                  Add Treatment Arm
                </Button>
              </div>
            </CardContent>
            
            <CardFooter className="border-t pt-6 flex justify-end">
              <Button
                onClick={handleExtractData}
                className="bg-[#228be6] hover:bg-[#1c7ed6] text-white"
              >
                {extractingData ? "Processing..." : "Process Data"}
              </Button>
            </CardFooter>
          </Card>
        </TabsContent>
        
        <TabsContent value="results" className="space-y-4 mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                Extracted Target Study Data
                {targetData.extracted ? (
                  <Badge variant="outline" className="ml-2 bg-green-50 text-green-700 border-green-200">
                    <CheckCircle2 className="mr-1 h-3 w-3" /> Complete
                  </Badge>
                ) : (
                  <Badge variant="outline" className="ml-2 bg-amber-50 text-amber-700 border-amber-200">
                    <Info className="mr-1 h-3 w-3" /> Pending
                  </Badge>
                )}
              </CardTitle>
              <CardDescription>
                Review and validate the extracted data from the target study
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {!targetData.extracted ? (
                <div className="text-center py-8 text-muted-foreground">
                  <HelpCircle className="mx-auto h-10 w-10 mb-2" />
                  <p>No target study data has been extracted yet.</p>
                  <p className="text-sm mt-1">Use the "Find Study" or "Manual Entry" tabs to extract data.</p>
                </div>
              ) : (
                <>
                  <div className="border rounded-md p-4 bg-muted/30">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <h4 className="text-sm font-medium">Study Details</h4>
                        <p className="text-sm mt-1.5"><span className="font-medium">ID:</span> {targetData.studyId}</p>
                        <p className="text-sm mt-0.5"><span className="font-medium">Title:</span> {targetData.studyTitle}</p>
                        <p className="text-sm mt-0.5"><span className="font-medium">Source:</span> {targetData.studySource}</p>
                        {targetData.studyUrl && (
                          <p className="text-sm mt-0.5">
                            <span className="font-medium">URL:</span>{" "}
                            <a 
                              href={targetData.studyUrl} 
                              target="_blank" 
                              rel="noopener noreferrer"
                              className="text-[#228be6] hover:underline inline-flex items-center"
                            >
                              View Source <ExternalLink className="h-3 w-3 ml-1" />
                            </a>
                          </p>
                        )}
                      </div>
                      
                      <div>
                        <h4 className="text-sm font-medium">Population</h4>
                        <p className="text-sm mt-1.5"><span className="font-medium">Size:</span> {targetData.studyData.population.size} participants</p>
                        <p className="text-sm mt-0.5"><span className="font-medium">Description:</span> {targetData.studyData.population.description}</p>
                      </div>
                    </div>
                  </div>
                  
                  <div className="space-y-2">
                    <h4 className="text-sm font-medium">Treatment Arms</h4>
                    <div className="border rounded-md overflow-hidden">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Arm Name</TableHead>
                            <TableHead>Description</TableHead>
                            <TableHead className="text-right">Size</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {targetData.studyData.treatmentArms.map((arm: any, index: number) => (
                            <TableRow key={index}>
                              <TableCell className="font-medium">{arm.name}</TableCell>
                              <TableCell>{arm.description}</TableCell>
                              <TableCell className="text-right">{arm.size}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </div>
                  
                  <div className="space-y-2">
                    <h4 className="text-sm font-medium">Key Outcome Data</h4>
                    {targetData.studyData.dataTable ? (
                      <div className="border rounded-md overflow-hidden">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              {targetData.studyData.dataTable.headers.map((header: string, index: number) => (
                                <TableHead key={index}>{header}</TableHead>
                              ))}
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {targetData.studyData.dataTable.rows.map((row: string[], index: number) => (
                              <TableRow key={index}>
                                {row.map((cell: string, cellIndex: number) => (
                                  <TableCell key={cellIndex}>{cell}</TableCell>
                                ))}
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    ) : (
                      <div className="text-center py-4 text-muted-foreground border rounded-md">
                        <p>No outcome data table available.</p>
                      </div>
                    )}
                  </div>
                  
                  <div className="space-y-2">
                    <div className="flex justify-between items-center">
                      <h4 className="text-sm font-medium">Inclusion Criteria</h4>
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
                            <p className="text-xs max-w-xs">These criteria will be used to ensure your IPD matches the target study population</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </div>
                    <div className="border rounded-md p-3">
                      <ul className="list-disc list-inside space-y-1">
                        {targetData.studyData.population.inclusionCriteria.map((criterion: string, index: number) => (
                          <li key={index} className="text-sm">{criterion}</li>
                        ))}
                      </ul>
                    </div>
                  </div>
                  
                  <div className="space-y-2">
                    <h4 className="text-sm font-medium">Exclusion Criteria</h4>
                    <div className="border rounded-md p-3">
                      <ul className="list-disc list-inside space-y-1">
                        {targetData.studyData.population.exclusionCriteria.map((criterion: string, index: number) => (
                          <li key={index} className="text-sm">{criterion}</li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </>
              )}
            </CardContent>
            <CardFooter className="border-t pt-6 flex justify-between">
              {targetData.extracted && (
                <Button 
                  variant="outline"
                  onClick={() => {
                    // Reset extraction
                    updateTargetData({
                      ...targetData,
                      extracted: false
                    });
                    
                    toast({
                      title: "Data Reset",
                      description: "Target study data has been reset. You can extract new data."
                    });
                  }}
                >
                  Reset Data
                </Button>
              )}
              <Button
                onClick={() => setActiveTab("search")}
                className="ml-auto bg-[#228be6] hover:bg-[#1c7ed6] text-white"
                disabled={targetData.extracted}
              >
                {targetData.extracted ? "Data Complete" : "Extract Data"}
              </Button>
            </CardFooter>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default TargetStudyData;