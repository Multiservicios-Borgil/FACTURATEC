/* ===================================================
   invoices.js – Lógica de facturas
   Gestión de líneas, cálculos y operaciones CRUD
   =================================================== */

const InvoiceManager = {

  // Estado del formulario actual
  currentLines: [],
  currentIVA: 21,
  currentPayment: 'Efectivo',
  editingId: null,

  // ---------- INICIALIZAR FORMULARIO ----------
  initForm() {
    this.currentLines = [];
    this.currentIVA = 21;
    this.currentPayment = 'Efectivo';
    this.editingId = null;
    this.renderLines();
    this.updateTotals();

    // Fecha de hoy
    const today = new Date().toISOString().slice(0, 10);
    document.getElementById('inv-date').value = today;

    // Técnico logueado
    const session = DB.getSession();
    document.getElementById('inv-tech').value = session ? session.name : '';

    // Número de factura (preview)
    const series = document.getElementById('inv-series').value || 'A';
    Promise.resolve(DB.peekNextInvoiceNumber(series)).then(num => {
      document.getElementById('invoice-number-display').textContent =
        `${series}${new Date().getFullYear()}-${String(num).padStart(4, '0')}`;
    });

    // Limpiar campos cliente
    ['cli-nif','cli-name','cli-address','cli-cp','cli-city','cli-phone'].forEach(id => {
      document.getElementById(id).value = '';
    });
    document.getElementById('inv-notes').value = '';

    // Reset IVA buttons
    document.querySelectorAll('.iva-btn').forEach(b => {
      b.classList.toggle('active', Number(b.dataset.iva) === 21);
    });
    // Reset payment buttons
    document.querySelectorAll('.payment-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.payment === 'Efectivo');
    });
  },

  // ---------- AÑADIR LÍNEA ----------
  addLine(type) {
    const line = {
      id: Date.now().toString(),
      type,          // 'labor' | 'part' | 'travel' | 'custom'
      description: '',
      quantity: 1,
      unitPrice: 0,
      subtotal: 0,
    };
    this.currentLines.push(line);
    this.renderLines();
    // Enfocar el primer input de la nueva línea
    setTimeout(() => {
      const lastLine = document.querySelector(`.line-item:last-child input[data-field="description"]`);
      if (lastLine) lastLine.focus();
    }, 50);
  },

  removeLine(id) {
    this.currentLines = this.currentLines.filter(l => l.id !== id);
    this.renderLines();
    this.updateTotals();
  },

  updateLine(id, field, value) {
    const line = this.currentLines.find(l => l.id === id);
    if (!line) return;
    line[field] = field === 'description' ? value : parseFloat(value) || 0;
    line.subtotal = parseFloat((line.quantity * line.unitPrice).toFixed(2));
    // Actualizar display del subtotal
    const el = document.querySelector(`[data-line-id="${id}"] .line-total-display`);
    if (el) el.textContent = this.formatCurrency(line.subtotal);
    this.updateTotals();
  },

  // ---------- RENDERIZAR LÍNEAS ----------
  renderLines() {
    const container = document.getElementById('line-items-container');
    if (!container) return;

    container.innerHTML = '';

    if (this.currentLines.length === 0) {
      container.innerHTML = `<div class="empty-state-mini" style="margin-bottom:8px">
        Añade conceptos usando los botones de abajo</div>`;
      return;
    }

    this.currentLines.forEach(line => {
      const typeLabels = { labor: 'Mano de obra', part: 'Repuesto / Pieza', travel: 'Desplazamiento', custom: 'Otro' };
      const typeClasses = { labor: 'type-labor', part: 'type-part', travel: 'type-travel', custom: 'type-custom' };
      const defaultDescs = {
        labor: 'Mano de obra',
        part: 'Repuesto / Pieza',
        travel: 'Desplazamiento km',
        custom: 'Concepto'
      };

      const el = document.createElement('div');
      el.className = 'line-item';
      el.dataset.lineId = line.id;
      el.innerHTML = `
        <div class="line-item-header">
          <span class="line-item-type ${typeClasses[line.type]}">${typeLabels[line.type]}</span>
          <button class="btn-remove-line" data-remove="${line.id}" aria-label="Eliminar línea">✕</button>
        </div>
        <div class="line-fields">
          <div class="field-group">
            <label>Descripción</label>
            <input type="text" data-field="description" data-line="${line.id}"
              placeholder="${defaultDescs[line.type]}"
              value="${this.escapeHtml(line.description)}" />
          </div>
          <div class="line-row">
            <div class="field-group">
              <label>${line.type === 'labor' ? 'Horas / Ud.' : 'Cantidad'}</label>
              <input type="number" data-field="quantity" data-line="${line.id}"
                min="0.5" step="0.5" value="${line.quantity}" />
            </div>
            <div class="field-group">
              <label>${line.type === 'labor' ? 'Precio/hora (€)' : 'Precio unitario (€)'}</label>
              <input type="number" data-field="unitPrice" data-line="${line.id}"
                min="0" step="0.01" value="${line.unitPrice || ''}" placeholder="0,00" />
            </div>
          </div>
          <div class="line-total-display">${this.formatCurrency(line.subtotal)}</div>
        </div>`;
      container.appendChild(el);
    });
  },

  // ---------- ACTUALIZAR TOTALES ----------
  updateTotals() {
    const base = this.currentLines.reduce((s, l) => s + (l.subtotal || 0), 0);
    const ivaAmount = parseFloat((base * this.currentIVA / 100).toFixed(2));
    const total = parseFloat((base + ivaAmount).toFixed(2));

    document.getElementById('total-base').textContent = this.formatCurrency(base);
    document.getElementById('total-iva').textContent = this.formatCurrency(ivaAmount);
    document.getElementById('total-final').textContent = this.formatCurrency(total);
    document.getElementById('iva-pct-display').textContent = this.currentIVA;
  },

  // ---------- GUARDAR FACTURA ----------
  buildInvoiceData() {
    const session = DB.getSession();
    const company = DB.getCompany();
    const series = document.getElementById('inv-series').value.toUpperCase().trim() || 'A';
    const date = document.getElementById('inv-date').value;
    const num = DB.getNextInvoiceNumber(series);
    const numberStr = `${series}${new Date().getFullYear()}-${String(num).padStart(4, '0')}`;

    const base = this.currentLines.reduce((s, l) => s + (l.subtotal || 0), 0);
    const ivaAmount = parseFloat((base * this.currentIVA / 100).toFixed(2));
    const total = parseFloat((base + ivaAmount).toFixed(2));

    return {
      id: this.editingId || Date.now().toString(),
      number: numberStr,
      series,
      num,
      date,
      createdAt: new Date().toISOString(),
      techId: session?.id,
      techName: session?.name || 'Técnico',
      company: { ...company },
      client: {
        nif: document.getElementById('cli-nif').value.trim(),
        name: document.getElementById('cli-name').value.trim(),
        address: document.getElementById('cli-address').value.trim(),
        cp: document.getElementById('cli-cp').value.trim(),
        city: document.getElementById('cli-city').value.trim(),
        phone: document.getElementById('cli-phone').value.trim(),
      },
      lines: this.currentLines.map(l => ({ ...l })),
      totals: {
        base: parseFloat(base.toFixed(2)),
        ivaPct: this.currentIVA,
        iva: ivaAmount,
        total,
      },
      paymentMethod: this.currentPayment,
      notes: document.getElementById('inv-notes').value.trim(),
    };
  },

  validate() {
    const nif = document.getElementById('cli-nif').value.trim();
    const name = document.getElementById('cli-name').value.trim();
    if (!nif) { showToast('El NIF/CIF del cliente es obligatorio', 'error'); return false; }
    if (!name) { showToast('El nombre del cliente es obligatorio', 'error'); return false; }
    if (this.currentLines.length === 0) { showToast('Añade al menos un concepto', 'error'); return false; }
    const hasPrice = this.currentLines.some(l => l.unitPrice > 0);
    if (!hasPrice) { showToast('Al menos un concepto debe tener precio', 'error'); return false; }
    return true;
  },

  // ---------- RENDER LISTA FACTURAS ----------
  renderInvoiceList(containerId, invoices, showTech = false) {
    const container = document.getElementById(containerId);
    if (!container) return;

    if (invoices.length === 0) {
      container.innerHTML = `<div class="empty-state">
        <div class="empty-icon">📄</div>
        <div class="empty-text">No hay facturas que mostrar</div>
      </div>`;
      return;
    }

    container.innerHTML = '';
    invoices.forEach(inv => {
      const el = document.createElement('div');
      el.className = 'invoice-item';
      el.dataset.invoiceId = inv.id;
      const dateFormatted = inv.date ? new Date(inv.date + 'T12:00:00').toLocaleDateString('es-ES') : '—';
      const session = DB.getSession();
      const canDelete = session?.role === 'admin';
      el.innerHTML = `
        <div class="invoice-item-left">
          <div class="inv-number">Nº ${inv.number}</div>
          <div class="inv-client">${this.escapeHtml(inv.client?.name || 'Sin nombre')}</div>
          <div class="inv-meta">
            <span title="Fecha">${dateFormatted}</span>
            ${showTech ? `<span title="Técnico">👷 ${this.escapeHtml(inv.techName || '')}</span>` : ''}
            <span class="inv-payment-badge">${inv.paymentMethod || '—'}</span>
          </div>
        </div>
        <div class="invoice-item-right">
          <div class="inv-total">${this.formatCurrency(inv.totals?.total || 0)}</div>
          <div class="inv-actions">
            <button class="inv-action-btn" data-action="view" data-id="${inv.id}" title="Ver/Imprimir">🖨️</button>
            ${canDelete ? `<button class="inv-action-btn delete" data-action="delete" data-id="${inv.id}" title="Eliminar">🗑️</button>` : ''}
          </div>
        </div>`;

      container.appendChild(el);
    });
  },

  renderRecentInvoices(techId) {
    const all = DB.getInvoices();
    const recent = all
      .filter(inv => !techId || inv.techId === techId)
      .slice(0, 5);
    const container = document.getElementById('recent-invoices-list');
    if (!container) return;

    if (recent.length === 0) {
      container.innerHTML = `<div class="empty-state-mini">No hay facturas aún. ¡Crea la primera!</div>`;
      return;
    }
    container.innerHTML = '';
    recent.forEach(inv => {
      const dateFormatted = inv.date ? new Date(inv.date + 'T12:00:00').toLocaleDateString('es-ES') : '—';
      const el = document.createElement('div');
      el.className = 'mini-invoice-item';
      el.dataset.invoiceId = inv.id;
      el.innerHTML = `
        <div class="mini-inv-info">
          <div class="mini-inv-num">Nº ${inv.number}</div>
          <div class="mini-inv-client">${this.escapeHtml(inv.client?.name || 'Sin nombre')}</div>
          <div class="mini-inv-date">${dateFormatted}</div>
        </div>
        <div class="mini-inv-total">${this.formatCurrency(inv.totals?.total || 0)}</div>`;
      container.appendChild(el);
    });
  },

  // ---------- ESTADÍSTICAS ----------
  updateDashboardStats(techId) {
    const all = DB.getInvoices();
    const session = DB.getSession();
    const isAdmin = session?.role === 'admin';

    const filtered = isAdmin ? all : all.filter(inv => inv.techId === techId);
    const today = new Date().toISOString().slice(0, 10);
    const thisMonth = new Date().toISOString().slice(0, 7);

    const todayTotal = filtered
      .filter(inv => inv.date === today)
      .reduce((s, inv) => s + (inv.totals?.total || 0), 0);
    const monthTotal = filtered
      .filter(inv => inv.date?.startsWith(thisMonth))
      .reduce((s, inv) => s + (inv.totals?.total || 0), 0);
    const monthCount = filtered.filter(inv => inv.date?.startsWith(thisMonth)).length;

    document.getElementById('stat-today').textContent = this.formatCurrency(todayTotal);
    document.getElementById('stat-month').textContent = this.formatCurrency(monthTotal);
    document.getElementById('stat-count').textContent = monthCount;

    // Admin stats
    document.getElementById('admin-total-invoices').textContent = all.length;
    document.getElementById('admin-total-amount').textContent = this.formatCurrency(
      all.reduce((s, inv) => s + (inv.totals?.total || 0), 0)
    );
    const uniqueTechs = new Set(all.map(inv => inv.techId)).size;
    document.getElementById('admin-total-techs').textContent = uniqueTechs;

    // By tech breakdown
    this.renderByTechBreakdown();
  },

  renderByTechBreakdown() {
    const container = document.getElementById('admin-by-tech');
    if (!container) return;
    const thisMonth = new Date().toISOString().slice(0, 7);
    const allThisMonth = DB.getInvoices().filter(inv => inv.date?.startsWith(thisMonth));

    // Agrupar por Técnico
    const byTech = {};
    allThisMonth.forEach(inv => {
      if (!byTech[inv.techName]) byTech[inv.techName] = { count: 0, total: 0 };
      byTech[inv.techName].count++;
      byTech[inv.techName].total += inv.totals?.total || 0;
    });

    const entries = Object.entries(byTech).sort((a, b) => b[1].total - a[1].total);
    if (entries.length === 0) {
      container.innerHTML = `<div class="empty-state-mini">Sin datos este mes</div>`;
      return;
    }
    container.innerHTML = entries.map(([name, data]) => `
      <div class="tech-item" style="margin-bottom:8px">
        <div class="tech-info-main">
          <div class="tech-name">👷 ${this.escapeHtml(name)}</div>
          <div class="tech-user">${data.count} facturas</div>
        </div>
        <div style="font-weight:700;color:var(--accent2)">${this.formatCurrency(data.total)}</div>
      </div>`).join('');
  },

  // ---------- UTILIDADES ----------
  formatCurrency(amount) {
    return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(amount || 0);
  },
  escapeHtml(str) {
    if (!str) return '';
    return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  },

  // Populate month filter dropdown
  populateMonthFilter(selectId) {
    const select = document.getElementById(selectId);
    if (!select) return;
    const invoices = DB.getInvoices();
    const months = [...new Set(invoices.map(inv => inv.date?.slice(0, 7)).filter(Boolean))].sort().reverse();
    // Vaciar y rellenar
    while (select.options.length > 1) select.remove(1);
    months.forEach(m => {
      const opt = document.createElement('option');
      opt.value = m;
      const [year, month] = m.split('-');
      const names = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
      opt.textContent = `${names[parseInt(month)-1]} ${year}`;
      select.appendChild(opt);
    });
  },
};
