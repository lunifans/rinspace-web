(() => {
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
