# Load environment variables from .env file
from dotenv import load_dotenv
import os

load_dotenv()

# Load other import
from mangum import Mangum
import sys

# Import the app from the new app structure
try:
    from app.main import app
    print("Successfully imported API app from new structure")
except ImportError as e:
    print(f"Error importing API app: {e}")
    raise

# Create handler for AWS Lambda / Vercel
try:
    handler = Mangum(app)
    print("Mangum handler created successfully")
except Exception as e:
    print(f"Error creating Mangum handler: {e}")
    raise

# For local development
if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app.main:app", host="0.0.0.0", port=8000, reload=True)