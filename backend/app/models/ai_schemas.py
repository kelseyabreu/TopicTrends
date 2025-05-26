from typing import Optional
from pydantic import BaseModel, Field

from app.models.enums.intent_type import IntentType
# These are used for structured output from the AI models

class FormattedIdea(BaseModel):
    """
    Represents a formatted idea with intent, keywords, sentiment, specificity, and related topics.
    """
    intent: IntentType = Field(description="What is the intent of this idea?")
    keywords: list[str] = Field(description="A list of keywords associated with the idea.")
    sentiment: str = Field(description="The overall sentiment (e.g., positive, negative, neutral) expressed by the idea.")
    specificity: str = Field(description="The level of detail or focus of the idea (e.g., broad, specific).")
    related_topics: list[str] = Field(description="A list of related topics associated with the idea.")
    on_topic: float = Field(description="The probability of the idea being on the topic. Value between 0 and 1, where 0 is off-topic and 1 is highly relevant.")
