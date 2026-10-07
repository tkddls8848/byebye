/**
 * 숫자를 한국 사람이 읽는 대로 적는 함수들.
 *
 * 화면(`view.ts`)과 공유 링크(`share.ts`)가 같은 표기를 써야 한다. 공유 링크의
 * 미리보기 글귀는 Worker 안에서 만들어지는데 거기에는 DOM 이 없다. 그래서 서식만
 * 따로 떼어 두 곳에서 같이 쓴다 — 이 파일은 브라우저 API 를 쓰지 않는다.
 */
import type { Man } from './model';

/** 만원 단위 숫자를 한국 사람이 읽는 대로 적는다. */
export function formatMan(man: Man): string {
  const value = Math.round(Math.max(0, man));
  // 1억 = 1만 만원, 1조 = 1억 만원, 1경 = 1조 만원.
  if (value >= 1_000_000_000_000) return `${(value / 1_000_000_000_000).toFixed(1)}경원`;
  if (value >= 100_000_000) return `${(value / 100_000_000).toFixed(1)}조원`;
  if (value >= 10_000) {
    const eok = Math.floor(value / 10_000);
    const rest = value % 10_000;
    return rest > 0 ? `${eok.toLocaleString()}억 ${rest.toLocaleString()}만원` : `${eok.toLocaleString()}억원`;
  }
  return `${value.toLocaleString()}만원`;
}

/** 축 눈금처럼 자리가 좁은 곳에 쓰는 짧은 표기. */
export function formatShort(man: Man): string {
  const value = Math.max(0, man);
  if (value >= 1_000_000_000_000) return `${(value / 1_000_000_000_000).toFixed(1)}경`;
  if (value >= 100_000_000) return `${(value / 100_000_000).toFixed(value >= 1_000_000_000 ? 0 : 1)}조`;
  if (value >= 10_000) return `${(value / 10_000).toFixed(value >= 100_000 ? 0 : 1)}억`;
  return `${Math.round(value).toLocaleString()}만`;
}

/** 개월 수를 나이로 적는다. */
export function formatAge(baseAge: number, months: number): string {
  const total = baseAge * 12 + months;
  const years = Math.floor(total / 12);
  const rest = Math.round(total % 12);
  return rest === 0 ? `${years}세` : `${years}세 ${rest}개월`;
}
