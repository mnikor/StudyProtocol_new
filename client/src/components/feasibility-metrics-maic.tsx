import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Info } from 'lucide-react';
import { DesignState } from '@shared/schema';

interface FeasibilityMetricsMAICProps {
  designState: DesignState;
}

export function FeasibilityMetricsMAIC({ designState }: FeasibilityMetricsMAICProps) {
  // Return null if design state is undefined or no feasibility metrics
  if (!designState || !designState.feasibilityMetrics) {
    return null;
  }

  // Extract MAIC-specific metrics
  const {
    dataAvailability,
    matchingVariableOverlap,
    statisticalPrecision,
    publicationBiasRisk,
    overallScore
  } = designState.feasibilityMetrics;

  // Convert a value in range -1 to 1 to 0-100 for progress bar
  const normalizeValue = (value: number | undefined) => {
    if (value === undefined) return 50;
    return (value + 1) * 50;
  };

  // Determine color based on value (red for high risk, green for low risk)
  const getProgressColor = (value: number | undefined, inverse: boolean = false) => {
    if (value === undefined) return 'bg-gray-300';
    
    const normalizedValue = normalizeValue(value);
    
    if (inverse) {
      // For inverse metrics (where higher is worse)
      return normalizedValue > 80 ? 'bg-red-500' :
             normalizedValue > 50 ? 'bg-yellow-500' : 'bg-green-500';
    } else {
      // For normal metrics (where higher is better)
      return normalizedValue > 80 ? 'bg-green-500' :
             normalizedValue > 50 ? 'bg-yellow-500' : 'bg-red-500';
    }
  };

  return (
    <div className="space-y-4">
      {dataAvailability !== undefined && (
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Data Availability</CardTitle>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div>
                      <Info className="h-5 w-5 ml-1 text-blue-500 animate-pulse cursor-help" />
                    </div>
                  </TooltipTrigger>
                  <TooltipContent className="w-80">
                    <p className="text-sm font-semibold mb-1">Data Availability</p>
                    <p className="text-sm mb-1">
                      Assesses whether required individual patient data (IPD) from the source study and aggregate data from the target study are available and complete. This is based on the information provided in your synopsis about what data you have access to.
                    </p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
          </CardHeader>
          <CardContent>
            <div>
              <Progress 
                value={normalizeValue(dataAvailability)} 
                className="w-4/5" 
                indicatorClassName={getProgressColor(dataAvailability)}
              />
              <div className="flex justify-between text-xs mt-1 w-4/5">
                <span>Limited Data</span>
                <span>Adequate</span>
                <span>Complete</span>
              </div>
            </div>
            <span className="font-bold text-lg">
              {dataAvailability > 0 ? "+" : ""}
              {Math.round(dataAvailability * 100)}%
            </span>
          </CardContent>
        </Card>
      )}
      
      {matchingVariableOverlap !== undefined && (
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Matching Variable Overlap</CardTitle>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div>
                      <Info className="h-5 w-5 ml-1 text-blue-500 animate-pulse cursor-help" />
                    </div>
                  </TooltipTrigger>
                  <TooltipContent className="w-80">
                    <p className="text-sm font-semibold mb-1">Matching Variable Overlap</p>
                    <p className="text-sm mb-1">
                      Evaluates the extent to which important prognostic factors and effect modifiers are available in both the source and target studies for matching. Based on the description of baseline characteristics mentioned in your synopsis.
                    </p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
          </CardHeader>
          <CardContent>
            <div>
              <Progress 
                value={normalizeValue(matchingVariableOverlap)} 
                className="w-4/5" 
                indicatorClassName={getProgressColor(matchingVariableOverlap)}
              />
              <div className="flex justify-between text-xs mt-1 w-4/5">
                <span>Limited Overlap</span>
                <span>Partial</span>
                <span>Extensive</span>
              </div>
            </div>
            <span className="font-bold text-lg">
              {matchingVariableOverlap > 0 ? "+" : ""}
              {Math.round(matchingVariableOverlap * 100)}%
            </span>
          </CardContent>
        </Card>
      )}
      
      {statisticalPrecision !== undefined && (
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Statistical Precision</CardTitle>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div>
                      <Info className="h-5 w-5 ml-1 text-blue-500 animate-pulse cursor-help" />
                    </div>
                  </TooltipTrigger>
                  <TooltipContent className="w-80">
                    <p className="text-sm font-semibold mb-1">Statistical Precision</p>
                    <p className="text-sm mb-1">
                      Estimates the potential effective sample size after matching/weighting and the expected width of confidence intervals. Based on sample sizes mentioned in your synopsis and the expected reduction in effective sample size after matching.
                    </p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
          </CardHeader>
          <CardContent>
            <div>
              <Progress 
                value={normalizeValue(statisticalPrecision)} 
                className="w-4/5" 
                indicatorClassName={getProgressColor(statisticalPrecision)}
              />
              <div className="flex justify-between text-xs mt-1 w-4/5">
                <span>Low Precision</span>
                <span>Moderate</span>
                <span>High Precision</span>
              </div>
            </div>
            <span className="font-bold text-lg">
              {statisticalPrecision > 0 ? "+" : ""}
              {Math.round(statisticalPrecision * 100)}%
            </span>
          </CardContent>
        </Card>
      )}
      
      {publicationBiasRisk !== undefined && (
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Publication Bias Risk</CardTitle>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div>
                      <Info className="h-5 w-5 ml-1 text-blue-500 animate-pulse cursor-help" />
                    </div>
                  </TooltipTrigger>
                  <TooltipContent className="w-80">
                    <p className="text-sm font-semibold mb-1">Publication Bias Risk</p>
                    <p className="text-sm mb-1">
                      Evaluates the risk that the available target trial data may be affected by publication bias. Assessment based on how the target study was selected and whether the analysis was pre-specified in your synopsis.
                    </p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
          </CardHeader>
          <CardContent>
            <div>
              <Progress 
                value={normalizeValue(publicationBiasRisk)} 
                className="w-4/5" 
                indicatorClassName={getProgressColor(publicationBiasRisk, true)}
              />
              <div className="flex justify-between text-xs mt-1 w-4/5">
                <span>Low Risk</span>
                <span>Moderate</span>
                <span>High Risk</span>
              </div>
            </div>
            <span className="font-bold text-lg">
              {publicationBiasRisk > 0 ? "+" : ""}
              {Math.round(publicationBiasRisk * 100)}%
            </span>
          </CardContent>
        </Card>
      )}
    </div>
  );
}