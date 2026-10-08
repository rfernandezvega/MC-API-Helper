// =======================================================================================
// --- Fichero: src/renderer/ui/csv-export.js ---
// --- Descripción: Generación y descarga de CSV de las tablas de resultados.
// ---              Centraliza el saneado de las celdas: textos como las queries o los
// ---              scripts traen saltos de línea, tabuladores, comillas y separadores
// ---              que, volcados tal cual, parten filas y columnas al abrir el fichero.
// =======================================================================================

import elements from './dom-elements.js';
import * as ui from './ui-helpers.js';
import * as logger from './logger.js';

// Punto y coma como separador: es el que espera Excel con configuración regional española.
// Aun así todas las celdas van entrecomilladas, así que un ';' dentro de una query no
// llega a partir la columna.
const SEPARATOR = ';';

// BOM UTF-8: sin él Excel abre el fichero como ANSI y destroza tildes y eñes.
const BOM = String.fromCharCode(0xFEFF);

/**
 * Convierte un valor en una celda CSV segura: siempre entrecomillada, con las comillas
 * internas duplicadas y sin caracteres que rompan el fichero. Los saltos de línea y los
 * tabuladores (habituales en el texto de queries y scripts) se sustituyen por un espacio
 * porque muchos lectores de CSV cortan la fila al encontrarlos, incluso entrecomillados.
 * @param {*} value - El valor a volcar en la celda (null/undefined dan celda vacía).
 * @returns {string} La celda ya entrecomillada y escapada.
 */
export function toCsvCell(value) {
    if (value == null) return '""';
    const normalized = String(value)
        .replace(/\r\n|\r|\n/g, ' ')
        .replace(/\t/g, ' ');
    // Las comillas se duplican (así se escapan dentro de un campo entrecomillado) y el
    // resto de caracteres de control que a veces cuela la API se descarta, porque no
    // son representables en CSV.
    let text = '';
    for (const char of normalized) {
        const code = char.codePointAt(0);
        if (code < 32 || code === 127) continue;
        text += char === '"' ? '""' : char;
    }
    return `"${text}"`;
}

/**
 * Monta el contenido completo del CSV (BOM + cabecera + filas) con saltos CRLF.
 * @param {Array<string>} headers - Los títulos de las columnas.
 * @param {Array<Array<*>>} rows - Las filas, cada una como array de valores en el orden de headers.
 * @returns {string} El contenido del fichero listo para guardar.
 */
export function buildCsvContent(headers, rows) {
    const lines = [(headers || []).map(toCsvCell).join(SEPARATOR)];
    (rows || []).forEach(row => lines.push((row || []).map(toCsvCell).join(SEPARATOR)));
    return BOM + lines.join('\r\n');
}

/**
 * Compone el nombre por defecto del fichero con el contexto activo (cliente + BU) y la
 * fecha, para que dos exportaciones de BUs distintas no se pisen.
 * @param {string} base - Identificador de la tabla exportada (ej: 'data_extensions').
 * @returns {string} El nombre del fichero con extensión .csv.
 */
export function buildCsvFileName(base) {
    const context = (elements.clientNameInput?.value || '').trim();
    // Los caracteres no válidos en nombres de fichero se sustituyen por guion bajo.
    const prefix = context ? `${context.replace(/[\\/:*?"<>|]/g, '_')}_` : '';
    return `${prefix}${base}_${new Date().toISOString().slice(0, 10)}.csv`;
}

/**
 * Genera el CSV y abre el diálogo de guardado del sistema. Avisa si no hay datos y
 * registra el resultado en el panel de logs.
 * @param {object} options - Opciones de la exportación.
 * @param {Array<string>} options.headers - Los títulos de las columnas.
 * @param {Array<Array<*>>} options.rows - Las filas a exportar.
 * @param {string} options.fileName - Nombre por defecto del fichero (.csv).
 * @returns {Promise<boolean>} true si el fichero se guardó.
 */
export async function downloadCsv({ headers, rows, fileName }) {
    if (!rows || rows.length === 0) {
        ui.showCustomAlert('No hay resultados que descargar.');
        return false;
    }

    try {
        const result = await window.electronAPI.saveCsvFile({
            content: buildCsvContent(headers, rows),
            defaultName: fileName
        });
        if (result?.success) {
            logger.logMessage(`CSV exportado (${rows.length} filas): ${result.filePath}`);
            return true;
        }
        return false;
    } catch (error) {
        logger.logMessage(`Error al exportar el CSV: ${error.message}`);
        ui.showCustomAlert(`Error al guardar el fichero: ${error.message}`);
        return false;
    }
}
