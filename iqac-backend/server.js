

const express = require('express');
const cors = require('cors');
const fileUpload = require('express-fileupload');
const path = require('path');
const dotenv = require('dotenv');
const FRONTEND_APP_URL = process.env.FRONTEND_URL || 'https://iqac-demo.vercel.app';
const { handleFileUpload, deleteDataByFilters } = require('./uplod_file_backend');
const { handleCoursesUpload } = require('./courses_upload');

const { 
    getDistinctDegrees,
    getDistinctCurrentAY,
    getDistinctSemesters,
    getDistinctCourseOfferingDepts,
    getDistinctCourseNames,
    getDistinctCurrentAYByDepartment,
    getDistinctSemestersByDepartment,
    getDistinctCourseNamesByDepartment,
    getDistinctDepartments,
    getDistinctBatches,
    getDistinctCourses,
    getFacultyByCourse,
    getFacultyByFilters
} = require('./analysis_backend');
const { getFeedbackAnalysis, getFacultyComments } = require('./performance_analysis');
const { 
	getAllFaculty,
	getFacultyCompleteHistory,
	getFacultyPerformanceMetrics,
	generateFacultyHistoryExcel
} = require('./individual_analysis_backend');
const { 
	getDepartmentVisualizationData, 
	getSchoolRadarChartData,
	getDistinctArtsOrEngg,
	getDistinctCurrentAYForRadar,
	getDistinctSemestersForRadar
} = require('./visualize_backend');
const fastapiService = require('./fastapi_service');
const {
    getAllQuestions,
    getQuestionsBySection,
    getDistinctSectionTypes,
    getAllOptions,
    getOptionsForQuestion,
    getQuestionsWithOptions,
    submitFeedback,
    addQuestion,
    addQuestionOptions,
    updateQuestion,
    updateQuestionOptions,
    deleteQuestion
} = require('./questions');
const {
    getCurrentAYBySchools,
    getSemestersBySchools,
    getActiveDepartmentsBySchoolAndFilters,
    getCoursesBySchoolDeptAndFilters
} = require('./school_wise_report');
const { sendOTP, verifyOTP } = require('./login');

// Load environment variables
dotenv.config();

const app = express();

// Middleware
app.use(cors({
    origin: `${FRONTEND_APP_URL}`,
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type']
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(fileUpload());

// Report routes
const reportRoutes = require('./report_routes');
// Explanation documents routes
const explanationRoutes = require('./explanation_documents_routes');
const bulkReportRoutes = require('./bulk_report_routes');
const schoolWiseReportRoutes = require('./school_wise_report_routes');
app.use('/api/reports', reportRoutes);
app.use('/api/bulk-reports', bulkReportRoutes);
app.use('/api/school-reports', schoolWiseReportRoutes);
app.use('/api/explanations', explanationRoutes);

// Test route
app.get('/test', (req, res) => {
    res.json({ message: 'Server is running' });
});

// ==================== AUTHENTICATION ROUTES ====================

app.post('/api/auth/send-otp', async (req, res) => {
    try {
        const { email } = req.body;
        
        console.log('Send OTP request received for email:', email);
        
        if (!email) {
            return res.status(400).json({
                success: false,
                message: 'Email is required'
            });
        }

        const result = await sendOTP(email);
        res.json(result);
    } catch (error) {
        console.error('Error sending OTP:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to send OTP',
            error: error.message
        });
    }
});

// ==================== ANALYSIS ROUTES ====================

app.post('/api/auth/verify-otp', async (req, res) => {
    try {
        const { email, otp } = req.body;
        
        console.log('Verify OTP request received:', { email, otp });
        
        if (!email || !otp) {
            return res.status(400).json({
                success: false,
                message: 'Email and OTP are required'
            });
        }

        const result = await verifyOTP(email, otp);
        res.json(result);
    } catch (error) {
        console.error('Error verifying OTP:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to verify OTP',
            error: error.message
        });
    }
});

app.get('/api/analysis/degrees', async (req, res) => {
    try {
        console.log('Fetching degrees from courses table...');
        const degrees = await getDistinctDegrees();
        console.log('Degrees fetched:', degrees);
        res.json(degrees);
    } catch (error) {
        console.error('Error fetching degrees:', error);
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/analysis/departments', async (req, res) => {
    try {
        console.log('Fetching departments for degree:', req.query.degree);
        const departments = await getDistinctDepartments(req.query.degree);
        console.log('Departments fetched:', departments);
        res.json(departments);
    } catch (error) {
        console.error('Error fetching departments:', error);
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/analysis/course-offering-depts-by-degree', async (req, res) => {
    try {
        const { degree } = req.query;
        console.log('Fetching course offering departments for degree:', degree);
        const { getDistinctCourseOfferingDeptsByDegree } = require('./analysis_backend');
        const departments = await getDistinctCourseOfferingDeptsByDegree(degree);
        console.log('Course offering departments fetched:', departments);
        res.json(departments);
    } catch (error) {
        console.error('Error fetching course offering departments:', error);
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/analysis/batches', async (req, res) => {
    try {
        console.log('Fetching batches for:', req.query.degree, req.query.dept);
        const batches = await getDistinctBatches(req.query.degree, req.query.dept);
        console.log('Batches fetched:', batches);
        res.json(batches);
    } catch (error) {
        console.error('Error fetching batches:', error);
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/analysis/courses', async (req, res) => {
    try {
        const { degree, dept } = req.query;
        console.log('Fetching courses for:', { degree, dept });
        
        if (!degree || !dept) {
            return res.status(400).json({ error: 'Missing required parameters: degree, dept' });
        }
        
        const courses = await getDistinctCourses(degree, dept);
        console.log('Courses fetched:', courses.length);
        res.json(courses);
    } catch (error) {
        console.error('Error fetching courses:', error);
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/analysis/faculty', async (req, res) => {
    try {
        let { degree, currentAY, semester, courseOfferingDept, course, staffId } = req.query;
        
        // Decode URL-encoded parameters
        if (degree) degree = decodeURIComponent(degree);
        if (currentAY) currentAY = decodeURIComponent(currentAY);
        if (semester) semester = decodeURIComponent(semester);
        if (courseOfferingDept) courseOfferingDept = decodeURIComponent(courseOfferingDept);
        if (course) course = decodeURIComponent(course);
        
        console.log('Fetching faculty with params:', { degree, currentAY, semester, courseOfferingDept, course, staffId });
        
        // Validate required parameters for new filter hierarchy
        // For Admin/HoD: degree will be provided.
        // For Dean: degree may be empty, but we still require AY, semester, dept, course.
        if (!currentAY || !semester || !courseOfferingDept || !course) {
            return res.status(400).json({ 
                error: 'Missing required query params',
                required: ['currentAY', 'semester', 'courseOfferingDept', 'course']
            });
        }
        
        // Use new filter hierarchy function
        const faculty = await getFacultyByCourse(degree, currentAY, semester, courseOfferingDept, course, staffId);
        console.log(`Faculty fetched: ${faculty.length} members`);
        res.json(faculty);
    } catch (error) {
        console.error('Error fetching faculty:', error);
        res.status(500).json({ error: error.message });
    }
});

// ==================== NEW FILTER HIERARCHY ROUTES (course_feedback_new) ====================

// Get unique current AY (Academic Year) based on degree (optional for Admin)
app.get('/api/analysis/current-ay', async (req, res) => {
    try {
        let { degree } = req.query;
        
        // Decode URL-encoded parameters
        if (degree) degree = decodeURIComponent(degree);
        
        // If no degree provided, get all current AYs (for Admin)
        if (!degree) {
            console.log('Fetching all current_ay (no degree filter)');
            const currentAYs = await getCurrentAYBySchools([]); // Empty array = all schools
            console.log('Current AY fetched:', currentAYs);
            return res.json(currentAYs);
        }
        
        console.log('Fetching current_ay for degree:', degree);
        const currentAYs = await getDistinctCurrentAY(degree);
        console.log('Current AY fetched:', currentAYs);
        res.json(currentAYs);
    } catch (error) {
        console.error('Error fetching current AY:', error);
        res.status(500).json({ error: error.message });
    }
});

// Get unique semesters based on degree + current_ay (degree optional for Admin)
app.get('/api/analysis/semesters', async (req, res) => {
    try {
        let { degree, currentAY } = req.query;
        
        // Decode URL-encoded parameters
        if (degree) degree = decodeURIComponent(degree);
        if (currentAY) currentAY = decodeURIComponent(currentAY);
        
        // If no degree provided, get all semesters for the AY (for Admin)
        if (!degree) {
            if (!currentAY) {
                return res.status(400).json({ error: 'Missing required parameter: currentAY' });
            }
            console.log('Fetching all semesters for AY:', currentAY);
            const semesters = await getDistinctSemestersForRadar(currentAY);
            console.log('Semesters fetched:', semesters);
            return res.json(semesters);
        }
        
        console.log('Fetching semesters for:', { degree, currentAY });
        const semesters = await getDistinctSemesters(degree, currentAY);
        console.log('Semesters fetched:', semesters);
        res.json(semesters);
    } catch (error) {
        console.error('Error fetching semesters:', error);
        res.status(500).json({ error: error.message });
    }
});

// ==================== DEAN-SPECIFIC SCHOOL-BASED ANALYSIS ROUTES ====================

// Get unique current AY for a dean's school (no degree filter)
app.get('/api/analysis/dean/current-ay', async (req, res) => {
    try {
        let { school } = req.query;

        if (!school) {
            return res.status(400).json({ error: 'Missing required parameter: school' });
        }

        school = decodeURIComponent(school);

        console.log('Dean current AY request for school:', school);
        const years = await getCurrentAYBySchools([school]);
        res.json(years);
    } catch (error) {
        console.error('Error fetching dean current AY:', error);
        res.status(500).json({ error: error.message });
    }
});

// Get unique semesters for a dean's school and academic year (no degree filter)
app.get('/api/analysis/dean/semesters', async (req, res) => {
    try {
        let { school, currentAY } = req.query;

        if (!school) {
            return res.status(400).json({ error: 'Missing required parameter: school' });
        }

        school = decodeURIComponent(school);
        if (currentAY) currentAY = decodeURIComponent(currentAY);

        console.log('Dean semesters request for school:', school, 'AY:', currentAY);
        const semesters = await getSemestersBySchools([school], currentAY || null);
        res.json(semesters);
    } catch (error) {
        console.error('Error fetching dean semesters:', error);
        res.status(500).json({ error: error.message });
    }
});

// Get active departments for a dean's school+AY+semester (no degree filter)
app.get('/api/analysis/dean/departments', async (req, res) => {
    try {
        let { school, currentAY, semester } = req.query;

        if (!school) {
            return res.status(400).json({ error: 'Missing required parameter: school' });
        }

        school = decodeURIComponent(school);
        if (currentAY) currentAY = decodeURIComponent(currentAY);
        if (semester) semester = decodeURIComponent(semester);

        console.log('Dean departments request:', { school, currentAY, semester });
        const depts = await getActiveDepartmentsBySchoolAndFilters(school, currentAY || null, semester || null);
        res.json(depts);
    } catch (error) {
        console.error('Error fetching dean departments:', error);
        res.status(500).json({ error: error.message });
    }
});

// Get unique courses for dean view (school/department/AY/semester, no degree filter)
app.get('/api/analysis/dean/courses', async (req, res) => {
    try {
        let { school, currentAY, semester, dept } = req.query;

        if (!school || !dept) {
            return res.status(400).json({ error: 'Missing required parameters: school, dept' });
        }

        school = decodeURIComponent(school);
        dept = decodeURIComponent(dept);
        if (currentAY) currentAY = decodeURIComponent(currentAY);
        if (semester) semester = decodeURIComponent(semester);

        console.log('Dean courses request:', { school, currentAY, semester, dept });
        const courses = await getCoursesBySchoolDeptAndFilters(school, dept, currentAY || null, semester || null);
        res.json(courses);
    } catch (error) {
        console.error('Error fetching dean courses:', error);
        res.status(500).json({ error: error.message });
    }
});

// ==================== HoD-SPECIFIC DEPARTMENT-BASED ANALYSIS ROUTES ====================

// Get unique current AY for a HoD's department (no degree filter)
app.get('/api/analysis/hod/current-ay', async (req, res) => {
    try {
        let { department } = req.query;

        if (!department) {
            return res.status(400).json({ error: 'Missing required parameter: department' });
        }

        department = decodeURIComponent(department);

        console.log('HoD current AY request for department:', department);
        const years = await getDistinctCurrentAYByDepartment(department);
        res.json(years);
    } catch (error) {
        console.error('Error fetching HoD current AY:', error);
        res.status(500).json({ error: error.message });
    }
});

// Get unique semesters for a HoD's department and academic year (no degree filter)
app.get('/api/analysis/hod/semesters', async (req, res) => {
    try {
        let { department, currentAY } = req.query;

        if (!department) {
            return res.status(400).json({ error: 'Missing required parameter: department' });
        }

        department = decodeURIComponent(department);
        if (currentAY) currentAY = decodeURIComponent(currentAY);

        console.log('HoD semesters request for department:', department, 'AY:', currentAY);
        const semesters = await getDistinctSemestersByDepartment(department, currentAY || null);
        res.json(semesters);
    } catch (error) {
        console.error('Error fetching HoD semesters:', error);
        res.status(500).json({ error: error.message });
    }
});

// Get unique courses for HoD view (department/AY/semester, no degree filter)
app.get('/api/analysis/hod/courses', async (req, res) => {
    try {
        let { department, currentAY, semester } = req.query;

        if (!department) {
            return res.status(400).json({ error: 'Missing required parameter: department' });
        }

        department = decodeURIComponent(department);
        if (currentAY) currentAY = decodeURIComponent(currentAY);
        if (semester) semester = decodeURIComponent(semester);

        console.log('HoD courses request:', { department, currentAY, semester });
        const courses = await getDistinctCourseNamesByDepartment(department, currentAY || null, semester || null);
        res.json(courses);
    } catch (error) {
        console.error('Error fetching HoD courses:', error);
        res.status(500).json({ error: error.message });
    }
});

// Get unique course offering departments based on degree + current_ay + semester (degree optional for Admin)
app.get('/api/analysis/course-offering-depts', async (req, res) => {
    try {
        let { degree, currentAY, semester } = req.query;
        
        // Decode URL-encoded parameters
        if (degree) degree = decodeURIComponent(degree);
        if (currentAY) currentAY = decodeURIComponent(currentAY);
        if (semester) semester = decodeURIComponent(semester);
        
        if (!currentAY || !semester) {
            return res.status(400).json({ error: 'Missing required parameters: currentAY and semester' });
        }
        
        // If no degree provided, get all departments for the AY and semester (for Admin)
        if (!degree) {
            console.log('Fetching all course offering departments for:', { currentAY, semester });
            const depts = await getDistinctCourseOfferingDepts(null, currentAY, semester);
            console.log('Course offering departments fetched:', depts);
            return res.json(depts);
        }
        
        console.log('Fetching course offering departments for:', { degree, currentAY, semester });
        const depts = await getDistinctCourseOfferingDepts(degree, currentAY, semester);
        console.log('Course offering departments fetched:', depts);
        res.json(depts);
    } catch (error) {
        console.error('Error fetching course offering departments:', error);
        res.status(500).json({ error: error.message });
    }
});

// Get unique course names based on all previous filters
app.get('/api/analysis/course-names', async (req, res) => {
    try {
        let { degree, currentAY, semester, courseOfferingDept } = req.query;
        
        // Decode URL-encoded parameters
        if (degree) degree = decodeURIComponent(degree);
        if (currentAY) currentAY = decodeURIComponent(currentAY);
        if (semester) semester = decodeURIComponent(semester);
        if (courseOfferingDept) courseOfferingDept = decodeURIComponent(courseOfferingDept);
        
        if (!degree) {
            return res.status(400).json({ error: 'Missing required parameter: degree' });
        }
        
        console.log('Fetching course names for:', { degree, currentAY, semester, courseOfferingDept });
        const courses = await getDistinctCourseNames(degree, currentAY, semester, courseOfferingDept);
        console.log('Course names fetched:', courses.length);
        res.json(courses);
    } catch (error) {
        console.error('Error fetching course names:', error);
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/analysis/feedback', async (req, res) => {
    try {
        let { degree, currentAY, semester, courseOfferingDept, course, staffId } = req.query;
        
        // Decode URL-encoded parameters
        if (degree) degree = decodeURIComponent(degree);
        if (currentAY) currentAY = decodeURIComponent(currentAY);
        if (semester) semester = decodeURIComponent(semester);
        if (courseOfferingDept) courseOfferingDept = decodeURIComponent(courseOfferingDept);
        if (course) course = decodeURIComponent(course);
        if (staffId) staffId = decodeURIComponent(staffId);
        
        console.log('Feedback analysis request:', { degree, currentAY, semester, courseOfferingDept, course, staffId });
        
        // Required: course and staffId (for faculty-specific analysis)
        if (!course) {
            return res.status(400).json({ 
                success: false,
                error: 'Missing required query params',
                message: 'Course code is required',
                required: ['course', 'staffId'],
                received: { degree, currentAY, semester, courseOfferingDept, course, staffId }
            });
        }

        if (!staffId || staffId.trim() === '') {
            return res.status(400).json({ 
                success: false,
                error: 'Missing required query params',
                message: 'Staff ID is required for faculty-specific analysis',
                required: ['course', 'staffId'],
                received: { degree, currentAY, semester, courseOfferingDept, course, staffId }
            });
        }
        
        // Use new filter hierarchy parameters
        const analysis = await getFeedbackAnalysis(
            degree || '', 
            currentAY || '', 
            semester || '', 
            courseOfferingDept || '', 
            course, 
            staffId
        );
        res.json(analysis);
    } catch (error) {
        console.error('Error fetching feedback analysis:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.get('/api/analysis/batches', async (req, res) => {
    try {
        const { degree, dept } = req.query;
        console.log('Fetching batches for:', degree, dept);
        const batches = await getDistinctBatches(degree, dept);
        console.log('Batches fetched:', batches);
        res.json(batches);
    } catch (error) {
        console.error('Error fetching batches:', error);
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/analysis/comments', async (req, res) => {
    try {
        let { degree, currentAY, semester, courseOfferingDept, course, staffId, cgpa } = req.query;
        
        // Decode URL-encoded parameters
        if (degree) degree = decodeURIComponent(degree);
        if (currentAY) currentAY = decodeURIComponent(currentAY);
        if (semester) semester = decodeURIComponent(semester);
        if (courseOfferingDept) courseOfferingDept = decodeURIComponent(courseOfferingDept);
        if (course) course = decodeURIComponent(course);
        if (staffId) staffId = decodeURIComponent(staffId);
        
        console.log('Comments analysis request received with params:', { degree, currentAY, semester, courseOfferingDept, course, staffId, cgpa });
        
        // Required: course and staffId (for faculty-specific analysis)
        if (!course) {
            return res.status(400).json({ 
                success: false,
                error: 'Missing required query params',
                message: 'Course code is required',
                received: { degree, currentAY, semester, courseOfferingDept, course, staffId }
            });
        }

        if (!staffId || staffId.trim() === '') {
            return res.status(400).json({ 
                success: false,
                error: 'Missing required query params',
                message: 'Staff ID is required for faculty-specific analysis',
                received: { degree, currentAY, semester, courseOfferingDept, course, staffId }
            });
        }
        
        // Use new filter hierarchy: degree, currentAY, semester, courseOfferingDept, courseCode, staffId, cgpa
        const commentsResult = await getFacultyComments(degree || '', currentAY || '', semester || '', courseOfferingDept || '', course, staffId, cgpa);
        
        if (!commentsResult.success) {
            return res.json(commentsResult);
        }
        
        if (commentsResult.total_comments === 0) {
            return res.json({
                success: true,
                message: 'No comments found for analysis',
                faculty_info: {
                    faculty_name: commentsResult.faculty_name,
                    staff_id: commentsResult.staff_id,
                    course_code: commentsResult.course_code,
                    course_name: commentsResult.course_name
                },
                total_comments: 0,
                analysis: null
            });
        }
        
        console.log(`\n=== Sending ${commentsResult.total_comments} comments to FastAPI ===`);
        console.log('Sample comments being sent:', commentsResult.comments.slice(0, 3));
        
        const analysisResult = await fastapiService.analyzeComments(
            commentsResult.comments,
            {
                faculty_name: commentsResult.faculty_name,
                staff_id: commentsResult.staff_id,
                course_code: commentsResult.course_code,
                course_name: commentsResult.course_name
            }
        );
        
        console.log('FastAPI analysis result:', {
            success: analysisResult.success,
            hasAnalysis: !!analysisResult.analysis,
            analysisKeys: analysisResult.analysis ? Object.keys(analysisResult.analysis) : []
        });
        
        if (!analysisResult.success) {
            console.error('FastAPI analysis failed:', analysisResult.message);
            return res.json({
                success: false,
                message: analysisResult.message,
                error: analysisResult.error,
                faculty_info: {
                    faculty_name: commentsResult.faculty_name,
                    staff_id: commentsResult.staff_id,
                    course_code: commentsResult.course_code,
                    course_name: commentsResult.course_name
                },
                total_comments: commentsResult.total_comments,
                comments: commentsResult.comments,
                debug: commentsResult.debug
            });
        }
        
        // Verify and log analysis structure
        const analysis = analysisResult.analysis || {};
        console.log('\n=== Final Analysis Structure Verification ===');
        console.log('Analysis keys:', Object.keys(analysis));
        console.log('- negative_comments:', analysis.negative_comments || 'MISSING');
        console.log('- negative_comments_list:', Array.isArray(analysis.negative_comments_list) ? `${analysis.negative_comments_list.length} items` : 'MISSING or NOT ARRAY');
        console.log('- negative_comments_summary:', analysis.negative_comments_summary ? 'PRESENT' : 'MISSING');
        console.log('- sentiment_distribution:', analysis.sentiment_distribution ? 'PRESENT' : 'MISSING');
        
        if (analysis.sentiment_distribution) {
            console.log('  - negative_percentage:', analysis.sentiment_distribution.negative_percentage || 'N/A');
            console.log('  - positive_percentage:', analysis.sentiment_distribution.positive_percentage || 'N/A');
            console.log('  - neutral_percentage:', analysis.sentiment_distribution.neutral_percentage || 'N/A');
        }
        
        // Ensure analysis has all required fields for frontend
        const finalAnalysis = {
            ...analysis,
            // Ensure negative_comments is a number
            negative_comments: analysis.negative_comments || (Array.isArray(analysis.negative_comments_list) ? analysis.negative_comments_list.length : 0),
            // Ensure negative_comments_list is an array
            negative_comments_list: Array.isArray(analysis.negative_comments_list) ? analysis.negative_comments_list : [],
            // Ensure sentiment_distribution exists
            sentiment_distribution: analysis.sentiment_distribution || {
                positive_percentage: 0,
                negative_percentage: 0,
                neutral_percentage: 0
            }
        };
        
        console.log('\n=== Final Response Structure ===');
        console.log('Total comments sent:', commentsResult.total_comments);
        console.log('Negative comments in analysis:', finalAnalysis.negative_comments);
        console.log('Negative comments list items:', finalAnalysis.negative_comments_list.length);
        
        res.json({
            success: true,
            faculty_info: {
                faculty_name: commentsResult.faculty_name,
                staff_id: commentsResult.staff_id,
                course_code: commentsResult.course_code,
                course_name: commentsResult.course_name
            },
            total_comments: commentsResult.total_comments,
            comments: commentsResult.comments,
            analysis: finalAnalysis,
            debug: {
                ...commentsResult.debug,
                fastapi_debug: analysisResult._debug
            }
        });
        
    } catch (error) {
        console.error('Error fetching comments analysis:', error);
        res.status(500).json({ error: error.message });
    }
});

// ==================== INDIVIDUAL FACULTY ANALYSIS ROUTES ====================

// Get all faculty members (with role-based filtering)
app.get('/api/individual-analysis/faculty', async (req, res) => {
    try {
        const { role, department, school } = req.query;
        
        console.log('Fetching faculty members with role-based filtering:', { role, department, school });
        
        let result;
        
        if (role === 'HoD' && department) {
            // HoD: Filter by their department
            const { getFacultyByDepartment } = require('./individual_analysis_backend');
            result = await getFacultyByDepartment(department);
        } else if (role === 'Dean' && school) {
            // Dean: Filter by departments in their school
            const { getFacultyBySchool } = require('./individual_analysis_backend');
            result = await getFacultyBySchool(school);
        } else {
            // Admin or no role specified: Get all faculty
            result = await getAllFaculty();
        }
        
        res.json(result);
    } catch (error) {
        console.error('Error fetching faculty:', error);
        res.status(500).json({ 
            success: false,
            error: error.message 
        });
    }
});

// Get complete feedback history for a faculty member
app.get('/api/individual-analysis/history', async (req, res) => {
    try {
        let { staffId } = req.query;
        
        if (staffId) staffId = decodeURIComponent(staffId);
        
        console.log('Fetching complete feedback history for staff ID:', staffId);
        
        if (!staffId || staffId.trim() === '') {
            return res.status(400).json({ 
                success: false,
                message: 'Staff ID is required'
            });
        }
        
        const result = await getFacultyCompleteHistory(staffId);
        res.json(result);
    } catch (error) {
        console.error('Error fetching faculty history:', error);
        res.status(500).json({ 
            success: false,
            error: error.message 
        });
    }
});

// Get performance metrics for a faculty member
app.get('/api/individual-analysis/metrics', async (req, res) => {
    try {
        let { staffId } = req.query;
        
        if (staffId) staffId = decodeURIComponent(staffId);
        
        console.log('Fetching performance metrics for staff ID:', staffId);
        
        if (!staffId || staffId.trim() === '') {
            return res.status(400).json({ 
                success: false,
                message: 'Staff ID is required'
            });
        }
        
        const result = await getFacultyPerformanceMetrics(staffId);
        res.json(result);
    } catch (error) {
        console.error('Error fetching faculty metrics:', error);
        res.status(500).json({ 
            success: false,
            error: error.message 
        });
    }
});

// Generate Excel report for faculty complete history
app.get('/api/individual-analysis/generate-excel', async (req, res) => {
    try {
        let { staffId } = req.query;
        
        if (staffId) staffId = decodeURIComponent(staffId);
        
        console.log('Generating Excel report for staff ID:', staffId);
        
        if (!staffId || staffId.trim() === '') {
            return res.status(400).json({ 
                success: false,
                message: 'Staff ID is required'
            });
        }
        
        const workbook = await generateFacultyHistoryExcel(staffId);
        const buffer = await workbook.xlsx.writeBuffer();
        
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename=faculty_complete_history_${staffId}.xlsx`);
        res.send(buffer);
        
        console.log('✓ Excel report generated successfully');
    } catch (error) {
        console.error('Error generating Excel report:', error);
        res.status(500).json({ 
            success: false,
            error: error.message 
        });
    }
});

// ==================== VISUALIZATION ROUTES ====================
app.get('/api/visualization/department', async (req, res) => {
    try {
        let { degree, currentAY, semester, dept, courseOfferingDept } = req.query;
        
        // Decode URL-encoded parameters
        if (degree) degree = decodeURIComponent(degree);
        if (currentAY) currentAY = decodeURIComponent(currentAY);
        if (semester) semester = decodeURIComponent(semester);
        if (courseOfferingDept) courseOfferingDept = decodeURIComponent(courseOfferingDept);
        if (dept) dept = decodeURIComponent(dept);
        
        // Support both old 'dept' parameter and new 'courseOfferingDept' parameter
        const courseOfferingDeptValue = courseOfferingDept || dept;
        
        console.log('Visualization request:', { degree, currentAY, semester, dept, courseOfferingDept: courseOfferingDeptValue });
        
        if (!degree || !currentAY || !semester || !courseOfferingDeptValue) {
            return res.status(400).json({ 
                success: false,
                error: 'Missing required query params',
                required: ['degree', 'currentAY', 'semester', 'courseOfferingDept']
            });
        }
        
        const visualizationData = await getDepartmentVisualizationData(degree, currentAY, semester, courseOfferingDeptValue);
        res.json(visualizationData);
    } catch (error) {
        console.error('Error fetching visualization data:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Dean-specific visualization endpoint (no degree required)
app.get('/api/visualization/dean/department', async (req, res) => {
    try {
        let { currentAY, semester, courseOfferingDept } = req.query;
        
        // Decode URL-encoded parameters
        if (currentAY) currentAY = decodeURIComponent(currentAY);
        if (semester) semester = decodeURIComponent(semester);
        if (courseOfferingDept) courseOfferingDept = decodeURIComponent(courseOfferingDept);
        
        console.log('Dean visualization request:', { currentAY, semester, courseOfferingDept });
        
        if (!currentAY || !semester || !courseOfferingDept) {
            return res.status(400).json({ 
                success: false,
                error: 'Missing required query params',
                required: ['currentAY', 'semester', 'courseOfferingDept']
            });
        }
        
        // Pass null for degree (Dean mode)
        const visualizationData = await getDepartmentVisualizationData(null, currentAY, semester, courseOfferingDept);
        res.json(visualizationData);
    } catch (error) {
        console.error('Error fetching dean visualization data:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// HoD-specific visualization endpoint (no degree required, department auto-set)
app.get('/api/visualization/hod/department', async (req, res) => {
    try {
        let { currentAY, semester, courseOfferingDept } = req.query;
        
        // Decode URL-encoded parameters
        if (currentAY) currentAY = decodeURIComponent(currentAY);
        if (semester) semester = decodeURIComponent(semester);
        if (courseOfferingDept) courseOfferingDept = decodeURIComponent(courseOfferingDept);
        
        console.log('HoD visualization request:', { currentAY, semester, courseOfferingDept });
        
        if (!currentAY || !semester || !courseOfferingDept) {
            return res.status(400).json({ 
                success: false,
                error: 'Missing required query params',
                required: ['currentAY', 'semester', 'courseOfferingDept']
            });
        }
        
        // Pass null for degree (HoD mode) - uses department-based fetching
        const visualizationData = await getDepartmentVisualizationData(null, currentAY, semester, courseOfferingDept);
        res.json(visualizationData);
    } catch (error) {
        console.error('Error fetching HoD visualization data:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Get distinct arts_or_engg values for radar chart
app.get('/api/visualization/arts-or-engg', async (req, res) => {
    try {
        const artsOrEngg = await getDistinctArtsOrEngg();
        res.json(artsOrEngg);
    } catch (error) {
        console.error('Error fetching arts_or_engg:', error);
        res.status(500).json({ error: error.message });
    }
});

// Get distinct current AY for radar chart (without degree filter)
app.get('/api/visualization/current-ay', async (req, res) => {
    try {
        const currentAYs = await getDistinctCurrentAYForRadar();
        res.json(currentAYs);
    } catch (error) {
        console.error('Error fetching current AY for radar:', error);
        res.status(500).json({ error: error.message });
    }
});

// Get distinct semesters for radar chart (without degree filter)
app.get('/api/visualization/semesters', async (req, res) => {
    try {
        let { currentAY } = req.query;
        if (currentAY) currentAY = decodeURIComponent(currentAY);
        
        const semesters = await getDistinctSemestersForRadar(currentAY);
        res.json(semesters);
    } catch (error) {
        console.error('Error fetching semesters for radar:', error);
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/visualization/school-radar', async (req, res) => {
    try {
        let { artsOrEngg, currentAY, semester } = req.body || {};
        
        if (artsOrEngg) artsOrEngg = decodeURIComponent(artsOrEngg);
        if (currentAY) currentAY = decodeURIComponent(currentAY);
        if (semester) semester = decodeURIComponent(semester);
        
        console.log('Category radar chart request:', { artsOrEngg, currentAY, semester });
        
        if (!artsOrEngg || !currentAY || !semester) {
            return res.status(400).json({ 
                success: false,
                error: 'Missing required fields',
                required: ['artsOrEngg', 'currentAY', 'semester']
            });
        }
        
        const radarData = await getSchoolRadarChartData(artsOrEngg, currentAY, semester);
        res.json(radarData);
    } catch (error) {
        console.error('Error fetching school radar chart data:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ==================== FASTAPI ROUTES ====================
app.get('/api/fastapi/health', async (req, res) => {
    try {
        const healthResult = await fastapiService.healthCheck();
        res.json(healthResult);
    } catch (error) {
        console.error('Error checking FastAPI health:', error);
        res.status(500).json({ error: error.message });
    }
});

// ==================== DEBUG ROUTES ====================
app.get('/api/debug/database', async (req, res) => {
    try {
        const { createClient } = require('@supabase/supabase-js');
        const dotenv = require('dotenv');
        dotenv.config();
        
        const supabase = createClient(
            process.env.SUPABASE_URL,
            process.env.SUPABASE_ANON_KEY,
            {
                auth: {
                    persistSession: false
                }
            }
        );
        
        const { data: sampleData, error } = await supabase
            .from('course_feedback')
            .select('degree, dept, batch, course_code, staff_id, staffid, comment, faculty_name')
            .not('comment', 'is', null)
            .not('comment', 'eq', '')
            .limit(10);
        
        if (error) {
            return res.status(500).json({ error: error.message });
        }
        
        const { data: uniqueDegrees } = await supabase
            .from('course_feedback')
            .select('degree')
            .not('degree', 'is', null);
        
        const { data: uniqueDepts } = await supabase
            .from('course_feedback')
            .select('dept')
            .not('dept', 'is', null);
        
        const { data: uniqueBatches } = await supabase
            .from('course_feedback')
            .select('batch')
            .not('batch', 'is', null);
        
        const { data: uniqueCourses } = await supabase
            .from('course_feedback')
            .select('course_code')
            .not('course_code', 'is', null);
        
        const { data: specificCourse } = await supabase
            .from('course_feedback')
            .select('*')
            .eq('course_code', '212CSE3302')
            .limit(5);
        
        res.json({
            success: true,
            sampleData: sampleData,
            specificCourse: specificCourse,
            uniqueValues: {
                degrees: [...new Set(uniqueDegrees?.map(d => d.degree) || [])],
                depts: [...new Set(uniqueDepts?.map(d => d.dept).filter(Boolean) || [])],
                batches: [...new Set(uniqueBatches?.map(b => b.batch) || [])],
                courses: [...new Set(uniqueCourses?.map(c => c.course_code) || [])]
            }
        });
        
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ==================== QUESTIONS ROUTES ====================
app.get('/api/questions', async (req, res) => {
    try {
        const questions = await getAllQuestions();
        res.json(questions);
    } catch (error) {
        console.error('Error fetching questions:', error);
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/questions/sections', async (req, res) => {
    try {
        const sectionTypes = await getDistinctSectionTypes();
        res.json(sectionTypes);
    } catch (error) {
        console.error('Error fetching section types:', error);
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/questions/section/:sectionType', async (req, res) => {
    try {
        const { sectionType } = req.params;
        const questions = await getQuestionsBySection(sectionType);
        res.json(questions);
    } catch (error) {
        console.error('Error fetching questions by section:', error);
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/questions/options', async (req, res) => {
    try {
        const options = await getAllOptions();
        res.json(options);
    } catch (error) {
        console.error('Error fetching options:', error);
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/questions/:questionId/options', async (req, res) => {
    try {
        const { questionId } = req.params;
        const options = await getOptionsForQuestion(parseInt(questionId));
        res.json(options);
    } catch (error) {
        console.error('Error fetching options for question:', error);
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/questions/with-options', async (req, res) => {
    try {
        const questionsWithOptions = await getQuestionsWithOptions();
        res.json(questionsWithOptions);
    } catch (error) {
        console.error('Error fetching questions with options:', error);
        res.status(500).json({ error: error.message });
    }
});

app.put('/api/questions/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const questionData = req.body;
        console.log('Updating question:', id, questionData);

        if (!questionData.section_type || !questionData.question || !questionData.column_name) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        const result = await updateQuestion(id, questionData);
        console.log('Update result:', result);
        res.json(result);
    } catch (error) {
        console.error('Error updating question:', error);
        res.status(500).json({ error: error.message });
    }
});

app.put('/api/questions/:id/options', async (req, res) => {
    try {
        const { id } = req.params;
        const optionsData = req.body;
        console.log('Updating options for question:', id, optionsData);

        if (!Array.isArray(optionsData) || optionsData.length === 0) {
            return res.status(400).json({ error: 'Invalid options data' });
        }

        const result = await updateQuestionOptions(id, optionsData);
        console.log('Options update result:', result);
        res.json(result);
    } catch (error) {
        console.error('Error updating question options:', error);
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/questions', async (req, res) => {
    try {
        const questionData = req.body;
        if (!questionData.section_type || !questionData.question || !questionData.column_name) {
            return res.status(400).json({ error: 'Missing required fields' });
        }
        const result = await addQuestion(questionData);
        res.status(201).json(result);
    } catch (error) {
        console.error('Error adding question:', error);
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/questions/options', async (req, res) => {
    try {
        const optionsData = req.body;
        console.log('Received options data:', optionsData);
        
        if (!Array.isArray(optionsData) || optionsData.length === 0) {
            return res.status(400).json({ error: 'Invalid options data' });
        }
        
        for (const option of optionsData) {
            if (!option.question_id || !option.option_label || !option.option_text) {
                return res.status(400).json({ 
                    error: 'Missing required fields in options data',
                    details: 'Each option must have question_id, option_label, and option_text'
                });
            }
        }
        
        const result = await addQuestionOptions(optionsData);
        res.status(201).json(result);
    } catch (error) {
        console.error('Error adding question options:', error);
        res.status(500).json({ error: error.message });
    }
});

app.delete('/api/questions/:id', async (req, res) => {
    try {
        const { id } = req.params;
        console.log('Deleting question via API:', id);
        const result = await deleteQuestion(id);
        res.json(result);
    } catch (error) {
        console.error('Error deleting question:', error);
        res.status(500).json({ error: error.message });
    }
});

// ==================== FILE UPLOAD ROUTES ====================
app.post('/api/upload', async (req, res) => {
    try {
        console.log('Received upload request');
        
        if (!req.files || !req.files.file) {
            console.log('No file in request');
            return res.status(400).json({ success: false, message: 'No file uploaded' });
        }

        console.log('File received:', req.files.file);
        const result = await handleFileUpload(req.files.file);
        
        console.log('Upload result:', result);
        
        if (result.success) {
            res.status(200).json(result);
        } else {
            res.status(500).json(result);
        }
    } catch (error) {
        console.error('Upload error:', error);
        res.status(500).json({ 
            success: false,
            message: 'Error processing file',
            error: error.message 
        });
    }
});

// Delete data based on filters
app.post('/api/upload/delete', async (req, res) => {
    try {
        console.log('Received delete request');
        console.log('Request body:', req.body);
        
        // Extract filter values from request body (handles both form data and JSON)
        const degree = req.body.degree;
        const currentAY = req.body.currentAY;
        const semester = req.body.semester;
        const courseOfferingDept = req.body.courseOfferingDept || null;
        
        // Validate required fields
        if (!degree || !currentAY || !semester) {
            return res.status(400).json({ 
                success: false, 
                message: 'Missing required fields: degree, currentAY, semester' 
            });
        }
        
        console.log('Delete filters:', { degree, currentAY, semester, courseOfferingDept });
        
        const filters = {
            degree: String(degree).trim(),
            currentAY: String(currentAY).trim(),
            semester: String(semester).trim(),
            courseOfferingDept: courseOfferingDept ? String(courseOfferingDept).trim() : null
        };
        
        const result = await deleteDataByFilters(filters);
        
        console.log('Delete result:', result);
        
        if (result.success) {
            res.status(200).json(result);
        } else {
            res.status(500).json(result);
        }
    } catch (error) {
        console.error('Delete error:', error);
        res.status(500).json({ 
            success: false,
            message: 'Error deleting data',
            error: error.message 
        });
    }
});

app.post('/api/upload-courses', async (req, res) => {
    try {
        console.log('Received courses upload request');
        
        if (!req.files || !req.files.file) {
            console.log('No file in request');
            return res.status(400).json({ success: false, message: 'No file uploaded' });
        }

        console.log('Courses file received:', req.files.file);
        const result = await handleCoursesUpload(req.files.file);
        
        console.log('Courses upload result:', result);
        
        if (result.success) {
            res.status(200).json(result);
        } else {
            res.status(500).json(result);
        }
    } catch (error) {
        console.error('Courses upload error:', error);
        res.status(500).json({ 
            success: false,
            message: 'Error processing courses file',
            error: error.message 
        });
    }
});

// Start server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
    console.log(`Authentication routes available at http://localhost:${PORT}/api/auth/*`);
});