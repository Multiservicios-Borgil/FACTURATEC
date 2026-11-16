/* ===================================================
   reparaciones.js - Reparaciones en tienda
   Campos: tienda de entrega, tienda donde se repara, tipo de aparato,
   cliente, telefono, problema, fecha de entrada, presupuesto,
   comentario y tecnico asignado (+ estado de seguimiento).
   Todos los usuarios ven y editan todas las reparaciones;
   solo el admin puede eliminarlas.
   =================================================== */

const ReparacionesManager = {
  currentId: null,

  STORES: ['ILLUECA', 'CALATAYUD'],

  STATUSES: {
    pending:   { label: 'En reparación',               color: '#f59e0b', bg: 'rgba(245,158,11,0.15)', icon: '🛠️' },
    repaired:  { label: 'Reparado, pendiente de entrega', color: '#3b82f6', bg: 'rgba(59,130,246,0.15)', icon: '🔧' },
    delivered: { label: 'Entregado al cliente',        color: '#22c55e', bg: 'rgba(34,197,94,0.15)',  icon: '✅' },
  },

  getAll()    { return DB.getReparaciones(); },
  getById(id) { return DB.getReparacionById(id); },

  _esc(s) { return AvisosManager._esc(s); },
  _users(currentId) { return AvisosManager._assignableUsers(currentId); },
  _session() { return DB.getSession(); },
  _isAdmin() { var s = this._session(); return !!(s && s.role === 'admin'); },
  _now() { return new Date().toISOString(); },
  _today() { return new Date().toISOString().slice(0, 10); },
  _status(r) { return this.STATUSES[r.status] ? r.status : 'pending'; },

  _storeLabel(s) { return s ? 'Tienda ' + s.charAt(0).toUpperCase() + s.slice(1).toLowerCase() : 'Sin indicar'; },
  _transfer(r) { return !!(r.dropStore && r.repairStore && r.dropStore !== r.repairStore); },

  _money(v) {
    if (v === null || v === undefined || v === '' || isNaN(Number(v))) return 'Sin presupuesto';
    return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(Number(v));
  },

  _date(s, long) {
    var dt = /^\d{4}-\d{2}-\d{2}/.test(s || '') ? new Date(String(s).slice(0, 10) + 'T12:00:00') : null;
    if (!dt || isNaN(dt.getTime())) return 'Sin fecha';
    return dt.toLocaleDateString('es-ES', long
      ? { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' }
      : { day: '2-digit', month: '2-digit', year: 'numeric' });
  },

  // ============================================================
  // LISTADO
  // ============================================================
  open() {
    App.showView('reparaciones', 'Reparaciones en tienda');
    var techSel = document.getElementById('filter-rep-tech');
    if (techSel) {
      var prev = techSel.value, sess = this._session(), self = this;
      techSel.innerHTML = '<option value="">Todos los técnicos</option>' +
        (sess && !this._isAdmin() ? '<option value="' + sess.id + '">Mis reparaciones</option>' : '') +
        this._users().map(function (u) { return '<option value="' + u.id + '">' + self._esc(u.name) + '</option>'; }).join('');
      techSel.value = prev;
    }
    this.filterAndRender();
  },

  filterAndRender() {
    var self = this;
    var q  = ((document.getElementById('search-reparaciones') || {}).value || '').toLowerCase();
    var st = ((document.getElementById('filter-rep-status') || {}).value) || '';
    var sf = ((document.getElementById('filter-rep-store') || {}).value) || '';
    var tf = ((document.getElementById('filter-rep-tech') || {}).value) || '';
    var all = this.getAll();
    var list = all.slice();
    if (st) list = list.filter(function (r) { return self._status(r) === st; });
    if (sf) list = list.filter(function (r) { return r.repairStore === sf; });
    if (tf) list = list.filter(function (r) { return r.techId === tf; });
    if (q)  list = list.filter(function (r) {
      return [r.clientName, r.phone, r.applianceType, r.problem, r.comments, r.techName, self._code(r)]
        .some(function (v) { return v && String(v).toLowerCase().includes(q); });
    });
    // En reparacion (la mas antigua primero), luego reparadas sin entregar, y al final las entregadas
    var rank = { pending: 0, repaired: 1, delivered: 2 };
    list.sort(function (a, b) {
      var sa = self._status(a), sb = self._status(b);
      if (sa !== sb) return rank[sa] - rank[sb];
      if (sa === 'delivered') return String(b.deliveredAt || '').localeCompare(String(a.deliveredAt || ''));
      return (a.entryDate || '9999').localeCompare(b.entryDate || '9999');
    });

    var sum = document.getElementById('reparaciones-summary');
    if (sum) {
      var n = function (k) { return all.filter(function (r) { return self._status(r) === k; }).length; };
      sum.innerHTML =
        '<span class="enc-chip" style="color:#f59e0b">🛠️ ' + n('pending') + ' en reparación</span>' +
        '<span class="enc-chip" style="color:#3b82f6">🔧 ' + n('repaired') + ' por entregar</span>';
    }
    this.renderList(list);
  },

  renderList(list) {
    var c = document.getElementById('reparaciones-list');
    if (!c) return;
    if (!list.length) {
      c.innerHTML = '<div class="empty-state"><div class="empty-icon">🛠️</div><div class="empty-text">No hay reparaciones que mostrar. Pulsa "Nueva Reparación" para registrar la primera.</div></div>';
      return;
    }
    var self = this;
    c.innerHTML = '';
    list.forEach(function (r) {
      var s = self.STATUSES[self._status(r)];
      var stores = self._transfer(r)
        ? '🏬 ' + self._esc(self._storeLabel(r.dropStore)) + ' → ' + self._esc(self._storeLabel(r.repairStore))
        : '🏬 ' + self._esc(self._storeLabel(r.repairStore || r.dropStore));
      var el = document.createElement('div');
      el.className = 'aviso-item glass';
      el.innerHTML =
        '<div class="aviso-item-top">' +
          '<span class="aviso-status-badge" style="background:' + s.bg + ';color:' + s.color + ';">' + s.icon + ' ' + s.label + '</span>' +
          '<span class="aviso-insurer-badge">' + self._code(r) + '</span>' +
          (self._transfer(r) ? '<span class="aviso-insurer-badge">🚚 Traslado</span>' : '') +
        '</div>' +
        '<div class="aviso-item-body">' +
          '<div class="aviso-client-name">' + self._esc(r.applianceType || 'Aparato') + ' · ' + self._esc(r.clientName || 'Sin nombre') + '</div>' +
          '<div class="aviso-appliance">📞 ' + self._esc(r.phone || '-') + ' · ' + stores + '</div>' +
          (r.problem ? '<div class="aviso-desc">' + self._esc(r.problem.substring(0, 90)) + (r.problem.length > 90 ? '...' : '') + '</div>' : '') +
        '</div>' +
        '<div class="aviso-item-footer">' +
          '<span>📅 ' + self._date(r.entryDate, false) + '</span>' +
          '<span>👷 ' + self._esc(r.techName || 'Sin asignar') + '</span>' +
          '<span>💶 ' + self._money(r.budget) + '</span>' +
        '</div>';
      el.addEventListener('click', function () { self.showDetail(r.id); });
      c.appendChild(el);
    });
  },

  // ============================================================
  // DETALLE
  // ============================================================
  showDetail(id, silent) {
    var r = this.getById(id);
    if (!r) { if (!silent) showToast('La reparación ya no existe', 'error'); return; }
    this.currentId = id;
    var self = this;
    var key = this._status(r), s = this.STATUSES[key];
    var row = function (label, html) { return '<div class="detail-row"><span class="detail-label">' + label + '</span><span>' + html + '</span></div>'; };

    var opts = this._users(r.techId).map(function (u) {
      return '<option value="' + u.id + '" ' + (u.id === r.techId ? 'selected' : '') + '>' + self._esc(u.name) + '</option>';
    }).join('');
    if (!r.techId) opts = '<option value="" selected>Sin asignar</option>' + opts;

    var actions = '';
    if (key === 'pending')  actions += '<button class="btn btn-primary" onclick="ReparacionesManager.setStatus(\'' + id + '\', \'repaired\')">🔧 Marcar como reparado</button>';
    if (key === 'repaired') actions += '<button class="btn btn-primary" onclick="ReparacionesManager.setStatus(\'' + id + '\', \'delivered\')">🤝 Marcar como entregado al cliente</button>';
    if (key !== 'pending')  actions += '<button class="btn btn-outline" onclick="ReparacionesManager.setStatus(\'' + id + '\', \'' + (key === 'delivered' ? 'repaired' : 'pending') + '\')">↩️ Volver a "' + self.STATUSES[key === 'delivered' ? 'repaired' : 'pending'].label + '"</button>';

    var cont = document.getElementById('reparacion-detail-content');
    if (!cont) return;
    cont.innerHTML =
      '<div class="aviso-detail-header" style="background:' + s.bg + ';border-left:4px solid ' + s.color + ';padding:16px;border-radius:12px;margin-bottom:16px;">' +
        '<div style="font-size:1.1rem;font-weight:700;color:' + s.color + '">' + s.icon + ' ' + s.label + '</div>' +
        '<div style="font-size:0.85rem;color:#aaa;margin-top:4px">Ref. <strong>' + self._code(r) + '</strong> · Registrada ' + AvisosManager._formatDate(r.createdAt) + (r.createdByName ? ' por ' + self._esc(r.createdByName) : '') + '</div>' +
      '</div>' +

      '<div class="detail-section"><div class="detail-section-title">🔌 Aparato</div>' +
        row('Tipo', '<strong>' + self._esc(r.applianceType || 'Sin especificar') + '</strong>') +
        '<div class="detail-row"><span class="detail-label">Problema</span><p style="margin:4px 0 0;color:#e0e0e0;white-space:pre-wrap;">' + self._esc(r.problem || 'Sin descripción') + '</p></div>' +
        row('Presupuesto', '<strong>' + self._money(r.budget) + '</strong>') +
      '</div>' +

      '<div class="detail-section"><div class="detail-section-title">👤 Cliente</div>' +
        row('Nombre', '<strong>' + self._esc(r.clientName || 'Sin nombre') + '</strong>') +
        row('Teléfono', '<a href="tel:' + self._esc((r.phone || '').replace(/\s/g, '')) + '" style="color:#4f7cff;">' + self._esc(r.phone || 'Sin teléfono') + '</a>') +
      '</div>' +

      '<div class="detail-section"><div class="detail-section-title">🏬 Tiendas</div>' +
        row('Entregado en', self._esc(self._storeLabel(r.dropStore))) +
        row('Se repara en', self._esc(self._storeLabel(r.repairStore))) +
        (self._transfer(r) ? '<div style="color:#f59e0b;font-size:0.85rem;margin-top:6px;">🚚 Hay que trasladar el aparato de ' + self._esc(self._storeLabel(r.dropStore)) + ' a ' + self._esc(self._storeLabel(r.repairStore)) + '.</div>' : '') +
        row('Fecha de entrada', self._date(r.entryDate, true)) +
      '</div>' +

      '<div class="detail-section"><div class="detail-section-title">👷 Asignación</div>' +
        '<div class="field-group"><label>Técnico responsable</label>' +
        '<select onchange="ReparacionesManager.reassign(\'' + id + '\', this.value)">' + opts + '</select></div></div>' +

      '<div class="detail-section"><div class="detail-section-title">🗒️ Comentarios</div>' +
        '<div class="inst-comments">' + (r.comments ? self._esc(r.comments) : '<span style="color:#888">Sin comentarios.</span>') + '</div></div>' +

      ((r.repairedAt || r.deliveredAt) ? '<div class="detail-section"><div class="detail-section-title">🚚 Seguimiento</div>' +
        (r.repairedAt ? row('Reparado', '✅ ' + self._date(r.repairedAt, false)) : '') +
        (r.deliveredAt ? row('Entregado al cliente', '✅ ' + self._date(r.deliveredAt, false)) : '') + '</div>' : '') +

      '<div class="detail-actions">' +
        actions +
        '<button class="btn btn-outline" onclick="ReparacionesManager.printLabel(\'' + id + '\')">🏷️ Imprimir etiqueta</button>' +
        '<button class="btn btn-outline" onclick="ReparacionesManager.openForm(\'' + id + '\')">✏️ Editar reparación</button>' +
        (this._isAdmin() ? '<button class="btn btn-outline" style="color:#ef4444" onclick="ReparacionesManager.remove(\'' + id + '\')">🗑️ Eliminar reparación</button>' : '') +
      '</div>';

    if (!silent) App.showView('reparacion-detail', 'Reparación');
  },

  // ============================================================
  // FORMULARIO (crear / editar)
  // ============================================================
  openForm(id) {
    var r = id ? this.getById(id) : null;
    var self = this;
    var lastStore = ''; try { lastStore = localStorage.getItem('facturatec_last_store') || ''; } catch (x) {}
    var drop = (r && r.dropStore) || lastStore, repair = (r && r.repairStore) || lastStore;
    var v = function (k) { return self._esc((r && r[k] !== undefined && r[k] !== null) ? r[k] : ''); };
    var storeOpts = function (sel) {
      return '<option value="">Selecciona tienda</option>' + self.STORES.map(function (s) {
        return '<option value="' + s + '" ' + (sel === s ? 'selected' : '') + '>' + self._storeLabel(s) + '</option>';
      }).join('');
    };
    var typeList = this._typeSuggestions().map(function (t) { return '<option value="' + self._esc(t) + '"></option>'; }).join('');
    var techOpts = '<option value="">Sin asignar</option>' + this._users(r && r.techId).map(function (u) {
      return '<option value="' + u.id + '" ' + (r && r.techId === u.id ? 'selected' : '') + '>' + self._esc(u.name) + '</option>';
    }).join('');
    var entry = (r && r.entryDate) || this._today();

    var h =
      '<div class="modal-overlay" onclick="ReparacionesManager.closeForm()"></div>' +
      '<div class="modal-card glass" style="max-width:520px;width:92vw;max-height:90vh;overflow-y:auto;padding:24px;">' +
        '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;">' +
          '<h3 style="margin:0;">' + (r ? '✏️ Editar Reparación' : '➕ Nueva Reparación') + '</h3>' +
          '<button class="btn-close" onclick="ReparacionesManager.closeForm()">✕</button>' +
        '</div>' +

        '<div style="font-weight:600;color:#4f7cff;margin-bottom:12px;">🏬 Tiendas</div>' +
        '<div class="field-row">' +
          '<div class="field-group"><label>Entregado en <span class="required">*</span></label>' +
            '<select id="rep-drop" onchange="var t=document.getElementById(\'rep-repair\'); if(t && !t.dataset.touched) t.value=this.value;">' + storeOpts(drop) + '</select></div>' +
          '<div class="field-group"><label>Se repara en <span class="required">*</span></label>' +
            '<select id="rep-repair" onchange="this.dataset.touched=1">' + storeOpts(repair) + '</select></div>' +
        '</div>' +

        '<div style="font-weight:600;color:#4f7cff;margin:16px 0 12px;">👤 Cliente</div>' +
        '<div class="field-group"><label>Nombre del cliente <span class="required">*</span></label><input type="text" id="rep-client" value="' + v('clientName') + '" /></div>' +
        '<div class="field-group"><label>Teléfono <span class="required">*</span></label><input type="tel" id="rep-phone" value="' + v('phone') + '" /></div>' +

        '<div style="font-weight:600;color:#4f7cff;margin:16px 0 12px;">🔌 Aparato</div>' +
        '<div class="field-group"><label>Tipo de aparato <span class="required">*</span></label><input type="text" id="rep-type" list="rep-type-options" placeholder="Escribe el tipo: robot de cocina, TV, aspiradora..." value="' + v('applianceType') + '" /><datalist id="rep-type-options">' + typeList + '</datalist></div>' +
        '<div class="field-group"><label>Problema <span class="required">*</span></label><textarea id="rep-problem" rows="3" placeholder="Qué le pasa al aparato...">' + v('problem') + '</textarea></div>' +
        '<div class="field-row">' +
          '<div class="field-group"><label>Fecha de entrada</label><input type="date" id="rep-entry" value="' + self._esc(entry) + '" /></div>' +
          '<div class="field-group"><label>Presupuesto (€)</label><input type="number" id="rep-budget" step="0.01" min="0" inputmode="decimal" value="' + v('budget') + '" /></div>' +
        '</div>' +

        '<div class="field-group"><label>Técnico</label><select id="rep-tech">' + techOpts + '</select></div>' +
        '<div class="field-group"><label>Comentarios</label><textarea id="rep-comments" rows="6" placeholder="Observaciones, estado en que se recibe, accesorios entregados...">' + v('comments') + '</textarea></div>' +

        '<div style="display:flex;gap:12px;margin-top:20px;">' +
          '<button type="button" class="btn btn-outline" style="flex:1" onclick="ReparacionesManager.closeForm()">Cancelar</button>' +
          '<button type="button" class="btn btn-primary" style="flex:2" id="btn-save-rep" onclick="ReparacionesManager.saveForm(\'' + (id || '') + '\')">' + (r ? 'Guardar cambios' : 'Crear Reparación') + '</button>' +
        '</div>' +
      '</div>';

    var modal = document.getElementById('modal-reparacion-form');
    modal.innerHTML = h;
    modal.classList.remove('hidden');
  },

  closeForm() {
    var m = document.getElementById('modal-reparacion-form');
    if (m) { m.classList.add('hidden'); m.innerHTML = ''; }
  },

  async saveForm(editId) {
    var sess = this._session();
    if (!sess || !sess.id) { showToast('Tu sesión no tiene perfil válido. Cierra sesión y vuelve a entrar.', 'error'); return; }
    var val = function (id) { var el = document.getElementById(id); return el ? el.value.trim() : ''; };
    var dropStore = val('rep-drop'), repairStore = val('rep-repair');
    var clientName = val('rep-client'), phone = val('rep-phone');
    var applianceType = AvisosManager._cityName(val('rep-type')), problem = val('rep-problem');
    if (!dropStore || !repairStore) { showToast('Indica la tienda de entrega y la tienda donde se repara', 'error'); return; }
    if (!clientName || !phone || !applianceType || !problem) { showToast('Completa los campos obligatorios (*)', 'error'); return; }

    var entry = val('rep-entry');
    if (entry && !/^\d{4}-\d{2}-\d{2}$/.test(entry)) { showToast('La fecha de entrada no es válida (revisa el año)', 'error'); return; }
    var budgetRaw = val('rep-budget'), budget = null;
    if (budgetRaw !== '') {
      budget = parseFloat(budgetRaw.replace(',', '.'));
      if (isNaN(budget) || budget < 0) { showToast('El presupuesto no es válido', 'error'); return; }
      budget = Math.round(budget * 100) / 100;
    }

    var techId = val('rep-tech');
    var tech = techId ? (DB.getUsers() || []).find(function (u) { return u.id === techId; }) : null;
    var now = this._now();
    var data = {
      dropStore: dropStore, repairStore: repairStore,
      clientName: clientName, phone: phone,
      applianceType: applianceType, problem: problem,
      entryDate: entry || this._today(), budget: budget,
      comments: (document.getElementById('rep-comments') || { value: '' }).value,
      techId: tech ? tech.id : '', techName: tech ? tech.name : '',
      updatedAt: now,
    };

    var btn = document.getElementById('btn-save-rep');
    btn.disabled = true; btn.textContent = 'Guardando...';
    try {
      var newId = null;
      if (editId) {
        await DB.updateReparacion(editId, data);
      } else {
        data.status = 'pending'; data.createdAt = now; data.createdBy = sess.id; data.createdByName = sess.name || '';
        newId = await DB.addReparacion(data);
      }
      try { localStorage.setItem('facturatec_last_store', repairStore); } catch (x) {}
      showToast(editId ? 'Reparación actualizada' : 'Reparación creada', 'success');
      this.closeForm();
      if (App.currentView === 'reparacion-detail' && editId) this.showDetail(editId, true);
      if (App.currentView === 'reparaciones') this.filterAndRender();
      if (newId && confirm('Reparación creada.\n\n¿Imprimir ahora la etiqueta para pegarla en el aparato?')) {
        this.printLabel(Object.assign({}, data, { id: newId }));
      }
    } catch (e) {
      console.error('saveForm reparacion:', e);
      showToast('Error al guardar: ' + e.message, 'error');
    } finally {
      if (btn && document.body.contains(btn)) { btn.disabled = false; btn.textContent = editId ? 'Guardar cambios' : 'Crear Reparación'; }
    }
  },

  // ============================================================
  // ACCIONES
  // ============================================================
  // ============================================================
  // ETIQUETA PARA LA IMPRESORA DE TICKETS (58 mm)
  // ============================================================
  // Referencia corta y estable, derivada del identificador de la reparacion
  _code(r) {
    var id = String((r && r.id) || '');
    return id ? 'R-' + id.slice(-5).toUpperCase() : 'R-?????';
  },

  // Tipos de aparato ya escritos antes (sin duplicados), para sugerirlos al escribir
  _typeSuggestions() {
    var seen = {}, out = [];
    this.getAll().forEach(function (r) {
      var t = String(r.applianceType || '').trim();
      var k = AvisosManager._cityKey(t);
      if (k && !seen[k]) { seen[k] = 1; out.push(t); }
    });
    return out.sort(function (a, b) { return a.localeCompare(b, 'es'); });
  },

  _labelHTML(r) {
    var e = function (s) { return AvisosManager._esc(s); };
    var company = (DB.getCompany && DB.getCompany()) || {};
    var problem = String(r.problem || '');
    if (problem.length > 220) problem = problem.slice(0, 217) + '...';
    var transfer = this._transfer(r);
    var css =
      ".rep-label{font-family:'Courier New',Courier,monospace;color:#000;width:100%;max-width:54mm;margin:0 auto;font-size:9pt;line-height:1.3;text-align:left}" +
      ".rep-label *{box-sizing:border-box}" +
      ".rep-label .rl-company{text-align:center;font-size:7.5pt}" +
      ".rep-label .rl-title{text-align:center;font-size:10pt;font-weight:bold;letter-spacing:1px;margin-top:2pt}" +
      ".rep-label .rl-code{text-align:center;font-size:17pt;font-weight:bold;letter-spacing:2px;border:1.5px solid #000;padding:2pt 0;margin:3pt 0}" +
      ".rep-label .rl-hr{border:none;border-top:1px dashed #000;margin:4pt 0}" +
      ".rep-label .rl-lbl{font-size:7pt;text-transform:uppercase}" +
      ".rep-label .rl-big{font-size:12pt;font-weight:bold;word-break:break-word}" +
      ".rep-label .rl-txt{white-space:pre-wrap;word-break:break-word}" +
      ".rep-label .rl-row{display:flex;justify-content:space-between;gap:4pt;font-size:8.5pt}" +
      ".rep-label .rl-cut{text-align:center;font-size:7pt;margin-top:6pt}";
    return '<style>' + css + '</style>' +
      '<div class="rep-label">' +
        (company.name ? '<div class="rl-company">' + e(company.name) + '</div>' : '') +
        '<div class="rl-title">REPARACIÓN</div>' +
        '<div class="rl-code">' + e(this._code(r)) + '</div>' +

        '<div class="rl-lbl">Aparato</div>' +
        '<div class="rl-big">' + e(r.applianceType || '-') + '</div>' +
        '<hr class="rl-hr">' +

        '<div class="rl-lbl">Cliente</div>' +
        '<div class="rl-big">' + e(r.clientName || '-') + '</div>' +
        '<div class="rl-txt">Tel: ' + e(r.phone || '-') + '</div>' +
        '<hr class="rl-hr">' +

        '<div class="rl-lbl">Problema</div>' +
        '<div class="rl-txt">' + e(problem || '-') + '</div>' +
        '<hr class="rl-hr">' +

        '<div class="rl-row"><span>Entrada:</span><strong>' + this._date(r.entryDate, false) + '</strong></div>' +
        (transfer
          ? '<div class="rl-row"><span>Entregado en:</span><strong>' + e(this._storeLabel(r.dropStore)) + '</strong></div>' +
            '<div class="rl-row"><span>Se repara en:</span><strong>' + e(this._storeLabel(r.repairStore)) + '</strong></div>'
          : '<div class="rl-row"><span>Tienda:</span><strong>' + e(this._storeLabel(r.repairStore || r.dropStore)) + '</strong></div>') +
        (r.techName ? '<div class="rl-row"><span>Técnico:</span><strong>' + e(r.techName) + '</strong></div>' : '') +
        ((r.budget !== null && r.budget !== undefined && r.budget !== '') ? '<div class="rl-row"><span>Presupuesto:</span><strong>' + this._money(r.budget) + '</strong></div>' : '') +
        '<div class="rl-cut">- - - - - - - - - - - - - -</div>' +
      '</div>';
  },

  // Acepta el id de una reparacion o el objeto completo (recien creada)
  printLabel(arg) {
    var r = (typeof arg === 'string') ? this.getById(arg) : arg;
    if (!r) { showToast('No se encontró la reparación', 'error'); return; }
    var area = document.getElementById('print-area');
    if (!area) return;
    area.innerHTML = this._labelHTML(r);
    area.style.cssText = "font-family:'Courier New',Courier,monospace;color:#000;background:#fff;width:100%;";
    var cleaned = false;
    var cleanup = function () { if (cleaned) return; cleaned = true; area.innerHTML = ''; };
    window.addEventListener('afterprint', cleanup, { once: true });
    window.print();
    setTimeout(cleanup, 60000);   // respaldo si el navegador no emite 'afterprint'
  },

  async reassign(id, techId) {
    var u = (DB.getUsers() || []).find(function (x) { return x.id === techId; });
    if (!u) return;
    try {
      await DB.updateReparacion(id, { techId: u.id, techName: u.name, updatedAt: this._now() });
      showToast('Asignada a ' + u.name, 'success');
    } catch (e) { showToast('Error al reasignar: ' + e.message, 'error'); }
    this.showDetail(id, true);
  },

  async setStatus(id, status) {
    var f = { status: status, updatedAt: this._now() };
    if (status === 'repaired')  { f.repairedAt = this._now(); f.deliveredAt = ''; }
    if (status === 'delivered') { f.deliveredAt = this._now(); }
    if (status === 'pending')   { f.repairedAt = ''; f.deliveredAt = ''; }
    try {
      await DB.updateReparacion(id, f);
      showToast('Estado: ' + this.STATUSES[status].label, 'success');
      this.showDetail(id, true);
    } catch (e) { showToast('Error: ' + e.message, 'error'); }
  },

  async remove(id) {
    if (!this._isAdmin()) { showToast('⛔ Solo el administrador puede eliminar reparaciones', 'error'); return; }
    if (!confirm('¿Eliminar esta reparación? Esta acción no se puede deshacer.')) return;
    try {
      await DB.deleteReparacion(id);
      showToast('Reparación eliminada', 'info');
      this.currentId = null;
      this.open();
    } catch (e) { showToast('Error al eliminar: ' + e.message, 'error'); }
  },
};
