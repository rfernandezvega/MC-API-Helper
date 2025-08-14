// RUTA: src/main/preload.js

const { contextBridge, ipcRenderer } = require('electron');
const fs = require('fs');
const path = require('path');

contextBridge.exposeInMainWorld('electronAPI', {
  // Función para cargar vistas (ya funciona)
  loadFileContent: (viewName) => {
    try {
      const filePath = path.join(__dirname, `../renderer/views/${viewName}.html`);
      return fs.readFileSync(filePath, 'utf-8');
    } catch (error) {
      console.error(`[Preload Script] Error al leer vista: ${viewName}.html`, error);
      throw error;
    }
  },

  // Función para delegar las llamadas a la API al proceso principal.
  // La UI llamará a `window.electronAPI.makeApiCall(...)`
  makeApiCall: (params) => {
    // `ipcRenderer.invoke` envía un mensaje al canal 'make-api-call' y espera una respuesta.
    return ipcRenderer.invoke('make-api-call', params);
  }
});