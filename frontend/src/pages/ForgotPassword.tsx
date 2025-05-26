import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import authService from '../services/authService';
import '../styles/Auth.css';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

function ForgotPassword() {
    const [email, setEmail] = useState('');
    const [loading, setLoading] = useState(false);
    const [submitted, setSubmitted] = useState(false);
    const navigate = useNavigate();

    const handleSubmit = async (e) => {
        e.preventDefault();

        if (!email) {
            toast.error('Please enter your email address');
            return;
        }

        setLoading(true);

        try {
            await authService.forgotPassword(email);
            setSubmitted(true);
            toast.success('Password reset instructions sent to your email.');
        } catch (error) {
            console.error('Error requesting password reset:', error);
            toast.error(error?.detail || 'Failed to request password reset. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    if (submitted) {
        return (
            <div className="auth-container">
                <div className="auth-card">
                    <Link to="/" className="logo">
                        Topic<span>Trends</span>
                    </Link>

                    <h2>Check Your Email</h2>
                    <p className="verification-message">
                        We've sent password reset instructions to {email}.
                        Please check your inbox and follow the link to reset your password.
                    </p>

                    <div className="verification-options">
                        <p>Didn't receive the email?</p>
                        <Button
                            onClick={() => setSubmitted(false)}
                            className="btn btn-secondary"
                        >
                            Try Again
                        </Button>

                        <p className="auth-redirect">
                            Remember your password? <Link to="/login">Login</Link>
                        </p>
                    </div>
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

                <h2>Reset Your Password</h2>
                <p className="verification-message">
                    Enter your email address and we'll send you instructions to reset your password.
                </p>

                <form className="auth-form" onSubmit={handleSubmit}>
                    <div className="form-group">
                        <label htmlFor="email">Email</label>
                        <Input
                            type="email"
                            id="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            required
                            disabled={loading}
                            placeholder="Enter your email address"
                        />
                    </div>

                    <Button
                        type="submit"
                        className="btn btn-primary"
                        disabled={loading}
                    >
                        {loading ? 'Sending...' : 'Send Reset Instructions'}
                    </Button>
                </form>

                <p className="auth-redirect">
                    Remember your password? <Link to="/login">Login</Link>
                </p>
            </div>
        </div>
    );
}

export default ForgotPassword;