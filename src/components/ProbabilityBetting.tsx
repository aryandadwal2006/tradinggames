import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import {
  expectedValuePerUnit,
  formatDecimalOdds,
  formatProbability,
  generateProbabilityOffers,
  halfKellyStake,
  PROBABILITY_DEFAULT_ROUNDS,
  PROBABILITY_EVENT_COUNT,
  PROBABILITY_INITIAL_BANKROLL,
  PROBABILITY_ROUND_SECONDS,
  resolveProbabilityRound,
  summarizeProbabilitySession,
  type ProbabilityDecision,
  type ProbabilityOffer,
  type ProbabilityRoundResult,
  type ProbabilitySessionSummary,
  type ProbabilitySide
} from '../lib/probabilityBetting';
import { createSessionSeed, SeededRandom } from '../lib/rng';

interface ProbabilityBettingProps {
  onExit: () => void;
  onComplete: (summary: ProbabilitySessionSummary) => void;
}

const ROUND_OPTIONS = [3, 6, 9];

interface DraftDecision {
  side: ProbabilitySide;
  stake: string;
}

function clock(ms: number): string {
  const seconds = Math.max(0, Math.ceil(ms / 1000));
  return '00:' + String(seconds).padStart(2, '0');
}

function signed(value: number): string {
  return (value > 0 ? '+' : '') + value.toLocaleString('en-US', { maximumFractionDigits: 2 });
}

function eventOutcomeLabel(result: ProbabilityRoundResult['events'][number]): string {
  if (result.side === 'skip') return result.outcome ? 'Event occurred' : 'Event did not occur';
  if (result.won === true) return 'Bet won';
  if (result.won === false) return 'Bet lost';
  return 'No bet';
}


export default function ProbabilityBetting({ onExit, onComplete }: ProbabilityBettingProps) {
  const [phase, setPhase] = useState<'ready' | 'betting' | 'revealed' | 'finished'>('ready');
  const [roundCount, setRoundCount] = useState(PROBABILITY_DEFAULT_ROUNDS);
  const [offers, setOffers] = useState<ProbabilityOffer[]>([]);
  const [drafts, setDrafts] = useState<Record<string, DraftDecision>>({});
  const [roundIndex, setRoundIndex] = useState(0);
  const [history, setHistory] = useState<ProbabilityRoundResult[]>([]);
  const [bankroll, setBankroll] = useState(PROBABILITY_INITIAL_BANKROLL);
  const [remainingMs, setRemainingMs] = useState(PROBABILITY_ROUND_SECONDS * 1000);
  const [error, setError] = useState('');
  const [timeoutNote, setTimeoutNote] = useState('');
  const rngRef = useRef<SeededRandom>(new SeededRandom(createSessionSeed()));
  const startedAtRef = useRef(0);
  const deadlineRef = useRef(0);
  const roundStartedAtRef = useRef(0);
  const roundResolvedRef = useRef(false);
  const completionSavedRef = useRef(false);

  const currentResult = history[history.length - 1] ?? null;
  const currentRound = roundIndex + 1;
  const totalRisk = offers.reduce((sum, offer) => {
    const draft = drafts[offer.offerId];
    const stake = Number(draft?.stake ?? 0);
    return sum + (draft?.side && draft.side !== 'skip' && Number.isFinite(stake) && stake > 0 ? stake : 0);
  }, 0);
  const totalEvents = history.reduce((sum, round) => sum + round.events.length, 0);
  const totalBets = history.reduce((sum, round) => sum + round.events.filter((event) => event.side !== 'skip' && event.stake > 0).length, 0);
  const totalWins = history.reduce((sum, round) => sum + round.events.filter((event) => event.won === true).length, 0);
  const netPnl = bankroll - PROBABILITY_INITIAL_BANKROLL;
  const progress = Math.min(100, history.length / Math.max(roundCount, 1) * 100);

  const initDrafts = (nextOffers: ProbabilityOffer[]) => Object.fromEntries(
    nextOffers.map((offer) => [offer.offerId, { side: 'skip' as const, stake: '0' }])
  );

  const startSession = useCallback(() => {
    rngRef.current = new SeededRandom(createSessionSeed());
    const nextOffers = generateProbabilityOffers(rngRef.current, PROBABILITY_EVENT_COUNT);
    const now = Date.now();
    setOffers(nextOffers);
    setDrafts(initDrafts(nextOffers));
    setRoundIndex(0);
    setHistory([]);
    setBankroll(PROBABILITY_INITIAL_BANKROLL);
    setRemainingMs(PROBABILITY_ROUND_SECONDS * 1000);
    setError('');
    setTimeoutNote('');
    startedAtRef.current = now;
    roundStartedAtRef.current = now;
    deadlineRef.current = now + PROBABILITY_ROUND_SECONDS * 1000;
    roundResolvedRef.current = false;
    completionSavedRef.current = false;
    setPhase('betting');
  }, []);

  const chooseSide = (offer: ProbabilityOffer, side: ProbabilitySide) => {
    setDrafts((previous) => ({
      ...previous,
      [offer.offerId]: {
        side,
        stake: side === 'skip' ? '0' : (previous[offer.offerId]?.stake ?? '0')
      }
    }));
    setError('');
  };

  const changeStake = (offer: ProbabilityOffer, stake: string) => {
    setDrafts((previous) => ({
      ...previous,
      [offer.offerId]: {
        side: previous[offer.offerId]?.side ?? 'skip',
        stake
      }
    }));
    setError('');
  };

  const settleCurrentRound = useCallback((fromTimeout = false) => {
    if (phase !== 'betting' || roundResolvedRef.current || offers.length === 0) return;
    const decisions: ProbabilityDecision[] = offers.map((offer) => {
      const draft = drafts[offer.offerId] ?? { side: 'skip', stake: '0' };
      const amount = draft.side === 'skip' ? 0 : Number(draft.stake);
      return { offer, side: amount === 0 ? 'skip' : draft.side, stake: amount };
    });

    const stakeValid = decisions.every((decision) => Number.isInteger(decision.stake) && decision.stake >= 0);
    const totalStake = decisions.reduce((sum, decision) => sum + decision.stake, 0);
    if ((!stakeValid || totalStake > bankroll) && !fromTimeout) {
      setError(!stakeValid ? 'Each stake must be a whole number greater than or equal to zero.' : 'Combined stakes exceed your available bankroll.');
      return;
    }

    const finalDecisions = !stakeValid || totalStake > bankroll
      ? offers.map((offer): ProbabilityDecision => ({ offer, side: 'skip', stake: 0 }))
      : decisions;

    try {
      roundResolvedRef.current = true;
      const result = resolveProbabilityRound({
        roundNumber: roundIndex + 1,
        offers,
        decisions: finalDecisions,
        bankroll,
        rng: rngRef.current,
        elapsedMs: Math.min(PROBABILITY_ROUND_SECONDS * 1000, Math.max(0, Date.now() - roundStartedAtRef.current))
      });
      setHistory((items) => [...items, result]);
      setBankroll(result.bankrollAfter);
      setRemainingMs(0);
      setError('');
      setTimeoutNote(fromTimeout && finalDecisions.every((decision) => decision.side === 'skip') && decisions.some((decision) => decision.side !== 'skip')
        ? 'Time expired with an invalid or over-budget stake total. No bets were placed this round.'
        : fromTimeout ? 'Round time expired. Unselected offers were skipped.' : '');
      setPhase('revealed');
    } catch {
      roundResolvedRef.current = false;
      setError('These stakes could not be settled. Check the total risk and each whole-number stake.');
    }
  }, [bankroll, drafts, offers, phase, roundIndex]);

  const submitRound = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    settleCurrentRound(false);
  };

  const nextRound = () => {
    if (roundIndex + 1 >= roundCount || bankroll <= 0) {
      setPhase('finished');
      return;
    }
    const nextOffers = generateProbabilityOffers(rngRef.current, PROBABILITY_EVENT_COUNT);
    const now = Date.now();
    setOffers(nextOffers);
    setDrafts(initDrafts(nextOffers));
    setRoundIndex((value) => value + 1);
    setRemainingMs(PROBABILITY_ROUND_SECONDS * 1000);
    setError('');
    setTimeoutNote('');
    roundStartedAtRef.current = now;
    deadlineRef.current = now + PROBABILITY_ROUND_SECONDS * 1000;
    roundResolvedRef.current = false;
    setPhase('betting');
  };

  useEffect(() => {
    if (phase !== 'betting') return;
    const timer = window.setInterval(() => {
      const left = Math.max(0, deadlineRef.current - Date.now());
      setRemainingMs(left);
      if (left <= 0 && !roundResolvedRef.current) settleCurrentRound(true);
    }, 100);
    return () => window.clearInterval(timer);
  }, [phase, settleCurrentRound]);

  useEffect(() => {
    if (phase !== 'finished' || completionSavedRef.current) return;
    completionSavedRef.current = true;
    onComplete(summarizeProbabilitySession(history, (Date.now() - startedAtRef.current) / 1000));
  }, [history, onComplete, phase]);

  return (
    <section className="game-shell probability-shell" aria-label="Probability Betting">
      <div className="game-topline">
        <button className="text-button" onClick={onExit} type="button"><span aria-hidden="true">←</span> All games</button>
        <div className="game-breadcrumb">PROBABILITY <span>/</span> PROBABILITY BETTING</div>
      </div>

      {phase === 'ready' && (
        <div className="setup-panel probability-setup">
          <div className="eyebrow">PRACTICE MODULE 03</div>
          <h1>Probability Betting</h1>
          <p className="setup-copy">Compare your probability with quoted decimal odds. Bet only when the price compensates for the risk, and keep total exposure within your bankroll.</p>
          <div className="setup-controls">
            <label className="field-label" htmlFor="probability-rounds">Number of rounds
              <select id="probability-rounds" value={roundCount} onChange={(event) => setRoundCount(Number(event.target.value))}>
                {ROUND_OPTIONS.map((value) => <option key={value} value={value}>{value} rounds</option>)}
              </select>
            </label>
            <div className="probability-setup-stat"><strong>{PROBABILITY_EVENT_COUNT}</strong><span>Independent offers per round</span></div>
          </div>
          <div className="probability-concept-grid">
            <div><strong>Fair probability</strong><span>Calculate the event's true chance from its mechanism.</span></div>
            <div><strong>Expected value</strong><span>EV per unit = probability × decimal odds − 1.</span></div>
            <div><strong>Stake sizing</strong><span>A half-Kelly guide is available in the review after a bet settles.</span></div>
          </div>
          <div className="fermi-method-note probability-method-note">
            <strong>What the market shows</strong>
            <p>Each offer is a randomized quote for YES and NO. You see the event and the offered payout odds, but not the underlying probability before committing. Events are sampled from explicit fair coin, dice, and standard-deck mechanisms. The quote distortion, session length, and local decision metrics are practice settings rather than a claim to reproduce unpublished platform scoring.</p>
          </div>
          <button className="primary-button large-button" type="button" onClick={startSession}>Open betting round <span aria-hidden="true">↗</span></button>
          <p className="muted-note">Starting bankroll {PROBABILITY_INITIAL_BANKROLL} · {PROBABILITY_ROUND_SECONDS} seconds per round · all offers settle together</p>
        </div>
      )}

      {phase === 'betting' && (
        <div className="probability-active">
          <div className="session-metrics">
            <div className={'timer-block' + (remainingMs <= 5000 ? ' timer-warning' : '')}><span className="metric-label">TIME LEFT</span><strong>{clock(remainingMs)}</strong></div>
            <div className="metric-block"><span className="metric-label">AVAILABLE BANKROLL</span><strong>{bankroll.toLocaleString('en-US')}</strong></div>
            <div className="metric-block"><span className="metric-label">RISK COMMITTED</span><strong className={totalRisk > bankroll ? 'value-negative' : ''}>{Number.isFinite(totalRisk) ? totalRisk.toLocaleString('en-US') : 'Invalid'}</strong></div>
            <div className="metric-block"><span className="metric-label">ROUND</span><strong>{roundIndex + 1} / {roundCount}</strong></div>
          </div>
          <div className="fermi-progress"><span style={{ width: progress + '%' }} /></div>
          <div className="probability-round-header"><div><div className="eyebrow">BETTING BOARD</div><h2>Select your prices</h2></div><span>{offers.length} offers · YES / NO / SKIP</span></div>
          <form onSubmit={submitRound}>
            <div className="probability-offers-grid">
              {offers.map((offer, index) => {
                const draft = drafts[offer.offerId] ?? { side: 'skip' as const, stake: '0' };
                return (
                  <article className="probability-offer-card" key={offer.offerId}>
                    <div className="probability-offer-top"><span className="probability-offer-index">{String(index + 1).padStart(2, '0')}</span><span className={'probability-category category-' + offer.category.toLowerCase()}>{offer.category}</span></div>
                    <h3>{offer.title}</h3>
                    <p>{offer.prompt}</p>
                    <div className="probability-odds-row">
                      <span>YES <strong>{formatDecimalOdds(offer.yesOdds)}</strong></span>
                      <span>NO <strong>{formatDecimalOdds(offer.noOdds)}</strong></span>
                    </div>
                    <div className="probability-choice-row" role="group" aria-label={'Decision for ' + offer.prompt}>
                      {(['yes', 'no', 'skip'] as const).map((side) => (
                        <button key={side} type="button" className={'probability-choice ' + (draft.side === side ? 'choice-active choice-' + side : '')} onClick={() => chooseSide(offer, side)}>{side.toUpperCase()}</button>
                      ))}
                    </div>
                    <label className="field-label probability-stake-label" htmlFor={'stake-' + offer.offerId}>Stake
                      <input id={'stake-' + offer.offerId} type="number" min="0" step="1" max={bankroll} value={draft.stake} disabled={draft.side === 'skip'} onChange={(event) => changeStake(offer, event.target.value)} inputMode="numeric" placeholder="0" />
                    </label>
                  </article>
                );
              })}
            </div>
            {error && <div className="fermi-error probability-form-error" role="alert">{error}</div>}
            <div className="probability-submit-bar">
              <div><span>TOTAL STAKE</span><strong className={totalRisk > bankroll ? 'value-negative' : ''}>{Number.isFinite(totalRisk) ? totalRisk.toLocaleString('en-US') : 'Invalid'} / {bankroll.toLocaleString('en-US')}</strong><small>All bets settle on this round's outcomes.</small></div>
              <button className="primary-button large-button" type="submit">Lock all decisions <span aria-hidden="true">↵</span></button>
            </div>
          </form>
        </div>
      )}

      {phase === 'revealed' && currentResult && (
        <div className="probability-reveal">
          <div className="eyebrow">ROUND {String(currentResult.roundNumber).padStart(2, '0')} SETTLED</div>
          <h1>Price the result, not the luck</h1>
          <p className="setup-copy">The underlying experiment is revealed. Compare your quote with fair odds and judge the decision using the information available before the event occurred.</p>
          {timeoutNote && <p className="probability-timeout-note" role="status">{timeoutNote}</p>}
          <div className="result-grid probability-round-stats">
            <div><span>Round P&amp;L</span><strong className={currentResult.pnl < 0 ? 'value-negative' : 'value-positive'}>{signed(currentResult.pnl)}</strong></div>
            <div><span>Staked</span><strong>{currentResult.totalStake.toLocaleString('en-US')}</strong></div>
            <div><span>Bankroll</span><strong>{currentResult.bankrollAfter.toLocaleString('en-US')}</strong></div>
            <div><span>Winning bets</span><strong>{currentResult.events.filter((event) => event.won === true).length}</strong></div>
          </div>
          <div className="review-section">
            <div className="section-heading"><h2>Offer-by-offer review</h2><span>{currentResult.events.length} events</span></div>
            <div className="probability-result-list">
              {currentResult.events.map((result) => (
                <article className="probability-result-card" key={result.offer.offerId}>
                  <div className="probability-result-top"><span className={'probability-outcome-dot ' + (result.outcome ? 'outcome-yes' : 'outcome-no')} /> <div><strong>{result.offer.title}</strong><p>{result.offer.prompt}</p></div><span className={'probability-event-label ' + (result.outcome ? 'event-occurred' : 'event-not-occurred')}>{result.outcome ? 'YES' : 'NO'}</span></div>
                  <div className="probability-result-details">
                    <div><span>Your decision</span><strong>{result.side.toUpperCase()} {result.stake > 0 ? '· ' + result.stake : ''}</strong></div>
                    <div><span>True probability</span><strong>{formatProbability(result.offer.probability)}</strong></div>
                    <div><span>Selected fair odds</span><strong>{result.fairOdds === null ? '—' : formatDecimalOdds(result.fairOdds)}</strong></div>
                    <div><span>Quoted odds</span><strong>{result.selectedOdds === null ? '—' : formatDecimalOdds(result.selectedOdds)}</strong></div>
                    <div><span>Expected value / unit</span><strong className={(result.expectedValuePerUnit ?? 0) > 0 ? 'value-positive' : (result.expectedValuePerUnit ?? 0) < 0 ? 'value-negative' : ''}>{result.expectedValuePerUnit === null ? '—' : signed(result.expectedValuePerUnit)}</strong></div>
                    <div><span>Half-Kelly stake guide</span><strong>{result.side === 'skip' ? '—' : result.halfKellyStake.toLocaleString('en-US')}</strong></div>
                    <div><span>Realized P&amp;L</span><strong className={result.pnl < 0 ? 'value-negative' : 'value-positive'}>{signed(result.pnl)}</strong></div>
                  </div>
                  <div className="probability-result-foot"><span>{eventOutcomeLabel(result)}</span><span>{result.side === 'skip' ? (result.positiveEvOpportunity ? 'Positive-EV opportunity missed' : 'No positive-EV price') : result.positiveEv ? 'Positive expected value' : 'Negative expected value'}</span>{result.sizingEfficiency !== null && <span>Half-Kelly sizing efficiency {Math.round(result.sizingEfficiency * 100)}%</span>}</div>
                </article>
              ))}
            </div>
          </div>
          <div className="fermi-reveal-footer"><span>Positive expected value is a decision property, independent of whether this particular outcome wins.</span><button className="primary-button" type="button" onClick={nextRound}>{currentResult.roundNumber >= roundCount || bankroll <= 0 ? 'See session review' : 'Next round'} <span aria-hidden="true">→</span></button></div>
        </div>
      )}

      {phase === 'finished' && (
        <div className="results-panel probability-results-panel">
          <div className="eyebrow">SESSION COMPLETE</div>
          <h1>Betting review</h1>
          <p className="setup-copy">Bankroll measures realized outcomes. Decision quality measures whether you selected positive expected value when it was available. Both matter, and they are not the same statistic.</p>
          <div className="result-score"><span>FINAL BANKROLL</span><strong className={bankroll >= PROBABILITY_INITIAL_BANKROLL ? 'value-positive' : 'value-negative'}>{bankroll.toLocaleString('en-US')}</strong></div>
          <div className="result-grid probability-final-grid">
            <div><span>Net P&amp;L</span><strong className={netPnl < 0 ? 'value-negative' : 'value-positive'}>{signed(netPnl)}</strong></div>
            <div><span>Bets placed</span><strong>{totalBets}</strong></div>
            <div><span>Winning bets</span><strong>{totalWins}</strong></div>
            <div><span>Offers reviewed</span><strong>{totalEvents}</strong></div>
          </div>
          <div className="probability-final-metrics">
            <div><span>Decision quality</span><strong>{totalEvents ? Math.round(history.flatMap((round) => round.events).filter((event) => event.decisionCorrect).length / totalEvents * 100) + '%' : '—'}</strong><small>Positive-EV bet, or correctly skip when no positive edge exists</small></div>
            <div><span>Opportunity participation</span><strong>{history.flatMap((round) => round.events).some((event) => event.positiveEvOpportunity) ? Math.round(history.flatMap((round) => round.events).filter((event) => event.positiveEvOpportunity && event.side !== 'skip' && event.positiveEv).length / history.flatMap((round) => round.events).filter((event) => event.positiveEvOpportunity).length * 100) + '%' : '—'}</strong><small>Share of positive-EV opportunities actually bet</small></div>
            <div><span>Mean sizing efficiency</span><strong>{history.flatMap((round) => round.events).some((event) => event.sizingEfficiency !== null) ? Math.round(history.flatMap((round) => round.events).reduce((sum, event) => sum + (event.sizingEfficiency ?? 0), 0) / history.flatMap((round) => round.events).filter((event) => event.sizingEfficiency !== null).length * 100) + '%' : '—'}</strong><small>Bet size versus half-Kelly for selected positive-EV bets</small></div>
          </div>
          <div className="review-section">
            <div className="section-heading"><h2>Round history</h2><span>{history.length} rounds</span></div>
            <div className="review-list probability-round-list">
              {[...history].reverse().map((round) => (
                <div className="review-row" key={round.roundNumber}>
                  <span className={'review-mark ' + (round.pnl >= 0 ? 'correct-mark' : 'incorrect-mark')}>{String(round.roundNumber).padStart(2, '0')}</span>
                  <div className="review-question"><strong>Round {round.roundNumber}</strong><span>{round.events.filter((event) => event.side !== 'skip' && event.stake > 0).length} bets · {round.events.filter((event) => event.positiveEvOpportunity).length} positive-EV opportunities</span></div>
                  <div className="review-answer"><span>Round P&amp;L</span><strong className={round.pnl < 0 ? 'value-negative' : 'value-positive'}>{signed(round.pnl)}</strong></div>
                </div>
              ))}
            </div>
          </div>
          <div className="result-actions"><button className="primary-button large-button" type="button" onClick={() => setPhase('ready')}>Open another board <span aria-hidden="true">↗</span></button><button className="secondary-button large-button" type="button" onClick={onExit}>Back to games</button></div>
        </div>
      )}
    </section>
  );
}
