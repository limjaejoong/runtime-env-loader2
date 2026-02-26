'use strict';

const path = require('path');
const { loadFromLocalFile, loadFromSecretsManager } = require('./providers');
const { setTrackedServerEnvKeys } = require('./server');

function setEnv(name, value, overwrite) {
  if (!name || value == null) return false;
  if (!overwrite && process.env[name] != null) return false;
  process.env[name] = String(value);
  return true;
}

function applyRawEnv(source, options = {}) {
  const { overwrite = false } = options;
  const injectedKeys = [];
  if (!source || typeof source !== 'object') return injectedKeys;

  Object.entries(source).forEach(([key, value]) => {
    if (setEnv(key, value, overwrite)) injectedKeys.push(key);
  });

  return injectedKeys;
}

function applyLayer(mergedSource, sourceMap, sourceName, layerSource) {
  if (!layerSource || typeof layerSource !== 'object') return;
  Object.entries(layerSource).forEach(([key, value]) => {
    mergedSource[key] = value;
    sourceMap[key] = sourceName;
  });
}

async function initRuntimeEnv(options = {}) {
  const {
    secretName,
    envName,
    region = 'ap-northeast-2',
    configDir = path.resolve(__dirname, 'config'),
    runtimeConfigEnabled = false
  } = options;

  const runtimeEnv = envName;

  const resolvedCommonFilePath = path.resolve(configDir, 'config.json');
  const resolvedEnvFilePath = path.resolve(configDir, `config-${runtimeEnv}.json`);
  const resolvedLocalFilePath = path.resolve(configDir, 'config-local-override.json');

  const loadedSources = [];
  const errors = [];
  const mergedSource = {};
  const mergedSourceMap = {};

  // Priority base layer 1: config.json
  try {
    const commonSource = loadFromLocalFile(resolvedCommonFilePath);
    if (commonSource) {
      loadedSources.push('config');
      applyLayer(mergedSource, mergedSourceMap, 'config', commonSource);
    }
  } catch (error) {
    errors.push({ source: 'config', message: error.message });
  }

  // Priority base layer 2: config-{env}.json
  try {
    const envSource = loadFromLocalFile(resolvedEnvFilePath);
    if (envSource) {
      loadedSources.push(`config-${runtimeEnv}`);
      applyLayer(mergedSource, mergedSourceMap, `config-${runtimeEnv}`, envSource);
    }
  } catch (error) {
    errors.push({ source: `config-${runtimeEnv}`, message: error.message });
  }

  // Priority layer 3: secret-manager (required by default)
  try {
    if (!secretName) {
      throw new Error('secretName is required');
    }
    const secretSource = await loadFromSecretsManager({
      secretName,
      region
    });
    if (secretSource) {
      loadedSources.push('secrets-manager');
      applyLayer(mergedSource, mergedSourceMap, 'secrets-manager', secretSource);
    }
  } catch (error) {
    errors.push({ source: 'secrets-manager', message: error.message });
  }

  // Priority layer 4 (highest): config-local-override.json
  try {
    const localSource = loadFromLocalFile(resolvedLocalFilePath);
    if (localSource) {
      loadedSources.push('config-local-override');
      applyLayer(mergedSource, mergedSourceMap, 'config-local-override', localSource);
    }
  } catch (error) {
    errors.push({ source: 'config-local-override', message: error.message });
  }

  if (!loadedSources.includes('secrets-manager')) {
    setTrackedServerEnvKeys({});
    errors.push({
      source: 'secrets-manager',
      message: secretName
        ? `required secret "${secretName}" could not be loaded`
        : 'secretName is required'
    });
    return {
      loaded: false,
      errors,
      runtimeConfig: null
    };
  }

  if (loadedSources.length === 0) {
    setTrackedServerEnvKeys({});
    return {
      loaded: false,
      errors,
      runtimeConfig: null
    };
  }

  applyRawEnv(mergedSource, { overwrite: true });
  setTrackedServerEnvKeys(mergedSourceMap);

  let runtimeConfigResult = null;
  if (runtimeConfigEnabled) {
    const pathName = '/api/runtime-config';
    const createPayload = () => {
      const values = {};
      const sourceMap = {};

      Object.entries(mergedSource).forEach(([key, value]) => {
        if (value == null) return;
        values[key] = String(value);
        sourceMap[key] = mergedSourceMap[key] || 'unknown';
      });
      return { values, sourceMap };
    };

    const handler = (_req, res) => {
      const payload = createPayload();
      if (res && typeof res.json === 'function') {
        res.json(payload);
        return;
      }
      if (res && typeof res.setHeader === 'function') {
        res.setHeader('content-type', 'application/json; charset=utf-8');
      }
      if (res && typeof res.end === 'function') {
        res.end(JSON.stringify(payload));
        return;
      }
      return payload;
    };

    runtimeConfigResult = {
      path: pathName,
      handler
    };
  }

  return {
    loaded: true,
    errors,
    runtimeConfig: runtimeConfigResult
  };
}

module.exports = {
  initRuntimeEnv,
  applyRawEnv
};
