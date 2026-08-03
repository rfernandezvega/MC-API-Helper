// Fichero: src/renderer/components/audit/audit-automations.js
// Descripción: Pestaña "Automatismos" de la auditoría. Analiza estado, historial de ejecución,
// tipo de disparo, actividades usadas y (en modo detallado) alertas de error, descripciones de
// actividades SQL/SSJS y reutilización de actividades entre automatismos.
// Patrón: import directo de audit-ui/audit-state (ver nota en audit-users.js).

import * as mcApiService from '../../api/mc-api-service.js';
import elements from '../../ui/dom-elements.js';
import * as ui from '../../ui/ui-helpers.js';
import {
    AUDIT_PALETTE, formatDate,
    buildTabWrapper, buildKpiRow, buildGrid, buildMetricCard, buildSectionHeader,
    buildCallout, renderCallouts,
} from './audit-ui.js';
import {
    registerDrill, addDrillRow, setDrillEntry, registerPdfData, getUserLabel, incApiCalls,
} from './audit-state.js';

// Mapa de objectTypeId de SFMC a etiqueta legible de tipo de actividad.
const ACTIVITY_TYPE_MAP = {
    42:   'Email',                   43:   'Importación (Import)',
    45:   'Group',                   53:   'File Transfer',
    73:   'Data Extract / Exportación', 84: 'Report',
    300:  'SQL Query',               303:  'Filter',
    423:  'Script (SSJS)',           425:  'ELT (Data Transform)',
    427:  'Build Audience',          467:  'Wait',
    724:  'Mobile List Refresh',     725:  'MobileConnect',
    726:  'Mobile Import',           733:  'Interaction Studio',
    736:  'Mobile Push',             749:  'IS Event',
    756:  'IS Date Event',           771:  'SF Send',
    783:  'GroupConnect',            952:  'Journey Entry (Audience)',
    1000: 'Verification',            1010: 'Thunderhead',
    1101: 'IS Decision',             1701: 'Einstein Rec',
};

/**
 * Ejecuta la auditoría de automatismos y pinta la pestaña.
 * @param {object} apiConfig - Configuración autenticada para llamar a la API de SFMC.
 * @param {boolean} isDetailed - Si es true inspecciona cada automatismo individualmente
 *                               (alertas, descripciones de actividades, reutilización).
 */
export async function auditAutomations(apiConfig, isDetailed) {
    incApiCalls();
    let autos = await mcApiService.fetchAllAutomations(apiConfig);
    const rawTotalAutos = autos.length;

    let mid = elements.activeMidInput?.value?.trim();
    if (mid) autos = autos.filter(a => !a.name.startsWith(mid));

    const ignoredSystemAutos = rawTotalAutos - autos.length;
    const totalAutos  = autos.length;
    const currentYear = new Date().getFullYear();

    const status = {};
    const execByYear = {};
    for (let y = currentYear; y >= currentYear - 3; y--) {
        execByYear[String(y)] = 0;
        registerDrill(`auto_exec_year_${y}`, `Ejecutados en el año ${y}`,
            ['Nombre', 'Estado', 'Tipo Ejecución', 'Última Ejecución', 'Descripción', 'Propietario']);
    }
    execByYear['Más antiguos'] = 0; execByYear['Sin historial'] = 0;
    registerDrill('auto_exec_year_old', 'Ejecutados en años anteriores',
        ['Nombre', 'Estado', 'Tipo Ejecución', 'Última Ejecución']);

    const autoDescriptions = { 'Con descripción': 0, 'Sin descripción': 0 };
    let testNameCount = 0;
    const activityTypeCounts = {};
    let journeyLaunchingCount = 0, importCountAll = 0, exportCountAll = 0;
    const execTypeCounts = {
        'Programado (Schedule)': 0, 'Por evento (Fire Trigger)': 0,
        'FileDrop': 0,             'Manual / Sin clasificar': 0,
    };
    const actTypeDrill     = {};
    const autoNoDescByUser = {}; // { ownerLabel: [{ name, status, execType }] }

    registerDrill('auto_total',          'Total Automatismos',             ['Nombre', 'Estado', 'Tipo Ejecución', 'Última Ejecución', 'Creado', 'Descripción', 'Propietario']);
    registerDrill('auto_active',         'Activos / Programados',          ['Nombre', 'Estado', 'Tipo Ejecución', 'Última Ejecución']);
    registerDrill('auto_stale',          'Sin Historial de Ejecución',     ['Nombre', 'Estado', 'Tipo Ejecución', 'Creado', 'Descripción', 'Propietario']);
    registerDrill('auto_launch_journey', 'Lanzan Journeys',                ['Nombre', 'Estado', 'Última Ejecución', 'Propietario']);
    registerDrill('auto_import',         'Con Importaciones',              ['Nombre', 'Cant. Imports', 'Estado', 'Propietario']);
    registerDrill('auto_export',         'Con Exportaciones',              ['Nombre', 'Cant. Exports', 'Estado', 'Propietario']);
    registerDrill('auto_desc_yes',       'Con Descripción',                ['Nombre', 'Estado', 'Descripción']);
    registerDrill('auto_desc_no',        'Sin Descripción',                ['Nombre', 'Estado', 'Tipo Ejecución', 'Propietario']);
    registerDrill('auto_test_name', 'Automatismos con nombre de prueba/test', ['Nombre', 'Estado', 'Tipo Ejecución', 'Propietario']);

    autos.forEach(a => {
        const ownerLabel  = getUserLabel(a.createdBy || a.modifiedBy || a.ownerId);
        const execTypeId  = a.scheduleTypeId ?? a.schedule?.typeId ?? null;
        let execType = 'Manual / Sin clasificar';
        if      (execTypeId === 1 || (!execTypeId && a.scheduledTime)) execType = 'Programado (Schedule)';
        else if (execTypeId === 3 || a.fileTrigger)                    execType = 'FileDrop';
        else if (execTypeId === 2 || a.isTriggered)                    execType = 'Por evento (Fire Trigger)';

        const lastRun = formatDate(a.lastRunTime);
        const created = formatDate(a.createdDate);
        const desc    = a.description?.trim() || '';

        status[a.status] = (status[a.status] || 0) + 1;
        const dKeyStatus = `auto_status_${a.status}`;
        registerDrill(dKeyStatus, `Estado: ${a.status}`, ['Nombre', 'Tipo Ejecución', 'Última Ejecución', 'Propietario']);
        addDrillRow(dKeyStatus, [a.name, execType, lastRun, ownerLabel]);
        addDrillRow('auto_total', [a.name, a.status, execType, lastRun, created, desc || '---', ownerLabel]);

        if (!a.lastRunTime || a.lastRunTime.startsWith('0001')) {
            execByYear['Sin historial']++;
            addDrillRow('auto_stale', [a.name, a.status, execType, created, desc || '---', ownerLabel]);
        } else {
            const yearKey = String(new Date(a.lastRunTime).getFullYear());
            if (execByYear.hasOwnProperty(yearKey)) {
                execByYear[yearKey]++;
                addDrillRow(`auto_exec_year_${yearKey}`, [a.name, a.status, execType, lastRun, desc || '---', ownerLabel]);
            } else {
                execByYear['Más antiguos']++;
                addDrillRow('auto_exec_year_old', [a.name, a.status, execType, lastRun]);
            }
        }

        if (['Scheduled', 'Ready', 'Running'].includes(a.status))
            addDrillRow('auto_active', [a.name, a.status, execType, lastRun]);

        if (desc) { autoDescriptions['Con descripción']++; addDrillRow('auto_desc_yes', [a.name, a.status, desc]); }
        else {
            autoDescriptions['Sin descripción']++;
            addDrillRow('auto_desc_no', [a.name, a.status, execType, ownerLabel]);
            if (!autoNoDescByUser[ownerLabel]) autoNoDescByUser[ownerLabel] = [];
            autoNoDescByUser[ownerLabel].push({ name: a.name, status: a.status, execType });
        }

        const TEST_PATTERNS = /test|prueba|tmp|borr/i;
        if (TEST_PATTERNS.test(a.name)) {
            testNameCount++;
            addDrillRow('auto_test_name', [a.name, a.status, execType, ownerLabel]);
        }

        let launchesJourney = false, importAutoCount = 0, exportAutoCount = 0;
        (a.processes || []).forEach(proc => {
            (proc.workerCounts || []).forEach(wc => {
                const typeLabel = ACTIVITY_TYPE_MAP[wc.objectTypeId] || `Tipo desconocido (${wc.objectTypeId})`;
                const n = wc.count || 1;
                activityTypeCounts[typeLabel] = (activityTypeCounts[typeLabel] || 0) + n;
                if (!actTypeDrill[typeLabel]) actTypeDrill[typeLabel] = [];
                actTypeDrill[typeLabel].push([a.name, n, a.status, ownerLabel]);
                if (wc.objectTypeId === 952) launchesJourney = true;
                if (wc.objectTypeId === 43)  { importCountAll += n; importAutoCount += n; }
                if (wc.objectTypeId === 73)  { exportCountAll += n; exportAutoCount += n; }
            });
        });

        if (launchesJourney) addDrillRow('auto_launch_journey', [a.name, a.status, lastRun, ownerLabel]);
        if (importAutoCount > 0) addDrillRow('auto_import', [a.name, importAutoCount, a.status, ownerLabel]);
        if (exportAutoCount > 0) addDrillRow('auto_export', [a.name, exportAutoCount, a.status, ownerLabel]);

        execTypeCounts[execType]++;
        const execKey = `auto_exec_${execType.replace(/[^a-z0-9]/gi, '')}`;
        registerDrill(execKey, `Ejecución: ${execType}`, ['Nombre', 'Estado', 'Propietario']);
        addDrillRow(execKey, [a.name, a.status, ownerLabel]);
    });

    const totalActivityInstances = Object.values(activityTypeCounts).reduce((s, v) => s + v, 0) || 1;
    const actTypeBars = Object.entries(activityTypeCounts).sort((a, b) => b[1] - a[1]).map(([label, value]) => {
        const dKey = `auto_act_${label.replace(/[^a-z0-9]/gi, '')}`;
        if (!isDetailed) {
            registerDrill(dKey, `Actividades: ${label}`, ['Automatismo Padre', 'Cantidad', 'Estado', 'Propietario']);
            (actTypeDrill[label] || []).forEach(row => addDrillRow(dKey, row));
        }
        return { label, value, total: totalActivityInstances, drillKey: dKey };
    });

    const execBars = Object.keys(execByYear)
        .sort((a, b) => {
            if (a === 'Sin historial') return 1; if (b === 'Sin historial') return -1;
            if (a === 'Más antiguos')  return 1; if (b === 'Más antiguos')  return -1;
            return parseInt(b) - parseInt(a);
        })
        .map(label => {
            const value = execByYear[label];
            // Degradado semántico: año actual verde, año anterior azul, antiguos naranja, sin historial rojo
            const color = label === String(currentYear)   ? AUDIT_PALETTE.green
                : label === String(currentYear - 1)       ? AUDIT_PALETTE.blueDark
                : label === String(currentYear - 2)       ? AUDIT_PALETTE.orange
                : label === String(currentYear - 3)       ? AUDIT_PALETTE.orange
                : label === 'Sin historial'               ? AUDIT_PALETTE.red
                : AUDIT_PALETTE.gray;
            const dKey = label === 'Sin historial' ? 'auto_stale'
                : label === 'Más antiguos'          ? 'auto_exec_year_old'
                : `auto_exec_year_${label}`;
            return { label: label === 'Sin historial' ? 'Sin historial de ejecución' : `Ejecutados en ${label}`, value, total: totalAutos, color, drillKey: dKey };
        });

    // "Distribución por estado" se eliminó del dashboard: era el estado puntual en el
    // momento de la auditoría y no aportaba; el historial ocupa ahora las 2 columnas.
    const baseCards = [
        { title: 'Historial de ejecución', help: 'Último año de ejecución registrado.', bars: execBars, wide: true },
        { title: 'Tipo de ejecución', help: 'Cómo se dispara cada automatismo: calendario (Schedule), llamada API (Fire Trigger), llegada de fichero (FileDrop) o sin tipo identificado.', bars:
            Object.entries(execTypeCounts).filter(([, v]) => v > 0).map(([label, value]) => {
                const color = label.includes('Schedule') ? AUDIT_PALETTE.green
                    : label.includes('Fire') ? AUDIT_PALETTE.purple
                    : label.includes('File') ? AUDIT_PALETTE.teal
                    : AUDIT_PALETTE.gray;
                return { label, value, total: totalAutos, color, drillKey: `auto_exec_${label.replace(/[^a-z0-9]/gi, '')}` };
            })
        },
        { title: 'Automatismos con nombre de prueba/test', help: 'Automatismos que contienen "test", "prueba", "tmp" o "borr" en el nombre. Candidatos a revisión o limpieza.', bars: [
            { label: 'Nombre normal', value: totalAutos - testNameCount, total: totalAutos, color: AUDIT_PALETTE.green },
            { label: 'Contiene test/prueba', value: testNameCount, total: totalAutos, color: AUDIT_PALETTE.orange, drillKey: 'auto_test_name' },
        ]},
        { title: 'Tipos de actividad más usados', help: 'Qué actividades son las más utilizadas en los automatismos.', bars: actTypeBars, wide: true },
    ];

    // --- ANÁLISIS DETALLADO ---
    let detailedCards    = [];
    let detailedCallouts = [];
    let detailedHtml     = '';

    if (isDetailed) {
        const notifications   = { 'Con email de alerta': 0, 'Sin email de alerta': 0 };
        const actDescriptions = { 'Con descripción': 0, 'Sin descripción': 0 };
        const sharedMap       = { 'Exclusivas (solo 1 auto)': 0, 'Compartidas (varios autos)': 0 };
        const actOccurrences  = {};
        const alertEmailsData = {};
        const detailedActTypeDrill = {};
        let totalActivitiesFound = 0;

        registerDrill('auto_alert_yes',    'Con email de alerta por error',   ['Automatismo', 'Estado', 'Emails de Aviso']);
        registerDrill('auto_alert_no',     'Sin email de alerta por error',   ['Automatismo', 'Estado', 'Motivo']);
        registerDrill('auto_act_desc_yes', 'Actividades documentadas',         ['Actividad', 'Tipo', 'Automatismo Padre', 'Descripción', 'Propietario Auto']);
        registerDrill('auto_act_desc_no',  'Actividades SIN documentar',       ['Actividad', 'Tipo', 'Automatismo Padre', 'Propietario Auto']);
        registerDrill('auto_act_exclusive','Actividades Exclusivas (1 auto)', ['Actividad', 'Tipo', 'Automatismo Padre']);
        registerDrill('auto_act_shared',   'Actividades Compartidas',         ['Actividad', 'Tipo', 'Nº Autos', 'Automatismos']);

        for (let i = 0; i < autos.length; i++) {
            const auto      = autos[i];
            const autoOwner = getUserLabel(auto.createdBy || auto.modifiedBy || auto.ownerId);
            ui.blockUI(`2/5: Analizando ${auto.name} (${i + 1}/${autos.length})…`);
            try {
                incApiCalls(2);
                const [detail, notifs] = await Promise.all([
                    mcApiService.fetchAutomationDetailsById(auto.id, apiConfig),
                    mcApiService.fetchAutomationNotifications(auto.id, apiConfig),
                ]);

                const errorWorkers = notifs?.workers?.filter(w => w.notificationType === 'Error') || [];
                if (errorWorkers.length > 0) {
                    let hasValidEmail = false;
                    const emailsInAuto = [];
                    const uniqueEmails = new Set();
                    errorWorkers.forEach(w => {
                        const raw = w.definition || w.email || w.toAddress || w.emailAddress || '';
                        if (raw.trim()) { hasValidEmail = true; emailsInAuto.push(raw.trim()); }
                        raw.split(',').forEach(part => { const a = part.trim().toLowerCase(); if (a.includes('@')) uniqueEmails.add(a); });
                    });
                    if (hasValidEmail) {
                        notifications['Con email de alerta']++;
                        addDrillRow('auto_alert_yes', [auto.name, auto.status, emailsInAuto.join(', ')]);
                    } else {
                        notifications['Sin email de alerta']++;
                        addDrillRow('auto_alert_no', [auto.name, auto.status, 'Configurado pero sin email válido']);
                    }
                    uniqueEmails.forEach(email => {
                        if (!alertEmailsData[email]) alertEmailsData[email] = { count: 0, usages: [] };
                        alertEmailsData[email].count++;
                        alertEmailsData[email].usages.push(auto.name);
                    });
                } else {
                    notifications['Sin email de alerta']++;
                    addDrillRow('auto_alert_no', [auto.name, auto.status, 'No hay alertas de error activadas']);
                }

                for (const step of (detail.steps || [])) {
                    for (const act of (step.activities || [])) {
                        const typeName = ACTIVITY_TYPE_MAP[act.objectTypeId] || String(act.objectTypeId);
                        const actName  = act.name || 'Sin nombre';

                        // Registrar para el mapa de tipo de actividad (todos los tipos)
                        if (!detailedActTypeDrill[typeName]) detailedActTypeDrill[typeName] = [];
                        detailedActTypeDrill[typeName].push([actName, auto.name, autoOwner]);

                        // Registrar para reutilización de actividades (todos los tipos)
                        const actId = act.activityObjectId || act.id;
                        if (actId) {
                            if (!actOccurrences[actId]) actOccurrences[actId] = { count: 0, name: actName, type: typeName, usages: [] };
                            actOccurrences[actId].count++;
                            actOccurrences[actId].usages.push(auto.name);
                        }

                        // Verificación de descripción: SOLO para SQL (300) y SSJS (423).
                        // Las actividades del payload de steps no incluyen campo description;
                        // para otros tipos no hay forma de obtenerla sin llamadas adicionales.
                        if (act.objectTypeId !== 300 && act.objectTypeId !== 423) continue;

                        totalActivitiesFound++;
                        let hasDesc  = false;
                        let descText = '';

                        if (act.activityObjectId) {
                            try {
                                if (act.objectTypeId === 300) {
                                    incApiCalls();
                                    const q = await mcApiService.fetchQueryDefinitionDetails(act.activityObjectId, apiConfig);
                                    if (q?.description?.trim()) { hasDesc = true; descText = q.description; }
                                } else {
                                    incApiCalls();
                                    const s = await mcApiService.fetchScriptDetails(act.activityObjectId, apiConfig);
                                    if (s?.description?.trim()) { hasDesc = true; descText = s.description; }
                                }
                            } catch (e) {}
                        }

                        if (hasDesc) {
                            actDescriptions['Con descripción']++;
                            addDrillRow('auto_act_desc_yes', [actName, typeName, auto.name, descText, autoOwner]);
                        } else {
                            actDescriptions['Sin descripción']++;
                            addDrillRow('auto_act_desc_no', [actName, typeName, auto.name, autoOwner]);
                        }
                    }
                }
            } catch (e) {
                notifications['Sin email de alerta']++;
                addDrillRow('auto_alert_no', [auto.name, auto.status, 'Error al obtener detalles de la API']);
            }
        }

        // Drill de tipo detallado (sobrescribe el masivo con datos más ricos)
        Object.keys(detailedActTypeDrill).forEach(label => {
            const dKey = `auto_act_${label.replace(/[^a-z0-9]/gi, '')}`;
            setDrillEntry(dKey, { title: `Actividades: ${label}`, columns: ['Nombre Actividad', 'Automatismo Padre', 'Propietario'], rows: detailedActTypeDrill[label] });
        });

        // Actividades compartidas
        Object.values(actOccurrences).forEach(obj => {
            if (obj.count === 1) { sharedMap['Exclusivas (solo 1 auto)']++; addDrillRow('auto_act_exclusive', [obj.name, obj.type, obj.usages[0]]); }
            else                 { sharedMap['Compartidas (varios autos)']++; addDrillRow('auto_act_shared', [obj.name, obj.type, obj.count, obj.usages.join(', ')]); }
        });

        // Drill por email de alerta (no entra en export masivo por diseño)
        Object.keys(alertEmailsData).forEach(email => {
            const dKey = `auto_email_${email.replace(/[^a-z0-9]/gi, '')}`;
            registerDrill(dKey, `Alertas a: ${email}`, ['Automatismo']);
            alertEmailsData[email].usages.forEach(n => addDrillRow(dKey, [n]));
        });

        // Drills de responsable — un drill por usuario para ver el listado al hacer clic
        Object.entries(autoNoDescByUser).forEach(([owner, items]) => {
            const dKey = `auto_noDesc_user_${owner.replace(/[^a-z0-9]/gi, '')}`;
            registerDrill(dKey, `Sin descripción (autom.) — ${owner}`, ['Automatismo', 'Estado', 'Tipo Ejecución']);
            items.forEach(i => addDrillRow(dKey, [i.name, i.status, i.execType]));
        });

        const noAlertPct   = totalAutos > 0 ? Math.round((notifications['Sin email de alerta'] / totalAutos) * 100) : 0;
        const noActDescPct = totalActivitiesFound > 0 ? Math.round((actDescriptions['Sin descripción'] / totalActivitiesFound) * 100) : 0;
        const sharedTotal  = Object.keys(actOccurrences).length;

        if (noAlertPct > 30) detailedCallouts.push({ type: 'danger', title: 'Automatismos sin email de alerta',
            message: `El ${noAlertPct}% de los automatismos no avisan por email al fallar.` });
        if (noActDescPct > 60) detailedCallouts.push({ type: 'warning', title: 'Actividades sin documentar',
            message: `El ${noActDescPct}% de las actividades SQL/SSJS no tienen descripción.` });

        const alertEmailBars = Object.entries(alertEmailsData)
            .sort((a, b) => b[1].count - a[1].count)
            .map(([email, data]) => ({ label: email, value: data.count, total: notifications['Con email de alerta'] || 1, drillKey: `auto_email_${email.replace(/[^a-z0-9]/gi, '')}` }));

        const autoNoDescUserBars = Object.entries(autoNoDescByUser)
            .sort((a, b) => b[1].length - a[1].length)
            .map(([owner, items]) => ({ label: owner, value: items.length, total: autoDescriptions['Sin descripción'] || 1, drillKey: `auto_noDesc_user_${owner.replace(/[^a-z0-9]/gi, '')}` }));

        detailedCards = [
            { title: 'Email de alerta por error', help: `Base: ${totalAutos} automatismos.`, bars: [
                { label: 'Con email de alerta', value: notifications['Con email de alerta'], total: totalAutos, color: AUDIT_PALETTE.green, drillKey: 'auto_alert_yes' },
                { label: 'Sin email de alerta', value: notifications['Sin email de alerta'], total: totalAutos, color: AUDIT_PALETTE.red, drillKey: 'auto_alert_no' },
            ]},
            { title: 'Emails de alertas de error', help: 'Direcciones configuradas.', bars: alertEmailBars.length > 0 ? alertEmailBars : [{ label: 'Sin alertas configuradas', value: 0, total: 1, color: AUDIT_PALETTE.gray }] },
            { title: 'Descripción del automatismo', help: 'Campo descripción del proceso padre.', bars: [
                { label: 'Con descripción', value: autoDescriptions['Con descripción'], total: totalAutos, color: AUDIT_PALETTE.green, drillKey: 'auto_desc_yes' },
                { label: 'Sin descripción', value: autoDescriptions['Sin descripción'], total: totalAutos, color: AUDIT_PALETTE.red, drillKey: 'auto_desc_no' },
            ]},
            { title: 'Sin descripción — por propietario', help: 'Responsable del automatismo ordenado por número de procesos sin documentar.', bars: autoNoDescUserBars.length > 0 ? autoNoDescUserBars : [{ label: 'Todos documentados', value: 0, total: 1, color: AUDIT_PALETTE.green }] },
            { title: 'Descripción de actividades (SQL/SSJS)', help: `Base: ${totalActivitiesFound} SQL Queries y Scripts SSJS.`, bars: [
                { label: 'Con descripción', value: actDescriptions['Con descripción'], total: totalActivitiesFound, color: AUDIT_PALETTE.green, drillKey: 'auto_act_desc_yes' },
                { label: 'Sin descripción', value: actDescriptions['Sin descripción'], total: totalActivitiesFound, color: AUDIT_PALETTE.red, drillKey: 'auto_act_desc_no' },
            ]},
            { title: 'Reutilización de actividades', help: `Base: ${sharedTotal} actividades únicas. Identifica queries/scripts se utilizan en más de 1 automatismo.`, bars: [
                { label: 'Exclusivas (solo 1 auto)',   value: sharedMap['Exclusivas (solo 1 auto)'],   total: sharedTotal, color: AUDIT_PALETTE.green, drillKey: 'auto_act_exclusive' },
                { label: 'Compartidas (varios autos)', value: sharedMap['Compartidas (varios autos)'], total: sharedTotal, color: AUDIT_PALETTE.orange, drillKey: 'auto_act_shared' },
            ]},
        ];

        detailedHtml = renderCallouts(detailedCallouts) +
            buildSectionHeader('Análisis Detallado — Inspección Individual') +
            buildGrid(detailedCards.map(c => buildMetricCard(c.title, c.help, c.bars, { wide: c.wide })));
    } else {
        detailedHtml = buildCallout({ type: 'info', title: 'Análisis profundo no ejecutado',
            message: 'Activa la opción para obtener: alertas de error, dominios de aviso, descripciones, responsables de contenido sin documentar y reutilización de actividades.' });
    }

    const topCallouts = [];
    if (ignoredSystemAutos > 0) topCallouts.push({ type: 'info', title: 'Procesos de sistema excluidos',
        message: `Se ignoraron <b>${ignoredSystemAutos} automatismos</b> (empiezan por ${mid}).` });
    if (execByYear['Sin historial'] > totalAutos * 0.3) topCallouts.push({ type: 'warning', title: 'Automatismos sin actividad',
        message: 'Muchos automatismos nunca se han ejecutado. Revisar si son borradores o procesos obsoletos.' });

    const kpis = [
        { value: totalAutos,               label: 'Total Automatismos',  color: AUDIT_PALETTE.blue, drillKey: 'auto_total' },
        { value: autos.filter(a => ['Scheduled','Ready','Running'].includes(a.status)).length, label: 'Activos / Prog.', color: AUDIT_PALETTE.green, drillKey: 'auto_active' },
        { value: execByYear['Sin historial'], label: 'Sin historial',    color: execByYear['Sin historial'] > totalAutos * 0.3 ? AUDIT_PALETTE.red : AUDIT_PALETTE.orange, drillKey: 'auto_stale' },
        { value: journeyLaunchingCount,    label: 'Lanzan Journeys',     color: AUDIT_PALETTE.purple, drillKey: 'auto_launch_journey' },
        { value: importCountAll,           label: 'Acts. Import',        color: AUDIT_PALETTE.blue, drillKey: 'auto_import' },
        { value: exportCountAll,           label: 'Acts. Export',        color: AUDIT_PALETTE.teal, drillKey: 'auto_export' },
        { value: testNameCount, label: 'Nombre prueba/test', color: testNameCount > 0 ? AUDIT_PALETTE.orange : AUDIT_PALETTE.gray, drillKey: 'auto_test_name' },
    ];

    registerPdfData('autos', kpis, [...baseCards, ...detailedCards], [...topCallouts, ...detailedCallouts]);

    document.getElementById('audit-tab-autos').innerHTML = buildTabWrapper(
        buildKpiRow(kpis) + renderCallouts(topCallouts) +
        buildGrid(baseCards.map(c => buildMetricCard(c.title, c.help, c.bars, { wide: c.wide }))) +
        detailedHtml
    );
}
