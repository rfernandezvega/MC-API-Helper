// src/renderer/components/automation-analyzer.js
import * as mcApiService from '../api/mc-api-service.js';
import elements from '../ui/dom-elements.js';
import * as ui from '../ui/ui-helpers.js';
import * as logger from '../ui/logger.js';

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
    
    try {
        currentAutomationDetails = await enrichAutomationData(automationDetails);
        renderHeaderInfo(currentAutomationDetails);
        await renderAnalysis(currentAutomationDetails);
    } catch (error) {
        ui.showCustomAlert(`Error en el análisis: ${error.message}`);
    } finally {
        ui.unblockUI();
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
    for (const step of details.steps || []) {
        for (const act of step.activities || []) {
            try {
                ui.blockUI(`Analizando: ${act.name}...`);
                
                // 1. Buscamos impactos (Usos en otros procesos)
                const usages = await mcApiService.findAutomationForActivity(act.activityObjectId, apiConfig);
                act.otherUsages = usages.filter(u => u.automationName !== details.name);

                // 2. Buscamos detalles según tipo
                if (act.objectTypeId === 300) {
                    const q = await mcApiService.fetchQueryDefinitionDetails(act.activityObjectId, apiConfig);
                    act.description = q.description;
                    act.queryText = q.queryText;
                } else if (act.objectTypeId === 423) {
                    const s = await mcApiService.fetchScriptDetails(act.activityObjectId, apiConfig);
                    act.description = s.description;
                    act.scriptCode = s.script;
                } else if (act.objectTypeId === 73) {
                    const de = await mcApiService.fetchDataExtractDetails(act.activityObjectId, apiConfig);
                    act.description = de.description;
                    act.detailedInfo = { "File Spec": de.fileSpec, "Data Fields": de.dataFields };
                } else if (act.objectTypeId === 43) {
                    const imp = await mcApiService.fetchImportDetails(act.activityObjectId, apiConfig);
                    act.description = imp.description;
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
            
            let impactHtml = '<span style="color: #28a745; font-weight: bold;">✓ Exclusiva</span>';
            if (act.otherUsages && act.otherUsages.length > 0) {
                const list = act.otherUsages.map(u => `<li>${u.automationName} (Paso: ${u.step})</li>`).join('');
                impactHtml = `<span style="color: #dc3545; font-weight:bold;">⚠ Usado en ${act.otherUsages.length} más:</span><ul style="margin:5px 0; padding-left:0; font-size:0.85em; list-style:none;">${list}</ul>`;
            }

            rowsHtml += `
                <tr>
                    <td style="width:15%">${typeLabel}</td>
                    <td style="width:35%; text-align:left;">
                        <strong>${act.name}</strong><br>
                        <small style="color: #666;">${act.description || 'Sin descripción'}</small>
                    </td>
                    <td style="width:50%; text-align:left;">${impactHtml}</td>
                </tr>`;
        }
        stepBlock.innerHTML = `
            <h4>Paso ${step.step}</h4>
            <div class="table-container">
                <table class="folder-results-table">
                    <thead><tr><th>Tipo</th><th>Actividad / Descripción</th><th>Impacto en otros procesos</th></tr></thead>
                    <tbody>${rowsHtml}</tbody>
                </table>
            </div>`;
        container.appendChild(stepBlock);
    }
}

// --- MOTOR DE COLORES PARA PDF ---
function drawCodeWithColors(doc, code, type, startY) {
    const isSql = type === 'sql';
    const margin = 10;
    const pageWidth = 190; 
    const cleanCode = code.replace(/\t/g, '    ');
    const lines = doc.splitTextToSize(cleanCode, pageWidth);
    const lineHeight = 3.5;
    doc.setFont("courier", "normal").setFontSize(6);
    const colorMap = {
        keyword: [40, 116, 166], string: [34, 153, 84], comment: [128, 128, 128], number: [211, 84, 0], default: [50, 50, 50]
    };
    const sqlKeywords = /\b(SELECT|FROM|WHERE|AND|OR|JOIN|INNER|LEFT|OUTER|ON|GROUP|BY|ORDER|UNION|ALL|AS|INSERT|INTO|UPDATE|SET|DELETE|DISTINCT|CASE|WHEN|THEN|ELSE|END|NOT|NULL|IS|TOP|DESC|ASC)\b/gi;
    const jsKeywords = /\b(var|let|const|function|return|if|else|for|while|try|catch|Platform|Load|HTTP|Get|Post|Write|Stringify|ParseJSON|new|Date|getTime)\b/g;

    let currentY = startY + 5;
    lines.forEach((line) => {
        if (currentY > 280) { doc.addPage(); currentY = 20; }
        doc.setFillColor(248, 249, 249).rect(margin, currentY - 2.5, pageWidth + 2, lineHeight, 'F');
        let xOffset = margin + 2;
        const tokens = line.split(/(\s+|'[^']*'|"[^"]*"|--.*|\/\/.*)/g);
        tokens.forEach(token => {
            if (!token) return;
            if (token.match(/^(--|\/\/)/)) doc.setTextColor(...colorMap.comment);
            else if (token.match(/^['"]/)) doc.setTextColor(...colorMap.string);
            else if (token.match(isSql ? sqlKeywords : jsKeywords)) doc.setTextColor(...colorMap.keyword);
            else if (token.match(/^\b\d+\b$/)) doc.setTextColor(...colorMap.number);
            else doc.setTextColor(...colorMap.default);
            doc.text(token, xOffset, currentY);
            xOffset += doc.getTextWidth(token);
        });
        currentY += lineHeight;
    });
    doc.setFont("helvetica", "normal"); 
    return currentY + 5;
}

async function generatePDF() {
    if (!currentAutomationDetails) return;
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF('p', 'mm', 'a4');
    const auto = currentAutomationDetails;

    doc.setFont("helvetica");
    doc.setFontSize(18).setTextColor(40, 116, 166).text(`${auto.name}`, 10, 20);

    doc.autoTable({
        startY: 25, margin: { left: 10, right: 10 }, theme: 'plain', styles: { fontSize: 9, cellPadding: 1, font: 'helvetica' },
        columnStyles: { 0: { fontStyle: 'bold', width: 35 } },
        body: [
            ["Estado:", auto.status],
            ["Descripción:", auto.description || "Sin descripción"]
        ]
    });

    let finalY = doc.lastAutoTable.finalY + 10;

    for (const step of auto.steps || []) {
        if (finalY > 260) { doc.addPage(); finalY = 20; }
        doc.setFontSize(13).setTextColor(40, 116, 166).text(`Paso ${step.step}`, 10, finalY);
        finalY += 6;

        for (const act of step.activities || []) {
            const typeLabel = activityTypeMap[act.objectTypeId] || act.objectTypeId;
            
            // Texto de impacto para la tabla
            let impactText = "Actividad exclusiva de este automatismo.";
            let impactColor = [40, 167, 69]; // Verde

            if (act.otherUsages && act.otherUsages.length > 0) {
                impactText = `Actividad reutilizada en ${act.otherUsages.length} procesos:\n` + 
                             act.otherUsages.map(u => `- ${u.automationName} (Paso ${u.step})`).join('\n');
                impactColor = [200, 0, 0]; // Rojo
            }

            doc.autoTable({
                startY: finalY, margin: { left: 10, right: 10 }, theme: 'grid',
                headStyles: { fillColor: [240, 240, 240], textColor: 0, fontStyle: 'bold' },
                styles: { fontSize: 8, overflow: 'linebreak', font: 'helvetica' },
                head: [[{ content: act.name, colSpan: 2 }]],
                body: [
                    ["Tipo", typeLabel],
                    ["Descripción", act.description || "Sin descripción"],
                    ["Impacto", { content: impactText, styles: { textColor: impactColor, fontStyle: 'bold' } }]
                ],
                columnStyles: { 0: { fontStyle: 'bold', width: 35 } }
            });

            finalY = doc.lastAutoTable.finalY + 3;

            if (act.detailedInfo?.["Data Fields"]) {
                doc.autoTable({
                    startY: finalY, margin: { left: 10, right: 10 }, theme: 'grid', styles: { fontSize: 7, font: 'helvetica' },
                    headStyles: { fillColor: [230, 230, 230], textColor: 0 },
                    head: [['Campo', 'Tipo', 'Valor']],
                    body: act.detailedInfo["Data Fields"].map(f => [f.name, f.type, f.value])
                });
                finalY = doc.lastAutoTable.finalY + 4;
            }

            const code = act.queryText || act.scriptCode;
            if (code) {
                const type = act.objectTypeId === 300 ? 'sql' : 'js';
                finalY = drawCodeWithColors(doc, code, type, finalY);
            }
            finalY += 5;
        }
        finalY += 5;
    }
    doc.save(`Docu_${auto.name.replace(/\s+/g, '_')}.pdf`);
}

function formatDate(date) {
    if (!date || date.startsWith('0001')) return 'N/A';
    return new Date(date).toLocaleString();
}