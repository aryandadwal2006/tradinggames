import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  advanceETFMarket,
  createETFMarket,
  ETF_BOT_PROFILES,
  ETF_SESSION_DURATION_SECONDS,
  executeETFTrade,
  getETFOpportunity,
  resetStockArbitrageAfterTrade,
  simulateETFBotAction,
  summarizeETFSession,
  type ETFMarketState,
  type ETFSessionSummary,
  type ETFTrade,
  type ETFTradeSide
} from '../lib/etfTrading';
import { createSessionSeed, SeededRandom } from '../lib/rng';

interface ETFTradingProps {
  onExit: () => void;
  onComplete: (summary: ETFSessionSummary) => void;
}

const DURATIONS = [
  { value: 180, label: '3 minutes' },
  { value: 360, label: '6 minutes' },
  { value: ETF_SESSION_DURATION_SECONDS, label: '10 minutes · standard' }
];

function signed(value: number): string {
  return (value > 0 ? '+' : '') + value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function clock(milliseconds: number): string {
  const seconds = Math.max(0, Math.ceil(milliseconds / 1000));
  return String(Math.floor(seconds / 60)).padStart(2, '0') + ':' + String(seconds % 60).padStart(2, '0');
}

function price(value: number): string {
  return value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function botDescription(trade: ETFTrade): string {
  if (trade.trader === 'player') return trade.side === 'buy-etf' ? 'You bought the ETF, selling the basket.' : 'You sold the ETF, buying the basket.';
  const profile = ETF_BOT_PROFILES.find((item) => item.id === trade.botId);
  return (profile?.name ?? 'A trader') + (trade.side === 'buy-etf' ? ' bought the ETF.' : ' sold the ETF.');
}

export default function ETFTrading({ onExit, onComplete }: ETFTradingProps) {
  const [phase, setPhase] = useState<'ready' | 'running' | 'finished'>('ready');
  const [durationSeconds, setDurationSeconds] = useState(ETF_SESSION_DURATION_SECONDS);
  const [constituentCount, setConstituentCount] = useState(3);
  const [market, setMarket] = useState<ETFMarketState | null>(null);
  const [remainingMs, setRemainingMs] = useState(ETF_SESSION_DURATION_SECONDS * 1000);
  const [trades, setTrades] = useState<ETFTrade[]>([]);
  const [tape, setTape] = useState<string[]>([]);
  const [lastTrade, setLastTrade] = useState<ETFTrade | null>(null);
  const rngRef = useRef<SeededRandom>(new SeededRandom(createSessionSeed()));
  const marketRef = useRef<ETFMarketState | null>(null);
  const updateDeadlineRef = useRef(0);
  const sessionDeadlineRef = useRef(0);
  const startedAtRef = useRef(0);
  const tradeCounterRef = useRef(1);
  const completionSavedRef = useRef(false);
  const botTimersRef = useRef<Set<number>>(new Set());

  const publishMarket = useCallback((next: ETFMarketState) => {
    marketRef.current = next;
    setMarket(next);
  }, []);

  const startSession = useCallback(() => {
    for (const timer of botTimersRef.current) window.clearTimeout(timer);
    botTimersRef.current.clear();
    rngRef.current = new SeededRandom(createSessionSeed());
    const next = createETFMarket(rngRef.current, constituentCount);
    const now = Date.now();
    marketRef.current = next;
    setMarket(next);
    startedAtRef.current = now;
    sessionDeadlineRef.current = now + durationSeconds * 1000;
    updateDeadlineRef.current = now + next.secondsUntilUpdate * 1000;
    setRemainingMs(durationSeconds * 1000);
    setTrades([]);
    setTape(['Opening book · no executable arbitrage at launch.']);
    setLastTrade(null);
    tradeCounterRef.current = 1;
    completionSavedRef.current = false;
    setPhase('running');
  }, [constituentCount, durationSeconds]);

  const appendTrade = useCallback((trade: ETFTrade) => {
    setTrades((current) => [...current, trade]);
    setLastTrade(trade);
    setTape((current) => [
      (trade.trader === 'player' ? 'YOU' : ETF_BOT_PROFILES.find((bot) => bot.id === trade.botId)?.name?.toUpperCase() ?? 'BOT')
        + ' · ' + (trade.side === 'buy-etf' ? 'BUY ETF' : 'SELL ETF')
        + ' · ' + signed(trade.pnl) + (trade.newsDriven ? ' · NEWS' : ''),
      ...current
    ].slice(0, 10));
  }, []);

  const executePlayerTrade = useCallback((side: ETFTradeSide) => {
    const current = marketRef.current;
    if (phase !== 'running' || !current || Date.now() >= sessionDeadlineRef.current) {
      if (phase === 'running') setPhase('finished');
      return;
    }
    const trade = executeETFTrade(current, side, 'trade-' + tradeCounterRef.current++, 'player', null, Date.now());
    appendTrade(trade);
    publishMarket(resetStockArbitrageAfterTrade(current));
  }, [appendTrade, phase, publishMarket]);

  useEffect(() => {
    if (phase !== 'running') return;
    const interval = window.setInterval(() => {
      const now = Date.now();
      const timeLeft = Math.max(0, sessionDeadlineRef.current - now);
      setRemainingMs(timeLeft);
      if (timeLeft <= 0) {
        setPhase('finished');
        return;
      }

      const current = marketRef.current;
      if (!current || now < updateDeadlineRef.current) return;
      const next = advanceETFMarket(current, rngRef.current);
      publishMarket(next);
      updateDeadlineRef.current = now + next.secondsUntilUpdate * 1000;
      setTape((items) => [
        next.lastUpdateKind === 'news'
          ? 'NEWS · ' + next.newsSymbol + ' · ' + next.newsHeadline
          : 'Tick ' + String(next.tick).padStart(3, '0') + ' · quotes updated',
        ...items
      ].slice(0, 10));

      for (const profile of ETF_BOT_PROFILES) {
        const action = simulateETFBotAction(next, profile, rngRef.current);
        if (!action) continue;
        const timer = window.setTimeout(() => {
          botTimersRef.current.delete(timer);
          const latest = marketRef.current;
          if (!latest || latest.tick !== next.tick || Date.now() >= sessionDeadlineRef.current) return;
          const botTrade = executeETFTrade(
            latest,
            action.side,
            'trade-' + tradeCounterRef.current++,
            'bot',
            profile.id,
            Date.now()
          );
          const afterTrade = resetStockArbitrageAfterTrade(latest);
          marketRef.current = afterTrade;
          setMarket(afterTrade);
          appendTrade(botTrade);
        }, action.reactionDelayMs);
        botTimersRef.current.add(timer);
      }
    }, 80);
    return () => window.clearInterval(interval);
  }, [appendTrade, phase, publishMarket]);

  useEffect(() => () => {
    for (const timer of botTimersRef.current) window.clearTimeout(timer);
    botTimersRef.current.clear();
  }, []);

  useEffect(() => {
    if (phase !== 'finished' || completionSavedRef.current) return;
    completionSavedRef.current = true;
    for (const timer of botTimersRef.current) window.clearTimeout(timer);
    botTimersRef.current.clear();
    const elapsedSeconds = Math.min(durationSeconds, (Date.now() - startedAtRef.current) / 1000);
    onComplete(summarizeETFSession(trades, elapsedSeconds, constituentCount));
  }, [constituentCount, durationSeconds, onComplete, phase, trades]);

  const opportunity = useMemo(() => market ? getETFOpportunity(market) : null, [market]);
  const playerTrades = trades.filter((trade) => trade.trader === 'player');
  const botTrades = trades.filter((trade) => trade.trader === 'bot');
  const totalPnl = playerTrades.reduce((sum, trade) => sum + trade.pnl, 0);
  const newsPnl = playerTrades.filter((trade) => trade.newsDriven).reduce((sum, trade) => sum + trade.pnl, 0);
  const normalPnl = totalPnl - newsPnl;
  const profitableTrades = playerTrades.filter((trade) => trade.pnl > 0).length;

  const botStats = ETF_BOT_PROFILES.map((profile) => ({
    ...profile,
    pnl: botTrades.filter((trade) => trade.botId === profile.id).reduce((sum, trade) => sum + trade.pnl, 0),
    trades: botTrades.filter((trade) => trade.botId === profile.id).length
  }));

  return (
    <section className="game-shell etf-shell" aria-label="ETF Trading Challenge">
      <div className="game-topline">
        <button className="text-button" onClick={onExit} type="button"><span aria-hidden="true">←</span> All games</button>
        <div className="game-breadcrumb">ARBITRAGE <span>/</span> ETF TRADING</div>
      </div>

      {phase === 'ready' && (
        <div className="setup-panel etf-setup-panel">
          <div className="eyebrow">PRACTICE MODULE 08</div>
          <h1>ETF Trading Challenge</h1>
          <p className="setup-copy">Spot when an ETF and its constituent basket disagree. Trade the ETF against the executable stock basket before the price gap closes.</p>
          <div className="setup-controls">
            <label className="field-label" htmlFor="etf-duration">Session length
              <select id="etf-duration" value={durationSeconds} onChange={(event) => setDurationSeconds(Number(event.target.value))}>
                {DURATIONS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
              </select>
            </label>
            <label className="field-label" htmlFor="etf-constituents">Constituent stocks
              <select id="etf-constituents" value={constituentCount} onChange={(event) => setConstituentCount(Number(event.target.value))}>
                {[2, 3, 4].map((count) => <option key={count} value={count}>{count} stocks</option>)}
              </select>
            </label>
          </div>
          <div className="etf-rule-grid">
            <div><strong>Buy ETF</strong><span>Buy the ETF at its ask and sell each stock at its bid.</span><b>Σ stock bids − ETF ask</b></div>
            <div><strong>Sell ETF</strong><span>Sell the ETF at its bid and buy each stock at its ask.</span><b>ETF bid − Σ stock asks</b></div>
            <div><strong>Act quickly</strong><span>Quotes move, news hits constituents, and other traders compete for gaps.</span><b>Executable edge first</b></div>
          </div>
          <div className="fermi-method-note etf-method-note">
            <strong>Market process and opposing traders</strong>
            <p>The opening quotes are constructed without an arbitrage. Prices then move on randomized normal updates or a news shock. After any trade, the stock basket moves 70% toward the ETF midpoint while the ETF quote is retained. Quote widths, news frequency, and price steps are local simulation settings because the public rules do not specify the platform's update distribution. Four traders have distinct response times, thresholds, attention, and valuation noise.</p>
          </div>
          <button className="primary-button large-button" type="button" onClick={startSession}>Start trading <span aria-hidden="true">↗</span></button>
          <p className="muted-note">10-minute standard session · randomized stocks and news · no account required</p>
        </div>
      )}

      {phase === 'running' && market && opportunity && (
        <div className="etf-active">
          <div className="session-metrics">
            <div className={'timer-block' + (remainingMs <= 30000 ? ' timer-warning' : '')}><span className="metric-label">TIME LEFT</span><strong>{clock(remainingMs)}</strong></div>
            <div className="metric-block"><span className="metric-label">YOUR P&amp;L</span><strong className={totalPnl >= 0 ? 'value-positive' : 'value-negative'}>{signed(totalPnl)}</strong></div>
            <div className="metric-block"><span className="metric-label">NEWS P&amp;L</span><strong className={newsPnl >= 0 ? 'value-positive' : 'value-negative'}>{signed(newsPnl)}</strong></div>
            <div className="metric-block"><span className="metric-label">TRADES</span><strong>{playerTrades.length}</strong></div>
          </div>

          <div className="etf-market-banner">
            <div><span className="etf-market-status-dot" /> LIVE MARKET <b>·</b> TICK {String(market.tick).padStart(3, '0')}</div>
            {market.lastUpdateKind === 'news' && market.newsHeadline
              ? <span className="etf-news-banner">NEWS · {market.newsSymbol} · {market.newsHeadline}</span>
              : <span className="etf-normal-banner">NORMAL FLOW · NEXT UPDATE {market.secondsUntilUpdate}s</span>}
          </div>

          <div className="etf-book-layout">
            <section className="etf-constituents-panel">
              <div className="etf-panel-heading"><div><div className="eyebrow">CONSTITUENTS</div><h2>Underlying stocks</h2></div><span>{market.stocks.length} names</span></div>
              <div className="etf-stock-table">
                <div className="etf-stock-header"><span>SYMBOL</span><span>BID</span><span>ASK</span><span>MID</span></div>
                {market.stocks.map((stock) => (
                  <div className={'etf-stock-row' + (stock.symbol === market.newsSymbol && market.lastUpdateKind === 'news' ? ' etf-stock-news' : '')} key={stock.symbol}>
                    <strong>{stock.symbol}<small>{stock.name}</small></strong><span>{price(stock.bid)}</span><span>{price(stock.ask)}</span><span>{price(stock.mid)}</span>
                  </div>
                ))}
                <div className="etf-stock-sum"><span>EXECUTABLE BASKET</span><strong>{price(opportunity.stockBidSum)}</strong><strong>{price(opportunity.stockAskSum)}</strong><span>NAV {price(opportunity.navMid)}</span></div>
              </div>
            </section>

            <section className="etf-fund-panel">
              <div className="etf-panel-heading"><div><div className="eyebrow">TRADED FUND</div><h2>ETF · QMX</h2></div><span className="etf-executable-label">EXECUTABLE</span></div>
              <div className="etf-quote-big">
                <div><span>BID</span><strong>{price(market.etfBid)}</strong></div>
                <div><span>ASK</span><strong>{price(market.etfAsk)}</strong></div>
              </div>
              <div className="etf-nav-line"><span>Basket mid / NAV</span><strong>{price(opportunity.navMid)}</strong><span>ETF mid</span><strong>{price(market.etfMid)}</strong></div>
              <div className="etf-opportunity-card">
                <div className="eyebrow">IMMEDIATE ARBITRAGE</div>
                <div className="etf-edge-row"><span>Buy ETF edge</span><strong className={opportunity.buyETFEdge > 0 ? 'value-positive' : ''}>{signed(opportunity.buyETFEdge)}</strong></div>
                <div className="etf-edge-row"><span>Sell ETF edge</span><strong className={opportunity.sellETFEdge > 0 ? 'value-positive' : ''}>{signed(opportunity.sellETFEdge)}</strong></div>
                <div className="etf-best-edge"><span>{opportunity.bestSide ? 'BEST AVAILABLE EDGE' : 'NO POSITIVE EDGE'}</span><strong>{opportunity.bestSide ? signed(opportunity.bestEdge) : '—'}</strong></div>
              </div>
              <div className="etf-trade-actions">
                <button type="button" className="etf-buy-button" onClick={() => executePlayerTrade('buy-etf')}><span>BUY ETF</span><small>Sell basket at bids</small><b>↗</b></button>
                <button type="button" className="etf-sell-button" onClick={() => executePlayerTrade('sell-etf')}><span>SELL ETF</span><small>Buy basket at asks</small><b>↗</b></button>
              </div>
              {lastTrade && lastTrade.trader === 'player' && <div className={'fruit-feedback ' + (lastTrade.pnl > 0 ? 'fruit-feedback-positive' : lastTrade.pnl < 0 ? 'fruit-feedback-negative' : '')} role="status"><span>Last trade · {lastTrade.side === 'buy-etf' ? 'BUY ETF' : 'SELL ETF'}</span><strong>{signed(lastTrade.pnl)}</strong><small>{lastTrade.newsDriven ? 'News-driven market' : 'Normal market'}</small></div>}
              <div className="etf-pnl-split"><div><span>NORMAL P&amp;L</span><strong className={normalPnl >= 0 ? 'value-positive' : 'value-negative'}>{signed(normalPnl)}</strong></div><div><span>NEWS P&amp;L</span><strong className={newsPnl >= 0 ? 'value-positive' : 'value-negative'}>{signed(newsPnl)}</strong></div></div>
            </section>
          </div>

          <div className="etf-lower-layout">
            <section className="etf-lower-panel">
              <div className="etf-panel-heading"><div><div className="eyebrow">OTHER TRADERS</div><h2>Live standings</h2></div><span>Same quotes · different decisions</span></div>
              <div className="etf-bot-list">
                {botStats.map((bot) => (
                  <div className="etf-bot-row" key={bot.id}>
                    <div className="etf-bot-avatar">{bot.name.charAt(0)}</div><div className="etf-bot-details"><strong>{bot.name}</strong><span>{bot.style} · {bot.trades} trades</span></div><strong className={bot.pnl >= 0 ? 'value-positive' : 'value-negative'}>{signed(bot.pnl)}</strong>
                  </div>
                ))}
              </div>
            </section>
            <section className="etf-lower-panel">
              <div className="etf-panel-heading"><div><div className="eyebrow">MARKET TAPE</div><h2>Recent activity</h2></div><span>{tape.length} updates</span></div>
              <div className="etf-tape">{tape.map((entry, index) => <div key={entry + '-' + index}><span>{String(tape.length - index).padStart(2, '0')}</span><p>{entry}</p></div>)}</div>
            </section>
          </div>
          <div className="session-footer"><span>Each action trades one ETF against one unit of every constituent. Quotes update independently of the display refresh.</span><button type="button" className="text-button" onClick={() => setPhase('finished')}>End session</button></div>
        </div>
      )}

      {phase === 'finished' && (
        <div className="results-panel etf-results-panel">
          <div className="eyebrow">MARKET CLOSED</div>
          <h1>{totalPnl > 0 ? 'Positive session' : totalPnl === 0 ? 'Flat session' : 'Negative session'}</h1>
          <p className="setup-copy">Review your executable edges and split normal-market performance from news-driven trading. The local score reflects realized basket spreads, not an undocumented platform point formula.</p>
          <div className="result-score"><span>YOUR TOTAL P&amp;L</span><strong className={totalPnl >= 0 ? 'value-positive' : 'value-negative'}>{signed(totalPnl)}</strong></div>
          <div className="result-grid etf-results-grid">
            <div><span>News P&amp;L</span><strong className={newsPnl >= 0 ? 'value-positive' : 'value-negative'}>{signed(newsPnl)}</strong></div>
            <div><span>Normal P&amp;L</span><strong className={normalPnl >= 0 ? 'value-positive' : 'value-negative'}>{signed(normalPnl)}</strong></div>
            <div><span>Trading accuracy</span><strong>{playerTrades.length ? Math.round(profitableTrades / playerTrades.length * 100) + '%' : '—'}</strong></div>
            <div><span>Trades executed</span><strong>{playerTrades.length}</strong></div>
          </div>
          <div className="review-section"><div className="section-heading"><h2>Trader comparison</h2><span>Net P&amp;L</span></div>
            <div className="etf-final-standings">
              {[{ id: 'player', name: 'You', pnl: totalPnl, count: playerTrades.length }, ...botStats.map((bot) => ({ id: bot.id, name: bot.name, pnl: bot.pnl, count: bot.trades }))]
                .sort((left, right) => right.pnl - left.pnl)
                .map((trader, index) => <div key={trader.id} className={'etf-final-row' + (trader.id === 'player' ? ' etf-you-row' : '')}><span>{String(index + 1).padStart(2, '0')}</span><strong>{trader.name}</strong><span>{trader.count} trades</span><b className={trader.pnl >= 0 ? 'value-positive' : 'value-negative'}>{signed(trader.pnl)}</b></div>)}
            </div>
          </div>
          <div className="review-section"><div className="section-heading"><h2>Trade history</h2><span>{playerTrades.length} player trades</span></div>
            {playerTrades.length === 0 ? <p className="muted-note">No trades were executed.</p> : <div className="review-list">{[...playerTrades].reverse().map((trade) => <div className="review-row" key={trade.id}><span className={'review-mark ' + (trade.pnl >= 0 ? 'correct-mark' : 'incorrect-mark')}>{trade.side === 'buy-etf' ? 'B' : 'S'}</span><div className="review-question"><strong>{trade.side === 'buy-etf' ? 'BUY ETF' : 'SELL ETF'} · tick {trade.tick}</strong><span>ETF {price(trade.etfPrice)} · basket {price(trade.stockBasketPrice)} · {trade.newsDriven ? 'news' : 'normal'}</span></div><div className="review-answer"><span>P&amp;L</span><strong className={trade.pnl >= 0 ? 'value-positive' : 'value-negative'}>{signed(trade.pnl)}</strong></div></div>)}</div>}
          </div>
          <div className="result-actions"><button className="primary-button large-button" type="button" onClick={() => setPhase('ready')}>Run another session <span aria-hidden="true">↗</span></button><button className="secondary-button large-button" type="button" onClick={onExit}>Back to games</button></div>
        </div>
      )}
    </section>
  );
}
