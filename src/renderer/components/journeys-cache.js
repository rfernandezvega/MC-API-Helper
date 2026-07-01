// Fichero: src/renderer/components/journeys-cache.js
// Descripción: Descarga y caché de journeys con detalle (actividades) COMPARTIDA entre la vista
// de Journeys, la vista de Contenidos y la Auditoría. Fuente única: ClientJourneys/<cliente>.json.
// Reutiliza el detalle por-journey ya cacheado (mismo modifiedDate) y solo descarga los nuevos o
// modificados, de modo que no se dupliquen llamadas entre vistas.

import * as mcApiService from '../api/mc-api-service.js';

/**
 * Extrae las comunicaciones (emails/sms/push/whatsapp) de las actividades de un journey.
 * @param {Array} activities
 * @returns {{emails:Array, sms:Array, pushes:Array, whatsapps:Array}}
 */
export function parseJourneyActivities(activities = []) {
    const communications = { emails: [], sms: [], pushes: [], whatsapps: [] };
    if (!activities) return communications;
    for (const activity of activities) {
        if (activity.type === 'EMAILV2') {
            const triggeredKey = activity.configurationArguments?.triggeredSend?.key ||
                activity.configurationArguments?.triggeredSendKey || activity.key;
            communications.emails.push({ name: activity.name, customerKey: triggeredKey });
        } else if (['SMS', 'SMSSYNC'].includes(activity.type)) {
            communications.sms.push(activity.name);
        } else if (['INAPP', 'INBOX', 'MOBILEPUSH', 'PUSHINBOXACTIVITY', 'PUSHNOTIFICATIONACTIVITY'].includes(activity.type)) {
            communications.pushes.push(activity.name);
        } else if (activity.type === 'WHATSAPPACTIVITY') {
            communications.whatsapps.push(activity.name);
        }
    }
    return communications;
}

function hasComms(c) {
    return !!(c.emails.length || c.sms.length || c.pushes.length || c.whatsapps.length);
}

/**
 * Garantiza que exista en caché el detalle (actividades) de TODOS los journeys y lo devuelve.
 * - Descarga la lista completa (1 llamada).
 * - Reutiliza de la caché el detalle de cada journey si su modifiedDate coincide (0 llamadas).
 * - Descarga el detalle solo de los journeys nuevos o modificados.
 * - Guarda el resultado completo en ClientJourneys (sirve a Journeys, Contenidos y Auditoría).
 *
 * @param {object} opts
 * @param {object} opts.apiConfig
 * @param {string} opts.clientName
 * @param {function} [opts.onProgress] - (message, subMessage) para el loader.
 * @param {function} [opts.formatEta] - formateador de ETA (segundos → texto).
 * @returns {Promise<{journeys:Array, lastRefresh:string, apiCalls:number, downloaded:number, reused:number}>}
 */
export async function ensureJourneysDetailCache({ apiConfig, clientName, onProgress, formatEta }) {
    let apiCalls = 0;
    if (onProgress) onProgress('Obteniendo lista de journeys…');

    const listResp = await mcApiService.fetchAllJourneys(apiConfig);
    apiCalls++;
    const list = Array.isArray(listResp) ? listResp : (Array.isArray(listResp?.items) ? listResp.items : []);

    // Caché existente por id
    const cacheById = {};
    try {
        const cached = await window.electronAPI.loadClientJourneys(clientName);
        if (cached?.success && Array.isArray(cached.journeys)) {
            for (const j of cached.journeys) cacheById[String(j.id)] = j;
        }
    } catch { /* sin caché previa */ }

    const start = Date.now();
    const full = [];
    let downloaded = 0, reused = 0;

    for (let i = 0; i < list.length; i++) {
        const j = list[i];
        const cachedJ = cacheById[String(j.id)];
        let activities;

        // Reutilizar si está cacheado con el mismo modifiedDate (misma versión)
        if (cachedJ && Array.isArray(cachedJ.activities) && cachedJ.modifiedDate === j.modifiedDate) {
            activities = cachedJ.activities;
            reused++;
        } else {
            try {
                const detail = await mcApiService.fetchJourneyDetailsById(j.id, apiConfig);
                apiCalls++;
                downloaded++;
                activities = (detail && detail.activities) || [];
            } catch {
                activities = [];
            }
        }

        const comms = parseJourneyActivities(activities);
        full.push({ ...j, activities, ...comms, hasCommunications: hasComms(comms) });

        if (onProgress && (i % 5 === 0 || i === list.length - 1)) {
            let sub = '';
            const elapsed = (Date.now() - start) / 1000;
            if (formatEta && i > 0 && elapsed > 0) {
                const eta = formatEta((list.length - (i + 1)) / ((i + 1) / elapsed));
                if (eta) sub = `Tiempo estimado restante: ${eta}`;
            }
            onProgress(`Analizando journeys ${i + 1}/${list.length}…`, sub);
        }
    }

    const lastRefresh = new Date().toISOString();
    try {
        await window.electronAPI.saveClientJourneys({ clientName, journeys: full, lastRefresh });
    } catch { /* si falla el guardado, seguimos con los datos en memoria */ }

    return { journeys: full, lastRefresh, apiCalls, downloaded, reused };
}
