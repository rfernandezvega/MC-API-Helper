// Fichero: src/renderer/components/audit-pdf-generator.js
// Descripción: Módulo para exportar la auditoría a PDF dibujando los gráficos de la vista.

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
        doc.text(`Informe de Auditoría Marketing Cloud`, 14, currentY);
        
        currentY += 10;
        doc.setFontSize(12).setTextColor(100, 100, 100).setFont("helvetica", "normal");
        const dateStr = new Date().toLocaleString('es-ES');
        doc.text(`Entorno: ${clientName || 'Desconocido'}`, 14, currentY);
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
            { key: 'sm', title: '5. SEND MANAGEMENT' },
            { key: 'de', title: '6. DATA EXTENSIONS' }
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

            // PINTAR CALLOUTS / MENSAJES
            if (data.callouts && data.callouts.length > 0) {
                for (const callout of data.callouts) {
                    if (currentY + 20 > 275) { doc.addPage(); currentY = 20; }
                    
                    const rgb = hexToRgb(callout.color || '#3498db');
                    
                    // Barra lateral de color
                    doc.setFillColor(rgb.r, rgb.g, rgb.b);
                    doc.rect(14, currentY, 2, 14, 'F');
                    
                    // Fondo
                    doc.setFillColor(248, 249, 250);
                    doc.rect(16, currentY, 180, 14, 'F');
                    
                    // Título
                    doc.setFontSize(9).setTextColor(44, 62, 80).setFont("helvetica", "bold");
                    doc.text(callout.title, 20, currentY + 5);
                    
                    // Mensaje
                    doc.setFontSize(8).setTextColor(100, 100, 100).setFont("helvetica", "normal");
                    const msgLines = doc.splitTextToSize(callout.message, 170);
                    doc.text(msgLines, 20, currentY + 10);
                    
                    currentY += 14 + Math.max(0, (msgLines.length - 1) * 4) + 4;
                }
            }
            
            // PINTAR TARJETAS (Gráficos de barras)
            // Las tarjetas "wide" ocupan todo el ancho; las normales podrían pintarse en columnas,
            // pero por legibilidad en PDF se pintan todas a ancho completo.
            for (const card of data.cards) {
                const HEADER_H = 18; // espacio para título + ayuda
                const BAR_H    = 7;  // alto por fila de barra
                const PAD      = 5;  // padding inferior entre tarjetas
                const PAGE_MAX = 275;
                const PAGE_TOP = 20;

                const bars = card.bars || [];

                // ¿Cabe al menos la cabecera + 1 barra en la página actual?
                if (currentY + HEADER_H + BAR_H > PAGE_MAX) {
                    doc.addPage();
                    currentY = PAGE_TOP;
                }

                // Dibujar cabecera de tarjeta
                doc.setFontSize(11).setTextColor(40, 40, 40).setFont("helvetica", "bold");
                doc.text(card.title, 18, currentY + 8);
                doc.setFontSize(8).setTextColor(120, 120, 120).setFont("helvetica", "normal");
                const helpLines = doc.splitTextToSize(card.help || '', 175);
                doc.text(helpLines, 18, currentY + 13);
                const headerUsed = HEADER_H + Math.max(0, (helpLines.length - 1) * 4);
                currentY += headerUsed;

                if (bars.length === 0) {
                    doc.setFontSize(9).setTextColor(150, 150, 150).setFont("helvetica", "italic");
                    doc.text("Sin datos disponibles.", 18, currentY);
                    currentY += BAR_H;
                } else {
                    // Fondo de la tarjeta: calcular cuántas barras caben en la página actual
                    // y paginar el resto
                    let barsRemaining = [...bars];
                    let firstChunk = true;

                    while (barsRemaining.length > 0) {
                        const spaceLeft   = PAGE_MAX - currentY;
                        const barsFit     = Math.max(1, Math.floor(spaceLeft / BAR_H));
                        const chunk       = barsRemaining.splice(0, barsFit);
                        const chunkHeight = chunk.length * BAR_H;

                        // Fondo del bloque (solo si hay espacio)
                        doc.setDrawColor(220, 220, 220);
                        doc.setFillColor(255, 255, 255);
                        doc.rect(14, currentY - 2, 182, chunkHeight + 4, 'FD');

                        for (const bar of chunk) {
                            let labelText = bar.label || '';
                            if (labelText.length > 50) labelText = labelText.substring(0, 47) + '...';

                            doc.setFontSize(8).setTextColor(60, 60, 60).setFont("helvetica", "normal");
                            doc.text(labelText, 18, currentY + 4);

                            // Barra base gris
                            doc.setFillColor(240, 240, 240);
                            doc.rect(100, currentY, 65, 4, 'F');

                            const pct       = bar.total > 0 ? Math.min(100, Math.round((bar.value / bar.total) * 100)) : 0;
                            const fillWidth = (pct / 100) * 65;
                            const rgb       = hexToRgb(bar.color || '#69a3db');

                            doc.setFillColor(rgb.r, rgb.g, rgb.b);
                            if (fillWidth > 0) doc.rect(100, currentY, fillWidth, 4, 'F');

                            doc.setFontSize(9).setTextColor(rgb.r, rgb.g, rgb.b).setFont("helvetica", "bold");
                            doc.text(String(bar.value), 175, currentY + 4, { align: 'right' });
                            doc.setFontSize(8).setTextColor(150, 150, 150).setFont("helvetica", "normal");
                            doc.text(`${pct}%`, 193, currentY + 4, { align: 'right' });

                            currentY += BAR_H;
                        }

                        // Si quedan barras, nueva página y repetir título abreviado
                        if (barsRemaining.length > 0) {
                            doc.addPage();
                            currentY = PAGE_TOP;
                            doc.setFontSize(10).setTextColor(100, 100, 100).setFont("helvetica", "italic");
                            doc.text(`${card.title} (continuación)`, 18, currentY);
                            currentY += 8;
                        }
                    }
                }
                currentY += PAD;
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