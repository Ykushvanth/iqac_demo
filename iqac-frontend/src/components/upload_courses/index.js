import React, { useState } from 'react';
import axios from 'axios';
import './index.css';

const SERVER_URL = process.env.REACT_APP_SERVER_URL || "http://localhost:5000";

const UploadCourses = () => {
    const [file, setFile] = useState(null);
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState('');

    const handleFileSelect = (event) => {
        const selectedFile = event.target.files[0];
        if (selectedFile) {
            const fileType = selectedFile.name.split('.').pop().toLowerCase();
            if (['csv', 'xlsx', 'xls'].includes(fileType)) {
                setFile(selectedFile);
                setMessage('');
            } else {
                setMessage('Error: Please select a CSV or Excel file');
                event.target.value = '';
            }
        }
    };

    const handleUpload = async () => {
        if (!file) {
            setMessage('Please select a file first');
            return;
        }

        setLoading(true);
        const formData = new FormData();
        formData.append('file', file);

        try {
            console.log('Starting course allocation upload...');
            console.log('File details:', { 
                name: file.name, 
                size: file.size, 
                type: file.type 
            });

            const response = await axios.post(`${SERVER_URL}/api/upload-courses`, formData, {
                headers: {
                    'Content-Type': 'multipart/form-data'
                },
                onUploadProgress: (progressEvent) => {
                    console.log('Upload progress:', Math.round((progressEvent.loaded * 100) / progressEvent.total));
                }
            });

            console.log('Server response:', response.data);

            if (response.data.success) {
                let successMessage = `Success! Uploaded ${response.data.inserted} course allocation records.`;
                
                if (response.data.total) {
                    successMessage += `\n\nTotal processed: ${response.data.total}`;
                    successMessage += `\nSuccessfully inserted: ${response.data.inserted}`;
                    if (response.data.skipped > 0) {
                        successMessage += `\nSkipped: ${response.data.skipped}`;
                    }
                }
                
                if (response.data.errors && response.data.errors.length > 0) {
                    successMessage += '\n\n⚠️ Error Details (first 10):';
                    response.data.errors.forEach(err => {
                        successMessage += `\n- ${err.course_code || `Row ${err.row}`}: ${err.error}`;
                    });
                    if (response.data.hasMoreErrors) {
                        successMessage += `\n\n... and ${response.data.totalErrors - 10} more errors`;
                    }
                }

                setMessage(`Success! Uploaded ${response.data.inserted} course allocation records to database.`);
                alert(successMessage);
                setFile(null);
                const fileInput = document.querySelector('input[type="file"]');
                if (fileInput) fileInput.value = '';
            } else {
                setMessage('Upload failed: ' + response.data.message);
                alert('Upload failed: ' + response.data.message);
            }
        } catch (error) {
            console.error('Upload error:', error);
            setMessage('Error: ' + (error.response?.data?.message || error.message));
            alert('Upload error: ' + (error.response?.data?.message || error.message));
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="file-upload-btn">
            <input
                type="file"
                onChange={handleFileSelect}
                accept=".csv,.xlsx,.xls"
                className="file-input"
            />
            <button 
                onClick={handleUpload}
                disabled={loading || !file}
                className="upload-button"
            >
                {loading ? (
                    <>
                        Uploading... 
                        <div className="spinner" />
                    </>
                ) : (
                    <>
                        Upload Course Allocation <span className="icon">📚</span>
                    </>
                )}
            </button>
            {loading && (
                <div className="upload-progress">
                    <div className="progress-bar" />
                </div>
            )}
            {message && (
                <p className={`selected-file ${message.includes('Success') ? 'success' : 'error'}`}>
                    {message}
                </p>
            )}
            {file && !loading && (
                <p className="selected-file">
                    Selected: {file.name}
                </p>
            )}
        </div>
    );
};

export default UploadCourses;

