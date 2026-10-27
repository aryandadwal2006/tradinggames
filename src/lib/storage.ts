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
}

const EMPTY_STATS: LocalStats = {
  version: 1,
  sessions: 0,
  bestScore: null,
  totalCorrect: 0,
  totalIncorrect: 0,
  recentSessions: [],
  lastPlayedAt: null
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
    return {
      version: 1,
      sessions: Math.max(0, Math.floor(candidate.sessions)),
      bestScore: typeof candidate.bestScore === 'number' ? candidate.bestScore : null,
      totalCorrect: Math.max(0, Math.floor(candidate.totalCorrect)),
      totalIncorrect: Math.max(0, Math.floor(candidate.totalIncorrect)),
      recentSessions,
      lastPlayedAt: typeof candidate.lastPlayedAt === 'string' ? candidate.lastPlayedAt : null
    };
  } catch {
    return { ...EMPTY_STATS };
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
    version: 1,
    sessions: previous.sessions + 1,
    bestScore: previous.bestScore === null ? summary.score : Math.max(previous.bestScore, summary.score),
    totalCorrect: previous.totalCorrect + summary.correct,
    totalIncorrect: previous.totalIncorrect + summary.incorrect,
    recentSessions: [summary, ...previous.recentSessions].slice(0, MAX_RECENT_SESSIONS),
    lastPlayedAt: summary.playedAt
  };
  try {
    if (typeof window !== 'undefined') window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Keep the current session usable when storage is blocked or full.
  }
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