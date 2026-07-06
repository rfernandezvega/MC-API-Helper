// =======================================================================================
// --- Fichero: src/renderer/ui/format-utils.js ---
// --- Descripción: Helpers puros de formateo y acceso a datos, compartidos por todas
// ---              las vistas (WP-3 del plan de refactor). Unifican las copias locales
// ---              que existían en los componentes (automations-manager, content-manager,
// ---              users-manager, org-manager, erd-generator...) para que cada componente
// ---              importe de aquí en lugar de mantener su propia variante.
// =======================================================================================

/**
 * Escapa los caracteres especiales de HTML de un valor para poder interpolarlo de forma
 * segura en innerHTML o template literals (evita inyección de HTML con datos de la API).
 * Unifica las copias locales: todas escapaban lo mismo salvo la de erd-generator, que no
 * escapaba la comilla simple; se adopta la variante completa por ser la más segura.
 * @param {*} str - Valor a escapar (se convierte a string; null/undefined devuelven '').
 * @returns {string} El texto con los caracteres HTML escapados.
 */
export function escapeHtml(str) {
    if (str == null) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

/**
 * Formatea una fecha (string ISO devuelto por la API de SFMC) en formato es-ES con zona
 * horaria Europe/Madrid. Unifica las 8 copias locales de los componentes: los valores
 * nulos/vacíos y las fechas "cero" de SFMC (0001-01-01...) devuelven '---' para que las
 * tablas muestren un guion en lugar de una fecha absurda, y los valores que no parsean
 * devuelven 'Fecha inválida'.
 * @param {string} dateString - La fecha en formato ISO (o null/vacío).
 * @param {object} [opts] - Opciones de formato.
 * @param {boolean} [opts.withTime=true] - Si es false muestra solo la fecha, sin la hora
 *                                         (variante que usaba users-manager).
 * @returns {string} La fecha formateada, '---' o 'Fecha inválida'.
 */
export function formatDate(dateString, opts = { withTime: true }) {
    if (!dateString) return '---';
    const s = String(dateString).trim();
    if (s === '' || s.startsWith('0001-01-01')) return '---';
    const d = new Date(s);
    if (isNaN(d.getTime())) return 'Fecha inválida';
    // withTime por defecto true: solo se omite la hora si se pide explícitamente
    const withTime = opts?.withTime !== false;
    try {
        return withTime
            ? d.toLocaleString('es-ES', { timeZone: 'Europe/Madrid' })
            : d.toLocaleDateString('es-ES', { timeZone: 'Europe/Madrid' });
    } catch {
        return 'Fecha inválida';
    }
}

/**
 * Obtiene el valor de una propiedad anidada de un objeto a partir de una ruta con puntos.
 * Se usa sobre todo para ordenar tablas por columnas cuyo dato vive en un subobjeto
 * (ej: 'schedule.scheduledTime' en automatismos).
 * @param {object} obj - El objeto del que se extraerá el valor.
 * @param {string} path - La ruta de la propiedad separada por puntos (ej: 'schedule.scheduledTime').
 * @returns {*} El valor encontrado, o null si el objeto es nulo o algún tramo de la ruta no existe.
 */
export function getPropertyByPath(obj, path) {
    if (obj == null || !path) return null;
    return String(path).split('.').reduce((o, p) => (o != null ? o[p] : null), obj);
}
