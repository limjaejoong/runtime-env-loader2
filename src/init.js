'use strict';

const path = require('path');
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
    configDir = 'config',
    envName,
    overwrite = false,
    secretEnvMap = DEFAULT_SECRET_ENV_MAP,
    managerClient
  } = options;

  const runtimeEnvRaw = envName || process.env.APP_ENV || process.env.RUNTIME_ENV || process.env.NODE_ENV || 'dev';
  const runtimeEnv = String(runtimeEnvRaw).toLowerCase() === 'development'
    ? 'dev'
    : String(runtimeEnvRaw).toLowerCase() === 'production'
      ? 'prod'
      : String(runtimeEnvRaw).toLowerCase() === 'qa'
        ? 'sqa'
        : String(runtimeEnvRaw).toLowerCase();

  const resolvedCommonFilePath = path.resolve(configDir, 'config.json');
  const resolvedEnvFilePath = path.resolve(configDir, `config-${runtimeEnv}.json`);
  const resolvedLocalFilePath = path.resolve(configDir, 'config-local-override.json');

  let commonSource = null;
  let envSource = null;
  let secretSource = null;
  let localSource = null;
  let loadedFrom = null;
  const loadedSources = [];
  const errors = [];
  const mergedSource = {};

  // Priority base layer 1: config.json
  try {
    commonSource = loadFromLocalFile(resolvedCommonFilePath);
    if (commonSource) {
      loadedSources.push('config');
      Object.assign(mergedSource, commonSource);
    }
  } catch (error) {
    errors.push({ source: 'config', message: error.message });
  }

  // Priority base layer 2: config-{env}.json
  try {
    envSource = loadFromLocalFile(resolvedEnvFilePath);
    if (envSource) {
      loadedSources.push(`config-${runtimeEnv}`);
      Object.assign(mergedSource, envSource);
    }
  } catch (error) {
    errors.push({ source: `config-${runtimeEnv}`, message: error.message });
  }

  // Priority layer 3: secret-manager (required by default)
  try {
    if (!secretName) {
      throw new Error('secretName is required');
    }
    secretSource = await loadFromSecretsManager({
      secretName,
      region,
      client: managerClient
    });
    if (secretSource) {
      loadedSources.push('secrets-manager');
      Object.assign(mergedSource, secretSource);
    }
  } catch (error) {
    errors.push({ source: 'secrets-manager', message: error.message });
  }

  // Priority layer 4 (highest): config-local-override.json
  try {
    localSource = loadFromLocalFile(resolvedLocalFilePath);
    if (localSource) {
      loadedSources.push('config-local-override');
      Object.assign(mergedSource, localSource);
    }
  } catch (error) {
    errors.push({ source: 'config-local-override', message: error.message });
  }

  if (!loadedSources.includes('secrets-manager')) {
    errors.push({
      source: 'secrets-manager',
      message: secretName
        ? `required secret "${secretName}" could not be loaded`
        : 'secretName is required'
    });
    return {
      loaded: false,
      loadedFrom,
      loadedSources,
      injectedKeys: [],
      mappedKeys: [],
      source: Object.keys(mergedSource).length > 0 ? mergedSource : null,
      runtimeEnv,
      commonSource,
      envSource,
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
      runtimeEnv,
      errors
    };
  }

  const injectedKeys = applyRawEnv(mergedSource, { overwrite });
  const mappedKeys = applyMappedEnv(mergedSource, { overwrite, secretEnvMap });

  loadedFrom = loadedSources[0];

  return {
    loaded: true,
    loadedFrom,
    loadedSources,
    injectedKeys,
    mappedKeys,
    source: mergedSource,
    runtimeEnv,
    commonSource,
    envSource,
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
