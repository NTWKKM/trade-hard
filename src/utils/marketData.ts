export interface KLineResult {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface Ticker24hrResult {
  symbol: string;
  lastPrice: string;
  priceChange: string;
  priceChangePercent: string;
  highPrice: string;
  lowPrice: string;
  volume: string;
  quoteVolume: string;
}

// Binance kline format: [openTime, open, high, low, close, volume, closeTime, ...]
type BinanceKline = [number, string, string, string, string, string, number, string, number, string, string, string];

async function fetchBinanceUiKlines(symbol: string, interval: string, limit: number, signal: AbortSignal): Promise<KLineResult[]> {
  const url = `https://api.binance.com/api/v3/uiKlines?symbol=${symbol}&interval=${interval}&limit=${limit}`;
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error(`Binance API error: ${response.status} ${response.statusText}`);
  const data: BinanceKline[] = await response.json();
  if (!Array.isArray(data)) throw new Error('Binance API returned unexpected data format');
  return data.map((item) => ({
    timestamp: item[0],
    open: parseFloat(item[1]),
    high: parseFloat(item[2]),
    low: parseFloat(item[3]),
    close: parseFloat(item[4]),
    volume: parseFloat(item[5]),
  }));
}

export async function fetch24hrTicker(symbol: string): Promise<Ticker24hrResult> {
  const url = `https://api.binance.com/api/v3/ticker/24hr?symbol=${symbol}`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Binance API error: ${response.status} ${response.statusText}`);
  const data: Ticker24hrResult = await response.json();
  return data;
}

export async function fetchHistoricalData(
  symbol: string,
  interval: string,
  limit: number = 1000
): Promise<KLineResult[]> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000);

  try {
    // Pass signal so the 15s timeout actually cancels the in-flight request.
    return await fetchBinanceUiKlines(symbol, interval, limit, controller.signal);
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new Error('Request timed out after 15 seconds', { cause: error });
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}