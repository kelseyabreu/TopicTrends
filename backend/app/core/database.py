import motor.motor_asyncio
from pymongo import MongoClient
from pymongo.errors import ConnectionFailure, ServerSelectionTimeoutError
import os
import asyncio

# MongoDB connection string
MONGODB_URL = os.environ.get(
    "MONGODB_URL", 
    "mongodb+srv://topictrends-dev:topictrendsdev@topictrends-dev.hy4hbpt.mongodb.net/?retryWrites=true&w=majority&appName=topictrends-dev"
)

# Create global variables
client = None
db = None

# Initialization function
async def connect_to_mongodb():
    """Establish connection to MongoDB and initialize database collections
    
    This function creates a connection to MongoDB using the configured URL,
    initializes the database, and creates collections if they don't exist.
    """
    global client, db
    
    if client is not None:
        print("Database connection already established")
        return db
    
    try:
        client = motor.motor_asyncio.AsyncIOMotorClient(
            MONGODB_URL,
            serverSelectionTimeoutMS=5000,  # 5 second timeout
            connectTimeoutMS=10000,         # 10 second timeout
            uuidRepresentation='standard'   # Fix UUID encoding issues
        )
        # Force a connection to verify it works
        await client.admin.command('ping')
        print("Connected to MongoDB!")
        db = client.TopicTrends
        
        # Initialize collections if they don't exist
        collections = await db.list_collection_names()
        if "users" not in collections:
            await db.create_collection("users")
        if "sessions" not in collections:
            await db.create_collection("sessions")
        if "ideas" not in collections:
            await db.create_collection("ideas")
        if "clusters" not in collections:
            await db.create_collection("clusters")
        
        return db
            
    except (ConnectionFailure, ServerSelectionTimeoutError) as e:
        print(f"Failed to connect to MongoDB: {e}")
        raise

# Getter for the database object
def get_db_instance():
    """Get the database instance
    
    Returns the global database instance after it has been initialized.
    No more async/await needed when calling this function.
    """
    global db
    if db is None:
        print("Warning: Database accessed before initialization!")
    return db

# Function to add to FastAPI lifecycle
def register_db_lifecycle_hooks(app):
    """Register database connection and shutdown events with FastAPI application
    
    This function registers startup and shutdown event handlers with the FastAPI application
    to manage the database connection lifecycle.
    """
    @app.on_event("startup")
    async def startup_db_client():
        """Initialize database on application startup"""
        global db
        db = await connect_to_mongodb()
        print("Database connection established during application startup")
        
    @app.on_event("shutdown")
    async def shutdown_db_client():
        global client
        if client:
            client.close()
            print("Disconnected from MongoDB")