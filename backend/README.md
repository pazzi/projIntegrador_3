# Backend - Estrutura Refatorada

Este backend foi refatorado para melhorar a manutenibilidade e organização do código.

## Documentação da API (Swagger)

A documentação completa da API está disponível via Swagger UI em:
```
http://localhost:3001/api-docs
```

A documentação inclui:
- Descrição detalhada de todas as rotas
- Esquemas de dados (request/response)
- Exemplos de uso
- Autenticação Bearer Token
- Teste interativo das rotas

### Funcionalidades Documentadas:
- **Autenticação**: Login e cadastro de usuários
- **Clientes**: CRUD completo de clientes
- **Pedidos**: Gerenciamento de pedidos e itens
- **Entregas**: Controle de status e localização
- **Produtos**: Listagem de produtos disponíveis
- **Dashboard**: Indicadores e estatísticas

## Estrutura de Pastas

```
backend/
├── swagger.js           # Configuração do Swagger
├── middlewares/          # Middlewares de autenticação e logging
│   └── auth.js          # Middleware de autenticação e geração de tokens
├── routes/              # Rotas da API organizadas por funcionalidade
│   ├── auth.js          # Rotas de login e cadastro
│   ├── clientes.js      # Rotas de gerenciamento de clientes
│   ├── pedidos.js       # Rotas de pedidos e itens
│   ├── entregas.js      # Rotas de entregas e localização
│   └── produtos.js      # Rotas de produtos
├── services/            # Lógica de negócio e consultas ao banco
│   ├── pedidos.js       # Serviços para pedidos
│   └── clientes.js      # Serviços para clientes
├── validators/          # Validações de entrada
│   └── pedidos.js       # Validações para pedidos
├── server.js            # Arquivo principal do servidor
├── db.js                # Configuração do banco de dados
├── auth-utils.js        # Utilitários de autenticação
└── package.json         # Dependências
```

## Benefícios da Refatoração

- **Separação de responsabilidades**: Cada arquivo tem uma função específica
- **Facilidade de manutenção**: Mudanças em uma funcionalidade não afetam outras
- **Reutilização de código**: Serviços e middlewares podem ser reutilizados
- **Testabilidade**: Código mais modular facilita testes unitários
- **Legibilidade**: Arquivos menores e bem organizados

## Como executar

```bash
cd backend
npm install
npm start
```

## Rotas da API

- `POST /api/login` - Autenticação
- `POST /api/clientes/cadastro` - Cadastro de clientes
- `GET /api/dashboard/indicadores` - Indicadores do dashboard
- `GET /api/clientes` - Listar clientes
- `GET /api/pedidos` - Listar pedidos
- `GET /api/entregas/hoje` - Entregas do dia
- `GET /api/produtos` - Listar produtos
- E muitas outras rotas específicas...

Para detalhes completos, consulte os arquivos de rotas individuais.