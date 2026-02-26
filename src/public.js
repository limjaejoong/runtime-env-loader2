'use strict';

let browserEnvCache = {};

async function loadBrowserEnv(options = {}) {
  const {
    endpoint = '/api/runtime-config',
    fetchImpl = (typeof globalThis !== 'undefined' ? globalThis.fetch : null),
    requestInit
  } = options;

  if (typeof fetchImpl !== 'function') {
    throw new Error('loadBrowserEnv requires fetch implementation');
  }

  const response = await fetchImpl(endpoint, requestInit);
  if (!response || !response.ok) {
    const status = response ? response.status : 'unknown';
    throw new Error(`Failed to load public env (status=${status})`);
  }

  const body = await response.json();
  if (!body || typeof body !== 'object') {
    browserEnvCache = {};
    return browserEnvCache;
  }

  if (body.values && typeof body.values === 'object') {
    const sourceMap = body.sourceMap && typeof body.sourceMap === 'object' ? body.sourceMap : {};
    const filtered = {};
    Object.entries(body.values).forEach(([key, value]) => {
      if (sourceMap[key] === 'secrets-manager') return;
      if (value == null) return;
      filtered[key] = String(value);
    });
    browserEnvCache = filtered;
    return browserEnvCache;
  }

  browserEnvCache = body;
  return browserEnvCache;
}

function getBrowserEnv(key) {
  if (!key || typeof key !== 'string') return null;
  const value = browserEnvCache && browserEnvCache[key] != null ? browserEnvCache[key] : null;
  if (value == null) return null;
  return String(value);
}

function getBrowserEnvKeys() {
  return Object.keys(browserEnvCache || {}).filter((key) => browserEnvCache[key] != null);
}

module.exports = {
  loadBrowserEnv,
  getBrowserEnv,
  getBrowserEnvKeys
};
