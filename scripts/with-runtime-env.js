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

  const secretName = process.env.SECRET_NAME || undefined;
  const envName = process.env.APP_ENV || undefined;
  const runtimeConfigEnabled = parseBoolean(process.env.RUNTIME_ENV_CONFIG_ENABLED, false);
  const requireSecretsManager = parseBoolean(process.env.RUNTIME_ENV_REQUIRE_LOADED, true);
  const runtimeEnvDebug = parseBoolean(process.env.RUNTIME_ENV_DEBUG, false);

  const { initRuntimeEnv } = require('../src');
  const result = await initRuntimeEnv({
    secretName,
    envName,
    runtimeConfigEnabled: runtimeConfigEnabled,
    requireSecretsManager: requireSecretsManager,
    debug: runtimeEnvDebug
  });

  if (!result.loaded) {
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
