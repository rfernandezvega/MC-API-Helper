// Fichero: src/renderer/components/fields-table.js
// Descripción: Módulo que encapsula toda la lógica de la tabla de campos de una Data Extension.

import elements from '../ui/dom-elements.js';
import { downloadCsv, buildCsvFileName } from '../ui/csv-export.js';

let selectedRow = null;

// Cabecera del CSV que exporta la vista. Se reutiliza al importar para reconocerla y
// descartarla, de modo que un fichero exportado se pueda volver a cargar tal cual.
const FIELDS_CSV_HEADERS = ['Campo MC', 'Tipo Campo', 'Longitud', 'Default', 'PK', 'Requerido'];

/**
 * Devuelve el HTML de un botón conmutable (PK o Requerido) que sustituye al
 * checkbox: es más cómodo de pulsar. El estado se guarda en la clase .active.
 * @param {string} kind - 'pk' o 'req' (define la clase específica).
 * @param {boolean} active - Si arranca marcado.
 * @returns {string}
 */
function fieldToggleHtml(kind, active) {
    return `<button type="button" class="field-toggle ${kind}-toggle${active ? ' active' : ''}">${active ? 'Sí' : 'No'}</button>`;
}

/**
 * Cambia el estado de un botón conmutable de campo y actualiza su texto.
 * @param {HTMLButtonElement} btn
 * @param {boolean} [force] - Estado a forzar; si se omite, alterna.
 */
function toggleFieldButton(btn, force) {
    const active = force !== undefined ? force : !btn.classList.contains('active');
    btn.classList.toggle('active', active);
    btn.textContent = active ? 'Sí' : 'No';
}

/**
 * Añade una nueva fila vacía a la tabla de campos.
 */
function addRow(selectIt = true) {
    const newRow = elements.fieldsTableBody.insertRow();
    newRow.innerHTML = `
        <td contenteditable="true"></td>
        <td><select class="type-select">
            <option value="" selected disabled></option>
            <option value="Text">Text</option>
            <option value="Number">Number</option>
            <option value="Date">Date</option>
            <option value="Boolean">Boolean</option>
            <option value="EmailAddress">EmailAddress</option>
            <option value="Phone">Phone</option>
            <option value="Decimal">Decimal</option>
            <option value="Locale">Locale</option>
        </select></td>
        <td contenteditable="true"></td>
        <td contenteditable="true"></td>
        <td>${fieldToggleHtml('pk', false)}</td>
        <td>${fieldToggleHtml('req', false)}</td>
        <button class="delete-row-btn" title="Eliminar fila">×</button>
    `;
    
    // Añadir listener para la selección de tipo de campo en la nueva fila
    const typeSelect = newRow.querySelector('.type-select');
    typeSelect.addEventListener('change', (e) => handleTypeChange(e, newRow));
    
    // Seleccionar la nueva fila automáticamente
     if (selectIt) {
        if (selectedRow) selectedRow.classList.remove('selected');
        newRow.classList.add('selected');
        selectedRow = newRow;
    }
}

/**
 * Gestiona el cambio de tipo de dato en una fila para ajustar la longitud por defecto.
 * @param {Event} e - El evento de cambio.
 * @param {HTMLTableRowElement} row - La fila donde ocurrió el cambio.
 */
function handleTypeChange(e, row) {
    const lengthCell = row.cells[2];
    switch (e.target.value) {
        case 'EmailAddress': lengthCell.textContent = '254'; break;
        case 'Phone': lengthCell.textContent = '20'; break;
        case 'Locale': lengthCell.textContent = '5'; break;
        case 'Decimal': lengthCell.textContent = '18,2'; break;
        case 'Text': lengthCell.textContent = '50'; break;
        default: lengthCell.textContent = ''; break;
    }
}

/**
 * Limpia completamente la tabla de campos.
 */
export function clear(addnewRow = true) {
    elements.fieldsTableBody.innerHTML = '';
    selectedRow = null;
    handleSendableChange();
    if(addnewRow) addRow(false);
}

/**
 * Inicializa el módulo, configurando todos sus event listeners.
 */
export function init() {
    elements.addFieldBtn.addEventListener('click', addRow);
    elements.createDummyFieldsBtn.addEventListener('click', () => {
        clear(false);
        populate([
            { name: 'NombreCompleto', type: 'Text', length: '100', isPrimaryKey: true, isRequired: true },
            { name: 'SincronizarMC', type: 'Boolean', defaultValue: 'false' },
            { name: 'FechaNacimiento', type: 'Date', defaultValue: 'getdate()' },
            { name: 'Recibo', type: 'Decimal', length: '18,2' },
            { name: 'Telefono', type: 'Phone' },
            { name: 'Email', type: 'EmailAddress', length: '254' },
            { name: 'Locale', type: 'Locale' },
            { name: 'Numero', type: 'Number' }
        ]);
    });
    elements.clearFieldsBtn.addEventListener('click', clear);

    // Listeners para mover filas
    elements.moveUpBtn.addEventListener('click', () => moveRow(-1));
    elements.moveDownBtn.addEventListener('click', () => moveRow(1));

    // Listener para la selección de filas en la tabla
    elements.fieldsTableBody.addEventListener('click', (e) => {
        const targetRow = e.target.closest('tr');
        if (!targetRow) return;

        if (e.target.matches('.delete-row-btn')) {
            if (targetRow.nextElementSibling) {
                selectRow(targetRow.nextElementSibling);
            } else if (targetRow.previousElementSibling) {
                selectRow(targetRow.previousElementSibling);
            } else {
                selectedRow = null;
            }
            targetRow.remove();
        } else if (e.target.matches('.field-toggle')) {
            // Alterna el botón PK/Requerido. Al marcar PK, se marca Requerido
            // automáticamente (una PK siempre es obligatoria).
            toggleFieldButton(e.target);
            if (e.target.classList.contains('pk-toggle') && e.target.classList.contains('active')) {
                const reqBtn = targetRow.querySelector('.req-toggle');
                if (reqBtn) toggleFieldButton(reqBtn, true);
            }
            selectRow(targetRow);
        } else {
            selectRow(targetRow);
        }
    });

    // --- LISTENERS DEL MODAL DE IMPORTACIÓN (RESTAURADOS) ---
    elements.importFieldsBtn.addEventListener('click', () => { 
        elements.importModal.style.display = 'flex'; 
        elements.pasteDataArea.focus(); 
    });
    elements.cancelPasteBtn.addEventListener('click', closeImportModal);
    elements.importModal.addEventListener('click', (e) => { 
        if (e.target === elements.importModal) closeImportModal(); 
    });
    elements.delimiterSelect.addEventListener('change', () => { 
        elements.customDelimiterInput.classList.toggle('hidden', elements.delimiterSelect.value !== 'other'); 
        if (elements.delimiterSelect.value === 'other') elements.customDelimiterInput.focus(); 
    });
    elements.processPasteBtn.addEventListener('click', processPastedData);

    elements.downloadFieldsCsvBtn?.addEventListener('click', downloadFieldsCsv);
}

/**
 * Descarga en CSV la configuración de campos de la tabla, en el mismo orden en que
 * está definida. Solo salen las filas con nombre y tipo (las válidas para crear la DE).
 */
function downloadFieldsCsv() {
    const fields = getFieldsData();
    downloadCsv({
        headers: FIELDS_CSV_HEADERS,
        rows: fields.map(f => [
            f.name,
            f.type,
            f.length,
            f.defaultValue,
            f.isPrimaryKey ? 'Sí' : 'No',
            f.isRequired ? 'Sí' : 'No'
        ]),
        fileName: buildCsvFileName('configuracion_campos')
    });
}

/**
 * Selecciona una fila específica en la tabla.
 * @param {HTMLTableRowElement} rowToSelect - La fila a seleccionar.
 */
function selectRow(rowToSelect) {
    if (selectedRow) {
        selectedRow.classList.remove('selected');
    }
    rowToSelect.classList.add('selected');
    selectedRow = rowToSelect;
}

/**
 * Mueve la fila seleccionada hacia arriba o hacia abajo.
 * @param {number} direction - `-1` para arriba, `1` para abajo.
 */
function moveRow(direction) {
    if (!selectedRow) return;
    const sibling = direction === -1 ? selectedRow.previousElementSibling : selectedRow.nextElementSibling;
    if (sibling) {
        if (direction === -1) {
            sibling.before(selectedRow);
        } else {
            sibling.after(selectedRow);
        }
    }
}


/**
 * Elimina las filas que no tienen ningún dato introducido (las que se añaden en blanco
 * al abrir la vista). Evita que quede una fila vacía por delante de los campos cargados.
 */
function removeEmptyRows() {
    elements.fieldsTableBody.querySelectorAll('tr').forEach(row => {
        const isEmpty = !row.cells[0].textContent.trim()
            && !row.querySelector('.type-select')?.value
            && !row.cells[2].textContent.trim()
            && !row.cells[3].textContent.trim();
        if (isEmpty) {
            if (selectedRow === row) selectedRow = null;
            row.remove();
        }
    });
}

/**
 * Rellena la tabla con un array de datos de campos, descartando antes las filas en blanco.
 * @param {Array<object>} fieldsData - Array de objetos de campo.
 */
export function populate(fieldsData) {
    removeEmptyRows();

    fieldsData.forEach(field => {
        const newRow = elements.fieldsTableBody.insertRow();
        newRow.innerHTML = `
            <td contenteditable="true">${field.name || ''}</td>
            <td><select class="type-select">
                <option value="Text">Text</option>
                <option value="Number">Number</option>
                <option value="Date">Date</option>
                <option value="Boolean">Boolean</option>
                <option value="EmailAddress">EmailAddress</option>
                <option value="Phone">Phone</option>
                <option value="Decimal">Decimal</option>
                <option value="Locale">Locale</option>
            </select></td>
            <td contenteditable="true">${field.length || ''}</td>
            <td contenteditable="true">${field.defaultValue || ''}</td>
            <td>${fieldToggleHtml('pk', !!field.isPrimaryKey)}</td>
            <td>${fieldToggleHtml('req', !!field.isRequired)}</td>
            <button class="delete-row-btn" title="Eliminar fila">×</button>
        `;
        const typeSelect = newRow.querySelector('.type-select');
        typeSelect.value = field.type || 'Text';
        typeSelect.addEventListener('change', (e) => handleTypeChange(e, newRow));
    });
    handleSendableChange();
}

/**
 * Recoge los datos de la tabla y los devuelve como un array de objetos.
 * @returns {Array<object>}
 */
export function getFieldsData() {
    const data = [];
    elements.fieldsTableBody.querySelectorAll('tr').forEach(row => {
        const field = {
            name: row.cells[0].textContent.trim(),
            type: row.querySelector('.type-select').value,
            length: row.cells[2].textContent.trim(),
            defaultValue: row.cells[3].textContent.trim(),
            isPrimaryKey: row.querySelector('.pk-toggle').classList.contains('active'),
            isRequired: row.querySelector('.req-toggle').classList.contains('active'),
        };
        if (field.name && field.type) data.push(field);
    });
    return data;
}

/**
 * Gestiona el cambio en el checkbox "Is Sendable" para actualizar la UI.
 */
export function handleSendableChange() {
    const isChecked = elements.isSendableCheckbox.checked;
    elements.subscriberKeyFieldSelect.disabled = !isChecked;
    
    if (isChecked) {
        const fields = getFieldsData();
        const currentVal = elements.subscriberKeyFieldSelect.value;
        elements.subscriberKeyFieldSelect.innerHTML = '<option value="">-- Seleccione un campo --</option>';
        fields.forEach(f => {
            const option = new Option(f.name, f.name);
            option.dataset.type = f.type;
            elements.subscriberKeyFieldSelect.appendChild(option);
        });
        elements.subscriberKeyFieldSelect.value = currentVal;
    } else {
        elements.subscriberKeyFieldSelect.innerHTML = '<option value="">-- Defina campos --</option>';
        elements.subscriberKeyTypeInput.value = '';
    }
}

/**
 * Prepara la vista de la tabla de campos.
 * Si la tabla está vacía, añade una primera fila en blanco para empezar a trabajar.
 */
export function prepareView() {
    if (elements.fieldsTableBody.rows.length === 0) {
        addRow(false);
    }
}

// --- FUNCIONES DEL MODAL DE IMPORTACIÓN (RESTAURADAS) ---

/**
 * Cierra el modal de importación de campos.
 */
export function closeImportModal() {
    elements.importModal.style.display = 'none';
    elements.pasteDataArea.value = '';
}

/**
 * Trocea una línea pegada respetando las celdas entrecomilladas: el CSV que exporta la
 * vista entrecomilla todas las celdas y el separador puede aparecer dentro de una de
 * ellas, así que un split directo partiría columnas y dejaría las comillas en el texto.
 * @param {string} line - La línea a trocear.
 * @param {string} delimiter - Separador elegido en el modal.
 * @returns {Array<string>} Las celdas ya sin comillas de envoltura.
 */
function splitPastedLine(line, delimiter) {
    const cells = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
        const char = line[i];
        if (char === '"') {
            // Dos comillas seguidas dentro de una celda entrecomillada son una comilla literal.
            if (inQuotes && line[i + 1] === '"') {
                current += '"';
                i++;
            } else {
                inQuotes = !inQuotes;
            }
        } else if (!inQuotes && line.startsWith(delimiter, i)) {
            cells.push(current);
            current = '';
            i += delimiter.length - 1;
        } else {
            current += char;
        }
    }
    cells.push(current);

    return cells;
}

/**
 * Interpreta una celda de PK/Requerido. Se admiten las formas con las que la gente
 * suele marcar estas columnas, con o sin mayúsculas y con o sin tilde; cualquier otro
 * valor (o la celda vacía) cuenta como "no".
 * @param {string} [value] - Contenido de la celda.
 * @returns {boolean}
 */
function parseBooleanCell(value) {
    const normalized = (value || '').trim().toLowerCase();
    return ['si', 'sí', 'yes', 'y', 'true', 'verdadero', '1', 'x'].includes(normalized);
}

/**
 * Detecta la fila de cabecera del CSV exportado por la vista para no cargarla como campo.
 * @param {object} field - Campo ya troceado.
 * @returns {boolean}
 */
function isHeaderRow(field) {
    return field.name.toLowerCase() === FIELDS_CSV_HEADERS[0].toLowerCase()
        && field.type.toLowerCase() === FIELDS_CSV_HEADERS[1].toLowerCase();
}

/**
 * Procesa los datos pegados desde el portapapeles y los añade a la tabla.
 */
export function processPastedData() {
    // Se quita el BOM inicial: si se pega el contenido de un CSV exportado por la app
    // viaja pegado al primer nombre de campo.
    const pasted = elements.pasteDataArea.value;
    const data = (pasted.charCodeAt(0) === 0xFEFF ? pasted.slice(1) : pasted).trim();
    if (!data) return;

    let delimiter = '';
    switch(elements.delimiterSelect.value) {
        case 'tab': delimiter = '\t'; break;
        case 'comma': delimiter = ','; break;
        case 'semicolon': delimiter = ';'; break;
        case 'other': delimiter = elements.customDelimiterInput.value; break;
    }
    
    if (!delimiter) {
        alert('Por favor, selecciona o introduce un separador.');
        return;
    }

    const newFields = data.split('\n').map(line => {
        const cells = splitPastedLine(line, delimiter).map(cell => cell.trim());
        // El CSV que exporta la vista trae Default en la cuarta columna (6 en total);
        // en pegados más cortos se entiende que la cuarta y la quinta son PK y Requerido.
        const hasDefaultColumn = cells.length >= 6;
        const isPrimaryKey = parseBooleanCell(cells[hasDefaultColumn ? 4 : 3]);
        return {
            name: cells[0] || '',
            type: cells[1] || 'Text',
            length: cells[2] || '',
            defaultValue: hasDefaultColumn ? cells[3] : '',
            isPrimaryKey,
            // Una PK es siempre obligatoria, igual que al marcarla a mano en la tabla.
            isRequired: isPrimaryKey || parseBooleanCell(cells[hasDefaultColumn ? 5 : 4])
        };
    }).filter(f => f.name && !isHeaderRow(f));

    // populate conserva los campos ya definidos y descarta las filas en blanco,
    // así lo importado se añade sin dejar huecos por delante.
    populate(newFields);
    closeImportModal();
}