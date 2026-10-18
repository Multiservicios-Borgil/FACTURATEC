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
    avisos:   [],
    company:  null,
    session:  null,
    counter:  {},
  },

  // ---------- REFERENCIAS ----------
  _db:   null,
  _auth: null,
  _initialized: false,
  _storage: null,
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
    this._db      = firebase.firestore();
    this._auth    = firebase.auth();
    // Storage (puede no estar disponible si no se activo)
    try { this._storage = firebase.storage(); } catch(e) { console.warn('Firebase Storage no disponible:', e); }
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
            const profile = userDoc.exists ? userDoc.data() : null;
            if (profile && profile.active !== false) {
              this._cache.session = { id: user.uid, ...profile };
            } else {
              // Cuenta Auth sin perfil valido: no dejar una sesion "a medias"
              console.warn('Usuario sin perfil activo en Firestore:', user.email, user.uid);
              this._cache.session = null;
              this._profileError = profile ? 'inactive' : 'missing';
              try { await this._auth.signOut(); } catch(e) {}
            }
          } catch(e) { console.error('Error cargando sesión:', e); }
        } else {
          this._cache.session = null;
        }
        
        // Si hay una sesión activa (ya sea por Firebase o fallback local), activar listeners
        if (this._cache.session) {
          await this._setupListeners();
        } else {
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
    // Nota: where('techId') + orderBy('createdAt') exigiria un indice compuesto en
    // Firestore; sin el, la consulta falla en silencio y el tecnico no ve nada.
    // Para tecnicos filtramos solo por techId y ordenamos en el cliente.
    const isAdminSession = session?.role === 'admin';
    const byCreatedDesc = (a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || ''));
    let invoiceQuery = isAdminSession
      ? this._db.collection('invoices').orderBy('createdAt', 'desc')
      : this._db.collection('invoices').where('techId', '==', session.id);

    // Listener de avisos: todos los usuarios (admin y tecnicos) ven todos los avisos
    var session2 = this._cache.session;
    var avisoQuery = this._db.collection('avisos').orderBy('createdAt', 'desc');
    var unsubAvisos = avisoQuery.onSnapshot(function(snap) {
      DB._cache.avisos = snap.docs.map(function(d){ return Object.assign({}, d.data(), {id: d.id}); }).sort(byCreatedDesc);
      if (typeof App !== 'undefined' && App.currentView === 'avisos') {
        AvisosManager.filterAndRender('avisos-list', session2 && session2.role === 'admin');
      }
      if (typeof App !== 'undefined' && App.currentView === 'aviso-detail' && AvisosManager.currentAvisoId) {
        AvisosManager.showDetail(AvisosManager.currentAvisoId);
      }
    }, function(err) {
      console.error('Listener avisos:', err);
      if (typeof showToast === 'function') showToast('No se pudieron cargar los avisos: ' + err.message, 'error');
    });

    const unsubInvoices = invoiceQuery.onSnapshot(snap => {
      this._cache.invoices = snap.docs.map(d => ({ ...d.data(), id: d.id })).sort(byCreatedDesc);
      // Refrescar UI si está visible
      if (typeof App !== 'undefined') {
        if (App.currentView === 'dashboard') App.refreshDashboard();
        if (App.currentView === 'invoices')  App.filterInvoices();
        if (App.currentView === 'admin')     InvoiceManager.updateDashboardStats(null);
      }
    }, err => console.warn('Listener facturas:', err));

    // Usuarios: todos los cargan (solo lectura) para poder asignar/reasignar avisos.
    // La gestion de usuarios sigue siendo exclusiva del admin (reglas de Firestore).
    const unsubUsers = this._db.collection('users').onSnapshot(snap => {
      this._cache.users = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    }, err => console.warn('Listener usuarios:', err));

    // Empresa
    const unsubCompany = this._db.collection('company').doc('main').onSnapshot(snap => {
      if (snap.exists) this._cache.company = snap.data();
    });

    this._listeners = [unsubAvisos, unsubInvoices, unsubUsers, unsubCompany];
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
    let cred;
    try {
      cred = await this._auth.signInWithEmailAndPassword(email, password);
    } catch (err) {
      return { ok: false, error: 'Usuario o contraseña incorrectos' };
    }
    // Verificar que existe un perfil activo con el MISMO uid que la cuenta Auth
    try {
      const uid = cred.user.uid;
      const userDoc = await this._db.collection('users').doc(uid).get();
      const profile = userDoc.exists ? userDoc.data() : null;
      if (!profile) {
        await this._auth.signOut();
        return { ok: false, error: 'Tu usuario no tiene perfil en FacturaTec. Pide al administrador que te dé de alta de nuevo (Técnicos → Añadir) con tu misma contraseña.' };
      }
      if (profile.active === false) {
        await this._auth.signOut();
        return { ok: false, error: 'Tu usuario está desactivado. Contacta con el administrador.' };
      }
      this._cache.session = { id: uid, ...profile };
      await this._setupListeners();
      return { ok: true };
    } catch (err) {
      console.error('Error verificando perfil:', err);
      try { await this._auth.signOut(); } catch(e) {}
      return { ok: false, error: 'No se pudo cargar tu perfil: ' + (err.message || err) };
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
      let cred, repaired = false;
      try {
        cred = await secAuth.createUserWithEmailAndPassword(email, userData.password);
      } catch (e) {
        if (e.code !== 'auth/email-already-in-use') throw e;
        // La cuenta de acceso ya existe (p.ej. se borro solo el perfil o se recreo el usuario).
        // Con su contraseña obtenemos su uid real y reparamos el perfil.
        try {
          cred = await secAuth.signInWithEmailAndPassword(email, userData.password);
          repaired = true;
        } catch (e2) {
          return { ok: false, error: 'Ya existe una cuenta de acceso "' + userData.username.trim().toLowerCase() +
            '" con otra contraseña. Escribe su contraseña actual para recuperarla, o bórrala en Firebase Console → Authentication y vuelve a crearla.' };
        }
      }
      const uid = cred.user.uid;
      await secAuth.signOut();

      const username = userData.username.trim().toLowerCase();
      const existing = await this._db.collection('users').doc(uid).get();

      // Guardar (o reparar) el perfil con el uid correcto
      await this._db.collection('users').doc(uid).set({
        name:      userData.name.trim(),
        username,
        role:      userData.role || 'tech',
        email,
        createdAt: (existing.exists && existing.data().createdAt) || new Date().toISOString(),
        active:    true,
      }, { merge: true });

      // Perfiles huerfanos con el mismo usuario pero otro uid: pasar sus avisos/facturas
      // al uid correcto y eliminarlos, para que no vuelva a haber duplicados.
      const migrated = await this._migrateStaleProfiles(username, uid, userData.name.trim());

      return { ok: true, repaired: repaired || existing.exists, migrated };
    } catch (err) {
      console.error('addUser error:', err);
      return { ok: false, error: err.message || 'Error al crear el usuario.' };
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
    if (!this._initialized) { this._localDeleteUser(id); return { ok: true }; }
    // La cuenta de acceso (Auth) no se puede borrar desde el navegador (requiere Admin SDK).
    // Por eso NO borramos el perfil: lo desactivamos. Asi el usuario no puede entrar y,
    // si se vuelve a dar de alta con el mismo nombre, se reactiva con el mismo uid.
    try {
      await this._db.collection('users').doc(id).update({ active: false, deactivatedAt: new Date().toISOString() });
      return { ok: true };
    } catch (err) {
      console.error('deleteUser error:', err);
      return { ok: false, error: err.message };
    }
  },

  // Reasigna avisos/facturas de perfiles antiguos (mismo usuario, otro uid) y los elimina
  async _migrateStaleProfiles(username, uid, name) {
    let moved = 0;
    try {
      const snap = await this._db.collection('users').where('username', '==', username).get();
      for (const doc of snap.docs) {
        if (doc.id === uid) continue;
        for (const col of ['avisos', 'invoices']) {
          const refs = await this._db.collection(col).where('techId', '==', doc.id).get();
          for (const r of refs.docs) {
            try { await r.ref.update({ techId: uid, techName: name }); moved++; }
            catch (e) { console.warn('No se pudo migrar', col, r.id, e); }
          }
        }
        try { await doc.ref.delete(); } catch (e) { console.warn('No se pudo borrar perfil antiguo', doc.id, e); }
      }
    } catch (err) { console.warn('migrateStaleProfiles:', err); }
    return moved;
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
      // No guardar el id local dentro del documento (el id real es el de Firestore)
      const { id: _localId, ...data } = invoice;
      const ref  = await this._db.collection('invoices').add(data);
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

  // Anular: la factura deja de contar en listados y totales, pero se conserva
  // (en Espana las facturas no deben borrarse ni reutilizar su numero).
  async voidInvoice(id) {
    const fields = { status: 'anulada', voidedAt: new Date().toISOString(), voidedBy: this._cache.session?.name || '' };
    if (!this._initialized) {
      const invoices = this._getLocal('facturatec_invoices') || [];
      const i = invoices.findIndex(x => x.id === id);
      if (i !== -1) { invoices[i] = { ...invoices[i], ...fields }; this._setLocal('facturatec_invoices', invoices); this._cache.invoices = invoices; }
      return;
    }
    await this._db.collection('invoices').doc(id).update(fields);
  },

  // Reasigna facturas/avisos que apuntan a un uid que ya no corresponde a un usuario activo
  // (usuarios borrados y recreados). Solo admin. Devuelve cuantos registros se corrigieron.
  async repairOrphanRecords() {
    if (!this._initialized) return 0;
    const s = this._cache.session;
    if (!s || s.role !== 'admin') return 0;
    const norm = v => String(v || '').trim().toLowerCase();
    const usersSnap = await this._db.collection('users').get();
    const users  = usersSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    const byId   = {}; users.forEach(u => { byId[u.id] = u; });
    const active = users.filter(u => u.active !== false);
    const uniq = (list, key) => { const m = {}; list.forEach(u => { const k = norm(u[key]); if (!k) return; (m[k] = m[k] || []).push(u); }); return m; };
    const activeByName = uniq(active, 'name');
    const activeByUser = uniq(active, 'username');

    const targetFor = (techId, techName) => {
      if (!techId) return null;
      const owner = byId[techId];
      if (owner && owner.active !== false) return null;           // ya es correcto
      if (owner) {                                                  // perfil antiguo desactivado
        const c = activeByUser[norm(owner.username)] || [];
        if (c.length === 1 && c[0].id !== techId) return c[0];
        return null;                                                // tecnico dado de baja de verdad
      }
      const c = activeByName[norm(techName)] || [];                 // uid que ya no existe
      return c.length === 1 ? c[0] : null;
    };

    let fixed = 0;
    for (const col of ['invoices', 'avisos']) {
      const snap = await this._db.collection(col).get();
      for (const d of snap.docs) {
        const data = d.data();
        const target = targetFor(data.techId, data.techName);
        if (!target) continue;
        try {
          await d.ref.update({ techId: target.id, techName: target.name, previousTechId: data.techId });
          fixed++;
        } catch (e) { console.warn('No se pudo reasignar', col, d.id, e); }
      }
    }
    return fixed;
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
  // AVISOS (Ordenes de Servicio)
  // ============================================================
  getAvisos()      { return this._cache.avisos; },
  getAvisoById(id) { return this._cache.avisos.find(function(a){ return a.id === id; }) || null; },

  async addAviso(aviso) {
    if (!this._initialized) {
      var list = this._getLocal('facturatec_avisos') || [];
      aviso.id = Date.now().toString();
      list.unshift(aviso);
      this._setLocal('facturatec_avisos', list);
      this._cache.avisos = list;
      return aviso;
    }
    try {
      var ref = await this._db.collection('avisos').add(aviso);
      aviso.id = ref.id;
      return aviso;
    } catch(err) { console.error('addAviso error:', err); throw err; }
  },

  async updateAviso(id, fields) {
    if (!this._initialized) {
      var list = this._getLocal('facturatec_avisos') || [];
      var idx  = list.findIndex(function(a){ return a.id === id; });
      if (idx !== -1) { list[idx] = Object.assign({}, list[idx], fields); this._setLocal('facturatec_avisos', list); this._cache.avisos = list; }
      return;
    }
    try { await this._db.collection('avisos').doc(id).update(fields); }
    catch(err) { console.error('updateAviso error:', err); throw err; }
  },

  async deleteAviso(id) {
    if (!this._initialized) {
      var list = (this._getLocal('facturatec_avisos') || []).filter(function(a){ return a.id !== id; });
      this._setLocal('facturatec_avisos', list); this._cache.avisos = list;
      return;
    }
    await this._db.collection('avisos').doc(id).delete();
  },

  // ============================================================
  // FIREBASE STORAGE (Fotos y partes)
  // ============================================================
  async uploadFile(storagePath, file) {
    if (!this._initialized || !this._storage) {
      throw new Error('Firebase Storage no disponible. Configura Firebase primero.');
    }
    var ref = this._storage.ref(storagePath);
    await ref.put(file);
    return await ref.getDownloadURL();
  },

  async deleteFile(storagePath) {
    if (!this._initialized || !this._storage) return;
    try { await this._storage.ref(storagePath).delete(); } catch(e) { console.warn('deleteFile:', e); }
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
      'Forma de Cobro','Técnico','Notas','Estado'
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
      inv.status === 'anulada' ? 'ANULADA' : 'Emitida',
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



