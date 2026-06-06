// Fichero: src/renderer/components/content-finder.js
import * as mcApiService from '../api/mc-api-service.js';
import elements from '../ui/dom-elements.js';
import * as ui from '../ui/ui-helpers.js';
import * as logger from '../ui/logger.js';

// --- 1. ESTADO ---
let getAuthenticatedConfig;
let cachedResults = [];
let selectedAssetId = null;

// --- 2. INIT ---
export function init(dependencies) {
    getAuthenticatedConfig = dependencies.getAuthenticatedConfig;
    elements.searchContentBtn.addEventListener('click', searchContent);
    elements.contentDetailBtn.addEventListener('click', showContentDetail);

    elements.contentSearchResultsTbody.addEventListener('click', (e) => {
        const row = e.target.closest('tr');
        if (!row || !row.dataset.assetId) return;
        elements.contentSearchResultsTbody.querySelectorAll('tr').forEach(r => r.classList.remove('selected'));
        row.classList.add('selected');
        selectedAssetId = row.dataset.assetId;
        elements.contentDetailBtn.disabled = false;
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

    try {
        const apiConfig = await getAuthenticatedConfig();
        mcApiService.setLogger(logger);
        const value = elements.contentSearchValue.value.trim();
        if (!value) throw new Error("El campo de búsqueda no puede estar vacío.");

        const contentList = await mcApiService.searchContentAssets(value, apiConfig);
        if (contentList.length === 0) { cachedResults = []; renderTable([]); return; }

        logger.logMessage(`Se encontraron ${contentList.length} contenidos. Obteniendo rutas...`);
        const enriched = await Promise.all(contentList.map(async (asset) => {
            const folderPath = await mcApiService.getFolderPath(asset.category.id, apiConfig);
            return { id: asset.id, name: asset.name, type: asset.assetType.displayName, assetTypeId: asset.assetType.id, path: folderPath || 'Content Builder' };
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
        logger.logMessage(`Obteniendo detalle completo del asset ${selected.id}...`);
        const fullAsset = await mcApiService.fetchAssetById(selected.id, apiConfig);

        // 1. Componentes hijos (slots/blocks) + ContentBlockBy* en código
        const components = await extractComponents(fullAsset, apiConfig, 0);

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
            true,
            500
        );

        // Data Extensions
        const desHtml = buildDEsTable(referencedDEs);
        elements.contentDesWrapper.innerHTML = createCollapsibleBlock(
            `Data Extensions referenciadas (${referencedDEs.length})`,
            desHtml,
            'content-des',
            true,
            400
        );

        // Activar todos los collapsibles
        initCollapsibleListeners(elements.contentDetailBlock);
        elements.contentDetailBlock.style.display = '';

    } catch (error) {
        logger.logMessage(`Error en detalle: ${error.message}`);
        ui.showCustomAlert(`Error: ${error.message}`);
    } finally { ui.unblockUI(); logger.endLogBuffering(); }
}

/**
 * Extrae componentes hijos: recorre slots/blocks y detecta ContentBlockBy* en código.
 */
async function extractComponents(asset, apiConfig, depth, parentName) {
    const components = [];

    // A. Template
    const templateName = asset.views?.html?.template?.name;
    if (templateName && depth === 0) {
        components.push({
            id: asset.views.html.template.id || '---',
            name: templateName,
            rawName: templateName,
            type: 'Template',
            path: '---',
            content: null,
            referencedBy: null,
            depth: 0
        });
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
                const childId = block.meta?.options?.id;
                const childType = block.meta?.options?.assetType?.displayName;
                if (!childId) continue;

                try {
                    logger.logMessage(`${'  '.repeat(depth)}→ Obteniendo componente ID ${childId}...`);
                    const childAsset = await mcApiService.fetchAssetById(childId, apiConfig);
                    const childPath = childAsset.category?.id
                        ? await mcApiService.getFolderPath(childAsset.category.id, apiConfig) : '---';

                    components.push({
                        id: childId,
                        name: childAsset.name || '---',
                        rawName: childAsset.name || '---',
                        type: childType || childAsset.assetType?.displayName || '---',
                        path: childPath || 'Content Builder',
                        content: childAsset.content || null,
                        referencedBy: parentName || (slotLabel ? `Slot: ${slotLabel}` : null),
                        depth: depth
                    });

                    // Recursivo
                    const subComps = await extractComponents(childAsset, apiConfig, depth + 1, childAsset.name);
                    components.push(...subComps);

                } catch (err) {
                    logger.logMessage(`${'  '.repeat(depth)}✗ Error obteniendo asset ${childId}: ${err.message}`);
                    components.push({ id: childId, name: `Error (${childId})`, rawName: `Error (${childId})`, type: childType || '?', path: '---', content: null, referencedBy: parentName, depth: depth });
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
                    resolvedAsset = await mcApiService.fetchAssetById(ref.value, apiConfig);
                } else if (ref.type === 'Key' || ref.type === 'Name') {
                    logger.logMessage(`${'  '.repeat(depth)}→ Resolviendo ContentBlockBy${ref.type}("${ref.value}")...`);
                    const results = await mcApiService.searchContentAssets(ref.value, apiConfig);
                    if (results.length > 0) resolvedAsset = await mcApiService.fetchAssetById(results[0].id, apiConfig);
                }

                if (resolvedAsset) {
                    const refPath = resolvedAsset.category?.id
                        ? await mcApiService.getFolderPath(resolvedAsset.category.id, apiConfig) : '---';
                    components.push({
                        id: resolvedAsset.id,
                        name: resolvedAsset.name,
                        rawName: resolvedAsset.name,
                        type: resolvedAsset.assetType?.displayName || '---',
                        path: refPath || 'Content Builder',
                        content: resolvedAsset.content || null,
                        referencedBy: `${sourceName} → ContentBlockBy${ref.type}`,
                        depth: depth + 1
                    });
                    const subComps = await extractComponents(resolvedAsset, apiConfig, depth + 2, resolvedAsset.name);
                    components.push(...subComps);
                } else {
                    components.push({
                        id: '---', name: `${ref.value} (no encontrado)`, rawName: ref.value,
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
    const mh = maxHeight || 0;
    return `
        <div class="analyzer-collapsible ${expanded ? 'active' : ''}" id="container-${id}">
            <div class="analyzer-collapsible-header">
                <span>${title}</span>
                <span class="analyzer-icon">${expanded ? '▼' : '▶'}</span>
            </div>
            <div class="analyzer-collapsible-content" data-scroll-height="${mh}"
                 style="max-height:${expanded ? (mh ? mh + 'px' : 'none') : '0'};
                        overflow:${expanded ? (mh ? 'auto' : 'visible') : 'hidden'};
                        padding:${expanded ? '15px' : '0 15px'};
                        background:#fff; border:1px solid #e2e8f0; border-top:none;">
                ${innerHtml}
            </div>
        </div>
    `;
}

/**
 * Activa los listeners de clic para collapsibles dentro de un contenedor.
 */
function initCollapsibleListeners(container) {
    container.querySelectorAll('.analyzer-collapsible-header').forEach(header => {
        header.onclick = function () {
            const parent = this.parentElement;
            const content = this.nextElementSibling;
            const icon = this.querySelector('.analyzer-icon');
            const isOpen = parent.classList.contains('active');
            const scrollH = content.dataset.scrollHeight;

            if (isOpen) {
                parent.classList.remove('active');
                content.style.maxHeight = '0';
                content.style.overflow = 'hidden';
                content.style.padding = '0 15px';
                icon.textContent = '▶';
            } else {
                parent.classList.add('active');
                content.style.maxHeight = scrollH && scrollH !== '0' ? scrollH + 'px' : 'none';
                content.style.overflow = scrollH && scrollH !== '0' ? 'auto' : 'visible';
                content.style.padding = '15px';
                icon.textContent = '▼';
            }
        };
    });
}

// --- 7. RENDERIZADO ---

function renderTable(results) {
    elements.contentSearchResultsTbody.innerHTML = '';
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

    const treeContent = `<pre style="background: #f8f9fa; padding: 15px; border-radius: 5px; font-size: 0.85em; line-height: 1.5; overflow-x: auto; margin: 0; border: 1px solid #eee; white-space: pre; font-family: 'Consolas', 'Monaco', monospace;">${lines.join('\n')}</pre>`;

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
        return '<p style="color:#888;">No se encontraron componentes hijos.</p>';
    }
    const thStyle = 'position:sticky; top:0; z-index:2; background:#6faad8; color:#fff; padding:8px;';
    let html = `<table style="width:100%; border-collapse:collapse;">
        <thead><tr>
            <th style="${thStyle}">ID</th>
            <th style="${thStyle}">Nombre</th>
            <th style="${thStyle}">Tipo</th>
            <th style="${thStyle}">Ruta</th>
            <th style="${thStyle}">Referenciado por</th>
        </tr></thead><tbody>`;
    components.forEach(c => {
        const refBy = c.referencedBy ? `<small style="color:#888;">${c.referencedBy}</small>` : '---';
        const bgColor = c.depth === 0 ? '#eef3f8' : '#ffffff';
        const paddingLeft = 8 + (c.depth * 16);
        html += `<tr style="background-color:${bgColor};">
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
        return '<p style="color:#888;">No se detectaron referencias a Data Extensions en el código.</p>';
    }
    const thStyle = 'position:sticky; top:0; z-index:2; background:#6faad8; color:#fff; padding:8px;';
    let html = `<table style="width:100%; border-collapse:collapse;">
        <thead><tr>
            <th style="${thStyle}">Nombre DE</th>
            <th style="${thStyle}">Funciones</th>
            <th style="${thStyle}">Usado en componente</th>
        </tr></thead><tbody>`;
    des.forEach(d => {
        html += `<tr>
            <td>${d.deName}</td>
            <td><small>${d.functions}</small></td>
            <td><small style="color:#888;">${d.sources}</small></td>
        </tr>`;
    });
    html += '</tbody></table>';
    return html;
}