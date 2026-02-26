'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const {
  initRuntimeEnv,
  getServerEnv
} = require('../src');
const { loadBrowserEnv, getBrowserEnv, getBrowserEnvKeys } = require('../src/browser');

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
  const awsProfile = process.env.AWS_PROFILE;
  const secretName = process.env.SECRET_NAME;
  const region = process.env.AWS_REGION;

  console.log('[run-server_browser] start');
  console.log('[run-server_browser] runtimeEnv:', runtimeEnv);
  console.log('[run-server_browser] loaded env files:', loadedEnvFiles);
  console.log('[run-server_browser] AWS_PROFILE:', awsProfile || '(not set)');
  console.log('[run-server_browser] SECRET_NAME:', secretName || '(not set)');

  const missingRequired = [];
  if (!awsProfile) missingRequired.push('AWS_PROFILE');
  if (!secretName) missingRequired.push('SECRET_NAME');
  if (missingRequired.length > 0) {
    throw new Error(`${missingRequired.join(', ')} is required. Set it in sample/.env and/or sample/.env.{env}`);
  }

  const initResult = await initRuntimeEnv({
    secretName,
    region,
    envName: runtimeEnv,
    configDir: path.resolve(__dirname, 'config'),
    runtimeConfigEnabled: true
  });

  if (!initResult.loaded) {
    throw new Error(`initRuntimeEnv failed: ${JSON.stringify(initResult.errors)}`);
  }

  const runtimePayload = initResult.runtimeConfig.handler();
  const runtimePublic = await loadBrowserEnv({
    endpoint: '/api/runtime-config',
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      json: async () => runtimePayload
    })
  });
  const buildPublic = {
    NEXT_PUBLIC_BUILD_MODE: runtimeEnv
  };
  const merged = Object.assign({}, buildPublic, runtimePublic);
  const browserKeys = getBrowserEnvKeys().sort();
  const expectedPublicKeys = Object.keys(runtimePublic).sort();
  assert.deepStrictEqual(browserKeys, expectedPublicKeys);

  Object.entries(runtimePayload.sourceMap || {}).forEach(([key, sourceName]) => {
    if (sourceName === 'secrets-manager') {
      assert.ok(!browserKeys.includes(key), `secrets-manager key leaked to browser keys: ${key}`);
    }
  });

  console.log('[run-server_browser] runtimePublic:', runtimePublic);
  console.log('[run-server_browser] server raw NEXT_PUBLIC_FEATURE_X:', getServerEnv('NEXT_PUBLIC_FEATURE_X'));
  console.log('[run-server_browser] getBrowserEnv(APP_NAME):', getBrowserEnv('APP_NAME'));
  console.log('[run-server_browser] getBrowserEnvKeys() verified:', browserKeys);
  console.log('[run-server_browser] mergedPublic:', merged);

  console.log('[run-server_browser] done');
}

run().catch((error) => {
  console.error('[run-server_browser] failed:', error);
  process.exit(1);
});
