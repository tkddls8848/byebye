/**
 * 표준 타입에 아직 없는 브라우저 API.
 *
 * 둘 다 있을 수도 없을 수도 있다. 쓰는 쪽에서 반드시 있는지 먼저 살핀다.
 */

/** 문서 PiP(Document Picture-in-Picture). 크롬 116 부터. 늘 위에 뜨는 작은 창이다. */
interface DocumentPictureInPicture extends EventTarget {
  readonly window: Window | null;
  requestWindow(options?: { width?: number; height?: number }): Promise<Window>;
}

interface Window {
  readonly documentPictureInPicture?: DocumentPictureInPicture;
}

/** 웨일의 사이드바 API. 크롬·엣지에는 없다. */
declare var whale:
  | {
      sidebarAction?: {
        show?(windowId?: number): void;
        hide?(windowId?: number): void;
      };
    }
  | undefined;
