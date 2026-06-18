# ARCHITECTURE.md

## Core Components

- **MarketChart.tsx** — Main chart component. Initializes klinecharts, manages data loading lifecycle, renders UI controls (symbol/timeframe selectors, loading/error overlays). — Depends on: klinecharts, binanceApi, rainbowMa, cdcActionZone
- **binanceApi.ts** — Binance public API client. Fetches klines with 15s timeout (AbortController), response validation, typed return. — Depends on: fetch API
- **rainbowMa.ts** — RainbowMA indicator. Calculates 64 moving averages (SMA/EMA/WMA) and renders as colored lines. Registered globally via `registerIndicator()`. — Depends on: maUtils, klinecharts
- **cdcActionZone.ts** — CDC ActionZone indicator. Calculates fast/slow EMA crossover and renders colored bars (6 colors + default). Signal magnitude = EMA delta. — Depends on: maUtils, klinecharts
- **maUtils.ts** — Shared moving average calculations (SMA, EMA, WMA). Single source of truth for MA math. — Depends on: klinecharts types

## Data Flow

1. User selects symbol + timeframe → `setSymbol()` / `setTimeInterval()` → triggers `useEffect` re-run
2. `fetchHistoricalData(symbol, interval, 1000)` → Binance REST API → AbortController timeout 15s → typed `KLineResult[]`
3. `chart.applyNewData(data)` → klinecharts triggers indicator `calc()` for all registered indicators → RainbowMA computes 64 MAs, CDCActionZone computes EMA crossover → chart renders

## Warnings & Gotchas

- **klinecharts `init()` can return null** — Must null-check before calling `chart.createIndicator()`. Code handles this with `if (chart)` guard.
- **`registerIndicator()` is global** — Called at module top-level in MarketChart.tsx. Registers once per page load. Calling again with same name is a no-op.
- **Binance API rate limits** — Client-side direct calls to `data-api.binance.vision` (Binance public data mirror, CORS-enabled). `api.binance.com` blocks browser fetch requests. Debounce (400ms) on symbol/timeframe switching reduces API calls. Consider server-side proxy for production rate limiting.
- **`timeInterval` naming** — State variable is `timeInterval` (not `interval`) to avoid shadowing `window.setInterval`. The state setter is `setTimeInterval`.
- **Cleanup ref capture** — `chartRef.current` is captured into a local `container` variable inside the cleanup function to avoid stale ref after React unmount (React 19 StrictMode double-invokes effects in dev).
- **CDCActionZone `signal` value** — Represents the raw delta between fast and slow EMA, not a fixed constant. Bars scale proportionally to momentum strength.
- **Dead code removed** — App.css, assets/ (vite.svg, react.svg, hero.png) were Vite template defaults and have been deleted.
- **CI uses pnpm v9** — `pnpm/action-setup@v3` with `version: 9` in deploy.yml. Lockfile version 9.0. CI runs tests before build.
- **Unit tests** — `maUtils.test.ts` covers SMA/EMA/WMA with edge cases (empty array, period=1, period > data length). Run via `pnpm test`.