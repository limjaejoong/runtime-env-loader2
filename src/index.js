'use strict';

const {
  initSecretsEnv,
  applyRawEnv,
  applyMappedEnv,
  DEFAULT_SECRET_ENV_MAP
} = require('./init');
const { getPublicEnv, createPublicEnvHandler } = require('./public');
const { loadFromLocalFile, loadFromSecretsManager } = require('./providers');

module.exports = {
  initSecretsEnv,
  applyRawEnv,
  applyMappedEnv,
  DEFAULT_SECRET_ENV_MAP,
  getPublicEnv,
  createPublicEnvHandler,
  loadFromLocalFile,
  loadFromSecretsManager
};
