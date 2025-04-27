from genkit.ai import Document, Genkit
from genkit.plugins.ollama import Ollama, ollama_name
from genkit.plugins.ollama.constants import OllamaAPITypes
from genkit.plugins.ollama.models import (
    EmbeddingModelDefinition,
    ModelDefinition,
)
from math import sqrt
from sklearn.cluster import AgglomerativeClustering
from datetime import datetime
from app.models.schemas import Idea
from app.core.socketio import sio
from app.core.database import get_db
from app.utils.ideas import get_ideas_by_discussion_id
import numpy as np
from app.services.genkit.flows.topic_names import topic_name_suggestion_flow
from fastapi import Depends
import logging

EMBEDDER_MODEL = 'nomic-embed-text'
EMBEDDER_DIMENSIONS = 512
GENERATIVE_MODEL = 'phi3.5:latest'

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


# New Clustering method
async def fetch_ideas(discussion_id: str | None = None, topic_id: str | None = None) -> list:
    """Fetch ideas either by discussion_id or by topic_id

    Args:
        discussion_id: The ID of the discussion containing ideas
        topic_id: The ID of the topic to retrieve ideas from

    Returns:
        A list of ideas matching the criteria
    """
    db = await get_db()
    if topic_id:
        return await db.ideas.find({"topic_id": topic_id}).to_list(None)
    elif discussion_id:
        return await get_ideas_by_discussion_id(discussion_id)
    return []


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


def cosine_distance(a: list[float], b: list[float]) -> float:
    """Calculate the cosine distance between two vectors."""
    if len(a) != len(b):
        raise ValueError('Input vectors must have the same length')
    dot_product = sum(ai * bi for ai, bi in zip(a, b, strict=True))
    magnitude_a = sqrt(sum(ai * ai for ai in a))
    magnitude_b = sqrt(sum(bi * bi for bi in b))

    if magnitude_a == 0 or magnitude_b == 0:
        raise ValueError('Invalid input: zero vector')

    return 1 - (dot_product / (magnitude_a * magnitude_b))


def find_nearest_ideas(input_embedding: list[float], top_n: int = 3, total_ideas: list[Idea] = None) -> list[Idea]:
    """Find the nearest Ideas.

    Args:
        input_embedding: The embedding of the input.
        top_n: The number of nearest Ideas to return.

    Returns:
        A list of the nearest ideas.
    """
    if any(idea.embedding is None for idea in total_ideas):
        raise AttributeError('Some ideas are not yet embedded')

    # Calculate distances and keep track of the original Idea object.
    idea_distances = []
    for idea in total_ideas:
        if idea.embedding is not None:
            distance = cosine_distance(input_embedding, idea.embedding)
            idea_distances.append((distance, idea))

    # Sort by distance (the first element of the tuple).
    idea_distances.sort(key=lambda item: item[0])

    # Return the top_n Idea objects from the sorted list.
    return [idea for distance, idea in idea_distances[:top_n]]


async def perform_clustering(embedded_ideas: list, distance_threshold: float) -> list:
    """Perform clustering on embedded ideas using AgglomerativeClustering"""
    # Extract embeddings from ideas
    embeddings = np.array([idea["embedding"] for idea in embedded_ideas])

    # Perform clustering
    clustering = AgglomerativeClustering(
        n_clusters=None,
        distance_threshold=distance_threshold,
        metric='cosine',
        linkage='average'
    )
    labels = clustering.fit_predict(embeddings)
    logging.info(f"Getting labels from perform_clustering ${labels}")
    return labels


async def group_ideas_by_topic(labels: list, ideas: list, texts: list, embedded_ideas: list) -> dict:
    """Group ideas by their cluster labels and prepare for database storage"""
    topics_temp_data = {}

    for idx, label in enumerate(labels):
        label_str = str(label)
        if label_str not in topics_temp_data:
            topics_temp_data[label_str] = []

        topics_temp_data[label_str].append({
            "id": str(ideas[idx]["_id"]),
            "text": texts[idx],
            "embedding": embedded_ideas[idx]["embedding"],
            "user_id": ideas[idx]["user_id"],
            "verified": ideas[idx]["verified"],
            "timestamp": ideas[idx]["timestamp"]
        })

    return topics_temp_data


async def update_database_and_emit(discussion_id: str, topics_temp_data: dict) -> list:
    """Update database with topic results and emit to clients"""
    db = await get_db()
    topic_results = []

    for label, topic_ideas_data in topics_temp_data.items():
        # Calculate centroid and find representative idea
        cluster_embeddings = np.array([idea["embedding"] for idea in topic_ideas_data])
        if cluster_embeddings.shape[0] > 1:
            centroid = np.mean(cluster_embeddings, axis=0)
            distances = np.linalg.norm(cluster_embeddings - centroid, axis=1)
            closest_idx = np.argmin(distances)
        else:
            closest_idx = 0

        representative_idea_data = topic_ideas_data[closest_idx]

        # Prepare ideas for output
        ideas_for_output = [{
            "id": idea["id"],
            "text": idea["text"],
            "user_id": idea["user_id"],
            "verified": idea["verified"],
            "timestamp": idea["timestamp"].isoformat() if isinstance(idea["timestamp"], datetime) else idea["timestamp"]
        } for idea in topic_ideas_data]

        # Update database
        topic_id = f"{discussion_id}_{label}"
        # Lets prep the ideas to send through ai to get the main idea title
        simplified_ideas = [{"text": idea["text"]} for idea in topic_ideas_data]
        topic_main_idea = await topic_name_suggestion_flow(simplified_ideas)
        title = topic_main_idea['representative_text']

        print(f"ideas: ${ideas_for_output}")
        await db.topics.update_one(
            {"_id": topic_id},
            {"$set": {
                "discussion_id": discussion_id,
                "representative_idea_id": representative_idea_data["id"],
                "representative_text": title or representative_idea_data['representative_text'],
                "count": len(topic_ideas_data),
                "ideas": ideas_for_output
            }},
            upsert=True
        )

        # Update ideas with topic ID
        for idea in topic_ideas_data:
            await db.ideas.update_one(
                {"_id": idea["id"]},
                {"$set": {"topic_id": topic_id}}
            )

        topic_results.append({
            "id": topic_id,
            "representative_idea_id": representative_idea_data["id"],
            "representative_text": topic_main_idea["representative_text"],
            "count": len(topic_ideas_data),
            "ideas": ideas_for_output
        })

    # Update discussion
    await db.discussions.update_one(
        {"_id": discussion_id},
        {"$set": {
            "idea_count": await db.ideas.count_documents({"discussion_id": discussion_id}),
            "topic_count": len(topic_results),
            "last_processed": datetime.utcnow()
        }}
    )

    # Emit results
    await sio.emit(
        "topics_updated",
        {"discussion_id": discussion_id, "topics": topic_results},
        room=discussion_id
    )

    return topic_results


async def generate_topic_results(topic_id: str, topics_temp_data: dict) -> list:
    """Prepare topic results without updating database or emitting events

    This function is similar to update_database_and_emit but only prepares the
    topic results data structure without persisting to database or emitting
    socket events.

    Args:
        topic_id (str): The ID of the specific topic being drilled into
        topics_temp_data (dict): Temporary clustering data with ideas grouped by label

    Returns:
        list: A list of topic results, where each topic contains:
            - id: Generated topic ID (topic_id + label)
            - representative_idea_id: ID of the idea that best represents the topic
            - representative_text: A generated title/summary for the topic
            - count: Number of ideas in the topic
            - ideas: List of all ideas in the topic
    """
    topic_results = []

    for label, topic_ideas_data in topics_temp_data.items():
        # Calculate centroid and find representative idea
        cluster_embeddings = np.array([idea["embedding"] for idea in topic_ideas_data])
        if cluster_embeddings.shape[0] > 1:
            centroid = np.mean(cluster_embeddings, axis=0)
            distances = np.linalg.norm(cluster_embeddings - centroid, axis=1)
            closest_idx = np.argmin(distances)
        else:
            closest_idx = 0

        representative_idea_data = topic_ideas_data[closest_idx]

        # Prepare ideas for output
        ideas_for_output = [{
            "id": idea["id"],
            "text": idea["text"],
            "user_id": idea["user_id"],
            "verified": idea["verified"],
            "timestamp": idea["timestamp"].isoformat() if isinstance(idea["timestamp"], datetime) else idea["timestamp"]
        } for idea in topic_ideas_data]

        # Get topic name using AI
        simplified_ideas = [{"text": idea["text"]} for idea in topic_ideas_data]
        topic_main_idea = await topic_name_suggestion_flow(simplified_ideas)
        title = topic_main_idea['representative_text']

        topic_results.append({
            "id": f"{topic_id}_{label}",  # Creates a sub-topic ID
            "representative_idea_id": representative_idea_data["id"],
            "representative_text": title or representative_idea_data.get('representative_text',
                                                                         representative_idea_data['text']),
            "count": len(topic_ideas_data),
            "ideas": ideas_for_output
        })
    logging.debug(f"topic results??${topic_results}")
    return topic_results


def calculate_distance_threshold(idea_count: int) -> float:
    """Calculate appropriate distance threshold based on number of ideas"""
    if idea_count < 25:
        return 0.15  # More strict for small groups
    elif idea_count < 50:
        return 0.25  # Moderate for medium groups
    else:
        return 0.35  # More lenient for large groups
    # Run


async def cluster_ideas_into_topics(
        discussion_id: str | None = None,
        topic_id: str | None = None,
        persist_results: bool = True
) -> list:
    """Process and cluster ideas based on their semantic similarity.

    This function performs semantic clustering on a set of ideas, either from a specific discussion
    or from a provided list of idea IDs. It embeds the ideas using AI and clusters them based on
    similarity.

    Args:
        discussion_id (str | None, optional): The ID of the discussion containing the ideas to process.
            Required if persist_results is True. If provided without topic_id, all ideas
            from this discussion will be processed. Defaults to None.
        topic_id (str | None, optional): The ID of a specific parent topic.
            If provided, ideas belonging to this topic will be re-processed (drilled down).
            Takes precedence over discussion_id if both are provided. Defaults to None.
        persist_results (bool, optional): Whether to persist clustering results to database
            and emit updates via WebSocket. If True, discussion_id is required.
            Defaults to True.

    Returns:
        list: A list of topic results, where each topic contains:
            - id: The unique identifier for the topic (only if persist_results is True)
            - representative_idea_id: ID of the idea that best represents the topic
            - representative_text: A generated title/summary for the topic
            - count: Number of ideas in the topic
            - ideas: List of all ideas in the topic

    Raises:
        ValueError: If neither discussion_id nor topic_id is provided when fetching.
        ValueError: If persist_results is True but discussion_id is None.

    Example:
        # Process all ideas in a discussion and persist results
        topics = await cluster_ideas_into_topics(discussion_id="discussion123")

        # Process specific ideas without persisting results
        topics = await cluster_ideas_into_topics(
            topic_id="topic_123",
            persist_results=False            )

        # Process specific ideas within a discussion context
        topics = await cluster_ideas_into_topics(
            discussion_id="discussion123",
            topic_id="topic_123"        )

    Notes:
        - When persist_results is False, the function only returns the clustering results
          without updating the database or emitting WebSocket events.
        - The clustering algorithm adjusts its threshold based on the number of ideas
          to ensure meaningful groupings.
    """
    if not discussion_id and not topic_id:
        raise ValueError("Either discussion_id or topic_id must be provided")

    if persist_results and not discussion_id:
        raise ValueError("discussion_id is required when persist_results is True")

    # Fetch ideas based on either discussion_id or grouped_ideas
    ideas = await fetch_ideas(discussion_id, topic_id)

    if not ideas:
        return []

    texts = [idea["text"] for idea in ideas]
    # Lets embed ideas
    embedded_ideas = await embed_ideas(ideas)

    idea_count = len(ideas)
    distance_threshold = calculate_distance_threshold(idea_count)

    labels = await perform_clustering(embedded_ideas, distance_threshold)

    topics_temp_data = await group_ideas_by_topic(labels, ideas, texts, embedded_ideas)

    if persist_results:
        # Normal path, first layer of topics for a discussion
        return await update_database_and_emit(discussion_id, topics_temp_data)
    else:
        # We want to drill down into existing topics
        return await generate_topic_results(topic_id, topics_temp_data)