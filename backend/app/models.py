from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, JSON, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from backend.app.database import Base


class Protocol(Base):
    __tablename__ = "protocols"

    id: Mapped[str] = mapped_column(String(80), primary_key=True)
    title: Mapped[str] = mapped_column(String(500), nullable=False)
    phase: Mapped[str] = mapped_column(String(100), nullable=False, default="")
    indication: Mapped[str] = mapped_column(String(500), nullable=False, default="")
    status: Mapped[str] = mapped_column(String(100), nullable=False, default="Draft")
    protocol_type: Mapped[str] = mapped_column(String(120), nullable=False, default="interventional_clinical_trial")
    synopsis: Mapped[str | None] = mapped_column(Text)
    supplementary_info: Mapped[str | None] = mapped_column(Text)
    created_by: Mapped[str] = mapped_column(String(255), nullable=False, default="Current User")
    user_id: Mapped[int | None] = mapped_column(Integer)

    table_data: Mapped[str] = mapped_column(Text, nullable=False, default="{}")
    table_headers: Mapped[str] = mapped_column(Text, nullable=False, default="[]")
    inclusion_criteria: Mapped[str | None] = mapped_column(Text)
    exclusion_criteria: Mapped[str | None] = mapped_column(Text)
    data_variables: Mapped[str | None] = mapped_column(Text)
    study_schema: Mapped[str | None] = mapped_column(Text)
    statistical_analysis_plan: Mapped[str | None] = mapped_column(Text)
    safety_drug_handling: Mapped[str | None] = mapped_column(Text)
    generated_protocol: Mapped[str | None] = mapped_column(Text)

    overview: Mapped[dict | None] = mapped_column(JSON)
    design_states: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    active_design_state: Mapped[str | None] = mapped_column(String(120))
    components: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    review_decisions: Mapped[dict | None] = mapped_column(JSON)
    source_readiness: Mapped[dict | None] = mapped_column(JSON)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    last_edited: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )


class Comment(Base):
    __tablename__ = "comments"

    id: Mapped[str] = mapped_column(String(120), primary_key=True)
    protocol_id: Mapped[str] = mapped_column(String(80), ForeignKey("protocols.id", ondelete="CASCADE"), nullable=False)
    design_state_id: Mapped[str] = mapped_column(String(120), nullable=False)
    user_id: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    section: Mapped[str] = mapped_column(String(120), nullable=False)
    section_item: Mapped[str | None] = mapped_column(String(255))
    content: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[str] = mapped_column(String(50), nullable=False, default="open")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )
