// File: src/pages/JoinSession.js
import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import '../styles/JoinSession.css';
import api from '../utils/api';

function JoinSession() {
  const { sessionId } = useParams();
  const navigate = useNavigate();
  const [session, setSession] = useState(null);
  const [userId, setUserId] = useState('');
  const [isVerified, setIsVerified] = useState(false);
  const [verificationMethod, setVerificationMethod] = useState('id');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  
  useEffect(() => {
    // Generate a random user ID for anonymous users
    const generatedUserId = 'anon_' + Math.random().toString(36).substring(2, 15);
    setUserId(generatedUserId);
    
    // Fetch session details
    const fetchSession = async () => {
      try {
        const response = await api.get(`/api/sessions/${sessionId}`);
        setSession(response.data);
      } catch (error) {
        console.error('Error fetching session:', error);
        setError('Session not found. The link may be invalid or expired.');
      } finally {
        setIsLoading(false);
      }
    };
    
    fetchSession();
  }, [sessionId]);
  
  const handleJoin = () => {
    // Store user info in localStorage for this session
    localStorage.setItem(`TopicTrends_${sessionId}_userId`, userId);
    localStorage.setItem(`TopicTrends_${sessionId}_isVerified`, isVerified.toString());
    if (isVerified) {
      localStorage.setItem(`TopicTrends_${sessionId}_verificationMethod`, verificationMethod);
    }
    
    // Navigate to session
    navigate(`/session/${sessionId}`);
  };
  
  const handleVerification = () => {
    // This would be replaced with actual verification logic
    toast.success('Identity verified successfully!');
    setIsVerified(true);
  };
  
  if (isLoading) {
    return (
      <div className="join-session-container loading">
        <div className="loader"></div>
        <p>Loading session details...</p>
      </div>
    );
  }
  
  if (error) {
    return (
      <div className="join-session-container error">
        <h2>Error</h2>
        <p>{error}</p>
        <button
          className="btn btn-primary"
          onClick={() => navigate('/')}
        >
          Return to Home
        </button>
      </div>
    );
  }
  
  return (
    <div className="join-session-container">
      
      <div className="join-card">
        <h1>Join Discussion</h1>
        <div className="session-info">
          <h2>{session.title}</h2>
          <p>{session.prompt}</p>
        </div>
        
        <div className="join-options">
          {session.require_verification ? (
            <div className="verification-section">
              <h3>Verification Required</h3>
              <p>This discussion requires identity verification to participate.</p>
              
              {!isVerified ? (
                <div className="verification-methods">
                  <div className="method-selection">
                    <label>
                      <input
                        type="radio"
                        name="verification-method"
                        value="id"
                        checked={verificationMethod === 'id'}
                        onChange={() => setVerificationMethod('id')}
                      />
                      ID Verification
                    </label>
                    
                    <label>
                      <input
                        type="radio"
                        name="verification-method"
                        value="passport"
                        checked={verificationMethod === 'passport'}
                        onChange={() => setVerificationMethod('passport')}
                      />
                      Passport
                    </label>
                    
                    <label>
                      <input
                        type="radio"
                        name="verification-method"
                        value="ssn"
                        checked={verificationMethod === 'ssn'}
                        onChange={() => setVerificationMethod('ssn')}
                      />
                      SSN
                    </label>
                  </div>
                  
                  <div className="verification-placeholder">
                    <p>Verification interface would be implemented here</p>
                    <button 
                      className="btn btn-secondary"
                      onClick={handleVerification}
                    >
                      Verify Identity (Demo)
                    </button>
                  </div>
                </div>
              ) : (
                <div className="verification-success">
                  <div className="success-checkmark">✓</div>
                  <p>Identity verified successfully!</p>
                </div>
              )}
            </div>
          ) : (
            <div className="anonymous-section">
              <h3>Join Anonymously</h3>
              <p>You will participate as an anonymous user.</p>
            </div>
          )}
          
          <button
            className="btn btn-primary"
            onClick={handleJoin}
            disabled={session.require_verification && !isVerified}
          >
            Join Discussion
          </button>
        </div>
      </div>
    </div>
  );
}

export default JoinSession;
