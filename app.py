from flask import Flask, render_template, request, jsonify, send_from_directory
from werkzeug.utils import secure_filename
import easyocr
import os
from datetime import datetime
import logging
import cv2
import numpy as np
import time
import secrets
import torch
import gc

# Initialize Flask app
app = Flask(__name__, static_url_path='/static')
app.config.update(
    UPLOAD_FOLDER='static/uploads',
    MAX_CONTENT_LENGTH=16 * 1024 * 1024,  # 16MB limit
    ALLOWED_EXTENSIONS={'png', 'jpg', 'jpeg', 'bmp', 'gif', 'tiff', 'pdf'},
    SECRET_KEY=secrets.token_hex(32)
)

# Configure torch for low-memory environments
torch.set_num_threads(1)

# Initialize EasyOCR reader (lazy load when needed)
reader = None

def get_reader():
    global reader
    if reader is None:
        reader = easyocr.Reader(
            ['en'],
            gpu=False,  # Explicitly disable GPU
            model_storage_directory='./model',
            download_enabled=True
        )
    return reader

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

def allowed_file(filename):
    """Check if the file has an allowed extension"""
    return '.' in filename and \
           filename.rsplit('.', 1)[1].lower() in app.config['ALLOWED_EXTENSIONS']

def clean_upload_folder():
    """Clean up old files in the upload folder"""
    now = datetime.now()
    for filename in os.listdir(app.config['UPLOAD_FOLDER']):
        file_path = os.path.join(app.config['UPLOAD_FOLDER'], filename)
        try:
            if os.path.isfile(file_path):
                file_time = datetime.fromtimestamp(os.path.getmtime(file_path))
                if (now - file_time).days > 1:  # Delete files older than 1 day
                    os.remove(file_path)
                    logger.info(f"Deleted old file: {filename}")
        except Exception as e:
            logger.error(f"Error deleting file {filename}: {e}")

def preprocess_image(image_path):
    """Preprocess image to improve OCR accuracy"""
    try:
        img = cv2.imread(image_path)
        if img is None:
            raise ValueError("Could not read image file")
            
        # Convert to grayscale
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        
        # Apply adaptive thresholding
        processed = cv2.adaptiveThreshold(
            gray, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, 
            cv2.THRESH_BINARY, 11, 2
        )
        
        # Save processed image temporarily
        processed_path = f"{image_path}_processed.jpg"
        cv2.imwrite(processed_path, processed)
        return processed_path
        
    except Exception as e:
        logger.error(f"Error preprocessing image: {e}")
        return None

@app.route('/')
def index():
    """Render the home page"""
    return render_template('index.html')

@app.route('/health')
def health_check():
    """Health check endpoint for Render"""
    return 'OK', 200

@app.route('/extract_text', methods=['POST'])
def extract_text():
    """Handle file upload and text extraction"""
    clean_upload_folder()
    
    if 'file' not in request.files:
        return jsonify({'error': 'No file part'}), 400
    
    file = request.files['file']
    
    if file.filename == '':
        return jsonify({'error': 'No file selected'}), 400
    
    if not allowed_file(file.filename):
        return jsonify({'error': 'File type not allowed'}), 400
    
    try:
        filename = secure_filename(file.filename)
        unique_filename = f"{int(time.time())}_{filename}"
        file_path = os.path.join(app.config['UPLOAD_FOLDER'], unique_filename)
        
        file.save(file_path)
        logger.info(f"File saved: {unique_filename}")
        
        try:
            processed_path = preprocess_image(file_path)
            input_image = processed_path if processed_path else file_path
            
            # Get OCR reader (lazy initialization)
            ocr_reader = get_reader()
            results = ocr_reader.readtext(input_image, detail=0)
            extracted_text = "\n".join(results).strip()
            
            # Clean up processed image if it exists
            if processed_path and os.path.exists(processed_path):
                os.remove(processed_path)
            
            # Clean up memory
            gc.collect()
            
            if not extracted_text:
                return jsonify({
                    'text': '',
                    'filename': unique_filename,
                    'warning': 'No text could be extracted'
                })
            
            return jsonify({
                'text': extracted_text,
                'filename': unique_filename
            })
            
        except Exception as e:
            logger.error(f"Processing error: {e}")
            return jsonify({'error': 'Error processing image'}), 500
            
    except Exception as e:
        logger.error(f"Upload error: {e}")
        return jsonify({'error': 'File upload failed'}), 500

@app.route('/download/<filename>')
def download_file(filename):
    """Serve uploaded files"""
    try:
        return send_from_directory(
            app.config['UPLOAD_FOLDER'],
            filename,
            as_attachment=True
        )
    except FileNotFoundError:
        return jsonify({'error': 'File not found'}), 404

@app.errorhandler(413)
def request_entity_too_large(error):
    return jsonify({'error': 'File too large (max 16MB)'}), 413

if __name__ == '__main__':
    os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)
    app.run(debug=False)  # Debug=False for production
