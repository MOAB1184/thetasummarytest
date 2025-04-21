const { app, BrowserWindow, ipcMain } = require('electron');
const os = require('os');
const fs = require('fs');
const path = require('path');
const Store = require('electron-store');
const AWS = require('aws-sdk');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegInstaller = require('@ffmpeg-installer/ffmpeg');
let ffmpegPath = ffmpegInstaller.path;
if (ffmpegPath.includes('app.asar')) {
  ffmpegPath = ffmpegPath.replace('app.asar', 'app.asar.unpacked');
}
ffmpeg.setFfmpegPath(ffmpegPath);
require('dotenv').config();

console.log('\n=== Teacher App Initialization ===');
console.log('Initializing AWS S3 client with config:', {
    endpoint: 'https://s3.us-west-1.wasabisys.com',
    region: 'us-west-1',
    accessKeyId: process.env.WASABI_ACCESS_KEY,
    secretAccessKey: process.env.WASABI_SECRET_KEY?.slice(0, 4) + '...',
    s3ForcePathStyle: true
});

const store = new Store();

// Configure AWS for Wasabi - match site's configuration exactly
const s3 = new AWS.S3({
    endpoint: 'https://s3.us-west-1.wasabisys.com',
    accessKeyId: process.env.WASABI_ACCESS_KEY || 'W7X9U7PACFCWQZHRJBRH',
    secretAccessKey: process.env.WASABI_SECRET_KEY || 'Xc3tkWt1W0tGSMhEN3w6WTPJNsOlWYuhtirgV9Dc',
    region: 'us-west-1',
    s3ForcePathStyle: true,
    signatureVersion: 'v4',
    params: {
        Bucket: process.env.WASABI_BUCKET || 'thetatest',
        ACL: 'public-read'
    }
});

console.log('AWS S3 client initialized successfully');

// Create base directory for app data
const appDataPath = path.join(app.getPath('userData'), 'teacher-app-data');
try {
    if (!fs.existsSync(appDataPath)) {
        fs.mkdirSync(appDataPath, { recursive: true });
        console.log('Created app data directory:', appDataPath);
    }

    // Create temporary directories for recordings and summaries
    const recordingsPath = path.join(appDataPath, 'recordings');
    const summariesPath = path.join(appDataPath, 'summaries');
    
    if (!fs.existsSync(recordingsPath)) {
        fs.mkdirSync(recordingsPath, { recursive: true });
    }
    if (!fs.existsSync(summariesPath)) {
        fs.mkdirSync(summariesPath, { recursive: true });
    }
} catch (error) {
    console.error('\n=== Directory Creation Error ===');
    console.error('Error type:', error.constructor.name);
    console.error('Error message:', error.message);
    console.error('Error stack:', error.stack);
}

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  mainWindow.loadFile('index.html');
  
  if (process.env.NODE_ENV === 'development') {
    mainWindow.webContents.openDevTools();
  }
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// Update all bucket references
const BUCKET_NAME = process.env.WASABI_BUCKET;

// Define possible school names - we'll try each one when looking for user data
const POSSIBLE_SCHOOLS = ['thetatest', 'thetadev', 'Skyline', 'Issaquah', ''];

// Add a debug function to list bucket contents
ipcMain.handle('list-bucket-contents', async (event, prefix = '') => {
    try {
        console.log(`Listing bucket contents with prefix: '${prefix}'`);
        const params = {
            Bucket: BUCKET_NAME,
            Prefix: prefix,
            MaxKeys: 100
        };

        const data = await s3.listObjectsV2(params).promise();
        console.log(`Found ${data.Contents.length} objects`);
        return data.Contents.map(item => item.Key);
    } catch (error) {
        console.error('Error listing bucket contents:', error);
        return [];
    }
});

// Handle store clearing
ipcMain.handle('clear-store', () => {
  console.log('Clearing main process store...');
  store.clear();
  return true;
});

// Handle user data retrieval for login
ipcMain.handle('get-user-data', async (event, params) => {
    if (!params || !params.email) {
        console.error('Missing email parameter for get-user-data');
        return null;
    }

    try {
        console.log('\n=== Getting User Data ===');
        console.log('Email:', params.email);
        console.log('Using bucket:', process.env.WASABI_BUCKET);

        // Try each possible school name
        for (const school of POSSIBLE_SCHOOLS) {
            try {
                const schoolPrefix = school ? `${school}/` : '';
                const key = `${schoolPrefix}teachers/${params.email}/info.json`;
                console.log(`Trying to find user in path: ${key}`);
                
                const userData = await s3.getObject({
                    Key: key
                }).promise().then(data => JSON.parse(data.Body.toString()));

                console.log('User data retrieved successfully from path:', key);
                
                // Store the school name for future use
                store.set('currentSchool', school);
                
                return userData;
            } catch (error) {
                if (error.code === 'NoSuchKey') {
                    console.log(`User not found at path: ${school ? `${school}/` : ''}teachers/${params.email}/info.json`);
                    // Continue to the next school
                } else {
                    throw error;
                }
            }
        }

        // Try direct path as a last resort
        try {
            const key = `teachers/${params.email}/info.json`;
            console.log(`Trying direct path: ${key}`);
            
            const userData = await s3.getObject({
                Key: key
            }).promise().then(data => JSON.parse(data.Body.toString()));

            console.log('User data retrieved successfully from direct path');
            store.set('currentSchool', ''); // Empty string for direct path
            return userData;
        } catch (error) {
            if (error.code === 'NoSuchKey') {
                console.log(`User not found at direct path: teachers/${params.email}/info.json`);
            } else {
                throw error;
            }
        }

        // If we get here, we've tried all paths and didn't find the user
        console.log('User not found in any path:', params.email);
        return null;
    } catch (error) {
        console.error('Error getting user data:', error);
        throw error;
    }
});

// Handle recording operations
ipcMain.handle('save-recording', async (event, params) => {
    try {
        console.log('\n=== Starting Recording Save ===');
        console.log('Save parameters:', {
            teacherEmail: params.teacherEmail,
            classCode: params.classCode,
            name: params.name,
            duration: params.duration,
            originalMimeType: params.originalMimeType
        });

        // Generate a unique ID for this recording
        const recordingId = Date.now().toString();
        const newRecording = {
            id: recordingId,
            name: params.name || `Recording ${recordingId}`,
            timestamp: Date.now(),
            duration: params.duration || 0
        };

        // Save recording metadata to S3
        const recordingKey = `${store.get('currentSchool')}/teachers/${params.teacherEmail}/classes/${params.classCode}/recordings/${recordingId}.json`;
        const audioKey = `${store.get('currentSchool')}/teachers/${params.teacherEmail}/classes/${params.classCode}/recordings/${recordingId}.m4a`;
        console.log('Saving recording metadata to:', recordingKey);
        await s3.putObject({
            Bucket: BUCKET_NAME,
            Key: recordingKey,
            Body: JSON.stringify(newRecording),
            ContentType: 'application/json'
        }).promise();

        // Extract base64 data and convert to buffer
        const base64Data = params.recordingData.split(',')[1];
        const tempDir = os.tmpdir();
        const tempInputPath = path.join(tempDir, `rec_${recordingId}.webm`);
        const tempOutputPath = path.join(tempDir, `rec_${recordingId}.m4a`);
        fs.writeFileSync(tempInputPath, Buffer.from(base64Data, 'base64'));

        // Convert webm to m4a using ffmpeg
        await new Promise((resolve, reject) => {
            ffmpeg(tempInputPath)
                .toFormat('ipod') // ipod = m4a
                .audioCodec('aac')
                .on('end', resolve)
                .on('error', reject)
                .save(tempOutputPath);
        });
        const audioBuffer = fs.readFileSync(tempOutputPath);
        fs.unlinkSync(tempInputPath);
        fs.unlinkSync(tempOutputPath);

        // Save audio data to S3
        console.log('Saving audio data to:', audioKey);
        const result = await s3.putObject({
            Bucket: BUCKET_NAME,
            Key: audioKey,
            Body: audioBuffer,
            ContentType: 'audio/mp4'
        }).promise();
        console.log('Upload successful:', {
            key: recordingKey,
            location: result.Location,
            etag: result.ETag
        });
        return { success: true, recording: newRecording };
    } catch (error) {
        if (error.message && error.message.includes('no recording exists')) {
            return { success: false };
        }
        console.error('\n=== Recording Save Error ===');
        console.error('Error type:', error.constructor.name);
        console.error('Error code:', error.code);
        console.error('Error message:', error.message);
        console.error('Error stack:', error.stack);
        return { success: false, error: error.message };
    }
});

ipcMain.handle('get-recordings', async (event, params) => {
    if (!params || !params.teacherEmail || !params.classCode) {
        console.error('Missing required parameters for get-recordings');
        return [];
    }

    try {
        console.log('Getting recordings for teacher:', params.teacherEmail, 'class:', params.classCode);
        const listParams = {
            Bucket: BUCKET_NAME,
            Prefix: `${store.get('currentSchool')}/teachers/${params.teacherEmail}/classes/${params.classCode}/recordings/`
        };

        const data = await s3.listObjectsV2(listParams).promise();
        const recordings = [];

        for (const obj of data.Contents) {
            if (obj.Key.endsWith('.json')) {
                const recordingData = await s3.getObject({
                    Bucket: BUCKET_NAME,
                    Key: obj.Key
                }).promise();
                
                recordings.push(JSON.parse(recordingData.Body.toString()));
            }
        }

        console.log('Total recordings loaded:', recordings.length);
        return recordings;
    } catch (error) {
        console.error('Error getting recordings:', error);
        return [];
    }
});

// Handle audio file upload with password protection
ipcMain.handle('upload-audio', async (event, params) => {
    if (!params || !params.teacherEmail || !params.classCode || !params.password) {
        console.error('Missing required parameters for upload-audio');
        return { success: false, error: 'Missing required parameters' };
    }

    // Verify password
    if (params.password !== '071409') {
        console.error('Invalid password for audio upload');
        return { success: false, error: 'Invalid password' };
    }

    try {
        console.log('\n=== Starting Audio Upload ===');
        console.log('Upload parameters:', {
            teacherEmail: params.teacherEmail,
            classCode: params.classCode,
            name: params.name,
            fileType: params.fileType
        });

        // Generate a unique ID for this recording
        const recordingId = Date.now().toString();
        const newRecording = {
            id: recordingId,
            name: params.name || `Uploaded ${recordingId}`,
            timestamp: Date.now(),
            duration: 0,
            isUploaded: true
        };

        // Save recording metadata to S3
        const recordingKey = `${store.get('currentSchool')}/teachers/${params.teacherEmail}/classes/${params.classCode}/recordings/${recordingId}.json`;
        const audioKey = `${store.get('currentSchool')}/teachers/${params.teacherEmail}/classes/${params.classCode}/recordings/${recordingId}.${params.fileType}`;
        
        console.log('Saving recording metadata to:', recordingKey);
        
        await s3.putObject({
            Bucket: BUCKET_NAME,
            Key: recordingKey,
            Body: JSON.stringify(newRecording),
            ContentType: 'application/json'
        }).promise();

        // Save audio data to S3
        console.log('Saving audio data to:', audioKey);
        
        // Extract base64 data and convert to buffer
        const base64Data = params.audioData.split(',')[1];
        const audioBuffer = Buffer.from(base64Data, 'base64');
        
        const result = await s3.putObject({
            Bucket: BUCKET_NAME,
            Key: audioKey,
            Body: audioBuffer,
            ContentType: `audio/${params.fileType}`
        }).promise();
        
        console.log('Upload successful:', {
            key: recordingKey,
            location: result.Location,
            etag: result.ETag
        });

        return { success: true, recording: newRecording };
    } catch (error) {
        console.error('\n=== Audio Upload Error ===');
        console.error('Error type:', error.constructor.name);
        console.error('Error code:', error.code);
        console.error('Error message:', error.message);
        console.error('Error stack:', error.stack);
        return { success: false, error: error.message };
    }
});

// Handle summary operations
ipcMain.handle('save-summary', async (event, { teacherEmail, classCode, summaryData }) => {
    try {
        const summaryId = Date.now().toString();
        const isPDF = summaryData.name.toLowerCase().endsWith('.pdf');
        
        const newSummary = {
            id: summaryId,
            name: summaryData.name || `Summary ${summaryId}`,
            timestamp: Date.now()
        };

        if (isPDF) {
            // For PDFs, store the file directly
            const pdfKey = `${store.get('currentSchool')}/teachers/${teacherEmail}/classes/${classCode}/summaries/${summaryId}.pdf`;
            const pdfBuffer = Buffer.from(summaryData.content.split(',')[1], 'base64');
            
            await s3.putObject({
                Bucket: BUCKET_NAME,
                Key: pdfKey,
                Body: pdfBuffer,
                ContentType: 'application/pdf',
                ACL: 'public-read',
                CacheControl: 'public, max-age=31536000'
            }).promise();
            
            newSummary.content = pdfKey; // Store the path to the PDF
        } else {
            // For text summaries, store as JSON
            newSummary.content = summaryData.content;
            const summaryKey = `${store.get('currentSchool')}/teachers/${teacherEmail}/classes/${classCode}/summaries/${summaryId}.json`;
            
            await s3.putObject({
                Bucket: BUCKET_NAME,
                Key: summaryKey,
                Body: JSON.stringify(newSummary),
                ContentType: 'application/json'
            }).promise();
        }

        return { success: true, summary: newSummary };
    } catch (error) {
        console.error('Error saving summary:', error);
        return { success: false, error: error.message };
    }
});

// IPC handlers for approving/denying summaries
ipcMain.handle('approve-summary', async (event, { teacherEmail, classCode, summaryId }) => {
  try {
    // Move summary to approved location (visible to students)
    const school = store.get('currentSchool');
    const summaryPath = `${school}/teachers/${teacherEmail}/classes/${classCode}/summaries/${summaryId}.json`;
    const approvedPath = `${school}/teachers/${teacherEmail}/classes/${classCode}/approved-summaries/${summaryId}.json`;
    // Check if summary exists before moving
    let summaryData;
    try {
      const obj = await s3.getObject({
        Bucket: BUCKET_NAME,
        Key: summaryPath
      }).promise();
      summaryData = JSON.parse(obj.Body.toString());
    } catch (err) {
      if (err.code === 'NoSuchKey' || err.message.includes('The specified key does not exist')) {
        throw new Error('Summary not found or already approved/denied.');
      }
      throw err;
    }
    await s3.putObject({
      Bucket: BUCKET_NAME,
      Key: approvedPath,
      Body: JSON.stringify(summaryData),
      ContentType: 'application/json'
    }).promise();
    await s3.deleteObject({
      Bucket: BUCKET_NAME,
      Key: summaryPath
    }).promise();
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('deny-summary', async (event, { teacherEmail, classCode, summaryId }) => {
  try {
    // Delete summary so it is never shown
    const school = store.get('currentSchool');
    const summaryPath = `${school}/teachers/${teacherEmail}/classes/${classCode}/summaries/${summaryId}.json`;
    await s3.deleteObject({
      Bucket: BUCKET_NAME,
      Key: summaryPath
    }).promise();
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Function to update object ACL to public-read
async function makeObjectPublic(key) {
    try {
        await s3.putObjectAcl({
            Bucket: BUCKET_NAME,
            Key: key,
            ACL: 'public-read'
        }).promise();
        console.log('Updated ACL to public-read for:', key);
        return true;
    } catch (error) {
        console.error('Error updating ACL for:', key, error);
        return false;
    }
}

ipcMain.handle('get-summaries', async (event, { teacherEmail, classCode }) => {
    try {
        console.log('Getting summaries for teacher:', teacherEmail, 'class:', classCode);
        const params = {
            Bucket: BUCKET_NAME,
            Prefix: `${store.get('currentSchool')}/teachers/${teacherEmail}/classes/${classCode}/summaries/`
        };

        const data = await s3.listObjectsV2(params).promise();
        const summaries = [];

        for (const obj of data.Contents || []) {
            if (obj.Key.endsWith('.json')) {
                const summaryData = await s3.getObject({
                    Bucket: BUCKET_NAME,
                    Key: obj.Key
                }).promise();
                
                summaries.push(JSON.parse(summaryData.Body.toString()));
            } else if (obj.Key.endsWith('.pdf')) {
                // For PDFs, create a summary object with the file info
                const fileName = obj.Key.split('/').pop();
                
                // Update PDF to be public-readable
                await makeObjectPublic(obj.Key);
                
                summaries.push({
                    id: obj.Key,
                    name: fileName,
                    timestamp: obj.LastModified.getTime(),
                    type: 'pdf'
                });
            }
        }

        // Sort summaries by date, newest first
        summaries.sort((a, b) => b.timestamp - a.timestamp);
        
        console.log('Total summaries loaded:', summaries.length);
        return summaries;
    } catch (error) {
        console.error('Error getting summaries:', error);
        return [];
    }
});

// Handle class operations
ipcMain.handle('create-class', async (event, params) => {
    if (!params || !params.teacherEmail || !params.className) {
        console.error('Missing required parameters for create-class');
        return { success: false, error: 'Missing required parameters' };
    }

    try {
        console.log('\n=== Creating New Class ===');
        console.log('Parameters:', {
            teacherEmail: params.teacherEmail,
            className: params.className
        });

        // Generate a unique 6-character class code
        const generateClassCode = () => {
            const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
            let code = '';
            for (let i = 0; i < 6; i++) {
                code += chars.charAt(Math.floor(Math.random() * chars.length));
            }
            return code;
        };

        const classCode = generateClassCode();
        const basePath = `${store.get('currentSchool')}/teachers/${params.teacherEmail}/classes/${classCode}`;
        const classKey = `${basePath}/info.json`;
        
        const classData = {
            name: params.className,
            code: classCode,
            teacherEmail: params.teacherEmail,
            createdAt: new Date().toISOString(),
            students: [],
            pendingStudents: []
        };

        // Create necessary subfolders by creating empty .keep files
        const subfolders = ['recordings', 'summaries', 'join-requests'];
        for (const folder of subfolders) {
            const options = {
                Bucket: BUCKET_NAME,
                Key: `${basePath}/${folder}/.keep`,
                Body: '',
                ContentType: 'text/plain'
            };
            
            // Add public-read ACL for summaries folder
            if (folder === 'summaries') {
                options.ACL = 'public-read';
            }
            
            await s3.putObject(options).promise();
        }

        console.log('Saving class data...');
        await s3.putObject({
            Bucket: BUCKET_NAME,
            Key: classKey,
            Body: JSON.stringify(classData),
            ContentType: 'application/json'
        }).promise();

        console.log('Class created successfully:', classData);
        return { success: true, class: classData };
    } catch (error) {
        console.error('Error creating class:', error);
        return { success: false, error: error.message };
    }
});

ipcMain.handle('get-classes', async (event, params) => {
    if (!params || !params.teacherEmail) {
        console.error('Missing required parameters for get-classes');
        return [];
    }

    try {
        console.log('Getting classes for teacher:', params.teacherEmail);
        const listParams = {
            Bucket: BUCKET_NAME,
            Prefix: `${store.get('currentSchool')}/teachers/${params.teacherEmail}/classes/`
        };

        const data = await s3.listObjectsV2(listParams).promise();
        const classes = [];

        for (const obj of data.Contents) {
            if (obj.Key.endsWith('info.json')) {
                const classData = await s3.getObject({
                    Bucket: BUCKET_NAME,
                    Key: obj.Key
                }).promise();
                
                classes.push(JSON.parse(classData.Body.toString()));
            }
        }

        console.log('Total classes loaded:', classes.length);
        return classes;
    } catch (error) {
        console.error('Error getting classes:', error);
        return [];
    }
});

ipcMain.handle('approve-student', async (event, params) => {
    if (!params || !params.teacherEmail || !params.classCode || !params.studentEmail) {
        console.error('Missing required parameters for approve-student');
        return { success: false, error: 'Missing required parameters' };
    }

    try {
        console.log('\n=== Approving Student ===');
        console.log('Parameters:', params);

        const classKey = `${store.get('currentSchool')}/teachers/${params.teacherEmail}/classes/${params.classCode}/info.json`;
        const joinRequestKey = `${store.get('currentSchool')}/teachers/${params.teacherEmail}/classes/${params.classCode}/join-requests/${params.studentEmail}.json`;
        const studentKey = `${store.get('currentSchool')}/students/${params.studentEmail}/info.json`;
        
        // Get current class data
        const classData = await s3.getObject({
            Bucket: BUCKET_NAME,
            Key: classKey
        }).promise().then(data => JSON.parse(data.Body.toString()));

        // Get the join request data
        const joinRequestData = await s3.getObject({
            Bucket: BUCKET_NAME,
            Key: joinRequestKey
        }).promise().then(data => JSON.parse(data.Body.toString()));

        // Get student data
        const studentData = await s3.getObject({
            Bucket: BUCKET_NAME,
            Key: studentKey
        }).promise().then(data => JSON.parse(data.Body.toString()));

        // Add student to approved list if not already there
        if (!classData.students) {
            classData.students = [];
        }
        
        if (!classData.students.some(s => s.email === params.studentEmail)) {
            classData.students.push({
                email: params.studentEmail,
                name: joinRequestData.studentName,
                joinedAt: new Date().toISOString()
            });
        }

        // Add class to student's enrolled classes if not already there
        if (!studentData.classes) {
            studentData.classes = [];
        }

        if (!studentData.classes.some(c => c.code === params.classCode)) {
            studentData.classes.push({
                code: params.classCode,
                name: classData.name,
                teacherEmail: params.teacherEmail,
                joinedAt: new Date().toISOString()
            });
        }

        // Delete the join request file
        await s3.deleteObject({
            Bucket: BUCKET_NAME,
            Key: joinRequestKey
        }).promise();

        // Save updated class data
        await s3.putObject({
            Bucket: BUCKET_NAME,
            Key: classKey,
            Body: JSON.stringify(classData),
            ContentType: 'application/json'
        }).promise();

        // Save updated student data
        await s3.putObject({
            Bucket: BUCKET_NAME,
            Key: studentKey,
            Body: JSON.stringify(studentData),
            ContentType: 'application/json'
        }).promise();

        console.log('Student approved successfully');
        return { success: true, class: classData };
    } catch (error) {
        console.error('Error approving student:', error);
        return { success: false, error: error.message };
    }
});

ipcMain.handle('deny-student', async (event, params) => {
    if (!params || !params.teacherEmail || !params.classCode || !params.studentEmail) {
        console.error('Missing required parameters for deny-student');
        return { success: false, error: 'Missing required parameters' };
    }

    try {
        console.log('\n=== Denying Student ===');
        console.log('Parameters:', params);

        const classKey = `${store.get('currentSchool')}/teachers/${params.teacherEmail}/classes/${params.classCode}/info.json`;
        
        // Get current class data
        const classData = await s3.getObject({
            Bucket: BUCKET_NAME,
            Key: classKey
        }).promise().then(data => JSON.parse(data.Body.toString()));

        // Remove from pending students
        classData.pendingStudents = classData.pendingStudents.filter(s => s.email !== params.studentEmail);

        // Save updated class data
        await s3.putObject({
            Bucket: BUCKET_NAME,
            Key: classKey,
            Body: JSON.stringify(classData),
            ContentType: 'application/json'
        }).promise();

        console.log('Student denied successfully');
        return { success: true, class: classData };
    } catch (error) {
        console.error('Error denying student:', error);
        return { success: false, error: error.message };
    }
});

// Handle delete recording request
ipcMain.handle('delete-recording', async (event, params) => {
    if (!params || !params.recordingId || !params.teacherEmail || !params.classCode) {
        console.error('Missing required parameters for delete-recording');
        return { success: false, error: 'Missing required parameters' };
    }

    try {
        console.log('\n=== Deleting Recording ===');
        console.log('Parameters:', params);

        // Delete the recording file from S3
        const recordingKey = `${store.get('currentSchool')}/teachers/${params.teacherEmail}/classes/${params.classCode}/recordings/${params.recordingId}`;
        
        await s3.deleteObject({
            Bucket: BUCKET_NAME,
            Key: recordingKey
        }).promise();

        console.log('Recording deleted successfully');
        return { success: true };
    } catch (error) {
        console.error('Error deleting recording:', error);
        return { success: false, error: error.message };
    }
});

ipcMain.handle('remove-student', async (event, params) => {
    if (!params || !params.teacherEmail || !params.classCode || !params.studentEmail) {
        console.error('Missing required parameters for remove-student');
        return { success: false, error: 'Missing required parameters' };
    }

    try {
        console.log('\n=== Removing Student ===');
        console.log('Parameters:', {
            teacherEmail: params.teacherEmail,
            classCode: params.classCode,
            studentEmail: params.studentEmail
        });

        // Get the class data
        const classKey = `${store.get('currentSchool')}/teachers/${params.teacherEmail}/classes/${params.classCode}/info.json`;
        const classData = await s3.getObject({
            Bucket: BUCKET_NAME,
            Key: classKey
        }).promise().then(data => JSON.parse(data.Body.toString()));

        // Remove student from the class
        classData.students = classData.students.filter(student => student.email !== params.studentEmail);

        // Save updated class data
        await s3.putObject({
            Bucket: BUCKET_NAME,
            Key: classKey,
            Body: JSON.stringify(classData),
            ContentType: 'application/json'
        }).promise();

        // Get student data to update their classes
        const studentKey = `${store.get('currentSchool')}/students/${params.studentEmail}/info.json`;
        const studentData = await s3.getObject({
            Bucket: BUCKET_NAME,
            Key: studentKey
        }).promise().then(data => JSON.parse(data.Body.toString()));

        // Remove class from student's enrolled classes
        studentData.classes = studentData.classes.filter(c => c.code !== params.classCode);

        // Save updated student data
        await s3.putObject({
            Bucket: BUCKET_NAME,
            Key: studentKey,
            Body: JSON.stringify(studentData),
            ContentType: 'application/json'
        }).promise();

        console.log('Successfully removed student from class');
        return { success: true, class: classData };
    } catch (error) {
        console.error('Error removing student:', error);
        return { success: false, error: error.message };
    }
});

ipcMain.handle('get-join-requests', async (event, params) => {
    if (!params || !params.teacherEmail || !params.classCode) {
        console.error('Missing required parameters for get-join-requests');
        return [];
    }

    try {
        console.log('\n=== Getting Join Requests ===');
        console.log('Parameters:', params);

        const joinRequestsPath = `${store.get('currentSchool')}/teachers/${params.teacherEmail}/classes/${params.classCode}/join-requests/`;
        
        // Get current class data first to check for already approved students
        const classKey = `${store.get('currentSchool')}/teachers/${params.teacherEmail}/classes/${params.classCode}/info.json`;
        const classData = await s3.getObject({
            Bucket: BUCKET_NAME,
            Key: classKey
        }).promise().then(data => JSON.parse(data.Body.toString()));

        // List all join requests
        const data = await s3.listObjectsV2({
            Bucket: BUCKET_NAME,
            Prefix: joinRequestsPath
        }).promise();

        const requests = [];
        for (const obj of data.Contents || []) {
            if (obj.Key.endsWith('.json')) {
                const requestData = await s3.getObject({
                    Bucket: BUCKET_NAME,
                    Key: obj.Key
                }).promise().then(data => JSON.parse(data.Body.toString()));

                // Only include if student is not already approved
                const studentEmail = obj.Key.split('/').pop().replace('.json', '');
                if (!classData.students.some(s => s.email === studentEmail)) {
                    requests.push({
                        ...requestData,
                        studentEmail: studentEmail
                    });
                } else {
                    // If student is already approved, delete the join request
                    await s3.deleteObject({
                        Bucket: BUCKET_NAME,
                        Key: obj.Key
                    }).promise();
                }
            }
        }

        console.log(`Found ${requests.length} pending join requests`);
        return requests;
    } catch (error) {
        console.error('Error getting join requests:', error);
        return [];
    }
});

// Handle PDF download URL generation
ipcMain.handle('get-pdf-url', async (event, { pdfId, classCode }) => {
    try {
        const teacherEmail = store.get('userEmail');
        if (!teacherEmail) {
            throw new Error('No teacher email found');
        }

        // Extract just the filename from the full path if it's a full path
        const fileName = pdfId.includes('/') ? pdfId.split('/').pop() : pdfId;
        const key = `${store.get('currentSchool')}/teachers/${teacherEmail}/classes/${classCode}/summaries/${fileName}`;
        
        // Generate a pre-signed URL that expires in 1 hour
        const url = s3.getSignedUrl('getObject', {
            Bucket: BUCKET_NAME,
            Key: key,
            Expires: 3600 // URL expires in 1 hour
        });

        console.log('Generated pre-signed URL for PDF:', key);
        return url;
    } catch (error) {
        console.error('Error generating PDF URL:', error);
        return null;
    }
}); 