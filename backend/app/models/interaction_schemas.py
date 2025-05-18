import uuid
from pydantic import BaseModel, Field, validator
from datetime import datetime, timezone
from typing import List, Optional, Dict, Any, Literal

# --- Interaction Event ---
class InteractionEventClientInfo(BaseModel):
    ip_hash: Optional[str] = None 
    user_agent: Optional[str] = None
    referrer: Optional[str] = None

class InteractionEvent(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: Optional[str] = None
    anonymous_id: Optional[str] = None
    participation_token: Optional[str] = None 
    entity_id: str
    entity_type: Literal["discussion", "topic", "idea"]
    action_type: Literal["like", "unlike", "pin", "unpin","save","unsave", "view"]
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    client_info: Optional[InteractionEventClientInfo] = None
    parent_id: Optional[str] = None 

# --- Entity Metrics ---
class HourlyMetric(BaseModel):
    timestamp: datetime 
    views: int = 0
    likes: int = 0
    pins: int = 0
    saves: int = 0

class DailyMetric(BaseModel):
    date: str  # YYYY-MM-DD format
    views: int = 0
    likes: int = 0
    pins: int = 0
    saves: int = 0

class Metrics(BaseModel):
    view_count: int = 0
    unique_view_count: int = 0 # This is harder to keep perfectly accurate synchronously
    like_count: int = 0
    pin_count: int = 0
    save_count: int = 0
    last_activity_at: Optional[datetime] = None

class TimeWindowMetricsContainer(BaseModel):
    hourly: List[HourlyMetric] = Field(default_factory=list)
    daily: List[DailyMetric] = Field(default_factory=list)

# Now we can define classes that depend on Metrics
class TrendingEntityResponseItem(BaseModel):
    entity_id: str
    entity_type: Literal["discussion", "topic", "idea"]
    parent_id: Optional[str] = None
    metrics: Metrics 
    recent_activity: Dict[str, int]
    trending_score: float

class SavedEntityResponseItem(BaseModel):
    entity_id: str
    entity_type: Literal["discussion", "topic", "idea"]

class EntityMetrics(BaseModel):
    entity_id: str 
    entity_type: Literal["discussion", "topic", "idea"]
    parent_id: Optional[str] = None 
    metrics: Metrics = Field(default_factory=Metrics)
    time_window_metrics: TimeWindowMetricsContainer = Field(default_factory=TimeWindowMetricsContainer)

    class Config:
        populate_by_name = True
        json_encoders = {datetime: lambda dt: dt.isoformat()}


# --- User Interaction State ---
class UserState(BaseModel):
    liked: bool = False
    pinned: bool = False
    saved: bool = False
    view_count: int = 0
    first_viewed_at: Optional[datetime] = None
    last_viewed_at: Optional[datetime] = None

class InteractionStateResponse(BaseModel):
    metrics: Optional[Metrics] = None
    user_state: Optional[UserState] = None
    can_like: bool = False
    can_pin: bool = False
    can_save: bool = False

class UserInteractionState(BaseModel):
    # Compound _id in MongoDB: { "user_identifier": user_id/anonymous_id, "entity_id": entity_id }
    user_identifier: str # Combined user_id or anonymous_id
    entity_id: str
    entity_type: Literal["discussion", "topic", "idea"] # Good for querying user's activity by type
    state: UserState = Field(default_factory=UserState)
    last_updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    @validator('user_identifier')
    def user_identifier_must_be_present(cls, v):
        if not v:
            raise ValueError('user_identifier cannot be empty')
        return v

    class Config:
        populate_by_name = True
        json_encoders = {datetime: lambda dt: dt.isoformat()}