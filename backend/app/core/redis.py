import os
import asyncio
from redis import asyncio as aioredis
from typing import Optional
import logging
logger = logging.getLogger(__name__)

_redis = None
# queues
idea_queue = 'idea_queue'
processing_set = 'processing_set'
dead_letter_queue = 'dead_letter_queue' # Ideas that failed to process and failed retry
max_retries = 3

# Hash to store retry counts
retry_count_hash = 'retry_count_hash'

async def get_redis():
    """Get Redis connection with optional authentication."""
    global _redis
    if _redis is None:
        # Get Redis connection details from environment variables
        redis_url = os.getenv('REDIS_URL', 'redis://localhost')
        print(f"Connecting to Redis at {redis_url}")
        redis_username = os.getenv('REDIS_USERNAME')
        redis_password = os.getenv('REDIS_PASSWORD')
        
        # If username and password are provided, include them in connection
        if redis_username and redis_password:
            # Parse the existing URL to modify it with auth credentials
            if '://' in redis_url:
                protocol, address = redis_url.split('://', 1)
                redis_url = f"{protocol}://{redis_username}:{redis_password}@{address}"
            else:
                # Fallback if URL doesn't have protocol
                redis_url = f"redis://{redis_username}:{redis_password}@{redis_url.replace('redis://', '')}"
            logger.info(f"Connecting to Redis with authentication")
        
        _redis = await aioredis.from_url(redis_url)
    return _redis

async def add_to_queue(idea_id: str) -> bool:
    """Add an idea to the processing queue."""
    redis = await get_redis()
    logger.info(f"Adding idea {idea_id} to queue")
    return await redis.rpush(idea_queue, idea_id)

async def move_to_processing(idea_id: str) -> bool:
    """Move an idea to the processing set."""
    redis = await get_redis()
    return await redis.sadd(processing_set, idea_id)

async def remove_from_processing(idea_id: str) -> bool:
    """Remove an idea from the processing set."""
    redis = await get_redis()
    return await redis.srem(processing_set, idea_id)

async def get_batch_from_queue(batch_size: int = 10) -> list[str]:
    """Get a batch of ideas from the queue.
    
    The ideas are moved to a processing set to track in-progress items.
    If processing fails, items can be retried later.
    """
    redis = await get_redis()
    ideas = []
    
    for _ in range(batch_size):
        # Atomically move item from queue to processing
        idea_id = await redis.lpop(idea_queue)
        if not idea_id:
            break
        # Decode bytes to string
        if isinstance(idea_id, bytes):
            idea_id = idea_id.decode('utf-8')
        # Add to processing set
        await move_to_processing(idea_id)
        ideas.append(idea_id)
    
    return ideas

async def retry_failed_item(idea_id: str) -> None:
    """Move a failed item back to the queue for retry or to dead letter queue if max retries exceeded."""
    redis = await get_redis()
    
    # Get current retry count
    retry_count = await redis.hget(retry_count_hash, idea_id)
    retry_count = int(retry_count.decode('utf-8')) if retry_count else 0
    retry_count += 1
    
    if retry_count >= max_retries:
        # Move to dead letter queue if max retries exceeded
        logger.warning(f"Max retries ({max_retries}) exceeded for idea {idea_id}, moving to dead letter queue")
        await redis.rpush(dead_letter_queue, idea_id)
        await remove_from_processing(idea_id)
        await redis.hdel(retry_count_hash, idea_id)
    else:
        # Update retry count and move back to queue
        await redis.hset(retry_count_hash, idea_id, retry_count)
        logger.info(f"Retrying idea {idea_id} (attempt {retry_count} of {max_retries})")
        await redis.rpush(idea_queue, idea_id)
        await remove_from_processing(idea_id)
        # Add exponential backoff delay
        await asyncio.sleep(2 ** retry_count)

async def remove_from_queue(idea_id: str) -> int:
    """Remove an idea from the processing queue and processing set.
    
    This should be called after successful processing of an idea to clean up
    both the queue and processing tracking.
    
    Args:
        idea_id: The ID of the idea to remove
        
    Returns:
        The number of items removed from the queue
    """
    redis = await get_redis()
    logger.info(f"Removing idea {idea_id} from queue and processing set")
    # Remove from processing set first
    await remove_from_processing(idea_id)
    # Remove all occurrences from the queue (should be none if processing worked correctly)
    return await redis.lrem('idea_queue', 0, idea_id)