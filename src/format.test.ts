import { describe, expect, it } from 'vitest';
import { formatAge, formatMan, formatShort } from './format';

describe('formatMan', () => {
  it('만원 단위를 억과 만원으로 나눠 적는다', () => {
    expect(formatMan(3_500)).toBe('3,500만원');
    expect(formatMan(78_253)).toBe('7억 8,253만원');
    expect(formatMan(50_000)).toBe('5억원');
  });

  it('1조 이상은 조로, 1경 이상은 경으로 적는다', () => {
    expect(formatMan(99_990_000)).toBe('9,999억원');
    expect(formatMan(150_000_000)).toBe('1.5조원');
    expect(formatMan(2_000_000_000_000)).toBe('2.0경원');
  });

  it('음수는 0으로 적는다', () => {
    expect(formatMan(-10)).toBe('0만원');
  });
});

describe('formatShort', () => {
  it('축 눈금을 짧게 적는다', () => {
    expect(formatShort(7_700)).toBe('7,700만');
    expect(formatShort(77_000)).toBe('7.7억');
    expect(formatShort(1_550_000)).toBe('155억');
  });

  it('155억을 조로 적지 않는다', () => {
    expect(formatShort(1_550_000)).not.toContain('조');
    expect(formatShort(150_000_000)).toBe('1.5조');
    expect(formatShort(1_500_000_000)).toBe('15조');
  });
});

describe('formatAge', () => {
  it('개월 수를 나이로 적는다', () => {
    expect(formatAge(35, 0)).toBe('35세');
    expect(formatAge(35, 269)).toBe('57세 5개월');
  });
});
