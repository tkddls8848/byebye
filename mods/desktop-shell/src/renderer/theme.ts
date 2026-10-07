/**
 * 머리줄·칸막이가 앱 칸과 같은 밝기를 쓰게 한다.
 *
 * 셋 다 worksheet://app 출처라 앱이 저장한 밝기(localStorage)를 같이 본다. 앱에서
 * 밝기를 바꾸면 storage 이벤트로 바로 따라간다. 고른 적이 없으면 운영체제 설정을
 * 따른다(styles.css 의 prefers-color-scheme).
 */
const THEME_KEY = 'worksheet-theme';

function apply(): void {
  let saved: string | null = null;
  try {
    saved = localStorage.getItem(THEME_KEY);
  } catch {
    // 저장소가 없어도 운영체제 설정으로 그린다.
  }
  if (saved === 'light' || saved === 'dark') document.documentElement.dataset.theme = saved;
  else delete document.documentElement.dataset.theme;
}

export function followAppTheme(): void {
  apply();
  addEventListener('storage', (event) => {
    if (event.key === null || event.key === THEME_KEY) apply();
  });
}
