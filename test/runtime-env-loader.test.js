'use strict';

const assert = require('assert');
const path = require('path');
const { applyRawEnv } = require('../src/init');
const {
  initRuntimeEnv,
  getServerEnv,
  getServerEnvKeys
} = require('../src');
const { loadBrowserEnv, getBrowserEnv, getBrowserEnvKeys } = require('../src/browser');

async function run() {
  const beforeFoo = process.env.FOO;

  const rawKeys = applyRawEnv({ FOO: 'BAR' }, { overwrite: true });
  assert.deepStrictEqual(rawKeys, ['FOO']);
  assert.strictEqual(process.env.FOO, 'BAR');

  const beforeSelectedKeys = {
    NEXT_PUBLIC_APP_NAME: process.env.NEXT_PUBLIC_APP_NAME,
    PUBLIC_REGION: process.env.PUBLIC_REGION,
    CUSTOM_PUBLIC_FLAG: process.env.CUSTOM_PUBLIC_FLAG,
    APP_NAME: process.env.APP_NAME
  };
  process.env.NEXT_PUBLIC_APP_NAME = 'web';
  process.env.PUBLIC_REGION = 'apne2';
  process.env.CUSTOM_PUBLIC_FLAG = 'yes';
  process.env.APP_NAME = 'portal';

  const selectedPublic = {
    NEXT_PUBLIC_APP_NAME: getServerEnv('NEXT_PUBLIC_APP_NAME'),
    PUBLIC_REGION: getServerEnv('PUBLIC_REGION'),
    CUSTOM_PUBLIC_FLAG: getServerEnv('CUSTOM_PUBLIC_FLAG')
  };
  assert.deepStrictEqual(selectedPublic, {
    NEXT_PUBLIC_APP_NAME: 'web',
    PUBLIC_REGION: 'apne2',
    CUSTOM_PUBLIC_FLAG: 'yes'
  });

  process.env.PUBLIC_REGION = 'local-region';
  const selectedWithoutSecrets = {
    PUBLIC_REGION: getServerEnv('PUBLIC_REGION'),
    APP_NAME: getServerEnv('APP_NAME')
  };
  assert.deepStrictEqual(selectedWithoutSecrets, {
    PUBLIC_REGION: 'local-region',
    APP_NAME: 'portal'
  });

  assert.ok(!getServerEnvKeys().includes('APP_NAME'));

  const beforeRuntimeKeys = {
    TEST_COMMON_KEY: process.env.TEST_COMMON_KEY,
    TEST_LOG_LEVEL: process.env.TEST_LOG_LEVEL,
    TEST_ENV_KEY: process.env.TEST_ENV_KEY
  };
  const runtimeInitWithoutSecrets = await initRuntimeEnv({
    envName: 'dev',
    configDir: path.resolve(__dirname, '../sample/config'),
    requireSecretsManager: false
  });
  assert.strictEqual(runtimeInitWithoutSecrets.loaded, true);
  assert.strictEqual(getServerEnv('TEST_COMMON_KEY'), 'runtime-env-loader-sample');
  assert.strictEqual(getServerEnv('TEST_LOG_LEVEL'), 'trace');
  assert.strictEqual(getServerEnv('TEST_ENV_KEY'), 'https://api-local.example.com');

  const beforeFetch = globalThis.fetch;
  globalThis.fetch = async () => ({
    ok: true,
    status: 200,
    json: async () => ({
      values: {
        NEXT_PUBLIC_FEATURE_X: 'on',
        PUBLIC_REGION: 'local-region',
        APP_NAME: 'portal'
      },
      sourceMap: {
        NEXT_PUBLIC_FEATURE_X: 'secrets-manager',
        PUBLIC_REGION: 'config-local-override',
        APP_NAME: 'config'
      }
    })
  });
  const loadedRuntime = await loadBrowserEnv({
    endpoint: '/api/runtime-config'
  });
  if (beforeFetch == null) delete globalThis.fetch;
  else globalThis.fetch = beforeFetch;

  assert.deepStrictEqual(loadedRuntime, {
    NEXT_PUBLIC_FEATURE_X: 'on',
    PUBLIC_REGION: 'local-region'
  });
  assert.strictEqual(getBrowserEnv('APP_NAME'), null);
  assert.ok(getBrowserEnvKeys().includes('PUBLIC_REGION'));

  const beforeFetch2 = globalThis.fetch;
  globalThis.fetch = async () => ({
    ok: true,
    status: 200,
    json: async () => ({
      values: {
        NEXT_PUBLIC_FEATURE_X: 'on',
        PUBLIC_REGION: 'local-region',
        APP_NAME: 'portal',
        CLIENT_FLAG: 'client-visible',
        SECRET_KEY: 'hidden'
      },
      sourceMap: {
        NEXT_PUBLIC_FEATURE_X: 'secrets-manager',
        PUBLIC_REGION: 'config-local-override',
        APP_NAME: 'config',
        CLIENT_FLAG: 'secrets-manager',
        SECRET_KEY: 'secrets-manager'
      }
    })
  });
  const loadedRuntimeWithPublicSecrets = await loadBrowserEnv({
    endpoint: '/api/runtime-config',
    publicKeyIncludes: ['PUBLIC', 'CLIENT_']
  });
  if (beforeFetch2 == null) delete globalThis.fetch;
  else globalThis.fetch = beforeFetch2;

  assert.deepStrictEqual(loadedRuntimeWithPublicSecrets, {
    NEXT_PUBLIC_FEATURE_X: 'on',
    PUBLIC_REGION: 'local-region',
    CLIENT_FLAG: 'client-visible'
  });
  assert.strictEqual(getBrowserEnv('NEXT_PUBLIC_FEATURE_X'), 'on');
  assert.strictEqual(getBrowserEnv('CLIENT_FLAG'), 'client-visible');
  assert.strictEqual(getBrowserEnv('SECRET_KEY'), null);

  if (beforeFoo == null) delete process.env.FOO;
  else process.env.FOO = beforeFoo;
  if (beforeSelectedKeys.NEXT_PUBLIC_APP_NAME == null) delete process.env.NEXT_PUBLIC_APP_NAME;
  else process.env.NEXT_PUBLIC_APP_NAME = beforeSelectedKeys.NEXT_PUBLIC_APP_NAME;
  if (beforeSelectedKeys.PUBLIC_REGION == null) delete process.env.PUBLIC_REGION;
  else process.env.PUBLIC_REGION = beforeSelectedKeys.PUBLIC_REGION;
  if (beforeSelectedKeys.CUSTOM_PUBLIC_FLAG == null) delete process.env.CUSTOM_PUBLIC_FLAG;
  else process.env.CUSTOM_PUBLIC_FLAG = beforeSelectedKeys.CUSTOM_PUBLIC_FLAG;
  if (beforeSelectedKeys.APP_NAME == null) delete process.env.APP_NAME;
  else process.env.APP_NAME = beforeSelectedKeys.APP_NAME;
  if (beforeRuntimeKeys.TEST_COMMON_KEY == null) delete process.env.TEST_COMMON_KEY;
  else process.env.TEST_COMMON_KEY = beforeRuntimeKeys.TEST_COMMON_KEY;
  if (beforeRuntimeKeys.TEST_LOG_LEVEL == null) delete process.env.TEST_LOG_LEVEL;
  else process.env.TEST_LOG_LEVEL = beforeRuntimeKeys.TEST_LOG_LEVEL;
  if (beforeRuntimeKeys.TEST_ENV_KEY == null) delete process.env.TEST_ENV_KEY;
  else process.env.TEST_ENV_KEY = beforeRuntimeKeys.TEST_ENV_KEY;

  console.log('runtime-env-loader tests passed');
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
