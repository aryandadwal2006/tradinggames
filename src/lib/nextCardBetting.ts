import type { SeededRandom } from './rng';

export type SuitName = 'clubs' | 'diamonds' | 'hearts' | 'spades';
export type BetSide = 'higher' | 'lower';
export type CardOutcome = 'win' | 'loss' | 'push' | 'skipped';

export interface PlayingCard {
  id: string;
  rank: number;
  value: number;
  rankLabel: string;
  suit: SuitName;
  suitSymbol: string;
  color: 'red' | 'black';
}

export interface CardProbabilities {
  higher: number;
  lower: number;
  tie: number;
  unseenCards: number;
}

export interface CardBetResolution {
  reference: PlayingCard;
  nextCard: PlayingCard;
  side: BetSide | null;
  stake: number;
  outcome: CardOutcome;
  pnl: number;
  probabilities: CardProbabilities;
  chosenWinProbability: number | null;
  chosenLossProbability: number | null;
  expectedValuePerUnit: number | null;
  fullKellyFraction: number;
  halfKellyStake: number;
  bestSide: BetSide | null;
  positiveEvOpportunity: boolean;
  decisionWasPositiveEv: boolean;
  sizingEfficiency: number | null;
  bankrollBefore: number;
  bankrollAfter: number;
  elapsedMs: number;
}

export interface CardSessionSummary {
  rounds: number;
  bets: number;
  wins: number;
  losses: number;
  pushes: number;
  skipped: number;
  initialBankroll: number;
  finalBankroll: number;
  netPnl: number;
  positiveEvBets: number;
  positiveEvBetRate: number | null;
  opportunities: number;
  opportunityParticipation: number | null;
  sizingEfficiency: number | null;
  suitCount: number;
  aceHigh: boolean;
  durationSeconds: number;
  playedAt: string;
}

export const INITIAL_CARD_BANKROLL = 1000;
export const CARD_BET_SECONDS = 15;
export const DEFAULT_CARD_ROUNDS = 10;

const SUITS: { name: SuitName; symbol: string; color: 'red' | 'black' }[] = [
  { name: 'clubs', symbol: '♣', color: 'black' },
  { name: 'diamonds', symbol: '♦', color: 'red' },
  { name: 'hearts', symbol: '♥', color: 'red' },
  { name: 'spades', symbol: '♠', color: 'black' }
];

function rankLabel(rank: number): string {
  if (rank === 1) return 'A';
  if (rank === 11) return 'J';
  if (rank === 12) return 'Q';
  if (rank === 13) return 'K';
  return String(rank);
}

export function createCardDeck(
  rng: SeededRandom,
  suitCount: number,
  aceHigh = true
): PlayingCard[] {
  if (!Number.isInteger(suitCount) || suitCount < 1 || suitCount > SUITS.length) {
    throw new RangeError('Suit count must be between one and four.');
  }
  const cards: PlayingCard[] = [];
  for (const suit of SUITS.slice(0, suitCount)) {
    for (let rank = 1; rank <= 13; rank += 1) {
      cards.push({
        id: suit.name + '-' + rankLabel(rank),
        rank,
        value: rank === 1 && aceHigh ? 14 : rank,
        rankLabel: rankLabel(rank),
        suit: suit.name,
        suitSymbol: suit.symbol,
        color: suit.color
      });
    }
  }
  return rng.shuffle(cards);
}

export function calculateCardProbabilities(
  reference: PlayingCard,
  unseenCards: readonly PlayingCard[]
): CardProbabilities {
  if (unseenCards.length === 0) {
    return { higher: 0, lower: 0, tie: 0, unseenCards: 0 };
  }
  let higher = 0;
  let lower = 0;
  let tie = 0;
  for (const card of unseenCards) {
    if (card.value > reference.value) higher += 1;
    else if (card.value < reference.value) lower += 1;
    else tie += 1;
  }
  const count = unseenCards.length;
  return { higher: higher / count, lower: lower / count, tie: tie / count, unseenCards: count };
}

export function getKellyFraction(winProbability: number, lossProbability: number): number {
  if (!Number.isFinite(winProbability) || !Number.isFinite(lossProbability)
    || winProbability < 0 || lossProbability < 0
    || winProbability + lossProbability <= 0) return 0;
  const edge = winProbability - lossProbability;
  if (edge <= 0) return 0;
  return Math.max(0, Math.min(1, edge / (winProbability + lossProbability)));
}

export function getRecommendedSide(probabilities: CardProbabilities): BetSide | null {
  if (probabilities.higher > probabilities.lower) return 'higher';
  if (probabilities.lower > probabilities.higher) return 'lower';
  return null;
}

export function getSideProbabilities(
  probabilities: CardProbabilities,
  side: BetSide
): { win: number; loss: number; push: number; expectedValuePerUnit: number; fullKellyFraction: number } {
  const win = side === 'higher' ? probabilities.higher : probabilities.lower;
  const loss = side === 'higher' ? probabilities.lower : probabilities.higher;
  return {
    win,
    loss,
    push: probabilities.tie,
    expectedValuePerUnit: win - loss,
    fullKellyFraction: getKellyFraction(win, loss)
  };
}

export function getHalfKellyStake(bankroll: number, fullKellyFraction: number): number {
  if (!Number.isFinite(bankroll) || bankroll <= 0
    || !Number.isFinite(fullKellyFraction) || fullKellyFraction <= 0) return 0;
  return Math.min(Math.floor(bankroll), Math.max(0, Math.round(bankroll * fullKellyFraction * 0.5)));
}

export function resolveCardBet(args: {
  reference: PlayingCard;
  nextCard: PlayingCard;
  unseenCards: readonly PlayingCard[];
  side: BetSide | null;
  stake: number;
  bankroll: number;
  elapsedMs: number;
}): CardBetResolution {
  const { reference, nextCard, unseenCards, side, stake, bankroll, elapsedMs } = args;
  if (!Number.isFinite(bankroll) || bankroll < 0) throw new RangeError('Bankroll must be non-negative.');
  if (!Number.isFinite(stake) || stake < 0 || stake > bankroll) throw new RangeError('Stake must be between zero and the available bankroll.');
  if (side === null && stake !== 0) throw new RangeError('A skipped decision cannot have a stake.');
  const probabilities = calculateCardProbabilities(reference, unseenCards);
  const bestSide = getRecommendedSide(probabilities);
  const positiveEvOpportunity = bestSide !== null;
  const selected = side === null ? null : getSideProbabilities(probabilities, side);
  const fullKellyFraction = selected?.fullKellyFraction ?? 0;
  const halfKellyStake = selected ? getHalfKellyStake(bankroll, fullKellyFraction) : 0;
  const decisionWasPositiveEv = selected !== null && selected.expectedValuePerUnit > 0;
  const sizingEfficiency = decisionWasPositiveEv
    ? Math.max(0, 1 - Math.abs(stake - halfKellyStake) / Math.max(halfKellyStake, 1))
    : null;

  if (side === null || stake === 0) {
    return {
      reference, nextCard, side: null, stake: 0, outcome: 'skipped', pnl: 0,
      probabilities, chosenWinProbability: null, chosenLossProbability: null,
      expectedValuePerUnit: null, fullKellyFraction: 0, halfKellyStake,
      bestSide, positiveEvOpportunity, decisionWasPositiveEv: false, sizingEfficiency: null,
      bankrollBefore: bankroll, bankrollAfter: bankroll, elapsedMs: Math.max(0, elapsedMs)
    };
  }

  let outcome: CardOutcome;
  if (nextCard.value === reference.value) outcome = 'push';
  else if ((side === 'higher' && nextCard.value > reference.value)
    || (side === 'lower' && nextCard.value < reference.value)) outcome = 'win';
  else outcome = 'loss';

  const pnl = outcome === 'win' ? stake : outcome === 'loss' ? -stake : 0;
  return {
    reference, nextCard, side, stake, outcome, pnl,
    probabilities,
    chosenWinProbability: selected?.win ?? null,
    chosenLossProbability: selected?.loss ?? null,
    expectedValuePerUnit: selected?.expectedValuePerUnit ?? null,
    fullKellyFraction,
    halfKellyStake,
    bestSide,
    positiveEvOpportunity,
    decisionWasPositiveEv,
    sizingEfficiency,
    bankrollBefore: bankroll,
    bankrollAfter: Math.max(0, bankroll + pnl),
    elapsedMs: Math.max(0, elapsedMs)
  };
}

export function summarizeCardSession(
  results: readonly CardBetResolution[],
  config: { suitCount: number; aceHigh: boolean; initialBankroll?: number },
  durationSeconds: number,
  playedAt = new Date().toISOString()
): CardSessionSummary {
  const bets = results.filter((result) => result.outcome !== 'skipped');
  const positiveEvBets = bets.filter((result) => result.decisionWasPositiveEv).length;
  const opportunities = results.filter((result) => result.positiveEvOpportunity).length;
  const participatedInOpportunity = results.filter((result) => result.positiveEvOpportunity && result.decisionWasPositiveEv).length;
  const sizingResults = results.flatMap((result) => result.sizingEfficiency === null ? [] : [result.sizingEfficiency]);
  const finalBankroll = results.at(-1)?.bankrollAfter ?? config.initialBankroll ?? INITIAL_CARD_BANKROLL;
  return {
    rounds: results.length,
    bets: bets.length,
    wins: results.filter((result) => result.outcome === 'win').length,
    losses: results.filter((result) => result.outcome === 'loss').length,
    pushes: results.filter((result) => result.outcome === 'push').length,
    skipped: results.filter((result) => result.outcome === 'skipped').length,
    initialBankroll: config.initialBankroll ?? INITIAL_CARD_BANKROLL,
    finalBankroll,
    netPnl: finalBankroll - (config.initialBankroll ?? INITIAL_CARD_BANKROLL),
    positiveEvBets,
    positiveEvBetRate: bets.length === 0 ? null : positiveEvBets / bets.length,
    opportunities,
    opportunityParticipation: opportunities === 0 ? null : participatedInOpportunity / opportunities,
    sizingEfficiency: sizingResults.length === 0 ? null : sizingResults.reduce((sum, value) => sum + value, 0) / sizingResults.length,
    suitCount: config.suitCount,
    aceHigh: config.aceHigh,
    durationSeconds: Math.max(0, Math.round(durationSeconds)),
    playedAt
  };
}

export function formatCardProbability(probability: number): string {
  return (probability * 100).toFixed(1) + '%';
}

export function describeCardOutcome(outcome: CardOutcome): string {
  switch (outcome) {
    case 'win': return 'Won';
    case 'loss': return 'Lost';
    case 'push': return 'Tie · stake returned';
    case 'skipped': return 'No bet';
  }
}
