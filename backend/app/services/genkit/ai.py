from app.services.genkit.cluster import cluster_ideas_into_topics
from app.services.genkit.idea import process_idea
import logging
logger = logging.getLogger(__name__)

async def background_ai_processes(discussion_id: str | None = None, idea_data = None):
    """Background task to process a single idea's AI tasks (formatting, etc.)."""
    if not idea_data or not discussion_id:
        logger.warning("background_ai_processes called without sufficient data.")
        return

    try:
        logger.info(f"Starting AI processing for idea {idea_data.get('_id')} in discussion {discussion_id}")
        await process_idea(idea_data, discussion_id)
        logger.info(f"Finished AI processing for idea {idea_data.get('_id')}")
    except Exception as e:
        logger.error(f"Error in background_ai_processes for idea {idea_data.get('_id')}: {e}", exc_info=True)