# ARCHITECTURE.md

## Core Components

- **MarketChart.tsx** — Main chart component. Initializes klinecharts, manages data loading lifecycle, renders UI controls (data source/symbol/timeframe selectors, loading/error overlays). — Depends on: klinecharts, marketData, rainbowMa, cdcActionZone
- **marketData.ts** — Multi-source market data client. Supports Binance (data-api.binance.vision), Binance US (api.binance.us), Kraken (api.kraken.com). Each adapter normalizes to KLineResult[]. 15s timeout via AbortController. — Depends on: fetch API
- **rainbowMa.ts** — RainbowMA indicator. Calculates 64 moving averages (SMA/EMA/WMA) and renders as colored lines. Registered globally via `registerIndicator()`. — Depends on: maUtils, klinecharts
- **cdcActionZone.ts** — CDC ActionZone indicator. Calculates fast/slow EMA crossover and renders colored bars (6 colors + default). Signal magnitude = EMA delta. — Depends on: maUtils, klinecharts
- **maUtils.ts** — Shared moving average calculations (SMA, EMA, WMA). Single source of truth for MA math. — Depends on: klinecharts types

## Data Flow

1. User selects data source + symbol + timeframe → `setSource()` / `setSymbol()` / `setTimeInterval()` → triggers `useEffect` re-run (debounced 400ms)
2. `fetchHistoricalData(source, symbol, interval, 1000)` → routes to appropriate exchange adapter → 15s timeout → typed `KLineResult[]`
3. `chart.applyNewData(data)` → klinecharts triggers indicator `calc()` → RainbowMA computes 64 MAs, CDCActionZone computes EMA crossover → chart renders

## Warnings & Gotchas

- **klinecharts `init()` can return null** — Must null-check before calling `chart.createIndicator()`. Code handles this with `if (chart)` guard.
- **`registerIndicator()` is global** — Called at module top-level in MarketChart.tsx. Registers once per page load. Calling again with same name is a no-op.
- **Multi-source data fetching** — Only 3 exchanges have CORS enabled for browser requests: Binance (data-api.binance.vision), Binance US (api.binance.us), Kraken (api.kraken.com). Coinbase, OKX, Bybit, KuCoin all block browser fetch. User can switch source via dropdown.
- **Kraken symbol mapping** — Kraken uses different symbol names (XBTUSD instead of BTCUSDT, XDGUSD instead of DOGEUSDT). Mapped via KRAKEN_SYMBOL_MAP.
- **Kraken candle limit** — Kraken returns up to 720 candles per request (vs Binance 1000). Data is sliced to requested limit after sorting ascending.
- **`timeInterval` naming** — State variable is `timeInterval` (not `interval`) to avoid shadowing `window.setInterval`. The state setter is `setTimeInterval`.
- **Cleanup ref capture** — `chartRef.current` is captured into a local `container` variable inside the cleanup function to avoid stale ref after React unmount (React 19 StrictMode double-invokes effects in dev).
- **CDCActionZone `signal` value** — Represents the raw delta between fast and slow EMA, not a fixed constant. Bars scale proportionally to momentum strength.
- **Dead code removed** — App.css, assets/ (vite.svg, react.svg, hero.png) were Vite template defaults and have been deleted.
- **CI uses pnpm v9** — `pnpm/action-setup@v3` with `version: 9` in deploy.yml. Lockfile version 9.0. CI runs tests before build.
- **Unit tests** — `maUtils.test.ts` covers SMA/EMA/WMA with edge cases (empty array, period=1, period > data length). Run via `pnpm test`.