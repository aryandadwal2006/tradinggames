import { describe, expect, it } from 'vitest';
import {
  evaluateFermiEstimate,
  generateFermiSession,
  getFermiQuestionCount,
  median,
  summarizeFermiSession,
  type FermiRoundResult
} from './fermiChallenge';
import { SeededRandom } from './rng';

describe('Fermi practice question selection', () => {
  it('selects unique questions and is reproducible by seed', () => {
    const a = generateFermiSession(new SeededRandom(1841));
    const b = generateFermiSession(new SeededRandom(1841));
    expect(a).toEqual(b);
    expect(a).toHaveLength(12);
    expect(new Set(a.map((question) => question.id)).size).toBe(a.length);
  });

  it('includes public TraderMath prompts as unhinted guess-first rounds with source links revealed afterward', () => {
    const questions = generateFermiSession(new SeededRandom(19), getFermiQuestionCount());
    const sourceQuestions = questions.filter((question) => question.sourceUrl);
    expect(sourceQuestions.length).toBe(8);
    expect(sourceQuestions.every((question) => question.prompt.length > 10 && question.referenceAnswer > 0)).toBe(true);
    expect(sourceQuestions.every((question) => question.decomposition.length > 10)).toBe(true);
    expect(sourceQuestions.map((question) => question.id)).toEqual(expect.arrayContaining([
      'tradermath-backyard-pool',
      'tradermath-melbourne-piano-tuners',
      'tradermath-shanghai-bubble-tea',
      'tradermath-concrete-basketball',
      'tradermath-empire-state-windows',
      'tradermath-big-mac-calories',
      'tradermath-jfk-departures',
      'tradermath-m-and-ms-jar'
    ]));
  });

  it('allows explicit round counts within the bank size', () => {
    expect(generateFermiSession(new SeededRandom(42), 1)).toHaveLength(1);
    expect(generateFermiSession(new SeededRandom(42), getFermiQuestionCount())).toHaveLength(getFermiQuestionCount());
    expect(() => generateFermiSession(new SeededRandom(42), 0)).toThrow(RangeError);
    expect(() => generateFermiSession(new SeededRandom(42), getFermiQuestionCount() + 1)).toThrow(RangeError);
  });

  it('measures overestimates and underestimates symmetrically', () => {
    expect(evaluateFermiEstimate(100, 200)?.factorError).toBe(2);
    expect(evaluateFermiEstimate(100, 50)?.factorError).toBe(2);
    expect(evaluateFermiEstimate(100, 100)?.factorError).toBe(1);
  });

  it('rejects invalid estimate values', () => {
    expect(evaluateFermiEstimate(0, 2)).toBeNull();
    expect(evaluateFermiEstimate(1, 0)).toBeNull();
    expect(evaluateFermiEstimate(1, Number.NaN)).toBeNull();
  });

  it('computes the usual median for odd and even sized samples', () => {
    expect(median([9, 1, 5])).toBe(5);
    expect(median([1, 3, 5, 9])).toBe(4);
    expect(median([])).toBeNull();
  });

  it('summarizes submitted and skipped rounds without inventing a point score', () => {
    const question = generateFermiSession(new SeededRandom(87), 2);
    const oneEvaluation = evaluateFermiEstimate(question[0]!.referenceAnswer, question[0]!.referenceAnswer * 2)!;
    const results: FermiRoundResult[] = [
      { question: question[0]!, estimate: oneEvaluation.estimate, skipped: false, elapsedMs: 12000, evaluation: oneEvaluation },
      { question: question[1]!, estimate: null, skipped: true, elapsedMs: 25000, evaluation: null }
    ];
    const summary = summarizeFermiSession(results, 37, '2026-10-27T00:00:00.000Z');
    expect(summary.submitted).toBe(1);
    expect(summary.skipped).toBe(1);
    expect(summary.medianFactorError).toBe(2);
    expect(summary.geometricMeanFactorError).toBeCloseTo(2);
    expect(summary.durationSeconds).toBe(37);
  });
});