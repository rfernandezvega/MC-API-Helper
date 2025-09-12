// =======================================================================================
// --- Fichero: src/renderer/components/de-creator.js ---
// --- Descripción: Módulo que encapsula la lógica para la creación de Data Extensions,
// ---              ahora con selección de carpeta a través de un modal.
// =======================================================================================

// --- 1. IMPORTACIÓN DE MÓDULOS ---
import * as mcApiService from '../api/mc-api-service.js';
import elements from '../ui/dom-elements.js';
import * as ui from '../ui/ui-helpers.js';
import * as logger from '../ui/logger.js';
import * as fieldsTable from './fields-table.js';

// --- 2. ESTADO DEL MÓDULO Y DEPENDENCIAS ---

// Dependencia que se inyectará desde app.js para obtener la configuración de API autenticada.
let getAuthenticatedConfig;

// Estado local para almacenar el ID de la carpeta seleccionada por el usuario.
const state = {
    selectedFolderId: null
};

// --- 3. FUNCIONES PRINCIPALES ---

/**
 * Abre el modal de selección de carpetas y guarda el resultado en el estado del módulo.
 */
async function selectDEFolder() {
    // Llama a la función global del modal que está en ui-helpers.js.
    // Le pasamos el tipo de contenido 'dataextension' y las dependencias necesarias.
    const selectedFolder = await ui.showFolderSelectorModal('dataextension', {
        getAuthenticatedConfig,
        mcApiService,
        logger
    });

    if (selectedFolder) {
        // Si el usuario selecciona una carpeta:
        // 1. Guarda el ID de la carpeta en el estado interno del módulo.
        state.selectedFolderId = selectedFolder.id;
        // 2. Muestra la ruta completa en el campo de texto (que está deshabilitado)
        //    para que el usuario vea su selección.
        elements.deFolderInput.value = selectedFolder.fullPath;
    }
}

/**
 * Recoge los datos del formulario de creación de DE y llama al servicio de API.
 */
async function createDataExtension() {
    ui.blockUI("Creando Data Extension...");
    logger.startLogBuffering();
    try {
        logger.logMessage("Iniciando creación de Data Extension...");
        const apiConfig = await getAuthenticatedConfig();
        mcApiService.setLogger(logger);

        const deData = {
            name: elements.deNameInput.value.trim(),
            externalKey: elements.deExternalKeyInput.value.trim(),
            description: elements.deDescriptionInput.value.trim(),
            // Usa el ID de la carpeta guardado en el estado, o una cadena vacía si no se seleccionó ninguna.
            folderId: state.selectedFolderId || '',
            isSendable: elements.isSendableCheckbox.checked,
            subscriberKeyField: elements.subscriberKeyFieldSelect.value,
            subscriberKeyType: elements.subscriberKeyTypeInput.value.trim(),
            fields: fieldsTable.getFieldsData()
        };

        // Validaciones de los datos antes de enviar a la API.
        if (!deData.name || !deData.description) {
            throw new Error('El Nombre y la Descripción son obligatorios.');
        }
        if (deData.isSendable && !deData.subscriberKeyField) {
            throw new Error('Para una DE sendable, es obligatorio seleccionar un Campo SubscriberKey.');
        }
        if (deData.fields.length === 0) {
            throw new Error('La DE debe tener al menos un campo.');
        }

        // Llamada al servicio de API para crear la Data Extension.
        await mcApiService.createDataExtension(deData, apiConfig);
        
        const successMessage = `¡Data Extension "${deData.name}" creada con éxito!`;
        logger.logMessage(successMessage);
        ui.showCustomAlert(successMessage);

        // Limpiar el formulario después de la creación exitosa.
        elements.deNameInput.value = '';
        elements.deDescriptionInput.value = '';
        elements.deExternalKeyInput.value = '';
        elements.deFolderInput.value = ''; // Limpia el campo de texto de la carpeta
        state.selectedFolderId = null;   // Resetea el ID guardado en el estado
        elements.isSendableCheckbox.checked = false;
        fieldsTable.handleSendableChange({ target: elements.isSendableCheckbox }); // Actualiza la tabla de campos

    } catch (error) {
        logger.logMessage(`Error al crear la Data Extension: ${error.message}`);
        ui.showCustomAlert(`Error: ${error.message}`);
    } finally {
        ui.unblockUI();
        logger.endLogBuffering();
    }
}

/**
 * Inicializa el módulo, configurando listeners y dependencias.
 * @param {object} dependencies - Objeto con dependencias externas.
 */
export function init(dependencies) {
    getAuthenticatedConfig = dependencies.getAuthenticatedConfig;

    // Listener para el botón principal de crear la DE.
    elements.createDEBtn.addEventListener('click', createDataExtension);
    
    // Listener para el nuevo botón de seleccionar carpeta.
    elements.selectDEFolderBtn.addEventListener('click', selectDEFolder);
    
    // Listener para el checkbox "Es Sendable" que afecta a la tabla de campos.
    elements.isSendableCheckbox.addEventListener('change', fieldsTable.handleSendableChange);
    
    // Listener para el selector de campo de Subscriber Key.
    // Actualiza el tipo de dato automáticamente cuando se selecciona un campo.
    elements.subscriberKeyFieldSelect.addEventListener('change', () => { 
        elements.subscriberKeyTypeInput.value = elements.subscriberKeyFieldSelect.options[elements.subscriberKeyFieldSelect.selectedIndex]?.dataset.type || ''; 
    });

    // Listener para el campo de nombre de la DE.
    // Genera automáticamente una External Key sugerida.
    elements.deNameInput.addEventListener('input', () => { 
        elements.deExternalKeyInput.value = elements.deNameInput.value.replace(/\s+/g, '_') + '_CK'; 
    });
}