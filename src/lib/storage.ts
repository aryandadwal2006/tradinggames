import type { FermiSessionSummary } from './fermiChallenge';
import type { FruitSessionSummary } from './fruitMarket';
import type { MathSessionSummary } from './mathChallenge';
import type { MarketMakingSessionSummary } from './makeMeAMarket';
import type { CardSessionSummary } from './nextCardBetting';
import type { ProbabilitySessionSummary } from './probabilityBetting';
import type { ETFSessionSummary } from './etfTrading';

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
  marketMakingSessions: number;
  marketMakingBestPnl: number | null;
  marketMakingRecentSessions: MarketMakingSessionSummary[];
  nextCardSessions: number;
  nextCardBestBankroll: number | null;
  nextCardRecentSessions: CardSessionSummary[];
  probabilitySessions: number;
  probabilityBestBankroll: number | null;
  probabilityRecentSessions: ProbabilitySessionSummary[];
  etfSessions: number;
  etfBestPnl: number | null;
  etfRecentSessions: ETFSessionSummary[];
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
  fruitRecentSessions: [],
  marketMakingSessions: 0,
  marketMakingBestPnl: null,
  marketMakingRecentSessions: [],
  nextCardSessions: 0,
  nextCardBestBankroll: null,
  nextCardRecentSessions: [],
  probabilitySessions: 0,
  probabilityBestBankroll: null,
  probabilityRecentSessions: [],
  etfSessions: 0,
  etfBestPnl: null,
  etfRecentSessions: []
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

function validMarketMakingSummary(value: unknown): value is MarketMakingSessionSummary {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Partial<MarketMakingSessionSummary>;
  const nullableNumber = (item: unknown) => item === null || (typeof item === 'number' && Number.isFinite(item));
  return typeof candidate.rounds === 'number'
    && (candidate.intervalCoverage === null || typeof candidate.intervalCoverage === 'number')
    && typeof candidate.trades === 'number'
    && typeof candidate.passes === 'number'
    && typeof candidate.rawProfit === 'number'
    && nullableNumber(candidate.averageSpreadFraction)
    && typeof candidate.durationSeconds === 'number'
    && typeof candidate.playedAt === 'string';
}

function validCardSummary(value: unknown): value is CardSessionSummary {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Partial<CardSessionSummary>;
  const nullableNumber = (item: unknown) => item === null || (typeof item === 'number' && Number.isFinite(item));
  return typeof candidate.rounds === 'number'
    && typeof candidate.bets === 'number'
    && typeof candidate.wins === 'number'
    && typeof candidate.losses === 'number'
    && typeof candidate.pushes === 'number'
    && typeof candidate.skipped === 'number'
    && typeof candidate.initialBankroll === 'number'
    && typeof candidate.finalBankroll === 'number'
    && typeof candidate.netPnl === 'number'
    && typeof candidate.positiveEvBets === 'number'
    && nullableNumber(candidate.positiveEvBetRate)
    && typeof candidate.opportunities === 'number'
    && nullableNumber(candidate.opportunityParticipation)
    && nullableNumber(candidate.sizingEfficiency)
    && typeof candidate.suitCount === 'number'
    && typeof candidate.aceHigh === 'boolean'
    && typeof candidate.durationSeconds === 'number'
    && typeof candidate.playedAt === 'string';
}

function validProbabilitySummary(value: unknown): value is ProbabilitySessionSummary {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Partial<ProbabilitySessionSummary>;
  const nullableNumber = (item: unknown) => item === null || (typeof item === 'number' && Number.isFinite(item));
  return typeof candidate.rounds === 'number'
    && typeof candidate.opportunities === 'number'
    && typeof candidate.bets === 'number'
    && typeof candidate.wins === 'number'
    && typeof candidate.losses === 'number'
    && typeof candidate.skipped === 'number'
    && nullableNumber(candidate.decisionQuality)
    && nullableNumber(candidate.opportunityParticipation)
    && nullableNumber(candidate.sizingEfficiency)
    && typeof candidate.initialBankroll === 'number'
    && typeof candidate.finalBankroll === 'number'
    && typeof candidate.netPnl === 'number'
    && typeof candidate.durationSeconds === 'number'
    && typeof candidate.playedAt === 'string';
}

function validETFSessionSummary(value: unknown): value is ETFSessionSummary {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Partial<ETFSessionSummary>;
  const nullableNumber = (item: unknown) => item === null || (typeof item === 'number' && Number.isFinite(item));
  return typeof candidate.trades === 'number'
    && typeof candidate.profitableTrades === 'number'
    && nullableNumber(candidate.accuracy)
    && typeof candidate.totalPnl === 'number'
    && typeof candidate.newsPnl === 'number'
    && typeof candidate.normalPnl === 'number'
    && nullableNumber(candidate.bestEdge)
    && nullableNumber(candidate.averageEdge)
    && typeof candidate.bestBotRanked === 'boolean'
    && Array.isArray(candidate.botPnl)
    && typeof candidate.durationSeconds === 'number'
    && typeof candidate.constituentCount === 'number'
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
    const marketMakingRecentSessions = Array.isArray(candidate.marketMakingRecentSessions)
      ? candidate.marketMakingRecentSessions.filter(validMarketMakingSummary).slice(0, MAX_RECENT_SESSIONS)
      : [];
    const nextCardRecentSessions = Array.isArray(candidate.nextCardRecentSessions)
      ? candidate.nextCardRecentSessions.filter(validCardSummary).slice(0, MAX_RECENT_SESSIONS)
      : [];
    const probabilityRecentSessions = Array.isArray(candidate.probabilityRecentSessions)
      ? candidate.probabilityRecentSessions.filter(validProbabilitySummary).slice(0, MAX_RECENT_SESSIONS)
      : [];
    const etfRecentSessions = Array.isArray(candidate.etfRecentSessions)
      ? candidate.etfRecentSessions.filter(validETFSessionSummary).slice(0, MAX_RECENT_SESSIONS)
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
      fruitRecentSessions,
      marketMakingSessions: count(candidate.marketMakingSessions),
      marketMakingBestPnl: typeof candidate.marketMakingBestPnl === 'number' && Number.isFinite(candidate.marketMakingBestPnl)
        ? candidate.marketMakingBestPnl
        : null,
      marketMakingRecentSessions,
      nextCardSessions: count(candidate.nextCardSessions),
      nextCardBestBankroll: typeof candidate.nextCardBestBankroll === 'number' && Number.isFinite(candidate.nextCardBestBankroll)
        ? candidate.nextCardBestBankroll
        : null,
      nextCardRecentSessions,
      probabilitySessions: count(candidate.probabilitySessions),
      probabilityBestBankroll: typeof candidate.probabilityBestBankroll === 'number' && Number.isFinite(candidate.probabilityBestBankroll)
        ? candidate.probabilityBestBankroll
        : null,
      probabilityRecentSessions,
      etfSessions: count(candidate.etfSessions),
      etfBestPnl: typeof candidate.etfBestPnl === 'number' && Number.isFinite(candidate.etfBestPnl) ? candidate.etfBestPnl : null,
      etfRecentSessions
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

export function saveMarketMakingSession(summary: MarketMakingSessionSummary): LocalStats {
  const previous = loadStats();
  const next: LocalStats = {
    ...previous,
    sessions: previous.sessions + 1,
    marketMakingSessions: previous.marketMakingSessions + 1,
    marketMakingBestPnl: previous.marketMakingBestPnl === null
      ? summary.rawProfit
      : Math.max(previous.marketMakingBestPnl, summary.rawProfit),
    marketMakingRecentSessions: [summary, ...previous.marketMakingRecentSessions].slice(0, MAX_RECENT_SESSIONS),
    lastPlayedAt: summary.playedAt
  };
  persistStats(next);
  return next;
}

export function saveCardSession(summary: CardSessionSummary): LocalStats {
  const previous = loadStats();
  const next: LocalStats = {
    ...previous,
    sessions: previous.sessions + 1,
    nextCardSessions: previous.nextCardSessions + 1,
    nextCardBestBankroll: previous.nextCardBestBankroll === null
      ? summary.finalBankroll
      : Math.max(previous.nextCardBestBankroll, summary.finalBankroll),
    nextCardRecentSessions: [summary, ...previous.nextCardRecentSessions].slice(0, MAX_RECENT_SESSIONS),
    lastPlayedAt: summary.playedAt
  };
  persistStats(next);
  return next;
}

export function saveProbabilitySession(summary: ProbabilitySessionSummary): LocalStats {
  const previous = loadStats();
  const next: LocalStats = {
    ...previous,
    sessions: previous.sessions + 1,
    probabilitySessions: previous.probabilitySessions + 1,
    probabilityBestBankroll: previous.probabilityBestBankroll === null
      ? summary.finalBankroll
      : Math.max(previous.probabilityBestBankroll, summary.finalBankroll),
    probabilityRecentSessions: [summary, ...previous.probabilityRecentSessions].slice(0, MAX_RECENT_SESSIONS),
    lastPlayedAt: summary.playedAt
  };
  persistStats(next);
  return next;
}

export function saveETFSession(summary: ETFSessionSummary): LocalStats {
  const previous = loadStats();
  const next: LocalStats = {
    ...previous,
    sessions: previous.sessions + 1,
    etfSessions: previous.etfSessions + 1,
    etfBestPnl: previous.etfBestPnl === null ? summary.totalPnl : Math.max(previous.etfBestPnl, summary.totalPnl),
    etfRecentSessions: [summary, ...previous.etfRecentSessions].slice(0, MAX_RECENT_SESSIONS),
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