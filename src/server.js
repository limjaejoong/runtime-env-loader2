'use strict';

function getServerEnv(options = {}) {
  const {
    source = process.env,
    keys,
    required = [],
    defaults = {}
  } = options;

  const result = {};
  const targetKeys = Array.isArray(keys) && keys.length > 0
    ? keys
    : Object.keys(source || {});

  targetKeys.forEach((key) => {
    if (!key) return;
    const value = source && source[key] != null ? source[key] : defaults[key];
    if (value == null) return;
    result[key] = String(value);
  });

  const missingRequired = required.filter((key) => {
    const value = source && source[key] != null ? source[key] : defaults[key];
    return value == null;
  });

  if (missingRequired.length > 0) {
    throw new Error(`Missing required server env keys: ${missingRequired.join(', ')}`);
  }

  return result;
}

module.exports = {
  getServerEnv
};
