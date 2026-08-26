// =======================================================================================
// --- Fichero: src/renderer/ui/prism-ampscript.js ---
// --- Descripción: Añade a Prism el lenguaje AMPscript de Marketing Cloud y lo incrusta
// ---              dentro de HTML, que es como aparece siempre en los contenidos.
// ---
// --- Prism no trae AMPscript, pero sí gramáticas probadas de HTML, CSS y JavaScript. En vez
// --- de escribir un resaltador entero a mano, aquí solo se define lo específico de SFMC y se
// --- inyecta en la gramática `markup`: así el HTML, el CSS de los <style> y el SSJS de los
// --- <script runat="server"> los resuelve Prism, y nosotros mantenemos únicamente esta parte.
// =======================================================================================

/**
 * Registra el lenguaje `ampscript` y sus bloques dentro de `markup`.
 * Es idempotente: si ya se registró, no vuelve a hacerlo (insertBefore duplicaría los tokens).
 * @param {object} Prism - Instancia global de Prism ya cargada.
 */
export function registerAmpscript(Prism) {
    if (!Prism || !Prism.languages || Prism.languages.ampscript) return;

    // Funciones de AMPscript que se resaltan como tal. No hace falta que esté la lista completa:
    // lo que no esté aquí cae en el patrón genérico `function` (nombre seguido de paréntesis).
    const funciones = [
        'Lookup', 'LookupRows', 'LookupOrderedRows', 'LookupRowsCS', 'ClaimRow',
        'InsertData', 'InsertDE', 'UpdateData', 'UpdateDE', 'UpsertData', 'UpsertDE',
        'DeleteData', 'DeleteDE', 'DataExtensionRowCount',
        'RequestParameter', 'AttributeValue', 'CloudPagesURL', 'MicrositeURL',
        'Redirect', 'RedirectTo', 'Now', 'Format', 'Concat', 'Trim', 'Length',
        'Substring', 'Replace', 'IndexOf', 'Row', 'Field', 'RowCount', 'Empty',
        'BuildRowsetFromString', 'BuildRowsetFromXML',
        'ContentBlockByKey', 'ContentBlockById', 'ContentBlockByName',
        'CreateSalesforceObject', 'RetrieveSalesforceObjects',
        'UpdateSingleSalesforceObject', 'DeleteSalesforceObject',
        'RaiseError', 'IIF', 'IsNull', 'IsNullDefault', 'ProperCase', 'Uppercase', 'Lowercase',
        'Base64Encode', 'Base64Decode', 'SHA256', 'SHA512', 'MD5', 'GUID',
        'DateAdd', 'DateDiff', 'DatePart', 'FormatDate', 'SystemDateToLocalDate', 'LocalDateToSystemDate',
        'TreatAsContent', 'TreatAsContentArea', 'RegExMatch', 'AttributeValue',
        'CreateObject', 'SetObjectProperty', 'AddObjectArrayItem',
        'InvokeCreate', 'InvokeUpdate', 'InvokeRetrieve', 'InvokeDelete',
        'Add', 'Multiply', 'Divide', 'Subtract', 'Mod', 'Random', 'V', 'Output', 'OutputLine'
    ];

    Prism.languages.ampscript = {
        // Los comentarios van los primeros para que nada de dentro se resalte como código.
        'comment': {
            pattern: /\/\*[\s\S]*?(?:\*\/|$)/,
            greedy: true
        },
        // greedy evita que una comilla dentro de otra cadena parta el token por la mitad.
        'string': {
            pattern: /"(?:[^"]|"")*"|'(?:[^']|'')*'/,
            greedy: true
        },
        'variable': /@[\w.]+/,
        'keyword': /\b(?:SET|VAR|IF|ELSEIF|ELSE|THEN|ENDIF|FOR|TO|DOWNTO|DO|NEXT|OUTPUT|OUTPUTLINE)\b/i,
        'boolean': /\b(?:true|false)\b/i,
        'builtin': new RegExp('\\b(?:' + funciones.join('|') + ')\\b(?=\\s*\\()', 'i'),
        // Cualquier otra llamada a función que no esté en la lista de arriba.
        'function': /\b[a-z_]\w*(?=\s*\()/i,
        'number': /\b\d+(?:\.\d+)?\b/,
        'operator': /\b(?:AND|OR|NOT)\b|[=<>!]=?|[+\-*/%]/i,
        'punctuation': /[(),;]/
    };

    // Delimitadores resaltados aparte para que se distingan del código que envuelven.
    const delimitador = { pattern: /^%%\[|\]%%$|^%%=|=%%$/, alias: 'ampscript-delimiter' };

    // `prolog` es el primer token de markup: insertando antes, los bloques AMPscript se detectan
    // antes de que Prism intente leer el texto como HTML. Sin esto, un `<` dentro de AMPscript
    // (una comparación, por ejemplo) rompería el resaltado del resto del documento.
    Prism.languages.insertBefore('markup', 'prolog', {
        // Bloque AMPscript completo: %%[ ... ]%%
        'ampscript-block': {
            pattern: /%%\[[\s\S]*?\]%%/,
            greedy: true,
            inside: {
                'ampscript-delimiter': delimitador,
                rest: Prism.languages.ampscript
            }
        },
        // AMPscript en línea: %%=Function()=%%
        'ampscript-inline': {
            pattern: /%%=[\s\S]*?=%%/,
            greedy: true,
            inside: {
                'ampscript-delimiter': delimitador,
                rest: Prism.languages.ampscript
            }
        },
        // Cadenas de personalización: %%FirstName%%, %%Member_id%%...
        'ampscript-personalization': {
            pattern: /%%[\w\s.]+%%/,
            alias: 'ampscript-var'
        }
    });
}
