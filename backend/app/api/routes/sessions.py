from fastapi import APIRouter, HTTPException, Depends
from typing import List
import uuid
from datetime import datetime
import base64
import io
import qrcode

from app.models.schemas import Session, SessionCreate
from app.core.database import db
import logging

# Create router
router = APIRouter(tags=["sessions"])

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

async def get_session_by_id(session_id: str):
    """Get session by ID or raise 404"""
    session = await db.sessions.find_one({"_id": session_id})
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    return session

# Routes
@router.post("/sessions", response_model=Session)
async def create_session(session: SessionCreate):
    logging.info("Creating session with data: %s", session.dict())
    """Create a new discussion session"""
    session_id = str(uuid.uuid4())
    base_url = "https://TopicTrends.app"  # Replace with your domain
    join_link = f"{base_url}/join/{session_id}"
    qr_code = generate_qr_code(join_link)

    now = datetime.utcnow()
    session_data = {
        "_id": session_id,
        "title": session.title,
        "prompt": session.prompt,
        "require_verification": session.require_verification,
        "created_at": now,
        "idea_count": 0,
        "cluster_count": 0,
        "join_link": join_link,
        "qr_code": qr_code
    }

    await db.sessions.insert_one(session_data)
    logging.info("Session created with ID: %s", session_id)
    return {**session_data, "id": session_id}

@router.get("/sessions/{session_id}", response_model=Session)
async def get_session_details(session_id: str):
    """Get session details by ID"""
    session = await get_session_by_id(session_id)
    return {**session, "id": session["_id"]}