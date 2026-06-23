# TradeHard Pro

Real-time cryptocurrency trading chart with custom Canvas2D rendering, Rainbow MA (64-line), and CDC ActionZone indicators.

## Tech Stack

- React 19 + TypeScript 6 + Vite 8
- klinecharts 9.3.0 — TypeScript types only (no runtime APIs)
- Binance public API — REST for historical data + WebSocket for real-time updates
- Deployed via GitHub Pages

## Features

- **Real-time updates**: WebSocket stream for live kline + ticker data
- **Rainbow MA**: 64 moving averages (SMA/EMA/WMA selectable) rendered as rainbow gradient
- **CDC ActionZone**: EMA crossover with 7-color bull/bear momentum classification
- **MACD + RSI**: Inlined Float64Array implementations for ~2x throughput
- **Searchable symbol dropdown**: Fetches all USDT spot pairs from Binance exchangeInfo
- **4 chart types**: Candle, Volume Candle, Line, Volume Line
- **7 timeframes**: 1m → 1W
- **Performance**: OffscreenCanvas rainbow cache, rAF-throttled rendering, DOM element caching
- **Error recovery**: Retry button on fetch failure
- **Dark theme**: TradingView-inspired, system font stack (no external font dependency)

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

See [ARCHITECTURE.md](./ARCHITECTURE.md) for full component reference, data flow, and system warnings.

```
src/
  App.tsx                              # Root component, full-screen dark container
  main.tsx                             # React entry point
  index.css                            # Global reset, system font stack
  components/
    MarketChart.tsx                    # Chart component: rendering, data loading, WebSocket, UI controls
    MarketChart.css                    # Chart component styles (tokens, topbar, subtoolbar, canvas, loader, statusbar)
  indicators/
    maUtils.ts                         # Shared MA calculations (SMA, EMA, WMA) — (number|null)[] output
    maUtils.test.ts                    # Unit tests for maUtils
    rainbowMa.ts                       # RainbowMA indicator (64 MA lines, configurable type)
    cdcActionZone.optimized.ts         # CDC ActionZone indicator (EMA crossover, 7-color, in-memory cache)
  utils/
    marketData.ts                      # Binance API client: klines, 24hr ticker, exchangeInfo symbol list
```

## Deployment

Push to `main` branch triggers GitHub Actions workflow that builds and deploys to GitHub Pages.