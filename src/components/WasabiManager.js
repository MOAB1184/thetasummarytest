import React, { useState } from 'react';
import LatexFormatter from './LatexFormatter';

function WasabiManager() {
  const [startPath, setStartPath] = useState('');
  const [recordings, setRecordings] = useState([]);
  const [downloadUrl, setDownloadUrl] = useState('');
  const [uploadPath, setUploadPath] = useState('');
  const [uploadContent, setUploadContent] = useState('');
  const [message, setMessage] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);

  const handleScan = async () => {
    try {
      const response = await fetch('https://thetasummary.com/api/wasabi/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ startPath })
      });
      const data = await response.json();
      setRecordings(data.recordings);
      setMessage('Scan completed successfully');
    } catch (error) {
      setMessage('Error scanning Wasabi: ' + error.message);
    }
  };

  const summarizeTranscript = async (transcript) => {
    try {
      const response = await fetch('https://thetasummary.com/api/summarize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          transcript,
          prompt: "You are a helpful assistant that summarizes educational content. Please summarize the following transcript in a clear, concise manner. Highlight key concepts, important examples, and main takeaways. Format the summary in LaTeX using appropriate LaTeX commands for mathematical expressions, equations, and formatting."
        })
      });
      const data = await response.json();
      return data.summary;
    } catch (error) {
      throw new Error('Failed to summarize transcript: ' + error.message);
    }
  };

  const handleDownload = async (filePath) => {
    try {
      setIsProcessing(true);
      setMessage('Processing recording...');

      // Get download URL
      const response = await fetch('https://thetasummary.com/api/wasabi/download', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filePath })
      });
      const data = await response.json();
      setDownloadUrl(data.downloadUrl);

      // Transcribe the audio
      const transcribeResponse = await fetch('https://thetasummary.com/api/transcribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ audioUrl: data.downloadUrl })
      });
      const transcribeData = await transcribeResponse.json();
      const transcript = transcribeData.transcript;

      // Summarize the transcript
      const summary = await summarizeTranscript(transcript);

      // Generate summary file path
      const summaryPath = filePath.replace(/\/Recordings?\//, '/Summaries/').replace(/\.[^/.]+$/, '_summary.tex');

      // Upload the summary
      await fetch('https://thetasummary.com/api/wasabi/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filePath: summaryPath,
          fileContent: summary
        })
      });

      setMessage('Recording processed and summary uploaded successfully');
    } catch (error) {
      setMessage('Error processing recording: ' + error.message);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleUpload = async () => {
    try {
      const response = await fetch('https://thetasummary.com/api/wasabi/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filePath: uploadPath, fileContent: uploadContent })
      });
      const data = await response.json();
      setMessage(data.message);
    } catch (error) {
      setMessage('Error uploading file: ' + error.message);
    }
  };

  return (
    <div>
      <h2>Wasabi Manager</h2>
      <div>
        <h3>Scan Recordings</h3>
        <input
          type="text"
          value={startPath}
          onChange={(e) => setStartPath(e.target.value)}
          placeholder="Enter start path (optional)"
        />
        <button onClick={handleScan} disabled={isProcessing}>Scan</button>
        <ul>
          {recordings.map((recording, index) => (
            <li key={index}>
              {recording}
              <button 
                onClick={() => handleDownload(recording)}
                disabled={isProcessing}
              >
                {isProcessing ? 'Processing...' : 'Download & Summarize'}
              </button>
            </li>
          ))}
        </ul>
      </div>
      <div>
        <h3>Download</h3>
        {downloadUrl && <a href={downloadUrl} target="_blank" rel="noopener noreferrer">Download File</a>}
      </div>
      <div>
        <h3>Upload Summary</h3>
        <input
          type="text"
          value={uploadPath}
          onChange={(e) => setUploadPath(e.target.value)}
          placeholder="Enter file path"
          disabled={isProcessing}
        />
        <textarea
          value={uploadContent}
          onChange={(e) => setUploadContent(e.target.value)}
          placeholder="Enter file content"
          disabled={isProcessing}
        />
        <button onClick={handleUpload} disabled={isProcessing}>Upload</button>
        {uploadContent && (
          <div className="preview-container">
            <h4>Preview:</h4>
            <LatexFormatter content={uploadContent} />
          </div>
        )}
      </div>
      {message && <p>{message}</p>}
    </div>
  );
}

export default WasabiManager; 