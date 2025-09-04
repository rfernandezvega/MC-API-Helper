// Fichero: main.js
// Descripción: Gestiona el ciclo de vida de la aplicación, el flujo de autenticación seguro y las llamadas a la API.

// --- 1. MÓDulos REQUERIDOS ---
const { app, BrowserWindow, ipcMain, shell, Notification } = require('electron'); 
const { google } = require('googleapis'); 
const fs = require('fs'); 
const { autoUpdater } = require('electron-updater');
const path = require('path');
const axios = require('axios');
const keytar = require('keytar'); // Librería para el llavero seguro

const appVersion = require(path.join(__dirname, '..', '..', 'package.json')).version;


// --- Configuración Inicial ---
app.setAppUserModelId("com.seidor.mc-api-helper");
app.disableHardwareAcceleration();

// --- Variables de estado ---
let mainWindow;
let activeSession = { 
    clientName: null,
    accessToken: null,
    soapUri: null,
    restUri: null,
    expiryTimestamp: 0,
    userInfo: null,
    orgInfo: null 
};
let sheetsClientPromise = null;

// --- Constantes ---
const KEYTAR_SERVICE_NAME = 'MC-API-Helper';
const REDIRECT_URI = 'https://127.0.0.1:8443/callback';
const TOKEN_EXPIRY_BUFFER = 300;
const GOOGLE_CREDENTIALS_PATH = path.join(__dirname, '..', '..', 'google-credentials.json');
const SPREADSHEET_ID = '17vqeFeKK5Ht-WCYrhNxyRjwWTAUSscNVBCGO5quz7VY';
const SHEET_NAME = 'Accesos';

// --- 2. FUNCIÓN DE CREACIÓN DE LA VENTANA ---
function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1300,
        height: 850,
        icon: path.join(__dirname, '..', '..', 'icon.png'),
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: path.join(__dirname, 'preload.js')
        }
    });

    if (app.isPackaged) {
        mainWindow.setMenu(null);
        mainWindow.webContents.on('before-input-event', (event, input) => {
            if ((input.control && input.shift && input.key.toLowerCase() === 'i') || input.key === 'F12') {
                event.preventDefault();
            }
        });
    }

    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
}

// --- 3. GESTIÓN DEL CICLO DE VIDA Y ACTUALIZACIONES ---
app.whenReady().then(() => {
    initializeGoogleClient();
    createWindow();

    autoUpdater.on('update-downloaded', (info) => {
        const notification = new Notification({
            title: 'Actualización Lista para Instalar',
            body: `La versión ${info.version} de MC API Helper está lista. Haz clic para reiniciar e instalar.`,
            icon: path.join(__dirname, 'icon.ico')
        });
        notification.show();
        notification.on('click', () => autoUpdater.quitAndInstall());
    });
    autoUpdater.checkForUpdates();
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

// --- FUNCIÓN DE INICIALIZACIÓN Y VALIDACIÓN (Google Sheets) ---
function initializeGoogleClient() {
    sheetsClientPromise = new Promise(async (resolve, reject) => {
        try {
            const auth = new google.auth.GoogleAuth({
                keyFile: GOOGLE_CREDENTIALS_PATH,
                scopes: ['https://www.googleapis.com/auth/spreadsheets'],
            });
            const sheets = google.sheets({ version: 'v4', auth });
            resolve(sheets);
        } catch (error) {
            reject(error);
        }
    });
}

async function validateUserInSheet(email, accessKey, version) {
    try {
        const sheets = await sheetsClientPromise;
        if (!sheets) throw new Error("El cliente de Google Sheets no está disponible.");

        const response = await sheets.spreadsheets.values.get({
            spreadsheetId: SPREADSHEET_ID,
            range: `${SHEET_NAME}!A:G`,
        });

        const rows = response.data.values;
        if (!rows || rows.length < 2) return false;

        const dataRows = rows.slice(1);
        const userRowIndex = dataRows.findIndex(row => row[1] && row[1].toLowerCase() === email.toLowerCase());
        if (userRowIndex === -1) return false;
        
        const userRow = dataRows[userRowIndex];
        const storedKey = userRow[2];
        const isActive = userRow[3];
        const isValid = storedKey === accessKey && (isActive?.toLowerCase() === 'true' || isActive?.toLowerCase() === 'sí');

        if (!isValid) return false;

        const sheetRowNumber = userRowIndex + 2;
        const currentCount = parseInt(userRow[4], 10) || 0;
        await sheets.spreadsheets.values.update({
            spreadsheetId: SPREADSHEET_ID,
            range: `${SHEET_NAME}!E${sheetRowNumber}:G${sheetRowNumber}`,
            valueInputOption: 'USER_ENTERED',
            resource: {
                values: [[currentCount + 1, new Date().toLocaleString('es-ES', { timeZone: 'Europe/Madrid' }), version]],
            },
        });
        
        return true;
    } catch (error) {
        console.error('Error al validar con Google Sheets:', error.message);
        if (error.code === 'ENOENT') throw new Error('No se encontró el fichero de credenciales de Google (google-credentials.json).');
        return false;
    }
}

// --- 4. COMUNICACIÓN IPC ---
ipcMain.handle('validate-license', async (event, { email, key }) => {
    try {
        return await validateUserInSheet(email, key, appVersion);
    } catch (error) {
        return { error: error.message };
    }
});

ipcMain.on('open-external-link', (event, url) => {
    if (url && (url.startsWith('http://') || url.startsWith('https://'))) {
        shell.openExternal(url);
    }
});

// --- 5. GESTIÓN DE CREDENCIALES Y TOKENS ---
async function refreshAccessToken(clientName) {
    const refreshToken = await keytar.getPassword(KEYTAR_SERVICE_NAME, `${clientName}-refreshToken`);
    const clientSecret = await keytar.getPassword(KEYTAR_SERVICE_NAME, `${clientName}-clientSecret`);
    const clientId = await keytar.getPassword(KEYTAR_SERVICE_NAME, `${clientName}-clientId`);
    const authUri = await keytar.getPassword(KEYTAR_SERVICE_NAME, `${clientName}-authUri`);

    if (!refreshToken || !clientSecret || !clientId || !authUri) {
        throw new Error(`Faltan credenciales seguras para "${clientName}". Se requiere login.`);
    }

    try {
        const payload = { grant_type: 'refresh_token', client_id: clientId, client_secret: clientSecret, refresh_token: refreshToken };
        const response = await axios.post(authUri, payload, { headers: { 'Content-Type': 'application/json' } });
        const tokenData = response.data;

        await keytar.setPassword(KEYTAR_SERVICE_NAME, `${clientName}-refreshToken`, tokenData.refresh_token);

        let userInfo = null, orgInfo = null;
        try {
            const userInfoUrl = `${authUri.replace('/v2/token', '')}/v2/userinfo`;
            const userInfoResponse = await axios.get(userInfoUrl, {
                headers: { 'Authorization': `Bearer ${tokenData.access_token}` }
            });
            userInfo = userInfoResponse.data.user;
            orgInfo = userInfoResponse.data.organization;
        } catch (e) {
            console.error("No se pudo obtener la información del usuario/organización.", e.message);
        }

        // --- CORRECCIÓN CLAVE 1 ---
        // En lugar de sobreescribir toda la sesión, lo que borraría soapUri y restUri,
        // solo actualizamos las propiedades que cambian, preservando las existentes.
        activeSession = {
            ...activeSession, // Mantiene las propiedades antiguas (como soapUri y restUri)
            clientName: clientName,
            accessToken: tokenData.access_token,
            expiryTimestamp: Date.now() + (tokenData.expires_in - TOKEN_EXPIRY_BUFFER) * 1000,
            userInfo: userInfo,
            orgInfo: orgInfo
        };

    } catch (error) {
        console.error("Error crítico al refrescar el token.", error.response ? error.response.data : error.message);
        await keytar.deletePassword(KEYTAR_SERVICE_NAME, `${clientName}-refreshToken`);
        activeSession = {};
        throw new Error("Fallo al refrescar el token. Por favor, haz login de nuevo.");
    }
}

ipcMain.handle('get-api-config', async (event, clientName) => {
    if (!clientName) return null;

    let needsRefresh = false;

    // --- CORRECCIÓN CLAVE 2 ---
    // Se elimina la condición `!activeSession.orgInfo` que forzaba el refresco.
    // Una sesión es válida si tiene un token y no ha expirado.
    if (activeSession.clientName !== clientName || !activeSession.accessToken || Date.now() >= activeSession.expiryTimestamp) {
        needsRefresh = true;
    } 

    if (needsRefresh) {
        try {
            await refreshAccessToken(clientName);
        } catch (e) {
            mainWindow.webContents.send('require-login', { message: e.message });
            return null;
        }
    }

    return {
        accessToken: activeSession.accessToken,
        soapUri: activeSession.soapUri ? activeSession.soapUri + 'Service.asmx' : null,
        restUri: activeSession.restUri,
        userInfo: activeSession.userInfo,
        orgInfo: activeSession.orgInfo 
    };
});

ipcMain.on('start-login', async (event, config) => {
    const authUrl = new URL(`${config.authUri.replace('/v2/token', '')}/v2/authorize`);
    authUrl.searchParams.append('client_id', config.clientId);
    authUrl.searchParams.append('response_type', 'code');
    authUrl.searchParams.append('redirect_uri', REDIRECT_URI);

    const loginWindow = new BrowserWindow({
        width: 800, height: 600, parent: mainWindow, modal: true, show: true,
        webPreferences: { nodeIntegration: false, contextIsolation: true }
    });
    
    loginWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
        console.error(`[LOGIN-ERROR] La ventana de login falló al cargar: ${errorDescription} (Código: ${errorCode})`);
    });

    loginWindow.loadURL(authUrl.toString());

    const { webContents } = loginWindow;
    let loginHandled = false;

    const onNavigate = async (evt, navigationUrl) => {
        if (navigationUrl.startsWith(REDIRECT_URI)) {
            loginHandled = true;
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
                    
                    await keytar.setPassword(KEYTAR_SERVICE_NAME, `${config.clientName}-refreshToken`, tokenData.refresh_token);
                    await keytar.setPassword(KEYTAR_SERVICE_NAME, `${config.clientName}-clientSecret`, config.clientSecret);
                    await keytar.setPassword(KEYTAR_SERVICE_NAME, `${config.clientName}-clientId`, config.clientId);
                    await keytar.setPassword(KEYTAR_SERVICE_NAME, `${config.clientName}-authUri`, config.authUri);
                    
                    let userInfo = null;
                    let orgInfo = null;
                    try {
                        const userInfoUrl = `${config.authUri.replace('/v2/token', '')}/v2/userinfo`;
                        const userInfoResponse = await axios.get(userInfoUrl, {
                            headers: { 'Authorization': `Bearer ${tokenData.access_token}` }
                        });
                        userInfo = userInfoResponse.data.user; 
                        orgInfo = userInfoResponse.data.organization;
                    } catch (e) {
                        console.error("No se pudo obtener la info de usuario/organización.", e.message);
                    }

                    activeSession = {
                        clientName: config.clientName,
                        accessToken: tokenData.access_token,
                        soapUri: tokenData.soap_instance_url,
                        restUri: tokenData.rest_instance_url,
                        expiryTimestamp: Date.now() + (tokenData.expires_in - TOKEN_EXPIRY_BUFFER) * 1000,
                        userInfo: userInfo,
                        orgInfo: orgInfo
                    };
                    
                    mainWindow.webContents.send('token-received', { success: true, data: { ...tokenData, userInfo, orgInfo } });
                } catch (error) {
                    const errorMessage = error.response ? JSON.stringify(error.response.data) : error.message;
                    mainWindow.webContents.send('token-received', { success: false, error: errorMessage });
                }
            } else {
                 mainWindow.webContents.send('token-received', { success: false, error: 'No se recibió el código de autorización.' });
            }
        }
    };
    webContents.on('will-redirect', onNavigate);

    loginWindow.on('closed', () => {
        webContents.removeListener('will-redirect', onNavigate);
        if (!loginHandled) {
            mainWindow.webContents.send('token-received', { 
                success: false, 
                error: 'Proceso de login cancelado.' 
            });
        }
    });
});

ipcMain.on('logout', async (event, clientName) => {
    if (!clientName) return;
    await keytar.deletePassword(KEYTAR_SERVICE_NAME, `${clientName}-refreshToken`);
    await keytar.deletePassword(KEYTAR_SERVICE_NAME, `${clientName}-clientSecret`);
    await keytar.deletePassword(KEYTAR_SERVICE_NAME, `${clientName}-clientId`);
    await keytar.deletePassword(KEYTAR_SERVICE_NAME, `${clientName}-authUri`);
    
    if (activeSession.clientName === clientName) {
        activeSession = {};
    }

    mainWindow.webContents.send('logout-success');
});