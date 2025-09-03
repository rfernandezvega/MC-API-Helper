// Fichero: src/renderer/components/de-creator.js
// Descripción: Módulo que encapsula la lógica para la creación de Data Extensions.

import * as mcApiService from '../api/mc-api-service.js';
import elements from '../ui/dom-elements.js';
import * as ui from '../ui/ui-helpers.js';
import * as logger from '../ui/logger.js';
import * as fieldsTable from './fields-table.js';

let getAuthenticatedConfig;

/**
 * Macro para crear una Data Extension.
 * Recoge los datos del formulario y llama al servicio de API.
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
            folderId: elements.deFolderInput.value.trim(),
            isSendable: elements.isSendableCheckbox.checked,
            subscriberKeyField: elements.subscriberKeyFieldSelect.value,
            subscriberKeyType: elements.subscriberKeyTypeInput.value.trim(),
            fields: fieldsTable.getFieldsData()
        };

        if (!deData.name || !deData.description) {
            throw new Error('El Nombre y la Descripción son obligatorios.');
        }
        if (deData.isSendable && !deData.subscriberKeyField) {
            throw new Error('Para una DE sendable, es obligatorio seleccionar un Campo SubscriberKey.');
        }
        if (deData.fields.length === 0) {
            throw new Error('La DE debe tener al menos un campo.');
        }

        await mcApiService.createDataExtension(deData, apiConfig);
        
        const successMessage = `¡Data Extension "${deData.name}" creada con éxito!`;
        logger.logMessage(successMessage);
        ui.showCustomAlert(successMessage);

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

    elements.createDEBtn.addEventListener('click', createDataExtension);
    
    // Listeners para la UI de creación de DE
    elements.isSendableCheckbox.addEventListener('change', fieldsTable.handleSendableChange);
    
    elements.subscriberKeyFieldSelect.addEventListener('change', () => { 
        elements.subscriberKeyTypeInput.value = elements.subscriberKeyFieldSelect.options[elements.subscriberKeyFieldSelect.selectedIndex]?.dataset.type || ''; 
    });

    elements.deNameInput.addEventListener('input', () => { 
        elements.deExternalKeyInput.value = elements.deNameInput.value.replace(/\s+/g, '_') + '_CK'; 
    });
}