"""Main FastAPI application entry point"""
# Import routers
from app.routers import sessions, ideas, clusters, auth  # Add auth router import

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import os
from fastapi.exceptions import HTTPException
from fastapi.responses import JSONResponse
from fastapi import Request

# Import Socket.IO setup
from app.core.socketio import socket_app, sio

# Create FastAPI app
app = FastAPI(title="TopicTrends API")

@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException):
    return JSONResponse(
        status_code=exc.status_code,
        content={"message": exc.detail},
    )
# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],  # Your React app's origin
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