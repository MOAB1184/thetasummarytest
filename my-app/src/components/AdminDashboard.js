import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import BackButton from './BackButton';
import wasabiStorage from '../services/WasabiStorage';

function AdminDashboard() {
  const [activeTab, setActiveTab] = useState('schools');
  const [schools, setSchools] = useState([]);
  const [teachers, setTeachers] = useState([]);
  const [selectedSchool, setSelectedSchool] = useState(null);
  const [newSchoolName, setNewSchoolName] = useState('');
  const [error, setError] = useState('');
  const [showCreateSchool, setShowCreateSchool] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      // Connect to Wasabi
      const isConnected = await wasabiStorage.testConnection();
      if (!isConnected) {
        setError('Failed to connect to storage');
        return;
      }

      // Load schools
      const schoolsData = await wasabiStorage.getData('schools.json') || [];
      setSchools(schoolsData);

      // Load pending teachers from teacher-approval folder
      const teachersData = await wasabiStorage.listObjects('teacher-approval/');
      const pendingTeachers = [];
      
      for (const teacher of teachersData) {
        if (teacher.Key.endsWith('.json')) {
          const email = teacher.Key.replace('teacher-approval/', '').replace('.json', '');
          const teacherData = await wasabiStorage.getData(wasabiStorage.getPendingTeacherPath(email));
          if (teacherData) {
            pendingTeachers.push({
              ...teacherData,
              email: email
            });
          }
        }
      }
      
      console.log('Found pending teachers:', pendingTeachers);
      setTeachers(pendingTeachers);
    } catch (error) {
      console.error('Error loading data:', error);
      setError('Failed to load data');
    }
  };

  const handleCreateSchool = async () => {
    if (!newSchoolName.trim()) {
      setError('Please enter a school name');
      return;
    }

    try {
      const newSchool = {
        id: Date.now(),
        name: newSchoolName.trim(),
        createdAt: new Date().toISOString()
      };

      // Save to schools list
      const updatedSchools = [...schools, newSchool];
      await wasabiStorage.saveData('schools.json', updatedSchools);
      
      // Create school info file
      await wasabiStorage.saveData(wasabiStorage.getSchoolPath(newSchool.name), newSchool);
      
      setSchools(updatedSchools);
      setNewSchoolName('');
      alert('School created successfully!');
    } catch (error) {
      console.error('Error creating school:', error);
      setError('Failed to create school');
    }
  };

  const handleApproveTeacher = async (email) => {
    try {
      // Get teacher data from approval folder
      const teacherData = await wasabiStorage.getData(wasabiStorage.getPendingTeacherPath(email));
      if (!teacherData) {
        setError('Teacher data not found');
        return;
      }

      // Create teacher folder structure
      const teacherFolderKey = `Skyline/teachers/${email}/`;
      await wasabiStorage.s3.putObject({
        Bucket: wasabiStorage.bucket,
        Key: teacherFolderKey,
        Body: '',
        ContentType: 'application/x-directory'
      }).promise();

      // Create classes folder
      const classesFolderKey = `Skyline/teachers/${email}/classes/`;
      await wasabiStorage.s3.putObject({
        Bucket: wasabiStorage.bucket,
        Key: classesFolderKey,
        Body: '',
        ContentType: 'application/x-directory'
      }).promise();

      // Move teacher data to approved folder
      const approvedTeacherData = {
        ...teacherData,
        approved: true,
        approvedAt: new Date().toISOString()
      };
      await wasabiStorage.saveData(wasabiStorage.getTeacherPath(email), approvedTeacherData);

      // Delete from pending folder
      await wasabiStorage.deleteData(wasabiStorage.getPendingTeacherPath(email));

      // Refresh data
      await loadData();
    } catch (error) {
      console.error('Error approving teacher:', error);
      setError('Failed to approve teacher');
    }
  };

  const handleDenyTeacher = async (email) => {
    try {
      // Delete from pending folder
      await wasabiStorage.deleteData(wasabiStorage.getPendingTeacherPath(email));
      
      // Refresh data
      await loadData();
    } catch (error) {
      console.error('Error denying teacher:', error);
      setError('Failed to deny teacher');
    }
  };

  const removeSchool = async (schoolId) => {
    try {
      // Filter out the school to be removed
      const updatedSchools = schools.filter(school => school.id !== schoolId);
      
      // Save updated schools list
      await wasabiStorage.saveData('schools.json', updatedSchools);
      
      // Update state
      setSchools(updatedSchools);
    } catch (error) {
      console.error('Error removing school:', error);
      setError('Failed to remove school');
    }
  };

  return (
    <div className="admin-dashboard">
      <BackButton destination="/" />
      <h2>Admin Dashboard</h2>

      {error && <div className="error-message">{error}</div>}

      <div className="schools-section">
        <h3>Schools</h3>
        {showCreateSchool ? (
          <div className="create-school-form">
            <input
              type="text"
              value={newSchoolName}
              onChange={(e) => setNewSchoolName(e.target.value)}
              placeholder="Enter school name"
            />
            <div className="form-actions">
              <button onClick={handleCreateSchool}>Create School</button>
              <button onClick={() => setShowCreateSchool(false)} className="secondary-button">
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button onClick={() => setShowCreateSchool(true)} className="create-school-button">
            Create New School
          </button>
        )}
        
        <div className="schools-list">
          {schools.map(school => (
            <div key={school.id} className="school-item">
              <div className="school-info">
                <div className="school-name">{school.name}</div>
              </div>
              <button 
                onClick={() => removeSchool(school.id)} 
                className="remove-button"
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

      <div className="teachers-section">
        <h3>Pending Teacher Approvals</h3>
        {teachers.length === 0 ? (
          <p>No pending teacher approvals</p>
        ) : (
          <div className="teachers-list">
            {teachers.map(teacher => (
              <div key={teacher.email} className="teacher-item">
                <div className="teacher-info">
                  <div className="teacher-name">{teacher.name}</div>
                  <div className="teacher-email">{teacher.email}</div>
                </div>
                <div className="teacher-actions">
                  <button 
                    className="approve-button"
                    onClick={() => handleApproveTeacher(teacher.email)}
                  >
                    Approve
                  </button>
                  <button 
                    className="deny-button"
                    onClick={() => handleDenyTeacher(teacher.email)}
                    style={{ backgroundColor: '#dc3545', color: 'white', marginLeft: '8px' }}
                  >
                    Deny
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default AdminDashboard; 