'use strict';

function loadFromLocalFile(localFilePath) {
  if (!localFilePath) return null;
  const fs = require('fs');
  const path = require('path');

  const resolved = path.resolve(localFilePath);
  if (!fs.existsSync(resolved)) return null;

  // Use require for JSON to keep implementation simple in CommonJS.
  // eslint-disable-next-line global-require, import/no-dynamic-require
  return require(resolved);
}

async function loadFromSecretsManager(options = {}) {
  const {
    secretName,
    region
  } = options;
  const resolvedRegion = region;

  if (!secretName) {
    throw new Error('secretName is required to load from Secrets Manager');
  }
  const { SecretsManagerClient, GetSecretValueCommand } = require('@aws-sdk/client-secrets-manager');
  const secretsClient = new SecretsManagerClient({ region: resolvedRegion });
  const commandPayload = new GetSecretValueCommand({ SecretId: secretName });

  try {
    const response = await secretsClient.send(commandPayload);

    if (!response) return null;
    if (response.SecretString) {
      try {
        return JSON.parse(response.SecretString);
      } catch (parseError) {
        throw new Error(`SecretString JSON parse failed: ${parseError.message}`);
      }
    }

    if (response.SecretBinary) {
      const decodedBinarySecret = Buffer.from(response.SecretBinary).toString('utf-8');
      try {
        return JSON.parse(decodedBinarySecret);
      } catch (parseError) {
        throw new Error(`SecretBinary JSON parse failed: ${parseError.message}`);
      }
    }

    return null;
  } catch (error) {
    throw new Error(
      `Failed to load secret from Secrets Manager (secretName=${secretName}, region=${resolvedRegion}): ${error.message}`
    );
  }
}

module.exports = {
  loadFromLocalFile,
  loadFromSecretsManager
};
