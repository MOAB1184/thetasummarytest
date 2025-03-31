import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import BackButton from './BackButton';
import infuraStorage from '../services/MetaMaskStorage';
import wasabiStorage from '../services/WasabiStorage';

function TeacherDashboard() {
  const [classes, setClasses] = useState([]);
  const [showCreateClass, setShowCreateClass] = useState(false);
  const [newClassName, setNewClassName] = useState('');
  const [selectedClass, setSelectedClass] = useState(null);
  const [pendingStudents, setPendingStudents] = useState([]);
  const [activeTab, setActiveTab] = useState('classes');
  const [recordings, setRecordings] = useState([]);
  const [teacherData, setTeacherData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const mediaRecorderRef = useRef(null);
  const timeIntervalRef = useRef(null);
  const chunksRef = useRef([]);
  const navigate = useNavigate();

  // Memoize the connectAndLoadTeacherData function to prevent infinite loop
  const connectAndLoadTeacherData = React.useCallback(async (teacherEmail) => {
    try {
      setIsConnecting(true);
      setError('');
      
      // Connect to Infura
      const connectResult = await infuraStorage.connect();
      if (!connectResult.success) {
        setError(`Infura connection error: ${connectResult.error}`);
        setLoading(false);
        return;
      }
      
      await loadTeacherData(teacherEmail);
      await loadRecordings(teacherEmail);
      setLoading(false); // Set loading to false after all data is loaded
    } catch (error) {
      setError(`Error connecting to Infura: ${error.message}`);
      console.error('Connection error:', error);
      setLoading(false);
    } finally {
      setIsConnecting(false);
    }
  }, []);

  const loadRecordings = async (teacherEmail) => {
    try {
      if (!selectedClass) {
        return;
      }

      const recordingsData = await wasabiStorage.listObjects(
        wasabiStorage.getRecordingsPath(teacherEmail, selectedClass.code)
      );
      const loadedRecordings = [];

      for (const recording of recordingsData) {
        if (recording.Key.endsWith('.json')) {
          const recordingData = await wasabiStorage.getData(recording.Key);
          if (recordingData) {
            loadedRecordings.push(recordingData);
          }
        }
      }

      setRecordings(loadedRecordings);
    } catch (error) {
      console.error('Error loading recordings:', error);
      setError('Failed to load recordings');
    }
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        const url = URL.createObjectURL(blob);
        const timestamp = new Date().toISOString();
        const newRecording = {
          id: Date.now(),
          url,
          timestamp,
          duration: recordingTime,
          localPath: `recording_${timestamp}.webm`
        };

        // Update recordings state
        const updatedRecordings = [...recordings, newRecording];
        setRecordings(updatedRecordings);
        
        // Update selected class recordings
        if (selectedClass) {
          const updatedClass = {
            ...selectedClass,
            recordings: [...selectedClass.recordings, newRecording]
          };
          setSelectedClass(updatedClass);

          // Update classes state
          const updatedClasses = classes.map(c => 
            c.id === selectedClass.id ? updatedClass : c
          );
          setClasses(updatedClasses);

          // Save to Infura
          const teacherEmail = sessionStorage.getItem('userEmail');
          await infuraStorage.saveData(`classes_${teacherEmail}`, updatedClasses);
        }
        
        // Save recording data
        await infuraStorage.saveData(`recordings_${sessionStorage.getItem('userEmail')}`, updatedRecordings);

        // Save to local storage
        const reader = new FileReader();
        reader.readAsDataURL(blob);
        reader.onloadend = () => {
          localStorage.setItem(`recording_${timestamp}`, reader.result);
        };

        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
      setRecordingTime(0);
      timeIntervalRef.current = setInterval(() => {
        setRecordingTime(prev => prev + 1);
      }, 1000);
    } catch (error) {
      console.error('Error starting recording:', error);
      setError('Failed to start recording. Please check your microphone permissions.');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      clearInterval(timeIntervalRef.current);
      setIsRecording(false);
    }
  };

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  useEffect(() => {
    document.body.classList.add('dashboard-page');
    const teacherEmail = sessionStorage.getItem('userEmail');
    connectAndLoadTeacherData(teacherEmail);
    
    return () => {
      document.body.classList.remove('dashboard-page');
      if (timeIntervalRef.current) {
        clearInterval(timeIntervalRef.current);
      }
      if (mediaRecorderRef.current && isRecording) {
        mediaRecorderRef.current.stop();
      }
    };
  }, [connectAndLoadTeacherData, isRecording]);

  const loadTeacherData = async (teacherEmail) => {
    try {
      // Get teacher data
      const teacherData = await wasabiStorage.getData(wasabiStorage.getTeacherPath(teacherEmail));
      if (!teacherData) {
        setError('Teacher data not found');
        return;
      }
      setTeacherData(teacherData);

      // List all classes
      const classesData = await wasabiStorage.listObjects(wasabiStorage.getTeacherClassesPath(teacherEmail));
      const loadedClasses = [];

      for (const classObj of classesData) {
        if (classObj.Key.endsWith('info.json')) {
          const classData = await wasabiStorage.getData(classObj.Key);
          if (classData) {
            // Load join requests for this class
            const classCode = classData.code;
            const joinRequestsPath = `Skyline/teachers/${teacherEmail}/classes/${classCode}/join-requests/`;
            console.log('Checking join requests at:', joinRequestsPath);
            
            const joinRequests = await wasabiStorage.listObjects(joinRequestsPath);
            console.log('Found join requests:', joinRequests);
            
            const pendingStudents = [];
            for (const request of joinRequests) {
              if (request.Key.endsWith('.json')) {
                const requestData = await wasabiStorage.getData(request.Key);
                if (requestData && requestData.status === 'pending') {
                  pendingStudents.push(requestData);
                }
              }
            }
            
            classData.pendingStudents = pendingStudents;
            loadedClasses.push(classData);
          }
        }
      }

      console.log('Loaded classes with pending students:', loadedClasses);
      setClasses(loadedClasses);
    } catch (error) {
      console.error('Error loading teacher data:', error);
      setError('Failed to load teacher data');
    }
  };

  const createClass = async () => {
    if (!newClassName.trim()) {
      setError('Please enter a class name');
      return;
    }

    try {
      const teacherEmail = sessionStorage.getItem('userEmail');
      
      // Generate a unique 6-character class code
      const generateClassCode = () => {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
        let code = '';
        for (let i = 0; i < 6; i++) {
          code += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return code;
      };

      const classCode = generateClassCode();
      
      // Create class folder structure
      const classPath = wasabiStorage.getClassPath(teacherEmail, classCode);
      const recordingsPath = wasabiStorage.getRecordingsPath(teacherEmail, classCode);
      const summariesPath = wasabiStorage.getSummariesPath(teacherEmail, classCode);

      // Create the folders
      await Promise.all([
        wasabiStorage.s3.putObject({
          Bucket: wasabiStorage.bucket,
          Key: recordingsPath,
          Body: '',
          ContentType: 'application/x-directory'
        }).promise(),
        wasabiStorage.s3.putObject({
          Bucket: wasabiStorage.bucket,
          Key: summariesPath,
          Body: '',
          ContentType: 'application/x-directory'
        }).promise()
      ]);

      // Create class data
      const classData = {
        name: newClassName.trim(),
        code: classCode,
        teacherEmail,
        students: [],
        pendingStudents: [],
        createdAt: new Date().toISOString()
      };

      // Save class info
      await wasabiStorage.saveData(classPath, classData);

      // Update UI
      setClasses([...classes, classData]);
      setNewClassName('');
      setShowCreateClass(false);
      
      // Show success message with class code
      alert(`Class created successfully! Class code: ${classCode}`);
    } catch (error) {
      console.error('Error creating class:', error);
      setError('Failed to create class');
    }
  };

  const approveStudent = async (studentEmail) => {
    try {
      if (!selectedClass) {
        throw new Error('No class selected');
      }

      const teacherEmail = sessionStorage.getItem('userEmail');
      const requestPath = wasabiStorage.getClassJoinRequestPath(teacherEmail, selectedClass.code, studentEmail);
      const joinRequest = await wasabiStorage.getData(requestPath);

      if (!joinRequest) {
        throw new Error('Join request not found');
      }

      // Update join request status
      const updatedRequest = {
        ...joinRequest,
        status: 'approved'
      };
      await wasabiStorage.saveData(requestPath, updatedRequest);

      // Update student's classes in their data
      const studentData = await wasabiStorage.getData(wasabiStorage.getStudentPath(studentEmail));
      if (studentData) {
        const updatedStudentData = {
          ...studentData,
          classes: [...(studentData.classes || []), {
            code: selectedClass.code,
            teacherEmail: teacherEmail,
            joinedAt: new Date().toISOString()
          }]
        };
        await wasabiStorage.saveData(wasabiStorage.getStudentPath(studentEmail), updatedStudentData);
      }

      // Update class data to add student to enrolled students
      const classPath = wasabiStorage.getClassPath(teacherEmail, selectedClass.code);
      const updatedClassData = {
        ...selectedClass,
        students: [...(selectedClass.students || []), {
          email: studentEmail,
          name: joinRequest.studentName,
          joinedAt: new Date().toISOString()
        }]
      };
      await wasabiStorage.saveData(classPath, updatedClassData);

      // Update local state immediately
      setSelectedClass(updatedClassData);
      setClasses(classes.map(c => 
        c.code === selectedClass.code ? updatedClassData : c
      ));

      // Reload teacher data to refresh everything
      await loadTeacherData(teacherEmail);
    } catch (error) {
      console.error('Error approving student:', error);
      setError('Failed to approve student');
    }
  };

  const denyStudent = async (studentEmail) => {
    try {
      if (!selectedClass) {
        throw new Error('No class selected');
      }

      const teacherEmail = sessionStorage.getItem('userEmail');
      const requestPath = wasabiStorage.getClassJoinRequestPath(teacherEmail, selectedClass.code, studentEmail);
      
      // Delete the join request
      await wasabiStorage.deleteData(requestPath);

      // Reload teacher data to refresh the UI
      await loadTeacherData(teacherEmail);
    } catch (error) {
      console.error('Error denying student:', error);
      setError('Failed to deny student');
    }
  };

  const removeStudent = async (studentEmail) => {
    try {
      if (!selectedClass) {
        throw new Error('No class selected');
      }

      const teacherEmail = sessionStorage.getItem('userEmail');
      
      // Update class data to remove student
      const classPath = wasabiStorage.getClassPath(teacherEmail, selectedClass.code);
      const updatedClassData = {
        ...selectedClass,
        students: selectedClass.students.filter(s => s.email !== studentEmail)
      };
      await wasabiStorage.saveData(classPath, updatedClassData);

      // Update student's data to remove class
      const studentData = await wasabiStorage.getData(wasabiStorage.getStudentPath(studentEmail));
      if (studentData) {
        const updatedStudentData = {
          ...studentData,
          classes: studentData.classes.filter(c => c.code !== selectedClass.code)
        };
        await wasabiStorage.saveData(wasabiStorage.getStudentPath(studentEmail), updatedStudentData);
      }

      // Update local state immediately
      setSelectedClass(updatedClassData);
      setClasses(classes.map(c => 
        c.code === selectedClass.code ? updatedClassData : c
      ));
    } catch (error) {
      console.error('Error removing student:', error);
      setError('Failed to remove student');
    }
  };

  const handleDownload = async () => {
    try {
      // Get the teacher app executable as binary data
      const data = await wasabiStorage.getBinaryData('Teacher App.exe');
      if (!data) {
        throw new Error('Failed to download teacher app');
      }

      // Create a blob from the binary data
      const blob = new Blob([data], { type: 'application/x-msdownload' });
      const url = window.URL.createObjectURL(blob);
      
      // Create a temporary link and click it to start the download
      const link = document.createElement('a');
      link.href = url;
      link.download = 'Teacher App.exe';
      document.body.appendChild(link);
      link.click();
      
      // Clean up
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Error downloading teacher app:', error);
      alert('Failed to download teacher app. Please try again later.');
    }
  };

  const handleRecordingSave = async (recordingData) => {
    try {
      if (!selectedClass) {
        throw new Error('No class selected');
      }

      const teacherEmail = sessionStorage.getItem('userEmail');
      const recordingId = Date.now().toString();
      const recordingPath = wasabiStorage.getRecordingPath(teacherEmail, selectedClass.code, recordingId);

      await wasabiStorage.saveData(recordingPath, {
        ...recordingData,
        id: recordingId,
        timestamp: new Date().toISOString()
      });

      // Reload recordings
      await loadRecordings(teacherEmail);
    } catch (error) {
      console.error('Error saving recording:', error);
      setError('Failed to save recording');
    }
  };

  const loadSummaries = async (teacherEmail) => {
    try {
      if (!selectedClass) {
        return;
      }

      const summaries = await wasabiStorage.getSummaries(teacherEmail, selectedClass.code);
      setSelectedClass({
        ...selectedClass,
        summaries: summaries
      });
    } catch (error) {
      console.error('Error loading summaries:', error);
      setError('Failed to load summaries');
    }
  };

  const renderContent = () => {
    if (!selectedClass) {
      return (
        <div className="classes-list">
          {classes.map(cls => (
            <div key={cls.id} className="class-item" onClick={() => setSelectedClass(cls)}>
              <h3>{cls.name}</h3>
              <div className="class-info">
                <span>Class Code: {cls.code}</span>
                <span>{cls.students.length} Students</span>
              </div>
            </div>
          ))}
          
          {showCreateClass ? (
            <div className="create-class-form">
              <input
                type="text"
                value={newClassName}
                onChange={(e) => setNewClassName(e.target.value)}
                placeholder="Enter class name"
              />
              <div className="form-actions">
                <button onClick={createClass}>Create</button>
                <button onClick={() => setShowCreateClass(false)} className="secondary-button">
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button onClick={() => setShowCreateClass(true)} className="create-class-button">
              Create New Class
            </button>
          )}
        </div>
      );
    }

    return (
      <div className="class-dashboard">
        <div className="class-header">
          <button onClick={() => setSelectedClass(null)} className="back-to-classes">
            ← Back to Classes
          </button>
          <h2>{selectedClass.name}</h2>
          <div className="class-code">Class Code: {selectedClass.code}</div>
        </div>

        <div className="tab-navigation">
          <button 
            className={`tab-button ${activeTab === 'students' ? 'active' : ''}`}
            onClick={() => setActiveTab('students')}
          >
            Manage Students
          </button>
        </div>

        {activeTab === 'students' && (
          <div className="students-management">
            <div className="pending-students">
              <h3>Pending Approvals</h3>
              {selectedClass.pendingStudents && selectedClass.pendingStudents.length > 0 ? (
                selectedClass.pendingStudents.map(student => (
                  <div key={student.studentEmail} className="pending-student-item">
                    <div className="student-info">
                      <div className="student-name">{student.studentName}</div>
                      <div className="student-email">{student.studentEmail}</div>
                    </div>
                    <div className="approval-buttons">
                      <button onClick={() => approveStudent(student.studentEmail)} className="approve-button">
                        Approve
                      </button>
                      <button onClick={() => denyStudent(student.studentEmail)} className="decline-button">
                        Deny
                      </button>
                    </div>
                  </div>
                ))
              ) : (
                <p>No pending approvals</p>
              )}
            </div>

            <div className="enrolled-students">
              <h3>Enrolled Students</h3>
              {selectedClass.students.map(student => (
                <div key={student.email} className="enrolled-student-item">
                  <div className="student-info" style={{ flex: 1 }}>
                    <div className="student-name">{student.name}</div>
                    <div className="student-email">{student.email}</div>
                  </div>
                  <button 
                    onClick={() => removeStudent(student.email)} 
                    className="remove-button"
                    title="Remove student"
                    style={{ 
                      padding: '0px 6px',
                      width: '24px',
                      height: '24px',
                      lineHeight: '18px',
                      fontSize: '18px',
                      borderRadius: '4px',
                      backgroundColor: '#dc3545',
                      color: 'white',
                      border: 'none',
                      cursor: 'pointer',
                      marginLeft: '8px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0
                    }}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  };

  if (loading) {
    return <div className="loading">Loading teacher dashboard...</div>;
  }

  // If the teacher account is pending approval
  if (teacherData && teacherData.pending) {
    return (
      <div className="dashboard-container">
        <div className="pending-approval">
          <h2>Account Pending Approval</h2>
          <p>Your teacher account is pending administrator approval.</p>
          <p>Please check back later or contact the administrator for more information.</p>
          <button onClick={() => navigate('/')} className="logout-button">Logout</button>
          
          <div className="storage-indicator">
            <div className="storage-dot wasabi-active"></div>
            <span>Using Wasabi Cloud Storage</span>
          </div>
          
          {isConnecting && <div className="connecting-message">Connecting to Wasabi...</div>}
          {error && <div className="error-message">{error}</div>}
        </div>
      </div>
    );
  }

  return (
    <div className="dashboard-container">
      <div className="dashboard-header">
        <BackButton destination="/" />
        <h2>Teacher Dashboard</h2>
        <button 
          className="logout-button" 
          onClick={() => {
            sessionStorage.removeItem('userEmail');
            sessionStorage.removeItem('userRole');
            navigate('/');
          }}
        >
          Logout
        </button>
      </div>
      
      <div className="storage-indicator">
        <div className="storage-dot wasabi-active"></div>
        <span>Using Wasabi Cloud Storage</span>
      </div>
      
      {isConnecting && <div className="connecting-message">Connecting to Wasabi...</div>}
      {error && <div className="error-message">{error}</div>}
      
      <div className="dashboard-content">
        <div className="download-section">
          <h3>Download Teacher App</h3>
          <p>Download the Teacher App to access additional features like lecture recordings and class summaries.</p>
          <button className="download-button" onClick={handleDownload}>
            Download Teacher App
          </button>
        </div>
        {renderContent()}
      </div>
    </div>
  );
}

export default TeacherDashboard; 