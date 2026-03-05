import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { startTriggerWatch } from './trigger';

describe('startTriggerWatch', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    Object.defineProperty(window, 'scrollY', { value: 0, writable: true, configurable: true });
    Object.defineProperty(window, 'innerHeight', {
      value: 500,
      writable: true,
      configurable: true,
    });
    Object.defineProperty(document.documentElement, 'scrollHeight', {
      value: 1000,
      writable: true,
      configurable: true,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('fires on dwell (OR mode)', () => {
    const onTriggered = vi.fn();
    const cleanup = startTriggerWatch(
      { scrollPercent: 80, dwellSeconds: 2, operator: 'OR' },
      onTriggered,
    );

    vi.advanceTimersByTime(2000);
    expect(onTriggered).toHaveBeenCalledOnce();
    cleanup();
  });

  it('fires on scroll (OR mode)', () => {
    const onTriggered = vi.fn();
    const cleanup = startTriggerWatch(
      { scrollPercent: 50, dwellSeconds: 999, operator: 'OR' },
      onTriggered,
    );

    // Simulate scroll to 60%
    Object.defineProperty(window, 'scrollY', { value: 100, configurable: true });
    window.dispatchEvent(new Event('scroll'));

    expect(onTriggered).toHaveBeenCalledOnce();
    cleanup();
  });

  it('requires both conditions in AND mode', () => {
    const onTriggered = vi.fn();
    const cleanup = startTriggerWatch(
      { scrollPercent: 50, dwellSeconds: 2, operator: 'AND' },
      onTriggered,
    );

    // Only scroll, not enough dwell
    Object.defineProperty(window, 'scrollY', { value: 100, configurable: true });
    window.dispatchEvent(new Event('scroll'));
    expect(onTriggered).not.toHaveBeenCalled();

    // Now satisfy dwell
    vi.advanceTimersByTime(2000);
    expect(onTriggered).toHaveBeenCalledOnce();
    cleanup();
  });

  it('fires only once', () => {
    const onTriggered = vi.fn();
    const cleanup = startTriggerWatch(
      { scrollPercent: 80, dwellSeconds: 1, operator: 'OR' },
      onTriggered,
    );

    vi.advanceTimersByTime(1000);
    vi.advanceTimersByTime(1000);
    expect(onTriggered).toHaveBeenCalledOnce();
    cleanup();
  });

  it('cleanup removes scroll listener and clears interval', () => {
    const removeSpy = vi.spyOn(window, 'removeEventListener');
    const onTriggered = vi.fn();
    const cleanup = startTriggerWatch(
      { scrollPercent: 80, dwellSeconds: 999, operator: 'OR' },
      onTriggered,
    );

    cleanup();

    expect(removeSpy).toHaveBeenCalledWith('scroll', expect.any(Function));

    // After cleanup, dwell should not fire
    vi.advanceTimersByTime(10000);
    expect(onTriggered).not.toHaveBeenCalled();
    removeSpy.mockRestore();
  });
});
