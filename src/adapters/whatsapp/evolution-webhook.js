const crypto = require('node:crypto');

function createEvolutionWebhookHandler({ state, instanceName, secret, maxBodyBytes = 1024 * 1024, logger } = {}) {
  if (!state) throw new Error('State é obrigatório para o webhook Evolution.');
  if (!instanceName) throw new Error('instanceName é obrigatório para o webhook Evolution.');
  const log = logger || { info() {}, warn() {}, error() {} };

  return function handle(headers = {}, body) {
    const raw = typeof body === 'string' ? body : JSON.stringify(body);
    if (Buffer.byteLength(raw || '', 'utf8') > maxBodyBytes) return response(413, { error: 'Payload muito grande.' });
    if (secret && !validSecret(headers, secret)) return response(401, { error: 'Webhook não autorizado.' });
    let payload;
    try { payload = typeof body === 'string' ? JSON.parse(body) : body; } catch { return response(400, { error: 'JSON inválido.' }); }
    const event = String(payload?.event || payload?.type || '').toUpperCase();
    const receivedInstance = payload?.instance || payload?.instanceName || payload?.data?.instance;
    if (receivedInstance && receivedInstance !== instanceName) return response(403, { error: 'Instância não autorizada.' });
    if (!event) return response(400, { error: 'Evento ausente.' });

    if (event === 'CONNECTION_UPDATE') {
      const connection = payload?.data?.state || payload?.data?.status || payload?.state || payload?.status || 'unknown';
      state.updateWhatsAppConnection(instanceName, String(connection), null);
    } else if (event === 'QRCODE_UPDATED') {
      const qr = payload?.data?.qrcode?.base64 || payload?.data?.base64 || null;
      state.updateWhatsAppConnection(instanceName, 'awaiting_qr', null);
      log.info('QR Code da Evolution atualizado.', { module: 'WHATSAPP' });
      return response(200, { accepted: true, event, qrAvailable: Boolean(qr) });
    } else if (event === 'MESSAGES_UPSERT') {
      const messages = Array.isArray(payload?.data) ? payload.data : [payload?.data || payload?.message];
      for (const message of messages) {
        const key = message?.key || {};
        const messageId = key.id || message?.id;
        const remoteJid = key.remoteJid || message?.remoteJid;
        if (!messageId || !remoteJid) return response(422, { error: 'Mensagem sem identificador ou chat.' });
        state.enqueueWhatsAppMessage(instanceName, messageId, remoteJid, message);
      }
    } else {
      log.info(`Evento Evolution recebido: ${event}.`, { module: 'WHATSAPP' });
    }
    return response(200, { accepted: true, event });
  };
}

function validSecret(headers, secret) {
  const received = headers['x-evolution-secret'] || headers['X-Evolution-Secret'] || headers.apikey || '';
  const a = Buffer.from(String(received));
  const b = Buffer.from(String(secret));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function response(status, body) { return { status, body }; }

module.exports = { createEvolutionWebhookHandler };
