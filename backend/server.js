const express = require('express');
const cors = require('cors');
const path = require('path');

const { DB_NAME, initializeDatabase } = require('./db');
const { loggingMiddleware } = require('./middlewares/auth');
const { swaggerUi, specs } = require('./swagger');

// Importar rotas
const authRoutes = require('./routes/auth');
const clientesRoutes = require('./routes/clientes');
const pedidosRoutes = require('./routes/pedidos');
const entregasRoutes = require('./routes/entregas');
const produtosRoutes = require('./routes/produtos');

const app = express();
const port = Number(process.env.PORT || 3000);
const frontendDir = path.resolve(__dirname, '../frontend');

app.use(cors());
app.use(express.json());
app.use(loggingMiddleware);
app.use(express.static(frontendDir));

// Rotas da API
app.use('/api', authRoutes);
app.use('/api', clientesRoutes);
app.use('/api', pedidosRoutes);
app.use('/api', entregasRoutes);
app.use('/api', produtosRoutes);

// Rota da documentação Swagger
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(specs));

// Rota de saúde
app.get('/api/health', async (_req, res) => {
  try {
    const { getPool } = require('./db');
    const pool = getPool();
    await pool.query('SELECT 1');

    return res.json({
      sucesso: true,
      status: 'ok'
    });
  } catch (error) {
    return res.status(500).json({
      sucesso: false,
      mensagem: 'Falha ao conectar no banco',
      detalhe: error.message
    });
  }
});

// Rota para servir o frontend
app.get('/', (_req, res) => {
  res.sendFile(path.join(frontendDir, 'login.html'));
});

// Middleware para rotas não encontradas
app.use((req, res) => {
  console.warn(`[404] Rota nao encontrada: ${req.method} ${req.originalUrl}`);
  res.status(404).json({
    sucesso: false,
    mensagem: `Rota nao encontrada: ${req.method} ${req.originalUrl}`
  });
});

async function startServer() {
  console.log(`[startup] Arquivo: ${__filename}`);
  console.log(`[startup] CWD: ${process.cwd()}`);
  console.log(`[startup] Porta configurada: ${port}`);
  console.log(`[startup] Banco configurado: ${DB_NAME}`);
  await initializeDatabase();
  console.log('[startup] Banco inicializado com sucesso');
  console.log('[startup] Rotas API esperadas: /api/health, /api/login, /api/clientes, /api/produtos, /api/pedidos');

  return app.listen(port, () => {
    console.log(`[startup] Backend rodando em http://localhost:${port}`);
  });
}

if (require.main === module) {
  startServer().catch((error) => {
    console.error('Falha ao iniciar backend:', error.message);
    process.exit(1);
  });
}

module.exports = {
  app,
  startServer
};
