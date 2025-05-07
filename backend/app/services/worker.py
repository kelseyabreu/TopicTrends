import asyncio
from datetime import datetime
import logging

from app.core.database import get_db
from app.core.redis import get_batch_from_queue, remove_from_processing, retry_failed_item
from app.services.genkit.idea import process_idea

logger = logging.getLogger(__name__)
interval = 10 # how often to run the worker in seconds
item_batch_size = 10 # maybe add to env? should correspond with llm limit we want to target
async def process_idea_batch():
    """Process a batch of ideas from the queue."""
    try:
        # Get batch of ideas from queue
        idea_ids = await get_batch_from_queue(item_batch_size)
        if not idea_ids:
            return
        
        logger.info(f"Processing batch of {len(idea_ids)} ideas")
        db = await get_db()
        
        for idea_id in idea_ids:
            try:
                # Get idea from database
                print(f"The Gotten Idea: {idea_id}")
                idea = await db.ideas.find_one({"_id": str(idea_id)})
                if not idea:
                    logger.error(f"Idea {idea_id} not found in database")
                    continue
                idea_copy = idea.copy()
                # Process the idea
                logger.info(f"Idea copy? {idea_copy}")
                await process_idea(idea_copy, idea_copy["discussion_id"])
                await remove_from_processing(idea_id)
                logger.info(f"Successfully processed idea {idea_id}")
                
                
            except Exception as e:
                logger.error(f"Error processing idea {idea_id}: {str(e)}")
                # Retry with backoff and tracking, maybe use celery in future?
                await retry_failed_item(idea_id)
                continue
            
    except Exception as e:
        logger.error(f"Error in process_idea_batch: {str(e)}")

async def run_worker():
    """Run the worker process that checks for ideas to process."""
    while True:
        try:
            logger.info("Checking for ideas to process...")
            await process_idea_batch()
            # Wait for 1 minute before next batch
            logger.info("Waiting for next batch")
            await asyncio.sleep(interval)
        except Exception as e:
            logger.error(f"Error in worker loop: {str(e)}")
            # Wait before retrying
            await asyncio.sleep(5)