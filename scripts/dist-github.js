// Fichero: scripts/dist-github.js
// Descripción: Lanza el workflow de release en GitHub Actions sin necesitar GitHub CLI
// (el equipo de desarrollo no permite instalar software). Si hay GH_TOKEN lo dispara por API;
// si no, abre en el navegador la página del workflow para pulsar "Run workflow".

const { exec } = require('child_process');
const { publish } = require('../package.json').build;

const WORKFLOW_FILE = 'release.yml';
const REF = 'main';
const repoPath = `${publish.owner}/${publish.repo}`;
const workflowUrl = `https://github.com/${repoPath}/actions/workflows/${WORKFLOW_FILE}`;

/**
 * Abre una URL en el navegador por defecto de Windows.
 * @param {string} url - Dirección a abrir.
 */
function openInBrowser(url) {
    exec(`start "" "${url}"`);
}

/**
 * Dispara el workflow por la API REST de GitHub (workflow_dispatch) usando GH_TOKEN.
 * @param {string} token - Token con permiso Actions: write sobre el repositorio.
 */
async function dispatchWorkflow(token) {
    const response = await fetch(`https://api.github.com/repos/${repoPath}/actions/workflows/${WORKFLOW_FILE}/dispatches`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${token}`,
            'Accept': 'application/vnd.github+json',
            'X-GitHub-Api-Version': '2022-11-28'
        },
        body: JSON.stringify({ ref: REF })
    });

    // La API responde 204 sin cuerpo cuando acepta el lanzamiento.
    if (response.status !== 204) {
        const detail = await response.text();
        throw new Error(`GitHub respondió ${response.status}: ${detail}`);
    }
    console.log(`Compilación lanzada en GitHub sobre "${REF}". Progreso: ${workflowUrl}`);
    openInBrowser(workflowUrl);
}

const token = process.env.GH_TOKEN;
if (!token) {
    console.log(`No hay GH_TOKEN en esta terminal. Abriendo ${workflowUrl}`);
    console.log(`Pulsa "Run workflow", deja la rama "${REF}" y confirma.`);
    openInBrowser(workflowUrl);
} else {
    dispatchWorkflow(token).catch(err => {
        console.error(`No se pudo lanzar el workflow: ${err.message}`);
        console.error(`Puedes lanzarlo a mano en ${workflowUrl}`);
        process.exitCode = 1;
    });
}
