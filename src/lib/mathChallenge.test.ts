import { describe, expect, it } from 'vitest';
import { generateMathQuestion, isAnswerCorrect, parseRationalInput, pointsForAnswer } from './mathChallenge';
import { SeededRandom } from './rng';

describe('Math Challenge question generation', () => {
  it('is reproducible for a fixed seed', () => {
    const first = new SeededRandom(71823);
    const second = new SeededRandom(71823);
    const firstRun = Array.from({ length: 30 }, (_, index) => generateMathQuestion(first, 'full', index + 1));
    const secondRun = Array.from({ length: 30 }, (_, index) => generateMathQuestion(second, 'full', index + 1));
    expect(firstRun).toEqual(secondRun);
  });

  it.each(['integers', 'decimals', 'fractions'] as const)('generates valid %s questions', (mode) => {
    const rng = new SeededRandom(20261027);
    for (let index = 0; index < 250; index += 1) {
      const question = generateMathQuestion(rng, mode, index + 1);
      expect(question.mode).toBe(mode);
      expect(question.choices).toHaveLength(4);
      expect(new Set(question.choices.map((choice) => choice.value)).size).toBe(4);
      expect(question.choices.filter((choice) => choice.correct)).toHaveLength(1);
      expect(isAnswerCorrect(question, question.answerDisplay)).toBe(true);
      expect(isAnswerCorrect(question, 'not an answer')).toBe(false);
    }
  });

  it('accepts equivalent fractional and decimal answers', () => {
    const fraction = parseRationalInput('6/8');
    const decimal = parseRationalInput('0.75');
    expect(fraction).not.toBeNull();
    expect(decimal).not.toBeNull();
    expect(fraction?.n).toBe(decimal?.n);
    expect(fraction?.d).toBe(decimal?.d);
  });

  it('rejects invalid rational input and division by zero', () => {
    expect(parseRationalInput('')).toBeNull();
    expect(parseRationalInput('3/0')).toBeNull();
    expect(parseRationalInput('1/2/3')).toBeNull();
  });

  it('uses the specified net scoring rule', () => {
    expect(pointsForAnswer(true)).toBe(1);
    expect(pointsForAnswer(false)).toBe(-1);
  });

  it('handles different denominators with exact arithmetic', () => {
    const rng = new SeededRandom(99);
    const questions = Array.from({ length: 200 }, (_, index) => generateMathQuestion(rng, 'fractions', index + 1));
    expect(questions.every((question) => Number.isFinite(question.answer.n / question.answer.d))).toBe(true);
  });
});

describe('SeededRandom', () => {
  it('produces bounded integers', () => {
    const rng = new SeededRandom(123);
    for (let index = 0; index < 1000; index += 1) {
      const value = rng.int(4, 9);
      expect(value).toBeGreaterThanOrEqual(4);
      expect(value).toBeLessThanOrEqual(9);
    }
  });

  it('rejects invalid bounds and empty picks', () => {
    const rng = new SeededRandom(1);
    expect(() => rng.int(5, 4)).toThrow(RangeError);
    expect(() => rng.pick([])).toThrow(RangeError);
  });
});