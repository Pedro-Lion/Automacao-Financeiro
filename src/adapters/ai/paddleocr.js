const path = require('node:path');
const { AIProvider } = require('./provider');
const { execPython } = require('../../core/python-bridge');

class PaddleOCRProvider extends AIProvider {
  constructor(config = {}, options = {}) {
    super();
    this.config = config;
    this.exec = options.exec || ((script, input) => execPython(script, input, {
      python: config.python || path.resolve('.venv-paddle/Scripts/python.exe'),
      timeout: config.timeout_ms || 120000
    }));
  }

  async analyzeImage(imagePath) {
    return this.exec('paddleocr_ocr.py', {
      image_path: path.relative(process.cwd(), path.resolve(imagePath)) || '.',
      language: this.config.language === 'por' ? 'pt' : (this.config.language || 'pt'),
      ocr_version: this.config.ocr_version || 'PP-OCRv4'
    });
  }

  async classifyText(text, categories) {
    const normalized = text.toLowerCase();
    const category = categories.find(item => item.name && normalized.includes(item.name.toLowerCase()))?.name || 'INFORMACAO';
    return { success: true, category, confidence: 0.5, reasoning: 'Classificação local por heurística.' };
  }

  async extractFromText(text, prompt, schema) {
    return this.exec('tesseract_ocr.py', { action: 'parse_text', text, prompt, schema });
  }

  async generateText(prompt, context) {
    return `${prompt}\n${JSON.stringify(context)}`;
  }
}

module.exports = { PaddleOCRProvider };
