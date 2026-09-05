(() => {
  const pageRevealKey = '__rinspacePendingPageReveal';
  addEventListener('pagereveal', (event) => {
    globalThis[pageRevealKey] = event;
  }, { once: true });
  try {
    const pending = JSON.parse(sessionStorage.getItem('rinspace:world-transition:v1') || 'null');
    if (
      pending?.version === 1
      && pending.targetHref === location.href
      && Date.now() - pending.createdAt <= 15000
      && (pending.direction === 'outer-to-inner' || pending.direction === 'inner-to-outer')
    ) {
      document.documentElement.dataset.rinWorldTransition = pending.direction;
    }
  } catch {
    // Theme and application bootstrap remain available when storage is blocked.
  }
  try {
    const value = localStorage.getItem('rinspace-theme-v2') || 'system';
    const dark = value === 'dark'
      || (value === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    document.documentElement.style.colorScheme = dark ? 'dark' : 'light';
    const themeColor = document.querySelector('meta[name="theme-color"]');
    if (themeColor) themeColor.setAttribute('content', dark ? '#0b1218' : '#f8fafc');
  } catch {
    document.documentElement.dataset.theme = 'light';
  }
})();
