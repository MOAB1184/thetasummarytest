import sys
import os
from datetime import datetime
from pathlib import Path
import boto3
from dotenv import load_dotenv
from PySide6.QtWidgets import (QApplication, QMainWindow, QWidget, QVBoxLayout, QHBoxLayout,
                           QPushButton, QFileDialog, QTextEdit, QLabel, 
                           QProgressBar, QMessageBox, QSpinBox, QListWidgetItem, QLineEdit)
from PySide6.QtCore import Qt, QThread, Signal, QTimer
from sqlalchemy import create_engine, Column, String, DateTime, Integer
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker

# Load environment variables
load_dotenv()

# Database setup
Base = declarative_base()

class ProcessedFile(Base):
    __tablename__ = 'processed_files'
    id = Column(Integer, primary_key=True)
    file_path = Column(String)
    operation = Column(String)  # 'download' or 'upload'
    processed_at = Column(DateTime, default=datetime.utcnow)
    local_timestamp = Column(String, nullable=True)  # Store the timestamp used in local filename

# Create database engine and tables
engine = create_engine('sqlite:///processed_files.db')
# Only create tables if they don't exist
Base.metadata.create_all(engine)
Session = sessionmaker(bind=engine)

class WasabiWorker:
    def __init__(self, operation, source_path=None, destination_path=None, start_path=None):
        self.operation = operation
        self.source_path = source_path
        self.destination_path = destination_path
        self.start_path = start_path
        self.session = Session()
        self.found_recordings = []
        self.progress_callback = None
        self.finished_callback = None
        self.error_callback = None

    def set_callbacks(self, progress_cb, finished_cb, error_cb):
        self.progress_callback = progress_cb
        self.finished_callback = finished_cb
        self.error_callback = error_cb

    def log(self, message):
        if self.progress_callback:
            self.progress_callback(message)

    def error(self, message):
        if self.error_callback:
            self.error_callback(message)

    def start(self):
        try:
            # Initialize Wasabi client
            s3 = boto3.client(
                's3',
                endpoint_url='https://s3.us-east-1.wasabisys.com',
                aws_access_key_id=os.getenv('WASABI_ACCESS_KEY'),
                aws_secret_access_key=os.getenv('WASABI_SECRET_KEY'),
                region_name='us-east-1'
            )

            if self.operation == 'scan':
                self._scan_wasabi(s3)
            elif self.operation == 'download':
                self._download_files(s3)
            elif self.operation == 'upload':
                self._upload_files(s3)

        except Exception as e:
            self.error(str(e))
        finally:
            self.session.close()
            if self.finished_callback:
                self.finished_callback()

    def _is_audio_file(self, filename):
        """Check if the file is an audio file based on extension."""
        audio_extensions = {'.mp3', '.wav', '.ogg', '.m4a', '.aac', '.wma', '.flac', '.alac', '.aiff'}
        return any(filename.lower().endswith(ext) for ext in audio_extensions)

    def _get_summary_path(self, path):
        """Convert a recording path to its corresponding summary path"""
        # Split the path into parts
        path_parts = path.split('/')
        
        # Replace the last folder with 'summaries'
        if len(path_parts) > 1:
            path_parts[-2] = 'summaries'
        else:
            path_parts.insert(-1, 'summaries')
            
        # Add _summary to the filename and change extension to .pdf
        if '.' in path_parts[-1]:
            base_name = os.path.splitext(path_parts[-1])[0]
            path_parts[-1] = f"{base_name}_summary.pdf"
            
        return '/'.join(path_parts)

    def _scan_wasabi(self, s3):
        try:
            # First try to list buckets
            try:
                buckets = s3.list_buckets()
                total_buckets = len(buckets['Buckets'])
                self.log(f"Found {total_buckets} buckets. Starting scan...")
                
                self.found_recordings = []
                buckets_scanned = 0
                
                # Try to scan each bucket
                for bucket in buckets['Buckets']:
                    bucket_name = bucket['Name']
                    buckets_scanned += 1
                    self.log(f"Scanning bucket {buckets_scanned}/{total_buckets}: {bucket_name}")
                    
                    try:
                        # Get the bucket's region
                        bucket_location = s3.get_bucket_location(Bucket=bucket_name)
                        region = bucket_location['LocationConstraint'] or 'us-east-1'  # None means us-east-1
                        
                        # Create a new client for this specific region
                        bucket_s3 = boto3.client(
                            's3',
                            endpoint_url=f'https://s3.{region}.wasabisys.com',
                            aws_access_key_id=os.getenv('WASABI_ACCESS_KEY'),
                            aws_secret_access_key=os.getenv('WASABI_SECRET_KEY'),
                            region_name=region
                        )
                        
                        def scan_path_recursive(current_path):
                            """Recursively scan a path and all its subdirectories"""
                            try:
                                self.log(f"Deep scanning path: {current_path}")
                                
                                # Get all objects in current path
                                paginator = bucket_s3.get_paginator('list_objects_v2')
                                operation_parameters = {
                                    'Bucket': bucket_name,
                                    'Prefix': current_path,
                                    'Delimiter': '/'
                                }
                                
                                # First, check for recordings in current path
                                for page in paginator.paginate(**operation_parameters):
                                    if 'Contents' in page:
                                        for obj in page['Contents']:
                                            path = obj['Key']
                                            if self._is_audio_file(path):
                                                full_path = f"{bucket_name}/{path}"
                                                self.log(f"Found recording: {full_path}")
                                                # Add to found recordings instead of downloading immediately
                                                self.found_recordings.append(full_path)
                                
                                # Then, recursively scan all subdirectories
                                for page in paginator.paginate(**operation_parameters):
                                    if 'CommonPrefixes' in page:
                                        for prefix in page['CommonPrefixes']:
                                            subdir = prefix['Prefix']
                                            # Recursively scan this subdirectory
                                            scan_path_recursive(subdir)
                                            
                            except Exception as scan_error:
                                self.log(f"Error scanning path '{current_path}': {str(scan_error)}")
                        
                        # Start recursive scan from the specified path
                        if self.start_path:
                            start_path = self.start_path.strip()
                            if not start_path.endswith('/'):
                                start_path += '/'
                            scan_path_recursive(start_path)
                        else:
                            scan_path_recursive('')  # Start from root
                        
                        self.log(f"Completed deep scan of bucket '{bucket_name}' in region {region}")
                        
                    except Exception as bucket_error:
                        self.log(f"Error accessing bucket '{bucket_name}': {str(bucket_error)}")
                        continue
                
                summary = f"Deep scan complete. Scanned {buckets_scanned} buckets."
                self.log(summary)
                
            except Exception as e:
                self.error(f"Failed to list buckets. Error: {str(e)}")
                return

        except Exception as e:
            self.error(f"Error during Wasabi scan: {str(e)}")

    def _download_files(self, s3):
        try:
            files_downloaded = 0
            files_skipped = 0
            
            for path in self.found_recordings:
                if self._is_audio_file(path):
                    # Check if file already processed in database
                    if self.session.query(ProcessedFile).filter_by(
                        file_path=path, operation='download').first():
                        self.log(f"Skipping {path} - already in database")
                        files_skipped += 1
                        continue

                    try:
                        # Split path into bucket and key
                        parts = path.split('/')
                        bucket_name = parts[0]
                        object_key = '/'.join(parts[1:])
                        
                        # Create a safe filename from the path
                        safe_filename = object_key.replace('/', '_')
                        local_path = os.path.join(self.destination_path, safe_filename)

                        # If file already exists with this name, skip it and record in database
                        if os.path.exists(local_path):
                            self.log(f"Skipping {path} - file already exists locally")
                            
                            # Record in database to prevent future attempts
                            processed_file = ProcessedFile(
                                file_path=path,  # Original Wasabi path
                                operation='download',
                                local_timestamp=os.path.splitext(safe_filename)[0]  # Store filename without extension
                            )
                            self.session.add(processed_file)
                            self.session.commit()
                            
                            files_skipped += 1
                            continue

                        # Get the bucket's region
                        try:
                            bucket_location = s3.get_bucket_location(Bucket=bucket_name)
                            region = bucket_location['LocationConstraint'] or 'us-east-1'  # None means us-east-1
                            
                            # Create a new client for this specific region
                            bucket_s3 = boto3.client(
                                's3',
                                endpoint_url=f'https://s3.{region}.wasabisys.com',
                                aws_access_key_id=os.getenv('WASABI_ACCESS_KEY'),
                                aws_secret_access_key=os.getenv('WASABI_SECRET_KEY'),
                                region_name=region
                            )
                        except Exception as region_error:
                            self.log(f"Error getting region for bucket {bucket_name}, using default: {str(region_error)}")
                            bucket_s3 = s3  # Use default client if region-specific fails

                        # Ensure download directory exists
                        os.makedirs(self.destination_path, exist_ok=True)
                        
                        # Try downloading with region-specific client first
                        try:
                            bucket_s3.download_file(bucket_name, object_key, local_path)
                        except Exception as download_error:
                            if bucket_s3 != s3:  # If using region-specific client failed, try with default
                                self.log(f"Region-specific download failed, trying with default client: {str(download_error)}")
                                s3.download_file(bucket_name, object_key, local_path)
                            else:
                                raise  # Re-raise the error if we're already using the default client
                        
                        # Record successful download with original path and local filename
                        processed_file = ProcessedFile(
                            file_path=path,  # Original Wasabi path
                            operation='download',
                            local_timestamp=os.path.splitext(safe_filename)[0]  # Store filename without extension
                        )
                        self.session.add(processed_file)
                        self.session.commit()
                        
                        self.log(f"Successfully downloaded: {path} as {safe_filename}")
                        files_downloaded += 1
                        
                    except Exception as download_error:
                        self.log(f"Failed to download {path}: {str(download_error)}")
                    
            self.log(f"Download complete. Downloaded {files_downloaded} files, skipped {files_skipped} files.")
                    
        except Exception as e:
            self.log(f"Error in download process: {str(e)}")

    def _upload_files(self, s3):
        try:
            # Get list of PDF files in the source directory
            pdf_files = [f for f in os.listdir(self.source_path) if f.endswith('.pdf')]
            
            if pdf_files:
                self.log(f"Found {len(pdf_files)} PDF files to process")
            
            # Get all downloaded files from database for matching
            downloaded_files = self.session.query(ProcessedFile).filter_by(
                operation='download'
            ).all()
            
            for pdf_file in pdf_files:
                try:
                    # Get the base name without .pdf extension
                    base_name = os.path.splitext(pdf_file)[0]
                    
                    # Try to extract path components from the filename
                    path_components = base_name.split('_')
                    
                    # Try to reconstruct the original path
                    if len(path_components) >= 6:  # Minimum components needed for a valid path
                        # Get the file ID (last component)
                        file_id = path_components[-1]
                        
                        # Find matching audio file by checking if file ID is in the path
                        original_path = None
                        for downloaded_file in downloaded_files:
                            if file_id in downloaded_file.file_path:
                                original_path = downloaded_file
                                break
                        
                        if original_path:
                            # Convert to summary path
                            summary_path = self._get_summary_path(original_path.file_path)
                            
                            # Check if summary already uploaded
                            if self.session.query(ProcessedFile).filter_by(
                                file_path=summary_path, operation='upload').first():
                                self.log(f"Skipping {summary_path} - already uploaded")
                                continue
                            
                            # Get bucket and key
                            parts = summary_path.split('/')
                            bucket_name = parts[0]
                            object_key = '/'.join(parts[1:])
                            
                            # Get the bucket's region
                            try:
                                bucket_location = s3.get_bucket_location(Bucket=bucket_name)
                                region = bucket_location['LocationConstraint'] or 'us-east-1'
                                
                                # Create a new client for this specific region
                                bucket_s3 = boto3.client(
                                    's3',
                                    endpoint_url=f'https://s3.{region}.wasabisys.com',
                                    aws_access_key_id=os.getenv('WASABI_ACCESS_KEY'),
                                    aws_secret_access_key=os.getenv('WASABI_SECRET_KEY'),
                                    region_name=region
                                )
                            except Exception as region_error:
                                self.log(f"Error getting region for bucket {bucket_name}, using default: {str(region_error)}")
                                bucket_s3 = s3
                            
                            # Upload the PDF file
                            local_path = os.path.join(self.source_path, pdf_file)
                            try:
                                bucket_s3.upload_file(
                                    local_path, 
                                    bucket_name, 
                                    object_key,
                                    ExtraArgs={'ACL': 'public-read'}
                                )
                                
                                # Record successful upload
                                processed_file = ProcessedFile(
                                    file_path=summary_path,
                                    operation='upload',
                                    local_timestamp=base_name
                                )
                                self.session.add(processed_file)
                                self.session.commit()
                                
                                self.log(f"Successfully uploaded summary: {summary_path}")
                                
                            except Exception as upload_error:
                                if bucket_s3 != s3:
                                    self.log(f"Region-specific upload failed, trying with default client: {str(upload_error)}")
                                    s3.upload_file(local_path, bucket_name, object_key)
                                else:
                                    raise
                        else:
                            # Log the attempted match for debugging
                            self.log(f"No matching audio file found for {pdf_file} (ID: {file_id})")
                    else:
                        self.log(f"Invalid filename format for {pdf_file}. Expected format: path_components_filename.pdf")
                        
                except Exception as upload_error:
                    self.log(f"Failed to upload {pdf_file}: {str(upload_error)}")
                    
        except Exception as e:
            self.log(f"Error in upload process: {str(e)}")

class MainWindow(QMainWindow):
    def __init__(self):
        super().__init__()
        self.setWindowTitle("Wasabi Recording Manager")
        self.setGeometry(100, 100, 800, 600)
        
        # Create central widget and layout
        central_widget = QWidget()
        self.setCentralWidget(central_widget)
        layout = QVBoxLayout(central_widget)

        # Add starting path input and scan button
        path_layout = QHBoxLayout()
        self.path_input = QLineEdit()
        self.path_input.setPlaceholderText("Enter starting path (e.g., folder1/subfolder/) or leave empty for full scan")
        self.scan_button = QPushButton("Start Scan")
        self.scan_button.clicked.connect(self.start_scan)
        path_layout.addWidget(QLabel("Starting Path:"))
        path_layout.addWidget(self.path_input)
        path_layout.addWidget(self.scan_button)
        layout.addLayout(path_layout)

        # Create UI elements
        self.status_label = QLabel("Ready")
        self.progress_bar = QProgressBar()
        self.log_text = QTextEdit()
        self.log_text.setReadOnly(True)

        # Create path selection layout
        paths_layout = QVBoxLayout()
        
        # Download path selection
        download_layout = QHBoxLayout()
        self.download_path_label = QLabel("Auto-download path: Not set")
        self.set_download_path_button = QPushButton("Set Download Path")
        download_layout.addWidget(self.download_path_label)
        download_layout.addWidget(self.set_download_path_button)
        
        # Upload path selection
        upload_layout = QHBoxLayout()
        self.upload_path_label = QLabel("Auto-upload path: Not set")
        self.set_upload_path_button = QPushButton("Set Upload Path")
        upload_layout.addWidget(self.upload_path_label)
        upload_layout.addWidget(self.set_upload_path_button)
        
        paths_layout.addLayout(download_layout)
        paths_layout.addLayout(upload_layout)

        # Create refresh rate controls
        refresh_layout = QHBoxLayout()
        refresh_label = QLabel("Auto-scan interval (minutes):")
        self.refresh_rate = QSpinBox()
        self.refresh_rate.setRange(1, 60)  # 1 minute to 60 minutes
        self.refresh_rate.setValue(5)  # Default 5 minutes
        self.auto_scan_button = QPushButton("Start Auto-Processing")
        self.auto_scan_button.setCheckable(True)
        refresh_layout.addWidget(refresh_label)
        refresh_layout.addWidget(self.refresh_rate)
        refresh_layout.addWidget(self.auto_scan_button)
        refresh_layout.addStretch()

        # Add widgets to layout
        layout.addWidget(self.status_label)
        layout.addWidget(self.progress_bar)
        layout.addLayout(paths_layout)
        layout.addLayout(refresh_layout)
        layout.addWidget(self.log_text)

        # Connect signals
        self.auto_scan_button.clicked.connect(self.toggle_auto_scan)
        self.set_download_path_button.clicked.connect(self.set_download_path)
        self.set_upload_path_button.clicked.connect(self.set_upload_path)
        self.refresh_rate.valueChanged.connect(self.update_timer)

        # Initialize paths
        self.download_path = None
        self.upload_path = None

        # Initialize worker and timer
        self.current_worker = None
        self.scan_timer = QTimer()
        self.scan_timer.timeout.connect(self.start_scan)

        # Add local scan timer
        self.local_scan_timer = QTimer()
        self.local_scan_timer.timeout.connect(self.check_local_files)
        self.local_scan_timer.setInterval(10000)  # 10 seconds
        self.previously_found_files = set()

    def log_message(self, message):
        self.log_text.append(f"{datetime.now().strftime('%Y-%m-%d %H:%M:%S')} - {message}")

    def set_download_path(self):
        folder = QFileDialog.getExistingDirectory(self, "Select Auto-Download Destination")
        if folder:
            self.download_path = folder
            self.download_path_label.setText(f"Auto-download path: {folder}")

    def set_upload_path(self):
        folder = QFileDialog.getExistingDirectory(self, "Select Auto-Upload Source")
        if folder:
            self.upload_path = folder
            self.upload_path_label.setText(f"Auto-upload path: {folder}")

    def toggle_auto_scan(self, checked):
        if checked:
            if not self.download_path or not self.upload_path:
                QMessageBox.warning(self, "Warning", "Please set both download and upload paths first!")
                self.auto_scan_button.setChecked(False)
                return

            self.auto_scan_button.setText("Stop Auto-Processing")
            self.refresh_rate.setEnabled(False)
            self.set_download_path_button.setEnabled(False)
            self.set_upload_path_button.setEnabled(False)
            self.start_scan()  # Start first scan immediately
            self.scan_timer.start(self.refresh_rate.value() * 60 * 1000)  # Convert minutes to milliseconds
            self.local_scan_timer.start()  # Start local file scanning
        else:
            self.auto_scan_button.setText("Start Auto-Processing")
            self.refresh_rate.setEnabled(True)
            self.set_download_path_button.setEnabled(True)
            self.set_upload_path_button.setEnabled(True)
            self.scan_timer.stop()
            self.local_scan_timer.stop()

    def update_timer(self):
        if self.scan_timer.isActive():
            self.scan_timer.setInterval(self.refresh_rate.value() * 60 * 1000)

    def start_scan(self):
        if self.current_worker is not None:
            return  # Don't start a new scan if one is already running
        
        # Check if download path is set
        if not self.download_path:
            QMessageBox.warning(self, "Warning", "Please set the download path first!")
            return
            
        # Get the starting path from the input field
        start_path = self.path_input.text().strip()
        
        # Create and configure the worker
        self.current_worker = WasabiWorker('scan', destination_path=self.download_path, start_path=start_path)
        self.current_worker.set_callbacks(
            progress_cb=self.log_message,
            finished_cb=self.scan_finished,
            error_cb=self.handle_error
        )
        
        # Start the scan
        self.current_worker.start()
        self.status_label.setText("Scanning for recordings...")
        self.progress_bar.setRange(0, 0)
        self.scan_button.setEnabled(False)

    def scan_finished(self):
        self.scan_button.setEnabled(True)  # Re-enable scan button
        if self.current_worker and self.current_worker.found_recordings:
            # Start download operation
            self.start_download(self.current_worker.found_recordings)
        else:
            self.operation_finished()

    def start_download(self, recordings):
        if not recordings:
            self.operation_finished()
            return

        self.current_worker = WasabiWorker('download', destination_path=self.download_path)
        self.current_worker.found_recordings = recordings
        self.current_worker.set_callbacks(
            progress_cb=self.log_message,
            finished_cb=self.download_finished,
            error_cb=self.handle_error
        )
        
        self.current_worker.start()
        self.status_label.setText("Downloading recordings...")
        self.progress_bar.setRange(0, 0)

    def download_finished(self):
        # Start upload operation
        self.start_upload()

    def start_upload(self):
        self.current_worker = WasabiWorker('upload', source_path=self.upload_path)
        self.current_worker.set_callbacks(
            progress_cb=self.log_message,
            finished_cb=self.operation_finished,
            error_cb=self.handle_error
        )
        
        self.current_worker.start()
        self.status_label.setText("Uploading summaries...")
        self.progress_bar.setRange(0, 0)

    def operation_finished(self):
        # Clean up the finished worker
        if self.current_worker:
            self.current_worker = None
        
        # Update UI
        self.status_label.setText("Operation completed")
        self.progress_bar.setRange(0, 100)
        self.progress_bar.setValue(100)
        
        self.scan_button.setEnabled(True)  # Re-enable scan button

    def handle_error(self, error_message):
        self.status_label.setText("Error occurred")
        self.progress_bar.setRange(0, 100)
        self.progress_bar.setValue(0)
        self.log_message(f"Error: {error_message}")
        QMessageBox.critical(self, "Error", error_message)
        if self.auto_scan_button.isChecked():
            self.auto_scan_button.click()  # Stop auto-scan on error

    def check_local_files(self):
        """Scan local storage every 10 seconds for new files to upload"""
        if not self.upload_path:
            return

        current_files = set()
        for file_name in os.listdir(self.upload_path):
            if file_name.endswith(('.txt', '.doc', '.docx', '.pdf')):
                current_files.add(file_name)

        # Find new files
        new_files = current_files - self.previously_found_files
        if new_files:
            self.log_message(f"Found {len(new_files)} new summary files. Starting upload...")
            self.start_upload_specific(list(new_files))

        self.previously_found_files = current_files

    def start_upload_specific(self, specific_files):
        self.current_worker = WasabiWorker('upload', source_path=self.upload_path)
        self.current_worker.specific_files = specific_files
        self.current_worker.set_callbacks(
            progress_cb=self.log_message,
            finished_cb=self.operation_finished,
            error_cb=self.handle_error
        )
        
        self.current_worker.start()
        self.status_label.setText("Uploading new summaries...")
        self.progress_bar.setRange(0, 0)

    def closeEvent(self, event):
        # Stop timers only
        if hasattr(self, 'scan_timer'):
            self.scan_timer.stop()
        if hasattr(self, 'local_scan_timer'):
            self.local_scan_timer.stop()
        event.accept()

if __name__ == '__main__':
    app = QApplication(sys.argv)
    window = MainWindow()
    window.show()
    app.exec() 