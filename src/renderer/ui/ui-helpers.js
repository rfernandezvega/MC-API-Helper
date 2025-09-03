// Fichero: src/renderer/ui/ui-helpers.js
// Descripción: Contiene funciones de ayuda para manipular la interfaz de usuario,
// como mostrar modales, gestionar el estado de carga y la navegación.

import elements from './dom-elements.js';

/**
 * Muestra un modal de alerta no bloqueante.
 * @param {string} message - El mensaje a mostrar.
 */
export function showCustomAlert(message) {
    elements.customAlertMessage.textContent = message;
    elements.customAlertModal.style.display = 'flex';
}

/** Cierra el modal de alerta personalizado. */
export function closeCustomAlert() {
    elements.customAlertModal.style.display = 'none';
}

/**
 * Muestra un modal de confirmación no bloqueante.
 * @param {string} message - El mensaje de confirmación.
 * @returns {Promise<boolean>} - Resuelve a `true` si se confirma, `false` si se cancela.
 */
export function showCustomConfirm(message) {
    return new Promise(resolve => {
        elements.customConfirmMessage.textContent = message;
        elements.customConfirmModal.style.display = 'flex';

        const closeAndResolve = (value) => {
            elements.customConfirmModal.style.display = 'none';
            resolve(value);
        };

        elements.customConfirmOkBtn.addEventListener('click', () => closeAndResolve(true), { once: true });
        elements.customConfirmCancelBtn.addEventListener('click', () => closeAndResolve(false), { once: true });
        elements.customConfirmModal.addEventListener('click', (e) => {
            if (e.target === elements.customConfirmModal) closeAndResolve(false);
        }, { once: true });
    });
}

/**
 * Muestra un overlay de carga para prevenir interacciones.
 * @param {string} [message='Cargando...'] - El mensaje a mostrar.
 */
export function blockUI(message = 'Cargando...') {
    if (document.activeElement) document.activeElement.blur();
    if (elements.loaderText) {
        elements.loaderText.textContent = message;
    }
    elements.loaderOverlay.style.display = 'flex';
}

/** Oculta el overlay de carga. */
export function unblockUI() {
    elements.loaderOverlay.style.display = 'none';
    elements.appContainer.style.display = 'none';
    void elements.appContainer.offsetHeight;
    elements.appContainer.style.display = '';
    setTimeout(() => document.body.focus(), 0);
}

/**
 * Muestra una sección específica y oculta las demás.
 * @param {string} sectionId - El ID del elemento de la sección a mostrar.
 * @param {Array} navigationHistory - El array del historial de navegación para actualizarlo.
 * @param {boolean} [addToHistory=true] - Si es `false`, no añade la vista al historial.
 */
export function showSection(sectionId, navigationHistory, addToHistory = true) {
    elements.mainMenu.style.display = 'none';
    elements.allSections.forEach(s => s.style.display = 'none');

    const sectionToShow = document.getElementById(sectionId);
    if (sectionToShow) {
        sectionToShow.style.display = 'flex';
    } else {
        elements.mainMenu.style.display = 'flex';
        sectionId = 'main-menu';
    }

    if (addToHistory && navigationHistory[navigationHistory.length - 1] !== sectionId) {
        navigationHistory.push(sectionId);
    }
}