from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
from datetime import datetime
# Discussion when being received from the front end
class DiscussionCreate(BaseModel):
    title: str
    prompt: str
    require_verification: bool = False
# Idea when being received from the front end
class IdeaSubmit(BaseModel):
    text: str
    user_id: str
    verified: bool = False
    verification_method: Optional[str] = None
# Ideas belong to topics.
class Idea(BaseModel):
    id: str
    text: str
    user_id: str
    verified: bool
    timestamp: datetime
    embedding: list[float] | None = None
    topic_id: Optional[str] = None
    intent: Optional[str] = None
    keywords: Optional[list[str]] = []
    sentiment: Optional[str] = None
    specificity: Optional[str] = None
    related_topics: Optional[list[str]] = []
    on_topic: Optional[float] = None
# Topics have many ideas
class Topic(BaseModel):
    id: str
    representative_idea_id: str  # Updated to match usage in api.py
    representative_text: str
    count: int
    ideas: List[Idea]

class Discussion(BaseModel):
    id: str
    title: str
    prompt: str
    require_verification: bool
    created_at: datetime
    idea_count: int = 0
    topic_count: int = 0
    join_link: str
    qr_code: str