from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
from datetime import datetime

class SessionCreate(BaseModel):
    title: str
    prompt: str
    require_verification: bool = False

class IdeaSubmit(BaseModel):
    text: str
    user_id: str
    verified: bool = False
    verification_method: Optional[str] = None

class Idea(BaseModel):
    id: str
    text: str
    user_id: str
    verified: bool
    timestamp: datetime
    cluster_id: Optional[str] = None
    # Alternative Python 3.13 syntax if needed:
    # cluster_id: str | None = None

class Cluster(BaseModel):
    id: str
    representative_idea: str
    representative_text: str
    count: int
    ideas: List[Idea]

class Session(BaseModel):
    id: str
    title: str
    prompt: str
    require_verification: bool
    created_at: datetime
    idea_count: int = 0
    cluster_count: int = 0
    join_link: str
    qr_code: str