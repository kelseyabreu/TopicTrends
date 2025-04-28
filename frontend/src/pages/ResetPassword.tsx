import React, { useState, useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { toast } from 'react-toastify';
import authService from '../services/authService';
import '../styles/Auth.css';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

function ResetPassword() {
    const [formData, setFormData] = useState({
        password: '',
        confirmPassword: '',
    });
    const [email, setEmail] = useState('');
    const [token, setToken] = useState('');
    const [loading, setLoading] = useState(false);
    const [tokenValid, setTokenValid] = useState(null);
    const navigate = useNavigate();
    const location = useLocation();

    useEffect(() => {
        // Extract email and token from query parameters
        const queryParams = new URLSearchParams(location.search);
        const emailParam = queryParams.get('email');
        const tokenParam = queryParams.get('token');

        if (emailParam) {
            setEmail(emailParam);
        }

        if (tokenParam) {
            setToken(tokenParam);
            // Here you could verify if the token is valid
            // For now we'll assume it is if both email and token are present
            if (emailParam && tokenParam) {
                setTokenValid(true);
            }
        } else {
            setTokenValid(false);
        }
    }, [location]);

    const handleChange = (e) => {
        const { name, value } = e.target;
        setFormData({
            ...formData,
            [name]: value,
        });
    };

    const handleSubmit = async (e) => {
        e.preventDefault();

        // Validate form
        if (formData.password !== formData.confirmPassword) {
            toast.error('Passwords do not match');
            return;
        }

        if (formData.password.length < 8) {
            toast.error('Password must be at least 8 characters long');
            return;
        }

        setLoading(true);

        try {
            await authService.resetPassword(email, token, formData.password);
            toast.success('Password reset successful! You can now login with your new password.');
            navigate('/login');
        } catch (error) {
            console.error('Error resetting password:', error);
            toast.error(error?.detail || 'Failed to reset password. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    // Show error if token is invalid or missing
    if (tokenValid === false) {
        return (
            <div className="auth-container">
                <div className="auth-card">
                    <Link to="/" className="logo">
                        Topic<span>Trends</span>
                    </Link>

                    <h2>Invalid Reset Link</h2>
                    <p className="verification-message">
                        The password reset link is invalid or has expired.
                        Please request a new password reset link.
                    </p>

                    <Button
                        onClick={() => navigate('/forgot-password')}
                        className="btn btn-primary"
                    >
                        Request New Reset Link
                    </Button>

                    <p className="auth-redirect">
                        Remember your password? <Link to="/login">Login</Link>
                    </p>
                </div>
            </div>
        );
    }

    return (
        <div className="auth-container">
            <div className="auth-card">
                <Link to="/" className="logo">
                    Topic<span>Trends</span>
                </Link>

                <h2>Set New Password</h2>
                <p className="verification-message">
                    Please create a new password for your account.
                </p>

                <form className="auth-form" onSubmit={handleSubmit}>
                    <div className="form-group">
                        <label htmlFor="password">New Password</label>
                        <Input
                            type="password"
                            id="password"
                            name="password"
                            value={formData.password}
                            onChange={handleChange}
                            required
                            disabled={loading}
                            minLength={8}
                        />
                        <small>Password must be at least 8 characters long</small>
                    </div>

                    <div className="form-group">
                        <label htmlFor="confirmPassword">Confirm New Password</label>
                        <Input
                            type="password"
                            id="confirmPassword"
                            name="confirmPassword"
                            value={formData.confirmPassword}
                            onChange={handleChange}
                            required
                            disabled={loading}
                        />
                    </div>

                    <Button
                        type="submit"
                        className="btn btn-primary"
                        disabled={loading}
                    >
                        {loading ? 'Resetting Password...' : 'Reset Password'}
                    </Button>
                </form>

                <p className="auth-redirect">
                    Remember your password? <Link to="/login">Login</Link>
                </p>
            </div>
        </div>
    );
}

export default ResetPassword;