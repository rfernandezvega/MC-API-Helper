// =======================================================================================
// --- Fichero: src/renderer/ui/ui-helpers.js ---
// --- Descripción: Contiene funciones de ayuda para manipular la interfaz de usuario,
// ---              como mostrar modales, gestionar el estado de carga y la navegación.
// =======================================================================================

import elements from './dom-elements.js';

/**
 * Muestra un modal de alerta no bloqueante.
 * @param {string} message - El mensaje a mostrar.
 */
export function showCustomAlert(message) {
    elements.customAlertMessage.textContent = message;
    elements.customAlertModal.style.display = 'flex';
}

/** Cierra el modal de alerta personalizado. */
export function closeCustomAlert() {
    elements.customAlertModal.style.display = 'none';
}

/**
 * Muestra un modal de confirmación no bloqueante.
 * @param {string} message - El mensaje de confirmación.
 * @returns {Promise<boolean>} - Resuelve a `true` si se confirma, `false` si se cancela.
 */
export function showCustomConfirm(message) {
    return new Promise(resolve => {
        elements.customConfirmMessage.textContent = message;
        elements.customConfirmModal.style.display = 'flex';

        const closeAndResolve = (value) => {
            elements.customConfirmModal.style.display = 'none';
            resolve(value);
        };

        elements.customConfirmOkBtn.addEventListener('click', () => closeAndResolve(true), { once: true });
        elements.customConfirmCancelBtn.addEventListener('click', () => closeAndResolve(false), { once: true });
        elements.customConfirmModal.addEventListener('click', (e) => {
            if (e.target === elements.customConfirmModal) closeAndResolve(false);
        }, { once: true });
    });
}

/**
 * Muestra un overlay de carga para prevenir interacciones.
 * @param {string} [message='Cargando...'] - El mensaje a mostrar.
 */
export function blockUI(message = 'Cargando...') {
    if (document.activeElement) document.activeElement.blur();
    if (elements.loaderText) {
        elements.loaderText.textContent = message;
    }
    elements.loaderOverlay.style.display = 'flex';
}

/** Oculta el overlay de carga. */
export function unblockUI() {
    elements.loaderOverlay.style.display = 'none';
    elements.appContainer.style.display = 'none';
    void elements.appContainer.offsetHeight;
    elements.appContainer.style.display = '';
    setTimeout(() => document.body.focus(), 0);
}

/**
 * Muestra una sección específica y oculta las demás.
 * @param {string} sectionId - El ID del elemento de la sección a mostrar.
 * @param {Array} navigationHistory - El array del historial de navegación para actualizarlo.
 * @param {boolean} [addToHistory=true] - Si es `false`, no añade la vista al historial.
 */
export function showSection(sectionId, navigationHistory, addToHistory = true) {
    elements.mainMenu.style.display = 'none';
    elements.allSections.forEach(s => s.style.display = 'none');

    const sectionToShow = document.getElementById(sectionId);
    if (sectionToShow) {
        sectionToShow.style.display = 'flex';
    } else {
        elements.mainMenu.style.display = 'flex';
        sectionId = 'main-menu';
    }

    if (addToHistory && Array.isArray(navigationHistory) && navigationHistory[navigationHistory.length - 1] !== sectionId) {
        navigationHistory.push(sectionId);
    }
}

/**
 * Muestra un modal reutilizable para buscar, seleccionar y confirmar la selección de una carpeta.
 * @param {string} contentType - El tipo de contenido a buscar (ej. 'dataextension').
 * @param {object} dependencies - Un objeto que contiene las dependencias necesarias.
 * @param {Function} dependencies.getAuthenticatedConfig - Función para obtener la config de la API.
 * @param {object} dependencies.mcApiService - El módulo de servicio de la API.
 * @param {object} dependencies.logger - El módulo de logging.
 * @returns {Promise<{id: string, fullPath: string}|null>} Promesa que resuelve con el objeto de la carpeta seleccionada, o null si se cancela.
 */
export function showFolderSelectorModal(contentType, dependencies) {
    const { getAuthenticatedConfig, mcApiService, logger } = dependencies;

    return new Promise(resolve => {
        let selectedFolderData = null; // Variable para guardar la selección temporal

        // --- Configuración Inicial del Modal ---
        elements.folderSelectorTitle.textContent = `Seleccionar Carpeta para: ${contentType}`;
        elements.folderSearchInput.value = '';
        elements.folderSelectorTable.classList.add('hidden');
        elements.folderSelectorResultsContainer.firstElementChild.textContent = 'Realiza una búsqueda para ver los resultados.';
        elements.folderSelectorTbody.innerHTML = '';
        elements.folderSelectorOkBtn.disabled = true;
        elements.folderSelectorModal.style.display = 'flex';
        elements.folderSearchInput.focus();

        // --- Definición de Handlers ---
        const handleSearch = async () => {
            const searchTerm = elements.folderSearchInput.value.trim();
            if (!searchTerm) return;
            blockUI("Buscando carpetas...");
            try {
                const apiConfig = await getAuthenticatedConfig();
                mcApiService.setLogger(logger);
                const folders = await mcApiService.findDataFolders(searchTerm, contentType, apiConfig);
                
                elements.folderSelectorTbody.innerHTML = '';
                if (folders.length === 0) {
                    elements.folderSelectorTable.classList.add('hidden');
                    elements.folderSelectorResultsContainer.firstElementChild.textContent = 'No se encontraron carpetas.';
                } else {
                    folders.forEach(folder => {
                        const row = elements.folderSelectorTbody.insertRow();
                        row.dataset.folderId = folder.id;
                        row.dataset.folderPath = folder.fullPath;
                        row.innerHTML = `<td>${folder.fullPath}</td>`;
                        row.style.cursor = 'pointer';
                    });
                    elements.folderSelectorTable.classList.remove('hidden');
                    elements.folderSelectorResultsContainer.firstElementChild.textContent = '';
                }
            } catch (error) { showCustomAlert(error.message); } finally { unblockUI(); }
        };

        const handleSelect = (e) => {
            const row = e.target.closest('tr');
            if (!row || !row.dataset.folderId) return;

            const previouslySelected = elements.folderSelectorTbody.querySelector('tr.selected');
            if (previouslySelected) previouslySelected.classList.remove('selected');

            row.classList.add('selected');
            selectedFolderData = { id: row.dataset.folderId, fullPath: row.dataset.folderPath };
            elements.folderSelectorOkBtn.disabled = false;
        };

        const cleanupAndClose = (resolutionValue) => {
            elements.folderSearchBtn.removeEventListener('click', handleSearch);
            elements.folderSearchInput.removeEventListener('keydown', handleEnterKey);
            elements.folderSelectorTbody.removeEventListener('click', handleSelect);
            elements.folderSelectorCancelBtn.removeEventListener('click', handleCancel);
            elements.folderSelectorOkBtn.removeEventListener('click', handleConfirm);
            elements.folderSelectorModal.style.display = 'none';
            resolve(resolutionValue);
        };
        
        const handleEnterKey = (e) => { if (e.key === 'Enter') { e.preventDefault(); handleSearch(); } };
        const handleCancel = () => cleanupAndClose(null);
        const handleConfirm = () => { if (selectedFolderData) cleanupAndClose(selectedFolderData); };

        // --- Asignación de Listeners ---
        elements.folderSearchBtn.addEventListener('click', handleSearch);
        elements.folderSearchInput.addEventListener('keydown', handleEnterKey);
        elements.folderSelectorTbody.addEventListener('click', handleSelect);
        elements.folderSelectorCancelBtn.addEventListener('click', handleCancel);
        elements.folderSelectorOkBtn.addEventListener('click', handleConfirm);
    });
}

/**
 * Muestra un modal para buscar y seleccionar una única DATA EXTENSION.
 * @param {object} dependencies - Dependencias necesarias.
 * @returns {Promise<{name: string, customerKey: string}|null>} El objeto de la DE seleccionada.
 */
export function showDESelectorModal(dependencies) {
    const { getAuthenticatedConfig, mcApiService, logger } = dependencies;
    
    return new Promise(resolve => {
        let selectedDEData = null;

        // --- Configuración Inicial del Modal ---
        elements.folderSelectorTitle.textContent = 'Seleccionar Data Extension';
        // Cambiamos las cabeceras de la tabla para que sean correctas para DEs
        elements.folderSelectorTable.querySelector('thead tr').innerHTML = '<th>Nombre DE</th><th>Ruta de Carpeta</th>';
        elements.folderSearchInput.value = '';
        elements.folderSelectorTable.classList.add('hidden');
        elements.folderSelectorResultsContainer.firstElementChild.textContent = 'Busca por nombre o parte del nombre.';
        elements.folderSelectorTbody.innerHTML = '';
        elements.folderSelectorOkBtn.disabled = true;
        elements.folderSelectorModal.style.display = 'flex';
        elements.folderSearchInput.focus();

        // --- Definición de Handlers ---
        const handleSearch = async () => {
            const searchTerm = elements.folderSearchInput.value.trim();
            if (!searchTerm) return;
            blockUI("Buscando Data Extensions...");
            try {
                const apiConfig = await getAuthenticatedConfig();
                mcApiService.setLogger(logger);
                // Usamos la función de búsqueda de DEs, no de carpetas
                const deList = await mcApiService.searchDataExtensions('Name', searchTerm, apiConfig);
                
                elements.folderSelectorTbody.innerHTML = '';
                if (deList.length === 0) {
                    elements.folderSelectorTable.classList.add('hidden');
                    elements.folderSelectorResultsContainer.firstElementChild.textContent = 'No se encontraron Data Extensions.';
                } else {
                    // El `for...of` permite usar `await` dentro del bucle para obtener las rutas
                    for (const de of deList) {
                        const row = elements.folderSelectorTbody.insertRow();
                        const folderPath = de.categoryId ? await mcApiService.getFolderPath(de.categoryId, apiConfig) : 'Raíz';
                        // Guardamos los datos necesarios en el dataset de la fila
                        row.dataset.deName = de.deName;
                        row.dataset.deKey = de.customerKey;
                        row.innerHTML = `<td>${de.deName}</td><td>${folderPath}</td>`;
                        row.style.cursor = 'pointer';
                    }
                    elements.folderSelectorTable.classList.remove('hidden');
                    elements.folderSelectorResultsContainer.firstElementChild.textContent = '';
                }
            } catch (error) { showCustomAlert(error.message); } finally { unblockUI(); }
        };

        const handleSelect = (e) => {
            const row = e.target.closest('tr');
            if (!row || !row.dataset.deKey) return;
            const previouslySelected = elements.folderSelectorTbody.querySelector('tr.selected');
            if (previouslySelected) previouslySelected.classList.remove('selected');
            row.classList.add('selected');
            selectedDEData = { name: row.dataset.deName, customerKey: row.dataset.deKey };
            elements.folderSelectorOkBtn.disabled = false;
        };

        const cleanupAndClose = (resolutionValue) => {
            elements.folderSearchBtn.removeEventListener('click', handleSearch);
            elements.folderSearchInput.removeEventListener('keydown', handleEnterKey);
            elements.folderSelectorTbody.removeEventListener('click', handleSelect);
            elements.folderSelectorCancelBtn.removeEventListener('click', handleCancel);
            elements.folderSelectorOkBtn.removeEventListener('click', handleConfirm);
            elements.folderSelectorModal.style.display = 'none';
            resolve(resolutionValue);
        };
        
        const handleEnterKey = (e) => { if (e.key === 'Enter') { e.preventDefault(); handleSearch(); } };
        const handleCancel = () => cleanupAndClose(null);
        const handleConfirm = () => { if (selectedDEData) cleanupAndClose(selectedDEData); };

        // --- Asignación de Listeners ---
        elements.folderSearchBtn.addEventListener('click', handleSearch);
        elements.folderSearchInput.addEventListener('keydown', handleEnterKey);
        elements.folderSelectorTbody.addEventListener('click', handleSelect);
        elements.folderSelectorCancelBtn.addEventListener('click', handleCancel);
        elements.folderSelectorOkBtn.addEventListener('click', handleConfirm);
    });
}