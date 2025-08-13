document.addEventListener('DOMContentLoaded', function() {
    
    // ==========================================================
    // --- 1. DECLARACIÓN DE ELEMENTOS DEL DOM ---
    // ==========================================================
    
    // Generales
    const appContainer = document.querySelector('.app-container');
    const logRequestEl = document.getElementById('log-request');
    const logResponseEl = document.getElementById('log-response');
    const mainMenu = document.getElementById('main-menu');
    const sections = document.querySelectorAll('#main-content > .section');
    const toggleLogBtn = document.getElementById('toggleLogBtn');

    // Configuración Cliente y API
    const clientNameInput = document.getElementById('clientName');
    const saveConfigBtn = document.getElementById('saveConfig');
    const deleteConfigBtn = document.getElementById('deleteConfig');
    const savedConfigsSelect = document.getElementById('savedConfigs');
    const sidebarClientSelect = document.getElementById('sidebarClientSelect');
    const apiConfigSection = document.getElementById('configuracion-apis-section');
    const authUriInput = document.getElementById('authUri');
    const tokenField = document.getElementById('token');
    const soapUriInput = document.getElementById('soapUri');
    const restUriInput = document.getElementById('restUri'); 

    // Configuración Data Extension
    const deConfigSection = document.getElementById('configuracion-de-section');
    const deNameInput = document.getElementById('deName');
    const deExternalKeyInput = document.getElementById('deExternalKey');
    const isSendableCheckbox = document.getElementById('isSendable');
    const subscriberKeyFieldSelect = document.getElementById('subscriberKeyField');
    const subscriberKeyTypeInput = document.getElementById('subscriberKeyType');
    
    // Sección Campos de la DE
    const fieldsTableBody = document.querySelector('#myTable tbody');
    const createDummyFieldsBtn = document.getElementById('createDummyFieldsBtn');
    const clearFieldsBtn = document.getElementById('clearFieldsBtn');
    const addFieldBtn = document.getElementById('addFieldBtn');
    let selectedRow = null;

    // Sección Gestión de Campos
    const fieldActionSelect = document.getElementById('fieldActionSelect');
    const recExternalKeyInput = document.getElementById('recExternalKey');
    const deleteFieldNameInput = document.getElementById('deleteFieldName');


    // ==========================================================
    // --- 2. GESTIÓN DE ESTADO Y CONFIGURACIÓN ---
    // ==========================================================

    function logEvent(requestData, responseData) {
        logRequestEl.textContent = (typeof requestData === 'object') ? JSON.stringify(requestData, null, 2) : requestData;
        logResponseEl.textContent = (typeof responseData === 'object') ? JSON.stringify(responseData, null, 2) : responseData;
    }

    // --- Funciones para Configuración de APIs y Cliente ---

    const getApiConfigValues = () => {
        const config = {};
        apiConfigSection.querySelectorAll('input:not([type="checkbox"]), select').forEach(input => {
             if (input.id && !['clientName', 'savedConfigs'].includes(input.id)) {
                 config[input.id] = input.value;
             }
        });
        return config;
    };
    
    const setApiConfigValues = (config) => {
        apiConfigSection.querySelectorAll('input:not([type="checkbox"]), select').forEach(el => {
            if(el.id && !['clientName', 'savedConfigs'].includes(el.id)) {
                el.value = '';
            }
        });
        for (const key in config) {
            const element = document.getElementById(key);
            if (element) {
                element.value = config[key];
            }
        }
    };

    const loadConfigsIntoSelect = () => {
        const configs = JSON.parse(localStorage.getItem('mcApiConfigs')) || {};
        const currentValue = sidebarClientSelect.value || savedConfigsSelect.value;
        savedConfigsSelect.innerHTML = '<option value="">Seleccionar configuración...</option>';
        sidebarClientSelect.innerHTML = '<option value="">Ninguno seleccionado</option>';

        for (const name in configs) {
            const option1 = new Option(name, name);
            const option2 = new Option(name, name);
            savedConfigsSelect.appendChild(option1);
            sidebarClientSelect.appendChild(option2);
        }
        savedConfigsSelect.value = currentValue;
        sidebarClientSelect.value = currentValue;
    };

    function loadAndSyncClientConfig(clientName) {
        const configs = JSON.parse(localStorage.getItem('mcApiConfigs')) || {};
        const configToLoad = configs[clientName] || {};
        
        setApiConfigValues(configToLoad);
        clientNameInput.value = clientName;
        savedConfigsSelect.value = clientName;
        sidebarClientSelect.value = clientName;
    }

    // --- Funciones para Configuración de Data Extension ---

    function saveDeConfigState() {
        const config = {};
        deConfigSection.querySelectorAll('input:not([type="checkbox"]), select').forEach(el => {
            config[el.id] = el.value;
        });
        deConfigSection.querySelectorAll('input[type="checkbox"]').forEach(el => {
            config[el.id] = el.checked;
        });
        localStorage.setItem('mcDeConfig', JSON.stringify(config));
    }

    function loadDeConfigState() {
        const savedConfig = JSON.parse(localStorage.getItem('mcDeConfig'));
        if (savedConfig) {
            for (const key in savedConfig) {
                const element = document.getElementById(key);
                if (element) {
                    if (element.type === 'checkbox') {
                        element.checked = savedConfig[key];
                    } else {
                        element.value = savedConfig[key];
                    }
                }
            }
        }
    }


    // ==========================================================
    // --- 3. LÓGICA DE LA APLICACIÓN Y UI ---
    // ==========================================================
    
    // --- Lógica de Navegación y Macros ---

    window.showSection = function(sectionId) {
        mainMenu.style.display = 'none';
        sections.forEach(s => s.style.display = 'none');
        const sectionToShow = document.getElementById(sectionId);
        if (sectionToShow) {
            sectionToShow.style.display = 'flex';
        }
    };

    async function macroGetToken() {
        const config = getApiConfigValues();
        if (!config.authUri || !config.clientId || !config.clientSecret || !config.businessUnit) {
            alert("Por favor, complete los campos Auth URI, Client ID, Client Secret y Business Unit (MID) en la configuración.");
            logEvent({ error: "Faltan datos de configuración" }, "Operación cancelada.");
            return;
        }

        const payload = {
            "client_id": config.clientId,
            "client_secret": config.clientSecret,
            "grant_type": "client_credentials",
            "account_id": config.businessUnit
        };
        const requestDetails = { endpoint: config.authUri, method: "POST", headers: { "Content-Type": "application/json" }, body: payload };
        logEvent(requestDetails, "Recuperando token...");

        try {
            const response = await fetch(config.authUri, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const responseData = await response.json();

            if (!response.ok) {
                logEvent(requestDetails, responseData);
                throw new Error(`Error de la API: ${response.status} - ${responseData.error_description || 'Error desconocido'}`);
            }

            logEvent(requestDetails, responseData);
            
            tokenField.value = responseData.access_token || '';
            soapUriInput.value = responseData.soap_instance_url ? responseData.soap_instance_url + 'Service.asmx' : '';
            restUriInput.value = responseData.rest_instance_url || '';
            
            const currentClientName = clientNameInput.value.trim();
            if (currentClientName) {
                let configs = JSON.parse(localStorage.getItem('mcApiConfigs')) || {};
                configs[currentClientName] = getApiConfigValues();
                localStorage.setItem('mcApiConfigs', JSON.stringify(configs));
                console.log(`Configuración para "${currentClientName}" actualizada con el nuevo token y URIs.`);
            }
            alert("Token recuperado y actualizado en el formulario.");
        } catch (error) {
            console.error("Error al recuperar el token:", error);
            logResponseEl.textContent = `Error: ${error.message}\n\nRevisa la consola (F12) para más detalles.`;
        }
    }

    // --- Lógica de la Sección de Campos ---
    
    function createTableRow(data = {}) {
        const row = document.createElement('tr');
        const fieldData = {
            mc: data.mc || '', type: data.type || '', len: data.len || '',
            def: data.def || false, pk: data.pk || false, req: data.req || false
        };
        row.innerHTML = `
            <td class="editable" contenteditable="true">${fieldData.mc}</td>
            <td class="editable" contenteditable="true">${fieldData.type}</td>
            <td class="editable" contenteditable="true">${fieldData.len}</td>
            <td><input type="checkbox" ${fieldData.def ? 'checked' : ''}></td>
            <td><input type="checkbox" ${fieldData.pk ? 'checked' : ''}></td>
            <td><input type="checkbox" ${fieldData.req ? 'checked' : ''}></td>
        `;
        return row;
    }

    function clearFieldsTable() {
        fieldsTableBody.innerHTML = '';
        selectedRow = null;
        displaySelectedValues(null);
    }

    function createDummyFields() {
        clearFieldsTable();
        const dummyData = [
            { mc: 'NombreCompleto', type: 'Text', len: '100', pk: true, req: true }, { mc: 'SincronizarMC', type: 'Boolean' },
            { mc: 'FechaNacimiento', type: 'Date' }, { mc: 'Recibo', type: 'Decimal', len: '18,2', def: true },
            { mc: 'Telefono', type: 'Phone' }, { mc: 'Email', type: 'EmailAddress', len: '254' },
            { mc: 'Locale', type: 'Locale' }, { mc: 'Numero', type: 'Number' }
        ];
        dummyData.forEach(field => fieldsTableBody.appendChild(createTableRow(field)));
    }

    function addNewField() {
        fieldsTableBody.appendChild(createTableRow());
    }

    function displaySelectedValues(row) {
        const ul = document.querySelector('#selectedValues ul');
        ul.innerHTML = '';
        if (row) {
            const cells = row.querySelectorAll('td');
            const headers = document.querySelectorAll('#myTable th');
            cells.forEach((cell, index) => {
                const li = document.createElement('li');
                const headerText = headers[index] ? headers[index].textContent + ':' : '';
                if (cell.querySelector('input[type="checkbox"]')) {
                    const value = cell.querySelector('input[type="checkbox"]').checked ? 'True' : 'False';
                    li.textContent = `${headerText} ${value}`;
                } else {
                    li.textContent = `${headerText} ${cell.textContent}`;
                }
                ul.appendChild(li);
            });
        }
    }

    // --- Lógica de otras secciones ---

    function updateSubscriberKeyFieldOptions() {
        const currentSelection = subscriberKeyFieldSelect.value;
        subscriberKeyFieldSelect.innerHTML = ''; 
        const rows = fieldsTableBody.querySelectorAll('tr');

        if (rows.length === 0) {
            subscriberKeyFieldSelect.innerHTML = '<option value="">-- Primero defina campos --</option>';
            return;
        }

        subscriberKeyFieldSelect.innerHTML = '<option value="">-- Seleccione un campo --</option>';
        rows.forEach(row => {
            const fieldName = row.cells[0].textContent.trim();
            if (fieldName) {
                const option = new Option(fieldName, fieldName);
                option.dataset.type = row.cells[1].textContent.trim();
                subscriberKeyFieldSelect.appendChild(option);
            }
        });
        subscriberKeyFieldSelect.value = currentSelection; 
    }

    function handleSendableChange() {
        const isChecked = isSendableCheckbox.checked;
        subscriberKeyFieldSelect.disabled = !isChecked;
        if (!isChecked) {
            subscriberKeyFieldSelect.value = '';
            subscriberKeyTypeInput.value = '';
        }
    }

    function handleFieldActionChange() {
        const action = fieldActionSelect.value;
        recExternalKeyInput.disabled = true;
        deleteFieldNameInput.disabled = true;

        switch (action) {
            case 'recuperar': case 'crear':
                recExternalKeyInput.disabled = false;
                break;
            case 'borrar':
                recExternalKeyInput.disabled = false;
                deleteFieldNameInput.disabled = false;
                break;
        }
    }


    // ==========================================================
    // --- 4. REGISTRO DE EVENT LISTENERS ---
    // ==========================================================

    // Navegación y Macros
    document.querySelectorAll('.back-button').forEach(button => {
        button.addEventListener('click', () => {
            mainMenu.style.display = 'flex';
            sections.forEach(s => s.style.display = 'none');
        });
    });

    document.querySelectorAll('.macro-item').forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            const macroType = e.target.getAttribute('data-macro');
            if (macroType === 'getToken') macroGetToken();
            else logEvent({ macro_ejecutada: e.target.textContent.trim() }, { status: "Pendiente", mensaje: `Función no implementada.` });
        });
    });

    toggleLogBtn.addEventListener('click', () => {
        const isCollapsed = appContainer.classList.toggle('log-collapsed');
        localStorage.setItem('logCollapsedState', isCollapsed);
    });

    // Configuración de APIs y Cliente
    saveConfigBtn.addEventListener('click', () => {
        const clientName = clientNameInput.value.trim();
        if (!clientName) return alert('Por favor, introduce un nombre para el cliente.'); 
        let configs = JSON.parse(localStorage.getItem('mcApiConfigs')) || {};
        configs[clientName] = getApiConfigValues();
        localStorage.setItem('mcApiConfigs', JSON.stringify(configs));
        alert(`Configuración para "${clientName}" guardada.`);
        loadConfigsIntoSelect();
        loadAndSyncClientConfig(clientName);
    });

    deleteConfigBtn.addEventListener('click', () => {
        const clientName = savedConfigsSelect.value;
        if (!clientName) return alert('Por favor, selecciona una configuración para borrar.'); 
        if (confirm(`¿Estás seguro de que quieres borrar la configuración para "${clientName}"?`)) {
            let configs = JSON.parse(localStorage.getItem('mcApiConfigs')) || {};
            delete configs[clientName];
            localStorage.setItem('mcApiConfigs', JSON.stringify(configs));
            alert(`Configuración para "${clientName}" borrada.`);
            loadConfigsIntoSelect();
            loadAndSyncClientConfig('');
        }
    });

    savedConfigsSelect.addEventListener('change', (e) => loadAndSyncClientConfig(e.target.value));
    sidebarClientSelect.addEventListener('change', (e) => loadAndSyncClientConfig(e.target.value));
    
    authUriInput.addEventListener('blur', () => {
        if (!authUriInput.value.trim()) return;
        authUriInput.value = authUriInput.value.split('/v2/token').join('').replace(/\/+$/, '') + '/v2/token';
    });

    // Configuración de Data Extension
    deNameInput.addEventListener('input', () => {
        deExternalKeyInput.value = deNameInput.value.replace(/\s+/g, '_') + '_CK';
    });
    deConfigSection.addEventListener('input', saveDeConfigState);
    deConfigSection.addEventListener('change', saveDeConfigState);
    isSendableCheckbox.addEventListener('change', handleSendableChange);
    subscriberKeyFieldSelect.addEventListener('change', () => {
        const selectedOption = subscriberKeyFieldSelect.options[subscriberKeyFieldSelect.selectedIndex];
        subscriberKeyTypeInput.value = (selectedOption && selectedOption.dataset.type) ? selectedOption.dataset.type : '';
    });

    // Sección Campos de la DE
    createDummyFieldsBtn.addEventListener('click', createDummyFields);
    clearFieldsBtn.addEventListener('click', clearFieldsTable);
    addFieldBtn.addEventListener('click', addNewField);

    fieldsTableBody.addEventListener('click', (e) => {
        const targetRow = e.target.closest('tr');
        if (targetRow) {
            if (targetRow !== selectedRow) {
                document.querySelectorAll('#myTable tbody tr').forEach(r => r.classList.remove('selected'));
                targetRow.classList.add('selected');
                selectedRow = targetRow;
            }
            displaySelectedValues(targetRow);
        }
    });

    document.getElementById('moveUp').addEventListener('click', () => {
      if (selectedRow && selectedRow.previousElementSibling) {
        selectedRow.parentNode.insertBefore(selectedRow, selectedRow.previousElementSibling);
      }
    });
    document.getElementById('moveDown').addEventListener('click', () => {
      if (selectedRow && selectedRow.nextElementSibling) {
        selectedRow.parentNode.insertBefore(selectedRow.nextElementSibling, selectedRow);
      }
    });

    const observer = new MutationObserver(updateSubscriberKeyFieldOptions);
    observer.observe(fieldsTableBody, { childList: true, subtree: true, characterData: true });

    // Sección Gestión de Campos
    fieldActionSelect.addEventListener('change', handleFieldActionChange);

    // ==========================================================
    // --- 5. INICIALIZACIÓN ---
    // ==========================================================

    function initializeLogState() {
        if (localStorage.getItem('logCollapsedState') === 'true') {
            appContainer.classList.add('log-collapsed');
        }
    }

    loadConfigsIntoSelect();
    loadDeConfigState();
    handleSendableChange();
    handleFieldActionChange();
    initializeLogState();
});