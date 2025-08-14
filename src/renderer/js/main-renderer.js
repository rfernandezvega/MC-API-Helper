// RUTA: src/renderer/js/main-renderer.js

import { initConfigModule } from './modules/config-api.js'; 
import { initDeManagerModule } from './modules/de-manager.js';
import { initCalendarModule } from './modules/calendar.js';
import { initToolsModule } from './modules/tools.js';

const viewContainer = document.getElementById('view-container');
const sidebarLinks = document.querySelectorAll('.macro-item');
const appContainer = document.querySelector('.app-container');
const toggleLogBtn = document.getElementById('toggleLogBtn');

// Funciones de utilidad que pueden ser usadas por otros módulos.
export function logMessage(message) { document.getElementById('log-messages').textContent = message; }
export function logApiCall(requestData) { document.getElementById('log-request').textContent = (typeof requestData === 'object') ? JSON.stringify(requestData, null, 2) : requestData; }
export function logApiResponse(responseData) { document.getElementById('log-response').textContent = (typeof responseData === 'object') ? JSON.stringify(responseData, null, 2) : responseData; }
export function blockUI() { appContainer.classList.add('is-updating'); }
export function unblockUI() { appContainer.classList.remove('is-updating'); }

function showMainMenu() {
    viewContainer.innerHTML = `
    <div id="main-menu" class="main-menu-container" style="display: flex;">
      <div class="menu-group">
        <h3>Panel principal</h3>
        <p class="info-text">Selecciona alguna de las funcionalidades del panel izquierdo.</p>
        <p class="info-text">Para que funcione, recuerda haber seleccionado un cliente que tendrás que haber configurado previamente en "Configuración de APIs"</p>
      </div>
    </div>`;
}

async function loadView(viewName) {
    try {
        blockUI();
        logMessage(`Cargando vista: ${viewName}...`);
        
        const viewHtml = window.electronAPI.loadFileContent(viewName);
        viewContainer.innerHTML = viewHtml;

        switch (viewName) {
            case 'documentacion': initDocumentationView(); break;
            case 'config-api': initConfigModule(); break;
            case 'config-de':
            case 'campos':
            case 'manage-fields': initDeManagerModule(viewName); break;
            case 'calendario': initCalendarModule(); break;
            case 'find-de':
            case 'validate-email':
            case 'find-sources': initToolsModule(viewName); break;
        }
        
        document.querySelector('.back-button')?.addEventListener('click', showMainMenu);
        logMessage("Vista cargada.");
    } catch (error) {
        console.error('Error al cargar la vista:', error);
        viewContainer.innerHTML = `<h2 style="color: red;">Error Crítico al cargar la vista</h2><p>${error.message}</p>`;
        logMessage(`Error: ${error.message}`);
    } finally {
        unblockUI();
    }
}

function initDocumentationView() {
    const tabButtons = document.querySelectorAll('.tab-button');
    tabButtons.forEach(button => {
        button.addEventListener('click', () => {
            const tabId = button.getAttribute('data-tab');
            document.querySelectorAll('.tab-button').forEach(btn => btn.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
            button.classList.add('active');
            document.getElementById(tabId).classList.add('active');
        });
    });
}

function initializeApp() {
    sidebarLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const viewName = link.getAttribute('data-view');
            if (viewName) loadView(viewName);
        });
    });

    if (localStorage.getItem('logCollapsedState') === 'true') appContainer.classList.add('log-collapsed');
    toggleLogBtn.addEventListener('click', () => {
        const isCollapsed = appContainer.classList.toggle('log-collapsed');
        localStorage.setItem('logCollapsedState', isCollapsed);
    });

    const collapsibleHeaders = document.querySelectorAll('.collapsible-header');
    collapsibleHeaders.forEach(header => {
        header.addEventListener('click', () => {
            header.classList.toggle('active');
            const content = header.nextElementSibling;
            content.style.maxHeight = header.classList.contains('active') ? content.scrollHeight + "px" : 0;
        });
    });
    
    initConfigModule(true); 
    showMainMenu();
    logMessage("Aplicación lista.");
}

document.addEventListener('DOMContentLoaded', initializeApp);