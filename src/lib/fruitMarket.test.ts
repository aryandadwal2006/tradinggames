import { describe, expect, it } from 'vitest';
import {
  advanceFruitMarket,
  calculateFirstClickAccuracy,
  calculateFruitScore,
  computeFruitFairValue,
  createFruitMarket,
  executeFruitTrade,
  summarizeFruitSession,
  FRUIT_MARKET_CONFIG,
  type FruitMarketState,
  type FruitTrade
} from './fruitMarket';
import { SeededRandom } from './rng';

function deterministicMarket(): FruitMarketState {
  const bags = [{ apples: 4, oranges: 5 }, { apples: 6, oranges: 7 }] as const;
  const fairValue = computeFruitFairValue(bags, { kind: 'none', nullifiedBag: null });
  return {
    bags: [{ ...bags[0] }, { ...bags[1] }],
    event: { kind: 'none', nullifiedBag: null },
    fairValue,
    quote: { bid: 60, ask: 70 },
    quoteId: 3,
    secondsUntilUpdate: 16
  };
}

describe('Fruit Market generation', () => {
  it('is reproducible from a seed and creates valid opening bags and quotes', () => {
    const first = createFruitMarket(new SeededRandom(12345), false);
    const second = createFruitMarket(new SeededRandom(12345), false);
    expect(first).toEqual(second);
    for (const bag of first.bags) {
      expect(bag.apples).toBeGreaterThanOrEqual(FRUIT_MARKET_CONFIG.minFruitPerType);
      expect(bag.apples).toBeLessThanOrEqual(FRUIT_MARKET_CONFIG.maxFruitPerType);
      expect(bag.oranges).toBeGreaterThanOrEqual(FRUIT_MARKET_CONFIG.minFruitPerType);
      expect(bag.oranges).toBeLessThanOrEqual(FRUIT_MARKET_CONFIG.maxFruitPerType);
    }
    expect(first.quote.ask).toBeGreaterThan(first.quote.bid);
    expect(first.event.kind).toBe('none');
  });

  it('calculates the basket value and applies event multipliers', () => {
    const bags = [{ apples: 4, oranges: 5 }, { apples: 6, oranges: 7 }] as const;
    expect(computeFruitFairValue(bags, { kind: 'none', nullifiedBag: null })).toBe(120);
    expect(computeFruitFairValue(bags, { kind: 'inflation', nullifiedBag: null })).toBe(240);
    expect(computeFruitFairValue(bags, { kind: 'deflation', nullifiedBag: null })).toBe(60);
    expect(computeFruitFairValue(bags, { kind: 'nullification', nullifiedBag: 0 })).toBe(42);
  });

  it('updates the baskets, advances quote identity, and respects the no-event setting', () => {
    const first = createFruitMarket(new SeededRandom(17), false);
    const next = advanceFruitMarket(first, new SeededRandom(18), false);
    expect(next.quoteId).toBe(first.quoteId + 1);
    expect(next.event.kind).toBe('none');
    expect(next.quote.ask).toBeGreaterThan(next.quote.bid);
    for (const bag of next.bags) {
      expect(bag.apples).toBeLessThanOrEqual(FRUIT_MARKET_CONFIG.maxFruitPerType);
      expect(bag.oranges).toBeLessThanOrEqual(FRUIT_MARKET_CONFIG.maxFruitPerType);
      expect(bag.apples).toBeGreaterThanOrEqual(FRUIT_MARKET_CONFIG.minFruitPerType);
      expect(bag.oranges).toBeGreaterThanOrEqual(FRUIT_MARKET_CONFIG.minFruitPerType);
    }
  });

  it('settles buys at the ask and sells at the bid relative to current fair value', () => {
    const market = deterministicMarket();
    expect(market.fairValue).toBe(120);
    expect(executeFruitTrade(market, 'buy', 'b1', true, 1).pnl).toBe(50);
    expect(executeFruitTrade(market, 'sell', 's1', true, 1).pnl).toBe(-60);
  });

  it('counts accuracy only on the first trade per quote', () => {
    const market = deterministicMarket();
    const trades = [
      { ...executeFruitTrade(market, 'buy', '1', true, 1), pnl: 5 },
      { ...executeFruitTrade(market, 'buy', '2', false, 2), pnl: -100 },
      { ...executeFruitTrade({ ...market, quoteId: 4 }, 'sell', '3', true, 3), pnl: -2 },
      { ...executeFruitTrade({ ...market, quoteId: 5 }, 'buy', '4', true, 4), pnl: 4 }
    ] satisfies FruitTrade[];
    const accuracy = calculateFirstClickAccuracy(trades);
    expect(accuracy.trials).toBe(3);
    expect(accuracy.profitable).toBe(2);
    expect(accuracy.accuracy).toBeCloseTo(2 / 3);
  });

  it('computes the documented raw-profit-times-first-click-accuracy score', () => {
    expect(calculateFruitScore(90, 0.8)).toBe(72);
    expect(calculateFruitScore(90, null)).toBe(0);
    expect(() => calculateFruitScore(1, 1.1)).toThrow(RangeError);
  });

  it('summarizes trades with the same score definition shown in the results screen', () => {
    const trades = [
      { ...executeFruitTrade(deterministicMarket(), 'buy', '1', true, 1), pnl: 10 },
      { ...executeFruitTrade({ ...deterministicMarket(), quoteId: 4 }, 'sell', '2', true, 2), pnl: -5 }
    ];
    // One of two first clicks is profitable: 50% accuracy × raw P&L of 5 = 2.5.
    const summary = summarizeFruitSession(trades, 30, '2026-10-27T00:00:00.000Z');
    expect(summary.rawProfit).toBe(5);
    expect(summary.firstClickAccuracy).toBe(0.5);
    expect(summary.score).toBe(2.5);
    expect(summary.trades).toBe(2);
  });
});