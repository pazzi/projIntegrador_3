const express = require('express');
const { getPool } = require('../db');
const { authMiddleware, requireRole } = require('../middlewares/auth');
const { validarPayloadPedido } = require('../validators/pedidos');
const { montarPedidos, buscarPedidoPorId, salvarItensPedido } = require('../services/pedidos');
const { buscarClientePorUsuarioId } = require('../services/clientes');

const router = express.Router();

// Aplicar middleware de autenticação a todas as rotas
router.use(authMiddleware);

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