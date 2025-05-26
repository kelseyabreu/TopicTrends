import os
import logging
from pydantic_settings import BaseSettings, SettingsConfigDict
from typing import List, Optional

# Note: Ensure 'pydantic-settings' is installed (pip install pydantic-settings)
# Requires a .env file in the project root or environment variables to be set.

logger = logging.getLogger(__name__)

class Settings(BaseSettings):
    """Application settings using pydantic-settings for automatic env loading."""

    # Configure pydantic-settings
    # Reads from a .env file and environment variables (case-insensitive)
    model_config = SettingsConfigDict(
        env_file='.env',
        env_file_encoding='utf-8',
        case_sensitive=False,
        extra='ignore'
    )

    # environment settings
    ENVIRONMENT: str = "development"
    PORT: int = 8000

    # API settings
    API_TITLE: str = "TopicTrends API"
    API_VERSION: str = "1.0.0"

    # CORS settings
    # Expects a comma-separated string list in the .env/environment variable
    # Example: CORS_ORIGINS='["http://localhost:5173", "http://localhost:8000"]'
    CORS_ORIGINS: List[str]
    CORS_ALLOW_HEADERS: List[str] = ["*"] # Default to allow all, or specify
    CORS_EXPOSE_HEADERS: List[str] = ["*"] # Default to allow all, or specify
    CORS_MAX_AGE: int = 86400 # Default to 24 hours (in seconds)

    # MongoDB settings
    MONGODB_URL: str

    # AI Keys
    AI_PROVIDER: str = "googleai"  # Options: "googleai"
    GOOGLE_API_KEY: str

    # Model settings
    MODEL_NAME: str
    EMBEDDER_MODEL: str = "nomic-embed-text"
    EMBEDDER_DIMENSIONS: int = 512
    GENERATIVE_MODEL: str = "phi3.5:latest"
    GEMINI_MODEL: str = "googleai/gemini-2.0-flash"
    MODEL_CACHE_DIR: str = os.path.join(
         os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))),
         'model_cache'
     )

    # Clustering settings
    DISTANCE_THRESHOLD_SMALL: float = 0.45
    DISTANCE_THRESHOLD_MEDIUM: float = 0.35
    DISTANCE_THRESHOLD_LARGE: float = 0.25

    # Security settings
    SECRET_KEY: str # Used for access tokens (JWT)
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24  # 24 hours
    RESET_TOKEN_EXPIRE_MINUTES: int = 60 # 1 hour for password reset

    # Participation Token settings (for anonymous/embedded users)
    PARTICIPATION_TOKEN_SECRET_KEY: str
    PARTICIPATION_TOKEN_ALGORITHM: str = "HS256"
    PARTICIPATION_TOKEN_EXPIRE_MINUTES: int = 120 # 2 hours

    # CSRF Protection Secret (generate a strong random key)
    CSRF_SECRET_KEY: str # CHANGE THIS in .env!

    # API Key Protection (for token generation endpoints)
    # Example .env: ALLOWED_API_KEYS='["key1_abc","key2_xyz"]'
    ALLOWED_API_KEYS: List[str] = []

    # Rate Limiting (defaults, can be overridden per endpoint)
    DEFAULT_RATE_LIMIT: str = "500/hour"
    HIGH_RATE_LIMIT: str = "500/minute"
    LOGIN_RATE_LIMIT: str = "10/minute"
    REGISTER_RATE_LIMIT: str = "5/minute"
    VERIFY_RATE_LIMIT: str = "10/minute"
    TOKEN_GEN_RATE_LIMIT: str = "30/minute" 
    IDEA_SUBMIT_RATE_LIMIT: str = "60/minute"
    DISCUSSION_CREATE_RATE_LIMIT: str = "10/minute"
    DISCUSSION_DELETE_RATE_LIMIT: str = "10/minute"
    DISCUSSION_READ_RATE_LIMIT: str = "200/minute"
    PROFILE_UPDATE_RATE_LIMIT: str = "20/minute"
    PASSWORD_RESET_REQ_RATE_LIMIT: str = "5/minute"
    PASSWORD_RESET_RATE_LIMIT: str = "5/minute"
    HEALTH_CHECK_RATE_LIMIT: str = "60/minute"

    # PERFORMANCE/LOGGING SETTING
    SLOW_REQUEST_THRESHOLD: float = 1.0

    # Frontend URL
    FRONTEND_URL: str

    # Email settings
    GMAIL_SENDER_EMAIL: str
    GMAIL_APP_PASSWORD: str
    EMAIL_FROM_NAME: str = "TopicTrends"

    # Background task settings
    TASK_TIMEOUT_SECONDS: int = 300  # 5 minutes
    MAX_CONCURRENT_TASKS: int = 5



# Create settings instance
# pydantic-settings automatically loads from .env/environment and validates
try:
    settings = Settings()
    logger.info("Application settings loaded successfully.")

    # Example: Log two main setting to confirm loading 
    logger.debug(f"Loaded FRONTEND_URL: {settings.FRONTEND_URL}")
    logger.debug(f"Loaded MONGODB_URL: {settings.MONGODB_URL.split('@')[-1]}")

except Exception as e:
    logger.exception(f"CRITICAL: Failed to load application settings: {e}")
    raise SystemExit(f"Configuration Error: {e}")