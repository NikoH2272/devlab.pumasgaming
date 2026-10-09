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

const Auth = {
    get usuario() { return usuarioActual; },

    async restaurar() {
        usuarioActual = (await DB.sesionActual()) ? await DB.perfilActual() : null;
        return usuarioActual;
    },

    async iniciar(email, password) {
        await DB.login(email, password);
        const u = await DB.perfilActual();
        if (!u) {
            await DB.logout();
            throw new Error('Tu cuenta no tiene un rol asignado o está desactivada. Habla con tu administrador.');
        }
        usuarioActual = u;
        return u;
    },

    async cerrar() {
        usuarioActual = null;
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

    // Organizaciones que el usuario puede ver
    async orgsVisibles() {
        const orgs = await DB.orgs();
        if (this.esAdmin()) return orgs;
        return orgs.filter(o => o.id === usuarioActual.orgId);
    },

    // Equipos (rosters) que el usuario puede ver.
    // Admin: todos · CEO/Manager: todos los de su organización
    // Coach/Analista: solo los asignados
    async equiposVisibles() {
        const teams = await DB.equipos();
        if (this.esAdmin()) return teams;
        if (this.puede('equipo.verTodos')) return teams.filter(t => t.orgId === usuarioActual.orgId);
        return teams.filter(t => t.orgId === usuarioActual.orgId && usuarioActual.equipos.includes(t.id));
    },

    // Usuarios que el usuario puede ver/gestionar
    async usuariosVisibles() {
        const users = await DB.usuarios();
        if (this.esAdmin()) return users;
        if (['ceo', 'manager'].includes(usuarioActual.rol)) return users.filter(u => u.orgId === usuarioActual.orgId);
        // Coach: él mismo y los usuarios que creó
        return users.filter(u => u.id === usuarioActual.id || u.creadoPor === usuarioActual.id);
    },

    async puedeEditarEquipo(teamId) {
        if (!this.puede('jugador.gestionar')) return false;
        return (await this.equiposVisibles()).some(t => t.id === teamId);
    }
};
