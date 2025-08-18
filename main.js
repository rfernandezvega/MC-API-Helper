// Fichero: main.js
// Descripción: Gestiona el ciclo de vida de la aplicación, el flujo de autenticación seguro y las llamadas a la API.

// --- 1. MÓDulos REQUERIDOS ---
const { app, BrowserWindow, ipcMain, shell } = require('electron');
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
    expiryTimestamp: 0,
    userInfo: null,
    orgInfo: null // <-- Importante añadir orgInfo aquí también
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
    // Descomenta la siguiente línea para abrir las herramientas de desarrollador al iniciar
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

// IPC: Abre un enlace en el navegador externo de forma segura
ipcMain.on('open-external-link', (event, url) => {
    //console.log(`[DEBUG main.js] Evento 'open-external-link' recibido. URL: ${url}`);

    // Comprobación de seguridad básica para asegurar que solo se abran enlaces web
    if (url && (url.startsWith('http://') || url.startsWith('https://'))) {
        shell.openExternal(url);
    } else {
        console.warn(`Se intentó abrir un enlace no seguro o malformado: ${url}`);
    }
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

        await keytar.setPassword(KEYTAR_SERVICE_NAME, `${clientName}-refreshToken`, tokenData.refresh_token);

        let userInfo = null;
        let orgInfo = null; 
        try {
            const userInfoUrl = `${authUri.replace('/v2/token', '')}/v2/userinfo`;
            //console.log('[DEBUG main.js] Intentando obtener user info desde:', userInfoUrl); 

            const userInfoResponse = await axios.get(userInfoUrl, {
                headers: { 'Authorization': `Bearer ${tokenData.access_token}` }
            });
            //console.log('[DEBUG main.js] Respuesta COMPLETA de /v2/userinfo:', JSON.stringify(userInfoResponse.data, null, 2));

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

    } catch (error) {
        console.error("Error crítico al refrescar el token.", error.response ? error.response.data : error.message);
        await keytar.deletePassword(KEYTAR_SERVICE_NAME, `${clientName}-refreshToken`);
        activeSession = {};
        throw new Error("Fallo al refrescar el token. Por favor, haz login de nuevo.");
    }
}

// IPC: Proporciona la configuración de API al frontend bajo demanda
ipcMain.handle('get-api-config', async (event, clientName) => {
    if (!clientName) return null;

    let needsRefresh = false;

    // Condición 1: Sesión incorrecta o token expirado
    if (activeSession.clientName !== clientName || !activeSession.accessToken || Date.now() >= activeSession.expiryTimestamp) {
        needsRefresh = true;
    } 
    // Condición 2: La sesión es "válida" pero le falta información crucial (orgInfo)
    else if (activeSession.accessToken && !activeSession.orgInfo) {
        //console.log('[DEBUG main.js] Sesión activa pero incompleta. Forzando actualización de datos de usuario/org.');
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

// IPC: Inicia el flujo de login
ipcMain.on('start-login', async (event, config) => { // Asegurarse de que es async
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

    const onNavigate = async (evt, navigationUrl) => { // Asegurarse de que es async
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
                        //console.log('[DEBUG main.js] Intentando obtener user info desde:', userInfoUrl); // LOG AÑADIDO

                        const userInfoResponse = await axios.get(userInfoUrl, {
                            headers: { 'Authorization': `Bearer ${tokenData.access_token}` }
                        });
                        userInfo = userInfoResponse.data.user; 
                        orgInfo = userInfoResponse.data.organization;
                        //console.log('[DEBUG main.js] Respuesta COMPLETA de /v2/userinfo:', JSON.stringify(userInfoResponse.data, null, 2));
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

// IPC: Cierra la sesión (logout)
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