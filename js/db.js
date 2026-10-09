// ============================================================
// PUMAS DEV LAB · Capa de datos (Supabase)
// ------------------------------------------------------------
// Traduce entre las tablas de supabase/schema.sql y los objetos
// que usa la interfaz. Lo que cada usuario puede leer o escribir
// lo decide la base de datos con RLS, no este archivo.
// ============================================================

const CATALOGO = {
    mapas: ['Bermuda', 'Purgatorio', 'Kalahari', 'Nexterra', 'Solara'],
    eventos: [
        { id: 'entreno', nombre: 'Entreno' },
        { id: 'torneo', nombre: 'Torneo' },
        { id: 'relampago', nombre: 'Relámpago' },
        { id: 'liga', nombre: 'Liga Profesional' }
    ],
    rolesJugador: [
        { id: 'rusher', nombre: 'Rusher' },
        { id: 'granadero', nombre: 'Granadero' },
        { id: 'soporte', nombre: 'Soporte' }
    ],
    // Zonas de caída por mapa (fuente: CAIDAS FREE FIRE.csv)
    caidas: {
        Bermuda: ["RIM NAM VILLA", "OBSERVATORIO", "HANGAR", "GRAVEYARD", "BULLSEYE", "SHYRPIARD", "KATULISTIWA", "PLANTATION", "BIMASAKTI", "RIVERSIDE", "MARS ELECTRIC", "POCHINOK", "PEAK", "CLOCK TOWER", "KOTA TUA", "SENTOSA", "CAPETOWN", "KERATON", "MILL"],
        Purgatorio: ["MOATHOUSE", "CROSSROADS", "MARBLEWORKS", "QUARY", "GOLF", "MT. VILLA", "CENTRAL", "BOMBEROS", "LUMBER MILL", "CAMPSITE", "FORGE", "SKI LODGE", "BRASILIA ALTA", "BRASILIA BAJA", "FIELS"],
        Kalahari: ["ASENTAMIENTO", "RUINAS", "LABERINTO", "C.ELEFANTE", "REFINERIA", "EL SUB", "BAHIA", "SANTUARIO", "EL CONSEJO", "RECLUSORIO", "SANTA CATARINA", "CANTO DE PIEDRA", "PUESTO DE COMANDO"],
        Nexterra: ["CENTRO DE INTELIGENCIA", "PUENTES GEMELOS", "CONSTRUCCION EN RUINAS", "CUIDAD FANTASMA", "PANTANAL", "DECAGONO", "GIMNASIO DE BOXEO", "TIROLESA", "PLAZARIA", "GRATIVACION", "INVERNADEROS", "EOLICAS", "MUSEO"],
        Solara: ["MOLINO", "ISLA DELTA", "ACUARIO", "BAHIA", "PLANTA ECOLOGICA", "FLORISTERIA", "ESTUDIO", "EL CENTRO", "CASCADA", "CENTRO HIPICO", "FERIA", "ARCOS", "TORRE DE TV", "CASA VISTA"]
    },
    // Puntos por posición, estándar de campeonato Free Fire (+1 por baja)
    puntosPosicion: { 1: 12, 2: 9, 3: 8, 4: 7, 5: 6, 6: 5, 7: 4, 8: 3, 9: 2, 10: 1, 11: 0, 12: 0 }
};

// Normaliza el nombre de usuario y lo valida
function limpiarUsuario(usuario) {
    const u = String(usuario || '').trim().toLowerCase();
    if (!/^[a-z0-9._-]{3,30}$/.test(u)) {
        throw new Error('El usuario debe tener 3 a 30 caracteres: letras, números, punto, guion o guion bajo, sin espacios.');
    }
    return u;
}

// Identificador interno que Supabase Auth necesita; el usuario nunca lo ve
function correoDe(usuario) {
    return `${limpiarUsuario(usuario)}@${DOMINIO_USUARIOS}`;
}

// Traduce los errores más comunes de Supabase al español
function errorDB(error) {
    const m = error?.message || String(error);
    if (/Invalid login credentials/i.test(m)) return new Error('Usuario o contraseña incorrectos.');
    if (/Email not confirmed|email/i.test(m)) return new Error('No se pudo iniciar sesión con ese usuario. Pide al admin que revise tu cuenta.');
    if (/profiles_usuario_key/i.test(m)) return new Error('Ese nombre de usuario ya existe.');
    if (/crear_usuario|crear_primer_admin|cambiar_password/i.test(m) && /schema cache/i.test(m)) {
        return new Error('Falta ejecutar supabase/migrations/002_usuarios_sin_correo.sql en Supabase.');
    }
    if (/row-level security|permission denied/i.test(m)) return new Error('Tu rol no tiene permiso para esta acción.');
    if (/Password should be/i.test(m)) return new Error('La contraseña debe tener al menos 8 caracteres.');
    return new Error(m);
}

async function q(promesa) {
    const { data, error } = await promesa;
    if (error) throw errorDB(error);
    return data;
}

// Reduce una imagen a JPEG para no inflar la base de datos
function comprimirImagen(file, maxAncho = 1280, calidad = 0.8) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = reject;
        reader.onload = () => {
            const img = new Image();
            img.onerror = reject;
            img.onload = () => {
                const escala = Math.min(1, maxAncho / img.width);
                const canvas = document.createElement('canvas');
                canvas.width = Math.round(img.width * escala);
                canvas.height = Math.round(img.height * escala);
                canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
                resolve(canvas.toDataURL('image/jpeg', calidad));
            };
            img.src = reader.result;
        };
        reader.readAsDataURL(file);
    });
}

// ---------- Mapeos fila de BD -> objeto de la interfaz ----------
const aUsuario = (p, staff = []) => ({
    id: p.id, nombre: p.nombre, usuario: p.usuario, email: p.email, rol: p.rol, orgId: p.org_id,
    creadoPor: p.creado_por, activo: p.activo,
    iaPermitida: p.rol === 'admin' || !!p.ia_permitida, iaLimite: p.ia_limite_diario ?? null,
    equipos: staff.filter(s => s.user_id === p.id).map(s => s.team_id)
});
const aOrg = o => ({ id: o.id, nombre: o.nombre, logo: o.logo });
const aEquipo = t => ({ id: t.id, orgId: t.org_id, nombre: t.nombre, logo: t.logo, creadoPor: t.creado_por });
const aJugador = p => ({ id: p.id, teamId: p.team_id, nick: p.nick, nombre: p.nombre || '', rol: p.rol, igl: p.igl, activo: p.activo });
const aPartida = m => ({
    id: m.id, teamId: m.team_id, fecha: m.fecha, hora: String(m.hora).slice(0, 5), mapa: m.mapa, evento: m.evento,
    posicion: m.posicion, totalEquipos: m.total_equipos, primerDerribo: m.primer_derribo, primeraCaida: m.primera_caida,
    notas: m.notas || '', caida: m.caida || null, tieneCaptura: m.tiene_captura,
    stats: (m.match_players || []).map(s => ({
        playerId: s.player_id, k: s.k, d: s.d, a: s.a, dmg: s.dmg, danoReal: s.dano_real, noqueos: s.noqueos,
        curacion: s.curacion, levantar: s.levantar, resurreccion: s.resurreccion, hs: Number(s.hs)
    }))
});

const COLS_PARTIDA = 'id, team_id, fecha, hora, mapa, evento, posicion, total_equipos, primer_derribo, primera_caida, notas, caida, tiene_captura, match_players(*)';

const DB = {
    // ---------- Sesión ----------
    async hayUsuarios() {
        return q(supabaseClient.rpc('hay_usuarios'));
    },

    async sesionActual() {
        const { data } = await supabaseClient.auth.getSession();
        return data.session;
    },

    async login(usuario, password) {
        await q(supabaseClient.auth.signInWithPassword({ email: correoDe(usuario), password }));
    },

    async logout() {
        await supabaseClient.auth.signOut();
    },

    // Perfil del usuario con sesión (null si la cuenta no tiene perfil o está inactiva)
    async perfilActual() {
        const { data: { user } } = await supabaseClient.auth.getUser();
        if (!user) return null;
        const p = await q(supabaseClient.from('profiles').select('*').eq('id', user.id).maybeSingle());
        if (!p || !p.activo) return null;
        const staff = await q(supabaseClient.from('team_staff').select('*').eq('user_id', user.id));
        return aUsuario(p, staff);
    },

    // Solo funciona mientras no exista ningún perfil; luego inicia sesión
    async crearPrimerAdmin({ nombre, usuario, password }) {
        usuario = limpiarUsuario(usuario);
        await q(supabaseClient.rpc('crear_primer_admin', { p_nombre: nombre.trim(), p_usuario: usuario, p_password: password }));
        await this.login(usuario, password);
    },

    // ---------- Usuarios ----------
    async usuarios() {
        const [perfiles, staff] = await Promise.all([
            q(supabaseClient.from('profiles').select('*').order('creado')),
            q(supabaseClient.from('team_staff').select('*'))
        ]);
        return perfiles.map(p => aUsuario(p, staff));
    },

    async usuario(id) {
        return (await this.usuarios()).find(u => u.id === id) || null;
    },

    // La base de datos crea la cuenta y valida la jerarquía de roles
    async crearUsuario({ nombre, usuario, password, rol, orgId, equipos = [] }) {
        usuario = limpiarUsuario(usuario);
        const id = await q(supabaseClient.rpc('crear_usuario', {
            p_nombre: nombre.trim(), p_usuario: usuario, p_password: password,
            p_rol: rol, p_org: orgId || null, p_equipos: equipos
        }));
        return { id, usuario };
    },

    async cambiarRol(id, rol, orgId, equipos = []) {
        await q(supabaseClient.rpc('cambiar_rol', { p_user: id, p_rol: rol, p_org: orgId || null, p_equipos: equipos }));
    },

    async cambiarPassword(id, password) {
        await q(supabaseClient.rpc('cambiar_password', { p_user: id, p_password: password }));
    },

    async setUsuarioActivo(id, activo) {
        await q(supabaseClient.rpc('set_usuario_activo', { p_user: id, p_activo: activo }));
    },

    // ---------- Ajustes (soporte, canal de WhatsApp) ----------
    async ajustes() {
        const fila = await q(supabaseClient.from('ajustes').select('*').eq('id', 1).maybeSingle());
        return {
            soporteUrl: fila?.soporte_url || '', whatsappCanalUrl: fila?.whatsapp_canal_url || '',
            iaLimiteUsuario: fila?.ia_limite_usuario ?? 10, iaLimiteGlobal: fila?.ia_limite_global ?? 200
        };
    },

    async guardarAjustes({ soporteUrl, whatsappCanalUrl, iaLimiteUsuario, iaLimiteGlobal }) {
        await q(supabaseClient.from('ajustes').update({
            soporte_url: soporteUrl || null, whatsapp_canal_url: whatsappCanalUrl || null,
            ia_limite_usuario: iaLimiteUsuario, ia_limite_global: iaLimiteGlobal,
            actualizado: new Date().toISOString()
        }).eq('id', 1));
    },

    // ---------- Lectura con IA: permisos y límites ----------
    async iaEstado() {
        return q(supabaseClient.rpc('ia_mi_estado'));
    },

    async iaConfigurarUsuario(id, permitida, limite) {
        await q(supabaseClient.rpc('ia_configurar_usuario', { p_user: id, p_permitida: permitida, p_limite: limite }));
    },

    // Lecturas de hoy (hora de Colombia) que el usuario actual puede ver, por usuario
    async iaUsosHoy() {
        const desde = new Date(Date.now() - 36 * 3600 * 1000).toISOString();
        const filas = await q(supabaseClient.from('ia_uso').select('user_id, creado, ok').gte('creado', desde));
        const hoy = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' });
        const conteo = {};
        filas.filter(f => f.ok !== false && new Date(f.creado).toLocaleDateString('en-CA', { timeZone: 'America/Bogota' }) === hoy)
            .forEach(f => { conteo[f.user_id] = (conteo[f.user_id] || 0) + 1; });
        return conteo;
    },

    // ---------- Organizaciones ----------
    async orgs() {
        return (await q(supabaseClient.from('orgs').select('*').order('creado'))).map(aOrg);
    },

    async crearOrg({ nombre, logo = null }) {
        await q(supabaseClient.from('orgs').insert({ id: crypto.randomUUID(), nombre: nombre.trim(), logo }));
    },

    async actualizarOrg(id, cambios) {
        await q(supabaseClient.from('orgs').update(cambios).eq('id', id));
    },

    // ---------- Equipos / rosters ----------
    async equipos() {
        return (await q(supabaseClient.from('teams').select('*').order('creado'))).map(aEquipo);
    },

    async crearEquipo({ orgId, nombre, logo = null, creadoPor }) {
        await q(supabaseClient.from('teams').insert({ id: crypto.randomUUID(), org_id: orgId, nombre: nombre.trim(), logo, creado_por: creadoPor }));
    },

    async actualizarEquipo(id, cambios) {
        await q(supabaseClient.from('teams').update(cambios).eq('id', id));
    },

    async eliminarEquipo(id) {
        await q(supabaseClient.from('teams').delete().eq('id', id));
    },

    // ---------- Jugadores ----------
    async jugadores(teamId) {
        let consulta = supabaseClient.from('players').select('*').order('creado');
        if (teamId) consulta = consulta.eq('team_id', teamId);
        return (await q(consulta)).map(aJugador);
    },

    async crearJugador({ teamId, nick, nombre = '', rol, igl = false }) {
        const id = crypto.randomUUID();
        await q(supabaseClient.from('players').insert({ id, team_id: teamId, nick: nick.trim(), nombre: nombre.trim() || null, rol }));
        if (igl) await this.marcarIGL(id);
    },

    async actualizarJugador(id, cambios) {
        const fila = {};
        if ('rol' in cambios) fila.rol = cambios.rol;
        if ('activo' in cambios) fila.activo = cambios.activo;
        await q(supabaseClient.from('players').update(fila).eq('id', id));
    },

    async marcarIGL(id) {
        await q(supabaseClient.rpc('marcar_igl', { p_player: id }));
    },

    // ---------- Caídas por roster ----------
    async caidas(teamIds) {
        if (teamIds && !teamIds.length) return [];
        let consulta = supabaseClient.from('caidas').select('*');
        if (teamIds) consulta = consulta.in('team_id', teamIds);
        return (await q(consulta)).map(c => ({ teamId: c.team_id, mapa: c.mapa, zona: c.zona || '', alterna: c.alterna || '', actualizado: c.actualizado }));
    },

    async guardarCaida(teamId, mapa, cambios) {
        const { data: { user } } = await supabaseClient.auth.getUser();
        await q(supabaseClient.from('caidas').upsert({
            team_id: teamId, mapa, zona: cambios.zona || null, alterna: cambios.alterna || null,
            actualizado: new Date().toISOString(), actualizado_por: user?.id || null
        }, { onConflict: 'team_id,mapa' }));
    },

    // ---------- Estrategia: planos guardados (Repisa) ----------
    // La lista no trae los datos ni el fondo (pesan); se piden al abrir
    async tableros() {
        const filas = await q(supabaseClient.from('tableros')
            .select('id, org_id, team_id, tipo, nombre, mapa, miniatura, creado_por, actualizado')
            .order('actualizado', { ascending: false }));
        return filas.map(t => ({
            id: t.id, orgId: t.org_id, teamId: t.team_id, tipo: t.tipo, nombre: t.nombre, mapa: t.mapa,
            miniatura: t.miniatura, creadoPor: t.creado_por, actualizado: t.actualizado
        }));
    },

    async tablero(id) {
        const t = await q(supabaseClient.from('tableros').select('*').eq('id', id).single());
        return {
            id: t.id, orgId: t.org_id, teamId: t.team_id, tipo: t.tipo, nombre: t.nombre, mapa: t.mapa,
            fondo: t.fondo, datos: t.datos, creadoPor: t.creado_por, actualizado: t.actualizado
        };
    },

    async guardarTablero(t) {
        const fila = {
            org_id: t.orgId, team_id: t.teamId, tipo: t.tipo, nombre: t.nombre, mapa: t.mapa,
            fondo: t.fondo, miniatura: t.miniatura, datos: t.datos, actualizado: new Date().toISOString()
        };
        if (t.id) {
            await q(supabaseClient.from('tableros').update(fila).eq('id', t.id));
            return t.id;
        }
        const { data: { user } } = await supabaseClient.auth.getUser();
        const id = crypto.randomUUID();
        await q(supabaseClient.from('tableros').insert({ id, ...fila, creado_por: user.id }));
        return id;
    },

    async eliminarTablero(id) {
        await q(supabaseClient.from('tableros').delete().eq('id', id));
    },

    // Imagen de fondo de cada mapa, compartida por la organización
    async mapaImagen(orgId, mapa) {
        const fila = await q(supabaseClient.from('mapas_imagenes').select('imagen').eq('org_id', orgId).eq('mapa', mapa).maybeSingle());
        return fila?.imagen || null;
    },

    async guardarMapaImagen(orgId, mapa, imagen) {
        await q(supabaseClient.from('mapas_imagenes').upsert(
            { org_id: orgId, mapa, imagen, actualizado: new Date().toISOString() }, { onConflict: 'org_id,mapa' }));
    },

    // ---------- Partidas ----------
    // No trae la imagen de la captura (pesa); se pide aparte con captura(id)
    async partidas(teamIds) {
        if (teamIds && !teamIds.length) return [];
        let consulta = supabaseClient.from('matches').select(COLS_PARTIDA).order('fecha').order('hora');
        if (teamIds) consulta = consulta.in('team_id', teamIds);
        return (await q(consulta)).map(aPartida);
    },

    async captura(id) {
        const fila = await q(supabaseClient.from('matches').select('captura').eq('id', id).maybeSingle());
        return fila?.captura || null;
    },

    async crearPartida(p) {
        const id = crypto.randomUUID();
        await q(supabaseClient.from('matches').insert({
            id, team_id: p.teamId, fecha: p.fecha, hora: p.hora, mapa: p.mapa, evento: p.evento,
            posicion: p.posicion, total_equipos: p.totalEquipos,
            primer_derribo: p.primerDerribo, primera_caida: p.primeraCaida,
            notas: p.notas || null, caida: p.caida || null, captura: p.captura || null, creado_por: p.creadoPor
        }));
        try {
            await q(supabaseClient.from('match_players').insert(p.stats.map(s => ({
                match_id: id, player_id: s.playerId, k: s.k, d: s.d, a: s.a, dmg: s.dmg, dano_real: s.danoReal,
                noqueos: s.noqueos, curacion: s.curacion, levantar: s.levantar, resurreccion: s.resurreccion, hs: s.hs
            }))));
        } catch (err) {
            // No dejar una partida sin estadísticas
            await supabaseClient.from('matches').delete().eq('id', id);
            throw err;
        }
    },

    async eliminarPartida(id) {
        await q(supabaseClient.from('matches').delete().eq('id', id));
    }
};
