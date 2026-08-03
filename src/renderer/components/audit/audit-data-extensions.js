// Fichero: src/renderer/components/audit/audit-data-extensions.js
// Descripción: Pestaña "Data Extensions" de la auditoría. No llama a la API: analiza el JSON
// extraído desde Contact Builder (script copiable de la pantalla de opciones): descripciones,
// sendable/testable, retención, volumetría, DEs vacías/test y carpetas con muchas DEs.
// Patrón: import directo de audit-ui/audit-state (ver nota en audit-users.js).

import {
    AUDIT_PALETTE,
    buildTabWrapper, buildKpiRow, buildGrid, buildMetricCard, buildCallout, renderCallouts,
} from './audit-ui.js';
import {
    registerDrill, addDrillRow, registerPdfData,
} from './audit-state.js';

/**
 * Ejecuta la auditoría de Data Extensions y pinta la pestaña.
 * @param {string} jsonText - JSON (array de DEs) pegado por el usuario desde Contact Builder.
 */
export async function auditDataExtensions(jsonText) {
    const container = document.getElementById('audit-tab-de');

    if (!jsonText) {
        container.innerHTML = buildTabWrapper(
            buildCallout({ type: 'info', title: 'Sin datos de Data Extensions',
                message: 'Para auditar las Data Extensions, pega el JSON obtenido desde Contact Builder en el campo de la pantalla de configuración y vuelve a lanzar el escaneo.' })
        );
        return;
    }

    let des = [];
    try {
        des = JSON.parse(jsonText);
        if (!Array.isArray(des)) throw new Error('El JSON debe ser un array.');
    } catch (e) {
        container.innerHTML = buildTabWrapper(
            buildCallout({ type: 'danger', title: 'Error al parsear el JSON',
                message: 'Revisa que el texto pegado sea un JSON válido.' })
        );
        return;
    }

    // Excluir DEs compartidas (shared) — no tienen folderPath propio o están en /Shared
    const ownDes = des.filter(d => !d.folderPath?.toLowerCase().includes('shared'));
    const total  = ownDes.length;

    // Métricas
    let noDescCount   = 0;
    let sendableCount = 0, testableCount = 0;
    let retentionCount = 0;
    let over1MCount   = 0;
    let emptyCount    = 0;
    let testNameCount = 0; // DEs con "test" o "prueba" en el nombre
    let totalFields   = 0;

    const retentionTypes   = {};
    const folderCounts     = {};
    const noDescByUser     = {};
    const fieldBuckets     = { '1-10': 0, '11-25': 0, '26-50': 0, '51+': 0 };

    registerDrill('de_total',        'Total Data Extensions',              ['Nombre', 'Key', 'Carpeta', 'Filas', 'Campos', 'Sendable', 'Testable', 'Descripción', 'Creado por']);
    registerDrill('de_no_desc',      'Sin Descripción',                    ['Nombre', 'Key', 'Carpeta', 'Creado por', 'Modificado por']);
    registerDrill('de_sendable',     'Sendable',                           ['Nombre', 'Key', 'Carpeta', 'Filas']);
    registerDrill('de_testable',     'Testable',                           ['Nombre', 'Key', 'Carpeta', 'Filas']);
    registerDrill('de_retention',    'Con Data Retention',                 ['Nombre', 'Key', 'Política de Retención', 'Borrar al final', 'Reset en Import']);
    registerDrill('de_no_retention', 'Sin Data Retention',                 ['Nombre', 'Key', 'Carpeta', 'Filas', 'Creado por']);
    registerDrill('de_over1m',       'Con más de 1M de registros',         ['Nombre', 'Key', 'Carpeta', 'Filas']);
    registerDrill('de_empty',        'DEs sin registros (vacías)',          ['Nombre', 'Key', 'Carpeta', 'Creado por']);
    registerDrill('de_test_name',    'DEs con nombre de prueba/test',       ['Nombre', 'Key', 'Carpeta', 'Filas', 'Creado por']);
    registerDrill('de_no_desc_users','Sin descripción — por propietario',  ['Nombre', 'Key', 'Carpeta']);

    ownDes.forEach(d => {
        const folder     = d.folderPath || 'Sin carpeta';
        const rows       = d.rowCount   || 0;
        const fields     = d.fieldCount || 0;
        const hasDesc    = !!(d.description?.trim());
        const createdBy  = d.createdByName  || 'Sin propietario';
        const modifiedBy = d.modifiedByName || 'Sin propietario';

        addDrillRow('de_total', [d.name, d.key, folder, rows, fields, d.isSendable?'Sí':'No', d.isTestable?'Sí':'No', d.description||'---', createdBy]);

        folderCounts[folder] = (folderCounts[folder] || 0) + 1;
        totalFields += fields;

        if (!hasDesc) {
            noDescCount++;
            addDrillRow('de_no_desc', [d.name, d.key, folder, createdBy, modifiedBy]);
            if (!noDescByUser[createdBy]) noDescByUser[createdBy] = [];
            noDescByUser[createdBy].push([d.name, d.key, folder]);
        }

        if (d.isSendable) { sendableCount++; addDrillRow('de_sendable', [d.name, d.key, folder, rows]); }
        if (d.isTestable) { testableCount++; addDrillRow('de_testable', [d.name, d.key, folder, rows]); }

        if (rows > 1000000) { over1MCount++; addDrillRow('de_over1m', [d.name, d.key, folder, rows.toLocaleString('es-ES')]); }
        if (rows === 0) { emptyCount++; addDrillRow('de_empty', [d.name, d.key, folder, createdBy]); }

        // DEs con nombre de prueba/test (case-insensitive, cualquier posición)
        const TEST_PATTERNS = /test|prueba/i;
        if (TEST_PATTERNS.test(d.name)) {
            testNameCount++;
            addDrillRow('de_test_name', [d.name, d.key, folder, rows, createdBy]);
        }

        // Data Retention
        const ret = d.dataRetentionProperties;
        if (ret) {
            const hasRetention = ret.isDeleteAtEndOfRetentionPeriod || ret.isRowBasedRetention || (ret.dataRetentionPeriodLength > 0) || !!ret.retainUntil;
            if (hasRetention) {
                retentionCount++;
                const UNIT_MAP = { 3: 'days', 4: 'weeks', 5: 'months', 6: 'years' };
                let retType;
                if (ret.dataRetentionPeriodLength > 0 && ret.dataRetentionPeriodUnitOfMeasure) {
                    const scope = ret.isRowBasedRetention ? 'Delete_Individual_Records' : 'Delete_All_Records';
                    const unit = UNIT_MAP[ret.dataRetentionPeriodUnitOfMeasure] || 'unknown';
                    retType = `${scope}_After_${ret.dataRetentionPeriodLength}_${unit}`;
                } else if (ret.retainUntil) {
                    const scope = ret.isRowBasedRetention ? 'Individual' : 'All';
                    retType = `Retain_Until_Date_(${scope})`;
                } else {
                    retType = ret.isRowBasedRetention ? 'Row_Based_(sin período)' : 'All_Records_(sin período)';
                }
                retentionTypes[retType] = (retentionTypes[retType] || 0) + 1;
                // Drill por tipo específico de retención (registerDrill ya es idempotente)
                const retDrillKey = `de_ret_${retType.replace(/[^a-z0-9]/gi, '')}`;
                registerDrill(retDrillKey, retType, ['Nombre', 'Key', 'Carpeta', 'Filas', 'Borrar al final', 'Reset en Import']);
                addDrillRow(retDrillKey, [d.name, d.key, folder, rows, ret.isDeleteAtEndOfRetentionPeriod?'Sí':'No', ret.isResetRetentionPeriodOnImport?'Sí':'No']);
                addDrillRow('de_retention', [d.name, d.key, retType, ret.isDeleteAtEndOfRetentionPeriod?'Sí':'No', ret.isResetRetentionPeriodOnImport?'Sí':'No']);
            } else {
                addDrillRow('de_no_retention', [d.name, d.key, folder, rows, createdBy]);
            }
        }

        // Buckets de campos
        if      (fields <= 10) fieldBuckets['1-10']++;
        else if (fields <= 25) fieldBuckets['11-25']++;
        else if (fields <= 50) fieldBuckets['26-50']++;
        else                   fieldBuckets['51+']++;
    });

    // Carpetas con más de 15 DEs
    const bigFolders = Object.entries(folderCounts)
        .filter(([, n]) => n > 15)
        .sort((a, b) => b[1] - a[1]);

    registerDrill('de_big_folders', 'Carpetas con más de 15 DEs', ['Carpeta', 'Nº DEs']);
    bigFolders.forEach(([folder, n]) => {
        addDrillRow('de_big_folders', [folder, n]);
        // Generar key y título dinámicos
        const dKeyF = `de_folder_${folder.replace(/[^a-z0-9]/gi, '')}`;
        registerDrill(dKeyF, `DEs en: ${folder}`, ['Nombre', 'Key', 'Filas', 'Campos', 'Descripción']);
        ownDes.filter(d => (d.folderPath || 'Sin carpeta') === folder)
              .forEach(d => addDrillRow(dKeyF, [d.name, d.key, d.rowCount||0, d.fieldCount||0, d.description||'---']));
    });

    // Drills por propietario sin descripción
    Object.entries(noDescByUser).forEach(([owner, items]) => {
        // Generar key y título dinámicos
        const dKey = `de_no_desc_${owner.replace(/[^a-z0-9]/gi, '')}`;
        registerDrill(dKey, `Sin descripción — ${owner}`, ['Nombre', 'Key', 'Carpeta']);
        items.forEach(row => addDrillRow(dKey, row));
    });

    const noDescPct   = total > 0 ? Math.round((noDescCount / total) * 100) : 0;
    const avgFields   = total > 0 ? Math.round(totalFields / total) : 0;

    const callouts = [];
    if (noDescPct > 50) callouts.push({ type: 'warning', title: 'Mayoría de DEs sin descripción',
        message: `El ${noDescPct}% de las Data Extensions no tienen descripción. Dificulta el mantenimiento y la búsqueda.` });
    if (over1MCount > 0) callouts.push({ type: 'info', title: `${over1MCount} DEs superan 1M de registros`,
        message: 'Revisar si tienen política de retención activa y si el volumen está justificado por el caso de uso.' });
    if (bigFolders.length > 0) callouts.push({ type: 'info', title: 'Carpetas con gran volumen de DEs',
        message: `${bigFolders.length} carpeta(s) tienen más de 15 Data Extensions. Valorar si la estructura de carpetas es la adecuada.` });

    // Asignar el valor del drillKey dinámico para la tabla
    const noDescUserBars = Object.entries(noDescByUser)
        .sort((a, b) => b[1].length - a[1].length)
        .map(([owner, items]) => ({ label: owner, value: items.length, total: noDescCount || 1, drillKey: `de_no_desc_${owner.replace(/[^a-z0-9]/gi, '')}` }));

    // Asignar el valor del drillKey dinámico para las carpetas
    const bigFolderBars = bigFolders.map(([folder, n]) => ({
        label: folder, value: n, total: total,
        drillKey: `de_folder_${folder.replace(/[^a-z0-9]/gi, '')}`
    }));

    const kpis = [
        { value: total,          label: 'Total DEs (propias)', color: AUDIT_PALETTE.blue,   drillKey: 'de_total' },
        { value: noDescCount,    label: 'Sin descripción',     color: noDescPct > 50 ? AUDIT_PALETTE.red : AUDIT_PALETTE.orange, drillKey: 'de_no_desc' },
        { value: sendableCount,  label: 'Sendable',            color: AUDIT_PALETTE.green,  drillKey: 'de_sendable' },
        { value: testableCount,  label: 'Testable',            color: AUDIT_PALETTE.teal,   drillKey: 'de_testable' },
        { value: retentionCount, label: 'Con Retención',       color: AUDIT_PALETTE.purple, drillKey: 'de_retention' },
        { value: over1MCount,    label: '>1M registros',       color: over1MCount > 0 ? AUDIT_PALETTE.red : AUDIT_PALETTE.gray, drillKey: 'de_over1m' },
        { value: emptyCount,     label: 'Sin registros',       color: emptyCount > total * 0.3 ? AUDIT_PALETTE.orange : AUDIT_PALETTE.gray, drillKey: 'de_empty' },
        { value: testNameCount,  label: 'Nombre de prueba',    color: testNameCount > 0 ? AUDIT_PALETTE.orange : AUDIT_PALETTE.gray, drillKey: 'de_test_name' },
    ];

    const cards = [
        { title: 'Descripción', help: 'Presencia de descripción en las Data Extensions propias.', bars: [
            { label: 'Con descripción', value: total - noDescCount, total, color: AUDIT_PALETTE.green, drillKey: 'de_total' },
            { label: 'Sin descripción', value: noDescCount,         total, color: AUDIT_PALETTE.red,   drillKey: 'de_no_desc' },
        ]},
        { title: 'Sin descripción — por propietario', help: 'Usuarios que más DEs sin documentar han creado.', bars: noDescUserBars.length > 0 ? noDescUserBars : [{ label: 'Todas documentadas', value: 0, total: 1, color: AUDIT_PALETTE.green }] },
        { title: 'Sendable y Testable', help: 'DEs configuradas para envío o pruebas.', bars: [
            { label: 'Sendable', value: sendableCount, total, color: AUDIT_PALETTE.green, drillKey: 'de_sendable' },
            { label: 'Testable', value: testableCount, total, color: AUDIT_PALETTE.teal,  drillKey: 'de_testable' },
        ]},
        { title: 'Data Retention', help: 'DEs con política de retención de datos activa. Desglose por tipo de política.', bars: [
            { label: 'Con retención',   value: retentionCount,         total, color: AUDIT_PALETTE.purple, drillKey: 'de_retention' },
            { label: 'Sin retención',   value: total - retentionCount, total, color: AUDIT_PALETTE.gray,   drillKey: 'de_no_retention' },
            ...Object.entries(retentionTypes).sort((a, b) => b[1] - a[1]).map(([label, value]) => ({
                label, value, total: retentionCount || 1,
                // Borrado individual → naranja (aviso), borrado total → morado, resto → azul
                color: label.startsWith('Delete_Individual') ? AUDIT_PALETTE.orange
                    : label.startsWith('Delete_All') ? AUDIT_PALETTE.purple
                    : AUDIT_PALETTE.blue,
                drillKey: `de_ret_${label.replace(/[^a-z0-9]/gi, '')}`,
            })),
        ]},
        { title: 'DEs sin registros (vacías)', help: 'Data Extensions que actualmente no tienen ningún registro. Pueden ser de uso esporádico o candidatas a revisión.', bars: [
            { label: 'Con registros',    value: total - emptyCount, total, color: AUDIT_PALETTE.green },
            { label: 'Sin registros',    value: emptyCount,         total, color: AUDIT_PALETTE.orange, drillKey: 'de_empty' },
        ]},
        { title: 'DEs con nombre de prueba/test', help: 'DEs que contienen "test" o "prueba" en el nombre (sin distinción de mayúsculas). Candidatas a revisión o limpieza.', bars: [
            { label: 'Nombre normal',       value: total - testNameCount, total, color: AUDIT_PALETTE.green },
            { label: 'Contiene test/prueba',value: testNameCount,         total, color: AUDIT_PALETTE.orange, drillKey: 'de_test_name' },
        ]},
        { title: 'Carpetas con más de 15 DEs', help: 'Carpetas que concentran muchas DEs.', wide: true, bars:
            bigFolderBars.length > 0 ? bigFolderBars : [{ label: 'Ninguna supera el umbral', value: 0, total: 1, color: AUDIT_PALETTE.green }]
        },
    ];

    registerPdfData('de', kpis, cards, callouts);
    container.innerHTML = buildTabWrapper(
        buildKpiRow(kpis) + renderCallouts(callouts) +
        buildGrid(cards.map(c => buildMetricCard(c.title, c.help, c.bars, { wide: c.wide })))
    );
}
