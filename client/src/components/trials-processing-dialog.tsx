import { useState, useEffect } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Zap, CheckCircle, XCircle, Loader2 } from "lucide-react";
import { Progress } from "@/components/ui/progress";

interface TrialsProcessingDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onComplete: (data: any) => void;
  selectedTrials: any[];
  comparisonType: string;
  protocol: any;
}

export function TrialsProcessingDialog({
  open,
  onOpenChange,
  onComplete,
  selectedTrials,
  comparisonType,
  protocol
}: TrialsProcessingDialogProps) {
  const [step, setStep] = useState(1);
  const [status, setStatus] = useState<"pending" | "success" | "error">("pending");
  const [progress, setProgress] = useState(0);
  const [detailedStatus, setDetailedStatus] = useState("");
  const [currentTrial, setCurrentTrial] = useState<string | null>(null);
  const [extractedData, setExtractedData] = useState<any[]>([]);
  const [comparisonResult, setComparisonResult] = useState<any | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Reset state when dialog opens
  useEffect(() => {
    if (open) {
      setStep(1);
      setStatus("pending");
      setProgress(0);
      setDetailedStatus("Starting extraction process...");
      setCurrentTrial(null);
      setExtractedData([]);
      setComparisonResult(null);
      setError(null);
      
      // Begin processing
      processTrials();
    }
  }, [open]);

  // Process the selected trials
  const processTrials = async () => {
    if (!selectedTrials.length || !protocol) return;
    
    try {
      // Step 1: Extract criteria from each trial
      setStep(1);
      setDetailedStatus("Extracting eligibility criteria from selected trials...");
      
      const extractedTrialData = [];
      let counter = 0;
      
      for (const trial of selectedTrials) {
        setCurrentTrial(trial.nctId);
        setDetailedStatus(`Extracting data from trial ${trial.nctId}...`);
        
        try {
          // Extract criteria for this trial
          const response = await fetch('/api/extract-trial-criteria', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              nctId: trial.nctId
            }),
          });
          
          if (!response.ok) {
            throw new Error(`Failed to extract criteria from trial ${trial.nctId}`);
          }
          
          const criteriaData = await response.json();
          
          // Add to extracted data
          extractedTrialData.push({
            nctId: trial.nctId,
            title: trial.title,
            criteria: criteriaData
          });
          
          // Update progress
          counter++;
          setProgress(Math.round((counter / selectedTrials.length) * 50)); // First 50% is extraction
        } catch (trialError) {
          console.error(`Error extracting criteria from trial ${trial.nctId}:`, trialError);
          setDetailedStatus(`Warning: Could not extract criteria from trial ${trial.nctId}. Continuing with remaining trials...`);
        }
      }
      
      setExtractedData(extractedTrialData);
      
      if (extractedTrialData.length === 0) {
        throw new Error("Could not extract criteria from any of the selected trials");
      }
      
      // Step 2: Compare criteria
      setStep(2);
      setDetailedStatus("Comparing eligibility criteria with your protocol...");
      setProgress(50); // At 50% after extraction
      
      // Get current protocol criteria
      let currentCriteria;
      
      if (protocol.inclusionExclusionCriteria) {
        currentCriteria = protocol.inclusionExclusionCriteria.content;
      } else {
        throw new Error("Current protocol does not have inclusion/exclusion criteria defined");
      }
      
      // Compare criteria
      const compareResponse = await fetch('/api/compare-criteria', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          currentCriteria,
          comparisonCriteria: extractedTrialData
        }),
      });
      
      if (!compareResponse.ok) {
        throw new Error("Failed to compare criteria");
      }
      
      // Process the comparison result
      const result = await compareResponse.json();
      setComparisonResult(result);
      
      // Complete processing
      setProgress(100);
      setStatus("success");
      setDetailedStatus("Analysis complete!");
      
      // Pass result to parent component
      onComplete(result);
    } catch (error: any) {
      console.error("Error processing trials:", error);
      setStatus("error");
      setError(error.message || "An unknown error occurred during processing");
      setDetailedStatus("Processing failed. See error details.");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <div className="flex flex-col items-center py-6">
          {status === "pending" && (
            <div className="text-center">
              <div className="bg-blue-50 p-3 rounded-full inline-flex mb-4">
                {step === 1 ? (
                  <Loader2 className="h-6 w-6 text-blue-500 animate-spin" />
                ) : (
                  <Zap className="h-6 w-6 text-blue-500" />
                )}
              </div>
              
              <h3 className="text-lg font-medium mb-2">
                {step === 1 ? "Extracting Trial Data" : "Analyzing Eligibility Criteria"}
              </h3>
              
              <p className="text-sm text-gray-500 mb-4">{detailedStatus}</p>
              
              {currentTrial && (
                <div className="text-xs text-gray-400 mb-2">
                  Current trial: {currentTrial}
                </div>
              )}
              
              <Progress value={progress} className="h-2 w-full mb-2" />
              
              <div className="text-xs text-gray-400">
                Step {step} of 2 • {progress}% complete
              </div>
            </div>
          )}
          
          {status === "success" && (
            <div className="text-center">
              <div className="bg-green-50 p-3 rounded-full inline-flex mb-4">
                <CheckCircle className="h-6 w-6 text-green-500" />
              </div>
              
              <h3 className="text-lg font-medium mb-2">Analysis Complete!</h3>
              
              <p className="text-sm text-gray-500 mb-4">
                Successfully analyzed {selectedTrials.length} trials and compared with your protocol.
              </p>
              
              <div className="text-xs text-gray-400">
                Results will load automatically...
              </div>
            </div>
          )}
          
          {status === "error" && (
            <div className="text-center">
              <div className="bg-red-50 p-3 rounded-full inline-flex mb-4">
                <XCircle className="h-6 w-6 text-red-500" />
              </div>
              
              <h3 className="text-lg font-medium mb-2">Analysis Failed</h3>
              
              <p className="text-sm text-gray-500 mb-4">{detailedStatus}</p>
              
              {error && (
                <div className="bg-red-50 p-4 rounded-md text-sm text-red-800 mb-4 text-left">
                  <p className="font-medium mb-1">Error details:</p>
                  <p>{error}</p>
                </div>
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}