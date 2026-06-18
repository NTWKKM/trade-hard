export interface KLineResult {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export type DataSource = 'binance' | 'binance_us' | 'kraken';

export const DATA_SOURCES: { value: DataSource; label: string }[] = [
  { value: 'binance', label: 'Binance' },
  { value: 'binance_us', label: 'Binance US' },
  { value: 'kraken', label: 'Kraken' },
];

// Binance kline format: [openTime, open, high, low, close, volume, closeTime, ...]
type BinanceKline = [number, string, string, string, string, string, number, string, number, string, string, string];

// Kraken symbol mapping (Kraken uses XBT instead of BTC, USD instead of USDT)
const KRAKEN_SYMBOL_MAP: Record<string, string> = {
  BTCUSDT: 'XBTUSD',
  ETHUSDT: 'ETHUSD',
  SOLUSDT: 'SOLUSD',
  BNBUSDT: 'BNBUSD',
  XRPUSDT: 'XRPUSD',
  ADAUSDT: 'ADAUSD',
  DOGEUSDT: 'XDGUSD',
  AVAXUSDT: 'AVAXUSD',
  RVNUSDT: 'RVNUSD',
};

// Map our interval strings to each exchange's format
function mapIntervalBinance(interval: string): string {
  return interval; // already in Binance format (1m, 5m, 15m, 1h, 4h, 1d, 1w)
}

function mapIntervalKraken(interval: string): number {
  const map: Record<string, number> = {
    '1m': 1,
    '5m': 5,
    '15m': 15,
    '1h': 60,
    '4h': 240,
    '1d': 1440,
    '1w': 10080,
  };
  return map[interval] ?? 1440;
}

// Simple in-memory cache for fetched data
const dataCache = new Map<string, { data: KLineResult[]; timestamp: number }>();
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

async function fetchBinance(base: string, symbol: string, interval: string, limit: number): Promise<KLineResult[]> {
  const bi = mapIntervalBinance(interval);
  const url = `${base}/api/v3/klines?symbol=${symbol}&interval=${bi}&limit=${limit}`;
  
  // Check cache first
  const cacheKey = `binance:${base}:${symbol}:${interval}:${limit}`;
  const cached = dataCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
    return cached.data;
  }
  
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout
  
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) throw new Error(`Binance API error: ${response.status} ${response.statusText}`);
    const data: BinanceKline[] = await response.json();
    if (!Array.isArray(data)) throw new Error('Binance API returned unexpected data format');
    
    const result = data.map((item) => ({
      timestamp: item[0],
      open: parseFloat(item[1]),
      high: parseFloat(item[2]),
      low: parseFloat(item[3]),
      close: parseFloat(item[4]),
      volume: parseFloat(item[5]),
    }));
    
    // Cache the result
    dataCache.set(cacheKey, { data: result, timestamp: Date.now() });
    
    return result;
  } finally {
    clearTimeout(timeoutId);
  }
}

interface KrakenResponse {
  result: Record<string, [number, string, string, string, string, string, string, number][]>;
}

async function fetchKraken(symbol: string, interval: string, limit: number): Promise<KLineResult[]> {
  const krakenSymbol = KRAKEN_SYMBOL_MAP[symbol] ?? symbol.replace('USDT', 'USD');
  const krakenInterval = mapIntervalKraken(interval);
  // Kraken returns up to 720 candles per request
  const url = `https://api.kraken.com/0/public/OHLC?pair=${krakenSymbol}&interval=${krakenInterval}`;
  
  // Check cache first
  const cacheKey = `kraken:${symbol}:${interval}:${limit}`;
  const cached = dataCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
    return cached.data;
  }
  
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout
  
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) throw new Error(`Kraken API error: ${response.status} ${response.statusText}`);
    const data: KrakenResponse = await response.json();
    const pairKey = Object.keys(data.result).find(k => k !== 'last');
    if (!pairKey) throw new Error('Kraken API returned no data');
    const candles = data.result[pairKey];
    // Kraken timestamps are in seconds, convert to ms; sort ascending; take last `limit`
    const result = candles
      .map((c) => ({
        timestamp: c[0] * 1000,
        open: parseFloat(c[1]),
        high: parseFloat(c[2]),
        low: parseFloat(c[3]),
        close: parseFloat(c[4]),
        volume: parseFloat(c[6]),
      }))
      .sort((a, b) => a.timestamp - b.timestamp)
      .slice(-limit);
      
    // Cache the result
    dataCache.set(cacheKey, { data: result, timestamp: Date.now() });
    
    return result;
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function fetchHistoricalData(
  source: DataSource,
  symbol: string,
  interval: string,
  limit: number = 1000
): Promise<KLineResult[]> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000);

  try {
    let result: KLineResult[];
    switch (source) {
      case 'binance':
        result = await fetchBinance('https://data-api.binance.vision', symbol, interval, limit);
        break;
      case 'binance_us':
        result = await fetchBinance('https://api.binance.us', symbol, interval, limit);
        break;
      case 'kraken':
        result = await fetchKraken(symbol, interval, limit);
        break;
      default:
        throw new Error(`Unknown data source: ${source}`);
    }
    return result;
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new Error('Request timed out after 15 seconds', { cause: error });
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

// Function to clear the cache (useful for testing or when data needs to be refreshed)
export function clearDataCache() {
  dataCache.clear();
}