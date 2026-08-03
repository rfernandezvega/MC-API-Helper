// Fichero: src/renderer/components/audit/audit-cloudpages.js
// Descripción: Pestaña "Cloud Pages" de la auditoría. Analiza tipos de asset, estado de
// publicación y páginas sin URL directa.
// Patrón: import directo de audit-ui/audit-state (ver nota en audit-users.js).

import * as mcApiService from '../../api/mc-api-service.js';
import {
    AUDIT_PALETTE, formatDate,
    buildTabWrapper, buildKpiRow, buildGrid, buildMetricCard, renderCallouts,
} from './audit-ui.js';
import {
    registerDrill, addDrillRow, registerPdfData, incApiCalls,
} from './audit-state.js';

/**
 * Extrae la URL publicada de una Cloud Page probando las distintas rutas donde puede venir
 * según el tipo de asset (content JSON embebido, meta, views...).
 * @param {object} item - Asset de Cloud Page devuelto por la API.
 * @returns {string} URL o cadena vacía.
 */
function extractCloudPageUrl(item) {
    try {
        if (item.content?.trim().startsWith('{')) { const j = JSON.parse(item.content); if (j.url) return j.url; }
        if (item.data?.site?.content?.trim().startsWith('{')) { const j = JSON.parse(item.data.site.content); if (j.url) return j.url; }
    } catch (e) {}
    return item.meta?.cloudPages?.url || item.views?.publishedUrl || item.publishedUrl || item.url || '';
}

/**
 * Ejecuta la auditoría de Cloud Pages y pinta la pestaña.
 * @param {object} apiConfig - Configuración autenticada para llamar a la API de SFMC.
 */
export async function auditCloudPages(apiConfig) {
    incApiCalls();
    const pages = await mcApiService.fetchAllCloudPages(apiConfig);
    const total = pages.length;
    const types = {};
    let publishedCount = 0, noDirectUrlCount = 0;

    registerDrill('cp_total',       'Total Cloud Pages', ['Nombre', 'Tipo', 'Publicada', 'URL', 'Fecha Publicación']);
    registerDrill('cp_published',   'Publicadas',        ['Nombre', 'Tipo', 'URL', 'Fecha Publicación']);
    registerDrill('cp_unpublished', 'Sin publicar',      ['Nombre', 'Tipo']);
    registerDrill('cp_no_url',      'Sin URL Directa',   ['Nombre', 'Tipo', 'Publicada']);

    pages.forEach(p => {
        const typeName  = p.assetType?.displayName || 'Otros';
        types[typeName] = (types[typeName] || 0) + 1;
        const dKeyType  = `cp_type_${typeName.replace(/[^a-z0-9]/gi, '')}`;
        registerDrill(dKeyType, `Tipo: ${typeName}`, ['Nombre', 'Publicada', 'URL', 'Fecha Publicación']);

        const pubDate     = p.meta?.cloudPages?.publishDate || p.publishedDate;
        const isPublished = !!(pubDate && !pubDate.startsWith('0001'));
        const pubDateStr  = isPublished ? formatDate(pubDate) : '---';
        if (isPublished) publishedCount++;

        const url    = extractCloudPageUrl(p);
        const hasUrl = !!(url && url.startsWith('http'));
        if (!hasUrl) noDirectUrlCount++;

        addDrillRow('cp_total',  [p.name, typeName, isPublished?'Sí':'No', url||'---', pubDateStr]);
        addDrillRow(dKeyType,    [p.name, isPublished?'Sí':'No', url||'---', pubDateStr]);
        if (isPublished) addDrillRow('cp_published',   [p.name, typeName, url||'---', pubDateStr]);
        else             addDrillRow('cp_unpublished', [p.name, typeName]);
        if (!hasUrl)     addDrillRow('cp_no_url',      [p.name, typeName, isPublished?'Publicada':'Sin publicar']);
    });

    const unpublishedCount = total - publishedCount;
    const callouts = [];
    if (noDirectUrlCount > 0) callouts.push({ type: 'info', title: 'Páginas sin enlace directo',
        message: `${noDirectUrlCount} Cloud Pages no tienen URL publicada directa. Suelen ser páginas dentro de una colección o Code Resources.` });
    if (total > 0 && unpublishedCount > total * 0.5) callouts.push({ type: 'warning', title: 'Mayoría de Cloud Pages sin publicar',
        message: `El ${Math.round((unpublishedCount/total)*100)}% no tienen fecha de publicación.` });

    const kpis = [
        { value: total,            label: 'Total Cloud Pages', color: AUDIT_PALETTE.blue,  drillKey: 'cp_total' },
        { value: publishedCount,   label: 'Publicadas',        color: AUDIT_PALETTE.green, drillKey: 'cp_published' },
        { value: unpublishedCount, label: 'Sin publicar',      color: unpublishedCount > total*0.5 ? AUDIT_PALETTE.orange : AUDIT_PALETTE.gray, drillKey: 'cp_unpublished' },
        { value: noDirectUrlCount, label: 'Sin URL directa',   color: noDirectUrlCount > 0 ? AUDIT_PALETTE.purple : AUDIT_PALETTE.gray, drillKey: 'cp_no_url' },
    ];

    const cards = [
        { title: 'Tipos de asset', help: 'Volumetría por funcionalidad: Landing Pages, Code Resources, Microsites…', bars:
            Object.entries(types).sort((a,b)=>b[1]-a[1]).map(([label,value]) => ({ label, value, total, drillKey: `cp_type_${label.replace(/[^a-z0-9]/gi,'')}` }))
        },
        { title: 'Estado de publicación', help: 'Distribución basada en la presencia de fecha de publicación.', bars: [
            { label: 'Publicadas (con fecha)', value: publishedCount,   total, color: AUDIT_PALETTE.green,  drillKey: 'cp_published' },
            { label: 'Sin publicar',           value: unpublishedCount, total, color: AUDIT_PALETTE.orange, drillKey: 'cp_unpublished' },
            { label: 'Sin URL directa',        value: noDirectUrlCount, total, color: AUDIT_PALETTE.purple, drillKey: 'cp_no_url' },
        ]},
    ];

    registerPdfData('cp', kpis, cards, callouts);
    document.getElementById('audit-tab-cp').innerHTML = buildTabWrapper(
        buildKpiRow(kpis) + renderCallouts(callouts) + buildGrid(cards.map(c => buildMetricCard(c.title, c.help, c.bars, { wide: c.wide })))
    );
}
