// =======================================================================================
// --- Fichero: src/renderer/ui/mc-links.js ---
// --- Descripción: Construye enlaces profundos a la interfaz de Marketing Cloud
// ---              (Automation Studio y Journey Builder). Se abren en el navegador
// ---              del sistema con la clase "external-link" (ver ui.handleExternalLink).
// =======================================================================================

import elements from './dom-elements.js';
import { escapeHtml } from './format-utils.js';

/**
 * Devuelve el HTML de una celda con el texto como enlace externo si hay URL,
 * o el texto escapado (o '---') si no. El enlace se abre en el navegador vía
 * la clase "external-link".
 * @param {string} text
 * @param {string|null} url
 * @returns {string}
 */
export function linkCell(text, url) {
    const safe = escapeHtml(text) || '---';
    return url ? `<a class="external-link" href="${url}">${safe}</a>` : safe;
}

/**
 * Devuelve el número de stack del contexto activo (p. ej. "51" a partir de "S51"),
 * necesario para el subdominio mc.sXX.exacttarget.com de los enlaces.
 * @returns {string} El número de stack, o cadena vacía si no se conoce.
 */
export function getStackNumber() {
    const raw = elements.stackKeyInput?.value || '';
    const m = String(raw).match(/\d+/);
    return m ? m[0] : '';
}

/**
 * Codifica un GUID (con guiones) al base64 de sus 16 bytes en orden .NET
 * (los tres primeros grupos en little-endian), sin relleno. Es la forma que usa
 * Automation Studio en el enlace de "Instance".
 * @param {string} guid
 * @returns {string|null} Base64 sin padding, o null si el GUID no es válido.
 */
function guidToNetBase64NoPad(guid) {
    // Nos quedamos solo con los caracteres hexadecimales (tolera guiones, llaves, espacios…).
    const hex = String(guid || '').replace(/[^0-9a-fA-F]/g, '');
    if (hex.length !== 32) return null;
    const b = [];
    for (let i = 0; i < 16; i++) b.push(parseInt(hex.substr(i * 2, 2), 16));
    // Orden .NET: Data1 (4 bytes) y Data2/Data3 (2 bytes) en little-endian; el resto tal cual.
    const ordered = [b[3], b[2], b[1], b[0], b[5], b[4], b[7], b[6], b[8], b[9], b[10], b[11], b[12], b[13], b[14], b[15]];
    let bin = '';
    ordered.forEach(x => { bin += String.fromCharCode(x); });
    return btoa(bin).replace(/=+$/, '');
}

/**
 * Construye el enlace a la vista "Instance" de un automatismo en Automation Studio.
 * El identificador final es base64( base64Net(GUID) + ":25:0" ).
 * @param {string} automationId - GUID del automatismo (con guiones).
 * @returns {string|null} URL o null si falta el stack o el id no es un GUID válido.
 */
export function buildAutomationUrl(automationId) {
    const stack = getStackNumber();
    const g = guidToNetBase64NoPad(automationId);
    if (!stack || !g) return null;
    const param = btoa(`${g}:25:0`);
    return `https://mc.s${stack}.exacttarget.com/cloud/#app/Automation%20Studio/AutomationStudioFuel3/%23Instance/${param}`;
}

/**
 * Construye el enlace a un Journey en Journey Builder.
 * @param {string} journeyId - Id (definition key/GUID) del journey.
 * @param {number|string} [version] - Versión (por defecto 1).
 * @returns {string|null} URL o null si falta el stack o el id.
 */
export function buildJourneyUrl(journeyId, version) {
    const stack = getStackNumber();
    if (!stack || !journeyId) return null;
    const v = version || 1;
    return `https://mc.s${stack}.exacttarget.com/cloud/#app/Journey%20Builder/%23${journeyId}/${v}`;
}
