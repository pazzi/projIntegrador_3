let produtos = [];
let produtoEditando = null;

document.addEventListener('DOMContentLoaded', async function () {
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
    document.getElementById('btn-novo-produto').addEventListener('click', abrirModalNovoProduto);
    document.getElementById('btn-aplicar-filtros').addEventListener('click', aplicarFiltros);
    document.getElementById('btn-limpar-filtros').addEventListener('click', limparFiltros);
    document.getElementById('btn-cancelar-modal').addEventListener('click', fecharModalProduto);
    document.getElementById('btn-cancelar-excluir').addEventListener('click', fecharModalExcluir);
    document.getElementById('btn-confirmar-excluir').addEventListener('click', confirmarExclusao);
    document.getElementById('form-produto').addEventListener('submit', salvarProduto);
    document.getElementById('filtro-produto').addEventListener('input', aplicarFiltros);
    document.getElementById('filtro-estoque').addEventListener('change', aplicarFiltros);

    await carregarProdutos();
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

async function carregarProdutos() {
    try {
        const dados = await apiFetch('/produtos', { method: 'GET' });
        produtos = dados.map(normalizarProduto);
        atualizarIndicadores(produtos);
        renderizarTabelaProdutos(produtos);
    } catch (erro) {
        console.error('Erro ao carregar produtos:', erro);
        mostrarErro(erro.message || 'Não foi possível carregar os produtos', document.getElementById('mensagem'));
    }
}

function normalizarProduto(produto) {
    return {
        id: Number(produto.id),
        nome: produto.nome || '',
        descricao: produto.descricao || '',
        valor: Number(produto.valor || 0),
        estoque: Number(produto.estoque || 0),
        data: produto.data ? String(produto.data).slice(0, 10) : ''
    };
}

function atualizarIndicadores(lista) {
    const totalEstoque = lista.reduce((total, produto) => total + produto.estoque, 0);
    const baixoEstoque = lista.filter((produto) => produto.estoque > 0 && produto.estoque <= 10).length;

    document.getElementById('total-produtos').textContent = lista.length;
    document.getElementById('total-estoque').textContent = totalEstoque;
    document.getElementById('produtos-baixo-estoque').textContent = baixoEstoque;
}

function renderizarTabelaProdutos(lista) {
    const tbody = document.getElementById('corpo-tabela-produtos');
    const contador = document.getElementById('contador-lista');
    tbody.innerHTML = '';
    contador.textContent = lista.length + ' registro' + (lista.length === 1 ? '' : 's');

    if (lista.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding: 30px;">Nenhum produto encontrado</td></tr>';
        return;
    }

    lista.forEach((produto) => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><strong>${produto.nome}</strong></td>
            <td>${produto.descricao || '<span style="color:#777;">Sem descrição</span>'}</td>
            <td>R$ ${produto.valor.toFixed(2)}</td>
            <td>${renderizarStatusEstoque(produto.estoque)}</td>
            <td>${formatarData(produto.data)}</td>
            <td class="acoes-tabela">
                <button class="botao botao-pequeno" onclick="abrirModalEditarProduto(${produto.id})">Editar</button>
                <button class="botao-perigo botao-pequeno" onclick="abrirModalExcluir(${produto.id})">Excluir</button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

function renderizarStatusEstoque(estoque) {
    if (estoque === 0) {
        return '<strong style="color:#dc3545;">Sem estoque</strong>';
    }

    if (estoque <= 10) {
        return `<strong style="color:#fd7e14;">${estoque} un.</strong>`;
    }

    return `<strong style="color:#198754;">${estoque} un.</strong>`;
}

function aplicarFiltros() {
    const termo = document.getElementById('filtro-produto').value.trim().toLowerCase();
    const estoque = document.getElementById('filtro-estoque').value;

    const filtrados = produtos.filter((produto) => {
        const bateTexto = !termo || [produto.nome, produto.descricao]
            .filter(Boolean)
            .some((valor) => valor.toLowerCase().includes(termo));

        const bateEstoque =
            !estoque ||
            (estoque === 'disponivel' && produto.estoque > 10) ||
            (estoque === 'baixo' && produto.estoque > 0 && produto.estoque <= 10) ||
            (estoque === 'zerado' && produto.estoque === 0);

        return bateTexto && bateEstoque;
    });

    renderizarTabelaProdutos(filtrados);
}

function limparFiltros() {
    document.getElementById('filtro-produto').value = '';
    document.getElementById('filtro-estoque').value = '';
    renderizarTabelaProdutos(produtos);
}

function abrirModalNovoProduto() {
    produtoEditando = null;
    document.getElementById('titulo-modal-produto').textContent = 'Novo produto';
    document.getElementById('produto-id').value = '';
    document.getElementById('produto-nome').value = '';
    document.getElementById('produto-descricao').value = '';
    document.getElementById('produto-valor').value = '';
    document.getElementById('produto-estoque').value = 0;
    document.getElementById('produto-data').value = new Date().toISOString().split('T')[0];
    document.getElementById('modal-produto').style.display = 'block';
}

function abrirModalEditarProduto(id) {
    const produto = produtos.find((item) => item.id === id);
    if (!produto) {
        return;
    }

    produtoEditando = produto;
    document.getElementById('titulo-modal-produto').textContent = 'Editar produto';
    document.getElementById('produto-id').value = produto.id;
    document.getElementById('produto-nome').value = produto.nome;
    document.getElementById('produto-descricao').value = produto.descricao || '';
    document.getElementById('produto-valor').value = produto.valor.toFixed(2);
    document.getElementById('produto-estoque').value = produto.estoque;
    document.getElementById('produto-data').value = produto.data;
    document.getElementById('modal-produto').style.display = 'block';
}

function fecharModalProduto() {
    document.getElementById('modal-produto').style.display = 'none';
    produtoEditando = null;
}

async function salvarProduto(event) {
    event.preventDefault();

    const payload = {
        nome: document.getElementById('produto-nome').value.trim(),
        descricao: document.getElementById('produto-descricao').value.trim(),
        valor: Number(document.getElementById('produto-valor').value || 0),
        estoque: Number(document.getElementById('produto-estoque').value || 0),
        data: document.getElementById('produto-data').value
    };

    if (!payload.nome || payload.valor <= 0 || payload.estoque < 0 || !payload.data) {
        mostrarErro('Nome, valor, estoque e data são obrigatórios', document.getElementById('mensagem'));
        return;
    }

    try {
        if (produtoEditando) {
            await apiFetch('/produtos/' + produtoEditando.id, {
                method: 'PUT',
                body: JSON.stringify(payload)
            });
            mostrarSucesso('Produto atualizado com sucesso!', document.getElementById('mensagem'));
        } else {
            await apiFetch('/produtos', {
                method: 'POST',
                body: JSON.stringify(payload)
            });
            mostrarSucesso('Produto criado com sucesso!', document.getElementById('mensagem'));
        }

        fecharModalProduto();
        await carregarProdutos();
        aplicarFiltros();
    } catch (erro) {
        console.error('Erro ao salvar produto:', erro);
        mostrarErro(erro.message || 'Não foi possível salvar o produto', document.getElementById('mensagem'));
    }
}

function abrirModalExcluir(id) {
    const produto = produtos.find((item) => item.id === id);
    if (!produto) {
        return;
    }

    produtoEditando = produto;
    document.getElementById('mensagem-excluir').textContent =
        'Tem certeza que deseja excluir o produto ' + produto.nome + '?';
    document.getElementById('modal-excluir').style.display = 'block';
}

function fecharModalExcluir() {
    document.getElementById('modal-excluir').style.display = 'none';
    produtoEditando = null;
}

async function confirmarExclusao() {
    if (!produtoEditando) {
        return;
    }

    try {
        await apiFetch('/produtos/' + produtoEditando.id, { method: 'DELETE' });
        mostrarSucesso('Produto excluído com sucesso!', document.getElementById('mensagem'));
        fecharModalExcluir();
        await carregarProdutos();
        aplicarFiltros();
    } catch (erro) {
        console.error('Erro ao excluir produto:', erro);
        mostrarErro(erro.message || 'Não foi possível excluir o produto', document.getElementById('mensagem'));
    }
}
