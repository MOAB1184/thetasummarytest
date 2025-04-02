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

  const handleCreateAccount = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    try {
      // Check if user already exists in pending folders
      if (role === 'teacher') {
        const pendingTeacher = await wasabiStorage.getData(`teacher-approval/${email}.json`);
        if (pendingTeacher) {
          setError('An account with this email is already pending approval');
          return;
        }
      } else {
        const pendingStudent = await wasabiStorage.getData(`student-approval/${email}.json`);
        if (pendingStudent) {
          setError('An account with this email is already pending approval');
          return;
        }
      }

      // Check if user exists in approved location
      if (role === 'teacher') {
        const approvedTeacher = await wasabiStorage.getData(`${selectedSchool}/teachers/${email}/info.json`);
        if (approvedTeacher) {
          setError('An account with this email already exists');
          return;
        }
      } else {
        const approvedStudent = await wasabiStorage.getData(`${selectedSchool}/students/${email}/info.json`);
        if (approvedStudent) {
          setError('An account with this email already exists');
          return;
        }
      }

      // Create user data
      const userData = {
        email,
        password,
        name,
        role,
        school: selectedSchool,
        createdAt: new Date().toISOString()
      };

      // Save user data based on role
      if (role === 'teacher') {
        await wasabiStorage.saveData(`teacher-approval/${email}.json`, userData);
        setSuccess('Account created successfully! Please wait for admin approval.');
      } else {
        // For students, save directly to approved location
        await wasabiStorage.saveData(`${selectedSchool}/students/${email}/info.json`, userData);
        setSuccess('Account created successfully! You can now log in.');
      }

      // Clear form
      setName('');
      setEmail('');
      setPassword('');
      setRole('student');
      setSelectedSchool(schools[0]?.name || '');
      
    } catch (error) {
      console.error('Error creating account:', error);
      setError('Failed to create account. Please try again.');
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

      <form onSubmit={handleCreateAccount}>
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