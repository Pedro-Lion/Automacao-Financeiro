class EvolutionReader {
  constructor(client, state = null, instanceName = null) {
    this.client = client;
    this.state = state;
    this.instanceName = instanceName || client?.instance;
  }

  async getMessages(groupId, sinceTimestamp = 0) {
    const inboxMessages = this.readInbox(groupId, sinceTimestamp);
    if (inboxMessages.length) return inboxMessages;
    const collected = await this.client.fetchMessages(groupId, { limit: 100 });
    return collected
      .map(normalizeMessage)
      .filter(Boolean)
      .filter(message => !message.fromMe && message.timestamp > sinceTimestamp)
      .sort((a, b) => a.timestamp - b.timestamp);
  }

  readInbox(groupId, sinceTimestamp) {
    if (!this.state || !this.instanceName || typeof this.state.getWhatsAppInbox !== 'function') return [];
    const items = this.state.getWhatsAppInbox('received', 100);
    const messages = items
      .map(item => ({ ...normalizeMessage(item.payload), inboxItem: item }))
      .filter(message => message.id && message.from === groupId)
      .filter(message => !message.fromMe && message.timestamp > sinceTimestamp)
      .sort((a, b) => a.timestamp - b.timestamp);
    for (const message of messages) {
      this.state.updateWhatsAppInboxStatus(this.instanceName, message.id, 'processed');
      delete message.inboxItem;
    }
    return messages;
  }
}

function normalizeMessage(message) {
  const key = message.key || {};
  const content = message.message || message.messages?.[0]?.message || {};
  const id = key.id || message.id;
  const from = key.remoteJid || message.remoteJid || message.from;
  if (!id || !from) return null;
  const timestamp = normalizeTimestamp(message.messageTimestamp || message.timestamp || message.t || 0);
  const typed = firstContent(content);
  if (!typed) return null;
  const [type, value] = typed;
  const text = value.conversation || value.text || value.caption || value.contentText || '';
  return {
    id,
    from,
    author: key.participant || message.participant || message.author || from,
    timestamp,
    body: text,
    type,
    hasMedia: ['image', 'video', 'document', 'audio', 'ptt', 'sticker'].includes(type),
    caption: value.caption || null,
    quotedMsg: null,
    isForwarded: Boolean(value.contextInfo?.isForwarded),
    senderName: message.pushName || message.notifyName || null,
    fromMe: Boolean(key.fromMe || message.fromMe),
    mimetype: value.mimetype || null,
    filename: value.fileName || value.filename || null
  };
}

function firstContent(content) {
  if (content.conversation) return ['chat', content];
  if (content.extendedTextMessage) return ['chat', { ...content.extendedTextMessage, text: content.extendedTextMessage.text }];
  for (const type of ['imageMessage', 'videoMessage', 'documentMessage', 'audioMessage', 'stickerMessage']) {
    if (content[type]) return [type.replace('Message', '').replace('audio', content[type].ptt ? 'ptt' : 'audio'), content[type]];
  }
  return null;
}

function normalizeTimestamp(value) {
  const number = Number(value || 0);
  return number > 100000000000 ? Math.floor(number / 1000) : number;
}

module.exports = { EvolutionReader, normalizeMessage };
