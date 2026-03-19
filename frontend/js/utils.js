// Função para formatar data no padrão brasileiro (dd/mm/aaaa)
function formatarData(dataISO) {
    // Recebe uma data no formato ISO (ex: 2024-03-15)
    // Retorna no formato brasileiro (15/03/2024)
    
    // Divide a string pelos traços
    const partes = dataISO.split('-');
    // partes[0] = ano, partes[1] = mês, partes[2] = dia
    
    // Retorna no formato dia/mês/ano
    return partes[2] + '/' + partes[1] + '/' + partes[0];
}

// Função para formatar telefone (ex: 11987654321 -> (11) 98765-4321)
function formatarTelefone(telefone) {
    // Remove tudo que não for número
    const numeros = telefone.replace(/\D/g, '');
    
    // Verifica se tem 11 dígitos (celular com DDD)
    if (numeros.length === 11) {
        return '(' + numeros.slice(0, 2) + ') ' + 
               numeros.slice(2, 7) + '-' + 
               numeros.slice(7);
    }
    // Se tiver 10 dígitos (telefone fixo)
    else if (numeros.length === 10) {
        return '(' + numeros.slice(0, 2) + ') ' + 
               numeros.slice(2, 6) + '-' + 
               numeros.slice(6);
    }
    // Se não tiver o tamanho esperado, retorna o original
    return telefone;
}

// Função para validar se um campo não está vazio
function campoNaoVazio(valor) {
    // Trim remove espaços em branco do início e fim
    return valor.trim() !== '';
}

// Função para validar email (formato simples)
function validarEmail(email) {
    // Verifica se tem @ e se tem ponto depois do @
    return email.includes('@') && email.includes('.', email.indexOf('@'));
}

// Função para mostrar mensagem de erro na tela
function mostrarErro(mensagem, elemento) {
    // elemento é onde a mensagem vai aparecer (ex: uma div de erro)
    elemento.innerHTML = '<p style="color: red;">⚠️ ' + mensagem + '</p>';
    
    // Faz a mensagem desaparecer após 5 segundos
    setTimeout(() => {
        elemento.innerHTML = '';
    }, 5000);
}

// Função para mostrar mensagem de sucesso
function mostrarSucesso(mensagem, elemento) {
    elemento.innerHTML = '<p style="color: green;">✅ ' + mensagem + '</p>';
    
    setTimeout(() => {
        elemento.innerHTML = '';
    }, 3000);
}
