import type { KLineData, Indicator, IndicatorCreateTooltipDataSourceParams } from 'klinecharts';
import { calculateEma } from './maUtils';

type CdcColor = 'Black' | 'Green' | 'Blue' | 'LBlue' | 'Red' | 'Orange' | 'Yellow';

interface CdcData {
  signal: number;
  color: CdcColor;
}

const COLOR_MAP: Record<CdcColor, string> = {
  Black: 'rgba(136, 136, 136, 0.3)',
  Green: '#00E676',
  Blue: '#2962FF',
  LBlue: '#00B0FF',
  Red: '#FF5252',
  Orange: '#FF9100',
  Yellow: '#FFEB3B',
};

// Cache for EMA calculations
const emaCache = new Map<string, (number | null)[]>();
const MAX_CACHE_SIZE = 50;

export function clearCdcCache() {
  emaCache.clear();
}

function getCachedEma(cacheKey: string): (number | null)[] | undefined {
  return emaCache.get(cacheKey);
}

function setCachedEma(cacheKey: string, data: (number | null)[]): void {
  emaCache.set(cacheKey, data);
  // Limit cache size
  if (emaCache.size > MAX_CACHE_SIZE) {
    const firstKey = emaCache.keys().next().value;
    if (firstKey) {
      emaCache.delete(firstKey);
    }
  }
}

export const cdcActionZoneIndicator = {
  name: 'CDCActionZone',
  shortName: 'CDC ActionZone',
  calcParams: [12, 26],
  figures: [
    {
      key: 'signal',
      title: 'ActionZone',
      type: 'bar',
      baseValue: 0,
      styles: ({ current }: { current: { indicatorData?: CdcData } }) => {
        const data = current?.indicatorData;
        if (!data) return {};
        return { color: COLOR_MAP[data.color] ?? COLOR_MAP.Black };
      }
    }
  ],
  createTooltipDataSource: ({ indicator }: IndicatorCreateTooltipDataSourceParams<CdcData>) => {
    return {
      name: indicator.name,
      calcParamsText: '',
      icons: [],
      values: []
    };
  },
  calc: (dataList: KLineData[], indicator: Indicator<CdcData>): CdcData[] => {
    const { calcParams } = indicator;
    const fastPeriod = Number(calcParams[0]);
    const slowPeriod = Number(calcParams[1]);

    // Create cache keys based on data hash + indicator name (encodes symbol)
    const symbolKey = indicator.name || 'default';
    const dataHash = dataList.length > 0 ? 
      `${dataList[0].timestamp}-${dataList[dataList.length - 1].timestamp}-${dataList.length}` : 
      'empty';
    
    const fastCacheKey = `${symbolKey}-fast-${dataHash}-${fastPeriod}`;
    const slowCacheKey = `${symbolKey}-slow-${dataHash}-${slowPeriod}`;

    // Try to get from cache first
    let fastEma = getCachedEma(fastCacheKey);
    let slowEma = getCachedEma(slowCacheKey);

    // Calculate if not in cache
    if (!fastEma) {
      fastEma = calculateEma(dataList, fastPeriod);
      setCachedEma(fastCacheKey, fastEma);
    }

    if (!slowEma) {
      slowEma = calculateEma(dataList, slowPeriod);
      setCachedEma(slowCacheKey, slowEma);
    }

    return dataList.map((kLineData, i) => {
      const xPrice = kLineData.close;
      const fEma = fastEma![i];
      const sEma = slowEma![i];

      if (fEma === null || sEma === null) {
        return { signal: 0, color: 'Black' as CdcColor };
      }

      const Bull = fEma > sEma;
      const Bear = fEma < sEma;

      let color: CdcColor = 'Black';
      if (Bull && xPrice > fEma) color = 'Green';
      else if (Bear && xPrice > fEma && xPrice > sEma) color = 'Blue';
      else if (Bear && xPrice > fEma && xPrice < sEma) color = 'LBlue';
      else if (Bear && xPrice < fEma) color = 'Red';
      else if (Bull && xPrice < fEma && xPrice < sEma) color = 'Orange';
      else if (Bull && xPrice < fEma && xPrice > sEma) color = 'Yellow';

      // Signal magnitude: distance between fast and slow EMA (normalized)
      const signal = fEma !== null && sEma !== null ? fEma - sEma : 0;

      return { signal, color };
    });
  }
};