# --- START OF FILE api.py ---

"""
TopicTrends Backend Implementation
================================

A serverless implementation using FastAPI, MongoDB, and Sentence-BERT
for automatic idea grouping and classification.
"""

from fastapi import FastAPI, HTTPException, Depends, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field # Keep Pydantic imports here as requested
from typing import List, Optional, Dict, Any
from datetime import datetime
import motor.motor_asyncio
from pymongo import MongoClient
from pymongo.errors import ConnectionFailure, ServerSelectionTimeoutError
from bson import Binary, UuidRepresentation
import numpy as np
import uuid
from sentence_transformers import SentenceTransformer
from sklearn.cluster import AgglomerativeClustering
import qrcode
import io
import base64
import os
import socketio

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

# Create a Socket.IO server with CORS settings that match your frontend
sio = socketio.AsyncServer(
    async_mode='asgi',
    cors_allowed_origins=['http://localhost:3000'],
    logger=True,
    engineio_logger=True
)

# Wrap with ASGI application
socket_app = socketio.ASGIApp(sio)

# Mount it to FastAPI
app.mount('/socket.io', socket_app)

# Socket.IO event handlers
@sio.event
async def connect(sid, environ):
    print(f"Socket.IO client connected: {sid}")
    return {"status": "connected"}

@sio.event
async def disconnect(sid):
    print(f"Socket.IO client disconnected: {sid}")

@sio.event
async def join(sid, data):
    """Join a session room for real-time updates"""
    session_id = data
    print(f"Client {sid} joining room {session_id}")
    await sio.enter_room(sid, session_id)
    return {"status": "joined"}

@sio.event
async def leave(sid, data):
    """Leave a session room"""
    session_id = data
    print(f"Client {sid} leaving room {session_id}")
    await sio.leave_room(sid, session_id)
    return {"status": "left"}

# *** MINIMAL CHANGE: Removed emit_to_room function and socket_manager definition ***
# Define a function to emit events
# async def emit_to_room(event, data, room,random): # Removed
#     print(f"Emitting {event} to room {room}")
#     print(f"Emitting {random}")
#     await sio.emit(event, data, room=room)

# Use this in place of socket_manager.emit
# socket_manager = type('', (), {'emit': emit_to_room})() # Removed

# Pydantic models for request/response validation (Kept inline as requested)
class SessionCreate(BaseModel):
    title: str
    prompt: str
    require_verification: bool = False

class IdeaSubmit(BaseModel):
    text: str
    user_id: str
    verified: bool = False
    verification_method: Optional[str] = None

class Idea(BaseModel):
    id: str
    text: str
    user_id: str
    verified: bool
    timestamp: datetime # Keep as datetime here for Pydantic validation
    cluster_id: Optional[str] = None

class Cluster(BaseModel):
    id: str
    # *** MINIMAL CHANGE: Changed representative_idea field name to match usage ***
    representative_idea_id: str # Renamed from representative_idea to match usage below
    representative_text: str
    count: int
    ideas: List[Idea] # Nested ideas should also handle datetime serialization

class Session(BaseModel):
    id: str
    title: str
    prompt: str
    require_verification: bool
    created_at: datetime
    idea_count: int = 0
    cluster_count: int = 0
    join_link: str
    qr_code: str

# Helper functions
async def get_session(session_id: str):
    """Get session by ID or raise 404"""
    session = await db.sessions.find_one({"_id": session_id})
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    return session

def generate_qr_code(url: str) -> str:
    """Generate a QR code as base64 string"""
    qr = qrcode.QRCode(
        version=1,
        error_correction=qrcode.constants.ERROR_CORRECT_L,
        box_size=10,
        border=4,
    )
    qr.add_data(url)
    qr.make(fit=True)

    img = qr.make_image(fill_color="black", back_color="white")

    # Convert to base64
    buffer = io.BytesIO()
    img.save(buffer, format="PNG")
    return f"data:image/png;base64,{base64.b64encode(buffer.getvalue()).decode()}"

async def process_clusters(session_id: str):
    """Process all ideas in a session and create clusters"""
    # Get all ideas for this session
    ideas = await db.ideas.find({"session_id": session_id}).to_list(length=None)

    if not ideas:
        return []

    # Extract text and create embeddings
    texts = [idea["text"] for idea in ideas]
    embeddings = model.encode(texts)

    # Determine optimal number of clusters
    idea_count = len(ideas)
    if idea_count < 10:
        distance_threshold = 0.45
    elif idea_count < 50:
        distance_threshold = 0.35
    else:
        distance_threshold = 0.25

    # Perform clustering
    # Ensure embeddings is a 2D array even if only one idea exists
    if embeddings.ndim == 1:
        embeddings = embeddings.reshape(1, -1)

    # Check if more than one sample exists for clustering
    if embeddings.shape[0] > 1:
        clustering = AgglomerativeClustering(
            n_clusters=None,
            distance_threshold=distance_threshold,
            metric='cosine',
            linkage='average'
        ).fit(embeddings)
        labels = clustering.labels_
    else:
        # If only one idea, assign it to cluster 0
        labels = np.array([0])


    # Group ideas by cluster
    clusters_temp_data = {} # Use temporary name to avoid clash with Pydantic model
    for idx, label in enumerate(labels):
        label_str = str(label)
        if label_str not in clusters_temp_data:
            clusters_temp_data[label_str] = []

        clusters_temp_data[label_str].append({
            "id": str(ideas[idx]["_id"]),
            "text": texts[idx],
            "embedding": embeddings[idx].tolist(),
            "user_id": ideas[idx]["user_id"],
            "verified": ideas[idx]["verified"],
            "timestamp": ideas[idx]["timestamp"] # Keep datetime object here for now
        })

    # For each cluster, find representative idea (closest to centroid)
    cluster_results = []
    for label, cluster_ideas_data in clusters_temp_data.items():
        # Calculate centroid
        cluster_embeddings = np.array([idea["embedding"] for idea in cluster_ideas_data])
        # Handle single-item clusters
        if cluster_embeddings.shape[0] > 1:
            centroid = np.mean(cluster_embeddings, axis=0)
            distances = np.linalg.norm(cluster_embeddings - centroid, axis=1)
            closest_idx = np.argmin(distances)
        else:
            closest_idx = 0

        representative_idea_data = cluster_ideas_data[closest_idx]

        # *** MINIMAL CHANGE: Prepare ideas list for DB and emission, converting timestamp ***
        ideas_for_output = [
            {
                "id": idea["id"],
                "text": idea["text"],
                "user_id": idea["user_id"],
                "verified": idea["verified"],
                # Convert timestamp to ISO string for serialization
                "timestamp": idea["timestamp"].isoformat() if isinstance(idea["timestamp"], datetime) else idea["timestamp"]
            } for idea in cluster_ideas_data
        ]

        # Store cluster in database
        cluster_id = f"{session_id}_{label}"
        await db.clusters.update_one(
            {"_id": cluster_id},
            {"$set": {
                "session_id": session_id,
                "representative_idea_id": representative_idea_data["id"],
                "representative_text": representative_idea_data["text"],
                "count": len(cluster_ideas_data),
                "ideas": ideas_for_output # Store serializable list
            }},
            upsert=True
        )

        # Update each idea with its cluster
        for idea in cluster_ideas_data:
            await db.ideas.update_one(
                {"_id": idea["id"]},
                {"$set": {"cluster_id": cluster_id}}
            )

        # *** MINIMAL CHANGE: Build final result for emission with serializable ideas ***
        cluster_results.append({
            "id": cluster_id,
            "representative_idea_id": representative_idea_data["id"], # Correct field name
            "representative_text": representative_idea_data["text"],
            "count": len(cluster_ideas_data),
            "ideas": ideas_for_output # Use the already serialized list
        })

    # Update session with clustering results
    await db.sessions.update_one(
        {"_id": session_id},
        {"$set": {
            # Use count_documents for accurate count after potential deletions/updates
            "idea_count": await db.ideas.count_documents({"session_id": session_id}),
            "cluster_count": len(cluster_results), # Count generated clusters
            "last_processed": datetime.utcnow()
        }}
    )

    # Log before emitting
    print(f"Emitting clusters_updated to room {session_id} with {len(cluster_results)} clusters")

    # *** MINIMAL CHANGE: Use sio.emit directly with correct arguments ***
    await sio.emit(
        "clusters_updated",
        {"session_id": session_id, "clusters": cluster_results},
        room=session_id # Correctly specify the room argument
    )

    return cluster_results

# API Routes
@app.post("/api/sessions", response_model=Session)
async def create_session(session: SessionCreate):
    """Create a new discussion session"""
    session_id = str(uuid.uuid4())
    # Keep original base_url logic
    base_url = "https://TopicTrends.app"  # Replace with your domain
    join_link = f"{base_url}/join/{session_id}"
    qr_code = generate_qr_code(join_link)

    now = datetime.utcnow()
    session_data = {
        "_id": session_id,
        "title": session.title,
        "prompt": session.prompt,
        "require_verification": session.require_verification,
        "created_at": now,
        "idea_count": 0,
        "cluster_count": 0,
        "join_link": join_link,
        "qr_code": qr_code
    }

    await db.sessions.insert_one(session_data)
    # Keep original return format
    return {**session_data, "id": session_id}

@app.get("/api/sessions/{session_id}", response_model=Session)
async def get_session_details(session_id: str):
    """Get session details by ID"""
    session = await get_session(session_id)
    # Keep original return format
    return {**session, "id": session["_id"]}

@app.post("/api/sessions/{session_id}/ideas")
async def submit_idea(
    session_id: str,
    idea: IdeaSubmit,
    background_tasks: BackgroundTasks
):
    """Submit a new idea to a session"""
    # Validate session exists
    session = await get_session(session_id)

    # Validate verification if required
    if session["require_verification"] and not idea.verified:
        raise HTTPException(
            status_code=400,
            detail="Verification required for this session"
        )

    # Create idea with string ID instead of UUID object
    idea_id = uuid.uuid4()
    idea_data = {
        "_id": str(idea_id),  # Convert UUID to string
        "session_id": session_id,
        "text": idea.text,
        "user_id": idea.user_id,
        "verified": idea.verified,
        "verification_method": idea.verification_method,
        "timestamp": datetime.utcnow(),
        "cluster_id": None  # Will be assigned during processing
    }

    await db.ideas.insert_one(idea_data)

    # Increment idea count
    await db.sessions.update_one(
        {"_id": session_id},
        {"$inc": {"idea_count": 1}}
    )

    # Trigger cluster processing in background
    background_tasks.add_task(process_clusters, session_id)

    # Keep original return format
    return {"id": str(idea_id), "message": "Idea submitted successfully"}

# *** MINIMAL CHANGE: Ensure datetime is handled for serialization in GET routes ***
@app.get("/api/sessions/{session_id}/ideas", response_model=List[Idea]) # Use response_model for consistency
async def get_session_ideas(session_id: str):
    """Get all ideas for a session"""
    # Validate session exists
    await get_session(session_id)

    # Get ideas
    ideas = await db.ideas.find({"session_id": session_id}).to_list(length=None)
    # Convert _id and handle potential datetime before returning
    # Pydantic will handle the final serialization based on the response_model
    return [Idea(id=idea["_id"], **{k: v for k, v in idea.items() if k != '_id'}) for idea in ideas]


@app.get("/api/sessions/{session_id}/clusters", response_model=List[Cluster]) # Use response_model for consistency
async def get_session_clusters(session_id: str):
    """Get all clusters for a session"""
    # Validate session exists
    await get_session(session_id)

    # Get clusters
    clusters = await db.clusters.find({"session_id": session_id}).to_list(length=None)
    # Convert _id and ensure nested ideas/timestamps are handled by Pydantic response_model
    results = []
    for cluster in clusters:
        # Reconstruct nested Ideas to ensure Pydantic validation/serialization
        nested_ideas = [
            Idea(
                id=idea_data["id"],
                text=idea_data["text"],
                user_id=idea_data["user_id"],
                verified=idea_data["verified"],
                # Assuming timestamp in DB is datetime or ISO string parseable by Pydantic
                timestamp=idea_data["timestamp"],
                cluster_id=cluster["_id"] # Add cluster_id
            )
            for idea_data in cluster.get("ideas", [])
        ]
        results.append(
             Cluster(
                id=cluster["_id"],
                representative_idea_id=cluster["representative_idea_id"], # Use corrected field name
                representative_text=cluster["representative_text"],
                count=cluster["count"],
                ideas=nested_ideas
            )
        )
    return results


# Main entry point for serverless function
if __name__ == "__main__":
    import uvicorn
    # Keep original run command
    uvicorn.run(app, host="0.0.0.0", port=8000)

# --- END OF FILE api.py ---