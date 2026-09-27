/* ===================================================
   avisos.js - Modulo de Avisos / Partes de Trabajo
   =================================================== */

const AvisosManager = {
  currentAvisoId: null,

  STATUSES: {
    pending_visit:  { label: 'Pendiente 1a visita',     color: '#ef4444', bg: 'rgba(239,68,68,0.15)',   icon: '??' },
    pending_parts:  { label: 'Pendiente de repuestos',  color: '#f59e0b', bg: 'rgba(245,158,11,0.15)',  icon: '??' },
    parts_received: { label: 'Repuestos recepcionados', color: '#f97316', bg: 'rgba(249,115,22,0.15)',  icon: '??' },
    pending_repair: { label: 'Pendiente de reparar',    color: '#3b82f6', bg: 'rgba(59,130,246,0.15)', icon: '??' },
    invoiced:       { label: 'Facturado',               color: '#22c55e', bg: 'rgba(34,197,94,0.15)',  icon: '??' },
    paid:           { label: 'Pagado',                  color: '#8b5cf6', bg: 'rgba(139,92,246,0.15)', icon: '?' },
  },

  APPLIANCE_TYPES: ['Lavadora','Secadora','Lava-secadora','Lavavajillas',
    'Frigorifico','Congelador','Combi','Horno','Microondas',
    'Vitroceramica','Induccion','Campana','Aire acondicionado','Otro'],

  INSURERS: ['GRANDFASER','HIPERSERVICE','Otra'],

  getAll()    { return DB.getAvisos(); },
  getById(id) { return DB.getAvisoById(id); },

  _esc(str) {
    if (!str) return '';
    return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  },
  _formatDate(isoStr) {
    if (!isoStr) return 'Sin fecha';
    return new Date(isoStr).toLocaleDateString('es-ES',{day:'2-digit',month:'2-digit',year:'numeric'});
  },

  renderList(containerId, avisos, isAdmin) {
    var container = document.getElementById(containerId);
    if (!container) return;
    container.innerHTML = '';
    if (!avisos || avisos.length === 0) {
      container.innerHTML = '<div class="empty-state"><div class="empty-icon">??</div><div class="empty-text">No hay avisos. Crea el primero cuando llegue una llamada.</div></div>';
      return;
    }
    var self = this;
    avisos.forEach(function(av) {
      var st = self.STATUSES[av.status] || self.STATUSES.pending_visit;
      var date = (av.appointment && av.appointment.date)
        ? new Date(av.appointment.date + 'T12:00:00').toLocaleDateString('es-ES',{day:'2-digit',month:'2-digit',year:'numeric'})
        : 'Sin cita';
      var time = (av.appointment && av.appointment.time) ? ' ' + av.appointment.time : '';
      var insurer = (av.origin && av.origin.type === 'seguradora')
        ? '<span class="aviso-insurer-badge">' + self._esc(av.origin.insurer === 'Otra' ? av.origin.insurerName : av.origin.insurer) + '</span>' : '';
      var pCount = (av.photos || []).length;
      var el = document.createElement('div');
      el.className = 'aviso-item glass';
      el.dataset.avisoId = av.id;
      el.innerHTML =
        '<div class="aviso-item-top">' +
          '<span class="aviso-status-badge" style="background:'+st.bg+';color:'+st.color+';">'+st.icon+' '+st.label+'</span>' +
          insurer +
        '</div>' +
        '<div class="aviso-item-body">' +
          '<div class="aviso-client-name">' + self._esc((av.client&&av.client.name)||'Sin nombre') + '</div>' +
          '<div class="aviso-appliance">' + self._esc(((av.appliance&&av.appliance.type)||'')+' '+((av.appliance&&av.appliance.brand)||'')+' '+((av.appliance&&av.appliance.model)||'')) + '</div>' +
          '<div class="aviso-desc">' + self._esc((av.description||'').substring(0,80)) + ((av.description||'').length>80?'...':'') + '</div>' +
        '</div>' +
        '<div class="aviso-item-footer">' +
          '<span>?? ' + date + time + '</span>' +
          (isAdmin ? '<span>?? ' + self._esc(av.techName||'Sin asignar') + '</span>' : '') +
          (pCount>0 ? '<span>?? '+pCount+' foto'+(pCount>1?'s':'')+'</span>' : '') +
          (av.workOrder ? '<span>?? Parte</span>' : '') +
        '</div>';
      el.addEventListener('click', function() { self.showDetail(av.id); });
      container.appendChild(el);
    });
  },

  filterAndRender(containerId, isAdmin) {
    var q = ((document.getElementById('search-avisos')||{}).value||'').toLowerCase();
    var st = ((document.getElementById('filter-aviso-status')||{}).value)||'';
    var tf = ((document.getElementById('filter-aviso-tech')||{}).value)||'';
    var session = DB.getSession();
    var avisos = this.getAll();
    if (!isAdmin) avisos = avisos.filter(function(a){ return a.techId===(session&&session.id); });
    if (st) avisos = avisos.filter(function(a){ return a.status===st; });
    if (tf) avisos = avisos.filter(function(a){ return a.techId===tf; });
    if (q)  avisos = avisos.filter(function(a){
      return ((a.client&&a.client.name&&a.client.name.toLowerCase().includes(q))||
              (a.client&&a.client.phone&&a.client.phone.includes(q))||
              (a.appliance&&a.appliance.brand&&a.appliance.brand.toLowerCase().includes(q))||
              (a.appliance&&a.appliance.type&&a.appliance.type.toLowerCase().includes(q))||
              (a.origin&&a.origin.insurerRef&&a.origin.insurerRef.toLowerCase().includes(q)));
    });
    this.renderList(containerId, avisos, isAdmin);
  },

  showDetail(id) {
    var av = this.getById(id);
    if (!av) return;
    this.currentAvisoId = id;
    var session = DB.getSession();
    var isAdmin = session && session.role==='admin';
    var st = this.STATUSES[av.status] || this.STATUSES.pending_visit;
    var self = this;

    var photosHTML = (av.photos||[]).map(function(p,i){
      return '<div class="photo-thumb-wrap">' +
        '<img src="'+p.url+'" class="photo-thumb" onclick="AvisosManager.openPhotoFull(\''+p.url+'\')" alt="Foto '+(i+1)+'" />' +
        ((isAdmin||av.techId===(session&&session.id)) ? '<button class="photo-delete-btn" onclick="AvisosManager.deletePhoto(\''+id+'\',\''+p.path+'\')" title="Eliminar">x</button>' : '') +
      '</div>';
    }).join('');

    var insurerHTML = (av.origin&&av.origin.type==='seguradora')
      ? '<div class="detail-section"><div class="detail-section-title">?? Compania de Seguros</div>' +
        '<div class="detail-row"><span class="detail-label">Compania</span><span>'+self._esc(av.origin.insurer==='Otra'?av.origin.insurerName:av.origin.insurer)+'</span></div>' +
        '<div class="detail-row"><span class="detail-label">N Siniestro</span><span><strong>'+self._esc(av.origin.insurerRef||'Sin numero')+'</strong></span></div></div>'
      : '';

    var techHTML = '';
    if (isAdmin) {
      var users = DB.getUsers();
      var opts = users.map(function(u){ return '<option value="'+u.id+'" '+(u.id===av.techId?'selected':'')+'>'+u.name+'</option>'; }).join('');
      techHTML = '<div class="detail-section"><div class="detail-section-title">?? Asignacion</div>' +
        '<div class="field-group"><label>Tecnico responsable</label>' +
        '<select id="aviso-tech-select" onchange="AvisosManager.reassign(\''+id+'\', this.value)">'+opts+'</select></div></div>';
    } else {
      techHTML = '<div class="detail-section"><div class="detail-row"><span class="detail-label">Tecnico</span><span>'+self._esc(av.techName||'Sin asignar')+'</span></div></div>';
    }

    var statusBtns = Object.entries(this.STATUSES).map(function(e){
      var k=e[0],s=e[1];
      return '<button class="status-select-btn '+(av.status===k?'active':'')+'" style="border-color:'+s.color+';'+(av.status===k?'background:'+s.bg+';color:'+s.color+';':'')+'" onclick="AvisosManager.changeStatus(\''+id+'\',\''+k+'\')">'+s.icon+' '+s.label+'</button>';
    }).join('');

    var woHTML = '<div class="detail-section"><div class="detail-section-title">?? Parte de trabajo firmado</div>';
    if (av.workOrder) {
      woHTML += '<div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:10px;">' +
        '<a href="'+av.workOrder.url+'" target="_blank" class="btn btn-outline btn-sm">?? Ver parte</a>' +
        '<button class="btn btn-outline btn-sm" style="color:#ef4444" onclick="AvisosManager.deleteWorkOrder(\''+id+'\')">Eliminar</button></div>';
    } else {
      woHTML += '<p style="color:#888;font-size:13px;margin-bottom:10px;">No adjuntado todavia.</p>';
    }
    woHTML += '<label style="cursor:pointer"><input type="file" id="workorder-upload" accept="image/*,application/pdf" style="display:none" onchange="AvisosManager.handleWorkOrderUpload(\''+id+'\', this)">' +
      '<span class="btn btn-outline btn-sm">?? '+(av.workOrder?'Reemplazar':'Subir')+' parte</span></label></div>';

    var invHTML = av.invoiceId
      ? '<div class="detail-section"><div class="detail-row"><span class="detail-label">Factura</span><span>? '+self._esc(av.invoiceNumber||av.invoiceId)+'</span></div></div>'
      : '';

    var cont = document.getElementById('aviso-detail-content');
    if (!cont) return;
    cont.innerHTML =
      '<div class="aviso-detail-header" style="background:'+st.bg+';border-left:4px solid '+st.color+';padding:16px;border-radius:12px;margin-bottom:16px;">' +
        '<div style="font-size:1.1rem;font-weight:700;color:'+st.color+'">'+st.icon+' '+st.label+'</div>' +
        '<div style="font-size:0.85rem;color:#aaa;margin-top:4px">Aviso creado '+self._formatDate(av.createdAt)+'</div>' +
      '</div>' +
      '<div class="detail-section"><div class="detail-section-title">?? Estado</div>' +
        '<div style="display:flex;flex-wrap:wrap;gap:8px;">'+statusBtns+'</div></div>' +
      '<div class="detail-section"><div class="detail-section-title">?? Cliente</div>' +
        '<div class="detail-row"><span class="detail-label">Nombre</span><span><strong>'+self._esc((av.client&&av.client.name)||'Sin nombre')+'</strong></span></div>' +
        '<div class="detail-row"><span class="detail-label">Telefono</span><span><a href="tel:'+((av.client&&av.client.phone)||'')+'" style="color:#4f7cff;">'+self._esc((av.client&&av.client.phone)||'Sin telefono')+'</a></span></div>' +
        ((av.client&&av.client.phone2) ? '<div class="detail-row"><span class="detail-label">Telefono 2</span><span><a href="tel:'+av.client.phone2+'" style="color:#4f7cff;">'+self._esc(av.client.phone2)+'</a></span></div>' : '') +
        '<div class="detail-row"><span class="detail-label">Direccion</span><span>'+self._esc((av.client&&av.client.address)||'Sin direccion')+'</span></div>' +
        '<div class="detail-row"><span class="detail-label">Poblacion</span><span>'+self._esc((av.client&&av.client.city)||'Sin poblacion')+'</span></div>' +
      '</div>' +
      '<div class="detail-section"><div class="detail-section-title">?? Electrodomestico</div>' +
        '<div class="detail-row"><span class="detail-label">Tipo</span><span>'+self._esc((av.appliance&&av.appliance.type)||'Sin especificar')+'</span></div>' +
        '<div class="detail-row"><span class="detail-label">Marca</span><span>'+self._esc((av.appliance&&av.appliance.brand)||'Sin especificar')+'</span></div>' +
        '<div class="detail-row"><span class="detail-label">Modelo</span><span>'+self._esc((av.appliance&&av.appliance.model)||'Sin especificar')+'</span></div>' +
        '<div class="detail-row"><span class="detail-label">N Serie</span><span>'+self._esc((av.appliance&&av.appliance.serialNumber)||'Sin especificar')+'</span></div>' +
        '<div class="detail-row"><span class="detail-label">Averia</span><p style="margin:4px 0 0;color:#e0e0e0;">'+self._esc(av.description||'Sin descripcion')+'</p></div>' +
      '</div>' +
      '<div class="detail-section"><div class="detail-section-title">?? Cita</div>' +
        '<div class="detail-row"><span class="detail-label">Fecha</span><span>'+(
          (av.appointment&&av.appointment.date)
            ? new Date(av.appointment.date+'T12:00:00').toLocaleDateString('es-ES',{weekday:'long',day:'2-digit',month:'long'})
            : 'Sin fecha'
        )+'</span></div>' +
        '<div class="detail-row"><span class="detail-label">Hora</span><span>'+self._esc((av.appointment&&av.appointment.time)||'Sin hora')+'</span></div>' +
      '</div>' +
      insurerHTML + techHTML +
      '<div class="detail-section">' +
        '<div class="detail-section-title" style="display:flex;justify-content:space-between;align-items:center;">?? Fotos' +
          '<label style="cursor:pointer"><input type="file" id="photos-upload" accept="image/*" multiple style="display:none" onchange="AvisosManager.handlePhotosUpload(\''+id+'\', this)">' +
          '<span class="btn btn-outline btn-sm">?? A�adir fotos</span></label></div>' +
        '<div id="photos-gallery" class="photos-gallery">'+(photosHTML||'<p style="color:#888;font-size:13px;">Sin fotos todavia.</p>')+'</div>' +
      '</div>' +
      woHTML +
      '<div class="detail-section"><div class="detail-section-title">?? Notas internas</div>' +
        '<textarea id="aviso-notes-edit" rows="3" style="width:100%;box-sizing:border-box;background:rgba(255,255,255,0.05);color:#e0e0e0;border:1px solid rgba(255,255,255,0.1);border-radius:8px;padding:10px;font-size:14px;">'+self._esc(av.notes||'')+'</textarea>' +
        '<button class="btn btn-outline btn-sm" style="margin-top:8px" onclick="AvisosManager.saveNotes(\''+id+'\')">Guardar notas</button></div>' +
      invHTML +
      '<div class="detail-actions">' +
        '<button class="btn btn-outline" onclick="AvisosManager.openForm(\''+id+'\')">?? Editar aviso</button>' +
        (!av.invoiceId
          ? '<button class="btn btn-primary" onclick="AvisosManager.convertToInvoice(\''+id+'\')">?? Convertir en Factura</button>'
          : '<button class="btn btn-outline" disabled>? Factura generada</button>') +
        (isAdmin ? '<button class="btn btn-outline" style="color:#ef4444" onclick="AvisosManager.deleteAviso(\''+id+'\')">??? Eliminar aviso</button>' : '') +
      '</div>';

    App.showView('aviso-detail', (av.client&&av.client.name)||'Detalle');
  },

  openForm(avisoId) {
    avisoId = avisoId || null;
    var av = avisoId ? this.getById(avisoId) : null;
    var session = DB.getSession();
    var isAdmin = session && session.role === 'admin';
    var users = DB.getUsers();
    var self = this;

    var appOpts = '<option value="">Seleccionar tipo</option>' + this.APPLIANCE_TYPES.map(function(a){
      return '<option '+(av&&av.appliance&&av.appliance.type===a?'selected':'')+'>'+a+'</option>';
    }).join('');

    var techOpts = users.map(function(u){
      var sel = (av&&av.techId)||(session&&session.id);
      return '<option value="'+u.id+'|'+u.name+'" '+(sel===u.id?'selected':'')+'>'+u.name+'</option>';
    }).join('');

    var insOpts = this.INSURERS.map(function(i){
      return '<option value="'+i+'" '+(av&&av.origin&&av.origin.insurer===i?'selected':'')+'>'+i+'</option>';
    }).join('');

    var stOpts = Object.entries(this.STATUSES).map(function(e){
      return '<option value="'+e[0]+'" '+(av&&av.status===e[0]?'selected':'')+'>'+e[1].icon+' '+e[1].label+'</option>';
    }).join('');

    var h = '<div class="modal-card glass" style="max-width:500px;width:90vw;max-height:90vh;overflow-y:auto;padding:24px;">' +
      '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;">' +
        '<h3 style="margin:0;">'+(av?'?? Editar Aviso':'?? Nuevo Aviso')+'</h3>' +
        '<button class="btn-close" onclick="document.getElementById(\'modal-aviso-form\').classList.add(\'hidden\')">?</button>' +
      '</div>' +
      '<form id="form-aviso" onsubmit="return false;">' +
      '<div style="font-weight:600;color:#4f7cff;margin-bottom:12px;">?? Datos del Cliente</div>' +
      '<div class="field-group"><label>Nombre <span class="required">*</span></label><input type="text" id="av-client-name" placeholder="Juan Garcia Lopez" value="'+self._esc((av&&av.client&&av.client.name)||'')+'" /></div>' +
      '<div class="field-row">' +
        '<div class="field-group"><label>Telefono <span class="required">*</span></label><input type="tel" id="av-client-phone" placeholder="666 123 456" value="'+self._esc((av&&av.client&&av.client.phone)||'')+'" /></div>' +
        '<div class="field-group"><label>Telefono 2</label><input type="tel" id="av-client-phone2" placeholder="976 000 000" value="'+self._esc((av&&av.client&&av.client.phone2)||'')+'" /></div>' +
      '</div>' +
      '<div class="field-group"><label>Direccion</label><input type="text" id="av-client-address" placeholder="Calle Mayor, 5" value="'+self._esc((av&&av.client&&av.client.address)||'')+'" /></div>' +
      '<div class="field-group"><label>Poblacion</label><input type="text" id="av-client-city" placeholder="Calatayud" value="'+self._esc((av&&av.client&&av.client.city)||'')+'" /></div>' +
      '<div style="font-weight:600;color:#4f7cff;margin:16px 0 12px;">?? Electrodomestico</div>' +
      '<div class="field-row">' +
        '<div class="field-group"><label>Tipo <span class="required">*</span></label><select id="av-appliance-type">'+appOpts+'</select></div>' +
        '<div class="field-group"><label>Marca</label><input type="text" id="av-appliance-brand" placeholder="Bosch..." value="'+self._esc((av&&av.appliance&&av.appliance.brand)||'')+'" /></div>' +
      '</div>' +
      '<div class="field-row">' +
        '<div class="field-group"><label>Modelo</label><input type="text" id="av-appliance-model" placeholder="WAN28201ES" value="'+self._esc((av&&av.appliance&&av.appliance.model)||'')+'" /></div>' +
        '<div class="field-group"><label>N Serie</label><input type="text" id="av-appliance-serial" placeholder="WB1234567" value="'+self._esc((av&&av.appliance&&av.appliance.serialNumber)||'')+'" /></div>' +
      '</div>' +
      '<div class="field-group"><label>Averia <span class="required">*</span></label><textarea id="av-description" rows="3" placeholder="No centrifuga, hace ruido...">'+self._esc((av&&av.description)||'')+'</textarea></div>' +
      '<div style="font-weight:600;color:#4f7cff;margin:16px 0 12px;">?? Cita</div>' +
      '<div class="field-row">' +
        '<div class="field-group"><label>Fecha</label><input type="date" id="av-apt-date" value="'+((av&&av.appointment&&av.appointment.date)||'')+'" /></div>' +
        '<div class="field-group"><label>Hora</label><input type="time" id="av-apt-time" value="'+((av&&av.appointment&&av.appointment.time)||'')+'" /></div>' +
      '</div>' +
      '<div style="font-weight:600;color:#4f7cff;margin:16px 0 12px;">?? Origen</div>' +
      '<div class="field-group"><label>Tipo</label>' +
        '<select id="av-origin-type" onchange="AvisosManager._toggleInsurer()">' +
          '<option value="particular" '+((av&&av.origin&&av.origin.type==='seguradora')?'':'selected')+'>Particular</option>' +
          '<option value="seguradora" '+((av&&av.origin&&av.origin.type==='seguradora')?'selected':'')+'>Compania de Seguros</option>' +
        '</select></div>' +
      '<div id="av-insurer-block" style="display:'+((av&&av.origin&&av.origin.type==='seguradora')?'block':'none')+'">' +
        '<div class="field-row">' +
          '<div class="field-group"><label>Compania</label><select id="av-insurer" onchange="AvisosManager._toggleCustomInsurer()">'+insOpts+'</select></div>' +
          '<div class="field-group"><label>N Siniestro</label><input type="text" id="av-insurer-ref" placeholder="SIN-2024-12345" value="'+self._esc((av&&av.origin&&av.origin.insurerRef)||'')+'" /></div>' +
        '</div>' +
        '<div class="field-group" id="av-custom-insurer-block" style="display:'+((av&&av.origin&&av.origin.insurer==='Otra')?'block':'none')+'">' +
          '<label>Nombre compania</label><input type="text" id="av-insurer-name" value="'+self._esc((av&&av.origin&&av.origin.insurerName)||'')+'" /></div>' +
      '</div>' +
      (isAdmin ? '<div style="font-weight:600;color:#4f7cff;margin:16px 0 12px;">?? Asignacion</div>' +
        '<div class="field-group"><label>Tecnico</label><select id="av-tech">'+techOpts+'</select></div>' : '') +
      (av ? '<div style="font-weight:600;color:#4f7cff;margin:16px 0 12px;">?? Estado</div>' +
        '<div class="field-group"><select id="av-status">'+stOpts+'</select></div>' : '') +
      '<input type="hidden" id="av-edit-id" value="'+(avisoId||'')+'" />' +
      '<div style="display:flex;gap:12px;margin-top:20px;">' +
        '<button type="button" class="btn btn-outline" style="flex:1" onclick="document.getElementById(\'modal-aviso-form\').classList.add(\'hidden\')">Cancelar</button>' +
        '<button type="button" class="btn btn-primary" style="flex:2" onclick="AvisosManager.saveForm()" id="btn-save-aviso">'+(av?'Guardar cambios':'Crear Aviso')+'</button>' +
      '</div></form></div>';

    var modal = document.getElementById('modal-aviso-form');
    modal.innerHTML = '<div class="modal-overlay" onclick="document.getElementById(\'modal-aviso-form\').classList.add(\'hidden\')"></div>' + h;
    modal.classList.remove('hidden');
  },

  _toggleInsurer() {
    var t = ((document.getElementById('av-origin-type')||{}).value)||'';
    var b = document.getElementById('av-insurer-block');
    if (b) b.style.display = t==='seguradora'?'block':'none';
  },
  _toggleCustomInsurer() {
    var v = ((document.getElementById('av-insurer')||{}).value)||'';
    var b = document.getElementById('av-custom-insurer-block');
    if (b) b.style.display = v==='Otra'?'block':'none';
  },

  async saveForm() {
    var btn = document.getElementById('btn-save-aviso');
    var editId = ((document.getElementById('av-edit-id')||{}).value)||'';
    var session = DB.getSession();
    var isAdmin = session && session.role==='admin';
    var name  = (document.getElementById('av-client-name')||{value:''}).value.trim();
    var phone = (document.getElementById('av-client-phone')||{value:''}).value.trim();
    var appt  = (document.getElementById('av-appliance-type')||{value:''}).value;
    var desc  = (document.getElementById('av-description')||{value:''}).value.trim();
    if (!name||!phone||!appt||!desc) { showToast('Completa los campos obligatorios (*)','error'); return; }
    btn.disabled=true; btn.textContent='Guardando...';
    var ot  = (document.getElementById('av-origin-type')||{value:'particular'}).value;
    var ins = (document.getElementById('av-insurer')||{value:''}).value;
    var ref = (document.getElementById('av-insurer-ref')||{value:''}).value.trim();
    var inm = (document.getElementById('av-insurer-name')||{value:''}).value.trim();
    var tid, tn;
    if (isAdmin && document.getElementById('av-tech')) {
      var pts = document.getElementById('av-tech').value.split('|');
      tid=pts[0]; tn=pts[1];
    } else { tid=session.id; tn=session.name; }
    var data = {
      techId:tid, techName:tn,
      client:{ name:name, phone:phone,
        phone2:(document.getElementById('av-client-phone2')||{value:''}).value.trim(),
        address:(document.getElementById('av-client-address')||{value:''}).value.trim(),
        city:(document.getElementById('av-client-city')||{value:''}).value.trim() },
      appliance:{ type:appt,
        brand:(document.getElementById('av-appliance-brand')||{value:''}).value.trim(),
        model:(document.getElementById('av-appliance-model')||{value:''}).value.trim(),
        serialNumber:(document.getElementById('av-appliance-serial')||{value:''}).value.trim() },
      description:desc,
      appointment:{ date:(document.getElementById('av-apt-date')||{value:''}).value, time:(document.getElementById('av-apt-time')||{value:''}).value },
      origin:{ type:ot, insurer:ot==='seguradora'?ins:null, insurerName:ot==='seguradora'&&ins==='Otra'?inm:'', insurerRef:ot==='seguradora'?ref:'' },
      updatedAt:new Date().toISOString()
    };
    if (editId && document.getElementById('av-status')) data.status = document.getElementById('av-status').value;
    try {
      if (editId) {
        await DB.updateAviso(editId, data);
        showToast('Aviso actualizado','success');
      } else {
        data.status='pending_visit'; data.createdAt=new Date().toISOString();
        data.photos=[]; data.workOrder=null; data.invoiceId=null; data.notes='';
        await DB.addAviso(data);
        showToast('Aviso creado','success');
      }
      document.getElementById('modal-aviso-form').classList.add('hidden');
      if (App.currentView==='aviso-detail'&&editId) this.showDetail(editId);
      if (App.currentView==='avisos') this.filterAndRender('avisos-list', session&&session.role==='admin');
    } catch(e) { showToast('Error: '+e.message,'error'); }
    finally { btn.disabled=false; btn.textContent=editId?'Guardar cambios':'Crear Aviso'; }
  },

  async changeStatus(id, s) {
    try { await DB.updateAviso(id,{status:s,updatedAt:new Date().toISOString()}); showToast('Estado: '+this.STATUSES[s].label,'success'); this.showDetail(id); }
    catch(e) { showToast('Error al cambiar estado','error'); }
  },

  async reassign(id, newTechId) {
    var u = DB.getUsers().find(function(u){ return u.id===newTechId; });
    if (!u) return;
    try { await DB.updateAviso(id,{techId:newTechId,techName:u.name,updatedAt:new Date().toISOString()}); showToast('Reasignado a '+u.name,'success'); }
    catch(e) { showToast('Error al reasignar','error'); }
  },

  async handlePhotosUpload(id, input) {
    if (!input.files||input.files.length===0) return;
    var files = Array.from(input.files);
    showToast('Subiendo '+files.length+' foto(s)...','info',8000);
    try {
      var uploaded = [];
      for (var i=0;i<files.length;i++) {
        var f=files[i]; var path='avisos/'+id+'/photos/'+Date.now()+'_'+f.name;
        var url=await DB.uploadFile(path,f);
        uploaded.push({url:url,path:path,name:f.name,uploadedAt:new Date().toISOString()});
      }
      var av=this.getById(id);
      await DB.updateAviso(id,{photos:((av&&av.photos)||[]).concat(uploaded),updatedAt:new Date().toISOString()});
      showToast(files.length+' foto(s) subidas','success'); this.showDetail(id);
    } catch(e) { showToast('Error al subir fotos: '+e.message,'error'); }
  },

  async deletePhoto(id, path) {
    if (!confirm('Eliminar esta foto?')) return;
    try {
      await DB.deleteFile(path);
      var av=this.getById(id);
      var np=((av&&av.photos)||[]).filter(function(p){return p.path!==path;});
      await DB.updateAviso(id,{photos:np,updatedAt:new Date().toISOString()});
      showToast('Foto eliminada','info'); this.showDetail(id);
    } catch(e) { showToast('Error al eliminar foto','error'); }
  },

  async handleWorkOrderUpload(id, input) {
    if (!input.files||input.files.length===0) return;
    var f=input.files[0]; showToast('Subiendo parte firmado...','info',8000);
    try {
      var path='avisos/'+id+'/workorder/'+Date.now()+'_'+f.name;
      var url=await DB.uploadFile(path,f);
      await DB.updateAviso(id,{workOrder:{url:url,path:path,name:f.name,uploadedAt:new Date().toISOString()},updatedAt:new Date().toISOString()});
      showToast('Parte subido','success'); this.showDetail(id);
    } catch(e) { showToast('Error al subir parte: '+e.message,'error'); }
  },

  async deleteWorkOrder(id) {
    if (!confirm('Eliminar el parte firmado?')) return;
    try {
      var av=this.getById(id);
      if (av&&av.workOrder&&av.workOrder.path) await DB.deleteFile(av.workOrder.path);
      await DB.updateAviso(id,{workOrder:null,updatedAt:new Date().toISOString()});
      showToast('Parte eliminado','info'); this.showDetail(id);
    } catch(e) { showToast('Error al eliminar','error'); }
  },

  openPhotoFull(url) {
    var o=document.createElement('div');
    o.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,0.95);display:flex;align-items:center;justify-content:center;z-index:9999;';
    o.onclick=function(){o.remove();};
    var img=document.createElement('img');
    img.src=url; img.style.cssText='max-width:95vw;max-height:95vh;object-fit:contain;border-radius:8px;';
    o.appendChild(img); document.body.appendChild(o);
  },

  async saveNotes(id) {
    var n=(document.getElementById('aviso-notes-edit')||{value:''}).value;
    try { await DB.updateAviso(id,{notes:n,updatedAt:new Date().toISOString()}); showToast('Notas guardadas','success'); }
    catch(e) { showToast('Error','error'); }
  },

  convertToInvoice(id) {
    var av=this.getById(id);
    if (!av) return;
    App.showView('new-invoice','Nueva Factura');
    InvoiceManager.initForm();
    setTimeout(function(){
      if(document.getElementById('cli-name')) document.getElementById('cli-name').value=(av.client&&av.client.name)||'';
      if(document.getElementById('cli-phone')) document.getElementById('cli-phone').value=(av.client&&av.client.phone)||'';
      if(document.getElementById('cli-address')) document.getElementById('cli-address').value=(av.client&&av.client.address)||'';
      if(document.getElementById('cli-city')) document.getElementById('cli-city').value=(av.client&&av.client.city)||'';
      var desc=((av.appliance&&av.appliance.type)||'')+' '+((av.appliance&&av.appliance.brand)||'')+' '+((av.appliance&&av.appliance.model)||'')+' - '+(av.description||'');
      InvoiceManager.addLine('labor');
      setTimeout(function(){
        var lds=document.querySelectorAll('[data-field="description"]');
        if(lds.length>0) lds[lds.length-1].value=desc.trim();
        document.getElementById('btn-save-invoice').dataset.avisoId=id;
        showToast('Datos del aviso cargados','success',4000);
      },100);
    },200);
  },

  async deleteAviso(id) {
    if (!confirm('Eliminar aviso? Esta accion es irreversible.')) return;
    try {
      var av=this.getById(id);
      for(var i=0;i<((av&&av.photos)||[]).length;i++){try{await DB.deleteFile(av.photos[i].path);}catch(e){}}
      if(av&&av.workOrder&&av.workOrder.path){try{await DB.deleteFile(av.workOrder.path);}catch(e){}}
      await DB.deleteAviso(id);
      showToast('Aviso eliminado','info'); App.goBack();
    } catch(e) { showToast('Error al eliminar','error'); }
  },

  renderStats(containerId) {
    var c=document.getElementById(containerId); if(!c) return;
    var counts={}; var self=this;
    Object.keys(this.STATUSES).forEach(function(k){counts[k]=0;});
    this.getAll().forEach(function(a){if(counts[a.status]!==undefined)counts[a.status]++;});
    c.innerHTML=Object.entries(this.STATUSES).map(function(e){
      var k=e[0],s=e[1];
      return '<div class="aviso-stat-chip" style="background:'+s.bg+';border:1px solid '+s.color+'30;border-radius:8px;padding:8px 12px;display:flex;align-items:center;gap:8px;">' +
        '<span>'+s.icon+'</span><span style="font-size:1.4rem;font-weight:700;color:'+s.color+';">'+counts[k]+'</span>' +
        '<span style="font-size:0.75rem;color:#aaa;">'+s.label+'</span></div>';
    }).join('');
  },
};
