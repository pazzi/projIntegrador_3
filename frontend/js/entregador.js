// Variáveis globais
let entregasHoje = [];
let mapaEntregador = null;
let rotaAtual = null;
let intervaloLocalizacao = null;

async function apiEntregador(path, options = {}) {
    const resposta = await fetch(CONFIG.API_URL + path, {
        ...options,
        headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + sessionStorage.getItem('token'),
            ...(options.headers || {})
        }
    });

    const dados = await resposta.json();

    if (!resposta.ok || (dados && dados.sucesso === false)) {
        throw new Error((dados && dados.mensagem) || 'Erro ao processar requisição');
    }

    return dados;
}

// Executa quando a página carrega
document.addEventListener('DOMContentLoaded', function() {
    
    // Verificar login
    const usuario = sessionStorage.getItem('usuarioLogado');
    if (!usuario) {
        window.location.href = 'login.html';
        return;
    }
    
    // Verificar se é entregador
    const tipo = sessionStorage.getItem('tipoUsuario');
    if (tipo !== 'entregador') {
        window.location.href = 'index.html';  // Redireciona admin
        return;
    }
    
    // Mostrar nome
    document.getElementById('nome-entregador').textContent = 'Olá, ' + usuario;
    
    // Configurar botões
    document.getElementById('btn-logout').addEventListener('click', fazerLogout);
    document.getElementById('btn-modo-lista').addEventListener('click', mostrarModoLista);
    document.getElementById('btn-modo-mapa').addEventListener('click', mostrarModoMapa);
    document.getElementById('btn-iniciar-rota').addEventListener('click', iniciarRota);
    
    // Carregar entregas
    carregarEntregas();
    
    // Configurar comandos de voz (se suportado)
    configurarComandosVoz();
    
    // Iniciar envio periódico da localização
    iniciarEnvioLocalizacao();
});

// Alternar entre modos
function mostrarModoLista() {
    document.getElementById('modo-lista').style.display = 'block';
    document.getElementById('modo-mapa').style.display = 'none';
    
    // Anunciar para leitores de tela
    anunciarVoz('Modo lista ativado. Mostrando lista de entregas.');
}

function mostrarModoMapa() {
    document.getElementById('modo-lista').style.display = 'none';
    document.getElementById('modo-mapa').style.display = 'block';
    
    // Inicializar mapa se necessário
    if (!mapaEntregador) {
        mapaEntregador = inicializarMapa('mapa-entregador');
    }
    
    // Desenhar rota se já tiver entregas
    if (entregasHoje.length > 0) {
        desenharRotaEntregador();
    }
    
    // Anunciar para leitores de tela
    anunciarVoz('Modo mapa ativado. Mostrando rota otimizada.');
}

// Carregar pedidos pendentes do entregador
async function carregarEntregas() {
    try {
        const dados = await apiEntregador('/entregas/pendentes', { method: 'GET' });
        entregasHoje = Array.isArray(dados) ? dados : [];

        if (entregasHoje.length === 0) {
            document.getElementById('lista-entregas').innerHTML = '<p>Nenhum pedido pendente encontrado. ☕</p>';
            return;
        }

        // Calcular rota otimizada
        const rotaOtimizada = otimizarRotaEntregas(entregasHoje);
        entregasHoje = rotaOtimizada;

        // Renderizar lista
        renderizarListaEntregas(rotaOtimizada);

        // Se estiver no modo mapa, desenhar rota
        if (document.getElementById('modo-mapa').style.display === 'block') {
            desenharRotaEntregador(rotaOtimizada);
        }
    } catch (erro) {
        console.error('Erro ao carregar entregas:', erro);
        mostrarErro(erro.message || 'Não foi possível carregar os pedidos pendentes', document.getElementById('mensagem'));
    }
}

// Otimizar rota (chama a API do backend ou usa algoritmo local)
function otimizarRotaEntregas(entregas) {
    // Verificar se todas têm coordenadas
    const todasTemCoordenadas = entregas.every(e => e.latitude && e.longitude);
    
    if (!todasTemCoordenadas) {
        // Se não tiver coordenadas, mantém ordem original
        return entregas;
    }
    
    // Converter para formato usado pelo otimizador
    const pontos = entregas.map(e => ({
        id: e.id,
        coordenadas: [e.latitude, e.longitude],
        dados: e
    }));
    
    // Ponto inicial (posição atual ou depósito)
    const pontoInicial = CONFIG.DISTRIBUIDORA.COORDENADAS; // Distribuidora
    
    // Otimizar
    const rotaOtimizada = otimizarRota(pontoInicial, pontos);
    
    // Retornar entregas na nova ordem
    return rotaOtimizada.map(p => p.dados);
}

// Renderizar lista de entregas (modo lista)
function renderizarListaEntregas(entregas) {
    const container = document.getElementById('lista-entregas');
    container.innerHTML = '';
    
    entregas.forEach((entrega, indice) => {
        const div = document.createElement('div');
        div.className = 'item-entrega';
        
        // Definir classe baseada no status
        let statusClass = '';
        let statusTexto = '';
        
        if (entrega.status === 'pendente') {
            statusClass = '';
            statusTexto = '⏳ Pendente';
        } else if (entrega.status === 'entregue') {
            statusClass = 'entregue';
            statusTexto = '✅ Entregue';
        } else if (entrega.status === 'ausente') {
            statusClass = 'ausente';
            statusTexto = '👤 Cliente ausente';
        }
        
        div.innerHTML = `
            <div class="entrega-header">
                <span class="indice">${indice + 1}º</span>
                <span class="status ${statusClass}">${statusTexto}</span>
            </div>
            <div class="endereco">${entrega.endereco}</div>
            <div class="cliente">${entrega.cliente}</div>
            <div class="produto">${entrega.produto} - ${entrega.quantidade}</div>
            <div class="observacao">${entrega.observacao || ''}</div>
            <div class="botoes-entrega">
                <button class="botao botao-sucesso botao-entregador" onclick="marcarEntregue(${entrega.id})">
                    ✅ Marcar como entregue
                </button>
                <button class="botao botao-perigo botao-entregador" onclick="clienteAusente(${entrega.id})">
                    👤 Cliente ausente
                </button>
            </div>
        `;
        
        container.appendChild(div);
    });
}

// Desenhar rota no mapa (modo mapa)
function desenharRotaEntregador(entregas = entregasHoje) {
    if (!mapaEntregador || entregas.length === 0) return;
    
    // Limpar rota anterior
    if (rotaAtual) {
        mapaEntregador.removeLayer(rotaAtual);
    }
    
    // Limpar marcadores anteriores
    mapaEntregador.eachLayer(layer => {
        if (layer instanceof L.Marker) {
            mapaEntregador.removeLayer(layer);
        }
    });
    
    // Filtrar entregas com coordenadas
    const entregasComCoordenadas = entregas.filter(e => e.latitude && e.longitude);
    
    if (entregasComCoordenadas.length === 0) {
        mostrarErro('Entregas sem coordenadas de localização', document.getElementById('mensagem'));
        return;
    }
    
    // Adicionar ponto de partida (depósito)
    adicionarMarcador(
        mapaEntregador, 
        CONFIG.DISTRIBUIDORA.COORDENADAS, 
        '🚚 Distribuidora',
        'azul'
    );
    
    // Adicionar marcadores das entregas
    const pontosRota = [CONFIG.DISTRIBUIDORA.COORDENADAS]; // Começa na distribuidora
    
    entregasComCoordenadas.forEach((entrega, i) => {
        const cor = entrega.status === 'entregue' ? 'verde' : 'vermelho';
        adicionarMarcador(
            mapaEntregador,
            [entrega.latitude, entrega.longitude],
            `${i+1}º - ${entrega.cliente}<br>${entrega.endereco || 'Endereco nao informado'}`,
            cor,
            { numeroEtiqueta: i + 1 }
        );
        pontosRota.push([entrega.latitude, entrega.longitude]);
    });
    
    // Desenhar linha da rota
    rotaAtual = L.polyline(pontosRota, {
        color: '#0066cc',
        weight: 4,
        opacity: 0.8
    }).addTo(mapaEntregador);
    
    // Ajustar zoom
    mapaEntregador.fitBounds(rotaAtual.getBounds());
}

// Marcar entrega como realizada
function marcarEntregue(id) {
    // Confirmar com modal
    if (!confirm('Confirmar que a entrega foi realizada?')) {
        return;
    }
    
    atualizarStatusEntrega(id, 'entregue');
}

// Marcar cliente como ausente
function clienteAusente(id) {
    if (!confirm('Cliente não estava presente? A entrega será marcada para outro momento.')) {
        return;
    }
    
    atualizarStatusEntrega(id, 'ausente');
}

// Atualizar status da entrega na API
function atualizarStatusEntrega(id, status) {
    fetch(CONFIG.API_URL + '/entregas/' + id + '/status', {
        method: 'PUT',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + sessionStorage.getItem('token')
        },
        body: JSON.stringify({ status: status })
    })
    .then(resposta => resposta.json())
    .then(dados => {
        if (dados.sucesso) {
            mostrarSucesso('Status atualizado!', document.getElementById('mensagem'));
            carregarEntregas(); // Recarregar lista
        } else {
            mostrarErro('Erro ao atualizar status', document.getElementById('mensagem'));
        }
    })
    .catch(erro => {
        console.error('Erro:', erro);
        mostrarErro('Erro ao atualizar status', document.getElementById('mensagem'));
    });
}

// Iniciar rota (começar a navegação)
function iniciarRota() {
    if (!mapaEntregador || entregasHoje.length === 0) return;
    
    anunciarVoz('Rota iniciada. Siga a ordem numerada no mapa.');
    
    // Destacar primeira entrega
    const primeiraEntrega = entregasHoje[0];
    if (primeiraEntrega && primeiraEntrega.latitude && primeiraEntrega.longitude) {
        // Criar rota do depósito até primeira entrega
        const rotaInicial = L.Routing.control({
            waypoints: [
                L.latLng(CONFIG.DISTRIBUIDORA.LATITUDE, CONFIG.DISTRIBUIDORA.LONGITUDE),  // Distribuidora
                L.latLng(primeiraEntrega.latitude, primeiraEntrega.longitude)
            ],
            router: L.Routing.osrmv1({
                serviceUrl: 'https://router.project-osrm.org/route/v1'
            })
        }).addTo(mapaEntregador);
    }
}

// Enviar localização atual para o servidor
function enviarLocalizacao() {
    obterLocalizacaoAtual()
        .then(posicao => {
            return fetch(CONFIG.API_URL + '/entregador/localizacao', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': 'Bearer ' + sessionStorage.getItem('token')
                },
                body: JSON.stringify({
                    latitude: posicao.latitude,
                    longitude: posicao.longitude,
                    timestamp: new Date().toISOString()
                })
            });
        })
        .then(resposta => resposta.json())
        .then(dados => {
            console.log('Localização enviada com sucesso');
        })
        .catch(erro => {
            console.error('Erro ao enviar localização:', erro);
        });
}

// Iniciar envio periódico de localização
function iniciarEnvioLocalizacao() {
    // Enviar imediatamente
    enviarLocalizacao();
    
    // Configurar envio a cada 30 segundos
    intervaloLocalizacao = setInterval(enviarLocalizacao, 30000);
}

// Configurar comandos de voz
function configurarComandosVoz() {
    // Verificar se o navegador suporta reconhecimento de voz
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
        console.log('Reconhecimento de voz não suportado');
        return;
    }
    
    // Criar reconhecedor
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SpeechRecognition();
    
    recognition.lang = 'pt-BR';
    recognition.continuous = false;
    recognition.interimResults = false;
    
    // Iniciar reconhecimento quando botão for pressionado (simplificado)
    document.addEventListener('keydown', (e) => {
        // Atalho: Ctrl + Espaço para comando de voz
        if (e.ctrlKey && e.code === 'Space') {
            e.preventDefault();
            recognition.start();
            anunciarVoz('Ouvindo...');
        }
    });
    
    // Processar comando
    recognition.onresult = (event) => {
        const comando = event.results[0][0].transcript.toLowerCase();
        console.log('Comando:', comando);
        
        if (comando.includes('próxima') || comando.includes('proxima')) {
            // Avançar para próxima entrega
            anunciarVoz('Indo para próxima entrega');
        } else if (comando.includes('entregue')) {
            // Marcar atual como entregue
            if (entregasHoje.length > 0) {
                marcarEntregue(entregasHoje[0].id);
            }
        } else if (comando.includes('ausente')) {
            if (entregasHoje.length > 0) {
                clienteAusente(entregasHoje[0].id);
            }
        } else {
            anunciarVoz('Comando não reconhecido');
        }
    };
    
    recognition.onerror = (event) => {
        console.log('Erro no reconhecimento de voz:', event.error);
    };
}

// Função para anunciar texto via leitores de tela
function anunciarVoz(texto) {
    const anuncio = document.getElementById('anuncio-voz');
    if (anuncio) {
        anuncio.textContent = texto;
    }
    
    // Usar SpeechSynthesis se disponível
    if ('speechSynthesis' in window) {
        const utterance = new SpeechSynthesisUtterance(texto);
        utterance.lang = 'pt-BR';
        window.speechSynthesis.speak(utterance);
    }
}

// Limpar ao sair da página
window.addEventListener('beforeunload', function() {
    if (intervaloLocalizacao) {
        clearInterval(intervaloLocalizacao);
    }
});
