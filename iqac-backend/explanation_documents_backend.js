const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
const path = require('path');
const fs = require('fs').promises;
const crypto = require('crypto');

// Be robust to running from repo root or backend folder
dotenv.config({ path: path.resolve(__dirname, '.env') });
dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

// Support alternate env var names (some deployments use SUPABASE_SERVICE_ROLE)
const supabaseUrl = 'https://eetmhccembarxnrsyxas.supabase.co';
const supabaseKey ='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVldG1oY2NlbWJhcnhucnN5eGFzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjA1ODk5NTcsImV4cCI6MjA3NjE2NTk1N30.us-FotOojT8eyQ-IyiJXU9yGAiJA_RxKdL50phlvv2Y';

// Guard against missing env vars so the server does not crash at import time
let supabase = null;
if (supabaseUrl && supabaseKey) {
    supabase = createClient(supabaseUrl, supabaseKey);
    console.log('[explanation_documents] Supabase configured (url/key present)');
} else {
    console.error(
        '[explanation_documents] Missing Supabase configuration. ' +
        'Please set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in your .env ' +
        `(urlPresent=${Boolean(supabaseUrl)}, keyPresent=${Boolean(supabaseKey)})`
    );
}

const ensureSupabase = () => {
    if (!supabase) {
        throw new Error('Supabase is not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env');
    }
};

// Directory for storing uploaded explanation documents
const UPLOAD_DIR = path.join(__dirname, 'uploads', 'explanations');

// Ensure upload directory exists
const ensureUploadDir = async () => {
    try {
        await fs.mkdir(UPLOAD_DIR, { recursive: true });
    } catch (error) {
        console.error('Error creating upload directory:', error);
    }
};

// Initialize upload directory on module load
ensureUploadDir();

/**
 * Upload explanation document file
 * @param {Object} file - File object from express-fileupload
 * @param {Object} metadata - Document metadata
 * @returns {Promise<Object>} Upload result with file path
 */
const uploadExplanationFile = async (file, metadata) => {
    try {
        ensureSupabase();
        // Validate file type
        const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'application/pdf'];
        if (!allowedTypes.includes(file.mimetype)) {
            throw new Error(`File type ${file.mimetype} not allowed. Allowed types: ${allowedTypes.join(', ')}`);
        }

        // Validate file size (max 10MB)
        const maxSize = 10 * 1024 * 1024; // 10MB
        if (file.size > maxSize) {
            throw new Error(`File size ${file.size} exceeds maximum allowed size of ${maxSize} bytes`);
        }

        // Generate unique filename
        const fileExtension = path.extname(file.name);
        const uniqueName = `${crypto.randomUUID()}${fileExtension}`;
        
        // Create directory structure: uploads/explanations/{department}/{year}/{month}/
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const deptDir = path.join(UPLOAD_DIR, metadata.department, String(year), month);
        
        await fs.mkdir(deptDir, { recursive: true });
        
        const filePath = path.join(deptDir, uniqueName);
        
        // Save file
        await fs.writeFile(filePath, file.data);
        
        // Return relative path (for database storage)
        const relativePath = path.relative(path.join(__dirname, 'uploads'), filePath);
        
        return {
            success: true,
            filePath: relativePath,
            fileName: uniqueName,
            originalName: file.name,
            fileSize: file.size,
            fileType: file.mimetype
        };
    } catch (error) {
        console.error('Error uploading explanation file:', error);
        throw error;
    }
};

/**
 * Save explanation document metadata to database
 * @param {Object} documentData - Document data
 * @returns {Promise<Object>} Created document
 */
const saveExplanationDocument = async (documentData) => {
    try {
        ensureSupabase();
        const { data, error } = await supabase
            .from('explanation_documents')
            .insert([documentData])
            .select()
            .single();

        if (error) {
            console.error('Error saving explanation document:', error);
            // Check if table doesn't exist
            if (error.code === '42P01' || error.message.includes('does not exist')) {
                throw new Error('Table "explanation_documents" does not exist. Please run the SQL script to create it.');
            }
            throw error;
        }

        return data;
    } catch (error) {
        console.error('Error in saveExplanationDocument:', error);
        throw error;
    }
};

/**
 * Get explanation documents with role-based filtering
 * @param {Object} filters - Query filters
 * @param {Object} user - Current user (for role-based filtering)
 * @returns {Promise<Array>} List of explanation documents
 */
const getExplanationDocuments = async (filters = {}, user = null) => {
    try {
        ensureSupabase();
        let query = supabase
            .from('explanation_documents')
            .select('*')
            .eq('status', 'active')
            .order('created_at', { ascending: false });
        
        // Check if table exists by attempting a simple query
        const { error: testError } = await supabase
            .from('explanation_documents')
            .select('id')
            .limit(1);
        
        if (testError && (testError.code === '42P01' || testError.message.includes('does not exist'))) {
            throw new Error('Table "explanation_documents" does not exist. Please run the SQL script to create it.');
        }

        // Apply role-based filtering
        if (user?.role === 'HoD') {
            // HoD can only see their own uploads
            query = query.eq('uploaded_by_user_id', user.id);
            if (user.department) {
                query = query.eq('department', user.department);
            }
        } else if (user?.role === 'Dean') {
            // Dean can see uploads from departments in their school
            if (user.school) {
                query = query.eq('school', user.school);
            }
        }
        // Admin can see all (no additional filter)

        // Apply additional filters
        if (filters.department) {
            query = query.eq('department', filters.department);
        }
        if (filters.school) {
            query = query.eq('school', filters.school);
        }
        if (filters.current_ay) {
            query = query.eq('current_ay', filters.current_ay);
        }
        if (filters.semester) {
            query = query.eq('semester', filters.semester);
        }
        if (filters.course_code) {
            query = query.eq('course_code', filters.course_code);
        }
        if (filters.staff_id) {
            query = query.eq('staff_id', filters.staff_id);
        }
        if (filters.uploaded_by_user_id) {
            query = query.eq('uploaded_by_user_id', filters.uploaded_by_user_id);
        }

        const { data, error } = await query;

        if (error) {
            console.error('Error fetching explanation documents:', error);
            throw error;
        }

        return data || [];
    } catch (error) {
        console.error('Error in getExplanationDocuments:', error);
        throw error;
    }
};

/**
 * Get single explanation document by ID
 * @param {string} documentId - Document ID
 * @param {Object} user - Current user (for authorization)
 * @returns {Promise<Object>} Document data
 */
const getExplanationDocumentById = async (documentId, user = null) => {
    try {
        ensureSupabase();
        let query = supabase
            .from('explanation_documents')
            .select('*')
            .eq('id', documentId)
            .eq('status', 'active')
            .single();

        const { data, error } = await query;

        if (error) {
            console.error('Error fetching explanation document:', error);
            throw error;
        }

        // Additional authorization check
        if (user?.role === 'HoD' && data.uploaded_by_user_id !== user.id) {
            throw new Error('Unauthorized: You can only view your own documents');
        }
        if (user?.role === 'Dean' && data.school !== user.school) {
            throw new Error('Unauthorized: You can only view documents from your school');
        }

        return data;
    } catch (error) {
        console.error('Error in getExplanationDocumentById:', error);
        throw error;
    }
};

/**
 * Delete explanation document (soft delete by setting status)
 * @param {string} documentId - Document ID
 * @param {Object} user - Current user (for authorization)
 * @returns {Promise<Object>} Deletion result
 */
const deleteExplanationDocument = async (documentId, user = null) => {
    try {
        ensureSupabase();
        // First check if user has permission
        const document = await getExplanationDocumentById(documentId, user);

        // Soft delete by updating status
        const { data, error } = await supabase
            .from('explanation_documents')
            .update({ status: 'deleted' })
            .eq('id', documentId)
            .select()
            .single();

        if (error) {
            console.error('Error deleting explanation document:', error);
            throw error;
        }

        // Optionally delete physical file
        // (You might want to keep files for audit purposes)
        // const filePath = path.join(__dirname, 'uploads', document.file_path);
        // await fs.unlink(filePath).catch(err => console.error('Error deleting file:', err));

        return { success: true, data };
    } catch (error) {
        console.error('Error in deleteExplanationDocument:', error);
        throw error;
    }
};

/**
 * Get file content for download/viewing
 * @param {string} filePath - Relative file path
 * @returns {Promise<Buffer>} File content
 */
const getExplanationFile = async (filePath) => {
    try {
        const fullPath = path.join(__dirname, 'uploads', filePath);
        const fileContent = await fs.readFile(fullPath);
        return fileContent;
    } catch (error) {
        console.error('Error reading explanation file:', error);
        throw error;
    }
};

/**
 * Get faculty with performance < 80% for a given AY, semester, and department
 * @param {string} currentAY - Academic year
 * @param {string} semester - Semester
 * @param {string} department - Department
 * @param {string} degree - Degree (optional, for Admin)
 * @param {Object} user - Current user (for role-based filtering)
 * @returns {Promise<Array>} List of faculty with <80% performance
 */
const getFacultyWithLowPerformance = async (currentAY, semester, department, degree = '', user = null) => {
    try {
        ensureSupabase();
        
        // Import required functions
        const { getDistinctCourseNamesByDepartment, getDistinctCourseNames, getFacultyByCourse } = require('./analysis_backend');
        const { getFeedbackAnalysis } = require('./performance_analysis');
        const { getCoursesBySchoolDeptAndFilters } = require('./school_wise_report');

        // Get all courses for the department
        let courses;
        if (user?.role === 'HoD' || !degree) {
            // HoD or Dean: use department-based fetching
            courses = await getDistinctCourseNamesByDepartment(department, currentAY, semester);
        } else {
            // Admin: use degree-based fetching
            courses = await getDistinctCourseNames(degree, currentAY, semester, department);
        }

        if (!courses || courses.length === 0) {
            return [];
        }

        console.log(`Found ${courses.length} courses for department: ${department}, AY: ${currentAY}, semester: ${semester}`);

        // Helper function to calculate overall score from analysis
        const calculateOverallScore = (analysis) => {
            if (!analysis || !analysis.analysis) return 0;
            
            const EXCLUDED_SECTIONS = new Set(['COURSE CONTENT AND STRUCTURE', 'STUDENT-CENTRIC FACTORS']);
            
            let sectionSum = 0;
            let sectionCount = 0;
            
            Object.entries(analysis.analysis).forEach(([sectionKey, section]) => {
                const sectionName = (section?.section_name || sectionKey || '').toString().trim().toUpperCase();
                if (EXCLUDED_SECTIONS.has(sectionName)) {
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

        // Get faculty for each course and calculate performance
        const lowPerformanceFaculty = [];
        const processedFaculty = new Set(); // To avoid duplicates

        console.log(`Processing ${courses.length} courses...`);

        for (let i = 0; i < courses.length; i++) {
            const course = courses[i];
            const courseCode = course.code || course.course_code || course;
            const courseName = course.name || course.course_name || '';

            console.log(`Processing course ${i + 1}/${courses.length}: ${courseCode}`);

            try {
                // Get faculty for this course
                const faculties = await getFacultyByCourse(degree || '', currentAY, semester, department, courseCode, null);

                if (!faculties || faculties.length === 0) {
                    console.log(`No faculty found for course: ${courseCode}`);
                    continue;
                }

                console.log(`Found ${faculties.length} faculty for course ${courseCode}`);

                // Calculate performance for each faculty
                for (const faculty of faculties) {
                    const staffId = faculty.staffid || faculty.staff_id || '';
                    if (!staffId) {
                        console.warn(`Skipping faculty with no staff ID: ${faculty.faculty_name}`);
                        continue;
                    }

                    // Create unique key to avoid duplicates
                    const facultyKey = `${staffId}_${courseCode}_${currentAY}_${semester}`;
                    if (processedFaculty.has(facultyKey)) {
                        continue;
                    }
                    processedFaculty.add(facultyKey);

                    try {
                        // Get feedback analysis
                        const analysis = await getFeedbackAnalysis(degree || '', currentAY, semester, department, courseCode, staffId);

                        if (analysis && analysis.success) {
                            const overallScore = calculateOverallScore(analysis);

                            // Only include faculty with < 80% performance
                            if (overallScore < 80) {
                                lowPerformanceFaculty.push({
                                    staff_id: faculty.staff_id || '',
                                    staffid: staffId,
                                    faculty_name: faculty.faculty_name || analysis.faculty_name || 'Unknown',
                                    course_code: courseCode,
                                    course_name: courseName,
                                    current_ay: currentAY,
                                    semester: semester,
                                    course_offering_dept: department,
                                    overall_percentage: overallScore,
                                    total_responses: analysis.total_responses || 0,
                                    analysis: analysis.analysis // Include full analysis for details
                                });
                                console.log(`Added faculty with low performance: ${faculty.faculty_name} (${overallScore}%)`);
                            }
                        } else {
                            console.log(`No analysis data for ${staffId} in ${courseCode}`);
                        }
                    } catch (error) {
                        console.error(`Error calculating performance for ${staffId} in ${courseCode}:`, error.message);
                        // Continue with next faculty
                    }
                }
            } catch (error) {
                console.error(`Error processing course ${courseCode}:`, error.message);
                // Continue with next course
            }
        }

        // Sort by percentage (lowest first)
        lowPerformanceFaculty.sort((a, b) => a.overall_percentage - b.overall_percentage);

        console.log(`Found ${lowPerformanceFaculty.length} faculty with <80% performance`);
        return lowPerformanceFaculty;
    } catch (error) {
        console.error('Error in getFacultyWithLowPerformance:', error);
        throw error;
    }
};

module.exports = {
    uploadExplanationFile,
    saveExplanationDocument,
    getExplanationDocuments,
    getExplanationDocumentById,
    deleteExplanationDocument,
    getExplanationFile,
    getFacultyWithLowPerformance
};

