import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import BackButton from './BackButton';
import infuraStorage from '../services/MetaMaskStorage';

function RegisterPage() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [role, setRole] = useState('student');
  const [error, setError] = useState('');
  const [isInputDisabled, setIsInputDisabled] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const navigate = useNavigate();

  // Memoize the connect function to prevent infinite loop
  const connectToInfura = React.useCallback(async () => {
    try {
      setIsConnecting(true);
      setError('');
      
      // Connect to Infura
      const connectResult = await infuraStorage.connect();
      if (!connectResult.success) {
        setError(`Infura connection error: ${connectResult.error}`);
        return;
      }
      
      setIsConnecting(false);
    } catch (error) {
      console.error('Connection error:', error);
      setError(`Error connecting to Infura: ${error.message}`);
      setIsConnecting(false);
    }
  }, []);

  useEffect(() => {
    // Connect to Infura on component mount
    connectToInfura();
    
    // Reset form state when component mounts
    setError('');
    setName('');
    setEmail('');
    setUsername('');
    setPassword('');
    setConfirmPassword('');
    setRole('student');
    setIsInputDisabled(false);
  }, [connectToInfura]);

  // Add a click handler to ensure inputs are enabled when clicking on the form
  const handleFormClick = () => {
    if (isInputDisabled) {
      setIsInputDisabled(false);
    }
  };

  // Handle registration form submission
  const handleRegister = async (e) => {
    e.preventDefault();
    setError('');
    
    try {
      // Form validation
      if (!name || !email || !username || !password || !confirmPassword) {
        setError('All fields are required');
        return;
      }
      
      if (password !== confirmPassword) {
        setError('Passwords do not match');
        return;
      }
      
      // Email validation
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        setError('Please enter a valid email address');
        return;
      }
      
      // Password validation (at least 6 characters)
      if (password.length < 6) {
        setError('Password must be at least 6 characters long');
        return;
      }
      
      // Check if user already exists
      const users = await infuraStorage.getData('users') || [];
      
      if (users.some(user => user.email === email)) {
        setError('An account with this email already exists');
        return;
      }
      
      if (users.some(user => user.username === username)) {
        setError('This username is already taken');
        return;
      }
      
      // Create new user object
      const newUser = {
        name,
        email,
        username,
        password,
        role,
        // Teachers need approval
        approved: role === 'student',
        declined: false,
        createdAt: new Date().toISOString()
      };
      
      // Add new user to storage
      await infuraStorage.saveData('users', [...users, newUser]);
      
      // Show different message based on role
      if (role === 'teacher') {
        alert('Your teacher account has been created and is pending approval by an administrator.');
      } else {
        alert('Your account has been created successfully!');
      }
      
      // Navigate back to login page
      navigate('/');
    } catch (error) {
      console.error('Registration error:', error);
      setError(`Registration failed: ${error.message}`);
    }
  };

  return (
    <div className="login-container">
      <div className="header-with-back">
        <BackButton destination="/" />
        <h2>Create Account</h2>
        <div className="spacer"></div>
      </div>
      
      <div className="storage-indicator">
        <div className="storage-dot infura-active"></div>
        <span>Using Infura Blockchain Storage</span>
      </div>
      
      {isConnecting && <div className="connecting-message">Connecting to Infura...</div>}
      
      <form onSubmit={handleRegister} onClick={handleFormClick} noValidate>
        {error && <div className="error-message">{error}</div>}
        
        <div className="form-group">
          <label htmlFor="name">Full Name</label>
          <input
            type="text"
            id="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={isInputDisabled}
            required
          />
        </div>
        
        <div className="form-group">
          <label htmlFor="email">Email</label>
          <input
            type="email"
            id="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={isInputDisabled}
            required
          />
        </div>
        
        <div className="form-group">
          <label htmlFor="username">Username</label>
          <input
            type="text"
            id="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            disabled={isInputDisabled}
            required
          />
        </div>
        
        <div className="form-group">
          <label htmlFor="password">Password</label>
          <input
            type="password"
            id="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={isInputDisabled}
            required
          />
        </div>
        
        <div className="form-group">
          <label htmlFor="confirmPassword">Confirm Password</label>
          <input
            type="password"
            id="confirmPassword"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            disabled={isInputDisabled}
            required
          />
        </div>
        
        <div className="form-group">
          <label htmlFor="role">Account Type</label>
          <select
            id="role"
            value={role}
            onChange={(e) => setRole(e.target.value)}
            disabled={isInputDisabled}
          >
            <option value="student">Student</option>
            <option value="teacher">Teacher</option>
          </select>
        </div>
        
        <div className="form-actions">
          <button type="submit" className="login-button" disabled={isInputDisabled}>
            Register
          </button>
        </div>
      </form>
    </div>
  );
}

export default RegisterPage; 