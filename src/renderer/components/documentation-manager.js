// Fichero: src/renderer/components/documentation-manager.js
// Descripción: Módulo para gestionar la interactividad de la sección de documentación.

/**
 * Inicializa los listeners para la sección de documentación.
 */
export function init() {
    // Listener para el acordeón dentro de la documentación
    const allAccordionHeaders = document.querySelectorAll('.docu-accordion-header');
    allAccordionHeaders.forEach(header => {
        header.addEventListener('click', () => {
            const parentAccordion = header.closest('.docu-accordion');
            const activeHeader = parentAccordion.querySelector('.docu-accordion-header.active');
            
            if (activeHeader && activeHeader !== header) {
                activeHeader.classList.remove('active');
                activeHeader.nextElementSibling.style.maxHeight = null;
            }

            header.classList.toggle('active');
            const content = header.nextElementSibling;
            if (content.style.maxHeight) {
                content.style.maxHeight = null; // Colapsar
            } else {
                content.style.maxHeight = content.scrollHeight + "px"; // Expandir
            }
        });
    });
}