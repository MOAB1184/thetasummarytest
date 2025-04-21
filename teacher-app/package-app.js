const fs = require('fs');
const path = require('path');
const archiver = require('archiver');

// Create a write stream for the zip file
const output = fs.createWriteStream(path.join(__dirname, 'teacher-app.zip'));
const archive = archiver('zip', {
  zlib: { level: 9 } // Maximum compression
});

// Listen for all archive data to be written
output.on('close', function() {
  console.log('Total bytes:', archive.pointer());
});

// Handle warnings and errors
archive.on('warning', function(err) {
  if (err.code === 'ENOENT') {
    console.warn('Warning:', err);
  } else {
    throw err;
  }
});

archive.on('error', function(err) {
  throw err;
});

// Pipe archive data to the file
archive.pipe(output);

// Create a .env file with Wasabi credentials
const envContent = `WASABI_ACCESS_KEY=W7X9U7PACFCWQZHRJBRH
WASABI_SECRET_KEY=Xc3tkWt1W0tGSMhEN3w6WTPJNsOlWYuhtirgV9Dc
WASABI_BUCKET=thetatest`;

fs.writeFileSync(path.join(__dirname, '.env'), envContent);

// Add the main files
const filesToInclude = [
  'main.js',
  'index.html',
  'renderer.js',
  'styles.css',
  'package.json',
  'start-app.bat',
  'create-shortcut.js',
  '.env'  // Include environment file with Wasabi credentials
];

filesToInclude.forEach(file => {
  archive.file(file, { name: file });
});

// Add the assets folder
archive.directory('assets/', 'assets');

// Create a README file with instructions
const readmeContent = `Teacher App Installation Guide

1. Extract all files from this zip to a folder
2. Double-click the "start-app.bat" file
3. The app will install and start automatically
4. A desktop shortcut will be created for easy access

If you encounter any issues:
- Make sure you have an internet connection
- Try running the app again by double-clicking start-app.bat
- Contact technical support if problems persist

Note: The first time you run the app, Windows may show a security warning.
Click "More info" and then "Run anyway" to proceed.`;

archive.append(readmeContent, { name: 'README.txt' });

// Finalize the archive
archive.finalize(); 