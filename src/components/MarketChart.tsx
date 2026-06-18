import { useEffect, useRef, useState } from 'react';
import { init, dispose, registerIndicator, LineType, CandleType } from 'klinecharts';
import { fetchHistoricalData } from '../utils/binanceApi';
import { rainbowMaIndicator } from '../indicators/rainbowMa';

// Register our custom indicator globally
registerIndicator(rainbowMaIndicator);

export default function MarketChart() {
  const chartRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(true);

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

    // 2. Fetch Data
    const loadData = async () => {
      try {
        const data = await fetchHistoricalData('BTCUSDT', '1d', 1000);
        chart?.applyNewData(data);
        
        // 3. Add Custom Indicator to the main candle pane
        chart?.createIndicator('RainbowMA', false, { id: 'candle_pane' });
      } catch (error) {
        console.error("Failed to load chart data", error);
      } finally {
        setLoading(false);
      }
    };

    loadData();

    // 4. Cleanup
    return () => {
      dispose(chartRef.current!);
    };
  }, []);

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      {loading && (
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#888', zIndex: 10, background: 'rgba(21, 24, 34, 0.8)' }}>
          <div className="flex flex-col items-center gap-3">
            <div className="animate-spin h-8 w-8 border-4 border-blue-500 border-t-transparent rounded-full"></div>
            <span>Loading Market Data...</span>
          </div>
        </div>
      )}
      <div ref={chartRef} style={{ width: '100%', height: '100%' }} />
    </div>
  );
}
