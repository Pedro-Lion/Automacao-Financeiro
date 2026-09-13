const { persistGroupIdentifier } = require('./config');

class Orchestrator {
  constructor({ config, state, logger, whatsapp, reader, classifier, features = [] }) {
    this.config = config; this.state = state; this.logger = logger; this.whatsapp = whatsapp; this.reader = reader; this.classifier = classifier; this.features = features;
  }
  async setup() { await this.whatsapp.connect(); this.logger.info('SAPA configurado e pronto.'); }
  async run({ featureName = null } = {}) {
    const started = Date.now();
    this.logger.info(`Execução iniciada${featureName ? ` para ${featureName}` : ''}.`, { module: 'ORCHESTRATOR' });
    const enabledFeatures = this.features.filter(item => item.enabled !== false
      && (!featureName || item.name === featureName));
    const report = {
      startedAt: new Date(started).toISOString(), finishedAt: null, durationSeconds: 0,
      messagesRead: 0, messagesProcessed: 0, messagesErrors: 0, messagesPendingReview: 0,
      imagesFound: 0, featuresRun: enabledFeatures.map(feature => feature.name),
      filesWritten: [], errors: [], status: 'completed'
    };
    let chats;
    try {
      this.logger.info('Aguardando conexão do WhatsApp para iniciar a leitura.', { module: 'ORCHESTRATOR' });
      await this.whatsapp.connect();
      const diagnostics = await this.whatsapp.getConnectionDiagnostics?.();
      if (diagnostics) {
        this.logger.info(`Sessão WhatsApp validada: ${JSON.stringify(diagnostics)}.`, { module: 'ORCHESTRATOR' });
      }
      this.logger.info('Conexão disponível. Validando grupos autorizados.', { module: 'ORCHESTRATOR' });
      chats = await this.getChats();
    } catch (error) {
      report.status = 'failed';
      report.messagesErrors += 1;
      report.errors.push({ stage: 'connect-or-validate-groups', message: error.message });
      this.logger.error(`Fluxo interrompido na conexão/validação dos grupos: ${formatError(error)}`, { module: 'ORCHESTRATOR' });
      report.finishedAt = new Date().toISOString();
      report.durationSeconds = (Date.now() - started) / 1000;
      this.state.recordExecution(report);
      this.logger.warn('Sistema pausado após falha de conexão ou validação.', { module: 'ORCHESTRATOR' });
      return report;
    }
    const featureMessages = new Map(enabledFeatures.map(feature => [feature.name, []]));

    for (const feature of enabledFeatures) {
      await feature.initialize?.(this.config, { whatsapp: this.whatsapp, state: this.state, reader: this.reader });
    }

    for (const chat of chats) {
      const since = this.state.getLastTimestamp(chat.id);
      try {
        const messages = await this.reader.getMessages(chat.id, since);
        const imagesFound = messages.filter(message => message.hasMedia && ['image', 'sticker'].includes(message.type)).length;
        report.messagesRead += messages.length;
        report.imagesFound += imagesFound;
        this.logger.info(
          `Realizado Escaneamento de Mensagens: ${messages.length} mensagem(ns) no grupo "${chat.name}".`,
          { module: 'ORCHESTRATOR' }
        );
        this.logger.info(
          `Imagens Encontradas: ${imagesFound} no grupo "${chat.name}".`,
          { module: 'ORCHESTRATOR' }
        );
        for (const message of messages) {
          const enriched = { ...message, groupId: chat.id, groupType: chat.type, groupName: chat.name };
          const classifications = await this.classifier.classify(enriched, chat.type, { categories: this.config.ai?.categories || [] });
          if (!classifications.length) {
            this.state.markMessageProcessed(enriched, 'unclassified', 'processed', { classifications: [] });
          }
          for (const classification of classifications) {
            const bucket = featureMessages.get(classification.feature);
            if (!bucket) continue;
            bucket.push({ message: enriched, classification });
          }
          const featureNames = classifications.map(item => item.feature);
          this.state.markMessageProcessed(enriched, featureNames.join(','), 'classified', { classifications });
          report.messagesProcessed += 1;
        }
        if (messages.length) {
          const last = messages[messages.length - 1];
          this.state.updateSyncState(chat.id, last.id, last.timestamp, chat.name, chat.type);
          this.logger.info(
            `Atualizado: cursor do grupo "${chat.name}" até a mensagem ${last.id}.`,
            { module: 'ORCHESTRATOR' }
          );
        } else {
          this.logger.info(
            `Atualizado: nenhuma mensagem nova no grupo "${chat.name}".`,
            { module: 'ORCHESTRATOR' }
          );
        }
      } catch (error) {
        report.messagesErrors += 1;
        report.errors.push({ stage: 'fetch-or-classify', chatId: chat.id, message: error.message });
        this.logger.error(`Fluxo interrompido no escaneamento do grupo ${chat.id}: ${error.message}`, { module: 'ORCHESTRATOR' });
      }
    }

    for (const feature of enabledFeatures) {
      try {
        const items = featureMessages.get(feature.name) || [];
        if (items.length && feature.process) {
          const result = await feature.process(items, { state: this.state, whatsapp: this.whatsapp, reader: this.reader });
          report.messagesPendingReview += Number(result?.pendingReview || 0);
          report.filesWritten.push(...(result?.filesWritten || []));
        }
      } catch (error) {
        report.messagesErrors += 1;
        report.errors.push({ stage: 'dispatch', feature: feature.name, message: error.message });
        this.logger.error(`Feature ${feature.name} falhou: ${error.message}`, { module: 'ORCHESTRATOR' });
      }
    }

    for (const feature of enabledFeatures) {
      try {
        const output = await feature.generateOutputs?.();
        report.filesWritten.push(...(output?.filesWritten || []));
        report.errors.push(...(output?.errors || []).map(message => ({ stage: 'output', feature: feature.name, message })));
      } catch (error) {
        report.messagesErrors += 1;
        report.errors.push({ stage: 'output', feature: feature.name, message: error.message });
      }
    }

    report.finishedAt = new Date().toISOString();
    report.durationSeconds = (Date.now() - started) / 1000;
    report.summary = `SAPA executado em ${report.durationSeconds}s`;
    this.state.recordExecution(report);
    this.logger.info(
      `Atualizado: execução concluída. Mensagens lidas: ${report.messagesRead}; imagens encontradas: ${report.imagesFound}; erros: ${report.messagesErrors}.`,
      { module: 'ORCHESTRATOR' }
    );
    this.logger.info(report.summary, { module: 'ORCHESTRATOR' });
    this.logger.info('Sistema pausado após a execução.', { module: 'ORCHESTRATOR' });
    return report;
  }
  async runFeature(name) {
    const feature = this.resolveFeature(name);
    if (!feature) throw new Error(`Feature não encontrada: ${name}`);
    return this.run({ featureName: feature.name });
  }
  async reprocess() { return this.run(); }

  resolveFeature(name) {
    const normalized = String(name || '').trim();
    const featureNumber = normalized.replace(/\D/g, '');
    const featureAlias = featureNumber
      ? `f${featureNumber.padStart(2, '0')}_notas_fiscais`
      : null;
    return this.features.find(item => item.name === normalized
      || item.name === featureAlias);
  }

  async getChats() {
    const groups = this.config.whatsapp?.groups || {};
    const rules = this.config.whatsapp?.group_rules || {};
    const nfName = rules.notas_fiscais_name || 'Notas Fiscais Gerais';
    const obraPrefix = rules.obras_name_prefix || 'Obra';
    const configuredId = typeof groups.notas_fiscais === 'string' ? groups.notas_fiscais.trim() : '';
    if (configuredId && typeof this.whatsapp.client?.getChatById === 'function') {
      this.logger.info(`Validando diretamente o grupo configurado: ${configuredId}.`, { module: 'ORCHESTRATOR' });
      const chat = await this.whatsapp.client.getChatById(configuredId);
      if (!chat?.isGroup) throw new Error(`O identificador ${configuredId} não corresponde a um grupo.`);
      const directChat = { id: configuredId, name: chat.name || configuredId, type: 'nf' };
      if (normalizeChatName(directChat.name) !== normalizeChatName(nfName)) {
        throw new Error(`O identificador configurado aponta para "${directChat.name}", mas o nome esperado é "${nfName}".`);
      }
      this.logger.info(`Encontrou o grupo: ${directChat.name} (${directChat.id}).`, { module: 'ORCHESTRATOR' });
      return [directChat];
    }
    if (typeof this.whatsapp.client?.getChats !== 'function') {
      throw new Error('Cliente WhatsApp não disponibiliza getChats() e nenhum ID de grupo foi configurado.');
    }
    let chats;
    let lastError;
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try {
        this.logger.info(`Lendo grupos do WhatsApp (tentativa ${attempt}/3).`, { module: 'ORCHESTRATOR' });
        await delay(attempt === 1 ? 1500 : 2500);
        chats = await this.whatsapp.client.getChats();
        break;
      } catch (error) {
        lastError = error;
        this.logger.warn(`Falha ao listar grupos na tentativa ${attempt}/3: ${formatError(error)}`, { module: 'ORCHESTRATOR' });
      }
    }
    if (!chats) {
      throw new Error(`Sessão autenticada, mas a API getChats() do WhatsApp Web falhou. Configure o ID de "${nfName}" em whatsapp.groups.notas_fiscais ou reinicie a sessão. Causa: ${formatError(lastError)}`);
    }
    const available = chats.filter(chat => chat.isGroup).map(chat => ({
      id: chat.id._serialized, name: chat.name || chat.id._serialized,
      type: 'obra'
    }));
    const nfChat = configuredId
      ? available.find(chat => chat.id === configuredId)
      : available.find(chat => normalizeChatName(chat.name) === normalizeChatName(nfName));

    if (!nfChat) {
      const detail = configuredId
        ? `ID configurado não encontrado: ${configuredId}`
        : `grupo "${nfName}" não encontrado`;
      throw new Error(`Grupo de notas fiscais não validado: ${detail}.`);
    }
    if (normalizeChatName(nfChat.name) !== normalizeChatName(nfName)) {
      throw new Error(`O identificador configurado para notas fiscais aponta para "${nfChat.name}", mas o nome esperado é "${nfName}".`);
    }
    const obraIds = Array.isArray(groups.obras) ? groups.obras.filter(Boolean) : [];
    for (const obraId of obraIds) {
      const obra = available.find(chat => chat.id === obraId);
      if (!obra) throw new Error(`Grupo de obra configurado não encontrado: ${obraId}.`);
      if (!new RegExp(`^${escapeRegExp(obraPrefix)}\\b`, 'i').test(obra.name)) {
        throw new Error(`O grupo "${obra.name}" não atende à regra de nome: deve começar com "${obraPrefix}".`);
      }
    }
    nfChat.type = 'nf';
    if (!configuredId) {
      groups.notas_fiscais = nfChat.id;
      persistGroupIdentifier(this.config, 'notas_fiscais', nfChat.id);
    }
    this.logger.info(`Encontrou o grupo: ${nfChat.name} (${nfChat.id}).`, { module: 'ORCHESTRATOR' });
    return [nfChat];
  }
}

function normalizeChatName(name) {
  return String(name || '').trim().replace(/\s+/g, ' ').toLocaleLowerCase('pt-BR');
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function delay(milliseconds) {
  return new Promise(resolve => setTimeout(resolve, milliseconds));
}

function formatError(error) {
  return error?.stack || error?.message || String(error);
}

module.exports = { Orchestrator };
