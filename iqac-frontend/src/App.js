// import React from 'react';
// import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
// import './App.css';
// import Home from './components/Home';
// import Analysis from './components/Analysis';
// import QuestionsPattern from './components/questions_pattern';
// import AnalysisResults from './components/AnalysisResults';

// function App() {
//   return (
//     <Router>
//       <div className="App">
//         <Routes>
//           <Route path="/" element={<Home />} />
//           <Route path="/analysis" element={<Analysis />} />
//           <Route path="/questions" element={<QuestionsPattern />} />
//           <Route path="/analysis-results" element={<AnalysisResults />} />
//         </Routes>
//       </div>
//     </Router>
//   );
// }

// export default App;

import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import './App.css';
import Home from './components/Home';
import Analysis from './components/Analysis';
import QuestionsPattern from './components/questions_pattern';
import AnalysisResults from './components/AnalysisResults';
import Visualize from './components/visualize';
import Login from './components/Login';
import SchoolWise from './components/school_wise';
import UploadFile from './components/upload_file';
import IndividualAnalysis from './components/individual_analysis';
import Explanation from './components/explanation';
import Profile from './components/profile';

// Protected Route Component
const ProtectedRoute = ({ children }) => {
  const user = localStorage.getItem('user');
  
  if (!user) {
    return <Navigate to="/login" replace />;
  }
  
  return children;
};

// Admin-only Route Component
const AdminRoute = ({ children }) => {
  const stored = localStorage.getItem('user');
  if (!stored) {
    return <Navigate to="/login" replace />;
  }
  let user = null;
  try {
    user = JSON.parse(stored);
  } catch {
    return <Navigate to="/login" replace />;
  }
  if (!user || user.role !== 'Admin') {
    return <Navigate to="/" replace />;
  }
  return children;
};

function App() {
  return (
    <Router>
      <div className="App">
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route 
            path="/" 
            element={
              <ProtectedRoute>
                <Home />
              </ProtectedRoute>
            } 
          />
          <Route 
            path="/analysis" 
            element={
              <ProtectedRoute>
                <Analysis />
              </ProtectedRoute>
            } 
          />
          <Route 
            path="/visualize" 
            element={
              <ProtectedRoute>
                <Visualize />
              </ProtectedRoute>
            } 
          />
          <Route 
            path="/questions" 
            element={
              <AdminRoute>
                <QuestionsPattern />
              </AdminRoute>
            } 
          />
          <Route 
            path="/analysis-results" 
            element={
              <ProtectedRoute>
                <AnalysisResults />
              </ProtectedRoute>
            } 
          />
          <Route 
            path="/school-wise" 
            element={
              <ProtectedRoute>
                <SchoolWise />
              </ProtectedRoute>
            } 
          />
          <Route 
            path="/upload" 
            element={
              <ProtectedRoute>
                <UploadFile />
              </ProtectedRoute>
            } 
          />
          <Route 
            path="/individual-analysis" 
            element={
              <ProtectedRoute>
                <IndividualAnalysis />
              </ProtectedRoute>
            } 
          />
          <Route
            path="/explanation"
            element={
              <ProtectedRoute>
                <Explanation />
              </ProtectedRoute>
            }
          />
          <Route
            path="/profile"
            element={
              <ProtectedRoute>
                <Profile />
              </ProtectedRoute>
            }
          />
        </Routes>
      </div>
    </Router>
  );
}

export default App;