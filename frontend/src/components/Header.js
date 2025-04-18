import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import authService from '../services/authService';
import '../styles/Header.css';

function Header() {
    const [user, setUser] = useState(null);
    const [menuOpen, setMenuOpen] = useState(false);
    const navigate = useNavigate();

    useEffect(() => {
        // Check if user is logged in
        const currentUser = authService.getUser();
        setUser(currentUser);
    }, []);

    const handleLogout = () => {
        authService.logout();
        setUser(null);
        navigate('/');
    };

    const toggleMenu = () => {
        setMenuOpen(!menuOpen);
    };

    return (
        <div className="header">
            <div className="logo" onClick={() => navigate('/')}>Idea<span>Group</span></div>

            <div className="mobile-menu-icon" onClick={toggleMenu}>
                <div className={menuOpen ? 'menu-icon open' : 'menu-icon'}>
                    <span></span>
                    <span></span>
                    <span></span>
                </div>
            </div>

            <div className={menuOpen ? 'links active' : 'links'}>
                <Link to="/" onClick={() => setMenuOpen(false)}>Home</Link>
                <Link to="/sessions" onClick={() => setMenuOpen(false)}>Sessions</Link>
                <Link to="/create" onClick={() => setMenuOpen(false)}>Create Session</Link>

                {user ? (
                    <>
                        <button className="logout-btn" onClick={handleLogout}>Logout</button>
                        <span className="user-greeting">Welcome, {user.username}</span>
                    </>
                ) : (
                    <>
                        <Link to="/login" onClick={() => setMenuOpen(false)}>Login</Link>
                        <Link to="/register" className="register-btn" onClick={() => setMenuOpen(false)}>Register</Link>
                    </>
                )}
            </div>
        </div>
    );
}

export default Header;