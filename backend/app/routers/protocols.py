from datetime import datetime
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.app.database import get_db
from backend.app.models import Protocol
from backend.app.schemas import ProtocolCreate, ProtocolUpdate
from backend.app.serializers import (
    apply_protocol_payload,
    default_design_state,
    now_iso_id,
    protocol_list_item,
    protocol_to_dict,
)

router = APIRouter(prefix="/api/protocols", tags=["protocols"])


def _get_protocol_or_404(protocol_id: str, db: Session) -> Protocol:
    protocol = db.get(Protocol, protocol_id)
    if protocol is None:
        raise HTTPException(status_code=404, detail={"message": "Protocol not found"})
    return protocol


def _touch(protocol: Protocol) -> None:
    protocol.last_edited = datetime.utcnow()


@router.get("")
def get_protocols(db: Session = Depends(get_db)) -> list[dict[str, Any]]:
    protocols = db.scalars(select(Protocol).order_by(Protocol.last_edited.desc())).all()
    return [protocol_list_item(protocol) for protocol in protocols]


@router.post("", status_code=201)
def create_protocol(payload: ProtocolCreate, db: Session = Depends(get_db)) -> dict[str, Any]:
    data = payload.model_dump()
    protocol_id = data.get("id") or f"EV-{datetime.utcnow().strftime('%H%M%S')}"

    if db.get(Protocol, protocol_id):
        protocol_id = f"{protocol_id}-{int(datetime.utcnow().timestamp())}"

    protocol = Protocol(
        id=protocol_id,
        title=data.get("title") or "Untitled Protocol",
        phase=data.get("phase") or "",
        indication=data.get("indication") or "",
        status=data.get("status") or "Draft",
        protocol_type=data.get("protocolType") or "interventional_clinical_trial",
        created_by=data.get("createdBy") or "Current User",
    )
    apply_protocol_payload(protocol, data)

    if not protocol.design_states:
        state = default_design_state(protocol)
        protocol.design_states = [state]
        protocol.active_design_state = state["id"]

    db.add(protocol)
    db.commit()
    db.refresh(protocol)
    return protocol_to_dict(protocol)


@router.get("/{protocol_id}")
def get_protocol(protocol_id: str, db: Session = Depends(get_db)) -> dict[str, Any]:
    return protocol_to_dict(_get_protocol_or_404(protocol_id, db))


@router.put("/{protocol_id}")
def update_protocol(protocol_id: str, payload: ProtocolUpdate, db: Session = Depends(get_db)) -> dict[str, Any]:
    protocol = _get_protocol_or_404(protocol_id, db)
    apply_protocol_payload(protocol, payload.model_dump(exclude_unset=True))
    _touch(protocol)
    db.commit()
    db.refresh(protocol)
    return protocol_to_dict(protocol)


@router.delete("/{protocol_id}", status_code=204)
def delete_protocol(protocol_id: str, db: Session = Depends(get_db)) -> Response:
    protocol = _get_protocol_or_404(protocol_id, db)
    db.delete(protocol)
    db.commit()
    return Response(status_code=204)


@router.get("/{protocol_id}/design-states")
def get_design_states(protocol_id: str, db: Session = Depends(get_db)) -> list[dict[str, Any]]:
    protocol = _get_protocol_or_404(protocol_id, db)
    return protocol.design_states or []


@router.get("/{protocol_id}/design-states/{state_id}")
def get_design_state(protocol_id: str, state_id: str, db: Session = Depends(get_db)) -> dict[str, Any]:
    protocol = _get_protocol_or_404(protocol_id, db)
    for state in protocol.design_states or []:
        if state.get("id") == state_id:
            return state
    raise HTTPException(status_code=404, detail={"message": "Design state not found"})


@router.get("/{protocol_id}/active-design-state")
def get_active_design_state(protocol_id: str, db: Session = Depends(get_db)) -> dict[str, Any]:
    protocol = _get_protocol_or_404(protocol_id, db)
    if not protocol.active_design_state:
        raise HTTPException(status_code=404, detail={"message": "No active design state found"})
    return get_design_state(protocol_id, protocol.active_design_state, db)


@router.post("/{protocol_id}/design-states", status_code=201)
def create_design_state(protocol_id: str, payload: dict[str, Any], db: Session = Depends(get_db)) -> dict[str, Any]:
    protocol = _get_protocol_or_404(protocol_id, db)
    state = dict(payload)
    state.setdefault("id", now_iso_id("design-state"))
    state.setdefault("timestamp", datetime.utcnow().isoformat())
    state["protocolId"] = protocol.id
    state["protocolType"] = protocol.protocol_type

    states = list(protocol.design_states or [])
    states.append(state)
    protocol.design_states = states
    if not protocol.active_design_state:
        protocol.active_design_state = state["id"]
    _touch(protocol)
    db.commit()
    return state


@router.put("/{protocol_id}/design-states/{state_id}")
def update_design_state(
    protocol_id: str,
    state_id: str,
    payload: dict[str, Any],
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    protocol = _get_protocol_or_404(protocol_id, db)
    states = list(protocol.design_states or [])
    for index, state in enumerate(states):
        if state.get("id") == state_id:
            updated = {**state, **payload, "id": state_id, "protocolId": protocol.id, "protocolType": protocol.protocol_type}
            states[index] = updated
            protocol.design_states = states
            _touch(protocol)
            db.commit()
            return updated
    raise HTTPException(status_code=404, detail={"message": "Design state not found"})


@router.post("/{protocol_id}/active-design-state/{state_id}")
def set_active_design_state(protocol_id: str, state_id: str, db: Session = Depends(get_db)) -> dict[str, Any]:
    protocol = _get_protocol_or_404(protocol_id, db)
    if not any(state.get("id") == state_id for state in protocol.design_states or []):
        raise HTTPException(status_code=404, detail={"message": "Design state not found"})
    protocol.active_design_state = state_id
    _touch(protocol)
    db.commit()
    db.refresh(protocol)
    return protocol_to_dict(protocol)


@router.delete("/{protocol_id}/design-states/{state_id}", status_code=204)
def delete_design_state(protocol_id: str, state_id: str, db: Session = Depends(get_db)) -> Response:
    protocol = _get_protocol_or_404(protocol_id, db)
    if protocol.active_design_state == state_id:
        raise HTTPException(status_code=400, detail={"message": "Cannot delete the active design state"})

    states = [state for state in protocol.design_states or [] if state.get("id") != state_id]
    if len(states) == len(protocol.design_states or []):
        raise HTTPException(status_code=404, detail={"message": "Design state not found"})
    protocol.design_states = states
    _touch(protocol)
    db.commit()
    return Response(status_code=204)


@router.get("/{protocol_id}/components")
def get_components(protocol_id: str, db: Session = Depends(get_db)) -> list[dict[str, Any]]:
    protocol = _get_protocol_or_404(protocol_id, db)
    return protocol.components or []


@router.get("/{protocol_id}/design-states/{state_id}/components")
def get_components_by_design_state(protocol_id: str, state_id: str, db: Session = Depends(get_db)) -> list[dict[str, Any]]:
    protocol = _get_protocol_or_404(protocol_id, db)
    return [component for component in protocol.components or [] if component.get("designStateId") == state_id]


@router.post("/{protocol_id}/components", status_code=201)
def upsert_component(protocol_id: str, payload: dict[str, Any], db: Session = Depends(get_db)) -> dict[str, Any]:
    protocol = _get_protocol_or_404(protocol_id, db)
    component = dict(payload)
    component.setdefault("createdAt", datetime.utcnow().isoformat())
    component["updatedAt"] = datetime.utcnow().isoformat()
    components = list(protocol.components or [])

    key = (component.get("designStateId"), component.get("type"))
    replaced = False
    for index, existing in enumerate(components):
        if (existing.get("designStateId"), existing.get("type")) == key:
            components[index] = {**existing, **component}
            component = components[index]
            replaced = True
            break
    if not replaced:
        components.append(component)

    protocol.components = components
    _touch(protocol)
    db.commit()
    return component
