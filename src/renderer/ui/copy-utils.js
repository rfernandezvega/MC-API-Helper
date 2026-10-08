// =======================================================================================
// --- Fichero: src/renderer/ui/copy-utils.js ---
// --- Descripción: Botón con icono de copiar al portapapeles, común a todos los bloques
// ---              que muestran código o queries. Los bloques se pintan con innerHTML en
// ---              momentos distintos, así que en vez de enganchar cada botón al renderizar
// ---              se registra un único listener delegado al arrancar la app.
// =======================================================================================

import * as ui from './ui-helpers.js';

const COPY_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="9" width="13" height="13" rx="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>';
const CHECK_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><polyline points="20 6 9 17 4 12"></polyline></svg>';
const FEEDBACK_MS = 1500;

let listenerRegistered = false;

/**
 * Devuelve el HTML del botón de copiar. Debe quedar dentro de un contenedor con el atributo
 * `data-copy-scope`: al pulsarlo se copia el texto del primer <pre> de ese contenedor.
 * El botón no lleva texto visible para no ensuciar el textContent de las celdas que se
 * exportan a CSV.
 * @param {string} [title='Copiar'] - Tooltip y etiqueta accesible del botón.
 * @returns {string} HTML del botón.
 */
export function copyButtonHtml(title = 'Copiar') {
    return `<button type="button" class="copy-code-btn" title="${title}" aria-label="${title}">${COPY_ICON}</button>`;
}

/**
 * Construye un bloque de código con cabecera (etiqueta + botón de copiar) y el <pre>.
 * El contenedor usa `display: contents`, así la cabecera y el <pre> siguen comportándose
 * como hijos directos del layout flex del drawer.
 * @param {string} label - Texto de la cabecera (ej: 'Código Fuente').
 * @param {string} codeHtml - Contenido ya escapado o resaltado para inyectar en <pre><code>.
 * @returns {string} HTML del bloque.
 */
export function buildCopyableCodeBlock(label, codeHtml) {
    return `
        <div class="code-copy-scope" data-copy-scope>
            <div class="code-header has-copy"><span>${label}</span>${copyButtonHtml()}</div>
            <pre><code>${codeHtml}</code></pre>
        </div>`;
}

/**
 * Copia un texto al portapapeles. Si la API asíncrona falla (p. ej. la ventana no tiene el
 * foco) se recurre a un textarea temporal con execCommand, que no depende de permisos.
 * @param {string} text - Texto a copiar.
 * @returns {Promise<boolean>} true si se copió.
 */
export async function copyToClipboard(text) {
    try {
        await navigator.clipboard.writeText(text);
        return true;
    } catch {
        const area = document.createElement('textarea');
        area.value = text;
        area.setAttribute('readonly', '');
        area.style.position = 'fixed';
        area.style.opacity = '0';
        document.body.appendChild(area);
        area.select();
        let ok = false;
        try { ok = document.execCommand('copy'); } catch { ok = false; }
        area.remove();
        return ok;
    }
}

/**
 * Cambia temporalmente el icono del botón por un check para confirmar la copia.
 * @param {HTMLButtonElement} btn - Botón pulsado.
 */
function showCopiedFeedback(btn) {
    clearTimeout(btn._copyTimer);
    btn.innerHTML = CHECK_ICON;
    btn.classList.add('copied');
    btn._copyTimer = setTimeout(() => {
        btn.innerHTML = COPY_ICON;
        btn.classList.remove('copied');
    }, FEEDBACK_MS);
}

/**
 * Registra el listener delegado de los botones de copiar (una sola vez).
 * Se escucha en fase de captura y se detiene la propagación porque varios botones viven
 * dentro de cabeceras que pliegan/despliegan el bloque o de filas seleccionables, y copiar
 * no debe disparar esas acciones.
 */
export function initCopyButtons() {
    if (listenerRegistered) return;
    listenerRegistered = true;

    document.addEventListener('click', async (event) => {
        const btn = event.target.closest?.('.copy-code-btn');
        if (!btn) return;
        event.preventDefault();
        event.stopPropagation();

        const source = btn.closest('[data-copy-scope]')?.querySelector('pre');
        if (!source) return;

        if (await copyToClipboard(source.textContent)) {
            showCopiedFeedback(btn);
        } else {
            ui.showCustomAlert('No se pudo copiar el contenido al portapapeles.');
        }
    }, true);
}
