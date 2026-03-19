function validarStatusPedido(status) {
  return ['pendente', 'em-rota', 'entregue', 'ausente', 'cancelado'].includes(status);
}

async function validarPayloadPedido(payload, options = {}) {
  const { requireClienteId = true } = options;
  const { clienteId, data, hora, status, produtos, requerEntrega } = payload;

  if ((requireClienteId && !clienteId) || !data) {
    return 'Cliente e data do pedido sao obrigatorios';
  }

  if (!Array.isArray(produtos) || produtos.length === 0) {
    return 'Informe ao menos um produto no pedido';
  }

  if (status && !validarStatusPedido(status)) {
    return 'Status invalido';
  }

  const itensInvalidos = produtos.some((item) => !item.produtoId || Number(item.quantidade) <= 0);
  if (itensInvalidos) {
    return 'Todos os itens precisam de produto e quantidade valida';
  }

  if (hora && !/^\d{2}:\d{2}$/.test(hora)) {
    return 'Hora invalida';
  }

  if (
    requerEntrega !== undefined &&
    ![true, false, 1, 0, '1', '0', 'true', 'false', 'sim', 'nao', 'não'].includes(requerEntrega)
  ) {
    return 'Indicador de entrega invalido';
  }

  return null;
}

module.exports = {
  validarStatusPedido,
  validarPayloadPedido
};
