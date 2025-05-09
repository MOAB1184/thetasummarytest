import React from 'react';
import { Link } from 'react-router-dom';
import emailjs from 'emailjs-com';

function LandingPage() {
  // EmailJS handler
  const handleContactSubmit = (e) => {
    e.preventDefault();
    const form = e.target;
    emailjs.sendForm(
      'service_oildj6m',
      'template_05hymca', 
      form,
      'gwttnJTCmPFTWS0TG' 
    ).then(
      (result) => {
        alert('Message sent successfully!');
        form.reset();
      },
      (error) => {
        alert('Failed to send message. Please try again later.');
        console.error(error);
      }
    );
  };

  return (
    <div style={{
      maxWidth: '1200px',
      margin: '0 auto',
      padding: '24px',
      minHeight: '100vh',
      backgroundColor: '#121212'
    }}>
      {/* Navbar */}
      <nav style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        backgroundColor: '#1a1a1a',
        padding: '16px 24px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        zIndex: 1000
      }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '16px'
        }}>
          <h1 style={{ 
            margin: 0,
            fontSize: '24px',
            color: '#fff'
          }}>ThetaSummary</h1>
        </div>
        
        <div style={{
          display: 'flex',
          gap: '16px'
        }}>
          <Link 
            to="/login" 
            style={{
              padding: '8px 16px',
              fontSize: '16px',
              backgroundColor: '#007bff',
              color: '#fff',
              textDecoration: 'none',
              borderRadius: '4px',
              transition: 'background-color 0.2s'
            }}
          >
            Login
          </Link>
          <Link 
            to="/create-account" 
            style={{
              padding: '8px 16px',
              fontSize: '16px',
              backgroundColor: '#007bff',
              color: '#fff',
              textDecoration: 'none',
              borderRadius: '4px',
              transition: 'background-color 0.2s'
            }}
          >
            Create Account
          </Link>
        </div>
      </nav>

      {/* Hero Section */}
      <div style={{
        textAlign: 'center',
        padding: '48px 0',
        marginTop: '80px' // Add space for fixed navbar
      }}>
        <h1 style={{ 
          margin: 0,
          fontSize: '48px',
          color: '#fff',
          marginBottom: '24px'
        }}>Smart Lecture Management</h1>
        <p style={{
          fontSize: '24px',
          color: '#888',
          marginBottom: '24px', // slightly less space below description
          maxWidth: '600px',
          marginLeft: 'auto',
          marginRight: 'auto'
        }}>
          Automatically record, summarize, and organize your lectures for better student engagement and accessibility
        </p>
        <div style={{
          display: 'flex',
          justifyContent: 'center',
          gap: '24px',
          marginBottom: '16px', // even less space below button before How It Works
          marginTop: '16px'
        }}>
          <Link to="/create-account" style={{
            padding: '12px 24px',
            fontSize: '18px',
            backgroundColor: '#007bff',
            color: '#fff',
            textDecoration: 'none',
            borderRadius: '8px',
            transition: 'background-color 0.2s'
          }}>Get Started</Link>
        </div>
      </div>

      {/* Features Section */}
      <div style={{
        backgroundColor: '#1a1a1a',
        borderRadius: '16px',
        padding: '32px',
        marginTop: '32px', // slightly more space above How It Works
      }}>
        <h2 style={{ 
          fontSize: '32px',
          color: '#fff',
          marginBottom: '24px',
          textAlign: 'center'
        }}>How It Works</h2>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
          gap: '24px'
        }}>
          <div style={{
            backgroundColor: '#2d2d2d',
            borderRadius: '16px',
            padding: '24px',
            textAlign: 'center'
          }}>
            <div style={{
              fontSize: '48px',
              marginBottom: '16px'
            }}>🎤</div>
            <h3 style={{ 
              fontSize: '24px',
              color: '#fff',
              marginBottom: '12px'
            }}>Lecture Recording</h3>
            <p style={{ color: '#888' }}>
              Automatically record and save your lectures in high quality audio and video.
            </p>
          </div>

          <div style={{
            backgroundColor: '#2d2d2d',
            borderRadius: '16px',
            padding: '24px',
            textAlign: 'center'
          }}>
            <div style={{
              fontSize: '48px',
              marginBottom: '16px'
            }}>📝</div>
            <h3 style={{ 
              fontSize: '24px',
              color: '#fff',
              marginBottom: '12px'
            }}>Smart Summarization</h3>
            <p style={{ color: '#888' }}>
              AI-powered summaries of your lectures, highlighting key points and concepts.
            </p>
          </div>

          <div style={{
            backgroundColor: '#2d2d2d',
            borderRadius: '16px',
            padding: '24px',
            textAlign: 'center'
          }}>
            <div style={{
              fontSize: '48px',
              marginBottom: '16px'
            }}>📚</div>
            <h3 style={{ 
              fontSize: '24px',
              color: '#fff',
              marginBottom: '12px'
            }}>Organized Access</h3>
            <p style={{ color: '#888' }}>
              All your lectures are neatly organized by date, course, and topic for easy access.
            </p>
          </div>

          <div style={{
            backgroundColor: '#2d2d2d',
            borderRadius: '16px',
            padding: '24px',
            textAlign: 'center'
          }}>
            <div style={{
              fontSize: '48px',
              marginBottom: '16px'
            }}>👂</div>
            <h3 style={{ 
              fontSize: '24px',
              color: '#fff',
              marginBottom: '12px'
            }}>Student Access</h3>
            <p style={{ color: '#888' }}>
              Students can review missed lectures, access summaries, and study at their own pace.
            </p>
          </div>
        </div>
      </div>

      {/* Contact Form Section */}
      <div style={{
        backgroundColor: '#181818',
        borderRadius: '16px',
        padding: '32px',
        marginTop: '56px', 
        maxWidth: '600px',
        marginLeft: 'auto',
        marginRight: 'auto',
        color: '#fff',
        boxShadow: '0 4px 32px rgba(0,0,0,0.2)'
      }}>
        <h2 style={{ textAlign: 'center', marginBottom: '24px', color: '#fff' }}>Contact Us</h2>
        <form onSubmit={handleContactSubmit}>
          <div style={{ marginBottom: '16px' }}>
            <label htmlFor="name" style={{ display: 'block', marginBottom: '6px', color: '#bbb' }}>Name</label>
            <input id="name" name="name" type="text" required style={{ width: '100%', padding: '12px', borderRadius: '6px', border: 'none', background: '#222', color: '#fff' }} />
          </div>
          <div style={{ marginBottom: '16px' }}>
            <label htmlFor="email" style={{ display: 'block', marginBottom: '6px', color: '#bbb' }}>Email</label>
            <input id="email" name="email" type="email" required style={{ width: '100%', padding: '12px', borderRadius: '6px', border: 'none', background: '#222', color: '#fff' }} />
          </div>
          <div style={{ marginBottom: '16px' }}>
            <label htmlFor="message" style={{ display: 'block', marginBottom: '6px', color: '#bbb' }}>Message</label>
            <textarea id="message" name="message" rows="4" required style={{ width: '100%', padding: '12px', borderRadius: '6px', border: 'none', background: '#222', color: '#fff', resize: 'vertical', boxSizing: 'border-box' }} />
          </div>
          <button type="submit" style={{ width: '100%', padding: '12px', borderRadius: '6px', border: 'none', background: '#007bff', color: '#fff', fontWeight: 600, fontSize: '16px', cursor: 'pointer' }}>Send Message</button>
        </form>
      </div>

      {/* Footer Section */}
      <footer style={{
        backgroundColor: '#111111',
        color: '#bbb',
        textAlign: 'center',
        padding: '24px 0 16px 0',
        position: 'fixed',
        left: 0,
        bottom: 0,
        width: '100vw',
        borderRadius: '0 0 16px 16px',
        fontSize: '16px',
        letterSpacing: '0.5px',
        boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
        zIndex: 2000
      }}>
        &copy; {new Date().getFullYear()} ThetaSummary. All rights reserved.
      </footer>
    </div>
  );
}

export default LandingPage;