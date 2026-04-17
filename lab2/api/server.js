const http = require('http');

const PORT = process.env.PORT || 8080;

const server = http.createServer((req, res) => {
  res.setHeader('Content-Type', 'application/json');

  if (req.url === '/healthz' && req.method === 'GET') {
    res.statusCode = 500;
    res.end(JSON.stringify({ status: 'broken' }));
    return;
  }

  if (req.url === '/ready' && req.method === 'GET') {
    // Em um projeto real, verificaria conexao com o banco
    res.statusCode = 200;
    res.end(JSON.stringify({ status: 'ready', database: 'simulated' }));
    return;
  }

  if (req.url === '/' && req.method === 'GET') {
    res.statusCode = 200;
    res.end(JSON.stringify({
      app: 'Lab 2 - CI/CD',
      versao: '1.0.0',
      rotas: ['/healthz', '/ready']
    }));
    return;
  }

  res.statusCode = 404;
  res.end(JSON.stringify({ erro: 'Rota nao encontrada' }));
});

server.listen(PORT, () => {
  console.log(`API rodando na porta ${PORT}`);
});

module.exports = server;
