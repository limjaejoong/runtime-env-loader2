# secrets-env-loader

Load runtime environment values from:
- local JSON file
- AWS Secrets Manager

Then:
- inject into `process.env` for backend
- expose safe public config for frontend (`NEXT_PUBLIC_*` + allowlist)

## Install (local package usage)

```bash
npm install ../secrets-env-loader
```

## API

### `initSecretsEnv(options)`

Loads env source and injects into `process.env`.

Default behavior:
- load local file first (if exists)
- then check Secrets Manager
- add only missing keys from Secrets Manager (does not overwrite local/env values)
- Secrets Manager load is required by default

Options:
- `secretName` string (ex: `tac-api/uat`)
- `region` string
- `localFilePath` string
- `preferLocalFile` boolean (default: `true`)
- `overwrite` boolean (default: `false`)
- `useSecretsManager` boolean (default: `true`)
- `requireSecretsManager` boolean (default: `true`)
- `secretEnvMap` object
- `managerClient` AWS SecretsManager client (for testing/customization)

Returns:
- `{ loaded, loadedFrom, injectedKeys, mappedKeys, source, errors }`

### `getPublicEnv(options)`

Returns only public env values.

Options:
- `source` object (default: `process.env`)
- `prefixes` string[] (default: `['NEXT_PUBLIC_', 'PUBLIC_']`)
- `prefix` string (legacy compatibility; used when `prefixes` is not set)
- `allowlist` string[]

### `createPublicEnvHandler(options)`

Express handler that returns `getPublicEnv(options)` as JSON.

## Example (Node / API server)

```js
const { initSecretsEnv } = require('secrets-env-loader');

await initSecretsEnv({
  secretName: 'tac-api/uat',
  localFilePath: './infrastructure/config.development.json',
  preferLocalFile: true
});
```

## Example (Express public config endpoint)

```js
const { createPublicEnvHandler } = require('secrets-env-loader');

app.get('/api/runtime-config', createPublicEnvHandler({
  allowlist: ['PUBLIC_REGION']
}));
```
