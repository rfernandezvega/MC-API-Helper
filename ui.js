// ===================================================================
// Fichero: ui.js
// Descripción: Gestiona toda la lógica de la interfaz de usuario (UI),
// las interacciones del usuario, las llamadas a la API de Marketing Cloud
// y la manipulación dinámica del DOM.
//
// ÍNDICE:
// -------------------------------------------------------------------
// 1. DECLARACIÓN DE ELEMENTOS DEL DOM Y VARIABLES GLOBALES
// 2. GESTIÓN DE LA UI (LOGS, ESTADO DE CARGA, NAVEGACIÓN)
// 3. GESTIÓN DE CONFIGURACIÓN Y SESIÓN
// 4. MACROS - FUNCIONES PRINCIPALES DE LA API
//    - 4.1. Autenticación
//    - 4.2. Gestión de Data Extensions
//    - 4.3. Gestión de Campos
//    - 4.4. Funcionalidades de Búsqueda
//    - 4.5. Gestión de Automatismos
// 5. FUNCIONES AUXILIARES (HELPERS)
//    - 5.1. Helpers de API (SOAP, REST)
//    - 5.2. Parsers (XML, JSON)
//    - 5.3. Renderizadores de Tablas
//    - 5.4. Otros Helpers
// 6. MANIPULACIÓN DEL DOM Y COMPONENTES
//    - 6.1. Tabla de Campos
//    - 6.2. Calendario
//    - 6.3. Modal de Importación
//    - 6.4. Menús Colapsables
// 7. EVENT LISTENERS
// 8. INICIALIZACIÓN DE LA APLICACIÓN
// ===================================================================

document.addEventListener('DOMContentLoaded', function () {

	// ==========================================================
	// --- 1. DECLARACIÓN DE ELEMENTOS DEL DOM Y VARIABLES GLOBALES ---
	// ==========================================================

	// --- Variables de Estado Global ---
	let currentUserInfo = null;      // Almacena la información del usuario logueado.
	let currentOrgInfo = null;       // Almacena la información de la organización (stack, etc.).
	let selectedRow = null;          // Fila seleccionada en la tabla de campos.
	let selectedCustomerRow = null;  // Fila seleccionada en la tabla de búsqueda de clientes.
	let selectedSubscriberData = null; // Datos del suscriptor seleccionado.
	let navigationHistory = ['main-menu']; // Historial para el botón "Atrás".
	let allAutomations = [];         // Caché de automatismos para el calendario.
	let fullAutomationList = [];     // Caché de todos los automatismos para la vista de gestión.
	let dailyFilteredAutomations = [];// Automatismos filtrados para un día específico en el calendario.
	let calendarDataForClient = '';  // Cliente para el que se han cargado los datos del calendario.
	let currentSortColumn = 'name';  // Columna de ordenación por defecto para la tabla de automatismos.
	let currentSortDirection = 'asc';// Dirección de ordenación por defecto.

	// --- Búferes para el sistema de Logs Acumulativos ---
	let logBuffer = [];
	let requestBuffer = [];
	let responseBuffer = [];

	// --- Contenedores y Navegación Principal ---
	const appContainer = document.querySelector('.app-container');
	const mainMenu = document.getElementById('main-menu');
	const allSections = document.querySelectorAll('#main-content > .section');

	// --- Barra Lateral Derecha (Log) ---
	const toggleLogBtn = document.getElementById('toggleLogBtn');
	const logMessagesEl = document.getElementById('log-messages');
	const logRequestEl = document.getElementById('log-request');
	const logResponseEl = document.getElementById('log-response');
	
	// --- Configuración de APIs y Sesión ---
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
	const stackKeyInput = document.getElementById('stackKey');
	const saveConfigBtn = document.getElementById('saveConfigBtn');
	const loginBtn = document.getElementById('loginBtn');
	const logoutBtn = document.getElementById('logoutBtn');
	const dvSentInput = document.getElementById('dvSent');
    const dvOpenInput = document.getElementById('dvOpen');
    const dvClickInput = document.getElementById('dvClick');
    const dvBounceInput = document.getElementById('dvBounce');

	// --- Creación de Data Extensions ---
	const deNameInput = document.getElementById('deName');
	const deDescriptionInput = document.getElementById('deDescription');
	const deExternalKeyInput = document.getElementById('deExternalKey');
	const deFolderInput = document.getElementById('deFolder');
	const isSendableCheckbox = document.getElementById('isSendable');
	const subscriberKeyFieldSelect = document.getElementById('subscriberKeyField');
	const subscriberKeyTypeInput = document.getElementById('subscriberKeyType');
	const createDEBtn = document.getElementById('createDE');

	// --- Gestión de Campos ---
	const fieldsTableBody = document.querySelector('#myTable tbody');
	const addFieldBtn = document.getElementById('addFieldBtn');
	const createDummyFieldsBtn = document.getElementById('createDummyFieldsBtn');
	const createFieldsBtn = document.getElementById('createFieldsBtn');
	const clearFieldsBtn = document.getElementById('clearFieldsBtn');
	const moveUpBtn = document.getElementById('moveUp');
	const moveDownBtn = document.getElementById('moveDown');
	const recExternalKeyInput = document.getElementById('recExternalKey');
	const targetFieldSelect = document.getElementById('targetFieldSelect');
	const getFieldsBtn = document.getElementById('getFields');
	const deleteFieldBtn = document.getElementById('deleteField');
	const importFieldsBtn = document.getElementById('importFieldsBtn');

	// --- Modal de Importación ---
	const importModal = document.getElementById('import-modal');
	const pasteDataArea = document.getElementById('paste-data-area');
	const processPasteBtn = document.getElementById('process-paste-btn');
	const cancelPasteBtn = document.getElementById('cancel-paste-btn');
	const delimiterSelect = document.getElementById('delimiter-select');
	const customDelimiterInput = document.getElementById('custom-delimiter-input');

	// --- Buscadores ---
	const deSearchProperty = document.getElementById('deSearchProperty');
	const deSearchValue = document.getElementById('deSearchValue');
	const deSearchResultsTbody = document.querySelector('#de-search-results-tbody');
	const deNameToFindInput = document.getElementById('deNameToFind');
	const dataSourcesTbody = document.getElementById('data-sources-tbody');
    const customerSearchValue = document.getElementById('customerSearchValue');
    const customerSearchTbody = document.getElementById('customer-search-tbody');
	const getCustomerSendsBtn = document.getElementById('getCustomerSendsBtn');
    const getCustomerJourneysBtn = document.getElementById('getCustomerJourneysBtn');
	const customerJourneysResultsBlock = document.getElementById('customer-journeys-results-block');
    const customerJourneysTbody = document.getElementById('customer-journeys-tbody');
	const customerSendsResultsBlock = document.getElementById('customer-sends-results-block');
	const sendsTableContainer = document.getElementById('sends-table-container');
    const opensTableContainer = document.getElementById('opens-table-container');
    const clicksTableContainer = document.getElementById('clicks-table-container');
    const bouncesTableContainer = document.getElementById('bounces-table-container');
	const querySearchText = document.getElementById('querySearchText');
    const querySearchResultsTbody = document.getElementById('query-search-results-tbody');
	const showQueryTextCheckbox = document.getElementById('showQueryTextCheckbox');
	const searchDEBtn = document.getElementById('searchDEBtn');
	const findDataSourcesBtn = document.getElementById('findDataSourcesBtn');
	const searchCustomerBtn = document.getElementById('searchCustomerBtn');
	const searchQueriesByTextBtn = document.getElementById('searchQueriesByTextBtn');

	// --- Validador de Email ---
	const validateEmailBtn = document.getElementById('validateEmailBtn');
	const emailToValidateInput = document.getElementById('emailToValidate');
	const emailValidationResults = document.getElementById('email-validation-results');

	// --- Calendario ---
	const calendarGrid = document.getElementById('calendar-grid');
	const calendarYearSelect = document.getElementById('calendarYearSelect');
	const automationList = document.getElementById('automation-list');
	const automationListHeader = document.getElementById('automation-list-header');
	const refreshAutomationsBtn = document.getElementById('refreshAutomationsBtn');
	const refreshJourneyAutomationsBtn = document.getElementById('refreshJourneyAutomationsBtn');

	// --- Gestión de Automatismos ---
    const automationsTbody = document.getElementById('automations-tbody');
	const refreshAutomationsTableBtn = document.getElementById('refreshAutomationsTableBtn');
    const activateAutomationBtn = document.getElementById('activateAutomationBtn');
    const runAutomationBtn = document.getElementById('runAutomationBtn');
    const stopAutomationBtn = document.getElementById('stopAutomationBtn');
	const automationNameFilter = document.getElementById('automationNameFilter');
    const automationStatusFilter = document.getElementById('automationStatusFilter');

	// --- Componentes Generales ---
	const tabButtons = document.querySelectorAll('.tab-button');
	const tabContents = document.querySelectorAll('.tab-content');
	const collapsibleHeaders = document.querySelectorAll('.collapsible-header');

	// --- Observer para la tabla de campos ---
	// Detecta cambios en la tabla para actualizar dinámicamente el desplegable de Subscriber Key.
	const observer = new MutationObserver(updateSubscriberKeyFieldOptions);
	const observerConfig = { childList: true, subtree: true, characterData: true };


	// ==========================================================
	// --- 2. GESTIÓN DE LA UI (LOGS, ESTADO DE CARGA, NAVEGACIÓN) ---
	// ==========================================================

	// --- Sistema de Logs Acumulativos ---
	// En lugar de escribir directamente en el DOM, estas funciones acumulan los logs
	// en búferes. Esto permite mostrar un registro completo de acciones con múltiples pasos.

	/**
	 * Inicia el proceso de almacenamiento de logs en búfer. Limpia los búferes anteriores.
	 * Debe llamarse al inicio de cada macro.
	 */
	function startLogBuffering() {
		logBuffer = [];
		requestBuffer = [];
		responseBuffer = [];
	}

	/**
	 * Formatea y muestra el contenido de los búferes de logs en el DOM.
	 * Debe llamarse al final de cada macro (idealmente en un bloque `finally`).
	 */
	function endLogBuffering() {
		const separator = '\n\n----------------------------------------\n\n';
		const formatEntry = (entry) => (typeof entry === 'object') ? JSON.stringify(entry, null, 2) : entry;
	
		logMessagesEl.textContent = logBuffer.map(formatEntry).join(separator);
		logRequestEl.textContent = requestBuffer.map(formatEntry).join(separator);
		logResponseEl.textContent = responseBuffer.map(formatEntry).join(separator);
	}

	/**
	 * Añade un mensaje informativo al búfer de logs.
	 * @param {string} message - El texto a añadir.
	 */
	function logMessage(message) {
		logBuffer.push(message);
	}

	/**
	 * Añade los detalles de una petición API al búfer de peticiones.
	 * @param {object|string} requestData - El objeto de la petición o texto plano.
	 */
	function logApiCall(requestData) {
		requestBuffer.push(requestData);
	}

	/**
	 * Añade los detalles de una respuesta API al búfer de respuestas.
	 * @param {object|string} responseData - El objeto de la respuesta o texto plano.
	 */
	function logApiResponse(responseData) {
		responseBuffer.push(responseData);
	}
	
	/**
	 * Bloquea la interfaz de usuario para prevenir interacciones durante una operación asíncrona.
	 */
	function blockUI() {
		if (document.activeElement) document.activeElement.blur();
		appContainer.classList.add('is-updating');
	}

	/**
	 * Desbloquea la interfaz de usuario una vez que la operación ha finalizado.
	 */
	function unblockUI() {
		appContainer.classList.remove('is-updating');
	}
	
	/**
	 * Muestra una sección específica del contenido principal y oculta las demás.
	 * @param {string} sectionId - El ID del elemento de la sección a mostrar.
	 * @param {boolean} [addToHistory=true] - Si es `false`, no añade la vista al historial.
	 */
	window.showSection = function (sectionId, addToHistory = true) {
		mainMenu.style.display = 'none';
		allSections.forEach(s => s.style.display = 'none');

		const sectionToShow = document.getElementById(sectionId);
		if (sectionToShow) {
			sectionToShow.style.display = 'flex';
		} else {
			mainMenu.style.display = 'flex';
			sectionId = 'main-menu';
		}

		if (addToHistory && navigationHistory[navigationHistory.length - 1] !== sectionId) {
			navigationHistory.push(sectionId);
		}
	};

	/**
	 * Navega a la sección anterior registrada en el historial.
	 */
	function goBack() {
		if (navigationHistory.length > 1) {
			navigationHistory.pop();
		}
		const previousSectionId = navigationHistory[navigationHistory.length - 1];
		showSection(previousSectionId, false);
	}


	// ==========================================================
	// --- 3. GESTIÓN DE CONFIGURACIÓN Y SESIÓN ---
	// ==========================================================

	/**
	 * Recoge los valores del formulario que son seguros para guardar en localStorage.
	 * @returns {object} Un objeto con la configuración segura del cliente.
	 */
	const getConfigToSave = () => ({
		authUri: authUriInput.value,
		businessUnit: businessUnitInput.value,
		clientId: clientIdInput.value,
		stackKey: stackKeyInput.value,
		dvSent: dvSentInput.value,
        dvOpen: dvOpenInput.value,
        dvClick: dvClickInput.value,
        dvBounce: dvBounceInput.value
	});

	/**
	 * Rellena los campos del formulario de configuración con un objeto de configuración dado.
	 * @param {object} config - El objeto de configuración a cargar en el formulario.
	 */
	const setClientConfigForm = (config) => {
		businessUnitInput.value = config.businessUnit || '';
		authUriInput.value = config.authUri || '';
		clientIdInput.value = config.clientId || '';
		stackKeyInput.value = config.stackKey || '';
        dvSentInput.value = config.dvSent || '';
        dvOpenInput.value = config.dvOpen || '';
        dvClickInput.value = config.dvClick || '';
        dvBounceInput.value = config.dvBounce || '';
		tokenField.value = '';
		soapUriInput.value = '';
		restUriInput.value = '';
		clientSecretInput.value = '';
	};

	/**
	 * Carga todas las configuraciones guardadas en `localStorage` y las muestra en los selectores.
	 */
	const loadConfigsIntoSelect = () => {
		const configs = JSON.parse(localStorage.getItem('mcApiConfigs')) || {};
		const currentValue = sidebarClientSelect.value || savedConfigsSelect.value;
		savedConfigsSelect.innerHTML = '<option value="">Seleccionar configuración...</option>';
		sidebarClientSelect.innerHTML = '<option value="">Ninguno seleccionado</option>';
		for (const name in configs) {
			savedConfigsSelect.appendChild(new Option(name, name));
			sidebarClientSelect.appendChild(new Option(name, name));
		}
		savedConfigsSelect.value = currentValue;
		sidebarClientSelect.value = currentValue;
	};

	/**
	 * Carga la configuración de un cliente, la aplica a los formularios y valida la sesión.
	 * @param {string} clientName - El nombre del cliente a cargar.
	 */
	function loadAndSyncClientConfig(clientName) {
		startLogBuffering();
		try {
			const configs = JSON.parse(localStorage.getItem('mcApiConfigs')) || {};
			tokenField.value = '';
			soapUriInput.value = '';
			restUriInput.value = '';
			updateLoginStatus(false);
			clearCalendarData();
			fullAutomationList = [];
			automationNameFilter.value = '';
			populateStatusFilter([]);
			renderAutomationsTable([]);
			updateAutomationButtonsState();

			if (clientName) {
				blockUI();
				const configToLoad = configs[clientName] || {};
				setClientConfigForm(configToLoad);
				clientNameInput.value = clientName;
				savedConfigsSelect.value = clientName;
				sidebarClientSelect.value = clientName;

				logMessage(`Cliente "${clientName}" cargado. Comprobando sesión...`);
				getAuthenticatedConfig()
					.catch(() => { /* El error ya se gestiona y loguea dentro de getAuthenticatedConfig */ })
					.finally(unblockUI);
			} else {
				setClientConfigForm({});
				clientNameInput.value = '';
				savedConfigsSelect.value = '';
				sidebarClientSelect.value = '';
				stackKeyInput.value = '';
				logMessage("Ningún cliente seleccionado.");
			}
		} finally {
			endLogBuffering();
		}
	}
	
	/**
	 * Actualiza el indicador visual de estado de la sesión en la barra lateral.
	 * @param {boolean} isLoggedIn - `true` si la sesión está activa.
	 * @param {string} [clientName=''] - El nombre del cliente para mostrar.
	 * @param {object} [userInfo=null] - Información del usuario para mostrar el email.
	 */
	function updateLoginStatus(isLoggedIn, clientName = '', userInfo = null) {
		if (isLoggedIn) {
			let statusHTML = `🟢 Sesión activa: <strong>${clientName}</strong>`;
			if (userInfo && userInfo.email) {
				statusHTML += `<br><small style="font-weight: normal;">Usuario: ${userInfo.email}</small>`;
			}
			loginStatusEl.innerHTML = statusHTML;
			loginStatusEl.className = 'login-status active';
		} else {
			loginStatusEl.innerHTML = '🔴 Sesión no iniciada';
			loginStatusEl.className = 'login-status inactive';
		}
	}


	// ==========================================================
	// --- 4. MACROS - FUNCIONES PRINCIPALES DE LA API ---
	// ==========================================================

	// --- 4.1. Autenticación ---

	/**
	 * Punto de entrada central para obtener la configuración de API autenticada.
	 * @returns {Promise<object>} Un objeto con `{ accessToken, soapUri, restUri, userInfo, orgInfo }`.
	 * @throws {Error} Si no hay un cliente seleccionado o si la sesión no puede ser validada.
	 */
	async function getAuthenticatedConfig() {
		const clientName = clientNameInput.value.trim();
		if (!clientName) throw new Error("No hay ningún cliente seleccionado.");
		const apiConfig = await window.electronAPI.getApiConfig(clientName);
		if (!apiConfig || !apiConfig.accessToken) {
			updateLoginStatus(false);
			stackKeyInput.value = '';
			throw new Error("Sesión no activa. Por favor, inicia sesión.");
		}
		tokenField.value = apiConfig.accessToken;
		soapUriInput.value = apiConfig.soapUri;
		restUriInput.value = apiConfig.restUri;
		currentUserInfo = apiConfig.userInfo;
		currentOrgInfo = apiConfig.orgInfo;
		stackKeyInput.value = currentOrgInfo?.stack_key || 'No disponible';
		updateLoginStatus(true, clientName, currentUserInfo);
		return apiConfig;
	}

	// --- 4.2. Gestión de Data Extensions ---

	/**
	 * Macro para crear una Data Extension utilizando la API SOAP.
	 */
	async function macroCreateDE() {
		blockUI();
		startLogBuffering();
		try {
			logMessage("Iniciando creación de Data Extension...");
			const apiConfig = await getAuthenticatedConfig();

			const deName = deNameInput.value.trim();
			const deExternalKey = deExternalKeyInput.value.trim();
			if (!deName || !deExternalKey) throw new Error('El Nombre y la External Key son obligatorios.');

			const isSendable = isSendableCheckbox.checked;
			const subscriberKey = subscriberKeyFieldSelect.value;
			if (isSendable && !subscriberKey) throw new Error('Para una DE sendable, es obligatorio seleccionar un Campo SubscriberKey.');

			const validFieldsData = getFieldsDataFromTable();
			if (validFieldsData.length === 0) throw new Error('La DE debe tener al menos un campo.');

			const clientXml = businessUnitInput.value.trim() ? `<Client><ClientID>${businessUnitInput.value.trim()}</ClientID></Client>` : '';
			const descriptionXml = deDescriptionInput.value.trim() ? `<Description>${deDescriptionInput.value.trim()}</Description>` : '';
			const folderXml = deFolderInput.value.trim() ? `<CategoryID>${deFolderInput.value.trim()}</CategoryID>` : '';
			const sendableXml = isSendable ? `<SendableDataExtensionField><CustomerKey>${subscriberKey}</CustomerKey><Name>${subscriberKey}</Name><FieldType>${subscriberKeyTypeInput.value.trim()}</FieldType></SendableDataExtensionField><SendableSubscriberField><Name>Subscriber Key</Name><Value/></SendableSubscriberField>` : '';
			const fieldsXmlString = validFieldsData.map(buildFieldXml).join('');

			const soapPayload = `<s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope" xmlns:a="http://schemas.xmlsoap.org/ws/2004/08/addressing"><s:Header><a:Action s:mustUnderstand="1">Create</a:Action><a:To s:mustUnderstand="1">${apiConfig.soapUri}</a:To><fueloauth xmlns="http://exacttarget.com">${apiConfig.accessToken}</fueloauth></s:Header><s:Body xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema"><CreateRequest xmlns="http://exacttarget.com/wsdl/partnerAPI"><Objects xsi:type="DataExtension">${clientXml}<CustomerKey>${deExternalKey}</CustomerKey>${descriptionXml}<Name>${deName}</Name>${folderXml}<IsSendable>${isSendable}</IsSendable>${sendableXml}<Fields>${fieldsXmlString}</Fields></Objects></CreateRequest></s:Body></s:Envelope>`;

			await executeSoapRequest(apiConfig.soapUri, soapPayload.trim(), `¡Data Extension "${deName}" creada con éxito!`);
		} catch (error) {
			logMessage(`Error al crear la Data Extension: ${error.message}`);
			alert(`Error: ${error.message}`);
		} finally {
			unblockUI();
			endLogBuffering();
		}
	}

	// --- 4.3. Gestión de Campos ---

	/**
	 * Macro para crear o actualizar (upsert) campos en una Data Extension existente.
	 */
	async function macroCreateFields() {
		blockUI();
		startLogBuffering();
		try {
			logMessage(`Iniciando creación/actualización de campos...`);
			const apiConfig = await getAuthenticatedConfig();
			const externalKey = recExternalKeyInput.value.trim();
			if (!externalKey) throw new Error('Defina una "External Key de la DE" en "Gestión de Campos".');
			const validFieldsData = getFieldsDataFromTable();
			if (validFieldsData.length === 0) throw new Error('No hay campos válidos en la tabla.');
			const fieldsXmlString = validFieldsData.map(buildFieldXml).join('');
			const soapPayload = `<s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope" xmlns:a="http://schemas.xmlsoap.org/ws/2004/08/addressing"><s:Header><a:Action s:mustUnderstand="1">Update</a:Action><a:To s:mustUnderstand="1">${apiConfig.soapUri}</a:To><fueloauth xmlns="http://exacttarget.com">${apiConfig.accessToken}</fueloauth></s:Header><s:Body xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema"><UpdateRequest xmlns="http://exacttarget.com/wsdl/partnerAPI"><Objects xsi:type="DataExtension"><CustomerKey>${externalKey}</CustomerKey><Fields>${fieldsXmlString}</Fields></Objects></UpdateRequest></s:Body></s:Envelope>`;
			await executeSoapRequest(apiConfig.soapUri, soapPayload.trim(), `¡Éxito! ${validFieldsData.length} campos creados/actualizados.`);
		} catch (error) {
			logMessage(`Error al crear los campos: ${error.message}`);
			alert(`Error: ${error.message}`);
		} finally {
			unblockUI();
			endLogBuffering();
		}
	}

	/**
	 * Macro para recuperar todos los campos de una Data Extension y mostrarlos en la tabla.
	 */
	async function macroGetFields() {
		blockUI();
		startLogBuffering();
		try {
			const apiConfig = await getAuthenticatedConfig();
			const externalKey = recExternalKeyInput.value.trim();
			if (!externalKey) throw new Error('Introduzca la "External Key de la DE".');
			logMessage(`Recuperando campos para la DE: ${externalKey}`);
			const soapPayload = `<s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope" xmlns:a="http://schemas.xmlsoap.org/ws/2004/08/addressing"><s:Header><a:Action s:mustUnderstand="1">Retrieve</a:Action><a:To s:mustUnderstand="1">${apiConfig.soapUri}</a:To><fueloauth xmlns="http://exacttarget.com">${apiConfig.accessToken}</fueloauth></s:Header><s:Body xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema"><RetrieveRequestMsg xmlns="http://exacttarget.com/wsdl/partnerAPI"><RetrieveRequest><ObjectType>DataExtensionField</ObjectType><Properties>Name</Properties><Properties>ObjectID</Properties><Properties>CustomerKey</Properties><Properties>FieldType</Properties><Properties>IsPrimaryKey</Properties><Properties>IsRequired</Properties><Properties>MaxLength</Properties><Properties>Ordinal</Properties><Properties>Scale</Properties><Properties>DefaultValue</Properties><Filter xsi:type="SimpleFilterPart"><Property>DataExtension.CustomerKey</Property><SimpleOperator>equals</SimpleOperator><Value>${externalKey}</Value></Filter></RetrieveRequest></RetrieveRequestMsg></s:Body></s:Envelope>`;
			logApiCall({ payload: soapPayload });
			const responseText = await (await fetch(apiConfig.soapUri, { method: 'POST', headers: { 'Content-Type': 'text/xml' }, body: soapPayload })).text();
			logApiResponse({ body: responseText });
			const fields = await parseFullSoapFieldsAsync(responseText);
			if (fields.length > 0) {
				populateFieldsTable(fields);
				populateDeletionPicklist(fields);
				logMessage(`${fields.length} campos recuperados.`);
			} else {
				clearFieldsTable();
				populateDeletionPicklist([]);
				logMessage('Llamada exitosa pero no se encontraron campos.');
			}
		} catch (error) {
			logMessage(`Error al recuperar campos: ${error.message}`);
			alert(`Error: ${error.message}`);
		} finally {
			unblockUI();
			endLogBuffering();
		}
	}

	/**
	 * Macro para eliminar un campo específico de una Data Extension.
	 */
	async function macroDeleteField() {
		blockUI();
		startLogBuffering();
		try {
			const apiConfig = await getAuthenticatedConfig();
			const externalKey = recExternalKeyInput.value.trim();
			const fieldObjectId = targetFieldSelect.value;
			const selectedFieldName = targetFieldSelect.selectedOptions[0]?.text;
			if (!externalKey || !fieldObjectId) throw new Error('Introduzca la External Key y seleccione un campo a eliminar.');
			if (!confirm(`¿Seguro que quieres eliminar el campo "${selectedFieldName}"? Esta acción no se puede deshacer.`)) return;
			logMessage(`Iniciando borrado del campo "${selectedFieldName}"...`);
			const soapPayload = `<s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope" xmlns:a="http://schemas.xmlsoap.org/ws/2004/08/addressing"><s:Header><fueloauth xmlns="http://exacttarget.com">${apiConfig.accessToken}</fueloauth><a:Action s:mustUnderstand="1">Delete</a:Action><a:To s:mustUnderstand="1">${apiConfig.soapUri}</a:To></s:Header><s:Body xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><DeleteRequest xmlns="http://exacttarget.com/wsdl/partnerAPI"><Objects xsi:type="DataExtension"><CustomerKey>${externalKey}</CustomerKey><Fields><Field><ObjectID>${fieldObjectId}</ObjectID></Field></Fields></Objects></DeleteRequest></s:Body></s:Envelope>`;
			await executeSoapRequest(apiConfig.soapUri, soapPayload.trim(), `Campo "${selectedFieldName}" eliminado.`);
			await macroGetFields();
		} catch (error) {
			logMessage(`Error al eliminar el campo: ${error.message}`);
			alert(`Error: ${error.message}`);
		} finally {
			unblockUI();
			endLogBuffering();
		}
	}

	// --- 4.4. Funcionalidades de Búsqueda y Validación ---
	
	/**
	 * Macro para buscar una Data Extension y mostrar su ruta de carpetas completa.
	 */
	async function macroSearchDE() {
		blockUI();
		startLogBuffering();
		deSearchResultsTbody.innerHTML = '<tr><td colspan="2">Buscando...</td></tr>';
		try {
			const apiConfig = await getAuthenticatedConfig();
			const property = deSearchProperty.value;
			const value = deSearchValue.value.trim();
			if (!value) throw new Error("El campo 'Valor' no puede estar vacío.");

			logMessage(`Buscando DE por ${property} que contenga: ${value}`);
			
			// Usamos 'like' y envolvemos el valor con '%' para buscar coincidencias parciales
			const soapPayload = `<s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope" xmlns:a="http://schemas.xmlsoap.org/ws/2004/08/addressing"><s:Header><a:Action s:mustUnderstand="1">Retrieve</a:Action><a:To s:mustUnderstand="1">${apiConfig.soapUri}</a:To><fueloauth xmlns="http://exacttarget.com">${apiConfig.accessToken}</fueloauth></s:Header><s:Body xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema"><RetrieveRequestMsg xmlns="http://exacttarget.com/wsdl/partnerAPI"><RetrieveRequest><ObjectType>DataExtension</ObjectType><Properties>Name</Properties><Properties>CategoryID</Properties><Filter xsi:type="SimpleFilterPart"><Property>${property}</Property><SimpleOperator>like</SimpleOperator><Value>%${value}%</Value></Filter></RetrieveRequest></RetrieveRequestMsg></s:Body></s:Envelope>`;
			
			const responseText = await executeSoapRequest(apiConfig.soapUri, soapPayload, "Búsqueda de DE completada.");
			const deList = await parseDESearchResponse(responseText);

			if (deList.length === 0) {
				renderDESearchResultsTable([]); // Renderiza la tabla vacía con mensaje
				logMessage("No se encontraron resultados.");
				return;
			}

			logMessage(`Se encontraron ${deList.length} Data Extensions. Obteniendo rutas de carpeta...`);

			// Usamos Promise.all para obtener todas las rutas de carpeta en paralelo, mucho más rápido.
			const pathPromises = deList.map(async (deInfo) => {
				if (!deInfo.categoryId || parseInt(deInfo.categoryId) === 0) {
					return { name: deInfo.deName, path: 'Data Extensions' }; // DE en la raíz
				}
				const folderPath = await getFolderPath(deInfo.categoryId, apiConfig);
				return { name: deInfo.deName, path: folderPath || 'Data Extensions' };
			});

			const resultsWithPaths = await Promise.all(pathPromises);
			
			renderDESearchResultsTable(resultsWithPaths);
			logMessage("Visualización de resultados completada.");

		} catch (error) {
			logMessage(`Error al buscar la DE: ${error.message}`);
			deSearchResultsTbody.innerHTML = `<tr><td colspan="2" style="color: red;">Error: ${error.message}</td></tr>`;
		} finally {
			unblockUI();
			endLogBuffering();
		}
	}

	/**
	 * Macro para validar una dirección de email utilizando la API REST.
	 */
	async function macroValidateEmail() {
		blockUI();
		startLogBuffering();
		emailValidationResults.textContent = 'Validando...';
		try {
			const apiConfig = await getAuthenticatedConfig();
			const emailToValidate = emailToValidateInput.value.trim();
			if (!emailToValidate) throw new Error("Introduzca un email para validar.");
			logMessage(`Validando email: ${emailToValidate}`);
			const validateUrl = `${apiConfig.restUri}address/v1/validateEmail`;
			const payload = { "email": emailToValidate, "validators": ["SyntaxValidator", "MXValidator", "ListDetectiveValidator"] };
			logApiCall({ endpoint: validateUrl, body: payload });
			const response = await fetch(validateUrl, { method: 'POST', headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiConfig.accessToken}` }, body: JSON.stringify(payload) });
			const responseData = await response.json();
			logApiResponse({ status: response.status, body: responseData });
			if (!response.ok) throw new Error(responseData.message || `Error API: ${response.status}`);
			emailValidationResults.textContent = responseData.valid ? `El email "${responseData.email}" es VÁLIDO.` : `El email "${responseData.email}" es INVÁLIDO.\nRazón: ${responseData.failedValidation}`;
		} catch (error) {
			logMessage(`Error al validar el email: ${error.message}`);
			emailValidationResults.textContent = `Error: ${error.message}`;
		} finally {
			unblockUI();
			endLogBuffering();
		}
	}

	/**
	 * Macro para encontrar todas las actividades que tienen como destino una Data Extension.
	 */
	async function macroFindDataSources() {
		blockUI();
		startLogBuffering();
		dataSourcesTbody.innerHTML = '<tr><td colspan="6">Buscando...</td></tr>';
		try {
			const apiConfig = await getAuthenticatedConfig();
			const deName = deNameToFindInput.value.trim();
			if (!deName) throw new Error('Introduzca el nombre de la Data Extension.');
			logMessage(`Buscando orígenes para la DE: "${deName}"`);
			const deDetails = await getDeObjectId(deName, apiConfig);
			logMessage(`ObjectID de la DE: ${deDetails.ObjectID}`);
			const [imports, queries] = await Promise.all([
				findImportsForDE(deDetails.ObjectID, apiConfig),
				findQueriesForDE(deName, apiConfig)
			]);
			const allSources = [...imports, ...queries].sort((a, b) => a.name.localeCompare(b.name));
			renderDataSourcesTable(allSources);
			logMessage(`Búsqueda completada. Se encontraron ${allSources.length} actividades.`);
		} catch (error) {
			logMessage(`Error al buscar orígenes: ${error.message}`);
			dataSourcesTbody.innerHTML = `<tr><td colspan="6" style="color: red;">Error: ${error.message}</td></tr>`;
		} finally {
			unblockUI();
			endLogBuffering();
		}
	}

	/**
	 * Macro para buscar un cliente (suscriptor) por Subscriber Key o Email.
	 */
	async function macroSearchCustomer() {
		blockUI();
		startLogBuffering();
		customerSearchTbody.innerHTML = '<tr><td colspan="6">Buscando...</td></tr>';
		if (selectedCustomerRow) selectedCustomerRow.classList.remove('selected');
		selectedCustomerRow = null;
		selectedSubscriberData = null;
		getCustomerSendsBtn.disabled = true;
		getCustomerJourneysBtn.disabled = true;
		customerJourneysResultsBlock.classList.add('hidden');
		customerSendsResultsBlock.classList.add('hidden');
		try {
			const apiConfig = await getAuthenticatedConfig();
			const value = customerSearchValue.value.trim();
			if (!value) throw new Error("El campo de búsqueda no puede estar vacío.");
			let finalResults = [];
			logMessage(`Paso 1: Buscando como Suscriptor por ID: ${value}`);
			finalResults = await searchSubscriberByProperty('SubscriberKey', value, apiConfig);
			if (finalResults.length === 0) {
				logMessage(`Paso 2: No encontrado. Buscando como Suscriptor por Email: ${value}`);
				finalResults = await searchSubscriberByProperty('EmailAddress', value, apiConfig);
			}
			renderCustomerSearchResults(finalResults);
			logMessage(`Búsqueda completada. Se encontraron ${finalResults.length} resultado(s).`);
		} catch (error) {
			logMessage(`Error al buscar clientes: ${error.message}`);
			customerSearchTbody.innerHTML = `<tr><td colspan="6" style="color: red;">Error: ${error.message}</td></tr>`;
		} finally {
			unblockUI();
			endLogBuffering();
		}
	}

	/**
	 * Macro para obtener los Journeys en los que se encuentra un cliente.
	 */
	async function macroGetCustomerJourneys() {
		if (!selectedSubscriberData?.subscriberKey) return;
		blockUI();
		startLogBuffering();
		customerJourneysResultsBlock.classList.remove('hidden');
		customerJourneysTbody.innerHTML = '<tr><td colspan="6">Buscando membresías de Journey...</td></tr>';
		try {
			const apiConfig = await getAuthenticatedConfig();
			const contactKey = selectedSubscriberData.subscriberKey;
			logMessage(`Buscando Journeys para el Contact Key: ${contactKey}`);
			const membershipUrl = `${apiConfig.restUri}interaction/v1/interactions/contactMembership`;
			const membershipPayload = { "ContactKeyList": [contactKey] };
			logApiCall({ endpoint: membershipUrl, body: membershipPayload });
			const membershipResponse = await fetch(membershipUrl, { method: 'POST', headers: { 'Authorization': `Bearer ${apiConfig.accessToken}`, 'Content-Type': 'application/json' }, body: JSON.stringify(membershipPayload) });
			const membershipData = await membershipResponse.json();
			logApiResponse(membershipData);
			if (!membershipResponse.ok) throw new Error(`Error API al buscar membresías: ${membershipResponse.statusText}`);
			const memberships = membershipData.results?.contactMemberships || [];
			if (memberships.length === 0) {
				customerJourneysTbody.innerHTML = '<tr><td colspan="6">Este contacto no se encuentra en ningún Journey.</td></tr>';
				logMessage("Búsqueda completada. El contacto no está en ningún Journey.");
				return;
			}
			customerJourneysTbody.innerHTML = '<tr><td colspan="6">Membresías encontradas. Obteniendo detalles...</td></tr>';
			const uniqueDefinitionKeys = [...new Set(memberships.map(m => m.definitionKey))];
			const detailPromises = uniqueDefinitionKeys.map(key => {
				const detailUrl = `${apiConfig.restUri}interaction/v1/interactions/key:${key}`;
				logApiCall({ step: 'Get Journey Details', endpoint: detailUrl });
				return fetch(detailUrl, { method: 'GET', headers: { 'Authorization': `Bearer ${apiConfig.accessToken}` } }).then(res => res.json());
			});
			const journeyDetails = await Promise.all(detailPromises);
			logApiResponse({ step: 'All Journey Details', responses: journeyDetails });
			renderCustomerJourneysTable(journeyDetails);
			logMessage(`Búsqueda completada. Se encontraron detalles para ${journeyDetails.length} Journey(s).`);
		} catch (error) {
			logMessage(`Error al buscar journeys: ${error.message}`);
			customerJourneysTbody.innerHTML = `<tr><td colspan="6" style="color: red;">Error: ${error.message}</td></tr>`;
		} finally {
			unblockUI();
			endLogBuffering();
		}
	}

	/**
	 * Macro para obtener los datos de envíos desde las Data Views configuradas.
	 */
	async function macroGetCustomerSends() {
		if (!selectedSubscriberData?.subscriberKey) return;
		blockUI();
		startLogBuffering();
		customerSendsResultsBlock.classList.remove('hidden');
		try {
			const apiConfig = await getAuthenticatedConfig();
			const subscriberKey = selectedSubscriberData.subscriberKey;
			const customDataViews = { Sent: dvSentInput.value.trim(), Open: dvOpenInput.value.trim(), Click: dvClickInput.value.trim(), Bounce: dvBounceInput.value.trim() };
			const containers = { 'Sent': sendsTableContainer, 'Open': opensTableContainer, 'Click': clicksTableContainer, 'Bounce': bouncesTableContainer };
			Object.values(containers).forEach(c => c.innerHTML = '');
			logMessage(`Iniciando búsqueda de envíos para: ${subscriberKey}`);
			for (const viewType in customDataViews) {
                const container = containers[viewType];
                const dataViewKey = customDataViews[viewType];
                if (!dataViewKey) {
                    container.innerHTML = `<p>Data View para '${viewType}' no configurada.</p>`;
                    continue;
                }
				container.innerHTML = `<p>Buscando en ${viewType} ('${dataViewKey}')...</p>`;
				logMessage(`Consultando Data View: ${dataViewKey}...`);
				const filter = encodeURIComponent(`"SubscriberKey"='${subscriberKey}'`);
				const url = `${apiConfig.restUri}data/v1/customobjectdata/key/${dataViewKey}/rowset?$filter=${filter}`;
				logApiCall({ endpoint: url, method: 'GET' });
				const response = await fetch(url, { method: 'GET', headers: { 'Authorization': `Bearer ${apiConfig.accessToken}` } });
				const responseData = await response.json();
				logApiResponse({ request: url, response: responseData });
				if (!response.ok) {
					container.innerHTML = `<p style="color: red;">Error al consultar ${viewType}: ${responseData.message || response.statusText}</p>`;
					continue; 
				}
				renderDataViewTable(container, responseData.items);
			}
			logMessage("Búsqueda de envíos completada.");
		} catch (error) {
			logMessage(`Error fatal durante la búsqueda de envíos: ${error.message}`);
			Object.values(sendsTableContainer.parentNode.children).forEach(c => c.innerHTML = `<p style="color: red;">${error.message}</p>`);
		} finally {
			unblockUI();
			endLogBuffering();
		}
	}

	/**
	 * Macro para buscar en el texto de todas las Query Activities.
	 */
	async function macroSearchQueriesByText() {
		blockUI();
		startLogBuffering();
		querySearchResultsTbody.innerHTML = '<tr><td colspan="4">Buscando en todas las queries...</td></tr>';
		try {
			const apiConfig = await getAuthenticatedConfig();
			const searchText = querySearchText.value.trim();
			if (!searchText) throw new Error("El campo 'Texto a buscar' no puede estar vacío.");
			logMessage(`Buscando queries que contengan: "${searchText}"`);
			const filterXml = `<Filter xsi:type="SimpleFilterPart"><Property>QueryText</Property><SimpleOperator>like</SimpleOperator><Value>%${searchText}%</Value></Filter>`;
			const allQueries = await findQueriesByFilter(filterXml, apiConfig);
			renderQuerySearchResults(allQueries);
			logMessage(`Búsqueda completada. Se encontraron ${allQueries.length} queries.`);
		} catch (error) {
			logMessage(`Error al buscar en queries: ${error.message}`);
			querySearchResultsTbody.innerHTML = `<tr><td colspan="4" style="color: red;">Error: ${error.message}</td></tr>`;
		} finally {
			unblockUI();
			endLogBuffering();
		}
	}

	// --- 4.5. Gestión de Automatismos ---
	
	/**
	 * Macro para obtener la lista COMPLETA de todas las automatizaciones.
	 * @returns {Promise<Array>} Una promesa que resuelve a la lista de automatismos.
	 */
	async function macroFetchAllAutomations() {
		// Esta función ahora solo realiza la lógica de fetching, no gestiona UI ni logs.
		try {
			logMessage("Recuperando todas las definiciones de automatismos...");
			const apiConfig = await getAuthenticatedConfig();
			const url = `${apiConfig.restUri}/legacy/v1/beta/bulk/automations/automation/definition/`;
			logApiCall({ endpoint: url, method: 'GET' });
			const response = await fetch(url, { headers: { "Authorization": `Bearer ${apiConfig.accessToken}` } });
			if (!response.ok) throw new Error(await response.text());
			const data = await response.json();
			const allItems = data.entry || [];
			logApiResponse({ status: response.status, count: allItems.length });
			logMessage(`Recuperación completa. Se encontraron ${allItems.length} definiciones.`);
			return allItems;
		} catch (error) {
			logMessage(`Error al recuperar automatismos: ${error.message}`);
			alert(`Error: ${error.message}`);
			return []; // Devuelve un array vacío en caso de error para no romper el flujo.
		}
	}

	/**
	 * Macro para poblar la vista "Gestión de Automatismos" con todos los datos.
	 */
	async function macroGetAllAutomationDetails() {
		const allItems = await macroFetchAllAutomations();
		fullAutomationList = allItems;
		populateStatusFilter(fullAutomationList);
		applyFiltersAndRender();
	}

	/**
	 * Macro para obtener las automatizaciones PROGRAMADAS y mostrarlas en el calendario.
	 */
	async function macroGetAutomations() {
		const allItems = await macroFetchAllAutomations();
		const scheduledItems = allItems.filter(item => item.status === 'Scheduled' && item.scheduledTime);
		processAndStoreAutomations(scheduledItems);
		const currentClient = clientNameInput.value;
		localStorage.setItem('calendarAutomations', JSON.stringify({ client: currentClient, automations: allAutomations }));
		calendarDataForClient = currentClient;
		generateCalendar();
		logMessage(`Calendario actualizado con ${allAutomations.length} automatismos programados.`);
	}

	/**
	 * Macro para obtener solo los JOURNEYS PROGRAMADOS y mostrarlos en el calendario.
	 */
	async function macroGetJourneyAutomations() {
		const allItems = await macroFetchAllAutomations();
		const scheduledItems = allItems.filter(item => item.status === 'Scheduled' && item.scheduledTime);
		const journeyAutomations = scheduledItems.filter(auto => auto.processes?.some(proc => proc.workerCounts?.some(wc => wc.objectTypeId === 952)));
		logMessage(`Se encontraron ${journeyAutomations.length} automatismos de Journeys programados.`);
		processAndStoreAutomations(journeyAutomations);
		const currentClient = clientNameInput.value;
		localStorage.setItem('calendarAutomations', JSON.stringify({ client: currentClient, automations: allAutomations }));
		calendarDataForClient = currentClient;
		generateCalendar();
		logMessage(`Calendario actualizado con ${allAutomations.length} Journeys programados.`);
	}

	/**
     * Macro para realizar una acción masiva (activar, ejecutar, parar) sobre los automatismos.
     * @param {string} actionName - La acción a realizar ('activate', 'run', 'pause').
     */
	async function macroPerformAutomationAction(actionName) {
		const selectedRows = document.querySelectorAll('#automations-table tbody tr.selected');
		if (selectedRows.length === 0) return;
		const selectedAutomations = Array.from(selectedRows).map(row => fullAutomationList.find(auto => auto.id === row.dataset.automationId)).filter(Boolean);
		if (selectedAutomations.length === 0) return;
		if (!confirm(`¿Seguro que quieres '${actionName}' ${selectedAutomations.length} automatismo(s)?`)) return;
		
		blockUI();
		startLogBuffering();
		const successes = [];
		const failures = [];

		try {
			const apiConfig = await getAuthenticatedConfig();
			const headers = { "Authorization": `Bearer ${apiConfig.accessToken}`, "Content-Type": "application/json" };
			const baseActionURL = `${apiConfig.restUri}legacy/v1/beta/bulk/automations/automation/definition/`;
			let actionURL;
			switch (actionName) {
				case 'pause': actionURL = `${baseActionURL}?action=pauseSchedule`; break;
				case 'run': actionURL = `${baseActionURL}?action=start`; break;
				case 'activate': actionURL = `${baseActionURL}?action=schedule`; break;
				default: throw new Error(`Acción desconocida: ${actionName}`);
			}

			for (const auto of selectedAutomations) {
				let payload = { id: auto.id };
				logMessage(`Procesando '${auto.name}'...`);
				if (actionName === 'activate') {
					try {
						const detailUrl = `${apiConfig.restUri}legacy/v1/beta/bulk/automations/automation/definition/${auto.id}`;
						logApiCall({ step: `Get schedule for ${auto.name}`, endpoint: detailUrl });
						const detailResponse = await fetch(detailUrl, { headers });
						const autoDetails = await detailResponse.json();
						if (!autoDetails.scheduleObject?.id) throw new Error("No se pudo obtener el 'scheduleObject.id'");
						payload = { id: auto.id, scheduleObject: { id: autoDetails.scheduleObject.id } };
					} catch (error) {
						failures.push({ name: auto.name, reason: error.message });
						continue;
					}
				}
				logApiCall({ action: actionName, endpoint: actionURL, payload });
				const actionResponse = await fetch(actionURL, { method: 'POST', headers, body: JSON.stringify(payload) });
				if (actionResponse.ok) {
					successes.push({ name: auto.name });
					logApiResponse({ for: auto.name, status: 'Success' });
				} else {
					const responseData = await actionResponse.json();
					failures.push({ name: auto.name, reason: responseData.message || `Error ${actionResponse.status}` });
					logApiResponse({ for: auto.name, status: 'Failure', response: responseData });
				}
			}
		} catch (error) {
			logMessage(`Error fatal durante la acción '${actionName}': ${error.message}`);
			alert(`Error fatal: ${error.message}`);
		} finally {
			const alertSummary = `Acción '${actionName}' completada. Éxitos: ${successes.length}, Fallos: ${failures.length}.`;
			let logSummary = alertSummary;
			if (failures.length > 0) {
				const failureDetails = failures.map(f => `  - ${f.name}: ${f.reason}`).join('\n');
				logSummary += `\n\n--- Detalles de Fallos ---\n${failureDetails}`;
			}
			logMessage(logSummary);
			alert(alertSummary);
			unblockUI();
			endLogBuffering();
			refreshAutomationsTableBtn.click();
		}
	}


	// ==========================================================
	// --- 5. FUNCIONES AUXILIARES (HELPERS) ---
	// ==========================================================
	
	// --- 5.1. Helpers de API (SOAP, REST) ---

	/**
	 * Ejecuta una petición SOAP genérica, maneja la respuesta y los errores.
	 * @param {string} soapUri - La URL del endpoint SOAP.
	 * @param {string} soapPayload - El cuerpo XML de la petición.
	 * @param {string} successMessage - Mensaje a mostrar en caso de éxito.
	 * @returns {Promise<string>} La respuesta XML en formato de texto.
	 */
	async function executeSoapRequest(soapUri, soapPayload, successMessage) {
		logApiCall({ endpoint: soapUri, payload: soapPayload });
		const response = await fetch(soapUri, { method: 'POST', headers: { 'Content-Type': 'text/xml' }, body: soapPayload });
		const responseText = await response.text();
		logApiResponse({ status: response.status, body: responseText });
		if (responseText.includes('<OverallStatus>OK</OverallStatus>')) {
			logMessage(successMessage);
			if (!successMessage.includes("Búsqueda")) alert(successMessage);
			return responseText;
		} else {
			const errorMatch = responseText.match(/<StatusMessage>(.*?)<\/StatusMessage>/);
			throw new Error(errorMatch ? errorMatch[1] : 'Error desconocido en la respuesta SOAP.');
		}
	}

	/**
	 * Construye el fragmento XML para un único campo de Data Extension.
	 * @param {object} fieldData - Objeto con los datos del campo (name, type, length, etc.).
	 * @returns {string} La cadena XML para el campo.
	 */
	function buildFieldXml(fieldData) {
		const { name, type, length, defaultValue, isPrimaryKey, isRequired } = fieldData;
		let fieldXml = '';
		const commonNodes = `<CustomerKey>${name}</CustomerKey><Name>${name}</Name><IsRequired>${isRequired}</IsRequired><IsPrimaryKey>${isPrimaryKey}</IsPrimaryKey>`;
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

	/**
	 * Obtiene la ruta completa de una carpeta de forma recursiva.
	 * @param {string} folderId - El ID de la carpeta a buscar.
	 * @param {object} apiConfig - La configuración de la API autenticada.
	 * @returns {Promise<string>} La ruta completa de la carpeta (ej. "Carpeta A > Carpeta B").
	 */
	async function getFolderPath(folderId, apiConfig) {
		if (!folderId || isNaN(parseInt(folderId))) return '';
		const soapPayload = `<s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope" xmlns:a="http://schemas.xmlsoap.org/ws/2004/08/addressing"><s:Header><a:Action s:mustUnderstand="1">Retrieve</a:Action><a:To s:mustUnderstand="1">${apiConfig.soapUri}</a:To><fueloauth xmlns="http://exacttarget.com">${apiConfig.accessToken}</fueloauth></s:Header><s:Body xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema"><RetrieveRequestMsg xmlns="http://exacttarget.com/wsdl/partnerAPI"><RetrieveRequest><ObjectType>DataFolder</ObjectType><Properties>Name</Properties><Properties>ParentFolder.ID</Properties><Filter xsi:type="SimpleFilterPart"><Property>ID</Property><SimpleOperator>equals</SimpleOperator><Value>${folderId}</Value></Filter></RetrieveRequest></RetrieveRequestMsg></s:Body></s:Envelope>`;
		const responseText = await (await fetch(apiConfig.soapUri, { method: 'POST', headers: { 'Content-Type': 'text/xml' }, body: soapPayload })).text();
		const resultNode = new DOMParser().parseFromString(responseText, "application/xml").querySelector("Results");
		if (!resultNode) return '';
		const name = resultNode.querySelector("Name")?.textContent;
		const parentId = resultNode.querySelector("ParentFolder > ID")?.textContent;
		const parentPath = await getFolderPath(parentId, apiConfig);
		return parentPath ? `${parentPath} > ${name}` : name;
	}

	/**
	 * Obtiene el ObjectID de una Data Extension a partir de su nombre.
	 * @param {string} deName - El nombre de la DE.
	 * @param {object} apiConfig - Configuración de la API.
	 * @returns {Promise<object>} Un objeto con la propiedad `ObjectID`.
	 */
	async function getDeObjectId(deName, apiConfig) {
		const soapPayload = `<s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope" xmlns:a="http://schemas.xmlsoap.org/ws/2004/08/addressing"><s:Header><a:Action s:mustUnderstand="1">Retrieve</a:Action><a:To s:mustUnderstand="1">${apiConfig.soapUri}</a:To><fueloauth xmlns="http://exacttarget.com">${apiConfig.accessToken}</fueloauth></s:Header><s:Body xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema"><RetrieveRequestMsg xmlns="http://exacttarget.com/wsdl/partnerAPI"><RetrieveRequest><ObjectType>DataExtension</ObjectType><Properties>ObjectID</Properties><Filter xsi:type="SimpleFilterPart"><Property>Name</Property><SimpleOperator>equals</SimpleOperator><Value>${deName}</Value></Filter></RetrieveRequest></RetrieveRequestMsg></s:Body></s:Envelope>`;
		const responseText = await executeSoapRequest(apiConfig.soapUri, soapPayload, `ObjectID para '${deName}' obtenido.`);
		const objectIDNode = new DOMParser().parseFromString(responseText, "application/xml").querySelector("Results > ObjectID");
		if (!objectIDNode) throw new Error(`No se encontró DE con el nombre "${deName}".`);
		return { ObjectID: objectIDNode.textContent };
	}

	/**
	 * Busca actividades de importación que apunten a un ObjectID de una DE.
	 * @param {string} deObjectId - El ObjectID de la DE de destino.
	 * @param {object} apiConfig - Configuración de la API.
	 * @returns {Promise<Array>} Un array de objetos de importación encontrados.
	 */
	async function findImportsForDE(deObjectId, apiConfig) {
		logMessage(`Buscando Imports para el ObjectID: ${deObjectId}`);
		const soapPayload = `<s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope" xmlns:a="http://schemas.xmlsoap.org/ws/2004/08/addressing"><s:Header><a:Action s:mustUnderstand="1">Retrieve</a:Action><a:To s:mustUnderstand="1">${apiConfig.soapUri}</a:To><fueloauth xmlns="http://exacttarget.com">${apiConfig.accessToken}</fueloauth></s:Header><s:Body xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema"><RetrieveRequestMsg xmlns="http://exacttarget.com/wsdl/partnerAPI"><RetrieveRequest><ObjectType>ImportDefinition</ObjectType><Properties>Name</Properties><Properties>Description</Properties><Filter xsi:type="SimpleFilterPart"><Property>DestinationObject.ObjectID</Property><SimpleOperator>equals</SimpleOperator><Value>${deObjectId}</Value></Filter></RetrieveRequest></RetrieveRequestMsg></s:Body></s:Envelope>`;
		const responseText = await executeSoapRequest(apiConfig.soapUri, soapPayload, `Búsqueda de Imports completada.`);
		return Array.from(new DOMParser().parseFromString(responseText, "application/xml").querySelectorAll("Results")).map(node => ({
			name: node.querySelector("Name")?.textContent || 'N/A',
			type: 'Import',
			description: node.querySelector("Description")?.textContent || '---'
		}));
	}
	
	/**
	 * Busca QueryDefinitions que apunten a una DE por su nombre.
	 * @param {string} deName - El nombre de la DE de destino.
	 * @param {object} apiConfig - Configuración de la API.
	 * @returns {Promise<Array>} Un array de objetos de query encontrados.
	 */
	async function findQueriesForDE(deName, apiConfig) {
		logMessage(`Buscando Queries que apunten a la DE: ${deName}`);
		const filterXml = `<Filter xsi:type="SimpleFilterPart"><Property>DataExtensionTarget.Name</Property><SimpleOperator>equals</SimpleOperator><Value>${deName}</Value></Filter>`;
		return findQueriesByFilter(filterXml, apiConfig);
	}

	/**
	 * Busca QueryDefinitions en base a un filtro SOAP genérico y enriquece los resultados.
	 * @param {string} filterXml - El fragmento XML del filtro a aplicar.
	 * @param {object} apiConfig - La configuración de la API.
	 * @returns {Promise<Array>} Una promesa que resuelve a un array de queries encontradas.
	 */
	async function findQueriesByFilter(filterXml, apiConfig) {
		const soapPayload = `<s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope" xmlns:a="http://schemas.xmlsoap.org/ws/2004/08/addressing"><s:Header><a:Action s:mustUnderstand="1">Retrieve</a:Action><a:To s:mustUnderstand="1">${apiConfig.soapUri}</a:To><fueloauth xmlns="http://exacttarget.com">${apiConfig.accessToken}</fueloauth></s:Header><s:Body xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema"><RetrieveRequestMsg xmlns="http://exacttarget.com/wsdl/partnerAPI"><RetrieveRequest><ObjectType>QueryDefinition</ObjectType><Properties>Name</Properties><Properties>QueryText</Properties><Properties>TargetUpdateType</Properties><Properties>ObjectID</Properties>${filterXml}</RetrieveRequest></RetrieveRequestMsg></s:Body></s:Envelope>`;
		const responseText = await executeSoapRequest(apiConfig.soapUri, soapPayload, `Búsqueda de Queries completada.`);
		const queries = Array.from(new DOMParser().parseFromString(responseText, "application/xml").querySelectorAll("Results")).map(node => ({
			name: node.querySelector("Name")?.textContent || 'N/A',
			type: 'Query',
			description: node.querySelector("QueryText")?.textContent || '---',
			action: node.querySelector("TargetUpdateType")?.textContent || 'N/A',
			objectID: node.querySelector("ObjectID")?.textContent
		}));
		logMessage(`Encontradas ${queries.length} queries. Buscando sus automatizaciones...`);
		return await Promise.all(queries.map(q => findAutomationForQuery(q, apiConfig)));
	}

	/**
	 * Busca la automatización a la que pertenece una actividad de query.
	 * @param {object} query - El objeto de la query.
	 * @param {object} apiConfig - Configuración de la API.
	 * @returns {Promise<object>} El objeto de la query enriquecido con `automationName` y `step`.
	 */
	async function findAutomationForQuery(query, apiConfig) {
		if (!query.objectID) return { ...query, automationName: '---', step: '---' };
		const soapPayload = `<s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope" xmlns:a="http://schemas.xmlsoap.org/ws/2004/08/addressing"><s:Header><a:Action s:mustUnderstand="1">Retrieve</a:Action><a:To s:mustUnderstand="1">${apiConfig.soapUri}</a:To><fueloauth xmlns="http://exacttarget.com">${apiConfig.accessToken}</fueloauth></s:Header><s:Body xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema"><RetrieveRequestMsg xmlns="http://exacttarget.com/wsdl/partnerAPI"><RetrieveRequest><ObjectType>Activity</ObjectType><Properties>Program.ObjectID</Properties><Filter xsi:type="SimpleFilterPart"><Property>Definition.ObjectID</Property><SimpleOperator>equals</SimpleOperator><Value>${query.objectID}</Value></Filter></RetrieveRequest></RetrieveRequestMsg></s:Body></s:Envelope>`;
		const responseText = await (await fetch(apiConfig.soapUri, { method: 'POST', headers: { 'Content-Type': 'text/xml' }, body: soapPayload })).text();
		const programIdNode = new DOMParser().parseFromString(responseText, "application/xml").querySelector("Program > ObjectID");
		if (!programIdNode) return { ...query, automationName: '---', step: '---' };
		const restUrl = `${apiConfig.restUri}automation/v1/automations/${programIdNode.textContent}`;
		const autoData = await (await fetch(restUrl, { headers: { "Authorization": `Bearer ${apiConfig.accessToken}` } })).json();
		const step = autoData.steps?.find(s => s.activities?.some(a => a.activityObjectId === query.objectID))?.step || 'N/A';
		return { ...query, automationName: autoData.name || 'N/A', step };
	}

	/**
	 * Realiza una búsqueda de suscriptor por un campo específico.
	 * @param {string} property - El campo por el que buscar ('SubscriberKey' o 'EmailAddress').
	 * @param {string} value - El valor a buscar.
	 * @param {object} apiConfig - La configuración de la API (token, URI, etc.).
	 * @returns {Promise<Array>} - Una promesa que resuelve a un array de resultados.
	 */
	async function searchSubscriberByProperty(property, value, apiConfig) {
		const soapPayload = `<s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope" xmlns:a="http://schemas.xmlsoap.org/ws/2004/08/addressing" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><s:Header><a:Action s:mustUnderstand="1">Retrieve</a:Action><a:To s:mustUnderstand="1">${apiConfig.soapUri}</a:To><fueloauth xmlns="http://exacttarget.com">${apiConfig.accessToken}</fueloauth></s:Header><s:Body><RetrieveRequestMsg xmlns="http://exacttarget.com/wsdl/partnerAPI"><RetrieveRequest><ObjectType>Subscriber</ObjectType><Properties>CreatedDate</Properties><Properties>Client.ID</Properties><Properties>EmailAddress</Properties><Properties>SubscriberKey</Properties><Properties>Status</Properties><Properties>UnsubscribedDate</Properties><Filter xsi:type="SimpleFilterPart"><Property>${property}</Property><SimpleOperator>equals</SimpleOperator><Value>${value}</Value></Filter></RetrieveRequest></RetrieveRequestMsg></s:Body></s:Envelope>`;
		const responseText = await executeSoapRequest(apiConfig.soapUri, soapPayload, `Búsqueda por ${property} completada.`);
		return parseCustomerSearchResponse(responseText);
	}

	// --- 5.2. Parsers (XML, JSON) ---
	
	/**
	 * Parsea una respuesta SOAP de campos de DE y la convierte en un array de objetos.
	 * @param {string} xmlString - La respuesta XML de la API.
	 * @returns {Promise<Array>} Un array de objetos, cada uno representando un campo.
	 */
	function parseFullSoapFieldsAsync(xmlString) {
		return new Promise(resolve => {
			const fields = [];
			const parser = new DOMParser();
			const xmlDoc = parser.parseFromString(xmlString, "application/xml");
			const getText = (node, tagName) => node.querySelector(tagName)?.textContent || '';
			xmlDoc.querySelectorAll("Results").forEach(node => {
				const fieldType = getText(node, 'FieldType');
				let length = getText(node, 'MaxLength');
				if (fieldType.toLowerCase() === 'decimal' && getText(node, 'Scale') !== '0') length = `${length},${getText(node, 'Scale')}`;
				fields.push({ mc: getText(node, 'Name'), type: fieldType, len: length, defaultValue: getText(node, 'DefaultValue'), pk: getText(node, 'IsPrimaryKey') === 'true', req: getText(node, 'IsRequired') === 'true', ordinal: parseInt(getText(node, 'Ordinal'), 10) || 0, objectId: getText(node, 'ObjectID') });
			});
			resolve(fields.sort((a, b) => a.ordinal - b.ordinal));
		});
	}

	/**
	 * Parsea la respuesta de búsqueda de una DE para extraer su nombre y el ID de su carpeta.
	 * @param {string} xmlString - La respuesta XML de la API.
	 * @returns {Promise<object>} Un objeto con `categoryId` y `deName`, o un `error`.
	 */
	function parseDESearchResponse(xmlString) {
		return new Promise(resolve => {
			const parser = new DOMParser();
			const xmlDoc = parser.parseFromString(xmlString, "application/xml");
			if (xmlDoc.querySelector("OverallStatus")?.textContent.includes('Error')) {
				throw new Error(xmlDoc.querySelector("StatusMessage")?.textContent || 'Error desconocido en la respuesta SOAP.');
			}
			
			const resultNodes = xmlDoc.querySelectorAll("Results");
			const deList = Array.from(resultNodes).map(node => ({
				categoryId: node.querySelector("CategoryID")?.textContent,
				deName: node.querySelector("Name")?.textContent
			}));
			
			resolve(deList);
		});
	}
	
	/**
	 * Parsea la respuesta XML de la búsqueda de suscriptores y la convierte en un array de objetos.
	 * @param {string} xmlString - La respuesta XML de la API.
	 * @returns {Array} Un array de objetos de suscriptor.
	 */
	function parseCustomerSearchResponse(xmlString) {
		const parser = new DOMParser();
		const xmlDoc = parser.parseFromString(xmlString, "application/xml");
		if (xmlDoc.querySelector("OverallStatus")?.textContent.includes('Error')) {
			throw new Error(xmlDoc.querySelector("StatusMessage")?.textContent || 'Error desconocido en la respuesta SOAP.');
		}
		return Array.from(xmlDoc.querySelectorAll("Results")).map(node => {
			const getText = (tagName) => node.querySelector(tagName)?.textContent || null;
			return { subscriberKey: getText("SubscriberKey") || '---', emailAddress: getText("EmailAddress") || '---', status: getText("Status") || '---', createdDate: getText("CreatedDate") ? new Date(getText("CreatedDate")).toLocaleString() : '---', unsubscribedDate: getText("UnsubscribedDate") ? new Date(getText("UnsubscribedDate")).toLocaleString() : '---', isSubscriber: true };
		});
	}

	// --- 5.3. Renderizadores de Tablas ---
	/**
	 * Dibuja la tabla de resultados para el buscador de Data Extensions.
	 * @param {Array} results - Array de objetos con { name, path }.
	 */
	function renderDESearchResultsTable(results) {
		deSearchResultsTbody.innerHTML = '';
		if (!results || results.length === 0) {
			deSearchResultsTbody.innerHTML = '<tr><td colspan="2">No se encontraron Data Extensions con ese criterio.</td></tr>';
			return;
		}

		// Ordenamos los resultados alfabéticamente por la ruta completa para agrupar carpetas
		results.sort((a, b) => (a.path + a.name).localeCompare(b.path + b.name));

		results.forEach(result => {
			const row = deSearchResultsTbody.insertRow();
			row.innerHTML = `<td>${result.name}</td><td>${result.path}</td>`;
		});
	}

	/**
	 * Dibuja la tabla de resultados para el buscador de orígenes de datos.
	 * @param {Array} sources - Array de actividades (imports, queries) encontradas.
	 */
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

	/** 
	 * Pinta los resultados de la búsqueda de clientes en la tabla y gestiona la selección automática.
	 * @param {Array} results - El array de suscriptores encontrados.
	 */
	function renderCustomerSearchResults(results) {
		customerSearchTbody.innerHTML = '';
		selectedCustomerRow = null;
		selectedSubscriberData = null;
		getCustomerSendsBtn.disabled = true;
		getCustomerJourneysBtn.disabled = true;
		if (!results || results.length === 0) {
			customerSearchTbody.innerHTML = '<tr><td colspan="6">No se encontraron clientes con ese criterio.</td></tr>';
			return;
		}
		results.forEach((sub, index) => {
			const row = document.createElement('tr');
			row.dataset.subscriberKey = sub.subscriberKey;
			row.dataset.isSubscriber = sub.isSubscriber;
			row.innerHTML = `<td>${sub.subscriberKey}</td><td>${sub.emailAddress}</td><td>${sub.status}</td><td>${sub.createdDate}</td><td>${sub.unsubscribedDate}</td><td>${sub.isSubscriber ? 'Sí' : 'No'}</td>`;
			if (results.length === 1 && index === 0) {
				row.classList.add('selected');
				selectedCustomerRow = row;
				selectedSubscriberData = { subscriberKey: sub.subscriberKey, isSubscriber: sub.isSubscriber };
				getCustomerJourneysBtn.disabled = false;
				if (sub.isSubscriber) getCustomerSendsBtn.disabled = false;
			}
			customerSearchTbody.appendChild(row);
		});
	}
	
	/**
	 * Pinta los detalles de los journeys de un cliente en su tabla correspondiente.
	 * @param {Array} journeys - Array de objetos de Journey.
	 */
	function renderCustomerJourneysTable(journeys) {
		customerJourneysTbody.innerHTML = '';
		if (!journeys || journeys.length === 0) {
			customerJourneysTbody.innerHTML = '<tr><td colspan="6">No se pudieron recuperar los detalles de los Journeys.</td></tr>';
			return;
		}
		journeys.forEach(journey => {
			const row = document.createElement('tr');
			row.innerHTML = `<td>${journey.name || '---'}</td><td>${journey.id || '---'}</td><td>${journey.key || '---'}</td><td>${journey.version || '---'}</td><td>${journey.createdDate ? new Date(journey.createdDate).toLocaleString() : '---'}</td><td>${journey.modifiedDate ? new Date(journey.modifiedDate).toLocaleString() : '---'}</td>`;
			customerJourneysTbody.appendChild(row);
		});
	}
	
	/**
	 * Renderiza una tabla dinámica a partir de los items de una Data View.
	 * @param {HTMLElement} containerElement - El div donde se inyectará la tabla.
	 * @param {Array} items - El array de 'items' de la respuesta de la API.
	 */
	function renderDataViewTable(containerElement, items) {
		containerElement.innerHTML = '';
		if (!items || items.length === 0) {
			containerElement.innerHTML = '<p>No se encontraron registros.</p>';
			return;
		}
		const table = document.createElement('table');
		const thead = document.createElement('thead');
		const tbody = document.createElement('tbody');
		const headerRow = document.createElement('tr');
		const headers = Object.keys(items[0].values);
		headers.forEach(headerText => {
			const th = document.createElement('th');
			th.textContent = headerText;
			headerRow.appendChild(th);
		});
		thead.appendChild(headerRow);
		items.forEach(item => {
			const row = document.createElement('tr');
			headers.forEach(header => {
				const td = document.createElement('td');
				td.textContent = item.values[header] || '---';
				row.appendChild(td);
			});
			tbody.appendChild(row);
		});
		table.append(thead, tbody);
		containerElement.appendChild(table);
	}

	/**
	 * Pinta los resultados de la búsqueda de texto en queries en su tabla.
	 * @param {Array} queries - Array de queries encontradas.
	 */
	function renderQuerySearchResults(queries) {
		querySearchResultsTbody.innerHTML = '';
		const showQuery = showQueryTextCheckbox.checked;
		const displayStyle = showQuery ? '' : 'none';
		const table = document.getElementById('query-search-results-table');
		table.querySelector('thead th:nth-child(4)').style.display = displayStyle;
		if (queries.length === 0) {
			querySearchResultsTbody.innerHTML = '<tr><td colspan="4">No se encontraron queries con ese texto.</td></tr>';
			return;
		}
		queries.forEach(query => {
			const row = document.createElement('tr');
			const queryLink = constructQueryLink(query.objectID);
			const queryNameCell = queryLink ? `<td><a href="${queryLink}" class="external-link" title="Abrir query en Marketing Cloud">${query.name}</a></td>` : `<td>${query.name}</td>`;
			row.innerHTML = `${queryNameCell}<td>${query.automationName || '---'}</td><td>${query.step || '---'}</td><td style="white-space: pre-wrap; word-break: break-all; display: ${displayStyle};">${query.description}</td>`;
			querySearchResultsTbody.appendChild(row);
		});
	}

	/**
     * Dibuja la tabla de la vista "Gestión de Automatismos" con los datos proporcionados.
     * @param {Array} automations - El array de automatismos a mostrar.
     */
	function renderAutomationsTable(automations) {
		automationsTbody.innerHTML = '';
		updateSortIndicators();
		if (!automations || automations.length === 0) {
			automationsTbody.innerHTML = '<tr><td colspan="4">No hay automatismos para mostrar.</td></tr>';
			return;
		}
		const sortedData = sortAutomations(automations);
		sortedData.forEach(auto => {
			const row = document.createElement('tr');
			row.dataset.automationId = auto.id;
			row.innerHTML = `<td>${auto.name || 'Sin Nombre'}</td><td>${formatDateToSpanishTime(auto.lastRunTime)}</td><td>${formatDateToSpanishTime(auto.scheduledTime)}</td><td>${auto.status || '---'}</td>`;
			automationsTbody.appendChild(row);
		});
	}

	// --- 5.4. Otros Helpers ---
	
	/**
	 * Construye la URL para abrir una Query Activity en la UI de Automation Studio.
	 * @param {string} queryObjectId - El ObjectID de la Query Definition.
	 * @returns {string|null} La URL completa o null si falta información.
	 */
	function constructQueryLink(queryObjectId) {
		if (!currentOrgInfo || !currentOrgInfo.stack_key || !businessUnitInput.value) return null;
		const stack = currentOrgInfo.stack_key.toLowerCase();
		const mid = businessUnitInput.value;
		return `https://mc.${stack}.exacttarget.com/cloud/#app/Automation%20Studio/AutomationStudioFuel3/%23ActivityDetails/300/${queryObjectId}`;
	}

	/**
     * Formatea una cadena de fecha ISO (UTC) a una cadena legible en horario de España.
     * @param {string} dateString - La fecha en formato ISO (ej: "2025-08-19T19:34:00Z").
     * @returns {string} La fecha formateada o '---' si no es válida.
     */
	function formatDateToSpanishTime(dateString) {
		if (!dateString || dateString.startsWith('0001-01-01')) return '---';
		try {
			const date = new Date(dateString);
			return date.toLocaleString('es-ES', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: 'Europe/Madrid' });
		} catch (error) {
			return 'Fecha inválida';
		}
	}

	/**
     * Rellena el desplegable de estados con los estados únicos de la lista de automatismos.
     * @param {Array} automations - La lista completa de automatismos.
     */
	function populateStatusFilter(automations) {
		const currentSelectedValue = automationStatusFilter.value;
		automationStatusFilter.innerHTML = '<option value="">Todos los estados</option>';
		const statuses = [...new Set(automations.map(auto => auto.status).filter(Boolean))].sort();
		statuses.forEach(status => automationStatusFilter.appendChild(new Option(status, status)));
		automationStatusFilter.value = currentSelectedValue;
	}

	/**
     * Aplica los filtros de nombre y estado a la lista de automatismos y redibuja la tabla.
     */
	function applyFiltersAndRender() {
		const nameFilter = automationNameFilter.value.toLowerCase().trim();
		const statusFilter = automationStatusFilter.value;
		let filteredAutomations = fullAutomationList;
		if (nameFilter) {
			filteredAutomations = filteredAutomations.filter(auto => auto.name.toLowerCase().includes(nameFilter));
		}
		if (statusFilter) {
			filteredAutomations = filteredAutomations.filter(auto => auto.status === statusFilter);
		}
		renderAutomationsTable(filteredAutomations);
	}

	/**
     * Evalúa la selección de automatismos y actualiza el estado (habilitado/deshabilitado)
     * de los botones de acción masiva.
     */
	function updateAutomationButtonsState() {
		const selectedRows = document.querySelectorAll('#automations-table tbody tr.selected');
		const selectedAutomations = Array.from(selectedRows).map(row => fullAutomationList.find(auto => auto.id === row.dataset.automationId)).filter(Boolean);
		if (selectedAutomations.length === 0) {
			activateAutomationBtn.disabled = true; runAutomationBtn.disabled = true; stopAutomationBtn.disabled = true;
			return;
		}
		const statuses = [...new Set(selectedAutomations.map(auto => auto.status))];
		if (statuses.length > 1) {
			activateAutomationBtn.disabled = true; runAutomationBtn.disabled = true; stopAutomationBtn.disabled = true;
			return;
		}
		const singleStatus = statuses[0].toLowerCase();
		switch (singleStatus) {
			case 'pausedschedule':
			case 'stopped':
				activateAutomationBtn.disabled = false; runAutomationBtn.disabled = false; stopAutomationBtn.disabled = true;
				break;
			case 'scheduled':
			case 'ready':
				activateAutomationBtn.disabled = true; runAutomationBtn.disabled = true; stopAutomationBtn.disabled = false;
				break;
			default:
				activateAutomationBtn.disabled = true; runAutomationBtn.disabled = true; stopAutomationBtn.disabled = true;
		}
	}
	
	/**
     * Ordena un array de automatismos según la columna y dirección actuales.
     * @param {Array} dataToSort - El array de automatismos a ordenar.
     * @returns {Array} El array ordenado.
     */
	function sortAutomations(dataToSort) {
		const sortKey = currentSortColumn;
		const direction = currentSortDirection === 'asc' ? 1 : -1;
		const getValue = (obj, key) => (key === 'schedule.scheduledTime') ? obj.schedule?.scheduledTime : obj[key];
		return [...dataToSort].sort((a, b) => {
			let valA = getValue(a, sortKey);
			let valB = getValue(b, sortKey);
			if (valA == null) return 1;
			if (valB == null) return -1;
			let compareResult = 0;
			if (sortKey.includes('Time')) compareResult = new Date(valA) - new Date(valB);
			else compareResult = String(valA).localeCompare(String(valB), undefined, { sensitivity: 'base' });
			const finalResult = compareResult * direction;
			if (finalResult === 0 && sortKey !== 'name') {
				return (a.name || '').localeCompare(b.name || '', undefined, { sensitivity: 'base' });
			}
			return finalResult;
		});
	}

	/**
     * Actualiza los indicadores visuales de ordenación (flechas) en las cabeceras de la tabla.
     */
	function updateSortIndicators() {
		document.querySelectorAll('#automations-table .sortable-header').forEach(header => {
			header.classList.remove('sort-asc', 'sort-desc');
			if (header.dataset.sortBy === currentSortColumn) {
				header.classList.add(currentSortDirection === 'asc' ? 'sort-asc' : 'sort-desc');
			}
		});
	}


	// ==========================================================
	// --- 6. MANIPULACIÓN DEL DOM Y COMPONENTES ---
	// ==========================================================
	
	// --- 6.1. Tabla de Campos ---

	/**
	 * Crea una nueva fila `<tr>` para la tabla de campos.
	 * @param {object} [data={}] - Objeto opcional con datos para pre-rellenar la fila.
	 * @returns {HTMLTableRowElement} El elemento de la fila creado.
	 */
	function createTableRow(data = {}) {
		const row = document.createElement('tr');
		const fieldData = { mc: data.mc || '', type: data.type || '', len: data.len || '', defaultValue: data.defaultValue || '', pk: data.pk || false, req: data.req || false };
		row.innerHTML = `<td contenteditable="true">${fieldData.mc}</td><td contenteditable="true">${fieldData.type}</td><td contenteditable="true">${fieldData.len}</td><td contenteditable="true">${fieldData.defaultValue}</td><td><input type="checkbox" ${fieldData.pk ? 'checked' : ''}></td><td><input type="checkbox" ${fieldData.req ? 'checked' : ''}></td>`;
		const deleteButton = document.createElement('button');
		deleteButton.className = 'delete-row-btn';
		deleteButton.title = 'Eliminar fila';
		deleteButton.textContent = '×';
		row.appendChild(deleteButton);
		return row;
	}
	
	/**
	 * Rellena la tabla de campos con un array de objetos de campo.
	 * @param {Array} [fields=[]] - El array de campos.
	 */
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
	
	/** Limpia completamente la tabla de campos y añade una fila vacía. */
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
	
	/** Rellena la tabla con un conjunto de campos de ejemplo. */
	function createDummyFields() {
		populateFieldsTable([{ mc: 'NombreCompleto', type: 'Text', len: '100', pk: true, req: true }, { mc: 'Email', type: 'EmailAddress', len: '254', req: true }, { mc: 'SincronizarMC', type: 'Boolean', defaultValue: 'true' }, { mc: 'FechaNacimiento', type: 'Date' }, { mc: 'Recibo', type: 'Decimal', len: '18,2' }, { mc: 'Telefono', type: 'Phone' }, { mc: 'Locale', type: 'Locale' }, { mc: 'Numero', type: 'Number' }]);
		populateDeletionPicklist([]);
	}
	
	/**
	 * Extrae los datos de todas las filas de la tabla de campos.
	 * @returns {Array} Un array de objetos, cada uno representando un campo.
	 */
	function getFieldsDataFromTable() {
		return Array.from(fieldsTableBody.querySelectorAll('tr')).map(row => {
			const cells = row.querySelectorAll('td');
			const name = cells[0].textContent.trim();
			const type = cells[1].textContent.trim();
			return (name && type) ? { name, type, length: cells[2].textContent.trim(), defaultValue: cells[3].textContent.trim(), isPrimaryKey: cells[4].querySelector('input').checked, isRequired: cells[5].querySelector('input').checked } : null;
		}).filter(Boolean);
	}
	
	/** Actualiza las opciones del desplegable de Subscriber Key basándose en los campos de la tabla. */
	function updateSubscriberKeyFieldOptions() {
		const currentSelection = subscriberKeyFieldSelect.value;
		subscriberKeyFieldSelect.innerHTML = '<option value="">-- Seleccione un campo --</option>';
		getFieldsDataFromTable().forEach(field => {
			if (field.name) {
				const option = new Option(field.name, field.name);
				option.dataset.type = field.type;
				subscriberKeyFieldSelect.appendChild(option);
			}
		});
		subscriberKeyFieldSelect.value = Array.from(subscriberKeyFieldSelect.options).some(opt => opt.value === currentSelection) ? currentSelection : '';
	}
	
	/** Habilita o deshabilita los campos de "Sendable" según el estado del checkbox. */
	function handleSendableChange() {
		subscriberKeyFieldSelect.disabled = !isSendableCheckbox.checked;
		if (!isSendableCheckbox.checked) {
			subscriberKeyFieldSelect.value = '';
			subscriberKeyTypeInput.value = '';
		}
	}
	
	/**
	 * Rellena el desplegable de campos a eliminar con los campos recuperados de una DE.
	 * @param {Array} fields - Array de campos recuperados de la API.
	 */
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

	// --- 6.2. Calendario ---

	/** Muestra la sección del calendario y la inicializa. */
	function viewCalendar() {
		showSection('calendario-section');
		populateCalendarYearSelect();
		const savedDataRaw = localStorage.getItem('calendarAutomations');
		if (savedDataRaw) {
			const savedData = JSON.parse(savedDataRaw);
			if (savedData.client === clientNameInput.value) {
				allAutomations = savedData.automations;
				calendarDataForClient = savedData.client;
				startLogBuffering();
				logMessage(`${allAutomations.length} automatizaciones cargadas de la memoria local.`);
				endLogBuffering();
				generateCalendar();
				return;
			}
		}
		allAutomations = [];
		generateCalendar();
		startLogBuffering();
		logMessage('No hay datos de calendario. Pulsa "Refrescar Datos".');
		endLogBuffering();
	}
	
	/** Limpia los datos del calendario y resetea la vista. */
	function clearCalendarData() {
		allAutomations = [];
		calendarDataForClient = '';
		if (automationList) automationList.innerHTML = '<p>Selecciona un día para ver los detalles.</p>';
		if (calendarGrid) generateCalendar();
		logMessage('Datos del calendario limpiados.');
	}
	
	/**
	 * Procesa los datos crudos de automatización de la API a un formato simple para el calendario.
	 * @param {Array} items - Array de automatismos crudos de la API.
	 */
	function processAndStoreAutomations(items) {
		allAutomations = items.map(auto => {
			const dateToUse = auto.scheduledTime;
			if (!dateToUse) return null;
			const dateObj = new Date(dateToUse);
			if (isNaN(dateObj.getTime())) return null;
			return { name: auto.name, status: auto.status, scheduledTime: dateObj.toISOString().split('T')[0], scheduledHour: dateObj.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Madrid' }) };
		}).filter(Boolean);
	}
	
	/** Dibuja la estructura completa del calendario para el año seleccionado. */
	function generateCalendar() {
		const year = calendarYearSelect.value;
		calendarGrid.innerHTML = "";
		const months = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
		const days = ["Lu", "Ma", "Mi", "Ju", "Vi", "Sa", "Do"];
		for (let i = 0; i < 12; i++) {
			const monthDiv = document.createElement("div");
			monthDiv.className = "calendar-month";
			monthDiv.innerHTML = `<h3>${months[i]} ${year}</h3>`;
			const table = document.createElement("table");
			table.innerHTML = `<thead><tr>${days.map(d => `<th>${d}</th>`).join('')}</tr></thead>`;
			const tbody = document.createElement("tbody");
			let firstDay = (new Date(year, i, 1).getDay() + 6) % 7;
			const totalDays = new Date(year, i + 1, 0).getDate();
			let date = 1;
			for (let rowIdx = 0; rowIdx < 6 && date <= totalDays; rowIdx++) {
				const row = document.createElement("tr");
				for (let colIdx = 0; colIdx < 7; colIdx++) {
					const cell = document.createElement("td");
					if ((rowIdx > 0 || colIdx >= firstDay) && date <= totalDays) {
						const currentDate = `${year}-${String(i + 1).padStart(2, '0')}-${String(date).padStart(2, '0')}`;
						cell.innerText = date;
						cell.dataset.date = currentDate;
						if (allAutomations.some(auto => auto.scheduledTime === currentDate)) cell.classList.add("has-automation");
						if (colIdx >= 5) cell.classList.add("weekend");
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
	
	/**
	 * Muestra en la barra lateral del calendario las automatizaciones para un día específico.
	 * @param {string} date - La fecha seleccionada en formato YYYY-MM-DD.
	 */
	function filterAutomationsForDay(date) {
		automationList.innerHTML = '';
		dailyFilteredAutomations = allAutomations.filter(auto => auto.scheduledTime === date).sort((a, b) => a.scheduledHour.localeCompare(b.scheduledHour));
		automationListHeader.classList.toggle('clickable', dailyFilteredAutomations.length > 0);
		if (dailyFilteredAutomations.length > 0) {
			dailyFilteredAutomations.forEach(auto => {
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
		const currentYear = new Date().getFullYear();
		if (calendarYearSelect.options.length === 0) {
			for (let i = currentYear - 2; i <= currentYear + 3; i++) {
				calendarYearSelect.appendChild(new Option(i, i));
			}
		}
		calendarYearSelect.value = currentYear;
	}

	// --- 6.3. Modal de Importación ---
	
	/** Cierra y resetea el modal de importación de campos. */
	function closeImportModal() {
		importModal.style.display = 'none';
		pasteDataArea.value = '';
		delimiterSelect.value = 'tab';
		customDelimiterInput.classList.add('hidden');
	}

	/** Procesa los datos pegados en el modal y los añade a la tabla de campos. */
	function processPastedData() {
		startLogBuffering();
		try {
			const text = pasteDataArea.value.trim();
			if (!text) return;
			let delimiter;
			const selectedDelimiter = delimiterSelect.value;
			if (selectedDelimiter === 'other') delimiter = customDelimiterInput.value;
			else if (selectedDelimiter === 'comma') delimiter = ',';
			else if (selectedDelimiter === 'semicolon') delimiter = ';';
			else delimiter = '\t';
			if (!delimiter) return alert('Por favor, introduce un separador.');
			const newFields = text.split('\n').map(line => {
				if (!line.trim()) return null;
				const [name, type, length] = line.split(delimiter).map(c => c.trim());
				return (name && type) ? { mc: name, type, len: length || '' } : null;
			}).filter(Boolean);
			if (newFields.length > 0) {
				observer.disconnect();
				newFields.forEach(fieldData => fieldsTableBody.appendChild(createTableRow(fieldData)));
				updateSubscriberKeyFieldOptions();
				observer.observe(fieldsTableBody, observerConfig);
				logMessage(`${newFields.length} campos importados.`);
			}
			closeImportModal();
		} finally {
			endLogBuffering();
		}
	}
	
	// --- 6.4. Menús Colapsables y Automatismos ---
	
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

	/**
	 * Muestra la vista de "Gestión de Automatismos" y la puebla con datos.
	 * @param {Array|null} [automationsToShow=null] - Si se proporciona, muestra solo estos automatismos.
	 */
	async function viewAutomations(automationsToShow = null) {
        showSection('gestion-automatismos-section');
        document.querySelectorAll('#automations-table tbody tr.selected').forEach(row => row.classList.remove('selected'));
		let dataToRender;
        if (automationsToShow) {
            dataToRender = automationsToShow;
        } else {
            if (fullAutomationList.length === 0) await macroGetAllAutomationDetails();
            dataToRender = fullAutomationList;
        }
        renderAutomationsTable(dataToRender);
    }


	// ==========================================================
	// --- 7. EVENT LISTENERS ---
	// ==========================================================
	
	/**
	 * Configura todos los event listeners de la aplicación una sola vez.
	 */
	function setupEventListeners() {

		// --- Listeners de Configuración y Sesión ---
		saveConfigBtn.addEventListener('click', () => {
			startLogBuffering();
			try {
				const clientName = clientNameInput.value.trim();
				if (!clientName) return alert('Introduzca un nombre para el cliente antes de guardar.');
				let configs = JSON.parse(localStorage.getItem('mcApiConfigs')) || {};
				configs[clientName] = getConfigToSave();
				localStorage.setItem('mcApiConfigs', JSON.stringify(configs));
				loadConfigsIntoSelect();
				logMessage(`Configuración para "${clientName}" guardada localmente.`);
				alert(`Configuración para "${clientName}" guardada.`);
			} finally {
				endLogBuffering();
			}
		});

		loginBtn.addEventListener('click', () => {
			startLogBuffering();
			try {
				const clientName = clientNameInput.value.trim();
				if (!clientName) return alert('Introduzca un nombre para el cliente.');
				const config = { clientName, authUri: authUriInput.value.trim(), clientId: clientIdInput.value.trim(), clientSecret: clientSecretInput.value.trim(), businessUnit: businessUnitInput.value.trim() };
				if (!config.authUri || !config.clientId || !config.clientSecret || !config.businessUnit) return alert('Se necesitan Auth URI, Client ID, Client Secret y MID para el login.');
				let configs = JSON.parse(localStorage.getItem('mcApiConfigs')) || {};
				configs[clientName] = getConfigToSave();
				localStorage.setItem('mcApiConfigs', JSON.stringify(configs));
				loadConfigsIntoSelect();
				logMessage("Configuración guardada. Iniciando login...");
				blockUI();
				window.electronAPI.startLogin(config);
			} finally {
				endLogBuffering();
			}
		});

		logoutBtn.addEventListener('click', () => {
			startLogBuffering();
			try {
				const clientName = savedConfigsSelect.value;
				if (!clientName) return alert("Seleccione un cliente para hacer logout.");
				if (confirm(`Esto borrará la configuración y cerrará la sesión para "${clientName}". ¿Continuar?`)) {
					let configs = JSON.parse(localStorage.getItem('mcApiConfigs')) || {};
					delete configs[clientName];
					localStorage.setItem('mcApiConfigs', JSON.stringify(configs));
					window.electronAPI.logout(clientName);
				}
			} finally {
				endLogBuffering();
			}
		});

		savedConfigsSelect.addEventListener('change', (e) => loadAndSyncClientConfig(e.target.value));
		sidebarClientSelect.addEventListener('change', (e) => loadAndSyncClientConfig(e.target.value));

		// --- Listeners de Eventos desde el Proceso Principal (main.js) ---
		window.electronAPI.onTokenReceived(result => {
			unblockUI();
			startLogBuffering();
			if (result.success) {
				logMessage("Login exitoso. Sesión activa.");
				alert("Login completado con éxito.");
				loadAndSyncClientConfig(clientNameInput.value);
			} else {
				logMessage(`Error durante el login: ${result.error}`);
				alert(`Hubo un error en el login: ${result.error}`);
				updateLoginStatus(false);
			}
			endLogBuffering();
		});

		window.electronAPI.onLogoutSuccess(() => {
			startLogBuffering();
			alert(`Sesión cerrada y configuración borrada.`);
			logMessage("Sesión cerrada y configuración borrada.");
			loadConfigsIntoSelect();
			loadAndSyncClientConfig('');
			endLogBuffering();
		});

		window.electronAPI.onRequireLogin(data => {
			startLogBuffering();
			alert(`La sesión ha expirado o no es válida. Por favor, haz login de nuevo.\n\nMotivo: ${data.message}`);
			logMessage(`LOGIN REQUERIDO: ${data.message}`);
			updateLoginStatus(false);
			endLogBuffering();
		});

		// --- Listeners de Navegación ---
		document.querySelectorAll('.back-button').forEach(b => b.addEventListener('click', goBack));
		document.querySelectorAll('.macro-item').forEach(item => {
			item.addEventListener('click', (e) => {
				e.preventDefault();
				const macro = e.target.getAttribute('data-macro');
				const sectionMap = { 'docu': 'documentacion-section', 'configuracionAPIs': 'configuracion-apis-section', 'configuracionDE': 'configuracion-de-section', 'campos': 'campos-section', 'gestionCampos': 'configuracion-campos-section', 'validadorEmail': 'email-validator-section', 'buscadores': 'buscadores-section' };
				if (sectionMap[macro]) showSection(sectionMap[macro]);
				else if (macro === 'calendario') viewCalendar();
				else if (macro === 'gestionAutomatismos') viewAutomations();
			});
		});

		// --- Listeners de Botones de Macros ---
		createDEBtn.addEventListener('click', macroCreateDE);
		createFieldsBtn.addEventListener('click', macroCreateFields);
		getFieldsBtn.addEventListener('click', macroGetFields);
		deleteFieldBtn.addEventListener('click', macroDeleteField);
		searchDEBtn.addEventListener('click', macroSearchDE);
		validateEmailBtn.addEventListener('click', macroValidateEmail);
		findDataSourcesBtn.addEventListener('click', macroFindDataSources);
		searchCustomerBtn.addEventListener('click', macroSearchCustomer);
		searchQueriesByTextBtn.addEventListener('click', macroSearchQueriesByText);
		getCustomerSendsBtn.addEventListener('click', () => { if (selectedSubscriberData) macroGetCustomerSends(); });
		getCustomerJourneysBtn.addEventListener('click', () => { if (selectedSubscriberData) macroGetCustomerJourneys(); });

		// --- Listeners de la Tabla de Campos ---
		createDummyFieldsBtn.addEventListener('click', createDummyFields);
		clearFieldsBtn.addEventListener('click', clearFieldsTable);
		addFieldBtn.addEventListener('click', () => addNewField(true));
		fieldsTableBody.addEventListener('click', (e) => {
			const targetRow = e.target.closest('tr');
			if (!targetRow) return;
			if (e.target.matches('.delete-row-btn')) {
				observer.disconnect();
				if (targetRow === selectedRow) selectedRow = null;
				targetRow.remove();
				updateSubscriberKeyFieldOptions();
				observer.observe(fieldsTableBody, observerConfig);
			} else {
				if (targetRow !== selectedRow) {
					if (selectedRow) selectedRow.classList.remove('selected');
					targetRow.classList.add('selected');
					selectedRow = targetRow;
				}
			}
		});
		moveUpBtn.addEventListener('click', () => { if (selectedRow?.previousElementSibling) selectedRow.parentNode.insertBefore(selectedRow, selectedRow.previousElementSibling); });
		moveDownBtn.addEventListener('click', () => { if (selectedRow?.nextElementSibling) selectedRow.parentNode.insertBefore(selectedRow.nextElementSibling, selectedRow); });
		isSendableCheckbox.addEventListener('change', handleSendableChange);
		subscriberKeyFieldSelect.addEventListener('change', () => { subscriberKeyTypeInput.value = subscriberKeyFieldSelect.options[subscriberKeyFieldSelect.selectedIndex]?.dataset.type || ''; });
		deNameInput.addEventListener('input', () => { deExternalKeyInput.value = deNameInput.value.replace(/\s+/g, '_') + '_CK'; });
		authUriInput.addEventListener('blur', () => {
			const uri = authUriInput.value.trim();
			if (uri && !uri.endsWith('v2/token')) {
				authUriInput.value = (uri.endsWith('/') ? uri : uri + '/') + 'v2/token';
			}
		});

		// --- Listeners del Modal de Importación ---
		importFieldsBtn.addEventListener('click', () => { importModal.style.display = 'flex'; pasteDataArea.focus(); });
		cancelPasteBtn.addEventListener('click', closeImportModal);
		importModal.addEventListener('click', (e) => { if (e.target === importModal) closeImportModal(); });
		delimiterSelect.addEventListener('change', () => { customDelimiterInput.classList.toggle('hidden', delimiterSelect.value !== 'other'); if (delimiterSelect.value === 'other') customDelimiterInput.focus(); });
		processPasteBtn.addEventListener('click', processPastedData);
		
		// --- Listeners de Componentes de UI Generales ---
		toggleLogBtn.addEventListener('click', () => { const isCollapsed = appContainer.classList.toggle('log-collapsed'); localStorage.setItem('logCollapsedState', isCollapsed); });
		tabButtons.forEach(button => button.addEventListener('click', () => {
			const tabId = button.getAttribute('data-tab');
			const parent = button.closest('.tabs-container');
			parent.querySelectorAll('.tab-button').forEach(btn => btn.classList.remove('active'));
			parent.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
			button.classList.add('active');
			parent.querySelector(`#${tabId}`).classList.add('active');
		}));
		collapsibleHeaders.forEach(header => header.addEventListener('click', () => {
			const content = header.nextElementSibling;
			const isExpanded = header.classList.toggle('active');
			content.style.maxHeight = isExpanded ? content.scrollHeight + "px" : "0px";
			const states = JSON.parse(localStorage.getItem('collapsibleStates')) || {};
			states[header.textContent.trim()] = isExpanded;
			localStorage.setItem('collapsibleStates', JSON.stringify(states));
		}));
		querySearchResultsTbody.addEventListener('click', (e) => {
			const link = e.target.closest('a.external-link');
			if (link) { e.preventDefault(); window.electronAPI.openExternalLink(link.href); }
		});
		showQueryTextCheckbox.addEventListener('change', () => {
			const isChecked = showQueryTextCheckbox.checked;
			const displayStyle = isChecked ? '' : 'none';
			const table = document.getElementById('query-search-results-table');
			table.querySelectorAll('thead th:nth-child(4), tbody td:nth-child(4)').forEach(cell => {
				cell.style.display = displayStyle;
			});
		});

		// --- Listeners del Calendario ---
		refreshAutomationsBtn.addEventListener('click', async () => {
			blockUI();
			startLogBuffering();
			try {
				await macroGetAutomations();
			} catch (e) {
				logMessage(`Error al refrescar automatismos del calendario: ${e.message}`);
				alert(`Error: ${e.message}`);
			} finally {
				unblockUI();
				endLogBuffering();
			}
		});
		refreshJourneyAutomationsBtn.addEventListener('click', async () => {
			blockUI();
			startLogBuffering();
			try {
				await macroGetJourneyAutomations();
			} catch (e) {
				logMessage(`Error al refrescar journeys del calendario: ${e.message}`);
				alert(`Error: ${e.message}`);
			} finally {
				unblockUI();
				endLogBuffering();
			}
		});
		calendarYearSelect.addEventListener('change', generateCalendar);
		calendarGrid.addEventListener('click', (e) => {
			if (e.target.tagName === 'TD' && e.target.dataset.date) {
				document.querySelectorAll('.calendar-month td.selected').forEach(c => c.classList.remove('selected'));
				e.target.classList.add('selected');
				filterAutomationsForDay(e.target.dataset.date);
			}
		});
		automationListHeader.addEventListener('click', () => {
            if (automationListHeader.classList.contains('clickable')) {
                const detailedAutomations = fullAutomationList.filter(fullAuto => dailyFilteredAutomations.some(dailyAuto => dailyAuto.name === fullAuto.name));
                viewAutomations(detailedAutomations);
            }
        });

		// --- Listeners de Búsqueda de Clientes ---
		customerSearchTbody.addEventListener('click', (e) => {
			const clickedRow = e.target.closest('tr');
			if (!clickedRow || !clickedRow.dataset.subscriberKey) return;
			if (selectedCustomerRow) selectedCustomerRow.classList.remove('selected');
			clickedRow.classList.add('selected');
			selectedCustomerRow = clickedRow;
			selectedSubscriberData = { subscriberKey: clickedRow.dataset.subscriberKey, isSubscriber: clickedRow.dataset.isSubscriber === 'true' };
			getCustomerJourneysBtn.disabled = false;
			getCustomerSendsBtn.disabled = !selectedSubscriberData.isSubscriber;
			customerJourneysResultsBlock.classList.add('hidden');
			customerSendsResultsBlock.classList.add('hidden');
		});

		// --- Listeners de Gestión de Automatismos ---
		automationsTbody.addEventListener('click', (e) => {
            const clickedRow = e.target.closest('tr');
            if (!clickedRow || !clickedRow.dataset.automationId) return;
            clickedRow.classList.toggle('selected');
            updateAutomationButtonsState();
        });
		activateAutomationBtn.addEventListener('click', () => macroPerformAutomationAction('activate'));
        runAutomationBtn.addEventListener('click', () => macroPerformAutomationAction('run'));
        stopAutomationBtn.addEventListener('click', () => macroPerformAutomationAction('pause'));
		refreshAutomationsTableBtn.addEventListener('click', async () => {
			blockUI();
			startLogBuffering();
			try {
				logMessage("Refrescando lista de automatismos...");
				fullAutomationList = [];
				automationNameFilter.value = '';
				automationStatusFilter.value = '';
				await viewAutomations();
			} finally {
				unblockUI();
				endLogBuffering();
			}
        });
		document.querySelector('#automations-table thead').addEventListener('click', (e) => {
            const header = e.target.closest('.sortable-header');
            if (!header) return;
            const newSortColumn = header.dataset.sortBy;
            if (currentSortColumn === newSortColumn) {
                currentSortDirection = currentSortDirection === 'asc' ? 'desc' : 'asc';
            } else {
                currentSortColumn = newSortColumn;
                currentSortDirection = 'asc';
            }
            applyFiltersAndRender();
        });
		automationNameFilter.addEventListener('input', applyFiltersAndRender);
        automationStatusFilter.addEventListener('change', applyFiltersAndRender);
	}


	// ==========================================================
	// --- 8. INICIALIZACIÓN DE LA APLICACIÓN ---
	// ==========================================================
	
	/**
	 * Función principal que se ejecuta al cargar la página.
	 * Inicializa el estado de la aplicación.
	 */
	function initializeApp() {
		startLogBuffering();
		if (localStorage.getItem('logCollapsedState') === 'true') appContainer.classList.add('log-collapsed');
		loadConfigsIntoSelect();
		loadAndSyncClientConfig(''); // Inicia sin ningún cliente seleccionado.
		clearFieldsTable();
		observer.observe(fieldsTableBody, observerConfig);
		initializeCollapsibleMenus();
		setupEventListeners();
		logMessage("Aplicación lista. Selecciona un cliente o configura uno nuevo.");
		endLogBuffering();
	}

	// Inicia la aplicación.
	initializeApp();
});