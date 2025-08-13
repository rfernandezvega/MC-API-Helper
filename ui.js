document.addEventListener('DOMContentLoaded', function() {
    
    // --- DECLARACIÓN DE ELEMENTOS DEL DOM ---
    const logRequestEl = document.getElementById('log-request');
    const logResponseEl = document.getElementById('log-response');
    const mainMenu = document.getElementById('main-menu');
    const sections = document.querySelectorAll('#main-content > .section');
    const deNameInput = document.getElementById('deName');
    const deExternalKeyInput = document.getElementById('deExternalKey');
    const authUriInput = document.getElementById('authUri');
    const soapUriInput = document.getElementById('soapUri');
    const clientNameInput = document.getElementById('clientName');
    const saveConfigBtn = document.getElementById('saveConfig');
    const deleteConfigBtn = document.getElementById('deleteConfig');
    const savedConfigsSelect = document.getElementById('savedConfigs');
    const selectedClientDisplay = document.getElementById('selected-client-display');
    const tokenField = document.getElementById('token');

    // --- FUNCIÓN PARA PINTAR EN EL LOG ---
    function logEvent(requestData, responseData) {
        logRequestEl.textContent = (typeof requestData === 'object') ? JSON.stringify(requestData, null, 2) : requestData;
        logResponseEl.textContent = (typeof responseData === 'object') ? JSON.stringify(responseData, null, 2) : responseData;
    }

    // --- LÓGICA DE NAVEGACIÓN (CORREGIDA) ---
    // Se define la función en el objeto window para que sea accesible desde el HTML (onclick).
    window.showSection = function(sectionId) {
        mainMenu.style.display = 'none';
        sections.forEach(s => s.style.display = 'none');
        const sectionToShow = document.getElementById(sectionId);
        if (sectionToShow) {
            sectionToShow.style.display = 'flex';
        }
    };

    document.querySelectorAll('.back-button').forEach(button => {
        button.addEventListener('click', () => {
            sections.forEach(s => s.style.display = 'none');
            mainMenu.style.display = 'flex';
        });
    });

    // ==========================================================
    // --- API / MACRO FUNCTIONS ---
    // ==========================================================
    
    /**
     * Realiza la llamada a la API para recuperar un token de OAuth de Marketing Cloud.
     */
    async function macroGetToken() {
        const config = getFormValues();

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
        const requestDetails = {
            endpoint: config.authUri,
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: payload
        };

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
            
            tokenField.value = responseData.access_token;
            alert("Token recuperado y actualizado en el formulario.");

            const currentClientName = clientNameInput.value.trim();
            if (currentClientName) {
                let configs = JSON.parse(localStorage.getItem('mcApiConfigs')) || {};
                configs[currentClientName] = getFormValues();
                localStorage.setItem('mcApiConfigs', JSON.stringify(configs));
                console.log(`Configuración para "${currentClientName}" actualizada con el nuevo token.`);
            }

        } catch (error) {
            console.error("Error al recuperar el token:", error);
            logResponseEl.textContent = `Error: ${error.message}\n\nRevisa la consola (F12) para más detalles.`;
        }
    }
    
    // --- ENRUTADOR DE MACROS ---
    document.querySelectorAll('.macro-item').forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            const macroType = e.target.getAttribute('data-macro');

            switch (macroType) {
                case 'getToken':
                    macroGetToken();
                    break;
                
                default:
                    const macroName = e.target.textContent.trim();
                    const requestInfo = {
                        macro_ejecutada: macroName,
                        timestamp: new Date().toISOString(),
                        configuracion_actual: getFormValues()
                    };
                    const responseInfo = {
                        status: "Pendiente",
                        mensaje: `La función para "${macroName}" aún no ha sido implementada.`
                    };
                    logEvent(requestInfo, responseInfo);
                    break;
            }
        });
    });


    // --- LÓGICA DE CONFIGURACIÓN ---
    deNameInput.addEventListener('input', () => {
        deExternalKeyInput.value = deNameInput.value.replace(/\s+/g, '_') + '_CK';
    });
    
    const formatUriOnBlur = (inputElement, suffix) => {
        let currentValue = inputElement.value.trim();
        if (!currentValue) return;
        let baseValue = currentValue.split(suffix).join('').replace(/\/+$/, '');
        inputElement.value = baseValue + suffix;
    };
    authUriInput.addEventListener('blur', () => formatUriOnBlur(authUriInput, '/v2/token'));
    soapUriInput.addEventListener('blur', () => formatUriOnBlur(soapUriInput, '/Service.asmx'));

    const getFormValues = () => {
        const config = {};
        document.querySelectorAll('#configuracion-section input:not([type="checkbox"]), #configuracion-section select').forEach(input => {
             if (input.id && !['clientName', 'savedConfigs'].includes(input.id)) {
                 config[input.id] = input.value;
             }
        });
        document.querySelectorAll('#configuracion-section input[type="checkbox"]').forEach(input => {
             if (input.id) {
                config[input.id] = input.checked;
             }
        });
        return config;
    };
    
    const setFormValues = (config) => {
        document.querySelectorAll('#configuracion-section input:not([type="checkbox"]), #configuracion-section select').forEach(el => {
            if(el.id && !['clientName', 'savedConfigs'].includes(el.id)) {
                el.value = '';
            }
        });
        document.querySelectorAll('#configuracion-section input[type="checkbox"]').forEach(el => {
            el.checked = false;
        });
        for (const key in config) {
            const element = document.getElementById(key);
            if (element) {
                if (element.type === 'checkbox') {
                    element.checked = config[key];
                } else {
                    element.value = config[key];
                }
            }
        }
    };
    
    const loadConfigsIntoSelect = () => {
        const currentValue = savedConfigsSelect.value;
        savedConfigsSelect.innerHTML = '<option value="">Seleccionar configuración...</option>';
        const configs = JSON.parse(localStorage.getItem('mcApiConfigs')) || {};
        for (const name in configs) {
            const option = document.createElement('option');
            option.value = name;
            option.textContent = name;
            savedConfigsSelect.appendChild(option);
        }
        savedConfigsSelect.value = currentValue;
    };
    
    saveConfigBtn.addEventListener('click', () => {
        const clientName = clientNameInput.value.trim();
        if (!clientName) { 
            alert('Por favor, introduce un nombre para el cliente.'); 
            return; 
        }
        let configs = JSON.parse(localStorage.getItem('mcApiConfigs')) || {};
        configs[clientName] = getFormValues();
        localStorage.setItem('mcApiConfigs', JSON.stringify(configs));
        
        alert(`Configuración para "${clientName}" guardada.`);
        selectedClientDisplay.textContent = clientName;
        loadConfigsIntoSelect();
        savedConfigsSelect.value = clientName;
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
            selectedClientDisplay.textContent = 'Ninguno seleccionado';
            setFormValues({}); 
            clientNameInput.value = '';
            loadConfigsIntoSelect();
        }
    });

    savedConfigsSelect.addEventListener('change', () => {
        const clientName = savedConfigsSelect.value;
        const configs = JSON.parse(localStorage.getItem('mcApiConfigs')) || {};
        if (configs[clientName]) {
            setFormValues(configs[clientName]);
            clientNameInput.value = clientName;
            selectedClientDisplay.textContent = clientName;
        } else {
            setFormValues({}); 
            clientNameInput.value = '';
            selectedClientDisplay.textContent = 'Ninguno seleccionado';
        }
    });

    loadConfigsIntoSelect();

    // --- LÓGICA DE LA TABLA DE CAMPOS ---
    let selectedRow = null;
    const tableRows = document.querySelectorAll('#myTable tbody tr');
    function deselectAllRows() { tableRows.forEach(row => row.classList.remove('selected')); }
    tableRows.forEach(row => {
      row.addEventListener('click', () => {
        deselectAllRows();
        row.classList.add('selected');
        selectedRow = row;
        displaySelectedValues(row);
      });
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
});