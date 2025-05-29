import React, { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { toast } from 'react-toastify';
import { useAuth } from '../context/AuthContext';
import { AuthStatus } from '../enums/AuthStatus';
import { Button } from '@/components/ui/button';

import '../styles/Auth.css';

function Login() {
    const [formData, setFormData] = useState({
        email: '',
        password: ''
    });
    const navigate = useNavigate();
    const location = useLocation();
    const { login, authStatus } = useAuth();

    // Get redirect path if any
    const from = location.state?.from?.pathname || '/dashboard';

    const handleChange = (e) => {
        const { name, value } = e.target;
        setFormData({
            ...formData,
            [name]: value,
        });
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        try {
            await login(formData.email, formData.password);
            toast.success('Login successful!');
            navigate(from, { replace: true });
        } catch (error) {
            const errorMessage = error?.detail || error?.message || 'Login failed. Please check your credentials.';

            // Check if user is not verified
            if (typeof errorMessage === 'string' && errorMessage.includes('not verified')) {
                toast.error('Your email is not verified. Please verify your email to login.');
                navigate(`/verify?email=${encodeURIComponent(formData.email)}`);
            } else {
                toast.error(String(errorMessage));
            }
        }
    };

    const isLoading = authStatus === AuthStatus.Loading;

    return (
        <div className="auth-container">
            <div className="auth-card">
                <Link to="/" className="logo">
                    Topic<span>Trends</span>
                </Link>

                <h2>Login to Your Account</h2>

                <form className="auth-form" onSubmit={handleSubmit}>
                    <div className="form-group">
                        <label htmlFor="email">Email</label>
                        <input
                            type="email"
                            id="email"
                            name="email"
                            value={formData.email}
                            onChange={handleChange}
                            required
                            disabled={isLoading}
                        />
                    </div>

                    <div className="form-group">
                        <label htmlFor="password">Password</label>
                        <input
                            type="password"
                            id="password"
                            name="password"
                            value={formData.password}
                            onChange={handleChange}
                            required
                            disabled={isLoading}
                        />
                    </div>

                    <div className="form-options">
                        <Link to="/forgot-password" className="forgot-password">
                            Forgot Password?
                        </Link>
                    </div>
                    <Button type="submit" disabled={isLoading}>{isLoading ? 'Logging in...' : 'Login'}</Button>
                </form>

                <p className="auth-redirect">
                    Don't have an account? <Link to="/register">Register</Link>
                </p>
            </div>
        </div>
    );
}

export default Login;