import { useEffect, useRef, useState } from 'react';
import { init, dispose, registerIndicator, LineType, CandleType } from 'klinecharts';
import type { Chart } from 'klinecharts';
import { fetchHistoricalData } from '../utils/binanceApi';
import { rainbowMaIndicator } from '../indicators/rainbowMa';

// Register our custom indicator globally
registerIndicator(rainbowMaIndicator);

export default function MarketChart() {
  const chartRef = useRef<HTMLDivElement>(null);
  const chartInstance = useRef<Chart | null>(null);
  const [loading, setLoading] = useState(false);
  const [symbol, setSymbol] = useState('BTCUSDT');
  const [interval, setInterval] = useState('1d');

  useEffect(() => {
    if (!chartRef.current) return;

    // 1. Initialize Chart with dark theme
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
    
    // Add Custom Indicator to the main candle pane
    chart?.createIndicator('RainbowMA', false, { id: 'candle_pane' });

    // Cleanup
    return () => {
      if (chartRef.current) {
        dispose(chartRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const loadData = async () => {
      if (!chartInstance.current) return;
      setLoading(true);
      try {
        const data = await fetchHistoricalData(symbol, interval, 1000);
        chartInstance.current.applyNewData(data);
      } catch (error) {
        console.error("Failed to load chart data", error);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [symbol, interval]);

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <div className="absolute top-4 left-4 z-10 flex gap-2">
        <select 
          className="bg-[#1E222D] text-white px-3 py-1.5 rounded border border-[#333843] focus:outline-none text-sm font-medium cursor-pointer"
          value={symbol}
          onChange={e => setSymbol(e.target.value)}
        >
          <option value="BTCUSDT">BTC/USDT</option>
          <option value="RVNUSDT">RVN/USDT</option>
        </select>
        
        <select 
          className="bg-[#1E222D] text-white px-3 py-1.5 rounded border border-[#333843] focus:outline-none text-sm font-medium cursor-pointer"
          value={interval}
          onChange={e => setInterval(e.target.value)}
        >
          <option value="1m">1m</option>
          <option value="5m">5m</option>
          <option value="15m">15m</option>
          <option value="1h">1h</option>
          <option value="4h">4h</option>
          <option value="1d">1D</option>
          <option value="1w">1W</option>
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
      <div ref={chartRef} style={{ width: '100%', height: '100%' }} />
    </div>
  );
}
