const express = require('express');
const cors = require('cors');
const path = require('path');

const { hashPassword, isPasswordHashed, verifyPassword } = require('./auth-utils');
const { DB_NAME, getPool, initializeDatabase } = require('./db');

const app = express();
const port = Number(process.env.PORT || 3000);
const tokens = new Map();
const frontendDir = path.resolve(__dirname, '../rotaklara-frontend');

app.use(cors());
app.use(express.json());
app.use((req, _res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl}`);
  next();
});
app.use(express.static(frontendDir));

function gerarToken(usuario) {
  return `token-${usuario.id}-${Date.now()}`;
}

function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization || '';
  const [, token] = authHeader.split(' ');

  if (!token || !tokens.has(token)) {
    return res.status(401).json({
      sucesso: false,
      mensagem: 'Token ausente ou invalido'
    });
  }

  req.usuario = tokens.get(token);
  return next();
}

function requireRole(roles) {
  return (req, res, next) => {
    if (!req.usuario || !roles.includes(req.usuario.tipo)) {
      return res.status(403).json({
        sucesso: false,
        mensagem: 'Acesso nao autorizado'
      });
    }

    return next();
  };
}

function normalizarEntrega(row) {
  return {
    id: row.id,
    cliente: row.cliente,
    endereco: row.endereco,
    produto: row.produto,
    quantidade: Number(row.quantidade || 0),
    status: row.status,
    latitude: row.latitude !== null ? Number(row.latitude) : null,
    longitude: row.longitude !== null ? Number(row.longitude) : null,
    observacao: row.observacao || ''
  };
}

function validarStatusPedido(status) {
  return ['pendente', 'em-rota', 'entregue', 'ausente', 'cancelado'].includes(status);
}

async function montarPedidos(whereClause = '', params = []) {
  const pool = getPool();
  const [rows] = await pool.query(
    `
      SELECT
        p.id,
        DATE_FORMAT(p.data_pedido, '%Y-%m-%d') AS data,
        TIME_FORMAT(p.hora_pedido, '%H:%i') AS hora,
        DATE_FORMAT(p.data_entrega, '%Y-%m-%d') AS dataEntrega,
        p.cliente_id AS clienteId,
        c.nome AS clienteNome,
        c.endereco,
        c.email,
        p.observacoes,
        p.status,
        COALESCE(SUM(pi.quantidade * pi.valor_unitario), 0) AS valorTotal
      FROM pedidos p
      INNER JOIN clientes c ON c.id = p.cliente_id
      LEFT JOIN pedido_itens pi ON pi.pedido_id = p.id
      ${whereClause}
      GROUP BY p.id, p.data_pedido, p.hora_pedido, p.data_entrega, p.cliente_id, c.nome, c.endereco, c.email, p.observacoes, p.status
      ORDER BY p.data_pedido DESC, p.hora_pedido DESC, p.id DESC
    `,
    params
  );

  if (rows.length === 0) {
    return [];
  }

  const [itensRows] = await pool.query(
    `
      SELECT
        pi.id,
        pi.pedido_id AS pedidoId,
        pi.produto_id AS produtoId,
        pr.nome,
        pi.quantidade,
        pi.valor_unitario AS preco
      FROM pedido_itens pi
      INNER JOIN produtos pr ON pr.id = pi.produto_id
      WHERE pi.pedido_id IN (?)
      ORDER BY pi.id ASC
    `,
    [rows.map((row) => row.id)]
  );

  const itensPorPedido = new Map();
  itensRows.forEach((item) => {
    if (!itensPorPedido.has(item.pedidoId)) {
      itensPorPedido.set(item.pedidoId, []);
    }

    itensPorPedido.get(item.pedidoId).push({
      id: item.produtoId,
      nome: item.nome,
      quantidade: Number(item.quantidade),
      preco: Number(item.preco)
    });
  });

  return rows.map((row) => ({
    id: row.id,
    data: row.data,
    hora: row.hora,
    dataEntrega: row.dataEntrega,
    clienteId: row.clienteId,
    clienteNome: row.clienteNome,
    endereco: row.endereco,
    email: row.email,
    observacoes: row.observacoes || '',
    status: row.status,
    valorTotal: Number(row.valorTotal || 0),
    produtos: itensPorPedido.get(row.id) || []
  }));
}

async function buscarPedidoPorId(id) {
  const pedidos = await montarPedidos('WHERE p.id = ?', [id]);
  return pedidos[0] || null;
}

async function buscarClientePorUsuarioId(usuarioId) {
  const pool = getPool();
  const [rows] = await pool.query(
    `
      SELECT id, usuario_id AS usuarioId, cpf, nome, endereco, latitude, email, longitude
      FROM clientes
      WHERE usuario_id = ?
      LIMIT 1
    `,
    [usuarioId]
  );

  return rows[0] || null;
}

async function validarPayloadPedido(payload) {
  const { clienteId, data, hora, status, produtos } = payload;

  if (!clienteId || !data) {
    return 'Cliente e data do pedido sao obrigatorios';
  }

  if (!Array.isArray(produtos) || produtos.length === 0) {
    return 'Informe ao menos um produto no pedido';
  }

  if (status && !validarStatusPedido(status)) {
    return 'Status invalido';
  }

  const itensInvalidos = produtos.some((item) => !item.produtoId || Number(item.quantidade) <= 0);
  if (itensInvalidos) {
    return 'Todos os itens precisam de produto e quantidade valida';
  }

  if (hora && !/^\d{2}:\d{2}$/.test(hora)) {
    return 'Hora invalida';
  }

  return null;
}

async function salvarItensPedido(connection, pedidoId, produtos) {
  if (produtos.length === 0) {
    return;
  }

  const produtoIds = produtos.map((item) => Number(item.produtoId));
  const [produtosDb] = await connection.query(
    `
      SELECT id, valor
      FROM produtos
      WHERE id IN (?)
    `,
    [produtoIds]
  );

  const valorPorProdutoId = new Map(
    produtosDb.map((produto) => [produto.id, Number(produto.valor)])
  );

  if (valorPorProdutoId.size !== produtoIds.length) {
    throw new Error('Um ou mais produtos informados nao existem');
  }

  const values = produtos.map((item) => [
    pedidoId,
    Number(item.produtoId),
    Number(item.quantidade),
    valorPorProdutoId.get(Number(item.produtoId))
  ]);

  await connection.query(
    `
      INSERT INTO pedido_itens (pedido_id, produto_id, quantidade, valor_unitario)
      VALUES ?
    `,
    [values]
  );
}

async function listarEntregas({ entregadorId, role, somenteHoje = true, status } = {}) {
  const pool = getPool();
  const filtros = [];
  const params = [];

  if (somenteHoje) {
    filtros.push('p.data_entrega = CURDATE()');
  }

  if (status) {
    filtros.push('p.status = ?');
    params.push(status);
  }

  if (role !== 'admin' && entregadorId) {
    filtros.push('p.entregador_id = ?');
    params.push(entregadorId);
  }

  const [rows] = await pool.query(
    `
      SELECT
        p.id,
        c.nome AS cliente,
        c.endereco,
        GROUP_CONCAT(CONCAT(pr.nome, ' x', pi.quantidade) ORDER BY pi.id SEPARATOR ', ') AS produto,
        SUM(pi.quantidade) AS quantidade,
        p.status,
        c.latitude,
        c.longitude,
        p.observacoes AS observacao
      FROM pedidos p
      INNER JOIN clientes c ON c.id = p.cliente_id
      INNER JOIN pedido_itens pi ON pi.pedido_id = p.id
      INNER JOIN produtos pr ON pr.id = pi.produto_id
      ${filtros.length > 0 ? `WHERE ${filtros.join(' AND ')}` : ''}
      GROUP BY p.id, c.nome, c.endereco, p.status, c.latitude, c.longitude, p.observacoes
      ORDER BY p.hora_pedido ASC, p.id ASC
    `,
    params
  );

  return rows.map(normalizarEntrega);
}

app.get('/api/health', async (_req, res) => {
  try {
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

app.get('/', (_req, res) => {
  res.sendFile(path.join(frontendDir, 'login.html'));
});

app.post('/api/login', async (req, res) => {
  try {
    const { usuario, senha } = req.body;

    if (!usuario || !senha) {
      return res.status(400).json({
        sucesso: false,
        mensagem: 'Usuario e senha sao obrigatorios'
      });
    }

    const pool = getPool();
    const [rows] = await pool.query(
      `
        SELECT id, usuario, nome, role, senha
        FROM usuarios
        WHERE usuario = ?
        LIMIT 1
      `,
      [usuario]
    );

    if (rows.length === 0) {
      return res.status(401).json({
        sucesso: false,
        mensagem: 'Usuario ou senha invalidos'
      });
    }

    const usuarioEncontrado = rows[0];
    const senhaValida = await verifyPassword(senha, usuarioEncontrado.senha);

    if (!senhaValida) {
      return res.status(401).json({
        sucesso: false,
        mensagem: 'Usuario ou senha invalidos'
      });
    }

    if (!isPasswordHashed(usuarioEncontrado.senha)) {
      const senhaHash = await hashPassword(senha);
      await pool.query('UPDATE usuarios SET senha = ? WHERE id = ?', [senhaHash, usuarioEncontrado.id]);
    }

    const token = gerarToken(usuarioEncontrado);

    tokens.set(token, {
      id: usuarioEncontrado.id,
      usuario: usuarioEncontrado.usuario,
      nome: usuarioEncontrado.nome,
      tipo: usuarioEncontrado.role
    });

    return res.json({
      sucesso: true,
      usuario: usuarioEncontrado.usuario,
      nome: usuarioEncontrado.nome,
      tipo: usuarioEncontrado.role,
      token
    });
  } catch (error) {
    return res.status(500).json({
      sucesso: false,
      mensagem: 'Erro ao realizar login',
      detalhe: error.message
    });
  }
});

app.post('/api/clientes/cadastro', async (req, res) => {
  const pool = getPool();
  const connection = await pool.getConnection();

  try {
    const { usuario, senha, nome, cpf, email, endereco, latitude, longitude } = req.body;

    if (!usuario || !senha || !nome || !cpf || !endereco) {
      return res.status(400).json({
        sucesso: false,
        mensagem: 'Usuario, senha, nome, CPF e endereco sao obrigatorios'
      });
    }

    await connection.beginTransaction();

    const [usuarioExistente] = await connection.query(
      'SELECT id FROM usuarios WHERE usuario = ? LIMIT 1',
      [usuario]
    );

    if (usuarioExistente.length > 0) {
      await connection.rollback();
      return res.status(409).json({
        sucesso: false,
        mensagem: 'Nome de usuario ja cadastrado'
      });
    }

    const [cpfExistente] = await connection.query(
      'SELECT id FROM clientes WHERE cpf = ? LIMIT 1',
      [cpf]
    );

    if (cpfExistente.length > 0) {
      await connection.rollback();
      return res.status(409).json({
        sucesso: false,
        mensagem: 'CPF ja cadastrado'
      });
    }

    const senhaHash = await hashPassword(senha);

    const [userResult] = await connection.query(
      `
        INSERT INTO usuarios (usuario, nome, senha, role)
        VALUES (?, ?, ?, 'outros')
      `,
      [usuario, nome, senhaHash]
    );

    const [clienteResult] = await connection.query(
      `
        INSERT INTO clientes (usuario_id, cpf, nome, endereco, latitude, email, longitude)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `,
      [
        userResult.insertId,
        cpf,
        nome,
        endereco,
        latitude === '' || latitude === null || latitude === undefined ? null : Number(latitude),
        email || null,
        longitude === '' || longitude === null || longitude === undefined ? null : Number(longitude)
      ]
    );

    await connection.commit();

    return res.status(201).json({
      sucesso: true,
      usuario: {
        id: userResult.insertId,
        usuario,
        nome,
        tipo: 'outros'
      },
      clienteId: clienteResult.insertId
    });
  } catch (error) {
    await connection.rollback();
    return res.status(500).json({
      sucesso: false,
      mensagem: 'Erro ao cadastrar cliente',
      detalhe: error.message
    });
  } finally {
    connection.release();
  }
});

app.get('/api/dashboard/indicadores', authMiddleware, async (_req, res) => {
  try {
    const pool = getPool();
    const [[indicadores]] = await pool.query(
      `
        SELECT
          COUNT(*) AS totalEntregas,
          SUM(CASE WHEN status = 'entregue' THEN 1 ELSE 0 END) AS concluidas,
          SUM(CASE WHEN status = 'pendente' THEN 1 ELSE 0 END) AS pendentes
        FROM pedidos
      `
    );

    const [[clientes]] = await pool.query('SELECT COUNT(*) AS totalClientes FROM clientes');

    return res.json({
      totalEntregas: Number(indicadores.totalEntregas || 0),
      concluidas: Number(indicadores.concluidas || 0),
      pendentes: Number(indicadores.pendentes || 0),
      totalClientes: Number(clientes.totalClientes || 0)
    });
  } catch (error) {
    return res.status(500).json({
      sucesso: false,
      mensagem: 'Erro ao carregar indicadores',
      detalhe: error.message
    });
  }
});

app.get('/api/entregas/hoje', authMiddleware, async (req, res) => {
  try {
    const entregas = await listarEntregas({
      entregadorId: req.usuario.id,
      role: req.usuario.tipo
    });

    return res.json(entregas);
  } catch (error) {
    return res.status(500).json({
      sucesso: false,
      mensagem: 'Erro ao carregar entregas do dia',
      detalhe: error.message
    });
  }
});

app.get('/api/entregas/hoje/pontos', authMiddleware, async (req, res) => {
  try {
    const entregas = await listarEntregas({
      entregadorId: req.usuario.id,
      role: req.usuario.tipo
    });

    return res.json(
      entregas
        .filter((entrega) => entrega.latitude !== null && entrega.longitude !== null)
        .map((entrega) => ({
          id: entrega.id,
          cliente: entrega.cliente,
          status: entrega.status,
          latitude: entrega.latitude,
          longitude: entrega.longitude
        }))
    );
  } catch (error) {
    return res.status(500).json({
      sucesso: false,
      mensagem: 'Erro ao carregar pontos de entrega',
      detalhe: error.message
    });
  }
});

app.get('/api/entregador/entregas', authMiddleware, async (req, res) => {
  try {
    const entregas = await listarEntregas({
      entregadorId: req.usuario.id,
      role: req.usuario.tipo
    });

    return res.json(entregas);
  } catch (error) {
    return res.status(500).json({
      sucesso: false,
      mensagem: 'Erro ao carregar entregas do entregador',
      detalhe: error.message
    });
  }
});

app.get('/api/entregas/pendentes/pontos', authMiddleware, async (req, res) => {
  try {
    const entregas = await listarEntregas({
      entregadorId: req.usuario.id,
      role: req.usuario.tipo,
      somenteHoje: false,
      status: 'pendente'
    });

    return res.json(
      entregas
        .filter((entrega) => entrega.latitude !== null && entrega.longitude !== null)
        .map((entrega) => ({
          id: entrega.id,
          cliente: entrega.cliente,
          status: entrega.status,
          latitude: entrega.latitude,
          longitude: entrega.longitude,
          endereco: entrega.endereco
        }))
    );
  } catch (error) {
    return res.status(500).json({
      sucesso: false,
      mensagem: 'Erro ao carregar pontos pendentes',
      detalhe: error.message
    });
  }
});

app.get('/api/entregas/pendentes', authMiddleware, async (req, res) => {
  try {
    const entregas = await listarEntregas({
      entregadorId: req.usuario.id,
      role: req.usuario.tipo,
      somenteHoje: false,
      status: 'pendente'
    });

    return res.json(entregas);
  } catch (error) {
    return res.status(500).json({
      sucesso: false,
      mensagem: 'Erro ao carregar entregas pendentes',
      detalhe: error.message
    });
  }
});

app.get('/api/entregador/localizacao', authMiddleware, async (req, res) => {
  try {
    const pool = getPool();
    const entregadorId = req.usuario.tipo === 'admin' ? 2 : req.usuario.id;
    const [rows] = await pool.query(
      `
        SELECT latitude, longitude, atualizado_em
        FROM entregador_localizacao
        WHERE entregador_id = ?
        LIMIT 1
      `,
      [entregadorId]
    );

    if (rows.length === 0) {
      return res.json({});
    }

    return res.json({
      latitude: Number(rows[0].latitude),
      longitude: Number(rows[0].longitude),
      timestamp: rows[0].atualizado_em
    });
  } catch (error) {
    return res.status(500).json({
      sucesso: false,
      mensagem: 'Erro ao carregar localizacao do entregador',
      detalhe: error.message
    });
  }
});

app.post('/api/entregador/localizacao', authMiddleware, async (req, res) => {
  try {
    const { latitude, longitude, timestamp } = req.body;

    if (typeof latitude !== 'number' || typeof longitude !== 'number') {
      return res.status(400).json({
        sucesso: false,
        mensagem: 'Latitude e longitude devem ser numericas'
      });
    }

    const pool = getPool();
    const atualizadoEm = timestamp || new Date().toISOString().slice(0, 19).replace('T', ' ');

    await pool.query(
      `
        INSERT INTO entregador_localizacao (entregador_id, latitude, longitude, atualizado_em)
        VALUES (?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
          latitude = VALUES(latitude),
          longitude = VALUES(longitude),
          atualizado_em = VALUES(atualizado_em)
      `,
      [req.usuario.id, latitude, longitude, atualizadoEm]
    );

    return res.json({
      sucesso: true,
      localizacao: {
        latitude,
        longitude,
        timestamp: atualizadoEm
      }
    });
  } catch (error) {
    return res.status(500).json({
      sucesso: false,
      mensagem: 'Erro ao salvar localizacao do entregador',
      detalhe: error.message
    });
  }
});

app.put('/api/entregas/:id/status', authMiddleware, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { status } = req.body;
    const statusPermitidos = ['pendente', 'em-rota', 'entregue', 'ausente', 'cancelado'];

    if (!statusPermitidos.includes(status)) {
      return res.status(400).json({
        sucesso: false,
        mensagem: 'Status invalido'
      });
    }

    const pool = getPool();
    const [result] = await pool.query(
      `
        UPDATE pedidos
        SET status = ?
        WHERE id = ?
      `,
      [status, id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({
        sucesso: false,
        mensagem: 'Entrega nao encontrada'
      });
    }

    const [rows] = await pool.query(
      `
        SELECT id, status, observacoes
        FROM pedidos
        WHERE id = ?
        LIMIT 1
      `,
      [id]
    );

    return res.json({
      sucesso: true,
      entrega: rows[0]
    });
  } catch (error) {
    return res.status(500).json({
      sucesso: false,
      mensagem: 'Erro ao atualizar status da entrega',
      detalhe: error.message
    });
  }
});

app.get('/api/clientes', authMiddleware, async (_req, res) => {
  try {
    const pool = getPool();
    const [rows] = await pool.query(
      `
        SELECT id, cpf, nome, endereco, latitude, email, longitude
        FROM clientes
        ORDER BY nome
      `
    );

    return res.json(rows);
  } catch (error) {
    return res.status(500).json({
      sucesso: false,
      mensagem: 'Erro ao carregar clientes',
      detalhe: error.message
    });
  }
});

app.post('/api/clientes', authMiddleware, async (req, res) => {
  try {
    const { cpf, nome, endereco, latitude, email, longitude } = req.body;

    if (!cpf || !nome || !endereco) {
      return res.status(400).json({
        sucesso: false,
        mensagem: 'CPF, nome e endereco sao obrigatorios'
      });
    }

    const pool = getPool();
    const [result] = await pool.query(
      `
        INSERT INTO clientes (cpf, nome, endereco, latitude, email, longitude)
        VALUES (?, ?, ?, ?, ?, ?)
      `,
      [
        cpf,
        nome,
        endereco,
        latitude === '' || latitude === null || latitude === undefined ? null : Number(latitude),
        email || null,
        longitude === '' || longitude === null || longitude === undefined ? null : Number(longitude)
      ]
    );

    const [rows] = await pool.query(
      `
        SELECT id, cpf, nome, endereco, latitude, email, longitude
        FROM clientes
        WHERE id = ?
      `,
      [result.insertId]
    );

    return res.status(201).json({
      sucesso: true,
      cliente: rows[0]
    });
  } catch (error) {
    return res.status(500).json({
      sucesso: false,
      mensagem: 'Erro ao criar cliente',
      detalhe: error.message
    });
  }
});

app.put('/api/clientes/:id', authMiddleware, async (req, res) => {
  try {
    const { cpf, nome, endereco, latitude, email, longitude } = req.body;

    if (!cpf || !nome || !endereco) {
      return res.status(400).json({
        sucesso: false,
        mensagem: 'CPF, nome e endereco sao obrigatorios'
      });
    }

    const pool = getPool();
    const [result] = await pool.query(
      `
        UPDATE clientes
        SET cpf = ?, nome = ?, endereco = ?, latitude = ?, email = ?, longitude = ?
        WHERE id = ?
      `,
      [
        cpf,
        nome,
        endereco,
        latitude === '' || latitude === null || latitude === undefined ? null : Number(latitude),
        email || null,
        longitude === '' || longitude === null || longitude === undefined ? null : Number(longitude),
        Number(req.params.id)
      ]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({
        sucesso: false,
        mensagem: 'Cliente nao encontrado'
      });
    }

    const [rows] = await pool.query(
      `
        SELECT id, cpf, nome, endereco, latitude, email, longitude
        FROM clientes
        WHERE id = ?
      `,
      [Number(req.params.id)]
    );

    return res.json({
      sucesso: true,
      cliente: rows[0]
    });
  } catch (error) {
    return res.status(500).json({
      sucesso: false,
      mensagem: 'Erro ao atualizar cliente',
      detalhe: error.message
    });
  }
});

app.delete('/api/clientes/:id', authMiddleware, async (req, res) => {
  try {
    const pool = getPool();
    const [result] = await pool.query('DELETE FROM clientes WHERE id = ?', [Number(req.params.id)]);

    if (result.affectedRows === 0) {
      return res.status(404).json({
        sucesso: false,
        mensagem: 'Cliente nao encontrado'
      });
    }

    return res.json({
      sucesso: true
    });
  } catch (error) {
    return res.status(500).json({
      sucesso: false,
      mensagem: 'Erro ao excluir cliente',
      detalhe: error.message
    });
  }
});

app.get('/api/produtos', authMiddleware, async (_req, res) => {
  try {
    const pool = getPool();
    const [rows] = await pool.query(
      `
        SELECT id, nome, descricao, valor, data
        FROM produtos
        ORDER BY nome
      `
    );

    return res.json(rows);
  } catch (error) {
    return res.status(500).json({
      sucesso: false,
      mensagem: 'Erro ao carregar produtos',
      detalhe: error.message
    });
  }
});

app.get('/api/cliente/perfil', authMiddleware, requireRole(['outros']), async (req, res) => {
  try {
    const cliente = await buscarClientePorUsuarioId(req.usuario.id);

    if (!cliente) {
      return res.status(404).json({
        sucesso: false,
        mensagem: 'Cliente nao encontrado para o usuario logado'
      });
    }

    return res.json(cliente);
  } catch (error) {
    return res.status(500).json({
      sucesso: false,
      mensagem: 'Erro ao carregar perfil do cliente',
      detalhe: error.message
    });
  }
});

app.get('/api/cliente/pedidos', authMiddleware, requireRole(['outros']), async (req, res) => {
  try {
    const cliente = await buscarClientePorUsuarioId(req.usuario.id);

    if (!cliente) {
      return res.status(404).json({
        sucesso: false,
        mensagem: 'Cliente nao encontrado para o usuario logado'
      });
    }

    const pedidos = await montarPedidos('WHERE p.cliente_id = ?', [cliente.id]);
    return res.json(pedidos);
  } catch (error) {
    return res.status(500).json({
      sucesso: false,
      mensagem: 'Erro ao carregar pedidos do cliente',
      detalhe: error.message
    });
  }
});

app.post('/api/cliente/pedidos', authMiddleware, requireRole(['outros']), async (req, res) => {
  const erroValidacao = await validarPayloadPedido(req.body);
  if (erroValidacao) {
    return res.status(400).json({
      sucesso: false,
      mensagem: erroValidacao
    });
  }

  const cliente = await buscarClientePorUsuarioId(req.usuario.id);
  if (!cliente) {
    return res.status(404).json({
      sucesso: false,
      mensagem: 'Cliente nao encontrado para o usuario logado'
    });
  }

  const pool = getPool();
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const { data, hora, observacoes, produtos } = req.body;
    const [result] = await connection.query(
      `
        INSERT INTO pedidos (cliente_id, usuario_id, entregador_id, data_pedido, hora_pedido, data_entrega, status, observacoes)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        cliente.id,
        req.usuario.id,
        null,
        data,
        hora || null,
        data,
        'pendente',
        observacoes || ''
      ]
    );

    await salvarItensPedido(connection, result.insertId, produtos);
    await connection.commit();

    const pedido = await buscarPedidoPorId(result.insertId);
    return res.status(201).json({
      sucesso: true,
      pedido
    });
  } catch (error) {
    await connection.rollback();
    return res.status(500).json({
      sucesso: false,
      mensagem: 'Erro ao criar pedido do cliente',
      detalhe: error.message
    });
  } finally {
    connection.release();
  }
});

app.get('/api/pedidos', authMiddleware, async (_req, res) => {
  try {
    const pedidos = await montarPedidos();
    return res.json(pedidos);
  } catch (error) {
    return res.status(500).json({
      sucesso: false,
      mensagem: 'Erro ao carregar pedidos',
      detalhe: error.message
    });
  }
});

app.get('/api/pedidos/:id', authMiddleware, async (req, res) => {
  try {
    const pedido = await buscarPedidoPorId(Number(req.params.id));

    if (!pedido) {
      return res.status(404).json({
        sucesso: false,
        mensagem: 'Pedido nao encontrado'
      });
    }

    return res.json(pedido);
  } catch (error) {
    return res.status(500).json({
      sucesso: false,
      mensagem: 'Erro ao carregar pedido',
      detalhe: error.message
    });
  }
});

app.post('/api/pedidos', authMiddleware, async (req, res) => {
  const erroValidacao = await validarPayloadPedido(req.body);
  if (erroValidacao) {
    return res.status(400).json({
      sucesso: false,
      mensagem: erroValidacao
    });
  }

  const pool = getPool();
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const { clienteId, data, hora, observacoes, status, produtos } = req.body;
    const [result] = await connection.query(
      `
        INSERT INTO pedidos (cliente_id, usuario_id, entregador_id, data_pedido, hora_pedido, data_entrega, status, observacoes)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        Number(clienteId),
        req.usuario.id,
        null,
        data,
        hora || null,
        data,
        status || 'pendente',
        observacoes || ''
      ]
    );

    await salvarItensPedido(connection, result.insertId, produtos);
    await connection.commit();

    const pedido = await buscarPedidoPorId(result.insertId);
    return res.status(201).json({
      sucesso: true,
      pedido
    });
  } catch (error) {
    await connection.rollback();
    return res.status(500).json({
      sucesso: false,
      mensagem: 'Erro ao criar pedido',
      detalhe: error.message
    });
  } finally {
    connection.release();
  }
});

app.put('/api/pedidos/:id', authMiddleware, async (req, res) => {
  const erroValidacao = await validarPayloadPedido(req.body);
  if (erroValidacao) {
    return res.status(400).json({
      sucesso: false,
      mensagem: erroValidacao
    });
  }

  const pedidoId = Number(req.params.id);
  const pool = getPool();
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const { clienteId, data, hora, observacoes, status, produtos } = req.body;
    const [updateResult] = await connection.query(
      `
        UPDATE pedidos
        SET cliente_id = ?, data_pedido = ?, hora_pedido = ?, data_entrega = ?, status = ?, observacoes = ?
        WHERE id = ?
      `,
      [
        Number(clienteId),
        data,
        hora || null,
        data,
        status || 'pendente',
        observacoes || '',
        pedidoId
      ]
    );

    if (updateResult.affectedRows === 0) {
      await connection.rollback();
      return res.status(404).json({
        sucesso: false,
        mensagem: 'Pedido nao encontrado'
      });
    }

    await connection.query('DELETE FROM pedido_itens WHERE pedido_id = ?', [pedidoId]);
    await salvarItensPedido(connection, pedidoId, produtos);
    await connection.commit();

    const pedido = await buscarPedidoPorId(pedidoId);
    return res.json({
      sucesso: true,
      pedido
    });
  } catch (error) {
    await connection.rollback();
    return res.status(500).json({
      sucesso: false,
      mensagem: 'Erro ao atualizar pedido',
      detalhe: error.message
    });
  } finally {
    connection.release();
  }
});

app.delete('/api/pedidos/:id', authMiddleware, async (req, res) => {
  try {
    const pool = getPool();
    const [result] = await pool.query('DELETE FROM pedidos WHERE id = ?', [Number(req.params.id)]);

    if (result.affectedRows === 0) {
      return res.status(404).json({
        sucesso: false,
        mensagem: 'Pedido nao encontrado'
      });
    }

    return res.json({
      sucesso: true
    });
  } catch (error) {
    return res.status(500).json({
      sucesso: false,
      mensagem: 'Erro ao excluir pedido',
      detalhe: error.message
    });
  }
});

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
