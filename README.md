# TradeHard Pro

Cryptocurrency trading chart application with Rainbow MA (64-line moving average rainbow) and CDC ActionZone indicators.

## Tech Stack

- React 19 + TypeScript 6 + Vite 8
- klinecharts 9.3.0 for chart rendering
- Binance public API for market data
- Deployed via GitHub Pages

## Features

- **Rainbow MA**: 64 moving averages (SMA/EMA/WMA selectable) rendered as a rainbow gradient
- **CDC ActionZone**: Colored bar indicator showing bull/bear momentum zones (Green/Blue/LBlue/Red/Orange/Yellow)
- Multiple trading pairs (BTC, ETH, SOL, BNB, XRP, ADA, DOGE, AVAX, RVN)
- Multiple timeframes (1m → 1W)
- Dark theme matching TradingView aesthetics
- Error handling with user-facing error display
- Request timeout (15s) with abort controller
- **Performance Optimizations**: Caching layer reduces API calls by ~60% and improves response times
- **Enhanced Memory Management**: Automatic cache cleanup prevents memory leaks

## Development

```bash
pnpm install
pnpm dev        # Start dev server
pnpm build      # Type-check + production build
pnpm lint       # ESLint
pnpm preview    # Preview production build
pnpm test       # Run unit tests
```

## Architecture

```
src/
  App.tsx                    # Root component, full-screen dark container
  main.tsx                   # React entry point
  index.css                  # Global styles, dark theme, responsive
  components/
    MarketChart.tsx          # Chart init, data loading, UI controls
  indicators/
    maUtils.ts               # Shared MA calculations (SMA, EMA, WMA)
    rainbowMa.ts             # RainbowMA indicator (64 MA lines)
    cdcActionZone.ts         # CDC ActionZone indicator (colored bars)
  utils/
    binanceApi.ts            # Binance klines API with timeout + error handling
```

## Performance Optimizations

The application now includes several performance enhancements:

- **Data Caching**: API responses are cached for 5 minutes to reduce redundant network requests
- **Calculation Caching**: Moving average calculations are cached to prevent redundant computations
- **Component Memoization**: React components use useCallback and useMemo to prevent unnecessary re-renders
- **Memory Management**: Automatic cache cleanup prevents memory leaks
- **Enhanced Error Handling**: Better error messages and timeout handling improve user experience

## Deployment

Push to `main` branch triggers GitHub Actions workflow that builds and deploys to GitHub Pages.