// =======================================================================================
// --- Fichero: src/renderer/ui/ui-helpers.js ---
// --- Descripción: Contiene funciones de ayuda para manipular la interfaz de usuario,
// ---              como mostrar modales, gestionar el estado de carga y la navegación.
// =======================================================================================

import elements from './dom-elements.js';
import * as logger from '../ui/logger.js';

let zIndexCounter = 10000; // Un valor inicial alto


/**
 * Muestra un modal de alerta no bloqueante.
 * @param {string} message - El mensaje a mostrar.
 */
export function showCustomAlert(message) {
    elements.customAlertMessage.textContent = message;
    manageModalZIndex(elements.customAlertModal);
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
        manageModalZIndex(elements.customConfirmModal);
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
 * Muestra la modal específica para elegir el modo de parada de Journeys.
 * @param {string} message - Mensaje descriptivo.
 * @returns {Promise<string|null>} - 'all', 'single' o null (cancelar).
 */
export function showJourneyStopModal(message) {
    return new Promise(resolve => {
        elements.journeyStopMessage.textContent = message;
        
        manageModalZIndex(elements.journeyStopModal);
        elements.journeyStopModal.style.display = 'flex';

        const cleanup = (value) => {
            elements.journeyStopModal.style.display = 'none';
            resolve(value);
        };

        // Asignamos clics únicos
        elements.journeyStopAllBtn.onclick = () => cleanup('all');
        elements.journeyStopCurrentBtn.onclick = () => cleanup('single');
        elements.journeyStopCancelBtn.onclick = () => cleanup(null);
        
        // Cerrar si hace clic fuera del contenido
        elements.journeyStopModal.onclick = (e) => {
            if (e.target === elements.journeyStopModal) cleanup(null);
        };
    });
}

/**
 * Muestra un modal de confirmación con textos de botones personalizados.
 * @param {string} message - El mensaje.
 * @param {string} okText - Texto para el botón de confirmar.
 * @param {string} cancelText - Texto para el botón de cancelar.
 * @returns {Promise<boolean>}
 */
export function showCustomConfirmComplex(message, okText, cancelText) {
    return new Promise(resolve => {
        const originalOk = elements.customConfirmOkBtn.textContent;
        const originalCancel = elements.customConfirmCancelBtn.textContent;

        elements.customConfirmMessage.textContent = message;
        elements.customConfirmOkBtn.textContent = okText;
        elements.customConfirmCancelBtn.textContent = cancelText;
        
        manageModalZIndex(elements.customConfirmModal);
        elements.customConfirmModal.style.display = 'flex';

        const cleanup = (value) => {
            elements.customConfirmModal.style.display = 'none';
            elements.customConfirmOkBtn.textContent = originalOk;
            elements.customConfirmCancelBtn.textContent = originalCancel;
            resolve(value);
        };

        elements.customConfirmOkBtn.onclick = () => cleanup(true);
        elements.customConfirmCancelBtn.onclick = () => cleanup(false);
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
    const modal = elements.folderSelectorModal;
    
    // Estado interno de la modal
    let selectedFolder = null;

    // Resetear UI
    elements.folderSelectorTitle.textContent = `Seleccionar Carpeta para: ${contentType}`;
    elements.folderSearchInput.value = '';
    elements.folderSelectorTable.classList.add('hidden');
    elements.folderSelectorTbody.innerHTML = '';
    elements.folderSelectorResultsContainer.querySelector('p').style.display = 'block';
    elements.folderSelectorOkBtn.disabled = true;

    manageModalZIndex(modal);
    modal.style.display = 'flex';

    return new Promise(resolve => {
        // --- Lógica de la Búsqueda ---
        const searchFolders = async () => {
            const searchTerm = elements.folderSearchInput.value.trim();
            if (!searchTerm) return;
            
            // --- Mostrar el spinner ---
            blockModalContent(true, 'Buscando carpetas...');

            try {
                const apiConfig = await getAuthenticatedConfig();
                const folders = await mcApiService.findDataFolders(searchTerm, contentType, apiConfig);
                renderResults(folders);
            } catch (error) {
                logger.logMessage(`Error buscando carpetas: ${error.message}`);
                elements.folderSelectorResultsContainer.innerHTML = `<p style="color:red;">Error: ${error.message}</p>`;
            } finally {
                // --- Ocultar el spinner ---
                blockModalContent(false);
            }
        };

        const renderResults = (folders) => {
            const container = elements.folderSelectorResultsContainer;
            const table = elements.folderSelectorTable;
            const tbody = elements.folderSelectorTbody;
            
            tbody.innerHTML = '';
            container.querySelector('p').style.display = 'none';

            if (folders.length === 0) {
                tbody.innerHTML = '<tr><td>No se encontraron carpetas con ese nombre.</td></tr>';
            } else {
                folders.forEach(folder => {
                    const row = document.createElement('tr');
                    row.dataset.folderInfo = JSON.stringify({ id: folder.id, fullPath: folder.fullPath });
                    row.innerHTML = `<td>${folder.fullPath}</td>`;
                    tbody.appendChild(row);
                });
            }
            table.classList.remove('hidden');
        };

        const onRowClick = (e) => {
            const row = e.target.closest('tr');
            if (!row || !row.dataset.folderInfo) return;
            
            elements.folderSelectorTbody.querySelectorAll('tr.selected').forEach(r => r.classList.remove('selected'));
            row.classList.add('selected');
            selectedFolder = JSON.parse(row.dataset.folderInfo);
            elements.folderSelectorOkBtn.disabled = false;
        };

        // --- Gestión de Cierre ---
        const closeModal = (result) => {
            modal.style.display = 'none';
            // Limpiar listeners para evitar duplicados en futuras aperturas
            elements.folderSearchBtn.removeEventListener('click', searchFolders);
            elements.folderSelectorTbody.removeEventListener('click', onRowClick);
            elements.folderSelectorOkBtn.removeEventListener('click', onOkClick);
            elements.folderSelectorCancelBtn.removeEventListener('click', onCancelClick);
            resolve(result);
        };
        
        const onOkClick = () => closeModal(selectedFolder);
        const onCancelClick = () => closeModal(null);
        
        // Asignar listeners
        elements.folderSearchBtn.addEventListener('click', searchFolders);
        elements.folderSelectorTbody.addEventListener('click', onRowClick);
        elements.folderSelectorOkBtn.addEventListener('click', onOkClick);
        elements.folderSelectorCancelBtn.addEventListener('click', onCancelClick);
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


/**
 * Muestra u oculta un overlay de carga DENTRO de la modal activa.
 * @param {boolean} show - `true` para mostrar, `false` para ocultar.
 * @param {string} text - El texto a mostrar en el cargador.
 */
function blockModalContent(show, text = 'Cargando...') {
    // Busca la modal que esté actualmente visible
    const modalContent = document.querySelector('.modal-overlay[style*="display: flex"] .modal-content');
    if (!modalContent) return;

    const existingOverlay = modalContent.querySelector('.modal-loader-overlay');

    if (show) {
        // Si ya existe uno, lo eliminamos para evitar duplicados
        if (existingOverlay) existingOverlay.remove();

        const overlay = document.createElement('div');
        overlay.className = 'modal-loader-overlay';
        overlay.innerHTML = `
            <div class="loader-spinner"></div>
            <p class="loader-text">${text}</p>
        `;
        modalContent.appendChild(overlay);
    } else {
        // Si existe, lo eliminamos
        if (existingOverlay) existingOverlay.remove();
    }
}

/**
 * Muestra una modal de dos pasos para seleccionar un automatismo y luego una de sus DEs de destino.
 * @param {object} dependencies - Objeto con dependencias ({ getAuthenticatedConfig, mcApiService, logger }).
 * @returns {Promise<{automationId: string, selectedDE: object}|null>} - Resuelve con los IDs seleccionados o null si se cancela.
 */
// En: ui-helpers.js

export function showAutomationDESelectorModal(dependencies) {
    const { getAuthenticatedConfig, mcApiService, logger } = dependencies;
    const modal = elements.automationDeSelectorModal;
    
    let selectedAutomationId = null;
    let selectedDE = null;

    // Resetear UI
    elements.automationSelectionStep.classList.remove('hidden');
    elements.deSelectionStep.classList.add('hidden');
    elements.automationDeSelectorContinueBtn.classList.remove('hidden');
    elements.automationDeSelectorCloneBtn.classList.add('hidden');
    
    // Aseguramos que el botón del segundo paso tenga el texto y color correctos desde el principio.
    elements.automationDeSelectorCloneBtn.textContent = 'Continuar →';
    elements.automationDeSelectorCloneBtn.classList.remove('activate-btn'); // Quitamos el verde

    elements.automationSearchInput.value = '';
    elements.automationSelectorResultsContainer.innerHTML = '<p>Realiza una búsqueda para ver los resultados.</p>';
    elements.automationDeSelectorContinueBtn.disabled = true;
    elements.automationDeSelectorCloneBtn.disabled = true;
    
    manageModalZIndex(modal);
    modal.style.display = 'flex';

    return new Promise(resolve => {
        const searchAutomations = async () => {
            const name = elements.automationSearchInput.value.trim();
            if (!name) return;
            blockModalContent(true, 'Buscando...');
            try {
                const apiConfig = await getAuthenticatedConfig();
                const automations = await mcApiService.findAutomationByName(name, apiConfig);
                renderAutomationResults(automations);
            } catch (error) {
                elements.automationSelectorResultsContainer.innerHTML = `<p style="color: red;">Error: ${error.message}</p>`;
            } finally {
                blockModalContent(false);
            }
        };

        const renderAutomationResults = (automations) => {
            if (automations.length === 0) {
                elements.automationSelectorResultsContainer.innerHTML = '<p>No se encontraron automatismos con ese nombre exacto.</p>';
                return;
            }
            const table = document.createElement('table');
            table.className = 'folder-results-table';
            table.innerHTML = `<thead><tr><th>Nombre</th><th>Estado</th></tr></thead><tbody></tbody>`;
            const tbody = table.querySelector('tbody');
            automations.forEach(auto => {
                const row = document.createElement('tr');
                row.style.cursor = 'pointer';
                row.dataset.automationId = auto.id;
                row.innerHTML = `<td>${auto.name}</td><td>${auto.status}</td>`;
                tbody.appendChild(row);
            });
            elements.automationSelectorResultsContainer.innerHTML = '';
            elements.automationSelectorResultsContainer.appendChild(table);
        };
        
        const onAutomationRowClick = (e) => {
            const row = e.target.closest('tr');
            if (!row?.dataset.automationId) return;
            elements.automationSelectorResultsContainer.querySelectorAll('tr.selected').forEach(r => r.classList.remove('selected'));
            row.classList.add('selected');
            selectedAutomationId = row.dataset.automationId;
            elements.automationDeSelectorContinueBtn.disabled = false;
        };
        
        const goToStep2 = async () => {
            if (!selectedAutomationId) return;
            elements.automationSelectionStep.classList.add('hidden');
            elements.deSelectionStep.classList.remove('hidden');
            elements.automationDeSelectorContinueBtn.classList.add('hidden');
            elements.automationDeSelectorCloneBtn.classList.remove('hidden');
            blockModalContent(true, 'Cargando detalles...');
            try {
                const apiConfig = await getAuthenticatedConfig();
                const details = await mcApiService.fetchAutomationDetailsById(selectedAutomationId, apiConfig);
                const targetDEs = details.steps.flatMap(step => step.activities).flatMap(activity => activity.targetDataExtensions || []).filter((de, index, self) => de.key && index === self.findIndex(d => d.key === de.key));
                renderDEResults(targetDEs);
            } catch (error) {
                elements.deSelectorResultsContainer.innerHTML = `<p style="color: red;">Error: ${error.message}</p>`;
            } finally {
                blockModalContent(false);
            }
        };

        const renderDEResults = (dataExtensions) => {
             if (dataExtensions.length === 0) {
                elements.deSelectorResultsContainer.innerHTML = '<p>Este automatismo no contiene queries que apunten a una Data Extension.</p>';
                return;
            }
            const table = document.createElement('table');
            table.className = 'folder-results-table';
            table.innerHTML = `<thead><tr><th>Nombre DE</th><th>External Key</th></tr></thead><tbody></tbody>`;
            const tbody = table.querySelector('tbody');
            dataExtensions.forEach(de => {
                const row = document.createElement('tr');
                row.style.cursor = 'pointer';
                row.dataset.deInfo = JSON.stringify(de);
                row.innerHTML = `<td>${de.name}</td><td>${de.key}</td>`;
                tbody.appendChild(row);
            });
            elements.deSelectorResultsContainer.innerHTML = '';
            elements.deSelectorResultsContainer.appendChild(table);
        };
        
        const onDERowClick = (e) => {
            const row = e.target.closest('tr');
            if (!row?.dataset.deInfo) return;
            elements.deSelectorResultsContainer.querySelectorAll('tr.selected').forEach(r => r.classList.remove('selected'));
            row.classList.add('selected');
            selectedDE = JSON.parse(row.dataset.deInfo);
            elements.automationDeSelectorCloneBtn.disabled = false;
        };

        const closeModal = (result) => {
            modal.style.display = 'none';
            elements.automationDeSelectorCloneBtn.textContent = 'Clonar';
            elements.automationDeSelectorCloneBtn.classList.add('activate-btn');
            elements.automationSearchBtn.removeEventListener('click', searchAutomations);
            elements.automationSelectorResultsContainer.removeEventListener('click', onAutomationRowClick);
            elements.automationDeSelectorContinueBtn.removeEventListener('click', goToStep2);
            elements.deSelectorResultsContainer.removeEventListener('click', onDERowClick);
            elements.automationDeSelectorCloneBtn.removeEventListener('click', onFinalContinue);
            elements.automationDeSelectorCancelBtn.removeEventListener('click', onCancelClick);
            resolve(result);
        };
        
        const onFinalContinue = () => closeModal({ automationId: selectedAutomationId, selectedDE });
        const onCancelClick = () => closeModal(null);
        
        elements.automationSearchBtn.addEventListener('click', searchAutomations);
        elements.automationSelectorResultsContainer.addEventListener('click', onAutomationRowClick);
        elements.automationDeSelectorContinueBtn.addEventListener('click', goToStep2);
        elements.deSelectorResultsContainer.addEventListener('click', onDERowClick);
        elements.automationDeSelectorCloneBtn.addEventListener('click', onFinalContinue);
        elements.automationDeSelectorCancelBtn.addEventListener('click', onCancelClick);
    });
}

/**
 * Muestra una modal multi-paso para configurar la clonación de un Journey.
 * @param {object} journey - El objeto del Journey original.
 * @param {object} dependencies - Objeto con dependencias ({ getAuthenticatedConfig, mcApiService, logger }).
 * @param {object} [initialData={}] - Datos pre-cargados de un paso anterior (ej. para AutomationAudience).
 * @returns {Promise<object|null>} - Resuelve con el objeto de configuración final o null si se cancela.
 */
export function showJourneyClonerModal(journey, dependencies, initialData = {}) {
    const { getAuthenticatedConfig, mcApiService, logger } = dependencies;
    const modal = elements.journeyClonerModal;

    // Se añade este bloque para resetear el estado de la modal cada vez que se abre.
    // Esto evita que los datos de una clonación anterior (como el texto de búsqueda)
    // aparezcan en una nueva clonación.
    elements.journeyClonerDESearchInput.value = '';
    elements.journeyClonerDEResultsContainer.innerHTML = '<p>Realiza una búsqueda para ver los resultados.</p>';
    elements.journeyClonerNewDEName.value = '';
    elements.journeyClonerNewJourneyName.value = '';
    elements.journeyClonerContinueBtn.disabled = true;
    elements.journeyClonerCloneBtn.disabled = true;

    let state = {
        useExistingDe: false,
        selectedDE: initialData.selectedDE || null,
        newDeName: '',
        newDeCategoryId: null,
        newDeCategoryPath: 'Raíz',
        newJourneyName: `${journey.name}_Copy`,
        newJourneyCategoryId: journey.categoryId,
        newJourneyCategoryPath: 'Cargando...'
    };
    
    const allSteps = modal.querySelectorAll('.cloner-step');
    allSteps.forEach(s => s.classList.add('hidden'));

    return new Promise(async (resolve, reject) => {
        const showStep = (stepElement) => {
            allSteps.forEach(s => s.classList.add('hidden'));
            stepElement.classList.remove('hidden');

            if (stepElement.id === 'journey-cloner-confirm-reuse-de') {
                elements.journeyClonerContinueBtn.classList.add('hidden');
                elements.journeyClonerCloneBtn.classList.add('hidden');
            }
        };

        const renderFinalConfig = () => {
            elements.journeyClonerNewJourneyName.value = state.newJourneyName;
            elements.journeyClonerNewJourneyFolder.value = state.newJourneyCategoryPath;
        };
        
        const onCancel = () => closeModal(null);

        const onClone = () => {
            state.newJourneyName = elements.journeyClonerNewJourneyName.value.trim();
            if (journey.eventType === 'EmailAudience' && !state.useExistingDe) {
                state.newDeName = elements.journeyClonerNewDEName.value.trim();
            }
            closeModal({ ...initialData, ...state });
        };
        
        const closeModal = (result) => {
            modal.style.display = 'none';
            elements.journeyClonerReuseDEBtn.textContent = 'Reutilizar Existente';
            elements.journeyClonerCloneNewDEBtn.textContent = 'Clonar Nueva';
            elements.journeyClonerReuseDEBtn.removeEventListener('click', handleReuseDe);
            elements.journeyClonerCloneNewDEBtn.removeEventListener('click', handleCloneNewDe);
            elements.journeyClonerDESearchBtn.removeEventListener('click', searchDEs);
            elements.journeyClonerDEResultsContainer.removeEventListener('click', onSelectDERow);
            elements.journeyClonerSelectDEFolderBtn.removeEventListener('click', selectDEFolder);
            elements.journeyClonerSelectJourneyFolderBtn.removeEventListener('click', selectJourneyFolder);
            elements.journeyClonerContinueBtn.removeEventListener('click', onContinue);
            elements.journeyClonerCloneBtn.removeEventListener('click', onClone);
            elements.journeyClonerCancelBtn.removeEventListener('click', onCancel);
            resolve(result);
        };
        
        const handleReuseDe = () => {
            state.useExistingDe = true;
            elements.journeyClonerContinueBtn.classList.remove('hidden');
            elements.journeyClonerContinueBtn.disabled = true;
            showStep(elements.journeyClonerSearchDE);
        };
        
        const handleCloneNewDe = async () => {
            state.useExistingDe = false;
            const { apiConfig } = dependencies;
            const originalDeDetails = await mcApiService.getDataExtensionDetailsByName(journey.dataExtensionName, apiConfig);
            state.newDeName = `${journey.dataExtensionName}_Copy`;
            state.newDeCategoryId = originalDeDetails.categoryId;
            state.newDeCategoryPath = originalDeDetails.categoryId ? await mcApiService.getFolderPath(originalDeDetails.categoryId, apiConfig) : 'Raíz';
            elements.journeyClonerNewDEName.value = state.newDeName;
            elements.journeyClonerNewDEFolder.value = state.newDeCategoryPath;
            elements.journeyClonerContinueBtn.classList.remove('hidden');
            elements.journeyClonerContinueBtn.disabled = false;
            showStep(elements.journeyClonerConfigureNewDE);
        };

        const searchDEs = async () => {
            const searchTerm = elements.journeyClonerDESearchInput.value.trim();
            if (!searchTerm) return;
            blockModalContent(true, 'Buscando y obteniendo DEs...');
            try {
                const apiConfig = await getAuthenticatedConfig();
                // 1. Buscamos las DEs como antes.
                const deList = await mcApiService.searchDataExtensions('Name', searchTerm, apiConfig);

                // 2. Enriquecemos la lista con las rutas de las carpetas.
                const deListWithPaths = await Promise.all(deList.map(async (de) => {
                    const folderPath = de.categoryId
                        ? await mcApiService.getFolderPath(de.categoryId, apiConfig)
                        : 'Raíz';
                    return { ...de, folderPath: folderPath }; // Añadimos la nueva propiedad
                }));
                
                // 3. Renderizamos la tabla con la lista enriquecida.
                renderDEResults(deListWithPaths);
            } catch (error) { 
                showCustomAlert(error.message); 
            } finally { 
                blockModalContent(false); 
            }
        };

        const renderDEResults = (deList) => {
            const container = elements.journeyClonerDEResultsContainer;
            container.innerHTML = '';
            if (deList.length === 0) {
                container.innerHTML = '<p>No se encontraron resultados.</p>'; return;
            }
            const table = document.createElement('table');
            table.className = 'folder-results-table';
            // 4. Cambiamos la cabecera de la tabla.
            table.innerHTML = `<thead><tr><th>Nombre</th><th>Ruta de Carpeta</th></tr></thead><tbody></tbody>`;
            const tbody = table.querySelector('tbody');
            deList.forEach(de => {
                const row = document.createElement('tr');
                row.style.cursor = 'pointer';
                // El dataset sigue guardando toda la info necesaria (incluida la key)
                row.dataset.deInfo = JSON.stringify({ name: de.deName, key: de.customerKey, id: de.objectID });
                // 5. Mostramos la folderPath en la segunda columna.
                row.innerHTML = `<td>${de.deName}</td><td>${de.folderPath || 'Raíz'}</td>`;
                tbody.appendChild(row);
            });
            container.appendChild(table);
        };

        const onSelectDERow = (e) => {
            const row = e.target.closest('tr');
            if (!row?.dataset.deInfo) return;
            elements.journeyClonerDEResultsContainer.querySelectorAll('tr.selected').forEach(r => r.classList.remove('selected'));
            row.classList.add('selected');
            state.selectedDE = JSON.parse(row.dataset.deInfo);
            elements.journeyClonerContinueBtn.disabled = false;
        };
        
        const selectDEFolder = async () => {
            const folder = await showFolderSelectorModal('dataextension', dependencies);
            if(folder) {
                state.newDeCategoryId = folder.id;
                state.newDeCategoryPath = folder.fullPath;
                elements.journeyClonerNewDEFolder.value = folder.fullPath;
            }
        };

        const selectJourneyFolder = async () => {
            const folder = await showFolderSelectorModal('journey', dependencies);
            if(folder) {
                state.newJourneyCategoryId = folder.id;
                state.newJourneyCategoryPath = folder.fullPath;
                elements.journeyClonerNewJourneyFolder.value = folder.fullPath;
            }
        };
        
        const onContinue = () => {
            elements.journeyClonerContinueBtn.classList.add('hidden');
            elements.journeyClonerCloneBtn.classList.remove('hidden');
            elements.journeyClonerCloneBtn.disabled = false;
            showStep(elements.journeyClonerFinalConfig);
            renderFinalConfig();
        };

        const { apiConfig } = dependencies;
        if (!apiConfig) {
            closeModal(null);
            return reject(new Error("La función showJourneyClonerModal fue llamada sin apiConfig."));
        }

        elements.journeyClonerCancelBtn.addEventListener('click', onCancel);
        elements.journeyClonerCloneBtn.addEventListener('click', onClone);
        elements.journeyClonerReuseDEBtn.addEventListener('click', handleReuseDe);
        elements.journeyClonerCloneNewDEBtn.addEventListener('click', handleCloneNewDe);
        elements.journeyClonerDESearchBtn.addEventListener('click', searchDEs);
        elements.journeyClonerDEResultsContainer.addEventListener('click', onSelectDERow);
        elements.journeyClonerSelectDEFolderBtn.addEventListener('click', selectDEFolder);
        elements.journeyClonerSelectJourneyFolderBtn.addEventListener('click', selectJourneyFolder);
        elements.journeyClonerContinueBtn.addEventListener('click', onContinue);

        state.newJourneyCategoryPath = journey.categoryId ? await mcApiService.getFolderPath(journey.categoryId, apiConfig) : 'Raíz';

        if (journey.eventType === 'AutomationAudience') {
            elements.journeyClonerTitle.textContent = 'Clonar Journey de tipo AutomationAudience';
            elements.journeyClonerFinalStepTitle.textContent = 'Paso 3: Configuración Final del Journey';
            elements.journeyClonerContinueBtn.classList.add('hidden');
            elements.journeyClonerCloneBtn.classList.remove('hidden');
            elements.journeyClonerCloneBtn.disabled = false;
            showStep(elements.journeyClonerFinalConfig);
            renderFinalConfig();
        } else if (journey.eventType === 'EmailAudience') {
            elements.journeyClonerTitle.textContent = 'Clonar Journey de tipo EmailAudience';
            elements.journeyClonerReuseDEBtn.textContent = 'Seleccionar Existente';
            elements.journeyClonerCloneNewDEBtn.textContent = 'Crear Nueva';
            showStep(elements.journeyClonerConfirmReuseDE);
        }
        
        manageModalZIndex(modal);
        modal.style.display = 'flex';
        unblockUI();
    });
}

/**
 * Gestiona el z-index de los modales para asegurar que el último en abrirse esté siempre encima.
 * @param {HTMLElement} modalElement - El elemento del modal que se va a mostrar.
 */
function manageModalZIndex(modalElement) {
    zIndexCounter++;
    modalElement.style.zIndex = zIndexCounter;
}

/**
 * Muestra un modal genérico.
 * @param {HTMLElement} modalElement - El elemento del overlay del modal a mostrar.
 */
export function showModal(modalElement) {
    if (modalElement) {
        modalElement.style.display = 'flex';
    }
}

/**
 * Oculta un modal genérico.
 * @param {HTMLElement} modalElement - El elemento del overlay del modal a ocultar.
 */
export function hideModal(modalElement) {
    if (modalElement) {
        modalElement.style.display = 'none';
    }
}

/**
 * Gestiona el clic en cualquier enlace con la clase 'external-link'.
 * Previene la navegación interna y lo abre en el navegador por defecto del sistema.
 * @param {Event} e - El evento de clic.
 */
export function handleExternalLink(e) {
    const link = e.target.closest('a.external-link');
    if (link && link.href) { 
        e.preventDefault(); 
        // Llama a la API expuesta por el preload script
        window.electronAPI.openExternalLink(link.href); 
    }
}