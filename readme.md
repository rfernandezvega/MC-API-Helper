# Marketing Cloud API Helper

![Licencia](https://img.shields.io/badge/license-MIT-blue.svg)

Una aplicación de escritorio autocontenida diseñada para facilitar la interacción con la API de Salesforce Marketing Cloud. Creada para equipos no técnicos, proporciona una interfaz gráfica de usuario para ejecutar tareas comunes (macros) sin necesidad de escribir código o usar herramientas como Postman.

![Captura de pantalla de la aplicación](screenshot.png) 
*(Reemplazar `screenshot.png`)*

## ¿Qué problema resuelve?

Las interacciones directas con la API de Marketing Cloud desde un navegador están bloqueadas por las políticas de seguridad **CORS (Cross-Origin Resource Sharing)**. Esta aplicación resuelve este problema empaquetando la interfaz web en **Electron**, lo que permite que las llamadas a la API se realicen desde un entorno de Node.js, que no tiene restricciones de CORS.

El resultado es una aplicación de escritorio nativa (`.exe` para Windows) que funciona localmente sin necesidad de servidores, extensiones de navegador ni configuraciones complejas por parte del usuario.

## Características Principales

*   **Interfaz Gráfica Sencilla:** Menús claros para acceder a las diferentes funcionalidades.
*   **Gestión de Credenciales:** Guarda y carga de forma segura múltiples configuraciones de API (credenciales de cliente, MID, etc.) en el almacenamiento local del equipo.
*   **Sistema de Macros:** Ejecuta tareas completerjas con un solo clic.
    *   Recuperación de Token de Autenticación (implementado).
    *   Creación de Data Extensions, gestión de campos, etc. (preparado para implementar).
*   **Gestión de Campos de DE:** Una tabla interactiva para definir la estructura de una Data Extension.
*   **Log de Eventos en Tiempo Real:** Visualiza la petición enviada a la API y la respuesta recibida para facilitar la depuración.

## Cómo se ha Montado (Arquitectura con Electron)

Esta aplicación utiliza un stack de tecnologías web estándar, empaquetado en un contenedor de escritorio con Electron.

*   **Frontend:** HTML, CSS y JavaScript vainilla para la interfaz de usuario.
*   **Backend/Wrapper:** **Electron**, que combina un motor de renderizado (Chromium) con un entorno de ejecución de backend (**Node.js**).
*   **Persistencia de Datos:** `localStorage` para guardar las configuraciones de API y DE de forma persistente en el equipo del usuario.
*   **Empaquetado:** **Electron Packager** para compilar el código fuente en un ejecutable distribuible para Windows.

## Primeros Pasos (Para Desarrolladores)

Si quieres clonar este repositorio para modificar o contribuir al código, sigue estos pasos.

### Requisitos Previos

Asegúrate de tener instalado **Node.js** (se recomienda la versión LTS). Puedes descargarlo desde [nodejs.org](https://nodejs.org/).
Node.js incluye **npm** (Node Package Manager), que es necesario para gestionar las dependencias del proyecto.

### Instalación

1.  Clona el repositorio en tu máquina local:
    ```sh
    git clone https://github.com/TU_USUARIO/TU_REPOSITORIO.git
    ```
2.  Navega al directorio del proyecto:
    ```sh
    cd MC-API-Desktop
    ```
3.  Instala todas las dependencias (principalmente Electron):
    ```sh
    npm install
    ```

## Cómo Ejecutar la Aplicación

### Modo Desarrollo

Para ejecutar la aplicación en modo de desarrollo (lo que te permite ver los cambios en tiempo real y usar las herramientas de desarrollador), ejecuta el siguiente comando en la terminal:

```sh
npm start
```

Esto abrirá una ventana de escritorio con la aplicación en ejecución.

### Generar Versiones para Distribuir

Para empaquetar la aplicación en un fichero ejecutable (`.exe`) para que tus usuarios puedan utilizarla, ejecuta el siguiente comando:

```sh
npm run build
```

Este comando utiliza **Electron Packager** (configurado en `package.json`) y hará lo siguiente:

1.  Leerá la configuración de tu proyecto.
2.  Empaquetará todo tu código fuente y las dependencias de Electron.
3.  Creará una nueva carpeta llamada `dist` en la raíz de tu proyecto.
4.  Dentro de `dist`, generará una carpeta con el nombre de tu aplicación y la plataforma (ej: `MC-API-Helper-win32-x64`).

**Para distribuir la aplicación a tus usuarios:**

1.  Comprime la carpeta generada (ej: `MC-API-Helper-win32-x64`) en un fichero **`.zip`**.
2.  Envía ese fichero `.zip` a tus usuarios.
3.  Indícales que deben **descomprimir la carpeta** y luego ejecutar el fichero `.exe` que se encuentra dentro.

*Nota: Para generar una versión para otro sistema operativo (ej: macOS), puedes modificar el script `build` en tu `package.json`, cambiando `--platform=win32` por `--platform=darwin`.*

## Licencia

Este proyecto está bajo la Licencia MIT. Consulta el fichero `LICENSE` para más detalles.