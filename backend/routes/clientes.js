const express = require('express');
const { getPool } = require('../db');
const { authMiddleware, requireRole } = require('../middlewares/auth');

const router = express.Router();

router.use('/clientes', authMiddleware, requireRole(['admin']));

/**
 * @swagger
 * components:
 *   schemas:
 *     Cliente:
 *       type: object
 *       properties:
 *         id:
 *           type: integer
 *         cpf:
 *           type: string
 *         nome:
 *           type: string
 *         endereco:
 *           type: string
 *         latitude:
 *           type: number
 *         longitude:
 *           type: number
 *         email:
 *           type: string
 *     ClienteInput:
 *       type: object
 *       required:
 *         - cpf
 *         - nome
 *         - endereco
 *       properties:
 *         cpf:
 *           type: string
 *         nome:
 *           type: string
 *         endereco:
 *           type: string
 *         latitude:
 *           type: number
 *         longitude:
 *           type: number
 *         email:
 *           type: string
 */

/**
 * @swagger
 * /api/clientes:
 *   get:
 *     summary: Lista todos os clientes
 *     tags: [Clientes]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Lista de clientes
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Cliente'
 *       500:
 *         description: Erro interno do servidor
 *   post:
 *     summary: Cria um novo cliente
 *     tags: [Clientes]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/ClienteInput'
 *     responses:
 *       201:
 *         description: Cliente criado com sucesso
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Cliente'
 *       400:
 *         description: Dados inválidos
 *       500:
 *         description: Erro interno do servidor
 */
router.get('/clientes', async (_req, res) => {
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

router.post('/clientes', async (req, res) => {
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

/**
 * @swagger
 * /api/clientes/{id}:
 *   put:
 *     summary: Atualiza um cliente existente
 *     tags: [Clientes]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID do cliente
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/ClienteInput'
 *     responses:
 *       200:
 *         description: Cliente atualizado com sucesso
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Cliente'
 *       400:
 *         description: Dados inválidos
 *       404:
 *         description: Cliente não encontrado
 *       500:
 *         description: Erro interno do servidor
 *   delete:
 *     summary: Remove um cliente
 *     tags: [Clientes]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID do cliente
 *     responses:
 *       200:
 *         description: Cliente removido com sucesso
 *       404:
 *         description: Cliente não encontrado
 *       500:
 *         description: Erro interno do servidor
 */
router.put('/clientes/:id', async (req, res) => {
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

router.delete('/clientes/:id', async (req, res) => {
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

module.exports = router;
