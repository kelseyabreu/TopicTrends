import React, { useState, useEffect } from 'react';
import { toast } from 'react-toastify';
import authService from '../services/authService';
import { useAuth } from '../context/AuthContext';
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
    const { user: contextUser, authStatus, checkAuthStatus } = useAuth();
    const [formData, setFormData] = useState({
        first_name: '',
        last_name: '',
        location: '',
        timezone: 'UTC'
    });
    const [isUpdating, setIsUpdating] = useState(false);

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

    const handleChange = (e) => {
        const { name, value } = e.target;
        setFormData(formData => ({
            ...formData,
            [name]: value
        }));
    };

    const handleSubmit = async (e) => {
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
        } catch (error) {
            toast.error(error?.detail || 'Failed to update profile. Please try again.');
        } finally {
            setIsUpdating(false);
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
                    <p><strong>Member since:</strong> {contextUser.created_at ? new Date(contextUser.created_at).toLocaleDateString() : 'N/A'}</p>
                    {contextUser.modified_at && contextUser.modified_at !== contextUser.created_at && (
                        <p><strong>Last updated:</strong> {new Date(contextUser.modified_at).toLocaleDateString()}</p>
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
            </div>
        </div>
    );
}

export default UserSettings;