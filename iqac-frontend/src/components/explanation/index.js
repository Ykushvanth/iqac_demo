import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import './index.css';

const SERVER_URL = process.env.REACT_APP_SERVER_URL || "https://iqac-demo.onrender.com";

const Explanation = () => {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [filters, setFilters] = useState({
    currentAY: '',
    semester: '',
    department: ''
  });
  const [options, setOptions] = useState({
    currentAYs: [],
    semesters: [],
    departments: []
  });
  const [lowPerformanceFaculty, setLowPerformanceFaculty] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadingFaculty, setLoadingFaculty] = useState(false);
  const [error, setError] = useState(null);
  const [explanationsModalOpen, setExplanationsModalOpen] = useState(false);
  const [selectedFaculty, setSelectedFaculty] = useState(null);
  const [explanations, setExplanations] = useState([]);
  const [loadingExplanations, setLoadingExplanations] = useState(false);
  const [explanationsError, setExplanationsError] = useState(null);
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [uploadFile, setUploadFile] = useState(null);
  const [uploadNotes, setUploadNotes] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState(null);
  const [uploadSuccess, setUploadSuccess] = useState(null);
  const [flashMessage, setFlashMessage] = useState(null);
  const [uploadedMap, setUploadedMap] = useState(() => new Set());

  const isHoD = user?.role === 'HoD';
  const isDean = user?.role === 'Dean';
  const isAdmin = user?.role === 'Admin';

  // Load user on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem('user');
      if (stored) {
        const parsed = JSON.parse(stored);
        setUser(parsed);
        console.log('User loaded:', parsed);
        // Auto-set department for HoD
        if (parsed?.role === 'HoD' && parsed?.department) {
          console.log('Setting department for HoD:', parsed.department);
          setFilters(prev => {
            // Only update if department is not already set or different
            if (prev.department !== parsed.department) {
              return {
                ...prev,
                department: parsed.department
              };
            }
            return prev;
          });
        }
      }
    } catch (e) {
      console.error('Error parsing user:', e);
    }
  }, []);

  // Fetch initial options
  useEffect(() => {
    if (isHoD && user?.department) {
      fetchHoDCurrentAY();
    } else if (isDean && user?.school) {
      fetchDeanCurrentAY();
    } else if (isAdmin) {
      fetchAdminCurrentAY();
    }
  }, [isHoD, isDean, isAdmin, user]);

  // Fetch semesters when AY changes
  useEffect(() => {
    if (filters.currentAY) {
      if (isHoD && user?.department) {
        fetchHoDSemesters(filters.currentAY);
      } else if (isDean && user?.school) {
        fetchDeanSemesters(filters.currentAY);
      } else if (isAdmin) {
        fetchAdminSemesters(filters.currentAY);
      }
    } else {
      setOptions(prev => ({ ...prev, semesters: [] }));
    }
  }, [filters.currentAY, isHoD, isDean, isAdmin, user]);

  // Fetch departments for Dean/Admin when semester is selected
  useEffect(() => {
    if (filters.semester && filters.currentAY) {
      if (isDean && user?.school) {
        fetchDeanDepartments(filters.currentAY, filters.semester);
      } else if (isAdmin) {
        fetchAdminDepartments(filters.currentAY, filters.semester);
      }
    } else {
      setOptions(prev => ({ ...prev, departments: [] }));
    }
  }, [filters.semester, filters.currentAY, isDean, isAdmin, user]);

  // HoD: Fetch current AY
  const fetchHoDCurrentAY = async () => {
    if (!user?.department) return;
    try {
      const params = new URLSearchParams({ department: user.department });
      const response = await fetch(`${SERVER_URL}/api/analysis/hod/current-ay?${params.toString()}`);
      const data = await response.json();
      setOptions(prev => ({ ...prev, currentAYs: Array.isArray(data) ? data : [] }));
    } catch (error) {
      console.error('Error fetching HoD current AY:', error);
      setOptions(prev => ({ ...prev, currentAYs: [] }));
    }
  };

  // HoD: Fetch semesters
  const fetchHoDSemesters = async (currentAY) => {
    if (!user?.department || !currentAY) return;
    try {
      const params = new URLSearchParams({
        department: user.department,
        currentAY
      });
      const response = await fetch(`${SERVER_URL}/api/analysis/hod/semesters?${params.toString()}`);
      const data = await response.json();
      setOptions(prev => ({ ...prev, semesters: Array.isArray(data) ? data : [] }));
    } catch (error) {
      console.error('Error fetching HoD semesters:', error);
      setOptions(prev => ({ ...prev, semesters: [] }));
    }
  };

  // Dean: Fetch current AY
  const fetchDeanCurrentAY = async () => {
    if (!user?.school) return;
    try {
      const params = new URLSearchParams({ school: user.school });
      const response = await fetch(`${SERVER_URL}/api/analysis/dean/current-ay?${params.toString()}`);
      const data = await response.json();
      setOptions(prev => ({ ...prev, currentAYs: Array.isArray(data) ? data : [] }));
    } catch (error) {
      console.error('Error fetching Dean current AY:', error);
      setOptions(prev => ({ ...prev, currentAYs: [] }));
    }
  };

  // Dean: Fetch semesters
  const fetchDeanSemesters = async (currentAY) => {
    if (!user?.school || !currentAY) return;
    try {
      const params = new URLSearchParams({
        school: user.school,
        currentAY
      });
      const response = await fetch(`${SERVER_URL}/api/analysis/dean/semesters?${params.toString()}`);
      const data = await response.json();
      setOptions(prev => ({ ...prev, semesters: Array.isArray(data) ? data : [] }));
    } catch (error) {
      console.error('Error fetching Dean semesters:', error);
      setOptions(prev => ({ ...prev, semesters: [] }));
    }
  };

  // Dean: Fetch departments
  const fetchDeanDepartments = async (currentAY, semester) => {
    if (!user?.school || !currentAY || !semester) return;
    try {
      const params = new URLSearchParams({
        school: user.school,
        currentAY,
        semester
      });
      const response = await fetch(`${SERVER_URL}/api/analysis/dean/departments?${params.toString()}`);
      const data = await response.json();
      let depts = Array.isArray(data) ? data : [];
      setOptions(prev => ({ ...prev, departments: depts }));
    } catch (error) {
      console.error('Error fetching Dean departments:', error);
      setOptions(prev => ({ ...prev, departments: [] }));
    }
  };

  // Admin: Fetch all current AYs
  const fetchAdminCurrentAY = async () => {
    try {
      const response = await fetch(`${SERVER_URL}/api/analysis/current-ay`);
      const data = await response.json();
      setOptions(prev => ({ ...prev, currentAYs: Array.isArray(data) ? data : [] }));
    } catch (error) {
      console.error('Error fetching current AY:', error);
      setOptions(prev => ({ ...prev, currentAYs: [] }));
    }
  };

  // Admin: Fetch semesters
  const fetchAdminSemesters = async (currentAY) => {
    if (!currentAY) return;
    try {
      const params = new URLSearchParams({ currentAY });
      const response = await fetch(`${SERVER_URL}/api/analysis/semesters?${params.toString()}`);
      const data = await response.json();
      setOptions(prev => ({ ...prev, semesters: Array.isArray(data) ? data : [] }));
    } catch (error) {
      console.error('Error fetching semesters:', error);
      setOptions(prev => ({ ...prev, semesters: [] }));
    }
  };

  // Admin: Fetch departments
  const fetchAdminDepartments = async (currentAY, semester) => {
    if (!currentAY || !semester) return;
    try {
      const params = new URLSearchParams({ currentAY, semester });
      const response = await fetch(`${SERVER_URL}/api/analysis/course-offering-depts?${params.toString()}`);
      const data = await response.json();
      setOptions(prev => ({ ...prev, departments: Array.isArray(data) ? data : [] }));
    } catch (error) {
      console.error('Error fetching departments:', error);
      setOptions(prev => ({ ...prev, departments: [] }));
    }
  };

  // Fetch faculty with <80% performance
  const fetchLowPerformanceFaculty = async () => {
    console.log('Fetch button clicked', { filters, user });
    
    // For HoD, use user.department if filters.department is not set
    const department = isHoD && !filters.department && user?.department 
      ? user.department 
      : filters.department;
    
    if (!filters.currentAY || !filters.semester || !department) {
      const missing = [];
      if (!filters.currentAY) missing.push('Academic Year');
      if (!filters.semester) missing.push('Semester');
      if (!department) missing.push('Department');
      setError(`Please select: ${missing.join(', ')}`);
      return;
    }

    setLoadingFaculty(true);
    setError(null);
    setLowPerformanceFaculty([]);

    try {
      const params = new URLSearchParams({
        current_ay: filters.currentAY,
        semester: filters.semester,
        department: department
      });

      console.log('Fetching faculty with params:', params.toString());
      const response = await fetch(`${SERVER_URL}/api/explanations/faculty-low-performance?${params.toString()}`);
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error('Response error:', response.status, errorText);
        throw new Error(`Server error: ${response.status} - ${errorText}`);
      }
      
      const data = await response.json();
      console.log('Response data:', data);

      if (data.success) {
        setLowPerformanceFaculty(data.faculty || []);
        // After we have the faculty list, fetch existing explanations to mark uploaded ones
        fetchExistingExplanations(department, filters.currentAY, filters.semester);
        if (data.count === 0) {
          setError('No faculty found with performance < 80% for the selected filters');
        } else {
          setError(null); // Clear any previous errors
        }
      } else {
        setError(data.error || 'Failed to fetch faculty data');
      }
    } catch (error) {
      console.error('Error fetching low performance faculty:', error);
      setError(`Error fetching faculty data: ${error.message}. Please check console for details.`);
    } finally {
      setLoadingFaculty(false);
    }
  };

  // Fetch existing explanations for current filters to mark uploaded rows
  const fetchExistingExplanations = async (department, currentAY, semester) => {
    if (!department || !currentAY || !semester) return;
    try {
      const params = new URLSearchParams({
        department,
        current_ay: currentAY,
        semester
      });
      const response = await fetch(`${SERVER_URL}/api/explanations?${params.toString()}`);
      if (!response.ok) return;
      const data = await response.json();
      if (data.success && Array.isArray(data.documents)) {
        const next = new Set();
        data.documents.forEach((doc) => {
          const key = `${doc.staff_id || doc.staffid || ''}_${doc.course_code || ''}`.trim();
          if (key) next.add(key);
        });
        setUploadedMap(next);
      }
    } catch (err) {
      console.error('Error fetching existing explanations:', err);
    }
  };

  // Fetch explanations for selected faculty (Dean/Admin)
  const openExplanationsModal = async (faculty) => {
    if (!faculty) return;

    setSelectedFaculty(faculty);
    setExplanations([]);
    setExplanationsError(null);
    setLoadingExplanations(true);
    setExplanationsModalOpen(true);

    try {
      const effectiveDepartment = isHoD && user?.department ? user.department : filters.department;

      const params = new URLSearchParams({
        department: effectiveDepartment || '',
        current_ay: filters.currentAY || '',
        semester: filters.semester || '',
        course_code: faculty.course_code || '',
        staff_id: faculty.staffid || faculty.staff_id || ''
      });

      console.log('Fetching explanations with params:', params.toString());

      const response = await fetch(`${SERVER_URL}/api/explanations?${params.toString()}`);
      if (!response.ok) {
        const text = await response.text();
        throw new Error(`Server error: ${response.status} - ${text}`);
      }

      const data = await response.json();
      if (data.success) {
        setExplanations(data.documents || []);
      } else {
        setExplanationsError(data.error || 'Failed to fetch explanations');
      }
    } catch (err) {
      console.error('Error fetching explanations:', err);
      setExplanationsError(err.message || 'Error fetching explanations');
    } finally {
      setLoadingExplanations(false);
    }
  };

  // Open upload modal for HoD
  const openUploadModal = (faculty) => {
    setSelectedFaculty(faculty);
    setUploadFile(null);
    setUploadNotes('');
    setUploadError(null);
    setUploadSuccess(null);
    setUploadModalOpen(true);
  };

  // Handle upload submit
  const handleUpload = async (e) => {
    e.preventDefault();
    if (!selectedFaculty) {
      setUploadError('No faculty selected.');
      return;
    }
    if (!uploadFile) {
      setUploadError('Please select a file (jpg, png, gif, pdf).');
      return;
    }
    setUploading(true);
    setUploadError(null);
    setUploadSuccess(null);

    try {
      const formData = new FormData();
      formData.append('file', uploadFile);
      formData.append('uploaded_by_user_id', user?.id || user?.user_id || '');
      formData.append('uploaded_by_name', user?.name || user?.username || '');
      formData.append('department', user?.department || selectedFaculty.course_offering_dept || '');
      formData.append('school', user?.school || '');
      formData.append('current_ay', filters.currentAY || selectedFaculty.current_ay || '');
      formData.append('semester', filters.semester || selectedFaculty.semester || '');
      formData.append('course_offering_dept', selectedFaculty.course_offering_dept || user?.department || '');
      formData.append('course_code', selectedFaculty.course_code || '');
      formData.append('course_name', selectedFaculty.course_name || '');
      formData.append('staff_id', selectedFaculty.staffid || selectedFaculty.staff_id || '');
      formData.append('staff_name', selectedFaculty.faculty_name || '');
      formData.append('overall_percentage', selectedFaculty.overall_percentage ?? '');
      formData.append('performance_category', 'department');
      if (uploadNotes) {
        formData.append('explanation_text', uploadNotes);
      }

      const response = await fetch(`${SERVER_URL}/api/explanations/upload`, {
        method: 'POST',
        body: formData
      });

      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.error || data.message || `Upload failed with status ${response.status}`);
      }

      setUploadSuccess('Uploaded successfully');
      setFlashMessage(`Explanation uploaded for ${selectedFaculty.faculty_name || 'faculty'}`);
      const key = `${selectedFaculty.staffid || selectedFaculty.staff_id || ''}_${selectedFaculty.course_code || ''}`;
      setUploadedMap((prev) => {
        const next = new Set(prev);
        next.add(key);
        return next;
      });
      setTimeout(() => {
        setUploadModalOpen(false);
        setUploadSuccess(null);
        // Auto-clear flash after a few seconds
        setTimeout(() => setFlashMessage(null), 4000);
      }, 800);
    } catch (err) {
      console.error('Upload error:', err);
      setUploadError(err.message || 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('user');
    navigate('/login');
  };

  if (!user || (!isHoD && !isDean && !isAdmin)) {
    return (
      <div className="explanation-page">
        <h2>Access Restricted</h2>
        <p>This page is only available to HoD, Dean, or Admin users.</p>
      </div>
    );
  }

  return (
    <div className="explanation-page">
      <header className="explanation-header">
        <div className="header-content">
          <h1>Explanation Documents</h1>
          <p className="subtitle">Upload or review explanation documents for faculty with performance &lt; 80%</p>
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

      <main className="explanation-main">
        {flashMessage && (
          <div className="success-message">
            {flashMessage}
          </div>
        )}
        <div className="filters-section">
          <h2>Select Filters</h2>
          <div className="filters-grid">
            <div className="filter-group">
              <label>Current Academic Year</label>
              <select
                value={filters.currentAY}
                onChange={(e) => setFilters({
                  ...filters,
                  currentAY: e.target.value,
                  semester: '',
                  department: ''
                })}
              >
                <option value="">Select Academic Year</option>
                {options.currentAYs.map(ay => (
                  <option key={ay} value={ay}>{ay}</option>
                ))}
              </select>
            </div>

            <div className="filter-group">
              <label>Semester</label>
              <select
                value={filters.semester}
                onChange={(e) => setFilters({
                  ...filters,
                  semester: e.target.value,
                  department: isHoD ? filters.department : ''
                })}
                disabled={!filters.currentAY}
              >
                <option value="">Select Semester</option>
                {options.semesters.map(sem => (
                  <option key={sem} value={sem}>{sem}</option>
                ))}
              </select>
            </div>

            {!isHoD && (
              <div className="filter-group">
                <label>Department</label>
                <select
                  value={filters.department}
                  onChange={(e) => setFilters({
                    ...filters,
                    department: e.target.value
                  })}
                  disabled={!filters.semester}
                >
                  <option value="">Select Department</option>
                  {options.departments.map(dept => (
                    <option key={dept} value={dept}>{dept}</option>
                  ))}
                </select>
              </div>
            )}

            {isHoD && (
              <div className="filter-group">
                <label>Department</label>
                <input
                  type="text"
                  value={filters.department || user?.department || ''}
                  disabled
                  className="disabled-input"
                  readOnly
                />
              </div>
            )}

            <div className="filter-group">
              <button
                className="fetch-btn"
                onClick={(e) => {
                  e.preventDefault();
                  console.log('Button clicked, current filters:', filters);
                  fetchLowPerformanceFaculty();
                }}
                disabled={
                  !filters.currentAY || 
                  !filters.semester || 
                  (!filters.department && !(isHoD && user?.department)) || 
                  loadingFaculty
                }
              >
                {loadingFaculty ? 'Loading...' : 'Fetch Faculty'}
              </button>
            </div>
          </div>
          
        </div>

        {error && (
          <div className="error-message">
            {error}
          </div>
        )}

        {lowPerformanceFaculty.length > 0 && (
          <div className="faculty-list-section">
            <h2>Faculty with Performance &lt; 80% ({lowPerformanceFaculty.length})</h2>
            <div className="faculty-table-container">
              <table className="faculty-table">
                <thead>
                  <tr>
                    <th>Faculty Name</th>
                    <th>Staff ID</th>
                    <th>Course Code</th>
                    <th>Course Name</th>
                    <th>Performance %</th>
                    <th>Total Responses</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {lowPerformanceFaculty.map((faculty, index) => (
                    <tr key={`${faculty.staffid}_${faculty.course_code}_${index}`}>
                      <td>{faculty.faculty_name}</td>
                      <td>{faculty.staffid || faculty.staff_id}</td>
                      <td>{faculty.course_code}</td>
                      <td>{faculty.course_name}</td>
                      <td className={`percentage ${faculty.overall_percentage < 60 ? 'critical' : 'warning'}`}>
                        {faculty.overall_percentage}%
                      </td>
                      <td>{faculty.total_responses}</td>
                      <td>
                        {isHoD && (
                          <button
                            className="upload-btn"
                            onClick={() => openUploadModal(faculty)}
                            disabled={
                              uploading ||
                              uploadedMap.has(`${faculty.staffid || faculty.staff_id || ''}_${faculty.course_code || ''}`)
                            }
                          >
                            {uploadedMap.has(`${faculty.staffid || faculty.staff_id || ''}_${faculty.course_code || ''}`)
                              ? 'Uploaded'
                              : 'Upload Explanation'}
                          </button>
                        )}
                        {(isDean || isAdmin) && (
                          <button
                            className="view-btn"
                            onClick={() => openExplanationsModal(faculty)}
                          >
                            View Explanations
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
        {explanationsModalOpen && (
          <div className="explanations-modal-overlay" onClick={() => setExplanationsModalOpen(false)}>
            <div className="explanations-modal" onClick={(e) => e.stopPropagation()}>
              <div className="explanations-modal-header">
                <h3>Explanation Documents</h3>
                <button
                  className="modal-close-btn"
                  onClick={() => setExplanationsModalOpen(false)}
                >
                  ×
                </button>
              </div>
              {selectedFaculty && (
                <div className="explanations-meta">
                  <div><strong>Faculty:</strong> {selectedFaculty.faculty_name} ({selectedFaculty.staffid || selectedFaculty.staff_id})</div>
                  <div><strong>Course:</strong> {selectedFaculty.course_code} - {selectedFaculty.course_name}</div>
                  <div><strong>AY / Sem:</strong> {selectedFaculty.current_ay || filters.currentAY} / {selectedFaculty.semester || filters.semester}</div>
                  <div><strong>Department:</strong> {selectedFaculty.course_offering_dept || filters.department || user?.department}</div>
                </div>
              )}
              {loadingExplanations && (
                <div className="explanations-loading">Loading explanations...</div>
              )}
              {explanationsError && !loadingExplanations && (
                <div className="explanations-error">{explanationsError}</div>
              )}
              {!loadingExplanations && !explanationsError && explanations.length === 0 && (
                <div className="explanations-empty">
                  No explanation documents found for this faculty/course.
                </div>
              )}
              {!loadingExplanations && explanations.length > 0 && (
                <div className="explanations-list">
                  <table>
                    <thead>
                      <tr>
                        <th>Uploaded By</th>
                        <th>Uploaded On</th>
                        <th>Overall %</th>
                        <th>Type</th>
                        <th>Notes</th>
                        <th>File</th>
                      </tr>
                    </thead>
                    <tbody>
                      {explanations.map((doc) => (
                        <tr key={doc.id}>
                          <td>{doc.uploaded_by_name || doc.uploaded_by_user_id}</td>
                          <td>{doc.created_at ? new Date(doc.created_at).toLocaleString() : '—'}</td>
                          <td>{doc.overall_percentage != null ? `${doc.overall_percentage}%` : '—'}</td>
                          <td>{doc.file_type || '—'}</td>
                          <td className="explanations-notes">
                            {doc.explanation_text || <span className="muted">No text</span>}
                          </td>
                          <td>
                            <button
                              className="view-file-btn"
                              onClick={() => {
                                window.open(`${SERVER_URL}/api/explanations/${doc.id}/file`, '_blank');
                              }}
                            >
                              View File
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {uploadModalOpen && (
          <div className="explanations-modal-overlay" onClick={() => setUploadModalOpen(false)}>
            <div className="explanations-modal" onClick={(e) => e.stopPropagation()}>
              <div className="explanations-modal-header">
                <h3>Upload Explanation</h3>
                <button
                  className="modal-close-btn"
                  onClick={() => setUploadModalOpen(false)}
                >
                  ×
                </button>
              </div>
              {selectedFaculty && (
                <div className="explanations-meta">
                  <div><strong>Faculty:</strong> {selectedFaculty.faculty_name} ({selectedFaculty.staffid || selectedFaculty.staff_id})</div>
                  <div><strong>Course:</strong> {selectedFaculty.course_code} - {selectedFaculty.course_name}</div>
                  <div><strong>AY / Sem:</strong> {selectedFaculty.current_ay || filters.currentAY} / {selectedFaculty.semester || filters.semester}</div>
                  <div><strong>Department:</strong> {selectedFaculty.course_offering_dept || filters.department || user?.department}</div>
                  <div><strong>Overall %:</strong> {selectedFaculty.overall_percentage != null ? `${selectedFaculty.overall_percentage}%` : '—'}</div>
                </div>
              )}
              <form className="upload-form" onSubmit={handleUpload}>
                <label className="upload-label">
                  File (jpg, png, gif, pdf)
                  <input
                    type="file"
                    accept="image/jpeg,image/jpg,image/png,image/gif,application/pdf"
                    onChange={(e) => setUploadFile(e.target.files?.[0] || null)}
                  />
                </label>
                <label className="upload-label">
                  Notes (optional)
                  <textarea
                    rows="3"
                    value={uploadNotes}
                    onChange={(e) => setUploadNotes(e.target.value)}
                    placeholder="Add explanation text (optional)"
                  />
                </label>
                {uploadError && <div className="explanations-error">{uploadError}</div>}
                {uploadSuccess && <div className="upload-success">{uploadSuccess}</div>}
                <div className="upload-actions">
                  <button
                    type="button"
                    className="modal-close-btn bordered"
                    onClick={() => setUploadModalOpen(false)}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="view-file-btn"
                    disabled={uploading}
                  >
                    {uploading ? 'Uploading...' : 'Upload'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default Explanation;
