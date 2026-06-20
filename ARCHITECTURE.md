# ARCHITECTURE.md

## Core Components
- `[MarketChart.tsx—Main chart component. Pure custom Canvas2D renderer. Manages data loading, indicator calculation, DOM caching, rAF-throttled rendering, and offscreen OffscreenCanvas rainbow-MA cache—marketData, rainbowMa, cdcActionZone.optimized]`
- `[marketData.ts—Single-source market data client. Fetches UI-optimized klines and 24hr ticker data from Binance Global. AbortController signal wired to inner fetch for reliable 15s timeout—fetch API]`
- `[rainbowMa.ts—RainbowMA indicator. Calculates 64 SMA/EMA/WMA lines and returns data for rendering—maUtils, klinecharts types]`
- `[cdcActionZone.optimized.ts—CDC ActionZone indicator. EMA crossover with 7-color classification and in-memory EMA cache keyed by data hash—maUtils, klinecharts types]`
- `[maUtils.ts—Shared MA calculations (SMA, EMA, WMA) using (number|null)[] output. Used by indicator modules—klinecharts types]`

## Data Flow
- `[UI Controls→symbol/tf/chartType vars→load() or render() (sync)]`
- `[fetchHistoricalData→Binance uiKlines with AbortController signal→KLineResult[] normalization (async)]`
- `[KLineResult[]→computeIndicators()→IndState (Float64Array MACD/RSI + RainbowMA + CDC) (sync)]`
- `[IndState→render() via scheduleRender() rAF gate→Canvas2D paint (async, 60fps coalesced)]`
- `[Rainbow MA→OffscreenCanvas cache (invalidated on view/data change)→drawImage() on main canvas (sync)]`

## Clinical/System Warnings
- **rAF throttle**: All render calls go through `scheduleRender()` → `requestAnimationFrame`. Multiple events per frame (mousemove, wheel) coalesce into one paint. Do NOT call `render()` directly from event handlers — always use `scheduleRender()`.
- **Rainbow cache invalidation**: Call `invalidateRainbowCache()` whenever `viewStart`, `viewBars`, or `bars` changes. Missing an invalidation call = stale rainbow lines displayed on correct candles.
- **DOM element caching**: All `querySelector` calls happen once at `useEffect` init. Elements stored in `elO/elH/elL/elC/elV/elChg/elPrice/elBadge/elStSym/elStBars`. Do NOT add new per-frame querySelector calls.
- **AbortController pattern**: `fetchHistoricalData` creates controller → passes `signal` to `fetchBinanceUiKlines` → inner `fetch()`. Both the outer 15s timeout and the inner fetch honour the same signal.
- **klinecharts types-only**: `klinecharts@9.3.0` is used exclusively for TypeScript types (`KLineData`, `Indicator`, `LineType`). No runtime klinecharts APIs are called. The chart is 100% custom Canvas2D.
- **Float64Array vs (number|null)[]**: Inlined EMA/MACD/RSI in MarketChart.tsx use `Float64Array` for ~2× throughput on 300+ bar datasets. `maUtils.ts` uses `(number|null)[]` for indicator modules. Do not merge — they serve different contexts.
- **CSS keyframe scoping**: Spinner uses `chart-spin`, pulse uses `chart-pulse` (defined in MarketChart.css). The `spin`/`pulse` keyframes in `index.css` are kept for safety but are not referenced by current components.