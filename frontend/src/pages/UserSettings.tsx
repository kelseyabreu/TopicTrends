import React, { useState, useEffect } from 'react';
import { toast } from 'react-toastify';
import { useNavigate } from 'react-router-dom';
import authService from '../services/authService';
import { useAuth } from '../context/AuthContext';
import api from '../utils/api';
import '../styles/Auth.css';
import { User } from '../interfaces/user';
import { AuthStatus } from '../enums/AuthStatus';

// List of common timezones
const timezones = [
    'UTC',
    'America/New_York',
    'America/Chicago',
    'America/Denver',
    'America/Los_Angeles',
    'Europe/London',
    'Europe/Paris',
    'Europe/Berlin',
    'Asia/Tokyo',
    'Asia/Shanghai',
    'Australia/Sydney',
    'Pacific/Auckland'
];

function UserSettings() {
    const { user: contextUser, authStatus, checkAuthStatus, logout } = useAuth();
    const navigate = useNavigate();
    const [formData, setFormData] = useState({
        first_name: '',
        last_name: '',
        location: '',
        timezone: 'UTC'
    });
    const [isUpdating, setIsUpdating] = useState(false);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);
    const [deleteConfirmText, setDeleteConfirmText] = useState('');

    useEffect(() => {
        if (contextUser) {
            setFormData({
                first_name: contextUser.first_name || '',
                last_name: contextUser.last_name || '',
                location: contextUser.location || '',
                timezone: contextUser.timezone || 'UTC'
            });
        }
    }, [contextUser]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value } = e.target;
        setFormData(formData => ({
            ...formData,
            [name]: value
        }));
    };

    const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        if (!contextUser) return;

        setIsUpdating(true);
        try {
            // Only send fields that have changed
            const changedFields: Partial<User> = {};

            if (formData.first_name !== (contextUser.first_name || '')) {
                changedFields.first_name = formData.first_name || null;
            }

            if (formData.last_name !== (contextUser.last_name || '')) {
                changedFields.last_name = formData.last_name || null;
            }

            if (formData.location !== (contextUser.location || '')) {
                changedFields.location = formData.location || null;
            }

            if (formData.timezone !== (contextUser.timezone || 'UTC')) {
                changedFields.timezone = formData.timezone;
            }

            // Only update if there are changes
            if (Object.keys(changedFields).length > 0) {
                await authService.updateProfile(changedFields);
                toast.success('Profile updated successfully!');
                await checkAuthStatus();
            } else {
                toast.info('No changes to save.');
            }
        } catch (error: any) {
            toast.error(error?.detail || 'Failed to update profile. Please try again.');
        } finally {
            setIsUpdating(false);
        }
    };

    const handleDeleteAccount = async () => {
        if (!contextUser) return;

        console.log('Starting account deletion process...');
        setIsDeleting(true);
        try {
            console.log('Making DELETE request to /users/me...');
            // Use the API client which handles CSRF tokens automatically
            await api.delete('/users/me');

            console.log('Account deletion successful');
            // Account deleted successfully
            toast.success('Account deleted successfully. You will be redirected to the home page.');

            // Clear auth state and redirect
            await logout();
            navigate('/');

        } catch (error: any) {
            console.error('Delete account error:', error);
            toast.error(error?.detail || error?.message || 'Failed to delete account. Please try again.');
        } finally {
            setIsDeleting(false);
            setShowDeleteConfirm(false);
            setDeleteConfirmText('');
        }
    };

    if (authStatus === AuthStatus.Loading) {
        return (
            <div className="auth-container">
                <div className="auth-card">
                    <h2>Loading user data...</h2>
                </div>
            </div>
        );
    }

    if (!contextUser) {
        return (
            <div className="auth-container">
                <div className="auth-card">
                    <h2>User not found. Please log in.</h2>
                </div>
            </div>
        );
    }

    return (
        <div className="auth-container">
            <div className="auth-card" style={{ maxWidth: '600px' }}>
                <h2>User Settings</h2>

                <div className="user-info">
                    <p><strong>Username:</strong> {contextUser.username}</p>
                    <p><strong>Email:</strong> {contextUser.email}</p>
                    <p>
                        <strong>Member since:</strong>
                        <span title={new Date(contextUser.created_at).toLocaleString()} style={{ cursor: 'help' }} className="p-1 underline">
                            {new Date(contextUser.created_at).toLocaleDateString()}
                        </span>
                    </p>
                    {contextUser.modified_at && contextUser.modified_at !== contextUser.created_at && (
                        <p>
                            <strong>Last updated:</strong> 
                            <span title={new Date(contextUser.modified_at).toLocaleString()} style={{ cursor: 'help' }} className="p-1 underline">
                                {new Date(contextUser.modified_at).toLocaleDateString()}
                            </span>
                        </p>
                    )}
                </div>

                <form className="auth-form" onSubmit={handleSubmit}>
                    <div className="form-group">
                        <label htmlFor="first_name">First Name</label>
                        <input
                            type="text"
                            id="first_name"
                            name="first_name"
                            value={formData.first_name}
                            onChange={handleChange}
                            placeholder="Enter first name"
                            disabled={isUpdating} />
                    </div>

                    <div className="form-group">
                        <label htmlFor="last_name">Last Name</label>
                        <input
                            type="text"
                            id="last_name"
                            name="last_name"
                            value={formData.last_name}
                            onChange={handleChange}
                            placeholder="Enter last name"
                            disabled={isUpdating} />
                    </div>
                    <div className="form-group">
                        <label htmlFor="location">Location</label>
                        <input
                            type="text"
                            id="location"
                            name="location"
                            value={formData.location}
                            onChange={handleChange}
                            placeholder="City, Country"
                            disabled={isUpdating} />
                    </div>
                    <div className="form-group">
                        <label htmlFor="timezone">Timezone</label>
                        <select
                            id="timezone"
                            name="timezone"
                            value={formData.timezone}
                            onChange={handleChange}
                            disabled={isUpdating}>
                            {timezones.map(tz =>
                                <option key={tz} value={tz}>{tz}</option>

                            )}
                        </select>
                    </div>

                    <button
                        type="submit"
                        className="btn btn-primary"
                        disabled={isUpdating}
                    >
                        {isUpdating ? 'Updating...' : 'Save Changes'}
                    </button>
                </form>

                {/* Danger Zone */}
                <div style={{ marginTop: '2rem', padding: '1.5rem', border: '2px solid #e74c3c', borderRadius: '8px', backgroundColor: '#fdf2f2' }}>
                    <h3 style={{ color: '#e74c3c', marginBottom: '1rem' }}>Danger Zone</h3>
                    <p style={{ marginBottom: '1rem', color: '#666' }}>
                        Once you delete your account, there is no going back. This action will:
                    </p>
                    <ul style={{ marginBottom: '1rem', color: '#666', paddingLeft: '1.5rem' }}>
                        <li>Delete all your discussions and their associated ideas</li>
                        <li>Anonymize your ideas in other discussions</li>
                        <li>Remove all your interaction history</li>
                        <li>Permanently delete your account</li>
                    </ul>
                    <button
                        type="button"
                        onClick={() => setShowDeleteConfirm(true)}
                        className="btn"
                        style={{ backgroundColor: '#e74c3c', color: 'white', border: 'none' }}
                        disabled={isDeleting}
                    >
                        Delete Account
                    </button>
                </div>

                {/* Delete Confirmation Modal */}
                {showDeleteConfirm && (
                    <div style={{
                        position: 'fixed',
                        top: 0,
                        left: 0,
                        right: 0,
                        bottom: 0,
                        backgroundColor: 'rgba(0, 0, 0, 0.5)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        zIndex: 1000
                    }}>
                        <div style={{
                            backgroundColor: 'white',
                            padding: '2rem',
                            borderRadius: '8px',
                            maxWidth: '500px',
                            width: '90%',
                            maxHeight: '80vh',
                            overflow: 'auto'
                        }}>
                            <h3 style={{ color: '#e74c3c', marginBottom: '1rem' }}>
                                Confirm Account Deletion
                            </h3>
                            <p style={{ marginBottom: '1rem' }}>
                                Are you absolutely sure you want to delete your account? This action cannot be undone.
                            </p>
                            <p style={{ marginBottom: '1.5rem', fontWeight: 'bold' }}>
                                Type "DELETE" to confirm:
                            </p>
                            <input
                                type="text"
                                placeholder="Type DELETE to confirm"
                                value={deleteConfirmText}
                                style={{
                                    width: '100%',
                                    padding: '0.5rem',
                                    marginBottom: '1rem',
                                    border: '1px solid #ddd',
                                    borderRadius: '4px'
                                }}
                                onChange={(e) => setDeleteConfirmText(e.target.value)}
                            />
                            <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end' }}>
                                <button
                                    type="button"
                                    onClick={() => {
                                        setShowDeleteConfirm(false);
                                        setDeleteConfirmText('');
                                    }}
                                    className="btn"
                                    style={{ backgroundColor: '#95a5a6', color: 'white' }}
                                    disabled={isDeleting}
                                >
                                    Cancel
                                </button>
                                <button
                                    type="button"
                                    onClick={handleDeleteAccount}
                                    className="btn"
                                    style={{ backgroundColor: '#e74c3c', color: 'white' }}
                                    disabled={deleteConfirmText !== 'DELETE' || isDeleting}
                                >
                                    {isDeleting ? 'Deleting...' : 'Delete Account'}
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

export default UserSettings;