// Fichero: src/renderer/components/whatsapp-finder.js
// Descripción: Audiencia WhatsApp integrada en la pestaña Clientes. La búsqueda se dispara desde el
// mismo buscador de clientes cuando el toggle "Incluir WhatsApp" está activo. Permite ver los canales
// del contacto y, si no existe, darlo de alta eligiendo un canal de los configurados para la BU activa
// (en "Configuración de Cuentas"). El channelId no está hardcodeado.

import * as mcApiService from '../api/mc-api-service.js';
import elements from '../ui/dom-elements.js';
import * as ui from '../ui/ui-helpers.js';
import * as logger from '../ui/logger.js';

let getAuthenticatedConfig;
let waEnabled = false;

// Países (ISO-2) para el buscador de locale. Ampliable.
const COUNTRIES = [
    ['ES', 'España'], ['PT', 'Portugal'], ['FR', 'Francia'], ['IT', 'Italia'], ['DE', 'Alemania'],
    ['GB', 'Reino Unido'], ['IE', 'Irlanda'], ['NL', 'Países Bajos'], ['BE', 'Bélgica'], ['CH', 'Suiza'],
    ['AT', 'Austria'], ['SE', 'Suecia'], ['NO', 'Noruega'], ['DK', 'Dinamarca'], ['FI', 'Finlandia'],
    ['PL', 'Polonia'], ['CZ', 'Chequia'], ['GR', 'Grecia'], ['RO', 'Rumanía'], ['HU', 'Hungría'],
    ['US', 'Estados Unidos'], ['CA', 'Canadá'], ['MX', 'México'], ['BR', 'Brasil'], ['AR', 'Argentina'],
    ['CL', 'Chile'], ['CO', 'Colombia'], ['PE', 'Perú'], ['UY', 'Uruguay'], ['PY', 'Paraguay'],
    ['BO', 'Bolivia'], ['EC', 'Ecuador'], ['VE', 'Venezuela'], ['CR', 'Costa Rica'], ['PA', 'Panamá'],
    ['GT', 'Guatemala'], ['HN', 'Honduras'], ['SV', 'El Salvador'], ['NI', 'Nicaragua'], ['DO', 'Rep. Dominicana'],
    ['PR', 'Puerto Rico'], ['CU', 'Cuba'], ['MA', 'Marruecos'], ['DZ', 'Argelia'], ['TN', 'Túnez'],
    ['EG', 'Egipto'], ['ZA', 'Sudáfrica'], ['NG', 'Nigeria'], ['KE', 'Kenia'], ['AE', 'Emiratos Árabes'],
    ['SA', 'Arabia Saudí'], ['QA', 'Catar'], ['IL', 'Israel'], ['TR', 'Turquía'], ['RU', 'Rusia'],
    ['UA', 'Ucrania'], ['IN', 'India'], ['CN', 'China'], ['JP', 'Japón'], ['KR', 'Corea del Sur'],
    ['ID', 'Indonesia'], ['TH', 'Tailandia'], ['VN', 'Vietnam'], ['PH', 'Filipinas'], ['MY', 'Malasia'],
    ['SG', 'Singapur'], ['AU', 'Australia'], ['NZ', 'Nueva Zelanda']
];

// --- Contexto activo (cliente + BU) ---
function activeClientName() { return elements.configClientNameInput?.value?.trim() || ''; }
function activeMid() { return elements.activeMidInput?.value?.trim() || ''; }

/** Canales configurados para el cliente+BU activos (se gestionan en "Configuración de Cuentas"). */
async function loadActiveChannels() {
    const client = activeClientName();
    const mid = activeMid();
    if (!client) return [];
    const configs = await window.electronAPI.loadGlobalConfigs();
    return configs?.[client]?.waChannels?.[mid] || [];
}

function populateChannelSelect(channels) {
    const sel = elements.waNewChannel;
    if (!sel) return;
    sel.innerHTML = '';
    if (!channels.length) {
        sel.appendChild(new Option('— Sin canales configurados —', ''));
        return;
    }
    for (const c of channels) sel.appendChild(new Option(`${c.name} (${c.id})`, c.id));
}

function populateLocaleList() {
    if (!elements.waNewLocaleList) return;
    elements.waNewLocaleList.innerHTML = COUNTRIES
        .map(([code, name]) => `<option value="${code} - ${name}"></option>`)
        .join('');
}

/** Extrae el código ISO-2 de lo escrito en el locale ("ES - España" o "ES" -> "ES"). */
function parseLocale(raw) {
    const v = String(raw || '').trim();
    if (!v) return '';
    return v.split(/\s*-\s*/)[0].trim().toUpperCase();
}

// --- API pública para el orquestador (customer-finder) ---

export function isEnabled() { return waEnabled; }

export function resetWhatsapp() {
    elements.waResultsBlock?.classList.add('hidden');
    elements.waRegisterBlock?.classList.add('hidden');
}

/**
 * Ejecuta la búsqueda en la audiencia WhatsApp para un término y pinta resultados o el alta.
 * Reutiliza el apiConfig del buscador de clientes (no vuelve a autenticar).
 */
export async function searchWhatsapp(term, apiConfig) {
    resetWhatsapp();
    if (!term) return;
    try {
        mcApiService.setLogger(logger);
        const contacts = await mcApiService.searchWhatsappContacts(term, apiConfig);
        if (contacts.length > 0) {
            // Nombre de canal guardado a nivel de cliente (BU activa) para pintarlo en vez del id.
            const channels = await loadActiveChannels();
            const nameById = {};
            channels.forEach(c => { nameById[c.id] = c.name; });
            renderResults(contacts, nameById);
            elements.waResultsBlock.classList.remove('hidden');
        } else {
            await showRegister(term);
        }
    } catch (error) {
        logger.logMessage(`Error en búsqueda WhatsApp: ${error.message}`);
        ui.showCustomAlert(`Error en la búsqueda de WhatsApp: ${error.message}`);
    }
}

function renderResults(contacts, nameById = {}) {
    elements.waResultsTbody.innerHTML = contacts.map(c => {
        const chans = c.channels.length
            ? c.channels.map(ch => {
                const name = nameById[ch];
                const label = name ? `${ch} · ${name}` : ch;
                return `<span class="chan-tag">${label}</span>`;
            }).join(' ')
            : '<small>Sin canales</small>';
        // El Contact Key es clicable: relanza la búsqueda de cliente con ese identificador.
        const key = c.key || '';
        const keyCell = key
            ? `<a href="#" class="wa-search-key" data-key="${key}" title="Buscar cliente con este Contact Key">${key}</a>`
            : '---';
        return `<tr>
            <td style="font-weight:bold;">${keyCell}</td>
            <td>${c.mobile || 'N/A'}</td>
            <td>${c.locale || 'N/A'}</td>
            <td>${chans}</td>
        </tr>`;
    }).join('');
}

async function showRegister(term) {
    const channels = await loadActiveChannels();
    populateChannelSelect(channels);

    // Si el término es un teléfono, lo ponemos SOLO en el móvil (no en el Contact Key).
    const isPhone = term.trim() !== '' && !isNaN(term);
    elements.waNewMobile.value = isPhone ? term : '';
    elements.waNewSubKey.value = isPhone ? '' : term;
    elements.waNewLocale.value = '';

    elements.waRegisterBlock.classList.remove('hidden');
    if (!channels.length) {
        ui.showCustomAlert('No hay canales de WhatsApp configurados para esta BU. Añádelos en "Configuración de Cuentas" antes de dar de alta.');
    }
}

async function register() {
    const contactKey = elements.waNewSubKey.value.trim();
    const mobile = elements.waNewMobile.value.trim();
    const locale = parseLocale(elements.waNewLocale.value);
    const channelId = elements.waNewChannel.value;

    if (!contactKey || !mobile) { ui.showCustomAlert('Contact Key y Teléfono son obligatorios.'); return; }
    if (!channelId) { ui.showCustomAlert('No hay canal seleccionado. Configura los canales de WhatsApp de esta BU en "Configuración de Cuentas".'); return; }

    if (!await ui.showCustomConfirm(`¿Dar de alta el contacto "${contactKey}" en el canal ${channelId}?`)) return;

    ui.blockUI('Dando de alta el contacto...');
    logger.startLogBuffering();
    try {
        const apiConfig = await getAuthenticatedConfig();
        mcApiService.setLogger(logger);
        await mcApiService.createWhatsappContact({ contactKey, mobile, locale, channelId }, apiConfig);
        ui.showCustomAlert('¡Contacto dado de alta correctamente!');
        elements.waRegisterBlock.classList.add('hidden');
        // Re-buscar para mostrarlo ya registrado.
        elements.customerSearchValue.value = contactKey;
        await searchWhatsapp(contactKey, apiConfig);
        elements.waResultsBlock.classList.remove('hidden');
    } catch (error) {
        logger.logMessage(`Error en alta WhatsApp: ${error.message}`);
        ui.showCustomAlert(`Error al dar de alta: ${error.message}`);
    } finally {
        ui.unblockUI();
        logger.endLogBuffering();
    }
}

function updateToggleUI() {
    const btn = elements.waToggleBtn;
    if (!btn) return;
    btn.textContent = 'Incluir WhatsApp';
    btn.style.color = '#fff';
    btn.style.background = waEnabled ? '#27ae60' : '#95a5a6'; // verde activo / gris inactivo
}

export function init(dependencies) {
    getAuthenticatedConfig = dependencies.getAuthenticatedConfig;

    populateLocaleList();
    updateToggleUI();

    elements.waToggleBtn?.addEventListener('click', () => {
        waEnabled = !waEnabled;
        updateToggleUI();
        if (!waEnabled) resetWhatsapp();
    });

    elements.waRegisterBtn?.addEventListener('click', register);

    // Clic en un Contact Key de los resultados WhatsApp → relanzar la búsqueda de cliente con él.
    elements.waResultsTbody?.addEventListener('click', (e) => {
        const link = e.target.closest('.wa-search-key');
        if (!link) return;
        e.preventDefault();
        elements.customerSearchValue.value = link.dataset.key || '';
        elements.searchCustomerBtn.click();
    });
}
