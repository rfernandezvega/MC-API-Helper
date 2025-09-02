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
// Asigna un App User Model ID explícito. Esto arregla el nombre en las notificaciones de Windows.
app.setAppUserModelId("com.seidor.mc-api-helper");
// Desactiva la aceleración de hardware para evitar problemas de renderizado.
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

// --- Constantes ---
const KEYTAR_SERVICE_NAME = 'MC-API-Helper';
const REDIRECT_URI = 'https://127.0.0.1:8443/callback';
const TOKEN_EXPIRY_BUFFER = 300;

// --- Constantes para Google Sheets ---
const GOOGLE_CREDENTIALS_PATH = path.join(__dirname, '..', '..', 'google-credentials.json');
const SPREADSHEET_ID = '17vqeFeKK5Ht-WCYrhNxyRjwWTAUSscNVBCGO5quz7VY';
const SHEET_NAME = 'Accesos'; // El nombre de la pestaña en tu hoja

// --- 2. FUNCIÓN DE CREACIÓN DE LA VENTANA ---
function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1300,
        height: 850,
        icon: path.join(__dirname, '..', '..', 'icon.ico'),
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: path.join(__dirname, 'preload.js')
        }
    });

    // Si la aplicación está empaquetada (producción), elimina el menú y bloquea las DevTools.
    if (app.isPackaged) {
        // 1. Elimina la barra de menú por completo.
        mainWindow.setMenu(null);

        // 2. Bloquea las combinaciones de teclas para abrir las Herramientas de Desarrollador.
        mainWindow.webContents.on('before-input-event', (event, input) => {
            // Bloquear Ctrl+Shift+I
            if (input.control && input.shift && input.key.toLowerCase() === 'i') {
                event.preventDefault();
            }
            // Bloquear F12
            if (input.key === 'F12') {
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

    // --- LÓGICA DE AUTO-ACTUALIZACIÓN PERSONALIZADA ---
    console.log('Aplicación iniciada. Buscando actualizaciones...');

    autoUpdater.on('update-downloaded', (info) => {
        console.log('[Updater] Actualización descargada. Creando notificación personalizada.');
        
        const notification = new Notification({
            title: 'Actualización Lista para Instalar',
            body: `La versión ${info.version} de MC API Helper está lista. Haz clic para reiniciar e instalar.`,
            icon: path.join(__dirname, 'icon.ico')
        });

        notification.show();

        notification.on('click', () => {
            console.log('[Updater] Notificación pulsada. Reiniciando para instalar...');
            autoUpdater.quitAndInstall();
        });
    });

    // Inicia la búsqueda. No usamos "...AndNotify()" para tener control sobre la notificación.
    autoUpdater.checkForUpdates();
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
// --- FUNCIÓN DE INICIALIZACIÓN DEL CLIENTE DE GOOGLE ---
function initializeGoogleClient() {
    // Esta función crea una promesa que se resolverá con el cliente de Sheets.
    // La llamamos una sola vez al inicio de la app.
    sheetsClientPromise = new Promise(async (resolve, reject) => {
        try {
            console.log("Inicializando cliente de Google Sheets en segundo plano...");
            const auth = new google.auth.GoogleAuth({
                keyFile: GOOGLE_CREDENTIALS_PATH,
                scopes: ['https://www.googleapis.com/auth/spreadsheets'],
            });
            const sheets = google.sheets({ version: 'v4', auth });
            console.log("Cliente de Google Sheets listo.");
            resolve(sheets);
        } catch (error) {
            console.error("Fallo al inicializar el cliente de Google Sheets:", error);
            reject(error);
        }
    });
}
// --- FUNCIÓN DE VALIDACIÓN DE LICENCIA ---
async function validateUserInSheet(email, accessKey, version) {
    try {
        // 1. Esperamos a que la promesa de inicialización se complete
        const sheets = await sheetsClientPromise;
        if (!sheets) {
            throw new Error("El cliente de Google Sheets no está disponible.");
        }

        // 2. Leer los datos de la hoja
        const response = await sheets.spreadsheets.values.get({
            spreadsheetId: SPREADSHEET_ID,
            range: `${SHEET_NAME}!A:G`, // Leemos hasta la columna F para obtener el contador
        });

        const rows = response.data.values;
        if (!rows || rows.length === 0) {
            console.error("La hoja de cálculo está vacía o no se pudo leer.");
            return false;
        }

        const dataRows = rows.slice(1);

        // 3. Buscar el índice de la fila del usuario
        const userRowIndex = dataRows.findIndex(row => row[1] && row[1].toLowerCase() === email.toLowerCase());

        if (userRowIndex === -1) {
            console.log(`Usuario no encontrado: ${email}`);
            return false; // Usuario no existe
        }
        
        const userRow = dataRows[userRowIndex];

        // 4. Validar la clave (columna C, índice 2) y el estado (columna D, índice 3)
        const storedKey = userRow[2];
        const isActive = userRow[3];
        const isValid = storedKey === accessKey && (isActive.toLowerCase() === 'true' || isActive.toLowerCase() === 'sí');

        if (!isValid) {
            console.log(`Validación fallida para ${email}. Clave correcta: ${storedKey === accessKey}, Activo: ${isActive}`);
            return false; // Clave incorrecta o usuario inactivo
        }

        // 5. SI LA VALIDACIÓN ES EXITOSA, ACTUALIZAMOS EL REGISTRO
        console.log(`Usuario validado con éxito: ${email}. Actualizando registro de acceso...`);

        // Obtenemos el número de fila real en la hoja (índice + 2 porque quitamos la cabecera y las filas son 1-based)
        const sheetRowNumber = userRowIndex + 2;

        // Calculamos los nuevos valores
        const currentCount = parseInt(userRow[4], 10) || 0; // Columna E (índice 4). Si está vacía o no es un número, es 0.
        const newCount = currentCount + 1;
        const lastAccessTimestamp = new Date().toLocaleString('es-ES', { timeZone: 'Europe/Madrid' }); // Columna F

        // Preparamos la llamada de actualización
        await sheets.spreadsheets.values.update({
            spreadsheetId: SPREADSHEET_ID,
            range: `${SHEET_NAME}!E${sheetRowNumber}:G${sheetRowNumber}`, // Rango a actualizar, ej: Accesos!E5:F5
            valueInputOption: 'USER_ENTERED',
            resource: {
                values: [
                    [newCount, lastAccessTimestamp, version]
                ],
            },
        });
        
        console.log(`Registro para ${email} actualizado. Accesos: ${newCount}`);

        // 6. Devolvemos true para que la app continúe
        return true;

    } catch (error) {
        console.error('Error al validar o actualizar con Google Sheets:', error.message);
        if (error.code === 'ENOENT') {
            throw new Error('No se encontró el fichero de credenciales de Google (google-credentials.json).');
        }
        return false;
    }
}

// --- 4. COMUNICACIÓN IPC ---

ipcMain.handle('validate-license', async (event, { email, key }) => {
    try {
        return await validateUserInSheet(email, key, appVersion);
    } catch (error) {
        // Si hay un error, lo pasamos a la UI para que lo muestre
        return { error: error.message };
    }
});

ipcMain.on('open-external-link', (event, url) => {
    if (url && (url.startsWith('http://') || url.startsWith('https://'))) {
        shell.openExternal(url);
    } else {
        console.warn(`Se intentó abrir un enlace no seguro o malformado: ${url}`);
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
        const payload = {
            grant_type: 'refresh_token',
            client_id: clientId,
            client_secret: clientSecret,
            refresh_token: refreshToken
        };
        const response = await axios.post(authUri, payload, { headers: { 'Content-Type': 'application/json' } });
        const tokenData = response.data;

        await keytar.setPassword(KEYTAR_SERVICE_NAME, `${clientName}-refreshToken`, tokenData.refresh_token);

        let userInfo = null;
        let orgInfo = null; 
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

        activeSession = {
            clientName: clientName,
            accessToken: tokenData.access_token,
            soapUri: tokenData.soap_instance_url,
            restUri: tokenData.rest_instance_url,
            expiryTimestamp: Date.now() + (tokenData.expires_in - TOKEN_EXPIRY_BUFFER) * 1000,
            userInfo: userInfo,
            orgInfo: orgInfo
        };
        let sheetsClientPromise = null;
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

    if (activeSession.clientName !== clientName || !activeSession.accessToken || Date.now() >= activeSession.expiryTimestamp) {
        needsRefresh = true;
    } 
    else if (activeSession.accessToken && !activeSession.orgInfo) {
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
                    const errorMessage = error.response ? error.response.data : error.message;
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