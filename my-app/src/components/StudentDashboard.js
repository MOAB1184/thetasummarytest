import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import BackButton from './BackButton';
import wasabiStorage from '../services/WasabiStorage';

function StudentDashboard() {
  const [classes, setClasses] = useState([]);
  const [showJoinClass, setShowJoinClass] = useState(false);
  const [classCode, setClassCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [selectedClass, setSelectedClass] = useState(null);
  const [summaries, setSummaries] = useState([]);
  const navigate = useNavigate();
  const studentEmail = sessionStorage.getItem('userEmail');

  useEffect(() => {
    loadStudentData();
  }, []);

  const loadStudentData = async () => {
    try {
      const studentData = await wasabiStorage.getData(wasabiStorage.getStudentPath(studentEmail));
      if (!studentData) {
        setError('Student data not found');
        return;
      }

      // Load enrolled classes
      const enrolledClasses = [];
      const processedCodes = new Set(); // Track processed class codes

      for (const classInfo of studentData.classes || []) {
        // Skip if we've already processed this class code
        if (processedCodes.has(classInfo.code)) {
          continue;
        }

        const classData = await wasabiStorage.getData(
          wasabiStorage.getClassPath(classInfo.teacherEmail, classInfo.code)
        );
        if (classData) {
          enrolledClasses.push(classData);
          processedCodes.add(classInfo.code); // Mark this class code as processed
        }
      }

      setClasses(enrolledClasses);
      setLoading(false);
    } catch (error) {
      console.error('Error loading student data:', error);
      setError('Failed to load student data');
      setLoading(false);
    }
  };

  const loadSummaries = async (teacherEmail, classCode) => {
    try {
        const summaries = await wasabiStorage.getSummaries(teacherEmail, classCode);
        setSummaries(summaries);
    } catch (error) {
        console.error('Error loading summaries:', error);
        setError('Failed to load class summaries');
    }
  };

  const handleClassClick = async (cls) => {
    setSelectedClass(cls);
    await loadSummaries(cls.teacherEmail, cls.code);
  };

  const handleBackToClasses = () => {
    setSelectedClass(null);
    setSummaries([]);
  };

  const handleJoinClass = async () => {
    if (!classCode.trim()) {
      setError('Please enter a class code');
      return;
    }

    try {
      setError('');
      console.log('Searching for class code:', classCode.trim());
      
      // Check if student is already enrolled in this class
      const studentData = await wasabiStorage.getData(wasabiStorage.getStudentPath(studentEmail));
      if (studentData.classes && studentData.classes.some(c => c.code === classCode.trim().toUpperCase())) {
        setError('You are already enrolled in this class');
        return;
      }

      // Find the class with this code
      const teachersData = await wasabiStorage.listObjects('Skyline/teachers/');
      let foundClass = null;
      let teacherEmail = null;

      console.log('Found teachers:', teachersData);

      for (const teacher of teachersData) {
        if (!teacher.Key.endsWith('/')) continue;
        const email = teacher.Key.split('/')[2];
        const classesPath = wasabiStorage.getTeacherClassesPath(email);
        console.log('Checking classes for teacher:', email);
        const classes = await wasabiStorage.listObjects(classesPath);
        
        console.log('Found classes:', classes);
        
        for (const classObj of classes) {
          if (classObj.Key.endsWith('info.json')) {
            const classData = await wasabiStorage.getData(classObj.Key);
            console.log('Checking class:', classObj.Key, 'Data:', classData);
            if (classData && classData.code === classCode.trim().toUpperCase()) {
              foundClass = classData;
              teacherEmail = email;
              break;
            }
          }
        }
        if (foundClass) break;
      }

      if (!foundClass) {
        setError('Class not found. Please check the class code.');
        return;
      }

      // Check if there's already a pending request
      const requestPath = wasabiStorage.getClassJoinRequestPath(teacherEmail, classCode.trim().toUpperCase(), studentEmail);
      const existingRequest = await wasabiStorage.getData(requestPath);
      if (existingRequest) {
        setError('You have already sent a request to join this class');
        return;
      }

      // Add student to pending students in class
      const joinRequest = {
        studentEmail,
        studentName: studentData.name,
        timestamp: new Date().toISOString(),
        status: 'pending'
      };

      // Save join request
      await wasabiStorage.saveData(requestPath, joinRequest);

      alert('Join request sent! Please wait for teacher approval.');
      setClassCode('');
      setShowJoinClass(false);
    } catch (error) {
      console.error('Error joining class:', error);
      setError('Failed to join class: ' + error.message);
    }
  };

  if (loading) {
    return <div className="loading">Loading student dashboard...</div>;
  }

  return (
    <div className="dashboard-container" style={{
      maxWidth: '1200px',
      margin: '0 auto',
      padding: '24px',
      minHeight: '100vh',
      backgroundColor: '#121212'
    }}>
      <div className="dashboard-header" style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: '32px',
        padding: '16px',
        backgroundColor: '#1a1a1a',
        borderRadius: '8px'
      }}>
        <BackButton destination="/" />
        <h2 style={{
          margin: 0,
          fontSize: '28px',
          color: '#fff'
        }}>Student Dashboard</h2>
        <button 
          className="logout-button" 
          onClick={() => {
            sessionStorage.removeItem('userEmail');
            sessionStorage.removeItem('userRole');
            navigate('/');
          }}
          style={{
            padding: '8px 16px',
            fontSize: '16px',
            backgroundColor: '#dc3545',
            color: '#fff',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
            transition: 'background-color 0.2s',
            ':hover': {
              backgroundColor: '#c82333'
            }
          }}
        >
          Logout
        </button>
      </div>

      {error && <div className="error-message" style={{
        backgroundColor: '#dc3545',
        color: '#fff',
        padding: '12px 16px',
        borderRadius: '4px',
        marginBottom: '24px'
      }}>{error}</div>}

      <div className="dashboard-content" style={{
        backgroundColor: '#1a1a1a',
        borderRadius: '8px',
        padding: '24px'
      }}>
        {selectedClass ? (
          <div className="class-view">
            <div className="class-header" style={{
              display: 'flex',
              alignItems: 'center',
              marginBottom: '24px',
              padding: '16px',
              backgroundColor: '#1a1a1a',
              borderRadius: '8px',
              border: '1px solid #333'
            }}>
              <button 
                onClick={handleBackToClasses} 
                className="back-button"
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#fff',
                  cursor: 'pointer',
                  fontSize: '16px',
                  padding: '8px 16px',
                  marginRight: '16px',
                  display: 'flex',
                  alignItems: 'center',
                  borderRadius: '4px',
                  backgroundColor: '#333'
                }}
              >
                ← Back to Classes
              </button>
              <div style={{ flex: 1 }}>
                <h3 style={{ margin: '0 0 8px 0', fontSize: '24px', color: '#fff' }}>{selectedClass.name}</h3>
                <div className="class-info" style={{ color: '#888' }}>
                  <span>Teacher: {selectedClass.teacherEmail}</span>
                </div>
              </div>
            </div>

            <div className="summaries-section" style={{ 
              padding: '24px',
              border: '1px solid #333',
              borderRadius: '8px'
            }}>
              <h4 style={{ 
                fontSize: '20px', 
                marginBottom: '16px',
                color: '#fff'
              }}>Class Summaries</h4>
              {summaries.length === 0 ? (
                <p style={{ 
                  color: '#888',
                  textAlign: 'center',
                  padding: '32px',
                  backgroundColor: '#1a1a1a',
                  borderRadius: '8px',
                  margin: '16px 0'
                }}>No summaries available for this class.</p>
              ) : (
                <div className="summaries-list">
                  {summaries.map(summary => (
                    <div 
                      key={summary.id} 
                      className="summary-item"
                      style={{
                        backgroundColor: '#1a1a1a',
                        borderRadius: '8px',
                        padding: '16px',
                        marginBottom: '16px',
                        border: '1px solid #333'
                      }}
                    >
                      <div className="summary-header" style={{
                        marginBottom: '12px',
                        paddingBottom: '8px',
                        borderBottom: '1px solid #333'
                      }}>
                        <span className="summary-date" style={{ color: '#888' }}>
                          {new Date(summary.timestamp).toLocaleString()}
                        </span>
                      </div>
                      <div className="summary-content" style={{
                        color: '#fff',
                        lineHeight: '1.5',
                        fontSize: '16px'
                      }}>
                        {summary.content}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="classes-section">
            <h3 style={{ 
              fontSize: '24px',
              marginBottom: '24px',
              color: '#fff'
            }}>My Classes</h3>
            {classes.length === 0 ? (
              <p style={{ 
                color: '#888',
                textAlign: 'center',
                padding: '32px',
                backgroundColor: '#1a1a1a',
                borderRadius: '8px',
                margin: '16px 0'
              }}>You haven't joined any classes yet.</p>
            ) : (
              <div className="classes-list">
                {classes.map(cls => (
                  <div 
                    key={cls.code} 
                    className="class-item"
                    onClick={() => handleClassClick(cls)}
                    style={{ 
                      cursor: 'pointer',
                      backgroundColor: '#1a1a1a',
                      borderRadius: '8px',
                      padding: '16px',
                      marginBottom: '16px',
                      transition: 'transform 0.2s, background-color 0.2s',
                      ':hover': {
                        transform: 'translateY(-2px)',
                        backgroundColor: '#252525'
                      }
                    }}
                  >
                    <h4 style={{ 
                      margin: '0 0 8px 0',
                      fontSize: '20px',
                      color: '#fff'
                    }}>{cls.name}</h4>
                    <div className="class-info" style={{ color: '#888' }}>
                      <span>Teacher: {cls.teacherEmail}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {showJoinClass ? (
              <div className="join-class-form" style={{
                backgroundColor: '#1a1a1a',
                borderRadius: '8px',
                padding: '16px',
                marginTop: '24px'
              }}>
                <input
                  type="text"
                  value={classCode}
                  onChange={(e) => setClassCode(e.target.value)}
                  placeholder="Enter class code"
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    fontSize: '16px',
                    backgroundColor: '#333',
                    border: 'none',
                    borderRadius: '4px',
                    color: '#fff',
                    marginBottom: '16px'
                  }}
                />
                <div className="form-actions" style={{
                  display: 'flex',
                  gap: '12px'
                }}>
                  <button 
                    onClick={handleJoinClass}
                    style={{
                      padding: '8px 16px',
                      fontSize: '16px',
                      backgroundColor: '#007bff',
                      color: '#fff',
                      border: 'none',
                      borderRadius: '4px',
                      cursor: 'pointer'
                    }}
                  >Join Class</button>
                  <button 
                    onClick={() => setShowJoinClass(false)} 
                    className="secondary-button"
                    style={{
                      padding: '8px 16px',
                      fontSize: '16px',
                      backgroundColor: '#333',
                      color: '#fff',
                      border: 'none',
                      borderRadius: '4px',
                      cursor: 'pointer'
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <button 
                onClick={() => setShowJoinClass(true)} 
                className="join-class-button"
                style={{
                  width: '100%',
                  padding: '12px',
                  fontSize: '16px',
                  backgroundColor: '#007bff',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  marginTop: '24px',
                  transition: 'background-color 0.2s',
                  ':hover': {
                    backgroundColor: '#0056b3'
                  }
                }}
              >
                Join New Class
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default StudentDashboard; 