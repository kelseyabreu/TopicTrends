import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import '../styles/AllSessionsView.css';
import api from '../utils/api';

function AllSessionsView() {
  const navigate = useNavigate();
  const [sessions, setSessions] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchSessions = async () => {
      try {
        const response = await api.get('/api/sessions');
        setSessions(response.data);
      } catch (error) {
        console.error('Error fetching sessions:', error);
        setError('Failed to load sessions. Please try again later.');
      } finally {
        setIsLoading(false);
      }
    };

    fetchSessions();
  }, []);

  if (isLoading) {
    return (
      <div className="all-sessions-container loading">
        <div className="loader"></div>
        <p>Loading sessions...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="all-sessions-container error">
        <h2>Error</h2>
        <p>{error}</p>
      </div>
    );
  }

  return (
    <div className="all-sessions-container">

      <div className="sessions-list">
        <h1>All Sessions</h1>
        {sessions.length === 0 ? (
          <p>No sessions available.</p>
        ) : (
          <ul>
            {sessions.map((session) => (
              <li key={session.id} onClick={() => navigate(`/session/${session.id}`)}>
                <h2>{session.title}</h2>
                <p>{session.prompt}</p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

export default AllSessionsView;