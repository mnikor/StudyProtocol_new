// Semantic meta-model for study schema entities
export type StudyEntity =
  | { kind: 'Phase'; id: string; name: string; span?: [number, number]; description?: string }
  | { kind: 'Arm'; id: string; name: string; color?: string; description?: string }
  | { kind: 'Visit'; id: string; armId?: string; name: string; day?: number; window?: string; description?: string }
  | { kind: 'Procedure'; id: string; visitId: string; type: 'Lab'|'Imaging'|'PRO'|'PK'|'Biopsy'|'Safety'|'Efficacy'; details?: string }
  | { kind: 'Randomization'; id: string; ratio: string; stratFactors?: string[]; blinded?: boolean; description?: string }
  | { kind: 'Endpoint'; id: string; name: string; role: 'Primary'|'Key Secondary'|'Secondary'|'Exploratory'; measuredAtVisitIds: string[]; timepoint?: string }
  | { kind: 'Count'; id: string; label: string; n: number; relatesToId?: string; description?: string }
  // RWE specifics
  | { kind: 'DataSource'; id: string; name: string; type?: string; timeframe?: string; description?: string }
  | { kind: 'CohortStep'; id: string; label: string; n?: number; criteria?: string; description?: string }
  | { kind: 'Index'; id: string; label: string; definition: string; description?: string }
  | { kind: 'ConfoundingControl'; id: string; method: 'PSM'|'IPTW'|'AIPW'|'Stratification'|'Adjustment'; details?: string; description?: string }
  // Observational specifics
  | { kind: 'Exposure'; id: string; name: string; definition?: string; ascertainment?: string; description?: string }
  | { kind: 'Outcome'; id: string; name: string; definition?: string; ascertainment?: string; timepoint?: string; description?: string }
  // Survey/Delphi specifics
  | { kind: 'PanelRecruitment'; id: string; criteria?: string; size?: number; description?: string }
  | { kind: 'DelphiRound'; id: string; roundNumber: number; threshold?: string; description?: string }
  | { kind: 'Survey'; id: string; instrument?: string; mode?: string; description?: string }
  | { kind: 'Analysis'; id: string; name: string; method?: string; description?: string };

export interface StudySchemaModel {
  entities: StudyEntity[];
  version: number;
  createdAt: string;
  protocolType?: string;
  metadata?: {
    arms?: { id: string; name: string; color?: string }[];
    timeline?: { phases: { name: string; startDay: number; endDay?: number }[] };
    visits?: { id: string; name: string; day: number; window?: string; armIds?: string[] }[];
  };
}

export interface StudySchemaVersion {
  id: string;
  createdAt: string;
  model: StudySchemaModel;
  nodes: any[];
  edges: any[];
  commentMap?: Record<string, any>;
}

// Connection rules for different study types
export const CONNECTION_RULES: Record<string, string[]> = {
  // Interventional trial connections
  studyPhase: ['screening', 'randomization', 'treatment', 'assessment', 'endpoint'],
  screening: ['randomization', 'treatment', 'assessment'],
  randomization: ['treatment', 'assessment'],
  treatment: ['assessment', 'endpoint', 'treatment'],
  assessment: ['endpoint', 'assessment', 'treatment'],
  endpoint: [],
  
  // Observational study connections
  enrollment: ['exposure', 'outcome', 'assessment'],
  exposure: ['outcome', 'assessment'],
  outcome: [],
  recruitment: ['enrollment', 'exposure'],
  
  // Secondary data analysis connections
  dataSource: ['cohort', 'dataExtraction'],
  cohort: ['dataExtraction', 'analysis'],
  dataExtraction: ['analysis', 'outcome'],
  analysis: ['outcome'],
  
  // Survey connections
  survey: ['dataCollection', 'analysis'],
  dataCollection: ['analysis'],
  
  // Delphi connections
  panelRecruitment: ['statementDevelopment'],
  statementDevelopment: ['delphiRound'],
  delphiRound: ['delphiRound', 'consensusAnalysis'],
  consensusAnalysis: []
};

// Node type definitions for different protocol types
export const PROTOCOL_TYPE_NODES: Record<string, string[]> = {
  interventional_clinical_trial: ['studyPhase', 'screening', 'randomization', 'treatment', 'assessment', 'endpoint'],
  dose_escalation_study: ['studyPhase', 'screening', 'treatment', 'assessment', 'endpoint'],
  prospective_cohort_study: ['studyPhase', 'recruitment', 'enrollment', 'exposure', 'assessment', 'outcome'],
  retrospective_cohort_study: ['studyPhase', 'dataSource', 'cohort', 'exposure', 'outcome'],
  secondary_data_analysis: ['dataSource', 'cohort', 'dataExtraction', 'analysis', 'outcome'],
  cross_sectional_survey: ['studyPhase', 'survey', 'dataCollection', 'analysis'],
  qualitative_study: ['studyPhase', 'survey', 'dataCollection', 'analysis'],
  delphi_consensus: ['panelRecruitment', 'statementDevelopment', 'delphiRound', 'consensusAnalysis'],
  maic: ['dataSource', 'cohort', 'analysis', 'outcome']
};

// Node categories for better organization in the UI
export const NODE_CATEGORIES = {
  'Study Structure': ['studyPhase'],
  'Interventional Trial': ['screening', 'randomization', 'treatment', 'assessment', 'endpoint'],
  'Observational Study': ['recruitment', 'enrollment', 'exposure', 'outcome'],
  'Secondary Data Analysis': ['dataSource', 'cohort', 'dataExtraction', 'analysis'],
  'Survey/Qualitative': ['survey', 'dataCollection'],
  'Delphi Consensus': ['panelRecruitment', 'statementDevelopment', 'delphiRound', 'consensusAnalysis']
};

// Time-based constraints for visit scheduling
export interface VisitConstraints {
  minDay?: number;
  maxDay?: number;
  relativeToVisit?: string;
  relativeOffset?: number;
  window?: string;
}

// Validation rules for study schema
export interface ValidationRule {
  id: string;
  message: string;
  severity: 'error' | 'warning' | 'info';
  check: (model: StudySchemaModel) => boolean;
}

export const VALIDATION_RULES: ValidationRule[] = [
  {
    id: 'primary-endpoint-mapped',
    message: 'Primary endpoint must be mapped to at least one assessment visit',
    severity: 'error',
    check: (model) => {
      const primaryEndpoints = model.entities.filter(e => e.kind === 'Endpoint' && e.role === 'Primary');
      return primaryEndpoints.every(ep => ep.kind === 'Endpoint' && ep.measuredAtVisitIds.length > 0);
    }
  },
  {
    id: 'randomization-before-treatment',
    message: 'Randomization should occur before treatment in interventional studies',
    severity: 'warning',
    check: (model) => {
      // This would need to check node connectivity in the actual implementation
      return true;
    }
  },
  {
    id: 'exposure-outcome-defined',
    message: 'Observational studies should define both exposure and outcome',
    severity: 'error',
    check: (model) => {
      const hasExposure = model.entities.some(e => e.kind === 'Exposure');
      const hasOutcome = model.entities.some(e => e.kind === 'Outcome');
      return hasExposure && hasOutcome;
    }
  }
];