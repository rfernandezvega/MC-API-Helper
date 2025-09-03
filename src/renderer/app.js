import * as mcApiService from './api/mc-api-service.js';
import elements, { init as initDomElements } from './ui/dom-elements.js';
import * as ui from './ui/ui-helpers.js'; 
import * as logger from './ui/logger.js';

// --- MÓDULOS DE FUNCIONALIDADES ---
import * as fieldsTable from './components/fields-table.js';
import * as orgManager from './components/org-manager.js';
import * as documentationManager from './components/documentation-manager.js';
import * as deCreator from './components/de-creator.js';
import * as fieldManager from './components/field-manager.js';
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
	// --- VARIABLES DE ESTADO GLOBALES ---
	// ==========================================================
	let currentUserInfo = null;
	let currentOrgInfo = null;
	let navigationHistory = ['main-menu'];

	// ==========================================================
	// --- NAVEGACIÓN PRINCIPAL ---
	// ==========================================================
	
	function showSection(sectionId) {
		ui.showSection(sectionId, navigationHistory, true);
	}

	function goBack() {
		if (navigationHistory.length > 1) {
			navigationHistory.pop();
		}
		const previousSectionId = navigationHistory[navigationHistory.length - 1];
		ui.showSection(previousSectionId, navigationHistory, false);
	}

	// ==========================================================
	// --- GESTIÓN DE SESIÓN (ESTADO) ---
	// ==========================================================

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
	// ==========================================================

	async function getAuthenticatedConfig() {
		const clientName = elements.clientNameInput.value.trim();
		if (!clientName) throw new Error("No hay ningún cliente seleccionado.");
		const apiConfig = await window.electronAPI.getApiConfig(clientName);
		if (!apiConfig || !apiConfig.accessToken) {
			updateLoginStatus(false);
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
	
	// ==========================================================
	// --- GESTIÓN DE LICENCIA ---
	// ==========================================================

	async function handleLicenseSubmit(event) {
		event.preventDefault();
		const email = elements.licenseEmailInput.value.trim();
		const key = elements.licenseKeyInput.value.trim();

    	elements.licenseErrorEl.style.display = 'none';
		if (!email || !key) {
			ui.showCustomAlert('Por favor, completa ambos campos.');
			return;
		}

		elements.submitBtn.disabled = true;
		elements.submitBtn.textContent = 'Validando...';
		const result = await window.electronAPI.validateLicense({ email, key });
		elements.submitBtn.disabled = false;
		elements.submitBtn.textContent = 'Validar y Acceder';

		if (result && result.error) {
			elements.licenseErrorEl.textContent = `Error: ${result.error}`;
			elements.licenseErrorEl.style.display = 'block';
			return;
		}

		if (result === true) {
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
	// ==========================================================
	
	function setupEventListeners() {
		elements.licenseForm.addEventListener('submit', handleLicenseSubmit);
		elements.customAlertCloseBtn.addEventListener('click', ui.closeCustomAlert);
		elements.customAlertModal.addEventListener('click', (e) => {
			if (e.target === elements.customAlertModal) ui.closeCustomAlert();
		});

		// Eventos desde Proceso Principal (main.js)
		window.electronAPI.onTokenReceived(result => {
			ui.unblockUI();
			if (result.success) {
				ui.showCustomAlert("Login completado con éxito.");
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

		// Navegación
		document.querySelectorAll('.back-button').forEach(b => b.addEventListener('click', goBack));
		document.querySelectorAll('.macro-item').forEach(item => {
			item.addEventListener('click', async (e) => {
				e.preventDefault();
				const macro = e.target.getAttribute('data-macro');
				const sectionMap = { 
                    'docu': 'documentacion-section', 'configuracionAPIs': 'configuracion-apis-section', 
                    'configuracionDE': 'configuracion-de-section', 'campos': 'campos-section', 
                    'gestionCampos': 'configuracion-campos-section', 'validadorEmail': 'email-validator-section', 
                    'buscadores': 'buscadores-section', 'clonadorQueries': 'clonador-queries-section'
                };
				if (sectionMap[macro]) showSection(sectionMap[macro]);
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

		// --- Listeners de Componentes de UI Generales ---
		elements.toggleLogBtn.addEventListener('click', () => { 
			localStorage.setItem('logCollapsedState', elements.appContainer.classList.toggle('log-collapsed')); 
		});
		
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
	}

	async function showFilteredAutomations(automationNames) {
		showSection('gestion-automatismos-section');
		await automationsManager.view(automationNames);
	}
	
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

	// ==========================================================
	// --- INICIALIZACIÓN DE LA APLICACIÓN ---
	// ==========================================================
	
	async function initializeApp() {
		initDomElements();
		setupEventListeners();

		const licenseInfoRaw = localStorage.getItem('isKeyValid');
		if (!licenseInfoRaw) {
			elements.licenseModal.style.display = 'flex';
			return; 
		}

		ui.blockUI("Validando licencia...");
		let isValid = false;
		try {
			const licenseInfo = JSON.parse(licenseInfoRaw);
			isValid = await window.electronAPI.validateLicense({ email: licenseInfo.email, key: licenseInfo.key });
		} catch (e) {
			console.error("Error validando licencia:", e);
		}
		ui.unblockUI();

		if (isValid === true) {
			startFullApp();
		} else {
			localStorage.removeItem('isKeyValid');
			elements.licenseErrorEl.textContent = 'Acceso revocado o validación fallida.';
			elements.licenseErrorEl.style.display = 'block';
			elements.licenseModal.style.display = 'flex'; 
		}
	}

	function startFullApp() {
		if (localStorage.getItem('logCollapsedState') === 'true') {
			elements.appContainer.classList.add('log-collapsed');
		}

        // Inicialización de todos los módulos
		fieldsTable.init();
        documentationManager.init();
		
		orgManager.init({
			getAuthenticatedConfig,
			updateLoginStatus,
			customerFinder,
			calendar,
			automationsManager,
			journeysManager,
			cloudPagesManager
		});

        deCreator.init({ getAuthenticatedConfig });
        fieldManager.init({ getAuthenticatedConfig });
		automationsManager.init({ getAuthenticatedConfig });
		journeysManager.init({ getAuthenticatedConfig });
		cloudPagesManager.init({ getAuthenticatedConfig });
		queryCloner.init({ getAuthenticatedConfig });
		deFinder.init({ getAuthenticatedConfig }); 
		dataSourceFinder.init({ getAuthenticatedConfig });
		queryTextFinder.init({ getAuthenticatedConfig });
		customerFinder.init({ getAuthenticatedConfig });
		emailValidator.init({ getAuthenticatedConfig });
		calendar.init({ getAuthenticatedConfig, showAutomationsView: showFilteredAutomations });
		
		orgManager.loadConfigsIntoSelect();
		orgManager.loadAndSyncClientConfig('');

		initializeCollapsibleMenus(); // La llamada ya existía, ahora la función también existe.

		logger.startLogBuffering();
		logger.logMessage("Aplicación lista.");
		logger.endLogBuffering();
	}

	initializeApp();
});