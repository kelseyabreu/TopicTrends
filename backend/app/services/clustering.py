# TODO: Delete this, its no longer used.
from datetime import datetime
import numpy as np

from app.core.database import db
from app.core.ml import encode_texts, cluster_embeddings
from app.core.socketio import sio

async def process_clusters(session_id: str):
    """Process all ideas in a session and create clusters"""
    # Get all ideas for this session
    ideas = await db.ideas.find({"session_id": session_id}).to_list(length=None)

    if not ideas:
        return []

    # Extract text and create embeddings
    texts = [idea["text"] for idea in ideas]
    embeddings = encode_texts(texts)

    # Perform clustering
    labels = cluster_embeddings(embeddings, len(ideas))

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

        # Prepare ideas list for DB and emission, converting timestamp
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

        # Build final result for emission with serializable ideas
        cluster_results.append({
            "id": cluster_id,
            "representative_idea_id": representative_idea_data["id"],
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

    # Use sio.emit directly with correct arguments
    await sio.emit(
        "clusters_updated",
        {"session_id": session_id, "clusters": cluster_results},
        room=session_id # Correctly specify the room argument
    )

    return cluster_results