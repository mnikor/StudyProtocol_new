"use client"

import React, { useState, useEffect } from "react"
import { 
  Plus, 
  Trash2, 
  AlertCircle,
  BarChart2,
  LineChart,
  Calculator,
  Users,
  Pencil,
  Save,
  X,
  Download,
  Zap,
  Loader2,
  Clock,
  Shield,
  Search,
  Target,
  Sparkles,
  Info
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { 
  Accordion, 
  AccordionContent, 
  AccordionItem, 
  AccordionTrigger 
} from "@/components/ui/accordion"
import { 
  Card, 
  CardContent, 
  CardDescription, 
  CardFooter, 
  CardHeader, 
  CardTitle 
} from "@/components/ui/card"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog"
import { 
  Tooltip, 
  TooltipContent, 
  TooltipProvider, 
  TooltipTrigger 
} from "@/components/ui/tooltip"
import { Badge } from "@/components/ui/badge"
import { AIOriginBadge } from "@/components/ai-origin-badge"
import { ProvenanceInfo } from "@/components/provenance-info"
import { AIProcessingButton } from "@/components/ai-processing-button"
import { useToast } from "@/hooks/use-toast"
import { Protocol, SampleSize } from "@shared/schema"
import { CommentTrigger } from "@/components/comment-trigger"
import { formatSupplementaryInfoForAI } from "@/lib/supplementary-info"
import { SectionGenerationMode, SectionSourcePanel } from "@/components/section-source-panel"
import { getApiErrorMessage } from "@/lib/api-error"

// Helper function to get protocol-type-specific field configurations
const getProtocolTypeConfig = (protocolType: string) => {
  switch (protocolType) {
    case 'interventional_clinical_trial':
      return {
        terminology: {
          primary: 'Primary Endpoints',
          secondary: 'Secondary Endpoints', 
          exploratory: 'Exploratory Endpoints',
          singular: 'endpoint'
        },
        requiredFields: ['timepoint', 'method', 'description'],
        additionalFields: {
          timepoint: { label: 'Time Point', placeholder: 'e.g., Week 12, End of Treatment' },
          method: { label: 'Assessment Method', placeholder: 'e.g., RECIST 1.1, ECOG Performance Status' },
          description: { label: 'Description', placeholder: 'Detailed description of the endpoint' },
          statisticalApproach: { label: 'Statistical Approach', placeholder: 'e.g., Log-rank test, Cox regression' }
        },
        specificSections: ['interimAnalysis', 'estimands', 'multiplicityControl', 'missingDataHandling']
      };
    case 'retrospective_cohort_study':
      return {
        terminology: {
          primary: 'Primary Outcomes',
          secondary: 'Secondary Outcomes',
          exploratory: 'Exploratory Outcomes', 
          singular: 'outcome'
        },
        requiresExposure: true,
        exposureFields: {
          name: { label: 'Exposure Name', placeholder: 'e.g., Drug A vs Drug B, Surgical vs Medical treatment' },
          definition: { label: 'Exposure Definition', placeholder: 'e.g., First prescription within study period' },
          ascertainment: { label: 'Exposure Ascertainment', placeholder: 'e.g., NDC codes, procedure codes, diagnosis codes' },
          categories: { label: 'Exposure Categories', placeholder: 'e.g., Exposed vs Unexposed, Current vs Former vs Never' },
          lookbackPeriod: { label: 'Lookback Period', placeholder: 'e.g., 12 months prior to index, Lifetime history' }
        },
        requiredFields: ['dataSource', 'ascertainment', 'description'],
        additionalFields: {
          dataSource: { label: 'Data Source', placeholder: 'e.g., EHR, Claims database, Registry' },
          ascertainment: { label: 'Outcome Ascertainment', placeholder: 'e.g., ICD-10 codes, Lab values' },
          description: { label: 'Description', placeholder: 'Detailed description of the outcome' },
          validationApproach: { label: 'Validation Approach', placeholder: 'e.g., Chart review, Algorithm validation' }
        },
        specificSections: ['exposureDefinition', 'biasAssessment', 'propensityScore', 'negativeControls', 'missingDataHandling']
      };
    case 'secondary_data_analysis':
      return {
        terminology: {
          primary: 'Primary Outcomes',
          secondary: 'Secondary Outcomes',
          exploratory: 'Exploratory Outcomes', 
          singular: 'outcome'
        },
        requiresExposure: false, // Often descriptive studies
        requiredFields: ['dataSource', 'ascertainment', 'description'],
        additionalFields: {
          dataSource: { label: 'Data Source', placeholder: 'e.g., EHR, Claims database, Registry' },
          ascertainment: { label: 'Outcome Ascertainment', placeholder: 'e.g., ICD-10 codes, Lab values' },
          description: { label: 'Description', placeholder: 'Detailed description of the outcome' },
          validationApproach: { label: 'Validation Approach', placeholder: 'e.g., Chart review, Algorithm validation' }
        },
        specificSections: ['biasAssessment', 'propensityScore', 'negativeControls', 'missingDataHandling']
      };
    case 'prospective_cohort_study':
      return {
        terminology: {
          primary: 'Primary Outcomes',
          secondary: 'Secondary Outcomes',
          exploratory: 'Exploratory Outcomes', 
          singular: 'outcome'
        },
        requiresExposure: true,
        exposureFields: {
          name: { label: 'Exposure Name', placeholder: 'e.g., Drug A vs Drug B, High vs Low dose' },
          definition: { label: 'Exposure Definition', placeholder: 'e.g., Prescription fill within 30 days of index' },
          ascertainment: { label: 'Exposure Ascertainment', placeholder: 'e.g., NDC codes, pharmacy records, clinical notes' },
          categories: { label: 'Exposure Categories', placeholder: 'e.g., Exposed vs Unexposed, High vs Medium vs Low' },
          window: { label: 'Exposure Window', placeholder: 'e.g., Index date to treatment discontinuation' }
        },
        requiredFields: ['timepoint', 'ascertainment', 'description'],
        additionalFields: {
          timepoint: { label: 'Follow-up Time Point', placeholder: 'e.g., 1 year, 5 years, End of study' },
          ascertainment: { label: 'Outcome Ascertainment', placeholder: 'e.g., Clinical assessment, Patient-reported' },
          description: { label: 'Description', placeholder: 'Detailed description of the outcome' },
          followupPeriod: { label: 'Follow-up Period', placeholder: 'e.g., 2 years post-index, Until death/censoring' }
        },
        specificSections: ['exposureDefinition', 'biasAssessment', 'interimAnalysis', 'missingDataHandling']
      };
    case 'cross_sectional_survey':
    case 'qualitative_study':
    case 'mixed_methods':
      return {
        terminology: {
          primary: 'Primary Measures',
          secondary: 'Secondary Measures',
          exploratory: 'Exploratory Measures',
          singular: 'measure'
        },
        requiredFields: ['instrument', 'scale', 'description'],
        additionalFields: {
          instrument: { label: 'Measurement Instrument', placeholder: 'e.g., DASS-21, Custom questionnaire' },
          scale: { label: 'Scale/Scoring', placeholder: 'e.g., Likert 1-5, Binary yes/no' },
          description: { label: 'Description', placeholder: 'Detailed description of the measure' },
          reliability: { label: 'Reliability/Validity', placeholder: 'e.g., Cronbach\'s alpha = 0.85' }
        },
        specificSections: ['samplingStrategy', 'responseRateAnalysis']
      };
    case 'delphi_consensus':
      return {
        terminology: {
          primary: 'Primary Questions',
          secondary: 'Secondary Questions', 
          exploratory: 'Exploratory Questions',
          singular: 'question'
        },
        requiredFields: ['consensusThreshold', 'rounds', 'description'],
        additionalFields: {
          consensusThreshold: { label: 'Consensus Threshold', placeholder: 'e.g., 70% agreement, IQR ≤ 1' },
          rounds: { label: 'Maximum Rounds', placeholder: 'e.g., 3 rounds, Until convergence' },
          description: { label: 'Description', placeholder: 'Detailed description of the question' },
          stabilityMeasure: { label: 'Stability Measure', placeholder: 'e.g., Change in median < 0.5' }
        },
        specificSections: ['expertPanel', 'consensusMetrics']
      };
    case 'maic':
      return {
        terminology: {
          primary: 'Primary Outcomes',
          secondary: 'Secondary Outcomes',
          exploratory: 'Exploratory Outcomes',
          singular: 'outcome'
        },
        requiresExposure: true,
        exposureFields: {
          targetTreatment: { label: 'Target Treatment', placeholder: 'e.g., Drug A, Intervention X' },
          targetSource: { label: 'Target Population Source', placeholder: 'e.g., Trial ABC, Registry XYZ' },
          comparatorTreatment: { label: 'Comparator Treatment', placeholder: 'e.g., Drug B, Standard of care' },
          comparatorSource: { label: 'Comparator Source', placeholder: 'e.g., Trial DEF, Real-world data' },
          matchingVariables: { label: 'Matching Variables', placeholder: 'e.g., Age, ECOG, disease stage, prior therapy' }
        },
        requiredFields: ['effectMeasure', 'weightingApproach', 'description'],
        additionalFields: {
          effectMeasure: { label: 'Effect Measure', placeholder: 'e.g., Hazard ratio, Risk difference' },
          weightingApproach: { label: 'Weighting Approach', placeholder: 'e.g., Entropy balancing, IPTW' },
          description: { label: 'Description', placeholder: 'Detailed description of the outcome' },
          sensitivityAnalysis: { label: 'Sensitivity Analysis', placeholder: 'e.g., Unanchored comparison' }
        },
        specificSections: ['exposureDefinition', 'matchingAlgorithm', 'sensitivityAnalysis', 'balanceAssessment', 'missingDataHandling']
      };
    default:
      return {
        terminology: {
          primary: 'Primary Endpoints',
          secondary: 'Secondary Endpoints',
          exploratory: 'Exploratory Endpoints', 
          singular: 'endpoint'
        },
        requiredFields: ['timepoint', 'method', 'description'],
        additionalFields: {
          timepoint: { label: 'Time Point', placeholder: 'e.g., Week 12, End of Treatment' },
          method: { label: 'Assessment Method', placeholder: 'e.g., RECIST 1.1, ECOG Performance Status' },
          description: { label: 'Description', placeholder: 'Detailed description of the endpoint' }
        },
        specificSections: ['interimAnalysis', 'estimands']
      };
  }
};

// Helper function to get correct terminology based on protocol type (backward compatibility)
const getEndpointTerminology = (protocolType: string) => {
  switch (protocolType) {
    case 'interventional_clinical_trial':
      return {
        primary: 'Primary Endpoints',
        secondary: 'Secondary Endpoints', 
        exploratory: 'Exploratory Endpoints',
        singular: 'endpoint'
      };
    case 'secondary_data_analysis':
    case 'retrospective_cohort_study':
    case 'prospective_cohort_study':
      return {
        primary: 'Primary Outcomes',
        secondary: 'Secondary Outcomes',
        exploratory: 'Exploratory Outcomes', 
        singular: 'outcome'
      };
    case 'cross_sectional_survey':
    case 'qualitative_study':
    case 'mixed_methods':
      return {
        primary: 'Primary Measures',
        secondary: 'Secondary Measures',
        exploratory: 'Exploratory Measures',
        singular: 'measure'
      };
    case 'delphi_consensus':
      return {
        primary: 'Primary Questions',
        secondary: 'Secondary Questions', 
        exploratory: 'Exploratory Questions',
        singular: 'question'
      };
    case 'maic':
      return {
        primary: 'Primary Outcomes',
        secondary: 'Secondary Outcomes',
        exploratory: 'Exploratory Outcomes',
        singular: 'outcome'
      };
    default:
      // Default to interventional terminology
      return {
        primary: 'Primary Endpoints',
        secondary: 'Secondary Endpoints',
        exploratory: 'Exploratory Endpoints', 
        singular: 'endpoint'
      };
  }
};

// Define interfaces for Statistical Analysis Plan

interface MAICSpecificData {
  weightingApproach: string;
  effectMeasure: string;
  sensitivityDescription: string;
  matchingVariables: string[];
  outcomeModels: string[];
  sensitivityAnalyses: string[];
}

interface InterimAnalysis {
  planned: boolean;
  rationale: string;
  analyses: any[];
  dataMonitoringCommittee: any;
  alphaSpending: any;
}

interface BiasAssessment {
  overallRisk: "low" | "moderate" | "high";
  selectionBias: any;
  informationBias: any;
  confoundingBias: any;
}

interface Estimand {
  id: number;
  endpointId?: number;
  endpointName: string;
  population: string;
  variable: string;
  populationLevelSummary: string;
  intercurrentEventStrategy: "treatment_policy" | "composite" | "hypothetical" | "while_on_treatment" | "principal_stratum";
  intercurrentEventHandling: string;
  justification: string;
  estimandType: "primary" | "secondary" | "exploratory";
}

interface MissingDataStrategy {
  primaryApproach: "complete_case" | "available_case" | "multiple_imputation" | "last_observation" | "mixed_model" | "other";
  primaryJustification: string;
  missingMechanismAssumption: "mcar" | "mar" | "mnar";
  mechanismJustification: string;
  imputationMethods?: string[];
  sensitivityAnalyses?: {
    method: string;
    description: string;
  }[];
  reportingPlan: string;
  studySpecificConsiderations?: string;
}

interface SAPData {
  sampleSize: SampleSize;
  primaryEndpoints?: any[];
  secondaryEndpoints?: any[];
  exploratoryEndpoints?: any[];
  primaryOutcomes?: any[];
  secondaryOutcomes?: any[];
  exploratoryOutcomes?: any[];
  estimands?: Estimand[];
  analysisPopulations?: any[];
  statisticalMethods: any[];
  maicSpecific?: MAICSpecificData;
  interimAnalysis?: InterimAnalysis;
  multiplicityControl?: any;
  missingDataStrategy?: MissingDataStrategy;
  biasAssessment?: BiasAssessment;
  causalInference?: any;
  propensityScoreAnalysis?: any;
  negativeControls?: any;
  sensitivityAnalyses?: any[];
  cohortDefinition?: any;
}

interface SampleSizeCalcProps {
  sampleSize: any
  updateSampleSize: (data: any) => void
  protocol: Protocol
  activeDesignState: any
}

const SampleSizeCalculator: React.FC<SampleSizeCalcProps> = ({ sampleSize, updateSampleSize, protocol, activeDesignState }) => {
  const [showCalculator, setShowCalculator] = useState(false)
  const [alpha, setAlpha] = useState("0.05")
  const [power, setPower] = useState("0.8")
  const [effect, setEffect] = useState("0.5")
  const [groups, setGroups] = useState("2")
  const [calculated, setCalculated] = useState(false)
  
  const handleCalculate = () => {
    // Simple sample size calculation formula for t-test
    // n = 2 * (sd^2) * (z_alpha + z_beta)^2 / d^2
    // where sd is assumed to be 1, d is effect size
    // z values are approximated
    
    const alphaNum = parseFloat(alpha)
    const powerNum = parseFloat(power)
    const effectNum = parseFloat(effect)
    const groupsNum = parseInt(groups)
    
    const zAlpha = 1.96 // for alpha 0.05
    const zBeta = 0.84  // for power 0.8
    
    const totalSampleSize = Math.ceil(2 * Math.pow(zAlpha + zBeta, 2) / Math.pow(effectNum, 2))
    const perGroupSize = Math.ceil(totalSampleSize / groupsNum)
    
    const updatedSampleSize = {
      ...sampleSize,
      total: totalSampleSize,
      perArm: perGroupSize,
      justification: `Sample size calculated using alpha=${alphaNum}, power=${powerNum}, effect size=${effectNum} for ${groupsNum} groups.`
    }
    
    updateSampleSize(updatedSampleSize)
    setCalculated(true)
  }
  
  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <div className="flex-1">
          <div className="flex items-center space-x-2">
            <h3 className="text-base font-medium">Sample Size</h3>
            <Badge variant="outline" className="text-xs">Required</Badge>
            <ProvenanceInfo
              item={sampleSize}
              origin={sampleSize?.origin || (Number(sampleSize?.total || 0) > 0 ? "source" : "placeholder")}
              sourceName="Synopsis or SAP reference"
              action={Number(sampleSize?.total || 0) > 0 ? "Sample size information is traceable to source content, AI improvement, or user edits." : "Sample size is required and still needs source support or user confirmation."}
              section="Statistical Analysis Plan sample size"
            />
          </div>
          <p className="text-sm text-[#6c757d] mt-1">
            Define the required number of participants
          </p>
        </div>
        <div className="flex items-center space-x-2">
          <CommentTrigger
            protocolId={protocol.id}
            designStateId={activeDesignState?.id || ""}
            section="statisticalAnalysisPlan"
            sectionItem="sampleSize"
            contextData="sample-size"
            size="icon"
          />
          <Button variant="outline" size="sm" onClick={() => setShowCalculator(!showCalculator)}>
            <Calculator className="h-4 w-4 mr-1" />
            {showCalculator ? "Hide Calculator" : "Show Calculator"}
          </Button>
        </div>
      </div>
      
      {/* Approach Selection */}
      <div className="space-y-4">
        <div>
          <Label>
            {protocol.protocolType === 'interventional_clinical_trial' ? 'Randomization Approach' : 'Group Allocation'}
          </Label>
          <Select 
            value={sampleSize.approach || "equal_arms"} 
            onValueChange={(value: "equal_arms" | "ratio_based" | "custom_arms") => 
              updateSampleSize({...sampleSize, approach: value})
            }
          >
            <SelectTrigger className="mt-1">
              <SelectValue placeholder="Select approach" />
            </SelectTrigger>
            <SelectContent>
              {protocol.protocolType === 'interventional_clinical_trial' ? (
                <>
                  <SelectItem value="equal_arms">Equal Arms (1:1)</SelectItem>
                  <SelectItem value="ratio_based">Ratio-Based (e.g., 2:1, 1:1:1)</SelectItem>
                  <SelectItem value="custom_arms">Custom per Arm</SelectItem>
                </>
              ) : (
                <>
                  <SelectItem value="equal_arms">Equal Cohorts</SelectItem>
                  <SelectItem value="custom_arms">Custom per Cohort</SelectItem>
                </>
              )}
            </SelectContent>
          </Select>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label>Total Sample Size</Label>
            <div className="flex items-center mt-1">
              <Input 
                type="number" 
                value={sampleSize.total || 0} 
                onChange={e => updateSampleSize({...sampleSize, total: parseInt(e.target.value) || 0})}
                className="w-full"
              />
            </div>
          </div>
          
          {/* Show different fields based on approach */}
          {(sampleSize.approach === "equal_arms" || !sampleSize.approach) && (
            <div>
              <Label>
                {protocol.protocolType === 'interventional_clinical_trial' ? 'Participants Per Arm' : 'Participants Per Cohort'}
              </Label>
              <div className="flex items-center mt-1">
                <Input 
                  type="number" 
                  value={sampleSize.perArm || 0}
                  onChange={e => updateSampleSize({...sampleSize, perArm: parseInt(e.target.value) || 0})}
                  className="w-full"
                />
              </div>
            </div>
          )}
          
          {/* Only show ratio-based for interventional trials */}
          {sampleSize.approach === "ratio_based" && protocol.protocolType === 'interventional_clinical_trial' && (
            <div>
              <Label>Randomization Ratio</Label>
              <div className="flex items-center mt-1">
                <Input 
                  type="text" 
                  value={sampleSize.randomizationRatio || ""}
                  onChange={e => updateSampleSize({...sampleSize, randomizationRatio: e.target.value})}
                  placeholder="e.g., 2:1, 1:1:1, 3:2:1"
                  className="w-full"
                />
              </div>
            </div>
          )}
        </div>
        
        {/* Arms/Cohorts table for custom approach */}
        {sampleSize.approach === "custom_arms" && (
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <Label>
                {protocol.protocolType === 'interventional_clinical_trial' ? 'Study Arms' : 'Study Cohorts'}
              </Label>
              <Button 
                type="button" 
                variant="outline" 
                size="sm"
                onClick={() => {
                  const isInterventional = protocol.protocolType === 'interventional_clinical_trial';
                  const newArms = [...(sampleSize.arms || []), {
                    id: `${isInterventional ? 'arm' : 'cohort'}-${Date.now()}`,
                    name: `${isInterventional ? 'Arm' : 'Cohort'} ${(sampleSize.arms?.length || 0) + 1}`,
                    plannedN: 0,
                    percentage: 0
                  }];
                  updateSampleSize({...sampleSize, arms: newArms});
                }}
              >
                <Plus className="h-4 w-4 mr-1" />
                {protocol.protocolType === 'interventional_clinical_trial' ? 'Add Arm' : 'Add Cohort'}
              </Button>
            </div>
            
            {sampleSize.arms && sampleSize.arms.length > 0 && (
              <div className="border rounded-md">
                <div className="grid grid-cols-4 gap-2 p-3 bg-gray-50 border-b text-sm font-medium">
                  <div>{protocol.protocolType === 'interventional_clinical_trial' ? 'Arm Name' : 'Cohort Name'}</div>
                  <div>Planned N</div>
                  <div>Percentage</div>
                  <div>Action</div>
                </div>
                {sampleSize.arms.map((arm: any, index: number) => (
                  <div key={arm.id} className="grid grid-cols-4 gap-2 p-3 border-b last:border-b-0">
                    <Input 
                      value={arm.name}
                      onChange={e => {
                        const updatedArms = [...sampleSize.arms];
                        updatedArms[index] = {...arm, name: e.target.value};
                        updateSampleSize({...sampleSize, arms: updatedArms});
                      }}
                      placeholder="Arm name"
                      className="text-sm"
                    />
                    <Input 
                      type="number"
                      value={arm.plannedN}
                      onChange={e => {
                        const plannedN = parseInt(e.target.value) || 0;
                        const percentage = sampleSize.total > 0 ? Math.round((plannedN / sampleSize.total) * 100) : 0;
                        const updatedArms = [...sampleSize.arms];
                        updatedArms[index] = {...arm, plannedN, percentage};
                        updateSampleSize({...sampleSize, arms: updatedArms});
                      }}
                      className="text-sm"
                    />
                    <div className="flex items-center text-sm text-gray-600">
                      {arm.percentage}%
                    </div>
                    <Button 
                      variant="ghost" 
                      size="sm"
                      onClick={() => {
                        const updatedArms = sampleSize.arms.filter((_: any, i: number) => i !== index);
                        updateSampleSize({...sampleSize, arms: updatedArms});
                      }}
                      className="text-red-600 hover:text-red-700"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
      
      <div>
        <Label>Sample Size Justification</Label>
        <Textarea 
          className="mt-1"
          value={sampleSize.justification || ""}
          onChange={e => updateSampleSize({...sampleSize, justification: e.target.value})}
          placeholder="Provide justification for the sample size calculation..."
          rows={3}
        />
      </div>
      
      {showCalculator && (
        <Card className="bg-[#f8f9fa] border-[#dee2e6]">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Sample Size Calculator</CardTitle>
            <CardDescription>Estimate sample size based on statistical parameters</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Significance Level (α)</Label>
                <Select value={alpha} onValueChange={setAlpha}>
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="Select alpha" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="0.01">0.01</SelectItem>
                    <SelectItem value="0.05">0.05 (standard)</SelectItem>
                    <SelectItem value="0.1">0.1</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Power (1-β)</Label>
                <Select value={power} onValueChange={setPower}>
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="Select power" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="0.8">0.8 (standard)</SelectItem>
                    <SelectItem value="0.9">0.9</SelectItem>
                    <SelectItem value="0.95">0.95</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Effect Size</Label>
                <Select value={effect} onValueChange={setEffect}>
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="Select effect size" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="0.2">0.2 (small)</SelectItem>
                    <SelectItem value="0.5">0.5 (medium)</SelectItem>
                    <SelectItem value="0.8">0.8 (large)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Number of Groups</Label>
                <Select value={groups} onValueChange={setGroups}>
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="Select groups" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">1</SelectItem>
                    <SelectItem value="2">2 (standard)</SelectItem>
                    <SelectItem value="3">3</SelectItem>
                    <SelectItem value="4">4</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
          <CardFooter className="pt-0 flex justify-between">
            <p className="text-xs text-[#6c757d] italic">
              Simplified calculation based on two-sided t-test
            </p>
            <Button size="sm" onClick={handleCalculate}>
              Calculate
            </Button>
          </CardFooter>
        </Card>
      )}
      
      {calculated && (
        <div className="bg-[#e7f5ff] border border-[#228be6] p-3 rounded-md">
          <p className="text-sm">
            <span className="font-medium">Calculation result:</span> A total of {sampleSize.total} participants 
            ({sampleSize.perArm} per arm) are needed based on the specified parameters.
          </p>
        </div>
      )}
    </div>
  )
}

interface EndpointItemProps {
  endpoint: any
  updateEndpoint: (updated: any) => void
  onDelete: () => void
  isPrimary?: boolean
  isExploratory?: boolean
}

interface EstimandItemProps {
  estimand: Estimand
  updateEstimand: (updated: Estimand) => void
  onDelete: () => void
  availableEndpoints: any[]
}

const EstimandItem: React.FC<EstimandItemProps> = ({ 
  estimand, 
  updateEstimand, 
  onDelete,
  availableEndpoints
}) => {
  const [isEditing, setIsEditing] = useState(false)
  const [editedEstimand, setEditedEstimand] = useState<Estimand>({...estimand})
  
  const handleSave = () => {
    updateEstimand({ ...editedEstimand, origin: "manual", previousOrigin: (estimand as any).origin } as any)
    setIsEditing(false)
  }
  
  const strategyLabels = {
    treatment_policy: "Treatment Policy",
    composite: "Composite",
    hypothetical: "Hypothetical",
    while_on_treatment: "While on Treatment",
    principal_stratum: "Principal Stratum"
  }
  
  const getTypeBadgeColor = (type: string) => {
    switch(type) {
      case "primary": return "bg-[#228be6] text-white"
      case "secondary": return "bg-[#12b886] text-white"
      case "exploratory": return "bg-[#fd7e14] text-white"
      default: return "bg-gray-500 text-white"
    }
  }
  
  return (
    <div className="border border-[#dee2e6] rounded-md overflow-hidden">
      <div className="flex justify-between items-center bg-[#f8f9fa] p-3 border-b border-[#dee2e6]">
        <div className="flex items-center">
          <Badge className={`mr-2 ${getTypeBadgeColor(estimand.estimandType)}`}>
            {estimand.estimandType.charAt(0).toUpperCase() + estimand.estimandType.slice(1)}
          </Badge>
          <Target className="h-4 w-4 mr-2 text-[#6c757d]" />
          <h4 className="font-medium">{estimand.endpointName}</h4>
          <ProvenanceInfo
            item={estimand}
            origin={(estimand as any).origin || "ai_generated"}
            action="Estimand traceability is based on linked endpoints and AI/user-defined estimand fields."
            section="Statistical Analysis Plan estimand"
            className="ml-2"
          />
        </div>
        <div className="flex items-center space-x-1">
          <Button variant="ghost" size="icon" onClick={() => setIsEditing(!isEditing)}>
            <Pencil className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" onClick={onDelete}>
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>
      
      {isEditing ? (
        <div className="p-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Linked Endpoint</Label>
              <Select 
                value={editedEstimand.endpointName} 
                onValueChange={(value) => {
                  const selectedEndpoint = availableEndpoints.find(ep => ep.name === value)
                  setEditedEstimand({
                    ...editedEstimand, 
                    endpointName: value,
                    endpointId: selectedEndpoint?.id
                  })
                }}
              >
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Select endpoint" />
                </SelectTrigger>
                <SelectContent>
                  {availableEndpoints.map(endpoint => (
                    <SelectItem key={endpoint.id} value={endpoint.name}>
                      {endpoint.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div>
              <Label>Estimand Type</Label>
              <Select 
                value={editedEstimand.estimandType} 
                onValueChange={(value: "primary" | "secondary" | "exploratory") => 
                  setEditedEstimand({...editedEstimand, estimandType: value})
                }
              >
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="primary">Primary</SelectItem>
                  <SelectItem value="secondary">Secondary</SelectItem>
                  <SelectItem value="exploratory">Exploratory</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          
          <div>
            <Label>Population</Label>
            <Input 
              value={editedEstimand.population} 
              onChange={e => setEditedEstimand({...editedEstimand, population: e.target.value})} 
              className="mt-1"
              placeholder="e.g., All randomized patients, ITT population"
            />
          </div>
          
          <div>
            <Label>Variable</Label>
            <Input 
              value={editedEstimand.variable} 
              onChange={e => setEditedEstimand({...editedEstimand, variable: e.target.value})} 
              className="mt-1"
              placeholder="e.g., Time to progression, Change from baseline in HAMD-17"
            />
          </div>
          
          <div>
            <Label>Population-Level Summary</Label>
            <Input 
              value={editedEstimand.populationLevelSummary} 
              onChange={e => setEditedEstimand({...editedEstimand, populationLevelSummary: e.target.value})} 
              className="mt-1"
              placeholder="e.g., Difference in means, Hazard ratio, Risk difference"
            />
          </div>
          
          <div>
            <Label>Intercurrent Event Strategy</Label>
            <Select 
              value={editedEstimand.intercurrentEventStrategy} 
              onValueChange={(value: any) => 
                setEditedEstimand({...editedEstimand, intercurrentEventStrategy: value})
              }
            >
              <SelectTrigger className="mt-1">
                <SelectValue placeholder="Select strategy" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="treatment_policy">Treatment Policy</SelectItem>
                <SelectItem value="composite">Composite</SelectItem>
                <SelectItem value="hypothetical">Hypothetical</SelectItem>
                <SelectItem value="while_on_treatment">While on Treatment</SelectItem>
                <SelectItem value="principal_stratum">Principal Stratum</SelectItem>
              </SelectContent>
            </Select>
          </div>
          
          <div>
            <Label>Intercurrent Event Handling</Label>
            <Textarea 
              value={editedEstimand.intercurrentEventHandling} 
              onChange={e => setEditedEstimand({...editedEstimand, intercurrentEventHandling: e.target.value})} 
              className="mt-1"
              rows={2}
              placeholder="Describe how intercurrent events (discontinuation, rescue medication, etc.) are handled"
            />
          </div>
          
          <div>
            <Label>Justification</Label>
            <Textarea 
              value={editedEstimand.justification} 
              onChange={e => setEditedEstimand({...editedEstimand, justification: e.target.value})} 
              className="mt-1"
              rows={2}
              placeholder="Justify the choice of estimand strategy and approach"
            />
          </div>
          
          <div className="flex justify-end space-x-2 pt-2">
            <Button variant="outline" size="sm" onClick={() => setIsEditing(false)}>
              Cancel
            </Button>
            <Button size="sm" onClick={handleSave}>
              Save Changes
            </Button>
          </div>
        </div>
      ) : (
        <div className="p-4 space-y-3">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <span className="text-sm font-medium text-[#6c757d]">Population:</span>
              <p className="text-sm text-[#495057] mt-1">{estimand.population || "Not specified"}</p>
            </div>
            <div>
              <span className="text-sm font-medium text-[#6c757d]">Variable:</span>
              <p className="text-sm text-[#495057] mt-1">{estimand.variable || "Not specified"}</p>
            </div>
          </div>
          
          <div>
            <span className="text-sm font-medium text-[#6c757d]">Population-Level Summary:</span>
            <p className="text-sm text-[#495057] mt-1">{estimand.populationLevelSummary || "Not specified"}</p>
          </div>
          
          <div>
            <span className="text-sm font-medium text-[#6c757d]">Intercurrent Event Strategy:</span>
            <Badge variant="outline" className="ml-2">
              {strategyLabels[estimand.intercurrentEventStrategy]}
            </Badge>
          </div>
          
          {estimand.intercurrentEventHandling && (
            <div>
              <span className="text-sm font-medium text-[#6c757d]">Event Handling:</span>
              <p className="text-sm text-[#495057] mt-1">{estimand.intercurrentEventHandling}</p>
            </div>
          )}
          
          {estimand.justification && (
            <div>
              <span className="text-sm font-medium text-[#6c757d]">Justification:</span>
              <p className="text-sm text-[#495057] mt-1">{estimand.justification}</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// Protocol-type-specific form fields component
const ProtocolSpecificFields: React.FC<{
  endpoint: any;
  setEndpoint: (endpoint: any) => void;
  protocolConfig: any;
}> = ({ endpoint, setEndpoint, protocolConfig }) => {
  const { additionalFields } = protocolConfig;
  
  return (
    <div className="space-y-3">
      {Object.entries(additionalFields).map(([fieldKey, fieldConfig]: [string, any]) => (
        <div key={fieldKey}>
          <Label>{fieldConfig.label}</Label>
          <Input
            value={endpoint[fieldKey] || ''}
            onChange={(e) => setEndpoint({
              ...endpoint,
              [fieldKey]: e.target.value
            })}
            placeholder={fieldConfig.placeholder}
            className="mt-1"
          />
        </div>
      ))}
    </div>
  );
};

// Exposure Definition component for cohort and MAIC studies
const ExposureDefinition: React.FC<{
  protocol: Protocol;
  activeDesignState: any;
  protocolConfig: any;
  setProtocol: React.Dispatch<React.SetStateAction<Protocol>>;
}> = ({ protocol, activeDesignState, protocolConfig, setProtocol }) => {
  const [exposureData, setExposureData] = useState(() => {
    try {
      const sapData = typeof protocol.statisticalAnalysisPlan === 'string' 
        ? JSON.parse(protocol.statisticalAnalysisPlan) 
        : protocol.statisticalAnalysisPlan || {};
      return sapData.exposureDefinition || {};
    } catch {
      return {};
    }
  });

  const updateExposureData = (field: string, value: string) => {
    const updatedExposure = { ...exposureData, [field]: value };
    setExposureData(updatedExposure);
    
    setProtocol((prevProtocol: Protocol) => {
      const prevSap = typeof prevProtocol.statisticalAnalysisPlan === 'string' 
        ? JSON.parse(prevProtocol.statisticalAnalysisPlan) 
        : prevProtocol.statisticalAnalysisPlan || {};
      
      return {
        ...prevProtocol,
        statisticalAnalysisPlan: JSON.stringify({
          ...prevSap,
          exposureDefinition: updatedExposure
        })
      };
    });
  };

  if (!protocolConfig.requiresExposure) return null;

  return (
    <div className="bg-white rounded-md border border-[#dee2e6] mb-6">
      <div className="flex items-center justify-between p-3 border-b border-[#dee2e6] bg-[#f8f9fa]">
        <div className="flex items-center gap-2">
          <h3 className="font-medium text-[#495057]">Exposure Definition</h3>
          <Badge variant="outline" className="text-xs">Required</Badge>
          <CommentTrigger
            protocolId={protocol.id}
            designStateId={activeDesignState?.id || ""}
            section="statisticalAnalysisPlan"
            sectionItem="exposureDefinition"
            contextData="exposure-definition"
            size="icon"
          />
        </div>
      </div>
      
      <div className="p-4 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {Object.entries(protocolConfig.exposureFields).map(([fieldKey, fieldConfig]: [string, any]) => (
            <div key={fieldKey}>
              <Label className="text-sm font-medium text-[#495057]">
                {fieldConfig.label}
              </Label>
              {fieldKey === 'definition' || fieldKey === 'matchingVariables' ? (
                <Textarea
                  value={exposureData[fieldKey] || ''}
                  onChange={(e) => updateExposureData(fieldKey, e.target.value)}
                  placeholder={fieldConfig.placeholder}
                  className="mt-1"
                  rows={3}
                />
              ) : (
                <Input
                  value={exposureData[fieldKey] || ''}
                  onChange={(e) => updateExposureData(fieldKey, e.target.value)}
                  placeholder={fieldConfig.placeholder}
                  className="mt-1"
                />
              )}
            </div>
          ))}
        </div>
        
        {/* Study-specific guidance */}
        <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-md">
          <div className="flex items-start gap-2">
            <Info className="h-4 w-4 text-blue-600 mt-0.5 flex-shrink-0" />
            <div className="text-sm text-blue-800">
              <p className="font-medium mb-1">Exposure Definition Guidelines:</p>
              {protocol.protocolType === 'prospective_cohort_study' && (
                <p>Define the exposure of interest and how it will be measured prospectively. Consider time-varying exposures and duration of follow-up.</p>
              )}
              {protocol.protocolType === 'retrospective_cohort_study' && (
                <p>Clearly specify how historical exposure will be identified and categorized. Consider latency periods and exposure misclassification.</p>
              )}
              {protocol.protocolType === 'maic' && (
                <p>Define target and comparator populations with their respective treatments. Specify all variables used for matching and weighting.</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

const EndpointItem: React.FC<EndpointItemProps & { protocolConfig: any }> = ({ 
  endpoint, 
  updateEndpoint, 
  onDelete,
  isPrimary = false,
  isExploratory = false,
  protocolConfig
}) => {
  const [isEditing, setIsEditing] = useState(false)
  const [editedEndpoint, setEditedEndpoint] = useState({...endpoint})
  
  const handleSave = () => {
    updateEndpoint({ ...editedEndpoint, origin: "manual", previousOrigin: endpoint.origin })
    setIsEditing(false)
  }
  
  return (
    <div className="border border-[#dee2e6] rounded-md overflow-hidden">
      <div className="flex justify-between items-center bg-[#f8f9fa] p-3 border-b border-[#dee2e6]">
        <div className="flex items-center">
          {isPrimary ? (
            <Badge className="bg-[#228be6] text-white mr-2">Primary</Badge>
          ) : isExploratory ? (
            <Badge className="bg-[#fd7e14] text-white mr-2">Exploratory</Badge>
          ) : (
            <Badge className="bg-[#12b886] text-white mr-2">Secondary</Badge>
          )}
          <h4 className="font-medium">{endpoint.name}</h4>
          <ProvenanceInfo item={endpoint} section="Statistical Analysis Plan endpoint" />
          <AIOriginBadge item={endpoint} className="ml-2" />
        </div>
        <div className="flex items-center space-x-1">
          <Button variant="ghost" size="icon" onClick={() => setIsEditing(!isEditing)}>
            <Pencil className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" onClick={onDelete}>
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>
      
      {isEditing ? (
        <div className="p-4 space-y-3">
          <div>
            <Label>{protocolConfig.terminology.singular.charAt(0).toUpperCase() + protocolConfig.terminology.singular.slice(1)} Name</Label>
            <Input 
              value={editedEndpoint.name} 
              onChange={e => setEditedEndpoint({...editedEndpoint, name: e.target.value})} 
              className="mt-1"
            />
          </div>
          
          {/* Protocol-specific fields */}
          <ProtocolSpecificFields
            endpoint={editedEndpoint}
            setEndpoint={setEditedEndpoint}
            protocolConfig={protocolConfig}
          />
          
          <div>
            <Label>Type</Label>
            <Select 
              value={editedEndpoint.type} 
              onValueChange={value => setEditedEndpoint({...editedEndpoint, type: value})}
            >
              <SelectTrigger className="mt-1">
                <SelectValue placeholder="Select type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="efficacy">Efficacy</SelectItem>
                <SelectItem value="safety">Safety</SelectItem>
                <SelectItem value="pharmacokinetic">Pharmacokinetic</SelectItem>
                <SelectItem value="pharmacodynamic">Pharmacodynamic</SelectItem>
                <SelectItem value="biomarker">Biomarker</SelectItem>
                <SelectItem value="other">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>
          
          <div className="flex justify-end space-x-2 pt-2">
            <Button size="sm" variant="outline" onClick={() => setIsEditing(false)}>
              <X className="h-3.5 w-3.5 mr-1" />
              Cancel
            </Button>
            <Button size="sm" onClick={handleSave}>
              <Save className="h-3.5 w-3.5 mr-1" />
              Save
            </Button>
          </div>
        </div>
      ) : (
        <div className="p-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs text-[#6c757d]">Type</p>
              <p className="text-sm">{endpoint.type || "Not specified"}</p>
            </div>
            <div>
              <p className="text-xs text-[#6c757d]">Measurement Timepoint</p>
              <p className="text-sm">{endpoint.timepoint || "Not specified"}</p>
            </div>
          </div>
          
          <div className="mt-3">
            <p className="text-xs text-[#6c757d]">Statistical Method</p>
            <p className="text-sm">{endpoint.method || "Not specified"}</p>
          </div>
          
          {endpoint.description && (
            <div className="mt-3">
              <p className="text-xs text-[#6c757d]">Description</p>
              <p className="text-sm">{endpoint.description}</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

interface AnalysisPopulationItemProps {
  population: any
  updatePopulation: (updated: any) => void
  onDelete: () => void
}

const AnalysisPopulationItem: React.FC<AnalysisPopulationItemProps> = ({ 
  population, 
  updatePopulation, 
  onDelete 
}) => {
  const [isEditing, setIsEditing] = useState(false)
  const [editedPopulation, setEditedPopulation] = useState({...population})
  
  const handleSave = () => {
    updatePopulation({ ...editedPopulation, origin: "manual", previousOrigin: population.origin })
    setIsEditing(false)
  }
  
  return (
    <div className="border border-[#dee2e6] rounded-md overflow-hidden">
      <div className="flex justify-between items-center bg-[#f8f9fa] p-3 border-b border-[#dee2e6]">
        <div className="flex items-center">
          <h4 className="font-medium">{population.name}</h4>
          <ProvenanceInfo item={population} section="Statistical Analysis Plan analysis population" className="ml-2" />
          <AIOriginBadge item={population} className="ml-2" />
        </div>
        <div className="flex items-center space-x-1">
          <Button variant="ghost" size="icon" onClick={() => setIsEditing(!isEditing)}>
            <Pencil className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" onClick={onDelete}>
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>
      
      {isEditing ? (
        <div className="p-4 space-y-3">
          <div>
            <Label>Population Name</Label>
            <Input 
              value={editedPopulation.name} 
              onChange={e => setEditedPopulation({...editedPopulation, name: e.target.value})} 
              className="mt-1"
            />
          </div>
          
          <div>
            <Label>Definition</Label>
            <Textarea 
              value={editedPopulation.definition} 
              onChange={e => setEditedPopulation({...editedPopulation, definition: e.target.value})} 
              className="mt-1"
              rows={3}
            />
          </div>
          
          <div className="flex justify-end space-x-2 pt-2">
            <Button size="sm" variant="outline" onClick={() => setIsEditing(false)}>
              <X className="h-3.5 w-3.5 mr-1" />
              Cancel
            </Button>
            <Button size="sm" onClick={handleSave}>
              <Save className="h-3.5 w-3.5 mr-1" />
              Save
            </Button>
          </div>
        </div>
      ) : (
        <div className="p-4">
          <p className="text-xs text-[#6c757d]">Definition</p>
          <p className="text-sm">{population.definition || "No definition provided"}</p>
        </div>
      )}
    </div>
  )
}

interface StatMethodItemProps {
  method: any
  updateMethod: (updated: any) => void
  onDelete: () => void
}

const StatMethodItem: React.FC<StatMethodItemProps> = ({ 
  method, 
  updateMethod, 
  onDelete 
}) => {
  const [isEditing, setIsEditing] = useState(false)
  const [editedMethod, setEditedMethod] = useState({...method})
  
  const handleSave = () => {
    updateMethod({ ...editedMethod, origin: "manual", previousOrigin: method.origin })
    setIsEditing(false)
  }
  
  return (
    <div className="border border-[#dee2e6] rounded-md overflow-hidden">
      <div className="flex justify-between items-center bg-[#f8f9fa] p-3 border-b border-[#dee2e6]">
        <div className="flex items-center">
          <h4 className="font-medium">{method.name}</h4>
          <ProvenanceInfo item={method} section="Statistical Analysis Plan method" className="ml-2" />
          <AIOriginBadge item={method} className="ml-2" />
        </div>
        <div className="flex items-center space-x-1">
          <Button variant="ghost" size="icon" onClick={() => setIsEditing(!isEditing)}>
            <Pencil className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" onClick={onDelete}>
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>
      
      {isEditing ? (
        <div className="p-4 space-y-3">
          <div>
            <Label>Method Name</Label>
            <Input 
              value={editedMethod.name} 
              onChange={e => setEditedMethod({...editedMethod, name: e.target.value})} 
              className="mt-1"
            />
          </div>
          
          <div>
            <Label>Analysis Type</Label>
            <Select 
              value={editedMethod.type} 
              onValueChange={value => setEditedMethod({...editedMethod, type: value})}
            >
              <SelectTrigger className="mt-1">
                <SelectValue placeholder="Select type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="primary">Primary Analysis</SelectItem>
                <SelectItem value="secondary">Secondary Analysis</SelectItem>
                <SelectItem value="exploratory">Exploratory Analysis</SelectItem>
                <SelectItem value="subgroup">Subgroup Analysis</SelectItem>
                <SelectItem value="interim">Interim Analysis</SelectItem>
                <SelectItem value="sensitivity">Sensitivity Analysis</SelectItem>
                <SelectItem value="safety">Safety Analysis</SelectItem>
              </SelectContent>
            </Select>
          </div>
          
          <div>
            <Label>Description</Label>
            <Textarea 
              value={editedMethod.description} 
              onChange={e => setEditedMethod({...editedMethod, description: e.target.value})} 
              className="mt-1"
              rows={3}
            />
          </div>
          
          <div className="flex justify-end space-x-2 pt-2">
            <Button size="sm" variant="outline" onClick={() => setIsEditing(false)}>
              <X className="h-3.5 w-3.5 mr-1" />
              Cancel
            </Button>
            <Button size="sm" onClick={handleSave}>
              <Save className="h-3.5 w-3.5 mr-1" />
              Save
            </Button>
          </div>
        </div>
      ) : (
        <div className="p-4">
          <div>
            <p className="text-xs text-[#6c757d]">Analysis Type</p>
            <p className="text-sm">{method.type || "Not specified"}</p>
          </div>
          
          {method.description && (
            <div className="mt-3">
              <p className="text-xs text-[#6c757d]">Description</p>
              <p className="text-sm">{method.description}</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

interface StatisticalAnalysisPlanProps {
  protocol: Protocol
  setProtocol: React.Dispatch<React.SetStateAction<Protocol>>
  activeDesignState?: any
  isActive?: boolean
}

const defaultEndpoint = {
  name: "New Endpoint",
  type: "efficacy",
  timepoint: "Week 12",
  method: "t-test",
  description: ""
}

const defaultPopulation = {
  name: "New Analysis Population",
  definition: "Define the criteria for this analysis population"
}

const defaultMethod = {
  name: "New Statistical Method",
  type: "primary",
  description: "Describe the statistical approach"
}

// Editable Bias Assessment Component
interface BiasAssessmentEditorProps {
  biasAssessment: any;
  setBiasAssessment: (assessment: any) => void;
  propensityScore: any;
  setPropensityScore: (ps: any) => void;
  negativeControls: any;
  setNegativeControls: (nc: any) => void;
  sensitivityAnalyses: any[];
  setSensitivityAnalyses: (sa: any[]) => void;
  protocol: Protocol;
  setProtocol: React.Dispatch<React.SetStateAction<Protocol>>;
}

const BiasAssessmentEditor: React.FC<BiasAssessmentEditorProps> = ({
  biasAssessment,
  setBiasAssessment,
  propensityScore,
  setPropensityScore,
  negativeControls,
  setNegativeControls,
  sensitivityAnalyses,
  setSensitivityAnalyses,
  protocol,
  setProtocol
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editingBias, setEditingBias] = useState(biasAssessment);
  const [editingPS, setEditingPS] = useState(propensityScore);
  const [editingNC, setEditingNC] = useState(negativeControls);
  const [newOutcomeControl, setNewOutcomeControl] = useState({ outcome: "", rationale: "" });
  const [newExposureControl, setNewExposureControl] = useState({ exposure: "", rationale: "" });

  const handleSave = () => {
    setBiasAssessment(editingBias);
    setPropensityScore(editingPS);
    setNegativeControls(editingNC);
    
    // Update protocol SAP with modified bias assessment
    const currentSAP = protocol.statisticalAnalysisPlan ? 
      (typeof protocol.statisticalAnalysisPlan === 'string' ? 
        JSON.parse(protocol.statisticalAnalysisPlan) : 
        protocol.statisticalAnalysisPlan) : {};
    
    const updatedSAP = {
      ...currentSAP,
      biasAssessment: editingBias,
      propensityScoreAnalysis: editingPS,
      negativeControls: editingNC
    };
    
    // Only update the statistical analysis plan - don't add new properties to protocol
    setProtocol({
      ...protocol,
      statisticalAnalysisPlan: JSON.stringify(updatedSAP)
    });
    
    setIsEditing(false);
  };

  const handleCancel = () => {
    setEditingBias(biasAssessment);
    setEditingPS(propensityScore);
    setEditingNC(negativeControls);
    setIsEditing(false);
  };

  const addOutcomeControl = () => {
    if (newOutcomeControl.outcome && newOutcomeControl.rationale) {
      const updatedControls = {
        ...editingNC,
        outcomeControls: [...(editingNC?.outcomeControls || []), newOutcomeControl]
      };
      setEditingNC(updatedControls);
      setNewOutcomeControl({ outcome: "", rationale: "" });
    }
  };

  const addExposureControl = () => {
    if (newExposureControl.exposure && newExposureControl.rationale) {
      const updatedControls = {
        ...editingNC,
        exposureControls: [...(editingNC?.exposureControls || []), newExposureControl]
      };
      setEditingNC(updatedControls);
      setNewExposureControl({ exposure: "", rationale: "" });
    }
  };

  const removeOutcomeControl = (index: number) => {
    const updatedControls = {
      ...editingNC,
      outcomeControls: editingNC?.outcomeControls?.filter((_: any, i: number) => i !== index) || []
    };
    setEditingNC(updatedControls);
  };

  const removeExposureControl = (index: number) => {
    const updatedControls = {
      ...editingNC,
      exposureControls: editingNC?.exposureControls?.filter((_: any, i: number) => i !== index) || []
    };
    setEditingNC(updatedControls);
  };

  return (
    <div className="col-span-3 bg-white p-6 rounded-md border border-[#dee2e6]">
      <div className="flex justify-between items-center mb-4">
        <h3 className="font-medium text-lg text-[#495057] flex items-center">
          <Shield size={20} className="mr-2 text-[#228be6]" />
          Bias Assessment & Mitigation
        </h3>
        <div className="flex items-center gap-2">

          {isEditing ? (
            <>
              <Button size="sm" variant="outline" onClick={handleCancel}>
                <X className="h-4 w-4 mr-1" />
                Cancel
              </Button>
              <Button size="sm" onClick={handleSave}>
                <Save className="h-4 w-4 mr-1" />
                Save Changes
              </Button>
            </>
          ) : (
            <Button size="sm" variant="outline" onClick={() => setIsEditing(true)}>
              <Pencil className="h-4 w-4 mr-1" />
              Edit Assessment
            </Button>
          )}
        </div>
      </div>

      {isEditing ? (
        <div className="space-y-6">
          {/* Overall Risk Level */}
          <div>
            <Label>Overall Bias Risk Level</Label>
            <Select 
              value={editingBias?.overallRisk || "moderate"} 
              onValueChange={(value) => setEditingBias({...editingBias, overallRisk: value})}
            >
              <SelectTrigger className="mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="low">Low Risk</SelectItem>
                <SelectItem value="moderate">Moderate Risk</SelectItem>
                <SelectItem value="high">High Risk</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Selection Bias */}
          <div>
            <Label>Selection Bias Risk Level</Label>
            <Select 
              value={editingBias?.selectionBias?.riskLevel || "moderate"} 
              onValueChange={(value) => setEditingBias({
                ...editingBias, 
                selectionBias: {...editingBias?.selectionBias, riskLevel: value}
              })}
            >
              <SelectTrigger className="mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="low">Low Risk</SelectItem>
                <SelectItem value="moderate">Moderate Risk</SelectItem>
                <SelectItem value="high">High Risk</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Confounding Bias */}
          <div>
            <Label>Confounding Bias Risk Level</Label>
            <Select 
              value={editingBias?.confoundingBias?.riskLevel || "moderate"} 
              onValueChange={(value) => setEditingBias({
                ...editingBias, 
                confoundingBias: {...editingBias?.confoundingBias, riskLevel: value}
              })}
            >
              <SelectTrigger className="mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="low">Low Risk</SelectItem>
                <SelectItem value="moderate">Moderate Risk</SelectItem>
                <SelectItem value="high">High Risk</SelectItem>
              </SelectContent>
            </Select>
            
            <div className="mt-2">
              <Label>Identified Confounders</Label>
              <Textarea
                className="mt-1"
                value={editingBias?.confoundingBias?.identifiedConfounders?.join(', ') || ""}
                onChange={(e) => setEditingBias({
                  ...editingBias,
                  confoundingBias: {
                    ...editingBias?.confoundingBias,
                    identifiedConfounders: e.target.value.split(',').map(c => c.trim()).filter(c => c)
                  }
                })}
                placeholder="Enter confounders separated by commas"
                rows={2}
              />
            </div>
          </div>

          {/* Propensity Score Analysis */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <input
                type="checkbox"
                checked={editingPS?.indicated || false}
                onChange={(e) => setEditingPS({...editingPS, indicated: e.target.checked})}
                className="rounded"
              />
              <Label>Propensity Score Analysis Indicated</Label>
            </div>
            
            {editingPS?.indicated && (
              <div className="space-y-2 ml-6">
                <div>
                  <Label>Method</Label>
                  <Select 
                    value={editingPS?.method || "matching"} 
                    onValueChange={(value) => setEditingPS({...editingPS, method: value})}
                  >
                    <SelectTrigger className="mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="matching">Matching</SelectItem>
                      <SelectItem value="stratification">Stratification</SelectItem>
                      <SelectItem value="weighting">Weighting</SelectItem>
                      <SelectItem value="covariate_adjustment">Covariate Adjustment</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                
                <div>
                  <Label>Covariates</Label>
                  <Textarea
                    className="mt-1"
                    value={editingPS?.covariates?.join(', ') || ""}
                    onChange={(e) => setEditingPS({
                      ...editingPS,
                      covariates: e.target.value.split(',').map(c => c.trim()).filter(c => c)
                    })}
                    placeholder="Enter covariates separated by commas"
                    rows={2}
                  />
                </div>
              </div>
            )}
          </div>

          {/* Negative Controls */}
          <div>
            <Label className="text-base font-medium">Negative Controls</Label>
            
            {/* Outcome Controls */}
            <div className="mt-3">
              <Label className="text-sm">Negative Outcome Controls</Label>
              <div className="space-y-2 mt-1">
                {editingNC?.outcomeControls?.map((control: any, index: number) => (
                  <div key={index} className="flex items-center gap-2 p-2 bg-purple-50 rounded">
                    <div className="flex-1">
                      <div className="font-medium text-sm">{control.outcome}</div>
                      <div className="text-xs text-gray-600">{control.rationale}</div>
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => removeOutcomeControl(index)}
                      className="h-8 w-8 p-0 text-red-500"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
                
                <div className="flex gap-2 items-end">
                  <div className="flex-1">
                    <Input
                      placeholder="Outcome name"
                      value={newOutcomeControl.outcome}
                      onChange={(e) => setNewOutcomeControl({...newOutcomeControl, outcome: e.target.value})}
                    />
                  </div>
                  <div className="flex-1">
                    <Input
                      placeholder="Rationale"
                      value={newOutcomeControl.rationale}
                      onChange={(e) => setNewOutcomeControl({...newOutcomeControl, rationale: e.target.value})}
                    />
                  </div>
                  <Button size="sm" onClick={addOutcomeControl}>
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>

            {/* Exposure Controls */}
            <div className="mt-4">
              <Label className="text-sm">Negative Exposure Controls</Label>
              <div className="space-y-2 mt-1">
                {editingNC?.exposureControls?.map((control: any, index: number) => (
                  <div key={index} className="flex items-center gap-2 p-2 bg-purple-50 rounded">
                    <div className="flex-1">
                      <div className="font-medium text-sm">{control.exposure}</div>
                      <div className="text-xs text-gray-600">{control.rationale}</div>
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => removeExposureControl(index)}
                      className="h-8 w-8 p-0 text-red-500"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
                
                <div className="flex gap-2 items-end">
                  <div className="flex-1">
                    <Input
                      placeholder="Exposure name"
                      value={newExposureControl.exposure}
                      onChange={(e) => setNewExposureControl({...newExposureControl, exposure: e.target.value})}
                    />
                  </div>
                  <div className="flex-1">
                    <Input
                      placeholder="Rationale"
                      value={newExposureControl.rationale}
                      onChange={(e) => setNewExposureControl({...newExposureControl, rationale: e.target.value})}
                    />
                  </div>
                  <Button size="sm" onClick={addExposureControl}>
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* Read-only view */
        <div className="grid grid-cols-3 gap-6">
          <div className="space-y-3">
            <div>
              <span className="text-sm font-medium text-[#6c757d]">Overall Risk:</span>
              <div className={`inline-block ml-2 px-2 py-1 rounded text-xs ${
                biasAssessment.overallRisk === 'low' ? 'bg-green-100 text-green-800' :
                biasAssessment.overallRisk === 'moderate' ? 'bg-yellow-100 text-yellow-800' :
                'bg-red-100 text-red-800'
              }`}>
                {biasAssessment.overallRisk.toUpperCase()}
              </div>
            </div>
            {biasAssessment.selectionBias && (
              <div>
                <span className="text-sm font-medium text-[#6c757d]">Selection Bias:</span>
                <div className={`inline-block ml-2 px-2 py-1 rounded text-xs ${
                  biasAssessment.selectionBias.riskLevel === 'low' ? 'bg-green-100 text-green-800' :
                  biasAssessment.selectionBias.riskLevel === 'moderate' ? 'bg-yellow-100 text-yellow-800' :
                  'bg-red-100 text-red-800'
                }`}>
                  {biasAssessment.selectionBias.riskLevel.toUpperCase()}
                </div>
                {biasAssessment.selectionBias.specificTypes && (
                  <div className="mt-2 space-y-1">
                    {biasAssessment.selectionBias.specificTypes.map((bias: any, index: number) => (
                      <div key={index} className="text-xs bg-gray-50 p-2 rounded">
                        <div className="font-medium">{bias.type.replace(/_/g, ' ').toUpperCase()}</div>
                        <div className="text-gray-600">{bias.description}</div>
                        <div className="text-blue-600 mt-1">{bias.mitigation}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
          <div className="space-y-3">
            {biasAssessment.confoundingBias && (
              <div>
                <span className="text-sm font-medium text-[#6c757d]">Confounding Risk:</span>
                <div className={`inline-block ml-2 px-2 py-1 rounded text-xs ${
                  biasAssessment.confoundingBias.riskLevel === 'low' ? 'bg-green-100 text-green-800' :
                  biasAssessment.confoundingBias.riskLevel === 'moderate' ? 'bg-yellow-100 text-yellow-800' :
                  'bg-red-100 text-red-800'
                }`}>
                  {biasAssessment.confoundingBias.riskLevel.toUpperCase()}
                </div>
                {biasAssessment.confoundingBias.identifiedConfounders && (
                  <div className="mt-2">
                    <div className="text-xs font-medium text-gray-600">Identified Confounders:</div>
                    <div className="text-xs text-gray-700">
                      {biasAssessment.confoundingBias.identifiedConfounders.join(', ')}
                    </div>
                  </div>
                )}
              </div>
            )}
            {propensityScore && propensityScore.indicated && (
              <div>
                <span className="text-sm font-medium text-[#6c757d]">Propensity Score Analysis:</span>
                <div className="mt-1 text-xs bg-blue-50 p-2 rounded">
                  <div className="font-medium">Method: {propensityScore.method.replace(/_/g, ' ')}</div>
                  {propensityScore.covariates && (
                    <div className="text-gray-600 mt-1">
                      Covariates: {propensityScore.covariates.join(', ')}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
          <div className="space-y-3">
            {negativeControls && (
              <div>
                <span className="text-sm font-medium text-[#6c757d]">Negative Controls:</span>
                <div className="mt-1 space-y-1">
                  {negativeControls.outcomeControls && negativeControls.outcomeControls.map((control: any, index: number) => (
                    <div key={index} className="text-xs bg-purple-50 p-2 rounded">
                      <div className="font-medium">Outcome: {control.outcome}</div>
                      <div className="text-gray-600">{control.rationale}</div>
                    </div>
                  ))}
                  {negativeControls.exposureControls && negativeControls.exposureControls.map((control: any, index: number) => (
                    <div key={index} className="text-xs bg-purple-50 p-2 rounded">
                      <div className="font-medium">Exposure: {control.exposure}</div>
                      <div className="text-gray-600">{control.rationale}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {sensitivityAnalyses && sensitivityAnalyses.length > 0 && (
              <div>
                <span className="text-sm font-medium text-[#6c757d]">Sensitivity Analyses:</span>
                <div className="mt-1 space-y-1">
                  {sensitivityAnalyses.slice(0, 3).map((analysis: any, index: number) => (
                    <div key={index} className="text-xs bg-orange-50 p-2 rounded">
                      <div className="font-medium">{analysis.scenario}</div>
                      <div className="text-gray-600">{analysis.approach}</div>
                    </div>
                  ))}
                  {sensitivityAnalyses.length > 3 && (
                    <div className="text-xs text-gray-500">
                      +{sensitivityAnalyses.length - 3} more analyses
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

// Editable Interim Analysis Component
// Missing Data Strategy Component
interface MissingDataStrategyProps {
  missingDataStrategy: MissingDataStrategy | null;
  setMissingDataStrategy: (strategy: MissingDataStrategy | null) => void;
  protocol: Protocol;
  activeDesignState: any;
  protocolConfig: any;
}

const MissingDataStrategyEditor: React.FC<MissingDataStrategyProps> = ({
  missingDataStrategy,
  setMissingDataStrategy,
  protocol,
  activeDesignState,
  protocolConfig
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editedStrategy, setEditedStrategy] = useState<MissingDataStrategy | null>(missingDataStrategy);
  const [newSensitivityAnalysis, setNewSensitivityAnalysis] = useState({ method: "", description: "" });

  const handleSave = () => {
    setMissingDataStrategy(editedStrategy);
    setIsEditing(false);
  };

  const handleCancel = () => {
    setEditedStrategy(missingDataStrategy);
    setIsEditing(false);
  };

  const addSensitivityAnalysis = () => {
    if (!newSensitivityAnalysis.method.trim() || !newSensitivityAnalysis.description.trim()) return;
    
    const updatedStrategy = {
      ...editedStrategy!,
      sensitivityAnalyses: [
        ...(editedStrategy?.sensitivityAnalyses || []),
        { ...newSensitivityAnalysis }
      ]
    };
    
    setEditedStrategy(updatedStrategy);
    setNewSensitivityAnalysis({ method: "", description: "" });
  };

  const removeSensitivityAnalysis = (index: number) => {
    const updatedStrategy = {
      ...editedStrategy!,
      sensitivityAnalyses: editedStrategy?.sensitivityAnalyses?.filter((_, i) => i !== index) || []
    };
    setEditedStrategy(updatedStrategy);
  };

  const getStudyTypeConsiderations = () => {
    switch (protocol.protocolType) {
      case 'interventional_clinical_trial':
        return 'Consider impact of treatment discontinuation, protocol deviations, and rescue medications on missing data patterns.';
      case 'prospective_cohort_study':
        return 'Account for loss to follow-up patterns and differential dropout between exposure groups.';
      case 'retrospective_cohort_study':
        return 'Address incomplete medical records and systematic differences in documentation practices.';
      case 'secondary_data_analysis':
        return 'Handle pre-existing data gaps and variable availability across different time periods.';
      case 'maic':
        return 'Address missing matching variables and incomplete aggregate data from published studies.';
      default:
        return 'Consider study-specific patterns of data missingness.';
    }
  };

  if (!missingDataStrategy && !isEditing) {
    return (
      <div className="col-span-3 bg-white p-6 rounded-md border border-[#dee2e6]">
        <div className="flex justify-between items-center mb-4">
          <h3 className="font-medium text-lg text-[#495057] flex items-center">
            <AlertCircle size={20} className="mr-2 text-[#6c757d]" />
            Missing Data Handling Strategy
          </h3>
          <Button 
            size="sm" 
            variant="outline" 
            onClick={() => {
              const defaultStrategy: MissingDataStrategy = {
                primaryApproach: "complete_case",
                primaryJustification: "Complete case analysis will be used for the primary analysis as the primary method.",
                missingMechanismAssumption: "mar",
                mechanismJustification: "Missing data is assumed to be Missing at Random (MAR) based on observed covariates.",
                reportingPlan: "Missing data patterns and proportions will be summarized and reported by treatment group and visit.",
                studySpecificConsiderations: getStudyTypeConsiderations()
              };
              setMissingDataStrategy(defaultStrategy);
              setEditedStrategy(defaultStrategy);
              setIsEditing(true);
            }}
          >
            <Plus className="h-4 w-4 mr-1" />
            Add Missing Data Strategy
          </Button>
        </div>
        <div className="bg-[#e3f2fd] border border-[#2196f3] border-opacity-30 p-4 rounded-md">
          <div className="flex items-start">
            <Info className="h-5 w-5 text-[#2196f3] mr-3 mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-sm font-medium text-[#1565c0]">Missing Data Strategy Recommended</p>
              <p className="text-sm text-[#1976d2] mt-1">
                {getStudyTypeConsiderations()} Define how missing observations will be handled statistically.
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="col-span-3 bg-white p-6 rounded-md border border-[#dee2e6]">
      <div className="flex justify-between items-center mb-4">
        <div className="flex items-center">
          <h3 className="font-medium text-lg text-[#495057] flex items-center">
            <AlertCircle size={20} className="mr-2 text-[#228be6]" />
            Missing Data Handling Strategy
          </h3>
          <CommentTrigger
            protocolId={protocol.id}
            designStateId={activeDesignState?.id || ""}
            section="statisticalAnalysisPlan"
            sectionItem="missingDataStrategy"
            contextData="missing-data-strategy"
            size="icon"
          />
        </div>
        <div className="flex items-center space-x-2">
          {isEditing ? (
            <>
              <Button size="sm" variant="outline" onClick={handleCancel}>
                <X className="h-4 w-4 mr-1" />
                Cancel
              </Button>
              <Button size="sm" onClick={handleSave}>
                <Save className="h-4 w-4 mr-1" />
                Save
              </Button>
            </>
          ) : (
            <Button size="sm" variant="outline" onClick={() => setIsEditing(true)}>
              <Pencil className="h-4 w-4 mr-1" />
              Edit
            </Button>
          )}
        </div>
      </div>

      {isEditing ? (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-6">
            <div>
              <Label htmlFor="primaryApproach">Primary Analysis Approach</Label>
              <Select 
                value={editedStrategy?.primaryApproach || "complete_case"}
                onValueChange={(value: any) => setEditedStrategy({
                  ...editedStrategy!,
                  primaryApproach: value
                })}
              >
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Select approach" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="complete_case">Complete Case Analysis</SelectItem>
                  <SelectItem value="available_case">Available Case Analysis</SelectItem>
                  <SelectItem value="multiple_imputation">Multiple Imputation</SelectItem>
                  <SelectItem value="last_observation">Last Observation Carried Forward</SelectItem>
                  <SelectItem value="mixed_model">Mixed Model for Repeated Measures</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div>
              <Label htmlFor="missingMechanism">Missing Data Mechanism</Label>
              <Select 
                value={editedStrategy?.missingMechanismAssumption || "mar"}
                onValueChange={(value: any) => setEditedStrategy({
                  ...editedStrategy!,
                  missingMechanismAssumption: value
                })}
              >
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Select mechanism" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="mcar">MCAR (Missing Completely at Random)</SelectItem>
                  <SelectItem value="mar">MAR (Missing at Random)</SelectItem>
                  <SelectItem value="mnar">MNAR (Missing Not at Random)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label htmlFor="primaryJustification">Primary Approach Justification</Label>
            <Textarea 
              className="mt-1"
              value={editedStrategy?.primaryJustification || ""}
              onChange={(e) => setEditedStrategy({
                ...editedStrategy!,
                primaryJustification: e.target.value
              })}
              placeholder="Justify the choice of primary analysis approach for missing data..."
              rows={3}
            />
          </div>

          <div>
            <Label htmlFor="mechanismJustification">Missing Mechanism Justification</Label>
            <Textarea 
              className="mt-1"
              value={editedStrategy?.mechanismJustification || ""}
              onChange={(e) => setEditedStrategy({
                ...editedStrategy!,
                mechanismJustification: e.target.value
              })}
              placeholder="Justify the assumption about missing data mechanism..."
              rows={2}
            />
          </div>

          <div>
            <Label htmlFor="reportingPlan">Missing Data Reporting Plan</Label>
            <Textarea 
              className="mt-1"
              value={editedStrategy?.reportingPlan || ""}
              onChange={(e) => setEditedStrategy({
                ...editedStrategy!,
                reportingPlan: e.target.value
              })}
              placeholder="Describe how missing data patterns will be reported and summarized..."
              rows={2}
            />
          </div>

          <div>
            <Label htmlFor="studyConsiderations">Study-Specific Considerations</Label>
            <Textarea 
              className="mt-1"
              value={editedStrategy?.studySpecificConsiderations || ""}
              onChange={(e) => setEditedStrategy({
                ...editedStrategy!,
                studySpecificConsiderations: e.target.value
              })}
              placeholder={getStudyTypeConsiderations()}
              rows={2}
            />
          </div>

          {/* Sensitivity Analyses Section */}
          <div>
            <div className="flex justify-between items-center mb-3">
              <Label>Sensitivity Analyses for Missing Data</Label>
            </div>
            
            {editedStrategy?.sensitivityAnalyses && editedStrategy.sensitivityAnalyses.length > 0 && (
              <div className="space-y-2 mb-4">
                {editedStrategy.sensitivityAnalyses.map((analysis, index) => (
                  <div key={index} className="flex items-center justify-between bg-[#f8f9fa] p-3 rounded-md border border-[#dee2e6]">
                    <div className="flex-1">
                      <div className="font-medium text-sm">{analysis.method}</div>
                      <div className="text-xs text-[#6c757d] mt-1">{analysis.description}</div>
                    </div>
                    <Button 
                      size="sm" 
                      variant="ghost" 
                      onClick={() => removeSensitivityAnalysis(index)}
                      className="text-[#dc3545] hover:bg-red-50"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
            
            <div className="grid grid-cols-3 gap-2">
              <Input 
                placeholder="Sensitivity method (e.g., LOCF, Pattern mixture)"
                value={newSensitivityAnalysis.method}
                onChange={(e) => setNewSensitivityAnalysis({
                  ...newSensitivityAnalysis,
                  method: e.target.value
                })}
              />
              <Input 
                placeholder="Description of approach"
                value={newSensitivityAnalysis.description}
                onChange={(e) => setNewSensitivityAnalysis({
                  ...newSensitivityAnalysis,
                  description: e.target.value
                })}
              />
              <Button 
                size="sm" 
                onClick={addSensitivityAnalysis}
                disabled={!newSensitivityAnalysis.method.trim() || !newSensitivityAnalysis.description.trim()}
              >
                <Plus className="h-4 w-4 mr-1" />
                Add
              </Button>
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-6">
            <div>
              <span className="text-sm font-medium text-[#6c757d]">Primary Analysis Approach:</span>
              <p className="text-sm text-[#495057] mt-1">
                {missingDataStrategy?.primaryApproach?.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()) || "Not specified"}
              </p>
            </div>
            
            <div>
              <span className="text-sm font-medium text-[#6c757d]">Missing Data Mechanism:</span>
              <p className="text-sm text-[#495057] mt-1">
                {missingDataStrategy?.missingMechanismAssumption?.toUpperCase() || "Not specified"}
              </p>
            </div>
          </div>

          {missingDataStrategy?.primaryJustification && (
            <div>
              <span className="text-sm font-medium text-[#6c757d]">Primary Approach Justification:</span>
              <p className="text-sm text-[#495057] mt-1">{missingDataStrategy.primaryJustification}</p>
            </div>
          )}

          {missingDataStrategy?.mechanismJustification && (
            <div>
              <span className="text-sm font-medium text-[#6c757d]">Missing Mechanism Justification:</span>
              <p className="text-sm text-[#495057] mt-1">{missingDataStrategy.mechanismJustification}</p>
            </div>
          )}

          {missingDataStrategy?.reportingPlan && (
            <div>
              <span className="text-sm font-medium text-[#6c757d]">Reporting Plan:</span>
              <p className="text-sm text-[#495057] mt-1">{missingDataStrategy.reportingPlan}</p>
            </div>
          )}

          {missingDataStrategy?.studySpecificConsiderations && (
            <div>
              <span className="text-sm font-medium text-[#6c757d]">Study-Specific Considerations:</span>
              <p className="text-sm text-[#495057] mt-1">{missingDataStrategy.studySpecificConsiderations}</p>
            </div>
          )}

          {missingDataStrategy?.sensitivityAnalyses && missingDataStrategy.sensitivityAnalyses.length > 0 && (
            <div>
              <span className="text-sm font-medium text-[#6c757d]">Sensitivity Analyses:</span>
              <div className="mt-2 space-y-2">
                {missingDataStrategy.sensitivityAnalyses.map((analysis, index) => (
                  <div key={index} className="bg-[#f8f9fa] p-3 rounded-md border border-[#dee2e6]">
                    <div className="font-medium text-sm">{analysis.method}</div>
                    <div className="text-xs text-[#6c757d] mt-1">{analysis.description}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

interface InterimAnalysisEditorProps {
  interimAnalysis: any;
  setInterimAnalysis: (analysis: any) => void;
  protocol: Protocol;
  setProtocol: React.Dispatch<React.SetStateAction<Protocol>>;
}

const InterimAnalysisEditor: React.FC<InterimAnalysisEditorProps> = ({
  interimAnalysis,
  setInterimAnalysis,
  protocol,
  setProtocol
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editingAnalysis, setEditingAnalysis] = useState(interimAnalysis);

  const handleSave = () => {
    setInterimAnalysis(editingAnalysis);
    
    // Update protocol SAP with modified interim analysis
    const currentSAP = protocol.statisticalAnalysisPlan ? 
      (typeof protocol.statisticalAnalysisPlan === 'string' ? 
        JSON.parse(protocol.statisticalAnalysisPlan) : 
        protocol.statisticalAnalysisPlan) : {};
    
    const updatedSAP = {
      ...currentSAP,
      interimAnalysis: editingAnalysis
    };
    
    setProtocol({
      ...protocol,
      statisticalAnalysisPlan: JSON.stringify(updatedSAP)
    });
    
    setIsEditing(false);
  };

  const handleCancel = () => {
    setEditingAnalysis(interimAnalysis);
    setIsEditing(false);
  };

  return (
    <div className="col-span-3 bg-white p-6 rounded-md border border-[#dee2e6]">
      <div className="flex justify-between items-center mb-4">
        <h3 className="font-medium text-lg text-[#495057] flex items-center">
          <Clock size={20} className="mr-2 text-[#228be6]" />
          Interim Analysis
        </h3>
        <div className="flex gap-2">
          {isEditing ? (
            <>
              <Button size="sm" variant="outline" onClick={handleCancel}>
                <X className="h-4 w-4 mr-1" />
                Cancel
              </Button>
              <Button size="sm" onClick={handleSave}>
                <Save className="h-4 w-4 mr-1" />
                Save Changes
              </Button>
            </>
          ) : (
            <Button size="sm" variant="outline" onClick={() => setIsEditing(true)}>
              <Pencil className="h-4 w-4 mr-1" />
              Edit Analysis
            </Button>
          )}
        </div>
      </div>

      {isEditing ? (
        <div className="space-y-6">
          {/* Planned Interim Analysis */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <input
                type="checkbox"
                checked={editingAnalysis?.planned || false}
                onChange={(e) => setEditingAnalysis({...editingAnalysis, planned: e.target.checked})}
                className="rounded"
              />
              <Label>Interim Analysis Planned</Label>
            </div>
          </div>

          {editingAnalysis?.planned && (
            <>
              {/* Rationale */}
              <div>
                <Label>Rationale for Interim Analysis</Label>
                <Textarea
                  className="mt-1"
                  value={editingAnalysis?.rationale || ""}
                  onChange={(e) => setEditingAnalysis({...editingAnalysis, rationale: e.target.value})}
                  placeholder="Provide justification for conducting interim analysis..."
                  rows={3}
                />
              </div>

              {/* Number of Interim Analyses */}
              <div>
                <Label>Number of Planned Interim Analyses</Label>
                <Select 
                  value={editingAnalysis?.numberOfAnalyses?.toString() || "1"} 
                  onValueChange={(value) => setEditingAnalysis({...editingAnalysis, numberOfAnalyses: parseInt(value)})}
                >
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">1 Interim Analysis</SelectItem>
                    <SelectItem value="2">2 Interim Analyses</SelectItem>
                    <SelectItem value="3">3 Interim Analyses</SelectItem>
                    <SelectItem value="4">4 Interim Analyses</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Alpha Spending Function */}
              <div>
                <Label>Alpha Spending Function</Label>
                <Select 
                  value={editingAnalysis?.alphaSpending?.method || "obrienFleming"} 
                  onValueChange={(value) => setEditingAnalysis({
                    ...editingAnalysis, 
                    alphaSpending: {...editingAnalysis?.alphaSpending, method: value}
                  })}
                >
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="obrienFleming">O'Brien-Fleming</SelectItem>
                    <SelectItem value="pocock">Pocock</SelectItem>
                    <SelectItem value="haybittle">Haybittle-Peto</SelectItem>
                    <SelectItem value="custom">Custom Spending Function</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Stopping Rules / Monitoring Criteria */}
              <div>
                <Label>Monitoring Criteria</Label>
                <div className="space-y-2 mt-1">
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={editingAnalysis?.stoppingRules?.efficacy || false}
                      onChange={(e) => setEditingAnalysis({
                        ...editingAnalysis,
                        stoppingRules: {
                          ...editingAnalysis?.stoppingRules,
                          efficacy: e.target.checked
                        }
                      })}
                      className="rounded"
                    />
                    <Label className="text-sm">Monitor efficacy endpoints</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={editingAnalysis?.stoppingRules?.futility || false}
                      onChange={(e) => setEditingAnalysis({
                        ...editingAnalysis,
                        stoppingRules: {
                          ...editingAnalysis?.stoppingRules,
                          futility: e.target.checked
                        }
                      })}
                      className="rounded"
                    />
                    <Label className="text-sm">Monitor futility/data quality</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={editingAnalysis?.stoppingRules?.safety || false}
                      onChange={(e) => setEditingAnalysis({
                        ...editingAnalysis,
                        stoppingRules: {
                          ...editingAnalysis?.stoppingRules,
                          safety: e.target.checked
                        }
                      })}
                      className="rounded"
                    />
                    <Label className="text-sm">Monitor safety events</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={editingAnalysis?.stoppingRules?.recruitment || false}
                      onChange={(e) => setEditingAnalysis({
                        ...editingAnalysis,
                        stoppingRules: {
                          ...editingAnalysis?.stoppingRules,
                          recruitment: e.target.checked
                        }
                      })}
                      className="rounded"
                    />
                    <Label className="text-sm">Monitor recruitment/enrollment</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={editingAnalysis?.stoppingRules?.baseline || false}
                      onChange={(e) => setEditingAnalysis({
                        ...editingAnalysis,
                        stoppingRules: {
                          ...editingAnalysis?.stoppingRules,
                          baseline: e.target.checked
                        }
                      })}
                      className="rounded"
                    />
                    <Label className="text-sm">Monitor baseline characteristics</Label>
                  </div>
                </div>
              </div>

              {/* Data Monitoring Committee */}
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <input
                    type="checkbox"
                    checked={editingAnalysis?.dataMonitoringCommittee?.established || false}
                    onChange={(e) => setEditingAnalysis({
                      ...editingAnalysis,
                      dataMonitoringCommittee: {
                        ...editingAnalysis?.dataMonitoringCommittee,
                        established: e.target.checked
                      }
                    })}
                    className="rounded"
                  />
                  <Label>Data Monitoring Committee Established</Label>
                </div>
                
                {editingAnalysis?.dataMonitoringCommittee?.established && (
                  <div className="ml-6">
                    <Label>DMC Composition</Label>
                    <Textarea
                      className="mt-1"
                      value={editingAnalysis?.dataMonitoringCommittee?.composition || ""}
                      onChange={(e) => setEditingAnalysis({
                        ...editingAnalysis,
                        dataMonitoringCommittee: {
                          ...editingAnalysis?.dataMonitoringCommittee,
                          composition: e.target.value
                        }
                      })}
                      placeholder="Describe the composition of the Data Monitoring Committee..."
                      rows={2}
                    />
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      ) : (
        /* Read-only view */
        <div className="space-y-4">
          <div>
            <span className="text-sm font-medium text-[#6c757d]">Interim Analysis Planned:</span>
            <span className={`ml-2 px-2 py-1 rounded text-xs ${
              interimAnalysis?.planned ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
            }`}>
              {interimAnalysis?.planned ? 'YES' : 'NO'}
            </span>
          </div>

          {interimAnalysis?.planned && (
            <>
              {interimAnalysis?.rationale && (
                <div>
                  <span className="text-sm font-medium text-[#6c757d]">Rationale:</span>
                  <p className="text-sm mt-1 text-gray-700">{interimAnalysis.rationale}</p>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <span className="text-sm font-medium text-[#6c757d]">Number of Analyses:</span>
                  <div className="text-sm bg-blue-50 p-2 rounded mt-1">
                    {interimAnalysis?.numberOfAnalyses || 1}
                  </div>
                </div>

                <div>
                  <span className="text-sm font-medium text-[#6c757d]">Alpha Spending:</span>
                  <div className="text-sm bg-blue-50 p-2 rounded mt-1">
                    {interimAnalysis?.alphaSpending?.method?.replace(/([A-Z])/g, ' $1')?.replace(/^./, (str: string) => str.toUpperCase()) || 'O\'Brien-Fleming'}
                  </div>
                </div>
              </div>

              {interimAnalysis?.stoppingRules && (
                <div>
                  <span className="text-sm font-medium text-[#6c757d]">Monitoring Criteria:</span>
                  <div className="flex gap-2 mt-1 flex-wrap">
                    {interimAnalysis.stoppingRules.efficacy && (
                      <span className="text-xs bg-green-100 text-green-800 px-2 py-1 rounded">Efficacy</span>
                    )}
                    {interimAnalysis.stoppingRules.futility && (
                      <span className="text-xs bg-yellow-100 text-yellow-800 px-2 py-1 rounded">Futility/Quality</span>
                    )}
                    {interimAnalysis.stoppingRules.safety && (
                      <span className="text-xs bg-red-100 text-red-800 px-2 py-1 rounded">Safety</span>
                    )}
                    {interimAnalysis.stoppingRules.recruitment && (
                      <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded">Recruitment</span>
                    )}
                    {interimAnalysis.stoppingRules.baseline && (
                      <span className="text-xs bg-purple-100 text-purple-800 px-2 py-1 rounded">Baseline</span>
                    )}
                  </div>
                </div>
              )}

              {interimAnalysis?.dataMonitoringCommittee?.established && (
                <div>
                  <span className="text-sm font-medium text-[#6c757d]">Data Monitoring Committee:</span>
                  <div className="text-sm bg-purple-50 p-2 rounded mt-1">
                    <div className="font-medium">Established</div>
                    {interimAnalysis.dataMonitoringCommittee.composition && (
                      <div className="text-gray-600 mt-1">{interimAnalysis.dataMonitoringCommittee.composition}</div>
                    )}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
};

const StatisticalAnalysisPlan: React.FC<StatisticalAnalysisPlanProps> = ({ protocol, setProtocol, activeDesignState, isActive = false }) => {
  const { toast } = useToast()
  const [showAddEndpointDialog, setShowAddEndpointDialog] = useState(false)
  const [endpointType, setEndpointType] = useState<"primary" | "secondary" | "exploratory">("primary")
  const [isGenerating, setIsGenerating] = useState(false)
  
  // Get protocol-type-specific configuration
  const protocolConfig = getProtocolTypeConfig(protocol.protocolType || 'interventional_clinical_trial')
  const terminology = protocolConfig.terminology
  
  // Parse statistical analysis plan data from protocol
  const sapData = React.useMemo<SAPData>(() => {
    try {
      if (!protocol.statisticalAnalysisPlan) {
        return {
          sampleSize: { total: 0, perArm: 0, justification: "" },
          primaryEndpoints: [],
          secondaryEndpoints: [],
          analysisPopulations: [],
          statisticalMethods: [],
          ...(protocol.protocolType === "maic" ? {
            maicSpecific: {
              weightingApproach: "",
              effectMeasure: "hazard_ratio",
              sensitivityDescription: "",
              matchingVariables: [],
              outcomeModels: [],
              sensitivityAnalyses: []
            }
          } : {})
        }
      }
      
      const parsedSap = typeof protocol.statisticalAnalysisPlan === 'string' 
        ? JSON.parse(protocol.statisticalAnalysisPlan) 
        : protocol.statisticalAnalysisPlan;
        
      // If this is a MAIC protocol but no MAIC-specific data exists, add the default structure
      if (protocol.protocolType === "maic" && !parsedSap.maicSpecific) {
        parsedSap.maicSpecific = {
          weightingApproach: "",
          effectMeasure: "hazard_ratio",
          sensitivityDescription: "",
          matchingVariables: [],
          outcomeModels: [],
          sensitivityAnalyses: []
        };
      }
      
      return parsedSap;
    } catch (e) {
      console.error('Failed to parse statistical analysis plan:', e)
      return {
        sampleSize: { total: 0, perArm: 0, justification: "" },
        primaryEndpoints: [],
        secondaryEndpoints: [],
        analysisPopulations: [],
        statisticalMethods: [],
        ...(protocol.protocolType === "maic" ? {
          maicSpecific: {
            weightingApproach: "",
            effectMeasure: "hazard_ratio",
            sensitivityDescription: "",
            matchingVariables: [],
            outcomeModels: [],
            sensitivityAnalyses: []
          }
        } : {})
      }
    }
  }, [protocol.statisticalAnalysisPlan])
  
  // Local state
  const [sampleSize, setSampleSize] = useState(sapData.sampleSize || { total: 0, perArm: 0, justification: "" })
  const [primaryEndpoints, setPrimaryEndpoints] = useState(sapData.primaryEndpoints || sapData.primaryOutcomes || [])
  const [secondaryEndpoints, setSecondaryEndpoints] = useState(sapData.secondaryEndpoints || sapData.secondaryOutcomes || [])
  const [exploratoryEndpoints, setExploratoryEndpoints] = useState(sapData.exploratoryEndpoints || sapData.exploratoryOutcomes || [])
  const [estimands, setEstimands] = useState<Estimand[]>(sapData.estimands || [])
  const [analysisPopulations, setAnalysisPopulations] = useState(sapData.analysisPopulations || [])
  const [statisticalMethods, setStatisticalMethods] = useState(sapData.statisticalMethods || [])
  
  // Enhanced SAP state
  const [interimAnalysis, setInterimAnalysis] = useState(sapData.interimAnalysis || null)
  const [biasAssessment, setBiasAssessment] = useState(sapData.biasAssessment || null)
  const [isGeneratingEstimands, setIsGeneratingEstimands] = useState(false)
  const [multiplicityControl, setMultiplicityControl] = useState(sapData.multiplicityControl || null)
  const [causalInference, setCausalInference] = useState(sapData.causalInference || null)
  const [propensityScore, setPropensityScore] = useState(sapData.propensityScoreAnalysis || null)
  const [negativeControls, setNegativeControls] = useState(sapData.negativeControls || null)
  const [sensitivityAnalyses, setSensitivityAnalyses] = useState(sapData.sensitivityAnalyses || [])
  const [cohortDefinition, setCohortDefinition] = useState(sapData.cohortDefinition || null)
  const [missingDataStrategy, setMissingDataStrategy] = useState<MissingDataStrategy | null>(sapData.missingDataStrategy || null)

  // Update state when protocol data changes (e.g., when fresh data is loaded from API)
  useEffect(() => {
    setSampleSize(sapData.sampleSize || { total: 0, perArm: 0, justification: "" });
    setPrimaryEndpoints(sapData.primaryEndpoints || sapData.primaryOutcomes || []);
    setSecondaryEndpoints(sapData.secondaryEndpoints || sapData.secondaryOutcomes || []);
    setExploratoryEndpoints(sapData.exploratoryEndpoints || sapData.exploratoryOutcomes || []);
    setEstimands(sapData.estimands || []);
    setAnalysisPopulations(sapData.analysisPopulations || []);
    setStatisticalMethods(sapData.statisticalMethods || []);
    setInterimAnalysis(sapData.interimAnalysis || null);
    setBiasAssessment(sapData.biasAssessment || null);
    setMultiplicityControl(sapData.multiplicityControl || null);
    setCausalInference(sapData.causalInference || null);
    setPropensityScore(sapData.propensityScoreAnalysis || null);
    setNegativeControls(sapData.negativeControls || null);
    setSensitivityAnalyses(sapData.sensitivityAnalyses || []);
    setCohortDefinition(sapData.cohortDefinition || null);
    setMissingDataStrategy(sapData.missingDataStrategy || null);
  }, [sapData]);
  
  // MAIC-specific state
  const [newMatchingVariable, setNewMatchingVariable] = useState("")
  const [newOutcomeModel, setNewOutcomeModel] = useState("")
  const [newSensitivityAnalysis, setNewSensitivityAnalysis] = useState("")
  const [newEndpoint, setNewEndpoint] = useState({...defaultEndpoint})
  const [showAddEstimandDialog, setShowAddEstimandDialog] = useState(false)
  const [newEstimand, setNewEstimand] = useState<Estimand>({
    id: 0,
    endpointName: "",
    population: "",
    variable: "",
    populationLevelSummary: "",
    intercurrentEventStrategy: "treatment_policy",
    intercurrentEventHandling: "",
    justification: "",
    estimandType: "primary"
  })
  
  // Handle updating MAIC-specific data
  const handleSAPUpdate = (updatedData: SAPData) => {
    // Update all relevant state
    setSampleSize(updatedData.sampleSize);
    setPrimaryEndpoints(updatedData.primaryEndpoints || []);
    setSecondaryEndpoints(updatedData.secondaryEndpoints || []);
    setAnalysisPopulations(updatedData.analysisPopulations || []);
    setStatisticalMethods(updatedData.statisticalMethods || []);
    
    // Save to protocol
    setProtocol({
      ...protocol,
      statisticalAnalysisPlan: JSON.stringify(updatedData)
    });
  }
  
  // Update protocol when local state changes
  useEffect(() => {
    // Create a base SAP structure
    let newSapData = {
      sampleSize,
      primaryEndpoints,
      secondaryEndpoints,
      exploratoryEndpoints,
      estimands,
      analysisPopulations,
      statisticalMethods,
      // Include bias assessment data if it exists
      ...(biasAssessment && { biasAssessment }),
      ...(propensityScore && { propensityScoreAnalysis: propensityScore }),
      ...(negativeControls && { negativeControls }),
      ...(sensitivityAnalyses && sensitivityAnalyses.length > 0 && { sensitivityAnalyses }),
      ...(interimAnalysis && { interimAnalysis }),
      ...(multiplicityControl && { multiplicityControl }),
      ...(causalInference && { causalInference }),
      ...(missingDataStrategy && { missingDataStrategy }),
      ...(cohortDefinition && { cohortDefinition })
    } as SAPData
    
    // For MAIC, add additional fields if they don't exist
    if (protocol.protocolType === "maic") {
      newSapData = {
        ...newSapData,
        maicSpecific: {
          weightingApproach: "",
          effectMeasure: "hazard_ratio",
          sensitivityDescription: "",
          matchingVariables: [],
          outcomeModels: [],
          sensitivityAnalyses: [],
          ...(sapData.maicSpecific || {})
        }
      }
    }
    
    setProtocol(prevProtocol => ({
      ...prevProtocol,
      statisticalAnalysisPlan: JSON.stringify(newSapData)
    }))
  }, [sampleSize, primaryEndpoints, secondaryEndpoints, exploratoryEndpoints, estimands, analysisPopulations, statisticalMethods, biasAssessment, propensityScore, negativeControls, sensitivityAnalyses, interimAnalysis, multiplicityControl, causalInference, cohortDefinition, setProtocol])
  
  // Handle adding a new endpoint
  const handleAddEndpoint = () => {
    if (!newEndpoint.name.trim()) {
      toast({
        title: "Name Required",
        description: "Please provide a name for the endpoint",
        variant: "destructive",
      })
      return
    }
    
    if (endpointType === "primary") {
      setPrimaryEndpoints([...primaryEndpoints, {...newEndpoint, id: Date.now(), origin: "manual"}])
    } else if (endpointType === "secondary") {
      setSecondaryEndpoints([...secondaryEndpoints, {...newEndpoint, id: Date.now(), origin: "manual"}])
    } else {
      setExploratoryEndpoints([...exploratoryEndpoints, {...newEndpoint, id: Date.now(), origin: "manual"}])
    }
    
    setNewEndpoint({...defaultEndpoint})
    setShowAddEndpointDialog(false)
  }
  
  // Handle updating an endpoint
  const updateEndpoint = (endpointType: "primary" | "secondary" | "exploratory", id: number, updated: any) => {
    if (endpointType === "primary") {
      setPrimaryEndpoints(primaryEndpoints.map(ep => ep.id === id ? updated : ep))
    } else if (endpointType === "secondary") {
      setSecondaryEndpoints(secondaryEndpoints.map(ep => ep.id === id ? updated : ep))
    } else {
      setExploratoryEndpoints(exploratoryEndpoints.map(ep => ep.id === id ? updated : ep))
    }
  }
  
  // Handle deleting an endpoint
  const deleteEndpoint = (endpointType: "primary" | "secondary" | "exploratory", id: number) => {
    if (endpointType === "primary") {
      setPrimaryEndpoints(primaryEndpoints.filter(ep => ep.id !== id))
    } else if (endpointType === "secondary") {
      setSecondaryEndpoints(secondaryEndpoints.filter(ep => ep.id !== id))
    } else {
      setExploratoryEndpoints(exploratoryEndpoints.filter(ep => ep.id !== id))
    }
  }
  
  // Handle adding a new analysis population
  const addAnalysisPopulation = () => {
    setAnalysisPopulations([
      ...analysisPopulations, 
      {...defaultPopulation, id: Date.now(), origin: "manual"}
    ])
  }
  
  // Handle adding a new statistical method
  const addStatisticalMethod = () => {
    setStatisticalMethods([
      ...statisticalMethods, 
      {...defaultMethod, id: Date.now(), origin: "manual"}
    ])
  }
  
  // Handle adding a new estimand
  const handleAddEstimand = () => {
    if (!newEstimand.endpointName.trim()) {
      toast({
        title: "Endpoint Required",
        description: "Please select an endpoint for the estimand",
        variant: "destructive",
      })
      return
    }
    
    setEstimands([...estimands, {...newEstimand, id: Date.now()}])
    setNewEstimand({
      id: 0,
      endpointName: "",
      population: "",
      variable: "",
      populationLevelSummary: "",
      intercurrentEventStrategy: "treatment_policy",
      intercurrentEventHandling: "",
      justification: "",
      estimandType: "primary"
    })
    setShowAddEstimandDialog(false)
  }
  
  // Handle updating an estimand
  const updateEstimand = (id: number, updated: Estimand) => {
    setEstimands(estimands.map(est => est.id === id ? updated : est))
  }
  
  // Handle deleting an estimand
  const deleteEstimand = (id: number) => {
    setEstimands(estimands.filter(est => est.id !== id))
  }
  
  // Get all available endpoints for estimand linking
  const getAllEndpoints = () => {
    return [
      ...primaryEndpoints.map(ep => ({...ep, type: 'primary'})),
      ...secondaryEndpoints.map(ep => ({...ep, type: 'secondary'})),
      ...exploratoryEndpoints.map(ep => ({...ep, type: 'exploratory'}))
    ]
  }

  // Generate estimands with AI
  const handleGenerateEstimands = async () => {
    const availableEndpoints = getAllEndpoints()
    if (availableEndpoints.length === 0) {
      toast({
        title: "No Endpoints Available",
        description: "Please add endpoints first before generating estimands",
        variant: "destructive",
      })
      return
    }

    if (!protocol.synopsis) {
      toast({
        title: "Synopsis Required",
        description: "Please provide a synopsis first",
        variant: "destructive",
      })
      return
    }

    setIsGeneratingEstimands(true)
    
    try {
      const response = await fetch('/api/generate-estimands', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          synopsis: protocol.synopsis,
          protocolType: protocol.protocolType,
          protocolId: protocol.id,
          designStateId: activeDesignState?.id || "",
          endpoints: {
            primary: primaryEndpoints,
            secondary: secondaryEndpoints,
            exploratory: exploratoryEndpoints
          }
        }),
      })
      
      if (!response.ok) {
        throw new Error(await getApiErrorMessage(response, "Failed to generate estimands"))
      }
      
      const result = await response.json()
      
      if (result.estimands && Array.isArray(result.estimands)) {
        // Convert AI-generated estimands to match our format
        const generatedEstimands = result.estimands.map((est: any, index: number) => ({
          id: Date.now() + index,
          endpointName: est.endpointName || est.linkedEndpoint,
          endpointId: availableEndpoints.find(ep => ep.name === est.endpointName)?.id,
          estimandType: est.estimandType || est.type || "primary",
          population: est.population || est.targetPopulation,
          variable: est.variable || est.primaryVariable,
          populationLevelSummary: est.populationLevelSummary || est.summaryMeasure,
          intercurrentEventStrategy: est.intercurrentEventStrategy || "treatment_policy",
          intercurrentEventHandling: est.intercurrentEventHandling || est.handling,
          justification: est.justification || est.rationale,
          origin: est.origin || est.sourceUse || "generated"
        }))
        
        setEstimands([...estimands, ...generatedEstimands])
        
        toast({
          title: "Estimands Generated",
          description: `Generated ${generatedEstimands.length} estimands using AI`,
        })
      }
    } catch (error) {
      console.error('Error generating estimands:', error)
      toast({
        title: "Generation Failed",
        description: error instanceof Error ? error.message : "Failed to generate estimands. Please try again.",
        variant: "destructive",
      })
    } finally {
      setIsGeneratingEstimands(false)
    }
  }
  
  // Generate SAP with AI
  const generateSAP = async (generationMode: SectionGenerationMode = "augment") => {
    if (!protocol.synopsis) {
      toast({
        title: "Synopsis Required",
        description: "Please provide a synopsis in the Synopsis tab first",
        variant: "destructive",
      })
      return
    }
    
    // Check for existing alignment analysis
    let alignmentAnalysis = null;
    try {
      const alignmentKey = `protocol-${protocol.id}-alignment`;
      const savedAlignment = localStorage.getItem(alignmentKey);
      if (savedAlignment) {
        alignmentAnalysis = JSON.parse(savedAlignment);
      }
    } catch (error) {
      console.error("Error retrieving alignment analysis:", error);
    }

    setIsGenerating(true)
    
    try {

      // This would call the API endpoint to generate an SAP
      const response = await fetch('/api/generate-analysis-plan', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          synopsis: protocol.synopsis,
          inclusionCriteria: protocol.inclusionCriteria,
          exclusionCriteria: protocol.exclusionCriteria,
          supplementaryInfo: formatSupplementaryInfoForAI(
            protocol.supplementaryInfo,
            "statistical analysis plan endpoints estimands sample size power analysis populations missing data multiplicity interim subgroup sensitivity"
          ),
          protocolType: protocol.protocolType,
          protocolId: protocol.id,
          designStateId: activeDesignState?.id || "",
          alignmentAnalysis: alignmentAnalysis,
          generationMode
        }),
      })
      
      if (!response.ok) {
        throw new Error(await getApiErrorMessage(response, "Failed to generate statistical analysis plan"))
      }
      
      const data = await response.json()

      if (data?.sourceStatus === "not_found") {
        toast({
          title: "Source Content Not Found",
          description: data.sourceStatusMessage || data.explanation || "No statistical analysis plan information was found in the source documents.",
        })
        return
      }

      const withOrigin = (items: any[] = []) => items.map((item: any) => ({
        ...item,
        origin: item.origin || item.sourceUse || item.classification || "generated"
      }))
      
      // Update state with generated data
      setSampleSize(data.sampleSize || { total: 0, perArm: 0, justification: "" })
      setPrimaryEndpoints(withOrigin(data.primaryEndpoints || data.primaryOutcomes || []))
      setSecondaryEndpoints(withOrigin(data.secondaryEndpoints || data.secondaryOutcomes || []))
      setAnalysisPopulations(withOrigin(data.analysisPopulations || []))
      setStatisticalMethods(withOrigin(data.statisticalMethods || []))
      
      // Update enhanced SAP data
      setInterimAnalysis(data.interimAnalysis || null)
      setBiasAssessment(data.biasAssessment || null)
      setMultiplicityControl(data.multiplicityControl || null)
      setCausalInference(data.causalInference || null)
      setMissingDataStrategy(data.missingDataStrategy || null)
      setPropensityScore(data.propensityScoreAnalysis || null)
      setNegativeControls(data.negativeControls || null)
      setSensitivityAnalyses(data.sensitivityAnalyses || [])
      setCohortDefinition(data.cohortDefinition || null)
      
      toast({
        title: "Analysis Plan Generated",
        description: "Statistical analysis plan has been generated from protocol data",
      })
    } catch (error) {
      console.error("Error generating SAP:", error)
      toast({
        title: "Generation Failed",
        description: error instanceof Error ? error.message : "Failed to generate statistical analysis plan. Please try again.",
        variant: "destructive",
      })
    } finally {
      setIsGenerating(false)
    }
  }

  // Export SAP as text document
  const exportSAP = () => {
    const exportData = {
      title: protocol.title,
      id: protocol.id,
      sampleSize,
      primaryEndpoints,
      secondaryEndpoints,
      analysisPopulations,
      statisticalMethods
    }
    
    // Convert to formatted text
    let sapText = `STATISTICAL ANALYSIS PLAN\n\n`
    sapText += `Protocol: ${protocol.title} (${protocol.id})\n\n`
    sapText += `1. SAMPLE SIZE\n\n`
    sapText += `Total Sample Size: ${sampleSize.total}\n`
    sapText += `Participants Per Arm: ${sampleSize.perArm}\n`
    sapText += `Justification: ${sampleSize.justification || "Not provided"}\n\n`
    
    sapText += `2. PRIMARY ENDPOINTS\n\n`
    primaryEndpoints.forEach((ep, index) => {
      sapText += `2.${index + 1}. ${ep.name}\n`
      sapText += `Type: ${ep.type || "Not specified"}\n`
      sapText += `Timepoint: ${ep.timepoint || "Not specified"}\n`
      sapText += `Statistical Method: ${ep.method || "Not specified"}\n`
      if (ep.description) sapText += `Description: ${ep.description}\n`
      sapText += `\n`
    })
    
    sapText += `3. SECONDARY ENDPOINTS\n\n`
    secondaryEndpoints.forEach((ep, index) => {
      sapText += `3.${index + 1}. ${ep.name}\n`
      sapText += `Type: ${ep.type || "Not specified"}\n`
      sapText += `Timepoint: ${ep.timepoint || "Not specified"}\n`
      sapText += `Statistical Method: ${ep.method || "Not specified"}\n`
      if (ep.description) sapText += `Description: ${ep.description}\n`
      sapText += `\n`
    })
    
    sapText += `4. ANALYSIS POPULATIONS\n\n`
    analysisPopulations.forEach((pop, index) => {
      sapText += `4.${index + 1}. ${pop.name}\n`
      sapText += `Definition: ${pop.definition || "Not provided"}\n\n`
    })
    
    sapText += `5. STATISTICAL METHODS\n\n`
    statisticalMethods.forEach((method, index) => {
      sapText += `5.${index + 1}. ${method.name}\n`
      sapText += `Type: ${method.type || "Not specified"}\n`
      sapText += `Description: ${method.description || "Not provided"}\n\n`
    })
    
    // Add missing data strategy if available
    if (missingDataStrategy) {
      sapText += `6. MISSING DATA HANDLING STRATEGY\n\n`
      sapText += `Primary Approach: ${missingDataStrategy.primaryApproach?.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()) || "Not specified"}\n`
      sapText += `Missing Mechanism Assumption: ${missingDataStrategy.missingMechanismAssumption?.toUpperCase() || "Not specified"}\n\n`
      
      if (missingDataStrategy.primaryJustification) {
        sapText += `Primary Approach Justification: ${missingDataStrategy.primaryJustification}\n\n`
      }
      
      if (missingDataStrategy.mechanismJustification) {
        sapText += `Missing Mechanism Justification: ${missingDataStrategy.mechanismJustification}\n\n`
      }
      
      if (missingDataStrategy.reportingPlan) {
        sapText += `Reporting Plan: ${missingDataStrategy.reportingPlan}\n\n`
      }
      
      if (missingDataStrategy.studySpecificConsiderations) {
        sapText += `Study-Specific Considerations: ${missingDataStrategy.studySpecificConsiderations}\n\n`
      }
      
      if (missingDataStrategy.sensitivityAnalyses && missingDataStrategy.sensitivityAnalyses.length > 0) {
        sapText += `Sensitivity Analyses:\n`
        missingDataStrategy.sensitivityAnalyses.forEach((analysis, index) => {
          sapText += `  ${index + 1}. ${analysis.method}: ${analysis.description}\n`
        })
        sapText += `\n`
      }
    }
    
    // Create download
    const blob = new Blob([sapText], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${protocol.id}_statistical_analysis_plan.txt`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
    
    toast({
      title: "Export Successful",
      description: "Statistical analysis plan has been exported as text file",
    })
  }

  const hasSAPContent =
    Number(sampleSize?.total || 0) > 0 ||
    primaryEndpoints.length > 0 ||
    secondaryEndpoints.length > 0 ||
    exploratoryEndpoints.length > 0 ||
    analysisPopulations.length > 0 ||
    statisticalMethods.length > 0
  
  return (
    <div className="space-y-6">
      {/* Top actions bar */}
      <div className="bg-white p-4 rounded-md border border-[#dee2e6] flex justify-between items-center">
        <div>
          <h2 className="font-medium text-lg text-[#495057]">Statistical Analysis Plan</h2>
          <p className="text-sm text-[#6c757d]">Define statistical approach and sample size calculations</p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            className="h-9"
            onClick={exportSAP}
            disabled={!primaryEndpoints.length}
          >
            <Download size={16} className="mr-1.5" />
            Export SAP
          </Button>
        </div>
      </div>

      {protocol.synopsis && (
        <SectionSourcePanel
          protocol={protocol}
          setProtocol={setProtocol}
          sectionKey="analysisplan"
          sectionName="Statistical Analysis Plan"
          referenceExamples="Use endpoint definitions, sample size rationale, estimands, or analysis-method structure from this file where relevant."
          isGenerating={isGenerating}
          compact={hasSAPContent}
          onGenerate={generateSAP}
        />
      )}

      {isGenerating && (
        <div className="rounded-md border border-[#228be6]/20 bg-[#e7f5ff] px-4 py-3 text-sm text-[#1864ab] flex items-center">
          <Loader2 size={16} className="mr-2 animate-spin" />
          Generating endpoints, analysis populations, sample size assumptions, and statistical methods from the current synopsis.
        </div>
      )}
      
      {/* Main content */}
      <div className="grid grid-cols-3 gap-6">
        
        {/* Interim Analysis Section - Show for interventional studies */}
        {(protocol.protocolType === "interventional_clinical_trial" || !protocol.protocolType) && interimAnalysis && (
          <div className="col-span-3 bg-white p-6 rounded-md border border-[#dee2e6]">
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-medium text-lg text-[#495057] flex items-center">
                <Clock size={20} className="mr-2 text-[#228be6]" />
                Interim Analysis Plan
              </h3>

            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-3">
                <div>
                  <span className="text-sm font-medium text-[#6c757d]">Planned:</span>
                  <div className={`inline-block ml-2 px-2 py-1 rounded text-xs ${
                    interimAnalysis.planned ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                  }`}>
                    {interimAnalysis.planned ? 'Yes' : 'No'}
                  </div>
                </div>
                {interimAnalysis.rationale && (
                  <div>
                    <span className="text-sm font-medium text-[#6c757d]">Rationale:</span>
                    <p className="text-sm text-[#495057] mt-1">{interimAnalysis.rationale}</p>
                  </div>
                )}
                {interimAnalysis.alphaSpending && (
                  <div>
                    <span className="text-sm font-medium text-[#6c757d]">Alpha Spending Function:</span>
                    <p className="text-sm text-[#495057] mt-1">{interimAnalysis.alphaSpending.function}</p>
                  </div>
                )}
              </div>
              <div className="space-y-3">
                {interimAnalysis.dataMonitoringCommittee && (
                  <div>
                    <span className="text-sm font-medium text-[#6c757d]">DMC Structure:</span>
                    <p className="text-sm text-[#495057] mt-1">{interimAnalysis.dataMonitoringCommittee.structure}</p>
                  </div>
                )}
                {interimAnalysis.analyses && interimAnalysis.analyses.length > 0 && (
                  <div>
                    <span className="text-sm font-medium text-[#6c757d]">Planned Analyses:</span>
                    <div className="mt-1 space-y-1">
                      {interimAnalysis.analyses.map((analysis: any, index: number) => (
                        <div key={index} className="text-xs bg-gray-50 p-2 rounded">
                          <div className="font-medium">{analysis.timepoint} - {analysis.type}</div>
                          {analysis.methodology && <div className="text-gray-600">{analysis.methodology}</div>}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Bias Assessment Section - Show for observational studies */}
        {(protocol.protocolType === "prospective_cohort_study" || 
          protocol.protocolType === "retrospective_cohort_study" || 
          protocol.protocolType === "secondary_data_analysis") && (
          biasAssessment ? (
            <BiasAssessmentEditor 
              biasAssessment={biasAssessment}
              setBiasAssessment={setBiasAssessment}
              propensityScore={propensityScore}
              setPropensityScore={setPropensityScore}
              negativeControls={negativeControls}
              setNegativeControls={setNegativeControls}
              sensitivityAnalyses={sensitivityAnalyses}
              setSensitivityAnalyses={setSensitivityAnalyses}
              protocol={protocol}
              setProtocol={setProtocol}
            />
          ) : (
            <div className="col-span-3 bg-white p-6 rounded-md border border-[#dee2e6]">
              <div className="flex justify-between items-center mb-4">
                <h3 className="font-medium text-lg text-[#495057] flex items-center">
                  <Shield size={20} className="mr-2 text-[#6c757d]" />
                  Bias Assessment & Mitigation
                </h3>
                <Button 
                  size="sm" 
                  variant="outline" 
                  onClick={() => {
                    const defaultBiasAssessment = {
                      overallRisk: "moderate" as "low" | "moderate" | "high",
                      selectionBias: { riskLevel: "moderate" as "low" | "moderate" | "high", specificTypes: [] },
                      informationBias: { riskLevel: "moderate" as "low" | "moderate" | "high", mitigationStrategies: [] },
                      confoundingBias: { riskLevel: "moderate" as "low" | "moderate" | "high", identifiedConfounders: [] }
                    };
                    const defaultPropensityScore = {
                      indicated: false,
                      method: "matching",
                      covariates: []
                    };
                    const defaultNegativeControls = {
                      outcomeControls: [],
                      exposureControls: []
                    };
                    setBiasAssessment(defaultBiasAssessment);
                    setPropensityScore(defaultPropensityScore);
                    setNegativeControls(defaultNegativeControls);
                  }}
                >
                  <Plus className="h-4 w-4 mr-1" />
                  Add Bias Assessment
                </Button>
              </div>
              <p className="text-sm text-[#6c757d]">
                No bias assessment currently configured. You can add comprehensive bias assessment and mitigation strategies for this observational study.
              </p>
            </div>
          )
        )}

        {/* Missing Data Strategy Section - Show for high priority study types */}
        {(protocol.protocolType === "interventional_clinical_trial" || 
          protocol.protocolType === "prospective_cohort_study" || 
          protocol.protocolType === "retrospective_cohort_study" || 
          protocol.protocolType === "secondary_data_analysis" || 
          protocol.protocolType === "maic") && (
          <MissingDataStrategyEditor 
            missingDataStrategy={missingDataStrategy}
            setMissingDataStrategy={setMissingDataStrategy}
            protocol={protocol}
            activeDesignState={activeDesignState}
            protocolConfig={protocolConfig}
          />
        )}

        {/* Interim Analysis Section - Show for interventional and prospective observational studies */}
        {(protocol.protocolType === "interventional_clinical_trial" || 
          protocol.protocolType === "dose_escalation_study" ||
          protocol.protocolType === "prospective_cohort_study") && (
          interimAnalysis ? (
            <InterimAnalysisEditor 
              interimAnalysis={interimAnalysis}
              setInterimAnalysis={setInterimAnalysis}
              protocol={protocol}
              setProtocol={setProtocol}
            />
          ) : (
            <div className="col-span-3 bg-white p-6 rounded-md border border-[#dee2e6]">
              <div className="flex justify-between items-center mb-4">
                <h3 className="font-medium text-lg text-[#495057] flex items-center">
                  <Clock size={20} className="mr-2 text-[#6c757d]" />
                  Interim Analysis
                </h3>
                <Button 
                  size="sm" 
                  variant="outline" 
                  onClick={() => {
                    const isObservational = protocol.protocolType === "prospective_cohort_study";
                    const defaultInterimAnalysis = {
                      planned: true,
                      rationale: isObservational 
                        ? "Interim analysis planned to monitor baseline characteristics, recruitment progress, and data quality"
                        : "Interim analysis planned to monitor efficacy and safety outcomes",
                      numberOfAnalyses: 1,
                      alphaSpending: { method: isObservational ? "none" : "obrienFleming" },
                      stoppingRules: { 
                        efficacy: !isObservational, 
                        futility: isObservational, 
                        safety: true 
                      },
                      dataMonitoringCommittee: { established: false },
                      analyses: []
                    };
                    setInterimAnalysis(defaultInterimAnalysis);
                  }}
                >
                  <Plus className="h-4 w-4 mr-1" />
                  Add Interim Analysis
                </Button>
              </div>
              <p className="text-sm text-[#6c757d]">
                No interim analysis currently planned. You can add interim analysis planning even if it wasn't mentioned in the original synopsis.
              </p>
            </div>
          )
        )}
        <div className="col-span-2 space-y-6">
          {/* Sample size */}
          <div className="bg-white rounded-md border border-[#dee2e6] p-4">
            <SampleSizeCalculator 
              sampleSize={sampleSize} 
              updateSampleSize={setSampleSize}
              protocol={protocol}
              activeDesignState={activeDesignState}
            />
          </div>
          
          {/* MAIC-specific analysis section - only shown for MAIC protocol type */}
          {protocol.protocolType === "maic" && (
            <div className="bg-white rounded-md border border-[#228be6] border-opacity-30 p-4">
              <h3 className="font-medium text-[#1971c2] flex items-center mb-3">
                <BarChart2 className="h-5 w-5 mr-2" />
                MAIC Analysis Configuration
              </h3>
              
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="weightingMethod">Weighting Method</Label>
                    <Select 
                      value={sapData.maicSpecific?.weightingApproach || ""}
                      onValueChange={(value) => {
                        const updated = {
                          ...sapData,
                          maicSpecific: {
                            ...(sapData.maicSpecific || {
                              weightingApproach: "",
                              effectMeasure: "hazard_ratio",
                              sensitivityDescription: "",
                              matchingVariables: [],
                              outcomeModels: [],
                              sensitivityAnalyses: []
                            }),
                            weightingApproach: value
                          }
                        };
                        handleSAPUpdate(updated);
                      }}
                    >
                      <SelectTrigger id="weightingMethod">
                        <SelectValue placeholder="Select weighting method" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="propensity_score">Propensity Score</SelectItem>
                        <SelectItem value="entropy_balancing">Entropy Balancing</SelectItem>
                        <SelectItem value="method_of_moments">Method of Moments</SelectItem>
                        <SelectItem value="empirical_likelihood">Empirical Likelihood</SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground mt-1">
                      Method used to calculate weights for individual patients
                    </p>
                  </div>
                  
                  <div>
                    <Label htmlFor="effectMeasure">Effect Measure</Label>
                    <Select
                      value={sapData.maicSpecific?.effectMeasure || "hazard_ratio"}
                      onValueChange={(value) => {
                        const updated = {
                          ...sapData,
                          maicSpecific: {
                            ...(sapData.maicSpecific || {
                              weightingApproach: "",
                              effectMeasure: "hazard_ratio",
                              sensitivityDescription: "",
                              matchingVariables: [],
                              outcomeModels: [],
                              sensitivityAnalyses: []
                            }),
                            effectMeasure: value
                          }
                        };
                        handleSAPUpdate(updated);
                      }}
                    >
                      <SelectTrigger id="effectMeasure">
                        <SelectValue placeholder="Select effect measure" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="hazard_ratio">Hazard Ratio</SelectItem>
                        <SelectItem value="odds_ratio">Odds Ratio</SelectItem>
                        <SelectItem value="risk_ratio">Risk Ratio</SelectItem>
                        <SelectItem value="risk_difference">Risk Difference</SelectItem>
                        <SelectItem value="mean_difference">Mean Difference</SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground mt-1">
                      Measure used to quantify treatment effect
                    </p>
                  </div>
                </div>
                
                <div>
                  <Label htmlFor="sensitivityDescription">Sensitivity Analyses</Label>
                  <Textarea 
                    id="sensitivityDescription"
                    placeholder="Describe planned sensitivity analyses to assess robustness of MAIC results..."
                    rows={3}
                    className="mt-1"
                    onChange={(e) => {
                      setProtocol(prevProtocol => {
                        const prevSap = typeof prevProtocol.statisticalAnalysisPlan === 'string' 
                          ? JSON.parse(prevProtocol.statisticalAnalysisPlan) 
                          : prevProtocol.statisticalAnalysisPlan || {};
                        
                        return {
                          ...prevProtocol,
                          statisticalAnalysisPlan: JSON.stringify({
                            ...prevSap,
                            maicSpecific: {
                              ...(prevSap.maicSpecific || {}),
                              sensitivityDescription: e.target.value
                            }
                          })
                        };
                      });
                    }}
                  />
                </div>
              </div>
            </div>
          )}
          
          {/* Exposure Definition - for cohort and MAIC studies */}
          <ExposureDefinition
            protocol={protocol}
            activeDesignState={activeDesignState}
            protocolConfig={protocolConfig}
            setProtocol={setProtocol}
          />
          
          {/* Primary endpoints */}
          <div className="bg-white rounded-md border border-[#dee2e6]">
            <div className="flex items-center justify-between p-3 border-b border-[#dee2e6] bg-[#f8f9fa]">
              <div className="flex items-center gap-2">
                <h3 className="font-medium text-[#495057]">{terminology.primary}</h3>
                <CommentTrigger
                  protocolId={protocol.id}
                  designStateId={activeDesignState?.id || ""}
                  section="statisticalAnalysisPlan"
                  sectionItem="primaryEndpoints"
                  contextData="endpoints-primary"
                  size="icon"
                />
              </div>
              <div className="flex items-center space-x-2">

                <Button
                  size="sm"
                  onClick={() => {
                    setEndpointType("primary")
                    setNewEndpoint({...defaultEndpoint})
                    setShowAddEndpointDialog(true)
                  }}
                >
                  <Plus size={14} className="mr-1" />
                  Add Primary {terminology.singular.charAt(0).toUpperCase() + terminology.singular.slice(1)}
                </Button>
              </div>
            </div>
            
            <div className="p-4 space-y-4">
              {primaryEndpoints.length === 0 ? (
                <div className="text-center py-6 text-[#6c757d]">
                  <LineChart className="mx-auto h-8 w-8 opacity-40 mb-2" />
                  <p>No primary endpoints defined</p>
                  <p className="text-sm mt-1">Add endpoints to define your study's main measures</p>
                </div>
              ) : (
                primaryEndpoints.map(endpoint => (
                  <EndpointItem 
                    key={endpoint.id}
                    endpoint={endpoint}
                    updateEndpoint={(updated) => updateEndpoint("primary", endpoint.id, updated)}
                    onDelete={() => deleteEndpoint("primary", endpoint.id)}
                    isPrimary={true}
                    protocolConfig={protocolConfig}
                  />
                ))
              )}
            </div>
          </div>
          
          {/* Secondary endpoints */}
          <div className="bg-white rounded-md border border-[#dee2e6]">
            <div className="flex items-center justify-between p-3 border-b border-[#dee2e6] bg-[#f8f9fa]">
              <div className="flex items-center gap-2">
                <h3 className="font-medium text-[#495057]">{terminology.secondary}</h3>
                <CommentTrigger
                  protocolId={protocol.id}
                  designStateId={activeDesignState?.id || ""}
                  section="statisticalAnalysisPlan"
                  sectionItem="secondaryEndpoints"
                  contextData="endpoints-secondary"
                  size="icon"
                />
              </div>
              <Button
                size="sm"
                onClick={() => {
                  setEndpointType("secondary")
                  setNewEndpoint({...defaultEndpoint})
                  setShowAddEndpointDialog(true)
                }}
              >
                <Plus size={14} className="mr-1" />
                Add Secondary {terminology.singular.charAt(0).toUpperCase() + terminology.singular.slice(1)}
              </Button>
            </div>
            
            <div className="p-4 space-y-4">
              {secondaryEndpoints.length === 0 ? (
                <div className="text-center py-6 text-[#6c757d]">
                  <BarChart2 className="mx-auto h-8 w-8 opacity-40 mb-2" />
                  <p>No secondary endpoints defined</p>
                  <p className="text-sm mt-1">Add endpoints to define additional outcome measures</p>
                </div>
              ) : (
                secondaryEndpoints.map(endpoint => (
                  <EndpointItem 
                    key={endpoint.id}
                    endpoint={endpoint}
                    updateEndpoint={(updated) => updateEndpoint("secondary", endpoint.id, updated)}
                    onDelete={() => deleteEndpoint("secondary", endpoint.id)}
                    isPrimary={false}
                    protocolConfig={protocolConfig}
                  />
                ))
              )}
            </div>
          </div>
          
          {/* Exploratory endpoints */}
          <div className="bg-white rounded-md border border-[#dee2e6]">
            <div className="flex items-center justify-between p-3 border-b border-[#dee2e6] bg-[#f8f9fa]">
              <div className="flex items-center">
                <h3 className="font-medium text-[#495057]">{terminology.exploratory}</h3>
                <Badge variant="outline" className="ml-2 text-xs">Optional</Badge>
              </div>
              <Button
                size="sm"
                onClick={() => {
                  setEndpointType("exploratory")
                  setNewEndpoint({...defaultEndpoint})
                  setShowAddEndpointDialog(true)
                }}
              >
                <Plus size={14} className="mr-1" />
                Add Exploratory {terminology.singular.charAt(0).toUpperCase() + terminology.singular.slice(1)}
              </Button>
            </div>
            
            <div className="p-4 space-y-4">
              {exploratoryEndpoints.length === 0 ? (
                <div className="text-center py-6 text-[#6c757d]">
                  <Search className="mx-auto h-8 w-8 opacity-40 mb-2" />
                  <p>No exploratory endpoints defined</p>
                  <p className="text-sm mt-1">Add exploratory endpoints for hypothesis-generating analyses</p>
                </div>
              ) : (
                exploratoryEndpoints.map(endpoint => (
                  <EndpointItem 
                    key={endpoint.id}
                    endpoint={endpoint}
                    updateEndpoint={(updated) => updateEndpoint("exploratory", endpoint.id, updated)}
                    onDelete={() => deleteEndpoint("exploratory", endpoint.id)}
                    isPrimary={false}
                    isExploratory={true}
                    protocolConfig={protocolConfig}
                  />
                ))
              )}
            </div>
          </div>
        </div>
        
        <div className="space-y-6">
          {/* Estimands - Show for interventional and observational studies */}
          {(protocol.protocolType === "interventional_clinical_trial" || 
            protocol.protocolType === "dose_escalation_study" ||
            protocol.protocolType === "prospective_cohort_study" ||
            protocol.protocolType === "retrospective_cohort_study") && (
            <div className="bg-white rounded-md border border-[#dee2e6]">
              <div className="flex items-center justify-between p-3 border-b border-[#dee2e6] bg-[#f8f9fa]">
                <div className="flex flex-col">
                  <h3 className="font-medium text-[#495057]">Estimands</h3>
                  <Badge variant="outline" className="text-xs w-fit">ICH E9(R1)</Badge>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">

                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleGenerateEstimands}
                    disabled={isGeneratingEstimands}
                    className="whitespace-nowrap"
                  >
                    {isGeneratingEstimands ? (
                      <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                    ) : (
                      <Sparkles className="h-4 w-4 mr-1" />
                    )}
                    Generate AI
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => {
                      const availableEndpoints = getAllEndpoints()
                      if (availableEndpoints.length === 0) {
                        toast({
                          title: "No Endpoints Available",
                          description: "Please add endpoints first before creating estimands",
                          variant: "destructive",
                        })
                        return
                      }
                      setShowAddEstimandDialog(true)
                    }}
                    className="whitespace-nowrap"
                  >
                    <Plus size={14} className="mr-1" />
                    Add Manual
                  </Button>
                </div>
              </div>
              
              <div className="p-4 space-y-4">
                {estimands.length === 0 ? (
                  <div className="text-center py-6 text-[#6c757d]">
                    <Target className="mx-auto h-8 w-8 opacity-40 mb-2" />
                    <p>No estimands defined</p>
                    <p className="text-sm mt-1">Define estimands to specify exactly what you want to estimate (ICH E9(R1))</p>
                  </div>
                ) : (
                  estimands.map(estimand => (
                    <EstimandItem 
                      key={estimand.id}
                      estimand={estimand}
                      updateEstimand={(updated) => updateEstimand(estimand.id, updated)}
                      onDelete={() => deleteEstimand(estimand.id)}
                      availableEndpoints={getAllEndpoints()}
                    />
                  ))
                )}
              </div>
            </div>
          )}
          
          {/* Analysis populations */}
          <div className="bg-white rounded-md border border-[#dee2e6]">
            <div className="flex items-center justify-between p-3 border-b border-[#dee2e6] bg-[#f8f9fa]">
              <div className="flex items-center">
                <h3 className="font-medium text-[#495057]">Analysis Populations</h3>
              </div>
              <Button
                size="sm"
                onClick={addAnalysisPopulation}
              >
                <Plus size={14} className="mr-1" />
                Add Population
              </Button>
            </div>
            
            <div className="p-4 space-y-4">
              {analysisPopulations.length === 0 ? (
                <div className="text-center py-6 text-[#6c757d]">
                  <Users className="mx-auto h-8 w-8 opacity-40 mb-2" />
                  <p>No analysis populations defined</p>
                  <p className="text-sm mt-1">Define populations for statistical analysis</p>
                </div>
              ) : (
                analysisPopulations.map(population => (
                  <AnalysisPopulationItem 
                    key={population.id}
                    population={population}
                    updatePopulation={(updated) => {
                      setAnalysisPopulations(analysisPopulations.map(p => 
                        p.id === population.id ? updated : p
                      ))
                    }}
                    onDelete={() => {
                      setAnalysisPopulations(analysisPopulations.filter(p => 
                        p.id !== population.id
                      ))
                    }}
                  />
                ))
              )}
            </div>
          </div>
          
          {/* Statistical methods */}
          <div className="bg-white rounded-md border border-[#dee2e6]">
            <div className="flex items-center justify-between p-3 border-b border-[#dee2e6] bg-[#f8f9fa]">
              <div className="flex items-center">
                <h3 className="font-medium text-[#495057]">Statistical Methods</h3>
              </div>
              <div className="flex items-center space-x-2">

                <Button
                  size="sm"
                  onClick={addStatisticalMethod}
                >
                  <Plus size={14} className="mr-1" />
                  Add Method
                </Button>
              </div>
            </div>
            
            <div className="p-4 space-y-4">
              {statisticalMethods.length === 0 ? (
                <div className="text-center py-6 text-[#6c757d]">
                  <Calculator className="mx-auto h-8 w-8 opacity-40 mb-2" />
                  <p>No statistical methods defined</p>
                  <p className="text-sm mt-1">Define methods for analyzing study data</p>
                </div>
              ) : (
                statisticalMethods.map(method => (
                  <StatMethodItem 
                    key={method.id}
                    method={method}
                    updateMethod={(updated) => {
                      setStatisticalMethods(statisticalMethods.map(m => 
                        m.id === method.id ? updated : m
                      ))
                    }}
                    onDelete={() => {
                      setStatisticalMethods(statisticalMethods.filter(m => 
                        m.id !== method.id
                      ))
                    }}
                  />
                ))
              )}
            </div>
          </div>
        </div>
      </div>
      
      {/* Add Estimand Dialog */}
      <Dialog open={showAddEstimandDialog} onOpenChange={setShowAddEstimandDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add New Estimand</DialogTitle>
            <DialogDescription>
              Define a new estimand following ICH E9(R1) guidelines
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Linked Endpoint</Label>
                <Select 
                  value={newEstimand.endpointName} 
                  onValueChange={(value) => {
                    const selectedEndpoint = getAllEndpoints().find(ep => ep.name === value)
                    setNewEstimand({
                      ...newEstimand, 
                      endpointName: value,
                      endpointId: selectedEndpoint?.id
                    })
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select endpoint" />
                  </SelectTrigger>
                  <SelectContent>
                    {getAllEndpoints().map(endpoint => (
                      <SelectItem key={endpoint.id} value={endpoint.name}>
                        <div className="flex items-center">
                          <Badge 
                            variant="outline" 
                            className={`mr-2 text-xs ${
                              endpoint.type === 'primary' ? 'bg-[#228be6] text-white' :
                              endpoint.type === 'secondary' ? 'bg-[#12b886] text-white' :
                              'bg-[#fd7e14] text-white'
                            }`}
                          >
                            {endpoint.type.charAt(0).toUpperCase()}
                          </Badge>
                          {endpoint.name}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              
              <div>
                <Label>Estimand Type</Label>
                <Select 
                  value={newEstimand.estimandType} 
                  onValueChange={(value: "primary" | "secondary" | "exploratory") => 
                    setNewEstimand({...newEstimand, estimandType: value})
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="primary">Primary</SelectItem>
                    <SelectItem value="secondary">Secondary</SelectItem>
                    <SelectItem value="exploratory">Exploratory</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            
            <div>
              <Label>Population</Label>
              <Input 
                value={newEstimand.population} 
                onChange={e => setNewEstimand({...newEstimand, population: e.target.value})} 
                placeholder="e.g., All randomized patients, ITT population"
              />
            </div>
            
            <div>
              <Label>Variable</Label>
              <Input 
                value={newEstimand.variable} 
                onChange={e => setNewEstimand({...newEstimand, variable: e.target.value})} 
                placeholder="e.g., Time to progression, Change from baseline in HAMD-17"
              />
            </div>
            
            <div>
              <Label>Population-Level Summary</Label>
              <Input 
                value={newEstimand.populationLevelSummary} 
                onChange={e => setNewEstimand({...newEstimand, populationLevelSummary: e.target.value})} 
                placeholder="e.g., Difference in means, Hazard ratio, Risk difference"
              />
            </div>
            
            <div>
              <Label>Intercurrent Event Strategy</Label>
              <Select 
                value={newEstimand.intercurrentEventStrategy} 
                onValueChange={(value: any) => 
                  setNewEstimand({...newEstimand, intercurrentEventStrategy: value})
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select strategy" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="treatment_policy">Treatment Policy</SelectItem>
                  <SelectItem value="composite">Composite</SelectItem>
                  <SelectItem value="hypothetical">Hypothetical</SelectItem>
                  <SelectItem value="while_on_treatment">While on Treatment</SelectItem>
                  <SelectItem value="principal_stratum">Principal Stratum</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div>
              <Label>Intercurrent Event Handling</Label>
              <Textarea 
                value={newEstimand.intercurrentEventHandling} 
                onChange={e => setNewEstimand({...newEstimand, intercurrentEventHandling: e.target.value})} 
                rows={2}
                placeholder="Describe how intercurrent events (discontinuation, rescue medication, etc.) are handled"
              />
            </div>
            
            <div>
              <Label>Justification</Label>
              <Textarea 
                value={newEstimand.justification} 
                onChange={e => setNewEstimand({...newEstimand, justification: e.target.value})} 
                rows={2}
                placeholder="Justify the choice of estimand strategy and approach"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddEstimandDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleAddEstimand}>
              Add Estimand
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Endpoint Dialog */}
      <Dialog open={showAddEndpointDialog} onOpenChange={setShowAddEndpointDialog}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Add {endpointType === "primary" ? "Primary" : endpointType === "secondary" ? "Secondary" : "Exploratory"} {terminology.singular.charAt(0).toUpperCase() + terminology.singular.slice(1)}</DialogTitle>
            <DialogDescription>
              Define a new {endpointType === "primary" ? "primary" : endpointType === "secondary" ? "secondary" : "exploratory"} {terminology.singular} for the study.
            </DialogDescription>
          </DialogHeader>
          
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="endpointName" className="text-right">
                Name
              </Label>
              <Input
                id="endpointName"
                value={newEndpoint.name}
                onChange={(e) => setNewEndpoint({...newEndpoint, name: e.target.value})}
                className="col-span-3"
              />
            </div>
            
            {/* Protocol-specific fields */}
            {Object.entries(protocolConfig.additionalFields).map(([fieldKey, fieldConfig]: [string, any]) => (
              <div key={fieldKey} className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor={fieldKey} className="text-right">
                  {fieldConfig.label}
                </Label>
                <Input
                  id={fieldKey}
                  value={(newEndpoint as any)[fieldKey] || ''}
                  onChange={(e) => setNewEndpoint({
                    ...newEndpoint,
                    [fieldKey]: e.target.value
                  })}
                  placeholder={fieldConfig.placeholder}
                  className="col-span-3"
                />
              </div>
            ))}
            
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="endpointType" className="text-right">
                Type
              </Label>
              <Select 
                value={newEndpoint.type} 
                onValueChange={(value) => setNewEndpoint({...newEndpoint, type: value})}
              >
                <SelectTrigger className="col-span-3">
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="efficacy">Efficacy</SelectItem>
                  <SelectItem value="safety">Safety</SelectItem>
                  <SelectItem value="pharmacokinetic">Pharmacokinetic</SelectItem>
                  <SelectItem value="pharmacodynamic">Pharmacodynamic</SelectItem>
                  <SelectItem value="biomarker">Biomarker</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="method" className="text-right">
                Method
              </Label>
              <Select 
                value={newEndpoint.method} 
                onValueChange={(value) => setNewEndpoint({...newEndpoint, method: value})}
              >
                <SelectTrigger className="col-span-3">
                  <SelectValue placeholder="Select method" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="t-test">t-test</SelectItem>
                  <SelectItem value="anova">ANOVA</SelectItem>
                  <SelectItem value="chi-square">Chi-Square</SelectItem>
                  <SelectItem value="wilcoxon">Wilcoxon</SelectItem>
                  <SelectItem value="mixed-model">Mixed Model</SelectItem>
                  <SelectItem value="cox">Cox Proportional Hazards</SelectItem>
                  <SelectItem value="logistic">Logistic Regression</SelectItem>
                  <SelectItem value="descriptive">Descriptive Statistics Only</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div className="grid grid-cols-4 items-start gap-4">
              <Label htmlFor="description" className="text-right pt-2">
                Description
              </Label>
              <Textarea
                id="description"
                value={newEndpoint.description}
                onChange={(e) => setNewEndpoint({...newEndpoint, description: e.target.value})}
                className="col-span-3"
                rows={3}
              />
            </div>
          </div>
          
          <DialogFooter>
            <Button onClick={handleAddEndpoint} disabled={!newEndpoint.name.trim()}>
              Add {terminology.singular.charAt(0).toUpperCase() + terminology.singular.slice(1)}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
      {/* Floating Comment System */}

    </div>
  )
}

export default StatisticalAnalysisPlan
