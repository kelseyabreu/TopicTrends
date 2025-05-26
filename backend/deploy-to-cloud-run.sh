#!/bin/bash

# Deploy TopicTrends Backend to Google Cloud Run

set -e  # Exit on error

# Check if gcloud is installed
if ! command -v gcloud &> /dev/null; then
    echo "Error: Google Cloud SDK (gcloud) is not installed."
    echo "Please install it from: https://cloud.google.com/sdk/docs/install"
    exit 1
fi

# Check if user is logged in to gcloud
if ! gcloud auth list --filter=status:ACTIVE --format="value(account)" | grep -q "@"; then
    echo "You are not logged in to Google Cloud. Please login first."
    gcloud auth login
fi

# Get current project
CURRENT_PROJECT=$(gcloud config get-value project)
if [ -z "$CURRENT_PROJECT" ]; then
    echo "No Google Cloud project is set. Please set a project."
    read -p "Enter your Google Cloud project ID: " PROJECT_ID
    gcloud config set project "$PROJECT_ID"
else
    echo "Current Google Cloud project: $CURRENT_PROJECT"
    read -p "Do you want to use this project? (y/n): " USE_CURRENT
    if [ "$USE_CURRENT" != "y" ]; then
        read -p "Enter your Google Cloud project ID: " PROJECT_ID
        gcloud config set project "$PROJECT_ID"
    fi
fi

# Confirm deployment
echo "This script will deploy TopicTrends backend to Google Cloud Run."
echo "It will:"
echo "  1. Build a Docker image using Dockerfile.cloud"
echo "  2. Push the image to Google Container Registry"
echo "  3. Deploy the image to Cloud Run"
read -p "Continue? (y/n): " CONTINUE
if [ "$CONTINUE" != "y" ]; then
    echo "Deployment cancelled."
    exit 0
fi

# Enable required APIs
echo "Enabling required Google Cloud APIs..."
gcloud services enable cloudbuild.googleapis.com run.googleapis.com containerregistry.googleapis.com

# Build and deploy using Cloud Build
echo "Starting deployment with Cloud Build..."
gcloud builds submit --config cloudbuild.yaml

# Get the URL of the deployed service
echo "Deployment completed. Getting service URL..."
SERVICE_URL=$(gcloud run services describe topictrends-backend --platform managed --region us-central1 --format 'value(status.url)')

echo "\nTopicTrends backend has been deployed to: $SERVICE_URL"
echo "\nImportant notes:"
echo "1. Make sure to update your frontend to use this new backend URL"
echo "2. Check Cloud Run logs if you encounter any issues"
echo "3. You may need to adjust memory, CPU, and scaling settings based on your needs"