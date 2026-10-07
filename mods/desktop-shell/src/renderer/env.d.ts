import type { DeskAppApi, DeskChromeApi } from '../shared/ipc';

declare global {
  interface Window {
    /** 앱 칸 프리로드가 내놓는다. 셸 밖(웹 앱)에서는 없다. */
    worksheetDesk?: DeskAppApi;
    /** 머리줄·칸막이 프리로드가 내놓는다. */
    worksheetDeskChrome: DeskChromeApi;
  }
}

export {};
