"""Main FastAPI application entry point"""
import logging
# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Import routers
from app.routers import sessions, ideas, clusters, auth
from app.core.database import init_db, initialize_database
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
import os
from fastapi.exceptions import HTTPException
from fastapi.responses import JSONResponse
import asyncio

# Import Socket.IO setup
from app.core.socketio import socket_app, sio

# Create FastAPI app
app = FastAPI(title="TopicTrends API")

# Initialize the database explicitly
@app.on_event("startup")
async def startup_event():
    logger.info("Initializing database...")
    await initialize_database()
    logger.info("Database initialization complete.")

# Add custom exception handler
@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException):
    return JSONResponse(
        status_code=exc.status_code,
        content={"message": exc.detail},
    )

# Add exception handler for uncaught exceptions
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.error(f"Unhandled exception: {str(exc)}", exc_info=True)
    return JSONResponse(
        status_code=500,
        content={"message": f"Internal server error: {str(exc)}"},
    )

# Add CORS middleware
origins = [
    "http://localhost:5173",  # React dev server
    "http://localhost:8000",  # FastAPI dev server
    "http://127.0.0.1:5173",
    "http://127.0.0.1:8000",
]

if os.environ.get("FRONTEND_URL"):
    origins.append(os.environ.get("FRONTEND_URL"))

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["*"],
    expose_headers=["*"],
)

# Include routers
app.include_router(sessions.router, prefix="/api")
app.include_router(ideas.router, prefix="/api")
app.include_router(clusters.router, prefix="/api")
app.include_router(auth.router, prefix="/api")

# Mount Socket.IO app
app.mount('/socket.io', socket_app)

# Main entry point for serverless function
if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)