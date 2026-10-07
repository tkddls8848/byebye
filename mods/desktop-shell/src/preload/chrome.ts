/**
 * 머리줄·칸막이 프리로드.
 *
 * 둘 다 worksheet://app 에서 오는 우리 화면이다. 메인 프로세스가 보낸 쪽을 다시
 * 확인하므로, 여기서는 정해 둔 이름으로만 보내고 값의 모양만 맞춘다.
 */
import { contextBridge, ipcRenderer } from 'electron';
import * as ipc from '../shared/ipc';

const api: ipc.DeskChromeApi = {
  getState: () => ipcRenderer.invoke(ipc.GET_STATE) as Promise<ipc.DeskState>,
  onState(listener) {
    ipcRenderer.on(ipc.STATE, (_event, state: ipc.DeskState) => listener(state));
  },
  onFocusAddress(listener) {
    ipcRenderer.on(ipc.FOCUS_ADDRESS, () => listener());
  },
  nav: (action) => ipcRenderer.send(ipc.NAV, action),
  go: (input) => ipcRenderer.invoke(ipc.GO, String(input)) as Promise<boolean>,
  togglePane: () => ipcRenderer.send(ipc.TOGGLE_PANE),
  splitStart: (screenX) => ipcRenderer.send(ipc.SPLIT_START, Number(screenX)),
  splitMove: (screenX) => ipcRenderer.send(ipc.SPLIT_MOVE, Number(screenX)),
  splitEnd: () => ipcRenderer.send(ipc.SPLIT_END),
  splitReset: () => ipcRenderer.send(ipc.SPLIT_RESET),
  splitStep: (delta) => ipcRenderer.send(ipc.SPLIT_STEP, Number(delta)),
};

contextBridge.exposeInMainWorld('worksheetDeskChrome', api);
