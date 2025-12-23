const express = require("express");
const router = express.Router();
const { generateReport, generateDepartmentReport, generateDepartmentNegativeCommentsExcel } = require("./report_generator");
const { getArtsVsEnggPerformance } = require('./visualize_backend');
const { generateDepartmentPdf, generateDepartmentNegativeCommentsPdf } = require('./pdf_report');
const { getDistinctCourses, getDistinctCourseNames, getDistinctCourseNamesByDepartment, getFacultyByFilters, getFacultyByCourse, getDistinctBatches, getBatchesForFacultyCourse, getDegreesForFacultyCourse, getCgpaBreakdownForFacultyCourse } = require('./analysis_backend');
const { getFeedbackAnalysis, getFacultyComments } = require('./performance_analysis');
const fastapiService = require('./fastapi_service');
const { getCoursesBySchoolDeptAndFilters } = require('./school_wise_report');

const EXCLUDED_SECTIONS = new Set([
    'COURSE CONTENT AND STRUCTURE',
    'STUDENT-CENTRIC FACTORS'
]);

const normalizeSectionName = (sectionKey, section) => ((section && section.section_name) || sectionKey || '')
    .toString()
    .trim()
    .toUpperCase();

const isExcludedSection = (sectionKey, section) => EXCLUDED_SECTIONS.has(normalizeSectionName(sectionKey, section));

router.post("/generate-report", async (req, res) => {
    try {
        const { analysisData, facultyData } = req.body;
        
        // Validate required data
        if (!analysisData || !facultyData) {
            throw new Error('Missing required data: analysisData or facultyData');
        }

        if (!analysisData.analysis || Object.keys(analysisData.analysis).length === 0) {
            throw new Error('No analysis data available');
        }
        
        console.log('Received request body:', JSON.stringify({
            analysisData: {
                staff_id: analysisData?.staff_id,
                course_code: analysisData?.course_code,
                course_name: analysisData?.course_name,
                total_responses: analysisData?.total_responses,
                hasAnalysis: !!analysisData?.analysis,
                analysisStructure: analysisData?.analysis ? 
                    Object.entries(analysisData.analysis).map(([key, section]) => ({
                        sectionKey: key,
                        sectionName: section.section_name,
                        questionsCount: Object.keys(section.questions || {}).length,
                        sampleQuestion: section.questions ? 
                            Object.values(section.questions)[0] : null
                    })) : 'No analysis data'
            },
            facultyData: {
                name: facultyData?.faculty_name || facultyData?.name
            }
        }, null, 2));
        
        const workbook = await generateReport(analysisData, facultyData);
        const buffer = await workbook.xlsx.writeBuffer();
        res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
        res.setHeader("Content-Disposition", `attachment; filename=faculty_feedback_report_${analysisData.staff_id || "unknown"}.xlsx`);
        res.send(buffer);
    } catch (error) {
        console.error('Error generating report:', error);
        res.status(500).json({
            error: error.message,
            details: error.stack,
            analysisDataPresent: !!req.body?.analysisData,
            facultyDataPresent: !!req.body?.facultyData
        });
    }
});

module.exports = router;

// Visualization: arts_vs_engg performance percentage (>=80) with department breakdown
router.post('/visualize/arts-engg-performance', async (req, res) => {
    try {
        const { degree, batch, dept } = req.body || {};
        const data = await getArtsVsEnggPerformance({ degree, batch, dept });
        res.json({ success: true, data });
    } catch (error) {
        console.error('Error in /visualize/arts-engg-performance:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Department PDF generation endpoint (no logo, matches sample format)
router.post('/generate-department-pdf', async (req, res) => {
    try {
        const { 
            department, 
            academicYear, 
            semester, 
            observations, 
            rows, 
            titleSuffix 
        } = req.body || {};
        
        // Validate required fields
        if (!department) {
            return res.status(400).json({ error: 'department is required' });
        }

        console.log('Generating PDF with data:', {
            department,
            academicYear,
            semester,
            observationsCount: observations?.length || 0,
            rowsCount: rows?.length || 0,
            titleSuffix
        });

        // Generate PDF buffer
        const buffer = await generateDepartmentPdf({ 
            department, 
            academicYear, 
            semester, 
            observations: observations || [], 
            rows: rows || [], 
            titleSuffix: titleSuffix || 'A 2024-25 (Odd Semester)'
        });

        // Validate buffer
        if (!buffer || buffer.length === 0) {
            throw new Error('Generated PDF buffer is empty');
        }

        console.log('PDF generated successfully, size:', buffer.length, 'bytes');

        // Generate safe filename
        const safeDeptName = (department || 'department')
            .toString()
            .replace(/[^a-z0-9]/gi, '_')
            .toLowerCase();
        
        const filename = `${safeDeptName}_feedback_report.pdf`;

        // Set headers and send buffer
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.setHeader('Content-Length', buffer.length);
        res.setHeader('Cache-Control', 'no-cache');
        
        res.send(buffer);
        
    } catch (error) {
        console.error('Error generating department PDF:', error);
        res.status(500).json({ 
            error: 'Failed to generate PDF',
            message: error.message,
            stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
    }
});
// Generate department-wise report (degree+staff_dept)
// Gets courses and staff_ids from course_allocation, then generates report with unique batch responses per faculty
router.post('/generate-department-report', async (req, res) => {
    try {
        const { degree, currentAY, semester, courseOfferingDept, batch, format, observations, titleSuffix } = req.body || {};
        // Using new filter hierarchy: degree, currentAY, semester, courseOfferingDept
        if (!degree || !currentAY || !semester || !courseOfferingDept) {
            return res.status(400).json({ error: 'Missing required fields: degree, currentAY, semester, courseOfferingDept' });
        }

        console.log(`\n=== Generating Department Report ===`);
        console.log(`Degree: ${degree}`);
        console.log(`Current AY: ${currentAY}`);
        console.log(`Semester: ${semester}`);
        console.log(`Course Offering Dept: ${courseOfferingDept}`);
        console.log(`Batch: ${batch || 'All'}`);

        // Get all courses from course_feedback_new using new filter hierarchy
        const courses = await getDistinctCourseNames(degree, currentAY, semester, courseOfferingDept);
        if (!courses || courses.length === 0) {
            return res.status(404).json({ error: 'No courses found for selected filters' });
        }

        console.log(`Found ${courses.length} courses for degree: ${degree}, currentAY: ${currentAY}, semester: ${semester}, courseOfferingDept: ${courseOfferingDept}`);

        // Aggregate analyses per course per faculty with batch-wise breakdown
        const groupedData = [];
        for (const course of courses) {
            const code = course.code ? course.code : course;
            const name = course.name || '';
            
            console.log(`\nProcessing course: ${code}`);
            
            // Get faculty from course_feedback_new using new filter hierarchy
            const faculties = await getFacultyByCourse(degree, currentAY, semester, courseOfferingDept, code);
            
            if (faculties.length === 0) {
                console.log(`No faculty found in course_feedback for course: ${code}`);
                continue;
            }

            console.log(`Found ${faculties.length} faculty members in course_feedback for course ${code}`);

            const facultyAnalyses = (await Promise.all(
                faculties.map(async (f) => {
                    const staffId = f.staffid || f.staff_id || '';
                    if (!staffId) {
                        console.warn(`Skipping faculty with no staffid: ${f.faculty_name}`);
                        return null;
                    }
                    console.log(`Getting feedback analysis for staffid: ${staffId} and course: ${code}`);
                    // Run analysis, batches, degrees, cgpa in parallel
                    // Use new filter hierarchy: degree, currentAY, semester, courseOfferingDept, courseCode, staffId
                    const [analysis, batches, degrees, cgpa] = await Promise.all([
                        getFeedbackAnalysis(degree, currentAY, semester, courseOfferingDept, code, staffId),
                        getBatchesForFacultyCourse(code, staffId),
                        getDegreesForFacultyCourse(code, staffId),
                        getCgpaBreakdownForFacultyCourse(code, staffId)
                    ]);

                    if (analysis && analysis.success) {
                        console.log(`✓ Analysis found for ${f.faculty_name} (staffid: ${staffId}) with ${batches.length} unique batches and ${degrees.length} unique degrees`);
                        return {
                            faculty_name: f.faculty_name || analysis.faculty_name || '',
                            staffid: staffId,
                            staff_id: f.staff_id || '',
                            batches: batches,
                            degrees: degrees,
                            analysisData: {
                                ...analysis,
                                course_offering_dept: courseOfferingDept,
                                current_ay: currentAY,
                                semester: semester,
                                unique_batches: batches,
                                unique_degrees: degrees,
                                cgpa_breakdown: cgpa
                            }
                        };
                    } else {
                        console.warn(`⚠ No feedback data found for staffid: ${staffId}, course: ${code}`);
                        return null;
                    }
                })
            )).filter(Boolean);
            
            if (facultyAnalyses.length > 0) {
                groupedData.push({
                    course_code: code,
                    course_name: name || (facultyAnalyses[0]?.analysisData?.course_name || ''),
                    faculties: facultyAnalyses
                });
                console.log(`✓ Added ${facultyAnalyses.length} faculty analyses for course: ${code}`);
            } else {
                console.log(`⚠ No faculty analyses found for course: ${code}`);
            }
        }

        if (groupedData.length === 0) {
            return res.status(404).json({ error: 'No analysis data available for selected filters' });
        }

        console.log(`\n=== Report Generation Summary ===`);
        console.log(`Total courses with data: ${groupedData.length}`);
        console.log(`Total faculty analyzed: ${groupedData.reduce((sum, c) => sum + c.faculties.length, 0)}`);

        // Helper to compute overall score for a faculty analysis
        const computeOverallScore = (analysis) => {
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

        if (format && format.toLowerCase() === 'pdf') {
            const aggregatedRows = [];
            groupedData.forEach(course => {
                course.faculties.forEach(fac => {
                    const overall = computeOverallScore(fac.analysisData?.analysis);
                    aggregatedRows.push({
                        course: `${course.course_code || ''} - ${course.course_name || ''}`.trim(),
                        faculty: fac.faculty_name || '',
                        percentage: overall
                    });
                });
            });

            const pdfBuffer = await generateDepartmentPdf({
                department: courseOfferingDept,
                academicYear: currentAY || '',
                semester: semester || '',
                observations: Array.isArray(observations) ? observations : [],
                rows: aggregatedRows,
                titleSuffix: titleSuffix || `${degree}${batch && batch !== 'ALL' ? ` - Batch ${batch}` : ''}`
            });

            if (!pdfBuffer || pdfBuffer.length === 0) {
                throw new Error('Generated PDF buffer is empty');
            }

            const safeDeptName = (courseOfferingDept || 'department').toString().replace(/[^a-z0-9]/gi, '_').toLowerCase();
            res.status(200);
            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader('Content-Disposition', `attachment; filename="${safeDeptName}_department_report.pdf"`);
            res.setHeader('Content-Length', pdfBuffer.length);
            res.setHeader('Cache-Control', 'no-cache');
            res.setHeader('Accept-Ranges', 'none');
            res.end(pdfBuffer);
            return;
        }

        const workbook = await generateDepartmentReport({ 
            degree, 
            currentAY, 
            semester, 
            courseOfferingDept, 
            batch: batch || 'ALL' 
        }, groupedData);
        const buffer = await workbook.xlsx.writeBuffer();
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename=${courseOfferingDept}_department_report.xlsx`);
        res.send(buffer);
    } catch (error) {
        console.error('Error generating department report:', error);
        res.status(500).json({ error: error.message });
    }
});

router.post('/generate-department-report-all-batches', async (req, res) => {
    try {
        const { degree, currentAY, semester, courseOfferingDept, format, observations, titleSuffix } = req.body || {};
        // Using new filter hierarchy: degree, currentAY, semester, courseOfferingDept
        if (!degree || !currentAY || !semester || !courseOfferingDept) {
            return res.status(400).json({ error: 'Missing required fields: degree, currentAY, semester, courseOfferingDept' });
        }

        console.log(`\n=== Generating Department Report (All Batches) ===`);
        console.log(`Degree: ${degree}`);
        console.log(`Current AY: ${currentAY}`);
        console.log(`Semester: ${semester}`);
        console.log(`Course Offering Dept: ${courseOfferingDept}`);

        // Get all courses from course_feedback_new using new filter hierarchy
        const courses = await getDistinctCourseNames(degree, currentAY, semester, courseOfferingDept);
        if (!courses || courses.length === 0) {
            return res.status(404).json({ error: 'No courses found for selected filters' });
        }

        console.log(`Found ${courses.length} courses for degree: ${degree}, currentAY: ${currentAY}, semester: ${semester}, courseOfferingDept: ${courseOfferingDept}`);

        // Aggregate by course_code across all batches
        const courseMap = new Map(); // course_code -> { course_code, course_name, faculties: [] }

        for (const course of courses) {
            const code = course.code ? course.code : course;
            const name = course.name || '';
            
            console.log(`\nProcessing course: ${code}`);

            // Get faculty from course_feedback_new using new filter hierarchy
            const faculties = await getFacultyByCourse(degree, currentAY, semester, courseOfferingDept, code);
            
            if (faculties.length === 0) {
                console.log(`No faculty found in course_feedback for course: ${code}`);
                continue;
            }

            console.log(`Found ${faculties.length} faculty members in course_feedback for course ${code}`);

            // Initialize course in map if not exists
            if (!courseMap.has(code)) {
                courseMap.set(code, {
                    course_code: code,
                    course_name: name || '',
                    faculties: []
                });
            }

            await Promise.all(
                faculties.map(async (f) => {
                    const staffId = f.staffid || f.staff_id || '';
                    if (!staffId) {
                        console.warn(`Skipping faculty with no staffid: ${f.faculty_name}`);
                        return;
                    }
                    console.log(`Getting feedback analysis for staffid: ${staffId} and course: ${code} (all batches)`);
                    // Use new filter hierarchy: degree, currentAY, semester, courseOfferingDept, courseCode, staffId
                    const [analysis, batches, degrees, cgpa] = await Promise.all([
                        getFeedbackAnalysis(degree, currentAY, semester, courseOfferingDept, code, staffId),
                        getBatchesForFacultyCourse(code, staffId),
                        getDegreesForFacultyCourse(code, staffId),
                        getCgpaBreakdownForFacultyCourse(code, staffId)
                    ]);
                    if (analysis && analysis.success) {
                        courseMap.get(code).faculties.push({
                            faculty_name: f.faculty_name || analysis.faculty_name || '',
                            staffid: staffId,
                            staff_id: f.staff_id || '',
                            batches: batches,
                            degrees: degrees,
                            analysisData: {
                                ...analysis,
                                batch: 'ALL',
                                course_offering_dept: courseOfferingDept,
                                current_ay: currentAY,
                                semester: semester,
                                unique_batches: batches,
                                unique_degrees: degrees,
                                cgpa_breakdown: cgpa
                            }
                        });
                        console.log(`✓ Analysis found for ${f.faculty_name} (staffid: ${staffId})`);
                    } else {
                        console.warn(`⚠ No feedback data found for staffid: ${staffId}, course: ${code}`);
                    }
                })
            );
        }

        const groupedData = Array.from(courseMap.values()).filter(course => course.faculties.length > 0);
        
        if (groupedData.length === 0) {
            return res.status(404).json({ error: 'No analysis data available for selected filters' });
        }

        console.log(`\n=== Report Generation Summary (All Batches) ===`);
        console.log(`Total courses with data: ${groupedData.length}`);
        console.log(`Total faculty analyzed: ${groupedData.reduce((sum, c) => sum + c.faculties.length, 0)}`);

        const computeOverallScore = (analysis) => {
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

        if (format && format.toLowerCase() === 'pdf') {
            const aggregatedRows = [];
            groupedData.forEach(course => {
                course.faculties.forEach(fac => {
                    const overall = computeOverallScore(fac.analysisData?.analysis);
                    aggregatedRows.push({
                        course: `${course.course_code || ''} - ${course.course_name || ''}`.trim(),
                        faculty: fac.faculty_name || '',
                        percentage: overall
                    });
                });
            });

            const pdfBuffer = await generateDepartmentPdf({
                department: courseOfferingDept,
                academicYear: currentAY || '',
                semester: semester || '',
                observations: Array.isArray(observations) ? observations : [],
                rows: aggregatedRows,
                titleSuffix: titleSuffix || `${degree} - All Batches`
            });

            if (!pdfBuffer || pdfBuffer.length === 0) {
                throw new Error('Generated PDF buffer is empty');
            }

            const safeDeptName = (courseOfferingDept || 'department').toString().replace(/[^a-z0-9]/gi, '_').toLowerCase();
            res.status(200);
            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader('Content-Disposition', `attachment; filename="${safeDeptName}_department_report_all_batches.pdf"`);
            res.setHeader('Content-Length', pdfBuffer.length);
            res.setHeader('Cache-Control', 'no-cache');
            res.setHeader('Accept-Ranges', 'none');
            res.end(pdfBuffer);
            return;
        }

        const workbook = await generateDepartmentReport({ 
            degree, 
            currentAY, 
            semester, 
            courseOfferingDept, 
            batch: 'ALL' 
        }, groupedData);
        const buffer = await workbook.xlsx.writeBuffer();
        
        // Create safe filename - check if courseOfferingDept is actually defined
        console.log('Course Offering Dept value:', courseOfferingDept, 'Type:', typeof courseOfferingDept);
        const safeDeptName = (courseOfferingDept || 'department').toString().replace(/[^a-z0-9]/gi, '_').toLowerCase();
        console.log('Safe Dept Name:', safeDeptName);
        
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="${safeDeptName}_department_report_all_batches.xlsx"`);
        res.send(buffer);
    } catch (error) {
        console.error('Error generating all-batches department report:', error);
        res.status(500).json({ error: error.message });
    }
});

// Dean-specific: generate department report (all batches) without degree filter
router.post('/dean/generate-department-report-all-batches', async (req, res) => {
    try {
        const { school, currentAY, semester, courseOfferingDept, format, observations, titleSuffix } = req.body || {};
        if (!school || !currentAY || !semester || !courseOfferingDept) {
            return res.status(400).json({ error: 'Missing required fields: school, currentAY, semester, courseOfferingDept' });
        }

        console.log(`\n=== Dean Generating Department Report (All Batches) ===`);
        console.log(`School: ${school}`);
        console.log(`Current AY: ${currentAY}`);
        console.log(`Semester: ${semester}`);
        console.log(`Course Offering Dept: ${courseOfferingDept}`);

        // Get all courses for this dept/AY/semester (no degree filter)
        const courses = await getCoursesBySchoolDeptAndFilters(school, courseOfferingDept, currentAY, semester);
        if (!courses || courses.length === 0) {
            return res.status(404).json({ error: 'No courses found for selected filters' });
        }

        console.log(`Dean: found ${courses.length} courses for school: ${school}, dept: ${courseOfferingDept}, AY: ${currentAY}, semester: ${semester}`);

        const courseMap = new Map();

        for (const course of courses) {
            const code = course.code || course.course_code || course;
            const name = course.name || course.course_name || '';

            console.log(`\nDean processing course: ${code}`);

            // Get faculty from course_feedback_new using new filter hierarchy WITHOUT degree
            const faculties = await getFacultyByCourse('', currentAY, semester, courseOfferingDept, code);

            if (!faculties || faculties.length === 0) {
                console.log(`Dean: no faculty found for course: ${code}`);
                continue;
            }

            console.log(`Dean: found ${faculties.length} faculty for course ${code}`);

            if (!courseMap.has(code)) {
                courseMap.set(code, {
                    course_code: code,
                    course_name: name || '',
                    faculties: []
                });
            }

            await Promise.all(
                faculties.map(async (f) => {
                    const staffId = f.staffid || f.staff_id || '';
                    if (!staffId) {
                        console.warn(`Dean: skipping faculty with no staffid: ${f.faculty_name}`);
                        return;
                    }
                    console.log(`Dean: getting feedback analysis for staffid: ${staffId}, course: ${code}`);

                    const [analysis, batches, degrees, cgpa] = await Promise.all([
                        getFeedbackAnalysis('', currentAY, semester, courseOfferingDept, code, staffId),
                        getBatchesForFacultyCourse(code, staffId),
                        getDegreesForFacultyCourse(code, staffId),
                        getCgpaBreakdownForFacultyCourse(code, staffId)
                    ]);

                    if (analysis && analysis.success) {
                        courseMap.get(code).faculties.push({
                            faculty_name: f.faculty_name || analysis.faculty_name || '',
                            staffid: staffId,
                            staff_id: f.staff_id || '',
                            batches: batches,
                            degrees: degrees,
                            analysisData: {
                                ...analysis,
                                batch: 'ALL',
                                course_offering_dept: courseOfferingDept,
                                current_ay: currentAY,
                                semester: semester,
                                unique_batches: batches,
                                unique_degrees: degrees,
                                cgpa_breakdown: cgpa
                            }
                        });
                        console.log(`Dean: ✓ analysis found for ${f.faculty_name} (staffid: ${staffId})`);
                    } else {
                        console.warn(`Dean: ⚠ no feedback data for staffid: ${staffId}, course: ${code}`);
                    }
                })
            );
        }

        const groupedData = Array.from(courseMap.values()).filter(course => course.faculties.length > 0);

        if (groupedData.length === 0) {
            return res.status(404).json({ error: 'No analysis data available for selected filters' });
        }

        console.log(`\n=== Dean Report Generation Summary (All Batches) ===`);
        console.log(`Total courses with data: ${groupedData.length}`);
        console.log(`Total faculty analyzed: ${groupedData.reduce((sum, c) => sum + c.faculties.length, 0)}`);

        const computeOverallScore = (analysis) => {
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

        if (format && format.toLowerCase() === 'pdf') {
            const aggregatedRows = [];
            groupedData.forEach(course => {
                course.faculties.forEach(fac => {
                    const overall = computeOverallScore(fac.analysisData?.analysis);
                    aggregatedRows.push({
                        course: `${course.course_code || ''} - ${course.course_name || ''}`.trim(),
                        faculty: fac.faculty_name || '',
                        percentage: overall
                    });
                });
            });

            const pdfBuffer = await generateDepartmentPdf({
                department: courseOfferingDept,
                academicYear: currentAY || '',
                semester: semester || '',
                observations: Array.isArray(observations) ? observations : [],
                rows: aggregatedRows,
                titleSuffix: titleSuffix || `All Batches`
            });

            if (!pdfBuffer || pdfBuffer.length === 0) {
                throw new Error('Generated PDF buffer is empty');
            }

            const safeDeptName = (courseOfferingDept || 'department').toString().replace(/[^a-z0-9]/gi, '_').toLowerCase();
            res.status(200);
            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader('Content-Disposition', `attachment; filename="${safeDeptName}_department_report_all_batches.pdf"`);
            res.setHeader('Content-Length', pdfBuffer.length);
            res.setHeader('Cache-Control', 'no-cache');
            res.setHeader('Accept-Ranges', 'none');
            res.end(pdfBuffer);
            return;
        }

        const workbook = await generateDepartmentReport({ 
            degree: '', 
            currentAY, 
            semester, 
            courseOfferingDept, 
            batch: 'ALL' 
        }, groupedData);
        const buffer = await workbook.xlsx.writeBuffer();

        const safeDeptName = (courseOfferingDept || 'department').toString().replace(/[^a-z0-9]/gi, '_').toLowerCase();
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="${safeDeptName}_department_report_all_batches.xlsx"`);
        res.send(buffer);
    } catch (error) {
        console.error('Dean: Error generating all-batches department report:', error);
        res.status(500).json({ error: error.message });
    }
});

// Dean-specific: Generate department report for a single batch
router.post('/dean/generate-department-report', async (req, res) => {
    try {
        const { school, currentAY, semester, courseOfferingDept, batch, format, observations, titleSuffix } = req.body || {};
        if (!school || !currentAY || !semester || !courseOfferingDept || !batch) {
            return res.status(400).json({ error: 'Missing required fields: school, currentAY, semester, courseOfferingDept, batch' });
        }

        console.log(`\n=== Dean Generating Department Report (Single Batch) ===`);
        console.log(`School: ${school}`);
        console.log(`Current AY: ${currentAY}`);
        console.log(`Semester: ${semester}`);
        console.log(`Course Offering Dept: ${courseOfferingDept}`);
        console.log(`Batch: ${batch}`);

        // Get all courses for this dept/AY/semester (no degree filter)
        const courses = await getCoursesBySchoolDeptAndFilters(school, courseOfferingDept, currentAY, semester);
        if (!courses || courses.length === 0) {
            return res.status(404).json({ error: 'No courses found for selected filters' });
        }

        console.log(`Dean: found ${courses.length} courses for school: ${school}, dept: ${courseOfferingDept}, AY: ${currentAY}, semester: ${semester}`);

        const groupedData = [];
        for (const course of courses) {
            const code = course.code || course.course_code || course;
            const name = course.name || course.course_name || '';
            
            console.log(`\nDean processing course: ${code}`);
            
            // Get faculty from course_feedback_new using new filter hierarchy WITHOUT degree
            const faculties = await getFacultyByCourse('', currentAY, semester, courseOfferingDept, code);
            
            if (faculties.length === 0) {
                console.log(`Dean: no faculty found for course: ${code}`);
                continue;
            }

            console.log(`Dean: found ${faculties.length} faculty for course ${code}`);

            const facultyAnalyses = (await Promise.all(
                faculties.map(async (f) => {
                    const staffId = f.staffid || f.staff_id || '';
                    if (!staffId) {
                        console.warn(`Dean: skipping faculty with no staffid: ${f.faculty_name}`);
                        return null;
                    }
                    console.log(`Dean: getting feedback analysis for staffid: ${staffId}, course: ${code}`);
                    // Run analysis, batches, degrees, cgpa in parallel
                    // Use new filter hierarchy WITHOUT degree: currentAY, semester, courseOfferingDept, courseCode, staffId
                    const [analysis, batches, degrees, cgpa] = await Promise.all([
                        getFeedbackAnalysis('', currentAY, semester, courseOfferingDept, code, staffId),
                        getBatchesForFacultyCourse(code, staffId),
                        getDegreesForFacultyCourse(code, staffId),
                        getCgpaBreakdownForFacultyCourse(code, staffId)
                    ]);

                    if (analysis && analysis.success) {
                        console.log(`Dean: ✓ analysis found for ${f.faculty_name} (staffid: ${staffId})`);
                        return {
                            faculty_name: f.faculty_name || analysis.faculty_name || '',
                            staffid: staffId,
                            staff_id: f.staff_id || '',
                            batches: batches,
                            degrees: degrees,
                            analysisData: {
                                ...analysis,
                                course_offering_dept: courseOfferingDept,
                                current_ay: currentAY,
                                semester: semester,
                                unique_batches: batches,
                                unique_degrees: degrees,
                                cgpa_breakdown: cgpa
                            }
                        };
                    } else {
                        console.warn(`Dean: ⚠ no feedback data for staffid: ${staffId}, course: ${code}`);
                        return null;
                    }
                })
            )).filter(Boolean);
            
            if (facultyAnalyses.length > 0) {
                groupedData.push({
                    course_code: code,
                    course_name: name || (facultyAnalyses[0]?.analysisData?.course_name || ''),
                    faculties: facultyAnalyses
                });
                console.log(`Dean: ✓ added ${facultyAnalyses.length} faculty analyses for course: ${code}`);
            }
        }

        if (groupedData.length === 0) {
            return res.status(404).json({ error: 'No analysis data available for selected filters' });
        }

        console.log(`\n=== Dean Report Generation Summary (Single Batch) ===`);
        console.log(`Total courses with data: ${groupedData.length}`);
        console.log(`Total faculty analyzed: ${groupedData.reduce((sum, c) => sum + c.faculties.length, 0)}`);

        // Filter by batch if not 'ALL'
        let filteredData = groupedData;
        if (batch && batch !== 'ALL' && batch !== 'all') {
            filteredData = groupedData.map(course => ({
                ...course,
                faculties: course.faculties.filter(fac => {
                    const batches = fac.batches || [];
                    return batches.includes(batch);
                })
            })).filter(course => course.faculties.length > 0);
        }

        if (format && format.toLowerCase() === 'pdf') {
            const computeOverallScore = (analysis) => {
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

            const aggregatedRows = [];
            filteredData.forEach(course => {
                course.faculties.forEach(fac => {
                    const overall = computeOverallScore(fac.analysisData?.analysis);
                    aggregatedRows.push({
                        course: `${course.course_code || ''} - ${course.course_name || ''}`.trim(),
                        faculty: fac.faculty_name || '',
                        percentage: overall
                    });
                });
            });

            const pdfBuffer = await generateDepartmentPdf({
                department: courseOfferingDept,
                academicYear: currentAY || '',
                semester: semester || '',
                observations: Array.isArray(observations) ? observations : [],
                rows: aggregatedRows,
                titleSuffix: titleSuffix || `Batch ${batch}`
            });

            if (!pdfBuffer || pdfBuffer.length === 0) {
                throw new Error('Generated PDF buffer is empty');
            }

            const safeDeptName = (courseOfferingDept || 'department').toString().replace(/[^a-z0-9]/gi, '_').toLowerCase();
            res.status(200);
            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader('Content-Disposition', `attachment; filename="${safeDeptName}_department_report_batch_${batch}.pdf"`);
            res.setHeader('Content-Length', pdfBuffer.length);
            res.setHeader('Cache-Control', 'no-cache');
            res.setHeader('Accept-Ranges', 'none');
            res.end(pdfBuffer);
            return;
        }

        const workbook = await generateDepartmentReport({ 
            degree: '', 
            currentAY, 
            semester, 
            courseOfferingDept, 
            batch: batch || 'ALL' 
        }, filteredData);
        const buffer = await workbook.xlsx.writeBuffer();

        const safeDeptName = (courseOfferingDept || 'department').toString().replace(/[^a-z0-9]/gi, '_').toLowerCase();
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="${safeDeptName}_department_report_batch_${batch}.xlsx"`);
        res.send(buffer);
    } catch (error) {
        console.error('Dean: Error generating department report:', error);
        res.status(500).json({ error: error.message });
    }
});

// Dean-specific: Generate department negative comments Excel
router.post('/dean/generate-department-negative-comments-excel', async (req, res) => {
    try {
        const { school, currentAY, semester, courseOfferingDept, batch } = req.body || {};
        
        if (!school || !currentAY || !semester || !courseOfferingDept) {
            return res.status(400).json({ error: 'Missing required fields: school, currentAY, semester, courseOfferingDept' });
        }

        console.log(`\n=== Dean Generating Department Negative Comments Excel ===`);
        console.log(`School: ${school}`);
        console.log(`Current AY: ${currentAY}`);
        console.log(`Semester: ${semester}`);
        console.log(`Course Offering Dept: ${courseOfferingDept}`);

        // Get all courses for this dept/AY/semester (no degree filter)
        const courses = await getCoursesBySchoolDeptAndFilters(school, courseOfferingDept, currentAY, semester);
        if (!courses || courses.length === 0) {
            return res.status(404).json({ error: 'No courses found for selected filters' });
        }

        console.log(`Dean: found ${courses.length} courses for school: ${school}, dept: ${courseOfferingDept}, AY: ${currentAY}, semester: ${semester}`);

        const groupedData = [];
        
        for (const course of courses) {
            const code = course.code || course.course_code || course;
            const name = course.name || course.course_name || '';
            
            console.log(`\nDean processing course: ${code}`);
            
            // Get faculty from course_feedback_new using new filter hierarchy WITHOUT degree
            const faculties = await getFacultyByCourse('', currentAY, semester, courseOfferingDept, code);
            
            if (faculties.length === 0) {
                console.log(`Dean: no faculty found for course: ${code}`);
                continue;
            }

            console.log(`Dean: found ${faculties.length} faculty for course ${code}`);

            const courseFaculties = [];
            
            // Process each faculty
            await Promise.all(
                faculties.map(async (f) => {
                    const staffId = f.staffid || f.staff_id || '';
                    if (!staffId) {
                        console.warn(`Dean: skipping faculty with no staffid: ${f.faculty_name}`);
                        return;
                    }

                    console.log(`Dean: getting comments for staffid: ${staffId}, course: ${code}`);

                    // Get comments using new filter hierarchy WITHOUT degree
                    const commentsResult = await getFacultyComments('', currentAY, semester, courseOfferingDept, code, staffId);
                    
                    if (commentsResult && commentsResult.success && commentsResult.comments && commentsResult.comments.length > 0) {
                        const negativeComments = commentsResult.comments.filter(c => 
                            c.sentiment === 'negative' || c.sentiment === 'neutral'
                        );

                        if (negativeComments.length > 0) {
                            courseFaculties.push({
                                faculty_name: f.faculty_name || commentsResult.faculty_name || '',
                                staff_id: staffId,
                                course_code: code,
                                course_name: name || commentsResult.course_name || '',
                                comments: negativeComments
                            });
                            console.log(`Dean: ✓ found ${negativeComments.length} negative/neutral comments for ${f.faculty_name}`);
                        }
                    }
                })
            );

            if (courseFaculties.length > 0) {
                groupedData.push({
                    course_code: code,
                    course_name: name,
                    faculties: courseFaculties
                });
            }
        }

        if (groupedData.length === 0) {
            return res.status(404).json({ error: 'No negative comments found for selected filters' });
        }

        const workbook = await generateDepartmentNegativeCommentsExcel(groupedData);
        const buffer = await workbook.xlsx.writeBuffer();

        const safeDeptName = (courseOfferingDept || 'department').toString().replace(/[^a-z0-9]/gi, '_').toLowerCase();
        const batchSuffix = batch && batch !== 'ALL' && batch !== 'all' ? `_batch_${batch}` : '_all_batches';
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="${safeDeptName}_negative_comments${batchSuffix}.xlsx"`);
        res.send(buffer);
    } catch (error) {
        console.error('Dean: Error generating negative comments Excel:', error);
        res.status(500).json({ error: error.message });
    }
});

// ==================== HoD-SPECIFIC DEPARTMENT-BASED REPORT ROUTES ====================

// HoD-specific: generate department report (all batches) without degree filter
router.post('/hod/generate-department-report-all-batches', async (req, res) => {
    try {
        const { department, currentAY, semester, courseOfferingDept, format, observations, titleSuffix } = req.body || {};
        if (!department || !currentAY || !semester || !courseOfferingDept) {
            return res.status(400).json({ error: 'Missing required fields: department, currentAY, semester, courseOfferingDept' });
        }

        console.log(`\n=== HoD Generating Department Report (All Batches) ===`);
        console.log(`Department: ${department}`);
        console.log(`Current AY: ${currentAY}`);
        console.log(`Semester: ${semester}`);
        console.log(`Course Offering Dept: ${courseOfferingDept}`);

        // Get all courses for this dept/AY/semester (no degree filter)
        const courses = await getDistinctCourseNamesByDepartment(courseOfferingDept, currentAY, semester);
        if (!courses || courses.length === 0) {
            return res.status(404).json({ error: 'No courses found for selected filters' });
        }

        console.log(`HoD: found ${courses.length} courses for dept: ${courseOfferingDept}, AY: ${currentAY}, semester: ${semester}`);

        const courseMap = new Map();

        for (const course of courses) {
            const code = course.code || course.course_code || course;
            const name = course.name || course.course_name || '';

            console.log(`\nHoD processing course: ${code}`);

            // Get faculty from course_feedback_new using new filter hierarchy WITHOUT degree
            const faculties = await getFacultyByCourse('', currentAY, semester, courseOfferingDept, code);

            if (!faculties || faculties.length === 0) {
                console.log(`HoD: no faculty found for course: ${code}`);
                continue;
            }

            console.log(`HoD: found ${faculties.length} faculty for course ${code}`);

            if (!courseMap.has(code)) {
                courseMap.set(code, {
                    course_code: code,
                    course_name: name || '',
                    faculties: []
                });
            }

            await Promise.all(
                faculties.map(async (f) => {
                    const staffId = f.staffid || f.staff_id || '';
                    if (!staffId) {
                        console.warn(`HoD: skipping faculty with no staffid: ${f.faculty_name}`);
                        return;
                    }
                    console.log(`HoD: getting feedback analysis for staffid: ${staffId}, course: ${code}`);

                    const [analysis, batches, degrees, cgpa] = await Promise.all([
                        getFeedbackAnalysis('', currentAY, semester, courseOfferingDept, code, staffId),
                        getBatchesForFacultyCourse(code, staffId),
                        getDegreesForFacultyCourse(code, staffId),
                        getCgpaBreakdownForFacultyCourse(code, staffId)
                    ]);

                    if (analysis && analysis.success) {
                        courseMap.get(code).faculties.push({
                            faculty_name: f.faculty_name || analysis.faculty_name || '',
                            staffid: staffId,
                            staff_id: f.staff_id || '',
                            batches: batches,
                            degrees: degrees,
                            analysisData: {
                                ...analysis,
                                batch: 'ALL',
                                course_offering_dept: courseOfferingDept,
                                current_ay: currentAY,
                                semester: semester,
                                unique_batches: batches,
                                unique_degrees: degrees,
                                cgpa_breakdown: cgpa
                            }
                        });
                        console.log(`HoD: ✓ analysis found for ${f.faculty_name} (staffid: ${staffId})`);
                    } else {
                        console.warn(`HoD: ⚠ no feedback data for staffid: ${staffId}, course: ${code}`);
                    }
                })
            );
        }

        const groupedData = Array.from(courseMap.values()).filter(course => course.faculties.length > 0);

        if (groupedData.length === 0) {
            return res.status(404).json({ error: 'No analysis data available for selected filters' });
        }

        console.log(`\n=== HoD Report Generation Summary (All Batches) ===`);
        console.log(`Total courses with data: ${groupedData.length}`);
        console.log(`Total faculty analyzed: ${groupedData.reduce((sum, c) => sum + c.faculties.length, 0)}`);

        const computeOverallScore = (analysis) => {
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

        if (format && format.toLowerCase() === 'pdf') {
            const aggregatedRows = [];
            groupedData.forEach(course => {
                course.faculties.forEach(fac => {
                    const overall = computeOverallScore(fac.analysisData?.analysis);
                    aggregatedRows.push({
                        course: `${course.course_code || ''} - ${course.course_name || ''}`.trim(),
                        faculty: fac.faculty_name || '',
                        percentage: overall
                    });
                });
            });

            const pdfBuffer = await generateDepartmentPdf({
                department: courseOfferingDept,
                academicYear: currentAY || '',
                semester: semester || '',
                observations: Array.isArray(observations) ? observations : [],
                rows: aggregatedRows,
                titleSuffix: titleSuffix || `All Batches`
            });

            if (!pdfBuffer || pdfBuffer.length === 0) {
                throw new Error('Generated PDF buffer is empty');
            }

            const safeDeptName = (courseOfferingDept || 'department').toString().replace(/[^a-z0-9]/gi, '_').toLowerCase();
            res.status(200);
            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader('Content-Disposition', `attachment; filename="${safeDeptName}_department_report_all_batches.pdf"`);
            res.setHeader('Content-Length', pdfBuffer.length);
            res.setHeader('Cache-Control', 'no-cache');
            res.setHeader('Accept-Ranges', 'none');
            res.end(pdfBuffer);
            return;
        }

        const workbook = await generateDepartmentReport({ 
            degree: '', 
            currentAY, 
            semester, 
            courseOfferingDept, 
            batch: 'ALL' 
        }, groupedData);
        const buffer = await workbook.xlsx.writeBuffer();

        const safeDeptName = (courseOfferingDept || 'department').toString().replace(/[^a-z0-9]/gi, '_').toLowerCase();
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="${safeDeptName}_department_report_all_batches.xlsx"`);
        res.send(buffer);
    } catch (error) {
        console.error('HoD: Error generating all-batches department report:', error);
        res.status(500).json({ error: error.message });
    }
});

// HoD-specific: Generate department report for a single batch
router.post('/hod/generate-department-report', async (req, res) => {
    try {
        const { department, currentAY, semester, courseOfferingDept, batch, format, observations, titleSuffix } = req.body || {};
        if (!department || !currentAY || !semester || !courseOfferingDept || !batch) {
            return res.status(400).json({ error: 'Missing required fields: department, currentAY, semester, courseOfferingDept, batch' });
        }

        console.log(`\n=== HoD Generating Department Report (Single Batch) ===`);
        console.log(`Department: ${department}`);
        console.log(`Current AY: ${currentAY}`);
        console.log(`Semester: ${semester}`);
        console.log(`Course Offering Dept: ${courseOfferingDept}`);
        console.log(`Batch: ${batch}`);

        // Get all courses for this dept/AY/semester (no degree filter)
        const courses = await getDistinctCourseNamesByDepartment(courseOfferingDept, currentAY, semester);
        if (!courses || courses.length === 0) {
            return res.status(404).json({ error: 'No courses found for selected filters' });
        }

        console.log(`HoD: found ${courses.length} courses for dept: ${courseOfferingDept}, AY: ${currentAY}, semester: ${semester}`);

        const groupedData = [];
        for (const course of courses) {
            const code = course.code || course.course_code || course;
            const name = course.name || course.course_name || '';

            console.log(`\nHoD processing course: ${code}`);

            // Get faculty from course_feedback_new using new filter hierarchy WITHOUT degree
            const faculties = await getFacultyByCourse('', currentAY, semester, courseOfferingDept, code);

            if (!faculties || faculties.length === 0) {
                console.log(`HoD: no faculty found for course: ${code}`);
                continue;
            }

            console.log(`HoD: found ${faculties.length} faculty for course ${code}`);

            await Promise.all(
                faculties.map(async (f) => {
                    const staffId = f.staffid || f.staff_id || '';
                    if (!staffId) {
                        console.warn(`HoD: skipping faculty with no staffid: ${f.faculty_name}`);
                        return;
                    }
                    console.log(`HoD: getting feedback analysis for staffid: ${staffId}, course: ${code}, batch: ${batch}`);

                    const [analysis, batches, degrees, cgpa] = await Promise.all([
                        getFeedbackAnalysis('', currentAY, semester, courseOfferingDept, code, staffId, batch),
                        getBatchesForFacultyCourse(code, staffId),
                        getDegreesForFacultyCourse(code, staffId),
                        getCgpaBreakdownForFacultyCourse(code, staffId)
                    ]);

                    if (analysis && analysis.success) {
                        groupedData.push({
                            course_code: code,
                            course_name: name || '',
                            faculty_name: f.faculty_name || analysis.faculty_name || '',
                            staffid: staffId,
                            staff_id: f.staff_id || '',
                            batches: batches,
                            degrees: degrees,
                            analysisData: {
                                ...analysis,
                                batch: batch,
                                course_offering_dept: courseOfferingDept,
                                current_ay: currentAY,
                                semester: semester,
                                unique_batches: batches,
                                unique_degrees: degrees,
                                cgpa_breakdown: cgpa
                            }
                        });
                        console.log(`HoD: ✓ analysis found for ${f.faculty_name} (staffid: ${staffId})`);
                    } else {
                        console.warn(`HoD: ⚠ no feedback data for staffid: ${staffId}, course: ${code}, batch: ${batch}`);
                    }
                })
            );
        }

        if (groupedData.length === 0) {
            return res.status(404).json({ error: 'No analysis data available for selected filters' });
        }

        console.log(`\n=== HoD Report Generation Summary (Single Batch) ===`);
        console.log(`Total faculty analyzed: ${groupedData.length}`);

        if (format && format.toLowerCase() === 'pdf') {
            const aggregatedRows = groupedData.map(item => {
                const analysis = item.analysisData?.analysis || {};
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
                const overall = sectionCount > 0 ? Math.round(sectionSum / sectionCount) : 0;
                return {
                    course: `${item.course_code || ''} - ${item.course_name || ''}`.trim(),
                    faculty: item.faculty_name || '',
                    percentage: overall
                };
            });

            const pdfBuffer = await generateDepartmentPdf({
                department: courseOfferingDept,
                academicYear: currentAY || '',
                semester: semester || '',
                observations: Array.isArray(observations) ? observations : [],
                rows: aggregatedRows,
                titleSuffix: titleSuffix || `Batch ${batch}`
            });

            if (!pdfBuffer || pdfBuffer.length === 0) {
                throw new Error('Generated PDF buffer is empty');
            }

            const safeDeptName = (courseOfferingDept || 'department').toString().replace(/[^a-z0-9]/gi, '_').toLowerCase();
            res.status(200);
            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader('Content-Disposition', `attachment; filename="${safeDeptName}_department_report_batch_${batch}.pdf"`);
            res.setHeader('Content-Length', pdfBuffer.length);
            res.setHeader('Cache-Control', 'no-cache');
            res.setHeader('Accept-Ranges', 'none');
            res.end(pdfBuffer);
            return;
        }

        const workbook = await generateDepartmentReport({ 
            degree: '', 
            currentAY, 
            semester, 
            courseOfferingDept, 
            batch 
        }, groupedData);
        const buffer = await workbook.xlsx.writeBuffer();

        const safeDeptName = (courseOfferingDept || 'department').toString().replace(/[^a-z0-9]/gi, '_').toLowerCase();
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="${safeDeptName}_department_report_batch_${batch}.xlsx"`);
        res.send(buffer);
    } catch (error) {
        console.error('HoD: Error generating department report:', error);
        res.status(500).json({ error: error.message });
    }
});

// HoD-specific: Generate department negative comments Excel
router.post('/hod/generate-department-negative-comments-excel', async (req, res) => {
    try {
        const { department, currentAY, semester, courseOfferingDept, batch } = req.body || {};
        
        if (!department || !currentAY || !semester || !courseOfferingDept) {
            return res.status(400).json({ error: 'Missing required fields: department, currentAY, semester, courseOfferingDept' });
        }

        console.log(`\n=== HoD Generating Department Negative Comments Excel ===`);
        console.log(`Department: ${department}`);
        console.log(`Current AY: ${currentAY}`);
        console.log(`Semester: ${semester}`);
        console.log(`Course Offering Dept: ${courseOfferingDept}`);

        // Get all courses for this dept/AY/semester (no degree filter)
        const courses = await getDistinctCourseNamesByDepartment(courseOfferingDept, currentAY, semester);
        if (!courses || courses.length === 0) {
            return res.status(404).json({ error: 'No courses found for selected filters' });
        }

        console.log(`HoD: found ${courses.length} courses for dept: ${courseOfferingDept}, AY: ${currentAY}, semester: ${semester}`);

        const groupedData = [];
        
        for (const course of courses) {
            const code = course.code || course.course_code || course;
            const name = course.name || course.course_name || '';

            console.log(`\nHoD processing course: ${code}`);

            // Get faculty from course_feedback_new using new filter hierarchy WITHOUT degree
            const faculties = await getFacultyByCourse('', currentAY, semester, courseOfferingDept, code);

            if (!faculties || faculties.length === 0) {
                console.log(`HoD: no faculty found for course: ${code}`);
                continue;
            }

            console.log(`HoD: found ${faculties.length} faculty for course ${code}`);

            await Promise.all(
                faculties.map(async (f) => {
                    const staffId = f.staffid || f.staff_id || '';
                    if (!staffId) {
                        console.warn(`HoD: skipping faculty with no staffid: ${f.faculty_name}`);
                        return;
                    }
                    console.log(`HoD: getting comments for staffid: ${staffId}, course: ${code}`);

                    const comments = await getFacultyComments('', currentAY, semester, courseOfferingDept, code, staffId, batch === 'ALL' || batch === 'all' ? null : batch);

                    if (comments && comments.length > 0) {
                        groupedData.push({
                            course_code: code,
                            course_name: name || '',
                            faculty_name: f.faculty_name || '',
                            staffid: staffId,
                            staff_id: f.staff_id || '',
                            comments: comments
                        });
                        console.log(`HoD: ✓ found ${comments.length} comments for ${f.faculty_name} (staffid: ${staffId})`);
                    } else {
                        console.log(`HoD: no comments found for staffid: ${staffId}, course: ${code}`);
                    }
                })
            );
        }

        if (groupedData.length === 0) {
            return res.status(404).json({ error: 'No negative comments found for selected filters' });
        }

        console.log(`\n=== HoD Negative Comments Summary ===`);
        console.log(`Total faculty with comments: ${groupedData.length}`);

        const buffer = await generateDepartmentNegativeCommentsExcel(groupedData);
        const safeDeptName = (courseOfferingDept || 'department').toString().replace(/[^a-z0-9]/gi, '_').toLowerCase();
        const batchSuffix = batch && batch !== 'ALL' && batch !== 'all' ? `_batch_${batch}` : '_all_batches';
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="${safeDeptName}_negative_comments${batchSuffix}.xlsx"`);
        res.send(buffer);
    } catch (error) {
        console.error('HoD: Error generating negative comments Excel:', error);
        res.status(500).json({ error: error.message });
    }
});

// Generate department PDF with negative comments
router.post('/generate-department-negative-comments-pdf', async (req, res) => {
    try {
        const { degree, currentAY, semester, courseOfferingDept, batch, observations, titleSuffix } = req.body || {};
        
        // Using new filter hierarchy: degree, currentAY, semester, courseOfferingDept
        if (!degree || !currentAY || !semester || !courseOfferingDept) {
            return res.status(400).json({ error: 'Missing required fields: degree, currentAY, semester, courseOfferingDept' });
        }

        console.log(`\n=== Generating Department Negative Comments PDF ===`);
        console.log(`Degree: ${degree}`);
        console.log(`Current AY: ${currentAY}`);
        console.log(`Semester: ${semester}`);
        console.log(`Course Offering Dept: ${courseOfferingDept}`);

        // Get all courses from course_feedback_new using new filter hierarchy
        const courses = await getDistinctCourseNames(degree, currentAY, semester, courseOfferingDept);
        if (!courses || courses.length === 0) {
            return res.status(404).json({ error: 'No courses found for selected filters' });
        }

        console.log(`Found ${courses.length} courses for degree: ${degree}, currentAY: ${currentAY}, semester: ${semester}, courseOfferingDept: ${courseOfferingDept}`);

        // Aggregate negative comments per course per faculty
        const aggregatedRows = [];
        
        for (const course of courses) {
            const code = course.code ? course.code : course;
            const name = course.name || '';
            
            console.log(`\nProcessing course: ${code}`);
            
            // Get faculty from course_feedback_new using new filter hierarchy
            const faculties = await getFacultyByCourse(degree, currentAY, semester, courseOfferingDept, code);
            
            if (faculties.length === 0) {
                console.log(`No faculty found in course_feedback_new for course: ${code}`);
                continue;
            }

            console.log(`Found ${faculties.length} faculty members in course_feedback_new for course ${code}`);

            // Check each faculty for negative comments
            await Promise.all(
                faculties.map(async (f) => {
                    const staffId = f.staffid || f.staff_id || '';
                    if (!staffId) {
                        console.warn(`Skipping faculty with no staffid: ${f.faculty_name}`);
                        return;
                    }
                    
                    try {
                        console.log(`Checking negative comments for staffid: ${staffId} and course: ${code}`);
                        
                        // Get comments for this faculty using new filter hierarchy
                        const commentsResult = await getFacultyComments(degree, currentAY, semester, courseOfferingDept, code, staffId);
                        
                        if (!commentsResult.success || !commentsResult.comments || commentsResult.comments.length === 0) {
                            console.log(`No comments found for ${f.faculty_name} (staffid: ${staffId})`);
                            return;
                        }

                        // Analyze comments using FastAPI
                        const analysisResult = await fastapiService.analyzeComments(
                            commentsResult.comments,
                            {
                                faculty_name: commentsResult.faculty_name,
                                staff_id: commentsResult.staff_id,
                                course_code: commentsResult.course_code,
                                course_name: commentsResult.course_name
                            }
                        );

                        if (analysisResult.success && analysisResult.analysis) {
                            const negativeCommentsList = analysisResult.analysis.negative_comments_list || [];
                            
                            if (negativeCommentsList.length > 0) {
                                aggregatedRows.push({
                                    course: `${code || ''} - ${name || ''}`.trim(),
                                    faculty: f.faculty_name || commentsResult.faculty_name || '',
                                    comments: negativeCommentsList // Array of actual negative comments
                                });
                                console.log(`✓ Found ${negativeCommentsList.length} negative comments for ${f.faculty_name}`);
                            }
                        }
                    } catch (error) {
                        console.error(`Error processing negative comments for ${f.faculty_name}:`, error);
                    }
                })
            );
        }

        if (aggregatedRows.length === 0) {
            return res.status(404).json({ error: 'No faculty with negative comments found for selected filters' });
        }

        console.log(`\n=== Negative Comments PDF Summary ===`);
        console.log(`Total faculty with negative comments: ${aggregatedRows.length}`);

        // Generate PDF
        const pdfBuffer = await generateDepartmentNegativeCommentsPdf({
            department: courseOfferingDept,
            academicYear: currentAY || '',
            semester: semester || '',
            observations: Array.isArray(observations) ? observations : [],
            rows: aggregatedRows,
            titleSuffix: titleSuffix || `${degree}${batch && batch !== 'ALL' ? ` - Batch ${batch}` : ''}`
        });

        if (!pdfBuffer || pdfBuffer.length === 0) {
            throw new Error('Generated PDF buffer is empty');
        }

        const safeDeptName = (courseOfferingDept || 'department').toString().replace(/[^a-z0-9]/gi, '_').toLowerCase();
        res.status(200);
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="${safeDeptName}_negative_comments_report.pdf"`);
        res.setHeader('Content-Length', pdfBuffer.length);
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Accept-Ranges', 'none');
        res.end(pdfBuffer);
        
    } catch (error) {
        console.error('Error generating negative comments PDF:', error);
        res.status(500).json({ error: error.message });
    }
});

// Generate department Excel with negative comments
router.post('/generate-department-negative-comments-excel', async (req, res) => {
    try {
        const { degree, currentAY, semester, courseOfferingDept, batch } = req.body || {};
        
        // Using new filter hierarchy: degree, currentAY, semester, courseOfferingDept
        if (!degree || !currentAY || !semester || !courseOfferingDept) {
            return res.status(400).json({ error: 'Missing required fields: degree, currentAY, semester, courseOfferingDept' });
        }

        console.log(`\n=== Generating Department Negative Comments Excel ===`);
        console.log(`Degree: ${degree}`);
        console.log(`Current AY: ${currentAY}`);
        console.log(`Semester: ${semester}`);
        console.log(`Course Offering Dept: ${courseOfferingDept}`);

        // Get all courses from course_feedback_new using new filter hierarchy
        const courses = await getDistinctCourseNames(degree, currentAY, semester, courseOfferingDept);
        if (!courses || courses.length === 0) {
            return res.status(404).json({ error: 'No courses found for selected filters' });
        }

        console.log(`Found ${courses.length} courses for degree: ${degree}, currentAY: ${currentAY}, semester: ${semester}, courseOfferingDept: ${courseOfferingDept}`);

        // Build grouped data structure similar to regular Excel report
        const groupedData = [];
        
        for (const course of courses) {
            const code = course.code ? course.code : course;
            const name = course.name || '';
            
            console.log(`\nProcessing course: ${code}`);
            
            // Get faculty from course_feedback_new using new filter hierarchy
            const faculties = await getFacultyByCourse(degree, currentAY, semester, courseOfferingDept, code);
            
            if (faculties.length === 0) {
                console.log(`No faculty found in course_feedback_new for course: ${code}`);
                continue;
            }

            console.log(`Found ${faculties.length} faculty members in course_feedback_new for course ${code}`);

            const courseFaculties = [];
            
            // Process each faculty
            await Promise.all(
                faculties.map(async (f) => {
                    const staffId = f.staffid || f.staff_id || '';
                    if (!staffId) {
                        console.warn(`Skipping faculty with no staffid: ${f.faculty_name}`);
                        return;
                    }
                    
                    try {
                        // Get comments for this faculty first (we need this for negative comments)
                        // getFacultyComments signature: (degree, currentAY, semester, courseOfferingDept, courseCode, staffId, cgpa)
                        const commentsResult = await getFacultyComments(degree, currentAY, semester, courseOfferingDept, code, staffId);
                        
                        if (!commentsResult.success) {
                            console.log(`Failed to get comments for ${f.faculty_name} (staffid: ${staffId}): ${commentsResult.message || 'Unknown error'}`);
                            return;
                        }
                        
                        let negativeComments = [];
                        if (commentsResult.comments && commentsResult.comments.length > 0) {
                            console.log(`Found ${commentsResult.comments.length} comments for ${f.faculty_name}, analyzing...`);
                            
                            // Analyze comments using FastAPI
                            const sentimentResult = await fastapiService.analyzeComments(
                                commentsResult.comments,
                                {
                                    faculty_name: commentsResult.faculty_name || f.faculty_name,
                                    staff_id: commentsResult.staff_id || staffId,
                                    course_code: commentsResult.course_code || code,
                                    course_name: commentsResult.course_name || name
                                }
                            );

                            if (sentimentResult.success && sentimentResult.analysis) {
                                negativeComments = sentimentResult.analysis.negative_comments_list || [];
                                console.log(`FastAPI analysis result: ${negativeComments.length} negative comments found`);
                            } else {
                                console.log(`FastAPI analysis failed for ${f.faculty_name}: ${sentimentResult.message || 'Unknown error'}`);
                            }
                        } else {
                            console.log(`No comments found for ${f.faculty_name} (staffid: ${staffId})`);
                        }

                        // Only include faculty with negative comments
                        if (negativeComments.length === 0) {
                            console.log(`Skipping ${f.faculty_name} - no negative comments`);
                            return;
                        }

                        // Get analysis data, batches, and degrees for this faculty (for scores, CGPA, etc.)
                        // Note: getFeedbackAnalysis signature is (degree, currentAY, semester, courseOfferingDept, courseCode, staffId, department, batch)
                        const [analysisResult, batches, degrees] = await Promise.all([
                            getFeedbackAnalysis(degree || '', currentAY || '', semester || '', courseOfferingDept || '', code, staffId),
                            getBatchesForFacultyCourse(code, staffId),
                            getDegreesForFacultyCourse(code, staffId)
                        ]);
                        
                        // Add faculty data with analysis and negative comments
                        // Include even if analysis fails, as long as we have negative comments
                        courseFaculties.push({
                            faculty_name: f.faculty_name || commentsResult?.faculty_name || '',
                            staffid: staffId,
                            staff_id: staffId,
                            batches: batches,
                            degrees: degrees,
                            analysisData: analysisResult.success ? {
                                ...analysisResult,
                                unique_batches: batches,
                                unique_degrees: degrees
                            } : null, // Can be null if no analysis
                            negativeComments: negativeComments
                        });
                        
                        console.log(`✓ Processed ${f.faculty_name} - ${negativeComments.length} negative comments${analysisResult.success ? ' (with analysis data)' : ' (no analysis data)'}`);
                    } catch (error) {
                        console.error(`Error processing ${f.faculty_name}:`, error);
                    }
                })
            );

            if (courseFaculties.length > 0) {
                groupedData.push({
                    course_code: code,
                    course_name: name,
                    faculties: courseFaculties
                });
            }
        }

        if (groupedData.length === 0) {
            console.log('\n=== No Data Found - Debug Info ===');
            console.log(`Courses found: ${courses.length}`);
            console.log(`Total faculty checked: ${courses.reduce((sum, c) => {
                // This is approximate since we process in parallel
                return sum;
            }, 0)}`);
            return res.status(404).json({ 
                error: 'No faculty with negative comments found for selected filters',
                debug: {
                    courses_found: courses.length,
                    courses_checked: courses.map(c => c.code || c).join(', ')
                }
            });
        }

        console.log(`\n=== Negative Comments Excel Summary ===`);
        console.log(`Total courses: ${groupedData.length}`);
        const totalFaculty = groupedData.reduce((sum, c) => sum + c.faculties.length, 0);
        console.log(`Total faculty: ${totalFaculty}`);

        // Generate Excel
        const workbook = await generateDepartmentNegativeCommentsExcel(
            {
                degree: degree || '',
                currentAY: currentAY || '',
                semester: semester || '',
                courseOfferingDept: courseOfferingDept || '',
                batch: batch || 'ALL'
            },
            groupedData
        );

        // Convert workbook to buffer
        const buffer = await workbook.xlsx.writeBuffer();

        if (!buffer || buffer.length === 0) {
            throw new Error('Generated Excel buffer is empty');
        }

        const safeDeptName = (courseOfferingDept || 'department').toString().replace(/[^a-z0-9]/gi, '_').toLowerCase();
        res.status(200);
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="${safeDeptName}_negative_comments_report.xlsx"`);
        res.setHeader('Content-Length', buffer.length);
        res.setHeader('Cache-Control', 'no-cache');
        res.end(buffer);
        
    } catch (error) {
        console.error('Error generating negative comments Excel:', error);
        res.status(500).json({ error: error.message });
    }
});