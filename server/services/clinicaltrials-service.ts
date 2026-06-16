import axios from 'axios';
import OpenAI from "openai";

// the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
const MODEL = "gpt-4o";

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || "missing-openai-api-key",
});

// Base URL for ClinicalTrials.gov API
const API_BASE_URL = 'https://clinicaltrials.gov/api/v2';

// Add verbose logging for development
const VERBOSE_LOGGING = true;

// Phase mapping for ClinicalTrials.gov API v2
const PHASE_MAP: { [key: string]: string } = {
  "Phase 1": "PHASE1",
  "Phase 2": "PHASE2",
  "Phase 3": "PHASE3",
  "Phase 4": "PHASE4",
  "Phase 1/Phase 2": "PHASE1_PHASE2", 
  "Phase 2/Phase 3": "PHASE2_PHASE3",
  "Phase 3/Phase 4": "PHASE3_PHASE4",
  // Add common variations
  "Phase I": "PHASE1",
  "Phase II": "PHASE2",
  "Phase III": "PHASE3",
  "Phase IV": "PHASE4"
};

// Helper function to build a ClinicalTrials.gov v2 Essie date range.
// The v2 API does not accept query.start_date; date filters belong in query.term.
function getStartDateExpression(timeframe?: string): string | null {
  if (!timeframe || timeframe === "all") {
    return null;
  }

  const currentYear = new Date().getFullYear();
  let startYear: number | null = null;

  switch (timeframe) {
    case 'last5years':
      startYear = currentYear - 5;
      break;
    case 'last10years':
      startYear = currentYear - 10;
      break;
    default:
      return null;
  }

  return `AREA[StartDate]RANGE[${startYear}-01-01,MAX]`;
}

function getSelectedStatuses(filters?: SearchFilters): string {
  const rawStatus = filters?.status;
  if (!rawStatus) return "";

  const selected = "selected" in rawStatus && rawStatus.selected
    ? rawStatus.selected
    : rawStatus as Record<string, boolean | undefined>;

  const statusMapping: { [key: string]: string } = {
    "Recruiting": "RECRUITING",
    "Active, not recruiting": "ACTIVE_NOT_RECRUITING",
    "Completed": "COMPLETED",
    "Not yet recruiting": "NOT_YET_RECRUITING",
    "Terminated": "TERMINATED",
    "Suspended": "SUSPENDED",
    "Withdrawn": "WITHDRAWN",
    "Unknown status": "UNKNOWN",
    "Enrolling by invitation": "ENROLLING_BY_INVITATION"
  };

  return Object.keys(selected)
    .filter(k => Boolean(selected[k]))
    .map(k => statusMapping[k] ?? k)
    .join("|");
}

function getPhaseExpression(phase?: string): string {
  if (!phase?.trim()) return "";

  const phaseValues = phase
    .split(",")
    .map(value => value.trim())
    .filter(Boolean)
    .map(value => PHASE_MAP[value] ?? value.toUpperCase().replace(/\s+/g, ""))
    .filter(Boolean);

  if (phaseValues.length === 0) return "";

  return `AREA[Phase](${phaseValues.join(" OR ")})`;
}

// Types for better structure
export interface SearchParams {
  indication: string;
  phase?: string;
  additionalTerms?: string;
}

export interface TrialSummary {
  nctId: string;
  title: string;
  phases: string[];
  status: string;
  conditions: string[];
  sponsors: { name: string, type: string }[];
  interventions?: { type: string, name: string }[];
  briefSummary?: string;
  eligibilityCriteria?: string;
  similarity?: number;
  matchRationale?: string;
  url: string;
}

export interface CriterionItem {
  category: string;
  criterion: string;
}

export interface CriteriaCategory {
  category: string;
  criteria: string[];
}

export interface CriteriaSet {
  inclusionCriteria: CriteriaCategory[];
  exclusionCriteria: CriteriaCategory[];
}

export interface ComparisonResult {
  category: string;
  criteriaType: string;
  assessment: "Required" | "High Impact" | "Medium Impact" | "Standard";
  recommendation: string;
  prevalence: number;
  totalTrials: number;
}

export interface ComparisonData {
  inclusion: ComparisonResult[];
  exclusion: ComparisonResult[];
  summary: {
    missingRequired: string[];
    recommendations: string[];
  };
}

const SEARCH_STOPWORDS = new Set([
  "and", "or", "the", "with", "without", "for", "from", "that", "this", "study", "trial",
  "phase", "patients", "patient", "subjects", "subject", "versus", "plus", "alone", "therapy",
  "treatment", "controlled", "randomized", "randomised", "double", "blind", "open", "label",
  "clinical", "evaluate", "efficacy", "safety", "adult", "adults", "disease"
]);

function isUsefulSearchValue(value?: string | null): boolean {
  const normalized = String(value || "").trim().toLowerCase();
  return Boolean(normalized) && !["unknown", "not specified", "n/a", "na", "none", "null"].includes(normalized);
}

function tokenizeSearchText(value?: string | null): string[] {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .split(/\s+/)
    .map(token => token.trim())
    .filter(token => token.length > 2 && !SEARCH_STOPWORDS.has(token));
}

function uniqueTokens(value?: string | null): string[] {
  return [...new Set(tokenizeSearchText(value))];
}

function overlapRatio(needles: string[], haystack: string): number {
  if (needles.length === 0) return 0;
  const normalized = ` ${haystack.toLowerCase().replace(/[^a-z0-9]+/g, " ")} `;
  const matches = needles.filter(token => normalized.includes(` ${token} `)).length;
  return matches / needles.length;
}

function scoreTrialSimilarity(
  trial: TrialSummary,
  searchProfile: { indication: string; phase?: string; additionalTerms?: string },
  index: number
): TrialSummary {
  const conditionText = trial.conditions.join(" ");
  const interventionText = (trial.interventions || []).map(intervention => intervention.name).join(" ");
  const fullText = [
    trial.title,
    conditionText,
    interventionText,
    trial.briefSummary,
    trial.eligibilityCriteria,
  ].filter(Boolean).join(" ");

  const diseaseTokens = uniqueTokens(searchProfile.indication);
  const contextTokens = uniqueTokens(searchProfile.additionalTerms);
  const diseaseScore = overlapRatio(diseaseTokens, `${trial.title} ${conditionText} ${trial.briefSummary || ""}`);
  const contextScore = overlapRatio(contextTokens, fullText);
  const phaseValues = (searchProfile.phase || "")
    .split(",")
    .map(phase => PHASE_MAP[phase.trim()] ?? phase.trim().toUpperCase().replace(/\s+/g, ""))
    .filter(Boolean);
  const phaseScore = phaseValues.length === 0 || trial.phases.some(phase => phaseValues.includes(phase)) ? 1 : 0;
  const rankBoost = Math.max(0, 1 - index / 50);

  const similarity = Math.round(
    Math.min(
      100,
      42 + diseaseScore * 30 + contextScore * 20 + phaseScore * 6 + rankBoost * 4
    )
  );

  const rationaleParts = [
    diseaseScore > 0.65 ? "disease match" : "",
    contextScore > 0.35 ? "population/intervention terms" : "",
    phaseScore ? "phase match" : "",
  ].filter(Boolean);

  return {
    ...trial,
    similarity,
    matchRationale: rationaleParts.join(", ") || "general condition match",
  };
}

/**
 * Uses AI to analyze a protocol synopsis and extract relevant search terms for clinical trials
 * @param protocol Protocol object with synopsis data
 * @returns Search parameters for clinical trials
 */
export async function analyzeProtocolForTrialSearch(protocol: any): Promise<{
  indication: string,
  phase: string,
  additionalTerms: string
}> {
  try {
    console.log("Analyzing protocol for trial search...");
    
    // Extract the synopsis text
    let synopsis = '';
    
    // Handle different possible data structures
    if (protocol.synopsis) {
      if (typeof protocol.synopsis === 'string') {
        synopsis = protocol.synopsis;
      } else if (protocol.synopsis.content) {
        synopsis = protocol.synopsis.content;
      }
    }
    
    // Check inclusion/exclusion criteria for clues
    let criteriaText = '';
    if (protocol.inclusionCriteria || protocol.inclusionExclusionCriteria) {
      console.log("Extracting text from inclusion/exclusion criteria...");
      
      if (protocol.inclusionCriteria) {
        if (Array.isArray(protocol.inclusionCriteria)) {
          criteriaText = protocol.inclusionCriteria.map((c: any) => c.text || c.criterion || '').join(' ');
        } else if (typeof protocol.inclusionCriteria === 'object') {
          criteriaText = JSON.stringify(protocol.inclusionCriteria);
        }
      }
      
      if (protocol.inclusionExclusionCriteria && protocol.inclusionExclusionCriteria.content) {
        if (typeof protocol.inclusionExclusionCriteria.content === 'string') {
          criteriaText += ' ' + protocol.inclusionExclusionCriteria.content;
        } else {
          criteriaText += ' ' + JSON.stringify(protocol.inclusionExclusionCriteria.content);
        }
      }
    }
    
    // Check if we have any usable text from synopsis
    if (!synopsis || synopsis.length < 50) {
      console.log("Protocol synopsis is too short or missing. Using protocol title if available.");
      synopsis = protocol.title || '';
      
      if (synopsis.length < 50) {
        // Try to find any text we can use
        console.log("Attempting to use protocol description or other attributes...");
        if (protocol.description) {
          synopsis = protocol.description;
        }
      }
    }
    
    // Add criteria text to synopsis if we have it
    if (criteriaText.length > 0) {
      synopsis += ' ' + criteriaText;
    }

    if (isUsefulSearchValue(protocol.indication)) {
      synopsis += `\nKnown indication: ${protocol.indication}`;
    }
    if (isUsefulSearchValue(protocol.phase)) {
      synopsis += `\nKnown phase: ${protocol.phase}`;
    }
    
    // Last-resort fallback - set "cancer" as default indication if nothing else available
    // This is just to enable testing the feature even with minimal protocol data
    if (!synopsis || synopsis.length < 50) {
      console.warn("Minimal protocol data available. Using fallback indication for demonstration purposes.");
      return {
        indication: "cancer",
        phase: "Phase 3",
        additionalTerms: "solid tumor"
      };
    }
    
    console.log(`Extracted synopsis text (${synopsis.length} chars). Sending to OpenAI for analysis...`);
    
    // Use OpenAI to extract relevant search terms from the protocol synopsis
    const prompt = `
      Analyze this clinical trial protocol synopsis and extract the most relevant search terms 
      to find similar clinical trials on ClinicalTrials.gov.
      
      Protocol synopsis:
      ${synopsis.slice(0, 2000)} ${synopsis.length > 2000 ? '... (truncated)' : ''}
      
      Extract search parameters for finding genuinely similar trials. Prioritize:
      1. The specific disease/condition, including stage or disease setting when known
      2. Patient population details such as metastatic/localized, prior therapy, biomarker status, age/sex, performance status
      3. Intervention and comparator classes or drug names
      4. Study phase and major design features
      
      Format your response as a JSON object with these fields:
      {
        "indication": "string", 
        "phase": "string",
        "additionalTerms": "string" // compact keywords for population, intervention, comparator, biomarker, and design
      }
    `;
    
    const response = await openai.chat.completions.create({
      model: MODEL,
      messages: [
        { 
          role: "system", 
          content: "You are a clinical research expert helping to extract search parameters from protocol synopses." 
        },
        { 
          role: "user", 
          content: prompt 
        }
      ],
      response_format: { type: "json_object" },
      temperature: 0.3,
    });
    
    // Parse the response to get search parameters
    // Parse the API response with robust handling for Markdown formatting
    const raw = (response.choices[0].message.content ?? "").trim();
    const json = raw.startsWith("{") ? raw : raw.slice(raw.indexOf("{"));
    const searchParams = JSON.parse(json || "{}");
    console.log("AI extracted search parameters:", searchParams);
    
    return {
      indication: searchParams.indication || (isUsefulSearchValue(protocol.indication) ? protocol.indication : ''),
      phase: searchParams.phase || (isUsefulSearchValue(protocol.phase) ? protocol.phase : ''),
      additionalTerms: searchParams.additionalTerms || ''
    };
  } catch (error: any) {
    console.error('Error analyzing protocol for trial search:', error);
    throw new Error(`Failed to analyze protocol for search parameters: ${error.message}`);
  }
}

/**
 * Searches for clinical trials based on search parameters
 * @param indication Disease/condition
 * @param phase Study phase (e.g., "Phase 1", "Phase 2")
 * @param filters Additional filters like status, timeframe
 * @param additionalTerms Additional search terms
 * @param maxResults Maximum number of results to return
 * @returns Array of trial information formatted as TrialSummary objects
 */
// Define search filters interface
export interface SearchFilters {
  status?: { 
    selected?: { [key: string]: boolean | undefined }
  } | { [key: string]: boolean | undefined };
  timeframe?: string;
  minSimilarity?: number;
}

export async function searchClinicalTrials(
  indication: string,
  phase?: string,
  filters?: SearchFilters,
  additionalTerms?: string,
  maxResults: number = 5
): Promise<TrialSummary[]> {
  try {
    // Validate indication
    if (!indication || indication.trim() === '') {
      console.error("Empty indication provided to searchClinicalTrials");
      // Use a fallback for demonstration purposes
      indication = "cancer";
    }
    
    console.log(`Searching clinical trials for:
      - Indication: ${indication}
      - Phase: ${phase || 'Any'}
      - Filters: ${filters ? JSON.stringify(filters) : 'None'}
      - Additional terms: ${additionalTerms || 'None'}
      - Max results: ${maxResults}`);
    
    const statusPipe = getSelectedStatuses(filters);
    const startDateExpr = getStartDateExpression(filters?.timeframe);
    const phaseExpr = getPhaseExpression(phase);
    const requestedResults = Math.max(1, maxResults);
    const candidateCount = additionalTerms?.trim()
      ? Math.min(50, Math.max(requestedResults * 5, 20))
      : requestedResults;
    
    const termExpr = [phaseExpr, startDateExpr].filter(Boolean).join(" AND ");
    
    // Make the request with properly formatted parameters
    const response = await axios.get(`${API_BASE_URL}/studies`, {
      params: {
        // Main free-text / condition term
        "query.cond": indication,
        
        // Use Essie expression for phase / extra terms
        ...(termExpr && { "query.term": termExpr }),
        
        // Recruitment status filter (optional)
        ...(statusPipe && { "filter.overallStatus": statusPipe }),
        
        // Housekeeping
        pageSize: candidateCount,
        format: "json",
        countTotal: "true"
      }
    });
    
    console.log("ClinicalTrials.gov API request params:", response.config.params);
    
    // Extract and return the relevant study data
    if (response.data && response.data.studies) {
      console.log(`Retrieved ${response.data.studies.length} trials from ClinicalTrials.gov`);
      
      const trials = response.data.studies.map((study: any): TrialSummary => {
        // Extract identification info
        const identificationModule = study.protocolSection?.identificationModule || {};
        const nctId = identificationModule.nctId || "unknown";
        const title = identificationModule.officialTitle || identificationModule.briefTitle || "Untitled Trial";
        
        // Extract design info (phases)
        const designModule = study.protocolSection?.designModule || {};
        const phases = designModule.phases || [];
        
        // Extract status
        const statusModule = study.protocolSection?.statusModule || {};
        const status = statusModule.overallStatus || "Unknown";
        
        // Extract conditions (indications)
        const conditionsModule = study.protocolSection?.conditionsModule || {};
        const conditions = conditionsModule.conditions || [];
        
        // Extract sponsor information
        const sponsorCollaboratorsModule = study.protocolSection?.sponsorCollaboratorsModule || {};
        const leadSponsor = sponsorCollaboratorsModule.leadSponsor 
          ? [{ name: sponsorCollaboratorsModule.leadSponsor.name, type: "Lead" }] 
          : [];
        
        const collaborators = (sponsorCollaboratorsModule.collaborators || [])
          .map((c: any) => ({ name: c.name, type: "Collaborator" }));
        
        const sponsors = [...leadSponsor, ...collaborators];
        
        // Extract interventions
        const armsInterventionsModule = study.protocolSection?.armsInterventionsModule || {};
        const interventions = (armsInterventionsModule.interventions || [])
          .map((i: any) => ({ type: i.type, name: i.name }));

        const descriptionModule = study.protocolSection?.descriptionModule || {};
        const eligibilityModule = study.protocolSection?.eligibilityModule || {};
        
        return {
          nctId,
          title,
          phases,
          status,
          conditions,
          sponsors,
          interventions,
          briefSummary: descriptionModule.briefSummary || "",
          eligibilityCriteria: eligibilityModule.eligibilityCriteria || "",
          url: `https://clinicaltrials.gov/study/${nctId}`
        };
      });

      if (additionalTerms?.trim()) {
        return trials
          .map((trial, index) => scoreTrialSimilarity(trial, { indication, phase, additionalTerms }, index))
          .sort((a, b) => (b.similarity || 0) - (a.similarity || 0))
          .slice(0, requestedResults);
      }

      return trials;
    }
    
    console.log("No studies found in API response");
    return [];
  } catch (error: any) {
    console.error('Error in searchClinicalTrials:', error);
    
    // Provide more specific error information
    if (error.response) {
      // The request was made and the server responded with a status code
      console.error(`API Error: ${error.response.status} - ${JSON.stringify(error.response.data)}`);
      throw new Error(`API Error: ${error.response.status} - ${JSON.stringify(error.response.data)}`);
    } else if (error.request) {
      // The request was made but no response was received
      console.error('No response received from ClinicalTrials.gov API');
      throw new Error('No response received from ClinicalTrials.gov API');
    } else {
      // Something happened in setting up the request
      console.error('Error setting up the request:', error.message);
      throw new Error(`Failed to search clinical trials: ${error.message}`);
    }
  }
}

/**
 * Fetches detailed information about a single clinical trial by NCT ID
 * @param nctId The ClinicalTrials.gov identifier (NCT number)
 * @returns Detailed trial information
 */
export async function getTrialDetails(nctId: string): Promise<any> {
  try {
    // Log the request URL - use studies endpoint instead of study
    const url = `${API_BASE_URL}/studies/${nctId}`;
    console.log(`Fetching trial details from: ${url}`);
    
    const response = await axios.get(url, {
      params: {
        format: 'json'
      }
    });
    
    return response.data;
  } catch (error: any) {
    if (error.response) {
      // Request made and server responded with an error status
      if (error.response.status === 404) {
        console.error(`Trial ${nctId} not found (404): The trial ID may be invalid or the study might not be available.`);
        return {
          protocolSection: {
            identificationModule: {
              nctId: nctId,
              briefTitle: `Trial ${nctId} (Not Found)`,
              officialTitle: `Trial ${nctId} could not be retrieved from ClinicalTrials.gov`
            },
            statusModule: {
              statusVerifiedDate: new Date().toISOString().split('T')[0],
              overallStatus: "Unknown"
            },
            descriptionModule: {
              briefSummary: "This trial information could not be retrieved from ClinicalTrials.gov. It may be invalid or no longer available."
            }
          }
        };
      } else {
        console.error(`Error fetching trial details for ${nctId}: HTTP ${error.response.status}`);
      }
    } else if (error.request) {
      // The request was made but no response was received
      console.error(`No response received when fetching trial ${nctId}`);
    } else {
      // Something happened in setting up the request
      console.error(`Error setting up the request for trial ${nctId}:`, error.message);
    }
    
    throw new Error(`Failed to fetch trial details for ${nctId}`);
  }
}

/**
 * Extracts and structures eligibility criteria data from a clinical trial
 * @param trialDetails The detailed trial information
 * @returns Structured eligibility criteria data
 */
export async function extractEligibilityCriteria(trialDetails: any): Promise<any> {
  // The structure of the eligibility criteria information can vary between trials
  // We'll use AI to help extract and structure it consistently
  
  try {
    // Extract relevant sections that might contain eligibility criteria information
    const eligibilityInfo = trialDetails.protocolSection?.eligibilityModule || {};
    const descriptionInfo = trialDetails.protocolSection?.descriptionModule || {};
    
    // Extract raw eligibility criteria
    const eligibilityCriteria = {
      inclusionCriteria: eligibilityInfo.inclusionCriteria || [],
      exclusionCriteria: eligibilityInfo.exclusionCriteria || [],
      healthyVolunteers: eligibilityInfo.healthyVolunteers,
      sex: eligibilityInfo.sex,
      minimumAge: eligibilityInfo.minimumAge,
      maximumAge: eligibilityInfo.maximumAge,
      stdAges: eligibilityInfo.stdAges || []
    };
    
    // If no detailed criteria are available, extract from the description
    if ((!eligibilityCriteria.inclusionCriteria || eligibilityCriteria.inclusionCriteria.length === 0) &&
        (!eligibilityCriteria.exclusionCriteria || eligibilityCriteria.exclusionCriteria.length === 0)) {
      console.log("No structured eligibility criteria found, extracting from description");
    }
    
    // Construct a prompt for OpenAI to extract and structure the eligibility criteria
    const prompt = `
      I need you to extract and structure the Inclusion and Exclusion Criteria from this clinical trial information.
      
      Trial information:
      ${JSON.stringify({
        title: trialDetails.protocolSection?.identificationModule?.officialTitle || trialDetails.protocolSection?.identificationModule?.briefTitle,
        description: descriptionInfo.detailedDescription || descriptionInfo.briefSummary,
        eligibility: eligibilityCriteria
      }, null, 2)}
      
      Please extract and return the eligibility criteria in JSON format with this structure:
      {
        "inclusionCriteria": [
          {
            "category": "Demographics",
            "criteria": [
              "Criterion 1",
              "Criterion 2"
            ]
          },
          {
            "category": "Disease Characteristics",
            "criteria": [
              "Criterion 3",
              "Criterion 4"
            ]
          }
        ],
        "exclusionCriteria": [
          {
            "category": "Prior/Concurrent Therapy",
            "criteria": [
              "Criterion 1",
              "Criterion 2"
            ]
          },
          {
            "category": "Patient Characteristics",
            "criteria": [
              "Criterion 3",
              "Criterion 4"
            ]
          }
        ]
      }
      
      Please categorize each criterion into appropriate categories such as:
      - Demographics (age, sex, etc.)
      - Disease Characteristics (stage, severity, etc.)
      - Prior/Concurrent Therapy
      - Patient Characteristics
      - Laboratory Values
      - Comorbidities

      If you can't find detailed criteria, create a structured format from any available eligibility information.
    `;
    
    const response = await openai.chat.completions.create({
      model: MODEL,
      messages: [
        { 
          role: "system", 
          content: "You are a clinical protocol expert specializing in extracting and categorizing eligibility criteria from clinical trial protocols. Return structured JSON output." 
        },
        { 
          role: "user", 
          content: prompt 
        }
      ],
      response_format: { type: "json_object" },
      temperature: 0.3,
    });
    
    // Parse and return the eligibility criteria data
    // Parse the API response with robust handling for Markdown formatting
    const raw = (response.choices[0].message.content ?? "").trim();
    const json = raw.startsWith("{") ? raw : raw.slice(raw.indexOf("{"));
    const criteriaData = JSON.parse(json || "{}");
    return criteriaData;
  } catch (error) {
    console.error('Error extracting eligibility criteria data:', error);
    throw new Error('Failed to extract eligibility criteria data');
  }
}

/**
 * Compares the current protocol's eligibility criteria with criteria from similar trials
 * @param currentCriteria The current protocol's eligibility criteria
 * @param comparisonCriteria Array of eligibility criteria from similar trials
 * @returns Comparison data with analysis
 */
export async function compareCriteria(
  currentCriteria: any,
  comparisonCriteria: any[]
): Promise<ComparisonData> {
  try {
    console.log('Starting criteria comparison with:');
    console.log(`- Current protocol with ${currentCriteria.inclusionCriteria?.length || 0} inclusion and ${currentCriteria.exclusionCriteria?.length || 0} exclusion criteria`);
    console.log(`- ${comparisonCriteria.length} comparison trials`);
    
    // Format the data correctly for analysis
    // Make sure we have the correct structure
    const formattedCurrentCriteria = {
      inclusionCriteria: currentCriteria.inclusionCriteria || [],
      exclusionCriteria: currentCriteria.exclusionCriteria || []
    };
    
    // Extract all inclusion and exclusion criteria from the comparison trials
    const allComparisonInclusion = comparisonCriteria.flatMap(trial => {
      const inclusionCriteria = trial.criteria?.inclusionCriteria || [];
      // Add the trial ID and name to each criterion for reference
      return inclusionCriteria.flatMap((category: any) => {
        return (category.criteria || []).map((criterion: string) => ({
          trialId: trial.nctId,
          trialTitle: trial.title || "Untitled Trial",
          criterion: criterion,
          category: category.category || 'Other'
        }));
      });
    });
    
    const allComparisonExclusion = comparisonCriteria.flatMap(trial => {
      const exclusionCriteria = trial.criteria?.exclusionCriteria || [];
      return exclusionCriteria.flatMap((category: any) => {
        return (category.criteria || []).map((criterion: string) => ({
          trialId: trial.nctId,
          trialTitle: trial.title || "Untitled Trial",
          criterion: criterion,
          category: category.category || 'Other'
        }));
      });
    });
    
    // Format current criteria for easier analysis
    const currentInclusionCriteria = formattedCurrentCriteria.inclusionCriteria.flatMap((category: any) => {
      return (category.criteria || []).map((criterion: string) => ({
        criterion,
        category: category.category || 'Other'
      }));
    });
    
    const currentExclusionCriteria = formattedCurrentCriteria.exclusionCriteria.flatMap((category: any) => {
      return (category.criteria || []).map((criterion: string) => ({
        criterion,
        category: category.category || 'Other'
      }));
    });
    
    console.log(`Formatted comparison data: 
      - Current protocol: ${currentInclusionCriteria.length} inclusion, ${currentExclusionCriteria.length} exclusion
      - Comparison trials: ${allComparisonInclusion.length} inclusion, ${allComparisonExclusion.length} exclusion`);
    
    // Prepare comparison data for OpenAI
    const analysisData = {
      currentProtocol: {
        inclusion: currentInclusionCriteria,
        exclusion: currentExclusionCriteria
      },
      comparisonTrials: {
        totalTrials: comparisonCriteria.length,
        inclusion: allComparisonInclusion,
        exclusion: allComparisonExclusion
      }
    };
    
    const prompt = `
      Perform a comprehensive, in-depth analysis of how the current protocol's eligibility criteria compare with criteria from similar clinical trials.
      
      ANALYSIS DATA:
      ${JSON.stringify(analysisData, null, 2)}
      
      TASK:
      Conduct a semantic, meaning-based analysis (not just exact text matching) to:
      
      1. COMMON CRITERIA: Find criteria that are semantically similar between the current protocol and comparison trials
         - Group by category (Demographics, Disease Characteristics, etc.)
         - Calculate prevalence (% of comparison trials with similar criteria)
         - Assess if current protocol criteria are more restrictive, less restrictive, or equivalent
      
      2. RECOMMENDATIONS: Identify important criteria that are common in similar trials (>50% prevalence) but absent from the current protocol
         - Prioritize by prevalence and clinical importance
         - For each recommendation, explain rationale and potential impact
      
      3. UNIQUE CRITERIA: Identify criteria unique to the current protocol but rare in similar trials
         - Evaluate potential rationale and impact on enrollment
      
      4. OVERALL ANALYSIS:
         - Assess alignment with field standards and identify gaps
         - Evaluate restrictiveness relative to similar trials
         - Analyze potential impact on patient enrollment and generalizability
      
      RESPONSE FORMAT:
      Return a JSON object with this exact structure:
      {
        "summary": {
          "overview": "Concise summary of overall comparison (1-2 paragraphs)",
          "recommendations": "Overall recommendations for improvement (1 paragraph)",
          "strengths": ["Strength 1", "Strength 2", ...],
          "gaps": ["Gap 1", "Gap 2", ...]
        },
        "statistics": {
          "totalInclusion": number,
          "totalExclusion": number,
          "commonInclusion": number,
          "commonExclusion": number
        },
        "commonCriteria": {
          "inclusion": [
            {
              "text": "The criterion",
              "category": "Category name",
              "prevalence": number (percentage)
            }
          ],
          "exclusion": [
            {
              "text": "The criterion",
              "category": "Category name",
              "prevalence": number (percentage)
            }
          ]
        },
        "uniqueCriteria": {
          "inclusion": ["Criterion 1", "Criterion 2", ...],
          "exclusion": ["Criterion 1", "Criterion 2", ...]
        },
        "recommendations": {
          "inclusion": ["Recommended inclusion criterion 1", ...],
          "exclusion": ["Recommended exclusion criterion 1", ...]
        }
      }
      
      GUIDELINES:
      - Your analysis should be SEMANTIC and MEANINGFUL, not just based on text matching
      - For each criterion comparison, consider the clinical significance, not just prevalence
      - The "commonCriteria" section should reflect conceptual matches, not just exact text matches
      - Recommendations should be specific and actionable, focused on optimizing patient recruitment while maintaining scientific validity
      - Prioritize insights that would meaningfully impact patient enrollment and data quality
    `;
    
    const response = await openai.chat.completions.create({
      model: MODEL,
      messages: [
        { 
          role: "system", 
          content: `You are a leading clinical trial design expert with extensive experience analyzing eligibility criteria across trials.
                   You have deep knowledge of how eligibility criteria impact patient recruitment, retention, and data quality.
                   You understand the nuances of eligibility criteria across different therapeutic areas.
                   You excel at identifying meaningful patterns and providing actionable recommendations.
                   Return structured JSON output that follows the exact format requested.` 
        },
        { 
          role: "user", 
          content: prompt 
        }
      ],
      response_format: { type: "json_object" },
      temperature: 0.2,
      max_tokens: 4000
    });
    
    // Parse the API response with robust handling for Markdown formatting
    const raw = (response.choices[0].message.content ?? "").trim();
    const json = raw.startsWith("{") ? raw : raw.slice(raw.indexOf("{"));
    const comparisonResults = JSON.parse(json || "{}");
    
    // Calculate some additional statistics for the frontend
    const stats = {
      totalInclusion: currentInclusionCriteria.length || 0,
      totalExclusion: currentExclusionCriteria.length || 0,
      commonInclusion: comparisonResults.commonCriteria?.inclusion?.length || 0,
      commonExclusion: comparisonResults.commonCriteria?.exclusion?.length || 0,
      uniqueInclusion: comparisonResults.uniqueCriteria?.inclusion?.length || 0,
      uniqueExclusion: comparisonResults.uniqueCriteria?.exclusion?.length || 0,
      recommendedInclusion: comparisonResults.recommendations?.inclusion?.length || 0,
      recommendedExclusion: comparisonResults.recommendations?.exclusion?.length || 0,
      totalComparisonTrials: comparisonCriteria.length
    };
    
    // Ensure we have the required structure for the frontend with fallbacks for each section
    const enhancedResults = {
      // Keep all original data from the LLM analysis
      ...comparisonResults,
      // Override statistics with our calculated values
      statistics: {
        ...comparisonResults.statistics,
        ...stats
      },
      // Add a list of the comparison trials used
      trials: comparisonCriteria.map(trial => ({
        nctId: trial.nctId,
        title: trial.title
      }))
    };
    
    console.log("Enhanced results structure has these keys:", Object.keys(enhancedResults));
    return enhancedResults;
  } catch (error) {
    console.error('Error comparing eligibility criteria:', error);
    throw new Error('Failed to compare eligibility criteria');
  }
}
