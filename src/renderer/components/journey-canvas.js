// =======================================================================================
// --- Fichero: src/renderer/components/journey-canvas.js ---
// --- Descripción: Dibujo del journey al estilo del canvas de Journey Builder (iconos,
// ---              ramas y uniones reales) dentro del analizador de journeys.
// =======================================================================================

import elements from '../ui/dom-elements.js';
import * as ui from '../ui/ui-helpers.js';
import { escapeHtml } from '../ui/format-utils.js';

// Rutas relativas a index.html; los SVG ya llevan el color de su categoría en Journey Builder.
const ICON_BASE = 'assets/journeyIcons/';
const GENERIC_ICON = 'general/generic-gray';
const END_ICON = 'general/exit';

const ACTIVITY_ICONS = {
    EMAILV2: 'activity/email',
    SMS: 'activity/sms', SMSSYNC: 'activity/sms',
    WHATSAPPACTIVITY: 'activity/whatsapp', WHATSAPPSESSIONTRANSFERACTIVITY: 'activity/whatsapp',
    PUSHNOTIFICATIONACTIVITY: 'activity/push-notification', MOBILEPUSH: 'activity/push-notification',
    INAPP: 'activity/in-app-message', INBOX: 'activity/inbox', PUSHINBOXACTIVITY: 'activity/inbox',
    WAITBYDURATION: 'flowcontrol/wait-by-duration', WAITBYATTRIBUTE: 'flowcontrol/wait-by-attribute',
    WAITUNTILDATE: 'flowcontrol/wait-until-date', WAITBYEVENT: 'flowcontrol/wait-until-event',
    WAITUNTILCHATRESPONSE: 'flowcontrol/wait-until-chat-response',
    MULTICRITERIADECISION: 'flowcontrol/decision-split', MULTICRITERIADECISIONV2: 'flowcontrol/decision-split',
    RESTDECISION: 'flowcontrol/decision-split',
    RANDOMSPLIT: 'flowcontrol/random-split', RANDOMSPLITV2: 'flowcontrol/random-split',
    ENGAGEMENTDECISION: 'flowcontrol/engagement-split', ENGAGEMENTSPLITV2: 'flowcontrol/engagement-split',
    ABNTEST: 'flowcontrol/path-optimizer', PATHOPTIMIZER: 'flowcontrol/path-optimizer',
    STOWAIT: 'flowcontrol/einstein-sto',
    EINSTEINENGAGEMENTFREQUENCYSPLIT: 'flowcontrol/frequency-split',
    EINSTEINSPLIT: 'flowcontrol/scoring-split', EINSTEINMESSAGINGSPLIT: 'flowcontrol/scoring-split',
    MULTICRITERIADECISIONEXTENSION: 'flowcontrol/scoring-split',
    UPDATECONTACTDATA: 'customerupdates/update-contact', UPDATECONTACTDATAV2: 'customerupdates/update-contact',
    CONTACTUPDATE: 'customerupdates/update-contact',
    ADDAUDIENCE: 'advertising/ad-audience',
    SALESCLOUDACTIVITY: 'salesservicecloud/object-activity', SALESFORCESALESCLOUDACTIVITY: 'salesservicecloud/object-activity',
    OBJECTACTIVITY: 'salesservicecloud/object-activity',
    LEAD: 'salesservicecloud/lead', CAMPAIGNMEMBER: 'salesservicecloud/campaign-member',
    SALESFORCELEADCONVERSIONACTIVITY: 'salesservicecloud/convert-lead'
};

// Las esperas llegan todas como WAIT; el subtipo real va en metaData.uiType.
const WAIT_ICONS = {
    WAITBYDURATION: 'flowcontrol/wait-by-duration',
    WAITBYATTRIBUTE: 'flowcontrol/wait-by-attribute',
    WAITUNTILDATE: 'flowcontrol/wait-until-date',
    WAITUNTILSPECIFICDATE: 'flowcontrol/wait-until-date',
    WAITBYEVENT: 'flowcontrol/wait-until-event'
};

// Objetos estándar de Salesforce con icono propio; el resto usa el de "object activity".
const SALESFORCE_OBJECT_ICONS = {
    Account: 'salesservicecloud/account', CampaignMember: 'salesservicecloud/campaign-member',
    Case: 'salesservicecloud/case', Contact: 'salesservicecloud/contact', Lead: 'salesservicecloud/lead',
    Opportunity: 'salesservicecloud/opportunity', Task: 'salesservicecloud/task'
};

// Medidas del grid: cada actividad ocupa una celda; los iconos se centran en la celda.
const CELL_W = 170;
const CELL_H = 130;
const ICON_SIZE = 48;
const END_ICON_SIZE = 32;
const PAD = 30;
const CORNER = 8;
const BEND_OFFSET = 20;
// Distancia desde el centro del icono hasta el pasillo libre entre su fila y la siguiente
// (por debajo del nombre y por encima de los iconos de la fila inferior).
const CHANNEL = 90;
const ZOOM_MIN = 0.3;
const ZOOM_MAX = 2;
const ZOOM_STEP = 0.1;

const ENTRY_ID = '__entry__';

let zoom = 1;
let stageSize = { width: 0, height: 0 };
let edges = [];
// Columnas ocupadas por fila, para detectar líneas que atravesarían actividades.
let occupancy = new Map();
let selectedKey = null;
let onSelectCallback = null;
let currentJourneyName = '';

/**
 * Registra los listeners de la barra del diagrama (zoom, ajustar, descargar) y del propio
 * lienzo (clic en actividad, Ctrl+rueda para zoom y arrastre para desplazarse).
 * No recibe parámetros: usa las refs de dom-elements.
 */
export function init() {
    const viewport = elements.jaCanvasViewport;
    if (!viewport) return;

    elements.jaCanvasZoomInBtn.addEventListener('click', () => setZoom(zoom + ZOOM_STEP));
    elements.jaCanvasZoomOutBtn.addEventListener('click', () => setZoom(zoom - ZOOM_STEP));
    elements.jaCanvasFitBtn.addEventListener('click', fitToViewport);
    elements.jaCanvasDownloadBtn.addEventListener('click', downloadImage);

    viewport.addEventListener('click', e => {
        const node = e.target.closest('.jc-node[data-key]');
        if (!node || viewport.dataset.panned === '1') return;
        setSelected(node.dataset.key);
        if (onSelectCallback) onSelectCallback(node.dataset.key);
    });

    // Ctrl+rueda hace zoom como en el canvas de SFMC; sin Ctrl se mantiene el scroll normal.
    viewport.addEventListener('wheel', e => {
        if (!e.ctrlKey) return;
        e.preventDefault();
        setZoom(zoom + (e.deltaY < 0 ? ZOOM_STEP : -ZOOM_STEP));
    }, { passive: false });

    enablePanning(viewport);
}

/**
 * Pinta el journey en el lienzo.
 * @param {object} journey - Definición completa del journey (activities, triggers, entryDetails).
 * @param {object} options
 * @param {Map<string, number>} options.numberMap - Numeración de actividades del flujo de texto, para que coincida con la lista.
 * @param {Function} options.getTypeLabel - Devuelve el nombre legible de un tipo de actividad.
 * @param {Function} options.onSelect - Se invoca con la key de la actividad pulsada.
 */
export function render(journey, { numberMap, getTypeLabel, onSelect }) {
    const viewport = elements.jaCanvasViewport;
    if (!viewport) return;

    onSelectCallback = onSelect;
    selectedKey = null;
    currentJourneyName = journey.name || 'journey';

    const graph = buildGraph(journey, numberMap, getTypeLabel);
    if (graph.nodes.size <= 1) {
        viewport.innerHTML = '<p class="jc-empty">El journey no tiene actividades que dibujar.</p>';
        edges = [];
        return;
    }

    layoutGraph(graph);
    edges = graph.edges;

    viewport.innerHTML = `
        <div class="jc-sizer">
            <div class="jc-stage" style="width:${stageSize.width}px; height:${stageSize.height}px;">
                <svg class="jc-lines" width="${stageSize.width}" height="${stageSize.height}"></svg>
                ${[...graph.nodes.values()].map(renderNode).join('')}
                ${graph.edges.map(renderEdgeLabel).join('')}
            </div>
        </div>`;

    drawEdges();

    // Por defecto se ve entero si cabe a lo ancho; si no, se reduce hasta el mínimo legible.
    const available = viewport.clientWidth - 2;
    setZoom(available > 0 && stageSize.width > available ? Math.max(0.6, available / stageSize.width) : 1);
}

/**
 * Marca como seleccionada una actividad (o ninguna) y resalta sus líneas de entrada y salida.
 * @param {string|null} key - Key de la actividad, o null para quitar la selección.
 */
export function setSelected(key) {
    selectedKey = key;
    const viewport = elements.jaCanvasViewport;
    if (!viewport) return;
    viewport.querySelectorAll('.jc-node.jc-selected').forEach(n => n.classList.remove('jc-selected'));
    if (key) viewport.querySelector(`.jc-node[data-key="${CSS.escape(key)}"]`)?.classList.add('jc-selected');
    drawEdges();
}

/**
 * Construye nodos y aristas a partir de la definición: entrada, actividades alcanzables
 * y un nodo de fin por cada rama que termina.
 * @param {object} journey - Definición del journey.
 * @param {Map<string, number>} numberMap - Numeración de actividades.
 * @param {Function} getTypeLabel - Traductor de tipos a nombre legible.
 * @returns {{nodes: Map, edges: Array, outEdges: Map}}
 */
function buildGraph(journey, numberMap, getTypeLabel) {
    const activities = new Map((journey.activities || []).map(a => [a.key, a]));
    const nodes = new Map();
    const edges = [];
    const outEdges = new Map();
    let endCounter = 0;

    const addEdge = (from, to, label) => {
        const edge = { from, to, label };
        edges.push(edge);
        if (!outEdges.has(from)) outEdges.set(from, []);
        outEdges.get(from).push(edge);
    };

    const addEnd = (from, label) => {
        const id = `__end__${endCounter++}`;
        nodes.set(id, { id, kind: 'end', icon: END_ICON, iconSize: END_ICON_SIZE, name: 'Fin', sub: '' });
        addEdge(from, id, label);
    };

    const trigger = journey.triggers?.[0];
    nodes.set(ENTRY_ID, {
        id: ENTRY_ID,
        kind: 'entry',
        icon: getEntryIcon(trigger?.type),
        iconSize: ICON_SIZE,
        name: journey.entryDetails?.canvasLabel || trigger?.name || 'Entrada',
        sub: trigger?.type || 'Entrada'
    });

    // El punto de inicio se resuelve igual que en el flujo de texto para que ambos coincidan.
    let startKey = trigger?.outcomes?.[0]?.next;
    if (!startKey) {
        const targetKeys = new Set((journey.activities || []).flatMap(a => (a.outcomes || []).map(o => o.next)));
        startKey = (journey.activities || []).find(a => !targetKeys.has(a.key))?.key || journey.activities?.[0]?.key;
    }
    if (!startKey || !activities.has(startKey)) return { nodes, edges, outEdges };

    addEdge(ENTRY_ID, startKey, '');

    const visit = (key) => {
        if (nodes.has(key)) return;
        const act = activities.get(key);
        const typeLabel = getTypeLabel(act.type);
        const number = numberMap?.get(key);
        nodes.set(key, {
            id: key,
            kind: 'activity',
            icon: getActivityIcon(act),
            iconSize: ICON_SIZE,
            name: act.name || typeLabel,
            sub: [number ? `#${number}` : '', getActivitySubtitle(act, typeLabel)].filter(Boolean).join(' · '),
            type: act.type
        });

        const outcomes = act.outcomes || [];
        outcomes.forEach((outcome, index) => {
            const label = outcomes.length > 1
                ? (outcome.arguments?.label || outcome.metaData?.label || outcome.metaData?.name || `Rama ${index + 1}`)
                : '';
            if (outcome.next && activities.has(outcome.next)) {
                addEdge(key, outcome.next, label);
                visit(outcome.next);
            } else {
                addEnd(key, label);
            }
        });
        if (outcomes.length === 0) addEnd(key, '');
    };
    visit(startKey);

    return { nodes, edges, outEdges };
}

/**
 * Calcula columna y fila de cada nodo, como lo coloca Journey Builder:
 * - Columna: camino más largo desde la entrada, para que las uniones queden a la derecha
 *   de todas las ramas que llegan y las líneas siempre avancen.
 * - Fila: solo la primera rama puede seguir en la fila del padre; el resto baja a filas nuevas
 *   en su orden (el Remainder, que es la última, queda siempre abajo).
 * Guarda x/y en cada nodo y el tamaño total en stageSize.
 * @param {{nodes: Map, edges: Array, outEdges: Map}} graph
 */
function layoutGraph(graph) {
    const { nodes, edges, outEdges } = graph;

    // Orden topológico (Kahn). Journey Builder no permite bucles; si apareciera alguno,
    // los nodos sin resolver se colocan tras su primer padre.
    const inDegree = new Map([...nodes.keys()].map(id => [id, 0]));
    edges.forEach(e => inDegree.set(e.to, inDegree.get(e.to) + 1));
    const column = new Map([[ENTRY_ID, 0]]);
    const queue = [...nodes.keys()].filter(id => inDegree.get(id) === 0);
    while (queue.length) {
        const id = queue.shift();
        if (!column.has(id)) column.set(id, 0);
        for (const e of outEdges.get(id) || []) {
            column.set(e.to, Math.max(column.get(e.to) ?? 0, column.get(id) + 1));
            inDegree.set(e.to, inDegree.get(e.to) - 1);
            if (inDegree.get(e.to) === 0) queue.push(e.to);
        }
    }
    edges.forEach(e => { if (!column.has(e.to)) column.set(e.to, (column.get(e.from) ?? 0) + 1); });

    const row = new Map();
    let maxRow = -1;
    const place = (id, r) => {
        if (row.has(id)) return;
        row.set(id, r);
        maxRow = Math.max(maxRow, r);
        (outEdges.get(id) || []).forEach((e, index) => {
            if (row.has(e.to)) return;
            place(e.to, index === 0 ? r : maxRow + 1);
        });
    };
    place(ENTRY_ID, 0);

    let maxCol = 0;
    occupancy = new Map();
    nodes.forEach(node => {
        node.col = column.get(node.id) ?? 0;
        node.row = row.get(node.id) ?? 0;
        maxCol = Math.max(maxCol, node.col);
        node.x = PAD + node.col * CELL_W;
        node.y = PAD + node.row * CELL_H;
        // Centro del icono: todos los iconos de una fila quedan alineados aunque cambie su tamaño.
        node.cx = node.x + CELL_W / 2;
        node.cy = node.y + ICON_SIZE / 2;
        if (!occupancy.has(node.row)) occupancy.set(node.row, new Set());
        occupancy.get(node.row).add(node.col);
    });

    edges.forEach(e => { e.source = nodes.get(e.from); e.target = nodes.get(e.to); });
    stageSize = { width: PAD * 2 + (maxCol + 1) * CELL_W, height: PAD * 2 + (maxRow + 1) * CELL_H };
}

/**
 * Devuelve el HTML de un nodo (icono, nombre y subtítulo).
 * @param {object} node - Nodo ya posicionado.
 * @returns {string}
 */
function renderNode(node) {
    const iconTop = (ICON_SIZE - node.iconSize) / 2;
    const keyAttr = node.kind === 'activity' ? `data-key="${escapeHtml(node.id)}"` : '';
    const title = [node.name, node.type || node.sub].filter(Boolean).join('\n');
    return `
        <div class="jc-node jc-${node.kind}" ${keyAttr} style="left:${node.x}px; top:${node.y}px; width:${CELL_W}px;" title="${escapeHtml(title)}">
            <img class="jc-icon" src="${ICON_BASE}${node.icon}.svg" width="${node.iconSize}" height="${node.iconSize}"
                 style="margin-top:${iconTop}px; margin-bottom:${iconTop}px;" draggable="false" alt="">
            <div class="jc-text">
                <div class="jc-name">${escapeHtml(node.name)}</div>
                ${node.sub ? `<div class="jc-sub">${escapeHtml(node.sub)}</div>` : ''}
            </div>
        </div>`;
}

/**
 * Devuelve el HTML de la etiqueta de una rama (Yes/No, porcentaje, nombre del criterio...).
 * Se coloca al inicio del tramo horizontal de la rama.
 * @param {object} edge - Arista con source/target posicionados.
 * @returns {string}
 */
function renderEdgeLabel(edge) {
    if (!edge.label) return '';
    const { label } = routeEdge(edge);
    const width = Math.max(40, label.right - label.left);
    return `<div class="jc-edge-label" style="left:${label.left}px; top:${label.top}px; max-width:${width}px;" title="${escapeHtml(edge.label)}">${escapeHtml(edge.label)}</div>`;
}

/**
 * Indica si en una fila hay actividades entre dos columnas (sin incluirlas), es decir,
 * si una línea horizontal por esa fila pasaría por encima de ellas.
 * @param {number} row - Fila a comprobar.
 * @param {number} fromCol - Columna de inicio (excluida).
 * @param {number} toCol - Columna de fin (excluida).
 * @returns {boolean}
 */
function isRowBlocked(row, fromCol, toCol) {
    const cols = occupancy.get(row);
    if (!cols) return false;
    for (const c of cols) if (c > fromCol && c < toCol) return true;
    return false;
}

/**
 * Calcula la ruta de una arista y dónde va su etiqueta. Sale del borde derecho del icono
 * origen y entra por el izquierdo del destino:
 * - Misma fila y sin actividades en medio: línea recta.
 * - Rama que baja: dobla junto al origen (tronco común, como en Journey Builder).
 * - Unión que sube: avanza por la fila del origen y dobla junto al destino.
 * Si el tramo horizontal fuera a atravesar actividades, la línea va por el pasillo libre
 * entre filas, por debajo, para no parecer que pasa por encima de otro camino.
 * @param {object} edge - Arista con source/target posicionados.
 * @returns {{d: string, label: {left: number, right: number, top: number}}}
 */
function routeEdge(edge) {
    const s = edge.source;
    const t = edge.target;
    const x1 = s.cx + s.iconSize / 2;
    const y1 = s.cy;
    const x2 = t.cx - t.iconSize / 2;
    const y2 = t.cy;
    const nearSource = x1 + BEND_OFFSET;
    const nearTarget = x2 - BEND_OFFSET;

    // Ruta por un pasillo entre filas: baja/sube junto al origen, recorre el pasillo y entra al destino.
    const viaChannel = (channelY) => ({
        points: [[x1, y1], [nearSource, y1], [nearSource, channelY], [nearTarget, channelY], [nearTarget, y2], [x2, y2]],
        label: { left: nearSource + 6, right: nearTarget - 6, top: channelY - 8 }
    });

    let route;
    if (y1 === y2) {
        route = isRowBlocked(s.row, s.col, t.col)
            ? viaChannel(y1 + CHANNEL)
            : { points: [[x1, y1], [x2, y2]], label: { left: x1 + 6, right: x2 - 6, top: y1 - 20 } };
    } else if (y2 > y1) {
        route = isRowBlocked(t.row, s.col, t.col)
            ? viaChannel(y2 - CELL_H + CHANNEL)
            : { points: [[x1, y1], [nearSource, y1], [nearSource, y2], [x2, y2]], label: { left: nearSource + 6, right: x2 - 6, top: y2 - 20 } };
    } else {
        route = isRowBlocked(s.row, s.col, t.col)
            ? viaChannel(y2 + CHANNEL)
            : { points: [[x1, y1], [nearTarget, y1], [nearTarget, y2], [x2, y2]], label: { left: x1 + 6, right: nearTarget - 6, top: y1 - 20 } };
    }
    return { d: roundedPath(route.points), label: route.label };
}

/**
 * Convierte una polilínea ortogonal en un path SVG con las esquinas redondeadas.
 * @param {Array<[number, number]>} points - Vértices de la línea.
 * @returns {string} Atributo d del path.
 */
function roundedPath(points) {
    let d = `M${points[0][0]},${points[0][1]}`;
    for (let i = 1; i < points.length - 1; i++) {
        const [px, py] = points[i - 1];
        const [cx, cy] = points[i];
        const [nx, ny] = points[i + 1];
        const r = Math.min(CORNER, Math.abs(cx - px || cy - py) / 2, Math.abs(nx - cx || ny - cy) / 2);
        d += ` L${cx - Math.sign(cx - px) * r},${cy - Math.sign(cy - py) * r}` +
             ` Q${cx},${cy} ${cx + Math.sign(nx - cx) * r},${cy + Math.sign(ny - cy) * r}`;
    }
    const last = points[points.length - 1];
    return `${d} L${last[0]},${last[1]}`;
}

/**
 * Redibuja todas las líneas del SVG, resaltando las de la actividad seleccionada.
 * No recibe parámetros: usa el estado del módulo.
 */
function drawEdges() {
    const svg = elements.jaCanvasViewport?.querySelector('.jc-lines');
    if (!svg) return;

    const paths = edges.map(edge => {
        const { d } = routeEdge(edge);
        const active = selectedKey && (edge.from === selectedKey || edge.to === selectedKey);
        return `<path d="${d}" class="jc-edge${active ? ' jc-edge-active' : ''}" marker-end="url(#jc-arrow${active ? '-active' : ''})"/>`;
    });

    // Las activas se pintan al final para que queden por encima de las demás.
    paths.sort((a, b) => a.includes('jc-edge-active') - b.includes('jc-edge-active'));

    svg.innerHTML = `
        <defs>
            <marker id="jc-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto">
                <path d="M0,1 L9,5 L0,9" class="jc-arrow"/>
            </marker>
            <marker id="jc-arrow-active" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto">
                <path d="M0,1 L9,5 L0,9" class="jc-arrow jc-arrow-active"/>
            </marker>
        </defs>
        ${paths.join('')}`;
}

/**
 * Elige el icono de una actividad según su tipo y, cuando aplica, su subtipo
 * (tipo de espera u objeto de Salesforce).
 * @param {object} act - Actividad del journey.
 * @returns {string} Ruta del icono relativa a ICON_BASE, sin extensión.
 */
function getActivityIcon(act) {
    if (act.type === 'WAIT') return WAIT_ICONS[act.metaData?.uiType] || 'flowcontrol/wait-by-duration';
    if (act.type === 'SALESCLOUDACTIVITY' || act.type === 'SALESFORCESALESCLOUDACTIVITY') {
        const objectType = getSalesforceObject(act)?.type;
        if (SALESFORCE_OBJECT_ICONS[objectType]) return SALESFORCE_OBJECT_ICONS[objectType];
    }
    return ACTIVITY_ICONS[act.type] || GENERIC_ICON;
}

/**
 * Devuelve el subtítulo de una actividad: para Sales Cloud la acción y el objeto
 * (p. ej. "Update Case"); para el resto, el nombre legible del tipo.
 * @param {object} act - Actividad del journey.
 * @param {string} typeLabel - Nombre legible del tipo.
 * @returns {string}
 */
function getActivitySubtitle(act, typeLabel) {
    const sfObject = getSalesforceObject(act);
    if (sfObject?.type) return `${sfObject.action || ''} ${sfObject.type}`.trim();
    return typeLabel;
}

/**
 * Extrae el primer objeto de Salesforce de una actividad de Sales Cloud.
 * objectMap puede venir como objeto o como JSON en texto.
 * @param {object} act - Actividad del journey.
 * @returns {{type?: string, action?: string}|null}
 */
function getSalesforceObject(act) {
    let objectMap = act.arguments?.objectMap;
    if (!objectMap) return null;
    if (typeof objectMap === 'string') {
        try { objectMap = JSON.parse(objectMap); } catch { return null; }
    }
    return objectMap?.objects?.[0] || null;
}

/**
 * Elige el icono de la fuente de entrada según el tipo de trigger.
 * @param {string} triggerType - Tipo del trigger (EmailAudience, APIEvent...).
 * @returns {string} Ruta del icono relativa a ICON_BASE, sin extensión.
 */
function getEntryIcon(triggerType = '') {
    const t = triggerType.toLowerCase();
    if (t === 'emailaudience' || t === 'automationaudience') return 'entrysources/data-extension';
    if (t.startsWith('salesforce')) return 'entrysources/salesforce-data';
    if (t.includes('cloudpage')) return 'entrysources/cloudpages';
    if (t.includes('chat')) return 'entrysources/api-inbound-chat';
    if (t.includes('inapp')) return 'entrysources/in-app-message-event';
    if (t.includes('push')) return 'entrysources/push-message-event';
    if (t.includes('mobileapp')) return 'entrysources/mobile-app-event';
    if (t.includes('audience')) return 'entrysources/audience';
    if (t === 'apievent') return 'entrysources/api-event';
    return 'entrysources/event';
}

/**
 * Aplica un nivel de zoom (limitado entre ZOOM_MIN y ZOOM_MAX) escalando el lienzo
 * y ajustando el contenedor para que las barras de scroll sigan siendo correctas.
 * @param {number} value - Zoom deseado (1 = 100%).
 */
function setZoom(value) {
    zoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round(value * 100) / 100));
    const viewport = elements.jaCanvasViewport;
    const sizer = viewport?.querySelector('.jc-sizer');
    const stage = viewport?.querySelector('.jc-stage');
    if (sizer && stage) {
        sizer.style.width = `${stageSize.width * zoom}px`;
        sizer.style.height = `${stageSize.height * zoom}px`;
        stage.style.transform = `scale(${zoom})`;
    }
    if (elements.jaCanvasZoomLabel) elements.jaCanvasZoomLabel.textContent = `${Math.round(zoom * 100)}%`;
}

/**
 * Ajusta el zoom para que el journey entero quepa en el ancho y alto visibles (sin pasar del 100%).
 * No recibe parámetros.
 */
function fitToViewport() {
    const viewport = elements.jaCanvasViewport;
    if (!viewport || !stageSize.width) return;
    const scale = Math.min(1, (viewport.clientWidth - 2) / stageSize.width, (viewport.clientHeight - 2) / stageSize.height);
    setZoom(scale);
}

/**
 * Permite desplazar el lienzo arrastrando con el ratón sobre una zona vacía.
 * Marca data-panned para que el clic que cierra un arrastre no seleccione una actividad.
 * @param {HTMLElement} viewport - Contenedor con scroll del diagrama.
 */
function enablePanning(viewport) {
    viewport.addEventListener('mousedown', e => {
        if (e.button !== 0 || e.target.closest('.jc-node')) return;
        const start = { x: e.clientX, y: e.clientY, left: viewport.scrollLeft, top: viewport.scrollTop };
        viewport.dataset.panned = '0';
        viewport.classList.add('jc-panning');

        const onMove = ev => {
            const dx = ev.clientX - start.x;
            const dy = ev.clientY - start.y;
            if (Math.abs(dx) + Math.abs(dy) > 3) viewport.dataset.panned = '1';
            viewport.scrollLeft = start.left - dx;
            viewport.scrollTop = start.top - dy;
        };
        const onUp = () => {
            viewport.classList.remove('jc-panning');
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onUp);
            setTimeout(() => { viewport.dataset.panned = '0'; }, 0);
        };
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
    });
}

/**
 * Descarga el diagrama completo como PNG a tamaño real, independientemente del zoom
 * y del scroll actuales.
 * No recibe parámetros.
 */
async function downloadImage() {
    const viewport = elements.jaCanvasViewport;
    const stage = viewport?.querySelector('.jc-stage');
    if (!stage) return ui.showCustomAlert('No hay ningún diagrama que descargar.');

    ui.blockUI('Generando imagen...');
    const previousZoom = zoom;
    const previousOverflow = viewport.style.overflow;
    const previousMaxHeight = viewport.style.maxHeight;
    try {
        // html2canvas captura lo que se ve: se quita el zoom y el recorte del contenedor durante la captura.
        setZoom(1);
        viewport.style.overflow = 'visible';
        viewport.style.maxHeight = 'none';
        const background = getComputedStyle(viewport).backgroundColor;
        const shot = await html2canvas(stage, {
            backgroundColor: background, scale: 2, useCORS: true,
            scrollX: -window.scrollX, scrollY: -window.scrollY,
            width: stageSize.width, height: stageSize.height
        });
        const a = document.createElement('a');
        a.download = `Journey_${currentJourneyName.replace(/[\\/:*?"<>|]+/g, '_')}.png`;
        a.href = shot.toDataURL('image/png');
        a.click();
    } catch (e) {
        ui.showCustomAlert(`Error al generar la imagen: ${e.message}`);
    } finally {
        viewport.style.overflow = previousOverflow;
        viewport.style.maxHeight = previousMaxHeight;
        setZoom(previousZoom);
        ui.unblockUI();
    }
}
