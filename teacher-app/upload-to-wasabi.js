const AWS = require('aws-sdk');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

console.log('\nCleaning dist directory...');
if (fs.existsSync('dist')) {
  fs.rmSync('dist', { recursive: true });
}
console.log('✓ Dist directory cleaned\n');

console.log('Building Teacher App...');
require('child_process').execSync('npm run build', { stdio: 'inherit' });
console.log('✓ Build completed successfully\n');

// Configure AWS for Wasabi
const s3 = new AWS.S3({
  endpoint: 'https://s3.us-west-1.wasabisys.com',
  accessKeyId: process.env.WASABI_ACCESS_KEY,
  secretAccessKey: process.env.WASABI_SECRET_KEY,
  region: 'us-west-1',
  s3ForcePathStyle: true
});

const BUCKET_NAME = process.env.WASABI_BUCKET;
const exePath = path.join(__dirname, 'dist', 'Teacher App.exe');

async function uploadApp() {
  try {
    console.log('\nReading executable file...');
    const fileBuffer = fs.readFileSync(exePath);
    console.log('✓ File read successfully');
    console.log('File size:', (fileBuffer.length / (1024 * 1024)).toFixed(2) + ' MB');

    console.log('\nUploading to Wasabi...');
    await s3.upload({
      Bucket: BUCKET_NAME,
      Key: 'Teacher App.exe',
      Body: fileBuffer,
      ContentType: 'application/x-msdownload'
    }).promise();

    console.log('✓ Upload completed successfully!');
  } catch (error) {
    console.error('\nError during upload:', error);
    process.exit(1);
  }
}

uploadApp(); 