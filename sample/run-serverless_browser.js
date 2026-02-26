'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { loadBrowserEnv, getBrowserEnv, getBrowserEnvKeys } = require('../src/browser');

async function run() {
  const endpoint = '/runtime-config.json';
  const runtimeConfigPath = path.resolve(__dirname, 'runtime-config.json');

  console.log('[run-serverless_browser] start');
  console.log('[run-serverless_browser] endpoint:', endpoint);
  console.log('[run-serverless_browser] runtime config path:', runtimeConfigPath);

  const buildEnv = {
    VITE_APP_NAME: process.env.VITE_APP_NAME || 'spa-build-default'
  };

  let runtimeEnv = {};
  try {
    runtimeEnv = await loadBrowserEnv({
      endpoint,
      fetchImpl: async (url) => {
        const normalized = String(url || '').replace(/^\//, '');
        const filePath = path.resolve(__dirname, normalized);
        if (!fs.existsSync(filePath)) {
          return {
            ok: false,
            status: 404,
            json: async () => ({})
          };
        }
        const text = fs.readFileSync(filePath, 'utf8');
        return {
          ok: true,
          status: 200,
          json: async () => JSON.parse(text)
        };
      }
    });
  } catch (error) {
    console.log('[run-serverless_browser] runtime config load failed:', error.message);
    runtimeEnv = {};
  }

  const config = Object.assign({}, buildEnv, runtimeEnv);
  const browserKeys = getBrowserEnvKeys().sort();
  const expectedKeys = Object.keys(runtimeEnv).sort();
  assert.deepStrictEqual(browserKeys, expectedKeys);

  console.log('[run-serverless_browser] buildEnv:', buildEnv);
  console.log('[run-serverless_browser] runtimeEnv:', runtimeEnv);
  console.log('[run-serverless_browser] getBrowserEnv(APP_NAME):', getBrowserEnv('APP_NAME'));
  console.log('[run-serverless_browser] getBrowserEnvKeys() verified:', browserKeys);
  console.log('[run-serverless_browser] merged config:', config);
  console.log('[run-serverless_browser] done');
}

run().catch((error) => {
  console.error('[run-serverless_browser] failed:', error);
  process.exit(1);
});
