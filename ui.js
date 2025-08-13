document.addEventListener('DOMContentLoaded', function() {
    
    // ==========================================================
    // --- 1. DECLARACIÓN DE ELEMENTOS DEL DOM ---
    // ==========================================================
    
    // Log
    const logRequestEl = document.getElementById('log-request');
    const logResponseEl = document.getElementById('log-response');

    // Navegación
    const mainMenu = document.getElementById('main-menu');
    const sections = document.querySelectorAll('#main-content > .section');
    
    // Configuración General y de Cliente (API)
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
    
    // Campos de la Data Extension (Tabla)
    const fieldsTableBody = document.querySelector('#myTable tbody');
    let selectedRow = null;

    // Gestión de Campos (Recuperar/Borrar/Crear)
    const fieldActionSelect = document.getElementById('fieldActionSelect');
    const recExternalKeyInput = document.getElementById('recExternalKey');
    const deleteFieldNameInput = document.getElementById('deleteFieldName');


    // ==========================================================
    // --- 2. GESTIÓN DE ESTADO Y CONFIGURACIÓN ---
    // ==========================================================

    /**
     * Pinta la información de la llamada y respuesta en el Log.
     */
    function logEvent(requestData, responseData) {
        logRequestEl.textContent = (typeof requestData === 'object') ? JSON.stringify(requestData, null, 2) : requestData;
        logResponseEl.textContent = (typeof responseData === 'object') ? JSON.stringify(responseData, null, 2) : responseData;
    }

    /**
     * Obtiene los valores SÓLO de la sección de configuración de APIs.
     * @returns {object} Un objeto con la configuración de la API.
     */
    const getApiConfigValues = () => {
        const config = {};
        apiConfigSection.querySelectorAll('input:not([type="checkbox"]), select').forEach(input => {
             if (input.id && !['clientName', 'savedConfigs'].includes(input.id)) {
                 config[input.id] = input.value;
             }
        });
        return config;
    };
    
    /**
     * Establece los valores SÓLO en la sección de configuración de APIs.
     * @param {object} config - El objeto de configuración para rellenar el formulario.
     */
    const setApiConfigValues = (config) => {
        // Limpiar solo los campos de la sección de API
        apiConfigSection.querySelectorAll('input:not([type="checkbox"]), select').forEach(el => {
            if(el.id && !['clientName', 'savedConfigs'].includes(el.id)) {
                el.value = '';
            }
        });

        // Rellenar con los nuevos valores
        for (const key in config) {
            const element = document.getElementById(key);
            if (element) {
                element.value = config[key];
            }
        }
    };

    /**
     * Carga la lista de clientes guardados en el menú desplegable.
     */
        const loadConfigsIntoSelect = () => {
        const configs = JSON.parse(localStorage.getItem('mcApiConfigs')) || {};
        const currentValue = savedConfigsSelect.value;

        // Limpiar y preparar ambas listas
        savedConfigsSelect.innerHTML = '<option value="">Seleccionar configuración...</option>';
        sidebarClientSelect.innerHTML = '<option value="">Ninguno seleccionado</option>';

        // Llenar ambas listas con las mismas opciones
        for (const name in configs) {
            const option1 = document.createElement('option');
            option1.value = name;
            option1.textContent = name;
            savedConfigsSelect.appendChild(option1);

            const option2 = document.createElement('option');
            option2.value = name;
            option2.textContent = name;
            sidebarClientSelect.appendChild(option2);
        }

        // Restaurar la selección previa en ambas
        savedConfigsSelect.value = currentValue;
        sidebarClientSelect.value = currentValue;
    };

    /**
     * Guarda el estado del formulario de Configuración de Data Extension en localStorage.
     * Se activa con cada cambio en esa sección.
     */
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

    /**
     * Carga el último estado guardado del formulario de Configuración de Data Extension.
     */
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

        /**
     * Carga la configuración de un cliente, actualiza el formulario y sincroniza AMBAS listas desplegables.
     * @param {string} clientName - El nombre del cliente a cargar.
     */
    function loadAndSyncClientConfig(clientName) {
        const configs = JSON.parse(localStorage.getItem('mcApiConfigs')) || {};
        
        if (configs[clientName]) {
            setApiConfigValues(configs[clientName]);
            clientNameInput.value = clientName;
        } else {
            setApiConfigValues({});
            clientNameInput.value = '';
        }

        // Sincronizar el valor en ambas listas desplegables
        savedConfigsSelect.value = clientName;
        sidebarClientSelect.value = clientName;
    }

    // ==========================================================
    // --- 3. LÓGICA DE LA APLICACIÓN Y UI ---
    // ==========================================================

    /**
     * Muestra una sección específica y oculta las demás.
     * @param {string} sectionId - El ID de la sección a mostrar.
     */
    window.showSection = function(sectionId) {
        mainMenu.style.display = 'none';
        sections.forEach(s => s.style.display = 'none');
        const sectionToShow = document.getElementById(sectionId);
        if (sectionToShow) {
            sectionToShow.style.display = 'flex';
        }
    };

    /**
     * Realiza la llamada a la API para recuperar un token de OAuth y las URIs de instancia.
     * Actualiza el formulario y guarda la configuración de forma silenciosa.
     */
    async function macroGetToken() {
        const config = getApiConfigValues(); // Obtiene solo la config de API

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
                configs[currentClientName] = getApiConfigValues(); // Vuelve a leer para guardar el token, etc.
                localStorage.setItem('mcApiConfigs', JSON.stringify(configs));
                console.log(`Configuración para "${currentClientName}" actualizada con el nuevo token y URIs.`);
            }

            alert("Token recuperado y actualizado en el formulario.");
        } catch (error) {
            console.error("Error al recuperar el token:", error);
            logResponseEl.textContent = `Error: ${error.message}\n\nRevisa la consola (F12) para más detalles.`;
        }
    }

    /**
     * Actualiza la lista de selección del campo SubscriberKey con los datos de la tabla de campos.
     */
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
            const fieldType = row.cells[1].textContent.trim();
            if (fieldName) {
                const option = document.createElement('option');
                option.value = fieldName;
                option.textContent = fieldName;
                option.dataset.type = fieldType; 
                subscriberKeyFieldSelect.appendChild(option);
            }
        });

        subscriberKeyFieldSelect.value = currentSelection; 
    }

    /**
     * Controla la habilitación de los campos de SubscriberKey basado en el checkbox 'isSendable'.
     */
    function handleSendableChange() {
        const isChecked = isSendableCheckbox.checked;
        subscriberKeyFieldSelect.disabled = !isChecked;
        if (!isChecked) {
            subscriberKeyFieldSelect.value = '';
            subscriberKeyTypeInput.value = '';
        }
    }

    /**
     * Gestiona qué campos están habilitados en la sección de gestión de campos.
     */
    function handleFieldActionChange() {
        const action = fieldActionSelect.value;
        recExternalKeyInput.disabled = true;
        deleteFieldNameInput.disabled = true;

        switch (action) {
            case 'recuperar':
            case 'crear':
                recExternalKeyInput.disabled = false;
                break;
            case 'borrar':
                recExternalKeyInput.disabled = false;
                deleteFieldNameInput.disabled = false;
                break;
        }
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

    // ==========================================================
    // --- 4. REGISTRO DE EVENT LISTENERS ---
    // ==========================================================

    // Navegación
    document.querySelectorAll('.back-button').forEach(button => {
        button.addEventListener('click', () => {
            sections.forEach(s => s.style.display = 'none');
            mainMenu.style.display = 'flex';
        });
    });

    // Enrutador de Macros
    document.querySelectorAll('.macro-item').forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            const macroType = e.target.getAttribute('data-macro');

            if (macroType === 'getToken') {
                macroGetToken();
            } else {
                const macroName = e.target.textContent.trim();
                logEvent({ macro_ejecutada: macroName }, { status: "Pendiente", mensaje: `Función para "${macroName}" no implementada.` });
            }
        });
    });

    // Configuración Cliente (API)
        saveConfigBtn.addEventListener('click', () => {
        const clientName = clientNameInput.value.trim();
        if (!clientName) { 
            alert('Por favor, introduce un nombre para el cliente.'); 
            return; 
        }
        let configs = JSON.parse(localStorage.getItem('mcApiConfigs')) || {};
        configs[clientName] = getApiConfigValues();
        localStorage.setItem('mcApiConfigs', JSON.stringify(configs));
        
        alert(`Configuración para "${clientName}" guardada.`);
        
        loadConfigsIntoSelect(); // Actualiza las opciones en ambas listas
        
        // Selecciona el nuevo cliente en ambas listas
        savedConfigsSelect.value = clientName;
        sidebarClientSelect.value = clientName;
    });

        deleteConfigBtn.addEventListener('click', () => {
        const clientName = savedConfigsSelect.value;
        if (!clientName) { 
            alert('Por favor, selecciona una configuración para borrar.'); 
            return; 
        }
        if (confirm(`¿Estás seguro de que quieres borrar la configuración para "${clientName}"?`)) {
            let configs = JSON.parse(localStorage.getItem('mcApiConfigs')) || {};
            delete configs[clientName];
            localStorage.setItem('mcApiConfigs', JSON.stringify(configs));
            
            alert(`Configuración para "${clientName}" borrada.`);
            
            loadAndSyncClientConfig(''); // Limpia formulario y sincroniza listas a "ninguno seleccionado"
            loadConfigsIntoSelect(); // Refresca las opciones en las listas
        }
    });

    // Listener para la lista en la sección de configuración
    savedConfigsSelect.addEventListener('change', (e) => {
        loadAndSyncClientConfig(e.target.value);
    });

    // Listener para la nueva lista en la barra lateral
    sidebarClientSelect.addEventListener('change', (e) => {
        loadAndSyncClientConfig(e.target.value);
    });
    
    authUriInput.addEventListener('blur', () => {
        let currentValue = authUriInput.value.trim();
        if (!currentValue) return;
        let baseValue = currentValue.split('/v2/token').join('').replace(/\/+$/, '');
        authUriInput.value = baseValue + '/v2/token';
    });

    // Configuración de Data Extension (Guardado automático)
    deNameInput.addEventListener('input', () => {
        deExternalKeyInput.value = deNameInput.value.replace(/\s+/g, '_') + '_CK';
    });
    deConfigSection.addEventListener('input', saveDeConfigState);
    deConfigSection.addEventListener('change', saveDeConfigState);

    // Lógica Sendable
    isSendableCheckbox.addEventListener('change', handleSendableChange);
    subscriberKeyFieldSelect.addEventListener('change', () => {
        const selectedOption = subscriberKeyFieldSelect.options[subscriberKeyFieldSelect.selectedIndex];
        subscriberKeyTypeInput.value = (selectedOption && selectedOption.dataset.type) ? selectedOption.dataset.type : '';
    });
    const observer = new MutationObserver(updateSubscriberKeyFieldOptions);
    observer.observe(fieldsTableBody, { childList: true, subtree: true, characterData: true });

    // Gestión de Campos (Recuperar/Borrar/Crear)
    fieldActionSelect.addEventListener('change', handleFieldActionChange);

    // Tabla de Campos
    fieldsTableBody.addEventListener('click', (e) => {
        if (e.target.closest('tr')) {
            const row = e.target.closest('tr');
            document.querySelectorAll('#myTable tbody tr').forEach(r => r.classList.remove('selected'));
            row.classList.add('selected');
            selectedRow = row;
            displaySelectedValues(row);
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


    // ==========================================================
    // --- 5. INICIALIZACIÓN ---
    // ==========================================================

    loadConfigsIntoSelect();              // Cargar lista de clientes de API
    loadDeConfigState();                  // Cargar el último estado del formulario de DE
    updateSubscriberKeyFieldOptions();    // Llenar el select de campos SK por primera vez
    handleSendableChange();               // Ajustar visibilidad inicial de campos SK
    handleFieldActionChange();            // Establecer el estado inicial de la sección de gestión de campos
});