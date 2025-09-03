// Fichero: src/renderer/components/fields-table.js
// Descripción: Módulo que encapsula toda la lógica de la tabla de campos de Data Extension.

import elements from '../ui/dom-elements.js';

// Declaramos el observer aquí, pero NO lo inicializamos.
let observer;
const observerConfig = { childList: true, subtree: true, characterData: true };

/**
 * Inicializa el componente. Ahora también crea el observer.
 */
export function init() {
    // CREAMOS el observer aquí, cuando sabemos que 'elements' está listo.
    observer = new MutationObserver(updateSubscriberKeyFieldOptions);
    observer.observe(elements.fieldsTableBody, observerConfig);

    let selectedRow = null; // El estado de la fila seleccionada ahora vive aquí.


    // --- Listeners de la Tabla de Campos ---
    elements.createDummyFieldsBtn.addEventListener('click', createDummies);
    elements.clearFieldsBtn.addEventListener('click', clear);
    elements.addFieldBtn.addEventListener('click', () => add(true));
    elements.fieldsTableBody.addEventListener('click', (e) => {
        const targetRow = e.target.closest('tr');
        if (!targetRow) return;
        if (e.target.matches('.delete-row-btn')) {
            observer.disconnect();
            if (targetRow === selectedRow) selectedRow = null;
            targetRow.remove();
            updateSubscriberKeyFieldOptions();
            observer.observe(elements.fieldsTableBody, observerConfig);
        } else {
            if (targetRow !== selectedRow) {
                if (selectedRow) selectedRow.classList.remove('selected');
                targetRow.classList.add('selected');
                selectedRow = targetRow;
            }
        }
    });
    elements.moveUpBtn.addEventListener('click', () => { if (selectedRow?.previousElementSibling) selectedRow.parentNode.insertBefore(selectedRow, selectedRow.previousElementSibling); });
    elements.moveDownBtn.addEventListener('click', () => { if (selectedRow?.nextElementSibling) selectedRow.parentNode.insertBefore(selectedRow.nextElementSibling, selectedRow); });
		
}

/**
 * Crea una nueva fila <tr> para la tabla de campos.
 * Es una función interna, no necesita ser exportada.
 * @param {object} [data={}] - Datos para pre-rellenar la fila.
 * @returns {HTMLTableRowElement} El elemento de la fila creado.
 */
function createTableRow(data = {}) {
    const row = document.createElement('tr');
    const fieldData = {
        name: data.name || '',
        type: data.type || '',
        length: data.length || '',
        defaultValue: data.defaultValue || '',
        isPrimaryKey: data.isPrimaryKey || false,
        isRequired: data.isRequired || false
    };
    row.innerHTML = `<td contenteditable="true">${fieldData.name}</td><td contenteditable="true">${fieldData.type}</td><td contenteditable="true">${fieldData.length}</td><td contenteditable="true">${fieldData.defaultValue}</td><td><input type="checkbox" ${fieldData.isPrimaryKey ? 'checked' : ''}></td><td><input type="checkbox" ${fieldData.isRequired ? 'checked' : ''}></td>`;
    const deleteButton = document.createElement('button');
    deleteButton.className = 'delete-row-btn';
    deleteButton.title = 'Eliminar fila';
    deleteButton.textContent = '×';
    row.appendChild(deleteButton);
    return row;
}

/**
 * Rellena la tabla de campos con un array de objetos de campo.
 * @param {Array} [fields=[]] - El array de campos.
 */
export function populate(fields = []) {
    // 3. Añadimos una comprobación de seguridad por si se llama antes de init().
    if (observer) observer.disconnect();
    
    elements.fieldsTableBody.innerHTML = '';
    if (fields.length > 0) {
        fields.forEach(fieldData => elements.fieldsTableBody.appendChild(createTableRow(fieldData)));
    } else {
        add(); // Añade una fila vacía si no hay datos
    }
    updateSubscriberKeyFieldOptions();
    
    if (observer) observer.observe(elements.fieldsTableBody, observerConfig);
}

/** Limpia completamente la tabla de campos. */
export function clear() {
    populate([]); // Poblar con un array vacío limpia y añade una fila
    populateDeletionPicklist([]); // También limpia el picklist de borrado
}

/** Añade una nueva fila vacía a la tabla de campos. */
export function add() {
    elements.fieldsTableBody.appendChild(createTableRow());
}

/** Rellena la tabla con un conjunto de campos de ejemplo. */
export function createDummies() {
    const dummyData = [
        { name: 'NombreCompleto', type: 'Text', length: '100', isPrimaryKey: true, isRequired: true },
        { name: 'Email', type: 'EmailAddress', length: '254', isPrimaryKey: false, isRequired: true },
        { name: 'SincronizarMC', type: 'Boolean', defaultValue: 'true' },
        { name: 'FechaNacimiento', type: 'Date' },
        { name: 'Recibo', type: 'Decimal', length: '18,2' },
        { name: 'Telefono', type: 'Phone' },
        { name: 'Locale', type: 'Locale' },
        { name: 'Numero', type: 'Number' }
    ];
    populate(dummyData);
    populateDeletionPicklist([]);
}

/**
 * Extrae los datos de todas las filas de la tabla de campos.
 * @returns {Array} Un array de objetos, cada uno representando un campo.
 */
export function getFieldsData() {
    return Array.from(elements.fieldsTableBody.querySelectorAll('tr')).map(row => {
        const cells = row.querySelectorAll('td');
        const name = cells[0].textContent.trim();
        const type = cells[1].textContent.trim();
        return (name && type) ? { 
            name, 
            type, 
            length: cells[2].textContent.trim(), 
            defaultValue: cells[3].textContent.trim(), 
            isPrimaryKey: cells[4].querySelector('input').checked, 
            isRequired: cells[5].querySelector('input').checked 
        } : null;
    }).filter(Boolean);
}

/** Actualiza las opciones del desplegable de Subscriber Key basándose en los campos de la tabla. */
export function updateSubscriberKeyFieldOptions() {
    const currentSelection = elements.subscriberKeyFieldSelect.value;
    elements.subscriberKeyFieldSelect.innerHTML = '<option value="">-- Seleccione un campo --</option>';
    getFieldsData().forEach(field => {
        if (field.name) {
            const option = new Option(field.name, field.name);
            option.dataset.type = field.type;
            elements.subscriberKeyFieldSelect.appendChild(option);
        }
    });
    const optionExists = Array.from(elements.subscriberKeyFieldSelect.options).some(opt => opt.value === currentSelection);
    elements.subscriberKeyFieldSelect.value = optionExists ? currentSelection : '';
}

/** Habilita o deshabilita los campos de "Sendable" según el estado del checkbox. */
export function handleSendableChange() {
    const isChecked = elements.isSendableCheckbox.checked;
    elements.subscriberKeyFieldSelect.disabled = !isChecked;
    if (!isChecked) {
        elements.subscriberKeyFieldSelect.value = '';
        elements.subscriberKeyTypeInput.value = '';
    }
}

/**
 * Rellena el desplegable de campos a eliminar.
 * @param {Array} fields - Array de campos recuperados de la API.
 */
export function populateDeletionPicklist(fields) {
    elements.targetFieldSelect.innerHTML = '';
    const validFields = fields.filter(f => f.name && f.objectId);
    if (validFields.length > 0) {
        elements.targetFieldSelect.innerHTML = '<option value="">-- Seleccione un campo --</option>';
        validFields.forEach(field => {
            elements.targetFieldSelect.appendChild(new Option(field.name, field.objectId));
        });
        elements.targetFieldSelect.disabled = false;
    } else {
        elements.targetFieldSelect.innerHTML = '<option value="">No hay campos recuperados</option>';
        elements.targetFieldSelect.disabled = true;
    }
}

/** Procesa los datos pegados desde el modal y los añade a la tabla. */
export function processPastedData() {
    const text = elements.pasteDataArea.value.trim();
    if (!text) return;

    let delimiter;
    const selectedDelimiter = elements.delimiterSelect.value;
    if (selectedDelimiter === 'other') delimiter = elements.customDelimiterInput.value;
    else if (selectedDelimiter === 'comma') delimiter = ',';
    else if (selectedDelimiter === 'semicolon') delimiter = ';';
    else delimiter = '\t';

    if (!delimiter) {
        // Como no tenemos acceso directo a showCustomAlert, hacemos un alert simple
        // o podrías pasar la función como parámetro si quisieras.
        alert('Por favor, introduce un separador.');
        return;
    }

    const newFields = text.split('\n').map(line => {
        if (!line.trim()) return null;
        const [name, type, length] = line.split(delimiter).map(c => c.trim());
        return (name && type) ? { name, type, length: length || '' } : null;
    }).filter(Boolean);

    if (newFields.length > 0) {
        observer.disconnect();
        // Añadimos las nuevas filas sin borrar las existentes
        newFields.forEach(fieldData => elements.fieldsTableBody.appendChild(createTableRow(fieldData)));
        updateSubscriberKeyFieldOptions();
        observer.observe(elements.fieldsTableBody, observerConfig);
    }
    
    // Cierra el modal
    elements.importModal.style.display = 'none';
    elements.pasteDataArea.value = '';
    elements.delimiterSelect.value = 'tab';
    elements.customDelimiterInput.classList.add('hidden');
}

/** Cierra y resetea el modal de importación de campos. */
export function closeImportModal() {
    elements.importModal.style.display = 'none';
    elements.pasteDataArea.value = '';
    elements.delimiterSelect.value = 'tab';
    elements.customDelimiterInput.classList.add('hidden');
}