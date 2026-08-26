/* AL-QUTUZ — shared chrome
   Injects the header and footer into every page from one place, so nav
   links / copy only need to change here. */

const CART_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M6 8h12l-1 12H7L6 8Z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/></svg>`;
const SEARCH_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>`;
const ACCOUNT_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="12" cy="8" r="3.2"/><path d="M5 20c1.2-3.6 4-5.4 7-5.4S18.8 16.4 20 20"/></svg>`;
const WISHLIST_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M12 20.5S3.5 15.4 3.5 9.4A4.9 4.9 0 0 1 12 6.2a4.9 4.9 0 0 1 8.5 3.2c0 6-8.5 11.1-8.5 11.1Z"/></svg>`;
const HOME_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M4 11.5 12 4l8 7.5"/><path d="M6 10v9h12v-9"/></svg>`;
const MENU_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M4 7h16M4 12h16M4 17h16"/></svg>`;
const CLOSE_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M5 5l14 14M19 5 5 19"/></svg>`;

// Fabric-family groupings behind the primary nav — the storefront speaks in
// "Wash & Wear" / "Cotton" / "Accessories", the database still speaks in the
// original fine-grained categories. Grouping happens via a comma-separated
// ?category= list that collection.html already knows how to split.
const WASH_N_WEAR_CATEGORIES = ["wash-n-wear", "karandi", "khaddar", "linen", "blended"];
const ACCESSORY_CATEGORIES = ["caps", "wallets", "watches"];

const NAV_LINKS = [
  { label: "Wash & Wear", href: `collection.html?category=${WASH_N_WEAR_CATEGORIES.join(",")}`, key: "wash-n-wear" },
  { label: "Cotton", href: "collection.html?category=cotton", key: "cotton" },
  { label: "Accessories", href: `collection.html?category=${ACCESSORY_CATEGORIES.join(",")}`, key: "accessories" },
  { label: "Collections", href: "collection.html", key: "collection" },
  { label: "About", href: "about.html", key: "about" },
];

// Update these with the store's real handles/URLs — the icons link out as
// soon as they're filled in, and any left as "#" simply don't render.
const SOCIAL_LINKS = {
  instagram: "https://instagram.com/alqutuz",
  facebook: "https://facebook.com/alqutuz",
  tiktok: "https://tiktok.com/@alqutuz",
  whatsapp: "https://wa.me/923000000000",
};

const SOCIAL_ICONS = {
  instagram: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="3.5" y="3.5" width="17" height="17" rx="4.5"/><circle cx="12" cy="12" r="4"/><circle cx="17.2" cy="6.8" r="1.1" fill="currentColor" stroke="none"/></svg>`,
  facebook: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M14 8.5h2.5V5H14c-2 0-3.5 1.6-3.5 3.6V11H8v3.5h2.5V21H14v-6.5h2.4l.6-3.5H14V9c0-.3.2-.5.5-.5H14Z"/></svg>`,
  tiktok: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M14 4v10.6a3.4 3.4 0 1 1-3.4-3.4c.3 0 .6 0 .9.1"/><path d="M14 4c.3 2 1.8 3.5 3.8 3.8"/></svg>`,
  whatsapp: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M6.5 17.5 5 20l2.6-1.4A7.5 7.5 0 1 0 5 12c0 1.3.35 2.5.97 3.55"/><path d="M9.5 9.7c.2-.5.9-.5 1.2 0l.5.9c.15.3.1.6-.1.85l-.4.45c-.2.25-.2.5-.05.75.6 1 1.5 1.85 2.5 2.4.25.15.5.1.7-.1l.45-.45c.2-.2.5-.25.8-.1l1 .5c.4.2.5.7.2 1.05-.6.65-1.55 1.05-2.4.8-1.9-.55-3.9-2.35-4.65-4.15-.3-.75.05-1.65.65-2.2Z"/></svg>`,
};

function socialRowHTML() {
  return Object.entries(SOCIAL_LINKS)
    .filter(([, url]) => url && url !== "#")
    .map(
      ([key, url]) =>
        `<a href="${url}" target="_blank" rel="noopener noreferrer" aria-label="AL-QUTUZ on ${key}">${SOCIAL_ICONS[key]}</a>`
    )
    .join("");
}

function headerHTML(active) {
  const links = NAV_LINKS.map(
    (l) => `<a href="${l.href}" class="${l.key === active ? "active" : ""}">${l.label}</a>`
  ).join("");
  return `
  <div class="announce-bar">Free delivery across Pakistan on orders over Rs. 5,000 — Cash on Delivery available</div>
  <div class="header-row">
    <a href="index.html" class="logo brand-lockup" aria-label="AL-QUTUZ — القطز">
      <img src="images/brand/logo-alqutuz.png" alt="AL-QUTUZ" class="brand-crest" />
      <span class="brand-wordmark">AL-QUTUZ</span>
    </a>
    <nav class="main-nav">${links}</nav>
    <div class="header-actions">
      <div class="search-wrap" id="searchWrap">
        <form id="headerSearchForm" style="display:flex;align-items:center;position:relative">
          <input type="search" id="headerSearchInput" placeholder="Search products…" aria-label="Search products" autocomplete="off"
            style="width:0;opacity:0;padding:0;border:none;font-family:var(--font-mono);font-size:12px;background:var(--paper-alt);transition:width .2s ease,opacity .2s ease,padding .2s ease" />
          <button class="icon-btn" id="searchToggle" aria-label="Search" type="button">${SEARCH_ICON}</button>
        </form>
        <div class="search-dropdown" id="searchDropdown"></div>
      </div>
      <a class="icon-btn header-only-icon" href="account.html" aria-label="Account">${ACCOUNT_ICON}</a>
      <a class="icon-btn header-only-icon" href="account.html?tab=wishlist" aria-label="Wishlist">${WISHLIST_ICON}</a>
      <a class="icon-btn" href="cart.html" aria-label="Cart">${CART_ICON}<span class="cart-count" data-cart-count style="display:none" aria-hidden="true">0</span></a>
      <button class="nav-toggle" id="mobileNavToggle" aria-label="Open menu" type="button">${MENU_ICON}</button>
    </div>
  </div>`;
}

function mobileNavHTML(active) {
  const links = NAV_LINKS.map(
    (l) => `<a href="${l.href}" class="${l.key === active ? "active" : ""}">${l.label}</a>`
  ).join("");
  return `
  <div class="mobile-nav-head">
    <span class="logo brand-lockup" aria-label="AL-QUTUZ — القطز">
      <img src="images/brand/logo-alqutuz.png" alt="AL-QUTUZ" class="brand-crest" />
      <span class="brand-wordmark">AL-QUTUZ</span>
    </span>
    <button class="nav-toggle" id="mobileNavClose" aria-label="Close menu" type="button">${CLOSE_ICON}</button>
  </div>
  <nav>${links}<a href="account.html">Account</a><a href="track.html">Track Order</a></nav>
  <hr class="stitch-rule" style="margin:30px 0">
  <a href="cart.html" style="font-family:var(--font-mono);font-size:13px;text-transform:uppercase;letter-spacing:.08em">View Cart (<span data-cart-count>0</span>)</a>`;
}

function bottomNavHTML(active) {
  const items = [
    { key: "home", href: "index.html", icon: HOME_ICON, label: "Home" },
    { key: "collection", href: "collection.html", icon: SEARCH_ICON, label: "Shop" },
    { key: "wishlist", href: "account.html?tab=wishlist", icon: WISHLIST_ICON, label: "Wishlist" },
    { key: "cart", href: "cart.html", icon: CART_ICON, label: "Cart", showCount: true },
    { key: "account", href: "account.html", icon: ACCOUNT_ICON, label: "Account" },
  ];
  return items
    .map(
      (i) => `
    <a href="${i.href}" class="${i.key === active ? "active" : ""}">
      ${i.icon}
      ${i.showCount ? `<span class="bn-count" data-cart-count style="display:none" aria-hidden="true">0</span>` : ""}
      <span>${i.label}</span>
    </a>`
    )
    .join("");
}

function trustBadgesHTML() {
  const badges = [
    { icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="3" y="7" width="18" height="13" rx="1"/><path d="M3 11h18M7 7V5a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v2"/></svg>`, label: "Cash on Delivery" },
    { icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M12 3 4 6v6c0 4.5 3.4 7.7 8 9 4.6-1.3 8-4.5 8-9V6l-8-3Z"/><path d="m9 12 2 2 4-4"/></svg>`, label: "Secure Checkout" },
    { icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M3 12a9 9 0 1 0 9-9"/><path d="M3 5v6h6"/></svg>`, label: "14-Day Easy Returns" },
    { icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M12 2 3 6v6c0 5 3.8 8.7 9 10 5.2-1.3 9-5 9-10V6l-9-4Z"/></svg>`, label: "Quality Guaranteed" },
  ];
  return `
    <div class="trust-badges">
      ${badges.map((b) => `<div class="trust-badge">${b.icon}<span>${b.label}</span></div>`).join("")}
    </div>`;
}

function footerHTML() {
  return `
  <div class="footer-top">
    <div class="newsletter">
      <div>
        <h3>Join the list.</h3>
        <p>New drops, restocks, and first access to sale — no spam, unsubscribe anytime.</p>
      </div>
      <form class="newsletter-form" id="newsletterForm">
        <input type="email" placeholder="Your email address" required aria-label="Email address" />
        <button type="submit">Subscribe</button>
      </form>
    </div>
  </div>
  ${trustBadgesHTML()}
  <div class="footer-grid">
    <div class="footer-col footer-brand-col">
      <h4 class="footer-brand-name">AL-QUTUZ <span class="footer-brand-urdu">القطز</span></h4>
      <p class="footer-brand-tagline" dir="rtl">اپنی شان، اپنا انداز</p>
      <p>A premium men's fabric house — Wash &amp; Wear and Cotton unstitched lengths, with a curated edit of caps, wallets and watches.</p>
      <div class="social-row">${socialRowHTML()}</div>
    </div>
    <div class="footer-col">
      <h4>Shop</h4>
      <ul>
        <li><a href="collection.html?category=${WASH_N_WEAR_CATEGORIES.join(",")}">Wash &amp; Wear</a></li>
        <li><a href="collection.html?category=cotton">Cotton</a></li>
        <li><a href="collection.html?category=${ACCESSORY_CATEGORIES.join(",")}">Accessories</a></li>
        <li><a href="collection.html">All Collections</a></li>
        <li><a href="collection.html?sale=1">Sale</a></li>
      </ul>
    </div>
    <div class="footer-col">
      <h4>Help</h4>
      <ul>
        <li><a href="faq.html#sizing">Size Guide</a></li>
        <li><a href="shipping.html">Shipping &amp; Delivery</a></li>
        <li><a href="refund.html">Returns &amp; Exchanges</a></li>
        <li><a href="track.html">Track Order</a></li>
        <li><a href="faq.html">FAQ</a></li>
        <li><a href="contact.html">Contact Us</a></li>
      </ul>
    </div>
    <div class="footer-col">
      <h4>Company</h4>
      <ul>
        <li><a href="about.html">About AL-QUTUZ</a></li>
        <li><a href="contact.html">Contact</a></li>
        <li><a href="privacy.html">Privacy Policy</a></li>
        <li><a href="refund.html">Refund Policy</a></li>
      </ul>
    </div>
  </div>
  <div class="footer-bottom">
    <span>© ${new Date().getFullYear()} AL-QUTUZ. All rights reserved.</span>
    <span class="payment-note">Payment: Cash on Delivery</span>
    <span>Karachi, Pakistan</span>
  </div>`;
}

const RECENT_SEARCHES_KEY = "vw_recent_searches";
function getRecentSearches() {
  try { return JSON.parse(localStorage.getItem(RECENT_SEARCHES_KEY)) || []; } catch (e) { return []; }
}
function addRecentSearch(q) {
  q = q.trim();
  if (!q) return;
  const list = [q, ...getRecentSearches().filter((x) => x.toLowerCase() !== q.toLowerCase())].slice(0, 6);
  localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(list));
}
function clearRecentSearches() { localStorage.removeItem(RECENT_SEARCHES_KEY); }

// Shared skeleton placeholder for any page that renders a product grid
// while data is still loading — avoids every page hand-rolling its own.
function skeletonCards(n = 4) {
  return Array.from({ length: n })
    .map(
      () => `
    <div class="product-card skeleton-card">
      <div class="skeleton-thumb skeleton-block"></div>
      <div class="skeleton-line skeleton-block"></div>
      <div class="skeleton-line short skeleton-block"></div>
    </div>`
    )
    .join("");
}

// Shared "★★★★☆ (12)" snippet for product cards — returns "" when a product
// has no reviews yet, so cards don't show an empty/zero rating.
function ratingSnippetHTML(p) {
  if (!p.reviewCount) return "";
  const full = Math.round(p.rating);
  return `<div class="card-rating"><span class="stars">${"★".repeat(full)}${"☆".repeat(5 - full)}</span><span>(${p.reviewCount})</span></div>`;
}

// A single shared aria-live region for brief status announcements (e.g.
// "Added to cart") — created once, reused everywhere, so screen reader
// users get feedback for actions that are otherwise only shown visually.
function announce(message) {
  let region = document.getElementById("a11yAnnouncer");
  if (!region) {
    region = document.createElement("div");
    region.id = "a11yAnnouncer";
    region.setAttribute("aria-live", "polite");
    region.setAttribute("role", "status");
    region.className = "sr-only";
    document.body.appendChild(region);
  }
  region.textContent = "";
  // Re-set on the next tick so repeated identical messages still announce.
  setTimeout(() => { region.textContent = message; }, 50);
}

function mountChrome(active) {
  if (!document.getElementById("skipLink")) {
    const skipLink = document.createElement("a");
    skipLink.id = "skipLink";
    skipLink.href = "#main-content";
    skipLink.className = "skip-link";
    skipLink.textContent = "Skip to content";
    document.body.insertBefore(skipLink, document.body.firstChild);
  }

  const headerEl = document.getElementById("site-header");
  const footerEl = document.getElementById("site-footer");
  if (headerEl) headerEl.innerHTML = headerHTML(active);
  if (footerEl) footerEl.innerHTML = footerHTML();

  const mobileNav = document.createElement("div");
  mobileNav.className = "mobile-nav";
  mobileNav.id = "mobileNav";
  mobileNav.innerHTML = mobileNavHTML(active);
  document.body.appendChild(mobileNav);

  const bottomNav = document.createElement("nav");
  bottomNav.className = "bottom-nav";
  bottomNav.id = "bottomNav";
  bottomNav.innerHTML = bottomNavHTML(active);
  document.body.appendChild(bottomNav);

  const openBtn = document.getElementById("mobileNavToggle");
  const closeBtn = document.getElementById("mobileNavClose");
  if (openBtn) openBtn.addEventListener("click", () => mobileNav.classList.add("open"));
  if (closeBtn) closeBtn.addEventListener("click", () => mobileNav.classList.remove("open"));

  const newsletterForm = document.getElementById("newsletterForm");
  if (newsletterForm) {
    newsletterForm.addEventListener("submit", (e) => {
      e.preventDefault();
      const input = newsletterForm.querySelector("input");
      newsletterForm.innerHTML = `<span style="font-family:var(--font-mono);font-size:12px;color:var(--paper)">Thanks — you're on the list.</span>`;
    });
  }

  const searchToggle = document.getElementById("searchToggle");
  const searchInput = document.getElementById("headerSearchInput");
  const searchForm = document.getElementById("headerSearchForm");
  const searchWrap = document.getElementById("searchWrap");
  const dropdown = document.getElementById("searchDropdown");

  if (searchToggle && searchInput && dropdown) {
    const getRecent = getRecentSearches;
    const addRecent = addRecentSearch;
    const clearRecent = clearRecentSearches;

    const escapeHTML = (s) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
    const highlight = (text, q) => {
      const idx = text.toLowerCase().indexOf(q.toLowerCase());
      if (idx === -1) return escapeHTML(text);
      return `${escapeHTML(text.slice(0, idx))}<mark>${escapeHTML(text.slice(idx, idx + q.length))}</mark>${escapeHTML(text.slice(idx + q.length))}`;
    };

    let searchItems = [];
    let activeIndex = -1;
    let debounceTimer = null;

    function closeDropdown() {
      dropdown.classList.remove("open");
      searchItems = [];
      activeIndex = -1;
    }
    function setActive(i) {
      activeIndex = i;
      searchItems.forEach((it, idx) => it.el.classList.toggle("active", idx === i));
      if (i >= 0) searchItems[i].el.scrollIntoView({ block: "nearest" });
    }

    function renderRecent() {
      const recents = getRecent();
      dropdown.classList.add("open");
      if (!recents.length) {
        dropdown.innerHTML = `<p class="search-empty">Start typing to search products…</p>`;
        searchItems = [];
        return;
      }
      dropdown.innerHTML = `
        <div class="search-section-label"><span>Recent Searches</span><button type="button" id="clearRecentBtn">Clear</button></div>
        <div>${recents.map((r) => `<button type="button" class="search-recent-item" data-q="${escapeHTML(r)}">${SEARCH_ICON}<span>${escapeHTML(r)}</span></button>`).join("")}</div>`;
      document.getElementById("clearRecentBtn").addEventListener("click", () => { clearRecent(); renderRecent(); });
      searchItems = [...dropdown.querySelectorAll(".search-recent-item")].map((el) => ({
        el, onSelect: () => { searchInput.value = el.dataset.q; runSearch(el.dataset.q); },
      }));
      searchItems.forEach((it) => it.el.addEventListener("click", it.onSelect));
    }

    async function runSearch(q) {
      if (!q) { renderRecent(); return; }
      dropdown.classList.add("open");
      const data = await searchProducts(q, 6);
      // The query may have changed while this request was in flight.
      if (searchInput.value.trim() !== q) return;

      const categoryRow = data.categories.length
        ? `<div class="search-category-row">${data.categories
            .map((c) => `<a class="search-category-chip" href="collection.html?category=${c.key}">${c.label} <span>(${c.count})</span></a>`)
            .join("")}</div>`
        : "";
      const productRows = data.products.length
        ? `<div>${data.products
            .map(
              (p) => `
          <a class="search-result-row" href="product.html?id=${p.id}">
            <img src="${p.image}" alt="${escapeHTML(p.name)}" loading="lazy" />
            <span class="search-result-info">
              <span class="search-result-name">${highlight(p.matchedName, q)}</span>
              <span class="search-result-price">${formatPKR(p.salePrice ?? p.price)}</span>
            </span>
          </a>`
            )
            .join("")}</div>`
        : `<p class="search-empty">No products found for "${escapeHTML(q)}"</p>`;
      const viewAll = `<a class="search-viewall" href="collection.html?q=${encodeURIComponent(q)}">View all results for &ldquo;${escapeHTML(q)}&rdquo;</a>`;

      dropdown.innerHTML = `
        ${categoryRow}
        ${data.products.length ? `<div class="search-section-label"><span>Products</span></div>` : ""}
        ${productRows}
        ${viewAll}`;

      searchItems = [
        ...dropdown.querySelectorAll(".search-category-chip"),
        ...dropdown.querySelectorAll(".search-result-row"),
        ...dropdown.querySelectorAll(".search-viewall"),
      ].map((el) => ({ el, onSelect: () => el.click() }));
      dropdown.querySelectorAll("a").forEach((el) => el.addEventListener("click", () => addRecent(q)));
    }

    searchToggle.addEventListener("click", () => {
      const isOpen = searchInput.style.width !== "0px" && searchInput.style.width !== "";
      if (isOpen) {
        searchInput.style.width = "0";
        searchInput.style.opacity = "0";
        searchInput.style.padding = "0";
        closeDropdown();
      } else {
        searchInput.style.width = "220px";
        searchInput.style.opacity = "1";
        searchInput.style.padding = "6px 8px";
        searchInput.focus();
      }
    });

    searchInput.addEventListener("focus", () => {
      const q = searchInput.value.trim();
      q ? runSearch(q) : renderRecent();
    });

    searchInput.addEventListener("input", () => {
      clearTimeout(debounceTimer);
      const q = searchInput.value.trim();
      debounceTimer = setTimeout(() => runSearch(q), 200);
    });

    searchInput.addEventListener("keydown", (e) => {
      if (!dropdown.classList.contains("open") || !searchItems.length) return;
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActive((activeIndex + 1) % searchItems.length);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setActive((activeIndex - 1 + searchItems.length) % searchItems.length);
      } else if (e.key === "Enter" && activeIndex >= 0) {
        e.preventDefault();
        searchItems[activeIndex].onSelect();
      } else if (e.key === "Escape") {
        closeDropdown();
        searchInput.blur();
      }
    });

    document.addEventListener("click", (e) => {
      if (searchWrap && !searchWrap.contains(e.target)) closeDropdown();
    });
  }
  if (searchForm) {
    searchForm.addEventListener("submit", (e) => {
      e.preventDefault();
      const q = searchInput.value.trim();
      if (q) {
        addRecentSearch(q);
        window.location.href = `collection.html?q=${encodeURIComponent(q)}`;
      }
    });
  }

  updateCartBadge();
}
