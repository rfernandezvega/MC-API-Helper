// Fichero: src/renderer/components/audit-pdf-generator.js
// Descripción: Módulo para exportar la auditoría a PDF dibujando los gráficos de la vista.
// Usa AUDIT_PALETTE (audit/audit-ui.js) para que el informe tenga la misma paleta que el
// dashboard: jsPDF no entiende var(--sf-*), por eso la paleta se define en HEX.

import * as ui from '../ui/ui-helpers.js';
import { loadCustomFonts } from '../ui/fonts.js';
import { AUDIT_PALETTE, CALLOUT_STYLES } from './audit/audit-ui.js';

/**
 * Resuelve el color de acento de un callout del pdfData.
 * Pipeline nuevo: los callouts llegan como objetos {type, title, message} y el color sale de
 * CALLOUT_STYLES según el tipo. Compatibilidad con cachés antiguas: si el objeto guardado trae
 * 'color' (formato del antiguo parsePdfCallout) se respeta ese valor.
 * @param {{type?:string, color?:string}} callout
 * @returns {string} HEX del acento.
 */
function resolveCalloutAccent(callout) {
    if (callout?.color) return callout.color;
    return (CALLOUT_STYLES[callout?.type] || CALLOUT_STYLES.info).accent;
}

/**
 * Genera y descarga el informe PDF de la auditoría a partir del pdfData registrado
 * por las pestañas (KPIs, tarjetas de barras y callouts por sección).
 * @param {object} pdfData - Datos por sección registrados en audit-state (registerPdfData).
 * @param {{timeStr:string, calls:number}|null} stats - Estadísticas del escaneo.
 * @param {string} clientName - Nombre del contexto activo (para portada y nombre de fichero).
 */
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

        // Colores base del informe desde la paleta compartida
        const titleRgb = hexToRgb(AUDIT_PALETTE.blueDark);
        const mutedRgb = hexToRgb(AUDIT_PALETTE.gray);

        let currentY = 20;

        // --- PORTADA Y CABECERA ---
        doc.setFontSize(22).setTextColor(titleRgb.r, titleRgb.g, titleRgb.b).setFont("helvetica", "bold");
        doc.text(`Informe de Auditoría Marketing Cloud`, 14, currentY);

        currentY += 10;
        doc.setFontSize(12).setTextColor(mutedRgb.r, mutedRgb.g, mutedRgb.b).setFont("helvetica", "normal");
        const dateStr = new Date().toLocaleString('es-ES');
        doc.text(`Entorno: ${clientName || 'Desconocido'}`, 14, currentY);
        doc.text(`Fecha: ${dateStr}`, 140, currentY);

        if (stats) {
            currentY += 8;
            doc.setFontSize(10).setTextColor(mutedRgb.r, mutedRgb.g, mutedRgb.b);
            doc.text(`Tiempo de escaneo: ${stats.timeStr} | Llamadas a la API: ${stats.calls}`, 14, currentY);
        }

        currentY += 10;

        const sections = [
            { key: 'users', title: '1. GESTIÓN DE USUARIOS' },
            { key: 'autos', title: '2. AUTOMATISMOS' },
            { key: 'journeys', title: '3. JOURNEYS' },
            { key: 'cp', title: '4. CLOUD PAGES' },
            { key: 'sm', title: '5. SEND MANAGEMENT' },
            { key: 'de', title: '6. DATA EXTENSIONS' },
            { key: 'content', title: '7. CONTENIDOS' }
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

            // TÍTULO DE SECCIÓN: banda en azul oscuro de la app con texto blanco (contraste alto)
            doc.setFontSize(16).setTextColor(255, 255, 255).setFont("helvetica", "bold");
            doc.setFillColor(titleRgb.r, titleRgb.g, titleRgb.b);
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

                    // Fondo de caja (neutra, sin línea de color: como el dashboard)
                    doc.setDrawColor(220, 220, 220);
                    doc.setFillColor(255, 255, 255);
                    doc.rect(kpiX, currentY, kpiWidth, kpiHeight, 'FD');

                    const rgb = hexToRgb(kpi.color || AUDIT_PALETTE.blue);

                    // Valor
                    doc.setFontSize(18).setTextColor(rgb.r, rgb.g, rgb.b).setFont("helvetica", "bold");
                    const valText = String(kpi.value);
                    doc.text(valText, kpiX + (kpiWidth / 2), currentY + 10, { align: 'center' });

                    // Etiqueta
                    doc.setFontSize(7).setTextColor(mutedRgb.r, mutedRgb.g, mutedRgb.b).setFont("helvetica", "normal");
                    const splitLabel = doc.splitTextToSize(kpi.label.toUpperCase(), kpiWidth - 2);
                    doc.text(splitLabel, kpiX + (kpiWidth / 2), currentY + 15, { align: 'center' });

                    kpiX += kpiWidth + 3;
                }
                currentY += kpiHeight + 10;
            }

            // PINTAR CALLOUTS / MENSAJES (objetos {type, title, message})
            if (data.callouts && data.callouts.length > 0) {
                for (const callout of data.callouts) {
                    if (currentY + 20 > 275) { doc.addPage(); currentY = 20; }

                    const rgb = hexToRgb(resolveCalloutAccent(callout));

                    // Barra lateral con el acento del tipo (danger/warning/info/success)
                    doc.setFillColor(rgb.r, rgb.g, rgb.b);
                    doc.rect(14, currentY, 2, 14, 'F');

                    // Fondo neutro claro
                    doc.setFillColor(248, 249, 250);
                    doc.rect(16, currentY, 180, 14, 'F');

                    // Título en el acento del tipo (mismo tono que el texto del dashboard)
                    doc.setFontSize(9).setTextColor(rgb.r, rgb.g, rgb.b).setFont("helvetica", "bold");
                    doc.text(stripHtml(callout.title), 20, currentY + 5);

                    // Mensaje en gris oscuro legible
                    doc.setFontSize(8).setTextColor(60, 60, 60).setFont("helvetica", "normal");
                    const msgLines = doc.splitTextToSize(stripHtml(callout.message), 170);
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
                doc.setFontSize(8).setTextColor(mutedRgb.r, mutedRgb.g, mutedRgb.b).setFont("helvetica", "normal");
                const helpLines = doc.splitTextToSize(card.help || '', 175);
                doc.text(helpLines, 18, currentY + 13);
                const headerUsed = HEADER_H + Math.max(0, (helpLines.length - 1) * 4);
                currentY += headerUsed;

                if (bars.length === 0) {
                    doc.setFontSize(9).setTextColor(mutedRgb.r, mutedRgb.g, mutedRgb.b).setFont("helvetica", "italic");
                    doc.text("Sin datos disponibles.", 18, currentY);
                    currentY += BAR_H;
                } else {
                    // Fondo de la tarjeta: calcular cuántas barras caben en la página actual
                    // y paginar el resto
                    let barsRemaining = [...bars];

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
                            const rgb       = hexToRgb(bar.color || AUDIT_PALETTE.blue);

                            doc.setFillColor(rgb.r, rgb.g, rgb.b);
                            if (fillWidth > 0) doc.rect(100, currentY, fillWidth, 4, 'F');

                            doc.setFontSize(9).setTextColor(rgb.r, rgb.g, rgb.b).setFont("helvetica", "bold");
                            doc.text(String(bar.value), 175, currentY + 4, { align: 'right' });
                            doc.setFontSize(8).setTextColor(mutedRgb.r, mutedRgb.g, mutedRgb.b).setFont("helvetica", "normal");
                            doc.text(`${pct}%`, 193, currentY + 4, { align: 'right' });

                            currentY += BAR_H;
                        }

                        // Si quedan barras, nueva página y repetir título abreviado
                        if (barsRemaining.length > 0) {
                            doc.addPage();
                            currentY = PAGE_TOP;
                            doc.setFontSize(10).setTextColor(mutedRgb.r, mutedRgb.g, mutedRgb.b).setFont("helvetica", "italic");
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

/**
 * Elimina etiquetas HTML de un texto de callout (los mensajes pueden traer <b>…</b>
 * porque en el dashboard se pintan como innerHTML).
 * @param {string} text
 * @returns {string}
 */
function stripHtml(text) {
    return String(text || '').replace(/<[^>]+>/g, '');
}

/**
 * Convierte un color HEX (#rrggbb) a componentes RGB para jsPDF.
 * Si el valor no parsea devuelve el azul de la paleta (#0070d2).
 * @param {string} hex
 * @returns {{r:number, g:number, b:number}}
 */
function hexToRgb(hex) {
    let result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16)
    } : { r: 0, g: 112, b: 210 }; // azul --sf-blue por defecto
}
