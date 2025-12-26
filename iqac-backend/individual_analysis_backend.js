const { createClient } = require('@supabase/supabase-js');
const ExcelJS = require('exceljs');
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

// Get all unique staff IDs with faculty names
const getAllFaculty = async () => {
    try {
        console.log('Fetching all faculty from course_feedback_new...');
        
        const allData = await fetchAllRows(
            supabase
                .from('course_feedback_new')
                .select('staff_id, staffid, faculty_name')
                .not('faculty_name', 'is', null)
        );

        // Create a map to store unique faculty
        const facultyMap = new Map();

        allData.forEach(item => {
            const staffId = cleanString(item.staff_id) || cleanString(item.staffid);
            const facultyName = cleanString(item.faculty_name);

            if (staffId && facultyName) {
                // Use staff_id as key, store both staff_id and staffid if different
                if (!facultyMap.has(staffId)) {
                    facultyMap.set(staffId, {
                        staff_id: staffId,
                        staffid: cleanString(item.staffid) || staffId,
                        faculty_name: facultyName
                    });
                }
            }
        });

        const uniqueFaculty = Array.from(facultyMap.values())
            .sort((a, b) => a.faculty_name.localeCompare(b.faculty_name));

        console.log(`Found ${uniqueFaculty.length} unique faculty members`);
        return {
            success: true,
            faculty: uniqueFaculty
        };
    } catch (error) {
        console.error('Error in getAllFaculty:', error);
        return {
            success: false,
            message: error.message,
            faculty: []
        };
    }
};

// Get faculty filtered by department (for HoD)
const getFacultyByDepartment = async (department) => {
    try {
        console.log(`Fetching faculty for department: ${department}`);
        
        if (!department) {
            return getAllFaculty();
        }

        // Get unique faculty from course_feedback_new filtered by course_offering_dept_name
        const allData = await fetchAllRows(
            supabase
                .from('course_feedback_new')
                .select('staff_id, staffid, faculty_name, course_offering_dept_name')
                .eq('course_offering_dept_name', department)
                .not('faculty_name', 'is', null)
        );

        // Create a map to store unique faculty
        const facultyMap = new Map();

        allData.forEach(item => {
            const staffId = cleanString(item.staff_id) || cleanString(item.staffid);
            const facultyName = cleanString(item.faculty_name);

            if (staffId && facultyName) {
                if (!facultyMap.has(staffId)) {
                    facultyMap.set(staffId, {
                        staff_id: staffId,
                        staffid: cleanString(item.staffid) || staffId,
                        faculty_name: facultyName
                    });
                }
            }
        });

        const uniqueFaculty = Array.from(facultyMap.values())
            .sort((a, b) => a.faculty_name.localeCompare(b.faculty_name));

        console.log(`Found ${uniqueFaculty.length} unique faculty members for department: ${department}`);
        return {
            success: true,
            faculty: uniqueFaculty
        };
    } catch (error) {
        console.error('Error in getFacultyByDepartment:', error);
        return {
            success: false,
            message: error.message,
            faculty: []
        };
    }
};

// Get faculty filtered by school (for Dean)
const getFacultyBySchool = async (school) => {
    try {
        console.log(`Fetching faculty for school: ${school}`);
        
        if (!school) {
            return getAllFaculty();
        }

        // First, get all departments for this school from profiles table
        const { getDepartmentsBySchool } = require('./school_wise_report');
        const departments = await getDepartmentsBySchool(school);
        
        if (!departments || departments.length === 0) {
            console.log(`No departments found for school: ${school}`);
            return {
                success: true,
                faculty: []
            };
        }

        console.log(`Found ${departments.length} departments for school ${school}:`, departments);

        // Get unique faculty from course_feedback_new filtered by course_offering_dept_name matching any department in the school
        const allData = await fetchAllRows(
            supabase
                .from('course_feedback_new')
                .select('staff_id, staffid, faculty_name, course_offering_dept_name')
                .in('course_offering_dept_name', departments)
                .not('faculty_name', 'is', null)
        );

        // Create a map to store unique faculty
        const facultyMap = new Map();

        allData.forEach(item => {
            const staffId = cleanString(item.staff_id) || cleanString(item.staffid);
            const facultyName = cleanString(item.faculty_name);

            if (staffId && facultyName) {
                if (!facultyMap.has(staffId)) {
                    facultyMap.set(staffId, {
                        staff_id: staffId,
                        staffid: cleanString(item.staffid) || staffId,
                        faculty_name: facultyName
                    });
                }
            }
        });

        const uniqueFaculty = Array.from(facultyMap.values())
            .sort((a, b) => a.faculty_name.localeCompare(b.faculty_name));

        console.log(`Found ${uniqueFaculty.length} unique faculty members for school: ${school}`);
        return {
            success: true,
            faculty: uniqueFaculty
        };
    } catch (error) {
        console.error('Error in getFacultyBySchool:', error);
        return {
            success: false,
            message: error.message,
            faculty: []
        };
    }
};

// Get complete feedback history for a faculty member by staff_id
const getFacultyCompleteHistory = async (staffId) => {
    try {
        if (!staffId || staffId.trim() === '') {
            return {
                success: false,
                message: 'Staff ID is required'
            };
        }

        const trimmedStaffId = staffId.trim();
        console.log(`\n=== Fetching Complete Feedback History for Staff ID: ${trimmedStaffId} ===`);

        // Fetch all feedback records for this faculty member
        let query = supabase
            .from('course_feedback_new')
            .select('*')
            .or(`staff_id.eq.${trimmedStaffId},staffid.eq.${trimmedStaffId}`);

        const allData = await fetchAllRows(query);
        console.log(`Fetched ${allData.length} feedback records for staff ID: ${trimmedStaffId}`);

        if (allData.length === 0) {
            return {
                success: false,
                message: 'No feedback data found for this faculty member'
            };
        }

        // Get faculty name from first record
        const facultyName = cleanString(allData[0].faculty_name) || 'Unknown';

        // Group data by academic year, semester, and course
        const groupedData = {};
        const questionColumns = [];

        // Identify question columns (qn1 to qn35)
        for (let i = 1; i <= 35; i++) {
            questionColumns.push(`qn${i}`);
        }

        console.log('Sample record fields:', allData.length > 0 ? Object.keys(allData[0]) : 'No data');

        allData.forEach(record => {
            const currentAY = cleanString(record.current_ay) || 'N/A';
            const semester = cleanString(record.semester) || 'N/A';
            const courseCode = cleanString(record.course_code) || 'N/A';
            const courseName = cleanString(record.course_name) || 'N/A';
            const degree = cleanString(record.degree) || 'N/A';
            const dept = cleanString(record.course_offering_dept_name) || cleanString(record.dept) || 'N/A';
            const batch = cleanString(record.batch) || 'N/A';

            const key = `${currentAY}_${semester}_${courseCode}`;

            if (!groupedData[key]) {
                groupedData[key] = {
                    current_ay: currentAY,
                    semester: semester,
                    course_code: courseCode,
                    course_name: courseName,
                    degree: degree,
                    dept: dept,
                    batch: batch,
                    faculty_name: facultyName,
                    staff_id: trimmedStaffId,
                    total_responses: 0,
                    question_scores: {},
                    question_totals: {},
                    comments: []
                };
            }

            // Count responses
            groupedData[key].total_responses++;

            // Aggregate question scores using weighted system (1=0, 2=1, 3=2 points)
            questionColumns.forEach(qn => {
                const score = record[qn];
                if (score !== null && score !== undefined && !isNaN(score)) {
                    if (!groupedData[key].question_scores[qn]) {
                        groupedData[key].question_scores[qn] = 0; // weighted sum
                        groupedData[key].question_totals[qn] = 0; // total responses
                    }
                    // Convert to weighted points: 1 -> 0, 2 -> 1, 3 -> 2
                    const weightedValue = score === 1 ? 0 : score === 2 ? 1 : score === 3 ? 2 : 0;
                    groupedData[key].question_scores[qn] += weightedValue;
                    groupedData[key].question_totals[qn]++;
                }
            });

            // Collect comments
            const comment = cleanString(record.comment);
            if (comment) {
                groupedData[key].comments.push(comment);
            }
        });

        // Calculate averages for each group using weighted scoring system (0-100 scale)
        const historyData = Object.values(groupedData).map(group => {
            const averages = {};
            let totalAverage = 0;
            let questionCount = 0;

            questionColumns.forEach(qn => {
                if (group.question_totals[qn] > 0) {
                    // Calculate question score: (weightedSum / maxPossible) * 100
                    // maxPossible = totalResponses * 2 (since max value is 2 points)
                    const maxPossible = group.question_totals[qn] * 2;
                    const questionScore = maxPossible > 0 
                        ? (group.question_scores[qn] / maxPossible) * 100 
                        : 0;
                    averages[qn] = parseFloat(questionScore.toFixed(2));
                    totalAverage += averages[qn];
                    questionCount++;
                } else {
                    averages[qn] = null;
                }
            });

            // Overall average is the average of all question scores (0-100 scale)
            const overallAverage = questionCount > 0 ? parseFloat((totalAverage / questionCount).toFixed(2)) : 0;

            return {
                ...group,
                question_averages: averages,
                overall_average: overallAverage, // Already a number (0-100 scale)
                total_comments: group.comments.length
            };
        });

        // Sort by academic year (descending), then semester, then course code
        historyData.sort((a, b) => {
            if (a.current_ay !== b.current_ay) {
                return b.current_ay.localeCompare(a.current_ay);
            }
            if (a.semester !== b.semester) {
                return b.semester.localeCompare(a.semester);
            }
            return a.course_code.localeCompare(b.course_code);
        });

        // Calculate overall statistics
        const overallStats = {
            total_courses: historyData.length,
            total_responses: allData.length,
            overall_average: historyData.length > 0
                ? parseFloat((historyData.reduce((sum, item) => sum + item.overall_average, 0) / historyData.length).toFixed(2))
                : 0,
            academic_years: [...new Set(historyData.map(item => item.current_ay))].sort().reverse(),
            semesters: [...new Set(historyData.map(item => item.semester))].sort().reverse(),
            courses: [...new Set(historyData.map(item => item.course_code))].sort()
        };

        return {
            success: true,
            faculty_name: facultyName,
            staff_id: trimmedStaffId,
            history: historyData,
            overall_stats: overallStats,
            total_records: allData.length
        };
    } catch (error) {
        console.error('Error in getFacultyCompleteHistory:', error);
        return {
            success: false,
            message: error.message
        };
    }
};

// Get aggregated performance metrics for a faculty member
const getFacultyPerformanceMetrics = async (staffId) => {
    try {
        const historyResult = await getFacultyCompleteHistory(staffId);
        
        if (!historyResult.success) {
            return historyResult;
        }

        const { history, overall_stats } = historyResult;

        // Calculate performance trends by academic year
        const yearlyTrends = {};
        history.forEach(item => {
            const ay = item.current_ay;
            if (!yearlyTrends[ay]) {
                yearlyTrends[ay] = {
                    academic_year: ay,
                    courses: [],
                    total_responses: 0,
                    average_score: 0
                };
            }
            yearlyTrends[ay].courses.push(item.course_code);
            yearlyTrends[ay].total_responses += item.total_responses;
        });

            // Calculate average for each year
            Object.keys(yearlyTrends).forEach(ay => {
                const yearData = yearlyTrends[ay];
                const yearItems = history.filter(item => item.current_ay === ay);
                if (yearItems.length > 0) {
                    yearData.average_score = parseFloat((
                        yearItems.reduce((sum, item) => sum + item.overall_average, 0) / yearItems.length
                    ).toFixed(2));
                    yearData.unique_courses = [...new Set(yearData.courses)].length;
                }
            });

        // Calculate performance by course (across all years)
        const coursePerformance = {};
        history.forEach(item => {
            const courseCode = item.course_code;
            if (!coursePerformance[courseCode]) {
                coursePerformance[courseCode] = {
                    course_code: courseCode,
                    course_name: item.course_name,
                    offerings: [],
                    total_responses: 0,
                    average_score: 0
                };
            }
            coursePerformance[courseCode].offerings.push({
                academic_year: item.current_ay,
                semester: item.semester,
                average: item.overall_average,
                responses: item.total_responses
            });
            coursePerformance[courseCode].total_responses += item.total_responses;
        });

        // Calculate average for each course
        Object.keys(coursePerformance).forEach(courseCode => {
            const courseData = coursePerformance[courseCode];
            const courseItems = history.filter(item => item.course_code === courseCode);
            if (courseItems.length > 0) {
                courseData.average_score = parseFloat((
                    courseItems.reduce((sum, item) => sum + item.overall_average, 0) / courseItems.length
                ).toFixed(2));
                courseData.total_offerings = courseData.offerings.length;
            }
        });

        return {
            success: true,
            faculty_name: historyResult.faculty_name,
            staff_id: historyResult.staff_id,
            overall_stats: overall_stats,
            yearly_trends: Object.values(yearlyTrends).sort((a, b) => 
                b.academic_year.localeCompare(a.academic_year)
            ),
            course_performance: Object.values(coursePerformance).sort((a, b) => 
                a.course_code.localeCompare(b.course_code)
            ),
            detailed_history: history
        };
    } catch (error) {
        console.error('Error in getFacultyPerformanceMetrics:', error);
        return {
            success: false,
            message: error.message
        };
    }
};

// Generate Excel report for faculty complete history
const generateFacultyHistoryExcel = async (staffId) => {
    try {
        const historyResult = await getFacultyCompleteHistory(staffId);
        const metricsResult = await getFacultyPerformanceMetrics(staffId);
        
        if (!historyResult.success) {
            throw new Error(historyResult.message || 'Failed to fetch faculty history');
        }

        const { history, overall_stats, faculty_name } = historyResult;
        const { yearly_trends, course_performance } = metricsResult.success ? metricsResult : { yearly_trends: [], course_performance: [] };

        const workbook = new ExcelJS.Workbook();
        workbook.creator = 'IQAC Feedback System';
        workbook.lastModifiedBy = 'IQAC Feedback System';
        workbook.created = new Date();
        workbook.modified = new Date();

        // Faculty Details Sheet
        const facultySheet = workbook.addWorksheet('Faculty Details');
        facultySheet.addRow(['Faculty Complete Feedback History Report']);
        facultySheet.addRow(['']);
        facultySheet.addRow(['Faculty Name', faculty_name]);
        facultySheet.addRow(['Staff ID', staffId]);
        facultySheet.addRow(['Total Courses', overall_stats.total_courses]);
        facultySheet.addRow(['Total Responses', overall_stats.total_responses]);
        facultySheet.addRow(['Overall Average Score', `${overall_stats.overall_average}%`]);
        facultySheet.addRow(['Academic Years', overall_stats.academic_years.join(', ')]);
        facultySheet.addRow(['Generated Date', new Date().toLocaleString()]);
        facultySheet.addRow(['']);

        // Format header
        facultySheet.getCell('A1').font = { size: 16, bold: true, color: { argb: 'FF1a237e' } };
        facultySheet.getColumn('A').width = 25;
        facultySheet.getColumn('B').width = 40;

        // Yearly Trends Sheet
        if (yearly_trends && yearly_trends.length > 0) {
            const yearlySheet = workbook.addWorksheet('Yearly Performance');
            yearlySheet.addRow(['Academic Year', 'Unique Courses', 'Total Responses', 'Average Score (%)']);
            
            const yearlyHeader = yearlySheet.getRow(1);
            yearlyHeader.eachCell(cell => {
                cell.font = { bold: true };
                cell.fill = {
                    type: 'pattern',
                    pattern: 'solid',
                    fgColor: { argb: 'FFE6E6FA' }
                };
                cell.border = {
                    top: { style: 'thin' },
                    left: { style: 'thin' },
                    bottom: { style: 'thin' },
                    right: { style: 'thin' }
                };
                cell.alignment = { horizontal: 'center' };
            });

            yearly_trends.forEach(year => {
                const row = yearlySheet.addRow([
                    year.academic_year,
                    year.unique_courses,
                    year.total_responses,
                    year.average_score
                ]);
                row.eachCell(cell => {
                    cell.border = {
                        top: { style: 'thin' },
                        left: { style: 'thin' },
                        bottom: { style: 'thin' },
                        right: { style: 'thin' }
                    };
                });
            });

            yearlySheet.getColumn(1).width = 20;
            yearlySheet.getColumn(2).width = 18;
            yearlySheet.getColumn(3).width = 18;
            yearlySheet.getColumn(4).width = 20;
        }

        // Course Performance Sheet
        if (course_performance && course_performance.length > 0) {
            const courseSheet = workbook.addWorksheet('Course Performance');
            courseSheet.addRow(['Course Code', 'Course Name', 'Total Offerings', 'Total Responses', 'Average Score (%)']);
            
            const courseHeader = courseSheet.getRow(1);
            courseHeader.eachCell(cell => {
                cell.font = { bold: true };
                cell.fill = {
                    type: 'pattern',
                    pattern: 'solid',
                    fgColor: { argb: 'FFE6E6FA' }
                };
                cell.border = {
                    top: { style: 'thin' },
                    left: { style: 'thin' },
                    bottom: { style: 'thin' },
                    right: { style: 'thin' }
                };
                cell.alignment = { horizontal: 'center' };
            });

            course_performance.forEach(course => {
                const row = courseSheet.addRow([
                    course.course_code,
                    course.course_name,
                    course.total_offerings,
                    course.total_responses,
                    course.average_score
                ]);
                row.eachCell(cell => {
                    cell.border = {
                        top: { style: 'thin' },
                        left: { style: 'thin' },
                        bottom: { style: 'thin' },
                        right: { style: 'thin' }
                    };
                });
            });

            courseSheet.getColumn(1).width = 18;
            courseSheet.getColumn(2).width = 40;
            courseSheet.getColumn(3).width = 18;
            courseSheet.getColumn(4).width = 18;
            courseSheet.getColumn(5).width = 20;
        }

        // Detailed History Sheet
        const historySheet = workbook.addWorksheet('Detailed History');
        historySheet.addRow([
            'Academic Year',
            'Semester',
            'Course Code',
            'Course Name',
            'Degree',
            'Department',
            'Batch',
            'Total Responses',
            'Average Score (%)'
        ]);

        const historyHeader = historySheet.getRow(1);
        historyHeader.eachCell(cell => {
            cell.font = { bold: true };
            cell.fill = {
                type: 'pattern',
                pattern: 'solid',
                fgColor: { argb: 'FFE6E6FA' }
            };
            cell.border = {
                top: { style: 'thin' },
                left: { style: 'thin' },
                bottom: { style: 'thin' },
                right: { style: 'thin' }
            };
            cell.alignment = { horizontal: 'center' };
        });

        history.forEach(item => {
            const row = historySheet.addRow([
                item.current_ay,
                item.semester,
                item.course_code,
                item.course_name,
                item.degree,
                item.dept,
                item.batch,
                item.total_responses,
                item.overall_average.toFixed(2)
            ]);
            row.eachCell(cell => {
                cell.border = {
                    top: { style: 'thin' },
                    left: { style: 'thin' },
                    bottom: { style: 'thin' },
                    right: { style: 'thin' }
                };
            });
        });

        // Set column widths
        historySheet.getColumn(1).width = 18;
        historySheet.getColumn(2).width = 12;
        historySheet.getColumn(3).width = 18;
        historySheet.getColumn(4).width = 40;
        historySheet.getColumn(5).width = 20;
        historySheet.getColumn(6).width = 20;
        historySheet.getColumn(7).width = 12;
        historySheet.getColumn(8).width = 18;
        historySheet.getColumn(9).width = 20;

        return workbook;
    } catch (error) {
        console.error('Error generating Excel report:', error);
        throw error;
    }
};

module.exports = {
    getAllFaculty,
    getFacultyByDepartment,
    getFacultyBySchool,
    getFacultyCompleteHistory,
    getFacultyPerformanceMetrics,
    generateFacultyHistoryExcel
};

