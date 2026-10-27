import type { FermiSessionSummary } from './fermiChallenge';
import type { FruitSessionSummary } from './fruitMarket';
import type { MathSessionSummary } from './mathChallenge';

const STORAGE_KEY = 'trading-games.stats.v1';
const MAX_RECENT_SESSIONS = 20;

export interface LocalStats {
  version: 1;
  sessions: number;
  bestScore: number | null;
  totalCorrect: number;
  totalIncorrect: number;
  recentSessions: MathSessionSummary[];
  lastPlayedAt: string | null;
  fermiSessions: number;
  fermiRounds: number;
  fermiBestMedianFactor: number | null;
  fermiRecentSessions: FermiSessionSummary[];
  fruitSessions: number;
  fruitBestScore: number | null;
  fruitBestAccuracy: number | null;
  fruitRecentSessions: FruitSessionSummary[];
}

const EMPTY_STATS: LocalStats = {
  version: 1,
  sessions: 0,
  bestScore: null,
  totalCorrect: 0,
  totalIncorrect: 0,
  recentSessions: [],
  lastPlayedAt: null,
  fermiSessions: 0,
  fermiRounds: 0,
  fermiBestMedianFactor: null,
  fermiRecentSessions: [],
  fruitSessions: 0,
  fruitBestScore: null,
  fruitBestAccuracy: null,
  fruitRecentSessions: []
};

function validSummary(value: unknown): value is MathSessionSummary {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Partial<MathSessionSummary>;
  return typeof candidate.score === 'number'
    && typeof candidate.correct === 'number'
    && typeof candidate.incorrect === 'number'
    && typeof candidate.mode === 'string'
    && typeof candidate.durationSeconds === 'number'
    && typeof candidate.playedAt === 'string';
}

function validFermiSummary(value: unknown): value is FermiSessionSummary {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Partial<FermiSessionSummary>;
  const nullableNumber = (item: unknown) => item === null || typeof item === 'number';
  return typeof candidate.questionCount === 'number'
    && typeof candidate.submitted === 'number'
    && typeof candidate.skipped === 'number'
    && nullableNumber(candidate.medianFactorError)
    && nullableNumber(candidate.geometricMeanFactorError)
    && typeof candidate.durationSeconds === 'number'
    && typeof candidate.playedAt === 'string';
}

function validFruitSummary(value: unknown): value is FruitSessionSummary {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Partial<FruitSessionSummary>;
  return typeof candidate.rawProfit === 'number'
    && typeof candidate.score === 'number'
    && (candidate.firstClickAccuracy === null || typeof candidate.firstClickAccuracy === 'number')
    && typeof candidate.firstClickTrials === 'number'
    && typeof candidate.profitableFirstClicks === 'number'
    && typeof candidate.trades === 'number'
    && typeof candidate.profitableTrades === 'number'
    && typeof candidate.durationSeconds === 'number'
    && typeof candidate.playedAt === 'string';
}

function count(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
}

function parseStats(raw: string | null): LocalStats {
  if (!raw) return { ...EMPTY_STATS };
  try {
    const value: unknown = JSON.parse(raw);
    if (typeof value !== 'object' || value === null) return { ...EMPTY_STATS };
    const candidate = value as Partial<LocalStats>;
    if (candidate.version !== 1
      || typeof candidate.sessions !== 'number'
      || typeof candidate.totalCorrect !== 'number'
      || typeof candidate.totalIncorrect !== 'number'
      || !Array.isArray(candidate.recentSessions)) {
      return { ...EMPTY_STATS };
    }
    const recentSessions = candidate.recentSessions.filter(validSummary).slice(0, MAX_RECENT_SESSIONS);
    const fermiRecentSessions = Array.isArray(candidate.fermiRecentSessions)
      ? candidate.fermiRecentSessions.filter(validFermiSummary).slice(0, MAX_RECENT_SESSIONS)
      : [];
    const fruitRecentSessions = Array.isArray(candidate.fruitRecentSessions)
      ? candidate.fruitRecentSessions.filter(validFruitSummary).slice(0, MAX_RECENT_SESSIONS)
      : [];
    return {
      version: 1,
      sessions: count(candidate.sessions),
      bestScore: typeof candidate.bestScore === 'number' && Number.isFinite(candidate.bestScore) ? candidate.bestScore : null,
      totalCorrect: count(candidate.totalCorrect),
      totalIncorrect: count(candidate.totalIncorrect),
      recentSessions,
      lastPlayedAt: typeof candidate.lastPlayedAt === 'string' ? candidate.lastPlayedAt : null,
      fermiSessions: count(candidate.fermiSessions),
      fermiRounds: count(candidate.fermiRounds),
      fermiBestMedianFactor: typeof candidate.fermiBestMedianFactor === 'number' && Number.isFinite(candidate.fermiBestMedianFactor)
        ? candidate.fermiBestMedianFactor
        : null,
      fermiRecentSessions,
      fruitSessions: count(candidate.fruitSessions),
      fruitBestScore: typeof candidate.fruitBestScore === 'number' && Number.isFinite(candidate.fruitBestScore) ? candidate.fruitBestScore : null,
      fruitBestAccuracy: typeof candidate.fruitBestAccuracy === 'number' && Number.isFinite(candidate.fruitBestAccuracy) ? candidate.fruitBestAccuracy : null,
      fruitRecentSessions
    };
  } catch {
    return { ...EMPTY_STATS };
  }
}

function persistStats(stats: LocalStats): void {
  try {
    if (typeof window !== 'undefined') window.localStorage.setItem(STORAGE_KEY, JSON.stringify(stats));
  } catch {
    // Keep the current session usable when storage is blocked or full.
  }
}

export function loadStats(): LocalStats {
  if (typeof window === 'undefined') return { ...EMPTY_STATS };
  try {
    return parseStats(window.localStorage.getItem(STORAGE_KEY));
  } catch {
    return { ...EMPTY_STATS };
  }
}

export function saveMathSession(summary: MathSessionSummary): LocalStats {
  const previous = loadStats();
  const next: LocalStats = {
    ...previous,
    sessions: previous.sessions + 1,
    bestScore: previous.bestScore === null ? summary.score : Math.max(previous.bestScore, summary.score),
    totalCorrect: previous.totalCorrect + summary.correct,
    totalIncorrect: previous.totalIncorrect + summary.incorrect,
    recentSessions: [summary, ...previous.recentSessions].slice(0, MAX_RECENT_SESSIONS),
    lastPlayedAt: summary.playedAt
  };
  persistStats(next);
  return next;
}

export function saveFermiSession(summary: FermiSessionSummary): LocalStats {
  const previous = loadStats();
  const validFactor = summary.medianFactorError;
  const next: LocalStats = {
    ...previous,
    sessions: previous.sessions + 1,
    fermiSessions: previous.fermiSessions + 1,
    fermiRounds: previous.fermiRounds + summary.questionCount,
    fermiBestMedianFactor: validFactor === null
      ? previous.fermiBestMedianFactor
      : previous.fermiBestMedianFactor === null
        ? validFactor
        : Math.min(previous.fermiBestMedianFactor, validFactor),
    fermiRecentSessions: [summary, ...previous.fermiRecentSessions].slice(0, MAX_RECENT_SESSIONS),
    lastPlayedAt: summary.playedAt
  };
  persistStats(next);
  return next;
}

export function saveFruitSession(summary: FruitSessionSummary): LocalStats {
  const previous = loadStats();
  const accuracy = summary.firstClickAccuracy;
  const next: LocalStats = {
    ...previous,
    sessions: previous.sessions + 1,
    fruitSessions: previous.fruitSessions + 1,
    fruitBestScore: previous.fruitBestScore === null ? summary.score : Math.max(previous.fruitBestScore, summary.score),
    fruitBestAccuracy: accuracy === null
      ? previous.fruitBestAccuracy
      : previous.fruitBestAccuracy === null ? accuracy : Math.max(previous.fruitBestAccuracy, accuracy),
    fruitRecentSessions: [summary, ...previous.fruitRecentSessions].slice(0, MAX_RECENT_SESSIONS),
    lastPlayedAt: summary.playedAt
  };
  persistStats(next);
  return next;
}

export function clearStats(): LocalStats {
  try {
    if (typeof window !== 'undefined') window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Clearing local progress is best-effort if storage is unavailable.
  }
  return { ...EMPTY_STATS };
}