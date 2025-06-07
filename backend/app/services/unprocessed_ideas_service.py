"""
Unprocessed Ideas Service - Minimal implementation for managing unprocessed ideas.

Handles ideas that need embedding generation or topic clustering.
Provides simple categorization and retry functionality.
"""

from datetime import datetime, timedelta
from typing import List, Dict, Any
from app.core.database import get_db
from app.models.query_models import PaginatedResponse, PaginationMetadata, QueryMetadata, IdeaQueryParameters
import logging

logger = logging.getLogger(__name__)

class UnprocessedIdeasService:
    """Service for managing ideas that are stuck in the processing pipeline"""
    
    STUCK_TIMEOUT_MINUTES = 10  # Consider stuck after 10 minutes of no progress

    async def get_unprocessed_ideas_with_params(self, discussion_id: str, params: IdeaQueryParameters) -> Dict[str, Any]:
        """
        Get paginated unprocessed ideas using standardized query parameters.
        This method follows the same pattern as other endpoints in the codebase.
        """
        import time
        query_start_time = time.perf_counter()

        db = await get_db()

        # First, update stuck status based on time elapsed
        await self._mark_stuck_ideas(discussion_id)

        # Calculate skip for pagination
        skip = (params.page - 1) * params.page_size

        # Build base match for discussion
        base_match = {"discussion_id": discussion_id}

        # Add status filter if provided
        if hasattr(params, 'filters') and params.filters:
            for filter_condition in params.filters:
                if filter_condition.field == 'status':
                    status_filter = filter_condition.value
                    if status_filter and status_filter != 'all':
                        base_match["status"] = status_filter
                    break

        # Build aggregation pipeline to get filtered ideas with category labels
        pipeline = [
            # Match ideas for this discussion with optional status filter
            {"$match": base_match},

            # Add category field based on processing state
            {"$addFields": {
                "category": {
                    "$cond": {
                        "if": {"$eq": ["$embedding", None]},
                        "then": "needs_embedding",
                        "else": {
                            "$cond": {
                                "if": {"$eq": ["$topic_id", None]},
                                "then": "needs_clustering",
                                "else": "completed"
                            }
                        }
                    }
                }
            }},

            # Filter based on tab selection
            {"$match": self._get_tab_filter(params)},

            # Sort by timestamp (newest first) - can be overridden by params.sort
            {"$sort": {(params.sort or "timestamp"): -1 if (params.sort_dir and params.sort_dir.value == "desc") else 1}},
        ]

        # Apply search filter if provided
        if params.search:
            pipeline.insert(-1, {
                "$match": {
                    "$text": {"$search": params.search}
                }
            })

        # Get total count for pagination
        count_pipeline = pipeline + [{"$count": "total"}]
        count_result = await db.ideas.aggregate(count_pipeline).to_list(None)
        total_items = count_result[0]["total"] if count_result else 0

        # Get paginated results
        paginated_pipeline = pipeline + [
            {"$skip": skip},
            {"$limit": params.page_size}
        ]

        drifting_ideas = await db.ideas.aggregate(paginated_pipeline).to_list(None)

        # Format ideas for response
        formatted_ideas = [self._format_idea(idea) for idea in drifting_ideas]

        # Calculate execution time
        exec_time_ms = (time.perf_counter() - query_start_time) * 1000

        # Calculate pagination metadata following TanStack standards
        total_pages = (total_items + params.page_size - 1) // params.page_size if total_items > 0 else 1
        current_page_for_meta = min(params.page, total_pages) if total_items > 0 else 1

        pagination_metadata = PaginationMetadata(
            page=current_page_for_meta,
            page_size=params.page_size,
            total_items=total_items,
            total_pages=total_pages,
            has_previous=current_page_for_meta > 1 and total_items > 0,
            has_next=current_page_for_meta < total_pages and total_items > 0
        )

        query_metadata = QueryMetadata(
            search_term_used=params.search,
            filters_applied={"discussion_id": discussion_id, "status": "drifting"},
            sort_by=params.sort or "timestamp",
            sort_direction=params.sort_dir.value if params.sort_dir else "desc",
            execution_time_ms=exec_time_ms
        )

        # Create standardized paginated response
        paginated_response = PaginatedResponse[Dict[str, Any]](
            items=formatted_ideas,
            pagination=pagination_metadata,
            query_metadata=query_metadata
        )

        # Convert to TanStack format and add category counts
        response_dict = paginated_response.to_tanstack_response()

        # Add category-specific counts for frontend
        total_embedding = await db.ideas.count_documents({
            "discussion_id": discussion_id,
            "embedding": None
        })

        total_clustering = await db.ideas.count_documents({
            "discussion_id": discussion_id,
            "embedding": {"$ne": None},
            "topic_id": None
        })

        # Get counts by status for accurate analytics
        status_counts = {}
        for status in ["pending", "processing", "embedded", "completed", "failed", "stuck"]:
            count = await db.ideas.count_documents({
                "discussion_id": discussion_id,
                "status": status
            })
            status_counts[status] = count

        response_dict["category_counts"] = {
            "needs_embedding": total_embedding,
            "needs_clustering": total_clustering,
            "total_unprocessed": total_embedding + total_clustering
        }

        response_dict["status_counts"] = status_counts

        logger.info(f"Page {params.page}: Returned {len(formatted_ideas)} unprocessed ideas (total: {total_items})")

        return response_dict

    def _get_tab_filter(self, params: IdeaQueryParameters) -> Dict[str, Any]:
        """Get MongoDB filter based on tab selection"""
        # Check for tab filter in params.filters (list of FilterCondition objects)
        tab_filter = None
        if hasattr(params, 'filters') and params.filters:
            for filter_condition in params.filters:
                if filter_condition.field == 'tab':
                    tab_filter = filter_condition.value
                    break

        if tab_filter == 'embedding':
            return {"category": "needs_embedding"}
        elif tab_filter == 'clustering':
            return {"category": "needs_clustering"}
        elif tab_filter == 'pending':
            return {"status": "pending"}
        elif tab_filter == 'stuck':
            return {"status": "stuck"}
        elif tab_filter == 'failed':
            return {"status": "failed"}
        elif tab_filter == 'all':
            # For 'all' tab, show only unprocessed ideas (exclude completed)
            return {"category": {"$in": ["needs_embedding", "needs_clustering"]}}
        else:
            # Default: show all unprocessed ideas
            return {"category": {"$in": ["needs_embedding", "needs_clustering"]}}

    async def get_unprocessed_ideas(self, discussion_id: str, page: int = 1, page_size: int = 20) -> Dict[str, Any]:
        """
        Get paginated unprocessed ideas following TanStack standards.

        Returns a standardized paginated response with all unprocessed ideas
        (both needs_embedding and needs_clustering) in a single list.
        """
        import time
        query_start_time = time.perf_counter()

        db = await get_db()

        # First, update stuck status based on time elapsed
        await self._mark_stuck_ideas(discussion_id)

        # Calculate skip for pagination
        skip = (page - 1) * page_size

        # Build aggregation pipeline to get all drifting ideas with category labels
        pipeline = [
            # Match all ideas for this discussion
            {"$match": {"discussion_id": discussion_id}},

            # Add category field based on processing state
            {"$addFields": {
                "category": {
                    "$cond": {
                        "if": {"$eq": ["$embedding", None]},
                        "then": "needs_embedding",
                        "else": {
                            "$cond": {
                                "if": {"$eq": ["$topic_id", None]},
                                "then": "needs_clustering",
                                "else": "completed"
                            }
                        }
                    }
                }
            }},

            # Filter to only unprocessed ideas (exclude completed ones)
            {"$match": {"category": {"$in": ["needs_embedding", "needs_clustering"]}}},

            # Sort by timestamp (newest first)
            {"$sort": {"timestamp": -1}},
        ]

        # Get total count for pagination
        count_pipeline = pipeline + [{"$count": "total"}]
        count_result = await db.ideas.aggregate(count_pipeline).to_list(None)
        total_items = count_result[0]["total"] if count_result else 0

        # Get paginated results
        paginated_pipeline = pipeline + [
            {"$skip": skip},
            {"$limit": page_size}
        ]

        unprocessed_ideas = await db.ideas.aggregate(paginated_pipeline).to_list(None)

        # Format ideas for response
        formatted_ideas = [self._format_idea(idea) for idea in unprocessed_ideas]

        # Calculate execution time
        exec_time_ms = (time.perf_counter() - query_start_time) * 1000

        # Calculate pagination metadata following TanStack standards
        total_pages = (total_items + page_size - 1) // page_size if total_items > 0 else 1
        current_page_for_meta = min(page, total_pages) if total_items > 0 else 1

        pagination_metadata = PaginationMetadata(
            page=current_page_for_meta,
            page_size=page_size,
            total_items=total_items,
            total_pages=total_pages,
            has_previous=current_page_for_meta > 1 and total_items > 0,
            has_next=current_page_for_meta < total_pages and total_items > 0
        )

        query_metadata = QueryMetadata(
            search_term_used=None,
            filters_applied={"discussion_id": discussion_id, "status": "drifting"},
            sort_by="timestamp",
            sort_direction="desc",
            execution_time_ms=exec_time_ms
        )

        # Create standardized paginated response
        paginated_response = PaginatedResponse[Dict[str, Any]](
            items=formatted_ideas,
            pagination=pagination_metadata,
            query_metadata=query_metadata
        )

        # Convert to TanStack format and add category counts
        response_dict = paginated_response.to_tanstack_response()

        # Add category-specific counts for frontend
        total_embedding = await db.ideas.count_documents({
            "discussion_id": discussion_id,
            "embedding": None
        })

        total_clustering = await db.ideas.count_documents({
            "discussion_id": discussion_id,
            "embedding": {"$ne": None},
            "topic_id": None
        })

        # Get accurate status counts for analytics
        status_counts = {}
        for status in ["pending", "processing", "embedded", "completed", "failed", "stuck"]:
            count = await db.ideas.count_documents({
                "discussion_id": discussion_id,
                "status": status
            })
            status_counts[status] = count

        response_dict["category_counts"] = {
            "needs_embedding": total_embedding,
            "needs_clustering": total_clustering,
            "total_unprocessed": total_embedding + total_clustering
        }

        response_dict["status_counts"] = status_counts

        logger.info(f"Page {page}: Returned {len(formatted_ideas)} unprocessed ideas (total: {total_items})")

        return response_dict
    
    async def _mark_stuck_ideas(self, discussion_id: str):
        """Mark ideas as stuck if they've been trying for too long"""
        db = await get_db()
        stuck_threshold = datetime.utcnow() - timedelta(minutes=self.STUCK_TIMEOUT_MINUTES)
        
        # Mark embedding attempts as stuck - Fix field name to match schema
        embedding_result = await db.ideas.update_many(
            {
                "discussion_id": discussion_id,
                "embedding": None,
                "last_attempt": {"$lt": stuck_threshold},
                "status": "pending"  
            },
            {
                "$set": {
                    "status": "stuck",  
                    "stuck_reason": "embedding_failed"
                }
            }
        )

        # Mark clustering attempts as stuck - Fix field name to match schema
        clustering_result = await db.ideas.update_many(
            {
                "discussion_id": discussion_id,
                "embedding": {"$ne": None},
                "topic_id": None,
                "last_attempt": {"$lt": stuck_threshold},
                "status": "pending"  
            },
            {
                "$set": {
                    "status": "stuck",  
                    "stuck_reason": "clustering_failed"
                }
            }
        )
        
        if embedding_result.modified_count > 0:
            logger.info(f"Marked {embedding_result.modified_count} embedding attempts as stuck")
        if clustering_result.modified_count > 0:
            logger.info(f"Marked {clustering_result.modified_count} clustering attempts as stuck")
    
    async def retry_embeddings(self, discussion_id: str, idea_ids: List[str] = None) -> Dict[str, Any]:
        """Reset and retry ideas that need embeddings (all or specific ones)"""
        db = await get_db()

        # Build query filter
        query_filter = {
            "discussion_id": discussion_id,
            "embedding": None
        }

        # If specific idea IDs provided, filter by them
        if idea_ids:
            query_filter["_id"] = {"$in": idea_ids}

        # Reset status for matching ideas - Fix field name
        result = await db.ideas.update_many(
            query_filter,
            {
                "$set": {
                    "status": "pending",  
                    "stuck_reason": None
                },
                "$currentDate": {"last_attempt": True}
            }
        )

        # Get ideas to process
        ideas_to_process = await db.ideas.find(query_filter).to_list(None)

        # Trigger background processing
        if ideas_to_process:
            import asyncio
            from app.services.batch_processor import ParallelEmbeddingProcessor
            processor = ParallelEmbeddingProcessor()
            asyncio.create_task(processor.process_ideas_for_embedding(ideas_to_process))

        # Emit WebSocket event for unprocessed count update
        await self._emit_unprocessed_count_update(discussion_id)

        action_type = "selected" if idea_ids else "all"
        logger.info(f"Queued {len(ideas_to_process)} {action_type} ideas for embedding retry in discussion {discussion_id}")

        return {
            "status": "success",
            "queued": len(ideas_to_process),
            "message": f"Queued {len(ideas_to_process)} {action_type} ideas for embedding processing"
        }
    
    async def retry_clustering(self, discussion_id: str, idea_ids: List[str] = None) -> Dict[str, Any]:
        """Reset and retry ideas that need clustering (all or specific ones)"""
        db = await get_db()

        # Build query filter
        query_filter = {
            "discussion_id": discussion_id,
            "embedding": {"$ne": None},
            "topic_id": None
        }

        # If specific idea IDs provided, filter by them
        if idea_ids:
            query_filter["_id"] = {"$in": idea_ids}

        # Reset status for matching ideas - Fix field name
        result = await db.ideas.update_many(
            query_filter,
            {
                "$set": {
                    "status": "pending",
                    "stuck_reason": None
                },
                "$currentDate": {"last_attempt": True}
            }
        )

        # Get ideas to process
        ideas_to_process = await db.ideas.find(query_filter).to_list(None)

        # Trigger clustering
        if ideas_to_process:
            import asyncio
            from app.services.clustering_coordinator import ClusteringCoordinator
            coordinator = ClusteringCoordinator()
            asyncio.create_task(coordinator.process_realtime_batch(discussion_id, ideas_to_process))

        # Emit WebSocket event for unprocessed count update
        await self._emit_unprocessed_count_update(discussion_id)

        action_type = "selected" if idea_ids else "all"
        logger.info(f"Queued {len(ideas_to_process)} {action_type} ideas for clustering retry in discussion {discussion_id}")

        return {
            "status": "success",
            "queued": len(ideas_to_process),
            "message": f"Queued {len(ideas_to_process)} {action_type} ideas for clustering"
        }

    async def retry_failed_ideas(self, discussion_id: str, idea_ids: List[str] = None) -> Dict[str, Any]:
        """Reset and retry ideas that have failed processing"""
        db = await get_db()

        # Build query filter for failed ideas
        query_filter = {
            "discussion_id": discussion_id,
            "status": "failed"
        }

        # If specific idea IDs provided, filter by them
        if idea_ids:
            query_filter["_id"] = {"$in": idea_ids}

        # Reset status for matching ideas
        result = await db.ideas.update_many(
            query_filter,
            {
                "$set": {
                    "status": "pending",
                    "stuck_reason": None
                },
                "$currentDate": {"last_attempt": True}
            }
        )

        # Get ideas to process
        ideas_to_process = await db.ideas.find(query_filter).to_list(None)

        # Queue ideas for processing based on their needs
        if ideas_to_process:
            # Separate ideas by what they need
            needs_embedding = [idea for idea in ideas_to_process if idea.get('embedding') is None]
            needs_clustering = [idea for idea in ideas_to_process if idea.get('embedding') is not None and idea.get('topic_id') is None]

            # Queue embedding processing
            if needs_embedding:
                from app.services.batch_processor import idea_processing_service
                for idea in needs_embedding:
                    await idea_processing_service.queue_idea(str(idea['_id']), discussion_id)

            # Queue clustering processing
            if needs_clustering:
                import asyncio
                from app.services.clustering_coordinator import ClusteringCoordinator
                coordinator = ClusteringCoordinator()
                asyncio.create_task(coordinator.process_realtime_batch(discussion_id, needs_clustering))

        # Emit WebSocket event for unprocessed count update
        await self._emit_unprocessed_count_update(discussion_id)

        action_type = "selected" if idea_ids else "all"
        logger.info(f"Queued {len(ideas_to_process)} {action_type} failed ideas for retry in discussion {discussion_id}")

        return {
            "status": "success",
            "queued": len(ideas_to_process),
            "needs_embedding": len([idea for idea in ideas_to_process if idea.get('embedding') is None]),
            "needs_clustering": len([idea for idea in ideas_to_process if idea.get('embedding') is not None and idea.get('topic_id') is None]),
            "message": f"Queued {len(ideas_to_process)} {action_type} failed ideas for retry"
        }
    
    async def clear_stuck_clustering_lock(self, discussion_id: str) -> Dict[str, Any]:
        """Clear stuck Big Bang clustering lock that prevents Real-Time processing"""
        try:
            from app.core.redis import get_redis
            from app.core.config import settings

            redis = await get_redis()
            lock_key = f"{settings.CLUSTERING_LOCK_KEY_PREFIX}{discussion_id}"

            # Check if lock exists
            lock_exists = await redis.exists(lock_key)
            if lock_exists:
                # Clear the lock
                await redis.delete(lock_key)
                logger.info(f"Cleared stuck Big Bang clustering lock for discussion {discussion_id}")

                # Also process any queued ideas
                from app.services.clustering_coordinator import ClusteringCoordinator
                coordinator = ClusteringCoordinator()
                await coordinator.process_queued_ideas(discussion_id)

                return {
                    "status": "success",
                    "message": "Cleared stuck clustering lock and processed queued ideas"
                }
            else:
                return {
                    "status": "info",
                    "message": "No clustering lock found"
                }

        except Exception as e:
            logger.error(f"Error clearing clustering lock: {e}")
            return {
                "status": "error",
                "message": f"Failed to clear lock: {str(e)}"
            }

    async def _emit_unprocessed_count_update(self, discussion_id: str):
        """Emit WebSocket event with updated unprocessed counts"""
        try:
            from app.core.socketio import sio
            db = await get_db()

            # Get current counts
            total_embedding = await db.ideas.count_documents({
                "discussion_id": discussion_id,
                "embedding": None
            })

            total_clustering = await db.ideas.count_documents({
                "discussion_id": discussion_id,
                "embedding": {"$ne": None},
                "topic_id": None
            })

            total_unprocessed = total_embedding + total_clustering

            # Emit update to discussion room
            await sio.emit('unprocessed_count_updated', {
                'discussion_id': discussion_id,
                'total_unprocessed': total_unprocessed,
                'needs_embedding': total_embedding,
                'needs_clustering': total_clustering
            }, room=discussion_id)

            logger.debug(f"Emitted unprocessed count update for discussion {discussion_id}: {total_unprocessed} total")

        except Exception as e:
            logger.error(f"Error emitting unprocessed count update: {e}")

    def _format_idea(self, idea: Dict) -> Dict:
        """Format idea for client consumption"""
        return {
            "id": str(idea["_id"]),
            "text": idea.get("text", ""),
            "status": idea.get("status", "pending"), 
            "stuck_reason": idea.get("stuck_reason"),
            "last_attempt": idea.get("last_attempt").isoformat() if idea.get("last_attempt") else None,
            "timestamp": idea.get("timestamp").isoformat() if idea.get("timestamp") else None,
            "submitter_display_id": idea.get("submitter_display_id", "anonymous"),
            "category": idea.get("category", "unknown") 
        }
