from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
from datetime import datetime
from enum import Enum

# Idea processing status enum
class IdeaStatus(str, Enum):
    PENDING = "pending"       # Just submitted
    PROCESSING = "processing" # In AI pipeline
    EMBEDDED = "embedded"     # Has embedding, waiting for clustering
    COMPLETED = "completed"   # Fully processed (has embedding + topic)
    FAILED = "failed"         # Processing failed
    STUCK = "stuck"           # Stuck in processing (timeout-based)

# Discussion when being received from the front end
class DiscussionCreate(BaseModel):
    title: str
    prompt: str
    require_verification: bool = False

# Idea when being received from the front end
class IdeaSubmit(BaseModel):
    text: str

# Bulk idea submission model
class BulkIdeaSubmit(BaseModel):
    ideas: List[IdeaSubmit] = Field(..., max_items=1000)

# Rating submission model
class RatingSubmit(BaseModel):
    rating: int = Field(ge=0, le=10, description="Rating value from 0 to 10")
# Ideas belong to topics.
class Idea(BaseModel):
    id: str
    text: str
    user_id: Optional[str] = None
    anonymous_user_id: Optional[str] = None
    verified: bool
    submitter_display_id: Optional[str] = None
    timestamp: datetime
    # Processing status field
    status: IdeaStatus = IdeaStatus.PENDING
    embedding: list[float] | None = None
    topic_id: Optional[str] = None
    discussion_id: Optional[str] = None
    intent: Optional[str] = None
    keywords: Optional[list[str]] = []
    sentiment: Optional[str] = None
    specificity: Optional[str] = None
    related_topics: Optional[list[str]] = []
    on_topic: Optional[float] = None
    # Rating system fields
    average_rating: Optional[float] = None
    rating_count: int = 0
    rating_distribution: Optional[Dict[str, int]] = None  # {"0": 1, "1": 0, ..., "10": 5}
# Topics have many ideas
class Topic(BaseModel):
    id: str
    representative_idea_id: Optional[str] = None
    representative_text: str
    count: int
    ideas: List[Idea]
    centroid_embedding: Optional[list[float]] = None

class TopicsResponse(BaseModel):
    topics: List[Topic]
    unclustered_count: int

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
