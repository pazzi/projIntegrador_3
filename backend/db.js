const mysql = require('mysql2/promise');
const dotenv = require('dotenv');
const { hashPassword } = require('./auth-utils');

dotenv.config();

const DB_NAME = process.env.DB_NAME || 'aqua_db';

let pool;

function createBaseConfig(includeDatabase = true) {
  const config = {
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    waitForConnections: true,
    connectionLimit: 10,
    namedPlaceholders: true
  };

  if (includeDatabase) {
    config.database = DB_NAME;
  }

  return config;
}

async function ensureDatabase() {
  const connection = await mysql.createConnection(createBaseConfig(false));

  try {
    await connection.query(`CREATE DATABASE IF NOT EXISTS \`${DB_NAME}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  } finally {
    await connection.end();
  }
}

async function ensureTables() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS usuarios (
      id INT AUTO_INCREMENT PRIMARY KEY,
      usuario VARCHAR(80) NOT NULL UNIQUE,
      nome VARCHAR(120) NOT NULL,
      senha VARCHAR(255) NOT NULL,
      role ENUM('admin', 'entregador', 'outros') NOT NULL DEFAULT 'outros',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS clientes (
      id INT AUTO_INCREMENT PRIMARY KEY,
      usuario_id INT NULL UNIQUE,
      cpf VARCHAR(14) NOT NULL UNIQUE,
      nome VARCHAR(120) NOT NULL,
      endereco VARCHAR(255) NOT NULL,
      latitude DECIMAL(10, 7) NULL,
      email VARCHAR(120) NULL,
      longitude DECIMAL(10, 7) NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT fk_clientes_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS produtos (
      id INT AUTO_INCREMENT PRIMARY KEY,
      nome VARCHAR(120) NOT NULL,
      descricao TEXT NULL,
      valor DECIMAL(10, 2) NOT NULL,
      estoque INT NOT NULL DEFAULT 0,
      estoque_minimo INT NOT NULL DEFAULT 10,
      data DATE NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS pedidos (
      id INT AUTO_INCREMENT PRIMARY KEY,
      cliente_id INT NOT NULL,
      usuario_id INT NULL,
      entregador_id INT NULL,
      data_pedido DATE NOT NULL,
      hora_pedido TIME NULL,
      data_entrega DATE NOT NULL,
      requer_entrega TINYINT(1) NOT NULL DEFAULT 1,
      status ENUM('pendente', 'em-rota', 'entregue', 'ausente', 'cancelado') NOT NULL DEFAULT 'pendente',
      observacoes TEXT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT fk_pedidos_cliente FOREIGN KEY (cliente_id) REFERENCES clientes(id),
      CONSTRAINT fk_pedidos_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios(id),
      CONSTRAINT fk_pedidos_entregador FOREIGN KEY (entregador_id) REFERENCES usuarios(id)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS pedido_itens (
      id INT AUTO_INCREMENT PRIMARY KEY,
      pedido_id INT NOT NULL,
      produto_id INT NOT NULL,
      quantidade INT NOT NULL DEFAULT 1,
      valor_unitario DECIMAL(10, 2) NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT fk_pedido_itens_pedido FOREIGN KEY (pedido_id) REFERENCES pedidos(id) ON DELETE CASCADE,
      CONSTRAINT fk_pedido_itens_produto FOREIGN KEY (produto_id) REFERENCES produtos(id)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS entregador_localizacao (
      entregador_id INT PRIMARY KEY,
      latitude DECIMAL(10, 7) NOT NULL,
      longitude DECIMAL(10, 7) NOT NULL,
      atualizado_em DATETIME NOT NULL,
      CONSTRAINT fk_localizacao_entregador FOREIGN KEY (entregador_id) REFERENCES usuarios(id) ON DELETE CASCADE
    )
  `);
}

async function ensureColumnIfMissing(tableName, columnName, definition) {
  const [rows] = await pool.query(
    `
      SELECT COUNT(*) AS total
      FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = ?
        AND TABLE_NAME = ?
        AND COLUMN_NAME = ?
    `,
    [DB_NAME, tableName, columnName]
  );

  if (Number(rows[0].total) === 0) {
    await pool.query(`ALTER TABLE ${tableName} ADD COLUMN ${definition}`);
  }
}

async function ensureConstraintIfMissing(tableName, constraintName, statement) {
  const [rows] = await pool.query(
    `
      SELECT COUNT(*) AS total
      FROM information_schema.TABLE_CONSTRAINTS
      WHERE TABLE_SCHEMA = ?
        AND TABLE_NAME = ?
        AND CONSTRAINT_NAME = ?
    `,
    [DB_NAME, tableName, constraintName]
  );

  if (Number(rows[0].total) === 0) {
    await pool.query(statement);
  }
}

async function ensureSchemaUpgrades() {
  await ensureColumnIfMissing('clientes', 'usuario_id', 'usuario_id INT NULL UNIQUE AFTER id');
  await ensureColumnIfMissing('produtos', 'estoque', 'estoque INT NOT NULL DEFAULT 0 AFTER valor');
  await ensureColumnIfMissing('produtos', 'estoque_minimo', 'estoque_minimo INT NOT NULL DEFAULT 10 AFTER estoque');
  await ensureColumnIfMissing('pedidos', 'requer_entrega', 'requer_entrega TINYINT(1) NOT NULL DEFAULT 1 AFTER data_entrega');
  await ensureConstraintIfMissing(
    'clientes',
    'fk_clientes_usuario',
    'ALTER TABLE clientes ADD CONSTRAINT fk_clientes_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios(id)'
  );

  const [[estoqueInfo]] = await pool.query(
    `
      SELECT COUNT(*) AS totalProdutos, COALESCE(SUM(estoque), 0) AS estoqueTotal
      FROM produtos
    `
  );

  if (Number(estoqueInfo.totalProdutos) > 0 && Number(estoqueInfo.estoqueTotal) === 0) {
    await pool.query(`
      UPDATE produtos
      SET estoque = CASE nome
        WHEN 'Água Mineral 20L' THEN 80
        WHEN 'Água Mineral 10L' THEN 60
        WHEN 'Gás de Cozinha 13kg' THEN 30
        WHEN 'Suporte para Galão' THEN 20
        ELSE 15
      END,
      estoque_minimo = CASE nome
        WHEN 'Água Mineral 20L' THEN 20
        WHEN 'Água Mineral 10L' THEN 15
        WHEN 'Gás de Cozinha 13kg' THEN 8
        WHEN 'Suporte para Galão' THEN 5
        ELSE 5
      END
    `);
  }
}

async function seedIfEmpty() {
  const [[usuariosCount]] = await pool.query('SELECT COUNT(*) AS total FROM usuarios');

  if (usuariosCount.total === 0) {
    const adminPasswordHash = await hashPassword('admin123');
    const entregadorPasswordHash = await hashPassword('entregador123');

    await pool.query(`
      INSERT INTO usuarios (usuario, nome, senha, role)
      VALUES
        ('admin', 'Administrador', ?, 'admin'),
        ('entregador', 'Entregador', ?, 'entregador')
    `, [adminPasswordHash, entregadorPasswordHash]);
  }

  const [[clientesCount]] = await pool.query('SELECT COUNT(*) AS total FROM clientes');

  if (clientesCount.total === 0) {
    await pool.query(`
      INSERT INTO clientes (cpf, nome, endereco, latitude, email, longitude)
      VALUES
        ('11111111111', 'João Silva', 'Rua das Flores, 123, Centro', -22.9068000, 'joao@email.com', -47.0614000),
        ('22222222222', 'Maria Oliveira', 'Av. Principal, 456, Jardim América', -22.9142000, 'maria@email.com', -47.0689000),
        ('33333333333', 'Pedro Santos', 'Rua dos Lírios, 789, Vila Nova', -22.8995000, 'pedro@email.com', -47.0556000),
        ('44444444444', 'Ana Souza', 'Rua das Acácias, 321, Centro', -22.9021000, 'ana@email.com', -47.0732000)
    `);
  }

  const [[produtosCount]] = await pool.query('SELECT COUNT(*) AS total FROM produtos');

  if (produtosCount.total === 0) {
    await pool.query(`
      INSERT INTO produtos (nome, descricao, valor, estoque, estoque_minimo, data)
      VALUES
        ('Água Mineral 20L', 'Galão de água mineral 20 litros', 12.00, 80, 20, CURDATE()),
        ('Água Mineral 10L', 'Galão de água mineral 10 litros', 8.00, 60, 15, CURDATE()),
        ('Gás de Cozinha 13kg', 'Botijão de gás GLP 13kg', 110.00, 30, 8, CURDATE()),
        ('Suporte para Galão', 'Suporte reforçado para galão de água', 35.00, 20, 5, CURDATE())
    `);
  }

  const [[pedidosCount]] = await pool.query('SELECT COUNT(*) AS total FROM pedidos');

  if (pedidosCount.total === 0) {
    await pool.query(`
      INSERT INTO pedidos (cliente_id, usuario_id, entregador_id, data_pedido, hora_pedido, data_entrega, status, observacoes)
      VALUES
        (1, 1, 2, CURDATE(), '09:30:00', CURDATE(), 'pendente', 'Deixar no portão'),
        (2, 1, 2, CURDATE(), '10:15:00', CURDATE(), 'entregue', ''),
        (3, 1, 2, CURDATE(), '11:00:00', CURDATE(), 'ausente', 'Tocar interfone 2x'),
        (4, 1, 2, CURDATE(), '14:00:00', DATE_ADD(CURDATE(), INTERVAL 1 DAY), 'pendente', 'Cobrar na entrega')
    `);

    await pool.query(`
      INSERT INTO pedido_itens (pedido_id, produto_id, quantidade, valor_unitario)
      VALUES
        (1, 1, 2, 12.00),
        (2, 3, 1, 110.00),
        (3, 1, 3, 12.00),
        (4, 2, 4, 8.00),
        (4, 4, 1, 35.00)
    `);
  }

  const [[localizacaoCount]] = await pool.query('SELECT COUNT(*) AS total FROM entregador_localizacao');

  if (localizacaoCount.total === 0) {
    await pool.query(`
      INSERT INTO entregador_localizacao (entregador_id, latitude, longitude, atualizado_em)
      VALUES (2, -23.0013318, -47.5067903, NOW())
    `);
  }
}

async function initializeDatabase() {
  if (pool) {
    return pool;
  }

  await ensureDatabase();
  pool = mysql.createPool(createBaseConfig(true));

  await ensureTables();
  await ensureSchemaUpgrades();
  await seedIfEmpty();

  return pool;
}

function getPool() {
  if (!pool) {
    throw new Error('Banco de dados ainda nao foi inicializado');
  }

  return pool;
}

module.exports = {
  DB_NAME,
  getPool,
  initializeDatabase
};
