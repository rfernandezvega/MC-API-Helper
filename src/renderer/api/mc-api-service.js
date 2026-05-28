// ===================================================================
// Fichero: mc-api-service.js
// Descripción: Fachada unificada que agrupa todos los sub-módulos.
// Al usar esta estructura, no rompemos ninguna importación en los
// componentes del frontend que ya llaman a este archivo.
// ===================================================================

// Exportaciones del núcleo (Logs y Helpers)
export { setLogger } from './api-core.js';
export { folderPathCache, getFolderPath } from './api-helpers.js';

// Exportaciones de los submódulos funcionales
export * from './api-activities.js';
export * from './api-automations.js';
export * from './api-content.js';
export * from './api-core.js';
export * from './api-data-extensions.js';
export * from './api-folders.js';
export * from './api-helpers.js';
export * from './api-journeys.js';
export * from './api-queries.js';
export * from './api-send-management.js';
export * from './api-subscribers.js';
export * from './api-users.js';
export * from './api-validators.js';