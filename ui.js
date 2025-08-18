// Fichero: ui.js
// Descripción: Gestiona toda la lógica de la interfaz de usuario, interacciones del usuario,
// llamadas a la API de Marketing Cloud y manipulación del DOM.

document.addEventListener('DOMContentLoaded', function () {

	// ==========================================================
	// --- 1. DECLARACIÓN DE ELEMENTOS DEL DOM ---
	// ==========================================================
	// Se obtienen referencias a todos los elementos HTML con los que se va a interactuar.
	// Esto se hace una sola vez al cargar la página para optimizar el rendimiento.

	const appContainer = document.querySelector('.app-container');
	const mainMenu = document.getElementById('main-menu');
	const allSections = document.querySelectorAll('#main-content > .section');
	const toggleLogBtn = document.getElementById('toggleLogBtn');
	const logMessagesEl = document.getElementById('log-messages');
	const logRequestEl = document.getElementById('log-request');
	const logResponseEl = document.getElementById('log-response');
	const clientNameInput = document.getElementById('clientName');
	const savedConfigsSelect = document.getElementById('savedConfigs');
	const sidebarClientSelect = document.getElementById('sidebarClientSelect');
	const loginStatusEl = document.getElementById('login-status');
	const authUriInput = document.getElementById('authUri');
	const clientIdInput = document.getElementById('clientId');
	const clientSecretInput = document.getElementById('clientSecret');
	const tokenField = document.getElementById('token');
	const soapUriInput = document.getElementById('soapUri');
	const restUriInput = document.getElementById('restUri');
	const businessUnitInput = document.getElementById('businessUnit');
	const loginBtn = document.getElementById('loginBtn');
	const logoutBtn = document.getElementById('logoutBtn');
	const deNameInput = document.getElementById('deName');
	const deDescriptionInput = document.getElementById('deDescription');
	const deExternalKeyInput = document.getElementById('deExternalKey');
	const deFolderInput = document.getElementById('deFolder');
	const isSendableCheckbox = document.getElementById('isSendable');
	const subscriberKeyFieldSelect = document.getElementById('subscriberKeyField');
	const subscriberKeyTypeInput = document.getElementById('subscriberKeyType');
	const createDEBtn = document.getElementById('createDE');
	const fieldsTableBody = document.querySelector('#myTable tbody');
	const addFieldBtn = document.getElementById('addFieldBtn');
	const createDummyFieldsBtn = document.getElementById('createDummyFieldsBtn');
	const createFieldsBtn = document.getElementById('createFieldsBtn');
	const clearFieldsBtn = document.getElementById('clearFieldsBtn');
	const moveUpBtn = document.getElementById('moveUp');
	const moveDownBtn = document.getElementById('moveDown');
	let selectedRow = null; // Variable para almacenar la fila seleccionada en la tabla de campos.
	const recExternalKeyInput = document.getElementById('recExternalKey');
	const targetFieldSelect = document.getElementById('targetFieldSelect');
	const getFieldsBtn = document.getElementById('getFields');
	const deleteFieldBtn = document.getElementById('deleteField');
	const importFieldsBtn = document.getElementById('importFieldsBtn');
	const importModal = document.getElementById('import-modal');
	const pasteDataArea = document.getElementById('paste-data-area');
	const processPasteBtn = document.getElementById('process-paste-btn');
	const cancelPasteBtn = document.getElementById('cancel-paste-btn');
	const delimiterSelect = document.getElementById('delimiter-select');
	const customDelimiterInput = document.getElementById('custom-delimiter-input');
	const searchDEBtn = document.getElementById('searchDEBtn');
	const deSearchProperty = document.getElementById('deSearchProperty');
	const deSearchValue = document.getElementById('deSearchValue');
	const deSearchResults = document.getElementById('de-search-results');
	const validateEmailBtn = document.getElementById('validateEmailBtn');
	const emailToValidateInput = document.getElementById('emailToValidate');
	const emailValidationResults = document.getElementById('email-validation-results');
	const findDataSourcesBtn = document.getElementById('findDataSourcesBtn');
	const deNameToFindInput = document.getElementById('deNameToFind');
	const dataSourcesTbody = document.getElementById('data-sources-tbody');
	const tabButtons = document.querySelectorAll('.tab-button');
	const tabContents = document.querySelectorAll('.tab-content');
	const collapsibleHeaders = document.querySelectorAll('.collapsible-header');
	const calendarGrid = document.getElementById('calendar-grid');
	const calendarYearSelect = document.getElementById('calendarYearSelect');
	const automationList = document.getElementById('automation-list');
	const refreshAutomationsBtn = document.getElementById('refreshAutomationsBtn');
	let allAutomations = []; // Almacena los datos de las automatizaciones para el calendario.
	let calendarDataForClient = ''; // Guarda el nombre del cliente para el que se cargaron los datos del calendario.

	// Observer para detectar cambios en la tabla de campos y actualizar dinámicamente el desplegable de Subscriber Key.
	const observer = new MutationObserver(updateSubscriberKeyFieldOptions);
	const observerConfig = {
		childList: true, // Observar adición/eliminación de filas.
		subtree: true, // Observar cambios en el contenido de las celdas.
		characterData: true // Observar cambios en el texto de las celdas.
	};

	// ==========================================================
	// --- 2. GESTIÓN DE LOGS Y ESTADO DE LA UI ---
	// ==========================================================

	/** Muestra un mensaje en el panel de log. @param {string} message */
	function logMessage(message) {
		// Escribe un mensaje informativo en el bloque de "Mensajes" del log.
		if (logMessagesEl) logMessagesEl.textContent = message;
	}

	/** Muestra una llamada a la API en el panel de log. @param {object|string} requestData */
	function logApiCall(requestData) {
		// Muestra el cuerpo de una petición a la API en el bloque "Llamada API", formateado como JSON si es un objeto.
		if (logRequestEl) logRequestEl.textContent = (typeof requestData === 'object') ? JSON.stringify(requestData, null, 2) : requestData;
	}

	/** Muestra una respuesta de la API en el panel de log. @param {object|string} responseData */
	function logApiResponse(responseData) {
		// Muestra el cuerpo de una respuesta de la API en el bloque "Respuesta API", formateado como JSON.
		if (logResponseEl) logResponseEl.textContent = (typeof responseData === 'object') ? JSON.stringify(responseData, null, 2) : responseData;
	}

	/** Bloquea la UI para prevenir interacciones durante una operación. */
	function blockUI() {
		// Añade una clase al contenedor principal para aplicar estilos de "cargando" (opacidad, cursor) y desenfoca el elemento activo.
		if (document.activeElement) document.activeElement.blur();
		appContainer.classList.add('is-updating');
		document.body.style.cursor = 'wait';
	}

	/** Desbloquea la UI una vez que la operación ha finalizado. */
	function unblockUI() {
		// Elimina la clase de "cargando" para restaurar la interactividad y el cursor por defecto.
		appContainer.classList.remove('is-updating');
		document.body.style.cursor = 'default';
	}

	/**
	 * Muestra una sección específica del contenido principal y oculta las demás.
	 * @param {string} sectionId - El ID de la sección a mostrar.
	 */
	window.showSection = function (sectionId) {
		// Oculta el menú principal y todas las secciones.
		mainMenu.style.display = 'none';
		allSections.forEach(s => s.style.display = 'none');
		// Muestra solo la sección solicitada.
		const sectionToShow = document.getElementById(sectionId);
		if (sectionToShow) sectionToShow.style.display = 'flex';
	};

	/**
	 * Actualiza el indicador visual de estado de la sesión.
	 * @param {boolean} isLoggedIn - True si la sesión está activa.
	 * @param {string} [clientName=''] - El nombre del cliente para mostrar.
	 */
	function updateLoginStatus(isLoggedIn, clientName = '') {
		// Cambia el texto y el color del indicador de sesión en la barra lateral.
		if (isLoggedIn) {
			loginStatusEl.textContent = `🟢 Sesión activa: ${clientName}`;
			loginStatusEl.className = 'login-status active';
		} else {
			loginStatusEl.textContent = '🔴 Sesión no iniciada';
			loginStatusEl.className = 'login-status inactive';
		}
	}


	// ==========================================================
	// --- 3. GESTIÓN DE CONFIGURACIÓN Y SESIÓN ---
	// ==========================================================

	/**
	 * Recoge los valores del formulario que son seguros para guardar en localStorage.
	 * OMITE el clientSecret y los valores derivados como el token.
	 * @returns {object} Un objeto con la configuración segura del cliente.
	 */
	const getConfigToSave = () => ({
		// Crea un objeto con todos los valores de los formularios, EXCEPTO el Client Secret.
		// Esto es lo que se guarda en el almacenamiento local para no exponer credenciales sensibles.
		businessUnit: businessUnitInput.value,
		authUri: authUriInput.value,
		clientId: clientIdInput.value,
		deName: deNameInput.value,
		deDescription: deDescriptionInput.value,
		deExternalKey: deExternalKeyInput.value,
		deFolder: deFolderInput.value,
		isSendable: isSendableCheckbox.checked,
		subscriberKeyField: subscriberKeyFieldSelect.value,
		subscriberKeyType: subscriberKeyTypeInput.value,
		recExternalKey: recExternalKeyInput.value
	});

	/**
	 * Rellena los campos del formulario con una configuración dada. Limpia los campos sensibles.
	 * @param {object} config - El objeto de configuración a cargar.
	 */
	const setClientConfigForm = (config) => {
		// Rellena todos los campos de los formularios con los datos de un objeto de configuración.
		businessUnitInput.value = config.businessUnit || '';
		authUriInput.value = config.authUri || '';
		clientIdInput.value = config.clientId || '';
		deNameInput.value = config.deName || '';
		deDescriptionInput.value = config.deDescription || '';
		deExternalKeyInput.value = config.deExternalKey || '';
		deFolderInput.value = config.deFolder || '';
		isSendableCheckbox.checked = config.isSendable || false;
		subscriberKeyFieldSelect.value = config.subscriberKeyField || '';
		subscriberKeyTypeInput.value = config.subscriberKeyType || '';
		recExternalKeyInput.value = config.recExternalKey || '';

		// Asegura que los campos sensibles o derivados siempre se limpien al cargar una configuración.
		tokenField.value = '';
		soapUriInput.value = '';
		restUriInput.value = '';
		clientSecretInput.value = '';
		// Actualiza el estado de los campos relacionados con "Sendable".
		handleSendableChange();
	};

	/** Carga todas las configuraciones guardadas y las muestra en los <select>. */
	const loadConfigsIntoSelect = () => {
		// Lee las configuraciones guardadas desde el almacenamiento local del navegador.
		const configs = JSON.parse(localStorage.getItem('mcApiConfigs')) || {};
		const currentValue = sidebarClientSelect.value || savedConfigsSelect.value;
		// Limpia y vuelve a poblar los dos menús desplegables de selección de cliente.
		savedConfigsSelect.innerHTML = '<option value="">Seleccionar configuración...</option>';
		sidebarClientSelect.innerHTML = '<option value="">Ninguno seleccionado</option>';
		for (const name in configs) {
			savedConfigsSelect.appendChild(new Option(name, name));
			sidebarClientSelect.appendChild(new Option(name, name));
		}
		// Restaura la selección que estaba activa antes de recargar.
		savedConfigsSelect.value = currentValue;
		sidebarClientSelect.value = currentValue;
	};

	/**
	 * Carga la configuración de un cliente, la aplica a los formularios y sincroniza los <select>.
	 * @param {string} clientName - El nombre del cliente a cargar.
	 */
	function loadAndSyncClientConfig(clientName) {
		const configs = JSON.parse(localStorage.getItem('mcApiConfigs')) || {};

		// 1. SIEMPRE resetea el estado de la sesión en la UI al cambiar de cliente.
		//    Esto da feedback inmediato al usuario y evita mostrar un estado incorrecto.
		tokenField.value = '';
		soapUriInput.value = '';
		restUriInput.value = '';
		updateLoginStatus(false); // Muestra "Sesión no iniciada" por defecto.

		// Limpia los datos del calendario
		clearCalendarData();

		if (clientName) {
			blockUI(); 

			// 2. Carga la configuración del cliente seleccionado desde localStorage.
			const configToLoad = configs[clientName] || {};
			setClientConfigForm(configToLoad);

			// 3. Sincroniza el nombre y los selectores.
			clientNameInput.value = clientName;
			savedConfigsSelect.value = clientName;
			sidebarClientSelect.value = clientName;

			// 4. Ahora, intenta obtener el token para el nuevo cliente.
			logMessage(`Cliente "${clientName}" cargado. Comprobando sesión...`);
			getAuthenticatedConfig()
				.catch(() => {
					// Si getAuthenticatedConfig falla, el estado ya es 'inactive'
					// y se mostrará un error en el log, por lo que no hay que hacer nada más aquí.
				})
				.finally(() => {
					unblockUI(); // Desbloquea la UI CUANDO TERMINE (éxito o error)
				});
		} else {
			// 5. Si se selecciona "Ninguno", limpia todos los formularios.
			setClientConfigForm({});
			clientNameInput.value = '';
			savedConfigsSelect.value = '';
			sidebarClientSelect.value = '';
			logMessage("Ningún cliente seleccionado.");
		}
	}

	// ==========================================================
	// --- 4. LÓGICA DE API (MACROS) ---
	// ==========================================================

	/**
	 * Punto de entrada para obtener la configuración de API validada y lista para usar.
	 * Pide al proceso principal un token, que se encargará de refrescarlo si es necesario.
	 * @returns {Promise<object>} Un objeto con { accessToken, soapUri, restUri }.
	 * @throws {Error} Si no se puede obtener la configuración.
	 */
	async function getAuthenticatedConfig() {
		// 1. Verifica que haya un cliente seleccionado.
		const clientName = clientNameInput.value.trim();
		if (!clientName) {
			throw new Error("No hay ningún cliente seleccionado.");
		}

		// 2. Solicita la configuración de API (incluyendo el token) al proceso principal (main.js).
		// El proceso principal gestiona de forma segura si el token es válido, ha expirado o necesita ser refrescado.
		const apiConfig = await window.electronAPI.getApiConfig(clientName);

		// 3. Si no se devuelve un token, la sesión no es válida.
		if (!apiConfig || !apiConfig.accessToken) {
			updateLoginStatus(false); // Actualiza el indicador visual a "no iniciada".
			throw new Error("Sesión no activa. Por favor, inicia sesión.");
		}

		// 4. Si se obtiene un token, se rellenan los campos de la UI y se actualiza el estado a "activa".
		tokenField.value = apiConfig.accessToken;
		soapUriInput.value = apiConfig.soapUri;
		restUriInput.value = apiConfig.restUri;
		updateLoginStatus(true, clientName);

		// 5. Devuelve la configuración para ser usada por la macro que la solicitó.
		return apiConfig;
	}

	/**
	 * Construye la porción XML para un único campo de Data Extension.
	 * @param {object} fieldData - Datos del campo (name, type, length, etc.).
	 * @returns {string} La cadena XML para el campo.
	 */
	function buildFieldXml(fieldData) {
		// Desestructura el objeto del campo para acceder a sus propiedades.
		const {
			name,
			type,
			length,
			defaultValue,
			isPrimaryKey,
			isRequired
		} = fieldData;
		let fieldXml = '';
		// Nodos XML comunes a todos los tipos de campo.
		const commonNodes = `<CustomerKey>${name}</CustomerKey><Name>${name}</Name><IsRequired>${isRequired}</IsRequired><IsPrimaryKey>${isPrimaryKey}</IsPrimaryKey>`;
		const defaultValueNode = defaultValue ? `<DefaultValue>${defaultValue}</DefaultValue>` : '';

		// Construye el XML específico según el tipo de campo.
		switch (type.toLowerCase()) {
		case 'text':
			fieldXml = `<Field>${commonNodes}<FieldType>Text</FieldType>${length ? `<MaxLength>${length}</MaxLength>` : ''}${defaultValueNode}</Field>`;
			break;
		case 'number':
			fieldXml = `<Field>${commonNodes}<FieldType>Number</FieldType>${defaultValueNode}</Field>`;
			break;
		case 'date':
			fieldXml = `<Field>${commonNodes}<FieldType>Date</FieldType>${defaultValueNode}</Field>`;
			break;
		case 'boolean':
			fieldXml = `<Field>${commonNodes}<FieldType>Boolean</FieldType>${defaultValueNode}</Field>`;
			break;
		case 'emailaddress':
			fieldXml = `<Field>${commonNodes}<FieldType>EmailAddress</FieldType></Field>`;
			break;
		case 'phone':
			fieldXml = `<Field>${commonNodes}<FieldType>Phone</FieldType></Field>`;
			break;
		case 'locale':
			fieldXml = `<Field>${commonNodes}<FieldType>Locale</FieldType></Field>`;
			break;
		case 'decimal':
			// Para campos decimales, la longitud se divide en total de dígitos y número de decimales.
			const [maxLength, scale] = (length || ',')
			.split(',')
				.map(s => s.trim());
			fieldXml = `<Field>${commonNodes}<FieldType>Decimal</FieldType>${maxLength ? `<MaxLength>${maxLength}</MaxLength>` : ''}${scale ? `<Scale>${scale}</Scale>` : ''}${defaultValueNode}</Field>`;
			break;
		default:
			return '';
		}
		// Limpia espacios en blanco y devuelve el XML del campo.
		return fieldXml.replace(/\s+/g, ' ')
			.trim();
	}

	/** Crea una Data Extension usando la API SOAP. */
	async function macroCreateDE() {
		blockUI(); // Bloquea la UI para evitar interacciones.
		try {
			logMessage("Iniciando creación de Data Extension...");
			// Obtiene la configuración autenticada (token, etc.). Falla si la sesión no está activa.
			const apiConfig = await getAuthenticatedConfig();

			// Recoge y valida los datos del formulario.
			const deName = deNameInput.value.trim();
			const deExternalKey = deExternalKeyInput.value.trim();
			if (!deName || !deExternalKey) throw new Error('El Nombre y la External Key son obligatorios.');

			const isSendable = isSendableCheckbox.checked;
			const subscriberKey = subscriberKeyFieldSelect.value;
			if (isSendable && !subscriberKey) throw new Error('Para una DE enviable, seleccione un Campo SubscriberKey.');

			// Recoge los campos definidos en la tabla.
			const validFieldsData = getFieldsDataFromTable();
			if (validFieldsData.length === 0) throw new Error('La DE debe tener al menos un campo.');

			// Construye las diferentes partes del payload SOAP.
			const clientXml = businessUnitInput.value.trim() ? `<Client><ClientID>${businessUnitInput.value.trim()}</ClientID></Client>` : '';
			const descriptionXml = deDescriptionInput.value.trim() ? `<Description>${deDescriptionInput.value.trim()}</Description>` : '';
			const folderXml = deFolderInput.value.trim() ? `<CategoryID>${deFolderInput.value.trim()}</CategoryID>` : '';
			const sendableXml = isSendable ? `<SendableDataExtensionField><CustomerKey>${subscriberKey}</CustomerKey><Name>${subscriberKey}</Name><FieldType>${subscriberKeyTypeInput.value.trim()}</FieldType></SendableDataExtensionField><SendableSubscriberField><Name>Subscriber Key</Name><Value/></SendableSubscriberField>` : '';
			const fieldsXmlString = validFieldsData.map(buildFieldXml)
				.join('');

			// Ensambla el payload SOAP completo.
			const soapPayload = `<s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope" xmlns:a="http://schemas.xmlsoap.org/ws/2004/08/addressing"><s:Header><a:Action s:mustUnderstand="1">Create</a:Action><a:To s:mustUnderstand="1">${apiConfig.soapUri}</a:To><fueloauth xmlns="http://exacttarget.com">${apiConfig.accessToken}</fueloauth></s:Header><s:Body xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema"><CreateRequest xmlns="http://exacttarget.com/wsdl/partnerAPI"><Objects xsi:type="DataExtension">${clientXml}<CustomerKey>${deExternalKey}</CustomerKey>${descriptionXml}<Name>${deName}</Name>${folderXml}<IsSendable>${isSendable}</IsSendable>${sendableXml}<Fields>${fieldsXmlString}</Fields></Objects></CreateRequest></s:Body></s:Envelope>`;

			// Ejecuta la petición SOAP.
			await executeSoapRequest(apiConfig.soapUri, soapPayload.trim(), `¡Data Extension "${deName}" creada con éxito!`);

		} catch (error) {
			// Maneja cualquier error durante el proceso.
			logMessage(`Error al crear la Data Extension: ${error.message}`);
			alert(`Error: ${error.message}`);
		} finally {
			// Desbloquea la UI independientemente del resultado.
			unblockUI();
		}
	}

	/** Crea o actualiza campos en una Data Extension existente. */
	async function macroCreateFields() {
		blockUI();
		try {
			logMessage(`Iniciando creación/actualización de campos...`);
			const apiConfig = await getAuthenticatedConfig();

			// Valida que se haya especificado una DE de destino.
			const externalKey = recExternalKeyInput.value.trim();
			if (!externalKey) throw new Error('Defina una "External Key de la DE" en "Gestión de Campos".');

			// Obtiene los campos de la tabla.
			const validFieldsData = getFieldsDataFromTable();
			if (validFieldsData.length === 0) throw new Error('No hay campos válidos en la tabla.');

			// Construye el XML de los campos y el payload SOAP de tipo "Update".
			const fieldsXmlString = validFieldsData.map(buildFieldXml)
				.join('');
			const soapPayload = `<s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope" xmlns:a="http://schemas.xmlsoap.org/ws/2004/08/addressing"><s:Header><a:Action s:mustUnderstand="1">Update</a:Action><a:To s:mustUnderstand="1">${apiConfig.soapUri}</a:To><fueloauth xmlns="http://exacttarget.com">${apiConfig.accessToken}</fueloauth></s:Header><s:Body xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema"><UpdateRequest xmlns="http://exacttarget.com/wsdl/partnerAPI"><Objects xsi:type="DataExtension"><CustomerKey>${externalKey}</CustomerKey><Fields>${fieldsXmlString}</Fields></Objects></UpdateRequest></s:Body></s:Envelope>`;

			// Ejecuta la petición.
			await executeSoapRequest(apiConfig.soapUri, soapPayload.trim(), `¡Éxito! ${validFieldsData.length} campos creados/actualizados.`);

		} catch (error) {
			logMessage(`Error al crear los campos: ${error.message}`);
			alert(`Error: ${error.message}`);
		} finally {
			unblockUI();
		}
	}

	/** Recupera todos los campos de una Data Extension y los muestra en la tabla. */
	async function macroGetFields() {
		blockUI();
		try {
			const apiConfig = await getAuthenticatedConfig();

			const externalKey = recExternalKeyInput.value.trim();
			if (!externalKey) throw new Error('Introduzca la "External Key de la DE".');
			logMessage(`Recuperando campos para la DE: ${externalKey}`);

			// Construye la petición SOAP de tipo "Retrieve" para el objeto "DataExtensionField".
			const soapPayload = `<s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope" xmlns:a="http://schemas.xmlsoap.org/ws/2004/08/addressing"><s:Header><a:Action s:mustUnderstand="1">Retrieve</a:Action><a:To s:mustUnderstand="1">${apiConfig.soapUri}</a:To><fueloauth xmlns="http://exacttarget.com">${apiConfig.accessToken}</fueloauth></s:Header><s:Body xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema"><RetrieveRequestMsg xmlns="http://exacttarget.com/wsdl/partnerAPI"><RetrieveRequest><ObjectType>DataExtensionField</ObjectType><Properties>Name</Properties><Properties>ObjectID</Properties><Properties>CustomerKey</Properties><Properties>FieldType</Properties><Properties>IsPrimaryKey</Properties><Properties>IsRequired</Properties><Properties>MaxLength</Properties><Properties>Ordinal</Properties><Properties>Scale</Properties><Properties>DefaultValue</Properties><Filter xsi:type="SimpleFilterPart"><Property>DataExtension.CustomerKey</Property><SimpleOperator>equals</SimpleOperator><Value>${externalKey}</Value></Filter></RetrieveRequest></RetrieveRequestMsg></s:Body></s:Envelope>`;

			// Registra y ejecuta la llamada.
			const requestDetails = {
				endpoint: apiConfig.soapUri,
				method: "POST",
				headers: {
					'Content-Type': 'text/xml'
				},
				payload: soapPayload.trim()
			};
			logApiCall(requestDetails);
			const responseText = await (await fetch(apiConfig.soapUri, {
					method: 'POST',
					headers: {
						'Content-Type': 'text/xml'
					},
					body: requestDetails.payload
				}))
				.text();
			logApiResponse({
				body: responseText
			});

			// Parsea la respuesta XML para obtener un array de objetos de campo.
			const fields = await parseFullSoapFieldsAsync(responseText);
			if (fields.length > 0) {
				// Si se encuentran campos, puebla la tabla y el desplegable de borrado.
				populateFieldsTable(fields);
				populateDeletionPicklist(fields);
				logMessage(`${fields.length} campos recuperados.`);
			} else {
				// Si no, limpia la UI.
				clearFieldsTable();
				populateDeletionPicklist([]);
				logMessage('Llamada exitosa pero no se encontraron campos.');
			}
		} catch (error) {
			logMessage(`Error al recuperar campos: ${error.message}`);
			alert(`Error: ${error.message}`);
		} finally {
			unblockUI();
		}
	}

	/** Elimina un campo específico de una Data Extension. */
	async function macroDeleteField() {
		blockUI();
		try {
			const apiConfig = await getAuthenticatedConfig();

			const externalKey = recExternalKeyInput.value.trim();
			const fieldObjectId = targetFieldSelect.value;
			const selectedFieldName = targetFieldSelect.selectedOptions[0]?.text;
			if (!externalKey || !fieldObjectId) throw new Error('Introduzca la External Key y seleccione un campo a eliminar.');

			// Muestra una confirmación antes de una acción destructiva.
			if (!confirm(`¿Seguro que quieres eliminar el campo "${selectedFieldName}"? Esta acción no se puede deshacer.`)) return;

			logMessage(`Iniciando borrado del campo "${selectedFieldName}"...`);
			// Construye el payload SOAP de tipo "Delete".
			const soapPayload = `<s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope" xmlns:a="http://schemas.xmlsoap.org/ws/2004/08/addressing"><s:Header><fueloauth xmlns="http://exacttarget.com">${apiConfig.accessToken}</fueloauth><a:Action s:mustUnderstand="1">Delete</a:Action><a:To s:mustUnderstand="1">${apiConfig.soapUri}</a:To></s:Header><s:Body xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><DeleteRequest xmlns="http://exacttarget.com/wsdl/partnerAPI"><Objects xsi:type="DataExtension"><CustomerKey>${externalKey}</CustomerKey><Fields><Field><ObjectID>${fieldObjectId}</ObjectID></Field></Fields></Objects></DeleteRequest></s:Body></s:Envelope>`;

			await executeSoapRequest(apiConfig.soapUri, soapPayload.trim(), `Campo "${selectedFieldName}" eliminado.`);
			// Refresca la lista de campos para reflejar el cambio.
			macroGetFields();
		} catch (error) {
			logMessage(`Error al eliminar el campo: ${error.message}`);
			alert(`Error: ${error.message}`);
		} finally {
			unblockUI();
		}
	}

	/** Busca una Data Extension por nombre o clave externa y muestra su ruta completa. */
	async function macroSearchDE() {
		blockUI();
		deSearchResults.textContent = 'Buscando...';
		try {
			const apiConfig = await getAuthenticatedConfig();
			const property = deSearchProperty.value;
			const value = deSearchValue.value.trim();
			if (!value) throw new Error("El campo 'Valor' no puede estar vacío.");
			logMessage(`Buscando DE por ${property}: ${value}`);

			// Petición para encontrar la DE y obtener su CategoryID (ID de carpeta).
			const soapPayload = `<s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope" xmlns:a="http://schemas.xmlsoap.org/ws/2004/08/addressing"><s:Header><a:Action s:mustUnderstand="1">Retrieve</a:Action><a:To s:mustUnderstand="1">${apiConfig.soapUri}</a:To><fueloauth xmlns="http://exacttarget.com">${apiConfig.accessToken}</fueloauth></s:Header><s:Body xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema"><RetrieveRequestMsg xmlns="http://exacttarget.com/wsdl/partnerAPI"><RetrieveRequest><ObjectType>DataExtension</ObjectType><Properties>Name</Properties><Properties>CategoryID</Properties><Filter xsi:type="SimpleFilterPart"><Property>${property}</Property><SimpleOperator>equals</SimpleOperator><Value>${value}</Value></Filter></RetrieveRequest></RetrieveRequestMsg></s:Body></s:Envelope>`;
			logApiCall({
				endpoint: apiConfig.soapUri,
				payload: soapPayload
			});

			const responseText = await (await fetch(apiConfig.soapUri, {
					method: 'POST',
					headers: {
						'Content-Type': 'text/xml'
					},
					body: soapPayload
				}))
				.text();
			logApiResponse({
				body: responseText
			});

			// Parsea la respuesta para obtener el ID de la carpeta.
			const deInfo = await parseDESearchResponse(responseText);
			if (deInfo.error) throw new Error(deInfo.error);

			// Si no hay ID de carpeta, está en la raíz.
			if (!deInfo.categoryId || parseInt(deInfo.categoryId) === 0) {
				deSearchResults.textContent = `Data Extensions > ${deInfo.deName}`;
				return;
			}

			// Si tiene ID de carpeta, llama a la función recursiva para obtener la ruta completa.
			logMessage(`DE encontrada. Carpeta ID: ${deInfo.categoryId}. Recuperando ruta...`);
			const folderPath = await getFolderPath(deInfo.categoryId, apiConfig);
			deSearchResults.textContent = `${folderPath} > ${deInfo.deName}`;
		} catch (error) {
			logMessage(`Error al buscar la DE: ${error.message}`);
			deSearchResults.textContent = `Error: ${error.message}`;
		} finally {
			unblockUI();
		}
	}

	/** Valida una dirección de correo electrónico utilizando la API REST. */
	async function macroValidateEmail() {
		blockUI();
		emailValidationResults.textContent = 'Validando...';
		try {
			const apiConfig = await getAuthenticatedConfig();
			const emailToValidate = emailToValidateInput.value.trim();
			if (!emailToValidate) throw new Error("Introduzca un email para validar.");
			logMessage(`Validando email: ${emailToValidate}`);

			// Construye la llamada a la API REST de validación de email.
			const validateUrl = `${apiConfig.restUri}address/v1/validateEmail`;
			const payload = {
				"email": emailToValidate,
				"validators": ["SyntaxValidator", "MXValidator", "ListDetectiveValidator"]
			};
			const requestDetails = {
				endpoint: validateUrl,
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					"Authorization": `Bearer ${apiConfig.accessToken}`
				},
				body: payload
			};
			logApiCall(requestDetails);

			// Ejecuta la llamada REST.
			const response = await fetch(validateUrl, {
				method: 'POST',
				headers: requestDetails.headers,
				body: JSON.stringify(payload)
			});
			const responseData = await response.json();
			logApiResponse({
				status: response.status,
				body: responseData
			});

			if (!response.ok) throw new Error(responseData.message || `Error API: ${response.status}`);

			// Muestra el resultado de la validación.
			emailValidationResults.textContent = responseData.valid ?
				`El email "${responseData.email}" es VÁLIDO.` :
				`El email "${responseData.email}" es INVÁLIDO.\nRazón: ${responseData.failedValidation}`;
		} catch (error) {
			logMessage(`Error al validar el email: ${error.message}`);
			emailValidationResults.textContent = `Error: ${error.message}`;
		} finally {
			unblockUI();
		}
	}

	/** Busca todas las actividades (Imports, Queries) que tienen como destino una DE. */
	async function macroFindDataSources() {
		blockUI();
		dataSourcesTbody.innerHTML = '<tr><td colspan="6">Buscando...</td></tr>';
		try {
			const apiConfig = await getAuthenticatedConfig();
			const deName = deNameToFindInput.value.trim();
			if (!deName) throw new Error('Introduzca el nombre de la Data Extension.');
			logMessage(`Buscando orígenes para la DE: "${deName}"`);

			// 1. Obtiene el ObjectID de la DE, necesario para buscar Imports.
			const deDetails = await getDeObjectId(deName, apiConfig);
			logMessage(`ObjectID de la DE: ${deDetails.ObjectID}`);

			// 2. Ejecuta en paralelo las búsquedas de Imports y Queries para mayor eficiencia.
			const [imports, queries] = await Promise.all([
				findImportsForDE(deDetails.ObjectID, apiConfig),
				findQueriesForDE(deName, apiConfig) // Las queries se buscan por nombre de DE, no ObjectID.
			]);

			// 3. Combina los resultados, los ordena y los muestra en la tabla.
			const allSources = [...imports, ...queries].sort((a, b) => a.name.localeCompare(b.name));
			renderDataSourcesTable(allSources);
			logMessage(`Búsqueda completada. Se encontraron ${allSources.length} actividades.`);
		} catch (error) {
			logMessage(`Error al buscar orígenes: ${error.message}`);
			dataSourcesTbody.innerHTML = `<tr><td colspan="6" style="color: red;">Error: ${error.message}</td></tr>`;
		} finally {
			unblockUI();
		}
	}

	/** Obtiene automatizaciones, las filtra y las muestra en el calendario. */
	async function macroGetAutomations() {
		blockUI();
		// 1. Se inicializan arrays para recolectar todas las llamadas y respuestas para el log final.
		let allRequests = [];
		let allResponses = [];

		logMessage("Iniciando recuperación de automatizaciones...");
		logApiCall(''); // Limpia logs previos.
		logApiResponse('');

		try {
			const apiConfig = await getAuthenticatedConfig();
			const currentClient = clientNameInput.value;

			let allItems = [];
			let page = 1;
			let totalPages = 1;

			// 2. Logging en tiempo real para la paginación de automatizaciones.
			logMessage("Paso 1/3: Obteniendo lista de todas las automatizaciones...");

			// Bucle para recorrer todas las páginas de resultados de la API.
			do {
				if (page > 1) {
					logMessage(`Paso 1/3: Obteniendo página ${page} de ${totalPages}...`);
				}
				const url = `${apiConfig.restUri}automation/v1/automations?$page=${page}`;

				// Registra cada llamada individualmente para el log.
				const requestDetails = {
					step: `Paso 1 (Página ${page})`,
					endpoint: url,
					method: "GET"
				};
				allRequests.push(requestDetails);

				const response = await fetch(url, {
					headers: {
						"Authorization": `Bearer ${apiConfig.accessToken}`
					}
				});
				const data = await response.json();

				// Registra cada respuesta individualmente.
				allResponses.push({
					request: requestDetails,
					response: data
				});

				if (!response.ok) throw new Error(data.message || "Error al obtener la lista de automatizaciones.");

				allItems.push(...data.items); // Añade los items de la página actual al total.
				totalPages = Math.ceil(data.count / data.pageSize);
				page++;
			} while (page <= totalPages);

			logMessage(`${allItems.length} automatizaciones encontradas. Filtrando las programadas...`);
			// Filtra solo las automatizaciones que tienen una programación activa.
			const scheduledItems = allItems.filter(item => item.schedule && (item.schedule.scheduleStatus === 'Scheduled' || item.schedule.scheduleStatus === 'active'));

			logMessage(`${scheduledItems.length} automatizaciones programadas encontradas. Paso 2/3: Inspeccionando cada una...`);
			const journeyAutomations = [];

			// 3. Logging en tiempo real para la inspección de cada automatización.
			// Se itera sobre las automatizaciones programadas para ver si contienen una actividad de Journey.
			for (let i = 0; i < scheduledItems.length; i++) {
				const item = scheduledItems[i];
				logMessage(`Paso 2/3: Inspeccionando automatización ${i + 1} de ${scheduledItems.length}: "${item.name}"`);

				const detailUrl = `${apiConfig.restUri}automation/v1/automations/${item.id}`;
				const requestDetails = {
					step: `Paso 2 (${i+1}/${scheduledItems.length})`,
					endpoint: detailUrl,
					method: "GET"
				};
				allRequests.push(requestDetails);

				const detailResponse = await fetch(detailUrl, {
					headers: {
						"Authorization": `Bearer ${apiConfig.accessToken}`
					}
				});
				const detailData = await detailResponse.json();
				allResponses.push({
					request: requestDetails,
					response: detailData
				});

				// objectTypeId === 952 corresponde a una actividad de "Journey Entry".
				if (detailData.steps?.some(step => step.activities.some(activity => activity.objectTypeId === 952))) {
					journeyAutomations.push(item);
				}
			}

			logMessage(`Paso 3/3: ${journeyAutomations.length} automatizaciones de Journeys encontradas. Procesando y guardando...`);
			processAndStoreAutomations(journeyAutomations); // Procesa los datos para el calendario.

			// Guarda los datos en el almacenamiento local para no tener que recargarlos cada vez.
			localStorage.setItem('calendarAutomations', JSON.stringify({
				client: currentClient,
				automations: allAutomations
			}));
			calendarDataForClient = currentClient;

			logMessage("Datos de automatizaciones actualizados y guardados localmente.");
			generateCalendar(); // Redibuja el calendario con los nuevos datos.

		} catch (error) {
			logMessage(`Error al recuperar automatizaciones: ${error.message}`);
			alert(`Error al recuperar automatizaciones: ${error.message}`);
		} finally {
			// 4. Al final del proceso, se muestran todas las llamadas y respuestas agrupadas en el log.
			logApiCall(allRequests);
			logApiResponse(allResponses);
			unblockUI();
		}
	}


	// ==========================================================
	// --- 5. FUNCIONES AUXILIARES (HELPERS) ---
	// ==========================================================

	/** Ejecuta una petición SOAP genérica y maneja la respuesta. */
	async function executeSoapRequest(soapUri, soapPayload, successMessage) {
		// Esta función centraliza la lógica para hacer llamadas SOAP.
		logApiCall({
			endpoint: soapUri,
			payload: soapPayload
		});
		logApiResponse('');
		const responseText = await (await fetch(soapUri, {
				method: 'POST',
				headers: {
					'Content-Type': 'text/xml'
				},
				body: soapPayload
			}))
			.text();
		logApiResponse({
			body: responseText
		});
		// Comprueba si la respuesta contiene un estado general "OK".
		if (responseText.includes('<OverallStatus>OK</OverallStatus>')) {
			logMessage(successMessage);
			alert(successMessage);
			return responseText;
		} else {
			// Si no es "OK", intenta extraer el mensaje de error específico.
			const errorMatch = responseText.match(/<StatusMessage>(.*?)<\/StatusMessage>/);
			throw new Error(errorMatch ? errorMatch[1] : 'Error desconocido en la respuesta SOAP.');
		}
	}

	/** Parsea una respuesta SOAP para extraer información completa de los campos de una DE. */
	function parseFullSoapFieldsAsync(xmlString) {
		return new Promise(resolve => {
			const fields = [],
				parser = new DOMParser(),
				xmlDoc = parser.parseFromString(xmlString, "application/xml");
			const getText = (node, tagName) => node.querySelector(tagName)
				?.textContent || '';
			// Itera sobre cada nodo "Results" en la respuesta XML.
			xmlDoc.querySelectorAll("Results")
				.forEach(node => {
					// Extrae cada propiedad del campo.
					const fieldType = getText(node, 'FieldType');
					let length = getText(node, 'MaxLength');
					// Formato especial para la longitud de campos decimales.
					if (fieldType.toLowerCase() === 'decimal' && getText(node, 'Scale') !== '0') {
						length = `${length},${getText(node, 'Scale')}`;
					}
					// Construye un objeto de campo limpio.
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
			// Devuelve los campos ordenados por su posición original.
			resolve(fields.sort((a, b) => a.ordinal - b.ordinal));
		});
	}

	/** Parsea la respuesta de búsqueda de una DE para extraer su nombre y el ID de su carpeta. */
	function parseDESearchResponse(xmlString) {
		return new Promise(resolve => {
			const xmlDoc = new DOMParser()
				.parseFromString(xmlString, "application/xml");
			if (xmlDoc.querySelector("OverallStatus")
				?.textContent !== 'OK') {
				return resolve({
					error: xmlDoc.querySelector("StatusMessage")
						?.textContent || 'Error desconocido.'
				});
			}
			const resultNode = xmlDoc.querySelector("Results");
			if (!resultNode) return resolve({
				error: "No se encontró la Data Extension."
			});
			// Resuelve la promesa con el ID de la carpeta y el nombre de la DE.
			resolve({
				categoryId: resultNode.querySelector("CategoryID")
					?.textContent,
				deName: resultNode.querySelector("Name")
					?.textContent
			});
		});
	}

	/** Obtiene la ruta completa de una carpeta de forma recursiva. */
	async function getFolderPath(folderId, apiConfig) {
		// Condición de salida de la recursión: si no hay folderId, se ha llegado a la raíz.
		if (!folderId || isNaN(parseInt(folderId))) return '';
		// Pide los datos de la carpeta actual.
		const soapPayload = `<s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope" xmlns:a="http://schemas.xmlsoap.org/ws/2004/08/addressing"><s:Header><a:Action s:mustUnderstand="1">Retrieve</a:Action><a:To s:mustUnderstand="1">${apiConfig.soapUri}</a:To><fueloauth xmlns="http://exacttarget.com">${apiConfig.accessToken}</fueloauth></s:Header><s:Body xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema"><RetrieveRequestMsg xmlns="http://exacttarget.com/wsdl/partnerAPI"><RetrieveRequest><ObjectType>DataFolder</ObjectType><Properties>Name</Properties><Properties>ParentFolder.ID</Properties><Filter xsi:type="SimpleFilterPart"><Property>ID</Property><SimpleOperator>equals</SimpleOperator><Value>${folderId}</Value></Filter></RetrieveRequest></RetrieveRequestMsg></s:Body></s:Envelope>`;
		const responseText = await (await fetch(apiConfig.soapUri, {
				method: 'POST',
				headers: {
					'Content-Type': 'text/xml'
				},
				body: soapPayload
			}))
			.text();
		const resultNode = new DOMParser()
			.parseFromString(responseText, "application/xml")
			.querySelector("Results");
		if (!resultNode) return '';
		// Extrae el nombre de la carpeta actual y el ID de su padre.
		const name = resultNode.querySelector("Name")
			?.textContent;
		const parentId = resultNode.querySelector("ParentFolder > ID")
			?.textContent;
		// Llamada recursiva para obtener la ruta del padre.
		const parentPath = await getFolderPath(parentId, apiConfig);
		// Concatena la ruta del padre con el nombre actual.
		return parentPath ? `${parentPath} > ${name}` : name;
	}

	/** Obtiene el ObjectID de una DE a partir de su nombre. */
	async function getDeObjectId(deName, apiConfig) {
		const soapPayload = `<s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope" xmlns:a="http://schemas.xmlsoap.org/ws/2004/08/addressing"><s:Header><a:Action s:mustUnderstand="1">Retrieve</a:Action><a:To s:mustUnderstand="1">${apiConfig.soapUri}</a:To><fueloauth xmlns="http://exacttarget.com">${apiConfig.accessToken}</fueloauth></s:Header><s:Body xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema"><RetrieveRequestMsg xmlns="http://exacttarget.com/wsdl/partnerAPI"><RetrieveRequest><ObjectType>DataExtension</ObjectType><Properties>ObjectID</Properties><Filter xsi:type="SimpleFilterPart"><Property>Name</Property><SimpleOperator>equals</SimpleOperator><Value>${deName}</Value></Filter></RetrieveRequest></RetrieveRequestMsg></s:Body></s:Envelope>`;
		const responseText = await (await fetch(apiConfig.soapUri, {
				method: 'POST',
				headers: {
					'Content-Type': 'text/xml'
				},
				body: soapPayload
			}))
			.text();
		const objectIDNode = new DOMParser()
			.parseFromString(responseText, "application/xml")
			.querySelector("Results > ObjectID");
		if (!objectIDNode) throw new Error(`No se encontró DE con el nombre "${deName}".`);
		return {
			ObjectID: objectIDNode.textContent
		};
	}

	/** Busca actividades de importación que apunten a un ObjectID de una DE. */
	async function findImportsForDE(deObjectId, apiConfig) {
		const soapPayload = `<s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope" xmlns:a="http://schemas.xmlsoap.org/ws/2004/08/addressing"><s:Header><a:Action s:mustUnderstand="1">Retrieve</a:Action><a:To s:mustUnderstand="1">${apiConfig.soapUri}</a:To><fueloauth xmlns="http://exacttarget.com">${apiConfig.accessToken}</fueloauth></s:Header><s:Body xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema"><RetrieveRequestMsg xmlns="http://exacttarget.com/wsdl/partnerAPI"><RetrieveRequest><ObjectType>ImportDefinition</ObjectType><Properties>Name</Properties><Properties>Description</Properties><Filter xsi:type="SimpleFilterPart"><Property>DestinationObject.ObjectID</Property><SimpleOperator>equals</SimpleOperator><Value>${deObjectId}</Value></Filter></RetrieveRequest></RetrieveRequestMsg></s:Body></s:Envelope>`;
		const responseText = await (await fetch(apiConfig.soapUri, {
				method: 'POST',
				headers: {
					'Content-Type': 'text/xml'
				},
				body: soapPayload
			}))
			.text();
		return Array.from(new DOMParser()
				.parseFromString(responseText, "application/xml")
				.querySelectorAll("Results"))
			.map(node => ({
				name: node.querySelector("Name")
					?.textContent || 'N/A',
				type: 'Import',
				description: node.querySelector("Description")
					?.textContent || '---'
			}));
	}

	/** Busca actividades de query que apunten a una DE por su nombre. */
	async function findQueriesForDE(deName, apiConfig) {
		const soapPayload = `<s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope" xmlns:a="http://schemas.xmlsoap.org/ws/2004/08/addressing"><s:Header><a:Action s:mustUnderstand="1">Retrieve</a:Action><a:To s:mustUnderstand="1">${apiConfig.soapUri}</a:To><fueloauth xmlns="http://exacttarget.com">${apiConfig.accessToken}</fueloauth></s:Header><s:Body xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema"><RetrieveRequestMsg xmlns="http://exacttarget.com/wsdl/partnerAPI"><RetrieveRequest><ObjectType>QueryDefinition</ObjectType><Properties>Name</Properties><Properties>QueryText</Properties><Properties>TargetUpdateType</Properties><Properties>ObjectID</Properties><Filter xsi:type="SimpleFilterPart"><Property>DataExtensionTarget.Name</Property><SimpleOperator>equals</SimpleOperator><Value>${deName}</Value></Filter></RetrieveRequest></RetrieveRequestMsg></s:Body></s:Envelope>`;
		const responseText = await (await fetch(apiConfig.soapUri, {
				method: 'POST',
				headers: {
					'Content-Type': 'text/xml'
				},
				body: soapPayload
			}))
			.text();
		const queries = Array.from(new DOMParser()
				.parseFromString(responseText, "application/xml")
				.querySelectorAll("Results"))
			.map(node => ({
				name: node.querySelector("Name")
					?.textContent || 'N/A',
				type: 'Query',
				description: node.querySelector("QueryText")
					?.textContent || '---',
				action: node.querySelector("TargetUpdateType")
					?.textContent || 'N/A',
				objectID: node.querySelector("ObjectID")
					?.textContent
			}));
		// Para cada query encontrada, busca a qué automatización pertenece.
		return await Promise.all(queries.map(q => findAutomationForQuery(q, apiConfig)));
	}

	/** Busca la automatización a la que pertenece una actividad de query. */
	async function findAutomationForQuery(query, apiConfig) {
		if (!query.objectID) return {
			...query,
			automationName: '---',
			step: '---'
		};
		// Busca una "Activity" cuyo "Definition" sea la query.
		const soapPayload = `<s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope" xmlns:a="http://schemas.xmlsoap.org/ws/2004/08/addressing"><s:Header><a:Action s:mustUnderstand="1">Retrieve</a:Action><a:To s:mustUnderstand="1">${apiConfig.soapUri}</a:To><fueloauth xmlns="http://exacttarget.com">${apiConfig.accessToken}</fueloauth></s:Header><s:Body xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema"><RetrieveRequestMsg xmlns="http://exacttarget.com/wsdl/partnerAPI"><RetrieveRequest><ObjectType>Activity</ObjectType><Properties>Program.ObjectID</Properties><Filter xsi:type="SimpleFilterPart"><Property>Definition.ObjectID</Property><SimpleOperator>equals</SimpleOperator><Value>${query.objectID}</Value></Filter></RetrieveRequest></RetrieveRequestMsg></s:Body></s:Envelope>`;
		const responseText = await (await fetch(apiConfig.soapUri, {
				method: 'POST',
				headers: {
					'Content-Type': 'text/xml'
				},
				body: soapPayload
			}))
			.text();
		const programIdNode = new DOMParser()
			.parseFromString(responseText, "application/xml")
			.querySelector("Program > ObjectID");
		if (!programIdNode) return {
			...query,
			automationName: '---',
			step: '---'
		};

		// Con el ID de la automatización (Program), usa la API REST para obtener sus detalles (nombre, pasos).
		const restUrl = `${apiConfig.restUri}automation/v1/automations/${programIdNode.textContent}`;
		const autoData = await (await fetch(restUrl, {
				headers: {
					"Authorization": `Bearer ${apiConfig.accessToken}`
				}
			}))
			.json();
		// Encuentra en qué paso de la automatización se encuentra la query.
		const step = autoData.steps?.find(s => s.activities?.some(a => a.activityObjectId === query.objectID))
			?.step || 'N/A';
		return {
			...query,
			automationName: autoData.name || 'N/A',
			step
		};
	}

	// ==========================================================
	// --- 6. MANIPULACIÓN DEL DOM Y COMPONENTES ---
	// ==========================================================
	/** Limpia los datos del calendario y resetea la vista. */
	function clearCalendarData() {
		// Resetea el array de automatizaciones en memoria.
		allAutomations = [];
		// Limpia el nombre del cliente para el que se guardaron los datos.
		calendarDataForClient = '';
		// Limpia la lista de automatizaciones del día en la barra lateral.
		if (automationList) {
			automationList.innerHTML = '<p>Selecciona un día para ver los detalles.</p>';
		}
		// Vuelve a dibujar el calendario, que ahora estará vacío (sin días marcados).
		if (calendarGrid) {
		   generateCalendar();
		}
		logMessage('Datos del calendario limpiados debido al cambio de cliente.');
	}

	/** Crea una fila para la tabla de campos, con un botón de borrado funcional. */
	function createTableRow(data = {}) {
		const row = document.createElement('tr');
		// Define los datos por defecto si no se proporcionan.
		const fieldData = {
			mc: data.mc || '',
			type: data.type || '',
			len: data.len || '',
			defaultValue: data.defaultValue || '',
			pk: data.pk || false,
			req: data.req || false
		};
		// Crea el HTML interno de la fila.
		row.innerHTML = `
            <td contenteditable="true">${fieldData.mc}</td>
            <td contenteditable="true">${fieldData.type}</td>
            <td contenteditable="true">${fieldData.len}</td>
            <td contenteditable="true">${fieldData.defaultValue}</td>
            <td><input type="checkbox" ${fieldData.pk ? 'checked' : ''}></td>
            <td><input type="checkbox" ${fieldData.req ? 'checked' : ''}></td>
        `;
		// Crea y añade el botón de borrado.
		const deleteButton = document.createElement('button');
		deleteButton.className = 'delete-row-btn';
		deleteButton.title = 'Eliminar fila';
		deleteButton.textContent = '×';
		row.appendChild(deleteButton);
		return row;
	}

	/** Muestra la sección del calendario y prepara su contenido. */
	function viewCalendar() {
		showSection('calendario-section'); // Muestra la sección.
		populateCalendarYearSelect(); // Rellena el selector de año.
		// Intenta cargar los datos del calendario desde el almacenamiento local.
		const savedDataRaw = localStorage.getItem('calendarAutomations');
		if (savedDataRaw) {
			const savedData = JSON.parse(savedDataRaw);
			const currentClient = clientNameInput.value;
			// Comprueba si los datos guardados corresponden al cliente actual.
			if (savedData.client === currentClient) {
				allAutomations = savedData.automations;
				calendarDataForClient = savedData.client;
				logMessage(`${allAutomations.length} automatizaciones cargadas de la memoria local.`);
				generateCalendar(); // Dibuja el calendario con los datos cargados.
				return;
			}
		}
		// Si no hay datos guardados o son de otro cliente, muestra el calendario vacío.
		allAutomations = [];
		generateCalendar();
		logMessage('No hay datos de calendario. Pulsa "Refrescar Datos".');
	}

	/** Rellena la tabla de campos con un array de objetos de campo. */
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
	/** Limpia completamente la tabla de campos. */
	function clearFieldsTable() {
		observer.disconnect();
		fieldsTableBody.innerHTML = '';
		selectedRow = null;
		addNewField(false);
		updateSubscriberKeyFieldOptions();
		populateDeletionPicklist([]);
		observer.observe(fieldsTableBody, observerConfig);
	}
	/** Añade una nueva fila vacía a la tabla de campos. */
	function addNewField(observe = true) {
		if (!observe) observer.disconnect();
		fieldsTableBody.appendChild(createTableRow());
		if (!observe) {
			updateSubscriberKeyFieldOptions();
			observer.observe(fieldsTableBody, observerConfig);
		}
	}
	/** Rellena la tabla con campos de ejemplo de cada tipo. */
	function createDummyFields() {
		populateFieldsTable([{
			mc: 'NombreCompleto',
			type: 'Text',
			len: '100',
			pk: true,
			req: true
		}, {
			mc: 'Email',
			type: 'EmailAddress',
			len: '254',
			req: true
		}, {
			mc: 'SincronizarMC',
			type: 'Boolean',
			defaultValue: 'true'
		}, {
			mc: 'FechaNacimiento',
			type: 'Date'
		}, {
			mc: 'Recibo',
			type: 'Decimal',
			len: '18,2'
		}, {
			mc: 'Telefono',
			type: 'Phone'
		}, {
			mc: 'Locale',
			type: 'Locale'
		}, {
			mc: 'Numero',
			type: 'Number'
		}]);
		populateDeletionPicklist([]);
	}
	/** Extrae los datos de todas las filas de la tabla de campos y los devuelve como un array de objetos. */
	function getFieldsDataFromTable() {
		return Array.from(fieldsTableBody.querySelectorAll('tr'))
			.map(row => {
				const cells = row.querySelectorAll('td');
				const name = cells[0].textContent.trim();
				const type = cells[1].textContent.trim();
				return (name && type) ? {
					name,
					type,
					length: cells[2].textContent.trim(),
					defaultValue: cells[3].textContent.trim(),
					isPrimaryKey: cells[4].querySelector('input')
						.checked,
					isRequired: cells[5].querySelector('input')
						.checked
				} : null;
			})
			.filter(Boolean);
	}
	/** Actualiza las opciones del desplegable de Subscriber Key basándose en los campos de la tabla. */
	function updateSubscriberKeyFieldOptions() {
		const currentSelection = subscriberKeyFieldSelect.value;
		subscriberKeyFieldSelect.innerHTML = '<option value="">-- Seleccione un campo --</option>';
		getFieldsDataFromTable()
			.forEach(field => {
				if (field.name) {
					const option = new Option(field.name, field.name);
					option.dataset.type = field.type;
					subscriberKeyFieldSelect.appendChild(option);
				}
			});
		if (Array.from(subscriberKeyFieldSelect.options)
			.some(opt => opt.value === currentSelection)) {
			subscriberKeyFieldSelect.value = currentSelection;
		} else {
			subscriberKeyFieldSelect.value = '';
		}
	}
	/** Habilita o deshabilita los campos de "Sendable" según si el checkbox está marcado. */
	function handleSendableChange() {
		const isChecked = isSendableCheckbox.checked;
		subscriberKeyFieldSelect.disabled = !isChecked;
		if (!isChecked) {
			subscriberKeyFieldSelect.value = '';
			subscriberKeyTypeInput.value = '';
		}
	}
	/** Rellena el desplegable de campos a eliminar con los campos recuperados de una DE. */
	function populateDeletionPicklist(fields) {
		targetFieldSelect.innerHTML = '';
		const validFields = fields.filter(f => f.mc && f.objectId);
		if (validFields.length > 0) {
			targetFieldSelect.innerHTML = '<option value="">-- Seleccione un campo --</option>';
			validFields.forEach(field => targetFieldSelect.appendChild(new Option(field.mc, field.objectId)));
			targetFieldSelect.disabled = false;
		} else {
			targetFieldSelect.innerHTML = '<option value="">No hay campos recuperados</option>';
			targetFieldSelect.disabled = true;
		}
	}
	/** Dibuja la tabla de resultados para el buscador de orígenes. */
	function renderDataSourcesTable(sources) {
		dataSourcesTbody.innerHTML = '';
		if (sources.length === 0) {
			dataSourcesTbody.innerHTML = '<tr><td colspan="6">No se encontraron orígenes.</td></tr>';
			return;
		}
		sources.forEach(source => {
			const row = document.createElement('tr');
			row.innerHTML = `<td>${source.name || '---'}</td><td>${source.type || '---'}</td><td>${source.automationName || '---'}</td><td>${source.step || '---'}</td><td>${source.action || '---'}</td><td style="white-space: pre-wrap; word-break: break-all;">${source.description || '---'}</td>`;
			dataSourcesTbody.appendChild(row);
		});
	}
	/** Procesa los datos de automatización crudos de la API a un formato simple para el calendario. */
	function processAndStoreAutomations(items) {
		allAutomations = items.map(auto => {
				const dateObj = new Date(auto.schedule.scheduledTime);
				if (isNaN(dateObj.getTime())) return null;
				const scheduledTime = dateObj.toISOString()
					.split('T')[0];
				const madridOffset = (new Date(dateObj.getFullYear(), 2, 31 - new Date(dateObj.getFullYear(), 2, 31)
					.getDay()) <= dateObj && dateObj < new Date(dateObj.getFullYear(), 9, 31 - new Date(dateObj.getFullYear(), 9, 31)
					.getDay())) ? 2 : 1;
				dateObj.setHours(dateObj.getUTCHours() + madridOffset);
				const scheduledHour = `${String(dateObj.getHours()).padStart(2, '0')}:${String(dateObj.getMinutes()).padStart(2, '0')}`;
				return {
					name: auto.name,
					status: 'Scheduled',
					scheduledTime,
					scheduledHour
				};
			})
			.filter(Boolean);
	}
	/** Dibuja la estructura completa del calendario para el año seleccionado. */
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
			table.innerHTML = `<thead><tr>${days.map(d => `<th>${d}</th>`).join('')}</tr></thead>`;
			const tbody = document.createElement("tbody");
			let firstDay = (new Date(year, i, 1)
				.getDay() + 6) % 7;
			const totalDays = new Date(year, i + 1, 0)
				.getDate();
			let date = 1;
			for (let rowIdx = 0; rowIdx < 6 && date <= totalDays; rowIdx++) {
				const row = document.createElement("tr");
				for (let colIdx = 0; colIdx < 7; colIdx++) {
					const cell = document.createElement("td");
					if ((rowIdx > 0 || colIdx >= firstDay) && date <= totalDays) {
						cell.innerText = date;
						const currentDate = `${year}-${String(i + 1).padStart(2, '0')}-${String(date).padStart(2, '0')}`;
						cell.dataset.date = currentDate;
						if (allAutomations.some(auto => auto.scheduledTime === currentDate)) cell.classList.add("has-automation");
						if (colIdx >= 5) cell.classList.add("weekend");
						cell.addEventListener("click", () => {
							document.querySelectorAll('.calendar-month td.selected')
								.forEach(c => c.classList.remove('selected'));
							cell.classList.add('selected');
							filterAutomationsForDay(cell.dataset.date);
						});
						date++;
					}
					row.appendChild(cell);
				}
				tbody.appendChild(row);
			}
			table.appendChild(tbody);
			monthDiv.appendChild(table);
			calendarGrid.appendChild(monthDiv);
		}
	}
	/** Muestra en la barra lateral del calendario las automatizaciones para un día específico. */
	function filterAutomationsForDay(date) {
		automationList.innerHTML = '';
		const filtered = allAutomations.filter(auto => auto.scheduledTime === date)
			.sort((a, b) => a.scheduledHour.localeCompare(b.scheduledHour));
		if (filtered.length > 0) {
			filtered.forEach(auto => {
				const itemDiv = document.createElement('div');
				itemDiv.className = 'automation-item';
				itemDiv.innerHTML = `<div class="automation-name">${auto.name}</div><div class="automation-details">${auto.status} - ${auto.scheduledHour}</div>`;
				automationList.appendChild(itemDiv);
			});
		} else {
			automationList.innerHTML = "<p>No hay automatizaciones programadas.</p>";
		}
	}
	/** Rellena el selector de año del calendario. */
	function populateCalendarYearSelect() {
		const currentYear = new Date()
			.getFullYear();
		if (calendarYearSelect.options.length === 0) {
			for (let i = currentYear - 2; i <= currentYear + 3; i++) {
				calendarYearSelect.appendChild(new Option(i, i));
			}
		}
		calendarYearSelect.value = currentYear;
	}
	/** Cierra el modal de importación de campos. */
	function closeImportModal() {
		importModal.style.display = 'none';
		pasteDataArea.value = '';
		delimiterSelect.value = 'tab';
		customDelimiterInput.classList.add('hidden');
		customDelimiterInput.value = '';
	}
	/** Procesa los datos pegados en el modal y los añade a la tabla de campos. */
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
			if (!delimiter) {
				alert('Introduce un separador.');
				return;
			}
		}
		const newFields = text.split('\n')
			.map(line => {
				if (!line.trim()) return null;
				const columns = line.split(delimiter);
				const [name, type, length] = columns.map(c => c.trim());
				return (name && type) ? {
					mc: name,
					type,
					len: length || ''
				} : null;
			})
			.filter(Boolean);
		if (newFields.length > 0) {
			observer.disconnect();
			if (fieldsTableBody.textContent.trim() === '') fieldsTableBody.innerHTML = '';
			newFields.forEach(fieldData => fieldsTableBody.appendChild(createTableRow(fieldData)));
			updateSubscriberKeyFieldOptions();
			observer.observe(fieldsTableBody, observerConfig);
			logMessage(`${newFields.length} campos importados.`);
		}
		closeImportModal();
	}
	/** Restaura el estado (abierto/cerrado) de los menús colapsables al iniciar la app. */
	function initializeCollapsibleMenus() {
		const collapsibleStates = JSON.parse(localStorage.getItem('collapsibleStates')) || {};
		collapsibleHeaders.forEach(header => {
			const headerText = header.textContent.trim();
			if (collapsibleStates[headerText]) {
				header.classList.add('active');
				header.nextElementSibling.style.maxHeight = header.nextElementSibling.scrollHeight + "px";
			}
		});
	}

	// ==========================================================
	// --- 7. INICIALIZACIÓN Y EVENT LISTENERS ---
	// ==========================================================

	/** Configura todos los event listeners de la aplicación. */
	function setupEventListeners() {

		// Botón de Login: guarda la configuración no sensible e inicia el flujo de autenticación.
		loginBtn.addEventListener('click', () => {
			const clientName = clientNameInput.value.trim();
			if (!clientName) return alert('Introduzca un nombre para el cliente.');
			const config = {
				clientName,
				authUri: authUriInput.value.trim(),
				clientId: clientIdInput.value.trim(),
				clientSecret: clientSecretInput.value.trim(),
				businessUnit: businessUnitInput.value.trim()
			};
			if (!config.authUri || !config.clientId || !config.clientSecret || !config.businessUnit) return alert('Se necesitan Auth URI, Client ID, Client Secret y MID para el login.');

			// Guarda la configuración (sin el secret) antes de iniciar el login.
			let configs = JSON.parse(localStorage.getItem('mcApiConfigs')) || {};
			configs[clientName] = getConfigToSave();
			localStorage.setItem('mcApiConfigs', JSON.stringify(configs));
			loadConfigsIntoSelect(); // Actualiza los selectores.
			logMessage("Configuración guardada. Iniciando login...");
			blockUI();
			// Envía la configuración al proceso principal (main.js) para iniciar el OAuth flow.
			window.electronAPI.startLogin(config);
		});

		// Botón de Logout: elimina la configuración local y las credenciales seguras.
		logoutBtn.addEventListener('click', () => {
			const clientName = savedConfigsSelect.value;
			if (!clientName) return alert("Seleccione un cliente para hacer logout.");
			if (confirm(`Esto borrará la configuración y cerrará la sesión para "${clientName}". ¿Continuar?`)) {
				// Borra del localStorage.
				let configs = JSON.parse(localStorage.getItem('mcApiConfigs')) || {};
				delete configs[clientName];
				localStorage.setItem('mcApiConfigs', JSON.stringify(configs));
				// Pide al proceso principal que borre las credenciales seguras (refresh token, etc.).
				window.electronAPI.logout(clientName);
			}
		});

		// --- Listeners para eventos recibidos desde el proceso principal (main.js) ---

		// Se activa cuando el proceso de login finaliza (con éxito o error).
		window.electronAPI.onTokenReceived(result => {
			unblockUI();
			if (result.success) {
				logMessage("Login exitoso. Sesión activa.");
				alert("Login completado con éxito.");
				loadAndSyncClientConfig(clientNameInput.value); // Recarga el cliente para reflejar la sesión activa.
			} else {
				logMessage(`Error durante el login: ${result.error}`);
				alert(`Hubo un error en el login: ${result.error}`);
				updateLoginStatus(false);
			}
		});

		// Se activa cuando el proceso de logout finaliza con éxito.
		window.electronAPI.onLogoutSuccess(() => {
			const clientName = clientNameInput.value;
			alert(`Sesión cerrada y configuración para "${clientName}" borrada.`);
			logMessage("Sesión cerrada y configuración borrada.");
			// Limpia la UI.
			loadConfigsIntoSelect();
			loadAndSyncClientConfig('');
		});

		// Se activa cuando una llamada a la API falla por un token expirado.
		window.electronAPI.onRequireLogin(data => {
			alert(`La sesión ha expirado o no es válida. Por favor, haz login de nuevo.\n\nMotivo: ${data.message}`);
			logMessage(`LOGIN REQUERIDO: ${data.message}`);
			updateLoginStatus(false);
		});

		// --- Listeners de navegación y botones de macros ---
		document.querySelectorAll('.back-button')
			.forEach(b => b.addEventListener('click', () => {
				mainMenu.style.display = 'flex';
				allSections.forEach(s => s.style.display = 'none');
			}));
		document.querySelectorAll('.macro-item')
			.forEach(item => {
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
					}
				});
			});

		// --- Listeners de botones de acción ---
		createDEBtn.addEventListener('click', macroCreateDE);
		createFieldsBtn.addEventListener('click', macroCreateFields);
		getFieldsBtn.addEventListener('click', macroGetFields);
		deleteFieldBtn.addEventListener('click', macroDeleteField);
		searchDEBtn.addEventListener('click', macroSearchDE);
		validateEmailBtn.addEventListener('click', macroValidateEmail);
		findDataSourcesBtn.addEventListener('click', macroFindDataSources);
		refreshAutomationsBtn.addEventListener('click', macroGetAutomations);
		createDummyFieldsBtn.addEventListener('click', createDummyFields);
		clearFieldsBtn.addEventListener('click', clearFieldsTable);
		addFieldBtn.addEventListener('click', () => addNewField(true));

		// --- Listener para la tabla de campos (selección y borrado de filas) ---
		fieldsTableBody.addEventListener('click', (e) => {
			const targetRow = e.target.closest('tr');
			if (!targetRow) return;
			// Si se hace clic en el botón de borrar de la fila.
			if (e.target.matches('.delete-row-btn')) {
				observer.disconnect(); // Pausa el observer para evitar re-triggers.
				if (targetRow === selectedRow) selectedRow = null;
				targetRow.remove();
				updateSubscriberKeyFieldOptions(); // Actualiza el desplegable.
				observer.observe(fieldsTableBody, observerConfig); // Reanuda el observer.
			} else { // Si se hace clic en cualquier otra parte de la fila.
				if (targetRow !== selectedRow) {
					if (selectedRow) selectedRow.classList.remove('selected');
					targetRow.classList.add('selected');
					selectedRow = targetRow;
				}
			}
		});

		// --- Otros Listeners de UI ---
		savedConfigsSelect.addEventListener('change', (e) => loadAndSyncClientConfig(e.target.value));
		sidebarClientSelect.addEventListener('change', (e) => loadAndSyncClientConfig(e.target.value));
		moveUpBtn.addEventListener('click', () => {
			if (selectedRow?.previousElementSibling) selectedRow.parentNode.insertBefore(selectedRow, selectedRow.previousElementSibling);
		});
		moveDownBtn.addEventListener('click', () => {
			if (selectedRow?.nextElementSibling) selectedRow.parentNode.insertBefore(selectedRow.nextElementSibling, selectedRow);
		});
		isSendableCheckbox.addEventListener('change', handleSendableChange);
		subscriberKeyFieldSelect.addEventListener('change', () => {
			const selectedOption = subscriberKeyFieldSelect.options[subscriberKeyFieldSelect.selectedIndex];
			subscriberKeyTypeInput.value = (selectedOption?.dataset.type) || '';
		});
		// Añade /v2/token automáticamente al Auth URI al perder el foco
		authUriInput.addEventListener('blur', () => {
			const uri = authUriInput.value.trim();
			// Solo lo añade si el campo no está vacío y no termina ya con /v2/token
			if (uri && !uri.endsWith('/v2/token')) {
				authUriInput.value = uri + '/v2/token';
			}
		});
		deNameInput.addEventListener('input', () => {
			deExternalKeyInput.value = deNameInput.value.replace(/\s+/g, '_') + '_CK';
		});
		importFieldsBtn.addEventListener('click', () => {
			importModal.style.display = 'flex';
			pasteDataArea.focus();
		});
		cancelPasteBtn.addEventListener('click', closeImportModal);
		importModal.addEventListener('click', (e) => {
			if (e.target === importModal) closeImportModal();
		});
		delimiterSelect.addEventListener('change', () => {
			customDelimiterInput.classList.toggle('hidden', delimiterSelect.value !== 'other');
			if (delimiterSelect.value === 'other') customDelimiterInput.focus();
		});
		processPasteBtn.addEventListener('click', processPastedData);
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
				document.getElementById(tabId)
					.classList.add('active');
			});
		});
		collapsibleHeaders.forEach(header => {
			header.addEventListener('click', () => {
				const content = header.nextElementSibling;
				const isExpanded = header.classList.toggle('active');
				content.style.maxHeight = isExpanded ? content.scrollHeight + "px" : 0;
				const states = JSON.parse(localStorage.getItem('collapsibleStates')) || {};
				states[header.textContent.trim()] = isExpanded;
				localStorage.setItem('collapsibleStates', JSON.stringify(states));
			});
		});
		calendarYearSelect.addEventListener('change', generateCalendar);
	}

	/** Función principal que inicializa el estado de la aplicación al cargar. */
	function initializeApp() {
		// Restaura el estado colapsado del log si estaba guardado.
		if (localStorage.getItem('logCollapsedState') === 'true') appContainer.classList.add('log-collapsed');
		// Carga todas las configuraciones guardadas en los selectores.
		loadConfigsIntoSelect();
		
		// Asegura que al iniciar la app, ningún cliente esté seleccionado.
		setClientConfigForm({}); // Limpia todos los formularios
		clientNameInput.value = '';
		savedConfigsSelect.value = '';
		sidebarClientSelect.value = '';
		updateLoginStatus(false); // Pone el indicador en "Sesión no iniciada"

		// Prepara la tabla de campos.
		clearFieldsTable();
		observer.observe(fieldsTableBody, observerConfig);
		// Restaura el estado de los menús colapsables.
		initializeCollapsibleMenus();
		// Activa todos los listeners.
		setupEventListeners();
		logMessage("Aplicación lista. Selecciona un cliente o configura uno nuevo.");
	}

	// Inicia la aplicación.
	initializeApp();
});
