# Theta Summary

A beautiful web application for summarizing lecture transcripts using DeepSeek AI's R1 Reasoner model.

## Features

- Upload lecture transcript (.txt files)
- Customize the prompt for the DeepSeek AI model
- Generate concise, structured summaries
- Download summaries as LaTeX (.tex) files
- Modern, responsive UI

## Installation

1. Make sure you have Node.js installed (version 14 or higher)
2. Clone this repository
3. Install dependencies:

```bash
npm install
```

## Usage

1. Start the server:

```bash
npm start
```

2. Open your browser and navigate to http://localhost:3000
3. Upload a transcript .txt file
4. (Optional) Enter a custom prompt
5. Click "Generate Summary"
6. Review the generated summary
7. Download as a .tex file

## Development

To run the server in development mode with automatic restarts:

```bash
npm run dev
```

## API Key

The application uses the DeepSeek API with the provided key. If you need to use your own API key, you can modify it in the `server.js` file.

## Technologies Used

- Frontend: HTML, CSS, JavaScript
- Backend: Node.js, Express
- AI: DeepSeek R1 Reasoner model

## License

MIT 