import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import authService from '../services/authService';

// This is going to be used later when we add users to the clustering ideas and topics
function ProtectedRoute({ children }) {
  const location = useLocation();
  const isAuthenticated = authService.isLoggedIn();
  
  if (!isAuthenticated) {
    // Redirect to login page, but save the location they were trying to access
    return <Navigate to="/login" state={{ from: location }} replace />;
  }
  
  return children;
}

export default ProtectedRoute;