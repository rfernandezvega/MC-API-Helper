// Fichero: src/renderer/components/audit-content.js
// Descripción: Pestaña "Contenidos" de la Auditoría. Se calcula a partir de la MISMA caché
// que usa la vista de Contenidos (ClientContents) y de la caché de Journeys (ClientJourneys),
// sin llamadas a la API. La lógica de render/drill se recibe desde audit-manager (ctx.helpers).

const EMAIL_IDS = [207, 208, 209];
const EMAIL_TYPE_LABEL = { 207: 'Template-Based', 208: 'HTML', 209: 'Text-only' };
const MSG_ID = 230;              // push / sms / whatsapp
const TEMPLATE_ID = 4;
const WA_TEMPLATE_ID = 235;
const SNIPPET_ID = 220;
const BLOCK_IDS = [195, 197, 212, 223, 201, 193, 196, 213, 199, 224];

function fmtDate(ds) {
    if (!ds) return '---';
    try { return new Date(ds).toLocaleDateString('es-ES'); } catch { return '---'; }
}

/**
 * Marca los contenidos "sin uso" (bloques/plantillas/snippets/plantillas WA) siguiendo la misma
 * cadena de referencias que la vista de Contenidos. Devuelve un Set de ids sin uso.
 */
function computeUnusedIds(contents) {
    const msgTypes = [...EMAIL_IDS, MSG_ID];
    const refIds = new Set(), refKeys = new Set(), refNames = new Set(), refTemplates = new Set();

    for (const item of contents) {
        if (!msgTypes.includes(item.assetTypeId)) continue;
        const searchIn = [item.content, item.resolvedContent, item.message, item.waParams].filter(Boolean).join('\n');
        if (searchIn) {
            for (const m of searchIn.matchAll(/ContentBlockby[Ii][Dd]\s*\(\s*["']?(\d+)["']?\s*\)/gi)) refIds.add(m[1]);
            for (const m of searchIn.matchAll(/ContentBlockby[Kk]ey\s*\(\s*["']([^"']+)["']\s*\)/gi)) refKeys.add(m[1]);
            for (const m of searchIn.matchAll(/ContentBlockby[Nn]ame\s*\(\s*["']([^"']+)["']\s*\)/gi)) refNames.add(m[1]);
        }
        if (item.templateName) refTemplates.add(item.templateName);
        if (item.slotBlockIds) for (const id of item.slotBlockIds) refIds.add(String(id));
        if (item.waTemplateRefId) refIds.add(String(item.waTemplateRefId));
    }

    const isReferenced = (item) =>
        refIds.has(String(item.id)) ||
        (item.customerKey && refKeys.has(item.customerKey)) ||
        (item.name && refNames.has(item.name)) ||
        (item.assetTypeId === TEMPLATE_ID && refTemplates.has(item.name));

    // Propagar: bloques en uso que a su vez referencian a otros
    let changed = true;
    while (changed) {
        changed = false;
        for (const item of contents) {
            if (msgTypes.includes(item.assetTypeId) || !item.content) continue;
            if (!isReferenced(item)) continue;
            for (const m of item.content.matchAll(/ContentBlockby[Ii][Dd]\s*\(\s*["']?(\d+)["']?\s*\)/gi)) { if (!refIds.has(m[1])) { refIds.add(m[1]); changed = true; } }
            for (const m of item.content.matchAll(/ContentBlockby[Kk]ey\s*\(\s*["']([^"']+)["']\s*\)/gi)) { if (!refKeys.has(m[1])) { refKeys.add(m[1]); changed = true; } }
            for (const m of item.content.matchAll(/ContentBlockby[Nn]ame\s*\(\s*["']([^"']+)["']\s*\)/gi)) { if (!refNames.has(m[1])) { refNames.add(m[1]); changed = true; } }
        }
    }

    const unused = new Set();
    for (const item of contents) {
        if (msgTypes.includes(item.assetTypeId)) continue;
        if (!isReferenced(item)) unused.add(item.id);
    }
    return unused;
}

/** Referencias de contenido usadas por los journeys (emails por legacyId, mensajes por assetId). */
function computeJourneyRefs(journeys) {
    const emailLegacy = new Set(), assetIds = new Set();
    for (const j of (journeys || [])) {
        for (const a of (j.activities || [])) {
            const cfg = a.configurationArguments || {};
            if (a.type === 'EMAILV2' && cfg.triggeredSend?.emailId != null) emailLegacy.add(String(cfg.triggeredSend.emailId));
            if (cfg.assetId != null) assetIds.add(String(cfg.assetId));
        }
    }
    return { emailLegacy, assetIds };
}

/**
 * Pinta la pestaña de Contenidos de la auditoría.
 * @param {object} ctx - { clientName, helpers }
 */
export async function auditContent(ctx) {
    const { clientName, helpers } = ctx;
    const {
        registerDrill, addDrillRow, registerPdfData,
        buildTabWrapper, buildKpiRow, buildGrid, buildMetricCard, buildCallout, parsePdfCallout
    } = helpers;

    const tabEl = document.getElementById('audit-tab-content');
    if (!tabEl) return;

    // Caché de contenidos (la misma de la vista de Contenidos)
    const contentRes = await window.electronAPI.loadClientContents(clientName);
    const contents = (contentRes && contentRes.success && Array.isArray(contentRes.contents)) ? contentRes.contents : [];
    if (contents.length === 0) {
        tabEl.innerHTML = buildTabWrapper(buildCallout('warning', 'Sin caché de contenidos',
            'No hay contenidos cacheados para este cliente. Ve a la vista de <b>Contenidos</b> y pulsa <b>Refrescar</b> para poder auditarlos aquí (se reutiliza esa misma caché).'));
        registerPdfData('content', [], [], []);
        return;
    }

    // Caché de journeys (para clasificar comunicaciones en/fuera de journeys)
    const journeysRes = await window.electronAPI.loadClientJourneys(clientName);
    const journeys = (journeysRes && journeysRes.success && Array.isArray(journeysRes.journeys)) ? journeysRes.journeys : [];
    const hasJourneys = journeys.length > 0;
    const { emailLegacy, assetIds } = computeJourneyRefs(journeys);

    const unusedIds = computeUnusedIds(contents);

    // Índices por categoría
    const emails = contents.filter(c => EMAIL_IDS.includes(c.assetTypeId));
    const plantillas = contents.filter(c => c.assetTypeId === TEMPLATE_ID);
    const waTemplates = contents.filter(c => c.assetTypeId === WA_TEMPLATE_ID);
    const snippets = contents.filter(c => c.assetTypeId === SNIPPET_ID);
    const bloques = contents.filter(c => BLOCK_IDS.includes(c.assetTypeId));
    const push = contents.filter(c => c.assetTypeId === MSG_ID && c.type === 'push');
    const sms = contents.filter(c => c.assetTypeId === MSG_ID && c.type === 'sms');
    const whatsapps = contents.filter(c => c.assetTypeId === MSG_ID && c.type === 'whatsapptemplate');

    const callouts = [];

    // ── 1. Resumen por tipo de contenido ──────────────────────────────────
    registerDrill('ct_overview', 'Contenidos', ['ID', 'Nombre', 'Tipo', 'Modificado']);
    const overviewGroups = [
        ['Emails', emails], ['Plantillas', plantillas], ['Push', push], ['SMS', sms],
        ['WhatsApp', whatsapps], ['Plantillas WA', waTemplates], ['Bloques', bloques], ['Code Snippet', snippets]
    ];
    const overviewBars = [];
    overviewGroups.forEach(([label, arr]) => {
        const key = `ct_cat_${label.replace(/[^a-z0-9]/gi, '')}`;
        registerDrill(key, `Contenidos: ${label}`, ['ID', 'Nombre', 'Tipo', 'Modificado']);
        arr.forEach(c => {
            addDrillRow(key, [c.id, c.name, c.assetTypeName || '---', fmtDate(c.modifiedDate)]);
            addDrillRow('ct_overview', [c.id, c.name, c.assetTypeName || '---', fmtDate(c.modifiedDate)]);
        });
        overviewBars.push({ label, value: arr.length, total: contents.length, drillKey: key });
    });

    // ── 2. Emails por tipo ────────────────────────────────────────────────
    const emailTypeCounts = {};
    EMAIL_IDS.forEach(id => {
        const key = `ct_email_${id}`;
        registerDrill(key, `Emails: ${EMAIL_TYPE_LABEL[id]}`, ['ID', 'Nombre', 'Plantilla', 'Modificado']);
    });
    emails.forEach(e => {
        emailTypeCounts[e.assetTypeId] = (emailTypeCounts[e.assetTypeId] || 0) + 1;
        addDrillRow(`ct_email_${e.assetTypeId}`, [e.id, e.name, e.templateName || '---', fmtDate(e.modifiedDate)]);
    });
    const emailTypeBars = EMAIL_IDS.map(id => ({
        label: EMAIL_TYPE_LABEL[id], value: emailTypeCounts[id] || 0, total: emails.length, drillKey: `ct_email_${id}`
    }));

    // ── 3. Emails con plantilla existente / inexistente ───────────────────
    const templateIds = new Set(plantillas.map(t => String(t.id)));
    const templateNames = new Set(plantillas.map(t => t.name).filter(Boolean));
    registerDrill('ct_tpl_ok', 'Emails con plantilla existente', ['ID', 'Nombre', 'Plantilla', 'Modificado']);
    registerDrill('ct_tpl_missing', 'Emails con plantilla inexistente', ['ID', 'Nombre', 'Plantilla', 'Modificado']);
    let tplOk = 0, tplMissing = 0;
    emails.forEach(e => {
        const usesTemplate = e.templateId != null || !!e.templateName;
        if (!usesTemplate) return;
        const exists = (e.templateId != null && templateIds.has(String(e.templateId))) || (e.templateName && templateNames.has(e.templateName));
        if (exists) { tplOk++; addDrillRow('ct_tpl_ok', [e.id, e.name, e.templateName || `ID ${e.templateId}`, fmtDate(e.modifiedDate)]); }
        else { tplMissing++; addDrillRow('ct_tpl_missing', [e.id, e.name, e.templateName || `ID ${e.templateId}`, fmtDate(e.modifiedDate)]); }
    });
    if (tplMissing > 0) callouts.push(buildCallout('warning', 'Emails con plantilla inexistente',
        `${tplMissing} email(s) usan una plantilla que ya no existe en Content Builder.`));

    // ── 4. Bloques sin uso por tipo ───────────────────────────────────────
    const blockLikeIds = [...BLOCK_IDS, SNIPPET_ID];
    const unusedByType = {}; // typeName -> {unused, total}
    contents.forEach(c => {
        if (!blockLikeIds.includes(c.assetTypeId)) return;
        const t = c.assetTypeName || 'Otros';
        if (!unusedByType[t]) unusedByType[t] = { unused: 0, total: 0 };
        unusedByType[t].total++;
        if (unusedIds.has(c.id)) {
            unusedByType[t].unused++;
            const key = `ct_unused_${t.replace(/[^a-z0-9]/gi, '')}`;
            registerDrill(key, `Sin uso: ${t}`, ['ID', 'Nombre', 'Tipo', 'Modificado']);
            addDrillRow(key, [c.id, c.name, t, fmtDate(c.modifiedDate)]);
        }
    });
    const unusedBlocksTotal = Object.values(unusedByType).reduce((s, x) => s + x.unused, 0);
    const unusedBlockBars = Object.entries(unusedByType)
        .filter(([, v]) => v.unused > 0)
        .sort((a, b) => b[1].unused - a[1].unused)
        .map(([label, v]) => ({ label, value: v.unused, total: v.total, color: '#e74c3c', drillKey: `ct_unused_${label.replace(/[^a-z0-9]/gi, '')}` }));

    // ── 5. Plantillas WhatsApp sin uso ────────────────────────────────────
    const usedWaTemplateRefs = new Set();
    whatsapps.forEach(w => { if (w.waTemplateRefId) usedWaTemplateRefs.add(String(w.waTemplateRefId)); });
    registerDrill('ct_wa_tpl_unused', 'Plantillas WhatsApp sin uso', ['ID', 'Nombre', 'Template', 'Categoría', 'Modificado']);
    let waTplUnused = 0;
    waTemplates.forEach(t => {
        if (!usedWaTemplateRefs.has(String(t.id))) {
            waTplUnused++;
            addDrillRow('ct_wa_tpl_unused', [t.id, t.name, t.waTemplateName || '---', t.waCategory || '---', fmtDate(t.modifiedDate)]);
        }
    });

    // ── 6. WhatsApp: componentes usados ───────────────────────────────────
    const waComponentCounts = {};
    const waWithComponents = [...whatsapps, ...waTemplates];
    waWithComponents.forEach(w => {
        const raw = w.waComponents;
        if (!raw) return;
        String(raw).split(/[,;|]/).map(s => s.trim()).filter(Boolean).forEach(comp => {
            waComponentCounts[comp] = (waComponentCounts[comp] || 0) + 1;
            const key = `ct_wacomp_${comp.replace(/[^a-z0-9]/gi, '')}`;
            registerDrill(key, `WhatsApp con componente: ${comp}`, ['ID', 'Nombre', 'Template', 'Componentes']);
            addDrillRow(key, [w.id, w.name, w.waTemplateName || '---', raw]);
        });
    });
    const waComponentBars = Object.entries(waComponentCounts)
        .sort((a, b) => b[1] - a[1])
        .map(([label, value]) => ({ label, value, total: waWithComponents.length, drillKey: `ct_wacomp_${label.replace(/[^a-z0-9]/gi, '')}` }));

    // ── 7. Comunicaciones en Journeys (por canal) ─────────────────────────
    // Mismo criterio que la vista de Contenidos: email en journey si coincide su legacyId con un
    // triggeredSend.emailId, si su id de asset aparece como assetId, o si su id coincide con un
    // triggeredSend.emailId (journeys que referencian el email por su id moderno, no el legacy).
    const isEmailInJourney = (e) =>
        (e.legacyId != null && emailLegacy.has(String(e.legacyId))) ||
        assetIds.has(String(e.id)) ||
        emailLegacy.has(String(e.id));
    const isMsgInJourney = (m) => assetIds.has(String(m.id));
    const channels = [
        { id: 'emails', label: 'Emails', items: emails, test: isEmailInJourney },
        { id: 'push', label: 'Push', items: push, test: isMsgInJourney },
        { id: 'sms', label: 'SMS', items: sms, test: isMsgInJourney },
        { id: 'wa', label: 'WhatsApp', items: whatsapps, test: isMsgInJourney },
    ];
    const journeyBars = [];
    let commsInJourney = 0, commsTotal = 0;
    channels.forEach(ch => {
        const inKey = `ct_injourney_${ch.id}`;
        const outKey = `ct_notinjourney_${ch.id}`;
        registerDrill(inKey, `${ch.label} en Journeys`, ['ID', 'Nombre', 'Canal', 'Modificado']);
        registerDrill(outKey, `${ch.label} fuera de Journeys`, ['ID', 'Nombre', 'Canal', 'Modificado']);
        let used = 0;
        ch.items.forEach(it => {
            const row = [it.id, it.name, ch.label, fmtDate(it.modifiedDate)];
            if (ch.test(it)) { used++; addDrillRow(inKey, row); } else { addDrillRow(outKey, row); }
        });
        commsInJourney += used; commsTotal += ch.items.length;
        journeyBars.push({ label: `${ch.label} en journeys`, value: used, total: ch.items.length || 1, drillKey: inKey });
    });
    if (!hasJourneys) callouts.push(buildCallout('info', 'Sin caché de Journeys',
        'No hay journeys cacheados: las métricas de "en/fuera de Journeys" no son fiables. Cachéalos desde la vista de Journeys ("Descargar detalle → Todos").'));

    // ── KPIs ──────────────────────────────────────────────────────────────
    const kpis = [
        { value: contents.length, label: 'Total contenidos', color: '#69a3db', drillKey: 'ct_overview' },
        { value: emails.length, label: 'Emails', color: '#2980b9', drillKey: 'ct_cat_Emails' },
        { value: tplMissing, label: 'Plantilla inexistente', color: tplMissing > 0 ? '#e74c3c' : '#bdc3c7', drillKey: 'ct_tpl_missing' },
        { value: unusedBlocksTotal, label: 'Bloques sin uso', color: unusedBlocksTotal > 0 ? '#f39c12' : '#bdc3c7', drillKey: null },
        { value: waTplUnused, label: 'Plantillas WA sin uso', color: waTplUnused > 0 ? '#9b59b6' : '#bdc3c7', drillKey: 'ct_wa_tpl_unused' },
    ];

    // ── Tarjetas ──────────────────────────────────────────────────────────
    const cards = [
        { title: 'Contenidos por tipo', help: 'Volumetría de la caché de Contenidos por categoría.', wide: true, bars: overviewBars },
        { title: 'Emails por tipo', help: 'Template-Based, HTML y Text-only.', bars: emailTypeBars },
        { title: 'Emails · plantilla', help: 'De los emails que usan plantilla, cuántas siguen existiendo.', bars: [
            { label: 'Plantilla existente', value: tplOk, total: tplOk + tplMissing, color: '#27ae60', drillKey: 'ct_tpl_ok' },
            { label: 'Plantilla inexistente', value: tplMissing, total: tplOk + tplMissing, color: '#e74c3c', drillKey: 'ct_tpl_missing' },
        ]},
        { title: 'Bloques sin uso por tipo', help: 'Bloques y snippets no referenciados por ningún contenido.', bars: unusedBlockBars },
        { title: 'Comunicaciones en Journeys', help: 'Emails/Push/SMS/WhatsApp referenciados en journeys cacheados.', bars: journeyBars },
        { title: 'WhatsApp · componentes', help: 'Tipos de componentes usados en mensajes y plantillas de WhatsApp.', bars: waComponentBars },
    ];

    registerPdfData('content', kpis, cards, callouts.map(c => parsePdfCallout(c)));
    tabEl.innerHTML = buildTabWrapper(
        buildKpiRow(kpis) + callouts.join('') + buildGrid(cards.map(c => buildMetricCard(c.title, c.help, c.bars, { wide: c.wide })))
    );
}
