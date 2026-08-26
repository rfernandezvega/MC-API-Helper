import { registerAmpscript } from './prism-ampscript.js';

export function formatCodeWithIndentation(code) {
    if (!code) return '';
    let normalized = code.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    const lines = normalized.split('\n');
    if (lines.length > 3) return cleanExistingIndentation(lines);
    return beautifyInlineCode(normalized);
}

function cleanExistingIndentation(lines) {
    let minIndent = Infinity;
    for (const line of lines) {
        if (line.trim().length === 0) continue;
        const leading = line.match(/^(\s*)/)[1].length;
        if (leading < minIndent) minIndent = leading;
    }
    if (minIndent === Infinity) minIndent = 0;
    return lines.map(l => l.trim().length === 0 ? '' : l.substring(minIndent)).join('\n');
}

function beautifyInlineCode(code) {
    let result = code.replace(/>\s*</g, '>\n<').replace(/;(?=\s*[^\s"'])/g, ';\n');
    const lines = result.split('\n');
    let indent = 0;
    const tab = '    ';
    const formatted = [];
    const openRe = /^<(?:div|table|tr|td|th|thead|tbody|tfoot|ul|ol|li|form|select|head|body|html|section|header|footer|nav|main|article|aside|script|style)\b/i;
    const closeRe = /^<\/(?:div|table|tr|td|th|thead|tbody|tfoot|ul|ol|li|form|select|head|body|html|section|header|footer|nav|main|article|aside|script|style)\b/i;
    for (let line of lines) {
        line = line.trim();
        if (!line) continue;
        if (closeRe.test(line)) indent = Math.max(0, indent - 1);
        formatted.push(tab.repeat(indent) + line);
        if (openRe.test(line) && !line.includes('/>') && !/<\/\w+>\s*$/.test(line)) indent++;
    }
    return formatted.join('\n');
}

/**
 * Resalta código de Marketing Cloud (HTML + CSS + AMPscript + SSJS) con Prism.
 * Prism aporta las gramáticas de HTML, CSS y JavaScript, y `prism-ampscript.js` inyecta encima
 * la parte de SFMC. A diferencia de un resaltador a base de expresiones regulares sueltas, Prism
 * entiende el contexto: no confunde el valor de un atributo con una cadena de JavaScript ni
 * colorea palabras clave que están dentro de un comentario.
 * Si Prism no estuviera disponible se devuelve el código escapado, para que el visor siga
 * mostrando el contenido en vez de romperse.
 * @param {string} code - Código fuente a resaltar.
 * @returns {string} HTML con el código ya marcado, listo para inyectar dentro de <pre><code>.
 */
export function highlightCloudPageCode(code) {
    if (!code) return '';

    const Prism = window.Prism;
    if (!Prism || !Prism.languages || !Prism.languages.markup) return escapeForCode(code);

    registerAmpscript(Prism);
    try {
        return Prism.highlight(code, Prism.languages.markup, 'markup');
    } catch (e) {
        // Un contenido con una estructura rara no debe dejar al usuario sin ver su código.
        return escapeForCode(code);
    }
}

/**
 * Escapa el código para poder pintarlo tal cual dentro del visor cuando no hay resaltado.
 * @param {string} code - Código fuente.
 * @returns {string} El mismo texto con los caracteres de HTML escapados.
 */
function escapeForCode(code) {
    return String(code).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}


/**
 * Genera el HTML del visor de código fuente.
 * El código se muestra alineado a la izquierda con indentación preservada.
 * @param {string} content - El código fuente de la Cloud Page.
 * @returns {string} HTML con el bloque de código.
 */
export function buildCodeViewer(content) {
    if (!content) return '';
    const formatted = formatCodeWithIndentation(content);
    const highlighted = highlightCloudPageCode(formatted);
    return `
        <div class="code-header">Código</div>
        <pre><code>${highlighted}</code></pre>`;
}