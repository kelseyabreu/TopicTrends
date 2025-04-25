# TopicTrends Backend

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
│   │   ├── schemas.py      # Pydantic models for sessions/ideas
│   │   └── user_schemas.py # User-related models
│   ├── routers/            # API route handlers 
│   │   ├── auth.py         # Authentication endpoints
│   │   ├── clusters.py     # Cluster management
│   │   ├── ideas.py        # Idea submission and retrieval
│   │   └── sessions.py     # Session-related endpoints
│   ├── services/           # Business logic
│   │   ├── auth.py         # Authentication services
│   │   ├── email.py        # Email service
│   │   └── genkit/         # AI services
│   │       ├── ai.py       # Main clustering implementation
│   │       └── flows/      # AI workflows
│   └── utils/              # Utility functions
├── main.py                 # Application entry point
├── requirements.txt        # Project dependencies
└── vercel.json             # Vercel deployment configuration
```

## Getting Started

### Installation

```bash
# Install dependencies
pip install -r requirements.txt
```

### Prerequisites

Before running the backend, ensure you have the following prerequisites installed:

- **Ollama**: Install Ollama to manage language models and embeddings.

### Setup Instructions

1. **Install Ollama**:
   Download and install Ollama from: https://ollama.com/download
   ```bash
   pip install genkit-plugin-ollama
   ```

2. **Pull the LLM models**:
   ```bash
   ollama pull gemma3
   ollama pull nomic-embed-text
   ```

3. **Set the Gemini API Key**:
   ```bash
   # Linux/macOS
   export GOOGLE_API_KEY=your-api-key-here
   
   # Windows
   setx GOOGLE_API_KEY your-api-key-here
   ```

4. **Create a .env file**:
   ```
   MONGODB_URL=your-mongodb-connection-string
   CORS_ORIGINS=http://localhost:5173
   MODEL_NAME=all-mpnet-base-v2
   SECRET_KEY=your-secret-key-here
   FRONTEND_URL=http://localhost:5173
   ```

### Running the Application

```bash
# Start the development server
python main.py
```

The API will be available at http://localhost:8000

## API Documentation

Once the server is running, you can access the interactive API documentation at:

- Swagger UI: http://localhost:8000/docs
- ReDoc: http://localhost:8000/redoc