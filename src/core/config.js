const fs = require('node:fs');
const path = require('node:path');
const yaml = require('js-yaml');

function loadConfig(filePath = 'config.yaml') {
  const resolved = path.resolve(filePath);
  if (!fs.existsSync(resolved)) throw new Error(`Configuração não encontrada: ${resolved}. Copie config.example.yaml para config.yaml.`);
  loadDotEnv(path.join(path.dirname(resolved), 'src', '.env'));
  loadDotEnv(path.join(path.dirname(resolved), '.env'));
  const missingEnv = new Set();
  const content = fs.readFileSync(resolved, 'utf8').replace(/\$\{([A-Z0-9_]+)\}/g, (_, name) => {
    if (process.env[name] === undefined) missingEnv.add(name);
    return process.env[name] || '';
  });
  if (missingEnv.size) throw new Error(`Variáveis de ambiente ausentes: ${[...missingEnv].join(', ')}`);
  const config = yaml.load(content);
  const schemaPath = path.join(path.dirname(resolved), 'config.schema.json');
  const schema = fs.existsSync(schemaPath) ? JSON.parse(fs.readFileSync(schemaPath, 'utf8')) : null;
  validateConfig(config, schema);
  Object.defineProperty(config, '__filePath', { value: resolved, enumerable: false });
  return config;
}

function persistGroupIdentifier(config, groupKey, groupId) {
  const filePath = config?.__filePath;
  if (!filePath || !groupId) return false;
  const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/);
  let inWhatsapp = false;
  let inGroups = false;
  let replaced = false;
  const output = lines.map(line => {
    if (/^\S/.test(line)) {
      inWhatsapp = line === 'whatsapp:';
      inGroups = false;
    } else if (inWhatsapp && /^  groups:\s*$/.test(line)) {
      inGroups = true;
    } else if (inGroups && /^  \S/.test(line)) {
      inGroups = false;
    }
    if (inGroups && new RegExp(`^(\\s{4}${escapeRegExp(groupKey)}:)`).test(line)) {
      replaced = true;
      return `    ${groupKey}: "${groupId}"`;
    }
    return line;
  });
  if (!replaced) return false;
  fs.writeFileSync(filePath, output.join('\n'));
  return true;
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function loadDotEnv(filePath) {
  if (!fs.existsSync(filePath)) return;
  for (const line of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!match || process.env[match[1]] !== undefined) continue;
    process.env[match[1]] = match[2].replace(/^(['"])(.*)\1$/, '$2');
  }
}

function validateConfig(config, schema = null) {
  if (!schema) return;
  const errors = [];
  validateValue(config, schema, '$', errors);
  if (errors.length) throw new Error(`Configuração inválida:\n- ${errors.join('\n- ')}`);
}

function validateValue(value, schema, location, errors) {
  if (schema.required && (value === null || typeof value !== 'object')) {
    errors.push(`${location} deve ser um objeto`);
    return;
  }
  for (const key of schema.required || []) {
    if (value?.[key] === undefined || value?.[key] === null || value?.[key] === '') errors.push(`${location}.${key} é obrigatório`);
  }
  if (schema.type && !matchesType(value, schema.type)) errors.push(`${location} deve ser do tipo ${schema.type}`);
  if (schema.enum && !schema.enum.includes(value)) errors.push(`${location} deve ser um de: ${schema.enum.join(', ')}`);
  if (typeof value === 'number') {
    if (schema.minimum !== undefined && value < schema.minimum) errors.push(`${location} deve ser >= ${schema.minimum}`);
    if (schema.maximum !== undefined && value > schema.maximum) errors.push(`${location} deve ser <= ${schema.maximum}`);
  }
  for (const [key, childSchema] of Object.entries(schema.properties || {})) {
    if (value?.[key] !== undefined) validateValue(value[key], childSchema, `${location}.${key}`, errors);
  }
}

function matchesType(value, type) {
  if (type === 'object') return value !== null && typeof value === 'object' && !Array.isArray(value);
  if (type === 'number') return typeof value === 'number' && Number.isFinite(value);
  if (type === 'array') return Array.isArray(value);
  return typeof value === type;
}

module.exports = { loadConfig, validateConfig, persistGroupIdentifier };
