const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { EvolutionClient } = require('../src/adapters/whatsapp/evolution-client');
const { EvolutionReader, normalizeMessage } = require('../src/adapters/whatsapp/evolution-reader');
const { EvolutionMedia } = require('../src/adapters/whatsapp/evolution-media');
const { EvolutionClient: Client } = require('../src/adapters/whatsapp/evolution-client');
const { EvolutionClient: Evolution } = require('../src/adapters/whatsapp/evolution-client');
const { State } = require('../src/core/state');
const { createEvolutionWebhookHandler } = require('../src/adapters/whatsapp/evolution-webhook');
const { createEvolutionWebhookServer } = require('../src/adapters/whatsapp/evolution-webhook-server');

test('EvolutionReader normaliza texto, imagem e filtra mensagem própria', async () => {
  const client = { fetchMessages: async () => [
    { key: { id: 'm2', remoteJid: 'g@g.us', fromMe: false }, messageTimestamp: 2000, message: { imageMessage: { caption: 'NF', mimetype: 'image/jpeg' } } },
    { key: { id: 'm1', remoteJid: 'g@g.us', fromMe: true }, messageTimestamp: 1000, message: { conversation: 'bot' } }
  ] };
  const messages = await new EvolutionReader(client).getMessages('g@g.us', 0);
  assert.deepEqual(messages.map(item => item.id), ['m2']);
  assert.equal(messages[0].type, 'image');
  assert.equal(messages[0].caption, 'NF');
});

test('EvolutionClient usa apikey e normaliza grupo', async () => {
  const originalFetch = global.fetch;
  const calls = [];
  global.fetch = async (url, options) => {
    calls.push({ url, options });
    let body = {};
    if (url.endsWith('/')) body = { ok: true };
    if (url.includes('/chat/findChats/')) body = [{ id: 'g@g.us', name: 'Notas Fiscais Gerais' }];
    return { ok: true, status: 200, async text() { return JSON.stringify(body); } };
  };
  try {
    const client = new EvolutionClient({ base_url: 'http://evolution:8080', api_key: 'secret', instance_name: 'sapa', retry_count: 0 });
    const chats = await client.getChats();
    assert.equal(chats[0].id, 'g@g.us');
    assert.equal(calls[0].options.headers.apikey, 'secret');
    assert.equal(calls[0].options.headers['X-Api-Key'], undefined);
  } finally {
    global.fetch = originalFetch;
  }
});

test('EvolutionClient solicita pairing code pelo número sem expor QR', async () => {
  const originalFetch = global.fetch;
  const calls = [];
  global.fetch = async (url, options) => {
    calls.push({ url, options });
    let body = {};
    if (url.endsWith('/')) body = { ok: true };
    if (url.includes('/instance/fetchInstances')) body = [];
    if (url.includes('/instance/create')) body = { instance: { instanceName: 'sapa' } };
    if (url.includes('/instance/connectionState/')) body = { instance: { state: 'connecting' } };
    if (url.includes('/instance/connect/')) body = { pairingCode: '1234-5678' };
    return { ok: true, status: 200, async text() { return JSON.stringify(body); } };
  };
  try {
    const client = new EvolutionClient({
      base_url: 'http://evolution:8080',
      api_key: 'secret',
      instance_name: 'sapa',
      phone_number: '+55 (11) 99999-0000',
      pairing_code: true,
      retry_count: 0
    });
    await client.connect();
    const connectCall = calls.find(call => call.url.includes('/instance/connect/'));
    assert.match(connectCall.url, /number=5511999990000/);
    assert.equal(client.getLatestPairingCode(), '1234-5678');
    assert.equal(client.getLatestQr(), null);
    assert.equal(client.getStatus(), 'awaiting_pairing_code');
  } finally {
    global.fetch = originalFetch;
  }
});

test('EvolutionClient rejeita pairing code sem número', async () => {
  const originalFetch = global.fetch;
  const originalPhoneEnv = process.env.EVOLUTION_PHONE_NUMBER;
  delete process.env.EVOLUTION_PHONE_NUMBER;
  global.fetch = async (url) => {
    let body = {};
    if (url.endsWith('/')) body = { ok: true };
    if (url.includes('/instance/fetchInstances')) body = [{ instanceName: 'sapa' }];
    if (url.includes('/instance/connectionState/')) body = { instance: { state: 'connecting' } };
    return { ok: true, status: 200, async text() { return JSON.stringify(body); } };
  };
  try {
    const client = new EvolutionClient({
      base_url: 'http://evolution:8080',
      api_key: 'secret',
      instance_name: 'sapa',
      pairing_code: true,
      retry_count: 0
    });
    await assert.rejects(client.connect(), /phone_number.*EVOLUTION_PHONE_NUMBER/);
  } finally {
    global.fetch = originalFetch;
    if (originalPhoneEnv !== undefined) {
      process.env.EVOLUTION_PHONE_NUMBER = originalPhoneEnv;
    }
  }
});

test('EvolutionMedia salva base64 com extensão segura', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sapa-evolution-media-'));
  const media = new EvolutionMedia({ downloadMedia: async () => ({ base64: Buffer.from('hello').toString('base64'), mimetype: 'text/plain' }) }, dir);
  const target = await media.downloadMedia({ id: 'm/1', from: 'g@g.us', hasMedia: true });
  assert.equal(fs.readFileSync(target, 'utf8'), 'hello');
  assert.match(target, /m_1\.plain$/);
});

test('webhook Evolution persiste mensagem uma única vez', () => {
  const dbPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'sapa-evolution-state-')), 'state.db');
  const state = new State(dbPath);
  const handler = createEvolutionWebhookHandler({ state, instanceName: 'sapa', secret: 'web-secret' });
  const payload = { event: 'MESSAGES_UPSERT', instance: 'sapa', data: { key: { id: 'm1', remoteJid: 'g@g.us' }, message: { conversation: 'NF' } } };
  assert.equal(handler({ 'x-evolution-secret': 'web-secret' }, payload).status, 200);
  assert.equal(handler({ 'x-evolution-secret': 'web-secret' }, payload).status, 200);
  assert.equal(state.getWhatsAppInbox().length, 1);
  assert.equal(handler({ 'x-evolution-secret': 'wrong' }, payload).status, 401);
  state.close();
});

test('EvolutionReader consome inbox antes do polling e marca mensagem processada', async () => {
  const statuses = [];
  const state = {
    getWhatsAppInbox: () => [{
      instance_name: 'sapa',
      message_id: 'm-inbox',
      payload: {
        key: { id: 'm-inbox', remoteJid: 'g@g.us', fromMe: false },
        messageTimestamp: 20,
        message: { conversation: 'mensagem recebida' }
      }
    }],
    updateWhatsAppInboxStatus: (...args) => statuses.push(args)
  };
  const { EvolutionReader } = require('../src/adapters/whatsapp/evolution-reader');
  const reader = new EvolutionReader({ instance: 'sapa', fetchMessages: async () => { throw new Error('polling não deveria ocorrer'); } }, state);
  const messages = await reader.getMessages('g@g.us', 0);
  assert.equal(messages[0].body, 'mensagem recebida');
  assert.deepEqual(statuses[0], ['sapa', 'm-inbox', 'processed']);
});

test('normalizador rejeita payload sem id ou chat', () => {
  assert.equal(normalizeMessage({ message: { conversation: 'sem chave' } }), null);
});

test('servidor de webhook rejeita método diferente de POST', async () => {
  const server = createEvolutionWebhookServer(() => ({ status: 200, body: { ok: true } }), { port: 0 });
  const address = await server.listen();
  try {
    const response = await fetch(`http://127.0.0.1:${address.port}`, { method: 'GET' });
    assert.equal(response.status, 405);
  } finally {
    await server.close();
  }
});
