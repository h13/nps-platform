import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

let mockStartTriggerWatch: ReturnType<typeof vi.fn>;
let mockShowPopup: ReturnType<typeof vi.fn>;

vi.mock('./trigger', () => {
  mockStartTriggerWatch = vi.fn().mockReturnValue(vi.fn());
  return { startTriggerWatch: mockStartTriggerWatch };
});

vi.mock('./popup', () => {
  mockShowPopup = vi.fn().mockReturnValue(document.createElement('div'));
  return { showPopup: mockShowPopup };
});

const MOCK_CONFIG = {
  survey_title: 'Test',
  thanks_message: 'Thanks',
  widget_primary_color: '#2563EB',
  widget_bg_color: '#FFFFFF',
  widget_text_color: '#1F2937',
  questions: [],
};

function setWidgetConfig(overrides: Record<string, unknown> = {}): void {
  window.NpsWidget = {
    endpoint: 'https://example.com',
    triggers: { scrollPercent: 50, dwellSeconds: 5, operator: 'OR' as const },
    display: { cooldownDays: 90, maxShowCount: 3, position: 'bottom-right', delay: 0 },
    ...overrides,
  } as typeof window.NpsWidget;
}

describe('widget init', () => {
  beforeEach(() => {
    vi.resetModules();
    localStorage.clear();
    delete window.NpsWidget;
    document.body.innerHTML = '';
    // Re-establish mock implementations (vi.restoreAllMocks resets vi.fn() return values)
    mockStartTriggerWatch?.mockReturnValue(vi.fn());
    mockShowPopup?.mockReturnValue(document.createElement('div'));
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(MOCK_CONFIG),
      }),
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // Note: importing ./widget auto-calls init() at module end.
  // Tests that set NpsWidget before import do NOT need to call init() explicitly.

  it('returns early when NpsWidget is not configured', async () => {
    // NpsWidget not set → import triggers init() which returns early
    await import('./widget');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('returns early during cooldown period', async () => {
    localStorage.setItem('nps_responded_at', String(Date.now()));
    setWidgetConfig();
    await import('./widget');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('proceeds when cooldown has expired', async () => {
    const daysAgo = 91 * 24 * 60 * 60 * 1000;
    localStorage.setItem('nps_responded_at', String(Date.now() - daysAgo));
    setWidgetConfig();
    await import('./widget');
    expect(fetch).toHaveBeenCalled();
  });

  it('returns early when max show count reached', async () => {
    localStorage.setItem('nps_show_count', '3');
    setWidgetConfig();
    await import('./widget');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('fetches config when conditions are met', async () => {
    setWidgetConfig();
    await import('./widget');
    expect(fetch).toHaveBeenCalledWith('https://example.com/nps/config');
  });

  it('calls startTriggerWatch after config fetch', async () => {
    setWidgetConfig();
    const { startTriggerWatch } = await import('./trigger');
    await import('./widget');

    await vi.waitFor(() => {
      expect(startTriggerWatch).toHaveBeenCalled();
    });
  });

  it('shows widget immediately when delay is 0', async () => {
    setWidgetConfig();
    const { startTriggerWatch } = await import('./trigger');
    const { showPopup } = await import('./popup');
    await import('./widget');

    await vi.waitFor(() => {
      expect(startTriggerWatch).toHaveBeenCalled();
    });

    const triggerCallback = (startTriggerWatch as ReturnType<typeof vi.fn>).mock.calls[0][1];
    triggerCallback();

    expect(showPopup).toHaveBeenCalled();
    expect(localStorage.getItem('nps_show_count')).toBe('1');
  });

  it('delays widget display when delay > 0', async () => {
    vi.useFakeTimers();
    setWidgetConfig({
      display: { cooldownDays: 90, maxShowCount: 3, position: 'bottom-right', delay: 500 },
    });
    const { startTriggerWatch } = await import('./trigger');
    const { showPopup } = await import('./popup');
    await import('./widget');

    await vi.runAllTimersAsync();

    await vi.waitFor(() => {
      expect(startTriggerWatch).toHaveBeenCalled();
    });

    const triggerCallback = (startTriggerWatch as ReturnType<typeof vi.fn>).mock.calls[0][1];
    triggerCallback();

    // showPopup not called yet (delay pending)
    expect(showPopup).not.toHaveBeenCalled();

    vi.advanceTimersByTime(500);
    expect(showPopup).toHaveBeenCalled();
    vi.useRealTimers();
  });

  it('shows widget only once even if trigger fires twice', async () => {
    setWidgetConfig();
    const { startTriggerWatch } = await import('./trigger');
    const { showPopup } = await import('./popup');
    await import('./widget');

    await vi.waitFor(() => {
      expect(startTriggerWatch).toHaveBeenCalled();
    });

    (showPopup as ReturnType<typeof vi.fn>).mockClear();

    const triggerCallback = (startTriggerWatch as ReturnType<typeof vi.fn>).mock.calls[0][1];
    triggerCallback();
    triggerCallback();

    expect(showPopup).toHaveBeenCalledOnce();
  });

  it('onSubmit posts response and stores responded timestamp', async () => {
    const mockFetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(MOCK_CONFIG) })
      .mockResolvedValueOnce({ ok: true });
    vi.stubGlobal('fetch', mockFetch);

    setWidgetConfig();
    const { startTriggerWatch } = await import('./trigger');
    const { showPopup } = await import('./popup');
    await import('./widget');

    await vi.waitFor(() => {
      expect(startTriggerWatch).toHaveBeenCalled();
    });

    const triggerCallback = (startTriggerWatch as ReturnType<typeof vi.fn>).mock.calls[0][1];
    triggerCallback();

    const popupCallbacks = (showPopup as ReturnType<typeof vi.fn>).mock.calls[0][1];
    await popupCallbacks.onSubmit({ nps: 9 });

    // Verify fetch was called with response endpoint
    expect(mockFetch).toHaveBeenCalledWith(
      'https://example.com/nps/response',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    expect(localStorage.getItem('nps_responded_at')).toBeTruthy();
  });

  it('onSubmit throws on non-ok response', async () => {
    const mockFetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(MOCK_CONFIG) })
      .mockResolvedValueOnce({ ok: false, status: 500 });
    vi.stubGlobal('fetch', mockFetch);

    setWidgetConfig();
    const { startTriggerWatch } = await import('./trigger');
    const { showPopup } = await import('./popup');
    await import('./widget');

    await vi.waitFor(() => {
      expect(startTriggerWatch).toHaveBeenCalled();
    });

    const triggerCallback = (startTriggerWatch as ReturnType<typeof vi.fn>).mock.calls[0][1];
    triggerCallback();

    const popupCallbacks = (showPopup as ReturnType<typeof vi.fn>).mock.calls[0][1];
    await expect(popupCallbacks.onSubmit({ nps: 5 })).rejects.toThrow('Response submit failed: 500');
  });

  it('onClose removes popup and cleans up trigger', async () => {
    const cleanupFn = vi.fn();
    const mockStartWatch = vi.fn().mockReturnValue(cleanupFn);
    vi.doMock('./trigger', () => ({ startTriggerWatch: mockStartWatch }));

    const mockHost = document.createElement('div');
    document.body.appendChild(mockHost);
    const removeSpy = vi.spyOn(mockHost, 'remove');
    vi.doMock('./popup', () => ({ showPopup: vi.fn().mockReturnValue(mockHost) }));

    setWidgetConfig();
    await import('./widget');

    await vi.waitFor(() => {
      expect(mockStartWatch).toHaveBeenCalled();
    });

    const triggerCallback = mockStartWatch.mock.calls[0][1];
    triggerCallback();

    const { showPopup } = await import('./popup');
    const popupCallbacks = (showPopup as ReturnType<typeof vi.fn>).mock.calls[0][1];
    popupCallbacks.onClose();

    expect(cleanupFn).toHaveBeenCalled();
    expect(removeSpy).toHaveBeenCalled();
  });

  it('logs error on fetch failure', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 500 }),
    );
    setWidgetConfig();
    await import('./widget');

    await vi.waitFor(() => {
      expect(consoleSpy).toHaveBeenCalledWith('[NPS Widget]', expect.any(Error));
    });
    consoleSpy.mockRestore();
  });

  it('handles localStorage throwing in getLocalStorageInt', async () => {
    // Replace localStorage entirely so getItem throws for nps_show_count
    const real = window.localStorage;
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => {
        if (key === 'nps_show_count') throw new Error('Access denied');
        return null; // nps_responded_at → null (no cooldown)
      },
      setItem: real.setItem.bind(real),
      removeItem: real.removeItem.bind(real),
      clear: real.clear.bind(real),
      length: 0,
      key: () => null,
    });

    setWidgetConfig();
    await import('./widget');
    // getLocalStorageInt returns 0 on error → proceeds to fetch
    expect(fetch).toHaveBeenCalled();
  });

  it('handles localStorage throwing in getLocalStorageString', async () => {
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => {
        if (key === 'nps_responded_at') throw new Error('Access denied');
        return '0'; // nps_show_count → '0'
      },
      setItem: () => {},
      removeItem: () => {},
      clear: () => {},
      length: 0,
      key: () => null,
    });

    setWidgetConfig();
    await import('./widget');
    // getLocalStorageString returns null on error → no cooldown → proceeds
    expect(fetch).toHaveBeenCalled();
  });

  it('handles localStorage throwing in setLocalStorage', async () => {
    vi.stubGlobal('localStorage', {
      getItem: () => null,
      setItem: () => {
        throw new Error('QuotaExceeded');
      },
      removeItem: () => {},
      clear: () => {},
      length: 0,
      key: () => null,
    });

    setWidgetConfig();
    const { startTriggerWatch } = await import('./trigger');
    await import('./widget');

    await vi.waitFor(() => {
      expect(startTriggerWatch).toHaveBeenCalled();
    });

    const triggerCallback = (startTriggerWatch as ReturnType<typeof vi.fn>).mock.calls[0][1];
    // Should not throw despite localStorage.setItem throwing
    triggerCallback();
  });

  it('tracks scroll percentage via scroll events', async () => {
    const mockFetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(MOCK_CONFIG) })
      .mockResolvedValueOnce({ ok: true });
    vi.stubGlobal('fetch', mockFetch);

    setWidgetConfig();
    const { startTriggerWatch } = await import('./trigger');
    const { showPopup } = await import('./popup');
    await import('./widget');

    await vi.waitFor(() => {
      expect(startTriggerWatch).toHaveBeenCalled();
    });

    // Simulate scroll before triggering popup
    Object.defineProperty(window, 'scrollY', { value: 200, configurable: true });
    Object.defineProperty(window, 'innerHeight', { value: 500, configurable: true });
    Object.defineProperty(document.documentElement, 'scrollHeight', {
      value: 1000,
      configurable: true,
    });
    window.dispatchEvent(new Event('scroll'));

    const triggerCallback = (startTriggerWatch as ReturnType<typeof vi.fn>).mock.calls[0][1];
    triggerCallback();

    const popupCallbacks = (showPopup as ReturnType<typeof vi.fn>).mock.calls[0][1];
    await popupCallbacks.onSubmit({ nps: 8 });

    // The second fetch call is the response submit
    const submitBody = JSON.parse(mockFetch.mock.calls[1][1].body);
    expect(submitBody.scroll_percent).toBe(70);
    expect(submitBody.channel).toBe('lp');
    expect(submitBody.page_url).toBeTruthy();
  });
});
