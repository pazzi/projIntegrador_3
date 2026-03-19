const crypto = require('crypto');

const HASH_PREFIX = 'scrypt';

function scryptAsync(password, salt) {
  return new Promise((resolve, reject) => {
    crypto.scrypt(password, salt, 64, (error, derivedKey) => {
      if (error) {
        reject(error);
        return;
      }

      resolve(derivedKey);
    });
  });
}

async function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const derivedKey = await scryptAsync(password, salt);
  return `${HASH_PREFIX}$${salt}$${derivedKey.toString('hex')}`;
}

function isPasswordHashed(passwordHash) {
  return typeof passwordHash === 'string' && passwordHash.startsWith(`${HASH_PREFIX}$`);
}

async function verifyPassword(password, passwordHash) {
  if (!isPasswordHashed(passwordHash)) {
    return password === passwordHash;
  }

  const [, salt, storedHash] = passwordHash.split('$');
  const derivedKey = await scryptAsync(password, salt);
  const storedBuffer = Buffer.from(storedHash, 'hex');

  if (storedBuffer.length !== derivedKey.length) {
    return false;
  }

  return crypto.timingSafeEqual(storedBuffer, derivedKey);
}

module.exports = {
  hashPassword,
  isPasswordHashed,
  verifyPassword
};
