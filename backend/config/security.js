'use strict';

function jwtSecret() {
  const secret = String(process.env.JWT_SECRET || '');
  if (secret.length < 32) throw new Error('JWT_SECRET must be configured with at least 32 random characters.');
  return secret;
}

function assertSecurityConfiguration() {
  jwtSecret();
}

module.exports = { assertSecurityConfiguration, jwtSecret };
