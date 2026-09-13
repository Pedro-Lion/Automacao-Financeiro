class WahaReader {
  constructor(client) { this.client = client; }

  async getMessages(groupId, sinceTimestamp = 0) {
    const collected = await this.client.fetchMessages(groupId, { limit: 100 });
    return collected
      .filter(message => !message.fromMe && Number(message.timestamp || message.t || 0) > sinceTimestamp)
      .map(message => normalizeMessage(message))
      .sort((a, b) => a.timestamp - b.timestamp);
  }
}

function normalizeMessage(message) {
  const id = message.id?._serialized || message.id || message.key?.id;
  const source = message.from || message.chatId || message.key?.remoteJid;
  const media = message.hasMedia || Boolean(message.media || message._data?.deprecatedMms3Url);
  return {
    id,
    from: source,
    author: message.author || message.participant || source,
    timestamp: Number(message.timestamp || message.t || 0),
    body: message.body || message.text?.body || message.caption || '',
    type: message.type || (media ? 'image' : 'chat'),
    hasMedia: Boolean(media),
    caption: message.caption || null,
    quotedMsg: null,
    isForwarded: Boolean(message.isForwarded),
    senderName: message._data?.notifyName || message.notifyName || null
  };
}

module.exports = { WahaReader };
