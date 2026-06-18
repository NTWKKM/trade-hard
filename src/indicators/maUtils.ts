import type { KLineData } from 'klinecharts';

export function calculateSma(dataList: KLineData[], period: number): (number | null)[] {
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

export function calculateEma(dataList: KLineData[], period: number): (number | null)[] {
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

export function calculateWma(dataList: KLineData[], period: number): (number | null)[] {
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