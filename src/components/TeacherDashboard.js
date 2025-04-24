import React from 'react';
import { useNavigate } from 'react-router-dom';
import BackButton from './BackButton';
import wasabiStorage from '../services/WasabiStorage';

function TeacherDashboard() {
  const navigate = useNavigate();

  const handleDownload = async () => {
    try {
      // Download the MSI installer instead of the EXE
      const data = await wasabiStorage.getBinaryData('Teacher App.msi');
      if (!data) {
        throw new Error('Failed to download teacher app');
      }

      // Create a blob from the binary data
      const blob = new Blob([data], { type: 'application/x-msi' });
      const url = window.URL.createObjectURL(blob);
      
      // Create a temporary link and click it to start the download
      const link = document.createElement('a');
      link.href = url;
      link.download = 'Teacher App.msi';
      document.body.appendChild(link);
      link.click();
      
      // Clean up
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Error downloading teacher app:', error);
      alert('Failed to download teacher app. Please try again later.');
    }
  };

  return (
    <div className="dashboard-container" style={{
      maxWidth: '1200px',
      margin: '0 auto',
      padding: '24px',
      minHeight: '100vh',
      backgroundColor: '#121212'
    }}>
      <div className="dashboard-header" style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: '32px',
        padding: '16px',
        backgroundColor: '#1a1a1a',
        borderRadius: '8px'
      }}>
        <BackButton destination="/" />
        <h2 style={{ margin: 0, fontSize: '28px', color: '#fff' }}>Teacher Dashboard</h2>
        <button 
          className="logout-button" 
          onClick={() => {
            sessionStorage.removeItem('userEmail');
            sessionStorage.removeItem('userRole');
            navigate('/');
          }}
          style={{
            padding: '8px 16px',
            fontSize: '16px',
            backgroundColor: '#dc3545',
            color: '#fff',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer'
          }}
        >
          Logout
        </button>
      </div>
      
      <div className="dashboard-content" style={{
        backgroundColor: '#1a1a1a',
        borderRadius: '8px',
        padding: '24px'
      }}>
        <div className="download-section" style={{
          textAlign: 'center',
          padding: '48px 24px'
        }}>
          <h3 style={{ 
            fontSize: '24px', 
            marginBottom: '16px',
            color: '#fff'
          }}>Download Teacher App</h3>
          <p style={{ 
            color: '#888',
            marginBottom: '24px',
            fontSize: '16px'
          }}>Download the Teacher App to access your classes, record lectures, and manage students.</p>
          <button 
            className="download-button" 
            onClick={handleDownload}
            style={{
              padding: '12px 24px',
              fontSize: '18px',
              backgroundColor: '#007bff',
              color: '#fff',
              border: 'none',
              borderRadius: '8px',
              cursor: 'pointer',
              transition: 'background-color 0.2s'
            }}
          >
            Download Teacher App
          </button>
        </div>
      </div>
    </div>
  );
}

export default TeacherDashboard; 