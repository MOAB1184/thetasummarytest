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
  const [selectedTeacher, setSelectedTeacher] = useState(null);
  const [selectedClass, setSelectedClass] = useState(null);
  const [teacherClasses, setTeacherClasses] = useState([]);
  const [classStudents, setClassStudents] = useState([]);
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
              name: teacherData.name,
              email: email,
              school: teacherData.school // Just use the school name directly since we store it that way
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

      // Create teacher folder structure
      await wasabiStorage.s3.putObject({
        Bucket: wasabiStorage.bucket,
        Key: `${schoolName}/teachers/${email}/`,
        Body: '',
        ContentType: 'application/x-directory'
      }).promise();

      // Save teacher data
      await wasabiStorage.saveData(`${schoolName}/teachers/${email}/info.json`, {
        ...teacherData,
        approved: true,
        approvedAt: new Date().toISOString()
      });

      // Delete from pending
      await wasabiStorage.deleteData(`teacher-approval/${email}.json`);

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

      await loadData(); // Reload all data to ensure consistency
    } catch (error) {
      console.error('Error approving teacher:', error);
      setError('Failed to approve teacher');
      loadData(); // Reload data if there was an error
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

  const handleDeleteTeacher = async (schoolId, teacherEmail) => {
    try {
      const school = schools.find(s => s.id === schoolId);
      if (!school) {
        setError('School not found');
        return;
      }

      // Remove teacher's data
      await wasabiStorage.deleteData(`${school.name}/teachers/${teacherEmail}/info.json`);
      
      // Update state
      setApprovedTeachers(prev => ({
        ...prev,
        [school.name]: prev[school.name].filter(t => t.email !== teacherEmail)
      }));
    } catch (error) {
      console.error('Error removing teacher:', error);
      setError('Failed to remove teacher');
    }
  };

  const loadTeacherClasses = async (schoolName, teacherEmail) => {
    try {
      const classes = await wasabiStorage.listObjects(`${schoolName}/teachers/${teacherEmail}/classes/`);
      const classesData = await Promise.all(
        classes
          .filter(c => c.Key.endsWith('/info.json'))
          .map(async (c) => {
            const classCode = c.Key.split('/')[4]; // Get class code from path
            const classData = await wasabiStorage.getData(`${schoolName}/teachers/${teacherEmail}/classes/${classCode}/info.json`);
            return { ...classData, classCode };
          })
      );
      setTeacherClasses(classesData);
    } catch (error) {
      console.error('Error loading teacher classes:', error);
      setError('Failed to load classes');
    }
  };

  const loadClassStudents = async (schoolName, classCode) => {
    try {
      const students = await wasabiStorage.listObjects(`${schoolName}/teachers/${selectedTeacher.email}/classes/${classCode}/students/`);
      const studentsData = await Promise.all(
        students
          .filter(s => s.Key.endsWith('/info.json'))
          .map(async (s) => {
            const studentEmail = s.Key.split('/')[6]; // Get student email from path
            const studentData = await wasabiStorage.getData(`${schoolName}/students/${studentEmail}/info.json`);
            return { ...studentData, email: studentEmail };
          })
      );
      setClassStudents(studentsData);
    } catch (error) {
      console.error('Error loading students:', error);
      setError('Failed to load students');
    }
  };

  const handleTeacherClick = async (teacher) => {
    if (selectedTeacher?.email === teacher.email) {
      setSelectedTeacher(null);
      setTeacherClasses([]);
      setSelectedClass(null);
      setClassStudents([]);
    } else {
      setSelectedTeacher(teacher);
      setSelectedClass(null);
      setClassStudents([]);
      await loadTeacherClasses(teacher.school, teacher.email);
    }
  };

  const handleClassClick = async (classData) => {
    if (selectedClass?.classCode === classData.classCode) {
      setSelectedClass(null);
      setClassStudents([]);
    } else {
      setSelectedClass(classData);
      await loadClassStudents(selectedTeacher.school, classData.classCode);
    }
  };

  if (loading) {
    return <div className="loading">Loading admin dashboard...</div>;
  }

  return (
    <div className="admin-dashboard">
      <style jsx>{`
        .admin-dashboard {
          padding: 20px;
          max-width: 1200px;
          margin: 0 auto;
        }

        .admin-content {
          display: flex;
          flex-direction: column;
          gap: 30px;
        }

        .schools-section {
          margin-bottom: 30px;
        }

        .schools-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(350px, 1fr));
          gap: 20px;
          margin-top: 20px;
        }

        .school-card {
          background-color: #2d2d2d;
          border-radius: 8px;
          padding: 20px;
          cursor: pointer;
          transition: transform 0.2s, background-color 0.2s;
          position: relative;
        }

        .school-card:hover {
          transform: translateY(-2px);
          background-color: #353535;
        }

        .school-card h4 {
          margin: 0 0 10px 0;
          color: #fff;
          font-size: 18px;
          padding-right: 30px;
        }

        .teacher-count {
          color: #888;
          margin: 0;
          font-size: 14px;
        }

        .teachers-section {
          background-color: #2d2d2d;
          border-radius: 8px;
          padding: 20px;
          width: 100%;
        }

        .teachers-list {
          display: flex;
          flex-direction: column;
          gap: 10px;
          margin-top: 15px;
          width: 100%;
        }

        .teacher-item {
          background-color: #1a1a1a;
          border-radius: 4px;
          padding: 15px;
          display: flex;
          justify-content: space-between;
          align-items: center;
          min-width: 400px;
          cursor: pointer;
          transition: background-color 0.2s;
        }

        .teacher-item:hover {
          background-color: #2d2d2d;
        }

        .teacher-item.selected {
          background-color: #2d2d2d;
          border-bottom-left-radius: 0;
          border-bottom-right-radius: 0;
        }

        .teacher-info {
          display: flex;
          flex-direction: column;
          gap: 4px;
          flex: 1;
          margin-right: 20px;
        }

        .teacher-name {
          font-weight: bold;
          color: #fff;
          font-size: 16px;
        }

        .teacher-email {
          color: #888;
          font-size: 14px;
        }

        .delete-button {
          background-color: #dc3545;
          color: white;
          border: none;
          border-radius: 4px;
          padding: 8px 16px;
          cursor: pointer;
          font-size: 14px;
          transition: background-color 0.2s;
          min-width: 80px;
          white-space: nowrap;
        }

        .delete-button:hover {
          background-color: #c82333;
        }

        .teacher-approvals-section {
          background-color: #2d2d2d;
          border-radius: 8px;
          padding: 20px;
        }

        .teacher-approvals-list {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(400px, 1fr));
          gap: 20px;
          margin-top: 15px;
        }

        .teacher-approval-item {
          background-color: #1a1a1a;
          border-radius: 8px;
          padding: 20px;
          display: flex;
          flex-direction: column;
          gap: 15px;
        }

        .approval-actions {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 10px;
        }

        .approve-button, .deny-button {
          color: white;
          border: none;
          border-radius: 4px;
          padding: 12px 0;
          cursor: pointer;
          font-size: 16px;
          font-weight: 500;
          transition: background-color 0.2s;
          width: 100%;
          height: 45px;
          display: flex;
          align-items: center;
          justify-content: center;
          margin: 0;
        }

        .approve-button {
          background-color: #28a745;
        }

        .approve-button:hover {
          background-color: #218838;
        }

        .deny-button {
          background-color: #dc3545;
        }

        .deny-button:hover {
          background-color: #c82333;
        }

        h2 {
          color: #fff;
          margin-bottom: 30px;
        }

        h3 {
          color: #fff;
          margin: 0 0 15px 0;
        }

        .error-message {
          background-color: #dc3545;
          color: white;
          padding: 10px;
          border-radius: 4px;
          margin-bottom: 20px;
        }

        .teacher-classes {
          background-color: #2d2d2d;
          padding: 15px;
          margin-top: -1px;
          border-bottom-left-radius: 4px;
          border-bottom-right-radius: 4px;
        }

        .classes-list {
          display: flex;
          flex-direction: column;
          gap: 10px;
          margin-top: 10px;
        }

        .class-item {
          background-color: #1a1a1a;
          border-radius: 4px;
          padding: 12px;
          cursor: pointer;
          transition: background-color 0.2s;
        }

        .class-item:hover {
          background-color: #353535;
        }

        .class-item.selected {
          background-color: #353535;
        }

        .class-info {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }

        .class-name {
          font-weight: bold;
          color: #fff;
        }

        .class-code {
          color: #888;
          font-size: 14px;
        }

        .class-students {
          margin-top: 15px;
          padding-top: 15px;
          border-top: 1px solid #444;
        }

        .students-list {
          display: flex;
          flex-direction: column;
          gap: 8px;
          margin-top: 10px;
        }

        .student-item {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 8px;
          background-color: #1a1a1a;
          border-radius: 4px;
        }

        .student-name {
          color: #fff;
        }

        .student-email {
          color: #888;
          font-size: 14px;
        }

        .no-classes, .no-students {
          color: #888;
          font-style: italic;
          text-align: center;
          padding: 10px;
        }

        h4 {
          color: #fff;
          margin: 0 0 10px 0;
          font-size: 16px;
        }

        h5 {
          color: #fff;
          margin: 0 0 8px 0;
          font-size: 14px;
        }
      `}</style>
      <BackButton destination="/" />
      <h2>Admin Dashboard</h2>
      {error && <div className="error-message">{error}</div>}

      <div className="admin-content">
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
        
          <div className="schools-grid">
            {schools.map((school) => (
              <div 
                key={school.id} 
                className="school-card"
                onClick={() => setSelectedSchool(school)}
              >
                <h4>{school.name}</h4>
                <p className="teacher-count">
                  {approvedTeachers[school.name]?.length || 0} Teachers
                </p>
            </div>
          ))}
        </div>
      </div>

        {selectedSchool && (
        <div className="teachers-section">
            <h3>{selectedSchool.name} Teachers</h3>
          <div className="teachers-list">
              {approvedTeachers[selectedSchool.name]?.map((teacher) => (
                <div key={teacher.email}>
                  <div className="teacher-item">
                    <div className="teacher-info" onClick={() => handleTeacherClick(teacher)} style={{ cursor: 'pointer' }}>
                      <span className="teacher-name">{teacher.name}</span>
                      <span className="teacher-email">{teacher.email}</span>
                </div>
                <div className="teacher-actions">
                      <button 
                        className="delete-button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteTeacher(selectedSchool.id, teacher.email);
                        }}
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                  {selectedTeacher?.email === teacher.email && (
                    <div className="teacher-details" style={{ 
                      backgroundColor: '#1a1a1a',
                      padding: '15px',
                      marginTop: '1px',
                      borderBottomLeftRadius: '4px',
                      borderBottomRightRadius: '4px'
                    }}>
                      <div className="classes-section">
                        <h4 style={{ color: '#fff', marginBottom: '10px' }}>Classes:</h4>
                        {teacherClasses.length > 0 ? (
                          teacherClasses.map((classData) => (
                            <div 
                              key={classData.classCode} 
                              className={`class-item ${selectedClass?.classCode === classData.classCode ? 'selected' : ''}`}
                              onClick={() => handleClassClick(classData)}
                              style={{ 
                                backgroundColor: selectedClass?.classCode === classData.classCode ? '#353535' : '#2d2d2d',
                                padding: '10px',
                                marginBottom: '8px',
                                borderRadius: '4px',
                                cursor: 'pointer'
                              }}
                            >
                              <div className="class-info">
                                <span style={{ color: '#fff', fontWeight: 'bold' }}>{classData.name}</span>
                                <span style={{ color: '#888', fontSize: '14px' }}>Code: {classData.classCode}</span>
                              </div>
                              {selectedClass?.classCode === classData.classCode && (
                                <div className="class-students" style={{ marginTop: '15px', borderTop: '1px solid #444', paddingTop: '15px' }}>
                                  <h5 style={{ color: '#fff', marginBottom: '10px' }}>Enrolled Students:</h5>
                                  <div className="students-list">
                                    {classStudents.map((student) => (
                                      <div key={student.email} className="student-item" style={{
                                        backgroundColor: '#1a1a1a',
                                        padding: '10px',
                                        borderRadius: '4px',
                                        marginBottom: '8px'
                                      }}>
                                        <span style={{ color: '#fff' }}>{student.name}</span>
                                        <span style={{ color: '#888', fontSize: '14px' }}>{student.email}</span>
                                      </div>
                                    ))}
                                    {classStudents.length === 0 && (
                                      <p style={{ color: '#888', fontStyle: 'italic' }}>No students enrolled in this class</p>
                                    )}
                                  </div>
                                </div>
                              )}
                            </div>
                          ))
                        ) : (
                          <p style={{ color: '#888', fontStyle: 'italic', padding: '10px' }}>No classes created</p>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {teachers.length > 0 && (
          <div className="teacher-approvals-section">
            <h3>Teacher Approvals</h3>
            <div className="teacher-approvals-list">
              {teachers.map((teacher) => (
                <div key={teacher.email} className="teacher-approval-item">
                  <div className="teacher-info">
                    <span className="teacher-name">{teacher.name}</span>
                    <span className="teacher-email">{teacher.email}</span>
                    <span className="teacher-school" style={{ color: '#888', fontSize: '14px' }}>School: {teacher.school}</span>
                  </div>
                  <div className="approval-actions">
                  <button 
                    className="approve-button"
                    onClick={() => handleApproveTeacher(teacher.email)}
                  >
                    Approve
                  </button>
                  <button 
                    className="deny-button"
                    onClick={() => handleDenyTeacher(teacher.email)}
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
    </div>
  );
}

export default AdminDashboard; 