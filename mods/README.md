# 실제 서비스와 섞어 쓰는 방식 (모드)

웹 앱(`src/`)의 WORKSHEET 계산기를 실제 브라우저 서비스 곁에 붙여 쓰는 시제품들이다.
게임의 모딩처럼 원본(실제 사이트)은 그대로 두고 우리 화면만 더한다.

| 폴더 | 방식 | 게임 모드로 치면 | 실제 페이지를 고치나 |
| --- | --- | --- | --- |
| [`overlay-extension/`](overlay-extension/README.md) | 크롬·엣지 옆 칸(side panel), 웨일 사이드바 확장 | 게임 옆에 띄우는 컴패니언 앱 | 고치지 않는다 (content script 없음) |
| [`desktop-shell/`](desktop-shell/README.md) | 실제 사이트를 원래 주소로 띄우고 오른쪽에 WORKSHEET 를 붙인 Electron 앱 | 원본을 실행하고 모드 창을 도킹하는 런처 | 고치지 않는다 (주입·중계 없음) |

실제 페이지 안에 카드를 끼워 넣는 방식(content script 주입)은 시제품까지 만들었지만,
포털 화면을 바꾸는 프로그램 배포를 부정경쟁으로 본 판례(대법원 2010. 8. 25. 자 2008마1541
결정, 대법원 2010. 9. 30. 선고 2009도12238 판결) 때문에 이 저장소에는 넣지 않았다.

## 지키는 선

- 남의 사이트를 중계·복제하지 않고, 응답 헤더(X-Frame-Options·CSP)를 바꾸지 않는다.
- 남의 페이지 내용·쿠키·입력값을 읽지 않는다. 우리 코드가 하는 네트워크 요청은
  공개 주소의 `/api/fire/products` 뿐이다(확장 페이지 CSP 로 브라우저가 강제한다).
- 이름·로고에 다른 회사의 상표를 쓰지 않는다. 제품 이름은 모두 `WORKSHEET …` 이다.
- 회사 브라우저의 확장 정책이나 보안 모니터링을 피하는 기능은 넣지 않는다.

## 공통 부분

- `shared/boot.ts`: 웹 앱이 아닌 자리에서 앱을 싣는 시작점. `src/host.ts` 의 설정(API·공유
  링크 주소, 탭 제목·주소창을 건드릴지)을 정한 뒤 같은 화면을 그린다.
- `fixtures/search-mock.html`: 컨테이너에서 실제 포털에 접속할 수 없어 시험에 쓰는 가짜
  검색 결과 페이지. 어느 회사의 로고·이름도 쓰지 않는다.

## 빌드

```sh
npm run mods:overlay            # dist-mods/overlay-extension, dist-mods/overlay-extension-whale
npm install --prefix mods/desktop-shell
npm run mods:desktop            # 빌드 후 npm start --prefix mods/desktop-shell
```

각 폴더의 README 에 설치 방법, 보스 키, 시험(e2e) 방법, 확인하지 못한 점이 있다.
