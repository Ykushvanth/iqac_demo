import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import './index.css';
const SERVER_URL = process.env.REACT_APP_SERVER_URL || "https://iqac-demo.onrender.com";
const Login = () => {
  const navigate = useNavigate();
  const [step, setStep] = useState(1); // 1: email entry, 2: OTP verification
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [resendDisabled, setResendDisabled] = useState(false);
  const [resendTimer, setResendTimer] = useState(0);

  // Check if user is already logged in
  useEffect(() => {
    const user = localStorage.getItem('user');
    if (user) {
      navigate('/');
    }
  }, [navigate]);

  // Resend timer countdown
  useEffect(() => {
    if (resendTimer > 0) {
      const timer = setTimeout(() => setResendTimer(resendTimer - 1), 1000);
      return () => clearTimeout(timer);
    } else {
      setResendDisabled(false);
    }
  }, [resendTimer]);

  const handleEmailChange = (e) => {
    setEmail(e.target.value.trim().toLowerCase());
    setError('');
  };

  const handleSendOTP = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    // Validation
    if (!email.trim()) {
      setError('Please enter your email address');
      return;
    }

    // Email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      setError('Please enter a valid email address');
      return;
    }

    setLoading(true);

    try {
      const response = await fetch(`${SERVER_URL}/api/auth/send-otp`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email }),
      });

      const data = await response.json();

      if (data.success) {
        setSuccess(data.message);
        setStep(2);
        setResendDisabled(true);
        setResendTimer(30); // 30 seconds cooldown
      } else {
        setError(data.message || 'Failed to send OTP');
      }
    } catch (err) {
      console.error('Error sending OTP:', err);
      setError('Network error. Please check your connection and try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOTP = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (!otp.trim() || otp.length !== 6) {
      setError('Please enter a valid 6-digit OTP');
      return;
    }

    setLoading(true);

    try {
      const response = await fetch(`${SERVER_URL}/api/auth/verify-otp`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: email,
          otp: otp,
        }),
      });

      const data = await response.json();

      if (data.success) {
        // Log user data for debugging (especially school field for Deans)
        console.log('Login successful - User data received:', {
          id: data.user.id,
          name: data.user.name,
          email: data.user.email,
          role: data.user.role,
          school: data.user.school,
          department: data.user.department
        });
        
        // Store user data in localStorage
        localStorage.setItem('user', JSON.stringify(data.user));
        
        // Verify what was stored
        const stored = JSON.parse(localStorage.getItem('user'));
        console.log('User data stored in localStorage:', {
          id: stored.id,
          name: stored.name,
          role: stored.role,
          school: stored.school,
          department: stored.department
        });
        
        setSuccess('Login successful! Redirecting...');
        
        // Redirect to home page after a short delay
        setTimeout(() => {
          navigate('/');
        }, 1500);
      } else {
        setError(data.message || 'Invalid OTP. Please try again.');
      }
    } catch (err) {
      console.error('Error verifying OTP:', err);
      setError('Network error. Please check your connection and try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleResendOTP = async () => {
    setError('');
    setSuccess('');
    setLoading(true);

    try {
      const response = await fetch(`${SERVER_URL}/api/auth/send-otp`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email }),
      });

      const data = await response.json();

      if (data.success) {
        setSuccess('OTP resent successfully! Please check your email.');
        setOtp(''); // Clear previous OTP
        setResendDisabled(true);
        setResendTimer(30); // 30 seconds cooldown
      } else {
        setError(data.message || 'Failed to resend OTP');
      }
    } catch (err) {
      console.error('Error resending OTP:', err);
      setError('Network error. Please check your connection and try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleBack = () => {
    setStep(1);
    setOtp('');
    setError('');
    setSuccess('');
    setResendDisabled(false);
    setResendTimer(0);
  };

  return (
    <div className="login-container">
      {/* Logo outside container */}
      <div className="login-logo-wrapper">
        <img
          src="https://www.kalasalingam.ac.in/wp-content/uploads/2022/02/Logo.png"
          alt="Kalasalingam Academy Logo"
          className="login-logo-external"
        />
      </div>

      <div className="login-card">
        <div className="login-header">
          <h1>Faculty Feedback System</h1>
          <p className="login-subtitle">
            {step === 1 ? 'Sign in to continue' : 'Verify your identity'}
          </p>
        </div>

        {error && (
          <div className="alert alert-error">
            <span className="alert-icon">⚠️</span>
            <span>{error}</span>
          </div>
        )}

        {success && (
          <div className="alert alert-success">
            <span className="alert-icon">✓</span>
            <span>{success}</span>
          </div>
        )}

        {step === 1 ? (
          <form onSubmit={handleSendOTP} className="login-form">
            <div className="form-group">
              <label htmlFor="email">Email Address</label>
              <input
                type="email"
                id="email"
                name="email"
                value={email}
                onChange={handleEmailChange}
                placeholder="Enter your email address"
                disabled={loading}
                required
                autoFocus
                autoComplete="email"
              />
              <small className="form-hint">
                Enter your registered email to receive an OTP
              </small>
            </div>

            <button
              type="submit"
              className="btn-primary"
              disabled={loading}
            >
              {loading ? (
                <>
                  <span className="spinner"></span>
                  Sending OTP...
                </>
              ) : (
                <>
                  <span>📧</span>
                  Send OTP
                </>
              )}
            </button>

            
          </form>
        ) : (
          <form onSubmit={handleVerifyOTP} className="login-form">
            <div className="otp-info">
              <p>
                📬 We've sent a 6-digit OTP to <strong>{email}</strong>
              </p>
              <p className="otp-hint">Please check your inbox and spam folder</p>
            </div>

            <div className="form-group">
              <label htmlFor="otp">Enter OTP</label>
              <input
                type="text"
                id="otp"
                name="otp"
                value={otp}
                onChange={(e) => {
                  const value = e.target.value.replace(/\D/g, '').slice(0, 6);
                  setOtp(value);
                  setError('');
                }}
                placeholder="000000"
                maxLength="6"
                disabled={loading}
                required
                autoFocus
                className="otp-input"
                inputMode="numeric"
                pattern="[0-9]*"
              />
              <small className="form-hint">
                ⏱️ OTP is valid for 10 minutes
              </small>
            </div>

            <button
              type="submit"
              className="btn-primary"
              disabled={loading || otp.length !== 6}
            >
              {loading ? (
                <>
                  <span className="spinner"></span>
                  Verifying...
                </>
              ) : (
                <>
                  <span>🔐</span>
                  Verify & Login
                </>
              )}
            </button>

            <div className="form-actions">
              <button
                type="button"
                onClick={handleResendOTP}
                className="btn-link"
                disabled={loading || resendDisabled}
              >
                {resendDisabled ? `Resend OTP (${resendTimer}s)` : '🔄 Resend OTP'}
              </button>
              <button
                type="button"
                onClick={handleBack}
                className="btn-link"
                disabled={loading}
              >
                ← Back
              </button>
            </div>
          </form>
        )}

        <div className="login-footer">
          <p>© 2024 Kalasalingam Academy of Research and Education</p>
          <p className="security-note">🔒 Secure OTP Authentication</p>
        </div>
      </div>
    </div>
  );
};

export default Login;