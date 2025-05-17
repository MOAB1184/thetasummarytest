document.addEventListener('DOMContentLoaded', () => {
    // API Configuration
    const API_URL = '/api/summarize';
    
    // DOM Elements
    const dropArea = document.getElementById('drop-area');
    const fileInput = document.getElementById('file-input');
    const fileInfo = document.getElementById('file-info');
    const fileName = document.getElementById('file-name');
    const removeFileBtn = document.getElementById('remove-file');
    const promptInput = document.getElementById('prompt-input');
    const summarizeBtn = document.getElementById('summarize-btn');
    const resultSection = document.getElementById('result-section');
    const summaryContent = document.getElementById('summary-content');
    const downloadBtn = document.getElementById('download-btn');
    const loadingOverlay = document.getElementById('loading-overlay');
    const loadingMessage = document.getElementById('loading-message');
    const verifyApiBtn = document.getElementById('verify-api-btn');
    const apiStatusIndicator = document.getElementById('api-status-indicator');
    
    // Make sure loading overlay is hidden on page load
    loadingOverlay.classList.add('hidden');
    loadingMessage.textContent = 'Processing...';
    
    // Variables to store data
    let uploadedFile = null;
    let fileContent = '';
    let generatedSummary = '';
    
    // Load saved prompt from localStorage
    loadSavedPrompt();
    // Set up Save Prompt button
    const savePromptBtn = document.getElementById('save-prompt-btn');
    // Enable save button when prompt is modified
    promptInput.addEventListener('input', () => {
        savePromptBtn.disabled = false;
    });
    // Handle Save Prompt click
    savePromptBtn.addEventListener('click', () => {
        localStorage.setItem('savedPrompt', promptInput.value);
        savePromptBtn.disabled = true;
        const info = document.querySelector('.prompt-info p');
        info.textContent = 'Prompt saved.';
        setTimeout(() => {
            info.textContent = "Customize your prompt, then click 'Save Prompt' to store it.";
        }, 3000);
    });
    
    // Event Listeners
    dropArea.addEventListener('dragover', handleDragOver);
    dropArea.addEventListener('dragleave', handleDragLeave);
    dropArea.addEventListener('drop', handleDrop);
    fileInput.addEventListener('change', handleFileSelect);
    removeFileBtn.addEventListener('click', removeFile);
    summarizeBtn.addEventListener('click', generateSummary);
    downloadBtn.addEventListener('click', downloadSummary);
    verifyApiBtn.addEventListener('click', verifyApiKey);
    
    // Verify API key on load
    verifyApiKey();
    
    // No folder monitoring on load
    
    // Helper function to load saved prompt
    function loadSavedPrompt() {
        const savedPrompt = localStorage.getItem('savedPrompt');
        if (savedPrompt) {
            promptInput.value = savedPrompt;
        }
    }
    
    // Debounce function for performance
    function debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            clearTimeout(timeout);
            timeout = setTimeout(() => func(...args), wait);
        };
    }
    
    // Handle file drag over
    function handleDragOver(e) {
        e.preventDefault();
        e.stopPropagation();
        dropArea.classList.add('highlight');
    }
    
    // Handle file drag leave
    function handleDragLeave(e) {
        e.preventDefault();
        e.stopPropagation();
        dropArea.classList.remove('highlight');
    }
    
    // Handle file drop
    function handleDrop(e) {
        e.preventDefault();
        e.stopPropagation();
        dropArea.classList.remove('highlight');
        
        const dt = e.dataTransfer;
        const files = dt.files;
        
        // Only allow single .txt file for manual processing
        if (files.length === 1 && files[0].type === 'text/plain') {
            processFile(files[0]);
        } else {
            alert('Please drop a single .txt file to manually summarize');
        }
    }
    
    // Handle manual file selection
    function handleFileSelect(e) {
        const files = e.target.files;
        if (files.length === 1 && files[0].type === 'text/plain') {
            processFile(files[0]);
        } else {
            alert('Please select a single .txt file');
        }
    }
    
    // Process the uploaded file: read content and update UI
    function processFile(file) {
        uploadedFile = file;
        fileName.textContent = file.name;
        fileInfo.classList.remove('hidden');
        summarizeBtn.disabled = false;
        
        const reader = new FileReader();
        reader.onload = function(event) {
            fileContent = event.target.result;
        };
        reader.readAsText(file);
    }
    
    // Remove uploaded file
    function removeFile() {
        uploadedFile = null;
        fileContent = '';
        fileName.textContent = '';
        fileInfo.classList.add('hidden');
        fileInput.value = '';
        summarizeBtn.disabled = true;
        resultSection.classList.add('hidden');
    }
    
    // Verify the DeepSeek API key
    async function verifyApiKey() {
        apiStatusIndicator.className = 'status-indicator';
        
        try {
            const response = await fetch('https://thetasummary.com/api/verify-key');
            const result = await response.json();
            
            if (result.valid) {
                apiStatusIndicator.classList.add('valid');
                console.log('API key is valid. Available models:', result.models);
            } else {
                apiStatusIndicator.classList.add('invalid');
                console.error('API key is invalid:', result.error);
                alert(`DeepSeek API key is invalid: ${result.error}`);
            }
        } catch (error) {
            apiStatusIndicator.classList.add('invalid');
            console.error('Error verifying API key:', error);
            alert('Error verifying DeepSeek API key. Check server logs.');
        }
    }
    
    // Generate summary using DeepSeek API via our server
    async function generateSummary(filePath = null) {
        if (!fileContent) {
            alert('Please upload a transcript file first');
            return;
        }
        
        loadingOverlay.classList.remove('hidden');
        resultSection.classList.add('hidden');
        
        try {
            // Prepare prompt
            const customPrompt = promptInput.value.trim();
            console.log('Sending request to summarize API');
            // Make API request via our server
            const response = await fetch(API_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    transcript: fileContent,
                    prompt: customPrompt
                })
            });
            
            const result = await response.json();
            
            if (!response.ok) {
                throw new Error(result.error || 'Failed to generate summary');
            }
            
            generatedSummary = result.summary;
            summaryContent.textContent = generatedSummary;
            resultSection.classList.remove('hidden');
            
            // Mark file as processed if it came from the watched folder
            if (filePath) {
                // markFileAsProcessed(filePath);
            }
        } catch (error) {
            console.error('Error:', error);
            alert(`Error: ${error.message || 'Failed to generate summary'}`);
        } finally {
            loadingOverlay.classList.add('hidden');
            console.log('Loading overlay hidden');
        }
    }
    
    // Download summary as .tex file
    function downloadSummary() {
        if (!generatedSummary) {
            alert('No summary to download');
            return;
        }
        
        const blob = new Blob([generatedSummary], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        
        // Generate filename from original file
        let downloadFilename = 'summary.tex';
        if (uploadedFile) {
            const originalName = uploadedFile.name.replace(/\.txt$/, '');
            downloadFilename = `${originalName}_summary.tex`;
        }
        
        a.href = url;
        a.download = downloadFilename;
        document.body.appendChild(a);
        a.click();
        
        // Cleanup
        setTimeout(() => {
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        }, 100);
    }
    
    // No server-sent events for file notifications
}); 