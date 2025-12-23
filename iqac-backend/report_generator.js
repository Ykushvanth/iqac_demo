const ExcelJS = require('exceljs');

const EXCLUDED_SECTIONS = new Set([
    'COURSE CONTENT AND STRUCTURE',
    'STUDENT-CENTRIC FACTORS'
]);

function normalizeSectionName(sectionKey, section) {
    return ((section && section.section_name) || sectionKey || '')
        .toString()
        .trim()
        .toUpperCase();
}

function isExcludedSection(sectionKey, section) {
    return EXCLUDED_SECTIONS.has(normalizeSectionName(sectionKey, section));
}

async function generateReport(analysisData, facultyData) {
    if (!analysisData || !facultyData) {
        throw new Error('Missing required data for report generation');
    }

    if (!analysisData.analysis) {
        throw new Error('Analysis data is missing the analysis section');
    }

    const sections = Object.entries(analysisData.analysis);
    if (sections.length === 0) {
        throw new Error('No sections found in analysis data');
    }

    console.log('Generating report with', sections.length, 'sections');

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'IQAC Feedback System';
    workbook.lastModifiedBy = 'IQAC Feedback System';
    workbook.created = new Date();
    workbook.modified = new Date();
    
    // Add Faculty Details Sheet
    const facultySheet = workbook.addWorksheet('Faculty Details');
    facultySheet.addRow(['Faculty Feedback Analysis Report']);
    facultySheet.addRow(['']);
    facultySheet.addRow(['Faculty Name', facultyData.faculty_name || facultyData.name]);
    facultySheet.addRow(['Staff ID', analysisData.staff_id]);
    facultySheet.addRow(['Course Code', analysisData.course_code]);
    facultySheet.addRow(['Course Name', analysisData.course_name]);
    facultySheet.addRow(['Academic Year', analysisData.current_ay || analysisData.currentAY || '']);
    facultySheet.addRow(['Semester', analysisData.semester || '']);
    facultySheet.addRow(['Total Responses', analysisData.total_responses]);
    facultySheet.addRow(['']);

    // Add CGPA Distribution Section
    facultySheet.addRow(['CGPA Distribution Analysis']);
    facultySheet.addRow(['']);
    
    console.log('CGPA Data in report generator:', {
        hasCgpaSummary: !!analysisData.cgpaSummary,
        hasCategories: !!analysisData.cgpaSummary?.categories,
        hasCgpaAnalysis: !!analysisData.cgpa_analysis,
        hasCgpaSummaryFromAnalysis: !!analysisData.cgpa_summary,
        rawData: analysisData.cgpaSummary || analysisData.cgpa_summary
    });
    
    // Add CGPA headers with formatting
    const cgpaHeaders = facultySheet.addRow(['CGPA Range', 'Count', 'Percentage', 'Negative Comments']);
    cgpaHeaders.eachCell(cell => {
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

    // Get CGPA data - try multiple possible sources
    let cgpaCategories;
    
    if (analysisData.cgpaSummary?.categories) {
        cgpaCategories = analysisData.cgpaSummary.categories;
    } else if (analysisData.cgpa_summary) {
        // Build categories from cgpa_summary object
        const summary = analysisData.cgpa_summary;
        cgpaCategories = [
            {
                range: summary.labels?.['1'] || 'Below 6.0',
                count: summary.counts?.['1'] || 0,
                percentage: summary.percentages?.['1'] ? `${summary.percentages['1']}%` : '0%',
                negativeComments: 0
            },
            {
                range: summary.labels?.['2'] || '6.1 - 8.0',
                count: summary.counts?.['2'] || 0,
                percentage: summary.percentages?.['2'] ? `${summary.percentages['2']}%` : '0%',
                negativeComments: 0
            },
            {
                range: summary.labels?.['3'] || 'Above 8.0',
                count: summary.counts?.['3'] || 0,
                percentage: summary.percentages?.['3'] ? `${summary.percentages['3']}%` : '0%',
                negativeComments: 0
            }
        ];
    } else if (analysisData.cgpa_analysis) {
        // Build from cgpa_analysis data
        cgpaCategories = [
            {
                range: 'Below 6.0',
                count: analysisData.cgpa_analysis['1']?.total_responses || 0,
                percentage: '0%',
                negativeComments: 0
            },
            {
                range: '6.1 - 8.0',
                count: analysisData.cgpa_analysis['2']?.total_responses || 0,
                percentage: '0%',
                negativeComments: 0
            },
            {
                range: 'Above 8.0',
                count: analysisData.cgpa_analysis['3']?.total_responses || 0,
                percentage: '0%',
                negativeComments: 0
            }
        ];
        
        // Calculate percentages
        const totalCount = cgpaCategories.reduce((sum, cat) => sum + cat.count, 0);
        if (totalCount > 0) {
            cgpaCategories.forEach(cat => {
                cat.percentage = `${Math.round((cat.count / totalCount) * 100)}%`;
            });
        }
    } else {
        // Default empty data
        cgpaCategories = [
            { range: 'Below 6.0', count: 0, percentage: '0%', negativeComments: 0 },
            { range: '6.1 - 8.0', count: 0, percentage: '0%', negativeComments: 0 },
            { range: 'Above 8.0', count: 0, percentage: '0%', negativeComments: 0 }
        ];
    }

    console.log('Final CGPA categories:', cgpaCategories);

    // Add CGPA data rows
    cgpaCategories.forEach(category => {
        const row = facultySheet.addRow([
            category.range,
            category.count,
            category.percentage,
            category.negativeComments
        ]);

        row.eachCell(cell => {
            cell.border = {
                top: { style: 'thin' },
                left: { style: 'thin' },
                bottom: { style: 'thin' },
                right: { style: 'thin' }
            };
            cell.alignment = { horizontal: 'center' };
        });
        row.getCell(1).alignment = { horizontal: 'left' };
    });

    facultySheet.addRow(['']);

    // Format Faculty Details
    facultySheet.getCell('A1').font = { size: 16, bold: true };
    facultySheet.getColumn('A').width = 20;
    facultySheet.getColumn('B').width = 40;

    // Add CGPA-wise Detailed Analysis Sheets
    if (analysisData.cgpa_analysis) {
        const cgpaLabels = {
            '1': 'Below 6.0',
            '2': '6.1 - 8.0',
            '3': 'Above 8.0'
        };

        Object.entries(analysisData.cgpa_analysis).forEach(([cgpaKey, cgpaData]) => {
            const cgpaLabel = cgpaLabels[cgpaKey] || `CGPA ${cgpaKey}`;
            const cgpaSheet = workbook.addWorksheet(`CGPA ${cgpaLabel}`);

            // Add header
            cgpaSheet.addRow([`CGPA Range: ${cgpaLabel} - Detailed Analysis`]);
            cgpaSheet.addRow(['']);
            cgpaSheet.addRow(['Total Responses in this CGPA Range:', cgpaData.total_responses]);
            cgpaSheet.addRow(['']);

            cgpaSheet.getCell('A1').font = { size: 14, bold: true };
            cgpaSheet.getColumn('A').width = 25;
            cgpaSheet.getColumn('B').width = 50;

            // Add section-wise analysis for this CGPA range
            Object.entries(cgpaData.analysis || {}).forEach(([sectionKey, section]) => {
                cgpaSheet.addRow([section.section_name || sectionKey]);
                cgpaSheet.getRow(cgpaSheet.rowCount).font = { bold: true, size: 12 };
                cgpaSheet.addRow(['']);

                // Add question headers
                cgpaSheet.addRow(['Question', 'Option', 'Count', 'Percentage']);
                const headerRow = cgpaSheet.getRow(cgpaSheet.rowCount);
                headerRow.font = { bold: true };
                headerRow.fill = {
                    type: 'pattern',
                    pattern: 'solid',
                    fgColor: { argb: 'FFE6E6FA' }
                };

                // Add questions
                Object.values(section.questions || {}).forEach(question => {
                    let firstOption = true;
                    question.options.sort((a, b) => b.count - a.count).forEach(option => {
                        cgpaSheet.addRow([
                            firstOption ? question.question : '',
                            option.text,
                            option.count,
                            option.percentage + '%'
                        ]);
                        firstOption = false;
                    });
                    cgpaSheet.addRow(['']);
                });

                cgpaSheet.addRow(['']);
            });

            // Format columns
            cgpaSheet.getColumn('C').width = 15;
            cgpaSheet.getColumn('D').width = 15;
        });
    }

    // Add section-wise sheets with detailed question analysis
    Object.entries(analysisData.analysis || {}).forEach(([sectionKey, section]) => {
        const shortSectionName = section.section_name?.length > 25 ? 
            section.section_name.substring(0, 25) : (section.section_name || sectionKey);
        const sectionSheet = workbook.addWorksheet(`${shortSectionName}`);

        sectionSheet.addRow([`${section.section_name || sectionKey} - Detailed Analysis`]);
        sectionSheet.addRow(['']);

        // Add headers
        sectionSheet.addRow([
            'Question No.',
            'Question',
            'Question Score (%)',
            'Option',
            'Response Count',
            'Option %',
            'Option Value'
        ]);

        sectionSheet.getRow(3).font = { bold: true };
        sectionSheet.getRow(3).alignment = { horizontal: 'center' };

        let questionNumber = 1;
        const questions = section.questions || {};
        Object.values(questions).forEach(question => {
            let firstOption = true;
            const sortedOptions = [...(question.options || [])].sort((a, b) => b.count - a.count);
            
            sortedOptions.forEach(option => {
                const percentage = (option.count / question.total_responses) * 100;
                const row = sectionSheet.addRow([
                    firstOption ? questionNumber : '',                    // Question number
                    firstOption ? question.question : '',                 // Question text
                    firstOption ? question.score + '%' : '',             // Question score (0-1-2 based)
                    option.text,                                         // Option text
                    option.count,                                        // Response count
                    option.percentage || Math.round(percentage),         // Option percentage
                    option.value || option.label                        // Option value
                ]);
                firstOption = false;
            });

            sectionSheet.addRow([
                '',
                'Total Responses:',
                question.total_responses,
                '',
                '100%',
                ''
            ]);

            sectionSheet.addRow(['']);
            questionNumber++;
        });

        sectionSheet.getColumn(1).width = 12;
        sectionSheet.getColumn(2).width = 50;
        sectionSheet.getColumn(3).width = 30;
        sectionSheet.getColumn(4).width = 15;
        sectionSheet.getColumn(5).width = 15;
        sectionSheet.getColumn(6).width = 12;

        sectionSheet.getCell('A1').font = { size: 14, bold: true };
        sectionSheet.getCell('A1').fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFE6E6FA' }
        };

        const dataRows = sectionSheet.getRows(3, sectionSheet.rowCount);
        if (dataRows) {
            dataRows.forEach(row => {
                row.eachCell(cell => {
                    cell.border = {
                        top: { style: 'thin' },
                        left: { style: 'thin' },
                        bottom: { style: 'thin' },
                        right: { style: 'thin' }
                    };
                    cell.alignment = { vertical: 'middle', horizontal: 'center' };
                });
            });
        }
    });

    // Add CGPA Comparison Sheet
    if (analysisData.cgpa_analysis) {
        const comparisonSheet = workbook.addWorksheet('CGPA Comparison');
        
        comparisonSheet.addRow(['CGPA-wise Performance Comparison']);
        comparisonSheet.addRow(['']);
        
        const cgpaLabels = {
            '1': 'Below 6.0',
            '2': '6.1 - 8.0',
            '3': 'Above 8.0'
        };

        // Create comparison table
        comparisonSheet.addRow(['Section', 'Below 6.0 (%)', '6.1 - 8.0 (%)', 'Above 8.0 (%)', 'Overall (%)']);
        const headerRow = comparisonSheet.getRow(3);
        headerRow.font = { bold: true };
        headerRow.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FF4F81BD' }
        };
        headerRow.font.color = { argb: 'FFFFFFFF' };

        // Calculate scores for each CGPA range and section
        const sectionScores = {};
        
        Object.entries(analysisData.analysis).forEach(([sectionKey, section]) => {
            if (isExcludedSection(sectionKey, section)) {
                return;
            }
            const sectionName = section.section_name || sectionKey;
            sectionScores[sectionName] = { overall: 0 };
            
            // Calculate overall score
            let totalScore = 0;
            let questionCount = 0;
            Object.values(section.questions || {}).forEach(question => {
                let weightedSum = 0;
                let totalResponses = 0;
                question.options.forEach(option => {
                    const value = option.value === 1 ? 0 : option.value === 2 ? 1 : option.value === 3 ? 2 : option.value;
                    weightedSum += option.count * value;
                    totalResponses += option.count;
                });
                const maxScore = totalResponses * 2;
                const qScore = maxScore > 0 ? (weightedSum / maxScore) * 100 : 0;
                totalScore += qScore;
                questionCount++;
            });
            sectionScores[sectionName].overall = questionCount > 0 ? Math.round(totalScore / questionCount) : 0;
        });

        // Calculate CGPA-specific scores
        ['1', '2', '3'].forEach(cgpaKey => {
            const cgpaData = analysisData.cgpa_analysis[cgpaKey];
            if (cgpaData && cgpaData.analysis) {
                Object.entries(cgpaData.analysis).forEach(([sectionKey, section]) => {
                    if (isExcludedSection(sectionKey, section)) {
                        return;
                    }
                    const sectionName = section.section_name || sectionKey;
                    if (!sectionScores[sectionName]) {
                        sectionScores[sectionName] = {};
                    }
                    
                    let totalScore = 0;
                    let questionCount = 0;
                    Object.values(section.questions || {}).forEach(question => {
                        let weightedSum = 0;
                        let totalResponses = 0;
                        question.options.forEach(option => {
                            const value = option.value === 1 ? 0 : option.value === 2 ? 1 : option.value === 3 ? 2 : option.value;
                            weightedSum += option.count * value;
                            totalResponses += option.count;
                        });
                        const maxScore = totalResponses * 2;
                        const qScore = maxScore > 0 ? (weightedSum / maxScore) * 100 : 0;
                        totalScore += qScore;
                        questionCount++;
                    });
                    sectionScores[sectionName][cgpaKey] = questionCount > 0 ? Math.round(totalScore / questionCount) : 0;
                });
            }
        });

        // Add rows for each section
        Object.entries(sectionScores).forEach(([sectionName, scores]) => {
            const row = comparisonSheet.addRow([
                sectionName,
                scores['1'] !== undefined ? scores['1'] : '-',
                scores['2'] !== undefined ? scores['2'] : '-',
                scores['3'] !== undefined ? scores['3'] : '-',
                scores.overall
            ]);

            // Apply color coding
            for (let i = 2; i <= 5; i++) {
                const cell = row.getCell(i);
                const value = cell.value;
                const score = typeof value === 'number' ? value : 0;
                
                cell.border = {
                    top: { style: 'thin' },
                    left: { style: 'thin' },
                    bottom: { style: 'thin' },
                    right: { style: 'thin' }
                };
                
                if (score !== 0 && value !== '-') {
                    if (score < 80) {
                        cell.fill = {
                            type: 'pattern',
                            pattern: 'solid',
                            fgColor: { argb: 'FFFF0000' }
                        };
                        cell.font = { color: { argb: 'FFFFFFFF' }, bold: true };
                    } else {
                        cell.fill = {
                            type: 'pattern',
                            pattern: 'solid',
                            fgColor: { argb: 'FF90EE90' }
                        };
                    }
                }
            }
        });

        comparisonSheet.getColumn('A').width = 30;
        comparisonSheet.getColumn('B').width = 15;
        comparisonSheet.getColumn('C').width = 15;
        comparisonSheet.getColumn('D').width = 15;
        comparisonSheet.getColumn('E').width = 15;
        
        comparisonSheet.getCell('A1').font = { size: 14, bold: true };
    }

    // Add Overall Analysis Sheet with ALL sections dynamically
    const overallSheet = workbook.addWorksheet('Overall Analysis');
    overallSheet.addRow(['Section', 'Score', 'Questions Count']);
    
    let totalScore = 0;
    let totalSections = 0;

    // Add ALL section scores dynamically
    (analysisData.analysis ? Object.entries(analysisData.analysis) : []).forEach(([key, section]) => {
        let sectionScore = 0;
        let questionCount = 0;
        
        Object.values(section.questions || {}).forEach(question => {
            let weightedSum = 0;
            let totalResponses = 0;
            
            (question.options || []).forEach(option => {
                let value;
                if (option.value) {
                    value = option.value === 1 ? 0 : option.value === 2 ? 1 : option.value === 3 ? 2 : option.value;
                } else {
                    value = option.label === 'C' ? 2 : option.label === 'B' ? 1 : 0;
                }
                weightedSum += option.count * value;
                totalResponses += option.count;
            });
            
            const maxPossibleScore = totalResponses * 2;
            const questionScore = maxPossibleScore > 0 
                ? (weightedSum / maxPossibleScore) * 100 
                : 0;
            
            sectionScore += questionScore;
            questionCount++;
        });

        const avgSectionScore = questionCount > 0 ? sectionScore / questionCount : 0;
        if (!isExcludedSection(key, section)) {
            overallSheet.addRow([
                section.section_name || key,
                Math.round(avgSectionScore),
                questionCount
            ]);

            totalScore += avgSectionScore;
            totalSections++;
        }
    });

    overallSheet.addRow(['']);
    const overallScoreValue = totalSections > 0 ? Math.round(totalScore / totalSections) : 0;
    overallSheet.addRow(['Overall Score', overallScoreValue]);

    overallSheet.getColumn('A').width = 30;
    overallSheet.getColumn('B').width = 15;
    overallSheet.getColumn('C').width = 20;
    overallSheet.getRow(1).font = { bold: true };

    // Add Detailed Questions Analysis Sheet
    const questionsSheet = workbook.addWorksheet('Questions Analysis');
    questionsSheet.addRow([
        'Section',
        'Question',
        'Total Responses',
        'Option',
        'Responses',
        'Percentage',
        'Score'
    ]);

    Object.entries(analysisData.analysis).forEach(([sectionKey, section]) => {
        // Add a single heading row for this section grouping
        const sectionTitle = section.section_name || sectionKey;
        const sectionHeadingRow = questionsSheet.addRow([sectionTitle]);
        const sectionHeadingRowNumber = sectionHeadingRow.number;
        questionsSheet.mergeCells(`A${sectionHeadingRowNumber}:G${sectionHeadingRowNumber}`);
        sectionHeadingRow.font = { bold: true, size: 13 };
        sectionHeadingRow.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFE6E6FA' }
        };
        questionsSheet.addRow([]);

        Object.entries(section.questions).forEach(([questionKey, question]) => {
            let firstRow = true;
            const sortedOptions = [...question.options].sort((a, b) => b.count - a.count);
            
            let weightedSum = 0;
            let totalResponses = question.total_responses;
            question.options.forEach(option => {
                const mappedValue = option.value === 1 ? 0 : option.value === 2 ? 1 : option.value === 3 ? 2 : option.value;
                weightedSum += option.count * mappedValue;
            });
            const questionScore = (weightedSum / (totalResponses * 2)) * 100;

            sortedOptions.forEach(option => {
                const percentage = (option.count / question.total_responses) * 100;
                const row = questionsSheet.addRow([
                    firstRow ? (section.section_name || sectionKey) : '',
                    firstRow ? question.question : '',
                    firstRow ? question.total_responses : '',
                    option.text,
                    option.count,
                    Math.round(percentage),
                    option.value
                ]);

                row.eachCell(cell => {
                    cell.alignment = { vertical: 'middle', horizontal: 'center' };
                    cell.border = {
                        top: { style: 'thin' },
                        left: { style: 'thin' },
                        bottom: { style: 'thin' },
                        right: { style: 'thin' }
                    };
                });

                const percentageCell = row.getCell(6);
                if (percentage >= 75) {
                    percentageCell.fill = {
                        type: 'pattern',
                        pattern: 'solid',
                        fgColor: { argb: 'FFE6FFE6' }
                    };
                } else if (percentage >= 50) {
                    percentageCell.fill = {
                        type: 'pattern',
                        pattern: 'solid',
                        fgColor: { argb: 'FFFFF2CC' }
                    };
                } else {
                    percentageCell.fill = {
                        type: 'pattern',
                        pattern: 'solid',
                        fgColor: { argb: 'FFFFE6E6' }
                    };
                }

                firstRow = false;
            });

            const summaryRow = questionsSheet.addRow([
                '',
                'Question Summary',
                totalResponses,
                `Average Score: ${Math.round(questionScore)}%`,
                '',
                '',
                ''
            ]);
            
            summaryRow.font = { bold: true };
            summaryRow.fill = {
                type: 'pattern',
                pattern: 'solid',
                fgColor: { argb: 'FFE6E6FA' }
            };

            questionsSheet.addRow([]);
        });
    });

    questionsSheet.getColumn('A').width = 25;
    questionsSheet.getColumn('B').width = 50;
    questionsSheet.getColumn('C').width = 15;
    questionsSheet.getColumn('D').width = 30;
    questionsSheet.getColumn('E').width = 15;
    questionsSheet.getColumn('F').width = 15;
    questionsSheet.getColumn('G').width = 15;

    const headerRow = questionsSheet.getRow(1);
    headerRow.font = { bold: true, size: 12 };
    headerRow.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF4F81BD' }
    };
    headerRow.font.color = { argb: 'FFFFFFFF' };
    headerRow.height = 25;

    return workbook;
}

// Generate a department-wise consolidated report (flat table with question columns)
// async function generateDepartmentReport(filters, groupedData) {
//     const ExcelJS = require('exceljs');
//     const workbook = new ExcelJS.Workbook();
//     workbook.creator = 'IQAC Feedback System';
//     workbook.lastModifiedBy = 'IQAC Feedback System';
//     workbook.created = new Date();
//     workbook.modified = new Date();

//     const sheet = workbook.addWorksheet('Department Report');

//     sheet.addRow(['Department-wise Feedback Analysis Report']);
//     sheet.addRow(['']);
//     sheet.addRow(['Degree', filters.degree || '']);
//     sheet.addRow(['Department', filters.dept || '']);
//     sheet.addRow(['Batch', filters.batch || '']);
//     sheet.addRow(['Generated On', new Date().toLocaleString()]);
//     sheet.addRow(['']);
//     sheet.getCell('A1').font = { size: 16, bold: true };

//     const courseDetailHeaders = [
//         'Dept', 'Degree', 'UG_or_PG', 'Arts_or_Engg', 'Short_Form',
//         'Course_Code', 'Course_Name', 'Staff_id', 'Faculty_Name', 'Name'
//     ];

//     const findFirstAnalysis = () => {
//         for (const course of groupedData) {
//             for (const f of course.faculties) {
//                 if (f.analysisData && f.analysisData.analysis) return f.analysisData;
//             }
//         }
//         return null;
//     };

//     const first = findFirstAnalysis();
//     const questionHeaders = [];
//     const sectionHeaders = [];
    
//     if (first && first.analysis) {
//         Object.values(first.analysis).forEach(section => {
//             Object.values(section.questions || {}).forEach(q => {
//                 questionHeaders.push(q.question);
//             });
//         });

//         Object.entries(first.analysis).forEach(([key, section]) => {
//             sectionHeaders.push(`${section.section_name || key} Avg`);
//         });
//     }

//     const scoreHeaders = ['Average'];

//     sheet.addRow([...courseDetailHeaders, ...questionHeaders, ...sectionHeaders, ...scoreHeaders]);
//     sheet.getRow(sheet.rowCount).font = { bold: true };

//     const widths = [10, 12, 10, 12, 12, 14, 30, 14, 22, 18];
//     for (let i = 0; i < widths.length; i++) {
//         sheet.getColumn(i + 1).width = widths[i];
//     }

//     const computeOverall = (analysisData) => {
//         if (!analysisData || !analysisData.analysis) return { overall: 0, perQuestion: [], perSection: [] };
//         const perQuestion = [];
//         const perSection = [];
//         let sectionSum = 0;
//         let sectionCount = 0;
        
//         Object.values(analysisData.analysis).forEach(section => {
//             let sectionScore = 0;
//             let qCount = 0;
//             Object.values(section.questions || {}).forEach(q => {
//                 let weightedSum = 0;
//                 let totalResponses = 0;
//                 (q.options || []).forEach(o => {
//                     const mapped = o.value === 1 ? 0 : o.value === 2 ? 1 : o.value === 3 ? 2 : o.value;
//                     weightedSum += o.count * mapped;
//                     totalResponses += o.count;
//                 });
//                 const maxScore = totalResponses * 2;
//                 const qScore = maxScore > 0 ? (weightedSum / maxScore) * 100 : 0;
//                 sectionScore += qScore;
//                 qCount++;
                
//                 const positive = (q.options || []).find(o => o.value === 3);
//                 const posPct = positive && q.total_responses > 0
//                     ? Math.round((positive.count / q.total_responses) * 100)
//                     : (q.options && q.options.length > 0
//                         ? Math.round(Math.max(...q.options.map(o => (o.count / (q.total_responses || 1)) * 100)))
//                         : 0);
//                 perQuestion.push(posPct);
//             });
//             const avgSection = qCount > 0 ? sectionScore / qCount : 0;
//             sectionSum += avgSection;
//             sectionCount++;
//             perSection.push(Math.round(avgSection));
//         });
//         const overall = sectionCount > 0 ? Math.round(sectionSum / sectionCount) : 0;
//         return { overall, perQuestion, perSection };
//     };

//     const dataStartRow = sheet.rowCount + 1;
    
//     groupedData.forEach(course => {
//         course.faculties.forEach(f => {
//             const meta = [
//                 filters.dept || '',
//                 filters.degree || '',
//                 f.analysisData?.ug_or_pg || '',
//                 f.analysisData?.arts_or_engg || '',
//                 f.analysisData?.short_form || '',
//                 (f.analysisData?.course_code || course.course_code || ''),
//                 course.course_name || '',
//                 f.staff_id || '',
//                 f.faculty_name || '',
//                 f.faculty_name || ''
//             ];
//             const { overall, perQuestion, perSection } = computeOverall(f.analysisData);
//             const row = [...meta];
            
//             const questionScoreStartCol = meta.length + 1;
//             const sectionScoreStartCol = questionScoreStartCol + questionHeaders.length;
//             const overallScoreCol = sectionScoreStartCol + sectionHeaders.length;
            
//             for (let i = 0; i < questionHeaders.length; i++) {
//                 row.push(perQuestion[i] !== undefined ? perQuestion[i] + '%' : '');
//             }
            
//             for (let i = 0; i < sectionHeaders.length; i++) {
//                 row.push(perSection[i] !== undefined ? perSection[i] + '%' : '');
//             }
//             row.push(overall + '%');
            
//             const addedRow = sheet.addRow(row);
            
//             for (let i = 0; i < questionHeaders.length; i++) {
//                 const colIndex = questionScoreStartCol + i;
//                 const cell = addedRow.getCell(colIndex);
//                 const score = perQuestion[i];
                
//                 if (score !== undefined) {
//                     cell.border = {
//                         top: { style: 'thin' },
//                         left: { style: 'thin' },
//                         bottom: { style: 'thin' },
//                         right: { style: 'thin' }
//                     };
                    
//                     if (score < 80) {
//                         cell.fill = {
//                             type: 'pattern',
//                             pattern: 'solid',
//                             fgColor: { argb: 'FFFF0000' }
//                         };
//                         cell.font = { color: { argb: 'FFFFFFFF' }, bold: true };
//                     } else {
//                         cell.fill = {
//                             type: 'pattern',
//                             pattern: 'solid',
//                             fgColor: { argb: 'FF90EE90' }
//                         };
//                     }
//                 }
//             }
            
//             for (let i = 0; i < sectionHeaders.length; i++) {
//                 const colIndex = sectionScoreStartCol + i;
//                 const cell = addedRow.getCell(colIndex);
//                 const score = perSection[i];
                
//                 if (score !== undefined) {
//                     cell.border = {
//                         top: { style: 'thin' },
//                         left: { style: 'thin' },
//                         bottom: { style: 'thin' },
//                         right: { style: 'thin' }
//                     };
                    
//                     if (score < 80) {
//                         cell.fill = {
//                             type: 'pattern',
//                             pattern: 'solid',
//                             fgColor: { argb: 'FFFF0000' }
//                         };
//                         cell.font = { color: { argb: 'FFFFFFFF' }, bold: true };
//                     } else {
//                         cell.fill = {
//                             type: 'pattern',
//                             pattern: 'solid',
//                             fgColor: { argb: 'FF90EE90' }
//                         };
//                     }
//                 }
//             }
            
//             const overallCell = addedRow.getCell(overallScoreCol);
//             if (overall !== undefined) {
//                 overallCell.border = {
//                     top: { style: 'thin' },
//                     left: { style: 'thin' },
//                     bottom: { style: 'thin' },
//                     right: { style: 'thin' }
//                 };
                
//                 if (overall < 80) {
//                     overallCell.fill = {
//                         type: 'pattern',
//                         pattern: 'solid',
//                         fgColor: { argb: 'FFFF0000' }
//                     };
//                     overallCell.font = { color: { argb: 'FFFFFFFF' }, bold: true };
//                 } else {
//                     overallCell.fill = {
//                         type: 'pattern',
//                         pattern: 'solid',
//                         fgColor: { argb: 'FF90EE90' }
//                     };
//                 }
//             }
            
//             for (let i = 1; i <= meta.length; i++) {
//                 const cell = addedRow.getCell(i);
//                 cell.border = {
//                     top: { style: 'thin' },
//                     left: { style: 'thin' },
//                     bottom: { style: 'thin' },
//                     right: { style: 'thin' }
//                 };
//                 cell.alignment = { vertical: 'middle', horizontal: 'center' };
//             }
//         });
//     });
    
//     sheet.addRow(['']);
//     sheet.addRow(['']);
//     const legendRow1 = sheet.addRow(['Legend:']);
//     legendRow1.font = { bold: true };
    
//     const redLegend = sheet.addRow(['Score < 80%', 'Needs Improvement']);
//     redLegend.getCell(1).fill = {
//         type: 'pattern',
//         pattern: 'solid',
//         fgColor: { argb: 'FFFF0000' }
//     };
//     redLegend.getCell(1).font = { color: { argb: 'FFFFFFFF' }, bold: true };
    
//     const greenLegend = sheet.addRow(['Score ≥ 80%', 'Good Performance']);
//     greenLegend.getCell(1).fill = {
//         type: 'pattern',
//         pattern: 'solid',
//         fgColor: { argb: 'FF90EE90' }
//     };

//     return workbook;
// }

// Generate a department-wise consolidated report (flat table with question columns)
async function generateDepartmentReport(filters, groupedData) {
    const ExcelJS = require('exceljs');
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'IQAC Feedback System';
    workbook.lastModifiedBy = 'IQAC Feedback System';
    workbook.created = new Date();
    workbook.modified = new Date();

    const sheet = workbook.addWorksheet('Department Report');

    sheet.addRow(['Department-wise Feedback Analysis Report']);
    sheet.addRow(['']);
    sheet.addRow(['Degree', filters.degree || '']);
    sheet.addRow(['Department', filters.courseOfferingDept || filters.dept || '']);
    sheet.addRow(['Batch', filters.batch || '']);
    sheet.addRow(['Academic Year', filters.currentAY || '']);
    sheet.addRow(['Semester', filters.semester || '']);
    sheet.addRow(['Generated On', new Date().toLocaleString()]);
    sheet.addRow(['']);
    sheet.getCell('A1').font = { size: 16, bold: true };

    const courseDetailHeaders = [
    'Dept', 'Degree', 'UG_or_PG', 'Arts_or_Engg', 'Short_Form',
    'Course_Code', 'Course_Name', 'Batch', 'Academic_Year', 'Semester',
    'Staff_id', 'Faculty_Name'
];

    const findFirstAnalysis = () => {
        for (const course of groupedData) {
            for (const f of course.faculties) {
                if (f.analysisData && f.analysisData.analysis) return f.analysisData;
            }
        }
        return null;
    };

    const first = findFirstAnalysis();
    const questionHeaders = [];
    const sectionHeaders = [];
    const sectionGroups = [];
    
    if (first && first.analysis) {
        Object.entries(first.analysis).forEach(([key, section]) => {
            const questions = Object.values(section.questions || {});
            const count = questions.length;
            // Keep original section names, but mark excluded sections
            const isExcluded = isExcludedSection(key, section);
            const sectionTitle = section.section_name || key;
            sectionGroups.push({ title: sectionTitle, count, isExcluded, originalKey: key, originalSection: section });
            questions.forEach(q => questionHeaders.push(q.question));
        });

        Object.entries(first.analysis).forEach(([key, section]) => {
            if (!isExcludedSection(key, section)) {
                sectionHeaders.push(`${section.section_name || key} Avg`);
            }
        });
    }

    const scoreHeaders = ['Final Score'];
    const cgpaHeaders = ['CGPA <6 (%)', 'CGPA 6-7.99 (%)', 'CGPA ≥8 (%)'];

    // Add two-level heading rows: parent "Non-scoring sections" and child individual section names
    if (sectionGroups.length > 0) {
        const totalCols = courseDetailHeaders.length + questionHeaders.length + sectionHeaders.length + scoreHeaders.length + cgpaHeaders.length;
        
        // First row: Parent heading with "Non-scoring sections" ONLY over excluded sections
        const parentHeadingRowValues = new Array(totalCols).fill('');
        // Second row: Child headings with individual section names ONLY for excluded sections
        const childHeadingRowValues = new Array(totalCols).fill('');

        let questionStartCol = courseDetailHeaders.length + 1; // 1-based for Excel
        let colPointer = questionStartCol;
        let nonScoringStartCol = null;
        let nonScoringEndCol = null;
        
        sectionGroups.forEach((g, index) => {
            const startCol = colPointer;
            const endCol = startCol + Math.max(g.count - 1, 0);
            
            if (g.isExcluded) {
                // Track the range for non-scoring sections to merge them in parent row
                if (nonScoringStartCol === null) {
                    nonScoringStartCol = startCol;
                }
                nonScoringEndCol = endCol;
                // Set individual section name ONLY in child row (not in parent row)
                childHeadingRowValues[startCol - 1] = g.title;
            } else {
                // For non-excluded sections, set the title ONLY in parent row (no child row needed)
                if (nonScoringStartCol !== null && nonScoringEndCol !== null) {
                    // Set "Non-scoring sections" in parent row for excluded sections
                    parentHeadingRowValues[nonScoringStartCol - 1] = 'Non-scoring sections';
                    nonScoringStartCol = null;
                    nonScoringEndCol = null;
                }
                parentHeadingRowValues[startCol - 1] = g.title;
                // Leave child row empty for non-excluded sections
            }
            colPointer = endCol + 1;
        });
        
        // If we have excluded sections at the end, set the parent title
        if (nonScoringStartCol !== null && nonScoringEndCol !== null) {
            parentHeadingRowValues[nonScoringStartCol - 1] = 'Non-scoring sections';
        }

        // Add parent heading row
        const parentHeadingRow = sheet.addRow(parentHeadingRowValues);
        
        // Add child heading row
        const childHeadingRow = sheet.addRow(childHeadingRowValues);

        // Merge and style parent row
        colPointer = questionStartCol;
        nonScoringStartCol = null;
        nonScoringEndCol = null;
        
        sectionGroups.forEach((g, index) => {
            const startCol = colPointer;
            const endCol = startCol + Math.max(g.count - 1, 0);
            
            if (g.isExcluded) {
                if (nonScoringStartCol === null) {
                    nonScoringStartCol = startCol;
                }
                nonScoringEndCol = endCol;
            } else {
                // If we were tracking excluded sections, merge them in parent row
                if (nonScoringStartCol !== null && nonScoringEndCol !== null) {
                    sheet.mergeCells(parentHeadingRow.number, nonScoringStartCol, parentHeadingRow.number, nonScoringEndCol);
                    const parentCell = parentHeadingRow.getCell(nonScoringStartCol);
                    parentCell.value = 'Non-scoring sections';
                    parentCell.font = { bold: true };
                    parentCell.alignment = { horizontal: 'center' };
                    parentCell.fill = {
                        type: 'pattern',
                        pattern: 'solid',
                        fgColor: { argb: 'FFE6E6FA' }
                    };
                    nonScoringStartCol = null;
                    nonScoringEndCol = null;
                }
                
                // Merge non-excluded sections in parent row
                sheet.mergeCells(parentHeadingRow.number, startCol, parentHeadingRow.number, endCol);
                const parentCell = parentHeadingRow.getCell(startCol);
                parentCell.font = { bold: true };
                parentCell.alignment = { horizontal: 'center' };
                parentCell.fill = {
                    type: 'pattern',
                    pattern: 'solid',
                    fgColor: { argb: 'FFE6E6FA' }
                };
            }
            
            colPointer = endCol + 1;
        });
        
        // If excluded sections are at the end, merge them in parent row
        if (nonScoringStartCol !== null && nonScoringEndCol !== null) {
            sheet.mergeCells(parentHeadingRow.number, nonScoringStartCol, parentHeadingRow.number, nonScoringEndCol);
            const parentCell = parentHeadingRow.getCell(nonScoringStartCol);
            parentCell.value = 'Non-scoring sections';
            parentCell.font = { bold: true };
            parentCell.alignment = { horizontal: 'center' };
            parentCell.fill = {
                type: 'pattern',
                pattern: 'solid',
                fgColor: { argb: 'FFE6E6FA' }
            };
        }

        // Merge and style child row (individual section names ONLY for excluded sections)
        colPointer = questionStartCol;
        sectionGroups.forEach((g, index) => {
            const startCol = colPointer;
            const endCol = startCol + Math.max(g.count - 1, 0);
            
            // Merge ONLY excluded sections in child row (non-excluded sections have empty child row)
            if (g.isExcluded) {
                const childCell = childHeadingRow.getCell(startCol);
                // Get the value that should be in this cell
                const expectedValue = childHeadingRowValues[startCol - 1];
                
                // Ensure the cell has the value set
                if (expectedValue && expectedValue.toString().trim() !== '') {
                    childCell.value = expectedValue;
                    
                    // Clear values from other cells in the merge range (keep only first cell)
                    if (endCol > startCol) {
                        for (let col = startCol + 1; col <= endCol; col++) {
                            const clearCell = childHeadingRow.getCell(col);
                            if (clearCell.value === expectedValue) {
                                clearCell.value = '';
                            }
                        }
                    }
                    
                    // Only merge if there's more than one column (can't merge a single cell)
                    if (endCol > startCol) {
                        try {
                            sheet.mergeCells(childHeadingRow.number, startCol, childHeadingRow.number, endCol);
                        } catch (e) {
                            // If merge fails (e.g., cells already merged or overlapping), just style the first cell
                            console.warn(`Could not merge cells for child section ${g.title} (${startCol}-${endCol}):`, e.message);
                        }
                    }
                    // Style the cell regardless of merge success
                    childCell.font = { bold: true };
                    childCell.alignment = { horizontal: 'center' };
                    childCell.fill = {
                        type: 'pattern',
                        pattern: 'solid',
                        fgColor: { argb: 'FFF0F0F0' } // Slightly lighter gray for child row
                    };
                }
            }
            
            colPointer = endCol + 1;
        });
    }

    // Add the actual column header row (questions, section averages, cgpa columns, overall)
    sheet.addRow([...courseDetailHeaders, ...questionHeaders, ...sectionHeaders, ...cgpaHeaders, ...scoreHeaders]);
    sheet.getRow(sheet.rowCount).font = { bold: true };

    const widths = [10, 12, 10, 12, 12, 14, 30, 10, 15, 12, 14, 22, 18];
    for (let i = 0; i < widths.length; i++) {
        sheet.getColumn(i + 1).width = widths[i];
    }

    // FIXED: Compute proper weighted scores for all three options
    const computeOverall = (analysisData) => {
        if (!analysisData || !analysisData.analysis) return { overall: 0, perQuestion: [], perSection: [] };
        const perQuestion = [];
        const perSection = [];
        let sectionSum = 0;
        let sectionCount = 0;
        
        Object.entries(analysisData.analysis).forEach(([sectionKey, section]) => {
            let sectionScore = 0;
            let qCount = 0;
            
            Object.values(section.questions || {}).forEach(q => {
                let weightedSum = 0;
                let totalResponses = 0;
                
                // Calculate weighted score using 0-1-2 scale for all three options
                (q.options || []).forEach(o => {
                    // Map option values: 1->0, 2->1, 3->2
                    const mapped = o.value === 1 ? 0 : o.value === 2 ? 1 : o.value === 3 ? 2 : o.value;
                    weightedSum += o.count * mapped;
                    totalResponses += o.count;
                });
                
                // Calculate question score as percentage (0-100%)
                const maxScore = totalResponses * 2; // Maximum possible score (all responses = 2)
                const qScore = maxScore > 0 ? (weightedSum / maxScore) * 100 : 0;
                
                // Store rounded question score
                const questionScore = Math.round(qScore);
                perQuestion.push(questionScore);
                
                // Add to section total
                sectionScore += qScore;
                qCount++;
            });
            
            if (!isExcludedSection(sectionKey, section)) {
                // Calculate section average
                const avgSection = qCount > 0 ? sectionScore / qCount : 0;
                sectionSum += avgSection;
                sectionCount++;
                perSection.push(Math.round(avgSection));
            }
        });
        
        // Calculate overall average across all sections
        const overall = sectionCount > 0 ? Math.round(sectionSum / sectionCount) : 0;
        return { overall, perQuestion, perSection };
    };

    const dataStartRow = sheet.rowCount + 1;
    
    groupedData.forEach(course => {
        course.faculties.forEach(f => {
            // Format batches: if multiple, join with comma; if one, show that one; if none, show empty
            let batchDisplay = '';
            if (f.batches && Array.isArray(f.batches) && f.batches.length > 0) {
                batchDisplay = f.batches.length > 1 ? f.batches.join(', ') : f.batches[0];
            } else if (f.analysisData?.unique_batches && Array.isArray(f.analysisData.unique_batches) && f.analysisData.unique_batches.length > 0) {
                batchDisplay = f.analysisData.unique_batches.length > 1 ? f.analysisData.unique_batches.join(', ') : f.analysisData.unique_batches[0];
            } else if (f.analysisData?.batch) {
                batchDisplay = f.analysisData.batch;
            }
            
            // Format degrees: if multiple, join with comma; if one, show that one; if none, show filter degree
            let degreeDisplay = '';
            if (f.degrees && Array.isArray(f.degrees) && f.degrees.length > 0) {
                degreeDisplay = f.degrees.length > 1 ? f.degrees.join(', ') : f.degrees[0];
            } else if (f.analysisData?.unique_degrees && Array.isArray(f.analysisData.unique_degrees) && f.analysisData.unique_degrees.length > 0) {
                degreeDisplay = f.analysisData.unique_degrees.length > 1 ? f.analysisData.unique_degrees.join(', ') : f.analysisData.unique_degrees[0];
            } else {
                // Fallback to filter degree if no degrees found for faculty
                degreeDisplay = filters.degree || '';
            }
            
            const meta = [
                filters.courseOfferingDept || filters.dept || f.analysisData?.course_offering_dept_name || '',
                degreeDisplay,
                f.analysisData?.ug_or_pg || '',
                f.analysisData?.arts_or_engg || '',
                f.analysisData?.short_form || '',
                (f.analysisData?.course_code || course.course_code || ''),
                course.course_name || '',
                batchDisplay,
                f.analysisData?.current_ay || filters.currentAY || '',
                f.analysisData?.semester || filters.semester || '',
                (f.staffid || f.staff_id || ''),
                f.faculty_name || '',
                
            ];
            const { overall, perQuestion, perSection } = computeOverall(f.analysisData);
            const row = [...meta];
            
            const questionScoreStartCol = meta.length + 1;
            const sectionScoreStartCol = questionScoreStartCol + questionHeaders.length;
            const overallScoreCol = sectionScoreStartCol + sectionHeaders.length + cgpaHeaders.length;
            
            // Add question scores (now properly calculated with all options)
            for (let i = 0; i < questionHeaders.length; i++) {
                row.push(perQuestion[i] !== undefined ? perQuestion[i] + '%' : '');
            }
            
            // Add section scores
            for (let i = 0; i < sectionHeaders.length; i++) {
                row.push(perSection[i] !== undefined ? perSection[i] + '%' : '');
            }

            // Append CGPA-wise OVERALL PERCENTAGES (per faculty) before overall
            // We compute category-wise overall score by averaging question scores across all sections
            const cgpaAnalysis = f.analysisData?.cgpa_analysis;
            if (cgpaAnalysis && typeof cgpaAnalysis === 'object') {
                const computeOverallFromSubset = (subset) => {
                    if (!subset || !subset.analysis) return null;
                    let sectionCount = 0;
                    let sectionSum = 0;
                    Object.entries(subset.analysis).forEach(([sectionKey, section]) => {
                        if (isExcludedSection(sectionKey, section)) {
                            return;
                        }
                        let sectionScore = 0;
                        let qCount = 0;
                        Object.values(section.questions || {}).forEach(q => {
                            let weightedSum = 0;
                            let totalResp = 0;
                            (q.options || []).forEach(o => {
                                const mapped = o.value === 1 ? 0 : o.value === 2 ? 1 : o.value === 3 ? 2 : o.value;
                                weightedSum += o.count * mapped;
                                totalResp += o.count;
                            });
                            const maxScore = totalResp * 2;
                            const qScore = maxScore > 0 ? (weightedSum / maxScore) * 100 : 0;
                            sectionScore += qScore;
                            qCount++;
                        });
                        const avgSection = qCount > 0 ? sectionScore / qCount : 0;
                        sectionSum += avgSection;
                        sectionCount++;
                    });
                    return sectionCount > 0 ? Math.round(sectionSum / sectionCount) : 0;
                };

                const lowPct = computeOverallFromSubset(cgpaAnalysis['1']);
                const midPct = computeOverallFromSubset(cgpaAnalysis['2']);
                const highPct = computeOverallFromSubset(cgpaAnalysis['3']);

                row.push(lowPct ?? 0);
                row.push(midPct ?? 0);
                row.push(highPct ?? 0);
            } else if (f.analysisData?.cgpa_breakdown) {
                // Fallback: if only counts are available, show percentages based on totals
                const cg = f.analysisData.cgpa_breakdown;
                const total = (cg.total ?? ((cg.low || 0) + (cg.mid || 0) + (cg.high || 0))) || 0;
                const pct = (n) => total > 0 ? Math.round((n / total) * 100) : 0;
                row.push(pct(cg.low || 0));
                row.push(pct(cg.mid || 0));
                row.push(pct(cg.high || 0));
            } else {
                row.push('', '', '');
            }

            // Add overall score at the end
            row.push(overall + '%');
            
            const addedRow = sheet.addRow(row);
            
            // Apply color coding to question scores
            for (let i = 0; i < questionHeaders.length; i++) {
                const colIndex = questionScoreStartCol + i;
                const cell = addedRow.getCell(colIndex);
                const score = perQuestion[i];
                
                if (score !== undefined) {
                    cell.border = {
                        top: { style: 'thin' },
                        left: { style: 'thin' },
                        bottom: { style: 'thin' },
                        right: { style: 'thin' }
                    };
                    
                    if (score < 80) {
                        cell.fill = {
                            type: 'pattern',
                            pattern: 'solid',
                            fgColor: { argb: 'FFFF0000' } // Red background
                        };
                        cell.font = { color: { argb: 'FFFFFFFF' }, bold: true }; // White text
                    } else {
                        cell.fill = {
                            type: 'pattern',
                            pattern: 'solid',
                            fgColor: { argb: 'FF90EE90' } // Light green
                        };
                    }
                }
            }
            
            // Apply color coding to section average scores
            for (let i = 0; i < sectionHeaders.length; i++) {
                const colIndex = sectionScoreStartCol + i;
                const cell = addedRow.getCell(colIndex);
                const score = perSection[i];
                
                if (score !== undefined) {
                    cell.border = {
                        top: { style: 'thin' },
                        left: { style: 'thin' },
                        bottom: { style: 'thin' },
                        right: { style: 'thin' }
                    };
                    
                    if (score < 80) {
                        cell.fill = {
                            type: 'pattern',
                            pattern: 'solid',
                            fgColor: { argb: 'FFFF0000' } // Red background
                        };
                        cell.font = { color: { argb: 'FFFFFFFF' }, bold: true }; // White text, bold
                    } else {
                        cell.fill = {
                            type: 'pattern',
                            pattern: 'solid',
                            fgColor: { argb: 'FF90EE90' } // Light green
                        };
                    }
                }
            }
            
            // Apply color coding to CGPA columns (placed before overall)
            const cgpaStartCol = sectionScoreStartCol + sectionHeaders.length;
            for (let i = 0; i < cgpaHeaders.length; i++) {
                const colIndex = cgpaStartCol + i;
                const cell = addedRow.getCell(colIndex);
                const score = row[colIndex - 1];
                
                cell.border = {
                    top: { style: 'thin' },
                    left: { style: 'thin' },
                    bottom: { style: 'thin' },
                    right: { style: 'thin' }
                };
                
                if (typeof score === 'number') {
                    if (score < 80) {
                        cell.fill = {
                            type: 'pattern',
                            pattern: 'solid',
                            fgColor: { argb: 'FFFF0000' }
                        };
                        cell.font = { color: { argb: 'FFFFFFFF' }, bold: true };
                    } else {
                        cell.fill = {
                            type: 'pattern',
                            pattern: 'solid',
                            fgColor: { argb: 'FF90EE90' }
                        };
                    }
                }
            }
            
            // Apply color coding to overall score
            const overallCell = addedRow.getCell(overallScoreCol);
            if (overall !== undefined) {
                overallCell.border = {
                    top: { style: 'thin' },
                    left: { style: 'thin' },
                    bottom: { style: 'thin' },
                    right: { style: 'thin' }
                };
                
                if (overall < 80) {
                    overallCell.fill = {
                        type: 'pattern',
                        pattern: 'solid',
                        fgColor: { argb: 'FFFF0000' } // Red background
                    };
                    overallCell.font = { color: { argb: 'FFFFFFFF' }, bold: true }; // White text, bold
                } else {
                    overallCell.fill = {
                        type: 'pattern',
                        pattern: 'solid',
                        fgColor: { argb: 'FF90EE90' } // Light green
                    };
                }
            }
            
            // Apply borders to metadata columns
            for (let i = 1; i <= meta.length; i++) {
                const cell = addedRow.getCell(i);
                cell.border = {
                    top: { style: 'thin' },
                    left: { style: 'thin' },
                    bottom: { style: 'thin' },
                    right: { style: 'thin' }
                };
                cell.alignment = { vertical: 'middle', horizontal: 'center' };
            }
        });
    });
    
    // Add legend at the bottom
    sheet.addRow(['']);
    sheet.addRow(['']);
    const legendRow1 = sheet.addRow(['Legend:']);
    legendRow1.font = { bold: true };
    
    const redLegend = sheet.addRow(['Score < 80%', 'Needs Improvement']);
    redLegend.getCell(1).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFFF0000' }
    };
    redLegend.getCell(1).font = { color: { argb: 'FFFFFFFF' }, bold: true };
    
    const greenLegend = sheet.addRow(['Score ≥ 80%', 'Good Performance']);
    greenLegend.getCell(1).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF90EE90' }
    };

    return workbook;
}

// Generate school-wise report (multiple departments in one file)
// groupedDataByDept: Map of department -> groupedData (same structure as generateDepartmentReport)
async function generateSchoolReport(school, filters, groupedDataByDept) {
    const ExcelJS = require('exceljs');
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'IQAC Feedback System';
    workbook.lastModifiedBy = 'IQAC Feedback System';
    workbook.created = new Date();
    workbook.modified = new Date();

    // Add School Info Sheet
    const infoSheet = workbook.addWorksheet('School Information');
    infoSheet.addRow(['School-wise Feedback Analysis Report']);
    infoSheet.addRow(['']);
    infoSheet.addRow(['School', school]);
    infoSheet.addRow(['Academic Year', filters.currentAY || '']);
    infoSheet.addRow(['Semester', filters.semester || '']);
    infoSheet.addRow(['Total Departments', Object.keys(groupedDataByDept).length]);
    infoSheet.addRow(['Generated Date', new Date().toLocaleString()]);
    infoSheet.addRow(['']);
    
    // Format Info Sheet
    infoSheet.getCell('A1').font = { size: 16, bold: true };
    infoSheet.getColumn('A').width = 20;
    infoSheet.getColumn('B').width = 40;

    // Add department list
    infoSheet.addRow(['Departments Included:']);
    infoSheet.getRow(infoSheet.rowCount).font = { bold: true };
    Object.keys(groupedDataByDept).sort().forEach((dept, idx) => {
        infoSheet.addRow([`${idx + 1}.`, dept]);
    });

    // Generate a sheet for each department using the existing generateDepartmentReport logic
    const departmentNames = Object.keys(groupedDataByDept).sort();
    
    for (const dept of departmentNames) {
        const groupedData = groupedDataByDept[dept];
        if (!groupedData || groupedData.length === 0) {
            console.log(`Skipping empty department: ${dept}`);
            continue;
        }

        // Create a temporary workbook to get the department sheet structure
        // Note: degree is not required for school-wise reports, pass empty string
        const tempWorkbook = await generateDepartmentReport(
            { degree: '', dept: dept, currentAY: filters.currentAY || '', semester: filters.semester || '', batch: 'ALL' },
            groupedData
        );
        
        // Get the department sheet from temp workbook
        const deptSheet = tempWorkbook.getWorksheet('Department Report');
        if (deptSheet) {
            // Get section groups info to recreate merged headings
            const findFirstAnalysis = () => {
                for (const course of groupedData) {
                    for (const f of course.faculties) {
                        if (f.analysisData && f.analysisData.analysis) return f.analysisData;
                    }
                }
                return null;
            };
            
            const first = findFirstAnalysis();
            const sectionGroups = [];
            const courseDetailHeaders = [
                'Dept', 'Degree', 'UG_or_PG', 'Arts_or_Engg', 'Short_Form',
                'Course_Code', 'Course_Name', 'Batch', 'Staff_id', 'Faculty_Name'
            ];
            
            if (first && first.analysis) {
                Object.entries(first.analysis).forEach(([key, section]) => {
                    const questions = Object.values(section.questions || {});
                    const count = questions.length;
                    // Keep original section names, but mark excluded sections - same logic as generateDepartmentReport
                    const isExcluded = isExcludedSection(key, section);
                    const sectionTitle = section.section_name || key;
                    sectionGroups.push({ title: sectionTitle, count, isExcluded });
                });
            }
            
            // Rename and add to main workbook
            const newSheet = workbook.addWorksheet(dept.substring(0, 31)); // Excel sheet name limit
            let parentHeadingRowNumber = null;
            let childHeadingRowNumber = null;
            let rowCount = 0;
            
            // Copy all rows from deptSheet to newSheet
            deptSheet.eachRow((row, rowNumber) => {
                const newRow = newSheet.addRow([]);
                rowCount++;
                let isParentHeadingRow = false;
                let isChildHeadingRow = false;
                
                row.eachCell((cell, colNumber) => {
                    const newCell = newRow.getCell(colNumber);
                    newCell.value = cell.value;
                    newCell.style = cell.style;
                    if (cell.formula) {
                        newCell.formula = cell.formula;
                    }
                    
                    // Check if this row contains section headings (has section names in question columns)
                    if (colNumber > courseDetailHeaders.length && cell.value && typeof cell.value === 'string') {
                        const sectionTitles = sectionGroups.map(g => g.title);
                        // Check for "Non-scoring sections" (parent heading) or individual section names (child heading)
                        if (cell.value === 'Non-scoring sections') {
                            isParentHeadingRow = true;
                        } else if (sectionTitles.includes(cell.value)) {
                            isChildHeadingRow = true;
                        }
                    }
                });
                
                if (isParentHeadingRow && !parentHeadingRowNumber) {
                    parentHeadingRowNumber = newRow.number;
                }
                if (isChildHeadingRow && !childHeadingRowNumber && parentHeadingRowNumber) {
                    childHeadingRowNumber = newRow.number;
                }
            });
            
            // Clear duplicate section names from merged cells (keep only first cell of each section)
            if (parentHeadingRowNumber && sectionGroups.length > 0) {
                const questionStartCol = courseDetailHeaders.length + 1;
                let colPointer = questionStartCol;
                let nonScoringStartCol = null;
                let nonScoringEndCol = null;
                
                sectionGroups.forEach(g => {
                    const startCol = colPointer;
                    const endCol = startCol + Math.max(g.count - 1, 0);
                    
                    if (g.isExcluded) {
                        if (nonScoringStartCol === null) {
                            nonScoringStartCol = startCol;
                        }
                        nonScoringEndCol = endCol;
                    } else {
                        // Clear section names from columns 2 to endCol (keep only first column)
                        if (nonScoringStartCol !== null && nonScoringEndCol !== null) {
                            for (let col = nonScoringStartCol + 1; col <= nonScoringEndCol; col++) {
                                const cell = newSheet.getRow(parentHeadingRowNumber).getCell(col);
                                if (cell.value === 'Non-scoring sections') {
                                    cell.value = '';
                                }
                            }
                            nonScoringStartCol = null;
                            nonScoringEndCol = null;
                        }
                        // Clear section names from columns 2 to endCol for non-excluded sections
                        for (let col = startCol + 1; col <= endCol; col++) {
                            const cell = newSheet.getRow(parentHeadingRowNumber).getCell(col);
                            if (cell.value === g.title) {
                                cell.value = '';
                            }
                        }
                    }
                    colPointer = endCol + 1;
                });
                
                // Clear excluded sections at the end
                if (nonScoringStartCol !== null && nonScoringEndCol !== null) {
                    for (let col = nonScoringStartCol + 1; col <= nonScoringEndCol; col++) {
                        const cell = newSheet.getRow(parentHeadingRowNumber).getCell(col);
                        if (cell.value === 'Non-scoring sections') {
                            cell.value = '';
                        }
                    }
                }
            }
            
            // Clear duplicate section names from child row (keep only first cell of each excluded section)
            if (childHeadingRowNumber && sectionGroups.length > 0) {
                const questionStartCol = courseDetailHeaders.length + 1;
                let colPointer = questionStartCol;
                
                sectionGroups.forEach(g => {
                    const startCol = colPointer;
                    const endCol = startCol + Math.max(g.count - 1, 0);
                    
                    // Only clear for excluded sections (they have child row entries)
                    if (g.isExcluded) {
                        // Clear section names from columns 2 to endCol (keep only first column)
                        for (let col = startCol + 1; col <= endCol; col++) {
                            const cell = newSheet.getRow(childHeadingRowNumber).getCell(col);
                            if (cell.value === g.title) {
                                cell.value = '';
                            }
                        }
                    }
                    colPointer = endCol + 1;
                });
            }
            
            // Recreate merged cells for two-level section headings (parent and child rows)
            if (parentHeadingRowNumber && childHeadingRowNumber && sectionGroups.length > 0) {
                const questionStartCol = courseDetailHeaders.length + 1;
                let colPointer = questionStartCol;
                let nonScoringStartCol = null;
                let nonScoringEndCol = null;
                
                // Process parent row (Non-scoring sections heading)
                sectionGroups.forEach(g => {
                    const startCol = colPointer;
                    const endCol = startCol + Math.max(g.count - 1, 0);
                    
                    if (g.isExcluded) {
                        if (nonScoringStartCol === null) {
                            nonScoringStartCol = startCol;
                        }
                        nonScoringEndCol = endCol;
                    } else {
                        // If we were tracking excluded sections, merge them in parent row
                        if (nonScoringStartCol !== null && nonScoringEndCol !== null) {
                            try {
                                newSheet.mergeCells(parentHeadingRowNumber, nonScoringStartCol, parentHeadingRowNumber, nonScoringEndCol);
                                const parentCell = newSheet.getRow(parentHeadingRowNumber).getCell(nonScoringStartCol);
                                parentCell.value = 'Non-scoring sections';
                                parentCell.font = { bold: true };
                                parentCell.alignment = { horizontal: 'center' };
                                parentCell.fill = {
                                    type: 'pattern',
                                    pattern: 'solid',
                                    fgColor: { argb: 'FFE6E6FA' }
                                };
                            } catch (e) {
                                console.warn(`Could not merge cells for non-scoring sections in department ${dept}:`, e.message);
                            }
                            nonScoringStartCol = null;
                            nonScoringEndCol = null;
                        }
                        
                        // Merge non-excluded sections in parent row
                        try {
                            newSheet.mergeCells(parentHeadingRowNumber, startCol, parentHeadingRowNumber, endCol);
                            const parentCell = newSheet.getRow(parentHeadingRowNumber).getCell(startCol);
                            parentCell.font = { bold: true };
                            parentCell.alignment = { horizontal: 'center' };
                            parentCell.fill = {
                                type: 'pattern',
                                pattern: 'solid',
                                fgColor: { argb: 'FFE6E6FA' }
                            };
                        } catch (e) {
                            console.warn(`Could not merge cells for section ${g.title} in department ${dept}:`, e.message);
                        }
                    }
                    colPointer = endCol + 1;
                });
                
                // If excluded sections are at the end, merge them in parent row
                if (nonScoringStartCol !== null && nonScoringEndCol !== null) {
                    try {
                        newSheet.mergeCells(parentHeadingRowNumber, nonScoringStartCol, parentHeadingRowNumber, nonScoringEndCol);
                        const parentCell = newSheet.getRow(parentHeadingRowNumber).getCell(nonScoringStartCol);
                        parentCell.value = 'Non-scoring sections';
                        parentCell.font = { bold: true };
                        parentCell.alignment = { horizontal: 'center' };
                        parentCell.fill = {
                            type: 'pattern',
                            pattern: 'solid',
                            fgColor: { argb: 'FFE6E6FA' }
                        };
                    } catch (e) {
                        console.warn(`Could not merge cells for non-scoring sections at end in department ${dept}:`, e.message);
                    }
                }
                
                // Process child row (individual section names ONLY for excluded sections)
                colPointer = questionStartCol;
                sectionGroups.forEach(g => {
                    const startCol = colPointer;
                    const endCol = startCol + Math.max(g.count - 1, 0);
                    
                    // Only merge child row cells for excluded sections (they have values in child row)
                    if (g.isExcluded) {
                        const childCell = newSheet.getRow(childHeadingRowNumber).getCell(startCol);
                        // Only merge if there's a value and more than one column
                        if (childCell.value && endCol > startCol) {
                            try {
                                newSheet.mergeCells(childHeadingRowNumber, startCol, childHeadingRowNumber, endCol);
                                childCell.font = { bold: true };
                                childCell.alignment = { horizontal: 'center' };
                                childCell.fill = {
                                    type: 'pattern',
                                    pattern: 'solid',
                                    fgColor: { argb: 'FFF0F0F0' } // Slightly lighter gray for child row
                                };
                            } catch (e) {
                                console.warn(`Could not merge cells for child section ${g.title} in department ${dept}:`, e.message);
                                // If merge fails, at least style the first cell
                                childCell.font = { bold: true };
                                childCell.alignment = { horizontal: 'center' };
                                childCell.fill = {
                                    type: 'pattern',
                                    pattern: 'solid',
                                    fgColor: { argb: 'FFF0F0F0' }
                                };
                            }
                        } else if (childCell.value) {
                            // Single column, just style it
                            childCell.font = { bold: true };
                            childCell.alignment = { horizontal: 'center' };
                            childCell.fill = {
                                type: 'pattern',
                                pattern: 'solid',
                                fgColor: { argb: 'FFF0F0F0' }
                            };
                        }
                    }
                    // For non-excluded sections, child row is empty, so skip merging
                    
                    colPointer = endCol + 1;
                });
            }
            
            // Copy column widths
            deptSheet.columns.forEach((col, idx) => {
                if (col.width) {
                    newSheet.getColumn(idx + 1).width = col.width;
                }
            });
        }
    }

    return workbook;
}

// Generate department Excel report with negative comments (replaces question columns with Open Comments)
async function generateDepartmentNegativeCommentsExcel(filters, groupedData) {
    const ExcelJS = require('exceljs');
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'IQAC Feedback System';
    workbook.lastModifiedBy = 'IQAC Feedback System';
    workbook.created = new Date();
    workbook.modified = new Date();

    const sheet = workbook.addWorksheet('Negative Comments Report');

    sheet.addRow(['Department-wise Negative Comments Report']);
    sheet.addRow(['']);
    sheet.addRow(['Degree', filters.degree || '']);
    sheet.addRow(['Current Academic Year', filters.currentAY || '']);
    sheet.addRow(['Semester', filters.semester || '']);
    sheet.addRow(['Course Offering Department', filters.courseOfferingDept || filters.dept || '']);
    sheet.addRow(['Batch', filters.batch || '']);
    sheet.addRow(['Generated On', new Date().toLocaleString()]);
    sheet.addRow(['']);
    sheet.getCell('A1').font = { size: 16, bold: true };

    const courseDetailHeaders = [
        'Dept', 'Degree', 'UG_or_PG', 'Arts_or_Engg', 'Short_Form',
        'Course_Code', 'Course_Name', 'Batch', 'Academic_Year', 'Semester',
        'Staff_id', 'Faculty_Name'
    ];

    // Instead of question headers, we have Open Comments
    const openCommentsHeader = 'Open Comments';

    // Build header row: course details + Open Comments only
    const headers = [...courseDetailHeaders, openCommentsHeader];
    
    // Add header row
    sheet.addRow(headers);
    const headerRow = sheet.getRow(sheet.rowCount);
    headerRow.font = { bold: true };
    headerRow.alignment = { horizontal: 'center' };
    headerRow.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFE6E6FA' }
    };
    // Header font color is black (default)

    // Set column widths
    const widths = [10, 12, 10, 12, 12, 14, 30, 10, 15, 12, 14, 22, 60]; // Last one for Open Comments
    for (let i = 0; i < widths.length; i++) {
        sheet.getColumn(i + 1).width = widths[i];
    }
    
    // Set width for Open Comments column (after course detail headers)
    const openCommentsColIndex = courseDetailHeaders.length + 1;
    sheet.getColumn(openCommentsColIndex).width = 80; // Wider since it's the only data column

    // No need to compute scores - we only need Open Comments

    // Add data rows
    groupedData.forEach(course => {
        course.faculties.forEach(f => {
            // Format batches: if multiple, join with comma; if one, show that one; if none, show empty
            let batchDisplay = '';
            if (f.batches && Array.isArray(f.batches) && f.batches.length > 0) {
                batchDisplay = f.batches.length > 1 ? f.batches.join(', ') : f.batches[0];
            } else if (f.analysisData?.unique_batches && Array.isArray(f.analysisData.unique_batches) && f.analysisData.unique_batches.length > 0) {
                batchDisplay = f.analysisData.unique_batches.length > 1 ? f.analysisData.unique_batches.join(', ') : f.analysisData.unique_batches[0];
            } else if (f.analysisData?.batch) {
                batchDisplay = f.analysisData.batch;
            }
            
            // Format degrees: if multiple, join with comma; if one, show that one; if none, show filter degree
            let degreeDisplay = '';
            if (f.degrees && Array.isArray(f.degrees) && f.degrees.length > 0) {
                degreeDisplay = f.degrees.length > 1 ? f.degrees.join(', ') : f.degrees[0];
            } else if (f.analysisData?.unique_degrees && Array.isArray(f.analysisData.unique_degrees) && f.analysisData.unique_degrees.length > 0) {
                degreeDisplay = f.analysisData.unique_degrees.length > 1 ? f.analysisData.unique_degrees.join(', ') : f.analysisData.unique_degrees[0];
            } else {
                // Fallback to filter degree if no degrees found for faculty
                degreeDisplay = filters.degree || '';
            }
            
            const meta = [
                filters.courseOfferingDept || filters.dept || '',
                degreeDisplay,
                f.analysisData?.ug_or_pg || '',
                f.analysisData?.arts_or_engg || '',
                f.analysisData?.short_form || '',
                (f.analysisData?.course_code || course.course_code || ''),
                course.course_name || '',
                batchDisplay,
                f.analysisData?.current_ay || filters.currentAY || '',
                f.analysisData?.semester || filters.semester || '',
                (f.staffid || f.staff_id || ''),
                f.faculty_name || '',
            ];
            
            // Get negative comments for this faculty
            let openComments = '';
            if (f.negativeComments && Array.isArray(f.negativeComments) && f.negativeComments.length > 0) {
                openComments = f.negativeComments.filter(c => c && c.trim()).join('\n\n');
            }
            
            // Build row: meta + Open Comments only
            const row = [...meta, openComments];
            
            const addedRow = sheet.addRow(row);
            
            // Format Open Comments column (wrap text)
            const openCommentsCell = addedRow.getCell(openCommentsColIndex);
            openCommentsCell.alignment = { 
                vertical: 'top', 
                horizontal: 'left',
                wrapText: true 
            };
            
            // Apply borders to metadata columns
            for (let i = 1; i <= meta.length; i++) {
                const cell = addedRow.getCell(i);
                cell.border = {
                    top: { style: 'thin' },
                    left: { style: 'thin' },
                    bottom: { style: 'thin' },
                    right: { style: 'thin' }
                };
                cell.alignment = { vertical: 'middle', horizontal: 'center' };
            }
            
            // Border for Open Comments cell
            openCommentsCell.border = {
                top: { style: 'thin' },
                left: { style: 'thin' },
                bottom: { style: 'thin' },
                right: { style: 'thin' }
            };
        });
    });

    return workbook;
}

// Generate school-wise negative comments Excel report (multiple departments in one file)
// groupedDataByDept: Map of department -> groupedData (same structure as generateDepartmentNegativeCommentsExcel)
async function generateSchoolNegativeCommentsExcel(school, filters, groupedDataByDept) {
    const ExcelJS = require('exceljs');
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'IQAC Feedback System';
    workbook.lastModifiedBy = 'IQAC Feedback System';
    workbook.created = new Date();
    workbook.modified = new Date();

    // Add School Info Sheet
    const infoSheet = workbook.addWorksheet('School Information');
    infoSheet.addRow(['School-wise Negative Comments Report']);
    infoSheet.addRow(['']);
    infoSheet.addRow(['School', school]);
    infoSheet.addRow(['Academic Year', filters.currentAY || '']);
    infoSheet.addRow(['Semester', filters.semester || '']);
    infoSheet.addRow(['Total Departments', Object.keys(groupedDataByDept).length]);
    infoSheet.addRow(['Generated Date', new Date().toLocaleString()]);
    infoSheet.addRow(['']);
    
    // Format Info Sheet
    infoSheet.getCell('A1').font = { size: 16, bold: true };
    infoSheet.getColumn('A').width = 20;
    infoSheet.getColumn('B').width = 40;

    // Add department list
    infoSheet.addRow(['Departments Included:']);
    infoSheet.getRow(infoSheet.rowCount).font = { bold: true };
    Object.keys(groupedDataByDept).sort().forEach((dept, idx) => {
        infoSheet.addRow([`${idx + 1}.`, dept]);
    });

    // Generate a sheet for each department using the existing generateDepartmentNegativeCommentsExcel logic
    const departmentNames = Object.keys(groupedDataByDept).sort();
    
    for (const dept of departmentNames) {
        const groupedData = groupedDataByDept[dept];
        if (!groupedData || groupedData.length === 0) {
            console.log(`Skipping empty department: ${dept}`);
            continue;
        }

        // Create a temporary workbook to get the department sheet structure
        // Note: degree is not required for school-wise reports, pass empty string
        const tempWorkbook = await generateDepartmentNegativeCommentsExcel(
            { degree: '', dept: dept, currentAY: filters.currentAY || '', semester: filters.semester || '', batch: 'ALL' },
            groupedData
        );
        
        // Get the department sheet from temp workbook
        const deptSheet = tempWorkbook.getWorksheet('Negative Comments Report');
        if (deptSheet) {
            // Rename and add to main workbook
            const newSheet = workbook.addWorksheet(dept.substring(0, 31)); // Excel sheet name limit
            
            // Copy all rows from deptSheet to newSheet
            deptSheet.eachRow((row, rowNumber) => {
                const newRow = newSheet.addRow([]);
                
                row.eachCell((cell, colNumber) => {
                    const newCell = newRow.getCell(colNumber);
                    newCell.value = cell.value;
                    newCell.style = cell.style;
                    if (cell.formula) {
                        newCell.formula = cell.formula;
                    }
                });
            });
            
            // Copy column widths
            deptSheet.columns.forEach((col, idx) => {
                if (col.width) {
                    newSheet.getColumn(idx + 1).width = col.width;
                }
            });
        }
    }

    return workbook;
}

module.exports = { generateReport, generateDepartmentReport, generateSchoolReport, generateDepartmentNegativeCommentsExcel, generateSchoolNegativeCommentsExcel };