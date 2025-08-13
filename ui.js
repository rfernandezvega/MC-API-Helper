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

    // Configuración Data Extension
    const deConfigSection = document.getElementById('configuracion-de-section');
    const deNameInput = document.getElementById('deName');
    const deDescriptionInput = document.getElementById('deDescription');
    const deExternalKeyInput = document.getElementById('deExternalKey');
    const deFolderInput = document.getElementById('deFolder');
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

    // Modal de Importación
    const importFieldsBtn = document.getElementById('importFieldsBtn');
    const importModal = document.getElementById('import-modal');
    const pasteDataArea = document.getElementById('paste-data-area');
    const processPasteBtn = document.getElementById('process-paste-btn');
    const cancelPasteBtn = document.getElementById('cancel-paste-btn');
    const delimiterSelect = document.getElementById('delimiter-select');
    const customDelimiterInput = document.getElementById('custom-delimiter-input');

    // Pestañas de Documentación (NUEVO)
    const tabButtons = document.querySelectorAll('.tab-button');
    const tabContents = document.querySelectorAll('.tab-content');


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

    async function macroGetFieldIds() {
        blockUI();
        try {
            const externalKey = recExternalKeyInput.value.trim();
            if (!externalKey) {
                alert('Por favor, introduce un valor en el campo "External Key de la DE".');
                return logMessage("Operación cancelada: Falta External Key de la DE.");
            }
            logMessage(`Buscando IDs de campos para la DE: ${externalKey}`);
            targetFieldSelect.disabled = true;
            targetFieldSelect.innerHTML = `<option>Recuperando IDs...</option>`;
            
            await macroGetToken(true);
            const token = tokenField.value;
            const soapUri = soapUriInput.value;
            if (!token || !soapUri) throw new Error('No se pudo obtener un token o la SOAP URI no está configurada.');
            const soapPayload = `<s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope" xmlns:a="http://schemas.xmlsoap.org/ws/2004/08/addressing"><s:Header><a:Action s:mustUnderstand="1">Retrieve</a:Action><a:To s:mustUnderstand="1">${soapUri}</a:To><fueloauth xmlns="http://exacttarget.com">${token}</fueloauth></s:Header><s:Body xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema"><RetrieveRequestMsg xmlns="http://exacttarget.com/wsdl/partnerAPI"><RetrieveRequest><ObjectType>DataExtensionField</ObjectType><Properties>Name</Properties><Properties>ObjectID</Properties><Filter xsi:type="SimpleFilterPart"><Property>DataExtension.CustomerKey</Property><SimpleOperator>equals</SimpleOperator><Value>${externalKey}</Value></Filter></RetrieveRequest></RetrieveRequestMsg></s:Body></s:Envelope>`;
            const requestDetails = { endpoint: soapUri, method: "POST", headers: { 'Content-Type': 'text/xml' }, payload: soapPayload.trim() };
            logApiCall(requestDetails);
            logApiResponse('');
            
            const response = await fetch(soapUri, { method: 'POST', headers: { 'Content-Type': 'text/xml' }, body: requestDetails.payload });
            const responseText = await response.text();
            logApiResponse({ status: response.status, statusText: response.statusText, body: responseText });
            
            const fields = await parseSoapFieldsAsync(responseText);
            populateDeletionPicklist(fields);
            logMessage(`${fields.length} IDs de campos recuperados.`);
            
        } catch (error) {
            console.error("Error en macroGetFieldIds:", error);
            logMessage(`Error al recuperar IDs de campos: ${error.message}`);
            targetFieldSelect.innerHTML = `<option>Error al recuperar IDs</option>`;
        } finally {
            targetFieldSelect.disabled = false;
            unblockUI();
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
                logMessage(`Campo "${selectedFieldName}" eliminado con éxito. Refrescando lista...`);
                macroGetFieldIds();
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
                case 'createFields': macroCreateFields(); break;
                case 'getFields': macroGetFields(); break;
                case 'createDE': macroCreateDE(); break;
                default:
                    logMessage(`Función no implementada: ${macroType}`);
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
    clearFieldsBtn.addEventListener('click', clearFieldsTable);
    addFieldBtn.addEventListener('click', () => addNewField(true));

    fieldsTableBody.addEventListener('click', (e) => {
        const deleteButton = e.target.closest('.delete-row-btn');
        const targetRow = e.target.closest('tr');
        if (deleteButton) {
            observer.disconnect();
            const rowToDelete = deleteButton.closest('tr');
            if (rowToDelete === selectedRow) {
                selectedRow = null;
            }
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
      if (selectedRow && selectedRow.previousElementSibling) {
        selectedRow.parentNode.insertBefore(selectedRow, selectedRow.previousElementSibling);
      }
    });
    document.getElementById('moveDown').addEventListener('click', () => {
      if (selectedRow && selectedRow.nextElementSibling) {
        selectedRow.parentNode.insertBefore(selectedRow.nextElementSibling, selectedRow);
      }
    });

    // Lógica del Modal de Importación
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
    importModal.addEventListener('click', (e) => {
        if (e.target === importModal) {
            closeImportModal();
        }
    });

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

        let delimiter = '';
        const selectedDelimiter = delimiterSelect.value;

        if (selectedDelimiter === 'tab') delimiter = '\t';
        else if (selectedDelimiter === 'comma') delimiter = ',';
        else if (selectedDelimiter === 'semicolon') delimiter = ';';
        else if (selectedDelimiter === 'other') {
            delimiter = customDelimiterInput.value;
            if (!delimiter) {
                alert('Por favor, introduce un carácter en el campo "Otro" como separador.');
                return;
            }
        }

        const newFields = [];
        const lines = text.split('\n');

        lines.forEach(line => {
            if (!line.trim()) return;
            const columns = line.split(delimiter);
            const [name, type, length] = columns.map(c => c.trim());

            if (name && type) {
                newFields.push({ mc: name, type, len: length || '' });
            }
        });

        if (newFields.length > 0) {
            observer.disconnect();
            const firstRow = fieldsTableBody.querySelector('tr');
            if(firstRow && firstRow.textContent.trim() === '×'){
                firstRow.remove();
            }

            newFields.forEach(fieldData => {
                fieldsTableBody.appendChild(createTableRow(fieldData));
            });
            updateSubscriberKeyFieldOptions();
            observer.observe(fieldsTableBody, observerConfig);
            logMessage(`${newFields.length} campos importados a la tabla.`);
        }
        
        closeImportModal();
    });
    
    // Lógica de las Pestañas de Documentación
    tabButtons.forEach(button => {
        button.addEventListener('click', () => {
            const tabId = button.getAttribute('data-tab');

            tabButtons.forEach(btn => btn.classList.remove('active'));
            tabContents.forEach(content => content.classList.remove('active'));

            button.classList.add('active');
            document.getElementById(tabId).classList.add('active');
        });
    });

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
        logMessage("Aplicación lista. Esperando acciones...");
    }
    
    initializeApp();
});