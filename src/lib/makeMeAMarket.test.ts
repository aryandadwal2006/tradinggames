import { describe, expect, it } from 'vitest';
import {
  describeCounterpartyOutcome,
  generateMarketMakingSession,
  getMarketMakingQuestionCount,
  MAKE_MARKET_MAX_SPREAD_FRACTION,
  settleMarketMakingQuote,
  settleMarketMakingRound,
  summarizeMarketMakingSession,
  validateConfidenceInterval,
  validateMarketQuote
} from './makeMeAMarket';
import { SeededRandom } from './rng';

describe('Make Me a Market', () => {
  it('generates a reproducible shuffled set of distinct questions', () => {
    const first = generateMarketMakingSession(new SeededRandom(8431));
    const second = generateMarketMakingSession(new SeededRandom(8431));
    expect(first).toEqual(second);
    expect(first).toHaveLength(5);
    expect(new Set(first.map((question) => question.id)).size).toBe(5);
  });

  it('rejects invalid session counts and intervals', () => {
    expect(() => generateMarketMakingSession(new SeededRandom(1), 0)).toThrow(RangeError);
    expect(() => generateMarketMakingSession(new SeededRandom(1), getMarketMakingQuestionCount() + 1)).toThrow(RangeError);
    expect(validateConfidenceInterval(10, 20)).toBe(true);
    expect(validateConfidenceInterval(20, 10)).toBe(false);
    expect(validateConfidenceInterval(0, 10)).toBe(false);
    expect(validateConfidenceInterval(1, Number.POSITIVE_INFINITY)).toBe(false);
  });

  it('enforces a positive ordered market and the configured spread cap', () => {
    expect(validateMarketQuote(90, 110)).toBe(true);
    expect(validateMarketQuote(90, 140)).toBe(false);
    expect(validateMarketQuote(0, 10)).toBe(false);
    expect(validateMarketQuote(20, 20)).toBe(false);
    expect(validateMarketQuote(30, 20)).toBe(false);
    expect(validateMarketQuote(90, 110, 0.3)).toBe(true);
  });

  it('models an informed counterparty selling to a high bid', () => {
    const result = settleMarketMakingQuote(100, { bid: 105, ask: 125 });
    expect(result.outcome).toBe('bought-at-bid');
    expect(result.tradePrice).toBe(105);
    expect(result.positionChange).toBe(1);
    expect(result.pnl).toBe(-5);
    expect(describeCounterpartyOutcome(result.outcome)).toContain('You buy');
  });

  it('models an informed counterparty buying at a low ask', () => {
    const result = settleMarketMakingQuote(100, { bid: 75, ask: 95 });
    expect(result.outcome).toBe('sold-at-ask');
    expect(result.tradePrice).toBe(95);
    expect(result.positionChange).toBe(-1);
    expect(result.pnl).toBe(-5);
    expect(describeCounterpartyOutcome(result.outcome)).toContain('You sell');
  });

  it('passes without trading when the reference value is inside the quote', () => {
    const result = settleMarketMakingQuote(100, { bid: 90, ask: 110 });
    expect(result.outcome).toBe('pass');
    expect(result.tradePrice).toBeNull();
    expect(result.pnl).toBe(0);
    expect(result.positionChange).toBe(0);
  });

  it('settles interval coverage and summarizes P&L without claiming platform skill points', () => {
    const questions = generateMarketMakingSession(new SeededRandom(2), 2);
    const first = settleMarketMakingRound(questions[0]!, questions[0]!.answer * 0.9, questions[0]!.answer * 1.1, {
      bid: questions[0]!.answer * 0.9, ask: questions[0]!.answer * 1.1
    }, 10);
    const second = settleMarketMakingRound(questions[1]!, questions[1]!.answer * 0.9, questions[1]!.answer * 1.1, {
      bid: questions[1]!.answer * 0.9, ask: questions[1]!.answer * 1.1
    }, 20);
    const summary = summarizeMarketMakingSession([first, second], 35, '2026-10-27T00:00:00Z');
    expect(summary.rounds).toBe(2);
    expect(summary.intervalCoverage).toBe(1);
    expect(summary.passes).toBe(2);
    expect(summary.rawProfit).toBe(0);
    expect(summary.averageSpreadFraction).toBeCloseTo(0.2 / 1.0, 1);
    expect(summary.durationSeconds).toBe(35);
  });

  it('does not allow question answers to be zero or invalid', () => {
    expect(() => settleMarketMakingQuote(0, { bid: 1, ask: 2 }, 10)).toThrow(RangeError);
    expect(MAKE_MARKET_MAX_SPREAD_FRACTION).toBe(0.4);
  });
});