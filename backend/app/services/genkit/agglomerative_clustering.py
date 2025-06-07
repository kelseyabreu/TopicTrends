"""
Agglomerative With Outliers clustering engine for comprehensive discussion re-clustering.

This module provides the Agglomerative With Outliers clustering algorithm for complete 
discussion re-clustering. It uses a two-stage approach:

1. Stage 1: Agglomerative clustering with distance threshold to group similar ideas
2. Stage 2: Individual topic creation for outlier ideas that don't fit into groups

The algorithm is designed to handle both small and large datasets efficiently while
maintaining semantic coherence in topic groupings.

Technical Details:
- Uses hierarchical agglomerative clustering with cosine distance
- Dynamic distance thresholds based on dataset characteristics
- Minimum group size enforcement to ensure meaningful clusters
- Outlier handling for ideas that don't fit existing patterns
- Adaptive topic count optimization based on discussion size
"""

import asyncio
import logging
import uuid
from datetime import datetime
from typing import List, Dict, Any, Optional
from math import sqrt

import numpy as np

from app.core.database import get_db
from app.core.socketio import sio
from app.services.genkit.flows.topic_names import topic_name_suggestion

logger = logging.getLogger(__name__)


async def cluster_ideas_into_topics(
    discussion_id: str = None,
    topic_id: str = None,
    persist_results: bool = True
) -> List[dict]:
    """
    Process and cluster ideas using Agglomerative With Outliers clustering.

    This function implements a sophisticated clustering approach that combines:
    1. Agglomerative clustering for finding natural groupings
    2. Outlier detection and individual topic creation
    3. Adaptive thresholding based on dataset characteristics

    The clustering process handles two main scenarios:
    1. Full discussion clustering: When discussion_id is provided, clusters all ideas in the discussion
    2. Topic drill-down clustering: When topic_id is provided, creates sub-topics from an existing topic

    The Agglomerative With Outliers algorithm works as follows:
    - Stage 1: Apply hierarchical agglomerative clustering with distance_threshold=0.20
    - Stage 2: Create individual topics for outliers (groups smaller than min_group_size=3)
    - Adaptive optimization: Adjust parameters based on dataset size and characteristics

    Args:
        discussion_id: The ID of the discussion containing ideas to process.
            Required if persist_results is True and topic_id is not provided.
        topic_id: The ID of a specific parent topic for drill-down clustering.
            Takes precedence over discussion_id if both are provided.
        persist_results: Whether to persist clustering results to database
            and emit updates via WebSocket. Set to False for drill-down previews.

    Returns:
        List of topic dictionaries containing clustered ideas and metadata
        
    Raises:
        ValueError: If arguments are invalid
    """
    # Validation
    if not discussion_id and not topic_id:
        error_msg = "Either discussion_id or topic_id must be provided"
        logger.error(error_msg)
        raise ValueError(error_msg)
        
    if persist_results and not discussion_id:
        error_msg = "discussion_id is required when persist_results is True"
        logger.error(error_msg)
        raise ValueError(error_msg)
    
    try:
        # Import here to avoid circular imports
        from app.services.clustering_coordinator import ClusteringCoordinator
        coordinator = ClusteringCoordinator()
        
        if topic_id:
            # Drill-down clustering for specific topic using Agglomerative With Outliers
            logger.info(f"Starting Agglomerative With Outliers drill-down clustering for topic_id: {topic_id}")
            return await coordinator.process_full_reclustering(topic_id)
        else:
            # Full discussion clustering using Agglomerative With Outliers
            logger.info(f"Starting Agglomerative With Outliers clustering for discussion_id: {discussion_id}")
            if persist_results:
                await sio.emit('processing_status', {
                    'discussion_id': discussion_id,
                    'status': 'started'
                }, room=discussion_id)
            
            result = await coordinator.process_full_reclustering(discussion_id)
            
            if persist_results:
                await sio.emit('processing_status', {
                    'discussion_id': discussion_id,
                    'status': 'complete'
                }, room=discussion_id)
            
            return result
            
    except Exception as e:
        logger.error(f"Error in Agglomerative With Outliers clustering: {e}")
        if persist_results and discussion_id:
            try:
                await sio.emit('processing_status', {
                    'discussion_id': discussion_id,
                    'status': 'error',
                    'error': 'Agglomerative With Outliers clustering process failed'
                }, room=discussion_id)
            except Exception as emit_error:
                logger.error(f"Failed to emit error notification: {emit_error}")
        return []


async def create_topic_summary_from_ideas(ideas: List[dict]) -> tuple:
    """
    Generate topic name and description from ideas using AI analysis.

    Args:
        ideas: List of idea dictionaries with 'text' field

    Returns:
        tuple: (topic_name, topic_description) - both are the same value as in original
    """
    try:
        simplified_ideas = [{"text": idea["text"]} for idea in ideas]
        topic_main_idea = await topic_name_suggestion(simplified_ideas)

        if hasattr(topic_main_idea, 'representative_text'):
            representative_text = topic_main_idea.representative_text
        elif isinstance(topic_main_idea, dict):
            representative_text = topic_main_idea.get('representative_text', 'Generated Topic')
        else:
            representative_text = str(topic_main_idea)

        return representative_text, representative_text

    except Exception as e:
        logger.warning(f"Error generating topic name: {e}")
        if ideas and len(ideas) > 0:
            fallback_text = ideas[0].get('text', 'Generated Topic')[:100]
        else:
            fallback_text = 'Generated Topic'
        return fallback_text, fallback_text


async def fetch_ideas(discussion_id: str = None, topic_id: str = None) -> List[dict]:
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
            logger.info("fetch_ideas called without discussion_id or topic_id")
            return []

    except Exception as e:
        logger.error(f"Database error in fetch_ideas: {e}", exc_info=True)
        return []


async def get_ideas_by_discussion_id(discussion_id: str) -> List[dict]:
    """Helper function to fetch all ideas for a given discussion ID from the database."""
    db = await get_db()
    return await db.ideas.find({"discussion_id": discussion_id}).to_list(length=None)


def cosine_distance(a, b):
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

        if not all(np.isfinite(x) for x in a) or not all(np.isfinite(x) for x in b):
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


def _map_ideas_for_output(ideas_list: List[dict]) -> List[dict]:
    """
    Map raw idea data from the database to the format required for API responses.

    Args:
        ideas_list: List of idea documents from the database

    Returns:
        List of mapped idea objects with consistent format
    """
    output = []
    for idea in ideas_list:
        idea_id_str = str(idea.get('_id', ''))
        if not idea_id_str:
            continue

        mapped_idea = {
            'id': idea_id_str,
            'text': idea.get('text', ''),
            'user_id': idea.get('user_id'),
            'verified': idea.get('verified', False),
            'timestamp': (
                idea['timestamp'].isoformat()
                if isinstance(idea.get('timestamp'), datetime)
                else str(idea.get('timestamp', ''))
            ),
            'on_topic': idea.get('on_topic'),
            'keywords': idea.get('keywords', []),
            'intent': idea.get('intent'),
            'sentiment': idea.get('sentiment'),
            'specificity': idea.get('specificity'),
            'related_topics': idea.get('related_topics', [])
        }
        output.append(mapped_idea)

    return output
