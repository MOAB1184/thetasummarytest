import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import wasabiStorage from '../services/WasabiStorage';

function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');

    try {
      // Admin login check - allow both 'admin' and 'admin@example.com'
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
      const pendingTeacher = await wasabiStorage.getData(wasabiStorage.getPendingTeacherPath(email));
      const approvedTeacher = await wasabiStorage.getData(wasabiStorage.getTeacherPath(email));
      const student = await wasabiStorage.getData(wasabiStorage.getStudentPath(email));

      let userData = null;
      let isPending = false;

      if (approvedTeacher) {
        userData = approvedTeacher;
      } else if (student) {
        userData = student;
      } else if (pendingTeacher) {
        userData = pendingTeacher;
        isPending = true;
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
      if (isPending && userData.role === 'teacher') {
        setError('Your teacher account is pending admin approval');
        return;
      }

      // Store user info in session storage
      sessionStorage.setItem('userEmail', userData.email);
      sessionStorage.setItem('userRole', userData.role);
      sessionStorage.setItem('userName', userData.name);

      // Navigate based on role
      switch (userData.role) {
        case 'teacher':
          navigate('/teacher-dashboard');
          break;
        case 'student':
          navigate('/student-dashboard');
          break;
        default:
          setError('Invalid user role');
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

        <button type="submit">Login</button>
      </form>

      <p>
        Don't have an account?{' '}
        <button 
          className="secondary-button"
          onClick={() => navigate('/create-account')}
        >
          Create Account
        </button>
      </p>
    </div>
  );
}

export default Login; 