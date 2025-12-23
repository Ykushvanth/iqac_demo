import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import './index.css';
const SERVER_URL = process.env.REACT_APP_SERVER_URL || "https://iqac-repo3.onrender.com";
const UploadFile = () => {
    const navigate = useNavigate();
    const [file, setFile] = useState(null);
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState('');
    const [uploadMode, setUploadMode] = useState('add'); // 'add' or 'delete'
    const [filters, setFilters] = useState({
        degree: '',
        currentAY: '',
        semester: '',
        courseOfferingDept: ''
    });
    const [options, setOptions] = useState({
        degrees: [],
        currentAYs: [],
        semesters: [],
        courseOfferingDepts: []
    });
    const [loadingOptions, setLoadingOptions] = useState(false);

    const handleLogout = () => {
        localStorage.removeItem('user');
        navigate('/login');
    };

    // Fetch filter options
    useEffect(() => {
        if (uploadMode === 'delete') {
            fetchDegrees();
        }
    }, [uploadMode]);

    useEffect(() => {
        if (uploadMode === 'delete' && filters.degree) {
            fetchCurrentAY();
        } else if (uploadMode === 'delete') {
            setOptions(prev => ({ ...prev, currentAYs: [], semesters: [], courseOfferingDepts: [] }));
            setFilters(prev => ({ ...prev, currentAY: '', semester: '', courseOfferingDept: '' }));
        }
    }, [filters.degree, uploadMode]);

    useEffect(() => {
        if (uploadMode === 'delete' && filters.degree && filters.currentAY) {
            fetchSemesters();
        } else if (uploadMode === 'delete' && !filters.currentAY) {
            setOptions(prev => ({ ...prev, semesters: [], courseOfferingDepts: [] }));
            setFilters(prev => ({ ...prev, semester: '', courseOfferingDept: '' }));
        }
    }, [filters.currentAY, uploadMode]);

    useEffect(() => {
        if (uploadMode === 'delete' && filters.degree && filters.currentAY && filters.semester) {
            fetchCourseOfferingDepts();
        } else if (uploadMode === 'delete' && !filters.semester) {
            setOptions(prev => ({ ...prev, courseOfferingDepts: [] }));
            setFilters(prev => ({ ...prev, courseOfferingDept: '' }));
        }
    }, [filters.semester, uploadMode]);

    const fetchDegrees = async () => {
        try {
            setLoadingOptions(true);
            console.log('Fetching degrees from:', `${SERVER_URL}/api/analysis/degrees`);
            const response = await axios.get(`${SERVER_URL}/api/analysis/degrees`);
            console.log('Degrees response:', response.data);
            if (response.data && Array.isArray(response.data)) {
                setOptions(prev => ({ ...prev, degrees: response.data }));
                console.log('Degrees set:', response.data);
            } else {
                console.error('Invalid response format:', response.data);
                setMessage('Error: Failed to load degrees. Please refresh the page.');
            }
        } catch (error) {
            console.error('Error fetching degrees:', error);
            setMessage('Error: Failed to load degrees. Please check your connection and try again.');
        } finally {
            setLoadingOptions(false);
        }
    };

    const fetchCurrentAY = async () => {
        try {
            setLoadingOptions(true);
            const response = await axios.get(`${SERVER_URL}/api/analysis/current-ay?degree=${encodeURIComponent(filters.degree)}`);
            if (response.data && Array.isArray(response.data)) {
                setOptions(prev => ({ ...prev, currentAYs: response.data }));
            }
        } catch (error) {
            console.error('Error fetching current AY:', error);
        } finally {
            setLoadingOptions(false);
        }
    };

    const fetchSemesters = async () => {
        try {
            setLoadingOptions(true);
            const response = await axios.get(`${SERVER_URL}/api/analysis/semesters?degree=${encodeURIComponent(filters.degree)}&currentAY=${encodeURIComponent(filters.currentAY)}`);
            if (response.data && Array.isArray(response.data)) {
                setOptions(prev => ({ ...prev, semesters: response.data }));
            }
        } catch (error) {
            console.error('Error fetching semesters:', error);
        } finally {
            setLoadingOptions(false);
        }
    };

    const fetchCourseOfferingDepts = async () => {
        try {
            setLoadingOptions(true);
            const response = await axios.get(`${SERVER_URL}/api/analysis/course-offering-depts?degree=${encodeURIComponent(filters.degree)}&currentAY=${encodeURIComponent(filters.currentAY)}&semester=${encodeURIComponent(filters.semester)}`);
            if (response.data && Array.isArray(response.data)) {
                setOptions(prev => ({ ...prev, courseOfferingDepts: response.data }));
            }
        } catch (error) {
            console.error('Error fetching course offering depts:', error);
        } finally {
            setLoadingOptions(false);
        }
    };

    const handleFileSelect = (event) => {
        const selectedFile = event.target.files[0];
        if (selectedFile) {
            const fileType = selectedFile.name.split('.').pop().toLowerCase();
            if (['csv', 'xlsx', 'xls'].includes(fileType)) {
                setFile(selectedFile);
                setMessage('');
            } else {
                setMessage('Error: Please select a CSV or Excel file');
                event.target.value = '';
            }
        }
    };

    const handleFileInputClick = () => {
        const fileInput = document.getElementById('file-input');
        if (fileInput) {
            fileInput.click();
        }
    };

    const handleUpload = async () => {
        if (uploadMode === 'delete') {
            // Validate filters for delete mode
            if (!filters.degree || !filters.currentAY || !filters.semester) {
                setMessage('Error: Please select all required filters (Degree, Academic Year, Semester)');
                return;
            }
        } else {
            // Validate file for add mode - if no file, open file picker
            if (!file) {
                handleFileInputClick();
                setMessage('Please select a file to upload');
                return;
            }
        }

        setLoading(true);
        const formData = new FormData();
        
        if (uploadMode === 'add') {
            formData.append('file', file);
        } else {
            // For delete mode, send filters
            formData.append('mode', 'delete');
            formData.append('degree', filters.degree);
            formData.append('currentAY', filters.currentAY);
            formData.append('semester', filters.semester);
            if (filters.courseOfferingDept) {
                formData.append('courseOfferingDept', filters.courseOfferingDept);
            }
        }

        try {
            console.log('Starting operation...', uploadMode);
            
            const endpoint = uploadMode === 'delete' ? `${SERVER_URL}/api/upload/delete` : `${SERVER_URL}/api/upload`;
            const response = await axios.post(endpoint, formData, {
                headers: {
                    'Content-Type': 'multipart/form-data'
                },
                onUploadProgress: uploadMode === 'add' ? (progressEvent) => {
                    console.log('Upload progress:', Math.round((progressEvent.loaded * 100) / progressEvent.total));
                } : undefined
            });

            console.log('Server response:', response.data);

            if (response.data.success) {
                if (uploadMode === 'delete') {
                    setMessage(`Success! Deleted ${response.data.count} records from course feedback database.`);
                    alert(`Delete successful! ${response.data.count} records deleted from database.`);
                    // Reset filters
                    setFilters({ degree: '', currentAY: '', semester: '', courseOfferingDept: '' });
                } else {
                    setMessage(`Success! Uploaded ${response.data.count} records to course feedback database.`);
                    alert(`Upload successful! ${response.data.count} records added to database.`);
                    setFile(null);
                    const fileInput = document.querySelector('input[type="file"]');
                    if (fileInput) fileInput.value = '';
                }
            } else {
                setMessage((uploadMode === 'delete' ? 'Delete failed: ' : 'Upload failed: ') + response.data.message);
                alert((uploadMode === 'delete' ? 'Delete failed: ' : 'Upload failed: ') + response.data.message);
            }
        } catch (error) {
            console.error('Operation error:', error);
            setMessage('Error: ' + (error.response?.data?.message || error.message));
            alert('Error: ' + (error.response?.data?.message || error.message));
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="upload-page-container">
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
                    <button className="home-btn" onClick={() => navigate('/')}>
                        <span>🏠</span> Home
                    </button>
                    <button className="logout-btn" onClick={handleLogout}>
                        <span>🚪</span> Logout
                    </button>
                </div>
            </header>

            <main className="main-content">
                <h1 className="page-title">Upload Feedback Data</h1>
                <p className="page-description">Upload new feedback data or delete existing data based on filters</p>
                
                <div className="file-upload-container">
                    <div className="upload-mode-selection">
                <label className="mode-option">
                    <input
                        type="radio"
                        name="uploadMode"
                        value="add"
                        checked={uploadMode === 'add'}
                        onChange={(e) => setUploadMode(e.target.value)}
                    />
                    <span>Add New Data</span>
                </label>
                <label className="mode-option">
                    <input
                        type="radio"
                        name="uploadMode"
                        value="delete"
                        checked={uploadMode === 'delete'}
                        onChange={(e) => setUploadMode(e.target.value)}
                    />
                    <span>Delete Existing Data</span>
                </label>
            </div>

            {uploadMode === 'add' ? (
                <div className="file-upload-section">
                    <input
                        type="file"
                        id="file-input"
                        onChange={handleFileSelect}
                        accept=".csv,.xlsx,.xls"
                        className="file-input-hidden"
                    />
                    <div className="file-selection-area">
                        <label htmlFor="file-input" className="file-select-button">
                            <span className="icon">📁</span>
                            {file ? `Selected: ${file.name}` : 'Click to Select File'}
                        </label>
                        {file && (
                            <div className="selected-file-info">
                                <span className="file-name">✓ {file.name}</span>
                                <button 
                                    type="button"
                                    onClick={() => {
                                        setFile(null);
                                        const fileInput = document.getElementById('file-input');
                                        if (fileInput) fileInput.value = '';
                                        setMessage('');
                                    }}
                                    className="remove-file-btn"
                                    title="Remove file"
                                >
                                    ✕
                                </button>
                            </div>
                        )}
                    </div>
                    <button 
                        onClick={handleUpload}
                        disabled={loading}
                        className="upload-button"
                    >
                        {loading ? (
                            <>
                                Uploading... 
                                <div className="spinner" />
                            </>
                        ) : file ? (
                            <>
                                Upload File <span className="icon">⬆️</span>
                            </>
                        ) : (
                            <>
                                Select & Upload File <span className="icon">📁</span>
                            </>
                        )}
                    </button>
                </div>
            ) : (
                <div className="delete-filters">
                    <h3>Select Filters to Delete Data</h3>
                    <div className="filters-grid">
                        <div className="filter-group">
                            <label htmlFor="delete-degree">Degree *</label>
                            <select
                                id="delete-degree"
                                value={filters.degree}
                                onChange={(e) => setFilters({
                                    ...filters,
                                    degree: e.target.value,
                                    currentAY: '',
                                    semester: '',
                                    courseOfferingDept: ''
                                })}
                                disabled={loadingOptions}
                                className="filter-select"
                            >
                                <option value="">Select Degree</option>
                                {options.degrees.map(deg => (
                                    <option key={deg} value={deg}>{deg}</option>
                                ))}
                            </select>
                        </div>

                        <div className="filter-group">
                            <label htmlFor="delete-current-ay">Academic Year *</label>
                            <select
                                id="delete-current-ay"
                                value={filters.currentAY}
                                onChange={(e) => setFilters({
                                    ...filters,
                                    currentAY: e.target.value,
                                    semester: '',
                                    courseOfferingDept: ''
                                })}
                                disabled={!filters.degree || loadingOptions}
                                className="filter-select"
                            >
                                <option value="">Select Academic Year</option>
                                {options.currentAYs.map(ay => (
                                    <option key={ay} value={ay}>{ay}</option>
                                ))}
                            </select>
                        </div>

                        <div className="filter-group">
                            <label htmlFor="delete-semester">Semester *</label>
                            <select
                                id="delete-semester"
                                value={filters.semester}
                                onChange={(e) => setFilters({
                                    ...filters,
                                    semester: e.target.value,
                                    courseOfferingDept: ''
                                })}
                                disabled={!filters.currentAY || loadingOptions}
                                className="filter-select"
                            >
                                <option value="">Select Semester</option>
                                {options.semesters.map(sem => (
                                    <option key={sem} value={sem}>{sem}</option>
                                ))}
                            </select>
                        </div>

                        <div className="filter-group">
                            <label htmlFor="delete-course-offering-dept">Course Offering Department (Optional)</label>
                            <select
                                id="delete-course-offering-dept"
                                value={filters.courseOfferingDept}
                                onChange={(e) => setFilters({
                                    ...filters,
                                    courseOfferingDept: e.target.value
                                })}
                                disabled={!filters.semester || loadingOptions}
                                className="filter-select"
                            >
                                <option value="">All Departments</option>
                                {options.courseOfferingDepts.map(dept => (
                                    <option key={dept} value={dept}>{dept}</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    <button 
                        onClick={handleUpload}
                        disabled={loading || !filters.degree || !filters.currentAY || !filters.semester}
                        className="delete-button"
                    >
                        {loading ? (
                            <>
                                Deleting... 
                                <div className="spinner" />
                            </>
                        ) : (
                            <>
                                Delete Data <span className="icon">🗑️</span>
                            </>
                        )}
                    </button>
                </div>
            )}

            {loading && (
                <div className="upload-progress">
                    <div className="progress-bar" />
                </div>
            )}
            {message && (
                <p className={`selected-file ${message.includes('Success') ? 'success' : 'error'}`}>
                    {message}
                </p>
                )}
            </div>
            </main>
        </div>
    );
};

export default UploadFile;