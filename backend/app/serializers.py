import json
from datetime import datetime
from typing import Any

from backend.app.models import Comment, Protocol


TEXT_JSON_FIELDS = {
    "tableData": "table_data",
    "tableHeaders": "table_headers",
    "inclusionCriteria": "inclusion_criteria",
    "exclusionCriteria": "exclusion_criteria",
    "dataVariables": "data_variables",
    "studySchema": "study_schema",
    "statisticalAnalysisPlan": "statistical_analysis_plan",
    "safetyDrugHandling": "safety_drug_handling",
    "generatedProtocol": "generated_protocol",
}

DIRECT_FIELDS = {
    "id": "id",
    "title": "title",
    "phase": "phase",
    "indication": "indication",
    "status": "status",
    "synopsis": "synopsis",
    "createdBy": "created_by",
    "userId": "user_id",
    "supplementaryInfo": "supplementary_info",
    "protocolType": "protocol_type",
    "activeDesignState": "active_design_state",
    "overview": "overview",
    "designStates": "design_states",
    "components": "components",
    "reviewDecisions": "review_decisions",
    "sourceReadiness": "source_readiness",
}


def now_iso_id(prefix: str) -> str:
    return f"{prefix}-{int(datetime.utcnow().timestamp() * 1000)}"


def parse_json_text(value: str | None, fallback: Any) -> Any:
    if value is None or value == "":
        return fallback
    try:
        return json.loads(value)
    except (TypeError, json.JSONDecodeError):
        return value


def stringify_jsonish(value: Any, fallback: str) -> str:
    if value is None:
        return fallback
    if isinstance(value, str):
        return value
    return json.dumps(value)


def protocol_to_dict(protocol: Protocol) -> dict[str, Any]:
    return {
        "id": protocol.id,
        "title": protocol.title,
        "phase": protocol.phase,
        "indication": protocol.indication,
        "status": protocol.status,
        "protocolType": protocol.protocol_type,
        "synopsis": protocol.synopsis,
        "supplementaryInfo": protocol.supplementary_info,
        "createdBy": protocol.created_by,
        "userId": protocol.user_id,
        "tableData": parse_json_text(protocol.table_data, {}),
        "tableHeaders": parse_json_text(protocol.table_headers, []),
        "inclusionCriteria": parse_json_text(protocol.inclusion_criteria, []),
        "exclusionCriteria": parse_json_text(protocol.exclusion_criteria, []),
        "dataVariables": parse_json_text(protocol.data_variables, []),
        "studySchema": parse_json_text(protocol.study_schema, None),
        "statisticalAnalysisPlan": parse_json_text(protocol.statistical_analysis_plan, None),
        "safetyDrugHandling": parse_json_text(protocol.safety_drug_handling, None),
        "generatedProtocol": parse_json_text(protocol.generated_protocol, None),
        "overview": protocol.overview,
        "designStates": protocol.design_states or [],
        "activeDesignState": protocol.active_design_state,
        "components": protocol.components or [],
        "reviewDecisions": protocol.review_decisions,
        "sourceReadiness": protocol.source_readiness,
        "createdAt": protocol.created_at,
        "lastEdited": protocol.last_edited,
    }


def protocol_list_item(protocol: Protocol) -> dict[str, Any]:
    return {
        "id": protocol.id,
        "title": protocol.title,
        "phase": protocol.phase,
        "indication": protocol.indication,
        "status": protocol.status,
        "protocolType": protocol.protocol_type,
        "lastEdited": protocol.last_edited,
        "createdBy": protocol.created_by,
    }


def apply_protocol_payload(protocol: Protocol, payload: dict[str, Any]) -> Protocol:
    for public_name, model_name in DIRECT_FIELDS.items():
        if public_name in payload:
            setattr(protocol, model_name, payload[public_name])

    for public_name, model_name in TEXT_JSON_FIELDS.items():
        if public_name in payload:
            fallback = "{}" if public_name == "tableData" else "[]"
            setattr(protocol, model_name, stringify_jsonish(payload[public_name], fallback))

    return protocol


def default_design_state(protocol: Protocol) -> dict[str, Any]:
    return {
        "id": f"{protocol.id}-DS-001",
        "label": "Initial Design",
        "protocolId": protocol.id,
        "timestamp": datetime.utcnow().isoformat(),
        "synopsis": protocol.synopsis or "",
        "protocolType": protocol.protocol_type,
        "studyParameters": {},
    }


def comment_to_dict(comment: Comment) -> dict[str, Any]:
    return {
        "id": comment.id,
        "protocolId": comment.protocol_id,
        "designStateId": comment.design_state_id,
        "userId": comment.user_id,
        "section": comment.section,
        "sectionItem": comment.section_item,
        "content": comment.content,
        "status": comment.status,
        "createdAt": comment.created_at,
        "updatedAt": comment.updated_at,
    }
