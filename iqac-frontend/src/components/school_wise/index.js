import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import './index.css';

const SERVER_URL = process.env.REACT_APP_SERVER_URL || "https://iqac-repo3.onrender.com";

const SchoolWise = () => {
    const navigate = useNavigate();
    const [currentUser, setCurrentUser] = useState(null);
    const [accessError, setAccessError] = useState('');
    const [filters, setFilters] = useState({
        currentAY: '',
        semester: ''
    });
    const [options, setOptions] = useState({
        currentAYs: [],
        semesters: [],
        schools: []
    });
    const [selectedSchools, setSelectedSchools] = useState([]);
    const [isSchoolDropdownOpen, setIsSchoolDropdownOpen] = useState(false);
    const [loadingSchools, setLoadingSchools] = useState(true);
    const [loadingAllReports, setLoadingAllReports] = useState(false);
    const [generationProgress, setGenerationProgress] = useState({
        startTime: null,
        totalSchools: 0,
        estimatedTimePerSchool: 30 // seconds per school (estimated)
    });
    const [elapsedTime, setElapsedTime] = useState(0);

    const handleLogout = () => {
        localStorage.removeItem('user');
        navigate('/login');
    };

    // Load current user on mount
    useEffect(() => {
        try {
            const stored = localStorage.getItem('user');
            if (stored) {
                const parsed = JSON.parse(stored);
                setCurrentUser(parsed || null);
                // HoD should not access school-wise page
                if (parsed?.role === 'HoD') {
                    setAccessError('Access restricted: School-wise reports are available only for Admin and Dean users.');
                    return;
                }
            }
        } catch (e) {
            console.error('Error parsing user from localStorage:', e);
        }
    }, []);

    // Once we know the current user (and not HoD), fetch schools with correct scoping
    useEffect(() => {
        if (accessError) return; // HoD - do nothing
        fetchSchools();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [currentUser?.role, currentUser?.school, accessError]);

    // Fetch academic years when selected schools change
    useEffect(() => {
        fetchCurrentAY();
        // Reset filters when schools change
        setFilters(prev => ({
            ...prev,
            currentAY: '',
            semester: ''
        }));
    }, [selectedSchools]);

    // Fetch semesters when current AY or selected schools change
    useEffect(() => {
        if (filters.currentAY) {
            fetchSemesters(filters.currentAY);
            setFilters(prev => ({
                ...prev,
                semester: ''
            }));
        } else {
            setOptions(prev => ({ ...prev, semesters: [] }));
        }
    }, [filters.currentAY, selectedSchools]);


    // Close dropdown when clicking outside
    useEffect(() => {
        const handleClickOutside = (event) => {
            if (isSchoolDropdownOpen && !event.target.closest('.school-multiselect-container')) {
                setIsSchoolDropdownOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [isSchoolDropdownOpen]);

    // Update progress timer when generating all reports
    useEffect(() => {
        let interval = null;
        if (loadingAllReports && generationProgress.startTime) {
            // Update elapsed time every second
            interval = setInterval(() => {
                const elapsed = Math.floor((Date.now() - generationProgress.startTime) / 1000);
                setElapsedTime(elapsed);
            }, 1000);
        } else {
            setElapsedTime(0);
        }
        return () => {
            if (interval) {
                clearInterval(interval);
            }
        };
    }, [loadingAllReports, generationProgress.startTime]);

    // Prevent body scroll when modal is open
    useEffect(() => {
        if (loadingAllReports) {
            document.body.style.overflow = 'hidden';
        } else {
            document.body.style.overflow = '';
        }
        return () => {
            document.body.style.overflow = '';
        };
    }, [loadingAllReports]);

    const fetchCurrentAY = async () => {
        try {
            let url = `${SERVER_URL}/api/school-reports/current-ay`;
            // For Dean, even if no school is explicitly selected, always scope by their school
            const effectiveSchools = selectedSchools.length > 0
                ? selectedSchools
                : (currentUser?.role === 'Dean' && currentUser?.school ? [currentUser.school] : []);

            if (effectiveSchools.length > 0) {
                // Send schools as JSON array in query parameter
                const schoolsParam = encodeURIComponent(JSON.stringify(effectiveSchools));
                url += `?schools=${schoolsParam}`;
            }
            const response = await fetch(url);
            const data = await response.json();
            setOptions(prev => ({ ...prev, currentAYs: Array.isArray(data) ? data : [] }));
            // Reset current AY if it's no longer in the filtered list
            if (filters.currentAY && Array.isArray(data) && !data.includes(filters.currentAY)) {
                setFilters(prev => ({
                    ...prev,
                    currentAY: '',
                    semester: ''
                }));
            }
        } catch (error) {
            console.error('Error fetching current AY:', error);
            setOptions(prev => ({ ...prev, currentAYs: [] }));
        }
    };

    const fetchSemesters = async (currentAY) => {
        try {
            const params = new URLSearchParams();
            if (currentAY) {
                params.append('currentAY', encodeURIComponent(currentAY));
            }
            // For Dean, even if no school is explicitly selected, always scope by their school
            const effectiveSchools = selectedSchools.length > 0
                ? selectedSchools
                : (currentUser?.role === 'Dean' && currentUser?.school ? [currentUser.school] : []);

            if (effectiveSchools.length > 0) {
                // Send schools as JSON array in query parameter
                params.append('schools', encodeURIComponent(JSON.stringify(effectiveSchools)));
            }
            const response = await fetch(`${SERVER_URL}/api/school-reports/semesters?${params.toString()}`);
            const data = await response.json();
            setOptions(prev => ({ ...prev, semesters: Array.isArray(data) ? data : [] }));
            // Reset semester if it's no longer in the filtered list
            if (filters.semester && Array.isArray(data) && !data.includes(filters.semester)) {
                setFilters(prev => ({
                    ...prev,
                    semester: ''
                }));
            }
        } catch (error) {
            console.error('Error fetching semesters:', error);
            setOptions(prev => ({ ...prev, semesters: [] }));
        }
    };

    const fetchSchools = async () => {
        try {
            setLoadingSchools(true);
            const response = await fetch(`${SERVER_URL}/api/school-reports/schools`);
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
                throw new Error(errorData.error || `HTTP ${response.status}: Failed to fetch schools`);
            }
            const data = await response.json();
            if (Array.isArray(data)) {
                // Role-based restriction: Dean can see only their own school; Admin can see all.
                let allowedSchools = data;
                if (currentUser?.role === 'Dean' && currentUser?.school) {
                    allowedSchools = data.filter(s => s === currentUser.school);
                }
                setOptions(prev => ({ ...prev, schools: allowedSchools }));

                // If Dean has exactly one school, pre-select it and lock selection logic to that.
                if (currentUser?.role === 'Dean' && currentUser?.school && allowedSchools.includes(currentUser.school)) {
                    setSelectedSchools([currentUser.school]);
                }
            } else {
                throw new Error('Invalid response format');
            }
        } catch (error) {
            console.error('Error fetching schools:', error);
            alert(`Error fetching schools: ${error.message}. Please check the server console for more details.`);
        } finally {
            setLoadingSchools(false);
        }
    };


    const handleSchoolToggle = (school) => {
        setSelectedSchools(prev => {
            if (prev.includes(school)) {
                return prev.filter(s => s !== school);
            } else {
                return [...prev, school];
            }
        });
    };

    const handleSelectAllSchools = () => {
        if (selectedSchools.length === options.schools.length) {
            setSelectedSchools([]);
        } else {
            setSelectedSchools([...options.schools]);
        }
    };

    const handleGenerateAllSchoolReports = async () => {
        if (!filters.currentAY || !filters.semester) {
            alert('Please select Current Academic Year and Semester.');
            return;
        }

        const schoolsToGenerate = selectedSchools.length > 0 ? selectedSchools : options.schools;
        const schoolCount = schoolsToGenerate.length;
        const confirmMessage = `This will generate reports (PDF, Excel, and Negative Comments Excel) for ${selectedSchools.length > 0 ? `SELECTED (${schoolCount})` : 'ALL'} schools.\n\nThis may take several minutes. Do you want to continue?`;
        if (!window.confirm(confirmMessage)) {
            return;
        }

        try {
            // Get total number of schools for progress estimation
            const totalSchools = schoolCount;
            setGenerationProgress({
                startTime: Date.now(),
                totalSchools: totalSchools,
                estimatedTimePerSchool: 30 // seconds per school (estimated)
            });
            setLoadingAllReports(true);

            const response = await fetch(`${SERVER_URL}/api/school-reports/generate-all-school-reports`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    currentAY: filters.currentAY,
                    semester: filters.semester,
                    schools: selectedSchools.length > 0 ? selectedSchools : undefined
                })
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(errorText || `HTTP ${response.status}: Failed to generate all school reports`);
            }

            const blob = await response.blob();
            if (!blob || blob.size === 0) {
                throw new Error('Received empty file from server');
            }

            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            const safeAY = filters.currentAY.replace(/[^a-z0-9]/gi, '_');
            const safeSemester = filters.semester.replace(/[^a-z0-9]/gi, '_');
            a.download = `all_schools_reports_${safeAY}_${safeSemester}.zip`;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);
            
            alert('All school reports generated successfully! The zip file contains reports for all schools organized by school name.');
        } catch (error) {
            console.error('All school reports error:', error);
            alert('Error generating all school reports: ' + error.message);
        } finally {
            setLoadingAllReports(false);
            setGenerationProgress({
                startTime: null,
                totalSchools: 0,
                estimatedTimePerSchool: 30
            });
            setElapsedTime(0);
        }
    };

    // Calculate elapsed time and estimated remaining time
    const getTimeInfo = () => {
        if (!generationProgress.startTime) return { elapsed: 0, remaining: 0, percentage: 0 };
        
        const elapsed = elapsedTime; // Use state value
        const totalEstimated = generationProgress.totalSchools * generationProgress.estimatedTimePerSchool;
        const remaining = Math.max(0, totalEstimated - elapsed);
        const percentage = Math.min(95, (elapsed / totalEstimated) * 100); // Cap at 95% until done
        
        return { elapsed, remaining, percentage };
    };

    const formatTime = (seconds) => {
        if (seconds < 60) return `${seconds}s`;
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins}m ${secs}s`;
    };

    // If HoD, show access restricted message (route is still technically protected, but UX is clearer)
    if (accessError) {
        return (
            <div className="school-wise-container">
                <header className="header">
                    <div className="logo-container">
                        <img 
                            src="https://www.kalasalingam.ac.in/wp-content/uploads/2022/02/Logo.png" 
                            alt="Kalasalingam Logo" 
                            className="logo" 
                        />
                        <div className="header-text">
                            <h1>Office of IQAC, KARE</h1>
                            <p>School-wise Feedback Analysis</p>
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
                    <h1 className="page-title">Access Restricted</h1>
                    <p style={{ marginTop: '1rem', color: '#b91c1c', fontWeight: 500 }}>
                        {accessError}
                    </p>
                </main>
            </div>
        );
    }

    return (
        <div className="school-wise-container">
            <header className="header">
                <div className="logo-container">
                    <img 
                        src="https://www.kalasalingam.ac.in/wp-content/uploads/2022/02/Logo.png" 
                        alt="Kalasalingam Logo" 
                        className="logo" 
                    />
                    <div className="header-text">
                        <h1>Office of IQAC, KARE</h1>
                        <p>School-wise Feedback Analysis</p>
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
                <h1 className="page-title">School-wise Report Generation</h1>
                <p className="page-description">
                    Generate comprehensive feedback analysis reports for all departments within a school.
                    Reports include all degrees and batches to provide a complete overview of the school's performance.
                    Reports can be generated in Excel (multiple sheets) or PDF (multiple pages) format.
                    <br /><br />
                    <strong>Note:</strong> To generate reports for <strong>ALL schools</strong> at once, simply select Academic Year and Semester (no school selection needed).
                </p>

                <div className="filters-section">
                    <div className="filters-row">
                        <div className={`filter-group ${isSchoolDropdownOpen ? 'dropdown-open' : ''}`}>
                            <label htmlFor="school-multiselect">School (Optional for All Schools)</label>
                            <div className="school-multiselect-container">
                                <div 
                                    className="school-multiselect-dropdown"
                                    onClick={() => setIsSchoolDropdownOpen(!isSchoolDropdownOpen)}
                                >
                                    <div className="school-multiselect-display">
                                        {selectedSchools.length === 0 
                                            ? 'Select Schools (or leave empty for All Schools)' 
                                            : selectedSchools.length === 1
                                            ? selectedSchools[0]
                                            : `${selectedSchools.length} schools selected`
                                        }
                                    </div>
                                    <span className="school-multiselect-arrow">{isSchoolDropdownOpen ? '▲' : '▼'}</span>
                                </div>
                                {isSchoolDropdownOpen && (
                                    <div className="school-multiselect-options">
                                        <div 
                                            className="school-multiselect-option select-all"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                handleSelectAllSchools();
                                            }}
                                        >
                                            <input
                                                type="checkbox"
                                                checked={selectedSchools.length === options.schools.length && options.schools.length > 0}
                                                onChange={() => {}}
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    handleSelectAllSchools();
                                                }}
                                            />
                                            <label>Select All Schools</label>
                                        </div>
                                        {loadingSchools ? (
                                            <div className="school-multiselect-loading">Loading schools...</div>
                                        ) : (
                                            options.schools.map((school, index) => (
                                                <div 
                                                    key={index}
                                                    className="school-multiselect-option"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        handleSchoolToggle(school);
                                                    }}
                                                >
                                                    <input
                                                        type="checkbox"
                                                        checked={selectedSchools.includes(school)}
                                                        onChange={() => {}}
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            handleSchoolToggle(school);
                                                        }}
                                                    />
                                                    <label>{school}</label>
                                                </div>
                                            ))
                                        )}
                                    </div>
                                )}
                            </div>
                            {selectedSchools.length === 0 && (
                                <span className="loading-text" style={{ color: '#2563eb', fontStyle: 'normal', marginTop: '0.5rem', display: 'block' }}>
                                    💡 Leave schools unselected to generate reports for all schools
                                </span>
                            )}
                            {selectedSchools.length > 0 && (
                                <div className="selected-schools-badges">
                                    {selectedSchools.map((school, index) => (
                                        <span key={index} className="selected-school-badge">
                                            {school}
                                            <button 
                                                onClick={() => handleSchoolToggle(school)}
                                                className="remove-school-btn"
                                            >
                                                ×
                                            </button>
                                        </span>
                                    ))}
                                </div>
                            )}
                        </div>

                        <div className="filter-group">
                            <label htmlFor="current-ay-select">Current Academic Year *</label>
                            <select
                                id="current-ay-select"
                                value={filters.currentAY}
                                onChange={(e) => setFilters({
                                    ...filters,
                                    currentAY: e.target.value,
                                    semester: ''
                                })}
                                className="filter-select"
                            >
                                <option value="">Select Academic Year</option>
                                {options.currentAYs.map(ay => (
                                    <option key={ay} value={ay}>{ay}</option>
                                ))}
                            </select>
                        </div>

                        <div className="filter-group filter-group-with-hint">
                            <label htmlFor="semester-select">Semester *</label>
                            <div className="semester-select-wrapper">
                                <select
                                    id="semester-select"
                                    value={filters.semester}
                                    onChange={(e) => setFilters({
                                        ...filters,
                                        semester: e.target.value
                                    })}
                                    disabled={!filters.currentAY}
                                    className="filter-select"
                                >
                                    <option value="">Select Semester</option>
                                    {options.semesters.map(sem => (
                                        <option key={sem} value={sem}>{sem}</option>
                                    ))}
                                </select>
                                <span className="filter-hint">
                                    Generate for {selectedSchools.length > 0 ? `Selected (${selectedSchools.length})` : 'All'} Schools: Only Academic Year and Semester required
                                </span>
                            </div>
                        </div>
                    </div>

                    <div className="action-buttons all-schools-section" style={{ marginTop: '2rem', borderTop: '2px solid #e5e7eb', paddingTop: '1.5rem' }}>
                        <button
                            className="generate-all-btn"
                            onClick={handleGenerateAllSchoolReports}
                            disabled={!filters.currentAY || !filters.semester || loadingAllReports}
                        >
                            {loadingAllReports ? (
                                <>
                                    <span className="spinner"></span>
                                    Generating {selectedSchools.length > 0 ? 'Selected' : 'All'} School Reports...
                                </>
                            ) : (
                                <>
                                    <span>📦</span>
                                    Generate {selectedSchools.length > 0 ? `Selected (${selectedSchools.length})` : 'All'} School Reports
                                </>
                            )}
                        </button>
                    </div>
                </div>
            </main>

            {/* Generation Progress Modal */}
            {loadingAllReports && (
                <div className="generation-progress-overlay">
                    <div className="generation-progress-modal">
                        <div className="progress-header">
                            <h3>
                                <span>📦</span>
                                Generating Reports
                            </h3>
                        </div>
                        <div className="progress-body">
                            <div className="progress-spinner-container">
                                <div className="progress-spinner"></div>
                            </div>
                            <div className="progress-stats">
                                <div className="stat-item">
                                    <span className="stat-label">Elapsed</span>
                                    <span className="stat-value">{formatTime(getTimeInfo().elapsed)}</span>
                                </div>
                                <div className="stat-item">
                                    <span className="stat-label">Remaining</span>
                                    <span className="stat-value">{formatTime(getTimeInfo().remaining)}</span>
                                </div>
                                <div className="stat-item">
                                    <span className="stat-label">Progress</span>
                                    <span className="stat-value">{Math.round(getTimeInfo().percentage)}%</span>
                                </div>
                            </div>
                            <div className="progress-bar-container">
                                <div className="progress-bar">
                                    <div 
                                        className="progress-bar-fill" 
                                        style={{ width: `${getTimeInfo().percentage}%` }}
                                    ></div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default SchoolWise;

