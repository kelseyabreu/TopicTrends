import os
import uuid
import logging
import asyncio
from math import sqrt
from datetime import datetime, timezone
# Third-Party Imports
import numpy as np
from sklearn.cluster import AgglomerativeClustering
from genkit.ai import Document, Genkit
from genkit.plugins.google_genai import GoogleAI

# Application-Specific Imports
from app.core.database import get_db
from app.core.socketio import sio
from app.utils.ideas import get_ideas_by_discussion_id
from app.models.schemas import Idea
from app.services.genkit.flows.topic_names import topic_name_suggestion_flow
from app.core.config import settings

# Configure logger
logger = logging.getLogger(__name__)

# AI Provider Selection based on configuration
AI_PROVIDER = settings.AI_PROVIDER
EMBEDDER_MODEL = settings.EMBEDDER_MODEL
EMBEDDER_DIMENSIONS = settings.EMBEDDER_DIMENSIONS
GENERATIVE_MODEL = settings.GENERATIVE_MODEL
EMBEDDING_MODEL = "googleai/text-embedding-004"
# Initialize the appropriate AI provider based on configuration
ai = Genkit(
    plugins=[GoogleAI(api_key=settings.GOOGLE_API_KEY)],
    model=EMBEDDING_MODEL,
)

# --- Core Data Fetching Functions ---


async def fetch_ideas(
    discussion_id: str | None = None, topic_id: str | None = None
) -> list:
    """
    Fetch ideas either by discussion_id or by topic_id.

    Args:
        discussion_id: The ID of the discussion containing ideas
        topic_id: The ID of the topic to retrieve ideas from

    Returns:
        A list of ideas matching the criteria
    """
    try:
        db = await get_db()
        if topic_id:
            logger.info(f"Fetching ideas for specific topic_id: {topic_id}")
            return await db.ideas.find({"topic_id": topic_id}).to_list(None)
        elif discussion_id:
            logger.info(f"Fetching ideas for discussion_id: {discussion_id}")
            return await get_ideas_by_discussion_id(discussion_id)
        else:
            logger.warning("fetch_ideas called without discussion_id or topic_id")
            return []
    except Exception as e:
        logger.error(f"Database error in fetch_ideas: {e}", exc_info=True)
        return []


# --- Embedding Functions ---


async def embed_ideas_batched(ideas: list) -> list:
    """
    Create embeddings for ideas that don't have them.
    Batches requests for better performance.

    Args:
        ideas: List of idea documents

    Returns:
        List of ideas with embeddings added
    """
    if not ideas:
        return []

    # Filter ideas that need embedding
    ideas_needing_embedding = [idea for idea in ideas if not idea.get("embedding")]

    if not ideas_needing_embedding:
        logger.info("All ideas already have embeddings")
        return ideas

    logger.info(f"Embedding {len(ideas_needing_embedding)} ideas in a batch")

    try:
        # Prepare documents for embedding
        documents_to_embed = [
            Document.from_text(idea["text"]) for idea in ideas_needing_embedding
        ]
        idea_ids_to_update = [idea["_id"] for idea in ideas_needing_embedding]

        # Make a single batch embedding request based on AI provider
        embedding_response = await ai.embed(
                embedder=EMBEDDING_MODEL,
                documents=documents_to_embed,
        )

        if not embedding_response.embeddings or len(
            embedding_response.embeddings
        ) != len(ideas_needing_embedding):
            logger.error(
                f"Embedding response length mismatch. Expected {len(ideas_needing_embedding)}, got {len(embedding_response.embeddings) if embedding_response.embeddings else 0}"
            )
            raise ValueError("Embedding response length mismatch")

        # Update embeddings in database concurrently
        db = await get_db()
        update_tasks = []
        new_embeddings_map = {}

        for i, idea_id in enumerate(idea_ids_to_update):
            embedding_vector = embedding_response.embeddings[i].embedding
            new_embeddings_map[str(idea_id)] = embedding_vector
            update_tasks.append(
                db.ideas.update_one(
                    {"_id": idea_id}, {"$set": {"embedding": embedding_vector}}
                )
            )

        if update_tasks:
            results = await asyncio.gather(*update_tasks, return_exceptions=True)
            successful_updates = sum(
                1
                for r in results
                if not isinstance(r, Exception) and r.modified_count > 0
            )
            failed_updates = len(results) - successful_updates
            logger.info(
                f"Updated embeddings in DB: {successful_updates} successful, {failed_updates} failed"
            )

            # Log errors if any
            for i, res in enumerate(results):
                if isinstance(res, Exception):
                    logger.error(
                        f"Failed DB update for idea {idea_ids_to_update[i]}: {res}"
                    )

        # Return the full list with updated embeddings
        updated_ideas = []
        for idea in ideas:
            idea_copy = dict(idea)
            idea_id_str = str(idea["_id"])
            if idea_id_str in new_embeddings_map:
                idea_copy["embedding"] = new_embeddings_map[idea_id_str]
            updated_ideas.append(idea_copy)

        return updated_ideas

    except Exception as e:
        logger.exception(f"Error during batch embedding: {e}")
        # Return original ideas without new embeddings
        return ideas


# --- Distance Calculation and Similarity Functions ---


def cosine_distance(a: list[float], b: list[float]) -> float:
    """
    Calculate the cosine distance between two vectors.
    Includes error handling for edge cases.

    Args:
        a: First vector
        b: Second vector

    """
    try:
        if len(a) != len(b):
            raise ValueError("Input vectors must have the same length")

        # Check for NaN or infinite values
        if any(not np.isfinite(x) for x in a) or any(not np.isfinite(x) for x in b):
            raise ValueError("Input vectors contain NaN or infinite values")

        dot_product = sum(ai * bi for ai, bi in zip(a, b, strict=True))
        magnitude_a = sqrt(sum(ai * ai for ai in a))
        magnitude_b = sqrt(sum(bi * bi for bi in b))

        if magnitude_a == 0 or magnitude_b == 0:
            raise ValueError("Invalid input: zero vector")

        return 1 - (dot_product / (magnitude_a * magnitude_b))

    except Exception as e:
        logger.error(f"Error in cosine_distance calculation: {e}", exc_info=True)
        return 1.0


def _map_ideas_for_output(ideas_list: list) -> list:
    """
    Map raw idea data from the database to the format required for API responses.

    Args:
        ideas_list: List of idea documents from the database

    Returns:
        List of mapped idea objects with consistent format
    """
    output = []
    for idea in ideas_list:
        idea_id_str = str(idea.get("_id", ""))
        if not idea_id_str:
            continue

        mapped_idea = {
            "id": idea_id_str,
            "text": idea.get("text", ""),
            "user_id": idea.get("user_id"),
            "verified": idea.get("verified", False),
            "timestamp": idea["timestamp"].isoformat()
            if isinstance(idea.get("timestamp"), datetime)
            else str(idea.get("timestamp", "")),
            "on_topic": idea.get("on_topic"),
            "keywords": idea.get("keywords", []),
            "intent": idea.get("intent"),
            "sentiment": idea.get("sentiment"),
            "specificity": idea.get("specificity"),
            "related_topics": idea.get("related_topics", []),
        }
        output.append(mapped_idea)
    return output


def find_nearest_ideas(
    input_embedding: list[float], ideas: list, top_n: int = 3
) -> list[Idea]:
    """
    Find the nearest ideas to an input embedding.

    Args:
        input_embedding: The embedding to compare against
        ideas: List of ideas with embeddings
        top_n: Number of nearest ideas to return

    Returns:
        List of the nearest ideas, sorted by distance
    """
    try:
        # Filter ideas with valid embeddings
        valid_ideas = [
            idea
            for idea in ideas
            if isinstance(idea.get("embedding"), list) and len(idea["embedding"]) > 0
        ]

        if not valid_ideas:
            logger.warning("No ideas with valid embeddings to compare")
            return []

        # Calculate distances
        idea_distances = []
        for idea in valid_ideas:
            try:
                distance = cosine_distance(input_embedding, idea["embedding"])
                idea_distances.append((distance, idea))
            except Exception as e:
                logger.warning(
                    f"Error calculating distance for idea {idea.get('_id', 'unknown')}: {e}"
                )
                # Skip this idea on error
                continue

        # Sort by distance
        idea_distances.sort(key=lambda item: item[0])

        # Return top N ideas
        return [idea for distance, idea in idea_distances[:top_n]]

    except Exception as e:
        logger.exception(f"Error in find_nearest_ideas: {e}")
        return []


# --- Clustering Functions ---


async def perform_clustering(
    embedded_ideas: list, distance_threshold: float
) -> np.ndarray | None:
    """
    Perform clustering on embedded ideas using AgglomerativeClustering.

    Args:
        embedded_ideas: List of ideas with embeddings
        distance_threshold: Distance threshold for clustering

    Returns:
        Numpy array of cluster labels or None if clustering failed
    """
    try:
        # Filter ideas with valid embeddings
        ideas_to_cluster = [
            idea
            for idea in embedded_ideas
            if isinstance(idea.get("embedding"), list) and len(idea["embedding"]) > 0
        ]

        if not ideas_to_cluster:
            logger.warning("No ideas with valid embeddings found for clustering")
            return None

        if len(ideas_to_cluster) == 1:
            logger.info("Only one idea with embedding, assigning to single cluster")
            return np.array([0])

        # Extract embeddings
        embeddings = np.array([idea["embedding"] for idea in ideas_to_cluster])

        # Validate embeddings array
        if embeddings.ndim != 2:
            logger.error(
                f"Embeddings array has unexpected dimensions: {embeddings.ndim}"
            )
            return None

        # Perform clustering
        clustering = AgglomerativeClustering(
            n_clusters=None,
            distance_threshold=distance_threshold,
            metric="cosine",
            linkage="average",
        )

        labels = clustering.fit_predict(embeddings)
        unique_labels = np.unique(labels)
        logger.info(f"Clustering resulted in {len(unique_labels)} unique labels")

        return labels

    except Exception as e:
        logger.exception(f"Error during clustering: {e}")
        return None


def calculate_distance_threshold(idea_count: int) -> float:
    """
    Calculate appropriate distance threshold based on number of ideas.
    Uses settings from config.

    Args:
        idea_count: Number of ideas to cluster

    Returns:
        Appropriate distance threshold
    """
    if idea_count < 50:
        threshold = settings.DISTANCE_THRESHOLD_SMALL
        logger.info(
            f"Using small distance threshold ({threshold}) for {idea_count} ideas"
        )
    elif idea_count < 200:
        threshold = settings.DISTANCE_THRESHOLD_MEDIUM
        logger.info(
            f"Using medium distance threshold ({threshold}) for {idea_count} ideas"
        )
    else:
        threshold = settings.DISTANCE_THRESHOLD_LARGE
        logger.info(
            f"Using large distance threshold ({threshold}) for {idea_count} ideas"
        )
    return threshold


async def group_ideas_by_topic(labels: np.ndarray, ideas: list) -> dict:
    """
    Group ideas by their cluster labels.

    Args:
        labels: Cluster labels from perform_clustering
        ideas: List of ideas that were clustered

    Returns:
        Dictionary mapping labels to lists of ideas
    """
    try:
        # Filter ideas with valid embeddings (same as used for clustering)
        ideas_clustered = [
            idea
            for idea in ideas
            if isinstance(idea.get("embedding"), list) and len(idea["embedding"]) > 0
        ]

        if len(labels) != len(ideas_clustered):
            logger.error(
                f"Label count ({len(labels)}) does not match clustered idea count ({len(ideas_clustered)})"
            )
            return {}

        topics_temp_data = {}

        for idx, label in enumerate(labels):
            label_str = str(label)
            if label_str not in topics_temp_data:
                topics_temp_data[label_str] = []

            # Keep the original idea data but ensure consistent format
            idea = ideas_clustered[idx]
            idea_data = {
                "id": str(idea["_id"]),
                "text": idea["text"],
                "embedding": idea["embedding"],
                "user_id": idea.get("user_id"),
                "verified": idea.get("verified", False),
                "timestamp": idea.get("timestamp"),
                "on_topic": idea.get("on_topic", 0),
                "keywords": idea.get("keywords", []),
                "intent": idea.get("intent"),
                "sentiment": idea.get("sentiment"),
                "specificity": idea.get("specificity"),
                "related_topics": idea.get("related_topics", []),
            }

            topics_temp_data[label_str].append(idea_data)

        logger.info(f"Grouped ideas into {len(topics_temp_data)} topic groups")
        return topics_temp_data

    except Exception as e:
        logger.exception(f"Error grouping ideas by topic: {e}")
        return {}


# --- Database Update and Emission Functions ---


async def update_database_and_emit(discussion_id: str, topics_temp_data: dict) -> list:
    """
    Update database with topic results and emit to clients.
    Uses concurrent operations for better performance.

    Args:
        discussion_id: Discussion ID
        topics_temp_data: Grouped ideas by topic

    Returns:
        List of topic results
    """
    db = await get_db()
    topic_results = []

    try:
        logger.info(f"Starting topic replacement for discussion {discussion_id}")

        # Step 1: Delete existing generated topics (except default)
        try:
            delete_result = await db.topics.delete_many(
                {
                    "discussion_id": discussion_id,
                }
            )
            logger.info(f"Deleted {delete_result.deleted_count} existing topics")
        except Exception as e:
            logger.error(f"Error deleting existing topics: {e}", exc_info=True)
            # Continue processing despite error

        # Step 2: Prepare new topics and idea updates
        topic_insert_tasks = []
        idea_update_tasks = []

        # Create a unique prefix for this batch of topics
        base_topic_id_prefix = f"{discussion_id}_topic_{uuid.uuid4().hex[:8]}"

        for label, topic_ideas_data in topics_temp_data.items():
            if not topic_ideas_data:
                continue

            # Calculate centroid and find representative idea
            cluster_embeddings = np.array(
                [idea["embedding"] for idea in topic_ideas_data]
            )
            if cluster_embeddings.shape[0] > 1:
                centroid = np.mean(cluster_embeddings, axis=0)
                # Handle potential NaN in centroid
                if np.isnan(centroid).any():
                    closest_idx = 0
                else:
                    distances = np.linalg.norm(cluster_embeddings - centroid, axis=1)
                    closest_idx = np.argmin(distances)
            else:
                closest_idx = 0

            representative_idea_data = topic_ideas_data[closest_idx]

            # Generate topic name using AI
            simplified_ideas = [{"text": idea["text"]} for idea in topic_ideas_data]

            try:
                topic_main_idea = await topic_name_suggestion_flow(simplified_ideas)
                title = topic_main_idea.get(
                    "representative_text", representative_idea_data["text"][:100]
                )
            except Exception as e:
                logger.warning(f"Error generating topic name: {e}")
                title = representative_idea_data["text"][:100]

            # Prepare ideas for output
            ideas_for_output = []
            for idea in topic_ideas_data:
                idea_output = {
                    "id": idea["id"],
                    "text": idea["text"],
                    "user_id": idea.get("user_id"),
                    "verified": idea.get("verified", False),
                    "timestamp": idea["timestamp"].isoformat()
                    if isinstance(idea["timestamp"], datetime)
                    else str(idea["timestamp"]),
                    "on_topic": idea.get("on_topic", 0),
                    "keywords": idea.get("keywords", []),
                    "intent": idea.get("intent"),
                    "sentiment": idea.get("sentiment"),
                    "specificity": idea.get("specificity", None),
                    "related_topics": idea.get("related_topics", []),
                }
                ideas_for_output.append(idea_output)

            # Create topic ID
            topic_id = f"{base_topic_id_prefix}_{label}"

            # Prepare topic document
            topic_doc = {
                "_id": topic_id,
                "discussion_id": discussion_id,
                "representative_idea_id": representative_idea_data["id"],
                "representative_text": title,
                "count": len(topic_ideas_data),
                "ideas": ideas_for_output,
            }

            # Add to results list
            topic_results.append(
                {
                    "id": topic_id,
                    "representative_idea_id": representative_idea_data["id"],
                    "representative_text": title,
                    "count": len(topic_ideas_data),
                    "ideas": ideas_for_output,
                }
            )

            # Prepare database operations
            topic_insert_tasks.append(db.topics.insert_one(topic_doc))

            # Update ideas with topic ID
            idea_ids = [idea["id"] for idea in topic_ideas_data]
            idea_update_tasks.append(
                db.ideas.update_many(
                    {"_id": {"$in": idea_ids}}, {"$set": {"topic_id": topic_id}}
                )
            )

        # Step 3: Execute database operations concurrently
        all_tasks = []

        # Add topic inserts
        if topic_insert_tasks:
            all_tasks.extend(topic_insert_tasks)

        # Add idea updates
        if idea_update_tasks:
            all_tasks.extend(idea_update_tasks)

        # Execute all tasks
        if all_tasks:
            results = await asyncio.gather(*all_tasks, return_exceptions=True)

            # Log results
            success_count = sum(1 for r in results if not isinstance(r, Exception))
            logger.info(
                f"Completed {success_count}/{len(all_tasks)} database operations"
            )

            # Log errors
            for i, res in enumerate(results):
                if isinstance(res, Exception):
                    logger.error(f"Database operation {i} failed: {res}")

        # Step 4: Update discussion metadata
        await db.discussions.update_one(
            {"_id": discussion_id},
            {
                "$set": {
                    "idea_count": await db.ideas.count_documents(
                        {"discussion_id": discussion_id}
                    ),
                    "topic_count": len(topic_results) + 1,  # Include default topic
                    "last_processed": datetime.now(timezone.utc),
                }
            },
        )

        # Step 5: Emit results
        await sio.emit(
            "topics_updated",
            {"discussion_id": discussion_id, "topics": topic_results},
            room=discussion_id,
        )

        return topic_results

    except Exception as e:
        logger.exception(f"Error in update_database_and_emit: {e}")

        # Try to emit error notification
        try:
            await sio.emit(
                "processing_error",
                {"discussion_id": discussion_id, "error": "Error processing topics"},
                room=discussion_id,
            )
        except Exception as emit_error:
            logger.error(f"Failed to emit error notification: {emit_error}")

        return []


async def generate_topic_results(topic_id: str, topics_temp_data: dict) -> list:
    """
    Generate topic results for drill-down without updating database.

    Args:
        topic_id: Parent topic ID
        topics_temp_data: Grouped ideas by subtopic

    Returns:
        List of subtopic results
    """
    topic_results = []
    base_topic_id_prefix = f"{topic_id}_sub_{uuid.uuid4().hex[:4]}"

    try:
        for label, topic_ideas_data in topics_temp_data.items():
            if not topic_ideas_data:
                continue

            # Calculate centroid and find representative idea
            cluster_embeddings = np.array(
                [idea["embedding"] for idea in topic_ideas_data]
            )
            if cluster_embeddings.shape[0] > 1:
                centroid = np.mean(cluster_embeddings, axis=0)
                # Handle potential NaN in centroid
                if np.isnan(centroid).any():
                    closest_idx = 0
                else:
                    distances = np.linalg.norm(cluster_embeddings - centroid, axis=1)
                    closest_idx = np.argmin(distances)
            else:
                closest_idx = 0

            representative_idea_data = topic_ideas_data[closest_idx]

            # Generate topic name using AI
            simplified_ideas = [{"text": idea["text"]} for idea in topic_ideas_data]

            try:
                topic_main_idea = await topic_name_suggestion_flow(simplified_ideas)
                title = topic_main_idea.get(
                    "representative_text", representative_idea_data["text"][:100]
                )
            except Exception as e:
                logger.warning(f"Error generating subtopic name: {e}")
                title = representative_idea_data["text"][:100]

            # Prepare ideas for output
            ideas_for_output = []
            for idea in topic_ideas_data:
                idea_output = {
                    "id": idea["id"],
                    "text": idea["text"],
                    "user_id": idea.get("user_id"),
                    "verified": idea.get("verified", False),
                    "timestamp": idea["timestamp"].isoformat()
                    if isinstance(idea["timestamp"], datetime)
                    else str(idea["timestamp"]),
                    "on_topic": idea.get("on_topic", 0),
                    "keywords": idea.get("keywords", []),
                    "intent": idea.get("intent"),
                    "sentiment": idea.get("sentiment"),
                    "specificity": idea.get("specificity", None),
                    "related_topics": idea.get("related_topics", []),
                }
                ideas_for_output.append(idea_output)

            # Create subtopic ID
            subtopic_id = f"{base_topic_id_prefix}_{label}"

            # Add to results
            topic_results.append(
                {
                    "id": subtopic_id,
                    "representative_idea_id": representative_idea_data["id"],
                    "representative_text": title,
                    "count": len(topic_ideas_data),
                    "ideas": ideas_for_output,
                }
            )

        logger.info(
            f"Generated {len(topic_results)} subtopic results for topic {topic_id}"
        )
        return topic_results

    except Exception as e:
        logger.exception(f"Error in generate_topic_results: {e}")
        return []


# --- Main Clustering Function ---


async def cluster_ideas_into_topics(
    discussion_id: str | None = None,
    topic_id: str | None = None,
    persist_results: bool = True,
) -> list:
    """
    Process and cluster ideas based on their semantic similarity.

    Args:
        discussion_id: The ID of the discussion containing ideas to process.
            Required if persist_results is True.
        topic_id: The ID of a specific parent topic for drill-down.
            Takes precedence over discussion_id if both are provided.
        persist_results: Whether to persist clustering results to database
            and emit updates via WebSocket.

    Returns:
        List of topic results

    Raises:
        ValueError: If arguments are invalid
    """
    # Validate arguments
    if not discussion_id and not topic_id:
        error_msg = "Either discussion_id or topic_id must be provided"
        logger.error(error_msg)
        raise ValueError(error_msg)

    if persist_results and not discussion_id:
        error_msg = "discussion_id is required when persist_results is True"
        logger.error(error_msg)
        raise ValueError(error_msg)

    try:
        # Path 1: Drill-down into a specific topic
        if topic_id:
            logger.info(f"Starting drill-down clustering for topic_id: {topic_id}")

            # Fetch ideas for this topic
            ideas = await fetch_ideas(topic_id=topic_id)
            if not ideas:
                logger.info(f"No ideas found for topic {topic_id}")
                return []

            # Create embeddings for ideas that need them
            ideas_with_embeddings = await embed_ideas_batched(ideas)

            # Perform clustering
            idea_count = len(ideas_with_embeddings)
            distance_threshold = calculate_distance_threshold(idea_count)

            labels = await perform_clustering(ideas_with_embeddings, distance_threshold)
            if labels is None:
                logger.warning(f"Clustering failed for topic {topic_id}")
                return []

            # Group ideas by subtopic
            topics_temp_data = await group_ideas_by_topic(labels, ideas_with_embeddings)

            # Generate results without persisting
            return await generate_topic_results(topic_id, topics_temp_data)

        # Path 2: Full clustering for a discussion
        elif discussion_id:
            logger.info(f"Starting clustering for discussion_id: {discussion_id}")

            # Fetch all ideas for this discussion
            ideas = await fetch_ideas(discussion_id=discussion_id)
            if not ideas:
                logger.info(f"No ideas found for discussion {discussion_id}")
                if persist_results:
                    # Reset topics and emit empty result
                    return await update_database_and_emit(discussion_id, {})
                return []

            # Create embeddings for ideas that need them
            ideas_with_embeddings = await embed_ideas_batched(ideas)

            # Perform clustering
            idea_count = len(ideas_with_embeddings)
            distance_threshold = calculate_distance_threshold(idea_count)

            labels = await perform_clustering(ideas_with_embeddings, distance_threshold)
            if labels is None:
                logger.warning(f"Clustering failed for discussion {discussion_id}")
                if persist_results:
                    # Reset topics and emit empty result
                    return await update_database_and_emit(discussion_id, {})
                return []

            # Group ideas by topic
            topics_temp_data = await group_ideas_by_topic(labels, ideas_with_embeddings)

            # Update database and emit results if needed
            if persist_results:
                return await update_database_and_emit(discussion_id, topics_temp_data)
            else:
                # Return results without persisting
                # Generate a temporary format like generate_topic_results
                temp_results = []
                for label, ideas_data in topics_temp_data.items():
                    if not ideas_data:
                        continue

                    # Find representative idea
                    cluster_embeddings = np.array(
                        [idea["embedding"] for idea in ideas_data]
                    )
                    if cluster_embeddings.shape[0] > 1:
                        centroid = np.mean(cluster_embeddings, axis=0)
                        distances = np.linalg.norm(
                            cluster_embeddings - centroid, axis=1
                        )
                        closest_idx = np.argmin(distances)
                    else:
                        closest_idx = 0

                    representative_idea_data = ideas_data[closest_idx]

                    # Add to results
                    temp_results.append(
                        {
                            "id": f"{discussion_id}_{label}",
                            "representative_idea_id": representative_idea_data["id"],
                            "representative_text": representative_idea_data.get(
                                "text", ""
                            )[:100],
                            "count": len(ideas_data),
                            "ideas": ideas_data,
                        }
                    )

                return temp_results

    except Exception as e:
        logger.exception(f"Error in cluster_ideas_into_topics: {e}")

        # Try to emit error notification if relevant
        if persist_results and discussion_id:
            try:
                await sio.emit(
                    "processing_error",
                    {
                        "discussion_id": discussion_id,
                        "error": "Clustering process failed",
                    },
                    room=discussion_id,
                )
            except Exception as emit_error:
                logger.error(f"Failed to emit error notification: {emit_error}")

        return []


# --- Additional Utility Functions ---


async def find_similar_ideas_across_topics(idea_id: str, max_results: int = 10) -> list:
    """
    Find ideas similar to a specific idea across all topics.

    Args:
        idea_id: ID of the idea to find similar ideas for
        max_results: Maximum number of similar ideas to return

    Returns:
        List of similar ideas with similarity scores
    """
    try:
        db = await get_db()

        # Fetch the source idea
        source_idea = await db.ideas.find_one({"_id": idea_id})
        if not source_idea or not source_idea.get("embedding"):
            logger.warning(f"Idea {idea_id} not found or has no embedding")
            return []

        source_embedding = source_idea["embedding"]

        # Fetch all ideas (excluding the source)
        all_ideas = await db.ideas.find(
            {"_id": {"$ne": idea_id}, "embedding": {"$exists": True}}
        ).to_list(None)

        # Find nearest ideas
        similar_ideas = find_nearest_ideas(source_embedding, all_ideas, max_results)

        # Calculate similarity scores (1 - distance)
        result = []
        for idea in similar_ideas:
            distance = cosine_distance(source_embedding, idea["embedding"])
            similarity = 1.0 - distance

            # Format the result
            result.append(
                {
                    "id": str(idea["_id"]),
                    "text": idea["text"],
                    "similarity": round(similarity, 4),
                    "topic_id": idea.get("topic_id"),
                    "user_id": idea.get("user_id"),
                    "verified": idea.get("verified", False),
                    "intent": idea.get("intent"),
                    "sentiment": idea.get("sentiment"),
                }
            )

        logger.info(f"Found {len(result)} similar ideas for idea {idea_id}")
        return result

    except Exception as e:
        logger.exception(f"Error finding similar ideas for {idea_id}: {e}")
        return []


async def recalculate_topic_metadata(topic_id: str) -> bool:
    """
    Recalculate and update metadata for a topic.
    Updates intent, sentiment, and other AI-derived fields.

    Args:
        topic_id: ID of the topic to update

    Returns:
        True if successful, False otherwise
    """
    try:
        db = await get_db()

        # Fetch the topic
        topic = await db.topics.find_one({"_id": topic_id})
        if not topic:
            logger.warning(f"Topic {topic_id} not found")
            return False

        # Fetch all ideas in this topic
        ideas = await db.ideas.find({"topic_id": topic_id}).to_list(None)
        if not ideas:
            logger.warning(f"No ideas found for topic {topic_id}")
            return False

        # Calculate aggregate metadata
        sentiments = [idea.get("sentiment") for idea in ideas if idea.get("sentiment")]
        intents = [idea.get("intent") for idea in ideas if idea.get("intent")]

        # Determine dominant sentiment and intent
        dominant_sentiment = (
            max(set(sentiments), key=sentiments.count) if sentiments else None
        )
        dominant_intent = max(set(intents), key=intents.count) if intents else None

        # Calculate average on_topic score
        on_topic_scores = [
            idea.get("on_topic", 0)
            for idea in ideas
            if idea.get("on_topic") is not None
        ]
        avg_on_topic = (
            sum(on_topic_scores) / len(on_topic_scores) if on_topic_scores else None
        )

        # Collect all keywords
        all_keywords = []
        for idea in ideas:
            if idea.get("keywords"):
                all_keywords.extend(idea["keywords"])

        # Count keyword frequencies
        keyword_counts = {}
        for keyword in all_keywords:
            keyword_counts[keyword] = keyword_counts.get(keyword, 0) + 1

        # Get top keywords
        top_keywords = sorted(keyword_counts.items(), key=lambda x: x[1], reverse=True)[
            :10
        ]
        top_keywords = [k for k, v in top_keywords]

        # Update topic
        update_result = await db.topics.update_one(
            {"_id": topic_id},
            {
                "$set": {
                    "dominant_sentiment": dominant_sentiment,
                    "dominant_intent": dominant_intent,
                    "avg_on_topic": avg_on_topic,
                    "keywords": top_keywords,
                    "last_metadata_update": datetime.now(timezone.utc),
                }
            },
        )

        logger.info(f"Updated metadata for topic {topic_id}")
        return update_result.modified_count > 0

    except Exception as e:
        logger.exception(f"Error recalculating topic metadata for {topic_id}: {e}")
        return False


async def recommend_topics_for_user(
    user_id: str, discussion_id: str, limit: int = 5
) -> list:
    """
    Recommend topics that might interest a user based on their previous ideas.

    Args:
        user_id: ID of the user
        discussion_id: ID of the discussion
        limit: Maximum number of topics to recommend

    Returns:
        List of recommended topics with reasons
    """
    try:
        db = await get_db()

        # Fetch user's ideas in this discussion
        user_ideas = await db.ideas.find(
            {
                "user_id": user_id,
                "discussion_id": discussion_id,
                "embedding": {"$exists": True},
            }
        ).to_list(None)

        if not user_ideas:
            logger.info(
                f"No ideas found for user {user_id} in discussion {discussion_id}"
            )
            return []

        # Fetch all topics in this discussion
        topics = await db.topics.find({"discussion_id": discussion_id}).to_list(None)

        if not topics:
            logger.info(f"No topics found for discussion {discussion_id}")
            return []

        # Calculate average embedding for user's ideas
        user_embeddings = [idea["embedding"] for idea in user_ideas]
        avg_embedding = np.mean(user_embeddings, axis=0)

        # Score topics based on similarity to user's average embedding
        topic_scores = []

        for topic in topics:
            # Skip topics the user has already contributed to
            user_idea_ids = [str(idea["_id"]) for idea in user_ideas]
            topic_idea_ids = [idea["id"] for idea in topic.get("ideas", [])]

            if any(idea_id in user_idea_ids for idea_id in topic_idea_ids):
                continue

            # Calculate similarity to representative idea
            rep_idea_id = topic.get("representative_idea_id")
            if not rep_idea_id:
                continue

            rep_idea = await db.ideas.find_one({"_id": rep_idea_id})
            if not rep_idea or not rep_idea.get("embedding"):
                continue

            similarity = 1.0 - cosine_distance(avg_embedding, rep_idea["embedding"])

            topic_scores.append(
                {
                    "id": topic["_id"],
                    "title": topic.get("representative_text", "Untitled Topic"),
                    "similarity": similarity,
                    "count": topic.get("count", 0),
                    "dominant_sentiment": topic.get("dominant_sentiment"),
                    "dominant_intent": topic.get("dominant_intent"),
                }
            )

        # Sort by similarity and return top results
        topic_scores.sort(key=lambda x: x["similarity"], reverse=True)
        recommendations = topic_scores[:limit]

        # Add reason for recommendation
        for rec in recommendations:
            if rec["similarity"] > 0.8:
                rec["reason"] = "Very closely related to your interests"
            elif rec["similarity"] > 0.6:
                rec["reason"] = "Related to topics you've discussed"
            else:
                rec["reason"] = "You might find this interesting"

        logger.info(
            f"Generated {len(recommendations)} topic recommendations for user {user_id}"
        )
        return recommendations

    except Exception as e:
        logger.exception(f"Error recommending topics for user {user_id}: {e}")
        return []


async def analyze_topic_evolution(
    discussion_id: str, time_window_hours: int = 24
) -> dict:
    """
    Analyze how topics have evolved over time in a discussion.

    Args:
        discussion_id: ID of the discussion
        time_window_hours: Time window for trend analysis

    Returns:
        Dictionary with topic evolution metrics
    """
    try:
        db = await get_db()

        # Calculate the cutoff time
        cutoff_time = datetime.now(timezone.utc) - datetime.timedelta(
            hours=time_window_hours
        )

        # Fetch all ideas in the discussion
        ideas = (
            await db.ideas.find({"discussion_id": discussion_id})
            .sort("timestamp", 1)
            .to_list(None)
        )

        if not ideas:
            logger.info(f"No ideas found for discussion {discussion_id}")
            return {"error": "No ideas found"}

        # Fetch all topics
        topics = await db.topics.find({"discussion_id": discussion_id}).to_list(None)

        # Group ideas by topic and timestamp
        topic_timelines = {}

        for idea in ideas:
            topic_id = idea.get("topic_id", "unassigned")
            timestamp = idea.get("timestamp")

            if isinstance(timestamp, str):
                try:
                    timestamp = datetime.fromisoformat(timestamp.replace("Z", "+00:00"))
                except Exception as e:
                    logger.warning(f"Invalid timestamp format: {timestamp}, {e}")
                    continue

            if topic_id not in topic_timelines:
                topic_timelines[topic_id] = []

            topic_timelines[topic_id].append(
                {
                    "id": str(idea["_id"]),
                    "timestamp": timestamp,
                    "is_recent": timestamp > cutoff_time if timestamp else False,
                }
            )

        # Calculate metrics
        results = {
            "discussion_id": discussion_id,
            "total_ideas": len(ideas),
            "total_topics": len(topics),
            "recent_ideas": sum(
                1 for idea in ideas if idea.get("timestamp") > cutoff_time
            ),
            "topic_activity": [],
            "trending_topics": [],
            "declining_topics": [],
        }

        # Analyze each topic
        for topic in topics:
            topic_id = topic["_id"]
            if topic_id not in topic_timelines:
                continue

            timeline = topic_timelines[topic_id]

            # Sort by timestamp
            timeline.sort(key=lambda x: x["timestamp"])

            # Calculate metrics
            total_ideas = len(timeline)
            recent_ideas = sum(1 for item in timeline if item["is_recent"])
            growth_rate = recent_ideas / total_ideas if total_ideas > 0 else 0

            topic_data = {
                "id": topic_id,
                "title": topic.get("representative_text", "Untitled Topic"),
                "total_ideas": total_ideas,
                "recent_ideas": recent_ideas,
                "growth_rate": growth_rate,
            }

            results["topic_activity"].append(topic_data)

            # Classify as trending or declining
            if growth_rate > 0.5 and recent_ideas >= 3:
                results["trending_topics"].append(topic_data)
            elif growth_rate < 0.1 and total_ideas >= 5:
                results["declining_topics"].append(topic_data)

        # Sort topic activity by growth rate
        results["topic_activity"].sort(key=lambda x: x["growth_rate"], reverse=True)

        logger.info(
            f"Completed topic evolution analysis for discussion {discussion_id}"
        )
        return results

    except Exception as e:
        logger.exception(f"Error analyzing topic evolution for {discussion_id}: {e}")
        return {"error": str(e)}


# --- API Helper Functions ---


async def cluster_discussion_topics_background(discussion_id: str):
    """
    Run clustering in the background for a discussion.
    This function can be called from API endpoints.

    Args:
        discussion_id: ID of the discussion to cluster
    """
    try:
        logger.info(f"Starting background clustering for discussion {discussion_id}")

        # Emit processing status
        await sio.emit(
            "processing_status",
            {"discussion_id": discussion_id, "status": "started"},
            room=discussion_id,
        )

        # Run clustering
        await cluster_ideas_into_topics(
            discussion_id=discussion_id, persist_results=True
        )

        # Emit completion status
        await sio.emit(
            "processing_status",
            {"discussion_id": discussion_id, "status": "completed"},
            room=discussion_id,
        )

        logger.info(f"Completed background clustering for discussion {discussion_id}")

    except Exception as e:
        logger.exception(f"Error in background clustering for {discussion_id}: {e}")

        # Emit error status
        try:
            await sio.emit(
                "processing_status",
                {"discussion_id": discussion_id, "status": "error", "message": str(e)},
                room=discussion_id,
            )
        except Exception as emit_error:
            logger.error(f"Failed to emit error status: {emit_error}")


async def drill_down_topic(topic_id: str) -> list:
    """
    Drill down into a topic to discover subtopics.
    This function can be called directly from API endpoints.

    Args:
        topic_id: ID of the topic to drill down into

    Returns:
        List of subtopics
    """
    try:
        logger.info(f"Starting drill-down for topic {topic_id}")

        # Run clustering without persisting results
        subtopics = await cluster_ideas_into_topics(
            topic_id=topic_id, persist_results=False
        )

        logger.info(
            f"Completed drill-down for topic {topic_id}, found {len(subtopics)} subtopics"
        )
        return subtopics

    except Exception as e:
        logger.exception(f"Error in drill-down for topic {topic_id}: {e}")
        return []