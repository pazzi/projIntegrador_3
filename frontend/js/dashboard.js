let mapaDashboard = null;
let camadaRotaDashboard = null;
let marcadoresDashboard = [];

// Executa quando a página carrega
document.addEventListener('DOMContentLoaded', function() {
    
    // Verificar se usuário está logado
    const usuario = sessionStorage.getItem('usuarioLogado');
    if (!usuario) {
        window.location.href = 'login.html';
        return;
    }
    
    // Mostrar nome do usuário
    document.getElementById('nome-usuario').textContent = 'Olá, ' + usuario;
    
    // Configurar botão de logout
    document.getElementById('btn-logout').addEventListener('click', fazerLogout);
    
    // Carregar dados do dashboard
    carregarDashboard();
    
    // Atualizar a cada 30 segundos (para acompanhamento em tempo real)
    setInterval(carregarDashboard, 30000);
});

// Função principal para carregar dados
function carregarDashboard() {
    carregarIndicadores();
    carregarEntregasDoDia();
    carregarMapaAcompanhamento();
}

// Carregar indicadores numéricos
function carregarIndicadores() {
    // Buscar dados da API
    fetch(CONFIG.API_URL + '/dashboard/indicadores', {
        method: 'GET',
        headers: {
            'Authorization': 'Bearer ' + sessionStorage.getItem('token')
        }
    })
    .then(resposta => resposta.json())
    .then(dados => {
        // Atualizar os cards
        document.getElementById('total-entregas').textContent = dados.totalEntregas || 0;
        document.getElementById('entregas-concluidas').textContent = dados.concluidas || 0;
        document.getElementById('entregas-pendentes').textContent = dados.pendentes || 0;
        document.getElementById('total-clientes').textContent = dados.totalClientes || 0;
    })
    .catch(erro => {
        console.error('Erro ao carregar indicadores:', erro);
    });
}

// Carregar tabela de entregas do dia
function carregarEntregasDoDia() {
    fetch(CONFIG.API_URL + '/entregas/pendentes', {
        headers: {
            'Authorization': 'Bearer ' + sessionStorage.getItem('token')
        }
    })
    .then(resposta => resposta.json())
    .then(entregas => {
        const tbody = document.querySelector('#tabela-entregas tbody');
        tbody.innerHTML = ''; // Limpar tabela
        
        if (entregas.length === 0) {
            // Mostrar mensagem se não houver entregas
            tbody.innerHTML = '<tr><td colspan="5" style="text-align: center;">Nenhuma entrega pendente encontrada</td></tr>';
            return;
        }
        
        // Para cada entrega, criar uma linha na tabela
        entregas.forEach(entrega => {
            const tr = document.createElement('tr');
            
            // Definir cor do status
            let corStatus = '';
            if (entrega.status === 'entregue') corStatus = 'green';
            else if (entrega.status === 'pendente') corStatus = 'orange';
            else if (entrega.status === 'cancelado') corStatus = 'red';
            
            tr.innerHTML = `
                <td>${entrega.cliente}</td>
                <td>${entrega.endereco}</td>
                <td>${entrega.produto}</td>
                <td style="color: ${corStatus}; font-weight: bold;">${entrega.status}</td>
                <td>
                    <button class="botao" onclick="verDetalhes(${entrega.id})">Ver</button>
                </td>
            `;
            
            tbody.appendChild(tr);
        });
    })
    .catch(erro => {
        console.error('Erro ao carregar entregas:', erro);
    });
}

// Carregar mapa de acompanhamento
function carregarMapaAcompanhamento() {
    if (!mapaDashboard) {
        mapaDashboard = inicializarMapa('mapa', CONFIG.DISTRIBUIDORA.COORDENADAS);
    }

    const mapa = mapaDashboard;
    if (!mapa) {
        return;
    }

    limparMapaDashboard(mapa);
    const pontoPartida = CONFIG.DISTRIBUIDORA.COORDENADAS;

    marcadoresDashboard.push(
        adicionarMarcador(
            mapa,
            pontoPartida,
            CONFIG.DISTRIBUIDORA.NOME,
            'azul'
        )
    );
    
    // Buscar localização do entregador
    fetch(CONFIG.API_URL + '/entregador/localizacao', {
        headers: {
            'Authorization': 'Bearer ' + sessionStorage.getItem('token')
        }
    })
    .then(resposta => resposta.json())
    .then(dados => {
        if (dados.latitude && dados.longitude) {
            marcadoresDashboard.push(
                adicionarMarcador(
                    mapa,
                    [Number(dados.latitude), Number(dados.longitude)],
                    'Entregador',
                    'verde'
                )
            );
        }
        
        // Buscar pontos pendentes para marcadores e rota
        return fetch(CONFIG.API_URL + '/entregas/pendentes/pontos', {
            headers: {
                'Authorization': 'Bearer ' + sessionStorage.getItem('token')
            }
        })
        .then(resposta => resposta.json())
        .then(pontos => {
            return ({ pontos, pendentes: pontos, pontoPartida });
        });
    })
    .then(({ pontos, pendentes, pontoPartida }) => {
        const pontosPendentes = pendentes.map(ponto => ({
            coordenadas: [Number(ponto.latitude), Number(ponto.longitude)],
            cliente: ponto.cliente,
            dados: ponto
        }));

        if (pontosPendentes.length > 0) {
            const rotaOtimizada = otimizarRota(pontoPartida, pontosPendentes);

            rotaOtimizada.forEach((item, indice) => {
                marcadoresDashboard.push(
                    adicionarMarcador(
                        mapa,
                        item.coordenadas,
                        `${indice + 1}º - ${item.cliente}<br>${item.dados.endereco || 'Endereco nao informado'}`,
                        'vermelho',
                        { numeroEtiqueta: indice + 1 }
                    )
                );
            });

            const coordenadasRota = [pontoPartida].concat(
                rotaOtimizada.map(item => item.coordenadas)
            );

            camadaRotaDashboard = desenharRota(mapa, coordenadasRota);
        } else {
            pontos.forEach(ponto => {
                marcadoresDashboard.push(
                    adicionarMarcador(
                        mapa,
                        [Number(ponto.latitude), Number(ponto.longitude)],
                        `Pendente: ${ponto.cliente}<br>${ponto.endereco || 'Endereco nao informado'}`,
                        'vermelho'
                    )
                );
            });
        }
        
        // Ajustar zoom para mostrar todos os pontos
        if (pontos.length > 0) {
            const limites = pontos.map(p => [Number(p.latitude), Number(p.longitude)]);
            if (pontoPartida) {
                limites.push(pontoPartida);
            }
            mapa.fitBounds(calcularLimites(limites));
        }
    })
    .catch(erro => {
        console.error('Erro ao carregar mapa:', erro);
    });
}

function limparMapaDashboard(mapa) {
    if (camadaRotaDashboard) {
        mapa.removeLayer(camadaRotaDashboard);
        camadaRotaDashboard = null;
    }

    marcadoresDashboard.forEach(marcador => {
        if (marcador) {
            mapa.removeLayer(marcador);
        }
    });
    marcadoresDashboard = [];
}

// Função para ver detalhes de uma entrega
function verDetalhes(id) {
    window.location.href = 'detalhes-entrega.html?id=' + id;
}
