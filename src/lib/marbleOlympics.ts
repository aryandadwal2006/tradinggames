import type { SeededRandom } from './rng';

export type MarbleTeam = 'A' | 'B';
export type MarbleColor = 'orange' | 'red';
export type MarbleSideBetId =
  | 'red-square'
  | 'orange-square'
  | 'grand-total-three'
  | 'team-a-five'
  | 'team-b-five'
  | 'absolute-gap-eight'
  | 'maximum-five'
  | 'minimum-six'
  | 'red-total-four'
  | 'orange-total-four';

export interface ColorCount {
  shots: number;
  goals: number;
}

export interface TeamColorCounts {
  orange: ColorCount;
  red: ColorCount;
}

export interface LiveMarbleCounts {
  A: TeamColorCounts;
  B: TeamColorCounts;
}

export interface TeamAccuracy {
  orange: number;
  red: number;
}

export interface BracketRound {
  name: string;
  A: TeamColorCounts;
  B: TeamColorCounts;
}

export interface MarbleShotEvent {
  id: number;
  minute: number;
  team: MarbleTeam;
  color: MarbleColor;
  scored: boolean;
}

export interface MarbleMatchSetup {
  durationMinutes: 10 | 20 | 30;
  shotsPerColor: 5 | 10 | 15;
  hiddenAccuracy: Record<MarbleTeam, TeamAccuracy>;
  bracket: BracketRound[];
  events: MarbleShotEvent[];
}

export interface MarbleSideBetDefinition {
  id: MarbleSideBetId;
  label: string;
  formula: string;
}

export interface MarbleFairSnapshot {
  teamAExpected: number;
  teamBExpected: number;
  mainFairValue: number;
  expectedGrandTotal: number;
  expectedRedTotal: number;
  expectedOrangeTotal: number;
  expectedSideBets: Record<MarbleSideBetId, number>;
  estimatedAccuracy: Record<MarbleTeam, TeamAccuracy>;
}

export interface FinalMarbleTotals {
  A: { orange: number; red: number; total: number };
  B: { orange: number; red: number; total: number };
}

export const BRACKET_ROUND_NAMES = ['Round of 32', 'Round of 16', 'Quarterfinal', 'Semifinal'] as const;

export const SIDE_BET_DEFINITIONS: readonly MarbleSideBetDefinition[] = [
  { id: 'red-square', label: 'Red marbles squared', formula: '(combined red total)²' },
  { id: 'orange-square', label: 'Orange marbles squared', formula: '(combined orange total)²' },
  { id: 'grand-total-three', label: 'Grand total × 3', formula: '3 × (Team A + Team B total)' },
  { id: 'team-a-five', label: 'Team A total × 5', formula: '5 × Team A total' },
  { id: 'team-b-five', label: 'Team B total × 5', formula: '5 × Team B total' },
  { id: 'absolute-gap-eight', label: 'Absolute goal gap × 8', formula: '8 × |Team A − Team B|' },
  { id: 'maximum-five', label: 'Larger team total × 5', formula: '5 × max(Team A, Team B)' },
  { id: 'minimum-six', label: 'Smaller team total × 6', formula: '6 × min(Team A, Team B)' },
  { id: 'red-total-four', label: 'Combined red total × 4', formula: '4 × combined red total' },
  { id: 'orange-total-four', label: 'Combined orange total × 4', formula: '4 × combined orange total' }
];

export const ZERO_MARBLE_COUNTS: LiveMarbleCounts = {
  A: { orange: { shots: 0, goals: 0 }, red: { shots: 0, goals: 0 } },
  B: { orange: { shots: 0, goals: 0 }, red: { shots: 0, goals: 0 } }
};

function emptyTeamCounts(): TeamColorCounts {
  return { orange: { shots: 0, goals: 0 }, red: { shots: 0, goals: 0 } };
}

function sampleGoals(rng: SeededRandom, shots: number, accuracy: number): number {
  let goals = 0;
  for (let i = 0; i < shots; i += 1) if (rng.next() < accuracy) goals += 1;
  return goals;
}

function sampleAccuracy(rng: SeededRandom): number {
  return rng.int(25, 75) / 100;
}

function sampleTeamRound(
  rng: SeededRandom,
  accuracies: Record<MarbleTeam, TeamAccuracy>,
  shotsPerColor: number
): Pick<BracketRound, 'A' | 'B'> {
  const result: Pick<BracketRound, 'A' | 'B'> = { A: emptyTeamCounts(), B: emptyTeamCounts() };
  for (const team of ['A', 'B'] as const) {
    for (const color of ['orange', 'red'] as const) {
      const shots = Math.max(3, shotsPerColor + rng.int(-1, 1));
      const goals = sampleGoals(rng, shots, accuracies[team][color]);
      result[team][color] = { shots, goals };
    }
  }
  return result;
}

export function createMarbleMatch(
  rng: SeededRandom,
  durationMinutes: 10 | 20 | 30 = 10
): MarbleMatchSetup {
  const shotsPerColor = (durationMinutes / 2) as 5 | 10 | 15;
  const hiddenAccuracy: Record<MarbleTeam, TeamAccuracy> = {
    A: { orange: sampleAccuracy(rng), red: sampleAccuracy(rng) },
    B: { orange: sampleAccuracy(rng), red: sampleAccuracy(rng) }
  };
  const bracket = BRACKET_ROUND_NAMES.map((name) => ({
    name,
    ...sampleTeamRound(rng, hiddenAccuracy, shotsPerColor)
  }));
  const events: MarbleShotEvent[] = [];
  let id = 0;
  for (const team of ['A', 'B'] as const) {
    for (const color of ['orange', 'red'] as const) {
      for (let shot = 0; shot < shotsPerColor; shot += 1) {
        const baseMinute = Math.round(((shot + 1) * 90) / (shotsPerColor + 1));
        events.push({
          id: id++,
          minute: Math.min(89, Math.max(1, baseMinute + rng.int(-1, 1))),
          team,
          color,
          scored: rng.next() < hiddenAccuracy[team][color]
        });
      }
    }
  }
  events.sort((left, right) => left.minute - right.minute || left.id - right.id);
  return { durationMinutes, shotsPerColor, hiddenAccuracy, bracket, events };
}

export function applyMarbleShot(
  counts: LiveMarbleCounts,
  event: MarbleShotEvent
): LiveMarbleCounts {
  const next: LiveMarbleCounts = {
    A: {
      orange: { ...counts.A.orange }, red: { ...counts.A.red }
    },
    B: {
      orange: { ...counts.B.orange }, red: { ...counts.B.red }
    }
  };
  const colorCounts = next[event.team][event.color];
  colorCounts.shots += 1;
  if (event.scored) colorCounts.goals += 1;
  return next;
}

function posteriorAccuracy(
  bracket: readonly BracketRound[],
  counts: LiveMarbleCounts,
  team: MarbleTeam,
  color: MarbleColor
): number {
  let historicalShots = 0;
  let historicalGoals = 0;
  for (const round of bracket) {
    historicalShots += round[team][color].shots;
    historicalGoals += round[team][color].goals;
  }
  const live = counts[team][color];
  // Beta(1, 1) smoothing prevents tiny samples from producing certainty.
  return (historicalGoals + live.goals + 1) / (historicalShots + live.shots + 2);
}

function binomialPmf(trials: number, probability: number): number[] {
  const n = Math.max(0, Math.floor(trials));
  const p = Math.min(1, Math.max(0, probability));
  if (n === 0) return [1];
  if (p === 0) return [1, ...Array.from({ length: n }, () => 0)];
  if (p === 1) return [...Array.from({ length: n }, () => 0), 1];
  const result = [Math.pow(1 - p, n)];
  for (let k = 0; k < n; k += 1) {
    result.push((result[k] ?? 0) * ((n - k) / (k + 1)) * (p / (1 - p)));
  }
  return result;
}

function convolve(left: readonly number[], right: readonly number[]): number[] {
  const output = Array.from({ length: left.length + right.length - 1 }, () => 0);
  for (let i = 0; i < left.length; i += 1) {
    for (let j = 0; j < right.length; j += 1) {
      output[i + j] = (output[i + j] ?? 0) + (left[i] ?? 0) * (right[j] ?? 0);
    }
  }
  return output;
}

function shiftPmf(distribution: readonly number[], shift: number): number[] {
  return [...Array.from({ length: Math.max(0, shift) }, () => 0), ...distribution];
}

function expectedValue(distribution: readonly number[], payout: (value: number) => number): number {
  return distribution.reduce((sum, probability, value) => sum + probability * payout(value), 0);
}

function expectedJoint(
  distributionA: readonly number[],
  distributionB: readonly number[],
  payout: (a: number, b: number) => number
): number {
  let result = 0;
  for (let a = 0; a < distributionA.length; a += 1) {
    for (let b = 0; b < distributionB.length; b += 1) {
      result += (distributionA[a] ?? 0) * (distributionB[b] ?? 0) * payout(a, b);
    }
  }
  return result;
}

export function estimateMarbleFairValues(
  setup: MarbleMatchSetup,
  counts: LiveMarbleCounts
): MarbleFairSnapshot {
  const estimatedAccuracy: Record<MarbleTeam, TeamAccuracy> = {
    A: {
      orange: posteriorAccuracy(setup.bracket, counts, 'A', 'orange'),
      red: posteriorAccuracy(setup.bracket, counts, 'A', 'red')
    },
    B: {
      orange: posteriorAccuracy(setup.bracket, counts, 'B', 'orange'),
      red: posteriorAccuracy(setup.bracket, counts, 'B', 'red')
    }
  };
  const remaining = {
    A: {
      orange: Math.max(0, setup.shotsPerColor - counts.A.orange.shots),
      red: Math.max(0, setup.shotsPerColor - counts.A.red.shots)
    },
    B: {
      orange: Math.max(0, setup.shotsPerColor - counts.B.orange.shots),
      red: Math.max(0, setup.shotsPerColor - counts.B.red.shots)
    }
  };
  const teamDistributions: Record<MarbleTeam, number[]> = {
    A: shiftPmf(convolve(
      binomialPmf(remaining.A.orange, estimatedAccuracy.A.orange),
      binomialPmf(remaining.A.red, estimatedAccuracy.A.red)
    ), counts.A.orange.goals + counts.A.red.goals),
    B: shiftPmf(convolve(
      binomialPmf(remaining.B.orange, estimatedAccuracy.B.orange),
      binomialPmf(remaining.B.red, estimatedAccuracy.B.red)
    ), counts.B.orange.goals + counts.B.red.goals)
  };
  const redDistribution = shiftPmf(convolve(
    binomialPmf(remaining.A.red, estimatedAccuracy.A.red),
    binomialPmf(remaining.B.red, estimatedAccuracy.B.red)
  ), counts.A.red.goals + counts.B.red.goals);
  const orangeDistribution = shiftPmf(convolve(
    binomialPmf(remaining.A.orange, estimatedAccuracy.A.orange),
    binomialPmf(remaining.B.orange, estimatedAccuracy.B.orange)
  ), counts.A.orange.goals + counts.B.orange.goals);
  const teamAExpected = expectedValue(teamDistributions.A, (value) => value);
  const teamBExpected = expectedValue(teamDistributions.B, (value) => value);
  const expectedRedTotal = expectedValue(redDistribution, (value) => value);
  const expectedOrangeTotal = expectedValue(orangeDistribution, (value) => value);
  const grandDistribution = convolve(teamDistributions.A, teamDistributions.B);
  const expectedGrandTotal = expectedValue(grandDistribution, (value) => value);

  const expectedSideBets: Record<MarbleSideBetId, number> = {
    'red-square': expectedValue(redDistribution, (value) => value * value),
    'orange-square': expectedValue(orangeDistribution, (value) => value * value),
    'grand-total-three': expectedValue(grandDistribution, (value) => value * 3),
    'team-a-five': expectedValue(teamDistributions.A, (value) => value * 5),
    'team-b-five': expectedValue(teamDistributions.B, (value) => value * 5),
    'absolute-gap-eight': expectedJoint(teamDistributions.A, teamDistributions.B, (a, b) => Math.abs(a - b) * 8),
    'maximum-five': expectedJoint(teamDistributions.A, teamDistributions.B, (a, b) => Math.max(a, b) * 5),
    'minimum-six': expectedJoint(teamDistributions.A, teamDistributions.B, (a, b) => Math.min(a, b) * 6),
    'red-total-four': expectedValue(redDistribution, (value) => value * 4),
    'orange-total-four': expectedValue(orangeDistribution, (value) => value * 4)
  };
  return {
    teamAExpected, teamBExpected,
    mainFairValue: teamAExpected * teamBExpected,
    expectedGrandTotal, expectedRedTotal, expectedOrangeTotal,
    expectedSideBets, estimatedAccuracy
  };
}

export function visibleSideBets(gameMinute: number, batchIndex: number): MarbleSideBetDefinition[] {
  const count = gameMinute < 30 ? 1 : gameMinute < 60 ? 5 : SIDE_BET_DEFINITIONS.length;
  if (count === SIDE_BET_DEFINITIONS.length) return [...SIDE_BET_DEFINITIONS];
  const start = (Math.max(0, batchIndex) * count) % SIDE_BET_DEFINITIONS.length;
  return Array.from({ length: count }, (_, index) =>
    SIDE_BET_DEFINITIONS[(start + index) % SIDE_BET_DEFINITIONS.length]!
  );
}

export function quoteSideBet(fairValue: number, relativeSpread = 0.025): { bid: number; ask: number } {
  const halfSpread = Math.max(1, Math.abs(fairValue) * relativeSpread);
  return { bid: fairValue - halfSpread, ask: fairValue + halfSpread };
}

export function calculateFinalMarbleTotals(counts: LiveMarbleCounts): FinalMarbleTotals {
  const aOrange = counts.A.orange.goals;
  const aRed = counts.A.red.goals;
  const bOrange = counts.B.orange.goals;
  const bRed = counts.B.red.goals;
  return {
    A: { orange: aOrange, red: aRed, total: aOrange + aRed },
    B: { orange: bOrange, red: bRed, total: bOrange + bRed }
  };
}

export function settleMainMarket(cash: number, inventory: number, totals: FinalMarbleTotals): number {
  return cash + inventory * (totals.A.total * totals.B.total);
}

export function sideBetPayout(id: MarbleSideBetId, totals: FinalMarbleTotals): number {
  const red = totals.A.red + totals.B.red;
  const orange = totals.A.orange + totals.B.orange;
  const grand = totals.A.total + totals.B.total;
  switch (id) {
    case 'red-square': return red * red;
    case 'orange-square': return orange * orange;
    case 'grand-total-three': return grand * 3;
    case 'team-a-five': return totals.A.total * 5;
    case 'team-b-five': return totals.B.total * 5;
    case 'absolute-gap-eight': return Math.abs(totals.A.total - totals.B.total) * 8;
    case 'maximum-five': return Math.max(totals.A.total, totals.B.total) * 5;
    case 'minimum-six': return Math.min(totals.A.total, totals.B.total) * 6;
    case 'red-total-four': return red * 4;
    case 'orange-total-four': return orange * 4;
  }
}

export function settleSideBetTrade(
  direction: 'buy' | 'sell',
  size: 1 | 5 | 10,
  price: number,
  finalPayout: number
): number {
  if (!Number.isFinite(price) || !Number.isFinite(finalPayout)) throw new TypeError('Side-bet price and payout must be finite.');
  return (direction === 'buy' ? 1 : -1) * (finalPayout - price) * size;
}

export function countGoals(counts: LiveMarbleCounts, team: MarbleTeam): number {
  return counts[team].orange.goals + counts[team].red.goals;
}

export function formatMarbleNumber(value: number): string {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(value);
}
