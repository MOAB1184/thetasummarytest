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
    <div className="admin-dashboard" style={{ 
      padding: '20px',
      maxWidth: '1200px',
      margin: '0 auto',
      minHeight: '100vh',
      backgroundColor: '#1a1a1a',
      color: 'white'
    }}>
      <BackButton destination="/" />
      <h2 style={{ fontSize: '2.5rem', marginBottom: '2rem' }}>Admin Dashboard</h2>

      {error && <div style={{ 
        backgroundColor: '#dc3545', 
        color: 'white', 
        padding: '12px', 
        borderRadius: '6px', 
        marginBottom: '1rem' 
      }}>{error}</div>}

      <div style={{ marginBottom: '3rem' }}>
        <h3 style={{ fontSize: '1.8rem', marginBottom: '1.5rem' }}>Schools</h3>
        {showCreateSchool ? (
          <div style={{
            backgroundColor: '#2d2d2d',
            padding: '20px',
            borderRadius: '8px',
            marginBottom: '1.5rem'
          }}>
            <input
              type="text"
              value={newSchoolName}
              onChange={(e) => setNewSchoolName(e.target.value)}
              placeholder="Enter school name"
              style={{
                width: '100%',
                padding: '12px',
                marginBottom: '1rem',
                border: '1px solid #444',
                borderRadius: '6px',
                backgroundColor: '#1a1a1a',
                color: 'white',
                fontSize: '1rem'
              }}
            />
            <div style={{ display: 'flex', gap: '10px' }}>
              <button 
                onClick={handleCreateSchool}
                style={{
                  padding: '10px 20px',
                  backgroundColor: '#2196f3',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '1rem'
                }}
              >
                Create School
              </button>
              <button 
                onClick={() => setShowCreateSchool(false)}
                style={{
                  padding: '10px 20px',
                  backgroundColor: '#6c757d',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '1rem'
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button 
            onClick={() => setShowCreateSchool(true)}
            style={{
              backgroundColor: '#2196f3',
              color: 'white',
              border: 'none',
              padding: '12px 24px',
              borderRadius: '8px',
              fontSize: '1rem',
              cursor: 'pointer',
              marginBottom: '1.5rem',
              width: '100%',
              maxWidth: '300px'
            }}
          >
            Create New School
          </button>
        )}
        
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
          gap: '20px'
        }}>
          {schools.map(school => (
            <div key={school.id} style={{
              backgroundColor: '#2d2d2d',
              borderRadius: '10px',
              padding: '20px',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
              transition: 'transform 0.2s, box-shadow 0.2s'
            }}>
              <div style={{ fontSize: '1.2rem', fontWeight: '500', color: 'white' }}>
                {school.name}
              </div>
              <button 
                onClick={() => removeSchool(school.id)}
                style={{ 
                  width: '32px',
                  height: '32px',
                  borderRadius: '6px',
                  backgroundColor: '#dc3545',
                  color: 'white',
                  border: 'none',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '1.2rem'
                }}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      </div>

      <div style={{ marginBottom: '3rem' }}>
        <h3 style={{ fontSize: '1.8rem', marginBottom: '1.5rem' }}>Pending Teacher Approvals</h3>
        {teachers.length === 0 ? (
          <p>No pending teacher approvals</p>
        ) : (
          <div style={{ display: 'grid', gap: '20px' }}>
            {teachers.map(teacher => (
              <div key={teacher.email} style={{
                backgroundColor: '#2d2d2d',
                borderRadius: '10px',
                padding: '20px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
              }}>
                <div>
                  <div style={{ fontSize: '1.2rem', fontWeight: '500', color: 'white', marginBottom: '4px' }}>
                    {teacher.name}
                  </div>
                  <div style={{ color: '#888', fontSize: '0.9rem' }}>
                    {teacher.email}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '10px' }}>
                  <button 
                    onClick={() => handleApproveTeacher(teacher.email)}
                    style={{
                      padding: '8px 20px',
                      backgroundColor: '#28a745',
                      color: 'white',
                      border: 'none',
                      borderRadius: '6px',
                      cursor: 'pointer',
                      fontSize: '0.9rem',
                      minWidth: '100px'
                    }}
                  >
                    Approve
                  </button>
                  <button 
                    onClick={() => handleDenyTeacher(teacher.email)}
                    style={{
                      padding: '8px 20px',
                      backgroundColor: '#dc3545',
                      color: 'white',
                      border: 'none',
                      borderRadius: '6px',
                      cursor: 'pointer',
                      fontSize: '0.9rem',
                      minWidth: '100px'
                    }}
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