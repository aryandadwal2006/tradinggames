import type { SeededRandom } from './rng';

export interface FruitBag {
  apples: number;
  oranges: number;
}

export type FruitEventKind = 'none' | 'inflation' | 'deflation' | 'nullification';

export interface FruitEvent {
  kind: FruitEventKind;
  nullifiedBag: 0 | 1 | null;
}

export interface FruitQuote {
  bid: number;
  ask: number;
}

export interface FruitMarketState {
  bags: [FruitBag, FruitBag];
  event: FruitEvent;
  fairValue: number;
  quote: FruitQuote;
  quoteId: number;
  secondsUntilUpdate: number;
}

export type TradeSide = 'buy' | 'sell';

export interface FruitTrade {
  id: string;
  quoteId: number;
  side: TradeSide;
  price: number;
  fairValue: number;
  pnl: number;
  firstTradeOnQuote: boolean;
  playedAtMs: number;
}

export interface FruitSessionSummary {
  rawProfit: number;
  score: number;
  firstClickAccuracy: number | null;
  firstClickTrials: number;
  profitableFirstClicks: number;
  trades: number;
  profitableTrades: number;
  durationSeconds: number;
  playedAt: string;
}

export interface FruitMarketConfig {
  minFruitPerType: number;
  maxFruitPerType: number;
  maxFruitAddedPerUpdate: number;
  minUpdateSeconds: number;
  maxUpdateSeconds: number;
  midpointNoiseFraction: number;
  minHalfSpreadFraction: number;
  maxHalfSpreadFraction: number;
  eventWeights: Readonly<Record<FruitEventKind, number>>;
}

export const FRUIT_MARKET_CONFIG: FruitMarketConfig = {
  minFruitPerType: 3,
  maxFruitPerType: 8,
  maxFruitAddedPerUpdate: 3,
  minUpdateSeconds: 15,
  maxUpdateSeconds: 20,
  midpointNoiseFraction: 0.15,
  minHalfSpreadFraction: 0.025,
  maxHalfSpreadFraction: 0.07,
  eventWeights: { none: 70, inflation: 10, deflation: 10, nullification: 10 }
};

export const FRUIT_SESSION_DURATION_SECONDS = 300;

function randomBag(rng: SeededRandom, config = FRUIT_MARKET_CONFIG): FruitBag {
  return {
    apples: rng.int(config.minFruitPerType, config.maxFruitPerType),
    oranges: rng.int(config.minFruitPerType, config.maxFruitPerType)
  };
}

function randomEvent(rng: SeededRandom, enabled: boolean): FruitEvent {
  if (!enabled) return { kind: 'none', nullifiedBag: null };
  const entries = Object.entries(FRUIT_MARKET_CONFIG.eventWeights) as [FruitEventKind, number][];
  const totalWeight = entries.reduce((sum, [, weight]) => sum + weight, 0);
  let ticket = rng.next() * totalWeight;
  let kind: FruitEventKind = 'none';
  for (const [candidate, weight] of entries) {
    ticket -= weight;
    if (ticket < 0) {
      kind = candidate;
      break;
    }
  }
  return {
    kind,
    nullifiedBag: kind === 'nullification' ? (rng.next() < 0.5 ? 0 : 1) : null
  };
}

export function computeFruitFairValue(
  bags: readonly [FruitBag, FruitBag],
  event: FruitEvent
): number {
  const included = bags.filter((_, index) => event.kind !== 'nullification' || index !== event.nullifiedBag);
  const apples = included.reduce((sum, bag) => sum + bag.apples, 0);
  const oranges = included.reduce((sum, bag) => sum + bag.oranges, 0);
  const baseValue = apples * oranges;
  switch (event.kind) {
    case 'inflation': return baseValue * 2;
    case 'deflation': return baseValue * 0.5;
    case 'nullification':
    case 'none':
      return baseValue;
  }
}

export function makeFruitQuote(fairValue: number, rng: SeededRandom): FruitQuote {
  if (!Number.isFinite(fairValue) || fairValue < 0) {
    throw new RangeError('Fair value must be a finite non-negative number.');
  }
  const noiseLimit = Math.max(2, fairValue * FRUIT_MARKET_CONFIG.midpointNoiseFraction);
  const midpointOffset = Math.round((rng.next() * 2 - 1) * noiseLimit);
  const midpoint = Math.max(1, Math.round(fairValue + midpointOffset));
  const spreadFraction = FRUIT_MARKET_CONFIG.minHalfSpreadFraction
    + rng.next() * (FRUIT_MARKET_CONFIG.maxHalfSpreadFraction - FRUIT_MARKET_CONFIG.minHalfSpreadFraction);
  const halfSpread = Math.max(1, Math.round(fairValue * spreadFraction));
  const bid = Math.max(0, midpoint - halfSpread);
  const ask = Math.max(bid + 1, midpoint + halfSpread);
  return { bid, ask };
}

export function createFruitMarket(
  rng: SeededRandom,
  eventsEnabled = true,
  quoteId = 1
): FruitMarketState {
  const bags: [FruitBag, FruitBag] = [randomBag(rng), randomBag(rng)];
  const event = randomEvent(rng, eventsEnabled);
  const fairValue = computeFruitFairValue(bags, event);
  return {
    bags,
    event,
    fairValue,
    quote: makeFruitQuote(fairValue, rng),
    quoteId,
    secondsUntilUpdate: rng.int(
      FRUIT_MARKET_CONFIG.minUpdateSeconds,
      FRUIT_MARKET_CONFIG.maxUpdateSeconds
    )
  };
}

function updateBag(bag: FruitBag, rng: SeededRandom): FruitBag {
  const apples = bag.apples + rng.int(0, FRUIT_MARKET_CONFIG.maxFruitAddedPerUpdate);
  const oranges = bag.oranges + rng.int(0, FRUIT_MARKET_CONFIG.maxFruitAddedPerUpdate);
  if (apples > FRUIT_MARKET_CONFIG.maxFruitPerType || oranges > FRUIT_MARKET_CONFIG.maxFruitPerType) {
    return randomBag(rng);
  }
  return { apples, oranges };
}

export function advanceFruitMarket(
  current: FruitMarketState,
  rng: SeededRandom,
  eventsEnabled = true
): FruitMarketState {
  const bags: [FruitBag, FruitBag] = [
    updateBag(current.bags[0], rng),
    updateBag(current.bags[1], rng)
  ];
  const event = randomEvent(rng, eventsEnabled);
  const fairValue = computeFruitFairValue(bags, event);
  return {
    bags,
    event,
    fairValue,
    quote: makeFruitQuote(fairValue, rng),
    quoteId: current.quoteId + 1,
    secondsUntilUpdate: rng.int(
      FRUIT_MARKET_CONFIG.minUpdateSeconds,
      FRUIT_MARKET_CONFIG.maxUpdateSeconds
    )
  };
}

export function executeFruitTrade(
  market: FruitMarketState,
  side: TradeSide,
  tradeId: string,
  firstTradeOnQuote: boolean,
  playedAtMs = Date.now()
): FruitTrade {
  const price = side === 'buy' ? market.quote.ask : market.quote.bid;
  const pnl = side === 'buy' ? market.fairValue - price : price - market.fairValue;
  return {
    id: tradeId,
    quoteId: market.quoteId,
    side,
    price,
    fairValue: market.fairValue,
    pnl,
    firstTradeOnQuote,
    playedAtMs
  };
}

export function calculateFirstClickAccuracy(
  trades: readonly FruitTrade[]
): { trials: number; profitable: number; accuracy: number | null } {
  const firstTrades = trades.filter((trade) => trade.firstTradeOnQuote);
  const profitable = firstTrades.filter((trade) => trade.pnl > 0).length;
  return {
    trials: firstTrades.length,
    profitable,
    accuracy: firstTrades.length === 0 ? null : profitable / firstTrades.length
  };
}

export function calculateFruitScore(rawProfit: number, accuracy: number | null): number {
  if (!Number.isFinite(rawProfit)) throw new TypeError('Raw profit must be finite.');
  if (accuracy === null) return 0;
  if (!Number.isFinite(accuracy) || accuracy < 0 || accuracy > 1) {
    throw new RangeError('Accuracy must be between zero and one.');
  }
  return rawProfit * accuracy;
}

export function summarizeFruitSession(
  trades: readonly FruitTrade[],
  durationSeconds: number,
  playedAt = new Date().toISOString()
): FruitSessionSummary {
  const firstClick = calculateFirstClickAccuracy(trades);
  const rawProfit = trades.reduce((sum, trade) => sum + trade.pnl, 0);
  return {
    rawProfit,
    score: calculateFruitScore(rawProfit, firstClick.accuracy),
    firstClickAccuracy: firstClick.accuracy,
    firstClickTrials: firstClick.trials,
    profitableFirstClicks: firstClick.profitable,
    trades: trades.length,
    profitableTrades: trades.filter((trade) => trade.pnl > 0).length,
    durationSeconds: Math.max(0, Math.round(durationSeconds)),
    playedAt
  };
}

export function describeFruitEvent(event: FruitEvent): string {
  switch (event.kind) {
    case 'none': return 'No active event';
    case 'inflation': return 'Fruit inflation · value × 2';
    case 'deflation': return 'Fruit deflation · value × 0.5';
    case 'nullification':
      return 'Bag ' + (event.nullifiedBag === 0 ? 'A' : 'B') + ' nullified · its fruit counts as zero';
  }
}
