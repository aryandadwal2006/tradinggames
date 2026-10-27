import { describe, expect, it } from 'vitest';
import { SeededRandom } from './rng';
import {
  applyMarbleShot,
  calculateFinalMarbleTotals,
  createMarbleMatch,
  estimateMarbleFairValues,
  quoteSideBet,
  settleMainMarket,
  settleSideBetTrade,
  sideBetPayout,
  visibleSideBets,
  ZERO_MARBLE_COUNTS
} from './marbleOlympics';

describe('The Marble Olympics market engine', () => {
  it('creates four historical rounds and the configured number of final shots', () => {
    const setup = createMarbleMatch(new SeededRandom(72), 10);
    expect(setup.bracket.map((round) => round.name)).toEqual(['Round of 32', 'Round of 16', 'Quarterfinal', 'Semifinal']);
    expect(setup.shotsPerColor).toBe(5);
    expect(setup.events).toHaveLength(20);
    expect(setup.events.every((event) => event.minute >= 1 && event.minute <= 89)).toBe(true);
    expect(setup.events.filter((event) => event.team === 'A' && event.color === 'orange')).toHaveLength(5);
  });

  it('uses history and live shots to estimate a probability strictly between zero and one', () => {
    const setup = createMarbleMatch(new SeededRandom(73), 10);
    const snapshot = estimateMarbleFairValues(setup, ZERO_MARBLE_COUNTS);
    expect(snapshot.estimatedAccuracy.A.orange).toBeGreaterThan(0);
    expect(snapshot.estimatedAccuracy.A.orange).toBeLessThan(1);
    expect(snapshot.mainFairValue).toBeGreaterThan(0);
  });

  it('prices squared-count bets with the variance correction', () => {
    const setup = createMarbleMatch(new SeededRandom(91), 20);
    const snapshot = estimateMarbleFairValues(setup, ZERO_MARBLE_COUNTS);
    expect(snapshot.expectedSideBets['red-square']).toBeGreaterThan(
      snapshot.expectedRedTotal * snapshot.expectedRedTotal
    );
    expect(snapshot.expectedSideBets['orange-square']).toBeGreaterThan(
      snapshot.expectedOrangeTotal * snapshot.expectedOrangeTotal
    );
  });

  it('shows one, five, and ten side-bet slots across the thirds', () => {
    expect(visibleSideBets(10, 0)).toHaveLength(1);
    expect(visibleSideBets(45, 3)).toHaveLength(5);
    expect(visibleSideBets(75, 2)).toHaveLength(10);
    expect(new Set(visibleSideBets(75, 2).map((bet) => bet.id)).size).toBe(10);
  });

  it('applies shot events without mutating the previous state', () => {
    const setup = createMarbleMatch(new SeededRandom(8), 10);
    const next = applyMarbleShot(ZERO_MARBLE_COUNTS, setup.events[0]!);
    expect(next).not.toBe(ZERO_MARBLE_COUNTS);
    expect(next[setup.events[0]!.team][setup.events[0]!.color].shots).toBe(1);
    expect(ZERO_MARBLE_COUNTS.A.orange.shots + ZERO_MARBLE_COUNTS.A.red.shots
      + ZERO_MARBLE_COUNTS.B.orange.shots + ZERO_MARBLE_COUNTS.B.red.shots).toBe(0);
  });

  it('settles the main market at final Team A total times Team B total', () => {
    const setup = createMarbleMatch(new SeededRandom(23), 10);
    let counts = ZERO_MARBLE_COUNTS;
    for (const event of setup.events) counts = applyMarbleShot(counts, event);
    const totals = calculateFinalMarbleTotals(counts);
    expect(settleMainMarket(25, 2, totals)).toBe(25 + 2 * totals.A.total * totals.B.total);
  });

  it('settles each side bet using its stated payout formula and correct trade direction', () => {
    const setup = createMarbleMatch(new SeededRandom(24), 10);
    let counts = ZERO_MARBLE_COUNTS;
    for (const event of setup.events) counts = applyMarbleShot(counts, event);
    const totals = calculateFinalMarbleTotals(counts);
    const red = totals.A.red + totals.B.red;
    expect(sideBetPayout('red-square', totals)).toBe(red * red);
    expect(settleSideBetTrade('buy', 5, 100, 120)).toBe(100);
    expect(settleSideBetTrade('sell', 1, 140, 120)).toBe(20);
  });

  it('quotes each side bet around its fair value with a positive spread', () => {
    const quote = quoteSideBet(200);
    expect(quote.bid).toBeLessThan(200);
    expect(quote.ask).toBeGreaterThan(200);
  });
});
