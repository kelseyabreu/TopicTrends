import os
from genkit.plugins.google_genai import (
    EmbeddingTaskType,
    GoogleAI,
)
from genkit.ai import Document, Genkit
GENERATIVE_MODEL = os.environ.get("GENERATIVE_MODEL")
EMBEDDING_MODEL = "googleai/text-embedding-004"
EMBEDDER_DIMENSIONS = 512
ai = Genkit(
    plugins=[GoogleAI(api_key="AIzaSyBfRFz3pcIveQLWea_Sd_JmipPEBieNft4")],
    model=EMBEDDING_MODEL,
)

async def embed_ideas(ideas: list) -> list:
    """Create embeddings for the given texts"""
    embedded_ideas = []
    
    for idea in ideas:
        options = {'task_type': EmbeddingTaskType.CLUSTERING}
        embedding_response = await ai.embed(
            embedder=EMBEDDING_MODEL,
            documents=[Document.from_text(idea['text'])],
            options=options,
        )
        if embedding_response.embeddings:
            idea_copy = dict(idea)
            idea_copy["embedding"] = embedding_response.embeddings[0].embedding
            embedded_ideas.append(idea_copy)
    return embedded_ideas

async def embed_idea(text: str):
    """Create embeddings for the given texts"""
    try:
        print(f"Whats the idea text?\n: {text}")
        if not isinstance(text, str):
            raise ValueError("Input must be a string")
        if not text.strip():
            raise ValueError("Input string cannot be empty")
        options = {'task_type': EmbeddingTaskType.CLUSTERING}
        embedding_response = await ai.embed(
            embedder=EMBEDDING_MODEL,
            documents=[Document.from_text(text)],
            options=options,
        )
        return embedding_response.embeddings[0].embedding
    except Exception as e:
        # Re-raise the exception to be handled by caller
        raise e
