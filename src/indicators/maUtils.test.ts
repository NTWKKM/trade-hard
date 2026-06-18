import { describe, it, expect } from 'vitest';
import { calculateSma, calculateEma, calculateWma } from './maUtils';
import type { KLineData } from 'klinecharts';

// Helper: generate KLineData from close prices
function makeKLineData(closes: number[]): KLineData[] {
  return closes.map((c, i) => ({
    timestamp: 1000 * (i + 1),
    open: c,
    high: c + 1,
    low: c - 1,
    close: c,
    volume: 1000,
  }));
}

describe('calculateSma', () => {
  it('returns null for first period-1 entries', () => {
    const data = makeKLineData([10, 20, 30, 40, 50]);
    const result = calculateSma(data, 3);
    expect(result[0]).toBeNull();
    expect(result[1]).toBeNull();
  });

  it('calculates correct SMA values', () => {
    const data = makeKLineData([10, 20, 30, 40, 50]);
    const result = calculateSma(data, 3);
    expect(result[2]).toBeCloseTo(20); // (10+20+30)/3
    expect(result[3]).toBeCloseTo(30); // (20+30+40)/3
    expect(result[4]).toBeCloseTo(40); // (30+40+50)/3
  });

  it('handles period of 1', () => {
    const data = makeKLineData([5, 10, 15]);
    const result = calculateSma(data, 1);
    expect(result).toEqual([5, 10, 15]);
  });

  it('handles empty array', () => {
    const result = calculateSma([], 3);
    expect(result).toEqual([]);
  });

  it('handles period larger than data length', () => {
    const data = makeKLineData([10, 20, 30]);
    const result = calculateSma(data, 10);
    expect(result.every(v => v === null)).toBe(true);
  });
});

describe('calculateEma', () => {
  it('seeds with first close price', () => {
    const data = makeKLineData([100, 200, 300]);
    const result = calculateEma(data, 3);
    expect(result[0]).toBe(100);
  });

  it('calculates correct EMA values', () => {
    const data = makeKLineData([10, 20, 30, 40, 50]);
    const result = calculateEma(data, 3);
    // k = 2/(3+1) = 0.5
    // EMA[0] = 10
    // EMA[1] = 20 * 0.5 + 10 * 0.5 = 15
    // EMA[2] = 30 * 0.5 + 15 * 0.5 = 22.5
    expect(result[0]).toBe(10);
    expect(result[1]).toBeCloseTo(15);
    expect(result[2]).toBeCloseTo(22.5);
  });

  it('handles period of 1 (k=1, EMA = close)', () => {
    const data = makeKLineData([5, 10, 15]);
    const result = calculateEma(data, 1);
    expect(result).toEqual([5, 10, 15]);
  });

  it('handles empty array', () => {
    const result = calculateEma([], 3);
    expect(result).toEqual([]);
  });
});

describe('calculateWma', () => {
  it('returns null for first period-1 entries', () => {
    const data = makeKLineData([10, 20, 30, 40, 50]);
    const result = calculateWma(data, 3);
    expect(result[0]).toBeNull();
    expect(result[1]).toBeNull();
  });

  it('calculates correct WMA values', () => {
    const data = makeKLineData([10, 20, 30]);
    const result = calculateWma(data, 3);
    // WMA = (10*1 + 20*2 + 30*3) / (1+2+3) = (10+40+90)/6 = 140/6
    expect(result[2]).toBeCloseTo(140 / 6);
  });

  it('handles period of 1', () => {
    const data = makeKLineData([5, 10, 15]);
    const result = calculateWma(data, 1);
    expect(result).toEqual([5, 10, 15]);
  });

  it('handles empty array', () => {
    const result = calculateWma([], 3);
    expect(result).toEqual([]);
  });

  it('handles period larger than data length', () => {
    const data = makeKLineData([10, 20, 30]);
    const result = calculateWma(data, 10);
    expect(result.every(v => v === null)).toBe(true);
  });
});