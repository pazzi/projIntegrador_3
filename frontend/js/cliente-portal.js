let perfilCliente = null;
let produtosCliente = [];
let pedidosCliente = [];
let contadorItensCliente = 0;

document.addEventListener('DOMContentLoaded', async function () {
    const usuario = sessionStorage.getItem('usuarioLogado');
    const tipo = sessionStorage.getItem('tipoUsuario');
    const nomeUsuario = sessionStorage.getItem('nomeUsuario');

    if (!usuario) {
        window.location.href = 'login.html';
        return;
    }

    if (tipo !== 'outros') {
        if (tipo === 'admin') {
            window.location.href = 'index.html';
        } else {
            window.location.href = 'entregador.html';
        }
        return;
    }

    document.getElementById('nome-usuario').textContent = 'Olá, ' + (nomeUsuario || usuario);
    document.getElementById('btn-logout').addEventListener('click', fazerLogout);
    document.getElementById('btn-adicionar-produto').addEventListener('click', function () {
        adicionarProdutoCliente();
    });
    document.getElementById('form-pedido-cliente').addEventListener('submit', salvarPedidoCliente);

    definirDataHoraPadraoCliente();
    preencherCardsPerfilCliente({
        nome: nomeUsuario || usuario,
        endereco: '-'
    });
    await Promise.all([carregarPerfilCliente(), carregarProdutosCliente()]);
    adicionarProdutoCliente();
    await carregarPedidosCliente();
});

async function apiCliente(path, options = {}) {
    const resposta = await fetch(CONFIG.API_URL + path, {
        ...options,
        headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + sessionStorage.getItem('token'),
            ...(options.headers || {})
        }
    });

    const contentType = resposta.headers.get('content-type') || '';
    const corpo = await resposta.text();
    let dados = null;

    if (contentType.includes('application/json')) {
        dados = corpo ? JSON.parse(corpo) : null;
    }

    if (!resposta.ok || (dados && dados.sucesso === false)) {
        if (resposta.status === 401) {
            throw new Error('Sua sessao expirou. Entre novamente para continuar.');
        }

        if (!contentType.includes('application/json')) {
            throw new Error('A API respondeu em formato inesperado. Verifique se o backend está rodando na mesma porta do frontend.');
        }

        throw new Error((dados && dados.mensagem) || 'Erro ao processar requisição');
    }

    return dados;
}

async function carregarPerfilCliente() {
    try {
        perfilCliente = await apiCliente('/cliente/perfil', { method: 'GET' });
        preencherCardsPerfilCliente(perfilCliente);
        document.getElementById('nome-usuario').textContent = 'Olá, ' + (perfilCliente.nome || sessionStorage.getItem('nomeUsuario') || sessionStorage.getItem('usuarioLogado'));
    } catch (erro) {
        console.error('Erro ao carregar perfil do cliente:', erro);
        if (erro.message && erro.message.includes('sessao expirou')) {
            mostrarErro(erro.message, document.getElementById('mensagem'));
            setTimeout(() => fazerLogout(), 1200);
            return;
        }
        mostrarErro(erro.message || 'Não foi possível carregar o perfil do cliente', document.getElementById('mensagem'));
    }
}

function preencherCardsPerfilCliente(perfil) {
    document.getElementById('cliente-nome-card').textContent = perfil.nome || '-';
    document.getElementById('cliente-endereco-card').textContent = perfil.endereco || '-';
}

async function carregarProdutosCliente() {
    try {
        const dados = await apiCliente('/produtos', { method: 'GET' });
        produtosCliente = normalizarProdutosCliente(dados);
        atualizarOpcoesProdutosCliente();
    } catch (erro) {
        console.error('Erro ao carregar produtos do cliente:', erro);
        if (erro.message && erro.message.includes('sessao expirou')) {
            mostrarErro(erro.message, document.getElementById('mensagem'));
            setTimeout(() => fazerLogout(), 1200);
            return;
        }
        mostrarErro(erro.message || 'Não foi possível carregar os produtos', document.getElementById('mensagem'));
        atualizarOpcoesProdutosCliente();
    }
}

function normalizarProdutosCliente(listaProdutos) {
    return Array.isArray(listaProdutos)
        ? listaProdutos.map((produto) => ({
            id: Number(produto.id),
            nome: produto.nome,
            valor: Number(produto.valor || 0)
        }))
        : [];
}

function atualizarOpcoesProdutosCliente() {
    document.querySelectorAll('#produtos-container-cliente .produto-select').forEach((select) => {
        const valorAtual = select.value;
        preencherOpcoesSelectProdutoCliente(select);
        if (valorAtual) {
            select.value = valorAtual;
        }
    });

    document.getElementById('btn-adicionar-produto').disabled = produtosCliente.length === 0;
}

async function carregarPedidosCliente() {
    try {
        pedidosCliente = await apiCliente('/cliente/pedidos', { method: 'GET' });
        document.getElementById('cliente-total-pedidos').textContent = pedidosCliente.length;
        renderizarTabelaPedidosCliente();
    } catch (erro) {
        console.error('Erro ao carregar pedidos do cliente:', erro);
        if (erro.message && erro.message.includes('sessao expirou')) {
            mostrarErro(erro.message, document.getElementById('mensagem'));
            setTimeout(() => fazerLogout(), 1200);
            return;
        }
        mostrarErro(erro.message || 'Não foi possível carregar os pedidos', document.getElementById('mensagem'));
    }
}

function renderizarTabelaPedidosCliente() {
    const tbody = document.getElementById('corpo-tabela-pedidos-cliente');
    tbody.innerHTML = '';

    if (pedidosCliente.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding: 30px;">Nenhum pedido encontrado</td></tr>';
        return;
    }

    pedidosCliente.forEach((pedido) => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>#${pedido.id}</td>
            <td>${formatarData(pedido.data)}<br><small>${pedido.hora || ''}</small></td>
            <td>${(pedido.produtos || []).map((produto) => `${produto.quantidade}x ${produto.nome}`).join('<br>')}</td>
            <td>R$ ${Number(pedido.valorTotal || 0).toFixed(2)}</td>
            <td>${pedido.status}</td>
        `;
        tbody.appendChild(tr);
    });
}

function definirDataHoraPadraoCliente() {
    const hoje = new Date().toISOString().split('T')[0];
    const agora = new Date();
    document.getElementById('data-pedido').value = hoje;
    document.getElementById('hora-pedido').value = `${String(agora.getHours()).padStart(2, '0')}:${String(agora.getMinutes()).padStart(2, '0')}`;
}

function adicionarProdutoCliente(produtoId = '', quantidade = 1) {
    const container = document.getElementById('produtos-container-cliente');
    const index = contadorItensCliente++;
    const div = document.createElement('div');
    div.className = 'produto-item';
    div.id = `produto-cliente-${index}`;

    div.innerHTML = `
        <select class="produto-select" required>
            <option value="">Selecione...</option>
        </select>
        <input type="number" class="produto-quantidade" min="1" value="${quantidade}" required />
        <button type="button" class="btn-remover" onclick="removerProdutoCliente(${index})">✕</button>
    `;

    container.appendChild(div);

    const select = div.querySelector('.produto-select');
    preencherOpcoesSelectProdutoCliente(select);

    if (produtoId) {
        select.value = String(produtoId);
    }

    select.addEventListener('change', calcularTotalCliente);
    div.querySelector('.produto-quantidade').addEventListener('input', calcularTotalCliente);
    atualizarBotoesRemoverCliente();
    calcularTotalCliente();
}

function preencherOpcoesSelectProdutoCliente(select) {
    select.innerHTML = '<option value="">Selecione...</option>';

    if (produtosCliente.length === 0) {
        const option = document.createElement('option');
        option.value = '';
        option.textContent = 'Nenhum produto disponível';
        select.appendChild(option);
        return;
    }

    produtosCliente.forEach((produto) => {
        const option = document.createElement('option');
        option.value = produto.id;
        option.textContent = `${produto.nome} - R$ ${produto.valor.toFixed(2)}`;
        select.appendChild(option);
    });
}

function removerProdutoCliente(index) {
    const item = document.getElementById(`produto-cliente-${index}`);
    if (item) {
        item.remove();
        atualizarBotoesRemoverCliente();
        calcularTotalCliente();
    }
}

function atualizarBotoesRemoverCliente() {
    const itens = document.querySelectorAll('#produtos-container-cliente .produto-item');
    itens.forEach((item) => {
        const botao = item.querySelector('.btn-remover');
        botao.style.display = itens.length > 1 ? 'flex' : 'none';
    });
}

function calcularTotalCliente() {
    let total = 0;

    document.querySelectorAll('#produtos-container-cliente .produto-item').forEach((item) => {
        const produtoId = Number(item.querySelector('.produto-select').value);
        const quantidade = Number(item.querySelector('.produto-quantidade').value || 0);
        const produto = produtosCliente.find((entry) => entry.id === produtoId);
        if (produto && quantidade > 0) {
            total += produto.valor * quantidade;
        }
    });

    document.getElementById('resumo-pedido').textContent = `Total: R$ ${total.toFixed(2)}`;
}

async function salvarPedidoCliente(event) {
    event.preventDefault();

    const produtos = [];
    document.querySelectorAll('#produtos-container-cliente .produto-item').forEach((item) => {
        const produtoId = Number(item.querySelector('.produto-select').value);
        const quantidade = Number(item.querySelector('.produto-quantidade').value || 0);

        if (produtoId && quantidade > 0) {
            produtos.push({ produtoId, quantidade });
        }
    });

    if (produtos.length === 0) {
        mostrarErro('Selecione ao menos um produto', document.getElementById('mensagem'));
        return;
    }

    try {
        await apiCliente('/cliente/pedidos', {
            method: 'POST',
            body: JSON.stringify({
                clienteId: perfilCliente.id,
                data: document.getElementById('data-pedido').value,
                hora: document.getElementById('hora-pedido').value,
                observacoes: document.getElementById('observacoes').value.trim(),
                produtos
            })
        });

        mostrarSucesso('Pedido enviado com sucesso!', document.getElementById('mensagem'));
        document.getElementById('produtos-container-cliente').innerHTML = '';
        contadorItensCliente = 0;
        adicionarProdutoCliente();
        document.getElementById('observacoes').value = '';
        calcularTotalCliente();
        await carregarPedidosCliente();
    } catch (erro) {
        console.error('Erro ao criar pedido do cliente:', erro);
        mostrarErro(erro.message || 'Não foi possível criar o pedido', document.getElementById('mensagem'));
    }
}
