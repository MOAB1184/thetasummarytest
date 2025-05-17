document.addEventListener('DOMContentLoaded', () => {
    const appContainer = document.getElementById('app-container'); // Get the main container
    const userInput = document.getElementById('user-input');
    const sendButton = document.getElementById('send-button');
    const chatBox = document.getElementById('chat-box');
    const thetaVoiceButton = document.getElementById('theta-voice-button'); // New button
    const voiceModeUI = document.getElementById('voice-mode-ui');       // New UI container
    const closeVoiceModeButton = document.getElementById('close-voice-mode'); // Close button for voice UI
    const canvas = document.getElementById('particle-canvas');
    const micButton = document.getElementById('mic-button'); // The microphone button in voice UI
    let currentBotMessageElement = null; // To hold the element being updated by stream
    let eventSource = null; // To hold the EventSource object
    let particleAnimation = null;
    let recognition = null; // For SpeechRecognition
    let isListening = false; // To track mic state
    let audioPlayer = new Audio(); // For TTS playback
    let conversationHistory = []; // Track conversation history
    let audioContext = null; // Audio context for volume analysis
    let userVolumeAnimation = null; // To store user volume animation frame ID
    let aiVolumeAnimation = null; // To store AI volume animation frame ID
    let lastUserMessage = null; // Store reference to latest user message for animation
    let userAnalyser = null; // For user speech volume analysis
    let aiAnalyser = null; // For AI speech volume analysis
    let userAudioSource = null; // Microphone audio source

    // Function to render LaTeX in a given element
    function renderLaTeX(element) {
        if (element && window.renderMathInElement) {
            window.renderMathInElement(element, window.renderMathInElementOptions);
        }
    }

    sendButton.addEventListener('click', () => sendMessage());
    userInput.addEventListener('keypress', function(e) {
        if (e.key === 'Enter' && !e.shiftKey) { // Send on Enter, allow Shift+Enter for newline
            e.preventDefault(); // Prevent newline in textarea
            sendMessage();
        }
    });

    if (thetaVoiceButton) {
        thetaVoiceButton.addEventListener('click', () => {
            voiceModeUI.classList.toggle('hidden');
            if (!voiceModeUI.classList.contains('hidden')) {
                initParticleAnimation();
            } else {
                // Stop animation when hidden
                if (particleAnimation) {
                    cancelAnimationFrame(particleAnimation);
                }
            }
        });
    }

    if (closeVoiceModeButton) {
        closeVoiceModeButton.addEventListener('click', () => {
            voiceModeUI.classList.add('hidden');
            // Stop animation when closed
            if (particleAnimation) {
                cancelAnimationFrame(particleAnimation);
            }
        });
    }

    function initParticleAnimation() {
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        
        // Set canvas dimensions to match window
        function resizeCanvas() {
            canvas.width = window.innerWidth;
            canvas.height = window.innerHeight;
        }
        resizeCanvas();
        window.addEventListener('resize', resizeCanvas);

        // Particle configuration
        const particleCount = 300;
        const baseRadius = Math.min(window.innerWidth, window.innerHeight) * 0.25; // Sphere radius
        const particles = [];
        const colors = ['#1affff', '#45c7ff', '#7fa8ff', '#4663ff', '#787cff']; // Various blue-cyan hues
        
        // Create particles arranged in a spherical pattern
        for (let i = 0; i < particleCount; i++) {
            // Create points in a sphere-like distribution
            // Using spherical coordinates to distribute points
            const phi = Math.random() * Math.PI * 2; // Random angle around sphere
            const theta = Math.random() * Math.PI; // Random angle up/down
            const r = baseRadius * (0.8 + Math.random() * 0.2); // Radius with some variation
            
            // Convert spherical to cartesian coordinates
            const x = r * Math.sin(theta) * Math.cos(phi);
            const y = r * Math.sin(theta) * Math.sin(phi);
            const z = r * Math.cos(theta); // We'll use z for depth effect
            
            // Center coords in canvas
            const centerX = canvas.width / 2;
            const centerY = canvas.height / 2;
            
            particles.push({
                x: centerX + x,
                y: centerY + y,
                z: z,
                radius: 1 + Math.random() * 2,
                color: colors[Math.floor(Math.random() * colors.length)],
                initialX: x,
                initialY: y,
                initialZ: z,
                speed: 0.01 + Math.random() * 0.01, // Individual rotation speed
                phase: Math.random() * Math.PI * 2, // Random starting phase
                opacity: 0.3 + Math.random() * 0.7 // Vary opacity
            });
        }
        
        // Animation function
        function animate() {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            
            // Update and draw particles
            const centerX = canvas.width / 2;
            const centerY = canvas.height / 2;
            const time = Date.now() * 0.001;
            
            particles.forEach(particle => {
                // Slowly rotate particles around the center
                const angle = time * particle.speed + particle.phase;
                
                // Calculate new positions using rotation matrices
                particle.x = centerX + particle.initialX * Math.cos(angle) - particle.initialZ * Math.sin(angle);
                particle.z = particle.initialZ * Math.cos(angle) + particle.initialX * Math.sin(angle);
                
                // Make particles closer to viewer appear larger and more opaque
                const scale = 1000 / (1000 + particle.z);
                const radius = particle.radius * scale;
                const opacity = particle.opacity * scale;
                
                // Draw the particle
                ctx.beginPath();
                ctx.arc(particle.x, particle.y, radius, 0, Math.PI * 2);
                ctx.fillStyle = particle.color + Math.floor(opacity * 255).toString(16).padStart(2, '0');
                ctx.fill();
            });
            
            particleAnimation = requestAnimationFrame(animate);
        }
        
        // Start animation
        animate();
    }

    // --- Speech Recognition (STT) Setup ---
    const SpeechRecognitionAPI = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SpeechRecognitionAPI) {
        recognition = new SpeechRecognitionAPI();
        recognition.continuous = false; // Process after one utterance
        recognition.interimResults = false; // We only want final results for sending
        recognition.lang = 'en-US'; // You can make this configurable

        // Initialize audio context for volume analysis if not already created
        function initAudioContext() {
            if (!audioContext) {
                try {
                    audioContext = new (window.AudioContext || window.webkitAudioContext)();
                    // Create analyzers
                    userAnalyser = audioContext.createAnalyser();
                    userAnalyser.fftSize = 256;
                    userAnalyser.smoothingTimeConstant = 0.8;
                    
                    aiAnalyser = audioContext.createAnalyser();
                    aiAnalyser.fftSize = 256;
                    aiAnalyser.smoothingTimeConstant = 0.8;
                    
                    console.log("Audio context initialized for volume analysis");
                } catch (e) {
                    console.error("Error initializing audio context:", e);
                }
            }
        }

        // Function to animate message bubble based on volume
        function animateBubble(element, analyser, isUser = true) {
            if (!element || !analyser) return null;
            
            const bufferLength = analyser.frequencyBinCount;
            const dataArray = new Uint8Array(bufferLength);
            
            // Base scale and max scale change
            const baseScale = 1.0;
            const maxScaleChange = isUser ? 0.5 : 0.4; // Increase to allow up to 1.5x expansion
            
            function animate() {
                // Get volume data
                analyser.getByteFrequencyData(dataArray);
                
                // Calculate volume - average of the frequency data
                let sum = 0;
                for (let i = 0; i < bufferLength; i++) {
                    sum += dataArray[i];
                }
                const avgVolume = sum / bufferLength;
                
                // Make the volume response more dramatic
                const normalizedVolume = Math.pow(avgVolume / 255, 1.5); // Apply exponent to make changes more visible
                
                // Map volume (0-255) to scale factor
                const volumeScale = normalizedVolume * maxScaleChange;
                const newScale = baseScale + volumeScale;
                
                // Apply scale transform
                element.style.transform = `scale(${newScale})`;
                console.log(`Volume: ${avgVolume}, Scale: ${newScale}`); // Debug logging
                
                // Continue animation
                return requestAnimationFrame(() => animate());
            }
            
            return animate();
        }
        
        // Stop animation and reset bubble
        function stopBubbleAnimation(element, animationId) {
            if (animationId) {
                cancelAnimationFrame(animationId);
            }
            if (element) {
                element.style.transform = 'scale(1)';
            }
        }
        
        recognition.onstart = () => {
            isListening = true;
            micButton.classList.add('mic-active'); // Visual feedback for listening
            console.log("Voice recognition started. Speak into the microphone.");

            // Initialize audio for volume detection
            initAudioContext();

            // Get microphone access for volume detection
            if (audioContext && !userAudioSource) {
                navigator.mediaDevices.getUserMedia({ audio: true, video: false })
                .then(stream => {
                    userAudioSource = audioContext.createMediaStreamSource(stream);
                    userAudioSource.connect(userAnalyser);
                    
                    // Animate the last user message bubble if it exists
                    if (lastUserMessage) {
                        userVolumeAnimation = animateBubble(lastUserMessage, userAnalyser, true);
                    }
                })
                .catch(err => console.error("Error accessing microphone for volume detection:", err));
            } else if (userAudioSource && lastUserMessage) {
                // If we already have an audio source, just start animation
                userVolumeAnimation = animateBubble(lastUserMessage, userAnalyser, true);
            }
        };

        recognition.onresult = (event) => {
            const transcript = event.results[0][0].transcript;
            console.log("Voice transcript:", transcript);
            sendMessage(transcript); // Send the transcribed text
        };

        recognition.onerror = (event) => {
            console.error("Speech recognition error:", event.error);
            if (event.error === 'no-speech') {
                alert("No speech detected. Please try again.");
            } else if (event.error === 'audio-capture') {
                alert("Microphone error. Please ensure it's connected and permission is granted.");
            } else if (event.error === 'not-allowed') {
                alert("Microphone access denied. Please allow microphone access in your browser settings.");
            }
        };

        recognition.onend = () => {
            isListening = false;
            micButton.classList.remove('mic-active');
            console.log("Voice recognition ended.");
            // Stop bubble animation
            stopBubbleAnimation(lastUserMessage, userVolumeAnimation);
            userVolumeAnimation = null;
        };
    } else {
        console.warn("Speech Recognition API not supported in this browser.");
        if (micButton) {
            micButton.disabled = true;
            micButton.title = "Voice input not supported by your browser."; // Set title instead of alert
        }
    }
    
    if (micButton && recognition) {
        micButton.addEventListener('click', () => {
            if (!recognition) return; // Guard against API not supported
            if (isListening) {
                recognition.stop();
            } else {
                try {
                    recognition.start();
                } catch (e) {
                    console.error("Error starting recognition:", e);
                    isListening = false; 
                    micButton.classList.remove('mic-active');
                }
            }
        });
    }

    function sendMessage(text = null) {
        const messageText = text || userInput.value.trim();
        if (messageText === '') return;

        appendMessage(messageText, 'user-message');
        // Add user message to history
        conversationHistory.push({ role: 'user', content: messageText });
        if (!text) { // Clear input only if message wasn't from a chip that sends directly
            userInput.value = '';
        }
        userInput.style.height = 'auto'; // Reset height after sending
        userInput.style.height = userInput.scrollHeight + 'px'; // Adjust to content or min-height

        // Create a new message element for the bot's response and store it
        currentBotMessageElement = createMessageElement('bot-message');
        chatBox.appendChild(currentBotMessageElement);
        scrollToBottom(); // Scroll after adding the placeholder for bot message

        // Close any existing EventSource connection
        if (eventSource) {
            eventSource.close();
        }

        // Prepare data for EventSource (GET request, including history)
        const lastHistory = conversationHistory.slice(-10);
        const historyParam = encodeURIComponent(JSON.stringify(lastHistory));
        const url = `/chat?message=${encodeURIComponent(messageText)}&history=${historyParam}`;
        eventSource = new EventSource(url);

        let firstChunkReceived = false;
        let fullBotResponse = ""; // To store the complete bot response

        eventSource.onmessage = function(event) {
            console.log("[RAW SSE event.data RECEIVED BY BROWSER]:", event.data); // Log raw event data

            if (!event.data || event.data.trim() === "") {
                console.warn("Received empty or whitespace-only event.data from SSE. Ignoring.");
                return; 
            }

            let data;
            try {
                data = JSON.parse(event.data);
            } catch (e) {
                console.error("Error parsing JSON from SSE event.data:", e);
                console.error("Problematic event.data string:", event.data);
                if (currentBotMessageElement) {
                    currentBotMessageElement.textContent += "\n[Error: Could not process an update from the server. Invalid data format.]";
                    renderLaTeX(currentBotMessageElement);
                }
                return; // Stop processing this malformed message
            }

            if (!firstChunkReceived && (data.chunk || data.error)) { // Ensure element exists and is cleared only once
                if (!currentBotMessageElement) { // Should have been created before EventSource
                    console.error("currentBotMessageElement is null when first chunk/error received!");
                    currentBotMessageElement = createMessageElement('bot-message');
                    chatBox.appendChild(currentBotMessageElement);
                }
                currentBotMessageElement.textContent = ''; // Clear placeholder text
                firstChunkReceived = true;
                if (!appContainer.classList.contains('chat-active')) {
                    appContainer.classList.add('chat-active');
                }
            }

            if (data.error) {
                const errorMsg = `\nError: ${data.error}`;
                if (currentBotMessageElement) {
                    currentBotMessageElement.textContent += errorMsg;
                    renderLaTeX(currentBotMessageElement);
                } else {
                    // If somehow currentBotMessageElement is null, append a new one
                    appendMessage(`Error: ${data.error}`, 'bot-message');
                }
                console.error('SSE Error from server data:', data.error);
                eventSource.close();
                currentBotMessageElement = null; // Reset after error
                return;
            }

            if (data.chunk) {
                if (currentBotMessageElement) {
                    currentBotMessageElement.textContent += data.chunk;
                    fullBotResponse += data.chunk; // Still useful if we re-add history later
                    renderLaTeX(currentBotMessageElement);
                    scrollToBottom();
                } else {
                    console.error("Received chunk but currentBotMessageElement is null!");
                }
            }

            if (data.done) {
                if (currentBotMessageElement) {
                    renderLaTeX(currentBotMessageElement);
                    
                    // If voice mode is active, read out the response
                    if (!voiceModeUI.classList.contains('hidden')) {
                        speakText(fullBotResponse);
                    }
                }
                // Add assistant response to history
                conversationHistory.push({ role: 'assistant', content: fullBotResponse });
                console.log("SSE stream indicated 'done'. Closing EventSource.");
                eventSource.close();
                currentBotMessageElement = null; // Reset after completion
                fullBotResponse = ""; 
            }
        };

        eventSource.onerror = function(errorEvent) { // Parameter is an Event object
            console.error("EventSource failed. Full event object:", errorEvent);
            
            // Attempt to get more specific error information if available
            let specificError = 'Error connecting to the server.';
            if (errorEvent && errorEvent.message) {
                specificError = errorEvent.message;
            } else if (errorEvent && errorEvent.target && errorEvent.target.readyState === EventSource.CLOSED) {
                specificError = 'Connection closed by server or network error.';
            }
            
            const errorMsgContent = `\nSorry, an error occurred: ${specificError}`;
            
            if (currentBotMessageElement) {
                // If we haven't received any actual content yet, clear any placeholder.
                if (!firstChunkReceived) currentBotMessageElement.textContent = ''; 
                currentBotMessageElement.textContent += errorMsgContent;
                renderLaTeX(currentBotMessageElement);
            } else {
                // If currentBotMessageElement is null (e.g., error happened before first message placeholder)
                appendMessage(errorMsgContent.trim(), 'bot-message');
            }
            
            if (eventSource && eventSource.readyState !== EventSource.CLOSED) {
                eventSource.close();
            }
            currentBotMessageElement = null; // Reset
            fullBotResponse = "";
        };
    }

    function createMessageElement(className) {
        const messageDiv = document.createElement('div');
        messageDiv.classList.add('message', className);
        return messageDiv;
    }

    function appendMessage(text, className) {
        // This function is now mainly for user messages or non-streamed bot messages (if any)
        const messageDiv = createMessageElement(className);
        messageDiv.textContent = text;
        chatBox.appendChild(messageDiv);
        scrollToBottom();

        // Activate chat view if it's a user message and not already active
        if (className === 'user-message' && !appContainer.classList.contains('chat-active')) {
            appContainer.classList.add('chat-active');
        }
        
        // Store reference to the user message for animation
        if (className === 'user-message') {
            lastUserMessage = messageDiv;
        }
    }

    function scrollToBottom() {
        chatBox.scrollTop = chatBox.scrollHeight;
    }

    // Auto-resize textarea
    userInput.addEventListener('input', function () {
        this.style.height = 'auto';
        this.style.height = (this.scrollHeight) + 'px';
    });

    // --- Speech-to-Text (STT) and Text-to-Speech (TTS) Functions ---
    
    // Function to speak text using the backend TTS endpoint
    function speakText(text) {
        if (!text || text.trim() === '') return;
        
        // First stop any currently playing audio
        if (audioPlayer) {
            audioPlayer.pause();
            // Stop any existing animation
            stopBubbleAnimation(currentBotMessageElement, aiVolumeAnimation);
            aiVolumeAnimation = null;
            audioPlayer = new Audio();
        }
        
        fetch('/tts', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ text: text })
        })
        .then(response => {
            if (!response.ok) {
                throw new Error('TTS request failed');
            }
            return response.blob();
        })
        .then(blob => {
            const url = URL.createObjectURL(blob);
            audioPlayer.src = url;
            
            // Set up audio analysis for AI speech
            if (audioContext && aiAnalyser) {
                initAudioContext();
                
                try {
                    // Connect audio player to the analyser
                    const aiAudioSource = audioContext.createMediaElementSource(audioPlayer);
                    aiAudioSource.connect(aiAnalyser);
                    aiAnalyser.connect(audioContext.destination); // Connect to output
                    
                    // Start animation for bot message
                    if (currentBotMessageElement) {
                        aiVolumeAnimation = animateBubble(currentBotMessageElement, aiAnalyser, false);
                    }
                } catch (e) {
                    console.error("Error connecting audio source:", e);
                }
                
                // Stop animation when audio ends
                audioPlayer.onended = () => {
                    micButton.classList.remove('tts-active');
                    stopBubbleAnimation(currentBotMessageElement, aiVolumeAnimation);
                    aiVolumeAnimation = null;
                };
            }
            
            audioPlayer.play();
            
            // Add visual feedback when speaking
            if (micButton) {
                micButton.classList.add('tts-active');
            }
        })
        .catch(error => {
            console.error('Error with TTS:', error);
        });
    }
    
    // Add CSS styles for animation
    const style = document.createElement('style');
    style.textContent = `
        .tts-active {
            background-color: #3080ff !important;
            box-shadow: 0 0 15px rgba(48, 128, 255, 0.7) !important;
        }
        .message {
            transition: transform 0.05s ease-out;
            transform-origin: center;
        }
    `;
    document.head.appendChild(style);
}); 