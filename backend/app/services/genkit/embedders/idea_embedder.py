import os
from genkit.ai import Document, Genkit
from genkit.plugins.ollama import Ollama, ollama_name
from genkit.plugins.ollama.constants import OllamaAPITypes
from genkit.plugins.ollama.models import (
    EmbeddingModelDefinition,
    ModelDefinition,
)
EMBEDDER_MODEL = os.environ.get("EMBEDDER_MODEL")
GENERATIVE_MODEL = os.environ.get("GENERATIVE_MODEL")
EMBEDDER_DIMENSIONS = 512
ai = Genkit(
    plugins=[
        Ollama(
            models=[
                ModelDefinition(
                    name=GENERATIVE_MODEL,
                    api_type=OllamaAPITypes.GENERATE,
                )
            ],
            embedders=[
                EmbeddingModelDefinition(
                    name=EMBEDDER_MODEL,
                    dimensions=EMBEDDER_DIMENSIONS,
                )
            ],
        )
    ],
)

async def embed_ideas(ideas: list) -> list:
    """Create embeddings for the given texts"""
    embedded_ideas = []
    for idea in ideas:
        embedding_response = await ai.embed(
            embedder=ollama_name(EMBEDDER_MODEL),
            documents=[Document.from_text(idea["text"])],
        )
        if embedding_response.embeddings:
            idea_copy = dict(idea)
            idea_copy["embedding"] = embedding_response.embeddings[0].embedding
            embedded_ideas.append(idea_copy)
    return embedded_ideas

async def embed_idea(idea: dict):
    """Create embeddings for the given texts"""
    idea_text = idea.get("text")
    embedding_response = await ai.embed(
        embedder=ollama_name(EMBEDDER_MODEL),
        documents=[Document.from_text(idea_text)],
    )
    return embedding_response.embeddings[0].embedding