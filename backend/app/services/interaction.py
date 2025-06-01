import logging
from datetime import datetime, timedelta, timezone
import uuid
from typing import Optional, Dict, Any, List, Literal, Tuple
from fastapi import BackgroundTasks
from pymongo import ASCENDING, DESCENDING
from app.core.database import get_db
from app.models.interaction_schemas import (
    InteractionEvent, InteractionEventClientInfo,
    EntityMetrics, Metrics, TimeWindowMetricsContainer, HourlyMetric, DailyMetric,
    UserInteractionState, UserState
)
from app.models.query_models import (
    InteractionQueryParameters, 
    PaginatedResponse, 
    FilterCondition, 
    FilterOperator, 
    SortDirection
)
from app.services.query_executor import create_interaction_query_executor

logger = logging.getLogger(__name__)

# parent_id logic is simplified:
# - Topic's parent_id is its discussion_id
# - Idea's parent_id is its discussion_id (could also be topic_id if idea is part of a topic)

class InteractionService:

    async def get_interactions(
        self,
        params: InteractionQueryParameters,
        additional_filter: Optional[Dict[str, Any]] = None
    ) -> PaginatedResponse[InteractionEvent]:
        """
        Get paginated interaction events with filtering, sorting, and search.
        
        Args:
            params: Query parameters for filtering, pagination, and sorting
            additional_filter: Additional filter conditions to apply
            
        Returns:
            Paginated response of interaction events
        """
        # Create a new executor instance for this query
        # This ensures we get a fresh executor with the correct configuration
        executor = create_interaction_query_executor(response_model=InteractionEvent)
        
        # Execute the query with the provided parameters and any additional filters
        return await executor.execute(params, additional_filter)
    
    async def get_interactions_for_entity(
        self,
        params: InteractionQueryParameters,
        entity_type: str,
        entity_id: str
    ) -> PaginatedResponse[InteractionEvent]:
        """
        Get paginated interaction events for a specific entity.
        
        Args:
            params: Query parameters for filtering, pagination, and sorting
            entity_type: The type of entity (discussion, topic, idea)
            entity_id: The ID of the entity
            
        Returns:
            Paginated response of interaction events
        """
        additional_filter = {
            "entity_type": entity_type,
            "entity_id": entity_id
        }
        return await self.get_interactions(params, additional_filter)
    
    async def get_interactions_for_user(
        self,
        params: InteractionQueryParameters,
        user_id: str
    ) -> PaginatedResponse[InteractionEvent]:
        """
        Get paginated interaction events for a specific user.
        
        Args:
            params: Query parameters for filtering, pagination, and sorting
            user_id: The ID of the user
            
        Returns:
            Paginated response of interaction events
        """
        additional_filter = {"user_id": user_id}
        return await self.get_interactions(params, additional_filter)
    
    async def get_interactions_by_action(
        self,
        params: InteractionQueryParameters,
        action_type: Literal["like", "pin", "save", "view"]
    ) -> PaginatedResponse[InteractionEvent]:
        """
        Get paginated interaction events of a specific action type.
        
        Args:
            params: Query parameters for filtering, pagination, and sorting
            action_type: The type of interaction action
            
        Returns:
            Paginated response of interaction events
        """
        additional_filter = {"action_type": action_type}
        return await self.get_interactions(params, additional_filter)

    async def _get_entity_parent_id(self, db, entity_id: str, entity_type: Literal["discussion", "topic", "idea"]) -> Optional[str]:
        """Helper to get parent_id for topic or idea."""
        if entity_type == "topic":
            topic = await db.topics.find_one({"_id": entity_id}, {"discussion_id": 1})
            return str(topic["discussion_id"]) if topic else None
        elif entity_type == "idea":
            idea = await db.ideas.find_one({"_id": entity_id}, {"discussion_id": 1, "topic_id": 1})
            if idea and idea.get("topic_id"):
                return str(idea["topic_id"])
            elif idea and idea.get("discussion_id"):
                return str(idea["discussion_id"])
            return None
        return None

    async def get_saved_entities_for_user(
        self,
        user_id: str, 
        entity_type: Optional[Literal["discussion", "topic", "idea"]] = None,
        limit: int = 50,
        skip: int = 0
    ) -> List[Dict[str, Any]]: 
        db = await get_db()
        query = {
            "user_identifier": user_id,
            "state.saved": True
        }
        if entity_type:
            query["entity_type"] = entity_type
    
        cursor = db.user_interaction_states.find(
            query, {"entity_id": 1, "entity_type": 1, "_id": 0} 
        ).sort([("last_updated_at", -1)]).skip(skip).limit(limit) 
        return await cursor.to_list(length=limit)

    async def record_event_and_update_models(
        self,
        background_tasks: BackgroundTasks,
        entity_id: str,
        entity_type: Literal["discussion", "topic", "idea"],
        action_type: Literal["like", "unlike", "pin", "unpin", "save", "unsave", "view", "rate"],
        user_id: Optional[str] = None,
        anonymous_id: Optional[str] = None,
        client_info_dict: Optional[Dict[str, str]] = None,
        rating_value: Optional[int] = None
    ) -> InteractionEvent:
        """
        Records an event and schedules background tasks to update read models.
        This is the main entry point for interactions.
        """
        db = await get_db()

        # 1. Create and Store InteractionEvent
        event_client_info = InteractionEventClientInfo(**client_info_dict) if client_info_dict else None
        
        # Determine parent_id for context
        parent_id = await self._get_entity_parent_id(db, entity_id, entity_type)

        event = InteractionEvent(
            entity_id=entity_id,
            entity_type=entity_type,
            action_type=action_type,
            user_id=user_id,
            anonymous_id=anonymous_id,
            client_info=event_client_info,
            parent_id=parent_id,
            rating_value=rating_value
        )
        await db.interaction_events.insert_one(event.model_dump(by_alias=True))
        logger.debug(f"Recorded event: {event.id} for entity {entity_id}, action {action_type}")

        # 2. Schedule background tasks for updating read models
        background_tasks.add_task(self.update_entity_metrics_from_event, event.model_dump(by_alias=True))

        # Only update user state if a user identifier is present
        user_identifier = user_id or anonymous_id
        if user_identifier:
            background_tasks.add_task(self.update_user_interaction_state_from_event, event.model_dump(by_alias=True), user_identifier)

        # If this is a rating action, schedule rating metrics recalculation
        if action_type == "rate" and rating_value is not None and user_identifier:
            background_tasks.add_task(self.recalculate_rating_metrics, entity_id, user_identifier, rating_value)

        return event

    async def update_entity_metrics_from_event(self, event_data: Dict[str, Any]):
        """
        Updates EntityMetrics based on a single event.
        Designed to be called by a background task.
        """
        db = await get_db()
        event = InteractionEvent(**event_data)

        entity_id = event.entity_id
        now = event.timestamp 

        # Main update operations for EntityMetrics document
        # We will build this incrementally
        main_update_ops = {"$set": {}, "$inc": {}}
        # This will hold push operations, to be merged into main_update_ops if needed
        push_ops = {} 
        
        main_update_ops["$set"]["metrics.last_activity_at"] = now
        main_update_ops["$set"]["entity_type"] = event.entity_type 
        if event.parent_id:
            main_update_ops["$set"]["parent_id"] = event.parent_id


        if event.action_type == "view":
            main_update_ops["$inc"]["metrics.view_count"] = 1
        elif event.action_type == "like":
            main_update_ops["$inc"]["metrics.like_count"] = 1
        elif event.action_type == "unlike":
            # Ideally, ensure count doesn't go below 0.
            # For now, simple decrement. Client logic should prevent unliking if not liked.
            # If robust non-negative is needed, an aggregation pipeline update or conditional update is better.
            result = await db.entity_metrics.update_one(
                {"_id": entity_id, "metrics.like_count": {"$gt": 0}},
                {"$inc": {"metrics.like_count": -1}}
            )
            if not result.matched_count and not result.upserted_id : 
                 main_update_ops["$set"]["metrics.like_count"] = 0 
            if "metrics.like_count" in main_update_ops["$inc"]:
                del main_update_ops["$inc"]["metrics.like_count"]

        elif event.action_type == "pin":
            main_update_ops["$inc"]["metrics.pin_count"] = 1
        elif event.action_type == "unpin":
            result = await db.entity_metrics.update_one(
                {"_id": entity_id, "metrics.pin_count": {"$gt": 0}},
                {"$inc": {"metrics.pin_count": -1}}
            )
            if not result.matched_count and not result.upserted_id:
                main_update_ops["$set"]["metrics.pin_count"] = 0
            if "metrics.pin_count" in main_update_ops["$inc"]:
                del main_update_ops["$inc"]["metrics.pin_count"]
        
        elif event.action_type == "save":
            main_update_ops["$inc"]["metrics.save_count"] = 1
        elif event.action_type == "unsave":
            result = await db.entity_metrics.update_one(
                {"_id": entity_id, "metrics.save_count": {"$gt": 0}},
                {"$inc": {"metrics.save_count": -1}}
            )
            if not result.matched_count and not result.upserted_id:
                main_update_ops["$set"]["metrics.save_count"] = 0
            if "metrics.save_count" in main_update_ops["$inc"]: 
                del main_update_ops["$inc"]["metrics.save_count"]

        # Time-Window Metrics Update
        hour_timestamp_key = now.replace(minute=0, second=0, microsecond=0)
        date_key = now.strftime("%Y-%m-%d")
        
        if event.action_type in ["view", "like", "pin","save"]:
            metric_key_map = {"view": "views", "like": "likes", "pin": "pins", "save":"saves"}
            action_metric_field = metric_key_map.get(event.action_type)

            if action_metric_field:
                # --- Hourly Update ---
                hourly_match_query = {"_id": entity_id, "time_window_metrics.hourly.timestamp": hour_timestamp_key}
                hourly_update_field = f"time_window_metrics.hourly.$.{action_metric_field}"
                
                res_hourly_inc = await db.entity_metrics.update_one(
                    hourly_match_query,
                    {"$inc": {hourly_update_field: 1}}
                )
                # If the bucket didn't exist to be incremented, we need to add it.
                if res_hourly_inc.matched_count == 0:
                    new_hourly_bucket = HourlyMetric(timestamp=hour_timestamp_key)
                    setattr(new_hourly_bucket, action_metric_field, 1)
                    
                    # Atomically add the bucket IF it's not already there (another task might have just added it)
                    # This uses $addToSet to prevent duplicates if somehow this runs twice for the same new bucket.
                    # Or $push if the timestamp is guaranteed unique for new buckets (which it should be)
                    # For $addToSet to work correctly, the entire object must match.
                    # A more reliable way is to push if the specific timestamp is not in the array.
                    await db.entity_metrics.update_one(
                        {"_id": entity_id, "time_window_metrics.hourly.timestamp": {"$ne": hour_timestamp_key}},
                        {"$push": {"time_window_metrics.hourly": new_hourly_bucket.model_dump()}}
                    )
                    # If the above push failed because another task just added it, the previous inc attempt
                    # might have also failed. One way to ensure the increment happens is to re-try the inc.
                    # However, for simplicity in MVP, we'll assume the push is the primary way to create,
                    # and the inc is for existing. If both fail, a slight undercount on first event to a new bucket is possible.
                    # A more robust solution for high concurrency on new buckets involves more complex logic or
                    # initializing buckets beforehand.

                # --- Daily Update ---
                daily_match_query = {"_id": entity_id, "time_window_metrics.daily.date": date_key}
                daily_update_field = f"time_window_metrics.daily.$.{action_metric_field}"
                res_daily_inc = await db.entity_metrics.update_one(
                    daily_match_query,
                    {"$inc": {daily_update_field: 1}}
                )
                if res_daily_inc.matched_count == 0: 
                    new_daily_bucket = DailyMetric(date=date_key)
                    setattr(new_daily_bucket, action_metric_field, 1)
                    await db.entity_metrics.update_one(
                        {"_id": entity_id, "time_window_metrics.daily.date": {"$ne": date_key}},
                        {"$push": {"time_window_metrics.daily": new_daily_bucket.model_dump()}}
                    )

        # Clean up empty $inc or $set if no operations were added to them
        if not main_update_ops["$inc"]:
            del main_update_ops["$inc"]
        if not main_update_ops["$set"]:
            del main_update_ops["$set"]
        
        # Only perform update if there are operations to apply
        if main_update_ops:
            await db.entity_metrics.update_one(
                {"_id": entity_id},
                main_update_ops, # This only contains $set and $inc for the top-level fields
                upsert=True
            )
            logger.debug(f"Updated EntityMetrics for {entity_id} (main fields) due to event {event.id}")
        else:
            # Ensure document exists if only time-window updates happened
            await db.entity_metrics.update_one(
                {"_id": entity_id},
                {"$setOnInsert": {"entity_type": event.entity_type, "metrics": Metrics().model_dump()}}, # Ensure base structure on insert
                upsert=True
            )
            logger.debug(f"Ensured EntityMetrics doc exists for {entity_id} for event {event.id}")


    async def update_user_interaction_state_from_event(self, event_data: Dict[str, Any], user_identifier: str):
        """
        Updates UserInteractionState based on a single event.
        Designed to be called by a background task.
        user_identifier is user_id or anonymous_id.
        """
        db = await get_db()
        event = InteractionEvent(**event_data)
        
        entity_id = event.entity_id
        now = event.timestamp
        
        # Composite key for UserInteractionState for query
        state_query = {"user_identifier": user_identifier, "entity_id": entity_id}
        
        update_ops = {"$set": {}}
        inc_ops = {} # Separate $inc for clarity
        is_first_view_for_user_entity = False

        current_state_doc = await db.user_interaction_states.find_one(state_query)

        if event.action_type == "view":
            if not current_state_doc or not current_state_doc.get("state", {}).get("first_viewed_at"):
                is_first_view_for_user_entity = True
                update_ops["$set"]["state.first_viewed_at"] = now
            update_ops["$set"]["state.last_viewed_at"] = now
            inc_ops["state.view_count"] = 1
        
        elif event.action_type == "like":
            if not current_state_doc or not current_state_doc.get("state", {}).get("liked", False):
                update_ops["$set"]["state.liked"] = True
        elif event.action_type == "unlike":
            if current_state_doc and current_state_doc.get("state", {}).get("liked", False):
                 update_ops["$set"]["state.liked"] = False
        elif event.action_type == "pin":
            if not current_state_doc or not current_state_doc.get("state", {}).get("pinned", False):
                update_ops["$set"]["state.pinned"] = True
        elif event.action_type == "unpin":
            if current_state_doc and current_state_doc.get("state", {}).get("pinned", False):
                update_ops["$set"]["state.pinned"] = False
        elif event.action_type == "save":
            if not current_state_doc or not current_state_doc.get("state", {}).get("saved", False):
                update_ops["$set"]["state.saved"] = True
        elif event.action_type == "unsave":
            if current_state_doc and current_state_doc.get("state", {}).get("saved", False):
                update_ops["$set"]["state.saved"] = False
        elif event.action_type == "rate":
            # Update user rating immediately (in addition to the background recalculation)
            if event.rating_value is not None:
                update_ops["$set"]["state.user_rating"] = event.rating_value

        update_ops["$set"]["entity_type"] = event.entity_type # Ensure type is set
        update_ops["$set"]["last_updated_at"] = now
        
        final_mongo_update = {}
        if update_ops["$set"]: # only include $set if there's something in it
            final_mongo_update["$set"] = update_ops["$set"]
        if inc_ops:
            final_mongo_update["$inc"] = inc_ops


        if final_mongo_update: # Only update if there are changes
            await db.user_interaction_states.update_one(
                state_query,
                final_mongo_update,
                upsert=True
            )
            logger.debug(f"Updated UserInteractionState for user {user_identifier}, entity {entity_id} due to event {event.id}")
        else:
            # If no state changes but document needs to be upserted (e.g. first event is not a view)
            # ensure document exists with basic info.
            await db.user_interaction_states.update_one(
                state_query,
                {"$setOnInsert": {
                    "entity_type": event.entity_type, 
                    "state": UserState().model_dump(), # Default empty state
                    "last_updated_at": now
                    }
                },
                upsert=True
            )


        # If it was the first view for this user-entity pair, increment unique_view_count on EntityMetrics
        if is_first_view_for_user_entity:
            await db.entity_metrics.update_one(
                {"_id": entity_id}, 
                {"$inc": {"metrics.unique_view_count": 1}},
                upsert=True # Ensure entity_metrics doc exists
            )
            logger.debug(f"Incremented unique_view_count for entity {entity_id} due to first view by {user_identifier}")


    # --- Getter methods for API ---
    async def get_user_interaction_state(self, entity_id: str, user_identifier: Optional[str]) -> Optional[UserState]:
        if not user_identifier:
            return UserState() # Return default empty state for anonymous users without identifier

        db = await get_db()
        doc = await db.user_interaction_states.find_one(
            {"user_identifier": user_identifier, "entity_id": entity_id},
            sort=[("last_updated_at", DESCENDING)]
        )
        return UserState(**doc["state"]) if doc and "state" in doc else UserState()

    async def get_entity_metrics(self, entity_id: str) -> Optional[Metrics]:
        db = await get_db()
        # EntityMetrics uses entity_id as _id
        doc = await db.entity_metrics.find_one({"_id": entity_id})
        return Metrics(**doc["metrics"]) if doc and "metrics" in doc else Metrics()

    async def get_bulk_entity_metrics(self, entity_ids: List[str]) -> Dict[str, Optional[Metrics]]:
        """
        Get metrics for multiple entities in a single database query.
        Returns a dictionary mapping entity_id to Metrics object.
        """
        if not entity_ids:
            return {}

        try:
            db = await get_db()
            # Single query to get all metrics
            cursor = db.entity_metrics.find({"_id": {"$in": entity_ids}})
            metrics_docs = await cursor.to_list(length=None)

            # Build result dictionary
            result = {}
            for doc in metrics_docs:
                entity_id = doc["_id"]
                if "metrics" in doc:
                    result[entity_id] = Metrics(**doc["metrics"])
                else:
                    result[entity_id] = Metrics()

            # Fill in default metrics for entities that don't have metrics
            for entity_id in entity_ids:
                if entity_id not in result:
                    result[entity_id] = Metrics()

            return result

        except Exception as e:
            logger.error(f"Error fetching bulk entity metrics: {e}", exc_info=True)
            # Return default metrics for all entities on error
            return {entity_id: Metrics() for entity_id in entity_ids}

    async def get_bulk_user_interaction_states(self, entity_ids: List[str], user_identifier: Optional[str]) -> Dict[str, Optional[UserState]]:
        """
        Get user interaction states for multiple entities in a single database query.
        Returns a dictionary mapping entity_id to UserState object.
        """
        if not entity_ids or not user_identifier:
            return {entity_id: UserState() for entity_id in entity_ids}

        try:
            db = await get_db()
            # Single query to get all user states
            cursor = db.user_interaction_states.find({
                "entity_id": {"$in": entity_ids},
                "user_identifier": user_identifier
            })
            state_docs = await cursor.to_list(length=None)

            # Build result dictionary
            result = {}
            for doc in state_docs:
                entity_id = doc["entity_id"]
                if "state" in doc:
                    result[entity_id] = UserState(**doc["state"])
                else:
                    result[entity_id] = UserState()

            # Fill in default user states for entities that don't have user states
            for entity_id in entity_ids:
                if entity_id not in result:
                    result[entity_id] = UserState()

            return result

        except Exception as e:
            logger.error(f"Error fetching bulk user interaction states: {e}", exc_info=True)
            # Return default user states for all entities on error
            return {entity_id: UserState() for entity_id in entity_ids}

    async def get_entity_time_window_metrics(self, entity_id: str) -> Optional[TimeWindowMetricsContainer]:
        db = await get_db()
        doc = await db.entity_metrics.find_one({"_id": entity_id})
        return TimeWindowMetricsContainer(**doc["time_window_metrics"]) if doc and "time_window_metrics" in doc else TimeWindowMetricsContainer()

    async def get_pinned_entities_for_user(
        self,
        user_id: str, 
        entity_type: Optional[Literal["discussion", "topic", "idea"]] = None,
        limit: int = 50,
        skip: int = 0
    ) -> List[Dict[str, Any]]: 
        db = await get_db()
        query = {
            "user_identifier": user_id,
            "state.pinned": True
        }
        if entity_type:
            query["entity_type"] = entity_type
        
        cursor = db.user_interaction_states.find(
            query, {"entity_id": 1, "entity_type": 1, "_id": 0} 
        ).sort([("last_updated_at", -1)]).skip(skip).limit(limit) 
        
        return await cursor.to_list(length=limit)

    async def get_trending_entities(
        self,
        entity_type: Literal["discussion", "topic", "idea"],
        limit: int = 10,
        hours_window: int = 24 
    ) -> List[Dict[str, Any]]: 
        db = await get_db()
        
        now = datetime.now(timezone.utc)
        cutoff_time = now - timedelta(hours=hours_window)

        pipeline = [
            {"$match": {"entity_type": entity_type}},
            {"$unwind": "$time_window_metrics.hourly"}, 
            {"$match": {"time_window_metrics.hourly.timestamp": {"$gte": cutoff_time}}},
            {"$group": { 
                "_id": "$_id", 
                "entity_type": {"$first": "$entity_type"},
                "parent_id": {"$first": "$parent_id"},
                "metrics": {"$first": "$metrics"}, 
                "recent_likes": {"$sum": "$time_window_metrics.hourly.likes"},
                "recent_views": {"$sum": "$time_window_metrics.hourly.views"},
                "recent_pins": {"$sum": "$time_window_metrics.hourly.pins"},
                "recent_saves": {"$sum": "$time_window_metrics.hourly.saves"},
            }},
            {"$addFields": { 
                "trending_score": {
                    "$add": [
                        {"$multiply": ["$recent_likes", 3]}, 
                        {"$multiply": ["$recent_pins", 2]},  
                        {"$multiply": ["$recent_saves", 1.5]},
                        "$recent_views"                    
                    ]
                }
            }},
            {"$match": {"trending_score": {"$gt": 0}}},
            {"$sort": {"trending_score": -1}},
            {"$limit": limit},
            {"$project": { 
                "entity_id": "$_id",
                "entity_type": 1,
                "parent_id": 1,
                "metrics": 1, 
                "recent_activity": {
                    "likes": "$recent_likes",
                    "views": "$recent_views",
                    "pins": "$recent_pins",
                    "saves": "$recent_saves"
                },
                "trending_score": 1,
                "_id": 0 
            }}
        ]
        
        results = await db.entity_metrics.aggregate(pipeline).to_list(length=limit)
        return results



    async def recalculate_rating_metrics(
        self,
        entity_id: str,
        user_identifier: str,
        new_rating: int,
        old_rating: Optional[int] = None
    ):
        """
        Recalculates rating metrics ensuring only latest rating per user counts.
        """
        db = await get_db()

        try:
            # Get all latest ratings for this entity (one per user)
            pipeline = [
                {"$match": {
                    "entity_id": entity_id,
                    "action_type": "rate",
                    "rating_value": {"$exists": True}
                }},
                {"$addFields": {
                    "user_identifier": {
                        "$ifNull": ["$user_id", "$anonymous_id"]
                    }
                }},
                {"$sort": {"timestamp": -1}},
                {"$group": {
                    "_id": "$user_identifier",
                    "latest_rating": {"$first": "$rating_value"},
                    "timestamp": {"$first": "$timestamp"}
                }},
                {"$group": {
                    "_id": None,
                    "ratings": {"$push": "$latest_rating"},
                    "total_votes": {"$sum": 1},
                    "rating_sum": {"$sum": "$latest_rating"}
                }}
            ]

            result = await db.interaction_events.aggregate(pipeline).to_list(length=1)

            if result:
                data = result[0]
                total_votes = data["total_votes"]
                rating_sum = data["rating_sum"]
                average_rating = rating_sum / total_votes if total_votes > 0 else 0

                # Calculate rating distribution
                ratings = data["ratings"]
                rating_distribution = {str(i): 0 for i in range(11)}
                for rating in ratings:
                    rating_distribution[str(rating)] += 1
            else:
                total_votes = 0
                rating_sum = 0
                average_rating = 0
                rating_distribution = {str(i): 0 for i in range(11)}

            # Update entity metrics
            await db.entity_metrics.update_one(
                {"_id": entity_id},
                {
                    "$set": {
                        "metrics.rating_count": total_votes,
                        "metrics.rating_sum": rating_sum,
                        "metrics.average_rating": round(average_rating, 2),
                        "metrics.rating_distribution": rating_distribution,
                        "metrics.last_activity_at": datetime.now(timezone.utc)
                    }
                },
                upsert=True
            )

            # Update user interaction state
            await db.user_interaction_states.update_one(
                {
                    "user_identifier": user_identifier,
                    "entity_id": entity_id
                },
                {
                    "$set": {
                        "state.user_rating": new_rating,
                        "last_updated_at": datetime.now(timezone.utc)
                    },
                    "$setOnInsert": {
                        "entity_type": "idea",  # Assuming ratings are for ideas
                        "state": UserState(user_rating=new_rating).model_dump()
                    }
                },
                upsert=True
            )

            logger.debug(f"Updated rating metrics for entity {entity_id}: {total_votes} votes, avg {average_rating}")

        except Exception as e:
            logger.error(f"Error recalculating rating metrics for entity {entity_id}: {e}", exc_info=True)

# Singleton instance
interaction_service = InteractionService()