// Fichero: src/renderer/components/audit/audit-users.js
// Descripción: Pestaña "Usuarios" de la auditoría. Analiza estado de cuentas, check API,
// actividad de login por año, roles y usuarios sin roles. Además rellena el mapa de usuarios
// compartido (audit-state.registerUsers) que usan otras pestañas para resolver propietarios.
//
// Patrón: los módulos de pestaña importan directamente de audit-ui (render) y audit-state
// (drill/PDF/contadores). Se elige import directo en vez de pasar un ctx porque los módulos ES
// son singletons: todas las pestañas comparten el mismo estado sin tener que arrastrar un
// objeto de helpers por parámetro (audit-content.js se ha adaptado a este mismo patrón).

import * as mcApiService from '../../api/mc-api-service.js';
import {
    AUDIT_PALETTE, formatDate,
    buildTabWrapper, buildKpiRow, buildGrid, buildMetricCard, renderCallouts,
} from './audit-ui.js';
import {
    registerDrill, addDrillRow, registerPdfData, registerUsers, incApiCalls,
} from './audit-state.js';

/**
 * Ejecuta la auditoría de usuarios y pinta la pestaña.
 * @param {object} apiConfig - Configuración autenticada para llamar a la API de SFMC.
 */
export async function auditUsers(apiConfig) {
    incApiCalls();
    const users = await mcApiService.fetchAllUsers(apiConfig);
    const total = users.length;
    const currentYear = new Date().getFullYear();
    const now = new Date();
    const threeMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 3, now.getDate());

    // Construir mapa para cruce en secciones posteriores (propietarios de automatismos, DEs…)
    registerUsers(users);

    let noRolesCount = 0;
    let activeCount = 0, inactiveCount = 0, apiCheckCount = 0;
    let inactiveOver3Months = 0, activeUsersForLogin = 0;
    const loginByYear = {};
    for (let y = currentYear; y >= currentYear - 3; y--) {
        loginByYear[String(y)] = 0;
        registerDrill(`users_login_${y}`, `Login en el año ${y}`,
            ['Nombre', 'Usuario', 'Email', 'Último Login']);
    }
    loginByYear['Más antiguos'] = 0;
    const roles = {};

    registerDrill('users_total',       'Total Usuarios',                    ['Nombre', 'Usuario', 'Email', 'Estado', 'API User', 'Último Login', 'Fecha Creación', 'Roles']);
    registerDrill('users_active',      'Usuarios Activos',                  ['Nombre', 'Usuario', 'Email', 'Último Login', 'Roles']);
    registerDrill('users_inactive',    'Usuarios Inactivos',                ['Nombre', 'Usuario', 'Email', 'Último Login', 'Fecha Creación']);
    registerDrill('users_api',         'Con check API User',                ['Nombre', 'Usuario', 'Email', 'Estado']);
    registerDrill('users_api_no',      'Sin check API User',                ['Nombre', 'Usuario', 'Email', 'Estado']);
    registerDrill('users_inactive_3m', 'Sin actividad reciente (>3 meses)', ['Nombre', 'Usuario', 'Email', 'Último Login']);
    registerDrill('users_login_old',   'Login en años anteriores',          ['Nombre', 'Usuario', 'Email', 'Último Login']);
    registerDrill('users_no_roles', 'Usuarios sin roles asignados', ['Nombre', 'Usuario', 'Email', 'Estado', 'API User']);

    users.forEach(u => {
        const uLogin   = formatDate(u.lastLogin);
        const uCreated = formatDate(u.createdDate);
        const uRoles   = (u.roles || []).map(r => r.name).join(' | ');
        const uState   = u.isActive ? 'Activo' : 'Inactivo';
        const uApi     = u.isApi ? 'Sí' : 'No';

        addDrillRow('users_total', [u.name, u.userName, u.email, uState, uApi, uLogin, uCreated, uRoles]);

        if (u.isActive) {
            activeCount++; activeUsersForLogin++;
            addDrillRow('users_active', [u.name, u.userName, u.email, uLogin, uRoles]);

            if (!u.lastLogin || u.lastLogin.startsWith('0001')) {
                inactiveOver3Months++;
                addDrillRow('users_inactive_3m', [u.name, u.userName, u.email, 'Nunca / Sin registro']);
            } else {
                const loginDate = new Date(u.lastLogin);
                if (loginDate < threeMonthsAgo) {
                    inactiveOver3Months++;
                    addDrillRow('users_inactive_3m', [u.name, u.userName, u.email, uLogin]);
                }
                const yearKey = String(loginDate.getFullYear());
                if (loginByYear.hasOwnProperty(yearKey)) {
                    loginByYear[yearKey]++;
                    addDrillRow(`users_login_${yearKey}`, [u.name, u.userName, u.email, uLogin]);
                } else {
                    loginByYear['Más antiguos']++;
                    addDrillRow('users_login_old', [u.name, u.userName, u.email, uLogin]);
                }
            }
        } else {
            inactiveCount++;
            addDrillRow('users_inactive', [u.name, u.userName, u.email, uLogin, uCreated]);
        }

        if (u.isApi) { apiCheckCount++; addDrillRow('users_api', [u.name, u.userName, u.email, uState]); }
        else          addDrillRow('users_api_no', [u.name, u.userName, u.email, uState]);

        (u.roles || []).forEach(r => {
            roles[r.name] = (roles[r.name] || 0) + 1;
            const dKey = `users_role_${r.name.replace(/[^a-z0-9]/gi, '')}`;
            registerDrill(dKey, `Usuarios con rol: ${r.name}`, ['Nombre', 'Usuario', 'Email', 'Estado']);
            addDrillRow(dKey, [u.name, u.userName, u.email, uState]);
        });
        if ((u.roles || []).length === 0) {
            noRolesCount++;
            addDrillRow('users_no_roles', [u.name, u.userName, u.email, uState, uApi]);
        }
    });

    const inactiveOver3Pct = activeUsersForLogin > 0
        ? Math.round((inactiveOver3Months / activeUsersForLogin) * 100) : 0;
    const inactivePct = total > 0 ? Math.round((inactiveCount / total) * 100) : 0;

    // Callouts como objetos {type, title, message}: se pintan con renderCallouts y se pasan
    // tal cual al PDF (que resuelve el color por 'type'), sin parsear HTML.
    const callouts = [];
    if (inactiveOver3Pct > 20) callouts.push({ type: 'danger', title: 'Cuentas activas sin actividad reciente',
        message: `El ${inactiveOver3Pct}% de los usuarios activos llevan más de 3 meses sin conectarse. Valorar deshabilitar esas cuentas para reducir la superficie de acceso.` });
    if (inactivePct > 40) callouts.push({ type: 'warning', title: 'Alta proporción de cuentas inactivas',
        message: `El ${inactivePct}% de las cuentas están deshabilitadas. Puede indicar limpieza de instancia pendiente.` });
    if (noRolesCount > 0) callouts.push({ type: 'info', title: 'Usuarios sin roles asignados',
        message: `${noRolesCount} usuario${noRolesCount > 1 ? 's' : ''} no tienen ningún rol asignado. Revisar si son cuentas activas que necesitan configuración.` });

    const loginBars = Object.keys(loginByYear)
        .sort((a, b) => { if (a === 'Más antiguos') return 1; if (b === 'Más antiguos') return -1; return parseInt(b) - parseInt(a); })
        .map(label => {
            const value = loginByYear[label];
            // Degradado semántico: año actual verde, año anterior azul, antiguos naranja→rojo
            const color = label === String(currentYear)   ? AUDIT_PALETTE.green
                : label === String(currentYear - 1)       ? AUDIT_PALETTE.blueDark
                : label === String(currentYear - 2)       ? AUDIT_PALETTE.orange
                : label === String(currentYear - 3)       ? AUDIT_PALETTE.orange
                : AUDIT_PALETTE.red;
            const dKey = label === 'Más antiguos' ? 'users_login_old' : `users_login_${label}`;
            return { label: `Login en ${label === 'Más antiguos' ? 'años anteriores' : label}`, value, total: activeUsersForLogin, color, drillKey: dKey };
        });

    const kpis = [
        { value: total,               label: 'Total Usuarios',       color: AUDIT_PALETTE.blue,   drillKey: 'users_total' },
        { value: activeCount,         label: 'Activos',              color: AUDIT_PALETTE.green,  drillKey: 'users_active' },
        { value: inactiveCount,       label: 'Inactivos',            color: AUDIT_PALETTE.gray,   drillKey: 'users_inactive' },
        { value: apiCheckCount,       label: 'Con check "API User"', color: AUDIT_PALETTE.purple, drillKey: 'users_api' },
        { value: inactiveOver3Months, label: 'Sin login >3 meses',   color: inactiveOver3Pct > 20 ? AUDIT_PALETTE.red : AUDIT_PALETTE.orange, drillKey: 'users_inactive_3m' },
        { value: noRolesCount, label: 'Sin roles asignados', color: noRolesCount > 0 ? AUDIT_PALETTE.orange : AUDIT_PALETTE.gray, drillKey: 'users_no_roles' },
    ];

    const cards = [
        { title: 'Estado de cuentas', help: 'Usuarios activos e inactivos.', bars: [
            { label: 'Activos',   value: activeCount,   total, color: AUDIT_PALETTE.green, drillKey: 'users_active' },
            { label: 'Inactivos', value: inactiveCount, total, color: AUDIT_PALETTE.gray,  drillKey: 'users_inactive' },
        ]},
        { title: 'Check "API User"', help: 'Usuarios con el check API habilitado en su perfil.', bars: [
            { label: 'Con check API', value: apiCheckCount,         total, color: AUDIT_PALETTE.purple, drillKey: 'users_api' },
            { label: 'Sin check API', value: total - apiCheckCount, total, color: AUDIT_PALETTE.blue,   drillKey: 'users_api_no' },
        ]},
        { title: 'Usuarios sin roles', help: 'Usuarios que no tienen ningún rol asignado. Pueden ser cuentas huérfanas o pendientes de configurar.', bars: [
            { label: 'Con roles',    value: total - noRolesCount, total, color: AUDIT_PALETTE.green },
            { label: 'Sin roles',    value: noRolesCount,         total, color: AUDIT_PALETTE.orange, drillKey: 'users_no_roles' },
        ]},
        { title: 'Actividad de login (usuarios activos)', help: `Base: ${activeUsersForLogin} activos. Último login registrado para detectar cuentas realmente en uso.`, bars: loginBars },
        { title: 'Top roles asignados', help: 'Roles más frecuentes para evaluar la distribución de permisos.', bars:
            Object.entries(roles).sort((a, b) => b[1] - a[1]).map(([label, value]) => ({
                label, value, total, drillKey: `users_role_${label.replace(/[^a-z0-9]/gi, '')}`,
            }))
        },
    ];

    registerPdfData('users', kpis, cards, callouts);
    document.getElementById('audit-tab-users').innerHTML = buildTabWrapper(
        buildKpiRow(kpis) + renderCallouts(callouts) + buildGrid(cards.map(c => buildMetricCard(c.title, c.help, c.bars, { wide: c.wide })))
    );
}
