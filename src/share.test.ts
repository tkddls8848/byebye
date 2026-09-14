import { describe, expect, it } from 'vitest';

import { calculate, defaultInput } from './model';
import { SHARE_PARAM, decodeShare, encodeShare, shareMeta } from './share';

describe('공유 링크 담기', () => {
  it('넣은 값을 그대로 되돌린다', () => {
    const input = defaultInput();
    input.age = 41;
    input.retireAge = 52;
    input.monthlySaving = 315;
    input.inflation = 2.35;
    input.married = true;
    input.hasCar = false;
    input.equity.allocation = 45;
    input.deposit.allocation = 15;

    const back = decodeShare(encodeShare(input));
    expect(back).toEqual(input);
  });

  it('주소에 그대로 쓸 수 있는 글자만 쓴다', () => {
    const text = encodeShare(defaultInput());
    expect(text).toMatch(/^[0-9._-]+$/);
    expect(encodeURIComponent(text)).toBe(text);
  });

  it('카카오톡에서 접히지 않을 만큼 짧다', () => {
    expect(encodeShare(defaultInput()).length).toBeLessThan(300);
  });

  it('형식 번호가 없거나 다르면 읽지 않는다', () => {
    expect(decodeShare('')).toBeNull();
    expect(decodeShare(null)).toBeNull();
    expect(decodeShare('9_35_50_95')).toBeNull();
    expect(decodeShare('사람이 손으로 적은 글')).toBeNull();
  });

  it('너무 긴 값은 읽지 않는다', () => {
    expect(decodeShare(`1_${'9'.repeat(600)}`)).toBeNull();
  });

  it('항목이 모자라면 나머지를 기본값으로 채운다', () => {
    const back = decodeShare('1_44');
    expect(back).not.toBeNull();
    expect(back!.age).toBe(44);
    expect(back!.retireAge).toBe(defaultInput().retireAge);
  });

  it('항목이 더 붙어 있어도 아는 데까지 읽는다', () => {
    const text = `${encodeShare(defaultInput())}_1_2_3`;
    expect(decodeShare(text)).toEqual(defaultInput());
  });

  it('범위를 벗어난 값은 그 항목만 기본값으로 둔다', () => {
    const back = decodeShare('1_-5_50_95');
    expect(back!.age).toBe(defaultInput().age);
    expect(back!.retireAge).toBe(50);
  });

  it('숫자가 아닌 값이 끼어도 무너지지 않는다', () => {
    const back = decodeShare('1_35_NaN_Infinity_abc');
    expect(back!.age).toBe(35);
    expect(back!.retireAge).toBe(defaultInput().retireAge);
    expect(back!.lifeAge).toBe(defaultInput().lifeAge);
  });

  it('담는 이름이 바뀌지 않는다', () => {
    expect(SHARE_PARAM).toBe('s');
  });
});

describe('미리보기 글귀', () => {
  it('은퇴할 수 있으면 그 나이를 제목에 적는다', () => {
    const input = defaultInput();
    input.monthlySaving = 900;
    const result = calculate(input);
    const meta = shareMeta(input, result);
    expect(result.earliestMonths).not.toBeNull();
    expect(meta.title).toContain('은퇴');
    expect(meta.title).toContain('FIRE 계산기');
    expect(meta.image).toBe(`/og-${result.verdict}.png`);
  });

  it('어려우면 어렵다고 적는다', () => {
    const input = defaultInput();
    input.monthlySaving = 0;
    input.deposit.amount = 0;
    input.installment.amount = 0;
    input.bond.amount = 0;
    input.equity.amount = 0;
    input.living = 500;
    const result = calculate(input);
    const meta = shareMeta(input, result);
    expect(result.earliestMonths).toBeNull();
    expect(meta.title).toContain('어렵습니다');
    expect(meta.image).toBe('/og-impossible.png');
  });

  it('설명에 자산과 지출을 함께 담는다', () => {
    const input = defaultInput();
    const meta = shareMeta(input, calculate(input));
    expect(meta.description).toContain('예상 자산');
    expect(meta.description).toContain('필요 자산');
    expect(meta.description).toContain('월 지출');
    expect(meta.description.length).toBeLessThan(200);
  });
});
