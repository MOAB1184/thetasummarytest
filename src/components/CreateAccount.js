import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import BackButton from './BackButton';
import wasabiStorage from '../services/WasabiStorage';

function CreateAccount() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('student');
  const [error, setError] = useState('');
  const navigate = useNavigate();

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

      // Check if user already exists in any folder
      try {
        const pendingTeacher = await wasabiStorage.getData(wasabiStorage.getPendingTeacherPath(email));
        const approvedTeacher = await wasabiStorage.getData(wasabiStorage.getTeacherPath(email));
        const pendingStudent = await wasabiStorage.getData(wasabiStorage.getPendingStudentPath(email));
        const approvedStudent = await wasabiStorage.getData(wasabiStorage.getStudentPath(email));

        if (pendingTeacher || approvedTeacher || pendingStudent || approvedStudent) {
          setError('Email already exists');
          return;
        }
      } catch (error) {
        // User doesn't exist, continue
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
        const teacherData = {
          ...userData,
          approved: false,
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
        await wasabiStorage.saveData(wasabiStorage.getStudentPath(email), studentData);
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

      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label htmlFor="name">Name</label>
          <input
            type="text"
            id="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            placeholder="Enter your name"
          />
        </div>

        <div className="form-group">
          <label htmlFor="email">Email</label>
          <input
            type="email"
            id="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            placeholder="Enter your email"
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
            placeholder="Enter your password"
          />
        </div>

        <div className="form-group">
          <label htmlFor="role">Role</label>
          <select
            id="role"
            value={role}
            onChange={(e) => setRole(e.target.value)}
            required
          >
            <option value="student">Student</option>
            <option value="teacher">Teacher</option>
          </select>
        </div>

        <button type="submit">Create Account</button>
      </form>

      <p>
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