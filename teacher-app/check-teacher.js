const AWS = require('aws-sdk');
const path = require('path');

// Load .env from the app's root directory
require('dotenv').config({ path: path.join(__dirname, '.env') });

const s3 = new AWS.S3({
    endpoint: 'https://s3.us-west-1.wasabisys.com',
    accessKeyId: process.env.WASABI_ACCESS_KEY,
    secretAccessKey: process.env.WASABI_SECRET_KEY,
    region: 'us-west-1',
    s3ForcePathStyle: true
});

// Use BUCKET_NAME from environment variable
const BUCKET_NAME = process.env.WASABI_BUCKET || 'thetatest';
const EMAIL = 'nikitadecorah@gmail.com';

async function checkTeacherData() {
    try {
        // List all objects in the bucket
        console.log('\nSearching for all files containing the email:', EMAIL);
        const listResponse = await s3.listObjects({
            Bucket: BUCKET_NAME,
            Prefix: ''
        }).promise();

        // Filter objects that might contain the email
        const relevantObjects = listResponse.Contents.filter(obj => 
            obj.Key.includes(EMAIL) || 
            obj.Key.includes('teacher') || 
            obj.Key.includes('auth')
        );

        console.log('\nFound relevant objects:', relevantObjects.map(obj => obj.Key));

        // Check each relevant object
        for (const obj of relevantObjects) {
            try {
                const data = await s3.getObject({
                    Bucket: BUCKET_NAME,
                    Key: obj.Key
                }).promise();
                
                const content = data.Body.toString();
                if (content.includes(EMAIL)) {
                    console.log('\nFound file containing email:', obj.Key);
                    console.log('Content:', content);
                }
            } catch (error) {
                console.log('Error reading file:', obj.Key, error.code);
            }
        }

    } catch (error) {
        console.error('Error:', error);
    }
}

checkTeacherData(); 