// Fichero: src/renderer/components/actividades-finder.js
import elements from '../ui/dom-elements.js';
import * as ui from '../ui/ui-helpers.js';

let getAuthenticatedConfig;

export function init(dependencies) {
    getAuthenticatedConfig = dependencies.getAuthenticatedConfig;
    elements.searchActivityBtn.addEventListener('click', searchActivityUsage);
}

async function searchActivityUsage() {
    const value = elements.activitySearchValue.value.trim();
    if (!value) return ui.showCustomAlert("Introduce un nombre o Key de actividad");

    // Por ahora solo pintamos la intención, como pediste
    elements.activityUsageTbody.innerHTML = `
        <tr>
            <td colspan="5" style="text-align:center; padding: 20px;">
                Buscando actividad: <b>${value}</b>... <br>
                <small>(Esta funcionalidad se conectará a la API en la siguiente fase)</small>
            </td>
        </tr>
    `;
    
    console.log("Búsqueda de actividad iniciada para:", value);
}