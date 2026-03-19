let clientes = [];
let clienteEditando = null;
let mapaCliente = null;
let marcadorCliente = null;

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
    document.getElementById('btn-novo-cliente').addEventListener('click', abrirModalNovoCliente);
    document.getElementById('btn-aplicar-filtros').addEventListener('click', aplicarFiltros);
    document.getElementById('btn-limpar-filtros').addEventListener('click', limparFiltros);
    document.getElementById('btn-cancelar-modal').addEventListener('click', fecharModalCliente);
    document.getElementById('btn-cancelar-excluir').addEventListener('click', fecharModalExcluir);
    document.getElementById('btn-confirmar-excluir').addEventListener('click', confirmarExclusao);
    document.getElementById('btn-buscar-coordenadas').addEventListener('click', buscarCoordenadasCliente);
    document.getElementById('form-cliente').addEventListener('submit', salvarCliente);
    document.getElementById('filtro-busca').addEventListener('input', aplicarFiltros);
    document.getElementById('filtro-coordenadas').addEventListener('change', aplicarFiltros);

    await carregarClientes();
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
            throw new Error('A API respondeu com HTML em vez de JSON. Verifique se o backend Node/Express está rodando em http://localhost:3000.');
        }

        throw new Error(dados.mensagem || 'Erro ao processar requisição');
    }

    return dados;
}

async function carregarClientes() {
    try {
        const dados = await apiFetch('/clientes', { method: 'GET' });
        clientes = dados.map(normalizarCliente);
        atualizarIndicadores(clientes);
        renderizarTabelaClientes(clientes);
    } catch (erro) {
        console.error('Erro ao carregar clientes:', erro);
        mostrarErro(erro.message || 'Não foi possível carregar os clientes', document.getElementById('mensagem'));
    }
}

function normalizarCliente(cliente) {
    return {
        id: Number(cliente.id),
        cpf: cliente.cpf || '',
        nome: cliente.nome || '',
        email: cliente.email || '',
        endereco: cliente.endereco || '',
        latitude: cliente.latitude !== null && cliente.latitude !== undefined ? Number(cliente.latitude) : null,
        longitude: cliente.longitude !== null && cliente.longitude !== undefined ? Number(cliente.longitude) : null
    };
}

function atualizarIndicadores(lista) {
    const geolocalizados = lista.filter(cliente => cliente.latitude !== null && cliente.longitude !== null).length;
    const comEmail = lista.filter(cliente => cliente.email).length;

    document.getElementById('total-clientes').textContent = lista.length;
    document.getElementById('clientes-geolocalizados').textContent = geolocalizados;
    document.getElementById('clientes-email').textContent = comEmail;
}

function renderizarTabelaClientes(lista) {
    const tbody = document.getElementById('corpo-tabela-clientes');
    const contador = document.getElementById('contador-lista');
    tbody.innerHTML = '';
    contador.textContent = lista.length + ' registro' + (lista.length === 1 ? '' : 's');

    if (lista.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding: 30px;">Nenhum cliente encontrado</td></tr>';
        return;
    }

    lista.forEach(cliente => {
        const coordenadas = cliente.latitude !== null && cliente.longitude !== null
            ? cliente.latitude.toFixed(5) + ', ' + cliente.longitude.toFixed(5)
            : 'Não informado';

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><strong>${cliente.nome}</strong></td>
            <td>${cliente.cpf}</td>
            <td>${cliente.email || '<span style="color:#777;">Sem e-mail</span>'}</td>
            <td>${cliente.endereco}</td>
            <td>${coordenadas}</td>
            <td class="acoes-tabela">
                <button class="botao botao-pequeno" onclick="abrirModalEditarCliente(${cliente.id})">Editar</button>
                <button class="botao-perigo botao-pequeno" onclick="abrirModalExcluir(${cliente.id})">Excluir</button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

function aplicarFiltros() {
    const termo = document.getElementById('filtro-busca').value.trim().toLowerCase();
    const coordenadas = document.getElementById('filtro-coordenadas').value;

    const filtrados = clientes.filter(cliente => {
        const bateTexto = !termo || [cliente.nome, cliente.cpf, cliente.email]
            .filter(Boolean)
            .some(valor => valor.toLowerCase().includes(termo));

        const possuiCoordenadas = cliente.latitude !== null && cliente.longitude !== null;
        const bateCoordenadas =
            !coordenadas ||
            (coordenadas === 'com' && possuiCoordenadas) ||
            (coordenadas === 'sem' && !possuiCoordenadas);

        return bateTexto && bateCoordenadas;
    });

    renderizarTabelaClientes(filtrados);
}

function limparFiltros() {
    document.getElementById('filtro-busca').value = '';
    document.getElementById('filtro-coordenadas').value = '';
    renderizarTabelaClientes(clientes);
}

function abrirModalNovoCliente() {
    clienteEditando = null;
    document.getElementById('titulo-modal-cliente').textContent = 'Novo cliente';
    document.getElementById('cliente-id').value = '';
    document.getElementById('cliente-nome').value = '';
    document.getElementById('cliente-cpf').value = '';
    document.getElementById('cliente-email').value = '';
    document.getElementById('cliente-endereco').value = '';
    document.getElementById('cliente-cep').value = '';
    document.getElementById('cliente-cidade').value = 'Capivari';
    document.getElementById('cliente-uf').value = 'SP';
    document.getElementById('cliente-latitude').value = '';
    document.getElementById('cliente-longitude').value = '';
    atualizarStatusGeocodificacao('Use endereço, cidade e CEP para melhorar a localização.');
    document.getElementById('modal-cliente').style.display = 'block';
    inicializarMapaCliente();
}

function abrirModalEditarCliente(id) {
    const cliente = clientes.find(item => item.id === id);
    if (!cliente) {
        return;
    }

    clienteEditando = cliente;
    document.getElementById('titulo-modal-cliente').textContent = 'Editar cliente';
    document.getElementById('cliente-id').value = cliente.id;
    document.getElementById('cliente-nome').value = cliente.nome;
    document.getElementById('cliente-cpf').value = cliente.cpf;
    document.getElementById('cliente-email').value = cliente.email || '';
    document.getElementById('cliente-endereco').value = cliente.endereco;
    document.getElementById('cliente-cep').value = '';
    document.getElementById('cliente-cidade').value = 'Capivari';
    document.getElementById('cliente-uf').value = 'SP';
    document.getElementById('cliente-latitude').value = cliente.latitude !== null ? cliente.latitude : '';
    document.getElementById('cliente-longitude').value = cliente.longitude !== null ? cliente.longitude : '';
    atualizarStatusGeocodificacao('Você pode buscar novamente a posição pelo endereço.');
    document.getElementById('modal-cliente').style.display = 'block';
    inicializarMapaCliente(cliente.latitude, cliente.longitude, cliente.nome);
}

function fecharModalCliente() {
    document.getElementById('modal-cliente').style.display = 'none';
    clienteEditando = null;
}

function inicializarMapaCliente(latitude, longitude, titulo = 'Localização do cliente') {
    setTimeout(function () {
        const coordenadas = latitude !== null && latitude !== undefined && longitude !== null && longitude !== undefined
            ? [Number(latitude), Number(longitude)]
            : CONFIG.DISTRIBUIDORA.COORDENADAS;

        if (!mapaCliente) {
            mapaCliente = inicializarMapa('mapa-cliente', coordenadas);
        } else {
            mapaCliente.setView(coordenadas, latitude ? 16 : 13);
            mapaCliente.invalidateSize();
        }

        if (marcadorCliente) {
            mapaCliente.removeLayer(marcadorCliente);
            marcadorCliente = null;
        }

        if (latitude !== null && latitude !== undefined && longitude !== null && longitude !== undefined) {
            marcadorCliente = adicionarMarcador(mapaCliente, coordenadas, titulo, 'azul');
        }
    }, 60);
}

function atualizarStatusGeocodificacao(texto) {
    document.getElementById('status-geocodificacao').textContent = texto;
}

async function buscarCoordenadasCliente() {
    const endereco = document.getElementById('cliente-endereco').value.trim();
    const cidade = document.getElementById('cliente-cidade').value.trim();
    const cep = document.getElementById('cliente-cep').value.trim();
    const estado = document.getElementById('cliente-uf').value.trim().toUpperCase();

    if (!endereco) {
        mostrarErro('Preencha ao menos o endereço antes de buscar no mapa', document.getElementById('mensagem'));
        return;
    }

    atualizarStatusGeocodificacao('Buscando coordenadas...');

    try {
        const resultado = await geocodificarEndereco({
            endereco: endereco,
            cidade: cidade,
            cep: cep,
            estado: estado
        });

        if (!resultado) {
            atualizarStatusGeocodificacao('Endereço não encontrado. Tente informar cidade ou CEP.');
            mostrarErro('Não foi possível localizar esse endereço no mapa', document.getElementById('mensagem'));
            return;
        }

        document.getElementById('cliente-latitude').value = resultado.latitude.toFixed(7);
        document.getElementById('cliente-longitude').value = resultado.longitude.toFixed(7);
        atualizarStatusGeocodificacao(resultado.enderecoFormatado);
        inicializarMapaCliente(resultado.latitude, resultado.longitude, resultado.enderecoFormatado);
    } catch (erro) {
        console.error('Erro ao buscar coordenadas:', erro);
        atualizarStatusGeocodificacao('Falha ao consultar o mapa. Verifique a conexão e tente novamente.');
        mostrarErro('Não foi possível consultar o mapa neste momento', document.getElementById('mensagem'));
    }
}

async function salvarCliente(event) {
    event.preventDefault();

    const payload = {
        nome: document.getElementById('cliente-nome').value.trim(),
        cpf: document.getElementById('cliente-cpf').value.trim(),
        email: document.getElementById('cliente-email').value.trim(),
        endereco: document.getElementById('cliente-endereco').value.trim(),
        latitude: document.getElementById('cliente-latitude').value,
        longitude: document.getElementById('cliente-longitude').value
    };

    if (!payload.nome || !payload.cpf || !payload.endereco) {
        mostrarErro('Nome, CPF e endereço são obrigatórios', document.getElementById('mensagem'));
        return;
    }

    try {
        if (clienteEditando) {
            await apiFetch('/clientes/' + clienteEditando.id, {
                method: 'PUT',
                body: JSON.stringify(payload)
            });
            mostrarSucesso('Cliente atualizado com sucesso!', document.getElementById('mensagem'));
        } else {
            await apiFetch('/clientes', {
                method: 'POST',
                body: JSON.stringify(payload)
            });
            mostrarSucesso('Cliente criado com sucesso!', document.getElementById('mensagem'));
        }

        fecharModalCliente();
        await carregarClientes();
        aplicarFiltros();
    } catch (erro) {
        console.error('Erro ao salvar cliente:', erro);
        mostrarErro(erro.message || 'Não foi possível salvar o cliente', document.getElementById('mensagem'));
    }
}

function abrirModalExcluir(id) {
    const cliente = clientes.find(item => item.id === id);
    if (!cliente) {
        return;
    }

    clienteEditando = cliente;
    document.getElementById('mensagem-excluir').textContent =
        'Tem certeza que deseja excluir o cliente ' + cliente.nome + '?';
    document.getElementById('modal-excluir').style.display = 'block';
}

function fecharModalExcluir() {
    document.getElementById('modal-excluir').style.display = 'none';
    clienteEditando = null;
}

async function confirmarExclusao() {
    if (!clienteEditando) {
        return;
    }

    try {
        await apiFetch('/clientes/' + clienteEditando.id, {
            method: 'DELETE'
        });

        mostrarSucesso('Cliente excluído com sucesso!', document.getElementById('mensagem'));
        fecharModalExcluir();
        await carregarClientes();
        aplicarFiltros();
    } catch (erro) {
        console.error('Erro ao excluir cliente:', erro);
        mostrarErro(erro.message || 'Não foi possível excluir o cliente', document.getElementById('mensagem'));
    }
}
