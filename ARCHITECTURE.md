# ARCHITECTURE.md

## Core Components
- `[MarketChart.tsx—Main chart component. Initializes klinecharts, manages data loading lifecycle, renders UI controls—klinecharts, marketData, rainbowMa, cdcActionZone]`
- `[marketData.ts—Single-source market data client. Fetches UI-optimized klines and 24hr ticker data from Binance Global—fetch API]`
- `[rainbowMa.ts—RainbowMA indicator. Calculates 64 moving averages (SMA/EMA/WMA) and renders as colored lines—maUtils, klinecharts]`
- `[cdcActionZone.ts—CDC ActionZone indicator. Calculates fast/slow EMA crossover and renders colored bars—maUtils, klinecharts]`
- `[maUtils.ts—Shared moving average calculations (SMA, EMA, WMA). Single source of truth for MA math—klinecharts types]`

## Data Flow
- `[UI Controls→setSymbol/TimeInterval→useEffect trigger (sync)]`
- `[fetchHistoricalData & fetch24hrTicker→Binance API Normalization→KLineResult[] & Ticker24hrResult (sync)]`
- `[KLineResult[]→klinecharts applyNewData/calc→Chart UI Render (sync)]`
- `[Ticker24hrResult→MarketChart React State→Ticker UI Render (sync)]`

## Clinical/System Warnings
- **klinecharts Enum Issue (Fixed)**: Version 9.3.0 exposes `LineType` and `CandleType` as TypeScript `declare enum` only. Must import them as `import type` and cast string literals (e.g. `'solid' as LineType`) to prevent runtime crashes during chart init.
- **klinecharts init() nullability**: `init()` can return null. Must null-check before calling `chart.createIndicator()`. Code handles this with `if (chart)` guard.
- **Binance data fetching & CORS**: We rely on `data-api.binance.vision` (Binance Global) which has CORS enabled for browser requests. We use `/api/v3/uiKlines` for UI-optimized charting data.
- **Cleanup ref capture**: `chartRef.current` must be captured into a local `container` variable inside the cleanup function to avoid stale ref after React unmount (React StrictMode double-invokes effects).
- **Global Indicator Registration**: `registerIndicator()` is called at module top-level in MarketChart.tsx. Registers once per page load.