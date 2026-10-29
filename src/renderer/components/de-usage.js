// =======================================================================================
// --- Fichero: src/renderer/components/de-usage.js ---
// --- Descripción: Búsqueda de "dónde se usa" una Data Extension, lanzada desde el Buscador
// ---              de Data Extensions. Muestra los usos agrupados en pestañas por tipología.
// =======================================================================================

import * as mcApiService from '../api/mc-api-service.js';
import elements from '../ui/dom-elements.js';
import * as ui from '../ui/ui-helpers.js';
import * as logger from '../ui/logger.js';
import { escapeHtml, formatDate } from '../ui/format-utils.js';
import { downloadCsv, buildCsvFileName } from '../ui/csv-export.js';
import { findDeFunctionsInCode, mentionsDe, classifySqlUsage } from '../ui/de-references.js';
import { openFinderCodeDrawer } from './content-finder.js';
import { ensureJourneysDetailCache } from './journeys-cache.js';
import {
    loadAutomationsCache, refreshAutomationsCache, buildActivityLocationIndex,
    findActivitiesTargetingDe, AUTOMATION_ACTIVITY_TYPES
} from './automations-cache.js';

// Pestañas de resultados, en el orden en que se muestran y se buscan.
const USAGE_TABS = [
    { id: 'sources', label: 'Escritura Queries/Imports' },
    { id: 'queries', label: 'Lectura Queries' },
    { id: 'scripts', label: 'Scripts' },
    { id: 'contents', label: 'Contenidos' },
    { id: 'cloudpages', label: 'CloudPages' },
    { id: 'automations', label: 'Automatismos' },
    { id: 'journeys', label: 'Journeys' }
];

// Pestañas cuya columna de automatismo se puede resolver con la caché de automatismos.
const TABS_WITH_AUTOMATIONS = ['sources', 'queries', 'scripts'];

// Columnas de cada pestaña. "code" es la columna del icono para ver el código.
const TAB_COLUMNS = {
    sources: [
        { label: 'Actividad', get: r => r.name },
        { label: 'Tipo', get: r => r.type },
        { label: 'Acción / Descripción', get: r => r.detail },
        { label: 'Automatismo (Paso)', get: r => r.automations, multiline: true },
        { label: 'Código', code: true }
    ],
    queries: [
        { label: 'Query', get: r => r.name },
        { label: 'Uso', get: r => r.usage },
        { label: 'Automatismo (Paso)', get: r => r.automations, multiline: true },
        { label: 'Código', code: true }
    ],
    scripts: [
        { label: 'Script', get: r => r.name },
        { label: 'Uso', get: r => r.usage },
        { label: 'Funciones', get: r => r.detail },
        { label: 'Automatismo (Paso)', get: r => r.automations, multiline: true },
        { label: 'Código', code: true }
    ],
    contents: [
        { label: 'Nombre', get: r => r.name },
        { label: 'Tipo', get: r => r.type },
        { label: 'Uso', get: r => r.usage },
        { label: 'Funciones', get: r => r.detail },
        { label: 'Compartido', get: r => (r.shared ? 'Sí' : 'No') },
        { label: 'Ruta de Carpeta', get: r => r.location },
        { label: 'Código', code: true }
    ],
    cloudpages: [
        { label: 'Nombre', get: r => r.name },
        { label: 'Tipo', get: r => r.type },
        { label: 'Uso', get: r => r.usage },
        { label: 'Funciones', get: r => r.detail },
        { label: 'Ruta de Carpeta', get: r => r.location },
        { label: 'Código', code: true }
    ],
    automations: [
        { label: 'Automatismo', get: r => r.automationName },
        { label: 'Estado', get: r => r.status },
        { label: 'Paso', get: r => String(r.step ?? '') },
        { label: 'Actividad', get: r => r.name },
        { label: 'Tipo', get: r => r.type },
        { label: 'Uso', get: r => r.usage }
    ],
    journeys: [
        { label: 'Journey', get: r => r.name },
        { label: 'Versión', get: r => r.type },
        { label: 'Estado', get: r => r.status },
        { label: 'Uso', get: r => r.usage },
        { label: 'Actividades', get: r => r.detail, multiline: true }
    ]
};

let getAuthenticatedConfig;
let currentDe = null;
// Resultado por pestaña: { rows: Array, error, warning, note, missingCache }.
let usages = {};
let activeTab = USAGE_TABS[0].id;
// Cachés del contexto activo usadas en la última búsqueda: { automations: {list, lastRefresh}, journeys: {...} }.
let caches = { automations: null, journeys: null };
// Índice actividad → automatismos construido a partir de la caché de automatismos.
let activityIndex = null;
// Journeys que usan la DE como entrada (búsqueda en directo); se conservan para recalcular la pestaña
// al actualizar la caché de journeys sin volver a llamar a la API.
let journeyEntryRows = [];
// Lista actual de journeys (id → modifiedDate) obtenida en la búsqueda de entradas, para avisar si
// la caché de journeys está incompleta o desactualizada.
let liveJourneys = null;

/**
 * Registra los listeners del panel de usos (pestañas, ver código y descarga CSV).
 * @param {object} dependencies
 * @param {Function} dependencies.getAuthenticatedConfig - Devuelve la config autenticada de la API.
 */
export function init(dependencies) {
    getAuthenticatedConfig = dependencies.getAuthenticatedConfig;

    // Las pestañas usan su propia clase (no .tab-button) para no interferir con el
    // gestor global de pestañas de app.js.
    elements.deUsageTabs.addEventListener('click', e => {
        const tab = e.target.closest('.de-usage-tab');
        if (!tab) return;
        activeTab = tab.dataset.tab;
        render();
    });

    elements.deUsageContent.addEventListener('click', e => {
        const btn = e.target.closest('.cp-inspect-btn[data-row-index]');
        if (!btn) return;
        const row = usages[activeTab]?.rows[parseInt(btn.dataset.rowIndex, 10)];
        if (row?.code) openFinderCodeDrawer({ name: row.name, content: row.code, fileExtension: row.codeExt });
    });

    // Botones Descargar/Actualizar de las cachés (se pintan en render, por eso se delega).
    elements.deUsageCacheBar.addEventListener('click', e => {
        const btn = e.target.closest('button[data-cache]');
        if (!btn) return;
        if (btn.dataset.cache === 'automations') refreshAutomations();
        else if (btn.dataset.cache === 'journeys') refreshJourneys();
    });

    elements.downloadDeUsageCsvBtn.addEventListener('click', downloadUsagesCsv);
}

/**
 * Oculta y vacía el panel de usos (se llama al lanzar una nueva búsqueda de DEs).
 * No recibe parámetros.
 */
export function reset() {
    currentDe = null;
    usages = {};
    caches = { automations: null, journeys: null };
    activityIndex = null;
    journeyEntryRows = [];
    liveJourneys = null;
    elements.deUsagePanel.classList.add('hidden');
    elements.deUsageTabs.innerHTML = '';
    elements.deUsageContent.innerHTML = '';
    elements.deUsageCacheBar.innerHTML = '';
    elements.downloadDeUsageCsvBtn.disabled = true;
}

/**
 * Busca dónde se usa una DE en la BU activa y pinta el resultado por pestañas.
 * Cada fuente se busca por separado: si una falla, se indica en su pestaña y se sigue con el resto.
 * @param {object} de - DE seleccionada en el buscador.
 * @param {string} de.name - Nombre exacto.
 * @param {string} de.key - External Key.
 * @param {string} de.objectID - ObjectID (lo necesitan los imports).
 */
export async function searchUsages(de) {
    currentDe = de;
    usages = {};
    liveJourneys = null;
    activeTab = USAGE_TABS[0].id;

    ui.blockUI('Buscando usos de la Data Extension...');
    logger.startLogBuffering();
    try {
        const apiConfig = await getAuthenticatedConfig();
        mcApiService.setLogger(logger);
        // Cada búsqueda parte de cero para no reutilizar automatismos de otra operación.
        mcApiService.clearAutomationDetailsCache();
        logger.logMessage(`--- Dónde se usa la DE "${de.name}" (External Key: ${de.key || '---'}) ---`);

        await loadCaches();
        if (caches.automations) {
            logger.logMessage(`Se usa la caché de automatismos del ${formatDate(caches.automations.lastRefresh)} para localizar las actividades.`);
        }

        await runSource(['sources'], 'Buscando orígenes de datos (queries e imports)...', () => findSources(de, apiConfig));
        await runSource(['queries'], 'Buscando queries que leen la DE...', () => findReadingQueries(de, apiConfig));
        await runSource(['scripts'], 'Buscando en el código de los scripts...', () => findScripts(de, apiConfig));
        await runSource(['contents'], 'Buscando en contenidos...', () => findContents(de, apiConfig));
        await runSource(['cloudpages'], 'Buscando en el código de las CloudPages...', () => findCloudPages(de, apiConfig));
        usages.automations = buildAutomationsSummary(de);
        await runSource(['journeys'], 'Buscando journeys que usan la DE...', () => findJourneys(de, apiConfig));
        applyAutomationsCacheNotes();

        const total = USAGE_TABS.reduce((sum, t) => sum + (usages[t.id]?.rows.length || 0), 0);
        logger.logMessage(`Búsqueda de usos completada: ${total} uso(s) encontrados.`);
    } catch (error) {
        logger.logMessage(`Error al buscar usos: ${error.message}`);
        ui.showCustomAlert(`Error al buscar usos: ${error.message}`);
    } finally {
        render();
        ui.unblockUI();
        logger.endLogBuffering();
        // El panel queda debajo de la tabla de DEs: se lleva a la vista para que se vean los usos.
        elements.deUsagePanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
}

/**
 * Ejecuta la búsqueda de una fuente y guarda su resultado; si falla, deja el error en sus pestañas.
 * @param {Array<string>} tabIds - Pestañas que rellena la fuente.
 * @param {string} message - Mensaje del loader y del log.
 * @param {Function} search - Devuelve un objeto { tabId: rows, warning?, note?, missingCache? } (o un array
 *   si solo rellena una pestaña).
 */
async function runSource(tabIds, message, search) {
    ui.blockUI(message);
    logger.logMessage(message);
    try {
        const result = await search();
        const byTab = Array.isArray(result) ? { [tabIds[0]]: result } : result;
        tabIds.forEach(id => {
            usages[id] = {
                rows: byTab[id] || [], error: null, warning: byTab.warning || null,
                note: byTab.note || null, missingCache: byTab.missingCache || null
            };
        });
    } catch (error) {
        logger.logMessage(`Error en "${message}": ${error.message}`);
        tabIds.forEach(id => { usages[id] = { rows: [], error: error.message, warning: null, note: null, missingCache: null }; });
    }
}

/**
 * Carga de disco las cachés de automatismos y journeys del contexto activo (sin llamadas a la API)
 * y prepara el índice de actividades.
 * No recibe parámetros.
 */
async function loadCaches() {
    const cacheKey = elements.clientNameInput?.value?.trim();
    const automations = await loadAutomationsCache(cacheKey);
    caches.automations = automations ? { list: automations.automations, lastRefresh: automations.lastRefresh } : null;
    activityIndex = caches.automations ? buildActivityLocationIndex(caches.automations.list) : null;

    caches.journeys = null;
    try {
        const journeys = cacheKey ? await window.electronAPI.loadClientJourneys(cacheKey) : null;
        if (journeys?.success && Array.isArray(journeys.journeys)) {
            caches.journeys = { list: journeys.journeys, lastRefresh: journeys.lastRefresh };
        }
    } catch { /* sin caché de journeys */ }
}

/**
 * Localiza en qué automatismos y pasos está una actividad: con la caché de automatismos si existe
 * (sin llamadas) o, si no, preguntando a la API como hasta ahora.
 * @param {string} objectID - ObjectID de la actividad (query, import o script).
 * @param {object} apiConfig - Configuración autenticada de la API.
 * @returns {Promise<Array<{automationName: string, step: string}>>}
 */
async function locateActivity(objectID, apiConfig) {
    if (activityIndex) return activityIndex.get(String(objectID || '').toLowerCase()) || [];
    return mcApiService.findAutomationForActivity(objectID, apiConfig);
}

/**
 * Añade a las pestañas con columna de automatismo la nota de que se ha resuelto con la caché.
 * No recibe parámetros.
 */
function applyAutomationsCacheNotes() {
    if (!caches.automations) return;
    const note = `Automatismos según la caché del ${formatDate(caches.automations.lastRefresh)}.`;
    TABS_WITH_AUTOMATIONS.forEach(id => { if (usages[id] && !usages[id].error) usages[id].note = note; });
}

/**
 * Queries e imports que escriben en la DE (lo que mostraba el antiguo Buscador de Orígenes).
 * @param {object} de - DE buscada.
 * @param {object} apiConfig - Configuración autenticada de la API.
 * @returns {Promise<Array>} Filas de la pestaña "Escritura Queries/Imports".
 */
async function findSources(de, apiConfig) {
    // Con caché de automatismos no se pide a la API el automatismo de cada actividad.
    const options = { resolveAutomations: !activityIndex };
    const [imports, queries] = await Promise.all([
        de.objectID ? mcApiService.findImportsTargetingDE(de.objectID, apiConfig, options) : Promise.resolve([]),
        mcApiService.searchQueriesBySimpleFilter({
            property: 'DataExtensionTarget.Name',
            simpleOperator: 'equals',
            value: xmlEscape(de.name)
        }, apiConfig, options)
    ]);
    logger.logMessage(`-> ${queries.length} query(s) y ${imports.length} import(s) escriben en la DE.`);

    const locationsOf = item => (activityIndex ? activityIndex.get(String(item.objectID || '').toLowerCase()) : item.automations) || [];
    return [
        ...queries.map(q => ({
            name: q.name, type: 'Query', usage: 'Escribe', detail: q.action, objectID: q.objectID,
            locations: locationsOf(q), automations: formatAutomations(locationsOf(q)), code: q.description, codeExt: 'sql'
        })),
        ...imports.map(i => ({
            name: i.name, type: 'Import', usage: 'Escribe', detail: i.description || '---', objectID: i.objectID,
            locations: locationsOf(i), automations: formatAutomations(locationsOf(i))
        }))
    ].sort(byName);
}

/**
 * Queries que leen la DE (FROM/JOIN) o la mencionan. La búsqueda SOAP por texto devuelve también
 * queries con nombres que solo contienen el de la DE, así que se criban en local antes de buscar
 * su automatismo para no gastar llamadas en falsos positivos.
 * @param {object} de - DE buscada.
 * @param {object} apiConfig - Configuración autenticada de la API.
 * @returns {Promise<Array>} Filas de la pestaña "Lectura Queries".
 */
async function findReadingQueries(de, apiConfig) {
    const candidates = await mcApiService.searchQueriesBySimpleFilter({
        property: 'QueryText',
        simpleOperator: 'like',
        value: xmlEscape(de.name)
    }, apiConfig, { resolveAutomations: false });

    const matches = candidates
        .map(q => ({ query: q, usage: classifySqlUsage(q.description, de.name) }))
        .filter(m => m.usage);
    logger.logMessage(`-> ${candidates.length} query(s) contienen el texto; ${matches.length} usan la DE como tal.`);

    const rows = await Promise.all(matches.map(async ({ query, usage }) => {
        const locations = await locateActivity(query.objectID, apiConfig);
        return {
            name: query.name, type: 'Query', usage: usage === 'FROM/JOIN' ? 'Lee (FROM/JOIN)' : 'Mención',
            objectID: query.objectID, locations, automations: formatAutomations(locations),
            code: query.description, codeExt: 'sql'
        };
    }));
    return rows.sort(byName);
}

/**
 * Scripts SSJS que referencian la DE por nombre o External Key, en un solo recorrido de todos los scripts.
 * @param {object} de - DE buscada.
 * @param {object} apiConfig - Configuración autenticada de la API.
 * @returns {Promise<Array>} Filas de la pestaña "Scripts".
 */
async function findScripts(de, apiConfig) {
    const candidates = await mcApiService.searchScriptsByText([de.name, de.key], apiConfig);
    const matches = candidates
        .map(s => ({ script: s, functions: findDeFunctionsInCode(s.script, de) }))
        .filter(m => m.functions.length > 0 || mentionsDe(m.script.script, de));
    logger.logMessage(`-> ${candidates.length} script(s) contienen el texto; ${matches.length} usan la DE como tal.`);

    const rows = await Promise.all(matches.map(async ({ script, functions }) => {
        const locations = await locateActivity(script.objectID, apiConfig);
        return {
            name: script.name, type: 'Script',
            usage: functions.length ? 'Referencia' : 'Mención',
            detail: functions.join(', ') || '---',
            objectID: script.objectID, locations, automations: formatAutomations(locations),
            code: script.script, codeExt: 'js'
        };
    }));
    return rows.sort(byName);
}

/**
 * Contenidos de Content Builder (incluido Shared Content) que referencian la DE por nombre o External Key.
 * Las CloudPages se excluyen: su código no está en el campo que indexa la búsqueda de la API y se
 * buscan aparte en `findCloudPages`.
 * @param {object} de - DE buscada.
 * @param {object} apiConfig - Configuración autenticada de la API.
 * @returns {Promise<{contents: Array, warning: string|null}>}
 */
async function findContents(de, apiConfig) {
    const terms = [de.name];
    if (de.key && de.key.toLowerCase() !== de.name.toLowerCase()) terms.push(de.key);

    // Se deduplica por id: un mismo asset puede contener el nombre y la key.
    // Si falla solo una de las búsquedas se conservan los resultados de la otra con un aviso.
    const assets = new Map();
    const failures = [];
    for (const term of terms) {
        try {
            const found = await mcApiService.searchContentAssets(term, apiConfig, 'content', true);
            found
                .filter(a => !mcApiService.CLOUDPAGE_ASSET_TYPE_IDS.includes(a.assetType?.id))
                .forEach(a => assets.set(a.id, a));
        } catch (error) {
            logger.logMessage(`Error buscando "${term}" en contenidos: ${error.message}`);
            failures.push(`${term === de.name ? 'por nombre' : 'por External Key'}: ${error.message}`);
        }
    }
    if (failures.length === terms.length) throw new Error(failures.join(' | '));
    const warning = failures.length ? `Resultados incompletos: falló la búsqueda ${failures.join(' | ')}` : null;

    const matches = [...assets.values()]
        .map(asset => {
            const text = mcApiService.collectSearchableText(asset);
            return { asset, text, functions: findDeFunctionsInCode(text, de) };
        })
        .filter(m => m.functions.length > 0 || mentionsDe(m.text, de));
    logger.logMessage(`-> ${assets.size} contenido(s) contienen el texto; ${matches.length} usan la DE como tal.`);

    const paths = matches.length
        ? await mcApiService.resolveFolderPaths(matches.map(m => m.asset.category?.id).filter(Boolean), apiConfig)
        : new Map();

    const contents = matches.map(({ asset, functions }) => ({
        name: asset.name,
        type: asset.assetType?.displayName || asset.assetType?.name || '---',
        usage: functions.length ? 'Referencia' : 'Mención',
        detail: functions.join(', ') || '---',
        shared: asset.isShared === true,
        location: paths.get(String(asset.category?.id)) || 'Content Builder',
        code: getAssetCode(asset),
        codeExt: 'html'
    }));
    return { contents: contents.sort(byName), warning };
}

/**
 * CloudPages cuyo código referencia la DE por nombre o External Key.
 * Se recorren todas las CloudPages de la BU (pocas llamadas: 500 por página) y se busca en local,
 * porque una Landing Page no guarda su código: lo guarda la Web Page (205) a la que apunta su
 * meta.thumbnailRefAssetId, en las vistas y slots, que la búsqueda por contenido de la API no cubre.
 * @param {object} de - DE buscada.
 * @param {object} apiConfig - Configuración autenticada de la API.
 * @returns {Promise<Array>} Filas de la pestaña "CloudPages".
 */
async function findCloudPages(de, apiConfig) {
    // El código de todas las páginas desbordaría el buffer del panel de logs.
    mcApiService.setSilentResponses(true);
    let assets;
    try {
        assets = await mcApiService.fetchAllCloudPages(apiConfig);
    } finally {
        mcApiService.setSilentResponses(false);
    }
    const byId = new Map(assets.map(a => [a.id, a]));
    const visiblePages = assets.filter(a => a.assetType?.id !== 205);

    // Igual que la vista de CloudPages: si la Web Page enlazada no vino en la lista, se pide por id.
    const missingRefs = [...new Set(visiblePages
        .map(p => p.meta?.thumbnailRefAssetId)
        .filter(id => id && !byId.has(id)))];
    for (const id of missingRefs) {
        try {
            byId.set(id, await mcApiService.fetchAssetById(id, apiConfig));
        } catch (error) {
            logger.logMessage(`No se pudo recuperar la Web Page ${id}: ${error.message}`);
        }
    }

    const matches = [...byId.values()]
        .map(asset => {
            const text = mcApiService.collectSearchableText(asset);
            return { asset, text, functions: findDeFunctionsInCode(text, de) };
        })
        .filter(m => m.functions.length > 0 || mentionsDe(m.text, de));
    logger.logMessage(`-> ${byId.size} asset(s) de CloudPages revisados; ${matches.length} usan la DE.`);

    // Cada Web Page (205) con la referencia se muestra como la CloudPage visible que la usa.
    const normalize = name => String(name || '').toLowerCase().trim();
    const rows = new Map();
    for (const { asset, functions } of matches) {
        let owners = [asset];
        if (asset.assetType?.id === 205) {
            const byRef = visiblePages.filter(p => p.meta?.thumbnailRefAssetId === asset.id);
            const byName = visiblePages.filter(p => !p.meta?.thumbnailRefAssetId && normalize(p.name) === normalize(asset.name));
            if (byRef.length) owners = byRef;
            else if (byName.length) owners = byName;
        }
        owners.forEach(owner => rows.set(owner.id, {
            name: owner.name,
            type: owner.assetType?.displayName || owner.assetType?.name || '---',
            usage: functions.length ? 'Referencia' : 'Mención',
            detail: functions.join(', ') || '---',
            categoryId: owner.category?.id,
            code: getAssetCode(asset),
            codeExt: 'html'
        }));
    }

    const paths = rows.size
        ? await mcApiService.resolveFolderPaths([...rows.values()].map(r => r.categoryId).filter(Boolean), apiConfig)
        : new Map();
    return [...rows.values()]
        .map(r => ({ ...r, location: paths.get(String(r.categoryId)) || 'Content Builder' }))
        .sort(byName);
}

/**
 * Devuelve el código visible de un asset: el HTML principal más el de sus slots y bloques,
 * que es donde las Web Pages y los emails de plantilla guardan el AMPscript.
 * @param {object} asset - Asset devuelto por la API.
 * @returns {string|null}
 */
function getAssetCode(asset) {
    const parts = [asset?.views?.html?.content || ''];
    const slots = asset?.views?.html?.slots || {};
    for (const slot of Object.values(slots)) {
        if (slot?.content) parts.push(slot.content);
        for (const block of Object.values(slot?.blocks || {})) {
            if (block?.content) parts.push(block.content);
        }
    }
    const code = parts.filter(Boolean).join('\n');
    return code || asset?.content || null;
}

/**
 * Resumen "en qué automatismos se usa la DE": reúne, agrupadas por automatismo y paso, las queries,
 * imports y scripts de las otras pestañas que están en algún automatismo. Con caché añade el estado
 * de cada automatismo y las actividades que solo ella conoce (p. ej. filtros que escriben en la DE).
 * No hace llamadas a la API.
 * @param {object} de - DE buscada.
 * @returns {{rows: Array, error: null, warning: string|null, note: string|null, missingCache: null}}
 */
function buildAutomationsSummary(de) {
    const lower = value => String(value || '').toLowerCase();
    const statusById = new Map((caches.automations?.list || []).map(a => [lower(a.id), a.status]));
    const typeLabels = { Query: 'SQL Query', Script: 'SSJS Script', Import: 'Import' };
    const rows = [];
    const seen = new Set();
    const add = (location, activityId, row) => {
        const key = `${lower(location.automationId || location.automationName)}|${location.step}|${lower(activityId || row.name)}`;
        if (seen.has(key)) return;
        seen.add(key);
        rows.push({
            ...row,
            automationName: location.automationName,
            step: location.step,
            automations: `${location.automationName} (Paso ${location.step})`,
            status: statusById.get(lower(location.automationId)) || (caches.automations ? '---' : '')
        });
    };

    TABS_WITH_AUTOMATIONS.forEach(tabId => {
        (usages[tabId]?.rows || []).forEach(row => {
            (row.locations || []).forEach(location => add(location, row.objectID, {
                name: row.name, type: typeLabels[row.type] || row.type, usage: row.usage
            }));
        });
    });

    if (caches.automations) {
        findActivitiesTargetingDe(caches.automations.list, de).forEach(({ automation, step, activity }) => {
            add({ automationName: automation.name, automationId: automation.id, step: step.step },
                activity.activityObjectId || activity.id, {
                    name: activity.name,
                    type: AUTOMATION_ACTIVITY_TYPES[activity.objectTypeId] || `Tipo ${activity.objectTypeId}`,
                    usage: 'Escribe',
                    fromCacheOnly: true
                });
        });
    }

    rows.sort((a, b) => String(a.automationName).localeCompare(String(b.automationName)) ||
        (Number(a.step) || 0) - (Number(b.step) || 0) || byName(a, b));

    const failedTabs = TABS_WITH_AUTOMATIONS.filter(id => usages[id]?.error).map(id => USAGE_TABS.find(t => t.id === id).label);
    const failedAutomations = (caches.automations?.list || []).filter(a => a.error).length;
    const warnings = [];
    if (failedTabs.length) warnings.push(`Incompleto: falló la búsqueda de ${failedTabs.join(', ')}.`);
    if (failedAutomations) warnings.push(`${failedAutomations} automatismo(s) no se pudieron descargar en la caché y no se han revisado.`);

    return {
        rows, error: null, missingCache: null,
        warning: warnings.join(' ') || null,
        note: caches.automations
            ? `Estado y actividades adicionales (filtros...) según la caché de automatismos del ${formatDate(caches.automations.lastRefresh)}.`
            : 'Sin caché de automatismos: se muestran las queries, imports y scripts encontrados, sin el estado del automatismo ni las actividades que solo se conocen por la caché (filtros...).'
    };
}

/**
 * Journeys que usan la DE: como entrada (en directo, con la lista de journeys y de Event Definitions)
 * y en sus actividades (con la caché de journeys, si existe).
 * @param {object} de - DE buscada.
 * @param {object} apiConfig - Configuración autenticada de la API.
 * @returns {Promise<object>} Resultado de la pestaña "Journeys".
 */
async function findJourneys(de, apiConfig) {
    journeyEntryRows = await findJourneyEntries(de, apiConfig);
    return buildJourneysResult(de);
}

/**
 * Journeys cuya fuente de entrada es la DE. Se relaciona cada journey con su Event Definition igual
 * que la vista de Journeys: por nombre y, si no, por el GUID de defaults.email.
 * @param {object} de - DE buscada.
 * @param {object} apiConfig - Configuración autenticada de la API.
 * @returns {Promise<Array>} Filas de journeys con la DE como entrada.
 */
async function findJourneyEntries(de, apiConfig) {
    // Las listas completas desbordarían el buffer del panel de logs.
    mcApiService.setSilentResponses(true);
    let journeysResponse, eventDefs;
    try {
        [journeysResponse, eventDefs] = await Promise.all([
            mcApiService.fetchAllJourneys(apiConfig),
            mcApiService.fetchAllEventDefinitions(apiConfig)
        ]);
    } finally {
        mcApiService.setSilentResponses(false);
    }
    const journeys = Array.isArray(journeysResponse) ? journeysResponse : (journeysResponse?.items || []);
    liveJourneys = new Map(journeys.map(j => [String(j.id), j.modifiedDate]));
    const eq = (a, b) => !!a && !!b && String(a).toLowerCase() === String(b).toLowerCase();
    const isEntryOfDe = ed => eq(ed.dataExtensionName, de.name) || eq(ed.dataExtensionId, de.objectID);
    const byName = new Map((eventDefs || []).filter(ed => ed.name).map(ed => [ed.name, ed]));

    const rows = [];
    for (const journey of journeys) {
        const eventDef = byName.get(journey.name) || findEventDefByGuid(journey, eventDefs || []);
        if (eventDef && isEntryOfDe(eventDef)) {
            rows.push({
                name: journey.name, type: `v${journey.version ?? '-'}`, status: journey.status || '---',
                usage: 'Entrada', detail: `Fuente de entrada (${eventDef.type || 'evento'})`
            });
        }
    }
    logger.logMessage(`-> ${rows.length} journey(s) usan la DE como entrada.`);
    return rows;
}

/**
 * Busca la Event Definition de un journey por el GUID de su defaults.email (criterio de la vista de Journeys).
 * @param {object} journey - Journey de la lista.
 * @param {Array} eventDefs - Todas las Event Definitions.
 * @returns {object|null}
 */
function findEventDefByGuid(journey, eventDefs) {
    const emailDefault = journey.defaults?.email?.[0];
    const guid = emailDefault?.match(/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/i)?.[0];
    if (!guid) return null;
    return eventDefs.find(ed => {
        const key = ed.eventDefinitionKey || '';
        const hyphen = key.indexOf('-');
        return hyphen > -1 && key.substring(hyphen + 1).toLowerCase() === guid.toLowerCase();
    }) || null;
}

/**
 * Compone la pestaña Journeys con las entradas ya buscadas y las actividades de la caché de journeys.
 * Una actividad usa la DE si su configuración contiene el nombre, la External Key (decisiones) o el
 * ObjectID (Update Contact).
 * @param {object} de - DE buscada.
 * @returns {{journeys: Array, note: string|null, warning: string|null, missingCache: string|null}}
 */
function buildJourneysResult(de) {
    const rows = [...journeyEntryRows];
    if (!caches.journeys) return { journeys: rows.sort(byName), note: null, warning: null, missingCache: 'journeys' };

    const objectId = String(de.objectID || '').toLowerCase();
    for (const journey of caches.journeys.list) {
        const matched = (journey.activities || []).filter(activity => {
            const text = JSON.stringify(activity);
            return mentionsDe(text, de) || (objectId && text.toLowerCase().includes(objectId));
        });
        if (matched.length) {
            rows.push({
                name: journey.name, type: `v${journey.version ?? '-'}`, status: journey.status || '---',
                usage: 'Actividades', detail: matched.map(a => `${a.type}: ${a.name || '(sin nombre)'}`).join('\n')
            });
        }
    }
    return {
        journeys: rows.sort(byName),
        note: `Actividades según la caché de journeys del ${formatDate(caches.journeys.lastRefresh)}.`,
        warning: describeJourneysCacheGaps(),
        missingCache: null
    };
}

/**
 * Compara la caché de journeys con la lista actual. La vista de Journeys guarda en la caché solo los
 * journeys que descarga (filtrados o seleccionados), así que puede no estar completa.
 * No recibe parámetros.
 * @returns {string|null} Aviso si faltan journeys o han cambiado desde la caché; null si está al día.
 */
function describeJourneysCacheGaps() {
    if (!liveJourneys || !caches.journeys) return null;
    const cached = new Map(caches.journeys.list.map(j => [String(j.id), j.modifiedDate]));
    let missing = 0;
    let changed = 0;
    liveJourneys.forEach((modifiedDate, id) => {
        if (!cached.has(id)) missing++;
        else if (modifiedDate && cached.get(id) !== modifiedDate) changed++;
    });
    if (!missing && !changed) return null;
    const parts = [];
    if (missing) parts.push(`faltan ${missing} de ${liveJourneys.size} journeys`);
    if (changed) parts.push(`${changed} han cambiado desde que se descargó`);
    return `La caché de journeys no está completa (${parts.join(' y ')}): pulsa "Actualizar" para revisar todos.`;
}

/**
 * Descarga o actualiza la caché de automatismos (una llamada por automatismo, tras confirmación)
 * y recalcula con ella los resultados mostrados, sin repetir las búsquedas en la API.
 * No recibe parámetros.
 */
async function refreshAutomations() {
    const cacheKey = elements.clientNameInput?.value?.trim();
    if (!cacheKey) return ui.showCustomAlert('No hay un cliente y BU activos.');

    ui.blockUI('Obteniendo lista de automatismos...');
    logger.startLogBuffering();
    try {
        mcApiService.setLogger(logger);
        const list = await mcApiService.fetchAllAutomations(await getAuthenticatedConfig());
        ui.unblockUI();
        const confirmed = await ui.showCustomConfirm(
            `Se descargará el detalle de ${list.length} automatismos (${list.length} llamadas a la API). ` +
            'Puede tardar varios minutos. ¿Continuar?');
        if (!confirmed) return;

        // El detalle de cientos de automatismos desbordaría el buffer del panel de logs.
        mcApiService.setSilentResponses(true);
        const result = await refreshAutomationsCache({
            getAuthenticatedConfig, clientName: cacheKey, list,
            onProgress: ui.makeEtaProgress('Descargando automatismos'),
            log: message => logger.logMessage(message)
        });
        mcApiService.setSilentResponses(false);

        caches.automations = { list: result.automations, lastRefresh: result.lastRefresh };
        activityIndex = buildActivityLocationIndex(result.automations);
        logger.logMessage(`Caché de automatismos guardada: ${result.automations.length} automatismos, ${result.failed} con error.`);

        if (currentDe) {
            recomputeAutomationColumns();
            applyAutomationsCacheNotes();
            usages.automations = buildAutomationsSummary(currentDe);
        }
        ui.showCustomAlert(`Caché de automatismos actualizada: ${result.automations.length} automatismos` +
            (result.failed ? ` (${result.failed} no se pudieron descargar).` : '.'));
    } catch (error) {
        logger.logMessage(`Error al actualizar la caché de automatismos: ${error.message}`);
        ui.showCustomAlert(`Error al actualizar la caché de automatismos: ${error.message}`);
    } finally {
        mcApiService.setSilentResponses(false);
        ui.unblockUI();
        logger.endLogBuffering();
        render();
    }
}

/**
 * Actualiza la caché de journeys (reutiliza los no modificados) y recalcula la pestaña Journeys.
 * No recibe parámetros.
 */
async function refreshJourneys() {
    const cacheKey = elements.clientNameInput?.value?.trim();
    if (!cacheKey) return ui.showCustomAlert('No hay un cliente y BU activos.');
    const confirmed = await ui.showCustomConfirm(
        'Se actualizará la caché de journeys: una llamada por cada journey nuevo o modificado desde la última ' +
        'descarga (los que no han cambiado se reutilizan). ¿Continuar?');
    if (!confirmed) return;

    ui.blockUI('Actualizando caché de journeys...');
    logger.startLogBuffering();
    try {
        mcApiService.setLogger(logger);
        const result = await ensureJourneysDetailCache({
            apiConfig: await getAuthenticatedConfig(),
            clientName: cacheKey,
            onProgress: (message, subMessage) => ui.blockUI(message, subMessage),
            formatEta: ui.formatEta
        });
        caches.journeys = { list: result.journeys, lastRefresh: result.lastRefresh };
        logger.logMessage(`Caché de journeys actualizada: ${result.downloaded} descargados, ${result.reused} reutilizados.`);

        if (currentDe) {
            const previousError = usages.journeys?.error;
            const rebuilt = buildJourneysResult(currentDe);
            usages.journeys = {
                rows: rebuilt.journeys, error: null, note: rebuilt.note, missingCache: rebuilt.missingCache,
                warning: previousError
                    ? `No se pudieron comprobar los journeys con la DE como entrada: ${previousError}`
                    : rebuilt.warning
            };
        }
        ui.showCustomAlert(`Caché de journeys actualizada (${result.downloaded} descargados, ${result.reused} reutilizados).`);
    } catch (error) {
        logger.logMessage(`Error al actualizar la caché de journeys: ${error.message}`);
        ui.showCustomAlert(`Error al actualizar la caché de journeys: ${error.message}`);
    } finally {
        ui.unblockUI();
        logger.endLogBuffering();
        render();
    }
}

/**
 * Recalcula la columna de automatismo de las pestañas de queries, imports y scripts con la caché
 * recién descargada (las filas guardan el ObjectID de su actividad).
 * No recibe parámetros.
 */
function recomputeAutomationColumns() {
    if (!activityIndex) return;
    TABS_WITH_AUTOMATIONS.forEach(id => {
        (usages[id]?.rows || []).forEach(row => {
            if (!row.objectID) return;
            row.locations = activityIndex.get(String(row.objectID).toLowerCase()) || [];
            row.automations = formatAutomations(row.locations);
        });
    });
}

/**
 * Pinta la barra con la fecha de cada caché y su botón de Descargar/Actualizar.
 * No recibe parámetros.
 */
function renderCacheBar() {
    const item = (id, label, cache) => `
        <span class="de-usage-cache-item">
            <strong>Caché de ${label}:</strong> ${cache ? escapeHtml(formatDate(cache.lastRefresh)) : 'sin descargar'}
            <button type="button" class="action-button secondary-btn small-text-btn" data-cache="${id}">${cache ? 'Actualizar' : 'Descargar'}</button>
        </span>`;
    elements.deUsageCacheBar.innerHTML = item('automations', 'automatismos', caches.automations) + item('journeys', 'journeys', caches.journeys);
}

/**
 * Pinta el panel: título, pestañas con su contador y la tabla de la pestaña activa.
 * No recibe parámetros: usa el estado del módulo.
 */
function render() {
    if (!currentDe) return;
    elements.deUsagePanel.classList.remove('hidden');
    elements.deUsageTitle.textContent = `Usos de "${currentDe.name}"`;
    renderCacheBar();

    const total = USAGE_TABS.reduce((sum, t) => sum + (usages[t.id]?.rows.length || 0), 0);
    elements.downloadDeUsageCsvBtn.disabled = total === 0;

    elements.deUsageTabs.innerHTML = USAGE_TABS.map(tab => {
        const result = usages[tab.id];
        const badge = !result ? '' : result.error
            ? '<span class="de-usage-count de-usage-count-error" title="Error en la búsqueda">!</span>'
            : `<span class="de-usage-count">${result.rows.length}</span>`;
        return `<button type="button" class="de-usage-tab${tab.id === activeTab ? ' active' : ''}" data-tab="${tab.id}">${tab.label}${badge}</button>`;
    }).join('');

    const result = usages[activeTab];
    const columns = TAB_COLUMNS[activeTab];
    if (!result) {
        elements.deUsageContent.innerHTML = '<p class="de-usage-empty">Búsqueda no realizada.</p>';
        return;
    }
    if (result.error) {
        elements.deUsageContent.innerHTML = `<p class="de-usage-empty error-text">Error: ${escapeHtml(result.error)}</p>`;
        return;
    }
    const missingCacheText = {
        journeys: 'No hay caché de journeys para esta BU: solo se muestran los journeys que usan la DE como entrada. Descárgala con el botón de arriba para revisar también sus actividades.'
    };
    const infoHtml = [
        result.warning ? `<p class="de-usage-warning">${escapeHtml(result.warning)}</p>` : '',
        result.missingCache ? `<p class="de-usage-warning">${escapeHtml(missingCacheText[result.missingCache])}</p>` : '',
        result.note ? `<p class="de-usage-note">${escapeHtml(result.note)}</p>` : ''
    ].join('');
    if (result.rows.length === 0) {
        elements.deUsageContent.innerHTML = `${infoHtml}<p class="de-usage-empty">No se han encontrado usos de este tipo.</p>`;
        return;
    }

    const head = columns.map(c => `<th${c.code ? ' style="width:70px;"' : ''}>${c.label}</th>`).join('');
    const body = result.rows.map((row, index) => `<tr>${columns.map(c => {
        if (c.code) {
            return row.code
                ? `<td class="ta-center"><span class="cp-inspect-btn" data-row-index="${index}" title="Ver código"><svg viewBox="0 0 24 24"><polyline points="16 18 22 12 16 6"></polyline><polyline points="8 6 2 12 8 18"></polyline></svg></span></td>`
                : '<td class="ta-center">---</td>';
        }
        const value = escapeHtml(c.get(row) || '---');
        return `<td${c.multiline ? ' class="de-usage-multiline"' : ''}>${value}</td>`;
    }).join('')}</tr>`).join('');

    elements.deUsageContent.innerHTML = `${infoHtml}
        <div class="table-container">
            <table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>
        </div>`;
}

/**
 * Descarga en CSV todos los usos encontrados, de todas las pestañas. Del resumen de automatismos solo
 * se exportan las actividades que no aparecen en otra pestaña (las que solo conoce la caché), para no
 * duplicar filas.
 * No recibe parámetros.
 */
function downloadUsagesCsv() {
    const rows = [];
    USAGE_TABS.forEach(tab => {
        (usages[tab.id]?.rows || [])
            .filter(r => tab.id !== 'automations' || r.fromCacheOnly)
            .forEach(r => rows.push([
                tab.label, r.name, r.type, r.usage, r.detail || '', r.automations || '', r.status || '',
                r.location || '', r.shared === undefined ? '' : (r.shared ? 'Sí' : 'No')
            ]));
    });
    downloadCsv({
        headers: ['Tipología', 'Nombre', 'Tipo / Versión', 'Uso', 'Detalle', 'Automatismo (Paso)', 'Estado', 'Ruta de Carpeta', 'Compartido'],
        rows,
        fileName: buildCsvFileName(`usos_${currentDe?.name || 'data_extension'}`)
    });
}

/**
 * Formatea los automatismos de una actividad como "Automatismo (Paso N)", uno por línea.
 * @param {Array<{automationName: string, step: string}>} automations
 * @returns {string}
 */
function formatAutomations(automations) {
    if (!automations || automations.length === 0) return 'Sin automatismo';
    return automations.map(a => `${a.automationName} (Paso ${a.step})`).join('\n');
}

/**
 * Escapa los caracteres especiales de XML de un valor que se inserta en un filtro SOAP.
 * @param {string} value
 * @returns {string}
 */
function xmlEscape(value) {
    return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * Comparador para ordenar filas por nombre.
 * @param {object} a
 * @param {object} b
 * @returns {number}
 */
function byName(a, b) {
    return String(a.name || '').localeCompare(String(b.name || ''));
}
