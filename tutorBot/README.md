# Theta - AI Tutor Chatbot

This is a simple web-based chatbot named Theta, designed to act as an AI tutor. It uses Flask for the backend and communicates with a DeepSeek model via the OpenRouter API.

## Features

- Simple chat interface.
- Connects to DeepSeek language models through OpenRouter.
- Basic error handling.

## Setup and Running

1.  **Clone the repository (or create the files as provided).**

2.  **Create a Python virtual environment (recommended):**
    ```bash
    python -m venv venv
    ```
    Activate it:
    -   Windows:
        ```bash
        .\venv\Scripts\activate
        ```
    -   macOS/Linux:
        ```bash
        source venv/bin/activate
        ```

3.  **Install dependencies:**
    ```bash
    pip install -r requirements.txt
    ```

4.  **API Key:**
    The DeepSeek API key (via OpenRouter) is currently hardcoded in `app.py`:
    ```python
    OPENROUTER_API_KEY = "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"
    ```
    For better security, especially if you plan to deploy this or share the code, you should move this key to an environment variable. For example, you could create a `.env` file:
    ```
    OPENROUTER_API_KEY="your_actual_api_key_here"
    ```
    And then load it in `app.py` using a library like `python-dotenv`.

5.  **Choose your DeepSeek Model:**
    You can change the model used by editing the `MODEL_NAME` variable in `app.py`.
    Current: `MODEL_NAME = "deepseek/deepseek-coder"`
    Alternative: `MODEL_NAME = "deepseek/deepseek-chat"` (or other compatible models on OpenRouter).

6.  **Run the Flask application:**
    ```bash
    python app.py
    ```

7.  Open your web browser and go to `http://127.0.0.1:5000`.

## File Structure

-   `app.py`: The Flask backend application.
-   `index.html`: The main HTML file for the chat interface.
-   `style.css`: CSS for styling the chat interface.
-   `script.js`: JavaScript for frontend logic (sending/receiving messages).
-   `requirements.txt`: Python dependencies.
-   `README.md`: This file.

## How it Works

-   The frontend (`index.html`, `script.js`, `style.css`) provides the user interface.
-   When a user sends a message, `script.js` POSTs it to the `/chat` endpoint on the Flask server (`app.py`).
-   The Flask server receives the message, constructs a request to the OpenRouter API with your DeepSeek API key and the chosen model.
-   OpenRouter forwards the request to the DeepSeek model.
-   The model generates a response.
-   The Flask server sends this response back to the frontend.
-   `script.js` displays the bot's reply in the chat window.

## To-Do / Potential Improvements

-   **API Key Management**: Use environment variables or a config file for the API key instead of hardcoding.
-   **Chat History**: Implement conversation history so the bot remembers previous parts of the discussion (this requires sending more context to the API).
-   **Streaming Responses**: For longer replies, stream the response from the LLM for a better user experience.
-   **Error Handling**: More robust error handling on both frontend and backend.
-   **UI Enhancements**: Improve the look and feel of the chat interface.
-   **Deployment**: Instructions for deploying to a platform like Heroku, Vercel, or a VPS.
-   **Input Validation**: Sanitize user inputs. 