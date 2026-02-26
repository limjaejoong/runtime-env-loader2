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

async function loadPublicEnv(options = {}) {
  const {
    endpoint = '/api/runtime-config',
    fetchImpl = (typeof globalThis !== 'undefined' ? globalThis.fetch : null),
    requestInit
  } = options;

  if (typeof fetchImpl !== 'function') {
    throw new Error('loadPublicEnv requires fetch implementation');
  }

  const response = await fetchImpl(endpoint, requestInit);
  if (!response || !response.ok) {
    const status = response ? response.status : 'unknown';
    throw new Error(`Failed to load public env (status=${status})`);
  }

  const body = await response.json();
  if (!body || typeof body !== 'object') return {};
  return body;
}

function mergePublicEnv(...sources) {
  return Object.assign({}, ...sources.filter((item) => item && typeof item === 'object'));
}

module.exports = {
  getPublicEnv,
  createPublicEnvHandler,
  loadPublicEnv,
  mergePublicEnv
};
