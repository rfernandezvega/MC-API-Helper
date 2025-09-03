// Fichero: src/renderer/components/fields-table.js
// Descripción: Módulo que encapsula toda la lógica de la tabla de campos de una Data Extension.

import elements from '../ui/dom-elements.js';

let selectedRow = null;

/**
 * Añade una nueva fila vacía a la tabla de campos.
 */
function addRow(selectIt = true) {
    const newRow = elements.fieldsTableBody.insertRow();
    newRow.innerHTML = `
        <td contenteditable="true"></td>
        <td><select class="type-select">
            <option value="Text"></option>
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
        <td><input type="checkbox" class="pk-checkbox"></td>
        <td><input type="checkbox" class="req-checkbox"></td>
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
            { mc: 'NombreCompleto', type: 'Text', len: '100', pk: true, req: true },
            { mc: 'SincronizarMC', type: 'Boolean', defaultValue: 'false' },
            { mc: 'FechaNacimiento', type: 'Date', defaultValue: 'getdate()' },
            { mc: 'Recibo', type: 'Decimal', len: '18,2' },
            { mc: 'Telefono', type: 'Phone' },
            { mc: 'Email', type: 'EmailAddress', len: '254' },
            { mc: 'Locale', type: 'Locale' },
            { mc: 'Numero', type: 'Number' }
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
 * Rellena la tabla con un array de datos de campos.
 * @param {Array<object>} fieldsData - Array de objetos de campo.
 */
export function populate(fieldsData) {
    clear(true);
    fieldsData.forEach(field => {
        const newRow = elements.fieldsTableBody.insertRow();
        newRow.innerHTML = `
            <td contenteditable="true">${field.mc || ''}</td>
            <td><select class="type-select">
                <option value="Text">Text</option><option value="Number">Number</option>
                <option value="Date">Date</option><option value="Boolean">Boolean</option>
                <option value="EmailAddress">EmailAddress</option><option value="Phone">Phone</option>
                <option value="Decimal">Decimal</option><option value="Locale">Locale</option>
            </select></td>
            <td contenteditable="true">${field.len || ''}</td>
            <td contenteditable="true">${field.defaultValue || ''}</td>
            <td><input type="checkbox" class="pk-checkbox" ${field.pk ? 'checked' : ''}></td>
            <td><input type="checkbox" class="req-checkbox" ${field.req ? 'checked' : ''}></td>
            <button class="delete-row-btn" title="Eliminar fila">×</button>
        `;
        const typeSelect = newRow.querySelector('.type-select');
        typeSelect.value = field.type || 'Text';
        typeSelect.addEventListener('change', (e) => handleTypeChange(e, newRow));
    });
    handleSendableChange();
}

/**
 * Rellena el desplegable de campos a eliminar.
 * @param {Array<object>} fields - Array de campos con 'id' y 'mc'.
 */
export function populateDeletionPicklist(fields) {
    elements.targetFieldSelect.innerHTML = '<option value="">-- Seleccione un campo --</option>';
    if (fields.length > 0) {
        fields.forEach(f => elements.targetFieldSelect.appendChild(new Option(f.mc, f.id)));
        elements.targetFieldSelect.disabled = false;
    } else {
        elements.targetFieldSelect.disabled = true;
    }
}

/**
 * Recoge los datos de la tabla y los devuelve como un array de objetos.
 * @returns {Array<object>}
 */
export function getFieldsData() {
    const data = [];
    elements.fieldsTableBody.querySelectorAll('tr').forEach(row => {
        const field = {
            mc: row.cells[0].textContent.trim(),
            type: row.querySelector('.type-select').value,
            len: row.cells[2].textContent.trim(),
            defaultValue: row.cells[3].textContent.trim(),
            pk: row.querySelector('.pk-checkbox').checked,
            req: row.querySelector('.req-checkbox').checked,
        };
        if (field.mc && field.type) data.push(field);
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
            const option = new Option(f.mc, f.mc);
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
 * Procesa los datos pegados desde el portapapeles y los añade a la tabla.
 */
export function processPastedData() {
    const data = elements.pasteDataArea.value.trim();
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

    const lines = data.split('\n');
    const newFields = lines.map(line => {
        const parts = line.split(delimiter);
        return {
            mc: parts[0]?.trim() || '',
            type: parts[1]?.trim() || 'Text',
            len: parts[2]?.trim() || ''
        };
    }).filter(f => f.mc);

    populate(getFieldsData().concat(newFields));
    closeImportModal();
}