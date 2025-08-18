// Fichero: main.js
// Descripción: Gestiona el ciclo de vida de la aplicación, el flujo de autenticación seguro y las llamadas a la API.

// --- 1. MÓDULOS REQUERIDOS ---
const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const axios = require('axios');
const keytar = require('keytar'); // Librería para el llavero seguro

// --- Variables de estado ---
let mainWindow;
let activeSession = { // Almacena en memoria la sesión activa
    clientName: null,
    accessToken: null,
    soapUri: null,
    restUri: null,
    expiryTimestamp: 0
};

// --- Constantes ---
const KEYTAR_SERVICE_NAME = 'MC-API-Helper'; // Nombre del servicio para el llavero
const REDIRECT_URI = 'https://127.0.0.1:8443/callback';
const TOKEN_EXPIRY_BUFFER = 300; // 5 minutos de margen para refrescar

// --- 2. FUNCIÓN DE CREACIÓN DE LA VENTANA ---
function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1300,
        height: 850,
        icon: path.join(__dirname, 'icon.ico'),
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: path.join(__dirname, 'preload.js')
        }
    });
    mainWindow.loadFile('index.html');
    // mainWindow.webContents.openDevTools();
}

// --- 3. GESTIÓN DEL CICLO DE VIDA ---
app.whenReady().then(createWindow);
app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});
app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

// --- 4. GESTIÓN DE CREDENCIALES Y TOKENS ---

/**
 * Refresca el access_token usando el refresh_token guardado en el llavero.
 * @param {string} clientName - El nombre del cliente para el que se refresca el token.
 */
async function refreshAccessToken(clientName) {
    const refreshToken = await keytar.getPassword(KEYTAR_SERVICE_NAME, `${clientName}-refreshToken`);
    const clientSecret = await keytar.getPassword(KEYTAR_SERVICE_NAME, `${clientName}-clientSecret`);
    const clientId = await keytar.getPassword(KEYTAR_SERVICE_NAME, `${clientName}-clientId`);
    const authUri = await keytar.getPassword(KEYTAR_SERVICE_NAME, `${clientName}-authUri`);

    if (!refreshToken || !clientSecret || !clientId || !authUri) {
        throw new Error(`Faltan credenciales seguras para "${clientName}". Se requiere login.`);
    }

    try {
        const payload = {
            grant_type: 'refresh_token',
            client_id: clientId,
            client_secret: clientSecret,
            refresh_token: refreshToken
        };
        const response = await axios.post(authUri, payload, { headers: { 'Content-Type': 'application/json' } });
        const tokenData = response.data;

        // Actualiza el refresh token en el llavero por si ha cambiado
        await keytar.setPassword(KEYTAR_SERVICE_NAME, `${clientName}-refreshToken`, tokenData.refresh_token);

        // Actualiza la sesión activa en memoria
        activeSession = {
            clientName: clientName,
            accessToken: tokenData.access_token,
            soapUri: tokenData.soap_instance_url,
            restUri: tokenData.rest_instance_url,
            expiryTimestamp: Date.now() + (tokenData.expires_in - TOKEN_EXPIRY_BUFFER) * 1000
        };

    } catch (error) {
        console.error("Error crítico al refrescar el token. Se requiere nuevo login.", error.response ? error.response.data : error.message);
        await keytar.deletePassword(KEYTAR_SERVICE_NAME, `${clientName}-refreshToken`); // Limpia el token inválido
        activeSession = {}; // Resetea la sesión
        throw new Error("Fallo al refrescar el token. Por favor, haz login de nuevo.");
    }
}

// IPC: Proporciona la configuración de API al frontend bajo demanda
ipcMain.handle('get-api-config', async (event, clientName) => {
    if (!clientName) return null;

    // Si la sesión activa no es la correcta, o el token no existe, o ha expirado -> refresca
    if (activeSession.clientName !== clientName || !activeSession.accessToken || Date.now() >= activeSession.expiryTimestamp) {
        try {
            await refreshAccessToken(clientName);
        } catch (e) {
            // Si el refresco falla, notifica al renderer que necesita login
            mainWindow.webContents.send('require-login', { message: e.message });
            return null;
        }
    }
    
    return {
        accessToken: activeSession.accessToken,
        soapUri: activeSession.soapUri ? activeSession.soapUri + 'Service.asmx' : null,
        restUri: activeSession.restUri
    };
});

// IPC: Inicia el flujo de login
ipcMain.on('start-login', (event, config) => {
    const authUrl = new URL(`${config.authUri.replace('/v2/token', '')}/v2/authorize`);
    authUrl.searchParams.append('client_id', config.clientId);
    authUrl.searchParams.append('response_type', 'code');
    authUrl.searchParams.append('redirect_uri', REDIRECT_URI);
    authUrl.searchParams.append('scope', 'data_extensions_write data_extensions_read journeys_write journeys_read automations_write automations_read');

    const loginWindow = new BrowserWindow({
        width: 800, height: 600, parent: mainWindow, modal: true, show: true,
        webPreferences: { nodeIntegration: false, contextIsolation: true }
    });
    loginWindow.loadURL(authUrl.toString());
    const { webContents } = loginWindow;

    const onNavigate = async (evt, navigationUrl) => {
        if (navigationUrl.startsWith(REDIRECT_URI)) {
            const parsedUrl = new URL(navigationUrl);
            const authCode = parsedUrl.searchParams.get('code');
            loginWindow.close();

            if (authCode) {
                try {
                    const payload = {
                        grant_type: 'authorization_code',
                        client_id: config.clientId,
                        client_secret: config.clientSecret,
                        code: authCode,
                        redirect_uri: REDIRECT_URI,
                    };
                    const response = await axios.post(config.authUri, payload, { headers: { 'Content-Type': 'application/json' } });
                    const tokenData = response.data;
                    
                    // GUARDADO SEGURO
                    await keytar.setPassword(KEYTAR_SERVICE_NAME, `${config.clientName}-refreshToken`, tokenData.refresh_token);
                    await keytar.setPassword(KEYTAR_SERVICE_NAME, `${config.clientName}-clientSecret`, config.clientSecret);
                    await keytar.setPassword(KEYTAR_SERVICE_NAME, `${config.clientName}-clientId`, config.clientId);
                    await keytar.setPassword(KEYTAR_SERVICE_NAME, `${config.clientName}-authUri`, config.authUri);

                    // Actualiza la sesión activa
                    activeSession = {
                        clientName: config.clientName,
                        accessToken: tokenData.access_token,
                        soapUri: tokenData.soap_instance_url,
                        restUri: tokenData.rest_instance_url,
                        expiryTimestamp: Date.now() + (tokenData.expires_in - TOKEN_EXPIRY_BUFFER) * 1000
                    };
                    
                    mainWindow.webContents.send('token-received', { success: true, data: tokenData });
                } catch (error) {
                    mainWindow.webContents.send('token-received', { success: false, error: error.response ? error.response.data : error.message });
                }
            }
        }
    };
    webContents.on('will-redirect', onNavigate);
     // Variable para saber si el login se completó con éxito
    let loginHandled = false;

    // Modificamos el listener 'will-redirect' para actualizar nuestra variable
    webContents.on('will-redirect', (evt, navigationUrl) => {
        loginHandled = true; // Marcamos que el flujo de login se está gestionando
        onNavigate(evt, navigationUrl);
    });

    // Añadimos un listener para el evento 'closed'
    loginWindow.on('closed', () => {
        webContents.removeListener('will-redirect', onNavigate);
        // Si la ventana se cierra sin que el login se haya gestionado,
        // enviamos una respuesta de error para desbloquear la UI.
        if (!loginHandled) {
            mainWindow.webContents.send('token-received', { 
                success: false, 
                error: 'Proceso de login cancelado por el usuario.' 
            });
        }
    });
});

// IPC: Cierra la sesión (logout)
ipcMain.on('logout', async (event, clientName) => {
    if (!clientName) return;
    // Limpia las credenciales seguras
    await keytar.deletePassword(KEYTAR_SERVICE_NAME, `${clientName}-refreshToken`);
    await keytar.deletePassword(KEYTAR_SERVICE_NAME, `${clientName}-clientSecret`);
    await keytar.deletePassword(KEYTAR_SERVICE_NAME, `${clientName}-clientId`);
    await keytar.deletePassword(KEYTAR_SERVICE_NAME, `${clientName}-authUri`);
    
    // Limpia la sesión en memoria si era la activa
    if (activeSession.clientName === clientName) {
        activeSession = {};
    }

    mainWindow.webContents.send('logout-success');
});