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
# Ideas belong to topics.
class Idea(BaseModel):
    id: str
    text: str
    user_id: Optional[str] = None 
    anonymous_user_id: Optional[str] = None
    verified: bool
    submitter_display_id: Optional[str] = None
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
    representative_idea_id: Optional[str] = None
    representative_text: str
    count: int
    ideas: List[Idea]
class TopicIdPayload(BaseModel):
    topic_id: str
class Discussion(BaseModel):
    id: str
    title: str
    prompt: str
    require_verification: bool
    creator_id: Optional[str] = None 
    created_at: datetime
    last_activity: Optional[datetime] = None 
    idea_count: int = 0
    topic_count: int = 0
    join_link: Optional[str] = None
    qr_code: Optional[str] = None

class EmbedToken(BaseModel):
    """Response model for participation token requests."""
    participation_token: str
