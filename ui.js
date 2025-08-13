document.addEventListener('DOMContentLoaded', function() {
    
    // ==========================================================
    // --- 1. DECLARACIÓN DE ELEMENTOS DEL DOM ---
    // ==========================================================
    
    // Generales
    const appContainer = document.querySelector('.app-container');
    const mainMenu = document.getElementById('main-menu');
    const sections = document.querySelectorAll('#main-content > .section');
    const toggleLogBtn = document.getElementById('toggleLogBtn');

    // Logs
    const logMessagesEl = document.getElementById('log-messages');
    const logRequestEl = document.getElementById('log-request');
    const logResponseEl = document.getElementById('log-response');

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
    const businessUnitInput = document.getElementById('businessUnit');
    const getTokenBtn = document.getElementById('getTokenBtn');

    // Configuración Data Extension
    const deConfigSection = document.getElementById('configuracion-de-section');
    const deNameInput = document.getElementById('deName');
    const deDescriptionInput = document.getElementById('deDescription');
    const deExternalKeyInput = document.getElementById('deExternalKey');
    const deFolderInput = document.getElementById('deFolder');
    const isSendableCheckbox = document.getElementById('isSendable');
    const subscriberKeyFieldSelect = document.getElementById('subscriberKeyField');
    const subscriberKeyTypeInput = document.getElementById('subscriberKeyType');
    const createDEBtn = document.getElementById('createDE');
    
    // Sección Campos de la DE
    const fieldsTableBody = document.querySelector('#myTable tbody');
    const createDummyFieldsBtn = document.getElementById('createDummyFieldsBtn');
    const createFieldsBtn = document.getElementById('createFieldsBtn');
    const clearFieldsBtn = document.getElementById('clearFieldsBtn');
    const addFieldBtn = document.getElementById('addFieldBtn');
    let selectedRow = null;

    // Sección Gestión de Campos
    const recExternalKeyInput = document.getElementById('recExternalKey');
    const targetFieldSelect = document.getElementById('targetFieldSelect');
    const getFieldsBtn = document.getElementById('getFields');
    const deleteFieldBtn = document.getElementById('deleteField');

    // Modal de Importación
    const importFieldsBtn = document.getElementById('importFieldsBtn');
    const importModal = document.getElementById('import-modal');
    const pasteDataArea = document.getElementById('paste-data-area');
    const processPasteBtn = document.getElementById('process-paste-btn');
    const cancelPasteBtn = document.getElementById('cancel-paste-btn');
    const delimiterSelect = document.getElementById('delimiter-select');
    const customDelimiterInput = document.getElementById('custom-delimiter-input');
    
    // Búsqueda de Data Extension
    const searchDEBtn = document.getElementById('searchDEBtn');
    const deSearchProperty = document.getElementById('deSearchProperty');
    const deSearchValue = document.getElementById('deSearchValue');
    const deSearchResults = document.getElementById('de-search-results');

    // Validador de Email
    const validateEmailBtn = document.getElementById('validateEmailBtn');
    const emailToValidateInput = document.getElementById('emailToValidate');
    const emailValidationResults = document.getElementById('email-validation-results');

    // Buscador de Orígenes de Datos
    const findDataSourcesBtn = document.getElementById('findDataSourcesBtn');
    const deNameToFindInput = document.getElementById('deNameToFind');
    const dataSourcesTbody = document.getElementById('data-sources-tbody');


    // Pestañas de Documentación y Menú Colapsable
    const tabButtons = document.querySelectorAll('.tab-button');
    const tabContents = document.querySelectorAll('.tab-content');
    const collapsibleHeaders = document.querySelectorAll('.collapsible-header');

    // Calendario
    const calendarGrid = document.getElementById('calendar-grid');
    const calendarYearSelect = document.getElementById('calendarYearSelect');
    const automationList = document.getElementById('automation-list');
    const refreshAutomationsBtn = document.getElementById('refreshAutomationsBtn');
    let allAutomations = [];
    let calendarDataForClient = '';


    // ==========================================================
    // --- 2. GESTIÓN DE ESTADO Y CONFIGURACIÓN ---
    // ==========================================================

    function logMessage(message) {
        if (logMessagesEl) logMessagesEl.textContent = message;
    }

    function logApiCall(requestData) {
        if (logRequestEl) logRequestEl.textContent = (typeof requestData === 'object') ? JSON.stringify(requestData, null, 2) : requestData;
    }

    function logApiResponse(responseData) {
        if (logResponseEl) logResponseEl.textContent = (typeof responseData === 'object') ? JSON.stringify(responseData, null, 2) : responseData;
    }
    
    const getFullClientConfig = () => {
        const config = {};
        apiConfigSection.querySelectorAll('input:not([type="checkbox"]), select').forEach(input => {
             if (input.id && !['clientName', 'savedConfigs'].includes(input.id)) config[input.id] = input.value;
        });
        deConfigSection.querySelectorAll('input:not([type="checkbox"]), select').forEach(el => config[el.id] = el.value);
        deConfigSection.querySelectorAll('input[type="checkbox"]').forEach(el => config[el.id] = el.checked);
        if (recExternalKeyInput) config[recExternalKeyInput.id] = recExternalKeyInput.value;
        return config;
    };
    
    const setFullClientConfig = (config) => {
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

        for (const key in config) {
            const element = document.getElementById(key);
            if (element) {
                if (element.type === 'checkbox') element.checked = config[key];
                else element.value = config[key];
            }
        }
        handleSendableChange();
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
        setFullClientConfig(configToLoad);
        
        clientNameInput.value = clientName;
        savedConfigsSelect.value = clientName;
        sidebarClientSelect.value = clientName;

        localStorage.setItem('lastSelectedClient', clientName);
    }

    // ==========================================================
    // --- 3. LÓGICA DE LA APLICACIÓN Y UI ---
    // ==========================================================
    
    function blockUI() {
        if (document.activeElement) document.activeElement.blur();
        appContainer.classList.add('is-updating');
        document.body.style.cursor = 'wait';
    }

    function unblockUI() {
        appContainer.classList.remove('is-updating');
        document.body.style.cursor = 'default';
    }

    window.showSection = function(sectionId) {
        mainMenu.style.display = 'none';
        sections.forEach(s => s.style.display = 'none');
        const sectionToShow = document.getElementById(sectionId);
        if (sectionToShow) sectionToShow.style.display = 'flex';
    };

    async function macroGetToken(silent = false) {
        const config = getFullClientConfig(); 
        if (!config.authUri || !config.clientId || !config.clientSecret || !config.businessUnit) {
            if (!silent) {
                 alert("Por favor, complete los campos Auth URI, Client ID, Client Secret y Business Unit (MID) en la configuración.");
                 logMessage("Error: Faltan datos de configuración. Operación cancelada.");
            }
            return Promise.reject(new Error("Faltan datos de configuración"));
        }
        const payload = { "client_id": config.clientId, "client_secret": config.clientSecret, "grant_type": "client_credentials", "account_id": config.businessUnit };
        const requestDetails = { endpoint: config.authUri, method: "POST", headers: { "Content-Type": "application/json" }, body: payload };
        
        if (!silent) {
            logMessage("Recuperando token...");
            logApiCall(requestDetails);
            logApiResponse('');
        }
        
        try {
            const response = await fetch(config.authUri, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
            const responseData = await response.json();
            if (!response.ok) throw new Error(`Error de la API: ${response.status} - ${responseData.error_description || 'Error desconocido'}`);
            
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
            return Promise.reject(error);
        }
    }

    function parseSoapFieldsAsync(xmlString) {
        return new Promise(resolve => {
            setTimeout(() => {
                const fields = [];
                const parser = new DOMParser();
                const xmlDoc = parser.parseFromString(xmlString, "application/xml");
                const resultsNodes = xmlDoc.querySelectorAll("Results");
                resultsNodes.forEach(node => {
                    const nameNode = node.querySelector("Name");
                    const objectIdNode = node.querySelector("ObjectID");
                    if (nameNode && objectIdNode) fields.push({ name: nameNode.textContent, objectId: objectIdNode.textContent });
                });
                resolve(fields);
            }, 0);
        });
    }
    
    function parseFullSoapFieldsAsync(xmlString) {
        return new Promise(resolve => {
            setTimeout(() => {
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
                resolve(fields.sort((a, b) => a.ordinal - b.ordinal));
            }, 0);
        });
    }
    
    function populateDeletionPicklist(fields) {
        targetFieldSelect.innerHTML = ''; 
        if (fields && fields.length > 0) {
            targetFieldSelect.appendChild(new Option('-- Seleccione un campo --', ''));
            fields.forEach(field => {
                if(field.mc && field.objectId) {
                    targetFieldSelect.appendChild(new Option(field.mc, field.objectId));
                }
            });
            targetFieldSelect.disabled = false;
        } else {
            targetFieldSelect.appendChild(new Option('No se encontraron campos', ''));
            targetFieldSelect.disabled = true;
        }
    }

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
            logMessage(`Iniciando borrado del campo "${selectedFieldName}"...`);
            await macroGetToken(true);
            const token = tokenField.value;
            const soapUri = soapUriInput.value;
            if (!token || !soapUri) throw new Error('No se pudo obtener un token o la SOAP URI no está configurada.');
            const soapPayload = `<s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope" xmlns:a="http://schemas.xmlsoap.org/ws/2004/08/addressing"><s:Header><fueloauth xmlns="http://exacttarget.com">${token}</fueloauth><a:Action s:mustUnderstand="1">Delete</a:Action><a:To s:mustUnderstand="1">${soapUri}</a:To></s:Header><s:Body xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><DeleteRequest xmlns="http://exacttarget.com/wsdl/partnerAPI"><Objects xsi:type="DataExtension"><CustomerKey>${externalKey}</CustomerKey><Fields><Field><ObjectID>${fieldObjectId}</ObjectID></Field></Fields></Objects></DeleteRequest></s:Body></s:Envelope>`;
            const requestDetails = { endpoint: soapUri, method: "POST", headers: { 'Content-Type': 'text/xml' }, payload: soapPayload.trim() };
            logApiCall(requestDetails);
            logApiResponse('');
            const response = await fetch(soapUri, { method: 'POST', headers: { 'Content-Type': 'text/xml' }, body: requestDetails.payload });
            const responseText = await response.text();
            logApiResponse({ status: response.status, statusText: response.statusText, body: responseText });
            if (responseText.includes('<OverallStatus>OK</OverallStatus>')) {
                logMessage(`Campo "${selectedFieldName}" eliminado con éxito. Refrescando campos y lista...`);
                macroGetFields();
            } else {
                const errorMatch = responseText.match(/<StatusMessage>(.*?)<\/StatusMessage>/);
                const errorMessage = errorMatch ? errorMatch[1] : 'Error desconocido.';
                throw new Error(errorMessage);
            }
        } catch (error) {
            console.error("Error en macroDeleteField:", error);
            logMessage(`Error al eliminar el campo: ${error.message}`);
            unblockUI();
        }
    }
    
    function buildFieldXml(fieldData) {
        const { name, type, length, defaultValue, isPrimaryKey, isRequired } = fieldData;
        const customerKey = name;
        let fieldXml = '';
        const commonNodes = `<CustomerKey>${customerKey}</CustomerKey><Name>${name}</Name><IsRequired>${isRequired}</IsRequired><IsPrimaryKey>${isPrimaryKey}</IsPrimaryKey>`;
        const defaultValueNode = defaultValue ? `<DefaultValue>${defaultValue}</DefaultValue>` : '';
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
            default: return '';
        }
        return fieldXml.replace(/\s+/g, ' ').trim();
    }

    async function macroCreateFields() {
        blockUI();
        try {
            const externalKey = recExternalKeyInput.value.trim();
            if (!externalKey) {
                alert('Por favor, define una "External Key de la DE" en la sección de "Gestión de Campos".');
                return logMessage("Operación cancelada: Falta External Key de la DE.");
            }
            const validFieldsData = [];
            fieldsTableBody.querySelectorAll('tr').forEach(row => {
                const cells = row.querySelectorAll('td');
                const name = cells[0].textContent.trim();
                const type = cells[1].textContent.trim();
                if (name && type) {
                    validFieldsData.push({
                        name, type, length: cells[2].textContent.trim(),
                        defaultValue: cells[3].textContent.trim(),
                        isPrimaryKey: cells[4].querySelector('input').checked,
                        isRequired: cells[5].querySelector('input').checked,
                    });
                }
            });
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
            const requestDetails = { endpoint: soapUri, method: "POST", headers: { 'Content-Type': 'text/xml' }, payload: soapPayload.trim() };
            logApiCall(requestDetails);
            logApiResponse('');
            const response = await fetch(soapUri, { method: 'POST', headers: { 'Content-Type': 'text/xml' }, body: requestDetails.payload });
            const responseText = await response.text();
            logApiResponse({ status: response.status, statusText: response.statusText, body: responseText });
            if (responseText.includes('<OverallStatus>OK</OverallStatus>')) {
                logMessage(`¡Éxito! Se han creado/actualizado ${validFieldsData.length} campos.`);
                alert(`¡Éxito! Se han creado/actualizado ${validFieldsData.length} campos.`);
            } else {
                const errorMatch = responseText.match(/<StatusMessage>(.*?)<\/StatusMessage>/);
                const errorMessage = errorMatch ? errorMatch[1] : 'Error desconocido.';
                throw new Error(errorMessage);
            }
        } catch (error) {
            console.error("Error en macroCreateFields:", error);
            logMessage(`Error al crear los campos: ${error.message}`);
            alert(`Error al crear los campos: ${error.message}`);
        } finally {
            unblockUI();
        }
    }
    
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
            const isSendable = isSendableCheckbox.checked;
            const subscriberKey = subscriberKeyFieldSelect.value;
            if (isSendable && !subscriberKey) {
                alert('Para una Data Extension enviable, es obligatorio seleccionar un Campo SubscriberKey.');
                return logMessage("Operación cancelada: Falta Subscriber Key.");
            }
            const validFieldsData = [];
            fieldsTableBody.querySelectorAll('tr').forEach(row => {
                const cells = row.querySelectorAll('td');
                const name = cells[0].textContent.trim();
                const type = cells[1].textContent.trim();
                if (name && type) {
                    validFieldsData.push({
                        name, type, length: cells[2].textContent.trim(),
                        defaultValue: cells[3].textContent.trim(),
                        isPrimaryKey: cells[4].querySelector('input').checked,
                        isRequired: cells[5].querySelector('input').checked,
                    });
                }
            });
            if (validFieldsData.length === 0) {
                alert('La Data Extension debe tener al menos un campo definido.');
                return logMessage("Operación cancelada: No hay campos definidos.");
            }
            await macroGetToken(true);
            const token = tokenField.value;
            const soapUri = soapUriInput.value;
            const businessUnit = businessUnitInput.value.trim();
            const deDescription = deDescriptionInput.value.trim();
            const deFolder = deFolderInput.value.trim();
            const subscriberKeyType = subscriberKeyTypeInput.value.trim();
            if (!token || !soapUri) throw new Error('No se pudo obtener un token o la SOAP URI no está configurada.');
            const clientXml = businessUnit ? `<Client><ClientID>${businessUnit}</ClientID></Client>` : '';
            const descriptionXml = deDescription ? `<Description>${deDescription}</Description>` : '';
            const folderXml = deFolder ? `<CategoryID>${deFolder}</CategoryID>` : '';
            let sendableXml = '';
            if (isSendable) {
                sendableXml = `<SendableDataExtensionField><CustomerKey>${subscriberKey}</CustomerKey><Name>${subscriberKey}</Name><FieldType>${subscriberKeyType}</FieldType></SendableDataExtensionField><SendableSubscriberField><Name>Subscriber Key</Name><Value/></SendableSubscriberField>`;
            }
            const fieldsXmlString = validFieldsData.map(buildFieldXml).join('');
            const soapPayload = `<s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope" xmlns:a="http://schemas.xmlsoap.org/ws/2004/08/addressing"><s:Header><a:Action s:mustUnderstand="1">Create</a:Action><a:To s:mustUnderstand="1">${soapUri}</a:To><fueloauth xmlns="http://exacttarget.com">${token}</fueloauth></s:Header><s:Body xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema"><CreateRequest xmlns="http://exacttarget.com/wsdl/partnerAPI"><Objects xsi:type="DataExtension">${clientXml}<CustomerKey>${deExternalKey}</CustomerKey>${descriptionXml}<Name>${deName}</Name>${folderXml}<IsSendable>${isSendable}</IsSendable>${sendableXml}<Fields>${fieldsXmlString}</Fields></Objects></CreateRequest></s:Body></s:Envelope>`;
            const requestDetails = { endpoint: soapUri, method: "POST", headers: { 'Content-Type': 'text/xml' }, payload: soapPayload.trim() };
            logApiCall(requestDetails);
            logApiResponse('');
            const response = await fetch(soapUri, { method: 'POST', headers: { 'Content-Type': 'text/xml' }, body: requestDetails.payload });
            const responseText = await response.text();
            logApiResponse({ status: response.status, statusText: response.statusText, body: responseText });
            if (responseText.includes('<OverallStatus>OK</OverallStatus>')) {
                logMessage(`¡Data Extension "${deName}" creada con éxito!`);
                alert(`¡Data Extension "${deName}" creada con éxito!`);
            } else {
                const errorMatch = responseText.match(/<StatusMessage>(.*?)<\/StatusMessage>/);
                const errorMessage = errorMatch ? errorMatch[1] : 'Error desconocido.';
                throw new Error(errorMessage);
            }
        } catch (error) {
            console.error("Error en macroCreateDE:", error);
            logMessage(`Error al crear la Data Extension: ${error.message}`);
            alert(`Error al crear la Data Extension: ${error.message}`);
        } finally {
            unblockUI();
        }
    }
    
    // ==========================================================
    // --- 5. LÓGICA DE BÚSQUEDA Y VALIDACIÓN (NUEVAS) ---
    // ==========================================================

    async function getFolderPath(folderId, config) {
        if (!folderId || isNaN(parseInt(folderId))) {
            return ''; 
        }

        const soapPayload = `<s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope" xmlns:a="http://schemas.xmlsoap.org/ws/2004/08/addressing"><s:Header><a:Action s:mustUnderstand="1">Retrieve</a:Action><a:To s:mustUnderstand="1">${config.soapUri}</a:To><fueloauth xmlns="http://exacttarget.com">${config.token}</fueloauth></s:Header><s:Body xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema"><RetrieveRequestMsg xmlns="http://exacttarget.com/wsdl/partnerAPI"><RetrieveRequest><ObjectType>DataFolder</ObjectType><Properties>ID</Properties><Properties>Name</Properties><Properties>ParentFolder.ID</Properties><Properties>ParentFolder.Name</Properties><Filter xsi:type="SimpleFilterPart"><Property>ID</Property><SimpleOperator>equals</SimpleOperator><Value>${folderId}</Value></Filter></RetrieveRequest></RetrieveRequestMsg></s:Body></s:Envelope>`;
        const requestDetails = { step: `GetFolderPath (ID: ${folderId})`, endpoint: config.soapUri, payload: soapPayload };
        logApiCall(requestDetails);

        const response = await fetch(config.soapUri, { method: 'POST', headers: { 'Content-Type': 'text/xml' }, body: soapPayload });
        const responseText = await response.text();
        logApiResponse({ body: responseText });

        const folderInfo = await parseFolderResponse(responseText);
        if (folderInfo.error) {
            throw new Error(`Error buscando carpeta ${folderId}: ${folderInfo.error}`);
        }
        
        const parentPath = await getFolderPath(folderInfo.parentId, config);
        
        return parentPath ? `${parentPath} > ${folderInfo.name}` : folderInfo.name;
    }

    function parseFolderResponse(xmlString) {
        return new Promise(resolve => {
            const parser = new DOMParser();
            const xmlDoc = parser.parseFromString(xmlString, "application/xml");
            const resultNode = xmlDoc.querySelector("Results");
            if (xmlDoc.querySelector("OverallStatus")?.textContent !== 'OK') {
                const statusMessage = xmlDoc.querySelector("StatusMessage")?.textContent || 'Error desconocido al buscar la carpeta.';
                resolve({ error: statusMessage });
                return;
            }
            if (!resultNode) {
                resolve({ name: '', parentId: null });
                return;
            }
            const name = resultNode.querySelector("Name")?.textContent;
            const parentId = resultNode.querySelector("ParentFolder > ID")?.textContent;
            resolve({ name, parentId });
        });
    }

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
            const categoryId = resultNode.querySelector("CategoryID")?.textContent;
            const deName = resultNode.querySelector("Name")?.textContent;
            resolve({ categoryId, deName });
        });
    }

    async function macroSearchDE() {
        blockUI();
        deSearchResults.textContent = 'Buscando...';
        try {
            const property = deSearchProperty.value;
            const value = deSearchValue.value.trim();
            if (!value) {
                throw new Error("El campo 'Valor' no puede estar vacío.");
            }

            logMessage(`Iniciando búsqueda de DE por ${property}: ${value}`);
            await macroGetToken(true);
            const config = { ...getFullClientConfig(), token: tokenField.value, soapUri: soapUriInput.value };
            
            if (!config.soapUri || !config.token) {
                throw new Error("No se pudo obtener un token o la SOAP URI. Revisa la configuración.");
            }

            const soapPayload = `<s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope" xmlns:a="http://schemas.xmlsoap.org/ws/2004/08/addressing"><s:Header><a:Action s:mustUnderstand="1">Retrieve</a:Action><a:To s:mustUnderstand="1">${config.soapUri}</a:To><fueloauth xmlns="http://exacttarget.com">${config.token}</fueloauth></s:Header><s:Body xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema"><RetrieveRequestMsg xmlns="http://exacttarget.com/wsdl/partnerAPI"><RetrieveRequest><ObjectType>DataExtension</ObjectType><Properties>ObjectID</Properties><Properties>CustomerKey</Properties><Properties>Name</Properties><Properties>IsSendable</Properties><Properties>CategoryID</Properties><Properties>SendableSubscriberField.Name</Properties><Filter xsi:type="SimpleFilterPart"><Property>${property}</Property><SimpleOperator>equals</SimpleOperator><Value>${value}</Value></Filter></RetrieveRequest></RetrieveRequestMsg></s:Body></s:Envelope>`;
            const requestDetails = { step: 'SearchDE', endpoint: config.soapUri, payload: soapPayload };
            logApiCall(requestDetails);
            
            const response = await fetch(config.soapUri, { method: 'POST', headers: { 'Content-Type': 'text/xml' }, body: soapPayload });
            const responseText = await response.text();
            logApiResponse({ body: responseText });

            const deInfo = await parseDESearchResponse(responseText);
            if (deInfo.error) {
                throw new Error(deInfo.error);
            }
            
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

    async function macroValidateEmail() {
        blockUI();
        emailValidationResults.textContent = 'Validando...';
        try {
            const emailToValidate = emailToValidateInput.value.trim();
            if (!emailToValidate) {
                throw new Error("Por favor, introduce una dirección de email para validar.");
            }

            logMessage(`Iniciando validación para el email: ${emailToValidate}`);
            await macroGetToken(true);
            const config = getFullClientConfig();
            const token = tokenField.value;
            const restUri = config.restUri;

            if (!restUri || !token) {
                throw new Error("La REST URI o el Token no están disponibles. Revisa la configuración.");
            }

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
            logApiResponse('');

            const response = await fetch(validateUrl, {
                method: 'POST',
                headers: requestDetails.headers,
                body: JSON.stringify(payload)
            });

            const responseData = await response.json();
            logApiResponse({ status: response.status, statusText: response.statusText, body: responseData });

            if (!response.ok) {
                const errorMessage = responseData.message || `Error de la API: ${response.status}`;
                throw new Error(errorMessage);
            }

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
    
    // ==========================================================
    // --- 6. LÓGICA DEL BUSCADOR DE ORÍGENES DE DATOS (NUEVA) ---
    // ==========================================================

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
            
            // Primero, obtenemos el ObjectID de la DE para una búsqueda de Imports más eficiente.
            const deDetails = await getDeObjectId(deName, config);
            logMessage(`ObjectID de la DE encontrada: ${deDetails.ObjectID}`);

            // Ejecutar búsquedas en paralelo
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


    async function findImportsForDE(deObjectId, config) {
        logMessage("Buscando Actividades de Importación...");
        const soapPayload = `<s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope" xmlns:a="http://schemas.xmlsoap.org/ws/2004/08/addressing"><s:Header><a:Action s:mustUnderstand="1">Retrieve</a:Action><a:To s:mustUnderstand="1">${config.soapUri}</a:To><fueloauth xmlns="http://exacttarget.com">${config.token}</fueloauth></s:Header><s:Body xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema"><RetrieveRequestMsg xmlns="http://exacttarget.com/wsdl/partnerAPI"><RetrieveRequest><ObjectType>ImportDefinition</ObjectType><Properties>Name</Properties><Properties>Description</Properties><Properties>CustomerKey</Properties><Filter xsi:type="SimpleFilterPart"><Property>DestinationObject.ObjectID</Property><SimpleOperator>equals</SimpleOperator><Value>${deObjectId}</Value></Filter></RetrieveRequest></RetrieveRequestMsg></s:Body></s:Envelope>`;
        const response = await fetch(config.soapUri, { method: 'POST', headers: { 'Content-Type': 'text/xml' }, body: soapPayload });
        const responseText = await response.text();
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(responseText, "application/xml");
        const resultsNodes = xmlDoc.querySelectorAll("Results");
        const imports = [];
        resultsNodes.forEach(node => {
            imports.push({
                name: node.querySelector("Name")?.textContent || '',
                type: 'Import',
                description: node.querySelector("Description")?.textContent || ''
            });
        });
        logMessage(`Encontrados ${imports.length} imports.`);
        return imports;
    }

    async function findQueriesForDE(deName, config) {
        logMessage("Buscando Actividades de Query...");
        const soapPayload = `<s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope" xmlns:a="http://schemas.xmlsoap.org/ws/2004/08/addressing"><s:Header><a:Action s:mustUnderstand="1">Retrieve</a:Action><a:To s:mustUnderstand="1">${config.soapUri}</a:To><fueloauth xmlns="http://exacttarget.com">${config.token}</fueloauth></s:Header><s:Body xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema"><RetrieveRequestMsg xmlns="http://exacttarget.com/wsdl/partnerAPI"><RetrieveRequest><ObjectType>QueryDefinition</ObjectType><Properties>Name</Properties><Properties>Description</Properties><Properties>QueryText</Properties><Properties>TargetUpdateType</Properties><Properties>ObjectID</Properties><Filter xsi:type="SimpleFilterPart"><Property>DataExtensionTarget.Name</Property><SimpleOperator>equals</SimpleOperator><Value>${deName}</Value></Filter></RetrieveRequest></RetrieveRequestMsg></s:Body></s:Envelope>`;
        const response = await fetch(config.soapUri, { method: 'POST', headers: { 'Content-Type': 'text/xml' }, body: soapPayload });
        const responseText = await response.text();
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(responseText, "application/xml");
        const resultsNodes = xmlDoc.querySelectorAll("Results");
        const queries = [];
        resultsNodes.forEach(node => {
            queries.push({
                name: node.querySelector("Name")?.textContent || '',
                type: 'Query',
                description: node.querySelector("QueryText")?.textContent || '',
                action: node.querySelector("TargetUpdateType")?.textContent || '',
                objectID: node.querySelector("ObjectID")?.textContent || '',
            });
        });
        logMessage(`Encontradas ${queries.length} queries. Buscando sus automatizaciones...`);
        const queriesWithAutomation = await Promise.all(queries.map(q => findAutomationForQuery(q, config)));
        return queriesWithAutomation;
    }

    async function findAutomationForQuery(query, config) {
        const soapPayload = `<s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope" xmlns:a="http://schemas.xmlsoap.org/ws/2004/08/addressing"><s:Header><a:Action s:mustUnderstand="1">Retrieve</a:Action><a:To s:mustUnderstand="1">${config.soapUri}</a:To><fueloauth xmlns="http://exacttarget.com">${config.token}</fueloauth></s:Header><s:Body xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema"><RetrieveRequestMsg xmlns="http://exacttarget.com/wsdl/partnerAPI"><RetrieveRequest><ObjectType>Activity</ObjectType><Properties>Program.ObjectID</Properties><Filter xsi:type="SimpleFilterPart"><Property>Definition.ObjectID</Property><SimpleOperator>equals</SimpleOperator><Value>${query.objectID}</Value></Filter></RetrieveRequest></RetrieveRequestMsg></s:Body></s:Envelope>`;
        const response = await fetch(config.soapUri, { method: 'POST', headers: { 'Content-Type': 'text/xml' }, body: soapPayload });
        const responseText = await response.text();
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(responseText, "application/xml");
        const programIdNode = xmlDoc.querySelector("Program > ObjectID");
        if (!programIdNode) {
            return { ...query, automationName: '---', step: '---' };
        }
        const automationId = programIdNode.textContent;
        const restUrl = `${config.restUri}automation/v1/automations/${automationId}`;
        const autoResponse = await fetch(restUrl, { headers: { "Authorization": `Bearer ${config.token}` } });
        const autoData = await autoResponse.json();
        
        let step = 'N/A';
        autoData.steps?.forEach(s => {
            s.activities?.forEach(a => {
                if(a.activityObjectId === query.objectID) {
                    step = s.step;
                }
            });
        });
        
        return { ...query, automationName: autoData.name, step: step };
    }

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


    const observer = new MutationObserver(updateSubscriberKeyFieldOptions);
    const observerConfig = { childList: true, subtree: true, characterData: true };

    function populateFieldsTable(fields = []) {
        observer.disconnect();
        fieldsTableBody.innerHTML = '';
        if (fields.length > 0) {
            fields.forEach(fieldData => fieldsTableBody.appendChild(createTableRow(fieldData)));
        } else {
            addNewField(false);
        }
        updateSubscriberKeyFieldOptions();
        observer.observe(fieldsTableBody, observerConfig);
    }

    function createTableRow(data = {}) {
        const row = document.createElement('tr');
        const fieldData = { mc: data.mc || '', type: data.type || '', len: data.len || '', defaultValue: data.defaultValue || '', pk: data.pk || false, req: data.req || false };
        row.innerHTML = `
            <td class="editable" contenteditable="true">${fieldData.mc}</td>
            <td class="editable" contenteditable="true">${fieldData.type}</td>
            <td class="editable" contenteditable="true">${fieldData.len}</td>
            <td class="editable" contenteditable="true">${fieldData.defaultValue}</td>
            <td><input type="checkbox" ${fieldData.pk ? 'checked' : ''}></td>
            <td><input type="checkbox" ${fieldData.req ? 'checked' : ''}></td>
        `;
        const deleteButton = document.createElement('button');
        deleteButton.className = 'delete-row-btn';
        deleteButton.title = 'Eliminar fila';
        deleteButton.innerHTML = '×';
        row.appendChild(deleteButton);
        return row;
    }

    function clearFieldsTable() {
        observer.disconnect();
        fieldsTableBody.innerHTML = '';
        selectedRow = null;
        addNewField(false);
        updateSubscriberKeyFieldOptions();
        observer.observe(fieldsTableBody, observerConfig);
    }

    function createDummyFields() {
        populateFieldsTable([
            { mc: 'NombreCompleto', type: 'Text', len: '100', pk: true, req: true }, 
            { mc: 'SincronizarMC', type: 'Boolean' },
            { mc: 'FechaNacimiento', type: 'Date', defaultValue: 'Now()' }, 
            { mc: 'Recibo', type: 'Decimal', len: '18,2' },
            { mc: 'Telefono', type: 'Phone' }, 
            { mc: 'Email', type: 'EmailAddress', len: '254' },
            { mc: 'Locale', type: 'Locale' }, 
            { mc: 'Numero', type: 'Number' }
        ]);
        populateDeletionPicklist([]);
    }

    function addNewField(observe = true) {
        if (!observe) observer.disconnect();
        fieldsTableBody.appendChild(createTableRow());
        if (!observe) {
            updateSubscriberKeyFieldOptions();
            observer.observe(fieldsTableBody, observerConfig);
        }
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
        if (currentSelection) {
            subscriberKeyFieldSelect.value = currentSelection;
        }
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
    // --- 4. LÓGICA DEL CALENDARIO (REDISEÑADO) ---
    // ==========================================================

    window.viewCalendar = function(){
        showSection('calendario-section');
        populateCalendarYearSelect();
        const savedAutomationsRaw = localStorage.getItem('calendarAutomations');
        if(savedAutomationsRaw) {
            const savedData = JSON.parse(savedAutomationsRaw);
            const currentClient = clientNameInput.value;
            if (savedData.client === currentClient) {
                allAutomations = savedData.automations;
                calendarDataForClient = savedData.client;
                logMessage(`${allAutomations.length} automatizaciones cargadas desde la memoria local para "${currentClient}". Pulsa "Refrescar Datos" para actualizar.`);
                generateCalendar();
            } else {
                allAutomations = [];
                calendarDataForClient = '';
                logMessage(`Los datos del calendario guardados son para el cliente "${savedData.client}". Pulsa "Refrescar Datos" para cargar los de "${currentClient}".`);
                generateCalendar();
            }
        } else {
            allAutomations = [];
            calendarDataForClient = '';
            logMessage('No hay datos de automatizaciones. Pulsa "Refrescar Datos" para empezar.');
            generateCalendar();
        }
    }

    async function macroGetAutomations() {
        blockUI();
        let allRequests = [];
        let allResponses = [];
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
            
            let allItems = [];
            let page = 1;
            let moreResults = true;
            logMessage("Paso 1/3: Obteniendo lista de todas las automatizaciones...");

            const firstUrl = `${config.restUri}automation/v1/automations?$page=${page}`;
            let firstRequestDetails = { step: `Paso 1 (Página ${page})`, endpoint: firstUrl, method: "GET" };
            allRequests.push(firstRequestDetails);
            const firstResponse = await fetch(firstUrl, { headers: { "Authorization": `Bearer ${tokenField.value}` } });
            const firstData = await firstResponse.json();
            if (!firstResponse.ok) throw new Error(firstData.message || "Error al obtener la lista de automatizaciones.");
            allResponses.push({ request: firstRequestDetails, response: firstData });
            allItems = allItems.concat(firstData.items);
            
            const totalPages = Math.ceil(firstData.count / firstData.pageSize);
            if (totalPages > 1) {
                for (page = 2; page <= totalPages; page++) {
                    logMessage(`Paso 1/3: Obteniendo página ${page} de ${totalPages}...`);
                    const url = `${config.restUri}automation/v1/automations?$page=${page}`;
                    const requestDetails = { step: `Paso 1 (Página ${page})`, endpoint: url, method: "GET" };
                    allRequests.push(requestDetails);
                    const response = await fetch(url, { headers: { "Authorization": `Bearer ${tokenField.value}` } });
                    const data = await response.json();
                    if (!response.ok) throw new Error(data.message || "Error al obtener la lista de automatizaciones.");
                    allResponses.push({ request: requestDetails, response: data });
                    allItems = allItems.concat(data.items);
                }
            }

            logMessage(`${allItems.length} automatizaciones encontradas. Filtrando las programadas...`);

            const scheduledItems = allItems.filter(item => item.schedule && (item.schedule.scheduleStatus === 'Scheduled' || item.schedule.scheduleStatus === 'active'));
            logMessage(`${scheduledItems.length} automatizaciones programadas encontradas. Inspeccionando cada una...`);

            const journeyAutomations = [];
            for (let i = 0; i < scheduledItems.length; i++) {
                const item = scheduledItems[i];
                logMessage(`Paso 2/3: Inspeccionando automatización ${i + 1} de ${scheduledItems.length}: "${item.name}"`);
                
                const detailUrl = `${config.restUri}automation/v1/automations/${item.id}`;
                const requestDetails = { step: `Paso 2 (${i+1}/${scheduledItems.length})`, endpoint: detailUrl, method: "GET" };
                allRequests.push(requestDetails);
                
                const detailResponse = await fetch(detailUrl, { headers: { "Authorization": `Bearer ${tokenField.value}` } });
                const detailData = await detailResponse.json();
                allResponses.push({ request: requestDetails, response: detailData });

                if (detailData.steps) {
                    const hasJourneyEntry = detailData.steps.some(step => 
                        step.activities.some(activity => activity.objectTypeId === 952)
                    );
                    if (hasJourneyEntry) {
                        journeyAutomations.push(item);
                    }
                }
            }
            
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

    function processAndStoreAutomations(items) {
        allAutomations = items.map(auto => {
            const dateObj = new Date(auto.schedule.scheduledTime);
            let scheduledTime = "N/A", scheduledHour = "N/A";
            if (!isNaN(dateObj.getTime())) {
                scheduledTime = dateObj.getFullYear() + "-" +
                                ("0" + (dateObj.getMonth() + 1)).slice(-2) + "-" +
                                ("0" + dateObj.getDate()).slice(-2);
                const startOfDST = new Date(dateObj.getFullYear(), 2, 31);
                startOfDST.setDate(31 - startOfDST.getDay());
                const endOfDST = new Date(dateObj.getFullYear(), 9, 31);
                endOfDST.setDate(31 - endOfDST.getDay());
                const madridOffset = (dateObj >= startOfDST && dateObj < endOfDST) ? 2 : 1;
                dateObj.setHours(dateObj.getUTCHours() + madridOffset);
                scheduledHour = ("0" + dateObj.getHours()).slice(-2) + ":" + ("0" + dateObj.getMinutes()).slice(-2);
            }
            return { name: auto.name, status: 'Scheduled', scheduledTime: scheduledTime, scheduledHour: scheduledHour };
        });
    }

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
            const thead = document.createElement("thead");
            const tbody = document.createElement("tbody");
            const headRow = document.createElement("tr");
            days.forEach(day => {
                const th = document.createElement("th");
                th.innerText = day;
                headRow.appendChild(th);
            });
            thead.appendChild(headRow);
            let firstDay = new Date(year, i, 1).getDay();
            firstDay = (firstDay === 0) ? 6 : firstDay - 1;
            const totalDays = new Date(year, i + 1, 0).getDate();
            let row = document.createElement("tr");
            for (let j = 0; j < firstDay; j++) { row.appendChild(document.createElement("td")); }
            for (let day = 1; day <= totalDays; day++) {
                const cell = document.createElement("td");
                cell.innerText = day;
                const currentDate = `${year}-${String(i + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                cell.dataset.date = currentDate;
                const hasAutomation = allAutomations.some(auto => auto.scheduledTime === currentDate);
                if (hasAutomation) cell.classList.add("has-automation");
                cell.addEventListener("click", () => {
                    document.querySelectorAll('.calendar-month td.selected').forEach(c => c.classList.remove('selected'));
                    cell.classList.add('selected');
                    filterAutomationsForDay(cell.dataset.date);
                });
                const dayOfWeek = (firstDay + day - 1) % 7;
                if (dayOfWeek === 5 || dayOfWeek === 6) { cell.classList.add("weekend"); }
                row.appendChild(cell);
                if ((firstDay + day) % 7 === 0) {
                    tbody.appendChild(row);
                    row = document.createElement("tr");
                }
            }
            tbody.appendChild(row);
            table.appendChild(thead);
            table.appendChild(tbody);
            monthDiv.appendChild(table);
            calendarGrid.appendChild(monthDiv);
        }
    }
    
    function filterAutomationsForDay(date) {
        automationList.innerHTML = '';
        const filtered = allAutomations
            .filter(auto => auto.scheduledTime === date)
            .sort((a,b) => a.scheduledHour.localeCompare(b.scheduledHour));
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

    function populateCalendarYearSelect() {
        const currentYear = new Date().getFullYear();
        if(calendarYearSelect.options.length === 0) {
            for (let i = currentYear - 5; i <= currentYear + 5; i++) {
                const option = new Option(i, i);
                calendarYearSelect.appendChild(option);
            }
        }
        calendarYearSelect.value = currentYear;
        generateCalendar();
    }
    
    // ==========================================================
    // --- LÓGICA DE INICIALIZACIÓN Y EVENT LISTENERS ---
    // ==========================================================
    
    document.querySelectorAll('.back-button').forEach(button => {
        button.addEventListener('click', () => {
            mainMenu.style.display = 'flex';
            sections.forEach(s => s.style.display = 'none');
        });
    });

    document.querySelectorAll('.macro-item').forEach(item => {
        logMessage(`Listener agregado`);
        item.addEventListener('click', (e) => {
            e.preventDefault();
            const macroType = e.target.getAttribute('data-macro');
            switch (macroType) {
                case 'docu': showSection('documentacion-section'); break;
                case 'configuracionAPIs': showSection('configuracion-apis-section'); break;
                case 'configuracionDE': showSection('configuracion-de-section'); break;
                case 'campos': showSection('campos-section'); break;
                case 'gestionCampos': showSection('configuracion-campos-section'); break;
                case 'calendario': viewCalendar(); break;
                case 'busquedaDE': showSection('busqueda-de-section'); break;
                case 'validadorEmail': showSection('email-validator-section'); break;
                case 'buscadorOrigenes': showSection('data-source-finder-section'); break;
                default: logMessage(`Función no implementada: ${macroType}`); break;
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
            setFullClientConfig({});
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
    isSendableCheckbox.addEventListener('change', handleSendableChange);
    subscriberKeyFieldSelect.addEventListener('change', () => {
        const selectedOption = subscriberKeyFieldSelect.options[subscriberKeyFieldSelect.selectedIndex];
        subscriberKeyTypeInput.value = (selectedOption && selectedOption.dataset.type) ? selectedOption.dataset.type : '';
    });
    createDummyFieldsBtn.addEventListener('click', createDummyFields);
    createFieldsBtn.addEventListener('click', macroCreateFields);
    getTokenBtn.addEventListener('click', async () => {
        await macroGetToken(false);
    });
    deleteFieldBtn.addEventListener('click', macroDeleteField); 
    createDEBtn.addEventListener('click', macroCreateDE);
    getFieldsBtn.addEventListener('click', macroGetFields);
    clearFieldsBtn.addEventListener('click', clearFieldsTable);
    addFieldBtn.addEventListener('click', () => addNewField(true));
    searchDEBtn.addEventListener('click', macroSearchDE);
    validateEmailBtn.addEventListener('click', macroValidateEmail);
    findDataSourcesBtn.addEventListener('click', macroFindDataSources);
    fieldsTableBody.addEventListener('click', (e) => {
        const deleteButton = e.target.closest('.delete-row-btn');
        const targetRow = e.target.closest('tr');
        if (deleteButton) {
            observer.disconnect();
            const rowToDelete = deleteButton.closest('tr');
            if (rowToDelete === selectedRow) { selectedRow = null; }
            rowToDelete.remove();
            updateSubscriberKeyFieldOptions();
            observer.observe(fieldsTableBody, observerConfig);
        } else if (targetRow) {
            if (targetRow !== selectedRow) {
                document.querySelectorAll('#myTable tbody tr').forEach(r => r.classList.remove('selected'));
                targetRow.classList.add('selected');
                selectedRow = targetRow;
            }
        }
    });
    document.getElementById('moveUp').addEventListener('click', () => {
      if (selectedRow && selectedRow.previousElementSibling) { selectedRow.parentNode.insertBefore(selectedRow, selectedRow.previousElementSibling); }
    });
    document.getElementById('moveDown').addEventListener('click', () => {
      if (selectedRow && selectedRow.nextElementSibling) { selectedRow.parentNode.insertBefore(selectedRow.nextElementSibling, selectedRow); }
    });

    function closeImportModal() {
        importModal.style.display = 'none';
        pasteDataArea.value = '';
        delimiterSelect.value = 'tab';
        customDelimiterInput.classList.add('hidden');
        customDelimiterInput.value = '';
    }
    importFieldsBtn.addEventListener('click', () => {
        importModal.style.display = 'flex';
        pasteDataArea.focus();
    });
    cancelPasteBtn.addEventListener('click', closeImportModal);
    importModal.addEventListener('click', (e) => { if (e.target === importModal) { closeImportModal(); } });
    delimiterSelect.addEventListener('change', () => {
        if(delimiterSelect.value === 'other') {
            customDelimiterInput.classList.remove('hidden');
            customDelimiterInput.focus();
        } else {
            customDelimiterInput.classList.add('hidden');
        }
    });
    processPasteBtn.addEventListener('click', () => {
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
        const newFields = [];
        const lines = text.split('\n');
        lines.forEach(line => {
            if (!line.trim()) return;
            const columns = line.split(delimiter);
            const [name, type, length] = columns.map(c => c.trim());
            if (name && type) { newFields.push({ mc: name, type, len: length || '' }); }
        });
        if (newFields.length > 0) {
            observer.disconnect();
            const firstRow = fieldsTableBody.querySelector('tr');
            if(firstRow && firstRow.textContent.trim() === '×'){ firstRow.remove(); }
            newFields.forEach(fieldData => { fieldsTableBody.appendChild(createTableRow(fieldData)); });
            updateSubscriberKeyFieldOptions();
            observer.observe(fieldsTableBody, observerConfig);
            logMessage(`${newFields.length} campos importados a la tabla.`);
        }
        closeImportModal();
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
            const headerText = header.textContent.trim();
            const isExpanded = header.classList.toggle('active');
            if (isExpanded) {
                content.style.maxHeight = content.scrollHeight + "px";
            } else {
                content.style.maxHeight = 0;
            }
            const collapsibleStates = JSON.parse(localStorage.getItem('collapsibleStates')) || {};
            collapsibleStates[headerText] = isExpanded;
            localStorage.setItem('collapsibleStates', JSON.stringify(collapsibleStates));
        });
    });

    function initializeCollapsibleMenus() {
        const collapsibleStates = JSON.parse(localStorage.getItem('collapsibleStates')) || {};
        collapsibleHeaders.forEach(header => {
            const headerText = header.textContent.trim();
            if (collapsibleStates[headerText] === true) {
                header.classList.add('active');
                const content = header.nextElementSibling;
                content.style.maxHeight = content.scrollHeight + "px";
            }
        });
    }

    calendarYearSelect.addEventListener('change', generateCalendar);
    refreshAutomationsBtn.addEventListener('click', macroGetAutomations);

    function initializeApp() {
        if (localStorage.getItem('logCollapsedState') === 'true') {
            appContainer.classList.add('log-collapsed');
        }
        loadConfigsIntoSelect();
        const lastSelectedClient = localStorage.getItem('lastSelectedClient') || '';
        if (lastSelectedClient) {
            loadAndSyncClientConfig(lastSelectedClient);
        } else {
            setFullClientConfig({});
        }
        clearFieldsTable();
        observer.observe(fieldsTableBody, observerConfig);
        initializeCollapsibleMenus();
        logMessage("Aplicación lista. Esperando acciones...");
    }
    
    initializeApp();
})