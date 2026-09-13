const fs = require('node:fs');
const path = require('node:path');

class Organizer {
  constructor(basePath = './data/onedrive', logger = { info() {}, warn() {} }, structure = {}) {
    this.basePath = path.resolve(basePath);
    this.logger = logger;
    this.structure = structure || {};
    fs.mkdirSync(this.basePath, { recursive: true });
  }

  normalizeRelativePath(relativePath = '') {
    return relativePath.replace(/\\/g, '/').replace(/^\/+/, '').replace(/\/+/g, '/');
  }

  buildPath(template, variables = {}) {
    if (!template) return '';
    return template.replace(/\{(\w+)\}/g, (_, key) => variables[key] ?? '');
  }

  resolveTemplate(relativePath, variables = {}) {
    const clean = this.normalizeRelativePath(relativePath);
    if (!clean) return this.basePath;
    return path.join(this.basePath, this.buildPath(clean, variables));
  }

  ensureFolder(relativePath, variables = {}) {
    const resolved = this.resolveTemplate(relativePath, variables);
    fs.mkdirSync(resolved, { recursive: true });
    return resolved;
  }

  ensureProjectFolders(projectName, variables = {}) {
    const defaults = this.structure || {};
    const entries = Object.values(defaults);
    for (const entry of entries) {
      const template = this.buildPath(entry, { ...variables, obra_name: projectName, project_name: projectName, obra: projectName });
      this.ensureFolder(template, { ...variables, obra_name: projectName, project_name: projectName, obra: projectName });
    }
    return this.basePath;
  }

  saveFile(sourcePath, destRelativePath, variables = {}) {
    if (!sourcePath || !fs.existsSync(sourcePath)) throw new Error(`Arquivo de origem não encontrado: ${sourcePath}`);
    const target = this.resolveTemplate(destRelativePath, variables);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(sourcePath, target);
    return target;
  }

  async uploadToMicrosoftGraph(sourcePath, remoteRelativePath, graphClient) {
    if (!graphClient || typeof graphClient.uploadFile !== 'function') {
      return this.saveFile(sourcePath, remoteRelativePath);
    }
    return graphClient.uploadFile(sourcePath, remoteRelativePath);
  }
}

module.exports = { Organizer };
