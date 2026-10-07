# WORKSHEET 데스크 — 데스크톱 셸

실제 사이트를 **원래 주소 그대로** 띄우고, 그 오른쪽에 WORKSHEET(FIRE 계산기)를
붙여 한 창에 놓는 Electron 데스크톱 앱이다. 사용자는 실제 사이트에 직접 접속하고
직접 로그인한다. 셸은 그 페이지를 고치지도, 읽지도, 중계하지도 않는다.

```
┌──────────────────────── 머리줄 44px (우리 화면) ─────────────────────────┐
│ W WORKSHEET | 데스크   ←  →  ⟳   [https://실제 주소 전체 ……… ]  [시트 Alt+Shift+K] │
├───────────────────────────────────────────┬──┬──────────────────────────┤
│                                           │칸│                          │
│  실제 사이트 (WebContentsView)              │막│  WORKSHEET (기본 400px)    │
│  - 원래 주소, 최상위 문서                      │이│  worksheet://app/         │
│  - 프리로드·주입 없음, 세션 persist:web        │  │  세션 persist:worksheet    │
│                                           │  │                          │
└───────────────────────────────────────────┴──┴──────────────────────────┘
```

## 게임 모드로 치면

**모드 런처(컴포지터)** 방식이다. 원본 게임 실행 파일은 건드리지 않고(코드 주입·
메모리 후킹 없음), 런처가 원본을 그대로 실행한 뒤 모드 창을 그 옆에 도킹한다.
원본 화면 위에 그리지도 않는다 — 같은 창 안에서 칸을 나눠 옆에 놓을 뿐이다.

확장 프로그램 방식(`overlay-extension`)이 사용자의 브라우저
안에 들어가는 쪽이라면, 이쪽은 **브라우저 자체를 우리 것으로 바꾸는** 쪽이다. 그래서
실제 사이트 페이지 안에는 우리 코드가 한 줄도 들어가지 않는다.

## 화면

| 칸 | 내용 |
| --- | --- |
| 머리줄 (44px) | 뒤로·앞으로·새로 고침(불러오는 중에는 멈춤), 주소 칸, 시트 칸 접기/펴기 단추 |
| 실제 사이트 | 기본 시작 주소 `https://search.naver.com/`. 머리줄 주소 칸에서 다른 http(s) 주소로 이동할 수 있다 |
| 칸막이 (6px) | 끌어서 폭 조절, 두 번 누르면 400px, 초점을 두고 ←/→ 로 16px 씩, Home 은 기본 폭 |
| WORKSHEET | 기본 400px — 앱의 좁은 화면 배치(≤700px)가 적용된다. 700px 를 넘기면 사이드바가 있는 넓은 배치 |

- **주소 칸은 늘 실제 사이트의 전체 주소를 보인다**(피싱 방지). 호스트는 진하게, 나머지는
  흐리게 그려 어느 사이트인지 한눈에 보인다(`https://아무개@다른곳/` 이면 진한 쪽은
  실제 호스트인 `다른곳`). https 는 자물쇠, http 는 경고 표시. 사람이 적던 글은 칸을
  떠나거나 페이지가 이동하면 버리고 실제 주소로 돌아간다. 검색어처럼 띄어 쓴 글이나
  http(s) 가 아닌 주소(`javascript:` 등)는 받지 않는다.
- 머리줄·칸막이는 앱과 같은 색 토큰(`--ws-*`)을 쓰고, 앱의 밝기 단추나 운영체제
  다크 모드를 따라간다.
- 창 크기는 자유롭게 바꿀 수 있다. 실제 사이트는 360px, 시트 칸은 320px 아래로
  줄지 않는다.

화면 사진(1440×900, 창 안쪽만):

| 파일 | 장면 |
| --- | --- |
| [screenshots/desk-light.png](screenshots/desk-light.png) | 밝은 화면. 실제 사이트(시험용 픽스처) + 시트 칸 400px |
| [screenshots/desk-light-results.png](screenshots/desk-light-results.png) | 시트 칸을 아래로 스크롤해 검토 결과·수치·자산 추이 그래프가 보이는 모습 |
| [screenshots/desk-dark.png](screenshots/desk-dark.png) | 어두운 화면. 머리줄·칸막이·시트 칸이 함께 어두워진다(픽스처는 다크 스타일이 없다) |
| [screenshots/desk-collapsed.png](screenshots/desk-collapsed.png) | 보스 키를 누른 직후. 실제 사이트가 창 전체를 차지한다 |
| [screenshots/desk-restored-covered.png](screenshots/desk-restored-covered.png) | 보스 키를 다시 누른 뒤. 칸은 펴졌지만 수치는 문서 목록으로 가려져 있다 |
| [screenshots/desk-wide-pane.png](screenshots/desk-wide-pane.png) | 칸막이를 끌어 시트 칸을 740px 로 넓힌 모습(넓은 배치) |

컨테이너에서는 실제 포털에 접속할 수 없어 사진의 왼쪽은 `mods/fixtures/search-mock.html`
이다. 실제로 쓰면 그 자리에 실제 사이트가 원래 모습 그대로 뜬다.

## 빌드

```sh
npm install --prefix mods/desktop-shell     # electron 44.6.0 (정확한 버전 고정)
node mods/desktop-shell/build.mjs           # 우리 화면(Vite) + 메인·프리로드(esbuild)
npm run typecheck --prefix mods/desktop-shell
```

- 우리 화면(앱 칸·머리줄·칸막이) → `dist-mods/desktop-shell/app/`
  (화면만 다시 만들 때: `npx vite build --config mods/desktop-shell/vite.config.ts`)
- 메인 프로세스·프리로드 → `mods/desktop-shell/out/` (`main.js`, `preload-app.js`, `preload-chrome.js`)
- 둘 다 git 에 넣지 않는다. 앱 칸은 `mods/shared/boot.ts` 의 `bootApp(root, { apiBase: '', shareBase: PUBLIC_ORIGIN })` 로 웹 앱과 같은 화면을 그린다.
- Electron 44 패키지는 처음 실행할 때 실행 파일을 내려받는다. 미리 받으려면
  `node mods/desktop-shell/node_modules/electron/install.js`.

## 실행

```sh
npm start --prefix mods/desktop-shell
```

- root 로 도는 Linux 컨테이너처럼 Chromium 샌드박스를 쓸 수 없는 곳에서만
  `npm start --prefix mods/desktop-shell -- --no-sandbox` 로 띄운다. 평소에는 쓰지 않는다
  (코드의 `sandbox: true` 는 그대로다).
- 환경 변수
  - `WORKSHEET_START_URL` — 시작 주소를 바꾼다(http(s) 만). 시험에서 픽스처를 가리킬 때 쓴다.
  - `WORKSHEET_USER_DATA` — 앱 데이터 폴더를 바꾼다. 시험에서 깨끗한 폴더를 쓸 때 쓴다.
- 앱 데이터 폴더(기본: Linux `~/.config/WORKSHEET 데스크`, Windows `%APPDATA%\WORKSHEET 데스크`,
  macOS `~/Library/Application Support/WORKSHEET 데스크`). 메인 프로세스가 `appData/WORKSHEET 데스크`
  를 직접 정한다 — Electron 의 암묵적 기본값에 맡겼던 이전 판에서는 `npm start` 실행의 프로필이
  `~/.config` 바로 아래에 흩어졌다.
  - `Partitions/web` — 실제 사이트 세션(사용자가 직접 로그인한 쿠키). 셸은 읽지 않는다.
  - `Partitions/worksheet` — 계산기 입력(웹 앱과 같은 localStorage). 이 출처 밖으로 나가지 않는다.
  - `desk-layout.json` — 창 위치, 시트 칸 폭, 접힘 여부. **주소나 방문 기록은 적지 않는다.**
    시작 페이지는 언제나 같은 곳에서 연다.
- 프로그램은 하나만 뜬다(두 번째로 열면 떠 있는 창이 앞으로 온다). 보스 키는 한 프로그램만 잡을 수 있기 때문이다.

## 보스 키

**Alt+Shift+K** (macOS 에서는 ⌥⇧K). 운영체제 전역 단축키라 실제 사이트에 초점이 있어도,
창이 뒤에 있어도 듣는다. 앱이 떠 있는 동안만 등록하고 끝날 때 해제한다.

| 상태 | 누르면 |
| --- | --- |
| 시트 칸이 펼쳐져 있음 | 앱에 "가려라"를 먼저 보내(문서 목록으로 바뀜) 칸을 바로 접는다. 실제 사이트가 창 전체를 차지한다 |
| 보스 키로 접혀 있음 | 칸을 다시 편다. 수치는 가려진 채(문서 목록)로 돌아오고, 시트는 사람이 다시 연다 |
| 머리줄 단추로 접어 둠 | 펴지 **않고** 가리기만 한다. 보스 키가 숨겨 둔 칸을 끄집어내는 일은 없다 |

- 시트 칸 안의 **Esc** 는 웹 앱과 같다(문서 목록으로).
- 창을 내리거나(최소화) 숨기면(macOS ⌘H) 시트 칸이 문서 목록으로 바뀐다. 웹 앱이 다른 탭으로
  옮길 때 가리는 것과 같다. 초점만 잃거나 다른 창 뒤로 갈 때는 가리지 않는다.
- 다른 프로그램이 이미 Alt+Shift+K 를 쓰고 있으면 등록하지 못한다. 그때는 머리줄 단추의
  단축키 안내가 사라지고 툴팁이 이유를 알린다. 메뉴 `보기 › 수치 가리고 접기` 는 그래도 쓸 수 있다.
- 그 밖의 단축키(창에 초점이 있을 때): 주소 칸 `Ctrl+L`, 뒤로/앞으로 `Alt+←/→`
  (macOS `⌘[`/`⌘]`), 새로 고침 `Ctrl+R`. 메뉴 줄은 숨겨 두었고 Alt 로 보인다.

## 법적 안전장치

| 원칙 | 이렇게 지킨다 |
| --- | --- |
| 남의 사이트를 프록시·미러·재호스팅·변형하지 않는다 | 실제 사이트는 사용자가 원래 주소로 직접 연다. 셸을 거치는 요청은 없다. `worksheet://` 처리기는 우리 세션에만 달리고, 그 안에서도 `/api/*` 만 **우리** 공개 주소로 넘긴다 |
| 응답·요청 머리글을 바꾸지 않는다 | `webRequest`·`onHeadersReceived` 를 쓰지 않는다. X-Frame-Options·CSP 를 지우지 않는다. 사용자 에이전트도 바꾸지 않는다(Electron 기본값 그대로 — 정체를 숨기지 않는다) |
| 남의 페이지를 틀(iframe)에 넣지 않는다 | `WebContentsView` 는 최상위 문서다. 실제 사이트는 자기 창에서 뜨는 것과 같은 조건으로 뜬다 |
| 페이지 내용·쿠키·입력·기록을 읽지 않는다 | 실제 사이트 칸에는 **프리로드가 없다**. `executeJavaScript`·`insertCSS`·디버거를 쓰지 않는다. 키 입력을 엿듣는 `before-input-event` 대신 메뉴 단축키와 전역 단축키를 쓴다. 오른쪽 클릭 메뉴도 선택한 글이나 링크 주소를 꺼내 보지 않고 Chromium 편집 동작만 부른다. 셸이 아는 것은 주소 칸에 보일 지금 주소뿐이고, 그것도 저장하지 않는다 |
| 페이지에 관한 것을 어디에도 보내지 않는다 | 우리 코드가 보내는 요청은 `https://byebye.tkddls8848.workers.dev/api/*`(상품 공시 중계) 하나뿐이다. 앱 칸 CSP 가 `connect-src 'self'` 라 다른 곳으로는 연결 자체가 막힌다. 맞춤법 검사는 끄고 **사전 목록도 비운다** — 끄기만 하면 Chromium 이 세션마다 구글 서버(`redirector.gvt1.com`)에서 사전을 내려받는다(넷 로그로 찾아 고쳤다). 시험은 Chromium 넷 로그로 프로그램 전체가 연 출처가 픽스처와 공개 주소뿐인지 확인한다 |
| 데이터는 우리 쪽에만 둔다 | 실제 사이트(`persist:web`)와 우리(`persist:worksheet`)는 세션부터 나뉜다. 계산기 입력은 `worksheet://app` 저장소에만 남는다 |
| 최소 권한 | 실제 사이트 칸의 권한 요청(알림·위치·카메라·마이크·클립보드 읽기·장치·외부 프로그램 열기)은 모두 거절. 우리 세션도 공유 링크 복사용 클립보드 쓰기만 허락한다. 사이트가 클라이언트 인증서를 요구해도 내주지 않는다(Electron 기본값은 묻지 않고 첫 인증서를 보낸다). 모든 칸 `sandbox: true`, `contextIsolation: true`, `nodeIntegration: false`, `webviewTag: false` |
| 상표를 쓰지 않는다 | 화면과 제품 이름에 다른 회사 이름·로고가 없다. 이름은 "WORKSHEET 데스크", 표식은 웹 앱의 W 그대로. 기본 시작 주소는 주소일 뿐 화면 글자로 쓰지 않는다 |
| 사용자가 늘 어디에 있는지 안다 | 주소 칸이 줄이지 않은 전체 주소를 보인다. 새 창(`window.open`, `target=_blank`)은 숨은 창을 만들지 않고 같은 칸에서 연다 — 주소 칸이 늘 지금 위치를 가리킨다. 페이지가 `location` 으로 갈 수 있는 곳 이상으로 갈 수 있게 되지도 않는다. 실제 사이트 칸은 http(s) 밖(`file:`, `worksheet:`, `mailto:` 등)으로 가지 못하고, 운영체제의 다른 프로그램에는 아무것도 넘기지 않는다(`shell.openExternal` 을 쓰지 않는다. 링크로 누른 외부 형식은 Chromium 이 묻는 `openExternal` 권한을 세션이 거절한다). 남의 페이지가 메일 창이나 로컬 프로그램을 띄우는 통로를 두지 않는다. 인증서 오류는 Electron 기본대로 거절한다 |

우리 화면의 CSP:
`default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'self'; manifest-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'; object-src 'none'`

메인 프로세스는 머리줄·칸막이에서 온 IPC 가 정말 그 칸의 `worksheet://app/` 문서에서
왔는지 확인한 뒤에만 따른다. 앱 칸 프리로드는 `onCover` 하나만 내놓고, 앱에서 메인
프로세스로 말을 거는 길은 없다.

## 시험

```sh
node mods/desktop-shell/build.mjs
NODE_PATH=/opt/node22/lib/node_modules xvfb-run -a -s "-screen 0 1600x1000x24" \
  node mods/desktop-shell/e2e.mjs --no-sandbox
```

- Playwright 는 package.json 에 넣지 않는다. `NODE_PATH` 나 `PLAYWRIGHT_PATH` 로 찾는다.
- 스크립트가 픽스처(`mods/fixtures/search-mock.html`)를 작은 서버로 직접 내주고, 들어온
  요청을 모두 적는다. 끝나면 서버와 임시 앱 데이터 폴더를 지운다.
- 화면 사진은 칸마다 `capturePage()` 로 찍어 창 안쪽 한 장으로 합친다.
- Playwright 입력은 페이지 안으로 바로 들어가 운영체제 전역 단축키와 칸 사이 포인터
  붙잡기를 지나지 않는다. X 화면이 있으면 `tools/xinput.py`(X11 XTest)로 **진짜**
  Alt+Shift+K 와 마우스 끌기를 넣어 그 길도 확인한다. X 가 없으면 그 두 시험은 건너뛴다.
  보스 키의 나머지 시험은 같은 처리기를 부르는 메뉴 항목(`보기 › 수치 가리고 접기`)으로 누른다.

확인하는 것(34개): 칸 배치와 크기, 주소 칸의 전체 주소, 앱 렌더링과 ≤700px 배치, 앱 칸이 스크롤되어
결과까지 닿는지(머리줄 CSS 가 새지 않는지), 보스 키
(메뉴·진짜 키 입력)의 접기·가리기·펴기, 단추로 접은 칸을 보스 키가 펴지 않는 것, 창을
내리거나 숨길 때 가리기, Esc,
칸막이(끌기·진짜 마우스·키보드·두 번 누르기), 최소 폭, 밝기 따라가기, 상품 불러오기 실패
안내, 공유 링크 복사(우리 출처의 클립보드 쓰기), 앱 칸 CSP, 실제 사이트 칸의 프리로드 없음·샌드박스·세션
분리, 권한 거절(클립보드 읽기·쓰기 포함), 클라이언트 인증서 내주지 않기, 픽스처
`#secret-text` 와 DOM 이 그대로인지, 픽스처 서버에 GET 말고 아무것도 오지 않았는지, 주소
칸 이동·거절·되돌림, 메뉴 단축키, `window.open` 이 같은 칸에서 열리는지, `mailto:`·앱 호출 주소가
`shell.openExternal` 로 넘어가지 않는지(새 창·링크 두 길 모두), http(s) 밖으로의 이동 차단, 빌드 결과에
주입·머리글 변경 API·`openExternal` 과 바깥 주소가 없는지, **Chromium 넷 로그로 본 프로그램 전체의 요청
출처**가 픽스처와 공개 주소뿐인지, 앱 데이터에 주소가 남지 않는지.

- 넷 로그는 `--log-net-log` 로 임시 폴더에 받아 요청 주소(`params.url`)의 출처를 모은다. 프록시를
  거치는 환경이면 소켓 주소는 프록시라서 주소의 출처로 견준다.

## 알려진 한계

- **실제 포털에서는 시험하지 못했다.** 컨테이너가 포털과 배포 주소에 닿지 못해 픽스처로만
  시험했다. 상품 공시 중계의 성공 경로도 확인하지 못했다(실패 안내가 뜨는 것만 확인).
- 사용자 에이전트를 바꾸지 않으므로 Electron 이 들어간 값이 그대로 나간다. 내장 브라우저를
  막는 로그인(일부 OAuth 등)은 동작하지 않을 수 있다. 일부러 숨기지 않는다.
- 새 창을 같은 칸에서 열기 때문에 `window.opener` 에 기대는 팝업 로그인·팝업 작성 창은
  제대로 동작하지 않을 수 있다.
- `mailto:` 링크를 눌러도 메일 프로그램이 뜨지 않는다(운영체제에 아무것도 넘기지 않는다).
- 실제 사이트의 비동기 클립보드 API(`navigator.clipboard`)는 읽기·쓰기 모두 거절된다. 사이트의
  "복사" 단추 가운데 이 API 를 쓰는 것은 동작하지 않는다.
- 탭·확장·비밀번호 관리자·자동 완성·알림·위치·카메라가 없다(권한은 모두 거절). 내려받기는
  Electron 기본 저장 창을 쓴다.
- 보스 키는 X11·Windows·macOS 에서 동작한다. Linux **Wayland** 세션에서는 전역 단축키가
  잡히지 않을 수 있다(그때는 메뉴로 쓴다).
- Xvfb 에서는 `nativeTheme` 이 렌더러의 `prefers-color-scheme` 에 닿지 않아, 운영체제 다크
  모드는 CDP 로 흉내 내어 시험했다(앱 밝기 단추 경로는 그대로 시험).
- Xvfb 에는 창 관리자가 없어 실제 최소화·숨기기는 일어나지 않는다. 그때 수치를 가리는 것은 같은
  창 이벤트를 내보내 시험했다(macOS ⌘H 를 포함한 실제 운영체제 동작은 확인하지 못했다).
- 기본 앱 데이터 폴더(`WORKSHEET_USER_DATA` 없이 띄울 때)를 고친 뒤의 실행은 컨테이너에서 다시
  돌려 보지 못했다. 시험은 늘 `WORKSHEET_USER_DATA` 로 임시 폴더를 쓴다.
- 클라이언트 인증서 거절은 등록된 처리기에 같은 모양의 이벤트를 흘려 시험했다(인증서를 요구하는
  실제 TLS 서버로는 시험하지 않았다).
- 설치 파일(서명·자동 업데이트 포함)은 만들지 않았다. 지금은 저장소에서 `npm start` 로 띄운다.
  묶어 배포할 때는 `dist-mods/desktop-shell/app/` 을 앱 폴더의 `app/` 으로 넣으면 메인 프로세스가
  그쪽을 먼저 찾는다. 묶을 때는 Electron fuses(`RunAsNode`, `EnableNodeOptionsEnvironmentVariable`,
  `EnableNodeCliInspectArguments` 등)도 꺼야 한다. Electron 은 Chromium 보안 수정을 따라가야 하므로
  버전을 자주 올려야 한다.
- 칸막이는 따로 된 6px 칸이라 창 안의 칸은 넷이다(머리줄·실제 사이트·칸막이·앱).
- 앱 칸을 700~800px 쯤으로 넓히면 앱 머리글의 "드라이브" 글자가 두 줄로 꺾인다
  (`src/workspace.css` 의 `.ws-service` 에 `white-space: nowrap` 이 없어서다. 여기서는 고치지 않았다).

## 파일

```
mods/desktop-shell/
├─ package.json, package-lock.json   electron 44.6.0 고정(별도 npm 프로젝트)
├─ build.mjs                         전체 빌드(Vite + esbuild)
├─ vite.config.ts                    우리 화면 빌드 → dist-mods/desktop-shell/app/
├─ tsconfig.json                     화면·Vite 설정 타입 검사
├─ tsconfig.main.json                메인·프리로드 타입 검사
├─ e2e.mjs                           종단 시험(빌드는 하지 않는다)
├─ tools/xinput.py                   시험용 X11 실제 입력
├─ screenshots/                      시험이 남긴 화면 사진
└─ src/
   ├─ main/main.ts                   창·칸·배치·보스 키·메뉴·IPC
   ├─ main/protocol.ts               worksheet://app (빌드 파일 + /api/* 중계, CSP)
   ├─ main/guard.ts                  세션·칸마다 권한·이동·새 창 규칙
   ├─ main/layout.ts                 칸 배치 셈(순수 함수)
   ├─ main/address.ts                주소 칸 글 → 주소, 시작 주소
   ├─ main/state.ts                  desk-layout.json 읽기·쓰기
   ├─ preload/app.ts                 앱 칸: onCover 하나
   ├─ preload/chrome.ts              머리줄·칸막이 창구
   ├─ shared/ipc.ts                  IPC 이름과 모양
   └─ renderer/                      index.html(앱 칸), toolbar.*, splitter.*, theme.ts
```
