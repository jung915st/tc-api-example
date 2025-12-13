#!/usr/bin/env python3
# -*- coding: utf-8 -*-

from flask import Flask, jsonify, request, render_template
from flask_cors import CORS
import requests
import uuid
import os
from dotenv import load_dotenv

load_dotenv()

app = Flask(__name__, template_folder='templates', static_folder='static')
CORS(app)

# Azure Translator Configuration
SUBSCRIPTION_KEY = os.environ.get('TRANSLATOR_TEXT_RESOURCE_KEY')
REGION = os.environ.get('TRANSLATOR_TEXT_REGION', 'swedencentral')
ENDPOINT = os.environ.get('TRANSLATOR_TEXT_ENDPOINT', 'https://api.cognitive.microsofttranslator.com/')

def _make_translator_request(path, params, body):
    """Helper function to make requests to Azure Translator API"""
    constructed_url = ENDPOINT + path + params
    headers = {
        'Ocp-Apim-Subscription-Key': SUBSCRIPTION_KEY,
        'Ocp-Apim-Subscription-Region': REGION,
        'Content-type': 'application/json',
        'X-ClientTraceId': str(uuid.uuid4())
    }
    
    try:
        response = requests.post(constructed_url, headers=headers, json=body)
        response.raise_for_status()
        return response.json()
    except requests.exceptions.RequestException as e:
        return {'error': str(e)}

@app.route('/')
def index():
    """Serve the main SPA page"""
    return render_template('index.html')

@app.route('/api/translate', methods=['POST'])
def translate():
    """Translate text to target languages"""
    data = request.get_json()
    text = data.get('text', '').strip()
    source_lang = data.get('sourceLanguage', 'auto')
    target_langs = data.get('targetLanguages', ['en', 'zh-Hans'])
    
    if not text:
        return jsonify({'error': 'Text is required'}), 400
    
    # Build parameter string for target languages
    target_params = ''.join([f'&to={lang}' for lang in target_langs])
    source_param = f'&from={source_lang}' if source_lang != 'auto' else ''
    
    path = '/translate?api-version=3.0'
    params = source_param + target_params
    body = [{'text': text}]
    
    result = _make_translator_request(path, params, body)
    return jsonify(result)

@app.route('/api/detect', methods=['POST'])
def detect():
    """Detect the language of input text"""
    data = request.get_json()
    text = data.get('text', '').strip()
    
    if not text:
        return jsonify({'error': 'Text is required'}), 400
    
    path = '/detect?api-version=3.0'
    params = ''
    body = [{'text': text}]
    
    result = _make_translator_request(path, params, body)
    return jsonify(result)

@app.route('/api/transliterate', methods=['POST'])
def transliterate():
    """Transliterate text from one script to another"""
    data = request.get_json()
    text = data.get('text', '').strip()
    language = data.get('language', 'ja')
    from_script = data.get('fromScript', 'jpan')
    to_script = data.get('toScript', 'latn')
    
    if not text:
        return jsonify({'error': 'Text is required'}), 400
    
    path = '/transliterate?api-version=3.0'
    params = f'&language={language}&fromScript={from_script}&toScript={to_script}'
    body = [{'text': text}]
    
    result = _make_translator_request(path, params, body)
    return jsonify(result)

@app.route('/api/dictionary-examples', methods=['POST'])
def dictionary_examples():
    """Get dictionary examples for a word"""
    data = request.get_json()
    text = data.get('text', '').strip()
    translation = data.get('translation', '').strip()
    source_lang = data.get('sourceLanguage', 'en')
    target_lang = data.get('targetLanguage', 'fr')
    
    if not text or not translation:
        return jsonify({'error': 'Text and translation are required'}), 400
    
    path = '/dictionary/examples?api-version=3.0'
    params = f'&from={source_lang}&to={target_lang}'
    body = [{
        'text': text,
        'translation': translation
    }]
    
    result = _make_translator_request(path, params, body)
    return jsonify(result)

@app.route('/api/health', methods=['GET'])
def health():
    """Health check endpoint"""
    if not SUBSCRIPTION_KEY:
        return jsonify({'status': 'error', 'message': 'API key not configured'}), 500
    return jsonify({'status': 'ok', 'message': 'API is ready'})

@app.errorhandler(404)
def not_found(error):
    """Handle 404 errors"""
    return jsonify({'error': 'Endpoint not found'}), 404

@app.errorhandler(500)
def internal_error(error):
    """Handle 500 errors"""
    return jsonify({'error': 'Internal server error'}), 500

if __name__ == '__main__':
    if not SUBSCRIPTION_KEY:
        print("WARNING: TRANSLATOR_TEXT_RESOURCE_KEY environment variable is not set")
        print("Please set it before running the application")
    app.run(debug=True, host='127.0.0.1', port=5000)
