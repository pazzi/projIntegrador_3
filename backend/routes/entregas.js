const express = require('express');
const { getPool } = require('../db');
const { authMiddleware } = require('../middlewares/auth');
const { listarEntregas } = require('../services/pedidos');

const router = express.Router();

// Aplicar middleware de autenticação a todas as rotas
router.use(authMiddleware);

router.get('/dashboard/indicadores', async (_req, res) => {
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

router.get('/entregas/hoje', async (req, res) => {
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

router.get('/entregas/hoje/pontos', async (req, res) => {
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

router.get('/entregador/entregas', async (req, res) => {
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

router.get('/entregas/pendentes/pontos', async (req, res) => {
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

router.get('/entregas/pendentes', async (req, res) => {
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

router.put('/entregas/:id/status', async (req, res) => {
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

router.get('/entregador/localizacao', async (req, res) => {
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

router.post('/entregador/localizacao', async (req, res) => {
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

module.exports = router;