// RUTA: src/main/main.js

const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const https = require('https');

// Este es el punto de entrada principal cuando la app está lista.
app.whenReady().then(() => {
  
  // Este es el handler que recibe las peticiones desde la UI.
  ipcMain.handle('make-api-call', async (event, { url, options }) => {
    
    console.log(`[Main Process] IPC 'make-api-call' recibido para URL: ${url}`);

    // Usamos una Promise porque el módulo `https` de Node es asíncrono y basado en eventos.
    return new Promise((resolve) => {
      try {
        const parsedUrl = new URL(url); 
        const requestOptions = {
          method: options.method,
          headers: options.headers,
          hostname: parsedUrl.hostname,
          path: parsedUrl.pathname + parsedUrl.search,
        };

        const req = https.request(requestOptions, (res) => {
          let data = '';
          res.on('data', (chunk) => data += chunk);
          res.on('end', () => {
            // Siempre resolvemos, devolviendo un objeto con el resultado.
            resolve({ success: true, status: res.statusCode, body: data });
          });
        });

        req.on('error', (error) => {
          console.error('[Main Process] Ha ocurrido un error de red:', error.message);
          // Siempre resolvemos, pero indicando que hubo un error.
          resolve({ success: false, error: { message: error.message } });
        });

        if (options.body) {
          req.write(options.body);
        }
        req.end();

      } catch (error) {
        console.error('[Main Process] Ha ocurrido un error al construir la petición (URL inválida?):', error.message);
        // Siempre resolvemos, indicando que hubo un error.
        resolve({ success: false, error: { message: error.message } });
      }
    });
  });

  // Una vez que el handler está registrado, creamos la ventana.
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

function createWindow() {
  const preloadScriptPath = path.join(__dirname, 'preload.js');

  const mainWindow = new BrowserWindow({
    width: 1300,
    height: 850,
    icon: path.join(__dirname, '../assets/icon.ico'),
    webPreferences: {
      preload: preloadScriptPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    }
  });

  mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});