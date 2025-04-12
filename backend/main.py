from fastapi import FastAPI
from mangum import Mangum
import os
import sys

# Import the app from the current directory's api.py
try:
    from api import app as api_app
    print("Successfully imported API app")
except ImportError as e:
    print(f"Error importing API app: {e}")
    raise

# Create handler for AWS Lambda / Vercel
try:
    handler = Mangum(api_app)
    print("Mangum handler created successfully")
except Exception as e:
    print(f"Error creating Mangum handler: {e}")
    raise