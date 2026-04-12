/* ===================================================
   app.js – Controlador principal
   Maneja la navegación, eventos y flujo de la app
   =================================================== */

// ============================================================
// TOAST NOTIFICATIONS
// ============================================================
function showToast(message, type = 'info', duration = 3000) {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transition = 'opacity 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

// ============================================================
// NAVEGACIÓN ENTRE VISTAS
// ============================================================
const App = {
  currentView: 'dashboard',

  showView(viewId, title = '') {
    document.querySelectorAll('.view').forEach(v => {
      v.classList.remove('active');
      v.classList.add('hidden');
    });
    const view = document.getElementById(`view-${viewId}`);
    if (view) {
      view.classList.remove('hidden');
      view.classList.add('active');
    }
    this.currentView = viewId;

    // Actualizar topbar
    const titleEl = document.getElementById('topbar-title');
    const backBtn = document.getElementById('btn-back');
    if (viewId === 'dashboard') {
      titleEl.textContent = 'Inicio';
      backBtn.classList.add('hidden');
    } else {
      titleEl.textContent = title || viewId;
      backBtn.classList.remove('hidden');
    }

    // Scroll to top
    window.scrollTo(0, 0);
  },

  goBack() {
    this.showView('dashboard');
    this.refreshDashboard();
  },

  // ============================================================
  // LOGIN
  // ============================================================
  initLogin() {
    const form = document.getElementById('form-login');
    form.addEventListener('submit', async e => {
      e.preventDefault();
      const btn      = document.getElementById('btn-login');
      const username = document.getElementById('login-user').value.trim();
      const password = document.getElementById('login-pass').value;

      btn.disabled    = true;
      btn.textContent = 'Iniciando...';

      const result = await DB.loginWithCredentials(username, password);

      if (result.ok) {
        this.startApp();
      } else {
        document.getElementById('login-error').classList.remove('hidden');
        document.getElementById('login-pass').value = '';
        btn.disabled    = false;
        btn.textContent = 'Iniciar Sesión';
      }
    });
  },

  startApp(userFromFirebase) {
    // Si Firebase nos pasa el usuario, actualizar sesión desde caché
    if (userFromFirebase && FIREBASE_CONFIGURED) {
      // La sesión ya está en DB._cache.session tras onAuthStateChanged
      if (!DB.getSession()) {
        // Puede que el perfil Firestore no esté listo aun, esperar un tick
        setTimeout(() => this.startApp(), 300);
        return;
      }
    }
    document.getElementById('screen-login').classList.remove('active');
    document.getElementById('screen-login').classList.add('hidden');
    document.getElementById('screen-app').classList.remove('hidden');
    document.getElementById('screen-app').classList.add('active');
    this.setupSession();
    this.setupEventListeners();
    this.showView('dashboard');
    this.refreshDashboard();
  },

  setupSession() {
    const session = DB.getSession();
    if (!session) return;

    // Mostrar nombre en topbar
    document.getElementById('topbar-user').textContent = session.name;

    // Saludo
    const hour = new Date().getHours();
    const greeting = hour < 13 ? 'Buenos días' : hour < 20 ? 'Buenas tardes' : 'Buenas noches';
    document.getElementById('hero-greeting').textContent = `${greeting}, ${session.name}`;

    // Mostrar panel admin si corresponde
    if (session.role === 'admin') {
      document.getElementById('admin-panel-btn').classList.remove('hidden');
      document.getElementById('btn-settings').style.display = ''; // mostrar settings
    }
  },

  // ============================================================
  // DASHBOARD
  // ============================================================
  refreshDashboard() {
    const session = DB.getSession();
    if (!session) return;
    InvoiceManager.updateDashboardStats(session.id);
    InvoiceManager.renderRecentInvoices(session.role === 'admin' ? null : session.id);
  },

  // ============================================================
  // NUEVA FACTURA: event listeners del formulario
  // ============================================================
  initNewInvoiceForm() {
    // Tipo IVA
    document.querySelectorAll('.iva-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.iva-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        InvoiceManager.currentIVA = Number(btn.dataset.iva);
        InvoiceManager.updateTotals();
      });
    });

    // Forma de cobro
    document.querySelectorAll('.payment-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.payment-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        InvoiceManager.currentPayment = btn.dataset.payment;
      });
    });

    // Botones añadir línea
    document.getElementById('btn-add-labor').addEventListener('click', () => InvoiceManager.addLine('labor'));
    document.getElementById('btn-add-part').addEventListener('click', () => InvoiceManager.addLine('part'));
    document.getElementById('btn-add-travel').addEventListener('click', () => InvoiceManager.addLine('travel'));
    document.getElementById('btn-add-custom').addEventListener('click', () => InvoiceManager.addLine('custom'));

    // Delegación de eventos en líneas (editar / eliminar)
    document.getElementById('line-items-container').addEventListener('input', e => {
      const input = e.target;
      const lineId = input.dataset.line;
      const field = input.dataset.field;
      if (lineId && field) {
        InvoiceManager.updateLine(lineId, field, input.value);
      }
    });
    document.getElementById('line-items-container').addEventListener('click', e => {
      const removeBtn = e.target.closest('[data-remove]');
      if (removeBtn) {
        InvoiceManager.removeLine(removeBtn.dataset.remove);
      }
    });

    // Serie → actualizar número de factura preview
    const updateInvoiceNumberPreview = async (series) => {
      const s   = (series || 'A').toUpperCase().trim();
      const num = await Promise.resolve(DB.peekNextInvoiceNumber(s));
      document.getElementById('invoice-number-display').textContent =
        `${s}${new Date().getFullYear()}-${String(num).padStart(4, '0')}`;
    };
    document.getElementById('inv-series').addEventListener('input', e => {
      updateInvoiceNumberPreview(e.target.value);
    });

    // Guardar factura
    document.getElementById('btn-save-invoice').addEventListener('click', async () => {
      if (!InvoiceManager.validate()) return;
      const btn        = document.getElementById('btn-save-invoice');
      btn.disabled     = true;
      btn.textContent  = 'Guardando...';
      try {
        const invoice = InvoiceManager.buildInvoiceData();
        // Obtener número real (async, atómico en Firestore)
        const series  = document.getElementById('inv-series').value.toUpperCase().trim() || 'A';
        const num     = await DB.getNextInvoiceNumber(series);
        invoice.num   = num;
        invoice.number = `${series}${new Date().getFullYear()}-${String(num).padStart(4,'0')}`;
        await DB.addInvoice(invoice);
        showToast(`✅ Factura ${invoice.number} guardada`, 'success');
        PrintManager.showPreview(invoice);
        InvoiceManager.initForm();
      } catch(err) {
        showToast('Error al guardar la factura. Comprueba la conexión.', 'error');
        console.error(err);
      } finally {
        btn.disabled    = false;
        btn.textContent = '💾 Guardar Factura';
      }
    });

    // Vista previa
    document.getElementById('btn-preview-invoice').addEventListener('click', () => {
      if (!InvoiceManager.validate()) return;
      // Construir factura temporal (sin guardar)
      const tmpInvoice = { ...InvoiceManager.buildInvoiceData(), number: document.getElementById('invoice-number-display').textContent };
      PrintManager.showPreview(tmpInvoice);
    });
  },

  // ============================================================
  // LISTADO DE FACTURAS
  // ============================================================
  loadInvoiceList() {
    const session = DB.getSession();
    const isAdmin = session?.role === 'admin';
    let invoices = DB.getInvoices();
    if (!isAdmin) invoices = invoices.filter(inv => inv.techId === session?.id);

    InvoiceManager.renderInvoiceList('invoices-list', invoices, isAdmin);
    InvoiceManager.populateMonthFilter('filter-month');

    // Búsqueda
    document.getElementById('search-invoices').addEventListener('input', e => {
      this.filterInvoices();
    });
    document.getElementById('filter-month').addEventListener('change', () => {
      this.filterInvoices();
    });
  },

  filterInvoices() {
    const session = DB.getSession();
    const isAdmin = session?.role === 'admin';
    const query = document.getElementById('search-invoices').value.toLowerCase();
    const month = document.getElementById('filter-month').value;

    let invoices = DB.getInvoices();
    if (!isAdmin) invoices = invoices.filter(inv => inv.techId === session?.id);

    if (month) invoices = invoices.filter(inv => inv.date?.startsWith(month));
    if (query) {
      invoices = invoices.filter(inv =>
        inv.client?.name?.toLowerCase().includes(query) ||
        inv.client?.nif?.toLowerCase().includes(query) ||
        inv.number?.toLowerCase().includes(query) ||
        inv.techName?.toLowerCase().includes(query)
      );
    }
    InvoiceManager.renderInvoiceList('invoices-list', invoices, isAdmin);
  },

  // ============================================================
  // PANEL ADMIN
  // ============================================================
  initAdminPanel() {
    // Tabs
    document.querySelectorAll('.admin-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.admin-tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.admin-content').forEach(c => {
          c.classList.remove('active');
          c.classList.add('hidden');
        });
        tab.classList.add('active');
        const target = document.getElementById(`admin-${tab.dataset.admintab}`);
        if (target) { target.classList.remove('hidden'); target.classList.add('active'); }

        if (tab.dataset.admintab === 'all-invoices') this.loadAdminInvoices();
        if (tab.dataset.admintab === 'technicians') this.loadTechsList();
        if (tab.dataset.admintab === 'company') this.loadCompanyForm();
        if (tab.dataset.admintab === 'overview') {
          InvoiceManager.updateDashboardStats(null);
        }
      });
    });

    // Exportar CSV
    document.getElementById('btn-export-csv').addEventListener('click', () => {
      DB.exportInvoicesCSV();
      showToast('CSV exportado correctamente', 'success');
    });

    // Búsqueda admin
    document.getElementById('admin-search').addEventListener('input', () => {
      const q = document.getElementById('admin-search').value.toLowerCase();
      let invoices = DB.getInvoices();
      if (q) invoices = invoices.filter(inv =>
        inv.client?.name?.toLowerCase().includes(q) ||
        inv.number?.toLowerCase().includes(q) ||
        inv.techName?.toLowerCase().includes(q)
      );
      InvoiceManager.renderInvoiceList('admin-invoices-list', invoices, true);
    });

    // Gestión técnicos
    document.getElementById('btn-add-tech').addEventListener('click', () => this.openTechModal());
    document.getElementById('btn-cancel-tech').addEventListener('click', () => this.closeTechModal());
    document.getElementById('tech-modal-overlay').addEventListener('click', () => this.closeTechModal());
    document.getElementById('btn-save-tech').addEventListener('click', () => this.saveTech());

    // Datos empresa
    document.getElementById('btn-save-company').addEventListener('click', () => this.saveCompanyForm());
  },

  loadAdminInvoices() {
    const invoices = DB.getInvoices();
    InvoiceManager.renderInvoiceList('admin-invoices-list', invoices, true);
  },

  loadTechsList() {
    const users = DB.getUsers();
    const container = document.getElementById('techs-list');
    container.innerHTML = '';
    if (users.length === 0) {
      container.innerHTML = `<div class="empty-state-mini">No hay técnicos registrados</div>`;
      return;
    }
    users.forEach(u => {
      const el = document.createElement('div');
      el.className = 'tech-item';
      el.innerHTML = `
        <div class="tech-info-main">
          <div class="tech-name">
            ${InvoiceManager.escapeHtml(u.name)}
            <span class="tech-role-badge ${u.role === 'admin' ? 'role-admin' : 'role-tech'}">
              ${u.role === 'admin' ? '🛡️ Admin' : '👷 Técnico'}
            </span>
          </div>
          <div class="tech-user">@${InvoiceManager.escapeHtml(u.username)}</div>
        </div>
        <div class="tech-actions">
          <button class="btn btn-outline btn-sm" data-edit-tech="${u.id}">Editar</button>
          ${u.username !== 'admin' ? `<button class="btn btn-outline btn-sm" style="color:var(--red)" data-delete-tech="${u.id}">Eliminar</button>` : ''}
        </div>`;
      container.appendChild(el);
    });

    container.addEventListener('click', e => {
      const editBtn = e.target.closest('[data-edit-tech]');
      const delBtn = e.target.closest('[data-delete-tech]');
      if (editBtn) this.openTechModal(editBtn.dataset.editTech);
      if (delBtn) {
        if (confirm('¿Eliminar este técnico?')) {
          DB.deleteUser(delBtn.dataset.deleteTech);
          this.loadTechsList();
          showToast('Técnico eliminado', 'info');
        }
      }
    });
  },

  openTechModal(userId = null) {
    const modal = document.getElementById('tech-form-modal');
    document.getElementById('tech-modal-title').textContent = userId ? 'Editar Técnico' : 'Nuevo Técnico';
    document.getElementById('btn-save-tech').dataset.editId = userId || '';
    // Limpiar campos
    ['tech-name-input','tech-user-input','tech-pass-input'].forEach(id => document.getElementById(id).value = '');
    document.getElementById('tech-role-input').value = 'tech';

    if (userId) {
      const user = DB.getUsers().find(u => u.id === userId);
      if (user) {
        document.getElementById('tech-name-input').value = user.name;
        document.getElementById('tech-user-input').value = user.username;
        document.getElementById('tech-role-input').value = user.role;
      }
    }
    modal.classList.remove('hidden');
  },

  closeTechModal() {
    document.getElementById('tech-form-modal').classList.add('hidden');
  },

  async saveTech() {
    const editId   = document.getElementById('btn-save-tech').dataset.editId;
    const name     = document.getElementById('tech-name-input').value.trim();
    const username = document.getElementById('tech-user-input').value.trim();
    const password = document.getElementById('tech-pass-input').value;
    const role     = document.getElementById('tech-role-input').value;

    if (!name || !username) { showToast('Nombre y usuario son obligatorios', 'error'); return; }
    if (!editId && !password) { showToast('La contraseña es obligatoria para nuevos técnicos', 'error'); return; }

    const btn          = document.getElementById('btn-save-tech');
    btn.disabled       = true;
    btn.textContent    = 'Guardando...';

    try {
      if (editId) {
        const updates = { name, username, role };
        if (password) updates.password = password;
        const res = await DB.updateUser(editId, updates);
        if (!res.ok) { showToast(res.error, 'error'); return; }
        showToast('Técnico actualizado correctamente', 'success');
      } else {
        const res = await DB.addUser({ name, username, password, role });
        if (!res.ok) { showToast(res.error, 'error'); return; }
        showToast('Técnico creado correctamente', 'success');
      }
      this.closeTechModal();
      this.loadTechsList();
    } finally {
      btn.disabled    = false;
      btn.textContent = 'Guardar';
    }
  },

  loadCompanyForm() {
    const c = DB.getCompany();
    document.getElementById('comp-name').value = c.name || '';
    document.getElementById('comp-cif').value = c.cif || '';
    document.getElementById('comp-address').value = c.address || '';
    document.getElementById('comp-cp').value = c.cp || '';
    document.getElementById('comp-city').value = c.city || '';
    document.getElementById('comp-phone').value = c.phone || '';
    document.getElementById('comp-email').value = c.email || '';
    document.getElementById('comp-web').value = c.web || '';
    document.getElementById('comp-invoice-prefix').value = c.invoicePrefix || 'A';
    document.getElementById('comp-footer').value = c.footer || '';
  },

  async saveCompanyForm() {
    const company = {
      name:          document.getElementById('comp-name').value.trim(),
      cif:           document.getElementById('comp-cif').value.trim(),
      address:       document.getElementById('comp-address').value.trim(),
      cp:            document.getElementById('comp-cp').value.trim(),
      city:          document.getElementById('comp-city').value.trim(),
      phone:         document.getElementById('comp-phone').value.trim(),
      email:         document.getElementById('comp-email').value.trim(),
      web:           document.getElementById('comp-web').value.trim(),
      invoicePrefix: document.getElementById('comp-invoice-prefix').value.trim() || 'A',
      footer:        document.getElementById('comp-footer').value.trim(),
    };
    try {
      await DB.saveCompany(company);
      showToast('✅ Datos de empresa guardados', 'success');
    } catch(e) {
      showToast('Error al guardar. Comprueba la conexión.', 'error');
    }
  },

  // ============================================================
  // SETUP GLOBAL DE EVENTOS
  // ============================================================
  setupEventListeners() {
    // Botón volver
    document.getElementById('btn-back').addEventListener('click', () => this.goBack());

    // Botón logout
    document.getElementById('btn-logout').addEventListener('click', async () => {
      if (confirm('¿Cerrar sesión?')) {
        await DB.logout();
        location.reload();
      }
    });

    // Dashboard → Nueva factura
    document.getElementById('btn-new-invoice').addEventListener('click', () => {
      InvoiceManager.initForm();
      this.showView('new-invoice', 'Nueva Factura');
    });

    // Dashboard → Mis facturas
    document.getElementById('btn-view-invoices').addEventListener('click', () => {
      this.showView('invoices', 'Mis Facturas');
      this.loadInvoiceList();
    });

    // Dashboard → Admin
    document.getElementById('btn-admin').addEventListener('click', () => {
      this.showView('admin', 'Panel de Administración');
      this.initAdminPanel();
      InvoiceManager.updateDashboardStats(null);
    });

    // Click en factura del historial reciente
    document.getElementById('recent-invoices-list').addEventListener('click', e => {
      const item = e.target.closest('[data-invoice-id]');
      if (item) {
        const inv = DB.getInvoiceById(item.dataset.invoiceId);
        if (inv) PrintManager.showPreview(inv);
      }
    });

    // Click en facturas de la lista completa (delegación)
    document.getElementById('invoices-list').addEventListener('click', e => {
      this._handleInvoiceListClick(e, false);
    });

    // Click en facturas del admin
    document.getElementById('admin-invoices-list').addEventListener('click', e => {
      this._handleInvoiceListClick(e, true);
    });

    // MODAL PREVIEW
    document.getElementById('preview-overlay').addEventListener('click', () => {
      document.getElementById('modal-preview').classList.add('hidden');
    });
    document.getElementById('btn-close-preview').addEventListener('click', () => {
      document.getElementById('modal-preview').classList.add('hidden');
    });
    document.getElementById('btn-print-invoice').addEventListener('click', () => {
      PrintManager.print();
    });
    document.getElementById('btn-share-invoice').addEventListener('click', () => {
      PrintManager.shareInvoice();
    });

    // Init form events
    this.initNewInvoiceForm();
  },

  async _handleInvoiceListClick(e, isAdmin) {
    const actionBtn = e.target.closest('[data-action]');
    if (actionBtn) {
      const id     = actionBtn.dataset.id;
      const action = actionBtn.dataset.action;
      if (action === 'view') {
        const inv = DB.getInvoiceById(id);
        if (inv) PrintManager.showPreview(inv);
      } else if (action === 'delete') {
        const session = DB.getSession();
        if (session?.role !== 'admin') {
          showToast('⛔ Solo el administrador puede eliminar facturas', 'error');
          return;
        }
        if (confirm('¿Eliminar esta factura? Esta acción no se puede deshacer.')) {
          try {
            await DB.deleteInvoice(id);
            showToast('Factura eliminada', 'info');
            if (isAdmin) this.loadAdminInvoices();
            else         this.filterInvoices();
            this.refreshDashboard();
          } catch(e) {
            showToast('Error al eliminar. Comprueba la conexión.', 'error');
          }
        }
      }
    }
  },

  // ============================================================
  // ARRANQUE ASÍNCRONO (Firebase o localStorage)
  // ============================================================
  async init() {
    // Spinner de carga
    document.body.insertAdjacentHTML('afterbegin', `
      <div id="app-loader" style="position:fixed;inset:0;background:#0a0d14;display:flex;align-items:center;justify-content:center;z-index:9999;flex-direction:column;gap:16px">
        <div style="font-size:3.5rem;filter:drop-shadow(0 0 20px #4f7cff)">⚡</div>
        <div style="color:#4f7cff;font-family:Outfit,sans-serif;font-size:1.1rem;font-weight:600">Cargando FacturaTec...</div>
        <div style="width:36px;height:36px;border:3px solid rgba(79,124,255,0.2);border-top-color:#4f7cff;border-radius:50%;animation:spin 0.8s linear infinite"></div>
      </div>
      <style>@keyframes spin{to{transform:rotate(360deg)}}</style>`);

    const hideLoader = () => {
      const el = document.getElementById('app-loader');
      if (el) { el.style.opacity = '0'; el.style.transition = 'opacity 0.4s'; setTimeout(() => el.remove(), 400); }
    };

    // Inicializar capa de datos (Firebase o fallback local)
    const firebaseUser = await DB.init();
    hideLoader();

    if (FIREBASE_CONFIGURED) {
      // Firebase gestiona la sesión mediante onAuthStateChanged
      if (firebaseUser) {
        // Usuario ya autenticado en Firebase — esperar que Firestore cargue el perfil
        let tries = 0;
        const waitForSession = () => {
          if (DB.getSession()) {
            this.startApp();
          } else if (tries++ < 10) {
            setTimeout(waitForSession, 200);
          } else {
            // Sin perfil Firestore — podría ser primera vez, ir al login
            this.initLogin();
            document.getElementById('screen-login').classList.add('active');
          }
        };
        waitForSession();
      } else {
        // No autenticado en Firebase
        this.initLogin();
        document.getElementById('screen-login').classList.add('active');
        // Listener para cuando el login de Firebase se complete
        DB._auth?.onAuthStateChanged(async user => {
          if (user && !document.getElementById('screen-app').classList.contains('active')) {
            let tries = 0;
            const waitForSession = () => {
              if (DB.getSession()) this.startApp();
              else if (tries++ < 10) setTimeout(waitForSession, 200);
            };
            waitForSession();
          }
        });
      }
    } else {
      // Modo local sin Firebase
      const session = DB.getSession();
      if (session) this.startApp();
      else {
        this.initLogin();
        document.getElementById('screen-login').classList.add('active');
      }
    }
  }
};

// Arrancar cuando el DOM esté listo
document.addEventListener('DOMContentLoaded', () => App.init());

