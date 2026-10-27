# Game rule source and implementation boundary

This document separates mechanics stated in the supplied materials or public rule summaries from details that still need clarification. The public interface does not expose undocumented scoring as if it were exact.

## Catalog required by the supplied PDFs

The Society Partner Deck and Society Host Guide name these nine formats: Fruit Market Game, Fermi Questions Challenge, Probability Betting, The Marble Olympics, Next Card Betting, Make Me a Market, Market of Cards, ETF Trading Challenge, and Math Challenge. The local catalog includes all nine.

## Source summaries checked on 27 October 2026

- Fruit Market: https://marketmakinggames.com/games/fruit-market-game
- Fermi Questions Challenge: https://marketmakinggames.com/games/fermi-questions
- Probability Betting: https://marketmakinggames.com/games/probability-betting
- The Marble Olympics: https://marketmakinggames.com/games/marble-olympics
- Next Card Betting: https://marketmakinggames.com/games/next-card
- Make Me a Market: https://marketmakinggames.com/games/make-me-a-market
- Market of Cards: https://marketmakinggames.com/games/market-of-cards
- ETF Trading Challenge: https://marketmakinggames.com/games/etf-challenge
- Math Challenge: https://marketmakinggames.com/games/math-challenge

## Implemented modules

### Probability Betting

Each round presents four distinct event offers drawn from an explicit bank of fair coin, dice, and standard-deck events. The offer contains YES and NO decimal odds randomized around the fair odds. Users may bet on either side or skip, with all stakes for a round constrained by the available bankroll. Winning returns the stake plus the quoted net payout; losing costs the stake. The module evaluates edge as `p × decimalOdds − 1`, computes a full-Kelly fraction for positive-edge bets, and records local decision-quality, participation, sizing, and realized-bankroll metrics.

The public source does not state its precise offer-generation distribution or complete platform scoring curve. The local quote factor range (0.82–1.18), six-round session, 30-second round clock, starting bankroll, and metrics are practice settings, and are disclosed in the setup UI. These scores are not represented as platform-equivalent points.

### Next Card Betting

The higher/lower mode uses a shuffled standard-rank deck with one to four suits, an adjustable ace value, and draws without replacement. At each decision the player sees the current reference card and can compute exact probabilities from all cards still unseen. Stakes cannot exceed the current bankroll. A correct prediction wins the stake, an incorrect prediction loses it, and a tie returns it. The module provides a half-Kelly stake guide and records expected-value decision quality and sizing efficiency.

The public page also mentions an inside/outside-range mode but its detailed page does not specify the full round mechanics for that mode. It is not silently approximated here. Session length, 15-second decision timer, initial bankroll, and local calibration metrics are practice settings, not claims about the platform's default settings or unpublished leaderboard formula.

### Make Me a Market

The practice module uses an original local question bank, shuffled into five-question sessions. Each question has a confidence-interval phase followed by a two-sided quote. A simulated informed counterparty buys at the ask only when the ask is below the reference answer, sells at the bid only when the bid is above the answer, and otherwise passes. Trade P&L is marked to the reference answer.

The user-configurable spread constraint is a practice setting. The public page confirms that the original game uses a configured spread constraint but does not state its default value. The local module displays its selected setting and reports interval coverage, trade incidence, spread width, and P&L. It does not claim to reproduce the original final-question or leaderboard point system.

### Fruit Market Game

The local module implements the published core loop: two baskets are randomized with 3–8 apples and oranges of each type, fair value is total apples multiplied by total oranges, baskets update after randomized 15–20 second intervals, and over-limit baskets reset. It supports repeated one-unit buys at the ask and sells at the bid. The score is raw trade P&L multiplied by first-click accuracy.

The source describes inflation (2×), deflation (0.5×), and nullification events, but does not publish the platform's quote-generation distribution or complete event timing. The practice version therefore makes its assumptions visible in the setup screen and in `FRUIT_MARKET_CONFIG`: event probabilities, midpoint noise, and half-spread ranges are local practice parameters. Nullification excludes one selected basket from the value calculation, and an event expires at the next basket update. These are explicit practice rules, not claims about undocumented platform internals.

### Math Challenge

Math Challenge has a working timer, original randomized arithmetic questions, multiple-choice and typed answers, exact rational answer checking, the documented +1/−1 scoring rule, end-of-session review, and local statistics. Questions are generated from a seedable pseudo-random generator so tests can replay the same sequence, while live sessions use a random seed.

### Fermi Questions Challenge

The practice drill selects twelve distinct questions from an authored reference bank, randomizes their order for each session, and allows 25 seconds for each estimate. It shows an explanation and one explicit decomposition after the estimate is locked or skipped. The reference values are rounded practice anchors and are not claimed to be exact ground truth for variable real-world quantities.

The public rules specify logarithmic closeness, mention that an estimate within about 1.1× receives 10 points and an estimate within about 2× receives 4 points, and state a −2 penalty for a missed answer. They do not publish the complete point curve. This implementation deliberately does not fabricate those points. It records the symmetric factor error max(estimate/reference, reference/estimate) and uses the median and geometric mean of these errors as local calibration metrics. Lower is better. These are practice metrics, not an imitation of an unpublished scoring formula.

## Rules that remain incomplete in public descriptions

- Fruit Market: the official quote-generation distribution and exact event timing are not published. The practice version uses explicit configurable assumptions instead of claiming an exact quote clone.
- Fermi Questions: the complete logarithmic scoring curve and penalties by configuration are not published. The current module uses an explicitly labelled local error metric instead of claiming platform-score compatibility.
- Probability Betting: event distributions, quote generation, stake constraints, and full scoring details are not published.
- The Marble Olympics: team-strength model, event timestamps, side-bet generation, payout formulas by bet type, and the full match clock model are not published.
- Next Card Betting: higher/lower and tie settlement are implemented. The advertised inside/outside-range mode and official skill-score formula need additional rule detail before they can be reproduced faithfully. The current deck policy and session controls are explicit practice settings.
- Make Me a Market: the official question bank, exact default spread cap, repeated-quote/trade sequence, and final leaderboard point rules are not fully published. The current implementation explicitly uses a local question bank, one informed-counterparty decision per round, and a selectable practice spread cap.
- Market of Cards: complete timing rules, trading limits, deck accounting, inventory settlement, and tie conventions need confirmation.
- ETF Trading Challenge: price process, trade size, news generation, transaction costs, and reset mechanics need confirmation.

These modules stay marked as in development until their state transitions and scoring can be specified and tested without guesswork. Opponent agents for games that need an adversarial table will be added as distinct, testable policies rather than identical random clickers.