// ===================================================================
// Fichero: api-whatsapp.js
// Descripción: Búsqueda y alta de contactos de audiencia WhatsApp (GroupConnect / Chat Messaging).
// Usa la API REST de Contacts sobre los attribute sets estándar "Chat Message Demographics" y
// "Chat Message Subscriptions". El channelId NO está hardcodeado: se configura por cliente+BU.
// ===================================================================
import { executeRestRequest } from './api-core.js';

const jsonHeaders = (apiConfig) => ({
    'Authorization': `Bearer ${apiConfig.accessToken}`,
    'Content-Type': 'application/json'
});

/**
 * Busca contactos de WhatsApp por Contact Key o por Mobile Number y devuelve, para cada uno,
 * su teléfono, locale y los canales (ChannelId) a los que está suscrito.
 * @param {string} term - Contact Key o número de móvil (con prefijo).
 * @param {object} apiConfig - Configuración autenticada de la API.
 * @returns {Promise<Array<{key:string, mobile:string, locale:string, channels:string[]}>>}
 */
export async function searchWhatsappContacts(term, apiConfig) {
    const searchUrl = `${apiConfig.restUri}contacts/v1/contacts/search`;

    // Busca por Contact Key siempre; y por Mobile Number solo si el término es numérico (evita 400).
    const conditions = [
        { attribute: { key: 'Contact.Contact Key' }, operator: 'Equals', value: { items: [term] } }
    ];
    if (!isNaN(term)) {
        conditions.push({ attribute: { key: 'Chat Message Demographics.Mobile Number' }, operator: 'Equals', value: { items: [term] } });
    }

    const searchRes = await executeRestRequest(searchUrl, {
        method: 'POST',
        headers: jsonHeaders(apiConfig),
        body: JSON.stringify({ conditionSet: { operator: 'Or', conditions } })
    });

    if (!searchRes || !searchRes.count || !Array.isArray(searchRes.items)) return [];

    const results = [];
    for (const item of searchRes.items) {
        const cKey = item.contactKey;
        const contact = { key: cKey, mobile: '', locale: '', channels: [] };

        const attrRes = await executeRestRequest(`${apiConfig.restUri}contacts/v1/attributes/search`, {
            method: 'POST',
            headers: jsonHeaders(apiConfig),
            body: JSON.stringify({
                request: {
                    attributes: [
                        { key: 'Chat Message Demographics.Mobile Number' },
                        { key: 'Chat Message Demographics.Locale' },
                        { key: 'Chat Message Subscriptions.ChannelId' }
                    ]
                },
                conditionSet: {
                    operator: 'And',
                    conditions: [{ attribute: { key: 'Contact.Contact Key' }, operator: 'Equals', value: { items: [cKey] } }]
                }
            })
        });

        for (const m of (attrRes.items || [])) {
            for (const row of (m.values || [])) {
                if (!row || !row.key) continue;
                if (row.key.indexOf('Mobile Number') > -1) contact.mobile = row.value || '';
                else if (row.key.indexOf('Locale') > -1) contact.locale = row.value || '';
                else if (row.key.indexOf('ChannelId') > -1 && row.value && !contact.channels.includes(row.value)) {
                    contact.channels.push(row.value);
                }
            }
        }
        results.push(contact);
    }
    return results;
}

/**
 * Da de alta un contacto de WhatsApp creando los attribute sets Chat Message Demographics/Subscriptions.
 * @param {object} data - { contactKey, mobile, locale, channelId }
 * @param {object} apiConfig - Configuración autenticada de la API.
 * @returns {Promise<object>} Respuesta de la API.
 */
export async function createWhatsappContact({ contactKey, mobile, locale, channelId }, apiConfig) {
    const now = new Date().toISOString();
    const payload = {
        contactKey,
        attributeSets: [
            {
                name: 'Chat Message Demographics',
                items: [{ values: [
                    { name: 'Mobile Number', value: mobile },
                    { name: 'Locale', value: locale },
                    { name: 'Status', value: 1 },
                    { name: 'Channel', value: 'Mobile' },
                    { name: 'Created Date', value: now },
                    { name: 'Modified Date', value: now }
                ] }]
            },
            {
                name: 'Chat Message Subscriptions',
                items: [{ values: [
                    { name: 'ChannelId', value: channelId },
                    { name: 'ChannelType', value: 'WhatsApp' },
                    { name: 'MobileNumber', value: mobile },
                    { name: 'OptOutStatusID', value: 0 },
                    { name: 'OptInStatusID', value: 0 },
                    { name: 'OptInMethodID', value: 1 },
                    { name: 'CreatedDate', value: now },
                    { name: 'ModifiedDate', value: now }
                ] }]
            }
        ]
    };

    return executeRestRequest(`${apiConfig.restUri}contacts/v1/contacts`, {
        method: 'POST',
        headers: jsonHeaders(apiConfig),
        body: JSON.stringify(payload)
    });
}
