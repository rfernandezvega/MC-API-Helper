// Fichero: src/renderer/components/folder-creator.js
// Descripción: Módulo para la creación masiva de estructuras de carpetas.

import * as mcApiService from '../api/mc-api-service.js';
import elements from '../ui/dom-elements.js';
import * as ui from '../ui/ui-helpers.js';
import * as logger from '../ui/logger.js';

let getAuthenticatedConfig;

const state = {
    contentType: null,
    parentFolder: null
};

export function init(dependencies) {
    getAuthenticatedConfig = dependencies.getAuthenticatedConfig;

    elements.folderContentTypeSelect.addEventListener('change', handleContentTypeChange);
    elements.parentFolderNameInput.addEventListener('input', () => {
        elements.searchParentFolderBtn.disabled = elements.parentFolderNameInput.value.trim() === '';
    });
    elements.searchParentFolderBtn.addEventListener('click', searchParentFolder);
    elements.parentFolderResultsTbody.addEventListener('click', handleParentFolderSelect);
    elements.createFoldersBtn.addEventListener('click', executeFolderCreation);

    elements.folderStructureInput.addEventListener('keydown', handleTabIndentation);
}

/**
 * Gestiona el evento de presionar una tecla en el textarea de estructura
 * para permitir la tabulación (Tab) y la anulación de tabulación (Shift+Tab).
 * @param {KeyboardEvent} e - El evento del teclado.
 */
function handleTabIndentation(e) {
    // Solo nos interesa la tecla Tab
    if (e.key === 'Tab') {
        // Prevenimos el comportamiento por defecto (cambiar el foco)
        e.preventDefault();

        const textarea = e.target;
        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        const value = textarea.value;

        // Dos espacios es una sangría común y evita problemas con tabuladores
        const indentation = '  '; 

        // Si se presiona Shift + Tab (para quitar sangría)
        if (e.shiftKey) {
            // Buscamos el inicio de la línea actual
            const lineStart = value.lastIndexOf('\n', start - 1) + 1;
            // Si la línea empieza con nuestra sangría, la quitamos
            if (value.substring(lineStart, lineStart + indentation.length) === indentation) {
                textarea.value = value.substring(0, lineStart) + value.substring(lineStart + indentation.length);
                // Movemos el cursor adecuadamente
                textarea.selectionStart = Math.max(lineStart, start - indentation.length);
                textarea.selectionEnd = Math.max(lineStart, end - indentation.length);
            }
        } 
        // Si se presiona solo Tab (para añadir sangría)
        else {
            // Insertamos la sangría en la posición del cursor
            textarea.value = value.substring(0, start) + indentation + value.substring(end);
            // Movemos el cursor para que quede después de la sangría insertada
            textarea.selectionStart = textarea.selectionEnd = start + indentation.length;
        }
    }
}

function handleContentTypeChange(e) {
    state.contentType = e.target.value;
    state.parentFolder = null; // Reset selection
    
    elements.parentFolderNameInput.disabled = !state.contentType;
    elements.parentFolderResultsBlock.classList.add('hidden');
    elements.folderStructureBlock.classList.add('hidden');
    elements.createFoldersBtn.disabled = true;
    elements.parentFolderResultsTbody.innerHTML = '';
}

async function searchParentFolder() {
    ui.blockUI("Buscando carpeta raíz...");
    try {
        const apiConfig = await getAuthenticatedConfig();
        mcApiService.setLogger(logger);

        const folderName = elements.parentFolderNameInput.value.trim();
        
        const folders = await mcApiService.findDataFolders(folderName, state.contentType, apiConfig);

        elements.parentFolderResultsTbody.innerHTML = '';
        if (!folders || folders.length === 0) {
            elements.parentFolderResultsTbody.innerHTML = '<tr><td>No se encontraron carpetas.</td></tr>';
        } else {
            folders.forEach(folder => {
                const row = elements.parentFolderResultsTbody.insertRow();
                row.dataset.folderId = folder.id;
                row.dataset.folderName = folder.name;
                row.innerHTML = `<td>${folder.fullPath}</td>`;
            });
        }
        elements.parentFolderResultsBlock.classList.remove('hidden');
    } catch (error) {
        ui.showCustomAlert(`Error buscando carpetas: ${error.message}`);
    } finally {
        ui.unblockUI();
    }
}

function handleParentFolderSelect(event) {
    const clickedRow = event.target.closest('tr');
    if (!clickedRow?.dataset.folderId) return;

    const previouslySelected = elements.parentFolderResultsTbody.querySelector('tr.selected');
    if (previouslySelected) previouslySelected.classList.remove('selected');

    clickedRow.classList.add('selected');
    state.parentFolder = { id: clickedRow.dataset.folderId, name: clickedRow.dataset.folderName };

    elements.folderStructureBlock.classList.remove('hidden');
    elements.createFoldersBtn.disabled = false;
}

function parseStructure(text) {
    const lines = text.split('\n').filter(line => line.trim() !== '');
    const getIndentation = (line) => line.match(/^\s*/)[0].length;

    function buildTree(lines, level = 0) {
        const tree = [];
        while (lines.length > 0) {
            const currentIndent = getIndentation(lines[0]);
            if (currentIndent < level) break;

            const line = lines.shift();
            const node = { name: line.trim(), children: [] };

            if (lines.length > 0 && getIndentation(lines[0]) > currentIndent) {
                node.children = buildTree(lines, currentIndent + 1);
            }
            tree.push(node);
        }
        return tree;
    }
    return buildTree(lines);
}

async function executeFolderCreation() {
    const structureText = elements.folderStructureInput.value;
    if (structureText.trim() === '') {
        return ui.showCustomAlert("La estructura de carpetas está vacía.");
    }

    if (!await ui.showCustomConfirm("Se creará la estructura de carpetas definida. ¿Continuar?")) return;

    ui.blockUI("Creando carpetas...");
    logger.startLogBuffering();
    logger.logMessage(`Iniciando creación de carpetas en "${state.parentFolder.name}"...`);
    
    try {
        const apiConfig = await getAuthenticatedConfig();
        mcApiService.setLogger(logger);

        const folderTree = parseStructure(structureText);
        let successCount = 0;
        let failCount = 0;

        async function processNode(node, parentId, level = 0) {
            const prefix = '  '.repeat(level);
            try {
                logger.logMessage(`${prefix}Creando carpeta: "${node.name}"...`);
                const newFolderId = await mcApiService.createFolder(node.name, parentId, state.contentType, apiConfig);
                logger.logMessage(`${prefix}Éxito. Nueva carpeta creada con ID: ${newFolderId}`);
                successCount++;

                for (const childNode of node.children) {
                    await processNode(childNode, newFolderId, level + 1);
                }
            } catch (error) {
                logger.logMessage(`${prefix}ERROR al crear "${node.name}": ${error.message}`);
                failCount++;
            }
        }

        for (const rootNode of folderTree) {
            await processNode(rootNode, state.parentFolder.id);
        }

        ui.showCustomAlert(`Proceso finalizado.\nCarpetas creadas: ${successCount}\nFallos: ${failCount}`);

    } catch (error) {
        ui.showCustomAlert(`Error fatal durante el proceso: ${error.message}`);
    } finally {
        ui.unblockUI();
        logger.endLogBuffering();
    }
}