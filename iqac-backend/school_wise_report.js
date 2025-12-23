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

// Get all distinct schools from profiles table
const getDistinctSchools = async () => {
    try {
        console.log('Fetching all schools from profiles table...');
        console.log('Supabase URL:', process.env.SUPABASE_URL ? 'Set' : 'NOT SET');
        
        // First, test if we can access the profiles table
        const { data: testData, error: testError } = await supabase
            .from('profiles')
            .select('school')
            .limit(1);
            
        if (testError) {
            console.error('❌ Cannot access profiles table:', testError);
            console.error('Error code:', testError.code);
            console.error('Error message:', testError.message);
            console.error('Error details:', testError.details);
            throw new Error(`Cannot access profiles table: ${testError.message || 'Database connection error'}`);
        }
        
        console.log('✓ Successfully connected to profiles table');
        
        // Now fetch all schools
        const { data, error } = await supabase
            .from('profiles')
            .select('school')
            .not('school', 'is', null);

        if (error) {
            console.error('❌ Supabase error fetching schools:', error);
            console.error('Error code:', error.code);
            console.error('Error message:', error.message);
            console.error('Error details:', error.details);
            throw new Error(`Database error: ${error.message || 'Failed to fetch schools from profiles table'}`);
        }

        if (!data) {
            console.warn('⚠️ No data returned from profiles table');
            return [];
        }

        console.log(`✓ Raw data from profiles: ${data.length} rows`);

        const uniqueSchools = [...new Set(
            (data || [])
                .map(item => cleanString(item.school))
                .filter(school => school !== null)
        )].sort((a, b) => a.localeCompare(b));

        console.log(`✓ Processed unique schools: ${uniqueSchools.length} schools`);
        if (uniqueSchools.length > 0) {
            console.log('Sample schools:', uniqueSchools.slice(0, 5));
        } else {
            console.warn('⚠️ No schools found in profiles table. Make sure the profiles table has school data.');
        }
        return uniqueSchools;
    } catch (error) {
        console.error('❌ Error in getDistinctSchools:', error);
        console.error('Error stack:', error.stack);
        throw error;
    }
};

// Get all departments for a specific school from profiles table
const getDepartmentsBySchool = async (school) => {
    try {
        console.log(`Fetching departments for school: ${school}`);
        const { data, error } = await supabase
            .from('profiles')
            .select('department')
            .eq('school', school)
            .not('department', 'is', null);

        if (error) {
            console.error('Error fetching departments:', error);
            throw error;
        }

        const uniqueDepts = [...new Set(
            (data || [])
                .map(item => cleanString(item.department))
                .filter(dept => dept !== null)
        )].sort((a, b) => a.localeCompare(b));

        console.log(`Processed unique departments for ${school}: ${uniqueDepts.length} departments`);
        return uniqueDepts;
    } catch (error) {
        console.error('Error in getDepartmentsBySchool:', error);
        throw error;
    }
};

// Get school name and all departments for a school
const getSchoolWithDepartments = async (school) => {
    try {
        const departments = await getDepartmentsBySchool(school);
        return {
            school: school,
            departments: departments
        };
    } catch (error) {
        console.error('Error in getSchoolWithDepartments:', error);
        throw error;
    }
};

// Helper function to fetch all rows from a query (handles pagination)
const fetchAllRows = async (query) => {
    let allData = [];
    let from = 0;
    const limit = 1000;
    let hasMore = true;

    while (hasMore) {
        const { data, error } = await query.range(from, from + limit - 1);
        if (error) throw error;
        if (data && data.length > 0) {
            allData = allData.concat(data);
            from += limit;
            hasMore = data.length === limit;
        } else {
            hasMore = false;
        }
    }
    return allData;
};

// Get distinct academic years for selected school(s)
const getCurrentAYBySchools = async (schools) => {
    try {
        console.log(`Fetching current_ay for schools: ${schools ? schools.join(', ') : 'all'}`);
        
        // If no schools specified, get all academic years
        if (!schools || schools.length === 0) {
            const allData = await fetchAllRows(
                supabase.from('course_feedback_new')
                    .select('current_ay')
                    .not('current_ay', 'is', null)
            );
            
            const uniqueAY = [...new Set(
                allData
                    .map(item => cleanString(item.current_ay))
                    .filter(ay => ay !== null)
            )].sort((a, b) => b.localeCompare(a)); // Sort descending (newest first)
            
            console.log(`Processed unique current_ay: ${uniqueAY.length} academic years`);
            return uniqueAY;
        }
        
        // Get all departments for the selected schools
        const allDepartments = [];
        for (const school of schools) {
            const departments = await getDepartmentsBySchool(school);
            allDepartments.push(...departments);
        }
        
        if (allDepartments.length === 0) {
            console.log('No departments found for selected schools');
            return [];
        }
        
        // Remove duplicates
        const uniqueDepartments = [...new Set(allDepartments)];
        console.log(`Found ${uniqueDepartments.length} unique departments across selected schools`);
        
        // Get academic years from course_feedback_new where course_offering_dept_name is in these departments
        const allData = await fetchAllRows(
            supabase.from('course_feedback_new')
                .select('current_ay')
                .in('course_offering_dept_name', uniqueDepartments)
                .not('current_ay', 'is', null)
        );
        
        const uniqueAY = [...new Set(
            allData
                .map(item => cleanString(item.current_ay))
                .filter(ay => ay !== null)
        )].sort((a, b) => b.localeCompare(a)); // Sort descending (newest first)
        
        console.log(`Processed unique current_ay for selected schools: ${uniqueAY.length} academic years`);
        return uniqueAY;
    } catch (error) {
        console.error('Error in getCurrentAYBySchools:', error);
        throw error;
    }
};

// Get distinct semesters for selected school(s) and academic year
const getSemestersBySchools = async (schools, currentAY) => {
    try {
        console.log(`Fetching semesters for schools: ${schools ? schools.join(', ') : 'all'}, currentAY: ${currentAY}`);
        
        // If no schools specified, get all semesters for the academic year
        if (!schools || schools.length === 0) {
            let query = supabase.from('course_feedback_new')
                .select('semester')
                .not('semester', 'is', null);
            
            if (currentAY) {
                query = query.eq('current_ay', currentAY);
            }
            
            const allData = await fetchAllRows(query);
            
            const uniqueSemesters = [...new Set(
                allData
                    .map(item => cleanString(item.semester))
                    .filter(sem => sem !== null)
            )].sort((a, b) => a.localeCompare(b));
            
            console.log(`Processed unique semesters: ${uniqueSemesters.length} semesters`);
            return uniqueSemesters;
        }
        
        // Get all departments for the selected schools
        const allDepartments = [];
        for (const school of schools) {
            const departments = await getDepartmentsBySchool(school);
            allDepartments.push(...departments);
        }
        
        if (allDepartments.length === 0) {
            console.log('No departments found for selected schools');
            return [];
        }
        
        // Remove duplicates
        const uniqueDepartments = [...new Set(allDepartments)];
        console.log(`Found ${uniqueDepartments.length} unique departments across selected schools`);
        
        // Get semesters from course_feedback_new where course_offering_dept_name is in these departments
        let query = supabase.from('course_feedback_new')
            .select('semester')
            .in('course_offering_dept_name', uniqueDepartments)
            .not('semester', 'is', null);
        
        if (currentAY) {
            query = query.eq('current_ay', currentAY);
        }
        
        const allData = await fetchAllRows(query);
        
        const uniqueSemesters = [...new Set(
            allData
                .map(item => cleanString(item.semester))
                .filter(sem => sem !== null)
        )].sort((a, b) => a.localeCompare(b));
        
        console.log(`Processed unique semesters for selected schools: ${uniqueSemesters.length} semesters`);
        return uniqueSemesters;
    } catch (error) {
        console.error('Error in getSemestersBySchools:', error);
        throw error;
    }
};

// Get departments for a school that actually have data in course_feedback_new for given AY + semester
const getActiveDepartmentsBySchoolAndFilters = async (school, currentAY, semester) => {
    try {
        console.log(`Fetching active departments for school=${school}, AY=${currentAY}, semester=${semester}`);
        
        const baseDepts = await getDepartmentsBySchool(school);
        if (!baseDepts || baseDepts.length === 0) {
            console.log('No departments found for school:', school);
            return [];
        }

        let query = supabase
            .from('course_feedback_new')
            .select('course_offering_dept_name')
            .in('course_offering_dept_name', baseDepts)
            .not('course_offering_dept_name', 'is', null);

        if (currentAY) {
            query = query.eq('current_ay', currentAY);
        }
        if (semester) {
            query = query.eq('semester', semester);
        }

        const allData = await fetchAllRows(query);

        const active = [...new Set(
            (allData || [])
                .map(row => cleanString(row.course_offering_dept_name))
                .filter(v => v !== null)
        )].sort((a, b) => a.localeCompare(b));

        console.log(`Active departments for ${school}: ${active.length}`);
        return active;
    } catch (error) {
        console.error('Error in getActiveDepartmentsBySchoolAndFilters:', error);
        throw error;
    }
};

// Get unique courses for a school/department/AY/semester (no degree filter)
const getCoursesBySchoolDeptAndFilters = async (school, dept, currentAY, semester) => {
    try {
        console.log(`Fetching courses for school=${school}, dept=${dept}, AY=${currentAY}, semester=${semester}`);

        if (!dept) return [];

        let query = supabase
            .from('course_feedback_new')
            .select('course_code, course_name')
            .eq('course_offering_dept_name', dept)
            .not('course_code', 'is', null);

        if (currentAY) {
            query = query.eq('current_ay', currentAY);
        }
        if (semester) {
            query = query.eq('semester', semester);
        }

        const allData = await fetchAllRows(query);

        const courseMap = new Map();
        (allData || []).forEach(row => {
            const code = cleanString(row.course_code);
            const name = cleanString(row.course_name);
            if (code && !courseMap.has(code)) {
                courseMap.set(code, {
                    code,
                    name: name || 'Unknown Course'
                });
            }
        });

        const courses = Array.from(courseMap.values()).sort((a, b) => a.code.localeCompare(b.code));
        console.log(`Found ${courses.length} courses for dept=${dept}`);
        return courses;
    } catch (error) {
        console.error('Error in getCoursesBySchoolDeptAndFilters:', error);
        throw error;
    }
};

module.exports = {
    getDistinctSchools,
    getDepartmentsBySchool,
    getSchoolWithDepartments,
    getCurrentAYBySchools,
    getSemestersBySchools,
    getActiveDepartmentsBySchoolAndFilters,
    getCoursesBySchoolDeptAndFilters
};

