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
    const recExternalKeyInput = document.getElementById('recExternalKey');
    const targetFieldSelect = document.getElementById('targetFieldSelect'); 

    // ==========================================================
    // --- 2. GESTIÓN DE ESTADO Y CONFIGURACIÓN ---
    // ==========================================================

    function logEvent(requestData, responseData) {
        logRequestEl.textContent = (typeof requestData === 'object') ? JSON.stringify(requestData, null, 2) : requestData;
        logResponseEl.textContent = (typeof responseData === 'object') ? JSON.stringify(responseData, null, 2) : responseData;
    }

    // --- Funciones para Configuración de APIs y Cliente (Guardado Simple) ---
    const getApiConfigValues = () => {
        const config = {};
        apiConfigSection.querySelectorAll('input:not([type="checkbox"]), select').forEach(input => {
             if (input.id && !['clientName', 'savedConfigs'].includes(input.id)) config[input.id] = input.value;
        });
        return config;
    };
    
    const setApiConfigValues = (config) => {
        apiConfigSection.querySelectorAll('input:not([type="checkbox"]), select').forEach(el => {
            if(el.id && !['clientName', 'savedConfigs'].includes(el.id)) el.value = '';
        });
        for (const key in config) {
            const element = document.getElementById(key);
            if (element) element.value = config[key];
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

    // --- Funciones para Configuración de Data Extension (Guardado Automático) ---
    function saveDeConfigState() {
        const config = {};
        deConfigSection.querySelectorAll('input:not([type="checkbox"]), select').forEach(el => config[el.id] = el.value);
        deConfigSection.querySelectorAll('input[type="checkbox"]').forEach(el => config[el.id] = el.checked);
        localStorage.setItem('mcDeConfig', JSON.stringify(config));
    }

    function loadDeConfigState() {
        const savedConfig = JSON.parse(localStorage.getItem('mcDeConfig'));
        if (savedConfig) {
            for (const key in savedConfig) {
                const element = document.getElementById(key);
                if (element) {
                    element.type === 'checkbox' ? (element.checked = savedConfig[key]) : (element.value = savedConfig[key]);
                }
            }
        }
    }


    // ==========================================================
    // --- 3. LÓGICA DE LA APLICACIÓN Y UI ---
    // ==========================================================
    
    window.showSection = function(sectionId) {
        mainMenu.style.display = 'none';
        sections.forEach(s => s.style.display = 'none');
        const sectionToShow = document.getElementById(sectionId);
        if (sectionToShow) sectionToShow.style.display = 'flex';
    };

    async function macroGetToken(silent = false) {
        const config = getApiConfigValues();
        if (!config.authUri || !config.clientId || !config.clientSecret || !config.businessUnit) {
            if (!silent) alert("Por favor, complete los campos Auth URI, Client ID, Client Secret y Business Unit (MID) en la configuración.");
            logEvent({ error: "Faltan datos de configuración" }, "Operación cancelada.");
            return Promise.reject(new Error("Faltan datos de configuración"));
        }
        const payload = { "client_id": config.clientId, "client_secret": config.clientSecret, "grant_type": "client_credentials", "account_id": config.businessUnit };
        const requestDetails = { endpoint: config.authUri, method: "POST", headers: { "Content-Type": "application/json" }, body: payload };
        if (!silent) logEvent(requestDetails, "Recuperando token...");
        try {
            const response = await fetch(config.authUri, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
            const responseData = await response.json();
            if (!response.ok) throw new Error(`Error de la API: ${response.status} - ${responseData.error_description || 'Error desconocido'}`);
            tokenField.value = responseData.access_token || '';
            soapUriInput.value = responseData.soap_instance_url ? responseData.soap_instance_url + 'Service.asmx' : '';
            restUriInput.value = responseData.rest_instance_url || '';
            const currentClientName = clientNameInput.value.trim();
            if (currentClientName) {
                let configs = JSON.parse(localStorage.getItem('mcApiConfigs')) || {};
                configs[currentClientName] = getApiConfigValues();
                localStorage.setItem('mcApiConfigs', JSON.stringify(configs));
            }
            if (!silent) {
                logEvent(requestDetails, responseData);
                alert("Token recuperado y actualizado en el formulario.");
            }
        } catch (error) {
            if (!silent) {
                logEvent(requestDetails, { message: error.message });
                logResponseEl.textContent = `Error: ${error.message}\n\nRevisa la consola (F12).`;
            }
            console.error("Error al recuperar el token:", error);
            return Promise.reject(error);
        }
    }

    function parseSoapFields(xmlString) {
        const fields = [];
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(xmlString, "application/xml");
        const resultsNodes = xmlDoc.querySelectorAll("Results");
        resultsNodes.forEach(node => {
            const nameNode = node.querySelector("Name");
            const objectIdNode = node.querySelector("ObjectID");
            if (nameNode && objectIdNode) fields.push({ name: nameNode.textContent, objectId: objectIdNode.textContent });
        });
        return fields;
    }

    async function macroGetFieldIds() {
        const externalKey = recExternalKeyInput.value.trim();
        if (!externalKey) {
            alert('Por favor, introduce un valor en el campo "External Key de la DE".');
            return logEvent({ error: "Falta External Key" }, "Operación cancelada.");
        }
        logEvent({ info: `Buscando campos para la DE con Key: ${externalKey}` }, "Actualizando token...");
        targetFieldSelect.disabled = true;
        targetFieldSelect.innerHTML = `<option>Recuperando...</option>`;
        try {
            await macroGetToken(true);
            const token = tokenField.value;
            const soapUri = soapUriInput.value;
            if (!token || !soapUri) throw new Error('No se pudo obtener un token o la SOAP URI no está configurada.');
            const soapPayload = `<s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope" xmlns:a="http://schemas.xmlsoap.org/ws/2004/08/addressing"><s:Header><a:Action s:mustUnderstand="1">Retrieve</a:Action><a:To s:mustUnderstand="1">${soapUri}</a:To><fueloauth xmlns="http://exacttarget.com">${token}</fueloauth></s:Header><s:Body xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema"><RetrieveRequestMsg xmlns="http://exacttarget.com/wsdl/partnerAPI"><RetrieveRequest><ObjectType>DataExtensionField</ObjectType><Properties>Name</Properties><Properties>ObjectID</Properties><Filter xsi:type="SimpleFilterPart"><Property>DataExtension.CustomerKey</Property><SimpleOperator>equals</SimpleOperator><Value>${externalKey}</Value></Filter></RetrieveRequest></RetrieveRequestMsg></s:Body></s:Envelope>`;
            const requestDetails = { endpoint: soapUri, method: "POST", headers: { 'Content-Type': 'text/xml' }, payload: soapPayload.trim() };
            logEvent(requestDetails, "Enviando petición SOAP...");
            const response = await fetch(soapUri, { method: 'POST', headers: { 'Content-Type': 'text/xml' }, body: requestDetails.payload });
            const responseText = await response.text();
            logEvent(requestDetails, { status: response.status, statusText: response.statusText, body: responseText });
            const fields = parseSoapFields(responseText);
            targetFieldSelect.innerHTML = ''; 
            if (fields.length > 0) {
                targetFieldSelect.appendChild(new Option('-- Seleccione un campo --', ''));
                fields.forEach(field => targetFieldSelect.appendChild(new Option(field.name, field.objectId)));
                targetFieldSelect.disabled = false;
                alert(`${fields.length} campos recuperados y cargados en la lista.`);
            } else {
                targetFieldSelect.appendChild(new Option('No se encontraron campos', ''));
                alert('La llamada fue exitosa pero no se encontraron campos para la External Key proporcionada.');
            }
        } catch (error) {
            console.error("Error en macroGetFieldIds:", error);
            logEvent({ error: "Error de ejecución" }, { message: `Error: ${error.message}.` });
            targetFieldSelect.innerHTML = `<option>Error al recuperar campos</option>`;
        }
    }

    async function macroDeleteField() {
        const externalKey = recExternalKeyInput.value.trim();
        const fieldObjectId = targetFieldSelect.value;
        const selectedFieldName = targetFieldSelect.selectedOptions[0]?.text;

        if (!externalKey) {
            alert('Por favor, introduce la External Key de la Data Extension.');
            return logEvent({ error: "Falta External Key" }, "Operación cancelada.");
        }
        if (!fieldObjectId) {
            alert('Por favor, primero recupera los campos y luego selecciona uno de la lista para eliminar.');
            return logEvent({ error: "No se ha seleccionado ningún campo" }, "Operación cancelada.");
        }

        logEvent({ info: `Iniciando borrado del campo "${selectedFieldName}"...` }, "Actualizando token...");

        try {
            await macroGetToken(true); // Refresca el token silenciosamente
            const token = tokenField.value;
            const soapUri = soapUriInput.value;
            if (!token || !soapUri) throw new Error('No se pudo obtener un token o la SOAP URI no está configurada.');

            const soapPayload = `
<s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope" xmlns:a="http://schemas.xmlsoap.org/ws/2004/08/addressing">
    <s:Header>
        <fueloauth xmlns="http://exacttarget.com">${token}</fueloauth>
        <a:Action s:mustUnderstand="1">Delete</a:Action>
        <a:To s:mustUnderstand="1">${soapUri}</a:To>
    </s:Header>
    <s:Body xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
        <DeleteRequest xmlns="http://exacttarget.com/wsdl/partnerAPI">
            <Objects xsi:type="DataExtension">
                <CustomerKey>${externalKey}</CustomerKey>
                <Fields>
                    <Field>
                        <ObjectID>${fieldObjectId}</ObjectID>
                    </Field>
                </Fields>
            </Objects>
        </DeleteRequest>
    </s:Body>
</s:Envelope>`;

            const requestDetails = { endpoint: soapUri, method: "POST", headers: { 'Content-Type': 'text/xml' }, payload: soapPayload.trim() };
            logEvent(requestDetails, "Enviando petición SOAP de borrado...");

            const response = await fetch(soapUri, { method: 'POST', headers: { 'Content-Type': 'text/xml' }, body: requestDetails.payload });
            const responseText = await response.text();
            logEvent(requestDetails, { status: response.status, statusText: response.statusText, body: responseText });

            if (responseText.includes('<OverallStatus>OK</OverallStatus>')) {
                alert(`Campo "${selectedFieldName}" eliminado con éxito. Refrescando lista de campos...`);
                await macroGetFieldIds();
            } else {
                const errorMatch = responseText.match(/<StatusMessage>(.*?)<\/StatusMessage>/);
                const errorMessage = errorMatch ? errorMatch[1] : 'Error desconocido. Revisa el log de respuesta.';
                throw new Error(errorMessage);
            }
        } catch (error) {
            console.error("Error en macroDeleteField:", error);
            alert(`Error al eliminar el campo: ${error.message}`);
            logEvent({ error: "Error de ejecución" }, { message: `Error: ${error.message}.` });
        }
    }
    
    // --- Lógica de la Sección de Campos ---
    function createTableRow(data = {}) {
        const row = document.createElement('tr');
        const fieldData = { mc: data.mc || '', type: data.type || '', len: data.len || '', def: data.def || false, pk: data.pk || false, req: data.req || false };
        row.innerHTML = `<td class="editable" contenteditable="true">${fieldData.mc}</td><td class="editable" contenteditable="true">${fieldData.type}</td><td class="editable" contenteditable="true">${fieldData.len}</td><td><input type="checkbox" ${fieldData.def ? 'checked' : ''}></td><td><input type="checkbox" ${fieldData.pk ? 'checked' : ''}></td><td><input type="checkbox" ${fieldData.req ? 'checked' : ''}></td>`;
        const deleteButton = document.createElement('button');
        deleteButton.className = 'delete-row-btn';
        deleteButton.title = 'Eliminar fila';
        deleteButton.innerHTML = '×';
        row.appendChild(deleteButton);
        return row;
    }

    function clearFieldsTable() {
        fieldsTableBody.innerHTML = '';
        selectedRow = null;
        logSelectedRowData(null);
        addNewField();
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

    function logSelectedRowData(row) {
        if (!row) return logEvent('Fila deseleccionada.', '');
        const rowData = {};
        const headers = document.querySelectorAll('#myTable th');
        const cells = row.querySelectorAll('td');
        cells.forEach((cell, index) => {
            if (headers[index] && headers[index].textContent !== 'Acciones') {
                const headerText = headers[index].textContent;
                const checkbox = cell.querySelector('input[type="checkbox"]');
                rowData[headerText] = checkbox ? checkbox.checked : cell.textContent;
            }
        });
        logEvent(rowData, 'Fila seleccionada en la tabla.');
    }

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

    // ==========================================================
    // --- 4. REGISTRO DE EVENT LISTENERS ---
    // ==========================================================

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
            switch (macroType) {
                case 'getToken': macroGetToken(); break;
                case 'getFieldIds': macroGetFieldIds(); break;
                case 'deleteField': macroDeleteField(); break;
                default:
                    logEvent({ macro_ejecutada: e.target.textContent.trim() }, { status: "Pendiente", mensaje: `Función no implementada.` });
                    break;
            }
        });
    });

    toggleLogBtn.addEventListener('click', () => {
        const isCollapsed = appContainer.classList.toggle('log-collapsed');
        localStorage.setItem('logCollapsedState', isCollapsed);
    });

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

    createDummyFieldsBtn.addEventListener('click', createDummyFields);
    clearFieldsBtn.addEventListener('click', clearFieldsTable);
    addFieldBtn.addEventListener('click', addNewField);

    fieldsTableBody.addEventListener('click', (e) => {
        const deleteButton = e.target.closest('.delete-row-btn');
        const targetRow = e.target.closest('tr');
        if (deleteButton) {
            const rowToDelete = deleteButton.closest('tr');
            if (rowToDelete === selectedRow) {
                selectedRow = null;
                logSelectedRowData(null);
            }
            rowToDelete.remove();
        } else if (targetRow) {
            if (targetRow !== selectedRow) {
                document.querySelectorAll('#myTable tbody tr').forEach(r => r.classList.remove('selected'));
                targetRow.classList.add('selected');
                selectedRow = targetRow;
            }
            logSelectedRowData(targetRow);
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
    initializeLogState();
    clearFieldsTable();
});