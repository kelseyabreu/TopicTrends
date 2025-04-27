from fastapi import APIRouter, HTTPException
from typing import List
import uuid
from datetime import datetime
import base64
import io
import qrcode

from app.models.schemas import Discussion, DiscussionCreate
import logging
from app.core.database import get_db

# Create router
router = APIRouter(tags=["discussions"])


# Helper functions
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


async def get_discussion_by_id(discussion_id: str) -> Discussion | HTTPException:
    """Get discussion by ID or raise 404"""
    logging.info(f"Attempting to find discussion with ID: {discussion_id}")
    db = await get_db()
    discussion = await db.discussions.find_one({"_id": discussion_id})
    if not discussion:
        logging.warning(f"Discussion not found for ID: {discussion_id}")
        raise HTTPException(status_code=404, detail="Discussion not found")
    logging.info(f"Discussion found for ID: {discussion_id}")
    return discussion


async def fetch_all_discussions():
    """Get all discussions"""
    logging.info("Attempting to find all discussions")
    db= await get_db()
    cursor = db.discussions.find()
    discussions = await cursor.to_list(length=None)
    if not discussions:
        logging.warning("No discussions found")
        return []
    return discussions


# Routes
@router.post("/discussions", response_model=Discussion)
async def create_discussion(discussion: DiscussionCreate):
    """Create a new discussion discussion"""
    db = await get_db()
    logging.info("Creating discussion with data: %s", discussion.dict())
    discussion_id = str(uuid.uuid4())
    base_url = "https://TopicTrends.app"  # Replace with your domain
    join_link = f"{base_url}/join/{discussion_id}"
    qr_code = generate_qr_code(join_link)

    now = datetime.utcnow()
    discussion_data = {
        "_id": discussion_id,
        "title": discussion.title,
        "prompt": discussion.prompt,
        "require_verification": discussion.require_verification,
        "created_at": now,
        "idea_count": 0,
        "topic_count": 0,
        "join_link": join_link,
        "qr_code": qr_code
    }

    await db.discussions.insert_one(discussion_data)
    logging.info("Discussion created with ID: %s", discussion_id)
    return {**discussion_data, "id": discussion_id}


@router.get("/discussions/{discussion_id}", response_model=Discussion)
async def get_discussion_details(discussion_id: str):
    """Get discussion details by ID"""
    discussion = await get_discussion_by_id(discussion_id)
    return {**discussion, "id": discussion["_id"]}


@router.get("/discussions", response_model=List[Discussion])
async def get_discussions():
    """Get all discussions"""
    discussions = await fetch_all_discussions()
    return [{"id": discussion["_id"], **discussion} for discussion in discussions]