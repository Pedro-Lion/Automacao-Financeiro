class AIProvider {
  async analyzeImage() { throw new Error('analyzeImage não implementado neste provider.'); }
  async classifyText() { throw new Error('classifyText não implementado neste provider.'); }
  async extractFromText() { throw new Error('extractFromText não implementado neste provider.'); }
  async generateText() { throw new Error('generateText não implementado neste provider.'); }
}

class FallbackAIProvider extends AIProvider {
  constructor(primary, fallback, confidenceThreshold = 0.8, logger = { warn() {} }) {
    super();
    this.primary = primary;
    this.fallback = fallback;
    this.confidenceThreshold = confidenceThreshold;
    this.logger = logger;
  }

  async analyzeImage(...args) {
    return this.call('analyzeImage', args, result => result?.success && result.confidence >= this.confidenceThreshold);
  }
  async classifyText(...args) {
    return this.call('classifyText', args);
  }
  async extractFromText(...args) {
    return this.call('extractFromText', args, result => result?.success && result.confidence >= this.confidenceThreshold);
  }
  async generateText(...args) {
    return this.call('generateText', args);
  }

  async call(method, args, isUsable = result => result?.success !== false) {
    try {
      const result = await this.primary[method](...args);
      if (isUsable(result)) return result;
      this.logger.warn(`Provider primário retornou baixa confiança; usando fallback.`, { module: 'AI' });
    } catch (error) {
      this.logger.warn(`Provider primário falhou; usando fallback: ${error.message}`, { module: 'AI' });
    }
    return this.fallback[method](...args);
  }
}

function createAIProvider(config = {}, options = {}) {
  const aiConfig = config.ai || config;
  const provider = aiConfig.provider || 'tesseract_only';
  let primary;
  if (provider === 'gemini') {
    const { GeminiProvider } = require('./gemini');
    primary = new GeminiProvider(aiConfig, options);
  } else if (provider === 'tesseract_only') {
    const { TesseractProvider } = require('./tesseract');
    primary = new TesseractProvider(aiConfig, options);
  } else if (provider === 'paddleocr') {
    const { PaddleOCRProvider } = require('./paddleocr');
    primary = new PaddleOCRProvider(aiConfig, options);
  } else {
    throw new Error(`Provider de IA não suportado: ${provider}`);
  }
  if (!aiConfig.fallback || provider === 'tesseract_only') return primary;
  const { TesseractProvider } = require('./tesseract');
  return new FallbackAIProvider(
    primary,
    new TesseractProvider(aiConfig.fallback === 'tesseract' ? aiConfig : { ...aiConfig, ...aiConfig.fallback }, options),
    aiConfig.confidence_threshold ?? 0.8,
    options.logger
  );
}

module.exports = { AIProvider, FallbackAIProvider, createAIProvider };
