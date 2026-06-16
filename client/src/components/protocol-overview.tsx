import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Lightbulb, Microscope } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { DelphiProtocolView } from "./protocol-components/delphi-protocol-view";
import { DefaultProtocolView } from "./protocol-components/default-protocol-view";

// Protocol types
interface DesignState {
  id: string;
  protocolId: string;
  name: string;
  createdAt: string;
  studyParameters?: any;
  inclusionCriteria?: any[];
  exclusionCriteria?: any[];
  scheduleOfAssessments?: any;
  dataVariables?: any[];
  qualityMetrics?: {
    scientificRigor?: {
      score: number;
      assessment: string;
    };
    clinicalRelevance?: {
      score: number;
      assessment: string;
    };
    feasibility?: {
      score: number;
      assessment: string;
    };
  };
}

interface Protocol {
  id: string;
  title: string;
  phase: string;
  indication: string;
  status: string;
  protocolType: string;
  synopsis: string;
  supplementaryInfo: string;
  createdBy: string;
  userId: number;
  tableData: any;
  tableHeaders: any[];
  inclusionCriteria: any[];
  exclusionCriteria: any[];
  dataVariables: any[];
  generatedProtocol: any;
  lastEdited: string;
  createdAt: string;
  overview?: {
    summary: string;
    clinicalContext: string;
    objectives: string;
    endpoints: string;
    design: string;
    targetPopulation: string;
    significance: string;
    keyParameters?: Record<string, any>;
  } | null;
}

interface ProtocolOverviewProps {
  protocol: Protocol;
  activeDesignState?: DesignState;
  setProtocol: React.Dispatch<React.SetStateAction<Protocol>>;
  setActiveDesignState?: React.Dispatch<React.SetStateAction<any>>;
}

export default function ProtocolOverview({
  protocol,
  activeDesignState,
  setProtocol,
  setActiveDesignState
}: ProtocolOverviewProps) {
  const [overviewData, setOverviewData] = useState<{
    summary: string;
    clinicalContext: string;
    objectives: string;
    endpoints: string;
    design: string;
    targetPopulation: string;
    significance: string;
    keyParameters?: Record<string, any>;
  } | null>(null);
  
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Diagnostic logging - for debugging purposes
  console.log("Protocol data:", {
    id: protocol.id,
    protocolType: protocol.protocolType,
    title: protocol.title
  });
  
  // Generate the overview from the synopsis and trigger quality analysis
  const generateOverview = async () => {
    if (!protocol.synopsis || protocol.synopsis.trim().length < 50) {
      setError("Please provide a more detailed synopsis to generate an overview");
      return;
    }
    
    setGenerating(true);
    setError(null);
    
    try {
      // First, generate the protocol overview with protocol type
      const response = await apiRequest(
        'POST', 
        '/api/generate-protocol-overview', 
        { 
          protocolId: protocol.id,
          synopsis: protocol.synopsis,
          activeDesignStateId: activeDesignState?.id,
          protocolType: protocol.protocolType // Pass protocol type to ensure correct formatting
        }
      );
      
      if (!response.ok) {
        throw new Error('Failed to generate protocol overview');
      }
      
      const data = await response.json();
      setOverviewData(data.overview);
      
      // Update the protocol with the overview
      setProtocol(prev => ({
        ...prev,
        overview: data.overview
      }));
      
      // Also trigger quality metrics analysis if we have an active design state
      if (activeDesignState?.id) {
        console.log(`Running quality metrics analysis for design state ${activeDesignState.id}`);
        
        const qualityResponse = await apiRequest(
          'POST',
          `/api/protocols/${protocol.id}/design-states/${activeDesignState.id}/quality-metrics`,
          {
            protocolId: protocol.id,
            designStateId: activeDesignState.id,
            synopsis: protocol.synopsis
          }
        );
        
        if (qualityResponse.ok) {
          const qualityData = await qualityResponse.json();
          console.log('Quality metrics analysis complete:', qualityData);
          
          // Update the active design state with quality metrics
          if (qualityData && qualityData.designState && setActiveDesignState) {
            // Refresh the active design state to reflect the updated metrics
            console.log('Updating active design state with quality metrics data', qualityData.designState);
            setActiveDesignState(qualityData.designState);
          }
        }
      }
      
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unknown error occurred');
    } finally {
      setGenerating(false);
    }
  };
  
  // Load existing overview data if it exists
  useEffect(() => {
    if (protocol.overview) {
      setOverviewData(protocol.overview);
    }
    
    // We'll only regenerate overview when user explicitly requests it
    // by clicking the generate button, not automatically
  }, [protocol.overview]);
  
  // Show a loading state when first generating
  if (generating) {
    return (
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Protocol Overview</CardTitle>
          <CardDescription>Generating comprehensive protocol overview...</CardDescription>
        </CardHeader>
        <CardContent>
          <Progress value={undefined} className="w-full mb-4" />
          <p className="text-sm text-gray-500">
            Analyzing clinical context, study objectives, endpoints, and significance...
          </p>
        </CardContent>
      </Card>
    );
  }
  
  // If no overview data exists yet, show a prompt to generate it
  if (!overviewData) {
    return (
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Protocol Overview</CardTitle>
          <CardDescription>Generate a comprehensive overview based on your study synopsis</CardDescription>
        </CardHeader>
        <CardContent>
          <Alert className="mb-4">
            <Lightbulb className="h-4 w-4" />
            <AlertTitle>No Overview Available</AlertTitle>
            <AlertDescription>
              Generate a detailed overview to understand key elements of your study at a glance.
              This will help ensure alignment across protocol components.
            </AlertDescription>
          </Alert>
          
          <Button 
            onClick={generateOverview}
            disabled={!protocol.synopsis || protocol.synopsis.trim().length < 50}
            className="bg-blue-500 hover:bg-blue-600 text-white"
          >
            <Microscope className="h-4 w-4 mr-2" />
            Generate Overview from Synopsis
          </Button>
          
          {error && (
            <p className="text-red-500 text-sm mt-2">{error}</p>
          )}
        </CardContent>
      </Card>
    );
  }
  
  // DETERMINE PROTOCOL TYPE - CRITICAL PATH
  // Emergency override: HARD-CODE DELPHI UI FOR ALL PROTOCOLS
  const isDelphi = true; // Force Delphi UI for ALL protocols during debugging
    
  console.log("Protocol type decision:", {
    id: protocol.id, 
    protocolType: protocol.protocolType,
    isDelphi: isDelphi
  });
  console.log("EMERGENCY OVERRIDE: Forcing Delphi UI for all protocols");
  
  // Return the appropriate view based on protocol type
  if (isDelphi) {
    return (
      <DelphiProtocolView 
        overviewData={overviewData} 
        onRefresh={generateOverview} 
      />
    );
  }
  
  // Default view for all other protocol types
  return (
    <DefaultProtocolView
      protocol={protocol}
      activeDesignState={activeDesignState}
      overviewData={overviewData}
      onRefresh={generateOverview}
    />
  );
}