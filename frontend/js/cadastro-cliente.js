let mapaCadastroCliente = null;
let marcadorCadastroCliente = null;

document.addEventListener('DOMContentLoaded', function () {
    document.getElementById('form-cadastro-cliente').addEventListener('submit', cadastrarCliente);
    document.getElementById('btn-buscar-coordenadas').addEventListener('click', buscarCoordenadasCadastro);
    inicializarMapaCadastro();
});

async function cadastrarCliente(event) {
    event.preventDefault();

    const payload = {
        usuario: document.getElementById('usuario').value.trim(),
        senha: document.getElementById('senha').value.trim(),
        nome: document.getElementById('nome').value.trim(),
        cpf: document.getElementById('cpf').value.trim(),
        email: document.getElementById('email').value.trim(),
        endereco: document.getElementById('endereco').value.trim(),
        latitude: document.getElementById('latitude').value,
        longitude: document.getElementById('longitude').value
    };

    try {
        const resposta = await fetch(CONFIG.API_URL + '/clientes/cadastro', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });

        const dados = await resposta.json();
        if (!resposta.ok || !dados.sucesso) {
            throw new Error(dados.mensagem || 'Erro ao cadastrar cliente');
        }

        mostrarSucesso('Cadastro realizado. Faça login para continuar.', document.getElementById('mensagem'));
        setTimeout(function () {
            window.location.href = 'login.html';
        }, 1500);
    } catch (erro) {
        console.error('Erro no cadastro do cliente:', erro);
        mostrarErro(erro.message || 'Não foi possível concluir o cadastro', document.getElementById('mensagem'));
    }
}

function inicializarMapaCadastro(latitude, longitude, titulo = 'Localização do cliente') {
    setTimeout(function () {
        const coordenadas = latitude && longitude
            ? [Number(latitude), Number(longitude)]
            : CONFIG.DISTRIBUIDORA.COORDENADAS;

        if (!mapaCadastroCliente) {
            mapaCadastroCliente = inicializarMapa('mapa-cadastro-cliente', coordenadas);
        } else {
            mapaCadastroCliente.setView(coordenadas, latitude ? 16 : 13);
            mapaCadastroCliente.invalidateSize();
        }

        if (marcadorCadastroCliente) {
            mapaCadastroCliente.removeLayer(marcadorCadastroCliente);
            marcadorCadastroCliente = null;
        }

        if (latitude && longitude) {
            marcadorCadastroCliente = adicionarMarcador(mapaCadastroCliente, coordenadas, titulo, 'azul');
        }
    }, 60);
}

async function buscarCoordenadasCadastro() {
    const endereco = document.getElementById('endereco').value.trim();
    const cidade = document.getElementById('cidade').value.trim();
    const cep = document.getElementById('cep').value.trim();
    const estado = document.getElementById('uf').value.trim();

    if (!endereco) {
        mostrarErro('Informe o endereço antes de buscar no mapa', document.getElementById('mensagem'));
        return;
    }

    document.getElementById('status-geocodificacao').textContent = 'Buscando coordenadas...';

    try {
        const resultado = await geocodificarEndereco({
            endereco,
            cidade,
            cep,
            estado
        });

        if (!resultado) {
            throw new Error('Endereço não encontrado');
        }

        document.getElementById('latitude').value = resultado.latitude.toFixed(7);
        document.getElementById('longitude').value = resultado.longitude.toFixed(7);
        document.getElementById('status-geocodificacao').textContent = resultado.enderecoFormatado;
        inicializarMapaCadastro(resultado.latitude, resultado.longitude, resultado.enderecoFormatado);
    } catch (erro) {
        console.error('Erro ao geocodificar cadastro:', erro);
        document.getElementById('status-geocodificacao').textContent = 'Não foi possível localizar esse endereço.';
        mostrarErro(erro.message || 'Erro ao buscar coordenadas', document.getElementById('mensagem'));
    }
}
