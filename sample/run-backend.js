'use strict';

const fs = require('fs');
const path = require('path');
const { initSecretsEnv, getServerEnv } = require('../src');
const DEFAULT_AWS_REGION = 'ap-northeast-2';

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
  const useMock = process.env.SAMPLE_USE_MOCK === 'true';
  const awsProfile = process.env.AWS_PROFILE;
  const secretName = process.env.SECRET_NAME;
  const region = process.env.AWS_REGION || DEFAULT_AWS_REGION;

  console.log('[sample] start');
  console.log('[sample] runtimeEnv:', runtimeEnv);
  console.log('[sample] loaded env files:', loadedEnvFiles);
  console.log('[sample] AWS_PROFILE:', awsProfile || '(not set)');
  console.log('[sample] AWS_REGION:', region);
  console.log('[sample] SECRET_NAME:', secretName || '(not set)');
  console.log('[sample] SAMPLE_USE_MOCK:', useMock);

  if (!awsProfile) throw new Error('AWS_PROFILE is required. Set it in sample/.env and/or sample/.env.{env}');
  if (!secretName) throw new Error('SECRET_NAME is required. Set it in sample/.env and/or sample/.env.{env}');

  const managerClient = useMock
    ? {
      send: async () => ({
        SecretString: JSON.stringify({
          SHARED_PRIORITY_KEY: 'from-secret',
          API_BASE_URL: 'https://api-secret.example.com',
          SECRET_ONLY_KEY: 'secret-only',
          CORE_SLS_APIKEY: 'sample-core-secret-key'
        })
      })
    }
    : undefined;

  const result = await initSecretsEnv({
    secretName,
    region,
    envName: runtimeEnv,
    configDir: path.resolve(__dirname, 'config'),
    overwrite: true,
    managerClient
  });

  console.log('[sample] loaded:', result.loaded);
  console.log('[sample] loadedSources:', result.loadedSources.join(' -> '));
  console.log('[sample] runtimeEnv:', result.runtimeEnv);
  console.log('[sample] errors:', result.errors);

  const selected = getServerEnv({
    keys: [
      'APP_NAME',
      'LOG_LEVEL',
      'API_BASE_URL',
      'PUBLIC_REGION',
      'SHARED_PRIORITY_KEY',
      'SECRET_ONLY_KEY',
      'CORE_SLS_APIKEY',
      'API_KEY'
    ],
    required: ['APP_NAME', 'API_BASE_URL', 'SHARED_PRIORITY_KEY', 'SECRET_ONLY_KEY', 'API_KEY']
  });

  console.log('[sample] selected env:', selected);
  console.log('[sample] priority check SHARED_PRIORITY_KEY =', selected.SHARED_PRIORITY_KEY);
  console.log('[sample] done');
}

run().catch((error) => {
  console.error('[sample] failed:', error);
  process.exit(1);
});
