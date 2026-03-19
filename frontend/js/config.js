// Objeto com as configurações do sistema
const CONFIG = {
    // URL da API do nosso backend (onde o Node.js estará rodando)
    API_URL: window.location.origin + '/api',

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
