from app.core.database import get_db
from app.models.schemas import Idea, Discussion, IdeaSubmit

from app.services.genkit.cluster import cluster_ideas_into_topics
from app.services.genkit.flows.format_idea import format_idea_flow
from app.services.genkit.idea import process_idea


async def background_ai_processes(discussion_id: str | None = None, idea_data = None):
    """Background task to process AI tasks"""
    # This function is a placeholder for any background AI processes
    await process_idea(idea_data, discussion_id)
    await cluster_ideas_into_topics(discussion_id)
