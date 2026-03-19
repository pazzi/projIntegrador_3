function validarStatusPedido(status) {
  return ['pendente', 'em-rota', 'entregue', 'ausente', 'cancelado'].includes(status);
}

async function validarPayloadPedido(payload) {
  const { clienteId, data, hora, status, produtos } = payload;

  if (!clienteId || !data) {
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

  return null;
}

module.exports = {
  validarStatusPedido,
  validarPayloadPedido
};