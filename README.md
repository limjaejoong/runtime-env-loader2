# runtime-env-loader

런타임에 환경변수를 로드해 서버 `process.env`에 주입하고, 브라우저에서는 공개된 값만 사용하도록 돕는 라이브러리 입니다.

로드 소스:
- 로컬 JSON (`config/config*.json`)
- AWS Secrets Manager

## 설치

```bash
npm install runtime-env-loader
```

## 동작 요약

`initRuntimeEnv(options)`는 아래 순서로 로드하고, 뒤에서 로드된 값이 앞선 값을 덮어씁니다. 단, `config/config-local-override.json`은 이미 존재하는 키에만 override 됩니다.

1. `config/config.json`
2. `config/config-{env}.json`
3. `secrets-manager`
4. `config/config-local-override.json`

`secrets-manager` 로드 실패 시 `success=false`입니다.

## initRuntimeEnv 사전 조건

- AWS 자격 증명 로딩 방식(`AWS_PROFILE` 등)은 애플리케이션 실행 환경에 따라 다르며, 라이브러리 자체가 강제하지는 않습니다.
- `config` 파일은 샘플 디렉토리에 있습니다. (`config.json`, `config-{env}.json`)

## API

서버 엔트리(`require('runtime-env-loader')`):
- `initRuntimeEnv(options)`
- `getServerEnv(key)`
- `getServerEnvKeys()`

브라우저 엔트리(`import ... from 'runtime-env-loader'`):
- `loadBrowserEnv(options)`
- `getBrowserEnv(key)`
- `getBrowserEnvKeys()`

### initRuntimeEnv(options)

사전 조건:
- 실행 전에 `AWS_PROFILE`, `SECRET_NAME`, `ENV_NAME` 변수가 설정되어 있어야 합니다.
- 샘플은 `.env`를 사용하지만, CI/CD 변수/런타임 주입 등 다른 방식 사용이 가능합니다.
- `configDir`는 기본값이 `process.cwd()/config`이며, 해당 디렉토리/파일이 없어도 Secrets Manager 로드만으로 성공할 수 있습니다.

옵션:
- `secretName` string (필수)
- `envName` string (필수, 예: `dev`, `sqa`)
- `region` string (기본값: `ap-northeast-2`)
- `configDir` string (기본값: `config`)
- `runtimeConfigEnabled` boolean (기본값: `false`)
- `transformEnvKey`
  - 배열 매핑: `[{ org: string, dest: string }]`
  - (옵션, 로드 키명을 변환해서 주입)

반환:
- `success` boolean
- `errors` `{ source, message }[]`
- `runtimeConfig` `null | { path, handler }`

### getServerEnv(key)

설명:
- 서버에서 `process.env` 값을 조회합니다.

인자:
- `key` string

반환:
- `string | null`

### getServerEnvKeys()

설명:
- `initRuntimeEnv`로 로드된 키 중 현재 값이 있는 키 목록을 반환합니다.

반환:
- `string[]`

### loadBrowserEnv(options)

옵션:
- `endpoint` string (기본값: `/api/runtime-config`)
- `publicKeyIncludes` `string | string[]` (기본값: `['PUBLIC']`)

동작:
- 응답이 `{ values, sourceMap }` 형태면 `values`에서 키 이름에 `publicKeyIncludes` 패턴이 포함된 항목만 캐시
- 응답이 일반 JSON 객체면 그대로 캐시
- 서버의 `runtimeConfig.handler()`는 로드된 전체 key/value와 `sourceMap`을 반환하며, 브라우저 쪽 `loadBrowserEnv()`가 그중 필요한 키만 필터링합니다.

반환:
- `Record<string, string> | object`

### getBrowserEnv(key)

설명:
- `loadBrowserEnv`로 캐시된 브라우저 env에서 단일 키를 조회합니다.

인자:
- `key` string

반환:
- `string | null`

### getBrowserEnvKeys()

설명:
- `loadBrowserEnv`로 캐시된 브라우저 env의 키 목록을 반환합니다.

반환:
- `string[]`

## 예시

### 1) 서버

실행:

```bash
npm run sample:server:dev
```

코드:

```js
const { initRuntimeEnv, getServerEnv } = require('runtime-env-loader');

const result = await initRuntimeEnv({
  secretName: process.env.SECRET_NAME,
  envName: 'dev'
});

if (!result.success) throw new Error(JSON.stringify(result.errors));
console.log(getServerEnv('API_BASE_URL'));
```

### 2) 서버 + 브라우저

실행:

```bash
npm run sample:server_browser:dev
```

서버 코드:

```js
const { initRuntimeEnv } = require('runtime-env-loader');

const initResult = await initRuntimeEnv({
  secretName: process.env.SECRET_NAME,
  envName: 'dev',
  runtimeConfigEnabled: true
});
```

브라우저 코드:

```js
import { loadBrowserEnv, getBrowserEnv } from 'runtime-env-loader';

await loadBrowserEnv();
console.log(getBrowserEnv('NEXT_PUBLIC_FEATURE_X'));
```

### 3) 서버리스 + 브라우저 (UI 정적 빌드/Nginx)

서버 코드:

```js
const { initRuntimeEnv } = require('runtime-env-loader');

const initResult = await initRuntimeEnv({
  secretName: process.env.SECRET_NAME,
  envName: 'dev',
  runtimeConfigEnabled: true
});
```

설치 후 UI 프로젝트에서 실행 스크립트 예시:

```json
{
  "scripts": {
    "start:local": "env-cmd ./config/.env.localhost cross-env NODE_ENV=development with-runtime-env npm run start"
  }
}
```

실서비스 브라우저 코드 예시:

```js
import { loadBrowserEnv } from 'runtime-env-loader';

await loadBrowserEnv({
  endpoint: '/runtime-config.json',
  publicKeyIncludes: ['PUBLIC', 'NEXT_PUBLIC']
});
```
