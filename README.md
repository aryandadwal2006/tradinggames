# Trading Games

A local-first practice suite for trading, probability, estimation, mental arithmetic, and market-making exercises.

## Development

Install dependencies, run the development server with npm run dev, and validate changes with npm run typecheck, npm test, and npm run build.

## Current scope

The catalog covers all nine formats in the supplied materials. Fruit Market, Fermi Questions, Make Me a Market, Next Card Betting (higher/lower mode), Probability Betting, and Math Challenge are playable. Other modules remain marked in development until their state transitions and settlement can be specified and tested. Fruit Market exposes its custom quote-generation assumptions; Fermi reports transparent factor-error calibration rather than an invented replica of the original game's unpublished point curve; Make Me a Market displays its local spread-cap and counterparty assumptions; Next Card shows exact unseen-deck probabilities and a half-Kelly guide.

## Deployment

This is a static Vite application. For Cloudflare Pages, use npm run build as the build command and dist as the output directory. No backend or API keys are required for the current version. Session statistics are saved in the browser on the device running the app.

## Verification

The GitHub Actions workflow checks TypeScript, runs deterministic unit tests for each practice engine, and produces a production Vite build on pushes and pull requests. The Next Card tests cover deck reproducibility, configurable aces and suits, exact odds, Kelly sizing, win/loss/push settlement, and bankroll constraints.
