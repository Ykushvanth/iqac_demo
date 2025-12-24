import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import './index.css';

const SERVER_URL = process.env.REACT_APP_SERVER_URL || "https://iqac-demo.render.com";

const Visualize = () => {
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const mode = searchParams.get('mode') || 'department'; // Default to department mode
    const [filters, setFilters] = useState({
        degree: '',
        currentAY: '',
        semester: '',
        courseOfferingDept: '',
        artsOrEngg: '' // For radar mode
    });
    
    const [options, setOptions] = useState({
        degrees: [],
        currentAYs: [],
        semesters: [],
        courseOfferingDepts: [],
        artsOrEnggOptions: [] // For radar mode: ['ARTS', 'ENGG']
    });

    const [visualizationData, setVisualizationData] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [performanceFilter, setPerformanceFilter] = useState('all');
    const [aggLoading, setAggLoading] = useState(false);
    const [artsEnggData, setArtsEnggData] = useState(null);
    const aggJsRootRef = useRef(null);
    const aggJsRenderedRef = useRef(false);
    const [currentUser, setCurrentUser] = useState(null);
    const [allowedDepts, setAllowedDepts] = useState([]);

    const isDean = currentUser?.role === 'Dean';
    const isHoD = currentUser?.role === 'HoD';

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
                        .catch(err => console.error('Error fetching dean departments (visualize):', err));
                }
            }
        } catch (e) {
            console.error('Error parsing user from localStorage (visualize):', e);
        }
    }, []);

    useEffect(() => {
        if (mode === 'department') {
            if (isDean) {
                // For Dean, fetch current AY directly (no degree needed)
                fetchDeanCurrentAY();
            } else if (isHoD) {
                // For HoD, fetch current AY directly and auto-set department
                if (currentUser?.department) {
                    setFilters(prev => ({
                        ...prev,
                        courseOfferingDept: currentUser.department
                    }));
                    fetchHoDCurrentAY();
                }
            } else {
                fetchDegrees();
            }
        } else if (mode === 'radar') {
            fetchArtsOrEnggOptions();
        }
    }, [mode, isDean, isHoD, currentUser?.department]);

    // Fetch current AY when degree changes (for department mode - non-Dean/non-HoD)
    useEffect(() => {
        if (mode === 'department' && !isDean && !isHoD && filters.degree) {
            fetchCurrentAY(filters.degree);
            // Reset dependent filters
            setFilters(prev => ({
                ...prev,
                currentAY: '',
                semester: '',
                courseOfferingDept: ''
            }));
        } else if (mode === 'department' && !isDean && !isHoD) {
            setOptions(prev => ({ ...prev, currentAYs: [], semesters: [], courseOfferingDepts: [] }));
        }
    }, [filters.degree, mode, isDean, isHoD]);

    // Fetch current AY when artsOrEngg changes (for radar mode)
    useEffect(() => {
        if (mode === 'radar' && filters.artsOrEngg) {
            fetchCurrentAYForRadar();
            // Reset dependent filters
            setFilters(prev => ({
                ...prev,
                currentAY: '',
                semester: ''
            }));
        } else if (mode === 'radar') {
            setOptions(prev => ({ ...prev, currentAYs: [], semesters: [] }));
        }
    }, [filters.artsOrEngg, mode]);

    // Fetch semesters when current AY changes (for department mode)
    useEffect(() => {
        if (mode === 'department' && filters.currentAY) {
            if (isDean) {
                fetchDeanSemesters(filters.currentAY);
            } else if (isHoD) {
                fetchHoDSemesters(filters.currentAY);
            } else if (filters.degree) {
                fetchSemesters(filters.degree, filters.currentAY);
            }
            // Reset dependent filters
            setFilters(prev => ({
                ...prev,
                semester: '',
                courseOfferingDept: isHoD ? (currentUser?.department || prev.courseOfferingDept) : ''
            }));
        } else if (mode === 'department') {
            setOptions(prev => ({ ...prev, semesters: [], courseOfferingDepts: [] }));
        }
    }, [filters.currentAY, filters.degree, mode, isDean, isHoD, currentUser?.department]);

    // Fetch semesters when current AY changes (for radar mode)
    useEffect(() => {
        if (mode === 'radar' && filters.currentAY && filters.artsOrEngg) {
            fetchSemestersForRadar(filters.currentAY);
            // Reset dependent filters
            setFilters(prev => ({
                ...prev,
                semester: ''
            }));
        } else if (mode === 'radar') {
            setOptions(prev => ({ ...prev, semesters: [] }));
        }
    }, [filters.currentAY, filters.artsOrEngg, mode]);

    // Fetch course offering departments when semester changes (for department mode)
    // Note: For HoD, department is already set, so we don't need to fetch departments
    useEffect(() => {
        if (mode === 'department' && filters.semester && filters.currentAY) {
            if (isDean) {
                fetchDeanDepartments(filters.currentAY, filters.semester);
            } else if (isHoD) {
                // For HoD, department is already set, no need to fetch
                // Just ensure it's set in filters
                if (currentUser?.department) {
                    setFilters(prev => ({
                        ...prev,
                        courseOfferingDept: currentUser.department
                    }));
                }
            } else if (filters.degree) {
                fetchCourseOfferingDepts(filters.degree, filters.currentAY, filters.semester);
            }
            // Reset dependent filters (but keep courseOfferingDept for HoD)
            if (!isHoD) {
                setFilters(prev => ({
                    ...prev,
                    courseOfferingDept: ''
                }));
            }
        } else if (mode === 'department') {
            setOptions(prev => ({ ...prev, courseOfferingDepts: [] }));
        }
    }, [filters.semester, filters.degree, filters.currentAY, mode, isDean, isHoD, currentUser?.department]);


    const fetchDegrees = async () => {
        try {
            const response = await fetch(`${SERVER_URL}/api/analysis/degrees`);
            const data = await response.json();
            if (Array.isArray(data)) {
                setOptions(prev => ({ ...prev, degrees: data }));
            }
        } catch (error) {
            console.error('Error fetching degrees:', error);
        }
    };

    const fetchCurrentAY = async (degree) => {
        try {
            const params = new URLSearchParams({ degree });
            const response = await fetch(`${SERVER_URL}/api/analysis/current-ay?${params.toString()}`);
            const data = await response.json();
            setOptions(prev => ({ ...prev, currentAYs: Array.isArray(data) ? data : [] }));
        } catch (error) {
            console.error('Error fetching current AY:', error);
            setOptions(prev => ({ ...prev, currentAYs: [] }));
        }
    };

    const fetchSemesters = async (degree, currentAY) => {
        try {
            const params = new URLSearchParams({ degree });
            if (currentAY) {
                params.append('currentAY', currentAY);
            }
            const response = await fetch(`${SERVER_URL}/api/analysis/semesters?${params.toString()}`);
            const data = await response.json();
            setOptions(prev => ({ ...prev, semesters: Array.isArray(data) ? data : [] }));
        } catch (error) {
            console.error('Error fetching semesters:', error);
            setOptions(prev => ({ ...prev, semesters: [] }));
        }
    };

    const fetchCourseOfferingDepts = async (degree, currentAY, semester) => {
        try {
            const params = new URLSearchParams({ degree });
            if (currentAY) params.append('currentAY', currentAY);
            if (semester) params.append('semester', semester);
            const response = await fetch(`${SERVER_URL}/api/analysis/course-offering-depts?${params.toString()}`);
            const data = await response.json();
            let depts = Array.isArray(data) ? data : [];

            // Apply role-based department scoping
            if (currentUser?.role === 'HoD' && allowedDepts.length > 0) {
                depts = depts.filter(d => allowedDepts.includes(d));
            } else if (currentUser?.role === 'Dean' && allowedDepts.length > 0) {
                depts = depts.filter(d => allowedDepts.includes(d));
            }

            setOptions(prev => ({ ...prev, courseOfferingDepts: depts }));
        } catch (error) {
            console.error('Error fetching course offering departments:', error);
            setOptions(prev => ({ ...prev, courseOfferingDepts: [] }));
        }
    };

    // Dean-specific fetch functions (no degree required)
    const fetchDeanCurrentAY = async () => {
        try {
            if (!currentUser?.school) return;
            const params = new URLSearchParams({ school: currentUser.school });
            const response = await fetch(`${SERVER_URL}/api/analysis/dean/current-ay?${params.toString()}`);
            const data = await response.json();
            setOptions(prev => ({ ...prev, currentAYs: Array.isArray(data) ? data : [] }));
        } catch (error) {
            console.error('Error fetching dean current AY:', error);
            setOptions(prev => ({ ...prev, currentAYs: [] }));
        }
    };

    const fetchDeanSemesters = async (currentAY) => {
        try {
            if (!currentUser?.school) return;
            const params = new URLSearchParams({ school: currentUser.school });
            if (currentAY) params.append('currentAY', currentAY);
            const response = await fetch(`${SERVER_URL}/api/analysis/dean/semesters?${params.toString()}`);
            const data = await response.json();
            setOptions(prev => ({ ...prev, semesters: Array.isArray(data) ? data : [] }));
        } catch (error) {
            console.error('Error fetching dean semesters:', error);
            setOptions(prev => ({ ...prev, semesters: [] }));
        }
    };

    const fetchDeanDepartments = async (currentAY, semester) => {
        try {
            if (!currentUser?.school) return;
            const params = new URLSearchParams({ school: currentUser.school });
            if (currentAY) params.append('currentAY', currentAY);
            if (semester) params.append('semester', semester);
            const response = await fetch(`${SERVER_URL}/api/analysis/dean/departments?${params.toString()}`);
            const data = await response.json();
            let depts = Array.isArray(data) ? data : [];

            // Apply role-based department scoping
            if (allowedDepts.length > 0) {
                depts = depts.filter(d => allowedDepts.includes(d));
            }

            setOptions(prev => ({ ...prev, courseOfferingDepts: depts }));
        } catch (error) {
            console.error('Error fetching dean departments:', error);
            setOptions(prev => ({ ...prev, courseOfferingDepts: [] }));
        }
    };

    // HoD-specific: fetch current AY based on department
    const fetchHoDCurrentAY = async () => {
        try {
            if (!currentUser?.department) return;
            const params = new URLSearchParams({ department: currentUser.department });
            const response = await fetch(`${SERVER_URL}/api/analysis/hod/current-ay?${params.toString()}`);
            const data = await response.json();
            setOptions(prev => ({ ...prev, currentAYs: Array.isArray(data) ? data : [] }));
        } catch (error) {
            console.error('Error fetching HoD current AY:', error);
            setOptions(prev => ({ ...prev, currentAYs: [] }));
        }
    };

    // HoD-specific: fetch semesters based on department + AY
    const fetchHoDSemesters = async (currentAY) => {
        try {
            if (!currentUser?.department) return;
            const params = new URLSearchParams({ department: currentUser.department });
            if (currentAY) params.append('currentAY', currentAY);
            const response = await fetch(`${SERVER_URL}/api/analysis/hod/semesters?${params.toString()}`);
            const data = await response.json();
            setOptions(prev => ({ ...prev, semesters: Array.isArray(data) ? data : [] }));
        } catch (error) {
            console.error('Error fetching HoD semesters:', error);
            setOptions(prev => ({ ...prev, semesters: [] }));
        }
    };

    const fetchCurrentAYForRadar = async () => {
        try {
            const response = await fetch(`${SERVER_URL}/api/visualization/current-ay`);
            const data = await response.json();
            setOptions(prev => ({ ...prev, currentAYs: Array.isArray(data) ? data : [] }));
        } catch (error) {
            console.error('Error fetching current AY for radar:', error);
            setOptions(prev => ({ ...prev, currentAYs: [] }));
        }
    };

    const fetchSemestersForRadar = async (currentAY) => {
        try {
            const params = new URLSearchParams();
            if (currentAY) {
                params.append('currentAY', currentAY);
            }
            const response = await fetch(`${SERVER_URL}/api/visualization/semesters?${params.toString()}`);
            const data = await response.json();
            setOptions(prev => ({ ...prev, semesters: Array.isArray(data) ? data : [] }));
        } catch (error) {
            console.error('Error fetching semesters for radar:', error);
            setOptions(prev => ({ ...prev, semesters: [] }));
        }
    };

    const fetchArtsOrEnggOptions = async () => {
        try {
            const response = await fetch(`${SERVER_URL}/api/visualization/arts-or-engg`);
            if (!response.ok) {
                throw new Error('Failed to fetch arts/engg options');
            }
            const data = await response.json();
            setOptions(prev => ({ ...prev, artsOrEnggOptions: Array.isArray(data) ? data : [] }));
        } catch (error) {
            console.error('Error fetching arts/engg options:', error);
            setOptions(prev => ({ ...prev, artsOrEnggOptions: [] }));
        }
    };

    const handleGenerateVisualization = async () => {
        if (isHoD) {
            // HoD: no degree or courseOfferingDept required (auto-set)
            if (!filters.currentAY || !filters.semester || !currentUser?.department) {
                setError('Please select Current AY and Semester.');
                return;
            }
        } else if (isDean) {
            // Dean: no degree required
            if (!filters.currentAY || !filters.semester || !filters.courseOfferingDept) {
                setError('Please select Current AY, Semester, and Course Offering Department.');
                return;
            }
        } else {
            // Regular user: degree required
            if (!filters.degree || !filters.currentAY || !filters.semester || !filters.courseOfferingDept) {
                setError('Please select Degree, Current AY, Semester, and Course Offering Department.');
                return;
            }
        }

        try {
            setLoading(true);
            setError(null);
            
            let params, endpoint;
            if (isHoD) {
                // HoD-specific endpoint (no degree, department auto-set)
                params = new URLSearchParams({
                    currentAY: filters.currentAY,
                    semester: filters.semester,
                    courseOfferingDept: currentUser?.department || filters.courseOfferingDept
                });
                endpoint = `${SERVER_URL}/api/visualization/hod/department?${params.toString()}`;
            } else if (isDean) {
                // Dean-specific endpoint (no degree)
                params = new URLSearchParams({
                    currentAY: filters.currentAY,
                    semester: filters.semester,
                    courseOfferingDept: filters.courseOfferingDept
                });
                endpoint = `${SERVER_URL}/api/visualization/dean/department?${params.toString()}`;
            } else {
                // Regular endpoint (with degree)
                params = new URLSearchParams({
                    degree: filters.degree,
                    currentAY: filters.currentAY,
                    semester: filters.semester,
                    courseOfferingDept: filters.courseOfferingDept
                });
                endpoint = `${SERVER_URL}/api/visualization/department?${params.toString()}`;
            }
            
            const response = await fetch(endpoint);
            
            const data = await response.json();
            
            if (data.success) {
                setVisualizationData(data);
            } else {
                setError(data.error || 'Failed to fetch visualization data');
            }
        } catch (error) {
            console.error('Error generating visualization:', error);
            setError('Error generating visualization. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    // Handle course click - sync with analysis component
    const handleCourseClick = (courseCode) => {
        // Save filters and course to localStorage for analysis component
        const filtersToSave = {
            degree: isDean ? '' : filters.degree, // Empty for Dean
            currentAY: filters.currentAY,
            semester: filters.semester,
            courseOfferingDept: filters.courseOfferingDept,
            course: courseCode
        };
        
        localStorage.setItem('analysisFilters', JSON.stringify(filtersToSave));
        console.log('Course selected and saved to localStorage:', courseCode);
        
        // Navigate to analysis page
        navigate('/analysis');
    };

    const fetchArtsEnggAggregation = async () => {
        if (!filters.artsOrEngg || !filters.currentAY || !filters.semester) {
            alert('Please select Category (Arts/Engineering), Current Academic Year, and Semester.');
            return;
        }

        try {
            setAggLoading(true);
            setArtsEnggData(null);
            const response = await fetch(`${SERVER_URL}/api/visualization/school-radar`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    artsOrEngg: filters.artsOrEngg,
                    currentAY: filters.currentAY,
                    semester: filters.semester
                })
            });
            if (!response.ok) {
                const e = await response.json().catch(() => ({}));
                throw new Error(e.error || `HTTP ${response.status}`);
            }
            const payload = await response.json();
            if (!payload?.success) {
                throw new Error(payload?.error || 'Failed to fetch radar chart data');
            }
            setArtsEnggData(payload.data);
            // Data will be rendered automatically by useEffect when artsEnggData changes
        } catch (e) {
            console.error('Aggregation error:', e);
            alert(`Failed to load radar chart data: ${e.message}`);
        } finally {
            setAggLoading(false);
        }
    };

    // JS-only aggregation card rendering (no JSX) - Only in radar mode
    useEffect(() => {
        if (mode !== 'radar' || !aggJsRootRef.current) return;
        
        // If already rendered, update button state and re-render data if available
        if (aggJsRenderedRef.current) {
            const buttons = aggJsRootRef.current.querySelectorAll('button.generate-button');
            const loadBtn = buttons[0];
            const downloadBtn = buttons[1];
            
            if (loadBtn) {
                loadBtn.disabled = !filters.artsOrEngg || !filters.currentAY || !filters.semester;
            }
            if (downloadBtn) {
                downloadBtn.disabled = !artsEnggData || !filters.artsOrEngg;
            }
            // Re-render data if it exists and category is selected
            if (artsEnggData && filters.artsOrEngg) {
                const results = aggJsRootRef.current.querySelector('.aggregation-bars');
                const canvas = aggJsRootRef.current.querySelector('canvas');
                if (results && canvas) {
                    // Access the renderBars function from closure - we need to recreate it
                    // For now, just trigger a re-render by clearing and re-adding
                    const cat = filters.artsOrEngg.toUpperCase();
                    const map = artsEnggData.by_department?.[cat] || {};
                    const labels = Object.keys(map).map(key => ({ key, label: map[key]?.original_name || key }));
                    const values = labels.map(({ key }) => {
                        const entry = map[key];
                        return entry ? entry.percent_ge_80 : 0;
                    });
                    
                    // Re-render bars and radar
                    results.innerHTML = '';
                    const summary = document.createElement('div');
                    summary.className = 'aggregation-summary';
                    summary.style.cssText = 'background: linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%); color: white; padding: 20px; border-radius: 12px; margin-bottom: 24px; box-shadow: 0 4px 6px rgba(37, 99, 235, 0.2);';
                    const total = artsEnggData?.totals?.[cat] || { total: 0, count_ge_80: 0, percent_ge_80: 0 };
                    const categoryName = cat === 'ENGG' ? 'Engineering' : 'Arts';
                    summary.innerHTML = `
                        <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 8px;">
                            <span style="font-size: 24px;">📊</span>
                            <h3 style="margin: 0; font-size: 18px; font-weight: 600;">${categoryName} Category Overview</h3>
                        </div>
                        <div style="display: flex; align-items: baseline; gap: 16px; flex-wrap: wrap;">
                            <div>
                                <div style="font-size: 12px; opacity: 0.9; margin-bottom: 4px;">Overall Performance</div>
                                <div style="font-size: 32px; font-weight: 700;">${total.percent_ge_80 || 0}%</div>
                            </div>
                            <div style="font-size: 14px; opacity: 0.9; padding-left: 16px; border-left: 1px solid rgba(255,255,255,0.3);">
                                <div style="margin-bottom: 4px;">Faculty-Course Groups</div>
                                <div style="font-size: 18px; font-weight: 600;">${total.count_ge_80 || 0} / ${total.total || 0}</div>
                            </div>
                        </div>
                    `;
                    results.appendChild(summary);
                    
                    const list = document.createElement('div');
                    list.className = 'bar-list';
                    list.style.cssText = 'display: flex; flex-direction: column; gap: 12px;';
                    
                    const sortedDepts = labels.sort((a, b) => {
                        const pctA = map[a.key]?.percent_ge_80 || 0;
                        const pctB = map[b.key]?.percent_ge_80 || 0;
                        return pctB - pctA;
                    });
                    
                    sortedDepts.forEach(({ key, label }) => {
                        const entry = map[key];
                        const pct = entry ? entry.percent_ge_80 : 0;
                        const num = entry ? entry.count_ge_80 : 0;
                        const den = entry ? entry.total : 0;

                        const row = document.createElement('div');
                        row.className = 'bar-row';
                        row.style.cssText = 'background: white; padding: 16px; border-radius: 8px; border: 1px solid #e2e8f0; display: flex; align-items: center; gap: 16px;';
                        
                        const labelDiv = document.createElement('div');
                        labelDiv.style.cssText = 'min-width: 120px; font-weight: 600; font-size: 14px; color: #1e293b;';
                        labelDiv.textContent = label;

                        const track = document.createElement('div');
                        track.style.cssText = 'flex: 1; height: 32px; background: #f1f5f9; border-radius: 6px; overflow: hidden;';
                        
                        const fill = document.createElement('div');
                        const fillColor = pct >= 80 ? '#22c55e' : pct >= 60 ? '#3b82f6' : pct >= 40 ? '#f59e0b' : '#ef4444';
                        fill.style.cssText = `width: ${Math.min(100, pct)}%; height: 100%; background: ${fillColor}; display: flex; align-items: center; justify-content: flex-end; padding-right: 8px;`;
                        if (pct > 15) {
                            const barText = document.createElement('span');
                            barText.style.cssText = 'color: white; font-weight: 600; font-size: 12px;';
                            barText.textContent = `${Math.round(pct)}%`;
                            fill.appendChild(barText);
                        }
                        track.appendChild(fill);

                        const value = document.createElement('div');
                        value.style.cssText = 'min-width: 100px; text-align: right; font-weight: 600; font-size: 14px; color: #475569;';
                        value.textContent = `${Math.round(pct)}% (${num}/${den})`;

                        row.appendChild(labelDiv);
                        row.appendChild(track);
                        row.appendChild(value);
                        list.appendChild(row);
                    });
                    results.appendChild(list);
                    
                    // Draw radar chart
                    const ctx = canvas.getContext('2d');
                    ctx.clearRect(0, 0, canvas.width, canvas.height);
                    if (labels.length > 0) {
                        const cx = canvas.width / 2;
                        const cy = canvas.height / 2;
                        const maxR = 180;
                        const steps = 5;
                        ctx.save();
                        ctx.translate(cx, cy);
                        for (let s = 1; s <= steps; s++) {
                            const r = (maxR * s) / steps;
                            ctx.beginPath();
                            ctx.strokeStyle = s === steps ? '#cbd5e1' : '#e2e8f0';
                            ctx.lineWidth = s === steps ? 2 : 1;
                            ctx.arc(0, 0, r, 0, Math.PI * 2);
                            ctx.stroke();
                        }
                        const n = labels.length;
                        const angleStep = (Math.PI * 2) / n;
                        labels.forEach(({ label }, i) => {
                            const angle = -Math.PI / 2 + i * angleStep;
                            const x = Math.cos(angle) * maxR;
                            const y = Math.sin(angle) * maxR;
                            ctx.beginPath();
                            ctx.strokeStyle = '#cbd5e1';
                            ctx.lineWidth = 1;
                            ctx.moveTo(0, 0);
                            ctx.lineTo(x, y);
                            ctx.stroke();
                            const labelDist = maxR + 35;
                            const lx = Math.cos(angle) * labelDist;
                            const ly = Math.sin(angle) * labelDist;
                            ctx.font = 'bold 13px sans-serif';
                            ctx.fillStyle = '#1e293b';
                            ctx.textAlign = 'center';
                            ctx.textBaseline = 'middle';
                            ctx.fillText(label, lx, ly);
                        });
                        ctx.beginPath();
                        values.forEach((val, i) => {
                            const angle = -Math.PI / 2 + i * angleStep;
                            const r = (Math.max(0, Math.min(100, val)) / 100) * maxR;
                            const x = Math.cos(angle) * r;
                            const y = Math.sin(angle) * r;
                            if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
                        });
                        ctx.closePath();
                        ctx.fillStyle = 'rgba(37, 99, 235, 0.3)';
                        ctx.fill();
                        ctx.strokeStyle = '#2563eb';
                        ctx.lineWidth = 3;
                        ctx.stroke();
                        ctx.restore();
                    }
                }
            }
            return;
        }

        const root = aggJsRootRef.current;
        const card = document.createElement('div');
        card.className = 'chart-card';

        const title = document.createElement('div');
        title.className = 'chart-title';
        const h3 = document.createElement('h3');
        h3.textContent = 'Percent of Faculty-Course groups with Final Score ≥ 80';
        const p = document.createElement('p');
        p.textContent = 'By category and department';
        title.appendChild(h3);
        title.appendChild(p);

        const controls = document.createElement('div');
        controls.className = 'aggregation-controls';
        controls.style.cssText = 'display: flex; gap: 12px; align-items: center;';

        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'generate-button';
        btn.textContent = 'Load Radar Chart';
        btn.disabled = !filters.artsOrEngg || !filters.currentAY || !filters.semester;

        const downloadBtn = document.createElement('button');
        downloadBtn.type = 'button';
        downloadBtn.className = 'generate-button';
        downloadBtn.style.cssText = 'background: linear-gradient(135deg, #10b981 0%, #059669 100%); border: none; color: white; padding: 10px 20px; border-radius: 8px; font-weight: 600; cursor: pointer; transition: all 0.2s;';
        downloadBtn.textContent = '📥 Download Chart';
        downloadBtn.disabled = !artsEnggData || !filters.artsOrEngg;
        downloadBtn.onmouseenter = () => {
            if (!downloadBtn.disabled) {
                downloadBtn.style.transform = 'translateY(-2px)';
                downloadBtn.style.boxShadow = '0 4px 12px rgba(16, 185, 129, 0.3)';
            }
        };
        downloadBtn.onmouseleave = () => {
            downloadBtn.style.transform = 'translateY(0)';
            downloadBtn.style.boxShadow = 'none';
        };

        controls.appendChild(btn);
        controls.appendChild(downloadBtn);

        const results = document.createElement('div');
        results.className = 'aggregation-bars';

        // Radar chart container with better styling
        const radarWrap = document.createElement('div');
        radarWrap.className = 'radar-chart-wrapper';
        radarWrap.style.marginTop = '24px';
        radarWrap.style.padding = '20px';
        radarWrap.style.backgroundColor = '#f8fafc';
        radarWrap.style.borderRadius = '12px';
        radarWrap.style.display = 'flex';
        radarWrap.style.justifyContent = 'center';
        radarWrap.style.alignItems = 'center';
        radarWrap.style.border = '1px solid #e2e8f0';
        const canvas = document.createElement('canvas');
        canvas.width = 600;
        canvas.height = 600;
        canvas.style.display = 'block';
        radarWrap.appendChild(canvas);

        card.appendChild(title);
        card.appendChild(controls);
        card.appendChild(results);
        card.appendChild(radarWrap);
        root.appendChild(card);

        const drawRadar = (data, cat) => {
            const ctx = canvas.getContext('2d');
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            if (!data) return;

            const map = data.by_department?.[cat] || {};
            const labels = Object.keys(map).map(key => ({ key, label: map[key]?.original_name || key }));
            if (labels.length === 0) return;

            const values = labels.map(({ key }) => {
                const entry = map[key];
                return entry ? entry.percent_ge_80 : 0;
            });

            const cx = canvas.width / 2;
            const cy = canvas.height / 2;
            const maxR = 180; // radius
            const steps = 5; // grid rings: 20,40,60,80,100

            ctx.save();
            ctx.translate(cx, cy);

            // Grid rings with better styling
            for (let s = 1; s <= steps; s++) {
                const r = (maxR * s) / steps;
                ctx.beginPath();
                ctx.strokeStyle = s === steps ? '#cbd5e1' : '#e2e8f0';
                ctx.lineWidth = s === steps ? 2 : 1;
                ctx.arc(0, 0, r, 0, Math.PI * 2);
                ctx.stroke();
                ctx.closePath();
                
                // Ring labels with better styling
                ctx.font = 'bold 11px sans-serif';
                ctx.fillStyle = '#64748b';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(`${(s * 100) / steps}%`, 0, -r - 3);
            }

            const n = labels.length;
            const angleStep = (Math.PI * 2) / n;

            // Axes with better styling
            labels.forEach(({ label }, i) => {
                const angle = -Math.PI / 2 + i * angleStep;
                const x = Math.cos(angle) * maxR;
                const y = Math.sin(angle) * maxR;
                
                // Axis line
                ctx.beginPath();
                ctx.strokeStyle = '#cbd5e1';
                ctx.lineWidth = 1;
                ctx.moveTo(0, 0);
                ctx.lineTo(x, y);
                ctx.stroke();
                ctx.closePath();

                // Department labels with better positioning
                const labelDist = maxR + 35;
                const lx = Math.cos(angle) * labelDist;
                const ly = Math.sin(angle) * labelDist;
                
                ctx.font = 'bold 13px sans-serif';
                ctx.fillStyle = '#1e293b';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                
                // Add background for better readability
                const textWidth = ctx.measureText(label).width;
                ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
                ctx.fillRect(lx - textWidth/2 - 4, ly - 8, textWidth + 8, 16);
                
                ctx.fillStyle = '#1e293b';
                ctx.fillText(label, lx, ly);
            });

            // Data polygon with gradient fill
            ctx.beginPath();
            const gradient = ctx.createLinearGradient(-maxR, -maxR, maxR, maxR);
            gradient.addColorStop(0, 'rgba(37, 99, 235, 0.4)');
            gradient.addColorStop(1, 'rgba(59, 130, 246, 0.25)');
            
            values.forEach((val, i) => {
                const angle = -Math.PI / 2 + i * angleStep;
                const r = (Math.max(0, Math.min(100, val)) / 100) * maxR;
                const x = Math.cos(angle) * r;
                const y = Math.sin(angle) * r;
                if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
            });
            ctx.closePath();
            ctx.fillStyle = gradient;
            ctx.fill();
            ctx.strokeStyle = '#2563eb';
            ctx.lineWidth = 3;
            ctx.stroke();

            // Points with value labels
            values.forEach((val, i) => {
                const angle = -Math.PI / 2 + i * angleStep;
                const r = (Math.max(0, Math.min(100, val)) / 100) * maxR;
                const x = Math.cos(angle) * r;
                const y = Math.sin(angle) * r;
                
                // Point circle
                ctx.beginPath();
                ctx.arc(x, y, 5, 0, Math.PI * 2);
                ctx.fillStyle = '#2563eb';
                ctx.fill();
                ctx.strokeStyle = '#ffffff';
                ctx.lineWidth = 2;
                ctx.stroke();
                ctx.closePath();
                
                // Value label near point
                const labelAngle = angle;
                const labelR = r + 20;
                const labelX = Math.cos(labelAngle) * labelR;
                const labelY = Math.sin(labelAngle) * labelR;
                
                ctx.font = 'bold 11px sans-serif';
                ctx.fillStyle = '#1e40af';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                
                // Background for value label
                const valText = `${Math.round(val)}%`;
                const valWidth = ctx.measureText(valText).width;
                ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
                ctx.fillRect(labelX - valWidth/2 - 3, labelY - 7, valWidth + 6, 14);
                
                ctx.fillStyle = '#1e40af';
                ctx.fillText(valText, labelX, labelY);
            });

            ctx.restore();
        };

        const renderBars = (data, cat) => {
            results.innerHTML = '';
            if (!data) {
                const c = canvas.getContext('2d');
                if (c && c.clearRect) c.clearRect(0, 0, canvas.width, canvas.height);
                return;
            }
            
            // Enhanced summary card
            const summary = document.createElement('div');
            summary.className = 'aggregation-summary';
            summary.style.cssText = 'background: linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%); color: white; padding: 20px; border-radius: 12px; margin-bottom: 24px; box-shadow: 0 4px 6px rgba(37, 99, 235, 0.2);';
            const total = data?.totals?.[cat] || { total: 0, count_ge_80: 0, percent_ge_80: 0 };
            const categoryName = cat === 'ENGG' ? 'Engineering' : 'Arts';
            summary.innerHTML = `
                <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 8px;">
                    <span style="font-size: 24px;">📊</span>
                    <h3 style="margin: 0; font-size: 18px; font-weight: 600;">${categoryName} Category Overview</h3>
                </div>
                <div style="display: flex; align-items: baseline; gap: 16px; flex-wrap: wrap;">
                    <div>
                        <div style="font-size: 12px; opacity: 0.9; margin-bottom: 4px;">Overall Performance</div>
                        <div style="font-size: 32px; font-weight: 700;">${total.percent_ge_80 || 0}%</div>
                    </div>
                    <div style="font-size: 14px; opacity: 0.9; padding-left: 16px; border-left: 1px solid rgba(255,255,255,0.3);">
                        <div style="margin-bottom: 4px;">Faculty-Course Groups</div>
                        <div style="font-size: 18px; font-weight: 600;">${total.count_ge_80 || 0} / ${total.total || 0}</div>
                    </div>
                </div>
            `;
            results.appendChild(summary);

            const list = document.createElement('div');
            list.className = 'bar-list';
            list.style.cssText = 'display: flex; flex-direction: column; gap: 12px;';
            
            const depts = Object.keys(data?.by_department?.[cat] || {});
            
            // Sort departments by percentage (descending)
            const sortedDepts = depts.sort((a, b) => {
                const pctA = data?.by_department?.[cat]?.[a]?.percent_ge_80 || 0;
                const pctB = data?.by_department?.[cat]?.[b]?.percent_ge_80 || 0;
                return pctB - pctA;
            });
            
            sortedDepts.forEach((dept) => {
                const entry = data?.by_department?.[cat]?.[dept];
                const pct = entry ? entry.percent_ge_80 : 0;
                const num = entry ? entry.count_ge_80 : 0;
                const den = entry ? entry.total : 0;

                const row = document.createElement('div');
                row.className = 'bar-row';
                row.style.cssText = 'background: white; padding: 16px; border-radius: 8px; border: 1px solid #e2e8f0; display: flex; align-items: center; gap: 16px; transition: all 0.2s;';
                row.onmouseenter = () => {
                    row.style.boxShadow = '0 4px 12px rgba(0,0,0,0.1)';
                    row.style.transform = 'translateY(-2px)';
                };
                row.onmouseleave = () => {
                    row.style.boxShadow = 'none';
                    row.style.transform = 'translateY(0)';
                };

                const labelDiv = document.createElement('div');
                labelDiv.className = 'bar-label';
                labelDiv.style.cssText = 'min-width: 120px; font-weight: 600; font-size: 14px; color: #1e293b;';
                labelDiv.textContent = entry?.original_name || dept;

                const track = document.createElement('div');
                track.className = 'bar-track';
                track.style.cssText = 'flex: 1; height: 32px; background: #f1f5f9; border-radius: 6px; overflow: hidden; position: relative;';
                
                const fill = document.createElement('div');
                fill.className = 'bar-fill';
                const fillColor = pct >= 80 ? '#22c55e' : pct >= 60 ? '#3b82f6' : pct >= 40 ? '#f59e0b' : '#ef4444';
                fill.style.cssText = `width: ${Math.min(100, pct)}%; height: 100%; background: ${fillColor}; display: flex; align-items: center; justify-content: flex-end; padding-right: 8px; transition: width 0.6s ease;`;
                
                // Add percentage text inside bar if there's space
                if (pct > 15) {
                    const barText = document.createElement('span');
                    barText.style.cssText = 'color: white; font-weight: 600; font-size: 12px;';
                    barText.textContent = `${Math.round(pct)}%`;
                    fill.appendChild(barText);
                }
                
                track.appendChild(fill);

                const value = document.createElement('div');
                value.className = 'bar-value';
                value.style.cssText = 'min-width: 100px; text-align: right; font-weight: 600; font-size: 14px; color: #475569;';
                value.textContent = `${Math.round(pct)}% (${num}/${den})`;

                row.appendChild(labelDiv);
                row.appendChild(track);
                row.appendChild(value);
                list.appendChild(row);
            });

            if (depts.length === 0) {
                const nd = document.createElement('div');
                nd.className = 'no-data-text';
                nd.textContent = 'No departments found for this category.';
                list.appendChild(nd);
            }

            results.appendChild(list);

            // Draw radar after bars
            drawRadar(data, cat);
        };

        // Download function for radar chart
        const downloadRadarChart = () => {
            if (!canvas || !artsEnggData || !filters.artsOrEngg) {
                alert('Please load the radar chart first.');
                return;
            }

            try {
                // Create a temporary link element
                const link = document.createElement('a');
                const cat = filters.artsOrEngg.toUpperCase();
                const categoryName = cat === 'ENGG' ? 'Engineering' : 'Arts';
                const fileName = `Radar_Chart_${categoryName}_${filters.currentAY}_Sem${filters.semester}_${new Date().toISOString().split('T')[0]}.png`;
                
                // Convert canvas to data URL and download
                link.download = fileName;
                link.href = canvas.toDataURL('image/png');
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                
                console.log('Radar chart downloaded successfully');
            } catch (error) {
                console.error('Error downloading radar chart:', error);
                alert('Failed to download radar chart. Please try again.');
            }
        };

        downloadBtn.addEventListener('click', downloadRadarChart);

        btn.addEventListener('click', async () => {
            btn.disabled = true;
            btn.textContent = 'Loading...';
            try {
                await fetchArtsEnggAggregation();
                // After fetching, render with the selected category from filters
                if (artsEnggData && filters.artsOrEngg) {
                    renderBars(artsEnggData, filters.artsOrEngg.toUpperCase());
                    // Enable download button after data is loaded
                    downloadBtn.disabled = false;
                }
            } finally {
                btn.disabled = false;
                btn.textContent = 'Load Radar Chart';
            }
        });

        // initial state - render if data exists and category is selected
        if (artsEnggData && filters.artsOrEngg) {
            renderBars(artsEnggData, filters.artsOrEngg.toUpperCase());
            downloadBtn.disabled = false;
        }

        aggJsRenderedRef.current = true;

        // cleanup listeners if unmount
        return () => {
            btn.replaceWith(btn.cloneNode(true));
            downloadBtn.replaceWith(downloadBtn.cloneNode(true));
            root.innerHTML = '';
            aggJsRenderedRef.current = false;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [mode, artsEnggData, filters.artsOrEngg, filters.currentAY, filters.semester]);

    // Filter faculty based on performance category
    const filterFacultyByPerformance = (faculty, filter) => {
        if (filter === 'all') return true;
        
        const score = faculty.overall_score || 0;
        
        switch (filter) {
            case 'excellent':
                return score >= 90;
            case 'good':
                return score >= 80 && score < 90;
            case 'average':
                return score >= 70 && score < 80;
            case 'needsImprovement':
                return score < 70;
            case 'highest':
                // Will be handled separately to show top performers
                return true;
            case 'lowest':
                // Will be handled separately to show bottom performers
                return true;
            default:
                return true;
        }
    };

    // Get filtered courses data
    const getFilteredData = () => {
        if (!visualizationData || !visualizationData.courses) return null;

        let filteredCourses = visualizationData.courses.map(course => ({
            ...course,
            faculties: course.faculties.filter(f => filterFacultyByPerformance(f, performanceFilter))
        })).filter(course => course.faculties.length > 0);

        // Handle highest/lowest filters
        if (performanceFilter === 'highest' || performanceFilter === 'lowest') {
            // Collect all faculty with their scores from original data
            const allFaculty = [];
            visualizationData.courses.forEach(course => {
                course.faculties.forEach(faculty => {
                    allFaculty.push({ ...faculty, course_code: course.course_code, course_name: course.course_name });
                });
            });

            // Sort by score
            allFaculty.sort((a, b) => {
                const scoreA = a.overall_score || 0;
                const scoreB = b.overall_score || 0;
                return performanceFilter === 'highest' ? scoreB - scoreA : scoreA - scoreB;
            });

            // Get top/bottom 10
            const topFaculty = allFaculty.slice(0, 10);
            
            // Group back by course
            const groupedByCourse = {};
            topFaculty.forEach(faculty => {
                if (!groupedByCourse[faculty.course_code]) {
                    groupedByCourse[faculty.course_code] = {
                        course_code: faculty.course_code,
                        course_name: faculty.course_name,
                        faculties: []
                    };
                }
                groupedByCourse[faculty.course_code].faculties.push(faculty);
            });

            filteredCourses = Object.values(groupedByCourse);
        }

        return filteredCourses;
    };

    const filteredCourses = getFilteredData();

    const getStatistics = () => {
        if (!visualizationData || !visualizationData.courses) return null;

        const allScores = [];
        const facultyByScore = { excellent: 0, good: 0, average: 0, needsImprovement: 0 };
        
        // Use filtered data if filter is applied, otherwise use all data
        const dataToUse = filteredCourses || visualizationData.courses;
        
        dataToUse.forEach(course => {
            course.faculties.forEach(faculty => {
                const score = faculty.overall_score || 0;
                allScores.push(score);
                
                if (score >= 90) facultyByScore.excellent++;
                else if (score >= 80) facultyByScore.good++;
                else if (score >= 70) facultyByScore.average++;
                else facultyByScore.needsImprovement++;
            });
        });

        const avgScore = allScores.length > 0 
            ? Math.round(allScores.reduce((a, b) => a + b, 0) / allScores.length)
            : 0;

        return {
            totalFaculty: allScores.length,
            averageScore: avgScore,
            maxScore: allScores.length > 0 ? Math.max(...allScores) : 0,
            minScore: allScores.length > 0 ? Math.min(...allScores) : 0,
            facultyByScore
        };
    };

    const stats = getStatistics();

    const getPieChartData = () => {
        if (!stats) return null;
        const total = stats.totalFaculty;
        if (total === 0) return null;
        
        const circumference = 2 * Math.PI * 80;
        const excellent = (stats.facultyByScore.excellent / total) * circumference;
        const good = (stats.facultyByScore.good / total) * circumference;
        const average = (stats.facultyByScore.average / total) * circumference;
        const needsImprovement = (stats.facultyByScore.needsImprovement / total) * circumference;
        
        return {
            excellent,
            good,
            average,
            needsImprovement,
            totalCircumference: circumference,
            offsets: {
                excellent: 0,
                good: excellent,
                average: excellent + good,
                needsImprovement: excellent + good + average
            }
        };
    };

    const pieData = getPieChartData();

    return (
        <div className="visualize-container">
            <header className="visualize-header">
                <div className="header-content">
                    <div className="logo-section">
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
                </div>
            </header>

            <main className="visualize-main">
                <div className="page-header">
                    <h2 className="page-title">
                        {mode === 'radar' ? 'Radar Chart Generation' : 'Feedback Analysis Dashboard'}
                    </h2>
                    <p className="page-subtitle">
                        {mode === 'radar' 
                            ? 'Category-wise performance visualization (Engineering/Arts)' 
                            : 'Comprehensive performance metrics and insights'}
                    </p>
                </div>

                {/* Show filters and department visualization only in department mode */}
                {mode === 'department' && (
                    <>
                        <div className="filters-panel">
                            <div className="filter-row">
                                {!isDean && !isHoD && (
                                    <div className="filter-item">
                                        <label htmlFor="degree-select">Degree</label>
                                        <select 
                                            id="degree-select"
                                            value={filters.degree}
                                            onChange={(e) => setFilters({ 
                                                ...filters, 
                                                degree: e.target.value,
                                                currentAY: '',
                                                semester: '',
                                                courseOfferingDept: ''
                                            })}
                                            className="filter-select"
                                        >
                                            <option value="">Select Degree</option>
                                            {options.degrees.map(degree => (
                                                <option key={degree} value={degree}>{degree}</option>
                                            ))}
                                        </select>
                                    </div>
                                )}

                                <div className="filter-item">
                                    <label htmlFor="current-ay-select">Current Academic Year</label>
                                    <select
                                        id="current-ay-select"
                                        value={filters.currentAY}
                                        onChange={(e) => setFilters({
                                            ...filters,
                                            currentAY: e.target.value,
                                            semester: '',
                                            courseOfferingDept: ''
                                        })}
                                        disabled={!isDean && !isHoD && !filters.degree}
                                        className="filter-select"
                                    >
                                        <option value="">Select Academic Year</option>
                                        {options.currentAYs.map(ay => (
                                            <option key={ay} value={ay}>{ay}</option>
                                        ))}
                                    </select>
                                </div>

                                <div className="filter-item">
                                    <label htmlFor="semester-select">Semester</label>
                                    <select
                                        id="semester-select"
                                        value={filters.semester}
                                        onChange={(e) => setFilters({
                                            ...filters,
                                            semester: e.target.value,
                                            courseOfferingDept: isHoD ? (currentUser?.department || filters.courseOfferingDept) : ''
                                        })}
                                        disabled={!filters.currentAY}
                                        className="filter-select"
                                    >
                                        <option value="">Select Semester</option>
                                        {options.semesters.map(sem => (
                                            <option key={sem} value={sem}>{sem}</option>
                                        ))}
                                    </select>
                                </div>

                                {!isHoD && (
                                    <div className="filter-item">
                                        <label htmlFor="course-offering-dept-select">Course Offering Department</label>
                                        <select 
                                            id="course-offering-dept-select"
                                            value={filters.courseOfferingDept}
                                            onChange={(e) => setFilters({
                                                ...filters,
                                                courseOfferingDept: e.target.value
                                            })}
                                            disabled={!filters.semester}
                                            className="filter-select"
                                        >
                                            <option value="">Select Course Offering Department</option>
                                            {options.courseOfferingDepts.map(dept => (
                                                <option key={dept} value={dept}>{dept}</option>
                                            ))}
                                        </select>
                                    </div>
                                )}

                                <button
                                    type="button"
                                    className="generate-button"
                                    onClick={handleGenerateVisualization}
                                    disabled={(!isDean && !isHoD && !filters.degree) || (!isHoD && !filters.courseOfferingDept) || (!isHoD && !isDean && !filters.currentAY) || (!isHoD && !isDean && !filters.semester) || loading}
                                >
                                    {loading ? 'Loading...' : 'Generate Report'}
                                </button>
                            </div>
                        </div>
                    </>
                )}

                {/* Show filters for radar mode */}
                {mode === 'radar' && (
                    <div className="filters-panel">
                        <div className="filter-row">
                            <div className="filter-item">
                                <label htmlFor="radar-arts-engg-select">Category (Arts/Engineering) *</label>
                                <select 
                                    id="radar-arts-engg-select"
                                    value={filters.artsOrEngg}
                                    onChange={(e) => setFilters({ 
                                        ...filters, 
                                        artsOrEngg: e.target.value,
                                        currentAY: '',
                                        semester: ''
                                    })}
                                    className="filter-select"
                                >
                                    <option value="">Select Category</option>
                                    {options.artsOrEnggOptions.map(option => (
                                        <option key={option} value={option}>
                                            {option === 'ARTS' ? 'Arts' : option === 'ENGG' ? 'Engineering' : option}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            <div className="filter-item">
                                <label htmlFor="radar-current-ay-select">Current Academic Year *</label>
                                <select
                                    id="radar-current-ay-select"
                                    value={filters.currentAY}
                                    onChange={(e) => setFilters({
                                        ...filters,
                                        currentAY: e.target.value,
                                        semester: ''
                                    })}
                                    disabled={!filters.artsOrEngg}
                                    className="filter-select"
                                >
                                    <option value="">Select Academic Year</option>
                                    {options.currentAYs.map(ay => (
                                        <option key={ay} value={ay}>{ay}</option>
                                    ))}
                                </select>
                            </div>

                            <div className="filter-item">
                                <label htmlFor="radar-semester-select">Semester *</label>
                                <select
                                    id="radar-semester-select"
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
                            </div>
                        </div>
                    </div>
                )}

                {/* JS-rendered aggregation card mount point - Show only in radar mode */}
                {mode === 'radar' && <div ref={aggJsRootRef}></div>}

                {error && (
                    <div className="error-alert">
                        <span className="error-icon">⚠</span>
                        <span>{error}</span>
                    </div>
                )}

                {loading && (
                    <div className="loading-container">
                        <div className="spinner-small"></div>
                        <p>Processing data...</p>
                    </div>
                )}

                {/* Show department visualization only in department mode */}
                {mode === 'department' && visualizationData && visualizationData.success && (
                    <div className="dashboard-content">
                        {/* Performance Filter */}
                        <div className="performance-filter-panel">
                            <label htmlFor="performance-filter" className="filter-label">Filter by Performance:</label>
                            <select
                                id="performance-filter"
                                value={performanceFilter}
                                onChange={(e) => setPerformanceFilter(e.target.value)}
                                className="performance-filter-select"
                            >
                                <option value="all">All Faculty</option>
                                <option value="excellent">Excellent (≥90%)</option>
                                <option value="good">Good (80-89%)</option>
                                <option value="average">Average (70-79%)</option>
                                <option value="needsImprovement">Needs Improvement (&lt;70%)</option>
                                <option value="highest">Top 10 Highest</option>
                                <option value="lowest">Top 10 Lowest</option>
                            </select>
                            {performanceFilter !== 'all' && (
                                <span className="filter-badge">
                                    Showing {stats?.totalFaculty || 0} faculty
                                </span>
                            )}
                        </div>

                        {/* Summary Cards */}
                        {stats && (
                            <div className="summary-cards">
                                <div className="summary-card">
                                    <div className="card-header">
                                        <span className="card-icon">👥</span>
                                        <h3>Total Faculty</h3>
                                    </div>
                                    <div className="card-value">{stats.totalFaculty}</div>
                                </div>
                                <div className="summary-card">
                                    <div className="card-header">
                                        <span className="card-icon">📊</span>
                                        <h3>Average Score</h3>
                                    </div>
                                    <div className="card-value">{stats.averageScore}%</div>
                                    <div className="card-progress">
                                        <div 
                                            className="progress-fill" 
                                            style={{ width: `${stats.averageScore}%` }}
                                        ></div>
                                    </div>
                                </div>
                                <div className="summary-card">
                                    <div className="card-header">
                                        <span className="card-icon">⭐</span>
                                        <h3>Highest Score</h3>
                                    </div>
                                    <div className="card-value">{stats.maxScore}%</div>
                                </div>
                                <div className="summary-card">
                                    <div className="card-header">
                                        <span className="card-icon">📈</span>
                                        <h3>Lowest Score</h3>
                                    </div>
                                    <div className="card-value">{stats.minScore}%</div>
                                </div>
                            </div>
                        )}

                        {/* Charts Section */}
                        {stats && (
                            <div className="charts-panel">
                                {/* Pie Chart */}
                                {pieData && (
                                    <div className="chart-card">
                                        <div className="chart-title">
                                            <h3>Performance Distribution</h3>
                                            <p>Faculty categorized by performance levels</p>
                                        </div>
                                        <div className="pie-chart-container">
                                            <svg className="pie-chart" viewBox="0 0 200 200">
                                                <circle 
                                                    cx="100" 
                                                    cy="100" 
                                                    r="80" 
                                                    fill="none" 
                                                    stroke="#e8e9eb" 
                                                    strokeWidth="30" 
                                                />
                                                {stats.facultyByScore.excellent > 0 && (
                                                    <circle 
                                                        cx="100" 
                                                        cy="100" 
                                                        r="80" 
                                                        fill="none" 
                                                        stroke="#2e7d32" 
                                                        strokeWidth="30"
                                                        strokeDasharray={`${pieData.excellent} ${pieData.totalCircumference}`}
                                                        strokeDashoffset={-pieData.offsets.excellent}
                                                        transform="rotate(-90 100 100)"
                                                        className="pie-segment"
                                                    />
                                                )}
                                                {stats.facultyByScore.good > 0 && (
                                                    <circle 
                                                        cx="100" 
                                                        cy="100" 
                                                        r="80" 
                                                        fill="none" 
                                                        stroke="#1976d2" 
                                                        strokeWidth="30"
                                                        strokeDasharray={`${pieData.good} ${pieData.totalCircumference}`}
                                                        strokeDashoffset={-pieData.offsets.good}
                                                        transform="rotate(-90 100 100)"
                                                        className="pie-segment"
                                                    />
                                                )}
                                                {stats.facultyByScore.average > 0 && (
                                                    <circle 
                                                        cx="100" 
                                                        cy="100" 
                                                        r="80" 
                                                        fill="none" 
                                                        stroke="#ed6c02" 
                                                        strokeWidth="30"
                                                        strokeDasharray={`${pieData.average} ${pieData.totalCircumference}`}
                                                        strokeDashoffset={-pieData.offsets.average}
                                                        transform="rotate(-90 100 100)"
                                                        className="pie-segment"
                                                    />
                                                )}
                                                {stats.facultyByScore.needsImprovement > 0 && (
                                                    <circle 
                                                        cx="100" 
                                                        cy="100" 
                                                        r="80" 
                                                        fill="none" 
                                                        stroke="#d32f2f" 
                                                        strokeWidth="30"
                                                        strokeDasharray={`${pieData.needsImprovement} ${pieData.totalCircumference}`}
                                                        strokeDashoffset={-pieData.offsets.needsImprovement}
                                                        transform="rotate(-90 100 100)"
                                                        className="pie-segment"
                                                    />
                                                )}
                                                <text x="100" y="95" textAnchor="middle" className="pie-center-value">
                                                    {stats.totalFaculty}
                                                </text>
                                                <text x="100" y="110" textAnchor="middle" className="pie-center-label">
                                                    Faculty
                                                </text>
                                            </svg>
                                            <div className="pie-legend">
                                                <div className="legend-row">
                                                    <div className="legend-item">
                                                        <span className="legend-dot excellent"></span>
                                                        <span className="legend-text">Excellent (≥90%)</span>
                                                        <span className="legend-count">{stats.facultyByScore.excellent}</span>
                                                    </div>
                                                    <div className="legend-item">
                                                        <span className="legend-dot good"></span>
                                                        <span className="legend-text">Good (80-89%)</span>
                                                        <span className="legend-count">{stats.facultyByScore.good}</span>
                                                    </div>
                                                </div>
                                                <div className="legend-row">
                                                    <div className="legend-item">
                                                        <span className="legend-dot average"></span>
                                                        <span className="legend-text">Average (70-79%)</span>
                                                        <span className="legend-count">{stats.facultyByScore.average}</span>
                                                    </div>
                                                    <div className="legend-item">
                                                        <span className="legend-dot needs-improvement"></span>
                                                        <span className="legend-text">Needs Improvement (&lt;70%)</span>
                                                        <span className="legend-count">{stats.facultyByScore.needsImprovement}</span>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {/* Bar Chart */}
                                <div className="chart-card">
                                    <div className="chart-title">
                                        <h3>Performance Breakdown</h3>
                                        <p>Distribution across performance categories</p>
                                    </div>
                                    <div className="bar-chart-container">
                                        <div className="bar-item">
                                            <div className="bar-label-row">
                                                <span className="bar-label">Excellent (≥90%)</span>
                                                <span className="bar-count">{stats.facultyByScore.excellent}</span>
                                            </div>
                                            <div className="bar-track">
                                                <div 
                                                    className="bar-fill excellent" 
                                                    style={{ 
                                                        width: `${stats.totalFaculty > 0 ? (stats.facultyByScore.excellent / stats.totalFaculty) * 100 : 0}%` 
                                                    }}
                                                >
                                                    <span className="bar-percentage">
                                                        {stats.totalFaculty > 0 ? Math.round((stats.facultyByScore.excellent / stats.totalFaculty) * 100) : 0}%
                                                    </span>
                                                </div>
                                            </div>
                                        </div>
                                        <div className="bar-item">
                                            <div className="bar-label-row">
                                                <span className="bar-label">Good (80-89%)</span>
                                                <span className="bar-count">{stats.facultyByScore.good}</span>
                                            </div>
                                            <div className="bar-track">
                                                <div 
                                                    className="bar-fill good" 
                                                    style={{ 
                                                        width: `${stats.totalFaculty > 0 ? (stats.facultyByScore.good / stats.totalFaculty) * 100 : 0}%` 
                                                    }}
                                                >
                                                    <span className="bar-percentage">
                                                        {stats.totalFaculty > 0 ? Math.round((stats.facultyByScore.good / stats.totalFaculty) * 100) : 0}%
                                                    </span>
                                                </div>
                                            </div>
                                        </div>
                                        <div className="bar-item">
                                            <div className="bar-label-row">
                                                <span className="bar-label">Average (70-79%)</span>
                                                <span className="bar-count">{stats.facultyByScore.average}</span>
                                            </div>
                                            <div className="bar-track">
                                                <div 
                                                    className="bar-fill average" 
                                                    style={{ 
                                                        width: `${stats.totalFaculty > 0 ? (stats.facultyByScore.average / stats.totalFaculty) * 100 : 0}%` 
                                                    }}
                                                >
                                                    <span className="bar-percentage">
                                                        {stats.totalFaculty > 0 ? Math.round((stats.facultyByScore.average / stats.totalFaculty) * 100) : 0}%
                                                    </span>
                                                </div>
                                            </div>
                                        </div>
                                        <div className="bar-item">
                                            <div className="bar-label-row">
                                                <span className="bar-label">Needs Improvement (&lt;70%)</span>
                                                <span className="bar-count">{stats.facultyByScore.needsImprovement}</span>
                                            </div>
                                            <div className="bar-track">
                                                <div 
                                                    className="bar-fill needs-improvement" 
                                                    style={{ 
                                                        width: `${stats.totalFaculty > 0 ? (stats.facultyByScore.needsImprovement / stats.totalFaculty) * 100 : 0}%` 
                                                    }}
                                                >
                                                    <span className="bar-percentage">
                                                        {stats.totalFaculty > 0 ? Math.round((stats.facultyByScore.needsImprovement / stats.totalFaculty) * 100) : 0}%
                                                    </span>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Course-wise Performance */}
                        <div className="courses-section">
                            <div className="section-title">
                                <h3>Course-wise Faculty Performance</h3>
                                <p>Detailed analysis for each course</p>
                            </div>
                            {filteredCourses && filteredCourses.length > 0 ? (
                                <div className="courses-list">
                                    {filteredCourses.map((course, idx) => {
                                    const courseAvg = course.faculties.length > 0
                                        ? Math.round(course.faculties.reduce((sum, f) => sum + (f.overall_score || 0), 0) / course.faculties.length)
                                        : 0;
                                    return (
                                        <div key={idx} className="course-card" style={{ cursor: 'pointer' }} onClick={() => handleCourseClick(course.course_code)}>
                                            <div className="course-card-header">
                                                <div>
                                                    <div className="course-code">{course.course_code}</div>
                                                    <h4>{course.course_name}</h4>
                                                </div>
                                                <div className="course-meta">
                                                    <span className="meta-item">{course.faculties.length} Faculty</span>
                                                    <span className="meta-item">Avg: {courseAvg}%</span>
                                                    <span className="meta-item" style={{ background: '#2563eb', color: 'white', fontWeight: '600' }}>Click to Analyze</span>
                                                </div>
                                            </div>
                                            <div className="faculty-table">
                                                {course.faculties
                                                    .sort((a, b) => (b.overall_score || 0) - (a.overall_score || 0))
                                                    .map((faculty, fIdx) => (
                                                    <div key={fIdx} className="faculty-row">
                                                        <div className="faculty-details">
                                                            <div className="faculty-name">{faculty.faculty_name}</div>
                                                            <div className="faculty-info">
                                                                <span>{faculty.staffid || faculty.staff_id}</span>
                                                                
                                                                <span>{faculty.total_responses} responses</span>
                                                            </div>

                                                        </div>
                                                        <div className="faculty-score">
                                                            <div className="score-value">{faculty.overall_score}%</div>
                                                            <div className="score-bar-container">
                                                                <div 
                                                                    className={`score-bar ${faculty.overall_score >= 80 ? 'high' : faculty.overall_score >= 70 ? 'medium' : 'low'}`}
                                                                    style={{ width: `${faculty.overall_score}%` }}
                                                                ></div>
                                                            </div>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    );
                                    })}
                                </div>
                            ) : (
                                <div className="no-results">
                                    <p>No faculty found matching the selected performance filter.</p>
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </main>
        </div>
    );
};

export default Visualize;

