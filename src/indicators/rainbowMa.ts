import type { KLineData } from 'klinecharts';
import { LineType } from 'klinecharts';

export function calculateSma(dataList: KLineData[], period: number) {
  const result: (number | null)[] = [];
  let sum = 0;
  for (let i = 0; i < dataList.length; i++) {
    const val = dataList[i].close;
    sum += val;
    if (i >= period - 1) {
      if (i >= period) {
        sum -= dataList[i - period].close;
      }
      result.push(sum / period);
    } else {
      result.push(null);
    }
  }
  return result;
}

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

export function calculateWma(dataList: KLineData[], period: number) {
  const result: (number | null)[] = [];
  const denominator = (period * (period + 1)) / 2;
  for (let i = 0; i < dataList.length; i++) {
    if (i >= period - 1) {
      let sum = 0;
      for (let j = 0; j < period; j++) {
        sum += dataList[i - j].close * (period - j);
      }
      result.push(sum / denominator);
    } else {
      result.push(null);
    }
  }
  return result;
}

const colors = [
  'rgba(255, 0, 0, 1)',      // sma1
  'rgba(255, 18, 0, 1)',     // sma2
  'rgba(255, 32, 0, 1)',     // sma3
  'rgba(255, 54, 0, 1)',     // sma4
  'rgba(255, 72, 0, 1)',     // sma5
  'rgba(255, 90, 0, 1)',     // sma6
  'rgba(255, 108, 0, 1)',    // sma7
  'rgba(255, 126, 0, 1)',    // sma8
  'rgba(255, 165, 0, 1)',    // sma9
  'rgba(255, 175, 0, 1)',    // sma10
  'rgba(255, 185, 0, 1)',    // sma11
  'rgba(255, 195, 0, 1)',    // sma12
  'rgba(255, 215, 0, 1)',    // sma13
  'rgba(255, 225, 0, 1)',    // sma14
  'rgba(255, 245, 0, 1)',    // sma15
  'rgba(255, 255, 0, 1)',    // sma16
  'rgba(227, 255, 0, 1)',    // sma17
  'rgba(199, 255, 0, 1)',    // sma18
  'rgba(171, 255, 0, 1)',    // sma19
  'rgba(143, 255, 0, 1)',    // sma20
  'rgba(115, 255, 0, 1)',    // sma21
  'rgba(87, 255, 0, 1)',     // sma22
  'rgba(59, 255, 0, 1)',     // sma23
  'rgba(31, 255, 0, 1)',     // sma24
  'rgba(0, 255, 0, 1)',      // sma25
  'rgba(0, 255, 51, 1)',     // sma26
  'rgba(0, 255, 153, 1)',    // sma27
  'rgba(0, 255, 204, 1)',    // sma28
  'rgba(0, 255, 255, 1)',    // sma29
  'rgba(0, 204, 255, 1)',    // sma30
  'rgba(0, 153, 255, 1)',    // sma31
  'rgba(0, 102, 255, 1)',    // sma32
  'rgba(0, 51, 255, 1)',     // sma33
  'rgba(0, 0, 255, 1)',      // sma34
  'rgba(8, 0, 255, 1)',      // sma35
  'rgba(16, 0, 255, 1)',     // sma36
  'rgba(24, 0, 255, 1)',     // sma37
  'rgba(32, 0, 255, 1)',     // sma38
  'rgba(40, 0, 255, 1)',     // sma39
  'rgba(48, 0, 255, 1)',     // sma40
  'rgba(56, 0, 255, 1)',     // sma41
  'rgba(64, 0, 255, 1)',     // sma42
  'rgba(72, 0, 255, 1)',     // sma43
  'rgba(80, 0, 255, 1)',     // sma44
  'rgba(88, 0, 255, 1)',     // sma45
  'rgba(96, 0, 255, 1)',     // sma46
  'rgba(104, 0, 255, 1)',    // sma47
  'rgba(112, 0, 255, 1)',    // sma48
  'rgba(120, 0, 255, 1)',    // sma49
  'rgba(128, 0, 255, 1)',    // sma50
  'rgba(136, 0, 255, 1)',    // sma51
  'rgba(144, 0, 255, 1)',    // sma52
  'rgba(152, 0, 255, 1)',    // sma53
  'rgba(160, 0, 255, 1)',    // sma54
  'rgba(168, 0, 255, 1)',    // sma55
  'rgba(176, 0, 255, 1)',    // sma56
  'rgba(184, 0, 255, 1)',    // sma57
  'rgba(192, 0, 255, 1)',    // sma58
  'rgba(200, 0, 255, 1)',    // sma59
  'rgba(208, 0, 255, 1)',    // sma60
  'rgba(216, 0, 255, 1)',    // sma61
  'rgba(224, 0, 255, 1)',    // sma62
  'rgba(232, 0, 255, 1)',    // sma63
  'rgba(255, 0, 255, 1)'     // sma64
];

export const rainbowMaIndicator = {
  name: 'RainbowMA',
  shortName: 'Rainbow MA',
  calcParams: [1, 1, 64, 'SMA'],
  figures: Array.from({ length: 64 }).map((_, i) => ({
    key: `ma${i + 1}`,
    title: `MA${i + 1}`,
    type: 'line'
  })),
  styles: {
    lines: colors.map(color => ({
      style: LineType.Solid,
      size: 1,
      color,
      smooth: false,
      dashedValue: []
    }))
  },
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
    const length = Number(calcParams[0]);
    const start = Number(calcParams[1]);
    const maNumber = Math.min(Number(calcParams[2]), 64);
    const maType = String(calcParams[3]).toUpperCase();

    const maArrays: (number | null)[][] = [];

    for (let c = 0; c < maNumber; c++) {
      const period = length * (start + c);
      let maArray;
      if (maType === 'EMA') {
        maArray = calculateEma(dataList, period);
      } else if (maType === 'WMA') {
        maArray = calculateWma(dataList, period);
      } else {
        maArray = calculateSma(dataList, period);
      }
      maArrays.push(maArray);
    }

    return dataList.map((_, i) => {
      const obj: Record<string, number | null> = {};
      for (let c = 0; c < maNumber; c++) {
        obj[`ma${c + 1}`] = maArrays[c][i];
      }
      return obj;
    });
  }
};
