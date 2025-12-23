const PDFDocument = require('pdfkit');
const https = require('https');

function fetchImageBuffer(url) {
    return new Promise((resolve, reject) => {
        https.get(url, (res) => {
            if (res.statusCode !== 200) {
                return reject(new Error(`Image fetch failed: ${res.statusCode}`));
            }
            const parts = [];
            res.on('data', (chunk) => parts.push(chunk));
            res.on('end', () => resolve(Buffer.concat(parts)));
            res.on('error', reject);
        }).on('error', reject);
    });
}

// Generate a Department PDF matching the provided sample format
async function generateDepartmentPdf(data) {
    return new Promise(async (resolve, reject) => {
        let doc;
        try {
            doc = new PDFDocument({ 
                margin: 50, 
                size: 'A4',
                bufferPages: true,
                autoFirstPage: true
            });
            
            const chunks = [];
            
            doc.on('data', (chunk) => {
                chunks.push(chunk);
            });
            
            doc.on('end', () => {
                try {
                    const buffer = Buffer.concat(chunks);
                    if (buffer.length === 0) {
                        reject(new Error('Generated PDF buffer is empty'));
                    } else {
                        console.log('PDF buffer created successfully, size:', buffer.length);
                        resolve(buffer);
                    }
                } catch (e) {
                    reject(new Error('Failed to create PDF buffer: ' + e.message));
                }
            });
            
            doc.on('error', (err) => {
                console.error('PDFDocument error:', err);
                reject(err);
            });

            let cursorY = 30;

            // Try to render the official logo banner at the top (optional)
            try {
                const logoUrl = 'https://www.kalasalingam.ac.in/wp-content/uploads/2022/02/Logo.png';
                const logoBuffer = await fetchImageBuffer(logoUrl);
                const usableWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
                const logoHeight = 110;
                doc.image(logoBuffer, doc.page.margins.left, cursorY, {
                    fit: [usableWidth, logoHeight],
                    align: 'center'
                });
                cursorY += logoHeight + 8;
            } catch (logoError) {
                console.warn('Logo fetch failed, continuing without header image:', logoError.message);
                cursorY += 10;
            }

            // Title block - "Office of IQAC"
            doc.fontSize(14)
               .font('Helvetica-Bold')
               .text('Office of IQAC', doc.page.margins.left, cursorY, { 
                   width: doc.page.width - doc.page.margins.left - doc.page.margins.right,
                   align: 'center' 
               });
            
            cursorY = doc.y + 10;
            
            // Main title with suffix
            const titleSuffix = data.titleSuffix ;
            const title = `Students Feedback Analysis Report-${titleSuffix}`;
            doc.fontSize(12)
               .font('Helvetica-Bold')
               .text(title, doc.page.margins.left, cursorY, { 
                   width: doc.page.width - doc.page.margins.left - doc.page.margins.right,
                   align: 'center' 
               });
            
            cursorY = doc.y + 15;

            const xLeft = 50;
            const labelFont = 'Helvetica-Bold';
            const valueFont = 'Helvetica';

            // Department line
            doc.fontSize(11).font(labelFont);
            const deptText = 'Department: ';
            doc.text(deptText, xLeft, cursorY, { continued: true })
               .font(valueFont)
               .text(data.department || '');
            
            cursorY = doc.y + 8;

            // Academic Year and Semester on same line
            doc.font(labelFont);
            doc.text('Academic Year: ', xLeft, cursorY, { continued: true })
               .font(valueFont)
               .text(data.academicYear || '2025-26', { continued: false });
            
            const semX = 330;
            doc.font(labelFont)
               .text('Semester: ', semX, cursorY, { continued: true })
               .font(valueFont)
               .text(data.semester || 'Odd');

            cursorY = doc.y + 12;

            // Observations intro
            doc.font('Helvetica')
               .fontSize(11)
               .text(
                   'The feedback analysis on Teaching – Learning process has been conducted and the following observations are made:',
                   xLeft,
                   cursorY,
                   { width: 495 }
               );
            
            cursorY = doc.y + 6;
            
            const obs = Array.isArray(data.observations) ? data.observations : [];
            if (obs.length > 0) {
                const olX = xLeft + 15;
                obs.forEach((item, idx) => {
                    doc.text(`${idx + 1}. ${item}`, olX, cursorY, { width: 480 });
                    cursorY = doc.y + 4;
                });
            }

            // Add paragraph before table
            cursorY += 8;
            doc.font('Helvetica')
               .fontSize(11)
               .text(
                   'HoD is requested to counsel faculty members with a rating of "Weakness" and "Deficiency" and obtain undertaking from them to improve the same. Faculty with a rating of "Concern" are requested to identify the reason with the help of the IQAC feedback scores in various parameters and do the needful to improve the same. Please note that a faculty receiving a rating of "Concern" continuously for 2 semesters will be rated under Weakness.',
                   xLeft,
                   cursorY,
                   { width: 495 }
               );
            
            cursorY = doc.y + 12;

            // Table
            cursorY += 8;
            const tableX = doc.page.margins.left;
            const cellPadding = 6;
            const columns = [
                { key: 'sNo', title: 'S.No', width: 40, align: 'center' },
                { key: 'course', title: 'Course Name/Code', width: 230, align: 'left' },
                { key: 'faculty', title: 'Faculty Name', width: 190, align: 'left' },
                { key: 'percentage', title: 'Percentage', width: 65, align: 'center' }
            ];

            const tableStartY = cursorY;

            const getCellText = (row, col, rowIndex, isHeader) => {
                if (isHeader) return col.title;
                if (!row) return '';
                switch (col.key) {
                    case 'sNo':
                        return String(rowIndex + 1);
                    case 'course':
                        return row.course || '';
                    case 'faculty':
                        return row.faculty || '';
                    case 'percentage':
                        if (row.percentage === undefined || row.percentage === null || row.percentage === '') {
                            return '';
                        }
                        return /%$/.test(String(row.percentage))
                            ? String(row.percentage)
                            : `${row.percentage}%`;
                    default:
                        return '';
                }
            };

            const calculateRowHeight = (row, rowIndex, isHeader = false) => {
                const fontName = isHeader ? 'Helvetica-Bold' : 'Helvetica';
                const fontSize = isHeader ? 10 : 9;
                doc.font(fontName).fontSize(fontSize);
                const baseline = doc.currentLineHeight();
                const heights = columns.map(col => {
                    const text = getCellText(row, col, rowIndex, isHeader);
                    const textHeight = doc.heightOfString(text || '', {
                        width: col.width - cellPadding * 2,
                        align: isHeader ? 'center' : (col.align || 'left')
                    });
                    return Math.max(textHeight, baseline);
                });
                return Math.max(...heights) + cellPadding * 2;
            };

            const drawTableRow = (row, rowIndex, y, isHeader = false) => {
                const fontName = isHeader ? 'Helvetica-Bold' : 'Helvetica';
                const fontSize = isHeader ? 10 : 9;
                doc.font(fontName).fontSize(fontSize);
                const rowHeight = calculateRowHeight(row, rowIndex, isHeader);
                let x = tableX;
                columns.forEach(col => {
                    const text = getCellText(row, col, rowIndex, isHeader);
                    doc.rect(x, y, col.width, rowHeight).stroke();
                    const align = isHeader ? 'center' : (col.align || 'left');
                    const previousY = doc.y;
                    doc.text(text, x + cellPadding, y + cellPadding, {
                        width: col.width - cellPadding * 2,
                        align
                    });
                    doc.y = previousY;
                    x += col.width;
                });
                return rowHeight;
            };

            // Filter rows: include only percentage < 80
            const inputRows = Array.isArray(data.rows) ? data.rows : [];
            const rows = inputRows.filter((r) => {
                if (!r) return false;
                const v = r.percentage;
                if (v === undefined || v === null || v === '') return false;
                const n = typeof v === 'string' ? parseFloat(String(v).replace(/%/g, '').trim()) : Number(v);
                return Number.isFinite(n) && n < 80;
            });

            const pageBottom = doc.page.height - doc.page.margins.bottom;
            let currentY = tableStartY;

            const headerHeight = drawTableRow(null, -1, currentY, true);
            currentY += headerHeight;

            const rowData = rows.length > 0 ? rows : [{ course: 'NIL', faculty: '', percentage: '' }];

            rowData.forEach((row, rowIndex) => {
                const calculatedHeight = calculateRowHeight(row, rowIndex, false);
                if (currentY + calculatedHeight > pageBottom) {
                    doc.addPage();
                    currentY = doc.page.margins.top;
                    const newHeaderHeight = drawTableRow(null, -1, currentY, true);
                    currentY += newHeaderHeight;
                }
                const renderedHeight = drawTableRow(row, rowIndex, currentY, false);
                currentY += renderedHeight;
            });

            // Add feedback rating table after main analysis table
            currentY += 15;
            
            // Check if we need a new page for the rating table
            const ratingTableHeight = 80; // Approximate height for rating table
            if (currentY + ratingTableHeight > pageBottom) {
                doc.addPage();
                currentY = doc.page.margins.top;
            }

            // Draw feedback rating table
            const ratingTableX = tableX;
            const ratingTableY = currentY;
            const ratingColumns = [
                { title: 'Faculty with Average Score', width: 280, align: 'left' },
                { title: 'Rating', width: 215, align: 'left' }
            ];

            const ratingData = [
                { score: '>= 80%', rating: 'Complied' },
                { score: '70% - 80%', rating: 'Concern' },
                { score: '60% - 70%', rating: 'Weakness' },
                { score: '<60%', rating: 'Deficiency' }
            ];

            // Draw table title
            doc.font('Helvetica-Bold')
               .fontSize(10)
               .text('Feedback rating:', ratingTableX, ratingTableY);
            
            const ratingTableStartY = doc.y + 6;

            // Draw header row
            doc.font('Helvetica-Bold').fontSize(9);
            let ratingX = ratingTableX;
            const ratingRowHeight = 20;
            let ratingCurrentY = ratingTableStartY;
            
            ratingColumns.forEach(col => {
                doc.rect(ratingX, ratingCurrentY, col.width, ratingRowHeight).stroke();
                doc.text(col.title, ratingX + cellPadding, ratingCurrentY + cellPadding, {
                    width: col.width - cellPadding * 2,
                    align: col.align || 'left'
                });
                ratingX += col.width;
            });

            // Draw data rows
            ratingCurrentY += ratingRowHeight;
            ratingData.forEach((item, idx) => {
                ratingX = ratingTableX;
                ratingColumns.forEach((col, colIdx) => {
                    doc.rect(ratingX, ratingCurrentY, col.width, ratingRowHeight).stroke();
                    const text = colIdx === 0 ? item.score : item.rating;
                    doc.font('Helvetica').fontSize(9);
                    doc.text(text, ratingX + cellPadding, ratingCurrentY + cellPadding, {
                        width: col.width - cellPadding * 2,
                        align: col.align || 'left'
                    });
                    ratingX += col.width;
                });
                ratingCurrentY += ratingRowHeight;
            });

            // Finalize the PDF
            console.log('Finalizing PDF document...');
            doc.end();
            
        } catch (err) {
            console.error('PDF Generation Error:', err);
            if (doc) {
                try {
                    doc.end();
                } catch (e) {
                    console.error('Error ending document:', e);
                }
            }
            reject(err);
        }
    });
}

// Generate school-wise PDF (multiple departments in one PDF)
async function generateSchoolPdf(data) {
    return new Promise(async (resolve, reject) => {
        let doc;
        try {
            doc = new PDFDocument({ 
                margin: 50, 
                size: 'A4',
                bufferPages: true,
                autoFirstPage: true
            });
            
            const chunks = [];
            
            doc.on('data', (chunk) => {
                chunks.push(chunk);
            });
            
            doc.on('end', () => {
                try {
                    const buffer = Buffer.concat(chunks);
                    if (buffer.length === 0) {
                        reject(new Error('Generated PDF buffer is empty'));
                    } else {
                        console.log('PDF buffer created successfully, size:', buffer.length);
                        resolve(buffer);
                    }
                } catch (e) {
                    reject(new Error('Failed to create PDF buffer: ' + e.message));
                }
            });
            
            doc.on('error', (err) => {
                console.error('PDFDocument error:', err);
                reject(err);
            });

            // data.departments should be an array of { department, rows, observations, ... }
            const departments = Array.isArray(data.departments) ? data.departments : [];
            
            for (let deptIndex = 0; deptIndex < departments.length; deptIndex++) {
                const deptData = departments[deptIndex];
                
                // Add new page for each department (except first)
                if (deptIndex > 0) {
                    doc.addPage();
                }
                
                let cursorY = 30;

                // Try to render the official logo banner at the top (optional)
                try {
                    const logoUrl = 'https://www.kalasalingam.ac.in/wp-content/uploads/2022/02/Logo.png';
                    const logoBuffer = await fetchImageBuffer(logoUrl);
                    const usableWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
                    const logoHeight = 110;
                    doc.image(logoBuffer, doc.page.margins.left, cursorY, {
                        fit: [usableWidth, logoHeight],
                        align: 'center'
                    });
                    cursorY += logoHeight + 8;
                } catch (logoError) {
                    console.warn('Logo fetch failed, continuing without header image:', logoError.message);
                    cursorY += 10;
                }

                // Title block - "Office of IQAC"
                doc.fontSize(14)
                   .font('Helvetica-Bold')
                   .text('Office of IQAC', doc.page.margins.left, cursorY, { 
                       width: doc.page.width - doc.page.margins.left - doc.page.margins.right,
                       align: 'center' 
                   });
                
                cursorY = doc.y + 10;
                
                // Main title with suffix
                const titleSuffix = deptData.titleSuffix || data.titleSuffix ;
                const title = `Students Feedback Analysis Report-${titleSuffix}`;
                doc.fontSize(12)
                   .font('Helvetica-Bold')
                   .text(title, doc.page.margins.left, cursorY, { 
                       width: doc.page.width - doc.page.margins.left - doc.page.margins.right,
                       align: 'center' 
                   });
                
                cursorY = doc.y + 15;

                const xLeft = 50;
                const labelFont = 'Helvetica-Bold';
                const valueFont = 'Helvetica';

                // School line
                doc.fontSize(11).font(labelFont);
                doc.text('School: ', xLeft, cursorY, { continued: true })
                   .font(valueFont)
                   .text(data.school || '');
                
                cursorY = doc.y + 8;

                // Department line
                doc.font(labelFont);
                const deptText = 'Department: ';
                doc.text(deptText, xLeft, cursorY, { continued: true })
                   .font(valueFont)
                   .text(deptData.department || '');
                
                cursorY = doc.y + 8;

                // Academic Year and Semester on same line
                doc.font(labelFont);
                doc.text('Academic Year: ', xLeft, cursorY, { continued: true })
                   .font(valueFont)
                   .text(deptData.academicYear || data.academicYear || '2025-26', { continued: false });
                
                const semX = 330;
                doc.font(labelFont)
                   .text('Semester: ', semX, cursorY, { continued: true })
                   .font(valueFont)
                   .text(deptData.semester || data.semester || 'Odd');

                cursorY = doc.y + 12;

                // Observations intro
                doc.font('Helvetica')
                   .fontSize(11)
                   .text(
                       'The feedback analysis on Teaching – Learning process has been conducted and the following observations are made:',
                       xLeft,
                       cursorY,
                       { width: 495 }
                   );
                
                cursorY = doc.y + 6;
                
                const obs = Array.isArray(deptData.observations) ? deptData.observations : [];
                if (obs.length > 0) {
                    const olX = xLeft + 15;
                    obs.forEach((item, idx) => {
                        doc.text(`${idx + 1}. ${item}`, olX, cursorY, { width: 480 });
                        cursorY = doc.y + 4;
                    });
                }

                // Add paragraph before table
                cursorY += 8;
                doc.font('Helvetica')
                   .fontSize(11)
                   .text(
                       'HoD is requested to counsel faculty members with a rating of "Weakness" and "Deficiency" and obtain undertaking from them to improve the same. Faculty with a rating of "Concern" are requested to identify the reason with the help of the IQAC feedback scores in various parameters and do the needful to improve the same. Please note that a faculty receiving a rating of "Concern" continuously for 2 semesters will be rated under Weakness.',
                       xLeft,
                       cursorY,
                       { width: 495 }
                   );
                
                cursorY = doc.y + 12;

                // Table
                cursorY += 8;
                const tableX = doc.page.margins.left;
                const cellPadding = 6;
                const columns = [
                    { key: 'sNo', title: 'S.No', width: 40, align: 'center' },
                    { key: 'course', title: 'Course Name/Code', width: 230, align: 'left' },
                    { key: 'faculty', title: 'Faculty Name', width: 190, align: 'left' },
                    { key: 'percentage', title: 'Percentage', width: 65, align: 'center' }
                ];

                const tableStartY = cursorY;

                const getCellText = (row, col, rowIndex, isHeader) => {
                    if (isHeader) return col.title;
                    if (!row) return '';
                    switch (col.key) {
                        case 'sNo':
                            return String(rowIndex + 1);
                        case 'course':
                            return row.course || '';
                        case 'faculty':
                            return row.faculty || '';
                        case 'percentage':
                            if (row.percentage === undefined || row.percentage === null || row.percentage === '') {
                                return '';
                            }
                            return /%$/.test(String(row.percentage))
                                ? String(row.percentage)
                                : `${row.percentage}%`;
                        default:
                            return '';
                    }
                };

                const calculateRowHeight = (row, rowIndex, isHeader = false) => {
                    const fontName = isHeader ? 'Helvetica-Bold' : 'Helvetica';
                    const fontSize = isHeader ? 10 : 9;
                    doc.font(fontName).fontSize(fontSize);
                    const baseline = doc.currentLineHeight();
                    const heights = columns.map(col => {
                        const text = getCellText(row, col, rowIndex, isHeader);
                        const textHeight = doc.heightOfString(text || '', {
                            width: col.width - cellPadding * 2,
                            align: isHeader ? 'center' : (col.align || 'left')
                        });
                        return Math.max(textHeight, baseline);
                    });
                    return Math.max(...heights) + cellPadding * 2;
                };

                const drawTableRow = (row, rowIndex, y, isHeader = false) => {
                    const fontName = isHeader ? 'Helvetica-Bold' : 'Helvetica';
                    const fontSize = isHeader ? 10 : 9;
                    doc.font(fontName).fontSize(fontSize);
                    const rowHeight = calculateRowHeight(row, rowIndex, isHeader);
                    let x = tableX;
                    columns.forEach(col => {
                        const text = getCellText(row, col, rowIndex, isHeader);
                        doc.rect(x, y, col.width, rowHeight).stroke();
                        const align = isHeader ? 'center' : (col.align || 'left');
                        const previousY = doc.y;
                        doc.text(text, x + cellPadding, y + cellPadding, {
                            width: col.width - cellPadding * 2,
                            align
                        });
                        doc.y = previousY;
                        x += col.width;
                    });
                    return rowHeight;
                };

                // Filter rows: include only percentage < 80
                const inputRows = Array.isArray(deptData.rows) ? deptData.rows : [];
                const rows = inputRows.filter((r) => {
                    if (!r) return false;
                    const v = r.percentage;
                    if (v === undefined || v === null || v === '') return false;
                    const n = typeof v === 'string' ? parseFloat(String(v).replace(/%/g, '').trim()) : Number(v);
                    return Number.isFinite(n) && n < 80;
                });

                const pageBottom = doc.page.height - doc.page.margins.bottom;
                let currentY = tableStartY;

                const headerHeight = drawTableRow(null, -1, currentY, true);
                currentY += headerHeight;

                const rowData = rows.length > 0 ? rows : [{ course: 'NIL', faculty: '', percentage: '' }];

                rowData.forEach((row, rowIndex) => {
                    const calculatedHeight = calculateRowHeight(row, rowIndex, false);
                    if (currentY + calculatedHeight > pageBottom) {
                        doc.addPage();
                        currentY = doc.page.margins.top;
                        const newHeaderHeight = drawTableRow(null, -1, currentY, true);
                        currentY += newHeaderHeight;
                    }
                    const renderedHeight = drawTableRow(row, rowIndex, currentY, false);
                    currentY += renderedHeight;
                });

                // Add feedback rating table after main analysis table
                currentY += 15;
                
                // Check if we need a new page for the rating table
                const ratingTableHeight = 80; // Approximate height for rating table
                if (currentY + ratingTableHeight > pageBottom) {
                    doc.addPage();
                    currentY = doc.page.margins.top;
                }

                // Draw feedback rating table
                const ratingTableX = tableX;
                const ratingTableY = currentY;
                const ratingColumns = [
                    { title: 'Faculty with Average Score', width: 280, align: 'left' },
                    { title: 'Rating', width: 215, align: 'left' }
                ];

                const ratingData = [
                    { score: '>= 80%', rating: 'Complied' },
                    { score: '70% - 80%', rating: 'Concern' },
                    { score: '60% - 70%', rating: 'Weakness' },
                    { score: '<60%', rating: 'Deficiency' }
                ];

                // Draw table title
                doc.font('Helvetica-Bold')
                   .fontSize(10)
                   .text('Feedback rating:', ratingTableX, ratingTableY);
                
                const ratingTableStartY = doc.y + 6;

                // Draw header row
                doc.font('Helvetica-Bold').fontSize(9);
                let ratingX = ratingTableX;
                const ratingRowHeight = 20;
                let ratingCurrentY = ratingTableStartY;
                
                ratingColumns.forEach(col => {
                    doc.rect(ratingX, ratingCurrentY, col.width, ratingRowHeight).stroke();
                    doc.text(col.title, ratingX + cellPadding, ratingCurrentY + cellPadding, {
                        width: col.width - cellPadding * 2,
                        align: col.align || 'left'
                    });
                    ratingX += col.width;
                });

                // Draw data rows
                ratingCurrentY += ratingRowHeight;
                ratingData.forEach((item, idx) => {
                    ratingX = ratingTableX;
                    ratingColumns.forEach((col, colIdx) => {
                        doc.rect(ratingX, ratingCurrentY, col.width, ratingRowHeight).stroke();
                        const text = colIdx === 0 ? item.score : item.rating;
                        doc.font('Helvetica').fontSize(9);
                        doc.text(text, ratingX + cellPadding, ratingCurrentY + cellPadding, {
                            width: col.width - cellPadding * 2,
                            align: col.align || 'left'
                        });
                        ratingX += col.width;
                    });
                    ratingCurrentY += ratingRowHeight;
                });
            }

            // Finalize the PDF
            console.log('Finalizing PDF document...');
            doc.end();
            
        } catch (err) {
            console.error('PDF Generation Error:', err);
            if (doc) {
                try {
                    doc.end();
                } catch (e) {
                    console.error('Error ending document:', e);
                }
            }
            reject(err);
        }
    });
}

// Generate a Department PDF with Negative Comments
async function generateDepartmentNegativeCommentsPdf(data) {
    return new Promise(async (resolve, reject) => {
        let doc;
        try {
            doc = new PDFDocument({ 
                margin: 50, 
                size: 'A4',
                bufferPages: true,
                autoFirstPage: true
            });
            
            const chunks = [];
            
            doc.on('data', (chunk) => {
                chunks.push(chunk);
            });
            
            doc.on('end', () => {
                try {
                    const buffer = Buffer.concat(chunks);
                    if (buffer.length === 0) {
                        reject(new Error('Generated PDF buffer is empty'));
                    } else {
                        console.log('PDF buffer created successfully, size:', buffer.length);
                        resolve(buffer);
                    }
                } catch (e) {
                    reject(new Error('Failed to create PDF buffer: ' + e.message));
                }
            });
            
            doc.on('error', (err) => {
                console.error('PDFDocument error:', err);
                reject(err);
            });

            let cursorY = 30;

            // Try to render the official logo banner at the top (optional)
            try {
                const logoUrl = 'https://www.kalasalingam.ac.in/wp-content/uploads/2022/02/Logo.png';
                const logoBuffer = await fetchImageBuffer(logoUrl);
                const usableWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
                const logoHeight = 110;
                doc.image(logoBuffer, doc.page.margins.left, cursorY, {
                    fit: [usableWidth, logoHeight],
                    align: 'center'
                });
                cursorY += logoHeight + 8;
            } catch (logoError) {
                console.warn('Logo fetch failed, continuing without header image:', logoError.message);
                cursorY += 10;
            }

            // Title block - "Office of IQAC"
            doc.fontSize(14)
               .font('Helvetica-Bold')
               .text('Office of IQAC', doc.page.margins.left, cursorY, { 
                   width: doc.page.width - doc.page.margins.left - doc.page.margins.right,
                   align: 'center' 
               });
            
            cursorY = doc.y + 12;
            
            // Main title with suffix
            const titleSuffix = data.titleSuffix || 'A 2025-26 (Odd Semester)';
            const title = `Open Comments on Students Feedback-${titleSuffix}`;
            doc.fontSize(12)
               .font('Helvetica-Bold')
               .text(title, doc.page.margins.left, cursorY, { 
                   width: doc.page.width - doc.page.margins.left - doc.page.margins.right,
                   align: 'center' 
               });
            
            cursorY = doc.y + 18;

            const xLeft = 50;
            const labelFont = 'Helvetica-Bold';
            const valueFont = 'Helvetica';

            // Department line
            doc.fontSize(11).font(labelFont);
            const deptText = 'Department: ';
            doc.text(deptText, xLeft, cursorY, { continued: true })
               .font(valueFont)
               .text(data.department || '');
            
            cursorY = doc.y + 10;

            // Academic Year and Semester on same line
            doc.font(labelFont);
            doc.text('Academic Year: ', xLeft, cursorY, { continued: true })
               .font(valueFont)
               .text(data.academicYear || '2025-26', { continued: false });
            
            const semX = 330;
            doc.font(labelFont)
               .text('Semester: ', semX, cursorY, { continued: true })
               .font(valueFont)
               .text(data.semester || 'Odd');

            cursorY = doc.y + 15;

            // Observations intro
            doc.font('Helvetica')
               .fontSize(11)
               .text(
                   'The feedback analysis on Teaching – Learning process has been conducted and the following observations are made:',
                   xLeft,
                   cursorY,
                   { width: 495 }
               );
            
            cursorY = doc.y + 6;
            
            const obs = Array.isArray(data.observations) ? data.observations : [];
            if (obs.length > 0) {
                const olX = xLeft + 15;
                obs.forEach((item, idx) => {
                    doc.text(`${idx + 1}. ${item}`, olX, cursorY, { width: 480 });
                    cursorY = doc.y + 4;
                });
            }

            // Note section before table
            cursorY += 8;
            doc.font('Helvetica-Bold')
               .fontSize(11)
               .text('Note:', xLeft, cursorY);
            
            cursorY = doc.y + 6;
            doc.font('Helvetica')
               .fontSize(10)
               .text(
                   '1. For the following faculty members, although some students have given positive/neutral comments, the following negative comments are of serious concern and require immediate attention from both the faculty and HoD',
                   xLeft,
                   cursorY,
                   { width: 495 }
               );
            
            cursorY = doc.y + 6;
            doc.font('Helvetica')
               .fontSize(10)
               .text(
                   '2. The comments given by the students are enclosed here as it is without any language/spelling/grammar corrections.',
                   xLeft,
                   cursorY,
                   { width: 495 }
               );

            // Table
            cursorY += 15;
            const tableX = doc.page.margins.left;
            const cellPadding = 10;
            const usableWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
            
            // Professional three-column layout: Faculty Name | Course Name & Code | Student Comments
            const columns = [
                { key: 'faculty', title: 'Faculty Name', width: 160, align: 'left' },
                { key: 'course', title: 'Course Name & Code', width: 200, align: 'left' },
                { key: 'comments', title: 'Student Comments', width: usableWidth - 160 - 200, align: 'justify' }
            ];

            const tableStartY = cursorY;

            const getCellText = (row, col, rowIndex, isHeader) => {
                if (isHeader) return col.title;
                if (!row) return '';
                switch (col.key) {
                    case 'course':
                        return row.course || '';
                    case 'faculty':
                        return row.faculty || '';
                    case 'comments':
                        // Join comments with newlines and add spacing
                        if (Array.isArray(row.comments)) {
                            return row.comments.filter(c => c && c.trim()).join('\n\n');
                        }
                        return row.comments || '';
                    default:
                        return '';
                }
            };

            const calculateRowHeight = (row, rowIndex, isHeader = false) => {
                const fontName = isHeader ? 'Helvetica-Bold' : 'Helvetica';
                const fontSize = isHeader ? 11 : 11; // Consistent font size
                doc.font(fontName).fontSize(fontSize);
                const lineHeight = doc.currentLineHeight();
                const minRowHeight = lineHeight + cellPadding * 2;
                const lineGap = isHeader ? 0 : 4; // Consistent line spacing
                
                const heights = columns.map(col => {
                    const text = getCellText(row, col, rowIndex, isHeader);
                    if (!text || text.trim() === '') return lineHeight;
                    
                    // Calculate text width available (ensure positive)
                    const textWidth = Math.max(10, col.width - cellPadding * 2);
                    
                    // Calculate height using the same parameters as rendering
                    const textHeight = doc.heightOfString(text, {
                        width: textWidth,
                        align: isHeader ? 'center' : col.align,
                        lineGap: lineGap,
                        paragraphGap: 0
                    });
                    
                    // Ensure minimum height
                    return Math.max(textHeight, lineHeight);
                });
                
                // Get the maximum height and add padding
                const maxHeight = Math.max(...heights);
                const finalHeight = maxHeight + (cellPadding * 2);
                
                return Math.max(finalHeight, minRowHeight);
            };

            const drawTableRow = (row, rowIndex, y, isHeader = false) => {
                const fontName = isHeader ? 'Helvetica-Bold' : 'Helvetica';
                const fontSize = 11; // Consistent font size (Calibri/Arial equivalent)
                const rowHeight = calculateRowHeight(row, rowIndex, isHeader);
                let x = tableX;
                
                // Save current Y position to restore after drawing
                const savedY = doc.y;
                
                columns.forEach((col, colIndex) => {
                    // For header, add light background fill
                    if (isHeader) {
                        doc.rect(x, y, col.width, rowHeight)
                           .fill('#F5F5F5'); // Light gray background
                    }
                    
                    // Get text for this cell
                    const text = getCellText(row, col, rowIndex, isHeader);
                    
                    // Calculate text position and width (strictly within cell)
                    const textX = x + cellPadding;
                    const textY = y + cellPadding;
                    const textWidth = Math.max(0, col.width - (cellPadding * 2)); // Ensure no overflow
                    const align = isHeader ? 'center' : col.align;
                    const lineGap = isHeader ? 0 : 4; // Consistent line spacing
                    
                    if (text) {
                        // Set font and size
                        doc.font(fontName).fontSize(fontSize);
                        
                        // Ensure text color is black
                        doc.fillColor('#000000');
                        
                        // Save graphics state for clipping
                        doc.save();
                        
                        // Clip to cell boundaries to prevent overflow
                        doc.rect(x, y, col.width, rowHeight).clip();
                        
                        // Draw text with proper alignment
                        doc.text(text, textX, textY, {
                            width: textWidth,
                            align: align,
                            lineGap: lineGap,
                            paragraphGap: 0,
                            ellipsis: false
                        });
                        
                        // Restore graphics state (removes clipping)
                        doc.restore();
                    }
                    
                    // Draw light border for each cell
                    doc.lineWidth(0.5); // Light border
                    doc.rect(x, y, col.width, rowHeight).stroke();
                    doc.lineWidth(1); // Reset to default
                    
                    x += col.width;
                });
                
                // Restore Y position
                doc.y = savedY;
                
                return rowHeight;
            };

            // Filter rows: include only those with negative comments
            const inputRows = Array.isArray(data.rows) ? data.rows : [];
            const rows = inputRows.filter((r) => {
                if (!r) return false;
                const comments = r.comments;
                return comments && (
                    (Array.isArray(comments) && comments.length > 0) ||
                    (typeof comments === 'string' && comments.trim().length > 0)
                );
            });

            // Calculate available page height more accurately
            const pageTop = doc.page.margins.top;
            const pageBottom = doc.page.height - doc.page.margins.bottom;
            const availableHeight = pageBottom - pageTop;
            const minSpaceForHeader = 50; // Space needed for header on new page
            
            let currentY = tableStartY;

            // Draw header
            const headerHeight = drawTableRow(null, -1, currentY, true);
            currentY += headerHeight;

            const rowData = rows.length > 0 ? rows : [{ course: 'NIL', faculty: '', comments: [] }];

            rowData.forEach((row, rowIndex) => {
                // Calculate row height before drawing
                const calculatedHeight = calculateRowHeight(row, rowIndex, false);
                
                // Check if we need a new page
                // Prevent text wrapping across pages - each faculty entry stays together
                const spaceRemaining = pageBottom - currentY;
                const headerHeight = calculateRowHeight(null, -1, true);
                
                // If the row won't fit on current page, move to next page
                // Ensure we have enough space for the entire row
                if (calculatedHeight > spaceRemaining) {
                    doc.addPage();
                    currentY = doc.page.margins.top;
                    
                    // Redraw header on new page
                    const newHeaderHeight = drawTableRow(null, -1, currentY, true);
                    currentY += newHeaderHeight;
                }
                
                // Draw the row (entire row stays together)
                const renderedHeight = drawTableRow(row, rowIndex, currentY, false);
                currentY += renderedHeight;
                
                // Add consistent padding between rows
                currentY += 2;
            });

            // Finalize the PDF
            console.log('Finalizing PDF document...');
            doc.end();
            
        } catch (err) {
            console.error('PDF Generation Error:', err);
            if (doc) {
                try {
                    doc.end();
                } catch (e) {
                    console.error('Error ending document:', e);
                }
            }
            reject(err);
        }
    });
}

module.exports = { generateDepartmentPdf, generateSchoolPdf, generateDepartmentNegativeCommentsPdf };