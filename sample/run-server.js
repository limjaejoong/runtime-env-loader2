'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { initRuntimeEnv, getServerEnv, getServerEnvKeys } = require('../src');

function normalizeEnvName(raw) {
  const value = String(raw || '').toLowerCase();
  if (value === 'development') return 'dev';
  if (value === 'production') return 'prod';
  if (value === 'qa') return 'sqa';
  return value || 'dev';
}

function parseDotEnv(text) {
  const result = {};
  text.split(/\r?\n/).forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;
    const index = trimmed.indexOf('=');
    if (index < 1) return;
    const key = trimmed.slice(0, index).trim();
    let value = trimmed.slice(index + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    result[key] = value;
  });
  return result;
}

function loadEnvFiles(runtimeEnv) {
  const commonEnvPath = path.resolve(__dirname, '.env');
  const envSpecificPath = path.resolve(__dirname, `.env.${runtimeEnv}`);
  const candidates = [commonEnvPath, envSpecificPath];
  const loadedFiles = [];
  const mergedFromFiles = {};

  candidates.forEach((filePath) => {
    if (!fs.existsSync(filePath)) return;
    const parsed = parseDotEnv(fs.readFileSync(filePath, 'utf8'));
    Object.assign(mergedFromFiles, parsed);
    loadedFiles.push(filePath);
  });

  // File priority: .env.{env} > .env (env-specific loaded later and overwrites merged keys).
  Object.entries(mergedFromFiles).forEach(([key, value]) => {
    if (process.env[key] == null) process.env[key] = value;
  });

  return loadedFiles;
}

async function run() {
  const runtimeEnv = normalizeEnvName(process.env.APP_ENV || process.env.NODE_ENV || 'dev');
  const loadedEnvFiles = loadEnvFiles(runtimeEnv);
  const awsProfile = process.env.AWS_PROFILE;
  const secretName = process.env.SECRET_NAME;
  const region = process.env.AWS_REGION;

  console.log('[run-server] start');
  console.log('[run-server] runtimeEnv:', runtimeEnv);
  console.log('[run-server] loaded env files:', loadedEnvFiles);
  console.log('[run-server] AWS_PROFILE:', awsProfile || '(not set)');
  console.log('[run-server] AWS_REGION:', region);
  console.log('[run-server] SECRET_NAME:', secretName || '(not set)');

  const missingRequired = [];
  if (!awsProfile) missingRequired.push('AWS_PROFILE');
  if (!secretName) missingRequired.push('SECRET_NAME');
  if (missingRequired.length > 0) {
    throw new Error(`${missingRequired.join(', ')} is required. Set it in sample/.env and/or sample/.env.{env}`);
  }

  const result = await initRuntimeEnv({
    secretName,
    envName: runtimeEnv,
    region,
    configDir: path.resolve(__dirname, 'config'),
    runtimeConfigEnabled: true
  });

  console.log('[run-server] loaded:', result.loaded);
  console.log('[run-server] errors:', result.errors);

  const selected = {
    APP_NAME: getServerEnv('APP_NAME'),
    LOG_LEVEL: getServerEnv('LOG_LEVEL'),
    API_BASE_URL: getServerEnv('API_BASE_URL'),
    PUBLIC_REGION: getServerEnv('PUBLIC_REGION'),
    SHARED_PRIORITY_KEY: getServerEnv('SHARED_PRIORITY_KEY'),
    SECRET_ONLY_KEY: getServerEnv('SECRET_ONLY_KEY'),
    CORE_SLS_APIKEY: getServerEnv('CORE_SLS_APIKEY'),
    API_KEY: getServerEnv('API_KEY')
  };

  console.log('[run-server] selected env:', selected);
  const runtimePayload = result.runtimeConfig && result.runtimeConfig.handler
    ? result.runtimeConfig.handler()
    : { values: {} };
  const expectedServerKeys = Object.keys(runtimePayload.values || {}).sort();
  const actualServerKeys = getServerEnvKeys().sort();
  assert.deepStrictEqual(actualServerKeys, expectedServerKeys);
  console.log('[run-server] getServerEnvKeys() verified:', actualServerKeys);
  console.log('[run-server] priority check SHARED_PRIORITY_KEY =', selected.SHARED_PRIORITY_KEY);
  console.log('[run-server] done');
}

run().catch((error) => {
  console.error('[run-server] failed:', error);
  process.exit(1);
});
