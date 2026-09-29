const fs = require('node:fs');
const path = require('node:path');

class EvolutionMedia {
  constructor(client, tmpDir = path.join('data', 'tmp')) {
    this.client = client;
    this.tmpDir = tmpDir;
    fs.mkdirSync(tmpDir, { recursive: true });
  }

  async downloadMedia(message, timeoutMs = 60000) {
    if (!message?.hasMedia || !message.id) throw new Error('Mensagem não contém mídia baixável.');
    const result = await Promise.race([
      this.client.downloadMedia(message),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Download de mídia excedeu o timeout.')), timeoutMs))
    ]);
    const data = result?.base64 || result?.data;
    if (!data || typeof data !== 'string') throw new Error('Mídia vazia ou expirada.');
    const content = Buffer.from(data.replace(/^data:[^;]+;base64,/, ''), 'base64');
    if (!content.length) throw new Error('Arquivo de mídia corrompido ou vazio.');
    const ext = safeExtension(result?.mimetype || message.mimetype || 'application/octet-stream');
    const target = path.join(this.tmpDir, `${safeName(message.id)}.${ext}`);
    fs.writeFileSync(target, content);
    return target;
  }
}

function safeName(value) {
  const name = String(value).replace(/[^a-zA-Z0-9_-]/g, '_');
  if (!name) throw new Error('ID de mídia inválido.');
  return name;
}

function safeExtension(mimetype) {
  const ext = String(mimetype).split('/')[1]?.split(';')[0]?.replace(/[^a-zA-Z0-9]/g, '');
  return ext || 'bin';
}

module.exports = { EvolutionMedia };
