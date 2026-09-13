const fs = require('node:fs');
const path = require('node:path');
class WhatsAppMedia {
  constructor(tmpDir = path.join('data', 'tmp')) { this.tmpDir = tmpDir; fs.mkdirSync(tmpDir, { recursive: true }); }
  async downloadMedia(message, timeoutMs = 60000) {
    if (!message || !message.hasMedia || typeof message.downloadMedia !== 'function') throw new Error('Mensagem não contém mídia baixável.');
    const media = await Promise.race([
      message.downloadMedia(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Download de mídia excedeu o timeout.')), timeoutMs))
    ]);
    if (!media?.data) throw new Error('Mídia vazia ou expirada.');
    const ext = (media.mimetype || 'application/octet-stream').split('/')[1] || 'bin';
    const target = path.join(this.tmpDir, `${message.id}.${ext}`);
    const content = Buffer.from(media.data, 'base64');
    if (!content.length) throw new Error('Arquivo de mídia corrompido ou vazio.');
    fs.writeFileSync(target, content);
    return target;
  }
  cleanupTemp() {
    for (const file of fs.readdirSync(this.tmpDir)) fs.rmSync(path.join(this.tmpDir, file), { force: true });
  }
}
module.exports = { WhatsAppMedia };
