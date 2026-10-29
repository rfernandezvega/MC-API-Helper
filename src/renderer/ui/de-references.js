// ===================================================================
// Fichero: ui/de-references.js
// Descripción: Detección de referencias a Data Extensions en código (AMPscript, SSJS y SQL),
// compartida por las búsquedas de uso de DEs.
// ===================================================================

// Funciones AMPscript que reciben el nombre de la DE como primer argumento.
const AMPSCRIPT_DE_FUNCTIONS = [
    'Lookup', 'LookupRows', 'LookupOrderedRows', 'LookupRowsCS', 'LookupOrderedRowsCS',
    'ClaimRow', 'InsertDE', 'InsertData', 'UpdateDE', 'UpdateData',
    'DeleteDE', 'DeleteData', 'UpsertDE', 'UpsertData', 'DataExtensionRowCount'
];

// Funciones SSJS equivalentes (DataExtension.Init recibe la External Key, no el nombre).
const SSJS_DE_FUNCTIONS = [
    'Platform.Function.Lookup', 'Platform.Function.LookupRows', 'Platform.Function.LookupOrderedRows',
    'Platform.Function.InsertData', 'Platform.Function.UpdateData', 'Platform.Function.DeleteData',
    'Platform.Function.UpsertData', 'DataExtension.Init'
];

/**
 * Escapa un texto para usarlo literalmente dentro de una expresión regular.
 * @param {string} text - Texto a escapar.
 * @returns {string}
 */
function escapeRegex(text) {
    return String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Normaliza el nombre de DE que aparece en el código para compararlo: sin el prefijo ENT.
 * (DEs compartidas vistas desde una BU hija), sin corchetes y en minúsculas.
 * @param {string} name - Nombre tal y como aparece en el código.
 * @returns {string}
 */
export function normalizeDeReference(name) {
    return String(name || '').trim().replace(/^ent\./i, '').replace(/^\[(.*)\]$/, '$1').trim().toLowerCase();
}

/**
 * Extrae las DEs referenciadas en un código AMPscript/SSJS y qué funciones las usan.
 * Solo detecta nombres literales (entre comillas); los nombres montados dinámicamente no se pueden resolver.
 * @param {string} code - Código a analizar.
 * @returns {Map<string, Set<string>>} Nombre de DE tal y como aparece → funciones que lo usan.
 */
export function extractDeReferences(code) {
    const refs = new Map();
    if (!code) return refs;
    const add = (de, fn) => {
        const name = de.trim();
        if (!refs.has(name)) refs.set(name, new Set());
        refs.get(name).add(fn);
    };
    // Las SSJS van primero y se recuerda dónde casan: "Platform.Function.Lookup(" también
    // contiene "Lookup(" y no debe contarse además como AMPscript.
    const ssjsPositions = new Set();
    for (const fn of SSJS_DE_FUNCTIONS) {
        const regex = new RegExp(escapeRegex(fn) + '\\s*\\(\\s*["\']([^"\']+)["\']', 'gi');
        for (const m of code.matchAll(regex)) {
            add(m[1], fn);
            ssjsPositions.add(m.index + fn.length);
        }
    }
    for (const fn of AMPSCRIPT_DE_FUNCTIONS) {
        const regex = new RegExp('(?<![\\w])' + fn + '\\s*\\(\\s*["\']([^"\']+)["\']', 'gi');
        for (const m of code.matchAll(regex)) {
            if (ssjsPositions.has(m.index + fn.length)) continue;
            add(m[1], fn);
        }
    }
    return refs;
}

/**
 * Devuelve las funciones con las que un código referencia a una DE concreta (por nombre o External Key).
 * @param {string} code - Código AMPscript/SSJS.
 * @param {{name: string, key?: string}} de - DE buscada.
 * @returns {Array<string>} Funciones encontradas (vacío si no se referencia con ninguna).
 */
export function findDeFunctionsInCode(code, de) {
    const targets = new Set([normalizeDeReference(de.name), normalizeDeReference(de.key)].filter(Boolean));
    const functions = new Set();
    for (const [ref, fns] of extractDeReferences(code)) {
        if (targets.has(normalizeDeReference(ref))) fns.forEach(fn => functions.add(fn));
    }
    return [...functions];
}

/**
 * Indica si un texto menciona el nombre (o la External Key) de una DE como palabra completa,
 * para descartar coincidencias parciales (p. ej. "Clientes" dentro de "Clientes_Bajas").
 * @param {string} text - Texto donde buscar.
 * @param {{name: string, key?: string}} de - DE buscada.
 * @returns {boolean}
 */
export function mentionsDe(text, de) {
    if (!text) return false;
    return [de.name, de.key].filter(Boolean).some(term =>
        new RegExp(`(?<![\\w])${escapeRegex(term)}(?![\\w])`, 'i').test(text)
    );
}

/**
 * Clasifica cómo usa una query SQL a una DE: leyéndola en un FROM/JOIN, o solo mencionándola
 * (subconsulta, columna con el mismo nombre...). Admite el prefijo ENT. y el nombre entre corchetes.
 * @param {string} sql - Texto de la query.
 * @param {string} deName - Nombre exacto de la DE.
 * @returns {'FROM/JOIN'|'Mención'|null} null si no la menciona como palabra completa.
 */
export function classifySqlUsage(sql, deName) {
    if (!sql || !deName) return null;
    const name = escapeRegex(deName);
    const table = `(?:ENT\\.)?(?:\\[${name}\\]|${name}(?![\\w]))`;
    if (new RegExp(`\\b(?:FROM|JOIN)\\s+${table}`, 'i').test(sql)) return 'FROM/JOIN';
    if (new RegExp(`(?<![\\w])${table}`, 'i').test(sql)) return 'Mención';
    return null;
}
