import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import * as XLSX from 'xlsx';
import { supabase } from '../../supabaseClient';
import './index.css';

const SERVER_URL = process.env.REACT_APP_SERVER_URL || "https://iqac-demo.render.com";

const UploadFile = () => {
    const navigate = useNavigate();
    const [file, setFile] = useState(null);
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState('');
    const [uploadMode, setUploadMode] = useState('add');
    const [progress, setProgress] = useState({ current: 0, total: 0, percentage: 0 });
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
            const response = await axios.get(`${SERVER_URL}/api/analysis/degrees`);
            if (response.data && Array.isArray(response.data)) {
                setOptions(prev => ({ ...prev, degrees: response.data }));
            }
        } catch (error) {
            console.error('Error fetching degrees:', error);
            setMessage('Error: Failed to load degrees');
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

    // Helper function to clean and validate string values
    const cleanString = (value) => {
        if (!value) return null;
        const cleaned = value.toString().trim();
        if (cleaned === '' || cleaned.toUpperCase() === 'NULL') return null;
        return cleaned;
    };

    // Helper function to parse integer or return null
    const parseIntOrNull = (val) => {
        if (val === null || val === undefined || val === "" || val === "NULL") return null;
        const n = parseInt(val, 10);
        return isNaN(n) ? null : n;
    };

    // Helper function to find column value with multiple possible names
    const getColumnValue = (row, possibleNames) => {
        const normalize = (str) => {
            if (!str) return '';
            return str.toString().toLowerCase().replace(/[\s_-]+/g, '').trim();
        };
        
        for (const name of possibleNames) {
            if (row[name] !== undefined && row[name] !== null && row[name] !== '') {
                return row[name];
            }
            
            const normalizedName = normalize(name);
            const foundKey = Object.keys(row).find(
                key => normalize(key) === normalizedName
            );
            
            if (foundKey && row[foundKey] !== undefined && row[foundKey] !== null && row[foundKey] !== '') {
                return row[foundKey];
            }
        }
        return null;
    };

    // Parse Excel file in browser
    const parseExcelFile = (file) => {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const data = new Uint8Array(e.target.result);
                    const workbook = XLSX.read(data, { type: 'array' });
                    const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
                    const rows = XLSX.utils.sheet_to_json(firstSheet);
                    resolve(rows);
                } catch (error) {
                    reject(error);
                }
            };
            reader.onerror = (error) => reject(error);
            reader.readAsArrayBuffer(file);
        });
    };

    // Transform row to database format
    const transformRow = (r) => {
        return {
            dept: cleanString(getColumnValue(r, ['dept', 'department', 'dept_name'])),
            degree: cleanString(getColumnValue(r, ['degree', 'degree_name'])),
            ug_or_pg: cleanString(getColumnValue(r, ['ug_or_pg', 'ug or pg', 'ug/pg', 'ug_or_pg'])),
            arts_or_engg: cleanString(getColumnValue(r, ['arts_or_engg', 'arts or engg', 'arts/engg', 'arts_or_engg'])),
            short_form: cleanString(getColumnValue(r, ['short_form', 'short form', 'shortform'])),
            batch: cleanString(getColumnValue(r, ['batch', 'batch_year', 'year'])),
            sec: cleanString(getColumnValue(r, ['sec', 'section', 'sec_name'])),
            current_ay: cleanString(getColumnValue(r, ['Current AY', 'current_ay', 'current ay', 'academic_year', 'academic year', 'ay'])),
            semester: cleanString(getColumnValue(r, ['Semester', 'semester', 'sem', 'semester_number'])),
            course_code: cleanString(getColumnValue(r, ['course_code', 'course code', 'coursecode', 'code'])),
            course_offering_dept_name: cleanString(getColumnValue(r, ['course offereing_dept_name', 'course offereing dept name', 'course_offering_dept_name', 'course_offering_dept', 'course offering dept name', 'course offering dept', 'offering_dept', 'offering dept', 'course_dept', 'course dept', 'offering_dept_name'])),
            course_name: cleanString(getColumnValue(r, ['course_name', 'course name', 'coursename', 'subject', 'subject_name'])),
            staff_id: cleanString(getColumnValue(r, ['staff_id', 'staff id', 'staffid', 'staff_id'])),
            staffid: cleanString(getColumnValue(r, ['staffid', 'staff id', 'staff_id', 'staffid'])),
            faculty_name: cleanString(getColumnValue(r, ['faculty_name', 'faculty name', 'facultyname', 'staff_name', 'staff name', 'name', 'teacher_name', 'teacher name'])),
            mobile_no: cleanString(getColumnValue(r, ['mobile_no', 'mobile no', 'mobileno', 'mobile', 'phone', 'phone_no', 'phone no'])),
            grp: cleanString(getColumnValue(r, ['grp', 'group', 'group_name', 'group name'])),
            qn1: parseIntOrNull(getColumnValue(r, ['qn1', 'q1', 'question1', 'question 1'])),
            qn2: parseIntOrNull(getColumnValue(r, ['qn2', 'q2', 'question2', 'question 2'])),
            qn3: parseIntOrNull(getColumnValue(r, ['qn3', 'q3', 'question3', 'question 3'])),
            qn4: parseIntOrNull(getColumnValue(r, ['qn4', 'q4', 'question4', 'question 4'])),
            qn5: parseIntOrNull(getColumnValue(r, ['qn5', 'q5', 'question5', 'question 5'])),
            qn6: parseIntOrNull(getColumnValue(r, ['qn6', 'q6', 'question6', 'question 6'])),
            qn7: parseIntOrNull(getColumnValue(r, ['qn7', 'q7', 'question7', 'question 7'])),
            qn8: parseIntOrNull(getColumnValue(r, ['qn8', 'q8', 'question8', 'question 8'])),
            qn9: parseIntOrNull(getColumnValue(r, ['qn9', 'q9', 'question9', 'question 9'])),
            qn10: parseIntOrNull(getColumnValue(r, ['qn10', 'q10', 'question10', 'question 10'])),
            qn11: parseIntOrNull(getColumnValue(r, ['qn11', 'q11', 'question11', 'question 11'])),
            qn12: parseIntOrNull(getColumnValue(r, ['qn12', 'q12', 'question12', 'question 12'])),
            qn13: parseIntOrNull(getColumnValue(r, ['qn13', 'q13', 'question13', 'question 13'])),
            qn14: parseIntOrNull(getColumnValue(r, ['qn14', 'q14', 'question14', 'question 14'])),
            qn15: parseIntOrNull(getColumnValue(r, ['qn15', 'q15', 'question15', 'question 15'])),
            qn16: parseIntOrNull(getColumnValue(r, ['qn16', 'q16', 'question16', 'question 16'])),
            qn17: parseIntOrNull(getColumnValue(r, ['qn17', 'q17', 'question17', 'question 17'])),
            qn18: parseIntOrNull(getColumnValue(r, ['qn18', 'q18', 'question18', 'question 18'])),
            qn19: parseIntOrNull(getColumnValue(r, ['qn19', 'q19', 'question19', 'question 19'])),
            qn20: parseIntOrNull(getColumnValue(r, ['qn20', 'q20', 'question20', 'question 20'])),
            qn21: parseIntOrNull(getColumnValue(r, ['qn21', 'q21', 'question21', 'question 21'])),
            qn22: parseIntOrNull(getColumnValue(r, ['qn22', 'q22', 'question22', 'question 22'])),
            qn23: parseIntOrNull(getColumnValue(r, ['qn23', 'q23', 'question23', 'question 23'])),
            qn24: parseIntOrNull(getColumnValue(r, ['qn24', 'q24', 'question24', 'question 24'])),
            qn25: parseIntOrNull(getColumnValue(r, ['qn25', 'q25', 'question25', 'question 25'])),
            qn26: parseIntOrNull(getColumnValue(r, ['qn26', 'q26', 'question26', 'question 26'])),
            qn27: parseIntOrNull(getColumnValue(r, ['qn27', 'q27', 'question27', 'question 27'])),
            qn28: parseIntOrNull(getColumnValue(r, ['qn28', 'q28', 'question28', 'question 28'])),
            qn29: parseIntOrNull(getColumnValue(r, ['qn29', 'q29', 'question29', 'question 29'])),
            qn30: parseIntOrNull(getColumnValue(r, ['qn30', 'q30', 'question30', 'question 30'])),
            qn31: parseIntOrNull(getColumnValue(r, ['qn31', 'q31', 'question31', 'question 31'])),
            qn32: parseIntOrNull(getColumnValue(r, ['qn32', 'q32', 'question32', 'question 32'])),
            qn33: parseIntOrNull(getColumnValue(r, ['qn33', 'q33', 'question33', 'question 33'])),
            qn34: parseIntOrNull(getColumnValue(r, ['qn34', 'q34', 'question34', 'question 34'])),
            qn35: parseIntOrNull(getColumnValue(r, ['qn35', 'q35', 'question35', 'question 35'])),
            comment: cleanString(getColumnValue(r, ['comment', 'comments', 'remarks', 'feedback', 'open_comments', 'open comments']))
        };
    };

    // Upload data in chunks to Supabase
    const uploadDataInChunks = async (rows) => {
        const CHUNK_SIZE = 1000; // Upload 1000 records at a time
        const totalRecords = rows.length;
        let insertedCount = 0;
        let failedCount = 0;
        const errors = [];

        setProgress({ current: 0, total: totalRecords, percentage: 0 });

        for (let i = 0; i < totalRecords; i += CHUNK_SIZE) {
            const chunk = rows.slice(i, i + CHUNK_SIZE);
            const transformedChunk = chunk.map(transformRow);

            try {
                const { data, error } = await supabase
                    .from('course_feedback_new')
                    .insert(transformedChunk);

                if (error) {
                    console.error('Chunk insert error:', error);
                    failedCount += chunk.length;
                    errors.push({ chunk: i / CHUNK_SIZE + 1, error: error.message });
                } else {
                    insertedCount += chunk.length;
                }
            } catch (error) {
                console.error('Chunk upload error:', error);
                failedCount += chunk.length;
                errors.push({ chunk: i / CHUNK_SIZE + 1, error: error.message });
            }

            // Update progress
            const currentProgress = Math.min(i + CHUNK_SIZE, totalRecords);
            const percentage = Math.floor((currentProgress / totalRecords) * 100);
            setProgress({ current: currentProgress, total: totalRecords, percentage });
        }

        return { insertedCount, failedCount, errors, totalRecords };
    };

    const handleUpload = async () => {
        if (uploadMode === 'delete') {
            // Validate filters for delete mode
            if (!filters.degree || !filters.currentAY || !filters.semester) {
                setMessage('Error: Please select all required filters (Degree, Academic Year, Semester)');
                return;
            }

            setLoading(true);
            const formData = new FormData();
            formData.append('mode', 'delete');
            formData.append('degree', filters.degree);
            formData.append('currentAY', filters.currentAY);
            formData.append('semester', filters.semester);
            if (filters.courseOfferingDept) {
                formData.append('courseOfferingDept', filters.courseOfferingDept);
            }

            try {
                const response = await axios.post(`${SERVER_URL}/api/upload/delete`, formData, {
                    headers: {
                        'Content-Type': 'multipart/form-data'
                    }
                });

                if (response.data.success) {
                    setMessage(`Success! Deleted ${response.data.count} records from course feedback database.`);
                    alert(`Delete successful! ${response.data.count} records deleted from database.`);
                    setFilters({ degree: '', currentAY: '', semester: '', courseOfferingDept: '' });
                } else {
                    setMessage('Delete failed: ' + response.data.message);
                    alert('Delete failed: ' + response.data.message);
                }
            } catch (error) {
                console.error('Delete error:', error);
                setMessage('Error: ' + (error.response?.data?.message || error.message));
                alert('Error: ' + (error.response?.data?.message || error.message));
            } finally {
                setLoading(false);
            }
        } else {
            // Add mode - Direct Supabase upload
            if (!file) {
                handleFileInputClick();
                setMessage('Please select a file to upload');
                return;
            }

            setLoading(true);
            setMessage('Parsing Excel file...');

            try {
                console.log('Parsing file:', file.name);
                const rows = await parseExcelFile(file);
                console.log(`Parsed ${rows.length} rows from Excel`);

                if (!rows || rows.length === 0) {
                    throw new Error('No data found in file');
                }

                setMessage(`Uploading ${rows.length} records directly to database...`);
                const result = await uploadDataInChunks(rows);

                if (result.insertedCount > 0) {
                    let successMessage = `Success! Uploaded ${result.insertedCount} records to database.`;
                    
                    if (result.failedCount > 0) {
                        successMessage += `\n\nWarning: ${result.failedCount} records failed to upload.`;
                        if (result.errors.length > 0) {
                            successMessage += '\n\nError details:';
                            result.errors.slice(0, 5).forEach(err => {
                                successMessage += `\nChunk ${err.chunk}: ${err.error}`;
                            });
                        }
                    }

                    setMessage(successMessage);
                    alert(successMessage);
                    setFile(null);
                    const fileInput = document.querySelector('input[type="file"]');
                    if (fileInput) fileInput.value = '';
                } else {
                    throw new Error('No records were uploaded successfully');
                }
            } catch (error) {
                console.error('Upload error:', error);
                setMessage('Error: ' + error.message);
                alert('Upload error: ' + error.message);
            } finally {
                setLoading(false);
                setProgress({ current: 0, total: 0, percentage: 0 });
            }
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
                <p className="page-description">
                    Upload new feedback data or delete existing data based on filters
                    <br />
                    <small style={{ color: '#666' }}>⚡ Fast direct upload - processes 100k+ records in 30-40 seconds</small>
                </p>
                
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

                            {loading && progress.total > 0 && (
                                <div className="upload-progress">
                                    <div className="progress-info">
                                        <span>Uploading: {progress.current.toLocaleString()} / {progress.total.toLocaleString()} records</span>
                                        <span>{progress.percentage}%</span>
                                    </div>
                                    <div className="progress-bar-container">
                                        <div 
                                            className="progress-bar-fill" 
                                            style={{ width: `${progress.percentage}%` }}
                                        />
                                    </div>
                                </div>
                            )}
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
