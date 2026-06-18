import type { KLineData } from 'klinecharts';

export function calculateSma(dataList: KLineData[], period: number): (number | null)[] {
  // Validate inputs
  if (period <= 0) return Array(dataList.length).fill(null);
  if (dataList.length === 0) return [];
  
  const result: (number | null)[] = new Array(dataList.length);
  let sum = 0;
  
  for (let i = 0; i < dataList.length; i++) {
    const val = dataList[i].close;
    sum += val;
    
    if (i >= period - 1) {
      if (i >= period) {
        sum -= dataList[i - period].close;
      }
      result[i] = sum / period;
    } else {
      result[i] = null;
    }
  }
  
  return result;
}

export function calculateEma(dataList: KLineData[], period: number): (number | null)[] {
  // Validate inputs
  if (period <= 0) return dataList.map(() => null);
  if (dataList.length === 0) return [];
  
  const result: (number | null)[] = new Array(dataList.length);
  const k = 2 / (period + 1);
  let ema: number | null = null;
  
  for (let i = 0; i < dataList.length; i++) {
    const val = dataList[i].close;
    
    if (i === 0) {
      ema = val;
    } else if (ema !== null) {
      ema = val * k + ema * (1 - k);
    }
    
    result[i] = ema;
  }
  
  return result;
}

export function calculateWma(dataList: KLineData[], period: number): (number | null)[] {
  // Validate inputs
  if (period <= 0) return Array(dataList.length).fill(null);
  if (dataList.length === 0) return [];
  
  const result: (number | null)[] = new Array(dataList.length);
  const denominator = (period * (period + 1)) / 2;
  
  for (let i = 0; i < dataList.length; i++) {
    if (i >= period - 1) {
      let sum = 0;
      for (let j = 0; j < period; j++) {
        sum += dataList[i - j].close * (period - j);
      }
      result[i] = sum / denominator;
    } else {
      result[i] = null;
    }
  }
  
  return result;
}

// Optimized version using typed arrays for better performance with large datasets
export function calculateSmaOptimized(dataList: KLineData[], period: number): (number | null)[] {
  // Validate inputs
  if (period <= 0) return Array(dataList.length).fill(null);
  if (dataList.length === 0) return [];
  
  const len = dataList.length;
  const result: (number | null)[] = new Array(len);
  const closes = new Float64Array(len);
  
  // Extract close prices for faster access
  for (let i = 0; i < len; i++) {
    closes[i] = dataList[i].close;
  }
  
  let sum = 0;
  
  for (let i = 0; i < len; i++) {
    sum += closes[i];
    
    if (i >= period - 1) {
      if (i >= period) {
        sum -= closes[i - period];
      }
      result[i] = sum / period;
    } else {
      result[i] = null;
    }
  }
  
  return result;
}