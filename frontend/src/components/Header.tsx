import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Button } from '@/components/ui/button';
import '../styles/Header.css';

function Header() {
    const { user, logout } = useAuth();
    const [menuOpen, setMenuOpen] = useState(false);
    const navigate = useNavigate();

    const handleLogout = async () => {
        await logout();
        navigate('/');
    };

    const toggleMenu = () => setMenuOpen(prev => !prev);
    const handleLinkClick = () => setMenuOpen(false);

    return (
        <div className="header">
            <div className="logo" onClick={() => navigate('/')}>Topic<span>Trends</span></div>

            <div className="mobile-menu-icon" onClick={toggleMenu}>
                <div className={menuOpen ? 'menu-icon open' : 'menu-icon'}>
                    <span></span>
                    <span></span>
                    <span></span>
                </div>
            </div>

            <div className={menuOpen ? 'links active' : 'links'}>
                <Link to="/" onClick={handleLinkClick}>Home</Link>
                <Link to="/discussions" onClick={handleLinkClick}>Discussions</Link>
                <Link to="/create" onClick={handleLinkClick}>Create Discussion</Link>

                {user ? (
                    <>
                        <Link to="/settings" onClick={handleLinkClick}>Settings</Link>
                        <Button variant="noShadow" className="logout-btn" onClick={handleLogout}>Logout</Button>
                        <span className="user-greeting">Welcome, {user.username}</span>
                    </>
                ) : (
                    <>
                        <Link to="/login" onClick={handleLinkClick}>Login</Link>
                        <Button className="register-btn" onClick={() => { handleLinkClick(); navigate('/register'); }}>
                            Register
                        </Button>
                    </>
                )}
            </div>
        </div>
    );
}

export default Header;