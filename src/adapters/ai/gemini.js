const path = require('node:path');
const { AIProvider } = require('./provider');
const { execPython } = require('../../core/python-bridge');

class GeminiProvider extends AIProvider {
  constructor(config = {}, options = {}) {
    super();
    this.config = config;
    this.exec = options.exec || ((script, input) => execPython(script, input, { timeout: config.timeout_ms || 60000 }));
    this.logger = options.logger || { warn() {}, error() {} };
    this.requests = [];
    this.maxRequests = config.rate_limit_per_minute || 15;
  }

  async analyzeImage(imagePath, prompt, schema) {
    return this.call({ action: 'analyze_image', image_path: path.resolve(imagePath), prompt, schema });
  }
  async classifyText(text, categories) {
    return this.call({ action: 'classify_text', text, categories });
  }
  async extractFromText(text, prompt, schema) {
    return this.call({ action: 'extract_text', text, prompt, schema });
  }
  async generateText(prompt, context) {
    const result = await this.call({ action: 'generate_text', prompt, context });
    return result.text;
  }

  async call(input) {
    await this.waitForRateLimit();
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        this.requests.push(Date.now());
        return await this.exec('ai_gemini.py', { ...input, api_key: this.config.provider_config?.api_key || this.config.gemini?.api_key, model: this.config.provider_config?.model || this.config.gemini?.model });
      } catch (error) {
        if (!isRetryable(error) || attempt === 2) throw error;
        const delay = 500 * (2 ** attempt);
        this.logger.warn(`Gemini falhou; nova tentativa em ${delay}ms.`, { module: 'AI' });
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
    throw new Error('Falha inesperada no provider Gemini.');
  }

  async waitForRateLimit() {
    for (;;) {
      const now = Date.now();
      this.requests = this.requests.filter(timestamp => now - timestamp < 60000);
      if (this.requests.length < this.maxRequests) return;
      await new Promise(resolve => setTimeout(resolve, 60000 - (now - this.requests[0]) + 1));
    }
  }
}

function isRetryable(error) {
  return /(?:429|500|rate.?limit|unavailable|resource exhausted)/i.test(error?.message || '');
}

module.exports = { GeminiProvider, isRetryable };
