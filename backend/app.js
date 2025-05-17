const express = require('express');
const cors = require('cors');
const OpenAI = require('openai');
const AWS = require('aws-sdk');
const path = require('path');
const os = require('os');
const fs = require('fs');
const fetch = require('node-fetch');
const app = express();

// Enable CORS for all routes
app.use(cors({
  origin: ['https://thetasummary.com', 'http://localhost:3000'], // Allow both production and development
  methods: ['GET', 'POST'],
  credentials: true
}));

app.use(express.json());

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || "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"
});

const SYSTEM_PROMPT = "You are Theta, an AI tutor created by Theta Summary. You are helpful, patient, and aim to explain concepts clearly and encourage learning.";
const MODEL_NAME = "gpt-4o-mini";
const MAX_TOKENS = 1024;

// Chatbot route
app.post('/chat', async (req, res) => {
  try {
    const { message, history = [] } = req.body;

    if (!message) {
      return res.status(400).json({ error: 'No message provided' });
    }

    // Create messages for OpenAI API
    const messages = [
      { role: 'system', content: SYSTEM_PROMPT },
      ...history,
      { role: 'user', content: message }
    ];

    // Make request to OpenAI API
    const completion = await openai.chat.completions.create({
      model: MODEL_NAME,
      messages: messages,
      max_tokens: MAX_TOKENS,
      stream: false
    });

    const response = completion.choices[0].message.content;
    res.json({ response });

  } catch (error) {
    console.error('Chat error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Text-to-Speech endpoint
app.post('/tts', async (req, res) => {
  try {
    const { text } = req.body;
    
    if (!text) {
      return res.status(400).json({ error: 'No text provided' });
    }

    const voiceClient = new OpenAI({
      apiKey: process.env.OPENAI_VOICE_API_KEY || "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"
    });

    const audioResponse = await voiceClient.audio.speech.create({
      model: "tts-1",
      voice: "alloy",
      input: text
    });

    const audioBuffer = await audioResponse.arrayBuffer();
    res.set('Content-Type', 'audio/mpeg');
    res.send(Buffer.from(audioBuffer));

  } catch (error) {
    console.error('TTS error:', error);
    res.status(500).json({ error: 'Failed to generate speech' });
  }
});

// --- Wasabi Management Endpoints ---
app.post('/api/wasabi/scan', async (req, res) => {
  try {
    const { startPath } = req.body;
    const s3 = new AWS.S3({
      endpoint: 'https://s3.us-east-1.wasabisys.com',
      accessKeyId: process.env.WASABI_ACCESS_KEY,
      secretAccessKey: process.env.WASABI_SECRET_KEY,
      region: 'us-east-1'
    });

    const foundRecordings = [];
    const log = (message) => console.log(message);

    const scanPathRecursive = async (currentPath) => {
      try {
        log(`Deep scanning path: ${currentPath}`);
        const paginator = s3.getPaginator('listObjectsV2');
        const operationParameters = {
          Bucket: process.env.WASABI_BUCKET,
          Prefix: currentPath,
          Delimiter: '/'
        };

        for await (const page of paginator.paginate(operationParameters)) {
          if (page.Contents) {
            for (const obj of page.Contents) {
              const path = obj.Key;
              if (path.toLowerCase().endsWith('.mp3') || path.toLowerCase().endsWith('.wav') || path.toLowerCase().endsWith('.ogg')) {
                foundRecordings.push(path);
              }
            }
          }
          if (page.CommonPrefixes) {
            for (const prefix of page.CommonPrefixes) {
              await scanPathRecursive(prefix.Prefix);
            }
          }
        }
      } catch (error) {
        log(`Error scanning path '${currentPath}': ${error}`);
      }
    };

    await scanPathRecursive(startPath || '');
    res.json({ recordings: foundRecordings });
  } catch (error) {
    console.error('Error scanning Wasabi:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/wasabi/download', async (req, res) => {
  try {
    const { filePath } = req.body;
    if (!filePath) {
      return res.status(400).json({ error: 'No file path provided' });
    }

    const s3 = new AWS.S3({
      endpoint: 'https://s3.us-east-1.wasabisys.com',
      accessKeyId: process.env.WASABI_ACCESS_KEY,
      secretAccessKey: process.env.WASABI_SECRET_KEY,
      region: 'us-east-1'
    });

    const params = {
      Bucket: process.env.WASABI_BUCKET,
      Key: filePath
    };

    const url = await s3.getSignedUrlPromise('getObject', { ...params, Expires: 3600 });
    res.json({ downloadUrl: url });
  } catch (error) {
    console.error('Error generating download URL:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/wasabi/upload', async (req, res) => {
  try {
    const { filePath, fileContent } = req.body;
    if (!filePath || !fileContent) {
      return res.status(400).json({ error: 'File path and content are required' });
    }

    const s3 = new AWS.S3({
      endpoint: 'https://s3.us-east-1.wasabisys.com',
      accessKeyId: process.env.WASABI_ACCESS_KEY,
      secretAccessKey: process.env.WASABI_SECRET_KEY,
      region: 'us-east-1'
    });

    const params = {
      Bucket: process.env.WASABI_BUCKET,
      Key: filePath,
      Body: fileContent
    };

    await s3.upload(params).promise();

    // Respond to client immediately
    res.json({ message: 'File uploaded successfully' });

    // If the file is an audio recording, start summarization in the background
    if (filePath.match(/\.(mp3|m4a|wav|ogg)$/i)) {
      (async () => {
        try {
          // Get a presigned URL for the uploaded audio
          const audioUrl = await s3.getSignedUrlPromise('getObject', { Bucket: params.Bucket, Key: params.Key, Expires: 3600 });

          // Transcribe the audio
          const transcribeRes = await fetch('http://localhost:5000/api/transcribe', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ audioUrl })
          });
          const transcribeData = await transcribeRes.json();
          const transcript = transcribeData.transcript;

          // Summarize the transcript
          const summarizeRes = await fetch('http://localhost:5000/api/summarize', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              transcript,
              prompt: "You are a helpful assistant that summarizes educational content. Please summarize the following transcript in a clear, concise manner. Highlight key concepts, important examples, and main takeaways. Format the summary in LaTeX using appropriate LaTeX commands for mathematical expressions, equations, and formatting."
            })
          });
          const summarizeData = await summarizeRes.json();
          const summary = summarizeData.summary;

          // Generate summary file path
          const summaryPath = filePath.replace(/\/Recordings?\//, '/Summaries/').replace(/\.[^/.]+$/, '_summary.tex');

          // Upload the summary
          await s3.upload({
            Bucket: params.Bucket,
            Key: summaryPath,
            Body: summary
          }).promise();

          console.log('Automatic summary uploaded for', filePath);
        } catch (err) {
          console.error('Automatic summarization failed for', filePath, err);
        }
      })();
    }
  } catch (error) {
    console.error('Error uploading file:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// --- Transcription Endpoint ---
app.post('/api/transcribe', async (req, res) => {
  try {
    const { audioUrl } = req.body;
    if (!audioUrl) {
      return res.status(400).json({ error: 'No audio URL provided' });
    }

    // Download the audio file from Wasabi
    const response = await fetch(audioUrl);
    const audioBuffer = await response.buffer();

    // Create a temporary file
    const tempFilePath = path.join(os.tmpdir(), `audio-${Date.now()}.mp3`);
    fs.writeFileSync(tempFilePath, audioBuffer);

    // Transcribe using OpenAI Whisper
    const transcription = await openai.audio.transcriptions.create({
      file: fs.createReadStream(tempFilePath),
      model: "whisper-1",
    });

    // Clean up the temporary file
    fs.unlinkSync(tempFilePath);

    res.json({ transcript: transcription.text });
  } catch (error) {
    console.error('Error transcribing audio:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.use('/api/auth', require('./routes/auth'));

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
}); 