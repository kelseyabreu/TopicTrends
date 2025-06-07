"""
Centralized database connection manager for TopicTrends application.
"""

import motor.motor_asyncio
from pymongo import MongoClient, ASCENDING, DESCENDING
from pymongo.errors import ConnectionFailure, ServerSelectionTimeoutError
import logging
import os
from typing import Optional

# Setup logging
logger = logging.getLogger(__name__)

# Global variables
client: Optional[motor.motor_asyncio.AsyncIOMotorClient] = None
db: Optional[motor.motor_asyncio.AsyncIOMotorDatabase] = None

async def initialize_database():
    """Initialize MongoDB connection and set up global client and db objects."""
    global client, db
    
    # Get MongoDB URI from environment variable
    mongodb_url = os.environ.get("MONGODB_URL")
    if not mongodb_url:
        logger.error("MONGODB_URL environment variable not set")
        raise ValueError("MONGODB_URL environment variable is required")

    try:
        logger.info("Connecting to MongoDB...")
        client = motor.motor_asyncio.AsyncIOMotorClient(
            mongodb_url,
            # Million-user performance settings
            maxPoolSize=500,                # Massive connection pool for high concurrency
            minPoolSize=20,                 # Higher minimum connections
            maxIdleTimeMS=30000,           # 30 second idle timeout
            serverSelectionTimeoutMS=5000,  # 5 second timeout
            connectTimeoutMS=10000,         # 10 second timeout
            socketTimeoutMS=20000,         # 20 second socket timeout
            waitQueueTimeoutMS=5000,       # 5 second wait queue timeout
            retryWrites=True,              # Enable retry writes
            retryReads=True,               # Enable retry reads
            uuidRepresentation='standard', # Fix UUID encoding issues
            # Optimize for maximum throughput
            compressors='zlib',     # Enable compression
            zlibCompressionLevel=6,        # Balanced compression
            # Additional optimizations for bulk operations
            maxConnecting=50,              # Allow more concurrent connections
        )
        # Force a connection to verify it works
        await client.admin.command('ping')
        logger.info("Connected to MongoDB!")
        db = client.TopicTrends
        
        # Initialize collections if they don't exist
        collections = await db.list_collection_names()
        if "users" not in collections:
            await db.create_collection("users")
        if "discussions" not in collections:
            await db.create_collection("discussions")
        if "ideas" not in collections:
            await db.create_collection("ideas")
        if "topics" not in collections:
            await db.create_collection("topics")
        if "password_reset_tokens" not in collections:
            await db.create_collection("password_reset_tokens")
        if "interaction_events" not in collections:
            await db.create_collection("interaction_events")
        if "entity_metrics" not in collections:
            await db.create_collection("entity_metrics")
        if "user_interaction_states" not in collections:
            await db.create_collection("user_interaction_states")

        # --- Ensure minimal indexes (these consider 100-200 million ideas in 10-20 minutes) ---
        await db.ideas.create_index([("discussion_id", ASCENDING), ("timestamp", DESCENDING)], name="idx_ideas_discussion_time_critical")
        await db.users.create_index([("email", ASCENDING)], name="idx_users_email", unique=True)
        await db.topics.create_index([("discussion_id", ASCENDING), ("count", DESCENDING)], name="idx_topics_discussion_count_read")
        await db.discussions.create_index([("created_at", DESCENDING)], name="idx_discussions_created_at_list")
        await db.interaction_events.create_index([("entity_id", ASCENDING), ("entity_type", ASCENDING), ("action_type", ASCENDING)], name="idx_interaction_entity_action_core")
        await db.user_interaction_states.create_index([("user_identifier", ASCENDING), ("entity_id", ASCENDING), ("last_updated_at", DESCENDING)], name="idx_userstate_user_entity_lookup")
        await db.entity_metrics.create_index([("entity_type", ASCENDING), ("metrics.last_activity_at", DESCENDING)], name="idx_entity_metrics_type_activity_trending")
        await db.password_reset_tokens.create_index([("token", ASCENDING)], name="idx_pwd_reset_token_lookup", unique=True)

        # TODO delete when it becomes a problem. These text indexes make it about 4-5 times slow to do writes, eventually offload to OpenSearch, Elasticsearch, Atlas Search
        await db.ideas.create_index([("text", "text"), ("keywords", "text")], name="ideas_text_search_index")

        return db
            
    except (ConnectionFailure, ServerSelectionTimeoutError) as e:
        logger.error(f"Failed to connect to MongoDB: {e}")
        raise

async def get_db():
    """Get database instance, initializing if needed."""
    global db
    if db is None:
        await initialize_database()
    return db

def init_db(app):
    """Add database lifecycle event handlers to FastAPI app."""
    @app.on_event("startup")
    async def startup_db_client():
        await initialize_database()
        
    @app.on_event("shutdown")
    async def shutdown_db_client():
        global client
        if client:
            client.close()
            logger.info("Disconnected from MongoDB")