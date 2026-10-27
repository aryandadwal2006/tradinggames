# Trading Games

A local-first practice suite for trading, probability, estimation, mental arithmetic, and market-making exercises.

## Development

Install dependencies, run the development server with npm run dev, and validate changes with npm run typecheck, npm test, and npm run build.

## Current scope

All nine catalog formats are playable as local single-player practice modules, including Market of Cards with bot counterparties and The Marble Olympics with a live simulated final, a stale-quote window after goals, rotating side bets, settlement, and a replay timeline. Where the supplied rules leave exact parameters unspecified, the interfaces label their local practice assumptions instead of claiming an exact replica. Fruit Market exposes custom quote-generation assumptions; Fermi uses transparent factor-error calibration rather than claiming to reproduce unpublished point scoring; Make Me a Market displays its local spread cap and counterparty assumptions; Next Card provides exact unseen-deck probabilities and a half-Kelly guide.

## Deployment

This is a static Vite application. For Cloudflare Pages, use npm run build as the build command and dist as the output directory. No backend or API keys are required for the current version. Session statistics are saved in the browser on the device running the app.

## Verification

The GitHub Actions workflow checks TypeScript, runs deterministic unit tests for each practice engine, and produces a production Vite build on pushes and pull requests. The Next Card tests cover deck reproducibility, configurable aces and suits, exact odds, Kelly sizing, win/loss/push settlement, and bankroll constraints. ETF tests cover executable basket pricing, normal price updates, post-trade resets, and differentiated bot policies. Probability Betting tests also sample every event type in deterministic batches and check the observed rate against its enumerated probability.
