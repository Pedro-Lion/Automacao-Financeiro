const fs = require('node:fs');
const path = require('node:path');
const winston = require('winston');

function createLogger(config = {}) {
  const logDir = path.resolve(config.logDir || 'logs');
  fs.mkdirSync(logDir, { recursive: true });
  const filename = path.join(logDir, `${new Date().toISOString().slice(0, 10)}_${new Date().toTimeString().slice(0, 5).replace(':', '-')}.log`);
  const format = winston.format.printf(({ timestamp, level, message, module = 'SYSTEM' }) => `[${timestamp}] [${level.toUpperCase()}] [${module}] ${message}`);
  const logger = winston.createLogger({
    level: config.level || 'info',
    format: winston.format.combine(winston.format.timestamp(), format),
    transports: [new winston.transports.Console(), new winston.transports.File({ filename })]
  });
  logger.closeAndFlush = () => new Promise((resolve, reject) => {
    const onError = error => {
      logger.removeListener('finish', onFinish);
      reject(error);
    };
    const onFinish = () => {
      logger.removeListener('error', onError);
      resolve();
    };
    logger.once('error', onError);
    logger.once('finish', onFinish);
    logger.end();
  });
  rotateLogs(logDir, 30);
  return logger;
}

function rotateLogs(logDir, keep) {
  const files = fs.readdirSync(logDir).filter(file => file.endsWith('.log'))
    .map(file => ({ file, mtime: fs.statSync(path.join(logDir, file)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime);
  for (const entry of files.slice(keep)) fs.rmSync(path.join(logDir, entry.file), { force: true });
}

module.exports = { createLogger };
