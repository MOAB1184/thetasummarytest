const { ipcRenderer } = require('electron');
const PDFDocument = require('pdfkit');
const pdfjsLib = require('pdfjs-dist');
pdfjsLib.GlobalWorkerOptions.workerSrc = require('pdfjs-dist/build/pdf.worker.js');

class PDFEditor {
    constructor(containerId) {
        this.container = document.getElementById(containerId);
        this.canvasList = [];
        this.ctxList = [];
        this.currentColor = '#000000';
        this.undoStackList = [];
        this.redoStackList = [];
        this.isDrawingList = [];
        this.lastXList = [];
        this.lastYList = [];
        this.currentPdf = null;
        this.currentPdfId = null;
        this.totalPages = 0;
        this.textMode = false;
        this.activeTextarea = null;

        // Read params from query string
        const params = new URLSearchParams(window.location.search);
        this.pdfId = params.get('pdfId');
        this.classCode = params.get('classCode');
        this.teacherEmail = params.get('teacherEmail');

        this.setupContainer();
        this.createUI();

        // If pdfId is in the query string, load it automatically
        if (this.pdfId) {
            this.loadPDF(this.pdfId);
        }
    }

    setupContainer() {
        // Clear container
        this.container.innerHTML = '';
        
        // Create a wrapper div for the entire editor
        this.editorWrapper = document.createElement('div');
        this.editorWrapper.style.cssText = `
            position: relative;
            width: 100%;
            height: 100%;
            overflow: hidden;
            background: #181c24;
        `;
        this.container.appendChild(this.editorWrapper);

        // Create a scrollable div for canvases
        this.pagesDiv = document.createElement('div');
        this.pagesDiv.style.cssText = 'overflow-y: auto; max-height: 90vh; padding: 20px 0; position: relative; background: #181c24;';
        this.editorWrapper.appendChild(this.pagesDiv);

        // Add a spacer div at the bottom of the content so the toolbar never covers content
        if (!document.getElementById('pdf-toolbar-spacer')) {
            const spacer = document.createElement('div');
            spacer.id = 'pdf-toolbar-spacer';
            spacer.style.width = '100%';
            spacer.style.height = '96px'; // match toolbar height + gap
            this.editorWrapper.appendChild(spacer);
        }
    }

    createUI() {
        // Color state
        this.textColor = '#000000';
        this.annotateColor = '#000000';
        this.currentColor = this.annotateColor;

        // Create toolbar
        const toolbar = document.createElement('div');
        toolbar.className = 'pdf-toolbar pdf-toolbar-dark';
        toolbar.style.cssText = `
            display: flex;
            flex-direction: row;
            align-items: flex-start;
            gap: 14px;
            padding: 12px 18px 0 18px;
            background: #181c24;
            border-top: 1px solid #222;
            position: fixed;
            left: 0;
            right: 0;
            bottom: 32px;
            height: 64px;
            z-index: 1001;
            width: 100vw;
            justify-content: center;
            box-shadow: 0 -2px 8px rgba(0,0,0,0.3);
            border-radius: 0;
        `;

        // Add Text button
        const textBtn = document.createElement('button');
        textBtn.textContent = 'Add Text';
        textBtn.className = 'toolbar-btn';
        textBtn.style.background = '#1976d2';
        textBtn.style.color = '#fff';
        textBtn.style.position = 'relative';
        textBtn.addEventListener('click', () => {
            this.textMode = true;
            this.currentColor = this.textColor;
            textBtn.style.background = '#1976d2';
            annotateBtn.style.background = '#232a36';
            console.log('[PDFEditor] Entered text mode');
        });

        // Annotate button
        const annotateBtn = document.createElement('button');
        annotateBtn.textContent = 'Annotate';
        annotateBtn.className = 'toolbar-btn';
        annotateBtn.style.background = '#232a36';
        annotateBtn.style.color = '#fff';
        annotateBtn.style.position = 'relative';
        annotateBtn.addEventListener('click', () => {
            this.textMode = false;
            this.currentColor = this.annotateColor;
            annotateBtn.style.background = '#1976d2';
            textBtn.style.background = '#232a36';
        });

        // Restore color pickers
        const textColorBtn = document.createElement('div');
        textColorBtn.style.cssText = `
            width: 32px;
            height: 32px;
            background: ${this.textColor};
            border: 2px solid #fff;
            border-radius: 6px;
            cursor: pointer;
            position: absolute;
            left: 50%;
            transform: translateX(-50%);
            top: 90%;
            margin-top: 4px;
            display: block;
        `;
        textBtn.appendChild(textColorBtn);

        const annotateColorBtn = document.createElement('div');
        annotateColorBtn.style.cssText = `
            width: 32px;
            height: 32px;
            background: ${this.annotateColor};
            border: 2px solid #fff;
            border-radius: 6px;
            cursor: pointer;
            position: absolute;
            left: 50%;
            transform: translateX(-50%);
            top: 90%;
            margin-top: 4px;
            display: block;
        `;
        annotateBtn.appendChild(annotateColorBtn);

        // Color picker popup logic
        let colorPickerPopup = null;
        const showColorPicker = (btn, initialColor, onChange) => {
            if (colorPickerPopup) colorPickerPopup.remove();
            const picker = document.createElement('div');
            const btnRect = btn.getBoundingClientRect();
            picker.style.position = 'absolute';
            picker.style.left = (btnRect.left - 10) + 'px';
            picker.style.top = (btnRect.top - 200 + window.scrollY) + 'px';
            picker.style.zIndex = 3000;
            picker.style.background = '#232a36';
            picker.style.padding = '12px';
            picker.style.borderRadius = '12px';
            picker.style.boxShadow = '0 4px 24px rgba(0,0,0,0.4)';
            picker.style.display = 'flex';
            picker.style.flexDirection = 'column';
            picker.style.alignItems = 'center';
            picker.style.border = '2px solid #1976d2';
            const colorPicker = document.createElement('hex-color-picker');
            colorPicker.setAttribute('color', initialColor);
            colorPicker.style.width = '180px';
            colorPicker.style.height = '180px';
            colorPicker.addEventListener('color-changed', (ev) => {
                const hex = ev.detail.value;
                onChange(hex);
            });
            picker.appendChild(colorPicker);
            // Close popup on click outside
            const closePopup = (event) => {
                if (!picker.contains(event.target) && event.target !== btn) {
                    picker.remove();
                    colorPickerPopup = null;
                    document.removeEventListener('mousedown', closePopup);
                }
            };
            document.addEventListener('mousedown', closePopup);
            document.body.appendChild(picker);
            colorPickerPopup = picker;
        };
        textColorBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            showColorPicker(textColorBtn, this.textColor, (hex) => {
                this.textColor = hex;
                textColorBtn.style.background = hex;
                if (this.textMode) this.currentColor = hex;
            });
        });
        annotateColorBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            showColorPicker(annotateColorBtn, this.annotateColor, (hex) => {
                this.annotateColor = hex;
                annotateColorBtn.style.background = hex;
                if (!this.textMode) this.currentColor = hex;
            });
        });

        // Add other buttons (undo, redo, save, download, close)
        const buttons = [
            { text: 'Undo', action: () => this.undo() },
            { text: 'Redo', action: () => this.redo() },
            { text: 'Save', action: () => this.save(), style: { background: '#43a047' } },
            { text: 'Download Edited PDF', action: () => this.download(), style: { background: '#1976d2' } },
            { text: 'Close', action: () => this.goBack(), style: { background: '#c62828' } }
        ];

        buttons.forEach(btn => {
            const button = document.createElement('button');
            button.textContent = btn.text;
            button.className = 'toolbar-btn';
            if (btn.style) Object.assign(button.style, btn.style);
            button.addEventListener('click', btn.action);
            toolbar.appendChild(button);
        });

        // Add buttons to toolbar
        toolbar.insertBefore(textBtn, toolbar.firstChild);
        toolbar.insertBefore(annotateBtn, toolbar.firstChild);

        // Style all toolbar buttons
        const toolbarBtns = toolbar.querySelectorAll('button');
        toolbarBtns.forEach(btn => {
            Object.assign(btn.style, {
                whiteSpace: 'nowrap',
                textAlign: 'center',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '1em',
                height: '38px',
                minWidth: '70px',
                padding: '0 14px',
                lineHeight: '1.2',
                color: '#fff',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer'
            });
        });

        this.editorWrapper.appendChild(toolbar);

        // Add spacing between color pickers and buttons
        textColorBtn.style.marginTop = '18px';
        annotateColorBtn.style.marginTop = '18px';
    }

    async loadPDF(pdfId) {
        try {
            this.currentPdfId = pdfId;
            const url = await ipcRenderer.invoke('get-pdf-url', { pdfId, classCode: this.classCode });
            const loadingTask = pdfjsLib.getDocument(url);
            this.currentPdf = await loadingTask.promise;
            this.totalPages = this.currentPdf.numPages;
            await this.renderAllPages();
        } catch (error) {
            console.error('Error loading PDF:', error);
        }
    }

    async renderAllPages() {
        // Clear previous canvases
        this.pagesDiv.innerHTML = '';
        this.canvasList = [];
        this.ctxList = [];
        this.undoStackList = [];
        this.redoStackList = [];
        this.isDrawingList = [];
        this.lastXList = [];
        this.lastYList = [];

        for (let i = 1; i <= this.totalPages; i++) {
            const page = await this.currentPdf.getPage(i);
            const viewport = page.getViewport({ scale: 1.5 });
            // Create a wrapper div for each canvas
            const canvasWrapper = document.createElement('div');
            canvasWrapper.style.position = 'relative';
            canvasWrapper.style.width = viewport.width + 'px';
            canvasWrapper.style.height = viewport.height + 'px';
            canvasWrapper.style.margin = '20px auto';
            canvasWrapper.style.boxShadow = '0 0 10px rgba(0,0,0,0.1)';
            // Create the canvas
            const canvas = document.createElement('canvas');
            canvas.width = viewport.width;
            canvas.height = viewport.height;
            canvas.style.display = 'block';
            // Append canvas to wrapper, then wrapper to pagesDiv
            canvasWrapper.appendChild(canvas);
            this.pagesDiv.appendChild(canvasWrapper);

            const ctx = canvas.getContext('2d');
            await page.render({ canvasContext: ctx, viewport }).promise;

            // Store references
            this.canvasList.push(canvas);
            this.ctxList.push(ctx);
            this.undoStackList.push([]);
            this.redoStackList.push([]);
            this.isDrawingList.push(false);
            this.lastXList.push(0);
            this.lastYList.push(0);

            // Attach drawing events
            this.setupCanvasEvents(canvas, i - 1);
        }
        // Always scroll to top after rendering all pages
        this.pagesDiv.scrollTop = 0;
    }

    setupCanvasEvents(canvas, idx) {
        canvas.addEventListener('mousedown', (e) => {
            if (this.textMode) {
                console.log(`[PDFEditor] Canvas click in text mode at (${e.offsetX}, ${e.offsetY}) on page index ${idx}`);
                e.stopPropagation();
                e.preventDefault();
                this.createTextInput(e, canvas, idx);
                return;
            }
            this.isDrawingList[idx] = true;
            [this.lastXList[idx], this.lastYList[idx]] = [e.offsetX, e.offsetY];
            this.saveState(idx);
        });

        canvas.addEventListener('mousemove', (e) => {
            if (!this.isDrawingList[idx] || this.textMode) return;
            const ctx = this.ctxList[idx];
            ctx.beginPath();
            ctx.moveTo(this.lastXList[idx], this.lastYList[idx]);
            ctx.lineTo(e.offsetX, e.offsetY);
            ctx.strokeStyle = this.annotateColor;
            ctx.lineWidth = 2;
            ctx.stroke();
            [this.lastXList[idx], this.lastYList[idx]] = [e.offsetX, e.offsetY];
        });

        canvas.addEventListener('mouseup', () => {
            this.isDrawingList[idx] = false;
        });

        canvas.addEventListener('mouseleave', () => {
            this.isDrawingList[idx] = false;
        });
    }

    createTextInput(e, canvas, idx) {
        // Remove any existing textarea
        if (this.activeTextarea) {
            console.log('[PDFEditor] Removing existing textarea');
            if (this.activeTextarea.parentNode) this.activeTextarea.parentNode.removeChild(this.activeTextarea);
        }

        // Find the canvas wrapper (parent of the canvas)
        const canvasWrapper = canvas.parentNode;
        const x = e.offsetX;
        const y = e.offsetY;
        const clickOffsetX = e.offsetX;
        const clickOffsetY = e.offsetY;
        console.log(`[PDFEditor] Creating textarea at (${x}, ${y}) relative to canvasWrapper`);

        // Create textarea
        const textarea = document.createElement('textarea');
        this.activeTextarea = textarea;
        textarea.value = '';
        textarea.rows = 1;
        textarea.placeholder = 'Type here...';
        Object.assign(textarea.style, {
            position: 'absolute',
            left: `${x}px`,
            top: `${y}px`,
            zIndex: 2000,
            background: 'rgba(24,28,36,0.3)', // semi-transparent
            color: this.textColor,
            border: '2px solid #1976d2',
            fontSize: '18px',
            padding: '6px 10px',
            borderRadius: '5px',
            fontFamily: 'inherit',
            minWidth: '120px',
            minHeight: '32px',
            outline: 'none',
            caretColor: this.textColor,
            resize: 'none',
            boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
            display: 'block',
        });

        // Add to canvasWrapper (so it's positioned relative to the correct page)
        canvasWrapper.appendChild(textarea);
        console.log('[PDFEditor] Textarea added to canvasWrapper and focused');
        setTimeout(() => {
            textarea.focus();
        }, 0);

        // Place text on Enter or blur
        const placeText = () => {
            if (!this.activeTextarea) return;
            console.log('[PDFEditor] placeText called');
            if (!textarea.value.trim()) {
                console.log('[PDFEditor] No text entered, removing textarea');
                if (textarea.parentNode) textarea.parentNode.removeChild(textarea);
                this.activeTextarea = null;
                return;
            }
            console.log(`[PDFEditor] Placing text: "${textarea.value}" at (${clickOffsetX}, ${clickOffsetY}) on page index ${idx}`);
            // Draw text onto the correct canvas at the correct offset (relative to that canvas)
            const ctx = this.ctxList[idx];
            ctx.save();
            ctx.font = '18px sans-serif';
            ctx.fillStyle = this.textColor;
            const lines = textarea.value.split('\n');
            lines.forEach((line, i) => {
                ctx.fillText(line, clickOffsetX, clickOffsetY + 18 + i * 22);
            });
            ctx.restore();
            this.saveState(idx);
            if (textarea.parentNode) textarea.parentNode.removeChild(textarea);
            this.activeTextarea = null;
        };

        textarea.addEventListener('keydown', (ev) => {
            console.log(`[PDFEditor] Textarea keydown: ${ev.key}`);
            if (ev.key === 'Enter' && !ev.shiftKey) {
                ev.preventDefault();
                placeText();
            } else if (ev.key === 'Escape') {
                console.log('[PDFEditor] Textarea escape pressed, removing');
                if (textarea.parentNode) textarea.parentNode.removeChild(textarea);
                this.activeTextarea = null;
            }
        });
        textarea.addEventListener('blur', () => {
            console.log('[PDFEditor] Textarea blur event');
            if (this.activeTextarea === textarea) {
                placeText();
            }
        });
    }

    saveState(idx) {
        const imageData = this.ctxList[idx].getImageData(0, 0, this.canvasList[idx].width, this.canvasList[idx].height);
        this.undoStackList[idx].push(imageData);
        this.redoStackList[idx] = [];
    }

    undo() {
        // Instantly remove any active textarea
        if (this.activeTextarea) {
            if (this.activeTextarea.parentNode) this.activeTextarea.parentNode.removeChild(this.activeTextarea);
            this.activeTextarea = null;
        }
        // Undo for all canvases
        for (let idx = 0; idx < this.canvasList.length; idx++) {
            if (this.undoStackList[idx].length > 0) {
                const currentState = this.ctxList[idx].getImageData(0, 0, this.canvasList[idx].width, this.canvasList[idx].height);
                this.redoStackList[idx].push(currentState);
                const previousState = this.undoStackList[idx].pop();
                this.ctxList[idx].putImageData(previousState, 0, 0);
            }
        }
    }

    redo() {
        // Instantly remove any active textarea
        if (this.activeTextarea) {
            if (this.activeTextarea.parentNode) this.activeTextarea.parentNode.removeChild(this.activeTextarea);
            this.activeTextarea = null;
        }
        // Redo for all canvases
        for (let idx = 0; idx < this.canvasList.length; idx++) {
            if (this.redoStackList[idx].length > 0) {
                const currentState = this.ctxList[idx].getImageData(0, 0, this.canvasList[idx].width, this.canvasList[idx].height);
                this.undoStackList[idx].push(currentState);
                const nextState = this.redoStackList[idx].pop();
                this.ctxList[idx].putImageData(nextState, 0, 0);
            }
        }
    }

    async save() {
        try {
            console.log('[PDFEditor] Starting save process...');
            console.log('[PDFEditor] Current PDF ID:', this.currentPdfId);
            // Create a multi-page PDF
            console.log('[PDFEditor] Creating PDF document...');
            const pdfDoc = new PDFDocument({ autoFirstPage: false });
            const chunks = [];
            pdfDoc.on('data', chunk => chunks.push(chunk));

            console.log('[PDFEditor] Adding pages to PDF...');
            for (let idx = 0; idx < this.canvasList.length; idx++) {
                const canvas = this.canvasList[idx];
                const imageData = canvas.toDataURL('image/png');
                pdfDoc.addPage({ size: [canvas.width, canvas.height] });
                pdfDoc.image(imageData, 0, 0, { width: canvas.width, height: canvas.height });
            }
            pdfDoc.end();

            // Wait for the PDF to finish writing
            await new Promise(resolve => pdfDoc.on('end', resolve));
            const pdfBuffer = Buffer.concat(chunks);
            const base64Data = pdfBuffer.toString('base64');
            console.log('[PDFEditor] PDF created successfully, size:', pdfBuffer.length);

            // Save to Wasabi, using the original PDF id for overwrite
            console.log('[PDFEditor] Preparing to save to Wasabi...');
            const saveParams = {
                teacherEmail: this.teacherEmail,
                classCode: this.classCode,
                summaryData: {
                    name: this.currentPdfId ? this.currentPdfId.split('/').pop() : `Edited_${Date.now()}.pdf`,
                    content: `data:application/pdf;base64,${base64Data}`,
                    type: 'pdf',
                    id: this.currentPdfId // pass the original id for overwrite
                }
            };
            console.log('[PDFEditor] Save parameters:', {
                teacherEmail: saveParams.teacherEmail,
                classCode: saveParams.classCode,
                summaryName: saveParams.summaryData.name,
                hasId: !!saveParams.summaryData.id
            });

            const result = await ipcRenderer.invoke('save-summary', saveParams);
            console.log('[PDFEditor] Save result:', result);

            if (result.success) {
                console.log('[PDFEditor] PDF saved successfully!');
                alert('PDF saved successfully!');
            } else {
                console.error('[PDFEditor] Failed to save PDF:', result.error);
                alert('Failed to save PDF: ' + (result.error || 'Unknown error'));
            }
        } catch (error) {
            console.error('[PDFEditor] Error saving PDF:', error);
            alert('Failed to save PDF. Please try again.');
        }
    }

    async download() {
        try {
            const url = await ipcRenderer.invoke('get-pdf-url', {
                pdfId: this.currentPdfId,
                schoolName: sessionStorage.getItem('userSchool'),
                teacherEmail: sessionStorage.getItem('userEmail'),
                classCode: this.classCode
            });
            if (url) {
                window.open(url, '_blank');
            } else {
                alert('Failed to generate download link');
            }
        } catch (error) {
            console.error('Error downloading PDF:', error);
            alert('Failed to download PDF. Please try again.');
        }
    }

    goBack() {
        // Instantly remove any active textarea
        if (this.activeTextarea) {
            if (this.activeTextarea.parentNode) this.activeTextarea.parentNode.removeChild(this.activeTextarea);
            this.activeTextarea = null;
        }
        window.close();
    }
}

// If running in pdf-editor.html, auto-initialize
if (document.getElementById('pdf-editor-container')) {
    window.pdfEditorInstance = new PDFEditor('pdf-editor-container');
}

module.exports = PDFEditor; 