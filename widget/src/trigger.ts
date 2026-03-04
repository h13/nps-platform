export interface TriggerConfig {
  scrollPercent: number;
  dwellSeconds: number;
  operator: 'OR' | 'AND';
}

export function startTriggerWatch(config: TriggerConfig, onTriggered: () => void): () => void {
  let scrollReached = false;
  let dwellReached = false;
  let fired = false;
  const startTime = Date.now();

  function check(): void {
    if (fired) return;

    const shouldFire =
      config.operator === 'OR' ? scrollReached || dwellReached : scrollReached && dwellReached;

    if (shouldFire) {
      fired = true;
      cleanup();
      onTriggered();
    }
  }

  function onScroll(): void {
    const scrollPercent =
      ((window.scrollY + window.innerHeight) / document.documentElement.scrollHeight) * 100;
    if (scrollPercent >= config.scrollPercent) {
      scrollReached = true;
      check();
    }
  }

  const dwellTimer = setInterval(() => {
    const elapsed = (Date.now() - startTime) / 1000;
    if (elapsed >= config.dwellSeconds) {
      dwellReached = true;
      check();
    }
  }, 1000);

  window.addEventListener('scroll', onScroll, { passive: true });

  function cleanup(): void {
    window.removeEventListener('scroll', onScroll);
    clearInterval(dwellTimer);
  }

  return cleanup;
}
