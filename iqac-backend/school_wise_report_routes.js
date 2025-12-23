const express = require("express");
const router = express.Router();
const { generateSchoolReport, generateSchoolNegativeCommentsExcel } = require("./report_generator");
const { generateSchoolPdf } = require('./pdf_report');
const { getDistinctSchools, getDepartmentsBySchool, getCurrentAYBySchools, getSemestersBySchools } = require('./school_wise_report');
const { getDistinctCourseNames, getFacultyByCourse, getBatchesForFacultyCourse, getDegreesForFacultyCourse, getCgpaBreakdownForFacultyCourse } = require('./analysis_backend');
const { getFeedbackAnalysis, getFacultyComments } = require('./performance_analysis');
const fastapiService = require('./fastapi_service');
const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
const archiver = require('archiver');

dotenv.config();

const cleanString = (value) => {
    if (value === undefined || value === null) return null;
    const cleaned = value.toString().trim();
    if (cleaned === '' || cleaned.toUpperCase() === 'NULL') return null;
    return cleaned;
};

// Helper function to fetch all rows from a query (handles pagination)
async function fetchAllRows(queryBuilder, chunkSize = 1000) {
    let from = 0;
    let allData = [];
    let moreData = true;
    while (moreData) {
        const { data, error } = await queryBuilder.range(from, from + chunkSize - 1);
        if (error) throw error;
        if (!data || data.length === 0) {
            moreData = false;
        } else {
            allData = allData.concat(data);
            from += chunkSize;
            if (data.length < chunkSize) {
                moreData = false;
            }
        }
    }
    return allData;
}

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_ANON_KEY,
    {
        auth: {
            persistSession: false
        }
    }
);

// Helper function to get courses for a department across all degrees if degree is not provided
async function getCoursesForDepartment(department, degree = null) {
    try {
        if (degree) {
            // If degree is provided, use the existing function
            return await getDistinctCourses(degree, department);
        } else {
            // If degree is not provided, get courses across all degrees
            console.log(`Fetching courses for department: ${department} (all degrees)`);
            const { data, error } = await supabase
                .from('course_allocation')
                .select('course_code, course_name, batch, degree')
                .eq('staff_dept', department)
                .not('course_code', 'is', null);

            if (error) {
                console.error('Error fetching courses:', error);
                return [];
            }

            // Group courses by course_code and collect all batches
            const courseMap = new Map();
            (data || []).forEach(item => {
                const code = (item.course_code || '').toString().trim();
                const name = (item.course_name || '').toString().trim();
                const batch = (item.batch || '').toString().trim();
                
                if (code) {
                    if (!courseMap.has(code)) {
                        courseMap.set(code, {
                            code: code,
                            name: name || 'Unknown Course',
                            batches: []
                        });
                    }
                    
                    // Add batch if it's not already in the list
                    if (batch && !courseMap.get(code).batches.includes(batch)) {
                        courseMap.get(code).batches.push(batch);
                    }
                }
            });

            const uniqueCourses = Array.from(courseMap.values())
                .map(course => ({
                    ...course,
                    batches: course.batches.sort((a, b) => {
                        const numA = parseInt(a);
                        const numB = parseInt(b);
                        if (!isNaN(numA) && !isNaN(numB)) {
                            return numA - numB;
                        }
                        return a.localeCompare(b);
                    })
                }))
                .sort((a, b) => a.code.localeCompare(b.code));

            console.log(`Processed unique courses for ${department}: ${uniqueCourses.length} courses`);
            return uniqueCourses;
        }
    } catch (error) {
        console.error('Error in getCoursesForDepartment:', error);
        return [];
    }
}

const EXCLUDED_SECTIONS = new Set([
    'COURSE CONTENT AND STRUCTURE',
    'STUDENT-CENTRIC FACTORS'
]);

const normalizeSectionName = (sectionKey, section) => ((section && section.section_name) || sectionKey || '')
    .toString()
    .trim()
    .toUpperCase();

const isExcludedSection = (sectionKey, section) => EXCLUDED_SECTIONS.has(normalizeSectionName(sectionKey, section));

const calculateOverallScore = (analysis) => {
    if (!analysis) return 0;

    let sectionSum = 0;
    let sectionCount = 0;

    Object.entries(analysis).forEach(([sectionKey, section]) => {
        if (isExcludedSection(sectionKey, section)) {
            return;
        }

        let sectionScore = 0;
        let questionCount = 0;

        Object.values(section.questions || {}).forEach(question => {
            let weightedSum = 0;
            let totalResponses = 0;

            (question.options || []).forEach(option => {
                let value;
                if (option.value !== undefined && option.value !== null) {
                    value = option.value === 1 ? 0 : option.value === 2 ? 1 : option.value === 3 ? 2 : Number(option.value) || 0;
                } else {
                    const label = (option.label || '').toUpperCase();
                    value = label === 'C' ? 2 : label === 'B' ? 1 : 0;
                }
                weightedSum += (option.count || 0) * value;
                totalResponses += option.count || 0;
            });

            const maxPossible = totalResponses * 2;
            const questionScore = maxPossible > 0 ? (weightedSum / maxPossible) * 100 : 0;
            sectionScore += questionScore;
            questionCount++;
        });

        if (questionCount > 0) {
            sectionSum += sectionScore / questionCount;
            sectionCount++;
        }
    });

    return sectionCount > 0 ? Math.round(sectionSum / sectionCount) : 0;
};

const calculateSectionScores = (analysis) => {
    if (!analysis) return {};

    const sectionScores = {};

    Object.entries(analysis).forEach(([sectionKey, section]) => {
        if (isExcludedSection(sectionKey, section)) {
            return;
        }

        let sectionScore = 0;
        let questionCount = 0;

        Object.values(section.questions || {}).forEach(question => {
            let weightedSum = 0;
            let totalResponses = 0;

            (question.options || []).forEach(option => {
                let value;
                if (option.value !== undefined && option.value !== null) {
                    value = option.value === 1 ? 0 : option.value === 2 ? 1 : option.value === 3 ? 2 : Number(option.value) || 0;
                } else {
                    const label = (option.label || '').toUpperCase();
                    value = label === 'C' ? 2 : label === 'B' ? 1 : 0;
                }
                weightedSum += (option.count || 0) * value;
                totalResponses += option.count || 0;
            });

            const maxPossible = totalResponses * 2;
            const questionScore = maxPossible > 0 ? (weightedSum / maxPossible) * 100 : 0;
            sectionScore += questionScore;
            questionCount++;
        });

        if (questionCount > 0) {
            const average = sectionScore / questionCount;
            sectionScores[section.section_name || sectionKey] = Math.round(average);
        }
    });

    return sectionScores;
};

const buildAggregatedRows = (groupedData) => {
    const rows = [];
    groupedData.forEach(course => {
        course.faculties.forEach(fac => {
            const overall = calculateOverallScore(fac.analysisData?.analysis);
            rows.push({
                course: `${course.course_code || ''} - ${course.course_name || ''}`.trim(),
                faculty: fac.faculty_name || '',
                percentage: overall
            });
        });
    });
    return rows;
};

const gatherDepartmentCourseMap = async (degreeValue, dept) => {
    const courseMap = new Map();
    let courses = [];

    try {
        if (degreeValue) {
            courses = await getDistinctCourses(degreeValue, dept);
        } else {
            courses = await getCoursesForDepartment(dept, null);
        }
    } catch (error) {
        console.error(`Error fetching courses for dept ${dept} degree ${degreeValue || 'ALL'}:`, error.message);
        return courseMap;
    }

    if (!courses || courses.length === 0) {
        return courseMap;
    }

    for (const course of courses) {
        const code = course.code ? course.code : course;
        const name = course.name || '';

        const faculties = await getFacultyByFilters(degreeValue || '', dept, code);
        if (!faculties || faculties.length === 0) {
            continue;
        }

        const facultyAnalyses = (await Promise.all(
            faculties.map(async (f) => {
                const staffId = f.staffid || f.staff_id || '';
                if (!staffId) {
                    console.warn(`Skipping faculty with no staffid: ${f.faculty_name}`);
                    return null;
                }

                const [analysis, batches, degrees, cgpa] = await Promise.all([
                    getFeedbackAnalysis(degreeValue || '', dept || '', '', code, staffId),
                    getBatchesForFacultyCourse(code, staffId),
                    getDegreesForFacultyCourse(code, staffId),
                    getCgpaBreakdownForFacultyCourse(code, staffId)
                ]);

        if (analysis && analysis.success) {
                    return {
                        faculty_name: f.faculty_name || analysis.faculty_name || '',
                        staffid: staffId,
                        staff_id: f.staff_id || '',
                        batches: batches,
                        degrees: degrees,
                        analysisData: {
                            ...analysis,
                            staff_dept: dept,
                            degree: degreeValue || '',
                            unique_batches: batches,
                            unique_degrees: degrees,
                            cgpa_breakdown: cgpa
                        }
                    };
                }

                console.warn(`⚠ No feedback data found for staffid: ${staffId}, course: ${code}`);
                return null;
            })
        )).filter(Boolean);

        if (facultyAnalyses.length === 0) {
            continue;
        }

        if (!courseMap.has(code)) {
            courseMap.set(code, {
                course_code: code,
                course_name: name,
                faculties: []
            });
        }

        const entry = courseMap.get(code);
        facultyAnalyses.forEach(fac => entry.faculties.push(fac));
    }

    return courseMap;
};

// Get all schools
router.get('/schools', async (req, res) => {
    try {
        console.log('=== GET /api/school-reports/schools endpoint called ===');
        const schools = await getDistinctSchools();
        console.log(`✓ Successfully fetched ${schools.length} schools`);
        res.json(schools);
    } catch (error) {
        console.error('❌ Error fetching schools:', error);
        console.error('Error stack:', error.stack);
        res.status(500).json({ 
            error: error.message || 'Failed to fetch schools',
            details: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
    }
});

// Get departments for a school
router.get('/schools/:school/departments', async (req, res) => {
    try {
        const { school } = req.params;
        const departments = await getDepartmentsBySchool(school);
        res.json(departments);
    } catch (error) {
        console.error('Error fetching departments:', error);
        res.status(500).json({ error: error.message });
    }
});

// Get academic years filtered by selected schools
router.get('/current-ay', async (req, res) => {
    try {
        const { schools } = req.query;
        let schoolArray = [];
        
        if (schools) {
            // Parse schools query parameter (can be comma-separated or JSON array)
            try {
                schoolArray = JSON.parse(decodeURIComponent(schools));
            } catch {
                // If not JSON, treat as comma-separated string
                schoolArray = decodeURIComponent(schools).split(',').map(s => s.trim()).filter(s => s);
            }
        }
        
        console.log(`Fetching academic years for schools: ${schoolArray.length > 0 ? schoolArray.join(', ') : 'all'}`);
        const currentAYs = await getCurrentAYBySchools(schoolArray);
        res.json(currentAYs);
    } catch (error) {
        console.error('Error fetching academic years:', error);
        res.status(500).json({ error: error.message });
    }
});

// Get semesters filtered by selected schools and academic year
router.get('/semesters', async (req, res) => {
    try {
        const { schools, currentAY } = req.query;
        let schoolArray = [];
        
        if (schools) {
            // Parse schools query parameter (can be comma-separated or JSON array)
            try {
                schoolArray = JSON.parse(decodeURIComponent(schools));
            } catch {
                // If not JSON, treat as comma-separated string
                schoolArray = decodeURIComponent(schools).split(',').map(s => s.trim()).filter(s => s);
            }
        }
        
        const decodedCurrentAY = currentAY ? decodeURIComponent(currentAY) : null;
        console.log(`Fetching semesters for schools: ${schoolArray.length > 0 ? schoolArray.join(', ') : 'all'}, currentAY: ${decodedCurrentAY}`);
        const semesters = await getSemestersBySchools(schoolArray, decodedCurrentAY);
        res.json(semesters);
    } catch (error) {
        console.error('Error fetching semesters:', error);
        res.status(500).json({ error: error.message });
    }
});

// Generate school-wise report
router.post('/generate-school-report', async (req, res) => {
    try {
        const { school, currentAY, semester, format, observations, titleSuffix } = req.body || {};
        
        if (!school || !currentAY || !semester) {
            return res.status(400).json({ 
                error: 'Missing required fields',
                required: ['school', 'currentAY', 'semester']
            });
        }

        console.log(`\n=== Generating School Report ===`);
        console.log(`School: ${school}`);
        console.log(`Current AY: ${currentAY}`);
        console.log(`Semester: ${semester}`);

        // Get all departments for this school from profiles table
        const departments = await getDepartmentsBySchool(school);
        if (!departments || departments.length === 0) {
            return res.status(404).json({ error: `No departments found for school: ${school}` });
        }

        console.log(`Found ${departments.length} departments for school: ${school}`);
        console.log(`Departments:`, departments);

        // For each department, generate the same analysis as department report
        // Note: departments from profiles table map to course_offering_dept_name in course_feedback_new
        const groupedDataByDept = {};
        const departmentPdfData = [];

        for (const dept of departments) {
            console.log(`\nProcessing department: ${dept} (as course_offering_dept_name)`);

            // Get courses for this department from course_feedback_new
            // Filter by course_offering_dept_name, current_ay, and semester (no degree filter)
            let courseQuery = supabase
                .from('course_feedback_new')
                .select('course_code, course_name, degree')
                .eq('course_offering_dept_name', dept)
                .eq('current_ay', currentAY)
                .eq('semester', semester)
                .not('course_code', 'is', null);

            const allCourseData = await fetchAllRows(courseQuery);
            
            // Group by course_code to get unique courses
            const courseMap = new Map();
            allCourseData.forEach(item => {
                const code = cleanString(item.course_code);
                const name = cleanString(item.course_name);
                if (code && !courseMap.has(code)) {
                    courseMap.set(code, {
                        code: code,
                        name: name || 'Unknown Course'
                    });
                }
            });

            const courses = Array.from(courseMap.values()).sort((a, b) => a.code.localeCompare(b.code));
            
            if (!courses || courses.length === 0) {
                console.log(`No courses found for department ${dept} with filters: currentAY=${currentAY}, semester=${semester}`);
                continue;
            }

            console.log(`Found ${courses.length} courses for department ${dept}`);

            const groupedData = [];

            for (const course of courses) {
                const code = course.code || course;
                const name = course.name || '';
                
                console.log(`\nProcessing course: ${code}`);
                
                // Get faculty from course_feedback_new
                // Filter by course_code, course_offering_dept_name, current_ay, and semester (no degree filter)
                let facultyQuery = supabase
                    .from('course_feedback_new')
                    .select('faculty_name, staff_id, staffid, course_code, course_name, degree')
                    .eq('course_code', code)
                    .eq('course_offering_dept_name', dept)
                    .eq('current_ay', currentAY)
                    .eq('semester', semester)
                    .not('faculty_name', 'is', null)
                    .not('course_code', 'is', null);

                const allFacultyData = await fetchAllRows(facultyQuery);
                
                // Deduplicate faculty by staff_id or staffid
                const facultyMap = new Map();
                allFacultyData.forEach(item => {
                    const staffId = cleanString(item.staffid) || cleanString(item.staff_id);
                    if (staffId && !facultyMap.has(staffId)) {
                        facultyMap.set(staffId, {
                            faculty_name: cleanString(item.faculty_name) || 'Unknown',
                            staffid: staffId,
                            staff_id: staffId
                        });
                    }
                });

                const faculties = Array.from(facultyMap.values());
                
                if (faculties.length === 0) {
                    console.log(`No faculty found for course: ${code}`);
                    continue;
                }

                console.log(`Found ${faculties.length} faculty members for course ${code}`);

                const facultyAnalyses = (await Promise.all(
                    faculties.map(async (f) => {
                        const staffId = f.staffid || f.staff_id || '';
                        if (!staffId) {
                            console.warn(`Skipping faculty with no staffid: ${f.faculty_name}`);
                            return null;
                        }
                        console.log(`Getting feedback analysis for staffid: ${staffId} and course: ${code}`);
                        
                        // Get degree from course data for this faculty-course combination
                        const facultyCourseData = allFacultyData.find(item => {
                            const itemStaffId = cleanString(item.staffid) || cleanString(item.staff_id);
                            return itemStaffId === staffId && cleanString(item.course_code) === code;
                        });
                        const degree = facultyCourseData ? cleanString(facultyCourseData.degree) : '';
                        
                        // Use filter hierarchy: degree (from data), currentAY, semester, courseOfferingDept, courseCode, staffId
                        const [analysis, batches, degrees, cgpa] = await Promise.all([
                            getFeedbackAnalysis(degree || '', currentAY, semester, dept, code, staffId),
                            getBatchesForFacultyCourse(code, staffId),
                            getDegreesForFacultyCourse(code, staffId),
                            getCgpaBreakdownForFacultyCourse(code, staffId)
                        ]);

                        if (analysis && analysis.success) {
                            return {
                                faculty_name: f.faculty_name,
                                staffid: f.staffid || f.staff_id,
                                staff_id: f.staff_id || f.staffid,
                                analysisData: analysis,
                                batches: batches || [],
                                degrees: degrees || [],
                                cgpa: cgpa || {}
                            };
                        }
                        return null;
                    })
                )).filter(Boolean);

                if (facultyAnalyses.length > 0) {
                    groupedData.push({
                        course_code: code,
                        course_name: name,
                        faculties: facultyAnalyses
                    });
                }
            }

            if (groupedData.length > 0) {
                groupedDataByDept[dept] = groupedData;

                const aggregatedRows = buildAggregatedRows(groupedData);

                departmentPdfData.push({
                    department: dept,
                    rows: aggregatedRows,
                    observations: Array.isArray(observations) ? observations : [],
                    academicYear: currentAY || '',
                    semester: semester || '',
                    titleSuffix: titleSuffix || ''
                });
            }
        }

        if (Object.keys(groupedDataByDept).length === 0) {
            const errorMsg = `No analysis data available for selected school "${school}". ` +
                `This could be because:\n` +
                `1. No courses found for the departments in this school with filters: currentAY="${currentAY}", semester="${semester}"\n` +
                `2. No faculty feedback data found for the courses\n` +
                `3. Department names in profiles table may not match course_offering_dept_name in course_feedback_new table`;
            console.error(errorMsg);
            return res.status(404).json({ 
                error: 'No analysis data available for selected school',
                details: errorMsg,
                school: school,
                departments: departments,
                currentAY: currentAY,
                semester: semester
            });
        }

        console.log(`\n=== School Report Generation Summary ===`);
        console.log(`Total departments with data: ${Object.keys(groupedDataByDept).length}`);
        console.log(`Total faculty analyzed: ${Object.values(groupedDataByDept).reduce((sum, courses) => 
            sum + courses.reduce((s, c) => s + c.faculties.length, 0), 0)}`);

        if (format && format.toLowerCase() === 'pdf') {
            const pdfBuffer = await generateSchoolPdf({
                school: school,
                departments: departmentPdfData,
                academicYear: currentAY || '',
                semester: semester || '',
                titleSuffix: titleSuffix || ''
            });

            if (!pdfBuffer || pdfBuffer.length === 0) {
                throw new Error('Generated PDF buffer is empty');
            }

            const safeSchoolName = (school || 'school').toString().replace(/[^a-z0-9]/gi, '_').toLowerCase();
            res.status(200);
            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader('Content-Disposition', `attachment; filename="${safeSchoolName}_school_report.pdf"`);
            res.setHeader('Content-Length', pdfBuffer.length);
            res.setHeader('Cache-Control', 'no-cache');
            res.setHeader('Accept-Ranges', 'none');
            res.end(pdfBuffer);
            return;
        }

        // Generate Excel report
        const workbook = await generateSchoolReport(school, { currentAY, semester }, groupedDataByDept);
        const buffer = await workbook.xlsx.writeBuffer();
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename=${school}_school_report.xlsx`);
        res.send(buffer);
    } catch (error) {
        console.error('Error generating school report:', error);
        res.status(500).json({ error: error.message });
    }
});

// Generate school-wise negative comments Excel report
router.post('/generate-school-negative-comments-excel', async (req, res) => {
    try {
        const { school, currentAY, semester } = req.body || {};
        
        if (!school || !currentAY || !semester) {
            return res.status(400).json({ 
                error: 'Missing required fields',
                required: ['school', 'currentAY', 'semester']
            });
        }

        console.log(`\n=== Generating School Negative Comments Excel ===`);
        console.log(`School: ${school}`);
        console.log(`Current AY: ${currentAY}`);
        console.log(`Semester: ${semester}`);

        // Get all departments for this school from profiles table
        const departments = await getDepartmentsBySchool(school);
        if (!departments || departments.length === 0) {
            return res.status(404).json({ error: `No departments found for school: ${school}` });
        }

        console.log(`Found ${departments.length} departments for school: ${school}`);

        // For each department, collect negative comments data
        // Note: departments from profiles table map to course_offering_dept_name in course_feedback_new
        const groupedDataByDept = {};

        for (const dept of departments) {
            console.log(`\nProcessing department: ${dept} (as course_offering_dept_name)`);

            // Get courses for this department from course_feedback_new
            // Filter by course_offering_dept_name, current_ay, and semester (no degree filter)
            let courseQuery = supabase
                .from('course_feedback_new')
                .select('course_code, course_name, degree')
                .eq('course_offering_dept_name', dept)
                .eq('current_ay', currentAY)
                .eq('semester', semester)
                .not('course_code', 'is', null);

            const allCourseData = await fetchAllRows(courseQuery);
            
            // Group by course_code to get unique courses
            const courseMap = new Map();
            allCourseData.forEach(item => {
                const code = cleanString(item.course_code);
                const name = cleanString(item.course_name);
                if (code && !courseMap.has(code)) {
                    courseMap.set(code, {
                        code: code,
                        name: name || 'Unknown Course'
                    });
                }
            });

            const courses = Array.from(courseMap.values()).sort((a, b) => a.code.localeCompare(b.code));
            
            if (!courses || courses.length === 0) {
                console.log(`No courses found for department ${dept}`);
                continue;
            }

            console.log(`Found ${courses.length} courses for department ${dept}`);

            const courseAggregateMap = new Map();

            // Process courses in parallel batches for better performance
            const COURSE_BATCH_SIZE = 5; // Process 5 courses at a time
            for (let i = 0; i < courses.length; i += COURSE_BATCH_SIZE) {
                const courseBatch = courses.slice(i, i + COURSE_BATCH_SIZE);
                
                await Promise.all(
                    courseBatch.map(async (course) => {
                        const code = course.code || course;
                        const name = course.name || '';

                        // Get faculty from course_feedback_new
                        // Filter by course_code, course_offering_dept_name, current_ay, and semester (no degree filter)
                        let facultyQuery = supabase
                            .from('course_feedback_new')
                            .select('faculty_name, staff_id, staffid, course_code, degree')
                            .eq('course_code', code)
                            .eq('course_offering_dept_name', dept)
                            .eq('current_ay', currentAY)
                            .eq('semester', semester)
                            .not('faculty_name', 'is', null)
                            .not('course_code', 'is', null);

                        const allFacultyData = await fetchAllRows(facultyQuery);
                        
                        // Deduplicate faculty by staff_id or staffid
                        const facultyMap = new Map();
                        allFacultyData.forEach(item => {
                            const staffId = cleanString(item.staffid) || cleanString(item.staff_id);
                            if (staffId && !facultyMap.has(staffId)) {
                                facultyMap.set(staffId, {
                                    faculty_name: cleanString(item.faculty_name) || 'Unknown',
                                    staffid: staffId,
                                    staff_id: staffId
                                });
                            }
                        });

                        const faculties = Array.from(facultyMap.values());
                        
                        if (faculties.length === 0) {
                            return;
                        }

                        // Initialize course in aggregate map if not exists
                        if (!courseAggregateMap.has(code)) {
                            courseAggregateMap.set(code, {
                                course_code: code,
                                course_name: name,
                                faculties: []
                            });
                        }

                        const entry = courseAggregateMap.get(code);

                        // Process each faculty in parallel
                        const facultyResults = await Promise.all(
                            faculties.map(async (f) => {
                                const staffId = f.staffid || f.staff_id || '';
                                if (!staffId) {
                                    return null;
                                }
                                
                                try {
                                    // Get degree from faculty data for this specific combination
                                    const facultyCourseData = allFacultyData.find(item => {
                                        const itemStaffId = cleanString(item.staffid) || cleanString(item.staff_id);
                                        return itemStaffId === staffId && cleanString(item.course_code) === code;
                                    });
                                    const degree = facultyCourseData ? cleanString(facultyCourseData.degree) : '';
                                    
                                    // Get comments using filter hierarchy: degree (from data), currentAY, semester, courseOfferingDept, courseCode, staffId
                                    const commentsResult = await getFacultyComments(degree || '', currentAY, semester, dept, code, staffId);
                                    
                                    if (!commentsResult.success || !commentsResult.comments || commentsResult.comments.length === 0) {
                                        return null;
                                    }
                                    
                                    // Analyze comments to get negative ones
                                    const sentimentResult = await fastapiService.analyzeComments(
                                        commentsResult.comments,
                                        {
                                            faculty_name: commentsResult.faculty_name || f.faculty_name,
                                            staff_id: commentsResult.staff_id || staffId,
                                            course_code: commentsResult.course_code || code,
                                            course_name: commentsResult.course_name || name
                                        }
                                    );

                                    let negativeComments = [];
                                    if (sentimentResult.success && sentimentResult.analysis) {
                                        negativeComments = sentimentResult.analysis.negative_comments_list || [];
                                    }

                                    // Only include faculty with negative comments
                                    if (negativeComments.length === 0) {
                                        return null;
                                    }

                                    // Get analysis data, batches, and degrees for metadata
                                    const [analysisResult, batches, degrees] = await Promise.all([
                                        getFeedbackAnalysis(degree, currentAY, semester, dept, code, staffId),
                                        getBatchesForFacultyCourse(code, staffId),
                                        getDegreesForFacultyCourse(code, staffId)
                                    ]);
                                    
                                    return {
                                        faculty_name: f.faculty_name || commentsResult?.faculty_name || '',
                                        staffid: staffId,
                                        staff_id: staffId,
                                        batches: batches,
                                        degrees: degrees,
                                        analysisData: analysisResult.success ? {
                                            ...analysisResult,
                                            overall_score: analysisResult.overall_score || 0
                                        } : null,
                                        negativeComments: negativeComments,
                                        totalNegativeComments: negativeComments.length
                                    };
                                } catch (error) {
                                    console.error(`Error processing faculty ${staffId} for course ${code}:`, error);
                                    return null;
                                }
                            })
                        );

                        // Add all valid results to entry (filter out nulls)
                        const validResults = facultyResults.filter(r => r !== null);
                        entry.faculties.push(...validResults);
                    })
                );
            }

            // Convert map to array
            const groupedData = Array.from(courseAggregateMap.values()).filter(course => course.faculties.length > 0);

            if (groupedData.length > 0) {
                groupedDataByDept[dept] = groupedData;
                const totalFaculty = groupedData.reduce((sum, c) => sum + c.faculties.length, 0);
                console.log(`✓ Department ${dept}: ${groupedData.length} courses, ${totalFaculty} faculty with negative comments`);
            }
        }

        if (Object.keys(groupedDataByDept).length === 0) {
            const errorMsg = `No faculty with negative comments found for selected school "${school}". ` +
                `This could be because:\n` +
                `1. No courses found for the departments in this school with filters: degree="${degree}", currentAY="${currentAY}", semester="${semester}"\n` +
                `2. No faculty feedback data found for the courses\n` +
                `3. No negative comments found for any faculty\n` +
                `4. Department names in profiles table may not match course_offering_dept_name in course_feedback_new table`;
            console.error(errorMsg);
            return res.status(404).json({ 
                error: 'No faculty with negative comments found for selected school',
                details: errorMsg,
                school: school,
                departments: departments,
                currentAY: currentAY,
                semester: semester
            });
        }

        // Calculate summary statistics
        const totalDepartments = Object.keys(groupedDataByDept).length;
        const totalCourses = Object.values(groupedDataByDept).reduce((sum, courses) => sum + courses.length, 0);
        const totalFaculty = Object.values(groupedDataByDept).reduce((sum, courses) => 
            sum + courses.reduce((s, c) => s + c.faculties.length, 0), 0);

        console.log(`\n=== School Negative Comments Excel Summary ===`);
        console.log(`Total departments processed: ${departments.length}`);
        console.log(`Total departments with negative comments: ${totalDepartments}`);
        console.log(`Total courses with negative comments: ${totalCourses}`);
        console.log(`Total faculty with negative comments: ${totalFaculty}`);

        // Generate Excel report
        const workbook = await generateSchoolNegativeCommentsExcel(school, { currentAY, semester }, groupedDataByDept);
        const buffer = await workbook.xlsx.writeBuffer();

        if (!buffer || buffer.length === 0) {
            throw new Error('Generated Excel buffer is empty');
        }

        const safeSchoolName = (school || 'school').toString().replace(/[^a-z0-9]/gi, '_').toLowerCase();
        res.status(200);
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="${safeSchoolName}_negative_comments_report.xlsx"`);
        res.setHeader('Content-Length', buffer.length);
        res.setHeader('Cache-Control', 'no-cache');
        res.end(buffer);
        
    } catch (error) {
        console.error('Error generating school negative comments Excel:', error);
        res.status(500).json({ error: error.message });
    }
});

// Generate reports for all schools (negative comments, PDF, Excel)
router.post('/generate-all-school-reports', async (req, res) => {
    try {
        const { currentAY, semester, schools: selectedSchools } = req.body || {};
        
        if (!currentAY || !semester) {
            return res.status(400).json({ 
                error: 'Missing required fields',
                required: ['currentAY', 'semester']
            });
        }

        console.log(`\n=== Generating School Reports ===`);
        console.log(`Current AY: ${currentAY}`);
        console.log(`Semester: ${semester}`);
        console.log(`Selected Schools: ${selectedSchools && selectedSchools.length > 0 ? selectedSchools.join(', ') : 'All Schools'}`);

        // Get schools - use selected schools if provided, otherwise get all schools
        let schools;
        if (selectedSchools && Array.isArray(selectedSchools) && selectedSchools.length > 0) {
            // Validate that all selected schools exist
            const allSchools = await getDistinctSchools();
            const invalidSchools = selectedSchools.filter(school => !allSchools.includes(school));
            if (invalidSchools.length > 0) {
                return res.status(400).json({ 
                    error: 'Invalid schools selected',
                    invalidSchools: invalidSchools
                });
            }
            schools = selectedSchools;
        } else {
            // Get all schools
            schools = await getDistinctSchools();
        }

        if (!schools || schools.length === 0) {
            return res.status(404).json({ error: 'No schools found' });
        }

        console.log(`Found ${schools.length} schools to process`);

        // Create zip archive
        const archive = archiver('zip', {
            zlib: { level: 9 } // Maximum compression
        });

        // Set response headers for zip download
        const zipFileName = selectedSchools && selectedSchools.length > 0 
            ? `selected_schools_reports_${currentAY}_${semester}.zip`
            : `all_schools_reports_${currentAY}_${semester}.zip`;
        res.attachment(zipFileName);
        res.type('application/zip');

        // Pipe archive to response
        archive.pipe(res);

        let successCount = 0;
        let errorCount = 0;
        const errors = [];

        // Process each school
        for (const school of schools) {
            try {
                console.log(`\nProcessing school: ${school} (${successCount + errorCount + 1}/${schools.length})`);

                // Get all departments for this school
                const departments = await getDepartmentsBySchool(school);
                if (!departments || departments.length === 0) {
                    console.log(`No departments found for school: ${school}`);
                    continue;
                }

                // Generate the same data structure as single school report
                const groupedDataByDept = {};
                const departmentPdfData = [];

                for (const dept of departments) {
                    console.log(`Processing department: ${dept}`);

                    // Get courses for this department
                    let courseQuery = supabase
                        .from('course_feedback_new')
                        .select('course_code, course_name, degree')
                        .eq('course_offering_dept_name', dept)
                        .eq('current_ay', currentAY)
                        .eq('semester', semester)
                        .not('course_code', 'is', null);

                    const allCourseData = await fetchAllRows(courseQuery);
                    
                    const courseMap = new Map();
                    allCourseData.forEach(item => {
                        const code = cleanString(item.course_code);
                        const name = cleanString(item.course_name);
                        if (code && !courseMap.has(code)) {
                            courseMap.set(code, {
                                code: code,
                                name: name || 'Unknown Course'
                            });
                        }
                    });

                    const courses = Array.from(courseMap.values()).sort((a, b) => a.code.localeCompare(b.code));
                    
                    if (!courses || courses.length === 0) {
                        continue;
                    }

                    const groupedData = [];

                    for (const course of courses) {
                        const code = course.code || course;
                        const name = course.name || '';
                        
                        // Get faculty from course_feedback_new
                        let facultyQuery = supabase
                            .from('course_feedback_new')
                            .select('faculty_name, staff_id, staffid, course_code, course_name, degree')
                            .eq('course_code', code)
                            .eq('course_offering_dept_name', dept)
                            .eq('current_ay', currentAY)
                            .eq('semester', semester)
                            .not('faculty_name', 'is', null)
                            .not('course_code', 'is', null);

                        const allFacultyData = await fetchAllRows(facultyQuery);
                        
                        const facultyMap = new Map();
                        allFacultyData.forEach(item => {
                            const staffId = cleanString(item.staffid) || cleanString(item.staff_id);
                            if (staffId && !facultyMap.has(staffId)) {
                                facultyMap.set(staffId, {
                                    faculty_name: cleanString(item.faculty_name) || 'Unknown',
                                    staffid: staffId,
                                    staff_id: staffId
                                });
                            }
                        });

                        const faculties = Array.from(facultyMap.values());
                        
                        if (faculties.length === 0) {
                            continue;
                        }

                        const facultyAnalyses = (await Promise.all(
                            faculties.map(async (f) => {
                                const staffId = f.staffid || f.staff_id || '';
                                if (!staffId) {
                                    return null;
                                }
                                
                                const facultyCourseData = allFacultyData.find(item => {
                                    const itemStaffId = cleanString(item.staffid) || cleanString(item.staff_id);
                                    return itemStaffId === staffId && cleanString(item.course_code) === code;
                                });
                                const degree = facultyCourseData ? cleanString(facultyCourseData.degree) : '';
                                
                                const [analysis, batches, degrees, cgpa] = await Promise.all([
                                    getFeedbackAnalysis(degree || '', currentAY, semester, dept, code, staffId),
                                    getBatchesForFacultyCourse(code, staffId),
                                    getDegreesForFacultyCourse(code, staffId),
                                    getCgpaBreakdownForFacultyCourse(code, staffId)
                                ]);

                                if (analysis && analysis.success) {
                                    return {
                                        faculty_name: f.faculty_name,
                                        staffid: f.staffid || f.staff_id,
                                        staff_id: f.staff_id || f.staffid,
                                        analysisData: analysis,
                                        batches: batches || [],
                                        degrees: degrees || [],
                                        cgpa: cgpa || {}
                                    };
                                }
                                return null;
                            })
                        )).filter(Boolean);

                        if (facultyAnalyses.length > 0) {
                            groupedData.push({
                                course_code: code,
                                course_name: name,
                                faculties: facultyAnalyses
                            });
                        }
                    }

                    if (groupedData.length > 0) {
                        groupedDataByDept[dept] = groupedData;

                        const aggregatedRows = buildAggregatedRows(groupedData);

                        departmentPdfData.push({
                            department: dept,
                            rows: aggregatedRows,
                            observations: [],
                            academicYear: currentAY || '',
                            semester: semester || '',
                            titleSuffix: ''
                        });
                    }
                }

                if (Object.keys(groupedDataByDept).length === 0) {
                    console.log(`No data found for school: ${school}`);
                    continue;
                }

                const safeSchoolName = (school || 'school').toString().replace(/[^a-z0-9]/gi, '_').toLowerCase();

                // Generate PDF report
                try {
                    const pdfBuffer = await generateSchoolPdf({
                        school: school,
                        departments: departmentPdfData,
                        academicYear: currentAY || '',
                        semester: semester || '',
                        titleSuffix: ''
                    });

                    if (pdfBuffer && pdfBuffer.length > 0) {
                        archive.append(pdfBuffer, { name: `${safeSchoolName}/${safeSchoolName}_school_report.pdf` });
                        console.log(`✓ Generated PDF for ${school}`);
                    }
                } catch (pdfError) {
                    console.error(`Error generating PDF for ${school}:`, pdfError);
                    errors.push({ school, report: 'PDF', error: pdfError.message });
                }

                // Generate Excel report
                try {
                    const workbook = await generateSchoolReport(school, { currentAY, semester }, groupedDataByDept);
                    const excelBuffer = await workbook.xlsx.writeBuffer();
                    if (excelBuffer && excelBuffer.length > 0) {
                        archive.append(excelBuffer, { name: `${safeSchoolName}/${safeSchoolName}_school_report.xlsx` });
                        console.log(`✓ Generated Excel for ${school}`);
                    }
                } catch (excelError) {
                    console.error(`Error generating Excel for ${school}:`, excelError);
                    errors.push({ school, report: 'Excel', error: excelError.message });
                }

                // Generate negative comments Excel
                try {
                    // Collect negative comments data (similar to generate-school-negative-comments-excel)
                    const negativeCommentsGroupedDataByDept = {};

                    for (const dept of departments) {
                        let courseQuery = supabase
                            .from('course_feedback_new')
                            .select('course_code, course_name, degree')
                            .eq('course_offering_dept_name', dept)
                            .eq('current_ay', currentAY)
                            .eq('semester', semester)
                            .not('course_code', 'is', null);

                        const allCourseData = await fetchAllRows(courseQuery);
                        
                        const courseMap = new Map();
                        allCourseData.forEach(item => {
                            const code = cleanString(item.course_code);
                            const name = cleanString(item.course_name);
                            if (code && !courseMap.has(code)) {
                                courseMap.set(code, {
                                    code: code,
                                    name: name || 'Unknown Course'
                                });
                            }
                        });

                        const courses = Array.from(courseMap.values()).sort((a, b) => a.code.localeCompare(b.code));
                        
                        if (!courses || courses.length === 0) {
                            continue;
                        }

                        const courseAggregateMap = new Map();
                        const COURSE_BATCH_SIZE = 5;

                        for (let i = 0; i < courses.length; i += COURSE_BATCH_SIZE) {
                            const courseBatch = courses.slice(i, i + COURSE_BATCH_SIZE);
                            
                            await Promise.all(
                                courseBatch.map(async (course) => {
                                    const code = course.code || course;
                                    const name = course.name || '';

                                    let facultyQuery = supabase
                                        .from('course_feedback_new')
                                        .select('faculty_name, staff_id, staffid, course_code, degree')
                                        .eq('course_code', code)
                                        .eq('course_offering_dept_name', dept)
                                        .eq('current_ay', currentAY)
                                        .eq('semester', semester)
                                        .not('faculty_name', 'is', null)
                                        .not('course_code', 'is', null);

                                    const allFacultyData = await fetchAllRows(facultyQuery);
                                    
                                    const facultyMap = new Map();
                                    allFacultyData.forEach(item => {
                                        const staffId = cleanString(item.staffid) || cleanString(item.staff_id);
                                        if (staffId && !facultyMap.has(staffId)) {
                                            facultyMap.set(staffId, {
                                                faculty_name: cleanString(item.faculty_name) || 'Unknown',
                                                staffid: staffId,
                                                staff_id: staffId
                                            });
                                        }
                                    });

                                    const faculties = Array.from(facultyMap.values());
                                    
                                    if (faculties.length === 0) {
                                        return;
                                    }

                                    if (!courseAggregateMap.has(code)) {
                                        courseAggregateMap.set(code, {
                                            course_code: code,
                                            course_name: name,
                                            faculties: []
                                        });
                                    }

                                    const entry = courseAggregateMap.get(code);

                                    const facultyResults = await Promise.all(
                                        faculties.map(async (f) => {
                                            const staffId = f.staffid || f.staff_id || '';
                                            if (!staffId) {
                                                return null;
                                            }
                                            
                                            try {
                                                const facultyCourseData = allFacultyData.find(item => {
                                                    const itemStaffId = cleanString(item.staffid) || cleanString(item.staff_id);
                                                    return itemStaffId === staffId && cleanString(item.course_code) === code;
                                                });
                                                const degree = facultyCourseData ? cleanString(facultyCourseData.degree) : '';
                                                
                                                const commentsResult = await getFacultyComments(degree || '', currentAY, semester, dept, code, staffId);
                                                
                                                if (!commentsResult.success || !commentsResult.comments || commentsResult.comments.length === 0) {
                                                    return null;
                                                }
                                                
                                                const sentimentResult = await fastapiService.analyzeComments(
                                                    commentsResult.comments,
                                                    {
                                                        faculty_name: commentsResult.faculty_name || f.faculty_name,
                                                        staff_id: commentsResult.staff_id || staffId,
                                                        course_code: commentsResult.course_code || code,
                                                        course_name: commentsResult.course_name || name
                                                    }
                                                );

                                                let negativeComments = [];
                                                if (sentimentResult.success && sentimentResult.analysis) {
                                                    negativeComments = sentimentResult.analysis.negative_comments_list || [];
                                                }

                                                if (negativeComments.length === 0) {
                                                    return null;
                                                }

                                                const [analysisResult, batches, degrees] = await Promise.all([
                                                    getFeedbackAnalysis(degree, currentAY, semester, dept, code, staffId),
                                                    getBatchesForFacultyCourse(code, staffId),
                                                    getDegreesForFacultyCourse(code, staffId)
                                                ]);
                                                
                                                return {
                                                    faculty_name: f.faculty_name || commentsResult?.faculty_name || '',
                                                    staffid: staffId,
                                                    staff_id: staffId,
                                                    batches: batches,
                                                    degrees: degrees,
                                                    analysisData: analysisResult.success ? {
                                                        ...analysisResult,
                                                        overall_score: analysisResult.overall_score || 0
                                                    } : null,
                                                    negativeComments: negativeComments,
                                                    totalNegativeComments: negativeComments.length
                                                };
                                            } catch (error) {
                                                console.error(`Error processing faculty ${staffId} for course ${code}:`, error);
                                                return null;
                                            }
                                        })
                                    );

                                    const validResults = facultyResults.filter(r => r !== null);
                                    entry.faculties.push(...validResults);
                                })
                            );
                        }

                        const groupedData = Array.from(courseAggregateMap.values()).filter(course => course.faculties.length > 0);

                        if (groupedData.length > 0) {
                            negativeCommentsGroupedDataByDept[dept] = groupedData;
                        }
                    }

                    if (Object.keys(negativeCommentsGroupedDataByDept).length > 0) {
                        const workbook = await generateSchoolNegativeCommentsExcel(school, { currentAY, semester }, negativeCommentsGroupedDataByDept);
                        const negativeCommentsBuffer = await workbook.xlsx.writeBuffer();
                        if (negativeCommentsBuffer && negativeCommentsBuffer.length > 0) {
                            archive.append(negativeCommentsBuffer, { name: `${safeSchoolName}/${safeSchoolName}_negative_comments_report.xlsx` });
                            console.log(`✓ Generated Negative Comments Excel for ${school}`);
                        }
                    }
                } catch (negativeCommentsError) {
                    console.error(`Error generating negative comments Excel for ${school}:`, negativeCommentsError);
                    errors.push({ school, report: 'Negative Comments Excel', error: negativeCommentsError.message });
                }

                successCount++;
                console.log(`✓ Completed processing school: ${school}`);

            } catch (schoolError) {
                console.error(`Error processing school ${school}:`, schoolError);
                errorCount++;
                errors.push({ school, report: 'All Reports', error: schoolError.message });
            }
        }

        // Finalize the archive
        archive.finalize();

        const reportType = selectedSchools && selectedSchools.length > 0 ? 'Selected School' : 'All School';
        console.log(`\n=== ${reportType} Reports Generation Summary ===`);
        console.log(`Total schools: ${schools.length}`);
        console.log(`Successfully processed: ${successCount}`);
        console.log(`Errors: ${errorCount}`);
        if (errors.length > 0) {
            console.log(`Errors details:`, errors);
        }

    } catch (error) {
        console.error('Error generating all school reports:', error);
        if (!res.headersSent) {
            res.status(500).json({ error: error.message });
        }
    }
});

module.exports = router;


