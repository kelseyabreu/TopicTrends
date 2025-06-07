"""
Clustering Coordinator - Manages both Centroid Clustering and Full Reclustering engines.

This module coordinates between the Centroid Clustering Engine (for live idea processing)
and the Full Reclustering Engine (for comprehensive re-clustering). It handles consistency
locks, idea queuing, and engine coordination.
"""

import asyncio
import logging
import uuid
from datetime import datetime
from typing import List, Dict, Any, Optional
from collections import defaultdict

import numpy as np
from sklearn.cluster import AgglomerativeClustering, DBSCAN

from app.core.config import settings
from app.core.database import get_db
from app.services.genkit.centroid_clustering import CentroidClustering
from app.services.genkit.agglomerative_clustering import create_topic_summary_from_ideas

logger = logging.getLogger(__name__)


class ClusteringCoordinator:
    """Coordinates Centroid Clustering and Full Reclustering engines with consistency management."""
    
    def __init__(self):
        self.centroid_clustering = CentroidClustering()
        self.db = None
        
    async def process_centroid_clustering_batch(self, discussion_id: str, ideas: List[dict]) -> Dict[str, Any]:
        """
        Process a batch of ideas using the Centroid Clustering Engine.
        
        Args:
            discussion_id: Discussion identifier
            ideas: List of ideas with embeddings to process
            
        Returns:
            Dictionary containing processing results and database operations
        """
        try:
            logger.info(f"Processing Centroid Clustering batch: {len(ideas)} ideas for discussion {discussion_id}")

            # Initialize database connection if not already done
            if self.db is None:
                from app.core.database import get_db
                self.db = await get_db()

            # Filter out ideas with None embeddings
            valid_ideas = [idea for idea in ideas if idea.get('embedding') is not None]
            invalid_ideas = [idea for idea in ideas if idea.get('embedding') is None]

            if invalid_ideas:
                logger.warning(f"Skipping {len(invalid_ideas)} ideas with None embeddings")
                # Mark invalid ideas as stuck for manual review
                invalid_idea_ids = [str(idea['_id']) for idea in invalid_ideas]
                await self.db.ideas.update_many(
                    {"_id": {"$in": invalid_idea_ids}},
                    {"$set": {"status": "stuck"}}
                )

            if not valid_ideas:
                logger.warning("No valid ideas to process after filtering")
                return {
                    "status": "skipped",
                    "count": 0,
                    "new_topics": 0,
                    "assignments": 0,
                    "skipped": len(invalid_ideas)
                }

            # Check if Full Reclustering is in progress
            if await self._is_full_reclustering_in_progress(discussion_id):
                await self.queue_ideas_during_full_reclustering(discussion_id, valid_ideas)
                return {"status": "queued", "count": len(valid_ideas)}
            
            # Fetch and cache existing topics for this discussion
            existing_topics = await self._fetch_topic_centroids(discussion_id)
            logger.info(f"Cached {len(existing_topics)} existing topics for Centroid Clustering processing")

            # Process valid ideas against existing topics
            db_operations = []
            ideas_to_update = {}
            outliers = []

            for idea in valid_ideas:
                # Update last_attempt timestamp when starting processing
                await self.db.ideas.update_one(
                    {"_id": idea["_id"]},
                    {"$currentDate": {"last_attempt": True}}
                )

                result = await self._process_single_idea(idea, existing_topics)

                if result['action'] == 'assign':
                    ideas_to_update[str(idea['_id'])] = result['topic_id']
                    # Update topic centroid cache
                    await self._update_topic_centroid_cache(result['topic_id'], idea['embedding'], existing_topics)
                elif result['action'] == 'create':
                    outliers.append(idea)
            
            # Handle outliers with mini-clustering
            if outliers:
                outlier_operations = await self._cluster_outliers(outliers, discussion_id)
                db_operations.extend(outlier_operations['topic_ops'])
                ideas_to_update.update(outlier_operations['idea_assignments'])
            
            # Execute atomic database operations
            if db_operations or ideas_to_update:
                await self._execute_atomic_operations(db_operations, ideas_to_update)

            # Emit WebSocket updates for real-time UI updates
            if ideas_to_update:
                await self._emit_unprocessed_count_update(discussion_id)
                await self._emit_batch_processed(valid_ideas, discussion_id)

            logger.info(f"Centroid Clustering batch complete: {len(ideas_to_update)} ideas processed")
            return {
                "status": "processed",
                "count": len(ideas_to_update),
                "new_topics": len(db_operations),
                "assignments": len(ideas_to_update)
            }
            
        except Exception as e:
            logger.error(f"Error in Centroid Clustering batch processing: {e}", exc_info=True)
            raise
    
    async def process_full_reclustering(self, discussion_id: str) -> List[Dict[str, Any]]:
        """
        Process complete discussion re-clustering using the Full Reclustering Engine.
        
        Args:
            discussion_id: Discussion identifier
            
        Returns:
            List of final topic results
        """
        try:
            logger.info(f"Starting Full Reclustering for discussion {discussion_id}")
            
            # Set consistency lock
            await self.set_consistency_lock(discussion_id)
            
            try:
                # Fetch all ideas for the discussion
                ideas = await self._fetch_all_ideas(discussion_id)
                logger.info(f"Fetched {len(ideas)} ideas for Full Reclustering")
                
                if len(ideas) < 2000:
                    # Small dataset: Use Agglomerative With Outliers approach
                    final_topics = await self._agglomerative_with_outliers_clustering(ideas, discussion_id)
                else:
                    # Large dataset: Use hierarchical chunking
                    final_topics = await self._hierarchical_clustering(ideas, discussion_id)
                
                # Update database with final topics
                topic_results = await self._update_database_full_reclustering(discussion_id, final_topics)

                logger.info(f"Full Reclustering complete: {len(final_topics)} topics created")
                return topic_results
                
            finally:
                # Always clear lock and process queued ideas
                await self.clear_consistency_lock(discussion_id)
                await self.process_queued_ideas(discussion_id)
                
        except Exception as e:
            logger.error(f"Error in Full Reclustering: {e}", exc_info=True)
            # Ensure lock is cleared on error
            await self.clear_consistency_lock(discussion_id)
            raise

    async def set_consistency_lock(self, discussion_id: str) -> None:
        """Set Redis lock to indicate Full Reclustering is in progress."""
        try:
            from app.core.redis import get_redis
            redis = await get_redis()
            lock_key = f"{settings.CLUSTERING_LOCK_KEY_PREFIX}{discussion_id}"
            await redis.setex(lock_key, settings.CLUSTERING_LOCK_TIMEOUT_SECONDS, "in_progress")
            logger.info(f"Set Full Reclustering consistency lock for discussion {discussion_id}")
        except Exception as e:
            logger.warning(f"Failed to set consistency lock: {e}")

    async def clear_consistency_lock(self, discussion_id: str) -> None:
        """Clear Redis lock to indicate Full Reclustering is complete."""
        try:
            from app.core.redis import get_redis
            redis = await get_redis()
            lock_key = f"{settings.CLUSTERING_LOCK_KEY_PREFIX}{discussion_id}"
            await redis.delete(lock_key)
            logger.info(f"Cleared Full Reclustering consistency lock for discussion {discussion_id}")
        except Exception as e:
            logger.warning(f"Failed to clear consistency lock: {e}")

    async def queue_ideas_during_full_reclustering(self, discussion_id: str, ideas: List[dict]) -> None:
        """Queue ideas for processing after Full Reclustering completes."""
        try:
            from app.core.redis import get_redis
            redis = await get_redis()
            queue_key = f"{settings.CLUSTERING_QUEUE_KEY_PREFIX}{discussion_id}"

            for idea in ideas:
                idea_json = {
                    "_id": str(idea["_id"]),
                    "text": idea.get("text", ""),
                    "embedding": idea.get("embedding", [])
                }
                await redis.lpush(queue_key, str(idea_json))

            logger.info(f"Queued {len(ideas)} ideas during Full Reclustering for discussion {discussion_id}")
        except Exception as e:
            logger.error(f"Failed to queue ideas: {e}")

    async def process_queued_ideas(self, discussion_id: str) -> None:
        """Process ideas that were queued during Full Reclustering."""
        try:
            from app.core.redis import get_redis
            import json

            redis = await get_redis()
            queue_key = f"{settings.CLUSTERING_QUEUE_KEY_PREFIX}{discussion_id}"

            queued_ideas = []
            while True:
                idea_json = await redis.rpop(queue_key)
                if not idea_json:
                    break
                try:
                    idea_data = eval(idea_json.decode())  # Convert string back to dict
                    queued_ideas.append(idea_data)
                except Exception as e:
                    logger.warning(f"Failed to parse queued idea: {e}")

            if queued_ideas:
                logger.info(f"Processing {len(queued_ideas)} queued ideas for discussion {discussion_id}")
                await self.process_centroid_clustering_batch(discussion_id, queued_ideas)
            else:
                logger.info(f"No queued ideas to process for discussion {discussion_id}")

        except Exception as e:
            logger.error(f"Failed to process queued ideas: {e}")

    async def _is_full_reclustering_in_progress(self, discussion_id: str) -> bool:
        """Check if Full Reclustering is currently in progress."""
        try:
            from app.core.redis import get_redis
            redis = await get_redis()
            lock_key = f"{settings.CLUSTERING_LOCK_KEY_PREFIX}{discussion_id}"
            return await redis.exists(lock_key)
        except Exception as e:
            logger.warning(f"Failed to check Full Reclustering lock: {e}")
            return False

    async def _fetch_topic_centroids(self, discussion_id: str) -> List[dict]:
        """Fetch existing topic centroids for Centroid Clustering processing."""
        try:
            db = await get_db()
            topics = await db.topics.find(
                {"discussion_id": discussion_id},
                {"_id": 1, "centroid_embedding": 1, "count": 1}
            ).to_list(None)

            # Convert to format expected by centroid clustering
            topic_list = []
            for topic in topics:
                if topic.get("centroid_embedding"):
                    topic_list.append({
                        "_id": topic["_id"],
                        "centroid": topic["centroid_embedding"],
                        "count": topic.get("count", 1)
                    })

            return topic_list
        except Exception as e:
            logger.error(f"Failed to fetch topic centroids: {e}")
            return []

    async def _process_single_idea(self, idea: dict, existing_topics: List[dict]) -> Dict[str, Any]:
        """Process a single idea against existing topics using adaptive thresholds."""
        if not existing_topics:
            return {"action": "create"}

        # Calculate adaptive threshold based on topic maturity
        best_similarity = 0.0
        best_topic_id = None

        for topic in existing_topics:
            similarity = self._calculate_similarity(idea["embedding"], topic["centroid"])

            # Adaptive threshold based on topic maturity
            threshold = self._get_adaptive_threshold(topic.get("count", 1))

            # Debug logging for similarity matching
            if similarity > 0.5:  # Only log potentially relevant matches
                logger.info(f"Similarity check: {similarity:.3f} vs threshold {threshold:.3f} for topic {topic['_id'][:8]}... (count: {topic.get('count', 1)})")

            if similarity > threshold and similarity > best_similarity:
                best_similarity = similarity
                best_topic_id = topic["_id"]

        if best_topic_id:
            logger.info(f"Centroid Clustering Engine: ASSIGNED idea to existing topic {best_topic_id[:8]}... with similarity {best_similarity:.3f}")
            return {"action": "assign", "topic_id": best_topic_id, "similarity": best_similarity}
        else:
            logger.info(f"Centroid Clustering Engine: CREATING new topic (best similarity was {best_similarity:.3f})")
            return {"action": "create"}

    def _get_adaptive_threshold(self, topic_count: int) -> float:
        """Calculate adaptive similarity threshold based on topic maturity."""
        if topic_count >= settings.CENTROID_CLUSTERING_TOPIC_MATURITY_THRESHOLD:
            # Mature topic - use aggressive threshold
            return settings.CENTROID_CLUSTERING_ADAPTIVE_THRESHOLD_LOW
        else:
            # New topic - use conservative threshold
            return settings.CENTROID_CLUSTERING_ADAPTIVE_THRESHOLD_HIGH

    def _calculate_similarity(self, embedding1: List[float], embedding2: List[float]) -> float:
        """Calculate cosine similarity between two embeddings."""
        try:
            # Handle None embeddings
            if embedding1 is None or embedding2 is None:
                logger.warning("One or both embeddings are None, returning 0.0 similarity")
                return 0.0

            # Handle empty embeddings
            if not embedding1 or not embedding2:
                logger.warning("One or both embeddings are empty, returning 0.0 similarity")
                return 0.0

            vec1 = np.array(embedding1)
            vec2 = np.array(embedding2)

            # Additional validation for array conversion
            if vec1.size == 0 or vec2.size == 0:
                logger.warning("One or both embedding arrays are empty after conversion")
                return 0.0

            dot_product = np.dot(vec1, vec2)
            norm1 = np.linalg.norm(vec1)
            norm2 = np.linalg.norm(vec2)

            if norm1 == 0 or norm2 == 0:
                return 0.0

            return dot_product / (norm1 * norm2)
        except Exception as e:
            logger.warning(f"Failed to calculate similarity: {e}")
            return 0.0

    async def _agglomerative_with_outliers_clustering(self, ideas: List[dict], discussion_id: str) -> List[Dict[str, Any]]:
        """
        Agglomerative With Outliers clustering that aims for reasonable topic counts.
        Stage 1: Apply agglomerative clustering to find natural groupings
        Stage 2: Create individual topics for outlier ideas that don't fit groups
        """
        logger.info(f"Starting Agglomerative With Outliers clustering for {len(ideas)} ideas")

        # Handle empty or insufficient data
        if len(ideas) == 0:
            logger.info("No ideas to cluster, returning empty result")
            return []

        if len(ideas) == 1:
            logger.info("Only one idea, creating single topic")
            return await self._create_single_topic(ideas[0], discussion_id)

        # Extract embeddings
        embeddings = np.array([idea['embedding'] for idea in ideas])

        # Validate embeddings
        if embeddings.size == 0 or len(embeddings.shape) != 2:
            logger.warning(f"Invalid embeddings shape: {embeddings.shape}, creating individual topics")
            return await self._create_individual_topics(ideas, discussion_id)

        # Target: ~30-50 topics for 355 ideas (reasonable ratio)
        target_topics = max(10, min(50, len(ideas) // 10))
        logger.info(f"Target topic count: ~{target_topics} topics (flexible based on natural groupings)")

        # Stage 1: Try different clustering approaches
        best_clustering = await self._find_optimal_clustering(embeddings, ideas, target_topics)

        # Stage 2: Apply secondary clustering to large leftover groups if needed
        final_topics = await self._refine_clustering_results(best_clustering, discussion_id)

        logger.info(f"Agglomerative With Outliers complete: {len(final_topics)} total topics (target was ~{target_topics})")
        return final_topics

    async def _create_single_topic(self, idea: dict, discussion_id: str) -> List[Dict[str, Any]]:
        """Create a single topic from one idea."""
        topic_id = str(uuid.uuid4())
        idea_text = idea.get('text', 'Single Topic')
        topic_name = idea_text[:50] + "..." if len(idea_text) > 50 else idea_text

        return [{
            "_id": topic_id,
            "discussion_id": discussion_id,
            "name": topic_name,
            "description": idea_text,
            "centroid": idea['embedding'],
            "idea_count": 1,
            "ideas": [idea],
            "clustering_stage": "individual",
            "created_at": datetime.utcnow(),
            "updated_at": datetime.utcnow()
        }]

    async def _create_individual_topics(self, ideas: List[dict], discussion_id: str) -> List[Dict[str, Any]]:
        """Create individual topics for each idea when clustering fails."""
        topics = []
        for idea in ideas:
            topic_id = str(uuid.uuid4())
            idea_text = idea.get('text', 'Individual Topic')
            topic_name = idea_text[:50] + "..." if len(idea_text) > 50 else idea_text

            topics.append({
                "_id": topic_id,
                "discussion_id": discussion_id,
                "name": topic_name,
                "description": idea_text,
                "centroid": idea['embedding'],
                "idea_count": 1,
                "ideas": [idea],
                "clustering_stage": "individual",
                "created_at": datetime.utcnow(),
                "updated_at": datetime.utcnow()
            })

        logger.info(f"Created {len(topics)} individual topics")
        return topics

    async def _find_optimal_clustering(self, embeddings: np.ndarray, ideas: List[dict], target_topics: int) -> List[Dict[str, Any]]:
        """Find the optimal clustering by trying different approaches."""

        # Validate inputs
        if len(ideas) < 2:
            logger.info("Less than 2 ideas, creating individual topics")
            return await self._create_individual_topics(ideas, ideas[0].get('discussion_id', ''))

        if embeddings.size == 0 or len(embeddings.shape) != 2:
            logger.warning(f"Invalid embeddings for clustering: shape {embeddings.shape}")
            return await self._create_individual_topics(ideas, ideas[0].get('discussion_id', ''))

        # Approach 1: Agglomerative with similarity threshold
        logger.info("Trying Agglomerative clustering with similarity threshold")
        distance_threshold = 1.0 - settings.FULL_RECLUSTERING_DISTANCE_THRESHOLD

        try:
            clustering = AgglomerativeClustering(
                n_clusters=None,
                distance_threshold=distance_threshold,
                metric="cosine",
                linkage="average"
            )
            labels = clustering.fit_predict(embeddings)
        except Exception as e:
            logger.error(f"Agglomerative clustering failed: {e}")
            return await self._create_individual_topics(ideas, ideas[0].get('discussion_id', ''))

        # Group ideas by cluster labels
        clusters = defaultdict(list)
        for i, label in enumerate(labels):
            clusters[label].append(ideas[i])

        # Convert to topic format
        topics = []
        for cluster_id, cluster_ideas in clusters.items():
            if len(cluster_ideas) >= settings.FULL_RECLUSTERING_MIN_GROUP_SIZE:
                topics.append({
                    'ideas': cluster_ideas,
                    'size': len(cluster_ideas),
                    'stage': 'group'
                })
                logger.info(f"Created group topic with {len(cluster_ideas)} ideas")

        # If we got a reasonable number of groups, use this approach
        if len(topics) >= 5:  # At least 5 meaningful groups found
            logger.info(f"Agglomerative clustering successful: {len(topics)} group topics")

            # Add remaining ideas as individuals, but limit to reasonable number
            remaining_ideas = []
            for cluster_id, cluster_ideas in clusters.items():
                if len(cluster_ideas) < settings.FULL_RECLUSTERING_MIN_GROUP_SIZE:
                    remaining_ideas.extend(cluster_ideas)

            # Calculate total topics we'll have
            total_topics_projected = len(topics) + len(remaining_ideas)

            # If total would be too many, apply secondary clustering to remaining ideas
            if total_topics_projected > target_topics * 2:  # Allow 2x flexibility
                logger.info(f"Too many total topics projected ({total_topics_projected}), applying secondary clustering to {len(remaining_ideas)} remaining ideas")
                # Target about 1/3 of remaining ideas as final topics
                secondary_target = max(1, len(remaining_ideas) // 3)
                secondary_topics = await self._secondary_clustering(remaining_ideas, secondary_target)
                topics.extend(secondary_topics)
            else:
                # Add as individual topics - this is fine
                logger.info(f"Adding {len(remaining_ideas)} individual topics (total: {total_topics_projected})")
                for idea in remaining_ideas:
                    topics.append({
                        'ideas': [idea],
                        'size': 1,
                        'stage': 'individual'
                    })

            return topics

        # Approach 2: Fixed number clustering if threshold approach failed
        logger.info(f"Threshold approach yielded too few groups ({len(topics)}), trying fixed number clustering")
        return await self._fixed_number_clustering(embeddings, ideas, target_topics)

    async def _fixed_number_clustering(self, embeddings: np.ndarray, ideas: List[dict], target_topics: int) -> List[Dict[str, Any]]:
        """Use fixed number of clusters as fallback."""
        # Validate inputs
        if len(ideas) < 2:
            return await self._create_individual_topics(ideas, ideas[0].get('discussion_id', ''))

        # Ensure target_topics doesn't exceed number of ideas
        actual_clusters = min(target_topics, len(ideas))

        try:
            clustering = AgglomerativeClustering(
                n_clusters=actual_clusters,
                metric="cosine",
                linkage="average"
            )
            labels = clustering.fit_predict(embeddings)
        except Exception as e:
            logger.error(f"Fixed number clustering failed: {e}")
            return await self._create_individual_topics(ideas, ideas[0].get('discussion_id', ''))

        # Group ideas by cluster labels
        clusters = defaultdict(list)
        for i, label in enumerate(labels):
            clusters[label].append(ideas[i])

        topics = []
        for cluster_id, cluster_ideas in clusters.items():
            stage = 'group' if len(cluster_ideas) > 1 else 'individual'
            topics.append({
                'ideas': cluster_ideas,
                'size': len(cluster_ideas),
                'stage': stage
            })
            logger.info(f"Fixed clustering: Created {stage} topic with {len(cluster_ideas)} ideas")

        return topics

    async def _secondary_clustering(self, ideas: List[dict], max_topics: int) -> List[Dict[str, Any]]:
        """Apply secondary clustering to reduce individual topics."""
        # Safety checks
        if max_topics <= 0:
            logger.warning(f"Invalid max_topics: {max_topics}, using 1")
            max_topics = 1

        if len(ideas) <= max_topics:
            # Just return as individual topics
            return [{
                'ideas': [idea],
                'size': 1,
                'stage': 'individual'
            } for idea in ideas]

        # Apply more aggressive clustering
        embeddings = np.array([idea['embedding'] for idea in ideas])
        # Ensure max_topics doesn't exceed number of ideas
        actual_clusters = min(max_topics, len(ideas))

        clustering = AgglomerativeClustering(
            n_clusters=actual_clusters,
            metric="cosine",
            linkage="average"
        )
        labels = clustering.fit_predict(embeddings)

        # Group ideas by cluster labels
        clusters = defaultdict(list)
        for i, label in enumerate(labels):
            clusters[label].append(ideas[i])

        topics = []
        for cluster_id, cluster_ideas in clusters.items():
            stage = 'group' if len(cluster_ideas) > 1 else 'individual'
            topics.append({
                'ideas': cluster_ideas,
                'size': len(cluster_ideas),
                'stage': stage
            })

        logger.info(f"Secondary clustering: Created {len(topics)} topics from {len(ideas)} ideas")
        return topics

    async def _refine_clustering_results(self, topics: List[Dict[str, Any]], discussion_id: str) -> List[Dict[str, Any]]:
        """Refine clustering results and generate final topic objects."""
        # Generate names and create final topic objects
        final_topics = await self._create_final_topics(topics, discussion_id)
        return final_topics

    async def _create_final_topics(self, all_topics: List[dict], discussion_id: str) -> List[Dict[str, Any]]:
        """Create final topic objects with appropriate naming."""
        final_topics = []

        for topic in all_topics:
            # Generate topic name based on stage
            if topic['stage'] == 'group':
                # AI naming for groups
                try:
                    topic_name, topic_description = await create_topic_summary_from_ideas(topic['ideas'])
                    await asyncio.sleep(0.1)  # Rate limiting
                except Exception as e:
                    logger.warning(f"AI naming failed: {e}")
                    topic_name = topic['ideas'][0].get('text', 'Group Topic')[:50]
                    topic_description = topic_name
            else:
                # Direct text for individuals
                idea_text = topic['ideas'][0].get('text', 'Individual Topic')
                topic_name = idea_text[:50] + "..." if len(idea_text) > 50 else idea_text
                topic_description = idea_text

            # Calculate centroid
            embeddings = [idea['embedding'] for idea in topic['ideas']]
            centroid = np.mean(embeddings, axis=0).tolist()

            final_topic = {
                "_id": str(uuid.uuid4()),
                "discussion_id": discussion_id,
                "name": topic_name,
                "description": topic_description,
                "centroid": centroid,
                "idea_count": topic['size'],
                "ideas": topic['ideas'],
                "clustering_stage": topic['stage'],
                "created_at": datetime.utcnow(),
                "updated_at": datetime.utcnow()
            }
            final_topics.append(final_topic)

        return final_topics

    async def _cluster_outliers(self, outliers: List[dict], discussion_id: str) -> Dict[str, Any]:
        """Apply mini-DBSCAN clustering to outlier ideas."""
        if len(outliers) < 3:
            # Too few outliers, create individual topics
            topic_ops = []
            idea_assignments = {}

            for idea in outliers:
                topic_id = str(uuid.uuid4())
                topic_ops.append({
                    'type': 'INSERT',
                    'doc': {
                        "_id": topic_id,
                        "discussion_id": discussion_id,
                        "representative_text": idea.get('text', 'Individual Topic')[:50],
                        "count": 1,
                        "centroid_embedding": idea['embedding'],
                        "created_at": datetime.utcnow(),
                        "updated_at": datetime.utcnow()
                    }
                })
                idea_assignments[str(idea['_id'])] = topic_id

            return {"topic_ops": topic_ops, "idea_assignments": idea_assignments}

        # Apply mini-DBSCAN to outliers
        logger.info(f"Applying mini-DBSCAN to {len(outliers)} outliers")

        # Filter out ideas with None embeddings
        valid_outliers = [idea for idea in outliers if idea.get('embedding') is not None]

        if len(valid_outliers) != len(outliers):
            logger.warning(f"Filtered out {len(outliers) - len(valid_outliers)} outliers with None embeddings")

        if len(valid_outliers) < 3:
            logger.info("Too few valid outliers for clustering, creating individual topics")
            # Create individual topics for all outliers (including those with None embeddings)
            topic_ops = []
            idea_assignments = {}

            for idea in outliers:
                topic_id = str(uuid.uuid4())
                topic_ops.append({
                    'type': 'INSERT',
                    'doc': {
                        "_id": topic_id,
                        "discussion_id": discussion_id,
                        "representative_text": idea.get('text', 'Individual Topic')[:50],
                        "count": 1,
                        "centroid_embedding": idea.get('embedding'),  # May be None, that's OK
                        "created_at": datetime.utcnow(),
                        "updated_at": datetime.utcnow()
                    }
                })
                idea_assignments[str(idea['_id'])] = topic_id

            return {"topic_ops": topic_ops, "idea_assignments": idea_assignments}

        # Use only valid outliers for clustering
        embeddings = np.array([idea['embedding'] for idea in valid_outliers])

        clustering = DBSCAN(eps=0.25, min_samples=2, metric='cosine')
        labels = clustering.fit_predict(embeddings)

        # Group valid outliers by cluster
        clusters = defaultdict(list)
        for i, label in enumerate(labels):
            clusters[label].append(valid_outliers[i])

        # Add any outliers with None embeddings as individual clusters
        none_embedding_outliers = [idea for idea in outliers if idea.get('embedding') is None]
        for idea in none_embedding_outliers:
            # Assign each None embedding idea to its own cluster with a unique negative label
            unique_label = min(clusters.keys(), default=0) - 1
            clusters[unique_label] = [idea]

        topic_ops = []
        idea_assignments = {}

        for cluster_id, cluster_ideas in clusters.items():
            topic_id = str(uuid.uuid4())

            # Calculate centroid (handle None embeddings)
            cluster_embeddings = [idea['embedding'] for idea in cluster_ideas if idea.get('embedding') is not None]

            if cluster_embeddings:
                centroid = np.mean(cluster_embeddings, axis=0).tolist()
            else:
                # All embeddings are None, use None as centroid
                centroid = None

            # Generate topic name
            if len(cluster_ideas) > 1:
                try:
                    topic_name, _ = await create_topic_summary_from_ideas(cluster_ideas)
                except Exception:
                    topic_name = cluster_ideas[0].get('text', 'Outlier Topic')[:50]
            else:
                topic_name = cluster_ideas[0].get('text', 'Individual Topic')[:50]

            topic_ops.append({
                'type': 'INSERT',
                'doc': {
                    "_id": topic_id,
                    "discussion_id": discussion_id,
                    "representative_text": topic_name,
                    "count": len(cluster_ideas),
                    "centroid_embedding": centroid,
                    "created_at": datetime.utcnow(),
                    "updated_at": datetime.utcnow()
                }
            })

            for idea in cluster_ideas:
                idea_assignments[str(idea['_id'])] = topic_id

        logger.info(f"Mini-DBSCAN created {len(topic_ops)} new topics from outliers")
        return {"topic_ops": topic_ops, "idea_assignments": idea_assignments}

    async def _fetch_all_ideas(self, discussion_id: str) -> List[dict]:
        """Fetch all ideas for a discussion with embeddings."""
        try:
            db = await get_db()
            ideas = await db.ideas.find(
                {"discussion_id": discussion_id},
                {"_id": 1, "text": 1, "embedding": 1}
            ).to_list(None)

            # Filter ideas with valid embeddings
            valid_ideas = [
                idea for idea in ideas
                if idea.get('embedding') and len(idea['embedding']) > 0
            ]

            logger.info(f"Fetched {len(valid_ideas)} ideas with embeddings from {len(ideas)} total")
            return valid_ideas
        except Exception as e:
            logger.error(f"Failed to fetch ideas: {e}")
            return []

    async def _hierarchical_clustering(self, ideas: List[dict], discussion_id: str) -> List[Dict[str, Any]]:
        """Hierarchical clustering for large datasets (placeholder for future implementation)."""
        logger.info("Large dataset detected, using hierarchical clustering")
        # For now, fall back to Agglomerative With Outliers
        return await self._agglomerative_with_outliers_clustering(ideas, discussion_id)

    async def _update_topic_centroid_cache(self, topic_id: str, new_embedding: List[float], existing_topics: List[dict]) -> None:
        """Update cached topic centroid with new idea embedding."""
        for topic in existing_topics:
            if topic["_id"] == topic_id:
                # Simple incremental centroid update
                current_centroid = np.array(topic["centroid"])
                new_embedding_array = np.array(new_embedding)
                count = topic.get("count", 1)

                # Weighted average: (old_centroid * count + new_embedding) / (count + 1)
                updated_centroid = (current_centroid * count + new_embedding_array) / (count + 1)
                topic["centroid"] = updated_centroid.tolist()
                topic["count"] = count + 1
                break

    async def _execute_atomic_operations(self, db_operations: List[dict], ideas_to_update: Dict[str, str]) -> None:
        """Execute database operations atomically using correct MongoDB format."""
        try:
            from pymongo import InsertOne, UpdateOne
            db = await get_db()

            # Execute topic operations if any
            if db_operations:
                topic_bulk_ops = []
                for op in db_operations:
                    if op['type'] == 'INSERT':
                        topic_bulk_ops.append(InsertOne(op['doc']))
                    elif op['type'] == 'UPDATE':
                        topic_bulk_ops.append(UpdateOne(
                            filter={"_id": op['id']},
                            update=op['ops']
                        ))

                if topic_bulk_ops:
                    await db.topics.bulk_write(topic_bulk_ops, ordered=False)
                    logger.info(f"Executed {len(topic_bulk_ops)} topic operations")

            # Execute idea updates
            if ideas_to_update:
                idea_bulk_ops = []
                for idea_id, topic_id in ideas_to_update.items():
                    idea_bulk_ops.append(UpdateOne(
                        filter={"_id": idea_id},
                        update={
                            "$set": {
                                "topic_id": topic_id,
                                "status": "completed"
                            }
                        }
                    ))

                await db.ideas.bulk_write(idea_bulk_ops, ordered=False)
                logger.info(f"Executed {len(idea_bulk_ops)} idea assignment operations")

        except Exception as e:
            logger.error(f"Failed to execute atomic operations: {e}")
            raise

    async def _update_database_full_reclustering(self, discussion_id: str, final_topics: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Update database with Full Reclustering results."""
        try:
            db = await get_db()

            logger.info(f"Updating database with {len(final_topics)} Full Reclustering topics")

            # Clear existing topics
            delete_result = await db.topics.delete_many({"discussion_id": discussion_id})
            logger.info(f"Deleted {delete_result.deleted_count} existing topics")

            # Insert new topics
            if final_topics:
                topics_for_db = []
                for topic in final_topics:
                    topic_for_db = {
                        "_id": topic['_id'],
                        "discussion_id": discussion_id,
                        "representative_text": topic['name'],
                        "count": topic['idea_count'],
                        "centroid_embedding": topic['centroid'],
                        "created_at": topic['created_at'],
                        "updated_at": topic['updated_at']
                    }
                    topics_for_db.append(topic_for_db)

                await db.topics.insert_many(topics_for_db)
                logger.info(f"Inserted {len(topics_for_db)} new topics")

                # Update idea assignments
                for topic in final_topics:
                    idea_ids = [idea['_id'] for idea in topic['ideas']]
                    if idea_ids:
                        await db.ideas.update_many(
                            {"_id": {"$in": idea_ids}},
                            {
                                "$set": {
                                    "topic_id": topic['_id'],
                                    "status": "completed"
                                }
                            }
                        )

                logger.info("Updated idea assignments")

            # Prepare results for client
            topic_results = []
            for topic in final_topics:
                if topic['ideas']:
                    representative_idea = topic['ideas'][0]  # Use first idea as representative
                    topic_result = {
                        "id": topic['_id'],
                        "representative_idea_id": representative_idea['_id'],
                        "representative_text": topic['name'],
                        "count": topic['idea_count'],
                        "ideas": [{"id": idea['_id'], "text": idea.get('text', '')} for idea in topic['ideas']]
                    }
                    topic_results.append(topic_result)

            logger.info(f"Full Reclustering database update complete: {len(final_topics)} topics")
            return topic_results

        except Exception as e:
            logger.error(f"Failed to update database with Full Reclustering results: {e}")
            raise

    async def _emit_unprocessed_count_update(self, discussion_id: str):
        """Emit WebSocket event with updated unprocessed counts"""
        try:
            # Get current counts
            total_embedding = await self.db.ideas.count_documents({
                "discussion_id": discussion_id,
                "embedding": None
            })

            total_clustering = await self.db.ideas.count_documents({
                "discussion_id": discussion_id,
                "embedding": {"$ne": None},
                "topic_id": None
            })

            total_unprocessed = total_embedding + total_clustering

            # Import sio here to avoid circular imports
            from app.core.socketio import sio

            # Emit update to discussion room
            await sio.emit('unprocessed_count_updated', {
                'discussion_id': discussion_id,
                'total_unprocessed': total_unprocessed,
                'needs_embedding': total_embedding,
                'needs_clustering': total_clustering
            }, room=discussion_id)

            logger.debug(f"Emitted drifting count update for discussion {discussion_id}: {total_drifting} total")

        except Exception as e:
            logger.error(f"Error emitting drifting count update: {e}")

    async def _emit_batch_processed(self, processed_ideas: List[dict], discussion_id: str):
        """Emit batch processed event for real-time UI updates"""
        try:
            # Import sio here to avoid circular imports
            from app.core.socketio import sio

            # Prepare ideas for client (remove sensitive data)
            client_ideas = []
            for idea in processed_ideas:
                client_idea = {
                    "id": str(idea["_id"]),
                    "text": idea.get("text", ""),
                    "status": idea.get("status", "completed"),
                    "topic_id": idea.get("topic_id")
                }
                client_ideas.append(client_idea)

            # Calculate updated unclustered count
            unclustered_count = await self.db.ideas.count_documents({
                "discussion_id": discussion_id,
                "topic_id": None
            })

            # Send batch processed event
            await sio.emit('batch_processed', {
                'discussion_id': discussion_id,
                'ideas': client_ideas,
                'count': len(client_ideas),
                'unclustered_count': unclustered_count,
                'incremental_update': True
            }, room=discussion_id)

            logger.debug(f"Emitted batch_processed event for {len(processed_ideas)} ideas in discussion {discussion_id}")

        except Exception as e:
            logger.error(f"Error emitting batch processed event: {e}")
