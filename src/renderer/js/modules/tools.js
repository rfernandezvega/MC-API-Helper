/**
 * @file Gestiona la lógica de las vistas de herramientas:
 * - Búsqueda de Data Extension
 * - Validador de Email
 * - Buscador de Orígenes de Datos
 */
import * as api from '../api/sfmc-api.js';
import { getTokenAndConfig } from './config-api.js';
import { getFullClientConfig, setFullClientConfig } from './config-api.js';
import { logMessage, logApiCall, logApiResponse, blockUI, unblockUI } from '../main-renderer.js';

let currentView = '';

// Elementos de 'Búsqueda de DE'
let deSearchProperty, deSearchValue, searchDEBtn, deSearchResults;

// Elementos de 'Validador de Email'
let emailToValidateInput, validateEmailBtn, emailValidationResults;

// Elementos de 'Buscador de Orígenes'
let deNameToFindInput, findDataSourcesBtn, dataSourcesTbody;


/**
 * Asocia los elementos del DOM a las variables del módulo según la vista actual.
 */
function queryElements() {
    if (currentView === 'find-de') {
        deSearchProperty = document.getElementById('deSearchProperty');
        deSearchValue = document.getElementById('deSearchValue');
        searchDEBtn = document.getElementById('searchDEBtn');
        deSearchResults = document.getElementById('de-search-results');
    }
    if (currentView === 'validate-email') {
        emailToValidateInput = document.getElementById('emailToValidate');
        validateEmailBtn = document.getElementById('validateEmailBtn');
        emailValidationResults = document.getElementById('email-validation-results');
    }
    if (currentView === 'find-sources') {
        deNameToFindInput = document.getElementById('deNameToFind');
        findDataSourcesBtn = document.getElementById('findDataSourcesBtn');
        dataSourcesTbody = document.getElementById('data-sources-tbody');
    }
}

/**
 * Añade los event listeners a los elementos de la vista actual.
 */
function attachListeners() {
    if (currentView === 'find-de') {
        searchDEBtn.addEventListener('click', handleSearchDE);
    }
    if (currentView === 'validate-email') {
        validateEmailBtn.addEventListener('click', handleValidateEmail);
    }
    if (currentView === 'find-sources') {
        findDataSourcesBtn.addEventListener('click', handleFindDataSources);
    }
}

async function getTokenAndConfig(silent = true) {
    let config = getFullClientConfig();
    if (!config.token) {
        try {
            const tokenData = await api.getToken({ 
                authUri: config.authUri, 
                clientId: config.clientId, 
                clientSecret: config.clientSecret, 
                businessUnit: config.businessUnit 
            });
            config.token = tokenData.access_token;
            config.soapUri = tokenData.soap_instance_url_formatted;
            config.restUri = tokenData.rest_instance_url_formatted;
            setFullClientConfig(config);
        } catch (error) {
            if (!silent) alert(`Error al obtener token: ${error.message}`);
            logMessage(`Error obteniendo token: ${error.message}`);
            throw error;
        }
    }
    return config;
}

// --- MANEJADORES DE EVENTOS ---

async function handleSearchDE() {
    const property = deSearchProperty.value;
    const value = deSearchValue.value.trim();
    if (!value) {
        alert("El campo 'Valor' no puede estar vacío.");
        return;
    }
    blockUI();
    deSearchResults.textContent = 'Buscando...';
    logMessage(`Iniciando búsqueda de DE por ${property}: ${value}`);
    try {
        const config = await getTokenAndConfig();
        const deInfo = await api.findDE(config, property, value);
        
        let finalPath = '';
        if (deInfo.categoryId === 0) {
            finalPath = `Data Extensions > ${deInfo.deName}`;
        } else {
            logMessage(`DE encontrada. ID de Carpeta: ${deInfo.categoryId}. Recuperando ruta...`);
            const folderPath = await api.getFolderPath(config, deInfo.categoryId);
            finalPath = folderPath ? `Data Extensions > ${folderPath} > ${deInfo.deName}` : `Data Extensions > ${deInfo.deName}`;
        }
        deSearchResults.textContent = finalPath;
        logMessage(`Búsqueda finalizada. Ruta: ${finalPath}`);
    } catch(error) {
        deSearchResults.textContent = `Error: ${error.message}`;
        logMessage(`Error buscando DE: ${error.message}`);
    } finally {
        unblockUI();
    }
}

async function handleValidateEmail() {
    const email = emailToValidateInput.value.trim();
    if (!email) {
        alert('Por favor, introduce una dirección de email.');
        return;
    }
    blockUI();
    emailValidationResults.textContent = 'Validando...';
    logMessage(`Validando email: ${email}`);
    try {
        const config = await getTokenAndConfig();
        const result = await api.validateEmail(config, email);
        if (result.valid) {
            emailValidationResults.textContent = `El email "${result.email}" es VÁLIDO.`;
            logMessage("Validación completada: Válido.");
        } else {
            emailValidationResults.textContent = `El email "${result.email}" es INVÁLIDO.\nRazón: ${result.failedValidation}`;
            logMessage(`Validación completada: Inválido (${result.failedValidation}).`);
        }
    } catch(error) {
        emailValidationResults.textContent = `Error: ${error.message}`;
        logMessage(`Error validando email: ${error.message}`);
    } finally {
        unblockUI();
    }
}

async function handleFindDataSources() {
    const deName = deNameToFindInput.value.trim();
    if (!deName) {
        alert('Por favor, introduce el nombre de la Data Extension.');
        return;
    }
    blockUI();
    dataSourcesTbody.innerHTML = '<tr><td colspan="6">Buscando...</td></tr>';
    logMessage(`Buscando orígenes para DE: "${deName}"`);
    try {
        const config = await getTokenAndConfig();
        const sources = await api.findDataSources(config, deName);
        renderDataSourcesTable(sources);
        logMessage(`Búsqueda completada. Se encontraron ${sources.length} actividades.`);
    } catch (error) {
        dataSourcesTbody.innerHTML = `<tr><td colspan="6" style="color: red;">Error: ${error.message}</td></tr>`;
        logMessage(`Error buscando orígenes: ${error.message}`);
    } finally {
        unblockUI();
    }
}

/**
 * Renderiza los resultados en la tabla del buscador de orígenes.
 * @param {Array<object>} sources - El array de actividades encontradas.
 */
function renderDataSourcesTable(sources) {
    dataSourcesTbody.innerHTML = '';
    if (sources.length === 0) {
        dataSourcesTbody.innerHTML = '<tr><td colspan="6">No se encontraron orígenes de datos para esta Data Extension.</td></tr>';
        return;
    }
    sources.forEach(source => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${source.name || '---'}</td>
            <td>${source.type || '---'}</td>
            <td>${source.automationName || '---'}</td>
            <td>${source.step || '---'}</td>
            <td>${source.action || '---'}</td>
            <td style="white-space: pre-wrap; word-break: break-all; max-width: 400px; font-size: 0.9em;">${source.description || '---'}</td>
        `;
        dataSourcesTbody.appendChild(row);
    });
}


/**
 * Función de inicialización para el módulo de herramientas.
 * @param {string} view - El nombre de la vista específica a inicializar.
 */
export function initToolsModule(view) {
    currentView = view;
    queryElements();
    attachListeners();
}