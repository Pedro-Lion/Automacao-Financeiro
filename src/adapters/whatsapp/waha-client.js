const { EventEmitter } = require('node:events');

class WahaClient extends EventEmitter {
  constructor(config, logger) {
    super();
    this.config = config;
    this.logger = logger || { info() {}, warn() {}, error() {} };
    this.baseUrl = String(config.base_url || 'http://127.0.0.1:3000').replace(/\/+$/, '');
    this.session = config.session_name || 'default';
    this.apiKey = config.api_key || process.env.WAHA_API_KEY || '';
    this.connected = false;
    this.status = 'disconnected';
    this.client = this;
  }

  async request(path, options = {}) {
    const response = await fetch(`${this.baseUrl}${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(this.apiKey ? { 'X-Api-Key': this.apiKey } : {}),
        ...(options.headers || {})
      }
    });
    const text = await response.text();
    let body = null;
    try { body = text ? JSON.parse(text) : null; } catch { body = text; }
    if (!response.ok) {
      throw new Error(`WAHA HTTP ${response.status} em ${path}: ${typeof body === 'string' ? body : JSON.stringify(body)}`);
    }
    return body;
  }

  async connect() {
    if (this.connected) return;
    this.status = 'initializing';
    this.logger.info(`Conectando ao WAHA em ${this.baseUrl}.`, { module: 'WHATSAPP' });
    try {
      await this.request('/api/server/status');
      let session;
      try {
        session = await this.request(`/api/sessions/${encodeURIComponent(this.session)}`);
      } catch (error) {
        if (!String(error.message).includes('HTTP 404')) throw error;
        await this.request('/api/sessions', {
          method: 'POST',
          body: JSON.stringify({ name: this.session, config: {} })
        });
        session = await this.request(`/api/sessions/${encodeURIComponent(this.session)}`);
      }
      const state = String(session?.status || session?.state || '').toLowerCase();
      if (!['running', 'working', 'connected'].includes(state)) {
        await this.request(`/api/sessions/${encodeURIComponent(this.session)}/start`, {
          method: 'POST',
          body: JSON.stringify({})
        });
      }
      this.connected = true;
      this.status = 'ready';
      this.logger.info(`WAHA conectado. Sessão: ${this.session}.`, { module: 'WHATSAPP' });
      this.emit('ready');
    } catch (error) {
      this.status = 'error';
      this.logger.error(`Falha ao conectar ao WAHA: ${error.message}`, { module: 'WHATSAPP' });
      throw error;
    }
  }

  async getConnectionDiagnostics() {
    let session = null;
    try {
      session = await this.request(`/api/sessions/${encodeURIComponent(this.session)}`);
    } catch (error) {
      return { provider: 'waha', baseUrl: this.baseUrl, session: this.session, status: this.status, error: error.message };
    }
    return {
      provider: 'waha',
      baseUrl: this.baseUrl,
      session: this.session,
      clientStatus: this.status,
      connectedFlag: this.connected,
      webState: session?.status || session?.state || null,
      connectedUser: session?.me || session?.user || null
    };
  }

  async getChats() {
    const chats = await this.request(`/api/${encodeURIComponent(this.session)}/chats`);
    return (Array.isArray(chats) ? chats : chats?.data || []).map(chat => ({
      id: chat.id?._serialized || chat.id || chat.chatId,
      name: chat.name || chat.subject || chat.id?._serialized || chat.id,
      isGroup: Boolean(chat.isGroup || String(chat.id?._serialized || chat.id).endsWith('@g.us'))
    }));
  }

  async getChatById(chatId) {
    const chats = await this.getChats();
    const chat = chats.find(item => item.id === chatId);
    if (!chat) throw new Error(`Grupo não encontrado no WAHA: ${chatId}`);
    return { ...chat, id: { _serialized: chat.id } };
  }

  async fetchMessages(chatId, { limit = 100, before = null } = {}) {
    const query = new URLSearchParams({ limit: String(limit) });
    if (before) query.set('before', before);
    const messages = await this.request(`/api/${encodeURIComponent(this.session)}/chats/${encodeURIComponent(chatId)}/messages?${query}`);
    return Array.isArray(messages) ? messages : messages?.data || [];
  }

  async disconnect() {
    this.connected = false;
    this.status = 'disconnected';
    this.logger.info('Conexão com o WAHA encerrada. Sistema pausado.', { module: 'WHATSAPP' });
  }
}

module.exports = { WahaClient };
