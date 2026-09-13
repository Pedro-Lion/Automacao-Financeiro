const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const { EventEmitter } = require('node:events');

class WhatsAppClient extends EventEmitter {
  constructor(config, logger, client = null) {
    super();
    this.config = config;
    this.logger = logger || { info() {}, warn() {}, error() {} };
    this.connected = false;
    this.status = 'disconnected';
    this.latestQr = null;
    this.client = client || new Client({
      authStrategy: new LocalAuth({ dataPath: config.session_path || './data/session' }),
      ...(config.web_version ? { webVersion: config.web_version } : {}),
      ...(config.web_version_cache ? { webVersionCache: config.web_version_cache } : {}),
      puppeteer: {
        headless: config.headless !== false,
        args: config.puppeteer_args || ['--no-sandbox', '--disable-setuid-sandbox']
      }
    });
    this.client.on('qr', qr => {
      this.status = 'awaiting_qr';
      this.latestQr = qr;
      qrcode.generate(qr, { small: true });
      this.logger.info('QR code exibido no terminal para autenticação.', { module: 'WHATSAPP' });
      this.emit('qr', qr);
    });
    this.client.on('ready', async () => {
      this.connected = true;
      this.status = 'ready';
      this.latestQr = null;
      this.logger.info('WhatsApp conectado.', { module: 'WHATSAPP' });
      if (typeof this.client.getWWebVersion === 'function') {
        try {
          const webVersion = await this.client.getWWebVersion();
          this.logger.info(`Versão do WhatsApp Web carregada: ${webVersion}.`, { module: 'WHATSAPP' });
        } catch (error) {
          this.logger.warn(`Não foi possível identificar a versão do WhatsApp Web: ${error.message}`, { module: 'WHATSAPP' });
        }
      }
      this.emit('ready');
    });
    this.client.on('disconnected', reason => {
      this.connected = false;
      this.status = 'disconnected';
      this.logger.warn(`WhatsApp desconectado: ${reason}`, { module: 'WHATSAPP' });
      this.emit('disconnected', reason);
      if (!this.stopping) this.scheduleReconnect();
    });
    this.client.on('auth_failure', error => {
      this.connected = false;
      this.status = 'auth_failure';
      this.logger.error(`Falha de autenticação do WhatsApp: ${error}`, { module: 'WHATSAPP' });
      this.emit('auth_failure', error);
    });
    this.reconnectTimer = null;
    this.connecting = null;
    this.stopping = false;
  }
  async connect() {
    this.stopping = false;
    if (this.connected) return;
    if (this.connecting) return this.connecting;
    this.status = 'initializing';
    this.logger.info('Iniciando conexão com o WhatsApp.', { module: 'WHATSAPP' });
    this.logger.info('Aguardando autenticação e disponibilidade do WhatsApp.', { module: 'WHATSAPP' });
    this.connecting = new Promise((resolve, reject) => {
      let settled = false;
      const cleanup = () => {
        this.client.removeListener('ready', onReady);
        this.client.removeListener('auth_failure', onAuthFailure);
        this.client.removeListener('disconnected', onDisconnected);
      };
      const finish = (error = null) => {
        if (settled) return;
        settled = true;
        cleanup();
        if (error) reject(error);
        else resolve();
      };
      const onReady = () => finish();
      const onAuthFailure = error => finish(new Error(`Falha de autenticação do WhatsApp: ${error}`));
      const onDisconnected = reason => finish(new Error(`WhatsApp desconectado durante a conexão: ${reason}`));
      this.client.once('ready', onReady);
      this.client.once('auth_failure', onAuthFailure);
      this.client.once('disconnected', onDisconnected);
      Promise.resolve(this.client.initialize())
        .then(() => {
          if (this.connected) finish();
        })
        .catch(error => {
          this.status = 'error';
          this.logger.error(`Falha ao inicializar WhatsApp: ${error.message}`, { module: 'WHATSAPP' });
          finish(error);
        });
    }).finally(() => { this.connecting = null; });
    return this.connecting;
  }
  isConnected() { return this.connected; }
  getStatus() { return this.status; }
  getLatestQr() { return this.latestQr; }
  async getConnectionDiagnostics() {
    const diagnostics = {
      clientStatus: this.status,
      connectedFlag: this.connected,
      webState: null,
      connectedUser: null
    };
    if (typeof this.client.getState === 'function') diagnostics.webState = await this.client.getState();
    if (typeof this.client.info === 'object' && this.client.info) {
      diagnostics.connectedUser = {
        wid: this.client.info.wid?._serialized || null,
        pushname: this.client.info.pushname || null,
        phone: this.client.info.me?.user || null
      };
    }
    return diagnostics;
  }
  async disconnect() {
    this.stopping = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    await this.client.destroy();
    this.connected = false;
    this.status = 'disconnected';
    this.latestQr = null;
    this.logger.info('Conexão com o WhatsApp encerrada. Sistema pausado.', { module: 'WHATSAPP' });
  }
  scheduleReconnect(delay = 5000) {
    if (this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(async () => {
      this.reconnectTimer = null;
      try { await this.connect(); }
      catch (error) { this.logger.error(`Falha na reconexão: ${error.message}`, { module: 'WHATSAPP' }); this.scheduleReconnect(Math.min(delay * 2, 60000)); }
    }, delay);
  }
}
module.exports = { WhatsAppClient };
