// Fichero: src/renderer/ui/dom-elements.js
// Descripción: Centraliza las referencias al DOM en un objeto que se inicializa
// de forma segura después de que el DOM esté completamente cargado.

const elements = {};

export function init() {
    // --- 1. Elementos Globales y Modales ---
    elements.appContainer = document.querySelector('.app-container');
    elements.loaderOverlay = document.getElementById('loader-overlay');
    elements.loaderText = document.getElementById('loader-text');
    elements.licenseModal = document.getElementById('license-modal-overlay');
    elements.licenseForm = document.getElementById('license-form');
    elements.licenseEmailInput = document.getElementById('license-email');
    elements.licenseKeyInput = document.getElementById('license-key');
    elements.licenseErrorEl = document.getElementById('license-error-message');
    elements.submitBtn = document.getElementById('license-submit-btn');
    elements.customAlertModal = document.getElementById('custom-alert-modal');
    elements.customAlertMessage = document.getElementById('custom-alert-message');
    elements.customAlertCloseBtn = document.getElementById('custom-alert-close-btn');
    elements.customConfirmModal = document.getElementById('custom-confirm-modal');
    elements.customConfirmMessage = document.getElementById('custom-confirm-message');
    elements.customConfirmOkBtn = document.getElementById('custom-confirm-ok-btn');
    elements.customConfirmCancelBtn = document.getElementById('custom-confirm-cancel-btn');
    elements.importModal = document.getElementById('import-modal');
    elements.pasteDataArea = document.getElementById('paste-data-area');
    elements.processPasteBtn = document.getElementById('process-paste-btn');
    elements.cancelPasteBtn = document.getElementById('cancel-paste-btn');
    elements.delimiterSelect = document.getElementById('delimiter-select');
    elements.customDelimiterInput = document.getElementById('custom-delimiter-input');
    elements.journeyFlowModal = document.getElementById('journey-flow-modal');
    elements.journeyFlowContent = document.getElementById('journey-flow-content');
    elements.closeFlowBtn = document.getElementById('close-flow-btn');
    elements.copyFlowBtn = document.getElementById('copyFlowBtn');

    // --- 2. Navegación y Barras Laterales ---
    elements.mainMenu = document.getElementById('main-menu');
    elements.allSections = document.querySelectorAll('#main-content > .section');
    elements.sidebarClientSelect = document.getElementById('sidebarClientSelect');
    elements.loginStatusEl = document.getElementById('login-status');
    elements.tabButtons = document.querySelectorAll('.tab-button');
    elements.tabContents = document.querySelectorAll('.tab-content');
    elements.collapsibleHeaders = document.querySelectorAll('.collapsible-header');

    // --- 3. Panel de Logs (Lateral Derecho) ---
    elements.toggleLogBtn = document.getElementById('toggleLogBtn');
    elements.logMessagesEl = document.getElementById('log-messages');
    elements.logRequestEl = document.getElementById('log-request');
    elements.logResponseEl = document.getElementById('log-response');

    // --- 4. Sección: Configuración de APIs ---
    elements.clientNameInput = document.getElementById('clientName');
    elements.savedConfigsSelect = document.getElementById('savedConfigs');
    elements.authUriInput = document.getElementById('authUri');
    elements.clientIdInput = document.getElementById('clientId');
    elements.clientSecretInput = document.getElementById('clientSecret');
    elements.businessUnitInput = document.getElementById('businessUnit');
    elements.tokenField = document.getElementById('token');
    elements.soapUriInput = document.getElementById('soapUri');
    elements.restUriInput = document.getElementById('restUri');
    elements.stackKeyInput = document.getElementById('stackKey');
    elements.saveConfigBtn = document.getElementById('saveConfigBtn');
    elements.loginBtn = document.getElementById('loginBtn');
    elements.logoutBtn = document.getElementById('logoutBtn');
    elements.sendsConfigTbody = document.getElementById('sends-config-tbody');
    elements.addSendConfigRowBtn = document.getElementById('add-send-config-row-btn');

    // --- 5. Sección: Creación de Data Extension ---
    elements.deNameInput = document.getElementById('deName');
    elements.deDescriptionInput = document.getElementById('deDescription');
    elements.deExternalKeyInput = document.getElementById('deExternalKey');
    elements.deFolderInput = document.getElementById('deFolder');
    elements.isSendableCheckbox = document.getElementById('isSendable');
    elements.subscriberKeyFieldSelect = document.getElementById('subscriberKeyField');
    elements.subscriberKeyTypeInput = document.getElementById('subscriberKeyType');
    elements.createDEBtn = document.getElementById('createDE');

    // --- 6. Sección: Configuración de Campos (Tabla Principal) ---
    elements.fieldsTableBody = document.querySelector('#myTable tbody');
    elements.addFieldBtn = document.getElementById('addFieldBtn');
    elements.createDummyFieldsBtn = document.getElementById('createDummyFieldsBtn');
    elements.createFieldsBtn = document.getElementById('createFieldsBtn');
    elements.clearFieldsBtn = document.getElementById('clearFieldsBtn');
    elements.moveUpBtn = document.getElementById('moveUp');
    elements.moveDownBtn = document.getElementById('moveDown');
    elements.importFieldsBtn = document.getElementById('importFieldsBtn');

    // --- 7. Sección: Gestión de Campos (Recuperar/Borrar) ---
    elements.recExternalKeyInput = document.getElementById('recExternalKey');
    elements.recCategoryIdInput = document.getElementById('recCategoryId');
    elements.targetFieldSelect = document.getElementById('targetFieldSelect');
    elements.getFieldsBtn = document.getElementById('getFields');
    elements.documentDEsBtn = document.getElementById('documentDEsBtn');
    elements.deleteFieldBtn = document.getElementById('deleteField');

    // --- 8. Sección: Buscadores ---
    elements.deSearchProperty = document.getElementById('deSearchProperty');
    elements.deSearchValue = document.getElementById('deSearchValue');
    elements.searchDEBtn = document.getElementById('searchDEBtn');
    elements.deSearchResultsTbody = document.querySelector('#de-search-results-tbody');
    elements.deNameToFindInput = document.getElementById('deNameToFind');
    elements.findDataSourcesBtn = document.getElementById('findDataSourcesBtn');
    elements.dataSourcesTbody = document.getElementById('data-sources-tbody');
    elements.customerSearchValue = document.getElementById('customerSearchValue');
    elements.searchCustomerBtn = document.getElementById('searchCustomerBtn');
    elements.customerSearchTbody = document.getElementById('customer-search-tbody');
    elements.getDEsBtn = document.getElementById('getDEsBtn');
    elements.getCustomerJourneysBtn = document.getElementById('getCustomerJourneysBtn');
    elements.customerJourneysResultsBlock = document.getElementById('customer-journeys-results-block');
    elements.customerJourneysTbody = document.getElementById('customer-journeys-tbody');
    elements.customerSendsResultsBlock = document.getElementById('customer-sends-results-block');
    elements.sendsResultsContainer = document.getElementById('sends-results-container');
    elements.querySearchText = document.getElementById('querySearchText');
    elements.searchQueriesByTextBtn = document.getElementById('searchQueriesByTextBtn');
    elements.querySearchResultsTable = document.getElementById('query-search-results-table');
    elements.querySearchResultsTbody = document.querySelector('#query-search-results-tbody');
    elements.showQueryTextCheckbox = document.getElementById('showQueryTextCheckbox');

    // --- 9. Sección: Validador de Email ---
    elements.emailToValidateInput = document.getElementById('emailToValidate');
    elements.validateEmailBtn = document.getElementById('validateEmailBtn');
    elements.emailValidationResults = document.getElementById('email-validation-results');

    // --- 10. Sección: Calendario ---
    elements.calendarGrid = document.getElementById('calendar-grid');
    elements.calendarYearSelect = document.getElementById('calendarYearSelect');
    elements.automationList = document.getElementById('automation-list');
    elements.automationListHeader = document.getElementById('automation-list-header');
    elements.refreshAutomationsBtn = document.getElementById('refreshAutomationsBtn');
    elements.refreshJourneyAutomationsBtn = document.getElementById('refreshJourneyAutomationsBtn');

    // --- 11. Sección: Gestión de Automatismos ---
    elements.automationsTbody = document.getElementById('automations-tbody');
    elements.automationNameFilter = document.getElementById('automationNameFilter');
    elements.automationStatusFilter = document.getElementById('automationStatusFilter');
    elements.refreshAutomationsTableBtn = document.getElementById('refreshAutomationsTableBtn');
    elements.activateAutomationBtn = document.getElementById('activateAutomationBtn');
    elements.runAutomationBtn = document.getElementById('runAutomationBtn');
    elements.stopAutomationBtn = document.getElementById('stopAutomationBtn');
    elements.cloneAutomationBtn = document.getElementById('cloneAutomationBtn');
    elements.paginationAutomations = document.getElementById('pagination-automations'); 
    elements.prevPageBtnAutomations = document.getElementById('prevPageBtnAutomations');
    elements.nextPageBtnAutomations = document.getElementById('nextPageBtnAutomations');
    elements.pageInputAutomations = document.getElementById('pageInputAutomations');
    elements.totalPagesAutomations = document.getElementById('totalPagesAutomations');

    // --- 12. Sección: Gestión de Journeys ---
    elements.journeysTbody = document.getElementById('journeys-tbody');
    elements.journeyNameFilter = document.getElementById('journeyNameFilter');
    elements.journeyTypeFilter = document.getElementById('journeyTypeFilter');
    elements.journeySubtypeFilter = document.getElementById('journeySubtypeFilter');
    elements.journeyStatusFilter = document.getElementById('journeyStatusFilter');
    elements.journeyDEFilter = document.getElementById('journeyDEFilter');
    elements.refreshJourneysTableBtn = document.getElementById('refreshJourneysTableBtn');
    elements.getCommunicationsBtn = document.getElementById('getCommunicationsBtn');
    elements.drawJourneyBtn = document.getElementById('drawJourneyBtn');
    elements.copyJourneyBtn = document.getElementById('copyJourneyBtn');
    elements.stopJourneyBtn = document.getElementById('stopJourneyBtn');
    elements.deleteJourneyBtn = document.getElementById('deleteJourneyBtn');
    elements.prevPageBtnJourneys = document.getElementById('prevPageBtnJourneys');
    elements.nextPageBtnJourneys = document.getElementById('nextPageBtnJourneys');
    elements.pageInputJourneys = document.getElementById('pageInputJourneys');
    elements.totalPagesJourneys = document.getElementById('totalPagesJourneys');

    // --- 13. Sección: Clonador de Queries ---
    elements.queriesClonerStep1 = document.getElementById('queries-cloner-step1');
    elements.queriesClonerStep2 = document.getElementById('queries-cloner-step2');
    elements.querySourceFolderNameInput = document.getElementById('querySourceFolderName');
    elements.queryTargetFolderNameInput = document.getElementById('queryTargetFolderName');
    elements.deTargetFolderNameInput = document.getElementById('deTargetFolderName');
    elements.queryClonerSearchFoldersBtn = document.getElementById('queryClonerSearchFoldersBtn');
    elements.queryClonerContinueBtn = document.getElementById('queryClonerContinueBtn');
    elements.queryClonerBackBtn = document.getElementById('queryClonerBackBtn');
    elements.queryClonerCloneBtn = document.getElementById('queryClonerCloneBtn');
    elements.queryClonerFolderResultsBlock = document.getElementById('query-cloner-folder-results');
    elements.querySourceFoldersTbody = document.getElementById('query-source-folders-tbody');
    elements.queryTargetFoldersTbody = document.getElementById('query-target-folders-tbody');
    elements.deTargetFoldersTbody = document.getElementById('de-target-folders-tbody');
    elements.querySelectionTbody = document.getElementById('query-selection-tbody');
    elements.selectAllQueriesCheckbox = document.getElementById('selectAllQueriesCheckbox');

    // --- 14. Sección: Gestión de Cloud Pages ---
    elements.cloudPagesTbody = document.getElementById('cloudpages-tbody');
    elements.cloudPageNameFilter = document.getElementById('cloudPageNameFilter');
    elements.cloudPageTypeFilter = document.getElementById('cloudPageTypeFilter');
    elements.refreshCloudPagesTableBtn = document.getElementById('refreshCloudPagesTableBtn');
    elements.prevPageBtnCloudPages = document.getElementById('prevPageBtnCloudPages');
    elements.nextPageBtnCloudPages = document.getElementById('nextPageBtnCloudPages');
    elements.pageInputCloudPages = document.getElementById('pageInputCloudPages');
    elements.totalPagesCloudPages = document.getElementById('totalPagesCloudPages');

    // --- 15. Sección: Clonador de Automatismos ---
    elements.automationClonerSection = document.getElementById('automation-cloner-section');
    elements.automationClonerBackBtn = document.getElementById('automationClonerBackBtn');
    elements.automationClonerContinueBtn = document.getElementById('automationClonerContinueBtn');
    elements.automationClonerSourceName = document.getElementById('automationClonerSourceName');
    elements.automationClonerDestName = document.getElementById('automationClonerDestName');
    elements.automationClonerStepsContainer = document.getElementById('automationClonerStepsContainer');
}

export default elements;