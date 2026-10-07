/**
 * 설정 화면. 업무 탭 주소를 검사해 저장하고, 보스 키의 지금 단축키를 보여 준다.
 */
import '../../../src/styles.css';
import { checkDecoyUrl } from './decoy';
import { DECOY_URL } from './protocol';
import './options.css';

// 앱(workspace.ts 의 applySavedTheme)과 같은 열쇠로 화면 밝기를 맞춘다. 그 모듈을
// 불러오면 옆 칸의 CSS 가 공유 조각으로 갈라져 앱과 다른 순서로 실리기 때문에 따로 읽는다.
try {
  const theme = localStorage.getItem('worksheet-theme');
  if (theme === 'light' || theme === 'dark') document.documentElement.dataset.theme = theme;
} catch { /* 저장소가 없으면 운영체제 설정을 따른다 */ }

const form = document.getElementById('decoy-form') as HTMLFormElement | null;
const input = document.getElementById('decoy') as HTMLInputElement | null;
const clear = document.getElementById('decoy-clear');
const status = document.getElementById('decoy-status');
const shortcut = document.getElementById('shortcut');
const shortcutEdit = document.getElementById('shortcut-edit');
if (!form || !input || !clear || !status || !shortcut || !shortcutEdit) {
  throw new Error('설정 화면의 칸을 찾지 못했습니다.');
}

function say(text: string, tone: 'ok' | 'bad' | 'plain' = 'plain'): void {
  status!.textContent = text;
  status!.dataset.tone = tone;
}

async function save(raw: string): Promise<void> {
  const checked = checkDecoyUrl(raw);
  if (!checked.ok) {
    input!.setAttribute('aria-invalid', 'true');
    say(checked.reason, 'bad');
    return;
  }
  input!.removeAttribute('aria-invalid');
  input!.value = checked.url;
  await chrome.storage.local.set({ [DECOY_URL]: checked.url });
  say(checked.url === '' ? '업무 탭을 쓰지 않습니다. 보스 키는 가리고 닫기만 합니다.' : '저장했습니다. 다음 보스 키부터 이 주소를 엽니다.', 'ok');
}

form.addEventListener('submit', (event) => {
  event.preventDefault();
  void save(input.value);
});
clear.addEventListener('click', () => {
  input.value = '';
  void save('');
});
input.addEventListener('input', () => {
  input.removeAttribute('aria-invalid');
  say('');
});

void chrome.storage.local.get(DECOY_URL).then((stored) => {
  const value = stored[DECOY_URL];
  if (typeof value === 'string') input.value = value;
});

void chrome.commands.getAll().then((commands) => {
  const key = commands.find((command) => command.name === 'boss-key')?.shortcut;
  shortcut.textContent = key || '지정 안 됨';
});

// 단축키는 브라우저의 확장 단축키 화면에서만 바꿀 수 있다. 주소를 여는 것뿐이다.
shortcutEdit.addEventListener('click', () => void chrome.tabs.create({ url: 'chrome://extensions/shortcuts' }));
