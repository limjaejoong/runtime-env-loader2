'use strict';

const assert = require('assert');
const path = require('path');
const {
  applyRawEnv,
  applyMappedEnv,
  getPublicEnv,
  initSecretsEnv
} = require('../src');

async function run() {
  const beforeFoo = process.env.FOO;
  const beforeMapped = process.env.API_KEY;

  const rawKeys = applyRawEnv({ FOO: 'BAR' }, { overwrite: true });
  assert.deepStrictEqual(rawKeys, ['FOO']);
  assert.strictEqual(process.env.FOO, 'BAR');

  const mappedKeys = applyMappedEnv({ CORE_SLS_APIKEY: 'ABC' }, { overwrite: true });
  assert.deepStrictEqual(mappedKeys, ['API_KEY']);
  assert.strictEqual(process.env.API_KEY, 'ABC');

  const publicEnv = getPublicEnv({
    source: {
      NEXT_PUBLIC_APP_NAME: 'web',
      PUBLIC_REGION: 'apne2',
      PRIVATE_KEY: 'hidden',
      CUSTOM_PUBLIC_FLAG: 'no'
    },
    allowlist: ['CUSTOM_PUBLIC_FLAG']
  });
  assert.deepStrictEqual(publicEnv, {
    NEXT_PUBLIC_APP_NAME: 'web',
    PUBLIC_REGION: 'apne2',
    CUSTOM_PUBLIC_FLAG: 'no'
  });

  const initResult = await initSecretsEnv({
    preferLocalFile: true,
    localFilePath: path.resolve(__dirname, 'fixtures', 'sample-secret.json'),
    overwrite: true,
    requireSecretsManager: false
  });
  assert.strictEqual(initResult.loaded, true);
  assert.strictEqual(initResult.loadedFrom, 'local-file');
  assert.strictEqual(process.env.CORE_SLS_APIKEY, 'fixture-core-key');
  assert.strictEqual(process.env.API_KEY, 'fixture-core-key');

  const requiredFailure = await initSecretsEnv({
    preferLocalFile: true,
    localFilePath: path.resolve(__dirname, 'fixtures', 'sample-secret.json')
  });
  assert.strictEqual(requiredFailure.loaded, false);
  assert.ok(Array.isArray(requiredFailure.errors) && requiredFailure.errors.length > 0);

  // local-first + secret-manager-missing-only
  process.env.LOCAL_ONLY = 'local-value';
  process.env.SHARED_KEY = 'from-local';
  const merged = await initSecretsEnv({
    preferLocalFile: true,
    localFilePath: path.resolve(__dirname, 'fixtures', 'sample-secret.json'),
    secretName: 'dummy/secret',
    useSecretsManager: true,
    managerClient: {
      send: async () => ({
        SecretString: JSON.stringify({
          SHARED_KEY: 'from-secret',
          SECRET_ONLY: 'secret-value'
        })
      })
    }
  });
  assert.strictEqual(merged.loaded, true);
  assert.ok(merged.loadedSources.includes('local-file'));
  assert.ok(merged.loadedSources.includes('secrets-manager'));
  assert.strictEqual(process.env.SHARED_KEY, 'from-local');
  assert.strictEqual(process.env.SECRET_ONLY, 'secret-value');

  // restore
  if (beforeFoo == null) delete process.env.FOO;
  else process.env.FOO = beforeFoo;
  if (beforeMapped == null) delete process.env.API_KEY;
  else process.env.API_KEY = beforeMapped;

  console.log('secrets-env-loader tests passed');
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
