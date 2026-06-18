import { useEffect, useRef, useState } from 'react';
import { init, dispose, registerIndicator, LineType, CandleType } from 'klinecharts';
import type { Chart } from 'klinecharts';
import { fetchHistoricalData, DATA_SOURCES } from '../utils/marketData';
import type { DataSource } from '../utils/marketData';
import { rainbowMaIndicator } from '../indicators/rainbowMa';
import { cdcActionZoneIndicator } from '../indicators/cdcActionZone';

// Register our custom indicators globally
registerIndicator(rainbowMaIndicator);
registerIndicator(cdcActionZoneIndicator);

const SYMBOLS = [
  { value: 'BTCUSDT', label: 'BTC/USDT' },
  { value: 'ETHUSDT', label: 'ETH/USDT' },
  { value: 'SOLUSDT', label: 'SOL/USDT' },
  { value: 'BNBUSDT', label: 'BNB/USDT' },
  { value: 'XRPUSDT', label: 'XRP/USDT' },
  { value: 'ADAUSDT', label: 'ADA/USDT' },
  { value: 'DOGEUSDT', label: 'DOGE/USDT' },
  { value: 'AVAXUSDT', label: 'AVAX/USDT' },
  { value: 'RVNUSDT', label: 'RVN/USDT' },
];

const INTERVALS = [
  { value: '1m', label: '1m' },
  { value: '5m', label: '5m' },
  { value: '15m', label: '15m' },
  { value: '1h', label: '1h' },
  { value: '4h', label: '4h' },
  { value: '1d', label: '1D' },
  { value: '1w', label: '1W' },
];

const selectClass = "bg-[#1E222D] text-white px-3 py-1.5 rounded border border-[#333843] focus:outline-none text-sm font-medium cursor-pointer";

export default function MarketChart() {
  const chartRef = useRef<HTMLDivElement>(null);
  const chartInstance = useRef<Chart | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [symbol, setSymbol] = useState('BTCUSDT');
  const [timeInterval, setTimeInterval] = useState('1d');
  const [source, setSource] = useState<DataSource>('binance');

  useEffect(() => {
    if (!chartRef.current) return;

    const chart = init(chartRef.current, {
      styles: {
        grid: { show: true, horizontal: { color: '#1E222D', size: 1, style: LineType.Dashed }, vertical: { color: '#1E222D', size: 1, style: LineType.Dashed } },
        candle: {
          type: CandleType.CandleSolid,
          bar: {
            upColor: '#26A69A',
            downColor: '#EF5350',
            noChangeColor: '#888888',
            upBorderColor: '#26A69A',
            downBorderColor: '#EF5350',
            noChangeBorderColor: '#888888',
            upWickColor: '#26A69A',
            downWickColor: '#EF5350',
            noChangeWickColor: '#888888'
          }
        },
        xAxis: { axisLine: { color: '#333843' }, tickLine: { color: '#333843' }, tickText: { color: '#888888' } },
        yAxis: { axisLine: { color: '#333843' }, tickLine: { color: '#333843' }, tickText: { color: '#888888' } }
      }
    });

    chartInstance.current = chart;

    if (chart) {
      chart.createIndicator('RainbowMA', true);
      chart.createIndicator('CDCActionZone', false, { id: 'cdc_pane', height: 120 });
    }

    const container = chartRef.current;
    return () => {
      if (container) {
        dispose(container);
      }
      chartInstance.current = null;
    };
  }, []);

  useEffect(() => {
    const loadData = async () => {
      if (!chartInstance.current) return;
      setLoading(true);
      setError(null);
      try {
        const data = await fetchHistoricalData(source, symbol, timeInterval, 1000);
        chartInstance.current.applyNewData(data);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to load chart data';
        console.error(message, err);
        setError(message);
      } finally {
        setLoading(false);
      }
    };

    const debounceTimer = setTimeout(loadData, 400);
    return () => clearTimeout(debounceTimer);
  }, [source, symbol, timeInterval]);

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <div className="absolute top-4 left-4 z-10 flex gap-2 flex-wrap">
        <select
          className={selectClass}
          value={source}
          onChange={e => setSource(e.target.value as DataSource)}
          aria-label="Select data source"
        >
          {DATA_SOURCES.map(s => (
            <option key={s.value} value={s.value}>{s.label}</option>
          ))}
        </select>

        <select
          className={selectClass}
          value={symbol}
          onChange={e => setSymbol(e.target.value)}
          aria-label="Select trading pair"
        >
          {SYMBOLS.map(s => (
            <option key={s.value} value={s.value}>{s.label}</option>
          ))}
        </select>

        <select
          className={selectClass}
          value={timeInterval}
          onChange={e => setTimeInterval(e.target.value)}
          aria-label="Select timeframe"
        >
          {INTERVALS.map(t => (
            <option key={t.value} value={t.value}>{t.label}</option>
          ))}
        </select>
      </div>

      {loading && (
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#888', zIndex: 5, background: 'rgba(19, 23, 34, 0.7)' }}>
          <div className="flex flex-col items-center gap-3">
            <div className="animate-spin h-8 w-8 border-4 border-[#2962FF] border-t-transparent rounded-full"></div>
            <span>Loading Data...</span>
          </div>
        </div>
      )}

      {error && !loading && (
        <div style={{ position: 'absolute', top: 60, left: '50%', transform: 'translateX(-50%)', zIndex: 5, background: 'rgba(239, 83, 80, 0.15)', border: '1px solid #EF5350', borderRadius: 8, padding: '12px 20px', color: '#EF5350', fontSize: 14, maxWidth: 400, textAlign: 'center' }}>
          {error}
        </div>
      )}

      <div ref={chartRef} style={{ width: '100%', height: '100%' }} />
    </div>
  );
}