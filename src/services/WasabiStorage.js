import AWS from 'aws-sdk';

// Initialize the Wasabi storage service
// Note: In a real implementation, these credentials would be stored securely 
// and potentially fetched from environment variables or a backend service
class WasabiStorage {
  constructor() {
    console.log('========== WASABI STORAGE INITIALIZED ==========');
    console.log('USING WASABI CLOUD STORAGE - NOT USING LOCALSTORAGE');
    console.log(`Bucket: thetatest, Endpoint: https://s3.us-west-1.wasabisys.com`);
    
    // Configure the Wasabi connection
    this.s3 = new AWS.S3({
      endpoint: 'https://s3.us-west-1.wasabisys.com',
      accessKeyId: 'W7X9U7PACFCWQZHRJBRH',
      secretAccessKey: 'Xc3tkWt1W0tGSMhEN3w6WTPJNsOlWYuhtirgV9Dc',
      region: 'us-west-1',
      s3ForcePathStyle: true, // Required for Wasabi
    });
    
    this.bucket = 'thetatest';

    // Initialize base folders
    this.initializeFolders();
    
    // Never fall back to localStorage
    this.useLocalStorage = false;
    
    // Test connection during initialization but don't fall back
    this.testConnection();
    
    console.log('==============================================');
  }
  
  // Initialize the folder structure
  async initializeFolders() {
    try {
      const folders = [
        'teacher-approval/',
        'student-approval/',
        'Skyline/',
        'Skyline/teachers/',
        'Skyline/students/'
      ];

      await Promise.all(folders.map(folder => 
        this.s3.putObject({
          Bucket: this.bucket,
          Key: folder,
          Body: '',
          ContentType: 'application/x-directory'
        }).promise()
      ));

      return true;
    } catch (error) {
      console.error('Error initializing folders:', error);
      return false;
    }
  }

  // Path helpers
  getTeacherPath(schoolName, email) {
    return `${schoolName}/teachers/${email}/info.json`;
  }

  getPendingTeacherPath(email) {
    return `teacher-approval/${email}.json`;
  }

  getPendingStudentPath(email) {
    return `student-approval/${email}.json`;
  }

  getStudentPath(schoolName, email) {
    return `${schoolName}/students/${email}/info.json`;
  }

  getTeacherClassesPath(schoolName, email) {
    return `${schoolName}/teachers/${email}/classes/`;
  }

  getClassPath(schoolName, teacherEmail, classCode) {
    return `${schoolName}/teachers/${teacherEmail}/classes/${classCode}/info.json`;
  }

  getRecordingsPath(schoolName, teacherEmail, classCode) {
    return `${schoolName}/teachers/${teacherEmail}/classes/${classCode}/recordings/`;
  }

  getRecordingPath(schoolName, teacherEmail, classCode, recordingId) {
    return `${schoolName}/teachers/${teacherEmail}/classes/${classCode}/recordings/${recordingId}.json`;
  }

  getSummariesPath(schoolName, teacherEmail, classCode) {
    return `${schoolName}/teachers/${teacherEmail}/classes/${classCode}/summaries/`;
  }

  getSummaryPath(schoolName, teacherEmail, classCode, summaryId) {
    return `${schoolName}/teachers/${teacherEmail}/classes/${classCode}/summaries/${summaryId}.json`;
  }

  getClassJoinRequestPath(schoolName, teacherEmail, classCode, studentEmail) {
    return `${schoolName}/teachers/${teacherEmail}/classes/${classCode}/join-requests/${studentEmail}.json`;
  }

  getSchoolPath(schoolName) {
    return `${schoolName}/info.json`;
  }

  getSchoolsListPath() {
    return 'schools.json';
  }

  // Test the Wasabi connection
  async testConnection() {
    try {
      console.log('Testing Wasabi connection...');
      // Check if bucket exists
      const response = await this.s3.headBucket({ Bucket: this.bucket }).promise();
      console.log('Wasabi connection successful:', response);
      return true;
    } catch (error) {
      console.error('Wasabi connection test failed:', error.message, error.code);
      // Don't fall back to localStorage - just report the error
      console.error('WARNING: Wasabi storage is not working but fallback is disabled');
      return false;
    }
  }
  
  // Save data to Wasabi
  async saveData(key, data) {
    try {
      console.log(`Attempting to save data to Wasabi. Key: ${key}, Bucket: ${this.bucket}`);
      const params = {
        Bucket: this.bucket,
        Key: key,
        Body: JSON.stringify(data),
        ContentType: 'application/json',
      };
      
      const response = await this.s3.putObject(params).promise();
      console.log('Wasabi save successful:', response);
      return { success: true, response };
    } catch (error) {
      console.error('Detailed error saving to Wasabi:', error.message, error.code, error.statusCode);
      // Don't fall back to localStorage
      throw new Error(`Failed to save to Wasabi: ${error.message}`);
    }
  }
  
  // Get binary data from Wasabi (for files like ZIP)
  async getBinaryData(key) {
    try {
      console.log(`Attempting to get binary data from Wasabi. Key: ${key}, Bucket: ${this.bucket}`);
      const params = {
        Bucket: this.bucket,
        Key: key,
      };
      
      const response = await this.s3.getObject(params).promise();
      console.log('Wasabi get successful');
      return response.Body;
    } catch (error) {
      if (error.code === 'NoSuchKey') {
        console.log('Key not found in Wasabi, returning null');
        return null;
      }
      console.error('Detailed error getting from Wasabi:', error.message, error.code, error.statusCode);
      throw new Error(`Failed to get data from Wasabi: ${error.message}`);
    }
  }

  // Get data from Wasabi
  async getData(key) {
    try {
      console.log(`Attempting to get data from Wasabi. Key: ${key}, Bucket: ${this.bucket}`);
      const params = {
        Bucket: this.bucket,
        Key: key,
      };
      
      const response = await this.s3.getObject(params).promise();
      console.log('Wasabi get successful');
      
      // If the key ends with .json, parse it as JSON
      if (key.endsWith('.json')) {
        return JSON.parse(response.Body.toString());
      }
      // Otherwise return the raw buffer
      return response.Body;
    } catch (error) {
      if (error.code === 'NoSuchKey') {
        console.log('Key not found in Wasabi, returning null');
        return null;
      }
      console.error('Detailed error getting from Wasabi:', error.message, error.code, error.statusCode);
      throw new Error(`Failed to get data from Wasabi: ${error.message}`);
    }
  }
  
  // Update specific data in Wasabi
  async updateData(key, updateFunction) {
    let data = await this.getData(key);
    
    // If data doesn't exist yet, initialize with empty object or array
    if (!data) {
      data = typeof updateFunction(null) === 'object' ? {} : [];
    }
    
    // Apply the update function to modify the data
    const updatedData = updateFunction(data);
    
    // Save the updated data back to Wasabi
    return await this.saveData(key, updatedData);
  }
  
  // Delete data from Wasabi
  async deleteData(key) {
    try {
      console.log(`Attempting to delete data from Wasabi. Key: ${key}, Bucket: ${this.bucket}`);
      const params = {
        Bucket: this.bucket,
        Key: key,
      };
      
      const response = await this.s3.deleteObject(params).promise();
      console.log('Wasabi delete successful:', response);
      return { success: true, response };
    } catch (error) {
      console.error('Detailed error deleting from Wasabi:', error.message, error.code, error.statusCode);
      // Don't fall back to localStorage
      throw new Error(`Failed to delete from Wasabi: ${error.message}`);
    }
  }

  async listObjects(prefix) {
    const data = await this.s3.listObjectsV2({
      Bucket: this.bucket,
      Prefix: prefix
    }).promise();
    return data.Contents || [];
  }

  async deleteObject(key) {
    await this.s3.deleteObject({
      Bucket: this.bucket,
      Key: key
    }).promise();
  }

  // Move an object from one location to another
  async moveObject(fromKey, toKey) {
    try {
      // Copy the object to the new location
      await this.s3.copyObject({
        Bucket: this.bucket,
        CopySource: `${this.bucket}/${fromKey}`,
        Key: toKey
      }).promise();

      // Delete the object from the old location
      await this.deleteObject(fromKey);

      console.log(`Successfully moved object from ${fromKey} to ${toKey}`);
    } catch (error) {
      console.error('Error moving object:', error);
      throw error;
    }
  }

  async getSummaries(teacherEmail, classCode, options = {}) {
    try {
      const schoolName = sessionStorage.getItem('userSchool');
      if (!schoolName) {
        throw new Error('School information not found');
      }

      // If approvedOnly is set, use the approved-summaries/ folder
      let summariesPath;
      if (options.approvedOnly) {
        summariesPath = `${schoolName}/teachers/${teacherEmail}/classes/${classCode}/approved-summaries/`;
      } else {
        summariesPath = this.getSummariesPath(schoolName, teacherEmail, classCode);
      }
      const summariesData = await this.listObjects(summariesPath);
      const summaries = [];

      for (const summary of summariesData) {
        if (summary.Key.endsWith('.json')) {
          try {
            const summaryData = await this.s3.getObject({
              Bucket: this.bucket,
              Key: summary.Key
            }).promise();
            
            summaries.push(JSON.parse(summaryData.Body.toString()));
          } catch (error) {
            console.error('Error reading summary file:', summary.Key, error);
          }
        } else if (summary.Key.endsWith('.pdf')) {
          // For PDFs, create a summary object with the file info
          summaries.push({
            id: summary.Key,
            name: summary.Key.split('/').pop(),
            content: summary.Key, // Store the path to the PDF
            timestamp: summary.LastModified.getTime(),
            type: 'pdf'
          });
        }
      }

      // Sort summaries by date, newest first
      summaries.sort((a, b) => b.timestamp - a.timestamp);
      return summaries;
    } catch (error) {
      console.error('Error getting summaries:', error);
      return [];
    }
  }

  async getPresignedUrl(schoolName, teacherEmail, classCode, pdfId) {
    try {
        // Extract just the filename from the full path if it's a full path
        const fileName = pdfId.includes('/') ? pdfId.split('/').pop() : pdfId;
        const key = `${schoolName}/teachers/${teacherEmail}/classes/${classCode}/summaries/${fileName}`;
        const url = this.s3.getSignedUrl('getObject', {
            Bucket: this.bucket,
            Key: key,
            Expires: 3600 // URL expires in 1 hour
        });
        return url;
    } catch (error) {
        console.error('Error generating pre-signed URL:', error);
        return null;
    }
  }
}

// Create and export a singleton instance
const wasabiStorage = new WasabiStorage();
export default wasabiStorage; 