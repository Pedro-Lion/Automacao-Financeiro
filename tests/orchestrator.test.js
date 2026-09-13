const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { State } = require('../src/core/state');
const { Orchestrator } = require('../src/core/orchestrator');

test('orchestrator busca, classifica, despacha e registra execução', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sapa-orchestrator-'));
  const state = new State(path.join(dir, 'state.db'));
  const calls = [];
  const logs = [];
  const message = { id: 'm1', timestamp: 10, body: 'imagem', hasMedia: true, type: 'image' };
  const feature = {
    name: 'f01_notas_fiscais',
    enabled: true,
    async initialize() { calls.push('initialize'); },
    async process(items) { calls.push(`process:${items.length}`); return { pendingReview: 1, filesWritten: ['nf.json'] }; },
    async generateOutputs() { calls.push('output'); return { filesWritten: ['gastos.xlsx'], errors: [] }; }
  };
  const orchestrator = new Orchestrator({
    config: { whatsapp: {}, ai: {} },
    state,
    logger: {
      info(message) { logs.push(message); },
      error(message) { logs.push(message); },
      debug() {}, warn() {}
    },
    whatsapp: { connected: false, client: { getChats: async () => [{ id: { _serialized: 'g1' }, name: 'Notas Fiscais Gerais', isGroup: true }], }, async connect() { this.connected = true; } },
    reader: { async getMessages() { return [message]; } },
    classifier: { async classify() { return [{ feature: 'f01_notas_fiscais', confidence: 0.9, reason: 'NF' }]; } },
    features: [feature]
  });

  assert.equal(orchestrator.resolveFeature('f01'), feature);
  const report = await orchestrator.run();
  assert.equal(report.messagesRead, 1);
  assert.equal(report.imagesFound, 1);
  assert.equal(report.messagesProcessed, 1);
  assert.equal(report.messagesPendingReview, 1);
  assert.deepEqual(report.filesWritten, ['nf.json', 'gastos.xlsx']);
  assert.deepEqual(calls, ['initialize', 'process:1', 'output']);
  assert.equal(state.getLastExecution().status, 'completed');
  assert.equal(state.getLastTimestamp('g1'), 10);
  assert.ok(logs.some(message => message.startsWith('Encontrou o grupo:')));
  assert.ok(logs.some(message => message.startsWith('Realizado Escaneamento de Mensagens:')));
  assert.ok(logs.some(message => message.startsWith('Imagens Encontradas: 1')));
  assert.ok(logs.some(message => message.startsWith('Atualizado:')));
  state.close();
});

test('orchestrator identifica e persiste o grupo padrão de notas fiscais', async () => {
  const orchestrator = new Orchestrator({
    config: { whatsapp: { groups: {} } },
    state: { getLastTimestamp() { return 0; } },
    logger: { info() {}, error() {}, debug() {}, warn() {} },
    whatsapp: {
      client: {
        getChats: async () => [
          { id: { _serialized: 'nf@g.us' }, name: 'Notas Fiscais Gerais', isGroup: true },
          { id: { _serialized: 'obra@g.us' }, name: 'Obra Pedro', isGroup: true },
          { id: { _serialized: 'outro@g.us' }, name: 'Conversas', isGroup: true }
        ]
      }
    }
  });

  const chats = await orchestrator.getChats();
  assert.deepEqual(chats, [{ id: 'nf@g.us', name: 'Notas Fiscais Gerais', type: 'nf' }]);
  assert.equal(orchestrator.config.whatsapp.groups.notas_fiscais, 'nf@g.us');
});

test('orchestrator rejeita grupo de obra que não começa com Obra', async () => {
  const orchestrator = new Orchestrator({
    config: { whatsapp: { groups: { obras: ['obra@g.us'] } } },
    state: { getLastTimestamp() { return 0; } },
    logger: { info() {}, error() {}, debug() {}, warn() {} },
    whatsapp: {
      client: {
        getChats: async () => [
          { id: { _serialized: 'nf@g.us' }, name: 'Notas Fiscais Gerais', isGroup: true },
          { id: { _serialized: 'obra@g.us' }, name: 'Pedro - Construção', isGroup: true }
        ]
      }
    }
  });

  await assert.rejects(() => orchestrator.getChats(), /deve começar com "Obra"/);
});

test('orchestrator registra quebra na validação do grupo', async () => {
  const executions = [];
  const logs = [];
  const orchestrator = new Orchestrator({
    config: { whatsapp: { groups: {} } },
    state: {
      recordExecution(report) { executions.push(report); }
    },
    logger: {
      info(message) { logs.push(message); },
      error(message) { logs.push(message); },
      debug() {}, warn() {}
    },
    whatsapp: {
      connect: async () => {},
      client: { getChats: async () => [] }
    },
    reader: {},
    classifier: {},
    features: []
  });

  const report = await orchestrator.run();
  assert.equal(report.status, 'failed');
  assert.equal(executions[0].status, 'failed');
  assert.ok(logs.some(message => message.startsWith('Fluxo interrompido na conexão/validação dos grupos:')));
});
