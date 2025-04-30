import os
from pydantic import BaseModel, Field
from genkit.ai import Genkit
from genkit.plugins.google_genai import (
    GoogleAI
)

import logging

class MainIdea(BaseModel):
    """An overall main idea for a topic of ideas."""
    representative_text: str = Field(description='Main idea for the group, a simple concise sentence')

ai = Genkit(
    plugins=[GoogleAI(api_key=os.environ.get("GOOGLE_API_KEY"))],
    model='googleai/gemini-2.0-flash'
)

@ai.flow()
async def topic_name_suggestion_flow(ideas: list) -> MainIdea:
    # Create a formatted list of idea texts
    idea_texts = "\n".join([f"- {idea['text']}" for idea in ideas])
    response = await ai.generate(
        model='googleai/gemini-2.0-flash',
        prompt=f'Whats the general idea for this group of ideas:\n{idea_texts}',
        output_schema=MainIdea
    )
    logging.info(f"topic_name_suggestion_flow!!: {response.output}")
    return response.output