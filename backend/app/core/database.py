import motor.motor_asyncio
from pymongo import MongoClient
from pymongo.errors import ConnectionFailure, ServerSelectionTimeoutError
import os

# MongoDB connection string
MONGODB_URL = os.environ.get(
    "MONGODB_URL", 
    "mongodb+srv://topictrends-dev:topictrendsdev@topictrends-dev.hy4hbpt.mongodb.net/?retryWrites=true&w=majority&appName=topictrends-dev"
)

# Create async MongoDB client
try:
    client = motor.motor_asyncio.AsyncIOMotorClient(
        MONGODB_URL,
        serverSelectionTimeoutMS=5000,  # 5 second timeout
        connectTimeoutMS=10000,         # 10 second timeout
        uuidRepresentation='standard'   # Fix UUID encoding issues
    )
    # Force a connection to verify it works
    client.admin.command('ping')
    print("Connected to MongoDB!")
    db = client.TopicTrends
except (ConnectionFailure, ServerSelectionTimeoutError) as e:
    print(f"Failed to connect to MongoDB: {e}")
    # In production, you might want to handle this differently
    raise