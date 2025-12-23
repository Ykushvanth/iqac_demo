// const { createClient } = require('@supabase/supabase-js');
// const dotenv = require('dotenv');

// dotenv.config();

// const supabase = createClient(
//     process.env.SUPABASE_URL,
//     process.env.SUPABASE_ANON_KEY,
//     {
//         auth: {
//             persistSession: false
//         }
//     }
// );

// // Generic pagination fetcher
// async function fetchAllRows(queryBuilder, chunkSize = 1000) {
//     let from = 0;
//     let allData = [];
//     let moreData = true;

//     while (moreData) {
//         const { data, error } = await queryBuilder.range(from, from + chunkSize - 1);
//         if (error) {
//             console.error('Error fetching rows:', error);
//             throw error;
//         }

//         if (!data || data.length === 0) {
//             moreData = false;
//         } else {
//             allData = allData.concat(data);
//             from += chunkSize;
//             if (from % 5000 === 0) {
//                 console.log(`Fetched rows: ${allData.length}`);
//             }
//         }
//     }
//     console.log(`Total rows fetched: ${allData.length}`);
//     return allData;
// }

// // Helper function to clean and validate string values
// function cleanString(value) {
//     if (!value) return null;
//     const cleaned = value.toString().trim();
//     if (cleaned === '' || cleaned.toUpperCase() === 'NULL') return null;
//     return cleaned;
// }

// // 1. Degrees
// const getDistinctDegrees = async () => {
//     try {
//         console.log('Fetching all degrees with pagination...');
//         const allData = await fetchAllRows(
//             supabase.from('course_feedback').select('degree')
//         );

//         const uniqueDegrees = [...new Set(
//             allData
//                 .map(item => cleanString(item.degree))
//                 .filter(degree => degree !== null)
//         )].sort((a, b) => a.localeCompare(b));

//         console.log('Processed unique degrees:', uniqueDegrees.length, 'degrees');
//         return uniqueDegrees;
//     } catch (error) {
//         console.error('Error in getDistinctDegrees:', error);
//         throw error;
//     }
// };

// // 2. Departments
// const getDistinctDepartments = async (degree) => {
//     try {
//         console.log(`Fetching departments for degree: ${degree}`);
        
//         const allData = await fetchAllRows(
//             supabase.from('course_feedback')
//                 .select('dept')
//                 .eq('degree', degree)
//                 .not('dept', 'is', null)
//         );

//         const uniqueDepts = [...new Set(
//             allData
//                 .map(item => cleanString(item.dept))
//                 .filter(dept => dept !== null)
//         )].sort((a, b) => a.localeCompare(b));

//         console.log(`Processed unique departments: ${uniqueDepts.length} departments`);
//         return uniqueDepts;
//     } catch (error) {
//         console.error('Error in getDistinctDepartments:', error);
//         throw error;
//     }
// };

// // 3. Batches
// const getDistinctBatches = async (degree, department) => {
//     try {
//         console.log(`Fetching batches for degree: ${degree}, department: ${department}`);
        
//         const allData = await fetchAllRows(
//             supabase.from('course_feedback')
//                 .select('batch')
//                 .eq('degree', degree)
//                 .eq('dept', department)
//                 .not('batch', 'is', null)
//         );

//         const uniqueBatches = [...new Set(
//             allData
//                 .map(item => cleanString(item.batch))
//                 .filter(batch => batch !== null)
//         )].sort((a, b) => {
//             // Numeric sort for batches
//             const numA = parseInt(a);
//             const numB = parseInt(b);
//             if (!isNaN(numA) && !isNaN(numB)) {
//                 return numA - numB;
//             }
//             return a.localeCompare(b);
//         });

//         console.log(`Processed unique batches: ${uniqueBatches.length} batches`);
//         return uniqueBatches;
//     } catch (error) {
//         console.error('Error in getDistinctBatches:', error);
//         throw error;
//     }
// };

// // 4. Courses
// const getDistinctCourses = async (degree, department, batch) => {
//     try {
//         console.log(`Fetching courses for degree: ${degree}, department: ${department}, batch: ${batch}`);
        
//         const allData = await fetchAllRows(
//             supabase.from('course_feedback')
//                 .select('course_code, course_name')
//                 .eq('degree', degree)
//                 .eq('dept', department)
//                 .eq('batch', batch)
//                 .not('course_code', 'is', null)
//         );

//         const courseMap = new Map();
//         allData.forEach(item => {
//             const code = cleanString(item.course_code);
//             const name = cleanString(item.course_name);
            
//             if (code && !courseMap.has(code)) {
//                 courseMap.set(code, {
//                     code: code,
//                     name: name || 'Unknown Course'
//                 });
//             }
//         });

//         const uniqueCourses = Array.from(courseMap.values())
//             .sort((a, b) => a.code.localeCompare(b.code));

//         console.log(`Processed unique courses: ${uniqueCourses.length} courses`);
//         return uniqueCourses;
//     } catch (error) {
//         console.error('Error in getDistinctCourses:', error);
//         throw error;
//     }
// };

// // 5. Faculty list for selected filters with optional staffId filter
// const getFacultyByFilters = async (degree, department, batch, courseCode, staffIdFilter) => {
//     try {
//         console.log(`\n=== Fetching Faculty ===`);
//         console.log(`Degree: ${degree}`);
//         console.log(`Department: ${department}`);
//         console.log(`Batch: ${batch}`);
//         console.log(`Course: ${courseCode}`);
//         console.log(`Staff ID Filter: ${staffIdFilter || 'N/A'}`);

//         // Fetch all data with base filters (without exact course_code match)
//         // We'll filter course_code manually to handle trailing spaces
//         let query = supabase
//             .from('course_feedback')
//             .select('faculty_name, staff_id, staffid, course_code, course_name')
//             .eq('degree', degree)
//             .eq('dept', department)
//             .eq('batch', batch)
//             .not('faculty_name', 'is', null)
//             .not('course_code', 'is', null);

//         // Fetch all matching rows
//         const allData = await fetchAllRows(query);
//         console.log(`Raw data fetched: ${allData.length} rows`);

//         if (allData.length === 0) {
//             console.log('⚠️ No data found with the given base filters');
//             return [];
//         }

//         // Filter by course_code manually (to handle trailing spaces)
//         // Also apply staff ID filter if provided
//         const cleanedCourseCode = courseCode.trim();
//         const filteredData = allData.filter(item => {
//             const itemCourseCode = cleanString(item.course_code);
            
//             // Check if course code matches (trimmed comparison)
//             if (itemCourseCode !== cleanedCourseCode) {
//                 return false;
//             }

//             // If staff ID filter is provided, check it
//             if (staffIdFilter && staffIdFilter.trim() !== '') {
//                 const trimmedIdFilter = staffIdFilter.trim();
//                 const itemStaffId = cleanString(item.staff_id);
//                 const itemStaffid = cleanString(item.staffid);
                
//                 // Return true if either staff_id or staffid matches
//                 return itemStaffId === trimmedIdFilter || itemStaffid === trimmedIdFilter;
//             }

//             return true;
//         });

//         console.log(`Filtered data after course code match: ${filteredData.length} rows`);

//         if (filteredData.length === 0) {
//             console.log('⚠️ No data found after filtering');
//             console.log('Debug - Sample course codes in database:');
//             const sampleCodes = allData.slice(0, 5).map(item => ({
//                 course_code: item.course_code,
//                 trimmed: cleanString(item.course_code),
//                 length: item.course_code?.length,
//                 searching_for: cleanedCourseCode
//             }));
//             console.log(sampleCodes);
//             return [];
//         }

//         // Deduplicate faculty by (staff_id||staffid, course_code)
//         const uniqueMap = new Map();
        
//         for (const item of filteredData) {
//             // Get staff ID from either staff_id or staffid column
//             const staffId = cleanString(item.staff_id) || cleanString(item.staffid);
//             const facultyName = cleanString(item.faculty_name);
//             const itemCourseCode = cleanString(item.course_code);
//             const courseName = cleanString(item.course_name);

//             // Skip if no valid staff ID
//             if (!staffId) {
//                 continue;
//             }

//             // Create unique key combining staff ID and course code
//             const key = `${staffId}::${itemCourseCode}`;

//             // Only add if not already in map
//             if (!uniqueMap.has(key)) {
//                 uniqueMap.set(key, {
//                     faculty_name: facultyName || 'Unknown',
//                     staff_id: item.staff_id ? cleanString(item.staff_id) : '',
//                     staffid: item.staffid ? cleanString(item.staffid) : '',
//                     course_code: itemCourseCode || '',
//                     course_name: courseName || 'Unknown Course'
//                 });
//             }
//         }

//         const uniqueFaculty = Array.from(uniqueMap.values());
        
//         console.log(`✓ Processed faculty results: ${uniqueFaculty.length} unique faculty members`);
        
//         if (uniqueFaculty.length > 0) {
//             console.log('Sample faculty:', uniqueFaculty[0]);
//         }

//         return uniqueFaculty;
//     } catch (error) {
//         console.error('❌ Error in getFacultyByFilters:', error);
//         console.error('Error details:', error.message);
//         throw error;
//     }
// };

// module.exports = {
//     getDistinctDegrees,
//     getDistinctDepartments,
//     getDistinctBatches,
//     getDistinctCourses,
//     getFacultyByFilters
// };

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
            if (from % 5000 === 0) {
                console.log(`Fetched rows: ${allData.length}`);
            }
        }
    }
    console.log(`Total rows fetched: ${allData.length}`);
    return allData;
}

// Helper function to clean and validate string values
function cleanString(value) {
    if (!value) return null;
    const cleaned = value.toString().trim();
    if (cleaned === '' || cleaned.toUpperCase() === 'NULL') return null;
    return cleaned;
}

// ==================== NEW FILTER HIERARCHY USING course_feedback_new ====================
// 1. Get Distinct Degrees from course_feedback_new table
const getDistinctDegrees = async () => {
    try {
        console.log('Fetching all degrees from course_feedback_new table...');
        const allData = await fetchAllRows(
            supabase.from('course_feedback_new').select('degree')
        );

        const uniqueDegrees = [...new Set(
            allData
                .map(item => cleanString(item.degree))
                .filter(degree => degree !== null)
        )].sort((a, b) => a.localeCompare(b));

        console.log('Processed unique degrees:', uniqueDegrees.length, 'degrees');
        return uniqueDegrees;
    } catch (error) {
        console.error('Error in getDistinctDegrees:', error);
        throw error;
    }
};

// 2. Get Distinct Current AY (Academic Year) based on degree
const getDistinctCurrentAY = async (degree) => {
    try {
        console.log(`Fetching current_ay for degree: ${degree}`);
        
        const allData = await fetchAllRows(
            supabase.from('course_feedback_new')
                .select('current_ay')
                .eq('degree', degree)
                .not('current_ay', 'is', null)
        );

        const uniqueAY = [...new Set(
            allData
                .map(item => cleanString(item.current_ay))
                .filter(ay => ay !== null)
        )].sort((a, b) => b.localeCompare(a)); // Sort descending (newest first)

        console.log(`Processed unique current_ay: ${uniqueAY.length} academic years`);
        return uniqueAY;
    } catch (error) {
        console.error('Error in getDistinctCurrentAY:', error);
        throw error;
    }
};

// 3. Get Distinct Semesters based on degree + current_ay
const getDistinctSemesters = async (degree, currentAY) => {
    try {
        console.log(`Fetching semesters for degree: ${degree}, current_ay: ${currentAY}`);
        
        let query = supabase.from('course_feedback_new')
            .select('semester')
            .eq('degree', degree)
            .not('semester', 'is', null);
        
        if (currentAY) {
            query = query.eq('current_ay', currentAY);
        }

        const allData = await fetchAllRows(query);

        const uniqueSemesters = [...new Set(
            allData
                .map(item => cleanString(item.semester))
                .filter(sem => sem !== null)
        )].sort((a, b) => {
            // Try numeric sort first
            const numA = parseInt(a);
            const numB = parseInt(b);
            if (!isNaN(numA) && !isNaN(numB)) {
                return numA - numB;
            }
            return a.localeCompare(b);
        });

        console.log(`Processed unique semesters: ${uniqueSemesters.length} semesters`);
        return uniqueSemesters;
    } catch (error) {
        console.error('Error in getDistinctSemesters:', error);
        throw error;
    }
};

// 4. Get Distinct Course Offering Departments based on degree + current_ay + semester
const getDistinctCourseOfferingDepts = async (degree, currentAY, semester) => {
    try {
        console.log(`Fetching course_offering_dept_name for degree: ${degree || 'all'}, current_ay: ${currentAY}, semester: ${semester}`);
        
        let query = supabase.from('course_feedback_new')
            .select('course_offering_dept_name')
            .not('course_offering_dept_name', 'is', null);
        
        // Only filter by degree if provided
        if (degree) {
            query = query.eq('degree', degree);
        }
        
        if (currentAY) {
            query = query.eq('current_ay', currentAY);
        }
        if (semester) {
            query = query.eq('semester', semester);
        }

        const allData = await fetchAllRows(query);

        const uniqueDepts = [...new Set(
            allData
                .map(item => cleanString(item.course_offering_dept_name))
                .filter(dept => dept !== null)
        )].sort((a, b) => a.localeCompare(b));

        console.log(`Processed unique course offering departments: ${uniqueDepts.length} departments`);
        return uniqueDepts;
    } catch (error) {
        console.error('Error in getDistinctCourseOfferingDepts:', error);
        throw error;
    }
};

// Get Distinct Course Offering Departments filtered by degree only (for visualize component)
const getDistinctCourseOfferingDeptsByDegree = async (degree) => {
    try {
        console.log(`Fetching course_offering_dept_name for degree: ${degree}`);
        
        let query = supabase.from('course_feedback_new')
            .select('course_offering_dept_name')
            .not('course_offering_dept_name', 'is', null);
        
        if (degree) {
            query = query.eq('degree', degree);
        }
        
        const allData = await fetchAllRows(query);
        
        const uniqueDepts = [...new Set(
            allData
                .map(item => cleanString(item.course_offering_dept_name))
                .filter(dept => dept !== null)
        )].sort((a, b) => a.localeCompare(b));

        console.log(`Processed unique course offering departments: ${uniqueDepts.length} departments`);
        return uniqueDepts;
    } catch (error) {
        console.error('Error in getDistinctCourseOfferingDeptsByDegree:', error);
        throw error;
    }
};

// 5. Get Distinct Course Names based on all previous filters
const getDistinctCourseNames = async (degree, currentAY, semester, courseOfferingDept) => {
    try {
        console.log(`Fetching course_name for degree: ${degree}, current_ay: ${currentAY}, semester: ${semester}, course_offering_dept: ${courseOfferingDept}`);
        
        let query = supabase.from('course_feedback_new')
            .select('course_code, course_name')
            .eq('degree', degree)
            .not('course_code', 'is', null)
            .not('course_name', 'is', null);
        
        if (currentAY) {
            query = query.eq('current_ay', currentAY);
        }
        if (semester) {
            query = query.eq('semester', semester);
        }
        if (courseOfferingDept) {
            query = query.eq('course_offering_dept_name', courseOfferingDept);
        }

        const allData = await fetchAllRows(query);

        // Group by course_code to get unique courses
        const courseMap = new Map();
        allData.forEach(item => {
            const code = cleanString(item.course_code);
            const name = cleanString(item.course_name);
            
            if (code && !courseMap.has(code)) {
                courseMap.set(code, {
                    code: code,
                    name: name || 'Unknown Course'
                });
            }
        });

        const uniqueCourses = Array.from(courseMap.values())
            .sort((a, b) => a.code.localeCompare(b.code));

        console.log(`Processed unique courses: ${uniqueCourses.length} courses`);
        return uniqueCourses;
    } catch (error) {
        console.error('Error in getDistinctCourseNames:', error);
        throw error;
    }
};

// ==================== HoD-SPECIFIC DEPARTMENT-BASED FUNCTIONS ====================

// Get unique current AY for a HoD's department (no degree filter)
const getDistinctCurrentAYByDepartment = async (department) => {
    try {
        console.log(`Fetching current_ay for department: ${department}`);
        
        const allData = await fetchAllRows(
            supabase.from('course_feedback_new')
                .select('current_ay')
                .eq('course_offering_dept_name', department)
                .not('current_ay', 'is', null)
        );

        const uniqueAY = [...new Set(
            allData
                .map(item => cleanString(item.current_ay))
                .filter(ay => ay !== null)
        )].sort((a, b) => b.localeCompare(a)); // Sort descending (newest first)

        console.log(`Processed unique current_ay for department: ${uniqueAY.length} academic years`);
        return uniqueAY;
    } catch (error) {
        console.error('Error in getDistinctCurrentAYByDepartment:', error);
        throw error;
    }
};

// Get unique semesters for a HoD's department + current_ay (no degree filter)
const getDistinctSemestersByDepartment = async (department, currentAY) => {
    try {
        console.log(`Fetching semesters for department: ${department}, current_ay: ${currentAY}`);
        
        let query = supabase.from('course_feedback_new')
            .select('semester')
            .eq('course_offering_dept_name', department)
            .not('semester', 'is', null);
        
        if (currentAY) {
            query = query.eq('current_ay', currentAY);
        }

        const allData = await fetchAllRows(query);

        const uniqueSemesters = [...new Set(
            allData
                .map(item => cleanString(item.semester))
                .filter(sem => sem !== null)
        )].sort((a, b) => {
            // Try numeric sort first
            const numA = parseInt(a);
            const numB = parseInt(b);
            if (!isNaN(numA) && !isNaN(numB)) {
                return numA - numB;
            }
            return a.localeCompare(b);
        });

        console.log(`Processed unique semesters for department: ${uniqueSemesters.length} semesters`);
        return uniqueSemesters;
    } catch (error) {
        console.error('Error in getDistinctSemestersByDepartment:', error);
        throw error;
    }
};

// Get unique courses for a HoD's department + current_ay + semester (no degree filter)
const getDistinctCourseNamesByDepartment = async (department, currentAY, semester) => {
    try {
        console.log(`Fetching course_name for department: ${department}, current_ay: ${currentAY}, semester: ${semester}`);
        
        let query = supabase.from('course_feedback_new')
            .select('course_code, course_name')
            .eq('course_offering_dept_name', department)
            .not('course_code', 'is', null)
            .not('course_name', 'is', null);
        
        if (currentAY) {
            query = query.eq('current_ay', currentAY);
        }
        if (semester) {
            query = query.eq('semester', semester);
        }

        const allData = await fetchAllRows(query);

        // Group by course_code to get unique courses
        const courseMap = new Map();
        allData.forEach(item => {
            const code = cleanString(item.course_code);
            const name = cleanString(item.course_name);
            
            if (code && !courseMap.has(code)) {
                courseMap.set(code, {
                    code: code,
                    name: name || 'Unknown Course'
                });
            }
        });

        const uniqueCourses = Array.from(courseMap.values())
            .sort((a, b) => a.code.localeCompare(b.code));

        console.log(`Processed unique courses for department: ${uniqueCourses.length} courses`);
        return uniqueCourses;
    } catch (error) {
        console.error('Error in getDistinctCourseNamesByDepartment:', error);
        throw error;
    }
};

// ==================== OLD FUNCTIONS (keeping for backward compatibility) ====================
// Old function names kept for compatibility - these now use course_feedback_new

// 2. Get Distinct Staff Departments from course_allocation table (for selected degree)
const getDistinctDepartments = async (degree) => {
    try {
        console.log(`Fetching staff_dept for degree: ${degree}`);
        
        const allData = await fetchAllRows(
            supabase.from('course_allocation')
                .select('staff_dept')
                .eq('degree', degree)
                .not('staff_dept', 'is', null)
        );

        const uniqueDepts = [...new Set(
            allData
                .map(item => cleanString(item.staff_dept))
                .filter(dept => dept !== null)
        )].sort((a, b) => a.localeCompare(b));

        console.log(`Processed unique staff departments: ${uniqueDepts.length} departments`);
        return uniqueDepts;
    } catch (error) {
        console.error('Error in getDistinctDepartments:', error);
        throw error;
    }
};

// 3. Get Distinct Courses from course_allocation table (filtered by degree and staff_dept)
const getDistinctCourses = async (degree, department) => {
    try {
        console.log(`Fetching courses for degree: ${degree}, staff_dept: ${department} (all batches)`);
        
        const allData = await fetchAllRows(
            supabase.from('course_allocation')
                .select('course_code, course_name, batch')
                .eq('degree', degree)
                .eq('staff_dept', department)
                .not('course_code', 'is', null)
        );

        // Group courses by course_code and collect all batches
        const courseMap = new Map();
        allData.forEach(item => {
            const code = cleanString(item.course_code);
            const name = cleanString(item.course_name);
            const batch = cleanString(item.batch);
            
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

        console.log(`Processed unique courses: ${uniqueCourses.length} courses`);
        return uniqueCourses;
    } catch (error) {
        console.error('Error in getDistinctCourses:', error);
        throw error;
    }
};

// 4a. Get Faculty from course_allocation table (by staff_dept, degree, course_code)
// This gets faculty from the source of truth (course_allocation) based on staff_dept, degree, and course
const getFacultyFromCourseAllocation = async (degree, staffDept, courseCode) => {
    try {
        console.log(`\n=== Fetching Faculty from course_allocation ===`);
        console.log(`Degree: ${degree}`);
        console.log(`Staff Dept: ${staffDept}`);
        console.log(`Course Code: ${courseCode}`);

        const cleanedCourseCode = courseCode.trim();
        
        // Query course_allocation for faculty matching degree, staff_dept, and course_code
        // Prioritize staffid over staff_id
        const allData = await fetchAllRows(
            supabase.from('course_allocation')
                .select('staff_id, staffid, staff_name, course_code, course_name, degree, staff_dept, batch')
                .eq('degree', degree)
                .eq('staff_dept', staffDept)
                .eq('course_code', cleanedCourseCode)
        );
        
        // Filter to only include records with staffid (prioritize staffid over staff_id)
        const filteredData = allData.filter(item => {
            const hasStaffid = item.staffid !== null && item.staffid !== undefined && item.staffid !== '';
            return hasStaffid;  // Only include if staffid exists
        });

        console.log(`Raw data from course_allocation: ${allData.length} rows`);
        console.log(`Filtered data (with staffid): ${filteredData.length} rows`);

        if (filteredData.length === 0) {
            console.log('⚠️ No faculty found in course_allocation for these filters');
            return [];
        }

        // Deduplicate faculty by staffid (prioritize staffid over staff_id)
        const uniqueMap = new Map();
        
        for (const item of filteredData) {
            // Prioritize staffid over staff_id
            const staffId = cleanString(item.staffid) || cleanString(item.staff_id);
            const staffName = cleanString(item.staff_name);
            const itemCourseCode = cleanString(item.course_code);
            const courseName = cleanString(item.course_name);
            const batch = cleanString(item.batch);

            if (!staffId) continue;

            const key = staffId;

            if (!uniqueMap.has(key)) {
                uniqueMap.set(key, {
                    staffid: item.staffid ? cleanString(item.staffid) : '',  // Prioritize staffid
                    staff_id: item.staff_id ? cleanString(item.staff_id) : '',  // Keep for reference
                    staff_name: staffName || 'Unknown',
                    course_code: itemCourseCode || cleanedCourseCode,
                    course_name: courseName || 'Unknown Course',
                    batches: []
                });
            }

            // Add batch if not already present
            if (batch && !uniqueMap.get(key).batches.includes(batch)) {
                uniqueMap.get(key).batches.push(batch);
            }
        }

        const uniqueFaculty = Array.from(uniqueMap.values())
            .map(fac => ({
                ...fac,
                batches: fac.batches.sort((a, b) => {
                    const numA = parseInt(a);
                    const numB = parseInt(b);
                    if (!isNaN(numA) && !isNaN(numB)) {
                        return numA - numB;
                    }
                    return a.localeCompare(b);
                }),
                batches_text: fac.batches.join(', ')
            }));
        
        console.log(`✓ Found ${uniqueFaculty.length} unique faculty members in course_allocation`);
        
        if (uniqueFaculty.length > 0) {
            console.log('Sample faculty:', uniqueFaculty[0]);
        }

        return uniqueFaculty;
    } catch (error) {
        console.error('❌ Error in getFacultyFromCourseAllocation:', error);
        throw error;
    }
};

// 4. Get Faculty for selected course (from course_feedback_new table)
// This matches course_code and fetches faculty details with new filter hierarchy
const getFacultyByCourse = async (degree, currentAY, semester, courseOfferingDept, courseCode, staffIdFilter) => {
    try {
        console.log(`\n=== Fetching Faculty for Course ===`);
        console.log(`Degree: ${degree}`);
        console.log(`Current AY: ${currentAY}`);
        console.log(`Semester: ${semester}`);
        console.log(`Course Offering Dept: ${courseOfferingDept}`);
        console.log(`Course Code: ${courseCode}`);
        console.log(`Staff ID Filter: ${staffIdFilter || 'N/A'}`);

        // Primary match: course_code from course_feedback_new (exact match)
        const cleanedCourseCode = courseCode.trim();
        let query = supabase
            .from('course_feedback_new')
            .select('faculty_name, staff_id, staffid, course_code, course_name, batch, degree, current_ay, semester, course_offering_dept_name')
            .eq('course_code', cleanedCourseCode)  // Exact match instead of LIKE
            .not('faculty_name', 'is', null)
            .not('course_code', 'is', null);

        // Apply filters based on new hierarchy (degree is NOT enforced here to avoid mismatches)
        if (currentAY) {
            query = query.eq('current_ay', currentAY);
        }
        if (semester) {
            query = query.eq('semester', semester);
        }
        if (courseOfferingDept) {
            query = query.eq('course_offering_dept_name', courseOfferingDept);
        }

        // Apply staff filter at DB level if provided
        if (staffIdFilter && staffIdFilter.trim() !== '') {
            const trimmedIdFilter = staffIdFilter.trim();
            query = query.or(`staff_id.eq.${trimmedIdFilter},staffid.eq.${trimmedIdFilter}`);
        }

        const allData = await fetchAllRows(query);
        console.log(`Raw data fetched from course_feedback_new: ${allData.length} rows`);

        if (allData.length === 0) {
            console.log('⚠️ No feedback data found in course_feedback_new table');
            return [];
        }

        // Data already filtered by DB; apply exact course_code match and staff filter defensively
        const filteredData = allData.filter(item => {
            const itemCourseCode = cleanString(item.course_code);
            // Exact match for course_code (not LIKE)
            if (itemCourseCode !== cleanedCourseCode) return false;
            
            // Additional filter checks (defensive)
            if (currentAY) {
                const itemCurrentAY = cleanString(item.current_ay);
                if (itemCurrentAY !== currentAY) return false;
            }
            if (semester) {
                const itemSemester = cleanString(item.semester);
                if (itemSemester !== semester) return false;
            }
            if (courseOfferingDept) {
                const itemCourseOfferingDept = cleanString(item.course_offering_dept_name);
                if (itemCourseOfferingDept !== courseOfferingDept) return false;
            }
            
            if (staffIdFilter && staffIdFilter.trim() !== '') {
                const trimmedIdFilter = staffIdFilter.trim();
                const itemStaffId = cleanString(item.staff_id);
                const itemStaffid = cleanString(item.staffid);
                return itemStaffId === trimmedIdFilter || itemStaffid === trimmedIdFilter;
            }
            return true;
        });

        console.log(`Filtered data after course_code match: ${filteredData.length} rows`);

        if (filteredData.length === 0) {
            console.log('⚠️ No feedback data found for this course');
            return [];
        }

        // Deduplicate faculty by (staff_id||staffid, course_code) and collect batches
        const uniqueMap = new Map();
        
        for (const item of filteredData) {
            const staffId = cleanString(item.staff_id) || cleanString(item.staffid);
            const facultyName = cleanString(item.faculty_name);
            const itemCourseCode = cleanString(item.course_code);
            const courseName = cleanString(item.course_name);
            const batch = cleanString(item.batch);

            if (!staffId) continue;

            const key = `${staffId}::${itemCourseCode}`;

            if (!uniqueMap.has(key)) {
                uniqueMap.set(key, {
                    faculty_name: facultyName || 'Unknown',
                    staff_id: item.staff_id ? cleanString(item.staff_id) : '',
                    staffid: item.staffid ? cleanString(item.staffid) : '',
                    course_code: itemCourseCode || '',
                    course_name: courseName || 'Unknown Course',
                    batches: []
                });
            }

            // Add batch if not already present
            if (batch && !uniqueMap.get(key).batches.includes(batch)) {
                uniqueMap.get(key).batches.push(batch);
            }
        }

        const uniqueFaculty = Array.from(uniqueMap.values())
            .map(fac => ({
                ...fac,
                batches: fac.batches.sort((a, b) => {
                    const numA = parseInt(a);
                    const numB = parseInt(b);
                    if (!isNaN(numA) && !isNaN(numB)) {
                        return numA - numB;
                    }
                    return a.localeCompare(b);
                }),
                batches_text: fac.batches.join(', ')
            }));
        
        console.log(`✓ Processed faculty results: ${uniqueFaculty.length} unique faculty members`);
        
        if (uniqueFaculty.length > 0) {
            console.log('Sample faculty:', uniqueFaculty[0]);
        }

        return uniqueFaculty;
    } catch (error) {
        console.error('❌ Error in getFacultyByCourse:', error);
        console.error('Error details:', error.message);
        throw error;
    }
};

// 4b. Get unique batches from course_feedback_new for a specific faculty+course combination
const getBatchesForFacultyCourse = async (courseCode, staffId) => {
    try {
        const cleanedCourseCode = courseCode.trim();
        const trimmedStaffId = staffId.trim();
        
        console.log(`\n=== Getting unique batches for faculty+course ===`);
        console.log(`Course Code: ${cleanedCourseCode}`);
        console.log(`Staff ID (staffid): ${trimmedStaffId}`);
        
        // Query course_feedback_new for batches matching course_code (prioritize staffid matching)
        // No degree filter - get all batches for this course_code and staffid
        let query = supabase
            .from('course_feedback_new')
            .select('batch, staff_id, staffid')
            .like('course_code', `${cleanedCourseCode}%`)
            .or(`staff_id.eq.${trimmedStaffId},staffid.eq.${trimmedStaffId}`)
            .not('batch', 'is', null);
        
        const allData = await fetchAllRows(query);
        console.log(`Raw batch data from course_feedback_new: ${allData.length} rows`);
        
        if (allData.length === 0) {
            return [];
        }
        
        // Already filtered in DB; keep a defensive filter
        const filteredData = allData.filter(item => {
            const itemStaffid = cleanString(item.staffid);
            const itemStaffId = cleanString(item.staff_id);
            return itemStaffid === trimmedStaffId || itemStaffId === trimmedStaffId;
        });
        
        console.log(`Filtered data after staffid match: ${filteredData.length} rows`);
        
        // Get unique batches
        const uniqueBatches = [...new Set(
            filteredData
                .map(item => cleanString(item.batch))
                .filter(batch => batch !== null && batch !== '')
        )].sort((a, b) => {
            const numA = parseInt(a);
            const numB = parseInt(b);
            if (!isNaN(numA) && !isNaN(numB)) {
                return numA - numB;
            }
            return a.localeCompare(b);
        });
        
        console.log(`✓ Found ${uniqueBatches.length} unique batches for this faculty+course`);
        
        return uniqueBatches;
    } catch (error) {
        console.error('❌ Error in getBatchesForFacultyCourse:', error);
        return [];
    }
};

// 5. Get Distinct Batches from course_allocation (helper function for backward compatibility)
const getDistinctBatches = async (degree, department) => {
    try {
        console.log(`Fetching batches for degree: ${degree}, staff_dept: ${department}`);
        
        const allData = await fetchAllRows(
            supabase.from('course_allocation')
                .select('batch')
                .eq('degree', degree)
                .eq('staff_dept', department)
                .not('batch', 'is', null)
        );

        const uniqueBatches = [...new Set(
            allData
                .map(item => cleanString(item.batch))
                .filter(batch => batch !== null)
        )].sort((a, b) => {
            const numA = parseInt(a);
            const numB = parseInt(b);
            if (!isNaN(numA) && !isNaN(numB)) {
                return numA - numB;
            }
            return a.localeCompare(b);
        });

        console.log(`Processed unique batches: ${uniqueBatches.length} batches`);
        return uniqueBatches;
    } catch (error) {
        console.error('Error in getDistinctBatches:', error);
        throw error;
    }
};

// 4c. Get unique degrees from course_feedback_new for a specific faculty+course combination
const getDegreesForFacultyCourse = async (courseCode, staffId) => {
    try {
        const cleanedCourseCode = courseCode.trim();
        const trimmedStaffId = staffId.trim();
        
        console.log(`\n=== Getting unique degrees for faculty+course ===`);
        console.log(`Course Code: ${cleanedCourseCode}`);
        console.log(`Staff ID (staffid): ${trimmedStaffId}`);
        
        // Query course_feedback_new for degrees matching course_code (prioritize staffid matching)
        // No degree filter - get all degrees for this course_code and staffid
        let query = supabase
            .from('course_feedback_new')
            .select('degree, staff_id, staffid')
            .like('course_code', `${cleanedCourseCode}%`)
            .or(`staff_id.eq.${trimmedStaffId},staffid.eq.${trimmedStaffId}`)
            .not('degree', 'is', null);
        
        const allData = await fetchAllRows(query);
        console.log(`Raw degree data from course_feedback_new: ${allData.length} rows`);
        
        if (allData.length === 0) {
            return [];
        }
        
        // Already filtered in DB; keep a defensive filter
        const filteredData = allData.filter(item => {
            const itemStaffid = cleanString(item.staffid);
            const itemStaffId = cleanString(item.staff_id);
            return itemStaffid === trimmedStaffId || itemStaffId === trimmedStaffId;
        });
        
        console.log(`Filtered data after staffid match: ${filteredData.length} rows`);
        
        // Get unique degrees
        const uniqueDegrees = [...new Set(
            filteredData
                .map(item => cleanString(item.degree))
                .filter(degree => degree !== null && degree !== '')
        )].sort((a, b) => a.localeCompare(b));
        
        console.log(`✓ Found ${uniqueDegrees.length} unique degrees for this faculty+course`);
        
        return uniqueDegrees;
    } catch (error) {
        console.error('❌ Error in getDegreesForFacultyCourse:', error);
        return [];
    }
};

// 4d. Get CGPA-wise breakdown for a specific faculty+course (uses qn1 as CGPA)
const getCgpaBreakdownForFacultyCourse = async (courseCode, staffId) => {
    try {
        const cleanedCourseCode = courseCode.trim();
        const trimmedStaffId = staffId.trim();

        // Fetch minimal fields needed and filter by course_code
        // No degree filter - get all responses for this course_code and staffid
        let query = supabase
            .from('course_feedback_new')
            .select('qn1, staff_id, staffid, degree, course_code')
            .like('course_code', `${cleanedCourseCode}%`)
            .or(`staff_id.eq.${trimmedStaffId},staffid.eq.${trimmedStaffId}`)
            .not('qn1', 'is', null);

		const allData = await fetchAllRows(query);
		if (!allData || allData.length === 0) {
			return { low: 0, mid: 0, high: 0, total: 0 };
		}

        // Already filtered by DB; keep defensive filter
        const filtered = allData.filter((row) => {
            const sid = cleanString(row.staffid);
            const sid2 = cleanString(row.staff_id);
            return sid === trimmedStaffId || sid2 === trimmedStaffId;
        });

		// Define CGPA bands (adjust later if needed):
		// low: < 6.0, mid: 6.0 - 7.99, high: >= 8.0
		let low = 0;
		let mid = 0;
		let high = 0;
		for (const row of filtered) {
			const val = Number(row.qn1);
			if (Number.isFinite(val)) {
				if (val >= 8.0) high++;
				else if (val >= 6.0) mid++;
				else low++;
			}
		}
		return { low, mid, high, total: low + mid + high };
	} catch (err) {
		console.error('❌ Error in getCgpaBreakdownForFacultyCourse:', err);
		return { low: 0, mid: 0, high: 0, total: 0 };
	}
};

module.exports = {
    // New filter hierarchy functions
    getDistinctDegrees,
    getDistinctCurrentAY,
    getDistinctSemesters,
    getDistinctCourseOfferingDepts,
    getDistinctCourseOfferingDeptsByDegree,
    getDistinctCourseNames,
    // HoD-specific department-based functions
    getDistinctCurrentAYByDepartment,
    getDistinctSemestersByDepartment,
    getDistinctCourseNamesByDepartment,
    // Old functions (for backward compatibility - will be updated to use course_feedback_new)
    getDistinctDepartments,
    getDistinctBatches,
    getDistinctCourses,
    getFacultyByCourse,
    getFacultyFromCourseAllocation,
    getBatchesForFacultyCourse,
    getDegreesForFacultyCourse,
    getCgpaBreakdownForFacultyCourse,
    // Keep old function name for backward compatibility with reports
    getFacultyByFilters: getFacultyByCourse
};