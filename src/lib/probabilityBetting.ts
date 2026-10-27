import type { SeededRandom } from './rng';

export type ProbabilitySide = 'yes' | 'no' | 'skip';
export type ProbabilityOutcomeKind =
  | 'coin-heads'
  | 'die-six'
  | 'die-at-most-four'
  | 'dice-sum-seven'
  | 'dice-sum-at-least-eight'
  | 'dice-doubles'
  | 'dice-sum-at-most-five'
  | 'dice-at-least-one-six'
  | 'card-red'
  | 'card-face'
  | 'card-ten-or-higher'
  | 'card-even'
  | 'three-coins-same'
  | 'two-cards-red'
  | 'two-cards-same-suit';

export interface ProbabilityEventTemplate {
  id: string;
  title: string;
  prompt: string;
  category: 'Coins' | 'Dice' | 'Cards';
  probability: number;
  outcomeKind: ProbabilityOutcomeKind;
}

export interface ProbabilityOffer extends ProbabilityEventTemplate {
  offerId: string;
  yesOdds: number;
  noOdds: number;
}

export interface ProbabilityDecision {
  offer: ProbabilityOffer;
  side: ProbabilitySide;
  stake: number;
}

export interface ProbabilityEventResult {
  offer: ProbabilityOffer;
  side: ProbabilitySide;
  stake: number;
  outcome: boolean;
  won: boolean | null;
  pnl: number;
  selectedProbability: number | null;
  selectedOdds: number | null;
  impliedProbability: number | null;
  fairOdds: number | null;
  expectedValuePerUnit: number | null;
  fullKellyFraction: number;
  halfKellyStake: number;
  positiveEv: boolean;
  positiveEvOpportunity: boolean;
  decisionCorrect: boolean;
  sizingEfficiency: number | null;
}

export interface ProbabilityRoundResult {
  roundNumber: number;
  events: ProbabilityEventResult[];
  totalStake: number;
  pnl: number;
  bankrollBefore: number;
  bankrollAfter: number;
  elapsedMs: number;
}

export interface ProbabilitySessionSummary {
  rounds: number;
  opportunities: number;
  bets: number;
  wins: number;
  losses: number;
  skipped: number;
  decisionQuality: number | null;
  opportunityParticipation: number | null;
  sizingEfficiency: number | null;
  initialBankroll: number;
  finalBankroll: number;
  netPnl: number;
  durationSeconds: number;
  playedAt: string;
}

export const PROBABILITY_INITIAL_BANKROLL = 1000;
export const PROBABILITY_EVENT_COUNT = 4;
export const PROBABILITY_ROUND_SECONDS = 30;
export const PROBABILITY_DEFAULT_ROUNDS = 6;
export const PROBABILITY_QUOTE_FACTOR_MIN = 0.82;
export const PROBABILITY_QUOTE_FACTOR_MAX = 1.18;

export const PROBABILITY_EVENT_BANK: readonly ProbabilityEventTemplate[] = [
  { id: 'coin-heads', title: 'A fair coin', prompt: 'The next flip lands heads.', category: 'Coins', probability: 1 / 2, outcomeKind: 'coin-heads' },
  { id: 'die-six', title: 'One die', prompt: 'A fair six-sided die shows 6.', category: 'Dice', probability: 1 / 6, outcomeKind: 'die-six' },
  { id: 'die-at-most-four', title: 'One die', prompt: 'A fair six-sided die shows 4 or less.', category: 'Dice', probability: 4 / 6, outcomeKind: 'die-at-most-four' },
  { id: 'dice-sum-seven', title: 'Two dice', prompt: 'The sum of two fair dice is exactly 7.', category: 'Dice', probability: 6 / 36, outcomeKind: 'dice-sum-seven' },
  { id: 'dice-sum-at-least-eight', title: 'Two dice', prompt: 'The sum of two fair dice is at least 8.', category: 'Dice', probability: 15 / 36, outcomeKind: 'dice-sum-at-least-eight' },
  { id: 'dice-doubles', title: 'Two dice', prompt: 'Two fair dice show the same number.', category: 'Dice', probability: 6 / 36, outcomeKind: 'dice-doubles' },
  { id: 'dice-sum-at-most-five', title: 'Two dice', prompt: 'The sum of two fair dice is at most 5.', category: 'Dice', probability: 10 / 36, outcomeKind: 'dice-sum-at-most-five' },
  { id: 'dice-at-least-one-six', title: 'Two dice', prompt: 'At least one of two fair dice shows 6.', category: 'Dice', probability: 11 / 36, outcomeKind: 'dice-at-least-one-six' },
  { id: 'card-red', title: 'One card', prompt: 'A randomly drawn card from a standard 52-card deck is red.', category: 'Cards', probability: 1 / 2, outcomeKind: 'card-red' },
  { id: 'card-face', title: 'One card', prompt: 'A randomly drawn card is a jack, queen, or king.', category: 'Cards', probability: 12 / 52, outcomeKind: 'card-face' },
  { id: 'card-ten-or-higher', title: 'One card', prompt: 'A randomly drawn card is 10, jack, queen, king, or ace.', category: 'Cards', probability: 20 / 52, outcomeKind: 'card-ten-or-higher' },
  { id: 'card-even', title: 'One card', prompt: 'A randomly drawn card is 2, 4, 6, 8, or 10.', category: 'Cards', probability: 20 / 52, outcomeKind: 'card-even' },
  { id: 'three-coins-same', title: 'Three coins', prompt: 'Three fair coin flips all show the same side.', category: 'Coins', probability: 2 / 8, outcomeKind: 'three-coins-same' },
  { id: 'two-cards-red', title: 'Two cards', prompt: 'Two cards drawn without replacement are both red.', category: 'Cards', probability: 25 / 102, outcomeKind: 'two-cards-red' },
  { id: 'two-cards-same-suit', title: 'Two cards', prompt: 'Two cards drawn without replacement have the same suit.', category: 'Cards', probability: 12 / 51, outcomeKind: 'two-cards-same-suit' }
];

function quoteOdds(probability: number, rng: SeededRandom): number {
  const fairOdds = 1 / probability;
  const factor = PROBABILITY_QUOTE_FACTOR_MIN
    + rng.next() * (PROBABILITY_QUOTE_FACTOR_MAX - PROBABILITY_QUOTE_FACTOR_MIN);
  return Math.max(1.05, Math.round(fairOdds * factor * 100) / 100);
}

export function generateProbabilityOffers(
  rng: SeededRandom,
  count = PROBABILITY_EVENT_COUNT
): ProbabilityOffer[] {
  if (!Number.isInteger(count) || count < 1 || count > PROBABILITY_EVENT_BANK.length) {
    throw new RangeError('Offer count must be between one and the number of event templates.');
  }
  return rng.shuffle(PROBABILITY_EVENT_BANK).slice(0, count).map((template, index) => {
    const offerId = template.id + '-offer-' + String(index + 1) + '-' + Math.floor(rng.next() * 1e6).toString(36);
    return {
      ...template,
      offerId,
      yesOdds: quoteOdds(template.probability, rng),
      noOdds: quoteOdds(1 - template.probability, rng)
    };
  });
}

export function fairOdds(probability: number): number {
  if (!Number.isFinite(probability) || probability <= 0 || probability > 1) {
    throw new RangeError('Probability must be in the interval (0, 1].');
  }
  return 1 / probability;
}

export function selectedSideProbability(offer: ProbabilityOffer, side: Exclude<ProbabilitySide, 'skip'>): number {
  return side === 'yes' ? offer.probability : 1 - offer.probability;
}

export function expectedValuePerUnit(probability: number, decimalOdds: number): number {
  if (!Number.isFinite(probability) || probability < 0 || probability > 1) {
    throw new RangeError('Probability must be between zero and one.');
  }
  if (!Number.isFinite(decimalOdds) || decimalOdds <= 1) {
    throw new RangeError('Decimal odds must exceed one.');
  }
  return probability * decimalOdds - 1;
}

export function kellyFraction(probability: number, decimalOdds: number): number {
  const netOdds = decimalOdds - 1;
  const fraction = expectedValuePerUnit(probability, decimalOdds) / netOdds;
  return Math.max(0, Math.min(1, fraction));
}

export function halfKellyStake(bankroll: number, fullKelly: number): number {
  if (!Number.isFinite(bankroll) || bankroll <= 0 || !Number.isFinite(fullKelly) || fullKelly <= 0) return 0;
  return Math.min(Math.floor(bankroll), Math.max(0, Math.round(bankroll * fullKelly * 0.5)));
}

function standardDeck(rng: SeededRandom): { rank: number; suit: number; red: boolean }[] {
  const cards: { rank: number; suit: number; red: boolean }[] = [];
  for (let suit = 0; suit < 4; suit += 1) {
    for (let rank = 1; rank <= 13; rank += 1) {
      cards.push({ rank, suit, red: suit === 1 || suit === 2 });
    }
  }
  return rng.shuffle(cards);
}

export function sampleProbabilityOutcome(
  kind: ProbabilityOutcomeKind,
  rng: SeededRandom
): boolean {
  switch (kind) {
    case 'coin-heads':
      return rng.int(0, 1) === 1;
    case 'die-six':
      return rng.int(1, 6) === 6;
    case 'die-at-most-four':
      return rng.int(1, 6) <= 4;
    case 'dice-sum-seven': {
      const first = rng.int(1, 6);
      const second = rng.int(1, 6);
      return first + second === 7;
    }
    case 'dice-sum-at-least-eight': {
      const first = rng.int(1, 6);
      const second = rng.int(1, 6);
      return first + second >= 8;
    }
    case 'dice-doubles':
      return rng.int(1, 6) === rng.int(1, 6);
    case 'dice-sum-at-most-five': {
      const first = rng.int(1, 6);
      const second = rng.int(1, 6);
      return first + second <= 5;
    }
    case 'dice-at-least-one-six':
      return rng.int(1, 6) === 6 || rng.int(1, 6) === 6;
    case 'card-red':
      return rng.int(0, 1) === 1;
    case 'card-face':
      return rng.int(1, 13) >= 11;
    case 'card-ten-or-higher': {
      const rank = rng.int(1, 13);
      return rank === 1 || rank >= 10;
    }
    case 'card-even': {
      const rank = rng.int(1, 13);
      return rank >= 2 && rank <= 10 && rank % 2 === 0;
    }
    case 'three-coins-same': {
      const first = rng.int(0, 1);
      const second = rng.int(0, 1);
      const third = rng.int(0, 1);
      return first === second && second === third;
    }
    case 'two-cards-red': {
      const cards = standardDeck(rng);
      return Boolean(cards[0]?.red && cards[1]?.red);
    }
    case 'two-cards-same-suit': {
      const cards = standardDeck(rng);
      return cards[0]?.suit === cards[1]?.suit;
    }
  }
}

export function resolveProbabilityRound(args: {
  roundNumber: number;
  offers: readonly ProbabilityOffer[];
  decisions: readonly ProbabilityDecision[];
  bankroll: number;
  rng: SeededRandom;
  elapsedMs: number;
}): ProbabilityRoundResult {
  const { roundNumber, offers, decisions, bankroll, rng, elapsedMs } = args;
  if (!Number.isInteger(bankroll) || bankroll < 0) throw new RangeError('Bankroll must be a non-negative integer.');
  if (offers.length !== decisions.length) throw new RangeError('Every offer must have exactly one decision.');

  const offerIds = new Set(offers.map((offer) => offer.offerId));
  if (offerIds.size !== offers.length) throw new RangeError('Offer identifiers must be unique.');
  const decisionIds = new Set(decisions.map((decision) => decision.offer.offerId));
  if (decisionIds.size !== decisions.length || decisions.some((decision) => !offerIds.has(decision.offer.offerId))) {
    throw new RangeError('Each offer must be resolved once.');
  }

  const totalStake = decisions.reduce((sum, decision) => sum + decision.stake, 0);
  if (!Number.isInteger(totalStake) || totalStake < 0 || totalStake > bankroll) {
    throw new RangeError('Total stake must be a non-negative integer no larger than bankroll.');
  }

  const events = decisions.map((decision): ProbabilityEventResult => {
    const { offer, stake } = decision;
    const side: ProbabilitySide = stake === 0 ? 'skip' : decision.side;
    if (!Number.isInteger(stake) || stake < 0) throw new RangeError('Each stake must be a non-negative integer.');
    if (side === 'skip' && stake !== 0) throw new RangeError('Skipped offers cannot have a stake.');
    const outcome = sampleProbabilityOutcome(offer.outcomeKind, rng);
    const selectedProbability = side === 'skip' ? null : selectedSideProbability(offer, side);
    const selectedOdds = side === 'yes' ? offer.yesOdds : side === 'no' ? offer.noOdds : null;
    const positiveEv = side !== 'skip' && selectedOdds !== null
      && expectedValuePerUnit(selectedProbability ?? 0, selectedOdds) > 1e-12;
    const yesEdge = expectedValuePerUnit(offer.probability, offer.yesOdds);
    const noEdge = expectedValuePerUnit(1 - offer.probability, offer.noOdds);
    const positiveEvOpportunity = yesEdge > 1e-12 || noEdge > 1e-12;
    const decisionCorrect = side === 'skip'
      ? !positiveEvOpportunity
      : positiveEv;
    const fullKellyFraction = side === 'skip' || selectedOdds === null
      ? 0
      : kellyFraction(selectedProbability ?? 0, selectedOdds);
    const halfStake = halfKellyStake(bankroll, fullKellyFraction);
    const sizingEfficiency = positiveEv && stake > 0
      ? Math.max(0, 1 - Math.abs(stake - halfStake) / Math.max(halfStake, 1))
      : null;
    const won = side === 'skip' || stake === 0 ? null : (side === 'yes' ? outcome : !outcome);
    const pnl = won === null ? 0 : won ? stake * ((selectedOdds ?? 1) - 1) : -stake;

    return {
      offer, side: stake === 0 ? 'skip' : side, stake,
      outcome, won, pnl, selectedProbability, selectedOdds,
      impliedProbability: selectedOdds === null ? null : 1 / selectedOdds,
      fairOdds: selectedProbability === null ? null : fairOdds(selectedProbability),
      expectedValuePerUnit: selectedProbability === null || selectedOdds === null
        ? null
        : expectedValuePerUnit(selectedProbability, selectedOdds),
      fullKellyFraction,
      halfKellyStake: halfStake,
      positiveEv,
      positiveEvOpportunity,
      decisionCorrect,
      sizingEfficiency
    };
  });

  const pnl = events.reduce((sum, event) => sum + event.pnl, 0);
  return {
    roundNumber,
    events,
    totalStake,
    pnl,
    bankrollBefore: bankroll,
    bankrollAfter: Math.max(0, bankroll + pnl),
    elapsedMs: Math.max(0, elapsedMs)
  };
}

export function summarizeProbabilitySession(
  rounds: readonly ProbabilityRoundResult[],
  durationSeconds: number,
  initialBankroll = PROBABILITY_INITIAL_BANKROLL,
  playedAt = new Date().toISOString()
): ProbabilitySessionSummary {
  const events = rounds.flatMap((round) => round.events);
  const bets = events.filter((event) => event.side !== 'skip' && event.stake > 0);
  const opportunities = events.filter((event) => event.positiveEvOpportunity);
  const sizes = events.flatMap((event) => event.sizingEfficiency === null ? [] : [event.sizingEfficiency]);
  const finalBankroll = rounds.at(-1)?.bankrollAfter ?? initialBankroll;

  return {
    rounds: rounds.length,
    opportunities: opportunities.length,
    bets: bets.length,
    wins: bets.filter((event) => event.won === true).length,
    losses: bets.filter((event) => event.won === false).length,
    skipped: events.filter((event) => event.side === 'skip').length,
    decisionQuality: events.length === 0 ? null : events.filter((event) => event.decisionCorrect).length / events.length,
    opportunityParticipation: opportunities.length === 0 ? null : opportunities.filter((event) => event.side !== 'skip' && event.positiveEv).length / opportunities.length,
    sizingEfficiency: sizes.length === 0 ? null : sizes.reduce((sum, value) => sum + value, 0) / sizes.length,
    initialBankroll,
    finalBankroll,
    netPnl: finalBankroll - initialBankroll,
    durationSeconds: Math.max(0, Math.round(durationSeconds)),
    playedAt
  };
}

export function formatDecimalOdds(odds: number): string {
  return odds.toFixed(2) + '×';
}

export function formatProbability(probability: number): string {
  return (probability * 100).toFixed(1) + '%';
}
