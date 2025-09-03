// Fichero: src/renderer/components/org-manager.js
// Descripción: Módulo para gestionar las configuraciones de los clientes (organizaciones),
// incluyendo guardar, cargar, seleccionar, login y logout.

import elements from '../ui/dom-elements.js';
import * as ui from '../ui/ui-helpers.js';
import * as logger from '../ui/logger.js';

// --- ESTADO DEL MÓDULO ---
let selectedConfigRow = null;

// --- DEPENDENCIAS INYECTADAS ---
let getAuthenticatedConfig;
let updateLoginStatus;
let customerFinder;
let calendar;
let automationsManager;
let journeysManager;
let cloudPagesManager;

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
    try {
        const configs = JSON.parse(localStorage.getItem('mcApiConfigs')) || {};
        updateLoginStatus(false);

        calendar.clearData();
        automationsManager.clearCache();
        journeysManager.clearCache();
        cloudPagesManager.clearCache();

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

    elements.saveConfigBtn.addEventListener('click', saveClientConfig);
    elements.loginBtn.addEventListener('click', startLogin);
    elements.logoutBtn.addEventListener('click', logout);

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