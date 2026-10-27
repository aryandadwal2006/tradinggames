import { describe, expect, it } from 'vitest';
import {
  advanceETFMarket,
  createETFMarket,
  ETF_BOT_PROFILES,
  executeETFTrade,
  getETFOpportunity,
  resetStockArbitrageAfterTrade,
  simulateETFBotAction,
  summarizeETFSession
} from './etfTrading';
import { SeededRandom } from './rng';

describe('ETF Trading Challenge', () => {
  it('creates a reproducible opening state without an arbitrage opportunity', () => {
    const a = createETFMarket(new SeededRandom(991), 3);
    const b = createETFMarket(new SeededRandom(991), 3);
    expect(a).toEqual(b);
    expect(a.stocks).toHaveLength(3);
    expect(getETFOpportunity(a).buyETFEdge).toBeLessThanOrEqual(0);
    expect(getETFOpportunity(a).sellETFEdge).toBeLessThanOrEqual(0);
  });

  it('supports each allowed ETF composition size and rejects invalid sizes', () => {
    for (const count of [2, 3, 4]) expect(createETFMarket(new SeededRandom(count), count).stocks).toHaveLength(count);
    expect(() => createETFMarket(new SeededRandom(1), 1)).toThrow(RangeError);
    expect(() => createETFMarket(new SeededRandom(1), 5)).toThrow(RangeError);
  });

  it('uses constituent executable prices for arbitrage', () => {
    const state = {
      ...createETFMarket(new SeededRandom(2), 2),
      stocks: [
        { symbol: 'A', name: 'A', mid: 20, bid: 19.8, ask: 20.2, halfSpread: 0.2 },
        { symbol: 'B', name: 'B', mid: 30, bid: 29.8, ask: 30.2, halfSpread: 0.2 }
      ],
      etfMid: 48,
      etfBid: 47.8,
      etfAsk: 48.2
    };
    const opportunity = getETFOpportunity(state);
    expect(opportunity.buyETFEdge).toBeCloseTo(1.4);
    expect(opportunity.sellETFEdge).toBeCloseTo(-2.6);
    expect(opportunity.bestSide).toBe('buy-etf');
    const trade = executeETFTrade(state, 'buy-etf', 'test');
    expect(trade.etfPrice).toBe(48.2);
    expect(trade.stockBasketPrice).toBe(49.6);
    expect(trade.pnl).toBeCloseTo(1.4);
  });

  it('updates prices with deterministic shocks and maintains valid quotes', () => {
    const state = createETFMarket(new SeededRandom(4), 4);
    const nextA = advanceETFMarket(state, new SeededRandom(5));
    const nextB = advanceETFMarket(state, new SeededRandom(5));
    expect(nextA).toEqual(nextB);
    expect(nextA.tick).toBe(state.tick + 1);
    for (const stock of nextA.stocks) {
      expect(stock.bid).toBeLessThan(stock.ask);
      expect(stock.bid).toBeGreaterThan(0);
      expect(stock.mid).toBeGreaterThan(0);
    }
    expect(nextA.etfBid).toBeLessThan(nextA.etfAsk);
  });

  it('reduces basket-to-ETF mid deviation after execution reset', () => {
    const original = {
      ...createETFMarket(new SeededRandom(44), 3),
      stocks: [
        { symbol: 'A', name: 'A', mid: 20, bid: 19.9, ask: 20.1, halfSpread: 0.1 },
        { symbol: 'B', name: 'B', mid: 20, bid: 19.9, ask: 20.1, halfSpread: 0.1 },
        { symbol: 'C', name: 'C', mid: 20, bid: 19.9, ask: 20.1, halfSpread: 0.1 }
      ],
      etfMid: 75,
      etfBid: 74.8,
      etfAsk: 75.2
    };
    const reset = resetStockArbitrageAfterTrade(original);
    expect(Math.abs(reset.etfMid - reset.stocks.reduce((sum, stock) => sum + stock.mid, 0)))
      .toBeLessThan(Math.abs(original.etfMid - 60));
    expect(reset.etfMid).toBe(original.etfMid);
  });

  it('gives different bot profiles independent, reproducible reaction decisions', () => {
    const state = {
      ...createETFMarket(new SeededRandom(44), 2),
      stocks: [
        { symbol: 'A', name: 'A', mid: 30, bid: 29.8, ask: 30.2, halfSpread: 0.2 },
        { symbol: 'B', name: 'B', mid: 30, bid: 29.8, ask: 30.2, halfSpread: 0.2 }
      ],
      etfMid: 56,
      etfBid: 55.8,
      etfAsk: 56.2
    };
    const bot = ETF_BOT_PROFILES[0]!;
    expect(simulateETFBotAction(state, bot, new SeededRandom(99))).toEqual(
      simulateETFBotAction(state, bot, new SeededRandom(99))
    );
    const strictBot = { ...bot, minimumEdge: 100 };
    expect(simulateETFBotAction(state, strictBot, new SeededRandom(2))).toBeNull();
  });

  it('separates normal and news P&L and summarizes the session', () => {
    const state = createETFMarket(new SeededRandom(3), 2);
    const news = executeETFTrade({ ...state, lastUpdateKind: 'news' }, 'buy-etf', '1');
    const normal = executeETFTrade({ ...state, lastUpdateKind: 'normal' }, 'sell-etf', '2');
    const summary = summarizeETFSession([news, normal], 60, 2, '2026-10-27T00:00:00Z');
    expect(summary.trades).toBe(2);
    expect(summary.newsPnl + summary.normalPnl).toBeCloseTo(summary.totalPnl);
    expect(summary.accuracy).toBe(0);
  });
});