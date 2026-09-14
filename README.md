# FIRE 계산기

자산·저축·지출을 바탕으로 은퇴 가능 시점을 계산하고 금융감독원 예적금 공시를 비교하는 독립 웹 앱입니다.
`tkddls8848/quotation`의 FIRE 기능에서 분리했습니다. 다른 저장소나 견적서·문서 변환 엔진 없이 빌드됩니다.

## 구성

- `src/`: FIRE 계산, 입력 탭, 항상 표시되는 자산 추이 그래프, 예적금 비교 화면
- `worker/`: `/api/fire/products` 금융감독원 API 중계
- `public/`: 정적 응답 보안 헤더
- `wrangler.jsonc`: Cloudflare Worker 및 정적 자산 설정

## 개발 및 검증

Node.js 22.12 이상을 사용합니다.

```sh
npm ci
npm run dev
npm test
npm run check
```

API까지 포함해 확인하려면 `npm run worker:dev`를 사용합니다. Vite 개발 서버의 `/api/` 요청은 로컬 Worker의 8787 포트로 전달됩니다.
바인딩을 바꾼 뒤에는 `npm run cf:types`로 `worker-configuration.d.ts`를 다시 생성합니다.

## Cloudflare 배포

```sh
npm run deploy
```

GitHub 저장소는 `fire_calc`, Worker는 Cloudflare 이름 규칙에 맞춘 `fire-calc`입니다.
시크릿과 사용자 환경 변수는 저장소에 넣지 않습니다. `keep_vars: true`로 대시보드에서 직접 설정한 변수를 재배포 때 유지합니다.

Cloudflare **Workers & Pages → fire-calc → Settings → Variables and Secrets**에서 다음 항목을 직접 설정하세요.

| 종류 | 이름 | 용도 |
| --- | --- | --- |
| Secret | `FSS_API_KEY` | 금융감독원 금융상품 통합 비교공시 OpenAPI 인증키 |

현재 코드가 요구하는 일반 환경 변수는 없습니다. `ASSETS`는 배포 때 자동으로 연결되는 정적 자산 바인딩입니다.
키를 넣기 전에도 계산기와 그래프는 동작하며, 상품 조회만 인증키 미설정 안내와 HTTP 503을 반환합니다.
로컬 API 개발용 키는 Git에서 제외되는 `.dev.vars`에 넣습니다.

GitHub 자동 검증은 `.github/workflows/ci.yml`에서 실행합니다.
Cloudflare에서 GitHub 자동 배포를 연결할 경우 저장소 루트 `/`, 빌드 명령 `npm run build`, 배포 명령 `npx wrangler deploy`를 사용합니다.

참고: [Worker 이름·변수 설정](https://developers.cloudflare.com/workers/wrangler/configuration/), [API 우선 라우팅](https://developers.cloudflare.com/workers/static-assets/routing/worker-script/).

## 데이터

계산 입력은 브라우저에 저장되고 서버로 전송되지 않습니다. 새 배포 주소는 기존 사이트와 출처가 달라 기존 브라우저 입력값이 자동 이전되지 않습니다.
상품 공시는 금융감독원에서 가져옵니다. 실제 적용 금리·한도·우대조건은 해당 금융회사에서 확인해야 합니다.
