class WhatsAppReader {
  constructor(client) { this.client = client; }
  async getMessages(groupId, sinceTimestamp = 0) { return this.readChat(groupId, sinceTimestamp); }
  async getPrivateMessages(contactPhone, sinceTimestamp = 0) { return this.readChat(`${contactPhone.replace(/\D/g, '')}@c.us`, sinceTimestamp); }
  async readChat(chatId, sinceTimestamp) {
    const chat = await this.client.client.getChatById(chatId);
    const collected = [];
    let before;
    for (;;) {
      const options = { limit: 100 };
      if (before) options.before = before;
      const page = await chat.fetchMessages(options);
      if (!page.length) break;
      collected.push(...page);
      const oldest = page.reduce((current, message) => message.timestamp < current.timestamp ? message : current, page[0]);
      if (page.length < 100 || oldest.timestamp <= sinceTimestamp) break;
      const nextBefore = oldest.id?._serialized;
      if (!nextBefore || nextBefore === before) break;
      before = nextBefore;
    }
    return collected.filter(message => message.timestamp > sinceTimestamp && !message.fromMe)
      .map(message => ({
        id: message.id._serialized,
        from: message.from,
        author: message.author || message.from,
        timestamp: message.timestamp,
        body: message.body || '',
        type: message.type,
        hasMedia: message.hasMedia,
        caption: message.caption || null,
        quotedMsg: null,
        isForwarded: Boolean(message.isForwarded),
        downloadMedia: () => message.downloadMedia(),
        senderName: message._data?.notifyName || message._data?.pushname || null
      })).sort((a, b) => a.timestamp - b.timestamp);
  }
}
module.exports = { WhatsAppReader };
