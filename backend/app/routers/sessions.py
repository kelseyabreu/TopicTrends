from fastapi import APIRouter, HTTPException, Depends
from typing import List
import uuid
from datetime import datetime
import base64
import io
import qrcode

from app.models.schemas import Session, SessionCreate
import logging
from app.core.database import get_db

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


async def get_session_by_id(session_id: str, db=Depends(get_db)) -> Session | HTTPException:
    """Get session by ID or raise 404"""
    logging.info(f"Attempting to find session with ID: {session_id}")
    session = await db.sessions.find_one({"_id": session_id})
    if not session:
        logging.warning(f"Session not found for ID: {session_id}")
        raise HTTPException(status_code=404, detail="Session not found")
    logging.info(f"Session found for ID: {session_id}")
    return session


async def fetch_all_sessions(db=Depends(get_db)):
    """Get all sessions"""
    logging.info("Attempting to find all sessions")
    cursor = db.sessions.find()
    sessions = await cursor.to_list(length=None)
    if not sessions:
        logging.warning("No sessions found")
        return []
    return sessions


# Routes
@router.post("/sessions", response_model=Session)
async def create_session(session: SessionCreate, db=Depends(get_db)):
    """Create a new discussion session"""
    logging.info("Creating session with data: %s", session.dict())
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
async def get_session_details(session_id: str, db=Depends(get_db)):
    """Get session details by ID"""
    session = await get_session_by_id(session_id, db)
    return {**session, "id": session["_id"]}


@router.get("/sessions", response_model=List[Session])
async def get_sessions(db=Depends(get_db)):
    """Get all sessions"""
    sessions = await fetch_all_sessions(db)
    return [{"id": session["_id"], **session} for session in sessions]