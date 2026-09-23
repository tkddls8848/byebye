# WORKSHEET 화면 디자인

직장인이 개인 계획을 업무 문서처럼 열어 볼 수 있도록 네이버 WORKS의 드라이브 화면 구성, 녹색 강조색, 간결한 표와 탐색 메뉴를 참고했다. 서비스명은 WORKSHEET로 사용한다.

- [Figma 실제 앱 화면](https://www.figma.com/design/cJEPgw3FDXaZW7as2O4fTe?node-id=9-33)
- [데스크톱 미리보기](workspace-desktop.png) · [편집 가능한 SVG](workspace-desktop.svg)
- [문서 목록 미리보기](workspace-document-list.png) · [편집 가능한 SVG](workspace-document-list.svg)
- [모바일 미리보기](workspace-mobile.png) · [편집 가능한 SVG](workspace-mobile.svg)

Figma의 `01 Screens`에는 실제 앱에서 가져온 화면과 별도로 구성한 디자인 초안이 있다. 검토 기준은 위 링크의 실제 앱 화면이다. `02 Components`에는 버튼, 숫자 입력, 요약 수치 컴포넌트가 있다. Starter 플랜의 MCP 호출 한도에 도달하여 초안의 차트 글꼴·하단 높이 보정 및 모바일·문서 목록 화면의 Figma 추가 편집은 완료하지 못했다. 세 화면의 최신 결과는 이 디렉터리의 PNG/SVG에 저장되어 있다.

## 동작

- `Esc`, 목록 보기, 전체 문서: 계산 화면 전체를 숨기고 문서 목록을 표시한다.
- 다른 브라우저 탭으로 이동: 문서 목록으로 자동 전환한다. 같은 탭에서 새로고침해도 목록 상태를 유지한다.
- 시트를 다시 열면 입력값을 유지한다. 문서 검색과 모바일 탐색 메뉴를 지원한다.
- 금융감독원 예적금 조건은 선택한 가입기간에 적용하고, 만기 후에는 기존 계산기의 수익률로 계산한다.

참고 화면: https://naver.worksmobile.com/products/works-drive/

Figma 캡처 스크립트는 개발 서버에서 캡처용 URL로 진입할 때만 로드하며, 배포 빌드에서는 로드하지 않는다.
