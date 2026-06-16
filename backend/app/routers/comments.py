from datetime import datetime
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from backend.app.database import get_db
from backend.app.models import Comment
from backend.app.schemas import CommentCreate, CommentUpdate
from backend.app.serializers import comment_to_dict, now_iso_id

router = APIRouter(prefix="/api/comments", tags=["comments"])


@router.get("/{protocol_id}/{design_state_id}")
def get_comments(protocol_id: str, design_state_id: str, db: Session = Depends(get_db)) -> list[dict[str, Any]]:
    comments = db.scalars(
        select(Comment)
        .where(Comment.protocol_id == protocol_id, Comment.design_state_id == design_state_id)
        .order_by(Comment.created_at.asc())
    ).all()
    return [comment_to_dict(comment) for comment in comments]


@router.get("/{protocol_id}/{design_state_id}/{section}")
def get_section_comments(
    protocol_id: str,
    design_state_id: str,
    section: str,
    db: Session = Depends(get_db),
) -> list[dict[str, Any]]:
    comments = db.scalars(
        select(Comment)
        .where(
            Comment.protocol_id == protocol_id,
            Comment.design_state_id == design_state_id,
            Comment.section == section,
        )
        .order_by(Comment.created_at.asc())
    ).all()
    return [comment_to_dict(comment) for comment in comments]


@router.post("", status_code=201)
def create_comment(payload: CommentCreate, db: Session = Depends(get_db)) -> dict[str, Any]:
    data = payload.model_dump()
    comment = Comment(
        id=data.get("id") or now_iso_id("comment"),
        protocol_id=data["protocolId"],
        design_state_id=data["designStateId"],
        user_id=data.get("userId") or 1,
        section=data["section"],
        section_item=data.get("sectionItem"),
        content=data["content"],
        status=data.get("status") or "open",
    )
    db.add(comment)
    db.commit()
    db.refresh(comment)
    return comment_to_dict(comment)


@router.put("/{comment_id}")
def update_comment(comment_id: str, payload: CommentUpdate, db: Session = Depends(get_db)) -> dict[str, Any]:
    comment = db.get(Comment, comment_id)
    if comment is None:
        raise HTTPException(status_code=404, detail={"message": "Comment not found"})
    updates = payload.model_dump(exclude_unset=True)
    if "sectionItem" in updates:
        comment.section_item = updates["sectionItem"]
    if "content" in updates:
        comment.content = updates["content"]
    if "status" in updates:
        comment.status = updates["status"]
    comment.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(comment)
    return comment_to_dict(comment)


@router.delete("/{comment_id}", status_code=204)
def delete_comment(comment_id: str, db: Session = Depends(get_db)) -> Response:
    result = db.execute(delete(Comment).where(Comment.id == comment_id))
    if result.rowcount == 0:
        raise HTTPException(status_code=404, detail={"message": "Comment not found"})
    db.commit()
    return Response(status_code=204)
