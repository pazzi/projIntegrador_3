// Variável global para armazenar a instância do mapa atual
let mapaAtual = null;

// Função para inicializar o mapa
function inicializarMapa(elementoId, centroInicial = CONFIG.DISTRIBUIDORA.COORDENADAS) {
    // Verificar se o elemento existe
    const elemento = document.getElementById(elementoId);
    if (!elemento) {
        console.error('Elemento do mapa não encontrado:', elementoId);
        return null;
    }
    
    // Criar o mapa
    const mapa = L.map(elementoId).setView(centroInicial, 13);
    
    // Adicionar camada de tiles (imagens do mapa) do OpenStreetMap
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
    }).addTo(mapa);
    
    // Guardar referência do mapa
    mapaAtual = mapa;
    
    return mapa;
}

// Função para adicionar um marcador no mapa
function adicionarMarcador(mapa, coordenadas, titulo, cor = 'vermelho', opcoes = {}) {
    // Definir ícone baseado na cor
    let iconeCor = '';
    if (cor === 'vermelho') iconeCor = 'red';
    else if (cor === 'verde') iconeCor = 'green';
    else if (cor === 'azul') iconeCor = 'blue';
    else iconeCor = 'red';

    const numeroEtiqueta = opcoes.numeroEtiqueta;
    const markerIconUrl = `https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-${iconeCor}.png`;
    const markerShadowUrl = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png';
    let icone;

    if (numeroEtiqueta !== undefined && numeroEtiqueta !== null) {
        const numeroSeguro = String(numeroEtiqueta)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');

        icone = L.divIcon({
            className: 'marcador-entrega-wrapper',
            html: `
                <div class="marcador-entrega">
                    <span class="marcador-entrega__etiqueta">${numeroSeguro}</span>
                    <img class="marcador-entrega__icone" src="${markerIconUrl}" alt="" />
                    <img class="marcador-entrega__sombra" src="${markerShadowUrl}" alt="" />
                </div>
            `,
            iconSize: [41, 49],
            iconAnchor: [20, 49],
            popupAnchor: [1, -40]
        });
    } else {
        // Criar ícone personalizado
        icone = L.icon({
            iconUrl: markerIconUrl,
            shadowUrl: markerShadowUrl,
            iconSize: [25, 41],
            iconAnchor: [12, 41],
            popupAnchor: [1, -34],
            shadowSize: [41, 41]
        });
    }
    
    // Criar marcador
    const marcador = L.marker(coordenadas, {icon: icone}).addTo(mapa);
    
    // Adicionar popup com informações
    if (titulo) {
        marcador.bindPopup(titulo);
    }
    
    return marcador;
}

// Função para desenhar uma rota entre pontos
function desenharRota(mapa, pontos) {
    // pontos é um array de coordenadas: [[lat1, lon1], [lat2, lon2], ...]
    
    // Criar uma linha ligando os pontos
    const linha = L.polyline(pontos, {
        color: 'blue',
        weight: 5,
        opacity: 0.7
    }).addTo(mapa);
    
    // Ajustar o zoom para mostrar toda a rota
    mapa.fitBounds(linha.getBounds());
    
    return linha;
}

// Função para geocodificar um endereço (converter endereço em coordenadas)
function geocodificarEndereco(entrada) {
    let consulta = '';

    if (typeof entrada === 'string') {
        consulta = `${entrada}, Capivari, SP`;
    } else if (entrada && typeof entrada === 'object') {
        const partes = [
            entrada.endereco,
            entrada.cep,
            entrada.cidade,
            entrada.estado,
            entrada.pais || 'Brasil'
        ].filter(Boolean);

        consulta = partes.join(', ');
    }

    if (!consulta) {
        return Promise.resolve(null);
    }

    // Usar o serviço Nominatim do OpenStreetMap (gratuito)
    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(consulta)}`;
    
    return fetch(url, {
        headers: {
            'User-Agent': 'RotaKlara/1.0'  // Identificação para o serviço
        }
    })
    .then(resposta => resposta.json())
    .then(dados => {
        if (dados && dados.length > 0) {
            // Pegar o primeiro resultado
            const primeiro = dados[0];
            return {
                latitude: parseFloat(primeiro.lat),
                longitude: parseFloat(primeiro.lon),
                enderecoFormatado: primeiro.display_name
            };
        } else {
            return null;  // Endereço não encontrado
        }
    });
}

// Função para geocodificar múltiplos endereços (com atraso para não sobrecarregar)
function geocodificarMultiplos(enderecos, callback) {
    // enderecos: array de strings
    // callback: função chamada para cada resultado
    
    let resultados = [];
    let index = 0;
    
    function processarProximo() {
        if (index >= enderecos.length) {
            callback(resultados);
            return;
        }
        
        const endereco = enderecos[index];
        
        geocodificarEndereco(endereco)
            .then(coordenadas => {
                resultados.push({
                    endereco: endereco,
                    coordenadas: coordenadas,
                    indice: index
                });
                
                // Incrementar índice e processar próximo com atraso
                index++;
                setTimeout(processarProximo, 1000);  // 1 segundo de atraso
            })
            .catch(erro => {
                console.error('Erro ao geocodificar:', endereco, erro);
                resultados.push({
                    endereco: endereco,
                    coordenadas: null,
                    erro: true,
                    indice: index
                });
                
                index++;
                setTimeout(processarProximo, 1000);
            });
    }
    
    // Iniciar processamento
    processarProximo();
}

// Função para calcular distância entre dois pontos (fórmula de Haversine)
function calcularDistancia(lat1, lon1, lat2, lon2) {
    const R = 6371;  // Raio da Terra em km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = 
        Math.sin(dLat/2) * Math.sin(dLat/2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
        Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;  // Distância em km
}

// Função para ordenar pontos por proximidade (rota otimizada simples)
function otimizarRota(pontoInicial, pontos) {
    // Algoritmo do vizinho mais próximo (simples)
    // pontoInicial: [lat, lon]
    // pontos: array de {coordenadas: [lat, lon], ...}
    
    let rotaOtimizada = [];
    let pontosRestantes = [...pontos];
    let pontoAtual = pontoInicial;
    
    while (pontosRestantes.length > 0) {
        // Encontrar ponto mais próximo
        let menorDistancia = Infinity;
        let pontoMaisProximo = null;
        let indiceMaisProximo = -1;
        
        for (let i = 0; i < pontosRestantes.length; i++) {
            const ponto = pontosRestantes[i];
            const distancia = calcularDistancia(
                pontoAtual[0], pontoAtual[1],
                ponto.coordenadas[0], ponto.coordenadas[1]
            );
            
            if (distancia < menorDistancia) {
                menorDistancia = distancia;
                pontoMaisProximo = ponto;
                indiceMaisProximo = i;
            }
        }
        
        // Adicionar à rota
        if (pontoMaisProximo) {
            rotaOtimizada.push(pontoMaisProximo);
            pontoAtual = pontoMaisProximo.coordenadas;
            pontosRestantes.splice(indiceMaisProximo, 1);
        }
    }
    
    return rotaOtimizada;
}

// Função para calcular limites do mapa (para ajuste de zoom)
function calcularLimites(pontos) {
    // pontos: array de coordenadas [[lat, lon], ...]
    
    let minLat = Infinity;
    let maxLat = -Infinity;
    let minLon = Infinity;
    let maxLon = -Infinity;
    
    pontos.forEach(ponto => {
        minLat = Math.min(minLat, ponto[0]);
        maxLat = Math.max(maxLat, ponto[0]);
        minLon = Math.min(minLon, ponto[1]);
        maxLon = Math.max(maxLon, ponto[1]);
    });
    
    return [[minLat, minLon], [maxLat, maxLon]];
}

// Função para obter localização atual (GPS)
function obterLocalizacaoAtual() {
    return new Promise((resolve, reject) => {
        if (!navigator.geolocation) {
            reject('Geolocalização não suportada pelo navegador');
            return;
        }
        
        navigator.geolocation.getCurrentPosition(
            (posicao) => {
                resolve({
                    latitude: posicao.coords.latitude,
                    longitude: posicao.coords.longitude
                });
            },
            (erro) => {
                reject('Erro ao obter localização: ' + erro.message);
            },
            {
                enableHighAccuracy: true,
                timeout: 10000,
                maximumAge: 0
            }
        );
    });
}
