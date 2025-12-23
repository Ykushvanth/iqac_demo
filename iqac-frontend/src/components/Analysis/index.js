import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import './index.css';
const SERVER_URL = process.env.REACT_APP_SERVER_URL || "https://iqac-repo3.onrender.com";

const Analysis = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const [currentUser, setCurrentUser] = useState(null);
    const [allowedDepts, setAllowedDepts] = useState([]);
    const [filters, setFilters] = useState({
        degree: '',
        currentAY: '',
        semester: '',
        courseOfferingDept: '',
        course: ''
    });
    
    const [options, setOptions] = useState({
        degrees: [],
        currentAYs: [],
        semesters: [],
        courseOfferingDepts: [],
        courses: []
    });

    const [reportFormat, setReportFormat] = useState('excel');
    const [faculty, setFaculty] = useState([]);
    const [staffIdSearch, setStaffIdSearch] = useState('');
    const [loadingAnalysis, setLoadingAnalysis] = useState(false);
    const [loadingDeptReport, setLoadingDeptReport] = useState(false);
    const [loadingNegativeCommentsExcel, setLoadingNegativeCommentsExcel] = useState(false);
    const [selectedBatch, setSelectedBatch] = useState('all'); // For batch filtering in reports
    const [isRestoring, setIsRestoring] = useState(false); // Flag to prevent reset during restoration
    const prevLocationRef = useRef(location.pathname); // Track previous location
    const hasRestoredRef = useRef(false); // Track if we've restored on this mount
    const isRestoringRef = useRef(false); // Ref to track restoration state (more reliable than state)
    const prevCourseRef = useRef(''); // Track previous course to detect changes

    const isDean = currentUser?.role === 'Dean';
    const isHoD = currentUser?.role === 'HoD';

    // Cache helper functions
    const CACHE_PREFIX = 'analysis_cache_';
    const CACHE_EXPIRY = 24 * 60 * 60 * 1000; // 24 hours in milliseconds

    const getCache = (key) => {
        try {
            const cached = localStorage.getItem(CACHE_PREFIX + key);
            if (!cached) return null;
            
            const { data, timestamp } = JSON.parse(cached);
            const now = Date.now();
            
            // Check if cache is expired
            if (now - timestamp > CACHE_EXPIRY) {
                localStorage.removeItem(CACHE_PREFIX + key);
                return null;
            }
            
            return data;
        } catch (error) {
            console.error('Error reading cache:', error);
            return null;
        }
    };

    const setCache = (key, data) => {
        try {
            const cacheData = {
                data,
                timestamp: Date.now()
            };
            localStorage.setItem(CACHE_PREFIX + key, JSON.stringify(cacheData));
        } catch (error) {
            console.error('Error setting cache:', error);
        }
    };

    const handleLogout = () => {
        localStorage.removeItem('user');
        navigate('/login');
    };

    // Load current user and allowed departments (for Dean/HoD scoping)
    useEffect(() => {
        try {
            const stored = localStorage.getItem('user');
            if (stored) {
                const parsed = JSON.parse(stored);
                setCurrentUser(parsed || null);
                // HoD is limited to their own department
                if (parsed?.role === 'HoD' && parsed?.department) {
                    setAllowedDepts([parsed.department]);
                }
                // Dean: fetch departments for their school
                if (parsed?.role === 'Dean' && parsed?.school) {
                    fetch(`${SERVER_URL}/api/school-reports/schools/${encodeURIComponent(parsed.school)}/departments`)
                        .then(res => res.ok ? res.json() : Promise.reject(new Error('Failed to load dean departments')))
                        .then(data => {
                            if (Array.isArray(data)) {
                                setAllowedDepts(data);
                            }
                        })
                        .catch(err => console.error('Error fetching dean departments:', err));
                }
            }
        } catch (e) {
            console.error('Error parsing user from localStorage:', e);
        }
    }, []);

    const getInitials = (fullName) => {
        if (!fullName || typeof fullName !== 'string') return '?';
        const parts = fullName.trim().split(/\s+/);
        const first = parts[0]?.[0] || '';
        const last = parts.length > 1 ? parts[parts.length - 1][0] : '';
        const initials = (first + last).toUpperCase();
        return initials || '?';
    };

    const handleGenerateDepartmentReport = async () => {
        // Validation: For Dean/HoD, degree is not required; for HoD, courseOfferingDept is also not needed (auto-set)
        if (isHoD) {
            if (!filters.currentAY || !filters.semester || !currentUser?.department) {
                alert('Please select Current AY and Semester.');
                return;
            }
        } else if (isDean) {
            if (!filters.currentAY || !filters.semester || !filters.courseOfferingDept) {
                alert('Please select Current AY, Semester, and Course Offering Department.');
                return;
            }
        } else {
            if (!filters.degree || !filters.currentAY || !filters.semester || !filters.courseOfferingDept) {
                alert('Please select Degree, Current AY, Semester, and Course Offering Department.');
                return;
            }
        }
        
        if (selectedBatch === 'all') {
            // Generate report for all batches
            handleGenerateDepartmentAllBatches();
            return;
        }
        
        try {
            setLoadingDeptReport(true);
            // Use role-specific endpoint
            let endpointUrl;
            let body;
            if (isDean) {
                endpointUrl = `${SERVER_URL}/api/reports/dean/generate-department-report`;
                body = {
                    school: currentUser?.school,
                    currentAY: filters.currentAY,
                    semester: filters.semester,
                    courseOfferingDept: filters.courseOfferingDept,
                    batch: selectedBatch,
                    format: reportFormat
                };
            } else if (isHoD) {
                endpointUrl = `${SERVER_URL}/api/reports/hod/generate-department-report`;
                body = {
                    department: currentUser?.department,
                    currentAY: filters.currentAY,
                    semester: filters.semester,
                    courseOfferingDept: currentUser?.department, // HoD's department is automatically used
                    batch: selectedBatch,
                    format: reportFormat
                };
            } else {
                endpointUrl = `${SERVER_URL}/api/reports/generate-department-report`;
                body = {
                    degree: filters.degree,
                    currentAY: filters.currentAY,
                    semester: filters.semester,
                    courseOfferingDept: filters.courseOfferingDept,
                    batch: selectedBatch,
                    format: reportFormat
                };
            }
            
            const resp = await fetch(endpointUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });
            if (!resp.ok) {
                const msg = await resp.text();
                throw new Error(msg || 'Failed to generate department report');
            }
            const blob = await resp.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            const fileExtension = reportFormat === 'pdf' ? 'pdf' : 'xlsx';
            const safeDeptName = (isHoD ? currentUser?.department : filters.courseOfferingDept || 'department').replace(/[^a-z0-9]/gi, '_').toLowerCase();
            a.download = `department_feedback_${safeDeptName}_${selectedBatch}.${fileExtension}`;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);
        } catch (e) {
            console.error('Department report error:', e);
            alert('Error generating department report.');
        } finally {
            setLoadingDeptReport(false);
        }
    };

    const handleGenerateNegativeCommentsExcel = async () => {
        // Validation: For Dean/HoD, degree is not required; for HoD, courseOfferingDept is also not needed (auto-set)
        if (isHoD) {
            if (!filters.currentAY || !filters.semester || !currentUser?.department) {
                alert('Please select Current AY and Semester.');
                return;
            }
        } else if (isDean) {
            if (!filters.currentAY || !filters.semester || !filters.courseOfferingDept) {
                alert('Please select Current AY, Semester, and Course Offering Department.');
                return;
            }
        } else {
            if (!filters.degree || !filters.currentAY || !filters.semester || !filters.courseOfferingDept) {
                alert('Please select Degree, Current AY, Semester, and Course Offering Department.');
                return;
            }
        }
        
        try {
            setLoadingNegativeCommentsExcel(true);
            // Use role-specific endpoint
            let endpointUrl;
            let body;
            if (isDean) {
                endpointUrl = `${SERVER_URL}/api/reports/dean/generate-department-negative-comments-excel`;
                body = {
                    school: currentUser?.school,
                    currentAY: filters.currentAY,
                    semester: filters.semester,
                    courseOfferingDept: filters.courseOfferingDept,
                    batch: selectedBatch === 'all' ? 'ALL' : selectedBatch
                };
            } else if (isHoD) {
                endpointUrl = `${SERVER_URL}/api/reports/hod/generate-department-negative-comments-excel`;
                body = {
                    department: currentUser?.department,
                    currentAY: filters.currentAY,
                    semester: filters.semester,
                    courseOfferingDept: currentUser?.department, // HoD's department is automatically used
                    batch: selectedBatch === 'all' ? 'ALL' : selectedBatch
                };
            } else {
                endpointUrl = `${SERVER_URL}/api/reports/generate-department-negative-comments-excel`;
                body = {
                    degree: filters.degree,
                    currentAY: filters.currentAY,
                    semester: filters.semester,
                    courseOfferingDept: filters.courseOfferingDept,
                    batch: selectedBatch === 'all' ? 'ALL' : selectedBatch
                };
            }
            
            const resp = await fetch(endpointUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });
            
            if (!resp.ok) {
                const msg = await resp.text();
                throw new Error(msg || 'Failed to generate negative comments Excel');
            }
            
            const blob = await resp.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            const safeDeptName = (isHoD ? currentUser?.department : filters.courseOfferingDept || 'department').replace(/[^a-z0-9]/gi, '_').toLowerCase();
            a.download = `department_negative_comments_${safeDeptName}_${selectedBatch === 'all' ? 'all_batches' : selectedBatch}.xlsx`;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);
        } catch (e) {
            console.error('Negative comments Excel error:', e);
            alert('Error generating negative comments Excel: ' + e.message);
        } finally {
            setLoadingNegativeCommentsExcel(false);
        }
    };

    const handleGenerateDepartmentAllBatches = async () => {
        // Validation: For HoD, courseOfferingDept is auto-set, so only check AY and semester
        if (isHoD) {
            if (!filters.currentAY || !filters.semester || !currentUser?.department) {
                alert('Please select Current AY and Semester.');
                return;
            }
        } else {
            if (!filters.currentAY || !filters.semester || !filters.courseOfferingDept) {
                alert('Please select Current AY, Semester, and Course Offering Department.');
                return;
            }
        }
        try {
            setLoadingDeptReport(true);
            let endpointUrl;
            let body;
            if (isDean) {
                endpointUrl = `${SERVER_URL}/api/reports/dean/generate-department-report-all-batches`;
                body = {
                    school: currentUser?.school,
                    currentAY: filters.currentAY,
                    semester: filters.semester,
                    courseOfferingDept: filters.courseOfferingDept,
                    format: reportFormat
                };
            } else if (isHoD) {
                endpointUrl = `${SERVER_URL}/api/reports/hod/generate-department-report-all-batches`;
                body = {
                    department: currentUser?.department,
                    currentAY: filters.currentAY,
                    semester: filters.semester,
                    courseOfferingDept: currentUser?.department, // HoD's department is automatically used
                    format: reportFormat
                };
            } else {
                endpointUrl = `${SERVER_URL}/api/reports/generate-department-report-all-batches`;
                body = {
                    degree: filters.degree,
                    currentAY: filters.currentAY,
                    semester: filters.semester,
                    courseOfferingDept: filters.courseOfferingDept,
                    format: reportFormat
                };
            }
            const resp = await fetch(endpointUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });
            if (!resp.ok) {
                const msg = await resp.text();
                throw new Error(msg || 'Failed to generate department report (all batches)');
            }
            const blob = await resp.blob();
            const downloadUrl = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = downloadUrl;
            const fileExtension = reportFormat === 'pdf' ? 'pdf' : 'xlsx';
            const safeDeptName = (isHoD ? currentUser?.department : filters.courseOfferingDept || 'department').replace(/[^a-z0-9]/gi, '_').toLowerCase();
            a.download = `department_feedback_${safeDeptName}_ALL_BATCHES.${fileExtension}`;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(downloadUrl);
            document.body.removeChild(a);
        } catch (e) {
            console.error('Department all-batches report error:', e);
            alert('Error generating department report (all batches).');
        } finally {
            setLoadingDeptReport(false);
        }
    };

    // Function to restore filters and options from localStorage
    const restoreFiltersFromStorage = async () => {
        const savedFilters = localStorage.getItem('analysisFilters');
        const savedFaculty = localStorage.getItem('savedFaculty');
        const savedStaffIdSearch = localStorage.getItem('savedStaffIdSearch');
        
        if (!savedFilters) {
            console.log('No saved filters found in localStorage');
            return false; // No saved filters to restore
        }
        
        try {
            console.log('Starting filter restoration...');
            setIsRestoring(true);
            isRestoringRef.current = true; // Set ref immediately
            const restoredFilters = JSON.parse(savedFilters);
            console.log('Restored filters from localStorage:', restoredFilters);
                
                // Restore staff ID search if available
                if (savedStaffIdSearch) {
                    setStaffIdSearch(savedStaffIdSearch);
                }
                
            // Restore dependent options sequentially based on restored filters
            if (restoredFilters.degree) {
                console.log('Loading options for degree:', restoredFilters.degree);
                await fetchCurrentAY(restoredFilters.degree);
                
                if (restoredFilters.currentAY) {
                    await fetchSemesters(restoredFilters.degree, restoredFilters.currentAY);
                    
                    if (restoredFilters.semester) {
                        await fetchCourseOfferingDepts(restoredFilters.degree, restoredFilters.currentAY, restoredFilters.semester);
                        
                        if (restoredFilters.courseOfferingDept) {
                            await fetchCourses(restoredFilters.degree, restoredFilters.currentAY, restoredFilters.semester, restoredFilters.courseOfferingDept);
                        }
                    }
                }
            }
            
            // After all options are loaded, restore filters (while isRestoring is still true)
            // Use a small delay to ensure isRestoring flag is properly set before setting filters
            console.log('Setting filters to:', restoredFilters);
            // Update course ref to prevent false course change detection during restoration
            if (restoredFilters.course) {
                prevCourseRef.current = restoredFilters.course;
            }
            setTimeout(() => {
                setFilters(restoredFilters);
                console.log('Filters set successfully');
            }, 100);
            
            // Restore faculty data if available (do this after filters are set, with delay to avoid useEffect interference)
            if (savedFaculty) {
                try {
                    const faculty = JSON.parse(savedFaculty);
                    console.log('Restoring faculty list:', faculty.length, 'items');
                    // Use setTimeout to ensure filters are set first and avoid useEffect interference
                    setTimeout(() => {
                        setFaculty(faculty);
                        console.log('Faculty list restored:', faculty.length, 'items');
                    }, 300);
            } catch (error) {
                    console.error('Error parsing saved faculty:', error);
                }
            } else if (restoredFilters.course && restoredFilters.currentAY && restoredFilters.semester && restoredFilters.courseOfferingDept && ((isDean || isHoD) || restoredFilters.degree)) {
                // If no saved faculty but course is selected, fetch faculty after restoration completes
                setTimeout(() => {
                    console.log('No saved faculty, fetching faculty for restored filters...');
                    fetchFaculty(
                        (isDean || isHoD) ? '' : (restoredFilters.degree || ''),
                        restoredFilters.currentAY,
                        restoredFilters.semester,
                        restoredFilters.courseOfferingDept,
                        restoredFilters.course,
                        savedStaffIdSearch || ''
                    );
                }, 1000);
            }
            
            // Clear restoration flag after a delay (long enough for faculty to be restored)
            setTimeout(() => {
                setIsRestoring(false);
                isRestoringRef.current = false; // Clear ref
                console.log('Filter restoration complete');
            }, 3000);
            
            return true;
        } catch (error) {
            console.error('Error restoring analysis state:', error);
            setIsRestoring(false);
            isRestoringRef.current = false; // Clear ref on error
            return false;
        }
    };

    // Fetch initial degree options on mount (only for Admin; Dean/HoD use role-based flow)
    useEffect(() => {
        if (!isDean && !isHoD) {
            fetchDegrees();
        }
        // Restore filters on initial mount if available
        const savedFilters = localStorage.getItem('analysisFilters');
        if (savedFilters) {
            console.log('Initial mount: Restoring filters from localStorage');
            restoreFiltersFromStorage();
            hasRestoredRef.current = true;
        }
    }, [isDean, isHoD]);

    // Dean: load AY options as soon as user is known
    useEffect(() => {
        if (isDean && currentUser?.school) {
            fetchDeanCurrentAY();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isDean, currentUser?.school]);

    // HoD: load AY options and auto-set department as soon as user is known
    useEffect(() => {
        if (isHoD && currentUser?.department) {
            // Auto-set the department filter for HoD (even though it's not shown in UI)
            setFilters(prev => ({
                ...prev,
                courseOfferingDept: currentUser.department
            }));
            // Fetch AY for HoD's department
            fetchHoDCurrentAY();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isHoD, currentUser?.department]);

    // Restore filters whenever navigating back to this page
    useEffect(() => {
        const currentPath = location.pathname;
        const prevPath = prevLocationRef.current;
        
        // Always restore when navigating to /analysis if we have saved filters
        if (currentPath === '/analysis') {
            // Check if we're coming back from results page
            const comingBackFromResults = sessionStorage.getItem('navigatingToResults') === 'true';
            const savedFilters = localStorage.getItem('analysisFilters');
            
            if (savedFilters) {
                const parsedFilters = JSON.parse(savedFilters);
                
                // Check if current filters match saved filters
                const filtersMatch = filters.degree === parsedFilters.degree && 
                                    filters.currentAY === parsedFilters.currentAY && 
                                    filters.semester === parsedFilters.semester && 
                                    filters.courseOfferingDept === parsedFilters.courseOfferingDept && 
                                    filters.course === parsedFilters.course;
                
                // Restore if:
                // 1. We're coming back from results page, OR
                // 2. Filters are empty, OR
                // 3. Filters don't match saved filters (but only if we haven't restored recently)
                const filtersEmpty = !filters.degree && !filters.currentAY && !filters.semester && !filters.courseOfferingDept && !filters.course;
                
                if (comingBackFromResults || filtersEmpty || (!filtersMatch && !hasRestoredRef.current)) {
                    console.log('Restoring filters from localStorage...', { comingBackFromResults, filtersEmpty, filtersMatch });
                    hasRestoredRef.current = true;
                    // Clear the flag
                    if (comingBackFromResults) {
                        sessionStorage.removeItem('navigatingToResults');
                    }
                    restoreFiltersFromStorage();
                }
            }
        }
        
        // Update previous location
        prevLocationRef.current = currentPath;
    }, [location.pathname]);

    // Fetch current AY when degree changes (normal mode; Dean/HoD use role-based routes instead)
    useEffect(() => {
        if (isRestoring || isRestoringRef.current) {
            console.log('Skipping degree useEffect during restoration');
            return; // Skip reset during restoration
        }
        
        if (filters.degree && !isDean && !isHoD) {
            fetchCurrentAY(filters.degree);
            // Only reset dependent filters if they're actually changing (not during restoration)
            setFilters(prev => {
                // Check if degree actually changed (not just being set during restoration)
                if (prev.degree === filters.degree) {
                    return prev; // No change, don't reset
                }
                return {
                    ...prev,
                    currentAY: '',
                    semester: '',
                    courseOfferingDept: '',
                    course: ''
                };
            });
        } else if (!isDean && !isHoD) {
            setOptions(prev => ({ ...prev, currentAYs: [], semesters: [], courseOfferingDepts: [], courses: [] }));
        }
    }, [filters.degree, isRestoring, isDean, isHoD]);

    // Fetch semesters when current AY changes
    useEffect(() => {
        if (isRestoring || isRestoringRef.current) {
            console.log('Skipping currentAY useEffect during restoration');
            return; // Skip reset during restoration
        }
        
        if (isDean) {
            if (filters.currentAY) {
                fetchDeanSemesters(filters.currentAY);
                setFilters(prev => ({
                    ...prev,
                    semester: '',
                    courseOfferingDept: '',
                    course: ''
                }));
            } else {
                setOptions(prev => ({ ...prev, semesters: [], courseOfferingDepts: [], courses: [] }));
            }
        } else if (isHoD) {
            if (filters.currentAY && currentUser?.department) {
                fetchHoDSemesters(filters.currentAY);
                setFilters(prev => ({
                    ...prev,
                    semester: '',
                    course: ''
                }));
            } else {
                setOptions(prev => ({ ...prev, semesters: [], courses: [] }));
            }
        } else {
            if (filters.currentAY && filters.degree) {
                fetchSemesters(filters.degree, filters.currentAY);
                // Only reset if currentAY actually changed
                setFilters(prev => {
                    if (prev.currentAY === filters.currentAY) {
                        return prev; // No change, don't reset
                    }
                    return {
                        ...prev,
                        semester: '',
                        courseOfferingDept: '',
                        course: ''
                    };
                });
            } else {
                setOptions(prev => ({ ...prev, semesters: [], courseOfferingDepts: [], courses: [] }));
            }
        }
    }, [filters.currentAY, filters.degree, isRestoring, isDean, isHoD, currentUser?.department]);

    // Fetch course offering departments when semester changes
    useEffect(() => {
        if (isRestoring || isRestoringRef.current) {
            console.log('Skipping semester useEffect during restoration');
            return; // Skip reset during restoration
        }
        
        if (isDean) {
            if (filters.semester && filters.currentAY) {
                fetchDeanDepartments(filters.currentAY, filters.semester);
                setFilters(prev => {
                    if (prev.semester === filters.semester) {
                        return prev;
                    }
                    return {
                        ...prev,
                        courseOfferingDept: '',
                        course: ''
                    };
                });
            } else {
                setOptions(prev => ({ ...prev, courseOfferingDepts: [], courses: [] }));
            }
        } else if (isHoD) {
            // For HoD, department is already set, just fetch courses when semester is selected
            if (filters.semester && filters.currentAY && currentUser?.department) {
                // Department is already set to HoD's department, just fetch courses
                fetchCourses('', filters.currentAY, filters.semester, currentUser.department);
                setFilters(prev => {
                    if (prev.semester === filters.semester) {
                        return prev;
                    }
                    return {
                        ...prev,
                        course: ''
                    };
                });
            } else {
                setOptions(prev => ({ ...prev, courses: [] }));
            }
        } else {
            if (filters.semester && filters.degree && filters.currentAY) {
                fetchCourseOfferingDepts(filters.degree, filters.currentAY, filters.semester);
                // Only reset if semester actually changed
                setFilters(prev => {
                    if (prev.semester === filters.semester) {
                        return prev; // No change, don't reset
                    }
                    return {
                        ...prev,
                        courseOfferingDept: '',
                        course: ''
                    };
                });
            } else {
                setOptions(prev => ({ ...prev, courseOfferingDepts: [], courses: [] }));
            }
        }
    }, [filters.semester, filters.degree, filters.currentAY, isRestoring, isDean, isHoD, currentUser?.department]);

    // Fetch courses when course offering dept changes (or for HoD when semester changes)
    useEffect(() => {
        if (isHoD) {
            // For HoD, department is already set, fetch courses when semester is selected
            if (filters.semester && filters.currentAY && currentUser?.department) {
                fetchCourses('', filters.currentAY, filters.semester, currentUser.department);
            } else {
                setOptions(prev => ({ ...prev, courses: [] }));
            }
        } else if (filters.courseOfferingDept && filters.currentAY && filters.semester) {
            if (isDean) {
                fetchCourses(null, filters.currentAY, filters.semester, filters.courseOfferingDept);
            } else if (filters.degree) {
                fetchCourses(filters.degree, filters.currentAY, filters.semester, filters.courseOfferingDept);
            }
        } else {
            setOptions(prev => ({ ...prev, courses: [] }));
        }
    }, [filters.courseOfferingDept, filters.degree, filters.currentAY, filters.semester, isDean, isHoD, currentUser?.department]);

    // Fetch faculty when course or staffIdSearch changes (but not during restoration)
    useEffect(() => {
        if (isRestoring || isRestoringRef.current) {
            console.log('Skipping faculty fetch during restoration');
            return; // Skip during restoration to preserve restored faculty
        }
        
        const courseOfferingDeptForFetch = isHoD ? currentUser?.department : filters.courseOfferingDept;
        if (filters.course && filters.currentAY && filters.semester && courseOfferingDeptForFetch && ((isDean && currentUser?.school) || (isHoD && currentUser?.department) || (!isDean && !isHoD))) {
            // Check if course has changed - if so, clear faculty and fetch new data
            const courseChanged = prevCourseRef.current !== filters.course;
            
            if (courseChanged) {
                console.log('Course changed from', prevCourseRef.current, 'to', filters.course, '- clearing and fetching new faculty');
                setFaculty([]); // Clear existing faculty when course changes
                prevCourseRef.current = filters.course; // Update ref
                // Fetch new faculty immediately after course change
                console.log('Fetching faculty for new course:', filters.course);
                fetchFaculty(
                    (isDean || isHoD) ? '' : filters.degree,
                    filters.currentAY,
                    filters.semester,
                    courseOfferingDeptForFetch,
                    filters.course,
                    staffIdSearch
                );
            } else if (faculty.length === 0) {
                // If no faculty loaded and course hasn't changed, fetch faculty
                console.log('No faculty loaded, fetching faculty for filters:', filters);
                fetchFaculty(
                    (isDean || isHoD) ? '' : filters.degree,
                    filters.currentAY,
                    filters.semester,
                    courseOfferingDeptForFetch,
                    filters.course,
                    staffIdSearch
                );
            } else {
                console.log('Faculty already loaded for current course, skipping fetch');
            }
        } else {
            // Only clear faculty if filters are actually empty (not during restoration)
            if (!isRestoring && faculty.length > 0) {
                console.log('Clearing faculty - filters are empty');
            setFaculty([]);
        }
            // Reset course ref when course is cleared
            if (!filters.course) {
                prevCourseRef.current = '';
            }
        }
    }, [filters.course, filters.degree, filters.currentAY, filters.semester, filters.courseOfferingDept, staffIdSearch, isRestoring, isDean, currentUser?.school]);

    // Save filters to localStorage whenever they change (but not during restoration)
    useEffect(() => {
        if (!isRestoring) {
            localStorage.setItem('analysisFilters', JSON.stringify(filters));
        }
    }, [filters, isRestoring]);

    // Save staff ID search to localStorage whenever it changes
    useEffect(() => {
        if (!isRestoring) {
            localStorage.setItem('savedStaffIdSearch', staffIdSearch);
        }
    }, [staffIdSearch, isRestoring]);

    // Save faculty list to localStorage whenever it changes (but not during restoration)
    useEffect(() => {
        if (!isRestoring && faculty.length > 0) {
            localStorage.setItem('savedFaculty', JSON.stringify(faculty));
        }
    }, [faculty, isRestoring]);

    const fetchDegrees = async () => {
        try {
            // Check cache first
            const cacheKey = 'degrees';
            const cachedData = getCache(cacheKey);
            
            if (cachedData) {
                console.log('Using cached degrees');
                setOptions(prev => ({ ...prev, degrees: cachedData }));
                return;
            }
            
            console.log('Fetching degrees from API...');
            const response = await fetch(`${SERVER_URL}/api/analysis/degrees`);
            const data = await response.json();
            console.log('Degrees received:', data);
            if (Array.isArray(data)) {
                setCache(cacheKey, data); // Cache the response
                setOptions(prev => ({ ...prev, degrees: data }));
            } else {
                console.error('Invalid degrees data:', data);
            }
        } catch (error) {
            console.error('Error fetching degrees:', error);
        }
    };

    const fetchCurrentAY = async (degree) => {
        if (!degree) return;
        
        try {
            // Check cache first
            const cacheKey = `currentAY_${degree}`;
            const cachedData = getCache(cacheKey);
            
            if (cachedData) {
                console.log('Using cached current AY for degree:', degree);
                setOptions(prev => ({ ...prev, currentAYs: cachedData }));
                return;
            }
            
            console.log('Fetching current AY from API for degree:', degree);
            const response = await fetch(`${SERVER_URL}/api/analysis/current-ay?degree=${encodeURIComponent(degree)}`);
            const data = await response.json();
            const result = Array.isArray(data) ? data : [];
            setCache(cacheKey, result); // Cache the response
            setOptions(prev => ({ ...prev, currentAYs: result }));
        } catch (error) {
            console.error('Error fetching current AY:', error);
            setOptions(prev => ({ ...prev, currentAYs: [] }));
        }
    };

    const fetchSemesters = async (degree, currentAY) => {
        if (!degree || !currentAY) return;
        
        try {
            // Check cache first
            const cacheKey = `semesters_${degree}_${currentAY}`;
            const cachedData = getCache(cacheKey);
            
            if (cachedData) {
                console.log('Using cached semesters for degree:', degree, 'currentAY:', currentAY);
                setOptions(prev => ({ ...prev, semesters: cachedData }));
                return;
            }
            
            console.log('Fetching semesters from API for degree:', degree, 'currentAY:', currentAY);
            const params = new URLSearchParams({ degree });
            if (currentAY) {
                params.append('currentAY', currentAY);
            }
            const response = await fetch(`${SERVER_URL}/api/analysis/semesters?${params.toString()}`);
            const data = await response.json();
            const result = Array.isArray(data) ? data : [];
            setCache(cacheKey, result); // Cache the response
            setOptions(prev => ({ ...prev, semesters: result }));
        } catch (error) {
            console.error('Error fetching semesters:', error);
            setOptions(prev => ({ ...prev, semesters: [] }));
        }
    };

    // Dean-specific: fetch AY list based on school only
    const fetchDeanCurrentAY = async () => {
        if (!currentUser?.school) return;
        try {
            const params = new URLSearchParams({
                school: currentUser.school
            });
            const response = await fetch(`${SERVER_URL}/api/analysis/dean/current-ay?${params.toString()}`);
            const data = await response.json();
            const result = Array.isArray(data) ? data : [];
            setOptions(prev => ({ ...prev, currentAYs: result }));
        } catch (error) {
            console.error('Error fetching dean current AY:', error);
            setOptions(prev => ({ ...prev, currentAYs: [] }));
        }
    };

    // Dean-specific: fetch semesters based on school + AY
    const fetchDeanSemesters = async (currentAY) => {
        if (!currentUser?.school || !currentAY) return;
        try {
            const params = new URLSearchParams({
                school: currentUser.school,
                currentAY
            });
            const response = await fetch(`${SERVER_URL}/api/analysis/dean/semesters?${params.toString()}`);
            const data = await response.json();
            const result = Array.isArray(data) ? data : [];
            setOptions(prev => ({ ...prev, semesters: result }));
        } catch (error) {
            console.error('Error fetching dean semesters:', error);
            setOptions(prev => ({ ...prev, semesters: [] }));
        }
    };

    // Dean-specific: fetch departments that actually have data for school+AY+sem
    const fetchDeanDepartments = async (currentAY, semester) => {
        if (!currentUser?.school || !currentAY || !semester) return;
        try {
            const params = new URLSearchParams({
                school: currentUser.school,
                currentAY,
                semester
            });
            const response = await fetch(`${SERVER_URL}/api/analysis/dean/departments?${params.toString()}`);
            const data = await response.json();
            let result = Array.isArray(data) ? data : [];

            // Still intersect with allowedDepts (from profiles.school) for safety
            if (allowedDepts.length > 0) {
                result = result.filter(d => allowedDepts.includes(d));
            }

            setOptions(prev => ({ ...prev, courseOfferingDepts: result }));
        } catch (error) {
            console.error('Error fetching dean departments:', error);
            setOptions(prev => ({ ...prev, courseOfferingDepts: [] }));
        }
    };

    // HoD-specific: fetch current AY based on department
    const fetchHoDCurrentAY = async () => {
        if (!currentUser?.department) return;
        try {
            const params = new URLSearchParams({
                department: currentUser.department
            });
            const response = await fetch(`${SERVER_URL}/api/analysis/hod/current-ay?${params.toString()}`);
            const data = await response.json();
            const result = Array.isArray(data) ? data : [];
            setOptions(prev => ({ ...prev, currentAYs: result }));
        } catch (error) {
            console.error('Error fetching HoD current AY:', error);
            setOptions(prev => ({ ...prev, currentAYs: [] }));
        }
    };

    // HoD-specific: fetch semesters based on department + AY
    const fetchHoDSemesters = async (currentAY) => {
        if (!currentUser?.department || !currentAY) return;
        try {
            const params = new URLSearchParams({
                department: currentUser.department,
                currentAY
            });
            const response = await fetch(`${SERVER_URL}/api/analysis/hod/semesters?${params.toString()}`);
            const data = await response.json();
            const result = Array.isArray(data) ? data : [];
            setOptions(prev => ({ ...prev, semesters: result }));
        } catch (error) {
            console.error('Error fetching HoD semesters:', error);
            setOptions(prev => ({ ...prev, semesters: [] }));
        }
    };

    const fetchCourseOfferingDepts = async (degree, currentAY, semester) => {
        if (!degree || !currentAY || !semester) return;
        
        try {
            // Check cache first
            const cacheKey = `courseOfferingDepts_${degree}_${currentAY}_${semester}`;
            const cachedData = getCache(cacheKey);
            
            if (cachedData) {
                console.log('Using cached course offering depts for degree:', degree, 'currentAY:', currentAY, 'semester:', semester);
                setOptions(prev => ({ ...prev, courseOfferingDepts: cachedData }));
                return;
            }
            
            console.log('Fetching course offering depts from API...');
            const params = new URLSearchParams({ degree });
            if (currentAY) params.append('currentAY', currentAY);
            if (semester) params.append('semester', semester);
            const response = await fetch(`${SERVER_URL}/api/analysis/course-offering-depts?${params.toString()}`);
            const data = await response.json();
            let result = Array.isArray(data) ? data : [];

            // Apply role-based department scoping
            if (currentUser?.role === 'HoD' && allowedDepts.length > 0) {
                result = result.filter(dept => allowedDepts.includes(dept));
            } else if (currentUser?.role === 'Dean' && allowedDepts.length > 0) {
                result = result.filter(dept => allowedDepts.includes(dept));
            }

            setCache(cacheKey, result); // Cache the response
            setOptions(prev => ({ ...prev, courseOfferingDepts: result }));
        } catch (error) {
            console.error('Error fetching course offering departments:', error);
            setOptions(prev => ({ ...prev, courseOfferingDepts: [] }));
        }
    };

    const fetchCourses = async (degree, currentAY, semester, courseOfferingDept) => {
        if (!currentAY || !semester || !courseOfferingDept) return;
        
        try {
            // Check cache first
            let cacheKey;
            if (isHoD) {
                cacheKey = `hod_courses_${currentUser?.department}_${currentAY}_${semester}`;
            } else if (degree) {
                cacheKey = `courses_${degree}_${currentAY}_${semester}_${courseOfferingDept}`;
            } else {
                cacheKey = `dean_courses_${currentUser?.school}_${currentAY}_${semester}_${courseOfferingDept}`;
            }
            const cachedData = getCache(cacheKey);
            
            if (cachedData) {
                console.log('Using cached courses...');
                setOptions(prev => ({ ...prev, courses: cachedData }));
                return;
            }
            
            console.log('Fetching courses from API...');
            let url;
            if (isHoD) {
                // HoD: use department-based endpoint
                const params = new URLSearchParams({
                    department: currentUser?.department || '',
                    currentAY,
                    semester
                });
                url = `${SERVER_URL}/api/analysis/hod/courses?${params.toString()}`;
            } else if (degree) {
                const params = new URLSearchParams({ degree });
                if (currentAY) params.append('currentAY', currentAY);
                if (semester) params.append('semester', semester);
                if (courseOfferingDept) params.append('courseOfferingDept', courseOfferingDept);
                url = `${SERVER_URL}/api/analysis/course-names?${params.toString()}`;
            } else {
                // Dean: use school-based endpoint
                const params = new URLSearchParams({
                    school: currentUser?.school || '',
                    currentAY,
                    semester,
                    dept: courseOfferingDept
                });
                url = `${SERVER_URL}/api/analysis/dean/courses?${params.toString()}`;
            }
            const response = await fetch(url);
            const data = await response.json();
            const result = Array.isArray(data) ? data : [];
            setCache(cacheKey, result); // Cache the response
            setOptions(prev => ({ ...prev, courses: result }));
        } catch (error) {
            console.error('Error fetching courses:', error);
            setOptions(prev => ({ ...prev, courses: [] }));
        }
    };

    const fetchFaculty = async (degree, currentAY, semester, courseOfferingDept, course, staffId) => {
        if (!currentAY || !semester || !courseOfferingDept || !course) return;
        
        try {
            // Build cache key including staffId filter
            const staffIdPart = staffId && staffId.trim() !== '' ? `_${staffId.trim()}` : '';
            const cacheKey = `faculty_${degree || 'nodegree'}_${currentAY}_${semester}_${courseOfferingDept}_${course}${staffIdPart}`;
            
            // Check cache first
            const cachedData = getCache(cacheKey);
            
            if (cachedData && Array.isArray(cachedData) && cachedData.length > 0) {
                console.log('Using cached faculty data...');
                setFaculty(cachedData);
                return;
            }
            
            console.log('Fetching faculty from API...');
            // Build params with all required filters for new hierarchy
            const params = new URLSearchParams({ 
                degree: degree || '',
                currentAY,
                semester,
                courseOfferingDept,
                course
            });
            // Optional staff ID filter
            if (staffId && staffId.trim() !== '') {
                params.append('staffId', staffId.trim());
            }
            const response = await fetch(`${SERVER_URL}/api/analysis/faculty?${params.toString()}`);
            const data = await response.json();
            const result = Array.isArray(data) ? data : [];

            // Only cache non-empty faculty lists to avoid persisting "no data" from older bugs
            if (result.length > 0) {
                setCache(cacheKey, result);
            }
            setFaculty(result);
        } catch (error) {
            console.error('Error fetching faculty:', error);
            setFaculty([]);
        }
    };
    
    const handleFacultyCardClick = async (facultyData) => {
        setLoadingAnalysis(true);
        
        try {
            // Save current state to localStorage (persists across sessions)
            localStorage.setItem('analysisFilters', JSON.stringify(filters));
            localStorage.setItem('savedFaculty', JSON.stringify(faculty));
            localStorage.setItem('savedStaffIdSearch', staffIdSearch);
            
            // Get staff ID from faculty data
            const staffId = facultyData.staff_id || facultyData.staffid || '';
            
            if (!staffId) {
                alert('Staff ID not available for this faculty member');
                setLoadingAnalysis(false);
                return;
            }
            
            // Build params with new filter hierarchy
            const params = new URLSearchParams({
                degree: filters.degree,
                currentAY: filters.currentAY,
                semester: filters.semester,
                courseOfferingDept: filters.courseOfferingDept,
                course: filters.course,
                staffId
            });
            
            const response = await fetch(`${SERVER_URL}/api/analysis/feedback?${params.toString()}`);
            const data = await response.json();
            
            if (data.success) {
                // Add filter information to analysis data for comments loading
                const analysisDataWithFilters = {
                    ...data,
                    degree: filters.degree,
                    currentAY: filters.currentAY,
                    semester: filters.semester,
                    courseOfferingDept: filters.courseOfferingDept,
                    course_code: filters.course,
                    course: filters.course
                };
                
                // Store analysis data and faculty data for the results page
                sessionStorage.setItem('analysisResults', JSON.stringify(analysisDataWithFilters));
                sessionStorage.setItem('facultyData', JSON.stringify(facultyData));
                // Set flag to indicate we're navigating to results (so we can restore when coming back)
                sessionStorage.setItem('navigatingToResults', 'true');
                
                // Navigate to analysis results page
                navigate('/analysis-results');
            } else {
                console.error('Analysis failed:', data.message);
                alert('Failed to fetch analysis data: ' + (data.message || 'Unknown error'));
            }
        } catch (error) {
            console.error('Error fetching analysis:', error);
            alert('Error fetching analysis data. Please try again.');
        } finally {
            setLoadingAnalysis(false);
        }
    };

    // Get available batches for batch filter dropdown
    // Note: Batches are not part of the new filter hierarchy, but may still be used for report filtering
    const getAvailableBatches = () => {
        // For now, return 'all' as default since batches are not in the new hierarchy
        // This can be updated later if batch filtering is needed
        return ['all'];
    };

    return (
        <div className="analysis-container">
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
                <h1 className="portal-title">Student Feedback Analysis Portal</h1>
                <h2 className="institution">Kalasalingam Academy of Research and Education</h2>
                <p className="portal-description">
                    {isDean
                        ? 'Use the filters below to analyze student feedback by academic year, semester, department, and course within your school.'
                        : isHoD
                        ? 'Use the filters below to analyze student feedback by academic year, semester, and course for your department.'
                        : 'Use the filters below to analyze student feedback by degree, academic year, semester, course offering department, and course.'}
                </p>

                <div className="filters-section">
                    {!isDean && !isHoD && (
                    <div className="filter-group">
                        <label>Degree</label>
                        <select 
                            value={filters.degree}
                            onChange={(e) => setFilters({
                                ...filters,
                                degree: e.target.value,
                                currentAY: '',
                                semester: '',
                                courseOfferingDept: '',
                                course: ''
                            })}
                        >
                            <option value="">Select Degree</option>
                            {options.degrees.map(degree => (
                                <option key={degree} value={degree}>{degree}</option>
                            ))}
                        </select>
                    </div>
                    )}

                    <div className="filter-group">
                        <label>Current Academic Year</label>
                        <select 
                            value={filters.currentAY}
                            onChange={(e) => setFilters({
                                ...filters,
                                currentAY: e.target.value,
                                semester: '',
                                courseOfferingDept: '',
                                course: ''
                            })}
                            disabled={!isDean && !isHoD && !filters.degree}
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
                                courseOfferingDept: '',
                                course: ''
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
                            <label>Course Offering Department</label>
                            <select 
                                value={filters.courseOfferingDept}
                                onChange={(e) => setFilters({
                                    ...filters,
                                    courseOfferingDept: e.target.value,
                                    course: ''
                                })}
                                disabled={!filters.semester}
                            >
                                <option value="">Select Course Offering Department</option>
                                {options.courseOfferingDepts.map(dept => (
                                    <option key={dept} value={dept}>{dept}</option>
                                ))}
                            </select>
                        </div>
                    )}

                    <div className="filter-group">
                        <label>Course</label>
                        <select 
                            value={filters.course}
                            onChange={(e) => setFilters({
                                ...filters,
                                course: e.target.value
                            })}
                            disabled={!filters.courseOfferingDept && !isHoD}
                        >
                            <option value="">Select Course</option>
                            {options.courses.map(course => (
                                <option key={course.code} value={course.code}>
                                    {course.code} - {course.name}
                                </option>
                            ))}
                        </select>
                    </div>

                    <div className="dept-report-actions">
                        <div className="format-selection">
                            <label>Report Format:</label>
                            <div className="format-options">
                                <label className="format-option">
                                    <input
                                        type="radio"
                                        name="reportFormat"
                                        value="excel"
                                        checked={reportFormat === 'excel'}
                                        onChange={() => setReportFormat('excel')}
                                    />
                                    <span>Excel</span>
                                </label>
                                <label className="format-option">
                                    <input
                                        type="radio"
                                        name="reportFormat"
                                        value="pdf"
                                        checked={reportFormat === 'pdf'}
                                        onChange={() => setReportFormat('pdf')}
                                    />
                                    <span>PDF</span>
                                </label>
                            </div>
                        </div>
                        
                        {/* Batch filter removed - not part of new filter hierarchy */}
                        
                        <button
                            type="button"
                            className="generate-dept-btn"
                            onClick={handleGenerateDepartmentReport}
                            disabled={(!isDean && !isHoD && !filters.degree) || !filters.currentAY || !filters.semester || (!isHoD && !filters.courseOfferingDept) || loadingDeptReport}
                        >
                            {loadingDeptReport ? 'Generating…' : 'Generate Department Report'}
                        </button>
                        <button
                            type="button"
                            className="generate-dept-btn"
                            onClick={handleGenerateNegativeCommentsExcel}
                            disabled={(!isDean && !isHoD && !filters.degree) || !filters.currentAY || !filters.semester || (!isHoD && !filters.courseOfferingDept) || loadingNegativeCommentsExcel}
                            style={{ marginLeft: '1rem', backgroundColor: '#28a745' }}
                        >
                            {loadingNegativeCommentsExcel ? 'Generating…' : 'Generate Negative Comments Excel'}
                        </button>
                    </div>
                </div>

                {filters.course && (
                    <div className="faculty-section">
                        <div className="faculty-header">
                            <div className="faculty-search">
                                <label>Search by Staff ID</label>
                                <input
                                    type="text"
                                    placeholder="Enter staff_id..."
                                    value={staffIdSearch}
                                    onChange={(e) => setStaffIdSearch(e.target.value)}
                                />
                            </div>
                        </div>

                        <div className="faculty-grid">
                            {faculty.length === 0 ? (
                                <p>No faculty found.</p>
                            ) : (
                                faculty.map((fac, idx) => (
                                    <div 
                                        key={`${fac.staff_id || fac.staffid}-${idx}`} 
                                        className="faculty-card clickable-card"
                                        onClick={() => handleFacultyCardClick(fac)}
                                    >
                                        <div className="faculty-card-header">
                                            <div className="faculty-avatar" aria-hidden="true">{getInitials(fac.faculty_name || fac.name)}</div>
                                            <div className="faculty-header-info">
                                                <div className="faculty-name">{fac.faculty_name || fac.name || 'Unknown'}</div>
                                                <div className="faculty-sub">
                                                    <strong>{filters.degree || '-'}</strong> · {filters.courseOfferingDept || '-'}
                                                </div>
                                            </div>
                                        </div>
                                        
                                        <div className="faculty-card-body">
                                            <div className="info-section">
                                                <div className="section-header">
                                                    <div className="section-icon">
                                                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
                                                            <path d="M12 3L1 9l4 2.18v6L12 21l7-3.82v-6l2-1.09V17h2V9L12 3zm6.82 6L12 12.72 5.18 9 12 5.28 18.82 9zM17 15.99l-5 2.73-5-2.73v-3.72L12 15l5-2.73v3.72z"/>
                                                        </svg>
                                                    </div>
                                                    <div className="section-label">Course Information</div>
                                                </div>
                                                <div className="info-grid">
                                                    <div className="info-label">Code:</div>
                                                    <div className="info-value">
                                                        <div className="badge code">{fac.course_code || '-'}</div>
                                                    </div>
                                                    <div className="info-label">Name:</div>
                                                    <div className="info-value course-name">{fac.course_name || '-'}</div>
                                                    <div className="info-label">Batches:</div>
                                                    <div className="info-value">
                                                        <div className="badge">{fac.batches_text || fac.batches?.join(', ') || '-'}</div>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                        
                                        <div className="faculty-card-footer">
                                            {(fac.staff_id || fac.staffid) && (
                                                <div className="id-section">
                                                    <div className="section-icon">
                                                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
                                                            <path d="M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 14H4V6h16v12zM4 0h16v2H4zm0 22h16v2H4zm8-10a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5zm0-3.5c.55 0 1 .45 1 1s-.45 1-1 1-1-.45-1-1 .45-1 1-1zm5 7.5h-10v-1c0-1.66 3.34-2.5 5-2.5s5 .84 5 2.5v1z"/>
                                                        </svg>
                                                    </div>
                                                    <div className="id-container">
                                                        <div className="id-label">Staff Identifier</div>
                                                        <div className="id-value">
                                                            {fac.staff_id || fac.staffid}
                                                        </div>
                                                    </div>
                                                </div>
                                            )}
                                            
                                            <button
                                                type="button"
                                                className="copy-btn"
                                                title="Copy faculty ID to clipboard"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    const value = fac.staff_id || fac.staffid || '';
                                                    if (navigator && navigator.clipboard && value) {
                                                        navigator.clipboard.writeText(value)
                                                            .then(() => {
                                                                console.log('ID copied to clipboard');
                                                            })
                                                            .catch(() => {});
                                                    }
                                                }}
                                            >
                                                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                                                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                                                </svg>
                                                Copy ID
                                            </button>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                )}

                {/* Loading overlay for analysis */}
                {loadingAnalysis && (
                    <div className="analysis-loading-overlay">
                        <div className="loading-content">
                            <div className="spinner-small"></div>
                            <p>Fetching analysis data...</p>
                        </div>
                    </div>
                )}
            </main>
        </div>
    );
};

export default Analysis;