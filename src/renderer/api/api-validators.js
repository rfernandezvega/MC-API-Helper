// ===================================================================
// Fichero: api-validators.js
// ===================================================================
import { executeRestRequest } from './api-core.js';

/**
 * Utiliza las herramientas nativas de MC para validar estructural y funcionalmente un email.
 * @param {string} email - La dirección de correo electrónico a evaluar.
 * @param {object} apiConfig - Configuración autenticada de la API.
 * @returns {Promise<object>} Resultados detallados de ListDetective, MXValidator y SyntaxValidator.
 */
export async function validateEmail(email, apiConfig) {
  const url = `${apiConfig.restUri}address/v1/validateEmail`;
  const payload = {
    "email": email,
    "validators": ["SyntaxValidator", "MXValidator", "ListDetectiveValidator"]
  };
  const options = {
    method: 'POST',
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiConfig.accessToken}`
    },
    body: JSON.stringify(payload)
  };
  
  return executeRestRequest(url, options);
}