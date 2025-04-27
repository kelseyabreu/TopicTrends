# TopicTrends

A collaborative platform for gathering and automatically organizing ideas from groups of any size.

## Table of Contents

- [Overview](#overview)
- [Key Features](#key-features)
- [Technology Stack](#technology-stack)
- [Local Development Setup](#local-development-setup)
  - [Prerequisites](#prerequisites)
  - [Backend Setup](#backend-setup)
  - [Frontend Setup](#frontend-setup)
  - [Running the Application](#running-the-application)
- [Production Deployment](#production-deployment)
  - [Database Setup](#database-setup)
  - [Backend Deployment](#backend-deployment)
  - [Frontend Deployment](#frontend-deployment)
- [Usage Guide](#usage-guide)
  - [Creating a Discussion](#creating-a-discussion)
  - [Joining a Discussion](#joining-a-discussion)
  - [Submitting Ideas](#submitting-ideas)
  - [Viewing Results](#viewing-results)
- [How It Works](#how-it-works)
  - [AI-powered Grouping Algorithm](#ai-powered-grouping-algorithm)
  - [Real-time Updates](#real-time-updates)
- [Troubleshooting](#troubleshooting)

## Overview

TopicTrends transforms how organizations collect and process ideas from large groups. It uses AI-powered analysis to automatically group similar ideas, enabling leaders to understand collective input without the noise and manual effort of traditional methods.

Whether used in town halls, corporate meetings, classrooms, or public forums, TopicTrends helps identify patterns and priorities that might otherwise be missed.

## Key Features

- **Intelligent Idea/Topic Grouping**: Automatically categorizes similar ideas using semantic understanding
- **Real-time Collaboration**: Updates appear instantly as new ideas are submitted
- **Identity Options**: Support for both anonymous and verified submissions
- **Shareable Discussions**: Easy distribution via link or QR code
- **Responsive Design**: Works on all devices from phones to desktops
- **No Category Restrictions**: Ideas are grouped naturally without predefined categories

## Technology Stack

- **Frontend**: React (v18.3.1) with TypeScript, Tailwind CSS, and shadcn/ui components
- **Backend**: FastAPI (Python 3.13)
- **Database**: MongoDB
- **AI/Machine Learning**: 
  - Currently uses Genkit with Ollama for embedding and clustering
  - Uses nomic-embed-text for text embeddings and gemma3 for topic naming
- **Real-time Communication**: Socket.IO
- **Deployment**: Vercel (backend), Netlify (frontend), MongoDB Atlas (database)

## Local Development Setup

### Prerequisites

- **Node.js**: v22.14.0 (recommended)
- **Python**: v3.13 (required)
- **MongoDB**: Local instance or MongoDB Atlas account
- **Ollama**: Required for the embedding and clustering models

### Backend Setup

1. **Clone the repository**:
   ```bash
   git clone https://github.com/yourusername/TopicTrends.git
   cd TopicTrends
   ```

2. **Create and activate a Python virtual environment**:
   ```bash
   # Windows
   python -m venv venv
   venv\Scripts\activate

   # macOS/Linux
   python3 -m venv venv
   source venv/bin/activate
   ```

3. **Install backend dependencies**:
   ```bash
   cd backend
   pip install -r requirements.txt
   ```

4. **Set up Ollama**:
   ```bash
   # Install Ollama 
   https://ollama.com/download
   
   # Pull required models
   ollama pull gemma3
   ollama pull nomic-embed-text
   ```

5. **Set the Gemini API Key**:
   ```bash
   # Linux/macOS
   export GOOGLE_API_KEY=your-api-key-here
   
   # Windows
   setx GOOGLE_API_KEY your-api-key-here
   ```

6. **Set up MongoDB Atlas**:
   - Sign up at https://www.mongodb.com/cloud/atlas
   - Create a free M0 cluster
   - Set up a database user with read/write permissions
   - Configure network access (IP whitelist)
   - Get your connection string in format: `mongodb+srv://<username>:<password>@<cluster>.mongodb.net/TopicTrends`

7. **Create a `.env` file in the backend directory**:
   ```
   MONGODB_URL=mongodb+srv://<username>:<password>@<cluster>.mongodb.net/TopicTrends
   CORS_ORIGINS=http://localhost:5173
   FRONTEND_URL=http://localhost:5173
   SECRET_KEY=your-secret-key-here-for-development-only
   ```

8. **Start the backend server**:
   ```bash
   python main.py
   ```
   The API will be available at http://localhost:8000

### Frontend Setup

1. **Navigate to the frontend directory**:
   ```bash
   cd ../frontend
   ```

2. **Install Node.js dependencies**:
   ```bash
   npm install
   ```

3. **Create a `.env.development` file**:
   ```
   VITE_API_URL=http://localhost:8000
   VITE_CLIENT_URL=http://localhost:5173
   ```

4. **Start the development server**:
   ```bash
   npm start
   ```
   The frontend will be available at http://localhost:5173

### Running the Application

With both the backend and frontend running:

1. Open your browser to http://localhost:5173
2. Create a new discussion
3. Use the generated link to access the discussion from any device on your network

## Production Deployment

### Database Setup

1. **Create a MongoDB Atlas account**:
   - Sign up at https://www.mongodb.com/cloud/atlas
   - Create a free M0 cluster
   - Set up a database user with read/write permissions
   - Configure network access (IP whitelist)

2. **Get your connection string**:
   It will look like: `mongodb+srv://<username>:<password>@cluster0.mongodb.net/TopicTrends`

### Backend Deployment

#### Deploying to Vercel

1. **Install Vercel CLI**:
   ```bash
   npm install -g vercel
   ```

2. **Login to Vercel**:
   ```bash
   vercel login
   ```

3. **Navigate to the project root and deploy**:
   ```bash
   vercel
   ```

4. **Set environment variables in Vercel dashboard**:
   - `MONGODB_URL`: Your MongoDB Atlas connection string

5. **Deploy to production**:
   ```bash
   vercel --prod
   ```

### Frontend Deployment

#### Deploying to Netlify

1. **Install Netlify CLI**:
   ```bash
   npm install -g netlify-cli
   ```

2. **Login to Netlify**:
   ```bash
   netlify login
   ```

3. **Navigate to the frontend directory**:
   ```bash
   cd frontend
   ```

4. **Build the production version**:
   ```bash
   npm run build
   ```

5. **Create a `.env.production` file with your deployed backend URL**:
   ```
   REACT_APP_API_URL=https://your-backend-url.vercel.app
   ```

6. **Deploy to Netlify**:
   ```bash
   netlify deploy
   ```

7. **Deploy to production**:
   ```bash
   netlify deploy --prod
   ```

## Usage Guide

### Creating a Discussion

1. From the home page, click "Create Discussion"
2. Enter a title and prompt (e.g., "Park Improvements" and "What changes would you like to see in our local park?")
3. Choose whether to require identity verification
4. Click "Create Discussion"

### Joining a Discussion

1. Use the link or QR code shared by the discussion creator
2. If verification is required, complete the verification process
3. Click "Join Discussion"

### Submitting Ideas

1. Type your idea in the text box (limit: 500 characters)
2. Review your submission
3. Click "Submit Idea"

### Viewing Results

The results panel shows:
- Ideas automatically grouped by similarity
- Groups categorized by size (Ripples, Waves, Breakers, and Tsunamis)
- Individual ideas within each group
- Verification status of each submission

## How It Works

### AI-powered Grouping Algorithm

TopicTrends uses a sophisticated natural language processing approach to understand and group ideas:

1. **Text Embeddings**: Each idea is converted into a high-dimensional vector using semantic models
2. **Similarity Calculation**: Cosine similarity measures how related ideas are to each other
3. **Clustering**: Ideas are grouped based on their semantic similarity
4. **Representative Selection**: The most central idea in each topic becomes its representative

### Real-time Updates

The platform uses Socket.IO to provide immediate updates:

1. When a new idea is submitted, it's stored in the database
2. A background task processes the clustering algorithm
3. Updated topics are emitted to all connected clients
4. The UI refreshes to show the new organization

## Troubleshooting

### Backend Issues

**"Error with embedding model"**
- Ensure Ollama is running
- Verify that the required models have been pulled

**"MongoDB Connection Error"**
- Verify your connection string format
- Check network access settings in MongoDB Atlas
- Ensure your IP address is whitelisted

### Frontend Issues

**"WebSocket connection failed"**
- Check that the backend is running
- Verify the VITE_API_URL environment variable
- Ensure your firewall isn't blocking WebSocket connections