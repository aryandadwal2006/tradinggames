import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import {
  calculateCardProbabilities,
  CARD_BET_SECONDS,
  createCardDeck,
  DEFAULT_CARD_ROUNDS,
  describeCardOutcome,
  formatCardProbability,
  getHalfKellyStake,
  getRecommendedSide,
  getSideProbabilities,
  INITIAL_CARD_BANKROLL,
  resolveCardBet,
  summarizeCardSession,
  type BetSide,
  type CardBetResolution,
  type CardSessionSummary
} from '../lib/nextCardBetting';
import { createSessionSeed, SeededRandom } from '../lib/rng';

interface NextCardBettingProps {
  onExit: () => void;
  onComplete: (summary: CardSessionSummary) => void;
}

const ROUND_OPTIONS = [5, 10, 20];

function clock(ms: number): string {
  const seconds = Math.max(0, Math.ceil(ms / 1000));
  return '00:' + String(seconds).padStart(2, '0');
}

function signed(value: number): string {
  return (value > 0 ? '+' : '') + value.toLocaleString('en-US', { maximumFractionDigits: 2 });
}

function CardTile({ card, small = false }: { card: { rankLabel: string; suitSymbol: string; color: string }; small?: boolean }) {
  return (
    <div className={'next-card-tile next-card-' + card.color + (small ? ' next-card-small' : '')} aria-label={card.rankLabel + ' of ' + card.suitSymbol}>
      <span>{card.rankLabel}</span><strong>{card.suitSymbol}</strong><span className="next-card-corner">{card.rankLabel}{card.suitSymbol}</span>
    </div>
  );
}

function recommendationText(result: CardBetResolution): string {
  if (!result.positiveEvOpportunity || !result.bestSide) return 'No positive expected-value direction';
  return 'Positive-EV direction: ' + result.bestSide;
}

export default function NextCardBetting({ onExit, onComplete }: NextCardBettingProps) {
  const [phase, setPhase] = useState<'ready' | 'betting' | 'revealed' | 'finished'>('ready');
  const [suitCount, setSuitCount] = useState(4);
  const [aceHigh, setAceHigh] = useState(true);
  const [roundCount, setRoundCount] = useState(DEFAULT_CARD_ROUNDS);
  const [deck, setDeck] = useState<ReturnType<typeof createCardDeck>>([]);
  const [roundIndex, setRoundIndex] = useState(0);
  const [selectedSide, setSelectedSide] = useState<BetSide | null>(null);
  const [stakeInput, setStakeInput] = useState('0');
  const [bankroll, setBankroll] = useState(INITIAL_CARD_BANKROLL);
  const [remainingMs, setRemainingMs] = useState(CARD_BET_SECONDS * 1000);
  const [history, setHistory] = useState<CardBetResolution[]>([]);
  const [error, setError] = useState('');
  const startedAtRef = useRef(0);
  const deadlineRef = useRef(0);
  const roundStartedAtRef = useRef(0);
  const roundResolvedRef = useRef(false);
  const completionSavedRef = useRef(false);
  const rngRef = useRef<SeededRandom>(new SeededRandom(createSessionSeed()));
  const stakeRef = useRef<HTMLInputElement>(null);

  const reference = deck[roundIndex] ?? null;
  const actualNext = deck[roundIndex + 1] ?? null;
  const unseenCards = reference ? deck.slice(roundIndex + 1) : [];
  const probabilities = reference ? calculateCardProbabilities(reference, unseenCards) : null;
  const selectedOdds = probabilities && selectedSide ? getSideProbabilities(probabilities, selectedSide) : null;
  const bestSide = probabilities ? getRecommendedSide(probabilities) : null;
  const recommendedStake = selectedOdds ? getHalfKellyStake(bankroll, selectedOdds.fullKellyFraction) : 0;
  const submittedRounds = history.length;
  const totalBets = history.filter((item) => item.outcome !== 'skipped').length;
  const wins = history.filter((item) => item.outcome === 'win').length;
  const progress = roundCount > 0 ? Math.min(100, submittedRounds / roundCount * 100) : 0;
  const availableRoundOptions = ROUND_OPTIONS.filter((option) => option <= suitCount * 13 - 1);

  const chooseSide = (side: BetSide) => {
    setSelectedSide(side);
    if (probabilities) {
      const odds = getSideProbabilities(probabilities, side);
      setStakeInput(String(getHalfKellyStake(bankroll, odds.fullKellyFraction)));
    }
    setError('');
  };

  const startSession = useCallback(() => {
    rngRef.current = new SeededRandom(createSessionSeed());
    const nextDeck = createCardDeck(rngRef.current, suitCount, aceHigh);
    const totalRounds = Math.min(roundCount, nextDeck.length - 1);
    const now = Date.now();
    const openingReference = nextDeck[0];
    const openingUnseen = nextDeck.slice(1);
    const openingProbabilities = openingReference ? calculateCardProbabilities(openingReference, openingUnseen) : null;
    const openingSide = openingProbabilities ? getRecommendedSide(openingProbabilities) : null;
    const openingStake = openingSide && openingProbabilities
      ? getHalfKellyStake(INITIAL_CARD_BANKROLL, getSideProbabilities(openingProbabilities, openingSide).fullKellyFraction)
      : 0;
    setDeck(nextDeck);
    setRoundCount(totalRounds);
    setRoundIndex(0);
    setSelectedSide(openingSide);
    setStakeInput(String(openingStake));
    setBankroll(INITIAL_CARD_BANKROLL);
    setHistory([]);
    setError('');
    setRemainingMs(CARD_BET_SECONDS * 1000);
    startedAtRef.current = now;
    roundStartedAtRef.current = now;
    deadlineRef.current = now + CARD_BET_SECONDS * 1000;
    roundResolvedRef.current = false;
    completionSavedRef.current = false;
    setPhase('betting');
  }, [aceHigh, roundCount, suitCount]);

  const resolveRound = useCallback((side: BetSide | null, stake: number) => {
    if (phase !== 'betting' || !reference || !actualNext || roundResolvedRef.current) return;
    if (!Number.isFinite(stake) || stake < 0 || stake > bankroll) {
      setError('Your stake must be between 0 and your current bankroll.');
      return;
    }
    roundResolvedRef.current = true;
    const result = resolveCardBet({
      reference,
      nextCard: actualNext,
      unseenCards,
      side: stake === 0 ? null : side,
      stake,
      bankroll,
      elapsedMs: Math.min(CARD_BET_SECONDS * 1000, Math.max(0, Date.now() - roundStartedAtRef.current))
    });
    setHistory((items) => [...items, result]);
    setBankroll(result.bankrollAfter);
    setRemainingMs(0);
    setError('');
    setPhase('revealed');
  }, [actualNext, bankroll, phase, reference, unseenCards]);

  const submitBet = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const stake = Number(stakeInput);
    if (stakeInput.trim().length === 0 || !Number.isFinite(stake) || stake < 0) {
      setError('Enter a valid non-negative stake.');
      return;
    }
    if (stake > 0 && selectedSide === null) {
      setError('Choose higher or lower before staking.');
      return;
    }
    resolveRound(selectedSide, stake);
  };

  const nextRound = () => {
    if (roundIndex + 1 >= roundCount || bankroll <= 0) {
      setPhase('finished');
      return;
    }
    const nextIndex = roundIndex + 1;
    const nextReference = deck[nextIndex];
    const nextUnseen = deck.slice(nextIndex + 1);
    const nextProbabilities = nextReference ? calculateCardProbabilities(nextReference, nextUnseen) : null;
    const nextSide = nextProbabilities ? getRecommendedSide(nextProbabilities) : null;
    const nextStake = nextSide && nextProbabilities
      ? getHalfKellyStake(bankroll, getSideProbabilities(nextProbabilities, nextSide).fullKellyFraction)
      : 0;
    const now = Date.now();
    setRoundIndex(nextIndex);
    setSelectedSide(nextSide);
    setStakeInput(String(nextStake));
    setError('');
    setRemainingMs(CARD_BET_SECONDS * 1000);
    roundStartedAtRef.current = now;
    deadlineRef.current = now + CARD_BET_SECONDS * 1000;
    roundResolvedRef.current = false;
    setPhase('betting');
  };

  useEffect(() => {
    if (phase !== 'betting') return;
    const timer = window.setInterval(() => {
      const msLeft = Math.max(0, deadlineRef.current - Date.now());
      setRemainingMs(msLeft);
      if (msLeft <= 0 && !roundResolvedRef.current) resolveRound(null, 0);
    }, 80);
    return () => window.clearInterval(timer);
  }, [phase, resolveRound]);

  useEffect(() => {
    if (phase === 'betting') window.requestAnimationFrame(() => stakeRef.current?.focus());
  }, [phase, roundIndex]);

  useEffect(() => {
    if (phase !== 'finished' || completionSavedRef.current) return;
    completionSavedRef.current = true;
    onComplete(summarizeCardSession(history, { suitCount, aceHigh, initialBankroll: INITIAL_CARD_BANKROLL }, (Date.now() - startedAtRef.current) / 1000));
  }, [aceHigh, history, onComplete, phase, suitCount]);

  const currentResult = history[history.length - 1] ?? null;
  const netPnl = bankroll - INITIAL_CARD_BANKROLL;

  return (
    <section className="game-shell next-card-shell" aria-label="Next Card Betting">
      <div className="game-topline">
        <button className="text-button" onClick={onExit} type="button"><span aria-hidden="true">←</span> All games</button>
        <div className="game-breadcrumb">PROBABILITY <span>/</span> NEXT CARD BETTING</div>
      </div>

      {phase === 'ready' && (
        <div className="setup-panel next-card-setup">
          <div className="eyebrow">PRACTICE MODULE 05</div>
          <h1>Next Card Betting</h1>
          <p className="setup-copy">Price the unseen cards, identify a positive edge, then size your bet with discipline. Ties return the stake; the deck is not replaced during a session.</p>
          <div className="setup-controls">
            <label className="field-label" htmlFor="card-suits">Number of suits
              <select id="card-suits" value={suitCount} onChange={(event) => {
                const nextSuits = Number(event.target.value);
                setSuitCount(nextSuits);
                const supported = ROUND_OPTIONS.filter((option) => option <= nextSuits * 13 - 1);
                if (roundCount > nextSuits * 13 - 1) setRoundCount(supported[supported.length - 1] ?? 5);
              }}>
                <option value={1}>1 suit · 13 cards</option>
                <option value={2}>2 suits · 26 cards</option>
                <option value={3}>3 suits · 39 cards</option>
                <option value={4}>4 suits · 52 cards</option>
              </select>
            </label>
            <label className="field-label" htmlFor="card-ace">Ace value
              <select id="card-ace" value={aceHigh ? 'high' : 'low'} onChange={(event) => setAceHigh(event.target.value === 'high')}>
                <option value="high">High · above King</option>
                <option value="low">Low · below 2</option>
              </select>
            </label>
            <label className="field-label" htmlFor="card-rounds">Rounds
              <select id="card-rounds" value={roundCount} onChange={(event) => setRoundCount(Number(event.target.value))}>
                {availableRoundOptions.map((option) => <option key={option} value={option}>{option} rounds</option>)}
              </select>
            </label>
          </div>
          <div className="next-card-concepts">
            <div><strong>Exact odds</strong><span>Count the unseen cards after the reference card.</span></div>
            <div><strong>Kelly sizing</strong><span>Compare your stake with a half-Kelly starting point.</span></div>
            <div><strong>Bankroll discipline</strong><span>Wins add the stake, losses remove it, ties push.</span></div>
          </div>
          <div className="fermi-method-note next-card-note">
            <strong>How the review works</strong>
            <p>Decision quality is recorded as whether a placed bet had positive expected value. Sizing efficiency compares the stake with half Kelly for that selected direction. These are local training metrics; the exact platform leaderboard score is not public. A fresh randomized deck is used for each session, and probabilities condition on cards already revealed.</p>
          </div>
          <button className="primary-button large-button" type="button" onClick={startSession}>Deal cards <span aria-hidden="true">↗</span></button>
          <p className="muted-note">Starting bankroll {INITIAL_CARD_BANKROLL} · {CARD_BET_SECONDS} seconds per decision · new deck each session</p>
        </div>
      )}

      {phase === 'betting' && reference && probabilities && (
        <div className="next-card-active">
          <div className="session-metrics">
            <div className={'timer-block' + (remainingMs <= 3000 ? ' timer-warning' : '')}><span className="metric-label">TIME LEFT</span><strong>{clock(remainingMs)}</strong></div>
            <div className="metric-block"><span className="metric-label">BANKROLL</span><strong>{bankroll.toLocaleString('en-US')}</strong></div>
            <div className="metric-block"><span className="metric-label">NET P&amp;L</span><strong className={netPnl >= 0 ? 'value-positive' : 'value-negative'}>{signed(netPnl)}</strong></div>
            <div className="metric-block"><span className="metric-label">ROUND</span><strong>{roundIndex + 1} / {roundCount}</strong></div>
          </div>
          <div className="fermi-progress"><span style={{ width: progress + '%' }} /></div>
          <div className="next-card-table">
            <div className="next-card-table-heading"><span className="eyebrow">REFERENCE CARD</span><span className="mode-chip">{suitCount} {suitCount === 1 ? 'SUIT' : 'SUITS'} · ACE {aceHigh ? 'HIGH' : 'LOW'}</span></div>
            <div className="next-card-reference"><CardTile card={reference} /></div>
            <div className="next-card-odds">
              <div className="next-card-odds-item"><span>HIGHER</span><strong>{formatCardProbability(probabilities.higher)}</strong></div>
              <div className="next-card-odds-item"><span>LOWER</span><strong>{formatCardProbability(probabilities.lower)}</strong></div>
              <div className="next-card-odds-item"><span>TIE / PUSH</span><strong>{formatCardProbability(probabilities.tie)}</strong></div>
            </div>
            <div className={'next-card-edge ' + (bestSide ? 'has-edge' : '')}>
              {bestSide ? 'Positive-EV side: ' + bestSide.toUpperCase() : 'Neither side has a positive edge at current probabilities'}
            </div>
          </div>

          <div className="question-card next-card-betting-card">
            <div className="eyebrow">MAKE YOUR DECISION</div>
            <div className="next-card-side-selector">
              <button type="button" className={'next-card-side-button ' + (selectedSide === 'higher' ? 'side-selected' : '')} onClick={() => chooseSide('higher')}>
                <span>HIGHER</span><strong>{formatCardProbability(probabilities.higher)}</strong><small>{probabilities.higher > probabilities.lower ? 'Higher probability' : 'Win if next card is higher'}</small>
              </button>
              <button type="button" className={'next-card-side-button ' + (selectedSide === 'lower' ? 'side-selected' : '')} onClick={() => chooseSide('lower')}>
                <span>LOWER</span><strong>{formatCardProbability(probabilities.lower)}</strong><small>{probabilities.lower > probabilities.higher ? 'Higher probability' : 'Win if next card is lower'}</small>
              </button>
            </div>
            <form className="next-card-bet-form" onSubmit={submitBet}>
              <label className="field-label" htmlFor="next-card-stake">Stake
                <input ref={stakeRef} id="next-card-stake" value={stakeInput} onChange={(event) => setStakeInput(event.target.value)} type="number" min="0" max={bankroll} step="1" inputMode="numeric" />
              </label>
              <div className="next-card-sizing"><span>½ KELLY GUIDE</span><strong>{recommendedStake.toLocaleString('en-US')}</strong><small>{selectedOdds ? (selectedOdds.fullKellyFraction * 50).toFixed(1) + '% of bankroll' : 'Select a side'}</small><button type="button" onClick={() => setStakeInput(String(recommendedStake))}>Use guide</button></div>
              <div className="next-card-ev">
                <span>Expected P&amp;L per unit</span>
                <strong className={selectedOdds && selectedOdds.expectedValuePerUnit > 0 ? 'value-positive' : 'value-negative'}>{selectedOdds ? signed(selectedOdds.expectedValuePerUnit) : '—'}</strong>
              </div>
              <button className="primary-button large-button" type="submit">Lock bet <span aria-hidden="true">↵</span></button>
            </form>
            {error && <div className="fermi-error" role="alert">{error}</div>}
            <div className="next-card-skip"><span>Skip when neither side offers a positive edge.</span><button className="text-button" type="button" onClick={() => resolveRound(null, 0)}>Skip this round →</button></div>
          </div>
        </div>
      )}

      {phase === 'revealed' && currentResult && (
        <div className="next-card-reveal">
          <div className="eyebrow">ROUND {String(roundIndex + 1).padStart(2, '0')} SETTLED</div>
          <h1>{currentResult.outcome === 'win' ? 'Good call' : currentResult.outcome === 'loss' ? 'Wrong direction' : currentResult.outcome === 'push' ? 'Tie · stake returned' : 'Round skipped'}</h1>
          <p className="setup-copy">The reference and next card determine the outcome. Use the pre-round odds to judge the decision, not only the realized result.</p>
          <div className="next-card-reveal-pair"><div><span>REFERENCE</span><CardTile card={currentResult.reference} small /></div><span className="next-card-reveal-arrow">→</span><div><span>NEXT CARD</span><CardTile card={currentResult.nextCard} small /></div></div>
          <div className="mmm-reveal-grid next-card-reveal-metrics">
            <div><span>DECISION</span><strong>{currentResult.side ? currentResult.side.toUpperCase() : 'SKIP'}</strong></div>
            <div><span>STAKE</span><strong>{currentResult.stake.toLocaleString('en-US')}</strong></div>
            <div><span>ROUND P&amp;L</span><strong className={currentResult.pnl < 0 ? 'value-negative' : 'value-positive'}>{signed(currentResult.pnl)}</strong></div>
            <div><span>BANKROLL</span><strong>{currentResult.bankrollAfter.toLocaleString('en-US')}</strong></div>
          </div>
          <div className="next-card-review-callout">
            <strong>{describeCardOutcome(currentResult.outcome)}</strong>
            <span>{recommendationText(currentResult)}</span>
            <div className="next-card-review-probs"><span>Higher {formatCardProbability(currentResult.probabilities.higher)}</span><span>Lower {formatCardProbability(currentResult.probabilities.lower)}</span><span>Tie {formatCardProbability(currentResult.probabilities.tie)}</span></div>
            {currentResult.side && <p>{currentResult.decisionWasPositiveEv ? 'Your selected side had positive expected value before the card was revealed.' : 'This side did not have positive expected value before the card was revealed.'} {currentResult.sizingEfficiency === null ? '' : 'Sizing efficiency vs half Kelly: ' + Math.round(currentResult.sizingEfficiency * 100) + '%.'}</p>}
          </div>
          <div className="fermi-reveal-footer"><span>{currentResult.probabilities.unseenCards} cards were available to be drawn at this decision.</span><button className="primary-button" type="button" onClick={nextRound}>{roundIndex + 1 >= roundCount || bankroll <= 0 ? 'See session review' : 'Next card'} <span aria-hidden="true">→</span></button></div>
        </div>
      )}

      {phase === 'finished' && (
        <div className="results-panel next-card-results">
          <div className="eyebrow">SESSION COMPLETE</div>
          <h1>Betting review</h1>
          <p className="setup-copy">Evaluate the quality of your bets against the information that was available before each draw. Winning a low-probability bet does not make it a good decision.</p>
          <div className="result-score"><span>FINAL BANKROLL</span><strong className={bankroll >= INITIAL_CARD_BANKROLL ? 'value-positive' : 'value-negative'}>{bankroll.toLocaleString('en-US')}</strong></div>
          <div className="result-grid next-card-result-grid">
            <div><span>Net P&amp;L</span><strong className={netPnl < 0 ? 'value-negative' : 'value-positive'}>{signed(netPnl)}</strong></div>
            <div><span>Bets placed</span><strong>{totalBets}</strong></div>
            <div><span>Wins / losses</span><strong>{wins} / {history.filter((item) => item.outcome === 'loss').length}</strong></div>
            <div><span>Positive-EV decisions</span><strong>{history.filter((item) => item.decisionWasPositiveEv).length} / {totalBets}</strong></div>
          </div>
          <div className="next-card-metrics-explainer">
            <div><span>Opportunity participation</span><strong>{history.some((item) => item.positiveEvOpportunity) ? Math.round(history.filter((item) => item.positiveEvOpportunity && item.decisionWasPositiveEv).length / history.filter((item) => item.positiveEvOpportunity).length * 100) + '%' : '—'}</strong></div>
            <div><span>Mean sizing efficiency</span><strong>{history.some((item) => item.sizingEfficiency !== null) ? Math.round(history.reduce((sum, item) => sum + (item.sizingEfficiency ?? 0), 0) / history.filter((item) => item.sizingEfficiency !== null).length * 100) + '%' : '—'}</strong></div>
          </div>
          <div className="review-section">
            <div className="section-heading"><h2>Decision history</h2><span>{history.length} rounds</span></div>
            <div className="review-list next-card-review-list">
              {[...history].reverse().map((item, index) => (
                <div className="review-row next-card-history-row" key={item.reference.id + '-' + index}>
                  <span className={'review-mark ' + (item.decisionWasPositiveEv ? 'correct-mark' : 'incorrect-mark')}>{item.decisionWasPositiveEv ? '✓' : '×'}</span>
                  <div className="review-question"><strong>{item.reference.rankLabel}{item.reference.suitSymbol} → {item.nextCard.rankLabel}{item.nextCard.suitSymbol}</strong><span>{item.side ? item.side.toUpperCase() : 'SKIP'} · stake {item.stake} · {formatCardProbability(item.probabilities.higher)} higher / {formatCardProbability(item.probabilities.lower)} lower</span></div>
                  <div className="review-answer"><span>{describeCardOutcome(item.outcome)}</span><strong className={item.pnl < 0 ? 'value-negative' : 'value-positive'}>{signed(item.pnl)}</strong></div>
                </div>
              ))}
            </div>
          </div>
          <div className="result-actions"><button className="primary-button large-button" type="button" onClick={() => setPhase('ready')}>Shuffle and play again <span aria-hidden="true">↗</span></button><button className="secondary-button large-button" type="button" onClick={onExit}>Back to games</button></div>
        </div>
      )}
    </section>
  );
}
