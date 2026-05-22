// Fichero: src/renderer/components/audit-pdf-generator.js
// Descripción: Módulo para exportar la auditoría técnica a PDF dibujando los gráficos de la vista.

import * as ui from '../ui/ui-helpers.js';
import { loadCustomFonts } from '../ui/fonts.js';

export async function generateAuditPDF(pdfData, stats, clientName) {
    if (!pdfData || Object.keys(pdfData).length === 0) {
        ui.showCustomAlert("No hay datos de gráficos para exportar. Ejecuta la auditoría primero.");
        return;
    }

    ui.blockUI("Generando informe PDF de la auditoría. Por favor, espera...");

    try {
        const { jsPDF } = window.jspdf;
        // Usamos formato vertical estándar
        const doc = new jsPDF('p', 'mm', 'a4'); 
        
        try {
            loadCustomFonts(doc);
            doc.setFont('NotoSans');
        } catch (e) {
            console.warn("No se pudieron cargar las fuentes en el PDF.");
        }

        let currentY = 20;

        // --- PORTADA Y CABECERA ---
        doc.setFontSize(22).setTextColor(40, 116, 166).setFont("helvetica", "bold");
        doc.text(`Informe de Auditoría Técnica SFMC`, 14, currentY);
        
        currentY += 10;
        doc.setFontSize(12).setTextColor(100, 100, 100).setFont("helvetica", "normal");
        const dateStr = new Date().toLocaleString('es-ES');
        doc.text(`Cliente/Entorno: ${clientName || 'Desconocido'}`, 14, currentY);
        doc.text(`Fecha: ${dateStr}`, 140, currentY);
        
        if (stats) {
            currentY += 8;
            doc.setFontSize(10).setTextColor(150, 150, 150);
            doc.text(`Tiempo de escaneo: ${stats.timeStr} | Llamadas a la API: ${stats.calls}`, 14, currentY);
        }

        currentY += 10;

        const sections = [
            { key: 'users', title: '1. GESTIÓN DE USUARIOS' },
            { key: 'autos', title: '2. AUTOMATISMOS' },
            { key: 'journeys', title: '3. JOURNEYS' },
            { key: 'cp', title: '4. CLOUD PAGES' },
            { key: 'sm', title: '5. SEND MANAGEMENT' }
        ];

        for (let i = 0; i < sections.length; i++) {
            const sectionConfig = sections[i];
            const data = pdfData[sectionConfig.key];
            if (!data) continue;

            // Salto de página para todas las secciones excepto la primera
            if (i > 0) {
                doc.addPage();
                currentY = 20;
            }

            // TÍTULO DE SECCIÓN
            doc.setFontSize(16).setTextColor(255, 255, 255).setFont("helvetica", "bold");
            doc.setFillColor(52, 73, 94); // Gris oscuro azulado
            doc.rect(14, currentY - 6, 182, 10, 'F');
            doc.text(sectionConfig.title, 16, currentY + 1);
            currentY += 15;

            // PINTAR KPIs (Cajas pequeñas)
            if (data.kpis && data.kpis.length > 0) {
                let kpiX = 14;
                const kpiWidth = 34;
                const kpiHeight = 18;

                for (const kpi of data.kpis) {
                    if (kpiX + kpiWidth > 200) {
                        kpiX = 14;
                        currentY += kpiHeight + 5;
                    }

                    // Fondo de caja
                    doc.setDrawColor(220, 220, 220);
                    doc.setFillColor(255, 255, 255);
                    doc.rect(kpiX, currentY, kpiWidth, kpiHeight, 'FD');
                    
                    // Línea superior de color
                    const rgb = hexToRgb(kpi.color || '#69a3db');
                    doc.setFillColor(rgb.r, rgb.g, rgb.b);
                    doc.rect(kpiX, currentY, kpiWidth, 2, 'F');

                    // Valor
                    doc.setFontSize(18).setTextColor(rgb.r, rgb.g, rgb.b).setFont("helvetica", "bold");
                    const valText = String(kpi.value);
                    doc.text(valText, kpiX + (kpiWidth / 2), currentY + 10, { align: 'center' });

                    // Etiqueta
                    doc.setFontSize(7).setTextColor(100, 100, 100).setFont("helvetica", "normal");
                    const splitLabel = doc.splitTextToSize(kpi.label.toUpperCase(), kpiWidth - 2);
                    doc.text(splitLabel, kpiX + (kpiWidth / 2), currentY + 15, { align: 'center' });

                    kpiX += kpiWidth + 3;
                }
                currentY += kpiHeight + 10;
            }

            // PINTAR TARJETAS (Gráficos de barras)
            for (const card of data.cards) {
                // Prevenir corte de página si la tarjeta es larga
                const cardEstHeight = 15 + (card.bars.length * 7);
                if (currentY + cardEstHeight > 280) {
                    doc.addPage();
                    currentY = 20;
                }

                // Fondo tarjeta
                doc.setDrawColor(220, 220, 220);
                doc.setFillColor(255, 255, 255);
                doc.rect(14, currentY, 182, cardEstHeight, 'FD');

                // Título de la tarjeta
                doc.setFontSize(11).setTextColor(40, 40, 40).setFont("helvetica", "bold");
                doc.text(card.title, 18, currentY + 8);
                
                // Texto de ayuda
                doc.setFontSize(8).setTextColor(120, 120, 120).setFont("helvetica", "normal");
                doc.text(card.help || '', 18, currentY + 12);

                let barY = currentY + 18;

                if (card.bars.length === 0) {
                    doc.setFontSize(9).setTextColor(150, 150, 150).setFont("helvetica", "italic");
                    doc.text("Sin datos disponibles.", 18, barY);
                } else {
                    for (const bar of card.bars) {
                        doc.setFontSize(8).setTextColor(60, 60, 60).setFont("helvetica", "normal");
                        // Truncar label si es muy largo
                        let labelText = bar.label;
                        if (labelText.length > 50) labelText = labelText.substring(0, 47) + '...';
                        doc.text(labelText, 18, barY);

                        // Barra base gris
                        doc.setFillColor(240, 240, 240);
                        doc.rect(100, barY - 3, 60, 4, 'F');

                        // Porcentaje
                        const pct = bar.total > 0 ? Math.min(100, Math.round((bar.value / bar.total) * 100)) : 0;
                        const fillWidth = (pct / 100) * 60;

                        // Barra color
                        const rgb = hexToRgb(bar.color || '#69a3db');
                        doc.setFillColor(rgb.r, rgb.g, rgb.b);
                        if (fillWidth > 0) {
                            doc.rect(100, barY - 3, fillWidth, 4, 'F');
                        }

                        // Textos derecha
                        doc.setFontSize(9).setTextColor(rgb.r, rgb.g, rgb.b).setFont("helvetica", "bold");
                        doc.text(String(bar.value), 175, barY, { align: 'right' });
                        doc.setFontSize(8).setTextColor(150, 150, 150).setFont("helvetica", "normal");
                        doc.text(`${pct}%`, 190, barY, { align: 'right' });

                        barY += 7;
                    }
                }
                currentY += cardEstHeight + 5;
            }
        }

        const safeName = (clientName || 'Export').replace(/[^a-zA-Z0-9]/g, '_');
        doc.save(`Auditoria_SFMC_${safeName}.pdf`);

    } catch (error) {
        console.error("Error generando PDF:", error);
        ui.showCustomAlert(`Error al generar el PDF: ${error.message}`);
    } finally {
        ui.unblockUI();
    }
}

// Función auxiliar para convertir Hex a RGB para jsPDF
function hexToRgb(hex) {
    let result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16)
    } : { r: 105, g: 163, b: 219 }; // Default blueish
}