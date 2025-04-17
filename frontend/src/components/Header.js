import React from 'react';
import { useNavigate } from 'react-router-dom';
import '../styles/Header.css';

function Header() {
  const navigate = useNavigate();

  return (
    <div className="header">
      <div className="logo" onClick={() => navigate('/')}>Idea<span>Group</span></div>
      <div className="links">
        <a onClick={() => navigate('/sessions')}>
        Sessions
        </a>
      </div>  
    </div>
  );
}

export default Header;