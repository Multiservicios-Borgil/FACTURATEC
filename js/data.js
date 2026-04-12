/* ===================================================
   data.js – Capa de datos (localStorage)
   Gestiona todos los datos persistentes de la app
   =================================================== */

const DB = {
  // ---------- CLAVES ----------
  KEYS: {
    USERS:    'facturatec_users',
    INVOICES: 'facturatec_invoices',
    COMPANY:  'facturatec_company',
    SESSION:  'facturatec_session',
    COUNTER:  'facturatec_counter',
  },

  // ---------- HELPERS ----------
  _get(key) {
    try { return JSON.parse(localStorage.getItem(key)) || null; } catch { return null; }
  },
  _set(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  },

  // ============================================================
  // USUARIOS / TÉCNICOS
  // ============================================================
  getUsers() {
    return this._get(this.KEYS.USERS) || [];
  },
  saveUsers(users) {
    this._set(this.KEYS.USERS, users);
  },
  getUserByCredentials(username, password) {
    const users = this.getUsers();
    return users.find(u => u.username === username.trim().toLowerCase() && u.password === password) || null;
  },
  addUser(user) {
    const users = this.getUsers();
    // Comprobar que el username no exista ya
    if (users.some(u => u.username === user.username.trim().toLowerCase())) {
      return { ok: false, error: 'El nombre de usuario ya existe.' };
    }
    const newUser = {
      id: Date.now().toString(),
      name: user.name.trim(),
      username: user.username.trim().toLowerCase(),
      password: user.password,
      role: user.role || 'tech',
      createdAt: new Date().toISOString(),
      active: true,
    };
    users.push(newUser);
    this.saveUsers(users);
    return { ok: true, user: newUser };
  },
  updateUser(id, fields) {
    const users = this.getUsers();
    const idx = users.findIndex(u => u.id === id);
    if (idx === -1) return { ok: false, error: 'Usuario no encontrado.' };
    users[idx] = { ...users[idx], ...fields };
    this.saveUsers(users);
    return { ok: true, user: users[idx] };
  },
  deleteUser(id) {
    const users = this.getUsers().filter(u => u.id !== id);
    this.saveUsers(users);
  },

  // ============================================================
  // SESIÓN ACTIVA
  // ============================================================
  getSession() {
    return this._get(this.KEYS.SESSION);
  },
  setSession(user) {
    this._set(this.KEYS.SESSION, { id: user.id, name: user.name, username: user.username, role: user.role });
  },
  clearSession() {
    localStorage.removeItem(this.KEYS.SESSION);
  },

  // ============================================================
  // FACTURAS
  // ============================================================
  getInvoices() {
    return this._get(this.KEYS.INVOICES) || [];
  },
  saveInvoices(invoices) {
    this._set(this.KEYS.INVOICES, invoices);
  },
  getInvoiceById(id) {
    return this.getInvoices().find(inv => inv.id === id) || null;
  },
  addInvoice(invoice) {
    const invoices = this.getInvoices();
    invoices.unshift(invoice); // más reciente primero
    this.saveInvoices(invoices);
    return invoice;
  },
  deleteInvoice(id) {
    const invoices = this.getInvoices().filter(inv => inv.id !== id);
    this.saveInvoices(invoices);
  },
  getInvoicesByTech(techId) {
    return this.getInvoices().filter(inv => inv.techId === techId);
  },

  // Contador de número de factura por serie
  getNextInvoiceNumber(series) {
    const counters = this._get(this.KEYS.COUNTER) || {};
    const key = `${series}-${new Date().getFullYear()}`;
    const next = (counters[key] || 0) + 1;
    counters[key] = next;
    this._set(this.KEYS.COUNTER, counters);
    return next;
  },
  peekNextInvoiceNumber(series) {
    const counters = this._get(this.KEYS.COUNTER) || {};
    const key = `${series}-${new Date().getFullYear()}`;
    return (counters[key] || 0) + 1;
  },

  // ============================================================
  // DATOS EMPRESA
  // ============================================================
  getCompany() {
    return this._get(this.KEYS.COMPANY) || {
      name: '',
      cif: '',
      address: '',
      cp: '',
      city: '',
      phone: '',
      email: '',
      web: '',
      invoicePrefix: 'A',
      footer: 'Gracias por confiar en nosotros.',
    };
  },
  saveCompany(company) {
    this._set(this.KEYS.COMPANY, company);
  },

  // ============================================================
  // INICIALIZACIÓN: crea admin por defecto si no hay usuarios
  // ============================================================
  init() {
    const users = this.getUsers();
    if (users.length === 0) {
      // Crear usuario administrador por defecto
      this.addUser({
        name: 'Administrador',
        username: 'admin',
        password: 'admin123',
        role: 'admin',
      });
    }
  },

  // ============================================================
  // EXPORTACIÓN CSV
  // ============================================================
  exportInvoicesCSV() {
    const invoices = this.getInvoices();
    const company = this.getCompany();
    const headers = [
      'Número', 'Fecha', 'Cliente', 'NIF Cliente', 'Dirección Cliente',
      'Conceptos', 'Base Imponible', 'IVA%', 'Cuota IVA', 'Total',
      'Forma de Cobro', 'Técnico', 'Notas'
    ];
    const rows = invoices.map(inv => [
      inv.number,
      inv.date,
      `"${inv.client.name}"`,
      inv.client.nif,
      `"${inv.client.address || ''}, ${inv.client.cp || ''} ${inv.client.city || ''}"`,
      `"${inv.lines.map(l => l.description).join(' | ')}"`,
      inv.totals.base.toFixed(2),
      inv.totals.ivaPct,
      inv.totals.iva.toFixed(2),
      inv.totals.total.toFixed(2),
      inv.paymentMethod,
      `"${inv.techName}"`,
      `"${inv.notes || ''}"`,
    ]);
    const csvContent = [headers.join(';'), ...rows.map(r => r.join(';'))].join('\n');
    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `facturas_${company.name || 'empresa'}_${new Date().toISOString().slice(0,10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  },
};
