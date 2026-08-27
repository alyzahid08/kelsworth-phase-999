/* AL-QUTUZ — admin panel shared chrome + fetch wrapper */

async function adminFetch(url, options = {}) {
  const res = await fetch(url, {
    ...options,
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
  });
  if (res.status === 401) {
    location.href = "/admin/login.html";
    throw new Error("Not authenticated");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Request failed");
  return data;
}

function sidebarHTML(active) {
  const role = window._adminRole || 'viewer';
  const canStaff = ['super_admin'].includes(role);
  const canFlash = ['super_admin','manager'].includes(role);
  const canAbandoned = ['super_admin','manager'].includes(role);

  let links = `
    <a href="dashboard.html" class="${active === 'dashboard' ? 'active' : ''}">Dashboard</a>
    <a href="index.html" class="${active === 'orders' ? 'active' : ''}">Orders</a>
    <a href="products.html" class="${active === 'products' ? 'active' : ''}">Products</a>
    <a href="promo-codes.html" class="${active === 'promo' ? 'active' : ''}">Promo Codes</a>`;

  if (canFlash) {
    links += `\n    <a href="flash-sales.html" class="${active === 'flash-sales' ? 'active' : ''}">Flash Sales</a>`;
  }
  if (canAbandoned) {
    links += `\n    <a href="abandoned-carts.html" class="${active === 'abandoned-carts' ? 'active' : ''}">Abandoned Carts</a>`;
  }

  links += `\n    <a href="messages.html" class="${active === 'messages' ? 'active' : ''}">Messages</a>`;

  if (canStaff) {
    links += `\n    <a href="staff.html" class="${active === 'staff' ? 'active' : ''}">Staff</a>`;
  }

  links += `\n    <a href="/" target="_blank">View Store ↗</a>`;

  return `
  <a href="dashboard.html" class="logo admin-brand-lockup" style="display:flex">
    <img src="/images/brand/logo-alqutuz.png" alt="AL-QUTUZ" class="admin-brand-crest" />
    <span class="admin-brand-wordmark">AL-QUTUZ</span>
  </a>
  <nav class="admin-nav">${links}</nav>
  <div class="spacer"></div>
  <button class="logout-btn" id="logoutBtn">Log Out</button>`;
}

function mountAdminChrome(active) {
  const el = document.getElementById("adminSidebar");
  if (el) el.innerHTML = sidebarHTML(active);
  const logoutBtn = document.getElementById("logoutBtn");
  if (logoutBtn) {
    logoutBtn.addEventListener("click", async () => {
      await fetch("/api/admin/logout", { method: "POST" });
      location.href = "/admin/login.html";
    });
  }
  // Fetch admin role for role-based nav
  fetch("/api/admin/me").then(r => r.json()).then(d => { window._adminRole = d.role; const el2 = document.getElementById("adminSidebar"); if (el2) el2.innerHTML = sidebarHTML(active); }).catch(() => {});
}

function formatPKR(amount) {
  return "Rs. " + Number(amount).toLocaleString("en-PK");
}

function formatDate(iso) {
  return new Date(iso).toLocaleString("en-PK", { dateStyle: "medium", timeStyle: "short" });
}
