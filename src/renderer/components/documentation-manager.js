// Fichero: src/renderer/components/documentation-manager.js
// Descripción: Módulo para gestionar la interactividad de la sección de documentación.

/**
 * Inicializa los listeners para la sección de documentación.
 */
export function init() {
    // 1. LÓGICA DE ACORDEONES
    const allAccordionHeaders = document.querySelectorAll('.docu-accordion-header');
    allAccordionHeaders.forEach(header => {
        header.addEventListener('click', () => {
            const content = header.nextElementSibling;
            const isOpen = header.classList.contains('active');
            
            // Cerramos otros en el mismo grupo
            const parentAccordion = header.closest('.docu-accordion');
            parentAccordion.querySelectorAll('.docu-accordion-header.active').forEach(h => {
                if (h !== header) {
                    h.classList.remove('active');
                    h.nextElementSibling.style.maxHeight = null;
                }
            });

            if (isOpen) {
                header.classList.remove('active');
                content.style.maxHeight = null;
            } else {
                header.classList.add('active');
                // Usamos un buffer de 800px para evitar que las imágenes se corten al cargar
                content.style.maxHeight = (content.scrollHeight + 800) + "px";
            }
        });
    });

    // 2. LÓGICA DEL BUSCADOR
    const searchInput = document.getElementById('docu-search-input');
    if (searchInput) {
        searchInput.addEventListener('input', function() {
            const query = this.value.toLowerCase().trim();
            const groups = document.querySelectorAll('.docu-group');
            const noResults = document.getElementById('docu-no-results');
            let anyVisible = false;

            groups.forEach(group => {
                const items = group.querySelectorAll('.docu-accordion-item');
                let groupHasVisibleItems = false;

                items.forEach(item => {
                    const text = item.innerText.toLowerCase();
                    const keywords = (item.getAttribute('data-keywords') || '').toLowerCase();

                    if (text.includes(query) || keywords.includes(query)) {
                        item.classList.remove('hidden');
                        groupHasVisibleItems = true;
                        anyVisible = true;
                    } else {
                        item.classList.add('hidden');
                        const header = item.querySelector('.docu-accordion-header');
                        const content = item.querySelector('.docu-accordion-content');
                        header.classList.remove('active');
                        content.style.maxHeight = null;
                    }
                });

                if (groupHasVisibleItems) group.classList.remove('hidden');
                else group.classList.add('hidden');
            });

            if (anyVisible) noResults.classList.add('hidden');
            else noResults.classList.remove('hidden');
        });
    }

    // 3. LÓGICA DE LIGHTBOX (AMPLIAR IMÁGENES)
    const lightbox = document.getElementById('docu-lightbox');
    const lightboxImg = document.getElementById('lightbox-img');
    const lightboxCaption = document.getElementById('lightbox-caption');

    if (lightbox) {
        // Clic en cualquier imagen de la docu
        document.querySelectorAll('.docu-accordion-content img').forEach(img => {
            img.addEventListener('click', (e) => {
                e.stopPropagation();
                lightboxImg.src = img.src;
                
                const caption = img.nextElementSibling;
                lightboxCaption.innerText = (caption && caption.classList.contains('docu-img-caption')) 
                    ? caption.innerText 
                    : "";
                
                lightbox.classList.remove('hidden');
            });
        });

        // Cerrar al clicar fondo o X
        lightbox.addEventListener('click', () => {
            lightbox.classList.add('hidden');
        });

        // Cerrar con Escape
        document.addEventListener('keydown', (e) => {
            if (e.key === "Escape") lightbox.classList.add('hidden');
        });
    }
}