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
    elements.licenseStatusMessage = document.getElementById('license-status-message');
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
    elements.logHeaderTitle = document.getElementById('log-header-title');
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
    elements.addSendConfigRowBtn = document.getElementById('addSendConfigRowBtn');
    elements.importDvConfigBtn = document.getElementById('importDvConfigBtn');
    elements.exportDvConfigBtn = document.getElementById('exportDvConfigBtn');

    // --- 5. Sección: Creación de Data Extension ---
    elements.deNameInput = document.getElementById('deName');
    elements.deDescriptionInput = document.getElementById('deDescription');
    elements.deExternalKeyInput = document.getElementById('deExternalKey');
    elements.deFolderInput = document.getElementById('deFolder');
    elements.selectDEFolderBtn = document.getElementById('selectDEFolderBtn');
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
    elements.selectDEFolderForDocBtn = document.getElementById('selectDEFolderForDocBtn');
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
    elements.selectTablesBtn = document.getElementById('selectTablesBtn');
    elements.getCustomerJourneysBtn = document.getElementById('getCustomerJourneysBtn');
    elements.ejectCustomerFromJourneysBtn = document.getElementById('ejectCustomerFromJourneysBtn');
    elements.customerJourneysResultsBlock = document.getElementById('customer-journeys-results-block');
    elements.customerJourneysTbody = document.getElementById('customer-journeys-tbody');
    elements.customerDesResultsBlock = document.getElementById('customer-des-results-block');
    elements.desResultsContainer = document.getElementById('des-results-container');
    elements.querySearchText = document.getElementById('querySearchText');
    elements.searchQueriesByTextBtn = document.getElementById('searchQueriesByTextBtn');
    elements.querySearchResultsTable = document.getElementById('query-search-results-table');
    elements.querySearchResultsTbody = document.querySelector('#query-search-results-tbody');
    elements.showQueryTextCheckbox = document.getElementById('showQueryTextCheckbox');
    elements.contentSearchValue = document.getElementById('contentSearchValue');
    elements.searchContentBtn = document.getElementById('searchContentBtn');
    elements.contentSearchResultsTbody = document.getElementById('content-search-results-tbody');
    elements.deSelectionBlock = document.getElementById('de-selection-block');
    elements.deSelectionTable = document.getElementById('de-selection-table');
    elements.selectAllDEsCheckbox = document.getElementById('selectAllDEsCheckbox');
    elements.searchSelectedDEsBtn = document.getElementById('searchSelectedDEsBtn');
    elements.showSourceQueryCheckbox = document.getElementById('showSourceQueryCheckbox'); 
    elements.activitySearchValue = document.getElementById('activitySearchValue');
    elements.searchActivityBtn = document.getElementById('searchActivityBtn'); 
    elements.activityUsageTbody = document.getElementById('activity-usage-tbody'); 
    elements.dataSourcesTable = document.getElementById('data-sources-table');
    elements.activityInfoBlock = document.getElementById('activity-info-block');
    elements.activityResultsBlock = document.getElementById('activity-results-block');
    elements.infoActivityName = document.getElementById('info-activity-name');
    elements.infoActivityType = document.getElementById('info-activity-type');
    elements.infoActivityKey = document.getElementById('info-activity-key');
    elements.activityTypeSelect = document.getElementById('activityTypeSelect');
    elements.scriptSearchText = document.getElementById('scriptSearchText');
    elements.searchScriptsByTextBtn = document.getElementById('searchScriptsByTextBtn');
    elements.scriptSearchResultsTbody = document.getElementById('script-search-results-tbody');
    elements.scriptSearchResultsTable = document.getElementById('script-search-results-table');

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
    elements.automationCountSpan = document.getElementById('automationCount');
    elements.downloadAutomationsCsvBtn = document.getElementById('downloadAutomationsCsvBtn');
    elements.paginationAutomations = document.getElementById('pagination-automations'); 
    elements.prevPageBtnAutomations = document.getElementById('prevPageBtnAutomations');
    elements.nextPageBtnAutomations = document.getElementById('nextPageBtnAutomations');
    elements.pageInputAutomations = document.getElementById('pageInputAutomations');
    elements.totalPagesAutomations = document.getElementById('totalPagesAutomations');
    elements.getNotificationsBtn = document.getElementById('getNotificationsBtn');
    elements.analyzeAutomationBtn = document.getElementById('analyzeAutomationBtn');

    // --- 12. Sección: Gestión de Journeys ---
    elements.journeysTbody = document.getElementById('journeys-tbody');
    elements.journeyNameFilter = document.getElementById('journeyNameFilter');
    elements.journeyTypeFilter = document.getElementById('journeyTypeFilter');
    elements.journeySubtypeFilter = document.getElementById('journeySubtypeFilter');
    elements.journeyStatusFilter = document.getElementById('journeyStatusFilter');
    elements.journeyDEFilter = document.getElementById('journeyDEFilter');
    elements.refreshJourneysTableBtn = document.getElementById('refreshJourneysTableBtn');
    elements.getCommunicationsBtn = document.getElementById('getCommunicationsBtn');
    elements.getAllCommunicationsBtn = document.getElementById('getAllCommunicationsBtn');
    elements.copyJourneyBtn = document.getElementById('copyJourneyBtn');
    elements.stopJourneyBtn = document.getElementById('stopJourneyBtn');
    elements.deleteJourneyBtn = document.getElementById('deleteJourneyBtn');
    elements.journeyCountSpan = document.getElementById('journeyCount');
    elements.downloadJourneysCsvBtn = document.getElementById('downloadJourneysCsvBtn');
    elements.prevPageBtnJourneys = document.getElementById('prevPageBtnJourneys');
    elements.nextPageBtnJourneys = document.getElementById('nextPageBtnJourneys');
    elements.pageInputJourneys = document.getElementById('pageInputJourneys');
    elements.totalPagesJourneys = document.getElementById('totalPagesJourneys');
    elements.analyzeJourneyBtn = document.getElementById('analyzeJourneyBtn');

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
    elements.cloudPageIdFilter = document.getElementById('cloudPageIdFilter');
    elements.cloudPageNameFilter = document.getElementById('cloudPageNameFilter');
    elements.cloudPageContentFilter = document.getElementById('cloudPageContentFilter');
    elements.cloudPageTypeFilter = document.getElementById('cloudPageTypeFilter');
    elements.refreshCloudPagesTableBtn = document.getElementById('refreshCloudPagesTableBtn');
    elements.getCloudPageIdsBtn = document.getElementById('getCloudPageIdsBtn');
    elements.downloadCloudPagesCsvBtn = document.getElementById('downloadCloudPagesCsvBtn');
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
    elements.automationClonerDestFolder = document.getElementById('automationClonerDestFolder');
    elements.changeAutomationFolderBtn = document.getElementById('changeAutomationFolderBtn');
    elements.defaultQueryFolder = document.getElementById('defaultQueryFolder');
    elements.changeDefaultQueryFolderBtn = document.getElementById('changeDefaultQueryFolderBtn');
    elements.defaultDEFolder = document.getElementById('defaultDEFolder');
    elements.changeDefaultDEFolderBtn = document.getElementById('changeDefaultDEFolderBtn');

    // --- 16. Sección: Creador de Carpetas ---
    elements.carpetasSection = document.getElementById('carpetas-section');
    elements.folderContentTypeSelect = document.getElementById('folderContentTypeSelect');
    elements.parentFolderNameInput = document.getElementById('parentFolderNameInput');
    elements.searchParentFolderBtn = document.getElementById('searchParentFolderBtn');
    elements.parentFolderResultsBlock = document.getElementById('parent-folder-results-block');
    elements.parentFolderResultsTbody = document.getElementById('parent-folder-results-tbody');
    elements.folderStructureBlock = document.getElementById('folder-structure-block');
    elements.folderStructureInput = document.getElementById('folderStructureInput');
    elements.createFoldersBtn = document.getElementById('createFoldersBtn');

    // --- 17. MODAL DE SELECCIÓN DE CARPETAS ---
    elements.folderSelectorModal = document.getElementById('folder-selector-modal');
    elements.folderSelectorTitle = document.getElementById('folder-selector-title');
    elements.folderSearchInput = document.getElementById('folderSearchInput');
    elements.folderSearchBtn = document.getElementById('folderSearchBtn');
    elements.folderSelectorResultsContainer = document.getElementById('folder-selector-results-container');
    elements.folderSelectorTable = document.getElementById('folder-selector-table');
    elements.folderSelectorTbody = document.getElementById('folder-selector-tbody');
    elements.folderSelectorCancelBtn = document.getElementById('folder-selector-cancel-btn');
    elements.folderSelectorOkBtn = document.getElementById('folder-selector-ok-btn');

    // --- AÑADIDO: 18. MODAL DE SELECCIÓN DE AUTOMATISMO Y DE ---
    elements.automationDeSelectorModal = document.getElementById('automation-de-selector-modal');
    // Step 1
    elements.automationSelectionStep = document.getElementById('automation-selection-step');
    elements.automationSearchInput = document.getElementById('automationSearchInput');
    elements.automationSearchBtn = document.getElementById('automationSearchBtn');
    elements.automationSelectorResultsContainer = document.getElementById('automation-selector-results-container');
    // Step 2
    elements.deSelectionStep = document.getElementById('de-selection-step');
    elements.deSelectorResultsContainer = document.getElementById('de-selector-results-container');
    // Actions
    elements.automationDeSelectorCancelBtn = document.getElementById('automation-de-selector-cancel-btn');
    elements.automationDeSelectorContinueBtn = document.getElementById('automation-de-selector-continue-btn');
    elements.automationDeSelectorCloneBtn = document.getElementById('automation-de-selector-clone-btn');

    // --- 19. MODAL CLONADOR DE JOURNEYS ---
    elements.journeyClonerModal = document.getElementById('journey-cloner-modal');
    elements.journeyClonerTitle = document.getElementById('journey-cloner-title');
    // Pasos
    elements.journeyClonerConfirmReuseDE = document.getElementById('journey-cloner-confirm-reuse-de');
    elements.journeyClonerSearchDE = document.getElementById('journey-cloner-search-de');
    elements.journeyClonerConfigureNewDE = document.getElementById('journey-cloner-configure-new-de');
    elements.journeyClonerFinalConfig = document.getElementById('journey-cloner-final-config');
    // Botones de pasos
    elements.journeyClonerReuseDEBtn = document.getElementById('journey-cloner-reuse-de-btn');
    elements.journeyClonerCloneNewDEBtn = document.getElementById('journey-cloner-clone-new-de-btn');
    // Controles
    elements.journeyClonerDESearchInput = document.getElementById('journeyClonerDESearchInput');
    elements.journeyClonerDESearchBtn = document.getElementById('journeyClonerDESearchBtn');
    elements.journeyClonerDEResultsContainer = document.getElementById('journey-cloner-de-results-container');
    elements.journeyClonerNewDEName = document.getElementById('journeyClonerNewDEName');
    elements.journeyClonerNewDEFolder = document.getElementById('journeyClonerNewDEFolder');
    elements.journeyClonerSelectDEFolderBtn = document.getElementById('journeyClonerSelectDEFolderBtn');
    elements.journeyClonerFinalStepTitle = document.getElementById('journey-cloner-final-step-title');
    elements.journeyClonerNewJourneyName = document.getElementById('journeyClonerNewJourneyName');
    elements.journeyClonerNewJourneyFolder = document.getElementById('journeyClonerNewJourneyFolder');
    elements.journeyClonerSelectJourneyFolderBtn = document.getElementById('journeyClonerSelectJourneyFolderBtn');
    // Acciones
    elements.journeyClonerCancelBtn = document.getElementById('journey-cloner-cancel-btn');
    elements.journeyClonerContinueBtn = document.getElementById('journey-cloner-continue-btn');
    elements.journeyClonerCloneBtn = document.getElementById('journey-cloner-clone-btn');

    // --- 20. MODAL DE IDS DE CLOUD PAGES ---
    elements.cloudPageIdsModal = document.getElementById('cloudpage-ids-modal-overlay');
    elements.cloudPageInternalApiLink = document.getElementById('cloudpage-internal-api-link');
    //elements.codeResourceInternalApiLink = document.getElementById('code-resource-internal-api-link');
    elements.cloudPageIdsPasteArea = document.getElementById('cloudpage-ids-paste-area');
    elements.cloudPageIdsCancelBtn = document.getElementById('cloudpage-ids-cancel-btn');
    elements.cloudPageIdsImportBtn = document.getElementById('cloudpage-ids-import-btn');

    // --- 21. MODAL DE CONTENIDOS DE CLOUD PAGES ---
    elements.getCloudPageContentsBtn = document.getElementById('getCloudPageContentsBtn');
    elements.cloudPageContentsModal = document.getElementById('cloudpage-contents-modal-overlay');
    elements.cloudPageCbLink = document.getElementById('cloudpage-cb-link');
    elements.cloudPageFetchScript = document.getElementById('cloudpage-fetch-script');
    elements.cloudPageCopyScriptBtn = document.getElementById('cloudpage-copy-script-btn');
    elements.cloudPageContentsPasteArea = document.getElementById('cloudpage-contents-paste-area');
    elements.cloudPageContentsCancelBtn = document.getElementById('cloudpage-contents-cancel-btn');
    elements.cloudPageContentsImportBtn = document.getElementById('cloudpage-contents-import-btn');

    // --- 22. GESTOR DE CONTENIDOS ---
    elements.importNewContentBtn = document.getElementById('importNewContentBtn');
    elements.contentManagerFilter = document.getElementById('contentManagerFilter');
    elements.contentManagerTabButtons = document.getElementById('content-manager-tab-buttons');
    elements.contentManagerTabContent = document.getElementById('content-manager-tab-content');

    // Modal de importación de contenidos (sin cambios en sus IDs)
    elements.contentManagerModal = document.getElementById('content-manager-modal-overlay');
    elements.contentManagerCbLink = document.getElementById('content-manager-cb-link');
    elements.contentManagerCopyScriptBtn = document.getElementById('content-manager-copy-script-btn');
    elements.contentManagerFetchScript = document.getElementById('content-manager-fetch-script');
    elements.contentManagerPasteArea = document.getElementById('content-manager-paste-area');
    elements.contentManagerCancelBtn = document.getElementById('content-manager-cancel-btn');
    elements.contentManagerImportBtn = document.getElementById('content-manager-import-btn');

    // --- 23. MODAL PARADA DE JOURNEYS ---
    elements.journeyStopModal = document.getElementById('journey-stop-modal');
    elements.journeyStopMessage = document.getElementById('journey-stop-message');
    elements.journeyStopAllBtn = document.getElementById('journey-stop-all-btn');
    elements.journeyStopCurrentBtn = document.getElementById('journey-stop-current-btn');
    elements.journeyStopCancelBtn = document.getElementById('journey-stop-cancel-btn');

    // --- 24. ANALIZADOR DE AUTOMATISMOS ---
    elements.automationAnalyzerSection = document.getElementById('automation-analyzer-section');
    elements.automationAnalyzerBackBtn = document.getElementById('automationAnalyzerBackBtn');
    elements.analyzerAutomationNameTitle = document.getElementById('analyzerAutomationNameTitle');
    elements.automationAnalyzerStepsContainer = document.getElementById('automationAnalyzerStepsContainer');
    elements.downloadAutomationPdfBtn = document.getElementById('downloadAutomationPdfBtn');

    // --- 25. ANALIZADOR DE JOURNEYS ---
    elements.journeyAnalyzerSection = document.getElementById('journey-analyzer-section');
    elements.journeyAnalyzerBackBtn = document.getElementById('journeyAnalyzerBackBtn'); 
    elements.analyzerJourneyNameTitle = document.getElementById('analyzerJourneyNameTitle');
    elements.journeyAnalyzerHeader = document.getElementById('journeyAnalyzerHeader');
    elements.journeyAnalyzerFlow = document.getElementById('journeyAnalyzerFlow');
    elements.journeyAnalyzerActivitiesContainer = document.getElementById('journeyAnalyzerActivitiesContainer');
    elements.downloadJourneyPdfBtn = document.getElementById('downloadJourneyPdfBtn');
}

export default elements;