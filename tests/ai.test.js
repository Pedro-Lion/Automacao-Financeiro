const test = require('node:test');
const assert = require('node:assert/strict');
const { AIProvider, FallbackAIProvider, createAIProvider } = require('../src/adapters/ai/provider');
const { GeminiProvider } = require('../src/adapters/ai/gemini');
const { TesseractProvider } = require('../src/adapters/ai/tesseract');
const { PaddleOCRProvider } = require('../src/adapters/ai/paddleocr');
const { MessageClassifier } = require('../src/core/classifier');

test('factory cria providers configurados', () => {
  assert.ok(createAIProvider({ ai: { provider: 'tesseract_only' } }) instanceof TesseractProvider);
  assert.ok(createAIProvider({ ai: { provider: 'paddleocr' } }) instanceof PaddleOCRProvider);
  assert.ok(createAIProvider({ ai: { provider: 'gemini' } }, { exec: async () => ({}) }) instanceof GeminiProvider);
});

test('provider abstrato rejeita operações não implementadas', async () => {
  await assert.rejects(() => new AIProvider().classifyText('texto', []), /não implementado/);
});

test('classificador roteia uma mensagem para múltiplas features', async () => {
  const classifier = new MessageClassifier();
  const result = await classifier.classify({
    id: 'message-1',
    body: 'Foi decidido e o time completo chegou.',
    hasMedia: true
  }, 'obra');
  assert.deepEqual(result.map(item => item.feature), ['f04_atas', 'f05_midias', 'f07_frequencia']);
});

test('Gemini delega classificação e normaliza a chamada', async () => {
  const provider = new GeminiProvider({ provider_config: { api_key: 'test' } }, {
    exec: async (script, input) => {
      assert.equal(script, 'ai_gemini.py');
      assert.equal(input.action, 'classify_text');
      return { success: true, category: 'DECISAO', confidence: 0.9 };
    }
  });

  test('factory conecta fallback Tesseract ao Gemini', async () => {
    let calls = 0;
    const provider = createAIProvider({
      ai: { provider: 'gemini', fallback: 'tesseract', confidence_threshold: 0.8 }
    }, {
      exec: async script => {
        calls += 1;
        assert.equal(script, calls === 1 ? 'ai_gemini.py' : 'tesseract_ocr.py');
        if (calls === 1) return { success: true, confidence: 0.4, data: {} };
        return { success: true, confidence: 0.6, data: {} };
      }
    });
    assert.ok(provider instanceof FallbackAIProvider);
    const result = await provider.analyzeImage('nota.png', 'extraia', {});
    assert.equal(result.confidence, 0.6);
  });

  test('fallback é usado quando o provider primário falha', async () => {
    const provider = new FallbackAIProvider(
      { generateText: async () => { throw new Error('indisponível'); } },
      { generateText: async () => 'fallback' }
    );
    assert.equal(await provider.generateText('prompt', {}), 'fallback');
  });
  assert.equal((await provider.classifyText('aprovado', [])).category, 'DECISAO');
});
