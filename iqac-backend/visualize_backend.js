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

function normalizeFilterValue(value) {
	if (value === undefined || value === null) return null;
	const cleaned = value.toString().trim();
	if (!cleaned) return null;
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
		}
	}
	return allData;
}

// Compute overall score for a set of feedback rows using 0-1-2 weighting across all questions
function computeOverallScoreFromRows(rows, questions) {
	if (!rows || rows.length === 0 || !questions || questions.length === 0) {
		return 0;
	}
	const questionsBySection = questions.reduce((acc, q) => {
		if (!acc[q.section_type]) acc[q.section_type] = [];
		acc[q.section_type].push(q);
		return acc;
	}, {});

	let sectionSum = 0;
	let sectionCount = 0;

	Object.values(questionsBySection).forEach(sectionQuestions => {
		let sectionScore = 0;
		let qCount = 0;
		sectionQuestions.forEach(question => {
			const col = question.column_name;
			if (!col) return;
			let opt1 = 0, opt2 = 0, opt3 = 0, total = 0;
			rows.forEach(r => {
				const v = r[col];
				if (v === null || v === undefined || v === '') return;
				const s = String(v).trim();
				if (s === '1') { opt1++; total++; }
				else if (s === '2') { opt2++; total++; }
				else if (s === '3') { opt3++; total++; }
			});
			const maxPossible = total * 2;
			const weighted = (opt1 * 0) + (opt2 * 1) + (opt3 * 2);
			const qScore = maxPossible > 0 ? (weighted / maxPossible) * 100 : 0;
			sectionScore += qScore;
			qCount++;
		});
		if (qCount > 0) {
			sectionSum += sectionScore / qCount;
			sectionCount++;
		}
	});

	return sectionCount > 0 ? Math.round(sectionSum / sectionCount) : 0;
}

// Aggregates performance by arts_or_engg with department breakdown
// Uses the EXACT same flow as department/school report generation
// Returns percent of faculty-course groups with final_score >= 80
async function getArtsVsEnggPerformance(filters = {}) {
	const degree = normalizeFilterValue(filters.degree);
	const batch = normalizeFilterValue(filters.batch);
	const dept = normalizeFilterValue(filters.dept);

	const { getDistinctCourses, getFacultyByFilters } = require('./analysis_backend');
	const { getFeedbackAnalysis } = require('./performance_analysis');

	// Helper to compute overall score - SAME as in report_routes.js
	const computeOverallScore = (analysis) => {
		if (!analysis) return 0;
		const EXCLUDED_SECTIONS = new Set([
			'COURSE CONTENT AND STRUCTURE',
			'STUDENT-CENTRIC FACTORS'
		]);
		const normalizeSectionName = (sectionKey, section) => ((section && section.section_name) || sectionKey || '')
			.toString()
			.trim()
			.toUpperCase();
		const isExcludedSection = (sectionKey, section) => EXCLUDED_SECTIONS.has(normalizeSectionName(sectionKey, section));

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

	// Get all departments from course_allocation (same as report generation)
	// If degree provided, filter by degree; if dept provided, filter by dept
	let deptQuery = supabase
		.from('course_allocation')
		.select('staff_dept, arts_or_engg, degree')
		.not('staff_dept', 'is', null);
	if (degree) {
		deptQuery = deptQuery.eq('degree', degree);
	}
	if (dept) {
		deptQuery = deptQuery.eq('staff_dept', dept);
	}
	const allDeptRows = await fetchAllRows(deptQuery);
	
	// Get unique departments with their arts_or_engg category
	const deptMap = new Map();
	allDeptRows.forEach(row => {
		const d = (row.staff_dept || '').toString().trim();
		if (d) {
			if (!deptMap.has(d)) {
				deptMap.set(d, {
					staff_dept: d,
					arts_or_engg: (row.arts_or_engg || '').toString().trim().toUpperCase() || 'UNKNOWN'
				});
			}
		}
	});

	const deptDegreesMap = new Map();
	allDeptRows.forEach(row => {
		const d = (row.staff_dept || '').toString().trim();
		const deg = normalizeFilterValue(row.degree);
		if (d && deg) {
			if (!deptDegreesMap.has(d)) {
				deptDegreesMap.set(d, new Set());
			}
			deptDegreesMap.get(d).add(deg);
		}
	});

	const departments = Array.from(deptMap.values());
	console.log(`\n=== Category Aggregation: Processing ${departments.length} departments ===`);

	const result = { totals: {}, by_department: {} };
	const DEBUG_DEPT = 'ECE';

	// Process departments in parallel batches for better performance
	const DEPT_BATCH_SIZE = 3; // Process 3 departments at a time (reduced to avoid timeouts)
	for (let i = 0; i < departments.length; i += DEPT_BATCH_SIZE) {
		const deptBatch = departments.slice(i, i + DEPT_BATCH_SIZE);
		await Promise.all(deptBatch.map(async (deptInfo) => {
			try {
		const staffDept = deptInfo.staff_dept;
		const cat = deptInfo.arts_or_engg;

		// Determine which degrees to process for this department
		const degreesForDept = degree
			? [degree]
			: Array.from(deptDegreesMap.get(staffDept) || []);

		const facultyCourseTasks = [];
		const processedKeys = new Set();

		const addCoursesForDegree = async (degValue) => {
			let coursesToProcess = [];
			if (degValue) {
				try {
					coursesToProcess = await getDistinctCourses(degValue, staffDept);
				} catch (err) {
					console.error(`Error fetching courses for degree ${degValue}, dept ${staffDept}:`, err.message);
					return;
				}
			} else {
				const courseMap = new Map();
				const { data: allocationCourses, error: courseErr } = await supabase
					.from('course_allocation')
					.select('course_code, course_name, batch')
					.eq('staff_dept', staffDept)
					.not('course_code', 'is', null);

				if (!courseErr && Array.isArray(allocationCourses)) {
					allocationCourses.forEach(item => {
						const code = (item.course_code || '').toString().trim();
						const name = (item.course_name || '').toString().trim();
						if (!code) return;
						if (!courseMap.has(code)) {
							courseMap.set(code, {
								code,
								name: name || 'Unknown Course',
								batches: []
							});
						}
					});
				}

				coursesToProcess = Array.from(courseMap.values());
			}

			if (!coursesToProcess || coursesToProcess.length === 0) {
				return;
			}

			for (const course of coursesToProcess) {
				const code = course.code ? course.code : course;
				const faculties = await getFacultyByFilters(degValue || null, staffDept, code);
				if (!faculties || faculties.length === 0) {
					continue;
				}

				faculties.forEach(f => {
					const staffId = f.staffid || f.staff_id || '';
					if (!staffId) return;
					const comboKey = `${code}::${staffId}::${degValue || 'ALL'}`;
					if (processedKeys.has(comboKey)) return;
					processedKeys.add(comboKey);
					facultyCourseTasks.push({
						code,
						staffId,
						staffDept,
						degree: degValue || null
					});
				});
			}
		};

		if (degreesForDept.length > 0) {
			for (const degValue of degreesForDept) {
				await addCoursesForDegree(degValue);
			}
		} else {
			await addCoursesForDegree(null);
		}

		if (facultyCourseTasks.length === 0) {
			return;
		}

		let deptTotal = 0;
		let deptGe80 = 0;
		const debugGroups = [];

		// Run all analyses in parallel (batch for performance)
		const BATCH_SIZE = 10; // Process 10 at a time to avoid overwhelming the DB
		for (let i = 0; i < facultyCourseTasks.length; i += BATCH_SIZE) {
			const batch = facultyCourseTasks.slice(i, i + BATCH_SIZE);
			const results = await Promise.all(
				batch.map(async ({ code, staffId, staffDept }) => {
					try {
						const analysis = await getFeedbackAnalysis('', staffDept || '', '', code, staffId);
						if (analysis && analysis.success) {
							const finalScore = computeOverallScore(analysis.analysis);
							return { code, staffId, finalScore, success: true };
						}
						return { code, staffId, success: false };
					} catch (error) {
						console.error(`Error analyzing ${code}::${staffId}:`, error.message);
						return { code, staffId, success: false };
					}
				})
			);

			// Process batch results
			results.forEach(({ code, staffId, finalScore, success }) => {
				if (success) {
					deptTotal++;
					if (finalScore >= 80) {
						deptGe80++;
					}

					// Debug logging for ECE
					if (staffDept.toUpperCase() === DEBUG_DEPT) {
						debugGroups.push({
							key: `${code}::${staffId}`,
							score: finalScore,
							ge80: finalScore >= 80
						});
					}
				}
			});
		}

		// Store results grouped by category -> department
		if (!result.by_department[cat]) {
			result.by_department[cat] = {};
		}
		result.by_department[cat][staffDept.toUpperCase()] = {
			total: deptTotal,
			count_ge_80: deptGe80,
			percent_ge_80: deptTotal > 0 ? Math.round((deptGe80 / deptTotal) * 100) : 0,
			original_name: staffDept
		};

		// Debug logging for ECE
		if (staffDept.toUpperCase() === DEBUG_DEPT) {
			console.log(`\n=== DEBUG: Category ${cat} - Department ${staffDept} ===`);
			console.log(`Total faculty-course groups: ${deptTotal}`);
			console.log(`Groups with Final Score >= 80: ${deptGe80}`);
			const sample = debugGroups
				.sort((a, b) => b.score - a.score)
				.map(g => `${g.key} -> ${g.score}${g.ge80 ? ' (>=80)' : ''}`);
			console.log('Groups (course::staff) with scores:');
			sample.forEach((line, idx) => {
				console.log(`  ${idx + 1}. ${line}`);
			});
		}
			} catch (error) {
				console.error(`Error processing department ${deptInfo.staff_dept}:`, error);
				// Continue with other departments even if one fails
			}
		}));
	}

	// Calculate category totals
	Object.keys(result.by_department).forEach(cat => {
		let totalGroups = 0;
		let ge80 = 0;
		Object.values(result.by_department[cat]).forEach(deptData => {
			totalGroups += deptData.total;
			ge80 += deptData.count_ge_80;
		});
		result.totals[cat] = {
			total: totalGroups,
			count_ge_80: ge80,
			percent_ge_80: totalGroups > 0 ? Math.round((ge80 / totalGroups) * 100) : 0
		};
	});

	return result;
}

// Export functions (keep a single module.exports)
module.exports = {
	getArtsVsEnggPerformance
};

const { getDistinctCourses, getFacultyByFilters } = require('./analysis_backend');
const { getFeedbackAnalysis } = require('./performance_analysis');

// Get visualization data for department report
// Similar to report generation but returns data for visualization instead of Excel/PDF
// Now uses course_feedback_new with course_offering_dept_name
// degree is now optional (for Dean role)
const getDepartmentVisualizationData = async (degree, currentAY, semester, courseOfferingDept) => {
    try {
        console.log(`\n=== Generating Department Visualization Data ===`);
        console.log(`Degree: ${degree || 'N/A (Dean mode)'}`);
        console.log(`Current AY: ${currentAY}`);
        console.log(`Semester: ${semester}`);
        console.log(`Course Offering Dept: ${courseOfferingDept}`);

        if (!currentAY || !semester || !courseOfferingDept) {
            return {
                success: false,
                error: 'Missing required fields: currentAY, semester, courseOfferingDept'
            };
        }

        // Get all courses from course_feedback_new for the filters
        let courses;
        if (degree) {
            // Regular flow: use degree filter
            const { getDistinctCourseNames } = require('./analysis_backend');
            courses = await getDistinctCourseNames(degree, currentAY, semester, courseOfferingDept);
        } else {
            // Dean/HoD flow: use department-based course fetching (no degree filter)
            // For HoD, use getDistinctCourseNamesByDepartment directly
            // For Dean, use getCoursesBySchoolDeptAndFilters (which also works without school)
            const { getDistinctCourseNamesByDepartment } = require('./analysis_backend');
            const { getCoursesBySchoolDeptAndFilters } = require('./school_wise_report');
            // Try department-based first (works for HoD), fallback to school-based (works for Dean)
            try {
                courses = await getDistinctCourseNamesByDepartment(courseOfferingDept, currentAY, semester);
            } catch (err) {
                // Fallback to school-based if department-based fails
                courses = await getCoursesBySchoolDeptAndFilters(null, courseOfferingDept, currentAY, semester);
            }
        }
        
        if (!courses || courses.length === 0) {
            return {
                success: false,
                error: 'No courses found for selected filters'
            };
        }

        console.log(`Found ${courses.length} courses for ${degree ? `degree: ${degree}, ` : ''}currentAY: ${currentAY}, semester: ${semester}, course_offering_dept: ${courseOfferingDept}`);

        // Aggregate analyses per course per faculty
        const groupedData = [];
        
        for (const course of courses) {
            const code = course.code ? course.code : course;
            const name = course.name || '';
            
            console.log(`\nProcessing course: ${code}`);
            
            // Get faculty from course_feedback_new using new filter hierarchy
            const { getFacultyByCourse } = require('./analysis_backend');
            // Get faculty for this course with all filters: degree (optional), currentAY, semester, courseOfferingDept
            const faculties = await getFacultyByCourse(degree || '', currentAY, semester, courseOfferingDept, code, null);
            
            if (faculties.length === 0) {
                console.log(`No faculty found in course_feedback_new for course: ${code}`);
                continue;
            }

            console.log(`Found ${faculties.length} faculty members in course_feedback_new for course ${code}`);

            const facultyAnalyses = (await Promise.all(
                faculties.map(async (f) => {
                    const staffId = f.staffid || f.staff_id || '';
                    if (!staffId) {
                        console.warn(`Skipping faculty with no staffid: ${f.faculty_name}`);
                        return null;
                    }
                    
                    console.log(`Getting feedback analysis for staffid: ${staffId} and course: ${code}`);
                    // Use new filter hierarchy: degree (optional), currentAY, semester, courseOfferingDept, courseCode, staffId
                    const { getFeedbackAnalysis } = require('./performance_analysis');
                    const analysis = await getFeedbackAnalysis(degree || '', currentAY, semester, courseOfferingDept, code, staffId);

                    if (analysis && analysis.success) {
                        // Calculate overall score
                        const overallScore = calculateOverallScore(analysis.analysis);
                        
                        return {
                            // Faculty identification
                            faculty_name: f.faculty_name || analysis.faculty_name || '',
                            staffid: staffId,
                            staff_id: f.staff_id || analysis.staff_id || '',
                            
                            // Course information
                            course_code: code,
                            course_name: name || analysis.course_name || '',
                            
                            // Additional faculty details from analysis
                            ug_or_pg: analysis.ug_or_pg || '',
                            arts_or_engg: analysis.arts_or_engg || '',
                            short_form: analysis.short_form || '',
                            sec: analysis.sec || '',
                            
                            // Performance metrics
                            total_responses: analysis.total_responses,
                            overall_score: overallScore,
                            section_scores: calculateSectionScores(analysis.analysis),
                            cgpa_breakdown: analysis.cgpa_summary || null
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
                    course_name: name,
                    faculties: facultyAnalyses
                });
                console.log(`✓ Added ${facultyAnalyses.length} faculty analyses for course: ${code}`);
            }
        }

        if (groupedData.length === 0) {
            return {
                success: false,
                error: 'No analysis data available for selected filters'
            };
        }

        console.log(`\n=== Visualization Data Summary ===`);
        console.log(`Total courses with data: ${groupedData.length}`);
        console.log(`Total faculty analyzed: ${groupedData.reduce((sum, c) => sum + c.faculties.length, 0)}`);

        return {
            success: true,
            degree: degree || null,
            currentAY,
            semester,
            courseOfferingDept: courseOfferingDept,
            courses: groupedData,
            summary: {
                total_courses: groupedData.length,
                total_faculty: groupedData.reduce((sum, c) => sum + c.faculties.length, 0),
                total_responses: groupedData.reduce((sum, c) => 
                    sum + c.faculties.reduce((s, f) => s + (f.total_responses || 0), 0), 0
                )
            }
        };
    } catch (error) {
        console.error('Error generating visualization data:', error);
        return {
            success: false,
            error: error.message
        };
    }
};

// Calculate overall score from analysis
const calculateOverallScore = (analysis) => {
    if (!analysis) return 0;
    
    const EXCLUDED_SECTIONS = new Set([
        'COURSE CONTENT AND STRUCTURE',
        'STUDENT-CENTRIC FACTORS'
    ]);

    let sectionSum = 0;
    let sectionCount = 0;
    
    Object.entries(analysis).forEach(([sectionKey, section]) => {
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

// Calculate section-wise scores
const calculateSectionScores = (analysis) => {
    if (!analysis) return {};
    
    const EXCLUDED_SECTIONS = new Set([
        'COURSE CONTENT AND STRUCTURE',
        'STUDENT-CENTRIC FACTORS'
    ]);

    const sectionScores = {};
    
    Object.entries(analysis).forEach(([sectionKey, section]) => {
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
            const avgScore = sectionScore / questionCount;
            sectionScores[section.section_name || sectionKey] = Math.round(avgScore);
        }
    });
    
    return sectionScores;
};

// Get school-based radar chart data for Arts vs Engineering categories
// Returns percentage of faculty-course groups with final_score >= 80, grouped by category and department
// Analyzes ALL schools that have departments in the selected arts_or_engg category
async function getSchoolRadarChartData(artsOrEngg, currentAY, semester) {
	try {
		console.log(`\n=== Generating School Radar Chart Data ===`);
		console.log(`Arts_or_Engg: ${artsOrEngg}`);
		console.log(`Current AY: ${currentAY}`);
		console.log(`Semester: ${semester}`);

		if (!artsOrEngg || !currentAY || !semester) {
			return {
				success: false,
				error: 'Missing required fields: artsOrEngg, currentAY, semester'
			};
		}

		// Step 1: Get all departments from profiles table based on selected arts_or_engg
		// Normalize arts_or_engg to uppercase for comparison
		const normalizedArtsOrEngg = artsOrEngg.toUpperCase();
		const { data: profileData, error: profileError } = await supabase
			.from('profiles')
			.select('department, arts_or_engg')
			.not('department', 'is', null)
			.not('arts_or_engg', 'is', null);

		// Filter profiles where arts_or_engg matches (case-insensitive comparison)
		const filteredProfiles = (profileData || []).filter(row => {
			const rowArtsOrEngg = normalizeFilterValue(row.arts_or_engg);
			return rowArtsOrEngg && rowArtsOrEngg.toUpperCase() === normalizedArtsOrEngg;
		});

		if (profileError) {
			console.error('Error fetching departments from profiles:', profileError);
			return {
				success: false,
				error: `Failed to fetch departments from profiles: ${profileError.message}`
			};
		}

		// Get unique departments from filtered profiles
		const profileDepartments = [...new Set(
			filteredProfiles
				.map(row => normalizeFilterValue(row.department))
				.filter(dept => dept && dept !== 'NULL' && dept !== '')
		)];

		if (profileDepartments.length === 0) {
			return {
				success: false,
				error: `No departments found in profiles table with arts_or_engg = ${normalizedArtsOrEngg}`
			};
		}

		console.log(`Found ${profileDepartments.length} departments from profiles table for ${normalizedArtsOrEngg}:`, profileDepartments);

		// Step 2: Map profile departments to course_offering_dept_name in course_feedback_new
		// Check which departments from profiles actually exist in course_feedback_new with the selected filters
		const deptCategoryMap = new Map();
		
		// Query course_feedback_new to find which profile departments match course_offering_dept_name
		let deptQuery = supabase
			.from('course_feedback_new')
			.select('course_offering_dept_name')
			.in('course_offering_dept_name', profileDepartments)
			.eq('current_ay', currentAY)
			.eq('semester', semester)
			.not('course_offering_dept_name', 'is', null);

		const allDeptData = await fetchAllRows(deptQuery);

		// Get unique departments that exist in course_feedback_new
		const departments = [...new Set(
			(allDeptData || [])
				.map(row => normalizeFilterValue(row.course_offering_dept_name))
				.filter(dept => dept && dept !== 'NULL' && dept !== '')
		)];

		if (departments.length === 0) {
			return {
				success: false,
				error: `No departments found in course_feedback_new matching profiles departments for arts_or_engg = ${artsOrEngg}, current_ay = ${currentAY}, semester = ${semester}`
			};
		}

		// Create category map - all departments belong to the selected arts_or_engg category (uppercase)
		departments.forEach(dept => {
			deptCategoryMap.set(dept, normalizedArtsOrEngg);
		});

		console.log(`Mapped ${deptCategoryMap.size} departments from profiles to course_feedback_new for category ${normalizedArtsOrEngg}`);
		console.log(`Departments: ${departments.join(', ')}`);

		const { getFeedbackAnalysis } = require('./performance_analysis');

		// Helper to compute overall score - SAME as in report_routes.js
		const computeOverallScore = (analysis) => {
			if (!analysis) return 0;
			const EXCLUDED_SECTIONS = new Set([
				'COURSE CONTENT AND STRUCTURE',
				'STUDENT-CENTRIC FACTORS'
			]);
			const normalizeSectionName = (sectionKey, section) => ((section && section.section_name) || sectionKey || '')
				.toString()
				.trim()
				.toUpperCase();
			const isExcludedSection = (sectionKey, section) => EXCLUDED_SECTIONS.has(normalizeSectionName(sectionKey, section));

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

		const result = { totals: {}, by_department: {} };

		// Process each department
		// Note: departments are course_offering_dept_name values from course_feedback_new
		for (const dept of departments) {
			try {
				const categoryKey = (deptCategoryMap.get(dept) || 'UNKNOWN').toUpperCase();
				console.log(`\nProcessing department: ${dept} (Category: ${categoryKey}) as course_offering_dept_name`);

				// Get all courses for this department from course_feedback_new
				// Filter by course_offering_dept_name, current_ay, and semester
				let courseQuery = supabase
					.from('course_feedback_new')
					.select('course_code, course_name, degree, staff_id')
					.eq('course_offering_dept_name', dept)
					.eq('current_ay', currentAY)
					.eq('semester', semester)
					.not('course_code', 'is', null)
					.not('staff_id', 'is', null);

				const allCourseData = await fetchAllRows(courseQuery);
				
				if (!allCourseData || allCourseData.length === 0) {
					console.log(`No courses found for department ${dept} with filters: currentAY=${currentAY}, semester=${semester}`);
					continue;
				}

				// Group by course_code and staff_id to get unique faculty-course combinations
				const facultyCourseTasks = [];
				const processedKeys = new Set();

				allCourseData.forEach(item => {
					const code = normalizeFilterValue(item.course_code);
					const staffId = normalizeFilterValue(item.staff_id);
					const degree = normalizeFilterValue(item.degree);
					
					if (!code || !staffId || !degree) return;
					
					const comboKey = `${code}::${staffId}::${degree}`;
					if (processedKeys.has(comboKey)) return;
					processedKeys.add(comboKey);
					
					facultyCourseTasks.push({
						code,
						staffId,
						degree,
						dept
					});
				});

				console.log(`Found ${facultyCourseTasks.length} faculty-course combinations for department ${dept}`);

				if (facultyCourseTasks.length === 0) {
					console.log(`No faculty-course combinations found for department: ${dept}`);
					continue;
				}

				let deptTotal = 0;
				let deptGe80 = 0;

				// Run all analyses in parallel batches
				const BATCH_SIZE = 10;
				for (let i = 0; i < facultyCourseTasks.length; i += BATCH_SIZE) {
					const batch = facultyCourseTasks.slice(i, i + BATCH_SIZE);
					const results = await Promise.all(
						batch.map(async ({ code, staffId, degree, dept }) => {
							try {
								// Use new filter hierarchy: degree, currentAY, semester, courseOfferingDept, courseCode, staffId
								const analysis = await getFeedbackAnalysis(degree, currentAY, semester, dept, code, staffId);
								if (analysis && analysis.success) {
									const finalScore = computeOverallScore(analysis.analysis);
									return { code, staffId, finalScore, success: true };
								}
								return { code, staffId, success: false };
							} catch (error) {
								console.error(`Error analyzing ${code}::${staffId}:`, error.message);
								return { code, staffId, success: false };
							}
						})
					);

					results.forEach(({ success, finalScore }) => {
						if (success) {
							deptTotal++;
							if (finalScore >= 80) {
								deptGe80++;
							}
						}
					});
				}

				// Store results grouped by category -> department
				if (!result.by_department[categoryKey]) {
					result.by_department[categoryKey] = {};
				}
				result.by_department[categoryKey][dept.toUpperCase()] = {
					total: deptTotal,
					count_ge_80: deptGe80,
					percent_ge_80: deptTotal > 0 ? Math.round((deptGe80 / deptTotal) * 100) : 0,
					original_name: dept
				};

				console.log(`✓ Department ${dept}: ${deptGe80}/${deptTotal} (${deptTotal > 0 ? Math.round((deptGe80 / deptTotal) * 100) : 0}%) >= 80`);
			} catch (error) {
				console.error(`Error processing department ${dept}:`, error);
				// Continue with other departments even if one fails
			}
		}

		// Calculate category totals
		Object.keys(result.by_department).forEach(cat => {
			let totalGroups = 0;
			let ge80 = 0;
			Object.values(result.by_department[cat]).forEach(deptData => {
				totalGroups += deptData.total;
				ge80 += deptData.count_ge_80;
			});
			result.totals[cat] = {
				total: totalGroups,
				count_ge_80: ge80,
				percent_ge_80: totalGroups > 0 ? Math.round((ge80 / totalGroups) * 100) : 0
			};
		});

		console.log(`\n=== School Radar Chart Data Summary ===`);
		console.log(`Total categories: ${Object.keys(result.by_department).length}`);
		Object.keys(result.totals).forEach(cat => {
			console.log(`  ${cat}: ${result.totals[cat].percent_ge_80}% (${result.totals[cat].count_ge_80}/${result.totals[cat].total})`);
		});

		return {
			success: true,
			artsOrEngg,
			currentAY,
			semester,
			data: result
		};
	} catch (error) {
		console.error('Error generating school radar chart data:', error);
		return {
			success: false,
			error: error.message
		};
	}
}

// Get distinct arts_or_engg values from profiles table (normalized to uppercase)
async function getDistinctArtsOrEngg() {
	try {
		const { data, error } = await supabase
			.from('profiles')
			.select('arts_or_engg')
			.not('arts_or_engg', 'is', null);

		if (error) {
			console.error('Error fetching arts_or_engg from profiles:', error);
			throw error;
		}

		// Normalize all values to uppercase and get unique values
		const unique = [...new Set(
			(data || [])
				.map(item => {
					const normalized = normalizeFilterValue(item.arts_or_engg);
					return normalized ? normalized.toUpperCase() : null;
				})
				.filter(val => val && val !== 'NULL' && val !== '')
		)].sort();

		console.log(`Found ${unique.length} distinct arts_or_engg values from profiles (uppercase):`, unique);
		return unique;
	} catch (error) {
		console.error('Error in getDistinctArtsOrEngg:', error);
		throw error;
	}
}

// Get distinct current_ay values from course_feedback_new (without degree filter)
async function getDistinctCurrentAYForRadar() {
	try {
		const allData = await fetchAllRows(
			supabase.from('course_feedback_new')
				.select('current_ay')
				.not('current_ay', 'is', null)
		);

		const uniqueAY = [...new Set(
			allData
				.map(item => normalizeFilterValue(item.current_ay))
				.filter(ay => ay !== null)
		)].sort((a, b) => b.localeCompare(a)); // Sort descending (newest first)

		console.log(`Processed unique current_ay (radar): ${uniqueAY.length} academic years`);
		return uniqueAY;
	} catch (error) {
		console.error('Error in getDistinctCurrentAYForRadar:', error);
		throw error;
	}
}

// Get distinct semesters from course_feedback_new (without degree filter)
async function getDistinctSemestersForRadar(currentAY) {
	try {
		let query = supabase.from('course_feedback_new')
			.select('semester')
			.not('semester', 'is', null);
		
		if (currentAY) {
			query = query.eq('current_ay', currentAY);
		}

		const allData = await fetchAllRows(query);

		const uniqueSemesters = [...new Set(
			allData
				.map(item => normalizeFilterValue(item.semester))
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

		console.log(`Processed unique semesters (radar): ${uniqueSemesters.length} semesters`);
		return uniqueSemesters;
	} catch (error) {
		console.error('Error in getDistinctSemestersForRadar:', error);
		throw error;
	}
}

// Merge exports: include all functions on the same export object
module.exports.getDepartmentVisualizationData = getDepartmentVisualizationData;
module.exports.getSchoolRadarChartData = getSchoolRadarChartData;
module.exports.getDistinctArtsOrEngg = getDistinctArtsOrEngg;
module.exports.getDistinctCurrentAYForRadar = getDistinctCurrentAYForRadar;
module.exports.getDistinctSemestersForRadar = getDistinctSemestersForRadar;

