import React from 'react';
import { useNavigate } from 'react-router-dom';

function BackButton({ destination = '/' }) {
  const navigate = useNavigate();
  
  return (
    <button 
      className="back-button"
      onClick={() => navigate(destination)}
    >
      ← Back
    </button>
  );
}

export default BackButton; 