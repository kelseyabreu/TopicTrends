import React, { useState, useEffect } from 'react';
import { toast } from 'react-toastify';
import authService from '../services/authService';
import '../styles/Auth.css';

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
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);
    const [updating, setUpdating] = useState(false);
    const [formData, setFormData] = useState({
        first_name: '',
        last_name: '',
        location: '',
        timezone: 'UTC'
    });

    useEffect(() => {
        // Fetch user data when component mounts
        const fetchUserData = async () => {
            try {
                const userData = await authService.getCurrentUser();
                setUser(userData);

                // Initialize form with existing data
                setFormData({
                    first_name: userData.first_name || '',
                    last_name: userData.last_name || '',
                    location: userData.location || '',
                    timezone: userData.timezone || 'UTC'
                });

                setLoading(false);
            } catch (error) {
                toast.error('Failed to load user data. Please try again later.');
                setLoading(false);
            }
        };

        fetchUserData();
    }, []);

    const handleChange = (e) => {
        const { name, value } = e.target;
        setFormData({
            ...formData,
            [name]: value
        });
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setUpdating(true);

        try {
            // Only send fields that have changed
            const changedFields:any = {};

            if (formData.first_name !== (user.first_name || '')) {
                changedFields.first_name = formData.first_name || null;
            }

            if (formData.last_name !== (user.last_name || '')) {
                changedFields.last_name = formData.last_name || null;
            }

            if (formData.location !== (user.location || '')) {
                changedFields.location = formData.location || null;
            }

            if (formData.timezone !== (user.timezone || 'UTC')) {
                changedFields.timezone = formData.timezone;
            }

            // Only update if there are changes
            if (Object.keys(changedFields).length > 0) {
                const updatedUser = await authService.updateProfile(changedFields);
                setUser(updatedUser);
                toast.success('Profile updated successfully!');
            } else {
                toast.info('No changes to save.');
            }
        } catch (error) {
            toast.error(error.detail || 'Failed to update profile. Please try again.');
        } finally {
            setUpdating(false);
        }
    };

    if (loading) {
        return (
            <div className="auth-container">
                <div className="auth-card">
                    <h2>Loading user data...</h2>
                </div>
            </div>
        );
    }

    return (
        <div className="auth-container">
            <div className="auth-card" style={{ maxWidth: '600px' }}>
                <h2>User Settings</h2>

                <div className="user-info">
                    <p><strong>Username:</strong> {user.username}</p>
                    <p><strong>Email:</strong> {user.email}</p>
                    <p><strong>Member since:</strong> {new Date(user.created_at).toLocaleDateString()}</p>
                    {user.modified_at && user.modified_at !== user.created_at && (
                        <p><strong>Last updated:</strong> {new Date(user.modified_at).toLocaleDateString()}</p>
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
                            placeholder="Enter your first name"
                        />
                    </div>

                    <div className="form-group">
                        <label htmlFor="last_name">Last Name</label>
                        <input
                            type="text"
                            id="last_name"
                            name="last_name"
                            value={formData.last_name}
                            onChange={handleChange}
                            placeholder="Enter your last name"
                        />
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
                        />
                    </div>

                    <div className="form-group">
                        <label htmlFor="timezone">Timezone</label>
                        <select
                            id="timezone"
                            name="timezone"
                            value={formData.timezone}
                            onChange={handleChange}
                        >
                            {timezones.map(tz => (
                                <option key={tz} value={tz}>{tz}</option>
                            ))}
                        </select>
                    </div>

                    <button
                        type="submit"
                        className="btn btn-primary"
                        disabled={updating}
                    >
                        {updating ? 'Updating...' : 'Save Changes'}
                    </button>
                </form>
            </div>
        </div>
    );
}

export default UserSettings;