const { EventEmitter } = require('node:events');

class EvolutionClient extends EventEmitter {
  constructor(config, logger) {
    super();
    this.config = config || {};
    this.logger = logger || { info() {}, warn() {}, error() {} };
    this.baseUrl = String(this.config.base_url || '').replace(/\/+$/, '');
    this.instance = this.config.instance_name || this.config.session_name || 'default';
    this.apiKey = this.config.api_key || process.env.EVOLUTION_API_KEY || '';
    this.phoneNumber = normalizePhoneNumber(
      this.config.phone_number || process.env.EVOLUTION_PHONE_NUMBER || ''
    );
    this.pairingCodeEnabled = Boolean(
      this.config.pairing_code ?? parseBoolean(process.env.EVOLUTION_PAIRING_CODE)
    );
    this.timeoutMs = Number(this.config.request_timeout_ms || 15000);
    this.retryCount = Number(this.config.retry_count ?? 2);
    this.connected = false;
    this.status = 'disconnected';
    this.latestQr = null;
    this.latestPairingCode = null;
    this.connecting = null;
    this.stopping = false;
    this.client = this;
  }

  async request(path, options = {}) {
    if (!this.baseUrl) throw new Error('Evolution base_url não configurada.');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    let lastError;
    try {
      for (let attempt = 0; attempt <= this.retryCount; attempt += 1) {
        try {
          const response = await fetch(`${this.baseUrl}${path}`, {
            ...options,
            signal: controller.signal,
            headers: {
              'Content-Type': 'application/json',
              ...(this.apiKey ? { apikey: this.apiKey } : {}),
              ...(options.headers || {})
            }
          });
          const text = await response.text();
          let body = null;
          try { body = text ? JSON.parse(text) : null; } catch { body = text; }
          if (response.ok) return body;
          const error = new Error(`Evolution HTTP ${response.status} em ${path}: ${formatBody(body)}`);
          error.status = response.status;
          if (!isRetryable(response.status) || attempt >= this.retryCount) throw error;
          lastError = error;
        } catch (error) {
          if (error.name === 'AbortError') throw new Error(`Timeout na Evolution após ${this.timeoutMs}ms em ${path}.`);
          if (error.status && !isRetryable(error.status)) throw error;
          if (attempt >= this.retryCount) throw error;
          lastError = error;
        }
        await delay(250 * (2 ** attempt));
      }
      throw lastError || new Error(`Falha na requisição Evolution: ${path}`);
    } finally {
      clearTimeout(timer);
    }
  }

  async connect() {
    if (this.connected) return;
    if (this.connecting) return this.connecting;
    this.stopping = false;
    this.status = 'initializing';
    this.connecting = this._connect().finally(() => { this.connecting = null; });
    return this.connecting;
  }

  async _connect() {
    try {
      await this.request('/');
      let instance = await this.findInstance();
      if (!instance) {
        await this.request('/instance/create', {
          method: 'POST',
          body: JSON.stringify({
            instanceName: this.instance,
            integration: this.config.integration || 'WHATSAPP-BAILEYS',
            qrcode: !this.pairingCodeEnabled
          })
        });
        instance = await this.findInstance();
      }
      const state = await this.getConnectionState();
      const normalized = normalizeState(state);
      if (normalized === 'open' || normalized === 'connected') {
        this.markConnected(state);
        return;
      }
      if (this.pairingCodeEnabled && !this.phoneNumber) {
        throw new Error('Evolution pairing code habilitado, mas phone_number/EVOLUTION_PHONE_NUMBER não foi configurado.');
      }
      const query = this.pairingCodeEnabled
        ? `?number=${encodeURIComponent(this.phoneNumber)}`
        : '';
      const authentication = await this.request(
        `/instance/connect/${encodeURIComponent(this.instance)}${query}`
      );
      this.latestPairingCode = authentication?.pairingCode || authentication?.pairing_code || null;
      this.latestQr = this.pairingCodeEnabled
        ? null
        : authentication?.base64 || authentication?.qrcode?.base64 || authentication?.code || null;
      this.status = this.pairingCodeEnabled ? 'awaiting_pairing_code' : 'awaiting_qr';
      if (this.latestPairingCode) this.emit('pairing_code', this.latestPairingCode);
      if (this.latestQr) this.emit('qr', this.latestQr);
      this.logger.info(
        `Evolution aguardando autenticação por ${this.pairingCodeEnabled ? 'pairing code' : 'QR Code'}. Instância: ${this.instance}.`,
        { module: 'WHATSAPP' }
      );
      if (this.latestPairingCode) {
        this.logger.info(`Pairing code Evolution: ${this.latestPairingCode}`, { module: 'WHATSAPP' });
      }
    } catch (error) {
      this.status = 'error';
      this.logger.error(`Falha ao conectar à Evolution: ${error.message}`, { module: 'WHATSAPP' });
      throw error;
    }
  }

  async findInstance() {
    try {
      const instances = await this.request('/instance/fetchInstances');
      const list = Array.isArray(instances) ? instances : instances?.data || [];
      return list.find(item => (item.instance?.instanceName || item.instanceName || item.name) === this.instance) || null;
    } catch (error) {
      if (error.status === 404) return null;
      throw error;
    }
  }

  async getConnectionState() {
    return this.request(`/instance/connectionState/${encodeURIComponent(this.instance)}`);
  }

  markConnected(state = null) {
    this.connected = true;
    this.status = 'ready';
    this.latestQr = null;
    this.logger.info(`Evolution conectada. Instância: ${this.instance}.`, { module: 'WHATSAPP' });
    this.emit('ready', state);
  }

  isConnected() { return this.connected; }
  getStatus() { return this.status; }
  getLatestQr() { return this.latestQr; }
  getLatestPairingCode() { return this.latestPairingCode; }

  async getConnectionDiagnostics() {
    try {
      const state = await this.getConnectionState();
      const normalized = normalizeState(state);
      if (normalized === 'open' || normalized === 'connected') this.markConnected(state);
      return {
        provider: 'evolution',
        baseUrl: this.baseUrl,
        instance: this.instance,
        clientStatus: this.status,
        connectedFlag: this.connected,
        webState: state?.instance?.state || state?.state || state?.status || null,
        connectedUser: state?.instance?.profileName || state?.profileName || null
      };
    } catch (error) {
      return {
        provider: 'evolution',
        baseUrl: this.baseUrl,
        instance: this.instance,
        clientStatus: this.status,
        connectedFlag: this.connected,
        error: error.message
      };
    }
  }

  async getChats() {
    const path = this.config.endpoints?.chats || `/chat/findChats/${encodeURIComponent(this.instance)}`;
    const chats = await this.request(path, { method: 'POST', body: JSON.stringify({}) });
    const list = Array.isArray(chats) ? chats : chats?.data || [];
    return list.map(normalizeChat).filter(chat => chat.id);
  }

  async getChatById(chatId) {
    const chats = await this.getChats();
    const chat = chats.find(item => item.id === chatId);
    if (!chat) throw new Error(`Grupo não encontrado na Evolution: ${chatId}`);
    return { ...chat, id: { _serialized: chat.id } };
  }

  async fetchMessages(chatId, { limit = 100, before = null } = {}) {
    const path = this.config.endpoints?.messages || `/chat/findMessages/${encodeURIComponent(this.instance)}`;
    const response = await this.request(path, {
      method: 'POST',
      body: JSON.stringify({
        where: { key: { remoteJid: chatId } },
        page: before || 1,
        offset: limit
      })
    });
    return Array.isArray(response) ? response : response?.messages || response?.data || [];
  }

  async sendText(phoneOrJid, text) {
    const number = normalizeJid(phoneOrJid);
    if (!number || !text?.trim()) throw new Error('Destinatário e texto são obrigatórios.');
    const path = this.config.endpoints?.sendText || `/message/sendText/${encodeURIComponent(this.instance)}`;
    return this.request(path, {
      method: 'POST',
      body: JSON.stringify({ number, text: text.trim() })
    });
  }

  async downloadMedia(message) {
    if (!message?.hasMedia || !message.id) throw new Error('Mensagem não contém mídia baixável.');
    const path = this.config.endpoints?.media || `/chat/getBase64FromMediaMessage/${encodeURIComponent(this.instance)}`;
    return this.request(path, {
      method: 'POST',
      body: JSON.stringify({ message: { key: { id: message.id, remoteJid: message.from } }, convertToMp4: false })
    });
  }

  async disconnect() {
    this.stopping = true;
    this.connected = false;
    this.status = 'disconnected';
    this.latestQr = null;
    this.latestPairingCode = null;
    this.logger.info('Conexão com a Evolution encerrada. Sistema pausado.', { module: 'WHATSAPP' });
  }
}

function normalizeChat(chat) {
  const id = chat.id?._serialized || chat.remoteJid || chat.id || chat.chatId;
  return {
    id,
    name: chat.name || chat.subject || chat.pushName || id,
    isGroup: Boolean(chat.isGroup || String(id).endsWith('@g.us'))
  };
}

function normalizeJid(value) {
  const raw = String(value || '').trim();
  if (raw.endsWith('@c.us') || raw.endsWith('@g.us')) return raw;
  const digits = raw.replace(/\D/g, '');
  return digits.length >= 10 ? `${digits}@c.us` : '';
}

function normalizePhoneNumber(value) {
  const digits = String(value || '').replace(/\D/g, '');
  return digits.length >= 10 ? digits : '';
}

function parseBoolean(value) {
  return ['1', 'true', 'yes', 'on'].includes(String(value || '').toLowerCase());
}

function normalizeState(value) {
  return String(value?.instance?.state || value?.state || value?.status || '').toLowerCase();
}

function formatBody(body) {
  return typeof body === 'string' ? body : JSON.stringify(body);
}

function isRetryable(status) {
  return status === 408 || status === 425 || status === 429 || status >= 500;
}

function delay(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

module.exports = { EvolutionClient, normalizeJid, normalizeState };
