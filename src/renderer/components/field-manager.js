// =======================================================================================
// --- Fichero: src/renderer/components/field-manager.js ---
// --- VERSIÓN CORREGIDA: Input manual para External Key, modal para carpeta de Docs.
// =======================================================================================

// --- 1. IMPORTACIÓN DE MÓDULOS ---
import * as mcApiService from '../api/mc-api-service.js';
import elements from '../ui/dom-elements.js';
import * as ui from '../ui/ui-helpers.js';
import * as logger from '../ui/logger.js';
import * as fieldsTable from './fields-table.js';

// --- 2. ESTADO Y DEPENDENCIAS ---
let getAuthenticatedConfig;

// Guardamos solo el ID de la carpeta seleccionada para documentar.
const state = {
    selectedFolderIdForDoc: null
};

// --- 3. FUNCIONES DE INTERACCIÓN CON EL USUARIO ---

/**
 * Abre el modal para seleccionar una CARPETA de Data Extensions para la documentación.
 */
async function selectDEFolderForDoc() {
    // Llama al modal de selección de carpetas que ya es global.
    const selectedFolder = await ui.showFolderSelectorModal('dataextension', { getAuthenticatedConfig, mcApiService, logger });

    if (selectedFolder) {
        // Guarda el ID de la carpeta en el estado interno del módulo.
        state.selectedFolderIdForDoc = selectedFolder.id;
        // Muestra la ruta completa en el input deshabilitado para informar al usuario.
        elements.recCategoryIdInput.value = selectedFolder.fullPath;
        // Habilita el botón de acción correspondiente.
        elements.documentDEsBtn.disabled = false;
    }
}

// --- 4. LÓGICA DE MACROS PRINCIPALES ---

/**
 * Macro para crear o actualizar (upsert) campos en una Data Extension existente.
 */
async function createOrUpdateFields() {
    ui.blockUI("Creando/Actualizando campos...");
    logger.startLogBuffering();
    try {
        const apiConfig = await getAuthenticatedConfig();
        mcApiService.setLogger(logger);
        
        // Lee la External Key directamente del input de texto, como antes.
        const externalKey = elements.recExternalKeyInput.value.trim();
        const fieldsData = fieldsTable.getFieldsData();

        if (!externalKey) {
            throw new Error('Defina una "External Key de la DE" en "Gestión de Campos".');
        }
        if (fieldsData.length === 0) {
            throw new Error('No hay campos válidos en la tabla para crear/actualizar.');
        }

        await mcApiService.createOrUpdateFields(externalKey, fieldsData, apiConfig);
        
        const successMessage = `¡Éxito! ${fieldsData.length} campos creados/actualizados en la DE ${externalKey}.`;
        logger.logMessage(successMessage);
        ui.showCustomAlert(successMessage);

    } catch (error) {
        logger.logMessage(`Error al crear/actualizar los campos: ${error.message}`);
        ui.showCustomAlert(`Error: ${error.message}`);
    } finally {
        ui.unblockUI();
        logger.endLogBuffering();
    }
}

/**
 * Macro para recuperar todos los campos de una Data Extension y mostrarlos en la tabla.
 */
async function getFields() {
    ui.blockUI("Recuperando campos...");
    logger.startLogBuffering();
    try {
        const apiConfig = await getAuthenticatedConfig();
        mcApiService.setLogger(logger);
        
        // Lee la External Key directamente del input de texto, como antes.
        const externalKey = elements.recExternalKeyInput.value.trim();
        if (!externalKey) throw new Error('Introduzca la "External Key de la DE".');
        
        logger.logMessage(`Recuperando campos para la DE: ${externalKey}`);
        
        const fields = await mcApiService.fetchFieldsForDE(externalKey, apiConfig);

        if (fields.length > 0) {
            fieldsTable.populate(fields); 
            fieldsTable.populateDeletionPicklist(fields);
            logger.logMessage(`${fields.length} campos recuperados y cargados en la tabla.`);
        } else {
            fieldsTable.clear();
            fieldsTable.populateDeletionPicklist([]);
            logger.logMessage('Llamada exitosa pero no se encontraron campos para esta DE.');
        }
    } catch (error) {
        logger.logMessage(`Error al recuperar campos: ${error.message}`);
        ui.showCustomAlert(`Error: ${error.message}`);
    } finally {
        ui.unblockUI();
        logger.endLogBuffering();
    }
}

/**
 * Macro para eliminar un campo específico de una Data Extension.
 */
async function deleteField() {
    logger.startLogBuffering();
    try {
        const apiConfig = await getAuthenticatedConfig();
        mcApiService.setLogger(logger);
        
        // Lee la External Key directamente del input de texto, como antes.
        const externalKey = elements.recExternalKeyInput.value.trim();
        const fieldObjectId = elements.targetFieldSelect.value;
        const selectedFieldName = elements.targetFieldSelect.selectedOptions[0]?.text;

        if (!externalKey || !fieldObjectId) {
            throw new Error('Introduzca la External Key y seleccione un campo a eliminar.');
        }
        
        const userConfirmed = await ui.showCustomConfirm(`¿Seguro que quieres eliminar el campo "${selectedFieldName}"? Esta acción no se puede deshacer.`);
        if (!userConfirmed) {
            logger.logMessage("Borrado cancelado por el usuario.");
            return;
        }

        ui.blockUI("Borrando campo...");
        logger.logMessage(`Iniciando borrado del campo "${selectedFieldName}"...`);
        
        await mcApiService.deleteDataExtensionField(externalKey, fieldObjectId, apiConfig);
        
        const successMessage = `Campo "${selectedFieldName}" eliminado con éxito. Refrescando lista...`;
        logger.logMessage(successMessage);
        ui.showCustomAlert(successMessage);
        
        await getFields();

    } catch (error) {
        logger.logMessage(`Error al eliminar el campo: ${error.message}`);
        ui.showCustomAlert(`Error: ${error.message}`);
        ui.unblockUI();
    } finally {
        logger.endLogBuffering();
    }
}

/**
 * Macro para documentar todas las Data Extensions de la carpeta seleccionada en un CSV.
 */
async function documentDataExtensions() {
    if (!state.selectedFolderIdForDoc) {
        return ui.showCustomAlert('Primero debes seleccionar una carpeta para documentar.');
    }
    ui.blockUI("Documentando Data Extensions...");
    logger.startLogBuffering();
    try {
        const apiConfig = await getAuthenticatedConfig();
        mcApiService.setLogger(logger);
        const categoryId = state.selectedFolderIdForDoc;

        logger.logMessage(`Paso 1: Recuperando Data Extensions de la carpeta ID: ${categoryId}`);
        const deList = await mcApiService.getDEsFromFolder(categoryId, apiConfig);

        if (deList.length === 0) {
            ui.showCustomAlert(`No se encontraron Data Extensions en la carpeta seleccionada.`);
            return;
        }
        logger.logMessage(`Se encontraron ${deList.length} Data Extensions.`);
        
        const allFieldsData = [];
        for (const [index, de] of deList.entries()) {
            ui.blockUI(`Procesando ${index + 1}/${deList.length}: ${de.name}`);
            try {
                const fields = await mcApiService.fetchFieldsForDE(de.customerKey, apiConfig);
                fields.forEach(field => {
                    allFieldsData.push({
                        'FolderName': elements.recCategoryIdInput.value,
                        'DataExtensionName': de.name,
                        'DataExtensionKey': de.customerKey,
                        'FieldName': field.name,
                        'FieldType': field.type,
                        'MaxLength': field.length || '',
                        'DefaultValue': field.defaultValue || '',
                        'IsPrimaryKey': field.isPrimaryKey ? 'TRUE' : 'FALSE',
                        'IsRequired': field.isRequired ? 'TRUE' : 'FALSE'
                    });
                });
            } catch (fieldError) {
                logger.logMessage(`   -> Error al recuperar campos para ${de.name}: ${fieldError.message}`);
            }
        }

        if (allFieldsData.length === 0) throw new Error('No se pudieron recuperar campos.');
        
        generateAndDownloadCsv(allFieldsData, `DEs_Carpeta_${categoryId}.csv`);
        ui.showCustomAlert('Documentación generada con éxito.');
    } catch (error) {
        logger.logMessage(`Error al documentar: ${error.message}`);
        ui.showCustomAlert(`Error: ${error.message}`);
    } finally {
        ui.unblockUI();
        logger.endLogBuffering();
    }
}

/**
 * Genera un archivo CSV y lo descarga.
 * @param {Array<object>} data
 * @param {string} filename
 */
function generateAndDownloadCsv(data, filename) {
    if (!data || data.length === 0) return;
    const headers = Object.keys(data[0]);
    const csvRows = [headers.join(',')];
    for (const row of data) {
        const values = headers.map(header => `"${('' + row[header]).replace(/"/g, '""')}"`);
        csvRows.push(values.join(','));
    }
    const csvString = csvRows.join('\n');
    const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", filename);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

/**
 * Inicializa el módulo, configurando listeners y dependencias.
 * @param {object} dependencies - Objeto con dependencias externas.
 */
export function init(dependencies) {
    getAuthenticatedConfig = dependencies.getAuthenticatedConfig;

    // Listener para el botón de seleccionar carpeta de documentación
    elements.selectDEFolderForDocBtn.addEventListener('click', selectDEFolderForDoc);

    // Listeners para los botones de acción (comportamiento original)
    elements.createFieldsBtn.addEventListener('click', createOrUpdateFields);
    elements.getFieldsBtn.addEventListener('click', getFields);
    elements.deleteFieldBtn.addEventListener('click', deleteField);
    elements.documentDEsBtn.addEventListener('click', documentDataExtensions);
}