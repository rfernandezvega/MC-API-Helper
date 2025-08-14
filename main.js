// Fichero: main.js
// Descripción: Este es el fichero principal de Electron que gestiona el ciclo de vida de la aplicación y crea la ventana del navegador.

// --- 1. MÓDULOS REQUERIDOS ---
const { app, BrowserWindow } = require('electron');
const path = require('path');

// --- 2. FUNCIÓN DE CREACIÓN DE LA VENTANA ---

/**
 * Crea y configura la ventana principal de la aplicación.
 */
function createWindow() {
  // Crea una nueva instancia de BrowserWindow con las dimensiones y opciones deseadas.
  const mainWindow = new BrowserWindow({
    width: 1300,        // Ancho de la ventana para asegurar que todo el contenido quepa cómodamente.
    height: 850,       // Alto de la ventana.
    icon: path.join(__dirname, 'icon.ico'), // Define el icono de la aplicación.
    webPreferences: {
      // --- Opciones de Seguridad y Buenas Prácticas ---
      
      // nodeIntegration: false (Recomendado)
      // Evita que el código del frontend (renderer process) tenga acceso directo a las APIs de Node.js.
      // Es una medida de seguridad crucial para prevenir vulnerabilidades.
      nodeIntegration: false,

      // contextIsolation: true (Recomendado)
      // Aísla el código de Electron y tus scripts de preload del código de tu página web (renderer).
      // Protege contra la modificación de objetos nativos y APIs de Electron desde el frontend.
      contextIsolation: true,

      // Si necesitaras comunicar el frontend con el backend (este fichero),
      // la forma segura de hacerlo es a través de un script de "preload" y contextBridge.
      // preload: path.join(__dirname, 'preload.js') 
    }
  });

  // Carga el fichero principal de la interfaz de usuario en la ventana.
  mainWindow.loadFile('index.html');

  // Opcional: Descomenta la siguiente línea para que las herramientas de desarrollador
  // (la consola, inspector de elementos, etc.) se abran automáticamente al iniciar la app.
  // Es muy útil para depuración.
  // mainWindow.webContents.openDevTools();
}

// --- 3. GESTIÓN DEL CICLO DE VIDA DE LA APLICACIÓN ---

// Este método se llama cuando Electron ha terminado la inicialización
// y está listo para crear ventanas de navegador.
// Algunas APIs solo se pueden usar después de que este evento ocurra.
app.whenReady().then(createWindow);

// Evento que se dispara cuando todas las ventanas de la aplicación han sido cerradas.
app.on('window-all-closed', () => {
  // En macOS, es común que las aplicaciones y su barra de menú permanezcan activas
  // incluso después de que todas las ventanas se hayan cerrado. En otros sistemas operativos,
  // la aplicación se cierra completamente.
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// Evento que se dispara cuando se hace clic en el icono de la aplicación en el dock (macOS)
// y no hay otras ventanas abiertas.
app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});