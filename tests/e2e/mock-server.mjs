import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const fixture = await readFile(resolve('tests/e2e/fixture.html'));
const server = createServer((request, response) => {
  if (request.method === 'OPTIONS') {
    response.writeHead(204, {
      'access-control-allow-origin': '*',
      'access-control-allow-headers': 'authorization, content-type',
      'access-control-allow-methods': 'GET, POST, OPTIONS',
    });
    response.end();
    return;
  }
  if (request.url === '/v1/chat/completions' && request.method === 'POST') {
    response.writeHead(200, {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache',
      'access-control-allow-origin': '*',
    });
    response.write('data: {"choices":[{"delta":{"content":"测试"}}]}\n\n');
    setTimeout(() => {
      response.write('data: {"choices":[{"delta":{"content":"流式回答"}}]}\n\n');
      response.end('data: [DONE]\n\n');
    }, 80);
    return;
  }
  if (request.url === '/v1/models') {
    response.writeHead(200, {
      'content-type': 'application/json',
      'access-control-allow-origin': '*',
    });
    response.end(JSON.stringify({ data: [{ id: 'e2e-model' }] }));
    return;
  }
  if (request.url === '/fixture.html' || request.url === '/fixture-csp.html') {
    const headers = { 'content-type': 'text/html; charset=utf-8' };
    if (request.url === '/fixture-csp.html') {
      headers['content-security-policy'] =
        "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'none'";
    }
    response.writeHead(200, headers);
    response.end(fixture);
    return;
  }
  response.writeHead(404);
  response.end('not found');
});
server.listen(4173, '127.0.0.1');
process.on('SIGTERM', () => server.close(() => process.exit(0)));
