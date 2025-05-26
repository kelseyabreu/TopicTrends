"""Main FastAPI application entry point"""

# Load environment variables from .env file 
from dotenv import load_dotenv
load_dotenv()
# Configure logging
from app.core.logging import setup_logger
setup_logger()
import logging
logger = logging.getLogger(__name__)

# --- Standard Python Imports ---
import os
import time
import uuid
from typing import Callable, Dict, Any

# --- Third-Party Imports ---
from fastapi import FastAPI, Request, status, Depends
from fastapi.middleware.cors import CORSMiddleware
import os
import asyncio
from fastapi.exceptions import HTTPException
from fastapi.responses import JSONResponse
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded

# --- Application-Specific Imports ---
# Core components
from app.core.database import initialize_database # Assuming init_db is deprecated based on code
from app.core.config import settings 
from app.core.limiter import limiter
# Socket.IO setup
from app.core.socketio import socket_app
# Routers (import AFTER settings/limiter might be needed if they use them at import time)
from app.routers import discussions, ideas, topics, auth, users, interaction

# --- FastAPI App Creation ---
# Create FastAPI app with metadata
app = FastAPI(
    title=settings.API_TITLE,
    version=settings.API_VERSION,
    docs_url="/api/docs",  # Custom path for Swagger UI
    redoc_url="/api/redoc",  # Custom path for ReDoc
    openapi_url="/api/openapi.json",  # Custom path for OpenAPI schema
    # Add other FastAPI parameters if needed (e.g., openapi_tags)
)

# --- Middleware Definitions & Registration ---
# Middleware order can matter. Generally:
# 1. Tracing/ID Generation (early)
# 2. Error Handling Wrappers (often added implicitly by frameworks)
# 3. Timing/Metrics
# 4. CORS (often needs to run early)
# 5. Authentication/Authorization
# 6. Other application-specific logic

# Add Request ID Middleware (Runs Early)
@app.middleware("http")
async def add_request_id(request: Request, call_next: Callable):
    """Add unique request ID to each request state for traceability in logs/errors."""
    request_id = str(uuid.uuid4())
    request.state.request_id = request_id
    # Set request ID in a context variable if you use contextvars for logging
    # from app.core.logging import request_id_contextvar # Example
    # token = request_id_contextvar.set(request_id) 
    try:
        response = await call_next(request)
        # Add ID to response headers
        response.headers["X-Request-ID"] = request_id
        return response
    finally:
        # request_id_contextvar.reset(token) # Example cleanup
        pass


# Add Request Timing Middleware (Runs After Request ID)
@app.middleware("http")
async def add_process_time_header(request: Request, call_next: Callable):
    """Track and log request processing time. Adds 'X-Process-Time' header."""
    start_time = time.time()
    response = await call_next(request)
    process_time = time.time() - start_time
    response.headers["X-Process-Time"] = str(process_time)
    # Use request ID in logging if available
    req_id = getattr(request.state, "request_id", "unknown")
    log_prefix = f"[Req ID: {req_id}]"
    if process_time > settings.SLOW_REQUEST_THRESHOLD: # Use config for threshold
        logger.warning(f"{log_prefix} Slow request: {request.method} {request.url.path} took {process_time:.4f}s")
    else:
         logger.debug(f"{log_prefix} Request processed: {request.method} {request.url.path} in {process_time:.4f}s")
    return response


# Add CORS Middleware (Runs relatively early, before most app logic)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"], # Include needed methods
    allow_headers=settings.CORS_ALLOW_HEADERS, # Use config for headers
    expose_headers=settings.CORS_EXPOSE_HEADERS, # Use config for exposed headers
    max_age=settings.CORS_MAX_AGE,  # Cache preflight requests (e.g., 86400 for 24h)
)

# --- Rate Limiter State and Exception Handler ---
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
# Note: Rate limits are typically applied via decorators on specific routes/routers

# --- Application Event Handlers ---
@app.on_event("startup")
async def startup_event():
    """Application startup logic: Initialize database connection."""
    logger.info(f"Application starting up in {settings.ENVIRONMENT} mode...")
    logger.info("Initializing database...")
    try:
        await initialize_database() 
        logger.info("Database initialization complete.")
        # Start the background worker
        from app.services.worker import run_worker
        # Runs concurrently :o
        asyncio.create_task(run_worker())
        logger.info("Background worker started.")
    except Exception as e:
        logger.exception("FATAL: Database initialization failed. Application will exit.", exc_info=True)
        # Optionally: Send alert here
        raise SystemExit(f"Database connection could not be established: {e}")

@app.on_event("shutdown")
async def shutdown_event():
    """Application shutdown logic: Clean up resources."""
    logger.info("Application shutting down...")
    # Add cleanup operations here (e.g., close database connections, background task cleanup)
    # Example: await close_database_connection()
    # Example: await close_redis_pool()
    logger.info("Shutdown complete.")

# --- Custom Exception Handlers ---
@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException):
    """Handle FastAPI HTTPExceptions gracefully."""
    req_id = getattr(request.state, "request_id", "unknown")
    log_prefix = f"[Req ID: {req_id}]"
    
    if exc.status_code >= 500:
         logger.error(f"{log_prefix} Server Error: HTTPException {exc.status_code}: {exc.detail} for {request.method} {request.url.path}")
    elif exc.status_code >= 400:
         # Log client errors as warnings or info, maybe not always with full detail unless debugging
         logger.warning(f"{log_prefix} Client Error: HTTPException {exc.status_code}: {exc.detail} for {request.method} {request.url.path}")
    
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "message": exc.detail,
            "request_id": req_id
        }, 
        headers=getattr(exc, "headers", None), # Preserve headers from exception if any
    )

# Add exception handler for uncaught exceptions
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    """Handle unexpected exceptions globally."""
    req_id = getattr(request.state, "request_id", "unknown")
    log_prefix = f"[Req ID: {req_id}]"
    logger.error(f"{log_prefix} Unhandled exception: {request.method} {request.url.path}", exc_info=True) 
    
    # Avoid leaking sensitive details in production
    error_message = "An unexpected internal server error occurred." if settings.ENVIRONMENT == "production" else f"Internal server error: {str(exc)}"
    
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={
            "message": error_message,
            "request_id": req_id
        },
    )

# --- Include Routers ---
# Add tags for better organization in OpenAPI docs
api_prefix = "/api" 
app.include_router(auth.router, prefix=api_prefix, tags=["Authentication"])
app.include_router(discussions.router, prefix=api_prefix, tags=["Discussions"])
app.include_router(ideas.router, prefix=api_prefix, tags=["Ideas"])
app.include_router(topics.router, prefix=api_prefix, tags=["Topics"])
app.include_router(users.router, prefix=api_prefix, tags=["Users"])
app.include_router(interaction.router, prefix=api_prefix, tags=["Interaction"])
# Add other routers here

# --- Mount Sub-Applications (like Socket.IO) ---
app.mount('/socket.io', socket_app, name="socketio") # Give it a name

# --- Root / Utility Endpoints ---
@app.get(f"{api_prefix}/health", tags=["Health"])
@limiter.limit(settings.HEALTH_CHECK_RATE_LIMIT) # Separate rate limit for health checks
async def health_check(request: Request):
    """
    Check the operational status of the API.
    Returns basic status and environment information.
    """
    # Add more checks here if needed (e.g., database connectivity)
    # db_ok = await check_db_connection() 
    return {
        "status": "ok",
        # "database_status": "connected" if db_ok else "disconnected",
        "api_version": settings.API_VERSION,
        "environment": settings.ENVIRONMENT,
        "request_id": getattr(request.state, "request_id", "unknown") # Return request_id for the health check itself
    }

@app.get(f"{api_prefix}/version", tags=["Health"])
async def version_info():
    """Return API version and name."""
    return {
        "name": settings.API_TITLE,
        "api_version": settings.API_VERSION,
    }

# --- Main Entry Point for Running with Uvicorn ---
if __name__ == "__main__":
    import uvicorn
    
    host = "0.0.0.0" if settings.ENVIRONMENT != "development" else "127.0.0.1"
    reload_flag = settings.ENVIRONMENT == "development"
    log_level = "debug" if settings.LOG_LEVEL == "DEBUG" else "info"
    
    logger.info(f"Starting Uvicorn server on {host}:{settings.SERVER_PORT}...")
    logger.info(f"Environment: {settings.ENVIRONMENT}, Reloading: {reload_flag}, Log Level: {log_level}")
    
    uvicorn.run(
        "app.main:app", # Point to the app instance
        host=host, 
        port=settings.SERVER_PORT, 
        reload=reload_flag,
        log_level=log_level.lower(),
        # Consider adding proxy_headers=True if behind a trusted proxy like Nginx/Traefik
        # proxy_headers=True, 
        # forwarded_allow_ips="*" # Be careful with this in production
    )