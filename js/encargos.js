/* ===================================================
   encargos.js - Control de encargos de material de clientes
   Flujo: encargado -> llegado -> recogido (ticket / factura + numero)
   Campos: cliente, telefono, producto, donde pedirlo, precio,
   fecha de entrega, trabajador que recogio el encargo y tienda.
   Todos los usuarios ven y editan todos los encargos;
   solo el admin puede eliminarlos.
   =================================================== */

const EncargosManager = {
  currentId: null,

  STORES: ['ILLUECA', 'CALATAYUD'],
  MAX_PHOTOS_PER_UPLOAD: 15,

  STATUSES: {
    pending: { label: 'Pendiente de llegada', color: '#f59e0b', bg: 'rgba(245,158,11,0.15)', icon: '⏳' },
    arrived: { label: 'Llegado, sin recoger',  color: '#3b82f6', bg: 'rgba(59,130,246,0.15)', icon: '📦' },
    picked:  { label: 'Recogido',              color: '#22c55e', bg: 'rgba(34,197,94,0.15)',  icon: '✅' },
  },

  getAll()    { return DB.getEncargos(); },
  getById(id) { return DB.getEncargoById(id); },

  _esc(s) { return AvisosManager._esc(s); },
  _users(currentId) { return AvisosManager._assignableUsers(currentId); },
  _session() { return DB.getSession(); },
  _isAdmin() { var s = this._session(); return !!(s && s.role === 'admin'); },
  _now() { return new Date().toISOString(); },
  _today() { return new Date().toISOString().slice(0, 10); },

  _status(e) { return e.pickedUp ? 'picked' : (e.arrived ? 'arrived' : 'pending'); },
  _overdue(e) { return this._status(e) === 'pending' && /^\d{4}-\d{2}-\d{2}$/.test(e.deliveryDate || '') && e.deliveryDate < this._today(); },

  _money(v) {
    if (v === null || v === undefined || v === '' || isNaN(Number(v))) return 'Sin precio';
    return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(Number(v));
  },

  _date(s, long) {
    var dt = /^\d{4}-\d{2}-\d{2}/.test(s || '') ? new Date(String(s).slice(0, 10) + 'T12:00:00') : null;
    if (!dt || isNaN(dt.getTime())) return 'Sin fecha';
    return dt.toLocaleDateString('es-ES', long
      ? { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' }
      : { day: '2-digit', month: '2-digit', year: 'numeric' });
  },

  _link(text) {
    var t = String(text || '').trim();
    if (!t) return 'Sin indicar';
    if (/^https?:\/\//i.test(t)) return '<a href="' + this._esc(t) + '" target="_blank" rel="noopener" style="color:#4f7cff;word-break:break-all;">' + this._esc(t) + '</a>';
    return this._esc(t);
  },

  // ============================================================
  // LISTADO
  // ============================================================
  open() {
    App.showView('encargos', 'Encargos de material');
    this.filterAndRender();
  },

  filterAndRender() {
    var self = this;
    var q  = ((document.getElementById('search-encargos') || {}).value || '').toLowerCase();
    var st = ((document.getElementById('filter-enc-status') || {}).value) || '';
    var sf = ((document.getElementById('filter-enc-store') || {}).value) || '';
    var all = this.getAll();
    var list = all.slice();
    if (st === 'overdue') list = list.filter(function (e) { return self._overdue(e); });
    else if (st)          list = list.filter(function (e) { return self._status(e) === st; });
    if (sf) list = list.filter(function (e) { return e.store === sf; });
    if (q)  list = list.filter(function (e) {
      return [e.clientName, e.phone, e.product, e.source, e.saleNumber, e.takenByName]
        .some(function (v) { return v && String(v).toLowerCase().includes(q); });
    });
    var rank = { arrived: 0, pending: 1, picked: 2 };
    list.sort(function (a, b) {
      var sa = self._status(a), sb = self._status(b);
      if (sa !== sb) return rank[sa] - rank[sb];
      if (sa === 'arrived') return String(a.arrivedAt || '').localeCompare(String(b.arrivedAt || ''));   // el que lleva mas tiempo esperando, primero
      if (sa === 'pending') return (a.deliveryDate || '9999').localeCompare(b.deliveryDate || '9999');
      return String(b.pickedUpAt || '').localeCompare(String(a.pickedUpAt || ''));
    });

    var sum = document.getElementById('encargos-summary');
    if (sum) {
      var nP = all.filter(function (e) { return self._status(e) === 'pending'; }).length;
      var nA = all.filter(function (e) { return self._status(e) === 'arrived'; }).length;
      var nO = all.filter(function (e) { return self._overdue(e); }).length;
      sum.innerHTML =
        '<span class="enc-chip" style="color:#f59e0b">⏳ ' + nP + ' pendientes</span>' +
        '<span class="enc-chip" style="color:#3b82f6">📦 ' + nA + ' por recoger</span>' +
        (nO ? '<span class="enc-chip" style="color:#ef4444">⚠️ ' + nO + ' retrasados</span>' : '');
    }
    this.renderList(list);
  },

  renderList(list) {
    var c = document.getElementById('encargos-list');
    if (!c) return;
    if (!list.length) {
      c.innerHTML = '<div class="empty-state"><div class="empty-icon">📦</div><div class="empty-text">No hay encargos que mostrar. Pulsa "Nuevo Encargo" para registrar el primero.</div></div>';
      return;
    }
    var self = this;
    c.innerHTML = '';
    list.forEach(function (e) {
      var s = self.STATUSES[self._status(e)];
      var late = self._overdue(e);
      var el = document.createElement('div');
      el.className = 'aviso-item glass';
      el.innerHTML =
        '<div class="aviso-item-top">' +
          '<span class="aviso-status-badge" style="background:' + s.bg + ';color:' + s.color + ';">' + s.icon + ' ' + s.label + '</span>' +
          (late ? '<span class="aviso-insurer-badge" style="background:rgba(239,68,68,0.15);color:#ef4444;">⚠️ Retrasado</span>' : '') +
          (e.store ? '<span class="aviso-insurer-badge">🏬 ' + self._esc(e.store) + '</span>' : '') +
          (e.fromWarehouse ? '<span class="aviso-insurer-badge" style="background:rgba(139,92,246,0.15);color:#a78bfa;">🔧 Reparado</span>' : '') +
        '</div>' +
        '<div class="aviso-item-body">' +
          '<div class="aviso-client-name">' + self._esc(e.product || 'Sin producto') + '</div>' +
          '<div class="aviso-appliance">👤 ' + self._esc(e.clientName || 'Sin nombre') + ' · 📞 ' + self._esc(e.phone || '-') + '</div>' +
          (e.pickedUp && e.saleNumber ? '<div class="aviso-desc">' + (e.saleType === 'factura' ? '🧾 Factura ' : '🎫 Ticket ') + self._esc(e.saleNumber) + '</div>' : '') +
        '</div>' +
        '<div class="aviso-item-footer">' +
          '<span>🚚 ' + self._date(e.deliveryDate, false) + '</span>' +
          '<span>💶 ' + self._money(e.price) + '</span>' +
          ((e.photos && e.photos.length) ? '<span>📷 ' + e.photos.length + '</span>' : '') +
        '</div>';
      el.addEventListener('click', function () { self.showDetail(e.id); });
      c.appendChild(el);
    });
  },

  // ============================================================
  // DETALLE
  // ============================================================
  showDetail(id, silent) {
    var e = this.getById(id);
    if (!e) { if (!silent) showToast('El encargo ya no existe', 'error'); return; }
    this.currentId = id;
    var self = this;
    var key = this._status(e), s = this.STATUSES[key];
    var row = function (label, html) { return '<div class="detail-row"><span class="detail-label">' + label + '</span><span>' + html + '</span></div>'; };

    var actions = '';
    if (key === 'pending') actions += '<button class="btn btn-primary" onclick="EncargosManager.markArrived(\'' + id + '\')">📦 Marcar como llegado</button>';
    if (key === 'arrived') actions += '<button class="btn btn-primary" onclick="EncargosManager.openPickup(\'' + id + '\')">🤝 Marcar como recogido por el cliente</button>';
    if (key !== 'pending') actions += '<button class="btn btn-outline" onclick="EncargosManager.undoStep(\'' + id + '\')">↩️ Deshacer ' + (key === 'picked' ? '"recogido"' : '"llegado"') + '</button>';

    var photos = e.photos || [];
    var gal = photos.map(function (p, i) {
      return '<div class="photo-thumb-wrap">' +
        '<img src="' + p.url + '" class="photo-thumb" onclick="AvisosManager.openPhotoFull(\'' + p.url + '\')" alt="Foto ' + (i + 1) + '" />' +
        '<button class="photo-delete-btn" onclick="EncargosManager.deletePhoto(\'' + id + '\',\'' + p.path + '\')" title="Eliminar">x</button>' +
      '</div>';
    }).join('');
    var photosHTML =
      '<div class="detail-section">' +
        '<div class="detail-section-title" style="display:flex;justify-content:space-between;align-items:center;">📷 Fotos del producto' +
          '<label style="cursor:pointer"><input type="file" accept="image/*" multiple style="display:none" onchange="EncargosManager.handlePhotos(\'' + id + '\', this)">' +
          '<span class="btn btn-outline btn-sm">➕ Añadir fotos</span></label></div>' +
        '<div class="photos-gallery">' + (gal || '<p style="color:#888;font-size:13px;">Sin fotos todavía.</p>') + '</div>' +
      '</div>';

    var cont = document.getElementById('encargo-detail-content');
    if (!cont) return;
    cont.innerHTML =
      '<div class="aviso-detail-header" style="background:' + s.bg + ';border-left:4px solid ' + s.color + ';padding:16px;border-radius:12px;margin-bottom:16px;">' +
        '<div style="font-size:1.1rem;font-weight:700;color:' + s.color + '">' + s.icon + ' ' + s.label + (this._overdue(e) ? ' · ⚠️ retrasado' : '') + '</div>' +
        '<div style="font-size:0.85rem;color:#aaa;margin-top:4px">Registrado ' + AvisosManager._formatDate(e.createdAt) + (e.createdByName ? ' por ' + self._esc(e.createdByName) : '') + '</div>' +
      '</div>' +

      '<div class="detail-section"><div class="detail-section-title">📦 Encargo</div>' +
        row('Producto', '<strong>' + self._esc(e.product || 'Sin producto') + '</strong>') +
        row('Dónde pedirlo', e.fromWarehouse ? '🔧 Del almacén de material reparado' : self._link(e.source)) +
        row('Precio', '<strong>' + self._money(e.price) + '</strong>') +
        row('Entrega prevista', self._date(e.deliveryDate, true)) +
      '</div>' +
      photosHTML +

      '<div class="detail-section"><div class="detail-section-title">👤 Cliente</div>' +
        row('Nombre', '<strong>' + self._esc(e.clientName || 'Sin nombre') + '</strong>') +
        row('Teléfono', '<a href="tel:' + self._esc((e.phone || '').replace(/\s/g, '')) + '" style="color:#4f7cff;">' + self._esc(e.phone || 'Sin teléfono') + '</a>') +
      '</div>' +

      '<div class="detail-section"><div class="detail-section-title">🏬 Registro</div>' +
        row('Tienda', self._esc(e.store || 'Sin indicar')) +
        row('Encargo recogido por', self._esc(e.takenByName || 'Sin indicar')) +
      '</div>' +

      '<div class="detail-section"><div class="detail-section-title">🚚 Seguimiento</div>' +
        row('Llegado', e.arrived ? '✅ ' + self._date(e.arrivedAt, false) : '❌ No') +
        row('Recogido por el cliente', e.pickedUp ? '✅ ' + self._date(e.pickedUpAt, false) : '❌ No') +
        (e.pickedUp ? row('Vendido con', (e.saleType === 'factura' ? '🧾 Factura' : '🎫 Ticket') + ' nº <strong>' + self._esc(e.saleNumber || '-') + '</strong>') : '') +
      '</div>' +

      '<div class="detail-actions">' +
        actions +
        '<button class="btn btn-outline" onclick="EncargosManager.openForm(\'' + id + '\')">✏️ Editar encargo</button>' +
        (this._isAdmin() ? '<button class="btn btn-outline" style="color:#ef4444" onclick="EncargosManager.remove(\'' + id + '\')">🗑️ Eliminar encargo</button>' : '') +
      '</div>';

    if (!silent) App.showView('encargo-detail', 'Encargo');
  },

  // ============================================================
  // FORMULARIO (crear / editar)
  // ============================================================
  openForm(id) {
    var e = id ? this.getById(id) : null;
    var sess = this._session();
    var self = this;
    var lastStore = ''; try { lastStore = localStorage.getItem('facturatec_last_store') || ''; } catch (x) {}
    var store = (e && e.store) || lastStore;
    var taker = (e && e.takenById) || (sess && sess.id);
    var v = function (k) { return self._esc((e && e[k] !== undefined && e[k] !== null) ? e[k] : ''); };
    var storeOpts = '<option value="">Selecciona tienda</option>' + this.STORES.map(function (s) {
      return '<option value="' + s + '" ' + (store === s ? 'selected' : '') + '>' + s + '</option>';
    }).join('');
    var userOpts = '<option value="">Selecciona trabajador</option>' + this._users(e && e.takenById).map(function (u) {
      return '<option value="' + u.id + '" ' + (taker === u.id ? 'selected' : '') + '>' + self._esc(u.name) + '</option>';
    }).join('');
    var arrived = !!(e && e.arrived), picked = !!(e && e.pickedUp);

    var h =
      '<div class="modal-overlay" onclick="EncargosManager.closeForm()"></div>' +
      '<div class="modal-card glass" style="max-width:520px;width:92vw;max-height:90vh;overflow-y:auto;padding:24px;">' +
        '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;">' +
          '<h3 style="margin:0;">' + (e ? '✏️ Editar Encargo' : '➕ Nuevo Encargo') + '</h3>' +
          '<button class="btn-close" onclick="EncargosManager.closeForm()">✕</button>' +
        '</div>' +

        '<div style="font-weight:600;color:#4f7cff;margin-bottom:12px;">👤 Cliente</div>' +
        '<div class="field-group"><label>Nombre del cliente <span class="required">*</span></label><input type="text" id="enc-client" value="' + v('clientName') + '" /></div>' +
        '<div class="field-group"><label>Teléfono <span class="required">*</span></label><input type="tel" id="enc-phone" value="' + v('phone') + '" /></div>' +

        '<div style="font-weight:600;color:#4f7cff;margin:16px 0 12px;">📦 Encargo</div>' +
        '<div class="field-group"><label>Producto encargado <span class="required">*</span></label><input type="text" id="enc-product" placeholder="Marca, modelo, referencia..." value="' + v('product') + '" /></div>' +
        '<label class="enc-check"><input type="checkbox" id="enc-warehouse" ' + (e && e.fromWarehouse ? 'checked' : '') + ' /> 🔧 Es un electrodoméstico de nuestro almacén de reparados</label>' +
        '<div class="field-group"><label>Dónde pedirlo (proveedor o enlace)</label><input type="text" id="enc-source" placeholder="Proveedor, web, enlace..." value="' + v('source') + '" /></div>' +
        '<div class="field-row">' +
          '<div class="field-group"><label>Precio al cliente (€)</label><input type="number" id="enc-price" step="0.01" min="0" inputmode="decimal" value="' + v('price') + '" /></div>' +
          '<div class="field-group"><label>Fecha de entrega</label><input type="date" id="enc-delivery" value="' + v('deliveryDate') + '" /></div>' +
        '</div>' +

        '<div class="field-group"><label>📷 Fotos del producto (puedes elegir varias)</label>' +
          '<input type="file" id="enc-photos" accept="image/*" multiple />' +
          '<small style="color:#888">Se reducen automáticamente para ahorrar espacio. Las que ya tenga el encargo se conservan.</small></div>' +

        '<div style="font-weight:600;color:#4f7cff;margin:16px 0 12px;">🏬 Registro</div>' +
        '<div class="field-row">' +
          '<div class="field-group"><label>Tienda <span class="required">*</span></label><select id="enc-store">' + storeOpts + '</select></div>' +
          '<div class="field-group"><label>Encargo recogido por <span class="required">*</span></label><select id="enc-taker">' + userOpts + '</select></div>' +
        '</div>' +

        '<div style="font-weight:600;color:#4f7cff;margin:16px 0 12px;">🚚 Seguimiento</div>' +
        '<label class="enc-check"><input type="checkbox" id="enc-arrived" ' + (arrived ? 'checked' : '') + ' onchange="EncargosManager._syncForm()" /> 📦 Ya ha llegado</label>' +
        '<label class="enc-check"><input type="checkbox" id="enc-picked" ' + (picked ? 'checked' : '') + ' onchange="EncargosManager._syncForm()" /> 🤝 El cliente ya lo ha recogido</label>' +
        '<div id="enc-sale-block" style="display:none;margin-top:10px;">' +
          '<div class="field-row">' +
            '<div class="field-group"><label>Vendido con</label><select id="enc-saletype">' +
              '<option value="ticket" ' + (e && e.saleType === 'ticket' ? 'selected' : '') + '>🎫 Ticket</option>' +
              '<option value="factura" ' + (e && e.saleType === 'factura' ? 'selected' : '') + '>🧾 Factura</option></select></div>' +
            '<div class="field-group"><label>Nº de ticket / factura <span class="required">*</span></label><input type="text" id="enc-salenumber" value="' + v('saleNumber') + '" /></div>' +
          '</div>' +
        '</div>' +

        '<div style="display:flex;gap:12px;margin-top:20px;">' +
          '<button type="button" class="btn btn-outline" style="flex:1" onclick="EncargosManager.closeForm()">Cancelar</button>' +
          '<button type="button" class="btn btn-primary" style="flex:2" id="btn-save-enc" onclick="EncargosManager.saveForm(\'' + (id || '') + '\')">' + (e ? 'Guardar cambios' : 'Crear Encargo') + '</button>' +
        '</div>' +
      '</div>';

    var modal = document.getElementById('modal-encargo-form');
    modal.innerHTML = h;
    modal.classList.remove('hidden');
    this._syncForm();
  },

  // Coherencia: recogido => llegado; el bloque de ticket/factura solo si esta recogido
  _syncForm() {
    var a = document.getElementById('enc-arrived'), p = document.getElementById('enc-picked'), b = document.getElementById('enc-sale-block');
    if (!a || !p) return;
    if (p.checked) a.checked = true;
    if (!a.checked) p.checked = false;
    p.disabled = !a.checked;
    if (b) b.style.display = p.checked ? 'block' : 'none';
  },

  closeForm() {
    var m = document.getElementById('modal-encargo-form');
    if (m) { m.classList.add('hidden'); m.innerHTML = ''; }
  },

  async saveForm(editId) {
    var sess = this._session();
    if (!sess || !sess.id) { showToast('Tu sesión no tiene perfil válido. Cierra sesión y vuelve a entrar.', 'error'); return; }
    var val = function (id) { var el = document.getElementById(id); return el ? el.value.trim() : ''; };
    var chk = function (id) { var el = document.getElementById(id); return !!(el && el.checked); };
    var clientName = val('enc-client'), phone = val('enc-phone'), product = val('enc-product');
    var store = val('enc-store'), takerId = val('enc-taker');
    if (!clientName || !phone || !product) { showToast('Cliente, teléfono y producto son obligatorios', 'error'); return; }
    if (!store)   { showToast('Indica la tienda (ILLUECA o CALATAYUD)', 'error'); return; }
    if (!takerId) { showToast('Indica qué trabajador ha recogido el encargo', 'error'); return; }

    var delivery = val('enc-delivery');
    if (delivery && !/^\d{4}-\d{2}-\d{2}$/.test(delivery)) { showToast('La fecha de entrega no es válida (revisa el año)', 'error'); return; }
    var priceRaw = val('enc-price'), price = null;
    if (priceRaw !== '') {
      price = parseFloat(priceRaw.replace(',', '.'));
      if (isNaN(price) || price < 0) { showToast('El precio no es válido', 'error'); return; }
      price = Math.round(price * 100) / 100;
    }

    var arrived = chk('enc-arrived'), picked = arrived && chk('enc-picked');
    var saleType = '', saleNumber = '';
    if (picked) {
      saleType = val('enc-saletype') || 'ticket';
      saleNumber = val('enc-salenumber');
      if (!saleNumber) { showToast('Indica el número de ' + (saleType === 'factura' ? 'factura' : 'ticket'), 'error'); return; }
    }

    var taker = (DB.getUsers() || []).find(function (u) { return u.id === takerId; });
    var old = editId ? (this.getById(editId) || {}) : {};
    var now = this._now();
    var data = {
      clientName: clientName, phone: phone, product: product,
      source: val('enc-source'), price: price, deliveryDate: delivery,
      store: store, takenById: takerId, takenByName: taker ? taker.name : (old.takenByName || ''),
      arrived: arrived, arrivedAt: arrived ? (old.arrivedAt || now) : '',
      pickedUp: picked, pickedUpAt: picked ? (old.pickedUpAt || now) : '',
      saleType: saleType, saleNumber: saleNumber,
      fromWarehouse: chk('enc-warehouse'),
      updatedAt: now,
    };
    var photoInput = document.getElementById('enc-photos');
    var photoFiles = (photoInput && photoInput.files) ? Array.prototype.slice.call(photoInput.files) : [];
    if (photoFiles.length > this.MAX_PHOTOS_PER_UPLOAD) {
      showToast('Máximo ' + this.MAX_PHOTOS_PER_UPLOAD + ' fotos cada vez', 'error'); return;
    }

    var btn = document.getElementById('btn-save-enc');
    btn.disabled = true; btn.textContent = 'Guardando...';
    try {
      var id = editId;
      if (editId) {
        await DB.updateEncargo(editId, data);
      } else {
        data.createdAt = now; data.createdBy = sess.id; data.createdByName = sess.name || '';
        data.photos = [];
        id = await DB.addEncargo(data);
      }
      if (photoFiles.length) {
        btn.textContent = 'Subiendo fotos...';
        var base = editId ? ((this.getById(editId) || {}).photos || []) : [];
        var up = await this._uploadPhotos(id, photoFiles);
        if (up.uploaded.length) await DB.updateEncargo(id, { photos: base.concat(up.uploaded), updatedAt: this._now() });
        if (up.failed) showToast('El encargo se guardó, pero ' + up.failed + ' foto(s) no se pudieron subir: ' + up.error, 'error', 9000);
      }
      try { localStorage.setItem('facturatec_last_store', store); } catch (x) {}
      showToast(editId ? 'Encargo actualizado' : 'Encargo creado', 'success');
      this.closeForm();
      if (App.currentView === 'encargo-detail' && editId) this.showDetail(editId, true);
      if (App.currentView === 'encargos') this.filterAndRender();
    } catch (e) {
      console.error('saveForm encargo:', e);
      showToast('Error al guardar: ' + e.message, 'error');
    } finally {
      if (btn && document.body.contains(btn)) { btn.disabled = false; btn.textContent = editId ? 'Guardar cambios' : 'Crear Encargo'; }
    }
  },

  // ============================================================
  // ACCIONES RAPIDAS DEL DETALLE
  // ============================================================
  async markArrived(id) {
    try {
      await DB.updateEncargo(id, { arrived: true, arrivedAt: this._now(), updatedAt: this._now() });
      showToast('Encargo marcado como llegado. Avisa al cliente 📞', 'success', 5000);
      this.showDetail(id, true);
    } catch (e) { showToast('Error: ' + e.message, 'error'); }
  },

  openPickup(id) {
    var e = this.getById(id);
    if (!e) return;
    var h =
      '<div class="modal-overlay" onclick="EncargosManager.closeForm()"></div>' +
      '<div class="modal-card glass" style="max-width:420px;width:92vw;padding:24px;">' +
        '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">' +
          '<h3 style="margin:0;">🤝 Entrega al cliente</h3>' +
          '<button class="btn-close" onclick="EncargosManager.closeForm()">✕</button>' +
        '</div>' +
        '<p style="color:#aaa;font-size:0.9rem;margin-bottom:16px;">' + this._esc(e.product || '') + ' — ' + this._esc(e.clientName || '') + '</p>' +
        '<div class="field-group"><label>Vendido con</label><select id="pk-type"><option value="ticket">🎫 Ticket</option><option value="factura">🧾 Factura</option></select></div>' +
        '<div class="field-group"><label>Nº de ticket / factura <span class="required">*</span></label><input type="text" id="pk-number" /></div>' +
        '<div style="display:flex;gap:12px;margin-top:20px;">' +
          '<button type="button" class="btn btn-outline" style="flex:1" onclick="EncargosManager.closeForm()">Cancelar</button>' +
          '<button type="button" class="btn btn-primary" style="flex:2" id="btn-confirm-pk" onclick="EncargosManager.confirmPickup(\'' + id + '\')">Confirmar entrega</button>' +
        '</div>' +
      '</div>';
    var modal = document.getElementById('modal-encargo-form');
    modal.innerHTML = h;
    modal.classList.remove('hidden');
    var n = document.getElementById('pk-number'); if (n) n.focus();
  },

  async confirmPickup(id) {
    var type = (document.getElementById('pk-type') || {}).value || 'ticket';
    var number = ((document.getElementById('pk-number') || {}).value || '').trim();
    if (!number) { showToast('Indica el número de ' + (type === 'factura' ? 'factura' : 'ticket'), 'error'); return; }
    var btn = document.getElementById('btn-confirm-pk'); if (btn) btn.disabled = true;
    try {
      await DB.updateEncargo(id, { pickedUp: true, pickedUpAt: this._now(), saleType: type, saleNumber: number, updatedAt: this._now() });
      showToast('Entrega registrada', 'success');
      this.closeForm();
      this.showDetail(id, true);
    } catch (e) {
      showToast('Error: ' + e.message, 'error');
      if (btn) btn.disabled = false;
    }
  },

  async undoStep(id) {
    var e = this.getById(id);
    if (!e) return;
    var wasPicked = !!e.pickedUp;
    if (!confirm(wasPicked ? '¿Deshacer "recogido"? Se borrará el nº de ticket/factura.' : '¿Deshacer "llegado"?')) return;
    var f = wasPicked
      ? { pickedUp: false, pickedUpAt: '', saleType: '', saleNumber: '' }
      : { arrived: false, arrivedAt: '' };
    f.updatedAt = this._now();
    try {
      await DB.updateEncargo(id, f);
      showToast('Cambio deshecho', 'info');
      this.showDetail(id, true);
    } catch (x) { showToast('Error: ' + x.message, 'error'); }
  },

  // ============================================================
  // FOTOS
  // ============================================================
  // Reduce fotos grandes del movil (max 1600 px, JPEG) para ahorrar espacio en Storage
  _compress(file) {
    return new Promise(function (resolve) {
      if (!/^image\//.test(file.type) || /gif|svg/.test(file.type)) return resolve(file);
      var img = new Image(), url = URL.createObjectURL(file);
      img.onload = function () {
        URL.revokeObjectURL(url);
        var w = img.naturalWidth, h = img.naturalHeight, r = Math.min(1, 1600 / Math.max(w, h));
        if (r === 1 && file.size < 1.5 * 1024 * 1024) return resolve(file);
        var c = document.createElement('canvas');
        c.width = Math.round(w * r); c.height = Math.round(h * r);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        c.toBlob(function (b) { resolve(b && b.size < file.size ? b : file); }, 'image/jpeg', 0.82);
      };
      img.onerror = function () { URL.revokeObjectURL(url); resolve(file); };
      img.src = url;
    });
  },

  async _uploadPhotos(id, files) {
    var uploaded = [], failed = 0, error = '';
    for (var i = 0; i < files.length; i++) {
      var f = files[i];
      try {
        if (!/^image\//.test(f.type)) throw new Error('"' + f.name + '" no es una imagen');
        var blob = await this._compress(f);
        var safe = (f.name || 'foto.jpg').replace(/[^\w.\-]+/g, '_');
        if (blob !== f) safe = safe.replace(/\.[^.]*$/, '') + '.jpg';
        var path = 'encargos/' + id + '/photos/' + Date.now() + '_' + i + '_' + safe;
        var url = await DB.uploadFile(path, blob);
        uploaded.push({ url: url, path: path, name: f.name || safe, uploadedAt: this._now() });
      } catch (e) {
        console.error('Subida foto encargo:', e);
        failed++; error = e.message || String(e);
      }
    }
    return { uploaded: uploaded, failed: failed, error: error };
  },

  async handlePhotos(id, input) {
    var files = Array.prototype.slice.call(input.files || []);
    input.value = '';
    if (!files.length) return;
    if (files.length > this.MAX_PHOTOS_PER_UPLOAD) { showToast('Máximo ' + this.MAX_PHOTOS_PER_UPLOAD + ' fotos cada vez', 'error'); return; }
    showToast('Subiendo ' + files.length + ' foto(s)...', 'info', 8000);
    var up = await this._uploadPhotos(id, files);
    try {
      if (up.uploaded.length) {
        var base = (this.getById(id) || {}).photos || [];
        await DB.updateEncargo(id, { photos: base.concat(up.uploaded), updatedAt: this._now() });
        showToast(up.uploaded.length + ' foto(s) subidas', 'success');
      }
      if (up.failed) showToast(up.failed + ' foto(s) no se pudieron subir: ' + up.error, 'error', 9000);
      this.showDetail(id, true);
    } catch (e) { showToast('Error al guardar las fotos: ' + e.message, 'error'); }
  },

  async deletePhoto(id, path) {
    if (!confirm('¿Eliminar esta foto?')) return;
    try {
      await DB.deleteFile(path);
      var np = ((this.getById(id) || {}).photos || []).filter(function (p) { return p.path !== path; });
      await DB.updateEncargo(id, { photos: np, updatedAt: this._now() });
      showToast('Foto eliminada', 'info');
      this.showDetail(id, true);
    } catch (e) { showToast('Error al eliminar la foto: ' + e.message, 'error'); }
  },

  async remove(id) {
    if (!this._isAdmin()) { showToast('⛔ Solo el administrador puede eliminar encargos', 'error'); return; }
    if (!confirm('¿Eliminar este encargo? Esta acción no se puede deshacer.')) return;
    try {
      var enc = this.getById(id);
      if (enc && enc.photos) {
        for (var i = 0; i < enc.photos.length; i++) { try { await DB.deleteFile(enc.photos[i].path); } catch (x) {} }
      }
      await DB.deleteEncargo(id);
      showToast('Encargo eliminado', 'info');
      this.currentId = null;
      this.open();
    } catch (e) { showToast('Error al eliminar: ' + e.message, 'error'); }
  },
};
