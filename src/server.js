'use strict';

let trackedServerEnvKeys = [];

function shouldTrackSource(sourceName) {
  if (!sourceName || typeof sourceName !== 'string') return false;
  return sourceName.startsWith('config') || sourceName === 'secrets-manager';
}

function setTrackedServerEnvKeys(sourceMap = {}) {
  if (!sourceMap || typeof sourceMap !== 'object') {
    trackedServerEnvKeys = [];
    return;
  }

  trackedServerEnvKeys = Object.keys(sourceMap).filter((key) => shouldTrackSource(sourceMap[key]));
}

function getTrackedServerEnvKeys() {
  return trackedServerEnvKeys.slice();
}

function getServerEnv(key) {
  if (!key || typeof key !== 'string') return null;
  const value = process.env && process.env[key] != null ? process.env[key] : null;
  if (value == null) return null;
  return String(value);
}

function getServerEnvKeys() {
  return getTrackedServerEnvKeys().filter((key) => process.env[key] != null);
}

module.exports = {
  getServerEnv,
  getServerEnvKeys,
  setTrackedServerEnvKeys
};
