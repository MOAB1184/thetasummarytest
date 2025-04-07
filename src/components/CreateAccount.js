import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import BackButton from './BackButton';
import wasabiStorage from '../services/WasabiStorage';

function CreateAccount() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [schools, setSchools] = useState([]);
  const [selectedSchool, setSelectedSchool] = useState('');
  const [role, setRole] = useState('student');
  const navigate = useNavigate();

  useEffect(() => {
    loadSchools();
  }, []);

  const loadSchools = async () => {
    try {
      const schoolsData = await wasabiStorage.getData('schools.json') || [];
      setSchools(schoolsData);
      if (schoolsData.length > 0) {
        setSelectedSchool(schoolsData[0].name);
      }
    } catch (error) {
      console.error('Error loading schools:', error);
      setError('Failed to load schools');
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    try {
      // Connect to Wasabi
      const isConnected = await wasabiStorage.testConnection();
      if (!isConnected) {
        setError('Failed to connect to storage');
        return;
      }

      // Check if user already exists in any school
      const schools = await wasabiStorage.getData('schools.json') || [];
      for (const school of schools) {
        // Check for existing teacher
        const existingTeacher = await wasabiStorage.getData(`${school.name}/teachers/${email}/info.json`);
        if (existingTeacher) {
          setError('This email is already registered as a teacher in another school');
          return;
        }

        // Check for existing student
        const existingStudent = await wasabiStorage.getData(`${school.name}/students/${email}/info.json`);
        if (existingStudent) {
          setError('This email is already registered as a student in another school');
          return;
        }
      }

      // Check pending approvals
      const pendingTeacher = await wasabiStorage.getData(wasabiStorage.getPendingTeacherPath(email));
      const pendingStudent = await wasabiStorage.getData(wasabiStorage.getPendingStudentPath(email));

      if (pendingTeacher || pendingStudent) {
        setError('This email is already pending approval');
        return;
      }

      // Create user data
      const userData = {
        name,
        email,
        password,
        role,
        createdAt: new Date().toISOString()
      };

      // Save user data to appropriate folder
      if (role === 'teacher') {
        if (!selectedSchool) {
          setError('Please select a school for teacher accounts');
          return;
        }

        const teacherData = {
          ...userData,
          approved: false,
          school: selectedSchool,
          classes: []
        };
        await wasabiStorage.saveData(wasabiStorage.getPendingTeacherPath(email), teacherData);
        alert('Account created! Please wait for admin approval.');
        navigate('/');
      } else {
        const studentData = {
          ...userData,
          approved: true,
          classes: []
        };
        await wasabiStorage.saveData(wasabiStorage.getStudentPath(selectedSchool, email), studentData);
        alert('Account created! You can now log in and join classes.');
        navigate('/');
      }
    } catch (error) {
      console.error('Error creating account:', error);
      setError('An error occurred while creating your account');
    }
  };

  return (
    <div className="create-account-container">
      <BackButton destination="/" />
      <h2>Create Account</h2>

      <div className="storage-indicator">
        <div className="storage-dot wasabi-active"></div>
        <span>Using Wasabi Cloud Storage</span>
      </div>

      {error && <div className="error-message">{error}</div>}
      {success && <div className="success-message">{success}</div>}

      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label htmlFor="email">Email</label>
          <input
            type="email"
            id="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            style={{ color: '#ffffff' }}
          />
        </div>
        <div className="form-group">
          <label htmlFor="password">Password</label>
          <input
            type="password"
            id="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            style={{ color: '#ffffff' }}
          />
        </div>
        <div className="form-group">
          <label htmlFor="name">Full Name</label>
          <input
            type="text"
            id="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            style={{ color: '#ffffff' }}
          />
        </div>
        <div className="form-group">
          <label htmlFor="role">Role</label>
          <select
            id="role"
            value={role}
            onChange={(e) => setRole(e.target.value)}
            required
            style={{ color: '#ffffff' }}
          >
            <option value="student">Student</option>
            <option value="teacher">Teacher</option>
          </select>
        </div>
        {role === 'teacher' && (
          <div className="form-group">
            <label htmlFor="school">School</label>
            <select
              id="school"
              value={selectedSchool}
              onChange={(e) => setSelectedSchool(e.target.value)}
              required
              style={{ color: '#ffffff' }}
            >
              <option value="">Select a school</option>
              {schools.map((school) => (
                <option key={school.id} value={school.name}>
                  {school.name}
                </option>
              ))}
            </select>
          </div>
        )}
        <button type="submit" className="create-account-button">
          Create Account
        </button>
      </form>

      <p className="login-link">
        Already have an account?{' '}
        <button 
          className="secondary-button"
          onClick={() => navigate('/')}
        >
          Login
        </button>
      </p>
    </div>
  );
}

export default CreateAccount; 