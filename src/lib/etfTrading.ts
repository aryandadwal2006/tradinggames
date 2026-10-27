import type { SeededRandom } from './rng';

export type ETFTradeSide = 'buy-etf' | 'sell-etf';
export type ETFUpdateKind = 'normal' | 'news';

export interface StockQuote {
  symbol: string;
  name: string;
  mid: number;
  bid: number;
  ask: number;
  halfSpread: number;
}

export interface ETFMarketState {
  tick: number;
  stocks: StockQuote[];
  etfMid: number;
  etfBid: number;
  etfAsk: number;
  secondsUntilUpdate: number;
  lastUpdateKind: ETFUpdateKind;
  newsHeadline: string | null;
  newsSymbol: string | null;
}

export interface ETFOpportunity {
  navMid: number;
  stockBidSum: number;
  stockAskSum: number;
  buyETFEdge: number;
  sellETFEdge: number;
  bestSide: ETFTradeSide | null;
  bestEdge: number;
}

export interface ETFTrade {
  id: string;
  trader: 'player' | 'bot';
  botId: string | null;
  side: ETFTradeSide;
  tick: number;
  etfPrice: number;
  stockBasketPrice: number;
  pnl: number;
  opportunityEdgeAtExecution: number;
  newsDriven: boolean;
  executedAtMs: number;
}

export interface ETFBotProfile {
  id: string;
  name: string;
  style: string;
  reactionDelayMinMs: number;
  reactionDelayMaxMs: number;
  minimumEdge: number;
  valuationNoise: number;
  attention: number;
  aggressiveness: number;
}

export interface ETFBotAction {
  profile: ETFBotProfile;
  side: ETFTradeSide;
  perceivedEdge: number;
  reactionDelayMs: number;
  tookAction: boolean;
  reason: string;
}

export interface ETFSessionSummary {
  trades: number;
  profitableTrades: number;
  accuracy: number | null;
  totalPnl: number;
  newsPnl: number;
  normalPnl: number;
  bestEdge: number | null;
  averageEdge: number | null;
  bestBotRanked: boolean;
  botPnl: number[];
  durationSeconds: number;
  constituentCount: number;
  playedAt: string;
}

export interface ETFMarketConfig {
  stockCount: number;
  minStockPrice: number;
  maxStockPrice: number;
  stockHalfSpreadMin: number;
  stockHalfSpreadMax: number;
  normalStockMoveCents: number;
  normalETFMomentumFraction: number;
  etfTrendMoveCents: number;
  newsProbability: number;
  newsMoveMinCents: number;
  newsMoveMaxCents: number;
  resetFractionAfterTrade: number;
  minUpdateSeconds: number;
  maxUpdateSeconds: number;
}

export const ETF_MARKET_CONFIG: ETFMarketConfig = {
  stockCount: 3,
  minStockPrice: 15,
  maxStockPrice: 55,
  stockHalfSpreadMin: 0.05,
  stockHalfSpreadMax: 0.2,
  normalStockMoveCents: 45,
  normalETFMomentumFraction: 0.7,
  etfTrendMoveCents: 40,
  newsProbability: 0.12,
  newsMoveMinCents: 80,
  newsMoveMaxCents: 350,
  resetFractionAfterTrade: 0.7,
  minUpdateSeconds: 1,
  maxUpdateSeconds: 2
};

export const ETF_SESSION_DURATION_SECONDS = 600;

const STOCK_NAMES = [
  { symbol: 'ALP', name: 'Alpine Systems' },
  { symbol: 'BRK', name: 'Brookfield Devices' },
  { symbol: 'CRN', name: 'Crown Networks' },
  { symbol: 'DOV', name: 'Dover Dynamics' }
] as const;

const NEWS_HEADLINES = [
  'Quarterly guidance revised',
  'Major contract announced',
  'Regulatory review opened',
  'Supply-chain update',
  'Product launch delayed',
  'New distribution agreement',
  'Executive outlook updated'
] as const;

function cents(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function makeStockQuote(symbol: string, name: string, mid: number, halfSpread: number): StockQuote {
  const safeMid = Math.max(1, cents(mid));
  const safeHalfSpread = Math.max(0.01, cents(halfSpread));
  return {
    symbol,
    name,
    mid: safeMid,
    halfSpread: safeHalfSpread,
    bid: Math.max(0.01, cents(safeMid - safeHalfSpread)),
    ask: cents(safeMid + safeHalfSpread)
  };
}

function randomHalfSpread(rng: SeededRandom): number {
  const config = ETF_MARKET_CONFIG;
  return cents(config.stockHalfSpreadMin
    + rng.next() * (config.stockHalfSpreadMax - config.stockHalfSpreadMin));
}

function setStockMid(stock: StockQuote, mid: number): StockQuote {
  return makeStockQuote(stock.symbol, stock.name, mid, stock.halfSpread);
}

function randomUpdateSeconds(rng: SeededRandom): number {
  return rng.int(ETF_MARKET_CONFIG.minUpdateSeconds, ETF_MARKET_CONFIG.maxUpdateSeconds);
}

export function sumStockMids(stocks: readonly StockQuote[]): number {
  return cents(stocks.reduce((sum, stock) => sum + stock.mid, 0));
}

export function getETFOpportunity(state: ETFMarketState): ETFOpportunity {
  const stockBidSum = cents(state.stocks.reduce((sum, stock) => sum + stock.bid, 0));
  const stockAskSum = cents(state.stocks.reduce((sum, stock) => sum + stock.ask, 0));
  const buyETFEdge = cents(stockBidSum - state.etfAsk);
  const sellETFEdge = cents(state.etfBid - stockAskSum);
  const bestEdge = Math.max(buyETFEdge, sellETFEdge);
  return {
    navMid: sumStockMids(state.stocks),
    stockBidSum,
    stockAskSum,
    buyETFEdge,
    sellETFEdge,
    bestSide: bestEdge > 0 ? (buyETFEdge >= sellETFEdge ? 'buy-etf' : 'sell-etf') : null,
    bestEdge
  };
}

export function createETFMarket(
  rng: SeededRandom,
  stockCount = ETF_MARKET_CONFIG.stockCount
): ETFMarketState {
  if (!Number.isInteger(stockCount) || stockCount < 2 || stockCount > STOCK_NAMES.length) {
    throw new RangeError('An ETF must contain between two and four constituent stocks.');
  }
  const stocks = STOCK_NAMES.slice(0, stockCount).map((stock) => makeStockQuote(
    stock.symbol,
    stock.name,
    rng.int(ETF_MARKET_CONFIG.minStockPrice * 100, ETF_MARKET_CONFIG.maxStockPrice * 100) / 100,
    randomHalfSpread(rng)
  ));
  const navMid = sumStockMids(stocks);
  const totalStockSpread = stocks.reduce((sum, stock) => sum + stock.halfSpread, 0) * 2;
  const etfHalfSpread = cents(totalStockSpread + 0.5);
  return {
    tick: 0,
    stocks,
    etfMid: navMid,
    etfBid: cents(navMid - etfHalfSpread),
    etfAsk: cents(navMid + etfHalfSpread),
    secondsUntilUpdate: randomUpdateSeconds(rng),
    lastUpdateKind: 'normal',
    newsHeadline: null,
    newsSymbol: null
  };
}

function changeStock(stock: StockQuote, deltaCents: number): StockQuote {
  return setStockMid(stock, Math.max(1, stock.mid + deltaCents / 100));
}

export function advanceETFMarket(state: ETFMarketState, rng: SeededRandom): ETFMarketState {
  const stocks = state.stocks.map((stock) => changeStock(
    stock,
    rng.int(-ETF_MARKET_CONFIG.normalStockMoveCents, ETF_MARKET_CONFIG.normalStockMoveCents)
  ));
  let lastUpdateKind: ETFUpdateKind = 'normal';
  let newsHeadline: string | null = null;
  let newsSymbol: string | null = null;

  if (rng.next() < ETF_MARKET_CONFIG.newsProbability) {
    const changedIndex = rng.int(0, stocks.length - 1);
    const stock = stocks[changedIndex];
    if (stock) {
      const magnitude = rng.int(ETF_MARKET_CONFIG.newsMoveMinCents, ETF_MARKET_CONFIG.newsMoveMaxCents);
      const direction = rng.next() < 0.5 ? -1 : 1;
      stocks[changedIndex] = changeStock(stock, magnitude * direction);
      lastUpdateKind = 'news';
      newsHeadline = rng.pick(NEWS_HEADLINES);
      newsSymbol = stock.symbol;
    }
  }

  const previousNav = sumStockMids(state.stocks);
  const nextNav = sumStockMids(stocks);
  const navMove = nextNav - previousNav;
  const trendMove = rng.int(-ETF_MARKET_CONFIG.etfTrendMoveCents, ETF_MARKET_CONFIG.etfTrendMoveCents) / 100;
  const etfMove = cents(navMove * ETF_MARKET_CONFIG.normalETFMomentumFraction + trendMove);
  const etfMid = Math.max(1, cents(state.etfMid + etfMove));
  const etfHalfSpread = Math.max(0.05, cents((state.etfAsk - state.etfBid) / 2));
  const nextState: ETFMarketState = {
    tick: state.tick + 1,
    stocks,
    etfMid,
    etfBid: Math.max(0.01, cents(etfMid - etfHalfSpread)),
    etfAsk: cents(etfMid + etfHalfSpread),
    secondsUntilUpdate: randomUpdateSeconds(rng),
    lastUpdateKind,
    newsHeadline,
    newsSymbol
  };
  return nextState;
}

export function executeETFTrade(
  state: ETFMarketState,
  side: ETFTradeSide,
  id: string,
  trader: 'player' | 'bot' = 'player',
  botId: string | null = null,
  executedAtMs = Date.now()
): ETFTrade {
  const opportunity = getETFOpportunity(state);
  if (side === 'buy-etf') {
    return {
      id, trader, botId, side, tick: state.tick,
      etfPrice: state.etfAsk,
      stockBasketPrice: opportunity.stockBidSum,
      pnl: cents(opportunity.buyETFEdge),
      opportunityEdgeAtExecution: opportunity.buyETFEdge,
      newsDriven: state.lastUpdateKind === 'news',
      executedAtMs
    };
  }
  return {
    id, trader, botId, side, tick: state.tick,
    etfPrice: state.etfBid,
    stockBasketPrice: opportunity.stockAskSum,
    pnl: cents(opportunity.sellETFEdge),
    opportunityEdgeAtExecution: opportunity.sellETFEdge,
    newsDriven: state.lastUpdateKind === 'news',
    executedAtMs
  };
}

export function resetStockArbitrageAfterTrade(state: ETFMarketState): ETFMarketState {
  const currentBasketMid = sumStockMids(state.stocks);
  if (currentBasketMid <= 0) return state;
  const difference = state.etfMid - currentBasketMid;
  const adjustedStocks = state.stocks.map((stock) => setStockMid(
    stock,
    Math.max(1, stock.mid + difference * ETF_MARKET_CONFIG.resetFractionAfterTrade * (stock.mid / currentBasketMid))
  ));
  return { ...state, stocks: adjustedStocks };
}

export const ETF_BOT_PROFILES: readonly ETFBotProfile[] = [
  { id: 'rapid-fire', name: 'Maya', style: 'Fast, selective', reactionDelayMinMs: 130, reactionDelayMaxMs: 360, minimumEdge: 0.18, valuationNoise: 0.13, attention: 0.94, aggressiveness: 0.92 },
  { id: 'careful', name: 'Noah', style: 'Patient, precise', reactionDelayMinMs: 420, reactionDelayMaxMs: 950, minimumEdge: 0.3, valuationNoise: 0.2, attention: 0.85, aggressiveness: 0.74 },
  { id: 'opportunistic', name: 'Iris', style: 'Opportunistic', reactionDelayMinMs: 250, reactionDelayMaxMs: 680, minimumEdge: 0.12, valuationNoise: 0.32, attention: 0.72, aggressiveness: 0.84 },
  { id: 'inconsistent', name: 'Leo', style: 'Quick, uneven', reactionDelayMinMs: 160, reactionDelayMaxMs: 1050, minimumEdge: 0.42, valuationNoise: 0.42, attention: 0.63, aggressiveness: 0.68 }
] as const;

export function simulateETFBotAction(
  state: ETFMarketState,
  profile: ETFBotProfile,
  rng: SeededRandom
): ETFBotAction | null {
  const opportunity = getETFOpportunity(state);
  const trueCandidates: { side: ETFTradeSide; edge: number }[] = [
    { side: 'buy-etf', edge: opportunity.buyETFEdge },
    { side: 'sell-etf', edge: opportunity.sellETFEdge }
  ];
  const perceived = trueCandidates.map((candidate) => ({
    ...candidate,
    perceivedEdge: candidate.edge + (rng.next() * 2 - 1) * profile.valuationNoise
  })).sort((a, b) => b.perceivedEdge - a.perceivedEdge);
  const candidate = perceived[0];
  if (!candidate || candidate.perceivedEdge < profile.minimumEdge) return null;
  const reactionDelayMs = rng.int(profile.reactionDelayMinMs, profile.reactionDelayMaxMs);
  if (rng.next() > profile.attention * profile.aggressiveness) return null;
  const trueCandidate = trueCandidates.find((entry) => entry.side === candidate.side);
  return {
    profile,
    side: candidate.side,
    perceivedEdge: cents(candidate.perceivedEdge),
    reactionDelayMs,
    tookAction: true,
    reason: trueCandidate && trueCandidate.edge > 0
      ? 'Detected a positive executable spread.'
      : 'Acted on a noisy estimate; the apparent edge was not real.'
  };
}

export function summarizeETFSession(
  trades: readonly ETFTrade[],
  durationSeconds: number,
  constituentCount: number,
  playedAt = new Date().toISOString()
): ETFSessionSummary {
  const playerTrades = trades.filter((trade) => trade.trader === 'player');
  const botTrades = trades.filter((trade) => trade.trader === 'bot');
  const bestEdge = playerTrades.length ? Math.max(...playerTrades.map((trade) => trade.opportunityEdgeAtExecution)) : null;
  return {
    trades: playerTrades.length,
    profitableTrades: playerTrades.filter((trade) => trade.pnl > 0).length,
    accuracy: playerTrades.length ? playerTrades.filter((trade) => trade.pnl > 0).length / playerTrades.length : null,
    totalPnl: cents(playerTrades.reduce((sum, trade) => sum + trade.pnl, 0)),
    newsPnl: cents(playerTrades.filter((trade) => trade.newsDriven).reduce((sum, trade) => sum + trade.pnl, 0)),
    normalPnl: cents(playerTrades.filter((trade) => !trade.newsDriven).reduce((sum, trade) => sum + trade.pnl, 0)),
    bestEdge,
    averageEdge: playerTrades.length
      ? cents(playerTrades.reduce((sum, trade) => sum + trade.opportunityEdgeAtExecution, 0) / playerTrades.length)
      : null,
    bestBotRanked: playerTrades.reduce((sum, trade) => sum + trade.pnl, 0) > botTrades.reduce((sum, trade) => sum + trade.pnl, 0),
    botPnl: ETF_BOT_PROFILES.map((profile) => cents(botTrades.filter((trade) => trade.botId === profile.id).reduce((sum, trade) => sum + trade.pnl, 0))),
    durationSeconds: Math.max(0, Math.round(durationSeconds)),
    constituentCount,
    playedAt
  };
}
