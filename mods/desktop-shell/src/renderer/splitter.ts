/**
 * 칸막이 동작.
 *
 * 누른 채 끄는 동안 화면 좌표(screenX)만 메인 프로세스에 보낸다. 칸막이가 움직여도
 * 화면 좌표는 흔들리지 않아 폭이 튀지 않는다. 포인터를 붙잡아 두므로 칸 밖으로
 * 나가도 끌기가 이어진다. 보내는 횟수는 화면 한 장에 한 번으로 줄인다.
 */
import '../../../../src/styles.css';
import './splitter.css';
import { followAppTheme } from './theme';

followAppTheme();

const api = window.worksheetDeskChrome;
const split = document.getElementById('split')!;
let dragging = false;
let pending: number | null = null;

function flush(): void {
  if (pending !== null) api.splitMove(pending);
  pending = null;
}

function end(): void {
  if (!dragging) return;
  dragging = false;
  flush();
  split.dataset.dragging = 'false';
  api.splitEnd();
}

split.addEventListener('pointerdown', (event) => {
  if (event.button !== 0) return;
  event.preventDefault();
  split.setPointerCapture(event.pointerId);
  dragging = true;
  split.dataset.dragging = 'true';
  api.splitStart(event.screenX);
});
split.addEventListener('pointermove', (event) => {
  if (!dragging) return;
  if (pending === null) requestAnimationFrame(flush);
  pending = event.screenX;
});
split.addEventListener('pointerup', end);
split.addEventListener('pointercancel', end);
split.addEventListener('lostpointercapture', end);
split.addEventListener('dblclick', () => api.splitReset());
// 키보드로도 옮긴다. 왼쪽 화살표는 시트 칸을 넓히고 오른쪽은 좁힌다.
split.addEventListener('keydown', (event) => {
  if (event.key === 'ArrowLeft') api.splitStep(1);
  else if (event.key === 'ArrowRight') api.splitStep(-1);
  else if (event.key === 'Home' || event.key === 'Enter') api.splitReset();
  else return;
  event.preventDefault();
});
