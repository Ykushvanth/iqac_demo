import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import './index.css';
const SERVER_URL = process.env.REACT_APP_SERVER_URL || "https://iqac-repo3.onrender.com";
const QuestionPattern = () => {
  const navigate = useNavigate();
  const [questions, setQuestions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);
  const [formErrors, setFormErrors] = useState({});
  const [isEditing, setIsEditing] = useState(false);
  const [editingQuestionId, setEditingQuestionId] = useState(null);
  
  // Fixed section types
  const SECTION_TYPES = [
    'TEACHING EFFECTIVENESS',
    'CLASSROOM DYNAMICS AND ENGAGEMENT',
    'ASSESSMENT AND FEEDBACK',
    'COURSE CONTENT AND STRUCTURE',
    'STUDENT-CENTRIC FACTORS'
  ];
  
  // New question form state
  const [newQuestion, setNewQuestion] = useState({
    section_type: '',
    question: '',
    column_name: ''
  });
  
  // Options for the new question
  const [options, setOptions] = useState([
    { option_label: 'A', option_text: '' }
  ]);

  const handleLogout = () => {
    localStorage.removeItem('user');
    navigate('/login');
  };
  
  // Fetch questions and options from the API
  const fetchQuestions = useCallback(async () => {
    try {
      setLoading(true);
      const questionsResponse = await fetch(`${SERVER_URL}/api/questions/with-options`);

      if (!questionsResponse.ok) {
        const errorData = await questionsResponse.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to fetch questions');
      }

      const questionsData = await questionsResponse.json();
      if (!Array.isArray(questionsData)) {
        throw new Error('Invalid response format from server');
      }
      
      console.log('Fetched questions:', questionsData);
      setQuestions(questionsData);
      setError(null); // Clear any existing errors
    } catch (error) {
      console.error('Error fetching questions:', error);
      setError(error.message || 'Failed to load questions. Please refresh the page.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchQuestions();
  }, [fetchQuestions, success]);
  
  // Handle question form change
  const handleQuestionChange = (e) => {
    const { name, value } = e.target;
    setNewQuestion(prev => ({
      ...prev,
      [name]: value
    }));
  };
  
  // Handle option change
  const handleOptionChange = (index, field, value) => {
    const updatedOptions = [...options];
    updatedOptions[index] = {
      ...updatedOptions[index],
      [field]: value
    };
    setOptions(updatedOptions);
  };
  
  // Add new option field
  const addOption = () => {
    const nextLabel = String.fromCharCode(65 + options.length); // A, B, C, ...
    setOptions([...options, { option_label: nextLabel, option_text: '' }]);
  };
  
  // Remove option field
  const removeOption = (index) => {
    if (options.length > 1) {
      const updatedOptions = options.filter((_, i) => i !== index);
      // Reassign labels
      const relabeledOptions = updatedOptions.map((option, i) => ({
        ...option,
        option_label: String.fromCharCode(65 + i)
      }));
      setOptions(relabeledOptions);
    }
  };
  
  // Validate form
  const validateForm = () => {
    const errors = {};
    
    // Validate question fields
    if (!newQuestion.section_type.trim()) {
      errors.section_type = 'Section type is required';
    }
    
    if (!newQuestion.question.trim()) {
      errors.question = 'Question text is required';
    }
    
    if (!newQuestion.column_name.trim()) {
      errors.column_name = 'Column name is required';
    } else if (!/^qn\d+$/.test(newQuestion.column_name)) {
      errors.column_name = 'Column name must be in format "qn1", "qn2", etc.';
    }
    
    // Validate options
    options.forEach((option, index) => {
      if (!option.option_label.trim()) {
        errors[`option_label_${index}`] = 'Option label is required';
      }
      
      if (!option.option_text.trim()) {
        errors[`option_text_${index}`] = 'Option text is required';
      }
    });
    
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };
  
  // Handle edit button click
  const handleEditClick = (question) => {
    console.log('Editing question:', question);
    setEditingQuestionId(question.id);
    setIsEditing(true);
    setNewQuestion({
      section_type: question.section_type,
      question: question.question,
      column_name: question.column_name
    });
    if (question.options && Array.isArray(question.options)) {
      setOptions(question.options.map(opt => ({
        option_label: opt.option_label,
        option_text: opt.option_text
      })));
    }
  };

  // Handle cancel edit
  const handleCancelEdit = () => {
    setIsEditing(false);
    setEditingQuestionId(null);
    setNewQuestion({
      section_type: '',
      question: '',
      column_name: ''
    });
    setOptions([{ option_label: 'A', option_text: '' }]);
    setFormErrors({});
  };

  // Handle delete question
  const handleDelete = async (questionId) => {
    const confirmDelete = window.confirm('Are you sure you want to delete this question and its options?');
    if (!confirmDelete) return;
    try {
      setLoading(true);
      const resp = await fetch(`${SERVER_URL}/api/questions/${questionId}`, {
        method: 'DELETE'
      });
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to delete question');
      }
      const data = await resp.json();
      if (!data.success) {
        throw new Error(data.error || 'Failed to delete question');
      }
      await fetchQuestions();
    } catch (e) {
      console.error('Delete error:', e);
      setError(e.message || 'Failed to delete');
      setTimeout(() => setError(null), 3000);
    } finally {
      setLoading(false);
    }
  };

  // Handle form submission
  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!validateForm()) {
      return;
    }
    
    try {
      setLoading(true);
      
      // Create or update the question
      const endpoint = isEditing 
        ? `${SERVER_URL}/api/questions/${editingQuestionId}`
        : `${SERVER_URL}/api/questions`;
      
      console.log('Submitting to endpoint:', endpoint);
      console.log('Question data:', newQuestion);
      
      const questionResponse = await fetch(endpoint, {
        method: isEditing ? 'PUT' : 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          section_type: newQuestion.section_type,
          question: newQuestion.question,
          column_name: newQuestion.column_name,
        }),
      });
      
      if (!questionResponse.ok) {
        const errorData = await questionResponse.json().catch(() => ({}));
        throw new Error(errorData.error || `Failed to ${isEditing ? 'update' : 'create'} question`);
      }
      
      const questionData = await questionResponse.json();
      
      if (!questionData.success) {
        throw new Error(questionData.error || `Failed to ${isEditing ? 'update' : 'create'} question`);
      }
      
      // Check if data exists and has the expected structure
      if (!questionData.data || !Array.isArray(questionData.data) || !questionData.data[0] || !questionData.data[0].id) {
        console.error('Invalid question data structure:', questionData);
        throw new Error('Question created but returned invalid data structure');
      }
      
      const questionId = questionData.data[0].id;
      console.log('Created question with ID:', questionId);
      
      // Handle options update/creation
      const optionsEndpoint = isEditing
        ? `${SERVER_URL}/api/questions/${editingQuestionId}/options`
        : `${SERVER_URL}/api/questions/options`;

      const optionsWithQuestionId = options.map(option => ({
        ...option,
        question_id: isEditing ? editingQuestionId : questionId
      }));
      
      console.log('Sending options data:', optionsWithQuestionId);
      
      const optionsResponse = await fetch(optionsEndpoint, {
        method: isEditing ? 'PUT' : 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(optionsWithQuestionId),
      });
      
      if (!optionsResponse.ok) {
        const errorData = await optionsResponse.json().catch(() => ({}));
        throw new Error(errorData.error || `Failed to ${isEditing ? 'update' : 'create'} options`);
      }
      
      const optionsData = await optionsResponse.json();
      console.log('Options response:', optionsData);
      
      if (!optionsData.success) {
        throw new Error(optionsData.error || `Failed to ${isEditing ? 'update' : 'create'} options`);
      }
      
      // Reset form and show success
      setNewQuestion({
        section_type: '',
        question: '',
        column_name: ''
      });
      
      setOptions([
        { option_label: 'A', option_text: '' }
      ]);
      
      setSuccess(true);
      setIsEditing(false);
      setEditingQuestionId(null);
      setTimeout(() => setSuccess(false), 3000);
      
      // Refresh questions list
      await fetchQuestions();
      
      console.log('Update completed successfully');
    } catch (error) {
      console.error('Error adding question:', error);
      setError(error.message || 'Failed to add question. Please try again.');
      setTimeout(() => setError(null), 3000);
    } finally {
      setLoading(false);
    }
  };
  
  return (
    <div className="question-manager-container">
      <header className="header">
        <div className="logo-container">
          <img 
            src="https://www.kalasalingam.ac.in/wp-content/uploads/2022/02/Logo.png" 
            alt="Kalasalingam Logo" 
            className="logo" 
          />
          <div className="header-text">
            <h1>Office of IQAC, KARE</h1>
            <p>Internal Quality Assurance Compliance</p>
          </div>
        </div>
        <div className="header-actions">
          <button className="home-btn" onClick={() => navigate('/')}>
            <span>🏠</span> Home
          </button>
          <button className="logout-btn" onClick={handleLogout}>
            <span>🚪</span> Logout
          </button>
        </div>
      </header>
      
      <main className="main-content">
        <h1 className="portal-title">Question Management</h1>
        <h2 className="institution">Kalasalingam Academy of Research and Education</h2>
        
        <div className="question-manager-header">
          <h1>Question Management</h1>
          <p>Add new questions and options to the feedback system</p>
        </div>
        
        {success && (
          <div className="success-message">
            Question and options saved successfully!
          </div>
        )}
        
        {error && (
          <div className="error-alert">
            Error: {error}
          </div>
        )}
        
        <div className="question-form-section">
          <h2>Add New Question</h2>
          <form onSubmit={handleSubmit}>
            <div className="form-row">
              <div className="form-group">
                <label htmlFor="section_type">Section Type</label>
                <select
                  id="section_type"
                  name="section_type"
                  value={newQuestion.section_type}
                  onChange={handleQuestionChange}
                  className="form-select"
                >
                  <option value="">Select a section type</option>
                  {SECTION_TYPES.map((section, index) => (
                    <option key={index} value={section}>
                      {section}
                    </option>
                  ))}
                </select>
                {formErrors.section_type && <div className="error-message">{formErrors.section_type}</div>}
              </div>
            </div>
            
            <div className="form-row">
              <div className="form-group">
                <label htmlFor="question">Question Text</label>
                <textarea
                  id="question"
                  name="question"
                  value={newQuestion.question}
                  onChange={handleQuestionChange}
                  placeholder="Enter the question text"
                />
                {formErrors.question && <div className="error-message">{formErrors.question}</div>}
              </div>
            </div>
            
            <div className="form-row">
              <div className="form-group">
                <label htmlFor="column_name">Column Name</label>
                <input
                  type="text"
                  id="column_name"
                  name="column_name"
                  value={newQuestion.column_name}
                  onChange={handleQuestionChange}
                  placeholder="e.g., qn1, qn2, qn3"
                />
                <small>Must be in format "qn1", "qn2", etc. to match database columns</small>
                {formErrors.column_name && <div className="error-message">{formErrors.column_name}</div>}
              </div>
            </div>
            
            <h3>Question Options</h3>
            {options.map((option, index) => (
              <div key={index} className="option-row">
                <div className="form-row">
                  <div className="form-group">
                    <label htmlFor={`option_label_${index}`}>Option Label</label>
                    <input
                      type="text"
                      id={`option_label_${index}`}
                      value={option.option_label}
                      onChange={(e) => handleOptionChange(index, 'option_label', e.target.value)}
                      placeholder="e.g., A, B, C"
                      readOnly
                    />
                    {formErrors[`option_label_${index}`] && <div className="error-message">{formErrors[`option_label_${index}`]}</div>}
                  </div>
                  
                  <div className="form-group">
                    <label htmlFor={`option_text_${index}`}>Option Text</label>
                    <input
                      type="text"
                      id={`option_text_${index}`}
                      value={option.option_text}
                      onChange={(e) => handleOptionChange(index, 'option_text', e.target.value)}
                      placeholder="Description of the option"
                    />
                    {formErrors[`option_text_${index}`] && <div className="error-message">{formErrors[`option_text_${index}`]}</div>}
                  </div>
                  
                  <div className="option-actions">
                    <button 
                      type="button" 
                      className="remove-option-btn"
                      onClick={() => removeOption(index)}
                      disabled={options.length <= 1}
                    >
                      Remove
                    </button>
                  </div>
                </div>
              </div>
            ))}
            
            <div className="form-actions">
              <button type="button" className="add-option-btn" onClick={addOption}>
                Add Option
              </button>
            </div>
            
            <div className="button-group">
              <button type="submit" className="submit-button" disabled={loading}>
                {loading ? 'Saving...' : isEditing ? 'Update Question' : 'Save Question'}
              </button>
              {isEditing && (
                <button 
                  type="button" 
                  className="cancel-button" 
                  onClick={handleCancelEdit}
                >
                  Cancel Editing
                </button>
              )}
            </div>
          </form>
        </div>
        
        <div className="existing-questions-section">
          <h2>Existing Questions</h2>
          {loading && questions.length === 0 ? (
            <p>Loading questions...</p>
          ) : questions.length > 0 ? (
            <div className="questions-list">
              {questions.map(question => (
                <div key={question.id} className="question-card">
                  <div className="question-card-header">
                    <div className="question-card-header-left">
                      <span className="section-badge">{question.section_type}</span>
                      <span className="column-badge">{question.column_name}</span>
                    </div>
                    <div className="question-card-actions">
                      <button 
                        type="button"
                        className="edit-button"
                        onClick={() => handleEditClick(question)}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        className="delete-button"
                        onClick={() => handleDelete(question.id)}
                        disabled={loading}
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                  <div className="question-card-body">
                    <p>{question.question}</p>
                    {question.options && question.options.length > 0 && (
                      <div className="options-list">
                        <h4>Options:</h4>
                        <ul>
                          {question.options.map(option => (
                            <li key={option.id}>
                              <strong>{option.option_label}:</strong> {option.option_text}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p>No questions found. Add your first question above.</p>
          )}
        </div>
      </main>
    </div>
  );
};

export default QuestionPattern;