CREATE DATABASE IF NOT EXISTS aqua_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE aqua_db;

CREATE TABLE IF NOT EXISTS usuarios (
  id INT AUTO_INCREMENT PRIMARY KEY,
  usuario VARCHAR(80) NOT NULL UNIQUE,
  nome VARCHAR(120) NOT NULL,
  senha VARCHAR(255) NOT NULL,
  role ENUM('admin', 'entregador', 'outros') NOT NULL DEFAULT 'outros',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

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
);

CREATE TABLE IF NOT EXISTS produtos (
  id INT AUTO_INCREMENT PRIMARY KEY,
  nome VARCHAR(120) NOT NULL,
  descricao TEXT NULL,
  valor DECIMAL(10, 2) NOT NULL,
  data DATE NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS pedidos (
  id INT AUTO_INCREMENT PRIMARY KEY,
  cliente_id INT NOT NULL,
  usuario_id INT NULL,
  entregador_id INT NULL,
  data_pedido DATE NOT NULL,
  hora_pedido TIME NULL,
  data_entrega DATE NOT NULL,
  status ENUM('pendente', 'em-rota', 'entregue', 'ausente', 'cancelado') NOT NULL DEFAULT 'pendente',
  observacoes TEXT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_pedidos_cliente FOREIGN KEY (cliente_id) REFERENCES clientes(id),
  CONSTRAINT fk_pedidos_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios(id),
  CONSTRAINT fk_pedidos_entregador FOREIGN KEY (entregador_id) REFERENCES usuarios(id)
);

CREATE TABLE IF NOT EXISTS pedido_itens (
  id INT AUTO_INCREMENT PRIMARY KEY,
  pedido_id INT NOT NULL,
  produto_id INT NOT NULL,
  quantidade INT NOT NULL DEFAULT 1,
  valor_unitario DECIMAL(10, 2) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_pedido_itens_pedido FOREIGN KEY (pedido_id) REFERENCES pedidos(id) ON DELETE CASCADE,
  CONSTRAINT fk_pedido_itens_produto FOREIGN KEY (produto_id) REFERENCES produtos(id)
);

CREATE TABLE IF NOT EXISTS entregador_localizacao (
  entregador_id INT PRIMARY KEY,
  latitude DECIMAL(10, 7) NOT NULL,
  longitude DECIMAL(10, 7) NOT NULL,
  atualizado_em DATETIME NOT NULL,
  CONSTRAINT fk_localizacao_entregador FOREIGN KEY (entregador_id) REFERENCES usuarios(id) ON DELETE CASCADE
);

-- Usuarios padrao sao criados pelo bootstrap do backend com senha hash.

INSERT INTO clientes (cpf, nome, endereco, latitude, email, longitude)
SELECT * FROM (
  SELECT '11111111111', 'João Silva', 'Rua das Flores, 123, Centro', -22.9068000, 'joao@email.com', -47.0614000
  UNION ALL
  SELECT '22222222222', 'Maria Oliveira', 'Av. Principal, 456, Jardim América', -22.9142000, 'maria@email.com', -47.0689000
  UNION ALL
  SELECT '33333333333', 'Pedro Santos', 'Rua dos Lírios, 789, Vila Nova', -22.8995000, 'pedro@email.com', -47.0556000
  UNION ALL
  SELECT '44444444444', 'Ana Souza', 'Rua das Acácias, 321, Centro', -22.9021000, 'ana@email.com', -47.0732000
) AS seed
WHERE NOT EXISTS (SELECT 1 FROM clientes);

INSERT INTO produtos (nome, descricao, valor, data)
SELECT * FROM (
  SELECT 'Água Mineral 20L', 'Galão de água mineral 20 litros', 12.00, CURDATE()
  UNION ALL
  SELECT 'Água Mineral 10L', 'Galão de água mineral 10 litros', 8.00, CURDATE()
  UNION ALL
  SELECT 'Gás de Cozinha 13kg', 'Botijão de gás GLP 13kg', 110.00, CURDATE()
  UNION ALL
  SELECT 'Suporte para Galão', 'Suporte reforçado para galão de água', 35.00, CURDATE()
) AS seed
WHERE NOT EXISTS (SELECT 1 FROM produtos);

INSERT INTO entregador_localizacao (entregador_id, latitude, longitude, atualizado_em)
SELECT * FROM (
  SELECT 2, -23.0013318, -47.5067903, NOW()
) AS seed
WHERE NOT EXISTS (SELECT 1 FROM entregador_localizacao WHERE entregador_id = 2);
