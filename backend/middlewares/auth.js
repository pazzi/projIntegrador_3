const { getPool } = require('../db');

const tokens = new Map();

function gerarToken(usuario) {
  return `token-${usuario.id}-${Date.now()}`;
}

function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization || '';
  const [, token] = authHeader.split(' ');

  if (!token || !tokens.has(token)) {
    return res.status(401).json({
      sucesso: false,
      mensagem: 'Token ausente ou invalido'
    });
  }

  req.usuario = tokens.get(token);
  return next();
}

function requireRole(roles) {
  return (req, res, next) => {
    if (!req.usuario || !roles.includes(req.usuario.tipo)) {
      return res.status(403).json({
        sucesso: false,
        mensagem: 'Acesso nao autorizado'
      });
    }

    return next();
  };
}

function loggingMiddleware(req, _res, next) {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl}`);
  next();
}

module.exports = {
  tokens,
  gerarToken,
  authMiddleware,
  requireRole,
  loggingMiddleware
};