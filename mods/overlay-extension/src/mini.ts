/**
 * 미니 창 화면.
 *
 * 틀 안(문서 PiP)이면 가리기만 한다 — PiP 창은 그것을 연 옆 칸이 닫는다.
 * 따로 띄운 팝업 창이면 가린 뒤 스스로 닫는다.
 */
import { startView } from './view-host';

const root = document.getElementById('app');
if (!root) throw new Error('미니 창의 칸을 찾지 못했습니다.');

const framed = window.top !== window.self;

void startView(root, {
  role: framed ? 'mini-frame' : 'mini-popup',
  afterCover: () => {
    if (!framed) window.close();
  },
});
