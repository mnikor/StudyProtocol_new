import { pgTable, text, serial, integer, boolean, timestamp, json } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Users table
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
  email: text("email").notNull().unique(),
  fullName: text("full_name"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Boilerplate texts table
export const boilerplateTexts = pgTable("boilerplate_texts", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  section: text("section").notNull(), // Must be one of BoilerplateSection values
  content: text("content").notNull(),
  protocolTypes: text("protocol_types").notNull(), // JSON array of protocol types
  tags: text("tags").notNull(), // JSON array of tags for filtering
  isDefault: boolean("is_default").default(false).notNull(),
  createdBy: text("created_by").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  lastModified: timestamp("last_modified").defaultNow().notNull(),
});

// Comments table
export const comments = pgTable("comments", {
  id: text("id").primaryKey(),
  protocolId: text("protocol_id").notNull(),
  designStateId: text("design_state_id").notNull(),
  userId: integer("user_id").notNull(),
  section: text("section").notNull(), // Which tab/section (synopsis, schedule, criteria, etc.)
  sectionItem: text("section_item"), // Specific item within section (endpoint_id, criterion_id, etc.)
  content: text("content").notNull(),
  status: text("status").notNull().default("open"), // open, resolved
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Protocol Types
export const protocolTypes = [
  "interventional_clinical_trial",     // Traditional RCTs
  "prospective_cohort_study",          // Non-interventional prospective
  "retrospective_cohort_study",        // Chart review type
  "secondary_data_analysis",           // Database/RWE research
  "delphi_consensus",                  // Expert consensus method
  "cross_sectional_survey",            // Survey research
  "qualitative_study",                 // Interviews, focus groups
  "mixed_methods",                     // Combined approaches
  "maic"                               // Matching-Adjusted Indirect Comparison
] as const;

export type ProtocolType = typeof protocolTypes[number];

// Boilerplate Section Types
export const boilerplateSections = [
  "study_id",
  "safety_monitoring", 
  "ethics_approval", 
  "data_management", 
  "adverse_events", 
  "quality_control",
  "statistical_methods",
  "publication_policy",
  "confidentiality",
  "protocol_compliance",
  "regulatory_considerations",
  "sample_size_justification",
  "informed_consent",
  "subject_withdrawal",
  "study_administration"
] as const;

export type BoilerplateSection = typeof boilerplateSections[number];

// Protocol Components Schema
export const protocolComponentSchema = z.object({
  designStateId: z.string(), // ID of the design state this component belongs to
  type: z.enum([
    // Generic components
    "synopsis",
    "overview",
    
    // Interventional trial components
    "schedule",
    "criteria", 
    "variables", 
    "studySchema", 
    "safetyDrugHandling",
    "statisticalAnalysisPlan",
    "protocolInputReview",
    
    // Prospective cohort components
    "cohortDefinition",
    "observationSchedule",
    "exposureAssessment",
    
    // Retrospective cohort components
    "dataSource",
    "retrospectiveCohortDefinition",
    
    // Secondary data analysis components
    "dataSourceDefinition",
    "databaseVariables",
    
    // Delphi consensus components
    "expertPanel",
    "consensusRounds",
    
    // Survey components
    "surveyInstrument",
    "populationSampling",
    
    // MAIC-specific components
    "sourceDataConfig",
    "targetStudyData",
    "matchingVariables",
    "outcomeVariables",
    "matchingAlgorithm",
    "sensitivityAnalysis"
  ]),
  data: z.any(), // The actual component data (JSON serializable)
  createdAt: z.date(),
  updatedAt: z.date(),
});

// Protocol Component Type Definition
export type ProtocolComponent = z.infer<typeof protocolComponentSchema>;

// Protocols table
export const protocols = pgTable("protocols", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  phase: text("phase").notNull(),
  indication: text("indication").notNull(),
  status: text("status").notNull().default("Draft"),
  protocolType: text("protocol_type").notNull().default("interventional_clinical_trial"),
  synopsis: text("synopsis"),
  supplementaryInfo: text("supplementary_info"), // JSON string array of supplementary information
  lastEdited: timestamp("last_edited").defaultNow().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  createdBy: text("created_by").notNull(),
  userId: integer("user_id").references(() => users.id),
  // Legacy fields - will be deprecated in favor of design-state-specific components
  tableData: text("table_data").notNull(), // JSON string of assessment schedule
  tableHeaders: text("table_headers").notNull(), // JSON string of column headers
  inclusionCriteria: text("inclusion_criteria"), // JSON string of inclusion criteria
  exclusionCriteria: text("exclusion_criteria"), // JSON string of exclusion criteria
  dataVariables: text("data_variables"), // JSON string of data variables
  studySchema: text("study_schema"), // JSON string of study schema diagram data
  statisticalAnalysisPlan: text("statistical_analysis_plan"), // JSON string of statistical analysis plan
  generatedProtocol: text("generated_protocol"), // JSON string of generated protocol sections
  overview: json("overview"), // JSON object containing protocol overview details
  designStates: json("design_states").default([]), // Array of design states for the protocol
  activeDesignState: text("active_design_state"), // ID of the currently active design state
  // New field to store components by design state
  components: json("components").default([]), // Array of protocol components tied to design states
});

// Insert schemas using zod
export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
  email: true,
  fullName: true,
});

// Insert schema for boilerplate texts
export const insertBoilerplateTextSchema = createInsertSchema(boilerplateTexts).pick({
  id: true, 
  title: true,
  section: true,
  content: true,
  protocolTypes: true,
  tags: true,
  isDefault: true,
  createdBy: true,
});

export const insertProtocolSchema = createInsertSchema(protocols).pick({
  id: true,
  title: true,
  phase: true,
  indication: true,
  status: true,
  protocolType: true,
  synopsis: true,
  supplementaryInfo: true,
  createdBy: true,
  userId: true,
  tableData: true,
  tableHeaders: true,
  inclusionCriteria: true,
  exclusionCriteria: true,
  dataVariables: true,
  studySchema: true,
  statisticalAnalysisPlan: true,
  generatedProtocol: true,
  overview: true,
  designStates: true,
  activeDesignState: true,
  components: true,
});

export const insertCommentSchema = createInsertSchema(comments).pick({
  id: true,
  protocolId: true,
  designStateId: true,
  userId: true,
  section: true,
  sectionItem: true,
  content: true,
  status: true,
});

// Generated protocol schema for AI generation
export const generateProtocolSchema = z.object({
  synopsis: z.string().min(10, "Synopsis must be at least 10 characters long"),
  supplementaryInfo: z.array(z.string()).optional(),
  protocolType: z.enum([
    "interventional_clinical_trial",
    "prospective_cohort_study",
    "retrospective_cohort_study",
    "secondary_data_analysis",
    "delphi_consensus",
    "cross_sectional_survey",
    "qualitative_study",
    "mixed_methods",
    "maic"
  ]).optional(),
});

// Component schemas for prospective cohort studies
export const cohortDefinitionSchema = z.object({
  population: z.string().describe("Target population description"),
  exposureGroups: z.array(z.object({
    id: z.string(),
    name: z.string(),
    definition: z.string(),
    expectedSize: z.number().optional(),
  })),
  comparisonStrategy: z.string(),
  followupDuration: z.object({
    value: z.number(),
    unit: z.enum(["days", "weeks", "months", "years"]),
    rationale: z.string()
  }),
  recruitmentSource: z.array(z.string()),
  recruitmentApproach: z.string(),
  retentionStrategy: z.string().optional()
});

export const observationScheduleSchema = z.object({
  baselineAssessment: z.object({
    timing: z.string(),
    measurements: z.array(z.object({
      name: z.string(),
      method: z.string(),
      rationale: z.string().optional()
    }))
  }),
  followupAssessments: z.array(z.object({
    id: z.string(),
    timing: z.string(),
    window: z.string().optional(),
    measurements: z.array(z.object({
      name: z.string(),
      method: z.string(),
      rationale: z.string().optional()
    }))
  })),
  unscheduledAssessments: z.array(z.object({
    trigger: z.string(),
    measurements: z.array(z.string())
  })).optional(),
  endOfStudyAssessment: z.object({
    timing: z.string(),
    measurements: z.array(z.string())
  }).optional()
});

export const exposureAssessmentSchema = z.object({
  primaryExposure: z.object({
    name: z.string(),
    definition: z.string(),
    measurementMethod: z.string(),
    frequency: z.string(),
    validation: z.string().optional()
  }),
  secondaryExposures: z.array(z.object({
    name: z.string(),
    definition: z.string(),
    measurementMethod: z.string(),
    rationale: z.string().optional()
  })).optional(),
  potentialConfounders: z.array(z.object({
    name: z.string(),
    relationship: z.string(),
    measurementMethod: z.string()
  })),
  exposureTimeline: z.string().optional()
});

// Component schemas for retrospective cohort studies
export const dataSourceSchema = z.object({
  sources: z.array(z.object({
    name: z.string(),
    type: z.enum(["medical_records", "claims", "registry", "other"]),
    timeframe: z.object({
      startDate: z.string(),
      endDate: z.string(),
      rationale: z.string().optional()
    }),
    accessApprovals: z.array(z.string()).optional()
  })),
  
  dataExtractionProcess: z.object({
    method: z.enum(["manual", "automated", "hybrid"]),
    extractors: z.string(), // Description of who extracts
    validation: z.string(), // Validation approach
    reconciliation: z.string().optional() // How discrepancies are handled
  }),
  
  dataQualityAssessment: z.string(),
  missingDataDescription: z.string()
});

export const retrospectiveCohortDefinitionSchema = z.object({
  indexEvent: z.object({
    definition: z.string(),
    identification: z.string(), // How it's identified in records
    validationCriteria: z.string().optional()
  }),
  
  lookback: z.object({
    period: z.string(), // e.g., "12 months pre-index"
    purpose: z.string() // Why this lookback period
  }),
  
  followup: z.object({
    period: z.string(), // e.g., "24 months post-index"
    censoring: z.array(z.object({
      event: z.string(),
      handling: z.string()
    }))
  }),
  
  exposureGroups: z.array(z.object({
    name: z.string(),
    definition: z.string(),
    identificationCriteria: z.array(z.string())
  })),
  
  exposureAssignment: z.object({
    timing: z.string(),
    method: z.string()
  })
});

// Base study parameter schemas for different protocol types

// Shared population schema used in most protocol types
const basePopulationSchema = z.object({
  ageRange: z.object({
    min: z.number(),
    max: z.number(),
  }),
  gender: z.enum(["male", "female", "both"]),
  healthStatus: z.string(),
  keyInclusion: z.array(z.string()),
  keyExclusion: z.array(z.string()),
});

// Shared outcomes schema used in most protocol types
const baseOutcomesSchema = z.object({
  primary: z.array(z.object({
    name: z.string(),
    description: z.string(),
    timepoint: z.string(),
    // Added measurement details
    measurement: z.string().nullable().optional(),         // How the outcome is measured (e.g., PFS, OS, RECIST)
    method: z.string().nullable().optional(),              // Method of assessment (e.g., CT scan, questionnaire)
    scale: z.string().nullable().optional(),               // Scale used (e.g., Likert scale, FACT-G)
    statisticalApproach: z.string().nullable().optional(), // Statistical approach (e.g., Cox regression)
    // Protocol-specific fields
    instrument: z.string().nullable().optional(),          // For surveys - instrument used 
    dataSource: z.string().nullable().optional(),          // For retrospective studies - source of outcome data
    consensusThreshold: z.string().nullable().optional(),  // For Delphi - threshold for consensus
    consensusProcess: z.string().nullable().optional(),    // For Delphi - process for reaching consensus
  })),
  secondary: z.array(z.object({
    name: z.string(),
    description: z.string(),
    timepoint: z.string(),
    // Added measurement details
    measurement: z.string().nullable().optional(),
    method: z.string().nullable().optional(),
    scale: z.string().nullable().optional(),
    statisticalApproach: z.string().nullable().optional(),
    // Protocol-specific fields
    instrument: z.string().nullable().optional(),
    dataSource: z.string().nullable().optional(),
    consensusThreshold: z.string().nullable().optional(),
    consensusProcess: z.string().nullable().optional(),
  })).optional(),
});

// Data source schema for secondary data studies
const secondaryDataSourceSchema = z.object({
  name: z.string(),
  type: z.string(),
  timePeriod: z.string().optional(),
  geographicScope: z.string().optional()
});

// Base timing schema
const baseTimingSchema = z.object({
  studyDuration: z.string(),
  visitFrequency: z.string().optional(),
  followUpPeriod: z.string().optional(),
  dataCutoffs: z.string().optional(),
});

// Intervention/exposure schema
const interventionSchema = z.object({
  name: z.string(),
  description: z.string(),
  dosage: z.string().optional(),
  duration: z.string().optional(),
  frequency: z.string().optional(),
});

// Base design schema
const baseDesignSchema = z.object({
  type: z.enum(["randomized", "non-randomized", "observational", "single-arm", "consensus"]),
  blinding: z.enum(["open-label", "single-blind", "double-blind", "triple-blind", "none"]).optional(),
  allocation: z.enum(["parallel", "crossover", "factorial", "sequential", "none"]).optional(),
  controlType: z.enum(["placebo", "active", "no-treatment", "historical", "none"]).optional(),
  adaptiveElements: z.boolean().optional(),
  phaseLevels: z.array(z.string()).optional(),
  analyticalApproach: z.string().optional(),
  exposureMeasurement: z.string().optional(),
  feedbackMethod: z.string().optional(),
});

// Protocol type specific parameter schemas
const interventionalTrialParamsSchema = z.object({
  population: basePopulationSchema,
  intervention: interventionSchema,
  comparator: z.object({
    type: z.enum(["placebo", "active", "standard-of-care", "none"]),
    name: z.string().optional(),
    description: z.string().optional(),
  }),
  outcomes: baseOutcomesSchema,
  timing: baseTimingSchema,
  design: baseDesignSchema,
});

const secondaryDataParamsSchema = z.object({
  population: basePopulationSchema,
  dataSource: secondaryDataSourceSchema,
  outcomes: baseOutcomesSchema,
  timing: baseTimingSchema.omit({ visitFrequency: true }),
  design: baseDesignSchema.omit({ blinding: true }),
});

const prospectiveCohortParamsSchema = z.object({
  population: basePopulationSchema,
  // Use intervention field for exposure in cohort studies
  intervention: interventionSchema,
  outcomes: baseOutcomesSchema,
  timing: baseTimingSchema,
  design: baseDesignSchema.omit({ blinding: true }),
});

const delphiConsensusParamsSchema = z.object({
  population: z.object({
    expertPanel: z.object({
      size: z.number(),
      composition: z.string(),
    }),
    keyInclusion: z.array(z.string()),
    keyExclusion: z.array(z.string()),
  }),
  consensusMethod: z.object({
    name: z.string(),
    rounds: z.number(),
    scoringSystem: z.string(),
    threshold: z.string(),
  }),
  outcomes: z.object({
    consensusTarget: z.string(),
    statementCount: z.number(),
  }),
  timing: z.object({
    studyDuration: z.string(),
    roundDuration: z.string(),
  }),
  design: z.object({
    type: z.literal("consensus"),
    feedbackMethod: z.string(),
  }),
});

// MAIC specific schemas
export const sourceDataConfigSchema = z.object({
  datasetName: z.string().describe("Name of the source IPD dataset"),
  datasetDescription: z.string().describe("Brief description of the source dataset"),
  datasetSize: z.number().describe("Number of patients in the source dataset"),
  treatmentArms: z.array(z.object({
    id: z.string(),
    name: z.string().describe("Treatment arm name"),
    description: z.string().describe("Treatment arm description"),
    sampleSize: z.number().describe("Number of patients in this arm")
  })),
  dataFormat: z.enum(["csv", "sas", "stata", "r", "other"]).describe("Format of the source data"),
  dataAccess: z.object({
    hasFullAccess: z.boolean().describe("Whether full patient-level data is available"),
    restrictions: z.string().describe("Any restrictions on data use"),
    dataOwner: z.string().describe("Owner/sponsor of the dataset")
  })
});

export const targetStudyDataSchema = z.object({
  studyName: z.string().describe("Name of the target published study"),
  citation: z.string().describe("Publication citation"),
  publicationDate: z.string().describe("Date of publication"),
  treatmentArms: z.array(z.object({
    id: z.string(),
    name: z.string().describe("Treatment arm name"),
    description: z.string().describe("Treatment arm description"),
    sampleSize: z.number().describe("Reported sample size of this arm")
  })),
  populationDescription: z.string().describe("Description of the study population"),
  baselineCharacteristics: z.array(z.object({
    variable: z.string().describe("Name of the baseline characteristic"),
    value: z.string().describe("Aggregate value reported"),
    measure: z.enum(["mean", "median", "proportion", "count"]).describe("Statistical measure"),
    dispersion: z.string().optional().describe("Measure of dispersion (SD, IQR, etc.)")
  })),
  extractionNotes: z.string().optional().describe("Notes on the data extraction process")
});

export const matchingVariablesSchema = z.object({
  baselineCharacteristics: z.array(z.object({
    variable: z.string().describe("Name of matching variable"),
    importance: z.enum(["critical", "important", "helpful"]).describe("Importance of this variable for matching"),
    sourceDataMapping: z.string().describe("Field name in source dataset"),
    targetValue: z.string().describe("Value to match from target study"),
    transformationNeeded: z.boolean().describe("Whether transformation is needed"),
    transformation: z.string().optional().describe("Description of transformation if needed")
  })),
  effectModifiers: z.array(z.object({
    variable: z.string().describe("Name of effect modifier"),
    rationale: z.string().describe("Rationale for including this variable"),
    sourceDataMapping: z.string().describe("Field name in source dataset"),
    targetValue: z.string().describe("Value from target study")
  })).optional(),
  weightingApproach: z.enum([
    "entropy_balancing", 
    "propensity_score", 
    "method_of_moments"
  ]).describe("Method used for calculating weights")
});

export const maicOutcomeVariablesSchema = z.object({
  primaryOutcomes: z.array(z.object({
    name: z.string().describe("Name of primary outcome"),
    sourceDataMapping: z.string().describe("Field name in source dataset"),
    targetDataPoint: z.object({
      point: z.number().describe("Point estimate from target study"),
      lowerCI: z.number().describe("Lower confidence interval"),
      upperCI: z.number().describe("Upper confidence interval"),
      measure: z.enum(["hazard_ratio", "odds_ratio", "risk_ratio", "mean_difference"]).describe("Measure type")
    }),
    analysisMethod: z.string().describe("Statistical method for comparison")
  })),
  secondaryOutcomes: z.array(z.object({
    name: z.string().describe("Name of secondary outcome"),
    sourceDataMapping: z.string().describe("Field name in source dataset"),
    targetDataPoint: z.object({
      point: z.number().describe("Point estimate from target study"),
      lowerCI: z.number().optional().describe("Lower confidence interval"),
      upperCI: z.number().optional().describe("Upper confidence interval"),
      measure: z.enum(["hazard_ratio", "odds_ratio", "risk_ratio", "mean_difference", "proportion"]).describe("Measure type")
    }),
    analysisMethod: z.string().describe("Statistical method for comparison")
  })).optional()
});

export const matchingAlgorithmSchema = z.object({
  method: z.enum([
    "entropy_balancing",
    "propensity_score_weighting",
    "method_of_moments",
    "simulated_treatment_comparison"
  ]).describe("Primary matching/weighting method"),
  parameters: z.object({
    convergenceCriteria: z.number().optional().describe("Convergence criteria for algorithm"),
    maxIterations: z.number().optional().describe("Maximum number of iterations"),
    tolerance: z.number().optional().describe("Tolerance level for balance"),
    weightConstraints: z.object({
      minWeight: z.number().optional().describe("Minimum allowed weight"),
      maxWeight: z.number().optional().describe("Maximum allowed weight")
    }).optional()
  }),
  diagnostics: z.object({
    balanceMetrics: z.array(z.enum([
      "standardized_mean_difference",
      "variance_ratio",
      "kolmogorov_smirnov",
      "effective_sample_size"
    ])).describe("Metrics to assess balance"),
    acceptableThreshold: z.number().describe("Threshold for acceptable balance (e.g., SMD < 0.1)")
  })
});

export const sensitivityAnalysisSchema = z.object({
  scenarios: z.array(z.object({
    id: z.string(),
    name: z.string().describe("Name of sensitivity analysis scenario"),
    description: z.string().describe("Description of this scenario"),
    modifications: z.array(z.object({
      parameter: z.string().describe("Parameter being modified"),
      baseline: z.string().describe("Baseline value"),
      modified: z.string().describe("Modified value for this scenario")
    }))
  })),
  unmeasuredConfounding: z.object({
    eValue: z.boolean().describe("Whether to calculate E-value"),
    tippingPointAnalysis: z.boolean().describe("Whether to perform tipping point analysis")
  }).optional()
});

// Schema for overall MAIC parameters
export const maicParamsSchema = z.object({
  sourceData: z.object({
    dataset: z.string().describe("Name of source dataset with IPD"),
    population: z.string().describe("Description of source population"),
    interventionArm: z.string().describe("Name of intervention arm in source")
  }),
  targetStudy: z.object({
    study: z.string().describe("Name of target published study"),
    population: z.string().describe("Description of target population"),
    comparisonArm: z.string().describe("Name of comparison arm in target")
  }),
  matchingApproach: z.object({
    method: z.enum(["entropy_balancing", "propensity_score", "method_of_moments"]),
    variables: z.array(z.string()).describe("Key matching variables"),
    weightTruncation: z.boolean().describe("Whether to truncate extreme weights")
  }),
  outcomes: z.object({
    primary: z.array(z.object({
      name: z.string(),
      measure: z.enum(["hazard_ratio", "odds_ratio", "risk_ratio", "mean_difference"])
    })),
    secondary: z.array(z.object({
      name: z.string(),
      measure: z.enum(["hazard_ratio", "odds_ratio", "risk_ratio", "mean_difference", "proportion"])
    })).optional()
  }),
  analyses: z.object({
    effectiveSampleSize: z.boolean().describe("Whether to calculate effective sample size"),
    bootstrapCI: z.boolean().describe("Whether to use bootstrap for confidence intervals"),
    sensitivityAnalyses: z.array(z.string()).describe("List of sensitivity analyses to perform")
  })
});

// Enhanced Sample Size schema with support for different allocation approaches
export const sampleSizeSchema = z.object({
  total: z.number().describe("Total study sample size"),
  approach: z.enum(["equal_arms", "ratio_based", "custom_arms"]).optional().describe("Sample size allocation approach"),
  
  // For backward compatibility
  perArm: z.number().optional().describe("Sample size per arm (for equal_arms approach)"),
  
  // For ratio-based approach
  randomizationRatio: z.string().optional().describe("Randomization ratio like '1:1', '2:1:1', etc."),
  
  // For custom approach
  arms: z.array(z.object({
    id: z.string().describe("Unique identifier for the arm"),
    name: z.string().describe("Name of the arm (e.g., 'Control', 'Treatment A')"),
    plannedN: z.number().describe("Planned sample size for this arm"),
    percentage: z.number().describe("Percentage of total sample (auto-calculated)"),
  })).optional().describe("Custom arm definitions with specific sample sizes"),
  
  justification: z.string().describe("Sample size justification and rationale"),
});

// Define Design State schema with enhanced protocol type support
export const designStateSchema = z.object({
  id: z.string(),
  label: z.string(),
  timestamp: z.date(),
  synopsis: z.string(),
  protocolType: z.enum(protocolTypes).optional(),
  boilerplateSelections: z.record(z.enum(boilerplateSections), z.string().nullable()).optional(),
  // Use a flexible schema for study parameters, which will contain different fields based on protocol type
  studyParameters: z.object({
    // Common fields for all protocol types
    population: z.object({
      ageRange: z.object({
        min: z.number(),
        max: z.number(),
      }),
      gender: z.enum(["male", "female", "both"]),
      healthStatus: z.string(),
      keyInclusion: z.array(z.string()),
      keyExclusion: z.array(z.string()),
    }),
    
    // Intervention fields (used in interventional trials)
    intervention: z.object({
      name: z.string(),
      description: z.string(),
      dosage: z.string().optional(),
      duration: z.string().optional(),
      frequency: z.string().optional(),
    }).optional(),
    
    // Comparator fields (used in interventional trials)
    comparator: z.object({
      type: z.enum(["placebo", "active", "standard-of-care", "none"]),
      name: z.string().optional(),
      description: z.string().optional(),
    }).optional(),
    
    // Data source fields (used in secondary data analysis)
    dataSource: z.object({
      name: z.string(),
      type: z.string(),
      timePeriod: z.string().optional(),
      geographicScope: z.string().optional()
    }).optional(),
    
    // Common field for outcomes
    outcomes: z.object({
      primary: z.array(z.object({
        name: z.string(),
        description: z.string(),
        timepoint: z.string(),
        // Added measurement details
        measurement: z.string().nullable().optional(),         // How the outcome is measured (e.g., PFS, OS, RECIST)
        method: z.string().nullable().optional(),              // Method of assessment (e.g., CT scan, questionnaire)
        scale: z.string().nullable().optional(),               // Scale used (e.g., Likert scale, FACT-G)
        statisticalApproach: z.string().nullable().optional(), // Statistical approach (e.g., Cox regression)
        // Protocol-specific fields
        instrument: z.string().nullable().optional(),          // For surveys - instrument used 
        dataSource: z.string().nullable().optional(),          // For retrospective studies - source of outcome data
        consensusThreshold: z.string().nullable().optional(),  // For Delphi - threshold for consensus
        consensusProcess: z.string().nullable().optional(),    // For Delphi - process for reaching consensus
      })),
      secondary: z.array(z.object({
        name: z.string(),
        description: z.string(),
        timepoint: z.string(),
        // Added measurement details
        measurement: z.string().nullable().optional(),
        method: z.string().nullable().optional(),
        scale: z.string().nullable().optional(),
        statisticalApproach: z.string().nullable().optional(),
        // Protocol-specific fields
        instrument: z.string().nullable().optional(),
        dataSource: z.string().nullable().optional(),
        consensusThreshold: z.string().nullable().optional(),
        consensusProcess: z.string().nullable().optional(),
      })).optional(),
    }),
    
    // Common fields for timing, with optional fields for different study types
    timing: z.object({
      studyDuration: z.string(),
      visitFrequency: z.string().optional(),
      followUpPeriod: z.string().optional(),
      dataCutoffs: z.string().optional(),
      roundDuration: z.string().optional(),
    }),
    
    // Common fields for design, with additional optional fields for different study types
    design: z.object({
      type: z.enum(["randomized", "non-randomized", "observational", "single-arm", "consensus"]),
      blinding: z.enum(["open-label", "single-blind", "double-blind", "triple-blind", "none"]).optional(),
      allocation: z.enum(["parallel", "crossover", "factorial", "sequential", "none"]).optional(),
      controlType: z.enum(["placebo", "active", "no-treatment", "historical", "none"]).optional(),
      adaptiveElements: z.boolean().optional(),
      phaseLevels: z.array(z.string()).optional(),
      analyticalApproach: z.string().optional(),
      exposureMeasurement: z.string().optional(),
      feedbackMethod: z.string().optional(),
    }),
    
    // Consensus method fields (used in Delphi consensus studies)
    consensusMethod: z.object({
      name: z.string(),
      rounds: z.number(),
      scoringSystem: z.string(),
      threshold: z.string(),
    }).optional(),
    
    // Expert panel fields (used in Delphi consensus studies)
    expertPanel: z.object({
      size: z.number(),
      composition: z.string(),
    }).optional(),
    
    // MAIC-specific fields
    sourceData: z.object({
      dataset: z.string().describe("Name of source dataset with IPD"),
      population: z.string().describe("Description of source population"),
      interventionArm: z.string().describe("Name of intervention arm in source")
    }).optional(),
    
    targetStudy: z.object({
      study: z.string().describe("Name of target published study"),
      population: z.string().describe("Description of target population"),
      comparisonArm: z.string().describe("Name of comparison arm in target")
    }).optional(),
    
    matchingApproach: z.object({
      method: z.enum(["entropy_balancing", "propensity_score", "method_of_moments"]),
      variables: z.array(z.string()).describe("Key matching variables"),
      weightTruncation: z.boolean().describe("Whether to truncate extreme weights")
    }).optional(),
    
    // Sample size planning (used in most study types)
    sampleSize: sampleSizeSchema.optional(),
  }),
  
  // Impact fields
  assessmentImpact: z.object({
    addedAssessments: z.array(z.object({
      name: z.string(),
      timepoints: z.array(z.string()),
      reason: z.string(),
    })).optional(),
    removedAssessments: z.array(z.object({
      name: z.string(),
      reason: z.string(),
    })).optional(),
    modifiedFrequency: z.array(z.object({
      name: z.string(),
      oldFrequency: z.string(),
      newFrequency: z.string(),
      reason: z.string(),
    })).optional(),
  }).optional(),
  
  criteriaImpact: z.object({
    addedInclusion: z.array(z.object({
      criterion: z.string(),
      reason: z.string(),
    })).optional(),
    removedInclusion: z.array(z.object({
      criterion: z.string(),
      reason: z.string(),
    })).optional(),
    addedExclusion: z.array(z.object({
      criterion: z.string(),
      reason: z.string(),
    })).optional(),
    removedExclusion: z.array(z.object({
      criterion: z.string(),
      reason: z.string(),
    })).optional(),
  }).optional(),
  
  variablesImpact: z.object({
    addedVariables: z.array(z.object({
      name: z.string(),
      dataType: z.string(),
      source: z.string(),
      reason: z.string(),
    })).optional(),
    removedVariables: z.array(z.object({
      name: z.string(),
      reason: z.string(),
    })).optional(),
  }).optional(),
  
  costImpact: z.object({
    percentChange: z.number(),
    areaBreakdown: z.record(z.number()),
    explanation: z.string(),
  }).optional(),
  
  feasibilityMetrics: z.object({
    // Standard study feasibility metrics
    recruitmentSpeedImpact: z.number().optional(),
    recruitmentRationale: z.string().optional(), 
    operationalComplexity: z.number().optional(),
    complexityRationale: z.string().optional(),
    participantBurden: z.number().optional(),
    participantBurdenRationale: z.string().optional(),
    participantRationale: z.string().optional(),
    siteRequirements: z.string().optional(),
    
    // MAIC-specific feasibility metrics
    dataAvailability: z.number().optional(),
    dataAvailabilityRationale: z.string().optional(),
    matchingVariableOverlap: z.number().optional(), 
    matchingVariableOverlapRationale: z.string().optional(),
    statisticalPrecision: z.number().optional(),
    statisticalPrecisionRationale: z.string().optional(),
    publicationBiasRisk: z.number().optional(),
    publicationBiasRiskRationale: z.string().optional(),
    
    // Common fields
    overallScore: z.number().optional(),
    explanation: z.string().optional(),
  }).optional(),
  
  methodologyQuality: z.object({
    designAppropriateness: z.number().optional(),
    endpointSelection: z.number().optional(),
    statisticalPower: z.number().optional(),
    controlArmSelection: z.number().optional(),
    explanation: z.string().optional(),
    alternativeControl: z.object({
      type: z.string().optional(),
      implications: z.string().optional(),
      scientificImpact: z.string().optional(),
      operationalImpact: z.string().optional(),
      regulatoryImpact: z.string().optional(),
    }).optional(),
  }).optional(),
  
  realWorldImpact: z.object({
    labelingChange: z.number().optional(),
    guidelinesInclusion: z.number().optional(),
    clinicalPracticeChange: z.number().optional(),
    explanation: z.string().optional(),
    marketAccess: z.string().optional(),
    reimbursementPotential: z.string().optional(),
  }).optional(),
  
  scientificValue: z.object({
    innovationScore: z.number().optional(),
    innovationRationale: z.string().optional(),
    knowledgeGapRelevance: z.number().optional(),
    knowledgeGapRationale: z.string().optional(),
    potentialImpact: z.number().optional(),
    potentialImpactRationale: z.string().optional(),
    evidenceQuality: z.number().optional(),
    evidenceQualityRationale: z.string().optional(),
  }).optional(),
  
  clinicalRelevance: z.object({
    patientCenteredOutcomes: z.number().optional(),
    patientCenteredRationale: z.string().optional(),
    translationalPotential: z.number().optional(),
    translationalRationale: z.string().optional(),
    unmetNeedAlignment: z.number().optional(),
    unmetNeedRationale: z.string().optional(),
    adoptionLikelihood: z.number().optional(),
    adoptionRationale: z.string().optional(),
  }).optional(),
  
  regulatoryConsiderations: z.array(z.string()).optional(),
});

// Protocol Type Configuration
export const protocolTypeConfig = {
  interventional_clinical_trial: {
    label: "Interventional Clinical Trial",
    description: "Traditional randomized controlled trials with interventions",
    requiredComponents: ["synopsis", "schedule", "criteria", "studySchema", "statisticalAnalysisPlan"],
    optionalComponents: ["variables"]
  },
  prospective_cohort_study: {
    label: "Observational Prospective Cohort",
    description: "Non-interventional studies following subjects forward in time",
    requiredComponents: ["synopsis", "cohortDefinition", "observationSchedule", "criteria", "statisticalAnalysisPlan"],
    optionalComponents: ["exposureAssessment", "variables", "studySchema"]
  },
  retrospective_cohort_study: {
    label: "Retrospective Cohort Study",
    description: "Studies examining historical data and outcomes that have already occurred",
    requiredComponents: ["synopsis", "dataSource", "retrospectiveCohortDefinition", "variables", "statisticalAnalysisPlan"],
    optionalComponents: ["studySchema"]
  },
  secondary_data_analysis: {
    label: "Secondary Data Analysis/RWE",
    description: "Analysis of existing databases and registries",
    requiredComponents: ["synopsis", "dataSourceDefinition", "databaseVariables", "statisticalAnalysisPlan"],
    optionalComponents: ["studySchema", "criteria"]
  },
  delphi_consensus: {
    label: "Delphi Consensus Study",
    description: "Structured communication technique for expert consensus",
    requiredComponents: ["synopsis", "expertPanel", "consensusRounds", "statisticalAnalysisPlan"],
    optionalComponents: []
  },
  cross_sectional_survey: {
    label: "Cross-Sectional Survey",
    description: "One-time survey of a population",
    requiredComponents: ["synopsis", "surveyInstrument", "populationSampling", "statisticalAnalysisPlan"],
    optionalComponents: []
  },
  qualitative_study: {
    label: "Qualitative Study",
    description: "Interviews, focus groups, or observational studies",
    requiredComponents: ["synopsis", "populationSampling", "dataVariables"],
    optionalComponents: []
  },
  mixed_methods: {
    label: "Mixed Methods Study",
    description: "Combination of qualitative and quantitative approaches",
    requiredComponents: ["synopsis"],
    optionalComponents: ["schedule", "criteria", "variables", "studySchema", "statisticalAnalysisPlan", 
                         "cohortDefinition", "observationSchedule", "exposureAssessment",
                         "dataSource", "retrospectiveCohortDefinition", "dataSourceDefinition",
                         "expertPanel", "consensusRounds", "surveyInstrument", "populationSampling"]
  },
  maic: {
    label: "Matching-Adjusted Indirect Comparison (MAIC)",
    description: "Statistical technique for comparing treatments across different studies when direct comparison is not possible",
    requiredComponents: ["synopsis", "sourceDataConfig", "targetStudyData", "matchingVariables", "matchingAlgorithm"],
    optionalComponents: ["sensitivityAnalysis", "studySchema"]
  }
} as const;

// Type for component configuration
export type ProtocolTypeConfig = typeof protocolTypeConfig;

// Export types
export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;

export type BoilerplateText = typeof boilerplateTexts.$inferSelect;
export type InsertBoilerplateText = z.infer<typeof insertBoilerplateTextSchema>;

export type Comment = typeof comments.$inferSelect;
export type InsertComment = z.infer<typeof insertCommentSchema>;

export type Protocol = typeof protocols.$inferSelect;
export type InsertProtocol = z.infer<typeof insertProtocolSchema>;
export type GenerateProtocol = z.infer<typeof generateProtocolSchema>;
export type DesignState = z.infer<typeof designStateSchema>;
export type SampleSize = z.infer<typeof sampleSizeSchema>;

// Export component types for all study designs
export type CohortDefinition = z.infer<typeof cohortDefinitionSchema>;
export type ObservationSchedule = z.infer<typeof observationScheduleSchema>;
export type ExposureAssessment = z.infer<typeof exposureAssessmentSchema>;
export type DataSource = z.infer<typeof dataSourceSchema>;
export type RetrospectiveCohortDefinition = z.infer<typeof retrospectiveCohortDefinitionSchema>;
