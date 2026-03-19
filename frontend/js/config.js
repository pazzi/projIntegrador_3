function resolverApiUrl() {
    const portaBackend = '3001';
    const hostname = window.location.hostname || 'localhost';
    const protocolo = window.location.protocol === 'https:' ? 'https:' : 'http:';
    const origemAtual = window.location.origin;
    const usandoArquivoLocal = window.location.protocol === 'file:';
    const ambienteLocal = hostname === 'localhost' || hostname === '127.0.0.1';

    if (usandoArquivoLocal) {
        return `${protocolo}//localhost:${portaBackend}/api`;
    }

    if (ambienteLocal && window.location.port !== portaBackend) {
        return `${protocolo}//${hostname}:${portaBackend}/api`;
    }

    return origemAtual + '/api';
}

// Objeto com as configurações do sistema
const CONFIG = {
    // URL da API do nosso backend (onde o Node.js estará rodando)
    API_URL: resolverApiUrl(),

    DISTRIBUIDORA: {
        NOME: 'Distribuidora',
        LATITUDE: -23.001331830624185,
        LONGITUDE: -47.50679028744526,
        COORDENADAS: [-23.001331830624185, -47.50679028744526]
    },
    
    // Chave para acessar o serviço de mapas (no caso do OpenStreetMap não precisa de chave)
    // Se usar Google Maps, precisaria de uma chave aqui
    
    // Configurações de acessibilidade
    ACESSIBILIDADE: {
        CONTRASTE_ALTO: false,  // Começa com contraste normal
        FONTE_GRANDE: false      // Começa com fonte normal
    }
};

// Não esquecer de exportar para usar em outros arquivos
// Como é JavaScript puro, a variável CONFIG fica disponível globalmente
//export default CONFIG;
