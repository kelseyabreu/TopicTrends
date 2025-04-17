# TopicTrends - Collaborative Idea Gathering and Grouping Platform

TopicTrends is a web application that allows organizers to collect ideas from participants and automatically groups similar ideas using AI. The platform is designed for town halls, meetings, education settings, and any scenario where getting organized input from multiple people is valuable.

## Features

- **Create Discussion Sessions**: Set up custom discussions with specific prompts
- **Anonymous or Verified Participation**: Support for both anonymous and verified user inputs
- **AI-Powered Idea Grouping**: Automatically categorizes similar ideas using semantic understanding
- **Real-Time Updates**: See new ideas and groups appear instantly
- **Shareable Links and QR Codes**: Easily invite participants to join discussions
- **Responsive Design**: Works on all devices from phones to desktops

## Technology Stack

- **Frontend**: React, Socket.IO (for real-time updates)
- **Backend**: FastAPI (Python), Socket.IO
- **Database**: MongoDB Atlas (free tier)
- **NLP/AI**: Sentence-BERT for semantic similarity and grouping
- **Deployment**: Vercel (backend), Netlify (frontend)

## Setup and Installation

### Prerequisites

- Node.js 22+ and npm
- Python 3.13+
- MongoDB Atlas account (free tier)

### Backend Setup

1. Clone the repository:
   ```
   git clone https://github.com/yourusername/topictrends.git
   cd topictrends/backend
   ```

2. Create a virtual environment and install dependencies:
   ```
   python -m venv venv
   source venv/bin/activate  # On Windows: venv\Scripts\activate
   pip install -r requirements.txt
   ```

3. Create a `.env` file with your MongoDB connection string:
   ```
   MONGODB_URL=mongodb+srv://<username>:<password>@cluster0.mongodb.net/topictrends
   ```

4. Start the backend server:
   ```
   uvicorn main:app --reload
   ```

### Frontend Setup

1. Navigate to the frontend directory:
   ```
   cd ../frontend
   ```

2. Install dependencies:
   ```
   npm install
   ```

3. Create a `.env` file to configure the API URL:
   ```
   REACT_APP_API_URL=http://localhost:8000
   ```

4. Start the development server:
   ```
   npm start
   ```

5. The application will be available at `http://localhost:3000`

## Usage Guide

### Creating a Discussion

1. Click "Create Discussion" on the home page
2. Enter a title and prompt for your discussion
3. Choose whether to require identity verification
4. Click "Create Discussion"

### Sharing a Discussion

1. After creating a discussion, you'll be taken to the session view
2. Click the "Share" button in the top-right corner
3. Copy the link or download/share the QR code
4. Send to participants using your preferred method

### Joining a Discussion

1. Open the shared link or scan the QR code
2. If verification is required, complete the verification process
3. Click "Join Discussion"

### Submitting Ideas

1. Enter your idea in the text box (max 500 characters)
2. Click "Submit Idea"
3. Your idea will be automatically grouped with similar ideas

### Viewing Results

1. The right panel shows all ideas grouped by similarity
2. Each group displays:
   - A representative idea as the title
   - The count of similar ideas in the group
   - All individual ideas within the group

## Customization

### Adjusting Similarity Threshold

You can adjust how stringent the grouping algorithm is by modifying the `distance_threshold` parameter in the `process_clusters` function in `api.py`:

```python
clustering = AgglomerativeClustering(
    n_clusters=None,
    distance_threshold=0.22,  # Lower value = more strict grouping
    affinity='cosine',
    linkage='average'
).fit(embeddings)
```

### Changing Verification Methods

To implement different verification methods, modify the `JoinSession.js` component and the corresponding backend verification logic.

## Deployment

See the `deployment-config.md` file for detailed instructions on deploying to:
- Vercel (backend)
- Netlify (frontend)
- MongoDB Atlas (database)

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Acknowledgements

- [Sentence-BERT](https://www.sbert.net/) for semantic similarity
- [FastAPI](https://fastapi.tiangolo.com/) for the API framework
- [MongoDB Atlas](https://www.mongodb.com/cloud/atlas) for database
- [React](https://reactjs.org/) for the frontend framework
