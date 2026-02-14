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

    for (const step of details.steps || []) {
        for (const act of step.activities || []) {
            try {
                ui.blockUI(`Analizando: ${act.name}...`);
                
                // Impactos en otros procesos
                const usages = await mcApiService.findAutomationForActivity(act.activityObjectId, apiConfig);
                act.otherUsages = usages.filter(u => u.automationName !== details.name);

                // --- ENRIQUECIMIENTO SEGÚN TIPO ---
                
                // 1. SQL Query (300)
                if (act.objectTypeId === 300) {
                    const q = await mcApiService.fetchQueryDefinitionDetails(act.activityObjectId, apiConfig);
                    act.description = q.description;
                    act.queryText = q.queryText;
                    act.specificData = {
                        targetDE: q.targetDE,
                        updateType: q.updateType
                    };
                } 
                // 2. Data Extract (73)
                else if (act.objectTypeId === 73) {
                    const de = await mcApiService.fetchDataExtractDetails(act.activityObjectId, apiConfig);
                    act.description = de.description;
                    const fields = de.dataFields || [];
                    act.specificData = { fileSpec: de.fileSpec || 'N/A' };

                    const deKey = fields.find(f => f.name === 'DECustomerKey')?.value;
                    if (deKey) {
                        act.specificData.deKey = deKey;
                        const delim = fields.find(f => f.name === 'ColumnDelimiter')?.value;
                        act.specificData.delimiter = delim === ',' ? 'Coma (,)' : (delim === '|' ? 'Pipe (|)' : delim || 'N/A');
                        act.specificData.deName = await mcApiService.fetchDataExtensionName('CustomerKey', deKey, apiConfig);
                    }

                    const convertTo = fields.find(f => f.name === 'ConvertTo')?.value;
                    if (convertTo) act.specificData.convertTo = convertTo;
                } 
                // 3. File Transfer (53)
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
                // 4. Email Activity (42)
                else if (act.objectTypeId === 42) { // Email Activity
                    const e = await mcApiService.fetchEmailSendDefinitionDetails(act.activityObjectId, apiConfig);
                    if (e) {
                        act.description = e.description || 'Sin descripción';
                        act.specificData = {
                            subject: e.subject || 'N/A',
                            cc: e.cc || '',
                            bcc: e.bcc || ''
                        };
                    }
                }
                // 5. SSJS Script (423)
                else if (act.objectTypeId === 423) {
                    const s = await mcApiService.fetchScriptDetails(act.activityObjectId, apiConfig);
                    act.description = s.description;
                    act.scriptCode = s.script;
                    act.specificData = {
                        hasScript: true
                    };
                }
                else if (act.objectTypeId === 43) { // Import Activity
                    const imp = await mcApiService.fetchImportDefinitionDetails(act.activityObjectId, apiConfig);
                    
                    if (imp) {
                        act.specificData = imp;
                    }
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
            
            // --- Lógica de Impacto ---
            let impactBoxHtml = '';
            if (act.otherUsages && act.otherUsages.length > 0) {
                const list = act.otherUsages.map(u => `<li>${u.automationName} (Paso: ${u.step})</li>`).join('');
                impactBoxHtml = `
                    <div class="impact-box impact-shared">
                        <strong>⚠ Utilizado en ${act.otherUsages.length} procesos más:</strong>
                        <ul>${list}</ul>
                    </div>`;
            } else {
                impactBoxHtml = `
                    <div class="impact-box impact-exclusive">
                        <strong>✓ Actividad Exclusiva</strong>
                    </div>`;
            }

            // --- Lógica de Detalles (Derecha) ---
            let detailsHtml = '';
            if (act.specificData) {
                detailsHtml = `<div style="padding: 10px; background: #f0f7ff; border-radius: 4px; border-left: 4px solid #558ac7; font-size: 0.85em; line-height: 1.5;">`;
                
                if (act.objectTypeId === 300) { // Query
                    detailsHtml += `
                        <div><strong>Destino:</strong> ${act.specificData.targetDE.name}</div>
                        <div style="color:#666; font-size:0.9em; margin-bottom:4px;">(Key: ${act.specificData.targetDE.key})</div>
                        <div><strong>Tipo Acción:</strong> <span style="text-transform: capitalize; color:#2980b9; font-weight:bold;">${act.specificData.updateType}</span></div>`;
                    
                    // Añadir el bloque SQL colapsable
                    if (act.queryText) {
                        detailsHtml += `
                            <div class="sql-wrapper" style="margin-top:10px;">
                                <div class="sql-toggle-btn">VER QUERY<span>▼</span></div>
                                <div class="sql-content"> <!-- Usará los nuevos estilos del CSS -->
                                    <pre><code>${highlightSQLHtml(act.queryText)}</code></pre>
                                </div>
                            </div>`;
                    }
                } 
                else if (act.objectTypeId === 73) { // Extract (mantenemos lógica actual)
                    if (act.specificData.deName) {
                        detailsHtml += `<div><strong>DE Origen:</strong> ${act.specificData.deName}</div>
                                        <div><strong>Delimitador:</strong> <span style="color:#e67e22; font-weight:bold;">${act.specificData.delimiter}</span></div>`;
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
                    // Verificamos si realmente hay contenido (quitando espacios)
                    const hasContent = act.scriptCode && act.scriptCode.trim().length > 0;

                    if (hasContent) {
                        detailsHtml += `
                            <div class="sql-wrapper" style="margin-top:10px;">
                                <div class="sql-toggle-btn">VER CÓDIGO SCRIPT <span>▼</span></div>
                                <div class="sql-content" style="display:none;"> 
                                    <pre style="margin:0; min-height: 1.5em; overflow: auto;"><code>${highlightJSHtml(act.scriptCode)}</code></pre>
                                </div>
                            </div>`;
                    } else {
                        detailsHtml += `<div style="color:#999; margin-top:5px; font-style:italic;">(Script vacío o sin código disponible)</div>`;
                    }
                }
                else if (act.objectTypeId === 43) { // Import
                    // 1. Sacamos la DE del JSON (igual que en las Queries)
                    const targetDE = act.targetDataExtensions && act.targetDataExtensions[0] 
                        ? act.targetDataExtensions[0] 
                        : { name: 'N/A', key: 'N/A' };

                    // 2. Sacamos los datos técnicos de la específica
                    const tech = act.specificData || {};
                    
                    const delimLabel = tech.delimiter === ',' ? 'Coma (,)' : (tech.delimiter === '|' ? 'Pipe (|)' : (tech.delimiter || 'N/A'));

                    detailsHtml += `
                        <div style="margin-bottom: 8px;">
                            <strong>Destino:</strong> ${targetDE.name} 
                            <br><small style="color:#666;">(Key: ${targetDE.key})</small>
                            <!-- Acción colocada debajo de la Key, igual que en SQL Query -->
                            <div style="margin-top:4px;"><strong>Tipo Acción:</strong> <span style="text-transform: capitalize; color:#2980b9; font-weight:bold;">${tech.updateType || 'N/A'}</span></div>
                        </div>
                        
                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 6px; font-size: 0.9em; border-top: 1px solid #d1d9e0; margin-top:5px; padding-top:8px;">
                            <div style="grid-column: span 2;">
                                <strong>Archivo:</strong> <span style="color:#27ae60; font-weight:bold; word-break: break-all;">${tech.fileSpec || 'N/A'}</span>
                            </div>
                            <div><strong>Tipo:</strong> ${tech.fileType || 'N/A'}</div>
                            <div><strong>Separador:</strong> ${delimLabel}</div>
                            <div><strong>Cabecera:</strong> ${tech.headerLines === '1' ? 'Sí' : 'No'}</div>
                            <div><strong>Ignorar Errores:</strong> ${tech.allowErrors ? 'Sí' : 'No'}</div>
                        </div>
                    `;
                }
                detailsHtml += `</div>`;
            }

            // --- Estructura de la Fila (2 Columnas) ---
            rowsHtml += `
                <tr>
                    <td style="width:40%; text-align:left; vertical-align: top;">
                        <small style="color: #558ac7; font-weight: bold; text-transform: uppercase;">${typeLabel}</small>
                        <strong style="display:block; font-size: 1.1em; margin: 4px 0;">${act.name}</strong>
                        <small style="color: #666; display:block; margin-bottom:10px;">${act.description || 'Sin descripción'}</small>
                        ${impactBoxHtml}
                    </td>
                    <td style="width:60%; text-align:left; vertical-align: top;">
                        <div style="margin-bottom: 5px; font-weight: bold; font-size: 0.8em; color: #555;"></div>
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

    // Añadir funcionalidad de click a los botones SQL (Delegación de eventos)
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
    
    try {
        loadCustomFonts(doc);
        doc.setFont('NotoSans'); 
    } catch (e) { console.error("Error fuentes:", e); }

    const auto = currentAutomationDetails;
    let currentY = 20;

    // --- TÍTULO PRINCIPAL ---
    doc.setFontSize(16).setTextColor(40, 116, 166).setFont("helvetica", "bold");
    doc.text('Automatismo:\n'+auto.name.trim()+'\n', 10, currentY); 
    currentY += 8;

    // --- BLOQUE INFO GENERAL ---
    doc.autoTable({
        startY: currentY,
        margin: { left: 10, right: 10 },
        theme: 'grid',
        styles: { font: 'NotoSans', fontSize: 8, cellPadding: 2, overflow: 'linebreak' },
        headStyles: { fillColor: [52, 73, 94], textColor: 255 },
        columnStyles: { 0: { fontStyle: 'bold', cellWidth: 35 } }, 
        head: [[{ content: 'INFORMACIÓN GENERAL DEL AUTOMATISMO', colSpan: 2 }]],
        body: [
            ["Estado:", auto.status],
            ["Última Ejecución:", formatDate(auto.lastRunTime)],
            ["Próxima Ejecución:", formatDate(auto.scheduledTime)],
            ["Descripción:", auto.description || 'Sin descripción']
        ]
    });

    currentY = doc.lastAutoTable.finalY + 15;

    // --- RECORRIDO DE PASOS ---
    for (const step of auto.steps || []) {
        // Aumentamos el margen superior antes de escribir el PASO para que no se pegue
        currentY += 5; 
        if (currentY > 260) { doc.addPage(); currentY = 20; }

        doc.setFontSize(14).setTextColor(40, 116, 166).setFont("helvetica", "bold");
        doc.text(`PASO ${step.step}`, 10, currentY);
        currentY += 2;
        doc.setDrawColor(40, 116, 166).setLineWidth(0.5).line(10, currentY, 200, currentY);
        currentY += 10; // Espacio después de la línea del paso

        for (const act of step.activities || []) {
            const typeLabel = activityTypeMap[act.objectTypeId] || act.objectTypeId;
            
            const isShared = act.otherUsages && act.otherUsages.length > 0;
            let impactText = "EXCLUSIVA";
            if (isShared) {
                const list = act.otherUsages.map(u => `• ${u.automationName} (Paso: ${u.step})`).join('\n');
                impactText = `COMPARTIDA:\n${list}`;
            }
            const impactColor = isShared ? [192, 57, 43] : [39, 174, 96];

            const tableBody = [
                ["Tipo:", typeLabel],
                ["Descripción:", act.description || "---"],
                ["Impacto:", { content: impactText, styles: { textColor: impactColor, fontStyle: 'bold' } }]
            ];

            if (act.specificData) {
                const data = act.specificData;
                tableBody.push([{ content: "CONFIGURACIÓN", colSpan: 2, styles: { fillColor: [240, 240, 240], halign: 'center', fontStyle: 'bold' } }]);
                
                if (act.objectTypeId === 300) {
                    tableBody.push(["Destino:", `${data.targetDE.name}\n(Key: ${data.targetDE.key})`], ["Acción:", data.updateType]);
                } 
                else if (act.objectTypeId === 73) {
                    if (data.deName) {
                        tableBody.push(["DE Origen:", data.deName]);
                        tableBody.push(["Delimitador:", data.delimiter]);
                    }
                    if (data.convertTo) {
                        tableBody.push(["Acción:", "Convert File"]);
                        tableBody.push(["Codificación:", data.convertTo]);
                    }
                    tableBody.push(["Patrón Archivo:", data.fileSpec]);
                } 
                else if (act.objectTypeId === 53) {
                    tableBody.push(["Archivo:", data.fileSpec], ["Ubicación:", data.destination]);
                } 
                else if (act.objectTypeId === 42) {
                    tableBody.push(["Asunto:", data.subject], ["Remitente:", `${data.fromName} (${data.fromAddress})`]);
                }
                else if (act.objectTypeId === 952) {
                    //No devuelve la API el Journey
                }
                else if (act.objectTypeId === 43) { // IMPORT
                    // Sacamos la DE del array de la actividad
                    const targetDE = act.targetDataExtensions && act.targetDataExtensions[0] 
                        ? act.targetDataExtensions[0] 
                        : { name: 'N/A', key: 'N/A' };
                    
                    const delimLabel = data.delimiter === ',' ? 'Coma (,)' : (data.delimiter === '|' ? 'Pipe (|)' : (data.delimiter || 'N/A'));

                    tableBody.push(
                        ["Destino:", `${targetDE.name}\n(Key: ${targetDE.key})`],
                        ["Acción:", data.updateType || 'N/A'],
                        ["Archivo:", data.fileSpec || 'N/A'],
                        ["Tipo/Sep:", `${data.fileType || 'N/A'} (${delimLabel})`],
                        ["Cabecera:", data.headerLines === '1' ? 'Sí' : 'No'],
                        ["Ignorar Errores:", data.allowErrors ? 'Sí' : 'No']
                    );
                }
            }

            doc.autoTable({
                startY: currentY,
                margin: { left: 10, right: 10 },
                theme: 'grid',
                styles: { font: 'NotoSans', fontSize: 8, cellPadding: 2, overflow: 'linebreak' },
                headStyles: { fillColor: [84, 110, 122] },
                columnStyles: { 0: { cellWidth: 35, fontStyle: 'bold' } },
                head: [[{ content: act.name, colSpan: 2 }]],
                body: tableBody
            });

            currentY = doc.lastAutoTable.finalY + 8; // Más espacio entre actividades

            // --- CÓDIGO ---
            const code = act.queryText || act.scriptCode;
            if (code) {
                if (currentY > 250) { doc.addPage(); currentY = 20; }
                const codeLabel = act.objectTypeId === 300 ? "Query:" : "Script:";
                doc.setFontSize(9).setTextColor(80).setFont("helvetica", "bold").text(codeLabel, 10, currentY);
                currentY += 4;
                currentY = drawHighlightedCode(doc, code, act.objectTypeId === 300 ? 'sql' : 'js', currentY);
                currentY += 12; // Más margen después del bloque de código
            }
        }
    }
    doc.save(`Docu_Automatismo_${auto.name.replace(/\s+/g, '_')}.pdf`);
}

/**
 * Dibuja código con colores sobre fondo claro, soporta saltos de página y wrapping.
 */
function drawHighlightedCode(doc, code, type, startY) {
    const margin = 10;
    const width = 190;
    const lineHeight = 3.5; // Un poco más de espacio para legibilidad
    const fontSize = 7;
    const pageBottomLimit = 275;
    let currentY = startY;

    // --- PALETA DE COLORES PARA FONDO CLARO ---
    const p = {
        sql: { 
            kwd: [41, 128, 185],   // Azul fuerte (Keywords)
            str: [39, 174, 96],    // Verde oscuro (Strings)
            com: [128, 128, 128],  // Gris medio (Comentarios)
            num: [211, 84, 0],     // Naranja/Marrón (Números)
            plain: [50, 50, 50]    // Gris casi negro (Texto normal)
        },
        js: { 
            kwd: [142, 68, 173],   // Morado (Keywords)
            str: [39, 174, 96],    // Verde oscuro
            com: [128, 128, 128],  
            typ: [41, 128, 185],   // Azul (Built-ins/Platform)
            plain: [50, 50, 50]
        }
    }[type];

    const lines = code.replace(/\t/g, '    ').split('\n');
    doc.setFont("courier", "normal").setFontSize(fontSize);

    lines.forEach(line => {
        // Control de salto de página
        if (currentY > pageBottomLimit) {
            doc.addPage();
            currentY = 20;
            doc.setFont("courier", "normal").setFontSize(fontSize);
        }

        // --- FONDO GRIS MUY CLARITO ---
        doc.setFillColor(248, 249, 250); // Gris casi blanco
        doc.rect(margin, currentY - 2.5, width, lineHeight, 'F');
        
        // Opcional: Una línea sutil a la izquierda estilo "border-left"
        doc.setFillColor(200, 200, 200);
        doc.rect(margin, currentY - 2.5, 0.5, lineHeight, 'F');

        const tokens = line.split(/(\s+|'[^']*'|"[^"]*"|--.*|\/\/.*|[(),;=<>!])/g);
        let currentX = margin + 2;

        tokens.forEach(token => {
            if (!token) return;

            let color = p.plain;
            if (type === 'sql') {
                if (token.match(/^(SELECT|FROM|WHERE|AND|OR|JOIN|INNER|LEFT|ON|GROUP|BY|ORDER|INSERT|UPDATE|SET|DELETE|CASE|WHEN|THEN|ELSE|END|NULL|NOT|IN|TOP|DISTINCT|AS|UNION|ALL)$/i)) color = p.kwd;
                else if (token.startsWith("'")) color = p.str;
                else if (token.startsWith('--')) color = p.com;
                else if (token.match(/^\d+$/)) color = p.num;
            } else {
                if (token.match(/^(var|let|const|function|return|if|else|for|while|try|catch|new|Platform|HTTP|Write|Stringify|ParseJSON)$/)) color = p.kwd;
                else if (token.match(/^['"]|['"]$/)) color = p.str;
                else if (token.startsWith('//')) color = p.com;
                else if (token.match(/^(Platform|HTTP|Variable|Content|DataExtension)$/)) color = p.typ;
            }

            doc.setTextColor(...color);

            const tokenWidth = doc.getTextWidth(token);
            
            // Wrapping si la línea es más ancha que el papel
            if (currentX + tokenWidth > margin + width - 2) {
                currentY += lineHeight;
                currentX = margin + 2;
                
                if (currentY > pageBottomLimit) { 
                    doc.addPage(); 
                    currentY = 20; 
                    doc.setFont("courier", "normal").setFontSize(fontSize); 
                }
                
                doc.setFillColor(248, 249, 250);
                doc.rect(margin, currentY - 2.5, width, lineHeight, 'F');
                doc.setFillColor(200, 200, 200);
                doc.rect(margin, currentY - 2.5, 0.5, lineHeight, 'F');
            }

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