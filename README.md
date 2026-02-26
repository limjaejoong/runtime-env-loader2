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

## 프로젝트 구조 요약

- `src/index.js`: Node(백엔드) 엔트리
- `src/browser.js`: 브라우저 엔트리 (SPA/클라이언트 안전 API)
- `src/init.js`: 초기화 핵심 로직 (`initSecretsEnv`, 매핑/주입)
- `src/server.js`: 백엔드 env 조회 유틸 (`getServerEnv`)
- `src/providers.js`: 로컬 파일/AWS Secrets Manager 로더
- `src/public.js`: 공개 env 필터/핸들러/클라이언트 로더 유틸

## 동작 흐름 요약

`initSecretsEnv(options)` 기본 동작:
- `preferLocalFile=true` + `localFilePath`가 있으면 로컬 파일을 먼저 로드
- `useSecretsManager=true` + `secretName`이 있으면 Secrets Manager를 로드
- Secrets Manager 값은 항상 "없는 키만" 채움 (로컬/기존 env 덮어쓰지 않음)
- 기본적으로 `requireSecretsManager=true`라서 Secrets Manager 로드 실패 시 `loaded=false`

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
- `region` string
- `localFilePath` string
- `preferLocalFile` boolean (기본값: `true`)
- `overwrite` boolean (기본값: `false`)
- `useSecretsManager` boolean (기본값: `true`)
- `requireSecretsManager` boolean (기본값: `true`)
- `secretEnvMap` object
- `managerClient` AWS SecretsManager client (테스트/커스터마이징용)

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
  localFilePath: './infrastructure/config.development.json',
  preferLocalFile: true
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
  secretName: 'tac-web/prod',
  requireSecretsManager: true
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
