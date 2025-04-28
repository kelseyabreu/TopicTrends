"""
Centralized database connection manager for TopicTrends application.
"""

import motor.motor_asyncio
from pymongo import MongoClient
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
            serverSelectionTimeoutMS=5000,  # 5 second timeout
            connectTimeoutMS=10000,         # 10 second timeout
            uuidRepresentation='standard'   # Fix UUID encoding issues
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