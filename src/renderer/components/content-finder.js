// Fichero: src/renderer/components/content-finder.js
import * as mcApiService from '../api/mc-api-service.js';
import elements from '../ui/dom-elements.js';
import * as ui from '../ui/ui-helpers.js';
import * as logger from '../ui/logger.js';
import { formatCodeWithIndentation, highlightCloudPageCode } from '../ui/code-utils.js';
import { escapeHtml } from '../ui/format-utils.js';
import { downloadCsv, buildCsvFileName } from '../ui/csv-export.js';

// --- 1. ESTADO ---
let getAuthenticatedConfig;
let cachedResults = [];
let selectedAssetId = null;

// Tope de anidamiento al expandir componentes. Junto al registro de assets ya visitados
// evita que una referencia circular (A incluye B y B incluye A) recorra sin fin.
const MAX_COMPONENT_DEPTH = 10;

let currentDetailAsset = null;
let currentDetailComponents = [];

let currentDrawerContent = null;

// --- 2. INIT ---
export function init(dependencies) {
    getAuthenticatedConfig = dependencies.getAuthenticatedConfig;
    elements.searchContentBtn.addEventListener('click', searchContent);
    elements.contentDetailBtn.addEventListener('click', showContentDetail);
    elements.downloadContentSearchCsvBtn?.addEventListener('click', downloadResultsCsv);

    elements.contentSearchResultsTbody.addEventListener('click', (e) => {
        const row = e.target.closest('tr');
        if (!row || !row.dataset.assetId) return;
        elements.contentSearchResultsTbody.querySelectorAll('tr').forEach(r => r.classList.remove('selected'));
        row.classList.add('selected');
        selectedAssetId = row.dataset.assetId;
        elements.contentDetailBtn.disabled = false;
    });

    // Click en botón de código dentro de la tabla de componentes
    elements.contentComponentsWrapper.addEventListener('click', (e) => {
        const btn = e.target.closest('.cp-inspect-btn');
        if (!btn) return;
        const index = parseInt(btn.dataset.compIndex, 10);
        if (isNaN(index) || !currentDetailComponents[index]) return;
        openFinderCodeDrawer(currentDetailComponents[index]);
    });

    // Drawer de código
    const closeFinderDrawer = () => {
        elements.finderCodeDrawer.classList.remove('open');
        elements.finderCodeBackdrop.classList.remove('active');
    };
    elements.finderCodeCloseBtn.addEventListener('click', closeFinderDrawer);
    elements.finderCodeBackdrop.addEventListener('click', closeFinderDrawer);
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && elements.finderCodeDrawer.classList.contains('open')) {
            closeFinderDrawer();
        }
    });

    elements.finderCodeDownloadBtn.addEventListener('click', () => {
        const clientName = elements.clientNameInput.value.trim() || 'cliente';
        const contentName = (elements.finderCodeTitle.textContent || 'contenido').replace(/\s+/g, '_');
        if (!currentDrawerContent) return;
        const blob = new Blob([currentDrawerContent], { type: 'text/html;charset=utf-8;' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `${clientName}_${contentName}.html`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(a.href);
    });
}

// --- 3. BÚSQUEDA ---
async function searchContent() {
    ui.blockUI("Buscando contenidos...");
    logger.startLogBuffering();
    elements.contentSearchResultsTbody.innerHTML = '<tr><td colspan="4">Buscando...</td></tr>';
    elements.contentDetailBlock.style.display = 'none';
    elements.contentDetailBtn.disabled = true;
    selectedAssetId = null;
    cachedResults = [];
    if (elements.downloadContentSearchCsvBtn) elements.downloadContentSearchCsvBtn.disabled = true;

    try {
        const apiConfig = await getAuthenticatedConfig();
        mcApiService.setLogger(logger);
        // Cada búsqueda pide las rutas de nuevo: nunca se muestra una carpeta ya movida.
        mcApiService.clearFolderPathCache();
        const value = elements.contentSearchValue.value.trim();
        if (!value) throw new Error("El campo de búsqueda no puede estar vacío.");

        const contentList = await mcApiService.searchContentAssets(value, apiConfig);
        if (contentList.length === 0) { cachedResults = []; renderTable([]); return; }

        logger.logMessage(`Se encontraron ${contentList.length} contenidos. Obteniendo rutas...`);
        // Rutas en bloque: una llamada por nivel del árbol en lugar de una cadena por asset.
        const paths = await mcApiService.resolveFolderPaths(
            contentList.map(asset => asset.category?.id).filter(Boolean),
            apiConfig
        );
        const enriched = contentList.map(asset => ({
            id: asset.id,
            name: asset.name,
            type: asset.assetType.displayName,
            assetTypeId: asset.assetType.id,
            path: paths.get(String(asset.category?.id)) || 'Content Builder'
        }));
        cachedResults = enriched;
        renderTable(enriched);
    } catch (error) {
        logger.logMessage(`Error: ${error.message}`);
        elements.contentSearchResultsTbody.innerHTML = `<tr><td colspan="4" style="color:red;">Error: ${error.message}</td></tr>`;
    } finally { ui.unblockUI(); logger.endLogBuffering(); }
}

// --- 4. DETALLE ---
async function showContentDetail() {
    if (!selectedAssetId) return;
    const selected = cachedResults.find(r => String(r.id) === String(selectedAssetId));
    if (!selected) return;

    ui.blockUI(`Analizando "${selected.name}"...`);
    logger.startLogBuffering();
    mcApiService.setLogger(logger);

    try {
        const apiConfig = await getAuthenticatedConfig();
        // El detalle es una operación completa: rutas y assets se piden frescos.
        mcApiService.clearFolderPathCache();
        const context = { assets: new Map(), expanded: new Set() };

        logger.logMessage(`Obteniendo detalle completo del asset ${selected.id}...`);
        const fullAsset = await fetchAssetOnce(selected.id, apiConfig, context);

        // 1. Componentes hijos (slots/blocks) + ContentBlockBy* en código
        const components = await extractComponents(fullAsset, apiConfig, 0, null, context);

        // Contenido principal: intentar ensamblar (emails), luego push/sms/wa, luego content directo
        let mainContent = assembleFullContent(fullAsset, components) || null;

        // Push / SMS / WhatsApp → mensaje del customBlockData
        if (!mainContent) {
            const viewKeys = Object.keys(fullAsset.views || {});
            const findView = (name) => viewKeys.find(k => k.toLowerCase() === name.toLowerCase());
            const pushKey = findView('push');
            const smsKey = findView('sms') || findView('sMS');
            const waKey = findView('whatsAppTemplate') || findView('whatsapptemplate');
            const viewKey = pushKey || smsKey || waKey;

            if (viewKey) {
                mainContent = fullAsset.views[viewKey]?.meta?.options?.customBlockData?.['display:message']
                    || fullAsset.views[viewKey]?.content
                    || null;
            }
        }

        // Fallback: content directo (templates, bloques, snippets, otros)
        if (!mainContent) {
            mainContent = fullAsset.content || null;
        }

        if (mainContent) {
            components.unshift({
                id: fullAsset.id,
                name: fullAsset.name,
                rawName: fullAsset.name,
                type: selected.type,
                path: selected.path,
                content: mainContent,
                referencedBy: null,
                depth: 0
            });
        }

        // 2. DEs referenciadas, con indicación de qué bloque las usa
        const allContentSources = collectContentSources(fullAsset, components);
        const referencedDEs = extractDataExtensionsWithSource(allContentSources);

        // 3. Renderizar
        elements.contentDetailTitle.textContent = `Detalle: ${selected.name} (${selected.type})`;

        // Árbol
        renderTree(selected, components);

        // Componentes
        const componentsHtml = buildComponentsTable(components);
        elements.contentComponentsWrapper.innerHTML = createCollapsibleBlock(
            `Componentes (${components.length})`,
            componentsHtml,
            'content-components',
            false,
            500
        );

        // Data Extensions
        const desHtml = buildDEsTable(referencedDEs);
        elements.contentDesWrapper.innerHTML = createCollapsibleBlock(
            `Data Extensions referenciadas (${referencedDEs.length})`,
            desHtml,
            'content-des',
            false,
            400
        );
        
        // Activar todos los collapsibles
        initCollapsibleListeners(elements.contentDetailBlock);
        elements.contentDetailBlock.style.display = '';

        // Guardar datos para el drawer de código
        currentDetailAsset = fullAsset;
        currentDetailComponents = components;

    } catch (error) {
        logger.logMessage(`Error en detalle: ${error.message}`);
        ui.showCustomAlert(`Error: ${error.message}`);
    } finally { ui.unblockUI(); logger.endLogBuffering(); }
}

/**
 * Descarga un asset reutilizando los ya obtenidos en este detalle, porque un mismo bloque
 * suele estar referenciado desde varios slots y antes se pedía una vez por referencia.
 * @param {string|number} assetId - ID del asset.
 * @param {object} apiConfig - Configuración autenticada de la API.
 * @param {object} context - Contexto del detalle en curso ({ assets, expanded }).
 * @returns {Promise<object>} El asset completo.
 */
async function fetchAssetOnce(assetId, apiConfig, context) {
    const key = String(assetId);
    if (context.assets.has(key)) return context.assets.get(key);

    // Se guarda la promesa, no el resultado, para que dos referencias simultáneas
    // al mismo bloque compartan una única petición.
    const promise = mcApiService.fetchAssetById(assetId, apiConfig);
    context.assets.set(key, promise);
    return promise;
}

/**
 * Extrae componentes hijos: recorre slots/blocks y detecta ContentBlockBy* en código.
 * @param {object} asset - Asset del que se extraen los componentes.
 * @param {object} apiConfig - Configuración autenticada de la API.
 * @param {number} depth - Nivel de anidamiento actual.
 * @param {string} [parentName] - Nombre del componente que lo referencia.
 * @param {object} context - Contexto del detalle en curso ({ assets, expanded }).
 * @returns {Promise<Array>} Lista plana de componentes encontrados.
 */
async function extractComponents(asset, apiConfig, depth, parentName, context) {
    const components = [];

    if (depth >= MAX_COMPONENT_DEPTH) return components;

    // Un asset se expande una sola vez: si vuelve a aparecer se sigue listando como
    // componente, pero no se recorren otra vez sus hijos.
    const assetKey = String(asset.id ?? '');
    if (assetKey && context.expanded.has(assetKey)) return components;
    if (assetKey) context.expanded.add(assetKey);

    // A. Template (obtener detalle completo para tener content y ruta)
    const templateId = asset.views?.html?.template?.id;
    const templateName = asset.views?.html?.template?.name;
    if (templateName && depth === 0 && templateId) {
        try {
            logger.logMessage(`→ Obteniendo template ${templateId}...`);
            const templateAsset = await fetchAssetOnce(templateId, apiConfig, context);
            const templatePath = templateAsset.category?.id
                ? await mcApiService.getFolderPath(templateAsset.category.id, apiConfig) : '---';
            components.push({
                id: templateId,
                name: templateName,
                rawName: templateName,
                customerKey: templateAsset.customerKey || null,
                type: 'Template',
                path: templatePath || 'Content Builder',
                content: templateAsset.content || null,
                referencedBy: null,
                depth: 0
            });
        } catch (err) {
            logger.logMessage(`✗ Error obteniendo template ${templateId}: ${err.message}`);
            components.push({
                id: templateId || '---',
                name: templateName,
                rawName: templateName,
                customerKey: null,
                type: 'Template',
                path: '---',
                content: null,
                referencedBy: null,
                depth: 0
            });
        }
    }

    // B. Slots / Blocks
    const slots = asset.views?.html?.slots;
    if (slots) {
        for (const slotKey in slots) {
            const slot = slots[slotKey];
            const blocks = slot.blocks;
            if (!blocks) continue;

            let slotLabel = '';
            if (slot.design) {
                const match = slot.design.match(/<p[^>]*>(.*?)<\/p>/i);
                if (match && match[1]) slotLabel = match[1].trim();
            }

            for (const blockKey in blocks) {
                const block = blocks[blockKey];
                const refId = block.meta?.options?.id;
                const blockType = block.assetType?.displayName || block.assetType?.name || '---';

                if (refId) {
                    // Reference block → fetch the referenced asset
                    try {
                        logger.logMessage(`${'  '.repeat(depth)}→ Obteniendo componente ID ${refId}...`);
                        const childAsset = await fetchAssetOnce(refId, apiConfig, context);
                        const childPath = childAsset.category?.id
                            ? await mcApiService.getFolderPath(childAsset.category.id, apiConfig) : '---';

                        components.push({
                            id: refId,
                            name: childAsset.name || '---',
                            rawName: childAsset.name || '---',
                            customerKey: childAsset.customerKey || null,
                            type: childAsset.assetType?.displayName || blockType,
                            path: childPath || 'Content Builder',
                            content: childAsset.content || null,
                            referencedBy: parentName || (slotLabel ? `Slot: ${slotLabel}` : null),
                            depth: depth
                        });

                        const subComps = await extractComponents(childAsset, apiConfig, depth + 1, childAsset.name, context);
                        components.push(...subComps);

                    } catch (err) {
                        logger.logMessage(`${'  '.repeat(depth)}✗ Error obteniendo asset ${refId}: ${err.message}`);
                        components.push({ id: refId, name: `Error (${refId})`, rawName: `Error (${refId})`, customerKey: null, type: blockType, path: '---', content: null, referencedBy: parentName, depth: depth });
                    }

                } else if (block.content) {
                    // Inline block → content embedded directly in the slot
                    const inlineId = block.id || '---';
                    const inlineName = block.name || block.fileProperties?.fileName || `Bloque inline (${blockKey})`;
                    let inlinePath = '---';

                    if (block.category?.id) {
                        try {
                            inlinePath = await mcApiService.getFolderPath(block.category.id, apiConfig);
                        } catch {}
                    }

                    components.push({
                        id: inlineId,
                        name: inlineName,
                        rawName: inlineName,
                        customerKey: block.customerKey || null,
                        type: blockType,
                        path: inlinePath || 'Content Builder',
                        content: block.content,
                        referencedBy: parentName || (slotLabel ? `Slot: ${slotLabel}` : null),
                        depth: depth
                    });
                }
            }
        }
    }

    // C. ContentBlockBy* en código
    const codeContent = asset.content || asset.views?.html?.content || '';
    if (codeContent) {
        const codeRefs = extractContentBlockReferences(codeContent);
        for (const ref of codeRefs) {
            try {
                let resolvedAsset = null;
                const sourceName = parentName || asset.name;

                if (ref.type === 'Id') {
                    logger.logMessage(`${'  '.repeat(depth)}→ Resolviendo ContentBlockById(${ref.value})...`);
                    resolvedAsset = await fetchAssetOnce(ref.value, apiConfig, context);
                } else if (ref.type === 'Key' || ref.type === 'Name') {
                    logger.logMessage(`${'  '.repeat(depth)}→ Resolviendo ContentBlockBy${ref.type}("${ref.value}")...`);
                    const results = await mcApiService.searchContentAssets(ref.value, apiConfig);
                    if (results.length > 0) resolvedAsset = await fetchAssetOnce(results[0].id, apiConfig, context);
                }

                if (resolvedAsset) {
                    const refPath = resolvedAsset.category?.id
                        ? await mcApiService.getFolderPath(resolvedAsset.category.id, apiConfig) : '---';
                    components.push({
                        id: resolvedAsset.id,
                        name: resolvedAsset.name,
                        rawName: resolvedAsset.name,
                        customerKey: resolvedAsset.customerKey || null,
                        type: resolvedAsset.assetType?.displayName || '---',
                        path: refPath || 'Content Builder',
                        content: resolvedAsset.content || null,
                        referencedBy: `${sourceName} → ContentBlockBy${ref.type}`,
                        depth: depth + 1
                    });
                    const subComps = await extractComponents(resolvedAsset, apiConfig, depth + 2, resolvedAsset.name, context);
                    components.push(...subComps);
                } else {
                    components.push({
                        id: '---', name: `${ref.value} (no encontrado)`, rawName: ref.value,
                        customerKey: null,
                        type: `ContentBlockBy${ref.type}`, path: '---', content: null,
                        referencedBy: `${sourceName} → ContentBlockBy${ref.type}`, depth: depth + 1
                    });
                }
            } catch (err) {
                logger.logMessage(`${'  '.repeat(depth)}✗ Error resolviendo ContentBlockBy${ref.type}(${ref.value}): ${err.message}`);
            }
        }
    }

    return components;
}

/**
 * Detecta referencias ContentBlockById/Key/Name en código AMPscript/SSJS.
 */
function extractContentBlockReferences(code) {
    const refs = [];
    const patterns = [
        { regex: /ContentBlockBy[Ii][Dd]\s*\(\s*["']?(\d+)["']?\s*\)/gi, type: 'Id' },
        { regex: /ContentBlockBy[Kk]ey\s*\(\s*["']([^"']+)["']\s*\)/gi, type: 'Key' },
        { regex: /ContentBlockBy[Nn]ame\s*\(\s*["']([^"']+)["']\s*\)/gi, type: 'Name' }
    ];
    const seen = new Set();
    patterns.forEach(p => {
        let m;
        while ((m = p.regex.exec(code)) !== null) {
            const key = `${p.type}:${m[1]}`;
            if (!seen.has(key)) { seen.add(key); refs.push({ type: p.type, value: m[1] }); }
        }
    });
    return refs;
}

// --- 5. DATA EXTENSIONS CON FUENTE ---

/**
 * Recopila el contenido textual asociando cada trozo a su componente de origen.
 */
function collectContentSources(mainAsset, components) {
    const sources = [];
    const mainContent = [mainAsset.content, mainAsset.views?.html?.content].filter(Boolean).join('\n');
    if (mainContent) sources.push({ sourceName: mainAsset.name, content: mainContent });
    components.forEach(c => {
        if (c.content) sources.push({ sourceName: c.rawName || c.name, content: c.content });
    });
    return sources;
}

/**
 * Extrae DEs con indicación de qué componente las referencia.
 */
function extractDataExtensionsWithSource(contentSources) {
    const deMap = {};

    const ampFns = [
        'Lookup', 'LookupRows', 'LookupOrderedRows', 'LookupRowsCS', 'LookupOrderedRowsCS',
        'ClaimRow', 'InsertDE', 'InsertData', 'UpdateDE', 'UpdateData',
        'DeleteDE', 'DeleteData', 'UpsertDE', 'UpsertData', 'DataExtensionRowCount'
    ];
    const ssjsFns = [
        'Platform\\.Function\\.Lookup', 'Platform\\.Function\\.LookupRows',
        'Platform\\.Function\\.LookupOrderedRows', 'Platform\\.Function\\.InsertData',
        'Platform\\.Function\\.UpdateData', 'Platform\\.Function\\.DeleteData',
        'Platform\\.Function\\.UpsertData', 'DataExtension\\.Init'
    ];

    contentSources.forEach(({ sourceName, content }) => {
        ampFns.forEach(fn => {
            const regex = new RegExp(fn + '\\s*\\(\\s*["\']([^"\']+)["\']', 'gi');
            let m;
            while ((m = regex.exec(content)) !== null) {
                const de = m[1].trim();
                if (!deMap[de]) deMap[de] = { functions: new Set(), sources: new Set() };
                deMap[de].functions.add(fn);
                deMap[de].sources.add(sourceName);
            }
        });
        ssjsFns.forEach(pattern => {
            const label = pattern.replace(/\\\./g, '.');
            const regex = new RegExp(pattern + '\\s*\\(\\s*["\']([^"\']+)["\']', 'gi');
            let m;
            while ((m = regex.exec(content)) !== null) {
                const de = m[1].trim();
                if (!deMap[de]) deMap[de] = { functions: new Set(), sources: new Set() };
                deMap[de].functions.add(label);
                deMap[de].sources.add(sourceName);
            }
        });
    });

    return Object.entries(deMap)
        .map(([deName, info]) => ({ deName, functions: [...info.functions].join(', '), sources: [...info.sources].join(', ') }))
        .sort((a, b) => a.deName.localeCompare(b.deName));
}

// --- 6. HELPERS DE COLLAPSIBLES ---

/**
 * Crea un bloque colapsable con el estilo del analyzer.
 * @param {string} title - Título del bloque.
 * @param {string} innerHtml - Contenido HTML interno.
 * @param {string} id - ID único para el contenedor.
 * @param {boolean} expanded - Si se muestra abierto por defecto.
 * @param {number} [maxHeight] - Altura máxima del contenido en px (para scroll). 0 = sin límite.
 */
function createCollapsibleBlock(title, innerHtml, id, expanded, maxHeight) {
    const scrollStyle = maxHeight ? `max-height:${maxHeight}px; overflow-y:auto;` : '';
    return `
        <div id="container-${id}" style="margin-bottom:10px; border-radius:4px;">
            <div class="content-collapsible-header" style="
                background-color:${expanded ? 'var(--sf-blue)' : 'var(--sf-bg-alt)'};
                color:${expanded ? '#fff' : 'var(--sf-text-soft)'};
                padding:12px 15px; cursor:pointer; display:flex;
                justify-content:space-between; align-items:center;
                font-weight:bold; border:1px solid ${expanded ? 'var(--sf-blue)' : 'var(--sf-border)'}; border-radius:4px 4px 0 0;
                user-select:none; transition:background-color 0.2s;">
                <span>${title}</span>
                <span style="font-size:0.8em;">${expanded ? '▼' : '▶'}</span>
            </div>
            <div class="content-collapsible-body" style="
                display:${expanded ? 'block' : 'none'};
                background:var(--sf-surface);
                border:1px solid var(--sf-border); border-top:none;
                border-radius:0 0 4px 4px; ${scrollStyle}">
                ${innerHtml}
            </div>
        </div>
    `;
}

/**
 * Activa los listeners de clic para collapsibles dentro de un contenedor.
 */
function initCollapsibleListeners(container) {
    container.querySelectorAll('.content-collapsible-header').forEach(header => {
        header.onclick = function () {
            const body = this.nextElementSibling;
            const icon = this.querySelector('span:last-child');
            const isOpen = body.style.display !== 'none';

            if (isOpen) {
                body.style.display = 'none';
                this.style.backgroundColor = 'var(--sf-bg-alt)';
                this.style.color = 'var(--sf-text-soft)';
                this.style.borderColor = 'var(--sf-border)';
                icon.textContent = '▶';
            } else {
                body.style.display = 'block';
                this.style.backgroundColor = 'var(--sf-blue)';
                this.style.color = '#fff';
                this.style.borderColor = 'var(--sf-blue)';
                icon.textContent = '▼';
            }
        };
    });
}

// --- 7. RENDERIZADO ---

/** Descarga en CSV los contenidos encontrados, en el mismo orden que la tabla. */
function downloadResultsCsv() {
    downloadCsv({
        headers: ['ID', 'Nombre del Contenido', 'Tipo', 'Ruta de Carpeta'],
        rows: cachedResults.map(r => [r.id, r.name, r.type, r.path]),
        fileName: buildCsvFileName('buscador_contenidos')
    });
}

function renderTable(results) {
    elements.contentSearchResultsTbody.innerHTML = '';
    if (elements.downloadContentSearchCsvBtn) {
        elements.downloadContentSearchCsvBtn.disabled = !results || results.length === 0;
    }
    if (!results || results.length === 0) {
        elements.contentSearchResultsTbody.innerHTML = '<tr><td colspan="4">No se encontraron contenidos.</td></tr>';
        return;
    }
    results.sort((a, b) => (a.path + a.name).localeCompare(b.path + b.name));
    results.forEach(r => {
        const row = elements.contentSearchResultsTbody.insertRow();
        row.dataset.assetId = r.id;
        row.style.cursor = 'pointer';
        row.innerHTML = `<td>${r.id}</td><td>${r.name}</td><td>${r.type}</td><td>${r.path}</td>`;
    });
}

/**
 * Genera un árbol visual de la estructura del contenido.
 */
function renderTree(rootAsset, components) {
    const lines = [];
    lines.push(`${rootAsset.name} (${rootAsset.type})`);

    const topLevel = [];
    let currentParent = null;
    components.forEach(c => {
        if (c.depth === 0) {
            topLevel.push({ ...c, children: [] });
            currentParent = topLevel[topLevel.length - 1];
        } else if (currentParent) {
            currentParent.children.push(c);
        }
    });

    topLevel.forEach((comp, idx) => {
        const isLast = idx === topLevel.length - 1;
        const prefix = isLast ? '└── ' : '├── ';
        const ref = comp.referencedBy ? ` [${comp.referencedBy}]` : '';
        lines.push(`${prefix}${comp.name} (${comp.type})${ref}`);

        if (comp.children.length > 0) {
            comp.children.forEach((child, childIdx) => {
                const childIsLast = childIdx === comp.children.length - 1;
                const childConnector = isLast ? '    ' : '│   ';
                const childPrefix = childIsLast ? '└── ' : '├── ';
                const childRef = child.referencedBy ? ` [${child.referencedBy}]` : '';
                lines.push(`${childConnector}${childPrefix}${child.name} (${child.type})${childRef}`);
            });
        }
    });

    const treeContent = `<pre style="background: var(--sf-bg-alt); padding: 15px; border-radius: 5px; font-size: 0.85em; line-height: 1.5; overflow-x: auto; margin: 0; border: 1px solid var(--sf-border); white-space: pre; font-family: 'Consolas', 'Monaco', monospace;">${lines.join('\n')}</pre>`;

    elements.contentTreeWrapper.innerHTML = createCollapsibleBlock(
        'Estructura del Contenido',
        treeContent,
        'content-tree',
        false,
        0
    );
    initCollapsibleListeners(elements.contentTreeWrapper);
}

/**
 * Construye el HTML de la tabla de componentes.
 */
function buildComponentsTable(components) {
    if (components.length === 0) {
        return '<p style="color:var(--sf-text-muted);">No se encontraron componentes hijos.</p>';
    }
    let html = `<table class="finder-detail-table">
        <thead><tr>
            <th style="width:40px;"></th>
            <th>ID</th>
            <th>Nombre</th>
            <th>Tipo</th>
            <th>Ruta</th>
            <th>Referenciado por</th>
        </tr></thead><tbody>`;
    components.forEach((c, index) => {
        const refBy = c.referencedBy ? `<small style="color:var(--sf-text-muted);">${c.referencedBy}</small>` : '---';
        const bgColor = c.depth === 0 ? 'var(--sf-bg-alt)' : 'var(--sf-surface)';
        const paddingLeft = 8 + (c.depth * 16);
        const codeBtn = c.content
            ? `<span class="cp-inspect-btn" data-comp-index="${index}" title="Ver código"><svg viewBox="0 0 24 24"><polyline points="16 18 22 12 16 6"></polyline><polyline points="8 6 2 12 8 18"></polyline></svg></span>`
            : '';
        
        html += `<tr style="background-color:${bgColor};">
            <td style="text-align:center;">${codeBtn}</td>
            <td>${c.id}</td>
            <td style="padding-left:${paddingLeft}px;">${c.name}</td>
            <td>${c.type}</td>
            <td>${c.path}</td>
            <td>${refBy}</td>
        </tr>`;
    });
    html += '</tbody></table>';
    return html;
}

/**
 * Construye el HTML de la tabla de DEs referenciadas.
 */
function buildDEsTable(des) {
    if (des.length === 0) {
        return '<p style="color:var(--sf-text-muted);">No se detectaron referencias a Data Extensions en el código.</p>';
    }
    let html = `<table class="finder-detail-table">
        <thead><tr>
            <th>Nombre DE</th>
            <th>Funciones</th>
            <th>Usado en componente</th>
        </tr></thead><tbody>`;
    des.forEach(d => {
        html += `<tr>
            <td>${escapeHtml(d.deName)}</td>
            <td><small>${escapeHtml(d.functions)}</small></td>
            <td><small style="color:var(--sf-text-muted);">${escapeHtml(d.sources)}</small></td>
        </tr>`;
    });
    html += '</tbody></table>';
    return html;
}

function openFinderCodeDrawer(comp) {
    if (!comp || !comp.content) return;

    currentDrawerContent = comp.content;
    elements.finderCodeTitle.textContent = comp.name || 'Código Fuente';

    const highlighted = highlightCloudPageCode(formatCodeWithIndentation(comp.content));
    elements.finderCodeContent.innerHTML = `
        <div class="code-header">Código Fuente</div>
        <pre><code>${highlighted}</code></pre>`;

    elements.finderCodeDrawer.classList.add('open');
    elements.finderCodeBackdrop.classList.add('active');
}

/**
 * Navega al buscador de contenidos, busca un asset por ID y muestra su detalle.
 * Llamada desde content-manager para inspeccionar un contenido.
 * @param {number|string} assetId - ID del asset a buscar.
 */
export async function searchAndShowDetail(assetId) {
    // Poner el ID en el input y lanzar búsqueda
    elements.contentSearchValue.value = String(assetId);
    
    // Activar la pestaña de Contenidos dentro de Buscadores
    const tabBtn = document.querySelector('[data-tab="contenido-tab"]');
    if (tabBtn) tabBtn.click();

    // Buscar
    await searchContent();

    // Auto-seleccionar el resultado
    const row = [...elements.contentSearchResultsTbody.querySelectorAll('tr')]
        .find(r => r.dataset.assetId === String(assetId));
    if (row) {
        row.classList.add('selected');
        selectedAssetId = String(assetId);
        elements.contentDetailBtn.disabled = false;
        await showContentDetail();
    }
}

/**
 * Ensambla el HTML completo de un asset, reemplazando los placeholders
 * de slots y bloques con su contenido real.
 * @param {object} asset - El asset completo devuelto por la API.
 * @returns {string} El HTML ensamblado.
 */
function assembleFullContent(asset, components) {
    let html = asset.views?.html?.content || asset.content || '';
    if (!html) return '';

    const slots = asset.views?.html?.slots;
    if (slots) {
        for (const slotKey in slots) {
            const slot = slots[slotKey];
            let slotHtml = slot.content || '';

            const blocks = slot.blocks;
            if (blocks) {
                for (const blockKey in blocks) {
                    const block = blocks[blockKey];
                    const blockContent = block.content || '';
                    const blockRegex = new RegExp(
                        `<div[^>]*data-type=["']block["'][^>]*data-key=["']${blockKey}["'][^>]*>\\s*</div>`,
                        'gi'
                    );
                    slotHtml = slotHtml.replace(blockRegex, blockContent);
                }
            }

            const slotRegex = new RegExp(
                `<div[^>]*data-type=["']slot["'][^>]*data-key=["']${slotKey}["'][^>]*>[\\s\\S]*?</div>`,
                'gi'
            );
            html = html.replace(slotRegex, slotHtml);
        }
    }

    // Resolver ContentBlockByID/Key/Name con los componentes ya descargados
    if (components && components.length > 0) {
        html = html.replace(/%%=ContentBlockby[Ii][Dd]\s*\(\s*["']?(\d+)["']?\s*\)=%%/gi, (match, id) => {
            const comp = components.find(c => String(c.id) === String(id) && c.content);
            return comp ? comp.content : match;
        });
        html = html.replace(/%%=ContentBlockby[Kk]ey\s*\(\s*["']([^"']+)["']\s*\)=%%/gi, (match, key) => {
            const comp = components.find(c => c.customerKey === key && c.content);
            return comp ? comp.content : match;
        });
        html = html.replace(/%%=ContentBlockby[Nn]ame\s*\(\s*["']([^"']+)["']\s*\)=%%/gi, (match, name) => {
            const comp = components.find(c => c.rawName === name && c.content);
            return comp ? comp.content : match;
        });
    }

    return html;
}