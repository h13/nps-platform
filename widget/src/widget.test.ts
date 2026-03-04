import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('./trigger', () => ({
  startTriggerWatch: vi.fn().mockReturnValue(vi.fn()),
}));

vi.mock('./popup', () => ({
  showPopup: vi.fn().mockReturnValue(document.createElement('div')),
}));

const MOCK_CONFIG = {
  survey_title: 'Test',
  thanks_message: 'Thanks',
  widget_primary_color: '#2563EB',
  widget_bg_color: '#FFFFFF',
  widget_text_color: '#1F2937',
  questions: [],
};

function setWidgetConfig(): void {
  window.NpsWidget = {
    endpoint: 'https://example.com',
    triggers: { scrollPercent: 50, dwellSeconds: 5, operator: 'OR' as const },
    display: { cooldownDays: 90, maxShowCount: 3, position: 'bottom-right', delay: 0 },
  };
}

describe('widget init', () => {
  beforeEach(() => {
    vi.resetModules();
    localStorage.clear();
    delete window.NpsWidget;
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

  it('returns early when NpsWidget is not configured', async () => {
    const { init } = await import('./widget');
    init();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('returns early during cooldown period', async () => {
    localStorage.setItem('nps_responded_at', String(Date.now()));
    setWidgetConfig();
    const { init } = await import('./widget');
    init();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('returns early when max show count reached', async () => {
    localStorage.setItem('nps_show_count', '3');
    setWidgetConfig();
    const { init } = await import('./widget');
    init();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('fetches config when conditions are met', async () => {
    setWidgetConfig();
    const { init } = await import('./widget');
    init();
    expect(fetch).toHaveBeenCalledWith('https://example.com/nps/config');
  });

  it('calls startTriggerWatch after config fetch', async () => {
    setWidgetConfig();
    const { startTriggerWatch } = await import('./trigger');
    const { init } = await import('./widget');
    init();

    // Wait for fetch promise chain
    await vi.waitFor(() => {
      expect(startTriggerWatch).toHaveBeenCalled();
    });
  });

  it('logs error on fetch failure', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 500 }),
    );
    setWidgetConfig();
    const { init } = await import('./widget');
    init();

    await vi.waitFor(() => {
      expect(consoleSpy).toHaveBeenCalledWith('[NPS Widget]', expect.any(Error));
    });
    consoleSpy.mockRestore();
  });
});
