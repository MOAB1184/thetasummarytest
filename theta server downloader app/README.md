# Theta Recording Manager

A desktop application for managing audio recordings and their summaries in Wasabi Cloud Storage, specifically designed for the Theta platform.

## Features

- Scan all folders in Wasabi Cloud Storage for recordings
- Download files from 'Recording' or 'Recordings' folders (case-insensitive)
- Upload summaries to corresponding 'Summary' or 'Summaries' folders
- Maintain original folder structure
- Prevent duplicate downloads and uploads
- Progress tracking and logging
- User-friendly GUI interface

## Prerequisites

- Python 3.8 or higher
- Wasabi Cloud Storage account and credentials
- Theta platform access

## Installation

1. Clone this repository or download the source code
2. Install the required dependencies:
   ```bash
   pip install -r requirements.txt
   ```
3. Create a `.env` file in the project root with your Wasabi credentials:
   ```
   WASABI_ACCESS_KEY=your_access_key
   WASABI_SECRET_KEY=your_secret_key
   ```

## Usage

1. Run the application:
   ```bash
   python wasabi_manager.py
   ```

2. Use the interface to:
   - Scan Wasabi storage for files in Recording/Recordings folders
   - Download recordings to a local directory
   - Upload summaries back to Wasabi

3. The application will:
   - Save recordings with their full path as the filename
   - Skip already downloaded recordings
   - Upload summaries to corresponding Summary/Summaries folders
   - Skip already uploaded summaries
   - Show progress and log all operations

## Folder Structure

The application maintains the original folder structure while handling the conversion between recordings and summaries:

- Original recording path: `SchoolA/Teacher1/ClassB/Recordings/audio1.mp3`
- Downloaded as: `SchoolA_Teacher1_ClassB_Recordings_audio1.mp3`
- Summary upload path: `SchoolA/Teacher1/ClassB/Summary/audio1_summary.tex`

## Notes

- Files are saved with underscores replacing slashes in the path
- The application maintains a local SQLite database to track processed files
- Supported audio formats: .mp3, .wav, .ogg
- Supported summary formats: .tex, .txt, .doc, .docx
- The application is case-insensitive when matching Recording/Recordings and Summary/Summaries folders

## Security

- Never commit the `.env` file containing your credentials
- Keep your Wasabi credentials secure
- The application stores processed file records locally in a SQLite database 