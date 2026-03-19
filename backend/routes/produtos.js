const express = require('express');
const { getPool } = require('../db');

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

module.exports = router;
