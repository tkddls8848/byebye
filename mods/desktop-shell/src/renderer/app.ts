/**
 * 앱 칸 진입점.
 *
 * 웹 앱과 같은 화면을 그린다. API 는 상대 주소('')로 부른다 — worksheet://app/api/
 * 를 셸이 공개 주소로 넘겨 주므로 웹 앱과 같은 길을 탄다. 공유 링크만 공개 주소를
 * 가리켜야 받은 사람이 열 수 있다.
 */
import { PUBLIC_ORIGIN, bootApp, coverWorkspace } from '../../../shared/boot';

const root = document.getElementById('fire-root');
if (!root) throw new Error('WORKSHEET 화면을 찾지 못했습니다.');
bootApp(root, { apiBase: '', shareBase: PUBLIC_ORIGIN });

// 보스 키: 셸이 칸을 접기 직전에 보낸다. Esc 와 같은 문서 목록 화면으로 바뀐다.
window.worksheetDesk?.onCover(() => coverWorkspace());
