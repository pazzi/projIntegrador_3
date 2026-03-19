const swaggerJSDoc = require('swagger-jsdoc');
const swaggerUi = require('swagger-ui-express');

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Rota Klara API',
      version: '1.0.0',
      description: 'API do sistema de entregas Rota Klara',
      contact: {
        name: 'Equipe Rota Klara',
      },
    },
    servers: [
      {
        url: 'http://localhost:3001',
        description: 'Servidor de desenvolvimento',
      },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
        },
      },
    },
    security: [
      {
        bearerAuth: [],
      },
    ],
  },
  apis: ['./routes/*.js'], // Caminhos para os arquivos com anotações
};

const specs = swaggerJSDoc(options);

module.exports = {
  swaggerUi,
  specs,
};