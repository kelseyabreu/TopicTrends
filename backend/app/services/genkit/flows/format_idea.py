import os
from genkit.ai import Genkit
from genkit.plugins.google_genai import GoogleAI

from app.models.ai_schemas import FormattedIdea
from app.core.config import settings

ai = Genkit(
    plugins=[GoogleAI(api_key=settings.GOOGLE_API_KEY)],
    model=settings.GEMINI_MODEL,
)


@ai.flow()
async def format_idea(idea_text: str, title_prompt:str) -> FormattedIdea:
    """
    Format an idea to extract intent, keywords, sentiment, specificity, and related topics.
    """
    response = await ai.generate(
        model=settings.GEMINI_MODEL,
        prompt=f"Format the following idea:\n{idea_text} based on this discussion's title and description: {title_prompt}",
        output_schema=FormattedIdea,
        config={"temperature": 0.4}
    )
    return response.output

