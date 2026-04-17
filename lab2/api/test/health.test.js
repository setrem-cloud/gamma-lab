const http = require('http');
const server = require('../server');

let passed = 0;
let failed = 0;

function request(path) {
  return new Promise((resolve, reject) => {
    const req = http.get(`http://localhost:8080${path}`, (res) => {
      let body = '';
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => {
        resolve({ status: res.statusCode, body: JSON.parse(body) });
      });
    });
    req.on('error', reject);
  });
}

function assert(name, condition) {
  if (condition) {
    console.log(`  PASSOU: ${name}`);
    passed++;
  } else {
    console.log(`  FALHOU: ${name}`);
    failed++;
  }
}

async function runTests() {
  console.log('\nExecutando testes da API...\n');

  // Teste 1: /healthz retorna 200
  const health = await request('/healthz');
  assert('/healthz retorna status 200', health.status === 200);
  assert('/healthz retorna status ok', health.body.status === 'ok');

  // Teste 2: /ready retorna 200
  const ready = await request('/ready');
  assert('/ready retorna status 200', ready.status === 200);
  assert('/ready retorna status ready', ready.body.status === 'ready');

  // Teste 3: rota inexistente retorna 404
  const notFound = await request('/nao-existe');
  assert('Rota inexistente retorna 404', notFound.status === 404);

  // Resultado
  console.log(`\nResultado: ${passed} passaram, ${failed} falharam\n`);

  server.close();
  process.exit(failed > 0 ? 1 : 0);
}

// Aguardar servidor estar pronto antes de testar
setTimeout(runTests, 500);
