# TopicTrends Backend

A FastAPI-based backend service for topic clustering and trend analysis using AI models.

## Features

- Real-time topic clustering using advanced ML models
- Hierarchical agglomerative clustering with dynamic thresholds
- Integration with Ollama for text embeddings and LLM-based topic naming
- RESTful API with WebSocket support for real-time updates
- MongoDB integration for persistent storage
- Email notification system

## Folder Structure

The backend is organized using a modular structure:

```
backend/
├── app/                    # Main application package
│   ├── core/               # Core application components
│   │   ├── config.py       # Application configuration
│   │   ├── database.py     # Database connection
│   │   ├── ml.py           # Legacy ML model setup
│   │   └── socketio.py     # Socket.IO implementation
│   ├── models/             # Data models
│   │   ├── schemas.py      # Pydantic models for discussions/ideas
│   │   └── user_schemas.py # User-related models
│   ├── routers/            # API route handlers 
│   │   ├── auth.py         # Authentication endpoints
│   │   ├── topics.py       # Topic management
│   │   ├── ideas.py        # Idea submission and retrieval
│   │   └── discussions.py  # Discussion-related endpoints
│   ├── services/           # Business logic
│   │   ├── auth.py         # Authentication services
│   │   ├── email.py        # Email service
│   │   └── genkit/         # AI services
│   │       ├── ai.py       # Main clustering implementation
│   │       └── flows/      # AI workflows
│   └── utils/              # Utility functions
├── main.py                 # Application entry point
├── requirements.txt        # Project dependencies
├── Dockerfile             # Docker configuration
├── docker-compose.yml     # Docker Compose configuration
└── vercel.json            # Vercel deployment configuration
```

## Prerequisites

Before running the backend, ensure you have one of the following setups:

### Option 1: Docker Setup (Recommended)

- Docker and Docker Compose installed
- MongoDB instance (local or remote)

### Option 2: Local Development Setup

- Python 3.9+
- MongoDB instance
- Ollama for managing language models and embeddings

## Getting Started

### Docker Deployment (Recommended)

1. **Clone the repository and navigate to the backend directory**

2. **Create a .env file**:
   ```env
   MONGODB_URL=your-mongodb-connection-string
   CORS_ORIGINS=http://localhost:5173
   MODEL_NAME=all-mpnet-base-v2
   SECRET_KEY=your-secret-key-here
   FRONTEND_URL=http://localhost:5173
   GOOGLE_API_KEY=your-api-key-here
   
   # Email configuration 
   GMAIL_SENDER_EMAIL=your-email@gmail.com
   GMAIL_APP_PASSWORD=your-app-password
   EMAIL_FROM_NAME=TopicTrends
   ```

3. **Build and start the containers**:
   ```bash
   docker-compose up --build
   ```
   **To Stop the containers**
   ```bash
   docker-compose down
   ```

The API will be available at http://localhost:8000

### Local Development Setup

1. **Install dependencies**:
   ```bash
   pip install -r requirements.txt
   ```

2. **Install Ollama**:
   Download and install Ollama from: https://ollama.com/download
   ```bash
   pip install genkit-plugin-ollama
   ```

3. **Pull the LLM models**:
   ```bash
   ollama pull gemma3
   ollama pull nomic-embed-text
   ```

4. **Set up environment variables** as described in the Docker setup section

5. **Start the development server**:
   ```bash
   uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
   ```

## AI Architecture

### Genkit Integration

The backend uses Genkit with Ollama to perform text embedding and clustering:

1. **Text Embedding**: Uses the nomic-embed-text model to convert idea text into high-dimensional vector representations (512 dimensions)
2. **Clustering**: Performs hierarchical agglomerative clustering on the embeddings with cosine distance
3. **Naming**: Uses the gemma3 model to generate descriptive titles for each topic based on the ideas it contains

The implementation can be found in `app/services/genkit/ai.py` and relies on a threshold-based approach that adjusts clustering parameters based on the number of ideas.

### Clustering Algorithm

The clustering algorithm employs a sophisticated approach:

1. **Embedding Generation**: Each idea is converted to a high-dimensional vector using the nomic-embed-text model
2. **Similarity Calculation**: Cosine similarity between vectors determines how related ideas are
3. **Hierarchical Clustering**: Uses scikit-learn's AgglomerativeClustering with a dynamic distance threshold
4. **Representative Selection**: For each topic, the idea closest to the centroid becomes the representative
5. **Topic Naming**: A Gemini LLM generates a descriptive name for each topic based on its ideas

The distance threshold for clustering automatically adjusts based on the number of ideas:
- Small groups (< 25 ideas): Threshold = 0.15 (stricter clustering)
- Medium groups (25-50 ideas): Threshold = 0.25 (moderate clustering)
- Large groups (> 50 ideas): Threshold = 0.35 (more lenient clustering)

This dynamic approach ensures that clustering works well regardless of the group size.

## API Documentation

Once the server is running, you can access the interactive API documentation at:

- Swagger UI: http://localhost:8000/docs
- ReDoc: http://localhost:8000/redoc
