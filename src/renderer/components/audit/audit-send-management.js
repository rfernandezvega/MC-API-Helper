// Fichero: src/renderer/components/audit/audit-send-management.js
// Descripción: Pestaña "Send Management" de la auditoría. Analiza Send Classifications y
// Sender Profiles: perfiles huérfanos, from dinámico, AutoReply/Forward y concentración de froms.
// Patrón: import directo de audit-ui/audit-state (ver nota en audit-users.js).

import * as mcApiService from '../../api/mc-api-service.js';
import {
    AUDIT_PALETTE,
    buildTabWrapper, buildKpiRow, buildGrid, buildMetricCard, renderCallouts,
} from './audit-ui.js';
import {
    registerDrill, addDrillRow, registerPdfData, incApiCalls,
} from './audit-state.js';

/**
 * Ejecuta la auditoría de Send Management y pinta la pestaña.
 * @param {object} apiConfig - Configuración autenticada para llamar a la API de SFMC.
 */
export async function auditSendManagement(apiConfig) {
    incApiCalls(2);
    const [sc, sp] = await Promise.all([
        mcApiService.fetchAllSendClassifications(apiConfig),
        mcApiService.fetchAllSenderProfiles(apiConfig),
    ]);

    const usage  = { 'En uso': 0, 'Huérfanos (sin clasificación)': 0 };
    const config = { 'From dinámico (%%=)': 0, 'Con AutoReply': 0, 'Con Forward': 0 };
    const froms  = {};
    const usedKeys = new Set(sc.map(s => s.senderProfile).filter(Boolean));

    registerDrill('sm_sc',      'Send Classifications', ['Nombre', 'Customer Key', 'Sender Profile', 'Delivery Profile']);
    registerDrill('sm_sp',      'Sender Profiles',      ['Nombre', 'Customer Key', 'From Name', 'From Email', 'AutoReply', 'Forward']);
    registerDrill('sm_in_use',  'Perfiles en Uso',      ['Nombre', 'From Email', 'Send Classification Asociada']);
    registerDrill('sm_orphans', 'Perfiles Huérfanos',   ['Nombre', 'Customer Key', 'From Email']);
    registerDrill('sm_dynamic', 'From Dinámico',        ['Nombre', 'From Name', 'From Email']);
    registerDrill('sm_reply',   'Con AutoReply',        ['Nombre', 'From Email']);
    registerDrill('sm_forward', 'Con Forward',          ['Nombre', 'Forward To', 'From Email']);

    sc.forEach(s => addDrillRow('sm_sc', [s.name, s.customerKey, s.senderProfile, s.deliveryProfile]));

    sp.forEach(p => {
        const hasForward = p.autoForwardEmail && p.autoForwardEmail !== '---';
        addDrillRow('sm_sp', [p.name, p.customerKey, p.fromName, p.fromAddress, p.autoReply?'Sí':'No', hasForward?p.autoForwardEmail:'No']);

        if (usedKeys.has(p.customerKey)) {
            usage['En uso']++;
            addDrillRow('sm_in_use', [p.name, p.fromAddress, sc.find(s => s.senderProfile === p.customerKey)?.name || 'Sí']);
        } else {
            usage['Huérfanos (sin clasificación)']++;
            addDrillRow('sm_orphans', [p.name, p.customerKey, p.fromAddress]);
        }

        if ((p.fromAddress||'').includes('%%=') || (p.fromName||'').includes('%%=')) { config['From dinámico (%%=)']++; addDrillRow('sm_dynamic', [p.name, p.fromName, p.fromAddress]); }
        if (p.autoReply) { config['Con AutoReply']++; addDrillRow('sm_reply', [p.name, p.fromAddress]); }
        if (hasForward)  { config['Con Forward']++;   addDrillRow('sm_forward', [p.name, p.autoForwardEmail, p.fromAddress]); }

        const fromKey = p.fromAddress || 'Sin dirección From';
        froms[fromKey] = (froms[fromKey] || 0) + 1;
        const dKeyFrom = `sm_from_${fromKey.replace(/[^a-z0-9]/gi, '')}`;
        registerDrill(dKeyFrom, `Sender Profiles con From: ${fromKey}`, ['Nombre', 'From Name', 'Customer Key', 'AutoReply', 'Forward']);
        addDrillRow(dKeyFrom, [p.name, p.fromName, p.customerKey, p.autoReply?'Sí':'No', hasForward?p.autoForwardEmail:'No']);
    });

    const orphanCount = usage['Huérfanos (sin clasificación)'];
    const orphanPct   = sp.length > 0 ? Math.round((orphanCount / sp.length) * 100) : 0;

    const callouts = [];
    if (orphanCount > 0) callouts.push({ type: 'warning', title: 'Sender Profiles huérfanos',
        message: `${orphanCount} perfil(es) (${orphanPct}%) no están asociados a ninguna Send Classification. Están configurados pero no se pueden usar en envíos.` });
    if (config['From dinámico (%%=)'] > 0) callouts.push({ type: 'info', title: 'Remitente dinámico detectado',
        message: `${config['From dinámico (%%=)']} perfiles usan AMPscript (%%=) en el campo From. Verificar que la lógica de personalización sea intencionada.` });

    const fromBars = Object.entries(froms).sort((a,b)=>b[1]-a[1]).map(([label,value]) => ({
        label, value, total: sp.length, drillKey: `sm_from_${label.replace(/[^a-z0-9]/gi,'')}`,
    }));

    const kpis = [
        { value: sc.length,                     label: 'Send Classifications', color: AUDIT_PALETTE.blue,   drillKey: 'sm_sc' },
        { value: sp.length,                     label: 'Sender Profiles',      color: AUDIT_PALETTE.teal,   drillKey: 'sm_sp' },
        { value: usage['En uso'],               label: 'Perfiles en uso',      color: AUDIT_PALETTE.green,  drillKey: 'sm_in_use' },
        { value: orphanCount,                   label: 'Perfiles huérfanos',   color: orphanCount > 0 ? AUDIT_PALETTE.red : AUDIT_PALETTE.gray, drillKey: 'sm_orphans' },
        { value: config['From dinámico (%%=)'], label: 'From dinámico',        color: AUDIT_PALETTE.purple, drillKey: 'sm_dynamic' },
    ];

    const cards = [
        { title: 'Gobernanza de perfiles', help: `Base: ${sp.length} Sender Profiles. Verifica vinculación con Send Classification.`, bars: [
            { label: 'En uso',                        value: usage['En uso'],                       total: sp.length, color: AUDIT_PALETTE.green, drillKey: 'sm_in_use' },
            { label: 'Huérfanos (sin clasificación)', value: usage['Huérfanos (sin clasificación)'], total: sp.length, color: AUDIT_PALETTE.red,   drillKey: 'sm_orphans' },
        ]},
        { title: 'Funcionalidades avanzadas', help: 'Revisa si el Sender contiene AMPScript además de AutoReply y Forward.', bars: [
            { label: 'From dinámico (%%=)', value: config['From dinámico (%%=)'], total: sp.length, color: AUDIT_PALETTE.purple, drillKey: 'sm_dynamic' },
            { label: 'Con AutoReply',       value: config['Con AutoReply'],       total: sp.length, color: AUDIT_PALETTE.orange, drillKey: 'sm_reply' },
            { label: 'Con Forward',         value: config['Con Forward'],         total: sp.length, color: AUDIT_PALETTE.blue,   drillKey: 'sm_forward' },
        ]},
        { title: 'Concentración de direcciones From', help: 'Top 8 remitentes.', bars: fromBars, wide: true },
    ];

    registerPdfData('sm', kpis, cards, callouts);
    document.getElementById('audit-tab-sm').innerHTML = buildTabWrapper(
        buildKpiRow(kpis) + renderCallouts(callouts) +
        buildGrid(cards.map(c => buildMetricCard(c.title, c.help, c.bars, { wide: c.wide })))
    );
}
