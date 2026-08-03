// Fichero: src/renderer/components/audit/audit-ui.js
// Descripción: Builders de render compartidos por todas las pestañas de la auditoría
// (KPIs, callouts, tarjetas de métricas con barras, cabeceras, grid) + la paleta de color.
//
// Por qué vive aquí la paleta: el dashboard usa clases/tokens CSS, pero el generador de PDF
// (jsPDF) no entiende var(--sf-*), necesita HEX literales. Para tener UNA sola fuente de verdad
// de color entre el dashboard y el PDF, exponemos los tokens --sf-* como constantes HEX en
// AUDIT_PALETTE y las consume tanto la UI como audit-pdf-generator.

import { escapeHtml } from '../../ui/format-utils.js';

/**
 * Paleta de la auditoría en HEX (espejo de los tokens --sf-* de common.css).
 * El morado es el único color fuera de tokens: se reserva para Salesforce/CRM y journeys.
 */
export const AUDIT_PALETTE = {
    green:    '#4caf50', // --sf-green   → positivo (activo, en uso, publicado…)
    red:      '#c23934', // --sf-red     → negativo (huérfano, detenido, sin actividad…)
    orange:   '#dd7a01', // --sf-orange  → intermedio / aviso (borrador, sin descripción…)
    blue:     '#0070d2', // --sf-blue    → color por defecto y canal Email
    blueDark: '#005fb2', // --sf-blue-dark
    teal:     '#0b827c', // --sf-teal    → exportaciones y canales SMS
    purple:   '#7f5fc7', // fuera de tokens: Salesforce/CRM y journeys
    gray:     '#706e6b', // --sf-text-muted → neutro / sin dato
};

/**
 * Estilos de cada tipo de callout: fondo pastel + texto oscuro del mismo tono (estilo badge,
 * sin borde lateral grueso) y color de acento para el PDF.
 * 'accent' es el HEX de la paleta que usa el PDF para la barra/título del callout.
 */
export const CALLOUT_STYLES = {
    danger:  { bg: '#fdecea', fg: '#b3261e', accent: AUDIT_PALETTE.red },
    warning: { bg: '#fff4e5', fg: '#8a5a00', accent: AUDIT_PALETTE.orange },
    info:    { bg: '#e1f5fe', fg: '#0277bd', accent: AUDIT_PALETTE.blue },
    success: { bg: '#e6f6e6', fg: '#1b5e20', accent: AUDIT_PALETTE.green },
};

/** Clase CSS por tipo de callout (los colores viven en common.css con soporte de tema). */
const CALLOUT_CLASS = {
    danger: 'audit-callout-danger', warning: 'audit-callout-warning',
    info: 'audit-callout-info', success: 'audit-callout-success',
};

/**
 * Mapea un HEX de AUDIT_PALETTE a su variable CSS theme-reactive (--audit-*),
 * para que las tarjetas/barras del dashboard se relean bien en modo oscuro
 * aunque el HTML esté cacheado. Si el color no es de la paleta, se deja tal cual.
 * El PDF NO usa esto (imprime sobre papel blanco con los HEX de AUDIT_PALETTE).
 */
const HEX_TO_VAR = {
    [AUDIT_PALETTE.green]:  'var(--audit-green)',
    [AUDIT_PALETTE.red]:    'var(--audit-red)',
    [AUDIT_PALETTE.orange]: 'var(--audit-orange)',
    [AUDIT_PALETTE.blue]:   'var(--audit-blue)',
    [AUDIT_PALETTE.blueDark]: 'var(--audit-blue)',
    [AUDIT_PALETTE.teal]:   'var(--audit-teal)',
    [AUDIT_PALETTE.purple]: 'var(--audit-purple)',
    [AUDIT_PALETTE.gray]:   'var(--audit-gray)',
};
function themeColor(hex) {
    return HEX_TO_VAR[(hex || '').toLowerCase()] || hex;
}

/**
 * Formatea una fecha de SFMC como dd/mm/aaaa hh:mm (sin segundos, con cero a la izquierda).
 * Se mantiene esta variante local en vez de ui/format-utils.formatDate porque el formato NO
 * coincide: format-utils usa toLocaleString (incluye segundos y coma) y aquí se quiere el
 * formato compacto histórico de la auditoría. Las fechas "cero" de SFMC (0001…) devuelven '---'.
 * @param {string} ds - Fecha ISO devuelta por la API (o null/vacío).
 * @returns {string} Fecha formateada o '---'.
 */
export function formatDate(ds) {
    if (!ds || ds.startsWith('0001')) return '---';
    const d = new Date(ds);
    if (isNaN(d.getTime())) return '---';
    const p = n => n.toString().padStart(2, '0');
    return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/**
 * Resuelve el color de una barra a partir de su etiqueta cuando no se pasa color explícito.
 * Mapea a AUDIT_PALETTE conservando la semántica original: positivo→verde, negativo→rojo,
 * intermedio/aviso→naranja, canales/tipos→azul/teal/morado y por defecto→azul.
 * @param {string} label - Etiqueta de la barra.
 * @returns {string} HEX de la paleta.
 */
export function resolveBarColor(label) {
    const l = (label || '').toLowerCase();
    if (/^con |activos? con login|activos$|en uso|exclusiv|publicad|published|scheduled|^login en \d{4}/.test(l)) return AUDIT_PALETTE.green;
    if (/^sin |huérfano|sin historial|stopped|inactiv|>.*mes/.test(l)) return AUDIT_PALETTE.red;
    if (/anterior|antiguo|paused|compartid|draft|solo lógica/.test(l)) return AUDIT_PALETTE.orange;
    if (/salesforce|crm/.test(l))   return AUDIT_PALETTE.purple;
    if (/api|integrac/.test(l))     return AUDIT_PALETTE.purple;
    if (/email/.test(l))            return AUDIT_PALETTE.blue;
    if (/sms/.test(l))              return AUDIT_PALETTE.teal;
    if (/push|in-app/.test(l))      return AUDIT_PALETTE.orange;
    if (/whatsapp/.test(l))         return AUDIT_PALETTE.green;
    if (/running/.test(l))          return AUDIT_PALETTE.blue;
    if (/sql|query/.test(l))        return AUDIT_PALETTE.blue;
    if (/script|ssjs/.test(l))      return AUDIT_PALETTE.purple;
    if (/import/.test(l))           return AUDIT_PALETTE.blue;
    if (/export|extract/.test(l))   return AUDIT_PALETTE.teal;
    if (/journey/.test(l))          return AUDIT_PALETTE.purple;
    return AUDIT_PALETTE.blue;
}

/** Envuelve el contenido de una pestaña con su padding estándar. */
export function buildTabWrapper(content) {
    return `<div class="audit-tab-pad">${content}</div>`;
}

/**
 * Fila de tarjetas KPI. El color del valor depende del dato y se mantiene inline;
 * la tarjeta es neutra (sin bordes de color) y su estilo vive en audit-manager.css.
 * @param {Array<{value:*,label:string,color?:string,drillKey?:string}>} items
 */
export function buildKpiRow(items) {
    const cards = items.map(({ value, label, color = AUDIT_PALETTE.blue, drillKey }) => {
        const drillAttr = drillKey
            ? `data-drill="${drillKey}" class="drillable audit-kpi-card" title="Ver detalle"`
            : 'class="audit-kpi-card"';
        return `<div ${drillAttr}>
            <div class="audit-kpi-value" style="color:${themeColor(color)};">${value}</div>
            <div class="audit-kpi-label">${label}</div>
        </div>`;
    }).join('');
    return `<div class="audit-kpi-row">${cards}</div>`;
}

/**
 * Renderiza un callout (aviso) al estilo de la app: fondo pastel + texto del mismo tono, sin
 * borde lateral grueso. Recibe un OBJETO para desacoplarlo del PDF (antes se parseaba el HTML
 * con regex): el mismo objeto se registra en el pdfData y el PDF resuelve su color desde 'type'.
 * @param {{type:string, title:string, message:string}} callout
 * @returns {string} HTML del callout.
 */
export function buildCallout(callout) {
    const { type = 'info', title = '', message = '' } = callout || {};
    const cls = CALLOUT_CLASS[type] || CALLOUT_CLASS.info;
    return `<div class="audit-callout ${cls}">` +
        `<span class="audit-callout-title">${title}</span><br>${message}</div>`;
}

/** Renderiza una lista de objetos callout a HTML concatenado. */
export function renderCallouts(callouts) {
    return (callouts || []).map(buildCallout).join('');
}

/** Cabecera de sección dentro de una pestaña. */
export function buildSectionHeader(text) {
    return `<div class="audit-section-header">${text}</div>`;
}

/** Grid de 2 columnas para las tarjetas de métricas. */
export function buildGrid(cards) {
    return `<div class="audit-grid">${cards.join('')}</div>`;
}

/**
 * Tarjeta de métricas con barras de progreso. El color y el % de cada barra dependen del dato,
 * por eso van inline; 'wide' (ocupa las 2 columnas) también es dinámico y va inline.
 * @param {string} title
 * @param {string} help
 * @param {Array<{label:string,value:number,total:number,color?:string,drillKey?:string}>} bars
 * @param {{wide?:boolean}} [options]
 */
export function buildMetricCard(title, help, bars, options = {}) {
    const barsHtml = (bars || []).map(({ label, value, total, color, drillKey }) => {
        // Color theme-reactive para la barra (se relee bien en oscuro aunque esté cacheado).
        const barColor = themeColor(color || resolveBarColor(label));
        const pct       = total > 0 ? Math.min(100, Math.round((value / total) * 100)) : 0;
        const drillAttr = drillKey
            ? `data-drill="${drillKey}" class="drillable-bar audit-bar-row" title="Ver detalle"`
            : 'class="audit-bar-row"';
        return `<div ${drillAttr}>
            <div class="audit-bar-label" title="${escapeHtml(label)}">${escapeHtml(label)}</div>
            <div class="audit-bar-track">
                <div class="audit-bar-fill" style="background:${barColor}; width:${pct}%;"></div>
            </div>
            <div class="audit-bar-value" style="color:${barColor};">${value}</div>
            <div class="audit-bar-pct">${pct}%</div>
        </div>`;
    }).join('');

    const gridSpan = options.wide ? ' style="grid-column:1 / -1;"' : '';
    return `<div class="audit-metric-card"${gridSpan}>
        <div class="audit-metric-title">${title}</div>
        <div class="audit-metric-help">${help}</div>
        ${barsHtml || '<div class="audit-metric-empty">Sin datos disponibles.</div>'}
    </div>`;
}

/** Placeholder de carga por pestaña. Usa el spinner común (sin emojis). */
export function buildLoadingPlaceholder() {
    return `<div class="audit-loading"><div class="loader-spinner audit-loading-spinner"></div>` +
        `<div class="audit-loading-text">Cargando datos del escaneo…</div></div>`;
}
