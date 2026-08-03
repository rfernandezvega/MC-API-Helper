// ===================================================================
// Fichero: api-users.js
// ===================================================================
import { executeSoapRequest } from './api-core.js';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isSystemUser = (name, userName) =>
    name.trim().toLowerCase().endsWith('app user') &&
    UUID_REGEX.test(userName.trim());

/**
 * Extrae a todos los usuarios de la instancia mediante SOAP y aplana su información base y sus roles.
 * Omite los roles ocultos de sistema ("Individual role for").
 * @param {object} apiConfig - Configuración autenticada de la API.
 * @returns {Promise<Array>} Lista de usuarios y propiedades como LastLogin, Estado, API User, etc.
 */
export async function fetchAllUsers(apiConfig) {
    const soapPayload = `<?xml version="1.0" encoding="UTF-8"?>
    <s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope" xmlns:a="http://schemas.xmlsoap.org/ws/2004/08/addressing">
        <s:Header>
            <a:Action s:mustUnderstand="1">Retrieve</a:Action>
            <a:To s:mustUnderstand="1">${apiConfig.soapUri}</a:To>
            <fueloauth xmlns="http://exacttarget.com">${apiConfig.accessToken}</fueloauth>
        </s:Header>
        <s:Body xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema">
            <RetrieveRequestMsg xmlns="http://exacttarget.com/wsdl/partnerAPI">
                <RetrieveRequest>
                    <ObjectType>AccountUser</ObjectType>
                    <Properties>ID</Properties>
                    <Properties>Email</Properties>
                    <Properties>Name</Properties>
                    <Properties>ModifiedDate</Properties>
                    <Properties>ActiveFlag</Properties>
                    <Properties>CreatedDate</Properties>
                    <Properties>IsAPIUser</Properties>
                    <Properties>UserID</Properties>
                    <Properties>LastSuccessfulLogin</Properties>
                    <Properties>Roles</Properties>
                    <Properties>CustomerKey</Properties>
                </RetrieveRequest>
            </RetrieveRequestMsg>
        </s:Body>
    </s:Envelope>`;
 
    const responseText = await executeSoapRequest(apiConfig.soapUri, soapPayload);
    const doc = new DOMParser().parseFromString(responseText, "application/xml");
    const results = doc.querySelectorAll("Results");
 
    const directChild = (node, tag) =>
        Array.from(node.children).find(n => n.tagName === tag)?.textContent || null;
 
    const partnerProp = (node, propName) => {
        const entries = Array.from(node.querySelectorAll('PartnerProperties'));
        const entry = entries.find(e => e.querySelector('Name')?.textContent === propName);
        return entry ? entry.querySelector('Value')?.textContent || null : null;
    };
 
    const users = [];
    results.forEach(node => {
        const rawRoles = Array.from(node.querySelectorAll("Roles Role"));
        
        const filteredRoles = rawRoles
            .map(r => ({
                name: r.querySelector("Name")?.textContent || "Sin nombre",
                objectId: r.querySelector("ObjectID")?.textContent
            }))
            .filter(r => !r.name.includes("Individual role for"));
 
        const userName = directChild(node, 'UserID') || '';
        const name     = directChild(node, 'Name')   || '';
        if (isSystemUser(name, userName)) return;
 
        const isApiRaw = partnerProp(node, 'isAPIUser') || partnerProp(node, 'IsAPIUser') || directChild(node, 'IsAPIUser') || 'false';
 
        users.push({
            id:           directChild(node, 'ID') || "---",
            name:         name || "Sin Nombre",
            email:        partnerProp(node, 'email') || partnerProp(node, 'Email') || directChild(node, 'Email') || "---",
            userName:     userName || "---",
            customerKey:  directChild(node, 'CustomerKey') || "---",
            isActive:     directChild(node, 'ActiveFlag') === 'true',
            isApi:        isApiRaw.toLowerCase() === 'true',
            lastLogin:    directChild(node, 'LastSuccessfulLogin') || null,
            createdDate:  directChild(node, 'CreatedDate') || null,
            modifiedDate: directChild(node, 'ModifiedDate') || null,
            roles: filteredRoles
        });
    });
 
    return users;
}

/**
 * Dada una lista de IDs de roles, obtiene un diccionario consolidado de permisos a nivel granular
 * indicando si una acción (Ej: "Create Data Extension") está True/False basado en un OR lógico de los roles aportados.
 * @param {Array<string>} roleIds - IDs internos de los Roles a inspeccionar.
 * @param {object} apiConfig - Configuración autenticada de la API.
 * @returns {Promise<object>} Un árbol JSON de permisos por objeto.
 */
export async function fetchRolesPermissions(roleIds, apiConfig) {
    if (!roleIds || roleIds.length === 0) return {};

    const filterNodes = roleIds.map(id => `
        <Filter xsi:type="SimpleFilterPart">
            <Property>ObjectID</Property>
            <SimpleOperator>equals</SimpleOperator>
            <Value>${id}</Value>
        </Filter>`).join('');
    
    let allPermissions = {};

    for (const id of roleIds) {
        const soapPayload = `
        <s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope" xmlns:a="http://schemas.xmlsoap.org/ws/2004/08/addressing">
            <s:Header>
                <a:Action s:mustUnderstand="1">Retrieve</a:Action>
                <a:To s:mustUnderstand="1">${apiConfig.soapUri}</a:To>
                <fueloauth xmlns="http://exacttarget.com">${apiConfig.accessToken}</fueloauth>
            </s:Header>
            <s:Body xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema">
                <RetrieveRequestMsg xmlns="http://exacttarget.com/wsdl/partnerAPI">
                    <RetrieveRequest>
                        <ObjectType>Role</ObjectType>
                        <Properties>ObjectID</Properties>
                        <Properties>Permissions</Properties>
                        <Filter xsi:type="SimpleFilterPart">
                            <Property>ObjectID</Property>
                            <SimpleOperator>equals</SimpleOperator>
                            <Value>${id}</Value>
                        </Filter>
                    </RetrieveRequest>
                </RetrieveRequestMsg>
            </s:Body>
        </s:Envelope>`;

        const resp = await executeSoapRequest(apiConfig.soapUri, soapPayload);
        const doc = new DOMParser().parseFromString(resp, "application/xml");
        
        doc.querySelectorAll("Permissions > Permission").forEach(p => {
            const objType = p.querySelector("ObjectType")?.textContent || "General";
            const name = p.querySelector("Name")?.textContent;
            const isAllowed = p.querySelector("IsAllowed")?.textContent === 'true';

            if (!allPermissions[objType]) allPermissions[objType] = {};
            if (isAllowed) allPermissions[objType][name] = true;
            else if (allPermissions[objType][name] === undefined) allPermissions[objType][name] = false;
        });
    }
    return allPermissions;
}

/**
 * Recupera las Business Units (cuentas) del tenant vía SOAP. Debe ejecutarse con un token de la
 * BU Enterprise/principal para que devuelva todas las BUs hijas.
 * @param {object} apiConfig - Configuración autenticada (token de la BU principal).
 * @returns {Promise<Array<{name:string, mid:string, parentId:string, accountType:string}>>}
 */
export async function fetchBusinessUnits(apiConfig) {
    const soapPayload = `<?xml version="1.0" encoding="UTF-8"?>
    <s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope" xmlns:a="http://schemas.xmlsoap.org/ws/2004/08/addressing">
        <s:Header>
            <a:Action s:mustUnderstand="1">Retrieve</a:Action>
            <a:To s:mustUnderstand="1">${apiConfig.soapUri}</a:To>
            <fueloauth xmlns="http://exacttarget.com">${apiConfig.accessToken}</fueloauth>
        </s:Header>
        <s:Body xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema">
            <RetrieveRequestMsg xmlns="http://exacttarget.com/wsdl/partnerAPI">
                <RetrieveRequest>
                    <ObjectType>BusinessUnit</ObjectType>
                    <Properties>Name</Properties>
                    <Properties>ID</Properties>
                    <QueryAllAccounts>true</QueryAllAccounts>
                </RetrieveRequest>
            </RetrieveRequestMsg>
        </s:Body>
    </s:Envelope>`;

    const responseText = await executeSoapRequest(apiConfig.soapUri, soapPayload);
    const doc = new DOMParser().parseFromString(responseText, "application/xml");
    const directChild = (node, tag) =>
        Array.from(node.children).find(n => n.tagName === tag)?.textContent || null;

    const bus = [];
    doc.querySelectorAll("Results").forEach(node => {
        const mid = directChild(node, 'ID');
        if (!mid) return;
        bus.push({
            mid: String(mid),
            name: directChild(node, 'Name') || `BU ${mid}`,
            parentId: directChild(node, 'ParentID') || '',
            accountType: directChild(node, 'AccountType') || ''
        });
    });
    return bus;
}