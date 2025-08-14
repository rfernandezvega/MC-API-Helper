// Fichero: ui.js
// Descripción: Gestiona toda la lógica de la interfaz de usuario, interacciones del usuario,
// llamadas a la API de Marketing Cloud y manipulación del DOM.

document.addEventListener('DOMContentLoaded', function() {
    
    // ==========================================================
    // --- 1. DECLARACIÓN DE ELEMENTOS DEL DOM ---
    // Agrupar todas las referencias a elementos del DOM aquí para fácil acceso y mantenimiento.
    // ==========================================================
    
    // --- Elementos Generales ---
    const appContainer = document.querySelector('.app-container');
    const mainMenu = document.getElementById('main-menu');
    const allSections = document.querySelectorAll('#main-content > .section');
    const toggleLogBtn = document.getElementById('toggleLogBtn');

    // --- Elementos de Log ---
    const logMessagesEl = document.getElementById('log-messages');
    const logRequestEl = document.getElementById('log-request');
    const logResponseEl = document.getElementById('log-response');

    // --- Elementos de Configuración de Cliente y API ---
    const clientNameInput = document.getElementById('clientName');
    const saveConfigBtn = document.getElementById('saveConfig');
    const deleteConfigBtn = document.getElementById('deleteConfig');
    const savedConfigsSelect = document.getElementById('savedConfigs');
    const sidebarClientSelect = document.getElementById('sidebarClientSelect');
    const apiConfigSection = document.getElementById('configuracion-apis-section');
    const authUriInput = document.getElementById('authUri');
    const clientIdInput = document.getElementById('clientId');
    const clientSecretInput = document.getElementById('clientSecret');
    const tokenField = document.getElementById('token');
    const soapUriInput = document.getElementById('soapUri');
    const restUriInput = document.getElementById('restUri'); 
    const businessUnitInput = document.getElementById('businessUnit');
    const getTokenBtn = document.getElementById('getTokenBtn');

    // --- Elementos de Configuración de Data Extension ---
    const deConfigSection = document.getElementById('configuracion-de-section');
    const deNameInput = document.getElementById('deName');
    const deDescriptionInput = document.getElementById('deDescription');
    const deExternalKeyInput = document.getElementById('deExternalKey');
    const deFolderInput = document.getElementById('deFolder');
    const isSendableCheckbox = document.getElementById('isSendable');
    const subscriberKeyFieldSelect = document.getElementById('subscriberKeyField');
    const subscriberKeyTypeInput = document.getElementById('subscriberKeyType');
    const createDEBtn = document.getElementById('createDE');
    
    // --- Elementos de la Sección de Campos de DE ---
    const fieldsTableBody = document.querySelector('#myTable tbody');
    const addFieldBtn = document.getElementById('addFieldBtn');
    const createDummyFieldsBtn = document.getElementById('createDummyFieldsBtn');
    const createFieldsBtn = document.getElementById('createFieldsBtn');
    const clearFieldsBtn = document.getElementById('clearFieldsBtn');
    const moveUpBtn = document.getElementById('moveUp');
    const moveDownBtn = document.getElementById('moveDown');
    let selectedRow = null; // Mantiene la referencia a la fila seleccionada en la tabla

    // --- Elementos de la Sección de Gestión de Campos ---
    const recExternalKeyInput = document.getElementById('recExternalKey');
    const targetFieldSelect = document.getElementById('targetFieldSelect');
    const getFieldsBtn = document.getElementById('getFields');
    const deleteFieldBtn = document.getElementById('deleteField');

    // --- Elementos del Modal de Importación ---
    const importFieldsBtn = document.getElementById('importFieldsBtn');
    const importModal = document.getElementById('import-modal');
    const pasteDataArea = document.getElementById('paste-data-area');
    const processPasteBtn = document.getElementById('process-paste-btn');
    const cancelPasteBtn = document.getElementById('cancel-paste-btn');
    const delimiterSelect = document.getElementById('delimiter-select');
    const customDelimiterInput = document.getElementById('custom-delimiter-input');
    
    // --- Elementos de Búsqueda de Data Extension ---
    const searchDEBtn = document.getElementById('searchDEBtn');
    const deSearchProperty = document.getElementById('deSearchProperty');
    const deSearchValue = document.getElementById('deSearchValue');
    const deSearchResults = document.getElementById('de-search-results');

    // --- Elementos del Validador de Email ---
    const validateEmailBtn = document.getElementById('validateEmailBtn');
    const emailToValidateInput = document.getElementById('emailToValidate');
    const emailValidationResults = document.getElementById('email-validation-results');

    // --- Elementos del Buscador de Orígenes de Datos ---
    const findDataSourcesBtn = document.getElementById('findDataSourcesBtn');
    const deNameToFindInput = document.getElementById('deNameToFind');
    const dataSourcesTbody = document.getElementById('data-sources-tbody');

    // --- Elementos de Documentación y Menú Colapsable ---
    const tabButtons = document.querySelectorAll('.tab-button');
    const tabContents = document.querySelectorAll('.tab-content');
    const collapsibleHeaders = document.querySelectorAll('.collapsible-header');

    // --- Elementos del Calendario ---
    const calendarGrid = document.getElementById('calendar-grid');
    const calendarYearSelect = document.getElementById('calendarYearSelect');
    const automationList = document.getElementById('automation-list');
    const refreshAutomationsBtn = document.getElementById('refreshAutomationsBtn');
    let allAutomations = []; // Almacena las automatizaciones recuperadas de la API
    let calendarDataForClient = ''; // Identifica para qué cliente son los datos del calendario


    // ==========================================================
    // --- 2. GESTIÓN DE LOGS Y ESTADO DE LA UI ---
    // Funciones para registrar eventos y controlar el estado visual de la aplicación.
    // ==========================================================

    /**
     * Muestra un mensaje en el panel de log.
     * @param {string} message - El mensaje a mostrar.
     */
    function logMessage(message) {
        if (logMessagesEl) logMessagesEl.textContent = message;
    }

    /**
     * Muestra los detalles de una llamada a la API en el panel de log.
     * @param {object|string} requestData - El objeto de la petición (payload, headers, etc.).
     */
    function logApiCall(requestData) {
        if (logRequestEl) logRequestEl.textContent = (typeof requestData === 'object') ? JSON.stringify(requestData, null, 2) : requestData;
    }

    /**
     * Muestra la respuesta de una llamada a la API en el panel de log.
     * @param {object|string} responseData - La respuesta recibida de la API.
     */
    function logApiResponse(responseData) {
        if (logResponseEl) logResponseEl.textContent = (typeof responseData === 'object') ? JSON.stringify(responseData, null, 2) : responseData;
    }
    
    /**
     * Bloquea la interfaz de usuario para prevenir interacciones durante una operación.
     * Añade una clase al contenedor principal y cambia el cursor.
     */
    function blockUI() {
        if (document.activeElement) document.activeElement.blur(); // Quita el foco de cualquier elemento
        appContainer.classList.add('is-updating');
        document.body.style.cursor = 'wait';
    }

    /**
     * Desbloquea la interfaz de usuario una vez que la operación ha finalizado.
     */
    function unblockUI() {
        appContainer.classList.remove('is-updating');
        document.body.style.cursor = 'default';
    }

    /**
     * Muestra una sección específica del contenido principal y oculta las demás.
     * @param {string} sectionId - El ID de la sección a mostrar.
     */
    window.showSection = function(sectionId) {
        mainMenu.style.display = 'none';
        allSections.forEach(s => s.style.display = 'none');
        const sectionToShow = document.getElementById(sectionId);
        if (sectionToShow) sectionToShow.style.display = 'flex';
    };


    // ==========================================================
    // --- 3. GESTIÓN DE CONFIGURACIÓN (LOCALSTORAGE) ---
    // Funciones para guardar, cargar y gestionar las configuraciones de los clientes.
    // ==========================================================

    /**
     * Recoge todos los valores de los campos de configuración del cliente en un solo objeto.
     * @returns {object} - Un objeto con la configuración completa del cliente.
     */
    const getFullClientConfig = () => {
        const config = {};
        // Recoge configuración de la sección de APIs
        apiConfigSection.querySelectorAll('input:not([type="checkbox"]), select').forEach(input => {
             if (input.id && !['clientName', 'savedConfigs'].includes(input.id)) config[input.id] = input.value;
        });
        // Recoge configuración de la sección de DE
        deConfigSection.querySelectorAll('input:not([type="checkbox"]), select').forEach(el => config[el.id] = el.value);
        deConfigSection.querySelectorAll('input[type="checkbox"]').forEach(el => config[el.id] = el.checked);
        // Recoge configuración de la sección de gestión de campos
        if (recExternalKeyInput) config[recExternalKeyInput.id] = recExternalKeyInput.value;
        return config;
    };
    
    /**
     * Rellena los campos del formulario con los datos de una configuración dada.
     * @param {object} config - El objeto de configuración a cargar.
     */
    const setFullClientConfig = (config) => {
        // Primero, resetea todos los campos a su estado por defecto
        const allElements = document.querySelectorAll(
            '#configuracion-apis-section input:not([type="checkbox"]):not(#clientName):not(#savedConfigs), ' +
            '#configuracion-apis-section select:not(#savedConfigs), ' +
            '#configuracion-de-section input, ' +
            '#configuracion-de-section select, ' +
            '#configuracion-campos-section input'
        );
        allElements.forEach(el => {
            if (el.type === 'checkbox') el.checked = false;
            else if (el.tagName === 'SELECT') el.value = '';
            else if (!['clientName', 'savedConfigs'].includes(el.id)) el.value = '';
        });

        // Luego, rellena los campos con la configuración proporcionada
        for (const key in config) {
            const element = document.getElementById(key);
            if (element) {
                if (element.type === 'checkbox') element.checked = config[key];
                else element.value = config[key];
            }
        }
        handleSendableChange(); // Asegura que el estado del campo SubscriberKey es correcto
    };

    /**
     * Carga todas las configuraciones guardadas en localStorage y las muestra en los <select>.
     */
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

    /**
     * Carga la configuración de un cliente específico, la aplica a los formularios y sincroniza los <select>.
     * @param {string} clientName - El nombre del cliente a cargar.
     */
    function loadAndSyncClientConfig(clientName) {
        const configs = JSON.parse(localStorage.getItem('mcApiConfigs')) || {};
        const configToLoad = configs[clientName] || {};
        setFullClientConfig(configToLoad);
        
        // Sincroniza todos los campos y selectores relevantes
        clientNameInput.value = clientName;
        savedConfigsSelect.value = clientName;
        sidebarClientSelect.value = clientName;

        localStorage.setItem('lastSelectedClient', clientName); // Guarda el último cliente seleccionado
    }
    
    
    // ==========================================================
    // --- 4. LÓGICA DE API (MACROS) ---
    // Funciones principales que interactúan con la API de Marketing Cloud.
    // ==========================================================

    // --- 4.1. Autenticación ---
    
    /**
     * Obtiene un token de acceso de la API de Marketing Cloud.
     * @param {boolean} [silent=false] - Si es true, no muestra logs ni alertas al usuario. Útil para llamadas internas.
     * @returns {Promise<void>} - Se resuelve si tiene éxito, se rechaza si hay un error.
     */
    async function macroGetToken(silent = false) {
        const config = getFullClientConfig(); 
        if (!config.authUri || !config.clientId || !config.clientSecret || !config.businessUnit) {
            const errorMsg = "Por favor, complete los campos Auth URI, Client ID, Client Secret y Business Unit (MID) en la configuración.";
            if (!silent) {
                 alert(errorMsg);
                 logMessage("Error: Faltan datos de configuración. Operación cancelada.");
            }
            return Promise.reject(new Error(errorMsg));
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
        
        if (!silent) {
            logMessage("Recuperando token...");
            logApiCall(requestDetails);
            logApiResponse('');
        }
        
        try {
            const response = await fetch(config.authUri, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
            const responseData = await response.json();
            
            if (!response.ok) {
                throw new Error(`Error de la API: ${response.status} - ${responseData.error_description || 'Error desconocido'}`);
            }
            
            // Rellena los campos del formulario con los datos obtenidos
            tokenField.value = responseData.access_token || '';
            soapUriInput.value = responseData.soap_instance_url ? responseData.soap_instance_url + 'Service.asmx' : '';
            restUriInput.value = responseData.rest_instance_url || '';

            if (!silent) {
                logMessage("Token recuperado con éxito.");
                logApiResponse(responseData);
                alert("Token recuperado y actualizado en el formulario.");
            }
        } catch (error) {
            if (!silent) {
                logMessage(`Error al recuperar el token: ${error.message}`);
                logApiResponse({ message: error.message, stack: error.stack });
            }
            console.error("Error al recuperar el token:", error);
            return Promise.reject(error); // Propaga el error para que otras funciones puedan manejarlo
        }
    }
    
    // --- 4.2. Data Extension y Gestión de Campos ---
    
    /**
     * Construye la porción XML para un único campo de Data Extension.
     * @param {object} fieldData - Datos del campo (name, type, length, etc.).
     * @returns {string} - La cadena XML para el campo.
     */
    function buildFieldXml(fieldData) {
        const { name, type, length, defaultValue, isPrimaryKey, isRequired } = fieldData;
        const customerKey = name; // Usamos el nombre como CustomerKey del campo por simplicidad
        let fieldXml = '';

        const commonNodes = `<CustomerKey>${customerKey}</CustomerKey><Name>${name}</Name><IsRequired>${isRequired}</IsRequired><IsPrimaryKey>${isPrimaryKey}</IsPrimaryKey>`;
        const defaultValueNode = defaultValue ? `<DefaultValue>${defaultValue}</DefaultValue>` : '';
        
        // Construye el XML basado en el tipo de campo
        switch (type.toLowerCase()) {
            case 'text': fieldXml = `<Field>${commonNodes}<FieldType>Text</FieldType>${length ? `<MaxLength>${length}</MaxLength>` : ''}${defaultValueNode}</Field>`; break;
            case 'number': fieldXml = `<Field>${commonNodes}<FieldType>Number</FieldType>${defaultValueNode}</Field>`; break;
            case 'date': fieldXml = `<Field>${commonNodes}<FieldType>Date</FieldType>${defaultValueNode}</Field>`; break;
            case 'boolean': fieldXml = `<Field>${commonNodes}<FieldType>Boolean</FieldType>${defaultValueNode}</Field>`; break;
            case 'emailaddress': fieldXml = `<Field>${commonNodes}<FieldType>EmailAddress</FieldType></Field>`; break;
            case 'phone': fieldXml = `<Field>${commonNodes}<FieldType>Phone</FieldType></Field>`; break;
            case 'locale': fieldXml = `<Field>${commonNodes}<FieldType>Locale</FieldType></Field>`; break;
            case 'decimal':
                const [maxLength, scale] = (length || ',').split(',').map(s => s.trim());
                fieldXml = `<Field>${commonNodes}<FieldType>Decimal</FieldType>${maxLength ? `<MaxLength>${maxLength}</MaxLength>` : ''}${scale ? `<Scale>${scale}</Scale>` : ''}${defaultValueNode}</Field>`;
                break;
            default: return ''; // Si el tipo no es válido, no genera nada
        }
        return fieldXml.replace(/\s+/g, ' ').trim(); // Limpia espacios extra
    }
    
    /**
     * Crea una Data Extension usando la API SOAP.
     */
    async function macroCreateDE() {
        blockUI();
        try {
            logMessage("Iniciando creación de Data Extension...");
            const deName = deNameInput.value.trim();
            const deExternalKey = deExternalKeyInput.value.trim();
            if (!deName || !deExternalKey) {
                alert('El Nombre y la External Key de la Data Extension son obligatorios.');
                return logMessage("Operación cancelada: Faltan datos de la DE.");
            }

            // Validaciones para DEs enviables
            const isSendable = isSendableCheckbox.checked;
            const subscriberKey = subscriberKeyFieldSelect.value;
            if (isSendable && !subscriberKey) {
                alert('Para una Data Extension enviable, es obligatorio seleccionar un Campo SubscriberKey.');
                return logMessage("Operación cancelada: Falta Subscriber Key.");
            }
            
            // Recopila los datos de los campos de la tabla
            const validFieldsData = getFieldsDataFromTable();
            if (validFieldsData.length === 0) {
                alert('La Data Extension debe tener al menos un campo definido.');
                return logMessage("Operación cancelada: No hay campos definidos.");
            }

            await macroGetToken(true); // Obtiene token silenciosamente
            const token = tokenField.value;
            const soapUri = soapUriInput.value;
            if (!token || !soapUri) throw new Error('No se pudo obtener un token o la SOAP URI no está configurada.');

            // Construye las diferentes partes del payload SOAP
            const clientXml = businessUnitInput.value.trim() ? `<Client><ClientID>${businessUnitInput.value.trim()}</ClientID></Client>` : '';
            const descriptionXml = deDescriptionInput.value.trim() ? `<Description>${deDescriptionInput.value.trim()}</Description>` : '';
            const folderXml = deFolderInput.value.trim() ? `<CategoryID>${deFolderInput.value.trim()}</CategoryID>` : '';
            let sendableXml = '';
            if (isSendable) {
                sendableXml = `<SendableDataExtensionField><CustomerKey>${subscriberKey}</CustomerKey><Name>${subscriberKey}</Name><FieldType>${subscriberKeyTypeInput.value.trim()}</FieldType></SendableDataExtensionField><SendableSubscriberField><Name>Subscriber Key</Name><Value/></SendableSubscriberField>`;
            }
            const fieldsXmlString = validFieldsData.map(buildFieldXml).join('');
            
            // Construye el payload SOAP final
            const soapPayload = `<s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope" xmlns:a="http://schemas.xmlsoap.org/ws/2004/08/addressing"><s:Header><a:Action s:mustUnderstand="1">Create</a:Action><a:To s:mustUnderstand="1">${soapUri}</a:To><fueloauth xmlns="http://exacttarget.com">${token}</fueloauth></s:Header><s:Body xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema"><CreateRequest xmlns="http://exacttarget.com/wsdl/partnerAPI"><Objects xsi:type="DataExtension">${clientXml}<CustomerKey>${deExternalKey}</CustomerKey>${descriptionXml}<Name>${deName}</Name>${folderXml}<IsSendable>${isSendable}</IsSendable>${sendableXml}<Fields>${fieldsXmlString}</Fields></Objects></CreateRequest></s:Body></s:Envelope>`;
            
            await executeSoapRequest(soapUri, soapPayload.trim(), `¡Data Extension "${deName}" creada con éxito!`);

        } catch (error) {
            console.error("Error en macroCreateDE:", error);
            logMessage(`Error al crear la Data Extension: ${error.message}`);
            alert(`Error al crear la Data Extension: ${error.message}`);
        } finally {
            unblockUI();
        }
    }
    
    /**
     * Crea o actualiza campos en una Data Extension existente.
     */
    async function macroCreateFields() {
        blockUI();
        try {
            const externalKey = recExternalKeyInput.value.trim();
            if (!externalKey) {
                alert('Por favor, define una "External Key de la DE" en la sección de "Gestión de Campos".');
                return logMessage("Operación cancelada: Falta External Key de la DE.");
            }

            const validFieldsData = getFieldsDataFromTable();
            if (validFieldsData.length === 0) {
                alert('No se encontraron campos válidos en la tabla.');
                return logMessage("Operación cancelada: No hay campos válidos en la tabla.");
            }

            logMessage(`Iniciando creación/actualización de ${validFieldsData.length} campos...`);
            await macroGetToken(true);
            const token = tokenField.value;
            const soapUri = soapUriInput.value;
            if (!token || !soapUri) throw new Error('No se pudo obtener un token o la SOAP URI no está configurada.');

            const fieldsXmlString = validFieldsData.map(buildFieldXml).join('');
            const soapPayload = `<s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope" xmlns:a="http://schemas.xmlsoap.org/ws/2004/08/addressing"><s:Header><a:Action s:mustUnderstand="1">Update</a:Action><a:To s:mustUnderstand="1">${soapUri}</a:To><fueloauth xmlns="http://exacttarget.com">${token}</fueloauth></s:Header><s:Body xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema"><UpdateRequest xmlns="http://exacttarget.com/wsdl/partnerAPI"><Objects xsi:type="DataExtension"><CustomerKey>${externalKey}</CustomerKey><Fields>${fieldsXmlString}</Fields></Objects></UpdateRequest></s:Body></s:Envelope>`;
            
            await executeSoapRequest(soapUri, soapPayload.trim(), `¡Éxito! Se han creado/actualizado ${validFieldsData.length} campos.`);

        } catch (error) {
            console.error("Error en macroCreateFields:", error);
            logMessage(`Error al crear los campos: ${error.message}`);
            alert(`Error al crear los campos: ${error.message}`);
        } finally {
            unblockUI();
        }
    }
    
    /**
     * Recupera todos los campos de una Data Extension y los muestra en la tabla.
     */
    async function macroGetFields() {
        blockUI();
        try {
            const externalKey = recExternalKeyInput.value.trim();
            if (!externalKey) {
                alert('Por favor, introduce un valor en el campo "External Key de la DE".');
                return logMessage("Operación cancelada: Falta External Key de la DE.");
            }

            logMessage(`Recuperando todos los campos para la DE: ${externalKey}`);
            await macroGetToken(true);
            const token = tokenField.value;
            const soapUri = soapUriInput.value;
            if (!token || !soapUri) throw new Error('No se pudo obtener un token o la SOAP URI no está configurada.');

            const soapPayload = `<s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope" xmlns:a="http://schemas.xmlsoap.org/ws/2004/08/addressing"><s:Header><a:Action s:mustUnderstand="1">Retrieve</a:Action><a:To s:mustUnderstand="1">${soapUri}</a:To><fueloauth xmlns="http://exacttarget.com">${token}</fueloauth></s:Header><s:Body xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema"><RetrieveRequestMsg xmlns="http://exacttarget.com/wsdl/partnerAPI"><RetrieveRequest><ObjectType>DataExtensionField</ObjectType><Properties>Name</Properties><Properties>ObjectID</Properties><Properties>CustomerKey</Properties><Properties>FieldType</Properties><Properties>IsPrimaryKey</Properties><Properties>IsRequired</Properties><Properties>MaxLength</Properties><Properties>Ordinal</Properties><Properties>Scale</Properties><Properties>DefaultValue</Properties><Filter xsi:type="SimpleFilterPart"><Property>DataExtension.CustomerKey</Property><SimpleOperator>equals</SimpleOperator><Value>${externalKey}</Value></Filter></RetrieveRequest></RetrieveRequestMsg></s:Body></s:Envelope>`;
            const requestDetails = { endpoint: soapUri, method: "POST", headers: { 'Content-Type': 'text/xml' }, payload: soapPayload.trim() };
            logApiCall(requestDetails);
            logApiResponse('');

            const response = await fetch(soapUri, { method: 'POST', headers: { 'Content-Type': 'text/xml' }, body: requestDetails.payload });
            const responseText = await response.text();
            logApiResponse({ status: response.status, statusText: response.statusText, body: responseText });
            
            const fields = await parseFullSoapFieldsAsync(responseText);
            if (fields.length > 0) {
                populateFieldsTable(fields);
                populateDeletionPicklist(fields);
                logMessage(`${fields.length} campos recuperados y cargados.`);
            } else {
                clearFieldsTable();
                populateDeletionPicklist([]);
                logMessage('La llamada fue exitosa pero no se encontraron campos.');
            }
        } catch (error) {
            console.error("Error en macroGetFields:", error);
            alert(`Error al recuperar los campos: ${error.message}`);
            logMessage(`Error al recuperar los campos: ${error.message}`);
        } finally {
            unblockUI();
        }
    }
    
    /**
     * Elimina un campo específico de una Data Extension.
     */
    async function macroDeleteField() {
        blockUI();
        try {
            const externalKey = recExternalKeyInput.value.trim();
            const fieldObjectId = targetFieldSelect.value;
            const selectedFieldName = targetFieldSelect.selectedOptions[0]?.text;

            if (!externalKey || !fieldObjectId) {
                alert('Por favor, introduce la External Key y selecciona un campo a eliminar.');
                return logMessage("Operación cancelada: Faltan datos.");
            }
            
            if (!confirm(`¿Estás seguro de que quieres eliminar el campo "${selectedFieldName}"? Esta acción no se puede deshacer.`)) {
                return logMessage("Borrado cancelado por el usuario.");
            }

            logMessage(`Iniciando borrado del campo "${selectedFieldName}"...`);
            await macroGetToken(true);
            const token = tokenField.value;
            const soapUri = soapUriInput.value;
            if (!token || !soapUri) throw new Error('No se pudo obtener un token o la SOAP URI no está configurada.');

            const soapPayload = `<s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope" xmlns:a="http://schemas.xmlsoap.org/ws/2004/08/addressing"><s:Header><fueloauth xmlns="http://exacttarget.com">${token}</fueloauth><a:Action s:mustUnderstand="1">Delete</a:Action><a:To s:mustUnderstand="1">${soapUri}</a:To></s:Header><s:Body xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><DeleteRequest xmlns="http://exacttarget.com/wsdl/partnerAPI"><Objects xsi:type="DataExtension"><CustomerKey>${externalKey}</CustomerKey><Fields><Field><ObjectID>${fieldObjectId}</ObjectID></Field></Fields></Objects></DeleteRequest></s:Body></s:Envelope>`;
            
            await executeSoapRequest(soapUri, soapPayload.trim(), `Campo "${selectedFieldName}" eliminado con éxito.`);
            macroGetFields(); // Refresca la lista de campos después de borrar

        } catch (error) {
            console.error("Error en macroDeleteField:", error);
            logMessage(`Error al eliminar el campo: ${error.message}`);
        } finally {
            unblockUI();
        }
    }
    
    // --- 4.3. Búsqueda y Validación ---
    
    /**
     * Busca una Data Extension por nombre o clave externa y muestra su ruta completa.
     */
    async function macroSearchDE() {
        blockUI();
        deSearchResults.textContent = 'Buscando...';
        try {
            const property = deSearchProperty.value;
            const value = deSearchValue.value.trim();
            if (!value) throw new Error("El campo 'Valor' no puede estar vacío.");

            logMessage(`Iniciando búsqueda de DE por ${property}: ${value}`);
            await macroGetToken(true);
            const config = { ...getFullClientConfig(), token: tokenField.value, soapUri: soapUriInput.value };
            if (!config.soapUri || !config.token) throw new Error("No se pudo obtener un token o la SOAP URI. Revisa la configuración.");

            const soapPayload = `<s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope" xmlns:a="http://schemas.xmlsoap.org/ws/2004/08/addressing"><s:Header><a:Action s:mustUnderstand="1">Retrieve</a:Action><a:To s:mustUnderstand="1">${config.soapUri}</a:To><fueloauth xmlns="http://exacttarget.com">${config.token}</fueloauth></s:Header><s:Body xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema"><RetrieveRequestMsg xmlns="http://exacttarget.com/wsdl/partnerAPI"><RetrieveRequest><ObjectType>DataExtension</ObjectType><Properties>Name</Properties><Properties>CategoryID</Properties><Filter xsi:type="SimpleFilterPart"><Property>${property}</Property><SimpleOperator>equals</SimpleOperator><Value>${value}</Value></Filter></RetrieveRequest></RetrieveRequestMsg></s:Body></s:Envelope>`;
            const requestDetails = { step: 'SearchDE', endpoint: config.soapUri, payload: soapPayload };
            logApiCall(requestDetails);
            
            const response = await fetch(config.soapUri, { method: 'POST', headers: { 'Content-Type': 'text/xml' }, body: soapPayload });
            const responseText = await response.text();
            logApiResponse({ body: responseText });

            const deInfo = await parseDESearchResponse(responseText);
            if (deInfo.error) throw new Error(deInfo.error);
            
            // Si no tiene ID de categoría, está en la raíz
            if (!deInfo.categoryId || parseInt(deInfo.categoryId) === 0) {
                 const finalPath = `Data Extensions > ${deInfo.deName}`;
                 deSearchResults.textContent = finalPath;
                 logMessage('Búsqueda finalizada. La DE se encuentra en la carpeta raíz.');
                 return;
            }

            logMessage(`DE encontrada. ID de Carpeta: ${deInfo.categoryId}. Recuperando ruta completa...`);
            const folderPath = await getFolderPath(deInfo.categoryId, config);

            const finalPath = `${folderPath} > ${deInfo.deName}`;
            deSearchResults.textContent = finalPath;
            logMessage('Ruta completa de la DE encontrada con éxito.');

        } catch (error) {
            console.error("Error en macroSearchDE:", error);
            logMessage(`Error al buscar la DE: ${error.message}`);
            deSearchResults.textContent = `Error: ${error.message}`;
        } finally {
            unblockUI();
        }
    }
    
    /**
     * Valida una dirección de correo electrónico utilizando el endpoint de la API REST.
     */
    async function macroValidateEmail() {
        blockUI();
        emailValidationResults.textContent = 'Validando...';
        try {
            const emailToValidate = emailToValidateInput.value.trim();
            if (!emailToValidate) throw new Error("Por favor, introduce una dirección de email para validar.");

            logMessage(`Iniciando validación para el email: ${emailToValidate}`);
            await macroGetToken(true);
            const config = getFullClientConfig();
            const token = tokenField.value;
            const restUri = config.restUri;

            if (!restUri || !token) throw new Error("La REST URI o el Token no están disponibles. Revisa la configuración.");

            const validateUrl = `${restUri}address/v1/validateEmail`;
            const payload = {
                "email": emailToValidate,
                "validators": ["SyntaxValidator", "MXValidator", "ListDetectiveValidator"]
            };
            const requestDetails = {
                endpoint: validateUrl,
                method: "POST",
                headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
                body: payload
            };
            logApiCall(requestDetails);

            const response = await fetch(validateUrl, { method: 'POST', headers: requestDetails.headers, body: JSON.stringify(payload) });
            const responseData = await response.json();
            logApiResponse({ status: response.status, statusText: response.statusText, body: responseData });

            if (!response.ok) throw new Error(responseData.message || `Error de la API: ${response.status}`);

            if (responseData.valid) {
                emailValidationResults.textContent = `El email "${responseData.email}" es VÁLIDO.`;
                logMessage("Validación de email completada: Válido.");
            } else {
                emailValidationResults.textContent = `El email "${responseData.email}" es INVÁLIDO.\nRazón: ${responseData.failedValidation}`;
                logMessage(`Validación de email completada: Inválido (${responseData.failedValidation}).`);
            }

        } catch (error) {
            console.error("Error en macroValidateEmail:", error);
            logMessage(`Error al validar el email: ${error.message}`);
            emailValidationResults.textContent = `Error: ${error.message}`;
        } finally {
            unblockUI();
        }
    }
    
    // --- 4.4. Buscador de Orígenes de Datos ---
    
    /**
     * Busca todas las actividades (Imports, Queries) que tienen como destino una Data Extension específica.
     */
    async function macroFindDataSources() {
        blockUI();
        dataSourcesTbody.innerHTML = '<tr><td colspan="6">Buscando...</td></tr>';
        const deName = deNameToFindInput.value.trim();
        if (!deName) {
            alert('Por favor, introduce el nombre de la Data Extension.');
            dataSourcesTbody.innerHTML = '<tr><td colspan="6">Búsqueda cancelada.</td></tr>';
            unblockUI();
            return;
        }

        try {
            logMessage(`Iniciando búsqueda de orígenes para la DE: "${deName}"`);
            await macroGetToken(true);
            const config = { ...getFullClientConfig(), token: tokenField.value, soapUri: soapUriInput.value, restUri: restUriInput.value };
            if (!config.soapUri || !config.restUri || !config.token) {
                throw new Error("Token o URIs no disponibles. Revisa la configuración.");
            }
            
            const deDetails = await getDeObjectId(deName, config);
            logMessage(`ObjectID de la DE encontrada: ${deDetails.ObjectID}`);

            // Ejecuta las búsquedas de imports y queries en paralelo para mayor eficiencia
            const [imports, queries] = await Promise.all([
                findImportsForDE(deDetails.ObjectID, config),
                findQueriesForDE(deName, config)
            ]);

            const allSources = [...imports, ...queries].sort((a,b) => a.name.localeCompare(b.name));
            renderDataSourcesTable(allSources);
            logMessage(`Búsqueda completada. Se encontraron ${allSources.length} actividades.`);

        } catch(error) {
            console.error("Error en macroFindDataSources:", error);
            logMessage(`Error al buscar orígenes de datos: ${error.message}`);
            dataSourcesTbody.innerHTML = `<tr><td colspan="6" style="color: red;">Error: ${error.message}</td></tr>`;
        } finally {
            unblockUI();
        }
    }

    // --- 4.5. Calendario de Automatizaciones ---

    /**
     * Obtiene todas las automatizaciones, filtra las que inician un Journey y están programadas,
     * y las procesa para mostrarlas en el calendario.
     */
    async function macroGetAutomations() {
        blockUI();
        let allRequests = []; // Para loguear todas las peticiones al final
        let allResponses = []; // Para loguear todas las respuestas
        logMessage("Iniciando recuperación de automatizaciones...");
        logApiCall('');
        logApiResponse('');

        try {
            await macroGetToken(true);
            const config = getFullClientConfig();
            const currentClient = clientNameInput.value;
            if (!config.restUri || !tokenField.value) {
                throw new Error("La REST URI o el Token no están disponibles. Revisa la configuración.");
            }
            
            // Paso 1: Obtener la lista de todas las automatizaciones (con paginación)
            logMessage("Paso 1/3: Obteniendo lista de todas las automatizaciones...");
            let allItems = [];
            let page = 1;
            let totalPages = 1;

            do {
                const url = `${config.restUri}automation/v1/automations?$page=${page}`;
                const requestDetails = { step: `Paso 1 (Página ${page})`, endpoint: url, method: "GET" };
                allRequests.push(requestDetails);
                
                const response = await fetch(url, { headers: { "Authorization": `Bearer ${tokenField.value}` } });
                const data = await response.json();
                
                if (!response.ok) throw new Error(data.message || "Error al obtener la lista de automatizaciones.");
                allResponses.push({ request: requestDetails, response: data });
                
                allItems = allItems.concat(data.items);
                totalPages = Math.ceil(data.count / data.pageSize);
                page++;
            } while (page <= totalPages);

            logMessage(`${allItems.length} automatizaciones encontradas. Filtrando las programadas...`);
            const scheduledItems = allItems.filter(item => item.schedule && (item.schedule.scheduleStatus === 'Scheduled' || item.schedule.scheduleStatus === 'active'));
            
            // Paso 2: Inspeccionar cada automatización programada para ver si contiene una actividad de Journey Entry
            logMessage(`Paso 2/3: ${scheduledItems.length} automatizaciones programadas. Inspeccionando cada una...`);
            const journeyAutomations = [];
            for (let i = 0; i < scheduledItems.length; i++) {
                const item = scheduledItems[i];
                logMessage(`Inspeccionando ${i + 1}/${scheduledItems.length}: "${item.name}"`);
                
                const detailUrl = `${config.restUri}automation/v1/automations/${item.id}`;
                const detailResponse = await fetch(detailUrl, { headers: { "Authorization": `Bearer ${tokenField.value}` } });
                const detailData = await detailResponse.json();

                if (detailData.steps?.some(step => step.activities.some(activity => activity.objectTypeId === 952))) {
                    journeyAutomations.push(item);
                }
            }
            
            // Paso 3: Procesar y guardar los datos
            logMessage(`Paso 3/3: ${journeyAutomations.length} automatizaciones de Journeys encontradas. Procesando fechas...`);
            processAndStoreAutomations(journeyAutomations);
            
            const dataToSave = { client: currentClient, automations: allAutomations };
            localStorage.setItem('calendarAutomations', JSON.stringify(dataToSave));
            calendarDataForClient = currentClient;

            logMessage("Datos de automatizaciones actualizados y guardados localmente.");
            generateCalendar();

        } catch(error) {
            console.error("Error en macroGetAutomations:", error);
            logMessage(`Error al recuperar automatizaciones: ${error.message}`);
            alert(`Error al recuperar automatizaciones: ${error.message}`);
        } finally {
            logApiCall(allRequests);
            logApiResponse(allResponses);
            unblockUI();
        }
    }


    // ==========================================================
    // --- 5. FUNCIONES AUXILIARES (HELPERS) ---
    // Funciones de parseo y peticiones que apoyan a las macros.
    // ==========================================================
    
    /**
     * Ejecuta una petición SOAP genérica y maneja la respuesta.
     * @param {string} soapUri - La URL del endpoint SOAP.
     * @param {string} soapPayload - El cuerpo de la petición SOAP en formato XML.
     * @param {string} successMessage - El mensaje a mostrar en caso de éxito.
     * @returns {Promise<string>} - El texto de la respuesta.
     */
    async function executeSoapRequest(soapUri, soapPayload, successMessage) {
        const requestDetails = { endpoint: soapUri, method: "POST", headers: { 'Content-Type': 'text/xml' }, payload: soapPayload };
        logApiCall(requestDetails);
        logApiResponse('');

        const response = await fetch(soapUri, { method: 'POST', headers: { 'Content-Type': 'text/xml' }, body: soapPayload });
        const responseText = await response.text();
        logApiResponse({ status: response.status, statusText: response.statusText, body: responseText });

        if (responseText.includes('<OverallStatus>OK</OverallStatus>')) {
            logMessage(successMessage);
            alert(successMessage);
            return responseText;
        } else {
            const errorMatch = responseText.match(/<StatusMessage>(.*?)<\/StatusMessage>/);
            const errorMessage = errorMatch ? errorMatch[1] : 'Error desconocido en la respuesta SOAP.';
            throw new Error(errorMessage);
        }
    }
    
    /**
     * Parsea una respuesta SOAP para extraer información completa de los campos de una DE.
     * @param {string} xmlString - La respuesta XML de la API.
     * @returns {Promise<Array<object>>} - Una promesa que se resuelve con un array de objetos de campo.
     */
    function parseFullSoapFieldsAsync(xmlString) {
        return new Promise(resolve => {
            const fields = [];
            const parser = new DOMParser();
            const xmlDoc = parser.parseFromString(xmlString, "application/xml");
            const resultsNodes = xmlDoc.querySelectorAll("Results");
            const getText = (node, tagName) => node.querySelector(tagName)?.textContent || '';

            resultsNodes.forEach(node => {
                const fieldType = getText(node, 'FieldType');
                let length = getText(node, 'MaxLength');
                if (fieldType.toLowerCase() === 'decimal') {
                    const scale = getText(node, 'Scale');
                    if (scale && scale !== '0') length = `${length},${scale}`;
                }
                fields.push({
                    mc: getText(node, 'Name'),
                    type: fieldType,
                    len: length,
                    defaultValue: getText(node, 'DefaultValue'),
                    pk: getText(node, 'IsPrimaryKey') === 'true',
                    req: getText(node, 'IsRequired') === 'true',
                    ordinal: parseInt(getText(node, 'Ordinal'), 10) || 0,
                    objectId: getText(node, 'ObjectID')
                });
            });
            resolve(fields.sort((a, b) => a.ordinal - b.ordinal)); // Ordena los campos por su posición original
        });
    }

    /**
     * Parsea la respuesta de búsqueda de una DE para extraer su nombre y el ID de su carpeta.
     * @param {string} xmlString - La respuesta XML de la API.
     * @returns {Promise<object>} - Promesa que resuelve a un objeto { categoryId, deName, error }.
     */
    function parseDESearchResponse(xmlString) {
        return new Promise(resolve => {
            const parser = new DOMParser();
            const xmlDoc = parser.parseFromString(xmlString, "application/xml");
            if (xmlDoc.querySelector("OverallStatus")?.textContent !== 'OK') {
                const statusMessage = xmlDoc.querySelector("StatusMessage")?.textContent || 'Error desconocido.';
                resolve({ error: statusMessage });
                return;
            }
            const resultNode = xmlDoc.querySelector("Results");
            if (!resultNode) {
                resolve({ error: "No se encontró la Data Extension con los criterios especificados." });
                return;
            }
            resolve({
                categoryId: resultNode.querySelector("CategoryID")?.textContent,
                deName: resultNode.querySelector("Name")?.textContent
            });
        });
    }

    /**
     * Obtiene la ruta completa de una carpeta de forma recursiva.
     * @param {string} folderId - El ID de la carpeta.
     * @param {object} config - El objeto de configuración del cliente.
     * @returns {Promise<string>} - La ruta completa, ej: "CarpetaPadre > CarpetaHija".
     */
    async function getFolderPath(folderId, config) {
        if (!folderId || isNaN(parseInt(folderId))) return ''; 

        const soapPayload = `<s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope" xmlns:a="http://schemas.xmlsoap.org/ws/2004/08/addressing"><s:Header><a:Action s:mustUnderstand="1">Retrieve</a:Action><a:To s:mustUnderstand="1">${config.soapUri}</a:To><fueloauth xmlns="http://exacttarget.com">${config.token}</fueloauth></s:Header><s:Body xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema"><RetrieveRequestMsg xmlns="http://exacttarget.com/wsdl/partnerAPI"><RetrieveRequest><ObjectType>DataFolder</ObjectType><Properties>ID</Properties><Properties>Name</Properties><Properties>ParentFolder.ID</Properties><Filter xsi:type="SimpleFilterPart"><Property>ID</Property><SimpleOperator>equals</SimpleOperator><Value>${folderId}</Value></Filter></RetrieveRequest></RetrieveRequestMsg></s:Body></s:Envelope>`;
        const response = await fetch(config.soapUri, { method: 'POST', headers: { 'Content-Type': 'text/xml' }, body: soapPayload });
        const responseText = await response.text();
        
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(responseText, "application/xml");
        const resultNode = xmlDoc.querySelector("Results");
        if (!resultNode) return ''; // Carpeta no encontrada

        const name = resultNode.querySelector("Name")?.textContent;
        const parentId = resultNode.querySelector("ParentFolder > ID")?.textContent;
        
        const parentPath = await getFolderPath(parentId, config); // Llamada recursiva
        return parentPath ? `${parentPath} > ${name}` : name;
    }

    /**
     * Obtiene el ObjectID de una DE a partir de su nombre.
     * @param {string} deName - El nombre de la Data Extension.
     * @param {object} config - Configuración del cliente.
     * @returns {Promise<object>} - Promesa que resuelve a { ObjectID }.
     */
    async function getDeObjectId(deName, config) {
        logMessage("Recuperando ObjectID de la Data Extension...");
        const soapPayload = `<s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope" xmlns:a="http://schemas.xmlsoap.org/ws/2004/08/addressing"><s:Header><a:Action s:mustUnderstand="1">Retrieve</a:Action><a:To s:mustUnderstand="1">${config.soapUri}</a:To><fueloauth xmlns="http://exacttarget.com">${config.token}</fueloauth></s:Header><s:Body xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema"><RetrieveRequestMsg xmlns="http://exacttarget.com/wsdl/partnerAPI"><RetrieveRequest><ObjectType>DataExtension</ObjectType><Properties>ObjectID</Properties><Filter xsi:type="SimpleFilterPart"><Property>Name</Property><SimpleOperator>equals</SimpleOperator><Value>${deName}</Value></Filter></RetrieveRequest></RetrieveRequestMsg></s:Body></s:Envelope>`;
        const response = await fetch(config.soapUri, { method: 'POST', headers: { 'Content-Type': 'text/xml' }, body: soapPayload });
        const responseText = await response.text();
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(responseText, "application/xml");
        const objectIDNode = xmlDoc.querySelector("Results > ObjectID");
        if (!objectIDNode) throw new Error(`No se encontró una Data Extension con el nombre "${deName}".`);
        return { ObjectID: objectIDNode.textContent };
    }

    /**
     * Busca actividades de importación que apunten a un ObjectID de una DE.
     * @param {string} deObjectId - El ObjectID de la DE destino.
     * @param {object} config - Configuración del cliente.
     * @returns {Promise<Array<object>>} - Un array de objetos de importación.
     */
    async function findImportsForDE(deObjectId, config) {
        logMessage("Buscando Actividades de Importación...");
        const soapPayload = `<s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope" xmlns:a="http://schemas.xmlsoap.org/ws/2004/08/addressing"><s:Header><a:Action s:mustUnderstand="1">Retrieve</a:Action><a:To s:mustUnderstand="1">${config.soapUri}</a:To><fueloauth xmlns="http://exacttarget.com">${config.token}</fueloauth></s:Header><s:Body xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema"><RetrieveRequestMsg xmlns="http://exacttarget.com/wsdl/partnerAPI"><RetrieveRequest><ObjectType>ImportDefinition</ObjectType><Properties>Name</Properties><Properties>Description</Properties><Filter xsi:type="SimpleFilterPart"><Property>DestinationObject.ObjectID</Property><SimpleOperator>equals</SimpleOperator><Value>${deObjectId}</Value></Filter></RetrieveRequest></RetrieveRequestMsg></s:Body></s:Envelope>`;
        const responseText = await (await fetch(config.soapUri, { method: 'POST', headers: { 'Content-Type': 'text/xml' }, body: soapPayload })).text();
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(responseText, "application/xml");
        const resultsNodes = xmlDoc.querySelectorAll("Results");
        const imports = Array.from(resultsNodes).map(node => ({
            name: node.querySelector("Name")?.textContent || 'N/A',
            type: 'Import',
            description: node.querySelector("Description")?.textContent || '---'
        }));
        logMessage(`Encontrados ${imports.length} imports.`);
        return imports;
    }

    /**
     * Busca actividades de query que apunten a una DE por su nombre.
     * @param {string} deName - El nombre de la DE destino.
     * @param {object} config - Configuración del cliente.
     * @returns {Promise<Array<object>>} - Un array de objetos de query con detalles de su automatización.
     */
    async function findQueriesForDE(deName, config) {
        logMessage("Buscando Actividades de Query...");
        const soapPayload = `<s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope" xmlns:a="http://schemas.xmlsoap.org/ws/2004/08/addressing"><s:Header><a:Action s:mustUnderstand="1">Retrieve</a:Action><a:To s:mustUnderstand="1">${config.soapUri}</a:To><fueloauth xmlns="http://exacttarget.com">${config.token}</fueloauth></s:Header><s:Body xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema"><RetrieveRequestMsg xmlns="http://exacttarget.com/wsdl/partnerAPI"><RetrieveRequest><ObjectType>QueryDefinition</ObjectType><Properties>Name</Properties><Properties>Description</Properties><Properties>QueryText</Properties><Properties>TargetUpdateType</Properties><Properties>ObjectID</Properties><Filter xsi:type="SimpleFilterPart"><Property>DataExtensionTarget.Name</Property><SimpleOperator>equals</SimpleOperator><Value>${deName}</Value></Filter></RetrieveRequest></RetrieveRequestMsg></s:Body></s:Envelope>`;
        const responseText = await (await fetch(config.soapUri, { method: 'POST', headers: { 'Content-Type': 'text/xml' }, body: soapPayload })).text();
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(responseText, "application/xml");
        const resultsNodes = xmlDoc.querySelectorAll("Results");
        const queries = Array.from(resultsNodes).map(node => ({
            name: node.querySelector("Name")?.textContent || 'N/A',
            type: 'Query',
            description: node.querySelector("QueryText")?.textContent || '---',
            action: node.querySelector("TargetUpdateType")?.textContent || 'N/A',
            objectID: node.querySelector("ObjectID")?.textContent
        }));
        logMessage(`Encontradas ${queries.length} queries. Buscando sus automatizaciones...`);
        // Para cada query, busca la automatización a la que pertenece
        return await Promise.all(queries.map(q => findAutomationForQuery(q, config)));
    }
    
    /**
     * Busca la automatización a la que pertenece una actividad de query.
     * @param {object} query - El objeto de la query.
     * @param {object} config - Configuración del cliente.
     * @returns {Promise<object>} - El objeto de la query enriquecido con el nombre y paso de la automatización.
     */
    async function findAutomationForQuery(query, config) {
        if (!query.objectID) return { ...query, automationName: '---', step: '---' };
        
        // SOAP para encontrar la actividad de la automatización
        const soapPayload = `<s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope" xmlns:a="http://schemas.xmlsoap.org/ws/2004/08/addressing"><s:Header><a:Action s:mustUnderstand="1">Retrieve</a:Action><a:To s:mustUnderstand="1">${config.soapUri}</a:To><fueloauth xmlns="http://exacttarget.com">${config.token}</fueloauth></s:Header><s:Body xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema"><RetrieveRequestMsg xmlns="http://exacttarget.com/wsdl/partnerAPI"><RetrieveRequest><ObjectType>Activity</ObjectType><Properties>Program.ObjectID</Properties><Filter xsi:type="SimpleFilterPart"><Property>Definition.ObjectID</Property><SimpleOperator>equals</SimpleOperator><Value>${query.objectID}</Value></Filter></RetrieveRequest></RetrieveRequestMsg></s:Body></s:Envelope>`;
        const responseText = await (await fetch(config.soapUri, { method: 'POST', headers: { 'Content-Type': 'text/xml' }, body: soapPayload })).text();
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(responseText, "application/xml");
        const programIdNode = xmlDoc.querySelector("Program > ObjectID");
        if (!programIdNode) return { ...query, automationName: '---', step: '---' };

        // REST para obtener los detalles de la automatización
        const automationId = programIdNode.textContent;
        const restUrl = `${config.restUri}automation/v1/automations/${automationId}`;
        const autoResponse = await fetch(restUrl, { headers: { "Authorization": `Bearer ${config.token}` } });
        const autoData = await autoResponse.json();
        
        // Encuentra el número de paso de la actividad dentro de la automatización
        let step = 'N/A';
        autoData.steps?.forEach(s => {
            s.activities?.forEach(a => {
                if(a.activityObjectId === query.objectID) step = s.step;
            });
        });
        
        return { ...query, automationName: autoData.name || 'N/A', step };
    }


    // ==========================================================
    // --- 6. MANIPULACIÓN DEL DOM Y LÓGICA DE COMPONENTES ---
    // Funciones que directamente crean, modifican o gestionan componentes de la UI.
    // ==========================================================

    // --- 6.1. Tabla de Campos ---

    /**
     * Rellena la tabla de campos con datos.
     * @param {Array<object>} [fields=[]] - Un array de objetos de campo.
     */
    function populateFieldsTable(fields = []) {
        observer.disconnect(); // Pausa el observador para evitar bucles
        fieldsTableBody.innerHTML = '';
        if (fields.length > 0) {
            fields.forEach(fieldData => fieldsTableBody.appendChild(createTableRow(fieldData)));
        } else {
            addNewField(false); // Añade una fila en blanco si no hay campos
        }
        updateSubscriberKeyFieldOptions();
        observer.observe(fieldsTableBody, observerConfig); // Reanuda el observador
    }

    /**
     * Crea una nueva fila <tr> para la tabla de campos.
     * @param {object} [data={}] - Datos del campo para rellenar la fila.
     * @returns {HTMLTableRowElement} - El elemento <tr> creado.
     */
    function createTableRow(data = {}) {
        const row = document.createElement('tr');
        const fieldData = { 
            mc: data.mc || '', type: data.type || '', len: data.len || '', 
            defaultValue: data.defaultValue || '', pk: data.pk || false, req: data.req || false 
        };
        row.innerHTML = `
            <td class="editable" contenteditable="true">${fieldData.mc}</td>
            <td class="editable" contenteditable="true">${fieldData.type}</td>
            <td class="editable" contenteditable="true">${fieldData.len}</td>
            <td class="editable" contenteditable="true">${fieldData.defaultValue}</td>
            <td><input type="checkbox" ${fieldData.pk ? 'checked' : ''}></td>
            <td><input type="checkbox" ${fieldData.req ? 'checked' : ''}></td>
            <button class="delete-row-btn" title="Eliminar fila">×</button>
        `;
        return row;
    }
    
    /**
     * Limpia completamente la tabla de campos y añade una fila nueva vacía.
     */
    function clearFieldsTable() {
        observer.disconnect();
        fieldsTableBody.innerHTML = '';
        selectedRow = null;
        addNewField(false);
        updateSubscriberKeyFieldOptions();
        populateDeletionPicklist([]); // Limpia también la lista de borrado
        observer.observe(fieldsTableBody, observerConfig);
    }
    
    /**
     * Añade una nueva fila en blanco a la tabla de campos.
     * @param {boolean} [observe=true] - Indica si el observador está activo.
     */
    function addNewField(observe = true) {
        if (!observe) observer.disconnect();
        fieldsTableBody.appendChild(createTableRow());
        if (!observe) {
            updateSubscriberKeyFieldOptions();
            observer.observe(fieldsTableBody, observerConfig);
        }
    }
    
    /**
     * Crea un set de campos de ejemplo para demostración.
     */
    function createDummyFields() {
        populateFieldsTable([
            { mc: 'NombreCompleto', type: 'Text', len: '100', pk: true, req: true }, 
            { mc: 'Email', type: 'EmailAddress', len: '254', req: true },
            { mc: 'SincronizarMC', type: 'Boolean', defaultValue: 'true' },
            { mc: 'FechaNacimiento', type: 'Date' }, 
            { mc: 'Recibo', type: 'Decimal', len: '18,2' },
            { mc: 'Telefono', type: 'Phone' }, 
            { mc: 'Locale', type: 'Locale' }, 
            { mc: 'Numero', type: 'Number' }
        ]);
        populateDeletionPicklist([]); // Limpia la lista de borrado ya que estos campos no existen aún
    }
    
    /**
     * Recoge los datos de todas las filas de la tabla de campos.
     * @returns {Array<object>} - Un array de objetos de campo.
     */
    function getFieldsDataFromTable() {
        const fieldsData = [];
        fieldsTableBody.querySelectorAll('tr').forEach(row => {
            const cells = row.querySelectorAll('td');
            const name = cells[0].textContent.trim();
            const type = cells[1].textContent.trim();
            if (name && type) { // Solo añade la fila si tiene nombre y tipo
                fieldsData.push({
                    name, type, length: cells[2].textContent.trim(),
                    defaultValue: cells[3].textContent.trim(),
                    isPrimaryKey: cells[4].querySelector('input').checked,
                    isRequired: cells[5].querySelector('input').checked,
                });
            }
        });
        return fieldsData;
    }

    // --- 6.2. Lógica de UI para Configuración ---
    
    /**
     * Actualiza el <select> de Subscriber Key basándose en los campos de la tabla.
     */
    function updateSubscriberKeyFieldOptions() {
        const currentSelection = subscriberKeyFieldSelect.value;
        subscriberKeyFieldSelect.innerHTML = ''; 
        const rows = fieldsTableBody.querySelectorAll('tr');
        if (rows.length === 0 || (rows.length === 1 && !rows[0].cells[0].textContent.trim())) {
            subscriberKeyFieldSelect.innerHTML = '<option value="">-- Primero defina campos --</option>';
            return;
        }
        
        subscriberKeyFieldSelect.innerHTML = '<option value="">-- Seleccione un campo --</option>';
        rows.forEach(row => {
            const fieldName = row.cells[0].textContent.trim();
            if (fieldName) {
                const option = new Option(fieldName, fieldName);
                option.dataset.type = row.cells[1].textContent.trim(); // Guarda el tipo de dato
                subscriberKeyFieldSelect.appendChild(option);
            }
        });

        if (Array.from(subscriberKeyFieldSelect.options).some(opt => opt.value === currentSelection)) {
            subscriberKeyFieldSelect.value = currentSelection;
        }
    }
    
    /**
     * Habilita o deshabilita la selección de Subscriber Key si la DE es Sendable.
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
     * Rellena el <select> para borrar campos con los campos recuperados.
     * @param {Array<object>} fields - Array de campos con 'mc' y 'objectId'.
     */
    function populateDeletionPicklist(fields) {
        targetFieldSelect.innerHTML = ''; 
        const validFields = fields.filter(f => f.mc && f.objectId);

        if (validFields.length > 0) {
            targetFieldSelect.appendChild(new Option('-- Seleccione un campo para eliminar --', ''));
            validFields.forEach(field => {
                targetFieldSelect.appendChild(new Option(field.mc, field.objectId));
            });
            targetFieldSelect.disabled = false;
        } else {
            targetFieldSelect.appendChild(new Option('No se encontraron campos recuperados', ''));
            targetFieldSelect.disabled = true;
        }
    }

    // --- 6.3. Lógica del Buscador de Orígenes de Datos ---
    
    /**
     * Renderiza la tabla con los orígenes de datos encontrados.
     * @param {Array<object>} sources - Actividades de Import y Query.
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

    // --- 6.4. Lógica del Calendario ---
    
    /**
     * Inicializa y muestra la vista del calendario.
     */
    window.viewCalendar = function(){
        showSection('calendario-section');
        populateCalendarYearSelect();
        // Carga los datos de automatización desde localStorage si existen y coinciden con el cliente actual
        const savedAutomationsRaw = localStorage.getItem('calendarAutomations');
        if(savedAutomationsRaw) {
            const savedData = JSON.parse(savedAutomationsRaw);
            const currentClient = clientNameInput.value;
            if (savedData.client === currentClient) {
                allAutomations = savedData.automations;
                calendarDataForClient = savedData.client;
                logMessage(`${allAutomations.length} automatizaciones cargadas de la memoria local. Pulsa "Refrescar Datos" para actualizar.`);
                generateCalendar();
            } else {
                allAutomations = [];
                calendarDataForClient = '';
                logMessage(`Los datos guardados son para "${savedData.client}". Pulsa "Refrescar Datos" para el cliente actual.`);
                generateCalendar();
            }
        } else {
            allAutomations = [];
            calendarDataForClient = '';
            logMessage('No hay datos de automatizaciones. Pulsa "Refrescar Datos" para empezar.');
            generateCalendar();
        }
    }
    
    /**
     * Procesa los datos crudos de las automatizaciones y los formatea para su uso en el calendario.
     * @param {Array<object>} items - Array de automatizaciones de la API.
     */
    function processAndStoreAutomations(items) {
        allAutomations = items.map(auto => {
            const dateObj = new Date(auto.schedule.scheduledTime);
            let scheduledTime = "N/A", scheduledHour = "N/A";

            if (!isNaN(dateObj.getTime())) {
                // Formato YYYY-MM-DD
                scheduledTime = dateObj.getFullYear() + "-" +
                                ("0" + (dateObj.getMonth() + 1)).slice(-2) + "-" +
                                ("0" + dateObj.getDate()).slice(-2);
                
                // Ajuste de la hora a la zona horaria de Madrid (CET/CEST)
                const startOfDST = new Date(dateObj.getFullYear(), 2, 31);
                startOfDST.setDate(31 - startOfDST.getDay()); // Último domingo de marzo
                const endOfDST = new Date(dateObj.getFullYear(), 9, 31);
                endOfDST.setDate(31 - endOfDST.getDay()); // Último domingo de octubre
                const madridOffset = (dateObj >= startOfDST && dateObj < endOfDST) ? 2 : 1; // +2 en verano, +1 en invierno
                dateObj.setHours(dateObj.getUTCHours() + madridOffset);
                scheduledHour = ("0" + dateObj.getHours()).slice(-2) + ":" + ("0" + dateObj.getMinutes()).slice(-2);
            }
            return { name: auto.name, status: 'Scheduled', scheduledTime, scheduledHour };
        });
    }

    /**
     * Genera la vista de 12 meses del calendario para el año seleccionado.
     */
    function generateCalendar() {
        const year = calendarYearSelect.value;
        calendarGrid.innerHTML = "";
        const months = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
        const days = ["Lu", "Ma", "Mi", "Ju", "Vi", "Sa", "Do"];

        for (let i = 0; i < 12; i++) {
            const monthDiv = document.createElement("div");
            monthDiv.classList.add("calendar-month");
            monthDiv.innerHTML = `<h3>${months[i]} ${year}</h3>`;
            
            const table = document.createElement("table");
            const thead = `<thead><tr>${days.map(d => `<th>${d}</th>`).join('')}</tr></thead>`;
            const tbody = document.createElement("tbody");
            
            let firstDay = new Date(year, i, 1).getDay();
            firstDay = (firstDay === 0) ? 6 : firstDay - 1; // Lunes = 0, Domingo = 6
            const totalDays = new Date(year, i + 1, 0).getDate();
            
            let date = 1;
            for (let rowIdx = 0; rowIdx < 6; rowIdx++) {
                const row = document.createElement("tr");
                for (let colIdx = 0; colIdx < 7; colIdx++) {
                    if ((rowIdx === 0 && colIdx < firstDay) || date > totalDays) {
                        row.appendChild(document.createElement("td"));
                    } else {
                        const cell = document.createElement("td");
                        cell.innerText = date;
                        const currentDate = `${year}-${String(i + 1).padStart(2, '0')}-${String(date).padStart(2, '0')}`;
                        cell.dataset.date = currentDate;
                        
                        if (allAutomations.some(auto => auto.scheduledTime === currentDate)) {
                            cell.classList.add("has-automation");
                        }
                        if (colIdx === 5 || colIdx === 6) { cell.classList.add("weekend"); }
                        
                        cell.addEventListener("click", () => {
                            document.querySelectorAll('.calendar-month td.selected').forEach(c => c.classList.remove('selected'));
                            cell.classList.add('selected');
                            filterAutomationsForDay(cell.dataset.date);
                        });

                        row.appendChild(cell);
                        date++;
                    }
                }
                tbody.appendChild(row);
                if (date > totalDays) break;
            }
            
            table.innerHTML = thead;
            table.appendChild(tbody);
            monthDiv.appendChild(table);
            calendarGrid.appendChild(monthDiv);
        }
    }
    
    /**
     * Filtra y muestra las automatizaciones para un día específico.
     * @param {string} date - La fecha en formato YYYY-MM-DD.
     */
    function filterAutomationsForDay(date) {
        automationList.innerHTML = '';
        const filtered = allAutomations
            .filter(auto => auto.scheduledTime === date)
            .sort((a,b) => a.scheduledHour.localeCompare(b.scheduledHour)); // Ordena por hora
        
        if (filtered.length > 0) {
            filtered.forEach(auto => {
                const itemDiv = document.createElement('div');
                itemDiv.className = 'automation-item';
                itemDiv.innerHTML = `<div class="automation-name">${auto.name}</div><div class="automation-details">${auto.status} - ${auto.scheduledHour}</div>`;
                automationList.appendChild(itemDiv);
            });
        } else {
            automationList.innerHTML = "<p>No hay automatizaciones de Journey programadas para este día.</p>";
        }
    }

    /**
     * Rellena el selector de año del calendario.
     */
    function populateCalendarYearSelect() {
        const currentYear = new Date().getFullYear();
        if(calendarYearSelect.options.length === 0) { // Solo se rellena una vez
            for (let i = currentYear - 5; i <= currentYear + 5; i++) {
                const option = new Option(i, i);
                calendarYearSelect.appendChild(option);
            }
        }
        calendarYearSelect.value = currentYear;
    }
    
    // --- 6.5. Lógica del Modal de Importación ---
    
    /**
     * Cierra el modal de importación y resetea sus campos.
     */
    function closeImportModal() {
        importModal.style.display = 'none';
        pasteDataArea.value = '';
        delimiterSelect.value = 'tab';
        customDelimiterInput.classList.add('hidden');
        customDelimiterInput.value = '';
    }

    /**
     * Procesa el texto pegado en el modal y lo convierte en filas para la tabla de campos.
     */
    function processPastedData() {
        const text = pasteDataArea.value.trim();
        if (!text) return;

        let delimiter;
        const selectedDelimiter = delimiterSelect.value;
        if (selectedDelimiter === 'tab') delimiter = '\t';
        else if (selectedDelimiter === 'comma') delimiter = ',';
        else if (selectedDelimiter === 'semicolon') delimiter = ';';
        else if (selectedDelimiter === 'other') {
            delimiter = customDelimiterInput.value;
            if (!delimiter) { alert('Por favor, introduce un carácter en el campo "Otro" como separador.'); return; }
        }

        const newFields = text.split('\n').map(line => {
            if (!line.trim()) return null;
            const columns = line.split(delimiter);
            const [name, type, length] = columns.map(c => c.trim());
            return (name && type) ? { mc: name, type, len: length || '' } : null;
        }).filter(Boolean); // Filtra líneas nulas o vacías

        if (newFields.length > 0) {
            observer.disconnect();
            const firstRow = fieldsTableBody.querySelector('tr');
            // Si la primera fila está vacía (solo tiene el botón de borrar), la elimina
            if (firstRow && firstRow.textContent.trim() === '×') {
                firstRow.remove();
            }
            newFields.forEach(fieldData => fieldsTableBody.appendChild(createTableRow(fieldData)));
            updateSubscriberKeyFieldOptions();
            observer.observe(fieldsTableBody, observerConfig);
            logMessage(`${newFields.length} campos importados a la tabla.`);
        }
        closeImportModal();
    }
    
    // --- 6.6. Menús Colapsables y Pestañas ---
    
    /**
     * Restaura el estado (abierto/cerrado) de los menús colapsables desde localStorage.
     */
    function initializeCollapsibleMenus() {
        const collapsibleStates = JSON.parse(localStorage.getItem('collapsibleStates')) || {};
        collapsibleHeaders.forEach(header => {
            const headerText = header.textContent.trim();
            if (collapsibleStates[headerText] === true) {
                header.classList.add('active');
                const content = header.nextElementSibling;
                content.style.maxHeight = content.scrollHeight + "px"; // Expande el menú
            }
        });
    }

    // ==========================================================
    // --- 7. INICIALIZACIÓN Y EVENT LISTENERS ---
    // Asigna los listeners a los elementos del DOM y ejecuta la configuración inicial.
    // ==========================================================
    
    /**
     * Configura todos los event listeners de la aplicación.
     */
    function setupEventListeners() {
        
        // --- Listeners de Navegación y Vistas ---
        document.querySelectorAll('.back-button').forEach(button => {
            button.addEventListener('click', () => {
                mainMenu.style.display = 'flex';
                allSections.forEach(s => s.style.display = 'none');
            });
        });

        document.querySelectorAll('.macro-item').forEach(item => {
            item.addEventListener('click', (e) => {
                e.preventDefault();
                const macro = e.target.getAttribute('data-macro');
                const sectionMap = {
                    'docu': 'documentacion-section',
                    'configuracionAPIs': 'configuracion-apis-section',
                    'configuracionDE': 'configuracion-de-section',
                    'campos': 'campos-section',
                    'gestionCampos': 'configuracion-campos-section',
                    'busquedaDE': 'busqueda-de-section',
                    'validadorEmail': 'email-validator-section',
                    'buscadorOrigenes': 'data-source-finder-section'
                };
                if (sectionMap[macro]) {
                    showSection(sectionMap[macro]);
                } else if (macro === 'calendario') {
                    viewCalendar();
                } else {
                    logMessage(`Función no implementada: ${macro}`);
                }
            });
        });

        // --- Listeners de Configuración del Cliente ---
        saveConfigBtn.addEventListener('click', () => {
            const clientName = clientNameInput.value.trim();
            if (!clientName) return alert('Por favor, introduce un nombre para el cliente.'); 
            let configs = JSON.parse(localStorage.getItem('mcApiConfigs')) || {};
            configs[clientName] = getFullClientConfig();
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
                setFullClientConfig({}); // Limpia el formulario
                loadConfigsIntoSelect();
                loadAndSyncClientConfig('');
            }
        });

        savedConfigsSelect.addEventListener('change', (e) => loadAndSyncClientConfig(e.target.value));
        sidebarClientSelect.addEventListener('change', (e) => loadAndSyncClientConfig(e.target.value));

        // --- Listeners de Macros y Acciones ---
        getTokenBtn.addEventListener('click', () => macroGetToken(false));
        createDEBtn.addEventListener('click', macroCreateDE);
        createFieldsBtn.addEventListener('click', macroCreateFields);
        getFieldsBtn.addEventListener('click', macroGetFields);
        deleteFieldBtn.addEventListener('click', macroDeleteField); 
        searchDEBtn.addEventListener('click', macroSearchDE);
        validateEmailBtn.addEventListener('click', macroValidateEmail);
        findDataSourcesBtn.addEventListener('click', macroFindDataSources);
        refreshAutomationsBtn.addEventListener('click', macroGetAutomations);
        
        // --- Listeners de la Tabla de Campos ---
        createDummyFieldsBtn.addEventListener('click', createDummyFields);
        clearFieldsBtn.addEventListener('click', clearFieldsTable);
        addFieldBtn.addEventListener('click', () => addNewField(true));

        fieldsTableBody.addEventListener('click', (e) => {
            const targetRow = e.target.closest('tr');
            if (!targetRow) return;

            // Delegación de eventos para el botón de borrar
            if (e.target.classList.contains('delete-row-btn')) {
                observer.disconnect();
                if (targetRow === selectedRow) selectedRow = null;
                targetRow.remove();
                updateSubscriberKeyFieldOptions();
                observer.observe(fieldsTableBody, observerConfig);
            } else { // Lógica de selección de fila
                if (targetRow !== selectedRow) {
                    document.querySelectorAll('#myTable tbody tr.selected').forEach(r => r.classList.remove('selected'));
                    targetRow.classList.add('selected');
                    selectedRow = targetRow;
                }
            }
        });

        moveUpBtn.addEventListener('click', () => {
          if (selectedRow && selectedRow.previousElementSibling) {
              selectedRow.parentNode.insertBefore(selectedRow, selectedRow.previousElementSibling);
          }
        });

        moveDownBtn.addEventListener('click', () => {
          if (selectedRow && selectedRow.nextElementSibling) {
              selectedRow.parentNode.insertBefore(selectedRow.nextElementSibling, selectedRow);
          }
        });

        // --- Listeners de Configuración de Formularios ---
        authUriInput.addEventListener('blur', () => { // Autocorrige la Auth URI
            if (!authUriInput.value.trim()) return;
            authUriInput.value = authUriInput.value.split('/v2/token')[0].replace(/\/+$/, '') + '/v2/token';
        });

        deNameInput.addEventListener('input', () => { // Autogenera la External Key
            deExternalKeyInput.value = deNameInput.value.replace(/\s+/g, '_') + '_CK';
        });

        isSendableCheckbox.addEventListener('change', handleSendableChange);
        subscriberKeyFieldSelect.addEventListener('change', () => {
            const selectedOption = subscriberKeyFieldSelect.options[subscriberKeyFieldSelect.selectedIndex];
            subscriberKeyTypeInput.value = (selectedOption?.dataset.type) || '';
        });
        
        // --- Listeners del Modal de Importación ---
        importFieldsBtn.addEventListener('click', () => { importModal.style.display = 'flex'; pasteDataArea.focus(); });
        cancelPasteBtn.addEventListener('click', closeImportModal);
        importModal.addEventListener('click', (e) => { if (e.target === importModal) closeImportModal(); }); // Cierra al hacer clic fuera
        delimiterSelect.addEventListener('change', () => {
            customDelimiterInput.classList.toggle('hidden', delimiterSelect.value !== 'other');
            if (delimiterSelect.value === 'other') customDelimiterInput.focus();
        });
        processPasteBtn.addEventListener('click', processPastedData);

        // --- Listeners de Componentes de UI ---
        toggleLogBtn.addEventListener('click', () => {
            const isCollapsed = appContainer.classList.toggle('log-collapsed');
            localStorage.setItem('logCollapsedState', isCollapsed);
        });

        tabButtons.forEach(button => {
            button.addEventListener('click', () => {
                const tabId = button.getAttribute('data-tab');
                tabButtons.forEach(btn => btn.classList.remove('active'));
                tabContents.forEach(content => content.classList.remove('active'));
                button.classList.add('active');
                document.getElementById(tabId).classList.add('active');
            });
        });

        collapsibleHeaders.forEach(header => {
            header.addEventListener('click', () => {
                const content = header.nextElementSibling;
                const isExpanded = header.classList.toggle('active');
                content.style.maxHeight = isExpanded ? content.scrollHeight + "px" : 0;
                
                const collapsibleStates = JSON.parse(localStorage.getItem('collapsibleStates')) || {};
                collapsibleStates[header.textContent.trim()] = isExpanded;
                localStorage.setItem('collapsibleStates', JSON.stringify(collapsibleStates));
            });
        });
        
        calendarYearSelect.addEventListener('change', generateCalendar);
    }
    
    // Observador para actualizar el selector de Subscriber Key cuando la tabla de campos cambia.
    const observer = new MutationObserver(updateSubscriberKeyFieldOptions);
    const observerConfig = { childList: true, subtree: true, characterData: true };
    
    /**
     * Función principal que inicializa el estado de la aplicación al cargar.
     */
    function initializeApp() {
        // Restaura el estado del panel de log
        if (localStorage.getItem('logCollapsedState') === 'true') {
            appContainer.classList.add('log-collapsed');
        }
        
        // Carga las configuraciones de cliente guardadas
        loadConfigsIntoSelect();
        const lastSelectedClient = localStorage.getItem('lastSelectedClient') || '';
        if (lastSelectedClient) {
            loadAndSyncClientConfig(lastSelectedClient);
        } else {
            setFullClientConfig({}); // Si no hay cliente previo, limpia los formularios
        }
        
        // Configuración inicial de la tabla de campos
        clearFieldsTable();
        observer.observe(fieldsTableBody, observerConfig);
        
        // Restaura el estado de los menús colapsables
        initializeCollapsibleMenus();
        
        // Asigna todos los event listeners
        setupEventListeners();
        
        logMessage("Aplicación lista. Esperando acciones...");
    }
    
    // Inicia la aplicación
    initializeApp();
});