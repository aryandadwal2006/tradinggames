import { describe, expect, it } from 'vitest';
import {
  calculateCardProbabilities,
  createCardDeck,
  getHalfKellyStake,
  getKellyFraction,
  getRecommendedSide,
  getSideProbabilities,
  resolveCardBet,
  summarizeCardSession
} from './nextCardBetting';
import { SeededRandom } from './rng';

describe('Next Card Betting deck and probability calculations', () => {
  it('builds unique cards and makes deck shuffling reproducible', () => {
    const a = createCardDeck(new SeededRandom(123), 4, true);
    const b = createCardDeck(new SeededRandom(123), 4, true);
    expect(a).toEqual(b);
    expect(a).toHaveLength(52);
    expect(new Set(a.map((card) => card.id)).size).toBe(52);
    expect(a.filter((card) => card.rank === 1).every((card) => card.value === 14)).toBe(true);
  });

  it('supports a configurable number of suits and low aces', () => {
    const deck = createCardDeck(new SeededRandom(3), 2, false);
    expect(deck).toHaveLength(26);
    expect(deck.filter((card) => card.rank === 1).every((card) => card.value === 1)).toBe(true);
  });

  it('calculates exact higher/lower/tie probabilities from unseen cards', () => {
    const reference = createCardDeck(new SeededRandom(3), 1, true).find((card) => card.rankLabel === '7')!;
    const unseen = [
      { ...reference, id: 'lower', rank: 6, value: 6, rankLabel: '6' },
      { ...reference, id: 'equal', value: reference.value },
      { ...reference, id: 'higher', rank: 8, value: 8, rankLabel: '8' },
      { ...reference, id: 'higher2', rank: 9, value: 9, rankLabel: '9' }
    ];
    const probabilities = calculateCardProbabilities(reference, unseen);
    expect(probabilities.higher).toBe(0.5);
    expect(probabilities.lower).toBe(0.25);
    expect(probabilities.tie).toBe(0.25);
    expect(probabilities.higher + probabilities.lower + probabilities.tie).toBe(1);
  });

  it('chooses the positive-edge side and computes Kelly for even-money wins with pushes', () => {
    const probabilities = { higher: 0.6, lower: 0.3, tie: 0.1, unseenCards: 10 };
    expect(getRecommendedSide(probabilities)).toBe('higher');
    expect(getSideProbabilities(probabilities, 'higher').expectedValuePerUnit).toBeCloseTo(0.3);
    expect(getKellyFraction(0.6, 0.3)).toBeCloseTo(1 / 3);
    expect(getKellyFraction(0.4, 0.5)).toBe(0);
    expect(getHalfKellyStake(1000, 1 / 3)).toBe(167);
  });

  it('settles win, loss, tie-push and skip correctly', () => {
    const deck = createCardDeck(new SeededRandom(88), 1, true);
    const reference = deck[0]!;
    const lower = { ...reference, value: reference.value - 1 };
    const higher = { ...reference, value: reference.value + 1 };
    const unseen = [lower, higher, reference];
    const base = { reference, unseenCards: unseen, stake: 100, bankroll: 500, elapsedMs: 1200 };
    expect(resolveCardBet({ ...base, nextCard: higher, side: 'higher' }).pnl).toBe(100);
    expect(resolveCardBet({ ...base, nextCard: lower, side: 'higher' }).pnl).toBe(-100);
    expect(resolveCardBet({ ...base, nextCard: reference, side: 'higher' }).outcome).toBe('push');
    expect(resolveCardBet({ ...base, nextCard: higher, side: null, stake: 0 }).outcome).toBe('skipped');
  });

  it('enforces bankroll and records transparent session metrics', () => {
    const deck = createCardDeck(new SeededRandom(42), 1, true);
    const ref = deck[3]!;
    const unseen = deck.slice(4);
    expect(() => resolveCardBet({ reference: ref, nextCard: deck[4]!, unseenCards: unseen, side: 'higher', stake: 1100, bankroll: 1000, elapsedMs: 1 })).toThrow(RangeError);
    const results = [
      resolveCardBet({ reference: ref, nextCard: deck[4]!, unseenCards: unseen, side: null, stake: 0, bankroll: 1000, elapsedMs: 1000 }),
      resolveCardBet({ reference: ref, nextCard: deck[4]!, unseenCards: unseen, side: 'higher', stake: 10, bankroll: 1000, elapsedMs: 1000 })
    ];
    const summary = summarizeCardSession(results, { suitCount: 1, aceHigh: true }, 20, '2026-10-27T00:00:00Z');
    expect(summary.rounds).toBe(2);
    expect(summary.skipped).toBe(1);
    expect(summary.bets).toBe(1);
    expect(summary.finalBankroll).toBe(results[1]!.bankrollAfter);
  });
});