// src/renderer/components/automation-analyzer.js
import * as mcApiService from '../api/mc-api-service.js';
import elements from '../ui/dom-elements.js';
import * as ui from '../ui/ui-helpers.js';
import * as logger from '../ui/logger.js';
import { loadCustomFonts } from '../ui/fonts.js';

let getAuthenticatedConfig;
let goBackFunction;
let currentAutomationDetails = null;

const activityTypeMap = {
    42: 'Email', 43: 'Import', 45: 'Group', 53: 'File Transfer', 73: 'Data Extract', 84: 'Report',
    300: 'SQL Query', 303: 'Filter', 423: 'SSJS Script', 425: 'ELT', 427: 'Build Audience', 467: 'Wait',
    724: 'Mobile List Refresh', 725: 'MobileConnect', 726: 'Mobile Import', 733: 'InteractionStudio',
    736: 'MobilePush', 749: 'IS Event', 756: 'IS Date Event', 771: 'SF Send', 783: 'GroupConnect',
    1010: 'Thunderhead', 1101: 'IS Decision', 1701: 'Einstein Rec', 1000: 'Verification', 952: 'Journey Entry: Audience'
};

export function init(dependencies) {
    getAuthenticatedConfig = dependencies.getAuthenticatedConfig;
    goBackFunction = dependencies.goBack;
    elements.automationAnalyzerBackBtn.addEventListener('click', goBackFunction);
    if (elements.downloadAutomationPdfBtn) {
        elements.downloadAutomationPdfBtn.addEventListener('click', () => generatePDF());
    }
    if (elements.downloadAutomationWordBtn) {
        elements.downloadAutomationWordBtn.addEventListener('click', () => generateWord());
    }
}

export async function view(automationDetails) {
    ui.blockUI("Preparando análisis de impacto...");
    elements.analyzerAutomationNameTitle.textContent = automationDetails.name;
    elements.automationAnalyzerStepsContainer.innerHTML = '';

    logger.startLogBuffering();
    mcApiService.setLogger(logger); 

    try {
        currentAutomationDetails = await enrichAutomationData(automationDetails);
        renderHeaderInfo(currentAutomationDetails);
        await renderAnalysis(currentAutomationDetails);
    } catch (error) {
        ui.showCustomAlert(`Error en el análisis: ${error.message}`);
    } finally {
        ui.unblockUI();
        logger.endLogBuffering(); 
    }
}

function renderHeaderInfo(auto) {
    const headerHtml = `
        <div class="config-block" style="background-color: #f8f9fa; border-left: 5px solid #558ac7; margin-bottom: 20px;">
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px;">
                <div><strong>Estado:</strong> ${auto.status}</div>
                <div><strong>Última Ejecución:</strong> ${formatDate(auto.lastRunTime)}</div>
                <div><strong>Próxima Ejecución:</strong> ${formatDate(auto.scheduledTime)}</div>
            </div>
            <div style="margin-top: 10px; word-break: break-word;"><strong>Descripción:</strong> ${auto.description || 'Sin descripción'}</div>
        </div>
    `;
    elements.automationAnalyzerStepsContainer.insertAdjacentHTML('afterbegin', headerHtml);
}

async function enrichAutomationData(details) {
    const apiConfig = await getAuthenticatedConfig();
    mcApiService.setLogger(logger); 

    // Función interna para buscar quién más escribe en una DE (Reverse Impact)
    const getReverseImpactSources = async (deName, deObjectId, currentActName) => {
        const [imports, queries] = await Promise.all([
            mcApiService.findImportsTargetingDE(deObjectId, apiConfig),
            mcApiService.searchQueriesBySimpleFilter({
                property: 'DataExtensionTarget.Name',
                simpleOperator: 'equals',
                value: deName
            }, apiConfig)
        ]);
        // Unimos y filtramos: que no sea la actividad actual y que tenga al menos una automatización vinculada
        return [...imports, ...queries].filter(src => 
            src.name !== currentActName && 
            src.automations && 
            src.automations.length > 0
        );
    };

    for (const step of details.steps || []) {
        for (const act of step.activities || []) {
            try {
                ui.blockUI(`Analizando: ${act.name}...`);
                
                // 1. Impacto de ejecución: ¿Dónde se usa esta actividad?
                const usages = await mcApiService.findAutomationForActivity(act.activityObjectId, apiConfig);
                act.otherUsages = usages.filter(u => u.automationName !== details.name);

                // --- ENRIQUECIMIENTO SEGÚN TIPO ---
                
                // SQL Query (300)
                if (act.objectTypeId === 300) {
                    const q = await mcApiService.fetchQueryDefinitionDetails(act.activityObjectId, apiConfig);
                    act.description = q.description;
                    act.queryText = q.queryText;
                    
                    // Inicializamos specificData con lo que ya tenemos
                    act.specificData = {
                        targetDE: { ...q.targetDE, fullPath: 'Data Extensions (No encontrada)' },
                        updateType: q.updateType,
                        dataSources: []
                    };

                    try {
                        // Intentamos enriquecer con la ruta, pero si falla, no matamos el proceso
                        const deInfo = await mcApiService.getDataExtensionDetailsByName(q.targetDE.name, apiConfig);
                        if (deInfo) {
                            const path = await mcApiService.getFolderPath(deInfo.categoryId, apiConfig);
                            act.specificData.targetDE.fullPath = path || 'Data Extensions';
                            act.specificData.dataSources = await getReverseImpactSources(q.targetDE.name, deInfo.objectID, act.name);
                        }
                    } catch (deError) {
                        console.warn(`No se pudo obtener metadatos de la DE para ${act.name}`, deError);
                    }
                }
                // Data Extract (73)
                else if (act.objectTypeId === 73) {
                    const de = await mcApiService.fetchDataExtractDetails(act.activityObjectId, apiConfig);
                    act.description = de.description;
                    const fields = de.dataFields || [];
                    act.specificData = { fileSpec: de.fileSpec || 'N/A' };

                    const deKey = fields.find(f => f.name === 'DECustomerKey')?.value;
                    if (deKey) {
                        const soapDE = await mcApiService.searchDataExtensions('CustomerKey', deKey, apiConfig);
                        if (soapDE.length > 0) {
                            const path = await mcApiService.getFolderPath(soapDE[0].categoryId, apiConfig);
                            act.specificData.deName = soapDE[0].deName;
                            act.specificData.fullPath = path || 'Data Extensions';
                        }
                        const delim = fields.find(f => f.name === 'ColumnDelimiter')?.value;
                        act.specificData.delimiter = delim === ',' ? 'Coma (,)' : (delim === '|' ? 'Pipe (|)' : delim || 'N/A');
                    }
                    const convertTo = fields.find(f => f.name === 'ConvertTo')?.value;
                    if (convertTo) act.specificData.convertTo = convertTo;
                } 
                // Import Activity (43)
                else if (act.objectTypeId === 43) {
                    const imp = await mcApiService.fetchImportDefinitionDetails(act.activityObjectId, apiConfig);
                    const targetDE = act.targetDataExtensions && act.targetDataExtensions[0] ? act.targetDataExtensions[0] : null;
                    
                    if (targetDE) {
                        const deInfo = await mcApiService.getDataExtensionDetailsByName(targetDE.name, apiConfig);
                        const path = await mcApiService.getFolderPath(deInfo.categoryId, apiConfig);
                        targetDE.fullPath = path || 'Data Extensions';
                        
                        act.specificData = {
                            ...imp,
                            dataSources: await getReverseImpactSources(targetDE.name, deInfo.objectID, act.name)
                        };
                    }
                }
                // File Transfer (53)
                else if (act.objectTypeId === 53) {
                    const ft = await mcApiService.fetchFileTransferDetails(act.activityObjectId, apiConfig);
                    act.description = ft.description;
                    let locationName = 'N/A';
                    try {
                        const loc = await mcApiService.fetchFileTransferLocation(ft.fileTransferLocationId, apiConfig);
                        locationName = loc.fileTransferLocation?.name || ft.fileTransferLocationId;
                    } catch (e) { locationName = "ID: " + ft.fileTransferLocationId; }
                    act.specificData = { fileSpec: ft.fileSpec || 'N/A', destination: locationName };
                }
                // Email Activity (42)
                else if (act.objectTypeId === 42) {
                    const e = await mcApiService.fetchEmailSendDefinitionDetails(act.activityObjectId, apiConfig);
                    if (e) {
                        act.description = e.description || 'Sin descripción';
                        act.specificData = { subject: e.subject || 'N/A', cc: e.cc || '', bcc: e.bcc || '' };
                    }
                }
                // SSJS Script (423)
                else if (act.objectTypeId === 423) {
                    const s = await mcApiService.fetchScriptDetails(act.activityObjectId, apiConfig);
                    act.description = s.description;
                    act.scriptCode = s.script;
                    act.specificData = { hasScript: true };
                }
            } catch (e) { console.warn(`Error enriqueciendo ${act.name}`, e); }
        }
    }
    return details;
}

async function renderAnalysis(automation) {
    const container = elements.automationAnalyzerStepsContainer;
    for (const step of automation.steps || []) {
        const stepBlock = document.createElement('div');
        stepBlock.className = 'step-block';
        let rowsHtml = '';
        
        for (const act of step.activities || []) {
            const typeLabel = activityTypeMap[act.objectTypeId] || `Tipo: ${act.objectTypeId}`;
            
            // --- 1. Lógica de Impacto (Izquierda) ---
            let impactBoxHtml = '';
            if (act.otherUsages && act.otherUsages.length > 0) {
                const list = act.otherUsages.map(u => `<li>${u.automationName} (Paso: ${u.step})</li>`).join('');
                impactBoxHtml = `
                    <div class="sql-wrapper" style="margin-top:10px;">
                        <div class="sql-toggle-btn" style="background:#fff5f5 !important; color:#b03a2e !important; border:1px solid #fadbd8 !important; font-size:0.85em;">
                            ⚠ Utilizado en ${act.otherUsages.length} automatismos <span>▼</span>
                        </div>
                        <div class="sql-content impact-shared" style="display:none; border-color:#fadbd8 !important; padding: 10px; background:#f8f9fa !important;"> 
                            <ul style="margin:0; padding-left:20px; font-size:0.85em; color:#333333 !important;">${list}</ul>
                        </div>
                    </div>`;
            } else {
                impactBoxHtml = `<div class="impact-box impact-exclusive" style="margin-top:10px; background:#f0fff4 !important; color:#1e8449 !important; border:1px solid #d4efdf !important; padding: 8px 12px; border-radius: 4px; font-size: 0.85em;">✓ Actividad Exclusiva</div>`;
            }

            // --- 2. Lógica de Detalles (Derecha) ---
            let detailsHtml = '';
            if (act.specificData) {
                detailsHtml = `<div style="padding: 10px; background: #f0f7ff; border-radius: 4px; border-left: 4px solid #558ac7; font-size: 0.85em; line-height: 1.5;">`;
                
                // Orden solicitado: Nombre -> Key -> Ruta
                const renderDeBlock = (name, key, path) => `
                <div style="margin-bottom:12px; padding-bottom:8px; border-bottom: 1px solid #d1e3f5;">
                    <div style="font-weight:bold; color:#2c3e50; font-size:1.1em;">Data Extension: ${name}</div>
                    <div style="color:#666; font-size:0.85em; margin-bottom:4px;">(Key: ${key})</div>
                    <div style="color: #444; font-size: 0.9em; display: flex; align-items: center; gap: 5px; margin-top:5px;">
                        <span style="opacity:0.7;">📁</span> ${path}
                    </div>
                </div>`;

                if (act.objectTypeId === 300) { // Query
                    detailsHtml += renderDeBlock(act.specificData.targetDE.name, act.specificData.targetDE.key, act.specificData.targetDE.fullPath);
                    detailsHtml += `<div><strong>Tipo Acción:</strong> <span style="text-transform: capitalize; color:#2980b9; font-weight:bold;">${act.specificData.updateType}</span></div>`;
                    
                    if (act.queryText) {
                        detailsHtml += `
                            <div class="sql-wrapper" style="margin-top:10px;">
                                <div class="sql-toggle-btn">VER QUERY<span>▼</span></div>
                                <div class="sql-content" style="display:none;"> <!-- Mantiene fondo oscuro original -->
                                    <pre><code>${highlightSQLHtml(act.queryText)}</code></pre>
                                </div>
                            </div>`;
                    }
                } 
                else if (act.objectTypeId === 73) { // Extract
                    if (act.specificData.deName) {
                        detailsHtml += renderDeBlock(act.specificData.deName, act.specificData.deKey, act.specificData.fullPath);
                        detailsHtml += `<div><strong>Delimitador:</strong> <span style="color:#e67e22; font-weight:bold;">${act.specificData.delimiter}</span></div>`;
                    }
                    detailsHtml += `<div><strong>Patrón Archivo:</strong> <span style="color:#27ae60;">${act.specificData.fileSpec}</span></div>`;
                } 
                else if (act.objectTypeId === 53) { // Transfer
                    detailsHtml += `<div><strong>Archivo:</strong> <span style="color:#27ae60;">${act.specificData.fileSpec}</span></div>
                                    <div><strong>Destino:</strong> <span style="color:#8e44ad; font-weight:bold;">${act.specificData.destination}</span></div>`;
                }
                else if (act.objectTypeId === 42) { // Email
                    detailsHtml += `<div><strong>Asunto:</strong> <span style="color:#27ae60; font-weight:bold;">${act.specificData.subject}</span></div>`;
                }
                else if (act.objectTypeId === 423) { // SSJS Script                   
                    const hasContent = act.scriptCode && act.scriptCode.trim().length > 0;
                    if (hasContent) {
                        detailsHtml += `
                            <div class="sql-wrapper" style="margin-top:10px;">
                                <div class="sql-toggle-btn">VER CÓDIGO SCRIPT <span>▼</span></div>
                                <div class="sql-content" style="display:none;"> <!-- Mantiene fondo oscuro original -->
                                    <pre style="margin:0; min-height: 1.5em; overflow: auto;"><code>${highlightJSHtml(act.scriptCode)}</code></pre>
                                </div>
                            </div>`;
                    } else {
                        detailsHtml += `<div style="color:#999; margin-top:5px; font-style:italic;">(Script vacío o sin código disponible)</div>`;
                    }
                }
                else if (act.objectTypeId === 43) { // Import
                    const targetDE = act.targetDataExtensions?.[0] || { name: 'N/A', key: 'N/A' };
                    const tech = act.specificData || {};
                    const delimLabel = tech.delimiter === ',' ? 'Coma (,)' : (tech.delimiter === '|' ? 'Pipe (|)' : (tech.delimiter || 'N/A'));
                    
                    detailsHtml += renderDeBlock(targetDE.name, targetDE.key, targetDE.fullPath);
                    detailsHtml += `
                        <div style="margin-bottom: 8px;">
                            <div style="margin-top:4px;"><strong>Tipo Acción:</strong> <span style="text-transform: capitalize; color:#2980b9; font-weight:bold;">${tech.updateType || 'N/A'}</span></div>
                        </div>
                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 6px; font-size: 0.9em; border-top: 1px solid #d1d9e0; margin-top:5px; padding-top:8px;">
                            <div style="grid-column: span 2;"><strong>Archivo:</strong> <span style="color:#27ae60; font-weight:bold; word-break: break-all;">${tech.fileSpec || 'N/A'}</span></div>
                            <div><strong>Tipo:</strong> ${tech.fileType || 'N/A'}</div>
                            <div><strong>Separador:</strong> ${delimLabel}</div>
                            <div><strong>Cabecera:</strong> ${tech.headerLines === '1' ? 'Sí' : 'No'}</div>
                            <div><strong>Ignorar Errores:</strong> ${tech.allowErrors ? 'Sí' : 'No'}</div>
                        </div>`;
                }

                // --- 3. BLOQUE REVERSE IMPACT (Derecha) - ROJO Y FONDO GRIS CLARO ---
                if (act.specificData.dataSources && act.specificData.dataSources.length > 0) {
                    const dsItems = act.specificData.dataSources.map(ds => {
                        const autos = ds.automations.map(a => `<li>${a.automationName} (Paso: ${a.step})</li>`).join('');
                        return `
                            <li style="margin-bottom:10px; padding-bottom:8px; border-bottom:1px dashed #ddd;">
                                <div style="font-weight:bold; color:#b03a2e;">${ds.name} <small style="color:#666; font-weight:normal;">[${ds.type}]</small></div>
                                <ul style="margin:4px 0 0 0; padding-left:15px; font-size:0.9em; color:#333333 !important;">${autos}</ul>
                            </li>`;
                    }).join('');

                    detailsHtml += `
                        <div class="sql-wrapper" style="margin-top:15px;">
                            <div class="sql-toggle-btn" style="background:#fff5f5 !important; color:#b03a2e !important; border:1px solid #fadbd8 !important; font-size:0.85em;">
                                ⚠ Hay (${act.specificData.dataSources.length}) actividades que impactan en la DE<span>▼</span>
                            </div>
                            <div class="sql-content" style="display:none; border-color:#fadbd8 !important; background:#f8f9fa !important;">
                                <ul style="margin:0; padding:10px; list-style:none; color:#333333 !important;">${dsItems}</ul>
                            </div>
                        </div>`;
                } else if (act.objectTypeId === 300 || act.objectTypeId === 43) {
                    detailsHtml += `<div class="impact-box impact-exclusive" style="margin-top:12px; background:#f0fff4 !important; color:#1e8449 !important; border:1px solid #d4efdf !important; font-size:0.85em; padding: 8px 12px; border-radius: 4px;">✓ Exclusiva</div>`;
                }

                detailsHtml += `</div>`;
            }

            // --- Estructura de la Fila ---
            rowsHtml += `
                <tr>
                    <td style="width:40%; text-align:left; vertical-align: top;">
                        <small style="color: #558ac7; font-weight: bold; text-transform: uppercase;">${typeLabel}</small>
                        <strong style="display:block; font-size: 1.1em; margin: 4px 0;">${act.name}</strong>
                        <small style="color: #666; display:block; margin-bottom:10px;">${act.description || 'Sin descripción'}</small>
                        ${impactBoxHtml}
                    </td>
                    <td style="width:60%; text-align:left; vertical-align: top;">
                        ${detailsHtml}
                    </td>
                </tr>`;
        }
        
        stepBlock.innerHTML = `
            <h4>Paso ${step.step}</h4>
            <div class="table-container">
                <table class="folder-results-table">
                    <thead>
                        <tr>
                            <th>Actividad e Impacto</th>
                            <th>Configuración Detallada</th>
                        </tr>
                    </thead>
                    <tbody>${rowsHtml}</tbody>
                </table>
            </div>`;
        container.appendChild(stepBlock);
    }

    // Funcionalidad de click para todos los botones colapsables
    container.querySelectorAll('.sql-toggle-btn').forEach(btn => {
        btn.onclick = function() {
            const content = this.nextElementSibling;
            const isVisible = content.style.display === 'block';
            content.style.display = isVisible ? 'none' : 'block';
            this.querySelector('span').textContent = isVisible ? '▼' : '▲';
        };
    });
}

async function generatePDF() {
    if (!currentAutomationDetails) return;
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF('p', 'mm', 'a4');
    try { loadCustomFonts(doc); doc.setFont('NotoSans'); } catch (e) { console.error(e); }

    const auto = currentAutomationDetails;
    let currentY = 20;

    doc.setFontSize(16).setTextColor(40, 116, 166).setFont("helvetica", "bold");
    doc.text('Automatismo: ' + auto.name.trim(), 10, currentY); 
    currentY += 10;

    doc.autoTable({
        startY: currentY, margin: { left: 10, right: 10 }, theme: 'grid', styles: { font: 'NotoSans', fontSize: 8 },
        headStyles: { fillColor: [52, 73, 94] }, head: [[{ content: 'INFORMACIÓN GENERAL', colSpan: 2 }]],
        body: [["Estado:", auto.status], ["Última Ejecución:", formatDate(auto.lastRunTime)], ["Descripción:", auto.description || 'Sin descripción']]
    });
    currentY = doc.lastAutoTable.finalY + 15;

    for (const step of auto.steps || []) {
        if (currentY > 240) { doc.addPage(); currentY = 20; }
        doc.setFontSize(14).setTextColor(40, 116, 166).setFont("helvetica", "bold");
        doc.text(`PASO ${step.step}`, 10, currentY);
        currentY += 2;
        doc.setDrawColor(40, 116, 166).setLineWidth(0.5).line(10, currentY, 200, currentY);
        currentY += 8;

        for (const act of step.activities || []) {
            const isShared = act.otherUsages && act.otherUsages.length > 0;
            let impactText = isShared ? `⚠ COMPARTIDA EN:\n${act.otherUsages.map(u => `• ${u.automationName}`).join('\n')}` : "✓ ACTIVIDAD EXCLUSIVA";
            const tableBody = [["Tipo:", activityTypeMap[act.objectTypeId] || act.objectTypeId], ["Impacto:", { content: impactText, styles: { textColor: isShared ? [176, 58, 46] : [30, 132, 73], fontStyle: 'bold' } }]];

            if (act.specificData) {
                const data = act.specificData;
                tableBody.push([{ content: "CONFIGURACIÓN DETALLADA", colSpan: 2, styles: { fillColor: [240, 240, 240], halign: 'center', fontStyle: 'bold' } }]);
                if (act.objectTypeId === 300) {
                    tableBody.push(["Destino:", `${data.targetDE.name}\n(Key: ${data.targetDE.key})`], ["Ruta:", data.targetDE.fullPath || "---"], ["Acción:", data.updateType]);
                } else if (act.objectTypeId === 43) {
                    const targetDE = act.targetDataExtensions?.[0] || { name: 'N/A', key: 'N/A' };
                    tableBody.push(["Destino:", `${targetDE.name}\n(Key: ${targetDE.key})`], ["Ruta:", targetDE.fullPath || "---"], ["Acción:", data.updateType || 'N/A']);
                }
                if (data.dataSources && data.dataSources.length > 0) {
                    const dsText = data.dataSources.map(ds => `• ${ds.name} [${ds.type}]\n${ds.automations.map(a => `  - ${a.automationName} (Paso: ${a.step})`).join('\n')}`).join('\n');
                    tableBody.push([{ content: `⚠ Hay (${data.dataSources.length}) actividades que impactan en la DE:\n${dsText}`, colSpan: 2, styles: { textColor: [176, 58, 46], fontStyle: 'bold', fillColor: [255, 245, 245] } }]);
                }
            }

            doc.autoTable({ startY: currentY, margin: { left: 10, right: 10 }, theme: 'grid', styles: { font: 'NotoSans', fontSize: 8 }, headStyles: { fillColor: [84, 110, 122] }, head: [[{ content: act.name, colSpan: 2 }]], body: tableBody });
            currentY = doc.lastAutoTable.finalY + 5;

            const code = act.queryText || act.scriptCode;
            if (code && code.trim().length > 0) {
                if (currentY > 260) { doc.addPage(); currentY = 20; }
                doc.setFontSize(9).setTextColor(80).setFont("helvetica", "bold").text(act.objectTypeId === 300 ? "Query SQL:" : "Script SSJS:", 10, currentY);
                currentY += 5;
                currentY = drawHighlightedCode(doc, code, act.objectTypeId === 300 ? 'sql' : 'js', currentY);
                currentY += 10;
            }
        }
    }
    doc.save(`Docu_Automatismo_${auto.name.replace(/\s+/g, '_')}.pdf`);
}

/**
 * Dibuja código con colores sobre fondo claro, soporta saltos de página y wrapping.
 */
function drawHighlightedCode(doc, code, type, startY) {
    const margin = 10, width = 190, lineHeight = 4, fontSize = 7, pageBottomLimit = 270;
    let currentY = startY;
    const p = type === 'sql' ? { kwd: [41, 128, 185], str: [39, 174, 96], com: [128, 128, 128], plain: [50, 50, 50] } : { kwd: [142, 68, 173], str: [39, 174, 96], com: [128, 128, 128], plain: [50, 50, 50] };
    const lines = code.replace(/\t/g, '    ').split(/\r?\n/);
    doc.setFont("courier", "normal").setFontSize(fontSize);

    lines.forEach(line => {
        if (currentY > pageBottomLimit) { doc.addPage(); currentY = 20; doc.setFont("courier", "normal").setFontSize(fontSize); }
        doc.setFillColor(248, 249, 250); doc.rect(margin, currentY - 3, width, lineHeight, 'F');
        doc.setFillColor(200, 200, 200); doc.rect(margin, currentY - 3, 0.5, lineHeight, 'F');
        const tokens = line.split(/(\s+|'[^']*'|"[^"]*"|--.*|\/\/.*|[(),;=<>!])/g);
        let currentX = margin + 2;
        tokens.forEach(token => {
            if (!token) return;
            let color = p.plain;
            if (type === 'sql') {
                if (token.match(/^(SELECT|FROM|WHERE|AND|OR|JOIN|ON|GROUP|BY|INSERT|UPDATE|DELETE|CASE|WHEN|THEN|ELSE|END|AS)$/i)) color = p.kwd;
                else if (token.startsWith("'")) color = p.str;
                else if (token.startsWith('--')) color = p.com;
            } else {
                if (token.match(/^(var|let|const|function|return|if|else|for|Platform|HTTP)$/)) color = p.kwd;
                else if (token.match(/^['"]/)) color = p.str;
                else if (token.startsWith('//')) color = p.com;
            }
            doc.setTextColor(...color);
            const tokenWidth = doc.getTextWidth(token);
            if (currentX + tokenWidth > margin + width - 2) { currentY += lineHeight; currentX = margin + 2; doc.setFillColor(248, 249, 250); doc.rect(margin, currentY - 3, width, lineHeight, 'F'); }
            doc.text(token, currentX, currentY);
            currentX += tokenWidth;
        });
        currentY += lineHeight;
    });
    return currentY;
}



function formatDate(date) {
    if (!date || date.startsWith('0001')) return 'N/A';
    return new Date(date).toLocaleString();
}

function highlightSQLHtml(query) {
    if (!query) return '';

    let escaped = query.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

    // Patrones: 1. Comentarios, 2. Strings, 3. Keywords, 4. Funciones, 5. Números
    const pattern = /(--[^\n]*|\/\*[\s\S]*?\*\/)|('[^']*')|\b(SELECT|FROM|WHERE|AND|OR|JOIN|INNER|LEFT|ON|GROUP|BY|ORDER|INSERT|UPDATE|SET|DELETE|CASE|WHEN|THEN|ELSE|END|NULL|NOT|IN|TOP|DISTINCT|AS|UNION|ALL|LIKE)\b|\b(CONVERT|DATE|DATEADD|GETUTCDATE|GETDATE|DATEDIFF|SUM|COUNT|AVG|MIN|MAX|CAST|ISNULL|COALESCE)\b|(\b\d+\b)/gi;

    return escaped.replace(pattern, (match, com, str, kwd, fn, num) => {
        if (com) return `<span class="sql-comment">${match}</span>`;
        if (str) return `<span class="sql-string">${match}</span>`;
        if (kwd) return `<span class="sql-keyword">${match.toUpperCase()}</span>`;
        if (fn) return `<span class="sql-function">${match.toUpperCase()}</span>`;
        if (num) return `<span class="sql-number">${match}</span>`;
        return match;
    });
}

function highlightJSHtml(code) {
    if (!code) return '';
    
    // Escapamos HTML primero
    let escaped = code.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

    // Definimos los patrones: 1. Comentarios, 2. Strings, 3. Keywords, 4. Builtins, 5. Números
    const pattern = /(\/\/[^\n]*|\/\*[\s\S]*?\*\/)|('[^']*'|"[^"]*")|\b(var|let|const|function|return|if|else|for|while|try|catch|new|async|await|switch|case|break)\b|\b(Platform|HTTP|Variable|Content|DataExtension|Stringify|ParseJSON|Write)\b|(\b\d+\b)/g;

    return escaped.replace(pattern, (match, com, str, kwd, bilt, num) => {
        if (com) return `<span class="js-comment">${match}</span>`;
        if (str) return `<span class="js-string">${match}</span>`;
        if (kwd) return `<span class="js-keyword">${match}</span>`;
        if (bilt) return `<span class="js-builtin">${match}</span>`;
        if (num) return `<span class="js-number">${match}</span>`;
        return match;
    });
}

async function generateWord() {
    if (!currentAutomationDetails) return;

    const docxLib = window.docx;
    if (!docxLib) {
        ui.showCustomAlert("La librería de Word no se ha cargado. Verifica la conexión.");
        return;
    }

    ui.blockUI("Generando documento Word...");

    const {
        Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
        WidthType, AlignmentType, HeadingLevel, ShadingType, BorderStyle, VerticalAlign
    } = docxLib;

    const auto = currentAutomationDetails;

    // --- HELPERS ---
    const noBorder = {
        top:    { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
        bottom: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
        left:   { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
        right:  { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
    };

    const subtleBorder = {
        top:    { style: BorderStyle.SINGLE, size: 1, color: "DDDDDD" },
        bottom: { style: BorderStyle.SINGLE, size: 1, color: "DDDDDD" },
        left:   { style: BorderStyle.SINGLE, size: 1, color: "DDDDDD" },
        right:  { style: BorderStyle.SINGLE, size: 1, color: "DDDDDD" },
    };

    const createMergedHeaderCell = (text, color = "558AC7", fontSize = 20, textColor = "FFFFFF") => new TableCell({
        children: [new Paragraph({
            children: [new TextRun({ text, color: textColor, bold: true, size: fontSize })],
            alignment: AlignmentType.CENTER
        })],
        columnSpan: 2,
        shading: { fill: color, type: ShadingType.CLEAR },
        verticalAlign: VerticalAlign.CENTER,
        borders: noBorder,
        margins: { top: 80, bottom: 80, left: 120, right: 120 }
    });

    const createLabelCell = (text) => new TableCell({
        children: [new Paragraph({ children: [new TextRun({ text, bold: true, size: 18, color: "2C3E50" })] })],
        width: { size: 35, type: WidthType.PERCENTAGE },
        shading: { fill: "F5F6FA" },
        borders: subtleBorder,
        margins: { top: 60, bottom: 60, left: 120, right: 80 }
    });

    const createValueCell = (text) => {
        const safeText = String(text !== null && text !== undefined ? text : "");
        return new TableCell({
            children: safeText.split('\n').map(line => new Paragraph({
                children: [new TextRun({ text: line, size: 18, color: "333333" })]
            })),
            width: { size: 65, type: WidthType.PERCENTAGE },
            shading: { fill: "FFFFFF" },
            borders: subtleBorder,
            margins: { top: 60, bottom: 60, left: 120, right: 80 }
        });
    };

    const createCodeCell = (text) => {
        const safeText = String(text || "");
        return new TableCell({
            children: safeText.split('\n').map(line => new Paragraph({
                children: [new TextRun({ text: line, font: "Courier New", size: 14, color: "1A1A2E" })],
                spacing: { before: 0, after: 0 }
            })),
            columnSpan: 2,
            shading: { fill: "F8F9FA" },
            borders: subtleBorder,
            margins: { top: 120, bottom: 120, left: 200, right: 120 }
        });
    };

    const children = [];

    // 1. TÍTULO
    children.push(new Paragraph({
        text: `Análisis de Automatismo: ${auto.name.trim()}`,
        heading: HeadingLevel.HEADING_1,
        alignment: AlignmentType.LEFT,
        spacing: { after: 400 }
    }));

    // 2. INFORMACIÓN GENERAL
    children.push(new Paragraph({ text: "INFORMACIÓN GENERAL", heading: HeadingLevel.HEADING_2, spacing: { before: 200, after: 200 } }));
    children.push(new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: [
            new TableRow({ children: [createMergedHeaderCell("DATOS DEL AUTOMATISMO", "34495E", 18)] }),
            new TableRow({ children: [createLabelCell("Estado"), createValueCell(auto.status)] }),
            new TableRow({ children: [createLabelCell("Última Ejecución"), createValueCell(formatDate(auto.lastRunTime))] }),
            new TableRow({ children: [createLabelCell("Próxima Ejecución"), createValueCell(formatDate(auto.scheduledTime))] }),
            new TableRow({ children: [createLabelCell("Descripción"), createValueCell(auto.description || 'Sin descripción')] }),
        ]
    }));

    // 3. PASOS Y ACTIVIDADES
    for (const step of auto.steps || []) {
        children.push(new Paragraph({
            text: `PASO ${step.step}`,
            heading: HeadingLevel.HEADING_2,
            spacing: { before: 600, after: 200 }
        }));

        for (const act of step.activities || []) {
            const typeLabel = activityTypeMap[act.objectTypeId] || `Tipo: ${act.objectTypeId}`;
            const isShared = act.otherUsages && act.otherUsages.length > 0;
            const rows = [];

            rows.push(new TableRow({ children: [createMergedHeaderCell(act.name, "558AC7", 20)] }));
            rows.push(new TableRow({ children: [createLabelCell("Tipo"), createValueCell(typeLabel)] }));
            rows.push(new TableRow({ children: [createLabelCell("Descripción"), createValueCell(act.description || 'Sin descripción')] }));

            if (isShared) {
                const list = act.otherUsages.map(u => `• ${u.automationName} (Paso: ${u.step})`).join('\n');
                rows.push(new TableRow({ children: [createLabelCell("⚠ Impacto"), createValueCell(`COMPARTIDA en:\n${list}`)] }));
            } else {
                rows.push(new TableRow({ children: [createLabelCell("Impacto"), createValueCell("✓ Actividad Exclusiva")] }));
            }

            if (act.specificData) {
                const data = act.specificData;
                rows.push(new TableRow({ children: [createMergedHeaderCell("CONFIGURACIÓN DETALLADA", "E9ECEF", 18, "2C3E50")] }));

                if (act.objectTypeId === 300) {
                    rows.push(new TableRow({ children: [createLabelCell("DE Destino"), createValueCell(`${data.targetDE.name}\n(Key: ${data.targetDE.key})`)] }));
                    rows.push(new TableRow({ children: [createLabelCell("Ruta"), createValueCell(data.targetDE.fullPath || '---')] }));
                    rows.push(new TableRow({ children: [createLabelCell("Acción"), createValueCell(data.updateType || '---')] }));

                    if (data.dataSources && data.dataSources.length > 0) {
                        const dsText = data.dataSources.map(ds =>
                            `• ${ds.name} [${ds.type}]\n${ds.automations.map(a => `  - ${a.automationName} (Paso: ${a.step})`).join('\n')}`
                        ).join('\n');
                        rows.push(new TableRow({ children: [createMergedHeaderCell(`⚠ ${data.dataSources.length} actividad(es) impactan en la DE`, "FDECEA", 16, "8B0000")] }));
                        rows.push(new TableRow({ children: [createLabelCell("Fuentes de Impacto"), createValueCell(dsText)] }));
                    }

                    if (act.queryText && act.queryText.trim()) {
                        rows.push(new TableRow({ children: [createMergedHeaderCell("QUERY SQL", "EAF0FB", 16, "2C3E50")] }));
                        rows.push(new TableRow({ children: [createCodeCell(act.queryText.replace(/\t/g, '    '))] }));
                    }
                }
                else if (act.objectTypeId === 43) {
                    const targetDE = act.targetDataExtensions?.[0] || { name: 'N/A', key: 'N/A' };
                    const tech = data;
                    const delimLabel = tech.delimiter === ',' ? 'Coma (,)' : (tech.delimiter === '|' ? 'Pipe (|)' : (tech.delimiter || 'N/A'));
                    rows.push(new TableRow({ children: [createLabelCell("DE Destino"), createValueCell(`${targetDE.name}\n(Key: ${targetDE.key})`)] }));
                    rows.push(new TableRow({ children: [createLabelCell("Ruta"), createValueCell(targetDE.fullPath || '---')] }));
                    rows.push(new TableRow({ children: [createLabelCell("Acción"), createValueCell(tech.updateType || 'N/A')] }));
                    rows.push(new TableRow({ children: [createLabelCell("Archivo"), createValueCell(tech.fileSpec || 'N/A')] }));
                    rows.push(new TableRow({ children: [createLabelCell("Tipo / Separador"), createValueCell(`${tech.fileType || 'N/A'} / ${delimLabel}`)] }));
                    rows.push(new TableRow({ children: [createLabelCell("Cabecera / Errores"), createValueCell(`${tech.headerLines === '1' ? 'Sí' : 'No'} / ${tech.allowErrors ? 'Ignorar' : 'No ignorar'}`)] }));

                    if (data.dataSources && data.dataSources.length > 0) {
                        const dsText = data.dataSources.map(ds =>
                            `• ${ds.name} [${ds.type}]\n${ds.automations.map(a => `  - ${a.automationName} (Paso: ${a.step})`).join('\n')}`
                        ).join('\n');
                        rows.push(new TableRow({ children: [createMergedHeaderCell(`⚠ ${data.dataSources.length} actividad(es) impactan en la DE`, "FDECEA", 16, "8B0000")] }));
                        rows.push(new TableRow({ children: [createLabelCell("Fuentes de Impacto"), createValueCell(dsText)] }));
                    }
                }
                else if (act.objectTypeId === 73) {
                    if (data.deName) {
                        rows.push(new TableRow({ children: [createLabelCell("DE Origen"), createValueCell(`${data.deName}\n(Ruta: ${data.fullPath || '---'})`)] }));
                        rows.push(new TableRow({ children: [createLabelCell("Delimitador"), createValueCell(data.delimiter || '---')] }));
                    }
                    rows.push(new TableRow({ children: [createLabelCell("Patrón Archivo"), createValueCell(data.fileSpec || '---')] }));
                    if (data.convertTo) rows.push(new TableRow({ children: [createLabelCell("Convertir a"), createValueCell(data.convertTo)] }));
                }
                else if (act.objectTypeId === 53) {
                    rows.push(new TableRow({ children: [createLabelCell("Archivo"), createValueCell(data.fileSpec || '---')] }));
                    rows.push(new TableRow({ children: [createLabelCell("Destino"), createValueCell(data.destination || '---')] }));
                }
                else if (act.objectTypeId === 42) {
                    rows.push(new TableRow({ children: [createLabelCell("Asunto"), createValueCell(data.subject || '---')] }));
                    if (data.cc) rows.push(new TableRow({ children: [createLabelCell("CC"), createValueCell(data.cc)] }));
                    if (data.bcc) rows.push(new TableRow({ children: [createLabelCell("BCC"), createValueCell(data.bcc)] }));
                }
                else if (act.objectTypeId === 423) {
                    if (act.scriptCode && act.scriptCode.trim()) {
                        rows.push(new TableRow({ children: [createMergedHeaderCell("CÓDIGO SSJS", "EAF0FB", 16, "2C3E50")] }));
                        rows.push(new TableRow({ children: [createCodeCell(act.scriptCode.replace(/\t/g, '    '))] }));
                    } else {
                        rows.push(new TableRow({ children: [createLabelCell("Script"), createValueCell('(Script vacío o sin código disponible)')] }));
                    }
                }
            }

            children.push(new Table({
                width: { size: 100, type: WidthType.PERCENTAGE },
                rows,
                margins: { bottom: 400 }
            }));
            children.push(new Paragraph({ text: "", spacing: { after: 200 } }));
        }
    }

    const docObj = new Document({ sections: [{ children }] });
    const blob = await Packer.toBlob(docObj);
    window.saveAs(blob, `Docu_Automatismo_${auto.name.replace(/[^a-zA-Z0-9]/g, '_')}.docx`);
    ui.unblockUI();
}