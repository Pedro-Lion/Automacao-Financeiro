const { spawn } = require('node:child_process');
const path = require('node:path');

function execPython(script, inputObject, options = {}) {
  const timeout = options.timeout || 60000;
  return new Promise((resolve, reject) => {
    const child = spawn(options.python || 'python', [path.resolve('src/python', script)], { stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => { child.kill(); reject(new Error(`Python excedeu o timeout de ${timeout}ms`)); }, timeout);
    child.stdout.on('data', chunk => { stdout += chunk; });
    child.stderr.on('data', chunk => { stderr += chunk; });
    child.on('error', error => { clearTimeout(timer); reject(error); });
    child.on('close', code => {
      clearTimeout(timer);
      if (code !== 0) return reject(new Error(stderr.trim() || `Python encerrou com código ${code}`));
      try { resolve(JSON.parse(stdout)); } catch { reject(new Error(`Resposta Python não é JSON válido: ${stdout}`)); }
    });
    child.stdin.end(JSON.stringify(inputObject));
  });
}

module.exports = { execPython };
