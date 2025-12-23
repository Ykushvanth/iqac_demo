import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import './index.css';

const Profile = () => {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);

  useEffect(() => {
    try {
      const stored = localStorage.getItem('user');
      if (stored) {
        setUser(JSON.parse(stored));
      }
    } catch (err) {
      console.error('Error parsing user from localStorage (profile):', err);
    }
  }, []);

  const handleLogout = () => {
    localStorage.removeItem('user');
    navigate('/login');
  };

  if (!user) {
    return (
      <div className="profile-page">
        <header className="profile-header">
          <h1>User Profile</h1>
          <div className="profile-actions">
            <button className="profile-btn" onClick={() => navigate('/')}>Home</button>
            <button className="profile-btn danger" onClick={handleLogout}>Logout</button>
          </div>
        </header>
        <div className="profile-card">
          <p>No user info available. Please log in again.</p>
          <button className="profile-btn" onClick={() => navigate('/login')}>Go to Login</button>
        </div>
      </div>
    );
  }

  return (
    <div className="profile-page">
      <header className="profile-header">
        <h1>User Profile</h1>
        <div className="profile-actions">
          <button className="profile-btn" onClick={() => navigate('/')}>Home</button>
          <button className="profile-btn danger" onClick={handleLogout}>Logout</button>
        </div>
      </header>

      <div className="profile-card">
        <div className="profile-row">
          <span className="label">Name</span>
          <span className="value">{user.name || user.username || '—'}</span>
        </div>
        <div className="profile-row">
          <span className="label">Email</span>
          <span className="value">{user.email || user.user_email || '—'}</span>
        </div>
        <div className="profile-row">
          <span className="label">Role</span>
          <span className="value">{user.role || '—'}</span>
        </div>
        <div className="profile-row">
          <span className="label">School</span>
          <span className="value">{user.school || '—'}</span>
        </div>
        <div className="profile-row">
          <span className="label">Department</span>
          <span className="value">{user.department || '—'}</span>
        </div>
        <div className="profile-row">
          <span className="label">Staff ID</span>
          <span className="value">{user.staffId || user.staff_id || '—'}</span>
        </div>
        <div className="profile-row">
          <span className="label">User ID</span>
          <span className="value">{user.id || user.user_id || '—'}</span>
        </div>
      </div>
    </div>
  );
};

export default Profile;

