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
const templateCache = new Map();

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
    'EVENT': '[EVENTO]', 'SMSSYNC': '[SMS]', 'WAITUNTILCHATRESPONSE': '[WAIT UNTIL CHAT RESPONSE]',
    'MULTICRITERIADECISIONEXTENSION': '[EINSTEIN SPLIT]', 'ABNTEST': '[PATH OPTIMIZER]', 'ABNTESTSTOP': '[PATH OPTIMIZER FINISH]',
    'SALESCLOUDACTIVITY': '[SF ACTIVITY]', 'EINSTEINENGAGEMENTFREQUENCYSPLIT': '[EINSTEIN FREQUENCY SPLIT]',
    'WAITUNTILCHATRESPONSE ': '[WAIT UNTIL CHAT RESPONSE]', 'WHATSAPPSESSIONTRANSFERACTIVITY': '[WHATSAPP TRANSFER]',
    'PUSHINBOXACTIVITY': '[PUSH INBOX]'
};

const EINSTEIN_PROBABILITY_MAP = {
    'mostLikelyLabel': 'Most Likely (Más probable)',
    'moreLikelyLabel': 'More Likely (Muy probable)',
    'lessLikelyLabel': 'Less Likely (Poco probable)',
    'leastLikelyLabel': 'Least Likely (Nada probable)',
    'remainderLabel': 'Resto (Remainder)'
};

export function init(dependencies) {
    goBackFunction = dependencies.goBack;
    getAuthenticatedConfig = dependencies.getAuthenticatedConfig;
    
    if (elements.journeyAnalyzerBackBtn) elements.journeyAnalyzerBackBtn.addEventListener('click', goBackFunction);
    if (elements.downloadJourneyPdfBtn) elements.downloadJourneyPdfBtn.addEventListener('click', () => generatePDF());
    if (elements.downloadJourneyWordBtn) elements.downloadJourneyWordBtn.addEventListener('click', () => generateWord());

    if (elements.expandAllAnalyzerBtn) elements.expandAllAnalyzerBtn.addEventListener('click', () => bulkToggle(true));
    if (elements.collapseAllAnalyzerBtn) elements.collapseAllAnalyzerBtn.addEventListener('click', () => bulkToggle(false));

    elements.journeyAnalyzerActivitiesContainer.addEventListener('click', ui.handleExternalLink);
}

export async function view(journeyDetails) {
    ui.blockUI("Analizando fuente de entrada y mapeos...");

    mcApiService.setLogger(logger);
    
    try {
        const apiConfig = await getAuthenticatedConfig();
        await resolveEntrySource(journeyDetails, apiConfig);
        await enrichJourneyWithFieldNames(journeyDetails, apiConfig);
        
        currentJourneyDetails = journeyDetails;
        elements.analyzerJourneyNameTitle.textContent = journeyDetails.name;
        
        // 1. Renderizar cabecera
        renderHeader(journeyDetails);
        
        // 2. Renderizar Goals y Exits
        renderGlobalSettings(journeyDetails);
        
        // 3. Flujo y actividades
        const flowResult = generateFlow(journeyDetails); 
        elements.journeyAnalyzerFlowWrapper.innerHTML = createCollapsibleHtml(
            "Flujo Lógico del Journey", 
            `<pre style="background: #f8f9fa; padding: 15px; border-radius: 5px; font-size: 0.9em; line-height: 1.4; overflow-x: auto; margin:0; border: 1px solid #eee;">${flowResult.text}</pre>`,
            "flow-logic",
            false
        );
        renderActivities(journeyDetails.activities, flowResult.numberMap);

        initCollapsibleListeners();

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
 * Renderiza Goals y Exit Criteria entre la cabecera y el flujo
 */
function renderGlobalSettings(j) {
    const container = elements.journeyAnalyzerGlobalWrapper;
    container.innerHTML = '';
    
    const hasGoals = j.goals && j.goals.length > 0 && j.goals[0].configurationArguments?.criteria;
    const hasExits = j.exits && j.exits.length > 0 && j.exits[0].configurationArguments?.criteria;

    if (!hasGoals && !hasExits) return;

    let innerHtml = '';
    if (hasGoals) {
        const goal = j.goals[0];
        const unit = goal.metaData?.conversionUnit === 'percentage' ? '%' : goal.metaData?.conversionUnit || '';
        innerHtml += `
            <div style="border: 1px solid #f3e5ab; background: #fffaf0; padding:15px; border-radius:4px; margin-bottom:15px;">
                <h5 style="margin:0 0 5px 0; color:#e67e22;">🎯 GOAL: ${goal.name || 'Objetivo'}</h5>
                <p style="font-size:0.85rem; margin-bottom:8px;"><strong>Meta:</strong> ${goal.metaData?.conversionValue || ''}${unit} | <strong>¿Sale?:</strong> ${goal.metaData?.isExitCriteria ? 'Sí' : 'No'}</p>
                <div style="font-size:0.85rem; background:#fff; padding:10px; border:1px solid #f3e5ab; border-radius:4px;">${parseXmlToLogic(goal.configurationArguments.criteria)}</div>
            </div>`;
    }
    if (hasExits) {
        const exit = j.exits[0];
        innerHtml += `
            <div style="border: 1px solid #f5c6cb; background: #fdf2f2; padding:15px; border-radius:4px;">
                <h5 style="margin:0 0 5px 0; color:#c0392b;">🚪 EXIT CRITERIA</h5>
                <div style="font-size:0.85rem; background:#fff; padding:10px; border:1px solid #f5c6cb; border-radius:4px;">${parseXmlToLogic(exit.configurationArguments.criteria)}</div>
            </div>`;
    }

    container.innerHTML = createCollapsibleHtml("Configuraciones Globales (Goals / Exits)", innerHtml, "global-settings", false);
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
            let waitLabel = '---';

            if (config.specificDate) {
                // Formato: Hasta el 2026-02-19 a las 10:30 (Romance Standard Time)
                waitLabel = `Hasta fecha específica: <b>${config.specificDate}</b> a las <b>${config.specifiedTime || ''}</b> (${config.timeZone || ''})`;
            } else if (config.waitDuration) {
                waitLabel = `${config.waitDuration} ${config.waitUnit || ''}`;
            } else if (config.waitEndDateAttributeExpression) {
                waitLabel = `Hasta el atributo: ${config.waitEndDateAttributeExpression}`;
            }

            extraConfig = `<p style="color: #666; background: #f1f1f1; padding: 5px;"><strong>Configuración Espera:</strong> ${waitLabel}</p>`;
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
            
            const statsMap = {
                2: { label: "Apertura de Email (Open)", color: "#27ae60" },
                3: { label: "Clic en Enlace (Click)", color: "#2980b9" },
                6: { label: "Rebote (Bounce)", color: "#c0392b" }
            };

            const typeInfo = statsMap[config.statsTypeId] || { label: `Tipo ${config.statsTypeId}`, color: "#7f8c8d" };
            const refEmailName = act.metaData?.refActivityName || config.refActivityCustomerKey || 'No identificado';

            let urlDetail = '';
            if (config.statsTypeId === 3 && config.engagementUrls?.urls?.length > 0) {
                // Mapeo flexible: soporta si el API devuelve string directo u objeto con alias/url
                const urlList = config.engagementUrls.urls.map(u => {
                    const val = typeof u === 'string' ? u : (u.alias || u.url || '---');
                    return `<li>${val}</li>`;
                }).join('');

                urlDetail = `
                    <div style="margin-top:8px; padding-top:8px; border-top:1px dashed #d5dbdb;">
                        <strong style="font-size:0.85em;">URLs específicas monitoreadas:</strong>
                        <ul style="margin:5px 0 0 15px; padding:0; font-size:0.8em; color:#566573; word-break: break-all;">${urlList}</ul>
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
        else if (act.type === 'MULTICRITERIADECISIONEXTENSION') {
            const meta = act.metaData || {};
            // Verificamos qué paths están activos en la configuración
            const paths = meta.pathsAdded ? Object.keys(meta.pathsAdded).join(', ') : '---';

            extraConfig = `
                <div style="background:#e8f4f8; border:1px solid #a9cce3; padding:10px; border-radius:4px; margin-bottom:10px; border-left: 5px solid #032e61;">
                    <p style="margin:0 0 5px 0;"><strong>Canal Einstein:</strong> <span style="text-transform:uppercase;">${meta.channel || '---'}</span></p>
                    <p style="margin:0 0 5px 0;"><strong>Tipo de Split:</strong> <span style="text-transform:uppercase;">${meta.splitType || '---'}</span></p>
                    <p style="margin:0;"><strong>Caminos configurados:</strong> ${paths}</p>
                </div>
            ` + parseDecisionCriteria(act); 
        }
        else if (act.type === 'ABNTEST' || act.type === 'ABNTESTSTOP') {
            const config = act.configurationArguments || {};
            const metricMap = {
                'Clicks': 'Click Rate',
                'Opens': 'Open Rate',
                'Unsubscribes': 'Unsubscribe Rate'
            };

            let metricsHtml = `
                <div style="background:#fffcf5; border:1px solid #f3e5ab; padding:12px; border-radius:4px; margin-top:10px; border-left: 4px solid #e67e22;">
                    <h5 style="margin:0 0 8px 0; color:#d35400; font-size:0.9em;">Evaluación del Ganador (Winner Evaluation)</h5>
                    <div style="display:grid; grid-template-columns: 1fr 1fr; gap: 10px; font-size:0.85em;">
                        <div><strong>Tipo:</strong> ${config.winnerEvaluationType === 'Engagement' ? 'Email Engagement' : 'Manual'}</div>
                        <div><strong>Métrica:</strong> ${metricMap[config.engagementWinnerMetric] || config.engagementWinnerMetric}</div>
                        <div><strong>Periodo:</strong> ${config.engagementPeriod} ${config.engagementPeriodUnits}</div>
                        <div><strong>Holdback (Retención):</strong> ${config.holdBackPercentage || config.holdbackPercentage || 0}%</div>
                    </div>
                </div>
            `;

            if (act.type === 'ABNTEST') {
                const outcomes = act.outcomes || [];
                let rows = outcomes.map(o => `
                    <tr>
                        <td style="padding:5px; border:1px solid #eee;"><b>${o.metaData?.pathName || o.metaData?.label || o.key}</b></td>
                        <td style="padding:5px; border:1px solid #eee; color:#2980b9; font-weight:bold; text-align:center;">${o.arguments?.percentage}%</td>
                    </tr>
                `).join('');

                extraConfig = metricsHtml + `
                    <h5 style="margin-top:10px; font-size:0.85em;">Distribución de Caminos:</h5>
                    <table style="width:100%; border-collapse:collapse; font-size:0.85em; background:#fff;">
                        <thead style="background:#f0f7ff;">
                            <tr><th style="text-align:left; padding:5px; border:1px solid #eee;">Camino</th><th style="text-align:center; padding:5px; border:1px solid #eee; width:80px;">Porcentaje</th></tr>
                        </thead>
                        <tbody>${rows}</tbody>
                    </table>
                `;
            } else {
                // Para el STOP, solo mostramos la configuración de evaluación
                extraConfig = metricsHtml + `<p style="font-size:0.8em; color:#666; margin-top:5px;"><i>Punto de unión y finalización de la prueba.</i></p>`;
            }
        }
        else if (act.type === 'STOWAIT') {
            const params = act.configurationArguments?.params || {};
            const window = params.slidingWindowHours || '---';
            const isRandom = params.enableRandomTime ? 'Activada' : 'Desactivada';

            extraConfig = `
                <div style="background:#f0f4f8; border:1px solid #d6dbdf; padding:12px; border-radius:4px; margin-top:10px; border-left: 5px solid #032e61;">
                    <div style="display:flex; flex-direction:column; gap:8px; font-size:0.85em;">
                        <div style="display:flex; align-items:center; gap:10px;">
                            <strong>Ventana de tiempo (Time Frame):</strong>
                            <span style="background:#3498db; color:white; padding:2px 8px; border-radius:12px; font-weight:bold;">
                                ${window} horas
                            </span>
                        </div>
                        <div>
                            <strong>Envío aleatorio (Randomize):</strong> 
                            <span style="color:${params.enableRandomTime ? '#27ae60' : '#7f8c8d'};">
                                ${isRandom}
                            </span>
                        </div>
                    </div>
                </div>
            `;
        }
        else if (act.type === 'EINSTEINENGAGEMENTFREQUENCYSPLIT') {
            const params = act.configurationArguments?.params || {};
            const delta = params.almostSaturated?.delta || 0;
            
            // Mapeo de etiquetas legibles para Einstein Frequency
            const labelMap = {
                'saturated': 'Saturated (Saturado)',
                'almostsaturated': 'Almost Saturated (Casi saturado)',
                'ontarget': 'On Target (En el objetivo)',
                'undersaturated': 'Undersaturated (Sub-saturado)',
                'remainder': 'Resto (Remainder)'
            };

            const outcomes = act.outcomes || [];
            let pathsHtml = outcomes.map(o => {
                const splitResult = o.arguments?.splitResult || 'remainder';
                let detail = '';
                // Si es la rama de "Casi saturado", mostramos el delta seleccionado
                if (splitResult === 'almostsaturated' && delta) {
                    detail = ` <small style="color:#666;">(Límite alcanzado en ${delta} emails)</small>`;
                }
                return `<li><b>${labelMap[splitResult] || splitResult}</b>${detail}</li>`;
            }).join('');

            extraConfig = `
                <div style="background:#f4f6f7; border:1px solid #d5dbdb; padding:12px; border-radius:4px; margin-top:10px; border-left: 5px solid #032e61;">
                    <h5 style="margin:0 0 8px 0; color:#032e61; font-size:0.9em;">Einstein Engagement Frequency</h5>
                    <div style="font-size:0.85em; line-height:1.6;">
                        <p style="margin:0 0 5px 0;"><strong>Canal:</strong> <span style="text-transform:uppercase;">${params.type || 'email'}</span></p>
                        <p style="margin:0 0 5px 0;"><strong>Configuración "Almost Saturated":</strong> Saturación en <b>${delta}</b> emails.</p>
                        <div style="margin-top:8px; padding-top:8px; border-top:1px dashed #ccc;">
                            <strong>Caminos activos en el flujo:</strong>
                            <ul style="margin:5px 0 0 15px; padding:0;">${pathsHtml}</ul>
                        </div>
                    </div>
                </div>
            `;
        }
        else if (act.type === 'WHATSAPPACTIVITY') {
            const config = act.configurationArguments || {};
            
            // Parseo de la ventana de bloqueo (Blockout Window)
            let blockoutHtml = '<i>No configurada</i>';
            try {
                if (config.blockoutWindows) {
                    const windows = JSON.parse(config.blockoutWindows);
                    if (windows.length > 0) {
                        blockoutHtml = windows.map(w => 
                            `De <b>${w.startTime}</b> a <b>${w.endTime}</b> (${w.timezone})`
                        ).join('<br>');
                    }
                }
            } catch (e) { console.error("Error parseando WhatsApp blockout", e); }

            extraConfig = `
                <div style="background:#f0fff4; border:1px solid #c6f6d5; padding:12px; border-radius:4px; margin-top:10px; border-left: 5px solid #25d366;">
                    <h5 style="margin:0 0 10px 0; color:#128c7e; font-size:0.9em; display:flex; align-items:center;">
                        WhatsApp Message Configuration
                    </h5>
                    <div style="display:grid; grid-template-columns: 1fr; gap: 8px; font-size:0.85em;">
                        <div><strong>App Channel (ID):</strong> ${config.channelId || '---'}</div>
                        <div><strong>Mobile Number Attribute:</strong> <span style="color:#2c5282;">${config.mobileNumberAttributeName || '---'}</span></div>
                        
                        <div style="margin-top:8px; padding-top:8px; border-top:1px dashed #c6f6d5;">
                            <p style="margin:0 0 5px 0;"><strong>Message Timing:</strong> ${config.messagePriority || 'Anytime'}</p>
                            <p style="margin:0;"><strong>Blockout Window:</strong><br>${blockoutHtml}</p>
                        </div>

                        <div style="margin-top:5px; font-size:0.8em; color:#718096;">
                            <strong>Plantilla:</strong> ${act.resolvedTemplateName || config.assetId} (${config.assetId}) (${config.assetType})
                        </div>
                    </div>
                </div>
            `;
        }
        else if (act.type === 'WAITUNTILCHATRESPONSE') {
            const config = act.configurationArguments || {};
            
            // 1. Parseo de Keywords
            let keywordsHtml = '<i>No configuradas</i>';
            try {
                if (config.keywords) {
                    const kwList = JSON.parse(config.keywords);
                    if (kwList.length > 0) {
                        keywordsHtml = kwList.map((k, idx) => 
                            `<div style="margin-bottom:4px;">${idx + 1}. <b>${k.operator}</b>: "${k.keyword}"</div>`
                        ).join('');
                    }
                }
            } catch (e) { console.error("Error parseando Keywords", e); }

            extraConfig = `
                <div style="background:#fffcf5; border:1px solid #f3e5ab; padding:12px; border-radius:4px; margin-top:10px; border-left: 5px solid #f39c12;">
                    <h5 style="margin:0 0 10px 0; color:#d35400; font-size:0.9em; display:flex; align-items:center;">
                        Engagement: Wait Until Chat Response
                    </h5>
                    
                    <div style="font-size:0.85em;">
                        <div style="margin-bottom:10px; padding:8px; background:#fff; border:1px solid #eee; border-radius:4px;">
                            <strong>Coincidencia de Palabras Clave:</strong><br>
                            <div style="margin-top:5px; color:#2c3e50;">${keywordsHtml}</div>
                        </div>

                        <div style="display:grid; grid-template-columns: 1fr 1fr; gap:10px;">
                            <div style="padding:8px; background:#fdfefe; border:1px solid #eee;">
                                <strong>Espera Máxima:</strong><br>
                                <span style="color:#2980b9; font-weight:bold;">${config.waitDuration} ${config.waitUnit}</span>
                            </div>
                            <div style="padding:8px; background:#fdfefe; border:1px solid #eee;">
                                <strong>Canal:</strong><br>
                                <span>${config.channelType || 'WhatsApp'}</span>
                            </div>
                        </div>

                        <div style="margin-top:10px; font-size:0.8em; color:#7f8c8d;">
                            <p style="margin:2px 0;">• <b>Invalid Response:</b> Rama para palabras no reconocidas.</p>
                            <p style="margin:2px 0;">• <b>No Response:</b> Rama si expira el tiempo de espera.</p>
                        </div>
                    </div>
                </div>
            `;
        }
        else if (act.type === 'WHATSAPPSESSIONTRANSFERACTIVITY') {
            const config = act.configurationArguments || {};

            extraConfig = `
                <div style="background:#f0f9ff; border:1px solid #bae6fd; padding:12px; border-radius:4px; margin-top:10px; border-left: 5px solid #0ea5e9;">
                    <h5 style="margin:0 0 10px 0; color:#0369a1; font-size:0.9em; display:flex; align-items:center;">
                        WhatsApp Session Transfer
                    </h5>
                    <div style="font-size:0.85em; line-height:1.5;">
                        <p style="margin:0 0 5px 0;"><strong>WhatsApp Channel:</strong> ${config.channelName || '---'} - ${config.channelId || '---'}</p>
                        <p style="margin:0;"><strong>Mobile Number Attribute:</strong> <span style="color:#2c5282;">${config.mobileNumberAttributeName || '---'}</span></p>
                    </div>
                </div>
            `;
        }
        else if (act.type === 'SALESCLOUDACTIVITY' || act.type === 'OBJECTACTIVITY') {
            const objects = act.arguments?.objectMap?.objects || [];
            let objectsHtml = '';

            objects.forEach(obj => {
                // Mapeo de campos
                const fieldRows = (obj.fields || []).map(f => `
                    <tr>
                        <td style="padding:5px; border:1px solid #eee;"><b>${f.FieldLabel}</b> <small style="color:#666;">(${f.FieldName})</small></td>
                        <td style="padding:5px; border:1px solid #eee; color:#2980b9;">${f.FieldValueLabel || f.FieldValue}</td>
                    </tr>
                `).join('');

                // Criterios de búsqueda (Lookup)
                let lookupHtml = '';
                if (obj.lookup && obj.lookup.steps) {
                    const criteria = obj.lookup.steps.flatMap(s => s.criteria).map(c => 
                        `• ${c.FieldName} equals <b>${c.FieldValueLabel || c.FieldValue}</b>`
                    ).join('<br>');
                    
                    lookupHtml = `
                        <div style="margin-bottom:10px; padding:8px; background:#fff; border:1px solid #e2e8f0; border-radius:4px;">
                            <strong style="font-size:0.8em; color:#4a5568; text-transform:uppercase;">Identificación del Registro (Lookup):</strong><br>
                            <div style="font-size:0.9em; margin-top:4px;">${criteria}</div>
                            <div style="font-size:0.75em; color:#718096; margin-top:4px;">
                                Si hay varios: <i>${obj.lookup.MultiOutComeOption}</i> | Si no hay: <i>${obj.lookup.ZeroOutComeOption}</i>
                            </div>
                        </div>
                    `;
                }

                objectsHtml += `
                    <div style="background:#f8fafc; border:1px solid #e2e8f0; padding:12px; border-radius:4px; margin-top:10px; border-left: 5px solid #00a1e0;">
                        <div style="display:flex; justify-content:space-between; margin-bottom:10px; border-bottom:1px solid #e2e8f0; padding-bottom:5px;">
                            <span style="font-weight:bold; color:#2d3748;">Objeto: <span style="color:#00a1e0;">${obj.type}</span></span>
                            <span style="background:#edf2f7; padding:2px 8px; border-radius:10px; font-size:0.8em; font-weight:bold;">Acción: ${obj.action}</span>
                        </div>
                        
                        ${lookupHtml}

                        <h5 style="margin:10px 0 5px 0; font-size:0.85em;">Mapeo de Campos:</h5>
                        <table style="width:100%; border-collapse:collapse; font-size:0.85em; background:#fff;">
                            <thead style="background:#f1f5f9;">
                                <tr><th style="text-align:left; padding:5px; border:1px solid #eee;">Campo Salesforce</th><th style="text-align:left; padding:5px; border:1px solid #eee;">Valor / Atributo</th></tr>
                            </thead>
                            <tbody>${fieldRows}</tbody>
                        </table>
                    </div>
                `;
            });

            extraConfig = objectsHtml;
        }
        else if (act.type === 'SMSSYNC') {
            const config = act.configurationArguments || {};
            const store = act.metaData?.store || {};
            
            // Extraer el código (Short/Long code) del store si está disponible
            const code = store.messageConfiguration?.selectedCode?.code || '---';
            const optIn = config.isOptIn ? 'Suscrito a palabra clave' : 'No suscrito';
            const blackout = config.honorBlackoutWindowEnum === 1 ? 'Respetar ventana' : 'No usar ventana de exclusión';

            extraConfig = `
                <div style="background:#fff5f7; border:1px solid #fed7e2; padding:12px; border-radius:4px; margin-top:10px; border-left: 5px solid #d53f8c;">
                    <h5 style="margin:0 0 10px 0; color:#b83280; font-size:0.9em; display:flex; align-items:center;">
                        SMS MobileConnect Configuration
                    </h5>
                    <div style="display:grid; grid-template-columns: 1fr 1fr; gap: 10px; font-size:0.85em;">
                        <div><strong>Mensaje:</strong> ${act.resolvedTemplateName || '---'} (${config.assetId})</div>
                        <div><strong>Código corto/largo:</strong> ${code}</div>
                        
                        <div style="grid-column: span 2; margin-top:5px; padding-top:5px; border-top:1px dashed #fed7e2;">
                            <strong>Opciones de entrega:</strong>
                            <div style="display:grid; grid-template-columns: 1fr 1fr; margin-top:4px; color:#4a5568;">
                                <span>• Opt-In: ${optIn}</span>
                                <span>• Blackout: ${blackout}</span>
                            </div>
                            <div style="margin-top:4px;">
                                • <strong>Keyword ID:</strong> <small style="color:#718096; word-break:break-all;">${config.keywordId || '---'}</small>
                            </div>
                        </div>
                    </div>
                </div>
            `;
        }
        else if (act.type === 'PUSHINBOXACTIVITY') {
            const config = act.configurationArguments || {};
            const msgId = config.messageId || '---';
            
            // Obtenemos el stack (ej: s50) desde la configuración de la API guardada en la vista
            // Si no está disponible, dejamos un placeholder
            const stack = elements.stackKeyInput.value ? elements.stackKeyInput.value.toLowerCase() : 'sX';
            const uiLink = `https://mc.${stack}.exacttarget.com/cloud/#app/MobilePush/mobilepush/%23!/message/view/${msgId}`;

            extraConfig = `
                <div style="background:#fffcf2; border:1px solid #fef3c7; padding:12px; border-radius:4px; margin-top:10px; border-left: 5px solid #d97706;">
                    <h5 style="margin:0 0 10px 0; color:#92400e; font-size:0.9em; display:flex; align-items:center;">
                        MobilePush: Inbox Activity
                    </h5>
                    <div style="font-size:0.85em;">
                        <p style="margin:0 0 5px 0;"><strong>Message ID (Base64):</strong> ${msgId}</p>
                        <p style="margin:0;">
                            <strong>Enlace a plataforma:</strong><br>
                            <a href="${uiLink}" class="external-link" style="color:#2980b9; word-break: break-all; text-decoration: underline;">
                                Ver mensaje en MobilePush
                            </a>
                        </p>
                        <p style="margin-top:8px; font-size:0.75rem; color:#b45309; font-style:italic;">
                            * Requiere haber iniciado sesión en el Stack ${stack.toUpperCase()} previamente en el navegador.
                        </p>
                    </div>
                </div>
            `;
        }

        const innerContent = `
            <p style="font-size: 0.8rem; color: #666; margin-bottom: 8px;">
                <strong>Tipo:</strong> ${act.type} | <strong>ID:</strong> ${act.key}
            </p>
            ${extraConfig}
        `;

        const wrapper = document.createElement('div');
        wrapper.innerHTML = createCollapsibleHtml(`#${logicNumber} - ${act.name}`, innerContent, `act-${act.key}`, false);
        container.appendChild(wrapper);
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
                    logger.logMessage(`Traduciendo nombre de Data Extension destino: ${deID}...`);
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
        } 
        else if (act.type === 'EMAILV2') {
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
        else if (act.type === 'WHATSAPPACTIVITY') {
            const config = act.configurationArguments || {};
            const assetId = config.assetId;

            if (assetId && !templateCache.has(assetId)) {
                logger.logMessage(`Obteniendo nombre de plantilla WhatsApp: ${assetId}`);
                try {
                    // searchContentAssets ya maneja la búsqueda por ID exacto internamente
                    const results = await mcApiService.searchContentAssets(assetId.toString(), apiConfig);
                    const templateName = (results && results.length > 0) ? results[0].name : `ID: ${assetId}`;
                    templateCache.set(assetId, templateName);
                } catch (e) {
                    templateCache.set(assetId, `ID: ${assetId}`);
                }
            }
            act.resolvedTemplateName = templateCache.get(assetId);
        }
        else if (act.type === 'SMSSYNC') {
            const config = act.configurationArguments || {};
            const assetId = config.assetId;

            if (assetId && !templateCache.has(assetId)) {
                logger.logMessage(`Obteniendo nombre de mensaje SMS: ${assetId}`);
                try {
                    const results = await mcApiService.searchContentAssets(assetId.toString(), apiConfig);
                    const smsName = (results && results.length > 0) ? results[0].name : `ID: ${assetId}`;
                    templateCache.set(assetId, smsName);
                } catch (e) {
                    templateCache.set(assetId, `ID: ${assetId}`);
                }
            }
            act.resolvedTemplateName = templateCache.get(assetId);
        }
    }
}

function parseDecisionCriteria(act) {
    const criteria = act.configurationArguments?.criteria;
    const outcomes = act.outcomes || [];
    
    if (!criteria || Object.keys(criteria).length === 0) return '<p><i>Sin criterios configurados.</i></p>';

    let html = '<h5 style="margin: 10px 0 5px 0;">Configuración de Decisiones:</h5>';
    const parser = new DOMParser();

    // Función recursiva para reconstruir la lógica desde el XML
    const buildLogicString = (element) => {
        const operator = element.getAttribute("Operator") || "AND";
        const children = Array.from(element.children);

        const parts = children.map(child => {
            if (child.tagName === "Condition") {
                const fullKey = child.getAttribute("Key");
                // LIMPIEZA: Event.SalesforceObj[churro].Campo -> Event.Campo
                const cleanKey = fullKey.replace(/^Event\.SalesforceObj[a-f0-9]+\./i, "Event.");
                
                const op = child.getAttribute("Operator");
                const val = child.querySelector("Value")?.textContent || "---";

                // Estilo diferente si es Event (Journey Data) o Contact (Contact Data)
                const keyColor = cleanKey.startsWith("Event.") ? "#2980b9" : "#8e44ad";
                
                return `<span style="color:${keyColor}; font-weight:bold;">${cleanKey}</span> <i>${op}</i> <span style="color:#27ae60;">"${val}"</span>`;
            } else if (child.tagName === "ConditionSet") {
                return `(<span style="padding:0 2px;">${buildLogicString(child)}</span>)`;
            }
        }).filter(Boolean);

        return parts.join(` <b style="color:#d35400; font-size:0.75rem;">${operator}</b> `);
    };

    for (const [pathKey, xmlString] of Object.entries(criteria)) {
        const outcome = outcomes.find(o => o.key === pathKey);
        const branchLabel = outcome?.metaData?.label || pathKey;
        
        try {
            const xmlDoc = parser.parseFromString(xmlString, "text/xml");
            const rootSet = xmlDoc.querySelector("ConditionSet");
            const logicHtml = rootSet ? buildLogicString(rootSet) : 'Sin lógica definida';

            html += `
                <div style="margin-bottom:12px; padding:12px; background:#fff; border:1px solid #d6dbdf; border-left:4px solid #5499c7; border-radius:4px; font-family: sans-serif;">
                    <strong style="color:#1b4f72; display:block; margin-bottom:8px; border-bottom:1px solid #f1f1f1; padding-bottom:4px;">Rama: ${branchLabel}</strong>
                    <div style="font-size:0.85rem; color:#2c3e50; line-height:1.8;">
                        ${logicHtml}
                    </div>
                </div>
            `;
        } catch (e) {
            html += `<p style="color:red;">Error parseando XML en rama ${branchLabel}</p>`;
        }
    }

    // Rama Resto
    const remainder = outcomes.find(o => o.key === 'remainder_path');
    if (remainder) {
        html += `
            <div style="padding:10px; background:#fdfefe; border:1px solid #d6dbdf; border-left:4px solid #abb2b9; border-radius:4px;">
                <strong style="color:#566573;">Rama: ${remainder.metaData?.label || 'Resto'}</strong><br>
                <small style="color:#7f8c8d;">Cualquier contacto que no cumpla los criterios anteriores.</small>
            </div>
        `;
    }

    return html;
}

/**
 * Convierte el XML de criterios en un string legible con limpieza de Salesforce IDs
 */
function parseXmlToLogic(xmlString) {
    if (!xmlString) return "Sin configuración";
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlString, "text/xml");
    const rootSet = xmlDoc.querySelector("ConditionSet");

    const processElement = (element) => {
        const operator = element.getAttribute("Operator") || "AND";
        const parts = Array.from(element.children).map(child => {
            if (child.tagName === "Condition") {
                const fullKey = child.getAttribute("Key");
                // Limpieza del churro de Salesforce
                const cleanKey = fullKey.replace(/^Event\.SalesforceObj[a-f0-9]+\./i, "Event.");
                const op = child.getAttribute("Operator");
                const val = child.querySelector("Value")?.textContent || "";
                
                // Color para Journey Data vs Contact Data
                const color = cleanKey.startsWith("Event.") ? "#2980b9" : "#8e44ad";
                return `<span style="color:${color}; font-weight:bold;">${cleanKey}</span> <i>${op}</i> <span style="color:#27ae60;">"${val}"</span>`;
            } else if (child.tagName === "ConditionSet") {
                return `(${processElement(child)})`;
            }
        }).filter(Boolean);
        return parts.join(` <b style="color:#d35400; font-size:0.75rem;">${operator}</b> `);
    };

    return rootSet ? processElement(rootSet) : "Criterio no definido";
}

/**
 * Lógica para identificar el tipo de entrada y recuperar sus nombres reales
 */
async function resolveEntrySource(journey, apiConfig) {
    const trigger = journey.triggers?.[0];
    if (!trigger) return;

    logger.logMessage(`Resolviendo fuente de entrada: ${trigger.type}...`);

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
    else if (trigger.type === 'SalesforceObjectTriggerV2' || trigger.type === 'SalesforceObjectTrigger') {
        const ca = eventDef?.configurationArguments || {};
        const schema = eventDef?.schema || {};

        // Formateamos los campos seleccionados (vienen separados por ;) para que no sea un bloque ilegible
        const fieldsFormatted = ca.eventDataSummary 
            ? ca.eventDataSummary.split(';').map(f => f.trim()).filter(f => f).join(', ') 
            : '---';

        journey.entryDetails.summary = `
            <div><b>Data Extension:</b> ${eventDef?.dataExtensionName || '---'}</div>    
            <div><b>Objeto:</b> ${ca.objectAPIName || '---'}</div>
            <div><b>Criterio:</b> ${ca.salesforceTriggerCriteria || '---'}</div>
            <div><b>¿A quién enviar?:</b> ${schema.sendableCustomObjectField || '---'} (${ca.contactPersonType || '---'})</div>            
            <div style="margin-top:5px;"><b>Filtro Objeto Principal:</b><br>${ca.primaryObjectFilterSummary || 'Sin filtros'}</div>
            <div style="margin-top:5px;"><b>Filtros Objetos Relacionados:</b><br>${ca.relatedObjectFilterSummary || 'Sin filtros'}</div>
            <div style="margin-top:5px;"><b>Campos seleccionados:</b><br><small>${fieldsFormatted}</small></div>
        `;
    }
}

function renderHeader(j) {
    const definitionKey = j.definitionKey || j.key || 'No disponible';
    const innerHtml = `
        <div style="display: grid; grid-template-columns: 300px 1fr; gap: 30px; align-items: start;">
            <div style="border-right: 1px solid #f0f3f7; padding-right: 10px;">
                <p style="margin:0 0 5px 0;"><strong>Versión:</strong> ${j.version}</p>
                <p style="margin:0 0 5px 0;"><strong>Estado:</strong> <span class="status-badge">${j.status}</span></p>
                <p style="margin:0 0 5px 0;"><strong>Creado:</strong> ${new Date(j.createdDate).toLocaleString()}</p>
                <p style="margin:0 0 5px 0;"><strong>Modificado:</strong> ${new Date(j.modifiedDate).toLocaleString()}</p>
                <p style="margin:0; font-size:0.8rem; color:#666; word-break: break-all;"><strong>Key:</strong> ${definitionKey}</p>
            </div>
            <div>
                <p style="margin:0 0 8px 0; font-size:0.9rem;"><strong>Tipo:</strong> ${j.entryDetails.type}</p>
                <div style="margin:0; font-size:0.85rem; color:#444; line-height:1.6;">${j.entryDetails.summary}</div>
            </div>
        </div>
    `;
    elements.journeyAnalyzerHeaderWrapper.innerHTML = createCollapsibleHtml("Identificación y Configuración de Entrada", innerHtml, "header", true);
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
            .replace(/🔴/g,  '[FIN]')
            .replace(/%/g,   '') 
            .replace(/Ø=Ý4/g, '')
            .trim();
    };

    // --- TÍTULO PRINCIPAL ---
    doc.setFontSize(14).setTextColor(40, 116, 166).setFont("helvetica", "bold");
    const splitTitle = doc.splitTextToSize(`Journey: ${j.name.trim()}`, 180);
    doc.text(splitTitle, 10, currentY);
    currentY += (splitTitle.length * 7);

    // --- BLOQUE 1: IDENTIFICACIÓN Y ENTRADA ---
    const entry = j.entryDetails || { type: 'Desconocido', summary: '' };
    
    // Extraemos texto limpio del summary (sin HTML)
    const entryLines = entry.summary
    .replace(/<br\s*\/?>/gi, '\n')        // Convierte <br> en saltos de línea
    .replace(/<\/div>/gi, '\n')         // Convierte cierres de </div> en saltos de línea
    .replace(/<[^>]+>/g, '')            // ELIMINA CUALQUIER OTRA ETIQUETA (incluye <small>, <span>, etc.)
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

    // --- BLOQUE: GOALS Y EXITS (PDF) ---
    if ((j.goals?.length > 0 && j.goals[0].configurationArguments?.criteria) || 
        (j.exits?.length > 0 && j.exits[0].configurationArguments?.criteria)) {
        
        const globalsBody = [];

        if (j.goals?.[0]?.configurationArguments?.criteria) {
            const g = j.goals[0];
            const goalText = parseXmlToLogic(g.configurationArguments.criteria).replace(/<[^>]+>/g, '');
            globalsBody.push([{ content: `🎯 GOAL: ${g.name}`, styles: { fontStyle: 'bold', textColor: [230, 126, 34] } }]);
            globalsBody.push([`Meta: ${g.metaData?.conversionValue}${g.metaData?.conversionUnit} | Sale al cumplir: ${g.metaData?.isExitCriteria ? 'Sí' : 'No'}`]);
            globalsBody.push([goalText]);
        }

        if (j.exits?.[0]?.configurationArguments?.criteria) {
            const e = j.exits[0];
            const exitText = parseXmlToLogic(e.configurationArguments.criteria).replace(/<[^>]+>/g, '');
            globalsBody.push([{ content: `🚪 EXIT CRITERIA`, styles: { fontStyle: 'bold', textColor: [192, 57, 43] } }]);
            globalsBody.push([exitText]);
        }

        doc.autoTable({
            startY: currentY,
            margin: { left: 10, right: 10 },
            theme: 'grid',
            styles: { font: 'NotoSans', fontSize: 8 },
            body: globalsBody
        });
        currentY = doc.lastAutoTable.finalY + 10;
    }

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

            const buildLogicTextForPdf = (element) => {
                const operator = element.getAttribute("Operator") || "AND";
                const parts = Array.from(element.children).map(child => {
                    if (child.tagName === "Condition") {
                        const key = child.getAttribute("Key").replace(/^Event\.SalesforceObj[a-f0-9]+\./i, "Event.");
                        const op = child.getAttribute("Operator");
                        const val = child.querySelector("Value")?.textContent || "";
                        return `${key} ${op} "${val}"`;
                    } else if (child.tagName === "ConditionSet") {
                        return `(${buildLogicTextForPdf(child)})`;
                    }
                }).filter(Boolean);
                return parts.join(` ${operator} `);
            };

            for (const [pathKey, xml] of Object.entries(criteria)) {
                const outcome = act.outcomes.find(o => o.key === pathKey);
                const label = outcome?.metaData?.label || pathKey;
                try {
                    const xmlDoc = parser.parseFromString(xml, "text/xml");
                    const rootSet = xmlDoc.querySelector("ConditionSet");
                    const logicText = rootSet ? buildLogicTextForPdf(rootSet) : '---';
                    tableBody.push([`Rama: ${label}`, logicText]);
                } catch (e) {
                    tableBody.push([`Rama: ${label}`, "Error parseando criterios"]);
                }
            }
            
            const remainder = act.outcomes.find(o => o.key === 'remainder_path');
            if (remainder) {
                tableBody.push([`Rama: ${remainder.metaData?.label || 'Resto'}`, "Cualquier contacto que no cumpla los criterios anteriores."]);
            }
        }

        // 3. ENGAGEMENT SPLIT
        else if (act.type === 'ENGAGEMENTDECISION') {
            const config = act.configurationArguments || {};
            const stats = { 2: "Apertura (Open)", 3: "Clic (Click)", 6: "Rebote (Bounce)" };
            const typeLabel = stats[config.statsTypeId] || `Tipo ${config.statsTypeId}`;
            const refEmail = act.metaData?.refActivityName || config.refActivityCustomerKey || '---';

            tableBody.push([{ content: "DETALLES DE INTERACCIÓN", colSpan: 2, styles: { fillColor: [240, 240, 240], halign: 'center', fontStyle: 'bold' } }]);
            tableBody.push(["Evento esperado:", typeLabel]);
            tableBody.push(["Email Ref.:", refEmail]);

            // Añadir URLs si es un split por Clic
            if (config.statsTypeId === 3 && config.engagementUrls?.urls?.length > 0) {
                const urlsFormatted = config.engagementUrls.urls
                    .map(u => typeof u === 'string' ? u : (u.alias || u.url))
                    .join('\n');
                tableBody.push(["URLs monitoreadas:", urlsFormatted]);
            }
        }

        // 4. UPDATE CONTACT
        else if (act.type === 'UPDATECONTACTDATA') {
            const fields = act.arguments?.activityData?.updateContactFields || [];
            tableBody.push([{ content: `DESTINO: ${act.resolvedDeName || '---'}`, colSpan: 2, styles: { fillColor: [240, 240, 240], halign: 'center', fontStyle: 'bold' } }]);
            fields.forEach(f => {
                tableBody.push([f.resolvedFieldName || f.field, String(f.value === 0 ? "0" : (f.value || "vacío"))]);
            });
        }
        // 5. EISNTEIN SPLIT
        else if (act.type === 'MULTICRITERIADECISIONEXTENSION') {
            const meta = act.metaData || {};
            
            // Info específica de Einstein al inicio
            tableBody.push(["Canal Einstein:", meta.channel?.toUpperCase() || '---']);
            tableBody.push(["Tipo de Split:", meta.splitType?.toUpperCase() || '---']);
            
            const paths = meta.pathsAdded ? Object.keys(meta.pathsAdded).join(', ') : '---';
            tableBody.push(["Paths activos:", paths]);

            tableBody.push([{ content: "CRITERIOS DE PREDICCIÓN EINSTEIN", colSpan: 2, styles: { fillColor: [240, 240, 240], halign: 'center', fontStyle: 'bold' } }]);
            
            const criteria = act.configurationArguments?.criteria || {};
            const parser = new DOMParser();

            for (const [pathKey, xml] of Object.entries(criteria)) {
                const outcome = act.outcomes.find(o => o.key === pathKey);
                // Usamos el mismo mapeo de etiquetas amigables
                const label = EINSTEIN_PROBABILITY_MAP[outcome?.metaData?.i18nLabel] || outcome?.metaData?.label || pathKey;
                
                try {
                    const xmlDoc = parser.parseFromString(xml, "text/xml");
                    const operator = xmlDoc.querySelector("ConditionSet")?.getAttribute("Operator") || "AND";
                    const conditions = Array.from(xmlDoc.querySelectorAll("Condition")).map(c => {
                        const val = c.querySelector("Value")?.textContent || "";
                        return `• ${c.getAttribute("Key")} ${c.getAttribute("Operator")} "${val}"`;
                    });
                    tableBody.push([`Rama: ${label}`, `Lógica: ${operator}\n${conditions.join('\n')}`]);
                } catch (e) { tableBody.push([`Rama: ${label}`, "Error al procesar criterio"]); }
            }

            // Rama por defecto
            const remainderOutcome = act.outcomes.find(o => o.key.toLowerCase().includes('remainder'));
            const remainderLabel = EINSTEIN_PROBABILITY_MAP[remainderOutcome?.metaData?.i18nLabel] || 'Resto / Remainder';
            tableBody.push([`Rama: ${remainderLabel}`, "Contactos que no cumplen las probabilidades anteriores."]);
        }
        // 6. PATH OPTIMIZER
        else if (act.type === 'ABNTEST' || act.type === 'ABNTESTSTOP') {
            const config = act.configurationArguments || {};
            const metricMap = { 'Clicks': 'Click Rate', 'Opens': 'Open Rate', 'Unsubscribes': 'Unsubscribe Rate' };

            tableBody.push([{ content: "EVALUACIÓN DEL GANADOR", colSpan: 2, styles: { fillColor: [240, 240, 240], halign: 'center', fontStyle: 'bold' } }]);
            tableBody.push(["Método de Selección:", config.winnerEvaluationType === 'Engagement' ? 'Email Engagement' : 'Manual']);
            tableBody.push(["Métrica Ganadora:", metricMap[config.engagementWinnerMetric] || config.engagementWinnerMetric]);
            tableBody.push(["Periodo Evaluación:", `${config.engagementPeriod} ${config.engagementPeriodUnits}`]);
            tableBody.push(["Holdback (Retención):", `${config.holdBackPercentage || config.holdbackPercentage || 0}%`]);

            if (act.type === 'ABNTEST') {
                tableBody.push([{ content: "DISTRIBUCIÓN DE PRUEBA", colSpan: 2, styles: { fillColor: [240, 240, 240], halign: 'center', fontStyle: 'bold' } }]);
                act.outcomes.forEach(o => {
                    tableBody.push([o.metaData?.pathName || o.metaData?.label || "Path", `${o.arguments?.percentage}%`]);
                });
            }
        }
        else if (act.type === 'STOWAIT') {
            const params = act.configurationArguments?.params || {};
            
            tableBody.push([{ 
                content: "CONFIGURACIÓN EINSTEIN STO", 
                colSpan: 2, 
                styles: { fillColor: [240, 240, 240], halign: 'center', fontStyle: 'bold' } 
            }]);
            
            tableBody.push(["Ventana de tiempo:", `${params.slidingWindowHours || '---'} horas`]);
            tableBody.push(["Envío aleatorio:", params.enableRandomTime ? "Activado" : "Desactivado"]);
        }
        else if (act.type.startsWith('WAIT')) {
            const config = act.configurationArguments || {};
            let waitInfo = '---';

            if (config.specificDate) {
                waitInfo = `Hasta fecha: ${config.specificDate} ${config.specifiedTime || ''} (${config.timeZone || ''})`;
            } else if (config.waitDuration) {
                waitInfo = `${config.waitDuration} ${config.waitUnit || ''}`;
            } else if (config.waitEndDateAttributeExpression) {
                waitInfo = `Atributo: ${config.waitEndDateAttributeExpression}`;
            }

            tableBody.push(["Config. Espera:", waitInfo]);
        }
        else if (act.type === 'EINSTEINENGAGEMENTFREQUENCYSPLIT') {
            const params = act.configurationArguments?.params || {};
            const delta = params.almostSaturated?.delta || 0;

            tableBody.push([{ 
                content: "CONFIGURACIÓN EINSTEIN FREQUENCY", 
                colSpan: 2, 
                styles: { fillColor: [240, 240, 240], halign: 'center', fontStyle: 'bold' } 
            }]);

            tableBody.push(["Canal:", params.type?.toUpperCase() || 'EMAIL']);
            tableBody.push(["Umbral Casi Saturado:", `Saturación en ${delta} emails`]);
            
            // Listado de ramas
            const branches = act.outcomes.map(o => {
                const type = o.arguments?.splitResult || 'remainder';
                return type === 'almostsaturated' ? `Almost Saturated (Contact reaches saturation limit in ${delta}) emails` : type;
            }).join('\n');
            
            tableBody.push(["Caminos configurados:", branches]);
        }
        else if (act.type === 'WHATSAPPACTIVITY') {
            const config = act.configurationArguments || {};
            
            tableBody.push([{ 
                content: "MENSAJERÍA WHATSAPP", 
                colSpan: 2, 
                styles: { fillColor: [240, 240, 240], halign: 'center', fontStyle: 'bold' } 
            }]);

            tableBody.push(["Canal ID:", config.channelId || '---']);
            tableBody.push(["Atributo Móvil:", config.mobileNumberAttributeName || '---']);
            tableBody.push(["Prioridad Envío:", config.messagePriority || 'Anytime']);

            // Ventana de bloqueo para el PDF
            let blockoutText = 'No configurada';
            try {
                if (config.blockoutWindows) {
                    const windows = JSON.parse(config.blockoutWindows);
                    if (windows.length > 0) {
                        blockoutText = windows.map(w => `${w.startTime} - ${w.endTime} (${w.timezone})`).join('\n');
                    }
                }
            } catch (e) { }
            
            tableBody.push(["Blockout Window:", blockoutText]);
            tableBody.push(["Asset ID:", String(config.assetId || '---')]);
        }
        else if (act.type === 'WAITUNTILCHATRESPONSE') {
            const config = act.configurationArguments || {};
            
            tableBody.push([{ 
                content: "ESPERA DE RESPUESTA (CHAT ENGAGEMENT)", 
                colSpan: 2, 
                styles: { fillColor: [240, 240, 240], halign: 'center', fontStyle: 'bold' } 
            }]);

            // Keywords para el PDF
            let keywordsText = 'No configuradas';
            try {
                if (config.keywords) {
                    const kwList = JSON.parse(config.keywords);
                    keywordsText = kwList.map(k => `• ${k.operator}: "${k.keyword}"`).join('\n');
                }
            } catch (e) { }

            tableBody.push(["Keywords configuradas:", keywordsText]);
            tableBody.push(["Duración Máxima:", `${config.waitDuration} ${config.waitUnit}`]);
            tableBody.push(["Canal:", config.channelType || 'WhatsApp']);
            tableBody.push(["Ramas por defecto:", "Invalid Response (No match)\nNo Response (Timeout)"]);
        }
        else if (act.type === 'WHATSAPPSESSIONTRANSFERACTIVITY') {
            const config = act.configurationArguments || {};
            
            tableBody.push([{ 
                content: "TRANSFERENCIA DE SESIÓN WHATSAPP", 
                colSpan: 2, 
                styles: { fillColor: [240, 240, 240], halign: 'center', fontStyle: 'bold' } 
            }]);

            tableBody.push(["Canal Destino:", `${config.channelName || '---'} (${config.channelId || '---'})`]);
            tableBody.push(["Atributo Móvil:", config.mobileNumberAttributeName || '---']);
            tableBody.push(["Tipo:", config.channelType || 'WhatsApp']);
        }
        else if (act.type === 'SALESCLOUDACTIVITY' || act.type === 'OBJECTACTIVITY') {
            const objects = act.arguments?.objectMap?.objects || [];

            objects.forEach(obj => {
                tableBody.push([{ 
                    content: `ACCION SALESFORCE: ${obj.action} ${obj.type}`, 
                    colSpan: 2, 
                    styles: { fillColor: [0, 161, 224], textColor: 255, halign: 'center', fontStyle: 'bold' } 
                }]);

                // Detalles de identificación (Lookup)
                if (obj.lookup && obj.lookup.steps) {
                    const criteria = obj.lookup.steps.flatMap(s => s.criteria)
                        .map(c => `${c.FieldName} == ${c.FieldValueLabel || c.FieldValue}`)
                        .join(', ');
                    tableBody.push(["Identificación (Lookup):", criteria]);
                }

                // Mapeo de campos
                tableBody.push([{ content: "MAPEO DE CAMPOS", colSpan: 2, styles: { fillColor: [240, 240, 240], halign: 'center', fontStyle: 'bold' } }]);
                
                (obj.fields || []).forEach(f => {
                    tableBody.push([
                        `${f.FieldLabel} (${f.FieldName})`, 
                        String(f.FieldValueLabel || f.FieldValue || '---')
                    ]);
                });
            });
        }
        else if (act.type === 'SMSSYNC') {
            const config = act.configurationArguments || {};
            const store = act.metaData?.store || {};
            const code = store.messageConfiguration?.selectedCode?.code || '---';

            tableBody.push([{ 
                content: "CONFIGURACIÓN SMS (MOBILECONNECT)", 
                colSpan: 2, 
                styles: { fillColor: [240, 240, 240], halign: 'center', fontStyle: 'bold' } 
            }]);

            tableBody.push(["Mensaje:", `${act.resolvedTemplateName || '---'} (${config.assetId})`]);
            tableBody.push(["Código:", code]);
            tableBody.push(["Keyword ID:", config.keywordId || '---']);
            tableBody.push(["Suscripción (Opt-In):", config.isOptIn ? "Sí" : "No"]);
            tableBody.push(["Blackout Window:", config.honorBlackoutWindowEnum === 1 ? "Respetar" : "Ignorar"]);
        }
        else if (act.type === 'PUSHINBOXACTIVITY') {
            const config = act.configurationArguments || {};
            const stack = elements.stackKeyInput.value ? elements.stackKeyInput.value.toLowerCase() : 'sX';
            const uiLink = `https://mc.${stack}.exacttarget.com/cloud/#app/MobilePush/mobilepush/%23!/message/view/${config.messageId}`;

            tableBody.push([{ 
                content: "MENSAJERÍA PUSH INBOX", 
                colSpan: 2, 
                styles: { fillColor: [240, 240, 240], halign: 'center', fontStyle: 'bold' } 
            }]);

            tableBody.push(["Message ID:", config.messageId || '---']);
            tableBody.push(["URL de Acceso:", uiLink]);
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

    doc.save(`Docu_Journey_${j.name.replace(/[^a-zA-Z0-9]/g, '_')}.pdf`);
}


function bulkToggle(expand) {
    const collapsibles = document.querySelectorAll('.analyzer-collapsible');
    collapsibles.forEach(container => {
        const content = container.querySelector('.analyzer-collapsible-content');
        const icon = container.querySelector('.analyzer-icon');
        
        if (expand) {
            container.classList.add('active');
            content.style.maxHeight = "none";
            icon.textContent = '▼';
        } else {
            container.classList.remove('active');
            content.style.maxHeight = "0";
            icon.textContent = '▶';
        }
    });
}

function createCollapsibleHtml(title, content, id, isExpanded = false) {
    return `
        <div class="analyzer-collapsible ${isExpanded ? 'active' : ''}" id="container-${id}">
            <div class="analyzer-collapsible-header">
                <span>${title}</span>
                <span class="analyzer-icon">${isExpanded ? '▼' : '▶'}</span>
            </div>
            <div class="analyzer-collapsible-content" style="max-height: ${isExpanded ? 'none' : '0'};">
                <div style="padding: 15px; background: #fff; border: 1px solid #e2e8f0; border-top: none;">
                    ${content}
                </div>
            </div>
        </div>
    `;
}

function initCollapsibleListeners() {
    const headers = document.querySelectorAll('.analyzer-collapsible-header');
    headers.forEach(header => {
        header.onclick = function() {
            const parent = this.parentElement;
            const content = this.nextElementSibling;
            const icon = this.querySelector('.analyzer-icon');
            const isOpen = parent.classList.contains('active');
            
            if (isOpen) {
                parent.classList.remove('active');
                content.style.maxHeight = "0";
                icon.textContent = '▶';
            } else {
                parent.classList.add('active');
                content.style.maxHeight = "none";
                icon.textContent = '▼';
            }
        };
    });
}


async function generateWord() {
    if (!currentJourneyDetails) return;

    const docxLib = window.docx;
    if (!docxLib) {
        ui.showCustomAlert("La librería de Word no se ha cargado. Verifica la conexión.");
        return;
    }

    ui.blockUI("Generando documento Word completo...");

    const { 
        Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, 
        WidthType, AlignmentType, HeadingLevel, ShadingType, BorderStyle, VerticalAlign
    } = docxLib;
    
    const j = currentJourneyDetails;

    // --- HELPERS DE FORMATO Y ESTILO ---
    const clean = (text) => {
        if (!text) return "";
        return String(text)
            .replace(/<br\s*\/?>/gi, '\n')
            .replace(/<\/div>/gi, '\n')
            .replace(/<[^>]+>/g, '')
            .split('\n')
            .map(line => line.trim())
            .filter(line => line !== '')
            .join('\n');
    };

    // Celda fusionada para Títulos de Actividad y Sub-encabezados
    const createMergedHeaderCell = (text, color = "558AC7", fontSize = 20) => new TableCell({
        children: [new Paragraph({ 
            children: [new TextRun({ text, color: "000000", bold: true, size: fontSize })],
            alignment: AlignmentType.CENTER
        })],
        columnSpan: 2,
        shading: { fill: color, type: ShadingType.CLEAR },
        verticalAlign: VerticalAlign.CENTER,
        padding: { top: 80, bottom: 80 }
    });

    // Celda para etiquetas (Gris - Izquierda)
    const createLabelCell = (text) => new TableCell({
        children: [new Paragraph({ children: [new TextRun({ text, bold: true, size: 18 })] })],
        width: { size: 35, type: WidthType.PERCENTAGE },
        shading: { fill: "F2F2F2" },
        padding: { left: 100, top: 50, bottom: 50 }
    });

    // Celda para valores (Blanco - Derecha)
    const createValueCell = (text) => {
        const safeText = String(text !== null && text !== undefined ? text : "");
        return new TableCell({
            children: safeText.split('\n').map(line => new Paragraph({ 
                children: [new TextRun({ text: line, size: 18 })] 
            })),
            width: { size: 65, type: WidthType.PERCENTAGE },
            padding: { left: 100, top: 50, bottom: 50 }
        });
    };

    const children = [];

    // 1. TÍTULO PRINCIPAL
    children.push(new Paragraph({
        text: `Análisis de Journey: ${j.name.trim()}`,
        heading: HeadingLevel.HEADING_1,
        alignment: AlignmentType.LEFT,
        spacing: { after: 400 }
    }));

    // 2. IDENTIFICACIÓN Y ENTRADA
    children.push(new Paragraph({ text: "IDENTIFICACIÓN Y FUENTE DE ENTRADA", heading: HeadingLevel.HEADING_2, spacing: { before: 400, after: 200 } }));
    children.push(new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: [
            new TableRow({ children: [createMergedHeaderCell("DATOS GENERALES", "34495E", 18)] }),
            new TableRow({ children: [createLabelCell("Versión / Estado"), createValueCell(`${j.version} - ${j.status}`)] }),
            new TableRow({ children: [createLabelCell("Definition Key"), createValueCell(j.definitionKey || j.key)] }),
            new TableRow({ children: [createLabelCell("Tipo Entrada"), createValueCell(j.entryDetails.type)] }),
            new TableRow({ children: [createLabelCell("Configuración"), createValueCell(clean(j.entryDetails.summary))] }),
        ]
    }));

    // 3. CONFIGURACIONES GLOBALES (GOALS / EXITS)
    if ((j.goals && j.goals.length > 0) || (j.exits && j.exits.length > 0)) {
        const globalRows = [];
        if (j.goals?.[0]?.configurationArguments?.criteria) {
            const g = j.goals[0];
            const unit = g.metaData?.conversionUnit === 'percentage' ? '%' : g.metaData?.conversionUnit || '';
            globalRows.push(new TableRow({ children: [createMergedHeaderCell(`🎯 GOAL: ${g.name}`, "E67E22", 18)] }));
            globalRows.push(new TableRow({ children: [createLabelCell("Meta"), createValueCell(`${g.metaData?.conversionValue || ''}${unit}`)] }));
            globalRows.push(new TableRow({ children: [createLabelCell("Lógica"), createValueCell(clean(parseXmlToLogic(g.configurationArguments.criteria)))] }));
        }
        if (j.exits?.[0]?.configurationArguments?.criteria) {
            globalRows.push(new TableRow({ children: [createMergedHeaderCell("🚪 EXIT CRITERIA", "C0392B", 18)] }));
            globalRows.push(new TableRow({ children: [createLabelCell("Lógica"), createValueCell(clean(parseXmlToLogic(j.exits[0].configurationArguments.criteria)))] }));
        }
        if (globalRows.length > 0) {
            children.push(new Paragraph({ text: "CONFIGURACIONES GLOBALES", heading: HeadingLevel.HEADING_2, spacing: { before: 400, after: 200 } }));
            children.push(new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: globalRows }));
        }
    }

    // 4. FLUJO LÓGICO
    children.push(new Paragraph({ text: "FLUJO LÓGICO", heading: HeadingLevel.HEADING_2, spacing: { before: 400, after: 200 } }));
    const flowTextFormatted = j.flowText.replace(/└─/g, '\\--').replace(/├─/g, '|--').replace(/│/g, '|  ').replace(/➡️/g, '->').replace(/🔴/g, '(Fin)');
    children.push(new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: [new TableRow({ children: [new TableCell({ 
            children: flowTextFormatted.split('\n').map(l => new Paragraph({ children: [new TextRun({ text: l, font: "Courier New", size: 14 })], spacing: { before: 0, after: 0 } })),
            shading: { fill: "F8F9FA" }, padding: { top: 200, bottom: 200, left: 200 } 
        })] })]
    }));

    // 5. ACTIVIDADES
    children.push(new Paragraph({ text: "DETALLE DE ACTIVIDADES", heading: HeadingLevel.HEADING_2, spacing: { before: 600, after: 200 } }));

    const flowActivities = j.activities.filter(act => j.numberMap.has(act.key)).sort((a, b) => j.numberMap.get(a.key) - j.numberMap.get(b.key));

    for (const act of flowActivities) {
        const num = j.numberMap.get(act.key);
        const rows = [
            new TableRow({ children: [createMergedHeaderCell(`#${num} - ${act.name}`, "558AC7", 20)] }),
            new TableRow({ children: [createLabelCell("Tipo"), createValueCell(act.type)] }),
        ];

        // --- IMPACTO (COMPARTIDA) ---
        const isShared = act.otherUsages && act.otherUsages.length > 0;
        if (isShared) {
            const list = act.otherUsages.map(u => `• ${u.automationName} (Paso: ${u.step})`).join('\n');
            rows.push(new TableRow({ children: [createLabelCell("Impacto"), createValueCell(`COMPARTIDA en:\n${list}`)] }));
        }

        // --- LÓGICA POR ACTIVIDAD ---
        if (act.type === 'EMAILV2') {
            const ts = act.configurationArguments?.triggeredSend || {};
            rows.push(new TableRow({ children: [createMergedHeaderCell("DETALLES DEL ENVÍO", "E9ECEF", 18)] }));
            rows.push(new TableRow({ children: [createLabelCell("Email ID"), createValueCell(ts.emailId)] }));
            rows.push(new TableRow({ children: [createLabelCell("Asunto"), createValueCell(ts.emailSubject)] }));
            rows.push(new TableRow({ children: [createLabelCell("Preheader"), createValueCell(ts.preHeader || '---')] }));
            rows.push(new TableRow({ children: [createLabelCell("Clasificación"), createValueCell(act.resolvedSendClassification || ts.sendClassificationId)] }));
            rows.push(new TableRow({ children: [createLabelCell("Lista"), createValueCell(act.resolvedListName || (ts.publicationListId === 0 ? "All Subscribers" : ts.publicationListId))] }));
        }
        else if (act.type.includes('MULTICRITERIA')) {
            rows.push(new TableRow({ children: [createMergedHeaderCell("CRITERIOS DE DECISIÓN", "E9ECEF", 18)] }));
            const criteria = act.configurationArguments?.criteria || {};
            for (const [key, xml] of Object.entries(criteria)) {
                const outcome = act.outcomes.find(o => o.key === key);
                const label = outcome?.metaData?.label || key;
                rows.push(new TableRow({ children: [createLabelCell(`Rama: ${label}`), createValueCell(clean(outcome?.metaData?.criteriaDescription || parseXmlToLogic(xml)))] }));
            }
            const remainder = act.outcomes.find(o => o.key === 'remainder_path');
            if (remainder) rows.push(new TableRow({ children: [createLabelCell("Rama: Resto"), createValueCell("Cualquier contacto que no cumpla los criterios anteriores.")] }));
        }
        else if (act.type === 'ENGAGEMENTDECISION') {
            const config = act.configurationArguments || {};
            const stats = { 2: "Apertura (Open)", 3: "Clic (Click)", 6: "Rebote (Bounce)" };
            rows.push(new TableRow({ children: [createMergedHeaderCell("DETALLES DE INTERACCIÓN", "E9ECEF", 18)] }));
            rows.push(new TableRow({ children: [createLabelCell("Evento esperado"), createValueCell(stats[config.statsTypeId] || config.statsTypeId)] }));
            rows.push(new TableRow({ children: [createLabelCell("Email Ref."), createValueCell(act.metaData?.refActivityName || '---')] }));
            if (config.engagementUrls?.urls?.length > 0) {
                const urlList = config.engagementUrls.urls.map(u => typeof u === 'string' ? u : (u.alias || u.url)).join('\n');
                rows.push(new TableRow({ children: [createLabelCell("URLs monitoreadas"), createValueCell(urlList)] }));
            }
        }
        else if (act.type === 'UPDATECONTACTDATA') {
            const fields = act.arguments?.activityData?.updateContactFields || [];
            rows.push(new TableRow({ children: [createLabelCell("Data Extension"), createValueCell(act.resolvedDeName || '---')] }));
            const mapping = fields.map(f => `${f.resolvedFieldName || f.field}: ${f.value === 0 ? "0" : (f.value || "vacío")}`).join('\n');
            rows.push(new TableRow({ children: [createLabelCell("Mapeo Atributos"), createValueCell(mapping)] }));
        }
        else if (act.type === 'WHATSAPPACTIVITY') {
            const config = act.configurationArguments || {};
            rows.push(new TableRow({ children: [createMergedHeaderCell("CONFIGURACIÓN WHATSAPP", "E9ECEF", 18)] }));
            rows.push(new TableRow({ children: [createLabelCell("Plantilla"), createValueCell(`${act.resolvedTemplateName || ''} (${config.assetId})`)] }));
            rows.push(new TableRow({ children: [createLabelCell("Canal"), createValueCell(config.channelId)] }));
            rows.push(new TableRow({ children: [createLabelCell("Timing"), createValueCell(config.messagePriority)] }));
        }
        else if (act.type === 'SALESCLOUDACTIVITY' || act.type === 'OBJECTACTIVITY') {
            const objects = act.arguments?.objectMap?.objects || [];
            objects.forEach(obj => {
                rows.push(new TableRow({ children: [createMergedHeaderCell(`SALESFORCE: ${obj.action} ${obj.type}`, "E9ECEF", 18)] }));
                if (obj.lookup?.steps) {
                    const lookup = obj.lookup.steps.flatMap(s => s.criteria).map(c => `${c.FieldName} == ${c.FieldValueLabel || c.FieldValue}`).join('\n');
                    rows.push(new TableRow({ children: [createLabelCell("Lookup (Iden.)"), createValueCell(lookup)] }));
                }
                const mapping = (obj.fields || []).map(f => `${f.FieldLabel} (${f.FieldName}): ${f.FieldValueLabel || f.FieldValue}`).join('\n');
                rows.push(new TableRow({ children: [createLabelCell("Mapeo Campos"), createValueCell(mapping)] }));
            });
        }
        else if (act.type === 'RANDOMSPLIT') {
            rows.push(new TableRow({ children: [createMergedHeaderCell("DISTRIBUCIÓN PROBABILÍSTICA", "E9ECEF", 18)] }));
            const dist = act.outcomes.map(o => `${o.metaData?.label || o.key}: ${o.arguments?.percentage}%`).join('\n');
            rows.push(new TableRow({ children: [createLabelCell("Porcentajes"), createValueCell(dist)] }));
        }
        else if (act.type === 'STOWAIT') {
            const p = act.configurationArguments?.params || {};
            rows.push(new TableRow({ children: [createLabelCell("Einstein STO"), createValueCell(`Ventana: ${p.slidingWindowHours} horas\nAleatorio: ${p.enableRandomTime ? 'Sí' : 'No'}`)] }));
        }
        else if (act.type.startsWith('WAIT')) {
            const c = act.configurationArguments || {};
            let info = '---';
            if (c.specificDate) info = `Hasta fecha: ${c.specificDate} ${c.specifiedTime || ''}`;
            else if (c.waitDuration) info = `${c.waitDuration} ${c.waitUnit}`;
            else if (c.waitEndDateAttributeExpression) info = `Atributo: ${c.waitEndDateAttributeExpression}`;
            rows.push(new TableRow({ children: [createLabelCell("Config. Espera"), createValueCell(info)] }));
        }
        else if (act.type === 'SMSSYNC') {
            const config = act.configurationArguments || {};
            const store = act.metaData?.store || {};
            rows.push(new TableRow({ children: [createMergedHeaderCell("CONFIGURACIÓN SMS", "E9ECEF", 18)] }));
            rows.push(new TableRow({ children: [createLabelCell("Mensaje"), createValueCell(`${act.resolvedTemplateName || ''} (${config.assetId})`)] }));
            rows.push(new TableRow({ children: [createLabelCell("Código"), createValueCell(store.messageConfiguration?.selectedCode?.code || '---')] }));
            rows.push(new TableRow({ children: [createLabelCell("Keyword ID"), createValueCell(config.keywordId)] }));
        }

        children.push(new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows: rows,
            margin: { bottom: 400 } 
        }));
        children.push(new Paragraph({ text: "" })); 
    }

    const docObj = new Document({ sections: [{ children }] });
    const blob = await Packer.toBlob(docObj);
    window.saveAs(blob, `Auditoria_Journey_${j.name.replace(/[^a-zA-Z0-9]/g, '_')}.docx`);
    ui.unblockUI();
}