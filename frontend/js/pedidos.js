let pedidos = [];
let clientes = [];
let produtos = [];
let contadorProdutos = 1;
let pedidoEditando = null;

document.addEventListener('DOMContentLoaded', async function () {
    if (!document.getElementById('corpo-tabela-pedidos')) {
        return;
    }

    const usuario = sessionStorage.getItem('usuarioLogado');
    if (!usuario) {
        window.location.href = 'login.html';
        return;
    }

    const tipo = sessionStorage.getItem('tipoUsuario');
    if (tipo !== 'admin') {
        window.location.href = 'entregador.html';
        return;
    }

    document.getElementById('nome-usuario').textContent = 'Olá, ' + usuario;
    document.getElementById('btn-logout').addEventListener('click', fazerLogout);
    document.getElementById('btn-novo-pedido').addEventListener('click', abrirModalNovoPedido);
    document.getElementById('btn-cancelar-modal').addEventListener('click', fecharModalPedido);
    document.getElementById('btn-aplicar-filtros').addEventListener('click', aplicarFiltros);
    document.getElementById('btn-limpar-filtros').addEventListener('click', limparFiltros);
    document.getElementById('btn-adicionar-produto').addEventListener('click', function () {
        adicionarProduto();
    });
    document.getElementById('btn-fechar-detalhes').addEventListener('click', fecharModalDetalhes);
    document.getElementById('btn-editar-do-detalhe').addEventListener('click', function () {
        if (pedidoEditando) {
            fecharModalDetalhes();
            abrirModalEditarPedido(pedidoEditando.id);
        }
    });
    document.getElementById('btn-cancelar-excluir').addEventListener('click', fecharModalExcluir);
    document.getElementById('btn-confirmar-excluir').addEventListener('click', confirmarExclusao);
    document.getElementById('form-pedido').addEventListener('submit', salvarPedido);
    document.getElementById('filtro-cliente').addEventListener('input', aplicarFiltros);
    document.getElementById('filtro-status').addEventListener('change', aplicarFiltros);
    document.getElementById('filtro-data').addEventListener('change', aplicarFiltros);

    definirDataHoraPadrao();
    await Promise.all([carregarClientes(), carregarProdutos()]);
    await carregarPedidos();
});

async function apiFetch(path, options = {}) {
    const headers = {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + sessionStorage.getItem('token'),
        ...(options.headers || {})
    };

    const resposta = await fetch(CONFIG.API_URL + path, {
        ...options,
        headers
    });

    const contentType = resposta.headers.get('content-type') || '';
    const corpo = await resposta.text();
    let dados = null;

    if (contentType.includes('application/json')) {
        dados = corpo ? JSON.parse(corpo) : null;
    }

    if (!resposta.ok || (dados && dados.sucesso === false)) {
        if (!contentType.includes('application/json')) {
            throw new Error('A API respondeu com HTML em vez de JSON. Verifique se o backend está rodando na porta configurada.');
        }

        throw new Error((dados && dados.mensagem) || 'Erro ao processar requisição');
    }

    return dados;
}

function definirDataHoraPadrao() {
    const hoje = new Date().toISOString().split('T')[0];
    const agora = new Date();
    const hora = String(agora.getHours()).padStart(2, '0');
    const minutos = String(agora.getMinutes()).padStart(2, '0');

    document.getElementById('data-pedido').value = hoje;
    document.getElementById('hora-pedido').value = `${hora}:${minutos}`;
}

async function carregarClientes() {
    const dados = await apiFetch('/clientes', { method: 'GET' });
    clientes = dados.map((cliente) => ({
        id: Number(cliente.id),
        nome: cliente.nome || '',
        endereco: cliente.endereco || '',
        email: cliente.email || ''
    }));

    const selectCliente = document.getElementById('cliente-id');
    selectCliente.innerHTML = '<option value="">Selecione um cliente...</option>';

    clientes.forEach((cliente) => {
        const option = document.createElement('option');
        option.value = cliente.id;
        option.textContent = `${cliente.nome} - ${cliente.endereco}`;
        selectCliente.appendChild(option);
    });
}

async function carregarProdutos() {
    const dados = await apiFetch('/produtos', { method: 'GET' });
    produtos = dados.map((produto) => ({
        id: Number(produto.id),
        nome: produto.nome || '',
        preco: Number(produto.valor || 0),
        descricao: produto.descricao || '',
        estoque: Number(produto.estoque || 0)
    }));

    atualizarSelectsProdutos();
}

async function carregarPedidos() {
    try {
        const dados = await apiFetch('/pedidos', { method: 'GET' });
        pedidos = dados.map(normalizarPedido);
        renderizarTabelaPedidos(pedidos);
    } catch (erro) {
        console.error('Erro ao carregar pedidos:', erro);
        mostrarErro(erro.message || 'Não foi possível carregar os pedidos', document.getElementById('mensagem'));
    }
}

function normalizarPedido(pedido) {
    return {
        id: Number(pedido.id),
        data: pedido.data || '',
        hora: pedido.hora || '',
        clienteId: Number(pedido.clienteId),
        clienteNome: pedido.clienteNome || '',
        endereco: pedido.endereco || '',
        email: pedido.email || '',
        observacoes: pedido.observacoes || '',
        status: pedido.status || 'pendente',
        valorTotal: Number(pedido.valorTotal || 0),
        produtos: Array.isArray(pedido.produtos)
            ? pedido.produtos.map((produto) => ({
                id: Number(produto.id),
                nome: produto.nome || '',
                quantidade: Number(produto.quantidade || 0),
                preco: Number(produto.preco || 0)
            }))
            : []
    };
}

function atualizarSelectsProdutos() {
    document.querySelectorAll('.produto-select').forEach((select) => {
        const valorAtual = select.value;
        select.innerHTML = '<option value="">Selecione...</option>';

        produtos.forEach((produto) => {
            const option = document.createElement('option');
            option.value = produto.id;
            const estoqueDisponivel = obterEstoqueDisponivelProdutoPedido(produto.id, select);
            option.textContent = formatarTextoProdutoPedido(produto, estoqueDisponivel);
            option.disabled = estoqueDisponivel <= 0 && select.value !== String(produto.id);
            select.appendChild(option);
        });

        if (valorAtual) {
            select.value = valorAtual;
        }
    });

    validarQuantidadesProdutosPedido();
    calcularTotal();
}

function formatarTextoProdutoPedido(produto, estoqueDisponivel) {
    if (estoqueDisponivel <= 0) {
        return `${produto.nome} - R$ ${produto.preco.toFixed(2)} (sem estoque)`;
    }

    if (estoqueDisponivel <= 10) {
        return `${produto.nome} - R$ ${produto.preco.toFixed(2)} (${estoqueDisponivel} un. - baixo estoque)`;
    }

    return `${produto.nome} - R$ ${produto.preco.toFixed(2)} (${estoqueDisponivel} un.)`;
}

function obterQuantidadeReservadaNaEdicao(produtoId) {
    if (!pedidoEditando || !Array.isArray(pedidoEditando.produtos)) {
        return 0;
    }

    return pedidoEditando.produtos
        .filter((produto) => produto.id === Number(produtoId))
        .reduce((total, produto) => total + Number(produto.quantidade || 0), 0);
}

function obterEstoqueDisponivelProdutoPedido(produtoId, selectAtual) {
    const produto = produtos.find((entry) => entry.id === Number(produtoId));
    if (!produto) {
        return 0;
    }

    let quantidadeSelecionada = 0;
    document.querySelectorAll('.produto-item').forEach((item) => {
        const select = item.querySelector('.produto-select');
        if (select === selectAtual) {
            return;
        }

        if (Number(select.value) === Number(produtoId)) {
            quantidadeSelecionada += Number(item.querySelector('.produto-quantidade').value || 0);
        }
    });

    return Math.max(produto.estoque + obterQuantidadeReservadaNaEdicao(produtoId) - quantidadeSelecionada, 0);
}

function validarQuantidadesProdutosPedido() {
    document.querySelectorAll('.produto-item').forEach((item) => {
        const select = item.querySelector('.produto-select');
        const inputQuantidade = item.querySelector('.produto-quantidade');
        const produtoId = Number(select.value);

        if (!produtoId) {
            inputQuantidade.removeAttribute('max');
            return;
        }

        const estoqueDisponivel = obterEstoqueDisponivelProdutoPedido(produtoId, select);
        inputQuantidade.max = String(estoqueDisponivel);

        if (Number(inputQuantidade.value || 0) > estoqueDisponivel) {
            inputQuantidade.value = estoqueDisponivel > 0 ? String(estoqueDisponivel) : '';
        }
    });
}

function renderizarTabelaPedidos(listaPedidos) {
    const tbody = document.getElementById('corpo-tabela-pedidos');
    tbody.innerHTML = '';

    if (listaPedidos.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" style="text-align: center; padding: 30px;">Nenhum pedido encontrado</td></tr>';
        return;
    }

    listaPedidos.forEach((pedido) => {
        const tr = document.createElement('tr');
        const dataFormatada = formatarDataPedido(pedido.data);
        const listaProdutos = pedido.produtos.length > 0
            ? pedido.produtos.map((produto) => `${produto.quantidade}x ${produto.nome}`).join('<br>')
            : '<span style="color:#777;">Sem itens</span>';

        tr.innerHTML = `
            <td>#${pedido.id}</td>
            <td>${dataFormatada}<br><small>${pedido.hora || ''}</small></td>
            <td><strong>${pedido.clienteNome}</strong><br><small>${pedido.email || ''}</small></td>
            <td><small>${pedido.endereco}</small></td>
            <td><small>${listaProdutos}</small></td>
            <td><strong>R$ ${pedido.valorTotal.toFixed(2)}</strong></td>
            <td><span class="badge-status ${obterClasseStatus(pedido.status)}">${obterTextoStatus(pedido.status)}</span></td>
            <td class="acoes-pedido">
                <button class="botao botao-pequeno" onclick="verDetalhesPedido(${pedido.id})">Ver</button>
                <button class="botao botao-pequeno" onclick="abrirModalEditarPedido(${pedido.id})">Editar</button>
                <button class="botao-perigo botao-pequeno" onclick="abrirModalExcluir(${pedido.id})">Excluir</button>
            </td>
        `;

        tbody.appendChild(tr);
    });
}

function aplicarFiltros() {
    const status = document.getElementById('filtro-status').value;
    const cliente = document.getElementById('filtro-cliente').value.trim().toLowerCase();
    const data = document.getElementById('filtro-data').value;

    const pedidosFiltrados = pedidos.filter((pedido) => {
        const bateStatus = !status || pedido.status === status;
        const bateCliente = !cliente || pedido.clienteNome.toLowerCase().includes(cliente);
        const bateData = !data || pedido.data === data;
        return bateStatus && bateCliente && bateData;
    });

    renderizarTabelaPedidos(pedidosFiltrados);
}

function limparFiltros() {
    document.getElementById('filtro-status').value = '';
    document.getElementById('filtro-cliente').value = '';
    document.getElementById('filtro-data').value = '';
    renderizarTabelaPedidos(pedidos);
}

function abrirModalNovoPedido() {
    pedidoEditando = null;
    document.getElementById('titulo-modal').textContent = 'Novo Pedido';
    document.getElementById('pedido-id').value = '';
    document.getElementById('cliente-id').value = '';
    document.getElementById('observacoes').value = '';
    document.getElementById('status-pedido').value = 'pendente';
    document.getElementById('campo-status').style.display = 'none';
    document.getElementById('produtos-container').innerHTML = '';
    contadorProdutos = 1;
    adicionarProduto();
    definirDataHoraPadrao();
    document.getElementById('modal-pedido').style.display = 'block';
    calcularTotal();
}

function abrirModalEditarPedido(id) {
    const pedido = pedidos.find((item) => item.id === id);
    if (!pedido) {
        return;
    }

    pedidoEditando = pedido;
    document.getElementById('titulo-modal').textContent = `Editar Pedido #${id}`;
    document.getElementById('pedido-id').value = id;
    document.getElementById('cliente-id').value = pedido.clienteId;
    document.getElementById('observacoes').value = pedido.observacoes || '';
    document.getElementById('data-pedido').value = pedido.data;
    document.getElementById('hora-pedido').value = pedido.hora || '';
    document.getElementById('status-pedido').value = pedido.status;
    document.getElementById('campo-status').style.display = 'block';
    document.getElementById('produtos-container').innerHTML = '';
    contadorProdutos = 1;

    if (pedido.produtos.length === 0) {
        adicionarProduto();
    } else {
        pedido.produtos.forEach((produto) => {
            adicionarProduto(produto.id, produto.quantidade);
        });
    }

    document.getElementById('modal-pedido').style.display = 'block';
    calcularTotal();
}

function fecharModalPedido() {
    document.getElementById('modal-pedido').style.display = 'none';
    pedidoEditando = null;
}

function adicionarProduto(produtoId = '', quantidade = 1) {
    const container = document.getElementById('produtos-container');
    const index = contadorProdutos++;
    const div = document.createElement('div');
    div.className = 'produto-item';
    div.id = `produto-${index}`;

    div.innerHTML = `
        <select class="produto-select" required>
            <option value="">Selecione...</option>
        </select>
        <input type="number" class="produto-quantidade" placeholder="Qtd" min="1" value="${quantidade}" required>
        <button type="button" class="btn-remover" onclick="removerProduto(${index})">✕</button>
    `;

    container.appendChild(div);

    const select = div.querySelector('.produto-select');
    produtos.forEach((produto) => {
        const option = document.createElement('option');
        option.value = produto.id;
        option.textContent = `${produto.nome} - R$ ${produto.preco.toFixed(2)}`;
        select.appendChild(option);
    });

    if (produtoId) {
        select.value = String(produtoId);
    }

    select.addEventListener('change', function () {
        atualizarSelectsProdutos();
        calcularTotal();
    });
    div.querySelector('.produto-quantidade').addEventListener('input', function () {
        validarQuantidadesProdutosPedido();
        calcularTotal();
    });
    atualizarBotoesRemover();
    validarQuantidadesProdutosPedido();
    calcularTotal();
}

function removerProduto(index) {
    const item = document.getElementById(`produto-${index}`);
    if (item) {
        item.remove();
        atualizarBotoesRemover();
        calcularTotal();
    }
}

function atualizarBotoesRemover() {
    const itens = document.querySelectorAll('.produto-item');
    itens.forEach((item) => {
        const botao = item.querySelector('.btn-remover');
        if (botao) {
            botao.style.display = itens.length > 1 ? 'flex' : 'none';
        }
    });
}

function calcularTotal() {
    let total = 0;

    document.querySelectorAll('.produto-item').forEach((item) => {
        const produtoId = item.querySelector('.produto-select').value;
        const quantidade = Number(item.querySelector('.produto-quantidade').value || 0);

        if (produtoId && quantidade > 0) {
            const produto = produtos.find((entry) => entry.id === Number(produtoId));
            if (produto) {
                total += produto.preco * quantidade;
            }
        }
    });

    document.getElementById('resumo-pedido').textContent = `Total: R$ ${total.toFixed(2)}`;
    return total;
}

async function salvarPedido(event) {
    event.preventDefault();

    const clienteId = document.getElementById('cliente-id').value;
    if (!clienteId) {
        mostrarErro('Selecione um cliente', document.getElementById('mensagem'));
        return;
    }

    const produtosPedido = [];
    let quantidadeInvalida = false;
    document.querySelectorAll('.produto-item').forEach((item) => {
        const produtoId = item.querySelector('.produto-select').value;
        const quantidade = Number(item.querySelector('.produto-quantidade').value || 0);
        const estoqueDisponivel = obterEstoqueDisponivelProdutoPedido(produtoId, item.querySelector('.produto-select'));

        if (produtoId && quantidade > estoqueDisponivel) {
            quantidadeInvalida = true;
        }

        if (produtoId && quantidade > 0) {
            produtosPedido.push({
                produtoId: Number(produtoId),
                quantidade
            });
        }
    });

    if (produtosPedido.length === 0) {
        mostrarErro('Adicione pelo menos um produto', document.getElementById('mensagem'));
        return;
    }

    if (quantidadeInvalida) {
        mostrarErro('A quantidade informada ultrapassa o estoque disponível', document.getElementById('mensagem'));
        return;
    }

    const payload = {
        clienteId: Number(clienteId),
        data: document.getElementById('data-pedido').value,
        hora: document.getElementById('hora-pedido').value,
        observacoes: document.getElementById('observacoes').value.trim(),
        status: pedidoEditando ? document.getElementById('status-pedido').value : 'pendente',
        produtos: produtosPedido
    };

    try {
        if (pedidoEditando) {
            await apiFetch(`/pedidos/${pedidoEditando.id}`, {
                method: 'PUT',
                body: JSON.stringify(payload)
            });
            mostrarSucesso('Pedido atualizado com sucesso!', document.getElementById('mensagem'));
        } else {
            await apiFetch('/pedidos', {
                method: 'POST',
                body: JSON.stringify(payload)
            });
            mostrarSucesso('Pedido criado com sucesso!', document.getElementById('mensagem'));
        }

        fecharModalPedido();
        await carregarPedidos();
        aplicarFiltros();
    } catch (erro) {
        console.error('Erro ao salvar pedido:', erro);
        mostrarErro(erro.message || 'Não foi possível salvar o pedido', document.getElementById('mensagem'));
    }
}

function verDetalhesPedido(id) {
    const pedido = pedidos.find((item) => item.id === id);
    if (!pedido) {
        return;
    }

    pedidoEditando = pedido;

    const produtosHtml = pedido.produtos.length > 0
        ? pedido.produtos.map((produto) => `<li>• ${produto.quantidade}x ${produto.nome} = R$ ${(produto.preco * produto.quantidade).toFixed(2)}</li>`).join('')
        : '<li>• Sem itens cadastrados</li>';

    const conteudo = `
        <div style="margin-bottom: 20px;">
            <p><strong>Pedido:</strong> #${pedido.id}</p>
            <p><strong>Data:</strong> ${formatarDataPedido(pedido.data)} ${pedido.hora ? 'às ' + pedido.hora : ''}</p>
            <p><strong>Status:</strong> <span class="badge-status ${obterClasseStatus(pedido.status)}">${obterTextoStatus(pedido.status)}</span></p>
        </div>
        <div style="margin-bottom: 20px; padding: 10px; background-color: #f8f9fa; border-radius: 5px;">
            <h4 style="margin-top: 0;">Cliente</h4>
            <p><strong>${pedido.clienteNome}</strong></p>
            <p>${pedido.endereco}</p>
            <p>${pedido.email || ''}</p>
        </div>
        <div style="margin-bottom: 20px;">
            <h4>Produtos</h4>
            <ul style="list-style: none; padding: 0;">${produtosHtml}</ul>
            <p style="font-weight: bold; text-align: right;">Total: R$ ${pedido.valorTotal.toFixed(2)}</p>
        </div>
        ${pedido.observacoes ? `
            <div style="margin-bottom: 20px; padding: 10px; background-color: #fff3cd; border-radius: 5px;">
                <strong>Observações:</strong>
                <p>${pedido.observacoes}</p>
            </div>
        ` : ''}
    `;

    document.getElementById('detalhes-conteudo').innerHTML = conteudo;
    document.getElementById('modal-detalhes').style.display = 'block';
}

function fecharModalDetalhes() {
    document.getElementById('modal-detalhes').style.display = 'none';
}

function abrirModalExcluir(id) {
    const pedido = pedidos.find((item) => item.id === id);
    if (!pedido) {
        return;
    }

    pedidoEditando = pedido;
    document.getElementById('mensagem-excluir').textContent = `Tem certeza que deseja excluir o pedido #${id} de ${pedido.clienteNome}?`;
    document.getElementById('modal-excluir').style.display = 'block';
}

function fecharModalExcluir() {
    document.getElementById('modal-excluir').style.display = 'none';
    pedidoEditando = null;
}

async function confirmarExclusao() {
    if (!pedidoEditando) {
        return;
    }

    try {
        await apiFetch(`/pedidos/${pedidoEditando.id}`, {
            method: 'DELETE'
        });

        mostrarSucesso('Pedido excluído com sucesso!', document.getElementById('mensagem'));
        fecharModalExcluir();
        await carregarPedidos();
        aplicarFiltros();
    } catch (erro) {
        console.error('Erro ao excluir pedido:', erro);
        mostrarErro(erro.message || 'Não foi possível excluir o pedido', document.getElementById('mensagem'));
    }
}

function obterClasseStatus(status) {
    switch (status) {
        case 'pendente':
            return 'status-pendente';
        case 'em-rota':
            return 'status-em-rota';
        case 'entregue':
            return 'status-entregue';
        case 'ausente':
            return 'status-ausente';
        case 'cancelado':
            return 'status-cancelado';
        default:
            return 'status-pendente';
    }
}

function obterTextoStatus(status) {
    switch (status) {
        case 'pendente':
            return '⏳ Pendente';
        case 'em-rota':
            return '🚚 Em Rota';
        case 'entregue':
            return '✅ Entregue';
        case 'ausente':
            return '👤 Ausente';
        case 'cancelado':
            return '❌ Cancelado';
        default:
            return status || '';
    }
}

function formatarDataPedido(dataISO) {
    if (!dataISO) {
        return '';
    }

    if (typeof formatarData === 'function') {
        return formatarData(dataISO);
    }

    const partes = dataISO.split('-');
    return partes.length === 3 ? `${partes[2]}/${partes[1]}/${partes[0]}` : dataISO;
}
