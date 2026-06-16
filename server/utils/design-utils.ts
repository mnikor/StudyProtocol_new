import { DesignState } from "@shared/schema";

/**
 * Helper function to determine if a study is oncology-related
 * based on keywords in synopsis or health status
 */
export function isOncologyStudy(designState: DesignState): boolean {
  // Look for cancer-related terms in the synopsis or health status
  const oncologyTerms = [
    'cancer', 'tumor', 'oncology', 'carcinoma', 'sarcoma', 'leukemia', 
    'lymphoma', 'melanoma', 'myeloma', 'neoplasm', 'malignancy', 'metastatic',
    'nsclc', 'breast cancer', 'prostate cancer', 'colorectal', 'glioma',
    'neoplastic', 'myeloid', 'bladder cancer', 'hepatocellular'
  ];
  
  const synopsisLower = designState.synopsis.toLowerCase();
  const healthStatusLower = designState.studyParameters.population.healthStatus.toLowerCase();
  
  return oncologyTerms.some(term => 
    synopsisLower.includes(term) || healthStatusLower.includes(term)
  );
}

/**
 * Helper function to determine if a study is specifically about prostate cancer
 * for gender-specific conditions
 */
export function isProstateStudy(designState: DesignState): boolean {
  const prostateTerms = ['prostate cancer', 'prostate carcinoma', 'prostatic neoplasm'];
  
  const synopsisLower = designState.synopsis.toLowerCase();
  const healthStatusLower = designState.studyParameters.population.healthStatus.toLowerCase();
  
  return prostateTerms.some(term => 
    synopsisLower.includes(term) || healthStatusLower.includes(term)
  );
}

/**
 * Helper function to modify dosage in a smart way for alternative designs
 */
export function modifyDosage(currentDosage: string): string {
  // Handle common dosage formats: "X mg", "X mg/kg", ranges like "X-Y mg"
  if (currentDosage.includes('mg')) {
    // Extract numbers from the current dosage
    const numbers = currentDosage.match(/\d+(\.\d+)?/g);
    if (numbers && numbers.length > 0) {
      // If we have multiple numbers (like a range or weight-based dosing)
      if (numbers.length >= 2) {
        const num1 = parseFloat(numbers[0]);
        const num2 = parseFloat(numbers[1]);
        
        // For weight-based dosing (e.g., "1050 mg (patients <80 kg) or 1400 mg (patients ≥80 kg)")
        if (currentDosage.includes('<') || currentDosage.includes('≥') || 
            currentDosage.includes('>') || currentDosage.includes('≤') ||
            currentDosage.includes('or')) {
          return currentDosage.replace(num1.toString(), (num1 * 0.8).toFixed(0))
                            .replace(num2.toString(), (num2 * 0.8).toFixed(0)) + 
                 " (reduced by 20% for safety)";
        }
        
        // For dose ranges (e.g., "100-200 mg")
        return currentDosage.replace(num1.toString(), (num1 * 0.9).toFixed(0))
                          .replace(num2.toString(), (num2 * 0.9).toFixed(0)) +
               " (reduced by 10%)";
      }
      
      // For simple dosages (e.g., "100 mg")
      const num = parseFloat(numbers[0]);
      if (currentDosage.includes('mg/kg')) {
        return currentDosage.replace(num.toString(), (num * 0.9).toFixed(1)) +
               " (reduced by 10%)";
      } else {
        return currentDosage.replace(num.toString(), (num * 0.75).toFixed(0)) +
               " (reduced by 25%)";
      }
    }
  }
  
  // For non-standard formats, return a modified general statement
  return `${currentDosage} with dose reduction protocol`;
}

/**
 * Generate meaningful alternative designs based on study parameters
 */
export function generateAlternativeDesigns(baseState: DesignState, count: number = 3): DesignState[] {
  // Generate alternatives based on study characteristics and protocol type
  const alternatives: DesignState[] = [];
  
  // Get protocol type and log it for debugging
  const protocolType = baseState.protocolType || "interventional_clinical_trial";
  console.log(`Generating alternative designs for protocol type: ${protocolType}`);
  
  // Determine if we're dealing with an observational study from either the protocol type or design parameters
  const isObservationalStudy = protocolType.includes("observational") || 
                              protocolType.includes("cohort") || 
                              protocolType.includes("secondary_data") || 
                              baseState.studyParameters.design?.type === "observational";
                              
  console.log(`Is observational study: ${isObservationalStudy}`);
  console.log(`Study design type: ${baseState.studyParameters.design?.type || 'not specified'}`);
  
  // Common demographic information
  const hasAgeRestriction = baseState.studyParameters.population.ageRange.max < 75;
  
  // Double-check and correct protocol type if there's a mismatch between type and design
  let correctedProtocolType = protocolType;
  
  // If design type is "observational" but protocol type is interventional, fix it
  if (baseState.studyParameters.design?.type === "observational" && 
      !isObservationalStudy) {
    console.warn("Protocol type mismatch detected: design is observational but protocol type is not. Correcting to secondary_data_analysis.");
    correctedProtocolType = "secondary_data_analysis";
  }
  
  // Generate alternatives based on protocol type
  switch(correctedProtocolType) {
    case "secondary_data_analysis":
    case "retrospective_cohort_study":
      console.log("Using Secondary Data Analysis alternatives generator");
      const secondaryDataAlts = generateSecondaryDataAnalysisAlternatives(baseState, count);
      // Ensure protocolType is preserved in all alternatives
      return secondaryDataAlts.map(alt => ({
        ...alt,
        protocolType: correctedProtocolType
      }));
      
    case "prospective_cohort_study":
      console.log("Using Prospective Cohort alternatives generator");
      const prospectiveAlts = generateProspectiveCohortAlternatives(baseState, count);
      // Ensure protocolType is preserved in all alternatives
      return prospectiveAlts.map(alt => ({
        ...alt,
        protocolType: correctedProtocolType
      }));
      
    case "delphi_consensus":
      console.log("Using Delphi Consensus alternatives generator");
      const delphiAlts = generateDelphiConsensusAlternatives(baseState, count);
      // Ensure protocolType is preserved in all alternatives
      return delphiAlts.map(alt => ({
        ...alt,
        protocolType: correctedProtocolType
      }));
      
    case "cross_sectional_survey":
    case "qualitative_study":
      console.log("Using Survey/Qualitative alternatives generator");
      const surveyAlts = generateSurveyAlternatives(baseState, count);
      // Ensure protocolType is preserved in all alternatives
      return surveyAlts.map(alt => ({
        ...alt,
        protocolType: correctedProtocolType
      }));
      
    case "interventional_clinical_trial":
    default:
      // Extra safety check - if it's an observational study but somehow has interventional protocol type
      if (isObservationalStudy) {
        console.log("Study appears to be observational despite protocol type - using Secondary Data Analysis alternatives");
        const fixedAlts = generateSecondaryDataAnalysisAlternatives(baseState, count);
        // Set correct protocol type for all alternatives
        return fixedAlts.map(alt => ({
          ...alt,
          protocolType: "secondary_data_analysis"
        }));
      }
      
      console.log("Using Interventional Trial alternatives generator");
      const interventionalAlts = generateInterventionalTrialAlternatives(baseState, count);
      // Ensure protocolType is preserved in all alternatives
      return interventionalAlts.map(alt => ({
        ...alt,
        protocolType: correctedProtocolType
      }));
  }
}

// Generate alternatives for secondary data analysis/retrospective cohort studies
function generateSecondaryDataAnalysisAlternatives(baseState: DesignState, count: number = 3): DesignState[] {
  const alternatives: DesignState[] = [];
  const isOncology = isOncologyStudy(baseState);
  
  // Get relevant information from the base state
  const dataSourceName = baseState.studyParameters.dataSource?.name || "Health Records";
  const dataSourceType = baseState.studyParameters.dataSource?.type || "Retrospective Database";
  const timePeriod = baseState.studyParameters.dataSource?.timePeriod || "10 years";
  
  // Alternative 1: Extended time period
  alternatives.push({
    ...baseState,
    id: `${baseState.id}-alt-1`,
    label: "Extended Time Period Analysis",
    timestamp: new Date(),
    studyParameters: {
      ...baseState.studyParameters,
      dataSource: {
        ...baseState.studyParameters.dataSource,
        timePeriod: timePeriod.includes("year") ? 
          timePeriod.replace(/(\d+)/, (match) => String(Number(match) + 5)) : 
          timePeriod + " with 5-year extension"
      },
      timing: {
        ...baseState.studyParameters.timing,
        dataCutoffs: baseState.studyParameters.timing?.dataCutoffs ? 
          baseState.studyParameters.timing.dataCutoffs + " with extended follow-up" : 
          "Extended data cutoff with 5 additional years"
      }
    },
    costImpact: {
      percentChange: 15,
      areaBreakdown: {
        recruitment: 0,
        assessments: 0,
        monitoring: 0,
        dataAcquisition: 20,
        dataProcessing: 15,
        analysis: 10
      },
      explanation: `Extended time period allows for trend analysis and longer-term outcomes, using ${dataSourceName} over a longer duration.`
    },
    scientificValue: {
      innovationScore: 0.5,
      knowledgeGapRelevance: 0.7,
      potentialImpact: 0.6,
      evidenceQuality: 0.6
    },
    methodologyQuality: {
      designAppropriateness: 0.7,
      endpointSelection: 0.7,
      statisticalPower: 0.8,
      controlArmSelection: 0.6,
      explanation: "Extended time period strengthens temporal trend analysis and rare outcome detection.",
      alternativeControl: {
        type: "none",
        implications: "Extended time period allows for more robust historical control comparisons",
        scientificImpact: "Improves ability to detect long-term outcomes and infrequent events",
        operationalImpact: "Increases data processing requirements and potential biases from temporal changes",
        regulatoryImpact: "May enhance real-world evidence claims and long-term safety observations"
      }
    },
    realWorldImpact: {
      labelingChange: 0.4,
      guidelinesInclusion: 0.6,
      clinicalPracticeChange: 0.5,
      explanation: "Extended timeframe provides stronger evidence for long-term outcomes and trends.",
      marketAccess: "Improved evidence for long-term effectiveness may support value-based pricing."
    },
    feasibilityMetrics: {
      recruitmentSpeedImpact: 0,
      operationalComplexity: 0.3,
      participantBurden: 0,
      dataQualityChallenges: 0.4
    }
  });
  
  // Alternative 2: Additional data sources/linked data
  alternatives.push({
    ...baseState,
    id: `${baseState.id}-alt-2`,
    label: "Multi-Source Linked Data Analysis",
    timestamp: new Date(),
    studyParameters: {
      ...baseState.studyParameters,
      dataSource: {
        ...baseState.studyParameters.dataSource,
        name: `${dataSourceName} + Additional Data Sources`,
        type: `Linked ${dataSourceType}`,
        geographicScope: baseState.studyParameters.dataSource?.geographicScope || "National"
      },
      design: {
        ...baseState.studyParameters.design,
        analyticalApproach: "Multi-source linked data analysis"
      }
    },
    costImpact: {
      percentChange: 35,
      areaBreakdown: {
        recruitment: 0,
        assessments: 0,
        monitoring: 0,
        dataAcquisition: 50,
        dataProcessing: 40,
        analysis: 30
      },
      explanation: `Linking multiple data sources (${dataSourceName} plus pharmacy claims and registry data) provides richer context but increases complexity and cost.`
    },
    scientificValue: {
      innovationScore: 0.7,
      knowledgeGapRelevance: 0.8,
      potentialImpact: 0.7,
      evidenceQuality: 0.7
    },
    methodologyQuality: {
      designAppropriateness: 0.8,
      endpointSelection: 0.7,
      statisticalPower: 0.8,
      controlArmSelection: 0.7,
      explanation: "Linked data from multiple sources provides more comprehensive view of patient journey and outcomes.",
      alternativeControl: {
        type: "none",
        implications: "Additional data sources enable more nuanced comparison groups",
        scientificImpact: "Increases ability to address confounding and capture comprehensive outcomes",
        operationalImpact: "Significantly increases data governance, privacy considerations, and technical complexity",
        regulatoryImpact: "Enhanced comprehensive real-world evidence may strengthen regulatory submissions"
      }
    },
    realWorldImpact: {
      labelingChange: 0.6,
      guidelinesInclusion: 0.7,
      clinicalPracticeChange: 0.6,
      explanation: "Multi-source data provides more comprehensive evidence for clinical practice.",
      marketAccess: "Comprehensive real-world data strengthens value propositions for payers."
    },
    feasibilityMetrics: {
      recruitmentSpeedImpact: 0,
      operationalComplexity: 0.7,
      participantBurden: 0,
      dataQualityChallenges: 0.6
    }
  });
  
  // Alternative 3: Different analytical approach
  alternatives.push({
    ...baseState,
    id: `${baseState.id}-alt-3`,
    label: "Alternative Statistical Methodology",
    timestamp: new Date(),
    studyParameters: {
      ...baseState.studyParameters,
      design: {
        ...baseState.studyParameters.design,
        analyticalApproach: baseState.studyParameters.design?.analyticalApproach?.includes("regression") ?
          "Propensity Score Matching" : "Advanced Regression Techniques"
      }
    },
    costImpact: {
      percentChange: 10,
      areaBreakdown: {
        recruitment: 0,
        assessments: 0,
        monitoring: 0,
        dataAcquisition: 0,
        dataProcessing: 10,
        analysis: 30
      },
      explanation: baseState.studyParameters.design?.analyticalApproach?.includes("regression") ?
        "Propensity score matching reduces potential confounding but adds complexity to analysis." :
        "Advanced regression techniques provide more sophisticated control for confounders."
    },
    scientificValue: {
      innovationScore: 0.6,
      knowledgeGapRelevance: 0.7,
      potentialImpact: 0.6,
      evidenceQuality: 0.8
    },
    methodologyQuality: {
      designAppropriateness: 0.8,
      endpointSelection: 0.7,
      statisticalPower: 0.7,
      controlArmSelection: 0.8,
      explanation: baseState.studyParameters.design?.analyticalApproach?.includes("regression") ?
        "Propensity score matching may better address confounding but reduces sample size." :
        "Advanced regression techniques allow for more nuanced control of covariates.",
      alternativeControl: {
        type: "none",
        implications: "Alternative methodology changes how comparison groups are constructed or analyzed",
        scientificImpact: "Improves control of confounding factors but may introduce methodological complexity",
        operationalImpact: "Requires specialized statistical expertise and additional validation steps",
        regulatoryImpact: "Stronger statistical approach may increase acceptance of findings by regulators"
      }
    },
    realWorldImpact: {
      labelingChange: 0.5,
      guidelinesInclusion: 0.7,
      clinicalPracticeChange: 0.5,
      explanation: "More robust statistical methodology increases credibility of findings.",
      marketAccess: "More sophisticated analysis may strengthen evidence for payers and HTA agencies."
    },
    feasibilityMetrics: {
      recruitmentSpeedImpact: 0,
      operationalComplexity: 0.4,
      participantBurden: 0,
      dataQualityChallenges: 0.3
    }
  });
  
  return alternatives.slice(0, count);
}

// Generate alternatives for prospective cohort studies
function generateProspectiveCohortAlternatives(baseState: DesignState, count: number = 3): DesignState[] {
  const alternatives: DesignState[] = [];
  const isOncology = isOncologyStudy(baseState);
  const hasAgeRestriction = baseState.studyParameters.population.ageRange.max < 75;
  
  // Alternative 1: Extended follow-up duration
  alternatives.push({
    ...baseState,
    id: `${baseState.id}-alt-1`,
    label: "Extended Follow-up Design",
    timestamp: new Date(),
    studyParameters: {
      ...baseState.studyParameters,
      timing: {
        ...baseState.studyParameters.timing,
        studyDuration: baseState.studyParameters.timing?.studyDuration?.includes("year") ?
          baseState.studyParameters.timing.studyDuration.replace(/(\d+)/, (match) => String(Number(match) * 2)) :
          "2-year follow-up",
        followUpPeriod: baseState.studyParameters.timing?.followUpPeriod?.includes("month") ?
          baseState.studyParameters.timing.followUpPeriod.replace(/(\d+)/, (match) => String(Number(match) * 2)) :
          "12 months"
      }
    },
    costImpact: {
      percentChange: 40,
      areaBreakdown: {
        recruitment: 0,
        assessments: 30,
        monitoring: 50,
        dataAcquisition: 40,
        dataProcessing: 30,
        analysis: 20
      },
      explanation: "Extended follow-up allows for assessment of long-term outcomes but increases study duration and cost."
    },
    scientificValue: {
      innovationScore: 0.5,
      knowledgeGapRelevance: 0.8,
      potentialImpact: 0.7,
      evidenceQuality: 0.8
    },
    methodologyQuality: {
      designAppropriateness: 0.8,
      endpointSelection: 0.7,
      statisticalPower: 0.7,
      controlArmSelection: 0.6,
      explanation: "Extended follow-up increases ability to detect long-term outcomes and delayed effects.",
      alternativeControl: {
        type: "none",
        implications: "Longer follow-up captures delayed outcomes and long-term effects",
        scientificImpact: "Increases ability to detect late-occurring events and sustained effects",
        operationalImpact: "Higher risk of participant attrition requiring more robust retention strategies",
        regulatoryImpact: "Strengthens evidence for long-term safety and effectiveness"
      }
    },
    realWorldImpact: {
      labelingChange: 0.7,
      guidelinesInclusion: 0.8,
      clinicalPracticeChange: 0.7,
      explanation: "Longitudinal data on long-term outcomes significantly impacts clinical practice guidance.",
      marketAccess: "Long-term outcomes data strengthens value proposition with payers."
    },
    feasibilityMetrics: {
      recruitmentSpeedImpact: 0,
      operationalComplexity: 0.5,
      participantBurden: 0.3,
      dataQualityChallenges: 0.4
    }
  });
  
  // Alternative 2: Nested case-control study
  alternatives.push({
    ...baseState,
    id: `${baseState.id}-alt-2`,
    label: "Nested Case-Control Design",
    timestamp: new Date(),
    studyParameters: {
      ...baseState.studyParameters,
      design: {
        ...baseState.studyParameters.design,
        type: "observational",
        analyticalApproach: "Nested case-control analysis"
      }
    },
    costImpact: {
      percentChange: -20,
      areaBreakdown: {
        recruitment: 0,
        assessments: -30,
        monitoring: -10,
        dataAcquisition: -20,
        dataProcessing: -10,
        analysis: 10
      },
      explanation: "Nested case-control approach reduces cost by focusing intensive data collection on subset of participants."
    },
    scientificValue: {
      innovationScore: 0.6,
      knowledgeGapRelevance: 0.7,
      potentialImpact: 0.6,
      evidenceQuality: 0.6
    },
    methodologyQuality: {
      designAppropriateness: 0.7,
      endpointSelection: 0.7,
      statisticalPower: 0.6,
      controlArmSelection: 0.8,
      explanation: "Nested case-control efficiently identifies risk factors while maintaining temporal sequence.",
      alternativeControl: {
        type: "none",
        implications: "Well-matched controls strengthen causal inference",
        scientificImpact: "Efficiently assesses multiple risk factors with less resource-intensive data collection",
        operationalImpact: "Simpler logistics for detailed exposure assessment",
        regulatoryImpact: "May be seen as less robust than full cohort analysis for some purposes"
      }
    },
    realWorldImpact: {
      labelingChange: 0.5,
      guidelinesInclusion: 0.6,
      clinicalPracticeChange: 0.5,
      explanation: "Efficient design for risk factor identification with strong temporal element.",
      marketAccess: "Cost-efficient approach may be viewed favorably by payers."
    },
    feasibilityMetrics: {
      recruitmentSpeedImpact: 0,
      operationalComplexity: -0.3,
      participantBurden: -0.2,
      dataQualityChallenges: 0.1
    }
  });
  
  // Alternative 3: Broader/different population
  alternatives.push({
    ...baseState,
    id: `${baseState.id}-alt-3`,
    label: hasAgeRestriction ? "Broader Population Cohort" : "More Targeted Population Cohort",
    timestamp: new Date(),
    studyParameters: {
      ...baseState.studyParameters,
      population: {
        ...baseState.studyParameters.population,
        ageRange: {
          min: hasAgeRestriction ? 
               Math.max(18, baseState.studyParameters.population.ageRange.min - 5) : 
               baseState.studyParameters.population.ageRange.min + 5,
          max: hasAgeRestriction ? 
               baseState.studyParameters.population.ageRange.max + 10 : 
               baseState.studyParameters.population.ageRange.max - 10
        },
        keyInclusion: hasAgeRestriction ?
          [...baseState.studyParameters.population.keyInclusion.filter(c => !c.includes("Age")), `Age ≥ ${Math.max(18, baseState.studyParameters.population.ageRange.min - 5)} years`] :
          [...baseState.studyParameters.population.keyInclusion.filter(c => !c.includes("Age")), `Age ${baseState.studyParameters.population.ageRange.min + 5}-${baseState.studyParameters.population.ageRange.max - 10} years`]
      }
    },
    costImpact: {
      percentChange: hasAgeRestriction ? 15 : -10,
      areaBreakdown: {
        recruitment: hasAgeRestriction ? 30 : -20,
        assessments: 0,
        monitoring: hasAgeRestriction ? 10 : -5,
        dataAcquisition: 0,
        dataProcessing: 0,
        analysis: hasAgeRestriction ? 5 : 5
      },
      explanation: hasAgeRestriction ? 
        `Broader age range (${Math.max(18, baseState.studyParameters.population.ageRange.min - 5)}-${baseState.studyParameters.population.ageRange.max + 10} years) increases recruitment pool but adds heterogeneity.` : 
        `More targeted age range (${baseState.studyParameters.population.ageRange.min + 5}-${baseState.studyParameters.population.ageRange.max - 10} years) focuses on core population with greater homogeneity.`
    },
    scientificValue: {
      innovationScore: 0.5,
      knowledgeGapRelevance: hasAgeRestriction ? 0.7 : 0.6,
      potentialImpact: hasAgeRestriction ? 0.7 : 0.5,
      evidenceQuality: hasAgeRestriction ? 0.5 : 0.7
    },
    methodologyQuality: {
      designAppropriateness: 0.7,
      endpointSelection: 0.7,
      statisticalPower: hasAgeRestriction ? 0.7 : 0.6,
      controlArmSelection: 0.6,
      explanation: hasAgeRestriction ? 
        "Broader population increases generalizability but adds heterogeneity requiring subgroup analysis." : 
        "More targeted population increases internal validity but limits generalizability.",
      alternativeControl: {
        type: "none",
        implications: hasAgeRestriction ? 
          "Broader population allows insights into age-specific effects" : 
          "More homogeneous population reduces confounding by age",
        scientificImpact: hasAgeRestriction ? 
          "Improves generalizability but may dilute effect size" : 
          "Increases signal-to-noise ratio but limits external validity",
        operationalImpact: hasAgeRestriction ? 
          "Wider recruitment pool but more complex analysis" : 
          "Slower recruitment but cleaner dataset",
        regulatoryImpact: hasAgeRestriction ? 
          "Supports broader label population claims" : 
          "Stronger evidence for specific population"
      }
    },
    realWorldImpact: {
      labelingChange: hasAgeRestriction ? 0.7 : 0.5,
      guidelinesInclusion: 0.6,
      clinicalPracticeChange: hasAgeRestriction ? 0.7 : 0.5,
      explanation: hasAgeRestriction ? 
        "Broader population enhances applicability to real-world practice." : 
        "More defined population provides clearer guidance for specific patients.",
      marketAccess: hasAgeRestriction ? 
        "Broader population increases potential market size." : 
        "Targeted population allows for more focused value messaging."
    },
    feasibilityMetrics: {
      recruitmentSpeedImpact: hasAgeRestriction ? 0.3 : -0.3,
      operationalComplexity: hasAgeRestriction ? 0.2 : -0.1,
      participantBurden: 0,
      dataQualityChallenges: hasAgeRestriction ? 0.2 : -0.1
    }
  });
  
  return alternatives.slice(0, count);
}

// Generate alternatives for Delphi consensus studies
function generateDelphiConsensusAlternatives(baseState: DesignState, count: number = 3): DesignState[] {
  const alternatives: DesignState[] = [];
  
  // Get relevant information from the base state
  const panelSize = baseState.studyParameters.expertPanel?.size || 20;
  const rounds = baseState.studyParameters.consensusMethod?.rounds || 3;
  const threshold = baseState.studyParameters.consensusMethod?.threshold || "70% agreement";
  
  // Alternative 1: Modified expert panel composition
  alternatives.push({
    ...baseState,
    id: `${baseState.id}-alt-1`,
    label: "Expanded Expert Panel",
    timestamp: new Date(),
    studyParameters: {
      ...baseState.studyParameters,
      expertPanel: {
        ...baseState.studyParameters.expertPanel,
        size: Math.floor(panelSize * 1.5),
        composition: "Expanded multidisciplinary panel including more international experts and patient representatives"
      }
    },
    costImpact: {
      percentChange: 20,
      areaBreakdown: {
        recruitment: 30,
        coordination: 25,
        dataProcessing: 15,
        analysis: 10
      },
      explanation: `Expanded expert panel (${Math.floor(panelSize * 1.5)} members vs. original ${panelSize}) increases diversity of input but requires more coordination.`
    },
    scientificValue: {
      innovationScore: 0.6,
      knowledgeGapRelevance: 0.7,
      potentialImpact: 0.8,
      evidenceQuality: 0.7
    },
    methodologyQuality: {
      designAppropriateness: 0.8,
      explanation: "Larger, more diverse panel enhances the validity and representativeness of consensus findings.",
      alternativeControl: {
        type: "none",
        implications: "Broader expertise reduces risk of narrow specialist bias",
        scientificImpact: "Increases credibility and comprehensiveness of recommendations",
        operationalImpact: "More complex coordination but potentially smoother consensus process",
        regulatoryImpact: "Strengthens credibility of consensus recommendations for policy makers"
      }
    },
    realWorldImpact: {
      labelingChange: 0.5,
      guidelinesInclusion: 0.8,
      clinicalPracticeChange: 0.7,
      explanation: "More diverse expert input increases likelihood of guideline adoption across settings.",
      marketAccess: "Broader expert endorsement strengthens acceptance by stakeholders."
    },
    feasibilityMetrics: {
      recruitmentSpeedImpact: -0.2,
      operationalComplexity: 0.3,
      participantBurden: 0.1
    }
  });
  
  // Alternative 2: Modified consensus methodology
  alternatives.push({
    ...baseState,
    id: `${baseState.id}-alt-2`,
    label: "Modified Consensus Methodology",
    timestamp: new Date(),
    studyParameters: {
      ...baseState.studyParameters,
      consensusMethod: {
        ...baseState.studyParameters.consensusMethod,
        name: baseState.studyParameters.consensusMethod?.name === "Delphi" ? "Modified Delphi with RAND/UCLA" : "Pure Delphi",
        rounds: rounds === 3 ? 2 : 3,
        scoringSystem: baseState.studyParameters.consensusMethod?.scoringSystem === "Likert 1-9" ? "Likert 1-7" : "Likert 1-9",
        threshold: threshold.includes("70%") ? "80% agreement" : "70% agreement"
      }
    },
    costImpact: {
      percentChange: rounds === 3 ? -15 : 20,
      areaBreakdown: {
        recruitment: 0,
        coordination: rounds === 3 ? -20 : 25,
        dataProcessing: rounds === 3 ? -15 : 20,
        analysis: 10
      },
      explanation: rounds === 3 ? 
        "Streamlined methodology with fewer rounds reduces time and coordination costs." : 
        "Additional round improves consensus quality but increases timeline and coordination costs."
    },
    scientificValue: {
      innovationScore: 0.6,
      knowledgeGapRelevance: 0.7,
      potentialImpact: 0.7,
      evidenceQuality: rounds === 3 ? 0.6 : 0.8
    },
    methodologyQuality: {
      designAppropriateness: 0.8,
      explanation: rounds === 3 ?
        "Streamlined approach with hybrid methodology balances efficiency with quality." :
        "Additional round allows for more refined consensus and expert reflection.",
      alternativeControl: {
        type: "none",
        implications: "Changed methodology affects how consensus is reached and defined",
        scientificImpact: rounds === 3 ?
          "More efficient process may have minor impact on consensus quality" :
          "Additional round improves refinement of consensus statements",
        operationalImpact: rounds === 3 ?
          "Reduced timeline and coordination requirements" :
          "Extended timeline with increased expert commitment required",
        regulatoryImpact: "Methodology changes should be noted in interpretation of findings"
      }
    },
    realWorldImpact: {
      labelingChange: 0.5,
      guidelinesInclusion: 0.7,
      clinicalPracticeChange: 0.7,
      explanation: "Modified methodology offers balance between rigor and practicality.",
      marketAccess: "Robust methodology strengthens credibility with stakeholders."
    },
    feasibilityMetrics: {
      recruitmentSpeedImpact: 0,
      operationalComplexity: rounds === 3 ? -0.3 : 0.3,
      participantBurden: rounds === 3 ? -0.4 : 0.3
    }
  });
  
  // Alternative 3: Changed consensus threshold and scoring
  alternatives.push({
    ...baseState,
    id: `${baseState.id}-alt-3`,
    label: "Alternative Consensus Definition",
    timestamp: new Date(),
    studyParameters: {
      ...baseState.studyParameters,
      consensusMethod: {
        ...baseState.studyParameters.consensusMethod,
        threshold: threshold.includes("70%") ? 
          "Median score ≥7 with no disagreement" : 
          "70% scoring ≥7 on 9-point scale",
        scoringSystem: "Likert 1-9 with additional qualitative feedback"
      }
    },
    costImpact: {
      percentChange: 5,
      areaBreakdown: {
        recruitment: 0,
        coordination: 0,
        dataProcessing: 10,
        analysis: 15
      },
      explanation: "Alternative consensus definition requires more sophisticated analysis but improves nuance of findings."
    },
    scientificValue: {
      innovationScore: 0.7,
      knowledgeGapRelevance: 0.7,
      potentialImpact: 0.7,
      evidenceQuality: 0.8
    },
    methodologyQuality: {
      designAppropriateness: 0.8,
      explanation: "Alternative consensus definition adds methodological rigor and captures nuance in expert opinions.",
      alternativeControl: {
        type: "none",
        implications: "Different scoring approach and definition affects what items reach consensus",
        scientificImpact: "More nuanced approach to defining consensus improves reflection of expert judgment",
        operationalImpact: "Requires more sophisticated analysis but minimal change to expert participation",
        regulatoryImpact: "More rigorous consensus definition may increase acceptance by guideline committees"
      }
    },
    realWorldImpact: {
      labelingChange: 0.5,
      guidelinesInclusion: 0.8,
      clinicalPracticeChange: 0.7,
      explanation: "More sophisticated consensus definition improves clinical interpretation of recommendations.",
      marketAccess: "Rigorous methodology enhances credibility with payers and guideline committees."
    },
    feasibilityMetrics: {
      recruitmentSpeedImpact: 0,
      operationalComplexity: 0.2,
      participantBurden: 0.1
    }
  });
  
  return alternatives.slice(0, count);
}

// Generate alternatives for surveys and qualitative studies
function generateSurveyAlternatives(baseState: DesignState, count: number = 3): DesignState[] {
  const alternatives: DesignState[] = [];
  
  // Alternative 1: Mixed methods approach
  alternatives.push({
    ...baseState,
    id: `${baseState.id}-alt-1`,
    label: "Mixed Methods Approach",
    timestamp: new Date(),
    studyParameters: {
      ...baseState.studyParameters,
      design: {
        ...baseState.studyParameters.design,
        type: "mixed-methods"
      }
    },
    costImpact: {
      percentChange: 35,
      areaBreakdown: {
        recruitment: 20,
        dataCollection: 40,
        dataProcessing: 30,
        analysis: 45
      },
      explanation: "Adding qualitative interviews to quantitative survey provides richer context but increases complexity and cost."
    },
    scientificValue: {
      innovationScore: 0.7,
      knowledgeGapRelevance: 0.8,
      potentialImpact: 0.8,
      evidenceQuality: 0.8
    },
    methodologyQuality: {
      designAppropriateness: 0.9,
      explanation: "Mixed methods provides both breadth and depth of understanding, triangulating findings for stronger insights.",
      alternativeControl: {
        type: "none",
        implications: "Complementary methods provide validation and contextual understanding",
        scientificImpact: "Richer dataset with integrated understanding of both 'what' and 'why'",
        operationalImpact: "More complex study requiring both quantitative and qualitative expertise",
        regulatoryImpact: "Stronger evidence package combining quantifiable findings with explanatory insights"
      }
    },
    realWorldImpact: {
      labelingChange: 0.6,
      guidelinesInclusion: 0.7,
      clinicalPracticeChange: 0.8,
      explanation: "Rich contextual understanding supports more meaningful implementation strategies.",
      marketAccess: "Comprehensive understanding of stakeholder perspectives supports value messaging."
    },
    feasibilityMetrics: {
      recruitmentSpeedImpact: -0.1,
      operationalComplexity: 0.6,
      participantBurden: 0.3
    }
  });
  
  // Alternative 2: Online vs. in-person/different data collection method
  alternatives.push({
    ...baseState,
    id: `${baseState.id}-alt-2`,
    label: baseState.studyParameters.dataCollection?.method?.includes("online") ? 
      "In-Person Data Collection" : "Online Data Collection",
    timestamp: new Date(),
    studyParameters: {
      ...baseState.studyParameters,
      dataCollection: {
        ...baseState.studyParameters.dataCollection,
        method: baseState.studyParameters.dataCollection?.method?.includes("online") ? 
          "In-person facilitated completion" : "Online self-administered survey"
      }
    },
    costImpact: {
      percentChange: baseState.studyParameters.dataCollection?.method?.includes("online") ? 40 : -30,
      areaBreakdown: {
        recruitment: baseState.studyParameters.dataCollection?.method?.includes("online") ? 30 : -20,
        dataCollection: baseState.studyParameters.dataCollection?.method?.includes("online") ? 60 : -50,
        dataProcessing: 0,
        analysis: 0
      },
      explanation: baseState.studyParameters.dataCollection?.method?.includes("online") ? 
        "In-person data collection improves quality and completion rates but significantly increases cost." : 
        "Online data collection reduces cost but may impact data quality and completion rates."
    },
    scientificValue: {
      innovationScore: 0.5,
      knowledgeGapRelevance: 0.7,
      potentialImpact: 0.7,
      evidenceQuality: baseState.studyParameters.dataCollection?.method?.includes("online") ? 0.8 : 0.6
    },
    methodologyQuality: {
      designAppropriateness: 0.7,
      explanation: baseState.studyParameters.dataCollection?.method?.includes("online") ? 
        "In-person data collection improves data quality and allows clarification of questions." : 
        "Online data collection allows for efficient wide-scale sampling.",
      alternativeControl: {
        type: "none",
        implications: baseState.studyParameters.dataCollection?.method?.includes("online") ? 
          "In-person collection may reduce sampling bias but introduce interviewer effects" : 
          "Online collection reaches broader population but with less control",
        scientificImpact: baseState.studyParameters.dataCollection?.method?.includes("online") ? 
          "Potentially higher data quality but smaller sample" : 
          "Potentially larger sample but variable data quality",
        operationalImpact: baseState.studyParameters.dataCollection?.method?.includes("online") ? 
          "Higher logistical complexity and research staff requirements" : 
          "Simplified logistics but more technical infrastructure needs",
        regulatoryImpact: "Different methodological considerations for interpretation of findings"
      }
    },
    realWorldImpact: {
      labelingChange: 0.5,
      guidelinesInclusion: 0.6,
      clinicalPracticeChange: 0.7,
      explanation: baseState.studyParameters.dataCollection?.method?.includes("online") ? 
        "Higher quality data collection may increase confidence in findings." : 
        "Larger sample improves generalizability of findings.",
      marketAccess: "Data collection method affects stakeholder interpretation of findings."
    },
    feasibilityMetrics: {
      recruitmentSpeedImpact: baseState.studyParameters.dataCollection?.method?.includes("online") ? -0.4 : 0.5,
      operationalComplexity: baseState.studyParameters.dataCollection?.method?.includes("online") ? 0.6 : -0.4,
      participantBurden: baseState.studyParameters.dataCollection?.method?.includes("online") ? 0.3 : -0.2
    }
  });
  
  // Alternative 3: Different sampling approach
  alternatives.push({
    ...baseState,
    id: `${baseState.id}-alt-3`,
    label: "Alternative Sampling Strategy",
    timestamp: new Date(),
    studyParameters: {
      ...baseState.studyParameters,
      population: {
        ...baseState.studyParameters.population,
        selectionMethod: "stratified random sampling"
      }
    },
    costImpact: {
      percentChange: 15,
      areaBreakdown: {
        recruitment: 25,
        dataCollection: 10,
        dataProcessing: 10,
        analysis: 15
      },
      explanation: "Stratified random sampling ensures proportional representation of key subgroups but increases recruitment complexity."
    },
    scientificValue: {
      innovationScore: 0.5,
      knowledgeGapRelevance: 0.7,
      potentialImpact: 0.7,
      evidenceQuality: 0.8
    },
    methodologyQuality: {
      designAppropriateness: 0.8,
      explanation: "Stratified sampling ensures adequate representation of important subgroups for more robust findings.",
      alternativeControl: {
        type: "none",
        implications: "Ensures proportional representation of key demographic or clinical subgroups",
        scientificImpact: "Improves generalizability and allows for subgroup analysis with adequate power",
        operationalImpact: "More complex recruitment process with quota monitoring",
        regulatoryImpact: "Stronger sampling approach may increase confidence in findings"
      }
    },
    realWorldImpact: {
      labelingChange: 0.5,
      guidelinesInclusion: 0.7,
      clinicalPracticeChange: 0.7,
      explanation: "More representative sampling increases applicability across diverse populations.",
      marketAccess: "Stronger methodology improves acceptance by stakeholders."
    },
    feasibilityMetrics: {
      recruitmentSpeedImpact: -0.3,
      operationalComplexity: 0.4,
      participantBurden: 0
    }
  });
  
  return alternatives.slice(0, count);
}

// Generate alternatives for interventional clinical trials
function generateInterventionalTrialAlternatives(baseState: DesignState, count: number = 3): DesignState[] {
  const alternatives: DesignState[] = [];
  
  // Identify study type for more targeted alternatives
  const isOncology = isOncologyStudy(baseState);
  const isProstate = isProstateStudy(baseState);
  const isRandomizedStudy = baseState.studyParameters.design.type.toLowerCase() === "randomized";
  const hasComparator = baseState.studyParameters.comparator?.type !== "none";
  const drugName = baseState.studyParameters.intervention?.name || "Study Treatment";
  const hasAgeRestriction = baseState.studyParameters.population.ageRange.max < 75;
  
  // Alternative 1: Modified study design (e.g., single-arm to randomized or vice versa)
  alternatives.push({
    ...baseState,
    id: `${baseState.id}-alt-1`,
    label: isRandomizedStudy ? "Non-Randomized Alternative" : "Randomized Alternative",
    timestamp: new Date(),
    studyParameters: {
      ...baseState.studyParameters,
      design: {
        ...baseState.studyParameters.design,
        type: isRandomizedStudy ? "single-arm" : "randomized",
        blinding: isRandomizedStudy ? "open-label" : (baseState.studyParameters.design.blinding || "double-blind"),
        allocation: isRandomizedStudy ? "none" : "parallel",
        controlType: isRandomizedStudy ? "none" : "active"
      },
      comparator: {
        ...baseState.studyParameters.comparator,
        type: isRandomizedStudy ? "none" : "active",
        name: isRandomizedStudy ? undefined : "Standard of Care",
        description: isRandomizedStudy ? undefined : "Current standard treatment for this indication"
      }
    },
    costImpact: {
      percentChange: isRandomizedStudy ? -25 : 35,
      areaBreakdown: {
        recruitment: isRandomizedStudy ? -10 : 20,
        assessments: isRandomizedStudy ? -20 : 25,
        monitoring: isRandomizedStudy ? -30 : 40
      },
      explanation: isRandomizedStudy ? 
        `Single-arm study design reduces costs by eliminating control group and simplifying study operations for ${drugName}.` : 
        `Randomized design increases scientific rigor but adds complexity and cost for ${drugName} evaluation.`
    },
    scientificValue: {
      innovationScore: isRandomizedStudy ? 0.3 : 0.7,
      knowledgeGapRelevance: isRandomizedStudy ? 0.4 : 0.8,
      potentialImpact: isRandomizedStudy ? 0.5 : 0.9,
      evidenceQuality: isRandomizedStudy ? 0.3 : 0.7
    },
    methodologyQuality: {
      designAppropriateness: isRandomizedStudy ? 0.5 : 0.8,
      endpointSelection: 0.7,
      statisticalPower: 0.6,
      controlArmSelection: isRandomizedStudy ? 0.4 : 0.7,
      explanation: isRandomizedStudy ? 
        "Non-randomized design may be sufficient for early clinical assessment but provides less rigorous evidence." : 
        "Randomized design provides more robust evidence for efficacy and safety assessment.",
      alternativeControl: {
        type: isRandomizedStudy ? "none" : (hasComparator && baseState.studyParameters.comparator?.type === "placebo" ? "active" : "placebo"),
        implications: hasComparator && baseState.studyParameters.comparator?.type === "placebo" ? 
          "Replacing placebo with active control would reduce effect size but increase clinical relevance" : 
          "Placebo control would provide cleaner efficacy signal but may raise ethical concerns",
        scientificImpact: "Changes the statistical power requirements and interpretability of results",
        operationalImpact: "Affects complexity of drug supply management and blinding procedures",
        regulatoryImpact: "May influence regulatory acceptance and label claims potential"
      }
    },
    realWorldImpact: {
      labelingChange: isRandomizedStudy ? 0.3 : 0.7,
      guidelinesInclusion: isRandomizedStudy ? 0.2 : 0.6,
      clinicalPracticeChange: isRandomizedStudy ? 0.4 : 0.8,
      explanation: isRandomizedStudy ? 
        "Non-randomized design limits potential impact on product labeling and clinical guidelines." : 
        "Randomized design increases potential for inclusion in guidelines and changes to clinical practice.",
      marketAccess: isRandomizedStudy ? 
        "Limited impact on payer decisions and reimbursement potential." : 
        "Strong potential to influence formulary placement and reimbursement decisions."
    },
    feasibilityMetrics: {
      recruitmentSpeedImpact: isRandomizedStudy ? 0.4 : -0.3,
      operationalComplexity: isRandomizedStudy ? -0.5 : 0.6,
      participantBurden: isRandomizedStudy ? -0.2 : 0.1
    }
  });
  
  // Alternative 2: Modified population (broader or more targeted)
  alternatives.push({
    ...baseState,
    id: `${baseState.id}-alt-2`,
    label: hasAgeRestriction ? "Broader Population" : "More Targeted Population",
    timestamp: new Date(),
    studyParameters: {
      ...baseState.studyParameters,
      population: {
        ...baseState.studyParameters.population,
        ageRange: {
          min: hasAgeRestriction ? 
               Math.max(18, baseState.studyParameters.population.ageRange.min - 5) : 
               baseState.studyParameters.population.ageRange.min + 5,
          max: hasAgeRestriction ? 
               baseState.studyParameters.population.ageRange.max + 10 : 
               baseState.studyParameters.population.ageRange.max - 10
        },
        keyInclusion: hasAgeRestriction ?
          [...baseState.studyParameters.population.keyInclusion.filter(c => !c.includes("Age")), `Age ≥ ${Math.max(18, baseState.studyParameters.population.ageRange.min - 5)} years`] :
          [...baseState.studyParameters.population.keyInclusion.filter(c => !c.includes("Age")), `Age ${baseState.studyParameters.population.ageRange.min + 5}-${baseState.studyParameters.population.ageRange.max - 10} years`]
      }
    },
    costImpact: {
      percentChange: hasAgeRestriction ? 5 : -10,
      areaBreakdown: {
        recruitment: hasAgeRestriction ? -15 : 10,
        assessments: hasAgeRestriction ? 10 : -5,
        monitoring: hasAgeRestriction ? 15 : -10
      },
      explanation: hasAgeRestriction ? 
        `Broader age range (${Math.max(18, baseState.studyParameters.population.ageRange.min - 5)}-${baseState.studyParameters.population.ageRange.max + 10} years) increases recruitment pool but may introduce more variability.` : 
        `More targeted age range (${baseState.studyParameters.population.ageRange.min + 5}-${baseState.studyParameters.population.ageRange.max - 10} years) focuses on core population but may slow recruitment.`
    },
    scientificValue: {
      innovationScore: hasAgeRestriction ? 0.2 : 0.6,
      knowledgeGapRelevance: hasAgeRestriction ? 0.5 : 0.7,
      potentialImpact: hasAgeRestriction ? 0.6 : 0.5,
      evidenceQuality: hasAgeRestriction ? 0.4 : 0.8
    },
    feasibilityMetrics: {
      recruitmentSpeedImpact: hasAgeRestriction ? 0.3 : -0.4,
      operationalComplexity: hasAgeRestriction ? 0.1 : -0.1,
      participantBurden: 0
    }
  });
  
  // Alternative 3: Modified treatment regimen or dosing
  alternatives.push({
    ...baseState,
    id: `${baseState.id}-alt-3`,
    label: isOncology ? "Modified Dosing Regimen" : "Alternative Treatment Schedule",
    timestamp: new Date(),
    studyParameters: {
      ...baseState.studyParameters,
      intervention: {
        ...baseState.studyParameters.intervention,
        frequency: isOncology ? 
          "Once every 3 weeks" : 
          baseState.studyParameters.intervention?.frequency?.includes("week") ?
            "Once daily" : "Once weekly",
        dosage: baseState.studyParameters.intervention?.dosage ? 
          modifyDosage(baseState.studyParameters.intervention.dosage) : 
          "Modified dosing based on patient characteristics"
      },
      timing: {
        ...baseState.studyParameters.timing,
        visitFrequency: isOncology ? 
          "Every 3 weeks" : 
          "Monthly"
      }
    },
    costImpact: {
      percentChange: -5,
      areaBreakdown: {
        recruitment: 0,
        assessments: -15,
        monitoring: 5
      },
      explanation: isOncology ? 
        `Modified dosing regimen of ${drugName} may reduce treatment-related visits while maintaining efficacy.` : 
        `Alternative treatment schedule simplifies administration of ${drugName} and may improve adherence.`
    },
    scientificValue: {
      innovationScore: 0.5,
      knowledgeGapRelevance: 0.6,
      potentialImpact: 0.7,
      evidenceQuality: 0.4
    },
    feasibilityMetrics: {
      recruitmentSpeedImpact: 0.1,
      operationalComplexity: -0.3,
      participantBurden: -0.4
    }
  });
  
  return alternatives.slice(0, count);
}