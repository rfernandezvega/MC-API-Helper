// Fichero: src/renderer/components/audit/cloudpages-map.js
// Descripción: Mapa de referencias entre Cloud Pages para la auditoría. Genera un SVG estático
// (se guarda tal cual en la caché de la auditoría) con las páginas que se referencian entre sí,
// agrupadas por componentes conectados y ordenadas en columnas según el sentido de la llamada.
// La interacción (resaltar las conexiones de una página) se hace por delegación desde
// audit-manager con handleCpMapClick, para que funcione también con el HTML cacheado.

import { escapeHtml } from '../../ui/format-utils.js';
import elements from '../../ui/dom-elements.js';

const NODE_W = 210;
const NODE_H = 46;
const COL_GAP = 90;
const ROW_GAP = 18;
const PAD = 20;
const COMP_GAP = 36;

// Contador para que cada mapa pintado tenga ids de marcadores únicos.
let mapCounter = 0;

/** Recorta un texto a un máximo de caracteres añadiendo puntos suspensivos. */
function truncate(text, max) {
    const t = String(text || '');
    return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

/**
 * Agrupa los nodos en componentes conectados (sin tener en cuenta el sentido de las aristas).
 * @param {string[]} ids
 * @param {Map<string,Set<string>>} neighbors
 * @returns {string[][]} Componentes ordenados de mayor a menor tamaño.
 */
function connectedComponents(ids, neighbors) {
    const seen = new Set();
    const comps = [];
    for (const id of ids) {
        if (seen.has(id)) continue;
        const comp = [];
        const stack = [id];
        seen.add(id);
        while (stack.length) {
            const u = stack.pop();
            comp.push(u);
            for (const v of neighbors.get(u) || []) {
                if (!seen.has(v)) { seen.add(v); stack.push(v); }
            }
        }
        comps.push(comp);
    }
    return comps.sort((a, b) => b.length - a.length);
}

/**
 * Asigna una columna a cada nodo de un componente: las páginas que no reciben llamadas van a la
 * izquierda y cada destino una columna a la derecha de quien lo llama (los ciclos no se repiten).
 * @param {string[]} comp
 * @param {Map<string,Set<string>>} out - Aristas salientes.
 * @param {Map<string,Set<string>>} inc - Aristas entrantes.
 * @returns {Map<string,number>} Columna de cada nodo.
 */
function assignLayers(comp, out, inc) {
    const layer = new Map();
    const bfs = (start) => {
        const queue = [start];
        while (queue.length) {
            const u = queue.shift();
            for (const v of out.get(u) || []) {
                if (!layer.has(v)) { layer.set(v, layer.get(u) + 1); queue.push(v); }
            }
        }
    };
    for (const id of comp) {
        if ((inc.get(id) || new Set()).size === 0) { layer.set(id, 0); bfs(id); }
    }
    // Nodos que solo forman parte de ciclos: se colocan junto a su predecesor ya ubicado.
    for (const id of comp) {
        if (layer.has(id)) continue;
        const prev = [...(inc.get(id) || [])].filter(p => layer.has(p)).map(p => layer.get(p));
        layer.set(id, prev.length ? Math.max(...prev) + 1 : 0);
        bfs(id);
    }
    return layer;
}

/**
 * Calcula el trazado de una flecha entre dos cajas según su posición relativa: de lado a lado si
 * el destino queda a la derecha o a la izquierda, de arriba a abajo si queda encima o debajo, y
 * por debajo de las cajas si se solapan.
 * @param {{x:number, y:number}} a - Esquina superior izquierda del origen.
 * @param {{x:number, y:number}} b - Esquina superior izquierda del destino.
 * @returns {string} Atributo d del path.
 */
function edgePath(a, b) {
    const GAP = 10;
    if (b.x >= a.x + NODE_W + GAP) {
        const sx = a.x + NODE_W, sy = a.y + NODE_H / 2, tx = b.x, ty = b.y + NODE_H / 2;
        const c = Math.max(30, (tx - sx) / 2);
        return `M${sx},${sy} C${sx + c},${sy} ${tx - c},${ty} ${tx},${ty}`;
    }
    // Las flechas hacia la izquierda o hacia arriba se desplazan un poco para no taparse con la de
    // sentido contrario cuando dos páginas se llaman entre sí.
    const OFFSET = 10;
    if (b.x + NODE_W + GAP <= a.x) {
        const sx = a.x, sy = a.y + NODE_H / 2 + OFFSET, tx = b.x + NODE_W, ty = b.y + NODE_H / 2 + OFFSET;
        const c = Math.max(30, (sx - tx) / 2);
        return `M${sx},${sy} C${sx - c},${sy} ${tx + c},${ty} ${tx},${ty}`;
    }
    if (b.y >= a.y + NODE_H + GAP) {
        const sx = a.x + NODE_W / 2, sy = a.y + NODE_H, tx = b.x + NODE_W / 2, ty = b.y;
        const c = Math.max(20, (ty - sy) / 2);
        return `M${sx},${sy} C${sx},${sy + c} ${tx},${ty - c} ${tx},${ty}`;
    }
    if (b.y + NODE_H + GAP <= a.y) {
        const sx = a.x + NODE_W / 2 + OFFSET * 2, sy = a.y, tx = b.x + NODE_W / 2 + OFFSET * 2, ty = b.y + NODE_H;
        const c = Math.max(20, (sy - ty) / 2);
        return `M${sx},${sy} C${sx},${sy - c} ${tx},${ty + c} ${tx},${ty}`;
    }
    const sx = a.x + NODE_W / 2, sy = a.y + NODE_H, tx = b.x + NODE_W / 2 + 12, ty = b.y + NODE_H;
    const drop = 36 + Math.abs(a.y - b.y) / 4;
    return `M${sx},${sy} C${sx},${sy + drop} ${tx},${ty + drop} ${tx},${ty}`;
}

/** Lee la posición de una caja del mapa desde su transform. */
function getNodePos(node) {
    const m = /translate\(\s*([-\d.]+)[ ,]+([-\d.]+)\s*\)/.exec(node.getAttribute('transform') || '');
    return m ? { x: Number(m[1]), y: Number(m[2]) } : { x: 0, y: 0 };
}

/** Coloca una caja del mapa en una posición. */
function setNodePos(node, x, y) {
    node.setAttribute('transform', `translate(${Math.round(x)},${Math.round(y)})`);
}

/**
 * Vuelve a trazar las flechas del mapa con la posición actual de las cajas.
 * @param {SVGSVGElement} svg
 * @param {string} [nodeId] - Si se indica, solo las flechas que salen o llegan a esa caja.
 */
function redrawEdges(svg, nodeId) {
    const nodeById = (id) => svg.querySelector(`.cpmap-node[data-node="${CSS.escape(id)}"]`);
    svg.querySelectorAll('.cpmap-edge').forEach(edge => {
        const from = edge.getAttribute('data-from');
        const to = edge.getAttribute('data-to');
        if (nodeId && from !== nodeId && to !== nodeId) return;
        const a = nodeById(from), b = nodeById(to);
        if (a && b) edge.setAttribute('d', edgePath(getNodePos(a), getNodePos(b)));
    });
}

/**
 * Tamaño que ocupa el contenido del mapa con las cajas en su posición actual.
 * @param {SVGSVGElement} svg
 * @returns {{w:number, h:number}}
 */
function contentSize(svg) {
    let w = 0;
    let h = 0;
    svg.querySelectorAll('.cpmap-node').forEach(n => {
        const { x, y } = getNodePos(n);
        w = Math.max(w, x + NODE_W + PAD);
        // Margen inferior para las flechas que se dibujan por debajo de las cajas.
        h = Math.max(h, y + NODE_H + PAD + 60);
    });
    return { w: w || Number(svg.dataset.w) || 0, h: h || Number(svg.dataset.h) || 0 };
}

/**
 * Ajusta el lienzo para que ocupe como mínimo todo el recuadro visible y crezca si una caja se
 * lleva más allá, de modo que no haya un borde que recorte las cajas al moverlas.
 * @param {SVGSVGElement} svg
 */
function fitSvgSize(svg) {
    const viewport = svg.closest('.cpmap-viewport');
    const { w: cw, h: ch } = contentSize(svg);
    // Un píxel menos que el recuadro para que no aparezcan barras de scroll por redondeo.
    const w = Math.max(cw, viewport ? viewport.clientWidth - 1 : 0);
    const h = Math.max(ch, viewport ? viewport.clientHeight - 6 : 0);
    svg.setAttribute('width', w);
    svg.setAttribute('height', h);
    svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
}

/**
 * Ajusta al recuadro visible los mapas de un contenedor recién pintados.
 * @param {HTMLElement} container - Elemento que contiene el mapa.
 */
export function fitCpMaps(container) {
    container?.querySelectorAll('svg.cpmap-svg').forEach(fitSvgSize);
}

/**
 * Devuelve todas las cajas a la posición que calculó el orden automático.
 * @param {SVGSVGElement} svg
 */
function resetCpMapLayout(svg) {
    svg.querySelectorAll('.cpmap-node').forEach(n => setNodePos(n, Number(n.dataset.ox) || 0, Number(n.dataset.oy) || 0));
    redrawEdges(svg);
    fitSvgSize(svg);
}

/**
 * Permite arrastrar las cajas del mapa para deshacer cruces de líneas. Se engancha por delegación
 * al contenedor, así que sirve para los mapas que se pinten después en él.
 * @param {HTMLElement} container - Elemento que contiene el mapa.
 */
export function enableCpMapDrag(container) {
    if (!container) return;
    container.addEventListener('mousedown', (e) => {
        const node = e.button === 0 ? e.target.closest('.cpmap-node') : null;
        const svg = node?.ownerSVGElement;
        if (!svg) return;
        e.preventDefault();
        const start = { x: e.clientX, y: e.clientY };
        const origin = getNodePos(node);
        const id = node.getAttribute('data-node');
        let moved = false;

        const onMove = (ev) => {
            const dx = ev.clientX - start.x;
            const dy = ev.clientY - start.y;
            if (!moved && Math.abs(dx) + Math.abs(dy) < 4) return;
            moved = true;
            svg.classList.add('is-dragging');
            setNodePos(node, Math.max(0, origin.x + dx), Math.max(0, origin.y + dy));
            redrawEdges(svg, id);
            fitSvgSize(svg);
        };
        const onUp = () => {
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onUp);
            svg.classList.remove('is-dragging');
            if (!moved) return;
            // El clic que llega tras soltar no debe seleccionar la caja.
            svg.dataset.dragged = '1';
            setTimeout(() => { delete svg.dataset.dragged; }, 0);
        };
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
    });
}

/**
 * Construye el HTML del mapa de referencias.
 * @param {Array<object>} pages - Cloud Pages implicadas (con id, name, url, assetType). Los content
 *        blocks se pasan como nodos más con isContentBlock: true.
 * @param {Array<{from:object, to:object, vias:string[]}>} edges - Referencias agregadas por par.
 * @param {Set<string>} selfRefIds - Ids de páginas que se referencian a sí mismas.
 * @param {(page:object)=>boolean} isCodeResource - Indica si una página es Code Resource.
 * @param {{outsideIds?: Set<string>, leftActionsHtml?: string}} [options] - outsideIds: páginas que
 *        se pintan atenuadas porque están fuera del filtro de la vista y solo aparecen por estar
 *        conectadas. leftActionsHtml: botones propios de quien pinta el mapa, a la izquierda de la
 *        fila de botones.
 * @returns {string} HTML con la leyenda, el SVG y la línea de información.
 */
export function buildCloudPagesMap(pages, edges, selfRefIds, isCodeResource, { outsideIds = new Set(), leftActionsHtml = '' } = {}) {
    if (edges.length === 0) {
        return '<div class="audit-metric-empty">No se han encontrado referencias entre Cloud Pages.</div>';
    }

    const byId = new Map(pages.map(p => [String(p.id), p]));
    const out = new Map();
    const inc = new Map();
    const neighbors = new Map();
    const link = (map, a, b) => { if (!map.has(a)) map.set(a, new Set()); map.get(a).add(b); };
    for (const e of edges) {
        const a = String(e.from.id);
        const b = String(e.to.id);
        link(out, a, b); link(inc, b, a);
        link(neighbors, a, b); link(neighbors, b, a);
    }

    const ids = [...neighbors.keys()];
    const positions = new Map();
    let offsetY = PAD;
    let maxCols = 1;
    for (const comp of connectedComponents(ids, neighbors)) {
        const layers = assignLayers(comp, out, inc);
        // Los content blocks van siempre en la última columna del grupo para que las flechas
        // de las páginas hacia ellos vayan hacia la derecha.
        const isBlock = (id) => !!byId.get(id)?.isContentBlock;
        if (comp.some(isBlock)) {
            const lastPageCol = Math.max(-1, ...comp.filter(id => !isBlock(id)).map(id => layers.get(id)));
            comp.filter(isBlock).forEach(id => layers.set(id, lastPageCol + 1));
        }
        const columns = new Map();
        for (const id of comp) {
            const l = layers.get(id);
            if (!columns.has(l)) columns.set(l, []);
            columns.get(l).push(id);
        }
        let maxRows = 0;
        for (const [col, list] of columns) {
            list.sort((a, b) => (byId.get(a)?.name || '').localeCompare(byId.get(b)?.name || ''));
            list.forEach((id, row) => positions.set(id, {
                x: PAD + col * (NODE_W + COL_GAP),
                y: offsetY + row * (NODE_H + ROW_GAP),
            }));
            maxRows = Math.max(maxRows, list.length);
            maxCols = Math.max(maxCols, col + 1);
        }
        offsetY += maxRows * (NODE_H + ROW_GAP) - ROW_GAP + COMP_GAP;
    }
    const width = PAD * 2 + maxCols * (NODE_W + COL_GAP) - COL_GAP;
    const height = offsetY - COMP_GAP + PAD;

    const edgesSvg = edges.map(e => {
        const d = edgePath(positions.get(String(e.from.id)), positions.get(String(e.to.id)));
        const title = `${e.from.name} → ${e.to.name} (${e.vias.join(', ')})`;
        return `<path class="cpmap-edge${e.kind === 'mention' ? ' is-mention' : ''}" data-from="${escapeHtml(String(e.from.id))}" data-to="${escapeHtml(String(e.to.id))}" d="${d}"><title>${escapeHtml(title)}</title></path>`;
    }).join('');

    const nodesSvg = ids.map(id => {
        const p = byId.get(id);
        const { x, y } = positions.get(id);
        const classes = ['cpmap-node', p.isContentBlock ? 'is-cb' : (isCodeResource(p) ? 'is-cr' : 'is-lp')];
        if (selfRefIds.has(id)) classes.push('is-self');
        if (outsideIds.has(id)) classes.push('is-outside');
        const type = p.assetType?.displayName || p.assetType?.name || '';
        const tooltip = `${p.name}\n${type}\n${p.isContentBlock ? (p.refLabel || '') : (p.url || '')}`;
        return `<g class="${classes.join(' ')}" data-node="${escapeHtml(id)}" data-name="${escapeHtml(p.name)}" data-ox="${x}" data-oy="${y}" transform="translate(${x},${y})">` +
            `<title>${escapeHtml(tooltip)}</title>` +
            `<rect width="${NODE_W}" height="${NODE_H}" rx="${p.isContentBlock ? 16 : 6}" ry="${p.isContentBlock ? 16 : 6}"></rect>` +
            `<text class="cpmap-node-name" x="10" y="19">${escapeHtml(truncate(p.name, 28))}</text>` +
            `<text class="cpmap-node-type" x="10" y="35">${escapeHtml(truncate(type, 32))}</text>` +
            `</g>`;
    }).join('');

    const legend = `<div class="cpmap-legend">
        <span class="cpmap-legend-item"><span class="cpmap-swatch is-lp"></span>Landing Page / página visual</span>
        <span class="cpmap-legend-item"><span class="cpmap-swatch is-cr"></span>Code Resource</span>
        <span class="cpmap-legend-item"><span class="cpmap-swatch is-self"></span>Se referencia a sí misma</span>
        ${pages.some(p => p.isContentBlock) ? '<span class="cpmap-legend-item"><span class="cpmap-swatch is-cb"></span>Content block</span>' : ''}
        ${outsideIds.size ? '<span class="cpmap-legend-item"><span class="cpmap-swatch is-outside"></span>Fuera del filtro (conectada)</span>' : ''}
        ${edges.some(e => e.kind === 'mention') ? '<span class="cpmap-legend-item"><span class="cpmap-line is-mention"></span>Solo mención (la URL aparece como dato o texto)</span>' : ''}
        <span class="cpmap-legend-hint">La flecha va de la página que referencia a la referenciada. Pulsa una página para resaltar sus conexiones; arrástrala para moverla.</span>
    </div>
    <div class="cpmap-actions">
        <span class="cpmap-actions-left">${leftActionsHtml}</span>
        <span class="cpmap-download-group">
            <button type="button" class="action-button cpmap-relayout" title="Devuelve las cajas a su posición calculada">Ordenar automáticamente</button>
            <button type="button" class="action-button cpmap-download" data-format="svg">Descargar SVG</button>
            <button type="button" class="action-button cpmap-download" data-format="png">Descargar PNG</button>
        </span>
    </div>`;

    // Ids propios de cada mapa: si hay varios en la página (p. ej. una auditoría antigua oculta),
    // las flechas tomarían las puntas del primero y no se verían.
    const uid = ++mapCounter;
    return `${legend}
        <div class="cpmap-viewport">
            <svg class="cpmap-svg" style="--cpmap-arrow: url(#cpmap-arrow-${uid}); --cpmap-arrow-hl: url(#cpmap-arrow-hl-${uid});" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" data-w="${width}" data-h="${height}" xmlns="http://www.w3.org/2000/svg">
                <defs>
                    <marker id="cpmap-arrow-${uid}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path class="cpmap-arrow" d="M0,0 L10,5 L0,10 z"></path></marker>
                    <marker id="cpmap-arrow-hl-${uid}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path class="cpmap-arrow-hl" d="M0,0 L10,5 L0,10 z"></path></marker>
                </defs>
                <g class="cpmap-edges">${edgesSvg}</g>
                <g class="cpmap-nodes">${nodesSvg}</g>
            </svg>
        </div>
        <div class="cpmap-info">Pulsa una página del mapa para ver a qué páginas llama y desde cuáles la llaman.</div>`;
}

/**
 * Gestiona los clics dentro del mapa (delegado desde audit-manager): resalta la página pulsada,
 * sus conexiones y resume en la línea de información a quién llama y quién la llama. Un clic en
 * el fondo o en la misma página limpia la selección.
 * @param {MouseEvent} event
 * @returns {boolean} true si el clic era del mapa.
 */
export function handleCpMapClick(event) {
    const relayoutBtn = event.target.closest?.('.cpmap-relayout');
    if (relayoutBtn) {
        const mapSvg = relayoutBtn.closest('.cpmap-actions')?.nextElementSibling?.querySelector('svg.cpmap-svg');
        if (mapSvg) resetCpMapLayout(mapSvg);
        return true;
    }

    const downloadBtn = event.target.closest?.('.cpmap-download');
    if (downloadBtn) {
        const mapSvg = downloadBtn.closest('.cpmap-actions')?.nextElementSibling?.querySelector('svg.cpmap-svg');
        if (mapSvg) downloadCpMap(mapSvg, downloadBtn.getAttribute('data-format'));
        return true;
    }

    const svg = event.target.closest?.('svg.cpmap-svg');
    if (!svg) return false;
    // El clic que cierra un arrastre no cambia la selección.
    if (svg.dataset.dragged === '1') return true;

    const clearAll = () => {
        svg.classList.remove('has-active');
        svg.querySelectorAll('.is-hl, .is-active').forEach(el => el.classList.remove('is-hl', 'is-active'));
    };
    const info = svg.closest('.cpmap-viewport')?.nextElementSibling;
    const node = event.target.closest('.cpmap-node');

    if (!node || node.classList.contains('is-active')) {
        clearAll();
        if (info) info.textContent = 'Pulsa una página del mapa para ver a qué páginas llama y desde cuáles la llaman.';
        return true;
    }

    clearAll();
    const id = node.getAttribute('data-node');
    const nameOf = (nid) => svg.querySelector(`.cpmap-node[data-node="${CSS.escape(nid)}"]`)?.getAttribute('data-name') || nid;
    const calls = [];
    const callers = [];
    svg.classList.add('has-active');
    node.classList.add('is-active');
    svg.querySelectorAll('.cpmap-edge').forEach(edge => {
        const from = edge.getAttribute('data-from');
        const to = edge.getAttribute('data-to');
        if (from !== id && to !== id) return;
        edge.classList.add('is-hl');
        const other = from === id ? to : from;
        svg.querySelector(`.cpmap-node[data-node="${CSS.escape(other)}"]`)?.classList.add('is-hl');
        (from === id ? calls : callers).push(nameOf(other));
    });

    if (info && node.classList.contains('is-cb')) {
        info.innerHTML = `<b>${escapeHtml(node.getAttribute('data-name'))}</b> — ` +
            `usado por ${callers.length} Cloud Page${callers.length === 1 ? '' : 's'}: ${escapeHtml(callers.join(', '))}`;
    } else if (info) {
        info.innerHTML = `<b>${escapeHtml(node.getAttribute('data-name'))}</b> — ` +
            `referencia a: ${calls.length ? escapeHtml(calls.join(', ')) : 'ninguna'} · ` +
            `referenciada desde: ${callers.length ? escapeHtml(callers.join(', ')) : 'ninguna'}`;
    }
    return true;
}

// --- Descarga del mapa ---

// Propiedades de estilo que se copian al SVG exportado: fuera de la app no llegan las reglas CSS.
const EXPORT_STYLE_PROPS = ['fill', 'stroke', 'stroke-width', 'stroke-dasharray', 'opacity', 'font-family', 'font-size', 'font-weight', 'marker-end'];
const COLOR_PROPS = new Set(['fill', 'stroke']);

/**
 * Convierte cualquier color CSS (incluidos color-mix y variables ya resueltas) a rgba(), que
 * entienden todos los visores de SVG. Pinta un píxel en un canvas y lee su valor.
 * @param {string} value - Color calculado por el navegador.
 * @param {CanvasRenderingContext2D} ctx - Contexto 1x1 reutilizable.
 * @param {Map<string,string>} cache - Colores ya convertidos.
 * @returns {string}
 */
function toRgba(value, ctx, cache) {
    if (!value || value === 'none' || value.startsWith('url(')) return value;
    if (cache.has(value)) return cache.get(value);
    ctx.clearRect(0, 0, 1, 1);
    ctx.fillStyle = '#000';
    ctx.fillStyle = value;
    ctx.fillRect(0, 0, 1, 1);
    const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
    const rgba = `rgba(${r},${g},${b},${+(a / 255).toFixed(3)})`;
    cache.set(value, rgba);
    return rgba;
}

/**
 * Genera el texto de un SVG autónomo a partir del mapa pintado: copia los estilos calculados en
 * línea, añade el fondo y quita la selección activa para exportar el mapa completo.
 * @param {SVGSVGElement} svg - SVG del mapa en pantalla.
 * @returns {{text:string, width:number, height:number}}
 */
function serializeCpMap(svg) {
    // La selección atenúa nodos; se quita durante la copia y se restaura después.
    const selected = [...svg.querySelectorAll('.is-hl, .is-active')].map(el => [el, el.getAttribute('class')]);
    const hadActive = svg.classList.contains('has-active');
    svg.classList.remove('has-active');
    selected.forEach(([el]) => el.classList.remove('is-hl', 'is-active'));

    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 1;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    const cache = new Map();

    const clone = svg.cloneNode(true);
    const originals = [svg, ...svg.querySelectorAll('*')];
    const copies = [clone, ...clone.querySelectorAll('*')];
    originals.forEach((el, i) => {
        const cs = getComputedStyle(el);
        const style = EXPORT_STYLE_PROPS
            .map(prop => {
                const v = cs.getPropertyValue(prop);
                if (!v || (prop === 'marker-end' && v === 'none')) return '';
                return `${prop}:${COLOR_PROPS.has(prop) ? toRgba(v, ctx, cache) : v}`;
            })
            .filter(Boolean).join(';');
        copies[i].setAttribute('style', style);
        copies[i].removeAttribute('class');
    });

    if (hadActive) svg.classList.add('has-active');
    selected.forEach(([el, cls]) => el.setAttribute('class', cls));

    // La imagen se ajusta al contenido, no al tamaño del recuadro de la pantalla.
    const { w: width, h: height } = contentSize(svg);
    clone.setAttribute('width', width);
    clone.setAttribute('height', height);
    clone.setAttribute('viewBox', `0 0 ${width} ${height}`);
    const bgSource = svg.closest('.cpmap-viewport') || svg;
    const bg = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    bg.setAttribute('width', '100%');
    bg.setAttribute('height', '100%');
    bg.setAttribute('fill', toRgba(getComputedStyle(bgSource).backgroundColor, ctx, cache));
    clone.insertBefore(bg, clone.firstChild);
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');

    return { text: '<?xml version="1.0" encoding="UTF-8"?>\n' + new XMLSerializer().serializeToString(clone), width, height };
}

/** Lanza la descarga de un fichero a partir de una URL (blob o data). */
function triggerDownload(href, fileName) {
    const a = document.createElement('a');
    a.href = href;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
}

/**
 * Descarga el mapa de referencias como SVG o como PNG (a doble resolución), con los colores
 * del tema activo y sin la página seleccionada resaltada.
 * @param {SVGSVGElement} svg - SVG del mapa en pantalla.
 * @param {'svg'|'png'} format - Formato de descarga.
 */
function downloadCpMap(svg, format) {
    const { text, width, height } = serializeCpMap(svg);
    const context = (elements.clientNameInput?.value || '').trim();
    const baseName = `Mapa_referencias_CloudPages${context ? '_' + context : ''}`.replace(/[\/:*?"<>|]+/g, '_');
    const svgUrl = URL.createObjectURL(new Blob([text], { type: 'image/svg+xml;charset=utf-8' }));

    if (format !== 'png') {
        triggerDownload(svgUrl, `${baseName}.svg`);
        setTimeout(() => URL.revokeObjectURL(svgUrl), 1000);
        return;
    }

    const img = new Image();
    img.onload = () => {
        const scale = 2;
        const canvas = document.createElement('canvas');
        canvas.width = Math.ceil(width * scale);
        canvas.height = Math.ceil(height * scale);
        const ctx = canvas.getContext('2d');
        ctx.scale(scale, scale);
        ctx.drawImage(img, 0, 0, width, height);
        URL.revokeObjectURL(svgUrl);
        triggerDownload(canvas.toDataURL('image/png'), `${baseName}.png`);
    };
    img.onerror = () => URL.revokeObjectURL(svgUrl);
    img.src = svgUrl;
}
