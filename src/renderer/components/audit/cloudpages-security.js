// Fichero: src/renderer/components/audit/cloudpages-security.js
// Descripción: Análisis estático del código de Cloud Pages y Code Resources para la auditoría:
// protección frente a crawlers (guía de Salesforce, artículo 005315904), robots.txt, posibles
// credenciales, indexación, identificadores en la URL, cabeceras de seguridad, llamadas a
// endpoints y referencias entre páginas. Sin dependencias de UI ni de API: recibe texto y
// devuelve hallazgos, para que la pestaña de auditoría decida cómo pintarlos.
//
// Todo son heurísticas sobre el código: un hallazgo es un aviso "a revisar", no un error.

// --- Listas de tokens de la guía de Salesforce (noviembre 2026) ---

/** Crawlers de entrenamiento y datasets que la guía recomienda bloquear. */
export const AI_TRAINING_TOKENS = [
    'gptbot', 'claudebot', 'meta-externalagent', 'amazonbot', 'mistralai-training', 'ccbot', 'bytespider', 'googleother'
];

/** Tokens de entrenamiento que solo se usan en robots.txt (nunca llegan en la cabecera). */
export const ROBOTS_ONLY_TOKENS = ['google-extended', 'applebot-extended'];

/** Crawlers de búsqueda con IA (bloqueo opcional según la guía). */
export const AI_SEARCH_TOKENS = [
    'oai-searchbot', 'claude-searchbot', 'perplexitybot', 'meta-webindexer', 'amzn-searchbot', 'mistralai-index', 'duckassistbot'
];

/** Buscadores y previsualizaciones que no conviene bloquear. */
export const ALLOWED_TOKENS = [
    'googlebot', 'bingbot', 'applebot', 'duckduckbot', 'adsbot-google', 'adidxbot', 'google-read-aloud',
    'facebookexternalhit', 'bingpreview', 'microsoftpreview', 'googlemessages', 'slackbot-linkexpanding',
    'slack-imgproxy', 'pinterestbot'
];

/** Dominios proporcionados por Salesforce: en ellos no se puede publicar robots.txt. */
const SALESFORCE_HOST_RE = /(sfmc-content\.com|exacttarget\.com|marketingcloudapps\.com|marketingcloudapis\.com|salesforce\.com|force\.com)$/i;

/** Dominios de las APIs de Marketing Cloud y Salesforce, para clasificar llamadas. */
const SFMC_API_HOST_RE = /(marketingcloudapis\.com|exacttargetapis\.com|exacttarget\.com)$/i;
const SALESFORCE_API_HOST_RE = /(salesforce\.com|force\.com|salesforce-sites\.com)$/i;

// --- Utilidades ---

/**
 * Indica si un asset es un Code Resource (no consume Super Messages por vista).
 * @param {object} page - Cloud Page de la caché.
 * @returns {boolean}
 */
export function isCodeResource(page) {
    return /coderesource/i.test(page?.assetType?.name || '');
}

/**
 * Indica si una Cloud Page está publicada (tiene fecha de publicación real).
 * @param {object} page - Cloud Page de la caché.
 * @returns {boolean}
 */
export function isPublished(page) {
    const d = page?.publishDate || page?.meta?.cloudPages?.publishDate;
    return !!(d && !String(d).startsWith('0001'));
}

/**
 * Descompone una URL en host y ruta normalizados (minúsculas, sin barra final ni query).
 * @param {string} url - URL absoluta.
 * @returns {{host:string, path:string}|null} null si no es una URL http(s) válida.
 */
export function parsePageUrl(url) {
    if (!url || !/^https?:\/\//i.test(url)) return null;
    try {
        const u = new URL(url);
        const path = (u.pathname || '/').replace(/\/+$/, '') || '/';
        return { host: u.hostname.toLowerCase(), path: path.toLowerCase() };
    } catch (e) {
        return null;
    }
}

/**
 * Indica si un dominio es de los que proporciona Salesforce.
 * @param {string} host
 * @returns {boolean}
 */
export function isSalesforceHost(host) {
    return SALESFORCE_HOST_RE.test(host || '');
}

/** Número de línea (1-based) de una posición del texto. */
function lineAt(text, index) {
    let line = 1;
    for (let i = 0; i < index && i < text.length; i++) if (text.charCodeAt(i) === 10) line++;
    return line;
}

/** Escapa un texto para usarlo dentro de una expresión regular. */
function escapeRegExp(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Enmascara un valor sensible para poder mostrarlo en informes sin exponerlo.
 * @param {string} value
 * @returns {string} Valor parcial con su longitud (p. ej. "Ab3x…Qz (32 car.)").
 */
export function maskSecret(value) {
    const v = String(value || '');
    if (v.length <= 8) return `${v.charAt(0)}••• (${v.length} car.)`;
    return `${v.slice(0, 4)}…${v.slice(-2)} (${v.length} car.)`;
}

/**
 * Busca la llave de cierre que corresponde a la llave abierta en `open`, ignorando las que
 * aparecen dentro de cadenas y comentarios.
 * @param {string} code
 * @param {number} open - Posición de la '{'.
 * @returns {number} Posición de la '}' o -1 si no se encuentra.
 */
function findClosingBrace(code, open) {
    let depth = 0;
    let quote = null;
    for (let i = open; i < code.length; i++) {
        const c = code[i];
        if (quote) {
            if (c === '\\') { i++; continue; }
            if (c === quote) quote = null;
            continue;
        }
        if (c === '"' || c === "'" || c === '`') { quote = c; continue; }
        if (c === '/' && code[i + 1] === '/') {
            const nl = code.indexOf('\n', i);
            if (nl === -1) return -1;
            i = nl;
            continue;
        }
        if (c === '/' && code[i + 1] === '*') {
            const end = code.indexOf('*/', i + 2);
            if (end === -1) return -1;
            i = end + 1;
            continue;
        }
        if (c === '{') depth++;
        else if (c === '}') {
            depth--;
            if (depth === 0) return i;
        }
    }
    return -1;
}

/**
 * Indica si una posición del código queda dentro del bloque de algún `try { ... }`.
 * @param {string} code
 * @param {number} index
 * @returns {boolean}
 */
function isInsideTry(code, index) {
    const re = /\btry\s*\{/g;
    let m;
    while ((m = re.exec(code))) {
        const open = m.index + m[0].length - 1;
        if (open > index) break;
        const close = findClosingBrace(code, open);
        if (close === -1 || close > index) return true;
    }
    return false;
}

// --- Content blocks referenciados al inicio de la página ---

/**
 * Devuelve los content blocks que se incluyen al principio de la página (antes del HTML), que
 * es donde la guía propone tener la copia maestra del script anti-crawlers.
 * @param {string} content
 * @returns {Array<{by:'key'|'id'|'name', value:string}>}
 */
export function findLeadingContentBlocks(content) {
    const text = String(content || '');
    const htmlStart = text.search(/<!doctype|<html|<head|<body/i);
    const head = htmlStart === -1 ? text.slice(0, 1500) : text.slice(0, htmlStart);
    const refs = [];
    const re = /ContentBlockBy(Key|Id|Name)\s*\(\s*["']?([^"')]+?)["']?\s*[,)]/gi;
    let m;
    while ((m = re.exec(head))) {
        refs.push({ by: m[1].toLowerCase(), value: m[2].trim() });
    }
    return refs;
}

// --- Protección frente a crawlers (paso 2 de la guía) ---

// Lectura del User-Agent con cualquiera de las formas de SSJS o AMPscript, no solo la de la guía.
const UA_READ_RE = /(?:GetRequestHeader|HTTPRequestHeader|RequestHeader)\s*\(\s*["']User[-_ ]?Agent["']|\bRequest\.UserAgent\b|HTTP_USER_AGENT/i;
const RAISE_ERROR_RE = /\bRaiseError\s*\(/gi;
// Otra forma de cortar la página: redirigir (Platform.Response.Redirect o Redirect de AMPscript).
const REDIRECT_RE = /\b(?:Platform\.Response\.)?Redirect(?:To)?\s*\(/gi;
const SCRIPT_START_RE = /^<script\s+(?:language\s*=\s*["']?javascript["']?\s+)?runat\s*=\s*["']?server["']?/i;
// Patrón genérico "bot" (en una lista o en una expresión regular), que no sea parte de otra palabra.
const GENERIC_BOT_RE = /(^|[^a-z0-9-])bot([^a-z0-9-]|$)/;

/**
 * Analiza si una página tiene el control de User-Agent que corta las peticiones automatizadas.
 * @param {string} content - Código de la página.
 * @param {Map<string,string>} [blockContents] - Contenido de los content blocks del inicio de la
 *   página, indexado por "by:valor" (ver findLeadingContentBlocks).
 * @returns {{status:'protegida'|'incidencias'|'sin', via:string, issues:string[]}}
 */
export function analyzeBotProtection(content, blockContents = new Map()) {
    const text = String(content || '');
    let code = text;
    let via = 'Directo en la página';

    if (!UA_READ_RE.test(text)) {
        // Si no está en la propia página se busca en los content blocks del inicio.
        const fromBlock = findLeadingContentBlocks(text)
            .map(ref => ({ ref, body: blockContents.get(`${ref.by}:${ref.value.toLowerCase()}`) || '' }))
            .find(b => UA_READ_RE.test(b.body));
        if (!fromBlock) return { status: 'sin', via: '', issues: [] };
        code = fromBlock.body;
        via = `Content block (${fromBlock.ref.by}: ${fromBlock.ref.value})`;
    }

    const issues = [];
    const raiseIdx = [];
    let m;
    RAISE_ERROR_RE.lastIndex = 0;
    while ((m = RAISE_ERROR_RE.exec(code))) raiseIdx.push(m.index);

    if (raiseIdx.length === 0) {
        REDIRECT_RE.lastIndex = 0;
        if (REDIRECT_RE.test(code)) {
            via += ' · corta con redirección';
        } else {
            issues.push('Lee el User-Agent pero no se ha encontrado cómo corta la petición (RaiseError o redirección)');
        }
    } else if (raiseIdx.every(i => isInsideTry(code, i))) {
        issues.push('RaiseError está dentro de un try...catch: el error se captura y la página responde 200');
    }

    if (text.length > 0 && !SCRIPT_START_RE.test(text) && !/^%%/.test(text)) {
        issues.push(/^\s/.test(text)
            ? 'Hay espacios o saltos de línea antes del script: debe ir en la línea 1'
            : 'El script no está en la línea 1 (hay contenido antes)');
    }

    // Un patrón genérico "bot" ya cubre los crawlers cuyo nombre lo contiene (gptbot, claudebot...).
    const lower = code.toLowerCase();
    const genericBot = GENERIC_BOT_RE.test(lower);
    const missing = AI_TRAINING_TOKENS.filter(t => !lower.includes(t) && !(genericBot && t.includes('bot')));
    if (missing.length > 0) issues.push(`No incluye estos crawlers de entrenamiento: ${missing.join(', ')}`);

    // El patrón genérico "bot" sin lista de permitidos también bloquea Google, Bing y previsualizaciones.
    if (genericBot && !lower.includes('googlebot')) {
        issues.push('Bloquea el patrón genérico "bot" sin lista de permitidos (Googlebot, bingbot, previsualizaciones)');
    }

    return { status: issues.length ? 'incidencias' : 'protegida', via, issues };
}

// --- Errores silenciados (catch vacíos) ---

// Líneas más largas que esto se consideran código minificado (normalmente librerías incrustadas).
const MINIFIED_LINE_LENGTH = 500;

/** Categorías de catch vacíos, en el orden en que se muestran (de más a menos relevante). */
export const EMPTY_CATCH_CATEGORIES = ['SSJS (servidor)', 'JavaScript del navegador', 'Código minificado (librerías)'];

/** Explicación del icono "i" de la tarjeta de catch vacíos (Cloud Pages y Contenidos). */
export const EMPTY_CATCH_INFO =
    'Busca bloques catch vacíos o que solo tienen comentarios: try { ... } catch (e) { } y promesas .catch(function () { }) / .catch(() => { }).\n' +
    'Un catch vacío oculta el error: si falla una escritura en una DE, un Lookup o una llamada a una API, la página o el email siguen como si nada y nadie se entera. En SSJS también puede tragarse un RaiseError.\n' +
    '- SSJS (servidor): dentro de <script runat="server">. Es lo más relevante.\n' +
    '- JavaScript del navegador: el resto de scripts.\n' +
    '- Código minificado: líneas muy largas, normalmente librerías incrustadas (jQuery...), que no se suelen tocar.\n' +
    'El detalle muestra las líneas para revisarlas. AMPscript no tiene try/catch.';

/**
 * Devuelve los tramos de código SSJS (<script runat="server"> ... </script>).
 * @param {string} text
 * @returns {Array<[number, number]>} Pares [inicio, fin].
 */
function ssjsRanges(text) {
    const ranges = [];
    const re = /<script\b[^>]*runat\s*=\s*["']?server["']?[^>]*>([\s\S]*?)<\/script>/gi;
    let m;
    while ((m = re.exec(text))) {
        // Los bloques language="ampscript" también llevan runat=server, pero no son SSJS.
        if (/language\s*=\s*["']?ampscript/i.test(m[0].slice(0, m[0].indexOf('>') + 1))) continue;
        ranges.push([m.index, m.index + m[0].length]);
    }
    return ranges;
}

/**
 * Detecta bloques catch vacíos o que solo contienen comentarios, en SSJS y en JavaScript de
 * navegador: try { } catch (e) { } y promesas .catch(function () { }) / .catch(() => { }).
 * Un catch vacío oculta el error: si falla la escritura en una DE o una llamada a una API, la
 * página sigue como si nada y nadie se entera.
 * @param {string} content - Código del asset.
 * @returns {Array<{lang:'SSJS'|'JavaScript', form:string, line:number, minified:boolean}>}
 */
export function detectEmptyCatches(content) {
    const text = String(content || '');
    if (!/catch/i.test(text)) return [];
    const ssjs = ssjsRanges(text);
    const inSsjs = (i) => ssjs.some(([a, b]) => i >= a && i < b);
    const found = [];
    const patterns = [
        { form: 'try...catch', re: /\bcatch\s*(?:\(\s*[\w$]*\s*\))?\s*\{/g },
        { form: '.catch() de promesa', re: /\.catch\s*\(\s*(?:function\s*[\w$]*\s*\([^)]*\)|\([^)]*\)\s*=>|[\w$]+\s*=>)\s*\{/g },
    ];
    for (const p of patterns) {
        let m;
        while ((m = p.re.exec(text))) {
            const open = m.index + m[0].length - 1;
            const close = findClosingBrace(text, open);
            if (close === -1) continue;
            const body = text.slice(open + 1, close)
                .replace(/\/\*[\s\S]*?\*\//g, '')
                .replace(/\/\/[^\n]*/g, '')
                .trim();
            if (body !== '') continue;
            const lineStart = text.lastIndexOf('\n', m.index) + 1;
            const lineEnd = text.indexOf('\n', m.index);
            const lineLength = (lineEnd === -1 ? text.length : lineEnd) - lineStart;
            found.push({
                lang: inSsjs(m.index) ? 'SSJS' : 'JavaScript',
                form: p.form,
                line: lineAt(text, m.index),
                minified: lineLength > MINIFIED_LINE_LENGTH,
            });
        }
    }
    return found;
}

/**
 * Agrupa los catch vacíos de un asset por categoría para los informes: SSJS (código de
 * servidor), JavaScript propio y código minificado (librerías).
 * @param {Array<object>} catches - Resultado de detectEmptyCatches.
 * @returns {Array<{category:string, count:number, lines:string, forms:string}>}
 */
export function summarizeEmptyCatches(catches) {
    const groups = new Map();
    for (const c of catches) {
        const category = c.minified ? 'Código minificado (librerías)' : (c.lang === 'SSJS' ? 'SSJS (servidor)' : 'JavaScript del navegador');
        if (!groups.has(category)) groups.set(category, []);
        groups.get(category).push(c);
    }
    return [...groups.entries()].map(([category, list]) => {
        const lines = [...new Set(list.map(c => c.line))];
        return {
            category,
            count: list.length,
            lines: lines.slice(0, 15).join(', ') + (lines.length > 15 ? '…' : ''),
            forms: [...new Set(list.map(c => c.form))].join(', '),
        };
    });
}

// --- Manejo de datos ---

const DATA_PATTERNS = [
    { re: /\bLookup(?:Ordered)?Rows\s*\(|\bLookup\s*\(/i, label: 'Lectura de DE (Lookup)' },
    { re: /DataExtension\.Init\s*\(|\.Rows\.(?:Lookup|Retrieve)\s*\(/i, label: 'DataExtension (SSJS)' },
    { re: /\b(?:Insert|Update|Upsert|Delete)(?:Data|DE)\s*\(/i, label: 'Escritura en DE' },
    { re: /\b(?:RetrieveSalesforceObjects|CreateSalesforceObject|UpdateSingleSalesforceObject)\s*\(/i, label: 'Objetos Salesforce' },
    { re: /\bAttributeValue\s*\(/i, label: 'Atributos del suscriptor' },
    { re: /\bWSProxy\b/i, label: 'WSProxy' },
    { re: /\b(?:RequestParameter|QueryParameter|GetQueryStringParameter|GetFormField)\s*\(|GetPostData\s*\(/i, label: 'Parámetros de entrada' },
];

/**
 * Detecta si una página lee o escribe datos (DEs, objetos de Salesforce, parámetros...).
 * @param {string} content
 * @returns {string[]} Etiquetas de lo encontrado.
 */
export function detectDataHandling(content) {
    const text = String(content || '');
    return DATA_PATTERNS.filter(p => p.re.test(text)).map(p => p.label);
}

// --- Landing pages que deberían ser Code Resource (paso 3 de la guía) ---

/**
 * Detecta Landing Pages sin parte visual (devuelven JSON o solo procesan envíos), candidatas a
 * Code Resource para no consumir Super Messages por cada visita.
 * @param {object} page - Cloud Page de la caché.
 * @returns {string[]} Motivos (vacío si no aplica).
 */
export function detectNonVisualEndpoint(page) {
    if (isCodeResource(page)) return [];
    const text = String(page?.content || '');
    if (!text.trim() || /<html|<body|<!doctype/i.test(text)) return [];

    const reasons = ['No tiene HTML visual'];
    if (/application\/json|Stringify\s*\(/i.test(text)) reasons.push('Devuelve JSON');
    if (/GetPostData\s*\(|GetFormField\s*\(/i.test(text)) reasons.push('Procesa datos enviados');
    if (/SetResponseHeader\s*\(|ContentType\s*=/i.test(text)) reasons.push('Fija cabeceras de respuesta');
    if (/\b(?:Redirect|RedirectTo)\s*\(/i.test(text)) reasons.push('Solo redirige');
    return reasons.length > 1 ? reasons : [];
}

// --- Posibles credenciales ---

// Nombres de clave/variable que suelen guardar secretos (con prefijos o sufijos libres).
const SECRET_NAME = String.raw`(?:client[_\-]?secret|client[_\-]?id|app[_\-]?(?:secret|key|id)|api[_\-]?(?:key|secret|token)|x[_\-]api[_\-]key|subscription[_\-]?key|ocp[_\-]apim[_\-]subscription[_\-]key|access[_\-]?token|refresh[_\-]?token|auth[_\-]?(?:token|key)|bearer[_\-]?token|id[_\-]?token|secret[_\-]?key|private[_\-]?key|consumer[_\-]?(?:key|secret)|shared[_\-]?secret|signing[_\-]?(?:key|secret)|webhook[_\-]?secret|password|passwd|pwd|contrase(?:ñ|n)a|secret|token|credentials?)`;

// "nombre" : "valor" | nombre = "valor" | SET @nombre = "valor" | setHeader("nombre", "valor")
const ASSIGNMENT_RE = new RegExp(
    String.raw`["']?([@$]?[A-Za-z0-9_\-]*${SECRET_NAME}[A-Za-z0-9_\-]*)["']?\s*(?:[:=]|,)\s*["']([^"'\r\n]{6,200})["']`,
    'gi'
);

// Nombres que contienen las palabras anteriores pero no guardan secretos (URL del token, campo
// del formulario, nombre de columna...).
const NON_SECRET_NAME_RE = /(url|uri|endpoint|host|path|field|column|label|placeholder|name|nombre|type|tipo|length|expir|header|param|table|dataextension|_de|input|form|class|style|id_?field)$/i;
const PASSWORD_NAME_RE = /(password|passwd|pwd|contrase|secret)/i;

const KNOWN_FORMATS = [
    { re: /\bAKIA[0-9A-Z]{16}\b/g, label: 'Clave de acceso de AWS' },
    { re: /\bAIza[0-9A-Za-z_\-]{35}\b/g, label: 'API key de Google' },
    { re: /\bxox[abprs]-[0-9A-Za-z\-]{10,}\b/g, label: 'Token de Slack' },
    { re: /\b(?:sk|rk)_live_[0-9A-Za-z]{16,}\b/g, label: 'Clave de Stripe' },
    { re: /\bgh[pousr]_[0-9A-Za-z]{36,}\b/g, label: 'Token de GitHub' },
    { re: /\bSG\.[0-9A-Za-z_\-]{16,}\.[0-9A-Za-z_\-]{16,}\b/g, label: 'API key de SendGrid' },
    { re: /\beyJ[0-9A-Za-z_\-]{10,}\.eyJ[0-9A-Za-z_\-]{10,}\.[0-9A-Za-z_\-]{10,}/g, label: 'Token JWT' },
    { re: /-----BEGIN (?:RSA |EC |DSA |OPENSSH |ENCRYPTED )?PRIVATE KEY-----/g, label: 'Clave privada' },
];

/**
 * Decide si un valor parece un secreto real y no un nombre de campo, una variable o una URL.
 * @param {string} name - Nombre de la clave/variable.
 * @param {string} value - Valor literal asignado.
 * @returns {boolean}
 */
function looksLikeSecret(name, value) {
    const v = value.trim();
    if (v.length < 6) return false;
    if (/^(@|%%|\{\{|\$\{|https?:|\/|#|\+|javascript:)/i.test(v)) return false;
    // Con espacios suele ser un texto de la interfaz (placeholder, etiqueta), no una clave.
    if (/\s/.test(v)) return false;
    if (/^(x{3,}|\*{3,}|your|tu_|changeme|example|ejemplo|undefined|null|true|false|bearer|basic)/i.test(v)) return false;
    if (/^(application|text|multipart)\//i.test(v)) return false;
    // Los secretos suelen mezclar letras y números o ser largos; las contraseñas pueden no hacerlo.
    if (PASSWORD_NAME_RE.test(name)) return true;
    return (/[0-9]/.test(v) && /[A-Za-z]/.test(v)) || v.length >= 20;
}

/**
 * Busca posibles credenciales escritas en el código: asignaciones a variables o claves JSON con
 * nombres de secreto, cabeceras Authorization, URLs con usuario y contraseña, parámetros de URL,
 * formatos conocidos (AWS, Google, JWT, claves privadas...) y peticiones de token a SFMC.
 * @param {string} content
 * @returns {Array<{kind:string, name:string, masked:string, line:number}>}
 */
export function detectCredentials(content) {
    const text = String(content || '');
    const found = new Map();
    const add = (kind, name, value, index) => {
        const masked = value ? maskSecret(value) : '(no literal)';
        const key = `${kind}|${name.toLowerCase()}|${masked}`;
        if (!found.has(key)) found.set(key, { kind, name, masked, line: lineAt(text, index) });
    };
    let m;

    ASSIGNMENT_RE.lastIndex = 0;
    while ((m = ASSIGNMENT_RE.exec(text))) {
        // El valor capturado puede ser a su vez la clave de la siguiente asignación
        // ("grant_type":"client_credentials","client_id":"..."): se vuelve a analizar desde él.
        ASSIGNMENT_RE.lastIndex = m.index + m[0].length - m[2].length - 1;
        const name = m[1].replace(/^[@$]/, '');
        if (NON_SECRET_NAME_RE.test(name)) continue;
        if (looksLikeSecret(name, m[2])) add('Valor asignado a una clave o variable', m[1], m[2], m.index);
    }

    const authRe = /Authorization["']?\s*(?:[:=]|,)\s*["'](Bearer|Basic)\s+([A-Za-z0-9._~+\/=\-]{8,})["']/gi;
    while ((m = authRe.exec(text))) add('Cabecera Authorization con valor fijo', `Authorization: ${m[1]}`, m[2], m.index);

    const userPassRe = /https?:\/\/([^\s"'\/:@<>]+):([^\s"'\/@<>]+)@[^\s"'<>]+/gi;
    while ((m = userPassRe.exec(text))) add('URL con usuario y contraseña', m[1], m[2], m.index);

    const queryRe = /[?&](api[_\-]?key|apikey|key|token|access_token|client_secret|client_id|secret|password|pwd|sig|signature|code)=([^&"'\s<>#%@]{6,})/gi;
    while ((m = queryRe.exec(text))) {
        if (looksLikeSecret(m[1], m[2])) add('Credencial en parámetro de URL', m[1], m[2], m.index);
    }

    for (const f of KNOWN_FORMATS) {
        f.re.lastIndex = 0;
        while ((m = f.re.exec(text))) add('Formato de credencial conocido', f.label, m[0], m.index);
    }

    // Pedir un token de SFMC desde la página implica tener credenciales a mano (en el código o
    // en una DE). Se avisa aunque no sean literales para revisar de dónde salen.
    const tokenIdx = text.search(/\/v[12]\/token|\/v1\/requestToken/i);
    if (tokenIdx !== -1 && /client_?id|clientid/i.test(text)) {
        const literal = [...found.values()].some(f => /client/i.test(f.name));
        if (!literal) add('Pide un token de la API de SFMC', 'v2/token', '', tokenIdx);
    }

    return [...found.values()];
}

// --- Indexación, identificadores en la URL y cabeceras ---

/**
 * Detecta si la página impide su indexación (meta robots o cabecera X-Robots-Tag).
 * @param {string} content
 * @returns {{noindex:boolean, nofollow:boolean}}
 */
export function detectIndexing(content) {
    const text = String(content || '');
    const metas = text.match(/<meta[^>]+>/gi) || [];
    let directives = '';
    for (const meta of metas) {
        if (/name\s*=\s*["']?(robots|googlebot)["']?/i.test(meta)) {
            const c = meta.match(/content\s*=\s*["']([^"']*)["']/i);
            if (c) directives += ' ' + c[1].toLowerCase();
        }
    }
    const header = text.match(/X-Robots-Tag["']\s*,\s*["']([^"']+)["']/i);
    if (header) directives += ' ' + header[1].toLowerCase();
    return { noindex: /noindex|none/.test(directives), nofollow: /nofollow|none/.test(directives) };
}

const ID_PARAM_NAME_RE = /(subscriber|suscriptor|contact|e_?mail|correo|^mail$|skey|^sk$|^id$|customer|cliente|dni|nif|phone|telef|^tel$|mobile|movil|usuario|^user|lead)/i;

/**
 * Detecta identificadores del suscriptor que se leen o se envían por la URL. Con CloudPagesURL
 * llegan cifrados, pero leídos así no se puede distinguir: se avisa para revisarlo.
 * @param {string} content
 * @returns {{params:string[], base64:boolean}}
 */
export function detectIdentifierParams(content) {
    const text = String(content || '');
    const params = new Set();
    let m;
    const readRe = /(?:RequestParameter|QueryParameter|GetQueryStringParameter|GetFormField)\s*\(\s*["']([^"']+)["']/gi;
    while ((m = readRe.exec(text))) if (ID_PARAM_NAME_RE.test(m[1])) params.add(`${m[1]} (lectura)`);
    // Enlaces que montan el identificador en claro: ?email=%%emailaddr%% o ?sk=" + variable
    const linkRe = /[?&](e?mail\w*|subscriberkey|skey|sk|contactkey|emailaddr\w*|id_?cliente|customerid)=(%%|@|["'`]\s*\+)/gi;
    while ((m = linkRe.exec(text))) params.add(`${m[1]} (enlace en claro)`);
    // La guía de seguridad de CloudPages desaconseja Base64 y StringToHex para datos sensibles:
    // se decodifican sin clave (CloudPagesURL sí cifra).
    return { params: [...params], base64: /\bBase64(?:Encode|Decode)\s*\(|\bStringToHex\s*\(|\bHexToString\s*\(|\batob\s*\(|\bbtoa\s*\(/i.test(text) };
}

/** Cabeceras de seguridad que recomienda la guía de seguridad de CloudPages de Salesforce. */
export const SECURITY_HEADERS = [
    'strict-transport-security', 'x-xss-protection', 'x-frame-options', 'x-content-type-options',
    'referrer-policy', 'content-security-policy'
];

/**
 * Devuelve las cabeceras de seguridad que fija la página: con
 * Platform.Response.SetResponseHeader / AddResponseHeader (SSJS), HTTPHeader... o como
 * <meta http-equiv>. Solo se comprueba que se fijen, no su valor.
 * @param {string} content
 * @returns {{present:string[], missing:string[]}}
 */
export function detectSecurityHeaders(content) {
    const lower = String(content || '').toLowerCase();
    const present = SECURITY_HEADERS.filter(h =>
        new RegExp(`(?:setresponseheader|addresponseheader|httpheader)\\s*\\(\\s*["']${h}["']`).test(lower) ||
        new RegExp(`http-equiv\\s*=\\s*["']${h}["']`).test(lower)
    );
    return { present, missing: SECURITY_HEADERS.filter(h => !present.includes(h)) };
}

// --- Validación de parámetros (guía de seguridad de CloudPages) ---

/**
 * Revisa cómo trata la página sus parámetros de entrada, según la guía de seguridad de
 * CloudPages: debe comprobar que no llegan vacíos (If global) antes de procesar nada y
 * verificar la identidad del suscriptor con al menos dos parámetros.
 * @param {string} content
 * @returns {{params:string[], guarded:boolean}} params: nombres leídos de la petición;
 *   guarded: si alguna variable que recibe un parámetro se comprueba vacía/nula.
 */
export function detectParamValidation(content) {
    const text = String(content || '');
    const params = new Set();
    const vars = new Set();
    let m;

    const readRe = /(?:RequestParameter|QueryParameter|GetQueryStringParameter|GetFormField|GetPostData)\s*\(\s*["']?([^"')]*)["']?\s*\)/gi;
    while ((m = readRe.exec(text))) if (m[1]) params.add(m[1]);

    // Variables que reciben un parámetro: SET @v = RequestParameter(...) / var v = ...GetQueryStringParameter(...)
    const assignRe = /(?:SET\s+(@\w+)|(?:var|let|const)\s+(\w+)|(\b\w+))\s*=\s*(?:Platform\.Request\.|Request\.)?(?:RequestParameter|QueryParameter|GetQueryStringParameter|GetFormField)\s*\(/gi;
    while ((m = assignRe.exec(text))) vars.add((m[1] || m[2] || m[3]).replace(/^@/, ''));

    let guarded = false;
    for (const v of vars) {
        const n = escapeRegExp(v);
        const checks = [
            new RegExp(String.raw`(?:Empty|IsNull)\s*\(\s*@${n}\s*\)`, 'i'),
            new RegExp(String.raw`@${n}\s*==\s*["']{2}`, 'i'),
            new RegExp(String.raw`!\s*${n}\b(?!\s*=)`),
            new RegExp(String.raw`\b${n}\s*={2,3}\s*(?:["']{2}|null|undefined)`),
            new RegExp(String.raw`\b${n}\s*!={1,2}\s*(?:["']{2}|null|undefined)`),
            new RegExp(String.raw`\b${n}\.length\s*(?:==|===|<|>)`),
        ];
        if (checks.some(re => re.test(text))) { guarded = true; break; }
    }
    return { params: [...params], guarded };
}

// --- Contenido remoto ---

// Servicios de ficheros compartidos: no son servidores de aplicación y su contenido lo puede
// cambiar cualquiera con acceso al fichero.
const FILE_SHARE_HOST_RE = /(drive\.google\.com|docs\.google\.com|googleusercontent\.com|dropbox\.com|dropboxusercontent\.com|onedrive\.live\.com|1drv\.ms|sharepoint\.com|raw\.githubusercontent\.com|gist\.githubusercontent\.com|pastebin\.com|wetransfer\.com)$/i;

/**
 * Detecta contenido que la página descarga y ejecuta en el servidor: TreatAsContent aplicado al
 * resultado de HTTPGet (el código remoto se ejecuta como AMPscript/SSJS) y descargas desde
 * servicios de ficheros compartidos (Drive, Dropbox, OneDrive...).
 * @param {object} page - Página de la caché.
 * @param {Array<object>} calls - Llamadas ya detectadas con detectHttpCalls.
 * @returns {{executesRemote:boolean, fileShareHosts:string[]}}
 */
export function detectRemoteContent(page, calls) {
    const text = String(page?.content || '');
    const executesRemote = /TreatAsContent\s*\(\s*(?:HTTPGet|HTTPPost2?|Platform\.Function\.HTTPGet)\s*\(/i.test(text)
        || /TreatAsContent\s*\(\s*@\w+\s*\)/i.test(text) && /SET\s+@\w+\s*=\s*HTTPGet\s*\(/i.test(text);
    const fileShareHosts = [...new Set(calls.filter(c => FILE_SHARE_HOST_RE.test(c.host || '')).map(c => c.host))];
    return { executesRemote, fileShareHosts };
}

// --- Llamadas a endpoints ---

// Argumento de la función: literal entre comillas, plantilla o nombre de variable.
const ARG = String.raw`("[^"\r\n]*"|'[^'\r\n]*'|` + '`[^`]*`' + String.raw`|[@$A-Za-z_][\w.$\[\]]*)`;

const CALL_PATTERNS = [
    { lang: 'SSJS', fn: 'HTTP.Post / HTTP.Get', re: new RegExp(String.raw`\bHTTP\.(?:Post|Get|PostRequest|GetRequest)\s*\(\s*${ARG}`, 'g') },
    { lang: 'SSJS', fn: 'Platform.Function.HTTP', re: new RegExp(String.raw`Platform\.Function\.HTTP(?:Post|Get)\s*\(\s*${ARG}`, 'gi') },
    { lang: 'SSJS', fn: 'Script.Util', re: new RegExp(String.raw`Script\.Util\.(?:HttpRequest|HttpGet|HttpPost)\s*\(\s*${ARG}`, 'gi') },
    { lang: 'AMPscript', fn: 'HTTPGet / HTTPPost', re: new RegExp(String.raw`(?<![.\w])HTTP(?:Get|Post2?)\s*\(\s*${ARG}`, 'gi') },
    { lang: 'JavaScript', fn: 'fetch', re: new RegExp(String.raw`\bfetch\s*\(\s*${ARG}`, 'g') },
    { lang: 'JavaScript', fn: 'axios', re: new RegExp(String.raw`\baxios(?:\.(?:get|post|put|patch|delete))?\s*\(\s*${ARG}`, 'g') },
    { lang: 'JavaScript', fn: 'jQuery', re: new RegExp(String.raw`\$\.(?:get|post|getJSON)\s*\(\s*${ARG}`, 'g') },
    { lang: 'JavaScript', fn: 'jQuery.ajax', re: new RegExp(String.raw`\$\.ajax\s*\(\s*\{[\s\S]{0,400}?\burl\s*:\s*${ARG}`, 'g') },
    { lang: 'JavaScript', fn: 'XMLHttpRequest', re: new RegExp(String.raw`\.open\s*\(\s*["'](?:GET|POST|PUT|PATCH|DELETE)["']\s*,\s*${ARG}`, 'gi') },
    { lang: 'JavaScript', fn: 'sendBeacon', re: new RegExp(String.raw`navigator\.sendBeacon\s*\(\s*${ARG}`, 'g') },
    { lang: 'HTML', fn: 'form action', re: /<form\b[^>]*?\baction\s*=\s*("[^"]*"|'[^']*')/gi },
];

// Destinos que apuntan a la propia página (formularios que se envían a sí mismos, etc.).
const SELF_TARGET_RE = /^$|^\?|RequestParameter\s*\(\s*["']PAGEURL["']|^\{(?:window\.|document\.)?location\b/i;

// Rutas de la API REST de Marketing Cloud: delatan el destino aunque la base sea una variable.
const SFMC_REST_PATH_RE = /^\/?(?:interaction|automation|data|asset|hub|contacts|messaging|platform|address|push|sms|legacy)\/v\d|\/v2\/token/i;

// Variable AMPscript impresa dentro de un literal: "%%=v(@url)=%%" o "%%=@url=%%".
const AMP_PRINT_RE = /^%%=\s*(?:v\s*\(\s*)?(@\w+)\s*\)?\s*=%%$/i;

// Inicio de otra sentencia AMPscript en la misma línea: corta una expresión sin punto y coma.
const AMP_NEXT_STATEMENT_RE = /^\s+(?:SET|IF|ELSE|ELSEIF|ENDIF|VAR|FOR|NEXT|OUTPUT|THEN)\b|^\s*\]%%|^\s*=%%/i;

/** Profundidad máxima al resolver variables que dependen de otras variables. */
const MAX_RESOLVE_DEPTH = 3;

/**
 * Lee una expresión desde una posición hasta su final: la coma, el paréntesis o la llave que
 * cierra el argumento, un punto y coma, un salto de línea o el inicio de otra sentencia AMPscript,
 * siempre fuera de cadenas y de paréntesis anidados.
 * @param {string} code
 * @param {number} start
 * @returns {string} Texto de la expresión.
 */
function readExpression(code, start) {
    let depth = 0;
    let quote = null;
    let i = start;
    for (; i < code.length && i - start < 600; i++) {
        const c = code[i];
        if (quote) {
            if (c === '\\') { i++; continue; }
            if (c === quote) quote = null;
            continue;
        }
        if (c === '"' || c === "'" || c === '`') { quote = c; continue; }
        if (c === '(' || c === '[' || c === '{') { depth++; continue; }
        if (c === ')' || c === ']' || c === '}') { if (depth === 0) break; depth--; continue; }
        if (depth === 0 && (c === ',' || c === ';' || c === '\n' || c === '\r')) break;
        if (depth === 0 && /\s/.test(c) && AMP_NEXT_STATEMENT_RE.test(code.slice(i, i + 12))) break;
    }
    return code.slice(start, i).trim();
}

/**
 * Divide una expresión por un separador ("+" o ",") que esté fuera de cadenas y paréntesis.
 * @param {string} expr
 * @param {string} sep
 * @returns {string[]}
 */
function splitTopLevel(expr, sep) {
    const parts = [];
    let depth = 0;
    let quote = null;
    let last = 0;
    for (let i = 0; i < expr.length; i++) {
        const c = expr[i];
        if (quote) {
            if (c === '\\') { i++; continue; }
            if (c === quote) quote = null;
            continue;
        }
        if (c === '"' || c === "'" || c === '`') { quote = c; continue; }
        if (c === '(' || c === '[' || c === '{') depth++;
        else if (c === ')' || c === ']' || c === '}') depth--;
        else if (c === sep && depth === 0) { parts.push(expr.slice(last, i)); last = i + 1; }
    }
    parts.push(expr.slice(last));
    return parts;
}

/**
 * Busca a qué se asigna una variable (SSJS/JS, SET @var de AMPscript o propiedad de un objeto
 * literal obj.prop) y evalúa esa expresión.
 * @param {string} code
 * @param {string} rawName - Nombre tal cual aparece (con @ en AMPscript, o a.b).
 * @param {number} depth - Nivel de anidamiento (para no entrar en bucles).
 * @returns {{value:string, resolved:boolean}|null} null si no se encuentra la asignación.
 */
function resolveName(code, rawName, depth) {
    if (depth > MAX_RESOLVE_DEPTH) return null;
    const isAmp = rawName.startsWith('@');
    const name = rawName.replace(/^[@$]/, '');
    const dot = name.lastIndexOf('.');
    if (dot > 0 && !isAmp) {
        // obj.prop → se busca "prop: ..." dentro de la declaración de obj.
        const obj = escapeRegExp(name.slice(0, dot));
        const prop = escapeRegExp(name.slice(dot + 1));
        const decl = code.search(new RegExp(String.raw`\b${obj}\s*=\s*\{`));
        if (decl === -1) return null;
        const block = code.slice(decl, decl + 3000);
        const m = new RegExp(String.raw`["']?\b${prop}["']?\s*:\s*`).exec(block);
        if (!m) return null;
        return evaluateExpression(block, readExpression(block, m.index + m[0].length), depth + 1);
    }

    const n = escapeRegExp(name);
    const assignRes = isAmp
        ? [new RegExp(String.raw`SET\s+@${n}\s*=\s*`, 'i')]
        : [new RegExp(String.raw`(?:var|let|const)\s+${n}\s*=(?!=)\s*`), new RegExp(String.raw`(?:^|[^\w.$])${n}\s*=(?!=)\s*`, 'm')];
    for (const re of assignRes) {
        const m = re.exec(code);
        if (!m) continue;
        const r = evaluateExpression(code, readExpression(code, m.index + m[0].length), depth + 1);
        // Si todo el valor es desconocido (p. ej. sale de un Lookup) se muestra el nombre de la variable.
        return (!r.resolved && /^\{[^{}]*\}$/.test(r.value)) ? null : r;
    }
    return null;
}

/**
 * Evalúa una expresión de destino: concatena literales y variables resueltas (con "+",
 * Concat() de AMPscript o plantillas ${}) y deja las partes desconocidas como {nombre}, de modo
 * que "https://" + base + ".auth.marketingcloudapis.com" queda "https://{base}.auth.marketingcloudapis.com".
 * @param {string} code
 * @param {string} expr
 * @param {number} [depth=0]
 * @returns {{value:string, resolved:boolean}} resolved: no quedan partes desconocidas.
 */
function evaluateExpression(code, expr, depth = 0) {
    const e = String(expr || '').trim();
    const concat = e.match(/^Concat\s*\(([\s\S]*)\)$/i);
    const parts = concat ? splitTopLevel(concat[1], ',') : splitTopLevel(e, '+');
    let value = '';
    let resolved = true;
    const unknown = (label) => { value += `{${label}}`; resolved = false; };

    for (const raw of parts) {
        const p = raw.trim();
        if (!p) continue;

        if (/^["'`]/.test(p) && p.length >= 2 && p[p.length - 1] === p[0]) {
            const literal = p.slice(1, -1).replace(/\$\{\s*([^}]*?)\s*\}/g, '{$1}');
            // "%%=RedirectTo(CloudPagesURL(123, ...))=%%" o "%%=CloudPagesURL(123)=%%": otra Cloud Page por id.
            const ampId = literal.trim().match(/^%%=\s*(?:RedirectTo\s*\(\s*)?(CloudPagesURL|MicrositeURL)\s*\(\s*(\d+)/i);
            if (ampId) { value += `${ampId[1]}(${ampId[2]})`; continue; }
            const amp = literal.trim().match(AMP_PRINT_RE);
            if (amp) {
                const r = resolveName(code, amp[1], depth);
                if (r) { value += r.value; resolved = resolved && r.resolved; } else unknown(amp[1]);
                continue;
            }
            value += literal;
            if (/\{[^}]*\}/.test(literal)) resolved = false;
            continue;
        }

        const byId = p.match(/^(CloudPagesURL|MicrositeURL)\s*\(\s*(\d+)/i);
        if (byId) { value += `${byId[1]}(${byId[2]})`; continue; }

        // Expresiones que dan la URL de la propia página.
        if (/^(?:window\.|document\.)?location(?:\.href|\.pathname)?$|RequestParameter\s*\(\s*["']PAGEURL["']/i.test(p)) {
            unknown('location'); continue;
        }

        if (/^[@$]?[A-Za-z_][\w.$]*$/.test(p)) {
            const r = resolveName(code, p, depth);
            if (r) { value += r.value; resolved = resolved && r.resolved; } else unknown(p);
            continue;
        }
        unknown(p.length > 40 ? `${p.slice(0, 40)}…` : p);
    }
    return { value: value.trim(), resolved };
}

/**
 * Clasifica un destino de llamada respecto a las Cloud Pages conocidas. Admite destinos con
 * partes desconocidas ({variable}): si el dominio es todo variable queda "No determinado"; si se
 * conoce parte (p. ej. {base}.auth.marketingcloudapis.com) se clasifica por esa parte.
 * @param {string} target - URL o ruta llamada (puede contener {variable}).
 * @param {object} selfPage - Página que hace la llamada.
 * @param {Map<string,object>} pagesByUrl - Páginas indexadas por "host/ruta".
 * @returns {{kind:string, host:string, page?:object}}
 */
function classifyTarget(target, selfPage, pagesByUrl) {
    const self = parsePageUrl(selfPage.url);
    const t = target.trim();

    if (SELF_TARGET_RE.test(t)) return { kind: 'Propia página', host: self?.host || '', page: selfPage };

    const byId = t.match(/^(?:CloudPagesURL|MicrositeURL)\s*\(\s*(\d+)/i);
    if (byId) {
        const all = [...pagesByUrl.values()];
        const page = all.find(p => String(p.pageId) === byId[1]) || all.find(p => String(p.id) === byId[1]);
        if (!page) return { kind: 'Cloud Page por id (sin resolver)', host: '' };
        return page.id === selfPage.id ? { kind: 'Propia página', host: self?.host || '', page } : { kind: 'Otra Cloud Page', host: '', page };
    }

    let host = '';
    let path = '';
    const abs = t.match(/^https?:\/\/([^/?#]*)([^?#]*)/i);
    if (abs) {
        const hostTpl = abs[1].toLowerCase();
        // El dominio sin las partes variables (cada {x} cuenta como un trozo desconocido).
        const hostKnown = hostTpl.replace(/\{[^}]*\}/g, 'x');
        if (!hostKnown || hostKnown === 'x' || !hostKnown.includes('.')) {
            return SFMC_REST_PATH_RE.test(abs[2]) ? { kind: 'API de Marketing Cloud', host: '' } : { kind: 'No determinado', host: '' };
        }
        if (hostTpl.includes('{')) {
            if (SFMC_API_HOST_RE.test(hostKnown)) return { kind: 'API de Marketing Cloud', host: hostTpl };
            if (SALESFORCE_API_HOST_RE.test(hostKnown)) return { kind: 'Salesforce', host: hostTpl };
            return { kind: 'Externo', host: hostTpl };
        }
        host = hostTpl;
        path = (abs[2].replace(/\/+$/, '') || '/').toLowerCase();
    } else if (t.startsWith('/') && !t.startsWith('//')) {
        if (!self) return { kind: 'Ruta relativa', host: '(mismo dominio)' };
        host = self.host;
        path = (t.split(/[?#]/)[0].replace(/\/+$/, '') || '/').toLowerCase();
    } else {
        // Base desconocida seguida de una ruta conocida: {restUrl}interaction/v1/events
        const tail = t.replace(/^\{[^}]*\}/, '');
        if (SFMC_REST_PATH_RE.test(tail)) return { kind: 'API de Marketing Cloud', host: '' };
        return { kind: 'No determinado', host: '' };
    }

    const page = pagesByUrl.get(`${host}${path}`);
    if (page) return page.id === selfPage.id ? { kind: 'Propia página', host, page } : { kind: 'Otra Cloud Page', host, page };
    if (SFMC_API_HOST_RE.test(host)) return { kind: 'API de Marketing Cloud', host };
    if (SALESFORCE_API_HOST_RE.test(host)) return { kind: 'Salesforce', host };
    if (self && host === self.host) return { kind: 'Mismo dominio', host };
    return { kind: 'Externo', host };
}

/**
 * Devuelve los tramos del código que son AMPscript (%%[ ]%%, %%= =%% y bloques
 * <script runat=server language=ampscript>), para no confundir funciones de JavaScript con el
 * mismo nombre (httpGet) con las de AMPscript.
 * @param {string} text
 * @returns {Array<[number, number]>} Pares [inicio, fin].
 */
function ampscriptRanges(text) {
    const ranges = [];
    const re = /%%\[[\s\S]*?\]%%|%%=[\s\S]*?=%%|<script[^>]*language\s*=\s*["']?ampscript["']?[^>]*>[\s\S]*?<\/script>/gi;
    let m;
    while ((m = re.exec(text))) ranges.push([m.index, m.index + m[0].length]);
    return ranges;
}

/**
 * Detecta las llamadas que hace una página a otros endpoints (SSJS, AMPscript, JavaScript de
 * navegador y formularios) y resuelve a dónde van.
 * @param {object} page - Página de la caché (con content y url).
 * @param {Map<string,object>} pagesByUrl - Páginas indexadas por "host/ruta" (ver buildPagesByUrl).
 * @returns {Array<{lang:string, fn:string, target:string, resolved:boolean, kind:string, host:string, targetPage?:object, line:number}>}
 */
export function detectHttpCalls(page, pagesByUrl) {
    const text = String(page?.content || '');
    const calls = [];
    const seen = new Set();
    const ampRanges = ampscriptRanges(text);
    const inAmpscript = (i) => ampRanges.some(([a, b]) => i >= a && i < b);
    for (const p of CALL_PATTERNS) {
        p.re.lastIndex = 0;
        let m;
        while ((m = p.re.exec(text))) {
            const argIndex = m.index + m[0].length - m[1].length;
            if (seen.has(argIndex)) continue;
            seen.add(argIndex);
            if (p.lang === 'AMPscript' && !inAmpscript(m.index)) continue;

            // Coincidencias dentro de comentarios (// o /* */ en la misma línea) no son llamadas.
            const lineStart = text.lastIndexOf('\n', m.index) + 1;
            const prefix = text.slice(lineStart, m.index);
            if (/^\s*(\/\*|\*|<!--)/.test(prefix) || /(^|[^:])\/\//.test(prefix)) continue;

            // En HTML el destino es el valor del atributo; en código, la expresión completa del argumento.
            const expr = p.lang === 'HTML' ? m[1] : readExpression(text, argIndex);
            const { value: target, resolved } = evaluateExpression(text, expr);
            if (/^(#|javascript:|mailto:|tel:)/i.test(target)) continue;
            const cls = classifyTarget(target, page, pagesByUrl);
            calls.push({ lang: p.lang, fn: p.fn, target, resolved, kind: cls.kind, host: cls.host, targetPage: cls.page, line: lineAt(text, m.index) });
        }
    }
    return calls;
}

// --- Referencias entre Cloud Pages (mapa) ---

/**
 * Indexa las páginas por "host/ruta" para resolver URLs y rutas relativas.
 * @param {Array<object>} pages
 * @returns {Map<string,object>}
 */
export function buildPagesByUrl(pages) {
    const map = new Map();
    for (const p of pages) {
        const parsed = parsePageUrl(p.url);
        if (parsed) map.set(`${parsed.host}${parsed.path}`, p);
    }
    return map;
}

/**
 * Busca en el código de una página las referencias a otras Cloud Pages: por su URL completa,
 * por su ruta relativa en el mismo dominio o por su id en CloudPagesURL/MicrositeURL.
 * @param {object} page - Página origen.
 * @param {Array<object>} pages - Todas las páginas.
 * @returns {{refs: Array<{target:object, via:string, line:number}>, selfRefs:string[], unresolvedIds:string[]}}
 */
export function detectPageReferences(page, pages) {
    const text = String(page?.content || '');
    const lower = text.toLowerCase();
    const self = parsePageUrl(page.url);
    const refs = [];
    const selfRefs = new Set();
    const unresolvedIds = new Set();
    const added = new Set();
    const addRef = (target, via, index) => {
        if (target.id === page.id) { selfRefs.add(via); return; }
        const key = `${target.id}|${via}`;
        if (added.has(key)) return;
        added.add(key);
        refs.push({ target, via, line: lineAt(text, index) });
    };

    if (text) {
        for (const other of pages) {
            const parsed = parsePageUrl(other.url);
            if (!parsed || parsed.path.length < 2) continue;
            const full = `${parsed.host}${parsed.path}`;
            const re = new RegExp(`${escapeRegExp(full)}(?![\\w\\-/.])`, 'i');
            let idx = lower.search(re);
            if (idx !== -1) { addRef(other, 'URL', idx); continue; }

            // Ruta relativa: solo en el mismo dominio y entre comillas o paréntesis, para no
            // confundir rutas cortas con texto normal.
            if (self && self.host === parsed.host && parsed.path.length >= 4) {
                const relRe = new RegExp(`["'(\\x60]${escapeRegExp(parsed.path)}(?:[?#"'\\x60)]|/?["'\\x60])`, 'i');
                idx = lower.search(relRe);
                if (idx !== -1) addRef(other, 'Ruta relativa', idx);
            }
        }

        const idRe = /\b(CloudPagesURL|MicrositeURL)\s*\(\s*["']?(\d+)/gi;
        let m;
        while ((m = idRe.exec(text))) {
            const id = m[2];
            const target = pages.find(p => String(p.pageId) === id) || pages.find(p => String(p.id) === id);
            if (target) addRef(target, `${m[1]}(${id})`, m.index);
            else unresolvedIds.add(`${m[1]}(${id})`);
        }
    }

    return { refs, selfRefs: [...selfRefs], unresolvedIds: [...unresolvedIds] };
}

/**
 * Devuelve los content blocks que referencia una página con ContentBlockById/Key/Name y valor
 * literal (los Reference Content de los slots también se guardan así). Cada bloque una sola vez.
 * @param {string} content - Código de la página con sus slots/bloques colocados.
 * @returns {Array<{by:'Id'|'Key'|'Name', value:string}>}
 */
export function detectBlockReferences(content) {
    const seen = new Map();
    const re = /ContentBlockBy(Id|Key|Name)\s*\(\s*(?:"([^"]+)"|'([^']+)'|(\d+))\s*[,)]/gi;
    for (const m of String(content || '').matchAll(re)) {
        const by = m[1].charAt(0).toUpperCase() + m[1].slice(1).toLowerCase();
        const value = (m[2] ?? m[3] ?? m[4] ?? '').trim();
        if (!value || (by === 'Id' && !/^\d+$/.test(value))) continue;
        const key = `${by}:${value.toLowerCase()}`;
        if (!seen.has(key)) seen.set(key, { by, value });
    }
    return [...seen.values()];
}

/**
 * Construye el grafo de referencias entre todas las Cloud Pages: una arista por par
 * origen→destino con las formas en que se referencian, más las autorreferencias y los ids sin
 * resolver. Lo usan la auditoría y el botón de mapa de la vista de Cloud Pages.
 * @param {Array<object>} pages - Cloud Pages con contenido.
 * @returns {{edges: Array<{from:object,to:object,vias:string[],line:number}>, selfRefs: Map<object,string[]>, unresolved: Map<object,string[]>}}
 */
export function buildReferenceGraph(pages) {
    const edgeMap = new Map();
    const selfRefs = new Map();
    const unresolved = new Map();
    for (const p of pages) {
        const content = p.content || '';
        if (!content.trim() || content.trim().startsWith('{')) continue;
        const refs = detectPageReferences(p, pages);
        for (const r of refs.refs) {
            const key = `${p.id}|${r.target.id}`;
            if (!edgeMap.has(key)) edgeMap.set(key, { from: p, to: r.target, vias: new Set(), line: r.line });
            edgeMap.get(key).vias.add(r.via);
        }
        if (refs.selfRefs.length) selfRefs.set(p, refs.selfRefs);
        if (refs.unresolvedIds.length) unresolved.set(p, refs.unresolvedIds);
    }
    const edges = [...edgeMap.values()].map(e => ({ ...e, vias: [...e.vias] }));
    return { edges, selfRefs, unresolved };
}

/**
 * Cuenta las Landing Pages sin Page ID importado: sin él no se pueden resolver las referencias
 * por CloudPagesURL(id) / MicrositeURL(id).
 * @param {Array<object>} pages
 * @returns {{total:number, missing:number}}
 */
export function countMissingPageIds(pages) {
    const landing = (pages || []).filter(p => !isCodeResource(p));
    return { total: landing.length, missing: landing.filter(p => !p.pageId).length };
}

// --- robots.txt ---

/**
 * Interpreta un robots.txt: qué agentes bloquea por completo y si bloquea todo el sitio.
 * @param {string} text
 * @returns {{blocksAll:boolean, blockedAgents:string[], missingTraining:string[], blocksSearch:boolean}}
 */
export function analyzeRobotsTxt(text) {
    const groups = [];
    let current = null;
    for (const raw of String(text || '').split(/\r?\n/)) {
        const line = raw.replace(/#.*$/, '').trim();
        if (!line) continue;
        const m = line.match(/^([A-Za-z-]+)\s*:\s*(.*)$/);
        if (!m) continue;
        const field = m[1].toLowerCase();
        const value = m[2].trim();
        if (field === 'user-agent') {
            if (!current || current.rules.length > 0) { current = { agents: [], rules: [] }; groups.push(current); }
            current.agents.push(value.toLowerCase());
        } else if (current && (field === 'disallow' || field === 'allow')) {
            current.rules.push({ field, value });
        }
    }

    const blockedAgents = new Set();
    let blocksAll = false;
    for (const g of groups) {
        const fullBlock = g.rules.some(r => r.field === 'disallow' && r.value === '/');
        if (!fullBlock) continue;
        for (const a of g.agents) {
            if (a === '*') blocksAll = true;
            else blockedAgents.add(a);
        }
    }

    const blocked = [...blockedAgents];
    const isBlocked = t => blocked.some(a => a === t || a.includes(t));
    const missingTraining = [...AI_TRAINING_TOKENS.filter(t => t !== 'bytespider' && t !== 'googleother'), ...ROBOTS_ONLY_TOKENS]
        .filter(t => !blocksAll && !isBlocked(t));
    return {
        blocksAll,
        blockedAgents: blocked,
        missingTraining,
        blocksSearch: blocksAll || AI_SEARCH_TOKENS.some(isBlocked),
    };
}
