'use strict';

const { initRuntimeEnv } = require('./init');
const { getServerEnv, getServerEnvKeys } = require('./server');

module.exports = {
  initRuntimeEnv,
  getServerEnv,
  getServerEnvKeys
};
