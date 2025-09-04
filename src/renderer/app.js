// =======================================================================================
// --- app.js ---
// Fichero Principal del Proceso de Renderizado (Frontend)
// Orquesta la inicialización de la aplicación, gestiona el estado global (sesión, navegación),
// y coordina la comunicación entre los diferentes módulos de funcionalidades.
// =======================================================================================


// --- 1. IMPORTACIÓN DE MÓDULOS ---

// Módulos principales y de UI
import * as mcApiService from './api/mc-api-service.js';            // Centraliza las llamadas a la API de Marketing Cloud.
import elements, { init as initDomElements } from './ui/dom-elements.js'; // Objeto que contiene todas las referencias a los elementos del DOM.
import * as ui from './ui/ui-helpers.js';                           // Funciones de ayuda para la UI (modales, bloqueo de pantalla, etc.).
import * as logger from './ui/logger.js';                           // Gestor del panel de logs.

// Módulos de Funcionalidades (Componentes)
// Cada módulo encapsula la lógica de una sección específica de la aplicación.
import * as fieldsTable from './components/fields-table.js';         // Lógica de la tabla de campos de Data Extension.
import * as orgManager from './components/org-manager.js';             // Lógica para gestionar las configuraciones de clientes (login, guardado, etc.).
import * as documentationManager from './components/documentation-manager.js'; // Lógica para la sección de documentación.
import * as deCreator from './components/de-creator.js';             // Lógica para el formulario de creación de Data Extensions.
import * as fieldManager from './components/field-manager.js';           // Lógica para la gestión de campos (recuperar, borrar, documentar).
import * as automationsManager from './components/automations-manager.js'; // Lógica de la vista "Gestión de Automatismos".
import * as journeysManager from './components/journeys-manager.js';       // Lógica de la vista "Gestión de Journeys".
import * as cloudPagesManager from './components/cloud-pages-manager.js';    // Lógica de la vista "Gestión de Cloud Pages".
import * as queryCloner from './components/query-cloner.js';           // Lógica del clonador masivo de queries.
import * as deFinder from './components/de-finder.js';               // Lógica del buscador de Data Extensions.
import * as dataSourceFinder from './components/data-source-finder.js';  // Lógica del buscador de orígenes de datos.
import * as queryTextFinder from './components/query-text-finder.js';      // Lógica del buscador de texto en queries.
import * as customerFinder from './components/customer-finder.js';         // Lógica del buscador de clientes/suscriptores.
import * as emailValidator from './components/email-validator.js';       // Lógica del validador de emails.
import * as calendar from './components/calendar.js';                  // Lógica del calendario de automatismos.
import * as automationCloner from './components/automation-cloner.js'; // Lógica del clonador de automatismos.


// --- 2. PUNTO DE ENTRADA PRINCIPAL ---
// Espera a que todo el HTML esté cargado antes de ejecutar cualquier código.
document.addEventListener('DOMContentLoaded', function () {
	// Inicializa el objeto 'elements' para que contenga todas las referencias al DOM.
	initDomElements();
	
	// ==========================================================
	// --- VARIABLES DE ESTADO GLOBALES ---
	// Almacenan el estado de la sesión y la navegación actual.
	// ==========================================================
	let currentUserInfo = null;      // Guarda la información del usuario logueado.
	let currentOrgInfo = null;       // Guarda la información de la organización (stack, etc.).
	let navigationHistory = ['main-menu']; // Un array que funciona como una pila para el botón "Atrás".

	// ==========================================================
	// --- NAVEGACIÓN PRINCIPAL ---
	// Funciones que controlan qué vista se muestra en la pantalla.
	// ==========================================================
	
	/**
	 * Actualiza el enlace activo en la barra lateral izquierda.
	 * @param {string} activeSectionId - El ID de la sección que está visible.
	 */
	function updateActiveSidebarLink(activeSectionId) {
		// Primero, elimina la clase 'active' de todos los enlaces del menú.
		document.querySelectorAll('.macro-item').forEach(link => link.classList.remove('active'));

		// Si volvemos al menú principal, no hay nada que resaltar, así que terminamos.
		if (activeSectionId === 'main-menu') {
			return;
		}

		// Mapeo inverso para encontrar el 'data-macro' que corresponde a la sección activa.
		const sectionToMacroMap = {
			'documentacion-section': 'docu',
			'configuracion-apis-section': 'configuracionAPIs',
			'configuracion-de-section': 'configuracionDE',
			'campos-section': 'campos',
			'configuracion-campos-section': 'gestionCampos',
			'validadorEmail-section': 'validadorEmail',
			'buscadores-section': 'buscadores',
			'clonadorQueries-section': 'clonadorQueries',
			'calendario-section': 'calendario',
			'gestion-automatismos-section': 'gestionAutomatismos',
			'gestion-journeys-section': 'gestionJourneys',
			'gestion-cloudpages-section': 'gestionCloudPages'
		};

		const activeMacro = sectionToMacroMap[activeSectionId];

		if (activeMacro) {
			// Selecciona el enlace que tiene el 'data-macro' correspondiente y le añade la clase 'active'.
			const activeLink = document.querySelector(`.macro-item[data-macro="${activeMacro}"]`);
			if (activeLink) {
				activeLink.classList.add('active');
			}
		}
	}

	/**
	 * Muestra una sección de la UI y la añade al historial de navegación.
	 * @param {string} sectionId - El ID de la sección a mostrar.
	 */
	function showSection(sectionId) {
		// Delega en el ui-helper, pasándole el historial para que lo pueda modificar.
		ui.showSection(sectionId, navigationHistory, true);
		// Se asegura de que el menú lateral se actualice cada vez que se muestra una sección.
		updateActiveSidebarLink(sectionId);
	}

	/**
	 * Navega a la sección anterior registrada en el historial.
	 */
	function goBack() {
		// Saca el último elemento del historial si hay más de uno.
		if (navigationHistory.length > 1) {
			navigationHistory.pop();
		}
		// Obtiene la nueva última sección del historial.
		const previousSectionId = navigationHistory[navigationHistory.length - 1];
		// Muestra la sección anterior sin volver a añadirla al historial.
		ui.showSection(previousSectionId, navigationHistory, false);
		// También actualiza el menú al usar el botón "Atrás".
		updateActiveSidebarLink(previousSectionId);
	}

	// ==========================================================
	// --- GESTIÓN DE ESTADO DE LA SESIÓN ---
	// Actualiza la UI para reflejar si hay una sesión activa.
	// ==========================================================

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
		} else {
			elements.loginStatusEl.innerHTML = '🔴 Sesión no iniciada';
		}
        elements.loginStatusEl.className = `login-status ${isLoggedIn ? 'active' : 'inactive'}`;
	}

	// ==========================================================
	// --- FUNCIÓN CENTRAL DE AUTENTICACIÓN ---
	// Actúa como un "guardián" para todas las llamadas a la API.
	// ==========================================================

	/**
	 * Obtiene la configuración de API autenticada desde el proceso principal (main.js).
	 * Gestiona el refresco de tokens y actualiza la UI con los datos de la sesión.
	 * @returns {Promise<object>} Un objeto de configuración listo para ser usado en llamadas a la API.
	 * @throws {Error} Si no hay cliente seleccionado o si la sesión no es válida.
	 */
	async function getAuthenticatedConfig() {
		const clientName = elements.clientNameInput.value.trim();
		if (!clientName) throw new Error("No hay ningún cliente seleccionado.");

		// Llama al proceso principal para obtener el token de forma segura.
		const apiConfig = await window.electronAPI.getApiConfig(clientName);

		// Si no hay token, la sesión no es válida.
		if (!apiConfig || !apiConfig.accessToken) {
			updateLoginStatus(false);
			throw new Error("Sesión no activa. Por favor, inicia sesión.");
		}

		// Si la sesión es válida, actualiza los campos de la UI con la información recibida.
		elements.tokenField.value = apiConfig.accessToken;
		elements.soapUriInput.value = apiConfig.soapUri;
		elements.restUriInput.value = apiConfig.restUri;
		currentUserInfo = apiConfig.userInfo;
		currentOrgInfo = apiConfig.orgInfo;
		elements.stackKeyInput.value = currentOrgInfo?.stack_key || 'No disponible';
		
		// Pasa la información a módulos que la necesitan.
		queryTextFinder.updateOrgInfo(apiConfig.orgInfo);
		updateLoginStatus(true, clientName, currentUserInfo);

		// Añade el MID (Business Unit) al objeto de configuración antes de devolverlo.
		apiConfig.businessUnit = elements.businessUnitInput.value.trim();
		return apiConfig;
	}
	
	// ==========================================================
	// --- GESTIÓN DE LICENCIA ---
	// Controla el acceso inicial a la aplicación.
	// ==========================================================

	/**
	 * Gestiona el envío del formulario de licencia.
	 * Llama al backend para validar las credenciales.
	 * @param {Event} event - El evento de envío del formulario.
	 */
	async function handleLicenseSubmit(event) {
		event.preventDefault(); // Evita que la página se recargue.
		const email = elements.licenseEmailInput.value.trim();
		const key = elements.licenseKeyInput.value.trim();

    	elements.licenseErrorEl.style.display = 'none';
		if (!email || !key) {
			ui.showCustomAlert('Por favor, completa ambos campos.');
			return;
		}

		ui.blockUI('Validando...');
		const result = await window.electronAPI.validateLicense({ email, key });
		ui.unblockUI();

		if (result && result.error) {
			elements.licenseErrorEl.textContent = `Error: ${result.error}`;
			elements.licenseErrorEl.style.display = 'block';
			return;
		}

		if (result === true) {
			// Si la validación es exitosa, guarda la licencia y arranca la app.
			localStorage.setItem('isKeyValid', JSON.stringify({ email, key }));
			elements.licenseModal.style.display = 'none';
			startFullApp();
		} else {
			elements.licenseErrorEl.textContent = 'Email o clave de acceso no válidos.';
			elements.licenseErrorEl.style.display = 'block';
		}
	}

	// ==========================================================
	// --- EVENT LISTENERS GLOBALES ---
	// Configura todas las interacciones del usuario en la aplicación.
	// ==========================================================
	
	function setupEventListeners() {
		// Listeners para el modal de licencia y alertas personalizadas.
		elements.licenseForm.addEventListener('submit', handleLicenseSubmit);
		elements.customAlertCloseBtn.addEventListener('click', ui.closeCustomAlert);
		elements.customAlertModal.addEventListener('click', (e) => {
			if (e.target === elements.customAlertModal) ui.closeCustomAlert();
		});

		// Listeners para eventos que vienen DESDE el proceso principal (main.js).
		// La aplicación reacciona a eventos como "login completado" o "logout exitoso".
		window.electronAPI.onTokenReceived(result => {
			ui.unblockUI();
			if (result.success) {
				ui.showCustomAlert("Login completado con éxito.");
				// Carga la configuración del cliente recién logueado.
				orgManager.loadAndSyncClientConfig(elements.clientNameInput.value);
			} else {
				ui.showCustomAlert(`Error en el login: ${result.error}`);
				updateLoginStatus(false);
			}
		});

		window.electronAPI.onLogoutSuccess(() => {
			ui.showCustomAlert(`Sesión cerrada y configuración borrada.`);
			orgManager.loadConfigsIntoSelect();
			orgManager.loadAndSyncClientConfig('');
		});

		window.electronAPI.onRequireLogin(data => {
			ui.showCustomAlert(`La sesión ha expirado. Por favor, haz login de nuevo.\nMotivo: ${data.message}`);
			updateLoginStatus(false);
		});

		// Listener principal de navegación (menú lateral izquierdo).
		document.querySelectorAll('.back-button').forEach(b => b.addEventListener('click', goBack));
		document.querySelectorAll('.macro-item').forEach(item => {
			item.addEventListener('click', async (e) => {
				e.preventDefault();
				const macro = e.target.getAttribute('data-macro');
				// Mapeo de vistas simples que solo necesitan mostrarse.
				const sectionMap = { 
                    'docu': 'documentacion-section', 'configuracionAPIs': 'configuracion-apis-section', 
                    'configuracionDE': 'configuracion-de-section', 'gestionCampos': 'configuracion-campos-section', 
					'validadorEmail': 'email-validator-section', 'buscadores': 'buscadores-section', 
					'clonadorQueries': 'clonador-queries-section'
                };
				
				if (sectionMap[macro]) {
					showSection(sectionMap[macro]);
				} 
				// Vistas complejas que necesitan cargar datos antes de mostrarse.
				else if (macro === 'campos') {
                    showSection('campos-section');
                    fieldsTable.prepareView();
                }
				else if (macro === 'calendario'){
                    showSection('calendario-section');
                    calendar.view();
                }  
				else if (macro === 'gestionAutomatismos') {
					showSection('gestion-automatismos-section');
					await automationsManager.view(); 
				} else if (macro === 'gestionJourneys') {
					showSection('gestion-journeys-section');
					await journeysManager.view();
				} else if (macro === 'gestionCloudPages') {
					showSection('gestion-cloudpages-section');
					await cloudPagesManager.view();
				}
			});
		});

		// Listeners para componentes de UI genéricos (log, pestañas, menús desplegables).
		elements.toggleLogBtn.addEventListener('click', () => { 
			localStorage.setItem('logCollapsedState', elements.appContainer.classList.toggle('log-collapsed')); 
		});
		
		// Este listener gestiona TODOS los sistemas de pestañas de la aplicación.
		elements.tabButtons.forEach(button => button.addEventListener('click', () => {
			const tabId = button.getAttribute('data-tab');
			const parent = button.closest('.tabs-container');
			parent.querySelectorAll('.tab-button').forEach(btn => btn.classList.remove('active'));
			parent.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
			button.classList.add('active');
			parent.querySelector(`#${tabId}`).classList.add('active');
		}));

		// Este listener gestiona TODOS los menús colapsables.
		elements.collapsibleHeaders.forEach(header => header.addEventListener('click', () => {
			const content = header.nextElementSibling;
			const isExpanded = header.classList.toggle('active');
			content.style.maxHeight = isExpanded ? content.scrollHeight + "px" : "0px";
			// Guarda el estado (abierto/cerrado) para recordarlo al reiniciar la app.
			const states = JSON.parse(localStorage.getItem('collapsibleStates')) || {};
			states[header.textContent.trim()] = isExpanded;
			localStorage.setItem('collapsibleStates', JSON.stringify(states));
		}));
	}

	/**
	 * Función "puente" que permite a otros módulos (como el calendario)
	 * navegar a la vista de automatismos y pasarle una lista de nombres para filtrar.
	 * @param {Array<string>} automationNames - Nombres de los automatismos a mostrar.
	 */
	async function showFilteredAutomations(automationNames) {
		showSection('gestion-automatismos-section');
		await automationsManager.view(automationNames);
	}

	/**
	 * Función "puente" que permite a otros módulos (como automations-manager)
	 * navegar a la vista del clonador y pasarle los detalles de un automatismo.
	 * @param {object} automationDetails - Objeto con los detalles del automatismo.
	 */
	async function showAutomationCloner(automationDetails) {
		showSection('automation-cloner-section');
		automationCloner.view(automationDetails);
	}
	
	/** 
	 * Restaura el estado (abierto/cerrado) de los menús colapsables al iniciar la app,
	 * leyendo los datos guardados en localStorage.
	 */
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

	// ==========================================================
	// --- INICIALIZACIÓN DE LA APLICACIÓN ---
	// Lógica de arranque que se ejecuta una sola vez.
	// ==========================================================
	
	/**
	 * Función "guardián" que se ejecuta al cargar la página.
	 * Comprueba si la licencia es válida antes de iniciar el resto de la aplicación.
	 */
	async function initializeApp() {
		initDomElements();
		setupEventListeners();

		// Comprueba si hay una licencia guardada.
		const licenseInfoRaw = localStorage.getItem('isKeyValid');
		if (!licenseInfoRaw) {
			// Si no hay, muestra el modal de login y detiene la carga.
			elements.licenseModal.style.display = 'flex';
			return; 
		}

		// Si hay una licencia, la valida contra el backend.
		ui.blockUI("Validando licencia...");
		let isValid = false;
		try {
			const licenseInfo = JSON.parse(licenseInfoRaw);
			isValid = await window.electronAPI.validateLicense({ email: licenseInfo.email, key: licenseInfo.key });
		} catch (e) {
			console.error("Error validando la licencia:", e);
		}
		ui.unblockUI();

		if (isValid === true) {
			// Si la licencia es válida, arranca la aplicación completa.
			startFullApp();
		} else {
			// Si no es válida, la borra y pide credenciales de nuevo.
			localStorage.removeItem('isKeyValid');
			elements.licenseErrorEl.textContent = 'Acceso revocado o validación fallida.';
			elements.licenseErrorEl.style.display = 'block';
			elements.licenseModal.style.display = 'flex'; 
		}
	}

	/**
	 * Contiene la lógica de arranque de la aplicación una vez validada la licencia.
	 * Inicializa todos los módulos de funcionalidades.
	 */
	function startFullApp() {
		// Restaura el estado colapsado del log si estaba guardado.
		if (localStorage.getItem('logCollapsedState') === 'true') {
			elements.appContainer.classList.add('log-collapsed');
		}

        // --- INICIALIZACIÓN DE MÓDULOS ---
		// Se llama al método `init()` de cada módulo, pasándole como dependencias
		// las funciones o módulos que pueda necesitar desde `app.js`.
		fieldsTable.init();
        documentationManager.init();
		
		// El gestor de organizaciones necesita referencias a otros módulos para poder limpiar sus cachés.
		orgManager.init({
			getAuthenticatedConfig,
			updateLoginStatus,
			customerFinder,
			calendar,
			automationsManager,
			journeysManager,
			cloudPagesManager,
			automationCloner 
		});

        deCreator.init({ getAuthenticatedConfig });
        fieldManager.init({ getAuthenticatedConfig });
		// El gestor de automatismos necesita una función "puente" para poder navegar a otra vista (la de clonado)
		automationsManager.init({ getAuthenticatedConfig, showAutomationClonerView: showAutomationCloner });
		journeysManager.init({ getAuthenticatedConfig });
		cloudPagesManager.init({ getAuthenticatedConfig });
		queryCloner.init({ getAuthenticatedConfig });
		deFinder.init({ getAuthenticatedConfig }); 
		dataSourceFinder.init({ getAuthenticatedConfig });
		queryTextFinder.init({ getAuthenticatedConfig });
		customerFinder.init({ getAuthenticatedConfig });
		emailValidator.init({ getAuthenticatedConfig });
		// El calendario necesita una función "puente" para poder navegar a otra vista (la de gestión de automatismos)
		calendar.init({ getAuthenticatedConfig, showAutomationsView: showFilteredAutomations });
		automationCloner.init({ getAuthenticatedConfig, goBack });
		
		// Carga las configuraciones de cliente guardadas y arranca sin ninguna seleccionada.
		orgManager.loadConfigsIntoSelect();
		orgManager.loadAndSyncClientConfig('');

		// Restaura el estado de los menús desplegables.
		initializeCollapsibleMenus();

		logger.startLogBuffering();
		logger.logMessage("Aplicación lista.");
		logger.endLogBuffering();
	}

	// Inicia todo el proceso.
	initializeApp();
});