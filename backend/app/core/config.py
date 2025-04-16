import os
from pydantic import BaseModel

class Settings(BaseModel):
    """Application settings"""
    # API settings
    API_TITLE: str = "TopicTrends API"
    API_VERSION: str = "1.0.0"
    
    # CORS settings
    CORS_ORIGINS: list = ["http://localhost:3000"]
    
    # MongoDB settings
    MONGODB_URL: str = os.environ.get(
        "MONGODB_URL", 
        "mongodb+srv://topictrends-dev:topictrendsdev@topictrends-dev.hy4hbpt.mongodb.net/?retryWrites=true&w=majority&appName=topictrends-dev"
    )
    
    # Model settings
    MODEL_NAME: str = "all-mpnet-base-v2"
    MODEL_CACHE_DIR: str = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), 'model_cache')
    
    # Clustering settings
    DISTANCE_THRESHOLD_SMALL: float = 0.45  # For < 10 ideas
    DISTANCE_THRESHOLD_MEDIUM: float = 0.35  # For < 50 ideas
    DISTANCE_THRESHOLD_LARGE: float = 0.25  # For >= 50 ideas

# Create settings instance
settings = Settings()