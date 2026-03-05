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
  const secretName =
    process.env.SERVICE_NAME && process.env.APP_ENV
      ? `${process.env.SERVICE_NAME}/${process.env.APP_ENV}`
      : undefined;
  const region = process.env.AWS_REGION;
  const runtimeConfigEnabled = false;

  console.log('[run-server] start');
  console.log('[run-server] runtimeEnv:', runtimeEnv);
  console.log('[run-server] loaded env files:', loadedEnvFiles);
  console.log('[run-server] AWS_PROFILE:', awsProfile || '(not set)');
  console.log('[run-server] AWS_REGION:', region);
  console.log('[run-server] SERVICE_NAME:', process.env.SERVICE_NAME || '(not set)');
  console.log('[run-server] secretName(SERVICE_NAME/APP_ENV):', secretName || '(not set)');

  const missingRequired = [];
  if (!awsProfile) missingRequired.push('AWS_PROFILE');
  if (!process.env.SERVICE_NAME) missingRequired.push('SERVICE_NAME');
  if (!process.env.APP_ENV) missingRequired.push('APP_ENV');
  if (missingRequired.length > 0) {
    throw new Error(`${missingRequired.join(', ')} is required. Set it in sample/.env and/or sample/.env.{env}`);
  }

  const result = await initRuntimeEnv({
    secretName,
    envName: runtimeEnv,
    region,
    configDir: path.resolve(__dirname, 'config'),
    runtimeConfigEnabled
  });

  console.log('[run-server] success:', result.success);
  console.log('[run-server] errors:', result.errors);

  const selected = {
    TEST_COMMON_KEY: getServerEnv('TEST_COMMON_KEY'),
    TEST_LOG_LEVEL: getServerEnv('TEST_LOG_LEVEL'),
    TEST_ENV_KEY: getServerEnv('TEST_ENV_KEY'),
    TEST_LOCAL_ONLY_FLAG: getServerEnv('TEST_LOCAL_ONLY_FLAG'),
    REACT_APP_SKILL_ID: getServerEnv('REACT_APP_SKILL_ID'),
    REACT_APP_GA4_TRACKING_ID: getServerEnv('REACT_APP_GA4_TRACKING_ID'),
    REACT_APP_ENVIORNMENT: getServerEnv('REACT_APP_ENVIORNMENT'),
    REACT_APP_TWILIO_TASK_NAME: getServerEnv('REACT_APP_TWILIO_TASK_NAME')
  };

  const actualServerKeys = getServerEnvKeys().sort();
  if (runtimeConfigEnabled) {
    const runtimePayload = result.runtimeConfig && result.runtimeConfig.handler
      ? result.runtimeConfig.handler()
      : { values: {} };
    const expectedServerKeys = Object.keys(runtimePayload.values || {}).sort();
    assert.deepStrictEqual(actualServerKeys, expectedServerKeys);
  } else {
    assert.ok(actualServerKeys.includes('TEST_COMMON_KEY'));
    assert.ok(actualServerKeys.includes('TEST_LOG_LEVEL'));
    assert.ok(actualServerKeys.includes('TEST_ENV_KEY'));
  }
  console.log('[run-server] getServerEnvKeys() verified:', actualServerKeys);
  console.log('[run-server] selected env:', selected);
  console.log('[run-server] done');
}

run().catch((error) => {
  console.error('[run-server] failed:', error);
  process.exit(1);
});
