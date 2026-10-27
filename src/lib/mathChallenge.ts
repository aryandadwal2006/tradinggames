import type { SeededRandom } from './rng';

export type MathMode = 'full' | 'integers' | 'decimals' | 'fractions';
export type ConcreteMathMode = Exclude<MathMode, 'full'>;
export type Operator = '+' | '−' | '×' | '÷';

export interface Rational {
  n: number;
  d: number;
}

export interface MathChoice {
  id: string;
  value: string;
  correct: boolean;
}

export interface MathQuestion {
  id: string;
  mode: ConcreteMathMode;
  prompt: string;
  answer: Rational;
  answerDisplay: string;
  explanation: string;
  choices: MathChoice[];
}

export interface MathSessionSummary {
  score: number;
  correct: number;
  incorrect: number;
  mode: MathMode;
  durationSeconds: number;
  playedAt: string;
}

const concreteModes: ConcreteMathMode[] = ['integers', 'decimals', 'fractions'];
const operators: Operator[] = ['+', '−', '×', '÷'];

function gcd(a: number, b: number): number {
  let left = Math.abs(a);
  let right = Math.abs(b);
  while (right !== 0) {
    const remainder = left % right;
    left = right;
    right = remainder;
  }
  return left || 1;
}

export function rational(numerator: number, denominator = 1): Rational {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator)) {
    throw new TypeError('Rational values must be finite.');
  }
  if (denominator === 0) throw new RangeError('A rational denominator cannot be zero.');
  const sign = denominator < 0 ? -1 : 1;
  const divisor = gcd(numerator, denominator);
  return {
    n: (sign * numerator) / divisor,
    d: (sign * denominator) / divisor
  };
}

function add(left: Rational, right: Rational): Rational {
  return rational(left.n * right.d + right.n * left.d, left.d * right.d);
}

function subtract(left: Rational, right: Rational): Rational {
  return rational(left.n * right.d - right.n * left.d, left.d * right.d);
}

function multiply(left: Rational, right: Rational): Rational {
  return rational(left.n * right.n, left.d * right.d);
}

function divide(left: Rational, right: Rational): Rational {
  if (right.n === 0) throw new RangeError('Cannot divide by zero.');
  return rational(left.n * right.d, left.d * right.n);
}

function applyOperator(left: Rational, right: Rational, operator: Operator): Rational {
  switch (operator) {
    case '+': return add(left, right);
    case '−': return subtract(left, right);
    case '×': return multiply(left, right);
    case '÷': return divide(left, right);
  }
}

function decimalText(value: Rational): string {
  const number = value.n / value.d;
  if (Number.isInteger(number)) return String(number);
  return number.toFixed(4).replace(/0+$/, '').replace(/\.$/, '');
}

export function formatRational(value: Rational, mode: ConcreteMathMode): string {
  const normalized = rational(value.n, value.d);
  if (mode === 'fractions' && normalized.d !== 1) {
    return String(normalized.n) + '/' + String(normalized.d);
  }
  return decimalText(normalized);
}

function operandText(value: Rational, mode: ConcreteMathMode): string {
  if (mode === 'fractions') return formatRational(value, mode);
  return formatRational(value, mode);
}

function makeIntegerProblem(rng: SeededRandom, operator: Operator): [Rational, Rational] {
  if (operator === '÷') {
    const divisor = rng.int(2, 15);
    const quotient = rng.int(2, 30);
    return [rational(divisor * quotient), rational(divisor)];
  }
  const left = rng.int(2, 99);
  const right = operator === '×' ? rng.int(2, 15) : rng.int(2, 99);
  return [rational(left), rational(right)];
}

function makeDecimalProblem(rng: SeededRandom, operator: Operator): [Rational, Rational] {
  if (operator === '÷') {
    const divisor = rng.int(2, 9);
    const answerTenths = rng.int(1, 150);
    return [rational(answerTenths * divisor, 10), rational(divisor)];
  }
  const left = rational(rng.int(1, 999), 10);
  const right = rational(rng.int(1, operator === '×' ? 99 : 999), 10);
  return [left, right];
}

function makeFractionProblem(rng: SeededRandom, operator: Operator): [Rational, Rational] {
  const left = rational(rng.int(1, 15), rng.int(2, 12));
  const right = rational(rng.int(1, 15), rng.int(2, 12));
  return [left, right];
}

function distractorFor(
  answer: Rational,
  mode: ConcreteMathMode,
  rng: SeededRandom
): Rational {
  if (mode === 'integers') {
    const offset = rng.pick([-9, -7, -5, -3, -2, -1, 1, 2, 3, 5, 7, 9]);
    return add(answer, rational(offset));
  }
  if (mode === 'decimals') {
    const offset = rng.pick([-2, -1.5, -1, -0.5, -0.3, -0.2, 0.2, 0.3, 0.5, 1, 1.5, 2]);
    return add(answer, rational(Math.round(offset * 10), 10));
  }
  const offsets: Rational[] = [
    rational(-3, 4), rational(-2, 3), rational(-1, 2), rational(-1, 3),
    rational(-1, 4), rational(1, 4), rational(1, 3), rational(1, 2),
    rational(2, 3), rational(3, 4)
  ];
  return add(answer, rng.pick(offsets));
}

export function generateMathQuestion(
  rng: SeededRandom,
  requestedMode: MathMode = 'full',
  ordinal = 1
): MathQuestion {
  const mode = requestedMode === 'full' ? rng.pick(concreteModes) : requestedMode;
  const operator = rng.pick(operators);
  let operands: [Rational, Rational];

  if (mode === 'integers') operands = makeIntegerProblem(rng, operator);
  else if (mode === 'decimals') operands = makeDecimalProblem(rng, operator);
  else operands = makeFractionProblem(rng, operator);

  const [left, right] = operands;
  const answer = applyOperator(left, right, operator);
  const leftText = operandText(left, mode);
  const rightText = operandText(right, mode);
  const answerDisplay = formatRational(answer, mode);
  const explanation = leftText + ' ' + operator + ' ' + rightText + ' = ' + answerDisplay;

  const values: Rational[] = [answer];
  const keys = new Set<string>([String(answer.n) + '/' + String(answer.d)]);
  let attempts = 0;
  while (values.length < 4 && attempts < 100) {
    attempts += 1;
    const candidate = rational(distractorFor(answer, mode, rng).n, distractorFor(answer, mode, rng).d);
    const key = String(candidate.n) + '/' + String(candidate.d);
    if (!keys.has(key)) {
      keys.add(key);
      values.push(candidate);
    }
  }
  let fallback = 1;
  while (values.length < 4) {
    const candidate = add(answer, rational(fallback));
    const key = String(candidate.n) + '/' + String(candidate.d);
    if (!keys.has(key)) {
      keys.add(key);
      values.push(candidate);
    }
    fallback += 1;
  }

  const choices = rng.shuffle(values).map((value, index) => ({
    id: 'q' + String(ordinal) + '-choice-' + String(index + 1),
    value: formatRational(value, mode),
    correct: value.n * answer.d === answer.n * value.d
  }));

  return {
    id: 'math-' + String(ordinal),
    mode,
    prompt: leftText + ' ' + operator + ' ' + rightText + ' = ?',
    answer,
    answerDisplay,
    explanation,
    choices
  };
}

export function parseRationalInput(input: string): Rational | null {
  const value = input.trim();
  if (value.length === 0) return null;

  const fractionMatch = value.match(/^([+-]?\d+)\s*\/\s*([+-]?\d+)$/);
  if (fractionMatch) {
    const numerator = Number(fractionMatch[1]);
    const denominator = Number(fractionMatch[2]);
    if (!Number.isSafeInteger(numerator) || !Number.isSafeInteger(denominator) || denominator === 0) {
      return null;
    }
    return rational(numerator, denominator);
  }

  if (!/^[+-]?(?:\d+\.?\d*|\.\d+)$/.test(value)) return null;
  const number = Number(value);
  if (!Number.isFinite(number) || Math.abs(number) > 1e9) return null;

  const decimals = value.split('.')[1]?.length ?? 0;
  if (decimals > 8) return null;
  const denominator = 10 ** decimals;
  return rational(Math.round(number * denominator), denominator);
}

export function isAnswerCorrect(question: MathQuestion, rawInput: string): boolean {
  const parsed = parseRationalInput(rawInput);
  if (!parsed) return false;
  return parsed.n * question.answer.d === question.answer.n * parsed.d;
}

export function pointsForAnswer(correct: boolean): number {
  return correct ? 1 : -1;
}

export const MATH_MODES: { value: MathMode; label: string; description: string }[] = [
  { value: 'full', label: 'Full mix', description: 'Integers, decimals, and fractions' },
  { value: 'integers', label: 'Integers', description: 'Whole-number arithmetic' },
  { value: 'decimals', label: 'Decimals', description: 'Decimal arithmetic' },
  { value: 'fractions', label: 'Fractions', description: 'Fraction arithmetic' }
];

export const STANDARD_DURATION_SECONDS = 360;