# ARCHITECTURE.md

## Core Components
- `[MarketChart.tsx—Main chart component. Initializes klinecharts, manages data loading lifecycle, renders UI controls—klinecharts, marketData, rainbowMa, cdcActionZone]`
- `[marketData.ts—Multi-source market data client. Supports Binance, Binance US, Kraken with normalization to KLineResult[]—fetch API]`
- `[rainbowMa.ts—RainbowMA indicator. Calculates 64 moving averages (SMA/EMA/WMA) and renders as colored lines—maUtils, klinecharts]`
- `[cdcActionZone.ts—CDC ActionZone indicator. Calculates fast/slow EMA crossover and renders colored bars—maUtils, klinecharts]`
- `[maUtils.ts—Shared moving average calculations (SMA, EMA, WMA). Single source of truth for MA math—klinecharts types]`

## Data Flow
- `[UI Controls→setSource/Symbol/TimeInterval→useEffect trigger (sync)]`
- `[fetchHistoricalData→Exchange API Normalization→KLineResult[] (sync)]`
- `[KLineResult[]→klinecharts applyNewData/calc→Chart UI Render (sync)]`

## Clinical/System Warnings
- **klinecharts Enum Issue (Fixed)**: Version 9.3.0 exposes `LineType` and `CandleType` as TypeScript `declare enum` only. Must import them as `import type` and cast string literals (e.g. `'solid' as LineType`) to prevent runtime crashes during chart init.
- **klinecharts init() nullability**: `init()` can return null. Must null-check before calling `chart.createIndicator()`. Code handles this with `if (chart)` guard.
- **Multi-source data fetching & CORS**: Only 3 exchanges have CORS enabled for browser requests: Binance (data-api.binance.vision), Binance US (api.binance.us), Kraken (api.kraken.com). User can switch source via dropdown.
- **Kraken constraints**: Kraken uses different symbol names (XBTUSD instead of BTCUSDT) mapped via KRAKEN_SYMBOL_MAP, and returns up to 720 candles per request (vs Binance 1000). Data must be sliced.
- **Cleanup ref capture**: `chartRef.current` must be captured into a local `container` variable inside the cleanup function to avoid stale ref after React unmount (React StrictMode double-invokes effects).
- **Global Indicator Registration**: `registerIndicator()` is called at module top-level in MarketChart.tsx. Registers once per page load.