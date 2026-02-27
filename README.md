# runtime-env-loader

런타임 환경변수를 로드해 서버 `process.env`에 주입하고, 브라우저에는 공개 가능한 값만 노출하는 라이브러리 입니다.

로드 소스:
- 로컬 JSON (`config*.json`)
- AWS Secrets Manager

## 설치

```bash
npm install runtime-env-loader
```

## 동작 요약

`initRuntimeEnv(options)` 순서:
1. `config/config.json`
2. `config/config-{env}.json`
3. `secrets-manager`
4. `config/config-local-override.json` (기존에 이미 있는 키에만 override)

우선순위(높음 → 낮음):
- `config-local-override`
- `secrets-manager`
- `config-{env}`
- `config`

`requireSecretsManager=true`일 때 `secrets-manager` 로드 실패 시 `loaded=false`입니다.

## initRuntimeEnv 사전 조건

- 기본 모드(`requireSecretsManager=true`)에서는 `AWS_PROFILE`, `SECRET_NAME`이 필요합니다.
- 로컬 테스트처럼 Secrets Manager를 생략하려면 `requireSecretsManager=false`를 사용합니다.
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
- 기본 모드(`requireSecretsManager=true`)에서는 실행 전에 `AWS_PROFILE`, `SECRET_NAME`이 설정되어 있어야 합니다.
- 샘플은 `.env`를 사용하지만, CI/CD 변수/런타임 주입 등 다른 방식 사용이 가능합니다.
- `configDir`가 가리키는 `config` 디렉토리는 필수입니다.

옵션:
- `secretName` string (`requireSecretsManager=true`일 때 필수)
- `envName` string (필수, 예: `dev`, `sqa`)
- `region` string (기본값: `ap-northeast-2`)
- `configDir` string (기본값: `config`)
- `runtimeConfigEnabled` boolean (기본값: `false`)
- `requireSecretsManager` boolean (기본값: `true`)

반환:
- `loaded` boolean
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

if (!result.loaded) throw new Error(JSON.stringify(result.errors));
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
console.log(getBrowserEnv('APP_NAME'));
```

### 3) 서버리스 + 브라우저 (UI 정적 빌드/Nginx)

샘플 브라우저 코드:

```js
import { loadBrowserEnv } from 'runtime-env-loader';

const runtimeEnv = await loadBrowserEnv({
  endpoint: '/runtime-config.json'
});
console.log(runtimeEnv);
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
