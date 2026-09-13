const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const { loadConfig, persistGroupIdentifier } = require('../src/core/config');

const config = loadConfig();
const expectedName = config.whatsapp?.group_rules?.notas_fiscais_name || 'Notas Fiscais Gerais';
let finished = false;
let heartbeat;
let timeout;

const client = new Client({
  authStrategy: new LocalAuth({ dataPath: config.whatsapp.session_path || './data/session' }),
  ...(config.whatsapp.web_version ? { webVersion: config.whatsapp.web_version } : {}),
  ...(config.whatsapp.web_version_cache ? { webVersionCache: config.whatsapp.web_version_cache } : {}),
  puppeteer: {
    headless: config.whatsapp.headless !== false,
    args: config.whatsapp.puppeteer_args || ['--no-sandbox', '--disable-setuid-sandbox']
  }
});

client.on('qr', qr => {
  console.log('QR code necessário para autenticar esta sessão auxiliar:');
  qrcode.generate(qr, { small: true });
});

client.on('ready', async () => {
  console.log(`WhatsApp conectado. Envie uma mensagem no grupo "${expectedName}".`);
  if (typeof client.getWWebVersion === 'function') {
    try {
      console.log(`Versão do WhatsApp Web carregada: ${await client.getWWebVersion()}`);
    } catch (error) {
      console.warn(`Não foi possível identificar a versão do WhatsApp Web: ${error.message}`);
    }
  }
  console.log('Aguardando eventos de mensagem; mensagens enviadas pelo próprio número também serão consideradas.');
  heartbeat = setInterval(() => {
    console.log(`[aguardando] sessão ativa; ainda procurando "${expectedName}"...`);
  }, 15000);
});

client.on('message', handleMessage);
client.on('message_create', handleMessage);

async function handleMessage(message) {
  if (finished) return;
  try {
    const source = message.fromMe
      ? (message.to || message.id?.remote || message.from)
      : (message.from || message.id?.remote || message.to);
    console.log(`[mensagem recebida] origem=${source || 'desconhecida'} própria=${Boolean(message.fromMe)}`);
    if (!source || !source.endsWith('@g.us')) {
      console.log('[mensagem ignorada] não parece ser de um grupo.');
      return;
    }
    // O ID vem diretamente da mensagem e evita a serialização quebrada de getChat/getChatById.
    const groupId = source;
    config.whatsapp.groups.notas_fiscais = groupId;
    persistGroupIdentifier(config, 'notas_fiscais', groupId);
    finished = true;
    clearTimers();
    console.log(`Grupo recebido: "${expectedName}"`);
    console.log('Nome confirmado pelo grupo esperado informado na execução.');
    console.log(`ID salvo em config.yaml: ${groupId}`);
    await client.destroy();
  } catch (error) {
    console.error(`Falha ao obter o ID do grupo: ${error.stack || error.message}`);
  }
}

client.on('auth_failure', error => {
  clearTimers();
  console.error(`Falha de autenticação: ${error}`);
  process.exitCode = 1;
});

client.on('disconnected', reason => {
  if (!finished) {
    clearTimers();
    console.error(`Sessão auxiliar desconectada: ${reason}`);
    process.exitCode = 1;
  }
});

client.initialize().catch(error => {
  clearTimers();
  console.error(`Falha ao iniciar a sessão auxiliar: ${error.stack || error.message}`);
  process.exitCode = 1;
});

timeout = setTimeout(() => {
  if (finished) return;
  clearTimers();
  console.error('Tempo limite atingido: nenhuma mensagem do grupo esperado foi recebida.');
  client.destroy().finally(() => { process.exitCode = 2; });
}, 10 * 60 * 1000);

function clearTimers() {
  if (heartbeat) clearInterval(heartbeat);
  if (timeout) clearTimeout(timeout);
  heartbeat = null;
  timeout = null;
}

function normalize(value) {
  return String(value || '').trim().replace(/\s+/g, ' ').toLocaleLowerCase('pt-BR');
}
