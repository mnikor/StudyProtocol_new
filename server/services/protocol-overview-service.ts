import OpenAI from "openai";

const MODEL = process.env.OPENAI_MODEL && !/4o/i.test(process.env.OPENAI_MODEL)
  ? process.env.OPENAI_MODEL
  : "gpt-4.1";

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || "missing-openai-api-key",
});

/**
 * Handles JSON parsing of OpenAI responses safely
 */
function safeParseJson(content: string | null): any {
  try {
    return JSON.parse(content || "{}");
  } catch (error) {
    console.error("Error parsing JSON from OpenAI response:", error);
    return {};
  }
}

/**
 * Generates a comprehensive protocol overview from the synopsis
 */
export async function generateProtocolOverview(
  synopsis: string,
  protocolType: string = 'interventional_clinical_trial'
): Promise<any> {
  try {
    // Adjust prompt based on protocol type
    let designInstructions = '';
    let systemPrompt = "You are a clinical research expert specializing in protocol development. Your task is to extract and structure key information from clinical research synopses.";
    
    // Protocol-specific instructions for study design section
    if (protocolType === 'interventional_clinical_trial') {
      designInstructions = "Type of study design, randomization, blinding, arms, etc.";
      systemPrompt = "You are a clinical trial expert specializing in interventional trial protocol development.";
    } else if (protocolType === 'secondary_data_analysis' || protocolType === 'retrospective_cohort_study') {
      designInstructions = "Type of study design, data sources, analytical approach, etc. DO NOT mention randomization or blinding as these are not applicable to secondary data analyses.";
      systemPrompt = "You are a real-world evidence expert specializing in secondary data analysis study protocols.";
    } else if (protocolType === 'prospective_cohort_study') {
      designInstructions = "Type of study design, exposure assessment, follow-up procedures, etc.";
      systemPrompt = "You are an epidemiology expert specializing in prospective cohort study protocols.";
    } else if (protocolType === 'delphi_consensus') {
      designInstructions = "Delphi methodology, expert panel composition, consensus rounds, voting process, etc.";
      systemPrompt = "You are a consensus methodology expert specializing in Delphi study protocols. Focus specifically on how Delphi methodology is used for developing clinical consensus. DO NOT include any descriptions of randomization, blinding, interventions, or other elements of interventional trials, as they are not applicable to Delphi consensus studies.";
    } else if (protocolType === 'cross_sectional_survey') {
      designInstructions = "Survey methodology, sampling approach, measurement instruments, etc.";
      systemPrompt = "You are a survey research expert specializing in cross-sectional study protocols.";
    }
    
    // Different prompt structure for Delphi consensus studies
    let prompt = '';
    
    if (protocolType === 'delphi_consensus') {
      prompt = `
        Analyze this Delphi consensus study synopsis and generate a comprehensive protocol overview.
        
        SYNOPSIS:
        ${synopsis.slice(0, 4000)} ${synopsis.length > 4000 ? '... (truncated)' : ''}
        
        PROTOCOL TYPE: Delphi consensus study
        
        Generate a structured overview with the following sections:
        1. Clinical Context: Brief background on the disease/condition and why consensus is needed
        2. Study Objectives: Primary goals of achieving consensus (what specific aspects need consensus)
        3. Consensus Process: Details on the Delphi methodology, expert panel, and voting procedures
        4. Target Experts: Composition of the expert panel and inclusion criteria for experts
        5. Outcome Measures: How consensus will be measured and defined (e.g., threshold for agreement)
        6. Clinical Significance: Why this consensus is important and potential impact
        
        IMPORTANT: This is a Delphi consensus study, NOT an interventional clinical trial. 
        - DO NOT mention randomization, blinding, or intervention arms as they DO NOT apply
        - DO focus on expert panel composition, consensus rounds, and voting/scoring procedures
        - DO explain how experts will be recruited and what their qualifications should be
        - DO explain the timeline for rounds of voting/feedback
        
        Format your response as a JSON object with these fields:
        {
          "summary": "Brief one-paragraph summary of the consensus study",
          "clinicalContext": "1-2 paragraphs on background and need for consensus",
          "objectives": "Clear list of consensus development objectives",
          "endpoints": "How consensus will be measured and what specific items require consensus",
          "design": "Detailed description of Delphi methodology, rounds, and procedures",
          "targetPopulation": "Expert panel composition and selection criteria",
          "significance": "Importance and potential impact of the consensus"
        }
      `;
    } else {
      prompt = `
        Analyze this ${protocolType.replace('_', ' ')} synopsis and generate a comprehensive protocol overview.
        
        SYNOPSIS:
        ${synopsis.slice(0, 4000)} ${synopsis.length > 4000 ? '... (truncated)' : ''}
        
        PROTOCOL TYPE: ${protocolType.replace('_', ' ')}
        
        Generate a structured overview with the following sections:
        1. Clinical Context: Brief background on the disease/condition and current treatment/evidence landscape
        2. Study Objectives: Primary and secondary objectives of the study
        3. Study Endpoints: Primary and secondary endpoints or outcomes with precise definitions
        4. Study Design: ${designInstructions}
        5. Target Population: Key characteristics of the study population
        6. Clinical Significance: Why this study is important and potential impact
        
        Be specific about oncology endpoints if this is a cancer study. For interventional trials with progression-free survival (PFS), 
        specify it's typically defined as time from randomization to disease progression or death. 
        For overall survival (OS), define it as time from randomization to death from any cause.
        
        Format your response as a JSON object with these fields:
        {
          "summary": "Brief one-paragraph summary of the protocol",
          "clinicalContext": "1-2 paragraphs on disease background and current treatments",
          "objectives": "Clear list of primary and secondary objectives",
          "endpoints": "Precise definitions of primary and secondary endpoints",
          "design": "Detailed description of study design and methodology appropriate for the protocol type",
          "targetPopulation": "Key inclusion/exclusion criteria and population characteristics",
          "significance": "Importance and potential impact of the study"
        }
      `;
    }

    const response = await openai.chat.completions.create({
      model: MODEL,
      messages: [
        { 
          role: "system", 
          content: systemPrompt
        },
        { 
          role: "user", 
          content: prompt 
        }
      ],
      response_format: { type: "json_object" },
      temperature: 0.2
    });

    const result = safeParseJson(response.choices[0].message.content);
    return result;
  } catch (error) {
    console.error("Error generating protocol overview:", error);
    throw new Error("Failed to generate protocol overview");
  }
}
