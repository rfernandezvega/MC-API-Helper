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
import * as contentFinder from './components/content-finder.js';  			// Lógica del buscador de contenidos
import * as customerFinder from './components/customer-finder.js';         // Lógica del buscador de clientes/suscriptores.
import * as emailValidator from './components/email-validator.js';       // Lógica del validador de emails.
import * as calendar from './components/calendar.js';                  // Lógica del calendario de automatismos.
import * as automationCloner from './components/automation-cloner.js'; // Lógica del clonador de automatismos.
import * as folderCreator from './components/folder-creator.js'; // Lógica del creador de carpetas
import * as contentManager from './components/content-manager.js'; // Lógica del gestor de contenidos.
import * as actividadesFinder from './components/actividades-finder.js';
import * as scriptTextFinder from './components/script-text-finder.js';
import * as automationAnalyzer from './components/automation-analyzer.js';





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
			'buscadores-section': 'buscadores',
			'clonador-queries-section': 'clonadorQueries',
			'calendario-section': 'calendario',
			'gestion-automatismos-section': 'gestionAutomatismos',
			'gestion-journeys-section': 'gestionJourneys',
			'gestion-cloudpages-section': 'gestionCloudPages',
			'gestion-contenidos-section': 'gestionContenidos',
			'carpetas-section':'gestionCarpetas',
			'email-validator-section':'validadorEmail'
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
		// Cierra el cuadro de búsqueda si está abierto para evitar estado inconsistente.
		if (window.closeFindBox && document.getElementById('find-in-page-box').style.display !== 'none') {
			window.closeFindBox();
		}

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
			let statusHTML = `🟢 `;
			if (userInfo && userInfo.email) {
				statusHTML += `<small style="font-weight: normal;">${userInfo.preferred_username}</small>`;
			}else{
				statusHTML += `<strong>${clientName}</strong>`;
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
	
	/**
	 * Recopila el contenido de todos los paneles de log, lo formatea en un
	 * único string y lo descarga como un fichero .txt.
	 */
	function generateAndDownloadLog() {
		const messagesContent = elements.logMessagesEl.textContent;
		const requestContent = elements.logRequestEl.textContent;
		const responseContent = elements.logResponseEl.textContent;

		const separator = "\n\n========================================\n\n";

		const fullLogContent = [
			"--- MENSAJES ---",
			messagesContent,
			separator,
			"--- LLAMADAS API ---",
			requestContent,
			separator,
			"--- RESPUESTAS API ---",
			responseContent
		].join('\n\n');

		// Crear un nombre de fichero con la fecha y hora actual
		const now = new Date();
		const pad = (num) => num.toString().padStart(2, '0');
		const timestamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
		const fileName = `mc-api-helper_log_${timestamp}.txt`;

		// Lógica para crear y descargar el fichero
		const blob = new Blob([fullLogContent], { type: 'text/plain;charset=utf-8' });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = fileName;
		document.body.appendChild(a); // Necesario para que funcione en todos los entornos
		a.click();
		document.body.removeChild(a);
		URL.revokeObjectURL(url); // Liberar memoria
	}

	/**
	 * Configura toda la lógica para la funcionalidad de "Buscar en la página" (Ctrl+F).
	 */
	function setupFindInPage() {
		const findBox = document.getElementById('find-in-page-box');
		const findInput = document.getElementById('find-input');
		const findResults = document.getElementById('find-results');
		const findPrevBtn = document.getElementById('find-prev');
		const findNextBtn = document.getElementById('find-next');
		const findCloseBtn = document.getElementById('find-close');

		// --- FUNCIÓN DE BÚSQUEDA DIRECTA Y SIMPLE ---
		const performSearch = (text, options = {}) => {
			if (text) {
				window.electronAPI.findInPage(text, options);
			}
		};

		const closeFindBox = () => {
			findBox.style.display = 'none';
			window.electronAPI.stopFindInPage();
			findInput.value = '';
			findResults.textContent = '';
		};
		
		// --- EVENT LISTENERS ---

		// Abrir la caja de búsqueda con Ctrl+F
		document.addEventListener('keydown', (e) => {
			if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') {
				e.preventDefault();
				findBox.style.display = 'flex';
				findInput.select();
				findInput.focus();
			}
			// Cerrar con Escape
			if (e.key === 'Escape' && findBox.style.display === 'flex') {
				e.preventDefault();
				closeFindBox();
			}
		});

		// El listener principal: se activa al pulsar Enter en el input
		findInput.addEventListener('keydown', (e) => {
			if (e.key !== 'Enter') return;
			e.preventDefault();
			const searchText = findInput.value.trim();
			if (searchText) {
				// Inicia una nueva búsqueda o navega si el texto es el mismo
				performSearch(searchText, { findNext: true, forward: !e.shiftKey });
			}
		});

		// Botones de navegación: siempre usan el texto actual del input
		findPrevBtn.addEventListener('click', () => {
			performSearch(findInput.value.trim(), { findNext: true, forward: false });
		});

		findNextBtn.addEventListener('click', () => {
			performSearch(findInput.value.trim(), { findNext: true, forward: true });
		});

		findCloseBtn.addEventListener('click', closeFindBox);

		// LISTENER DE RESPUESTA: Directo y sin condiciones complicadas.
		// Simplemente muestra lo que Electron le dice.
		window.electronAPI.onFindReply((result) => {
			if (result.finalUpdate) {
				const searchText = findInput.value.trim();
				if (searchText) {
					if (result.matches > 0) {
						findResults.textContent = `${result.activeMatchOrdinal} de ${result.matches}`;
					} else {
						findResults.textContent = 'Sin resultados';
					}
				} else {
					findResults.textContent = ''; // Limpia si el cuadro está vacío
				}
			}
		});
		
		window.closeFindBox = closeFindBox;
	}

	// ==========================================================
	// --- EVENT LISTENERS GLOBALES ---
	// Configura todas las interacciones del usuario en la aplicación.
	// ==========================================================
	
	function setupEventListeners() {
		// Listener para el título del log
    	elements.logHeaderTitle.addEventListener('click', generateAndDownloadLog);

		// Listeners para el modal de licencia y alertas personalizadas.
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
				const macroToActionMap = { //Un mapa para vistas simples
					'carpetas': 'carpetas-section'
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
				}
				else if (macro === 'gestionJourneys') {
					showSection('gestion-journeys-section');
					await journeysManager.view();
				}
				else if (macro === 'gestionCloudPages') {
					showSection('gestion-cloudpages-section');
					await cloudPagesManager.view();
				}
				else if (macro === 'gestionContenidos') {
                    showSection('gestion-contenidos-section');
                    await contentManager.view();
                }
				else if (macroToActionMap[macro]) { 
					showSection(macroToActionMap[macro]);
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
	function showAutomationCloner(automationDetails) {
		// 1. Muestra la sección del clonador (aún vacía).
		showSection('automation-cloner-section');		

		// 2. Llama a la función view del clonador para que empiece a cargar los datos.
		// Nota: Ya no necesitamos `await` aquí, porque la función `view` ahora maneja su propio ciclo de vida.
		automationCloner.view(automationDetails);
	}

	function showAutomationAnalyzer(automationDetails) {
		showSection('automation-analyzer-section');
		automationAnalyzer.view(automationDetails);
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

		// Muestra el modal de licencia con un mensaje de espera
		elements.licenseModal.style.display = 'flex';
		elements.licenseStatusMessage.textContent = 'Verificando licencia de usuario...';

		try {
			// Llama a la función del backend
			const isValid = await window.electronAPI.checkSystemUserLicense();

			if (isValid === true) {
				// Si la licencia es válida, oculta el modal y arranca la aplicación
				elements.licenseModal.style.display = 'none';
				startFullApp();
			} else {
				// Si el usuario no es válido, muestra un mensaje de error permanente y bloquea la app
				elements.licenseStatusMessage.textContent = 'No tienes permiso para utilizar esta aplicación. Por favor, contacta con el administrador.';
				// (Opcional) Puedes añadir una clase para estilizar el error, si la tienes en tu CSS
				// elements.licenseStatusMessage.classList.add('error-text'); 
			}
		} catch (error) {
			// Si ocurre un error de comunicación (ej: sin internet), lo muestra
			elements.licenseStatusMessage.textContent = `Error de validación: ${error.message || 'No se pudo conectar para validar la licencia.'}.`;
			// elements.licenseStatusMessage.classList.add('error-text');
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
			automationCloner, 
			automationAnalyzer,
			contentManager 
		});

        deCreator.init({ getAuthenticatedConfig });
        fieldManager.init({ getAuthenticatedConfig });
		// El gestor de automatismos necesita una función "puente" para poder navegar a otra vista (la de clonado)
		automationsManager.init({ getAuthenticatedConfig, showAutomationClonerView: showAutomationCloner, showAutomationAnalyzerView: showAutomationAnalyzer });
		journeysManager.init({ getAuthenticatedConfig });
		cloudPagesManager.init({ getAuthenticatedConfig });
		queryCloner.init({ getAuthenticatedConfig });
		deFinder.init({ getAuthenticatedConfig }); 
		dataSourceFinder.init({ getAuthenticatedConfig });
		queryTextFinder.init({ getAuthenticatedConfig });
		scriptTextFinder.init({ getAuthenticatedConfig });
		customerFinder.init({ getAuthenticatedConfig });
		contentFinder.init({ getAuthenticatedConfig });
		emailValidator.init({ getAuthenticatedConfig });
		actividadesFinder.init({ getAuthenticatedConfig });
		// El calendario necesita una función "puente" para poder navegar a otra vista (la de gestión de automatismos)
		calendar.init({ getAuthenticatedConfig, showAutomationsView: showFilteredAutomations });
		automationCloner.init({ getAuthenticatedConfig, goBack });
		automationAnalyzer.init({ getAuthenticatedConfig, goBack });
		folderCreator.init({ getAuthenticatedConfig });
		contentManager.init({ getAuthenticatedConfig });
		
		// Carga las configuraciones de cliente guardadas y arranca sin ninguna seleccionada.
		orgManager.loadConfigsIntoSelect();
		orgManager.loadAndSyncClientConfig('');

		// Restaura el estado de los menús desplegables.
		initializeCollapsibleMenus();

		logger.startLogBuffering();
		logger.logMessage("Aplicación lista.");
		logger.endLogBuffering();

		// Activa la funcionalidad de búsqueda en la página.
		setupFindInPage();

		// Carga y muestra la versión de la aplicación en la UI
        (async () => {
            try {
                const version = await window.electronAPI.getAppVersion();
                const versionElement = document.getElementById('app-version');
                if (versionElement) {
                    versionElement.textContent = `${version}`;
                }
            } catch (error) {
                console.error("No se pudo obtener la versión de la app:", error);
            }
        })();
	}

	// Inicia todo el proceso.
	initializeApp();
});