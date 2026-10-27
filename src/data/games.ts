export type GameSlug =
  | 'fruit-market'
  | 'fermi-questions'
  | 'probability-betting'
  | 'marble-olympics'
  | 'next-card-betting'
  | 'make-me-a-market'
  | 'market-of-cards'
  | 'etf-trading-challenge'
  | 'math-challenge';

export interface GameDefinition {
  slug: GameSlug;
  title: string;
  category: string;
  difficulty: 'Easy' | 'Medium' | 'Hard';
  duration: string;
  players: string;
  description: string;
  skills: string[];
  rules: string[];
  playable: boolean;
  accent: string;
  externalRules: string;
}

export const GAMES: GameDefinition[] = [
  {
    slug: 'fruit-market',
    title: 'Fruit Market Game',
    category: 'Market making',
    difficulty: 'Easy',
    duration: '5 min',
    players: 'Solo',
    description: 'Calculate basket fair value under changing conditions and trade when the bid or ask gives you an edge.',
    skills: ['Fair value', 'Fast arithmetic', 'Trade selection'],
    rules: [
      'Two bags contain apples and oranges. The described fair value is total apples multiplied by total oranges.',
      'The baskets update during the session, so value must be recalculated as the information changes.',
      'The published rules describe optional inflation, deflation, and nullification events.',
      'The exact quote-generation process and event schedule are not fully specified in the public rules.'
    ],
    playable: true,
    accent: 'orange',
    externalRules: 'https://marketmakinggames.com/games/fruit-market-game'
  },
  {
    slug: 'fermi-questions',
    title: 'Fermi Questions Challenge',
    category: 'Estimation',
    difficulty: 'Easy',
    duration: '5 min',
    players: 'Solo',
    description: 'Estimate real-world quantities under a short clock, then review your assumptions and multiplicative error.',
    skills: ['Decomposition', 'Calibration', 'Numeracy'],
    rules: [
      'A numerical estimation question is shown and an answer is submitted before the timer expires.',
      'The answer and explanation are revealed after submissions close.',
      'The public description uses logarithmic closeness and penalizes skipped answers.',
      'The full point-by-point scoring curve and question parameters are not published.'
    ],
    playable: true,
    accent: 'blue',
    externalRules: 'https://marketmakinggames.com/games/fermi-questions'
  },
  {
    slug: 'probability-betting',
    title: 'Probability Betting',
    category: 'Probability',
    difficulty: 'Medium',
    duration: '10 min',
    players: 'Solo',
    description: 'Compare event probabilities with quoted odds, place multi-event bets, and control aggregate exposure.',
    skills: ['Probability', 'Expected value', 'Kelly sizing'],
    rules: [
      'Each round presents events with quoted odds. The described events include dice, cards, and coin flips.',
      'Choose which events to bet on and size the stake; outcomes are revealed afterward.',
      'The review compares fair odds, quoted odds, estimated edge, and Kelly-optimal size.',
      'Exact event distributions, quote-generation rules, and the complete scoring formula still need specification.'
    ],
    playable: true,
    accent: 'violet',
    externalRules: 'https://marketmakinggames.com/games/probability-betting'
  },
  {
    slug: 'marble-olympics',
    title: 'The Marble Olympics',
    category: 'Live markets',
    difficulty: 'Hard',
    duration: '30 min',
    players: 'Solo',
    description: 'Trade a simulated marble football final and evaluate side bets as the match evolves.',
    skills: ['Bayesian updating', 'Event-driven pricing', 'Risk control'],
    rules: [
      'Two teams shoot marbles at two colored goals over a simulated match.',
      'The main market settles at the product of the two teams’ final marble totals.',
      'Side bets have stated payout formulas and settle on the final counts.',
      'The public rules describe historical tournament results as a signal of hidden team quality, but not the full simulation parameters.'
    ],
    playable: false,
    accent: 'green',
    externalRules: 'https://marketmakinggames.com/games/marble-olympics'
  },
  {
    slug: 'next-card-betting',
    title: 'Next Card Betting',
    category: 'Probability',
    difficulty: 'Easy',
    duration: '5 min',
    players: 'Solo',
    description: 'Count unseen cards, calculate conditional higher/lower odds, and size each wager with Kelly discipline.',
    skills: ['Card counting', 'Conditional probability', 'Kelly sizing'],
    rules: [
      'A reference card is revealed, then a stake is placed on whether the next card is higher or lower.',
      'A correct prediction wins the stake, an incorrect prediction loses it, and a tie returns it.',
      'The rules mention configurable suits and ace values.',
      'This practice module uses a without-replacement deck, selectable suit count and ace value, and transparent decision-quality metrics rather than the unpublished platform point formula.'
    ],
    playable: true,
    accent: 'red',
    externalRules: 'https://marketmakinggames.com/games/next-card'
  },
  {
    slug: 'make-me-a-market',
    title: 'Make Me a Market',
    category: 'Market making',
    difficulty: 'Medium',
    duration: '10 min',
    players: 'Solo',
    description: 'Set a confidence interval, quote a two-sided market, and learn when an informed counterparty can pick you off.',
    skills: ['Bid/ask quoting', 'Inventory risk', 'P&L reasoning'],
    rules: [
      'The first phase asks for a wide bid-ask interval representing a 95% confidence interval.',
      'In the market-making phase, a computer counterparty trades when the bid is above the answer or the ask is below it.',
      'The closing review asks about position, maximum guaranteed loss, break-even, and P&L at specified values.',
      'This practice version makes the maximum spread, reference question bank, and session scoring visible instead of claiming to reproduce undocumented platform defaults.'
    ],
    playable: true,
    accent: 'cyan',
    externalRules: 'https://marketmakinggames.com/games/make-me-a-market'
  },
  {
    slug: 'market-of-cards',
    title: 'Market of Cards',
    category: 'Market making',
    difficulty: 'Medium',
    duration: '15 min',
    players: 'Solo vs opponents',
    description: 'Quote a two-sided market with private cards and update fair value as shared information arrives.',
    skills: ['Conditional expectation', 'Adverse selection', 'Position management'],
    rules: [
      'The published overview describes a standard deck and two private cards per player.',
      'Players take turns quoting a bid and ask; others can buy, sell, or pass, and only the first response trades.',
      'A center card is revealed at each round end.',
      'The table value is based on all players’ cards and the center cards. The precise timing, deck accounting, and tie conventions require confirmation.'
    ],
    playable: false,
    accent: 'purple',
    externalRules: 'https://marketmakinggames.com/games/market-of-cards'
  },
  {
    slug: 'etf-trading-challenge',
    title: 'ETF Trading Challenge',
    category: 'Arbitrage',
    difficulty: 'Hard',
    duration: '10 min',
    players: 'Solo vs opponents',
    description: 'Trade an ETF against its underlying basket, catch executable arbitrage, and react to news before other traders.',,
    skills: ['Mental math', 'Arbitrage', 'Execution speed'],
    rules: [
      'Each ETF contains two to four stocks and the prices update during the session.',
      'Buy the ETF when the sum of constituent bid prices is above the ETF ask; sell the ETF when the sum of constituent ask prices is below the ETF bid.',
      'After a trade, constituent prices reset or reduce the arbitrage opportunity while the ETF can continue trending.',
      'The exact price process, trade quantities, transaction costs, and update schedule are not specified in the public overview.'
    ],
    playable: true,
    accent: 'yellow',
    externalRules: 'https://marketmakinggames.com/games/etf-challenge'
  },
  {
    slug: 'math-challenge',
    title: 'Math Challenge',
    category: 'Mental math',
    difficulty: 'Easy',
    duration: '6 min',
    players: 'Solo',
    description: 'Work through arithmetic questions under a countdown. Correct answers add points; wrong answers cost points.',
    skills: ['Mental arithmetic', 'Accuracy under time pressure', 'Speed'],
    rules: [
      'Questions cover integers, decimals, fractions, or a mix.',
      'Each correct answer scores +1 point and each wrong answer scores −1 point.',
      'The session ends when the timer expires and the review shows each answer.',
      'This practice implementation uses original, generated questions and the published +1/−1 scoring rule.'
    ],
    playable: true,
    accent: 'white',
    externalRules: 'https://marketmakinggames.com/games/math-challenge'
  }
];

export function getGame(slug: GameSlug): GameDefinition | undefined {
  return GAMES.find((game) => game.slug === slug);
}