#!/bin/bash

# TopicTrends Docker Deployment Script
# This script helps deploy the application in different environments

set -e

# Default environment is development
ENV="development"

# Parse command line arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    -e|--environment)
      ENV="$2"
      shift 2
      ;;
    -h|--help)
      echo "Usage: ./deploy.sh [options]"
      echo "Options:"
      echo "  -e, --environment ENV    Set deployment environment (development, staging, production)"
      echo "  -h, --help               Show this help message"
      exit 0
      ;;
    *)
      echo "Unknown option: $1"
      exit 1
      ;;
  esac
done

# Validate environment
if [[ "$ENV" != "development" && "$ENV" != "staging" && "$ENV" != "production" ]]; then
  echo "Error: Invalid environment '$ENV'. Must be 'development', 'staging', or 'production'."
  exit 1
fi

# Set environment-specific variables
case $ENV in
  development)
    COMPOSE_FILE="docker-compose.dev.yml"
    ENV_FILE=".env.development"
    ;;
  staging)
    COMPOSE_FILE="docker-compose.staging.yml"
    ENV_FILE=".env.staging"
    ;;
  production)
    COMPOSE_FILE="docker-compose.prod.yml"
    ENV_FILE=".env.production"
    ;;
esac

# Check if environment file exists
if [ ! -f "$ENV_FILE" ]; then
  echo "Error: Environment file '$ENV_FILE' not found."
  echo "Please create this file with the required environment variables."
  exit 1
fi

# Check if compose file exists
if [ ! -f "$COMPOSE_FILE" ]; then
  echo "Error: Docker Compose file '$COMPOSE_FILE' not found."
  exit 1
fi

echo "Deploying TopicTrends in $ENV environment..."

# Load environment variables
set -a
source "$ENV_FILE"
set +a

# Deploy with Docker Compose
echo "Starting services using $COMPOSE_FILE..."
docker-compose -f "$COMPOSE_FILE" up -d --build

echo "Deployment complete! Application is running in $ENV mode."

if [ "$ENV" == "development" ]; then
  echo "View the API at http://localhost:8000/api/docs"
else
  echo "View the API at http://localhost:8080/api/docs"
fi