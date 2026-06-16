/**
 * Design Quality Analysis Service
 * This service uses AI to analyze the scientific value, clinical relevance, and feasibility of design states
 */
import OpenAI from "openai";
import { generateProtocolOverview } from "./protocol-overview-service";

// Initialize OpenAI client
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY || "missing-openai-api-key" });
// the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
const MODEL = "gpt-4o";

/**
 * Handles JSON parsing of OpenAI responses safely
 */
function safeParseJson(content: string | null): any {
  if (!content) return null;
  try {
    // Find JSON object within the response if it's wrapped in text
    const jsonMatch = content.match(/```json\n([\s\S]*?)\n```/) || content.match(/({[\s\S]*})/);
    const jsonStr = jsonMatch ? jsonMatch[1] : content;
    return JSON.parse(jsonStr);
  } catch (error) {
    console.error("Failed to parse JSON response:", error);
    console.log("Original content:", content);
    return null;
  }
}

/**
 * Analyzes a design state to provide quality metrics
 * This evaluates scientific value, clinical relevance, feasibility, methodology quality,
 * and potential real-world impact
 */
export async function analyzeDesignQualityMetrics(designState: any): Promise<any> {
  try {
    // Determine protocol type for protocol-specific analysis
    const protocolType = designState.protocolType || 'interventional_clinical_trial';
    const isInterventional = protocolType === 'interventional_clinical_trial';
    const isObservational = protocolType === 'prospective_cohort_study';
    const isSecondaryData = protocolType === 'secondary_data_analysis' || protocolType === 'retrospective_cohort_study';
    const isDelphi = protocolType === 'delphi_consensus';
    const isSurvey = protocolType === 'cross_sectional_survey' || protocolType === 'qualitative_study';
    const isMAIC = protocolType === 'maic';
    
    console.log(`Analyzing quality metrics for protocol type: ${protocolType}`);
    
    // Create a protocol-specific prompt
    let methodologyInstructions = '';
    let feasibilityInstructions = '';
    let relevanceInstructions = '';
    
    if (isInterventional) {
      methodologyInstructions = 'Assess randomization, blinding, control selection, and consistency with ICH E9 principles.';
      feasibilityInstructions = 'Evaluate recruitment timelines, site workload, monitoring requirements, and visit burden.';
      relevanceInstructions = 'Assess regulatory implications, labeling potential, and clinical practice impact.';
    } else if (isObservational) {
      methodologyInstructions = 'Assess exposure assessment methods, follow-up approaches, and bias mitigation strategies. DO NOT evaluate blinding or randomization as these are not applicable to observational designs.';
      feasibilityInstructions = 'Evaluate cohort retention strategies, longitudinal data collection feasibility, and site resources.';
      relevanceInstructions = 'Assess potential for informing clinical guidelines, generating hypotheses for future trials, and clinical practice impact.';
    } else if (isSecondaryData) {
      methodologyInstructions = 'Assess data source appropriateness, analytical methods, confounding control, and missing data handling. DO NOT evaluate blinding, randomization, or site procedures as these are not applicable to secondary data analyses.';
      feasibilityInstructions = 'Evaluate data access, quality, completeness, and processing requirements.';
      relevanceInstructions = 'Assess real-world evidence value, potential for label expansion, and health policy implications.';
    } else if (isDelphi) {
      methodologyInstructions = 'Assess panel composition, consensus methodology, feedback mechanisms, and statement development. DO NOT evaluate blinding, randomization, or traditional clinical endpoints as these are not applicable to consensus studies.';
      feasibilityInstructions = 'Evaluate panel engagement strategies, expert recruitment feasibility, and time requirements.';
      relevanceInstructions = 'Assess impact on clinical guidelines, standard of care definitions, and education materials.';
    } else if (isSurvey) {
      methodologyInstructions = 'Assess sampling approach, instrument validation, and measurement methods. DO NOT evaluate blinding, randomization, or traditional clinical endpoints as these are not applicable to survey studies.';
      feasibilityInstructions = 'Evaluate response rates, participant engagement, and data collection methods.';
      relevanceInstructions = 'Assess impact on understanding patient experience, care quality, and healthcare delivery.';
    } else if (isMAIC) {
      methodologyInstructions = 'Assess matching algorithm appropriateness, population adjustment methods, effect size estimation approach, and bias mitigation. DO NOT evaluate blinding, randomization, or direct intervention comparisons as these are not applicable to MAIC studies.';
      feasibilityInstructions = `
        For a Matching-Adjusted Indirect Comparison (MAIC) study, evaluate the following feasibility aspects based on the information in the synopsis:
        
        1. Data Availability: Assess whether required individual patient data (IPD) from the source study and aggregate data 
           from the target study appear to be available and complete. Assume users have access to data mentioned in the synopsis.
           Score from -1 (limited data) to 1 (complete data).
        
        2. Matching Variable Overlap: Evaluate the extent to which important prognostic factors and effect modifiers 
           are likely available in both source and target studies for matching. Base this on mentions of baseline 
           characteristics in the synopsis. Score from -1 (limited overlap) to 1 (extensive overlap).
        
        3. Statistical Precision: Estimate the potential effective sample size after matching/weighting and expected 
           confidence interval width. Base this on sample sizes mentioned and the expected reduction after matching.
           Score from -1 (low precision) to 1 (high precision).
        
        4. Publication Bias Risk: Evaluate the risk that the available target trial data may be affected by publication bias.
           Assess based on how the target study was selected and whether the analysis plan was pre-specified in the synopsis.
           Score from -1 (low risk) to 1 (high risk).
           
        Provide detailed rationale for each assessment, assuming the data is available to the user.
      `;
      relevanceInstructions = 'Assess health technology assessment implications, potential for formulary inclusion, and impact on clinical decision making in the absence of direct comparative evidence.';
    }
    
    const prompt = `
    Analyze the scientific value, clinical relevance, feasibility, methodology quality, and potential impact of the following ${protocolType.replace('_', ' ')} design.
    Provide a comprehensive quantitative and qualitative assessment that is specifically tailored to this protocol type.
    
    STUDY DESIGN:
    ${JSON.stringify(designState, null, 2)}
    
    PROTOCOL TYPE: ${protocolType}
    
    Analyze these five areas:
    1. Scientific Value: innovation score, knowledge gap relevance, potential impact, evidence quality
    2. Clinical Relevance: patient-centered outcomes, translational potential, unmet need alignment, adoption likelihood
       ${relevanceInstructions}
    3. Feasibility: recruitment speed impact (-1 to 1), operational complexity (-1 to 1), participant burden (-1 to 1)
       ${feasibilityInstructions}
    4. Methodology Quality: study design appropriateness, endpoint selection, statistical approaches
       ${methodologyInstructions}
    5. Real-World Impact: potential for evidence generation, inclusion in clinical guidelines, change in clinical practice
    
    For each metric, provide a score between 0 and 1 for Scientific Value, Clinical Relevance, Methodology Quality, and Real-World Impact metrics.
    For Feasibility metrics, use a scale from -1 (negative impact) to 1 (positive impact).
    Also include a brief explanation for each metric that is appropriate for this study type.
    
    Provide a summary assessment of the design's overall quality, key strengths, and areas for improvement.
    Include 2-3 specific recommendations to improve the design that are appropriate for this protocol type.
    
    ${isInterventional ? `For control arm alternatives, if the study has a placebo control, analyze the implications of replacing it with an active control arm.
    If the study already has an active control, analyze the implications of using a placebo instead.` : 
    isObservational || isSecondaryData ? `For analytical approach alternatives, analyze the implications of using different methods for controlling confounding or bias.` :
    isMAIC ? `For matching algorithm alternatives, analyze the implications of using different weighting approaches, population adjustments, or alternative statistical matching methods.` :
    `For methodological alternatives, suggest an alternative approach that might strengthen the design.`}
    
    Format your response as a JSON object with the structure:
    {
      "scientificValue": {
        "innovationScore": number, // 0 to 1
        "knowledgeGapRelevance": number, // 0 to 1
        "potentialImpact": number, // 0 to 1
        "evidenceQuality": number, // 0 to 1
        "explanation": string
      },
      "clinicalRelevance": {
        "patientCenteredOutcomes": number, // 0 to 1
        "translationalPotential": number, // 0 to 1
        "unmetNeedAlignment": number, // 0 to 1
        "adoptionLikelihood": number, // 0 to 1
        "explanation": string
      },
      "feasibilityMetrics": {
        ${isMAIC ? `
        "dataAvailability": number, // -1 to 1 (limited to complete)
        "dataAvailabilityRationale": string,
        "matchingVariableOverlap": number, // -1 to 1 (limited to extensive)
        "matchingVariableOverlapRationale": string,
        "statisticalPrecision": number, // -1 to 1 (low to high)
        "statisticalPrecisionRationale": string,
        "publicationBiasRisk": number, // -1 to 1 (low to high risk)
        "publicationBiasRiskRationale": string,
        ` : `
        "recruitmentSpeedImpact": number, // -1 to 1
        "recruitmentRationale": string,
        "operationalComplexity": number, // -1 to 1
        "complexityRationale": string,
        "participantBurden": number, // -1 to 1
        "participantBurdenRationale": string,
        `}
        "overallScore": number, // 0 to 1
        "explanation": string
      },
      "methodologyQuality": {
        "designAppropriateness": number, // 0 to 1
        "endpointSelection": number, // 0 to 1
        "statisticalPower": number, // 0 to 1
        "controlArmSelection": number, // 0 to 1
        "explanation": string,
        "alternativeControl": {
          "type": string, // "active" or "placebo"
          "implications": string,
          "scientificImpact": string,
          "operationalImpact": string,
          "regulatoryImpact": string
        }
      },
      "realWorldImpact": {
        "labelingChange": number, // 0 to 1
        "guidelinesInclusion": number, // 0 to 1
        "clinicalPracticeChange": number, // 0 to 1
        "explanation": string,
        "marketAccess": string,
        "reimbursementPotential": string
      },
      "summary": string,
      "recommendations": [string, string, string]
    }
    `;

    const response = await openai.chat.completions.create({
      model: MODEL,
      messages: [{ role: "user", content: prompt }],
      temperature: 0.5,
      response_format: { type: "json_object" },
      max_tokens: 2000,
    });

    const content = response.choices[0].message.content;
    const metrics = safeParseJson(content);

    if (!metrics) {
      throw new Error("Failed to analyze design quality metrics");
    }

    // Generate the protocol overview
    let overview = {};
    try {
      // Only generate an overview if we have a synopsis to work with
      if (designState.synopsis) {
        // Generate a new overview based on the synopsis and protocol type
        overview = await generateProtocolOverview(
          designState.synopsis,
          designState.protocolType || 'interventional_clinical_trial'
        );
        console.log("Generated new overview during quality analysis");
      } else {
        console.log("Cannot generate overview: no synopsis available");
      }
    } catch (overviewError) {
      console.error("Error generating overview during quality analysis:", overviewError);
      // Continue with the rest of the process even if overview generation fails
    }

    return {
      metrics: metrics,
      designState: {
        ...designState,
        scientificValue: metrics.scientificValue,
        clinicalRelevance: metrics.clinicalRelevance,
        feasibilityMetrics: metrics.feasibilityMetrics,
        methodologyQuality: metrics.methodologyQuality,
        realWorldImpact: metrics.realWorldImpact,
        // Add the overview if it was successfully generated
        ...(Object.keys(overview).length > 0 ? { overview } : {})
      }
    };
  } catch (error: any) {
    console.error("Error analyzing design quality metrics:", error);
    throw new Error(`Failed to analyze design quality: ${error.message || String(error)}`);
  }
}
