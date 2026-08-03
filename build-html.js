// Fichero: build-html.js
// Descripción: Un script para combinar los ficheros HTML de las vistas
// en un único index.html para que la aplicación Electron lo pueda cargar.

const fs = require('fs');
const path = require('path');

const viewsDir = path.join(__dirname, 'src', 'renderer', 'views');
const shellPath = path.join(__dirname, 'src', 'renderer', 'index.html.template'); // Usaremos una plantilla
const finalIndexPath = path.join(__dirname, 'src', 'renderer', 'index.html');
const injectionMarker = '<!-- VIEWS WILL BE INJECTED HERE -->';

console.log('Iniciando la construcción del fichero HTML principal...');

// 1. La plantilla base es obligatoria. Si no existe, abortamos con un error claro
//    en lugar de renombrar el index.html generado (comportamiento que podría
//    destruir la plantilla si esta se borra por accidente).
if (!fs.existsSync(shellPath)) {
    console.error('ERROR: No se encuentra la plantilla "src/renderer/index.html.template".');
    console.error('Este fichero es obligatorio para construir el index.html final. Recupéralo (por ejemplo desde el control de versiones) y vuelve a ejecutar el script.');
    process.exit(1);
}

// 2. Lee la plantilla base (el shell).
const shellContent = fs.readFileSync(shellPath, 'utf8');

// 3. Lee todos los ficheros de la carpeta /views.
const viewFiles = fs.readdirSync(viewsDir).filter(file => file.endsWith('.html'));
let injectedHtml = '';

console.log(`Se encontraron ${viewFiles.length} vistas para inyectar...`);

for (const file of viewFiles) {
    const filePath = path.join(viewsDir, file);
    const fileContent = fs.readFileSync(filePath, 'utf8');
    injectedHtml += fileContent + '\n\n';
    console.log(` - Inyectando: ${file}`);
}

// 4. Reemplaza el marcador en la plantilla con el contenido de todas las vistas.
const finalHtml = shellContent.replace(injectionMarker, injectedHtml);

// 5. Escribe el nuevo fichero index.html final.
fs.writeFileSync(finalIndexPath, finalHtml, 'utf8');

console.log('\n¡Éxito! El fichero "index.html" ha sido construido correctamente.');
console.log('Ahora puedes iniciar la aplicación con "npm start".');