// File: src/pages/Home.js
import React from 'react';
import { Link } from 'react-router-dom';
import '../styles/Home.css';

function Home() {
  return (
    <div className="home-container">
      <div className="hero-section">
        <div className="logo">Topic<span>Trends</span></div>
        <h1>Collect and organize ideas from everyone</h1>
        <p>An intelligent platform that automatically groups similar ideas to help you identify common themes and priorities.</p>
        
        <div className="action-buttons">
          <Link to="/create" className="btn btn-primary">Create Discussion</Link>
          <button className="btn btn-secondary">Learn More</button>
        </div>
      </div>
      
      <div className="features-section">
        <div className="feature">
          <div className="feature-icon">🧠</div>
          <h3>AI-Powered Grouping</h3>
          <p>Our intelligent algorithm automatically categorizes similar ideas, saving time and providing clear insights.</p>
        </div>
        
        <div className="feature">
          <div className="feature-icon">👥</div>
          <h3>Inclusive Participation</h3>
          <p>Everyone can contribute anonymously or as verified users, encouraging honest and open feedback.</p>
        </div>
        
        <div className="feature">
          <div className="feature-icon">⚡</div>
          <h3>Real-Time Results</h3>
          <p>See ideas and groupings update instantly as participants contribute to the discussion.</p>
        </div>
      </div>
      
      <div className="use-cases-section">
        <h2>Perfect for...</h2>
        <div className="use-cases">
          <div className="use-case">
            <h3>Town Halls</h3>
            <p>Collect citizen feedback and identify community priorities</p>
          </div>
          <div className="use-case">
            <h3>Corporate Meetings</h3>
            <p>Brainstorm efficiently with teams of any size</p>
          </div>
          <div className="use-case">
            <h3>Education</h3>
            <p>Gather student input and enhance classroom engagement</p>
          </div>
          <div className="use-case">
            <h3>Event Planning</h3>
            <p>Collect and organize attendee preferences</p>
          </div>
        </div>
      </div>
      
      <footer>
        <div className="logo">Topic<span>Trends</span></div>
        <p>© 2025 TopicTrends. All rights reserved.</p>
      </footer>
    </div>
  );
}

export default Home;