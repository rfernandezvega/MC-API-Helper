// =======================================================================================
// --- Fichero: src/renderer/ui/table-utils.js ---
// --- Descripción: Controladores reutilizables de ordenación, paginación y badges de
// ---              estado para las tablas de la aplicación (WP-4 del plan de refactor).
// ---              Sustituyen a los tríos handleSort/sortData/updateSortIndicators y a
// ---              las copias de updatePaginationUI que había en cada componente
// ---              (automations, journeys, content, cloud-pages, sendManagement, users,
// ---              customer-finder).
// =======================================================================================

import { escapeHtml, getPropertyByPath } from './format-utils.js';

/**
 * Indica si un valor debe tratarse como "nulo" a efectos de ordenación.
 * Los nulos van SIEMPRE al final de la tabla, sea cual sea la dirección, para que las
 * filas sin dato no "floten" arriba al ordenar descendente. Incluye las fechas "cero"
 * de SFMC (0001-01-01...) y los strings vacíos.
 * @param {*} value - El valor a evaluar.
 * @returns {boolean} true si el valor debe ir al final.
 */
function isNullish(value) {
    if (value == null) return true;
    if (typeof value === 'string') {
        const s = value.trim();
        return s === '' || s.startsWith('0001-01-01');
    }
    return false;
}

/**
 * Crea un controlador de ordenación para una tabla.
 * Unifica el comportamiento de las 6 implementaciones que había en los componentes:
 * - Click en un th.sortable-header con data-sort-by alterna asc/desc; una columna nueva
 *   empieza en 'asc'.
 * - Los nulos y las fechas 0001-01-01 van siempre al final.
 * - Soporta rutas anidadas en data-sort-by (ej: 'schedule.scheduledTime').
 * - attach() es re-invocable con un thead nuevo (caso customer-finder, que regenera la
 *   cabecera en cada render); no duplica listeners si se llama dos veces con el mismo nodo.
 * - Para vistas multi-tabla (content-manager por pestaña, sendManagement con sufijos) se
 *   crea un sorter por tabla, cada uno con su propio tableSelector y estado.
 * @param {object} opts - Opciones del controlador.
 * @param {string} opts.tableSelector - Selector CSS de la tabla (ej: '#automations-table').
 * @param {string} [opts.initialColumn] - Columna ordenada inicialmente (o null si ninguna).
 * @param {'asc'|'desc'} [opts.initialDirection='asc'] - Dirección inicial.
 * @param {function} opts.onSort - Callback que re-renderiza la tabla; recibe {column, direction}.
 * @param {object} [opts.types] - Mapa columna → 'date'|'number'|'string' (por defecto 'string').
 * @returns {{ attach: function(HTMLElement=), sort: function(Array): Array, getState: function(): {column: string, direction: string}, updateIndicators: function() }}
 */
export function createTableSorter(opts) {
    const {
        tableSelector,
        initialColumn = null,
        initialDirection = 'asc',
        onSort,
        types = {}
    } = opts || {};

    let column = initialColumn;
    let direction = initialDirection;

    // Nodos thead con el listener ya enganchado: permite llamar a attach() en cada
    // render (cabeceras regeneradas) sin acumular listeners sobre el mismo nodo.
    const attached = new WeakSet();

    /**
     * Gestiona el clic en las cabeceras ordenables: actualiza columna/dirección,
     * repinta los indicadores y delega el re-render en el callback onSort.
     * @param {Event} e - El evento de clic delegado en el thead.
     */
    const handleClick = (e) => {
        const header = e.target.closest('th.sortable-header');
        if (!header || !header.dataset.sortBy) return;
        const newColumn = header.dataset.sortBy;
        if (column === newColumn) {
            direction = direction === 'asc' ? 'desc' : 'asc';
        } else {
            column = newColumn;
            direction = 'asc';
        }
        updateIndicators();
        if (typeof onSort === 'function') onSort({ column, direction });
    };

    /**
     * Engancha el listener de ordenación al thead indicado (o al thead de la tabla del
     * selector si no se pasa ninguno). Re-invocable tras regenerar la cabecera.
     * @param {HTMLElement} [theadEl] - El thead al que enganchar el listener.
     */
    const attach = (theadEl) => {
        const el = theadEl || document.querySelector(`${tableSelector} thead`);
        if (!el || attached.has(el)) return;
        attached.add(el);
        el.addEventListener('click', handleClick);
    };

    /**
     * Ordena el array IN PLACE según la columna y dirección actuales y lo devuelve.
     * Nulos/0001-01-01 al final; 'date' compara por new Date(); 'number' numéricamente;
     * el resto con localeCompare({ numeric: true, sensitivity: 'base' }).
     * @param {Array} data - El array de registros a ordenar.
     * @returns {Array} El mismo array, ya ordenado.
     */
    const sort = (data) => {
        if (!Array.isArray(data) || !column) return data;
        const dir = direction === 'asc' ? 1 : -1;
        const type = types[column] || 'string';

        data.sort((a, b) => {
            const valA = getPropertyByPath(a, column);
            const valB = getPropertyByPath(b, column);

            // Los nulos van al final SIN multiplicar por la dirección: así quedan
            // abajo tanto en asc como en desc.
            const aIsNull = isNullish(valA);
            const bIsNull = isNullish(valB);
            if (aIsNull && bIsNull) return 0;
            if (aIsNull) return 1;
            if (bIsNull) return -1;

            if (type === 'date') {
                const dateA = new Date(valA);
                const dateB = new Date(valB);
                const aBad = isNaN(dateA.getTime());
                const bBad = isNaN(dateB.getTime());
                // Las fechas que no parsean también se consideran "sin dato": al final.
                if (aBad && bBad) return 0;
                if (aBad) return 1;
                if (bBad) return -1;
                return (dateA - dateB) * dir;
            }

            if (type === 'number') {
                const numA = Number(valA);
                const numB = Number(valB);
                const aBad = isNaN(numA);
                const bBad = isNaN(numB);
                if (aBad && bBad) return 0;
                if (aBad) return 1;
                if (bBad) return -1;
                return (numA - numB) * dir;
            }

            return String(valA).localeCompare(String(valB), undefined, { numeric: true, sensitivity: 'base' }) * dir;
        });
        return data;
    };

    /**
     * Devuelve el estado actual de la ordenación.
     * @returns {{column: string|null, direction: 'asc'|'desc'}}
     */
    const getState = () => ({ column, direction });

    /**
     * Pinta los indicadores visuales (clases globales sort-asc/sort-desc) en la cabecera
     * activa y los quita del resto. Usa siempre las clases globales, nunca variantes
     * por componente (um-*).
     */
    const updateIndicators = () => {
        document.querySelectorAll(`${tableSelector} .sortable-header`).forEach(header => {
            header.classList.remove('sort-asc', 'sort-desc');
            if (column && header.dataset.sortBy === column) {
                header.classList.add(direction === 'asc' ? 'sort-asc' : 'sort-desc');
            }
        });
    };

    return { attach, sort, getState, updateIndicators };
}

/**
 * Crea un controlador de paginación sobre los 4 elementos estándar de las tablas
 * (input de página, etiqueta de total, botón anterior, botón siguiente). Unifica las
 * 5 copias de updatePaginationUI + listeners de prev/next/input de los componentes.
 * Para vistas con varias tablas (sendManagement, content-manager) se crea un paginador
 * por tabla pasando los elementos correspondientes a cada uno.
 * @param {object} els - Elementos del DOM de la paginación.
 * @param {HTMLInputElement} els.pageInput - Input numérico de la página actual.
 * @param {HTMLElement} els.totalLabel - Elemento donde pintar '/ N' con el total de páginas.
 * @param {HTMLButtonElement} els.prevBtn - Botón de página anterior.
 * @param {HTMLButtonElement} els.nextBtn - Botón de página siguiente.
 * @param {object} opts - Opciones del controlador.
 * @param {number} [opts.itemsPerPage=20] - Registros por página.
 * @param {function} [opts.onPageChange] - Callback al cambiar de página; recibe la página nueva.
 * @returns {{ update: function(number, number=), getPage: function(): number, setPage: function(number), paginate: function(Array): Array }}
 */
export function createPaginator(els, opts) {
    const { pageInput, totalLabel, prevBtn, nextBtn } = els || {};
    const { itemsPerPage = 20, onPageChange } = opts || {};

    // itemsPerPage puede ser un número fijo o una función (para que el tamaño de
    // página configurable por el usuario se relea en cada render sin recrear el paginador).
    const resolvePerPage = () => {
        const n = typeof itemsPerPage === 'function' ? itemsPerPage() : itemsPerPage;
        return Number(n) > 0 ? Number(n) : 20;
    };

    let currentPage = 1;
    let totalPages = 1;

    /**
     * Limita un número de página al rango válido [1, totalPages].
     * @param {number} n - La página candidata.
     * @returns {number} La página dentro de rango.
     */
    const clamp = (n) => Math.min(Math.max(1, n), totalPages);

    /**
     * Repinta los 4 controles con el estado actual (valor del input, total y
     * habilitado/deshabilitado de los botones).
     */
    const refreshUI = () => {
        if (totalLabel) totalLabel.textContent = `/ ${totalPages}`;
        if (pageInput) {
            pageInput.value = currentPage;
            pageInput.max = totalPages;
        }
        if (prevBtn) prevBtn.disabled = currentPage === 1;
        if (nextBtn) nextBtn.disabled = currentPage >= totalPages;
    };

    /**
     * Recalcula el total de páginas a partir del total de registros filtrados,
     * reajusta la página actual si quedó fuera de rango y repinta los controles.
     * NO dispara onPageChange (es una actualización de estado, no una navegación).
     * @param {number} totalItems - Total de registros (ya filtrados).
     * @param {number} [currentPageArg] - Página a mostrar (por defecto, la actual).
     */
    const update = (totalItems, currentPageArg = currentPage) => {
        totalPages = Math.ceil((totalItems || 0) / resolvePerPage()) || 1;
        currentPage = clamp(parseInt(currentPageArg, 10) || 1);
        refreshUI();
    };

    /**
     * Devuelve la página actual.
     * @returns {number}
     */
    const getPage = () => currentPage;

    /**
     * Navega a una página concreta (limitada al rango válido) y notifica via
     * onPageChange solo si la página realmente cambió.
     * @param {number} n - La página destino.
     */
    const setPage = (n) => {
        const target = clamp(parseInt(n, 10) || 1);
        if (target === currentPage) {
            // El input puede contener un valor fuera de rango: lo corregimos visualmente.
            refreshUI();
            return;
        }
        currentPage = target;
        refreshUI();
        if (typeof onPageChange === 'function') onPageChange(currentPage);
    };

    /**
     * Devuelve la porción del array correspondiente a la página actual y, de paso,
     * actualiza los controles con el total (patrón habitual en los render de tablas:
     * tbody.innerHTML = paginator.paginate(filteredList).map(...)).
     * @param {Array} array - La lista completa (ya filtrada y ordenada).
     * @returns {Array} Los registros de la página actual.
     */
    const paginate = (array) => {
        const list = Array.isArray(array) ? array : [];
        update(list.length);
        const per = resolvePerPage();
        const start = (currentPage - 1) * per;
        return list.slice(start, start + per);
    };

    // Listeners de los controles: se enganchan una sola vez al crear el paginador.
    if (prevBtn) prevBtn.addEventListener('click', () => setPage(currentPage - 1));
    if (nextBtn) nextBtn.addEventListener('click', () => setPage(currentPage + 1));
    if (pageInput) pageInput.addEventListener('change', () => setPage(pageInput.value));

    return { update, getPage, setPage, paginate };
}

// Mapa de estado → clase de badge global (.badge-*). Claves en minúsculas para tolerar
// variaciones de mayúsculas entre endpoints de la API (REST vs SOAP).
const STATUS_BADGE_CLASSES = {
    running: 'badge-success',
    active: 'badge-success',
    published: 'badge-success',
    scheduled: 'badge-info',
    paused: 'badge-warning',
    pausedbyerror: 'badge-warning',
    stopped: 'badge-danger',
    inactive: 'badge-danger',
    error: 'badge-danger',
    draft: 'badge-neutral',
    building: 'badge-neutral'
};

/**
 * Devuelve el HTML de un badge de estado con las clases globales .badge-*.
 * Sustituye a los pills/colores hardcodeados de cada vista (um-status-pill, los
 * background-color inline de sendManagement...). Un estado desconocido se pinta con
 * badge-neutral y su texto tal cual; el texto SIEMPRE se escapa por venir de la API.
 * @param {string} status - El estado devuelto por la API (ej: 'Running', 'Paused').
 * @returns {string} El HTML del badge, o '' si el estado es nulo/vacío.
 */
export function renderStatusBadge(status) {
    if (status == null || String(status).trim() === '') return '';
    const key = String(status).trim().toLowerCase();
    const badgeClass = STATUS_BADGE_CLASSES[key] || 'badge-neutral';
    return `<span class="badge ${badgeClass}">${escapeHtml(status)}</span>`;
}
