// RUTA: src/renderer/js/modules/config-api.js

import { getToken } from '../api/sfmc-api.js';
import { logMessage, blockUI, unblockUI } from '../main-renderer.js';

let activeClientConfig = {};
let clientNameInput, savedConfigsSelect, sidebarClientSelect, saveConfigBtn, deleteConfigBtn;
let authUriInput, clientIdInput, clientSecretInput, businessUnitInput;
let tokenInput, soapUriInput, restUriInput, getTokenBtn;

export async function getTokenAndConfig() {
    if (!activeClientConfig || !activeClientConfig.clientId) {
        throw new Error("No hay cliente seleccionado. Vaya a 'Configuración de APIs'.");
    }
    if (activeClientConfig.token) {
        return activeClientConfig;
    }
    logMessage("Token no encontrado, recuperando uno nuevo...");
    try {
        const tokenData = await getToken({
            authUri: activeClientConfig.authUri,
            clientId: activeClientConfig.clientId,
            clientSecret: activeClientConfig.clientSecret,
            businessUnit: activeClientConfig.businessUnit
        });
        activeClientConfig.token = tokenData.access_token;
        activeClientConfig.soapUri = tokenData.soap_instance_url_formatted;
        activeClientConfig.restUri = tokenData.rest_instance_url_formatted;

        if (tokenInput) tokenInput.value = activeClientConfig.token;
        if (soapUriInput) soapUriInput.value = activeClientConfig.soapUri;
        if (restUriInput) restUriInput.value = activeClientConfig.restUri;
        
        logMessage("Token recuperado con éxito.");
        return activeClientConfig;
    } catch (error) {
        logMessage(`Error crítico al obtener el token: ${error.message}`);
        activeClientConfig.token = null; // Limpiar token para reintentar
        throw error;
    }
}

export function initConfigModule(isGlobalInit = false) {
    sidebarClientSelect = document.getElementById('sidebarClientSelect');
    if (isGlobalInit) {
        sidebarClientSelect.addEventListener('change', (e) => loadAndSyncClientConfig(e.target.value));
        loadConfigsIntoSelects();
        const lastSelectedClient = localStorage.getItem('lastSelectedClient') || '';
        if (lastSelectedClient) {
            loadAndSyncClientConfig(lastSelectedClient);
        }
    } else {
        queryElements();
        attachListeners();
        loadConfigsIntoSelects();
        const lastSelectedClient = localStorage.getItem('lastSelectedClient') || '';
        loadAndSyncClientConfig(lastSelectedClient);
    }
}

function queryElements() {
    clientNameInput = document.getElementById('clientName');
    savedConfigsSelect = document.getElementById('savedConfigs');
    saveConfigBtn = document.getElementById('saveConfig');
    deleteConfigBtn = document.getElementById('deleteConfig');
    authUriInput = document.getElementById('authUri');
    clientIdInput = document.getElementById('clientId');
    clientSecretInput = document.getElementById('clientSecret');
    businessUnitInput = document.getElementById('businessUnit');
    tokenInput = document.getElementById('token');
    soapUriInput = document.getElementById('soapUri');
    restUriInput = document.getElementById('restUri');
    getTokenBtn = document.getElementById('getTokenBtn');
}

function getFormConfig() {
    return {
        clientName: clientNameInput.value.trim(),
        businessUnit: businessUnitInput.value.trim(),
        authUri: authUriInput.value.trim(),
        clientId: clientIdInput.value.trim(),
        clientSecret: clientSecretInput.value.trim(),
    };
}

function setFormConfig(config = {}) {
    if (!clientNameInput) return;
    clientNameInput.value = config.clientName || '';
    businessUnitInput.value = config.businessUnit || '';
    authUriInput.value = config.authUri || '';
    clientIdInput.value = config.clientId || '';
    clientSecretInput.value = config.clientSecret || '';
    tokenInput.value = config.token || '';
    soapUriInput.value = config.soapUri || '';
    restUriInput.value = config.restUri || '';
}

function loadConfigsIntoSelects() {
    const configs = JSON.parse(localStorage.getItem('mcApiConfigs')) || {};
    // CORRECCIÓN CLAVE: Usamos '?' (optional chaining) para no fallar si savedConfigsSelect es null.
    const currentValue = sidebarClientSelect?.value || savedConfigsSelect?.value;

    if (savedConfigsSelect) savedConfigsSelect.innerHTML = '<option value="">Seleccionar configuración...</option>';
    if (sidebarClientSelect) sidebarClientSelect.innerHTML = '<option value="">Ninguno seleccionado</option>';

    for (const name in configs) {
        if (savedConfigsSelect) savedConfigsSelect.appendChild(new Option(name, name));
        if (sidebarClientSelect) sidebarClientSelect.appendChild(new Option(name, name));
    }
    
    if (savedConfigsSelect) savedConfigsSelect.value = currentValue;
    if (sidebarClientSelect) sidebarClientSelect.value = currentValue;
}

function loadAndSyncClientConfig(clientName) {
    const configs = JSON.parse(localStorage.getItem('mcApiConfigs')) || {};
    activeClientConfig = configs[clientName] || {};
    activeClientConfig.clientName = clientName;
    
    if (savedConfigsSelect) savedConfigsSelect.value = clientName;
    if (sidebarClientSelect) sidebarClientSelect.value = clientName;
    
    setFormConfig(activeClientConfig);
    
    localStorage.setItem('lastSelectedClient', clientName);
    if(clientName) logMessage(`Cliente '${clientName}' seleccionado.`);
}

function attachListeners() {
    saveConfigBtn.addEventListener('click', () => {
        const clientName = clientNameInput.value.trim();
        if (!clientName) return alert('Por favor, introduce un nombre para el cliente.');
        let configs = JSON.parse(localStorage.getItem('mcApiConfigs')) || {};
        configs[clientName] = getFormConfig();
        localStorage.setItem('mcApiConfigs', JSON.stringify(configs));
        alert(`Configuración para "${clientName}" guardada.`);
        loadConfigsIntoSelects();
        loadAndSyncClientConfig(clientName);
    });

    deleteConfigBtn.addEventListener('click', () => {
        const clientName = savedConfigsSelect.value;
        if (!clientName) return alert('Por favor, selecciona una configuración para borrar.');
        if (confirm(`¿Seguro que quieres borrar la configuración para "${clientName}"?`)) {
            let configs = JSON.parse(localStorage.getItem('mcApiConfigs')) || {};
            delete configs[clientName];
            localStorage.setItem('mcApiConfigs', JSON.stringify(configs));
            alert(`Configuración para "${clientName}" borrada.`);
            loadConfigsIntoSelects();
            loadAndSyncClientConfig('');
        }
    });
    
    getTokenBtn.addEventListener('click', async () => {
        blockUI();
        activeClientConfig = getFormConfig();
        try {
            await getTokenAndConfig();
            alert("Token recuperado y actualizado.");
        } catch (error) {
            alert(`Error: ${error.message}`);
        } finally {
            unblockUI();
        }
    });
}