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
async def initialize_database():
    global client, db
    
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
            
    except (ConnectionFailure, ServerSelectionTimeoutError) as e:
        print(f"Failed to connect to MongoDB: {e}")
        raise

# Ensure database is initialized
async def get_db():
    global db
    if db is None:
        await initialize_database()
    return db

# Function to add to FastAPI lifecycle
def init_db(app):
    @app.on_event("startup")
    async def startup_db_client():
        await initialize_database()
        
    @app.on_event("shutdown")
    async def shutdown_db_client():
        global client
        if client:
            client.close()
            print("Disconnected from MongoDB")