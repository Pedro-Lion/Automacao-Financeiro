class MessageClassifier {
  constructor({ ai, logger } = {}) {
    this.ai = ai;
    this.logger = logger || { debug() {}, warn() {} };
  }

  async classify(message, groupType, context = {}) {
    if (!message?.id) throw new Error('Mensagem sem id não pode ser classificada.');
    const normalizedType = normalizeGroupType(groupType);
    const text = `${message.body || ''} ${message.caption || ''}`.trim();
    const normalizedText = text.toLocaleLowerCase('pt-BR');
    const result = [];

    if (normalizedType === 'nf' && message.hasMedia) {
      result.push({
        feature: 'f01_notas_fiscais',
        confidence: message.caption ? 0.95 : 0.6,
        reason: 'Mídia recebida no grupo de notas fiscais'
      });
    }
    if (normalizedType === 'privado' && /\b(cheguei|fui|voltei|retornei|saí)\b/i.test(normalizedText)) {
      result.push({
        feature: 'f03_quilometragem',
        confidence: 0.95,
        reason: 'Padrão de deslocamento identificado'
      });
    }
    if (normalizedType === 'obra' && /\b(decidido|aprovado|vamos com|fechado|definido)\b/i.test(normalizedText)) {
      result.push({
        feature: 'f04_atas',
        confidence: 0.9,
        reason: 'Padrão de decisão identificado'
      });
    }
    if (normalizedType === 'obra' && message.hasMedia) {
      result.push({
        feature: 'f05_midias',
        confidence: 0.9,
        reason: 'Mídia recebida em grupo de obra'
      });
    }
    if (normalizedType === 'obra' && /\b(presente|vieram|time completo|faltou|ausente)\b/i.test(normalizedText)) {
      result.push({
        feature: 'f07_frequencia',
        confidence: 0.75,
        reason: 'Padrão de frequência identificado'
      });
    }

    if (!result.length && text && this.ai?.classifyText) {
      const aiResult = await this.classifyWithAI(text, context.categories);
      if (aiResult) result.push(aiResult);
    }

    const classifications = deduplicate(result);
    this.logger.debug('Mensagem classificada.', {
      module: 'CLASSIFIER',
      messageId: message.id,
      features: classifications.map(item => item.feature)
    });
    return classifications;
  }

  async classifyWithAI(text, categories = []) {
    const response = await this.ai.classifyText(text, categories);
    const feature = response?.feature || categoryToFeature(response?.category);
    if (!feature || response?.success === false) return null;
    return {
      feature,
      confidence: Number(response.confidence) || 0,
      reason: response.reasoning || 'Classificação realizada pela IA'
    };
  }
}

function normalizeGroupType(value) {
  const normalized = String(value || '').toLocaleLowerCase('pt-BR');
  if (['nf', 'notas', 'notas_fiscais'].includes(normalized)) return 'nf';
  if (['privado', 'private', 'chat'].includes(normalized)) return 'privado';
  return 'obra';
}

function categoryToFeature(category) {
  const normalized = String(category || '').toLocaleLowerCase('pt-BR');
  const aliases = {
    nf: 'f01_notas_fiscais',
    nota: 'f01_notas_fiscais',
    quilometragem: 'f03_quilometragem',
    km: 'f03_quilometragem',
    ata: 'f04_atas',
    decisao: 'f04_atas',
    decisão: 'f04_atas',
    midia: 'f05_midias',
    mídia: 'f05_midias',
    frequencia: 'f07_frequencia',
    frequência: 'f07_frequencia'
  };
  return aliases[normalized];
}

function deduplicate(classifications) {
  const byFeature = new Map();
  for (const classification of classifications) {
    const current = byFeature.get(classification.feature);
    if (!current || classification.confidence > current.confidence) byFeature.set(classification.feature, classification);
  }
  return [...byFeature.values()];
}

module.exports = { MessageClassifier };
