import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { AuthStatus } from '../enums/AuthStatus';

function ProtectedRoute({ children }) {
    const { authStatus } = useAuth();
    const location = useLocation();

    if (authStatus === AuthStatus.Loading) {
        return <div>Loading...</div>;
    }

    if (authStatus !== AuthStatus.Authenticated) {
        // Redirect to login page, but save the location they were trying to access
        console.log('ProtectedRoute: Not authenticated, redirecting to login.');
        return <Navigate to="/login" state={{ from: location }} replace />;
    }

    return children;
}

export default ProtectedRoute;