// API Base URL
const API_BASE = 'http://localhost:5000/api';

// Initialize Tab Navigation
document.querySelectorAll('.tab-btn').forEach(button => {
    button.addEventListener('click', function() {
        const tabName = this.dataset.tab;
        switchTab(tabName);
    });
});

function switchTab(tabName) {
    // Hide all tabs
    document.querySelectorAll('.tab-content').forEach(tab => {
        tab.classList.remove('active');
    });

    // Remove active class from all buttons
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.remove('active');
    });

    // Show selected tab
    document.getElementById(tabName).classList.add('active');

    // Add active class to clicked button
    document.querySelector(`[data-tab="${tabName}"]`).classList.add('active');
}

// Translate Function
async function handleTranslate() {
    const text = document.getElementById('translateText').value.trim();
    const sourceLanguage = document.getElementById('translateSourceLang').value;
    const targetLangsSelect = document.getElementById('translateTargetLangs');
    const targetLanguages = Array.from(targetLangsSelect.selectedOptions).map(opt => opt.value);
    
    if (!text) {
        showError('translateResult', 'Please enter text to translate');
        return;
    }

    if (targetLanguages.length === 0) {
        showError('translateResult', 'Please select at least one target language');
        return;
    }

    try {
        showLoading('translateResult');
        
        const response = await fetch(`${API_BASE}/translate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                text: text,
                sourceLanguage: sourceLanguage,
                targetLanguages: targetLanguages
            })
        });

        const data = await response.json();
        
        if (response.ok && !data.error) {
            displayTranslateResult(data);
        } else {
            showError('translateResult', data.error || 'Translation failed');
        }
    } catch (error) {
        showError('translateResult', `Error: ${error.message}`);
    }
}

function displayTranslateResult(data) {
    const resultBox = document.getElementById('translateResult');
    resultBox.innerHTML = '';

    if (Array.isArray(data) && data.length > 0) {
        const item = data[0];
        
        // Display detected language if available
        if (item.detectedLanguage) {
            resultBox.innerHTML += `
                <div class="result-item">
                    <div class="result-label">Detected Language</div>
                    <div class="result-content">${item.detectedLanguage.language} (${item.detectedLanguage.score})</div>
                </div>
            `;
        }

        // Display translations
        if (item.translations && Array.isArray(item.translations)) {
            item.translations.forEach(trans => {
                resultBox.innerHTML += `
                    <div class="result-item">
                        <div class="result-label">${trans.to}</div>
                        <div class="result-content">${trans.text}</div>
                    </div>
                `;
            });
        }
    } else {
        showError('translateResult', 'No translation result received');
        return;
    }

    resultBox.classList.add('active');
}

// Detect Language Function
async function handleDetect() {
    const text = document.getElementById('detectText').value.trim();
    
    if (!text) {
        showError('detectResult', 'Please enter text to detect');
        return;
    }

    try {
        showLoading('detectResult');
        
        const response = await fetch(`${API_BASE}/detect`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: text })
        });

        const data = await response.json();
        
        if (response.ok && !data.error) {
            displayDetectResult(data);
        } else {
            showError('detectResult', data.error || 'Detection failed');
        }
    } catch (error) {
        showError('detectResult', `Error: ${error.message}`);
    }
}

function displayDetectResult(data) {
    const resultBox = document.getElementById('detectResult');
    resultBox.innerHTML = '';

    if (Array.isArray(data) && data.length > 0) {
        const item = data[0];
        
        resultBox.innerHTML = `
            <div class="result-item">
                <div class="result-label">Detected Language</div>
                <div class="result-content">${item.language}</div>
            </div>
            <div class="result-item">
                <div class="result-label">Confidence Score</div>
                <div class="result-content">${(item.score * 100).toFixed(2)}%</div>
            </div>
            <div class="result-item">
                <div class="result-label">Alt Translations</div>
                <div class="result-content">${JSON.stringify(item.alternatives || [], null, 2)}</div>
            </div>
        `;
    } else {
        showError('detectResult', 'No detection result received');
        return;
    }

    resultBox.classList.add('active');
}

// Transliterate Function
async function handleTransliterate() {
    const text = document.getElementById('transliterateText').value.trim();
    const language = document.getElementById('transliterateLanguage').value;
    const fromScript = document.getElementById('transliterateFromScript').value;
    const toScript = document.getElementById('transliterateToScript').value;
    
    if (!text) {
        showError('transliterateResult', 'Please enter text to transliterate');
        return;
    }

    try {
        showLoading('transliterateResult');
        
        const response = await fetch(`${API_BASE}/transliterate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                text: text,
                language: language,
                fromScript: fromScript,
                toScript: toScript
            })
        });

        const data = await response.json();
        
        if (response.ok && !data.error) {
            displayTransliterateResult(data);
        } else {
            showError('transliterateResult', data.error || 'Transliteration failed');
        }
    } catch (error) {
        showError('transliterateResult', `Error: ${error.message}`);
    }
}

function displayTransliterateResult(data) {
    const resultBox = document.getElementById('transliterateResult');
    resultBox.innerHTML = '';

    if (Array.isArray(data) && data.length > 0) {
        const item = data[0];
        
        resultBox.innerHTML = `
            <div class="result-item">
                <div class="result-label">Original Text</div>
                <div class="result-content">${item.text}</div>
            </div>
            <div class="result-item">
                <div class="result-label">Transliterated Text</div>
                <div class="result-content">${item.script}</div>
            </div>
        `;
    } else {
        showError('transliterateResult', 'No transliteration result received');
        return;
    }

    resultBox.classList.add('active');
}

// Dictionary Examples Function
async function handleDictionary() {
    const text = document.getElementById('dictionaryText').value.trim();
    const translation = document.getElementById('dictionaryTranslation').value.trim();
    const sourceLanguage = document.getElementById('dictionarySourceLang').value;
    const targetLanguage = document.getElementById('dictionaryTargetLang').value;
    
    if (!text || !translation) {
        showError('dictionaryResult', 'Please enter both word and translation');
        return;
    }

    try {
        showLoading('dictionaryResult');
        
        const response = await fetch(`${API_BASE}/dictionary-examples`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                text: text,
                translation: translation,
                sourceLanguage: sourceLanguage,
                targetLanguage: targetLanguage
            })
        });

        const data = await response.json();
        
        if (response.ok && !data.error) {
            displayDictionaryResult(data);
        } else {
            showError('dictionaryResult', data.error || 'Dictionary lookup failed');
        }
    } catch (error) {
        showError('dictionaryResult', `Error: ${error.message}`);
    }
}

function displayDictionaryResult(data) {
    const resultBox = document.getElementById('dictionaryResult');
    resultBox.innerHTML = '';

    if (Array.isArray(data) && data.length > 0) {
        const item = data[0];
        
        if (item.examples && Array.isArray(item.examples)) {
            item.examples.forEach((example, index) => {
                resultBox.innerHTML += `
                    <div class="result-item">
                        <div class="result-label">Example ${index + 1}</div>
                        <div class="result-content">
                            <strong>Source:</strong> ${example.sourcePrefix} <mark>${example.sourceTerm}</mark> ${example.sourceSuffix}<br/>
                            <strong>Target:</strong> ${example.targetPrefix} <mark>${example.targetTerm}</mark> ${example.targetSuffix}
                        </div>
                    </div>
                `;
            });
        } else {
            resultBox.innerHTML = '<div class="result-item"><div class="result-content">No examples found</div></div>';
        }
    } else {
        showError('dictionaryResult', 'No results received');
        return;
    }

    resultBox.classList.add('active');
}

// Utility Functions
function showLoading(resultId) {
    const resultBox = document.getElementById(resultId);
    resultBox.innerHTML = '<div class="result-item"><span class="spinner"></span> Loading...</div>';
    resultBox.classList.add('active');
}

function showError(resultId, message) {
    const resultBox = document.getElementById(resultId);
    resultBox.innerHTML = `<div class="result-item error"><div class="result-label">Error</div><div class="result-content">${message}</div></div>`;
    resultBox.classList.add('active');
}

// Health check on load
window.addEventListener('load', async () => {
    try {
        const response = await fetch(`${API_BASE}/health`);
        if (!response.ok) {
            console.warn('API health check failed');
        }
    } catch (error) {
        console.error('Cannot connect to API:', error);
    }
});
