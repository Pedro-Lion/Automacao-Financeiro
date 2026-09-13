const path = require('node:path');
const { AIProvider } = require('./provider');
const { execPython } = require('../../core/python-bridge');

class TesseractProvider extends AIProvider {
  constructor(config = {}, options = {}) {
    super();
    this.config = config;
    this.exec = options.exec || ((script, input) => execPython(script, input, { timeout: config.timeout_ms || 60000 }));
  }
  async analyzeImage(imagePath) {
    return this.exec('tesseract_ocr.py', {
      action: 'extract_nf', image_path: path.resolve(imagePath),
      tesseract_cmd: this.config.tesseract_cmd, language: this.config.language || 'por'
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

module.exports = { TesseractProvider };
