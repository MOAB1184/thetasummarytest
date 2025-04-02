import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import BackButton from './BackButton';
import wasabiStorage from '../services/WasabiStorage';

function AdminDashboard() {
  const [activeTab, setActiveTab] = useState('schools');
  const [schools, setSchools] = useState([]);
  const [teachers, setTeachers] = useState([]);
  const [approvedTeachers, setApprovedTeachers] = useState({});  // Map of school -> teachers
  const [selectedSchool, setSelectedSchool] = useState(null);
  const [newSchoolName, setNewSchoolName] = useState('');
  const [error, setError] = useState('');
  const [showCreateSchool, setShowCreateSchool] = useState(false);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      // Load schools and teachers in parallel
      const [schoolsData, teachersData] = await Promise.all([
        wasabiStorage.getData('schools.json') || [],
        wasabiStorage.listObjects('teacher-approval/')
      ]);

      setSchools(schoolsData);

      // Process pending teachers
      const pendingTeachers = await Promise.all(
        teachersData
          .filter(teacher => teacher.Key.endsWith('.json'))
          .map(async (teacher) => {
            const email = teacher.Key.replace('teacher-approval/', '').replace('.json', '');
            const teacherData = await wasabiStorage.getData(`teacher-approval/${email}.json`);
            return {
              ...teacherData,
              email: email
            };
          })
      );
      setTeachers(pendingTeachers);

      // Load approved teachers for each school in parallel
      const approvedTeachersMap = {};
      const schoolPromises = schoolsData.map(async (school) => {
        const teachersList = await wasabiStorage.listObjects(`${school.name}/teachers/`);
        const schoolTeachers = await Promise.all(
          teachersList
            .filter(teacher => teacher.Key.endsWith('info.json')) // Only get actual teacher info files
            .map(async (teacher) => {
              const email = teacher.Key.split('/')[2];
              const teacherData = await wasabiStorage.getData(`${school.name}/teachers/${email}/info.json`);
              if (teacherData) {
                return {
                  ...teacherData,
                  email,
                  school: school.name
                };
              }
              return null;
            })
        );
        approvedTeachersMap[school.name] = schoolTeachers.filter(t => t !== null);
      });

      await Promise.all(schoolPromises);
      setApprovedTeachers(approvedTeachersMap);
      setLoading(false);
    } catch (error) {
      console.error('Error loading data:', error);
      setError('Failed to load data');
      setLoading(false);
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

      // Create school folder structure
      const schoolFolderKey = `${newSchoolName.trim()}/`;
      const teachersFolderKey = `${newSchoolName.trim()}/teachers/`;
      const studentsFolderKey = `${newSchoolName.trim()}/students/`;

      // Create the folders in parallel
      await Promise.all([
        wasabiStorage.s3.putObject({
          Bucket: wasabiStorage.bucket,
          Key: schoolFolderKey,
          Body: '',
          ContentType: 'application/x-directory'
        }).promise(),
        wasabiStorage.s3.putObject({
          Bucket: wasabiStorage.bucket,
          Key: teachersFolderKey,
          Body: '',
          ContentType: 'application/x-directory'
        }).promise(),
        wasabiStorage.s3.putObject({
          Bucket: wasabiStorage.bucket,
          Key: studentsFolderKey,
          Body: '',
          ContentType: 'application/x-directory'
        }).promise()
      ]);

      // Save school info and update schools list in parallel
      await Promise.all([
        wasabiStorage.saveData(`${newSchoolName.trim()}/info.json`, newSchool),
        wasabiStorage.saveData('schools.json', [...schools, newSchool])
      ]);
      
      setSchools([...schools, newSchool]);
      setNewSchoolName('');
      setApprovedTeachers({ ...approvedTeachers, [newSchool.name]: [] });
      alert('School created successfully!');
    } catch (error) {
      console.error('Error creating school:', error);
      setError('Failed to create school');
    }
  };

  const handleApproveTeacher = async (email) => {
    try {
      const teacherData = await wasabiStorage.getData(`teacher-approval/${email}.json`);
      if (!teacherData) {
        setError('Teacher data not found');
        return;
      }

      const schoolName = teacherData.school;

      // Remove from pending list immediately for UI responsiveness
      setTeachers(prev => prev.filter(t => t.email !== email));

      // Create teacher folder structure and move data in parallel
      await Promise.all([
        wasabiStorage.s3.putObject({
          Bucket: wasabiStorage.bucket,
          Key: `${schoolName}/teachers/${email}/`,
          Body: '',
          ContentType: 'application/x-directory'
        }).promise(),
        wasabiStorage.s3.putObject({
          Bucket: wasabiStorage.bucket,
          Key: `${schoolName}/teachers/${email}/classes/`,
          Body: '',
          ContentType: 'application/x-directory'
        }).promise(),
        wasabiStorage.saveData(`${schoolName}/teachers/${email}/info.json`, {
          ...teacherData,
          approved: true,
          approvedAt: new Date().toISOString()
        }),
        wasabiStorage.deleteData(`teacher-approval/${email}.json`)
      ]);

      // Update approved teachers list
      setApprovedTeachers(prev => ({
        ...prev,
        [schoolName]: [
          ...(prev[schoolName] || []),
          {
            ...teacherData,
            email,
            school: schoolName
          }
        ]
      }));
    } catch (error) {
      console.error('Error approving teacher:', error);
      setError('Failed to approve teacher');
      // Revert the UI change if the operation failed
      loadData();
    }
  };

  const handleDenyTeacher = async (email) => {
    try {
      // Remove from pending list immediately for UI responsiveness
      setTeachers(prev => prev.filter(t => t.email !== email));
      await wasabiStorage.deleteData(`teacher-approval/${email}.json`);
    } catch (error) {
      console.error('Error denying teacher:', error);
      setError('Failed to deny teacher');
      // Revert the UI change if the operation failed
      loadData();
    }
  };

  const removeSchool = async (schoolId) => {
    try {
      const updatedSchools = schools.filter(school => school.id !== schoolId);
      await wasabiStorage.saveData('schools.json', updatedSchools);
      setSchools(updatedSchools);
      const newApprovedTeachers = { ...approvedTeachers };
      delete newApprovedTeachers[schools.find(s => s.id === schoolId).name];
      setApprovedTeachers(newApprovedTeachers);
    } catch (error) {
      console.error('Error removing school:', error);
      setError('Failed to remove school');
    }
  };

  const removeTeacher = async (schoolName, teacherEmail) => {
    try {
      // Remove teacher's data
      await wasabiStorage.deleteData(`${schoolName}/teachers/${teacherEmail}/info.json`);
      
      // Update state
      setApprovedTeachers(prev => ({
        ...prev,
        [schoolName]: prev[schoolName].filter(t => t.email !== teacherEmail)
      }));
    } catch (error) {
      console.error('Error removing teacher:', error);
      setError('Failed to remove teacher');
    }
  };

  if (loading) {
    return <div className="loading">Loading admin dashboard...</div>;
  }

  return (
    <div className="admin-dashboard" style={{ 
      padding: '20px',
      maxWidth: '1400px',
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
        
        <div className="schools-grid" style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
          gap: '20px',
          marginTop: '20px'
        }}>
          {schools.map(school => (
            <div key={school.id} className="school-box" style={{
              backgroundColor: '#2d2d2d',
              borderRadius: '8px',
              padding: '20px',
              cursor: 'pointer',
              transition: 'transform 0.2s, background-color 0.2s',
              ':hover': {
                transform: 'translateY(-2px)',
                backgroundColor: '#353535'
              }
            }} onClick={() => setSelectedSchool(selectedSchool?.id === school.id ? null : school)}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h4 style={{ margin: 0 }}>{school.name}</h4>
                <button 
                  onClick={(e) => {
                    e.stopPropagation();
                    removeSchool(school.id);
                  }}
                  style={{
                    width: '24px',
                    height: '24px',
                    fontSize: '14px',
                    backgroundColor: '#dc3545',
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: 0,
                    minWidth: '24px'
                  }}
                >
                  ×
                </button>
              </div>
              <div style={{ marginTop: '10px', color: '#888' }}>
                Teachers: {approvedTeachers[school.name]?.length || 0}
              </div>
              {selectedSchool?.id === school.id && (
                <div style={{ marginTop: '15px', borderTop: '1px solid #444', paddingTop: '15px' }}>
                  <h5 style={{ margin: '0 0 10px 0' }}>Teachers:</h5>
                  {approvedTeachers[school.name]?.length > 0 ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {approvedTeachers[school.name].map(teacher => (
                        <div key={teacher.email} style={{ 
                          backgroundColor: '#1a1a1a',
                          padding: '12px',
                          borderRadius: '4px',
                          fontSize: '14px',
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center'
                        }}>
                          <div>
                            <div>{teacher.name}</div>
                            <div style={{ color: '#888', fontSize: '12px' }}>{teacher.email}</div>
                          </div>
                          <button
                            onClick={() => removeTeacher(school.name, teacher.email)}
                            style={{
                              width: '24px',
                              height: '24px',
                              fontSize: '14px',
                              backgroundColor: '#dc3545',
                              color: 'white',
                              border: 'none',
                              borderRadius: '4px',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              padding: 0,
                              minWidth: '24px'
                            }}
                          >
                            ×
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div style={{ color: '#888' }}>No teachers yet</div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {teachers.length > 0 && (
        <div className="teachers-section" style={{ marginTop: '40px' }}>
          <h3>Pending Teacher Approvals</h3>
          <div className="teachers-list" style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(400px, 1fr))',
            gap: '20px'
          }}>
            {teachers.map(teacher => (
              <div key={teacher.email} className="teacher-item" style={{
                backgroundColor: '#2d2d2d',
                borderRadius: '8px',
                padding: '20px',
                display: 'flex',
                flexDirection: 'column',
                gap: '10px'
              }}>
                <div className="teacher-info">
                  <div style={{ fontSize: '18px', fontWeight: 'bold' }}>{teacher.name}</div>
                  <div style={{ color: '#888' }}>{teacher.email}</div>
                  <div style={{ color: '#888' }}>School: {teacher.school}</div>
                </div>
                <div className="teacher-actions" style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: '10px',
                  marginTop: 'auto',
                  maxWidth: '400px',
                  margin: '10px auto 0'
                }}>
                  <button 
                    className="approve-button"
                    onClick={() => handleApproveTeacher(teacher.email)}
                    style={{
                      height: '36px',
                      backgroundColor: '#28a745',
                      color: 'white',
                      border: 'none',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      fontSize: '14px',
                      fontWeight: 'bold',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}
                  >
                    Approve
                  </button>
                  <button 
                    className="deny-button"
                    onClick={() => handleDenyTeacher(teacher.email)}
                    style={{
                      height: '36px',
                      backgroundColor: '#dc3545',
                      color: 'white',
                      border: 'none',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      fontSize: '14px',
                      fontWeight: 'bold',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}
                  >
                    Deny
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default AdminDashboard; 