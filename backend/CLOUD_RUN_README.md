# Deploying TopicTrends Backend to Google Cloud Run

This guide provides step-by-step instructions for deploying the TopicTrends backend to Google Cloud Run.

## Files Created for Cloud Run Deployment

1. **Dockerfile.cloud** - Optimized Dockerfile for Cloud Run deployment
2. **cloudbuild.yaml** - Configuration for Google Cloud Build
3. **deploy-to-cloud-run.sh** - Helper script to simplify deployment
4. **cloud-run-deployment.md** - Detailed documentation on the deployment process

## Quick Start Deployment

### Prerequisites

- Google Cloud account with billing enabled
- Google Cloud CLI (`gcloud`) installed and configured
- Docker installed locally

### Deployment Steps

1. **Login to Google Cloud**

   ```bash
   gcloud auth login
   gcloud config set project Ideocean
   ```

2. **Make the deployment script executable**

   ```bash
   chmod +x deploy-to-cloud-run.sh
   ```

3. **Run the deployment script**

   ```bash
   ./deploy-to-cloud-run.sh
   ```

   This script will:
   - Enable required Google Cloud APIs
   - Build your Docker image using Dockerfile.cloud
   - Push the image to Google Container Registry
   - Deploy to Cloud Run
   - Display the URL of your deployed service

## Important Configuration Notes

### Environment Variables

Before deployment, update the environment variable values in `cloudbuild.yaml` with your actual values:

- `_MONGODB_URL`: Your MongoDB connection string
- `_CORS_ORIGINS`: Update to include your deployed frontend URL
- `_SECRET_KEY`: Your application secret key
- `_FRONTEND_URL`: Your deployed frontend URL
- `_GMAIL_SENDER_EMAIL`: Email for sending notifications
- `_GMAIL_APP_PASSWORD`: App password for the email account
- `_GOOGLE_API_KEY`: Your Google API key

### External Services

#### MongoDB Atlas

- Ensure your MongoDB Atlas cluster is accessible from Google Cloud Run
- Configure network access to allow connections from anywhere (0.0.0.0/0) or from Google Cloud IP ranges

#### Redis

The Cloud Run deployment is configured to use an external Redis service. You have two options:

1. **Use Google Cloud Memorystore for Redis**:
   - Create a Memorystore instance in the same region as your Cloud Run service
   - Set up VPC access connector to connect Cloud Run to Memorystore
   - Add the Redis URL to your environment variables

2. **Use a managed Redis service** like Redis Labs or Upstash

#### Ollama

Since Ollama is used for local model inference, you'll need to replace it with a cloud-based alternative:

- Consider using Google's Vertex AI or OpenAI API instead of Ollama
- Update your application code to use these cloud services

## Troubleshooting

- **Deployment Failures**: Check Cloud Build logs for errors
- **Runtime Errors**: Check Cloud Run logs
- **Connection Issues**: Verify network settings for MongoDB and Redis
- **Memory/CPU Issues**: Consider increasing memory/CPU allocation in cloudbuild.yaml

## For More Detailed Information

See the `cloud-run-deployment.md` file for more detailed information about the deployment process and configuration options.