'use strict';

function getPublicEnv(options = {}) {
  const {
    source = process.env,
    allowlist = [],
    prefix,
    prefixes
  } = options;

  const result = {};
  const allowlistSet = new Set(allowlist);
  const prefixList = Array.isArray(prefixes) && prefixes.length > 0
    ? prefixes
    : [prefix || 'NEXT_PUBLIC_', 'PUBLIC_'];

  Object.entries(source || {}).forEach(([key, value]) => {
    const byPrefix = typeof key === 'string' && prefixList.some((item) => key.startsWith(item));
    const byAllowlist = allowlistSet.has(key);
    if (!byPrefix && !byAllowlist) return;
    if (value == null) return;
    result[key] = String(value);
  });

  return result;
}

function createPublicEnvHandler(options = {}) {
  const { statusCode = 200 } = options;

  return function publicEnvHandler(_req, res) {
    res.status(statusCode).json(getPublicEnv(options));
  };
}

module.exports = {
  getPublicEnv,
  createPublicEnvHandler
};
