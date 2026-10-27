import type { SeededRandom } from './rng';

export type CardSuit = 'hearts' | 'diamonds' | 'clubs' | 'spades';
export type AceMode = 'high' | 'low';
export type TradeSide = 'buy' | 'sell';

export interface PlayingCard {
  id: string;
  rank: number;
  suit: CardSuit;
}

export interface CardQuote {
  bid: number;
  ask: number;
}

export interface TradingPosition {
  cash: number;
  inventory: number;
  trades: number;
}

export interface CardDeal {
  hands: PlayingCard[][];
  centerCards: PlayingCard[];
}

export interface BotResponder {
  id: number;
  fairValue: number;
  threshold: number;
  reactionDelayMs: number;
}

export interface BotResponse {
  botId: number;
  side: TradeSide;
  fairValue: number;
  edge: number;
  reactionDelayMs: number;
}

export const MARKET_CARD_PLAYER_OPTIONS = [2, 3, 4, 5, 6] as const;
export const MARKET_CARD_CENTER_COUNT = 3;
export const INITIAL_TRADING_POSITION: TradingPosition = { cash: 0, inventory: 0, trades: 0 };

const SUITS: readonly CardSuit[] = ['hearts', 'diamonds', 'clubs', 'spades'];
const RANKS = Array.from({ length: 13 }, (_, index) => index + 2);

export function createStandardDeck(): PlayingCard[] {
  return SUITS.flatMap((suit) => RANKS.map((rank) => ({
    id: String(rank) + '-' + suit,
    rank,
    suit
  })));
}

export function cardSuitSymbol(suit: CardSuit): string {
  switch (suit) {
    case 'hearts': return '♥';
    case 'diamonds': return '♦';
    case 'clubs': return '♣';
    case 'spades': return '♠';
  }
}

export function cardRankLabel(rank: number): string {
  if (rank === 11) return 'J';
  if (rank === 12) return 'Q';
  if (rank === 13) return 'K';
  if (rank === 14) return 'A';
  return String(rank);
}

export function cardSuitColor(suit: CardSuit): 'red' | 'black' {
  return suit === 'hearts' || suit === 'diamonds' ? 'red' : 'black';
}

export function cardValue(card: PlayingCard, aceMode: AceMode): number {
  if (card.rank === 14) {
    if (aceMode === 'low') return 10;
    return cardSuitColor(card.suit) === 'red' ? 140 : -140;
  }
  if (card.rank >= 11) {
    const magnitude = 100 + (card.rank - 10) * 10;
    return magnitude * (cardSuitColor(card.suit) === 'red' ? 1 : -1);
  }
  return card.rank * 10;
}

export function dealMarketOfCards(rng: SeededRandom, playerCount = 4): CardDeal {
  if (!Number.isInteger(playerCount) || playerCount < 2 || playerCount > 6) {
    throw new RangeError('Player count must be an integer from 2 through 6.');
  }
  const deck = rng.shuffle(createStandardDeck());
  let cursor = 0;
  const hands: PlayingCard[][] = Array.from({ length: playerCount }, () => []);
  for (let cardIndex = 0; cardIndex < 2; cardIndex += 1) {
    for (let playerIndex = 0; playerIndex < playerCount; playerIndex += 1) {
      const card = deck[cursor++];
      if (card) hands[playerIndex]?.push(card);
    }
  }
  const centerCards = deck.slice(cursor, cursor + MARKET_CARD_CENTER_COUNT);
  return { hands, centerCards };
}

export function estimateGameValue(
  knownHand: readonly PlayingCard[],
  revealedCenterCards: readonly PlayingCard[],
  playerCount: number,
  aceMode: AceMode
): number {
  if (!Number.isInteger(playerCount) || playerCount < 2 || playerCount > 6) {
    throw new RangeError('Player count must be an integer from 2 through 6.');
  }
  if (revealedCenterCards.length > MARKET_CARD_CENTER_COUNT) {
    throw new RangeError('There cannot be more revealed center cards than center-card slots.');
  }
  const knownIds = new Set([...knownHand, ...revealedCenterCards].map((card) => card.id));
  if (knownIds.size !== knownHand.length + revealedCenterCards.length) {
    throw new Error('A card cannot be both in your hand and on the center table.');
  }
  const unknownDeck = createStandardDeck().filter((card) => !knownIds.has(card.id));
  const unknownInPlay = (playerCount - 1) * 2 + MARKET_CARD_CENTER_COUNT - revealedCenterCards.length;
  const knownValue = [...knownHand, ...revealedCenterCards]
    .reduce((sum, card) => sum + cardValue(card, aceMode), 0);
  const remainingExpectedValue = unknownDeck.length === 0
    ? 0
    : unknownDeck.reduce((sum, card) => sum + cardValue(card, aceMode), 0) / unknownDeck.length;
  return knownValue + unknownInPlay * remainingExpectedValue;
}

export function calculateTrueGameValue(
  hands: readonly (readonly PlayingCard[])[],
  centerCards: readonly PlayingCard[],
  aceMode: AceMode
): number {
  return [...hands.flat(), ...centerCards]
    .reduce((sum, card) => sum + cardValue(card, aceMode), 0);
}

export function validateCardQuote(quote: CardQuote): boolean {
  return Number.isFinite(quote.bid) && Number.isFinite(quote.ask) && quote.bid < quote.ask;
}

export function makeBotQuote(fairValue: number, spreadPoints: number, inventory = 0): CardQuote {
  const safeSpread = Math.max(1, Math.abs(spreadPoints));
  const inventorySkew = Math.max(-3, Math.min(3, inventory)) * safeSpread * 0.12;
  const mid = fairValue - inventorySkew;
  return { bid: mid - safeSpread, ask: mid + safeSpread };
}

export function applyPositionTrade(
  position: TradingPosition,
  side: TradeSide,
  price: number,
  size = 1
): TradingPosition {
  if (!Number.isFinite(price)) throw new TypeError('Trade price must be finite.');
  if (!Number.isInteger(size) || size < 1 || size > 10) {
    throw new RangeError('Trade size must be an integer from 1 through 10.');
  }
  return {
    cash: position.cash + (side === 'buy' ? -price : price) * size,
    inventory: position.inventory + (side === 'buy' ? size : -size),
    trades: position.trades + 1
  };
}

export function settlePosition(position: TradingPosition, finalValue: number): number {
  if (!Number.isFinite(finalValue)) throw new TypeError('Final value must be finite.');
  return position.cash + position.inventory * finalValue;
}

export function chooseFirstBotResponder(
  quote: CardQuote,
  bots: readonly BotResponder[]
): BotResponse | null {
  if (!validateCardQuote(quote)) throw new RangeError('A valid bid-ask quote is required.');
  const candidates: BotResponse[] = [];
  for (const bot of bots) {
    if (!Number.isFinite(bot.fairValue) || !Number.isFinite(bot.threshold) || bot.threshold < 0) continue;
    const buyEdge = bot.fairValue - quote.ask;
    const sellEdge = quote.bid - bot.fairValue;
    if (buyEdge > bot.threshold) {
      candidates.push({
        botId: bot.id, side: 'buy', fairValue: bot.fairValue,
        edge: buyEdge, reactionDelayMs: bot.reactionDelayMs
      });
    } else if (sellEdge > bot.threshold) {
      candidates.push({
        botId: bot.id, side: 'sell', fairValue: bot.fairValue,
        edge: sellEdge, reactionDelayMs: bot.reactionDelayMs
      });
    }
  }
  candidates.sort((left, right) => left.reactionDelayMs - right.reactionDelayMs);
  return candidates[0] ?? null;
}

export function generateBotProfiles(
  rng: SeededRandom,
  fairValues: readonly number[]
): BotResponder[] {
  return fairValues.map((fairValue, index) => ({
    id: index + 1,
    fairValue,
    threshold: [2, 5, 8, 12][index % 4] ?? 5,
    reactionDelayMs: rng.int(100, 900) + index * 15
  }));
}
