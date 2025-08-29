# MC API Helper

MC API Helper es una aplicación de escritorio construida con Electron, diseñada para interactuar de manera eficiente y segura con la API de Salesforce Marketing Cloud. La herramienta proporciona una interfaz de usuario para simplificar tareas comunes que a menudo requieren múltiples pasos o llamadas directas a la API, agilizando el trabajo de desarrolladores y administradores de Marketing Cloud.

<!-- AÑADE AQUÍ UNA CAPTURA O GIF DE LA APLICACIÓN -->
<!-- ![Captura de MC API Helper](ruta/a/tu/imagen.png) -->

---

## ➤ Tecnologías Principales

Esta aplicación está construida sobre la plataforma **Electron**, lo que le permite funcionar como una aplicación de escritorio nativa en Windows utilizando tecnologías web modernas.

-   **Electron:** Framework principal para crear la aplicación de escritorio.
-   **Node.js:** Entorno de ejecución para la lógica de backend (proceso principal).
-   **HTML5, CSS3, JavaScript (ES6+):** Pila estándar para la construcción de la interfaz de usuario (proceso de renderizado).
-   **Seguridad:**
    -   **Context Isolation & Preload Scripts:** Para una comunicación segura entre el frontend y el backend, evitando la exposición de APIs de Node.js al renderizador.
    -   **Keytar:** Almacenamiento de credenciales sensibles (refresh tokens, client secrets) de forma segura en el llavero del sistema operativo (ej. Administrador de Credenciales de Windows).

---

## ➤ Librerías Clave

-   **`axios`:** Cliente HTTP para realizar llamadas a la API REST de Marketing Cloud de forma sencilla.
-   **`googleapis`:** Librería oficial de Google para interactuar con la API de Google Sheets, utilizada para el sistema de validación de licencias.
-   **`electron-updater`:** Gestiona las actualizaciones automáticas de la aplicación, notificando al usuario cuando hay una nueva versión disponible.
-   **`electron-builder`:** Herramienta utilizada para empaquetar y construir la aplicación en un instalador ejecutable (`.exe`).
-   **`electron-log`:** Para una gestión de logs más robusta en el entorno de producción.

---

## ➤ Funcionalidades

La aplicación se organiza en varias vistas para cubrir diferentes áreas de trabajo en Marketing Cloud.

### 🏛️ General
-   **Configuración de APIs:** Permite guardar y gestionar múltiples configuraciones de clientes (diferentes BUs, entornos de Sandobx/Producción). La autenticación se realiza mediante un flujo OAuth 2.0 seguro.
-   **Documentación:** Una guía integrada para entender el funcionamiento de cada módulo.

### 🗂️ Gestión de Data Extensions
-   **Creación de Data Extensions:** Asistente completo para crear una nueva DE, incluyendo nombre, carpeta, descripción y configuración "Sendable" con su respectivo campo de Subscriber Key.
-   **Gestión de Campos (Creación/Actualización):**
    -   Añade, edita y reordena campos en una tabla visual antes de enviarlos a la API.
    -   Permite la creación masiva de campos o la actualización ("upsert") de campos en una DE existente.
    -   Incluye un importador desde el portapapeles (compatible con Excel/Sheets) para añadir campos rápidamente.
-   **Gestión de Campos (Recuperación y Borrado):**
    -   Recupera todos los campos de una DE existente y los carga en la tabla de edición.
    -   Permite eliminar campos específicos, una función útil para campos que no se pueden borrar desde la UI de Marketing Cloud (ej. campos en Attribute Groups).

### ⚙️ Funcionalidades y Herramientas
-   **Calendario de Automatizaciones:**
    -   Visualiza un calendario anual con los días en que hay automatizaciones programadas.
    -   Permite filtrar para ver todos los automatismos o solo aquellos que contienen un Journey.
    -   Muestra el detalle de las ejecuciones programadas para un día concreto.
-   **Validador de Email:** Utiliza la API de Marketing Cloud para verificar la validez de una dirección de correo electrónico (sintaxis, MX records, List Detective).
-   **Buscadores Avanzados:**
    -   **Buscador de DEs:** Encuentra la ruta de carpeta completa de una Data Extension buscando por su nombre o External Key.
    -   **Buscador de Origen de Datos:** Dado el nombre de una DE, encuentra todas las actividades (Queries e Imports) que la tienen como destino.
    -   **Buscador de Clientes:** Busca un suscriptor por su Subscriber Key o Email y muestra sus datos, los Journeys en los que se encuentra y los datos de las DEs de envíos configuradas.
    -   **Buscador de Texto en Queries:** Realiza una búsqueda de texto libre dentro del código de todas las Query Activities de la cuenta.
-   **Gestión de Automatismos:**
    -   Muestra una tabla paginada y filtrable de todos los automatismos de la cuenta.
    -   Permite realizar acciones masivas (Activar, Ejecutar, Parar) sobre una selección de automatismos.
-   **Gestión de Journeys:**
    -   Muestra una tabla paginada y filtrable de todos los Journeys.
    -   Permite obtener y visualizar las comunicaciones (Emails, SMS, Pushes) de los Journeys seleccionados.
    -   **Clonado de Journeys:** Clona un Journey de tipo `EmailAudience` con un solo clic. El proceso clona automáticamente la DE de entrada, crea un nuevo Event Definition y recrea el Journey apuntando a los nuevos recursos.
    -   **Dibujar Flujo:** Genera una representación textual del flujo de un Journey para facilitar su análisis y documentación.

---

## ➤ Requisitos para Funcionar

Para que la aplicación funcione correctamente, se necesita configurar dos elementos externos: el paquete de API en Marketing Cloud y la hoja de Google Sheets para la validación de licencias.

### 1. Configuración en Marketing Cloud

1.  Ve a **Setup > Apps > Installed Packages**.
2.  Crea un nuevo paquete (`New`).
3.  Dale un nombre y una descripción.
4.  En la sección **Components**, haz clic en **Add Component**.
5.  Selecciona el tipo **API Integration** y escoge **Web App**.
6.  En el campo **Redirect URI**, debes introducir exactamente: `https://127.0.0.1:8443/callback`
7.  Asigna los siguientes permisos de API (Scope):
    -   **Email:** `Read`, `Write`
    -   **Automations:** `Read`, `Write`, `Execute`
    -   **Journeys:** `Read`, `Write`, `Activate/Stop/Pause/Resume/Send/Schedule`, `Delete`
    -   **Audiences:** `Read`, `Write`
    -   **List and Subscribers:** `Read`, `Write`
    -   **Data Extensions:** `Read`, `Write`
8.  Guarda el componente y el paquete. Copia el **Client ID**, **Client Secret** y la **Authentication Base URI** para usarlos en la aplicación.

> **Nota:** Después de crear o modificar un paquete de API, Marketing Cloud puede tardar hasta 10 minutos en aprovisionar los cambios completamente.

### 2. Configuración para Validación de Licencia (Google Sheets)

La aplicación utiliza una hoja de Google Sheets para validar el acceso de los usuarios.

1.  **Crea un Proyecto en Google Cloud Platform** y activa la **API de Google Sheets**.
2.  **Crea una Cuenta de Servicio** (`Service Account`) para este proyecto.
3.  Genera una clave **JSON** para esta cuenta de servicio y descarga el fichero.
4.  Renombra el fichero a `google-credentials.json` y colócalo en la raíz del proyecto.
5.  **Crea una nueva Hoja de Cálculo** en Google Sheets y compártela con el email de la cuenta de servicio que creaste (lo encontrarás dentro del JSON), dándole permisos de **Editor**.
6.  La hoja de cálculo debe tener una pestaña llamada exactamente **`Accesos`**.
7.  El ID de esta hoja de cálculo debe ser configurado en la constante `SPREADSHEET_ID` dentro del fichero `main.js`.
8.  La pestaña `Accesos` debe tener las siguientes columnas en este orden:
    -   **Columna A:** Nombre
    -   **Columna B:** Email (este es el email que el usuario introduce)
    -   **Columna C:** Clave de Acceso (esta es la clave que el usuario introduce)
    -   **Columna D:** Activo (debe contener `TRUE` o `SÍ` para que el acceso sea válido)
    -   **Columna E:** Contador de Accesos (se actualiza automáticamente)
    -   **Columna F:** Último Acceso (se actualiza automáticamente)

---

## ➤ Instalación y Desarrollo

Si quieres ejecutar el proyecto en modo de desarrollo:

1.  Clona el repositorio: `git clone <URL_DEL_REPO>`
2.  Navega a la carpeta del proyecto: `cd MC-API-Helper`
3.  Instala las dependencias: `npm install`
4.  Ejecuta la aplicación: `npm start`

## ➤ Compilación

Para compilar la aplicación y crear un instalador para Windows, ejecuta el siguiente comando. El instalador se generará en la carpeta `dist`.

```bash
npm run dist

Será necesario haber generado la variable de entorno previamente con la clave necesaria de Github para las actualizaciones automáticas