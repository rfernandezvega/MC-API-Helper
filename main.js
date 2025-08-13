// Fichero: main.js
const { app, BrowserWindow } = require('electron');
const path = require('path');

function createWindow() {
  // Crea la ventana principal de la aplicación.
  const mainWindow = new BrowserWindow({
    width: 1300,  // Un poco más ancho para que quepa todo bien
    height: 850,
    webPreferences: {
      // Importante: estas opciones son por seguridad y buenas prácticas
      nodeIntegration: false, // No expone Node.js al frontend
      contextIsolation: true, // Aísla el código de Electron del código de tu web
    }
  });

  // Carga tu fichero index.html en la ventana.
  mainWindow.loadFile('index.html');

  // Opcional: Descomenta la siguiente línea para que se abran las
  // herramientas de desarrollador (la consola) al iniciar la app.
  // mainWindow.webContents.openDevTools();
}

// Llama a createWindow() cuando la aplicación está lista.
app.whenReady().then(createWindow);

// Cierra la app si todas las ventanas se cierran (excepto en Mac).
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});