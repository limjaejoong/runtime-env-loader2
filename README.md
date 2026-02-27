# runtime-env-loader

런타임 환경변수를 다음 소스에서 로드합니다.
- 로컬 JSON 파일
- AWS Secrets Manager

로드 후에는 다음을 수행합니다.
- 백엔드용으로 `process.env`에 주입
- 프론트엔드용 공개 설정만 안전하게 노출 (서버에서 키를 명시 선택)

## 설치 (로컬 패키지 사용)

```bash
npm install ../runtime-env-loader
```

## 샘플 실행

이 저장소에는 로컬 확인용 샘플이 포함되어 있습니다.

```bash
npm run sample:server:dev
```

샘플은 `APP_ENV` 기준으로 아래 두 파일을 모두 읽습니다.
- `sample/.env`
- `sample/.env.{env}` (예: `APP_ENV=dev`면 `sample/.env.dev`)

중복 키 우선순위:
- `sample/.env.{env}` > `sample/.env`

`.env`에 아래 값을 넣어 사용합니다.
- `AWS_PROFILE` (필수)
- `AWS_REGION` (선택)
- `SECRET_NAME` (필수)

실행 스크립트:
- `npm run sample:server:dev`
- `npm run sample:server:sqa`
- `npm run sample:server_browser:dev`
- `npm run sample:server_browser:sqa`
- `npm run sample:serverless_browser:dev`
- `npm run sample:serverless_browser:sqa`

로그에서 아래를 확인할 수 있습니다.
- 로드된 `.env` 파일
- `AWS_PROFILE`, `AWS_REGION`, `SECRET_NAME`
- `config -> config-{env} -> secret-manager -> config-local-override` 로드 순서
- 최종 병합 결과(`config-local-override > secret-manager > config-{env} > config`)

백엔드 샘플(`sample/run-server.js`)은 백엔드 로딩/병합을 검증합니다.

프론트 샘플(`sample/run-server_browser.js`)은 아래를 검증합니다.
- 서버에서 `getServerEnv`로 공개 키만 노출
- 클라이언트에서 `loadBrowserEnv()`로 런타임 설정 로드
- 빌드 설정 + 런타임 설정 병합

SPA 샘플(`sample/run-serverless_browser.js`)은 서버 없이 `/runtime-config.json` 엔드포인트를 호출해
정적 배포 시나리오의 `build env + runtime env` 병합(실패 시 fallback)을 검증합니다.

## config 폴더 규칙

`sample/config` 폴더에 아래 파일명을 사용합니다.
- `config.json`: 공통 설정
- `config-dev.json`, `config-sqa.json`, `config-uat.json`, `config-prod.json`: 환경별 설정
- `config-local-override.json`: 로컬 전용 override 설정 (최우선)

## 프로젝트 구조 요약

- `src/index.js`: Node(백엔드) 엔트리
- `src/browser.js`: 브라우저 엔트리 (SPA/클라이언트 안전 API)
- `src/init.js`: 초기화 핵심 로직 (`initRuntimeEnv`, 매핑/주입)
- `src/server.js`: 백엔드 env 조회 유틸 (`getServerEnv`)
- `src/providers.js`: 로컬 파일/AWS Secrets Manager 로더
- `src/public.js`: 클라이언트 로더 유틸

## 동작 흐름 요약

`initRuntimeEnv(options)` 기본 동작:
- `config/config.json` 로드
- `config/config-{env}.json` 로드 (`env`: `dev`, `sqa`, `uat`, `prod`)
- Secrets Manager 로드
- `config/config-local-override.json` 로드
- 병합 우선순위(높음 -> 낮음):
  - `config-local-override.json`
  - `secret-manager`
  - `config-{env}.json`
  - `config.json`
- 로컬 포함 모든 환경에서 Secrets Manager 연동 실패 시 `loaded=false`

## 어디서 사용할 수 있나

- 백엔드(Node 서버): 사용 가능
- 프론트엔드(서버가 있는 구조, 예: Next.js + API Route/Express): 사용 가능
- 서버 없는 React SPA(정적 배포): 시크릿 직접 로드는 불가, 공개 설정 로드 유틸은 사용 가능

정리:
- `initRuntimeEnv`는 서버 전용 API입니다.
- 브라우저에서는 `loadBrowserEnv`로 서버의 공개 설정 엔드포인트를 호출해서 사용합니다.

## API

외부 공개 API (Node 기본 엔트리):
- `initRuntimeEnv`
- `getServerEnv`
- `getServerEnvKeys`

브라우저 엔트리 API:
- `loadBrowserEnv`
- `getBrowserEnv`
- `getBrowserEnvKeys`

엔트리별 사용 방식:

```js
// Node(서버) 기본 엔트리
const {
  initRuntimeEnv,
  getServerEnv,
  getServerEnvKeys
} = require('runtime-env-loader');
```

```js
// Browser 엔트리
import { loadBrowserEnv, getBrowserEnv, getBrowserEnvKeys } from 'runtime-env-loader';
```

주의:
- `loadBrowserEnv`는 브라우저 엔트리 전용입니다.
- Node 기본 엔트리에서는 `loadBrowserEnv`를 제공하지 않습니다.

### `initRuntimeEnv(options)`

환경변수 소스를 로드하고 `process.env`에 주입합니다.

옵션:
- `secretName` string (예: `tac-api/uat`)
- `region` string (선택, 기본값: `ap-northeast-2`)
- `configDir` string (기본값: `path.resolve(__dirname, 'config')`)
- `envName` string (예: `dev`, `sqa`, `uat`, `prod`)
- `runtimeConfigEnabled` boolean (선택, 기본값: `false`)
  - `false`/미지정: handler 미생성
  - `true`: `'/api/runtime-config'` handler 생성 (`initResult.runtimeConfig.handler` 사용 가능)

정책:
- Secrets Manager 연동은 모든 환경(로컬 포함)에서 필수입니다.
- 병합 결과를 `process.env`에 항상 반영합니다.

반환값:
- `{ loaded, errors, runtimeConfig }`

### `getServerEnv(key)`

백엔드에서 사용할 환경변수를 읽어 반환합니다.

인자:
- `key` string (조회할 환경변수 키)

반환:
- `string | null`

### `getServerEnvKeys()`

`initRuntimeEnv`로 로드된 소스 중 `config*`, `secrets-manager`에서 주입된 key 목록을 반환합니다.

반환:
- `string[]`

### `loadBrowserEnv(options)`

브라우저/클라이언트에서 공개 설정 엔드포인트를 호출해 JSON을 받아옵니다.
`{ values, sourceMap }` 형태 응답이면 `sourceMap[key] === 'secrets-manager'` 값은 자동 제외됩니다.

옵션:
- `endpoint` string (기본값: `/api/runtime-config`)
- `requestInit` object (`fetch`의 두 번째 인자)

주의:
- `loadBrowserEnv`는 내부적으로 `globalThis.fetch`를 사용합니다.

### `getBrowserEnv(key)`

`loadBrowserEnv`로 로드된 브라우저 env에서 단일 키를 조회합니다.

인자:
- `key` string

반환:
- `string | null`

### `getBrowserEnvKeys()`

`loadBrowserEnv`로 로드된 브라우저 env의 key 목록을 반환합니다.

반환:
- `string[]`

## 사용 예시

### 1) 서버 (Node / Express)

샘플 파일: `sample/run-server.js`

```js
const {
  initRuntimeEnv,
  getServerEnv,
  getServerEnvKeys
} = require('runtime-env-loader');

await initRuntimeEnv({
  secretName: 'tac-api/uat',
  envName: 'uat',
  configDir: './config'
});

const apiKey = getServerEnv('API_KEY');
const awsRegion = getServerEnv('AWS_REGION');
const envKeys = getServerEnvKeys();
```

### 2) 서버 + 브라우저 (Next.js)

샘플 파일: `sample/run-server_browser.js`

```js
const {
  initRuntimeEnv
} = require('runtime-env-loader');

const initResult = await initRuntimeEnv({
  secretName: 'tac-web/prod',
  runtimeConfigEnabled: true
});
```

브라우저(클라이언트) 쪽:

```js
import { loadBrowserEnv, getBrowserEnv, getBrowserEnvKeys } from 'runtime-env-loader';

const runtimeConfig = await loadBrowserEnv({
  endpoint: '/api/runtime-config'
});
const appName = getBrowserEnv('APP_NAME');
const keys = getBrowserEnvKeys();
```

### 3) 서버 없는 React (정적 배포)

샘플 파일: `sample/run-serverless_browser.js`

```js
import { loadBrowserEnv } from 'runtime-env-loader';

const buildEnv = {
  VITE_APP_NAME: import.meta.env.VITE_APP_NAME
};

let runtimeEnv = {};
try {
  runtimeEnv = await loadBrowserEnv({
    endpoint: '/runtime-config.json'
  });
} catch (_) {
  runtimeEnv = {};
}

const config = Object.assign({}, buildEnv, runtimeEnv);
```

주의:
- SPA에서 AWS Secrets Manager 비밀값을 직접 읽으면 안 됩니다.
- SPA에는 공개 가능한 값만 전달하세요.

## 주의사항

- 로컬 JSON 로드는 `require()` 기반이라 Node require 캐시 영향이 있을 수 있습니다.
