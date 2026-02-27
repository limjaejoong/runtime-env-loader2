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

function applyLayer(mergedSource, sourceMap, sourceName, layerSource, options = {}) {
  const { onlyExistingKeys = false } = options;
  if (!layerSource || typeof layerSource !== 'object') return 0;
  let appliedCount = 0;
  Object.entries(layerSource).forEach(([key, value]) => {
    if (onlyExistingKeys && !Object.prototype.hasOwnProperty.call(mergedSource, key)) return;
    mergedSource[key] = value;
    sourceMap[key] = sourceName;
    appliedCount += 1;
  });
  return appliedCount;
}

function resolveTransformKeyFn(transformEnvKey) {
  if (!Array.isArray(transformEnvKey)) return null;

  const mapping = {};
  transformEnvKey.forEach((item) => {
    if (!item || typeof item !== 'object') return;
    const { org, dest } = item;
    if (typeof org !== 'string' || !org) return;
    if (typeof dest !== 'string' || !dest) return;
    mapping[org] = dest;
  });

  return (key) => mapping[key] || key;
}

function transformSourceKeys(sourceName, source, transformEnvKey, errors) {
  if (!source || typeof source !== 'object') return source;
  const transformKeyFn = resolveTransformKeyFn(transformEnvKey);
  if (typeof transformKeyFn !== 'function') return source;

  const transformed = {};
  Object.entries(source).forEach(([key, value]) => {
    let transformedKey = key;
    try {
      transformedKey = transformKeyFn(key, sourceName);
    } catch (error) {
      errors.push({
        source: sourceName,
        message: `transformEnvKey failed for key "${key}": ${error.message}`
      });
      return;
    }

    if (!transformedKey || typeof transformedKey !== 'string') {
      errors.push({
        source: sourceName,
        message: `transformEnvKey must return a non-empty string (key="${key}")`
      });
      return;
    }
    transformed[transformedKey] = value;
  });
  return transformed;
}

async function initRuntimeEnv(options = {}) {
  const {
    secretName,
    envName,
    region = 'ap-northeast-2',
    configDir = path.resolve(__dirname, 'config'),
    runtimeConfigEnabled = false,
    requireSecretsManager = true,
    transformEnvKey
  } = options;

  const runtimeEnv = envName;

  const resolvedCommonFilePath = path.resolve(configDir, 'config.json');
  const resolvedEnvFilePath = path.resolve(configDir, `config-${runtimeEnv}.json`);
  const resolvedLocalFilePath = path.resolve(configDir, 'config-local-override.json');

  const loadedSources = [];
  const errors = [];
  const mergedSource = {};
  const mergedSourceMap = {};
  const normalizedTransformEnvKey = Array.isArray(transformEnvKey) ? transformEnvKey : null;

  if (transformEnvKey != null && !Array.isArray(transformEnvKey)) {
    errors.push({
      source: 'init',
      message: 'transformEnvKey must be an array of { org, dest }'
    });
  }

  // Priority base layer 1: config.json
  try {
    const commonSourceRaw = loadFromLocalFile(resolvedCommonFilePath);
    const commonSource = transformSourceKeys('config', commonSourceRaw, normalizedTransformEnvKey, errors);
    if (commonSource) {
      loadedSources.push('config');
      applyLayer(mergedSource, mergedSourceMap, 'config', commonSource);
    }
  } catch (error) {
    errors.push({ source: 'config', message: error.message });
  }

  // Priority base layer 2: config-{env}.json
  try {
    const envSourceRaw = loadFromLocalFile(resolvedEnvFilePath);
    const envSource = transformSourceKeys(`config-${runtimeEnv}`, envSourceRaw, normalizedTransformEnvKey, errors);
    if (envSource) {
      loadedSources.push(`config-${runtimeEnv}`);
      applyLayer(mergedSource, mergedSourceMap, `config-${runtimeEnv}`, envSource);
    }
  } catch (error) {
    errors.push({ source: `config-${runtimeEnv}`, message: error.message });
  }

  let secretsManagerLoaded = false;

  // Priority layer 3: secret-manager
  try {
    if (!secretName && requireSecretsManager) {
      throw new Error('secretName is required');
    }
    if (secretName) {
      const secretSource = await loadFromSecretsManager({
        secretName,
        region
      });
      const transformedSecretSource = transformSourceKeys(
        'secrets-manager',
        secretSource,
        normalizedTransformEnvKey,
        errors
      );
      if (transformedSecretSource) {
        secretsManagerLoaded = true;
        loadedSources.push('secrets-manager');
        applyLayer(mergedSource, mergedSourceMap, 'secrets-manager', transformedSecretSource);
      }
    }
  } catch (error) {
    errors.push({ source: 'secrets-manager', message: error.message });
  }

  // Priority layer 4 (highest): config-local-override.json
  try {
    const localSourceRaw = loadFromLocalFile(resolvedLocalFilePath);
    const localSource = transformSourceKeys(
      'config-local-override',
      localSourceRaw,
      normalizedTransformEnvKey,
      errors
    );
    if (localSource) {
      const appliedCount = applyLayer(mergedSource, mergedSourceMap, 'config-local-override', localSource, {
        onlyExistingKeys: true
      });
      if (appliedCount > 0) loadedSources.push('config-local-override');
    }
  } catch (error) {
    errors.push({ source: 'config-local-override', message: error.message });
  }

  if (requireSecretsManager && !secretsManagerLoaded) {
    setTrackedServerEnvKeys({});
    if (secretName) {
      errors.push({
        source: 'secrets-manager',
        message: `required secret "${secretName}" could not be loaded`
      });
    } else {
      errors.push({
        source: 'secrets-manager',
        message: 'secretName is required'
      });
    }
    return {
      loaded: false,
      errors,
      runtimeConfig: null,
      loadedKeys: {}
    };
  }

  if (loadedSources.length === 0) {
    setTrackedServerEnvKeys({});
    return {
      loaded: false,
      errors,
      runtimeConfig: null,
      loadedKeys: {}
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
    runtimeConfig: runtimeConfigResult,
    loadedKeys: Object.entries(mergedSource).reduce((acc, [key, value]) => {
      if (value == null) return acc;
      acc[key] = String(value);
      return acc;
    }, {})
  };
}

module.exports = {
  initRuntimeEnv,
  applyRawEnv
};
