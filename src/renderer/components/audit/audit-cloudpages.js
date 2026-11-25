// Fichero: src/renderer/components/audit/audit-cloudpages.js
// Descripción: Pestaña "Cloud Pages" de la auditoría. Descarga las Cloud Pages con su contenido
// (y deja actualizada la caché que usa la vista de Cloud Pages), y analiza: inventario y
// publicación, robots.txt por dominio, control de crawlers, validación de parámetros,
// cabeceras de seguridad, posibles credenciales, contenido remoto ejecutado, indexación,
// Landing Pages que deberían ser Code Resource, llamadas a endpoints y el mapa de referencias.
// Se apoya en dos guías de Salesforce: la de crawlers de IA (artículo 005315904) y las buenas
// prácticas de seguridad de CloudPages. Todo es análisis estático del código: no se visita
// ninguna página salvo el robots.txt de cada dominio.
// Patrón: import directo de audit-ui/audit-state (ver nota en audit-users.js).

import * as mcApiService from '../../api/mc-api-service.js';
import * as logger from '../../ui/logger.js';
import { escapeHtml } from '../../ui/format-utils.js';
import {
    AUDIT_PALETTE, formatDate,
    buildTabWrapper, buildKpiRow, buildGrid, buildMetricCard, renderCallouts, buildSection, buildInfoIcon,
} from './audit-ui.js';
import {
    registerDrill, addDrillRow, registerPdfData, incApiCalls, getDrillData,
} from './audit-state.js';
import { fetchCloudPagesWithContent, extractFullAssetContent, withSlotContent } from '../cloudpages-cache.js';
import {
    isCodeResource, isPublished, parsePageUrl, isSalesforceHost,
    findLeadingContentBlocks, analyzeBotProtection, detectDataHandling, detectNonVisualEndpoint,
    detectCredentials, detectIndexing, detectIdentifierParams, detectSecurityHeaders, SECURITY_HEADERS,
    detectParamValidation, detectRemoteContent, detectEmptyCatches, summarizeEmptyCatches,
    EMPTY_CATCH_CATEGORIES, EMPTY_CATCH_INFO,
    detectHttpCalls, buildPagesByUrl, buildReferenceGraph, analyzeRobotsTxt,
} from './cloudpages-security.js';

// Límites para no disparar llamadas sin control en instancias muy grandes.
const MAX_BLOCK_LOOKUPS = 30;
const MAX_ROBOTS_CHECKS = 25;

// Explicaciones del icono "i" de cada tarjeta: qué se revisa y cómo.
const INFO = {
    sectionInventory: 'Todas las Cloud Pages y Code Resources de la BU, por tipo y estado de publicación. Publicada = tiene fecha de publicación real.',
    sectionSecurity: 'Revisión estática del código de cada Cloud Page y Code Resource (no se visita ninguna página):\n' +
        '- Posibles credenciales escritas en el código.\n' +
        '- Código descargado de otro sitio y ejecutado (TreatAsContent).\n' +
        '- Validación de parámetros e identificación del suscriptor (guía de seguridad de CloudPages).\n' +
        '- Errores silenciados: bloques catch vacíos en SSJS o JavaScript.\n' +
        '- Cabeceras de seguridad recomendadas.\n' +
        'Pasa el ratón por la i de cada tarjeta para ver el detalle de cada comprobación.',
    sectionCrawlers: 'Guía de Salesforce para crawlers de IA (artículo 005315904):\n' +
        '- robots.txt de cada dominio (se pide la URL real).\n' +
        '- Script de servidor que corta las peticiones de crawlers por su User-Agent.\n' +
        '- Páginas que se pueden indexar.\n' +
        '- Landing Pages sin parte visual, candidatas a Code Resource (no consumen una vista por visita).',
    robots: 'Para cada dominio de las Cloud Pages:\n' +
        '1) Busca en las Cloud Pages un Code Resource cuya URL sea /robots.txt en la raíz del dominio.\n' +
        '2) Pide https://dominio/robots.txt (una petición GET por dominio) y comprueba que responde 200 con text/plain, que es lo que exige la guía.\n' +
        '3) Interpreta sus reglas: qué crawlers bloquea con "Disallow: /" y qué crawlers de entrenamiento de IA faltan.\n' +
        'En los dominios de Salesforce no se puede publicar robots.txt.',
    bots: 'Solo páginas publicadas. No busca el código literal de la guía de Salesforce, sino su mecanismo, escrito de cualquier forma, en la página o en un content block incluido al principio:\n' +
        '- Lectura del User-Agent: GetRequestHeader / HTTPRequestHeader / RequestHeader("User-Agent"), Platform.Request.UserAgent o HTTP_USER_AGENT.\n' +
        '- Corte de la petición: RaiseError (lo que propone la guía) o una redirección (Redirect / RedirectTo / Platform.Response.Redirect).\n' +
        'Los nombres de crawlers se buscan como texto en cualquier forma de lista o expresión regular; un patrón genérico "bot" cuenta como que cubre gptbot, claudebot, etc.\n' +
        'Incidencias: RaiseError dentro de try...catch (el error se captura y responde 200), script que no está en la línea 1, crawlers de entrenamiento que faltan o patrón "bot" sin lista de permitidos.\n' +
        'Sin script pero validan parámetros: no tienen el control de User-Agent, pero comprueban que los parámetros no lleguen vacíos, así que una visita directa sin parámetros no procesa nada.\n' +
        'Es un análisis del código: no se visita la página.',
    params: 'Guía de seguridad de CloudPages:\n' +
        '- Comprobar con un If global que los parámetros obligatorios no llegan vacíos antes de procesar nada (Empty/IsNull en AMPscript, comprobaciones de vacío en SSJS sobre las variables que reciben el parámetro).\n' +
        '- Verificar la identidad del suscriptor con al menos dos parámetros antes de mostrar o procesar datos.\n' +
        '- No pasar identificadores en claro en la URL: usar CloudPagesURL, que los cifra.\n' +
        '- No usar Base64 ni StringToHex para datos sensibles: se decodifican sin clave.',
    headers: 'Páginas visuales publicadas. Comprueba si el código fija, con Platform.Response.SetResponseHeader/AddResponseHeader o con <meta http-equiv>, las cabeceras que recomienda la guía de seguridad de CloudPages: ' +
        SECURITY_HEADERS.join(', ') + '. Solo se mira que se fijen, no su valor.',
    creds: 'Busca valores literales con aspecto de credencial: asignaciones a variables o claves con nombres como client_id, clientSecret, apiKey, token, password, AppID... (cualquier combinación de mayúsculas, guiones y prefijos), cabeceras Authorization con valor fijo, URLs con usuario:contraseña o con claves en parámetros, formatos conocidos (AWS, Google, Slack, Stripe, GitHub, SendGrid, JWT, claves privadas) y peticiones de token a la API de SFMC.\n' +
        'Descarta variables, valores con espacios y textos de ejemplo. Los valores se muestran enmascarados. No tiene por qué ser incorrecto: es un aviso para revisar.',
    remote: 'Detecta código que se descarga y se ejecuta en el servidor: TreatAsContent aplicado al resultado de HTTPGet (lo descargado se ejecuta como AMPscript) y descargas desde servicios de ficheros compartidos (Google Drive, Dropbox, OneDrive, SharePoint, GitHub raw, Pastebin...). Quien pueda modificar ese fichero cambia lo que se ejecuta en Marketing Cloud.',
    index: 'Páginas visuales publicadas. Comprueba la etiqueta <meta name="robots"> (o googlebot) y la cabecera X-Robots-Tag.\n' +
        'Indexable = Google, Bing y los buscadores con IA pueden incluir la página en sus resultados si la encuentran (por un enlace público, el sitemap o porque alguien la comparte).\n' +
        'En qué afecta: páginas pensadas para llegar desde un email (centro de preferencias, baja, formularios de una campaña, páginas con datos del suscriptor) acaban apareciendo en buscadores, fuera de contexto o con campañas ya caducadas; y cada visita que llega desde un buscador consume una vista (Super Messages).\n' +
        'No es un error en páginas públicas que sí deben aparecer en buscadores: es para revisar que las de uso privado lleven noindex.',
    superMessages: 'Landing Pages (no Code Resources) sin HTML visual que devuelven JSON, procesan envíos, fijan cabeceras o solo redirigen. Cada visita a una Landing Page consume una vista (Super Messages); un Code Resource no.',
    calls: 'Llamadas en SSJS (HTTP.Post/Get, Platform.Function.HTTPGet/Post, Script.Util), AMPscript (HTTPGet, HTTPPost, HTTPPost2; solo dentro de bloques AMPscript), JavaScript de navegador (fetch, axios, jQuery, XMLHttpRequest, sendBeacon) y formularios (action).\n' +
        'Resuelve variables (var/let/const, SET @var, Concat, propiedades de objetos y %%=v(@var)=%%) y clasifica el destino. "No determinado" son destinos que solo se conocen al ejecutarse. Se ignoran las llamadas dentro de comentarios.',
    hosts: 'Dominios fuera de Marketing Cloud y Salesforce a los que llaman las páginas, de más a menos llamadas.',
    map: 'Una página referencia a otra si en su código aparece la URL completa de la otra, su ruta relativa en el mismo dominio o su id en CloudPagesURL(id) / MicrositeURL(id).\n' +
        'Los ids solo se resuelven si se han importado los Page IDs en la vista de Cloud Pages (Recuperar IDs).',
};

/** Convierte una etiqueta en sufijo válido para una clave de drill. */
const slug = (s) => String(s).replace(/[^a-z0-9]/gi, '');

/** Escapa todas las celdas de una fila de drill (el modal las pinta como HTML). */
const esc = (row) => row.map(cell => escapeHtml(cell === undefined || cell === null || cell === '' ? '---' : String(cell)));

/**
 * Texto de la columna "Publicada" de los detalles: "Sí (fecha)" o "No". Sirve para priorizar,
 * porque solo lo publicado se puede visitar.
 * @param {object} page - Cloud Page de la caché.
 * @returns {string}
 */
const pubLabel = (page) => isPublished(page) ? `Sí (${formatDate(page.publishDate || page.meta?.cloudPages?.publishDate)})` : 'No';

/**
 * Ordena las filas de los detalles de Cloud Pages poniendo primero las publicadas (según la
 * primera columna "Publicada" / "Origen publicada"), manteniendo el orden original en lo demás.
 */
function sortDrillsByPublished() {
    for (const [key, entry] of Object.entries(getDrillData())) {
        if (!key.startsWith('cp_')) continue;
        const col = entry.columns.findIndex(c => /publicada/i.test(c));
        if (col === -1) continue;
        const rank = (row) => (String(row[col]).startsWith('Sí') ? 0 : 1);
        entry.rows = entry.rows
            .map((row, i) => ({ row, i }))
            .sort((a, b) => rank(a.row) - rank(b.row) || a.i - b.i)
            .map(x => x.row);
    }
}

/**
 * Descarga el contenido de los content blocks que las páginas incluyen al principio (donde la
 * guía propone guardar la copia maestra del script anti-crawlers) para poder analizarlos.
 * @param {Array<object>} pages
 * @param {object} apiConfig
 * @returns {Promise<Map<string,string>>} Contenido por "by:valor".
 */
async function resolveLeadingBlocks(pages, apiConfig) {
    const wanted = new Map();
    for (const p of pages) {
        for (const ref of findLeadingContentBlocks(p.content)) {
            const key = `${ref.by}:${ref.value.toLowerCase()}`;
            if (!wanted.has(key)) wanted.set(key, ref);
        }
    }

    const contents = new Map();
    const refs = [...wanted.entries()].slice(0, MAX_BLOCK_LOOKUPS);
    if (wanted.size > MAX_BLOCK_LOOKUPS) {
        logger.logMessage(`Hay ${wanted.size} content blocks al inicio de las páginas; solo se analizan los ${MAX_BLOCK_LOOKUPS} primeros.`);
    }
    for (const [key, ref] of refs) {
        try {
            incApiCalls();
            let asset = null;
            if (ref.by === 'id') {
                asset = await mcApiService.fetchAssetById(ref.value, apiConfig);
            } else {
                const results = await mcApiService.searchContentAssets(ref.value, apiConfig, ref.by === 'key' ? 'key' : 'name');
                asset = ref.by === 'key'
                    ? results[0]
                    : results.find(r => (r.name || '').toLowerCase() === ref.value.toLowerCase());
            }
            if (asset) contents.set(key, extractFullAssetContent(asset));
        } catch (e) {
            logger.logMessage(`No se pudo leer el content block ${ref.by} "${ref.value}": ${e.message}`);
        }
    }
    return contents;
}

/**
 * Revisa el robots.txt de cada dominio: si existe como Code Resource en la raíz, si responde
 * 200 con text/plain y qué crawlers de IA bloquea.
 * @param {Array<object>} pages
 * @returns {Promise<Array<object>>} Una fila por dominio.
 */
async function analyzeRobotsByHost(pages) {
    const hosts = new Map();
    for (const p of pages) {
        const parsed = parsePageUrl(p.url);
        if (!parsed) continue;
        if (!hosts.has(parsed.host)) hosts.set(parsed.host, { root: null, misplaced: [] });
        if (parsed.path === '/robots.txt') hosts.get(parsed.host).root = p;
        else if (parsed.path.endsWith('/robots.txt')) hosts.get(parsed.host).misplaced.push(p);
    }

    const rows = [];
    let checks = 0;
    for (const [host, info] of hosts) {
        const row = { host, estado: '', asset: info.root?.name || '', http: '', blocked: '', missing: '', notes: [] };
        if (isSalesforceHost(host)) {
            row.estado = 'Dominio de Salesforce';
            row.notes.push('No se puede publicar robots.txt: solo protege el script de servidor');
            rows.push(row);
            continue;
        }

        let live = null;
        if (checks < MAX_ROBOTS_CHECKS) {
            checks++;
            live = await window.electronAPI.checkRobotsTxt(host);
            row.http = live?.success ? `${live.status} ${live.contentType || ''}`.trim() : `Error: ${live?.error || 'sin respuesta'}`;
            logger.logMessage(`GET https://${host}/robots.txt → ${row.http}`);
        } else {
            row.http = 'No comprobado (límite de dominios)';
        }
        const liveOk = !!(live?.success && live.status === 200 && /text\/plain/i.test(live.contentType || ''));
        const text = liveOk ? live.body : (info.root?.content || '');
        const robots = text ? analyzeRobotsTxt(text) : null;

        if (info.root && !isCodeResource(info.root)) {
            row.estado = 'Publicado como Landing Page';
            row.notes.push('Cada lectura del fichero consume una vista (Super Messages): publícalo como Code Resource de tipo Text');
        } else if (info.root || liveOk) {
            if (!liveOk) row.estado = 'No accesible o respuesta no válida';
            else if (robots?.blocksAll) row.estado = 'Bloquea todo el sitio';
            else row.estado = 'Correcto';
            if (info.root && !/text/i.test(info.root.assetType?.name || '')) row.notes.push('El Code Resource no es de tipo Text');
            if (!info.root) row.notes.push('Se sirve fuera de Cloud Pages');
        } else if (info.misplaced.length) {
            row.estado = 'Fuera de la raíz';
            row.asset = info.misplaced.map(p => p.name).join(', ');
            row.notes.push('Los crawlers solo leen /robots.txt en la raíz del dominio');
        } else {
            row.estado = 'Sin robots.txt';
        }

        if (robots) {
            row.blocked = robots.blocksAll ? 'Todos (User-agent: *)' : robots.blockedAgents.join(', ');
            row.missing = robots.missingTraining.join(', ');
            if (robots.blocksAll) row.notes.push('Bloquea también a Google, Bing y previsualizaciones');
        }
        rows.push(row);
    }
    return rows;
}

/**
 * Ejecuta la auditoría de Cloud Pages y pinta la pestaña.
 * @param {object} apiConfig - Configuración autenticada para llamar a la API de SFMC.
 * @param {string} clientName - Clave de caché del contexto activo (cliente + BU).
 * @param {{onProgress?: function(string)}} [options] - Recibe textos de progreso.
 */
export async function auditCloudPages(apiConfig, clientName, { onProgress } = {}) {
    const progress = (msg) => { if (onProgress) onProgress(msg); };

    const fetched = await fetchCloudPagesWithContent(apiConfig, clientName, { onProgress: progress });
    incApiCalls(fetched.apiCalls);
    // Se analiza el código de cada página junto con el de sus slots y bloques colocados.
    const pages = fetched.pages.map(withSlotContent);
    const total = pages.length;

    // ---------- Inventario (tipos, publicación, URL) ----------
    const types = {};
    let publishedCount = 0, noDirectUrlCount = 0;
    registerDrill('cp_total',       'Total Cloud Pages', ['Nombre', 'Tipo', 'Publicada', 'URL', 'Fecha Publicación']);
    registerDrill('cp_published',   'Publicadas',        ['Nombre', 'Tipo', 'URL', 'Fecha Publicación']);
    registerDrill('cp_unpublished', 'Sin publicar',      ['Nombre', 'Tipo']);
    registerDrill('cp_no_url',      'Sin URL Directa',   ['Nombre', 'Tipo', 'Publicada']);

    pages.forEach(p => {
        const typeName = p.assetType?.displayName || 'Otros';
        types[typeName] = (types[typeName] || 0) + 1;
        const dKeyType = `cp_type_${slug(typeName)}`;
        registerDrill(dKeyType, `Tipo: ${typeName}`, ['Nombre', 'Publicada', 'URL', 'Fecha Publicación']);

        const published = isPublished(p);
        const pubDateStr = published ? formatDate(p.publishDate) : '---';
        if (published) publishedCount++;
        const hasUrl = !!(p.url && p.url.startsWith('http'));
        if (!hasUrl) noDirectUrlCount++;
        const url = hasUrl ? p.url : '---';

        addDrillRow('cp_total', esc([p.name, typeName, published ? 'Sí' : 'No', url, pubDateStr]));
        addDrillRow(dKeyType,   esc([p.name, published ? 'Sí' : 'No', url, pubDateStr]));
        if (published) addDrillRow('cp_published', esc([p.name, typeName, url, pubDateStr]));
        else           addDrillRow('cp_unpublished', esc([p.name, typeName]));
        if (!hasUrl)   addDrillRow('cp_no_url', esc([p.name, typeName, published ? 'Sí' : 'No']));
    });
    const unpublishedCount = total - publishedCount;

    // ---------- Datos auxiliares (content blocks y robots.txt) ----------
    progress('Leyendo los content blocks incluidos al inicio de las páginas...');
    const blockContents = await resolveLeadingBlocks(pages, apiConfig);
    progress('Comprobando robots.txt de cada dominio...');
    const robotsRows = await analyzeRobotsByHost(pages);

    // ---------- Análisis de cada página ----------
    progress('Analizando el código de las Cloud Pages...');
    const pagesByUrl = buildPagesByUrl(pages);

    const BOT_COLS = ['Nombre', 'Tipo', 'Publicada', 'URL', 'Vía', 'Incidencias', 'Maneja datos'];
    registerDrill('cp_sec_protected', 'Con control de crawlers', BOT_COLS);
    registerDrill('cp_sec_issues',    'Control de crawlers con incidencias', BOT_COLS);
    registerDrill('cp_sec_guard',     'Sin control de crawlers pero validan parámetros vacíos', BOT_COLS);
    registerDrill('cp_sec_none_data', 'Sin control de crawlers ni validación y manejan datos', BOT_COLS);
    registerDrill('cp_sec_none',      'Sin control de crawlers (sin manejo de datos)', BOT_COLS);
    registerDrill('cp_sec_none_all',  'Publicadas sin control de crawlers', BOT_COLS);

    const PARAM_COLS = ['Nombre', 'Tipo', 'Publicada', 'Parámetros leídos', 'Maneja datos'];
    registerDrill('cp_param_guarded',   'Leen parámetros y comprueban que no lleguen vacíos', PARAM_COLS);
    registerDrill('cp_param_unguarded', 'Leen parámetros sin comprobar que no lleguen vacíos', PARAM_COLS);
    registerDrill('cp_param_single',    'Manejan datos identificando con un solo parámetro', PARAM_COLS);
    registerDrill('cp_idparams',        'Identificadores del suscriptor en la URL', ['Nombre', 'Publicada', 'Parámetros']);
    registerDrill('cp_base64',          'Usan Base64 o StringToHex (codificación, no cifrado)', ['Nombre', 'Publicada']);

    const HEADER_COLS = ['Nombre', 'Publicada', 'URL', 'Cabeceras fijadas', 'Cabeceras que faltan'];
    registerDrill('cp_headers_all',  'Con todas las cabeceras de seguridad', HEADER_COLS);
    registerDrill('cp_headers_some', 'Con algunas cabeceras de seguridad', HEADER_COLS);
    registerDrill('cp_headers_none', 'Sin cabeceras de seguridad', HEADER_COLS);

    const CRED_COLS = ['Nombre', 'Tipo', 'Publicada', 'Hallazgo', 'Clave / variable', 'Valor (enmascarado)', 'Línea'];
    registerDrill('cp_cred_all', 'Posibles credenciales en el código', CRED_COLS);

    registerDrill('cp_remote_exec',  'Ejecutan contenido descargado (TreatAsContent + HTTPGet)', ['Nombre', 'Tipo', 'Publicada', 'Orígenes']);
    registerDrill('cp_remote_share', 'Descargan de servicios de ficheros compartidos', ['Nombre', 'Tipo', 'Publicada', 'Servicios']);

    const CATCH_COLS = ['Nombre', 'Tipo', 'Publicada', 'Categoría', 'Catch vacíos', 'Forma', 'Líneas'];
    registerDrill('cp_catch_all', 'Catch vacíos (errores silenciados)', CATCH_COLS);
    EMPTY_CATCH_CATEGORIES.forEach(c => registerDrill(`cp_catch_${slug(c)}`, `Catch vacíos: ${c}`, CATCH_COLS));

    registerDrill('cp_nonvisual',     'Landing Pages sin parte visual (candidatas a Code Resource)', ['Nombre', 'URL', 'Publicada', 'Motivos']);
    registerDrill('cp_index_open',    'Publicadas que se pueden indexar (sin noindex)', ['Nombre', 'Publicada', 'URL']);
    registerDrill('cp_index_noindex', 'Con noindex', ['Nombre', 'Publicada', 'URL', 'nofollow']);

    const CALL_COLS = ['Página', 'Tipo', 'Publicada', 'Lenguaje', 'Función', 'Endpoint', 'Destino', 'Línea'];
    registerDrill('cp_calls_all', 'Todas las llamadas a endpoints', CALL_COLS);

    const bot = { protegida: 0, incidencias: 0, guard: 0, noneData: 0, none: 0 };
    const param = { guarded: 0, unguarded: 0, single: 0, idParams: 0, base64: 0 };
    const headers = { all: 0, some: 0, none: 0 };
    const remote = { exec: 0, share: 0 };
    const catchPages = Object.fromEntries(EMPTY_CATCH_CATEGORIES.map(c => [c, 0]));
    const credPages = new Set();
    const credKinds = {};
    const callKinds = {};
    const externalHosts = {};
    let nonVisualCount = 0, indexOpen = 0, indexNo = 0, analyzedCount = 0;

    for (const p of pages) {
        const content = p.content || '';
        if (!content.trim() || content.trim().startsWith('{')) continue;
        analyzedCount++;
        const published = isPublished(p);
        const publishedText = pubLabel(p);
        const typeName = p.assetType?.displayName || p.assetType?.name || '';
        const visual = !isCodeResource(p);
        const url = p.url && p.url.startsWith('http') ? p.url : '---';

        const data = detectDataHandling(content);
        // "Maneja datos" sin contar la mera lectura de parámetros: DEs, Salesforce, atributos...
        const dataStores = data.filter(d => d !== 'Parámetros de entrada');
        const validation = detectParamValidation(content);

        // Control de crawlers: solo páginas publicadas (las que se pueden visitar).
        if (published) {
            const prot = analyzeBotProtection(content, blockContents);
            const row = esc([p.name, typeName, publishedText, url, prot.via, prot.issues.join(' | '), data.join(', ')]);
            if (prot.status === 'protegida') { bot.protegida++; addDrillRow('cp_sec_protected', row); }
            else if (prot.status === 'incidencias') { bot.incidencias++; addDrillRow('cp_sec_issues', row); }
            else {
                addDrillRow('cp_sec_none_all', row);
                if (validation.params.length && validation.guarded) { bot.guard++; addDrillRow('cp_sec_guard', row); }
                else if (data.length) { bot.noneData++; addDrillRow('cp_sec_none_data', row); }
                else { bot.none++; addDrillRow('cp_sec_none', row); }
            }
        }

        // Validación de parámetros e identificación
        if (validation.params.length) {
            const row = esc([p.name, typeName, publishedText, validation.params.join(', '), data.join(', ')]);
            if (validation.guarded) { param.guarded++; addDrillRow('cp_param_guarded', row); }
            else { param.unguarded++; addDrillRow('cp_param_unguarded', row); }
            if (dataStores.length && validation.params.length === 1) { param.single++; addDrillRow('cp_param_single', row); }
        }
        const ids = detectIdentifierParams(content);
        if (ids.params.length) { param.idParams++; addDrillRow('cp_idparams', esc([p.name, publishedText, ids.params.join(', ')])); }
        if (ids.base64) { param.base64++; addDrillRow('cp_base64', esc([p.name, publishedText])); }

        // Credenciales
        const creds = detectCredentials(content);
        if (creds.length) credPages.add(p.id);
        for (const c of creds) {
            const key = `cp_cred_${slug(c.kind)}`;
            registerDrill(key, `Credenciales: ${c.kind}`, CRED_COLS);
            const row = esc([p.name, typeName, publishedText, c.kind, c.name, c.masked, c.line]);
            addDrillRow('cp_cred_all', row);
            addDrillRow(key, row);
            credKinds[c.kind] = (credKinds[c.kind] || 0) + 1;
        }

        // Landing Pages que deberían ser Code Resource
        const nonVisual = detectNonVisualEndpoint(p);
        if (nonVisual.length) {
            nonVisualCount++;
            addDrillRow('cp_nonvisual', esc([p.name, url, publishedText, nonVisual.join(', ')]));
        }

        // Indexación y cabeceras: solo tienen sentido en páginas visuales publicadas.
        if (visual && published && !nonVisual.length) {
            const idx = detectIndexing(content);
            if (idx.noindex) { indexNo++; addDrillRow('cp_index_noindex', esc([p.name, publishedText, url, idx.nofollow ? 'Sí' : 'No'])); }
            else { indexOpen++; addDrillRow('cp_index_open', esc([p.name, publishedText, url])); }

            const h = detectSecurityHeaders(content);
            const row = esc([p.name, publishedText, url, h.present.join(', '), h.missing.join(', ')]);
            if (h.missing.length === 0) { headers.all++; addDrillRow('cp_headers_all', row); }
            else if (h.present.length) { headers.some++; addDrillRow('cp_headers_some', row); }
            else { headers.none++; addDrillRow('cp_headers_none', row); }
        }

        // Llamadas a endpoints
        const calls = detectHttpCalls(p, pagesByUrl);
        for (const call of calls) {
            const destino = call.targetPage ? `${call.kind}: ${call.targetPage.name}` : (call.host ? `${call.kind} (${call.host})` : call.kind);
            const row = esc([p.name, typeName, publishedText, call.lang, call.fn, call.target, destino, call.line]);
            addDrillRow('cp_calls_all', row);
            const kindKey = `cp_calls_kind_${slug(call.kind)}`;
            registerDrill(kindKey, `Llamadas: ${call.kind}`, CALL_COLS);
            addDrillRow(kindKey, row);
            callKinds[call.kind] = (callKinds[call.kind] || 0) + 1;
            if (call.kind === 'Externo' && call.host) {
                const hostKey = `cp_calls_host_${slug(call.host)}`;
                registerDrill(hostKey, `Llamadas a ${call.host}`, CALL_COLS);
                addDrillRow(hostKey, row);
                externalHosts[call.host] = (externalHosts[call.host] || 0) + 1;
            }
        }

        // Contenido remoto ejecutado o descargado de servicios de ficheros
        const rc = detectRemoteContent(p, calls);
        const origins = [...new Set(calls.filter(c => c.lang === 'AMPscript' || c.lang === 'SSJS').map(c => c.host).filter(Boolean))];
        if (rc.executesRemote) { remote.exec++; addDrillRow('cp_remote_exec', esc([p.name, typeName, publishedText, origins.join(', ')])); }
        if (rc.fileShareHosts.length) { remote.share++; addDrillRow('cp_remote_share', esc([p.name, typeName, publishedText, rc.fileShareHosts.join(', ')])); }

        // Errores silenciados: una fila por página y categoría.
        for (const g of summarizeEmptyCatches(detectEmptyCatches(content))) {
            const row = esc([p.name, typeName, publishedText, g.category, g.count, g.forms, g.lines]);
            addDrillRow('cp_catch_all', row);
            addDrillRow(`cp_catch_${slug(g.category)}`, row);
            catchPages[g.category]++;
        }
    }

    // ---------- Referencias entre páginas (mapa) ----------
    const graph = buildReferenceGraph(pages);
    registerDrill('cp_refs',            'Referencias entre Cloud Pages', ['Origen', 'Origen publicada', 'Destino', 'Destino publicada', 'Referencia', 'Línea']);
    registerDrill('cp_refs_unresolved', 'Referencias por id sin resolver', ['Página', 'Publicada', 'Referencia']);
    registerDrill('cp_selfref',         'Páginas que se referencian a sí mismas', ['Página', 'Publicada', 'Cómo']);
    graph.edges.forEach(e => addDrillRow('cp_refs', esc([e.from.name, pubLabel(e.from), e.to.name, pubLabel(e.to), e.vias.join(', '), e.line])));
    graph.selfRefs.forEach((vias, p) => addDrillRow('cp_selfref', esc([p.name, pubLabel(p), vias.join(', ')])));
    graph.unresolved.forEach((ids, p) => addDrillRow('cp_refs_unresolved', esc([p.name, pubLabel(p), ids.join(', ')])));

    // ---------- robots.txt: drills ----------
    const ROBOTS_COLS = ['Dominio', 'Estado', 'robots.txt', 'Respuesta HTTP', 'Crawlers bloqueados', 'Faltan por bloquear', 'Observaciones'];
    registerDrill('cp_robots', 'robots.txt por dominio', ROBOTS_COLS);
    const robotsStates = {};
    for (const r of robotsRows) {
        const row = esc([r.host, r.estado, r.asset, r.http, r.blocked, r.missing, r.notes.join(' | ')]);
        addDrillRow('cp_robots', row);
        const key = `cp_robots_${slug(r.estado)}`;
        registerDrill(key, `robots.txt: ${r.estado}`, ROBOTS_COLS);
        addDrillRow(key, row);
        robotsStates[r.estado] = (robotsStates[r.estado] || 0) + 1;
    }

    // ---------- KPIs y avisos ----------
    const publishedAnalyzed = bot.protegida + bot.incidencias + bot.guard + bot.noneData + bot.none;
    const withoutScript = bot.guard + bot.noneData + bot.none;
    const externalCalls = callKinds['Externo'] || 0;
    const missingIds = pages.filter(p => !isCodeResource(p) && !p.pageId).length;

    const kpis = [
        { value: total,            label: 'Total Cloud Pages', color: AUDIT_PALETTE.blue,  drillKey: 'cp_total' },
        { value: publishedCount,   label: 'Publicadas',        color: AUDIT_PALETTE.green, drillKey: 'cp_published' },
        { value: unpublishedCount, label: 'Sin publicar',      color: unpublishedCount > total * 0.5 ? AUDIT_PALETTE.orange : AUDIT_PALETTE.gray, drillKey: 'cp_unpublished' },
        { value: noDirectUrlCount, label: 'Sin URL directa',   color: noDirectUrlCount > 0 ? AUDIT_PALETTE.teal : AUDIT_PALETTE.gray, drillKey: 'cp_no_url' },
        { value: credPages.size,   label: 'Con posibles credenciales', color: credPages.size > 0 ? AUDIT_PALETTE.red : AUDIT_PALETTE.gray, drillKey: 'cp_cred_all' },
        { value: remote.exec,      label: 'Ejecutan contenido descargado', color: remote.exec > 0 ? AUDIT_PALETTE.red : AUDIT_PALETTE.gray, drillKey: 'cp_remote_exec' },
        { value: withoutScript,    label: 'Publicadas sin control de crawlers', color: withoutScript > 0 ? AUDIT_PALETTE.orange : AUDIT_PALETTE.green, drillKey: 'cp_sec_none_all' },
        { value: externalCalls,    label: 'Llamadas a endpoints externos', color: externalCalls > 0 ? AUDIT_PALETTE.teal : AUDIT_PALETTE.gray, drillKey: 'cp_calls_kind_Externo' },
        { value: graph.edges.length, label: 'Referencias entre Cloud Pages', color: AUDIT_PALETTE.teal, drillKey: 'cp_refs' },
    ];

    const callouts = [];
    if (credPages.size > 0) callouts.push({ type: 'danger', title: 'Posibles credenciales en el código',
        message: `${credPages.size} Cloud Pages o Code Resources contienen valores con aspecto de credencial (client id/secret, API keys, tokens, contraseñas...). No tiene por qué ser incorrecto, pero conviene revisar si deben estar en el código.` });
    if (remote.exec > 0) callouts.push({ type: 'danger', title: 'Ejecutan contenido descargado de otro sitio',
        message: `${remote.exec} páginas descargan contenido con HTTPGet y lo ejecutan con TreatAsContent. Quien pueda modificar el origen${remote.share ? ' (hay descargas desde Google Drive, Dropbox u otros servicios de ficheros)' : ''} cambia lo que se ejecuta en Marketing Cloud.` });
    const noRobots = (robotsStates['Sin robots.txt'] || 0) + (robotsStates['Fuera de la raíz'] || 0);
    if (noRobots > 0) callouts.push({ type: 'warning', title: 'Dominios sin robots.txt válido',
        message: `${noRobots} dominio(s) propios no tienen robots.txt en la raíz. Sin él, los crawlers de IA que lo respetan siguen consumiendo vistas (Super Messages).` });
    if (robotsStates['Publicado como Landing Page']) callouts.push({ type: 'warning', title: 'robots.txt publicado como Landing Page',
        message: 'Cada lectura del robots.txt consume una vista. Publícalo como Code Resource de tipo Text.' });
    if (robotsStates['Bloquea todo el sitio']) callouts.push({ type: 'warning', title: 'robots.txt que bloquea todo el sitio',
        message: 'Con "User-agent: *" y "Disallow: /" también se bloquean Google, Bing y las previsualizaciones de enlaces.' });
    if (bot.noneData > 0) callouts.push({ type: 'warning', title: 'Páginas con datos sin control de crawlers ni validación de parámetros',
        message: `En el código de ${bot.noneData} páginas publicadas que manejan datos (DEs, parámetros, Salesforce) no se ha encontrado ni el control de User-Agent ni una comprobación de parámetros vacíos. Si es así, un crawler que las visite ejecuta su lógica. Es un análisis del código: revisa el detalle antes de concluirlo.` });
    if (bot.incidencias > 0) callouts.push({ type: 'warning', title: 'Control de crawlers con incidencias',
        message: `${bot.incidencias} páginas tienen el control de User-Agent pero puede no funcionar como debería (try...catch, no está en la línea 1, listas incompletas...).` });
    const ssjsCatch = catchPages[EMPTY_CATCH_CATEGORIES[0]];
    if (ssjsCatch > 0) callouts.push({ type: 'warning', title: 'Errores silenciados en SSJS',
        message: `${ssjsCatch} páginas tienen bloques catch vacíos en SSJS: si falla una escritura en una DE o una llamada a una API, el error se oculta y nadie se entera.` });
    if (param.single > 0) callouts.push({ type: 'warning', title: 'Identificación con un solo parámetro',
        message: `${param.single} páginas manejan datos leyendo un único parámetro. La guía de seguridad de CloudPages recomienda verificar la identidad con al menos dos.` });
    if (nonVisualCount > 0) callouts.push({ type: 'info', title: 'Landing Pages que podrían ser Code Resource',
        message: `${nonVisualCount} Landing Pages no tienen parte visual (devuelven JSON o procesan envíos). Como Code Resource no consumirían Super Messages por cada visita.` });
    if (robotsStates['Dominio de Salesforce']) callouts.push({ type: 'info', title: 'Dominios de Salesforce',
        message: 'En los dominios proporcionados por Salesforce no se puede publicar robots.txt: solo el script de servidor protege el contenido.' });
    if (graph.unresolved.size > 0 || missingIds > 0) callouts.push({ type: 'info', title: 'Page IDs sin importar',
        message: `${missingIds} Landing Pages no tienen Page ID importado y ${graph.unresolved.size} páginas usan CloudPagesURL/MicrositeURL con ids que no se han podido asociar. Importa los Page IDs en la vista de Cloud Pages (Recuperar IDs) y vuelve a escanear para completar el mapa.` });

    // ---------- Tarjetas ----------
    const inventoryCards = [
        { title: 'Tipos de asset', help: 'Volumetría por funcionalidad: Landing Pages, Code Resources, Microsites…', bars:
            Object.entries(types).sort((a, b) => b[1] - a[1]).map(([label, value]) => ({ label, value, total, drillKey: `cp_type_${slug(label)}` }))
        },
        { title: 'Estado de publicación', help: 'Distribución basada en la presencia de fecha de publicación.', bars: [
            { label: 'Publicadas (con fecha)', value: publishedCount,   total, color: AUDIT_PALETTE.green,  drillKey: 'cp_published' },
            { label: 'Sin publicar',           value: unpublishedCount, total, color: AUDIT_PALETTE.orange, drillKey: 'cp_unpublished' },
            { label: 'Sin URL directa',        value: noDirectUrlCount, total, color: AUDIT_PALETTE.teal, drillKey: 'cp_no_url' },
        ]},
    ];

    const robotsTotal = robotsRows.length;
    const ROBOTS_COLORS = {
        'Correcto': AUDIT_PALETTE.green, 'Sin robots.txt': AUDIT_PALETTE.red, 'Fuera de la raíz': AUDIT_PALETTE.red,
        'Publicado como Landing Page': AUDIT_PALETTE.orange, 'Bloquea todo el sitio': AUDIT_PALETTE.orange,
        'No accesible o respuesta no válida': AUDIT_PALETTE.orange, 'Dominio de Salesforce': AUDIT_PALETTE.gray,
    };
    const credTotal = Object.values(credKinds).reduce((s, v) => s + v, 0);
    const callTotal = Object.values(callKinds).reduce((s, v) => s + v, 0);
    const headerTotal = headers.all + headers.some + headers.none;
    const paramTotal = param.guarded + param.unguarded;

    const securityCards = [
        { title: 'Posibles credenciales en el código', info: INFO.creds,
          help: 'Valores con aspecto de credencial, mostrados enmascarados. Es un aviso para revisar, no un error.', bars:
            Object.entries(credKinds).sort((a, b) => b[1] - a[1]).map(([label, value]) => ({
                label, value, total: credTotal, color: AUDIT_PALETTE.red, drillKey: `cp_cred_${slug(label)}` }))
        },
        { title: 'Contenido remoto', info: INFO.remote,
          help: 'Código que se descarga de otro sitio y se ejecuta en Marketing Cloud.', bars: [
            { label: 'Ejecutan contenido descargado (TreatAsContent)', value: remote.exec,  total: analyzedCount, color: AUDIT_PALETTE.red,    drillKey: 'cp_remote_exec' },
            { label: 'Descargan de servicios de ficheros compartidos', value: remote.share, total: analyzedCount, color: AUDIT_PALETTE.orange, drillKey: 'cp_remote_share' },
        ]},
        { title: 'Validación de parámetros e identificación', info: INFO.params,
          help: 'Buenas prácticas de seguridad de CloudPages sobre los parámetros de entrada.', bars: [
            { label: 'Comprueban que no lleguen vacíos',        value: param.guarded,   total: paramTotal,    color: AUDIT_PALETTE.green,  drillKey: 'cp_param_guarded' },
            { label: 'No comprueban que no lleguen vacíos',     value: param.unguarded, total: paramTotal,    color: AUDIT_PALETTE.orange, drillKey: 'cp_param_unguarded' },
            { label: 'Manejan datos con un solo parámetro',     value: param.single,    total: paramTotal,    color: AUDIT_PALETTE.orange, drillKey: 'cp_param_single' },
            { label: 'Identificadores del suscriptor en URL',   value: param.idParams,  total: analyzedCount, color: AUDIT_PALETTE.orange, drillKey: 'cp_idparams' },
            { label: 'Usan Base64 o StringToHex (no es cifrado)', value: param.base64,  total: analyzedCount, color: AUDIT_PALETTE.orange, drillKey: 'cp_base64' },
        ]},
        { title: 'Errores silenciados (catch vacíos)', info: EMPTY_CATCH_INFO,
          help: 'Páginas con bloques catch vacíos o solo con comentarios, por tipo de código.', bars:
            EMPTY_CATCH_CATEGORIES.map((label, i) => ({ label, value: catchPages[label], total: analyzedCount,
                color: [AUDIT_PALETTE.red, AUDIT_PALETTE.orange, AUDIT_PALETTE.gray][i], drillKey: `cp_catch_${slug(label)}` }))
        },
        { title: 'Cabeceras de seguridad', info: INFO.headers,
          help: 'Páginas visuales publicadas según las cabeceras recomendadas que fijan.', bars: [
            { label: 'Todas las recomendadas', value: headers.all,  total: headerTotal, color: AUDIT_PALETTE.green,  drillKey: 'cp_headers_all' },
            { label: 'Algunas',                value: headers.some, total: headerTotal, color: AUDIT_PALETTE.orange, drillKey: 'cp_headers_some' },
            { label: 'Ninguna',                value: headers.none, total: headerTotal, color: AUDIT_PALETTE.red,    drillKey: 'cp_headers_none' },
        ]},
    ];

    const crawlerCards = [
        { title: 'robots.txt por dominio', info: INFO.robots,
          help: 'Debe ser un Code Resource de tipo Text en la raíz del dominio y responder 200 con text/plain.', bars:
            Object.entries(robotsStates).sort((a, b) => b[1] - a[1]).map(([label, value]) => ({
                label, value, total: robotsTotal, color: ROBOTS_COLORS[label], drillKey: `cp_robots_${slug(label)}` }))
        },
        { title: 'Control de crawlers en el servidor', info: INFO.bots,
          help: 'Páginas publicadas con el script que lee el User-Agent y corta la petición con RaiseError.', bars: [
            { label: 'Con control',                                value: bot.protegida,   total: publishedAnalyzed, color: AUDIT_PALETTE.green,  drillKey: 'cp_sec_protected' },
            { label: 'Con control e incidencias',                  value: bot.incidencias, total: publishedAnalyzed, color: AUDIT_PALETTE.orange, drillKey: 'cp_sec_issues' },
            { label: 'Sin control, pero validan parámetros',       value: bot.guard,       total: publishedAnalyzed, color: AUDIT_PALETTE.blue,   drillKey: 'cp_sec_guard' },
            { label: 'Sin control ni validación y manejan datos',  value: bot.noneData,    total: publishedAnalyzed, color: AUDIT_PALETTE.red,    drillKey: 'cp_sec_none_data' },
            { label: 'Sin control (sin manejo de datos)',          value: bot.none,        total: publishedAnalyzed, color: AUDIT_PALETTE.gray,   drillKey: 'cp_sec_none' },
        ]},
        { title: 'Indexación', info: INFO.index,
          help: 'Páginas visuales publicadas según permitan o no su indexación.', bars: [
            { label: 'Se pueden indexar (sin noindex)', value: indexOpen, total: indexOpen + indexNo, color: AUDIT_PALETTE.orange, drillKey: 'cp_index_open' },
            { label: 'Con noindex',                     value: indexNo,   total: indexOpen + indexNo, color: AUDIT_PALETTE.green,  drillKey: 'cp_index_noindex' },
        ]},
        { title: 'Landing Pages sin parte visual', info: INFO.superMessages,
          help: 'Candidatas a Code Resource: cada visita a una Landing Page consume una vista (Super Messages) y a un Code Resource no. No se muestran consumos reales.', bars: [
            { label: 'Sin parte visual (candidatas a Code Resource)', value: nonVisualCount, total: analyzedCount, color: AUDIT_PALETTE.orange, drillKey: 'cp_nonvisual' },
        ]},
    ];

    const topHosts = Object.entries(externalHosts).sort((a, b) => b[1] - a[1]).slice(0, 12);
    const callCards = [
        { title: 'Destino de las llamadas', info: INFO.calls,
          help: 'Llamadas desde SSJS, AMPscript, JavaScript de navegador y formularios, según a dónde van.', bars:
            Object.entries(callKinds).sort((a, b) => b[1] - a[1]).map(([label, value]) => ({
                label, value, total: callTotal, color: label === 'Externo' ? AUDIT_PALETTE.teal : undefined, drillKey: `cp_calls_kind_${slug(label)}` }))
        },
        { title: 'Dominios externos más llamados', info: INFO.hosts,
          help: 'Endpoints fuera de Marketing Cloud y Salesforce a los que llaman las páginas.', bars:
            topHosts.map(([label, value]) => ({ label, value, total: externalCalls, color: AUDIT_PALETTE.teal, drillKey: `cp_calls_host_${slug(label)}` }))
        },
    ];

    sortDrillsByPublished();
    registerPdfData('cp', kpis, [...inventoryCards, ...securityCards, ...crawlerCards, ...callCards], callouts);

    // El diagrama está en la vista de Cloud Pages; aquí solo los recuentos con su detalle.
    const mapCard = `<div class="audit-metric-card cpmap-card">
        <div class="audit-metric-title">Referencias entre Cloud Pages${buildInfoIcon(INFO.map)}</div>
        <div class="audit-metric-help">Páginas que enlazan, llaman, envían formularios o redirigen a otras.
            <span class="cpmap-drill-link" data-drill="cp_refs" title="Ver detalle">Ver todas las referencias (${graph.edges.length})</span>
            · <span class="cpmap-drill-link" data-drill="cp_selfref" title="Ver detalle">Autorreferencias (${graph.selfRefs.size})</span>
            · <span class="cpmap-drill-link" data-drill="cp_refs_unresolved" title="Ver detalle">Ids sin resolver (${graph.unresolved.size})</span>
        </div>
        <div class="audit-metric-help">El diagrama de referencias, con los content blocks que usa cada página, está en la vista de <b>Cloud Pages</b> (botón <b>Mapa de referencias</b>).</div>
    </div>`;

    const cardsHtml = (cards) => buildGrid(cards.map(c => buildMetricCard(c.title, c.help, c.bars, { info: c.info })));
    document.getElementById('audit-tab-cp').innerHTML = buildTabWrapper(
        buildKpiRow(kpis) + renderCallouts(callouts) +
        buildSection('Inventario', cardsHtml(inventoryCards), { info: INFO.sectionInventory }) +
        buildSection('Seguridad del código', cardsHtml(securityCards), { info: INFO.sectionSecurity }) +
        buildSection('Crawlers e indexación', cardsHtml(crawlerCards), { info: INFO.sectionCrawlers }) +
        buildSection('Llamadas a endpoints', cardsHtml(callCards), { info: INFO.calls }) +
        buildSection('Referencias entre Cloud Pages', mapCard, { info: INFO.map })
    );
}
