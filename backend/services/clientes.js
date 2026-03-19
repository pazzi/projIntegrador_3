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

  if (rows.length > 0) {
    return rows[0];
  }

  const [usuarios] = await pool.query(
    `
      SELECT nome
      FROM usuarios
      WHERE id = ?
      LIMIT 1
    `,
    [usuarioId]
  );

  if (usuarios.length === 0) {
    return null;
  }

  const [clientesSemVinculo] = await pool.query(
    `
      SELECT id, cpf, nome, endereco, latitude, email, longitude
      FROM clientes
      WHERE usuario_id IS NULL
        AND nome = ?
      LIMIT 2
    `,
    [usuarios[0].nome]
  );

  if (clientesSemVinculo.length !== 1) {
    return null;
  }

  await pool.query(
    `
      UPDATE clientes
      SET usuario_id = ?
      WHERE id = ? AND usuario_id IS NULL
    `,
    [usuarioId, clientesSemVinculo[0].id]
  );

  return {
    ...clientesSemVinculo[0],
    usuarioId
  };
}

module.exports = {
  buscarClientePorUsuarioId
};
