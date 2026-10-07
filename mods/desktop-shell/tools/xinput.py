"""
시험용 실제 입력(X11 XTest).

Playwright 의 입력은 페이지 안으로 바로 들어가서 운영체제 전역 단축키나 칸 사이를
넘나드는 포인터 붙잡기를 거치지 않는다. 이 도구는 X 서버에 진짜 키·마우스 입력을
넣어 그 길을 그대로 지나게 한다. Xvfb 같은 X 화면에서만 쓴다.

  python3 xinput.py keys Alt_L Shift_L k      # 함께 눌렀다 뗀다
  python3 xinput.py drag X1 Y X2 STEPS        # (X1,Y)에서 눌러 X2 까지 끌고 뗀다
"""
import ctypes
import sys
import time

x11 = ctypes.CDLL('libX11.so.6')
xtst = ctypes.CDLL('libXtst.so.6')
x11.XOpenDisplay.restype = ctypes.c_void_p
x11.XStringToKeysym.restype = ctypes.c_ulong
x11.XStringToKeysym.argtypes = [ctypes.c_char_p]
x11.XKeysymToKeycode.argtypes = [ctypes.c_void_p, ctypes.c_ulong]
for fn in (xtst.XTestFakeKeyEvent, xtst.XTestFakeButtonEvent, xtst.XTestFakeMotionEvent, x11.XFlush, x11.XCloseDisplay):
    fn.argtypes = None

display = x11.XOpenDisplay(None)
if not display:
    sys.exit('X 화면을 열지 못했습니다(DISPLAY 확인)')
dp = ctypes.c_void_p(display)


def flush(pause=0.03):
    x11.XFlush(dp)
    time.sleep(pause)


def keys(names):
    codes = [x11.XKeysymToKeycode(display, x11.XStringToKeysym(name.encode())) for name in names]
    for code in codes:
        xtst.XTestFakeKeyEvent(dp, code, True, 0)
        flush()
    for code in reversed(codes):
        xtst.XTestFakeKeyEvent(dp, code, False, 0)
        flush()


def drag(x1, y, x2, steps):
    xtst.XTestFakeMotionEvent(dp, -1, x1, y, 0)
    flush(0.2)
    xtst.XTestFakeButtonEvent(dp, 1, True, 0)
    flush(0.1)
    for i in range(1, steps + 1):
        xtst.XTestFakeMotionEvent(dp, -1, round(x1 + (x2 - x1) * i / steps), y, 0)
        flush()
    flush(0.2)
    xtst.XTestFakeButtonEvent(dp, 1, False, 0)
    flush(0.2)


if sys.argv[1] == 'keys':
    keys(sys.argv[2:])
elif sys.argv[1] == 'drag':
    drag(*map(int, sys.argv[2:6]))
else:
    sys.exit('keys 또는 drag')
x11.XCloseDisplay(dp)
