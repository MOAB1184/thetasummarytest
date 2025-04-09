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
  const [pendingRequests, setPendingRequests] = useState([]);
  const navigate = useNavigate();
  const studentEmail = sessionStorage.getItem('userEmail');

  useEffect(() => {
    loadStudentData();
  }, []);

  const loadStudentData = async () => {
    try {
      const schoolName = sessionStorage.getItem('userSchool');
      if (!schoolName) {
        setError('School information not found');
        return;
      }

      const studentData = await wasabiStorage.getData(wasabiStorage.getStudentPath(schoolName, studentEmail));
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
          wasabiStorage.getClassPath(schoolName, classInfo.teacherEmail, classInfo.code)
        );
        if (classData) {
          enrolledClasses.push(classData);
          processedCodes.add(classInfo.code); // Mark this class code as processed
        }
      }

      // Load pending requests
      const pendingClasses = [];
      const teachersData = await wasabiStorage.listObjects(`${schoolName}/teachers/`);
      
      for (const teacher of teachersData) {
        if (!teacher.Key.endsWith('/')) continue;
        const teacherEmail = teacher.Key.split('/')[2];
        const classesPath = wasabiStorage.getTeacherClassesPath(schoolName, teacherEmail);
        const classes = await wasabiStorage.listObjects(classesPath);
        
        for (const classObj of classes) {
          if (classObj.Key.endsWith('info.json')) {
            const classData = await wasabiStorage.getData(classObj.Key);
            if (classData) {
              const requestPath = wasabiStorage.getClassJoinRequestPath(schoolName, teacherEmail, classData.code, studentEmail);
              const request = await wasabiStorage.getData(requestPath);
              if (request && request.status === 'pending') {
                pendingClasses.push({
                  ...classData,
                  teacherEmail,
                  requestTimestamp: request.timestamp
                });
              }
            }
          }
        }
      }

      setClasses(enrolledClasses);
      setPendingRequests(pendingClasses);
      setLoading(false);
    } catch (error) {
      console.error('Error loading student data:', error);
      setError('Failed to load student data');
      setLoading(false);
    }
  };

  const loadSummaries = async (teacherEmail, classCode) => {
    try {
      const schoolName = sessionStorage.getItem('userSchool');
      if (!schoolName) {
        setError('School information not found');
        return;
      }

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
      const schoolName = sessionStorage.getItem('userSchool');
      if (!schoolName) {
        setError('School information not found');
        return;
      }

      console.log('Searching for class code:', classCode.trim());
      
      // Check if student is already enrolled in this class
      const studentData = await wasabiStorage.getData(wasabiStorage.getStudentPath(schoolName, studentEmail));
      if (!studentData.classes) {
        studentData.classes = [];
      }
      
      if (studentData.classes.some(c => c.code === classCode.trim().toUpperCase())) {
        setError('You are already enrolled in this class');
        return;
      }

      // Find the class with this code
      const teachersData = await wasabiStorage.listObjects(`${schoolName}/teachers/`);
      let foundClass = null;
      let teacherEmail = null;

      console.log('Found teachers:', teachersData);

      for (const teacher of teachersData) {
        if (!teacher.Key.endsWith('/')) continue;
        const email = teacher.Key.split('/')[2];
        const classesPath = wasabiStorage.getTeacherClassesPath(schoolName, email);
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
      const requestPath = wasabiStorage.getClassJoinRequestPath(schoolName, teacherEmail, classCode.trim().toUpperCase(), studentEmail);
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
      
      // Reload student data to show updated class list
      await loadStudentData();
    } catch (error) {
      console.error('Error joining class:', error);
      setError('Failed to join class: ' + error.message);
    }
  };

  // Function to get pre-signed URL for PDF download
  async function getPDFDownloadUrl(pdfId) {
    try {
      const schoolName = sessionStorage.getItem('userSchool');
      const url = await wasabiStorage.getPresignedUrl(schoolName, selectedClass.teacherEmail, selectedClass.code, pdfId);

      if (url) {
        window.open(url, '_blank');
      } else {
        setError('Failed to generate download link');
      }
    } catch (error) {
      console.error('Error getting PDF URL:', error);
      setError('Failed to generate download link');
    }
  }

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
      {selectedClass ? (
        <div className="class-view" style={{
          display: 'flex',
          justifyContent: 'center',
          minHeight: '100vh',
          backgroundColor: '#121212'
        }}>
          <div style={{
            width: '600px',
            padding: '24px'
          }}>
            <div style={{ 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'space-between',
              marginBottom: '40px'
            }}>
              <button 
                onClick={() => setSelectedClass(null)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#007bff',
                  cursor: 'pointer',
                  fontSize: '16px',
                  display: 'flex',
                  alignItems: 'center',
                  padding: 0
                }}
              >
                ← Back to Classes
              </button>
              <div style={{ color: '#888' }}>
                Class: period 1
              </div>
            </div>

            <div style={{ 
              textAlign: 'center',
              marginBottom: '40px'
            }}>
              <div style={{
                display: 'inline-block',
                borderBottom: '2px solid #007bff',
                padding: '10px 0'
              }}>
                <span style={{
                  color: '#fff',
                  fontSize: '16px'
                }}>
                  Summaries
                </span>
              </div>
            </div>

            <div style={{ 
              backgroundColor: '#1a1a1a',
              borderRadius: '8px',
              padding: '40px 0',
              textAlign: 'center'
            }}>
              {summaries.length === 0 ? (
                <div style={{ 
                  color: '#888'
                }}>
                  No summaries yet
                </div>
              ) : (
                <div style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '20px',
                  padding: '0 20px'
                }}>
                  {summaries.map(summary => (
                    <div key={summary.id} style={{
                      backgroundColor: '#2d2d2d',
                      borderRadius: '8px',
                      padding: '20px',
                      textAlign: 'left'
                    }}>
                      <div style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        marginBottom: '12px'
                      }}>
                        <h4 style={{
                          margin: 0,
                          color: '#fff',
                          fontSize: '18px'
                        }}>{summary.name}</h4>
                        <span style={{
                          color: '#888',
                          fontSize: '14px'
                        }}>
                          {new Date(summary.timestamp).toLocaleString()}
                        </span>
                      </div>
                      {summary.type === 'pdf' ? (
                        <button
                          onClick={() => getPDFDownloadUrl(summary.id)}
                          style={{
                            display: 'inline-block',
                            padding: '8px 16px',
                            backgroundColor: '#007bff',
                            color: '#fff',
                            textDecoration: 'none',
                            borderRadius: '4px',
                            marginTop: '8px'
                          }}
                        >
                          Download PDF
                        </button>
                      ) : (
                        <div style={{
                          color: '#fff',
                          whiteSpace: 'pre-wrap'
                        }}>
                          {summary.content}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      ) : (
        <>
          <div className="dashboard-header" style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: '32px',
            padding: '16px 32px',
            backgroundColor: '#1a1a1a',
            borderRadius: '8px',
            gap: '48px'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '24px' }}>
              <BackButton destination="/" />
              <h2 style={{
                margin: 0,
                fontSize: '28px',
                color: '#fff',
                whiteSpace: 'nowrap'
              }}>Student Dashboard</h2>
            </div>
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
                whiteSpace: 'nowrap'
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
                <div className="classes-list" style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
                  gap: '20px'
                }}>
                  {classes.map(cls => (
                    <div 
                      key={cls.code} 
                      className="class-item"
                      onClick={() => handleClassClick(cls)}
                      style={{ 
                        cursor: 'pointer',
                        backgroundColor: '#2d2d2d',
                        borderRadius: '8px',
                        padding: '20px',
                        transition: 'transform 0.2s, background-color 0.2s',
                        '&:hover': {
                          transform: 'translateY(-2px)',
                          backgroundColor: '#353535'
                        }
                      }}
                    >
                      <h4 style={{ 
                        margin: '0 0 8px 0',
                        fontSize: '20px',
                        color: '#fff'
                      }}>{cls.name}</h4>
                      <div style={{ color: '#888' }}>
                        Teacher: {cls.teacherEmail}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {showJoinClass ? (
                <div className="join-class-form" style={{
                  backgroundColor: '#2d2d2d',
                  borderRadius: '8px',
                  padding: '20px',
                  marginTop: '24px'
                }}>
                  <input
                    type="text"
                    value={classCode}
                    onChange={(e) => setClassCode(e.target.value)}
                    placeholder="Enter class code"
                    style={{
                      width: '100%',
                      padding: '12px',
                      fontSize: '16px',
                      backgroundColor: '#1a1a1a',
                      border: '1px solid #444',
                      borderRadius: '4px',
                      color: '#fff',
                      marginBottom: '16px'
                    }}
                  />
                  <div style={{
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
                      style={{
                        padding: '8px 16px',
                        fontSize: '16px',
                        backgroundColor: '#444',
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
                  style={{
                    width: '100%',
                    padding: '12px',
                    fontSize: '16px',
                    backgroundColor: '#007bff',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    marginTop: '24px'
                  }}
                >
                  Join New Class
                </button>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export default StudentDashboard; 