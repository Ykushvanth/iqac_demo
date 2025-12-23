


import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import './index.css';

const SERVER_URL = process.env.REACT_APP_SERVER_URL || "https://iqac-repo3.onrender.com";

const Home = () => {
  const navigate = useNavigate();
  const [showAnalysisOptions, setShowAnalysisOptions] = useState(false);
  const [showVisualizationOptions, setShowVisualizationOptions] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);

  const handleLogout = () => {
    localStorage.removeItem('user');
    navigate('/login');
  };

  useEffect(() => {
    try {
      const stored = localStorage.getItem('user');
      if (stored) {
        const parsed = JSON.parse(stored);
        setCurrentUser(parsed || null);
      }
    } catch (e) {
      console.error('Error parsing user from localStorage (home):', e);
    }
  }, []);

  const handleFileUpload = async (e, endpoint, successMessage) => {
    if (e.target.files?.[0]) {
      const formData = new FormData();
      formData.append('file', e.target.files[0]);
      
      try {
        const response = await fetch(`${SERVER_URL}${endpoint}`, {
          method: 'POST',
          body: formData
        });
        
        const data = await response.json();
        
        if (data.success) {
          let message = successMessage.replace('{count}', data.inserted || data.count);
          
          if (data.total) {
            message += `\n\nTotal processed: ${data.total}`;
            message += `\nSuccessfully inserted: ${data.inserted}`;
            if (data.skipped > 0) {
              message += `\nSkipped: ${data.skipped}`;
            }
          }
          
          if (data.errors && data.errors.length > 0) {
            message += '\n\n⚠️ Error Details (first 10):';
            data.errors.forEach(err => {
              message += `\n- ${err.course_code || `Row ${err.row}`}: ${err.error}`;
            });
            if (data.hasMoreErrors) {
              message += `\n\n... and ${data.totalErrors - 10} more errors`;
            }
          }
          
          alert(message);
        } else {
          throw new Error(data.message || data.error);
        }
      } catch (error) {
        alert('Upload failed: ' + error.message);
      } finally {
        e.target.value = ''; // Reset file input
      }
    }
  };

  return (
    <div className="home-container">
      <header className="header">
        <div className="logo-container">
          <img 
            src="https://www.kalasalingam.ac.in/wp-content/uploads/2022/02/Logo.png" 
            alt="Kalasalingam Logo" 
            className="logo" 
          />
          <div className="header-text">
            <h1>Office of IQAC, KARE</h1>
            <p>Internal Quality Assurance Compliance</p>
          </div>
        </div>
        <div className="header-actions">
          <button className="profile-link" onClick={() => navigate('/profile')}>
            <span>👤</span> Profile
          </button>
          <button className="logout-btn" onClick={handleLogout}>
            <span>🚪</span> Logout
          </button>
        </div>
      </header>

      <main className="main-content">
        <h1 className="portal-title">Student Feedback Analysis Portal</h1>
        <h2 className="institution">Kalasalingam Academy of Research and Education</h2>
        <p className="portal-description">
          Comprehensive platform for analyzing student feedback across departments, courses, 
          and faculty members with detailed insights and reporting.
        </p>

        <div className="action-buttons">
          {currentUser?.role === 'Admin' && (
          <button 
            className="upload-button-container"
            onClick={() => navigate('/upload')}
          >
            <span className="button-text">Upload Feedback 📋</span>
          </button>
          )}

          {/* Start Analysis button - Only visible to Admin users */}
          {currentUser?.role === 'Admin' && (
          <button 
            className="start-analysis-btn"
            onClick={() => setShowAnalysisOptions(true)}
          >
            Start Analysis <span className="icon">📊</span>
          </button>
          )}

          {currentUser?.role === 'Admin' && (
          <button 
            className="manage-questions-btn"
            onClick={() => navigate('/questions')}
          >
            Manage Questions <span className="icon">❓</span>
          </button>
          )}
        </div>

        {/* Direct analysis options for non-Admin users */}
        {currentUser?.role !== 'Admin' && (
          <div className="analysis-direct-access">
            <h2 className="section-title">Analysis Options</h2>
            <div className="analysis-options-grid">
              <div className="analysis-option-card-direct" onClick={() => navigate('/analysis')}>
                <div className="option-icon">📊</div>
                <h4>Normal Analysis</h4>
                <p>Detailed analysis with individual faculty reports</p>
              </div>
              <div className="analysis-option-card-direct" onClick={() => navigate('/visualize?mode=department')}>
                <div className="option-icon">📈</div>
                <h4>Visualization</h4>
                <p>Interactive charts and visual insights for performance metrics</p>
              </div>
              <div className="analysis-option-card-direct" onClick={() => navigate('/school-wise')}>
                <div className="option-icon">🏫</div>
                <h4>School-wise Reports</h4>
                <p>Generate comprehensive reports for all departments within a school</p>
              </div>
              <div className="analysis-option-card-direct" onClick={() => navigate('/individual-analysis')}>
                <div className="option-icon">👤</div>
                <h4>Faculty-wise Analysis</h4>
                <p>View complete feedback history of a faculty member</p>
              </div>
              {(currentUser?.role === 'HoD' || currentUser?.role === 'Dean') && (
                <div className="analysis-option-card-direct" onClick={() => navigate('/explanation')}>
                  <div className="option-icon">📝</div>
                  <h4>Explanation Documents</h4>
                  <p>Upload or review explanation documents for performance &lt; 80%</p>
                </div>
              )}
            </div>
          </div>
        )}

        <section className="features-section">
          <h2>Key Features</h2>
          <div className="features-grid">
            <div className="feature-card">
              <span className="feature-icon">📚</span>
              <h3>Department-wise Analysis</h3>
              <p>Analyze feedback across different departments and academic programs</p>
            </div>
            
            <div className="feature-card">
              <span className="feature-icon">👤</span>
              <h3>Faculty Performance</h3>
              <p>Comprehensive evaluation of teaching effectiveness and engagement</p>
            </div>

            <div className="feature-card">
              <span className="feature-icon">📊</span>
              <h3>Detailed Analytics</h3>
              <p>Section-wise and question-wise analysis with visual insights</p>
            </div>

            <div className="feature-card">
              <span className="feature-icon">🎯</span>
              <h3>Performance Tracking</h3>
              <p>Monitor trends and improvements across semesters</p>
            </div>
          </div>
        </section>
      </main>

      {/* Analysis Options Modal */}
      {showAnalysisOptions && (
        <div className="modal-overlay" onClick={() => setShowAnalysisOptions(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Choose Analysis Type</h3>
              <button 
                className="modal-close"
                onClick={() => setShowAnalysisOptions(false)}
              >
                ×
              </button>
            </div>
            <div className="modal-body">
              <div className="analysis-option-card" onClick={() => {
                setShowAnalysisOptions(false);
                navigate('/analysis');
              }}>
                <div className="option-icon">📊</div>
                <h4>Normal Analysis</h4>
                <p>Detailed analysis with individual faculty reports and downloadable Excel/PDF reports</p>
              </div>
              <div className="analysis-option-card" onClick={() => {
                setShowAnalysisOptions(false);
                setShowVisualizationOptions(true);
              }}>
                <div className="option-icon">📈</div>
                <h4>Visualization</h4>
                <p>Interactive charts and visual insights for quick understanding of performance metrics</p>
              </div>
              <div className="analysis-option-card" onClick={() => {
                setShowAnalysisOptions(false);
                navigate('/school-wise');
              }}>
                <div className="option-icon">🏫</div>
                <h4>School-wise Reports</h4>
                <p>Generate comprehensive reports for all departments within a school in Excel or PDF format</p>
              </div>
              <div className="analysis-option-card" onClick={() => {
                setShowAnalysisOptions(false);
                navigate('/individual-analysis');
              }}>
                <div className="option-icon">👤</div>
                <h4>Faculty-wise Analysis</h4>
                <p>View complete feedback history of a faculty member across all courses, semesters, and academic years</p>
              </div>
              <div className="analysis-option-card" onClick={() => {
                setShowAnalysisOptions(false);
                navigate('/explanation');
              }}>
                <div className="option-icon">📝</div>
                <h4>Explanation Documents</h4>
                <p>Upload or review explanation documents (images/PDF) for faculty with performance &lt; 80%</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Visualization Options Sub-Modal */}
      {showVisualizationOptions && (
        <div className="modal-overlay" onClick={() => setShowVisualizationOptions(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Choose Visualization Type</h3>
              <button 
                className="modal-close"
                onClick={() => setShowVisualizationOptions(false)}
              >
                ×
              </button>
            </div>
            <div className="modal-body">
              <div className="analysis-option-card" onClick={() => {
                setShowVisualizationOptions(false);
                navigate('/visualize?mode=radar');
              }}>
                <div className="option-icon">📊</div>
                <h4>Radar Chart Generation</h4>
                <p>Generate radar charts showing category-wise performance (Engineering/Arts) with department breakdown</p>
              </div>
              <div className="analysis-option-card" onClick={() => {
                setShowVisualizationOptions(false);
                navigate('/visualize?mode=department');
              }}>
                <div className="option-icon">📈</div>
                <h4>Visualize</h4>
                <p>Department-wise visualization with detailed performance metrics and insights</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Home;