import React, { useState, useRef, useEffect } from 'react';
import './TutorBotStyle.css';
import logo from './assets/logo.png';
import LatexFormatter from './LatexFormatter';

function ChatBot() {
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [voiceEnabled, setVoiceEnabled] = useState(false);
  const chatBoxRef = useRef(null);
  const recognitionRef = useRef(null);
  const audioContextRef = useRef(null);
  const userAnalyserRef = useRef(null);
  const aiAnalyserRef = useRef(null);

  useEffect(() => {
    // Initialize speech recognition
    const SpeechRecognitionAPI = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SpeechRecognitionAPI) {
      recognitionRef.current = new SpeechRecognitionAPI();
      recognitionRef.current.continuous = false;
      recognitionRef.current.interimResults = false;
      recognitionRef.current.lang = 'en-US';

      recognitionRef.current.onresult = (event) => {
        const text = event.results[0][0].transcript;
        setInputText(text);
        sendMessage(text);
      };

      recognitionRef.current.onend = () => {
        setIsListening(false);
      };
    }

    // Initialize audio context
    try {
      audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)();
      userAnalyserRef.current = audioContextRef.current.createAnalyser();
      userAnalyserRef.current.fftSize = 256;
      userAnalyserRef.current.smoothingTimeConstant = 0.8;

      aiAnalyserRef.current = audioContextRef.current.createAnalyser();
      aiAnalyserRef.current.fftSize = 256;
      aiAnalyserRef.current.smoothingTimeConstant = 0.8;
    } catch (e) {
      console.error("Error initializing audio context:", e);
    }

    // Add event listener for opening chat with pre-filled message
    const handleOpenChat = (event) => {
      const { message } = event.detail;
      setInputText(message);
      document.getElementById('app-container').classList.add('chat-active');
    };
    window.addEventListener('openChat', handleOpenChat);

    // Scroll to bottom on new message
    if (chatBoxRef.current) {
      chatBoxRef.current.scrollTop = chatBoxRef.current.scrollHeight;
    }

    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
      window.removeEventListener('openChat', handleOpenChat);
    };
  }, []);

  const sendMessage = async (text = null) => {
    const messageToSend = text || inputText;
    if (!messageToSend.trim()) return;

    setIsLoading(true);

    // Add user message
    const userMessage = { type: 'user', text: messageToSend };
    setMessages(prev => [...prev, userMessage]);
    setInputText('');

    try {
      // Prepare conversation history
      const history = messages.map(msg => ({
        role: msg.type === 'user' ? 'user' : 'assistant',
        content: msg.text
      }));

      const response = await fetch('https://thetasummary.com/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          message: messageToSend,
          history
        }),
      });

      if (!response.ok) throw new Error('Network response was not ok');

      const data = await response.json();
      
      // Add bot message
      const botMessage = { type: 'bot', text: data.response };
      setMessages(prev => [...prev, botMessage]);

      // Only speak the response if voiceEnabled is true
      if (voiceEnabled) {
        speakText(data.response);
      }
    } catch (error) {
      console.error('Error:', error);
      setMessages(prev => [...prev, { type: 'error', text: 'Sorry, I encountered an error. Please try again.' }]);
    } finally {
      setIsLoading(false);
    }
  };

  const speakText = async (text) => {
    try {
      const response = await fetch('https://thetasummary.com/api/tts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ text }),
      });

      if (!response.ok) throw new Error('TTS request failed');

      const audioBlob = await response.blob();
      const audioUrl = URL.createObjectURL(audioBlob);
      const audio = new Audio(audioUrl);

      audio.onplay = () => {
        if (aiAnalyserRef.current) {
          animateBubble(chatBoxRef.current.lastChild, aiAnalyserRef.current, false);
        }
      };

      audio.onended = () => {
        if (aiAnalyserRef.current) {
          stopBubbleAnimation(chatBoxRef.current.lastChild);
        }
        URL.revokeObjectURL(audioUrl);
      };

      audio.play();
    } catch (error) {
      console.error('TTS error:', error);
    }
  };

  const animateBubble = (element, analyser, isUser) => {
    if (!element || !analyser) return null;
    
    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    
    function animate() {
      analyser.getByteFrequencyData(dataArray);
      let sum = 0;
      for (let i = 0; i < bufferLength; i++) {
        sum += dataArray[i];
      }
      const volume = sum / bufferLength;
      const scale = 1 + (volume / 128) * 0.5;
      element.style.transform = `scale(${scale})`;
      requestAnimationFrame(animate);
    }
    
    return requestAnimationFrame(animate);
  };

  const stopBubbleAnimation = (element) => {
    if (element) {
      element.style.transform = 'scale(1)';
    }
  };

  // Helper to render markdown, bold, and LaTeX (reuse your previous renderWithLatexAndMarkdown)
  const renderWithLatexAndMarkdown = (text) => {
    if (!text) return null;
    const lines = text.split(/\n|\r\n?/);
    return lines.map((line, idx) => {
      if (/^###\s+/.test(line)) {
        return <h3 key={idx} className="tutorbot-heading">{line.replace(/^###\s+/, '')}</h3>;
      } else if (/^##\s+/.test(line)) {
        return <h2 key={idx} className="tutorbot-heading">{line.replace(/^##\s+/, '')}</h2>;
      } else if (/^#\s+/.test(line)) {
        return <h1 key={idx} className="tutorbot-heading">{line.replace(/^#\s+/, '')}</h1>;
      } else if (line.trim() === '') {
        return <br key={idx} />;
      } else {
        // Bold
        const boldRegex = /\*\*([^*]+)\*\*/g;
        const boldParts = [];
        let lastIndex = 0;
        let match;
        let key = 0;
        while ((match = boldRegex.exec(line)) !== null) {
          if (match.index > lastIndex) {
            boldParts.push(line.slice(lastIndex, match.index));
          }
          boldParts.push(<strong key={key++}>{match[1]}</strong>);
          lastIndex = match.index + match[0].length;
        }
        if (lastIndex < line.length) {
          boldParts.push(line.slice(lastIndex));
        }
        // LaTeX
        return (
          <span key={idx} className="tutorbot-line">
            {boldParts.map((part, i) => {
              if (typeof part === 'string') {
                const regex = /(\$\$[\s\S]+?\$\$|\$[^$]+\$|\\\[[\s\S]+?\\\]|\\\([\s\S]+?\\\))/g;
                const latexParts = part.split(regex);
                return latexParts.map((sub, j) => {
                  if (sub.match(regex)) {
                    let latex = sub;
                    let displayMode = true;
                    if (latex.startsWith('$$') && latex.endsWith('$$')) {
                      latex = latex.slice(2, -2);
                      displayMode = true;
                    } else if (latex.startsWith('$') && latex.endsWith('$')) {
                      latex = latex.slice(1, -1);
                      displayMode = false;
                    } else if (latex.startsWith('\\[') && latex.endsWith('\\]')) {
                      latex = latex.slice(2, -2);
                      displayMode = true;
                    } else if (latex.startsWith('\\(') && latex.endsWith('\\)')) {
                      latex = latex.slice(2, -2);
                      displayMode = false;
                    }
                    return <LatexFormatter key={j} content={latex.trim()} displayMode={displayMode} />;
                  } else {
                    return <span key={j}>{sub}</span>;
                  }
                });
              } else {
                return part;
              }
            })}
          </span>
        );
      }
    });
  };

  return (
    <div id="app-container" className="chat-active">
      <div id="main-content">
        <div className="greeting-area">
          <span className="greeting-asterisk">*</span>
          <h1 className="greeting-text">How can Theta help you today?</h1>
        </div>
        <div id="input-container">
          <textarea
            id="user-input"
            value={inputText}
            onChange={e => setInputText(e.target.value)}
            placeholder="How can I help you today?"
            disabled={isLoading}
          />
          <div id="input-controls">
            <div className="left-controls"></div>
            <div className="right-controls">
              <button id="theta-voice-button" className="control-button" onClick={() => setVoiceEnabled(v => !v)}>{voiceEnabled ? 'Voice On' : 'Theta Voice'}</button>
              <button id="send-button" aria-label="Send message" onClick={() => sendMessage()} disabled={isLoading}>↑</button>
            </div>
          </div>
        </div>
      </div>
      <div id="chat-box" ref={chatBoxRef}>
        {messages.map((msg, idx) => (
          <div key={idx} className={msg.type === 'user' ? 'message user-message' : 'message bot-message'}>
            {renderWithLatexAndMarkdown(msg.text)}
          </div>
        ))}
        {isLoading && (
          <div className="message bot-message">
            <span>Thinking...</span>
          </div>
        )}
      </div>
    </div>
  );
}

export default ChatBot; 