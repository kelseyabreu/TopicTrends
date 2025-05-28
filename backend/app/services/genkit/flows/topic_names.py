import os
import pydantic
from genkit.ai import Genkit
from genkit.plugins.google_genai import (
    GoogleAI
)
from app.core.config import settings
import logging

class MainIdea(pydantic.BaseModel):
    """An overall main idea for a topic of ideas."""
    representative_text: str = pydantic.Field(description='Main idea for the group, a simple concise sentence')

ai = Genkit(
    plugins=[GoogleAI(api_key=settings.GOOGLE_API_KEY)],
    model=settings.GEMINI_MODEL
)

@ai.flow()
async def topic_name_suggestion_flow(ideas: list) -> MainIdea:
    # Create a formatted list of idea texts
    idea_texts = "\n".join([f"- {idea['text']}" for idea in ideas])
    response = await ai.generate(
        model=settings.GEMINI_MODEL,
        prompt=f'You are a expert idea generalization engine, whats the general main idea for this group of ideas:\n{idea_texts}',
        output_schema=MainIdea
    )
    logging.info(f"topic_name_suggestion_flow!!: {response.output}")
    return response.output