// Fichero: src/renderer/components/email-validator.js
// Descripción: Módulo que encapsula la lógica del Validador de Email.

import * as mcApiService from '../api/mc-api-service.js';
import elements from '../ui/dom-elements.js';
import * as ui from '../ui/ui-helpers.js';
import * as logger from '../ui/logger.js';

// --- 1. ESTADO DEL MÓDULO ---

let getAuthenticatedConfig; // Dependencia inyectada desde app.js

// --- 2. FUNCIONES PÚBLICAS ---

/**
 * Inicializa el módulo, configurando listeners y dependencias.
 * @param {object} dependencies - Objeto con dependencias externas.
 */
export function init(dependencies) {
    getAuthenticatedConfig = dependencies.getAuthenticatedConfig;

    elements.validateEmailBtn.addEventListener('click', validateEmail);
}

// --- 3. LÓGICA PRINCIPAL ---

/**
 * Orquesta la validación de una dirección de email utilizando la API de Marketing Cloud.
 */
async function validateEmail() {
    ui.blockUI("Validando email...");
    logger.startLogBuffering();
    elements.emailValidationResults.textContent = 'Validando...';
    try {
        const apiConfig = await getAuthenticatedConfig();
        mcApiService.setLogger(logger);
        
        const emailToValidate = elements.emailToValidateInput.value.trim();
        if (!emailToValidate) {
            throw new Error("Introduzca un email para validar.");
        }
        
        logger.logMessage(`Iniciando validación para el email: ${emailToValidate}`);
        
        const responseData = await mcApiService.validateEmail(emailToValidate, apiConfig);

        let resultText;
        if (responseData.valid) {
            resultText = `El email "${responseData.email}" es VÁLIDO.`;
        } else {
            resultText = `El email "${responseData.email}" es INVÁLIDO.\nRazón: ${responseData.failedValidation}`;
        }
        
        elements.emailValidationResults.textContent = resultText;
        logger.logMessage(`Resultado de la validación: ${resultText}`);

    } catch (error) {
        logger.logMessage(`Error al validar el email: ${error.message}`);
        elements.emailValidationResults.textContent = `Error: ${error.message}`;
        ui.showCustomAlert(`Error: ${error.message}`);
    } finally {
        ui.unblockUI();
        logger.endLogBuffering();
    }
}