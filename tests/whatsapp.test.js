const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { EventEmitter } = require('node:events');
const { WhatsAppReader } = require('../src/adapters/whatsapp/reader');
const { WhatsAppSender } = require('../src/adapters/whatsapp/sender');
const { WhatsAppMedia } = require('../src/adapters/whatsapp/media');
const { WhatsAppClient } = require('../src/adapters/whatsapp/client');

test('reader pagina mensagens e remove mensagens do bot', async () => {
  const pages = [
    [{ id: { _serialized: 'm3' }, timestamp: 30, fromMe: false, from: 'g@g.us', type: 'chat', body: 'três', hasMedia: false },
     { id: { _serialized: 'm2' }, timestamp: 20, fromMe: false, from: 'g@g.us', type: 'chat', body: 'dois', hasMedia: false }],
    [{ id: { _serialized: 'm1' }, timestamp: 10, fromMe: true, from: 'g@g.us', type: 'chat', body: 'um', hasMedia: false }]
  ];
  const fake = { client: { getChatById: async () => ({ fetchMessages: async () => pages.shift() || [] }) } };
  const messages = await new WhatsAppReader(fake).getMessages('g@g.us', 0);
  assert.deepEqual(messages.map(message => message.id), ['m2', 'm3']);
});

test('sender envia para chat privado normalizado', async () => {
  const calls = [];
  const fake = { client: { sendMessage: async (...args) => { calls.push(args); return { id: 'sent' }; } } };
  const logger = { info() {}, error() {} };
  const result = await new WhatsAppSender(fake, logger).sendMessage('+55 (11) 99999-0001', 'Olá');
  assert.equal(result.id, 'sent');
  assert.deepEqual(calls, [['5511999990001@c.us', 'Olá']]);
});

test('media aplica timeout e limpa temporários', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sapa-media-'));
  const media = new WhatsAppMedia(dir);
  await assert.rejects(() => media.downloadMedia({ id: 'm1', hasMedia: true, downloadMedia: () => new Promise(() => {}) }, 5), /timeout/);
  fs.writeFileSync(path.join(dir, 'old.tmp'), 'x');
  media.cleanupTemp();
  assert.deepEqual(fs.readdirSync(dir), []);
});

test('cliente WhatsApp expõe estado e QR recebido', async () => {
  const fakeClient = new EventEmitter();
  fakeClient.initialize = async () => {};
  fakeClient.destroy = async () => {};
  fakeClient.getState = async () => 'CONNECTED';
  fakeClient.info = { wid: { _serialized: '5511999999999@c.us' }, pushname: 'Teste', me: { user: '5511999999999' } };
  const logger = { info() {}, warn() {}, error() {} };
  const client = new WhatsAppClient({ session_path: './data/test-session' }, logger, fakeClient);
  const connection = client.connect();
  fakeClient.emit('qr', 'qr-test');
  assert.equal(client.getStatus(), 'awaiting_qr');
  assert.equal(client.getLatestQr(), 'qr-test');
  fakeClient.emit('ready');
  await connection;
  assert.equal(client.isConnected(), true);
  assert.equal(client.getStatus(), 'ready');
  assert.equal(client.getLatestQr(), null);
  assert.deepEqual(await client.getConnectionDiagnostics(), {
    clientStatus: 'ready',
    connectedFlag: true,
    webState: 'CONNECTED',
    connectedUser: { wid: '5511999999999@c.us', pushname: 'Teste', phone: '5511999999999' }
  });
  await client.disconnect();
});
