import type { StudySchemaModel, ValidationRule } from './types';

export interface ValidationResult {
  isValid: boolean;
  errors: ValidationMessage[];
  warnings: ValidationMessage[];
  info: ValidationMessage[];
}

export interface ValidationMessage {
  id: string;
  message: string;
  severity: 'error' | 'warning' | 'info';
  entityId?: string;
}

/**
 * Validate study schema model against rules
 */
export function validateStudySchema(model: StudySchemaModel): ValidationResult {
  const errors: ValidationMessage[] = [];
  const warnings: ValidationMessage[] = [];
  const info: ValidationMessage[] = [];
  
  // Protocol-specific validation
  const protocolType = model.protocolType;
  
  if (protocolType === 'interventional_clinical_trial' || protocolType === 'dose_escalation_study') {
    validateInterventionalStudy(model, errors, warnings, info);
  } else if (protocolType === 'prospective_cohort_study' || protocolType === 'retrospective_cohort_study') {
    validateObservationalStudy(model, errors, warnings, info);
  } else if (protocolType === 'secondary_data_analysis') {
    validateSecondaryDataStudy(model, errors, warnings, info);
  } else if (protocolType === 'delphi_consensus') {
    validateDelphiStudy(model, errors, warnings, info);
  }
  
  // General validation rules
  validateGeneralStructure(model, errors, warnings, info);
  
  return {
    isValid: errors.length === 0,
    errors,
    warnings,
    info
  };
}

function validateInterventionalStudy(
  model: StudySchemaModel, 
  errors: ValidationMessage[], 
  warnings: ValidationMessage[], 
  info: ValidationMessage[]
) {
  const entities = model.entities;
  
  // Check for primary endpoint
  const primaryEndpoints = entities.filter(e => e.kind === 'Endpoint' && e.role === 'Primary');
  if (primaryEndpoints.length === 0) {
    errors.push({
      id: 'no-primary-endpoint',
      message: 'Interventional studies must define at least one primary endpoint',
      severity: 'error'
    });
  }
  
  // Check endpoint mapping to visits
  primaryEndpoints.forEach(endpoint => {
    if (endpoint.kind === 'Endpoint' && endpoint.measuredAtVisitIds.length === 0) {
      errors.push({
        id: 'endpoint-not-mapped',
        message: `Primary endpoint "${endpoint.name}" is not mapped to any assessment visits`,
        severity: 'error',
        entityId: endpoint.kind === 'Endpoint' ? endpoint.id : undefined
      });
    }
  });
  
  // Check for randomization in randomized trials
  const hasRandomization = entities.some(e => e.kind === 'Randomization');
  const hasMultipleArms = entities.filter(e => e.kind === 'Arm').length > 1;
  
  if (hasMultipleArms && !hasRandomization) {
    warnings.push({
      id: 'multiple-arms-no-randomization',
      message: 'Multiple arms detected but no randomization process defined',
      severity: 'warning'
    });
  }
  
  // Check for treatment definition
  const hasTreatment = entities.some(e => 
    (e.kind === 'Phase' && e.name.toLowerCase().includes('treatment')) ||
    (e.kind === 'Visit' && e.name.toLowerCase().includes('treatment'))
  );
  if (!hasTreatment) {
    warnings.push({
      id: 'no-treatment-phase',
      message: 'Consider defining a treatment phase for interventional studies',
      severity: 'warning'
    });
  }
}

function validateObservationalStudy(
  model: StudySchemaModel, 
  errors: ValidationMessage[], 
  warnings: ValidationMessage[], 
  info: ValidationMessage[]
) {
  const entities = model.entities;
  
  // Check for exposure definition
  const hasExposure = entities.some(e => e.kind === 'Exposure');
  if (!hasExposure) {
    errors.push({
      id: 'no-exposure-defined',
      message: 'Observational studies must define the exposure of interest',
      severity: 'error'
    });
  }
  
  // Check for outcome definition
  const hasOutcome = entities.some(e => e.kind === 'Outcome');
  if (!hasOutcome) {
    errors.push({
      id: 'no-outcome-defined',
      message: 'Observational studies must define the outcome of interest',
      severity: 'error'
    });
  }
  
  // Check for confounding control
  const hasConfoundingControl = entities.some(e => e.kind === 'ConfoundingControl');
  if (!hasConfoundingControl) {
    warnings.push({
      id: 'no-confounding-control',
      message: 'Consider adding confounding control methods (propensity scores, stratification, etc.)',
      severity: 'warning'
    });
  }
  
  // Check for cohort definition
  const hasCohort = entities.some(e => 
    e.kind === 'CohortStep' || 
    (e.kind === 'Phase' && e.name.toLowerCase().includes('cohort')) ||
    (e.kind === 'Visit' && e.name.toLowerCase().includes('cohort'))
  );
  if (!hasCohort) {
    warnings.push({
      id: 'no-cohort-definition',
      message: 'Consider defining the study cohort and inclusion/exclusion criteria',
      severity: 'warning'
    });
  }
}

function validateSecondaryDataStudy(
  model: StudySchemaModel, 
  errors: ValidationMessage[], 
  warnings: ValidationMessage[], 
  info: ValidationMessage[]
) {
  const entities = model.entities;
  
  // Check for data source
  const hasDataSource = entities.some(e => e.kind === 'DataSource');
  if (!hasDataSource) {
    errors.push({
      id: 'no-data-source',
      message: 'Secondary data analysis must specify the data source',
      severity: 'error'
    });
  }
  
  // Check for analysis plan
  const hasAnalysis = entities.some(e => 
    e.kind === 'Analysis' || 
    (e.kind === 'Phase' && e.name.toLowerCase().includes('analysis')) ||
    (e.kind === 'Visit' && e.name.toLowerCase().includes('analysis'))
  );
  if (!hasAnalysis) {
    warnings.push({
      id: 'no-analysis-plan',
      message: 'Consider defining the analytical approach',
      severity: 'warning'
    });
  }
  
  // Check for outcome definition
  const hasOutcome = entities.some(e => e.kind === 'Outcome');
  if (!hasOutcome) {
    warnings.push({
      id: 'no-outcome-secondary',
      message: 'Consider defining the outcome measures for analysis',
      severity: 'warning'
    });
  }
}

function validateDelphiStudy(
  model: StudySchemaModel, 
  errors: ValidationMessage[], 
  warnings: ValidationMessage[], 
  info: ValidationMessage[]
) {
  const entities = model.entities;
  
  // Check for panel recruitment
  const hasPanelRecruitment = entities.some(e => e.kind === 'PanelRecruitment');
  if (!hasPanelRecruitment) {
    warnings.push({
      id: 'no-panel-recruitment',
      message: 'Consider defining the expert panel recruitment strategy',
      severity: 'warning'
    });
  }
  
  // Check for Delphi rounds
  const delphiRounds = entities.filter(e => e.kind === 'DelphiRound');
  if (delphiRounds.length === 0) {
    errors.push({
      id: 'no-delphi-rounds',
      message: 'Delphi studies must define at least one consensus round',
      severity: 'error'
    });
  }
  
  if (delphiRounds.length === 1) {
    warnings.push({
      id: 'single-delphi-round',
      message: 'Consider multiple Delphi rounds for robust consensus',
      severity: 'warning'
    });
  }
}

function validateGeneralStructure(
  model: StudySchemaModel, 
  errors: ValidationMessage[], 
  warnings: ValidationMessage[], 
  info: ValidationMessage[]
) {
  const entities = model.entities;
  
  // Check for empty schema
  if (entities.length === 0) {
    info.push({
      id: 'empty-schema',
      message: 'Study schema is empty. Use the Generate button to create an initial structure.',
      severity: 'info'
    });
  }
  
  // Check for disconnected nodes (this would require edge information)
  // This is a placeholder for more sophisticated connectivity analysis
  
  // Check for duplicate entity IDs
  const entityIds = entities.map(e => e.id);
  const duplicateIds = entityIds.filter((id, index) => entityIds.indexOf(id) !== index);
  if (duplicateIds.length > 0) {
    errors.push({
      id: 'duplicate-entity-ids',
      message: `Duplicate entity IDs found: ${duplicateIds.join(', ')}`,
      severity: 'error'
    });
  }
}

/**
 * Get validation suggestions based on current schema
 */
export function getValidationSuggestions(model: StudySchemaModel): string[] {
  const suggestions: string[] = [];
  const protocolType = model.protocolType;
  
  if (protocolType === 'interventional_clinical_trial') {
    suggestions.push('Add interim analysis milestones for long-term studies');
    suggestions.push('Define safety run-in periods for new treatments');
    suggestions.push('Consider adaptive design elements if appropriate');
  } else if (protocolType?.includes('cohort')) {
    suggestions.push('Add bias assessment and mitigation strategies');
    suggestions.push('Define follow-up schedules and loss-to-follow-up handling');
    suggestions.push('Consider negative control analyses');
  }
  
  return suggestions;
}