import { clamp, coefficientOfVariation, mean, round2, sampleStdDev } from './stats.util';

describe('stats.util', () => {
  it('mean handles empty and normal input', () => {
    expect(mean([])).toBe(0);
    expect(mean([2, 4, 6])).toBe(4);
  });

  it('sampleStdDev needs at least 2 points', () => {
    expect(sampleStdDev([5])).toBe(0);
    // known sample stddev of [2,4,4,4,5,5,7,9] is ~2.138
    expect(round2(sampleStdDev([2, 4, 4, 4, 5, 5, 7, 9]))).toBeCloseTo(2.14, 1);
  });

  it('coefficientOfVariation guards divide-by-zero', () => {
    expect(coefficientOfVariation([0, 0, 0])).toBe(0);
  });

  it('a 10x outlier produces a z-score well past the 2.5 threshold', () => {
    const normal = [50, 55, 45, 60, 52, 48];
    const withOutlier = [...normal, 600];
    const m = mean(withOutlier);
    const sd = sampleStdDev(withOutlier);
    const z = (600 - m) / sd;
    expect(z).toBeGreaterThan(2.5);
  });

  it('clamp bounds values', () => {
    expect(clamp(-1, 0, 1)).toBe(0);
    expect(clamp(2, 0, 1)).toBe(1);
    expect(clamp(0.5, 0, 1)).toBe(0.5);
  });
});
