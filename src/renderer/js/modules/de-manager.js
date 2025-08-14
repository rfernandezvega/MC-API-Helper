// RUTA: src/renderer/js/modules/tools.js

import * as api from '../api/sfmc-api.js';
import { getTokenAndConfig } from './config-api.js';
import { logMessage, blockUI, unblockUI } from '../main-renderer.js';

let currentView = '';
let deSearchProperty, deSearchValue, searchDEBtn, deSearchResults;
let emailToValidateInput, validateEmailBtn, emailValidationResults;
let deNameToFindInput, findDataSourcesBtn, dataSourcesTbody;

async function handleSearchDE() {
    const property = deSearchProperty.value;
    const value = deSearchValue.value.trim();
    if (!value) return alert("El campo 'Valor' no puede estar vacío.");
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
    if (!email) return alert('Por favor, introduce una dirección de email.');
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
    if (!deName) return alert('Por favor, introduce el nombre de la Data Extension.');
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

function renderDataSourcesTable(sources) {
    dataSourcesTbody.innerHTML = '';
    if (sources.length === 0) {
        dataSourcesTbody.innerHTML = '<tr><td colspan="6">No se encontraron orígenes de datos.</td></tr>';
        return;
    }
    sources.forEach(source => {
        const row = document.createElement('tr');
        row.innerHTML = `<td>${source.name || '---'}</td><td>${source.type || '---'}</td><td>${source.automationName || '---'}</td><td>${source.step || '---'}</td><td>${source.action || '---'}</td><td style="white-space: pre-wrap; word-break: break-all; max-width: 400px; font-size: 0.9em;">${source.description || '---'}</td>`;
        dataSourcesTbody.appendChild(row);
    });
}

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

function attachListeners() {
    if (currentView === 'find-de') searchDEBtn.addEventListener('click', handleSearchDE);
    if (currentView === 'validate-email') validateEmailBtn.addEventListener('click', handleValidateEmail);
    if (currentView === 'find-sources') findDataSourcesBtn.addEventListener('click', handleFindDataSources);
}

export function initToolsModule(view) {
    currentView = view;
    queryElements();
    attachListeners();
}