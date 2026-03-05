import { describe, expect, it } from 'vitest';
import { calculateSegment } from './types';

describe('calculateSegment', () => {
  it('returns "promoter" for score 10', () => {
    expect(calculateSegment(10)).toBe('promoter');
  });

  it('returns "promoter" for score 9', () => {
    expect(calculateSegment(9)).toBe('promoter');
  });

  it('returns "passive" for score 8', () => {
    expect(calculateSegment(8)).toBe('passive');
  });

  it('returns "passive" for score 7', () => {
    expect(calculateSegment(7)).toBe('passive');
  });

  it('returns "detractor" for score 6', () => {
    expect(calculateSegment(6)).toBe('detractor');
  });

  it('returns "detractor" for score 0', () => {
    expect(calculateSegment(0)).toBe('detractor');
  });
});
