/* ===================================================
   data-firebase.js — Capa de datos con Firebase
   Reemplaza data.js cuando Firebase está configurado.
   Usa caché en memoria para operaciones síncronas,
   sincronizada en tiempo real con Firestore.
   =================================================== */

const DB = {

  // ---------- CACHÉ EN MEMORIA ----------
  _cache: {
    users:    [],
    invoices: [],
    company:  null,
    session:  null,
    counter:  {},
  },

  // ---------- REFERENCIAS ----------
  _db:   null,
  _auth: null,
  _initialized: false,
  _listeners: [],

  // ============================================================
  // INICIALIZACIÓN
  // ============================================================
  async init() {
    if (!FIREBASE_CONFIGURED) {
      console.warn('Firebase no configurado. Usando modo local (localStorage).');
      this._initLocalFallback();
      return null;
    }

    firebase.initializeApp(firebaseConfig);
    this._db   = firebase.firestore();
    this._auth = firebase.auth();
    this._initialized = true;

    // Precargar datos de empresa (no requiere auth)
    try {
      const compDoc = await this._db.collection('company').doc('main').get();
      this._cache.company = compDoc.exists ? compDoc.data() : this._defaultCompany();
    } catch(e) { this._cache.company = this._defaultCompany(); }

    return new Promise(resolve => {
      this._auth.onAuthStateChanged(async user => {
        if (user) {
          try {
            const userDoc = await this._db.collection('users').doc(user.uid).get();
            if (userDoc.exists) {
              this._cache.session = { id: user.uid, ...userDoc.data() };
              await this._setupListeners();
            }
          } catch(e) { console.error('Error cargando sesión:', e); }
        } else {
          this._cache.session = null;
          this._removeListeners();
        }
        resolve(user);
      });
    });
  },

  // Listeners de tiempo real
  async _setupListeners() {
    this._removeListeners();
    const session = this._cache.session;

    // Facturas: admin ve todas, técnico solo las suyas
    let invoiceQuery = this._db.collection('invoices').orderBy('createdAt', 'desc');
    if (session?.role !== 'admin') {
      invoiceQuery = invoiceQuery.where('techId', '==', session.id);
    }

    const unsubInvoices = invoiceQuery.onSnapshot(snap => {
      this._cache.invoices = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      // Refrescar UI si está visible
      if (typeof App !== 'undefined') {
        if (App.currentView === 'dashboard') App.refreshDashboard();
        if (App.currentView === 'invoices')  App.filterInvoices();
        if (App.currentView === 'admin')     InvoiceManager.updateDashboardStats(null);
      }
    }, err => console.warn('Listener facturas:', err));

    // Usuarios (solo admin)
    let unsubUsers = () => {};
    if (session?.role === 'admin') {
      unsubUsers = this._db.collection('users').onSnapshot(snap => {
        this._cache.users = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      }, err => console.warn('Listener usuarios:', err));
    }

    // Empresa
    const unsubCompany = this._db.collection('company').doc('main').onSnapshot(snap => {
      if (snap.exists) this._cache.company = snap.data();
    });

    this._listeners = [unsubInvoices, unsubUsers, unsubCompany];
  },

  _removeListeners() {
    this._listeners.forEach(unsub => { try { unsub(); } catch(e){} });
    this._listeners = [];
  },

  // ============================================================
  // SESIÓN / AUTENTICACIÓN
  // ============================================================
  getSession() { return this._cache.session; },

  async loginWithCredentials(username, password) {
    if (!this._initialized) {
      // Fallback local
      const user = this._localGetUserByCredentials(username, password);
      if (user) { this._cache.session = user; return { ok: true, user }; }
      return { ok: false, error: 'Usuario o contraseña incorrectos' };
    }
    const email = `${username.trim().toLowerCase()}@facturatec.app`;
    try {
      await this._auth.signInWithEmailAndPassword(email, password);
      return { ok: true };
    } catch (err) {
      // EMERGENCIA: Si es el admin y falla en Firebase, dejarle entrar con local
      // para que pueda "subir" los datos de empresa y crear técnicos en la nube.
      if (username.toLowerCase() === 'admin') {
        const localUser = this._localGetUserByCredentials(username, password);
        if (localUser) {
          this._cache.session = localUser;
          return { ok: true, isLocalFallback: true };
        }
      }
      return { ok: false, error: 'Usuario o contraseña incorrectos' };
    }
  },

  async logout() {
    if (this._initialized) {
      this._removeListeners();
      await this._auth.signOut();
    }
    this._cache.session = null;
  },

  // Compatibilidad con código antiguo
  setSession(user) { this._cache.session = user; },
  clearSession() { this._cache.session = null; },

  // ============================================================
  // USUARIOS / TÉCNICOS
  // ============================================================
  getUsers() { return this._cache.users; },

  async addUser(userData) {
    if (!this._initialized) return this._localAddUser(userData);

    const email = `${userData.username.trim().toLowerCase()}@facturatec.app`;

    // Crear en Firebase Auth usando app secundaria (sin cerrar sesión del admin)
    let secondaryApp;
    try {
      secondaryApp = firebase.initializeApp(firebase.app().options, `sec-${Date.now()}`);
      const secAuth = firebase.auth(secondaryApp);
      const cred = await secAuth.createUserWithEmailAndPassword(email, userData.password);
      const uid  = cred.user.uid;
      await secAuth.signOut();

      // Guardar perfil en Firestore
      await this._db.collection('users').doc(uid).set({
        name:      userData.name.trim(),
        username:  userData.username.trim().toLowerCase(),
        role:      userData.role || 'tech',
        email,
        createdAt: new Date().toISOString(),
        active:    true,
      });

      return { ok: true };
    } catch (err) {
      console.error('addUser error:', err);
      const msg = err.code === 'auth/email-already-in-use'
        ? 'Ese nombre de usuario ya existe.'
        : (err.message || 'Error al crear el usuario.');
      return { ok: false, error: msg };
    } finally {
      if (secondaryApp) try { await secondaryApp.delete(); } catch(e){}
    }
  },

  async updateUser(id, fields) {
    if (!this._initialized) return this._localUpdateUser(id, fields);
    try {
      const updateData = { ...fields };
      // Si cambió contraseña, actualizar en Firebase Auth requeriría Admin SDK
      // Por ahora guardamos solo los metadatos en Firestore
      delete updateData.password;
      await this._db.collection('users').doc(id).update(updateData);
      return { ok: true };
    } catch(err) {
      return { ok: false, error: err.message };
    }
  },

  async deleteUser(id) {
    if (!this._initialized) { this._localDeleteUser(id); return; }
    // Solo eliminamos el doc de Firestore (no la cuenta Auth, requiere Admin SDK)
    try { await this._db.collection('users').doc(id).delete(); } catch(e){}
  },

  // ============================================================
  // FACTURAS
  // ============================================================
  getInvoices()        { return this._cache.invoices; },
  getInvoiceById(id)   { return this._cache.invoices.find(i => i.id === id) || null; },
  getInvoicesByTech(t) { return this._cache.invoices.filter(i => i.techId === t); },

  async addInvoice(invoice) {
    if (!this._initialized) {
      const invoices = this._getLocal('facturatec_invoices') || [];
      invoices.unshift(invoice);
      this._setLocal('facturatec_invoices', invoices);
      this._cache.invoices = invoices;
      return invoice;
    }
    try {
      const ref  = await this._db.collection('invoices').add(invoice);
      invoice.id = ref.id;
      // El listener real-time actualizará la caché automáticamente
      return invoice;
    } catch(err) {
      console.error('addInvoice error:', err);
      throw err;
    }
  },

  async deleteInvoice(id) {
    if (!this._initialized) {
      const invoices = (this._getLocal('facturatec_invoices') || []).filter(i => i.id !== id);
      this._setLocal('facturatec_invoices', invoices);
      this._cache.invoices = invoices;
      return;
    }
    await this._db.collection('invoices').doc(id).delete();
  },

  // Número de factura — Transacción atómica en Firestore
  async getNextInvoiceNumber(series) {
    if (!this._initialized) return this._localGetNextNumber(series);
    const year    = new Date().getFullYear();
    const key     = `${series}-${year}`;
    const counter = this._db.collection('counters').doc('invoices');
    try {
      const next = await this._db.runTransaction(async t => {
        const doc     = await t.get(counter);
        const current = doc.exists ? (doc.data()[key] || 0) : 0;
        const nxt     = current + 1;
        t.set(counter, { [key]: nxt }, { merge: true });
        return nxt;
      });
      this._cache.counter[key] = next;
      return next;
    } catch(e) {
      // Fallback local si falla la transacción
      return this._localGetNextNumber(series);
    }
  },

  async peekNextInvoiceNumber(series) {
    if (!this._initialized) return this._localPeekNumber(series);
    const year = new Date().getFullYear();
    const key  = `${series}-${year}`;
    if (this._cache.counter[key]) return this._cache.counter[key] + 1;
    try {
      const doc = await this._db.collection('counters').doc('invoices').get();
      const n   = doc.exists ? (doc.data()[key] || 0) + 1 : 1;
      return n;
    } catch(e) { return this._localPeekNumber(series); }
  },

  // ============================================================
  // EMPRESA
  // ============================================================
  getCompany() { return this._cache.company || this._defaultCompany(); },

  async saveCompany(company) {
    this._cache.company = company;
    if (!this._initialized) {
      this._setLocal('facturatec_company', company);
      return;
    }
    await this._db.collection('company').doc('main').set(company);
  },

  // ============================================================
  // EXPORTAR CSV
  // ============================================================
  exportInvoicesCSV() {
    const invoices = this.getInvoices();
    const company  = this.getCompany();
    const headers  = [
      'Número','Fecha','Cliente','NIF Cliente','Dirección',
      'Conceptos','Base','IVA%','Cuota IVA','Total',
      'Forma de Cobro','Técnico','Notas'
    ];
    const rows = invoices.map(inv => [
      inv.number, inv.date,
      `"${inv.client?.name || ''}"`, inv.client?.nif || '',
      `"${inv.client?.address || ''} ${inv.client?.cp || ''} ${inv.client?.city || ''}"`,
      `"${(inv.lines || []).map(l => l.description).join(' | ')}"`,
      (inv.totals?.base  || 0).toFixed(2),
      inv.totals?.ivaPct || 0,
      (inv.totals?.iva   || 0).toFixed(2),
      (inv.totals?.total || 0).toFixed(2),
      inv.paymentMethod || '', `"${inv.techName || ''}"`, `"${inv.notes || ''}"`,
    ]);
    const csv  = [headers.join(';'), ...rows.map(r => r.join(';'))].join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `facturas_${company.name || 'empresa'}_${new Date().toISOString().slice(0,10)}.csv`;
    document.body.appendChild(a); a.click();
    document.body.removeChild(a); URL.revokeObjectURL(url);
  },

  // ============================================================
  // HELPERS LOCALES (fallback sin Firebase)
  // ============================================================
  _getLocal(k)      { try { return JSON.parse(localStorage.getItem(k)); } catch{ return null; } },
  _setLocal(k, v)   { localStorage.setItem(k, JSON.stringify(v)); },
  _defaultCompany() {
    return { name:'', cif:'', address:'', cp:'', city:'', phone:'', email:'', web:'', invoicePrefix:'A', footer:'Gracias por confiar en nosotros.' };
  },

  _initLocalFallback() {
    this._cache.users    = this._getLocal('facturatec_users')    || [];
    this._cache.invoices = this._getLocal('facturatec_invoices') || [];
    this._cache.company  = this._getLocal('facturatec_company')  || this._defaultCompany();
    this._cache.counter  = this._getLocal('facturatec_counter')  || {};
    this._cache.session  = this._getLocal('facturatec_session');

    if (this._cache.users.length === 0) {
      this._localAddUser({ name:'Administrador', username:'admin', password:'admin123', role:'admin' });
    }
  },

  _localGetUserByCredentials(u, p) {
    return (this._getLocal('facturatec_users') || []).find(x => x.username === u.toLowerCase() && x.password === p) || null;
  },
  _localAddUser(u) {
    const users = this._getLocal('facturatec_users') || [];
    if (users.some(x => x.username === u.username.toLowerCase())) return { ok:false, error:'Usuario ya existe.' };
    const nu = { id: Date.now().toString(), name: u.name.trim(), username: u.username.toLowerCase(), password: u.password, role: u.role||'tech', createdAt: new Date().toISOString(), active: true };
    users.push(nu); this._setLocal('facturatec_users', users); this._cache.users = users;
    return { ok:true, user: nu };
  },
  _localUpdateUser(id, f) {
    const users = this._getLocal('facturatec_users') || [];
    const i = users.findIndex(u => u.id === id);
    if (i === -1) return { ok:false, error:'No encontrado' };
    users[i] = { ...users[i], ...f }; this._setLocal('facturatec_users', users); this._cache.users = users;
    return { ok:true };
  },
  _localDeleteUser(id) {
    const users = (this._getLocal('facturatec_users') || []).filter(u => u.id !== id);
    this._setLocal('facturatec_users', users); this._cache.users = users;
  },
  _localGetNextNumber(series) {
    const key = `${series}-${new Date().getFullYear()}`;
    const c = this._cache.counter; c[key] = (c[key] || 0) + 1;
    this._setLocal('facturatec_counter', c); return c[key];
  },
  _localPeekNumber(series) {
    const key = `${series}-${new Date().getFullYear()}`;
    return (this._cache.counter[key] || 0) + 1;
  },
};
