from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field


JsonDict = dict[str, Any]


class ProtocolBase(BaseModel):
    id: str | None = None
    title: str = "Untitled Protocol"
    phase: str = ""
    indication: str = ""
    status: str = "Draft"
    protocolType: str = "interventional_clinical_trial"
    synopsis: str | None = None
    supplementaryInfo: str | None = None
    createdBy: str = "Current User"
    userId: int | None = None
    tableData: Any = Field(default_factory=dict)
    tableHeaders: Any = Field(default_factory=list)
    inclusionCriteria: Any = Field(default_factory=list)
    exclusionCriteria: Any = Field(default_factory=list)
    dataVariables: Any = Field(default_factory=list)
    studySchema: Any = None
    statisticalAnalysisPlan: Any = None
    safetyDrugHandling: Any = None
    generatedProtocol: Any = None
    overview: JsonDict | None = None
    designStates: list[JsonDict] = Field(default_factory=list)
    activeDesignState: str | None = None
    components: list[JsonDict] = Field(default_factory=list)
    reviewDecisions: JsonDict | None = None
    sourceReadiness: JsonDict | None = None


class ProtocolCreate(ProtocolBase):
    pass


class ProtocolUpdate(BaseModel):
    model_config = ConfigDict(extra="allow")


class ProtocolResponse(ProtocolBase):
    createdAt: datetime
    lastEdited: datetime


class ProtocolListItem(BaseModel):
    id: str
    title: str
    phase: str
    indication: str
    status: str
    protocolType: str
    lastEdited: datetime
    createdBy: str


class CommentCreate(BaseModel):
    id: str | None = None
    protocolId: str
    designStateId: str
    userId: int = 1
    section: str
    sectionItem: str | None = None
    content: str
    status: str = "open"


class CommentUpdate(BaseModel):
    sectionItem: str | None = None
    content: str | None = None
    status: str | None = None


class CommentResponse(CommentCreate):
    id: str
    createdAt: datetime
    updatedAt: datetime
