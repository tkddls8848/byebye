import { describe, expect, it } from 'vitest';
import { calculate, defaultInput, type FireInput } from './model';
import { planError, withoutPlans, type ProductPlan } from './product-plan';
import { decodeShare, encodeShare } from './share';

const plan = (overrides: Partial<ProductPlan> = {}): ProductPlan => ({
  company: '테스트 은행', name: '테스트 상품', disclosureMonth: '202609',
  amount: 1000, termMonths: 12, rate: 6, rateType: 'simple',
  preferential: false, maxLimit: null, ...overrides,
});

const input = (): FireInput => ({
  ...defaultInput(), age: 40, retireAge: 41, lifeAge: 45,
  deposit: { amount: 2000, rate: 0, allocation: 0 },
  installment: { amount: 100, rate: 0, allocation: 100 },
  bond: { amount: 0, rate: 0, allocation: 0 },
  equity: { amount: 0, rate: 0, allocation: 0 },
  monthlySaving: 100, savingGrowth: 0, taxRate: 15.4,
  comprehensiveTax: false, equityGrowth: 0,
});

describe('상품 계약을 은퇴자산에 반영', () => {
  it('예금 원금을 중복 추가하지 않고 선택한 금액의 단리 세후 이자만 더한다', () => {
    const i = input();
    i.productPlans = { deposit: plan() };
    expect(calculate(i).assetsAtRetire).toBeCloseTo(2000 + 100 + 1200 + 60 * 0.846, 8);
  });

  it('월복리는 만기까지 세전으로 복리 계산하고 만기에 한 번 과세한다', () => {
    const i = input();
    i.productPlans = { deposit: plan({ rateType: 'compound' }) };
    expect(calculate(i).assetsAtRetire).toBeCloseTo(3300 + 1000 * ((1 + 0.06 / 12) ** 12 - 1) * 0.846, 8);
  });

  it('적금은 월 저축의 일부를 충당하고 회차별 이자를 적용하며 기존 적금 잔액은 유지한다', () => {
    const i = input();
    i.productPlans = { installment: plan({ amount: 50 }) };
    expect(calculate(i).assetsAtRetire).toBeCloseTo(3300 + 50 * 0.005 * 78 * 0.846, 8);
  });

  it('적금 월복리와 예금을 동시에 적용한다', () => {
    const i = input();
    i.productPlans = { deposit: plan(), installment: plan({ amount: 50, rateType: 'compound' }) };
    const interest = Array.from({ length: 12 }, (_, k) => 50 * ((1.005) ** (k + 1) - 1)).reduce((a, b) => a + b, 0);
    expect(calculate(i).assetsAtRetire).toBeCloseTo(3300 + (60 + interest) * 0.846, 8);
  });

  it('6개월 만기 이후에는 기존 예금 수익률로 운용하고 자동 재가입하지 않는다', () => {
    const i = input();
    i.deposit = { amount: 1000, rate: 12, allocation: 0 };
    i.installment.amount = 0;
    i.monthlySaving = 0;
    i.taxRate = 0;
    i.productPlans = { deposit: plan({ termMonths: 6 }) };
    expect(calculate(i).assetsAtRetire).toBeCloseTo(1030 * Math.sqrt(1.12), 8);
  });

  it('24개월 상품의 미지급 이자는 1년 자산에 미리 넣지 않는다', () => {
    const i = input();
    i.retireAge = 42;
    i.productPlans = { deposit: plan({ termMonths: 24 }) };
    expect(calculate(i).path[1]!.assets).toBeCloseTo(3300, 8);
    expect(calculate(i).assetsAtRetire).toBeCloseTo(4500 + 120 * 0.846, 8);
  });

  it('상품 만기 이전을 은퇴 가능 시점으로 제시하지 않는다', () => {
    const i = input();
    i.living = i.housing = i.medical = i.other = 0;
    i.hasCar = false;
    expect(calculate(i).earliestMonths).toBe(0);
    i.productPlans = { deposit: plan() };
    expect(calculate(i).earliestMonths).toBe(12);
  });

  it('목표 월 저축액은 적금 계약을 납입할 수 있는 금액보다 작지 않다', () => {
    const i = input();
    i.living = i.housing = i.medical = i.other = 0;
    i.hasCar = false;
    i.productPlans = { installment: plan({ amount: 50 }) };
    expect(calculate(i).requiredMonthlySaving).toBeCloseTo(50, 5);
  });

  it('과도한 상품 금액은 적용하지 않고 원래 결과와 사유를 반환한다', () => {
    const i = input();
    const baseline = calculate(i);
    i.productPlans = { deposit: plan({ amount: 3000 }), installment: plan({ amount: 150 }) };
    const result = calculate(i);
    expect(result.assetsAtRetire).toBe(baseline.assetsAtRetire);
    expect(result.warnings.filter((w) => w.includes('적용 제외'))).toHaveLength(2);
  });

  it('원 단위 공시한도, 가입기간, 저축액 감소를 검증한다', () => {
    const i = input();
    expect(planError(i, 'deposit', plan({ maxLimit: 9_000_000 }))).toContain('한도');
    expect(planError(i, 'deposit', plan({ maxLimit: 10_000_000 }))).toBeNull();
    expect(planError(i, 'deposit', plan({ termMonths: 24 }))).toContain('만기');
    i.savingGrowth = -10;
    expect(planError(i, 'installment', plan({ amount: 100 }))).toContain('월 저축액');
  });

  it('금융소득 종합과세에 상품 만기 이자를 포함한다', () => {
    const i = input();
    i.deposit.amount = 100000;
    i.productPlans = { deposit: plan({ amount: 100000 }) };
    i.comprehensiveTax = true;
    i.comprehensiveRate = 30;
    expect(calculate(i).assetsAtRetire).toBeCloseTo(101300 + 6000 * 0.846 - 4000 * 0.146, 6);
  });

  it('연말 전에 만기와 은퇴가 겹쳐도 종합과세 예상액을 누락하지 않는다', () => {
    const i = input();
    i.retireAge = 40.5;
    i.deposit.amount = 100000;
    i.productPlans = { deposit: plan({ amount: 100000, termMonths: 6 }) };
    i.comprehensiveTax = true;
    i.comprehensiveRate = 30;
    expect(calculate(i).assetsAtRetire).toBeCloseTo(100700 + 3000 * 0.846 - 1000 * 0.146, 6);
  });

  it('적용 해제는 원본 입력을 변경하지 않는다', () => {
    const i = input();
    i.productPlans = { deposit: plan() };
    expect(withoutPlans(i).productPlans).toBeUndefined();
    expect(i.productPlans.deposit).toBeDefined();
  });

  it('새 공유 링크는 예금·적금 계산 조건을 복원한다', () => {
    const i = input();
    i.productPlans = { deposit: plan(), installment: plan({ amount: 50, preferential: true, rateType: 'compound' }) };
    const encoded = encodeShare(i);
    expect(encoded.length).toBeLessThan(512);
    const restored = decodeShare(encoded)!;
    expect(calculate(restored)).toEqual(calculate(i));
    expect(restored.productPlans?.installment?.preferential).toBe(true);
    expect(decodeShare(encoded.slice(0, -3))).toBeNull();
  });

  it('기존 공유 링크는 상품 없는 입력으로 계속 열린다', () => {
    expect(decodeShare(encodeShare(input()))).toEqual(input());
  });
});
