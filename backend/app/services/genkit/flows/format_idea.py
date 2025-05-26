from genkit.ai import Genkit
from genkit.plugins.google_genai import GoogleAI
from app.core.config import Settings
from app.models.ai_schemas import FormattedIdea
settings = Settings()
GENERATIVE_MODEL = settings.GEMINI_MODEL
API_KEY = settings.GOOGLE_API_KEY
ai = Genkit(
    plugins=[GoogleAI(api_key="AIzaSyBfRFz3pcIveQLWea_Sd_JmipPEBieNft4")],
    model=GENERATIVE_MODEL,
)


@ai.flow()
async def format_idea_flow(idea_text: str, title_prompt:str) -> FormattedIdea:
    """
    Format an idea using a generative AI model.
    """
    print(f"Using model: {GENERATIVE_MODEL}")
    print(f"Using API key: {API_KEY}")
    response = await ai.generate(
        model=GENERATIVE_MODEL,
        prompt=f"Format the following idea:\n{idea_text} based on this discussion's title and description: {title_prompt}",
        output_schema=FormattedIdea,
        config={"temperature": 0.4}
    )
    return response.output

