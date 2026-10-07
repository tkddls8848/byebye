/**
 * 업무 탭 주소 검사.
 *
 * 보스 키를 누르면 앞으로 가져올 페이지다. 확장은 그 탭을 열거나 앞으로
 * 가져오기만 하고 내용·주소를 읽지 않는다. 그래도 받는 주소는 좁힌다.
 */

export type DecoyCheck = { ok: true; url: string } | { ok: false; reason: string };

const MAX_LENGTH = 2048;

export function checkDecoyUrl(raw: string): DecoyCheck {
  const text = raw.trim();
  // 비워 두면 업무 탭 기능을 끈다(기본값).
  if (text === '') return { ok: true, url: '' };
  if (text.length > MAX_LENGTH) return { ok: false, reason: '주소가 너무 깁니다.' };

  let url: URL;
  try {
    url = new URL(text);
  } catch {
    return { ok: false, reason: 'https:// 로 시작하는 전체 주소를 넣으십시오.' };
  }
  // javascript:·data:·file:·chrome: 같은 것은 "페이지 열기"가 아니다. http 는 가로챌 수 있다.
  if (url.protocol !== 'https:') return { ok: false, reason: 'https 주소만 쓸 수 있습니다.' };
  // 주소에 아이디·비밀번호를 담아 저장하지 않는다.
  if (url.username !== '' || url.password !== '') {
    return { ok: false, reason: '아이디·비밀번호가 담긴 주소는 받지 않습니다.' };
  }
  if (url.hostname === '') return { ok: false, reason: '사이트 주소가 비어 있습니다.' };
  return { ok: true, url: url.href };
}
