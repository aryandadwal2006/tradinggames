# Trading Games

A local-first practice suite for trading, probability, estimation, mental arithmetic, and market-making exercises.

## Development

Install dependencies, run the development server with npm run dev, and validate changes with npm run typecheck, npm test, and npm run build.

## Current scope

The catalog covers the nine practice formats in the supplied materials. Math Challenge is the first playable module. The remaining modules are being added one by one only when their rules and settlement logic are sufficiently specified.

## Deployment

This is a static Vite application. For Cloudflare Pages, use npm run build as the build command and dist as the output directory. No backend or API keys are required for the current version. Session statistics are saved in the browser on the device running the app.
