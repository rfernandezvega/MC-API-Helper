// Fichero: preload.js
// Descripción: Expone de forma segura métodos del proceso principal al proceso de renderizado.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // Inicia el flujo de login OAuth
  startLogin: (config) => ipcRenderer.send('start-login', config),

  // Pide la configuración de API (token, uris) al proceso principal
  getApiConfig: (clientName) => ipcRenderer.invoke('get-api-config', clientName),

  // Cierra la sesión y borra las credenciales seguras
  logout: (clientName) => ipcRenderer.send('logout', clientName),

  // --- Listeners desde el proceso principal hacia el renderizador ---
  onTokenReceived: (callback) => ipcRenderer.on('token-received', (_event, data) => callback(data)),
  onLogoutSuccess: (callback) => ipcRenderer.on('logout-success', () => callback()),
  onRequireLogin: (callback) => ipcRenderer.on('require-login', (_event, data) => callback(data))
});