export interface KLineResult {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

type BinanceKline = [
  number,  // Open time
  string,  // Open
  string,  // High
  string,  // Low
  string,  // Close
  string,  // Volume
  number,  // Close time
  string,  // Quote asset volume
  number,  // Number of trades
  string,  // Taker buy base asset volume
  string,  // Taker buy quote asset volume
  string   // Ignore
];

// Binance public data endpoint — CORS-enabled, no API key required
// api.binance.com blocks browser requests (CORS); data-api.binance.vision is the public mirror
const BINANCE_BASE = 'https://data-api.binance.vision';

export async function fetchHistoricalData(
  symbol: string,
  interval: string,
  limit: number = 1000
): Promise<KLineResult[]> {
  const url = `${BINANCE_BASE}/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000);

  try {
    const response = await fetch(url, { signal: controller.signal });

    if (!response.ok) {
      throw new Error(`Binance API error: ${response.status} ${response.statusText}`);
    }

    const data: BinanceKline[] = await response.json();

    if (!Array.isArray(data)) {
      throw new Error('Binance API returned unexpected data format');
    }

    return data.map((item) => ({
      timestamp: item[0],
      open: parseFloat(item[1]),
      high: parseFloat(item[2]),
      low: parseFloat(item[3]),
      close: parseFloat(item[4]),
      volume: parseFloat(item[5])
    }));
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new Error('Request timed out after 15 seconds', { cause: error });
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}