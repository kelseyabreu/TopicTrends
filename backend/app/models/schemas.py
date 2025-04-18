from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
from datetime import datetime
# Session when being received from the front end
class SessionCreate(BaseModel):
    title: str
    prompt: str
    require_verification: bool = False
# Idea when being received from the front end
class IdeaSubmit(BaseModel):
    text: str
    user_id: str
    verified: bool = False
    verification_method: Optional[str] = None
# Ideas belong to clusters.
class Idea(BaseModel):
    id: str
    text: str
    user_id: str
    verified: bool
    timestamp: datetime
    embedding: list[float] | None = None
    cluster_id: Optional[str] = None
# Clusters have many ideas
class Cluster(BaseModel):
    id: str
    representative_idea_id: str  # Updated to match usage in api.py
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