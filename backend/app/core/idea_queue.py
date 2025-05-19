# app/core/idea_queue.py

from celery import Celery, shared_task
from app.services.genkit.idea import process_idea
from app.core.database import get_db

app = Celery('idea_queue', broker='redis://localhost:6379/0')

@shared_task(bind=True, max_retries=3)
def process_idea_task(self, idea_id):
    try:
        db = get_db()  # If async, use asyncio.run or refactor to sync
        idea = db.ideas.find_one({"_id": str(idea_id)})
        if not idea:
            raise ValueError(f"Idea {idea_id} not found")
        process_idea(idea, idea["discussion_id"])
    except Exception as exc:
        raise self.retry(exc=exc, countdown=2 ** self.request.retries)