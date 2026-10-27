import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import {
  describeCounterpartyOutcome,
  formatMarketNumber,
  generateMarketMakingSession,
  MAKE_MARKET_MAX_SPREAD_FRACTION,
  MAKE_MARKET_ROUNDS,
  settleMarketMakingRound,
  summarizeMarketMakingSession,
  validateConfidenceInterval,
  validateMarketQuote,
  type MarketMakingQuote,
  type MarketMakingQuestion,
  type MarketMakingRoundResult,
  type MarketMakingSessionSummary
} from '../lib/makeMeAMarket';
import { createSessionSeed, SeededRandom } from '../lib/rng';

interface MakeMeAMarketProps {
  onExit: () => void;
  onComplete: (summary: MarketMakingSessionSummary) => void;
}

const SESSION_SECONDS = 600;
const SPREAD_OPTIONS = [
  { value: 0.2, label: '20% · tight' },
  { value: 0.3, label: '30% · moderate' },
  { value: MAKE_MARKET_MAX_SPREAD_FRACTION, label: '40% · standard' },
  { value: 0.6, label: '60% · wide' }
];

function clock(seconds: number): string {
  const value = Math.max(0, Math.ceil(seconds));
  return String(Math.floor(value / 60)).padStart(2, '0') + ':' + String(value % 60).padStart(2, '0');
}

function signed(value: number): string {
  return (value > 0 ? '+' : '') + value.toLocaleString('en-US', { maximumFractionDigits: 3 });
}

function resultHeadline(result: MarketMakingRoundResult): string {
  switch (result.settlement.outcome) {
    case 'bought-at-bid': return 'The counterparty sold to your bid';
    case 'sold-at-ask': return 'The counterparty lifted your ask';
    case 'pass': return 'Your market was not crossed';
  }
}

export default function MakeMeAMarket({ onExit, onComplete }: MakeMeAMarketProps) {
  const [phase, setPhase] = useState<'ready' | 'interval' | 'quote' | 'reveal' | 'finished'>('ready');
  const [maxSpreadFraction, setMaxSpreadFraction] = useState(MAKE_MARKET_MAX_SPREAD_FRACTION);
  const [questions, setQuestions] = useState<MarketMakingQuestion[]>([]);
  const [roundIndex, setRoundIndex] = useState(0);
  const [intervalLow, setIntervalLow] = useState('');
  const [intervalHigh, setIntervalHigh] = useState('');
  const [bidInput, setBidInput] = useState('');
  const [askInput, setAskInput] = useState('');
  const [error, setError] = useState('');
  const [history, setHistory] = useState<MarketMakingRoundResult[]>([]);
  const [remainingMs, setRemainingMs] = useState(SESSION_SECONDS * 1000);
  const rngRef = useRef<SeededRandom>(new SeededRandom(createSessionSeed()));
  const startedAtRef = useRef(0);
  const deadlineRef = useRef(0);
  const completionSavedRef = useRef(false);
  const roundSubmittedRef = useRef(false);
  const intervalLowRef = useRef<HTMLInputElement>(null);
  const bidRef = useRef<HTMLInputElement>(null);

  const currentQuestion = questions[roundIndex] ?? null;
  const currentResult = history[history.length - 1] ?? null;
  const roundNumber = Math.min(roundIndex + 1, MAKE_MARKET_ROUNDS);

  const startSession = useCallback(() => {
    rngRef.current = new SeededRandom(createSessionSeed());
    const now = Date.now();
    setQuestions(generateMarketMakingSession(rngRef.current));
    setRoundIndex(0);
    setIntervalLow('');
    setIntervalHigh('');
    setBidInput('');
    setAskInput('');
    setError('');
    setHistory([]);
    setRemainingMs(SESSION_SECONDS * 1000);
    startedAtRef.current = now;
    deadlineRef.current = now + SESSION_SECONDS * 1000;
    completionSavedRef.current = false;
    roundSubmittedRef.current = false;
    setPhase('interval');
  }, []);

  const submitInterval = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (phase !== 'interval' || !currentQuestion) return;
    const low = Number(intervalLow);
    const high = Number(intervalHigh);
    if (!intervalLow.trim() || !intervalHigh.trim() || !validateConfidenceInterval(low, high)) {
      setError('Enter two positive numbers with the lower bound below the upper bound.');
      return;
    }
    setError('');
    setPhase('quote');
    window.requestAnimationFrame(() => bidRef.current?.focus());
  };

  const submitQuote = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (phase !== 'quote' || !currentQuestion || roundSubmittedRef.current) return;
    const bid = Number(bidInput);
    const ask = Number(askInput);
    const quote: MarketMakingQuote = { bid, ask };
    if (!bidInput.trim() || !askInput.trim() || !validateMarketQuote(bid, ask, maxSpreadFraction)) {
      const spreadText = Math.round(maxSpreadFraction * 100) + '%';
      setError('Enter a positive bid below the ask. Spread must not exceed ' + spreadText + ' of the quote midpoint.');
      return;
    }
    const low = Number(intervalLow);
    const high = Number(intervalHigh);
    try {
      const result = settleMarketMakingRound(currentQuestion, low, high, quote, Date.now(), maxSpreadFraction);
      roundSubmittedRef.current = true;
      setHistory((items) => [...items, result]);
      setError('');
      setRemainingMs(Math.max(0, deadlineRef.current - Date.now()));
      setPhase('reveal');
    } catch {
      setError('That quote could not be settled. Check the bid, ask, and spread cap.');
    }
  };

  const nextRound = () => {
    if (roundIndex + 1 >= questions.length) {
      setPhase('finished');
      return;
    }
    setRoundIndex((index) => index + 1);
    setIntervalLow('');
    setIntervalHigh('');
    setBidInput('');
    setAskInput('');
    setError('');
    roundSubmittedRef.current = false;
    setPhase('interval');
  };

  useEffect(() => {
    if (!['interval', 'quote'].includes(phase)) return;
    const timer = window.setInterval(() => {
      const remaining = Math.max(0, deadlineRef.current - Date.now());
      setRemainingMs(remaining);
      if (remaining <= 0) setPhase('finished');
    }, 100);
    return () => window.clearInterval(timer);
  }, [phase]);

  useEffect(() => {
    if (phase !== 'finished' || completionSavedRef.current) return;
    completionSavedRef.current = true;
    onComplete(summarizeMarketMakingSession(history, (Date.now() - startedAtRef.current) / 1000));
  }, [history, onComplete, phase]);

  useEffect(() => {
    if (phase === 'interval') window.requestAnimationFrame(() => intervalLowRef.current?.focus());
  }, [phase, roundIndex]);

  const marketResult = currentResult;
  const progress = Math.min(100, (history.length / Math.max(questions.length, 1)) * 100);
  const totalPnL = history.reduce((sum, result) => sum + result.settlement.pnl, 0);
  const intervalHits = history.filter((result) => result.intervalCovered).length;
  const trades = history.filter((result) => result.settlement.outcome !== 'pass').length;
  const averageSpread = history.length
    ? history.reduce((sum, result) => sum + result.settlement.spreadFraction, 0) / history.length
    : null;

  return (
    <section className="game-shell market-making-shell" aria-label="Make Me a Market">
      <div className="game-topline">
        <button className="text-button" onClick={onExit} type="button"><span aria-hidden="true">←</span> All games</button>
        <div className="game-breadcrumb">MARKET MAKING <span>/</span> MAKE ME A MARKET</div>
      </div>

      {phase === 'ready' && (
        <div className="setup-panel mmm-setup-panel">
          <div className="eyebrow">PRACTICE MODULE 06</div>
          <h1>Make Me a Market</h1>
          <p className="setup-copy">Set a defensible range, then quote a tradable market around your estimate. A fully informed computer counterparty acts whenever your bid or ask crosses the reference answer.</p>
          <div className="setup-controls">
            <label className="field-label" htmlFor="mmm-spread">Maximum quote spread
              <select id="mmm-spread" value={maxSpreadFraction} onChange={(event) => setMaxSpreadFraction(Number(event.target.value))}>
                {SPREAD_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </label>
            <div className="mmm-setting-stat"><strong>{MAKE_MARKET_ROUNDS}</strong><span>Distinct questions per session</span></div>
          </div>
          <div className="mmm-rule-grid">
            <div><strong>01 · Confidence interval</strong><span>Submit a positive lower and upper bound. No spread cap applies to this step.</span></div>
            <div><strong>02 · Make a market</strong><span>Set bid below ask within your selected maximum spread.</span></div>
            <div><strong>03 · Review the fill</strong><span>Crossing the hidden answer triggers an informed counterparty trade.</span></div>
          </div>
          <div className="fermi-method-note mmm-method-note">
            <strong>What this drill simulates</strong>
            <p>Each question uses a fixed reference answer from the local practice bank. The counterparty knows that answer and takes a trade only when your quote is exploitable. The chosen spread cap is a practice setting because the platform's exact default is not publicly stated. The drill reports interval coverage and trade P&amp;L, not the platform's unpublished leaderboard score.</p>
          </div>
          <button className="primary-button large-button" type="button" onClick={startSession}>Start market session <span aria-hidden="true">↗</span></button>
          <p className="muted-note">10 minutes · {Math.round(maxSpreadFraction * 100)}% maximum spread · question order randomized</p>
        </div>
      )}

      {(phase === 'interval' || phase === 'quote') && currentQuestion && (
        <div className="mmm-active">
          <div className="session-metrics">
            <div className={'timer-block' + (remainingMs <= 30000 ? ' timer-warning' : '')}><span className="metric-label">TIME LEFT</span><strong>{clock(remainingMs / 1000)}</strong></div>
            <div className="metric-block"><span className="metric-label">ROUND</span><strong>{roundNumber} / {questions.length}</strong></div>
            <div className="metric-block"><span className="metric-label">SESSION P&amp;L</span><strong className={totalPnL >= 0 ? 'value-positive' : 'value-negative'}>{signed(totalPnL)}</strong></div>
            <div className="metric-block"><span className="metric-label">TRADES</span><strong>{trades}</strong></div>
          </div>
          <div className="fermi-progress"><span style={{ width: progress + '%' }} /></div>
          <div className="question-card mmm-question-card">
            <div className="question-heading"><span className="eyebrow">QUESTION {String(roundNumber).padStart(2, '0')}</span><span className="mode-chip">{phase === 'interval' ? '95% CONFIDENCE INTERVAL' : 'QUOTE CONSTRUCTION'}</span></div>
            <h2>{currentQuestion.title}</h2>
            <p className="mmm-prompt">{currentQuestion.prompt}</p>
            {phase === 'interval' ? (
              <>
                <p className="mmm-context">{currentQuestion.context}</p>
                <form className="mmm-interval-form" onSubmit={submitInterval}>
                  <label className="field-label" htmlFor="mmm-low">Lower bound
                    <input ref={intervalLowRef} id="mmm-low" value={intervalLow} onChange={(event) => setIntervalLow(event.target.value)} inputMode="decimal" autoComplete="off" placeholder="Your lower estimate" />
                  </label>
                  <label className="field-label" htmlFor="mmm-high">Upper bound
                    <input id="mmm-high" value={intervalHigh} onChange={(event) => setIntervalHigh(event.target.value)} inputMode="decimal" autoComplete="off" placeholder="Your upper estimate" />
                  </label>
                  <button className="primary-button" type="submit">Lock interval <span aria-hidden="true">↵</span></button>
                </form>
              </>
            ) : (
              <>
                <div className="mmm-interval-locked"><span>YOUR 95% INTERVAL</span><strong>{formatMarketNumber(Number(intervalLow))} <i>—</i> {formatMarketNumber(Number(intervalHigh))}</strong></div>
                <p className="mmm-context">The question's answer remains hidden. A quote must be ordered and no wider than {Math.round(maxSpreadFraction * 100)}% of its midpoint.</p>
                <form className="mmm-quote-form" onSubmit={submitQuote}>
                  <label className="field-label" htmlFor="mmm-bid">Bid
                    <input ref={bidRef} id="mmm-bid" value={bidInput} onChange={(event) => setBidInput(event.target.value)} inputMode="decimal" autoComplete="off" placeholder="Price you buy at" />
                  </label>
                  <div className="mmm-quote-divider"><span>BID</span><i>↔</i><span>ASK</span></div>
                  <label className="field-label" htmlFor="mmm-ask">Ask
                    <input id="mmm-ask" value={askInput} onChange={(event) => setAskInput(event.target.value)} inputMode="decimal" autoComplete="off" placeholder="Price you sell at" />
                  </label>
                  <button className="primary-button" type="submit">Publish quote <span aria-hidden="true">↵</span></button>
                </form>
              </>
            )}
            {error && <div className="fermi-error" role="alert">{error}</div>}
          </div>
          <div className="session-footer"><span>Your interval coverage and quote quality are measured after the reference is revealed.</span><button className="text-button" type="button" onClick={() => setPhase('finished')}>End session</button></div>
        </div>
      )}

      {phase === 'reveal' && marketResult && (
        <div className="mmm-reveal">
          <div className="eyebrow">ROUND {String(roundNumber).padStart(2, '0')} SETTLED</div>
          <h1>{resultHeadline(marketResult)}</h1>
          <p className="setup-copy">{marketResult.settlement.outcome === 'pass'
            ? 'The full-information counterparty had no profitable reason to trade against this quote.'
            : 'The counterparty knew the reference answer and executed at the exploitable side of your market.'}</p>
          <div className="mmm-reveal-grid">
            <div><span>REFERENCE ANSWER</span><strong>{formatMarketNumber(marketResult.question.answer)} <small>{marketResult.question.unit}</small></strong></div>
            <div><span>YOUR QUOTE</span><strong>{formatMarketNumber(marketResult.bid)} <i>/</i> {formatMarketNumber(marketResult.ask)}</strong></div>
            <div><span>ROUND P&amp;L</span><strong className={marketResult.settlement.pnl < 0 ? 'value-negative' : 'value-positive'}>{signed(marketResult.settlement.pnl)}</strong></div>
            <div><span>INTERVAL COVERAGE</span><strong className={marketResult.intervalCovered ? 'value-positive' : 'value-negative'}>{marketResult.intervalCovered ? 'Covered' : 'Missed'}</strong></div>
          </div>
          <div className="mmm-settlement-card">
            <span className="eyebrow">COUNTERPARTY</span>
            <h2>{marketResult.settlement.tradePrice === null ? 'No trade executed' : 'Executed at ' + formatMarketNumber(marketResult.settlement.tradePrice)}</h2>
            <p>{describeCounterpartyOutcome(marketResult.settlement.outcome)}</p>
            <div className="mmm-settlement-detail"><span>Spread</span><strong>{formatMarketNumber(marketResult.settlement.spread)}</strong><span>Spread / midpoint</span><strong>{(marketResult.settlement.spreadFraction * 100).toFixed(1)}%</strong></div>
          </div>
          <div className="fermi-decomposition"><span>REFERENCE NOTES</span><p>{marketResult.question.context}</p></div>
          <div className="fermi-reveal-footer"><span>Interval covered: {formatMarketNumber(marketResult.intervalLow)}–{formatMarketNumber(marketResult.intervalHigh)}. Trade outcome follows the public counterparty rule.</span><button className="primary-button" type="button" onClick={nextRound}>{roundIndex + 1 >= questions.length ? 'See session review' : 'Next question'} <span aria-hidden="true">→</span></button></div>
        </div>
      )}

      {phase === 'finished' && (
        <div className="results-panel mmm-results-panel">
          <div className="eyebrow">SESSION COMPLETE</div>
          <h1>Market review</h1>
          <p className="setup-copy">Review whether your intervals covered the reference answers and whether your quotes invited an informed counterparty to trade at a loss to you.</p>
          <div className="result-score"><span>SESSION P&amp;L</span><strong className={totalPnL < 0 ? 'value-negative' : 'value-positive'}>{signed(totalPnL)}</strong></div>
          <div className="result-grid mmm-result-grid">
            <div><span>Questions settled</span><strong>{history.length}</strong></div>
            <div><span>Interval coverage</span><strong>{history.length ? Math.round(intervalHits / history.length * 100) + '%' : '—'}</strong></div>
            <div><span>Trades taken</span><strong>{trades}</strong></div>
            <div><span>Markets passed</span><strong>{history.length - trades}</strong></div>
          </div>
          <div className="review-section">
            <div className="section-heading"><h2>Quote-by-quote review</h2><span>{history.length} rounds</span></div>
            {history.length === 0 ? <p className="muted-note">No quotes settled during this session.</p> : (
              <div className="review-list mmm-review-list">
                {[...history].reverse().map((result) => (
                  <div className="review-row mmm-review-row" key={result.question.id}>
                    <span className={'review-mark ' + (result.intervalCovered ? 'correct-mark' : 'incorrect-mark')}>{result.intervalCovered ? '✓' : '×'}</span>
                    <div className="review-question"><strong>{result.question.title}</strong><span>Answer {formatMarketNumber(result.question.answer)} · interval {formatMarketNumber(result.intervalLow)}–{formatMarketNumber(result.intervalHigh)}</span></div>
                    <div className="review-answer"><span>{result.settlement.outcome === 'pass' ? 'No trade' : result.settlement.outcome === 'bought-at-bid' ? 'Bought at bid' : 'Sold at ask'}</span><strong className={result.settlement.pnl < 0 ? 'value-negative' : 'value-positive'}>{signed(result.settlement.pnl)}</strong></div>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="result-actions"><button className="primary-button large-button" type="button" onClick={() => setPhase('ready')}>Run another session <span aria-hidden="true">↗</span></button><button className="secondary-button large-button" type="button" onClick={onExit}>Back to games</button></div>
        </div>
      )}
    </section>
  );
}
