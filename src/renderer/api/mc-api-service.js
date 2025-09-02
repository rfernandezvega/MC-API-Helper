/**
 * Recupera la lista completa de todas las definiciones de automatismos.
 * @param {object} apiConfig - El objeto de configuración de API autenticado (con accessToken, restUri, etc.).
 * @returns {Promise<Array>} Una promesa que resuelve con la lista de automatismos.
 * @throws {Error} Si la llamada a la API falla o la configuración no es válida.
 */
export async function fetchAllAutomations(apiConfig) {
  // 1. Verificación de seguridad: nos aseguramos de recibir lo que necesitamos.
  if (!apiConfig || !apiConfig.restUri || !apiConfig.accessToken) {
    throw new Error("Configuración de API no válida proporcionada a fetchAllAutomations.");
  }

  const url = `${apiConfig.restUri}/legacy/v1/beta/bulk/automations/automation/definition/`;
  const response = await fetch(url, {
    headers: { "Authorization": `Bearer ${apiConfig.accessToken}` }
  });

  // 2. Manejo de errores centralizado: si la respuesta no es OK, lanzamos un error.
  if (!response.ok) {
    const errorText = await response.text();
    // Este error será "atrapado" por el bloque try/catch en app.js
    throw new Error(`Error ${response.status} al recuperar automatismos: ${errorText}`);
  }

  const data = await response.json();
  
  // 3. Devolvemos solo los datos puros.
  return data.entry || [];
}