'use strict';

const fs = require('fs');
const path = require('path');
const {
  initSecretsEnv,
  getPublicEnv,
  loadPublicEnv,
  mergePublicEnv
} = require('../src');
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

  Object.entries(mergedFromFiles).forEach(([key, value]) => {
    if (process.env[key] == null) process.env[key] = value;
  });

  return loadedFiles;
}

async function run() {
  const runtimeEnv = normalizeEnvName(process.env.APP_ENV || process.env.NODE_ENV || 'dev');
  const loadedEnvFiles = loadEnvFiles(runtimeEnv);
  const useMock = process.env.SAMPLE_USE_MOCK !== 'false';
  const awsProfile = process.env.AWS_PROFILE;
  const secretName = process.env.SECRET_NAME;
  const region = process.env.AWS_REGION || DEFAULT_AWS_REGION;

  console.log('[frontend-sample] start');
  console.log('[frontend-sample] runtimeEnv:', runtimeEnv);
  console.log('[frontend-sample] loaded env files:', loadedEnvFiles);
  console.log('[frontend-sample] AWS_PROFILE:', awsProfile || '(not set)');
  console.log('[frontend-sample] SECRET_NAME:', secretName || '(not set)');

  if (!awsProfile) throw new Error('AWS_PROFILE is required. Set it in sample/.env and/or sample/.env.{env}');
  if (!secretName) throw new Error('SECRET_NAME is required. Set it in sample/.env and/or sample/.env.{env}');

  const managerClient = useMock
    ? {
      send: async () => ({
        SecretString: JSON.stringify({
          PUBLIC_REGION: 'secret-region',
          NEXT_PUBLIC_FEATURE_X: 'on',
          PRIVATE_SECRET_KEY: 'hidden-secret'
        })
      })
    }
    : undefined;

  const initResult = await initSecretsEnv({
    secretName,
    region,
    envName: runtimeEnv,
    configDir: path.resolve(__dirname, 'config'),
    overwrite: true,
    managerClient
  });

  if (!initResult.loaded) {
    throw new Error(`initSecretsEnv failed: ${JSON.stringify(initResult.errors)}`);
  }

  const runtimePublic = await loadPublicEnv({
    endpoint: '/api/runtime-config',
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      json: async () => getPublicEnv({
        source: process.env,
        allowlist: ['PUBLIC_REGION', 'APP_NAME'],
        prefixes: ['NEXT_PUBLIC_', 'PUBLIC_']
      })
    })
  });
  const buildPublic = {
    NEXT_PUBLIC_BUILD_MODE: runtimeEnv
  };
  const merged = mergePublicEnv(buildPublic, runtimePublic);

  console.log('[frontend-sample] runtimePublic:', runtimePublic);
  console.log('[frontend-sample] mergedPublic:', merged);

  console.log('[frontend-sample] done');
}

run().catch((error) => {
  console.error('[frontend-sample] failed:', error);
  process.exit(1);
});
