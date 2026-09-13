const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createLogger } = require('../src/core/logger');

function flush(logger) {
  return logger.closeAndFlush();
}

test('logger grava nível e módulo no formato esperado', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sapa-logs-'));
  const logger = createLogger({ logDir: dir, level: 'info' });
  logger.info('mensagem de teste', { module: 'STATE' });
  await flush(logger);
  const files = fs.readdirSync(dir).filter(file => file.endsWith('.log'));
  assert.equal(files.length, 1);
  const content = fs.readFileSync(path.join(dir, files[0]), 'utf8');
  assert.match(content, /\[[^\]]+\] \[INFO\] \[STATE\] mensagem de teste/);
});

test('logger mantém somente os 30 logs mais recentes', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sapa-logs-'));
  for (let index = 0; index < 31; index += 1) {
    const file = path.join(dir, `old-${index}.log`);
    fs.writeFileSync(file, 'old');
    const time = new Date(Date.now() - index * 1000);
    fs.utimesSync(file, time, time);
  }
  const logger = createLogger({ logDir: dir });
  logger.close();
  assert.ok(fs.readdirSync(dir).filter(file => file.endsWith('.log')).length <= 30);
});
