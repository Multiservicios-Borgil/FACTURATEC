/* ===================================================
   instalaciones.js - Modulo de Instalaciones programadas
   Campos: direccion, telefono, factura de venta (PDF),
   comentarios, tecnico asignado (+ fecha/hora y estado).
   Todos los usuarios ven todas las instalaciones y pueden
   reasignarlas; solo el admin puede eliminarlas.
   =================================================== */

const InstalacionesManager = {
  currentId: null,

  STATUSES: {
    pending: { label: 'Pendiente', color: '#f59e0b', bg: 'rgba(245,158,11,0.15)', icon: '📅' },
    done:    { label: 'Realizada', color: '#22c55e', bg: 'rgba(34,197,94,0.15)',  icon: '✅' },
  },

  MAX_PDF_MB: 15,

  getAll()    { return DB.getInstalaciones(); },
  getById(id) { return DB.getInstalacionById(id); },

  _esc(s) { return AvisosManager._esc(s); },
  _users(currentTechId) { return AvisosManager._assignableUsers(currentTechId); },
  _session() { return DB.getSession(); },
  _isAdmin() { var s = this._session(); return !!(s && s.role === 'admin'); },

  _formatApt(inst, long) {
    if (!inst.date) return 'Sin fecha';
    var d = new Date(inst.date + 'T12:00:00').toLocaleDateString('es-ES', long
      ? { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' }
      : { day: '2-digit', month: '2-digit', year: 'numeric' });
    return d + (inst.time ? ' · ' + inst.time : '');
  },

  // ============================================================
  // LISTADO
  // ============================================================
  open() {
    App.showView('instalaciones', 'Instalaciones');
    var techSel = document.getElementById('filter-inst-tech');
    if (techSel) {
      var prev = techSel.value;
      var sess = this._session();
      var self = this;
      techSel.innerHTML = '<option value="">Todos los técnicos</option>' +
        (sess && !this._isAdmin() ? '<option value="' + sess.id + '">Mis instalaciones</option>' : '') +
        this._users().map(function (u) { return '<option value="' + u.id + '">' + self._esc(u.name) + '</option>'; }).join('');
      techSel.value = prev;
    }
    this.filterAndRender();
  },

  filterAndRender() {
    var q  = ((document.getElementById('search-instalaciones') || {}).value || '').toLowerCase();
    var st = ((document.getElementById('filter-inst-status') || {}).value) || '';
    var tf = ((document.getElementById('filter-inst-tech') || {}).value) || '';
    var list = this.getAll().slice();
    if (st) list = list.filter(function (i) { return (i.status || 'pending') === st; });
    if (tf) list = list.filter(function (i) { return i.techId === tf; });
    if (q)  list = list.filter(function (i) {
      return [i.address, i.phone, i.comments, i.techName, i.salesInvoice && i.salesInvoice.name]
        .some(function (v) { return v && String(v).toLowerCase().includes(q); });
    });
    // Pendientes primero, ordenadas por fecha programada (sin fecha al final)
    list.sort(function (a, b) {
      var sa = (a.status || 'pending') === 'done' ? 1 : 0, sb = (b.status || 'pending') === 'done' ? 1 : 0;
      if (sa !== sb) return sa - sb;
      var da = (a.date || '9999') + (a.time || ''), db = (b.date || '9999') + (b.time || '');
      if (sa === 1) return db.localeCompare(da); // realizadas: mas recientes primero
      return da.localeCompare(db);
    });
    this.renderList(list);
  },

  renderList(list) {
    var c = document.getElementById('instalaciones-list');
    if (!c) return;
    if (!list.length) {
      c.innerHTML = '<div class="empty-state"><div class="empty-icon">🏠</div><div class="empty-text">No hay instalaciones. Pulsa "Nueva Instalación" para programar la primera.</div></div>';
      return;
    }
    var self = this;
    c.innerHTML = '';
    list.forEach(function (inst) {
      var st = self.STATUSES[inst.status] || self.STATUSES.pending;
      var el = document.createElement('div');
      el.className = 'aviso-item glass';
      el.innerHTML =
        '<div class="aviso-item-top">' +
          '<span class="aviso-status-badge" style="background:' + st.bg + ';color:' + st.color + ';">' + st.icon + ' ' + st.label + '</span>' +
          (inst.salesInvoice ? '<span class="aviso-insurer-badge">📄 Factura</span>' : '') +
        '</div>' +
        '<div class="aviso-item-body">' +
          '<div class="aviso-client-name">📍 ' + self._esc(inst.address || 'Sin dirección') + '</div>' +
          '<div class="aviso-appliance">📞 ' + self._esc(inst.phone || 'Sin teléfono') + '</div>' +
          (inst.comments ? '<div class="aviso-desc">' + self._esc(inst.comments.substring(0, 90)) + (inst.comments.length > 90 ? '...' : '') + '</div>' : '') +
        '</div>' +
        '<div class="aviso-item-footer">' +
          '<span>📅 ' + self._formatApt(inst, false) + '</span>' +
          '<span>👷 ' + self._esc(inst.techName || 'Sin asignar') + '</span>' +
        '</div>';
      el.addEventListener('click', function () { self.showDetail(inst.id); });
      c.appendChild(el);
    });
  },

  // ============================================================
  // DETALLE
  // ============================================================
  showDetail(id, silent) {
    var inst = this.getById(id);
    if (!inst) { if (!silent) showToast('La instalación ya no existe', 'error'); return; }
    this.currentId = id;
    var self = this;
    var st = this.STATUSES[inst.status] || this.STATUSES.pending;
    var isDone = inst.status === 'done';

    var opts = this._users(inst.techId).map(function (u) {
      return '<option value="' + u.id + '" ' + (u.id === inst.techId ? 'selected' : '') + '>' + self._esc(u.name) + '</option>';
    }).join('');
    if (!inst.techId) opts = '<option value="" selected>Sin asignar</option>' + opts;

    var mapsUrl = 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(inst.address || '');

    var pdfHTML = inst.salesInvoice
      ? '<div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:10px;">' +
          '<a href="' + inst.salesInvoice.url + '" target="_blank" rel="noopener" class="btn btn-outline btn-sm">📄 Ver factura (' + self._esc(inst.salesInvoice.name || 'PDF') + ')</a>' +
          '<button class="btn btn-outline btn-sm" style="color:#ef4444" onclick="InstalacionesManager.deletePdf(\'' + id + '\')">Quitar</button>' +
        '</div>'
      : '<p style="color:#888;font-size:13px;margin-bottom:10px;">No adjuntada todavía.</p>';
    pdfHTML += '<label style="cursor:pointer"><input type="file" accept="application/pdf" style="display:none" onchange="InstalacionesManager.handlePdfUpload(\'' + id + '\', this)">' +
      '<span class="btn btn-outline btn-sm">📤 ' + (inst.salesInvoice ? 'Reemplazar' : 'Adjuntar') + ' factura PDF</span></label>';

    var cont = document.getElementById('instalacion-detail-content');
    if (!cont) return;
    cont.innerHTML =
      '<div class="aviso-detail-header" style="background:' + st.bg + ';border-left:4px solid ' + st.color + ';padding:16px;border-radius:12px;margin-bottom:16px;">' +
        '<div style="font-size:1.1rem;font-weight:700;color:' + st.color + '">' + st.icon + ' Instalación ' + st.label.toLowerCase() + '</div>' +
        '<div style="font-size:0.85rem;color:#aaa;margin-top:4px">Creada ' + AvisosManager._formatDate(inst.createdAt) + (inst.createdByName ? ' por ' + self._esc(inst.createdByName) : '') + '</div>' +
      '</div>' +

      '<div class="detail-section"><div class="detail-section-title">📍 Datos de la instalación</div>' +
        '<div class="detail-row"><span class="detail-label">Dirección</span><span><a href="' + mapsUrl + '" target="_blank" rel="noopener" style="color:#4f7cff;">' + self._esc(inst.address || 'Sin dirección') + '</a></span></div>' +
        '<div class="detail-row"><span class="detail-label">Teléfono</span><span><a href="tel:' + self._esc((inst.phone || '').replace(/\s/g, '')) + '" style="color:#4f7cff;">' + self._esc(inst.phone || 'Sin teléfono') + '</a></span></div>' +
        '<div class="detail-row"><span class="detail-label">Programada</span><span>' + self._formatApt(inst, true) + '</span></div>' +
      '</div>' +

      '<div class="detail-section"><div class="detail-section-title">👷 Asignación</div>' +
        '<div class="field-group"><label>Técnico responsable</label>' +
        '<select onchange="InstalacionesManager.reassign(\'' + id + '\', this.value)">' + opts + '</select></div></div>' +

      '<div class="detail-section"><div class="detail-section-title">📄 Factura de venta</div>' + pdfHTML + '</div>' +

      '<div class="detail-section"><div class="detail-section-title">🗒️ Comentarios</div>' +
        '<div class="inst-comments">' + (inst.comments ? self._esc(inst.comments) : '<span style="color:#888">Sin comentarios.</span>') + '</div></div>' +

      '<div class="detail-actions">' +
        '<button class="btn btn-outline" onclick="InstalacionesManager.openForm(\'' + id + '\')">✏️ Editar instalación</button>' +
        '<button class="btn ' + (isDone ? 'btn-outline' : 'btn-primary') + '" onclick="InstalacionesManager.setStatus(\'' + id + '\', \'' + (isDone ? 'pending' : 'done') + '\')">' +
          (isDone ? '↩️ Marcar como pendiente' : '✅ Marcar como realizada') + '</button>' +
        (this._isAdmin() ? '<button class="btn btn-outline" style="color:#ef4444" onclick="InstalacionesManager.remove(\'' + id + '\')">🗑️ Eliminar instalación</button>' : '') +
      '</div>';

    if (!silent) App.showView('instalacion-detail', 'Instalación');
  },

  // ============================================================
  // FORMULARIO (crear / editar)
  // ============================================================
  openForm(id) {
    var inst = id ? this.getById(id) : null;
    var sess = this._session();
    var self = this;
    var sel = (inst && inst.techId) || (sess && sess.id);
    var techOpts = '<option value="">Sin asignar</option>' + this._users(inst && inst.techId).map(function (u) {
      return '<option value="' + u.id + '" ' + (sel === u.id ? 'selected' : '') + '>' + self._esc(u.name) + '</option>';
    }).join('');
    var v = function (k) { return self._esc((inst && inst[k]) || ''); };

    var h =
      '<div class="modal-overlay" onclick="InstalacionesManager.closeForm()"></div>' +
      '<div class="modal-card glass" style="max-width:520px;width:92vw;max-height:90vh;overflow-y:auto;padding:24px;">' +
        '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;">' +
          '<h3 style="margin:0;">' + (inst ? '✏️ Editar Instalación' : '➕ Nueva Instalación') + '</h3>' +
          '<button class="btn-close" onclick="InstalacionesManager.closeForm()">✕</button>' +
        '</div>' +
        '<div class="field-group"><label>Dirección <span class="required">*</span></label>' +
          '<input type="text" id="inst-address" placeholder="Calle, número, piso, población" value="' + v('address') + '" /></div>' +
        '<div class="field-group"><label>Teléfono <span class="required">*</span></label>' +
          '<input type="tel" id="inst-phone" placeholder="600 000 000" value="' + v('phone') + '" /></div>' +
        '<div class="field-row">' +
          '<div class="field-group"><label>Fecha (opcional)</label><input type="date" id="inst-date" value="' + v('date') + '" /></div>' +
          '<div class="field-group"><label>Hora (opcional)</label><input type="time" id="inst-time" value="' + v('time') + '" /></div>' +
        '</div>' +
        '<div class="field-group"><label>Técnico</label><select id="inst-tech">' + techOpts + '</select></div>' +
        '<div class="field-group"><label>Factura de venta (PDF)' + (inst && inst.salesInvoice ? ' — actual: ' + self._esc(inst.salesInvoice.name || 'PDF') : '') + '</label>' +
          '<input type="file" id="inst-pdf" accept="application/pdf" />' +
          (inst && inst.salesInvoice ? '<small style="color:#888">Si eliges otro archivo, sustituirá al actual.</small>' : '') + '</div>' +
        '<div class="field-group"><label>Comentarios</label>' +
          '<textarea id="inst-comments" rows="8" placeholder="Material, accesos, horario del cliente, observaciones...">' + v('comments') + '</textarea></div>' +
        '<div style="display:flex;gap:12px;margin-top:20px;">' +
          '<button type="button" class="btn btn-outline" style="flex:1" onclick="InstalacionesManager.closeForm()">Cancelar</button>' +
          '<button type="button" class="btn btn-primary" style="flex:2" id="btn-save-inst" onclick="InstalacionesManager.saveForm(\'' + (id || '') + '\')">' + (inst ? 'Guardar cambios' : 'Crear Instalación') + '</button>' +
        '</div>' +
      '</div>';

    var modal = document.getElementById('modal-instalacion-form');
    modal.innerHTML = h;
    modal.classList.remove('hidden');
  },

  closeForm() {
    var m = document.getElementById('modal-instalacion-form');
    if (m) { m.classList.add('hidden'); m.innerHTML = ''; }
  },

  _validPdf(file) {
    if (!file) return true;
    var isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name || '');
    if (!isPdf) { showToast('El archivo debe ser un PDF', 'error'); return false; }
    if (file.size > this.MAX_PDF_MB * 1024 * 1024) { showToast('El PDF supera ' + this.MAX_PDF_MB + ' MB', 'error'); return false; }
    return true;
  },

  async _uploadPdf(id, file) {
    var safeName = (file.name || 'factura.pdf').replace(/[^\w.\-]+/g, '_');
    var path = 'instalaciones/' + id + '/factura/' + Date.now() + '_' + safeName;
    var url = await DB.uploadFile(path, file);
    return { url: url, path: path, name: file.name || safeName, uploadedAt: new Date().toISOString() };
  },

  async saveForm(editId) {
    var sess = this._session();
    if (!sess || !sess.id) { showToast('Tu sesión no tiene perfil válido. Cierra sesión y vuelve a entrar.', 'error'); return; }
    var val = function (id) { var el = document.getElementById(id); return el ? el.value.trim() : ''; };
    var address = val('inst-address'), phone = val('inst-phone');
    if (!address || !phone) { showToast('La dirección y el teléfono son obligatorios', 'error'); return; }
    var fileInput = document.getElementById('inst-pdf');
    var file = fileInput && fileInput.files && fileInput.files[0];
    if (!this._validPdf(file)) return;

    var techId = val('inst-tech');
    var tech = techId ? (DB.getUsers() || []).find(function (u) { return u.id === techId; }) : null;
    var data = {
      address: address,
      phone: phone,
      date: val('inst-date'),
      time: val('inst-time'),
      comments: (document.getElementById('inst-comments') || { value: '' }).value,
      techId: tech ? tech.id : '',
      techName: tech ? tech.name : '',
      updatedAt: new Date().toISOString(),
    };

    var btn = document.getElementById('btn-save-inst');
    btn.disabled = true; btn.textContent = file ? 'Subiendo factura...' : 'Guardando...';
    try {
      var id = editId;
      if (editId) {
        await DB.updateInstalacion(editId, data);
      } else {
        data.status = 'pending';
        data.createdAt = new Date().toISOString();
        data.createdBy = sess.id;
        data.createdByName = sess.name || '';
        data.salesInvoice = null;
        id = await DB.addInstalacion(data);
      }
      if (file) {
        var old = editId ? (this.getById(editId) || {}).salesInvoice : null;
        try {
          var pdf = await this._uploadPdf(id, file);
          await DB.updateInstalacion(id, { salesInvoice: pdf, updatedAt: new Date().toISOString() });
          if (old && old.path) DB.deleteFile(old.path);
        } catch (e) {
          console.error('Subida PDF:', e);
          showToast('Instalación guardada, pero no se pudo subir el PDF: ' + e.message, 'error', 8000);
        }
      }
      showToast(editId ? 'Instalación actualizada' : 'Instalación creada', 'success');
      this.closeForm();
      if (App.currentView === 'instalacion-detail' && editId) this.showDetail(editId, true);
      if (App.currentView === 'instalaciones') this.filterAndRender();
    } catch (e) {
      console.error('saveForm instalacion:', e);
      showToast('Error al guardar: ' + e.message, 'error');
    } finally {
      if (btn && document.body.contains(btn)) { btn.disabled = false; btn.textContent = editId ? 'Guardar cambios' : 'Crear Instalación'; }
    }
  },

  // ============================================================
  // ACCIONES
  // ============================================================
  async reassign(id, techId) {
    var u = (DB.getUsers() || []).find(function (x) { return x.id === techId; });
    if (!u) return;
    try {
      await DB.updateInstalacion(id, { techId: u.id, techName: u.name, updatedAt: new Date().toISOString() });
      showToast('Asignada a ' + u.name, 'success');
    } catch (e) { showToast('Error al reasignar: ' + e.message, 'error'); }
    this.showDetail(id, true);
  },

  async setStatus(id, status) {
    try {
      var f = { status: status, updatedAt: new Date().toISOString() };
      if (status === 'done') { var s = this._session(); f.doneAt = new Date().toISOString(); f.doneBy = (s && s.name) || ''; }
      await DB.updateInstalacion(id, f);
      showToast(status === 'done' ? 'Instalación marcada como realizada' : 'Instalación marcada como pendiente', 'success');
      this.showDetail(id, true);
    } catch (e) { showToast('Error: ' + e.message, 'error'); }
  },

  async handlePdfUpload(id, input) {
    var file = input.files && input.files[0];
    if (!file || !this._validPdf(file)) { input.value = ''; return; }
    showToast('Subiendo factura...', 'info', 8000);
    try {
      var old = (this.getById(id) || {}).salesInvoice;
      var pdf = await this._uploadPdf(id, file);
      await DB.updateInstalacion(id, { salesInvoice: pdf, updatedAt: new Date().toISOString() });
      if (old && old.path) DB.deleteFile(old.path);
      showToast('Factura adjuntada', 'success');
      this.showDetail(id, true);
    } catch (e) { showToast('Error al subir la factura: ' + e.message, 'error'); }
  },

  async deletePdf(id) {
    if (!confirm('¿Quitar la factura adjunta?')) return;
    try {
      var old = (this.getById(id) || {}).salesInvoice;
      await DB.updateInstalacion(id, { salesInvoice: null, updatedAt: new Date().toISOString() });
      if (old && old.path) DB.deleteFile(old.path);
      showToast('Factura quitada', 'info');
      this.showDetail(id, true);
    } catch (e) { showToast('Error: ' + e.message, 'error'); }
  },

  async remove(id) {
    if (!this._isAdmin()) { showToast('⛔ Solo el administrador puede eliminar instalaciones', 'error'); return; }
    if (!confirm('¿Eliminar esta instalación? Esta acción no se puede deshacer.')) return;
    try {
      var inst = this.getById(id);
      if (inst && inst.salesInvoice && inst.salesInvoice.path) { try { await DB.deleteFile(inst.salesInvoice.path); } catch (e) {} }
      await DB.deleteInstalacion(id);
      showToast('Instalación eliminada', 'info');
      this.currentId = null;
      this.open();
    } catch (e) { showToast('Error al eliminar: ' + e.message, 'error'); }
  },
};
