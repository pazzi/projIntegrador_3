document.addEventListener('DOMContentLoaded', function () {
    const usuario = sessionStorage.getItem('usuarioLogado');
    if (!usuario) {
        window.location.href = 'login.html';
        return;
    }

    document.getElementById('btn-logout').addEventListener('click', fazerLogout);
    carregarDetalhesEntrega();
});

async function carregarDetalhesEntrega() {
    const params = new URLSearchParams(window.location.search);
    const pedidoId = params.get('id');

    if (!pedidoId) {
        mostrarErro('Pedido não informado', document.getElementById('mensagem'));
        return;
    }

    try {
        const resposta = await fetch(CONFIG.API_URL + '/pedidos/' + pedidoId, {
            headers: {
                'Authorization': 'Bearer ' + sessionStorage.getItem('token')
            }
        });

        const dados = await resposta.json();
        if (!resposta.ok || (dados && dados.sucesso === false)) {
            throw new Error((dados && dados.mensagem) || 'Erro ao carregar entrega');
        }

        renderizarDetalhesEntrega(dados);
    } catch (erro) {
        console.error('Erro ao carregar detalhes da entrega:', erro);
        mostrarErro(erro.message || 'Não foi possível carregar os detalhes da entrega', document.getElementById('mensagem'));
    }
}

function renderizarDetalhesEntrega(pedido) {
    const produtosHtml = (pedido.produtos || []).map((produto) => {
        return `<li>${produto.quantidade}x ${produto.nome} - R$ ${(Number(produto.preco || 0) * Number(produto.quantidade || 0)).toFixed(2)}</li>`;
    }).join('');

    document.getElementById('detalhes-entrega-conteudo').innerHTML = `
        <div class="card-container">
            <div class="card">
                <h3>Pedido</h3>
                <div>#${pedido.id}</div>
            </div>
            <div class="card">
                <h3>Status</h3>
                <div>${pedido.status}</div>
            </div>
            <div class="card">
                <h3>Valor</h3>
                <div>R$ ${Number(pedido.valorTotal || 0).toFixed(2)}</div>
            </div>
        </div>

        <div class="painel" style="margin-top:20px;">
            <h3>Cliente</h3>
            <p><strong>${pedido.clienteNome}</strong></p>
            <p>${pedido.endereco}</p>
            <p>${pedido.email || ''}</p>
        </div>

        <div class="painel" style="margin-top:20px;">
            <h3>Itens do pedido</h3>
            <ul style="padding-left: 20px;">
                ${produtosHtml || '<li>Sem itens cadastrados</li>'}
            </ul>
        </div>

        <div class="painel" style="margin-top:20px;">
            <h3>Datas</h3>
            <p><strong>Pedido:</strong> ${pedido.data ? formatarData(pedido.data) : '-'}</p>
            <p><strong>Hora:</strong> ${pedido.hora || '-'}</p>
            <p><strong>Entrega:</strong> ${pedido.dataEntrega ? formatarData(pedido.dataEntrega) : '-'}</p>
        </div>

        <div class="painel" style="margin-top:20px;">
            <h3>Observações</h3>
            <p>${pedido.observacoes || 'Nenhuma observação informada.'}</p>
        </div>
    `;
}
