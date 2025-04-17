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
from app.core.database import db
from app.utils.ideas import get_ideas_by_session_id
import numpy as np
from app.services.genkit.flows.group_names import group_name_suggestion_flow

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
                    dimensions=512,
                )
            ],
        )
    ],
)
# New Clustering method
async def fetch_ideas(session_id: str | None = None, idea_ids: list[str] | None = None) -> list:
    """Fetch ideas either by session_id or specific idea IDs"""
    if idea_ids:
        return await db.ideas.find({"_id": {"$in": idea_ids}}).to_list(None)
    elif session_id:
        return await get_ideas_by_session_id(session_id)
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
    
    return labels

async def group_ideas_by_cluster(labels: list, ideas: list, texts: list, embedded_ideas: list) -> list:
    """Group ideas by their cluster labels and prepare for database storage"""
    clusters_temp_data = {}
    
    for idx, label in enumerate(labels):
        label_str = str(label)
        if label_str not in clusters_temp_data:
            clusters_temp_data[label_str] = []
            
        clusters_temp_data[label_str].append({
            "id": str(ideas[idx]["_id"]),
            "text": texts[idx],
            "embedding": embedded_ideas[idx]["embedding"],
            "user_id": ideas[idx]["user_id"],
            "verified": ideas[idx]["verified"],
            "timestamp": ideas[idx]["timestamp"]
        })
    
    return clusters_temp_data

async def update_database_and_emit(session_id: str, clusters_temp_data: dict) -> list:
    """Update database with clustering results and emit to clients"""
    cluster_results = []
    
    for label, cluster_ideas_data in clusters_temp_data.items():
        # Calculate centroid and find representative idea
        cluster_embeddings = np.array([idea["embedding"] for idea in cluster_ideas_data])
        if cluster_embeddings.shape[0] > 1:
            centroid = np.mean(cluster_embeddings, axis=0)
            distances = np.linalg.norm(cluster_embeddings - centroid, axis=1)
            closest_idx = np.argmin(distances)
        else:
            closest_idx = 0
            
        representative_idea_data = cluster_ideas_data[closest_idx]
        
        # Prepare ideas for output
        ideas_for_output = [{
            "id": idea["id"],
            "text": idea["text"],
            "user_id": idea["user_id"],
            "verified": idea["verified"],
            "timestamp": idea["timestamp"].isoformat() if isinstance(idea["timestamp"], datetime) else idea["timestamp"]
        } for idea in cluster_ideas_data]
        
        # Update database
        cluster_id = f"{session_id}_{label}"
        simplified_ideas = [{"text": idea["text"]} for idea in cluster_ideas_data]
        cluster_main_idea = await group_name_suggestion_flow(simplified_ideas)
        print("group name flow: ", cluster_main_idea )
        title = cluster_main_idea['representative_text']
        await db.clusters.update_one(
            {"_id": cluster_id},
            {"$set": {
                "session_id": session_id,
                "representative_idea_id": representative_idea_data["id"],
                "representative_text": title or representative_idea_data['representative_text'],
                "count": len(cluster_ideas_data),
                "ideas": ideas_for_output
            }},
            upsert=True
        )
        
        # Update ideas with cluster ID
        for idea in cluster_ideas_data:
            await db.ideas.update_one(
                {"_id": idea["id"]},
                {"$set": {"cluster_id": cluster_id}}
            )
            
        cluster_results.append({
            "id": cluster_id,
            "representative_idea_id": representative_idea_data["id"],
            "representative_text": cluster_main_idea["representative_text"],
            "count": len(cluster_ideas_data),
            "ideas": ideas_for_output
        })
    
    # Update session
    await db.sessions.update_one(
        {"_id": session_id},
        {"$set": {
            "idea_count": await db.ideas.count_documents({"session_id": session_id}),
            "cluster_count": len(cluster_results),
            "last_processed": datetime.utcnow()
        }}
    )
    
    # Emit results
    await sio.emit(
        "clusters_updated",
        {"session_id": session_id, "clusters": cluster_results},
        room=session_id
    )
    
    return cluster_results
  
def calculate_distance_threshold(idea_count: int) -> float:
    """Calculate appropriate distance threshold based on number of ideas"""
    if idea_count < 10:
        return 0.15  # More strict for small groups
    elif idea_count < 50:
        return 0.25  # Moderate for medium groups
    else:
        return 0.35  # More lenient for large groups
    
    # Run

async def process_clusters(session_id: str | None = None, grouped_ideas: list[str] | None = None) -> list:
    """Process and cluster ideas based on their semantic similarity.

    This function performs semantic clustering on a set of ideas, either from a specific session
    or from a provided list of idea IDs. It embeds the ideas using AI, clusters them based on
    similarity, and updates the database with the clustering results.

    Args:
        session_id (str | None, optional): The ID of the session containing the ideas to cluster.
            If provided without grouped_ideas, all ideas from this session will be processed.
            Defaults to None.
        grouped_ideas (list[str] | None, optional): A list of specific idea IDs to cluster.
            If provided, these ideas will be processed regardless of their session.
            Takes precedence over session_id if both are provided.
            Defaults to None.

    Returns:
        list: A list of cluster results, where each cluster contains:
            - id: The unique identifier for the cluster
            - representative_idea_id: ID of the idea that best represents the cluster
            - representative_text: A generated title/summary for the cluster
            - count: Number of ideas in the cluster
            - ideas: List of all ideas in the cluster

    Raises:
        ValueError: If neither session_id nor grouped_ideas is provided.

    Example:
        # Process all ideas in a session
        clusters = await process_clusters(session_id="session123")

        # Process specific ideas only
        clusters = await process_clusters(grouped_ideas=["idea1", "idea2", "idea3"])

        # Process specific ideas within a session context
        clusters = await process_clusters(
            session_id="session123",
            grouped_ideas=["idea1", "idea2"]
        )

    Notes:
        - When only grouped_ideas is provided, a temporary session ID will be generated
          for database operations.
        - The clustering algorithm adjusts its threshold based on the number of ideas
          to ensure meaningful groupings.
        - Results are stored in the database and broadcast via WebSocket to connected
          clients in the session room.
    """
    if not session_id and not grouped_ideas:
        raise ValueError("Either session_id or grouped_ideas must be provided")

    # Fetch ideas based on either session_id or grouped_ideas
    ideas = await fetch_ideas(session_id, grouped_ideas)

    if not ideas:
        return []
     
    texts = [idea["text"] for idea in ideas]
    # Lets embed ideas
    embedded_ideas = await embed_ideas(ideas)

    idea_count = len(ideas)
    distance_threshold = calculate_distance_threshold(idea_count)

    labels = await perform_clustering(embedded_ideas, distance_threshold)

    clusters_temp_data = await group_ideas_by_cluster(labels, ideas, texts, embedded_ideas)

    # If we have grouped_ideas but no session_id, we'll use a temporary session ID
    if grouped_ideas and not session_id:
        session_id = f"temp_session_{datetime.utcnow().timestamp()}"

    return await update_database_and_emit(session_id, clusters_temp_data)