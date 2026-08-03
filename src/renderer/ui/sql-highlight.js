// =======================================================================================
// --- Fichero: src/renderer/ui/sql-highlight.js ---
// --- Descripción: Resaltado de sintaxis SQL (clases .sql-*) y caja acotada para mostrar
// ---              queries con la misma apariencia que el analizador de automatismos.
// =======================================================================================

/**
 * Resalta una query SQL devolviendo HTML con spans .sql-* (comentarios, strings,
 * keywords, funciones y números). Escapa el HTML de entrada.
 * @param {string} query
 * @returns {string} HTML resaltado.
 */
export function highlightSQLHtml(query) {
    if (!query) return '';

    let escaped = query.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

    // Patrones: 1. Comentarios, 2. Strings, 3. Keywords, 4. Funciones, 5. Números
    const pattern = /(--[^\n]*|\/\*[\s\S]*?\*\/)|('[^']*')|\b(SELECT|FROM|WHERE|AND|OR|JOIN|INNER|LEFT|ON|GROUP|BY|ORDER|INSERT|UPDATE|SET|DELETE|CASE|WHEN|THEN|ELSE|END|NULL|NOT|IN|TOP|DISTINCT|AS|UNION|ALL|LIKE)\b|\b(CONVERT|DATE|DATEADD|GETUTCDATE|GETDATE|DATEDIFF|SUM|COUNT|AVG|MIN|MAX|CAST|ISNULL|COALESCE)\b|(\b\d+\b)/gi;

    return escaped.replace(pattern, (match, com, str, kwd, fn, num) => {
        if (com) return `<span class="sql-comment">${match}</span>`;
        if (str) return `<span class="sql-string">${match}</span>`;
        if (kwd) return `<span class="sql-keyword">${match.toUpperCase()}</span>`;
        if (fn) return `<span class="sql-function">${match.toUpperCase()}</span>`;
        if (num) return `<span class="sql-number">${match}</span>`;
        return match;
    });
}

/**
 * Devuelve el HTML de una caja acotada (altura limitada, con scroll) que muestra una
 * query resaltada, con la misma apariencia que el analizador de automatismos.
 * @param {string} text - Texto de la query (o descripción).
 * @returns {string} HTML de la caja, o '---' si no hay texto.
 */
export function sqlBox(text) {
    if (!text) return '---';
    return `<div class="query-box"><pre><code>${highlightSQLHtml(text)}</code></pre></div>`;
}
