# ARCHITECTURE.md

## Core Components
- `MarketChart.tsx` — Main chart component. Pure custom Canvas2D renderer. Manages data loading, WebSocket real-time stream, indicator calculation, DOM caching, rAF-throttled rendering, offscreen OffscreenCanvas rainbow-MA cache, searchable symbol dropdown, retry button. Depends on: marketData, rainbowMa, cdcActionZone.optimized
- `marketData.ts` — Single-source market data client. Fetches UI-optimized klines, 24hr ticker, and exchangeInfo symbol list from Binance Global. AbortController signal wired to inner fetch for reliable 15s timeout on klines and ticker. In-memory symbol cache (fetched once per session). Depends on: fetch API
- `rainbowMa.ts` — RainbowMA indicator. Calculates 64 SMA/EMA/WMA lines and returns data for rendering. Depends on: maUtils, klinecharts types
- `cdcActionZone.optimized.ts` — CDC ActionZone indicator. EMA crossover with 7-color classification and in-memory EMA cache keyed by symbol + data hash. Exports `clearCdcCache()` for symbol-change invalidation. Depends on: maUtils, klinecharts types
- `maUtils.ts` — Shared MA calculations (SMA, EMA, WMA) using (number|null)[] output. Used by indicator modules. Depends on: klinecharts types

## Data Flow
- `UI Controls (symbol search / timeframe / chart type) → load() or render() (sync)`
- `load() → fetchHistoricalData (Binance uiKlines, AbortController 15s) → KLineResult[] normalization → computeIndicators() → render() (async)`
- `load() → fetch24hrTicker (AbortController 15s, non-blocking) → updateTopBar() (async, parallel with render)`
- `load() → openWebSocket() (Binance combined stream: kline + ticker) → real-time bar updates / price badge updates (async, continuous)`
- `KLineResult[] → computeIndicators() → IndState (Float64Array MACD/RSI + RainbowMA + CDC) (sync)`
- `IndState → render() via scheduleRender() rAF gate → Canvas2D paint (async, 60fps coalesced)`
- `Rainbow MA → OffscreenCanvas cache (invalidated on view/data change) → drawImage() on main canvas (sync)`
- `App init → fetchTradingSymbols() (Binance exchangeInfo, USDT pairs, status=TRADING) → in-memory cache → searchable dropdown`

## Clinical/System Warnings
- **rAF throttle**: All render calls go through `scheduleRender()` → `requestAnimationFrame`. Multiple events per frame (mousemove, wheel) coalesce into one paint. Do NOT call `render()` directly from event handlers — always use `scheduleRender()`.
- **Rainbow cache invalidation**: Call `invalidateRainbowCache()` whenever `viewStart`, `viewBars`, or `bars` changes. Missing an invalidation call = stale rainbow lines displayed on correct candles.
- **DOM element caching**: All `querySelector` calls happen once at `useEffect` init. Elements stored in elO/elH/elL/elC/elV/elChg/elPrice/elBadge/elStSym/elStBars/symSearch/symDropdown/retryBtnEl. Do NOT add new per-frame querySelector calls.
- **AbortController pattern**: `fetchHistoricalData` and `fetch24hrTicker` each create their own controller → pass `signal` to `fetch()`. Both honour a 15s timeout. Ticker failure is non-blocking — chart renders regardless.
- **WebSocket lifecycle**: `openWebSocket()` is called after successful historical data load. `closeWebSocket()` must be called on symbol change, timeframe change, and component unmount. The combined stream URL is `wss://stream.binance.com:9443/stream?streams={symbol}@kline_{tf}/{symbol}@ticker`.
- **CDC cache invalidation**: `clearCdcCache()` must be called when symbol changes. The cache key includes `indicator.name` which encodes the symbol (e.g. `CDCActionZone-BTCUSDT`). Without clearing, stale EMA values from a previous symbol could be reused if timestamps collide.
- **klinecharts types-only**: `klinecharts@9.3.0` is used exclusively for TypeScript types (`KLineData`, `Indicator`, `LineType`). No runtime klinecharts APIs are called. The chart is 100% custom Canvas2D.
- **Float64Array vs (number|null)[]**: Inlined EMA/MACD/RSI in MarketChart.tsx use `Float64Array` for ~2x throughput on 300+ bar datasets. `maUtils.ts` uses `(number|null)[]` for indicator modules. Do not merge — they serve different contexts.
- **Symbol search**: `fetchTradingSymbols()` caches results in a module-level variable. The dropdown filters client-side from this cache. If the fetch fails, the user can still type a symbol manually and press Enter. Favorites are persisted in `localStorage` key `trade-hard-favs` and shown at the top of the dropdown with a ★ header. A star button next to the search input toggles the current symbol as favorite.
- **System font stack**: No external font dependency. `index.css` uses `-apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif`. The `@import url('https://fonts.googleapis.com...')` line was removed to eliminate the external dependency.