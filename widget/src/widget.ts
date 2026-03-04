import { startTriggerWatch } from './trigger';
import { showPopup } from './popup';
import type { SurveyConfig } from './popup';

interface NpsWidgetConfig {
  endpoint: string;
  triggers: {
    scrollPercent: number;
    dwellSeconds: number;
    operator: 'OR' | 'AND';
  };
  display: {
    cooldownDays: number;
    maxShowCount: number;
    position: string;
    delay: number;
  };
}

declare global {
  interface Window {
    NpsWidget?: NpsWidgetConfig;
  }
}

const LS_RESPONDED = 'nps_responded_at';
const LS_SHOW_COUNT = 'nps_show_count';

function getLocalStorageInt(key: string): number {
  try {
    return parseInt(localStorage.getItem(key) || '0', 10) || 0;
  } catch {
    return 0;
  }
}

function getLocalStorageString(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function setLocalStorage(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // localStorage unavailable
  }
}

export function init(): void {
  const widgetConfig = window.NpsWidget;
  if (!widgetConfig) return;

  const { endpoint, triggers, display } = widgetConfig;

  // Cooldown check
  const respondedAt = getLocalStorageString(LS_RESPONDED);
  if (respondedAt) {
    const elapsed = Date.now() - parseInt(respondedAt, 10);
    const cooldownMs = (display.cooldownDays || 90) * 24 * 60 * 60 * 1000;
    if (elapsed < cooldownMs) return;
  }

  // Show count check
  const showCount = getLocalStorageInt(LS_SHOW_COUNT);
  if (showCount >= (display.maxShowCount || 3)) return;

  // Fetch config
  fetch(`${endpoint}/nps/config`)
    .then((res) => {
      if (!res.ok) throw new Error(`Config fetch failed: ${res.status}`);
      return res.json() as Promise<SurveyConfig>;
    })
    .then((config) => {
      const startTime = Date.now();
      let scrollPercent = 0;
      let popupHost: HTMLElement | null = null;
      let cleanupTrigger: (() => void) | null = null;

      // Track scroll for metadata
      window.addEventListener(
        'scroll',
        () => {
          const current =
            ((window.scrollY + window.innerHeight) / document.documentElement.scrollHeight) * 100;
          if (current > scrollPercent) scrollPercent = current;
        },
        { passive: true },
      );

      function showWidget(): void {
        if (popupHost) return;

        setLocalStorage(LS_SHOW_COUNT, String(showCount + 1));

        popupHost = showPopup(config, {
          onSubmit: async (answers) => {
            const dwellSeconds = Math.round((Date.now() - startTime) / 1000);

            const res = await fetch(`${endpoint}/nps/response`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                channel: 'lp',
                answers,
                page_url: window.location.href,
                scroll_percent: Math.round(scrollPercent),
                dwell_seconds: dwellSeconds,
                user_agent: navigator.userAgent,
              }),
            });

            if (!res.ok) throw new Error(`Response submit failed: ${res.status}`);

            setLocalStorage(LS_RESPONDED, String(Date.now()));
          },
          onClose: () => {
            if (cleanupTrigger) {
              cleanupTrigger();
              cleanupTrigger = null;
            }
            if (popupHost) {
              popupHost.remove();
              popupHost = null;
            }
          },
        });
      }

      cleanupTrigger = startTriggerWatch(triggers, () => {
        const delay = display.delay || 0;
        if (delay > 0) {
          setTimeout(showWidget, delay);
        } else {
          showWidget();
        }
      });
    })
    .catch((err) => {
      console.error('[NPS Widget]', err);
    });
}

init();
