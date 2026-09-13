const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { State } = require('../src/core/state');

test('state registra mensagens de forma idempotente', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sapa-'));
  const state = new State(path.join(dir, 'state.db'));
  const message = { id: 'm1', groupId: 'g1', author: '5511', timestamp: 1, type: 'chat', body: 'ok', hasMedia: false };
  state.markMessageProcessed(message, 'f01', 'processed', { ok: true });
  state.markMessageProcessed(message, 'f01', 'processed', { ok: true });
  assert.equal(state.db.prepare('SELECT COUNT(*) AS count FROM processed_messages').get().count, 1);
  state.close();
});

test('state cria tabelas do modelo e atualiza cursor do grupo', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sapa-'));
  const state = new State(path.join(dir, 'state.db'));
  const tables = state.db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().map(row => row.name);
  for (const table of ['sync_state', 'processed_messages', 'notas_fiscais', 'km_registros', 'decisoes', 'frequencia', 'estoque', 'empreitadas', 'pending_reviews', 'execution_log', 'conciliacao']) {
    assert.ok(tables.includes(table), `tabela ausente: ${table}`);
  }
  state.updateSyncState('g1', 'm2', 42, 'Grupo', 'obra');
  assert.equal(state.getLastTimestamp('g1'), 42);
  state.close();
});
