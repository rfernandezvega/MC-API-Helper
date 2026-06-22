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

export function highlightCloudPageCode(code) {
    if (!code) return '';
    let s = code.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

    const ampFns = 'Lookup|LookupRows|LookupOrderedRows|LookupRowsCS|ClaimRow'
        + '|InsertData|InsertDE|UpdateData|UpdateDE|UpsertData|UpsertDE'
        + '|DeleteData|DeleteDE|DataExtensionRowCount'
        + '|RequestParameter|AttributeValue|CloudPagesURL'
        + '|Redirect|RedirectTo|Now|Format|Concat|Trim|Length'
        + '|Substring|Replace|IndexOf|Row|Field|RowCount'
        + '|BuildRowsetFromString|BuildRowsetFromXML'
        + '|ContentBlockByKey|ContentBlockById|ContentBlockByName'
        + '|CreateSalesforceObject|RetrieveSalesforceObjects'
        + '|UpdateSingleSalesforceObject|DeleteSalesforceObject'
        + '|RaiseError|IIF|IsNull|ProperCase|Uppercase|Lowercase'
        + '|Base64Encode|Base64Decode|SHA256|SHA512|MD5'
        + '|DateAdd|DateDiff|DatePart|FormatDate|SystemDateToLocalDate'
        + '|TreatAsContent|TreatAsContentArea|RegExMatch'
        + '|CreateObject|SetObjectProperty|AddObjectArrayItem'
        + '|InvokeCreate|InvokeUpdate|InvokeRetrieve|InvokeDelete'
        + '|Add|Multiply|Divide|Subtract|Mod|GUID';

    const pattern = new RegExp(
        '(\\/\\*[\\s\\S]*?\\*\\/)'
        + '|(\\/\\/[^\\n]*)'
        + '|(&lt;!--[\\s\\S]*?--&gt;)'
        + '|(%%\\[|%%\\]|%%=|=%%)'
        + "|('[^']*?')"
        + '|("[^"]*?")'
        + '|(@\\w+)'
        + '|\\b(SET|VAR|THEN|ELSEIF|ENDIF|NEXT|OUTPUT)\\b'
        + '|\\b(' + ampFns + ')(?=\\s*\\()'
        + '|\\b(var|let|const|function|return|if|else|for|while|do|switch|case|break|continue|try|catch|finally|throw|new|typeof|this|null|undefined|true|false|AND|OR|NOT|IF|ELSE|FOR|DO)\\b'
        + '|\\b(Platform|Write|Variable|HTTP|DataExtension|Rows|GetValue)\\b'
        + '|(&lt;\\/?[a-zA-Z][\\w-]*)'
        + '|(\\/?&gt;)'
        + '|(\\b\\d+\\.?\\d*\\b)',
        'gi'
    );

    return s.replace(pattern, function(match,
        comMulti, comSingle, comHtml, ampDelim, strSingle, strDouble,
        ampVar, ampKw, ampFn, jsKw, jsBuiltin, htmlTag, htmlClose, number
    ) {
        if (comMulti)   return `<span class="cp-hl-comment">${match}</span>`;
        if (comSingle)  return `<span class="cp-hl-comment">${match}</span>`;
        if (comHtml)    return `<span class="cp-hl-comment">${match}</span>`;
        if (ampDelim)   return `<span class="cp-hl-amp-delim">${match}</span>`;
        if (strSingle)  return `<span class="cp-hl-string">${match}</span>`;
        if (strDouble)  return `<span class="cp-hl-string">${match}</span>`;
        if (ampVar)     return `<span class="cp-hl-amp-var">${match}</span>`;
        if (ampKw)      return `<span class="cp-hl-amp-kw">${match}</span>`;
        if (ampFn)      return `<span class="cp-hl-amp-fn">${match}</span>`;
        if (jsKw)       return `<span class="cp-hl-js-kw">${match}</span>`;
        if (jsBuiltin)  return `<span class="cp-hl-js-builtin">${match}</span>`;
        if (htmlTag)    return `<span class="cp-hl-tag">${match}</span>`;
        if (htmlClose)  return `<span class="cp-hl-tag">${match}</span>`;
        if (number)     return `<span class="cp-hl-number">${match}</span>`;
        return match;
    });
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