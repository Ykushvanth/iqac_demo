import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import './index.css';

const SERVER_URL = process.env.REACT_APP_SERVER_URL || "https://iqac-demo.render.com";

const IndividualAnalysis = () => {
    const navigate = useNavigate();
    const [facultyList, setFacultyList] = useState([]);
    const [selectedStaffId, setSelectedStaffId] = useState('');
    const [loading, setLoading] = useState(false);
    const [loadingFaculty, setLoadingFaculty] = useState(false);
    const [historyData, setHistoryData] = useState(null);
    const [metricsData, setMetricsData] = useState(null);
    const [error, setError] = useState(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [loadingExcel, setLoadingExcel] = useState(false);
    const [showSuggestions, setShowSuggestions] = useState(false);
    const [currentUser, setCurrentUser] = useState(null);

    // Load current user on mount
    useEffect(() => {
        try {
            const stored = localStorage.getItem('user');
            if (stored) {
                const parsed = JSON.parse(stored);
                setCurrentUser(parsed || null);
            }
        } catch (e) {
            console.error('Error parsing user from localStorage:', e);
        }
    }, []);

    // Fetch faculty members on component mount (with role-based filtering)
    useEffect(() => {
        if (currentUser !== null) { // Wait for user to be loaded
            fetchFacultyList();
        }
    }, [currentUser]);

    const fetchFacultyList = async () => {
        setLoadingFaculty(true);
        setError(null);
        try {
            // Build query params based on user role
            const params = new URLSearchParams();
            if (currentUser?.role) {
                params.append('role', currentUser.role);
            }
            if (currentUser?.role === 'HoD' && currentUser?.department) {
                params.append('department', currentUser.department);
            }
            if (currentUser?.role === 'Dean' && currentUser?.school) {
                params.append('school', currentUser.school);
            }

            const response = await fetch(`${SERVER_URL}/api/individual-analysis/faculty?${params.toString()}`);
            const data = await response.json();
            
            if (data.success) {
                setFacultyList(data.faculty || []);
            } else {
                setError(data.message || 'Failed to fetch faculty list');
            }
        } catch (error) {
            console.error('Error fetching faculty list:', error);
            setError('Failed to fetch faculty list. Please try again.');
        } finally {
            setLoadingFaculty(false);
        }
    };

    const handleFacultyAnalysis = async () => {
        if (!selectedStaffId) {
            alert('Please select a faculty member');
            return;
        }

        setLoading(true);
        setError(null);
        setHistoryData(null);
        setMetricsData(null);

        try {
            // Fetch both history and metrics
            const [historyResponse, metricsResponse] = await Promise.all([
                fetch(`${SERVER_URL}/api/individual-analysis/history?staffId=${encodeURIComponent(selectedStaffId)}`),
                fetch(`${SERVER_URL}/api/individual-analysis/metrics?staffId=${encodeURIComponent(selectedStaffId)}`)
            ]);

            const historyResult = await historyResponse.json();
            const metricsResult = await metricsResponse.json();

            if (historyResult.success) {
                setHistoryData(historyResult);
            } else {
                setError(historyResult.message || 'Failed to fetch feedback history');
            }

            if (metricsResult.success) {
                setMetricsData(metricsResult);
            }
        } catch (error) {
            console.error('Error fetching faculty analysis:', error);
            setError('Failed to fetch faculty analysis. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    const handleLogout = () => {
        localStorage.removeItem('user');
        navigate('/login');
    };

    const handleDownloadExcel = async () => {
        if (!selectedStaffId) {
            alert('Please select a faculty member');
            return;
        }

        setLoadingExcel(true);
        try {
            const response = await fetch(
                `${SERVER_URL}/api/individual-analysis/generate-excel?staffId=${encodeURIComponent(selectedStaffId)}`
            );

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.message || 'Failed to generate Excel report');
            }

            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `faculty_complete_history_${selectedStaffId}.xlsx`;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);
        } catch (error) {
            console.error('Error downloading Excel:', error);
            alert('Failed to download Excel report: ' + error.message);
        } finally {
            setLoadingExcel(false);
        }
    };

    // Filter faculty list based on search term (case-insensitive)
    const filteredFaculty = facultyList.filter(faculty => {
        if (!searchTerm.trim()) return true;
        const searchLower = searchTerm.toLowerCase().trim();
        const nameMatch = faculty.faculty_name.toLowerCase().includes(searchLower);
        const staffIdMatch = faculty.staff_id.toLowerCase().includes(searchLower);
        const staffidMatch = faculty.staffid && faculty.staffid.toLowerCase().includes(searchLower);
        return nameMatch || staffIdMatch || staffidMatch;
    });

    // Auto-select if there's exactly one match and search term is not empty
    useEffect(() => {
        if (searchTerm.trim() && filteredFaculty.length === 1) {
            const singleMatchId = filteredFaculty[0].staff_id;
            if (selectedStaffId !== singleMatchId) {
                setSelectedStaffId(singleMatchId);
                setSearchTerm('');
                setShowSuggestions(false);
            }
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [searchTerm, filteredFaculty.length]);

    // Close suggestions when clicking outside
    useEffect(() => {
        const handleClickOutside = (event) => {
            if (!event.target.closest('.search-suggestions-container')) {
                setShowSuggestions(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const handleSuggestionSelect = (staffId) => {
        setSelectedStaffId(staffId);
        setSearchTerm('');
        setShowSuggestions(false);
    };

    const selectedFaculty = facultyList.find(f => f.staff_id === selectedStaffId);

    return (
        <div className="individual-analysis-container">
            <header className="header">
                <div className="logo-container">
                    <img 
                        src="https://www.kalasalingam.ac.in/wp-content/uploads/2022/02/Logo.png" 
                        alt="Kalasalingam Logo" 
                        className="logo" 
                    />
                    <div className="header-text">
                        <h1>Office of IQAC, KARE</h1>
                        <p>Faculty-wise Analysis</p>
                    </div>
                </div>
                <div className="header-actions">
                    <button className="home-btn" onClick={() => navigate('/')}>
                        <span>🏠</span> Home
                    </button>
                    <button className="logout-btn" onClick={handleLogout}>
                        <span>🚪</span> Logout
                    </button>
                </div>
            </header>

            <main className="main-content">
                <div className="analysis-section">
                    <h2 className="section-title">Select Faculty Member</h2>
                    <p className="section-description">
                        Select a faculty member to view their complete feedback history across all courses, 
                        semesters, and academic years in a single view.
                        {currentUser?.role === 'HoD' && currentUser?.department && (
                            <span className="filter-info"> (Showing faculty from {currentUser.department} department)</span>
                        )}
                        {currentUser?.role === 'Dean' && currentUser?.school && (
                            <span className="filter-info"> (Showing faculty from {currentUser.school} school)</span>
                        )}
                    </p>

                    {loadingFaculty ? (
                        <div className="loading-message">Loading faculty list...</div>
                    ) : error && !historyData ? (
                        <div className="error-message">{error}</div>
                    ) : (
                        <>
                            <div className="faculty-selection-container">
                                <div className="faculty-selection">
                                    <div className="search-input-wrapper search-suggestions-container">
                                        <input
                                            type="text"
                                            placeholder="Search by staff ID or faculty name..."
                                            value={searchTerm}
                                            onChange={(e) => {
                                                const value = e.target.value;
                                                setSearchTerm(value);
                                                setShowSuggestions(value.trim().length > 0);
                                                if (selectedStaffId) {
                                                    setSelectedStaffId('');
                                                }
                                            }}
                                            onFocus={() => {
                                                if (searchTerm.trim().length > 0) {
                                                    setShowSuggestions(true);
                                                }
                                            }}
                                            onKeyDown={(e) => {
                                                if (e.key === 'Enter' && filteredFaculty.length > 0) {
                                                    // Auto-select first result on Enter
                                                    handleSuggestionSelect(filteredFaculty[0].staff_id);
                                                }
                                                if (e.key === 'Escape') {
                                                    setShowSuggestions(false);
                                                }
                                            }}
                                            className="search-input-field"
                                        />
                                        
                                        {showSuggestions && filteredFaculty.length > 0 && (
                                            <div className="suggestions-dropdown">
                                                {filteredFaculty.slice(0, 10).map((faculty) => (
                                                    <div
                                                        key={faculty.staff_id}
                                                        className="suggestion-item"
                                                        onClick={() => handleSuggestionSelect(faculty.staff_id)}
                                                        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f5f5f5'}
                                                        onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'white'}
                                                    >
                                                        <span className="suggestion-name">{faculty.faculty_name}</span>
                                                        <span className="suggestion-id">({faculty.staff_id})</span>
                                                    </div>
                                                ))}
                                                {filteredFaculty.length > 10 && (
                                                    <div className="suggestion-more">
                                                        + {filteredFaculty.length - 10} more matches
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                        
                                        {showSuggestions && searchTerm.trim().length > 0 && filteredFaculty.length === 0 && (
                                            <div className="suggestions-dropdown">
                                                <div className="suggestion-no-results">
                                                    No faculty found matching "{searchTerm}"
                                                </div>
                                            </div>
                                        )}
                                    </div>

                                    {selectedStaffId && (
                                        <div className="action-buttons-group">
                                            <button
                                                onClick={handleFacultyAnalysis}
                                                disabled={!selectedStaffId || loading}
                                                className="analyze-btn"
                                            >
                                                {loading ? '⏳ Analyzing...' : '📊 View History'}
                                            </button>
                                            <button
                                                onClick={handleDownloadExcel}
                                                disabled={!selectedStaffId || loadingExcel}
                                                className="download-excel-btn"
                                            >
                                                {loadingExcel ? '⏳ Generating...' : '📥 Download Excel'}
                                            </button>
                                        </div>
                                    )}
                                </div>
                                
                                {selectedStaffId && (
                                    <div className="selected-faculty-info">
                                        <div className="selected-faculty-content">
                                            <div className="selected-icon">👤</div>
                                            <div className="selected-faculty-details">
                                                <div className="selected-faculty-name">
                                                    {facultyList.find(f => f.staff_id === selectedStaffId)?.faculty_name}
                                                </div>
                                                <div className="selected-faculty-id">Staff ID: {selectedStaffId}</div>
                                            </div>
                                        </div>
                                        <button 
                                            className="clear-selection-btn"
                                            onClick={() => {
                                                setSelectedStaffId('');
                                                setSearchTerm('');
                                                setShowSuggestions(false);
                                            }}
                                            title="Clear selection"
                                        >
                                            ✕
                                        </button>
                                    </div>
                                )}
                            </div>
                        </>
                    )}

                    {historyData && historyData.success && (
                        <div className="results-section">
                            <div className="faculty-header">
                                <div className="faculty-header-content">
                                    <div className="faculty-header-icon">👤</div>
                                    <div className="faculty-header-info">
                                        <h3>{historyData.faculty_name}</h3>
                                        <p className="staff-id">Staff ID: {historyData.staff_id}</p>
                                    </div>
                                </div>
                            </div>

                            {metricsData && metricsData.success && (
                                <div className="overall-stats">
                                    <h4>Overall Statistics</h4>
                                    <div className="stats-grid">
                                        <div className="stat-card">
                                            <div className="stat-value">{metricsData.overall_stats.total_courses}</div>
                                            <div className="stat-label">Total Courses</div>
                                        </div>
                                        <div className="stat-card">
                                            <div className="stat-value">{metricsData.overall_stats.total_responses}</div>
                                            <div className="stat-label">Total Responses</div>
                                        </div>
                                        <div className="stat-card">
                                            <div className="stat-value">{parseFloat(metricsData.overall_stats.overall_average).toFixed(2)}%</div>
                                            <div className="stat-label">Overall Average Score</div>
                                        </div>
                                        <div className="stat-card">
                                            <div className="stat-value">{metricsData.overall_stats.academic_years.length}</div>
                                            <div className="stat-label">Academic Years</div>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {metricsData && metricsData.yearly_trends && metricsData.yearly_trends.length > 0 && (
                                <div className="yearly-trends">
                                    <h4>Performance by Academic Year</h4>
                                    <div className="trends-table">
                                        <table>
                                            <thead>
                                                <tr>
                                                    <th>Academic Year</th>
                                                    <th>Courses</th>
                                                    <th>Total Responses</th>
                                                    <th>Average Score (%)</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {metricsData.yearly_trends.map((year, index) => (
                                                    <tr key={index}>
                                                        <td>{year.academic_year}</td>
                                                        <td>{year.unique_courses}</td>
                                                        <td>{year.total_responses}</td>
                                                        <td>{parseFloat(year.average_score).toFixed(2)}%</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            )}

                            {metricsData && metricsData.course_performance && metricsData.course_performance.length > 0 && (
                                <div className="course-performance">
                                    <h4>Performance by Course</h4>
                                    <div className="course-table">
                                        <table>
                                            <thead>
                                                <tr>
                                                    <th>Course Code</th>
                                                    <th>Course Name</th>
                                                    <th>Offerings</th>
                                                    <th>Total Responses</th>
                                                    <th>Average Score (%)</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {metricsData.course_performance.map((course, index) => (
                                                    <tr key={index}>
                                                        <td>{course.course_code}</td>
                                                        <td>{course.course_name}</td>
                                                        <td>{course.total_offerings}</td>
                                                        <td>{course.total_responses}</td>
                                                        <td>{parseFloat(course.average_score).toFixed(2)}%</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            )}

                            <div className="detailed-history">
                                <h4>Detailed Feedback History</h4>
                                <div className="history-table-container">
                                    <table className="history-table">
                                        <thead>
                                            <tr>
                                                <th>Academic Year</th>
                                                <th>Semester</th>
                                                <th>Course Code</th>
                                                <th>Course Name</th>
                                                <th>Degree</th>
                                                <th>Department</th>
                                                <th>Batch</th>
                                                <th>Responses</th>
                                                <th>Average Score (%)</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {historyData.history.map((item, index) => (
                                                <tr key={index}>
                                                    <td>{item.current_ay}</td>
                                                    <td>{item.semester}</td>
                                                    <td>{item.course_code}</td>
                                                    <td>{item.course_name}</td>
                                                    <td>{item.degree}</td>
                                                    <td>{item.dept}</td>
                                                    <td>{item.batch}</td>
                                                    <td>{item.total_responses}</td>
                                                    <td>{item.overall_average.toFixed(2)}%</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>
                    )}

                    {error && historyData && (
                        <div className="error-message">{error}</div>
                    )}
                </div>
            </main>
        </div>
    );
};

export default IndividualAnalysis;

