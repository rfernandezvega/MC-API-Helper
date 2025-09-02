// Fichero: preload.js
// Descripción: Actúa como un puente seguro entre el proceso de renderizado (la página web, ui.js)
// y el proceso principal de Electron (Node.js, main.js). Expone selectivamente funcionalidades
// del proceso principal al `window` del renderizador de una manera segura, utilizando
// el aislamiento de contexto para proteger la aplicación de vulnerabilidades web.

const { contextBridge, ipcRenderer } = require('electron');

// Se expone un objeto global llamado 'electronAPI' en el objeto 'window' de la página web.
// Todas las comunicaciones con el backend (main.js) deben pasar obligatoriamente por este objeto.
contextBridge.exposeInMainWorld('electronAPI', {

  // ==========================================================
  // --- MÉTODOS: RENDERIZADOR -> PRINCIPAL (INVOCACIONES) ---
  // ==========================================================
  // Estos métodos son llamados desde ui.js para enviar peticiones, datos o
  // iniciar acciones en el proceso principal.

  /**
   * Inicia el flujo de autenticación OAuth2.
   * Envía la configuración de la API (cliente, URI, etc.) al proceso principal,
   * que se encargará de abrir la ventana de login de Marketing Cloud.
   * @param {object} config - Objeto con los detalles de configuración del cliente.
   */
  startLogin: (config) => ipcRenderer.send('start-login', config),

  /**
   * Solicita la configuración de API activa y validada (incluyendo el access token).
   * El proceso principal gestiona de forma segura la validez y el refresco del token.
   * Es una llamada asíncrona (invoke) que devuelve una promesa.
   * @param {string} clientName - El nombre del cliente para el cual se solicita la configuración.
   * @returns {Promise<object|null>} Una promesa que resuelve con el objeto de configuración o null si falla.
   */
  getApiConfig: (clientName) => ipcRenderer.invoke('get-api-config', clientName),

  /**
   * Cierra la sesión del cliente especificado.
   * Pide al proceso principal que elimine las credenciales seguras (refresh token, etc.)
   * del llavero del sistema operativo.
   * @param {string} clientName - El nombre del cliente para el que se cerrará la sesión.
   */
  logout: (clientName) => ipcRenderer.send('logout', clientName),

  /**
   * Pide al proceso principal que abra una URL en el navegador externo predeterminado del sistema.
   * Se utiliza para abrir enlaces de forma segura, evitando que la aplicación navegue internamente.
   * @param {string} url - La URL que se debe abrir.
   */
  openExternalLink: (url) => ipcRenderer.send('open-external-link', url),


  // ==========================================================
  // --- MÉTODOS: PRINCIPAL -> RENDERIZADOR (LISTENERS) ---
  // ==========================================================
  // Estos métodos permiten a ui.js registrar funciones (callbacks) que se ejecutarán
  // cuando el proceso principal envíe un evento específico a la ventana.

  /**
   * Registra una función callback que se ejecutará cuando el proceso de login finalice.
   * @param {function(object)} callback - La función a ejecutar. Recibirá un objeto
   * con el resultado del login (ej: { success: true, data: {...} } o { success: false, error: '...' }).
   */
  onTokenReceived: (callback) => ipcRenderer.on('token-received', (_event, data) => callback(data)),

  /**
   * Registra una función callback que se ejecutará cuando el proceso de logout
   * se haya completado con éxito en el proceso principal.
   * @param {function} callback - La función a ejecutar sin argumentos.
   */
  onLogoutSuccess: (callback) => ipcRenderer.on('logout-success', () => callback()),

  /**
   * Registra una función callback que se ejecutará cuando el proceso principal
   * determine que la sesión ha expirado (ej. al fallar el refresco del token)
   * y se requiere un nuevo login.
   * @param {function(object)} callback - La función a ejecutar. Recibirá un objeto
   * con el mensaje de error (ej: { message: 'Fallo al refrescar el token.' }).
   */
  onRequireLogin: (callback) => ipcRenderer.on('require-login', (_event, data) => callback(data)),

   /**
   * Envía las credenciales al proceso principal para ser validadas contra Google Sheets.
   * @param {object} credentials - Un objeto con { email, key }.
   * @returns {Promise<boolean|object>} - Devuelve `true` si es válido, `false` si no, o un objeto de error.
   */
  validateLicense: (credentials) => ipcRenderer.invoke('validate-license', credentials),
});