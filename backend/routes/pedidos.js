const express = require('express');
const { getPool } = require('../db');
const { authMiddleware, requireRole } = require('../middlewares/auth');
const { validarPayloadPedido } = require('../validators/pedidos');
const { montarPedidos, buscarPedidoPorId, salvarItensPedido } = require('../services/pedidos');
const { buscarClientePorUsuarioId } = require('../services/clientes');

const router = express.Router();

// Aplicar middleware de autenticação a todas as rotas
router.use(authMiddleware);

router.get('/pedidos', async (_req, res) => {
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

router.get('/pedidos/:id', async (req, res) => {
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

router.post('/pedidos', async (req, res) => {
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

router.put('/pedidos/:id', async (req, res) => {
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

router.delete('/pedidos/:id', async (req, res) => {
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

// Rotas específicas para clientes
router.get('/cliente/perfil', requireRole(['outros']), async (req, res) => {
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

router.get('/cliente/pedidos', requireRole(['outros']), async (req, res) => {
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

router.post('/cliente/pedidos', requireRole(['outros']), async (req, res) => {
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

module.exports = router;