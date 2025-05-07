import uuid
import numpy as np
from typing import List, Optional, Tuple
from app.core.database import get_db
import logging
# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class CentroidClustering:
    def __init__(self, similarity_threshold: float = 0.85):
        self.similarity_threshold = similarity_threshold
        logger.info(f"Initialized CentroidClustering with similarity threshold: {similarity_threshold}")
        
    async def get_existing_topics(self, discussion_id: str) -> List[dict]:
        """Fetch existing topics from MongoDB for a discussion"""
        db = await get_db()
        topics = await db.topics.find({"discussion_id": discussion_id}).to_list(None)
        logger.info(f"Found {len(topics)} existing topics for discussion {discussion_id}")
        return topics
    
    def cosine_similarity(self, vec1: np.ndarray, vec2: np.ndarray) -> float:
        """Calculate cosine similarity between two vectors."""
        norm1 = np.linalg.norm(vec1)
        norm2 = np.linalg.norm(vec2)
        if norm1 == 0 or norm2 == 0:
            return 0
        return np.dot(vec1, vec2) / (norm1 * norm2)
    
    async def find_closest_topic(self, embedding: np.ndarray, discussion_id: str) -> Tuple[Optional[dict], float]:
        """
        Find the closest topic to the given embedding from MongoDB.
        Returns (topic, similarity) tuple. If no topics exist, returns (None, 0).
        """
        topics = await self.get_existing_topics(discussion_id)
        if not topics:
            logger.info(f"No existing topics found for discussion {discussion_id}")
            return None, 0
            
        max_similarity = -1
        closest_topic = None
        
        for topic in topics:
            if topic.get('centroid_embedding') is not None:
                similarity = self.cosine_similarity(embedding, np.array(topic['centroid_embedding']))
                logger.debug(f"Similarity with topic {topic['_id']}: {similarity}")
                if similarity > max_similarity:
                    max_similarity = similarity
                    closest_topic = topic
        
        if closest_topic:
            logger.info(f"Found closest topic {closest_topic['_id']} with similarity {max_similarity}")
        else:
            logger.info("No suitable topic found")
                    
        return closest_topic, max_similarity
    
    async def create_topic(self, embedding: np.ndarray, idea: dict, discussion_id: str) -> dict:
        """
        Create a new topic with the given embedding as its centroid.
        """
        db = await get_db()
        topic_id = str(uuid.uuid4())
        
        try:
            topic = {
                '_id': topic_id,
                'discussion_id': discussion_id,
                'centroid_embedding': embedding.tolist(),
                'representative_idea_id': idea['_id'],
                'representative_idea_text': idea['text'],
                'ideas': [idea],
                'count': 1,
            }
            
            # Use a transaction to ensure both operations succeed or fail together
            async with await db.client.start_session() as session:
                async with session.start_transaction():
                    # Insert the topic
                    await db.topics.insert_one(topic, session=session)
                    
                    # Update the idea with the topic ID
                    await db.ideas.update_one(
                        {"_id": idea['_id']},
                        {"$set": {"topic_id": topic_id}},
                        session=session
                    )
            
            logger.info(f"Created new topic {topic_id} with representative idea {idea['_id']}")
            return topic
            
        except Exception as e:
            logger.error(f"Failed to create topic for idea {idea['_id']}: {str(e)}")
            raise
    
    async def update_topic(self, topic: dict, new_embedding: np.ndarray, idea: dict) -> dict:
        """
        Update an existing topic with a new related idea.
        """
        try:
            db = await get_db()
            current_centroid = np.array(topic['centroid_embedding'])
            new_centroid = (current_centroid * topic['count'] + new_embedding) / (topic['count'] + 1)
            
            await db.topics.update_one(
                {'_id': topic['_id']},
                {
                    '$set': {
                        'centroid_embedding': new_centroid.tolist(),
                        'count': topic['count'] + 1
                    },
                    '$push': {
                        'idea_ids': idea['_id']
                    }
                }
            )
            
            topic['centroid_embedding'] = new_centroid.tolist()
            topic['count'] += 1
            topic['idea_ids'].append(idea['_id'])
            logger.info(f"Updated topic {topic['_id']} with new idea {idea['_id']}, new count: {topic['count']}")
            return topic
            
        except Exception as e:
            logger.error(f"Error updating topic {topic['_id']}: {str(e)}")
            raise
    
    async def process_idea(self, embedding: np.ndarray | List[float], idea: dict, discussion_id: str) -> dict:
            """
            Process a new idea by either creating a new topic or updating an existing one.
            Parameters:
                embedding: The embedding vector as either numpy array or list of floats
                idea: The complete idea document containing _id and other properties
                discussion_id: The ID of the discussion this idea belongs to
            """
            # Convert list to numpy array if needed
            if isinstance(embedding, list):
                embedding = np.array(embedding)
                
            logger.info(f"Processing idea {idea['_id']} for discussion {discussion_id}")
            try:
                closest_topic, similarity = await self.find_closest_topic(embedding, discussion_id)
                
                if closest_topic is None or similarity < self.similarity_threshold:
                    logger.info(f"No suitable topic found (similarity: {similarity}), creating new topic")
                    return await self.create_topic(embedding, idea, discussion_id)
                else:
                    logger.info(f"Found suitable topic {closest_topic['_id']} (similarity: {similarity}), updating")
                    return await self.update_topic(closest_topic, embedding, idea)
                    
            except Exception as e:
                logger.error(f"Error processing idea {idea['_id']}: {str(e)}")
                raise