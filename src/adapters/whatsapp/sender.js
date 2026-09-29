class WhatsAppSender {
  constructor(client, logger) { this.client = client; this.logger = logger; this.lastSent = 0; }
  async sendMessage(phone, text) {
    if (!phone || !/^\d{10,15}$/.test(phone.replace(/\D/g, ''))) throw new Error('Telefone inválido para envio privado.');
    if (!text?.trim()) throw new Error('Texto da mensagem não pode ser vazio.');
    const wait = Math.max(0, 1000 - (Date.now() - this.lastSent));
    if (wait) await new Promise(resolve => setTimeout(resolve, wait));
    const normalized = `${phone.replace(/\D/g, '')}@c.us`;
    try {
      const result = typeof this.client.sendText === 'function'
        ? await this.client.sendText(normalized, text)
        : await this.client.client.sendMessage(normalized, text);
      this.lastSent = Date.now();
      this.logger.info(`Mensagem privada enviada para ${normalized}.`, { module: 'WHATSAPP' });
      return result;
    } catch (error) {
      this.logger.error(`Falha ao enviar mensagem para ${normalized}: ${error.message}`, { module: 'WHATSAPP' });
      throw error;
    }
  }
}
module.exports = { WhatsAppSender };
