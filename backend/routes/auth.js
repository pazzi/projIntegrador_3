const express = require('express');
const { hashPassword, isPasswordHashed, verifyPassword } = require('../auth-utils');
const { getPool } = require('../db');
const { tokens, gerarToken } = require('../middlewares/auth');

const router = express.Router();

router.post('/login', async (req, res) => {
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

router.post('/clientes/cadastro', async (req, res) => {
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

module.exports = router;