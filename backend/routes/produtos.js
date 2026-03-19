const express = require('express');
const { getPool } = require('../db');
const { authMiddleware, requireRole } = require('../middlewares/auth');

const router = express.Router();

/**
 * @swagger
 * components:
 *   schemas:
 *     Produto:
 *       type: object
 *       properties:
 *         id:
 *           type: integer
 *         nome:
 *           type: string
 *         descricao:
 *           type: string
 *         valor:
 *           type: number
 *         estoque:
 *           type: integer
 *         data:
 *           type: string
 *           format: date
 */

/**
 * @swagger
 * /api/produtos:
 *   get:
 *     summary: Lista todos os produtos
 *     tags: [Produtos]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Lista de produtos
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Produto'
 *       500:
 *         description: Erro interno do servidor
 */
router.get('/produtos', async (_req, res) => {
  try {
    const pool = getPool();
    const [rows] = await pool.query(
      `
        SELECT id, nome, descricao, valor, estoque, data
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

router.post('/produtos', authMiddleware, requireRole(['admin']), async (req, res) => {
  try {
    const { nome, descricao, valor, estoque, data } = req.body;

    if (!nome || valor === undefined || valor === null || estoque === undefined || estoque === null) {
      return res.status(400).json({
        sucesso: false,
        mensagem: 'Nome, valor e estoque sao obrigatorios'
      });
    }

    if (Number(valor) <= 0 || Number(estoque) < 0) {
      return res.status(400).json({
        sucesso: false,
        mensagem: 'Valor deve ser positivo e estoque nao pode ser negativo'
      });
    }

    const pool = getPool();
    const [result] = await pool.query(
      `
        INSERT INTO produtos (nome, descricao, valor, estoque, data)
        VALUES (?, ?, ?, ?, ?)
      `,
      [
        nome.trim(),
        descricao ? descricao.trim() : null,
        Number(valor),
        Number(estoque),
        data || new Date().toISOString().slice(0, 10)
      ]
    );

    const [rows] = await pool.query(
      `
        SELECT id, nome, descricao, valor, estoque, data
        FROM produtos
        WHERE id = ?
      `,
      [result.insertId]
    );

    return res.status(201).json({
      sucesso: true,
      produto: rows[0]
    });
  } catch (error) {
    return res.status(500).json({
      sucesso: false,
      mensagem: 'Erro ao criar produto',
      detalhe: error.message
    });
  }
});

router.put('/produtos/:id', authMiddleware, requireRole(['admin']), async (req, res) => {
  try {
    const { nome, descricao, valor, estoque, data } = req.body;

    if (!nome || valor === undefined || valor === null || estoque === undefined || estoque === null) {
      return res.status(400).json({
        sucesso: false,
        mensagem: 'Nome, valor e estoque sao obrigatorios'
      });
    }

    if (Number(valor) <= 0 || Number(estoque) < 0) {
      return res.status(400).json({
        sucesso: false,
        mensagem: 'Valor deve ser positivo e estoque nao pode ser negativo'
      });
    }

    const pool = getPool();
    const [result] = await pool.query(
      `
        UPDATE produtos
        SET nome = ?, descricao = ?, valor = ?, estoque = ?, data = ?
        WHERE id = ?
      `,
      [
        nome.trim(),
        descricao ? descricao.trim() : null,
        Number(valor),
        Number(estoque),
        data || new Date().toISOString().slice(0, 10),
        Number(req.params.id)
      ]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({
        sucesso: false,
        mensagem: 'Produto nao encontrado'
      });
    }

    const [rows] = await pool.query(
      `
        SELECT id, nome, descricao, valor, estoque, data
        FROM produtos
        WHERE id = ?
      `,
      [Number(req.params.id)]
    );

    return res.json({
      sucesso: true,
      produto: rows[0]
    });
  } catch (error) {
    return res.status(500).json({
      sucesso: false,
      mensagem: 'Erro ao atualizar produto',
      detalhe: error.message
    });
  }
});

router.delete('/produtos/:id', authMiddleware, requireRole(['admin']), async (req, res) => {
  try {
    const pool = getPool();
    const [usoRows] = await pool.query(
      'SELECT COUNT(*) AS total FROM pedido_itens WHERE produto_id = ?',
      [Number(req.params.id)]
    );

    if (Number(usoRows[0].total) > 0) {
      return res.status(409).json({
        sucesso: false,
        mensagem: 'Nao e possivel excluir um produto que ja foi usado em pedidos'
      });
    }

    const [result] = await pool.query('DELETE FROM produtos WHERE id = ?', [Number(req.params.id)]);

    if (result.affectedRows === 0) {
      return res.status(404).json({
        sucesso: false,
        mensagem: 'Produto nao encontrado'
      });
    }

    return res.json({
      sucesso: true
    });
  } catch (error) {
    return res.status(500).json({
      sucesso: false,
      mensagem: 'Erro ao excluir produto',
      detalhe: error.message
    });
  }
});

module.exports = router;
