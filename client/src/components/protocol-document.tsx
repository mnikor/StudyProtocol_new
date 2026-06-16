"use client"

import React, { useState, useEffect } from "react"
import { 
  Download, 
  FileText, 
  Edit,
  Pencil,
  Bold,
  Italic,
  List,
  ListOrdered,
  Zap,
  Check,
  RotateCcw,
  Loader2,
  ArrowRight,
  FileCheck
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { AIGeneratedBadge } from "@/components/ai-generated-badge"
import { Textarea } from "@/components/ui/textarea"
import { Protocol } from "@shared/schema"
import { useToast } from "@/hooks/use-toast"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { GeneratedProtocolViewer } from "./generated-protocol-viewer"

interface ProtocolDocumentProps {
  protocol: Protocol
}

const ProtocolDocument: React.FC<ProtocolDocumentProps> = ({ protocol }) => {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("preview");
  const [editingSection, setEditingSection] = useState<string | null>(null);
  const [generatingProtocol, setGeneratingProtocol] = useState(false);
  const [generationProgress, setGenerationProgress] = useState(0);
  const [showGeneratedProtocol, setShowGeneratedProtocol] = useState(false);
  
  // Store the generated protocol
  const [generatedProtocolSections, setGeneratedProtocolSections] = useState<Array<{
    id: string;
    title: string;
    content: string;
  }>>([]);
  
  // Define the protocol sections to be generated
  const [protocolSectionsToGenerate, setProtocolSectionsToGenerate] = useState([
    { id: "synopsis", title: "1. Synopsis", status: "pending" },
    { id: "background", title: "2. Background and Rationale", status: "pending" },
    { id: "objectives", title: "3. Objectives", status: "pending" },
    { id: "design", title: "4. Study Design", status: "pending" },
    { id: "population", title: "5. Study Population", status: "pending" },
    { id: "schedule", title: "6. Schedule of Activities", status: "pending" },
    { id: "treatments", title: "7. Study Treatments", status: "pending" },
    { id: "efficacy", title: "8. Efficacy Assessments", status: "pending" },
    { id: "safety", title: "9. Safety Assessments", status: "pending" },
    { id: "statistics", title: "10. Statistical Analysis", status: "pending" },
    { id: "ethical", title: "11. Ethical Considerations", status: "pending" }
  ]);
  
  // Mock protocol sections - MOVED ABOVE conditional return
  const [protocolSections, setProtocolSections] = useState({
    title: protocol.title,
    synopsis: `This is a Phase 2, open-label, multicenter study to evaluate the efficacy and safety of amivantamab in adult patients with NSCLC with EGFR exon 20 insertion mutations.`,
    background: `Non-small cell lung cancer (NSCLC) accounts for approximately 85% of all lung cancers. Among patients with NSCLC, EGFR mutations are found in approximately 15% of cases in Western countries and up to 50% in Asian countries. While EGFR tyrosine kinase inhibitors (TKIs) have shown efficacy in patients with common EGFR mutations (exon 19 deletions and exon 21 L858R substitutions), patients with EGFR exon 20 insertion mutations (~4-12% of all EGFR mutations) generally do not respond well to these therapies.
    
Amivantamab is a novel, fully human, bispecific antibody that targets EGFR and MET receptors. Preliminary clinical data suggests that amivantamab has activity in patients with EGFR exon 20 insertion mutations, making it a promising therapeutic option for this patient population with high unmet medical need.`,
    objectives: `Primary Objective:
- To evaluate the overall response rate (ORR) of amivantamab in patients with NSCLC with EGFR exon 20 insertion mutations

Secondary Objectives:
- To evaluate the duration of response (DOR)
- To evaluate progression-free survival (PFS)
- To evaluate overall survival (OS)
- To evaluate the safety and tolerability of amivantamab
- To evaluate the pharmacokinetic profile of amivantamab`,
    studyDesign: `This is a Phase 2, open-label, multicenter study of amivantamab in patients with metastatic or unresectable NSCLC with EGFR exon 20 insertion mutations. The study will enroll approximately 60 patients. Patients will receive amivantamab until disease progression, unacceptable toxicity, or withdrawal of consent.

Treatment will be administered on a 28-day cycle. Amivantamab will be administered as an intravenous (IV) infusion at a dose of 1050 mg (for patients <80 kg) or 1400 mg (for patients ≥80 kg) once weekly for the first 4 weeks, then every 2 weeks thereafter.`,
    studyPopulation: `Key Inclusion Criteria:
- Adults ≥18 years of age
- Histologically or cytologically confirmed NSCLC with EGFR exon 20 insertion mutation
- ECOG performance status 0-1
- Adequate organ function
- Measurable disease per RECIST 1.1

Key Exclusion Criteria:
- Prior treatment with EGFR-targeted therapy
- Known active CNS metastases
- History of interstitial lung disease
- Significant cardiovascular disease within 6 months
- Pregnancy or breastfeeding`,
    treatments: `Study Drug Administration:
- Amivantamab will be administered as an intravenous (IV) infusion
- Dose: 1050 mg (for patients <80 kg) or 1400 mg (for patients ≥80 kg)
- Schedule: Once weekly for the first 4 weeks (Days 1, 8, 15, and 22 of Cycle 1), then every 2 weeks thereafter (Days 1 and 15 of each subsequent cycle)
- Cycle length: 28 days

Premedication:
- Antihistamine (diphenhydramine 50 mg or equivalent)
- Antipyretic (acetaminophen 650 mg or equivalent)
- Corticosteroid (dexamethasone 10 mg or equivalent)`,
    efficacyAssessments: `Tumor assessments will be performed by CT or MRI at baseline, every 6 weeks for the first 6 months, and every 9 weeks thereafter until disease progression, using RECIST 1.1 criteria.

The primary efficacy endpoint is overall response rate (ORR), defined as the percentage of patients with a confirmed complete response (CR) or partial response (PR).

Secondary efficacy endpoints include:
- Duration of response (DOR)
- Progression-free survival (PFS)
- Overall survival (OS)`,
    safetyAssessments: `Safety assessments will include:
- Physical examinations
- Vital signs
- ECOG performance status
- 12-lead ECG
- Laboratory assessments (hematology, chemistry, coagulation, urinalysis)
- Adverse event monitoring

Adverse events will be coded using the Medical Dictionary for Regulatory Activities (MedDRA) and graded according to the National Cancer Institute Common Terminology Criteria for Adverse Events (NCI CTCAE) version 5.0.`,
  });
  
  // Effect to keep the generatedProtocolSections in sync with protocol.generatedProtocol
  useEffect(() => {
    console.log("Protocol Document: Checking for existing protocol data");
    let foundProtocolData = false;
    
    try {
      localStorage.removeItem(`protocol-${protocol.id}-generated`);
    } catch {}

    if (!foundProtocolData && protocol.generatedProtocol) {
      console.log("Protocol document: detected generatedProtocol data in protocol object");
      try {
        // Parse the generatedProtocol JSON
        const parsedSections = JSON.parse(protocol.generatedProtocol);
        if (Array.isArray(parsedSections) && parsedSections.length > 0) {
          console.log(`Protocol document: loaded ${parsedSections.length} sections from protocol.generatedProtocol`);
          setGeneratedProtocolSections(parsedSections);
          setShowGeneratedProtocol(true);
          foundProtocolData = true;
        }
      } catch (error) {
        console.error("Error parsing protocol.generatedProtocol:", error);
      }
    }
    
    // Log status for debugging
    console.log("Protocol document: showGeneratedProtocol =", showGeneratedProtocol);
    console.log("Protocol document: generatedProtocolSections.length =", generatedProtocolSections.length);
  }, [protocol.id, protocol.generatedProtocol]);
  
  // Function to generate the protocol document
  const generateProtocol = async () => {
    setGeneratingProtocol(true);
    setGenerationProgress(0);
    
    try {
      // Create a copy of the sections
      const sections = [...protocolSectionsToGenerate];
      const generatedSections: Array<{id: string; title: string; content: string}> = [];
      
      // Generate each section sequentially
      for (let i = 0; i < sections.length; i++) {
        const section = sections[i];
        
        // Update progress
        setGenerationProgress(Math.floor((i / sections.length) * 100));
        
        // Update section status
        sections[i] = { ...section, status: "generating" };
        setProtocolSectionsToGenerate(sections);
        
        try {
          // Call the API to generate this section
          const response = await fetch('/api/generate-document', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              protocol,
              sectionId: section.id,
              sectionTitle: section.title,
              previousSections: generatedSections, // Pass all previously generated sections
            }),
          });
          
          if (!response.ok) {
            throw new Error(`Failed to generate ${section.title}`);
          }
          
          const result = await response.json();
          
          // Add the generated section to our array
          if (result.sections && result.sections.length > 0) {
            const generatedSection = result.sections[0];
            generatedSections.push(generatedSection);
            
            // Update section status
            sections[i] = { ...section, status: "complete" };
          } else {
            // If no section was returned, mark as error
            sections[i] = { ...section, status: "error" };
          }
        } catch (error) {
          console.error(`Error generating section ${section.title}:`, error);
          sections[i] = { ...section, status: "error" };
        }
        
        setProtocolSectionsToGenerate(sections);
      }
      
      setGenerationProgress(100);
      setGeneratedProtocolSections(generatedSections);
      
      // Save the generated protocol to the database
      if (protocol.id && generatedSections.length > 0) {
        try {
          console.log(`Saving protocol with ID: ${protocol.id}`);
          // First try to get the protocol to check if it exists
          const getResponse = await fetch(`/api/protocols/${protocol.id}`);
          
          if (getResponse.ok) {
            // Protocol exists, update it
            const updateResponse = await fetch(`/api/protocols/${protocol.id}`, {
              method: 'PUT',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                generatedProtocol: JSON.stringify(generatedSections)
              }),
            });
            
            if (!updateResponse.ok) {
              throw new Error("Failed to update protocol in database");
            }
          } else {
            // Protocol doesn't exist, try to create it
            const createResponse = await fetch(`/api/protocols`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                id: protocol.id,
                title: protocol.title,
                phase: protocol.phase || "Phase 1",
                indication: protocol.indication || "Not specified",
                status: protocol.status || "Draft",
                synopsis: protocol.synopsis || "",
                supplementaryInfo: protocol.supplementaryInfo || "[]",
                createdBy: protocol.createdBy || "User",
                userId: protocol.userId || 1,
                tableData: protocol.tableData || "{}",
                tableHeaders: protocol.tableHeaders || "[]",
                inclusionCriteria: protocol.inclusionCriteria || "[]",
                exclusionCriteria: protocol.exclusionCriteria || "[]",
                dataVariables: protocol.dataVariables || "[]",
                generatedProtocol: JSON.stringify(generatedSections)
              }),
            });
            
            if (!createResponse.ok) {
              throw new Error("Failed to create protocol in database");
            }
          }
        } catch (updateError) {
          console.error("Error saving generated protocol:", updateError);
          toast({
            title: "Warning",
            description: "Protocol was generated but could not be saved to the database. You can still view and download it.",
            variant: "destructive"
          });
        }
      }
      
      toast({
        title: "Protocol Generated Successfully",
        description: "All sections of the protocol have been generated.",
        variant: "default"
      });
      
      // Show the generated protocol
      setShowGeneratedProtocol(true);
      
    } catch (error) {
      console.error("Error generating protocol:", error);
      toast({
        title: "Error Generating Protocol",
        description: "There was an error generating the protocol. Please try again.",
        variant: "destructive"
      });
    } finally {
      setGeneratingProtocol(false);
    }
  };
  
  // Define the protocol viewer component - don't return early
  const protocolViewer = showGeneratedProtocol ? (
    <GeneratedProtocolViewer 
      protocol={{
        ...protocol, 
        generatedProtocol: JSON.stringify(generatedProtocolSections),
        // Add missing required Protocol fields with fallback values
        phase: protocol.phase || "",
        indication: protocol.indication || "",
        status: protocol.status || "Draft",
        createdAt: protocol.createdAt || new Date(),
        createdBy: protocol.createdBy || ""
      }}
      onClose={() => setShowGeneratedProtocol(false)}
    />
  ) : null;
  
  // Toggle editing for a section
  const toggleEditing = (section: string) => {
    if (editingSection === section) {
      setEditingSection(null);
    } else {
      setEditingSection(section);
    }
  };
  
  // Handle section text change
  const handleSectionChange = (section: string, value: string) => {
    setProtocolSections({
      ...protocolSections,
      [section]: value
    });
  };
  
  // Render a protocol section
  const renderSection = (title: string, sectionKey: string, aiGenerated: boolean = true) => {
    const isEditing = editingSection === sectionKey;
    
    return (
      <div className="mb-8">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <h3 className="text-lg font-semibold">{title}</h3>
            {aiGenerated && <AIGeneratedBadge />}
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0"
            onClick={() => toggleEditing(sectionKey)}
          >
            {isEditing ? <Check size={16} /> : <Pencil size={16} />}
          </Button>
        </div>
        
        {isEditing ? (
          <div className="rounded-md border border-[#dee2e6] overflow-hidden">
            <div className="bg-[#f8f9fa] p-2 border-b border-[#dee2e6] flex items-center gap-1">
              <Button variant="ghost" size="icon" className="h-8 w-8 p-0">
                <Bold size={15} />
              </Button>
              <Button variant="ghost" size="icon" className="h-8 w-8 p-0">
                <Italic size={15} />
              </Button>
              <div className="h-6 w-px bg-[#dee2e6] mx-1"></div>
              <Button variant="ghost" size="icon" className="h-8 w-8 p-0">
                <List size={15} />
              </Button>
              <Button variant="ghost" size="icon" className="h-8 w-8 p-0">
                <ListOrdered size={15} />
              </Button>
            </div>
            <Textarea
              value={protocolSections[sectionKey as keyof typeof protocolSections]}
              onChange={(e) => handleSectionChange(sectionKey, e.target.value)}
              className="min-h-[150px] border-0 rounded-none focus-visible:ring-0"
              placeholder={`Enter ${title.toLowerCase()} here...`}
            />
          </div>
        ) : (
          <div className="text-sm whitespace-pre-line">
            {protocolSections[sectionKey as keyof typeof protocolSections]}
          </div>
        )}
      </div>
    );
  };
  
  // Only render the viewer if it's active, otherwise continue to main component render
  if (showGeneratedProtocol) {
    return protocolViewer;
  }
  
  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center mb-4">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-auto">
          <TabsList className="bg-white border border-[#dee2e6]">
            <TabsTrigger value="preview" className="data-[state=active]:bg-[#f8f9fa]">
              Preview
            </TabsTrigger>
            <TabsTrigger value="outline" className="data-[state=active]:bg-[#f8f9fa]">
              Outline
            </TabsTrigger>
          </TabsList>
        </Tabs>
        
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            className="flex items-center gap-1.5"
          >
            <Edit size={15} className="mr-1" />
            <span>Edit All</span>
          </Button>
          <Button
            variant="outline"
            className="flex items-center gap-1.5"
          >
            <Download size={15} className="mr-1" />
            <span>Export</span>
          </Button>
        </div>
      </div>
      
      <div className="bg-white rounded-md border border-[#dee2e6] overflow-hidden">
        <div className="bg-[#f8f9fa] p-3 border-b border-[#dee2e6] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileText size={18} className="text-[#495057]" />
            <h2 className="font-medium">Protocol Document</h2>
          </div>
        </div>
        
        <TabsContent value="preview" className="p-6 m-0">
          <div className="max-w-3xl mx-auto">
            <h1 className="text-2xl font-bold mb-6 text-center">{protocol.title}</h1>
            <h2 className="text-xl font-semibold mb-2">1. Synopsis</h2>
            {renderSection("1.1 Study Synopsis", "synopsis")}
            
            <h2 className="text-xl font-semibold mb-2">2. Introduction</h2>
            {renderSection("2.1 Background", "background")}
            
            <h2 className="text-xl font-semibold mb-2">3. Objectives</h2>
            {renderSection("3.1 Study Objectives", "objectives")}
            
            <h2 className="text-xl font-semibold mb-2">4. Study Design</h2>
            {renderSection("4.1 Overall Design", "studyDesign")}
            
            <h2 className="text-xl font-semibold mb-2">5. Study Population</h2>
            {renderSection("5.1 Eligibility Criteria", "studyPopulation")}
            
            <h2 className="text-xl font-semibold mb-2">6. Treatments</h2>
            {renderSection("6.1 Study Drug Administration", "treatments")}
            
            <h2 className="text-xl font-semibold mb-2">7. Efficacy Assessments</h2>
            {renderSection("7.1 Efficacy Endpoints", "efficacyAssessments")}
            
            <h2 className="text-xl font-semibold mb-2">8. Safety Assessments</h2>
            {renderSection("8.1 Safety Monitoring", "safetyAssessments")}
          </div>
        </TabsContent>
        
        <TabsContent value="outline" className="p-6 m-0">
          <div className="max-w-3xl mx-auto">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-lg font-semibold">Protocol Document Outline</h2>
              
              {generatingProtocol ? (
                <div className="flex items-center gap-2">
                  <span className="text-sm text-[#495057]">
                    Generating protocol... {Math.round(generationProgress)}%
                  </span>
                  <Progress value={generationProgress} className="w-[200px] h-2" />
                </div>
              ) : (
                <Button 
                  onClick={generateProtocol}
                  className="bg-[#228be6] hover:bg-[#1c7ed6] text-white flex items-center gap-2"
                >
                  <Zap size={16} />
                  <span>Generate Full Protocol</span>
                </Button>
              )}
            </div>
            
            {/* Show warning if protocol elements are missing */}
            {(!protocol.synopsis || !protocol.inclusionCriteria || !protocol.tableHeaders) && (
              <Card className="mb-6 border-[#fa5252] bg-[#fff5f5]">
                <CardHeader className="py-3">
                  <CardTitle className="text-sm text-[#fa5252] flex items-center gap-2">
                    <svg width="15" height="15" viewBox="0 0 15 15" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M7.5 0C3.35786 0 0 3.35786 0 7.5C0 11.6421 3.35786 15 7.5 15C11.6421 15 15 11.6421 15 7.5C15 3.35786 11.6421 0 7.5 0ZM6.75 3.75C6.75 3.33579 7.08579 3 7.5 3C7.91421 3 8.25 3.33579 8.25 3.75V8.25C8.25 8.66421 7.91421 9 7.5 9C7.08579 9 6.75 8.66421 6.75 8.25V3.75ZM8.25 11.25C8.25 11.6642 7.91421 12 7.5 12C7.08579 12 6.75 11.6642 6.75 11.25C6.75 10.8358 7.08579 10.5 7.5 10.5C7.91421 10.5 8.25 10.8358 8.25 11.25Z" fill="#fa5252" />
                    </svg>
                    <span>Protocol Elements Missing</span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="py-2 text-sm text-[#e03131]">
                  <p className="mb-2">
                    The following elements should be completed before generating the full protocol:
                  </p>
                  <ul className="list-disc pl-4 space-y-1">
                    {!protocol.synopsis && (
                      <li>Study Synopsis</li>
                    )}
                    {!protocol.tableHeaders && (
                      <li>Schedule of Activities</li>
                    )}
                    {!protocol.inclusionCriteria && (
                      <li>Inclusion/Exclusion Criteria</li>
                    )}
                  </ul>
                </CardContent>
              </Card>
            )}
            
            <ul className="space-y-4">
              {protocolSectionsToGenerate.map((section) => (
                <li key={section.id} className="border-b border-[#dee2e6] pb-3 last:border-0">
                  <div className="flex justify-between items-center">
                    <div className="flex items-center gap-2">
                      <h3 className="font-medium">{section.title}</h3>
                      {section.status === "complete" && (
                        <span className="text-xs bg-[#ebfbee] text-[#37b24d] px-2 py-0.5 rounded-full font-medium">
                          Generated
                        </span>
                      )}
                      {section.status === "generating" && (
                        <span className="text-xs bg-[#e7f5ff] text-[#228be6] px-2 py-0.5 rounded-full font-medium flex items-center gap-1">
                          <Loader2 size={10} className="animate-spin" />
                          Generating...
                        </span>
                      )}
                      {section.status === "error" && (
                        <span className="text-xs bg-[#fff5f5] text-[#fa5252] px-2 py-0.5 rounded-full font-medium">
                          Error
                        </span>
                      )}
                    </div>
                    
                    {section.status === "error" ? (
                      <Button 
                        variant="outline" 
                        size="sm"
                        className="h-8 text-[#fa5252]"
                      >
                        <RotateCcw size={14} className="mr-1" />
                        Retry
                      </Button>
                    ) : section.status === "complete" ? (
                      <Button 
                        variant="outline" 
                        size="sm"
                        className="h-8 text-[#1c7ed6]"
                      >
                        <Edit size={14} className="mr-1" />
                        Edit
                      </Button>
                    ) : section.status === "generating" ? (
                      <Button 
                        variant="outline" 
                        size="sm"
                        className="h-8 opacity-50 pointer-events-none"
                        disabled
                      >
                        <Loader2 size={14} className="mr-1 animate-spin" />
                        Generating...
                      </Button>
                    ) : (
                      <Button 
                        variant="outline" 
                        size="sm"
                        className="h-8 text-[#228be6]"
                        disabled={generatingProtocol}
                      >
                        Generate
                      </Button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
            
            {generatedProtocolSections.length > 0 && (
              <div className="mt-8 flex justify-center">
                <Button 
                  className="flex items-center gap-2 bg-[#228be6] hover:bg-[#1c7ed6] text-white"
                  onClick={() => setShowGeneratedProtocol(true)}
                >
                  <FileCheck size={16} />
                  <span>View Complete Protocol</span>
                  <ArrowRight size={16} />
                </Button>
              </div>
            )}
          </div>
        </TabsContent>
      </div>
    </div>
  );
};

export default ProtocolDocument;
