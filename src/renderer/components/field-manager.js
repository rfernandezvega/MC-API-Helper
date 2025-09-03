// Fichero: src/renderer/components/field-manager.js
// Descripción: Gestiona la recuperación, creación, borrado y documentación de campos de DEs.

import * as mcApiService from '../api/mc-api-service.js';
import elements from '../ui/dom-elements.js';
import * as ui from '../ui/ui-helpers.js';
import * as logger from '../ui/logger.js';
import * as fieldsTable from './fields-table.js';

let getAuthenticatedConfig;

/**
 * Macro para crear o actualizar (upsert) campos en una Data Extension existente.
 */
async function createOrUpdateFields() {
    ui.blockUI("Creando/Actualizando campos...");
    logger.startLogBuffering();
    try {
        logger.logMessage(`Iniciando creación/actualización de campos...`);
        const apiConfig = await getAuthenticatedConfig();
        mcApiService.setLogger(logger);
        
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
        
        // Refresca la lista de campos después de borrar
        await getFields();

    } catch (error) {
        logger.logMessage(`Error al eliminar el campo: ${error.message}`);
        ui.showCustomAlert(`Error: ${error.message}`);
        ui.unblockUI(); // Asegurarse de desbloquear en caso de error
    } finally {
        logger.endLogBuffering();
    }
}

/**
 * Macro para documentar todas las Data Extensions de una carpeta en un CSV.
 */
async function documentDataExtensions() {
    ui.blockUI("Documentando Data Extensions...");
    logger.startLogBuffering();
    try {
        const apiConfig = await getAuthenticatedConfig();
        mcApiService.setLogger(logger);

        const categoryId = elements.recCategoryIdInput.value.trim();
        if (!categoryId) throw new Error('Introduzca el "Identificador de carpeta".');

        logger.logMessage(`Paso 1: Recuperando Data Extensions de la carpeta ID: ${categoryId}`);
        const deList = await mcApiService.getDEsFromFolder(categoryId, apiConfig);

        if (deList.length === 0) {
            ui.showCustomAlert(`No se encontraron Data Extensions en la carpeta con ID ${categoryId}.`);
            return;
        }
        logger.logMessage(`Se encontraron ${deList.length} Data Extensions. Recuperando campos para cada una...`);
        
        const allFieldsData = [];
        for (const [index, de] of deList.entries()) {
            ui.blockUI(`Procesando ${index + 1}/${deList.length}: ${de.name}`);
            logger.logMessage(` - Procesando: ${de.name} (Key: ${de.customerKey})`);
            try {
                const fields = await mcApiService.fetchFieldsForDE(de.customerKey, apiConfig);
                fields.forEach(field => {
                    allFieldsData.push({
                        'Name': de.name, 'ExternalKey': de.customerKey, 'Field': field.mc,
                        'FieldType': field.type, 'Length': field.len || '', 'Default': field.defaultValue || '',
                        'PK': field.pk ? 'Yes' : 'No', 'Required': field.req ? 'Yes' : 'No'
                    });
                });
            } catch (fieldError) {
                logger.logMessage(`   -> Error al recuperar campos para ${de.name}: ${fieldError.message}`);
            }
        }

        if (allFieldsData.length === 0) {
            ui.showCustomAlert('No se pudieron recuperar campos para ninguna de las Data Extensions encontradas.');
            return;
        }
        
        logger.logMessage(`Paso 3: Generando CSV con ${allFieldsData.length} filas.`);
        generateAndDownloadCsv(allFieldsData, `DEs_Carpeta_${categoryId}.csv`);
        ui.showCustomAlert('Documentación generada con éxito. Revisa tus descargas.');

    } catch (error) {
        logger.logMessage(`Error al documentar las Data Extensions: ${error.message}`);
        ui.showCustomAlert(`Error: ${error.message}`);
    } finally {
        ui.unblockUI();
        logger.endLogBuffering();
    }
}

/**
 * Genera un archivo CSV a partir de un array de objetos y lo descarga.
 * @param {Array<object>} data - El array de datos.
 * @param {string} filename - El nombre del archivo a descargar.
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

    elements.createFieldsBtn.addEventListener('click', createOrUpdateFields);
    elements.getFieldsBtn.addEventListener('click', getFields);
    elements.deleteFieldBtn.addEventListener('click', deleteField);
    elements.documentDEsBtn.addEventListener('click', documentDataExtensions);
}