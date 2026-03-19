const { getPool } = require('../db');

function normalizarEntrega(row) {
  return {
    id: row.id,
    cliente: row.cliente,
    endereco: row.endereco,
    produto: row.produto,
    quantidade: Number(row.quantidade || 0),
    status: row.status,
    requerEntrega: Boolean(row.requerEntrega),
    latitude: row.latitude !== null ? Number(row.latitude) : null,
    longitude: row.longitude !== null ? Number(row.longitude) : null,
    observacao: row.observacao || ''
  };
}

async function montarPedidos(whereClause = '', params = []) {
  const pool = getPool();
  const [rows] = await pool.query(
    `
      SELECT
        p.id,
        DATE_FORMAT(p.data_pedido, '%Y-%m-%d') AS data,
        TIME_FORMAT(p.hora_pedido, '%H:%i') AS hora,
        DATE_FORMAT(p.data_entrega, '%Y-%m-%d') AS dataEntrega,
        p.cliente_id AS clienteId,
        p.requer_entrega AS requerEntrega,
        c.nome AS clienteNome,
        c.endereco,
        c.email,
        p.observacoes,
        p.status,
        COALESCE(SUM(pi.quantidade * pi.valor_unitario), 0) AS valorTotal
      FROM pedidos p
      INNER JOIN clientes c ON c.id = p.cliente_id
      LEFT JOIN pedido_itens pi ON pi.pedido_id = p.id
      ${whereClause}
      GROUP BY p.id, p.data_pedido, p.hora_pedido, p.data_entrega, p.requer_entrega, p.cliente_id, c.nome, c.endereco, c.email, p.observacoes, p.status
      ORDER BY p.data_pedido DESC, p.hora_pedido DESC, p.id DESC
    `,
    params
  );

  if (rows.length === 0) {
    return [];
  }

  const [itensRows] = await pool.query(
    `
      SELECT
        pi.id,
        pi.pedido_id AS pedidoId,
        pi.produto_id AS produtoId,
        pr.nome,
        pi.quantidade,
        pi.valor_unitario AS preco
      FROM pedido_itens pi
      INNER JOIN produtos pr ON pr.id = pi.produto_id
      WHERE pi.pedido_id IN (?)
      ORDER BY pi.id ASC
    `,
    [rows.map((row) => row.id)]
  );

  const itensPorPedido = new Map();
  itensRows.forEach((item) => {
    if (!itensPorPedido.has(item.pedidoId)) {
      itensPorPedido.set(item.pedidoId, []);
    }

    itensPorPedido.get(item.pedidoId).push({
      id: item.produtoId,
      nome: item.nome,
      quantidade: Number(item.quantidade),
      preco: Number(item.preco)
    });
  });

  return rows.map((row) => ({
    id: row.id,
    data: row.data,
    hora: row.hora,
    dataEntrega: row.dataEntrega,
    clienteId: row.clienteId,
    requerEntrega: Boolean(row.requerEntrega),
    clienteNome: row.clienteNome,
    endereco: row.endereco,
    email: row.email,
    observacoes: row.observacoes || '',
    status: row.status,
    valorTotal: Number(row.valorTotal || 0),
    produtos: itensPorPedido.get(row.id) || []
  }));
}

async function buscarPedidoPorId(id) {
  const pedidos = await montarPedidos('WHERE p.id = ?', [id]);
  return pedidos[0] || null;
}

async function buscarItensPedido(connection, pedidoId) {
  const [rows] = await connection.query(
    `
      SELECT produto_id AS produtoId, quantidade
      FROM pedido_itens
      WHERE pedido_id = ?
      ORDER BY id ASC
    `,
    [pedidoId]
  );

  return rows.map((item) => ({
    produtoId: Number(item.produtoId),
    quantidade: Number(item.quantidade)
  }));
}

function agruparQuantidadePorProduto(itens) {
  return itens.reduce((mapa, item) => {
    const produtoId = Number(item.produtoId);
    const quantidadeAtual = mapa.get(produtoId) || 0;
    mapa.set(produtoId, quantidadeAtual + Number(item.quantidade || 0));
    return mapa;
  }, new Map());
}

async function buscarProdutosPorIds(connection, produtoIds) {
  if (produtoIds.length === 0) {
    return [];
  }

  const [produtosDb] = await connection.query(
    `
      SELECT id, nome, valor, estoque
      FROM produtos
      WHERE id IN (?)
      FOR UPDATE
    `,
    [produtoIds]
  );

  return produtosDb.map((produto) => ({
    id: Number(produto.id),
    nome: produto.nome,
    valor: Number(produto.valor),
    estoque: Number(produto.estoque)
  }));
}

async function ajustarEstoque(connection, itens, operacao) {
  const quantidadesPorProduto = agruparQuantidadePorProduto(itens);
  const produtoIds = Array.from(quantidadesPorProduto.keys());
  const produtosDb = await buscarProdutosPorIds(connection, produtoIds);

  if (produtosDb.length !== produtoIds.length) {
    throw new Error('Um ou mais produtos informados nao existem');
  }

  const produtoPorId = new Map(produtosDb.map((produto) => [produto.id, produto]));

  for (const produtoId of produtoIds) {
    const quantidade = quantidadesPorProduto.get(produtoId);
    const produto = produtoPorId.get(produtoId);

    if (operacao === 'debitar' && produto.estoque < quantidade) {
      throw new Error(`Estoque insuficiente para o produto ${produto.nome}`);
    }
  }

  for (const produtoId of produtoIds) {
    const quantidade = quantidadesPorProduto.get(produtoId);
    const ajuste = operacao === 'debitar' ? -quantidade : quantidade;
    await connection.query(
      `
        UPDATE produtos
        SET estoque = estoque + ?
        WHERE id = ?
      `,
      [ajuste, produtoId]
    );
  }
}

async function salvarItensPedido(connection, pedidoId, produtos) {
  if (produtos.length === 0) {
    return;
  }

  const produtoIds = produtos.map((item) => Number(item.produtoId));
  const produtosDb = await buscarProdutosPorIds(connection, produtoIds);
  const valorPorProdutoId = new Map(produtosDb.map((produto) => [produto.id, produto.valor]));

  if (valorPorProdutoId.size !== produtoIds.length) {
    throw new Error('Um ou mais produtos informados nao existem');
  }

  const values = produtos.map((item) => [
    pedidoId,
    Number(item.produtoId),
    Number(item.quantidade),
    valorPorProdutoId.get(Number(item.produtoId))
  ]);

  await connection.query(
    `
      INSERT INTO pedido_itens (pedido_id, produto_id, quantidade, valor_unitario)
      VALUES ?
    `,
    [values]
  );
}

async function sincronizarEstoquePedido(connection, itensAnteriores, statusAnterior, itensNovos, statusNovo) {
  if (statusAnterior && statusAnterior !== 'cancelado' && itensAnteriores.length > 0) {
    await ajustarEstoque(connection, itensAnteriores, 'creditar');
  }

  if (statusNovo !== 'cancelado' && itensNovos.length > 0) {
    await ajustarEstoque(connection, itensNovos, 'debitar');
  }
}

async function atualizarStatusPedidoComEstoque(connection, pedidoId, statusNovo) {
  const [pedidos] = await connection.query(
    `
      SELECT id, status
      FROM pedidos
      WHERE id = ?
      LIMIT 1
      FOR UPDATE
    `,
    [pedidoId]
  );

  if (pedidos.length === 0) {
    return null;
  }

  const pedido = pedidos[0];
  const statusAnterior = pedido.status;

  if (statusAnterior === statusNovo) {
    await connection.query('UPDATE pedidos SET status = ? WHERE id = ?', [statusNovo, pedidoId]);
    return { mudou: false };
  }

  const itensPedido = await buscarItensPedido(connection, pedidoId);
  await sincronizarEstoquePedido(connection, itensPedido, statusAnterior, itensPedido, statusNovo);
  await connection.query('UPDATE pedidos SET status = ? WHERE id = ?', [statusNovo, pedidoId]);

  return { mudou: true };
}

async function buscarEntregadorPadrao(connection) {
  const executor = connection || getPool();
  const [rows] = await executor.query(
    `
      SELECT id, nome
      FROM usuarios
      WHERE role = 'entregador'
      ORDER BY id ASC
      LIMIT 1
    `
  );

  return rows[0] || null;
}

async function listarEntregas({ entregadorId, role, somenteHoje = true, status } = {}) {
  const pool = getPool();
  const filtros = ['p.requer_entrega = 1'];
  const params = [];

  if (somenteHoje) {
    filtros.push('p.data_entrega = CURDATE()');
  }

  if (status) {
    filtros.push('p.status = ?');
    params.push(status);
  }

  if (role !== 'admin' && entregadorId) {
    filtros.push('p.entregador_id = ?');
    params.push(entregadorId);
  }

  const [rows] = await pool.query(
    `
      SELECT
        p.id,
        c.nome AS cliente,
        c.endereco,
        GROUP_CONCAT(CONCAT(pr.nome, ' x', pi.quantidade) ORDER BY pi.id SEPARATOR ', ') AS produto,
        SUM(pi.quantidade) AS quantidade,
        p.status,
        p.requer_entrega AS requerEntrega,
        c.latitude,
        c.longitude,
        p.observacoes AS observacao
      FROM pedidos p
      INNER JOIN clientes c ON c.id = p.cliente_id
      INNER JOIN pedido_itens pi ON pi.pedido_id = p.id
      INNER JOIN produtos pr ON pr.id = pi.produto_id
      ${filtros.length > 0 ? `WHERE ${filtros.join(' AND ')}` : ''}
      GROUP BY p.id, c.nome, c.endereco, p.status, c.latitude, c.longitude, p.observacoes
      ORDER BY p.hora_pedido ASC, p.id ASC
    `,
    params
  );

  return rows.map(normalizarEntrega);
}

module.exports = {
  montarPedidos,
  buscarPedidoPorId,
  buscarItensPedido,
  salvarItensPedido,
  sincronizarEstoquePedido,
  atualizarStatusPedidoComEstoque,
  buscarEntregadorPadrao,
  listarEntregas,
  normalizarEntrega
};
