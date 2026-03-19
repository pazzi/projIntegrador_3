const express = require('express');
const { getPool } = require('../db');
const { authMiddleware } = require('../middlewares/auth');

const router = express.Router();

// Aplicar middleware de autenticação a todas as rotas
router.use(authMiddleware);

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