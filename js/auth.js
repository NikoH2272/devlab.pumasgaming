// ============================================================
// PUMAS DEV LAB · Sesión, roles y permisos
// ------------------------------------------------------------
// Esto solo adapta la interfaz (qué botones se ven). La seguridad
// real la imponen las políticas RLS de supabase/schema.sql.
// ============================================================

const ROLES = {
    admin:    { nombre: 'Admin',    nivel: 5, icono: 'fa-user-shield' },
    ceo:      { nombre: 'CEO',      nivel: 4, icono: 'fa-crown' },
    manager:  { nombre: 'Manager',  nivel: 3, icono: 'fa-briefcase' },
    coach:    { nombre: 'Coach',    nivel: 2, icono: 'fa-chalkboard-user' },
    analista: { nombre: 'Analista', nivel: 1, icono: 'fa-magnifying-glass-chart' }
};

// Matriz de permisos por rol
const PERMISOS = {
    'org.crear':          ['admin'],
    'org.editar':         ['admin', 'ceo'],
    'org.ver':            ['admin', 'ceo', 'manager'],
    'ajustes.editar':     ['admin'],
    'ia.gestionar':       ['admin', 'ceo'],
    'usuario.ver':        ['admin', 'ceo', 'manager', 'coach'],
    'usuario.crear':      ['admin', 'ceo', 'coach'],
    'equipo.crear':       ['admin', 'ceo', 'coach'],
    'equipo.verTodos':    ['admin', 'ceo', 'manager'],
    'equipo.eliminar':    ['admin', 'ceo'],
    'jugador.gestionar':  ['admin', 'ceo', 'coach'],
    'partida.registrar':  ['admin', 'ceo', 'coach', 'analista'],
    'partida.eliminar':   ['admin', 'ceo', 'coach'],
    'informe.organizacion': ['admin', 'ceo', 'manager']
};

let usuarioActual = null;
let orgActivaId = null;          // la organización en la que se trabaja ahora
const CLAVE_ORG_ACTIVA = 'pumasDevLab.orgActiva';

const Auth = {
    get usuario() { return usuarioActual; },

    async restaurar() {
        usuarioActual = (await DB.sesionActual()) ? await DB.perfilActual() : null;
        if (usuarioActual) await this.elegirOrgInicial();
        return usuarioActual;
    },

    // ---------- Organización activa ----------
    // Todo (rosters, partidas, usuarios, planos) se ve SIEMPRE dentro de una
    // sola organización. Los demás roles están fijos en la suya; el admin
    // elige en cuál trabaja desde la barra superior.
    get orgActivaId() { return orgActivaId; },

    async elegirOrgInicial() {
        if (!this.esAdmin()) { orgActivaId = usuarioActual.orgId; return; }
        const orgs = await DB.orgs();
        let guardada = null;
        try { guardada = localStorage.getItem(CLAVE_ORG_ACTIVA); } catch (e) { /* sin almacenamiento */ }
        orgActivaId = (orgs.find(o => o.id === guardada) || orgs[0] || {}).id || null;
    },

    cambiarOrgActiva(id) {
        if (!this.esAdmin()) return;
        orgActivaId = id || null;
        try { localStorage.setItem(CLAVE_ORG_ACTIVA, orgActivaId || ''); } catch (e) { /* sin almacenamiento */ }
    },

    // Todas las organizaciones (solo para administrarlas y para el selector)
    async todasLasOrgs() {
        const orgs = await DB.orgs();
        return this.esAdmin() ? orgs : orgs.filter(o => o.id === usuarioActual.orgId);
    },

    async iniciar(email, password) {
        await DB.login(email, password);
        const u = await DB.perfilActual();
        if (!u) {
            await DB.logout();
            throw new Error('Tu cuenta no tiene un rol asignado o está desactivada. Habla con tu administrador.');
        }
        usuarioActual = u;
        await this.elegirOrgInicial();
        return u;
    },

    async cerrar() {
        usuarioActual = null;
        orgActivaId = null;
        await DB.logout();
    },

    async refrescar() {
        if (usuarioActual) usuarioActual = await DB.perfilActual();
    },

    puede(permiso) {
        return !!usuarioActual && (PERMISOS[permiso] || []).includes(usuarioActual.rol);
    },

    esAdmin() {
        return usuarioActual?.rol === 'admin';
    },

    // Roles que el usuario actual puede crear: siempre de nivel inferior
    // (el admin también puede crear otros admin)
    rolesCreables() {
        if (!this.puede('usuario.crear')) return [];
        const nivel = ROLES[usuarioActual.rol].nivel;
        return Object.keys(ROLES).filter(r => ROLES[r].nivel < nivel || (r === 'admin' && this.esAdmin()));
    },

    // Organización en la que se trabaja (lista de 0 o 1 elementos)
    async orgsVisibles() {
        return (await DB.orgs()).filter(o => o.id === orgActivaId);
    },

    // Equipos (rosters) que el usuario puede ver, siempre de la organización activa.
    // Admin y CEO/Manager: todos los de la organización
    // Coach/Analista: solo los asignados
    async equiposVisibles() {
        const teams = (await DB.equipos()).filter(t => t.orgId === orgActivaId);
        if (this.esAdmin()) return teams;
        if (this.puede('equipo.verTodos')) return teams.filter(t => t.orgId === usuarioActual.orgId);
        return teams.filter(t => t.orgId === usuarioActual.orgId && usuarioActual.equipos.includes(t.id));
    },

    // Usuarios que el usuario puede ver/gestionar (de la organización activa;
    // el admin también ve a los demás admins, que son globales)
    async usuariosVisibles() {
        const users = await DB.usuarios();
        if (this.esAdmin()) return users.filter(u => u.orgId === orgActivaId || u.rol === 'admin');
        if (['ceo', 'manager'].includes(usuarioActual.rol)) return users.filter(u => u.orgId === usuarioActual.orgId);
        // Coach: él mismo y los usuarios que creó
        return users.filter(u => u.id === usuarioActual.id || u.creadoPor === usuarioActual.id);
    },

    async puedeEditarEquipo(teamId) {
        if (!this.puede('jugador.gestionar')) return false;
        return (await this.equiposVisibles()).some(t => t.id === teamId);
    }
};
