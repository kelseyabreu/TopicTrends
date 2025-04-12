// File: src/pages/SessionView.js
import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import io from 'socket.io-client';
import '../styles/SessionView.css';
import api from '../utils/api';

function SessionView() {
  const { sessionId } = useParams();
  const navigate = useNavigate();
  const [session, setSession] = useState(null);
  const [idea, setIdea] = useState('');
  const [clusters, setClusters] = useState([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [userId, setUserId] = useState('');
  const [isVerified, setIsVerified] = useState(false);
  const [verificationMethod, setVerificationMethod] = useState(null);
  const [showShareModal, setShowShareModal] = useState(false);
  const socketRef = useRef(null);
  
  // Check if user has joined this session
  useEffect(() => {
    const storedUserId = localStorage.getItem(`TopicTrends_${sessionId}_userId`);
    const storedIsVerified = localStorage.getItem(`TopicTrends_${sessionId}_isVerified`) === 'true';
    const storedVerificationMethod = localStorage.getItem(`TopicTrends_${sessionId}_verificationMethod`);
    
    if (!storedUserId) {
      // User hasn't joined this session
      navigate(`/join/${sessionId}`);
      return;
    }
    
    setUserId(storedUserId);
    setIsVerified(storedIsVerified);
    setVerificationMethod(storedVerificationMethod);
    
    // Fetch session details
    const fetchSessionData = async () => {
      try {
        const sessionResponse = await api.get(`/api/sessions/${sessionId}`);
        setSession(sessionResponse.data);
        
        const clustersResponse = await api.get(`/api/sessions/${sessionId}/clusters`);
        setClusters(clustersResponse.data.clusters.sort((a, b) => b.count - a.count));
      } catch (error) {
        console.error('Error fetching session data:', error);
        toast.error('Failed to load session data');
        navigate('/');
      } finally {
        setIsLoading(false);
      }
    };
    
    fetchSessionData();
    
    // Set up Socket.IO connection
    const socket = io(process.env.REACT_APP_API_URL, {
      transports: ['websocket']
    });
    
    socket.on('connect', () => {
      console.log('Connected to Socket.IO');
      socket.emit('join', sessionId);
    });
    
    socket.on('clusters_updated', (data) => {
      if (data.session_id === sessionId) {
        setClusters(data.clusters.sort((a, b) => b.count - a.count));
      }
    });
    
    socketRef.current = socket;
    
    return () => {
      socket.emit('leave', sessionId);
      socket.disconnect();
    };
  }, [sessionId, navigate]);
  
  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!idea.trim()) {
      toast.error('Please enter an idea');
      return;
    }
    
    if (idea.length > 500) {
      toast.error('Idea text is too long (maximum 500 characters)');
      return;
    }
    
    setIsSubmitting(true);
    
    try {
      await api.post(`/api/sessions/${sessionId}/ideas`, {
        text: idea,
        user_id: userId,
        verified: isVerified,
        verification_method: verificationMethod
      });
      
      toast.success('Idea submitted successfully!');
      setIdea('');
    } catch (error) {
      console.error('Error submitting idea:', error);
      toast.error('Failed to submit idea. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };
  
  const copyShareLink = () => {
    if (!session) return;
    
    navigator.clipboard.writeText(session.join_link);
    toast.success('Link copied to clipboard!');
  };
  
  if (isLoading) {
    return (
      <div className="session-view-container loading">
        <div className="loader"></div>
        <p>Loading session data...</p>
      </div>
    );
  }
  
  return (
    <div className="session-view-container">
      <div className="header">
        <div className="logo" onClick={() => navigate('/')}>Idea<span>Group</span></div>
        <button 
          className="share-button"
          onClick={() => setShowShareModal(true)}
        >
          Share
        </button>
      </div>
      
      <div className="session-info">
        <h1>{session.title}</h1>
        <p className="prompt">{session.prompt}</p>
        <div className="stats">
          <div className="stat">
            <span className="stat-value">{session.idea_count}</span>
            <span className="stat-label">Ideas</span>
          </div>
          <div className="stat">
            <span className="stat-value">{clusters.length}</span>
            <span className="stat-label">Groups</span>
          </div>
        </div>
      </div>
      
      <div className="main-content">
        <div className="idea-input-section">
          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label htmlFor="idea-input">Your Idea</label>
            <textarea
              id="idea-input"
              value={idea}
              onChange={(e) => setIdea(e.target.value)}
              placeholder="Share your idea here..."
              maxLength="500"
              required
              disabled={isSubmitting}
            />
            <small>{idea.length}/500 characters</small>
          </div>
          
          <div className="user-info">
            {isVerified ? (
              <span className="verification-badge">✓ Verified User</span>
            ) : (
              <span className="anonymous-badge">Anonymous</span>
            )}
          </div>
          
          <button 
            type="submit" 
            className="btn btn-primary"
            disabled={isSubmitting}
          >
            {isSubmitting ? 'Submitting...' : 'Submit Idea'}
          </button>
        </form>
      </div>
      
      <div className="clusters-section">
        <h2>Topic Trends</h2>
        {clusters.length === 0 ? (
          <div className="no-clusters">
            <p>No ideas submitted yet. Be the first to contribute!</p>
          </div>
        ) : (
          <div className="clusters-list">
            {clusters.map((cluster) => (
              <div className="cluster-card" key={cluster.id}>
                <div className="cluster-header">
                  <span className="cluster-title">{cluster.representative_text}</span>
                  <span className="cluster-count">{cluster.count}</span>
                </div>
                <div className="cluster-ideas">
                  {cluster.ideas.map((idea) => (
                    <div className="idea-card" key={idea.id}>
                      <p>{idea.text}</p>
                      <div className="idea-meta">
                        <span className="idea-user">
                          {idea.verified ? (
                            <span className="verification-badge">✓ Verified</span>
                          ) : (
                            <span className="anonymous-badge">Anonymous</span>
                          )}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
    
    {showShareModal && (
      <div className="modal-overlay">
        <div className="share-modal">
          <div className="modal-header">
            <h2>Share This Discussion</h2>
            <button 
              className="close-button"
              onClick={() => setShowShareModal(false)}
            >
              ×
            </button>
          </div>
          
          <div className="modal-content">
            <p>Share this link with others to invite them to contribute:</p>
            
            <div className="share-link">
              <input 
                type="text" 
                value={session.join_link} 
                readOnly 
              />
              <button 
                className="copy-button"
                onClick={copyShareLink}
              >
                Copy
              </button>
            </div>
            
            <div className="qr-code">
              <h3>Or scan this QR code:</h3>
              <img src={session.qr_code} alt="QR Code" />
            </div>
          </div>
        </div>
      </div>
    )}
  </div>
  );
}

export default SessionView;