const fs = require('node:fs');
const path = require('node:path');
const Database = require('better-sqlite3');

const CURRENT_SCHEMA_VERSION = 2;

const schema = `
PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS schema_version (version INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS sync_state (
  group_id TEXT PRIMARY KEY, group_name TEXT NOT NULL DEFAULT '',
  group_type TEXT NOT NULL DEFAULT 'obra',
  last_message_id TEXT, last_timestamp INTEGER DEFAULT 0,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS obras (
  id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE,
  short_name TEXT NOT NULL UNIQUE, address TEXT, latitude REAL, longitude REAL,
  group_id TEXT, status TEXT DEFAULT 'active',
  onedrive_path TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS gestores (
  id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL,
  phone TEXT NOT NULL UNIQUE, home_address TEXT, home_lat REAL, home_lng REAL,
  is_active INTEGER DEFAULT 1, created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS prestadores (
  id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, phone TEXT UNIQUE,
  type TEXT NOT NULL, daily_rate REAL, obra_id INTEGER, is_active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY (obra_id) REFERENCES obras(id)
);
CREATE TABLE IF NOT EXISTS processed_messages (
  message_id TEXT PRIMARY KEY, group_id TEXT NOT NULL, sender_phone TEXT,
  sender_name TEXT, timestamp INTEGER NOT NULL, message_type TEXT,
  content_text TEXT, has_media INTEGER DEFAULT 0, media_local_path TEXT,
  feature_assigned TEXT, status TEXT DEFAULT 'processed', confidence REAL,
  extracted_data TEXT, processed_at TEXT DEFAULT CURRENT_TIMESTAMP,
  reviewed_at TEXT, review_notes TEXT
);
CREATE TABLE IF NOT EXISTS notas_fiscais (
  id INTEGER PRIMARY KEY AUTOINCREMENT, message_id TEXT NOT NULL, obra_id INTEGER,
  tipo TEXT NOT NULL, fornecedor TEXT, cnpj TEXT, data_compra TEXT, valor_total REAL,
  itens TEXT, is_comprovante INTEGER DEFAULT 0, nf_pendente INTEGER DEFAULT 0,
  image_local_path TEXT, onedrive_path TEXT, confidence REAL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (message_id) REFERENCES processed_messages(message_id),
  FOREIGN KEY (obra_id) REFERENCES obras(id)
);
CREATE TABLE IF NOT EXISTS km_registros (
  id INTEGER PRIMARY KEY AUTOINCREMENT, gestor_id INTEGER NOT NULL, data TEXT NOT NULL,
  trechos TEXT NOT NULL, km_total REAL NOT NULL, valor_reembolso REAL NOT NULL,
  status TEXT DEFAULT 'pending', message_id TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY (gestor_id) REFERENCES gestores(id),
  FOREIGN KEY (message_id) REFERENCES processed_messages(message_id)
);
CREATE TABLE IF NOT EXISTS decisoes (
  id INTEGER PRIMARY KEY AUTOINCREMENT, obra_id INTEGER NOT NULL, message_id TEXT NOT NULL,
  texto_decisao TEXT NOT NULL, categoria TEXT, data_decisao TEXT NOT NULL,
  participantes TEXT, media_paths TEXT, superseded_by INTEGER, confidence REAL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY (obra_id) REFERENCES obras(id),
  FOREIGN KEY (message_id) REFERENCES processed_messages(message_id),
  FOREIGN KEY (superseded_by) REFERENCES decisoes(id)
);
CREATE TABLE IF NOT EXISTS frequencia (
  id INTEGER PRIMARY KEY AUTOINCREMENT, prestador_id INTEGER NOT NULL, obra_id INTEGER NOT NULL,
  data TEXT NOT NULL, presente INTEGER DEFAULT 1, message_id TEXT, confidence REAL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (prestador_id) REFERENCES prestadores(id), FOREIGN KEY (obra_id) REFERENCES obras(id),
  UNIQUE(prestador_id, obra_id, data)
);
CREATE TABLE IF NOT EXISTS estoque (
  id INTEGER PRIMARY KEY AUTOINCREMENT, item_nome TEXT NOT NULL, nf_id INTEGER,
  fornecedor TEXT, valor_unitario REAL, quantidade INTEGER DEFAULT 1, data_compra TEXT,
  obra_compra TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (nf_id) REFERENCES notas_fiscais(id)
);
CREATE TABLE IF NOT EXISTS empreitadas (
  id INTEGER PRIMARY KEY AUTOINCREMENT, prestador_id INTEGER NOT NULL, obra_id INTEGER NOT NULL,
  descricao TEXT NOT NULL, valor_total REAL NOT NULL, parcelas TEXT, valor_pago REAL DEFAULT 0,
  status TEXT DEFAULT 'em_andamento', created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT, FOREIGN KEY (prestador_id) REFERENCES prestadores(id),
  FOREIGN KEY (obra_id) REFERENCES obras(id)
);
CREATE TABLE IF NOT EXISTS pending_reviews (
  id INTEGER PRIMARY KEY AUTOINCREMENT, message_id TEXT NOT NULL, feature TEXT NOT NULL,
  question TEXT NOT NULL, options TEXT, context_data TEXT, answered INTEGER DEFAULT 0,
  answer TEXT, asked_at TEXT DEFAULT CURRENT_TIMESTAMP, answered_at TEXT,
  FOREIGN KEY (message_id) REFERENCES processed_messages(message_id)
);
CREATE TABLE IF NOT EXISTS execution_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT, started_at TEXT NOT NULL, finished_at TEXT,
  duration_seconds REAL, messages_read INTEGER DEFAULT 0, messages_processed INTEGER DEFAULT 0,
  messages_errors INTEGER DEFAULT 0, messages_pending INTEGER DEFAULT 0, features_run TEXT,
  files_written TEXT, errors TEXT, status TEXT DEFAULT 'running'
);
CREATE TABLE IF NOT EXISTS whatsapp_inbox (
  instance_name TEXT NOT NULL,
  message_id TEXT NOT NULL,
  remote_jid TEXT NOT NULL,
  payload TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'received',
  received_at TEXT DEFAULT CURRENT_TIMESTAMP,
  processed_at TEXT,
  error TEXT,
  PRIMARY KEY (instance_name, message_id)
);
CREATE TABLE IF NOT EXISTS whatsapp_connection_state (
  instance_name TEXT PRIMARY KEY,
  state TEXT NOT NULL,
  qr TEXT,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS conciliacao (
  id INTEGER PRIMARY KEY AUTOINCREMENT, mes_referencia TEXT NOT NULL,
  fatura_item_data TEXT, fatura_item_valor REAL, fatura_item_estabelecimento TEXT,
  nf_id INTEGER, match_type TEXT, divergencia_valor REAL, observacao TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY (nf_id) REFERENCES notas_fiscais(id)
);
CREATE INDEX IF NOT EXISTS idx_messages_group ON processed_messages(group_id, timestamp);
CREATE INDEX IF NOT EXISTS idx_messages_status ON processed_messages(status);
CREATE INDEX IF NOT EXISTS idx_messages_feature ON processed_messages(feature_assigned);
CREATE INDEX IF NOT EXISTS idx_nf_obra ON notas_fiscais(obra_id);
CREATE INDEX IF NOT EXISTS idx_nf_tipo ON notas_fiscais(tipo);
CREATE INDEX IF NOT EXISTS idx_nf_data ON notas_fiscais(data_compra);
CREATE INDEX IF NOT EXISTS idx_km_gestor_data ON km_registros(gestor_id, data);
CREATE INDEX IF NOT EXISTS idx_freq_prestador ON frequencia(prestador_id, data);
CREATE INDEX IF NOT EXISTS idx_decisoes_obra ON decisoes(obra_id, data_decisao);
`;

class State {
  constructor(dbPath = path.join('data', 'sapa.db')) {
    fs.mkdirSync(path.dirname(path.resolve(dbPath)), { recursive: true });
    this.db = new Database(dbPath);
    this.db.pragma('foreign_keys = ON');
    this.db.exec(schema);
    this.migrate();
  }

  migrate() {
    const current = this.db.prepare('SELECT version FROM schema_version ORDER BY version DESC LIMIT 1').get()?.version || 0;
    if (!current) this.db.prepare('INSERT INTO schema_version(version) VALUES (?)').run(CURRENT_SCHEMA_VERSION);
    else if (current < CURRENT_SCHEMA_VERSION) this.db.prepare('UPDATE schema_version SET version = ?').run(CURRENT_SCHEMA_VERSION);
    else if (current > CURRENT_SCHEMA_VERSION) throw new Error(`Banco v${current} é mais novo que esta aplicação (v${CURRENT_SCHEMA_VERSION}).`);
  }

  markMessageProcessed(messageOrId, feature, status, data = {}, confidence = null) {
    const message = typeof messageOrId === 'string'
      ? { id: messageOrId, groupId: data.groupId || 'unknown', timestamp: data.timestamp || 0, author: data.author, type: data.type, body: data.body, hasMedia: data.hasMedia }
      : messageOrId;
    if (!message?.id) throw new Error('messageId é obrigatório.');
    if (!message.groupId) throw new Error('groupId é obrigatório.');
    if (!Number.isInteger(message.timestamp)) throw new Error('timestamp deve ser um inteiro Unix.');
    return this.db.prepare(`
      INSERT INTO processed_messages
        (message_id, group_id, sender_phone, sender_name, timestamp, message_type, content_text,
         has_media, media_local_path, feature_assigned, status, confidence, extracted_data)
      VALUES (@id, @groupId, @author, @senderName, @timestamp, @type, @body, @hasMedia,
              @mediaPath, @feature, @status, @confidence, @data)
      ON CONFLICT(message_id) DO UPDATE SET
        feature_assigned=excluded.feature_assigned, status=excluded.status,
        confidence=excluded.confidence, extracted_data=excluded.extracted_data,
        media_local_path=excluded.media_local_path
    `).run({
      ...message, feature, status, confidence,
      author: message.author || message.senderPhone || null,
      senderName: message.senderName || null, mediaPath: message.mediaPath || null,
      hasMedia: message.hasMedia ? 1 : 0, data: JSON.stringify(data)
    });
  }

  isMessageProcessed(messageId) {
    return Boolean(this.db.prepare('SELECT 1 FROM processed_messages WHERE message_id = ?').get(messageId));
  }

  getLastTimestamp(groupId) {
    return this.db.prepare('SELECT last_timestamp FROM sync_state WHERE group_id = ?').get(groupId)?.last_timestamp || 0;
  }

  updateSyncState(groupId, lastMessageId, lastTimestamp, groupName = '', groupType = 'obra') {
    if (!groupId) throw new Error('groupId é obrigatório.');
    return this.db.prepare(`
      INSERT INTO sync_state(group_id, group_name, group_type, last_message_id, last_timestamp)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(group_id) DO UPDATE SET group_name=excluded.group_name,
        group_type=excluded.group_type, last_message_id=excluded.last_message_id,
        last_timestamp=excluded.last_timestamp, updated_at=CURRENT_TIMESTAMP
    `).run(groupId, groupName, groupType, lastMessageId, lastTimestamp);
  }

  addPendingReview(review) {
    return this.db.prepare(`
      INSERT INTO pending_reviews(message_id, feature, question, options, context_data)
      VALUES (?, ?, ?, ?, ?)
    `).run(review.messageId, review.feature, review.question,
      JSON.stringify(review.options || []), JSON.stringify(review.context || {}));
  }

  getPendingReviews() {
    return this.db.prepare('SELECT * FROM pending_reviews WHERE answered = 0 ORDER BY id').all();
  }

  recordExecution(report) {
    return this.db.prepare(`
      INSERT INTO execution_log
        (started_at, finished_at, duration_seconds, messages_read, messages_processed,
         messages_errors, messages_pending, features_run, files_written, errors, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      report.startedAt, report.finishedAt, report.durationSeconds,
      report.messagesRead, report.messagesProcessed, report.messagesErrors,
      report.messagesPendingReview, JSON.stringify(report.featuresRun || []),
      JSON.stringify(report.filesWritten || []), JSON.stringify(report.errors || []),
      report.status || 'completed'
    );
  }

  getLastExecution() {
    return this.db.prepare('SELECT * FROM execution_log ORDER BY id DESC LIMIT 1').get() || null;
  }

  enqueueWhatsAppMessage(instanceName, messageId, remoteJid, payload) {
    if (!instanceName || !messageId || !remoteJid) throw new Error('Instância, messageId e remoteJid são obrigatórios.');
    return this.db.prepare(`
      INSERT OR IGNORE INTO whatsapp_inbox(instance_name, message_id, remote_jid, payload)
      VALUES (?, ?, ?, ?)
    `).run(instanceName, messageId, remoteJid, JSON.stringify(payload));
  }

  updateWhatsAppInboxStatus(instanceName, messageId, status, error = null) {
    return this.db.prepare(`
      UPDATE whatsapp_inbox SET status = ?, error = ?,
        processed_at = CASE WHEN ? IN ('processed', 'error') THEN CURRENT_TIMESTAMP ELSE processed_at END
      WHERE instance_name = ? AND message_id = ?
    `).run(status, error, status, instanceName, messageId);
  }

  getWhatsAppInbox(status = 'received', limit = 100) {
    return this.db.prepare(`
      SELECT * FROM whatsapp_inbox WHERE status = ? ORDER BY received_at, message_id LIMIT ?
    `).all(status, limit).map(item => ({ ...item, payload: JSON.parse(item.payload) }));
  }

  updateWhatsAppConnection(instanceName, state, qr = null) {
    return this.db.prepare(`
      INSERT INTO whatsapp_connection_state(instance_name, state, qr)
      VALUES (?, ?, ?)
      ON CONFLICT(instance_name) DO UPDATE SET state=excluded.state, qr=excluded.qr,
        updated_at=CURRENT_TIMESTAMP
    `).run(instanceName, state, qr);
  }

  close() { if (this.db.open) this.db.close(); }
}

module.exports = { State, CURRENT_SCHEMA_VERSION };
