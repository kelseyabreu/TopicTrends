# --- START OF FILE api.py ---

"""
TopicTrends Backend Implementation
================================

A serverless implementation using FastAPI, MongoDB, and Sentence-BERT
for automatic idea grouping and classification.
"""
import base64
import io
import os
import uuid
from datetime import datetime
from typing import Any, Dict, List, Optional

import motor.motor_asyncio
import numpy as np
import qrcode
# Helpers
from bson import Binary, UuidRepresentation
from fastapi import BackgroundTasks, Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field  # Keep Pydantic imports here as requested
from pymongo import MongoClient
from pymongo.errors import ConnectionFailure, ServerSelectionTimeoutError
from sentence_transformers import SentenceTransformer
from sklearn.cluster import AgglomerativeClustering

# Initialize FastAPI app
app = FastAPI(title="TopicTrends API")

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],  # Your React app's origin
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["*"],
    expose_headers=["*"],
)

# Initialize MongoDB client - using free tier Atlas
MONGODB_URL = os.environ.get("MONGODB_URL", "mongodb+srv://topictrends-dev:topictrendsdev@topictrends-dev.hy4hbpt.mongodb.net/?retryWrites=true&w=majority&appName=topictrends-dev")
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

# Initialize Sentence-BERT model
try:
    # For sentence-transformers 4.0.2, verify this model name is still available
    # If not, use a recommended alternative from the new version
    model_name = 'all-mpnet-base-v2' #'all-MiniLM-L6-v2'

    # Add a cache path to avoid permission issues
    cache_folder = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'model_cache')
    os.makedirs(cache_folder, exist_ok=True)

    model = SentenceTransformer(
        model_name,
        cache_folder=cache_folder
    )
    print(f"Successfully loaded model: {model_name}")
except Exception as e:
    print(f"Error loading Sentence Transformer model: {e}")
    # Provide a fallback or raise a more informative error
    raise RuntimeError(f"Failed to load language model: {e}")
    
# Main entry point for serverless function
if __name__ == "__main__":
    import uvicorn
    # Keep original run command
    uvicorn.run(app, host="0.0.0.0", port=8000)

# --- END OF FILE api.py ---