'use strict';

const { loadFromLocalFile, loadFromSecretsManager } = require('./providers');

const DEFAULT_SECRET_ENV_MAP = {
  SEA_X_API_KEY: 'API_KEY_SEA',
  SKT_X_API_KEY: 'API_KEY_SKT',
  CORE_SLS_APIKEY: 'API_KEY',
  CORE_SLS_X_API_KEY: 'X_API_KEY',
  WF_X_API_KEY: 'WF_X_API_KEY',
  SA_X_API_KEY: 'SECURITY_ADVISOR_X_API_KEY',
  NICEID_SITE_PW: 'NICE_ID_SITE_PW'
};

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

function applyMappedEnv(source, options = {}) {
  const {
    overwrite = false,
    secretEnvMap = DEFAULT_SECRET_ENV_MAP
  } = options;
  const injectedKeys = [];
  if (!source || typeof source !== 'object') return injectedKeys;

  Object.entries(secretEnvMap).forEach(([sourceKey, targetKey]) => {
    if (setEnv(targetKey, source[sourceKey], overwrite)) injectedKeys.push(targetKey);
  });

  return injectedKeys;
}

async function initSecretsEnv(options = {}) {
  const {
    secretName,
    region,
    localFilePath,
    preferLocalFile = true,
    overwrite = false,
    secretEnvMap = DEFAULT_SECRET_ENV_MAP,
    managerClient,
    useSecretsManager = true,
    requireSecretsManager = true
  } = options;

  let localSource = null;
  let secretSource = null;
  let loadedFrom = null;
  const loadedSources = [];
  const errors = [];
  const injectedKeys = [];
  const mappedKeys = [];

  if (preferLocalFile && localFilePath) {
    try {
      localSource = loadFromLocalFile(localFilePath);
      if (localSource) {
        loadedSources.push('local-file');
        injectedKeys.push(...applyRawEnv(localSource, { overwrite }));
        mappedKeys.push(...applyMappedEnv(localSource, { overwrite, secretEnvMap }));
      }
    } catch (error) {
      errors.push({ source: 'local-file', message: error.message });
    }
  }

  if (useSecretsManager && secretName) {
    try {
      secretSource = await loadFromSecretsManager({
        secretName,
        region,
        client: managerClient
      });
      if (secretSource) {
        loadedSources.push('secrets-manager');
        // Always add only missing values from secrets manager.
        injectedKeys.push(...applyRawEnv(secretSource, { overwrite: false }));
        mappedKeys.push(...applyMappedEnv(secretSource, { overwrite: false, secretEnvMap }));
      }
    } catch (error) {
      errors.push({ source: 'secrets-manager', message: error.message });
    }
  }

  if (requireSecretsManager && !loadedSources.includes('secrets-manager')) {
    errors.push({
      source: 'secrets-manager',
      message: secretName
        ? `required secret "${secretName}" could not be loaded`
        : 'secretName is required when requireSecretsManager=true'
    });
    return {
      loaded: false,
      loadedFrom,
      loadedSources,
      injectedKeys,
      mappedKeys,
      source: localSource || null,
      localSource,
      secretSource,
      errors
    };
  }

  if (loadedSources.length === 0) {
    return {
      loaded: false,
      loadedFrom,
      loadedSources,
      injectedKeys: [],
      mappedKeys: [],
      source: null,
      errors
    };
  }

  loadedFrom = loadedSources[0];

  return {
    loaded: true,
    loadedFrom,
    loadedSources,
    injectedKeys,
    mappedKeys,
    source: localSource || secretSource,
    localSource,
    secretSource,
    errors
  };
}

module.exports = {
  initSecretsEnv,
  applyRawEnv,
  applyMappedEnv,
  DEFAULT_SECRET_ENV_MAP
};
