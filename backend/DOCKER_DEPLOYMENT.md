# Docker Deployment Guide for TopicTrends

This guide explains how to deploy the TopicTrends application using Docker with different environment configurations.

## Environment-Specific Deployments

The application supports three deployment environments:

- **Development**: For local development with hot-reloading
- **Staging**: For testing in a production-like environment
- **Production**: For live deployment

## Prerequisites

- Docker and Docker Compose installed
- Environment-specific `.env` files:
  - `.env.development` (for development)
  - `.env.staging` (for staging)
  - `.env.production` (for production)

## Environment Files

Each environment requires its own `.env` file with the appropriate configuration. Example structure:

```
ENVIRONMENT=development|staging|production
MONGODB_URL=mongodb://username:password@host:port/database
CORS_ORIGINS=["http://localhost:5173", "https://yourdomain.com"]
MODEL_NAME=your-model-name
DISTANCE_THRESHOLD_SMALL=0.45
DISTANCE_THRESHOLD_MEDIUM=0.35
DISTANCE_THRESHOLD_LARGE=0.25
SECRET_KEY=your-secret-key
FRONTEND_URL=http://localhost:5173
GMAIL_SENDER_EMAIL=your-email@gmail.com
GMAIL_APP_PASSWORD=your-app-password
EMAIL_FROM_NAME=TopicTrends
GOOGLE_API_KEY=your-google-api-key
```

## Deployment

Use the provided deployment script to deploy the application in the desired environment:

```bash
# Make the script executable
chmod +x deploy.sh

# Deploy in development mode (default)
./deploy.sh

# Deploy in staging mode
./deploy.sh --environment staging

# Deploy in production mode
./deploy.sh --environment production
```

## Docker Compose Files

The repository includes environment-specific Docker Compose files:

- `docker-compose.dev.yml`: Development configuration with volume mounting for hot-reloading
- `docker-compose.staging.yml`: Staging configuration with persistent Redis volume
- `docker-compose.prod.yml`: Production configuration using the optimized Dockerfile.cloud

## Manual Deployment

If you prefer to deploy manually without the script:

```bash
# Development
docker-compose -f docker-compose.dev.yml up -d --build

# Staging
docker-compose -f docker-compose.staging.yml up -d --build

# Production
docker-compose -f docker-compose.prod.yml up -d --build
```

## Environment Differences

### Development
- Uses the standard Dockerfile
- Mounts the local directory for hot-reloading
- Runs on port 8000
- Enables debug mode and hot-reloading

### Staging
- Uses the standard Dockerfile
- Runs on port 8000
- Includes persistent Redis volume
- Configures restart policies

### Production
- Uses the optimized Dockerfile.cloud
- Runs on port 8080
- Includes persistent Redis volume
- Configures restart policies
- Optimized for production performance

## Cloud Deployment

For deploying to cloud platforms like Google Cloud Run, refer to the `CLOUD_RUN_README.md` file for specific instructions.

## Troubleshooting

### Common Issues

1. **Environment file not found**
   - Ensure you've created the appropriate `.env.{environment}` file

2. **Port conflicts**
   - Change the port mapping in the Docker Compose file if ports 8000/8080 are already in use

3. **Redis connection issues**
   - Verify the Redis service is running: `docker-compose ps`
   - Check Redis logs: `docker-compose logs redis`

### Viewing Logs

```bash
# View all logs
docker-compose -f docker-compose.{environment}.yml logs

# View app logs only
docker-compose -f docker-compose.{environment}.yml logs app

# Follow logs in real-time
docker-compose -f docker-compose.{environment}.yml logs -f
```

## Stopping the Application

```bash
# Stop the application
docker-compose -f docker-compose.{environment}.yml down

# Stop and remove volumes (will delete persistent data)
docker-compose -f docker-compose.{environment}.yml down -v
```