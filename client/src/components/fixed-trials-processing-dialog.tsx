import React, { useState, useEffect } from "react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import { Progress } from "@/components/ui/progress"
import { Loader2, CheckCircle2, XCircle, AlertTriangle } from "lucide-react"
import { useToast } from "@/hooks/use-toast"

interface TrialsProcessingDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  selectedTrials: any[]
  currentCriteria: any
  onComparisonComplete: (comparisonData: any) => void
}

export function TrialsProcessingDialog({
  open,
  onOpenChange,
  selectedTrials,
  currentCriteria,
  onComparisonComplete
}: TrialsProcessingDialogProps) {
  const { toast } = useToast()
  const [processSteps, setProcessSteps] = useState<
    { status: "pending" | "processing" | "complete" | "error"; name: string; detail?: string }[]
  >([])
  const [overallProgress, setOverallProgress] = useState(0)
  const [isProcessing, setIsProcessing] = useState(false)
  const [comparisonData, setComparisonData] = useState<any>(null)
  
  // Initialize the steps when the dialog opens or selected trials change
  useEffect(() => {
    if (open && selectedTrials.length > 0) {
      console.log('TrialsProcessingDialog opened with', selectedTrials.length, 'trials');
      console.log('Sample trial details:', selectedTrials[0]?.nctId, selectedTrials[0]?.title);
      
      const newSteps: { status: "pending" | "processing" | "complete" | "error"; name: string; detail?: string }[] = [
        { status: "pending", name: "Extracting eligibility criteria" },
        { status: "pending", name: "Analyzing inclusion criteria" },
        { status: "pending", name: "Analyzing exclusion criteria" },
        { status: "pending", name: "Generating comparison results" }
      ]
      setProcessSteps(newSteps)
      setOverallProgress(0)
      setComparisonData(null)
      setIsProcessing(true)
      
      // Start processing the trials
      console.log('Starting processTrials function');
      processTrials()
    } else if (open) {
      console.log('Warning: TrialsProcessingDialog opened but no trials were provided', selectedTrials);
    }
  }, [open, selectedTrials])
  
  const processTrials = async () => {
    if (!selectedTrials.length) return
    
    // Log what we're sending to the API
    console.log("Processing trials with currentCriteria:", currentCriteria)
    
    try {
      // Step 1: Extract criteria
      updateStep(0, "processing")
      setOverallProgress(10)
      
      // Prepare array of trial IDs for processing
      const trialIds = selectedTrials.map(trial => trial.nctId)
      
      // Extract eligibility criteria from all selected trials
      const criteriaPromises = trialIds.map(async (nctId: string) => {
        try {
          const response = await fetch('/api/extract-trial-criteria', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ nctId }),
          })
          
          if (!response.ok) {
            throw new Error(`Failed to extract criteria for trial ${nctId}`)
          }
          
          const data = await response.json()
          return {
            nctId,
            title: selectedTrials.find(t => t.nctId === nctId)?.title || '',
            criteria: data
          }
        } catch (error) {
          console.error(`Error extracting criteria for trial ${nctId}:`, error)
          return {
            nctId,
            title: selectedTrials.find(t => t.nctId === nctId)?.title || '',
            error: true,
            criteria: { inclusionCriteria: [], exclusionCriteria: [] }
          }
        }
      })
      
      // Wait for all extraction to complete
      const extractedCriteria = await Promise.all(criteriaPromises)
      const validCriteria = extractedCriteria.filter(c => !c.error)
      
      console.log("Extracted valid criteria:", validCriteria.length)
      
      if (validCriteria.length === 0) {
        throw new Error('Failed to extract criteria from any of the selected trials')
      }
      
      updateStep(0, "complete")
      setOverallProgress(40)
      
      // Steps 2-3: Analyze inclusion and exclusion criteria
      updateStep(1, "processing")
      setOverallProgress(50)
      
      try {
        console.log("Calling API to compare criteria");
        
        // If there's no current criteria, use an empty structure
        const protocolCriteria = currentCriteria || {
          inclusionCriteria: [],
          exclusionCriteria: []
        };
        
        // Prepare comparison criteria in the expected format
        const comparisonCriteriaArray = validCriteria.map(trial => ({
          nctId: trial.nctId,
          title: trial.title,
          criteria: {
            inclusionCriteria: trial.criteria.inclusionCriteria || [],
            exclusionCriteria: trial.criteria.exclusionCriteria || []
          }
        }));
        
        // Send to backend for comparison
        const response = await fetch('/api/compare-criteria', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            protocolCriteria: protocolCriteria,
            comparisonCriteria: comparisonCriteriaArray
          }),
        });
        
        if (!response.ok) {
          const errorText = await response.text();
          console.error('Error response from server:', errorText);
          throw new Error('Failed to compare criteria: ' + errorText);
        }
        
        console.log("API call successful");
        const comparisonResults = await response.json();
        console.log("API response:", Object.keys(comparisonResults));
        
        if (!comparisonResults || Object.keys(comparisonResults).length === 0) {
          throw new Error('Received empty response from the server');
        }
        
        updateStep(1, "complete")
        updateStep(2, "complete")
        setOverallProgress(80)
        
        // Step 4: Generate comparison results
        updateStep(3, "processing")
        setOverallProgress(90)
        
        // Create a complete data structure for the comparison results
        // This helps ensure we have all the expected fields even if the API response is missing some
        const enhancedData = {
          // Keep all original data from the AI analysis
          ...comparisonResults,
          // Add trial metadata
          trials: validCriteria.map(c => ({
            nctId: c.nctId,
            title: c.title
          })),
          // Ensure required properties exist with defaults if missing
          summary: comparisonResults.summary || { 
            overview: "Analysis of similar trials completed." 
          },
          statistics: comparisonResults.statistics || {
            totalInclusion: 0,
            totalExclusion: 0,
            commonInclusion: 0,
            commonExclusion: 0
          },
          commonCriteria: comparisonResults.commonCriteria || {
            inclusion: [],
            exclusion: []
          },
          recommendations: comparisonResults.recommendations || {
            inclusion: [],
            exclusion: []
          },
          strengths: comparisonResults.strengths || [],
          gaps: comparisonResults.gaps || []
        };
        
        console.log("Final enhanced data for comparison results:", Object.keys(enhancedData));
        setComparisonData(enhancedData);
        updateStep(3, "complete");
        setOverallProgress(100);
        
        // Small delay before calling complete to show the progress
        setTimeout(() => {
          setIsProcessing(false);
          onComparisonComplete(enhancedData);
        }, 1000);
        
      } catch (error: any) {
        console.error('Error comparing criteria:', error);
        updateStep(1, "error", "Error analyzing criteria");
        updateStep(2, "error", "Error analyzing criteria");
        updateStep(3, "error", "Error generating comparison");
        toast({
          title: "Comparison Failed",
          description: error.message || "There was an error comparing the trial criteria. Please try again.",
          variant: "destructive",
        });
        setIsProcessing(false);
      }
      
    } catch (error: any) {
      console.error('Error processing trials:', error);
      updateStep(0, "error", error.message || 'Unknown error occurred');
      toast({
        title: "Processing Failed",
        description: error.message || "There was an error processing the selected trials. Please try again.",
        variant: "destructive",
      });
      setIsProcessing(false);
    }
  };
  
  // Helper to update a step's status
  const updateStep = (index: number, status: "pending" | "processing" | "complete" | "error", detail?: string) => {
    setProcessSteps(prev => {
      const newSteps = [...prev];
      newSteps[index] = { ...newSteps[index], status, detail };
      return newSteps;
    });
  };
  
  // Render status icon for a step
  const StepStatusIcon = ({ status }: { status: "pending" | "processing" | "complete" | "error" }) => {
    switch (status) {
      case "processing":
        return <Loader2 className="h-5 w-5 text-primary animate-spin" />;
      case "complete":
        return <CheckCircle2 className="h-5 w-5 text-green-500" />;
      case "error":
        return <XCircle className="h-5 w-5 text-red-500" />;
      default:
        return <div className="h-5 w-5 rounded-full border border-gray-300" />;
    }
  };
  
  return (
    <Dialog open={open} onOpenChange={(value) => {
      // Only allow closing if not processing
      if (!isProcessing) {
        onOpenChange(value);
      }
    }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Comparing with Selected Trials</DialogTitle>
          <DialogDescription>
            Extracting and analyzing eligibility criteria from {selectedTrials.length} trials
          </DialogDescription>
        </DialogHeader>
        
        <div className="py-4">
          <Progress value={overallProgress} className="h-2 mb-6" />
          
          <div className="space-y-4">
            {processSteps.map((step, index) => (
              <div key={index} className="flex items-center gap-2">
                <StepStatusIcon status={step.status} />
                <div className="flex-1">
                  <p className={`text-sm font-medium ${
                    step.status === "error" ? "text-red-500" : ""
                  }`}>
                    {step.name}
                  </p>
                  {step.detail && (
                    <p className="text-xs text-[#6c757d]">{step.detail}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
          
          {processSteps.some(step => step.status === "error") && (
            <div className="mt-6 p-3 bg-red-50 border border-red-200 rounded-md flex items-start gap-2">
              <AlertTriangle className="h-5 w-5 text-red-500 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-red-700">Error Processing Trials</p>
                <p className="text-xs text-red-600 mt-1">
                  There was an error analyzing the selected trials. Please try again with different trials.
                </p>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}