// Aguarda o carregamento completo da página
document.addEventListener('DOMContentLoaded', function() {
    const formLogin = document.getElementById('form-login');
    if (formLogin) {
        formLogin.addEventListener('submit', function(evento) {
            evento.preventDefault();
            fazerLogin();
        });

        const botaoContraste = document.getElementById('alto-contraste');
        const botaoAumentar = document.getElementById('aumentar-fonte');
        const botaoDiminuir = document.getElementById('diminuir-fonte');

        if (botaoContraste) botaoContraste.addEventListener('click', toggleAltoContraste);
        if (botaoAumentar) botaoAumentar.addEventListener('click', aumentarFonte);
        if (botaoDiminuir) botaoDiminuir.addEventListener('click', diminuirFonte);

        verificarSessao();
    }
});

// Função principal de login
function fazerLogin() {
    // Pegar os valores digitados pelo usuário
    const usuario = document.getElementById('usuario').value;
    const senha = document.getElementById('senha').value;
    const lembrar = document.getElementById('lembrar').checked;
    
    // Validar se os campos não estão vazios
    if (!campoNaoVazio(usuario) || !campoNaoVazio(senha)) {
        const elementoErro = document.getElementById('mensagem-erro');
        mostrarErro('Por favor, preencha usuário e senha', elementoErro);
        return; // Para a execução aqui
    }
    
    // Preparar os dados para enviar ao servidor
    const dadosLogin = {
        usuario: usuario,
        senha: senha
    };
    
    // Fazer a requisição para o backend (API)
    fetch(CONFIG.API_URL + '/login', {
        method: 'POST', // Método POST para enviar dados
        headers: {
            'Content-Type': 'application/json' // Dizendo que é JSON
        },
        body: JSON.stringify(dadosLogin) // Converte objeto para string JSON
    })
    .then(function(resposta) {
        // A resposta do servidor vem como Promise, precisamos converter
        return resposta.json();
    })
    .then(function(dados) {
        // Dados é o que o servidor respondeu (já convertido para objeto)
        
        // Verificar se o login foi bem-sucedido
        if (dados.sucesso) {
            // Salvar informações do usuário (para usar em outras páginas)
            salvarSessao(dados.usuario, dados.tipo, dados.token, lembrar);
            
            // Redirecionar para a página correta (admin ou entregador)
            if (dados.tipo === 'admin') {
                window.location.href = 'index.html';
            } else if (dados.tipo === 'entregador') {
                window.location.href = 'entregador.html';
            } else {
                window.location.href = 'cliente-portal.html';
            }
        } else {
            // Mostrar mensagem de erro
            const elementoErro = document.getElementById('mensagem-erro');
            mostrarErro(dados.mensagem || 'Usuário ou senha inválidos', elementoErro);
        }
    })
    .catch(function(erro) {
        // Se ocorrer algum erro na comunicação com o servidor
        console.error('Erro no login:', erro);
        const elementoErro = document.getElementById('mensagem-erro');
        mostrarErro('Erro ao conectar com o servidor', elementoErro);
    });
}

// Função para salvar a sessão do usuário
function salvarSessao(usuario, tipo, token, lembrar) {
    // sessionStorage guarda informações enquanto a aba estiver aberta
    sessionStorage.setItem('usuarioLogado', usuario);
    sessionStorage.setItem('tipoUsuario', tipo);
    sessionStorage.setItem('token', token);
    
    // Se o usuário marcou "lembrar", guardar também no localStorage (permanente)
    if (lembrar) {
        localStorage.setItem('usuarioLembrado', usuario);
        localStorage.setItem('tipoLembrado', tipo);
    }
}

// Função para verificar se já existe uma sessão
function verificarSessao() {
    // Primeiro verifica se tem na sessionStorage (login atual)
    const usuario = sessionStorage.getItem('usuarioLogado');
    
    if (usuario) {
        // Se já está logado, redireciona direto
        const tipo = sessionStorage.getItem('tipoUsuario');
        if (tipo === 'admin') {
            window.location.href = 'index.html';
        } else if (tipo === 'entregador') {
            window.location.href = 'entregador.html';
        } else {
            window.location.href = 'cliente-portal.html';
        }
        return;
    }
    
    // Se não tem na session, verifica se tem no localStorage (lembrar)
    const usuarioLembrado = localStorage.getItem('usuarioLembrado');
    if (usuarioLembrado) {
        // Preenche o campo de usuário automaticamente
        document.getElementById('usuario').value = usuarioLembrado;
    }
}

// Função para fazer logout
function fazerLogout() {
    // Limpar as sessões
    sessionStorage.removeItem('usuarioLogado');
    sessionStorage.removeItem('tipoUsuario');
    sessionStorage.removeItem('token');
    
    // Redirecionar para a página de login
    window.location.href = 'login.html';
}

// Funções de acessibilidade
function toggleAltoContraste() {
    // Pega o elemento body (corpo da página)
    const body = document.body;
    
    // Alterna a classe 'alto-contraste' no body
    body.classList.toggle('alto-contraste');
    
    // Atualiza a configuração
    CONFIG.ACESSIBILIDADE.CONTRASTE_ALTO = !CONFIG.ACESSIBILIDADE.CONTRASTE_ALTO;
    
    // Salva a preferência do usuário
    localStorage.setItem('prefContraste', CONFIG.ACESSIBILIDADE.CONTRASTE_ALTO);
}

function aumentarFonte() {
    // Pega o elemento html
    const html = document.documentElement;
    
    // Pega o tamanho atual da fonte
    let tamanhoAtual = window.getComputedStyle(html).fontSize;
    tamanhoAtual = parseFloat(tamanhoAtual);
    
    // Aumenta 2px (limite máximo 24px)
    if (tamanhoAtual < 24) {
        html.style.fontSize = (tamanhoAtual + 2) + 'px';
    }
}

function diminuirFonte() {
    const html = document.documentElement;
    let tamanhoAtual = window.getComputedStyle(html).fontSize;
    tamanhoAtual = parseFloat(tamanhoAtual);
    
    // Diminui 2px (limite mínimo 12px)
    if (tamanhoAtual > 12) {
        html.style.fontSize = (tamanhoAtual - 2) + 'px';
    }
}
