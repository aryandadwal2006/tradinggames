import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import {
  generateMathQuestion,
  isAnswerCorrect,
  MATH_MODES,
  pointsForAnswer,
  STANDARD_DURATION_SECONDS,
  type MathMode,
  type MathQuestion,
  type MathSessionSummary
} from '../lib/mathChallenge';
import { createSessionSeed, SeededRandom } from '../lib/rng';

interface MathChallengeProps {
  onExit: () => void;
  onComplete: (summary: MathSessionSummary) => void;
}

interface ReviewItem {
  question: MathQuestion;
  submitted: string;
  correct: boolean;
}

const DURATIONS = [
  { value: 120, label: '2 minutes' },
  { value: STANDARD_DURATION_SECONDS, label: '6 minutes · standard' },
  { value: 600, label: '10 minutes' }
];

function formatTime(milliseconds: number): string {
  const seconds = Math.ceil(milliseconds / 1000);
  const minutesPart = Math.floor(seconds / 60).toString().padStart(2, '0');
  const secondsPart = (seconds % 60).toString().padStart(2, '0');
  return minutesPart + ':' + secondsPart;
}

export default function MathChallenge({ onExit, onComplete }: MathChallengeProps) {
  const [mode, setMode] = useState<MathMode>('full');
  const [durationSeconds, setDurationSeconds] = useState(STANDARD_DURATION_SECONDS);
  const [status, setStatus] = useState<'ready' | 'running' | 'finished'>('ready');
  const [remainingMs, setRemainingMs] = useState(STANDARD_DURATION_SECONDS * 1000);
  const [question, setQuestion] = useState<MathQuestion | null>(null);
  const [answer, setAnswer] = useState('');
  const [score, setScore] = useState(0);
  const [correctCount, setCorrectCount] = useState(0);
  const [incorrectCount, setIncorrectCount] = useState(0);
  const [answeredCount, setAnsweredCount] = useState(0);
  const [history, setHistory] = useState<ReviewItem[]>([]);
  const [feedback, setFeedback] = useState<ReviewItem | null>(null);
  const rngRef = useRef<SeededRandom>(new SeededRandom(createSessionSeed()));
  const deadlineRef = useRef(0);
  const answeredRef = useRef(0);
  const completionSavedRef = useRef(false);
  const answerInputRef = useRef<HTMLInputElement>(null);

  const startSession = useCallback(() => {
    rngRef.current = new SeededRandom(createSessionSeed());
    answeredRef.current = 0;
    completionSavedRef.current = false;
    setQuestion(generateMathQuestion(rngRef.current, mode, 1));
    setAnswer('');
    setScore(0);
    setCorrectCount(0);
    setIncorrectCount(0);
    setAnsweredCount(0);
    setHistory([]);
    setFeedback(null);
    setRemainingMs(durationSeconds * 1000);
    deadlineRef.current = Date.now() + durationSeconds * 1000;
    setStatus('running');
  }, [durationSeconds, mode]);

  const submitAnswer = useCallback((rawAnswer: string) => {
    if (status !== 'running' || !question) return;
    if (Date.now() >= deadlineRef.current) {
      setRemainingMs(0);
      setStatus('finished');
      return;
    }
    const trimmed = rawAnswer.trim();
    if (trimmed.length === 0) return;

    const isCorrect = isAnswerCorrect(question, trimmed);
    const item: ReviewItem = { question, submitted: trimmed, correct: isCorrect };
    setScore((value) => value + pointsForAnswer(isCorrect));
    if (isCorrect) setCorrectCount((value) => value + 1);
    else setIncorrectCount((value) => value + 1);
    setHistory((items) => [...items, item]);
    setFeedback(item);
    answeredRef.current += 1;
    setAnsweredCount(answeredRef.current);
    setQuestion(generateMathQuestion(rngRef.current, mode, answeredRef.current + 1));
    setAnswer('');
    window.requestAnimationFrame(() => answerInputRef.current?.focus());
  }, [mode, question, status]);

  const handleFormSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    submitAnswer(answer);
  };

  useEffect(() => {
    if (status !== 'running') return;
    const timer = window.setInterval(() => {
      const millisecondsLeft = Math.max(0, deadlineRef.current - Date.now());
      setRemainingMs(millisecondsLeft);
      if (millisecondsLeft <= 0) setStatus('finished');
    }, 100);
    return () => window.clearInterval(timer);
  }, [status]);

  useEffect(() => {
    if (status !== 'finished' || completionSavedRef.current) return;
    completionSavedRef.current = true;
    setRemainingMs(0);
    onComplete({
      score,
      correct: correctCount,
      incorrect: incorrectCount,
      mode,
      durationSeconds,
      playedAt: new Date().toISOString()
    });
  }, [correctCount, durationSeconds, incorrectCount, mode, onComplete, score, status]);

  const totalAnswered = correctCount + incorrectCount;
  const accuracy = totalAnswered === 0 ? 0 : Math.round((correctCount / totalAnswered) * 100);
  const timerWarning = remainingMs <= 30000 && status === 'running';

  return (
    <section className="game-shell" aria-label="Math Challenge">
      <div className="game-topline">
        <button className="text-button" onClick={onExit} type="button">
          <span aria-hidden="true">←</span> All games
        </button>
        <div className="game-breadcrumb">MENTAL MATH <span>/</span> TIMED DRILL</div>
      </div>

      {status === 'ready' && (
        <div className="setup-panel">
          <div className="eyebrow">PRACTICE MODULE 09</div>
          <h1>Math Challenge</h1>
          <p className="setup-copy">Build speed without sacrificing accuracy. Every correct answer adds one point; every incorrect answer subtracts one.</p>
          <div className="setup-controls">
            <label className="field-label" htmlFor="math-mode">Question set
              <select id="math-mode" value={mode} onChange={(event) => setMode(event.target.value as MathMode)}>
                {MATH_MODES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
              </select>
            </label>
            <label className="field-label" htmlFor="math-duration">Session length
              <select id="math-duration" value={durationSeconds} onChange={(event) => setDurationSeconds(Number(event.target.value))}>
                {DURATIONS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
              </select>
            </label>
          </div>
          <div className="rules-strip">
            <div><strong>+1</strong><span>Correct answer</span></div>
            <div><strong>−1</strong><span>Incorrect answer</span></div>
            <div><strong>∞</strong><span>Questions until time</span></div>
          </div>
          <button className="primary-button large-button" type="button" onClick={startSession}>Start session <span aria-hidden="true">↗</span></button>
          <p className="muted-note">Generated questions · Results saved in this browser</p>
        </div>
      )}

      {status === 'running' && question && (
        <div className="active-session">
          <div className="session-metrics">
            <div className={'timer-block' + (timerWarning ? ' timer-warning' : '')}>
              <span className="metric-label">TIME REMAINING</span>
              <strong aria-live="off">{formatTime(remainingMs)}</strong>
            </div>
            <div className="metric-block"><span className="metric-label">NET SCORE</span><strong>{score > 0 ? '+' : ''}{score}</strong></div>
            <div className="metric-block"><span className="metric-label">ACCURACY</span><strong>{accuracy}%</strong></div>
            <div className="metric-block"><span className="metric-label">ANSWERED</span><strong>{totalAnswered}</strong></div>
          </div>

          <div className="question-card">
            <div className="question-heading">
              <span className="eyebrow">QUESTION {answeredCount + 1}</span>
              <span className="mode-chip">{question.mode}</span>
            </div>
            <div className="question-prompt" aria-live="polite">{question.prompt}</div>
            <form className="answer-form" onSubmit={handleFormSubmit}>
              <label className="sr-only" htmlFor="math-answer">Your answer</label>
              <input
                ref={answerInputRef}
                id="math-answer"
                value={answer}
                onChange={(event) => setAnswer(event.target.value)}
                autoComplete="off"
                autoCorrect="off"
                inputMode="decimal"
                placeholder={question.mode === 'fractions' ? 'Answer, e.g. 3/4' : 'Type your answer'}
                aria-describedby="answer-hint"
              />
              <button className="primary-button" type="submit" disabled={answer.trim().length === 0}>Submit <span aria-hidden="true">↵</span></button>
            </form>
            <div id="answer-hint" className="answer-hint">Press Enter to submit. Fractions can be entered as a/b.</div>
            <div className="choice-grid">
              {question.choices.map((choice) => (
                <button key={choice.id} className="choice-button" type="button" onClick={() => submitAnswer(choice.value)}>{choice.value}</button>
              ))}
            </div>
            {feedback && (
              <div className={'feedback-line ' + (feedback.correct ? 'feedback-correct' : 'feedback-incorrect')} role="status">
                <span>{feedback.correct ? 'Correct · +1' : 'Incorrect · −1'}</span>
                {!feedback.correct && <span>Answer: {feedback.question.answerDisplay}</span>}
              </div>
            )}
          </div>
          <div className="session-footer">
            <span>Keep the calculation tight. Skip guesses only when the expected score favours it.</span>
            <button className="text-button" type="button" onClick={() => setStatus('finished')}>End session</button>
          </div>
        </div>
      )}

      {status === 'finished' && (
        <div className="results-panel">
          <div className="eyebrow">SESSION COMPLETE</div>
          <h1>{score > 0 ? 'Positive session' : score === 0 ? 'Even session' : 'Room to improve'}</h1>
          <p className="setup-copy">Review the misses, then run the drill again. Net score is correct answers minus incorrect answers.</p>
          <div className="result-score"><span>NET SCORE</span><strong>{score > 0 ? '+' : ''}{score}</strong></div>
          <div className="result-grid">
            <div><span>Correct</span><strong>{correctCount}</strong></div>
            <div><span>Incorrect</span><strong>{incorrectCount}</strong></div>
            <div><span>Accuracy</span><strong>{accuracy}%</strong></div>
            <div><span>Questions / min</span><strong>{Math.round(totalAnswered / (durationSeconds / 60) * 10) / 10}</strong></div>
          </div>
          <div className="review-section">
            <div className="section-heading"><h2>Answer review</h2><span>{history.length} answered</span></div>
            {history.length === 0 ? <p className="muted-note">No answers submitted in this session.</p> : (
              <div className="review-list">
                {[...history].reverse().map((item, index) => (
                  <div className="review-row" key={item.question.id}>
                    <span className={'review-mark ' + (item.correct ? 'correct-mark' : 'incorrect-mark')}>{item.correct ? '✓' : '×'}</span>
                    <div className="review-question"><strong>{item.question.prompt}</strong><span>Your answer: {item.submitted}</span></div>
                    <div className="review-answer"><span>Correct</span><strong>{item.question.answerDisplay}</strong></div>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="result-actions">
            <button className="primary-button large-button" type="button" onClick={() => setStatus('ready')}>Run another session <span aria-hidden="true">↗</span></button>
            <button className="secondary-button large-button" type="button" onClick={onExit}>Back to games</button>
          </div>
        </div>
      )}
    </section>
  );
}