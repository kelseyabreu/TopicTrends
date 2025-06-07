import uuid
import numpy as np
from datetime import datetime
from typing import List, Optional, Tuple
from app.core.database import get_db
import logging
from app.core.socketio import sio
from app.services.genkit.flows.topic_names import topic_name_suggestion
from app.utils.ideas import get_ideas_by_topic_id

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


def trigger_sequence():
    # These are the idea counts that will trigger a topic name update
    yield 5
    yield 15
    yield 30
    yield 50
    next_trigger = 75
    while True:
        yield next_trigger
        next_trigger += 25


def cosine_similarity(vec1: np.ndarray, vec2: np.ndarray) -> float:
    """Calculate cosine similarity between two vectors."""
    norm1 = np.linalg.norm(vec1)
    norm2 = np.linalg.norm(vec2)
    if norm1 == 0 or norm2 == 0:
        return 0
    return np.dot(vec1, vec2) / (norm1 * norm2)


async def generate_topic_title(topic_id: str):
    topic_ideas = await get_ideas_by_topic_id(topic_id)
    # Generate topic name using AI
    simplified_ideas = [{"text": idea["text"]} for idea in topic_ideas]

    try:
        topic_main_idea = await topic_name_suggestion(simplified_ideas)
        # Handle both dict and object formats
        if hasattr(topic_main_idea, 'representative_text'):
            return topic_main_idea.representative_text
        elif isinstance(topic_main_idea, dict):
            return topic_main_idea.get('representative_text')
        else:
            return str(topic_main_idea)
    except Exception as e:
        logger.warning(f"Error generating topic name: {e}")


async def get_existing_topics(discussion_id: str) -> List[dict]:
    """Fetch existing topics from MongoDB for a discussion"""
    db = await get_db()
    topics = await db.topics.find({"discussion_id": discussion_id}).to_list(None)
    logger.info(f"Found {len(topics)} existing topics for discussion {discussion_id}")
    return topics


class CentroidClustering:
    def __init__(self, similarity_threshold: float = 0.65):
        self.similarity_threshold = similarity_threshold
        logger.info(f"Initialized CentroidClustering with similarity threshold: {similarity_threshold}")

    trigger = trigger_sequence()
    next_trigger_point = next(trigger)

    def find_closest_topic(self, embedding: np.ndarray, existing_topics: List[dict]) -> Optional[dict]:
        """
        Find the closest topic for an idea embedding using adaptive thresholds.
        Returns operation dictionary instead of executing database operations.

        Args:
            embedding: The idea embedding to match
            existing_topics: List of existing topic dictionaries with centroids

        Returns:
            Dictionary with operation details or None if no match found
        """
        if not existing_topics:
            return None

        best_similarity = 0.0
        best_topic = None

        for topic in existing_topics:
            topic_centroid = np.array(topic.get('centroid_embedding', topic.get('centroid', [])))
            if len(topic_centroid) == 0:
                continue

            # Calculate cosine similarity
            similarity = np.dot(embedding, topic_centroid) / (
                np.linalg.norm(embedding) * np.linalg.norm(topic_centroid)
            )

            # Adaptive threshold based on topic maturity
            topic_count = topic.get('count', 1)
            threshold = self._get_adaptive_threshold(topic_count)

            if similarity > threshold and similarity > best_similarity:
                best_similarity = similarity
                best_topic = topic

        if best_topic:
            return {
                'action': 'assign',
                'topic_id': best_topic['_id'],
                'similarity': best_similarity
            }

        return None

    def _get_adaptive_threshold(self, topic_count: int) -> float:
        """Calculate adaptive threshold based on topic maturity."""
        from app.core.config import settings

        if topic_count >= settings.CENTROID_CLUSTERING_TOPIC_MATURITY_THRESHOLD:
            # Mature topic - use aggressive threshold
            return settings.CENTROID_CLUSTERING_ADAPTIVE_THRESHOLD_LOW
        else:
            # New topic - use conservative threshold
            return settings.CENTROID_CLUSTERING_ADAPTIVE_THRESHOLD_HIGH

    def find_closest_topic(self, embedding: np.ndarray, existing_topics: List[dict]) -> Tuple[Optional[dict], float]:
        """
        Find the closest topic to the given embedding from a pre-fetched list.
        Returns (topic, similarity) tuple. If no topics exist, returns (None, 0).
        """
        if not existing_topics:
            logger.debug("No existing topics provided")
            return None, 0

        max_similarity = -1
        closest_topic = None

        for topic in existing_topics:
            centroid = topic.get('centroid_embedding') or topic.get('centroid')
            if centroid is not None:
                similarity = cosine_similarity(embedding, np.array(centroid))
                logger.debug(f"Similarity with topic {topic['_id']}: {similarity}")
                if similarity > max_similarity:
                    max_similarity = similarity
                    closest_topic = topic

        if closest_topic:
            logger.debug(f"Found closest topic {closest_topic['_id']} with similarity {max_similarity}")
        else:
            logger.debug("No suitable topic found")

        return closest_topic, max_similarity
    
    def create_topic_operation(self, embedding: np.ndarray, idea: dict, discussion_id: str) -> dict:
        """
        Create a database operation for inserting a new topic.
        Returns operation dictionary instead of executing database operations.
        """
        topic_id = str(uuid.uuid4())

        try:
            topic_doc = {
                '_id': topic_id,
                'discussion_id': discussion_id,
                'centroid_embedding': embedding.tolist(),
                'representative_idea_id': idea['_id'],
                'representative_text': idea.get('text', 'New Topic')[:50],
                'count': 1,
                'created_at': datetime.utcnow(),
                'updated_at': datetime.utcnow()
            }

            idea_text_preview = idea.get('text', '')[:10] + "..." if len(idea.get('text', '')) > 10 else idea.get('text', '')
            logger.debug(f"Prepared create operation for topic {topic_id} with idea {idea['_id']} ({idea_text_preview})")

            return {
                'type': 'INSERT',
                'doc': topic_doc,
                'topic_id': topic_id
            }

        except Exception as e:
            logger.error(f"Failed to prepare create operation for idea {idea['_id']}: {str(e)}")
            raise

    def update_topic_operation(self, topic: dict, new_embedding: np.ndarray, idea: dict) -> dict:
        """
        Create a database operation for updating an existing topic.
        Returns operation dictionary instead of executing database operations.
        """
        try:
            current_centroid = np.array(topic.get('centroid_embedding', topic.get('centroid', [])))
            current_count = topic.get('count', 1)
            new_centroid = (current_centroid * current_count + new_embedding) / (current_count + 1)

            update_ops = {
                '$set': {
                    'centroid_embedding': new_centroid.tolist(),
                    'count': current_count + 1,
                    'updated_at': datetime.utcnow()
                }
            }

            logger.debug(f"Prepared update operation for topic {topic['_id']} with idea {idea['_id']}, new count: {current_count + 1}")

            return {
                'type': 'UPDATE',
                'id': topic['_id'],
                'ops': update_ops
            }

        except Exception as e:
            logger.error(f"Error preparing update operation for topic {topic['_id']}: {str(e)}")
            raise

