import { describe, expect, it } from 'vitest';
import {
  expectedValuePerUnit,
  fairOdds,
  generateProbabilityOffers,
  halfKellyStake,
  kellyFraction,
  PROBABILITY_EVENT_BANK,
  resolveProbabilityRound,
  sampleProbabilityOutcome,
  summarizeProbabilitySession
} from './probabilityBetting';
import { SeededRandom } from './rng';

describe('Probability Betting offers', () => {
  it('generates repeatable unique offers with valid decimal odds', () => {
    const first = generateProbabilityOffers(new SeededRandom(451), 4);
    const second = generateProbabilityOffers(new SeededRandom(451), 4);
    expect(first).toEqual(second);
    expect(new Set(first.map((offer) => offer.offerId)).size).toBe(4);
    for (const offer of first) {
      expect(offer.yesOdds).toBeGreaterThan(1);
      expect(offer.noOdds).toBeGreaterThan(1);
      expect(offer.probability).toBeGreaterThan(0);
      expect(offer.probability).toBeLessThan(1);
    }
  });

  it('rejects invalid offer counts', () => {
    expect(() => generateProbabilityOffers(new SeededRandom(1), 0)).toThrow(RangeError);
    expect(() => generateProbabilityOffers(new SeededRandom(1), PROBABILITY_EVENT_BANK.length + 1)).toThrow(RangeError);
  });

  it('computes fair odds, expected edge, and non-negative Kelly sizing', () => {
    expect(fairOdds(0.5)).toBe(2);
    expect(expectedValuePerUnit(0.5, 2.2)).toBeCloseTo(0.1);
    expect(expectedValuePerUnit(0.5, 1.8)).toBeCloseTo(-0.1);
    expect(kellyFraction(0.5, 2.2)).toBeCloseTo(0.0833333333);
    expect(kellyFraction(0.5, 1.8)).toBe(0);
    expect(halfKellyStake(1000, 1 / 12)).toBe(42);
    expect(() => fairOdds(0)).toThrow(RangeError);
  });

  it('samples valid deterministic outcomes for every event type', () => {
    for (const event of PROBABILITY_EVENT_BANK) {
      const rng = new SeededRandom(123 + event.id.length);
      expect(typeof sampleProbabilityOutcome(event.outcomeKind, rng)).toBe('boolean');
    }
  });

  it('settles multiple decisions with bankroll, P&L, and outcome accounting', () => {
    const rng = new SeededRandom(1009);
    const offers = generateProbabilityOffers(rng, 4);
    const decisions = offers.map((offer, index) => ({
      offer,
      side: index === 0 ? 'yes' as const : 'skip' as const,
      stake: index === 0 ? 100 : 0
    }));
    const result = resolveProbabilityRound({ roundNumber: 1, offers, decisions, bankroll: 1000, rng, elapsedMs: 4000 });
    expect(result.events).toHaveLength(4);
    expect(result.totalStake).toBe(100);
    expect(result.bankrollAfter).toBe(1000 + result.pnl);
    expect(result.events.filter((event) => event.side === 'skip')).toHaveLength(3);
  });

  it('rejects overspending and duplicate decisions', () => {
    const rng = new SeededRandom(34);
    const offers = generateProbabilityOffers(rng, 2);
    const decisions = offers.map((offer) => ({ offer, side: 'yes' as const, stake: 600 }));
    expect(() => resolveProbabilityRound({ roundNumber: 1, offers, decisions, bankroll: 1000, rng, elapsedMs: 0 })).toThrow(RangeError);
    expect(() => resolveProbabilityRound({ roundNumber: 1, offers, decisions: [decisions[0]!, decisions[0]!], bankroll: 1000, rng, elapsedMs: 0 })).toThrow(RangeError);
  });

  it('summarizes betting decisions without claiming the original leaderboard score', () => {
    const rng = new SeededRandom(991);
    const offers = generateProbabilityOffers(rng, 3);
    const round = resolveProbabilityRound({
      roundNumber: 1,
      offers,
      decisions: offers.map((offer) => ({ offer, side: 'skip' as const, stake: 0 })),
      bankroll: 1000,
      rng,
      elapsedMs: 5000
    });
    const summary = summarizeProbabilitySession([round], 5, 1000, '2026-10-27T00:00:00Z');
    expect(summary.rounds).toBe(1);
    expect(summary.bets).toBe(0);
    expect(summary.skipped).toBe(3);
    expect(summary.finalBankroll).toBe(1000);
    expect(summary.decisionQuality).not.toBeNull();
  });
});