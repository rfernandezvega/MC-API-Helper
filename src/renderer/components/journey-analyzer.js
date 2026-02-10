// src/renderer/components/journey-analyzer.js
import * as mcApiService from '../api/mc-api-service.js';
import * as ui from '../ui/ui-helpers.js';
import elements from '../ui/dom-elements.js';
import * as logger from '../ui/logger.js';
import { loadCustomFonts } from '../ui/fonts.js';

let goBackFunction;
let getAuthenticatedConfig;
let currentJourneyDetails = null;

// CACHÉs: Evita llamadas repetidas a la API por el mismo campo/tabla
const fieldCache = new Map(); 
const deCache = new Map();
const sendClassificationCache = new Map();
const listCache = new Map();
const automationCache = new Map();

const ACTIVITY_TYPE_MAP = {
    'EMAILV2': '[EMAIL]', 'SMS': '[SMS]', 'MOBILEPUSH': '[PUSH]', 'PUSHNOTIFICATIONACTIVITY': '[PUSH]',
    'WHATSAPPACTIVITY': '[WHATSAPP]', 'INBOX': '[INBOX MSG]', 'INAPP': '[IN-APP MSG]', 'WAIT': '[ESPERA]',
    'WAITBYDURATION': '[ESPERA]', 'WAITBYATTRIBUTE': '[ESPERA POR ATRIBUTO]', 'WAITBYEVENT': '[ESPERA HASTA EVENTO]',
    'WAITUNTILDATE': '[ESPERA HASTA FECHA]', 'STOWAIT': '[ESPERA EINSTEIN STO]', 'MULTICRITERIARDECISION': '[SPLIT]',
    'MULTICRITERIADECISIONV2': '[SPLIT]', 'RANDOMSPLIT': '[RANDOM SPLIT]', 'RANDOMSPLITV2': '[RANDOM SPLIT]',
    'ENGAGEMENTDECISION': '[ENGAGEMENT SPLIT]', 'ENGAGEMENTSPLITV2': '[ENGAGEMENT SPLIT]',
    'PATHOPTIMIZER': '[OPTIMIZADOR DE RUTA]', 'UPDATECONTACTDATA': '[UPDATE CONTACT]',
    'UPDATECONTACTDATAV2': '[UPDATE CONTACT]', 'ADDAUDIENCE': '[AUDIENCIA]',
    'CONTACTUPDATE': '[UPDATE CONTACT]', 'EINSTEINSPLIT': '[DIVISIÓN EINSTEIN SCORE]',
    'EINSTEINMESSAGINGSPLIT': '[EINSTEIN INSIGHTS SPLIT]', 'EINSTEIN_EMAIL_OPEN': '[EINSTEIN SPLIT OPEN]',
    'EINSTEIN_MC_EMAIL_CLICK': '[EINSTEIN SPLIT CLICK]', 'SALESFORCESALESCLOUDACTIVITY': '[ACCIÓN SALESFORCE]',
    'OBJECTACTIVITY': '[ACCIÓN OBJETO SALESFORCE]', 'LEAD': '[ACCIÓN LEAD SALESFORCE]',
    'CAMPAIGNMEMBER': '[ACCIÓN MIEMBRO DE CAMPAÑA]', 'REST': '[API REST (CUSTOM)]', 'SETCONTACTKEY': '[ESTABLECER CONTACT KEY]',
    'EVENT': '[EVENTO]', 'SMSSYNC': '[SMS]', 'WAITUNTILCHATRESPONSE': '[WAIT UNTIL CHAT RESPONSE]'
};

export function init(dependencies) {
    goBackFunction = dependencies.goBack;
    getAuthenticatedConfig = dependencies.getAuthenticatedConfig;
    
    if (elements.journeyAnalyzerBackBtn) elements.journeyAnalyzerBackBtn.addEventListener('click', goBackFunction);
    if (elements.downloadJourneyPdfBtn) elements.downloadJourneyPdfBtn.addEventListener('click', () => generatePDF());
}

export async function view(journeyDetails) {
    ui.blockUI("Analizando fuente de entrada y mapeos...");

    logger.startLogBuffering();
    mcApiService.setLogger(logger);
    
    try {
        const apiConfig = await getAuthenticatedConfig();
        
        // 1. Resolver información de la fuente de entrada (NUEVO)
        await resolveEntrySource(journeyDetails, apiConfig);

        // 2. Traducir mapeos de campos (Update Contact)
        await enrichJourneyWithFieldNames(journeyDetails, apiConfig);
        
        currentJourneyDetails = journeyDetails;
        elements.analyzerJourneyNameTitle.textContent = journeyDetails.name;
        
        // 3. Renderizar la cabecera mejorada
        renderHeader(journeyDetails);
        
        const flowResult = generateFlow(journeyDetails); 
        elements.journeyAnalyzerFlow.textContent = flowResult.text;
        renderActivities(journeyDetails.activities, flowResult.numberMap);

        currentJourneyDetails.flowText = flowResult.text; 
        currentJourneyDetails.numberMap = flowResult.numberMap;

    } catch (error) {
        ui.showCustomAlert(`Error al analizar: ${error.message}`);
    } finally {
        ui.unblockUI();
        logger.endLogBuffering();
    }
}

/**
 * Renderiza las actividades ORDENADAS por su aparición en el dibujo.
 */
function renderActivities(activities, numberMap) {
    const container = elements.journeyAnalyzerActivitiesContainer;
    container.innerHTML = '';
    if (!activities) return;

    const flowActivities = activities
        .filter(act => numberMap.has(act.key))
        .sort((a, b) => numberMap.get(a.key) - numberMap.get(b.key));

    flowActivities.forEach((act) => {
        const logicNumber = numberMap.get(act.key);
        const div = document.createElement('div');
        div.className = 'config-block';
        div.style.border = "1px solid #ddd";
        let extraConfig = '';

        if (act.type === 'MULTICRITERIADECISION') {
            extraConfig = parseDecisionCriteria(act);
        } 
        else if (act.type === 'RANDOMSPLIT') {
            const outcomes = act.outcomes || [];
            let rows = outcomes.map(o => `
                <tr>
                    <td style="padding:5px; border:1px solid #eee;"><b>${o.metaData?.label || o.metaData?.name || o.key}</b></td>
                    <td style="padding:5px; border:1px solid #eee; color:#e67e22; font-weight:bold; text-align:center;">
                        ${o.arguments?.percentage}%
                    </td>
                </tr>
            `).join('');

            extraConfig = `
                <h5 style="margin-top:10px;">Distribución de Probabilidad:</h5>
                <table style="width:100%; border-collapse:collapse; font-size:0.85em; background:#fff;">
                    <thead style="background:#fef5e7;">
                        <tr>
                            <th style="text-align:left; padding:5px; border:1px solid #eee;">Rama / Camino</th>
                            <th style="text-align:center; padding:5px; border:1px solid #eee; width:80px;">Porcentaje</th>
                        </tr>
                    </thead>
                    <tbody>${rows}</tbody>
                </table>
            `;
        }
        else if (act.type === 'UPDATECONTACTDATA') {
            const fields = act.arguments?.activityData?.updateContactFields || [];
            let rows = fields.map(f => `
                <tr>
                    <td style="padding:5px; border:1px solid #eee;"><b>${f.resolvedFieldName || f.field}</b></td>
                    <td style="padding:5px; border:1px solid #eee; color:#2980b9;">${f.value === 0 ? '0' : (f.value || '<i>vacío</i>')}</td>
                </tr>
            `).join('');

            extraConfig = `
                <div style="background:#fdfefe; border:1px solid #d4e6f1; padding:10px; border-radius:4px; margin-top:10px;">
                    <p style="margin:0 0 10px 0;"><strong>Data Extension de Destino:</strong> <span style="color:#1f618d;">${act.resolvedDeName || 'No detectada'}</span></p>
                    <h5 style="margin:10px 0 5px 0;">Mapeo de Atributos:</h5>
                    <table style="width:100%; border-collapse:collapse; font-size:0.85em; background:#fff;">
                        <thead style="background:#f1f1f1;">
                            <tr><th style="text-align:left; padding:5px; border:1px solid #eee;">Campo Destino</th><th style="text-align:left; padding:5px; border:1px solid #eee;">Valor / Atributo</th></tr>
                        </thead>
                        <tbody>${rows}</tbody>
                    </table>
                </div>
            `;
        }
        else if (act.type.startsWith('WAIT')) {
            const config = act.configurationArguments || {};
            extraConfig = `<p style="color: #666; background: #f1f1f1; padding: 5px;"><strong>Configuración Espera:</strong> ${config.waitDuration || '---'} ${config.waitUnit || ''}</p>`;
        }
        else if (act.type === 'EMAILV2') {
            const ts = act.configurationArguments?.triggeredSend || {};
            
            extraConfig = `
                <div style="background:#f4f9f4; border:1px solid #c8e6c9; padding:10px; border-radius:4px; margin-top:10px;">
                    <p style="margin:0 0 5px 0;"><strong>Email ID:</strong> ${ts.emailId || '---'}</p>
                    <p style="margin:0 0 5px 0;"><strong>Asunto:</strong> <span style="color:#2e7d32;">${ts.emailSubject || '---'}</span></p>
                    <p style="margin:0 0 5px 0;"><strong>Preheader:</strong> <span style="color:#666; font-style:italic;">${ts.preHeader || '---'}</span></p>
                    <hr style="border:0; border-top:1px solid #c8e6c9; margin:8px 0;">
                    <p style="margin:0 0 5px 0;"><strong>Clasificación:</strong> ${act.resolvedSendClassification || ts.sendClassificationId || '---'}</p>
                    <p style="margin:0;"><strong>Lista Publicación:</strong> ${act.resolvedListName || (ts.publicationListId === 0 ? 'All Subscribers' : ts.publicationListId)}</p>
                </div>
            `;
        }
        else if (act.type === 'ENGAGEMENTDECISION') {
            const config = act.configurationArguments || {};
            
            // Mapeo de tipos de interacción según statsTypeId
            const statsMap = {
                2: { label: "Apertura de Email (Open)", color: "#27ae60" }, // Verde
                3: { label: "Clic en Enlace (Click)", color: "#2980b9" },   // Azul
                6: { label: "Rebote (Bounce)", color: "#c0392b" }          // Rojo
            };

            const typeInfo = statsMap[config.statsTypeId] || { label: `Tipo desconocido (${config.statsTypeId})`, color: "#7f8c8d" };
            const refEmailName = act.metaData?.refActivityName || config.refActivityCustomerKey || 'No identificado';

            // Si es un split por CLIC, verificamos si hay URLs específicas seleccionadas
            let urlDetail = '';
            if (config.statsTypeId === 3 && config.engagementUrls?.urls?.length > 0) {
                const urlList = config.engagementUrls.urls.map(u => `<li>${u.alias || u.url}</li>`).join('');
                urlDetail = `
                    <div style="margin-top:8px; padding-top:8px; border-top:1px dashed #d5dbdb;">
                        <strong style="font-size:0.85em;">URLs específicas monitoreadas:</strong>
                        <ul style="margin:5px 0 0 15px; padding:0; font-size:0.8em; color:#566573;">${urlList}</ul>
                    </div>
                `;
            } else if (config.statsTypeId === 3) {
                urlDetail = `<p style="margin-top:5px; font-size:0.85em; color:#7f8c8d;"><i>Monitoreando cualquier enlace del email.</i></p>`;
            }

            extraConfig = `
                <div style="background:#f4f6f7; border:1px solid #d5dbdb; padding:10px; border-radius:4px; margin-top:10px; border-left: 4px solid ${typeInfo.color};">
                    <p style="margin:0 0 5px 0;"><strong>Evento esperado:</strong> <span style="color:${typeInfo.color}; font-weight:bold;">${typeInfo.label}</span></p>
                    <p style="margin:0;"><strong>Email de referencia:</strong> <span style="color:#2e86c1;">${refEmailName}</span></p>
                    ${urlDetail}
                </div>
            `;
        }
        else if (act.type === 'PUSHNOTIFICATIONACTIVITY' || act.type === 'MOBILEPUSH') {
            const config = act.configurationArguments || {};
            const args = act.arguments || {};
            
            // El Asset ID suele venir en arguments o dentro del triggeredSend de la config
            const assetId = args.assetId || config.triggeredSend?.assetId || '---';
            
            // El nombre de la aplicación (App de destino)
            const applicationName = config.application?.name || '---';

            extraConfig = `
                <div style="background:#fdf4ff; border:1px solid #f5d0fe; padding:10px; border-radius:4px; margin-top:10px; border-left: 4px solid #a21caf;">
                    <p style="margin:0 0 5px 0;"><strong>Nombre del mensaje:</strong> <span style="color:#701a75; font-weight:bold;">${act.name || '---'}</span></p>
                    <p style="margin:0 0 5px 0;"><strong>Asset ID:</strong> <span style="color:#666;">${assetId}</span></p>
                    <p style="margin:0;"><strong>Aplicación móvil:</strong> <span style="color:#86198f;">${applicationName}</span></p>
                </div>
            `;
        }

        div.innerHTML = `
            <h4 style="margin-top:0; color:#558ac7;">#${logicNumber} - ${act.name}</h4>
            <p style="font-size: 0.8rem; color: #666; margin-bottom: 8px;">
                <strong>Tipo:</strong> ${act.type} | <strong>ID:</strong> ${act.key}
            </p>
            ${extraConfig}
        `;
        container.appendChild(div);
    });
}

/**
 * Genera el flujo y devuelve tanto el texto como el Mapa de numeración.
 */
function generateFlow(journey) {
    const activitiesMap = new Map(journey.activities.map(act => [act.key, act]));
    const activityKeyToLineNum = new Map();
    const output = [];
    let lineCounter = 1;

    function processActivity(activityKey, prefix) {
        if (!activityKey || activityKeyToLineNum.has(activityKey)) return;

        const activity = activitiesMap.get(activityKey);
        if (!activity) return;

        const lineNum = lineCounter++;
        activityKeyToLineNum.set(activityKey, lineNum);

        const type = ACTIVITY_TYPE_MAP[activity.type] || `[${activity.type}]`;
        output.push(`${prefix}${lineNum}. ${type} ${activity.name}`);

        const outcomes = activity.outcomes || [];
        if (outcomes.length === 1) {
            const nextKey = outcomes[0].next;
            if (nextKey) {
                if (activityKeyToLineNum.has(nextKey)) output.push(`${prefix}   └─> [UNIÓN] ➡️ #${activityKeyToLineNum.get(nextKey)}`);
                else processActivity(nextKey, prefix + "   ");
            } else output.push(`${prefix}   └─> 🔴 (Fin)`);
        } else if (outcomes.length > 1) {
            outcomes.forEach((outcome, index) => {
                const isLast = index === outcomes.length - 1;
                const branchChar = isLast ? '└─' : '├─';
                const nextPrefix = isLast ? '   ' : '│  ';
                const label = outcome.arguments?.label || outcome.metaData?.label || `Rama ${index + 1}`;
                output.push(`${prefix}${branchChar} [${label}]`);
                if (outcome.next) {
                    if (activityKeyToLineNum.has(outcome.next)) output.push(`${prefix}${nextPrefix}  └─> [UNIÓN] ➡️ #${activityKeyToLineNum.get(outcome.next)}`);
                    else processActivity(outcome.next, prefix + nextPrefix);
                } else output.push(`${prefix}${nextPrefix}  └─> 🔴 (Fin)`);
            });
        }
    }

    let startKey = null;
    const trigger = journey.triggers?.[0];
    if (trigger?.outcomes?.[0]?.next) {
        startKey = trigger.outcomes[0].next;
        output.push(`[INICIO] Entrada: ${trigger.type}`);
    } else {
        const targetKeys = new Set(journey.activities.flatMap(a => (a.outcomes || []).map(o => o.next)));
        const rootActivity = journey.activities.find(a => !targetKeys.has(a.key));
        if (rootActivity) {
            startKey = rootActivity.key;
            output.push(`[INICIO] Raíz detectada: ${rootActivity.name}`);
        } else if (journey.activities.length > 0) {
            startKey = journey.activities[0].key;
            output.push(`[INICIO] Forzado: ${journey.activities[0].name}`);
        }
    }

    processActivity(startKey, '');
    
    return {
        text: output.join('\n'),
        numberMap: activityKeyToLineNum
    };
}

/**
 * Recorre el Journey traduciendo tanto IDs de campos como IDs de Data Extensions.
 */
async function enrichJourneyWithFieldNames(journey, apiConfig) {
    for (const act of journey.activities || []) {
        if (act.type === 'UPDATECONTACTDATA') {
            const fields = act.arguments?.activityData?.updateContactFields || [];
            
            // Protección: Validamos que existan campos y que el primer campo tenga ID de DE
            if (fields.length > 0 && fields[0].dataExtensionId) {
                const deID = fields[0].dataExtensionId;
                if (!deCache.has(deID)) {
                    ui.blockUI(`Traduciendo DE: ${deID.substring(0,8)}...`);
                    // Corregido: deID y apiConfig (antes valor/config)
                    const deName = await mcApiService.fetchDataExtensionName('ObjectID', deID, apiConfig);
                    deCache.set(deID, deName);
                }
                act.resolvedDeName = deCache.get(deID);

                for (const f of fields) {
                    if (f.field && !fieldCache.has(f.field)) {
                        const fieldName = await mcApiService.fetchFieldNameById(f.field, apiConfig);
                        fieldCache.set(f.field, fieldName);
                    }
                    f.resolvedFieldName = fieldCache.get(f.field);
                }
            }
        } else if (act.type === 'EMAILV2') {
            const ts = act.configurationArguments?.triggeredSend || {};
            
            if (ts.sendClassificationId) {
                if (!sendClassificationCache.has(ts.sendClassificationId)) {
                    const name = await mcApiService.fetchSendClassificationNameById(ts.sendClassificationId, apiConfig);
                    sendClassificationCache.set(ts.sendClassificationId, name);
                }
                act.resolvedSendClassification = sendClassificationCache.get(ts.sendClassificationId);
            }

            if (ts.publicationListId !== undefined) {
                if (!listCache.has(ts.publicationListId)) {
                    const name = await mcApiService.fetchListNameById(ts.publicationListId, apiConfig);
                    listCache.set(ts.publicationListId, name);
                }
                act.resolvedListName = listCache.get(ts.publicationListId);
            }
        }
    }
}

function parseDecisionCriteria(act) {
    const criteria = act.configurationArguments?.criteria;
    const outcomes = act.outcomes || [];
    
    if (!criteria || Object.keys(criteria).length === 0) return '<p><i>Sin criterios configurados (flujo lineal o resto).</i></p>';

    let html = '<h5 style="margin: 10px 0 5px 0;">Configuración de Decisiones:</h5>';
    const parser = new DOMParser();

    for (const [pathKey, xmlString] of Object.entries(criteria)) {
        const outcome = outcomes.find(o => o.key === pathKey);
        const branchLabel = outcome?.metaData?.label || pathKey;
        
        try {
            const xmlDoc = parser.parseFromString(xmlString, "text/xml");
            const conditionSet = xmlDoc.querySelector("ConditionSet");
            const logicOperator = conditionSet ? conditionSet.getAttribute("Operator") : "AND";
            const conditions = xmlDoc.querySelectorAll("Condition");

            let criteriaItems = [];
            conditions.forEach(cond => {
                const key = cond.getAttribute("Key");
                const operator = cond.getAttribute("Operator");
                
                // Buscamos el valor: puede estar directo en <Value> o dentro de <AttributePath><Value>
                let valueNode = cond.querySelector("Value");
                let value = valueNode ? valueNode.textContent : "---";

                // Formateo amigable del operador
                const opMap = { "Equal": "==", "NotEqual": "!=", "Is": "es", "IsNull": "es nulo", "IsNotNull": "no es nulo", "GreaterThan": ">", "LessThan": "<" };
                const friendlyOp = opMap[operator] || operator;

                criteriaItems.push(`
                    <div style="margin-bottom:4px;">
                        <span style="color:#d35400; font-weight:bold;">${key}</span> 
                        <span style="color:#2980b9;">${friendlyOp}</span> 
                        <span style="color:#27ae60;">"${value}"</span>
                    </div>
                `);
            });

            // Si hay más de una condición, mostramos el operador lógico (AND/OR)
            const logicBadge = criteriaItems.length > 1 
                ? `<span style="background:#ebedef; padding:2px 6px; border-radius:10px; font-size:0.8em; font-weight:bold; color:#566573; margin-bottom:5px; display:inline-block;">Lógica: ${logicOperator}</span>` 
                : '';

            html += `
                <div style="margin-bottom:12px; padding:10px; background:#fff; border:1px solid #d6dbdf; border-left:4px solid #5499c7; border-radius:0 4px 4px 0;">
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:5px;">
                        <strong style="color:#1b4f72;">Rama: ${branchLabel}</strong>
                        ${logicBadge}
                    </div>
                    <div style="padding-left:10px; border-left:1px dashed #abb2b9;">
                        ${criteriaItems.join('')}
                    </div>
                </div>
            `;

        } catch (e) {
            console.error("Error parseando XML de criterio:", e);
            html += `<p style="color:red;">Error al procesar la rama ${branchLabel}</p>`;
        }
    }

    // Añadir información de la rama de "Resto" si existe
    const remainder = outcomes.find(o => o.key === 'remainder_path');
    if (remainder) {
        html += `
            <div style="margin-bottom:12px; padding:10px; background:#fdfefe; border:1px solid #d6dbdf; border-left:4px solid #abb2b9; border-radius:0 4px 4px 0;">
                <strong style="color:#566573;">Rama: ${remainder.metaData?.label || 'Resto'}</strong><br>
                <small style="color:#7f8c8d;">Cualquier contacto que no cumpla los criterios anteriores.</small>
            </div>
        `;
    }

    return html;
}

/**
 * Lógica para identificar el tipo de entrada y recuperar sus nombres reales
 */
async function resolveEntrySource(journey, apiConfig) {
    const trigger = journey.triggers?.[0];
    if (!trigger) return;

    const eventDefId = trigger.metaData?.eventDefinitionId;
    let eventDef = null;

    if (eventDefId) {
        try {
            eventDef = await mcApiService.getEventDefinitionById(eventDefId, apiConfig);
        } catch (e) { console.error("Error EventDefinition:", e); }
    }

    journey.entryDetails = {
        type: trigger.type || "Desconocido",
        summary: "No definida"
    };

    const config = {
        ...(trigger.configurationArguments || {}),
        ...(trigger.arguments || {}),
        ...(eventDef || {}),
        ...(eventDef?.arguments || {})
    };

    if (trigger.type === 'EmailAudience') {
        const deId = config.dataExtensionId || config.dataExtensionObjectID;
        if (deId) {
            if (!deCache.has(deId)) {
                // Traducimos el ID en Nombre
                const deName = await mcApiService.fetchDataExtensionName('ObjectID', deId, apiConfig);
                deCache.set(deId, deName);
            }
            journey.entryDetails.summary = `<b>Data Extension:</b><br>${deCache.get(deId)}`;
        }
    } 
    else if (trigger.type === 'AutomationAudience') {
        const autoId = config.automationId;
        const deId = config.dataExtensionId;

        if (autoId && !automationCache.has(autoId)) {
            try {
                const autoDetails = await mcApiService.fetchAutomationDetailsById(autoId, apiConfig);
                automationCache.set(autoId, autoDetails.name);
            } catch (e) { automationCache.set(autoId, "ID: " + autoId); }
        }

        if (deId && !deCache.has(deId)) {
            try {
                // Traducimos el ID de la DE de entrada en Nombre
                const deName = await mcApiService.fetchDataExtensionName('ObjectID', deId, apiConfig);
                deCache.set(deId, deName);
            } catch (e) { deCache.set(deId, "ID: " + deId); }
        }

        const nameAuto = automationCache.get(autoId) || "No detectado";
        const nameDe = deCache.get(deId) || "No detectada";
        
        journey.entryDetails.summary = `
            <div><b>Automatismo:</b> ${nameAuto}</div>
            <div><b>DE Entrada:</b> ${nameDe}</div>
        `;
    }
    else if (trigger.type === 'APIEvent') {
        const eventKey = eventDef?.eventDefinitionKey || trigger.metaData?.eventDefinitionKey || config.eventDefinitionKey;
        journey.entryDetails.summary = `<b>Event Key:</b><br>${eventKey || '---'}`;
    }
}

function renderHeader(j) {
    const entry = j.entryDetails || { type: 'Desconocido', summary: '---' };
    
    // SFMC a veces usa .definitionKey y otras veces .key. Usamos ambos:
    const definitionKey = j.definitionKey || j.key || 'No disponible';

    elements.journeyAnalyzerHeader.innerHTML = `
        <div style="background-color: #fff; border: 1px solid #e0e6ed; border-top: 4px solid #558ac7; border-radius: 8px; padding: 20px; margin-bottom: 25px; box-shadow: 0 2px 4px rgba(0,0,0,0.05);">
            <div style="display: grid; grid-template-columns: 1.2fr 1fr 1.5fr; gap: 30px; align-items: start;">
                
                <!-- Columna 1: Identificación -->
                <div style="border-right: 1px solid #f0f3f7; padding-right: 10px;">
                    <h5 style="margin:0 0 10px 0; color:#558ac7; text-transform: uppercase; font-size:0.75rem; letter-spacing: 0.5px;">Identificación</h5>
                    <p style="margin:0 0 5px 0; font-size:0.9rem;"><strong>Versión:</strong> ${j.version}</p>
                    <p style="margin:0 0 5px 0; font-size:0.9rem;"><strong>Estado:</strong> <span class="status-badge">${j.status}</span></p>
                    <p style="margin:0; font-size:0.8rem; color:#666;"><strong>Key:</strong> ${definitionKey}</p>
                </div>

                <!-- Columna 2: Auditoría -->
                <div style="border-right: 1px solid #f0f3f7; padding-right: 10px;">
                    <h5 style="margin:0 0 10px 0; color:#558ac7; text-transform: uppercase; font-size:0.75rem; letter-spacing: 0.5px;">Fechas</h5>
                    <p style="margin:0 0 5px 0; font-size:0.85rem;"><strong>Creado:</strong><br>${new Date(j.createdDate).toLocaleString()}</p>
                    <p style="margin:0; font-size:0.85rem;"><strong>Modificado:</strong><br>${new Date(j.modifiedDate).toLocaleString()}</p>
                </div>

                <!-- Columna 3: Configuración de Entrada -->
                <div>
                    <h5 style="margin:0 0 10px 0; color:#558ac7; text-transform: uppercase; font-size:0.75rem; letter-spacing: 0.5px;">Configuración de Entrada</h5>
                    <p style="margin:0 0 5px 0; font-size:0.9rem;"><strong>Tipo:</strong> ${entry.type}</p>
                    <div style="margin:0; font-size:0.85rem; color:#444; line-height:1.5;">${entry.summary}</div>
                </div>

            </div>
        </div>
    `;
}

function generatePDF() {
    if (!currentJourneyDetails) return;
    
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF('p', 'mm', 'a4');
    const j = currentJourneyDetails;

    try {
        loadCustomFonts(doc);
        doc.setFont('NotoSans');
    } catch (e) { console.error("Error fuentes:", e); }

    let currentY = 20;

    // --- HELPER: Limpiar texto de Flujo para PDF (ASCII puro para alineación) ---
    const formatFlowForPdf = (text) => {
        if (!text) return "No disponible";
        return text
            .replace(/└─/g,  '\\--')
            .replace(/├─/g,  '|--')
            .replace(/│/g,   '|  ')
            .replace(/─/g,   '-')
            .replace(/➡️/g,  '->')
            .replace(/🔴/g,  '(Fin)')
            .replace(/%/g,   '') 
            .replace(/Ø=Ý4/g, '')
            .trim();
    };

    // --- TÍTULO PRINCIPAL ---
    doc.setFontSize(14).setTextColor(40, 116, 166).setFont("helvetica", "bold");
    const splitTitle = doc.splitTextToSize(`Análisis de Journey: ${j.name.trim()}`, 180);
    doc.text(splitTitle, 10, currentY);
    currentY += (splitTitle.length * 7);

    // --- BLOQUE 1: IDENTIFICACIÓN Y ENTRADA ---
    const entry = j.entryDetails || { type: 'Desconocido', summary: '' };
    
    // Extraemos texto limpio del summary (sin HTML)
    const entryLines = entry.summary
    .replace(/<div[^>]*>/g, '')
    .replace(/<\/div>/g, '\n')
    .replace(/<br\s*\/?>/g, '\n')
    .replace(/<b>|<\/b>/g, '')
    .split('\n')
    .map(line => line.trim())
    .filter(line => line !== '')
    .join('\n');

    doc.autoTable({
        startY: currentY,
        margin: { left: 10, right: 10 },
        theme: 'grid',
        styles: { font: 'NotoSans', fontSize: 8, cellPadding: 2, overflow: 'linebreak' },
        headStyles: { fillColor: [52, 73, 94], textColor: 255 },
        columnStyles: { 0: { fontStyle: 'bold', cellWidth: 35 } },
        head: [[{ content: 'INFORMACIÓN GENERAL Y FUENTE DE ENTRADA', colSpan: 2 }]],
        body: [
            ["Versión / Estado:", `${j.version} - ${j.status}`],
            ["Definition Key:", j.definitionKey || j.key || 'N/A'],
            ["Tipo de Entrada:", entry.type],
            ["Configuración:", entryLines] // Mostrará los nombres resueltos en líneas distintas
        ]
    });

    currentY = doc.lastAutoTable.finalY + 10;

    // --- BLOQUE 2: FLUJO LÓGICO ---
    if (currentY > 240) { doc.addPage(); currentY = 20; }
    doc.setFontSize(11).setTextColor(40, 116, 166).setFont("helvetica", "bold");
    doc.text("Flujo Lógico del Journey", 10, currentY);
    currentY += 4;

    doc.autoTable({
        startY: currentY,
        margin: { left: 10, right: 10 },
        theme: 'plain',
        styles: { font: 'courier', fontSize: 7, cellPadding: 3, fillColor: [248, 249, 250] },
        body: [[formatFlowForPdf(j.flowText)]],
        didDrawCell: (data) => {
            doc.setDrawColor(200, 200, 200);
            doc.rect(data.cell.x, data.cell.y, data.cell.width, data.cell.height);
        }
    });

    currentY = doc.lastAutoTable.finalY + 10;

    // --- BLOQUE 3: DETALLE DE ACTIVIDADES ---
    doc.setFontSize(11).setTextColor(40, 116, 166).setFont("helvetica", "bold");
    doc.text("Detalle de Configuración por Actividad", 10, currentY);
    currentY += 5;

    const flowActivities = j.activities
        .filter(act => j.numberMap.has(act.key))
        .sort((a, b) => j.numberMap.get(a.key) - j.numberMap.get(b.key));

    for (const act of flowActivities) {
        if (currentY > 250) { doc.addPage(); currentY = 20; }
        
        const num = j.numberMap.get(act.key);
        const tableBody = [["Tipo:", act.type]];

        // 1. EMAIL V2
        if (act.type === 'EMAILV2') {
            const ts = act.configurationArguments?.triggeredSend || {};
            tableBody.push([{ content: "DETALLES DEL ENVÍO", colSpan: 2, styles: { fillColor: [240, 240, 240], halign: 'center', fontStyle: 'bold' } }]);
            tableBody.push(["Email ID:", String(ts.emailId || '---')]);
            tableBody.push(["Asunto:", ts.emailSubject || '---']);
            tableBody.push(["Preheader:", ts.preHeader || '---']);
            tableBody.push(["Clasificación:", act.resolvedSendClassification || ts.sendClassificationId || '---']);
            tableBody.push(["Lista Publicación:", act.resolvedListName || (ts.publicationListId === 0 ? 'All Subscribers' : ts.publicationListId)]);
        }
        
        // 2. DECISION SPLIT
        else if (act.type.includes('MULTICRITERIA')) {
            const criteria = act.configurationArguments?.criteria || {};
            tableBody.push([{ content: "CRITERIOS DE DECISIÓN", colSpan: 2, styles: { fillColor: [240, 240, 240], halign: 'center', fontStyle: 'bold' } }]);
            
            const parser = new DOMParser();
            const criteriaKeys = Object.keys(criteria);

            for (const [pathKey, xml] of Object.entries(criteria)) {
                const outcome = act.outcomes.find(o => o.key === pathKey);
                const label = outcome?.metaData?.label || pathKey;
                try {
                    const xmlDoc = parser.parseFromString(xml, "text/xml");
                    const operator = xmlDoc.querySelector("ConditionSet")?.getAttribute("Operator") || "AND";
                    const conditions = Array.from(xmlDoc.querySelectorAll("Condition")).map(c => {
                        const val = c.querySelector("Value")?.textContent || "";
                        return `• ${c.getAttribute("Key")} ${c.getAttribute("Operator")} "${val}"`;
                    });
                    tableBody.push([`Rama: ${label}`, `Lógica: ${operator}\n${conditions.join('\n')}`]);
                } catch (e) { tableBody.push([`Rama: ${label}`, "Error parseando XML"]); }
            }
            // Rama por defecto (Remainder)
            const remainder = act.outcomes.find(o => !criteriaKeys.includes(o.key) && o.key !== 'remainder_path');
            const remainderLabel = act.outcomes.find(o => o.key === 'remainder_path')?.metaData?.label || 'Resto / Remainder';
            tableBody.push([`Rama: ${remainderLabel}`, "Cualquier contacto que no cumpla los criterios anteriores."]);
        }

        // 3. ENGAGEMENT SPLIT
        else if (act.type === 'ENGAGEMENTDECISION') {
            const config = act.configurationArguments || {};
            const stats = { 2: "Apertura de Email (Open)", 3: "Clic en Enlace (Click)", 6: "Rebote (Bounce)" };
            const typeInfo = stats[config.statsTypeId] || `Tipo ${config.statsTypeId}`;
            const refEmail = act.metaData?.refActivityName || config.refActivityCustomerKey || 'No identificado';

            tableBody.push([{ content: "DETALLES DE INTERACCIÓN", colSpan: 2, styles: { fillColor: [240, 240, 240], halign: 'center', fontStyle: 'bold' } }]);
            tableBody.push(["Evento esperado:", typeInfo]);
            tableBody.push(["Email de referencia:", refEmail]);
        }

        // 4. UPDATE CONTACT
        else if (act.type === 'UPDATECONTACTDATA') {
            const fields = act.arguments?.activityData?.updateContactFields || [];
            tableBody.push([{ content: `DESTINO: ${act.resolvedDeName || '---'}`, colSpan: 2, styles: { fillColor: [240, 240, 240], halign: 'center', fontStyle: 'bold' } }]);
            fields.forEach(f => {
                tableBody.push([f.resolvedFieldName || f.field, String(f.value === 0 ? "0" : (f.value || "vacío"))]);
            });
        }

        doc.autoTable({
            startY: currentY,
            margin: { left: 10, right: 10 },
            theme: 'grid',
            styles: { font: 'NotoSans', fontSize: 8, cellPadding: 2, overflow: 'linebreak' },
            headStyles: { fillColor: [85, 138, 199] },
            columnStyles: { 0: { cellWidth: 35, fontStyle: 'bold' } },
            head: [[{ content: `#${num} - ${act.name}`, colSpan: 2 }]],
            body: tableBody
        });

        currentY = doc.lastAutoTable.finalY + 8;
    }

    doc.save(`Analisis_Journey_${j.name.replace(/[^a-zA-Z0-9]/g, '_')}.pdf`);
}