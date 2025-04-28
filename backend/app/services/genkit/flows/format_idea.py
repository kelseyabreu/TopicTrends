import os
from genkit.ai import Genkit
from genkit.plugins.google_genai import GoogleAI

from app.models.ai_schemas import FormattedIdea


ai = Genkit(
    plugins=[GoogleAI(api_key=os.environ.get("GOOGLE_API_KEY"))],
    model='googleai/gemini-2.0-flash'
)


@ai.flow()
async def format_idea_flow(idea_text: str, title_prompt:str) -> FormattedIdea:
    """
    Format an idea using a generative AI model.
    """
    response = await ai.generate(
        model='googleai/gemini-2.0-flash',
        prompt=f"Format the following idea:\n{idea_text} based on this discussion's title and description: {title_prompt}",
        output_schema=FormattedIdea
    )
    return response.output

