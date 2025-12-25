const { createClient } = require('@supabase/supabase-js');
const XLSX = require('xlsx');
const ExcelJS = require('exceljs');
const fs = require('fs');
const dotenv = require('dotenv');

dotenv.config();

const fetch = require('cross-fetch');
const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_ANON_KEY,
    {
        auth: { persistSession: false },
        global: { fetch: fetch }
    }
);

// Global job queue
const jobQueue = {};
let jobIdCounter = 0;

const generateJobId = () => `upload_${++jobIdCounter}_${Date.now()}`;

// Helper functions
const cleanString = (value) => {
    if (!value) return null;
    const cleaned = value.toString().trim();
    if (cleaned === '' || cleaned.toUpperCase() === 'NULL') return null;
    return cleaned;
};

const parseIntOrNull = (val) => {
    if (val === null || val === undefined || val === "" || val === "NULL") return null;
    const n = parseInt(val, 10);
    return isNaN(n) ? null : n;
};

const getColumnValue = (row, possibleNames) => {
    const normalize = (str) => {
        if (!str) return '';
        return str.toString().toLowerCase().replace(/[\s_-]+/g, '').trim();
    };
    
    for (const name of possibleNames) {
        if (row[name] !== undefined && row[name] !== null && row[name] !== '') {
            return row[name];
        }
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

// Insert with retry and exponential backoff
const insertBatchWithRetry = async (batch, maxRetries = 3) => {
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            const { data, error } = await supabase.from('course_feedback_new').insert(batch);
            if (error) throw error;
            return { success: true };
        } catch (err) {
            if (attempt < maxRetries) {
                const waitMs = Math.min(1000 * Math.pow(2, attempt), 8000);
                console.log(`[${jobQueue[this.jobId]?.id}] Batch insert retry in ${waitMs}ms (attempt ${attempt + 1}/${maxRetries})`);
                await new Promise(resolve => setTimeout(resolve, waitMs));
            } else {
                throw err;
            }
        }
    }
};

// Main worker function
const processUpload = async (jobId, filePath) => {
    const job = jobQueue[jobId];
    if (!job) return;

    job.status = 'processing';
    job.startTime = Date.now();
    job.message = 'Starting file processing...';

    try {
        if (!fs.existsSync(filePath)) {
            throw new Error('File not found: ' + filePath);
        }

        console.log(`[${job.id}] Starting upload processing from ${filePath}`);

        const batchSize = 3000; // Smaller batches for worker (less memory pressure)
        let insertedCount = 0;
        let skippedCount = 0;
        const errors = [];
        let rowsProcessed = 0;
        const startTime = Date.now();

        // Stream parse Excel file
        const workbookReader = new ExcelJS.stream.xlsx.WorkbookReader(filePath);
        let headers = null;
        let normalizedData = [];

        for await (const worksheetReader of workbookReader) {
            console.log(`[${job.id}] Processing sheet: ${worksheetReader.name}`);
            job.currentSheet = worksheetReader.name;

            for await (const row of worksheetReader) {
                if (!headers) {
                    headers = (row.values || []).slice(1).map(h => h ? h.toString() : '');
                    console.log(`[${job.id}] Detected ${headers.length} columns`);
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
                        dept: cleanString(getColumnValue(r, ['dept', 'department', 'dept_name'])),
                        degree: cleanString(getColumnValue(r, ['degree', 'degree_name'])),
                        ug_or_pg: cleanString(getColumnValue(r, ['ug_or_pg', 'ug or pg', 'ug/pg', 'ug_or_pg'])),
                        arts_or_engg: cleanString(getColumnValue(r, ['arts_or_engg', 'arts or engg', 'arts/engg', 'arts_or_engg'])),
                        short_form: cleanString(getColumnValue(r, ['short_form', 'short form', 'shortform'])),
                        batch: cleanString(getColumnValue(r, ['batch', 'batch_year', 'year'])),
                        sec: cleanString(getColumnValue(r, ['sec', 'section', 'sec_name'])),
                        current_ay: cleanString(getColumnValue(r, ['Current AY', 'current_ay', 'current ay', 'academic_year', 'academic year', 'ay'])),
                        semester: cleanString(getColumnValue(r, ['Semester', 'semester', 'sem', 'semester_number'])),
                        course_code: cleanString(getColumnValue(r, ['course_code', 'course code', 'coursecode', 'code'])),
                        course_offering_dept_name: cleanString(getColumnValue(r, ['course offereing_dept_name', 'course offereing dept name', 'course_offering_dept_name', 'course_offering_dept', 'course offering dept name', 'course offering dept', 'offering_dept', 'offering dept', 'course_dept', 'course dept', 'offering_dept_name'])),
                        course_name: cleanString(getColumnValue(r, ['course_name', 'course name', 'coursename', 'subject', 'subject_name'])),
                        staff_id: cleanString(getColumnValue(r, ['staff_id', 'staff id', 'staffid', 'staff_id'])),
                        staffid: cleanString(getColumnValue(r, ['staffid', 'staff id', 'staff_id', 'staffid'])),
                        faculty_name: cleanString(getColumnValue(r, ['faculty_name', 'faculty name', 'facultyname', 'staff_name', 'staff name', 'name', 'teacher_name', 'teacher name'])),
                        mobile_no: cleanString(getColumnValue(r, ['mobile_no', 'mobile no', 'mobileno', 'mobile', 'phone', 'phone_no', 'phone no'])),
                        grp: cleanString(getColumnValue(r, ['grp', 'group', 'group_name', 'group name'])),
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
                        comment: cleanString(getColumnValue(r, ['comment', 'comments', 'remarks', 'feedback', 'open_comments', 'open comments']))
                    };

                    normalizedData.push(obj);
                    rowsProcessed++;

                    // Insert in batches
                    if (normalizedData.length >= batchSize) {
                        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
                        console.log(`[${job.id}] Inserting batch of ${normalizedData.length} (${elapsed}s)`);
                        job.message = `Processed ${rowsProcessed} rows, inserting batch...`;
                        job.rowsProcessed = rowsProcessed;

                        await insertBatchWithRetry(normalizedData);
                        insertedCount += normalizedData.length;
                        normalizedData = [];

                        if (rowsProcessed % (batchSize * 3) === 0) {
                            const rate = (rowsProcessed / ((Date.now() - startTime) / 1000)).toFixed(0);
                            job.message = `${rowsProcessed} rows processed at ${rate} rows/sec`;
                            console.log(`[${job.id}] Progress: ${job.message}`);
                        }
                    }
                } catch (rowError) {
                    skippedCount++;
                    errors.push({ error: rowError.message });
                }
            }
        }

        // Insert remaining
        if (normalizedData.length > 0) {
            const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
            console.log(`[${job.id}] Inserting final batch of ${normalizedData.length} (${elapsed}s)`);
            await insertBatchWithRetry(normalizedData);
            insertedCount += normalizedData.length;
            normalizedData = [];
        }

        const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
        const rate = rowsProcessed > 0 ? (rowsProcessed / ((Date.now() - startTime) / 1000)).toFixed(0) : 0;

        job.status = 'completed';
        job.message = `Upload complete: ${insertedCount} inserted, ${skippedCount} skipped in ${totalTime}s`;
        job.result = {
            success: true,
            inserted: insertedCount,
            skipped: skippedCount,
            total: insertedCount + skippedCount,
            duration: `${totalTime}s`,
            throughput: `${rate} rows/sec`,
            errors: errors.slice(0, 10)
        };

        console.log(`[${job.id}] ✓ ${job.message}`);

    } catch (error) {
        console.error(`[${job.id}] ✗ Upload failed:`, error.message);
        job.status = 'failed';
        job.message = `Error: ${error.message}`;
        job.result = {
            success: false,
            error: error.message
        };
    } finally {
        // Clean up temp file
        try {
            if (fs.existsSync(filePath)) {
                fs.unlink(filePath, (err) => {
                    if (!err) console.log(`[${job.id}] Temp file cleaned up`);
                });
            }
        } catch (err) {
            console.warn(`[${job.id}] Failed to clean temp file:`, err.message);
        }

        job.endTime = Date.now();
    }
};

module.exports = {
    jobQueue,
    generateJobId,
    processUpload,
    getJob: (jobId) => jobQueue[jobId],
    createJob: (jobId, fileName, tempFilePath) => {
        jobQueue[jobId] = {
            id: jobId,
            fileName,
            tempFilePath,
            status: 'queued',
            message: 'Queued for processing',
            rowsProcessed: 0,
            createdAt: new Date().toISOString(),
            startTime: null,
            endTime: null,
            result: null
        };
        return jobQueue[jobId];
    }
};
