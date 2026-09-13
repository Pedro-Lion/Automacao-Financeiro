const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const yaml = require('js-yaml');
const { loadConfig, persistGroupIdentifier } = require('../src/core/config');

test('config carrega YAML válido e resolve variável de ambiente', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sapa-config-'));
  fs.writeFileSync(path.join(dir, 'config.yaml'), yaml.dump({
    system: { name: 'SAPA', version: '1', language: 'pt-BR', log_level: 'info' },
    ai: { provider: 'gemini', confidence_threshold: 0.8, provider_config: { api_key: '${TEST_SAPA_KEY}' } },
    whatsapp: {}, onedrive: { base_path: './data' }, km: { rate_per_km: 1 }, features: {}
  }));
  fs.copyFileSync('config.schema.json', path.join(dir, 'config.schema.json'));
  process.env.TEST_SAPA_KEY = 'secret';
  assert.equal(loadConfig(path.join(dir, 'config.yaml')).ai.provider_config.api_key, 'secret');
  delete process.env.TEST_SAPA_KEY;
});

test('config rejeita campo obrigatório ausente com caminho', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sapa-config-'));
  fs.writeFileSync(path.join(dir, 'config.yaml'), 'system: {}\n');
  fs.copyFileSync('config.schema.json', path.join(dir, 'config.schema.json'));
  assert.throws(() => loadConfig(path.join(dir, 'config.yaml')), /\$\.system\.name é obrigatório/);
});

test('config carrega arquivo src/.env no formato KEY=VALUE', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sapa-config-'));
  fs.mkdirSync(path.join(dir, 'src'));
  fs.writeFileSync(path.join(dir, 'src', '.env'), 'TEST_SAPA_DOTENV="from-dotenv"\n');
  fs.writeFileSync(path.join(dir, 'config.yaml'), yaml.dump({
    system: { name: 'SAPA', version: '1', language: 'pt-BR', log_level: 'info' },
    ai: { provider: 'gemini', confidence_threshold: 0.8, provider_config: { api_key: '${TEST_SAPA_DOTENV}' } },
    whatsapp: {}, onedrive: { base_path: './data' }, km: { rate_per_km: 1 }, features: {}
  }));
  fs.copyFileSync('config.schema.json', path.join(dir, 'config.schema.json'));
  delete process.env.TEST_SAPA_DOTENV;
  assert.equal(loadConfig(path.join(dir, 'config.yaml')).ai.provider_config.api_key, 'from-dotenv');
  delete process.env.TEST_SAPA_DOTENV;
});

test('config persiste o identificador descoberto do grupo de notas fiscais', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sapa-config-'));
  const configPath = path.join(dir, 'config.yaml');
  fs.writeFileSync(configPath, [
    'whatsapp:',
    '  groups:',
    '    notas_fiscais: ""',
    '    gestores_geral: ""',
    '    obras: []',
    ''
  ].join('\n'));
  const config = { whatsapp: { groups: { notas_fiscais: '' } } };
  Object.defineProperty(config, '__filePath', { value: configPath, enumerable: false });

  assert.equal(persistGroupIdentifier(config, 'notas_fiscais', '120363@g.us'), true);
  assert.match(fs.readFileSync(configPath, 'utf8'), /notas_fiscais: "120363@g\.us"/);
});
