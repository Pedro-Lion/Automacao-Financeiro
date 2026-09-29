const fs = require('node:fs');
const { loadConfig } = require('./core/config');
const { createLogger } = require('./core/logger');
const { State } = require('./core/state');
const { WhatsAppClient } = require('./adapters/whatsapp/client');
const { WhatsAppReader } = require('./adapters/whatsapp/reader');
const { WahaClient } = require('./adapters/whatsapp/waha-client');
const { WahaReader } = require('./adapters/whatsapp/waha-reader');
const { EvolutionClient } = require('./adapters/whatsapp/evolution-client');
const { EvolutionReader } = require('./adapters/whatsapp/evolution-reader');
const { MessageClassifier } = require('./core/classifier');
const { Orchestrator } = require('./core/orchestrator');
const { F01NotasFiscais } = require('./features/f01-notas-fiscais');
const { F02Conciliacao } = require('./features/f02-conciliacao');
const { F03Quilometragem } = require('./features/f03-quilometragem');
const { F04Atas } = require('./features/f04-atas');
const { F05Midias } = require('./features/f05-midias');
const { F06Estoque } = require('./features/f06-estoque');
const { F07Frequencia } = require('./features/f07-frequencia');
const { F08Terceirizados } = require('./features/f08-terceirizados');
const { F09Agendamento } = require('./features/f09-agendamento');

async function main() {
  const command = process.argv[2] || 'run';
  if (!fs.existsSync('config.yaml')) throw new Error('config.yaml não encontrado. Copie config.example.yaml para config.yaml.');
  const config = loadConfig();
  const logger = createLogger({ level: config.system.log_level });
  logger.info(`SAPA iniciado. Comando: ${command}.`, { module: 'APP' });
  if (Number(process.versions.node.split('.')[0]) < 24) {
    const message = `Runtime incompatível: o SAPA requer Node.js 24 ou superior para o better-sqlite3 atual. Versão detectada: ${process.version}.`;
    logger.error(message, { module: 'APP' });
    await logger.closeAndFlush();
    throw new Error(message);
  }
  const state = command === 'setup' ? null : new State();
  const whatsapp = config.whatsapp.provider === 'waha'
    ? new WahaClient(config.whatsapp, logger)
    : config.whatsapp.provider === 'evolution'
      ? new EvolutionClient(config.whatsapp, logger)
      : new WhatsAppClient(config.whatsapp, logger);
  const featureClasses = [F01NotasFiscais, F02Conciliacao, F03Quilometragem, F04Atas, F05Midias, F06Estoque, F07Frequencia, F08Terceirizados, F09Agendamento];
  const features = featureClasses.map(Feature => {
    const feature = new Feature(config, {});
    feature.enabled = config.features[feature.name] !== false;
    return feature;
  });
  const reader = config.whatsapp.provider === 'waha'
    ? new WahaReader(whatsapp)
    : config.whatsapp.provider === 'evolution'
      ? new EvolutionReader(whatsapp, state, config.whatsapp.instance_name || config.whatsapp.session_name)
      : new WhatsAppReader(whatsapp);
  const orchestrator = new Orchestrator({ config, state, logger, whatsapp, reader, classifier: new MessageClassifier(), features });
  try {
    if (command === 'setup') {
      await orchestrator.setup();
      logger.info('Autenticação do WhatsApp iniciada. Aguardando QR/code e conexão do cliente.', { module: 'APP' });
      await new Promise(() => {});
    }
    else if (command === 'run') {
      const featureArg = process.argv.indexOf('--feature');
      const featureName = featureArg >= 0 ? process.argv[featureArg + 1] : null;
      if (featureArg >= 0 && !featureName) throw new Error('Informe uma feature após --feature.');
      console.log(JSON.stringify(featureName ? await orchestrator.runFeature(featureName) : await orchestrator.run(), null, 2));
    }
    else if (command === 'status') console.log(JSON.stringify({ pendingReviews: state.getPendingReviews().length, lastExecution: state.getLastExecution() }, null, 2));
    else if (command === 'reviews') console.log(JSON.stringify(state.getPendingReviews(), null, 2));
    else throw new Error(`Comando desconhecido: ${command}`);
  } finally {
    state?.close();
    if (command !== 'setup') {
      await whatsapp.disconnect().catch(error => logger.error(`Falha ao pausar o WhatsApp: ${error.message}`, { module: 'APP' }));
      logger.info('SAPA pausado.', { module: 'APP' });
    }
    await logger.closeAndFlush().catch(error => {
      console.error(`[SAPA] Falha ao salvar os logs: ${error.message}`);
      process.exitCode = 1;
    });
  }
}
main().catch(error => {
  console.error(`[SAPA] ${error.stack || error.message}`);
  process.exitCode = 1;
});
