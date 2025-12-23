const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');

// Load environment variables
dotenv.config();

// Initialize Supabase client
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

// Get all questions with their section types
const getAllQuestions = async () => {
    try {
        const { data, error } = await supabase
            .from('questions')
            .select('*')
            .order('id');
            
        if (error) throw error;
        return data;
    } catch (error) {
        console.error('Error fetching questions:', error);
        throw error;
    }
};

// Get questions by section type
const getQuestionsBySection = async (sectionType) => {
    try {
        const { data, error } = await supabase
            .from('questions')
            .select('*')
            .eq('section_type', sectionType)
            .order('id');
            
        if (error) throw error;
        return data;
    } catch (error) {
        console.error(`Error fetching questions for section ${sectionType}:`, error);
        throw error;
    }
};

// Get all distinct section types
const getDistinctSectionTypes = async () => {
    try {
        const { data, error } = await supabase
            .from('questions')
            .select('section_type')
            .order('section_type');
            
        if (error) throw error;
        
        // Extract unique section types
        const uniqueSectionTypes = [...new Set(data.map(item => item.section_type))];
        return uniqueSectionTypes;
    } catch (error) {
        console.error('Error fetching distinct section types:', error);
        throw error;
    }
};

// Get all question options
const getAllOptions = async () => {
    try {
        const { data, error } = await supabase
            .from('question_options')
            .select('*')
            .order('id');
            
        if (error) throw error;
        return data;
    } catch (error) {
        console.error('Error fetching question options:', error);
        throw error;
    }
};

// Get options for a specific question
const getOptionsForQuestion = async (questionId) => {
    try {
        const { data, error } = await supabase
            .from('question_options')
            .select('*')
            .eq('question_id', questionId)
            .order('id');
            
        if (error) throw error;
        return data;
    } catch (error) {
        console.error(`Error fetching options for question ${questionId}:`, error);
        throw error;
    }
};

// Get questions with their options
const getQuestionsWithOptions = async () => {
    try {
        // First get all questions
        const questions = await getAllQuestions();
        
        // For each question, get its options
        const questionsWithOptions = await Promise.all(
            questions.map(async (question) => {
                const options = await getOptionsForQuestion(question.id);
                return {
                    ...question,
                    options
                };
            })
        );
        
        return questionsWithOptions;
    } catch (error) {
        console.error('Error fetching questions with options:', error);
        throw error;
    }
};

// Submit feedback to the course_feedback table
const submitFeedback = async (feedbackData) => {
    try {
        const { data, error } = await supabase
            .from('course_feedback')
            .insert([feedbackData]);
            
        if (error) throw error;
        return { success: true, message: 'Feedback submitted successfully' };
    } catch (error) {
        console.error('Error submitting feedback:', error);
        throw error;
    }
};

// Add a new question
const addQuestion = async (questionData) => {
    try {
        const { data, error } = await supabase
            .from('questions')
            .insert([questionData])
            .select(); // Add select() to return the inserted data
            
        if (error) throw error;
        
        // Ensure data is properly structured
        if (!data || !Array.isArray(data) || data.length === 0) {
            console.error('Invalid data structure returned from insert:', data);
            throw new Error('Failed to get inserted question data');
        }
        
        console.log('Question added with ID:', data[0].id);
        return { success: true, message: 'Question added successfully', data };
    } catch (error) {
        console.error('Error adding question:', error);
        throw error;
    }
};

// Add options for a question
const addQuestionOptions = async (optionsData) => {
    try {
        console.log('Adding options to database:', optionsData);
        
        // Ensure we're working with an array
        const optionsArray = Array.isArray(optionsData) ? optionsData : [optionsData];
        
        if (optionsArray.length === 0) {
            throw new Error('No options provided');
        }
        
        // Get the question_id from the first option to ensure all options use the same ID
        const questionId = optionsArray[0].question_id;
        if (!questionId) {
            throw new Error('Missing question_id in options data');
        }
        
        console.log(`Processing ${optionsArray.length} options for question ID: ${questionId}`);
        
        // Validate each option has the required fields
        for (const option of optionsArray) {
            if (!option.option_label || !option.option_text) {
                throw new Error(`Invalid option data: ${JSON.stringify(option)}`);
            }
            // Ensure all options use the same question_id
            option.question_id = questionId;
        }
        
        // Insert options one by one to ensure they all get added
        const results = [];
        for (const option of optionsArray) {
            console.log(`Inserting option: ${option.option_label} with question_id: ${option.question_id}`);
            
            const { data, error } = await supabase
                .from('question_options')
                .insert([{
                    question_id: option.question_id,
                    option_label: option.option_label,
                    option_text: option.option_text
                }]);
                
            if (error) {
                console.error('Supabase error for option:', option, error);
                throw error;
            }
            
            if (data) {
                results.push(data);
            }
        }
        
        console.log(`Successfully added ${results.length} options for question ID: ${questionId}`);
        return { success: true, message: 'Question options added successfully', data: results };
    } catch (error) {
        console.error('Error adding question options:', error);
        throw error;
    }
};

// Update a question
const updateQuestion = async (questionId, questionData) => {
    try {
        console.log('Updating question with ID:', questionId, 'Data:', questionData);
        
        if (!questionId) {
            throw new Error('Question ID is required');
        }

        const { data, error } = await supabase
            .from('questions')
            .update(questionData)
            .eq('id', questionId)
            .select();
            
        if (error) {
            console.error('Supabase error:', error);
            throw error;
        }

        if (!data || data.length === 0) {
            throw new Error('Question not found or update failed');
        }

        console.log('Question updated successfully:', data);
        return { success: true, message: 'Question updated successfully', data };
    } catch (error) {
        console.error('Error updating question:', error);
        throw error;
    }
};

// Update options for a question
const updateQuestionOptions = async (questionId, optionsData) => {
    try {
        console.log('Updating options for question ID:', questionId, 'Data:', optionsData);

        if (!questionId) {
            throw new Error('Question ID is required');
        }

        if (!Array.isArray(optionsData) || optionsData.length === 0) {
            throw new Error('Invalid options data');
        }

        // First delete existing options
        const { error: deleteError } = await supabase
            .from('question_options')
            .delete()
            .eq('question_id', questionId);
            
        if (deleteError) {
            console.error('Error deleting existing options:', deleteError);
            throw deleteError;
        }
        
        // Then insert new options
        const optionsWithQuestionId = optionsData.map(option => ({
            ...option,
            question_id: questionId
        }));
        
        console.log('Inserting new options:', optionsWithQuestionId);
        
        const { data, error } = await supabase
            .from('question_options')
            .insert(optionsWithQuestionId)
            .select();
            
        if (error) {
            console.error('Error inserting new options:', error);
            throw error;
        }

        console.log('Options updated successfully:', data);
        return { success: true, message: 'Question options updated successfully', data };
    } catch (error) {
        console.error('Error updating question options:', error);
        throw error;
    }
};

// Delete a question and its options
const deleteQuestion = async (questionId) => {
    try {
        console.log('Deleting question with ID:', questionId);

        if (!questionId) {
            throw new Error('Question ID is required');
        }

        // First delete options referencing the question
        const { error: optionsDeleteError } = await supabase
            .from('question_options')
            .delete()
            .eq('question_id', questionId);

        if (optionsDeleteError) {
            console.error('Error deleting question options:', optionsDeleteError);
            throw optionsDeleteError;
        }

        // Then delete the question
        const { data, error } = await supabase
            .from('questions')
            .delete()
            .eq('id', questionId)
            .select();

        if (error) {
            console.error('Error deleting question:', error);
            throw error;
        }

        if (!data || data.length === 0) {
            throw new Error('Question not found or delete failed');
        }

        console.log('Question deleted successfully:', data[0].id);
        return { success: true, message: 'Question deleted successfully', data };
    } catch (error) {
        console.error('Error in deleteQuestion:', error);
        throw error;
    }
};

module.exports = {
    getAllQuestions,
    getQuestionsBySection,
    getDistinctSectionTypes,
    getAllOptions,
    getOptionsForQuestion,
    getQuestionsWithOptions,
    submitFeedback,
    addQuestion,
    addQuestionOptions,
    updateQuestion,
    updateQuestionOptions,
    deleteQuestion
};