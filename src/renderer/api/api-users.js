// ===================================================================
// Fichero: api-users.js
// ===================================================================
import { executeSoapRequest } from './api-core.js';

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
 
        if (filteredRoles.length === 0 && rawRoles.length > 0) return;
 
        const isApiRaw = partnerProp(node, 'isAPIUser') || partnerProp(node, 'IsAPIUser') || directChild(node, 'IsAPIUser') || 'false';
 
        users.push({
            id:           directChild(node, 'ID') || "---",
            name:         directChild(node, 'Name') || "Sin Nombre",
            email:        partnerProp(node, 'email') || partnerProp(node, 'Email') || directChild(node, 'Email') || "---",
            userName:     directChild(node, 'UserID') || "---",
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