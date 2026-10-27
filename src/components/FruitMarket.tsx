import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import {
  calculateFirstClickAccuracy,
  calculateFruitScore,
  createFruitMarket,
  describeFruitEvent,
  executeFruitTrade,
  FRUIT_SESSION_DURATION_SECONDS,
  advanceFruitMarket,
  summarizeFruitSession,
  type FruitMarketState,
  type FruitSessionSummary,
  type FruitTrade,
  type TradeSide
} from '../lib/fruitMarket';
import { createSessionSeed, SeededRandom } from '../lib/rng';

interface FruitMarketProps {
  onExit: () => void;
  onComplete: (summary: FruitSessionSummary) => void;
}

const DURATION_OPTIONS = [
  { value: 120, label: '2 minutes' },
  { value: FRUIT_SESSION_DURATION_SECONDS, label: '5 minutes · standard' },
  { value: 600, label: '10 minutes' }
];

function formatClock(milliseconds: number): string {
  const seconds = Math.max(0, Math.ceil(milliseconds / 1000));
  return String(Math.floor(seconds / 60)).padStart(2, '0') + ':' + String(seconds % 60).padStart(2, '0');
}

function signed(value: number): string {
  return (value > 0 ? '+' : '') + value.toLocaleString('en-US', { maximumFractionDigits: 2 });
}

export default function FruitMarket({ onExit, onComplete }: FruitMarketProps) {
  const [phase, setPhase] = useState<'ready' | 'running' | 'finished'>('ready');
  const [durationSeconds, setDurationSeconds] = useState(FRUIT_SESSION_DURATION_SECONDS);
  const [eventsEnabled, setEventsEnabled] = useState(true);
  const [market, setMarket] = useState<FruitMarketState | null>(null);
  const [remainingMs, setRemainingMs] = useState(FRUIT_SESSION_DURATION_SECONDS * 1000);
  const [marketMsUntilUpdate, setMarketMsUntilUpdate] = useState(0);
  const [trades, setTrades] = useState<FruitTrade[]>([]);
  const [lastTrade, setLastTrade] = useState<FruitTrade | null>(null);
  const [eventTape, setEventTape] = useState<string[]>([]);
  const rngRef = useRef<SeededRandom>(new SeededRandom(createSessionSeed()));
  const sessionDeadlineRef = useRef(0);
  const marketUpdateDeadlineRef = useRef(0);
  const sessionStartedAtRef = useRef(0);
  const completionSavedRef = useRef(false);
  const tradeNumberRef = useRef(1);
  const tradedQuoteIdsRef = useRef<Set<number>>(new Set());

  const firstClick = useMemo(() => calculateFirstClickAccuracy(trades), [trades]);
  const rawProfit = useMemo(() => trades.reduce((sum, trade) => sum + trade.pnl, 0), [trades]);
  const score = calculateFruitScore(rawProfit, firstClick.accuracy);
  const profitableTrades = trades.filter((trade) => trade.pnl > 0).length;

  const startSession = useCallback(() => {
    rngRef.current = new SeededRandom(createSessionSeed());
    tradedQuoteIdsRef.current = new Set();
    tradeNumberRef.current = 1;
    completionSavedRef.current = false;
    const now = Date.now();
    const initialMarket = createFruitMarket(rngRef.current, eventsEnabled);
    sessionStartedAtRef.current = now;
    sessionDeadlineRef.current = now + durationSeconds * 1000;
    marketUpdateDeadlineRef.current = now + initialMarket.secondsUntilUpdate * 1000;
    setMarket(initialMarket);
    setRemainingMs(durationSeconds * 1000);
    setMarketMsUntilUpdate(initialMarket.secondsUntilUpdate * 1000);
    setTrades([]);
    setLastTrade(null);
    setEventTape(['Market opened · two baskets loaded.']);
    setPhase('running');
  }, [durationSeconds, eventsEnabled]);

  const executeTrade = useCallback((side: TradeSide) => {
    if (phase !== 'running' || !market || Date.now() >= sessionDeadlineRef.current) {
      if (phase === 'running') setPhase('finished');
      return;
    }
    const firstTradeOnQuote = !tradedQuoteIdsRef.current.has(market.quoteId);
    tradedQuoteIdsRef.current.add(market.quoteId);
    const trade = executeFruitTrade(
      market,
      side,
      'trade-' + String(tradeNumberRef.current++),
      firstTradeOnQuote,
      Date.now()
    );
    setTrades((items) => [...items, trade]);
    setLastTrade(trade);
  }, [market, phase]);

  useEffect(() => {
    if (phase !== 'running' || !market) return;
    const timer = window.setInterval(() => {
      const now = Date.now();
      const remaining = Math.max(0, sessionDeadlineRef.current - now);
      const marketRemaining = Math.max(0, marketUpdateDeadlineRef.current - now);
      setRemainingMs(remaining);
      setMarketMsUntilUpdate(marketRemaining);

      if (remaining <= 0) {
        setPhase('finished');
        return;
      }

      if (marketRemaining <= 0) {
        const next = advanceFruitMarket(market, rngRef.current, eventsEnabled);
        setMarket(next);
        marketUpdateDeadlineRef.current = now + next.secondsUntilUpdate * 1000;
        setMarketMsUntilUpdate(next.secondsUntilUpdate * 1000);
        setEventTape((items) => [
          'Market #' + String(next.quoteId) + ' · ' + describeFruitEvent(next.event),
          ...items
        ].slice(0, 8));
        setLastTrade(null);
      }
    }, 100);
    return () => window.clearInterval(timer);
  }, [eventsEnabled, market, phase]);

  useEffect(() => {
    if (phase !== 'finished' || completionSavedRef.current) return;
    completionSavedRef.current = true;
    const elapsedSeconds = (Date.now() - sessionStartedAtRef.current) / 1000;
    onComplete(summarizeFruitSession(trades, elapsedSeconds));
  }, [onComplete, phase, trades]);

  const endSession = () => setPhase('finished');

  const onSettingsSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    startSession();
  };

  const currentEvent = market ? describeFruitEvent(market.event) : 'No active event';
  const timerWarning = remainingMs <= 30000 && phase === 'running';

  return (
    <section className="game-shell fruit-shell" aria-label="Fruit Market Game">
      <div className="game-topline">
        <button className="text-button" onClick={onExit} type="button"><span aria-hidden="true">←</span> All games</button>
        <div className="game-breadcrumb">MARKET MAKING <span>/</span> FRUIT MARKET</div>
      </div>

      {phase === 'ready' && (
        <div className="setup-panel fruit-setup-panel">
          <div className="eyebrow">PRACTICE MODULE 01</div>
          <h1>Fruit Market</h1>
          <p className="setup-copy">Calculate the basket value faster than the market moves. Buy below fair value, sell above it, and protect your first decision on every quote.</p>
          <form onSubmit={onSettingsSubmit}>
            <div className="setup-controls">
              <label className="field-label" htmlFor="fruit-duration">Session length
                <select id="fruit-duration" value={durationSeconds} onChange={(event) => setDurationSeconds(Number(event.target.value))}>
                  {DURATION_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </label>
              <label className="fruit-toggle-label" htmlFor="fruit-events"><span>Market events</span><small>Inflation, deflation, or one nullified basket</small>
                <input id="fruit-events" type="checkbox" checked={eventsEnabled} onChange={(event) => setEventsEnabled(event.target.checked)} />
                <span className="fruit-toggle" aria-hidden="true"><span /></span>
              </label>
            </div>
            <div className="fruit-rule-grid">
              <div><strong>Fair value</strong><span>Total apples × total oranges</span></div>
              <div><strong>Trade as often as you like</strong><span>Every click is one unit</span></div>
              <div><strong>Score</strong><span>Raw P&amp;L × first-click accuracy</span></div>
            </div>
            <div className="fermi-method-note fruit-config-note">
              <strong>Practice market parameters</strong>
              <p>Baskets start with 3–8 of each fruit and update every 15–20 seconds. Quotes use a randomized midpoint offset and spread; the official page does not publish its quote-generation distribution. When nullification occurs, this practice version excludes the selected basket's fruit from the total. Events clear at the next basket update.</p>
            </div>
            <button className="primary-button large-button" type="submit">Open market <span aria-hidden="true">↗</span></button>
            <p className="muted-note">New basket state and randomized quotes every session</p>
          </form>
        </div>
      )}

      {phase === 'running' && market && (
        <div className="fruit-active">
          <div className="fruit-session-head">
            <div className="session-metrics">
              <div className={'timer-block' + (timerWarning ? ' timer-warning' : '')}><span className="metric-label">TIME LEFT</span><strong>{formatClock(remainingMs)}</strong></div>
              <div className="metric-block"><span className="metric-label">RAW P&amp;L</span><strong className={rawProfit >= 0 ? 'value-positive' : 'value-negative'}>{signed(rawProfit)}</strong></div>
              <div className="metric-block"><span className="metric-label">FIRST-CLICK ACCURACY</span><strong>{firstClick.accuracy === null ? '—' : Math.round(firstClick.accuracy * 100) + '%'}</strong></div>
              <div className="metric-block"><span className="metric-label">TRADES</span><strong>{trades.length}</strong></div>
            </div>
          </div>

          <div className="fruit-timing-strip"><span className="fruit-live-dot" /> MARKET {String(market.quoteId).padStart(2, '0')} <span className="fruit-timing-divider" /> BASKET UPDATE IN <strong>{Math.ceil(marketMsUntilUpdate / 1000)}s</strong><span className="fruit-event-pill">{currentEvent}</span></div>

          <div className="fruit-basket-grid">
            {market.bags.map((bag, index) => {
              const isNullified = market.event.kind === 'nullification' && market.event.nullifiedBag === index;
              return (
                <div className={'fruit-basket-card' + (isNullified ? ' fruit-basket-nullified' : '')} key={index}>
                  <div className="fruit-basket-top"><span>BASKET {index === 0 ? 'A' : 'B'}</span><span>{isNullified ? 'NULLIFIED' : 'ACTIVE'}</span></div>
                  <div className="fruit-count-row"><span className="fruit-count-name"><i className="fruit-dot fruit-dot-apple" /> Apples</span><strong>{bag.apples}</strong></div>
                  <div className="fruit-count-row"><span className="fruit-count-name"><i className="fruit-dot fruit-dot-orange" /> Oranges</span><strong>{bag.oranges}</strong></div>
                  <div className="fruit-basket-total"><span>{isNullified ? 'Ignored for value' : 'Counts in fair value'}</span><span>{isNullified ? '× 0' : 'Included'}</span></div>
                </div>
              );
            })}
          </div>

          <div className="fruit-market-panel">
            <div className="fruit-market-header"><div><div className="eyebrow">LIVE MARKET</div><h2>Two-sided quote</h2></div><div className="fruit-hidden-value"><span>TRUE VALUE</span><strong>Hidden</strong></div></div>
            <div className="fruit-quote-grid">
              <button className="fruit-quote-button fruit-bid-button" type="button" onClick={() => executeTrade('sell')}>
                <span className="fruit-quote-label">BID <small>SELL TO MARKET</small></span><strong>{market.quote.bid}</strong><span className="fruit-quote-action">Sell 1 unit <b>↗</b></span>
              </button>
              <div className="fruit-spread"><span>SPREAD</span><strong>{market.quote.ask - market.quote.bid}</strong></div>
              <button className="fruit-quote-button fruit-ask-button" type="button" onClick={() => executeTrade('buy')}>
                <span className="fruit-quote-label">ASK <small>BUY FROM MARKET</small></span><strong>{market.quote.ask}</strong><span className="fruit-quote-action">Buy 1 unit <b>↗</b></span>
              </button>
            </div>
            {lastTrade && (
              <div className={'fruit-feedback ' + (lastTrade.pnl > 0 ? 'fruit-feedback-positive' : lastTrade.pnl < 0 ? 'fruit-feedback-negative' : '')} role="status">
                <span>{lastTrade.side === 'buy' ? 'Bought' : 'Sold'} at {lastTrade.price}</span>
                <strong>{signed(lastTrade.pnl)} {lastTrade.pnl > 0 ? 'profitable' : lastTrade.pnl < 0 ? 'unprofitable' : 'fair'}</strong>
                {lastTrade.firstTradeOnQuote && <small>First trade on this quote · counts toward accuracy</small>}
              </div>
            )}
            <div className="fruit-market-footer"><span>Bid and ask are executable prices. Each click trades one unit against the current quote.</span><button type="button" className="text-button" onClick={endSession}>End session</button></div>
          </div>

          <div className="fruit-lower-grid">
            <div className="fruit-small-panel"><div className="section-heading"><h2>Market tape</h2><span>{eventTape.length} updates</span></div><div className="fruit-tape">{eventTape.map((entry, index) => <div key={entry + index}><span className="fruit-tape-index">{String(eventTape.length - index).padStart(2, '0')}</span><span>{entry}</span></div>)}</div></div>
            <div className="fruit-small-panel"><div className="section-heading"><h2>Session discipline</h2></div><div className="fruit-discipline-row"><span>Profitable trades</span><strong>{profitableTrades} / {trades.length}</strong></div><div className="fruit-discipline-row"><span>First-click checks</span><strong>{firstClick.profitable} / {firstClick.trials}</strong></div><div className="fruit-discipline-row"><span>Accuracy-adjusted score</span><strong>{signed(score)}</strong></div><p className="muted-note">A first click is counted once per quote state. Later trades still affect raw P&amp;L.</p></div>
          </div>
        </div>
      )}

      {phase === 'finished' && (
        <div className="results-panel fruit-results-panel">
          <div className="eyebrow">MARKET CLOSED</div>
          <h1>{score > 0 ? 'Positive session' : score === 0 ? 'Flat session' : 'Negative session'}</h1>
          <p className="setup-copy">Review the trades and distinguish raw profitability from decision quality. The score applies first-click accuracy to raw P&amp;L, as described in the published rules.</p>
          <div className="result-score"><span>ACCURACY-ADJUSTED SCORE</span><strong>{signed(score)}</strong></div>
          <div className="result-grid fruit-results-grid">
            <div><span>Raw P&amp;L</span><strong className={rawProfit >= 0 ? 'value-positive' : 'value-negative'}>{signed(rawProfit)}</strong></div>
            <div><span>First-click accuracy</span><strong>{firstClick.accuracy === null ? '—' : Math.round(firstClick.accuracy * 100) + '%'}</strong></div>
            <div><span>Profitable trades</span><strong>{profitableTrades} / {trades.length}</strong></div>
            <div><span>Trades executed</span><strong>{trades.length}</strong></div>
          </div>
          <div className="review-section">
            <div className="section-heading"><h2>Trade review</h2><span>{trades.length} trades</span></div>
            {trades.length === 0 ? <p className="muted-note">No trades executed during this session.</p> : (
              <div className="review-list fruit-trade-list">
                {[...trades].reverse().map((trade) => (
                  <div className="review-row fruit-trade-row" key={trade.id}>
                    <span className={'review-mark ' + (trade.pnl > 0 ? 'correct-mark' : 'incorrect-mark')}>{trade.side === 'buy' ? 'B' : 'S'}</span>
                    <div className="review-question"><strong>{trade.side.toUpperCase()} · {trade.price} · QUOTE {trade.quoteId}</strong><span>{trade.firstTradeOnQuote ? 'First trade on quote' : 'Additional trade on quote'} · fair value was {trade.fairValue}</span></div>
                    <div className="review-answer"><span>Trade P&amp;L</span><strong className={trade.pnl >= 0 ? 'value-positive' : 'value-negative'}>{signed(trade.pnl)}</strong></div>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="result-actions"><button className="primary-button large-button" type="button" onClick={() => setPhase('ready')}>Run another market <span aria-hidden="true">↗</span></button><button className="secondary-button large-button" type="button" onClick={onExit}>Back to games</button></div>
        </div>
      )}
    </section>
  );
}
