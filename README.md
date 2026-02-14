# MC API Helper

MC API Helper es una aplicación de escritorio construida con **Electron**, diseñada para simplificar y automatizar tareas complejas en **Salesforce Marketing Cloud**. La herramienta proporciona una interfaz de usuario intuitiva para agilizar el trabajo diario de desarrolladores y administradores de la plataforma.

---

## ➤ Arquitectura y Estructura de Ficheros

La aplicación sigue una arquitectura modular que separa las responsabilidades entre el proceso principal (backend) y el proceso de renderizado (frontend).

```
.
├── dist/                     # Carpeta de salida para el instalador (generada por `npm run dist`)
├── node_modules/             # Dependencias del proyecto
├── src/
│   ├── main/                 # Lógica del Proceso Principal (Backend de Electron)
│   │   ├── main.js           # Punto de entrada principal, gestiona la ventana, autenticación y seguridad.
│   │   └── preload.js        # Script de puente seguro entre el backend (main) y el frontend (renderer).
│   │
│   └── renderer/             # Lógica del Proceso de Renderizado (Frontend)
│       ├── api/
│       │   └── mc-api-service.js # Módulo que centraliza todas las llamadas a la API de SFMC.
│       ├── assets/             # Recursos estáticos como imágenes y GIFs.
│       ├── components/         # Módulos de JavaScript para cada funcionalidad específica.
│       │   ├── actividades-finder.js
│       │   ├── automations-analyzer.js
│       │   ├── automations-cloner.js
│       │   ├── automations-manager.js
│       │   ├── calendar.js
│       │   ├── cloud-pages-manager.js
│       │   ├── content-finder.js
│       │   ├── content-manager.js
│       │   ├── customer-finder.js
│       │   ├── data-source-finder.js
│       │   ├── de-creator.js
│       │   ├── de-finder.js
│       │   ├── documentation-manager.js
│       │   ├── email-validator.js
│       │   ├── field-manager.js
│       │   ├── fields-table.js
│       │   ├── folder-creator.js
│       │   ├── journeys-analyzer.js
│       │   ├── journeys-manager.js
│       │   ├── org-manager.js
│       │   ├── query-cloner.js
│       │   ├── query-text-finder.js
│       │   └── script-text-finder.js
│       ├── styles/             # Ficheros de estilo CSS.
│       │   ├── components/     # CSS específico para cada componente.
│       │   ├── common.css      # Estilos globales y reutilizables.
│       │   └── style.css       # Fichero principal que importa todos los demás CSS.
│       ├── ui/                 # Módulos de ayuda para la interfaz de usuario.
│       │   ├── dom-elements.js # Centraliza todas las referencias a los elementos del DOM.
│       │   ├── fonts.js        # Gestiona la fuente para los pdf.
│       │   ├── logger.js       # Gestiona el panel de logs.
│       │   └── ui-helpers.js   # Funciones para modales, loaders, etc.
│       ├── views/              # Fragmentos de HTML para cada vista de la aplicación.
│       ├── app.js              # Orquestador principal del frontend.
│       └── index.html          # Fichero HTML final (generado automáticamente).
│
├── .gitignore
├── build-html.js             # Script para ensamblar el index.html a partir de las vistas.
├── dev-app-update.yml
├── google-credentials.json   # Claves de la cuenta
```

### Descripción Detallada

#### Proceso Principal (`src/main`)
-   **`main.js`**: Es el corazón de la aplicación. Se encarga de:
    -   Crear y gestionar la ventana principal de Electron.
    -   Implementar el flujo de autenticación **OAuth 2.0**, abriendo la ventana de login de Salesforce.
    -   Almacenar y refrescar tokens de forma segura utilizando **`keytar`** (llavero del sistema operativo).
    -   Gestionar las **actualizaciones automáticas** con `electron-updater`.
    -   Validar licencias de usuario contra la API de **Google Sheets**.
-   **`preload.js`**: Actúa como un puente seguro entre el backend y el frontend. Expone selectivamente funciones del `main.js` al `window` del renderizador (`window.electronAPI`) usando `contextBridge`, lo que es crucial para la seguridad de la aplicación.

#### Proceso de Renderizado (`src/renderer`)
-   **`app.js` (Orquestador)**: Es el punto de entrada del frontend. No contiene lógica de funcionalidades, sino que:
    -   Inicializa todos los módulos de componentes.
    -   Gestiona la navegación entre vistas (`showSection`, `goBack`).
    -   Maneja el estado global de la sesión y actualiza la UI en consecuencia.
    -   Configura los event listeners globales.
-   **`api/mc-api-service.js`**: Módulo que abstrae toda la comunicación con la API de Marketing Cloud. Todas las llamadas SOAP y REST se definen aquí, haciendo que los componentes sean más limpios y reutilizables.
-   **`components/`**: La lógica de negocio de cada funcionalidad reside aquí. Cada fichero es un módulo independiente que controla una sección de la aplicación (ej. `automations-manager.js` controla la tabla y acciones de los automatismos).
-   **`ui/`**: Pequeños módulos dedicados a tareas específicas de la interfaz:
    -   `dom-elements.js`: Evita el uso de `document.getElementById` por todo el código, centralizando las referencias en un solo lugar.
    -   `logger.js`: Gestiona la escritura de mensajes en el panel de logs.
    -   `ui-helpers.js`: Proporciona funciones reutilizables como mostrar modales de alerta/confirmación o bloquear/desbloquear la pantalla.
-   **`views/` y `build-html.js`**: Para mantener el código fuente organizado, el HTML de cada vista se encuentra en su propio fichero dentro de `/views`. El script `build-html.js` lee todos estos fragmentos y los inyecta en una plantilla (`index.html.template`) para generar el `index.html` final que la aplicación carga.

---

## ➤ Configuración y Requisitos

### 1. Paquete de API en Marketing Cloud
Es necesario crear un paquete de tipo **Web App** con los siguientes permisos y configuración:
-   **Redirect URI:** `https://127.0.0.1:8443/callback`
-   **Permisos (Scope):**
    - **Data**
        - `Data Extensions`: Read, Write
        - `List and Subscribers`: Read, Write
    - **Journeys**
        - `Journeys`: Read, Write, Execute, Activate/Stop/Pause/Resume/Send/Schedule, Delete
    - **Automations**
        - `Automations`: Read, Write, Execute
    - **Assets**
        - `Documents and Images`: Read
        - `Saved Content`: Read
    - **Marketing Cloud Services**
        - `Email`: Read, Write
    - **Audiences**
        - `Audiences`: Read, Write
    - **File Locations**
        - `File Locations`: Read

> **Nota:** Tras crear o modificar el paquete, espera hasta 10 minutos para que los cambios se propaguen en la plataforma.

### 2. Validación de Licencia (Google Sheets)
La aplicación utiliza una hoja de Google Sheets para validar el acceso.
1.  **Crea un Proyecto en Google Cloud Platform** y activa la **API de Google Sheets**.
2.  **Crea una Cuenta de Servicio** y genera una clave **JSON**. Renómbrala a `google-credentials.json` y colócala en la raíz del proyecto.
3.  **Crea una Hoja de Cálculo** y compártela (con permisos de **Editor**) con el email de la cuenta de servicio.
4.  Configura el ID de la hoja en la constante `SPREADSHEET_ID` dentro de `src/main/main.js`.
5.  La hoja debe tener una pestaña llamada `Accesos` con las siguientes columnas: `Nombre`, `Email`, `Clave de Acceso`, `Activo` (`TRUE`/`SÍ`), `Contador de Accesos`, `Último Acceso`, `Versión App`.

---

## ➤ Desarrollo y Compilación

### Flujo de Desarrollo
La aplicación utiliza un script de construcción para ensamblar el HTML a partir de componentes modulares.

1.  **Instalar dependencias:**
    ```bash
    npm install
    ```
2.  **Iniciar el entorno de desarrollo:**
    ```bash
    npm run dev
    ```
    Este comando utiliza `nodemon` para vigilar los cambios en los ficheros HTML (`/views` y `index.html.template`) y reconstruye automáticamente el `index.html` final. Simplemente recarga la aplicación (Ctrl+R) para ver los cambios.

3.  **Iniciar la aplicación (sin vigilar cambios):**
    ```bash
    npm start
    ```
    Este comando primero reconstruye el HTML y luego lanza la aplicación.

### Compilación para Producción
Para crear el instalador para Windows (`.exe`), el script también se encarga de construir primero el HTML final.

1.  **Configurar la variable de entorno `GH_TOKEN`** para que `electron-builder` pueda acceder al repositorio de GitHub para las actualizaciones.
2.  Ejecutar el comando:
    ```bash
    npm run dist
    ```
    El instalador se generará en la carpeta `/dist`.