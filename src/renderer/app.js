import * as mcApiService from './api/mc-api-service.js';
import elements, { init as initDomElements } from './ui/dom-elements.js';
import * as ui from './ui/ui-helpers.js'; 
import * as logger from './ui/logger.js';
import * as fieldsTable from './components/fields-table.js';
import * as automationsManager from './components/automations-manager.js';
import * as journeysManager from './components/journeys-manager.js';
import * as cloudPagesManager from './components/cloud-pages-manager.js';
import * as queryCloner from './components/query-cloner.js';
import * as deFinder from './components/de-finder.js';
import * as dataSourceFinder from './components/data-source-finder.js';
import * as queryTextFinder from './components/query-text-finder.js';
import * as customerFinder from './components/customer-finder.js';
import * as emailValidator from './components/email-validator.js';
import * as calendar from './components/calendar.js';

document.addEventListener('DOMContentLoaded', function () {
	initDomElements();
	// ==========================================================
	// --- 1. CONSTANTES DE CONFIGURACIÓN ---
	// ==========================================================

	// Define el número máximo de registros que se piden a la API en una sola página (para endpoints que lo soporten).
	const API_PAGE_SIZE = 500;
	// Define cuántos elementos se muestran por página en las tablas de la interfaz de usuario.
	const ITEMS_PER_PAGE = 15;


	// ==========================================================
	// --- 2. VARIABLES DE ESTADO DE LA APLICACIÓN ---
	// ==========================================================
	// Estas variables 'let' almacenan el estado dinámico de la aplicación:
	// selecciones del usuario, datos cacheados, estado de la paginación, etc.

	// --- 2.1. Estado de la Sesión y del Cliente Activo ---
	let currentUserInfo = null;     // Almacena el objeto 'user' de la API tras un login exitoso. Usado para mostrar el email en la UI.
	let currentOrgInfo = null;      // Almacena el objeto 'organization' de la API. Usado para obtener el 'stack_key' y construir URLs.
	let currentClientConfig = null; // Guarda la configuración completa (cargada de localStorage) del cliente seleccionado.

	// --- 2.2. Estado de la Navegación y Selección en la UI ---
	let navigationHistory = ['main-menu']; // Pila que registra las vistas visitadas para que funcione el botón "Atrás".
	let selectedConfigRow = null;    // Referencia a la fila <tr> seleccionada en la tabla de configuración de Data Views.



	// ==========================================================
	// --- 3. COMPONENTES TÉCNICOS ---
	// ==========================================================


	// --- Sistema de Logs Acumulativos ---
	// En lugar de escribir directamente en el DOM, estas funciones acumulan los logs
	// en búferes. Esto permite mostrar un registro completo de acciones con múltiples pasos.

	
	/**
	 * Muestra una sección y la añade al historial de navegación.
	 * @param {string} sectionId - El ID de la sección a mostrar.
	 */
	function showSection(sectionId) {
		// Llamamos al helper, pasándole el historial para que lo pueda modificar.
		ui.showSection(sectionId, navigationHistory, true);
	}

	/**
	 * Navega a la sección anterior registrada en el historial.
	 */
	function goBack() {
		if (navigationHistory.length > 1) {
			navigationHistory.pop();
		}
		const previousSectionId = navigationHistory[navigationHistory.length - 1];
		// Llamamos al helper, pero sin añadir al historial (addToHistory = false).
		ui.showSection(previousSectionId, navigationHistory, false);
	}


	// ==========================================================
	// --- 3. GESTIÓN DE CONFIGURACIÓN Y SESIÓN ---
	// ==========================================================

	/**
	 * Recoge los valores del formulario que son seguros para guardar en localStorage.
	 * @returns {object} Un objeto con la configuración segura del cliente.
	 */
	const getConfigToSave = () => ({
		authUri: elements.authUriInput.value,
		businessUnit: elements.businessUnitInput.value,
		clientId: elements.clientIdInput.value,
		stackKey: elements.stackKeyInput.value,
		dvConfigs: getDvConfigsFromTable()
	});

	/**
	 * Rellena los campos del formulario de configuración con un objeto de configuración dado.
	 * @param {object} config - El objeto de configuración a cargar en el formulario.
	 */
	const setClientConfigForm = (config) => {
		elements.businessUnitInput.value = config.businessUnit || '';
		elements.authUriInput.value = config.authUri || '';
		elements.clientIdInput.value = config.clientId || '';
		elements.stackKeyInput.value = config.stackKey || '';
		populateDvConfigsTable(config.dvConfigs); 
		elements.tokenField.value = '';
		elements.soapUriInput.value = '';
		elements.restUriInput.value = '';
		elements.clientSecretInput.value = '';
	};

	/**
	 * Carga todas las configuraciones guardadas en `localStorage` y las muestra en los selectores.
	 */
	const loadConfigsIntoSelect = () => {
		const configs = JSON.parse(localStorage.getItem('mcApiConfigs')) || {};
		const currentValue = elements.sidebarClientSelect.value || elements.savedConfigsSelect.value;
		elements.savedConfigsSelect.innerHTML = '<option value="">Seleccionar configuración...</option>';
		elements.sidebarClientSelect.innerHTML = '<option value="">Ninguno seleccionado</option>';
		for (const name in configs) {
			elements.savedConfigsSelect.appendChild(new Option(name, name));
			elements.sidebarClientSelect.appendChild(new Option(name, name));
		}
		elements.savedConfigsSelect.value = currentValue;
		elements.sidebarClientSelect.value = currentValue;
	};

	/**
	 * Carga la configuración de un cliente, la aplica a los formularios y valida la sesión.
	 * @param {string} clientName - El nombre del cliente a cargar.
	 */
	function loadAndSyncClientConfig(clientName) {
		logger.startLogBuffering();
		try {
			const configs = JSON.parse(localStorage.getItem('mcApiConfigs')) || {};
			elements.tokenField.value = '';
			elements.soapUriInput.value = '';
			elements.restUriInput.value = '';
			updateLoginStatus(false);
			
			calendar.clearData();
			automationsManager.clearCache();
			journeysManager.clearCache();	
			cloudPagesManager.clearCache();		

			currentClientConfig = null; 

			if (clientName) {
				ui.blockUI("Cargando configuración de cliente...");
				const configToLoad = configs[clientName] || {};
				currentClientConfig = configToLoad;
				customerFinder.updateClientConfig(currentClientConfig);
				setClientConfigForm(configToLoad);
				elements.clientNameInput.value = clientName;
				elements.savedConfigsSelect.value = clientName;
				elements.sidebarClientSelect.value = clientName;

				logger.logMessage(`Cliente "${clientName}" cargado. Comprobando sesión...`);
				getAuthenticatedConfig()
					.catch(() => { /* El error ya se gestiona y loguea dentro de getAuthenticatedConfig */ })
					.finally(ui.unblockUI);
			} else {
				setClientConfigForm({});
				elements.clientNameInput.value = '';
				elements.savedConfigsSelect.value = '';
				elements.sidebarClientSelect.value = '';
				elements.stackKeyInput.value = '';
				logger.logMessage("Ningún cliente seleccionado.");
			}
		} finally {
			logger.endLogBuffering();
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
			elements.loginStatusEl.innerHTML = statusHTML;
			elements.loginStatusEl.className = 'login-status active';
		} else {
			elements.loginStatusEl.innerHTML = '🔴 Sesión no iniciada';
			elements.loginStatusEl.className = 'login-status inactive';
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
		const clientName = elements.clientNameInput.value.trim();
		if (!clientName) throw new Error("No hay ningún cliente seleccionado.");
		const apiConfig = await window.electronAPI.getApiConfig(clientName);
		if (!apiConfig || !apiConfig.accessToken) {
			updateLoginStatus(false);
			elements.stackKeyInput.value = '';
			throw new Error("Sesión no activa. Por favor, inicia sesión.");
		}
		elements.tokenField.value = apiConfig.accessToken;
		elements.soapUriInput.value = apiConfig.soapUri;
		elements.restUriInput.value = apiConfig.restUri;
		currentUserInfo = apiConfig.userInfo;
		currentOrgInfo = apiConfig.orgInfo;
		elements.stackKeyInput.value = currentOrgInfo?.stack_key || 'No disponible';
		queryTextFinder.updateOrgInfo(apiConfig.orgInfo);
		updateLoginStatus(true, clientName, currentUserInfo);

		apiConfig.businessUnit = elements.businessUnitInput.value.trim();

		return apiConfig;
	}

	// --- 4.2. Gestión de Data Extensions ---

	/**
	 * Macro para crear una Data Extension.
	 * Recoge los datos del formulario y llama al servicio de API.
	 */
	async function macroCreateDE() {
		ui.blockUI("Creando Data Extension...");
		logger.startLogBuffering();
		try {
			logger.logMessage("Iniciando creación de Data Extension...");
			const apiConfig = await getAuthenticatedConfig();

			mcApiService.setLogger({ logApiCall: logger.logApiCall, logApiResponse: logger.logApiResponse }); 

			// 1. Recoger datos del DOM
			const deData = {
				name: elements.deNameInput.value.trim(),
				externalKey: elements.deExternalKeyInput.value.trim(),
				description: elements.deDescriptionInput.value.trim(),
				folderId: elements.deFolderInput.value.trim(),
				isSendable: elements.isSendableCheckbox.checked,
				subscriberKeyField: elements.subscriberKeyFieldSelect.value,
				subscriberKeyType: elements.subscriberKeyTypeInput.value.trim(),
				fields: fieldsTable.getFieldsData()
			};

			// 2. Validar datos (lógica de UI)
			if (!deData.name || !deData.description) {
				throw new Error('El Nombre y la Descripción son obligatorios.');
			}
			if (deData.isSendable && !deData.subscriberKeyField) {
				throw new Error('Para una DE sendable, es obligatorio seleccionar un Campo SubscriberKey.');
			}
			if (deData.fields.length === 0) {
				throw new Error('La DE debe tener al menos un campo.');
			}

			// 3. Llamar al servicio
			await mcApiService.createDataExtension(deData, apiConfig);
			
			// 4. Gestionar éxito
			const successMessage = `¡Data Extension "${deData.name}" creada con éxito!`;
			logger.logMessage(successMessage);
			ui.showCustomAlert(successMessage);

		} catch (error) {
			logger.logMessage(`Error al crear la Data Extension: ${error.message}`);
			ui.showCustomAlert(`Error: ${error.message}`);
		} finally {
			ui.unblockUI();
			logger.endLogBuffering();
		}
	}

	// --- 4.3. Gestión de Campos ---

	/**
	 * Macro para crear o actualizar (upsert) campos en una Data Extension existente.
	 */
	async function macroCreateFields() {
		ui.blockUI("Creando campos...");
		logger.startLogBuffering();
		try {
			logger.logMessage(`Iniciando creación/actualización de campos...`);
			const apiConfig = await getAuthenticatedConfig();
			mcApiService.setLogger({ logApiCall: logger.logApiCall, logApiResponse: logger.logApiResponse });
			
			// 1. Recoger datos del DOM
			const externalKey = elements.recExternalKeyInput.value.trim();
			const fieldsData = fieldsTable.getFieldsData();

			// 2. Validar datos
			if (!externalKey) {
				throw new Error('Defina una "External Key de la DE" en "Gestión de Campos".');
			}
			if (fieldsData.length === 0) {
				throw new Error('No hay campos válidos en la tabla.');
			}

			// 3. Llamar al servicio
			await mcApiService.createOrUpdateFields(externalKey, fieldsData, apiConfig);
			
			// 4. Gestionar éxito
			const successMessage = `¡Éxito! ${fieldsData.length} campos creados/actualizados en la DE ${externalKey}.`;
			logger.logMessage(successMessage);
			ui.showCustomAlert(successMessage);

		} catch (error) {
			logger.logMessage(`Error al crear los campos: ${error.message}`);
			ui.showCustomAlert(`Error: ${error.message}`);
		} finally {
			ui.unblockUI();
			logger.endLogBuffering();
		}
	}

	/**
	 * Macro para recuperar todos los campos de una Data Extension y mostrarlos en la tabla.
	 */
	async function macroGetFields() {
		ui.blockUI("Recuperando campos...");
		logger.startLogBuffering();
		try {
			const apiConfig = await getAuthenticatedConfig();
			mcApiService.setLogger({ logApiCall: logger.logApiCall, logApiResponse: logger.logApiResponse });
			
			const externalKey = elements.recExternalKeyInput.value.trim();
			if (!externalKey) throw new Error('Introduzca la "External Key de la DE".');
			
			logger.logMessage(`Recuperando campos para la DE: ${externalKey}`);
			
			const fields = await mcApiService.fetchFieldsForDE(externalKey, apiConfig);

			if (fields.length > 0) {
				fieldsTable.populate(fields);
				fieldsTable.populateDeletionPicklist(fields);
				logger.logMessage(`${fields.length} campos recuperados y cargados en la tabla.`);
			} else {
				fieldsTable.clear();
				fieldsTable.populateDeletionPicklist([]);
				logger.logMessage('Llamada exitosa pero no se encontraron campos para esta DE.');
			}
		} catch (error) {
			logger.logMessage(`Error al recuperar campos: ${error.message}`);
			ui.showCustomAlert(`Error: ${error.message}`);
		} finally {
			ui.unblockUI();
			logger.endLogBuffering();
		}
	}

	/**
	 * Macro para eliminar un campo específico de una Data Extension.
	 */
	async function macroDeleteField() {
		// NO bloqueamos la UI todavía.
		logger.startLogBuffering();
		try {
			const apiConfig = await getAuthenticatedConfig();

			mcApiService.setLogger({ logApiCall: logger.logApiCall, logApiResponse: logger.logApiResponse });
			
			const externalKey = elements.recExternalKeyInput.value.trim();
			const fieldObjectId = elements.targetFieldSelect.value;
			const selectedFieldName = elements.targetFieldSelect.selectedOptions[0]?.text;

			if (!externalKey || !fieldObjectId) {
				throw new Error('Introduzca la External Key y seleccione un campo a eliminar.');
			}
			
			// 1. PRIMERO, preguntamos al usuario.
			const userConfirmed = await ui.showCustomConfirm(`¿Seguro que quieres eliminar el campo "${selectedFieldName}"? Esta acción no se puede deshacer.`);

			// 2. Si el usuario cancela, salimos limpiamente.
			if (!userConfirmed) {
				logger.logMessage("Borrado cancelado por el usuario.");
				logger.endLogBuffering();
				return; // Salimos de la función.
			}

			// 3. SI el usuario ha confirmado, AHORA bloqueamos la UI y procedemos.
			ui.blockUI("Borrando campo...");
			
			logger.logMessage(`Iniciando borrado del campo "${selectedFieldName}"...`);
			
			await mcApiService.deleteDataExtensionField(externalKey, fieldObjectId, apiConfig);
			
			const successMessage = `Campo "${selectedFieldName}" eliminado con éxito.`;
			logger.logMessage(successMessage);
			ui.showCustomAlert(successMessage);
			
			// La UI ya está bloqueada, así que macroGetFields puede ejecutarse sin problemas.
			// Al terminar, macroGetFields se encargará de desbloquearla.
			await macroGetFields();

		} catch (error) {
			logger.logMessage(`Error al eliminar el campo: ${error.message}`);
			ui.showCustomAlert(`Error: ${error.message}`);
			// Si hay un error, nos aseguramos de desbloquear la UI.
			ui.unblockUI();
			logger.endLogBuffering();
		}
	}

	/**
	 * Macro para documentar todas las Data Extensions de una carpeta en un CSV.
	 */
	async function macroDocumentDataExtensions() {
		ui.blockUI("Documentando Data Extensions...");
		logger.startLogBuffering();
		try {
			const apiConfig = await getAuthenticatedConfig();
			mcApiService.setLogger({ logApiCall: logger.logApiCall, logApiResponse: logger.logApiResponse });

			const categoryId = elements.recCategoryIdInput.value.trim();
			if (!categoryId) throw new Error('Introduzca el "Identificador de carpeta".');

			logger.logMessage(`Paso 1: Recuperando Data Extensions de la carpeta ID: ${categoryId}`);
			const deList = await getDEsFromFolder(categoryId, apiConfig);

			if (deList.length === 0) {
				ui.showCustomAlert(`No se encontraron Data Extensions en la carpeta con ID ${categoryId}.`);
				return;
			}
			logger.logMessage(`Se encontraron ${deList.length} Data Extensions. Recuperando campos para cada una...`);
			
			const allFieldsData = [];
			let deCounter = 0;

			for (const de of deList) {
				deCounter++;
				ui.blockUI(`Procesando ${deCounter}/${deList.length}: ${de.name}`);
				logger.logMessage(` - Procesando: ${de.name} (Key: ${de.customerKey})`);

				try {
					const fields = await mcApiService.fetchFieldsForDE(de.customerKey, apiConfig);
					fields.forEach(field => {
						allFieldsData.push({
							'Name': de.name,
							'ExternalKey': de.customerKey,
							'Field': field.mc,
							'FieldType': field.type,
							'Length': field.len || '',
							'Default': field.defaultValue || '',
							'PK': field.pk ? 'Yes' : 'No',
							'Required': field.req ? 'Yes' : 'No'
						});
					});
				} catch (fieldError) {
					logger.logMessage(`   -> Error al recuperar campos para ${de.name}: ${fieldError.message}`);
					// Continuar con la siguiente DE aunque una falle
				}
			}

			if (allFieldsData.length === 0) {
				ui.showCustomAlert('No se pudieron recuperar campos para ninguna de las Data Extensions encontradas.');
				return;
			}
			
			logger.logMessage(`Paso 3: Generando CSV con ${allFieldsData.length} filas.`);
			generateAndDownloadCsv(allFieldsData, `DEs_Carpeta_${categoryId}.csv`);
			ui.showCustomAlert('Documentación generada con éxito. Revisa tus descargas.');

		} catch (error) {
			logger.logMessage(`Error al documentar las Data Extensions: ${error.message}`);
			ui.showCustomAlert(`Error: ${error.message}`);
		} finally {
			ui.unblockUI();
			logger.endLogBuffering();
		}
	}


	/**
	 * Recupera la lista de Data Extensions de una carpeta específica.
	 * @param {string} categoryId - El ID de la carpeta.
	 * @param {object} apiConfig - La configuración de la API.
	 * @returns {Promise<Array>} Una lista de objetos DE { name, customerKey }.
	 */
	async function getDEsFromFolder(categoryId, apiConfig) {
		const soapPayload = `<s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope" xmlns:a="http://schemas.xmlsoap.org/ws/2004/08/addressing"><s:Header><a:Action s:mustUnderstand="1">Retrieve</a:Action><a:To s:mustUnderstand="1">${apiConfig.soapUri}</a:To><fueloauth xmlns="http://exacttarget.com">${apiConfig.accessToken}</fueloauth></s:Header><s:Body xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema"><RetrieveRequestMsg xmlns="http://exacttarget.com/wsdl/partnerAPI"><RetrieveRequest><ObjectType>DataExtension</ObjectType><Properties>CustomerKey</Properties><Properties>Name</Properties><Filter xsi:type="SimpleFilterPart"><Property>CategoryID</Property><SimpleOperator>equals</SimpleOperator><Value>${categoryId}</Value></Filter></RetrieveRequest></RetrieveRequestMsg></s:Body></s:Envelope>`;

		const responseText = await executeSoapRequest(apiConfig.soapUri, soapPayload, null);
		const parser = new DOMParser();
		const xmlDoc = parser.parseFromString(responseText, "application/xml");

		const deList = Array.from(xmlDoc.querySelectorAll("Results")).map(node => ({
			name: node.querySelector("Name")?.textContent,
			customerKey: node.querySelector("CustomerKey")?.textContent
		}));

		return deList;
	}

	/**
	 * Genera un archivo CSV a partir de un array de objetos y lo descarga.
	 * @param {Array<object>} data - El array de datos.
	 * @param {string} filename - El nombre del archivo a descargar.
	 */
	function generateAndDownloadCsv(data, filename) {
		if (!data || data.length === 0) return;

		const headers = Object.keys(data[0]);
		const csvRows = [headers.join(',')]; // Fila de cabecera

		for (const row of data) {
			const values = headers.map(header => {
				const escaped = ('' + row[header]).replace(/"/g, '""'); // Escapa comillas dobles
				return `"${escaped}"`; // Envuelve cada valor en comillas
			});
			csvRows.push(values.join(','));
		}

		const csvString = csvRows.join('\n');
		const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
		
		const link = document.createElement("a");
		if (link.download !== undefined) {
			const url = URL.createObjectURL(blob);
			link.setAttribute("href", url);
			link.setAttribute("download", filename);
			link.style.visibility = 'hidden';
			document.body.appendChild(link);
			link.click();
			document.body.removeChild(link);
		}
	}

	

	
	

	

	// --- Helpers para el Clonador de Queries ---

	

	/**
	 * Recupera las queries de una carpeta específica.
	 * @param {string} folderId - El ID de la carpeta de queries.
	 * @param {object} apiConfig - La configuración de la API.
	 * @returns {Promise<Array>} Lista de objetos de query.
	 */
	async function getQueriesFromFolder(folderId, apiConfig) {
		const soapPayload = `<s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope" xmlns:a="http://schemas.xmlsoap.org/ws/2004/08/addressing"><s:Header><a:Action s:mustUnderstand="1">Retrieve</a:Action><a:To s:mustUnderstand="1">${apiConfig.soapUri}</a:To><fueloauth xmlns="http://exacttarget.com">${apiConfig.accessToken}</fueloauth></s:Header><s:Body xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema"><RetrieveRequestMsg xmlns="http://exacttarget.com/wsdl/partnerAPI"><RetrieveRequest><ObjectType>QueryDefinition</ObjectType><Properties>Name</Properties><Properties>CustomerKey</Properties><Properties>QueryText</Properties><Properties>TargetUpdateType</Properties><Properties>DataExtensionTarget.Name</Properties><Properties>DataExtensionTarget.CustomerKey</Properties><Filter xsi:type="SimpleFilterPart"><Property>CategoryID</Property><SimpleOperator>equals</SimpleOperator><Value>${folderId}</Value></Filter></RetrieveRequest></RetrieveRequestMsg></s:Body></s:Envelope>`;
		
		const responseText = await executeSoapRequest(apiConfig.soapUri, soapPayload, null);
		const parser = new DOMParser();
		const xmlDoc = parser.parseFromString(responseText, "application/xml");

		return Array.from(xmlDoc.querySelectorAll("Results")).map(node => ({
			name: node.querySelector("Name")?.textContent,
			customerKey: node.querySelector("CustomerKey")?.textContent,
			queryText: node.querySelector("QueryText")?.textContent,
			updateType: node.querySelector("TargetUpdateType")?.textContent,
			targetDE: {
				name: node.querySelector("DataExtensionTarget > Name")?.textContent,
				customerKey: node.querySelector("DataExtensionTarget > CustomerKey")?.textContent
			},
			selected: false // Propiedad para el estado de selección
		}));
	}

	/**
	 * Crea una nueva Query Activity clonada.
	 * @param {object} originalQuery - El objeto de la query original.
	 * @param {object} clonedDE - El objeto de la DE clonada (con nueva key y nombre).
	 * @param {object} newQueryName - El nombre de la Query.
	 * @param {string} targetCategoryId - El ID de la carpeta donde se guardará la query.
	 * @param {object} apiConfig - La configuración de la API.
	 */
	async function createClonedQuery(originalQuery, clonedDE, newQueryName, targetCategoryId, apiConfig) {
		const newCustomerKey = '';

		const soapPayload = `<s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope" xmlns:a="http://schemas.xmlsoap.org/ws/2004/08/addressing"><s:Header><a:Action s:mustUnderstand="1">Create</a:Action><a:To s:mustUnderstand="1">${apiConfig.soapUri}</a:To><fueloauth xmlns="http://exacttarget.com">${apiConfig.accessToken}</fueloauth></s:Header><s:Body xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema"><CreateRequest xmlns="http://exacttarget.com/wsdl/partnerAPI"><Objects xsi:type="QueryDefinition"><CategoryID>${targetCategoryId}</CategoryID><CustomerKey>${newCustomerKey}</CustomerKey><Name>${newQueryName}</Name><QueryText>${originalQuery.queryText}</QueryText><TargetType>DE</TargetType><DataExtensionTarget><CustomerKey>${clonedDE.customerKey}</CustomerKey><Name>${clonedDE.name}</Name></DataExtensionTarget><TargetUpdateType>${originalQuery.updateType}</TargetUpdateType></Objects></CreateRequest></s:Body></s:Envelope>`;

		await executeSoapRequest(apiConfig.soapUri, soapPayload, null);
	}
	

	// ==========================================================
	// --- 5. FUNCIONES AUXILIARES (HELPERS) ---
	// ==========================================================
		

	/**
	 * Recupera los detalles de una Data Extension.
	 * @param {string} property - La propiedad por la que filtrar ('Name', 'CustomerKey', 'ObjectID').
	 * @param {string} value - El valor de la propiedad a buscar.
	 * @param {Array<string>} propertiesToRetrieve - Un array con los nombres de las propiedades a recuperar.
	 * @param {object} apiConfig - El objeto de configuración de la API.
	 * @returns {Promise<Element|null>} - El nodo XML <Results> de la DE encontrada, o null.
	 */
	async function getDEDetails(property, value, propertiesToRetrieve, apiConfig) {
		const propertiesXml = propertiesToRetrieve.map(p => `<Properties>${p}</Properties>`).join('');
		const payload = `<s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope" xmlns:a="http://schemas.xmlsoap.org/ws/2004/08/addressing"><s:Header><a:Action s:mustUnderstand="1">Retrieve</a:Action><a:To s:mustUnderstand="1">${apiConfig.soapUri}</a:To><fueloauth xmlns="http://exacttarget.com">${apiConfig.accessToken}</fueloauth></s:Header><s:Body xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema"><RetrieveRequestMsg xmlns="http://exacttarget.com/wsdl/partnerAPI"><RetrieveRequest><ObjectType>DataExtension</ObjectType>${propertiesXml}<Filter xsi:type="SimpleFilterPart"><Property>${property}</Property><SimpleOperator>equals</SimpleOperator><Value>${value}</Value></Filter></RetrieveRequest></RetrieveRequestMsg></s:Body></s:Envelope>`;
		
		const responseText = await executeSoapRequest(apiConfig.soapUri, payload, null);
		const parser = new DOMParser();
		const doc = parser.parseFromString(responseText, "application/xml");
		
		return doc.querySelector("Results");
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
	 * Parsea la respuesta XML de la búsqueda de suscriptores y la convierte en un array de objetos.
	 * @param {string} xmlString - La respuesta XML de la API.
	 * @returns {Array} Un array de objetos de suscriptor.
	 */
	function parseCustomerSearchResponse(xmlString) {
		const parser = new DOMParser();
		const xmlDoc = parser.parseFromString(xmlString, "application/xml");
		
		const overallStatus = xmlDoc.querySelector("OverallStatus")?.textContent;

		// Si el estado NO es OK y NO es MoreDataAvailable, es un error.
		if (overallStatus !== 'OK' && overallStatus !== 'MoreDataAvailable') {
			throw new Error(xmlDoc.querySelector("StatusMessage")?.textContent || 'Error desconocido en la respuesta SOAP.');
		}
		
		return Array.from(xmlDoc.querySelectorAll("Results")).map(node => {
			const getText = (tagName) => node.querySelector(tagName)?.textContent || null;
			return { 
				subscriberKey: getText("SubscriberKey") || '---', 
				emailAddress: getText("EmailAddress") || '---', 
				status: getText("Status") || '---', 
				createdDate: getText("CreatedDate") ? new Date(getText("CreatedDate")).toLocaleString() : '---', 
				unsubscribedDate: getText("UnsubscribedDate") ? new Date(getText("UnsubscribedDate")).toLocaleString() : '---', 
				isSubscriber: true 
			};
		});
	}

	/**
	 * Parsea la respuesta de la búsqueda de direcciones de contacto (REST API) y la convierte en un array de objetos.
	 * @param {object} responseData - La respuesta JSON de la API.
	 * @returns {Array} Un array de objetos de contacto.
	 */
	function parseContactAddressSearchResponse(responseData) {
		// La información está dentro del array 'addresses'. Si no existe o está vacío, no hay resultados.
		const addresses = responseData?.addresses;
		if (!addresses || addresses.length === 0) {
			return [];
		}

		// Normalmente, al buscar por una clave única, solo nos interesa el primer resultado.
		const contactData = addresses[0];

		// Extraemos el ContactKey de su objeto anidado.
		const contactKey = contactData.contactKey?.value || '---';

		// Para encontrar la fecha de creación, tenemos que navegar por la estructura anidada.
		let createdDate = '---';
		
		// 1. Buscamos el 'valueSet' que corresponde a los atributos primarios.
		const primaryValueSet = contactData.valueSets?.find(vs => vs.definitionKey === 'Primary');
		
		if (primaryValueSet) {
			// 2. Dentro de ese set, buscamos el objeto 'value' cuya clave de definición es 'CreatedDate'.
			const createdDateValueObject = primaryValueSet.values?.find(v => v.definitionKey === 'CreatedDate');
			
			// 3. Si lo encontramos, extraemos el valor real de 'innerValue'.
			if (createdDateValueObject?.innerValue) {
				createdDate = new Date(createdDateValueObject.innerValue).toLocaleString();
			}
		}

		// Construimos el objeto final con el formato que espera nuestra tabla.
		const result = {
			subscriberKey: contactKey,
			emailAddress: '---', // Esta API específica no devuelve el email.
			status: '---',
			createdDate: createdDate,
			unsubscribedDate: '---',
			isSubscriber: false // Marcamos que NO es un suscriptor, solo un contacto.
		};
		
		// Devolvemos el resultado dentro de un array para mantener la consistencia con el otro parser.
		return [result];
	}


	


	// --- 5.4. Otros Helpers ---


	/**
     * Actualiza la UI de los controles de paginación para la tabla de Automatismos.
     * @param {number} totalItems - El número total de items en la lista filtrada.
     */
    function updateAutomationPaginationUI(totalItems) {
        const totalPages = Math.ceil(totalItems / ITEMS_PER_PAGE) || 1;
        elements.totalPagesAutomations.textContent = `/ ${totalPages}`;
        elements.pageInputAutomations.value = currentPageAutomations;
        elements.pageInputAutomations.max = totalPages;

        elements.prevPageBtnAutomations.disabled = currentPageAutomations === 1;
        elements.nextPageBtnAutomations.disabled = currentPageAutomations >= totalPages;
    }

    /**
     * Actualiza la UI de los controles de paginación para la tabla de Journeys.
     * @param {number} totalItems - El número total de items en la lista filtrada.
     */
    function updateJourneyPaginationUI(totalItems) {
        const totalPages = Math.ceil(totalItems / ITEMS_PER_PAGE) || 1;
        elements.totalPagesJourneys.textContent = `/ ${totalPages}`;
        elements.pageInputJourneys.value = currentPageJourneys;
        elements.pageInputJourneys.max = totalPages;

        elements.prevPageBtnJourneys.disabled = currentPageJourneys === 1;
        elements.nextPageBtnJourneys.disabled = currentPageJourneys >= totalPages;
    }

	// ==========================================================
	// --- 6. MANIPULACIÓN DEL DOM Y COMPONENTES ---
	// ==========================================================
	
	
	// --- 6.4. Menús Colapsables y Automatismos ---
	
	/** Restaura el estado (abierto/cerrado) de los menús colapsables al iniciar la app. */
	function initializeCollapsibleMenus() {
		const collapsibleStates = JSON.parse(localStorage.getItem('collapsibleStates')) || {};
		elements.collapsibleHeaders.forEach(header => {
			const headerText = header.textContent.trim();
			if (collapsibleStates[headerText]) {
				header.classList.add('active');
				header.nextElementSibling.style.maxHeight = header.nextElementSibling.scrollHeight + "px";
			}
		});
	}

	

	// --- 6.5. Configuración de APIs ---
	/**
	 * Lee la configuración de la tabla de búsqueda de envíos y la devuelve como un array.
	 * @returns {Array<object>}
	 */
	function getDvConfigsFromTable() {
		return Array.from(elements.sendsConfigTbody.querySelectorAll('tr')).map(row => {
			const cells = row.querySelectorAll('td');
			return {
				title: cells[0].textContent.trim(),
				deKey: cells[1].textContent.trim(),
				field: cells[2].textContent.trim()
			};
		});
	}

	/**
	 * Rellena la tabla de configuración de búsqueda de envíos con datos guardados.
	 * @param {Array<object>} configs - El array de configuraciones a pintar.
	 */
	function populateDvConfigsTable(configs = []) {
		elements.sendsConfigTbody.innerHTML = ''; // Limpia la tabla
		if (!configs || configs.length === 0) {
			// Si no hay configs guardadas, crea 4 filas por defecto
			configs = [
				{ title: '', deKey: '', field: '' },,
			];
		}
		
		configs.forEach(config => {
			const newRow = elements.sendsConfigTbody.insertRow();
			// Creamos las celdas editables
			newRow.innerHTML = `
				<td contenteditable="true">${config.title}</td>
				<td contenteditable="true">${config.deKey}</td>
				<td contenteditable="true">${config.field}</td>
			`;
			// Creamos y añadimos el botón de borrado fuera de las celdas
			const deleteButton = document.createElement('button');
			deleteButton.className = 'delete-row-btn';
			deleteButton.title = 'Eliminar fila';
			deleteButton.textContent = '×';
			newRow.appendChild(deleteButton);
		});
	}
	

	/**
	 * Gestiona el envío del formulario de licencia.
	 * Guarda los datos en localStorage y arranca la aplicación.
	 * @param {Event} event - El evento de envío del formulario.
	 */
	async function handleLicenseSubmit(event) {
		event.preventDefault(); // Evita que la página se recargue
		const email = elements.licenseEmailInput.value.trim();
		const key = elements.licenseKeyInput.value.trim();

		// Ocultamos cualquier error anterior al iniciar la validación
    	elements.licenseErrorEl.style.display = 'none';

		if (!email || !key) {
			ui.showCustomAlert('Por favor, completa ambos campos.');
			elements.licenseErrorEl.style.display = 'block';
			return;
		}

		// Bloqueamos el botón para evitar múltiples envíos
		elements.submitBtn.disabled = true;
		elements.submitBtn.textContent = 'Validando...';

		// Llamamos a la función del proceso principal
		const result = await window.electronAPI.validateLicense({ email, key });
		
		// Si el resultado es un objeto, es un error del backend
		if (result && result.error) {
			// Mostramos el error de configuración en el modal
			elements.licenseErrorEl.textContent = `Error de configuración: ${result.error}`;
			elements.licenseErrorEl.style.display = 'block';
			elements.submitBtn.disabled = false;
			elements.submitBtn.textContent = 'Validar y Acceder';
			return;
		}

		if (result === true) {
			// Éxito
			const licenseData = { email, key };
			localStorage.setItem('isKeyValid', JSON.stringify(licenseData));
			elements.appContainer.classList.remove('app-locked');
			elements.licenseModal .style.display = 'none';
			startFullApp();
		} else {
			// Error de validación
			elements.licenseErrorEl.textContent = 'El email o la clave de acceso no son válidos, o el usuario no está activo.';
			elements.licenseErrorEl.style.display = 'block';
			elements.submitBtn.disabled = false;
			elements.submitBtn.textContent = 'Validar y Acceder';
		}
	}


	// ==========================================================
	// --- 7. EVENT LISTENERS ---
	// ==========================================================
	
	/**
	 * Configura todos los event listeners de la aplicación una sola vez.
	 */
	function setupEventListeners() {
		elements.licenseForm.addEventListener('submit', handleLicenseSubmit);

		// Listeners para el nuevo modal de alerta
		elements.customAlertCloseBtn.addEventListener('click', ui.closeCustomAlert);
		elements.customAlertModal.addEventListener('click', (e) => {
			if (e.target === elements.customAlertModal) {
				ui.closeCustomAlert();
			}
		});

		// --- Listeners de Configuración y Sesión ---
		elements.saveConfigBtn.addEventListener('click', () => {
			logger.startLogBuffering();
			try {
				const clientName = elements.clientNameInput.value.trim();
				if (!clientName) return ui.showCustomAlert('Introduzca un nombre para el cliente antes de guardar.');
				let configs = JSON.parse(localStorage.getItem('mcApiConfigs')) || {};
				configs[clientName] = getConfigToSave();
				localStorage.setItem('mcApiConfigs', JSON.stringify(configs));
				loadConfigsIntoSelect();
				logger.logMessage(`Configuración para "${clientName}" guardada localmente.`);
				ui.showCustomAlert(`Configuración para "${clientName}" guardada.`);
			} finally {
				logger.endLogBuffering();
			}
		});

		elements.loginBtn.addEventListener('click', () => {
			logger.startLogBuffering();
			try {
				const clientName = elements.clientNameInput.value.trim();
				if (!clientName) return ui.showCustomAlert('Introduzca un nombre para el cliente.');
				const config = { clientName, authUri: elements.authUriInput.value.trim(), clientId: elements.clientIdInput.value.trim(), clientSecret: elements.clientSecretInput.value.trim(), businessUnit: elements.businessUnitInput.value.trim() };
				if (!config.authUri || !config.clientId || !config.clientSecret || !config.businessUnit) return ui.showCustomAlert('Se necesitan Auth URI, Client ID, Client Secret y MID para el login.');
				let configs = JSON.parse(localStorage.getItem('mcApiConfigs')) || {};
				configs[clientName] = getConfigToSave();
				localStorage.setItem('mcApiConfigs', JSON.stringify(configs));
				loadConfigsIntoSelect();
				logger.logMessage("Configuración guardada. Iniciando login...");
				ui.blockUI("Iniciando login...");
				window.electronAPI.startLogin(config);
			} finally {
				logger.endLogBuffering();
			}
		});

		elements.logoutBtn.addEventListener('click', async () => {
			logger.startLogBuffering();
			try {
				const clientName = elements.savedConfigsSelect.value;
				if (!clientName) return ui.showCustomAlert("Seleccione un cliente para hacer logout.");
				if (await ui.showCustomConfirm(`Esto borrará la configuración y cerrará la sesión para "${clientName}". ¿Continuar?`)) {
					let configs = JSON.parse(localStorage.getItem('mcApiConfigs')) || {};
					delete configs[clientName];
					localStorage.setItem('mcApiConfigs', JSON.stringify(configs));
					window.electronAPI.logout(clientName);
				}
			} finally {
				logger.endLogBuffering();
			}
		});

		elements.savedConfigsSelect.addEventListener('change', (e) => loadAndSyncClientConfig(e.target.value));
		elements.sidebarClientSelect.addEventListener('change', (e) => loadAndSyncClientConfig(e.target.value));

		// --- Listeners de Eventos desde el Proceso Principal (main.js) ---
		window.electronAPI.onTokenReceived(result => {
			ui.unblockUI();
			logger.startLogBuffering();
			if (result.success) {
				logger.logMessage("Login exitoso. Sesión activa.");
				ui.showCustomAlert("Login completado con éxito.");
				loadAndSyncClientConfig(elements.clientNameInput.value);
			} else {
				logger.logMessage(`Error durante el login: ${result.error}`);
				ui.showCustomAlert(`Hubo un error en el login: ${result.error}`);
				updateLoginStatus(false);
			}
			logger.endLogBuffering();
		});

		window.electronAPI.onLogoutSuccess(() => {
			logger.startLogBuffering();
			ui.showCustomAlert(`Sesión cerrada y configuración borrada.`);
			logger.logMessage("Sesión cerrada y configuración borrada.");
			loadConfigsIntoSelect();
			loadAndSyncClientConfig('');
			logger.endLogBuffering();
		});

		window.electronAPI.onRequireLogin(data => {
			logger.startLogBuffering();
			ui.showCustomAlert(`La sesión ha expirado o no es válida. Por favor, haz login de nuevo.\n\nMotivo: ${data.message}`);
			logger.logMessage(`LOGIN REQUERIDO: ${data.message}`);
			updateLoginStatus(false);
			logger.endLogBuffering();
		});

		// --- Listeners de Navegación ---
		document.querySelectorAll('.back-button').forEach(b => b.addEventListener('click', goBack));
		document.querySelectorAll('.macro-item').forEach(item => {
			item.addEventListener('click', async (e) => {
				e.preventDefault();
				const macro = e.target.getAttribute('data-macro');
				const sectionMap = { 'docu': 'documentacion-section', 'configuracionAPIs': 'configuracion-apis-section', 'configuracionDE': 'configuracion-de-section', 'campos': 'campos-section', 'gestionCampos': 'configuracion-campos-section', 'validadorEmail': 'email-validator-section', 'buscadores': 'buscadores-section' };
				if (sectionMap[macro]) showSection(sectionMap[macro]);
				else if (macro === 'calendario'){
					calendar.view(); 
				}
				else if (macro === 'gestionAutomatismos'){
					showSection('gestion-automatismos-section');
					await automationsManager.view(); 
				}
				else if (macro === 'gestionJourneys') {
					showSection('gestion-journeys-section');
					await journeysManager.view();
				}
				else if (macro === 'gestionCloudPages'){
					showSection('gestion-cloudpages-section');
					await cloudPagesManager.view();
				}
				else if (macro === 'clonadorQueries') showSection('clonador-queries-section');
			});
		});

		// --- Listeners de la Tabla de Configuración de Envíos ---
		elements.addSendConfigRowBtn.addEventListener('click', () => {
			const newRow = elements.sendsConfigTbody.insertRow();
			newRow.innerHTML = `
				<td contenteditable="true"></td>
				<td contenteditable="true"></td>
				<td contenteditable="true"></td>
			`;
			const deleteButton = document.createElement('button');
			deleteButton.className = 'delete-row-btn';
			deleteButton.title = 'Eliminar fila';
			deleteButton.textContent = '×';
			newRow.appendChild(deleteButton);
		});

		elements.sendsConfigTbody.addEventListener('click', (e) => {
			const targetRow = e.target.closest('tr');
			if (!targetRow) return;

			// Si se hace clic en el botón de borrar
			if (e.target.matches('.delete-row-btn')) {
				if (targetRow === selectedConfigRow) selectedConfigRow = null;
				targetRow.remove();
			} else { // Si se hace clic en cualquier otra parte de la fila para seleccionarla
				if (targetRow !== selectedConfigRow) {
					if (selectedConfigRow) selectedConfigRow.classList.remove('selected');
					targetRow.classList.add('selected');
					selectedConfigRow = targetRow;
				}
			}
		});

		// --- Listeners de Botones de Macros ---
		elements.documentDEsBtn.addEventListener('click', macroDocumentDataExtensions);
		elements.createDEBtn.addEventListener('click', macroCreateDE);
		elements.createFieldsBtn.addEventListener('click', macroCreateFields);
		elements.getFieldsBtn.addEventListener('click', macroGetFields);
		elements.deleteFieldBtn.addEventListener('click', macroDeleteField);
		
		elements.isSendableCheckbox.addEventListener('change', fieldsTable.handleSendableChange);
		elements.subscriberKeyFieldSelect.addEventListener('change', () => { elements.subscriberKeyTypeInput.value = elements.subscriberKeyFieldSelect.options[elements.subscriberKeyFieldSelect.selectedIndex]?.dataset.type || ''; });
		elements.deNameInput.addEventListener('input', () => { elements.deExternalKeyInput.value = elements.deNameInput.value.replace(/\s+/g, '_') + '_CK'; });
		elements.authUriInput.addEventListener('blur', () => {
			const uri = elements.authUriInput.value.trim();
			if (uri && !uri.endsWith('v2/token')) {
				elements.authUriInput.value = (uri.endsWith('/') ? uri : uri + '/') + 'v2/token';
			}
		});

		// --- Listeners del Modal de Importación ---
		elements.importFieldsBtn.addEventListener('click', () => { elements.importModal.style.display = 'flex'; elements.pasteDataArea.focus(); });
		elements.cancelPasteBtn.addEventListener('click', fieldsTable.closeImportModal);
		elements.importModal.addEventListener('click', (e) => { if (e.target === elements.importModal) fieldsTable.closeImportModal(); });
		elements.delimiterSelect.addEventListener('change', () => { elements.customDelimiterInput.classList.toggle('hidden', elements.delimiterSelect.value !== 'other'); if (elements.delimiterSelect.value === 'other') elements.customDelimiterInput.focus(); });
		elements.processPasteBtn.addEventListener('click', fieldsTable.processPastedData);
		
		// --- Listeners de Componentes de UI Generales ---
		elements.toggleLogBtn.addEventListener('click', () => { const isCollapsed = elements.appContainer.classList.toggle('log-collapsed'); localStorage.setItem('logCollapsedState', isCollapsed); });
		elements.tabButtons.forEach(button => button.addEventListener('click', () => {
			const tabId = button.getAttribute('data-tab');
			const parent = button.closest('.tabs-container');
			parent.querySelectorAll('.tab-button').forEach(btn => btn.classList.remove('active'));
			parent.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
			button.classList.add('active');
			parent.querySelector(`#${tabId}`).classList.add('active');
		}));
		elements.collapsibleHeaders.forEach(header => header.addEventListener('click', () => {
			const content = header.nextElementSibling;
			const isExpanded = header.classList.toggle('active');
			content.style.maxHeight = isExpanded ? content.scrollHeight + "px" : "0px";
			const states = JSON.parse(localStorage.getItem('collapsibleStates')) || {};
			states[header.textContent.trim()] = isExpanded;
			localStorage.setItem('collapsibleStates', JSON.stringify(states));
		}));
		elements.querySearchResultsTbody.addEventListener('click', (e) => {
			const link = e.target.closest('a.external-link');
			if (link) { e.preventDefault(); window.electronAPI.openExternalLink(link.href); }
		});		


		// --- Listener para el Acordeón de la Documentación ---
		const allAccordionHeaders = document.querySelectorAll('.docu-accordion-header');
		
		allAccordionHeaders.forEach(header => {
			header.addEventListener('click', () => {
				// Encuentra el contenedor del acordeón al que pertenece este header
				const parentAccordion = header.closest('.docu-accordion');
				// Busca el header que ya está activo DENTRO de ese mismo acordeón
				const activeHeader = parentAccordion.querySelector('.docu-accordion-header.active');
				
				// Si hacemos clic en un header que ya está abierto (y no es el que pulsamos), lo cerramos.
				if (activeHeader && activeHeader !== header) {
					activeHeader.classList.remove('active');
					activeHeader.nextElementSibling.style.maxHeight = null;
				}

				// Abrimos o cerramos el header clicado.
				header.classList.toggle('active');
				const content = header.nextElementSibling;
				if (content.style.maxHeight) {
					content.style.maxHeight = null; // Colapsar
				} else {
					content.style.maxHeight = content.scrollHeight + "px"; // Expandir
				}
			});
		});		
	}
	async function showFilteredAutomations(automationNames) {
		// 1. Navega a la sección correcta
		showSection('gestion-automatismos-section');
		// 2. Llama al gestor de automatismos, pasándole los nombres para filtrar
		await automationsManager.view(automationNames);
	}

	// ==========================================================
	// --- 8. INICIALIZACIÓN DE LA APLICACIÓN ---
	// ==========================================================
	
	/**
	 * Función principal que se ejecuta al cargar la página.
	 * Actúa como un guardián: comprueba si la licencia es válida antes de iniciar la app.
	 */
	async function initializeApp() {
		initDomElements();
		setupEventListeners();

		const licenseInfoRaw = localStorage.getItem('isKeyValid');

		if (!licenseInfoRaw) {
			// Si no hay clave, directamente mostramos el modal. Fin de la función.
			elements.appContainer.classList.add('app-locked');
			elements.licenseModal.style.display = 'flex';
			return; 
		}

		// Si llegamos aquí, la clave EXISTE. Ahora la validamos.
		ui.blockUI("Validando licencia...");
		let isValid = false;
		try {
			const licenseInfo = JSON.parse(licenseInfoRaw);
			if (!licenseInfo.email || !licenseInfo.key) {
				throw new Error("Datos de licencia locales corruptos.");
			}
			// La validación en sí misma también puede fallar (ej. sin internet),
			// por eso está dentro del try.
			isValid = await window.electronAPI.validateLicense({ email: licenseInfo.email, key: licenseInfo.key });

		} catch (e) {
			// Si el parseo o la validación fallan, isValid sigue siendo false.
			console.error("Error validando la licencia:", e);
		}

		// Ahora, fuera del try...catch, decidimos qué hacer.
		ui.unblockUI();

		if (isValid === true) {
			// ¡Éxito! La clave es válida. Arrancamos la aplicación.
			// Cualquier error que ocurra a partir de ahora NO borrará la licencia.
			startFullApp();
		} else {
			// La clave existía pero no es válida (o hubo un error).
			// AHORA es el único momento en que borramos la clave.
			localStorage.removeItem('isKeyValid');
			if(elements.licenseErrorEl) {
				elements.licenseErrorEl.textContent = 'Tu acceso ha sido revocado o la validación falló. Por favor, introduce credenciales válidas.';
				elements.licenseErrorEl.style.display = 'block';
			}
			elements.appContainer.classList.add('app-locked');
			elements.licenseModal.style.display = 'flex'; 
		}
	}

	/**
	 * Contiene la lógica de arranque original de la aplicación.
	 * Solo se ejecuta una vez que la licencia ha sido validada.
	 */
	function startFullApp() {
		logger.startLogBuffering();
		if (localStorage.getItem('logCollapsedState') === 'true') 
		{
			elements.appContainer.classList.add('log-collapsed');
		}
		loadConfigsIntoSelect();
		loadAndSyncClientConfig(''); // Inicia sin ningún cliente seleccionado.

		fieldsTable.init();
		fieldsTable.clear();
		automationsManager.init({ getAuthenticatedConfig });
		journeysManager.init({ getAuthenticatedConfig });
		cloudPagesManager.init({ getAuthenticatedConfig });
		queryCloner.init({ getAuthenticatedConfig });
		deFinder.init({ getAuthenticatedConfig }); 
		dataSourceFinder.init({ getAuthenticatedConfig });
		queryTextFinder.init({ getAuthenticatedConfig });
		customerFinder.init({ getAuthenticatedConfig });
		emailValidator.init({ getAuthenticatedConfig });
		calendar.init({ 
			getAuthenticatedConfig, 
			showAutomationsView: showFilteredAutomations  
		});

		initializeCollapsibleMenus();
		logger.logMessage("Aplicación lista. Selecciona un cliente o configura uno nuevo.");
		logger.endLogBuffering();
	}

	// Inicia la aplicación.
	initializeApp();
});