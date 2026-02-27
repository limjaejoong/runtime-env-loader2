#!/usr/bin/env node
'use strict';

const { spawn } = require('child_process');

function parseBoolean(value, defaultValue) {
  if (value == null || value === '') return defaultValue;
  return ['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase());
}

async function bootstrapRuntimeEnv() {
  const enabled = parseBoolean(process.env.RUNTIME_ENV_ENABLED, true);
  if (!enabled) {
    return;
  }

  const secretName = process.env.RUNTIME_ENV_SECRET_NAME || process.env.SECRET_NAME || undefined;
  const envName = process.env.RUNTIME_ENV_NAME || process.env.APP_ENV || process.env.NODE_ENV || 'local';
  const region =
    process.env.RUNTIME_ENV_REGION || process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION;
  const configDir = process.env.RUNTIME_ENV_CONFIG_DIR || 'config';
  const requireLoaded = parseBoolean(process.env.RUNTIME_ENV_REQUIRE_LOADED, false);
  const runtimeConfigEnabled = parseBoolean(process.env.RUNTIME_ENV_CONFIG_ENABLED, false);
  const requireSecretsManager = parseBoolean(process.env.RUNTIME_ENV_REQUIRE_SECRETS_MANAGER, true);

  const { initRuntimeEnv } = require('../src');
  const result = await initRuntimeEnv({
    secretName,
    envName,
    region,
    configDir,
    runtimeConfigEnabled,
    requireSecretsManager
  });

  if (!result.loaded && requireLoaded) {
    const message = result.errors?.map(error => error.message).join('; ');
    throw new Error(`runtime-env-loader failed: ${message || 'unknown error'}`);
  }
}

function runCommand(args) {
  if (!args.length) {
    console.error('Usage: node scripts/with-runtime-env.js <command> [...args]');
    process.exit(1);
  }

  const child = spawn(args[0], args.slice(1), {
    stdio: 'inherit',
    env: process.env
  });

  child.on('exit', code => {
    process.exit(code == null ? 1 : code);
  });

  child.on('error', error => {
    console.error(error.message);
    process.exit(1);
  });
}

async function main() {
  try {
    await bootstrapRuntimeEnv();
    runCommand(process.argv.slice(2));
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}

main();
