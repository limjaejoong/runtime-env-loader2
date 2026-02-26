# secrets-env-loader

런타임 환경변수를 다음 소스에서 로드합니다.
- 로컬 JSON 파일
- AWS Secrets Manager

로드 후에는 다음을 수행합니다.
- 백엔드용으로 `process.env`에 주입
- 프론트엔드용 공개 설정만 안전하게 노출 (`NEXT_PUBLIC_*` + allowlist)

## 설치 (로컬 패키지 사용)

```bash
npm install ../secrets-env-loader
```

## 샘플 실행

이 저장소에는 로컬 확인용 샘플이 포함되어 있습니다.

```bash
npm run sample:dev
```

샘플은 `APP_ENV` 기준으로 아래 두 파일을 모두 읽습니다.
- `sample/.env`
- `sample/.env.{env}` (예: `APP_ENV=dev`면 `sample/.env.dev`)

중복 키 우선순위:
- `sample/.env.{env}` > `sample/.env`

`.env`에 아래 값을 넣어 사용합니다.
- `AWS_PROFILE` (필수)
- `AWS_REGION` (선택, 미지정 시 기본값 `ap-northeast-2`)
- `SECRET_NAME` (필수)

실행 스크립트:
- `npm run sample:dev`
- `npm run sample:sqa`
- `npm run sample:uat`
- `npm run sample:prod`
- `npm run sample:frontend:dev`
- `npm run sample:frontend:sqa`
- `npm run sample:frontend:uat`
- `npm run sample:frontend:prod`

로그에서 아래를 확인할 수 있습니다.
- 로드된 `.env` 파일
- `AWS_PROFILE`, `AWS_REGION`, `SECRET_NAME`
- `config -> config-{env} -> secret-manager -> config-local-override` 로드 순서
- 최종 병합 결과(`config-local-override > secret-manager > config-{env} > config`)

백엔드 샘플(`sample/run-backend.js`)은 백엔드 로딩/병합을 검증합니다.

프론트 샘플(`sample/run-frontend.js`)은 아래를 검증합니다.
- 서버에서 `getPublicEnv`로 공개 키만 노출
- 클라이언트에서 `loadPublicEnv(fetchImpl)`로 런타임 설정 로드
- `mergePublicEnv`로 빌드 설정 + 런타임 설정 병합

## config 폴더 규칙

`sample/config` 폴더에 아래 파일명을 사용합니다.
- `config.json`: 공통 설정
- `config-dev.json`, `config-sqa.json`, `config-uat.json`, `config-prod.json`: 환경별 설정
- `config-local-override.json`: 로컬 전용 override 설정 (최우선)

## 프로젝트 구조 요약

- `src/index.js`: Node(백엔드) 엔트리
- `src/browser.js`: 브라우저 엔트리 (SPA/클라이언트 안전 API)
- `src/init.js`: 초기화 핵심 로직 (`initSecretsEnv`, 매핑/주입)
- `src/server.js`: 백엔드 env 조회 유틸 (`getServerEnv`)
- `src/providers.js`: 로컬 파일/AWS Secrets Manager 로더
- `src/public.js`: 공개 env 필터/핸들러/클라이언트 로더 유틸

## 동작 흐름 요약

`initSecretsEnv(options)` 기본 동작:
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
- `initSecretsEnv`는 서버 전용 API입니다.
- 브라우저에서는 `loadPublicEnv`로 서버의 공개 설정 엔드포인트를 호출해서 사용합니다.

## API

외부 공개 API:
- `initSecretsEnv`
- `getServerEnv`
- `getPublicEnv`
- `createPublicEnvHandler`
- `loadPublicEnv`
- `mergePublicEnv`

### `initSecretsEnv(options)`

환경변수 소스를 로드하고 `process.env`에 주입합니다.

옵션:
- `secretName` string (예: `tac-api/uat`)
- `region` string (선택, 기본값: `ap-northeast-2`)
- `configDir` string (기본값: `config`)
- `envName` string (예: `dev`, `sqa`, `uat`, `prod`)
- `overwrite` boolean (기본값: `false`)
- `secretEnvMap` object
- `managerClient` AWS SecretsManager client (테스트/커스터마이징용)

정책:
- Secrets Manager 연동은 모든 환경(로컬 포함)에서 필수입니다.

반환값:
- `{ loaded, loadedFrom, loadedSources, injectedKeys, mappedKeys, source, localSource, secretSource, errors }`

### `getPublicEnv(options)`

공개 가능한 환경변수만 반환합니다.

옵션:
- `source` object (기본값: `process.env`)
- `prefixes` string[] (기본값: `['NEXT_PUBLIC_', 'PUBLIC_']`)
- `prefix` string (레거시 호환; `prefixes`가 없을 때 사용)
- `allowlist` string[]

### `getServerEnv(options)`

백엔드에서 사용할 환경변수를 읽어 반환합니다.

옵션:
- `source` object (기본값: `process.env`)
- `keys` string[] (지정 시 해당 키만 반환, 미지정 시 source 전체 대상)
- `required` string[] (값이 없으면 에러 throw)
- `defaults` object (source에 값이 없을 때 기본값)

### `createPublicEnvHandler(options)`

`getPublicEnv(options)` 결과를 JSON으로 반환하는 Express 핸들러를 생성합니다.

### `loadPublicEnv(options)`

브라우저/클라이언트에서 공개 설정 엔드포인트를 호출해 JSON을 받아옵니다.

옵션:
- `endpoint` string (기본값: `/api/runtime-config`)
- `fetchImpl` function (기본값: `globalThis.fetch`)
- `requestInit` object (`fetch`의 두 번째 인자)

### `mergePublicEnv(...sources)`

여러 공개 설정 객체를 앞에서 뒤 순서로 병합합니다.

## 사용 예시

### 1) 백엔드(Node / API 서버)

```js
const { initSecretsEnv, getServerEnv } = require('secrets-env-loader');

await initSecretsEnv({
  secretName: 'tac-api/uat',
  envName: 'uat',
  configDir: './config'
});

const serverEnv = getServerEnv({
  keys: ['API_KEY', 'AWS_REGION'],
  required: ['API_KEY'],
  defaults: { AWS_REGION: 'ap-northeast-2' }
});
```

### 2) 프론트엔드 + 서버 (Express/Next.js 서버 쪽)

```js
const {
  initSecretsEnv,
  createPublicEnvHandler
} = require('secrets-env-loader');

await initSecretsEnv({
  secretName: 'tac-web/prod'
});

app.get('/api/runtime-config', createPublicEnvHandler({
  allowlist: ['PUBLIC_REGION']
}));
```

브라우저(클라이언트) 쪽:

```js
import { loadPublicEnv } from 'secrets-env-loader';

const runtimeConfig = await loadPublicEnv({
  endpoint: '/api/runtime-config'
});
```

### 3) 서버 없는 React SPA (정적 배포)

```js
import { loadPublicEnv, mergePublicEnv } from 'secrets-env-loader';

const buildEnv = {
  VITE_APP_NAME: import.meta.env.VITE_APP_NAME
};

let runtimeEnv = {};
try {
  runtimeEnv = await loadPublicEnv({
    endpoint: '/runtime-config.json'
  });
} catch (_) {
  runtimeEnv = {};
}

const config = mergePublicEnv(buildEnv, runtimeEnv);
```

주의:
- SPA에서 AWS Secrets Manager 비밀값을 직접 읽으면 안 됩니다.
- SPA에는 공개 가능한 값만 전달하세요.

## 주의사항

- 로컬 JSON 로드는 `require()` 기반이라 Node require 캐시 영향이 있을 수 있습니다.
