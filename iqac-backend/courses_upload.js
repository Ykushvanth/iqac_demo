const { createClient } = require('@supabase/supabase-js');
const XLSX = require('xlsx');
const dotenv = require('dotenv');

// Load environment variables
dotenv.config();

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

// Helper function to parse integer or return null
const parseIntOrNull = (val) => {
    if (val === null || val === undefined || val === "" || val === "NULL") return null;
    const n = parseInt(val, 10);
    return isNaN(n) ? null : n;
};

const handleCoursesUpload = async (file) => {
    try {
        // Add detailed file logging
        console.log('Courses file received:', {
            name: file.name,
            size: file.size,
            mimetype: file.mimetype,
            hasData: !!file.data
        });

        if (!file || !file.data) {
            throw new Error('Invalid file or empty file received');
        }

        // Parse XLSX from buffer
        console.log('Attempting to parse Excel file...');
        const workbook = XLSX.read(file.data, { type: "buffer" });
        console.log('Excel file parsed successfully');
        console.log('Available sheets:', workbook.SheetNames);

        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(sheet);
        console.log('Number of rows found:', rows.length);
        console.log('Sample row:', rows[0]);

        if (!rows || rows.length === 0) {
            throw new Error('No data found in file');
        }

        // Validate required columns
        const requiredColumns = ['dept', 'degree', 'arts_or_engg', 'ug_or_pg', 'short_form', 'specialization', 
                                 'batch', 'sec', 'assign_id', 'course_code', 'course_name', 'credits', 
                                 'theory_or_practical', 'category_code', 'code', 'staff_dept', 
                                 'staff_id', 'staffid', 'staff_name'];
        
        const firstRow = rows[0];
        const missingColumns = requiredColumns.filter(col => !(col in firstRow));
        
        if (missingColumns.length > 0) {
            throw new Error(`Missing required columns: ${missingColumns.join(', ')}`);
        }

        // Process all rows - INSERT ALL
        let insertedCount = 0;
        let skippedCount = 0;
        const errors = [];
        const batchSize = 500; // Insert in batches of 500 for better performance
        let currentBatch = [];

        console.log(`Inserting ALL ${rows.length} course allocations...`);

        for (let i = 0; i < rows.length; i++) {
            const r = rows[i];
            
            try {
                // Helper to truncate strings to match VARCHAR limits
                const truncate = (str, maxLength) => {
                    if (!str) return null;
                    const trimmed = str.toString().trim();
                    return trimmed.length > maxLength ? trimmed.substring(0, maxLength) : trimmed;
                };

                const obj = {
                    dept: truncate(r.dept, 10),
                    degree: truncate(r.degree, 20),
                    arts_or_engg: truncate(r.arts_or_engg, 10),
                    ug_or_pg: truncate(r.ug_or_pg, 10),
                    short_form: truncate(r.short_form, 20),
                    specialization: truncate(r.specialization, 100),
                    batch: parseIntOrNull(r.batch),
                    sec: truncate(r.sec, 5),
                    assign_id: parseIntOrNull(r.assign_id),
                    course_code: truncate(r.course_code, 20),
                    course_name: truncate(r.course_name, 150),
                    credits: parseIntOrNull(r.credits),
                    theory_or_practical: truncate(r.theory_or_practical, 50),
                    category_code: truncate(r.category_code, 100),
                    code: truncate(r.code, 10),
                    staff_dept: truncate(r.staff_dept, 20),
                    staff_id: parseIntOrNull(r.staff_id),
                    staffid: truncate(r.staffid, 20),
                    staff_name: truncate(r.staff_name, 100)
                };

                // Validate required fields are not null
                const nullFields = Object.entries(obj)
                    .filter(([key, value]) => value === null)
                    .map(([key]) => key);
                
                if (nullFields.length > 0) {
                    skippedCount++;
                    errors.push({
                        row: i + 2, // +2 for Excel row number (1-indexed + header)
                        course_code: r.course_code,
                        error: `Missing required fields: ${nullFields.join(', ')}`
                    });
                    continue;
                }

                // Add to batch
                currentBatch.push(obj);

                // Insert batch when it reaches batchSize or it's the last record
                if (currentBatch.length >= batchSize || i === rows.length - 1) {
                    const { data, error: batchError } = await supabase
                        .from('course_allocation')
                        .insert(currentBatch)
                        .select();

                    if (batchError) {
                        // Log the actual batch error
                        console.error(`Batch insert failed at row ${i + 1}:`, batchError);
                        console.error(`Batch error details:`, JSON.stringify(batchError, null, 2));
                        console.error(`Batch size: ${currentBatch.length}`);
                        console.error(`Sample record from failed batch:`, JSON.stringify(currentBatch[0], null, 2));
                        
                        // Try smaller batches first (100 records) before going one-by-one
                        const smallerBatchSize = 100;
                        let smallerBatchInserted = 0;
                        let smallerBatchFailed = false;
                        
                        if (currentBatch.length > smallerBatchSize) {
                            console.log(`Trying smaller batches of ${smallerBatchSize}...`);
                            for (let k = 0; k < currentBatch.length; k += smallerBatchSize) {
                                const smallerBatch = currentBatch.slice(k, k + smallerBatchSize);
                                const { error: smallerBatchError } = await supabase
                                    .from('course_allocation')
                                    .insert(smallerBatch);
                                
                                if (smallerBatchError) {
                                    console.error(`Smaller batch also failed at offset ${k}:`, smallerBatchError.message);
                                    smallerBatchFailed = true;
                                    break;
                                } else {
                                    smallerBatchInserted += smallerBatch.length;
                                }
                            }
                        }
                        
                        // If smaller batches worked, we're done with this batch
                        if (!smallerBatchFailed && smallerBatchInserted > 0) {
                            insertedCount += smallerBatchInserted;
                            // Handle any remaining records that didn't fit in smaller batches
                            const remainingRecords = currentBatch.length - smallerBatchInserted;
                            if (remainingRecords > 0) {
                                console.log(`Processing ${remainingRecords} remaining records individually...`);
                                const remainingBatch = currentBatch.slice(smallerBatchInserted);
                                for (let j = 0; j < remainingBatch.length; j++) {
                                    const course = remainingBatch[j];
                                    const { error: individualError } = await supabase
                                        .from('course_allocation')
                                        .insert([course]);
                                    
                                    if (individualError) {
                                        skippedCount++;
                                        errors.push({
                                            row: i - remainingBatch.length + j + 2,
                                            course_code: course.course_code,
                                            error: individualError.message || JSON.stringify(individualError)
                                        });
                                    } else {
                                        insertedCount++;
                                    }
                                }
                            }
                        } else {
                            // If smaller batches failed or weren't tried, go one by one
                            console.log(`Falling back to individual inserts for ${currentBatch.length} records...`);
                            for (let j = 0; j < currentBatch.length; j++) {
                                const course = currentBatch[j];
                                const { error: individualError } = await supabase
                                    .from('course_allocation')
                                    .insert([course]);
                                
                                if (individualError) {
                                    skippedCount++;
                                    errors.push({
                                        row: i - currentBatch.length + j + 2,
                                        course_code: course.course_code,
                                        error: individualError.message || JSON.stringify(individualError)
                                    });
                                    // Log first few individual errors for debugging
                                    if (errors.length <= 5) {
                                        console.error(`Individual insert failed for ${course.course_code}:`, individualError.message);
                                    }
                                } else {
                                    insertedCount++;
                                }
                            }
                        }
                    } else {
                        insertedCount += currentBatch.length;
                    }

                    // Log progress every batch
                    console.log(`Progress: ${insertedCount + skippedCount}/${rows.length} (${insertedCount} inserted, ${skippedCount} skipped)`);
                    
                    // Clear batch
                    currentBatch = [];
                }

            } catch (rowError) {
                skippedCount++;
                errors.push({
                    row: i + 2,
                    course_code: r.course_code,
                    error: rowError.message
                });
            }
        }

        console.log(`Upload complete: ${insertedCount} inserted, ${skippedCount} skipped out of ${rows.length} total course allocations`);

        const response = {
            success: true,
            message: `Successfully processed ${rows.length} records`,
            inserted: insertedCount,
            skipped: skippedCount,
            total: rows.length
        };

        if (errors.length > 0) {
            response.errors = errors.slice(0, 10); // Return first 10 errors
            response.hasMoreErrors = errors.length > 10;
            response.totalErrors = errors.length;
        }

        return response;

    } catch (error) {
        console.error('Detailed error:', error);
        return {
            success: false,
            message: error.message || 'Upload failed',
            error: error
        };
    }
};

module.exports = { handleCoursesUpload };