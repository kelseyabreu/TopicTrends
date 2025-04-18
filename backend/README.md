# TopicTrends Backend

## Folder Structure

The backend is organized using a modular structure to improve maintainability and testability:

```
backend/
├── app/                    # Main application package
│   ├── api/                # API layer
│   │   ├── routes/         # API endpoints organized by resource
│   │   │   ├── sessions.py # Session-related endpoints
│   │   │   ├── ideas.py    # Idea submission and retrieval
│   │   │   └── clusters.py # Cluster management
│   │   └── socket.py       # Socket.IO implementation
│   ├── core/               # Core application components
│   │   ├── config.py       # Application configuration
│   │   ├── database.py     # Database connection
│   │   └── ml.py           # Machine learning model setup
│   ├── models/             # Data models
│   │   └── schemas.py      # Pydantic models for validation
│   ├── services/           # Business logic
│   │   └── clustering.py   # Clustering implementation
│   └── utils/              # Utility functions
├── model_cache/            # Cache for ML models
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

- **Ollama**: Install Ollama to manage embeddings.

### Setup Instructions

1. **Install Ollama**:
You will need to download and install Ollama separately: https://ollama.com/download
   ```bash
   pip3 install genkit-plugin-ollama
   ```

2. **Pull the LLM**:
   ```bash
   ollama pull gemma3
   ollama pull nomic-embed-text
   ```
   This will allow you to embed ideas locally.

3. **Set the Gemini API Key**:
   Run the following command in your terminal to set your Gemini API key:
   ```bash
   export GOOGLE_API_KEY=AIzaSyBfRFz3pcIveQLWea_Sd_JmipPEBieNft4
	setx GOOGLE_API_KEY AIzaSyBfRFz3pcIveQLWea_Sd_JmipPEBieNft4  -- for windows
   ```
4. **Install Genkit locally**:
[https://python.api.genkit.dev/get-started/]
   ```bash
   npm i -g genkit-cli
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

## Deployment

The application is configured for deployment on Vercel using the provided `vercel.json` configuration file.