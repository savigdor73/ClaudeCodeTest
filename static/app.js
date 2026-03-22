// ═══════════════════════════════════════════════════════════
//  SmallBiz Hub — SPA Router + All Page Logic
// ═══════════════════════════════════════════════════════════

const API = '';   // same origin

// ── Token storage ─────────────────────────────────────────
const store = {
  get access()  { return localStorage.getItem('access_token'); },
  get refresh() { return localStorage.getItem('refresh_token'); },
  get user()    { try { return JSON.parse(localStorage.getItem('user')); } catch { return null; } },
  set(access, refresh, user) {
    localStorage.setItem('access_token',  access);
    localStorage.setItem('refresh_token', refresh);
    localStorage.setItem('user',          JSON.stringify(user));
  },
  clear() {
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
    localStorage.removeItem('user');
  },
};

// ── Theme ─────────────────────────────────────────────────
const THEMES = [
  { id: 'blue',    label: 'Blue',    color: '#0d6efd' },
  { id: 'slate',   label: 'Slate',   color: '#6366f1' },
  { id: 'emerald', label: 'Emerald', color: '#10b981' },
  { id: 'violet',  label: 'Violet',  color: '#8b5cf6' },
  { id: 'sunset',  label: 'Sunset',  color: '#f97316' },
];

function getThemeKey() {
  const user = store.user;
  return user ? `theme_${user.id}` : 'theme_guest';
}

function applyTheme(themeId, persist = true) {
  const html = document.documentElement;
  if (themeId && themeId !== 'blue') {
    html.setAttribute('data-theme', themeId);
  } else {
    html.removeAttribute('data-theme');
  }

  if (persist) {
    // Cache locally
    localStorage.setItem(getThemeKey(), themeId || 'blue');

    // Save to DB (fire-and-forget)
    const user = store.user;
    if (user) {
      apiFetch(`/api/users/${user.id}`, {
        method: 'PUT',
        body: JSON.stringify({ theme: themeId }),
      }).catch(() => {});
      // Update cached user object so initTheme() reads correct value after reload
      user.theme = themeId;
      store.set(store.access, store.refresh, user);
    }
  }
}

function initTheme() {
  const user = store.user;
  // Prefer value from user object (set at login from DB), fall back to localStorage cache
  const saved = user?.theme || localStorage.getItem(getThemeKey()) || 'blue';
  applyTheme(saved, false);
}

// ── API helper ────────────────────────────────────────────
async function apiFetch(path, options = {}, retry = true) {
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  if (store.access) headers['Authorization'] = `Bearer ${store.access}`;

  const res = await fetch(`${API}${path}`, { ...options, headers });

  if (res.status === 401 && retry && store.refresh) {
    // Try refresh
    const r = await fetch(`${API}/api/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: store.refresh }),
    });
    if (r.ok) {
      const d = await r.json();
      store.set(d.data.access_token, d.data.refresh_token, store.user);
      return apiFetch(path, options, false);
    } else {
      store.clear();
      navigate('login');
      return null;
    }
  }
  return res;
}

// ── Toast ─────────────────────────────────────────────────
function toast(message, type = 'success') {
  const id = `t${Date.now()}`;
  const html = `
    <div id="${id}" class="toast align-items-center text-white bg-${type === 'success' ? 'success' : 'danger'} border-0" role="alert">
      <div class="d-flex">
        <div class="toast-body">${message}</div>
        <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast"></button>
      </div>
    </div>`;
  document.getElementById('toast-container').insertAdjacentHTML('beforeend', html);
  const el = document.getElementById(id);
  new bootstrap.Toast(el, { delay: 3500 }).show();
  el.addEventListener('hidden.bs.toast', () => el.remove());
}

// ── Confirm dialog ────────────────────────────────────────
function confirmDialog(title, body) {
  return new Promise(resolve => {
    document.getElementById('confirmTitle').textContent = title;
    document.getElementById('confirmBody').textContent  = body;
    const modal = new bootstrap.Modal(document.getElementById('confirmModal'));
    const btn   = document.getElementById('confirmOk');
    const handler = () => { modal.hide(); resolve(true); };
    btn.addEventListener('click', handler, { once: true });
    document.getElementById('confirmModal').addEventListener('hidden.bs.modal', () => resolve(false), { once: true });
    modal.show();
  });
}

// ── Loading button ─────────────────────────────────────────
function setLoading(btn, loading) {
  if (loading) {
    btn.dataset.originalText = btn.innerHTML;
    btn.innerHTML = `<span class="btn-text">${btn.innerHTML}</span>`;
    btn.classList.add('btn-loading');
    btn.disabled = true;
  } else {
    btn.innerHTML = btn.dataset.originalText || btn.innerHTML;
    btn.classList.remove('btn-loading');
    btn.disabled = false;
  }
}

// ── Router ────────────────────────────────────────────────
const routes = {
  login:     renderLogin,
  register:  renderRegister,
  dashboard: renderDashboard,
  users:     renderUsers,
  profile:   renderProfile,
  settings:  renderSettings,
  pricing:   renderPricing,
};

function navigate(route) {
  window.location.hash = route;
}

function getHash() {
  return window.location.hash.replace('#', '') || 'dashboard';
}

async function handleRoute() {
  const route = getHash();
  const isLoggedIn = !!store.access;

  const authRoutes = ['login', 'register'];

  if (!isLoggedIn && !authRoutes.includes(route)) {
    showAuthWrapper();
    renderLogin();
    return;
  }
  if (isLoggedIn && authRoutes.includes(route)) {
    showAppShell();
    navigate('dashboard');
    return;
  }

  if (isLoggedIn) {
    showAppShell();
    updateShellUser();
    setActiveNav(route);
    updateHeader(route);
  } else {
    showAuthWrapper();
  }

  const renderFn = routes[route];
  if (renderFn) await renderFn();
}

function showAuthWrapper() {
  document.getElementById('auth-wrapper').style.display = 'flex';
  document.getElementById('app-shell').style.display    = 'none';
}
function showAppShell() {
  document.getElementById('auth-wrapper').style.display = 'none';
  document.getElementById('app-shell').style.display    = 'block';
}

function setActiveNav(route) {
  document.querySelectorAll('#nav-links .nav-link').forEach(a => {
    a.classList.toggle('active', a.getAttribute('href') === `#${route}`);
  });
}

const routeTitles = {
  dashboard: 'Dashboard',
  users:     'User Management',
  profile:   'My Profile',
  settings:  'Settings',
  pricing:   'Pricing & Plans',
};
function updateHeader(route) {
  const title = routeTitles[route] || route.charAt(0).toUpperCase() + route.slice(1);
  document.getElementById('header-title').textContent = title;
  document.getElementById('breadcrumb').innerHTML =
    `<li class="breadcrumb-item"><a href="#dashboard">Home</a></li>
     <li class="breadcrumb-item active">${title}</li>`;
}

function updateShellUser() {
  const user = store.user;
  if (!user) return;
  const initials = user.full_name?.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2) || '?';
  document.getElementById('sidebar-avatar').textContent  = initials;
  document.getElementById('sidebar-name').textContent    = user.full_name || user.email;
  document.getElementById('sidebar-role').textContent    = user.role;
  document.getElementById('header-username').textContent = user.full_name || user.email;

  // Show/hide users nav for non-admins
  const usersItem = document.getElementById('nav-users-item');
  if (usersItem) usersItem.style.display = user.role === 'admin' ? '' : 'none';
}

// ── Auth pages ────────────────────────────────────────────
function renderLogin() {
  document.getElementById('auth-card').innerHTML = `
    <div class="text-center mb-4">
      <i class="bi bi-grid-3x3-gap-fill text-primary fs-1"></i>
      <h4 class="mt-2 fw-bold">SmallBiz Hub</h4>
      <p class="text-muted small">Sign in to your account</p>
    </div>
    <form id="login-form">
      <div class="mb-3">
        <label class="form-label">Email</label>
        <input type="email" class="form-control" id="login-email" placeholder="admin@example.com" required />
        <div class="invalid-feedback" id="login-email-err"></div>
      </div>
      <div class="mb-3">
        <label class="form-label">Password</label>
        <input type="password" class="form-control" id="login-pass" placeholder="••••••••" required />
        <div class="invalid-feedback" id="login-pass-err"></div>
      </div>
      <div class="alert alert-danger d-none" id="login-error"></div>
      <button type="submit" class="btn btn-primary w-100" id="login-btn">
        <span class="btn-text">Sign In</span>
      </button>
    </form>
    <hr />
    <p class="text-center small text-muted">No account? <a href="#register">Register</a></p>`;

  document.getElementById('login-form').addEventListener('submit', async e => {
    e.preventDefault();
    const btn   = document.getElementById('login-btn');
    const email = document.getElementById('login-email').value.trim();
    const pass  = document.getElementById('login-pass').value;
    const errEl = document.getElementById('login-error');

    errEl.classList.add('d-none');
    setLoading(btn, true);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password: pass }),
      });
      const data = await res.json();
      if (!res.ok) {
        errEl.textContent = data.detail?.message || 'Login failed';
        errEl.classList.remove('d-none');
      } else {
        store.set(data.data.access_token, data.data.refresh_token, data.data.user);
        initTheme();
        toast('Welcome back, ' + data.data.user.full_name);
        navigate('dashboard');
      }
    } catch {
      errEl.textContent = 'Network error. Please try again.';
      errEl.classList.remove('d-none');
    } finally {
      setLoading(btn, false);
    }
  });
}

function renderRegister() {
  document.getElementById('auth-card').innerHTML = `
    <div class="text-center mb-4">
      <i class="bi bi-person-plus-fill text-primary fs-1"></i>
      <h4 class="mt-2 fw-bold">Create Account</h4>
      <p class="text-muted small">Register the first admin account</p>
    </div>
    <form id="reg-form">
      <div class="mb-3">
        <label class="form-label">Full Name</label>
        <input type="text" class="form-control" id="reg-name" required />
      </div>
      <div class="mb-3">
        <label class="form-label">Email</label>
        <input type="email" class="form-control" id="reg-email" required />
      </div>
      <div class="mb-3">
        <label class="form-label">Password</label>
        <input type="password" class="form-control" id="reg-pass" minlength="8" required />
      </div>
      <div class="alert alert-danger d-none" id="reg-error"></div>
      <button type="submit" class="btn btn-primary w-100" id="reg-btn">
        <span class="btn-text">Register</span>
      </button>
    </form>
    <hr />
    <p class="text-center small text-muted">Already have an account? <a href="#login">Sign in</a></p>`;

  document.getElementById('reg-form').addEventListener('submit', async e => {
    e.preventDefault();
    const btn  = document.getElementById('reg-btn');
    const errEl = document.getElementById('reg-error');
    errEl.classList.add('d-none');
    setLoading(btn, true);
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          full_name: document.getElementById('reg-name').value.trim(),
          email:     document.getElementById('reg-email').value.trim(),
          password:  document.getElementById('reg-pass').value,
          role:      'staff',
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        errEl.textContent = data.detail?.message || 'Registration failed';
        errEl.classList.remove('d-none');
      } else {
        toast('Account created! Please sign in.');
        navigate('login');
      }
    } catch {
      errEl.textContent = 'Network error.';
      errEl.classList.remove('d-none');
    } finally {
      setLoading(btn, false);
    }
  });
}

// ── Dashboard page ────────────────────────────────────────
async function renderDashboard() {
  const outlet = document.getElementById('router-outlet');
  const user = store.user;

  if (user?.role !== 'admin' && (user?.plan !== 'pro' || user?.subscription_status !== 'active')) {
    outlet.innerHTML = `
      <div class="card shadow-sm text-center p-5">
        <i class="bi bi-lock-fill fs-1 text-muted mb-3"></i>
        <h5 class="fw-bold">Pro Feature</h5>
        <p class="text-muted">Dashboard stats and reports are available on the Pro plan.</p>
        <a href="#pricing" class="btn btn-primary">View Plans</a>
      </div>`;
    return;
  }

  outlet.innerHTML = `<div class="text-center py-5"><div class="spinner-border text-primary"></div></div>`;

  const res  = await apiFetch('/api/dashboard/stats');
  if (!res) return;
  const body = await res.json();

  if (!body.success) { outlet.innerHTML = `<div class="alert alert-danger">${body.message}</div>`; return; }
  const d = body.data;

  outlet.innerHTML = `
    <div class="row g-3 mb-4">
      <div class="col-sm-6 col-lg-3">
        <div class="card stat-card">
          <div class="card-body d-flex align-items-center gap-3">
            <div class="stat-icon bg-primary bg-opacity-10 text-primary"><i class="bi bi-people-fill"></i></div>
            <div>
              <div class="fs-4 fw-bold">${d.total_users}</div>
              <div class="text-muted small">Total Users</div>
            </div>
          </div>
        </div>
      </div>
      <div class="col-sm-6 col-lg-3">
        <div class="card stat-card">
          <div class="card-body d-flex align-items-center gap-3">
            <div class="stat-icon bg-success bg-opacity-10 text-success"><i class="bi bi-person-check-fill"></i></div>
            <div>
              <div class="fs-4 fw-bold">${d.active_users}</div>
              <div class="text-muted small">Active Users</div>
            </div>
          </div>
        </div>
      </div>
      <div class="col-sm-6 col-lg-3">
        <div class="card stat-card">
          <div class="card-body d-flex align-items-center gap-3">
            <div class="stat-icon bg-warning bg-opacity-10 text-warning"><i class="bi bi-lightning-charge-fill"></i></div>
            <div>
              <div class="fs-4 fw-bold">${d.active_sessions}</div>
              <div class="text-muted small">Active Sessions</div>
            </div>
          </div>
        </div>
      </div>
      <div class="col-sm-6 col-lg-3">
        <div class="card stat-card">
          <div class="card-body d-flex align-items-center gap-3">
            <div class="stat-icon bg-info bg-opacity-10 text-info"><i class="bi bi-graph-up-arrow"></i></div>
            <div>
              <div class="fs-4 fw-bold">${d.recent_logins.length}</div>
              <div class="text-muted small">Recent Logins</div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div class="card shadow-sm">
      <div class="card-header bg-white fw-semibold">Recent Login Activity</div>
      <div class="card-body p-0">
        <div class="table-responsive">
          <table class="table table-hover align-middle mb-0">
            <thead class="table-light">
              <tr>
                <th>User</th><th>Role</th><th>Last Login</th>
              </tr>
            </thead>
            <tbody>
              ${d.recent_logins.length === 0
                ? `<tr><td colspan="3" class="text-center text-muted py-4">No logins yet</td></tr>`
                : d.recent_logins.map(u => `
                  <tr>
                    <td>
                      <div class="fw-semibold">${esc(u.full_name)}</div>
                      <div class="text-muted small">${esc(u.email)}</div>
                    </td>
                    <td><span class="badge bg-${roleBadge(u.role)} badge-role">${esc(u.role)}</span></td>
                    <td class="text-muted small">${formatDate(u.last_login)}</td>
                  </tr>`).join('')
              }
            </tbody>
          </table>
        </div>
      </div>
    </div>`;
}

// ── Users page ────────────────────────────────────────────
async function renderUsers() {
  const user = store.user;
  if (user?.role !== 'admin') { navigate('dashboard'); return; }

  const outlet = document.getElementById('router-outlet');
  outlet.innerHTML = `<div class="text-center py-5"><div class="spinner-border text-primary"></div></div>`;

  const res  = await apiFetch('/api/users');
  if (!res) return;
  const body = await res.json();
  if (!body.success) { outlet.innerHTML = `<div class="alert alert-danger">${body.message}</div>`; return; }

  const users = body.data.users;

  outlet.innerHTML = `
    <div class="d-flex justify-content-between align-items-center mb-3">
      <h5 class="mb-0">All Users <span class="badge bg-secondary">${body.data.total}</span></h5>
      <button class="btn btn-primary btn-sm" id="btn-new-user">
        <i class="bi bi-person-plus me-1"></i>New User
      </button>
    </div>

    <div class="mb-3">
      <input type="search" class="form-control form-control-sm" id="user-search"
             placeholder="Search by name or email…" style="max-width:320px" />
    </div>

    <div class="card shadow-sm">
      <div class="card-body p-0">
        <div class="table-responsive">
          <table class="table table-hover align-middle mb-0" id="users-table">
            <thead class="table-light">
              <tr>
                <th>User</th><th>Role</th><th>Status</th><th>Joined</th><th>Last Login</th><th></th>
              </tr>
            </thead>
            <tbody id="users-tbody">
              ${renderUserRows(users)}
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- New/Edit User Modal -->
    <div class="modal fade" id="userModal" tabindex="-1">
      <div class="modal-dialog modal-dialog-centered">
        <div class="modal-content">
          <div class="modal-header">
            <h6 class="modal-title" id="userModalTitle">New User</h6>
            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
          </div>
          <div class="modal-body" id="userModalBody"></div>
        </div>
      </div>
    </div>`;

  // Search
  document.getElementById('user-search').addEventListener('input', e => {
    const q = e.target.value.toLowerCase();
    const filtered = users.filter(u =>
      u.full_name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q)
    );
    document.getElementById('users-tbody').innerHTML = renderUserRows(filtered);
    bindUserTableActions();
  });

  document.getElementById('btn-new-user').addEventListener('click', () => showUserModal(null));
  bindUserTableActions();
}

function renderUserRows(users) {
  if (!users.length) return `<tr><td colspan="6" class="text-center text-muted py-4">No users found</td></tr>`;
  return users.map(u => `
    <tr data-id="${u.id}">
      <td>
        <div class="fw-semibold">${esc(u.full_name)}</div>
        <div class="text-muted small">${esc(u.email)}</div>
      </td>
      <td><span class="badge bg-${roleBadge(u.role)} badge-role">${esc(u.role)}</span></td>
      <td>
        <span class="badge bg-${u.is_active ? 'success' : 'secondary'} badge-role">
          ${u.is_active ? 'Active' : 'Inactive'}
        </span>
      </td>
      <td class="text-muted small">${formatDate(u.created_at)}</td>
      <td class="text-muted small">${u.last_login ? formatDate(u.last_login) : '—'}</td>
      <td class="text-end">
        <button class="btn btn-sm btn-outline-secondary me-1 btn-edit" data-id="${u.id}" title="Edit">
          <i class="bi bi-pencil"></i>
        </button>
        ${u.is_active ? `
        <button class="btn btn-sm btn-outline-danger btn-deactivate" data-id="${u.id}" data-name="${esc(u.full_name)}" title="Deactivate">
          <i class="bi bi-person-x"></i>
        </button>` : ''}
      </td>
    </tr>`).join('');
}

function bindUserTableActions() {
  document.querySelectorAll('.btn-edit').forEach(btn => {
    btn.addEventListener('click', () => showUserModal(btn.dataset.id));
  });
  document.querySelectorAll('.btn-deactivate').forEach(btn => {
    btn.addEventListener('click', async () => {
      const ok = await confirmDialog('Deactivate User', `Deactivate "${btn.dataset.name}"?`);
      if (!ok) return;
      const res = await apiFetch(`/api/users/${btn.dataset.id}`, { method: 'DELETE' });
      if (res?.ok) { toast('User deactivated'); renderUsers(); }
      else { toast('Failed to deactivate', 'error'); }
    });
  });
}

async function showUserModal(userId) {
  const modal    = new bootstrap.Modal(document.getElementById('userModal'));
  const title    = document.getElementById('userModalTitle');
  const body     = document.getElementById('userModalBody');
  let userData   = null;

  if (userId) {
    title.textContent = 'Edit User';
    const res = await apiFetch(`/api/users/${userId}`);
    if (res?.ok) userData = (await res.json()).data;
  } else {
    title.textContent = 'New User';
  }

  body.innerHTML = `
    <form id="user-form">
      <div class="mb-3">
        <label class="form-label">Full Name</label>
        <input type="text" class="form-control" id="uf-name" value="${esc(userData?.full_name || '')}" required />
      </div>
      ${!userId ? `
      <div class="mb-3">
        <label class="form-label">Email</label>
        <input type="email" class="form-control" id="uf-email" value="${esc(userData?.email || '')}" required />
      </div>
      <div class="mb-3">
        <label class="form-label">Password</label>
        <input type="password" class="form-control" id="uf-pass" minlength="8" required />
      </div>` : ''}
      <div class="mb-3">
        <label class="form-label">Role</label>
        <select class="form-select" id="uf-role">
          <option value="staff"   ${userData?.role === 'staff'   ? 'selected' : ''}>Staff</option>
          <option value="manager" ${userData?.role === 'manager' ? 'selected' : ''}>Manager</option>
          <option value="admin"   ${userData?.role === 'admin'   ? 'selected' : ''}>Admin</option>
        </select>
      </div>
      ${userId ? `
      <div class="mb-3">
        <label class="form-label">New Password <small class="text-muted">(leave blank to keep)</small></label>
        <input type="password" class="form-control" id="uf-pass" />
      </div>` : ''}
      <div class="alert alert-danger d-none" id="uf-error"></div>
      <div class="d-flex gap-2 justify-content-end">
        <button type="button" class="btn btn-secondary btn-sm" data-bs-dismiss="modal">Cancel</button>
        <button type="submit" class="btn btn-primary btn-sm" id="uf-submit">Save</button>
      </div>
    </form>`;

  modal.show();

  document.getElementById('user-form').addEventListener('submit', async e => {
    e.preventDefault();
    const btn   = document.getElementById('uf-submit');
    const errEl = document.getElementById('uf-error');
    errEl.classList.add('d-none');
    setLoading(btn, true);

    const payload = {
      full_name: document.getElementById('uf-name').value.trim(),
      role:      document.getElementById('uf-role').value,
    };
    const passEl = document.getElementById('uf-pass');
    if (passEl?.value) payload.password = passEl.value;
    if (!userId) {
      payload.email    = document.getElementById('uf-email').value.trim();
      payload.password = passEl.value;
    }

    const res = await apiFetch(
      userId ? `/api/users/${userId}` : '/api/users',
      { method: userId ? 'PUT' : 'POST', body: JSON.stringify(payload) }
    );
    setLoading(btn, false);
    if (res?.ok) {
      modal.hide();
      toast(userId ? 'User updated' : 'User created');
      renderUsers();
    } else {
      const d = await res?.json();
      errEl.textContent = d?.detail?.message || 'Error saving user';
      errEl.classList.remove('d-none');
    }
  });
}

// ── Profile page ──────────────────────────────────────────
async function renderProfile() {
  const outlet = document.getElementById('router-outlet');
  outlet.innerHTML = `<div class="text-center py-5"><div class="spinner-border text-primary"></div></div>`;

  const res  = await apiFetch('/api/auth/me');
  if (!res) return;
  const body = await res.json();
  if (!body.success) { outlet.innerHTML = `<div class="alert alert-danger">${body.message}</div>`; return; }
  const u = body.data;

  outlet.innerHTML = `
    <div class="row justify-content-center">
      <div class="col-lg-6">
        <div class="card shadow-sm">
          <div class="card-body">
            <div class="d-flex align-items-center gap-3 mb-4">
              <div class="bg-primary rounded-circle d-flex align-items-center justify-content-center text-white fw-bold"
                   style="width:60px;height:60px;font-size:1.3rem">
                ${u.full_name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0,2)}
              </div>
              <div>
                <h5 class="mb-0">${esc(u.full_name)}</h5>
                <span class="badge bg-${roleBadge(u.role)}">${u.role}</span>
              </div>
            </div>
            <form id="profile-form">
              <div class="mb-3">
                <label class="form-label">Full Name</label>
                <input type="text" class="form-control" id="pf-name" value="${esc(u.full_name)}" required />
              </div>
              <div class="mb-3">
                <label class="form-label">Email</label>
                <input type="email" class="form-control" value="${esc(u.email)}" disabled />
                <div class="form-text">Email cannot be changed.</div>
              </div>
              <div class="mb-3">
                <label class="form-label">New Password <small class="text-muted">(leave blank to keep)</small></label>
                <input type="password" class="form-control" id="pf-pass" />
              </div>
              <div class="alert alert-danger d-none" id="pf-error"></div>
              <button type="submit" class="btn btn-primary" id="pf-submit">Save Changes</button>
            </form>
            <hr />
            <dl class="row mb-0 small text-muted">
              <dt class="col-sm-4">Member since</dt>
              <dd class="col-sm-8">${formatDate(u.created_at)}</dd>
              <dt class="col-sm-4">Last login</dt>
              <dd class="col-sm-8">${u.last_login ? formatDate(u.last_login) : '—'}</dd>
            </dl>
          </div>
        </div>
      </div>
    </div>`;

  document.getElementById('profile-form').addEventListener('submit', async e => {
    e.preventDefault();
    const btn   = document.getElementById('pf-submit');
    const errEl = document.getElementById('pf-error');
    errEl.classList.add('d-none');
    setLoading(btn, true);

    const payload = { full_name: document.getElementById('pf-name').value.trim() };
    const pass    = document.getElementById('pf-pass').value;
    if (pass) payload.password = pass;

    const res = await apiFetch(`/api/users/${u.id}`, { method: 'PUT', body: JSON.stringify(payload) });
    setLoading(btn, false);
    if (res?.ok) {
      const upd = store.user;
      if (upd) { upd.full_name = payload.full_name; store.set(store.access, store.refresh, upd); }
      updateShellUser();
      toast('Profile updated');
    } else {
      const d = await res?.json();
      errEl.textContent = d?.detail?.message || 'Error updating profile';
      errEl.classList.remove('d-none');
    }
  });
}

// ── Settings page ─────────────────────────────────────────
function renderSettings() {
  const current = localStorage.getItem(getThemeKey()) || 'blue';
  document.getElementById('router-outlet').innerHTML = `
    <div class="row justify-content-center">
      <div class="col-lg-6">
        <div class="card shadow-sm">
          <div class="card-body">
            <h6 class="fw-semibold mb-1">Appearance</h6>
            <p class="text-muted small mb-3">Choose your color theme. Saved per user on this device.</p>
            <div class="d-flex flex-wrap gap-2" id="theme-picker">
              ${THEMES.map(t => `
                <button class="theme-swatch ${current === t.id ? 'active' : ''}"
                        data-theme="${t.id}" title="${t.label}"
                        style="--swatch-color:${t.color}">
                  <span class="swatch-circle"></span>
                  <span class="swatch-label">${t.label}</span>
                </button>`).join('')}
            </div>
          </div>
        </div>
      </div>
    </div>`;

  document.getElementById('theme-picker').addEventListener('click', e => {
    const btn = e.target.closest('[data-theme]');
    if (!btn) return;
    applyTheme(btn.dataset.theme);
    document.querySelectorAll('#theme-picker .theme-swatch').forEach(b => {
      b.classList.toggle('active', b === btn);
    });
    toast('Theme applied');
  });
}

// ── Pricing page ──────────────────────────────────────────
async function renderPricing() {
  const outlet = document.getElementById('router-outlet');
  const user = store.user;

  // Fetch price IDs and Paddle config from server
  let prices = {};
  try {
    const res = await apiFetch('/api/billing/config');
    if (res?.ok) {
      const d = await res.json();
      prices = d.data.prices ?? {};
      const clientToken = d.data.client_token;
      const environment = d.data.environment;
      if (clientToken && window.Paddle) {
        if (environment === 'sandbox') window.Paddle.Environment.set('sandbox');
        window.Paddle.Initialize({ token: clientToken });
      }
    }
  } catch { /* proceed with empty prices — buttons will be disabled */ }

  const plans = [
    {
      id: 'basic',
      name: 'Basic',
      color: 'info',
      price: { monthly: '$9', yearly: '$90' },
      priceId: { monthly: prices.basic_monthly ?? '', yearly: prices.basic_yearly ?? '' },
      features: ['Up to 5 users', 'Core dashboard', 'Session management', 'Email support'],
    },
    {
      id: 'pro',
      name: 'Pro',
      color: 'primary',
      price: { monthly: '$29', yearly: '$290' },
      priceId: { monthly: prices.pro_monthly ?? '', yearly: prices.pro_yearly ?? '' },
      features: ['Unlimited users', 'Dashboard stats & reports', 'Audit log access', 'Priority support'],
    },
  ];

  outlet.innerHTML = `
    <div class="mb-4 text-center">
      <div class="btn-group" role="group" id="billing-toggle">
        <input type="radio" class="btn-check" name="billing" id="bill-monthly" value="monthly" checked />
        <label class="btn btn-outline-primary" for="bill-monthly">Monthly</label>
        <input type="radio" class="btn-check" name="billing" id="bill-yearly" value="yearly" />
        <label class="btn btn-outline-primary" for="bill-yearly">Yearly <span class="badge bg-success ms-1">Save 17%</span></label>
      </div>
    </div>
    <div class="row g-4 justify-content-center" id="plan-cards">
      ${plans.map(p => `
        <div class="col-md-5">
          <div class="card shadow-sm h-100 ${user?.plan === p.id ? 'border-' + p.color : ''}">
            <div class="card-body d-flex flex-column">
              <h5 class="card-title fw-bold text-${p.color}">${p.name}</h5>
              <div class="mb-3">
                <span class="fs-2 fw-bold" id="price-${p.id}">${p.price.monthly}</span>
                <span class="text-muted" id="period-${p.id}">/month</span>
              </div>
              <ul class="list-unstyled flex-grow-1">
                ${p.features.map(f => `<li class="mb-1"><i class="bi bi-check-circle-fill text-success me-2"></i>${esc(f)}</li>`).join('')}
              </ul>
              ${user?.plan === p.id
                ? `<span class="btn btn-outline-${p.color} disabled w-100 mt-3">Current Plan</span>`
                : `<button class="btn btn-${p.color} w-100 mt-3" data-plan="${p.id}" data-price-monthly="${p.priceId.monthly}" data-price-yearly="${p.priceId.yearly}">Subscribe</button>`
              }
            </div>
          </div>
        </div>`).join('')}
    </div>`;

  function updatePrices(period) {
    plans.forEach(p => {
      const priceEl = document.getElementById(`price-${p.id}`);
      const periodEl = document.getElementById(`period-${p.id}`);
      if (priceEl) priceEl.textContent = p.price[period];
      if (periodEl) periodEl.textContent = period === 'yearly' ? '/year' : '/month';
    });
  }

  document.querySelectorAll('input[name="billing"]').forEach(radio => {
    radio.addEventListener('change', () => updatePrices(radio.value));
  });

  outlet.addEventListener('click', e => {
    const btn = e.target.closest('button[data-plan]');
    if (!btn) return;
    const period = document.querySelector('input[name="billing"]:checked')?.value || 'monthly';
    const priceId = period === 'yearly' ? btn.dataset.priceYearly : btn.dataset.priceMonthly;
    openCheckout(priceId, btn);
  });
}

async function openCheckout(priceId, btn) {
  if (!priceId) { toast('Plan not available yet', 'error'); return; }
  if (!window.Paddle) { toast('Payment system not loaded', 'error'); return; }

  // Validate price_id server-side before opening checkout
  const res = await apiFetch('/api/billing/checkout', {
    method: 'POST',
    body: JSON.stringify({ price_id: priceId }),
  });
  if (!res || !res.ok) { toast('Could not start checkout', 'error'); return; }
  const data = await res.json();

  window.Paddle.Checkout.open({
    items: [{ priceId: data.data.price_id, quantity: 1 }],
    customData: { user_id: data.data.user_id },
    settings: { displayMode: 'overlay', theme: 'light' },
    eventCallback(event) {
      if (event.name === 'checkout.completed') {
        apiFetch('/api/billing/status').then(async r => {
          if (r?.ok) {
            const d = await r.json();
            const u = store.user;
            u.plan = d.data.plan;
            u.subscription_status = d.data.subscription_status;
            store.set(store.access, store.refresh, u);
            toast('Subscription activated!');
            navigate('dashboard');
          }
        });
      }
    },
  });
}

// ── Logout ────────────────────────────────────────────────
async function logout() {
  if (store.refresh && store.access) {
    await apiFetch('/api/auth/logout', {
      method:  'POST',
      body:    JSON.stringify({ refresh_token: store.refresh }),
    }).catch(() => {});
  }
  store.clear();
  toast('Signed out');
  navigate('login');
}

// ── Helpers ───────────────────────────────────────────────
function esc(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function roleBadge(role) {
  return role === 'admin' ? 'danger' : role === 'manager' ? 'warning' : 'secondary';
}
function formatDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

// ── Bootstrap ─────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  window.addEventListener('hashchange', handleRoute);

  document.getElementById('btn-logout').addEventListener('click', logout);
  document.getElementById('header-logout').addEventListener('click', e => { e.preventDefault(); logout(); });

  document.getElementById('btn-toggle-sidebar').addEventListener('click', () => {
    document.getElementById('sidebar').classList.toggle('open');
  });
  document.getElementById('sidebar-overlay').addEventListener('click', () => {
    document.getElementById('sidebar').classList.remove('open');
  });

  initTheme();
  handleRoute();

  // Refresh subscription status when user returns from Paddle checkout tab
  document.addEventListener('visibilitychange', async () => {
    if (document.visibilityState === 'visible' && store.user?.plan === 'free') {
      const res = await apiFetch('/api/billing/status').catch(() => null);
      if (res?.ok) {
        const d = await res.json();
        if (d.data.plan !== 'free') {
          const u = store.user;
          u.plan = d.data.plan;
          u.subscription_status = d.data.subscription_status;
          store.set(store.access, store.refresh, u);
          toast('Subscription activated!');
          navigate('dashboard');
        }
      }
    }
  });
});
