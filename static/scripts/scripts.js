document.addEventListener('DOMContentLoaded', function() {
    // DOM Elements
    const dragArea = document.getElementById('dragArea');
    const fileInput = document.getElementById('fileInput');
    const progressBar = document.getElementById('progressBar');
    const progressBarInner = document.querySelector('.progress-bar');
    const fileInfo = document.getElementById('fileInfo');
    const fileName = document.getElementById('fileName');
    const fileSize = document.getElementById('fileSize');
    const previewImage = document.getElementById('previewImage');
    const resultContainer = document.getElementById('resultContainer');
    const extractedText = document.getElementById('extractedText');
    const copyBtn = document.getElementById('copyBtn');
    const downloadTextBtn = document.getElementById('downloadTextBtn');
    const downloadOriginalBtn = document.getElementById('downloadOriginalBtn');
    const clearBtn = document.getElementById('clearBtn');
    const copySuccessAlert = document.getElementById('copySuccessAlert');
    const errorAlert = document.getElementById('errorAlert');
    const warningAlert = document.getElementById('warningAlert');
    const loadingSpinner = document.getElementById('loadingSpinner');

    // Variables
    let currentFile = null;
    let progressInterval = null;
    let objectUrls = [];

    // Initialize
    initEventListeners();

    function initEventListeners() {
        // Drag and Drop Events
        dragArea.addEventListener('dragover', handleDragOver);
        dragArea.addEventListener('dragleave', handleDragLeave);
        dragArea.addEventListener('drop', handleDrop);
        dragArea.addEventListener('click', () => fileInput.click());
        dragArea.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                fileInput.click();
            }
        });

        // File input change
        fileInput.addEventListener('change', (e) => {
            if (e.target.files.length) {
                handleFileUpload(e.target.files[0]);
            }
        });

        // Action buttons
        copyBtn.addEventListener('click', copyTextToClipboard);
        downloadTextBtn.addEventListener('click', downloadTextFile);
        clearBtn.addEventListener('click', resetAll);
    }

    function handleDragOver(e) {
        e.preventDefault();
        dragArea.classList.add('active');
    }

    function handleDragLeave() {
        dragArea.classList.remove('active');
    }

    function handleDrop(e) {
        e.preventDefault();
        dragArea.classList.remove('active');
        
        if (e.dataTransfer.files.length) {
            handleFileUpload(e.dataTransfer.files[0]);
        }
    }

    async function handleFileUpload(file) {
        try {
            // Validate file
            if (!validateFile(file)) return;

            // Reset previous state
            resetPreview();
            hideAlerts();
            clearProgress();

            // Set current file
            currentFile = file;
            displayFileInfo(file);

            // Show preview if image
            if (file.type.startsWith('image/')) {
                await displayImagePreview(file);
            }

            // Show progress and process file
            simulateProgress();
            await processFile(file);
        } catch (error) {
            showError(error.message || 'An error occurred during file processing');
            resetPreview();
        }
    }

    function validateFile(file) {
        const validTypes = [
            'image/jpeg', 'image/png', 'image/gif', 
            'image/bmp', 'image/tiff', 'application/pdf',
            'image/jpg', 'image/webp' // Added more common types
        ];
        
        const validExtensions = /\.(jpe?g|png|gif|bmp|tiff?|pdf|webp)$/i;
        const maxSize = 16 * 1024 * 1024; // 16MB
        
        // Check if file type is valid or has valid extension
        const isTypeValid = validTypes.includes(file.type) || validExtensions.test(file.name);
        const isSizeValid = file.size <= maxSize;

        if (!isTypeValid) {
            showError('File type not supported. Please upload an image or PDF file.');
            return false;
        }
        
        if (!isSizeValid) {
            showError('File size exceeds 16MB limit. Please choose a smaller file.');
            return false;
        }

        return true;
    }

    function displayFileInfo(file) {
        fileName.textContent = file.name;
        fileSize.textContent = formatFileSize(file.size);
        fileInfo.style.display = 'block';
    }

    async function displayImagePreview(file) {
        return new Promise((resolve) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                previewImage.src = e.target.result;
                previewImage.style.display = 'block';
                resolve();
            };
            reader.readAsDataURL(file);
        });
    }

    function simulateProgress() {
        progressBar.style.display = 'block';
        let width = 0;
        
        progressInterval = setInterval(() => {
            width += 10;
            progressBarInner.style.width = `${width}%`;
            
            if (width >= 100) {
                clearProgress();
            }
        }, 100);
    }

    function clearProgress() {
        if (progressInterval) {
            clearInterval(progressInterval);
            progressInterval = null;
        }
        progressBar.style.display = 'none';
        progressBarInner.style.width = '0%';
    }

    async function processFile(file) {
        const formData = new FormData();
        formData.append('file', file);
        
        loadingSpinner.style.display = 'block';
        resultContainer.style.display = 'block';
        extractedText.value = '';
        
        try {
            const response = await fetch('/extract_text', {
                method: 'POST',
                body: formData
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.error || 'Server error occurred');
            }

            const data = await response.json();

            loadingSpinner.style.display = 'none';

            if (data.error) {
                throw new Error(data.error);
            }

            if (data.warning) {
                showWarning(data.warning);
            }

            extractedText.value = data.text || 'No text was extracted';

            if (data.filename) {
                const url = `/download/${data.filename}`;
                downloadOriginalBtn.href = url;
                downloadOriginalBtn.style.display = 'inline-block';
            }

            setTimeout(() => {
                resultContainer.scrollIntoView({ behavior: 'smooth' });
            }, 100);
        } catch (error) {
            loadingSpinner.style.display = 'none';
            resultContainer.style.display = 'none';
            throw error;
        }
    }

    async function copyTextToClipboard() {
        try {
            await navigator.clipboard.writeText(extractedText.value);
            showTemporaryAlert(copySuccessAlert);
        } catch (err) {
            showError('Failed to copy text. Please try again.');
        }
    }

    function downloadTextFile() {
        const text = extractedText.value;
        if (!text.trim()) {
            showError('No text to download');
            return;
        }

        const blob = new Blob([text], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        objectUrls.push(url); // Track for cleanup

        const a = document.createElement('a');
        a.href = url;
        a.download = currentFile ? 
            `${currentFile.name.replace(/\.[^/.]+$/, '')}_extracted.txt` : 
            'extracted_text.txt';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    }

    function resetAll() {
        // Reset file input
        fileInput.value = '';
        
        // Hide file info and preview
        fileInfo.style.display = 'none';
        resetPreview();
        
        // Hide result container
        resultContainer.style.display = 'none';
        
        // Clear text
        extractedText.value = '';
        
        // Reset current file
        currentFile = null;
        
        // Hide alerts
        hideAlerts();
        
        // Clear progress
        clearProgress();
        
        // Cleanup object URLs
        cleanupObjectUrls();
    }

    function resetPreview() {
        previewImage.src = '';
        previewImage.style.display = 'none';
        downloadOriginalBtn.style.display = 'none';
    }

    function hideAlerts() {
        errorAlert.style.display = 'none';
        warningAlert.style.display = 'none';
        copySuccessAlert.style.display = 'none';
    }

    function showError(message) {
        errorAlert.textContent = message;
        errorAlert.style.display = 'block';
        errorAlert.focus();
    }

    function showWarning(message) {
        warningAlert.textContent = message;
        warningAlert.style.display = 'block';
    }

    function showTemporaryAlert(alertElement, duration = 3000) {
        alertElement.style.display = 'block';
        setTimeout(() => {
            alertElement.style.display = 'none';
        }, duration);
    }

    function cleanupObjectUrls() {
        objectUrls.forEach(url => URL.revokeObjectURL(url));
        objectUrls = [];
    }

    function formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
    }
});