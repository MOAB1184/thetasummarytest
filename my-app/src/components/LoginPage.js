import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import infuraStorage from '../services/MetaMaskStorage';

function LoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isConnecting, setIsConnecting] = useState(false);
  const navigate = useNavigate();

  // Reset form state and ensure inputs are enabled when component mounts
  useEffect(() => {
    // Remove dashboard class if coming from dashboard
    document.body.classList.remove('dashboard-page');
    
    // Clear input fields
    setUsername('');
    setPassword('');
    setError('');
    
    // Ensure form is enabled - more aggressive approach
    setTimeout(() => {
      const inputs = document.querySelectorAll('.login-container input');
      inputs.forEach(input => {
        input.disabled = false;
        input.readOnly = false;
      });
    }, 0);
    
    // Clear any session storage that might be affecting form state
    sessionStorage.removeItem('formDisabled');
    sessionStorage.removeItem('userData');
    
    return () => {
      // Cleanup when unmounting
    };
  }, []);

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
    
    // Reset error and form state when component mounts
    setError('');
    setUsername('');
    setPassword('');
  }, [connectToInfura]);

  // Add a click handler to ensure inputs are enabled when clicking on the form
  const handleFormClick = () => {
    const inputs = document.querySelectorAll('.login-container input');
    inputs.forEach(input => {
      input.disabled = false;
      input.readOnly = false;
    });
  };

  // Handle login form submission
  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    
    try {
      // Admin credentials check - hardcoded for demo
      if (username === 'admin' && password === 'duggy') {
        // Store admin session info
        sessionStorage.setItem('userRole', 'admin');
        sessionStorage.setItem('userEmail', 'admin@example.com');
        navigate('/admin');
        return;
      }
      
      // Get users from storage
      const users = await infuraStorage.getData('users') || [];
      const user = users.find(user => user.username === username);
      
      if (!user) {
        setError('User not found. Please check your username or create a new account.');
        return;
      }
      
      if (user.password !== password) {
        setError('Incorrect password. Please try again.');
        return;
      }
      
      // Store user session info
      sessionStorage.setItem('userRole', user.role);
      sessionStorage.setItem('userEmail', user.email);
      
      // Navigate to the appropriate dashboard based on role
      if (user.role === 'student') {
        navigate('/student');
      } else if (user.role === 'teacher') {
        navigate('/teacher');
      }
    } catch (error) {
      console.error('Login error:', error);
      setError(`Login failed: ${error.message}`);
    }
  };

  return (
    <div className="login-container">
      <div className="header-with-back">
        <div style={{ width: '80px' }}></div> {/* Empty spacer for balance */}
        <h2>Login</h2>
        <div style={{ width: '80px' }}></div> {/* Empty spacer for balance */}
      </div>
      <div className="storage-indicator">
        <div className="storage-dot infura-active"></div>
        <span>Using Infura Blockchain Storage</span>
      </div>
      {isConnecting && <div className="connecting-message">Connecting to Infura...</div>}
      <form onSubmit={handleLogin} onClick={handleFormClick} noValidate key="login-form-new">
        {error && <div className="error-message">{error}</div>}
        <div className="form-group">
          <label htmlFor="username">Username</label>
          <input
            type="text"
            id="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
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
            required
          />
        </div>
        <button type="submit" disabled={isConnecting}>Login</button>
        <div className="create-account">
          <p>Don't have an account? <button onClick={() => navigate('/register')} type="button">Create Account</button></p>
        </div>
      </form>
    </div>
  );
}

export default LoginPage; 