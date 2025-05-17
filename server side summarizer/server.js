const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const path = require('path');
const fs = require('fs');
const chokidar = require('chokidar');
const cheerio = require('cheerio');

const app = express();
const PORT = process.env.PORT || 3000;

// Store clients for server-sent events
let clients = [];
// Store watched folders
let watchers = {};
// Store processed files
const processedFiles = new Set();
// Path to store processed files tracking
const processedFilesPath = path.join(__dirname, 'processed-files.json');

// Load previously processed files
try {
    if (fs.existsSync(processedFilesPath)) {
        const data = fs.readFileSync(processedFilesPath, 'utf8');
        const files = JSON.parse(data);
        files.forEach(file => processedFiles.add(file));
        console.log(`Loaded ${processedFiles.size} previously processed files`);
    }
} catch (error) {
    console.error('Error loading processed files:', error);
}

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname)));

// DeepSeek API configuration
const DEEPSEEK_API_KEY = 'sk-29e8b6eb7fd346ba9c31ed953d8a0b13';
const DEEPSEEK_API_URL = 'https://api.deepseek.com/v1/chat/completions';

// API route for summarization
app.post('/api/summarize', async (req, res) => {
    try {
        const { transcript, prompt } = req.body;
        
        console.log('Received summarization request');
        
        if (!transcript) {
            console.log('Error: No transcript provided');
            return res.status(400).json({ error: 'Transcript is required' });
        }
        
        const defaultPrompt = "You are a helpful assistant that summarizes educational content. Please summarize the following transcript in a clear, concise manner. Highlight key concepts, important examples, and main takeaways. Format the summary in LaTeX.";
        const finalPrompt = prompt || defaultPrompt;
        
        console.log('Making request to DeepSeek API');
        console.log(`Using API key: ${DEEPSEEK_API_KEY.substring(0, 10)}...`);
        
        try {
            const response = await fetch(DEEPSEEK_API_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${DEEPSEEK_API_KEY}`
                },
                body: JSON.stringify({
                    model: "deepseek-reasoner",
                    messages: [
                        {
                            role: "user",
                            content: `${finalPrompt}\n\nTranscript:\n${transcript}`
                        }
                    ],
                    temperature: 0.7,
                    max_tokens: 4000
                })
            });
            
            const result = await response.json();
            
            console.log('DeepSeek API response status:', response.status);
            console.log('DeepSeek API response headers:', JSON.stringify([...response.headers.entries()]));
            
            if (!response.ok) {
                console.error('DeepSeek API error:', JSON.stringify(result));
                return res.status(response.status).json({ 
                    error: result.error?.message || 'Failed to generate summary' 
                });
            }
            
            console.log('DeepSeek API success, returning summary');
            res.json({ summary: result.choices[0].message.content });
        } catch (fetchError) {
            console.error('Fetch error during DeepSeek API call:', fetchError);
            return res.status(500).json({ error: 'Failed to connect to DeepSeek API' });
        }
    } catch (error) {
        console.error('Server error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// API route for folder watching
app.post('/api/watch-folder', (req, res) => {
    try {
        const { folderPath } = req.body;
        
        if (!folderPath) {
            return res.status(400).json({ error: 'Folder path is required' });
        }
        
        if (!fs.existsSync(folderPath)) {
            return res.status(404).json({ error: 'Folder not found' });
        }
        
        // Close previous watcher for this client if exists
        if (watchers[req.ip]) {
            watchers[req.ip].close();
        }
        
        // Set up watcher
        const watcher = chokidar.watch(folderPath, {
            ignored: /(^|[\/\\])\../, // Ignore dot files
            persistent: true
        });
        
        // Store watcher
        watchers[req.ip] = watcher;
        
        // Initial scan for txt files
        const txtFiles = [];
        fs.readdirSync(folderPath).forEach(file => {
            if (file.endsWith('.txt')) {
                const filePath = path.join(folderPath, file);
                txtFiles.push(filePath);
            }
        });
        
        // Set up event handlers for new files
        watcher.on('add', filePath => {
            if (filePath.endsWith('.txt') && !processedFiles.has(filePath)) {
                notifyClients({
                    type: 'new-file',
                    filePath
                });
            }
        });
        
        res.json({ 
            message: 'Folder watching started',
            files: txtFiles
        });
    } catch (error) {
        console.error('Error setting up folder watch:', error);
        res.status(500).json({ error: 'Server error setting up folder watch' });
    }
});

// API route for reading a file
app.get('/api/read-file', (req, res) => {
    try {
        const { path: filePath } = req.query;
        
        if (!filePath) {
            return res.status(400).send('File path is required');
        }
        
        if (!fs.existsSync(filePath)) {
            return res.status(404).send('File not found');
        }
        
        const content = fs.readFileSync(filePath, 'utf8');
        res.send(content);
    } catch (error) {
        console.error('Error reading file:', error);
        res.status(500).send('Error reading file');
    }
});

// Server-sent events endpoint for file notifications
app.get('/api/file-notifications', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    
    // Send initial ok message
    res.write(`data: ${JSON.stringify({ type: 'connected' })}\n\n`);
    
    // Add this client to the list
    const clientId = Date.now();
    const newClient = {
        id: clientId,
        res
    };
    
    clients.push(newClient);
    
    // When client closes connection, remove from list
    req.on('close', () => {
        console.log(`Client ${clientId} disconnected`);
        clients = clients.filter(client => client.id !== clientId);
    });
});

// Function to notify all connected clients
function notifyClients(data) {
    clients.forEach(client => {
        client.res.write(`data: ${JSON.stringify(data)}\n\n`);
    });
}

// Function to save processed files
function saveProcessedFiles() {
    const files = Array.from(processedFiles);
    fs.writeFileSync(processedFilesPath, JSON.stringify(files), 'utf8');
}

// Add file to processed list
app.post('/api/mark-processed', (req, res) => {
    const { filePath } = req.body;
    
    if (!filePath) {
        return res.status(400).json({ error: 'File path is required' });
    }
    
    processedFiles.add(filePath);
    saveProcessedFiles();
    
    res.json({ success: true });
});

// API route to verify DeepSeek API key
app.get('/api/verify-key', async (req, res) => {
    try {
        console.log('Verifying DeepSeek API key');
        console.log(`Using API key: ${DEEPSEEK_API_KEY.substring(0, 10)}...`);
        
        // Simple request to check if the API key is valid
        const response = await fetch('https://api.deepseek.com/v1/models', {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${DEEPSEEK_API_KEY}`
            }
        });
        
        const result = await response.json();
        
        console.log('DeepSeek API key verification status:', response.status);
        
        if (!response.ok) {
            console.error('DeepSeek API key verification error:', JSON.stringify(result));
            return res.status(response.status).json({ 
                valid: false,
                error: result.error?.message || 'Failed to verify API key'
            });
        }
        
        res.json({ 
            valid: true,
            models: result.data || []
        });
    } catch (error) {
        console.error('Error verifying API key:', error);
        res.status(500).json({ valid: false, error: 'Server error' });
    }
});

// API route to fetch and extract text from a URL
app.post('/api/fetch-url', async (req, res) => {
    try {
        const { url } = req.body;
        if (!url) {
            return res.status(400).json({ error: 'URL is required' });
        }
        
        console.log(`Fetching URL: ${url}`);
        const response = await fetch(url);
        if (!response.ok) {
            return res.status(response.status).json({ error: 'Failed to fetch URL' });
        }
        const html = await response.text();
        const $ = cheerio.load(html);
        // Extract text from paragraphs
        let text = '';
        $('p').each((i, el) => {
            text += $(el).text() + '\n';
        });
        text = text.trim();
        
        if (!text) {
            return res.status(422).json({ error: 'No text extracted from URL' });
        }
        
        res.json({ text });
    } catch (error) {
        console.error('Error fetching URL:', error);
        res.status(500).json({ error: 'Server error fetching URL' });
    }
});

// Start server
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`Open http://localhost:${PORT} in your browser`);
}); 