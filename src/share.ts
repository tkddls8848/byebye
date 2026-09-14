/**
 * 결과를 남에게 보낼 수 있게 만드는 부분.
 *
 * ── 왜 필요한가 ───────────────────────────────────────────────────────────
 *
 * 입력은 `localStorage` 에만 남는다. 그래서 여태 이 계산기는 "내가 본 결과를
 * 남에게 보여 줄 방법" 이 없었다. 링크를 보내도 상대는 기본값 화면을 볼 뿐이다.
 * 계산기가 퍼지는 길은 대개 "이거 해 봤는데 나 45세래" 하고 결과를 건네는
 * 것인데, 건넬 물건이 없었던 셈이다.
 *
 * ── 어떻게 담는가 ─────────────────────────────────────────────────────────
 *
 * 입력 마흔한 개를 정해진 순서대로 늘어놓고 `_` 로 잇는다. JSON 을 base64 로
 * 싸면 800자가 넘어 카카오톡에서 줄이 접히는데, 이렇게 담으면 200자 안팎이다.
 * 소수점이 있으니 이음쇠는 `.` 이 아니라 `_` 여야 하고, `_` 는 URL 에서 따로
 * 인코딩되지 않는 글자라 주소가 지저분해지지 않는다.
 *
 * 맨 앞에 형식 번호를 둔다. 항목은 **뒤에만 붙인다** — 그래야 예전에 주고받은
 * 링크가 계속 열린다. 모자란 항목은 기본값으로 채운다.
 *
 * ── 사생활 ────────────────────────────────────────────────────────────────
 *
 * 이 링크에는 입력한 숫자가 그대로 담긴다. 미리보기 카드를 만들려고 Worker 가
 * 그 주소를 읽기도 한다. 그래서 링크는 **누른 사람에게만** 만들어 주고, 화면에서
 * 그 사실을 함께 알린다. 누르지 않으면 숫자는 여전히 브라우저 밖으로 나가지
 * 않는다.
 */
import { formatAge, formatMan } from './format';
import { FireInput, FireResult, defaultInput } from './model';

/** 주소에 결과를 담을 때 쓰는 이름. */
export const SHARE_PARAM = 's';

/** 형식 번호. 항목 순서를 바꾸거나 뜻을 바꾸면 올린다. */
const VERSION = 1;

/** 장난으로 긴 값을 밀어 넣어도 여기서 끊는다. */
const MAX_LENGTH = 512;

type Slot = {
  get: (input: FireInput) => number;
  set: (input: FireInput, value: number) => void;
  /** 받아들이는 범위. 벗어나면 그 항목만 기본값으로 둔다. */
  min: number;
  max: number;
};

const n = (
  get: (input: FireInput) => number,
  set: (input: FireInput, value: number) => void,
  min: number,
  max: number,
): Slot => ({ get, set, min, max });

const b = (get: (input: FireInput) => boolean, set: (input: FireInput, value: boolean) => void): Slot => ({
  get: (input) => (get(input) ? 1 : 0),
  set: (input, value) => set(input, value === 1),
  min: 0,
  max: 1,
});

/**
 * 담는 순서. **뒤에만 붙일 것** — 중간에 끼우면 예전 링크가 다른 뜻으로 읽힌다.
 */
const SLOTS: Slot[] = [
  n((i) => i.age, (i, v) => (i.age = v), 0, 100),
  n((i) => i.retireAge, (i, v) => (i.retireAge = v), 0, 100),
  n((i) => i.lifeAge, (i, v) => (i.lifeAge = v), 0, 120),

  n((i) => i.deposit.amount, (i, v) => (i.deposit.amount = v), 0, 1e9),
  n((i) => i.deposit.rate, (i, v) => (i.deposit.rate = v), 0, 100),
  n((i) => i.deposit.allocation, (i, v) => (i.deposit.allocation = v), 0, 100),
  n((i) => i.installment.amount, (i, v) => (i.installment.amount = v), 0, 1e9),
  n((i) => i.installment.rate, (i, v) => (i.installment.rate = v), 0, 100),
  n((i) => i.installment.allocation, (i, v) => (i.installment.allocation = v), 0, 100),
  n((i) => i.bond.amount, (i, v) => (i.bond.amount = v), 0, 1e9),
  n((i) => i.bond.rate, (i, v) => (i.bond.rate = v), 0, 100),
  n((i) => i.bond.allocation, (i, v) => (i.bond.allocation = v), 0, 100),
  n((i) => i.equity.amount, (i, v) => (i.equity.amount = v), 0, 1e9),
  n((i) => i.equity.rate, (i, v) => (i.equity.rate = v), 0, 100),
  n((i) => i.equity.allocation, (i, v) => (i.equity.allocation = v), 0, 100),
  n((i) => i.equityGrowth, (i, v) => (i.equityGrowth = v), -100, 100),

  n((i) => i.monthlySaving, (i, v) => (i.monthlySaving = v), 0, 1e7),
  n((i) => i.savingGrowth, (i, v) => (i.savingGrowth = v), -100, 100),

  n((i) => i.living, (i, v) => (i.living = v), 0, 1e7),
  n((i) => i.housing, (i, v) => (i.housing = v), 0, 1e7),
  n((i) => i.medical, (i, v) => (i.medical = v), 0, 1e7),
  n((i) => i.other, (i, v) => (i.other = v), 0, 1e7),

  b((i) => i.married, (i, v) => (i.married = v)),
  n((i) => i.coupleFactor, (i, v) => (i.coupleFactor = v), 0, 10),

  n((i) => i.children, (i, v) => (i.children = v), 0, 20),
  n((i) => i.childCost, (i, v) => (i.childCost = v), 0, 1e7),
  n((i) => i.childYoungestAge, (i, v) => (i.childYoungestAge = v), 0, 100),
  n((i) => i.childUntilAge, (i, v) => (i.childUntilAge = v), 0, 100),

  b((i) => i.hasCar, (i, v) => (i.hasCar = v)),
  n((i) => i.carMonthly, (i, v) => (i.carMonthly = v), 0, 1e7),
  n((i) => i.carReplaceCost, (i, v) => (i.carReplaceCost = v), 0, 1e7),
  n((i) => i.carReplaceYears, (i, v) => (i.carReplaceYears = v), 0, 100),

  n((i) => i.medicalOldAge, (i, v) => (i.medicalOldAge = v), 0, 120),
  n((i) => i.medicalOldFactor, (i, v) => (i.medicalOldFactor = v), 0, 10),

  n((i) => i.inflation, (i, v) => (i.inflation = v), -100, 100),
  n((i) => i.swr, (i, v) => (i.swr = v), 0, 100),

  n((i) => i.taxRate, (i, v) => (i.taxRate = v), 0, 100),
  b((i) => i.comprehensiveTax, (i, v) => (i.comprehensiveTax = v)),
  n((i) => i.comprehensiveRate, (i, v) => (i.comprehensiveRate = v), 0, 100),

  n((i) => i.pensionMonthly, (i, v) => (i.pensionMonthly = v), 0, 1e7),
  n((i) => i.pensionStartAge, (i, v) => (i.pensionStartAge = v), 0, 120),
];

/** 소수점 셋째 자리까지만 적고 꼬리의 0 은 버린다. 주소를 짧게 두려는 것이다. */
function short(value: number): string {
  if (!Number.isFinite(value)) return '0';
  const rounded = Math.round(value * 1000) / 1000;
  return String(rounded);
}

/** 입력을 주소에 담을 수 있는 한 줄로 만든다. */
export function encodeShare(input: FireInput): string {
  return [VERSION, ...SLOTS.map((slot) => short(slot.get(input)))].join('_');
}

/**
 * 주소에서 읽어 입력으로 되돌린다. 읽을 수 없으면 `null`.
 *
 * 남이 손으로 고친 주소가 들어와도 계산이 무너지면 안 된다. 그래서 항목마다
 * 범위를 보고, 벗어나면 그 항목만 조용히 기본값으로 둔다. 통째로 버리지 않는
 * 까닭은 한 글자 깨진 링크에서도 나머지는 살려 보여 주는 편이 낫기 때문이다.
 */
export function decodeShare(text: string | null | undefined): FireInput | null {
  if (!text || text.length > MAX_LENGTH) return null;
  const parts = text.split('_');
  if (Number(parts[0]) !== VERSION || parts.length < 2) return null;

  const input = defaultInput();
  let filled = 0;
  for (const [index, slot] of SLOTS.entries()) {
    const raw = parts[index + 1];
    if (raw === undefined || raw === '') continue;
    const value = Number(raw);
    if (!Number.isFinite(value) || value < slot.min || value > slot.max) continue;
    slot.set(input, value);
    filled += 1;
  }
  return filled > 0 ? input : null;
}

/** 링크 미리보기에 실을 글귀. */
export interface ShareMeta {
  title: string;
  description: string;
  /** 판정에 맞는 미리보기 그림 이름. */
  image: string;
}

const IMAGE: Record<FireResult['verdict'], string> = {
  possible: '/og-possible.png',
  late: '/og-late.png',
  impossible: '/og-impossible.png',
};

/**
 * 결과를 카카오톡·슬랙·커뮤니티가 읽는 한 줄짜리 글귀로 옮긴다.
 *
 * 링크가 퍼지느냐 마느냐는 대개 이 두 줄에서 갈린다. "FIRE 계산기" 라는 제목은
 * 아무것도 말해 주지 않지만 "42세부터 은퇴 가능" 은 눌러 보게 만든다.
 */
export function shareMeta(input: FireInput, result: FireResult): ShareMeta {
  const retireAge = Math.round(input.retireAge);
  let title: string;
  if (result.earliestMonths === null) {
    title = '지금 조건으로는 은퇴가 어렵습니다 · FIRE 계산기';
  } else if (result.verdict === 'possible') {
    title =
      result.earliestMonths === 0
        ? '지금 가진 것만으로 은퇴할 수 있습니다 · FIRE 계산기'
        : `${formatAge(input.age, result.earliestMonths)}부터 은퇴 가능 · FIRE 계산기`;
  } else {
    title = `가장 이른 은퇴는 ${formatAge(input.age, result.earliestMonths)} · FIRE 계산기`;
  }

  const description =
    `${retireAge}세 예상 자산 ${formatMan(result.assetsAtRetire)}, ` +
    `필요 자산 ${formatMan(result.targetAtRetire)}, ` +
    `은퇴 후 월 지출 ${formatMan(result.monthlySpendToday)} 기준입니다. ` +
    '내 조건으로 다시 계산해 보세요.';

  return { title, description, image: IMAGE[result.verdict] };
}
