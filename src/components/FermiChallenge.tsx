import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import {
  describeFactorError,
  evaluateFermiEstimate,
  FERMI_ROUND_SECONDS,
  FERMI_ROUNDS_PER_SESSION,
  formatFermiNumber,
  generateFermiSession,
  summarizeFermiSession,
  type FermiQuestion,
  type FermiRoundResult,
  type FermiSessionSummary
} from '../lib/fermiChallenge';
import { createSessionSeed, SeededRandom } from '../lib/rng';

interface FermiChallengeProps {
  onExit: () => void;
  onComplete: (summary: FermiSessionSummary) => void;
}

function formatClock(seconds: number): string {
  const safeSeconds = Math.max(0, Math.ceil(seconds));
  return '00:' + String(safeSeconds).padStart(2, '0');
}

function describeEstimate(result: FermiRoundResult): string {
  if (result.skipped || result.estimate === null || !result.evaluation) return 'Skipped';
  return describeFactorError(result.evaluation);
}

export default function FermiChallenge({ onExit, onComplete }: FermiChallengeProps) {
  const [phase, setPhase] = useState<'ready' | 'estimating' | 'revealed' | 'finished'>('ready');
  const [questions, setQuestions] = useState<FermiQuestion[]>([]);
  const [roundIndex, setRoundIndex] = useState(0);
  const [estimateInput, setEstimateInput] = useState('');
  const [remainingSeconds, setRemainingSeconds] = useState(FERMI_ROUND_SECONDS);
  const [history, setHistory] = useState<FermiRoundResult[]>([]);
  const [answerError, setAnswerError] = useState('');
  const rngRef = useRef<SeededRandom>(new SeededRandom(createSessionSeed()));
  const roundStartedAtRef = useRef(0);
  const roundDeadlineRef = useRef(0);
  const roundResolvedRef = useRef(false);
  const sessionStartedAtRef = useRef(0);
  const completionSavedRef = useRef(false);
  const estimateRef = useRef<HTMLInputElement>(null);

  const currentQuestion = questions[roundIndex] ?? null;
  const currentResult = history[history.length - 1] ?? null;

  const startSession = useCallback(() => {
    rngRef.current = new SeededRandom(createSessionSeed());
    setQuestions(generateFermiSession(rngRef.current));
    setRoundIndex(0);
    setEstimateInput('');
    setRemainingSeconds(FERMI_ROUND_SECONDS);
    setHistory([]);
    setAnswerError('');
    roundResolvedRef.current = false;
    completionSavedRef.current = false;
    sessionStartedAtRef.current = Date.now();
    roundStartedAtRef.current = Date.now();
    roundDeadlineRef.current = Date.now() + FERMI_ROUND_SECONDS * 1000;
    setPhase('estimating');
  }, []);

  const resolveRound = useCallback((rawEstimate: string | null) => {
    if (phase !== 'estimating' || !currentQuestion || roundResolvedRef.current) return;
    roundResolvedRef.current = true;
    const now = Date.now();
    const elapsedMs = Math.min(FERMI_ROUND_SECONDS * 1000, Math.max(0, now - roundStartedAtRef.current));

    if (rawEstimate === null) {
      setHistory((items) => [...items, {
        question: currentQuestion,
        estimate: null,
        skipped: true,
        elapsedMs,
        evaluation: null
      }]);
    } else {
      const parsed = Number(rawEstimate);
      if (!Number.isFinite(parsed) || parsed <= 0 || parsed > 1e100) {
        roundResolvedRef.current = false;
        setAnswerError('Enter a finite number greater than zero.');
        return;
      }
      const evaluation = evaluateFermiEstimate(currentQuestion.referenceAnswer, parsed);
      if (!evaluation) {
        roundResolvedRef.current = false;
        setAnswerError('That estimate cannot be evaluated. Try a positive number.');
        return;
      }
      setHistory((items) => [...items, {
        question: currentQuestion,
        estimate: parsed,
        skipped: false,
        elapsedMs,
        evaluation
      }]);
    }
    setAnswerError('');
    setEstimateInput('');
    setRemainingSeconds(0);
    setPhase('revealed');
  }, [currentQuestion, phase]);

  useEffect(() => {
    if (phase !== 'estimating' || !currentQuestion) return;
    const timer = window.setInterval(() => {
      const remainingMs = Math.max(0, roundDeadlineRef.current - Date.now());
      const seconds = remainingMs / 1000;
      setRemainingSeconds(seconds);
      if (remainingMs <= 0 && !roundResolvedRef.current) {
        resolveRound(null);
      }
    }, 100);
    return () => window.clearInterval(timer);
  }, [currentQuestion, phase, resolveRound]);

  useEffect(() => {
    if (phase !== 'estimating') return;
    window.requestAnimationFrame(() => estimateRef.current?.focus());
  }, [phase, roundIndex]);

  useEffect(() => {
    if (phase !== 'finished' || completionSavedRef.current) return;
    completionSavedRef.current = true;
    const activeSeconds = history.reduce((sum, result) => sum + result.elapsedMs, 0) / 1000;
    onComplete(summarizeFermiSession(history, activeSeconds));
  }, [history, onComplete, phase]);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!estimateInput.trim()) {
      setAnswerError('Enter an estimate, or skip the round.');
      return;
    }
    resolveRound(estimateInput);
  };

  const goNext = () => {
    if (roundIndex + 1 >= questions.length) {
      setPhase('finished');
      return;
    }
    setRoundIndex((index) => index + 1);
    setEstimateInput('');
    setAnswerError('');
    setRemainingSeconds(FERMI_ROUND_SECONDS);
    roundResolvedRef.current = false;
    roundStartedAtRef.current = Date.now();
    roundDeadlineRef.current = Date.now() + FERMI_ROUND_SECONDS * 1000;
    setPhase('estimating');
  };

  const submitted = history.filter((result) => !result.skipped && result.evaluation);
  const skipped = history.filter((result) => result.skipped).length;
  const medianFactor = submitted.length
    ? summarizeFermiSession(history, 0).medianFactorError
    : null;
  const geometricFactor = submitted.length
    ? summarizeFermiSession(history, 0).geometricMeanFactorError
    : null;
  const progress = phase === 'finished' ? 100 : phase === 'ready' ? 0 : ((roundIndex + (phase === 'revealed' ? 1 : 0)) / questions.length) * 100;
  const activeQuestionNumber = Math.min(roundIndex + 1, FERMI_ROUNDS_PER_SESSION);
  const finalStats = summarizeFermiSession(history, (Date.now() - sessionStartedAtRef.current) / 1000);

  return (
    <section className="game-shell fermi-shell" aria-label="Fermi Questions Challenge">
      <div className="game-topline">
        <button className="text-button" onClick={onExit} type="button"><span aria-hidden="true">←</span> All games</button>
        <div className="game-breadcrumb">ESTIMATION <span>/</span> CALIBRATION DRILL</div>
      </div>

      {phase === 'ready' && (
        <div className="setup-panel">
          <div className="eyebrow">PRACTICE MODULE 02</div>
          <h1>Fermi Questions</h1>
          <p className="setup-copy">Build an estimate from a small set of sensible assumptions. You have 25 seconds per round; the reference and reasoning appear after you commit.</p>
          <div className="fermi-intro-grid">
            <div><strong>12</strong><span>Estimates per session</span></div>
            <div><strong>25s</strong><span>Per estimate</span></div>
            <div><strong>×</strong><span>Multiplicative error</span></div>
          </div>
          <div className="fermi-method-note">
            <strong>How calibration is measured</strong>
            <p>We compare your estimate with a rounded reference using a symmetric factor error. An estimate twice as high and one half as high both count as a 2× error. The reference values are approximate practice anchors. The complete point curve of the original game is not published, so this drill uses error factors rather than claiming to reproduce its points.</p>
          </div>
          <button className="primary-button large-button" type="button" onClick={startSession}>Start estimation drill <span aria-hidden="true">↗</span></button>
          <p className="muted-note">Fresh round order each session · No account required</p>
        </div>
      )}

      {phase === 'estimating' && currentQuestion && (
        <div className="fermi-active">
          <div className="session-metrics">
            <div className={'timer-block' + (remainingSeconds <= 5 ? ' timer-warning' : '')}>
              <span className="metric-label">TIME LEFT</span>
              <strong>{formatClock(remainingSeconds)}</strong>
            </div>
            <div className="metric-block"><span className="metric-label">ROUND</span><strong>{roundIndex + 1} / {questions.length}</strong></div>
            <div className="metric-block"><span className="metric-label">SUBMITTED</span><strong>{submitted.length}</strong></div>
            <div className="metric-block"><span className="metric-label">SKIPPED</span><strong>{skipped}</strong></div>
          </div>
          <div className="fermi-progress"><span style={{ width: progress + '%' }} /></div>
          <div className="question-card fermi-question-card">
            <div className="question-heading">
              <span className="eyebrow">ESTIMATION {activeQuestionNumber.toString().padStart(2, '0')}</span>
              <span className="mode-chip">ORDER OF MAGNITUDE</span>
            </div>
            <h2>{currentQuestion.title}</h2>
            <p className="fermi-prompt">{currentQuestion.prompt}</p>
            <form className="answer-form fermi-answer-form" onSubmit={handleSubmit}>
              <label className="sr-only" htmlFor="fermi-estimate">Your estimate</label>
              <input ref={estimateRef} id="fermi-estimate" value={estimateInput} onChange={(event) => setEstimateInput(event.target.value)} inputMode="decimal" autoComplete="off" placeholder="Enter a number (e.g. 250000)" aria-describedby="fermi-input-hint" />
              <button className="primary-button" type="submit">Lock estimate <span aria-hidden="true">↵</span></button>
            </form>
            <div id="fermi-input-hint" className="answer-hint">A positive number only. Use scientific notation for very large quantities, e.g. 1.7e21.</div>
            {answerError && <div className="fermi-error" role="alert">{answerError}</div>}
            <div className="fermi-actions"><button className="text-button" type="button" onClick={() => resolveRound(null)}>Skip this estimate <span aria-hidden="true">→</span></button><span>Reference revealed after submission</span></div>
          </div>
        </div>
      )}

      {phase === 'revealed' && currentQuestion && currentResult && (
        <div className="fermi-reveal">
          <div className="session-metrics">
            <div className="metric-block"><span className="metric-label">ROUND</span><strong>{roundIndex + 1} / {questions.length}</strong></div>
            <div className="metric-block"><span className="metric-label">YOUR ESTIMATE</span><strong>{currentResult.estimate === null ? 'Skipped' : formatFermiNumber(currentResult.estimate)}</strong></div>
            <div className="metric-block"><span className="metric-label">REFERENCE</span><strong>{formatFermiNumber(currentQuestion.referenceAnswer)}</strong></div>
            <div className="metric-block"><span className="metric-label">FACTOR ERROR</span><strong>{currentResult.evaluation ? formatFermiNumber(currentResult.evaluation.factorError) + '×' : '—'}</strong></div>
          </div>
          <div className="question-card fermi-explanation-card">
            <div className="eyebrow">REFERENCE BREAKDOWN</div>
            <h2>{currentQuestion.title}</h2>
            <p className="fermi-explanation">{currentQuestion.explanation}</p>
            <div className="fermi-decomposition"><span>ONE WAY TO DECOMPOSE IT</span><p>{currentQuestion.decomposition}</p></div>
            <div className={'fermi-result-callout' + (currentResult.skipped ? ' fermi-result-skipped' : '')}>
              <span>{currentResult.skipped ? 'No estimate submitted' : describeEstimate(currentResult)}</span>
              <small>Reference answer: {formatFermiNumber(currentQuestion.referenceAnswer)} {currentQuestion.unit}</small>
            </div>
            <div className="fermi-reveal-footer"><span>Reference values are approximate, not exact ground truth for variable real-world quantities.</span><button className="primary-button" type="button" onClick={goNext}>{roundIndex + 1 >= questions.length ? 'See results' : 'Next question'} <span aria-hidden="true">→</span></button></div>
          </div>
        </div>
      )}

      {phase === 'finished' && (
        <div className="results-panel fermi-results-panel">
          <div className="eyebrow">DRILL COMPLETE</div>
          <h1>Estimation review</h1>
          <p className="setup-copy">A smaller multiplicative error means a closer estimate. The reference set includes rounded anchors, so use the results to calibrate orders of magnitude rather than to memorise exact facts.</p>
          <div className="result-grid fermi-result-grid">
            <div><span>Submitted</span><strong>{finalStats.submitted}</strong></div>
            <div><span>Skipped</span><strong>{finalStats.skipped}</strong></div>
            <div><span>Median factor error</span><strong>{medianFactor === null ? '—' : formatFermiNumber(medianFactor) + '×'}</strong></div>
            <div><span>Geometric mean error</span><strong>{geometricFactor === null ? '—' : formatFermiNumber(geometricFactor) + '×'}</strong></div>
          </div>
          <div className="review-section">
            <div className="section-heading"><h2>Round-by-round review</h2><span>{history.length} rounds</span></div>
            <div className="review-list fermi-review-list">
              {history.map((result, index) => (
                <div className="review-row fermi-review-row" key={result.question.id}>
                  <span className={'review-mark ' + (result.skipped ? 'incorrect-mark' : 'correct-mark')}>{String(index + 1).padStart(2, '0')}</span>
                  <div className="review-question"><strong>{result.question.prompt}</strong><span>{result.estimate === null ? 'Skipped' : 'Your estimate: ' + formatFermiNumber(result.estimate) + ' ' + result.question.unit}</span></div>
                  <div className="review-answer"><span>{result.evaluation ? describeEstimate(result) : 'Reference'}</span><strong>{formatFermiNumber(result.question.referenceAnswer)}</strong></div>
                </div>
              ))}
            </div>
          </div>
          <div className="result-actions">
            <button className="primary-button large-button" type="button" onClick={() => setPhase('ready')}>Run another drill <span aria-hidden="true">↗</span></button>
            <button className="secondary-button large-button" type="button" onClick={onExit}>Back to games</button>
          </div>
        </div>
      )}
    </section>
  );
}
