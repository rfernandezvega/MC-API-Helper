// =======================================================================================
// --- Fichero: src/renderer/components/estadisticas.js ---
// --- Descripción: Vista de Estadísticas de Uso. Pinta lo que registra usage-tracker
// ---              (acciones y accesos por cliente/BU) junto al acumulado de llamadas
// ---              API. Arranca siempre con el agregado de todos los clientes y se baja
// ---              al detalle pulsando una barra de cliente o una fila de la tabla.
// ---
// --- Reutiliza los builders de la auditoría (KPIs y barras) para que las dos vistas
// --- de análisis tengan el mismo aspecto, y el sorter común para la tabla de detalle.
// =======================================================================================

import elements from '../ui/dom-elements.js';
import * as ui from '../ui/ui-helpers.js';
import * as logger from '../ui/logger.js';
import { escapeHtml } from '../ui/format-utils.js';
import { downloadCsv, buildCsvFileName } from '../ui/csv-export.js';
import { createTableSorter } from '../ui/table-utils.js';
import * as usageTracker from '../ui/usage-tracker.js';
import { buildKpiRow, buildMetricCard, buildGrid, buildSectionHeader, formatDate, AUDIT_PALETTE } from './audit/audit-ui.js';

// --- ESTADO DEL MÓDULO ---
let usageStats = {};   // { cliente: { mid: { accesos, primerUso, ultimoUso, acciones } } }
let apiUsage = {};     // { cliente: { mid: totalLlamadas } }
let buInfoByClient = {}; // { cliente: { mid: { name, hidden } } }: nombre a mostrar y visibilidad

// Ámbito del desglose abierto: null (agregado), 'client::Nombre' o 'bu::Nombre::MID'.
let drill = null;

// Lo que se está mirando ahora mismo (agregado o desglose); es el origen de la descarga.
let focus = { label: 'Todos los clientes', acciones: [], vistas: [] };

let sorter = null;

// Nº de entradas distintas que se muestran en cada tarjeta de ranking.
const TOP_ACTIONS = 15;

// Cubo que usaban las versiones iniciales para lo hecho sin cliente activo. Ya no se
// escribe, pero puede quedar en ficheros antiguos y no debe mostrarse.
const LEGACY_NO_CLIENT = '(sin cliente)';

/**
 * Inicializa el módulo: listeners de los botones de cabecera, del desglose (barras de
 * cliente y filas de la tabla) y del ordenador de la tabla de detalle.
 */
export function init() {
    elements.refreshStatsBtn?.addEventListener('click', view);
    elements.downloadStatsCsvBtn?.addEventListener('click', downloadRankingCsv);
    elements.clearStatsBtn?.addEventListener('click', clearStats);

    // Un único listener delegado: el contenido se regenera entero en cada render.
    elements.statsContent?.addEventListener('click', (e) => {
        if (e.target.closest('[data-drill-close]')) {
            drill = null;
            render();
            return;
        }
        const target = e.target.closest('[data-drill]');
        if (!target) return;
        const key = target.getAttribute('data-drill');
        // Volver a pulsar lo que ya está abierto lo cierra.
        drill = (drill === key) ? null : key;
        render();
    });

    sorter = createTableSorter({
        tableSelector: '#stats-detail-table',
        initialColumn: 'totalAcciones',
        initialDirection: 'desc',
        types: {
            accesos: 'number', apiCalls: 'number', totalAcciones: 'number', ultimoUso: 'date'
        },
        onSort: () => render()
    });
}

/**
 * Carga los datos de disco y pinta la vista. Antes vuelca lo que el tracker tenga en
 * memoria para que las acciones recién hechas ya aparezcan reflejadas.
 */
export async function view() {
    try {
        await usageTracker.flush();

        const [stats, calls, configs] = await Promise.all([
            window.electronAPI.getUsageStats(),
            window.electronAPI.getApiUsageAll(),
            window.electronAPI.loadGlobalConfigs()
        ]);

        usageStats = stats || {};
        apiUsage = calls || {};
        buInfoByClient = buildBuInfoMap(configs || {});
        drill = null;

        render();
    } catch (error) {
        logger.logMessage(`Error al cargar las estadísticas de uso: ${error.message}`);
        elements.statsContent.innerHTML = `<p class="error-text">No se han podido cargar las estadísticas: ${escapeHtml(error.message)}</p>`;
    }
}

/**
 * Construye el diccionario de BUs por cliente a partir de la configuración guardada:
 * su nombre (para no mostrar el MID pelado) y si está oculta.
 * @param {object} configs - Configuraciones globales de clientes.
 * @returns {object} { cliente: { mid: { name, hidden } } }
 */
function buildBuInfoMap(configs) {
    const map = {};
    Object.entries(configs).forEach(([clientName, config]) => {
        map[clientName] = {};
        const bus = Array.isArray(config?.businessUnits) && config.businessUnits.length
            ? config.businessUnits
            : (config?.businessUnit ? [{ name: 'Principal', mid: String(config.businessUnit) }] : []);
        bus.forEach(bu => {
            map[clientName][String(bu.mid)] = { name: bu.name || 'Principal', hidden: !!bu.hidden };
        });
    });
    return map;
}

/**
 * Indica si un contexto debe entrar en las estadísticas. Quedan fuera las BUs marcadas
 * como ocultas (tampoco salen en el selector de la barra lateral) y el cubo sin cliente
 * de versiones anteriores, que ya no se registra.
 * @param {string} clientName
 * @param {string} mid
 * @returns {boolean}
 */
function isTrackedContext(clientName, mid) {
    if (!clientName || clientName === LEGACY_NO_CLIENT) return false;
    return !buInfoByClient[clientName]?.[mid]?.hidden;
}

/**
 * Devuelve todos los contextos (cliente + BU) con datos, uniendo los que tienen
 * estadísticas de uso con los que solo tienen llamadas API o solo están configurados.
 * @returns {Array<object>} Contextos con sus contadores.
 */
function collectContexts() {
    const contexts = new Map();

    const ensure = (clientName, mid) => {
        const key = `${clientName}|${mid}`;
        if (!contexts.has(key)) {
            contexts.set(key, {
                clientName,
                mid,
                buName: buInfoByClient[clientName]?.[mid]?.name || '',
                accesos: 0,
                apiCalls: 0,
                acciones: {},
                totalAcciones: 0,
                vistas: {},
                totalVistas: 0,
                ultimoUso: null
            });
        }
        return contexts.get(key);
    };

    const sumCounters = (bucket) => Object.values(bucket || {}).reduce((sum, item) => sum + (Number(item?.n) || 0), 0);

    Object.entries(usageStats).forEach(([clientName, bus]) => {
        Object.entries(bus || {}).forEach(([mid, node]) => {
            if (!isTrackedContext(clientName, mid)) return;
            const ctx = ensure(clientName, mid);
            ctx.accesos = Number(node?.accesos) || 0;
            ctx.acciones = node?.acciones || {};
            ctx.totalAcciones = sumCounters(ctx.acciones);
            ctx.vistas = node?.vistas || {};
            ctx.totalVistas = sumCounters(ctx.vistas);
            ctx.ultimoUso = node?.ultimoUso || null;
        });
    });

    Object.entries(apiUsage).forEach(([clientName, bus]) => {
        Object.entries(bus || {}).forEach(([mid, total]) => {
            if (!isTrackedContext(clientName, mid)) return;
            ensure(clientName, mid).apiCalls = Number(total) || 0;
        });
    });

    // Clientes configurados sin uso todavía: interesan para ver qué está identificado y sin usar.
    Object.entries(buInfoByClient).forEach(([clientName, bus]) => {
        Object.entries(bus).forEach(([mid, info]) => {
            if (!info.hidden) ensure(clientName, mid);
        });
    });

    return Array.from(contexts.values());
}

/**
 * Suma los contadores de un conjunto de contextos y devuelve los rankings de acciones
 * (botones) y de vistas (navegación), que se cuentan por separado.
 * @param {Array<object>} contexts
 * @returns {object} Totales agregados.
 */
function aggregate(contexts) {
    const acciones = new Map();
    const vistas = new Map();
    let accesos = 0, apiCalls = 0, totalAcciones = 0, totalVistas = 0, ultimoUso = null;

    // Acumula un bucket de contadores ({ id: { n, label } }) sobre un Map agregado.
    const merge = (target, bucket) => {
        Object.entries(bucket || {}).forEach(([id, data]) => {
            const current = target.get(id) || { n: 0, label: data?.label || id };
            current.n += Number(data?.n) || 0;
            if (data?.label) current.label = data.label;
            target.set(id, current);
        });
    };

    contexts.forEach(ctx => {
        accesos += ctx.accesos;
        apiCalls += ctx.apiCalls;
        totalAcciones += ctx.totalAcciones;
        totalVistas += ctx.totalVistas;
        if (ctx.ultimoUso && (!ultimoUso || ctx.ultimoUso > ultimoUso)) ultimoUso = ctx.ultimoUso;
        merge(acciones, ctx.acciones);
        merge(vistas, ctx.vistas);
    });

    const toRanking = (target) => Array.from(target.entries())
        .map(([id, data]) => ({ id, label: data.label, n: data.n }))
        .sort((a, b) => b.n - a.n);

    return {
        accesos, apiCalls, totalAcciones, totalVistas, ultimoUso,
        ranking: toRanking(acciones),
        rankingVistas: toRanking(vistas)
    };
}

/** Pinta la vista completa: agregado, desglose abierto (si lo hay) y tabla de detalle. */
function render() {
    const contexts = collectContexts();
    const totals = aggregate(contexts);
    focus = { label: 'Todos los clientes', acciones: totals.ranking, vistas: totals.rankingVistas };

    const sinDatos = totals.totalAcciones === 0 && totals.totalVistas === 0 && totals.apiCalls === 0 && totals.accesos === 0;
    if (contexts.length === 0 || sinDatos) {
        elements.statsContent.innerHTML = '<p class="stats-empty">Todavía no hay actividad registrada. Las estadísticas se van acumulando según usas la aplicación.</p>';
        return;
    }

    const html = [
        buildKpiRow([
            { value: totals.accesos, label: 'Accesos a clientes' },
            { value: totals.apiCalls, label: 'Llamadas API', color: AUDIT_PALETTE.teal },
            { value: totals.totalVistas, label: 'Vistas abiertas', color: AUDIT_PALETTE.green },
            { value: totals.totalAcciones, label: 'Acciones realizadas', color: AUDIT_PALETTE.purple },
            { value: totals.ranking.length, label: 'Acciones distintas', color: AUDIT_PALETTE.orange },
            { value: formatDate(totals.ultimoUso), label: 'Último uso', color: AUDIT_PALETTE.gray }
        ]),
        buildSectionHeader('Qué se usa'),
        buildGrid(buildOverviewCards(contexts, totals)),
        buildDrillPanel(contexts),
        buildSectionHeader('Detalle por cliente y Business Unit'),
        buildDetailTable(contexts)
    ].join('');

    elements.statsContent.innerHTML = html;

    // La cabecera se regenera en cada render: hay que reenganchar el sorter.
    sorter.attach(elements.statsContent.querySelector('#stats-detail-table thead'));
    sorter.updateIndicators();

    if (drill) elements.statsContent.querySelector('#stats-drill')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

/**
 * Tarjetas del agregado: ranking global de acciones y reparto por cliente (estas últimas
 * con desglose al pulsar cada barra).
 * @param {Array<object>} contexts - Todos los contextos.
 * @param {object} totals - Agregado global.
 * @returns {Array<string>} HTML de cada tarjeta.
 */
function buildOverviewCards(contexts, totals) {
    const cards = [
        buildRankingCard(
            'Acciones más utilizadas',
            'Botones pulsados, agrupados por vista y pestaña. Todos los clientes.',
            totals.ranking,
            totals.totalAcciones
        ),
        buildRankingCard(
            'Vistas más abiertas',
            'Navegación por el menú lateral, sin contar los botones de cada vista.',
            totals.rankingVistas,
            totals.totalVistas,
            AUDIT_PALETTE.green
        )
    ];

    const byClient = new Map();
    contexts.forEach(ctx => {
        const current = byClient.get(ctx.clientName) || { acciones: 0, apiCalls: 0 };
        current.acciones += ctx.totalAcciones;
        current.apiCalls += ctx.apiCalls;
        byClient.set(ctx.clientName, current);
    });

    if (byClient.size > 1) {
        cards.push(buildMetricCard(
            'Acciones por cliente',
            'Dónde se concentra el trabajo. Pulsa un cliente para ver sus acciones.',
            [...byClient.entries()]
                .sort((a, b) => b[1].acciones - a[1].acciones)
                .map(([clientName, data]) => ({
                    label: clientName,
                    value: data.acciones,
                    total: totals.totalAcciones,
                    color: AUDIT_PALETTE.purple,
                    drillKey: `client::${clientName}`
                }))
        ));

        cards.push(buildMetricCard(
            'Llamadas API por cliente',
            'Consumo acumulado contra Marketing Cloud.',
            [...byClient.entries()]
                .sort((a, b) => b[1].apiCalls - a[1].apiCalls)
                .map(([clientName, data]) => ({
                    label: clientName,
                    value: data.apiCalls,
                    total: totals.apiCalls,
                    color: AUDIT_PALETTE.teal
                }))
        ));
    }

    return cards;
}

/**
 * Tarjeta con un ranking y la nota del total sobre el que va el porcentaje.
 * @param {string} title
 * @param {string} help
 * @param {Array<object>} ranking - Entradas ordenadas de más a menos.
 * @param {number} total - Total del ámbito sobre el que se calcula el porcentaje.
 * @param {string} [color] - Color de las barras.
 * @returns {string} HTML de la tarjeta.
 */
function buildRankingCard(title, help, ranking, total, color = AUDIT_PALETTE.blue) {
    return buildMetricCard(
        title,
        help,
        ranking.slice(0, TOP_ACTIONS).map(item => ({ label: item.label, value: item.n, total, color })),
        {
            wide: true,
            note: total > 0
                ? `Porcentaje sobre los ${total} registros de esta tarjeta en el ámbito.`
                : 'Sin datos registrados en este ámbito.'
        }
    );
}

/**
 * Panel de desglose del cliente o la BU seleccionados. Vacío si no hay nada abierto.
 * @param {Array<object>} contexts - Todos los contextos.
 * @returns {string} HTML del panel.
 */
function buildDrillPanel(contexts) {
    if (!drill) return '';

    const [type, clientName, mid] = drill.split('::');
    const selected = type === 'bu'
        ? contexts.filter(c => c.clientName === clientName && c.mid === mid)
        : contexts.filter(c => c.clientName === clientName);

    if (selected.length === 0) return '';

    const totals = aggregate(selected);
    const buName = selected[0].buName || 'BU';
    const scopeLabel = type === 'bu'
        ? `${clientName} › ${buName} (${mid})`
        : `${clientName} (todas las BUs)`;

    focus = { label: scopeLabel, acciones: totals.ranking, vistas: totals.rankingVistas };

    const help = `${totals.accesos} accesos · ${totals.apiCalls} llamadas API · último uso: ${formatDate(totals.ultimoUso)}`;

    return `<div id="stats-drill" class="stats-drill">
        <div class="stats-drill-header">
            <div class="audit-section-header u-m-0">Uso de ${escapeHtml(scopeLabel)}</div>
            <button type="button" class="action-button secondary-btn" data-drill-close>Cerrar detalle</button>
        </div>
        ${buildGrid([
            buildRankingCard('Acciones más utilizadas', help, totals.ranking, totals.totalAcciones),
            buildRankingCard('Vistas más abiertas', 'Navegación por el menú lateral en este ámbito.', totals.rankingVistas, totals.totalVistas, AUDIT_PALETTE.green)
        ])}
    </div>`;
}

/**
 * Tabla con todos los contextos identificados, incluidos los configurados sin uso.
 * Las cabeceras ordenan y cada fila abre el desglose de esa BU.
 * @param {Array<object>} contexts - Todos los contextos.
 * @returns {string} HTML de la tabla.
 */
function buildDetailTable(contexts) {
    const rows = sorter.sort([...contexts]).map(ctx => {
        const key = `bu::${ctx.clientName}::${ctx.mid}`;
        const isOpen = drill === key;
        return `<tr data-drill="${escapeHtml(key)}" class="stats-row${isOpen ? ' selected' : ''}" title="Ver las acciones de esta Business Unit">
            <td>${escapeHtml(ctx.clientName)}</td>
            <td>${escapeHtml(ctx.buName || '---')}</td>
            <td>${escapeHtml(ctx.mid)}</td>
            <td>${ctx.accesos}</td>
            <td>${ctx.apiCalls}</td>
            <td>${ctx.totalVistas}</td>
            <td>${ctx.totalAcciones}</td>
            <td>${formatDate(ctx.ultimoUso)}</td>
        </tr>`;
    }).join('');

    return `<div class="table-container">
        <table id="stats-detail-table">
            <thead><tr>
                <th class="sortable-header" data-sort-by="clientName">Cliente</th>
                <th class="sortable-header" data-sort-by="buName">Business Unit</th>
                <th class="sortable-header" data-sort-by="mid">MID</th>
                <th class="sortable-header" data-sort-by="accesos">Accesos</th>
                <th class="sortable-header" data-sort-by="apiCalls">Llamadas API</th>
                <th class="sortable-header" data-sort-by="totalVistas">Vistas</th>
                <th class="sortable-header" data-sort-by="totalAcciones">Acciones</th>
                <th class="sortable-header" data-sort-by="ultimoUso">Último uso</th>
            </tr></thead>
            <tbody>${rows || '<tr><td colspan="8">Sin datos.</td></tr>'}</tbody>
        </table>
    </div>`;
}

/** Descarga en CSV lo que se está mirando (agregado o desglose): vistas y acciones. */
function downloadRankingCsv() {
    // Cada bloque lleva su propio total para que el porcentaje sea comparable dentro del tipo.
    const buildRows = (tipo, ranking) => {
        const total = ranking.reduce((sum, item) => sum + item.n, 0);
        return ranking.map(item => [
            focus.label,
            tipo,
            item.label,
            item.n,
            total > 0 ? `${((item.n / total) * 100).toFixed(1)}%` : '0%'
        ]);
    };

    downloadCsv({
        headers: ['Ámbito', 'Tipo', 'Elemento', 'Veces', 'Porcentaje'],
        rows: [...buildRows('Vista', focus.vistas), ...buildRows('Acción', focus.acciones)],
        fileName: buildCsvFileName('estadisticas_uso')
    });
}

/** Borra las estadísticas de uso tras confirmarlo. No toca el contador de llamadas API. */
async function clearStats() {
    const confirmed = await ui.showCustomConfirm('Se borrarán los accesos y las acciones registradas. El contador de llamadas API no se ve afectado. ¿Continuar?');
    if (!confirmed) return;

    // Se tira lo pendiente en memoria: si no, los clics de este mismo borrado se
    // escribirían al recargar la vista y parecería que no se ha borrado nada.
    usageTracker.discardPending();
    await window.electronAPI.clearUsageStats();
    logger.logMessage('Estadísticas de uso borradas.');
    await view();
}
