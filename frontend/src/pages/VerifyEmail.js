import React, { useState, useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { toast } from 'react-toastify';
import authService from '../services/authService';
import '../styles/Auth.css';

function VerifyEmail() {
  const [verificationCode, setVerificationCode] = useState('');
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [resendLoading, setResendLoading] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    // Extract email from query parameters
    const queryParams = new URLSearchParams(location.search);
    const emailParam = queryParams.get('email');
    const codeParam = queryParams.get('code');
    
    if (emailParam) {
      setEmail(emailParam);
    }
    
    // If code is provided in URL, auto-verify
    if (emailParam && codeParam) {
      setVerificationCode(codeParam);
      handleVerify(emailParam, codeParam);
    }
  }, [location]);

  const handleVerify = async (emailToVerify, codeToVerify) => {
    setLoading(true);
    
    try {
      await authService.verifyEmail(emailToVerify || email, codeToVerify || verificationCode);
      toast.success('Email verified successfully! You can now log in.');
      navigate('/login');
    } catch (error) {
      toast.error(error.detail || 'Verification failed. Please check your code and try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleResendVerification = async () => {
    if (!email) {
      toast.error('Please enter your email address');
      return;
    }
    
    setResendLoading(true);
    
    try {
      await authService.resendVerification(email);
      toast.success('Verification email sent! Please check your inbox.');
    } catch (error) {
      toast.error(error.detail || 'Failed to resend verification email. Please try again.');
    } finally {
      setResendLoading(false);
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    handleVerify();
  };

  return (
    <div className="auth-container">
      <div className="auth-card">
        <Link to="/" className="logo">
          Idea<span>Group</span>
        </Link>
        
        <h2>Verify Your Email</h2>
        <p className="verification-message">
          We've sent a verification code to your email address. 
          Please enter the code below to complete your registration.
        </p>
        
        <form className="auth-form" onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="email">Email</label>
            <input
              type="email"
              id="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              disabled={loading}
            />
          </div>
          
          <div className="form-group">
            <label htmlFor="verificationCode">Verification Code</label>
            <input
              type="text"
              id="verificationCode"
              value={verificationCode}
              onChange={(e) => setVerificationCode(e.target.value)}
              required
              placeholder="Enter 6-digit code"
              disabled={loading}
            />
          </div>
          
          <button type="submit" className="btn btn-primary" disabled={loading}>
            {loading ? 'Verifying...' : 'Verify Email'}
          </button>
        </form>
        
        <div className="verification-options">
          <p>Didn't receive the code?</p>
          <button 
            className="btn btn-secondary" 
            onClick={handleResendVerification} 
            disabled={resendLoading}
          >
            {resendLoading ? 'Sending...' : 'Resend Verification Email'}
          </button>
          
          <p className="auth-redirect">
            Already verified? <Link to="/login">Login</Link>
          </p>
        </div>
      </div>
    </div>
  );
}

export default VerifyEmail;