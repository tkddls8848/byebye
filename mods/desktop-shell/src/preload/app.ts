/**
 * 앱 칸 프리로드.
 *
 * 앱에 내주는 것은 "가려라" 신호를 받는 창구 하나뿐이다. 앱 쪽에서 메인 프로세스로
 * 말을 거는 길은 없다 — 앱은 웹 앱일 때와 똑같이 제 화면만 그린다.
 */
import { contextBridge, ipcRenderer } from 'electron';
import { COVER, type DeskAppApi } from '../shared/ipc';

const api: DeskAppApi = {
  onCover(listener) {
    // 이벤트 객체(보낸 쪽 정보)는 넘기지 않는다.
    ipcRenderer.on(COVER, () => listener());
  },
};

contextBridge.exposeInMainWorld('worksheetDesk', api);
