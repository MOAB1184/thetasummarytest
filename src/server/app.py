import os
import json
from flask import Flask, request, Response, send_from_directory
from flask_cors import CORS
import requests
from openai import OpenAI  # Import OpenAI client

app = Flask(__name__)
CORS(app)  # Enable CORS for all routes

# --- Configuration ---
# OpenAI API key for GPT-4o mini
OPENAI_API_KEY = "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"
# OpenAI API key for speech-to-speech (used in voice mode)
OPENAI_VOICE_API_KEY = "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"

MODEL_NAME = "gpt-4o-mini"  # OpenAI's GPT-4o mini model
SYSTEM_PROMPT = "You are Theta, an AI tutor created by Theta Summary. You are helpful, patient, and aim to explain concepts clearly and encourage learning."
MAX_TOKENS = 1024  # Max tokens for the AI's response

# Initialize OpenAI client
openai_client = OpenAI(api_key=OPENAI_API_KEY)

# --- Static File Serving ---
@app.route('/')
def index():
    return send_from_directory('.', 'index.html')

@app.route('/<path:path>')
def static_files(path):
    # This will serve script.js, style.css, etc.
    return send_from_directory('.', path)

# --- Chat Endpoint (Server-Sent Events) ---
@app.route('/chat', methods=['GET'])
def chat_stream():
    user_message = request.args.get('message')

    if not user_message:
        def error_stream_no_message():
            error_data = {"error": "No message provided in query parameters"}
            yield f"data: {json.dumps(error_data)}\n\n"
            yield f"data: {json.dumps({'done': True})}\n\n"
        return Response(error_stream_no_message(), mimetype='text/event-stream')

    if not OPENAI_API_KEY:
        def error_stream_no_key():
            error_data = {"error": "API key not configured on the server"}
            yield f"data: {json.dumps(error_data)}\n\n"
            yield f"data: {json.dumps({'done': True})}\n\n"
        return Response(error_stream_no_key(), mimetype='text/event-stream')

    # Parse conversation history if provided
    history_param = request.args.get('history')
    if history_param:
        try:
            history = json.loads(history_param)
        except json.JSONDecodeError:
            history = []
    else:
        history = []

    # Create messages for OpenAI API
    messages = [
        {"role": "system", "content": SYSTEM_PROMPT}
    ] + history + [
        {"role": "user", "content": user_message}
    ]

    def generate_sse_from_openai():
        try:
            print(f"Calling OpenAI with message: {user_message}")
            
            # Make a streaming request to OpenAI API
            stream = openai_client.chat.completions.create(
                model=MODEL_NAME,
                messages=messages,
                stream=True,
                max_tokens=MAX_TOKENS
            )
            
            for chunk in stream:
                if chunk.choices:
                    # Extract the content from delta
                    delta_content = chunk.choices[0].delta.content
                    if delta_content:
                        # Send the chunk of content
                        yield f"data: {json.dumps({'chunk': delta_content})}\n\n"
                    
                    # Check if this is the final message
                    if chunk.choices[0].finish_reason:
                        print(f"OpenAI indicated finish_reason: {chunk.choices[0].finish_reason}")
                        break
            
            # Send done message
            yield f"data: {json.dumps({'done': True})}\n\n"
            
        except Exception as e:
            print(f"Error streaming from OpenAI: {e}")
            error_data = {"error": f"Error processing request: {str(e)}"}
            yield f"data: {json.dumps(error_data)}\n\n"
            yield f"data: {json.dumps({'done': True})}\n\n"
        finally:
            print("[APP.PY] generate_sse_from_openai finished.")

    return Response(generate_sse_from_openai(), mimetype='text/event-stream')

# --- Text-to-Speech API for Voice Mode ---
@app.route('/tts', methods=['POST'])
def text_to_speech():
    try:
        # Get text from request
        data = request.json
        text = data.get('text')
        
        if not text:
            return {"error": "No text provided"}, 400
            
        # Initialize a new client with the voice API key
        voice_client = OpenAI(api_key=OPENAI_VOICE_API_KEY)
        
        # Call OpenAI TTS API
        response = voice_client.audio.speech.create(
            model="tts-1",
            voice="alloy",
            input=text
        )
        
        # Get the audio content
        audio_data = response.content
        
        # Return audio as a response
        return Response(audio_data, mimetype='audio/mpeg')
        
    except Exception as e:
        print(f"Error generating speech: {e}")
        return {"error": f"Failed to generate speech: {str(e)}"}, 500

if __name__ == '__main__':
    print("Starting Flask app for Theta tutor bot...")
    if not OPENAI_API_KEY:
        print("Warning: OPENAI_API_KEY is not set or empty.")
    else:
        print("OPENAI_API_KEY is set.")
    print("Open http://127.0.0.1:5000 in your browser.")
    # Disable the auto-reloader so we don't restart during SSE streaming
    app.run(debug=True, use_reloader=False, host='0.0.0.0', port=5000) 