import os
import logging
from pydantic_settings import BaseSettings, SettingsConfigDict
from typing import List

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

    # API settings
    API_TITLE: str = "TopicTrends API"
    API_VERSION: str = "1.0.0"

    # CORS settings
    # Expects a comma-separated string in the .env/environment variable
    # Example: CORS_ORIGINS=http://localhost:5173,https://yourfrontend.com
    CORS_ORIGINS: List[str]

    # MongoDB settings
    MONGODB_URL: str

    # Model settings
    MODEL_NAME: str
    MODEL_CACHE_DIR: str = os.path.join(
         os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))),
         'model_cache'
     )

    # Clustering settings
    DISTANCE_THRESHOLD_SMALL: float = 0.45
    DISTANCE_THRESHOLD_MEDIUM: float = 0.35
    DISTANCE_THRESHOLD_LARGE: float = 0.25

    # Security settings
    SECRET_KEY: str

    # Frontend URL
    FRONTEND_URL: str

    # Email settings
    GMAIL_SENDER_EMAIL: str
    GMAIL_APP_PASSWORD: str
    EMAIL_FROM_NAME: str 


# Create settings instance
# pydantic-settings automatically loads from .env/environment and validates
try:
    settings = Settings()
    logger.info("Application settings loaded successfully.")
    # Example: Log one setting to confirm loading (avoid logging secrets)
    logger.debug(f"Loaded FRONTEND_URL: {settings.FRONTEND_URL}")
except Exception as e: # Catch potential validation errors
    logger.exception(f"CRITICAL: Failed to load application settings: {e}")
    # Exit if configuration fails - essential settings are missing
    raise SystemExit(f"Configuration Error: {e}")