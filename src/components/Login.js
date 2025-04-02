import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import wasabiStorage from '../services/WasabiStorage';

function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [role, setRole] = useState('student');
  const navigate = useNavigate();

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');

    try {
      // Admin login check
      if ((email === 'admin' || email === 'admin@example.com') && password === 'duggy') {
        sessionStorage.setItem('userEmail', 'admin');
        sessionStorage.setItem('userRole', 'admin');
        navigate('/admin-dashboard');
        return;
      }

      // Connect to Wasabi
      const isConnected = await wasabiStorage.testConnection();
      if (!isConnected) {
        setError('Failed to connect to storage');
        return;
      }

      // Check all possible locations for the user
      let userData = null;
      let isPending = false;
      let userSchool = null;

      if (role === 'teacher') {
        // First check pending teachers
        const pendingTeacher = await wasabiStorage.getData(`teacher-approval/${email}.json`);
        if (pendingTeacher) {
          userData = pendingTeacher;
          isPending = true;
          userSchool = pendingTeacher.school;
        } else {
          // Then check all schools for approved teachers
          const schools = await wasabiStorage.getData('schools.json') || [];
          for (const school of schools) {
            const approvedTeacher = await wasabiStorage.getData(`${school.name}/teachers/${email}/info.json`);
            if (approvedTeacher) {
              userData = approvedTeacher;
              userSchool = school.name;
              break;
            }
          }
        }
      } else {
        // First check pending students
        const pendingStudent = await wasabiStorage.getData(`student-approval/${email}.json`);
        if (pendingStudent) {
          userData = pendingStudent;
          isPending = true;
          userSchool = pendingStudent.school;
        } else {
          // Then check all schools for approved students
          const schools = await wasabiStorage.getData('schools.json') || [];
          for (const school of schools) {
            const approvedStudent = await wasabiStorage.getData(`${school.name}/students/${email}/info.json`);
            if (approvedStudent) {
              userData = approvedStudent;
              userSchool = school.name;
              break;
            }
          }
        }
      }

      if (!userData) {
        setError('Invalid email or password');
        return;
      }

      if (userData.password !== password) {
        setError('Invalid email or password');
        return;
      }

      // Only check pending status for teachers
      if (isPending && role === 'teacher') {
        setError('Your teacher account is pending admin approval');
        return;
      }

      // Store user info in session storage
      sessionStorage.setItem('userEmail', userData.email);
      sessionStorage.setItem('userRole', role);
      sessionStorage.setItem('userName', userData.name);
      sessionStorage.setItem('userSchool', userSchool);

      // Navigate based on role
      if (role === 'teacher') {
        navigate('/teacher-dashboard');
      } else {
        navigate('/student-dashboard');
      }
    } catch (error) {
      console.error('Login error:', error);
      setError('An error occurred during login');
    }
  };

  return (
    <div className="login-container">
      <h2>Login</h2>
      
      <div className="storage-indicator">
        <div className="storage-dot wasabi-active"></div>
        <span>Using Wasabi Cloud Storage</span>
      </div>

      {error && <div className="error-message">{error}</div>}

      <form onSubmit={handleLogin}>
        <div className="form-group">
          <label htmlFor="email">Email</label>
          <input
            type="text"
            id="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
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
        <button type="submit" className="login-button">
          Login
        </button>
      </form>

      <p className="create-account-link">
        Don't have an account? <a href="/create-account">Create Account</a>
      </p>
    </div>
  );
}

export default Login; 