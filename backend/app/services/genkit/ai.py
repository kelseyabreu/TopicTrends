import json
from pydantic import BaseModel, Field
from genkit.ai import Genkit
from genkit.plugins.google_genai import GoogleAI
ai = Genkit(
    plugins=[
        Ollama(
           models=[
               ModelDefinition(name='gemma3'),
               ModelDefinition(name='mistral-nemo'),
           ],
           embedders=[
               EmbeddingModelDefinition(
                   name='nomic-embed-text',
                   dimensions=512,
               )
           ],
    )],
)

async def process_clusters(session_id: str):
    # Fetch all ideas for the session
    ideas = await get_ideas_by_session_id(session_id)

    if not ideas:
        return []

    # Extract text and create embeddings
    texts = [idea["text"] for idea in ideas]
    embeddings = await ai.embed(
                            embedder='ollama/nomic-embed-text',
                            documents=[Document.from_text(texts)],
                        )

    # Determine optimal number of clusters
    # Higher threshold for smaller datasets, lower threshold for larger datasets (easier to cluster)
    idea_count = len(ideas)
    if idea_count < 10:
        distance_threshold = 0.45
    elif idea_count < 50:
        distance_threshold = 0.35
    else:
        distance_threshold = 0.25

    # Perform clustering
    if embeddings.ndim == 1:
        embeddings = embeddings.reshape(1, -1)

    if embeddings.shape[0] > 1:
        clustering = AgglomerativeClustering(
            n_clusters=None,
            distance_threshold=distance_threshold,
            metric='cosine',
            linkage='average'
        ).fit(embeddings)
        labels = clustering.labels_
    else:
        labels = np.array([0])

    # Group ideas by cluster
    clusters_temp_data = {}
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
            "timestamp": ideas[idx]["timestamp"]
        })

    # For each cluster, find representative idea
    cluster_results = []
    for label, cluster_ideas_data in clusters_temp_data.items():
        cluster_embeddings = np.array([idea["embedding"] for idea in cluster_ideas_data])
        if cluster_embeddings.shape[0] > 1:
            centroid = np.mean(cluster_embeddings, axis=0)
            distances = np.linalg.norm(cluster_embeddings - centroid, axis=1)
            closest_idx = np.argmin(distances)
        else:
            closest_idx = 0

        representative_idea_data = cluster_ideas_data[closest_idx]

        ideas_for_output = [
            {
                "id": idea["id"],
                "text": idea["text"],
                "user_id": idea["user_id"],
                "verified": idea["verified"],
                "timestamp": idea["timestamp"].isoformat() if isinstance(idea["timestamp"], datetime) else idea["timestamp"]
            } for idea in cluster_ideas_data
        ]

        cluster_id = f"{session_id}_{label}"
        await db.clusters.update_one(
            {"_id": cluster_id},
            {"$set": {
                "session_id": session_id,
                "representative_idea_id": representative_idea_data["id"],
                "representative_text": representative_idea_data["text"],
                "count": len(cluster_ideas_data),
                "ideas": ideas_for_output
            }},
            upsert=True
        )

        for idea in cluster_ideas_data:
            await db.ideas.update_one(
                {"_id": idea["id"]},
                {"$set": {"cluster_id": cluster_id}}
            )

        cluster_results.append({
            "id": cluster_id,
            "representative_idea_id": representative_idea_data["id"],
            "representative_text": representative_idea_data["text"],
            "count": len(cluster_ideas_data),
            "ideas": ideas_for_output
        })

    await db.sessions.update_one(
        {"_id": session_id},
        {"$set": {
            "idea_count": await db.ideas.count_documents({"session_id": session_id}),
            "cluster_count": len(cluster_results),
            "last_processed": datetime.utcnow()
        }}
    )

    print(f"Emitting clusters_updated to room {session_id} with {len(cluster_results)} clusters")

    await sio.emit(
        "clusters_updated",
        {"session_id": session_id, "clusters": cluster_results},
        room=session_id
    )

    return cluster_results
    