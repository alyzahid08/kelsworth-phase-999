(() => {
  const file = (location.pathname.split('/').pop() || 'index.html').toLowerCase();
  const active = file.replace(/\.html$/, '') || 'index';
  if (typeof mountAdminChrome === 'function') mountAdminChrome(active);
})();
