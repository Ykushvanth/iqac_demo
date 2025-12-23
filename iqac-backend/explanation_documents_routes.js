const express = require('express');
const router = express.Router();
const path = require('path');
const {
    uploadExplanationFile,
    saveExplanationDocument,
    getExplanationDocuments,
    getExplanationDocumentById,
    deleteExplanationDocument,
    getExplanationFile,
    getFacultyWithLowPerformance
} = require('./explanation_documents_backend');

/**
 * Upload explanation document
 * POST /api/explanations/upload
 * Body: FormData with file and metadata
 */
router.post('/upload', async (req, res) => {
    try {
        if (!req.files || !req.files.file) {
            return res.status(400).json({
                success: false,
                error: 'No file uploaded'
            });
        }

        const file = req.files.file;
        const {
            uploaded_by_user_id,
            uploaded_by_name,
            department,
            school,
            current_ay,
            semester,
            course_offering_dept,
            course_code,
            course_name,
            staff_id,
            staff_name,
            overall_percentage,
            performance_category,
            explanation_text
        } = req.body;

        // Validate required fields
        if (!uploaded_by_user_id || !department || !current_ay || !semester || !course_offering_dept) {
            return res.status(400).json({
                success: false,
                error: 'Missing required fields: uploaded_by_user_id, department, current_ay, semester, course_offering_dept'
            });
        }

        // Upload file
        const uploadResult = await uploadExplanationFile(file, { department });

        // Save document metadata to database
        const documentData = {
            uploaded_by_user_id,
            uploaded_by_name: uploaded_by_name || null,
            department,
            school: school || null,
            current_ay,
            semester,
            course_offering_dept,
            course_code: course_code || null,
            course_name: course_name || null,
            staff_id: staff_id || null,
            staff_name: staff_name || null,
            overall_percentage: overall_percentage ? parseFloat(overall_percentage) : null,
            performance_category: performance_category || 'department',
            file_name: uploadResult.fileName,
            file_path: uploadResult.filePath,
            file_type: uploadResult.fileType,
            file_size: uploadResult.fileSize,
            explanation_text: explanation_text || null,
            status: 'active'
        };

        const savedDocument = await saveExplanationDocument(documentData);

        res.status(200).json({
            success: true,
            message: 'Explanation document uploaded successfully',
            document: savedDocument
        });
    } catch (error) {
        console.error('Error uploading explanation document:', error);
        res.status(500).json({
            success: false,
            error: error.message || 'Error uploading explanation document'
        });
    }
});

/**
 * Get faculty with performance < 80%
 * GET /api/explanations/faculty-low-performance
 * Query params: current_ay, semester, department, degree (optional)
 */
router.get('/faculty-low-performance', async (req, res) => {
    try {
        // Note: req.user would be set by auth middleware if you have one
        // For now, we'll extract user info from query if needed, or just pass null
        const user = req.user || null;
        let { current_ay, semester, department, degree } = req.query;

        // Decode URL-encoded parameters
        if (current_ay) current_ay = decodeURIComponent(current_ay);
        if (semester) semester = decodeURIComponent(semester);
        if (department) department = decodeURIComponent(department);
        if (degree) degree = decodeURIComponent(degree);

        console.log('Faculty low performance request:', { current_ay, semester, department, degree });

        // Validate required parameters
        if (!current_ay || !semester || !department) {
            return res.status(400).json({
                success: false,
                error: 'Missing required parameters: current_ay, semester, department'
            });
        }

        // For HoD, ensure they can only query their own department
        // (This check would require user info from auth middleware)
        // For now, we'll let the backend function handle role-based filtering

        console.log('Calling getFacultyWithLowPerformance...');
        const faculty = await getFacultyWithLowPerformance(
            current_ay,
            semester,
            department,
            degree || '',
            user
        );

        console.log(`Found ${faculty.length} faculty with low performance`);

        res.status(200).json({
            success: true,
            count: faculty.length,
            faculty
        });
    } catch (error) {
        console.error('Error fetching faculty with low performance:', error);
        console.error('Error stack:', error.stack);
        res.status(500).json({
            success: false,
            error: error.message || 'Error fetching faculty with low performance'
        });
    }
});

/**
 * Get explanation documents (with role-based filtering)
 * GET /api/explanations
 * Query params: filters (department, school, current_ay, semester, course_code, staff_id, etc.)
 */
router.get('/', async (req, res) => {
    try {
        // Get user from request (should be set by auth middleware)
        const user = req.user || null;

        const filters = {
            department: req.query.department,
            school: req.query.school,
            current_ay: req.query.current_ay,
            semester: req.query.semester,
            course_code: req.query.course_code,
            staff_id: req.query.staff_id,
            uploaded_by_user_id: req.query.uploaded_by_user_id
        };

        // Remove undefined filters
        Object.keys(filters).forEach(key => {
            if (filters[key] === undefined) {
                delete filters[key];
            }
        });

        const documents = await getExplanationDocuments(filters, user);

        res.status(200).json({
            success: true,
            count: documents.length,
            documents
        });
    } catch (error) {
        console.error('Error fetching explanation documents:', error);
        res.status(500).json({
            success: false,
            error: error.message || 'Error fetching explanation documents'
        });
    }
});

/**
 * Get single explanation document by ID
 * GET /api/explanations/:id
 */
router.get('/:id', async (req, res) => {
    try {
        const user = req.user || null;
        const document = await getExplanationDocumentById(req.params.id, user);

        res.status(200).json({
            success: true,
            document
        });
    } catch (error) {
        console.error('Error fetching explanation document:', error);
        const statusCode = error.message.includes('Unauthorized') ? 403 : 500;
        res.status(statusCode).json({
            success: false,
            error: error.message || 'Error fetching explanation document'
        });
    }
});

/**
 * Download/view explanation document file
 * GET /api/explanations/:id/file
 */
router.get('/:id/file', async (req, res) => {
    try {
        const user = req.user || null;
        const document = await getExplanationDocumentById(req.params.id, user);

        const fileContent = await getExplanationFile(document.file_path);

        // Set appropriate content type
        const contentType = document.file_type || 'application/octet-stream';
        res.setHeader('Content-Type', contentType);
        res.setHeader('Content-Disposition', `inline; filename="${document.file_name}"`);
        res.send(fileContent);
    } catch (error) {
        console.error('Error fetching explanation file:', error);
        const statusCode = error.message.includes('Unauthorized') ? 403 : 500;
        res.status(statusCode).json({
            success: false,
            error: error.message || 'Error fetching explanation file'
        });
    }
});

/**
 * Delete explanation document (soft delete)
 * DELETE /api/explanations/:id
 */
router.delete('/:id', async (req, res) => {
    try {
        const user = req.user || null;
        const result = await deleteExplanationDocument(req.params.id, user);

        res.status(200).json({
            success: true,
            message: 'Explanation document deleted successfully',
            result
        });
    } catch (error) {
        console.error('Error deleting explanation document:', error);
        const statusCode = error.message.includes('Unauthorized') ? 403 : 500;
        res.status(statusCode).json({
            success: false,
            error: error.message || 'Error deleting explanation document'
        });
    }
});

module.exports = router;

