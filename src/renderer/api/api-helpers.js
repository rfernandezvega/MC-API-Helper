// ===================================================================
// Fichero: api-helpers.js
// Descripción: Funciones transversales como la caché y rutas de carpetas.
// ===================================================================
import { executeSoapRequest } from './api-core.js';

// Rutas ya resueltas de la operación en curso. Guarda promesas (no valores) para que
// varias peticiones simultáneas de la misma carpeta compartan una única llamada SOAP:
// sin esto, resolver N registros en paralelo lanza N cadenas idénticas porque ninguna
// ha terminado todavía cuando arrancan las demás.
// Se vacía al empezar cada operación, de modo que nunca se pinta una ruta que ya cambió
// en Marketing Cloud ni se arrastran IDs de carpeta de otra Business Unit.
const folderPathCache = new Map();

// Máximo de IDs por Retrieve, para no construir peticiones desmesuradas.
const FOLDER_ID_CHUNK = 200;

// Tope de niveles al subir por el árbol. Protege ante una jerarquía con ciclos.
const MAX_FOLDER_DEPTH = 30;

/**
 * Vacía la caché de rutas de carpeta. Debe llamarse al inicio de cada operación
 * (una búsqueda, un análisis) para que los datos se pidan siempre frescos a la API.
 */
export function clearFolderPathCache() {
    folderPathCache.clear();
}

/**
 * Normaliza un ID de carpeta a texto para que el mismo valor use una única entrada de caché
 * venga de SOAP (cadena) o de REST (número).
 * @param {string|number} folderId - ID de la carpeta.
 * @returns {string} El ID como texto.
 */
function cacheKeyFor(folderId) {
    return String(folderId);
}

/**
 * Indica si un ID corresponde a la raíz o a un valor no consultable, en cuyo caso no hay
 * que preguntar a la API (el ID 0 es el padre de las carpetas de primer nivel).
 * @param {string|number} folderId - ID a comprobar.
 * @returns {boolean} true si no procede consultarlo.
 */
function isRootFolderId(folderId) {
    if (folderId === null || folderId === undefined || folderId === '') return true;
    const parsed = parseInt(folderId, 10);
    return isNaN(parsed) || parsed === 0;
}

/**
 * Recupera en una sola petición SOAP el nombre y el padre de un conjunto de carpetas,
 * usando el operador IN para no gastar una llamada por ID.
 * @param {Array<string>} folderIds - IDs de carpeta a consultar.
 * @param {object} apiConfig - Configuración autenticada de la API.
 * @returns {Promise<Map<string, {name: string, parentId: string}>>} Datos por ID de carpeta.
 */
async function fetchFolderNodes(folderIds, apiConfig) {
    const nodes = new Map();

    for (let i = 0; i < folderIds.length; i += FOLDER_ID_CHUNK) {
        const chunk = folderIds.slice(i, i + FOLDER_ID_CHUNK);
        let fetched;

        try {
            fetched = await retrieveFolderChunk(chunk, apiConfig);
        } catch (error) {
            if (chunk.length === 1) throw error;
            // Repliegue por si el tenant no admite el operador IN sobre DataFolder:
            // se consulta carpeta a carpeta, como se hacía antes.
            fetched = new Map();
            for (const id of chunk) {
                const single = await retrieveFolderChunk([id], apiConfig);
                single.forEach((value, key) => fetched.set(key, value));
            }
        }

        fetched.forEach((value, key) => nodes.set(key, value));
    }

    return nodes;
}

/**
 * Lanza el Retrieve de un grupo de carpetas y parsea la respuesta.
 * @param {Array<string>} chunk - IDs de carpeta de este grupo.
 * @param {object} apiConfig - Configuración autenticada de la API.
 * @returns {Promise<Map<string, {name: string, parentId: string}>>} Datos por ID de carpeta.
 */
async function retrieveFolderChunk(chunk, apiConfig) {
    const filterXml = chunk.length === 1
        ? `<Filter xsi:type="SimpleFilterPart"><Property>ID</Property><SimpleOperator>equals</SimpleOperator><Value>${chunk[0]}</Value></Filter>`
        : `<Filter xsi:type="SimpleFilterPart"><Property>ID</Property><SimpleOperator>IN</SimpleOperator>${chunk.map(id => `<Value>${id}</Value>`).join('')}</Filter>`;

    const soapPayload = `<s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope" xmlns:a="http://schemas.xmlsoap.org/ws/2004/08/addressing"><s:Header><a:Action s:mustUnderstand="1">Retrieve</a:Action><a:To s:mustUnderstand="1">${apiConfig.soapUri}</a:To><fueloauth xmlns="http://exacttarget.com">${apiConfig.accessToken}</fueloauth></s:Header><s:Body xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema"><RetrieveRequestMsg xmlns="http://exacttarget.com/wsdl/partnerAPI"><RetrieveRequest><ObjectType>DataFolder</ObjectType><Properties>ID</Properties><Properties>Name</Properties><Properties>ParentFolder.ID</Properties>${filterXml}</RetrieveRequest></RetrieveRequestMsg></s:Body></s:Envelope>`;

    const responseText = await executeSoapRequest(apiConfig.soapUri, soapPayload);
    const doc = new DOMParser().parseFromString(responseText, "application/xml");

    const nodes = new Map();
    doc.querySelectorAll("Results").forEach(node => {
        // Se acota con ":scope >" porque ParentFolder contiene otro nodo ID anidado.
        const id = node.querySelector(":scope > ID")?.textContent;
        const name = node.querySelector(":scope > Name")?.textContent;
        if (!id || !name) return;
        nodes.set(cacheKeyFor(id), {
            name,
            parentId: node.querySelector(":scope > ParentFolder > ID")?.textContent || ''
        });
    });

    return nodes;
}

/**
 * Compone la ruta completa de una carpeta a partir de los nodos ya descargados,
 * apoyándose en la caché para los tramos que otra resolución dejó listos.
 * @param {string} folderId - ID de la carpeta.
 * @param {Map} nodes - Nodos descargados en esta resolución.
 * @param {Set} visiting - IDs en curso en esta rama, para cortar jerarquías cíclicas.
 * @returns {Promise<string>} Ruta en formato "Raíz > Subcarpeta" o cadena vacía.
 */
async function composePath(folderId, nodes, visiting) {
    const key = cacheKeyFor(folderId);
    if (isRootFolderId(key) || visiting.has(key)) return '';

    const cached = folderPathCache.get(key);
    if (cached) return await cached;

    const node = nodes.get(key);
    if (!node) {
        // Carpeta inexistente o sin permisos: se cachea el fallo para no reintentarlo.
        folderPathCache.set(key, Promise.resolve(''));
        return '';
    }

    visiting.add(key);
    const parentPath = await composePath(node.parentId, nodes, visiting);
    visiting.delete(key);

    const fullPath = parentPath ? `${parentPath} > ${node.name}` : node.name;
    folderPathCache.set(key, Promise.resolve(fullPath));
    return fullPath;
}

/**
 * Resuelve de golpe las rutas de un conjunto de carpetas descargando un nivel del árbol
 * por petición, en lugar de una petición por carpeta y nivel. El coste pasa a ser la
 * profundidad del árbol, no el número de registros.
 * @param {Array<string|number>} folderIds - IDs de carpeta a resolver.
 * @param {object} apiConfig - Configuración autenticada de la API.
 * @returns {Promise<Map<string, string>>} Ruta completa indexada por ID (en texto).
 */
export async function resolveFolderPaths(folderIds, apiConfig) {
    const requested = [...new Set((folderIds || []).map(cacheKeyFor))];
    const nodes = new Map();

    let pending = requested.filter(id => !isRootFolderId(id) && !folderPathCache.has(id));
    let depth = 0;

    // Se baja un nivel completo por vuelta: primero las carpetas pedidas, luego sus padres,
    // y así hasta llegar a la raíz o a tramos que ya estaban resueltos.
    while (pending.length > 0 && depth < MAX_FOLDER_DEPTH) {
        const fetched = await fetchFolderNodes(pending, apiConfig);

        const parents = new Set();
        for (const id of pending) {
            const node = fetched.get(id);
            if (!node) continue;
            nodes.set(id, node);
            const parentKey = cacheKeyFor(node.parentId);
            if (!isRootFolderId(parentKey) && !nodes.has(parentKey) && !folderPathCache.has(parentKey)) {
                parents.add(parentKey);
            }
        }

        pending = [...parents];
        depth++;
    }

    const paths = new Map();
    for (const id of requested) {
        paths.set(id, await composePath(id, nodes, new Set()));
    }
    return paths;
}

/**
 * Obtiene la ruta completa de una única carpeta subiendo por el árbol.
 * Reutiliza la caché de la operación, de forma que llamadas simultáneas para la misma
 * carpeta comparten una sola petición. Para varias carpetas usa `resolveFolderPaths`.
 * @param {string|number} folderId - ID de la carpeta a consultar.
 * @param {object} apiConfig - Configuración autenticada de la API.
 * @returns {Promise<string>} La ruta en formato texto (ej: "Carpeta Raíz > Subcarpeta").
 */
export function getFolderPath(folderId, apiConfig) {
    const key = cacheKeyFor(folderId);
    if (isRootFolderId(key)) return Promise.resolve('');

    const cached = folderPathCache.get(key);
    if (cached) return cached;

    // La promesa se registra antes de resolverse: así los llamadores que pidan esta misma
    // carpeta mientras la petición está en vuelo se enganchan en vez de duplicarla.
    const promise = buildSingleFolderPath(key, apiConfig, 0);
    folderPathCache.set(key, promise);
    return promise;
}

/**
 * Resuelve la ruta de una carpeta consultando su nodo y encadenando con el de su padre.
 * @param {string} folderId - ID de la carpeta.
 * @param {object} apiConfig - Configuración autenticada de la API.
 * @param {number} depth - Nivel actual, para no subir indefinidamente.
 * @returns {Promise<string>} Ruta completa o cadena vacía si la carpeta no existe.
 */
async function buildSingleFolderPath(folderId, apiConfig, depth) {
    if (depth >= MAX_FOLDER_DEPTH) return '';

    const nodes = await fetchFolderNodes([folderId], apiConfig);
    const node = nodes.get(folderId);
    if (!node) return '';

    let parentPath = '';
    const parentKey = cacheKeyFor(node.parentId);
    if (!isRootFolderId(parentKey)) {
        const cachedParent = folderPathCache.get(parentKey);
        if (cachedParent) {
            parentPath = await cachedParent;
        } else {
            const parentPromise = buildSingleFolderPath(parentKey, apiConfig, depth + 1);
            folderPathCache.set(parentKey, parentPromise);
            parentPath = await parentPromise;
        }
    }

    return parentPath ? `${parentPath} > ${node.name}` : node.name;
}
