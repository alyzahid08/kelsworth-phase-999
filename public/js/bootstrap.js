(() => {
  const file = (location.pathname.split('/').pop() || 'index.html').toLowerCase();
  const active = file === 'index.html' ? 'home'
    : file === 'collection.html' ? 'collection'
    : file === 'account.html' ? (new URLSearchParams(location.search).get('tab') === 'wishlist' ? 'wishlist' : 'account')
    : file === 'cart.html' ? 'cart'
    : file === 'checkout.html' ? 'checkout'
    : file === 'track.html' ? 'track'
    : file === 'about.html' ? 'about'
    : file === 'contact.html' ? 'contact'
    : file === 'product.html' ? 'product'
    : '';
  if (typeof mountChrome === 'function') mountChrome(active);
})();
