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

## Implemented in version 0.1

Math Challenge has a working timer, original randomized arithmetic questions, multiple-choice and typed answers, exact rational answer checking, the documented +1/−1 scoring rule, end-of-session review, and local statistics. Questions are generated from a seedable pseudo-random generator so tests can replay the same sequence, while live sessions use a random seed.

## Rules that remain incomplete in public descriptions

- Fruit Market: exact quote generation, precise event timing, and the formal meaning of first-click accuracy need confirmation.
- Fermi Questions: the complete logarithmic scoring curve, penalties by configuration, and a verified question bank are not published.
- Probability Betting: event distributions, quote generation, stake constraints, and full scoring details are not published.
- The Marble Olympics: team-strength model, event timestamps, side-bet generation, payout formulas by bet type, and the full match clock model are not published.
- Next Card Betting: precise score formula, shoe/deck reset policy, exact bet options, and tie/ace configuration semantics are not fully specified.
- Make Me a Market: question bank, counterparty policy, trade sizes, market update sequence, and exact settlement conventions need confirmation.
- Market of Cards: complete timing rules, trading limits, deck accounting, inventory settlement, and tie conventions need confirmation.
- ETF Trading Challenge: price process, trade size, news generation, transaction costs, and reset mechanics need confirmation.

These modules stay marked as in development until their state transitions and scoring can be specified and tested without guesswork. Opponent agents for games that need an adversarial table will be added as distinct, testable policies rather than identical random clickers.