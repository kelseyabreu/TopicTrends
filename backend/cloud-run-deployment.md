# Deploying TopicTrends Backend to Google Cloud Run

This guide provides instructions for deploying the TopicTrends backend to Google Cloud Run.

## Prerequisites

- Google Cloud account with billing enabled
- Google Cloud CLI (`gcloud`) installed and configured
- Docker installed locally

## Deployment Steps

### 1. Prepare Your Environment

```bash
# Install Google Cloud CLI if not already installed
# Follow instructions at: https://cloud.google.com/sdk/docs/install

# Login to Google Cloud
gcloud auth login

# Set your project ID
gcloud config set project ideocean
```

### 2. Create a Cloud Run Service Configuration

Create a new file named `cloudbuild.yaml` in your project root with the following content:

```yaml
steps:
  # Build the container image
  - name: 'gcr.io/cloud-builders/docker'
    args: ['build', '-t', 'gcr.io/$PROJECT_ID/topictrends-backend', '.']
  # Push the container image to Container Registry
  - name: 'gcr.io/cloud-builders/docker'
    args: ['push', 'gcr.io/$PROJECT_ID/topictrends-backend']
  # Deploy container image to Cloud Run
  - name: 'gcr.io/google.com/cloudsdktool/cloud-sdk'
    entrypoint: gcloud
    args:
      - 'run'
      - 'deploy'
      - 'topictrends-backend'
      - '--image=gcr.io/$PROJECT_ID/topictrends-backend'
      - '--region=us-central1'
      - '--platform=managed'
      - '--allow-unauthenticated'
      - '--memory=2Gi'
      - '--cpu=2'
      - '--min-instances=0'
      - '--max-instances=10'
      - '--set-env-vars=MONGODB_URL=${_MONGODB_URL},CORS_ORIGINS=${_CORS_ORIGINS},MODEL_NAME=${_MODEL_NAME},SECRET_KEY=${_SECRET_KEY},FRONTEND_URL=${_FRONTEND_URL},GMAIL_SENDER_EMAIL=${_GMAIL_SENDER_EMAIL},GMAIL_APP_PASSWORD=${_GMAIL_APP_PASSWORD},EMAIL_FROM_NAME=${_EMAIL_FROM_NAME},GOOGLE_API_KEY=${_GOOGLE_API_KEY},ENVIRONMENT=production,PORT=8080'
substitutions:
  _MONGODB_URL: 'mongodb+srv://your-mongodb-url'
  _CORS_ORIGINS: '["https://your-frontend-url.com"]'
  _MODEL_NAME: 'all-mpnet-base-v2'
  _SECRET_KEY: 'your-secret-key-here'
  _FRONTEND_URL: 'https://your-frontend-url.com'
  _GMAIL_SENDER_EMAIL: 'your-email@gmail.com'
  _GMAIL_APP_PASSWORD: 'your-app-password'
  _EMAIL_FROM_NAME: 'TopicTrends'
  _GOOGLE_API_KEY: 'your-google-api-key'
images:
  - 'gcr.io/$PROJECT_ID/topictrends-backend'
```

### 3. Modify Your Dockerfile for Cloud Run

Create a new Dockerfile for Cloud Run deployment:

```dockerfile
# Use Python 3.11 as base image
FROM python:3.11-slim

# Set working directory
WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements file
COPY requirements.txt .

# Install Python dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY . .

# Expose port - Cloud Run will use PORT env variable
ENV PORT 8000
EXPOSE ${PORT}

# Command to run the application
CMD exec uvicorn app.main:app --host 0.0.0.0 --port ${PORT}
```

### 4. Set Up External Services

#### MongoDB Atlas

- Ensure your MongoDB Atlas cluster is accessible from Google Cloud Run
- Configure network access to allow connections from anywhere (0.0.0.0/0) or from Google Cloud IP ranges

#### Redis

For Redis, you have two options:

1. **Use Google Cloud Memorystore for Redis**:
   - Create a Memorystore instance in the same region as your Cloud Run service
   - Set up VPC access connector to connect Cloud Run to Memorystore
   - Update your application to use the Memorystore Redis instance

2. **Use a managed Redis service** like Redis Labs or Upstash

#### AI Services

For AI-powered text embeddings and language models in the cloud environment:

- Use Google's Vertex AI or OpenAI API for text embeddings and language model capabilities
- Update your application code to use these cloud services
- Add the necessary API keys to your environment variables

### 5. Update Environment Variables

In the Google Cloud Console:

1. Navigate to Cloud Run
2. Select your service
3. Go to "Edit & Deploy New Revision"
4. Under "Container, Networking, Security", add your environment variables:
   - MONGODB_URL
   - CORS_ORIGINS (update to include your deployed frontend URL)
   - MODEL_NAME
   - SECRET_KEY
   - FRONTEND_URL (update to your deployed frontend URL)
   - GMAIL_SENDER_EMAIL
   - GMAIL_APP_PASSWORD
   - EMAIL_FROM_NAME
   - GOOGLE_API_KEY
   - REDIS_URL (if using external Redis service)
   - PORT=8080

### 6. Deploy to Cloud Run

```bash
# Build and deploy using Cloud Build
gcloud builds submit --config cloudbuild.yaml
```

### 7. Verify Deployment

```bash
# Get the URL of your deployed service
gcloud run services describe topictrends-backend --platform managed --region us-central1 --format 'value(status.url)'
```

Visit the URL to verify your service is running.

## Important Considerations

1. **Statelessness**: Cloud Run instances are ephemeral. Don't store data on the local filesystem.

2. **Cold Starts**: Cloud Run services may experience cold starts. Consider setting min-instances to 1 if low latency is critical.

3. **Request Timeouts**: Cloud Run has a maximum request timeout of 60 minutes.

4. **Environment Variables**: Sensitive values should be stored in Secret Manager.

5. **Costs**: Monitor your usage to control costs. Cloud Run charges based on resources allocated and actual usage.

6. **Logging**: Use Cloud Logging to monitor your application.

## Troubleshooting

- **Deployment Failures**: Check Cloud Build logs for errors
- **Runtime Errors**: Check Cloud Run logs
- **Connection Issues**: Verify network settings for MongoDB and Redis
- **Memory/CPU Issues**: Consider increasing memory/CPU allocation