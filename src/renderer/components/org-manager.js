// Fichero: src/renderer/components/org-manager.js
// Descripción: Módulo para gestionar las configuraciones de los clientes (organizaciones),
// incluyendo guardar, cargar, seleccionar, login y logout.

import elements from '../ui/dom-elements.js';
import * as ui from '../ui/ui-helpers.js';
import * as logger from '../ui/logger.js';

// --- ESTADO DEL MÓDULO ---
let selectedConfigRow = null;
let currentActiveClient = '';

// --- DEPENDENCIAS INYECTADAS ---
let getAuthenticatedConfig;
let updateLoginStatus;
let customerFinder;
let calendar;
let automationsManager;
let journeysManager;
let cloudPagesManager;
let contentManager;

/**
 * Recoge los valores del formulario que son seguros para guardar en localStorage.
 * @returns {object} Un objeto con la configuración segura del cliente.
 */
function getConfigToSave() {
    return {
        authUri: elements.authUriInput.value,
        businessUnit: elements.businessUnitInput.value,
        clientId: elements.clientIdInput.value,
        stackKey: elements.stackKeyInput.value,
        dvConfigs: getDvConfigsFromTable()
    };
}

/**
 * Guarda la configuración actual en el localStorage.
 */
function saveClientConfig() {
    logger.startLogBuffering();
    try {
        const clientName = elements.clientNameInput.value.trim();
        if (!clientName) {
            ui.showCustomAlert('Introduzca un nombre para el cliente antes de guardar.');
            return;
        }
        let configs = JSON.parse(localStorage.getItem('mcApiConfigs')) || {};
        configs[clientName] = getConfigToSave();
        localStorage.setItem('mcApiConfigs', JSON.stringify(configs));
        loadConfigsIntoSelect();
        const configToLoad = configs[clientName] || {};
        customerFinder.updateClientConfig(configToLoad);
        logger.logMessage(`Configuración para "${clientName}" guardada localmente.`);
        ui.showCustomAlert(`Configuración para "${clientName}" guardada.`);
    } finally {
        logger.endLogBuffering();
    }
}

/**
 * Inicia el proceso de login.
 */
function startLogin() {
    logger.startLogBuffering();
    try {
        const clientName = elements.clientNameInput.value.trim();
        if (!clientName) {
            ui.showCustomAlert('Introduzca un nombre para el cliente.');
            return;
        }
        
        const config = {
            clientName,
            authUri: elements.authUriInput.value.trim(),
            clientId: elements.clientIdInput.value.trim(),
            clientSecret: elements.clientSecretInput.value.trim(),
            businessUnit: elements.businessUnitInput.value.trim()
        };

        if (!config.authUri || !config.clientId || !config.clientSecret || !config.businessUnit) {
            ui.showCustomAlert('Se necesitan Auth URI, Client ID, Client Secret y MID para el login.');
            return;
        }
        
        saveClientConfig();
        
        logger.logMessage("Configuración guardada. Iniciando login...");
        ui.blockUI("Iniciando login...");
        window.electronAPI.startLogin(config);
    } finally {
        logger.endLogBuffering();
    }
}

/**
 * Inicia el proceso de logout y borrado de configuración.
 */
async function logout() {
    logger.startLogBuffering();
    try {
        const clientName = elements.savedConfigsSelect.value;
        if (!clientName) {
            ui.showCustomAlert("Seleccione un cliente para hacer logout.");
            return;
        }
        if (await ui.showCustomConfirm(`Esto borrará la configuración y cerrará la sesión para "${clientName}". ¿Continuar?`)) {
            let configs = JSON.parse(localStorage.getItem('mcApiConfigs')) || {};
            delete configs[clientName];
            localStorage.setItem('mcApiConfigs', JSON.stringify(configs));
            window.electronAPI.logout(clientName);
        }
    } finally {
        logger.endLogBuffering();
    }
}


/**
 * Rellena los campos del formulario de configuración con un objeto de configuración dado.
 * @param {object} config - El objeto de configuración a cargar.
 */
function setClientConfigForm(config) {
    elements.businessUnitInput.value = config.businessUnit || '';
    elements.authUriInput.value = config.authUri || '';
    elements.clientIdInput.value = config.clientId || '';
    elements.stackKeyInput.value = config.stackKey || '';
    populateDvConfigsTable(config.dvConfigs);
    elements.tokenField.value = '';
    elements.soapUriInput.value = '';
    elements.restUriInput.value = '';
    elements.clientSecretInput.value = '';
}

/**
 * Carga todas las configuraciones guardadas en `localStorage` y las muestra en los selectores.
 */
export function loadConfigsIntoSelect() {
    const configs = JSON.parse(localStorage.getItem('mcApiConfigs')) || {};
    const currentValue = elements.sidebarClientSelect.value || elements.savedConfigsSelect.value;
    elements.savedConfigsSelect.innerHTML = '<option value="">Seleccionar configuración...</option>';
    elements.sidebarClientSelect.innerHTML = '<option value="">Ninguno seleccionado</option>';
    for (const name in configs) {
        elements.savedConfigsSelect.appendChild(new Option(name, name));
        elements.sidebarClientSelect.appendChild(new Option(name, name));
    }
    elements.savedConfigsSelect.value = currentValue;
    elements.sidebarClientSelect.value = currentValue;
}

/**
 * Carga la configuración de un cliente, la aplica y valida la sesión.
 * @param {string} clientName - El nombre del cliente a cargar.
 */
export function loadAndSyncClientConfig(clientName) {
    logger.startLogBuffering();

    // --- LÓGICA DE CAMBIO AÑADIDA ---
    // Si el cliente seleccionado es el mismo que ya está activo, no hacemos nada.
    if (clientName === currentActiveClient) {
        logger.logMessage(`Cliente "${clientName}" ya está activo.`);
        logger.endLogBuffering();
        return;
    }

    try {
        // Solo limpiamos las cachés si estamos cambiando de cliente (o seleccionando "ninguno")
        logger.logMessage(`Cambiando de cliente: de "${currentActiveClient || 'ninguno'}" a "${clientName || 'ninguno'}"`);
        calendar.clearData();
        automationsManager.clearCache();
        journeysManager.clearCache();
        cloudPagesManager.clearCache();
        if (contentManager) contentManager.clearCache();

        // Actualizamos el cliente activo
        currentActiveClient = clientName; 
        
        const configs = JSON.parse(localStorage.getItem('mcApiConfigs')) || {};
        updateLoginStatus(false);

        if (clientName) {
            ui.blockUI("Cargando configuración...");
            const configToLoad = configs[clientName] || {};
            customerFinder.updateClientConfig(configToLoad);
            setClientConfigForm(configToLoad);
            elements.clientNameInput.value = clientName;
            elements.savedConfigsSelect.value = clientName;
            elements.sidebarClientSelect.value = clientName;

            logger.logMessage(`Cliente "${clientName}" cargado. Comprobando sesión...`);
            getAuthenticatedConfig()
                .catch(() => { /* Error ya manejado internamente */ })
                .finally(ui.unblockUI);
        } else {
            setClientConfigForm({});
            elements.clientNameInput.value = '';
            elements.savedConfigsSelect.value = '';
            elements.sidebarClientSelect.value = '';
            logger.logMessage("Ningún cliente seleccionado.");
        }
    } finally {
        logger.endLogBuffering();
    }
}

/**
 * Exporta la configuración de búsqueda en DEs a un fichero CSV.
 */
async function exportDvConfig() {
    logger.startLogBuffering();
    try {
        const configs = getDvConfigsFromTable();
        // Filtrar filas vacías que el usuario pueda haber añadido sin rellenar
        const validConfigs = configs.filter(c => c.title || c.deKey || c.field);

        if (validConfigs.length === 0) {
            ui.showCustomAlert('No hay datos en la tabla para exportar.');
            return;
        }

        const headers = '"Nombre","External Key","Campo de Búsqueda"';
        const rows = validConfigs.map(c => `"${c.title}","${c.deKey}","${c.field}"`);
        const csvContent = [headers, ...rows].join('\n');

        const clientName = elements.clientNameInput.value.trim().replace(/\s+/g, '_') || 'config';
        const fileName = `config_busqueda_DEs_${clientName}.csv`;

        const result = await window.electronAPI.saveCsvFile({ content: csvContent, defaultName: fileName });
        if (result.success) {
            logger.logMessage(`Configuración exportada correctamente a: ${result.filePath}`);
            ui.showCustomAlert('Configuración exportada con éxito.');
        } else if (!result.canceled) {
            logger.logMessage(`Error al exportar la configuración: ${result.error}`);
            ui.showCustomAlert(`Error al exportar: ${result.error}`);
        }
    } catch (error) {
        logger.logMessage(`Error inesperado durante la exportación: ${error.message}`);
    } finally {
        logger.endLogBuffering();
    }
}

/**
 * Importa una configuración de búsqueda en DEs desde un fichero CSV,
 * fusionando los datos sin crear duplicados.
 */
async function importDvConfig() {
    logger.startLogBuffering();
    try {
        const result = await window.electronAPI.openCsvFile();
        if (result.canceled || !result.content) {
            logger.logMessage('Importación de CSV cancelada por el usuario.');
            return;
        }

        const existingConfigs = getDvConfigsFromTable().filter(c => c.deKey); // Usamos deKey como identificador
        const existingKeys = new Set(existingConfigs.map(c => c.deKey));

        const newConfigs = [];
        const lines = result.content.trim().split('\n');
        // Empezamos en 1 para saltar la cabecera
        for (let i = 1; i < lines.length; i++) {
            const line = lines[i].trim();
            if (!line) continue;

            // Simple parseo de CSV que asume comillas
            const parts = line.split('","').map(p => p.replace(/"/g, ''));
            if (parts.length < 3) continue;

            const newConfig = {
                title: parts[0] || '',
                deKey: parts[1] || '',
                field: parts[2] || ''
            };

            // Si la clave externa no está vacía y no existe ya, la añadimos
            if (newConfig.deKey && !existingKeys.has(newConfig.deKey)) {
                newConfigs.push(newConfig);
                existingKeys.add(newConfig.deKey); // Prevenir duplicados dentro del mismo fichero
            }
        }

        if (newConfigs.length > 0) {
            const mergedConfigs = [...existingConfigs, ...newConfigs];
            populateDvConfigsTable(mergedConfigs);
            saveClientConfig();
            logger.logMessage(`${newConfigs.length} nueva(s) configuracion(es) importada(s) y añadidas a la tabla.`);
            ui.showCustomAlert(`Se han importado ${newConfigs.length} nuevas filas.`);
        } else {
            logger.logMessage('No se encontraron nuevas configuraciones para importar en el fichero seleccionado.');
            ui.showCustomAlert('El fichero no contenía ninguna configuración nueva que no estuviera ya en la tabla.');
        }

    } catch (error) {
        logger.logMessage(`Error al importar el fichero CSV: ${error.message}`);
        ui.showCustomAlert(`Error al procesar el fichero: ${error.message}`);
    } finally {
        logger.endLogBuffering();
    }
}


// --- HELPERS PARA LA TABLA DE CONFIGURACIÓN DE BÚSQUEDA ---

function getDvConfigsFromTable() {
    return Array.from(elements.sendsConfigTbody.querySelectorAll('tr')).map(row => ({
        title: row.cells[0].textContent.trim(),
        deKey: row.cells[1].textContent.trim(),
        field: row.cells[2].textContent.trim()
    }));
}

function populateDvConfigsTable(configs = []) {
    elements.sendsConfigTbody.innerHTML = '';
    if (!configs || configs.length === 0) {
        configs = [{ title: '', deKey: '', field: '' }];
    }
    configs.forEach(config => {
        const newRow = elements.sendsConfigTbody.insertRow();
        newRow.innerHTML = `<td contenteditable="true">${config.title}</td><td contenteditable="true">${config.deKey}</td><td contenteditable="true">${config.field}</td>`;
        const deleteButton = document.createElement('button');
        deleteButton.className = 'delete-row-btn';
        deleteButton.title = 'Eliminar fila';
        deleteButton.textContent = '×';
        newRow.appendChild(deleteButton);
    });
}


/**
 * Inicializa el módulo, configurando listeners y dependencias externas.
 * @param {object} dependencies - Objeto con las dependencias necesarias.
 */
export function init(dependencies) {
    getAuthenticatedConfig = dependencies.getAuthenticatedConfig;
    updateLoginStatus = dependencies.updateLoginStatus;
    customerFinder = dependencies.customerFinder;
    calendar = dependencies.calendar;
    automationsManager = dependencies.automationsManager;
    journeysManager = dependencies.journeysManager;
    cloudPagesManager = dependencies.cloudPagesManager;
    contentManager = dependencies.contentManager;

    elements.saveConfigBtn.addEventListener('click', saveClientConfig);
    elements.loginBtn.addEventListener('click', startLogin);
    elements.logoutBtn.addEventListener('click', logout);

    elements.exportDvConfigBtn.addEventListener('click', exportDvConfig);
    elements.importDvConfigBtn.addEventListener('click', importDvConfig);

    elements.savedConfigsSelect.addEventListener('change', (e) => loadAndSyncClientConfig(e.target.value));
    elements.sidebarClientSelect.addEventListener('change', (e) => loadAndSyncClientConfig(e.target.value));

    elements.addSendConfigRowBtn.addEventListener('click', () => {
        const newRow = elements.sendsConfigTbody.insertRow();
        newRow.innerHTML = `<td contenteditable="true"></td><td contenteditable="true"></td><td contenteditable="true"></td>`;
        const deleteButton = document.createElement('button');
        deleteButton.className = 'delete-row-btn';
        deleteButton.title = 'Eliminar fila';
        deleteButton.textContent = '×';
        newRow.appendChild(deleteButton);
    });

    elements.sendsConfigTbody.addEventListener('click', (e) => {
        const targetRow = e.target.closest('tr');
        if (!targetRow) return;

        if (e.target.matches('.delete-row-btn')) {
            if (targetRow === selectedConfigRow) selectedConfigRow = null;
            targetRow.remove();
        } else { 
            if (targetRow !== selectedConfigRow) {
                if (selectedConfigRow) selectedConfigRow.classList.remove('selected');
                targetRow.classList.add('selected');
                selectedConfigRow = targetRow;
            }
        }
    });

    // Añade automáticamente /v2/token a la Auth URI si no está presente.
    elements.authUriInput.addEventListener('blur', () => {
        const uri = elements.authUriInput.value.trim();
        if (uri && !uri.endsWith('v2/token')) {
            elements.authUriInput.value = (uri.endsWith('/') ? uri : uri + '/') + 'v2/token';
        }
    });
}