import os
import numpy as np
from sentence_transformers import SentenceTransformer
from sklearn.cluster import AgglomerativeClustering
from app.core.config import settings

# Initialize Sentence-BERT model
try:
    # Ensure cache directory exists
    os.makedirs(settings.MODEL_CACHE_DIR, exist_ok=True)

    # Load the model
    model = SentenceTransformer(
        settings.MODEL_NAME,
        cache_folder=settings.MODEL_CACHE_DIR
    )
    print(f"Successfully loaded model: {settings.MODEL_NAME}")
except Exception as e:
    print(f"Error loading Sentence Transformer model: {e}")
    # Provide a fallback or raise a more informative error
    raise RuntimeError(f"Failed to load language model: {e}")


def encode_texts(texts):
    """Encode a list of texts into embeddings"""
    return model.encode(texts)


def cluster_embeddings(embeddings, idea_count):
    """Cluster embeddings using Agglomerative Clustering
    
    Args:
        embeddings: Numpy array of embeddings
        idea_count: Number of ideas to determine distance threshold
        
    Returns:
        labels: Cluster labels for each embedding
    """
    # Determine optimal distance threshold based on number of ideas
    if idea_count < 10:
        distance_threshold = settings.DISTANCE_THRESHOLD_SMALL
    elif idea_count < 50:
        distance_threshold = settings.DISTANCE_THRESHOLD_MEDIUM
    else:
        distance_threshold = settings.DISTANCE_THRESHOLD_LARGE
        
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
        
    return labels