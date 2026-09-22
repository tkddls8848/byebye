import type { FireInput } from './model';
import type { Offer } from './recommend';
import type { RateType } from './products';

export type PlanAsset = 'deposit' | 'installment';

/** One contract, funded from existing assets / savings, never additional money. */
export interface ProductPlan {
  company: string;
  name: string;
  disclosureMonth: string;
  amount: number;
  termMonths: number;
  rate: number;
  rateType: RateType;
  preferential: boolean;
  maxLimit: number | null;
}

export const PLAN_ASSETS: PlanAsset[] = ['deposit', 'installment'];
export const PLAN_LABEL = { deposit: '예금', installment: '적금' };

export function planFromOffer(offer: Offer, amount: number, preferential: boolean): ProductPlan {
  return {
    company: offer.product.company,
    name: offer.product.name,
    disclosureMonth: offer.product.disclosureMonth,
    amount,
    termMonths: offer.option.termMonths,
    rate: preferential ? offer.option.topRate : offer.option.rate,
    rateType: offer.option.rateType,
    preferential,
    maxLimit: offer.product.maxLimit,
  };
}

/** Validate storage/share data as well as selections, without silently resizing a contract. */
export function planError(input: FireInput, asset: PlanAsset, plan: ProductPlan): string | null {
  if (!plan || !Number.isFinite(plan.amount) || plan.amount <= 0 || plan.amount > 1e9 ||
      !Number.isInteger(plan.termMonths) || plan.termMonths < 1 || plan.termMonths > 120 ||
      !Number.isFinite(plan.rate) || plan.rate < 0 || plan.rate > 100 ||
      !['simple', 'compound'].includes(plan.rateType) ||
      (plan.maxLimit !== null && (!Number.isFinite(plan.maxLimit) || plan.maxLimit < 0))) {
    return '상품 금액·기간·금리 또는 한도가 올바르지 않습니다. 상품을 다시 선택하세요.';
  }
  if (plan.maxLimit !== null && plan.maxLimit > 0 && plan.amount * 10_000 > plan.maxLimit) {
    return '선택한 금액이 공시 최고한도를 초과합니다.';
  }
  if (plan.termMonths > Math.round((input.retireAge - input.age) * 12)) {
    return '목표 은퇴 전에 만기가 도래하는 상품을 선택하세요.';
  }
  if (asset === 'deposit') {
    return plan.amount > input.deposit.amount ? '예치금액이 현재 예금 자산을 초과합니다. 금액을 줄이거나 모은 돈을 수정하세요.' : null;
  }
  const total = input.deposit.allocation + input.installment.allocation + input.bond.allocation + input.equity.allocation;
  const allocation = total > 0 ? input.installment.allocation / (Math.abs(total - 100) > 0.5 ? total : 100) : 0;
  const lastSaving = input.monthlySaving * Math.pow(1 + input.savingGrowth / 100, (plan.termMonths - 1) / 12);
  const budget = Math.min(input.monthlySaving, lastSaving) * allocation;
  return !Number.isFinite(budget) || plan.amount > budget + 1e-8
    ? '월 납입액이 가입기간 중 적금에 배분된 월 저축액을 초과합니다. 금액이나 저축 배분을 조정하세요.' : null;
}

export function withoutPlans(input: FireInput): FireInput {
  const baseline = { ...input };
  delete baseline.productPlans;
  return baseline;
}
