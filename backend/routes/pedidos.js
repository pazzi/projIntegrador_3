const express = require('express');
const { getPool } = require('../db');
const { authMiddleware, requireRole } = require('../middlewares/auth');
const { validarPayloadPedido } = require('../validators/pedidos');
const {
  montarPedidos,
  buscarPedidoPorId,
  buscarItensPedido,
  salvarItensPedido,
  sincronizarEstoquePedido,
  buscarEntregadorPadrao
} = require('../services/pedidos');
const { buscarClientePorUsuarioId } = require('../services/clientes');

const router = express.Router();

router.use('/pedidos', authMiddleware);
router.use('/cliente', authMiddleware);

function normalizarRequerEntrega(valor, valorPadrao = true) {
  if (valor === undefined || valor === null || valor === '') {
    return valorPadrao;
  }

  if (typeof valor === 'boolean') {
    return valor;
  }

  if (typeof valor === 'number') {
    return valor !== 0;
  }

  if (typeof valor === 'string') {
    return !['false', '0', 'nao', 'não'].includes(valor.trim().toLowerCase());
  }

  return Boolean(valor);
}

async function resolverEntregadorDoPedido(connection, requerEntrega, entregadorAtualId = null) {
  if (!requerEntrega) {
    return null;
  }

  if (entregadorAtualId) {
    return entregadorAtualId;
  }

  const entregador = await buscarEntregadorPadrao(connection);

  if (!entregador) {
    throw new Error('Nenhum entregador disponivel para este pedido');
  }

  return Number(entregador.id);
}

/**
 * @swagger
 * components:
 *   schemas:
 *     ProdutoItem:
 *       type: object
 *       properties:
 *         produtoId:
 *           type: integer
 *         quantidade:
 *           type: integer
 *           minimum: 1
 *         preco:
 *           type: number
 *     Pedido:
 *       type: object
 *       properties:
 *         id:
 *           type: integer
 *         data:
 *           type: string
 *           format: date
 *         hora:
 *           type: string
 *         dataEntrega:
 *           type: string
 *           format: date
 *         clienteId:
 *           type: integer
 *         clienteNome:
 *           type: string
 *         endereco:
 *           type: string
 *         email:
 *           type: string
 *         observacoes:
 *           type: string
 *         status:
 *           type: string
 *           enum: [pendente, em-rota, entregue, ausente, cancelado]
 *         valorTotal:
 *           type: number
 *         produtos:
 *           type: array
 *           items:
 *             type: object
 *             properties:
 *               id:
 *                 type: integer
 *               nome:
 *                 type: string
 *               quantidade:
 *                 type: integer
 *               preco:
 *                 type: number
 *     PedidoInput:
 *       type: object
 *       required:
 *         - clienteId
 *         - data
 *         - produtos
 *       properties:
 *         clienteId:
 *           type: integer
 *         data:
 *           type: string
 *           format: date
 *         hora:
 *           type: string
 *         observacoes:
 *           type: string
 *         status:
 *           type: string
 *           enum: [pendente, em-rota, entregue, ausente, cancelado]
 *         produtos:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/ProdutoItem'
 */

/**
 * @swagger
 * /api/pedidos:
 *   get:
 *     summary: Lista todos os pedidos
 *     tags: [Pedidos]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Lista de pedidos
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Pedido'
 *       500:
 *         description: Erro interno do servidor
 *   post:
 *     summary: Cria um novo pedido
 *     tags: [Pedidos]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/PedidoInput'
 *     responses:
 *       201:
 *         description: Pedido criado com sucesso
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Pedido'
 *       400:
 *         description: Dados inválidos
 *       500:
 *         description: Erro interno do servidor
 */
router.get('/pedidos', requireRole(['admin']), async (_req, res) => {
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

/**
 * @swagger
 * /api/pedidos/{id}:
 *   get:
 *     summary: Obtém um pedido específico
 *     tags: [Pedidos]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID do pedido
 *     responses:
 *       200:
 *         description: Pedido encontrado
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Pedido'
 *       404:
 *         description: Pedido não encontrado
 *       500:
 *         description: Erro interno do servidor
 *   put:
 *     summary: Atualiza um pedido existente
 *     tags: [Pedidos]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID do pedido
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/PedidoInput'
 *     responses:
 *       200:
 *         description: Pedido atualizado com sucesso
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Pedido'
 *       400:
 *         description: Dados inválidos
 *       404:
 *         description: Pedido não encontrado
 *       500:
 *         description: Erro interno do servidor
 *   delete:
 *     summary: Remove um pedido
 *     tags: [Pedidos]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID do pedido
 *     responses:
 *       200:
 *         description: Pedido removido com sucesso
 *       404:
 *         description: Pedido não encontrado
 *       500:
 *         description: Erro interno do servidor
 */
router.get('/pedidos/:id', requireRole(['admin']), async (req, res) => {
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

router.post('/pedidos', requireRole(['admin']), async (req, res) => {
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
    const statusPedido = status || 'pendente';
    const requerEntrega = normalizarRequerEntrega(req.body.requerEntrega, true);
    const entregadorId = await resolverEntregadorDoPedido(connection, requerEntrega);
    await sincronizarEstoquePedido(connection, [], 'cancelado', produtos, statusPedido);

    const [result] = await connection.query(
      `
        INSERT INTO pedidos (cliente_id, usuario_id, entregador_id, data_pedido, hora_pedido, data_entrega, requer_entrega, status, observacoes)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        Number(clienteId),
        req.usuario.id,
        entregadorId,
        data,
        hora || null,
        data,
        requerEntrega ? 1 : 0,
        statusPedido,
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

router.put('/pedidos/:id', requireRole(['admin']), async (req, res) => {
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
    const [pedidoAtualRows] = await connection.query(
      `
        SELECT id, status, entregador_id AS entregadorId, requer_entrega AS requerEntrega
        FROM pedidos
        WHERE id = ?
        LIMIT 1
        FOR UPDATE
      `,
      [pedidoId]
    );

    if (pedidoAtualRows.length === 0) {
      await connection.rollback();
      return res.status(404).json({
        sucesso: false,
        mensagem: 'Pedido nao encontrado'
      });
    }

    const pedidoAtual = pedidoAtualRows[0];
    const itensAtuais = await buscarItensPedido(connection, pedidoId);
    const statusPedido = status || 'pendente';
    const requerEntrega = normalizarRequerEntrega(req.body.requerEntrega, Boolean(pedidoAtual.requerEntrega));
    const entregadorId = await resolverEntregadorDoPedido(
      connection,
      requerEntrega,
      requerEntrega ? pedidoAtual.entregadorId : null
    );
    await sincronizarEstoquePedido(connection, itensAtuais, pedidoAtual.status, produtos, statusPedido);

    const [updateResult] = await connection.query(
      `
        UPDATE pedidos
        SET cliente_id = ?, entregador_id = ?, data_pedido = ?, hora_pedido = ?, data_entrega = ?, requer_entrega = ?, status = ?, observacoes = ?
        WHERE id = ?
      `,
      [
        Number(clienteId),
        entregadorId,
        data,
        hora || null,
        data,
        requerEntrega ? 1 : 0,
        statusPedido,
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

router.delete('/pedidos/:id', requireRole(['admin']), async (req, res) => {
  const pool = getPool();
  const connection = await pool.getConnection();

  try {
    const pedidoId = Number(req.params.id);
    await connection.beginTransaction();

    const [pedidoRows] = await connection.query(
      `
        SELECT id, status
        FROM pedidos
        WHERE id = ?
        LIMIT 1
        FOR UPDATE
      `,
      [pedidoId]
    );

    if (pedidoRows.length === 0) {
      await connection.rollback();
      return res.status(404).json({
        sucesso: false,
        mensagem: 'Pedido nao encontrado'
      });
    }

    const itensAtuais = await buscarItensPedido(connection, pedidoId);
    await sincronizarEstoquePedido(connection, itensAtuais, pedidoRows[0].status, [], 'cancelado');
    await connection.query('DELETE FROM pedidos WHERE id = ?', [pedidoId]);
    await connection.commit();

    return res.json({
      sucesso: true
    });
  } catch (error) {
    await connection.rollback();
    return res.status(500).json({
      sucesso: false,
      mensagem: 'Erro ao excluir pedido',
      detalhe: error.message
    });
  } finally {
    connection.release();
  }
});

// Rotas específicas para clientes
/**
 * @swagger
 * /api/cliente/perfil:
 *   get:
 *     summary: Obtém o perfil do cliente logado
 *     tags: [Cliente]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Perfil do cliente
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Cliente'
 *       404:
 *         description: Cliente não encontrado
 *       500:
 *         description: Erro interno do servidor
 */
router.get('/cliente/perfil', async (req, res) => {
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

/**
 * @swagger
 * /api/cliente/pedidos:
 *   get:
 *     summary: Lista os pedidos do cliente logado
 *     tags: [Cliente]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Lista de pedidos do cliente
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Pedido'
 *       404:
 *         description: Cliente não encontrado
 *       500:
 *         description: Erro interno do servidor
 *   post:
 *     summary: Cria um novo pedido para o cliente logado
 *     tags: [Cliente]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - data
 *               - produtos
 *             properties:
 *               data:
 *                 type: string
 *                 format: date
 *               hora:
 *                 type: string
 *               observacoes:
 *                 type: string
 *               produtos:
 *                 type: array
 *                 items:
 *                   $ref: '#/components/schemas/ProdutoItem'
 *     responses:
 *       201:
 *         description: Pedido criado com sucesso
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Pedido'
 *       400:
 *         description: Dados inválidos
 *       500:
 *         description: Erro interno do servidor
 */
router.get('/cliente/pedidos', async (req, res) => {
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

router.post('/cliente/pedidos', async (req, res) => {
  const erroValidacao = await validarPayloadPedido(req.body, { requireClienteId: false });
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
    const requerEntrega = normalizarRequerEntrega(req.body.requerEntrega, true);
    const entregadorId = await resolverEntregadorDoPedido(connection, requerEntrega);
    await sincronizarEstoquePedido(connection, [], 'cancelado', produtos, 'pendente');

    const [result] = await connection.query(
      `
        INSERT INTO pedidos (cliente_id, usuario_id, entregador_id, data_pedido, hora_pedido, data_entrega, requer_entrega, status, observacoes)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        cliente.id,
        req.usuario.id,
        entregadorId,
        data,
        hora || null,
        data,
        requerEntrega ? 1 : 0,
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
