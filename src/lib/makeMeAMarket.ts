import type { SeededRandom } from './rng';

export interface MarketMakingQuestion {
  id: string;
  title: string;
  prompt: string;
  unit: string;
  answer: number;
  context: string;
}

export type CounterpartyOutcome = 'bought-at-bid' | 'sold-at-ask' | 'pass';

export interface MarketMakingQuote {
  bid: number;
  ask: number;
}

export interface MarketMakingSettlement {
  outcome: CounterpartyOutcome;
  tradePrice: number | null;
  pnl: number;
  positionChange: -1 | 0 | 1;
  spread: number;
  midpoint: number;
  spreadFraction: number;
}

export interface MarketMakingRoundResult {
  question: MarketMakingQuestion;
  intervalLow: number;
  intervalHigh: number;
  bid: number;
  ask: number;
  settlement: MarketMakingSettlement;
  intervalCovered: boolean;
  playedAtMs: number;
}

export interface MarketMakingSessionSummary {
  rounds: number;
  intervalCoverage: number | null;
  trades: number;
  passes: number;
  rawProfit: number;
  averageSpreadFraction: number | null;
  durationSeconds: number;
  playedAt: string;
}

export const MAKE_MARKET_ROUNDS = 5;
export const MAKE_MARKET_MAX_SPREAD_FRACTION = 0.4;

const QUESTIONS: readonly MarketMakingQuestion[] = [
  {
    id: 'eiffel-height',
    title: 'The Eiffel Tower',
    prompt: 'What is the approximate height of the Eiffel Tower, including its top antenna?',
    unit: 'metres',
    answer: 330,
    context: 'Think about the scale of a 100-storey building, then account for the tower’s lattice structure and antenna.'
  },
  {
    id: 'moon-distance',
    title: 'Earth to Moon',
    prompt: 'What is the mean distance from the centre of the Earth to the centre of the Moon?',
    unit: 'kilometres',
    answer: 384400,
    context: 'Compare the Moon’s orbital distance with the Earth’s roughly 12,700 km diameter.'
  },
  {
    id: 'earth-circumference',
    title: 'Around the Earth',
    prompt: 'What is the approximate circumference of the Earth at the equator?',
    unit: 'kilometres',
    answer: 40075,
    context: 'Use the Earth’s roughly 6,378 km equatorial radius and the circumference formula 2πr.'
  },
  {
    id: 'light-speed',
    title: 'Speed of light',
    prompt: 'What is the speed of light in a vacuum, in kilometres per second?',
    unit: 'km/s',
    answer: 299792.458,
    context: 'Light travels about 300,000 km each second in a vacuum.'
  },
  {
    id: 'year-seconds',
    title: 'A year in seconds',
    prompt: 'How many seconds are in a non-leap year of 365 days?',
    unit: 'seconds',
    answer: 31536000,
    context: 'Multiply 365 days by 24 hours, 60 minutes, and 60 seconds.'
  },
  {
    id: 'astronomical-unit',
    title: 'The astronomical unit',
    prompt: 'How many kilometres are in one astronomical unit, the mean Earth–Sun distance?',
    unit: 'kilometres',
    answer: 149597870.7,
    context: 'An astronomical unit is about 150 million kilometres.'
  },
  {
    id: 'everest-height',
    title: 'Mount Everest',
    prompt: 'What is the commonly published height of Mount Everest above sea level?',
    unit: 'metres',
    answer: 8848.86,
    context: 'It is just under nine kilometres above sea level.'
  },
  {
    id: 'earth-radius',
    title: 'Earth’s radius',
    prompt: 'What is the approximate mean radius of the Earth?',
    unit: 'kilometres',
    answer: 6371,
    context: 'Half of Earth’s diameter is a little over 12,700 km.'
  },
  {
    id: 'water-boiling',
    title: 'Boiling water',
    prompt: 'At what temperature does pure water boil at standard atmospheric pressure?',
    unit: 'degrees Celsius',
    answer: 100,
    context: 'The reference assumes standard atmospheric pressure; boiling temperature changes with pressure.'
  },
  {
    id: 'marathon',
    title: 'The marathon',
    prompt: 'What is the official marathon distance, in kilometres?',
    unit: 'kilometres',
    answer: 42.195,
    context: 'The official distance is slightly longer than 42 km.'
  },
  {
    id: 'earth-sun-light',
    title: 'Sunlight travel time',
    prompt: 'Approximately how many minutes does light take to travel from the Sun to Earth?',
    unit: 'minutes',
    answer: 8.3167,
    context: 'Divide one astronomical unit by the speed of light, then convert seconds to minutes.'
  },
  {
    id: 'human-bones',
    title: 'The adult skeleton',
    prompt: 'How many bones are usually counted in a typical adult human skeleton?',
    unit: 'bones',
    answer: 206,
    context: 'The usual textbook count is 206, although anatomical variation occurs.'
  }
];

export function getMarketMakingQuestionCount(): number {
  return QUESTIONS.length;
}

export function generateMarketMakingSession(
  rng: SeededRandom,
  count = MAKE_MARKET_ROUNDS
): MarketMakingQuestion[] {
  if (!Number.isInteger(count) || count < 1 || count > QUESTIONS.length) {
    throw new RangeError('Round count must be within the available question bank.');
  }
  return rng.shuffle(QUESTIONS).slice(0, count);
}

export function validateConfidenceInterval(low: number, high: number): boolean {
  return Number.isFinite(low) && Number.isFinite(high) && low > 0 && high > low;
}

export function validateMarketQuote(
  bid: number,
  ask: number,
  maximumSpreadFraction = MAKE_MARKET_MAX_SPREAD_FRACTION
): boolean {
  if (!Number.isFinite(bid) || !Number.isFinite(ask) || bid <= 0 || ask <= bid) return false;
  if (!Number.isFinite(maximumSpreadFraction) || maximumSpreadFraction <= 0) return false;
  const midpoint = (bid + ask) / 2;
  return (ask - bid) / midpoint <= maximumSpreadFraction + 1e-12;
}

export function settleMarketMakingQuote(
  answer: number,
  quote: MarketMakingQuote,
  maximumSpreadFraction = MAKE_MARKET_MAX_SPREAD_FRACTION
): MarketMakingSettlement {
  if (!Number.isFinite(answer) || answer <= 0) {
    throw new RangeError('The reference answer must be finite and positive.');
  }
  if (!validateMarketQuote(quote.bid, quote.ask, maximumSpreadFraction)) {
    throw new RangeError('Quote is invalid or wider than the configured spread constraint.');
  }

  const spread = quote.ask - quote.bid;
  const midpoint = (quote.ask + quote.bid) / 2;
  const spreadFraction = spread / midpoint;

  if (quote.bid > answer) {
    return {
      outcome: 'bought-at-bid',
      tradePrice: quote.bid,
      pnl: answer - quote.bid,
      positionChange: 1,
      spread,
      midpoint,
      spreadFraction
    };
  }
  if (quote.ask < answer) {
    return {
      outcome: 'sold-at-ask',
      tradePrice: quote.ask,
      pnl: quote.ask - answer,
      positionChange: -1,
      spread,
      midpoint,
      spreadFraction
    };
  }
  return {
    outcome: 'pass',
    tradePrice: null,
    pnl: 0,
    positionChange: 0,
    spread,
    midpoint,
    spreadFraction
  };
}

export function settleMarketMakingRound(
  question: MarketMakingQuestion,
  intervalLow: number,
  intervalHigh: number,
  quote: MarketMakingQuote,
  playedAtMs = Date.now(),
  maximumSpreadFraction = MAKE_MARKET_MAX_SPREAD_FRACTION
): MarketMakingRoundResult {
  if (!validateConfidenceInterval(intervalLow, intervalHigh)) {
    throw new RangeError('Confidence interval endpoints must be positive and ordered.');
  }
  const settlement = settleMarketMakingQuote(question.answer, quote, maximumSpreadFraction);
  return {
    question,
    intervalLow,
    intervalHigh,
    bid: quote.bid,
    ask: quote.ask,
    settlement,
    intervalCovered: intervalLow <= question.answer && question.answer <= intervalHigh,
    playedAtMs
  };
}

export function summarizeMarketMakingSession(
  results: readonly MarketMakingRoundResult[],
  durationSeconds: number,
  playedAt = new Date().toISOString()
): MarketMakingSessionSummary {
  const coverage = results.length === 0
    ? null
    : results.filter((result) => result.intervalCovered).length / results.length;
  return {
    rounds: results.length,
    intervalCoverage: coverage,
    trades: results.filter((result) => result.settlement.outcome !== 'pass').length,
    passes: results.filter((result) => result.settlement.outcome === 'pass').length,
    rawProfit: results.reduce((sum, result) => sum + result.settlement.pnl, 0),
    averageSpreadFraction: results.length === 0
      ? null
      : results.reduce((sum, result) => sum + result.settlement.spreadFraction, 0) / results.length,
    durationSeconds: Math.max(0, Math.round(durationSeconds)),
    playedAt
  };
}

export function formatMarketNumber(value: number): string {
  if (!Number.isFinite(value)) return '—';
  if (Math.abs(value) >= 1e6 || (Math.abs(value) > 0 && Math.abs(value) < 0.001)) {
    return value.toExponential(3).replace('e+', 'e');
  }
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 3 }).format(value);
}

export function describeCounterpartyOutcome(outcome: CounterpartyOutcome): string {
  switch (outcome) {
    case 'bought-at-bid': return 'Counterparty sells to your bid. You buy one unit.';
    case 'sold-at-ask': return 'Counterparty buys at your ask. You sell one unit.';
    case 'pass': return 'No trade. Your quote contains the reference value.';
  }
}
