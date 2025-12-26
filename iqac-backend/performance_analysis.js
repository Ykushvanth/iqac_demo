

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

// Helper function to clean and validate string values
function cleanString(value) {
    if (!value) return null;
    const cleaned = value.toString().trim();
    if (cleaned === '' || cleaned.toUpperCase() === 'NULL') return null;
    return cleaned;
}

function normalizeFilterValue(value) {
    if (value === undefined || value === null) {
        return null;
    }
    const cleaned = value.toString().trim();
    if (!cleaned) {
        return null;
    }
    const upper = cleaned.toUpperCase();
    if (
        upper === 'ALL' ||
        upper === 'ALL BATCHES' ||
        upper === 'ALL COURSES' ||
        upper === 'ALL DEPARTMENTS' ||
        upper === 'ALL DEPTS' ||
        upper === 'ALL FACULTY' ||
        upper === 'SELECT BATCH' ||
        upper === 'SELECT DEGREE' ||
        upper === 'SELECT DEPARTMENT' ||
        upper === 'SELECT COURSE' ||
        upper === 'NA'
    ) {
        return null;
    }
    return cleaned;
}

// Generic pagination fetcher
async function fetchAllRows(queryBuilder, chunkSize = 1000) {
    let from = 0;
    let allData = [];
    let moreData = true;

    while (moreData) {
        const { data, error } = await queryBuilder.range(from, from + chunkSize - 1);
        if (error) {
            console.error('Error fetching rows:', error);
            throw error;
        }

        if (!data || data.length === 0) {
            moreData = false;
        } else {
            allData = allData.concat(data);
            from += chunkSize;
        }
    }
    return allData;
}

// Get feedback data based on filters - matches course_code and staffId for faculty-specific analysis
// Updated to use new filter hierarchy: degree, currentAY, semester, courseOfferingDept, courseCode, staffId
const getFeedbackAnalysis = async (degree, currentAY, semester, courseOfferingDept, courseCode, staffId, department = null, batch = null) => {
    try {
        console.log(`\n=== Fetching Feedback Analysis for Selected Faculty ===`);
        console.log(`Degree: ${degree || 'N/A'}`);
        console.log(`Current AY: ${currentAY || 'N/A'}`);
        console.log(`Semester: ${semester || 'N/A'}`);
        console.log(`Course Offering Dept: ${courseOfferingDept || 'N/A'}`);
        console.log(`Department: ${department || 'N/A'}`);
        console.log(`Batch: ${batch || 'N/A'}`);
        console.log(`Course Code: ${courseCode}`);
        console.log(`Staff ID: ${staffId || 'N/A'}`);

        // Primary match: course_code (from course_feedback_new)
        // StaffId is REQUIRED for faculty-specific analysis
        if (!staffId || staffId.trim() === '') {
            return { 
                success: false, 
                message: 'Staff ID is required for faculty-specific feedback analysis' 
            };
        }

        const cleanedCourseCode = courseCode.trim();
        const trimmedStaffId = staffId.trim();
        const cleanedDegree = null; // degree is not enforced in filters to avoid mismatches
        const cleanedDept = normalizeFilterValue(department);
        const cleanedBatch = normalizeFilterValue(batch);
        const cleanedCurrentAY = normalizeFilterValue(currentAY);
        const cleanedSemester = normalizeFilterValue(semester);
        const cleanedCourseOfferingDept = normalizeFilterValue(courseOfferingDept);

        // Build query - match primarily by exact course_code and filters;
        // we will apply staffId filtering in-memory using trimmed values (to tolerate spaces)
        let query = supabase
            .from('course_feedback_new')
            .select(`
                *,
                qn1,
                faculty_name,
                staff_id,
                staffid,
                course_code,
                course_name,
                degree,
                current_ay,
                semester,
                course_offering_dept_name,
                batch
            `)
            .eq('course_code', cleanedCourseCode)
            .not('course_code', 'is', null)
            .not('faculty_name', 'is', null);

        // Apply new filter hierarchy (degree is intentionally NOT enforced)
        if (cleanedCurrentAY) {
            query = query.eq('current_ay', cleanedCurrentAY);
        }
        if (cleanedSemester) {
            query = query.eq('semester', cleanedSemester);
        }
        if (cleanedCourseOfferingDept) {
            query = query.eq('course_offering_dept_name', cleanedCourseOfferingDept);
        }
            
        console.log('Querying feedback data with filters:', {
            degree: degree || 'all',
            currentAY: cleanedCurrentAY || 'all',
            semester: cleanedSemester || 'all',
            courseOfferingDept: cleanedCourseOfferingDept || 'all',
            batch: batch || 'all',
            courseCode: cleanedCourseCode,
            staffId: trimmedStaffId
        });

        const allData = await fetchAllRows(query);
        console.log(`Raw data fetched from course_feedback_new (by course_code + filters, before staffId filter): ${allData.length} rows`);

        if (allData.length === 0) {
            return { 
                success: false, 
                message: 'No feedback data found in course_feedback_new table' 
            };
        }

        // Apply staffId filter in-memory using trimmed values (tolerates extra spaces)
        const feedbackData = allData.filter(item => {
            const itemCourseCode = cleanString(item.course_code);
            if (itemCourseCode !== cleanedCourseCode) return false;
            const itemStaffId = cleanString(item.staff_id);
            const itemStaffid = cleanString(item.staffid);
            return (itemStaffId === trimmedStaffId || itemStaffid === trimmedStaffId);
        });

        console.log(`Filtered feedback data after course_code and staffId match: ${feedbackData.length} rows`);
        
        if (!feedbackData || feedbackData.length === 0) {
            console.log('⚠️ No feedback data found after filtering by course_code and staffId');
            console.log('Debug - Sample course codes in database:');
            const sampleCodes = allData.slice(0, 5).map(item => ({
                course_code: item.course_code,
                staff_id: item.staff_id,
                staffid: item.staffid,
                trimmed_course_code: cleanString(item.course_code),
                searching_for: {
                    course_code: cleanedCourseCode,
                    staff_id: trimmedStaffId
                }
            }));
            console.log(sampleCodes);
            return { 
                success: false, 
                message: `No student feedback found for course ${cleanedCourseCode} and staff ID ${trimmedStaffId}` 
            };
        }

        console.log(`✓ Found ${feedbackData.length} student responses for this faculty and course`);

        // Get all questions with their column names
        const { data: questions, error: questionsError } = await supabase
            .from('questions')
            .select('*');

        if (questionsError) throw questionsError;

        // Get all question options
        const { data: options, error: optionsError } = await supabase
            .from('question_options')
            .select('*');

        if (optionsError) throw optionsError;

        // Group questions by section type
        const questionsBySection = questions.reduce((acc, question) => {
            if (!acc[question.section_type]) {
                acc[question.section_type] = [];
            }
            acc[question.section_type].push(question);
            return acc;
        }, {});

        // Map options by question ID
        const optionsByQuestionId = options.reduce((acc, option) => {
            if (!acc[option.question_id]) {
                acc[option.question_id] = [];
            }
            acc[option.question_id].push(option);
            return acc;
        }, {});

        // Create a mapping between option labels (A, B, C) and feedback values (1, 2, 3)
        const optionValueMap = {};
        options.forEach(option => {
            const questionId = option.question_id;
            const label = option.option_label;
            
            if (!optionValueMap[questionId]) {
                optionValueMap[questionId] = {};
            }
            
            // Map A->1, B->2, etc. (assuming this is the mapping)
            const value = label.charCodeAt(0) - 64; // A=1, B=2, etc.
            optionValueMap[questionId][value] = {
                label: option.option_label,
                text: option.option_text
            };
        });

        // Analyze the feedback data
        const analysisResults = {};
        
        // Process each section
        Object.keys(questionsBySection).forEach(sectionType => {
            const sectionQuestions = questionsBySection[sectionType];
            const sectionResults = {};
            
            // Process each question in the section
            sectionQuestions.forEach(question => {
                const columnName = question.column_name;
                const questionId = question.id;
                
                // Skip if column doesn't exist in feedback data
                if (!feedbackData[0].hasOwnProperty(columnName)) {
                    return;
                }
                
                // Count responses for each option
                const responses = { '1': 0, '2': 0, '3': 0 }; // Initialize all options
                let totalResponses = 0;
                
                feedbackData.forEach(feedback => {
                    const value = feedback[columnName];
                    if (value !== null && value !== undefined) {
                        const strValue = String(value).trim();
                        if (responses[strValue] !== undefined) {
                            responses[strValue]++;
                            totalResponses++;
                        }
                    }
                });                // Calculate question score using weighted system (0-1-2)
                const optionResults = [];
                let weightedSum = 0;
                const maxPossibleScore = totalResponses * 2; // Maximum 2 points per response
                
                // Calculate weighted sum using all options
                weightedSum += responses['1'] * 0;  // Option 1 = 0 points
                weightedSum += responses['2'] * 1;  // Option 2 = 1 point
                weightedSum += responses['3'] * 2;  // Option 3 = 2 points
                
                // Calculate overall question score
                const questionScore = maxPossibleScore > 0 ? (weightedSum / maxPossibleScore) * 100 : 0;
                
                // Process each option
                ['1', '2', '3'].forEach(value => {
                    const count = responses[value];
                    const percentage = totalResponses > 0 ? (count / totalResponses) * 100 : 0;
                    
                    // Get option text if available
                    let optionText = 'Unknown';
                    let optionLabel = 'Unknown';
                    
                    if (optionValueMap[questionId] && optionValueMap[questionId][value]) {
                        optionLabel = optionValueMap[questionId][value].label;
                        optionText = optionValueMap[questionId][value].text;
                    }
                    
                    optionResults.push({
                        value: parseInt(value),
                        label: optionLabel,
                        text: optionText,
                        count,
                        percentage: parseFloat(percentage.toFixed(2))
                    });
                });
                
                // Sort by value
                optionResults.sort((a, b) => a.value - b.value);
                
                sectionResults[questionId] = {
                    question: question.question,
                    column_name: columnName,
                    total_responses: totalResponses,
                    options: optionResults,
                    score: Math.round(questionScore), // Question score using 0-1-2 system
                    raw: {
                        weightedSum: weightedSum,
                        maxPossible: maxPossibleScore
                    }
                };
            });
            
            // Calculate section score as average of question scores
            const questionScores = Object.values(sectionResults).map(q => q.score || 0);
            const sectionScore = questionScores.length > 0 
                ? Math.round(questionScores.reduce((a, b) => a + b, 0) / questionScores.length) 
                : 0;

            analysisResults[sectionType] = {
                section_name: sectionType,
                questions: sectionResults,
                section_score: sectionScore
            };
        });

        // Compute CGPA-wise summary and per-CGPA analysis
        // qn1 values: 1 => Below 6.0, 2 => 6.1 - 8.0, 3 => Above 8.0
        const cgpaLabels = {
            '1': 'Below 6.0',
            '2': '6.1 - 8.0',
            '3': 'Above 8.0'
        };

        // Initialize CGPA counters
        const cgpaCounts = { '1': 0, '2': 0, '3': 0, unknown: 0 };
        
        // Log the total number of feedback entries
        console.log(`Processing CGPA data for ${feedbackData.length} feedback entries`);
        
        // Sample the first few rows to debug qn1 values
        console.log('First 5 feedback rows qn1 values:', feedbackData.slice(0, 5).map(row => ({
            qn1: row.qn1,
            qn1_type: typeof row.qn1,
            raw_value: row.qn1 !== undefined ? row.qn1 : (row['qn1'] !== undefined ? row['qn1'] : null)
        })));
        
        feedbackData.forEach((row, idx) => {
            // Get qn1 value (CGPA indicator)
            const raw = row.qn1 !== undefined ? row.qn1 : (row['qn1'] !== undefined ? row['qn1'] : null);
            
            // Convert to proper format and validate
            if (raw === null || raw === undefined || raw === '') {
                cgpaCounts.unknown++;
            } else {
                // Convert to string and clean
                const k = String(raw).trim();
                // Validate and count
                if (['1', '2', '3'].includes(k)) {
                    cgpaCounts[k]++;
                    console.log(`Valid CGPA value found: ${k} (Row ${idx + 1})`);
                } else {
                    cgpaCounts.unknown++;
                    console.log(`Invalid CGPA value: ${k} (Row ${idx + 1})`);
                }
            }
        });
        
        // Log final CGPA counts
        console.log('Final CGPA Distribution:', cgpaCounts);

        const totalCgpaKnown = cgpaCounts['1'] + cgpaCounts['2'] + cgpaCounts['3'];
        const cgpaPercentages = {
            '1': totalCgpaKnown > 0 ? Math.round((cgpaCounts['1'] / totalCgpaKnown) * 100) : 0,
            '2': totalCgpaKnown > 0 ? Math.round((cgpaCounts['2'] / totalCgpaKnown) * 100) : 0,
            '3': totalCgpaKnown > 0 ? Math.round((cgpaCounts['3'] / totalCgpaKnown) * 100) : 0,
        };

        // Helper to build analysis for a subset of feedback rows
        const buildAnalysisForFeedback = (subsetFeedback) => {
            const subsetResults = {};

            Object.keys(questionsBySection).forEach(sectionType => {
                const sectionQuestions = questionsBySection[sectionType];
                const sectionRes = {};

                sectionQuestions.forEach(question => {
                    const columnName = question.column_name;
                    const questionId = question.id;

                    // Skip if column doesn't exist
                    if (!subsetFeedback[0] || !subsetFeedback[0].hasOwnProperty(columnName)) {
                        // If the first row doesn't have the column, try to find any that does
                        const exists = subsetFeedback.some(r => r && r.hasOwnProperty(columnName));
                        if (!exists) return;
                    }

                    const responses = {};
                    let totalResponses = 0;

                    subsetFeedback.forEach(fb => {
                        const value = fb[columnName];
                        if (value !== null && value !== undefined) {
                            if (!responses[value]) responses[value] = 0;
                            responses[value]++;
                            totalResponses++;
                        }
                    });

                    const optionResults = [];
                    Object.keys(responses).forEach(value => {
                        const numValue = parseInt(value);
                        const count = responses[value];
                        const percentage = totalResponses > 0 ? (count / totalResponses) * 100 : 0;

                        let optionText = 'Unknown';
                        let optionLabel = 'Unknown';
                        if (optionValueMap[questionId] && optionValueMap[questionId][numValue]) {
                            optionLabel = optionValueMap[questionId][numValue].label;
                            optionText = optionValueMap[questionId][numValue].text;
                        }

                        optionResults.push({
                            value: numValue,
                            label: optionLabel,
                            text: optionText,
                            count,
                            percentage: parseFloat(percentage.toFixed(2))
                        });
                    });

                    optionResults.sort((a, b) => a.value - b.value);

                    sectionRes[questionId] = {
                        question: question.question,
                        column_name: columnName,
                        total_responses: totalResponses,
                        options: optionResults
                    };
                });

                subsetResults[sectionType] = {
                    section_name: sectionType,
                    questions: sectionRes
                };
            });

            return subsetResults;
        };

        // Build per-CGPA analysis
        const cgpaAnalysis = {};
        ['1', '2', '3'].forEach(key => {
            const subset = feedbackData.filter(r => {
                const raw = r.qn1 !== undefined ? r.qn1 : (r['qn1'] !== undefined ? r['qn1'] : null);
                return raw !== null && raw !== undefined && String(raw).trim() === key;
            });
            cgpaAnalysis[key] = {
                total_responses: subset.length,
                analysis: buildAnalysisForFeedback(subset)
            };
        });
        
        // Get comments for this faculty using new filter hierarchy
        console.log(`Fetching comments...`);
        const commentsResult = await getFacultyComments(degree, currentAY, semester, courseOfferingDept, courseCode, staffId);
        console.log(`✓ Comments fetched: ${commentsResult.success ? commentsResult.total_comments : 0}`);
        
        console.log(`✓ Analysis complete: ${feedbackData.length} responses analyzed`);
        
        return {
            success: true,
            course_code: courseCode,
            course_name: feedbackData[0].course_name || '',
            faculty_name: feedbackData[0].faculty_name || '',
            staff_id: feedbackData[0].staff_id || feedbackData[0].staffid || '',
            ug_or_pg: feedbackData[0].ug_or_pg || '',
            arts_or_engg: feedbackData[0].arts_or_engg || '',
            short_form: feedbackData[0].short_form || '',
            sec: feedbackData[0].sec || '',
            course_offering_dept_name: feedbackData[0].course_offering_dept_name || courseOfferingDept || '',
            // Include new filter information for comments loading
            degree: degree,
            currentAY: currentAY,
            semester: semester,
            courseOfferingDept: courseOfferingDept,
            course: courseCode,
            total_responses: feedbackData.length,
            analysis: analysisResults,
            cgpa_summary: {
                counts: {
                    '1': cgpaCounts['1'],
                    '2': cgpaCounts['2'],
                    '3': cgpaCounts['3'],
                    unknown: cgpaCounts.unknown
                },
                percentages: cgpaPercentages,
                labels: {
                    '1': cgpaLabels['1'],
                    '2': cgpaLabels['2'],
                    '3': cgpaLabels['3']
                }
            },
            cgpa_analysis: cgpaAnalysis,
            comments: commentsResult.success ? {
                total_comments: commentsResult.total_comments,
                has_comments: commentsResult.total_comments > 0,
                comments_available: true
            } : {
                total_comments: 0,
                has_comments: false,
                comments_available: false,
                error: commentsResult.message
            }
        };
    } catch (error) {
        console.error('❌ Error in getFeedbackAnalysis:', error);
        return { success: false, message: error.message };
    }
};

// Updated to use new filter hierarchy: degree, currentAY, semester, courseOfferingDept, courseCode, staffId, cgpa
const getFacultyComments = async (degree, currentAY, semester, courseOfferingDept, courseCode, staffId, cgpa) => {
    try {
        console.log(`Fetching comments for: ${degree}, ${currentAY}, ${semester}, ${courseOfferingDept}, ${courseCode}, ${staffId || 'N/A'}`);
        
        // Primary match: course_code from course_feedback_new
        // Filter by course_code and staffId, with new filter hierarchy
        const cleanedCourseCode = courseCode.trim();
        const trimmedStaffId = staffId && staffId.trim() !== '' ? staffId.trim() : null;
        const cleanedDegree = null; // degree is not enforced in filters to avoid mismatches
        const cleanedCurrentAY = normalizeFilterValue(currentAY);
        const cleanedSemester = normalizeFilterValue(semester);
        const cleanedCourseOfferingDept = normalizeFilterValue(courseOfferingDept);
        const cleanedCgpa = normalizeFilterValue(cgpa);
        
        // Staff ID is REQUIRED for faculty-specific analysis
        if (!trimmedStaffId) {
            return { 
                success: false, 
                message: 'Staff ID is required for faculty-specific comments analysis' 
            };
        }

        // Build query - PRIMARY FILTERS: course_code and staff_id/staffid ONLY (DB-side)
        // Do NOT filter by batch - get ALL comments for this course_code and staffId across all batches
        console.log(`\n=== Querying course_feedback_new with PRIMARY filters ===`);
        console.log(`Course Code: ${cleanedCourseCode}`);
        console.log(`Staff ID: ${trimmedStaffId}`);
        console.log(`Batch: NOT FILTERED (fetching from ALL batches)`);
        
        // Since Supabase doesn't support OR conditions easily for staff_id OR staffid,
        // we'll fetch matching course_code first, then filter by staffId in memory
        // This ensures we get all comments for this course_code and staffId combination across ALL batches
        let query = supabase
            .from('course_feedback_new')
            .select('comment, faculty_name, staff_id, staffid, course_code, course_name, qn1, degree, current_ay, semester, course_offering_dept_name, batch')
            .like('course_code', `${cleanedCourseCode}%`)
            .or(`staff_id.eq.${trimmedStaffId},staffid.eq.${trimmedStaffId}`)
            .not('comment', 'is', null);

        // Apply new filter hierarchy (degree is intentionally NOT enforced)
        if (cleanedCurrentAY) {
            query = query.eq('current_ay', cleanedCurrentAY);
            console.log(`Additional filter: current_ay = ${cleanedCurrentAY}`);
        }
        if (cleanedSemester) {
            query = query.eq('semester', cleanedSemester);
            console.log(`Additional filter: semester = ${cleanedSemester}`);
        }
        if (cleanedCourseOfferingDept) {
            query = query.eq('course_offering_dept_name', cleanedCourseOfferingDept);
            console.log(`Additional filter: course_offering_dept_name = ${cleanedCourseOfferingDept}`);
        }
        
        // NOTE: Batch is NOT filtered - we want comments from ALL batches for this faculty/course
        
        // Fetch all data matching the base filters
        const allData = await fetchAllRows(query);
        console.log(`Raw data fetched from course_feedback_new: ${allData.length} rows`);
        
        if (allData.length === 0) {
            return { 
                success: false, 
                message: 'No feedback data found in course_feedback_new table'
            };
        }

        // Data is already DB-filtered; apply optional CGPA filter only
        console.log(`\n=== Applying optional CGPA filter (if any) ===`);
        const commentsData = allData.filter(item => {
            if (cleanedCgpa && cleanedCgpa.toLowerCase() !== 'all') {
                const itemCgpa = item.qn1 !== undefined ? item.qn1 : (item['qn1'] !== undefined ? item['qn1'] : null);
                if (itemCgpa === null || itemCgpa === undefined) return false;
                if (String(itemCgpa).trim() !== cleanedCgpa) return false;
            }
            return true;
        });
        
        console.log(`✓ Filtered comments by course_code (${cleanedCourseCode}) + staffId (${trimmedStaffId}): ${commentsData.length} rows`);
        
        // Log sample of matched records for verification
        if (commentsData.length > 0) {
            console.log('Sample matched records:');
            commentsData.slice(0, 3).forEach((item, idx) => {
                console.log(`  ${idx + 1}. Course: ${item.course_code}, StaffId: ${item.staff_id || item.staffid}, Comment: ${item.comment?.substring(0, 50)}...`);
            });
        }
        
        if (!commentsData || commentsData.length === 0) {
            console.log('No comments found after filtering by course_code and staffId');
            return { 
                success: false, 
                message: 'No comments found for the selected faculty and course'
            };
        }
        
        // Extract and validate comments - ensure we get all comments for this faculty and course
        const validComments = commentsData
            .map(item => {
                const comment = item.comment?.trim();
                return comment;
            })
            .filter(comment => {
                // Filter out empty, null, or single-word comments
                return comment && 
                       comment.length > 0 && 
                       comment !== '' && 
                       comment.split(/\s+/).length > 1;
            });
        
        console.log(`Valid comments extracted: ${validComments.length} out of ${commentsData.length} total comments`);
        
        // Log sample comments for debugging
        if (validComments.length > 0) {
            console.log(`Sample comments (first 3):`, validComments.slice(0, 3));
        } else {
            console.warn('⚠️ No valid comments found after filtering');
            console.log('Sample raw comments:', commentsData.slice(0, 3).map(item => ({
                comment: item.comment,
                length: item.comment?.length,
                wordCount: item.comment?.split(/\s+/).length
            })));
        }
        
        // Get faculty info from first matching record
        const facultyInfo = commentsData[0] || {};
        
        return {
            success: true,
            faculty_name: facultyInfo.faculty_name || '',
            staff_id: facultyInfo.staff_id || facultyInfo.staffid || '',
            course_code: facultyInfo.course_code || cleanedCourseCode,
            course_name: facultyInfo.course_name || '',
            total_comments: validComments.length,
            comments: validComments,
            debug: {
                total_rows: commentsData.length,
                valid_comments_count: validComments.length,
                course_code: cleanedCourseCode,
                staff_id: trimmedStaffId
            }
        };
    } catch (error) {
        console.error('Error in getFacultyComments:', error);
        return { success: false, message: error.message };
    }
};

module.exports = {
    getFeedbackAnalysis,
    getFacultyComments
};