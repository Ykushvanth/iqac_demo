const { createClient } = require('@supabase/supabase-js');
const XLSX = require('xlsx');
const dotenv = require('dotenv');

// Load environment variables
dotenv.config();
const fs = require('fs');

// Initialize Supabase client with fetch implementation
const fetch = require('cross-fetch');
const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_ANON_KEY,
    {
        auth: {
            persistSession: false
        },
        global: {
            fetch: fetch
        }
    }
);

// Helper function to clean and validate string values
const cleanString = (value) => {
    if (!value) return null;
    const cleaned = value.toString().trim();
    if (cleaned === '' || cleaned.toUpperCase() === 'NULL') return null;
    return cleaned;
};

// Helper function to parse integer or return null
const parseIntOrNull = (val) => {
    if (val === null || val === undefined || val === "" || val === "NULL") return null;
    const n = parseInt(val, 10);
    return isNaN(n) ? null : n;
};

const handleFileUpload = async (file) => {
    try {
        // Add detailed file logging
        console.log('File received:', {
            name: file.name,
            size: file.size,
            mimetype: file.mimetype,
            hasData: !!file.data
        });

        if (!file || !file.data) {
            throw new Error('Invalid file or empty file received');
        }

            // We'll parse the Excel file. For large uploads we prefer streaming
            // parsing from the temp file to avoid loading the whole workbook into memory.
            console.log('Preparing to parse Excel file (streaming when possible)...');
        
        // Helper function to find column value with multiple possible names (case-insensitive, handles spaces/underscores)
        const getColumnValue = (row, possibleNames) => {
            // Normalize function to handle case and spaces/underscores
            const normalize = (str) => {
                if (!str) return '';
                return str.toString().toLowerCase().replace(/[\s_-]+/g, '').trim();
            };
            
            for (const name of possibleNames) {
                // Try exact match first
                if (row[name] !== undefined && row[name] !== null && row[name] !== '') {
                    return row[name];
                }
                
                // Try case-insensitive match with normalized names
                const normalizedName = normalize(name);
                const foundKey = Object.keys(row).find(
                    key => normalize(key) === normalizedName
                );
                
                if (foundKey && row[foundKey] !== undefined && row[foundKey] !== null && row[foundKey] !== '') {
                    return row[foundKey];
                }
            }
            return null;
        };
                // Add batching for large datasets - increased batch size for faster uploads
                const batchSize = 5000;
                const normalizedData = [];
                let insertedCount = 0;
                let skippedCount = 0;
                const errors = [];
                const startTime = Date.now();
                let rowsProcessed = 0;

                // Helper to insert with exponential backoff retry
                const insertBatchWithRetry = async (batch, maxRetries = 2) => {
                    for (let attempt = 0; attempt <= maxRetries; attempt++) {
                        try {
                            const { data, error } = await supabase.from('course_feedback_new').insert(batch);
                            if (error) throw error;
                            return true;
                        } catch (err) {
                            if (attempt < maxRetries) {
                                const waitMs = Math.min(1000 * Math.pow(2, attempt), 5000);
                                console.log(`Insert failed, retrying in ${waitMs}ms (attempt ${attempt + 1}/${maxRetries})...`);
                                await new Promise(resolve => setTimeout(resolve, waitMs));
                            } else {
                                throw err;
                            }
                        }
                    }
                };

                // If a temp file path exists, stream-parse using ExcelJS to avoid high memory usage
                if (file.tempFilePath) {
                    const ExcelJS = require('exceljs');
                    console.log('Streaming Excel from temp file:', file.tempFilePath);
                    const workbookReader = new ExcelJS.stream.xlsx.WorkbookReader(file.tempFilePath);
                    let headers = null;

                    for await (const worksheetReader of workbookReader) {
                        console.log('Processing sheet:', worksheetReader.name);
                        for await (const row of worksheetReader) {
                            // row.values is an array where index 1..n correspond to cells
                            if (!headers) {
                                headers = (row.values || []).slice(1).map(h => h ? h.toString() : '');
                                console.log('Detected headers:', headers);
                                continue;
                            }

                            const r = {};
                            const values = row.values || [];
                            for (let ci = 1; ci < values.length; ci++) {
                                const key = headers[ci - 1] || `col${ci}`;
                                r[key] = values[ci];
                            }

                            try {
                                const obj = {
                // Basic information columns
                dept: cleanString(getColumnValue(r, ['dept', 'department', 'dept_name'])),
                degree: cleanString(getColumnValue(r, ['degree', 'degree_name'])),
                ug_or_pg: cleanString(getColumnValue(r, ['ug_or_pg', 'ug or pg', 'ug/pg', 'ug_or_pg'])),
                arts_or_engg: cleanString(getColumnValue(r, ['arts_or_engg', 'arts or engg', 'arts/engg', 'arts_or_engg'])),
                short_form: cleanString(getColumnValue(r, ['short_form', 'short form', 'shortform'])),
                batch: cleanString(getColumnValue(r, ['batch', 'batch_year', 'year'])),
                sec: cleanString(getColumnValue(r, ['sec', 'section', 'sec_name'])),
                current_ay: cleanString(getColumnValue(r, ['Current AY', 'current_ay', 'current ay', 'academic_year', 'academic year', 'ay'])),
                semester: cleanString(getColumnValue(r, ['Semester', 'semester', 'sem', 'semester_number'])),
                
                // Course information columns
                course_code: cleanString(getColumnValue(r, ['course_code', 'course code', 'coursecode', 'code'])),
                course_offering_dept_name: cleanString(getColumnValue(r, ['course offereing_dept_name', 'course offereing dept name', 'course_offering_dept_name', 'course_offering_dept', 'course offering dept name', 'course offering dept', 'offering_dept', 'offering dept', 'course_dept', 'course dept', 'offering_dept_name'])),
                course_name: cleanString(getColumnValue(r, ['course_name', 'course name', 'coursename', 'subject', 'subject_name'])),
                
                // Staff/Faculty information columns
                staff_id: cleanString(getColumnValue(r, ['staff_id', 'staff id', 'staffid', 'staff_id'])),
                staffid: cleanString(getColumnValue(r, ['staffid', 'staff id', 'staff_id', 'staffid'])),
                faculty_name: cleanString(getColumnValue(r, ['faculty_name', 'faculty name', 'facultyname', 'staff_name', 'staff name', 'name', 'teacher_name', 'teacher name'])),
                mobile_no: cleanString(getColumnValue(r, ['mobile_no', 'mobile no', 'mobileno', 'mobile', 'phone', 'phone_no', 'phone no'])),
                grp: cleanString(getColumnValue(r, ['grp', 'group', 'group_name', 'group name'])),
                
                // Question columns (qn1 to qn35) - INTEGER type
                qn1: parseIntOrNull(getColumnValue(r, ['qn1', 'q1', 'question1', 'question 1'])),
                qn2: parseIntOrNull(getColumnValue(r, ['qn2', 'q2', 'question2', 'question 2'])),
                qn3: parseIntOrNull(getColumnValue(r, ['qn3', 'q3', 'question3', 'question 3'])),
                qn4: parseIntOrNull(getColumnValue(r, ['qn4', 'q4', 'question4', 'question 4'])),
                qn5: parseIntOrNull(getColumnValue(r, ['qn5', 'q5', 'question5', 'question 5'])),
                qn6: parseIntOrNull(getColumnValue(r, ['qn6', 'q6', 'question6', 'question 6'])),
                qn7: parseIntOrNull(getColumnValue(r, ['qn7', 'q7', 'question7', 'question 7'])),
                qn8: parseIntOrNull(getColumnValue(r, ['qn8', 'q8', 'question8', 'question 8'])),
                qn9: parseIntOrNull(getColumnValue(r, ['qn9', 'q9', 'question9', 'question 9'])),
                qn10: parseIntOrNull(getColumnValue(r, ['qn10', 'q10', 'question10', 'question 10'])),
                qn11: parseIntOrNull(getColumnValue(r, ['qn11', 'q11', 'question11', 'question 11'])),
                qn12: parseIntOrNull(getColumnValue(r, ['qn12', 'q12', 'question12', 'question 12'])),
                qn13: parseIntOrNull(getColumnValue(r, ['qn13', 'q13', 'question13', 'question 13'])),
                qn14: parseIntOrNull(getColumnValue(r, ['qn14', 'q14', 'question14', 'question 14'])),
                qn15: parseIntOrNull(getColumnValue(r, ['qn15', 'q15', 'question15', 'question 15'])),
                qn16: parseIntOrNull(getColumnValue(r, ['qn16', 'q16', 'question16', 'question 16'])),
                qn17: parseIntOrNull(getColumnValue(r, ['qn17', 'q17', 'question17', 'question 17'])),
                qn18: parseIntOrNull(getColumnValue(r, ['qn18', 'q18', 'question18', 'question 18'])),
                qn19: parseIntOrNull(getColumnValue(r, ['qn19', 'q19', 'question19', 'question 19'])),
                qn20: parseIntOrNull(getColumnValue(r, ['qn20', 'q20', 'question20', 'question 20'])),
                qn21: parseIntOrNull(getColumnValue(r, ['qn21', 'q21', 'question21', 'question 21'])),
                qn22: parseIntOrNull(getColumnValue(r, ['qn22', 'q22', 'question22', 'question 22'])),
                qn23: parseIntOrNull(getColumnValue(r, ['qn23', 'q23', 'question23', 'question 23'])),
                qn24: parseIntOrNull(getColumnValue(r, ['qn24', 'q24', 'question24', 'question 24'])),
                qn25: parseIntOrNull(getColumnValue(r, ['qn25', 'q25', 'question25', 'question 25'])),
                qn26: parseIntOrNull(getColumnValue(r, ['qn26', 'q26', 'question26', 'question 26'])),
                qn27: parseIntOrNull(getColumnValue(r, ['qn27', 'q27', 'question27', 'question 27'])),
                qn28: parseIntOrNull(getColumnValue(r, ['qn28', 'q28', 'question28', 'question 28'])),
                qn29: parseIntOrNull(getColumnValue(r, ['qn29', 'q29', 'question29', 'question 29'])),
                qn30: parseIntOrNull(getColumnValue(r, ['qn30', 'q30', 'question30', 'question 30'])),
                qn31: parseIntOrNull(getColumnValue(r, ['qn31', 'q31', 'question31', 'question 31'])),
                qn32: parseIntOrNull(getColumnValue(r, ['qn32', 'q32', 'question32', 'question 32'])),
                qn33: parseIntOrNull(getColumnValue(r, ['qn33', 'q33', 'question33', 'question 33'])),
                qn34: parseIntOrNull(getColumnValue(r, ['qn34', 'q34', 'question34', 'question 34'])),
                qn35: parseIntOrNull(getColumnValue(r, ['qn35', 'q35', 'question35', 'question 35'])),
                
                        // Comment column
                        comment: cleanString(getColumnValue(r, ['comment', 'comments', 'remarks', 'feedback', 'open_comments', 'open comments']))
                        };

                        normalizedData.push(obj);

                        rowsProcessed++;
                        
                        // Insert in batches
                        if (normalizedData.length === batchSize) {
                            const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
                            console.log(`[${elapsed}s] Inserting batch of ${normalizedData.length} records...`);
                            await insertBatchWithRetry(normalizedData);
                            insertedCount += normalizedData.length;
                            normalizedData.length = 0;
                            if (rowsProcessed % (batchSize * 2) === 0) {
                                const rate = (rowsProcessed / ((Date.now() - startTime) / 1000)).toFixed(0);
                                console.log(`Progress: ${rowsProcessed} rows at ${rate} rows/sec`);
                            }
                        }
                    } catch (rowError) {
                        skippedCount++;
                        errors.push({ row: null, course_code: r.course_code || null, error: rowError.message });
                    }
                }
            }

            // Insert any remaining records
            if (normalizedData.length > 0) {
                const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
                console.log(`[${elapsed}s] Inserting final batch of ${normalizedData.length} records...`);
                await insertBatchWithRetry(normalizedData);
                insertedCount += normalizedData.length;
                normalizedData.length = 0;
            }

            const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
            const rate = rowsProcessed > 0 ? (rowsProcessed / ((Date.now() - startTime) / 1000)).toFixed(0) : 0;
            console.log(`✓ Upload complete in ${totalTime}s: ${insertedCount} inserted, ${skippedCount} skipped (${rate} rows/sec)`);

            return {
                success: true,
                message: `Successfully uploaded ${insertedCount + skippedCount} records in ${totalTime}s`,
                count: insertedCount + skippedCount,
                inserted: insertedCount,
                skipped: skippedCount,
                errors: errors.slice(0, 10),
                totalErrors: errors.length,
                duration: totalTime,
                throughput: `${rate} rows/sec`
            };
        }

        // Fallback: read from buffer into memory (original behavior)
        for (let i = 0; i < rows.length; i++) {
            const r = rows[i];
            // Map all columns according to course_feedback_new schema
            // Using flexible column name matching to handle variations
            const obj = {
            }

            normalizedData.push(obj);

            // Insert in batches
            if (normalizedData.length === batchSize || i === rows.length - 1) {
                console.log(`Inserting batch of ${normalizedData.length} records...`);
                const { data, error } = await supabase
                    .from('course_feedback_new')
                    .insert(normalizedData);

                if (error) {
                    throw error;
                }

                normalizedData.length = 0; // Clear the batch
            }
        }

        return {
            success: true,
            message: `Successfully uploaded ${rows.length} records`,
            count: rows.length
        };

    } catch (error) {
        console.error('Detailed error:', error);
        return {
            success: false,
            message: error.message || 'Upload failed',
            error: error
        };
    } finally {
        // Clean up temp file if it was created by express-fileupload
        try {
            if (file && file.tempFilePath) {
                fs.unlink(file.tempFilePath, (err) => {
                    if (err) console.warn('Failed to delete temp file:', file.tempFilePath, err.message);
                    else console.log('Temp file deleted:', file.tempFilePath);
                });
            }
        } catch (cleanupErr) {
            console.warn('Error during temp file cleanup:', cleanupErr.message);
        }
    }
};

// Delete data based on filters
const deleteDataByFilters = async (filters) => {
    try {
        console.log('Deleting data with filters:', filters);
        
        let query = supabase.from('course_feedback_new').delete();
        
        // Apply filters
        if (filters.degree) {
            query = query.eq('degree', filters.degree);
        }
        if (filters.currentAY) {
            query = query.eq('current_ay', filters.currentAY);
        }
        if (filters.semester) {
            query = query.eq('semester', filters.semester);
        }
        if (filters.courseOfferingDept) {
            query = query.eq('course_offering_dept_name', filters.courseOfferingDept);
        }
        
        // First, count how many records will be deleted
        let countQuery = supabase.from('course_feedback_new').select('id', { count: 'exact', head: true });
        
        if (filters.degree) {
            countQuery = countQuery.eq('degree', filters.degree);
        }
        if (filters.currentAY) {
            countQuery = countQuery.eq('current_ay', filters.currentAY);
        }
        if (filters.semester) {
            countQuery = countQuery.eq('semester', filters.semester);
        }
        if (filters.courseOfferingDept) {
            countQuery = countQuery.eq('course_offering_dept_name', filters.courseOfferingDept);
        }
        
        const { count, error: countError } = await countQuery;
        
        if (countError) {
            throw countError;
        }
        
        console.log(`Found ${count} records to delete`);
        
        if (count === 0) {
            return {
                success: true,
                message: 'No records found matching the specified filters',
                count: 0
            };
        }
        
        // Perform the deletion
        const { data, error } = await query;
        
        if (error) {
            throw error;
        }
        
        console.log(`Successfully deleted ${count} records`);
        
        return {
            success: true,
            message: `Successfully deleted ${count} records`,
            count: count
        };
        
    } catch (error) {
        console.error('Error deleting data:', error);
        return {
            success: false,
            message: error.message || 'Delete failed',
            error: error
        };
    }
};

module.exports = { handleFileUpload, deleteDataByFilters };