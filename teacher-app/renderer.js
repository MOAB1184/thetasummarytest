const { ipcRenderer } = require('electron');
const Store = require('electron-store');
const store = new Store();

// DOM Elements
const loginScreen = document.getElementById('login-screen');
const mainScreen = document.getElementById('main-screen');
const loginForm = document.getElementById('login-form');
const teacherNameElement = document.getElementById('teacherName');
const teacherEmailElement = document.getElementById('teacherEmail');
const logoutBtn = document.getElementById('logoutBtn');
const navButtons = document.querySelectorAll('.nav-btn');
const sections = document.querySelectorAll('.section');
const startRecordingBtn = document.getElementById('startRecording');
const stopRecordingBtn = document.getElementById('stopRecording');
const uploadRecordingBtn = document.getElementById('uploadRecording');
const recordingsList = document.getElementById('recordingsList');
const summariesList = document.getElementById('summariesList');
const classesList = document.getElementById('classesList');
const selectedClassElement = document.getElementById('selectedClass');
const audioLevelBar = document.getElementById('audioLevelBar');
const recordingPathElement = document.getElementById('recordingPath');
const uploadDialog = document.getElementById('uploadDialog');
const uploadPasswordInput = document.getElementById('uploadPassword');
const recordingNameInput = document.getElementById('recordingName');
const audioFileInput = document.getElementById('audioFile');
const confirmUploadBtn = document.getElementById('confirmUpload');
const cancelUploadBtn = document.getElementById('cancelUpload');

// Recording state
let mediaRecorder = null;
let recordingChunks = [];
let recordingTimer = null;
let recordingStartTime = null;
let audioChunks = [];
let currentRecording = null;
let audioContext = null;
let audioAnalyser = null;
let audioDataArray = null;
let audioLevelInterval = null;
let recordingStream = null;

// State
let selectedClass = null;

// Event Listeners
document.addEventListener('DOMContentLoaded', () => {
    loginForm.addEventListener('submit', handleLogin);
    logoutBtn.addEventListener('click', handleLogout);
    startRecordingBtn.addEventListener('click', startRecording);
    stopRecordingBtn.addEventListener('click', stopRecording);
    uploadRecordingBtn.addEventListener('click', showUploadDialog);
    confirmUploadBtn.addEventListener('click', handleUploadRecording);
    cancelUploadBtn.addEventListener('click', hideUploadDialog);
    
    // Add click event listeners to navigation buttons
    navButtons.forEach(button => {
        button.addEventListener('click', () => {
            const targetSection = button.getAttribute('data-section');
            showSection(targetSection);
        });
    });
});

// Check for existing session
checkSession();

async function checkSession() {
    const token = store.get('userToken');
    const userEmail = store.get('userEmail');
    const userName = store.get('userName');
    
    if (token && userEmail && userName) {
        showMainScreen();
        loadUserData();
    } else {
        showLoginScreen();
    }
}

async function handleLogin(event) {
    event.preventDefault();
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    
    try {
        console.log('Attempting login...');
        
        // Check for admin credentials first
        if (email === 'admin' && password === 'duggy') {
            store.set('userEmail', 'admin@example.com');
            store.set('userRole', 'admin');
            store.set('userName', 'Admin');
            showMainScreen();
            loadUserData();
            return;
        }

        // For regular teachers, check Wasabi storage
        try {
            const userData = await ipcRenderer.invoke('get-user-data', { email });
            
            if (!userData) {
                showError('User not found');
                return;
            }

            if (userData.password !== password) {
                showError('Invalid password');
                return;
            }

            if (userData.role !== 'teacher') {
                showError('This account is not a teacher account');
                return;
            }

            if (!userData.approved) {
                showError('Your teacher account is pending approval');
                return;
            }

            // Store user info
            store.set('userEmail', userData.email);
            store.set('userRole', 'teacher');
            store.set('userName', userData.name);

            console.log('Login successful, showing main screen...');
            showMainScreen();
            loadUserData();
        } catch (error) {
            console.error('Teacher login error:', error);
            showError('Failed to verify teacher credentials');
        }
    } catch (error) {
        console.error('Login error:', error);
        showError('An error occurred during login. Please try again.');
    }
}

function handleLogout() {
    console.log('Logging out...');
    // Clear all session data
    store.delete('userEmail');
    store.delete('userRole');
    store.delete('userName');
    
    // Clear main process store via IPC
    ipcRenderer.invoke('clear-store');
    
    // Reset form
    document.getElementById('login-form').reset();
    
    showLoginScreen();
}

function handleNavigation(e) {
    const section = e.target.dataset.section;
    showSection(section);
}

function showSection(sectionId) {
    sections.forEach(section => {
        section.style.display = section.id === sectionId ? 'block' : 'none';
    });
    
    navButtons.forEach(btn => {
        btn.classList.toggle('active', btn.dataset.section === sectionId);
    });

    // Only load classes data when showing classes section
    if (sectionId === 'classes') {
        loadClasses();
    }
}

function showMainScreen() {
    document.getElementById('login-screen').style.display = 'none';
    document.getElementById('main-screen').style.display = 'block';
    
    // Always show the classes section by default
    document.getElementById('classes').style.display = 'block';
    document.getElementById('profile').style.display = 'none';
}

function showLoginScreen() {
    loginScreen.style.display = 'flex';
    mainScreen.style.display = 'none';
}

async function loadUserData() {
    const email = store.get('userEmail');
    const name = store.get('userName');
    const role = store.get('userRole');
    
    // Update profile information
    document.getElementById('profileName').textContent = name;
    document.getElementById('profileEmail').textContent = email;
    document.getElementById('profileRole').textContent = role.charAt(0).toUpperCase() + role.slice(1);
    
    // Load classes
    await loadClasses();
}

function showError(message, type = 'error') {
    const errorElement = document.createElement('div');
    errorElement.className = `notification ${type}`;
    errorElement.textContent = message;
    
    // Set colors based on type
    if (type === 'success') {
        errorElement.style.backgroundColor = '#1e4620';
        errorElement.style.color = '#a5d6a7';
    } else if (type === 'info') {
        errorElement.style.backgroundColor = '#0d47a1';
        errorElement.style.color = '#90caf9';
    } else {
        errorElement.style.backgroundColor = '#7f0000';
        errorElement.style.color = '#ffcdd2';
    }
    
    document.body.appendChild(errorElement);
    
    // Auto-remove after 3 seconds
    setTimeout(() => {
        errorElement.style.opacity = '0';
        setTimeout(() => {
            document.body.removeChild(errorElement);
        }, 300);
    }, 3000);
}

async function startRecording() {
    try {
        if (!selectedClass) {
            showError('Please select a class first');
            return;
        }

        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        recordingStream = stream;
        
        // Use webm for recording, will be converted to m4a in main process
        const mimeTypes = [
            'audio/webm'
        ];
        let selectedMimeType = null;
        for (const mimeType of mimeTypes) {
            if (MediaRecorder.isTypeSupported(mimeType)) {
                selectedMimeType = mimeType;
                break;
            }
        }
        if (!selectedMimeType) {
            showError('Your browser does not support audio recording.');
            return;
        }
        let options = { mimeType: selectedMimeType };
        let mediaRecorder;
        try {
            mediaRecorder = new MediaRecorder(stream, options);
        } catch (e) {
            showError('Your browser does not support audio recording.');
            return;
        }
        
        audioChunks = [];
        recordingStartTime = Date.now();

        // Set up audio analyzer for level meter
        setupAudioAnalyzer(stream);

        mediaRecorder.ondataavailable = (event) => {
            audioChunks.push(event.data);
        };

        mediaRecorder.onstop = async () => {
            try {
                const audioBlob = new Blob(audioChunks, { type: selectedMimeType });
                const teacherEmail = store.get('userEmail');
                const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
                const recordingName = `Recording_${timestamp}.m4a`;
                const duration = Math.floor((Date.now() - recordingStartTime) / 1000);
                
                // Convert blob to base64
                const base64data = await blobToBase64(audioBlob);
                
                const result = await ipcRenderer.invoke('save-recording', {
                    teacherEmail,
                    classCode: selectedClass.code,
                    recordingData: base64data,
                    name: recordingName,
                    duration,
                    originalMimeType: selectedMimeType
                });

                if (result.success) {
                    showError('Recording saved successfully', 'success');
                    await loadRecordings();
                } else {
                    showError('Failed to save recording: ' + (result.error || 'Unknown error'));
                }

                stopAudioLevelMeter();
                recordingPathElement.textContent = '';
                
                // Stop all tracks in the stream
                stream.getTracks().forEach(track => track.stop());
            } catch (error) {
                console.error('Error saving recording:', error);
                showError('Error saving recording: ' + error.message);
            }
        };

        // Display recording path
        const recordingPath = `${store.get('currentSchool')}/teachers/${store.get('userEmail')}/classes/${selectedClass.code}/recordings/`;
        recordingPathElement.textContent = `Recording will be saved to: ${recordingPath}`;

        mediaRecorder.start();
        window._mediaRecorder = mediaRecorder; // For debugging
        startRecordingBtn.disabled = true;
        stopRecordingBtn.disabled = false;
        startRecordingTimer();
    } catch (error) {
        console.error('Error starting recording:', error);
        showError('Error starting recording: ' + error.message);
    }
}

function stopRecording() {
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
        try {
            mediaRecorder.stop();
        } catch (err) {
            console.error('Error stopping mediaRecorder:', err);
            showError('Could not stop recording. Try again.');
        }
    }
    startRecordingBtn.disabled = false;
    stopRecordingBtn.disabled = true;
    stopRecordingTimer();
    stopAudioLevelMeter();
    // Stop all tracks if stream exists
    if (recordingStream) {
        try {
            recordingStream.getTracks().forEach(track => track.stop());
        } catch (e) {
            console.warn('Could not stop stream tracks:', e);
        }
        recordingStream = null;
    }
    mediaRecorder = null;
}

// Set up audio analyzer for level meter
function setupAudioAnalyzer(stream) {
    // Create audio context and analyzer
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const source = audioContext.createMediaStreamSource(stream);
    audioAnalyser = audioContext.createAnalyser();
    audioAnalyser.fftSize = 256;
    source.connect(audioAnalyser);
    
    // Create data array for analyzer
    const bufferLength = audioAnalyser.frequencyBinCount;
    audioDataArray = new Uint8Array(bufferLength);
    
    // Start updating the level meter
    startAudioLevelMeter();
}

// Start updating the audio level meter
function startAudioLevelMeter() {
    if (audioLevelInterval) {
        clearInterval(audioLevelInterval);
    }
    
    audioLevelInterval = setInterval(() => {
        if (audioAnalyser && audioDataArray) {
            // Get audio data
            audioAnalyser.getByteFrequencyData(audioDataArray);
            
            // Calculate average level
            const average = audioDataArray.reduce((acc, val) => acc + val, 0) / audioDataArray.length;
            
            // Scale to 0-100% with increased sensitivity
            const scaledValue = Math.min(100, Math.max(0, average * 250 / 255));
            
            // Update the level bar
            audioLevelBar.style.width = `${scaledValue}%`;
        }
    }, 100);
}

// Stop updating the audio level meter
function stopAudioLevelMeter() {
    if (audioLevelInterval) {
        clearInterval(audioLevelInterval);
        audioLevelInterval = null;
    }
    
    if (audioContext) {
        audioContext.close().catch(console.error);
        audioContext = null;
        audioAnalyser = null;
        audioDataArray = null;
    }
    
    // Reset the level bar
    if (audioLevelBar) {
        audioLevelBar.style.width = '0%';
    }
}

function startRecordingTimer() {
    const timerElement = document.getElementById('recordingTimer');
    timerElement.classList.add('recording');
    recordingTimer = setInterval(() => {
        const elapsed = Math.floor((Date.now() - recordingStartTime) / 1000);
        timerElement.textContent = formatTime(elapsed);
    }, 1000);
}

function stopRecordingTimer() {
    clearInterval(recordingTimer);
    const timerElement = document.getElementById('recordingTimer');
    timerElement.classList.remove('recording');
    timerElement.textContent = '00:00';
}

function formatTime(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

async function saveRecording(blob) {
    try {
        if (!selectedClass) {
            showError('Please select a class first');
            return;
        }
        
        const reader = new FileReader();
        reader.onloadend = async () => {
            const base64data = reader.result;
            const teacherEmail = store.get('userEmail');
            const result = await ipcRenderer.invoke('save-recording', {
                teacherEmail,
                classCode: selectedClass.code,
                recordingData: base64data,
                name: `Recording ${new Date().toLocaleString()}`,
                duration: Math.floor((Date.now() - recordingStartTime) / 1000)
            });
            
            if (result.success) {
                await loadRecordings(teacherEmail);
            } else {
                showError('Failed to save recording: ' + (result.error || 'Unknown error'));
            }
        };
        reader.readAsDataURL(blob);
    } catch (error) {
        console.error('Error saving recording:', error);
        showError('Error saving recording: ' + error.message);
    }
}

function renderClasses(classes) {
    if (!classes || classes.length === 0) {
        classesList.innerHTML = `
            <div class="empty-state">
                <p>No classes yet. Create your first class to get started!</p>
                <button onclick="showCreateClassForm()">Create Class</button>
            </div>
        `;
        return;
    }

    classesList.innerHTML = classes.map(cls => `
        <div class="class-item" onclick="selectClass('${cls.code}')">
            <div class="class-header">
            <h3>${cls.name}</h3>
                <span class="class-code">Code: ${cls.code}</span>
            </div>
            <div class="class-info">
                <div class="student-count">
                <span>${cls.students.length} Students</span>
                    ${cls.pendingStudents.length > 0 ? 
                        `<span class="pending-badge">${cls.pendingStudents.length} pending</span>` : 
                        ''}
                </div>
                <span class="class-date">Created: ${new Date(cls.createdAt).toLocaleDateString()}</span>
            </div>
            <div class="class-actions">
                <button onclick="viewClassDetails('${cls.code}')">View Details</button>
            </div>
        </div>
    `).join('');
}

function renderRecordings(recordings) {
    if (!recordings || recordings.length === 0) {
        recordingsList.innerHTML = `
            <div class="empty-state">
                <p>No recordings yet. Start recording or upload an audio file to get started!</p>
            </div>
        `;
        return;
    }

    recordingsList.innerHTML = recordings.map(recording => `
        <div class="recording-item">
            <div class="recording-info">
                <span class="recording-name">${recording.name}</span>
                <span class="recording-date">${new Date(recording.timestamp).toLocaleString()}</span>
            </div>
        </div>
    `).join('');
}

function renderSummaries(summaries) {
    if (!summaries || summaries.length === 0) {
        summariesList.innerHTML = '<div class="empty-state">No summaries found</div>';
        return;
    }

    // Sort summaries by date, newest first
    summaries.sort((a, b) => b.timestamp - a.timestamp);

    summariesList.innerHTML = summaries.map(summary => {
        const isPDF = summary.type === 'pdf' || summary.name.toLowerCase().endsWith('.pdf');
        return `
            <div class="summary-item" id="summary-${summary.id}">
                <div class="summary-info">
                    <span class="summary-name">${summary.name}</span>
                    <span class="summary-date">${new Date(summary.timestamp).toLocaleString()}</span>
                </div>
                <div class="summary-actions-row" style="display: flex; gap: 10px; margin-bottom: 10px;">
                  ${isPDF ? `<button onclick="getPDFDownloadUrl('${summary.id}')" class="pdf-link" style="background:#1976d2;color:#fff;border:none;padding:6px 16px;border-radius:5px;font-weight:600;">Download PDF</button>` : ''}
                  <button class="approve-summary-btn" data-id="${summary.id}" style="background:#2e7d32;color:#fff;border:none;padding:6px 16px;border-radius:5px;font-weight:600;">Approve</button>
                  <button class="deny-summary-btn" data-id="${summary.id}" style="background:#c62828;color:#fff;border:none;padding:6px 16px;border-radius:5px;font-weight:600;">Deny</button>
                </div>
                ${isPDF ? '' : `<div class="summary-content">${summary.content}</div>`}
            </div>
        `;
    }).join('');

    // Add event listeners for approve/deny buttons
    document.querySelectorAll('.approve-summary-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
            btn.style.display = 'none';
            const denyBtn = btn.parentElement.querySelector('.deny-summary-btn');
            if (denyBtn) denyBtn.style.display = 'none';
            await approveSummary(btn.dataset.id);
        });
    });
    document.querySelectorAll('.deny-summary-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
            btn.style.display = 'none';
            const approveBtn = btn.parentElement.querySelector('.approve-summary-btn');
            if (approveBtn) approveBtn.style.display = 'none';
            // Remove summary from DOM immediately
            const summaryDiv = btn.closest('.summary-item');
            if (summaryDiv) summaryDiv.remove();
            await denySummary(btn.dataset.id);
        });
    });
}

// Approve summary
async function approveSummary(summaryId) {
    if (!selectedClass || !summaryId) return;
    const teacherEmail = store.get('userEmail');
    try {
        const result = await ipcRenderer.invoke('approve-summary', {
            teacherEmail,
            classCode: selectedClass.code,
            summaryId
        });
        if (result.success) {
            showError('Summary approved and published to student dashboard.', 'success');
            // Remove summary from DOM immediately
            const summaryDiv = document.getElementById(`summary-${summaryId}`);
            if (summaryDiv) summaryDiv.remove();
        } else {
            showError('Failed to approve summary: ' + (result.error || 'Unknown error'));
        }
    } catch (error) {
        console.error('Error approving summary:', error);
        showError('Error approving summary: ' + error.message);
    }
}

// Deny summary
async function denySummary(summaryId) {
    if (!selectedClass || !summaryId) return;
    const teacherEmail = store.get('userEmail');
    try {
        const result = await ipcRenderer.invoke('deny-summary', {
            teacherEmail,
            classCode: selectedClass.code,
            summaryId
        });
        if (result.success) {
            showError('Summary denied and deleted.', 'success');
        } else {
            showError('Failed to deny summary: ' + (result.error || 'Unknown error'));
        }
    } catch (error) {
        console.error('Error denying summary:', error);
        showError('Error denying summary: ' + error.message);
    }
}

// Function to get pre-signed URL for PDF download
async function getPDFDownloadUrl(pdfId) {
    try {
        if (!selectedClass) {
            showError('No class selected');
            return;
        }

        const url = await ipcRenderer.invoke('get-pdf-url', {
            pdfId,
            classCode: selectedClass.code
        });

        if (url) {
            window.open(url, '_blank');
        } else {
            showError('Failed to generate download link');
        }
    } catch (error) {
        console.error('Error getting PDF URL:', error);
        showError('Failed to generate download link');
    }
}

function showCreateClassForm() {
    const form = document.createElement('div');
    form.className = 'create-class-form';
    form.innerHTML = `
        <h3>Create New Class</h3>
        <div class="form-group">
            <label for="className">Class Name</label>
            <input type="text" id="className" required placeholder="Enter class name">
        </div>
        <div class="form-actions">
            <button onclick="createClass()">Create</button>
            <button onclick="cancelCreateClass()" class="secondary-button">Cancel</button>
        </div>
    `;

    const existingForm = document.querySelector('.create-class-form');
    if (existingForm) {
        existingForm.remove();
    }

    classesList.insertBefore(form, classesList.firstChild);
}

async function createClass() {
    const className = document.getElementById('className').value;
    if (!className) {
        showError('Please enter a class name');
        return;
    }

    const teacherEmail = store.get('userEmail');
    if (!teacherEmail) {
        showError('No teacher email found');
        return;
    }

    try {
        const result = await ipcRenderer.invoke('create-class', {
            teacherEmail,
            className
        });

        if (result.success) {
            document.querySelector('.create-class-form').remove();
            await loadClasses();
        } else {
            showError(result.error || 'Failed to create class');
        }
    } catch (error) {
        console.error('Error creating class:', error);
        showError('Failed to create class');
    }
}

function cancelCreateClass() {
    document.querySelector('.create-class-form').remove();
}

async function selectClass(classCode) {
    const teacherEmail = store.get('userEmail');
    const classes = await ipcRenderer.invoke('get-classes', { teacherEmail });
    selectedClass = classes.find(c => c.code === classCode);
    
    if (selectedClass) {
        selectedClassElement.textContent = `Selected Class: ${selectedClass.name}`;
        await loadRecordings();
        await loadSummaries();
        showPendingStudents();
    }
}

function showPendingStudents() {
    if (!selectedClass || !selectedClass.pendingStudents.length) {
        return;
    }

    const pendingList = document.createElement('div');
    pendingList.className = 'pending-students';
    pendingList.innerHTML = `
        <h3>Pending Students</h3>
        ${selectedClass.pendingStudents.map(student => `
            <div class="pending-student">
                <div class="student-info">
                    <span>${student.name}</span>
                    <span>${student.email}</span>
                </div>
                <div class="student-actions">
                    <button onclick="approveStudent('${student.email}')">Approve</button>
                    <button onclick="denyStudent('${student.email}')" class="deny-button">Deny</button>
                </div>
            </div>
        `).join('')}
    `;

    const existingList = document.querySelector('.pending-students');
    if (existingList) {
        existingList.remove();
    }

    classesList.insertBefore(pendingList, classesList.firstChild);
}

async function approveStudent(studentEmail) {
    if (!selectedClass || !studentEmail) return;

    const teacherEmail = store.get('userEmail');
    try {
        const result = await ipcRenderer.invoke('approve-student', {
            teacherEmail,
            classCode: selectedClass.code,
            studentEmail
        });

        if (result.success) {
            selectedClass = result.class;
            
            // Update the UI immediately
            const pendingStudentsDiv = document.getElementById('pendingStudents');
            const enrolledStudentsDiv = document.getElementById('enrolledStudents');
            
            // Remove the approved student from pending list
            const pendingStudentElement = pendingStudentsDiv.querySelector(`[data-email="${studentEmail}"]`).closest('.student-item');
            if (pendingStudentElement) {
                pendingStudentElement.remove();
            }
            
            // If no more pending students, clear the section
            if (!pendingStudentsDiv.querySelector('.student-item')) {
                pendingStudentsDiv.innerHTML = '';
            }

            // Add the student to enrolled list
            const approvedStudent = result.class.students.find(s => s.email === studentEmail);
            if (approvedStudent) {
                // If there was no enrolled students before, clear the empty state message
                if (enrolledStudentsDiv.querySelector('.empty-state')) {
                    enrolledStudentsDiv.innerHTML = `
                        <div class="section-title">
                            <h3>Enrolled Students</h3>
                        </div>
                        <div class="students-list enrolled"></div>
                    `;
                }

                const studentsList = enrolledStudentsDiv.querySelector('.students-list');
                const newStudentElement = document.createElement('div');
                newStudentElement.className = 'student-item';
                newStudentElement.innerHTML = `
                    <div class="student-info">
                        <span class="student-name">${approvedStudent.name}</span>
                        <span class="student-email">${approvedStudent.email}</span>
                    </div>
                    <div class="student-actions">
                        <button class="remove-btn" data-email="${approvedStudent.email}">×</button>
                    </div>
                `;

                // Add event listener to the new remove button
                const removeBtn = newStudentElement.querySelector('.remove-btn');
                removeBtn.addEventListener('click', () => removeStudent(approvedStudent.email));

                studentsList.appendChild(newStudentElement);
            }

            // Update the class data
            await loadClasses();
        }
    } catch (error) {
        console.error('Error approving student:', error);
    }
}

async function denyStudent(studentEmail) {
    if (!selectedClass || !studentEmail) return;

    const teacherEmail = store.get('userEmail');
    try {
        const result = await ipcRenderer.invoke('deny-student', {
            teacherEmail,
            classCode: selectedClass.code,
            studentEmail
        });

        if (result.success) {
            selectedClass = result.class;
            showPendingStudents();
            await loadClasses();
        }
    } catch (error) {
        console.error('Error denying student:', error);
    }
}

async function viewClassDetails(classCode) {
    const teacherEmail = store.get('userEmail');
    const classes = await ipcRenderer.invoke('get-classes', { teacherEmail });
    selectedClass = classes.find(c => c.code === classCode);
    
    if (selectedClass) {
        // Show class details section
        document.getElementById('classDetails').style.display = 'block';
        document.getElementById('classes').style.display = 'none';
        
        // Update class details header
        document.getElementById('selectedClass').textContent = `Class: ${selectedClass.name}`;
        
        // Load class-specific data
        await loadRecordings();
        await loadSummaries();
        showPendingStudents();
    }
}

// Tab navigation
document.querySelectorAll('.tab-btn').forEach(button => {
    button.addEventListener('click', () => {
        const tabId = button.dataset.tab;
        switchTab(tabId);
    });
});

function switchTab(tabId) {
    // Update active tab button
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.tab === tabId);
    });

    // Show active tab content
    document.querySelectorAll('.tab-pane').forEach(pane => {
        pane.classList.toggle('active', pane.id === `${tabId}-tab`);
    });

    // Load tab-specific content
    if (tabId === 'students' && selectedClass) {
        renderStudentsTab();
    }
}

async function renderStudentsTab() {
    const pendingStudentsDiv = document.getElementById('pendingStudents');
    const enrolledStudentsDiv = document.getElementById('enrolledStudents');

    try {
        const teacherEmail = store.get('userEmail');
        const joinRequestsPath = `${store.get('currentSchool')}/teachers/${teacherEmail}/classes/${selectedClass.code}/join-requests/`;
        
        const requests = await ipcRenderer.invoke('get-join-requests', {
            teacherEmail,
            classCode: selectedClass.code,
            path: joinRequestsPath
        });

        selectedClass.pendingStudents = requests;

        // Render pending students section
        if (selectedClass.pendingStudents && selectedClass.pendingStudents.length > 0) {
            pendingStudentsDiv.innerHTML = `
                <div class="section-title">
                    <h3>Pending Approvals</h3>
                </div>
                <div class="students-list pending">
                    ${selectedClass.pendingStudents.map(student => `
                        <div class="student-item pending">
                            <div class="student-info">
                                <span class="student-name">${student.studentName || student.name}</span>
                                <span class="student-email">${student.studentEmail || student.email}</span>
                            </div>
                            <div class="student-actions">
                                <button class="approve-btn" data-email="${student.studentEmail || student.email}">Approve</button>
                                <button class="deny-btn" data-email="${student.studentEmail || student.email}">Deny</button>
                            </div>
                        </div>
                    `).join('')}
                </div>
            `;

            // Add event listeners for approve/deny buttons
            pendingStudentsDiv.querySelectorAll('.approve-btn').forEach(btn => {
                btn.addEventListener('click', () => approveStudent(btn.dataset.email));
            });
            pendingStudentsDiv.querySelectorAll('.deny-btn').forEach(btn => {
                btn.addEventListener('click', () => denyStudent(btn.dataset.email));
            });
        } else {
            pendingStudentsDiv.innerHTML = '';
        }

        // Render enrolled students section
        if (selectedClass.students && selectedClass.students.length > 0) {
            enrolledStudentsDiv.innerHTML = `
                <div class="section-title">
                    <h3>Enrolled Students</h3>
                </div>
                <div class="students-list enrolled">
                    ${selectedClass.students.map(student => `
                        <div class="student-item">
                            <div class="student-info">
                                <span class="student-name">${student.name}</span>
                                <span class="student-email">${student.email}</span>
                            </div>
                            <div class="student-actions">
                                <button class="remove-btn" data-email="${student.email}">×</button>
                            </div>
                        </div>
                    `).join('')}
                </div>
            `;

            // Add event listeners for remove buttons
            enrolledStudentsDiv.querySelectorAll('.remove-btn').forEach(btn => {
                btn.addEventListener('click', () => removeStudent(btn.dataset.email));
            });
        } else {
            enrolledStudentsDiv.innerHTML = `
                <div class="empty-state">
                    <p>No students enrolled in this class yet.</p>
                </div>
            `;
        }
    } catch (error) {
        console.error('Error rendering students tab:', error);
    }
}

async function removeStudent(studentEmail) {
    if (!selectedClass) return;

    const teacherEmail = store.get('userEmail');
    try {
        const result = await ipcRenderer.invoke('remove-student', {
            teacherEmail,
            classCode: selectedClass.code,
            studentEmail
        });

        if (result.success) {
            selectedClass = result.class;
            renderStudentsTab();
            await loadClasses();
        }
    } catch (error) {
        console.error('Error removing student:', error);
    }
}

function backToClasses() {
    document.getElementById('classDetails').style.display = 'none';
    document.getElementById('classes').style.display = 'block';
    selectedClass = null;
}

// Navigation
navButtons.forEach(button => {
    button.addEventListener('click', () => {
        const section = button.dataset.section;
        
        // Update active button
        navButtons.forEach(btn => btn.classList.remove('active'));
        button.classList.add('active');
        
        // Show selected section
        sections.forEach(s => {
            s.classList.remove('active');
            if (s.id === `${section}-section`) {
                s.classList.add('active');
            }
        });
    });
});

// Logout
logoutBtn.addEventListener('click', () => {
    store.delete('userToken');
    store.delete('userEmail');
    store.delete('userName');
    showLoginScreen();
});

async function loadRecordings() {
    try {
        if (!selectedClass) {
            console.log('No class selected, cannot load recordings');
            return;
        }
        
        const teacherEmail = store.get('userEmail');
        if (!teacherEmail) {
            console.error('No teacher email found');
            return;
        }
        
        const recordings = await ipcRenderer.invoke('get-recordings', {
            teacherEmail,
            classCode: selectedClass.code
        });

        if (recordings && recordings.length > 0) {
            renderRecordings(recordings);
        } else {
            recordingsList.innerHTML = '<div class="empty-state">No recordings found</div>';
        }
    } catch (error) {
        console.error('Error loading recordings:', error);
        recordingsList.innerHTML = '<div class="error-state">Error loading recordings</div>';
    }
}

async function loadSummaries() {
    try {
        if (!selectedClass) {
            console.log('No class selected, cannot load summaries');
            return;
        }

        const teacherEmail = store.get('userEmail');
        if (!teacherEmail) {
            console.error('No teacher email found');
            return;
        }

        const summaries = await ipcRenderer.invoke('get-summaries', {
            teacherEmail,
            classCode: selectedClass.code
        });

        if (summaries && summaries.length > 0) {
            renderSummaries(summaries);
        } else {
            summariesList.innerHTML = '<div class="empty-state">No summaries found</div>';
        }
    } catch (error) {
        console.error('Error loading summaries:', error);
        summariesList.innerHTML = '<div class="error-state">Error loading summaries</div>';
    }
}

async function blobToBase64(blob) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
}

async function handleSaveRecording() {
    try {
        console.log('Starting recording save process...');
        const userEmail = await window.electron.getUserEmail();
        if (!userEmail) {
            throw new Error('No user email found');
        }

        const recordingData = {
            // ... existing recording data ...
        };

        console.log('Sending recording to main process...');
        const result = await window.electron.saveRecording({
            teacherEmail: userEmail,
            recordingData,
            name: document.getElementById('recordingName').value
        });

        if (result.success) {
            console.log('Recording saved successfully');
            showSuccess('Recording saved successfully');
        } else {
            console.error('Failed to save recording:', result.error);
            showError(result.error || 'Failed to save recording');
        }
    } catch (error) {
        console.error('Recording save error:', error);
        showError('An error occurred while saving the recording');
    }
}

async function loadClasses() {
    const teacherEmail = store.get('userEmail');
    if (!teacherEmail) {
        console.error('No teacher email found');
        return;
    }

    const classes = await ipcRenderer.invoke('get-classes', { teacherEmail });
    renderClasses(classes);
}

async function initializeApp() {
    // Check for existing session
    const token = store.get('userToken');
    const userEmail = store.get('userEmail');
    const userName = store.get('userName');
    
    if (token && userEmail && userName) {
        showMainScreen();
        loadUserData();
    } else {
        // Explicitly show login screen
        showLoginScreen();
    }
}

// Show the upload dialog
function showUploadDialog() {
    uploadDialog.style.display = 'flex';
}

// Hide the upload dialog
function hideUploadDialog() {
    uploadDialog.style.display = 'none';
    uploadPasswordInput.value = '';
    recordingNameInput.value = '';
    audioFileInput.value = '';
}

// Handle the upload recording process
async function handleUploadRecording() {
    // Check if a class is selected
    if (!selectedClass) {
        showError('Please select a class first');
        hideUploadDialog();
        return;
    }
    
    // Validate password
    const password = uploadPasswordInput.value;
    if (password !== '071409') {
        showError('Invalid password');
        return;
    }
    
    // Check if a file is selected
    const file = audioFileInput.files[0];
    if (!file) {
        showError('Please select an audio file');
        return;
    }
    
    try {
        // Show loading indicator
        showError('Uploading audio file...', 'info');
        
        // Convert file to base64
        const base64Data = await fileToBase64(file);
        
        // Get file extension
        const fileType = file.name.split('.').pop().toLowerCase();
        
        // Get teacher email
        const teacherEmail = store.get('userEmail');
        
        // Generate default name using timestamp
        const defaultName = `Uploaded Recording ${new Date().toLocaleString()}.m4a`;
        
        // Save the recording using the upload-audio handler
        const result = await ipcRenderer.invoke('upload-audio', {
            teacherEmail,
            classCode: selectedClass.code,
            audioData: base64Data,
            name: defaultName,
            password: password,
            fileType: fileType || 'm4a'
        });
        
        if (result.success) {
            hideUploadDialog();
            await loadRecordings(teacherEmail);
            showError('Recording uploaded successfully', 'success');
        } else {
            showError('Failed to upload recording: ' + (result.error || 'Unknown error'));
        }
    } catch (error) {
        console.error('Error uploading recording:', error);
        showError('Error uploading recording: ' + error.message);
    }
}

// Convert file to base64
function fileToBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

async function deleteRecording(recordingId) {
    try {
        const result = await ipcRenderer.invoke('delete-recording', {
            recordingId,
            teacherEmail: store.get('userEmail'),
            classCode: selectedClass?.code
        });

        if (result.success) {
            showError('Recording deleted successfully', 'success');
            loadRecordings(); // Reload recordings list
        } else {
            showError('Failed to delete recording: ' + (result.error || 'Unknown error'));
        }
    } catch (error) {
        console.error('Delete recording error:', error);
        showError('Error deleting recording: ' + error.message);
    }
}

async function loadStudentApprovals() {
    if (!selectedClass) return;

    try {
        const teacherEmail = store.get('userEmail');
        const joinRequestsPath = `${store.get('currentSchool')}/teachers/${teacherEmail}/classes/${selectedClass.code}/join-requests/`;
        
        const requests = await ipcRenderer.invoke('get-join-requests', {
            teacherEmail,
            classCode: selectedClass.code,
            path: joinRequestsPath
        });

        selectedClass.pendingStudents = requests;
        renderStudentsTab();
    } catch (error) {
        console.error('Error loading student approvals:', error);
    }
}

initializeApp();