// Fichero: src/renderer/components/audit/audit-journeys.js
// Descripción: Pestaña "Journeys" de la auditoría. Analiza estado de publicación, subtipos,
// tipo de entrada, goals/exits, actividad reciente, multicanalidad e integración con Salesforce.
// Reutiliza la caché de detalle de journeys compartida con las vistas de Journeys y Contenidos.
// Patrón: import directo de audit-ui/audit-state (ver nota en audit-users.js).

import * as mcApiService from '../../api/mc-api-service.js';
import elements from '../../ui/dom-elements.js';
import * as ui from '../../ui/ui-helpers.js';
import { ensureJourneysDetailCache } from '../journeys-cache.js';
import {
    AUDIT_PALETTE, formatDate,
    buildTabWrapper, buildKpiRow, buildGrid, buildMetricCard, renderCallouts,
} from './audit-ui.js';
import {
    registerDrill, addDrillRow, registerPdfData, incApiCalls,
} from './audit-state.js';

/**
 * Ejecuta la auditoría de journeys y pinta la pestaña.
 * @param {object} apiConfig - Configuración autenticada para llamar a la API de SFMC.
 */
export async function auditJourneys(apiConfig) {
    incApiCalls();
    const eventDefs = await mcApiService.fetchAllEventDefinitions(apiConfig);

    // Descarga/caché de journeys COMPARTIDA con la vista de Journeys y Contenidos:
    // reutiliza el detalle ya cacheado (por modifiedDate) y solo baja los nuevos/modificados.
    const clientName = elements.clientNameInput?.value?.trim();
    const jResult = await ensureJourneysDetailCache({
        apiConfig, clientName,
        onProgress: (m, s) => ui.blockUI(m, s),
        formatEta: ui.formatEta
    });
    const journeys = jResult.journeys;
    incApiCalls(jResult.apiCalls);

    const total    = journeys.length;
    const status   = {}, entries  = {}, subtypes = {};
    const sfIntegration = { 'Con nodos Salesforce': 0, 'Sin nodos Salesforce': 0 };
    const channels = {}, mixJourneys = {};

    let withGoals = 0, withoutGoals = 0, withExits = 0, withoutExits = 0;
    let publishedCount = 0, logicOnlyCount = 0;
    let activeNoActivity1m = 0, activeNoActivity3m = 0, activeNoActivity6m  = 0,
        activeNoActivity9m = 0, activeNoActivity12m = 0;
    let testNameCount = 0;

    const now = new Date();
    const [oneMonthAgo, threeMonthsAgo, sixMonthsAgo, nineMonthsAgo, twelveMonthsAgo] =
        [1, 3, 6, 9, 12].map(m => new Date(now.getFullYear(), now.getMonth() - m, now.getDate()));

    registerDrill('journey_total',     'Total Journeys',                ['Nombre', 'Versión', 'Estado', 'Subtipo', 'Tipo Entrada', 'Goals', 'Exits', 'Última Mod.']);
    registerDrill('journey_published', 'Journeys Publicados',           ['Nombre', 'Versión', 'Tipo Entrada', 'Goals', 'Exits', 'Última Mod.', 'Última Actividad']);
    registerDrill('journey_draft',     'Borradores',                    ['Nombre', 'Versión', 'Tipo Entrada']);
    registerDrill('journey_stopped',   'Journeys Detenidos',            ['Nombre', 'Versión', 'Tipo Entrada', 'Última Mod.']);
    registerDrill('journey_goal_yes',  'Con Goal Configurado',          ['Nombre', 'Estado', 'Tipo Entrada']);
    registerDrill('journey_goal_no',   'Sin Goal Configurado',          ['Nombre', 'Estado', 'Tipo Entrada']);
    registerDrill('journey_exit_yes',  'Con Criterio de Salida',        ['Nombre', 'Estado', 'Tipo Entrada']);
    registerDrill('journey_exit_no',   'Sin Criterio de Salida',        ['Nombre', 'Estado', 'Tipo Entrada']);
    registerDrill('journey_no_act_1m', 'Publicados sin actividad >1m',  ['Nombre', 'Versión', 'Última Actividad']);
    registerDrill('journey_no_act_3m', 'Publicados sin actividad >3m',  ['Nombre', 'Versión', 'Última Actividad']);
    registerDrill('journey_no_act_6m', 'Publicados sin actividad >6m',  ['Nombre', 'Versión', 'Última Actividad']);
    registerDrill('journey_no_act_9m', 'Publicados sin actividad >9m',  ['Nombre', 'Versión', 'Última Actividad']);
    registerDrill('journey_no_act_12m','Publicados sin actividad >12m', ['Nombre', 'Versión', 'Última Actividad']);
    registerDrill('journey_test_name', 'Journeys con nombre de prueba/test', ['Nombre', 'Versión', 'Estado', 'Subtipo']);

    const eventMapByGuid = {};
    eventDefs.forEach(e => {
        if (e.eventDefinitionKey?.includes('-'))
            eventMapByGuid[e.eventDefinitionKey.substring(e.eventDefinitionKey.indexOf('-') + 1).toLowerCase()] = e;
    });

    for (let i = 0; i < journeys.length; i++) {
        const j       = journeys[i];
        const modDate = formatDate(j.modifiedDate);
        const hasGoal = Array.isArray(j.goals) && j.goals.length > 0;
        const hasExit = Array.isArray(j.exits) && j.exits.length > 0;
        const sub     = j.definitionType || 'Desconocido';

        let type = 'No asociado / Desconocido';
        if (j.defaults?.email?.[0]) {
            const match = j.defaults.email[0].match(/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/i);
            if (match && eventMapByGuid[match[0].toLowerCase()]) type = eventMapByGuid[match[0].toLowerCase()].type;
        }
        if (type === 'No asociado / Desconocido' && j.triggers?.[0]?.type) type = j.triggers[0].type;

        addDrillRow('journey_total', [j.name, j.version, j.status, sub, type, hasGoal?'Sí':'No', hasExit?'Sí':'No', modDate]);

        status[j.status] = (status[j.status] || 0) + 1;
        registerDrill(`journey_status_${j.status}`, `Journeys: ${j.status}`, ['Nombre', 'Versión', 'Tipo Entrada', 'Goals', 'Exits']);
        addDrillRow(`journey_status_${j.status}`, [j.name, j.version, type, hasGoal?'Sí':'No', hasExit?'Sí':'No']);

        subtypes[sub] = (subtypes[sub] || 0) + 1;
        registerDrill(`journey_sub_${sub}`, `Subtipo: ${sub}`, ['Nombre', 'Estado', 'Tipo Entrada', 'Goals', 'Exits']);
        addDrillRow(`journey_sub_${sub}`, [j.name, j.status, type, hasGoal?'Sí':'No', hasExit?'Sí':'No']);

        entries[type] = (entries[type] || 0) + 1;
        registerDrill(`journey_entry_${type.replace(/[^a-z0-9]/gi,'')}`, `Entrada: ${type}`, ['Nombre', 'Estado', 'Subtipo', 'Goals', 'Exits']);
        addDrillRow(`journey_entry_${type.replace(/[^a-z0-9]/gi,'')}`, [j.name, j.status, sub, hasGoal?'Sí':'No', hasExit?'Sí':'No']);

        if (hasGoal) { withGoals++;   addDrillRow('journey_goal_yes', [j.name, j.status, type]); }
        else         { withoutGoals++; addDrillRow('journey_goal_no',  [j.name, j.status, type]); }
        if (hasExit) { withExits++;   addDrillRow('journey_exit_yes', [j.name, j.status, type]); }
        else         { withoutExits++; addDrillRow('journey_exit_no',  [j.name, j.status, type]); }

        if (j.status === 'Published') {
            publishedCount++;
            let lastActStr = 'Sin registro', lastActDate = null;
            if (j.activity?.lastContactProcessed && !j.activity.lastContactProcessed.startsWith('0001')) {
                lastActDate = new Date(j.activity.lastContactProcessed);
                lastActStr  = formatDate(j.activity.lastContactProcessed);
            }
            addDrillRow('journey_published', [j.name, j.version, type, hasGoal?'Sí':'No', hasExit?'Sí':'No', modDate, lastActStr]);
            if (!lastActDate || lastActDate < oneMonthAgo)    { activeNoActivity1m++;  addDrillRow('journey_no_act_1m',  [j.name, j.version, lastActStr]); }
            if (!lastActDate || lastActDate < threeMonthsAgo) { activeNoActivity3m++;  addDrillRow('journey_no_act_3m',  [j.name, j.version, lastActStr]); }
            if (!lastActDate || lastActDate < sixMonthsAgo)   { activeNoActivity6m++;  addDrillRow('journey_no_act_6m',  [j.name, j.version, lastActStr]); }
            if (!lastActDate || lastActDate < nineMonthsAgo)  { activeNoActivity9m++;  addDrillRow('journey_no_act_9m',  [j.name, j.version, lastActStr]); }
            if (!lastActDate || lastActDate < twelveMonthsAgo){ activeNoActivity12m++; addDrillRow('journey_no_act_12m', [j.name, j.version, lastActStr]); }
        }
        if (j.status === 'Draft')   addDrillRow('journey_draft',   [j.name, j.version, type]);
        if (j.status === 'Stopped') addDrillRow('journey_stopped', [j.name, j.version, type, modDate]);

        const TEST_PATTERNS = /test|prueba|tmp|borr/i;
        if (TEST_PATTERNS.test(j.name)) {
            testNameCount++;
            addDrillRow('journey_test_name', [j.name, j.version, j.status, sub]);
        }

        // Análisis profundo (siempre): las actividades ya vienen del helper de caché de journeys.
        const acts = Array.isArray(j.activities) ? j.activities : [];
        const activeChannels = new Set();
        let hasSF = false;
        acts.forEach(a => {
            const t = (a.type || '').toUpperCase();
            if (t === 'EMAILV2') activeChannels.add('Email');
            if (['SMS','SMSSYNC'].includes(t)) activeChannels.add('SMS');
            if (t === 'WHATSAPPACTIVITY') activeChannels.add('WhatsApp');
            if (['INAPP','INBOX','MOBILEPUSH','PUSHINBOXACTIVITY','PUSHNOTIFICATIONACTIVITY'].includes(t)) activeChannels.add('Push / In-App');
            if (['SALESFORCESALESCLOUDACTIVITY','SALESCLOUDACTIVITY','OBJECTACTIVITY','CAMPAIGNMEMBER','LEAD'].includes(t)) hasSF = true;
        });

        const combo = Array.from(activeChannels).sort().join(' + ') || 'Solo Lógica (Sin Envío)';
        channels[combo] = (channels[combo] || 0) + 1;
        if (!mixJourneys[combo]) mixJourneys[combo] = [];
        mixJourneys[combo].push([j.name, j.status, type, hasGoal?'Sí':'No', hasExit?'Sí':'No']);
        if (combo === 'Solo Lógica (Sin Envío)') logicOnlyCount++;

        registerDrill('journey_sf_yes', 'Con Nodos Salesforce', ['Nombre', 'Estado', 'Tipo Entrada']);
        registerDrill('journey_sf_no',  'Sin Nodos Salesforce', ['Nombre', 'Estado', 'Tipo Entrada']);
        if (hasSF) { sfIntegration['Con nodos Salesforce']++; addDrillRow('journey_sf_yes', [j.name, j.status, type]); }
        else       { sfIntegration['Sin nodos Salesforce']++; addDrillRow('journey_sf_no',  [j.name, j.status, type]); }
    }

    const channelBars = Object.entries(channels).sort((a, b) => b[1] - a[1]).map(([label, value]) => {
        const dKey = `journey_mix_${label.replace(/[^a-z0-9]/gi, '')}`;
        registerDrill(dKey, `Mix: ${label}`, ['Nombre', 'Estado', 'Tipo Entrada', 'Goals', 'Exits']);
        (mixJourneys[label] || []).forEach(row => addDrillRow(dKey, row));
        return { label, value, total, color: label === 'Solo Lógica (Sin Envío)' ? AUDIT_PALETTE.gray : undefined, drillKey: dKey };
    });

    const callouts = [];
    const noGoalPct = total > 0 ? Math.round((withoutGoals / total) * 100) : 0;
    if (noGoalPct > 50) callouts.push({ type: 'info', title: 'Mayoría de Journeys sin Goal',
        message: `El ${noGoalPct}% de los Journeys no tienen un Goal definido.` });
    const noActPct = publishedCount > 0 ? Math.round((activeNoActivity1m / publishedCount) * 100) : 0;
    if (noActPct > 30) callouts.push({ type: 'warning', title: 'Journeys activos sin uso',
        message: `El ${noActPct}% de los Journeys publicados no han procesado contactos en el último mes.` });
    if (logicOnlyCount > 0 && Math.round((logicOnlyCount / total) * 100) > 10)
        callouts.push({ type: 'info', title: 'Journeys sin actividades de envío',
            message: `${logicOnlyCount} journeys solo contienen nodos de lógica, sin ningún canal de envío.` });

    const kpis = [
        { value: total,               label: 'Total Journeys',        color: AUDIT_PALETTE.blue,   drillKey: 'journey_total' },
        { value: publishedCount,      label: 'Publicados',            color: AUDIT_PALETTE.green,  drillKey: 'journey_published' },
        { value: status['Draft']  ||0,label: 'Borradores',            color: AUDIT_PALETTE.gray,   drillKey: 'journey_draft' },
        { value: status['Stopped']||0,label: 'Detenidos',             color: AUDIT_PALETTE.red,    drillKey: 'journey_stopped' },
        { value: withGoals,           label: 'Con Goal',              color: AUDIT_PALETTE.green,  drillKey: 'journey_goal_yes' },
        { value: withExits,           label: 'Con salida',            color: AUDIT_PALETTE.blue,   drillKey: 'journey_exit_yes' },
        { value: testNameCount, label: 'Nombre prueba/test', color: testNameCount > 0 ? AUDIT_PALETTE.orange : AUDIT_PALETTE.gray, drillKey: 'journey_test_name' },
    ];

    const baseCards = [
        { title: 'Estado de publicación', help: 'Estado operativo del Journey.', bars:
            Object.entries(status).sort((a, b) => b[1]-a[1]).map(([label, value]) => ({ label, value, total, drillKey: `journey_status_${label}` }))
        },
        { title: 'Subtipo de Journey', help: 'Clasificación del tipo: Multistep, Quicksend, Transactional…', bars:
            Object.entries(subtypes).sort((a, b) => b[1]-a[1]).map(([label, value]) => ({ label, value, total, drillKey: `journey_sub_${label}` }))
        },
        { title: 'Tipología del origen de entrada', help: 'Tipo de Event Definition.', bars:
            Object.entries(entries).sort((a, b) => b[1]-a[1]).map(([label, value]) => ({ label, value, total, drillKey: `journey_entry_${label.replace(/[^a-z0-9]/gi,'')}` }))
        },
        { title: 'Goals y criterios de salida', help: `Base: ${total} journeys.`, bars: [
            { label: 'Con Goal definido',      value: withGoals,    total, color: AUDIT_PALETTE.green,  drillKey: 'journey_goal_yes' },
            { label: 'Sin Goal',               value: withoutGoals, total, color: AUDIT_PALETTE.red,    drillKey: 'journey_goal_no' },
            { label: 'Con criterio de salida', value: withExits,    total, color: AUDIT_PALETTE.green,  drillKey: 'journey_exit_yes' },
            { label: 'Sin criterio de salida', value: withoutExits, total, color: AUDIT_PALETTE.orange, drillKey: 'journey_exit_no' },
        ]},
        // Degradado de antigüedad con la paleta de la app: naranja (aviso) → rojo (crítico)
        { title: 'Actividad reciente (Journeys Publicados)', help: `Base: ${publishedCount} publicados. Tiempo sin procesar contactos.`, bars: [
            { label: 'Sin actividad >1 mes',   value: activeNoActivity1m,  total: publishedCount, color: AUDIT_PALETTE.orange, drillKey: 'journey_no_act_1m' },
            { label: 'Sin actividad >3 meses', value: activeNoActivity3m,  total: publishedCount, color: AUDIT_PALETTE.orange, drillKey: 'journey_no_act_3m' },
            { label: 'Sin actividad >6 meses', value: activeNoActivity6m,  total: publishedCount, color: AUDIT_PALETTE.red,    drillKey: 'journey_no_act_6m' },
            { label: 'Sin actividad >9 meses', value: activeNoActivity9m,  total: publishedCount, color: AUDIT_PALETTE.red,    drillKey: 'journey_no_act_9m' },
            { label: 'Sin actividad >12 meses',value: activeNoActivity12m, total: publishedCount, color: AUDIT_PALETTE.red,    drillKey: 'journey_no_act_12m' },
        ]},
        { title: 'Journeys con nombre de prueba/test', help: 'Journeys que contienen "test", "prueba", "tmp" o "borr" en el nombre. Candidatos a revisión o limpieza.', bars: [
            { label: 'Nombre normal', value: total - testNameCount, total, color: AUDIT_PALETTE.green },
            { label: 'Contiene test/prueba', value: testNameCount, total, color: AUDIT_PALETTE.orange, drillKey: 'journey_test_name' },
        ]},
    ];

    const deepCards = [
        { title: 'Integración con CRM (Salesforce)', help: 'Presencia de actividades de Salesforce.', bars: [
            { label: 'Con nodos Salesforce', value: sfIntegration['Con nodos Salesforce'], total, color: AUDIT_PALETTE.purple, drillKey: 'journey_sf_yes' },
            { label: 'Sin nodos Salesforce', value: sfIntegration['Sin nodos Salesforce'], total, color: AUDIT_PALETTE.gray,   drillKey: 'journey_sf_no' },
        ]},
        { title: 'Multicanalidad', help: 'Combinación de canales (Email, SMS, Push/In-App, WhatsApp).', bars: channelBars },
    ];

    registerPdfData('journeys', kpis, [...baseCards, ...deepCards], callouts);

    document.getElementById('audit-tab-journeys').innerHTML = buildTabWrapper(
        buildKpiRow(kpis) + renderCallouts(callouts) +
        buildGrid(baseCards.map(c => buildMetricCard(c.title, c.help, c.bars, { wide: c.wide }))) +
        buildGrid(deepCards.map(c => buildMetricCard(c.title, c.help, c.bars, { wide: c.wide })))
    );
}
