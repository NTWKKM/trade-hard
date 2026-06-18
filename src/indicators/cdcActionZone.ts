import type { KLineData } from 'klinecharts';

export function calculateEma(dataList: KLineData[], period: number) {
  const result: (number | null)[] = [];
  const k = 2 / (period + 1);
  let ema: number | null = null;
  for (let i = 0; i < dataList.length; i++) {
    const val = dataList[i].close;
    if (i === 0) {
      ema = val;
    } else if (ema !== null) {
      ema = val * k + ema * (1 - k);
    }
    result.push(ema);
  }
  return result;
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
      styles: ({ current }: any) => {
        const data = current?.indicatorData;
        if (!data) return {};
        
        let color = 'rgba(0,0,0,0)';
        if (data.color === 'Green') color = '#00E676';
        else if (data.color === 'Blue') color = '#2962FF';
        else if (data.color === 'LBlue') color = '#00B0FF';
        else if (data.color === 'Red') color = '#FF5252';
        else if (data.color === 'Orange') color = '#FF9100';
        else if (data.color === 'Yellow') color = '#FFEB3B';
        
        return { color };
      }
    }
  ],
  createTooltipDataSource: ({ indicator }: any) => {
    return {
      name: indicator.name,
      calcParamsText: '',
      icons: [],
      values: []
    };
  },
  calc: (dataList: KLineData[], indicator: any) => {
    const { calcParams } = indicator;
    const fastPeriod = Number(calcParams[0]);
    const slowPeriod = Number(calcParams[1]);

    const fastEma = calculateEma(dataList, fastPeriod);
    const slowEma = calculateEma(dataList, slowPeriod);

    return dataList.map((kLineData, i) => {
      const xPrice = kLineData.close;
      const fEma = fastEma[i];
      const sEma = slowEma[i];

      if (fEma === null || sEma === null) {
        return { signal: 0, color: 'Black' };
      }

      const Bull = fEma > sEma;
      const Bear = fEma < sEma;

      let color = 'Black';
      if (Bull && xPrice > fEma) color = 'Green';
      else if (Bear && xPrice > fEma && xPrice > sEma) color = 'Blue';
      else if (Bear && xPrice > fEma && xPrice < sEma) color = 'LBlue';
      else if (Bear && xPrice < fEma) color = 'Red';
      else if (Bull && xPrice < fEma && xPrice < sEma) color = 'Orange';
      else if (Bull && xPrice < fEma && xPrice > sEma) color = 'Yellow';

      return { signal: 1, color };
    });
  }
};
