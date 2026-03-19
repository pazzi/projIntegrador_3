const { getPool } = require('../db');

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

module.exports = {
  buscarClientePorUsuarioId
};