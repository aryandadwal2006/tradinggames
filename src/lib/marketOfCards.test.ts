import { describe, expect, it } from 'vitest';
import { SeededRandom } from './rng';
import {
  applyPositionTrade,
  calculateTrueGameValue,
  cardValue,
  chooseFirstBotResponder,
  createStandardDeck,
  dealMarketOfCards,
  estimateGameValue,
  generateBotProfiles,
  makeBotQuote,
  MARKET_CARD_CENTER_COUNT,
  settlePosition,
  validateCardQuote
} from './marketOfCards';

describe('Market of Cards rules', () => {
  it('builds a standard 52-card deck with unique identities', () => {
    const deck = createStandardDeck();
    expect(deck).toHaveLength(52);
    expect(new Set(deck.map((card) => card.id)).size).toBe(52);
  });

  it('values number cards and suit-sensitive face cards exactly', () => {
    expect(cardValue({ id: '9-diamonds', rank: 9, suit: 'diamonds' }, 'high')).toBe(90);
    expect(cardValue({ id: 'Q-hearts', rank: 12, suit: 'hearts' }, 'high')).toBe(120);
    expect(cardValue({ id: 'Q-spades', rank: 12, suit: 'spades' }, 'high')).toBe(-120);
    expect(cardValue({ id: 'A-diamonds', rank: 14, suit: 'diamonds' }, 'high')).toBe(140);
    expect(cardValue({ id: 'A-clubs', rank: 14, suit: 'clubs' }, 'high')).toBe(-140);
    expect(cardValue({ id: 'A-clubs', rank: 14, suit: 'clubs' }, 'low')).toBe(10);
  });

  it('deals two distinct private cards per player and three center cards', () => {
    const deal = dealMarketOfCards(new SeededRandom(12), 4);
    expect(deal.hands).toHaveLength(4);
    expect(deal.hands.every((hand) => hand.length === 2)).toBe(true);
    expect(deal.centerCards).toHaveLength(MARKET_CARD_CENTER_COUNT);
    const cards = [...deal.hands.flat(), ...deal.centerCards];
    expect(new Set(cards.map((card) => card.id)).size).toBe(cards.length);
  });

  it('estimates the full in-play table value without looking at hidden cards', () => {
    const deck = createStandardDeck();
    const hand = [deck.find((card) => card.id === '8-hearts')!, deck.find((card) => card.id === 'Q-spades')!];
    const revealed = [deck.find((card) => card.id === '9-diamonds')!];
    const estimate = estimateGameValue(hand, revealed, 4, 'high');
    expect(estimate).toBeGreaterThan(0);
    expect(estimate).toBeCloseTo(370, -1);
  });

  it('settles all card values from every in-play hand and center card', () => {
    const deal = dealMarketOfCards(new SeededRandom(91), 4);
    const finalValue = calculateTrueGameValue(deal.hands, deal.centerCards, 'high');
    expect(finalValue).toBe(
      deal.hands.flat().reduce((sum, card) => sum + cardValue(card, 'high'), 0)
      + deal.centerCards.reduce((sum, card) => sum + cardValue(card, 'high'), 0)
    );
  });

  it('applies buys and sells as signed inventory, and settles marked positions', () => {
    const bought = applyPositionTrade({ cash: 0, inventory: 0, trades: 0 }, 'buy', 100, 2);
    expect(bought).toEqual({ cash: -200, inventory: 2, trades: 1 });
    const sold = applyPositionTrade(bought, 'sell', 120);
    expect(sold).toEqual({ cash: -80, inventory: 1, trades: 2 });
    expect(settlePosition(sold, 150)).toBe(70);
  });

  it('validates bid below ask and skews bot quotes against existing inventory', () => {
    expect(validateCardQuote({ bid: -20, ask: -10 })).toBe(true);
    expect(validateCardQuote({ bid: 20, ask: 20 })).toBe(false);
    const flat = makeBotQuote(100, 10, 0);
    const long = makeBotQuote(100, 10, 3);
    expect(long.ask).toBeLessThan(flat.ask);
  });

  it('lets the first profitable responder trade, not every interested bot', () => {
    const quote = { bid: 95, ask: 105 };
    const responder = chooseFirstBotResponder(quote, [
      { id: 1, fairValue: 130, threshold: 2, reactionDelayMs: 450 },
      { id: 2, fairValue: 80, threshold: 2, reactionDelayMs: 120 },
      { id: 3, fairValue: 150, threshold: 2, reactionDelayMs: 300 }
    ]);
    expect(responder?.botId).toBe(2);
    expect(responder?.side).toBe('sell');
    expect(chooseFirstBotResponder(quote, [
      { id: 4, fairValue: 100, threshold: 2, reactionDelayMs: 20 }
    ])).toBeNull();
  });

  it('generates reproducible bot reaction profiles', () => {
    const left = generateBotProfiles(new SeededRandom(8), [10, 20, 30]);
    const right = generateBotProfiles(new SeededRandom(8), [10, 20, 30]);
    expect(left).toEqual(right);
  });
});
