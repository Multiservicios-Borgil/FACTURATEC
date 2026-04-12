/* ===================================================
   print.js – Generación de ticket térmico
   Formatos: vista previa en pantalla + impresión
   =================================================== */

const PrintManager = {

  currentInvoice: null,

  // ============================================================
  // Generar el HTML del ticket térmico (58mm)
  // ============================================================
  generateTicketHTML(invoice) {
    const c = invoice.company || {};
    const cli = invoice.client || {};
    const totals = invoice.totals || {};
    const fmt = v => new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(v || 0);
    const dateFormatted = invoice.date
      ? new Date(invoice.date + 'T12:00:00').toLocaleDateString('es-ES', { day:'2-digit', month:'2-digit', year:'numeric' })
      : '—';

    const linesHTML = invoice.lines.map(line => {
      const typeEmoji = { labor: '🔧', part: '⚙️', travel: '🚗', custom: '📌' }[line.type] || '•';
      return `
        <div class="ticket-line-item">
          <div class="ticket-line-desc">${typeEmoji} ${this._esc(line.description)}</div>
          <div class="ticket-line-detail">${line.quantity} ud. × ${fmt(line.unitPrice)}</div>
          <div class="ticket-line-subtotal">${fmt(line.subtotal)}</div>
        </div>`;
    }).join('');

    const ivaTxt = totals.ivaPct === 0 ? 'EXENTO DE IVA' : `IVA (${totals.ivaPct}%)`;

    return `
      <div class="thermal-ticket">
        <!-- CABECERA EMPRESA -->
        <div class="ticket-company-name">${this._esc(c.name || 'MI EMPRESA')}</div>
        ${c.cif ? `<div class="ticket-company-info">CIF/NIF: ${this._esc(c.cif)}</div>` : ''}
        ${c.address ? `<div class="ticket-company-info">${this._esc(c.address)}</div>` : ''}
        ${(c.cp || c.city) ? `<div class="ticket-company-info">${this._esc(c.cp || '')} ${this._esc(c.city || '')}</div>` : ''}
        ${c.phone ? `<div class="ticket-company-info">Tel: ${this._esc(c.phone)}</div>` : ''}
        ${c.email ? `<div class="ticket-company-info">${this._esc(c.email)}</div>` : ''}
        ${c.web ? `<div class="ticket-company-info">${this._esc(c.web)}</div>` : ''}

        <hr class="ticket-divider" />

        <div class="ticket-invoice-title">FACTURA</div>

        <div class="ticket-info-row">
          <span class="label">Nº Factura:</span>
          <span class="value">${this._esc(invoice.number)}</span>
        </div>
        <div class="ticket-info-row">
          <span class="label">Fecha:</span>
          <span class="value">${dateFormatted}</span>
        </div>
        <div class="ticket-info-row">
          <span class="label">Técnico:</span>
          <span class="value">${this._esc(invoice.techName || '—')}</span>
        </div>

        <hr class="ticket-divider" />

        <!-- DATOS CLIENTE -->
        <div class="ticket-section-header">DATOS DEL CLIENTE</div>
        <div class="ticket-client-block">
          ${cli.nif ? `<div>NIF/CIF: <strong>${this._esc(cli.nif)}</strong></div>` : ''}
          ${cli.name ? `<div><strong>${this._esc(cli.name)}</strong></div>` : ''}
          ${cli.address ? `<div>${this._esc(cli.address)}</div>` : ''}
          ${(cli.cp || cli.city) ? `<div>${this._esc(cli.cp || '')} ${this._esc(cli.city || '')}</div>` : ''}
          ${cli.phone ? `<div>Tel: ${this._esc(cli.phone)}</div>` : ''}
        </div>

        <hr class="ticket-divider" />

        <!-- LÍNEAS DE FACTURA -->
        <div class="ticket-section-header">DETALLE DE SERVICIOS</div>
        ${linesHTML}

        <hr class="ticket-divider" />

        <!-- TOTALES -->
        <div class="ticket-totals">
          <div class="ticket-total-row">
            <span>Base Imponible</span>
            <span>${fmt(totals.base)}</span>
          </div>
          <div class="ticket-total-row">
            <span>${ivaTxt}</span>
            <span>${fmt(totals.iva)}</span>
          </div>
          <div class="ticket-total-final">
            <span>TOTAL</span>
            <span>${fmt(totals.total)}</span>
          </div>
        </div>

        <hr class="ticket-divider" />

        <!-- FORMA DE COBRO -->
        <div class="ticket-payment">
          Forma de cobro: ${this._esc(invoice.paymentMethod || '—')}
        </div>

        <hr class="ticket-divider" />

        <!-- NOTAS / GARANTÍA -->
        ${invoice.notes ? `
          <div class="ticket-section-header">OBSERVACIONES</div>
          <div class="ticket-notes">${this._esc(invoice.notes)}</div>
          <hr class="ticket-divider" />
        ` : ''}

        <!-- PIE -->
        ${c.footer ? `<div class="ticket-footer">${this._esc(c.footer)}</div>` : ''}
        <div class="ticket-thanks">¡GRACIAS!</div>
        <div class="ticket-footer" style="margin-top:4pt">Conserve esta factura como justificante.</div>

      </div>`;
  },

  // ============================================================
  // Mostrar vista previa en el modal
  // ============================================================
  showPreview(invoice) {
    this.currentInvoice = invoice;
    const html = this.generateTicketHTML(invoice);
    const container = document.getElementById('invoice-preview-content');
    container.innerHTML = html;
    // Inyectar estilos inline para la vista previa en pantalla,
    // ya que el contexto no es "print"
    this._injectPreviewStyles(container);
    document.getElementById('modal-preview').classList.remove('hidden');
  },

  // ============================================================
  // Imprimir
  // ============================================================
  print(invoice) {
    const inv = invoice || this.currentInvoice;
    if (!inv) return;
    const html = this.generateTicketHTML(inv);
    const printArea = document.getElementById('print-area');
    printArea.innerHTML = html;
    // Aplicar estilos de impresión inline para mayor compatibilidad
    this._applyPrintStyles(printArea);
    window.print();
    // Limpiar tras imprimir
    setTimeout(() => { printArea.innerHTML = ''; }, 1000);
  },

  // ============================================================
  // Compartir por WhatsApp / Email
  // ============================================================
  shareInvoice(invoice) {
    const inv = invoice || this.currentInvoice;
    if (!inv) return;

    const fmt = v => new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(v || 0);
    const dateFormatted = inv.date
      ? new Date(inv.date + 'T12:00:00').toLocaleDateString('es-ES')
      : '—';
    const c = inv.company || {};

    let text = `*FACTURA ${inv.number}*\n`;
    text += `${c.name || 'Mi Empresa'} | ${c.cif || ''}\n`;
    text += `Fecha: ${dateFormatted}\n\n`;
    text += `*CLIENTE:* ${inv.client?.name || '—'} (${inv.client?.nif || '—'})\n\n`;
    text += `*CONCEPTOS:*\n`;
    inv.lines.forEach(l => {
      text += `• ${l.description}: ${l.quantity} × ${fmt(l.unitPrice)} = ${fmt(l.subtotal)}\n`;
    });
    text += `\n*BASE IMPONIBLE:* ${fmt(inv.totals?.base)}\n`;
    if (inv.totals?.ivaPct > 0) {
      text += `*IVA (${inv.totals?.ivaPct}%):* ${fmt(inv.totals?.iva)}\n`;
    }
    text += `*TOTAL: ${fmt(inv.totals?.total)}*\n\n`;
    text += `Forma de cobro: ${inv.paymentMethod || '—'}\n`;
    if (inv.notes) text += `\n${inv.notes}\n`;

    const encoded = encodeURIComponent(text);

    // Mostrar opciones de compartir
    if (navigator.share) {
      navigator.share({
        title: `Factura ${inv.number}`,
        text: text,
      }).catch(() => {});
    } else {
      // Fallback: abrir WhatsApp Web
      window.open(`https://wa.me/?text=${encoded}`, '_blank');
    }
  },

  // ============================================================
  // PRIVADOS
  // ============================================================
  _esc(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g,'&amp;')
      .replace(/</g,'&lt;')
      .replace(/>/g,'&gt;')
      .replace(/"/g,'&quot;')
      .replace(/\n/g,'<br>');
  },

  _injectPreviewStyles(container) {
    // La vista previa en pantalla ya tiene estilos en main.css
    // Estilos inline adicionales para que el ticket se vea bien
    const style = `
      .thermal-ticket { font-family: 'Courier New', monospace; font-size: 13px; line-height:1.35; color:#111; max-width:300px; margin:0 auto; }
      .ticket-divider { border:none; border-top:1px dashed #333; margin:6px 0; }
      .ticket-company-name { font-size:15px; font-weight:bold; text-align:center; text-transform:uppercase; margin-bottom:2px; }
      .ticket-company-info { font-size:11px; text-align:center; }
      .ticket-invoice-title { font-size:14px; font-weight:bold; text-align:center; margin:5px 0 3px; text-transform:uppercase; letter-spacing:1px; }
      .ticket-info-row { display:flex; justify-content:space-between; font-size:11px; margin:2px 0; }
      .ticket-info-row .value { font-weight:bold; }
      .ticket-section-header { font-weight:bold; font-size:10px; margin:4px 0 2px; text-transform:uppercase; }
      .ticket-client-block { font-size:11px; margin-bottom:2px; }
      .ticket-line-item { margin:3px 0; }
      .ticket-line-desc { font-size:12px; font-weight:bold; }
      .ticket-line-detail { font-size:10px; color:#444; }
      .ticket-line-subtotal { font-size:11px; font-weight:bold; text-align:right; }
      .ticket-totals { margin-top:4px; }
      .ticket-total-row { display:flex; justify-content:space-between; font-size:11px; margin:2px 0; }
      .ticket-total-final { display:flex; justify-content:space-between; font-size:14px; font-weight:bold; margin:4px 0; border-top:1px solid #333; padding-top:4px; }
      .ticket-payment { text-align:center; font-size:12px; font-weight:bold; padding:3px 0 4px; }
      .ticket-notes { font-size:10px; color:#444; font-style:italic; }
      .ticket-footer { text-align:center; font-size:10px; color:#444; margin-top:4px; }
      .ticket-thanks { text-align:center; font-size:13px; font-weight:bold; margin-top:4px; text-transform:uppercase; }
    `;
    const styleEl = document.createElement('style');
    styleEl.textContent = style;
    container.prepend(styleEl);
  },

  _applyPrintStyles(printArea) {
    printArea.style.cssText = `
      font-family: 'Courier New', Courier, monospace;
      font-size: 9pt;
      color: #000;
      background: #fff;
      width: 100%;
    `;
  },
};
