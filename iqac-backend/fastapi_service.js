const axios = require('axios');

// FastAPI service configuration
const FASTAPI_BASE_URL = process.env.FASTAPI_URL || 'https://kushvanth-iqac-fast-api.hf.space';

class FastAPIService {
    constructor() {
        this.baseURL = FASTAPI_BASE_URL;
        this.timeout = 30000; // 30 seconds timeout
    }

    // Analyze comments using FastAPI
    async analyzeComments(comments, facultyInfo) {
        try {
            // Validate comments array
            if (!comments || !Array.isArray(comments)) {
                console.error('Invalid comments data:', comments);
                return {
                    success: false,
                    message: 'Comments must be an array',
                    error: 'INVALID_COMMENTS_FORMAT'
                };
            }

            if (comments.length === 0) {
                console.warn('Empty comments array provided');
                return {
                    success: false,
                    message: 'No comments provided for analysis',
                    error: 'EMPTY_COMMENTS'
                };
            }

            console.log(`\n=== Sending Comments to FastAPI ===`);
            console.log(`Total comments: ${comments.length}`);
            console.log(`Comments type: ${Array.isArray(comments) ? 'Array' : typeof comments}`);
            console.log(`First 3 comments:`, comments.slice(0, 3));
            console.log(`Faculty info:`, facultyInfo);
            
            // Ensure comments is a clean array of strings
            const cleanComments = comments.map((comment, index) => {
                if (typeof comment !== 'string') {
                    console.warn(`Comment at index ${index} is not a string:`, comment);
                    return String(comment || '').trim();
                }
                return comment.trim();
            }).filter(comment => comment.length > 0);

            if (cleanComments.length === 0) {
                console.error('All comments were invalid after cleaning');
                return {
                    success: false,
                    message: 'No valid comments after cleaning',
                    error: 'NO_VALID_COMMENTS'
                };
            }

            console.log(`Valid comments after cleaning: ${cleanComments.length}`);
            
            // Validate we have comments to send
            if (cleanComments.length === 0) {
                console.error('❌ No valid comments to send to FastAPI after cleaning!');
                return {
                    success: false,
                    message: 'No valid comments to analyze after cleaning',
                    error: 'NO_VALID_COMMENTS',
                    debug: {
                        original_count: comments.length,
                        cleaned_count: cleanComments.length,
                        sample_original: comments.slice(0, 3)
                    }
                };
            }
            
            const payload = {
                comments: cleanComments,
                faculty_info: {
                    faculty_name: facultyInfo.faculty_name || '',
                    staff_id: facultyInfo.staff_id || '',
                    course_code: facultyInfo.course_code || '',
                    course_name: facultyInfo.course_name || ''
                }
            };

            console.log(`\n=== Payload Being Sent to FastAPI ===`);
            console.log(`Payload structure:`, {
                comments_count: payload.comments.length,
                faculty_info: payload.faculty_info
            });
            console.log(`First 3 comments in payload:`, payload.comments.slice(0, 3));
            console.log(`Payload JSON size: ${JSON.stringify(payload).length} bytes`);

            const response = await axios.post(
                `${this.baseURL}/analyze-comments`,
                payload,
                {
                    timeout: this.timeout,
                    headers: {
                        'Content-Type': 'application/json'
                    }
                }
            );

            console.log('\n=== FastAPI Response Received ===');
            console.log('FastAPI response status:', response.status);
            console.log('FastAPI response data type:', typeof response.data);
            console.log('FastAPI response data keys:', Object.keys(response.data || {}));
            
            // Handle different response structures from FastAPI
            let analysisData = response.data;
            
            // If response has nested 'analysis' field, unwrap it
            if (response.data && response.data.analysis) {
                console.log('Found nested analysis structure, unwrapping...');
                analysisData = response.data.analysis;
            } else if (response.data && typeof response.data === 'object') {
                analysisData = response.data;
            }
            
            // Log full response for debugging
            console.log('\n=== Full FastAPI Response ===');
            console.log(JSON.stringify(response.data, null, 2));
            
            // Validate and normalize the analysis data structure
            console.log('\n=== Validating Analysis Structure ===');
            console.log('Analysis data keys:', Object.keys(analysisData || {}));
            
            // Ensure required fields exist with proper structure
            const normalizedAnalysis = {
                ...analysisData
            };
            
            // Check for negative_comments (could be count or boolean)
            const negativeCommentsCount = normalizedAnalysis.negative_comments || 
                                         normalizedAnalysis.negative_comments_count || 
                                         (normalizedAnalysis.negative_comments_list ? normalizedAnalysis.negative_comments_list.length : 0) ||
                                         0;
            
            // Ensure negative_comments_list is an array
            const negativeCommentsList = Array.isArray(normalizedAnalysis.negative_comments_list) 
                ? normalizedAnalysis.negative_comments_list 
                : (normalizedAnalysis.negative_comments ? [normalizedAnalysis.negative_comments] : []);
            
            // Ensure sentiment_distribution exists
            if (!normalizedAnalysis.sentiment_distribution) {
                normalizedAnalysis.sentiment_distribution = {
                    positive_percentage: 0,
                    negative_percentage: 0,
                    neutral_percentage: 0
                };
            }
            
            // Normalize the structure
            normalizedAnalysis.negative_comments = negativeCommentsCount;
            normalizedAnalysis.negative_comments_list = negativeCommentsList;
            
            // Log verification
            console.log('\n=== Negative Comments Verification ===');
            console.log('Negative comments count:', negativeCommentsCount);
            console.log('Negative comments list length:', negativeCommentsList.length);
            console.log('Has negative_comments_summary:', !!normalizedAnalysis.negative_comments_summary);
            console.log('Has sentiment_distribution:', !!normalizedAnalysis.sentiment_distribution);
            console.log('Sentiment distribution:', normalizedAnalysis.sentiment_distribution);
            
            if (negativeCommentsList.length > 0) {
                console.log('Sample negative comments (first 3):', negativeCommentsList.slice(0, 3));
            } else {
                console.warn('⚠️ WARNING: No negative comments found in FastAPI response!');
                console.log('Available keys in analysis:', Object.keys(normalizedAnalysis));
            }
            
            return {
                success: true,
                analysis: normalizedAnalysis,
                // Include raw response for debugging
                _raw_response: response.data,
                _debug: {
                    original_keys: Object.keys(analysisData || {}),
                    normalized_keys: Object.keys(normalizedAnalysis),
                    negative_comments_found: negativeCommentsCount,
                    negative_list_length: negativeCommentsList.length
                }
            };
        } catch (error) {
            console.error('Error calling FastAPI:', error);
            
            if (error.code === 'ECONNREFUSED') {
                return {
                    success: false,
                    message: 'FastAPI service is not running. Please start the FastAPI server.',
                    error: 'CONNECTION_ERROR'
                };
            }
            
            if (error.response) {
                return {
                    success: false,
                    message: `FastAPI error: ${error.response.data?.detail || error.response.statusText}`,
                    error: 'FASTAPI_ERROR',
                    status: error.response.status
                };
            }
            
            return {
                success: false,
                message: `Analysis failed: ${error.message}`,
                error: 'UNKNOWN_ERROR'
            };
        }
    }

    // Health check for FastAPI service
    async healthCheck() {
        try {
            const response = await axios.get(`${this.baseURL}/health`, {
                timeout: 5000
            });
            return {
                success: true,
                status: response.data
            };
        } catch (error) {
            return {
                success: false,
                message: 'FastAPI service is not available',
                error: error.message
            };
        }
    }
}

module.exports = new FastAPIService();
