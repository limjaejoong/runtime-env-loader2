'use strict';

const assert = require('assert');
const { applyRawEnv } = require('../src/init');
const {
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

  const loadedRuntime = await loadBrowserEnv({
    endpoint: '/api/runtime-config',
    fetchImpl: async () => ({
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
    })
  });

  assert.deepStrictEqual(loadedRuntime, {
    PUBLIC_REGION: 'local-region',
    APP_NAME: 'portal'
  });
  assert.strictEqual(getBrowserEnv('APP_NAME'), 'portal');
  assert.ok(getBrowserEnvKeys().includes('PUBLIC_REGION'));

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

  console.log('secrets-env-loader tests passed');
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
