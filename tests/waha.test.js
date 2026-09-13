const test = require('node:test');
const assert = require('node:assert/strict');
const { WahaClient } = require('../src/adapters/whatsapp/waha-client');
const { WahaReader } = require('../src/adapters/whatsapp/waha-reader');

test('WahaReader normaliza mensagens e filtra mensagens antigas e próprias', async () => {
  const client = {
    async fetchMessages() {
      return [
        { id: 'new', timestamp: 20, from: 'g@g.us', body: 'NF', type: 'image', hasMedia: true, fromMe: false },
        { id: 'old', timestamp: 10, from: 'g@g.us', body: 'antiga', fromMe: false },
        { id: 'own', timestamp: 30, from: 'g@g.us', body: 'bot', fromMe: true }
      ];
    }
  };
  const messages = await new WahaReader(client).getMessages('g@g.us', 10);
  assert.deepEqual(messages.map(message => message.id), ['new']);
  assert.equal(messages[0].groupId, undefined);
  assert.equal(messages[0].hasMedia, true);
});

test('WahaClient consulta grupos no endpoint da sessão', async () => {
  const originalFetch = global.fetch;
  const calls = [];
  global.fetch = async (url) => {
    calls.push(url);
    return { ok: true, status: 200, async text() { return JSON.stringify([{ id: 'g@g.us', name: 'Notas Fiscais Gerais', isGroup: true }]); } };
  };
  try {
    const client = new WahaClient({ base_url: 'http://waha:3000', session_name: 'default' });
    const chat = await client.getChatById('g@g.us');
    assert.equal(chat.id._serialized, 'g@g.us');
    assert.match(calls[0], /\/api\/default\/chats$/);
  } finally {
    global.fetch = originalFetch;
  }
});
