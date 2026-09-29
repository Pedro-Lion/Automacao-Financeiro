const http = require('node:http');

function createEvolutionWebhookServer(handler, { host = '127.0.0.1', port = 8787, maxBodyBytes = 1024 * 1024 } = {}) {
  if (typeof handler !== 'function') throw new Error('Handler de webhook é obrigatório.');
  const server = http.createServer((request, response) => {
    if (request.method !== 'POST') {
      response.writeHead(405, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ error: 'Método não permitido.' }));
      return;
    }
    const chunks = [];
    let size = 0;
    request.on('data', chunk => {
      size += chunk.length;
      if (size <= maxBodyBytes) chunks.push(chunk);
    });
    request.on('end', () => {
      if (size > maxBodyBytes) {
        response.writeHead(413, { 'Content-Type': 'application/json' });
        response.end(JSON.stringify({ error: 'Payload muito grande.' }));
        return;
      }
      let result;
      try {
        result = handler(request.headers, Buffer.concat(chunks).toString('utf8'));
      } catch (error) {
        result = { status: 500, body: { error: error.message } };
      }
      response.writeHead(result.status || 500, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify(result.body || {}));
    });
  });
  return {
    server,
    listen() {
      return new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(port, host, () => {
          server.removeListener('error', reject);
          resolve(server.address());
        });
      });
    },
    close() {
      return new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    }
  };
}

module.exports = { createEvolutionWebhookServer };
