import { useState } from "react";
import { Button } from "@/components/ui/button";
import { CompareTrialsModal } from "./compare-trials-modal";
import { TrialsProcessingDialog } from "./trials-processing-dialog";
import { TrialComparisonResults } from "./trial-comparison-results";
import { Zap } from "lucide-react";

interface InclusionExclusionComparisonProps {
  protocol: any;
}

export function InclusionExclusionComparison({ protocol }: InclusionExclusionComparisonProps) {
  const [compareModalOpen, setCompareModalOpen] = useState(false);
  const [processingDialogOpen, setProcessingDialogOpen] = useState(false);
  const [selectedTrials, setSelectedTrials] = useState<any[]>([]);
  const [comparisonType, setComparisonType] = useState<string>("automatic");
  const [comparisonData, setComparisonData] = useState<any | null>(null);
  const [showResults, setShowResults] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  // Handle initial comparison button click
  const handleCompareClick = () => {
    // Reset state
    setComparisonData(null);
    setShowResults(false);
    setCompareModalOpen(true);
  };

  // Handle when user selects trials to compare
  const handleCompare = (trials: any[], type: string) => {
    console.log(`Starting comparison of ${trials.length} trials using ${type} mode`);
    
    setSelectedTrials(trials);
    setComparisonType(type);
    setCompareModalOpen(false);
    setProcessingDialogOpen(true);
  };

  // Handle when processing is complete
  const handleProcessingComplete = (data: any) => {
    console.log("Processing complete, received comparison data:", data);
    
    setComparisonData(data);
    setIsLoading(false);
    
    // Close the processing dialog and show results after a short delay
    setTimeout(() => {
      setProcessingDialogOpen(false);
      setShowResults(true);
    }, 1000);
  };

  // Handle closing the comparison results
  const handleCloseResults = () => {
    setShowResults(false);
    setComparisonData(null);
  };

  // Handle saving recommendations (functionality to be implemented)
  const handleSaveRecommendations = () => {
    console.log("Saving recommendations");
    // Implementation for saving recommendations would go here
    // This could update the protocol with the recommended criteria
    
    // Close results after saving
    setShowResults(false);
  };

  return (
    <>
      {/* Compare button with helper text */}
      <div className="mt-4 space-y-2">
        <Button 
          onClick={handleCompareClick} 
          className="bg-[#228be6] hover:bg-[#1864ab]"
          disabled={!protocol?.inclusionCriteria && !protocol?.exclusionCriteria}
        >
          <Zap className="mr-2 h-4 w-4" />
          Compare to Similar Trials
        </Button>
        
        {(!protocol?.inclusionCriteria && !protocol?.exclusionCriteria) ? (
          <p className="text-xs text-[#fa5252]">
            Generate inclusion/exclusion criteria first to enable comparison
          </p>
        ) : (
          <p className="text-xs text-[#6c757d]">
            Compare your criteria with similar clinical trials to identify missing or unusual requirements
          </p>
        )}
      </div>
      
      {/* Modal for selecting trials */}
      <CompareTrialsModal
        open={compareModalOpen}
        onOpenChange={setCompareModalOpen}
        onCompare={handleCompare}
        protocol={protocol}
      />
      
      {/* Dialog for processing trials data */}
      <TrialsProcessingDialog
        open={processingDialogOpen}
        onOpenChange={setProcessingDialogOpen}
        onComplete={handleProcessingComplete}
        selectedTrials={selectedTrials}
        comparisonType={comparisonType}
        protocol={protocol}
      />
      
      {/* Comparison results panel */}
      {showResults && comparisonData && (
        <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm">
          <div className="fixed inset-0 flex items-center justify-center">
            <div className="bg-background rounded-lg border shadow-lg w-[95vw] h-[95vh] max-w-[1500px] flex flex-col overflow-hidden">
              <TrialComparisonResults
                comparisonData={comparisonData}
                isLoading={isLoading}
                onClose={handleCloseResults}
                onSave={handleSaveRecommendations}
              />
            </div>
          </div>
        </div>
      )}
    </>
  );
}