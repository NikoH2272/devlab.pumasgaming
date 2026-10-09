// ============================================================
// PUMAS DEV LAB · Interfaz
// ============================================================

const $ = sel => document.querySelector(sel);
const $$ = sel => Array.from(document.querySelectorAll(sel));

function esc(v) {
    return String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
const fmt = (n, d = 1) => (n === null || n === undefined || isNaN(n)) ? '—' : Number(n).toFixed(d);
const pct = (n, d = 0) => (n === null || n === undefined || isNaN(n)) ? '—' : (n * 100).toFixed(d) + '%';
const nombreEvento = id => (CATALOGO.eventos.find(e => e.id === id) || {}).nombre || id;
const nombreRolJugador = id => (CATALOGO.rolesJugador.find(r => r.id === id) || {}).nombre || id;

function toast(msg, tipo = 'ok') {
    const t = document.createElement('div');
    t.className = 'toast toast-' + tipo;
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 3500);
}

function logoHTML(src, nombre, clase = 'logo-mini') {
    return src
        ? `<img src="${esc(src)}" alt="Logo ${esc(nombre)}" class="${clase}">`
        : `<span class="${clase} logo-vacio">${esc((nombre || '?').slice(0, 2).toUpperCase())}</span>`;
}

async function leerLogo(input) {
    const f = input.files && input.files[0];
    return f ? comprimirImagen(f, 256, 0.85) : null;
}

// ============================================================
// Arranque y sesión
// ============================================================
async function iniciarApp() {
    if (!supabaseClient) return mostrarErrorArranque('No se pudo cargar la librería de Supabase. Revisa tu conexión a internet.');
    try {
        if (!(await DB.hayUsuarios())) return mostrarPantalla('setup');
        if (await Auth.restaurar()) return entrar();
        mostrarPantalla('login');
    } catch (err) {
        mostrarErrorArranque(/hay_usuarios|function|schema cache/i.test(err.message)
            ? 'La base de datos no está configurada. Ejecuta supabase/schema.sql en el SQL Editor de Supabase.'
            : 'No hay conexión con la base de datos: ' + err.message);
    }
}

function mostrarErrorArranque(msg) {
    mostrarPantalla('login');
    $('#login-aviso').textContent = msg;
    $('#login-aviso').hidden = false;
}

function mostrarPantalla(cual) {
    $('#pantalla-setup').hidden = cual !== 'setup';
    $('#pantalla-login').hidden = cual !== 'login';
    $('#app-shell').hidden = cual !== 'app';
}

async function onSetup(e) {
    e.preventDefault();
    const f = e.target;
    if (f.password.value !== f.password2.value) return toast('Las contraseñas no coinciden.', 'error');
    const btn = f.querySelector('button[type="submit"]');
    btn.disabled = true;
    try {
        await DB.crearPrimerAdmin({ nombre: f.nombre.value, usuario: f.usuario.value, password: f.password.value });
        await Auth.restaurar();
        toast('Administrador creado.');
        entrar();
    } catch (err) {
        toast(err.message, 'error');
    } finally {
        btn.disabled = false;
    }
}

async function onLogin(e) {
    e.preventDefault();
    const f = e.target;
    try {
        await Auth.iniciar(f.usuario.value, f.password.value);
        f.reset();
        entrar();
    } catch (err) { toast(err.message, 'error'); }
}

async function cerrarSesion() {
    await Auth.cerrar();
    mostrarPantalla('login');
}

function entrar() {
    mostrarPantalla('app');
    const u = Auth.usuario;
    $('#user-chip').innerHTML = `<strong>${esc(u.nombre)}</strong><small>@${esc(u.usuario)} · ${ROLES[u.rol].nombre}</small>`;
    $('#tb-usuario').innerHTML = `<i class="fa-solid ${ROLES[u.rol].icono}"></i> ${esc(u.nombre)} <span class="rol-tag rol-${u.rol}">${ROLES[u.rol].nombre}</span>`;
    // Mostrar solo lo que el rol puede usar
    $$('[data-permiso]').forEach(el => { el.hidden = !Auth.puede(el.dataset.permiso); });
    // Módulos apagados en js/config.js
    $$('[data-modulo]').forEach(el => { if (!MODULOS[el.dataset.modulo]) el.hidden = true; });
    aplicarBotonesAyuda();
    irA('inicio');
}

// Botones de soporte y canal de WhatsApp (los configura el admin en Ajustes)
async function aplicarBotonesAyuda() {
    try {
        const a = await DB.ajustes();
        enlazar('#btn-soporte', a.soporteUrl);
        enlazar('#btn-whatsapp', a.whatsappCanalUrl);
    } catch (err) { /* sin ajustes, los botones quedan ocultos */ }
}

function enlazar(sel, url) {
    const el = $(sel);
    const valido = esUrlSegura(url);
    el.hidden = !valido;
    if (valido) el.href = url;
}

function esUrlSegura(url) {
    try { return ['https:', 'http:'].includes(new URL(url).protocol); } catch (e) { return false; }
}

// ============================================================
// Navegación
// ============================================================
const RENDER_VISTA = {
    'inicio': renderPanel,
    'vista-org': renderOrganizaciones,
    'vista-usuarios': renderUsuarios,
    'vista-equipos': renderEquipos,
    'vista-partida': renderRegistroPartida,
    'vista-informe': renderFiltrosInforme,
    'vista-caidas': renderCaidas,
    'vista-repisa': renderRepisa,
    'vista-ajustes': renderAjustes
};

function irA(vista) {
    $$('.view-section').forEach(el => el.classList.remove('active-view'));
    const target = document.getElementById(vista);
    if (target) target.classList.add('active-view');
    $$('.sb-nav > button').forEach(b => b.classList.toggle('activo', b.dataset.vista === vista));
    $$('.sb-sub').forEach(g => g.classList.toggle('abierto', g.dataset.grupo === vista));
    closeMenu();
    window.scrollTo({ top: 0, behavior: 'smooth' });
    const render = RENDER_VISTA[vista];
    return render ? render().catch(err => toast(err.message, 'error')) : Promise.resolve();
}

// Abre el informe y baja a una de sus secciones
async function irAInforme(idSeccion) {
    if (!$('#vista-informe').classList.contains('active-view')) await irA('vista-informe');
    closeMenu();
    const el = document.getElementById(idSeccion);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// Compatibilidad con los módulos anteriores
function volverInicio() { irA('inicio'); }
function mostrarSeccion(moduloId, subSeccionId) {
    irA(moduloId);
    $$('.sub-seccion-content, .tool-container').forEach(el => el.classList.remove('sub-seccion-highlight'));
    const sub = subSeccionId && document.getElementById(subSeccionId);
    if (sub) sub.classList.add('sub-seccion-highlight');
}
function toggleMenu() { document.body.classList.toggle('sb-abierto'); }
function closeMenu() { document.body.classList.remove('sb-abierto'); }

function colapsarMenu() {
    const colapsado = document.body.classList.toggle('sb-colapsado');
    try { localStorage.setItem('pumasDevLab.menuColapsado', colapsado ? '1' : ''); } catch (e) { /* sin almacenamiento */ }
}

// ============================================================
// Panel de inicio
// ============================================================
async function renderPanel() {
    const u = Auth.usuario;
    const orgs = await Auth.orgsVisibles();
    const equipos = await Auth.equiposVisibles();
    const partidas = await DB.partidas(equipos.map(t => t.id));
    const jugadores = (await DB.jugadores()).filter(p => equipos.some(t => t.id === p.teamId));
    const org = orgs.find(o => o.id === u.orgId);

    $('#panel-bienvenida').innerHTML = `
        <div class="bienvenida">
            ${org ? logoHTML(org.logo, org.nombre, 'logo-grande') : ''}
            <div>
                <h1>Hola, <span style="color: var(--primary);">${esc(u.nombre)}</span></h1>
                <p>${ROLES[u.rol].nombre}${org ? ' · ' + esc(org.nombre) : ' · Acceso global'}</p>
            </div>
        </div>`;

    $('#panel-kpis').innerHTML = [
        ['fa-sitemap', 'Organizaciones', orgs.length],
        ['fa-people-group', 'Rosters visibles', equipos.length],
        ['fa-user-ninja', 'Jugadores', jugadores.length],
        ['fa-gamepad', 'Partidas registradas', partidas.length]
    ].map(([i, t, v]) => `<div class="card-box"><i class="fa-solid ${i}"></i><h3>${t}</h3><p class="kpi-num">${v}</p></div>`).join('');

    const pasos = [];
    if (Auth.puede('org.crear') && !orgs.length) pasos.push(['vista-org', 'Crea la organización (ej. Pumas Gaming)']);
    if (Auth.puede('usuario.crear')) pasos.push(['vista-usuarios', 'Crea los usuarios del staff']);
    if (Auth.puede('equipo.crear') && !equipos.length) pasos.push(['vista-equipos', 'Crea tu primer roster y registra jugadores']);
    if (Auth.puede('partida.registrar') && equipos.length) pasos.push(['vista-partida', 'Registra una partida']);
    if (partidas.length) pasos.push(['vista-informe', 'Ver el informe de rendimiento']);
    $('#panel-pasos').innerHTML = pasos.map(([v, t]) =>
        `<button onclick="irA('${v}')"><i class="fa-solid fa-angle-right"></i> ${t}</button>`).join('');
}

// ============================================================
// Caídas por roster
// ============================================================
async function renderCaidas() {
    const teams = await Auth.equiposVisibles();
    const caidas = await DB.caidas(teams.map(t => t.id));
    const editables = {};
    for (const t of teams) editables[t.id] = await Auth.puedeEditarEquipo(t.id);
    const de = (teamId, mapa) => caidas.find(c => c.teamId === teamId && c.mapa === mapa) || { zona: '', alterna: '' };

    if (!teams.length) {
        $('#tabla-caidas').innerHTML = '<p class="vacio">No tienes rosters visibles todavía.</p>';
        $('#alertas-caidas').innerHTML = '';
        return;
    }

    const opciones = (mapa, actual, vacio) => `<option value="">${vacio}</option>` +
        CATALOGO.caidas[mapa].map(z => `<option value="${esc(z)}" ${z === actual ? 'selected' : ''}>${esc(z)}</option>`).join('');

    $('#tabla-caidas').innerHTML = `
        <div class="tabla-scroll"><table class="tabla-datos tabla-caidas">
            <thead><tr><th>Roster</th>${CATALOGO.mapas.map(m => `<th>${m}</th>`).join('')}</tr></thead>
            <tbody>${teams.map(t => `
                <tr>
                    <td>${logoHTML(t.logo, t.nombre, 'logo-mini')} <strong>${esc(t.nombre)}</strong></td>
                    ${CATALOGO.mapas.map(m => {
                        const c = de(t.id, m);
                        return editables[t.id] ? `
                        <td>
                            <select aria-label="Caída principal ${esc(t.nombre)} ${m}" onchange="guardarCaida('${t.id}', '${m}', 'zona', this.value)">${opciones(m, c.zona, '— Principal —')}</select>
                            <select class="alterna" aria-label="Caída alterna ${esc(t.nombre)} ${m}" onchange="guardarCaida('${t.id}', '${m}', 'alterna', this.value)">${opciones(m, c.alterna, '— Alterna —')}</select>
                        </td>` : `
                        <td><strong>${esc(c.zona || '—')}</strong>${c.alterna ? `<br><small>Alterna: ${esc(c.alterna)}</small>` : ''}</td>`;
                    }).join('')}
                </tr>`).join('')}
            </tbody>
        </table></div>`;

    // Dos rosters de la misma organización cayendo en la misma zona se quitan puntos entre sí
    const choques = [];
    CATALOGO.mapas.forEach(m => {
        const porZona = {};
        teams.forEach(t => {
            const z = de(t.id, m).zona;
            if (z) (porZona[`${t.orgId}|${z}`] = porZona[`${t.orgId}|${z}`] || []).push(t.nombre);
        });
        Object.entries(porZona).filter(([, n]) => n.length > 1)
            .forEach(([k, n]) => choques.push(`${m} · ${k.split('|')[1]}: ${n.join(', ')}`));
    });
    $('#alertas-caidas').innerHTML = choques.length ? `
        <div class="nota nota-alerta">
            <i class="fa-solid fa-triangle-exclamation"></i>
            <div><strong>Rosters de la organización con la misma caída</strong><p>${choques.map(esc).join('<br>')}</p></div>
        </div>` : '';
}

async function guardarCaida(teamId, mapa, campo, valor) {
    try {
        const actual = (await DB.caidas([teamId])).find(c => c.mapa === mapa) || { zona: '', alterna: '' };
        await DB.guardarCaida(teamId, mapa, { ...actual, [campo]: valor });
        toast('Caída guardada.');
        renderCaidas();
    } catch (err) { toast(err.message, 'error'); }
}

// ============================================================
// Ajustes (solo admin)
// ============================================================
async function renderAjustes() {
    const a = await DB.ajustes();
    const f = $('#form-ajustes');
    f.soporteUrl.value = a.soporteUrl;
    f.whatsappCanalUrl.value = a.whatsappCanalUrl;
    f.iaLimiteUsuario.value = a.iaLimiteUsuario;
    f.iaLimiteGlobal.value = a.iaLimiteGlobal;
    try {
        const usos = await DB.iaUsosHoy();
        $('#ia-uso-total').textContent = `Hoy se han hecho ${Stats.sum(Object.values(usos))} lecturas en toda la plataforma.`;
    } catch (err) {
        $('#ia-uso-total').textContent = 'Ejecuta la migración 004_limites_ia.sql para activar los límites.';
    }
}

async function onGuardarAjustes(e) {
    e.preventDefault();
    const f = e.target;
    const datos = {
        soporteUrl: f.soporteUrl.value.trim(), whatsappCanalUrl: f.whatsappCanalUrl.value.trim(),
        iaLimiteUsuario: Number(f.iaLimiteUsuario.value) || 0, iaLimiteGlobal: Number(f.iaLimiteGlobal.value) || 0
    };
    if ((datos.soporteUrl && !esUrlSegura(datos.soporteUrl)) || (datos.whatsappCanalUrl && !esUrlSegura(datos.whatsappCanalUrl))) {
        return toast('Los enlaces deben empezar por https://', 'error');
    }
    try {
        await DB.guardarAjustes(datos);
        await aplicarBotonesAyuda();
        toast('Ajustes guardados.');
    } catch (err) { toast(err.message, 'error'); }
}

// ============================================================
// Organizaciones
// ============================================================
async function renderOrganizaciones() {
    const orgs = await Auth.orgsVisibles();
    const users = await DB.usuarios();
    const teams = await DB.equipos();
    $('#form-org').hidden = !Auth.puede('org.crear');
    $('#lista-orgs').innerHTML = orgs.length ? orgs.map(o => `
        <div class="card-box fila-entidad">
            ${logoHTML(o.logo, o.nombre, 'logo-medio')}
            <div class="fila-info">
                <h3>${esc(o.nombre)}</h3>
                <p>${users.filter(u => u.orgId === o.id).length} usuarios · ${teams.filter(t => t.orgId === o.id).length} rosters</p>
            </div>
            ${Auth.puede('org.editar') ? `
            <label class="btn-sec">
                <i class="fa-solid fa-image"></i> Cambiar logo
                <input type="file" accept="image/*" hidden onchange="cambiarLogoOrg('${o.id}', this)">
            </label>` : ''}
        </div>`).join('') : '<p class="vacio">Aún no hay organizaciones.</p>';
}

async function onCrearOrg(e) {
    e.preventDefault();
    const f = e.target;
    try {
        await DB.crearOrg({ nombre: f.nombre.value, logo: await leerLogo(f.logo) });
        f.reset();
        toast('Organización creada.');
        renderOrganizaciones();
    } catch (err) { toast(err.message, 'error'); }
}

async function cambiarLogoOrg(id, input) {
    try {
        await DB.actualizarOrg(id, { logo: await leerLogo(input) });
        toast('Logo actualizado.');
        renderOrganizaciones();
    } catch (err) { toast(err.message, 'error'); }
}

// ============================================================
// Usuarios
// ============================================================
async function renderUsuarios() {
    const u = Auth.usuario;
    const form = $('#form-usuario');
    form.hidden = !Auth.puede('usuario.crear');
    if (!form.hidden) {
        form.rol.innerHTML = Auth.rolesCreables().map(r => `<option value="${r}">${ROLES[r].nombre}</option>`).join('');
        const orgs = await Auth.orgsVisibles();
        form.orgId.innerHTML = orgs.map(o => `<option value="${o.id}">${esc(o.nombre)}</option>`).join('');
        form.orgId.disabled = !Auth.esAdmin();
        if (!Auth.esAdmin()) form.orgId.value = u.orgId;
        await actualizarAsignacionEquipos();
    }

    const users = await Auth.usuariosVisibles();
    const orgs = await DB.orgs();
    const teams = await DB.equipos();
    let usosIA = {}, limiteIA = 10;
    try {
        usosIA = await DB.iaUsosHoy();
        limiteIA = (await DB.ajustes()).iaLimiteUsuario;
    } catch (err) { /* migración 004 pendiente */ }
    $('#lista-usuarios').innerHTML = `
        <div class="tabla-scroll"><table class="tabla-datos">
            <thead><tr><th>Nombre</th><th>Usuario</th><th>Rol</th><th>Organización</th><th>Rosters asignados</th><th>Lectura con IA</th><th>Estado</th><th></th></tr></thead>
            <tbody>${users.map(x => `
                <tr>
                    <td>${esc(x.nombre)}</td>
                    <td>@${esc(x.usuario)}</td>
                    <td><span class="rol-tag rol-${x.rol}">${ROLES[x.rol].nombre}</span></td>
                    <td>${esc((orgs.find(o => o.id === x.orgId) || {}).nombre || 'Global')}</td>
                    <td>${['coach', 'analista'].includes(x.rol) ? (x.equipos.map(id => esc((teams.find(t => t.id === id) || {}).nombre || '')).filter(Boolean).join(', ') || '—') : 'Todos'}</td>
                    <td>${celdaIA(x, usosIA, limiteIA)}</td>
                    <td>${x.activo ? 'Activo' : 'Inactivo'}</td>
                    <td class="acciones">${puedeGestionarUsuario(x) || x.id === Auth.usuario.id ? `<button class="btn-link" onclick="cambiarPasswordUsuario('${x.id}', '${esc(x.usuario)}')">Cambiar contraseña</button>` : ''}
                        ${puedeCambiarRol(x) ? `<button class="btn-link" onclick="abrirEditorRol('${x.id}')">Editar rol</button>` : ''}
                        ${puedeGestionarUsuario(x) ? `<button class="btn-link" onclick="toggleUsuario('${x.id}')">${x.activo ? 'Desactivar' : 'Activar'}</button>` : ''}</td>
                </tr>`).join('')}</tbody>
        </table></div>`;
}

// Permiso y límite de lectura con IA de un usuario
function celdaIA(x, usos, limiteDefecto) {
    const usados = usos[x.id] || 0;
    const limite = x.iaLimite ?? limiteDefecto;
    const uso = `<small>${usados}/${limite} hoy</small>`;
    if (x.rol === 'admin') return `Siempre <small>(admin)</small><br>${uso}`;
    const u = Auth.usuario;
    const gestiona = Auth.esAdmin() || (Auth.puede('ia.gestionar') && x.orgId === u.orgId && !['admin', 'ceo'].includes(x.rol));
    if (!gestiona) return x.iaPermitida ? `Sí<br>${uso}` : 'No';
    return `
        <div class="ia-celda">
            <label class="check"><input type="checkbox" ${x.iaPermitida ? 'checked' : ''}
                onchange="configurarIA('${x.id}', this.checked, this.closest('.ia-celda').querySelector('input[type=number]').value)"> Permitir</label>
            <input type="number" min="0" max="500" placeholder="${limiteDefecto}" value="${x.iaLimite ?? ''}" title="Límite diario (vacío = por defecto)"
                aria-label="Límite diario de ${esc(x.usuario)}"
                onchange="configurarIA('${x.id}', this.closest('.ia-celda').querySelector('input[type=checkbox]').checked, this.value)">
            ${uso}
        </div>`;
}

async function configurarIA(id, permitida, limite) {
    const valor = String(limite).trim() === '' ? null : Number(limite);
    try {
        await DB.iaConfigurarUsuario(id, permitida, valor);
        toast('Permiso de IA actualizado.');
    } catch (err) { toast(err.message, 'error'); }
    renderUsuarios();
}

// ---------- Cambio de rol ----------
// Admin: cualquiera menos a sí mismo · CEO: manager, coach y analista de su organización
function puedeCambiarRol(x) {
    const u = Auth.usuario;
    if (x.id === u.id) return false;
    if (Auth.esAdmin()) return true;
    return u.rol === 'ceo' && x.orgId === u.orgId && ROLES[x.rol].nivel < ROLES.ceo.nivel;
}

function rolesAsignables() {
    return Object.keys(ROLES).filter(r => Auth.esAdmin() || ROLES[r].nivel < ROLES[Auth.usuario.rol].nivel);
}

async function abrirEditorRol(id) {
    const x = await DB.usuario(id);
    if (!x || !puedeCambiarRol(x)) return;
    const f = $('#form-editar-usuario');
    f.id.value = x.id;
    f.dataset.equipos = JSON.stringify(x.equipos);
    $('#editar-usuario-nombre').textContent = `${x.nombre} (@${x.usuario})`;
    f.rol.innerHTML = rolesAsignables().map(r => `<option value="${r}">${ROLES[r].nombre}</option>`).join('');
    f.rol.value = x.rol;
    const orgs = await Auth.orgsVisibles();
    f.orgId.innerHTML = orgs.map(o => `<option value="${o.id}">${esc(o.nombre)}</option>`).join('');
    f.orgId.value = x.orgId || Auth.usuario.orgId || (orgs[0] && orgs[0].id) || '';
    f.orgId.disabled = !Auth.esAdmin();
    f.hidden = false;
    await actualizarEquiposEditor();
    f.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

async function actualizarEquiposEditor() {
    const f = $('#form-editar-usuario');
    const rol = f.rol.value;
    f.orgId.closest('.form-group').hidden = rol === 'admin';
    const caja = $('#ed-equipos');
    if (!['coach', 'analista'].includes(rol)) {
        caja.innerHTML = `<p class="ayuda">${rol === 'admin' ? 'El admin ve todas las organizaciones.' : 'Este rol ve todos los rosters de su organización.'}</p>`;
        return;
    }
    const actuales = JSON.parse(f.dataset.equipos || '[]');
    const teams = (await Auth.equiposVisibles()).filter(t => t.orgId === f.orgId.value);
    caja.innerHTML = teams.length
        ? teams.map(t => `<label class="check"><input type="checkbox" value="${t.id}" ${actuales.includes(t.id) ? 'checked' : ''}> ${esc(t.nombre)}</label>`).join('')
        : '<p class="ayuda">Esta organización no tiene rosters todavía.</p>';
}

function cerrarEditorRol() {
    $('#form-editar-usuario').hidden = true;
}

async function onGuardarRol(e) {
    e.preventDefault();
    const f = e.target;
    const rol = f.rol.value;
    if (!rolesAsignables().includes(rol)) return toast('No puedes asignar ese rol.', 'error');
    const orgId = rol === 'admin' ? null : (Auth.esAdmin() ? f.orgId.value : Auth.usuario.orgId);
    if (rol !== 'admin' && !orgId) return toast('Elige una organización.', 'error');
    if (rol === 'admin' && !confirm('El rol Admin da control total de la plataforma. ¿Continuar?')) return;
    try {
        await DB.cambiarRol(f.id.value, rol, orgId, $$('#ed-equipos input:checked').map(i => i.value));
        toast('Rol actualizado.');
        cerrarEditorRol();
        renderUsuarios();
    } catch (err) { toast(err.message, 'error'); }
}

function puedeGestionarUsuario(x) {
    const u = Auth.usuario;
    if (x.id === u.id || !Auth.puede('usuario.crear')) return false;
    return Auth.esAdmin() || (ROLES[x.rol].nivel < ROLES[u.rol].nivel && x.orgId === u.orgId);
}

async function actualizarAsignacionEquipos() {
    const form = $('#form-usuario');
    const rol = form.rol.value;
    const caja = $('#asignar-equipos');
    if (!['coach', 'analista'].includes(rol)) {
        caja.innerHTML = '<p class="ayuda">Este rol ve todos los rosters de su organización.</p>';
        return;
    }
    const orgId = Auth.esAdmin() ? form.orgId.value : Auth.usuario.orgId;
    const teams = (await Auth.equiposVisibles()).filter(t => t.orgId === orgId);
    caja.innerHTML = teams.length
        ? teams.map(t => `<label class="check"><input type="checkbox" name="equipos" value="${t.id}"> ${esc(t.nombre)}</label>`).join('')
        : '<p class="ayuda">No hay rosters todavía; puedes asignarlos después.</p>';
}

async function onCrearUsuario(e) {
    e.preventDefault();
    const f = e.target;
    const rol = f.rol.value;
    if (!Auth.rolesCreables().includes(rol)) return toast('No puedes crear ese rol.', 'error');
    const orgId = Auth.esAdmin() ? f.orgId.value : Auth.usuario.orgId;
    if (rol !== 'admin' && !orgId) return toast('Primero crea una organización.', 'error');
    const btn = f.querySelector('button[type="submit"]');
    btn.disabled = true;
    try {
        const res = await DB.crearUsuario({
            nombre: f.nombre.value, usuario: f.usuario.value, password: f.password.value,
            rol, orgId: rol === 'admin' ? null : orgId,
            equipos: $$('#asignar-equipos input:checked').map(i => i.value)
        });
        f.reset();
        toast(`Usuario @${res.usuario} creado. Ya puede iniciar sesión.`);
        renderUsuarios();
    } catch (err) {
        toast(err.message, 'error');
    } finally {
        btn.disabled = false;
    }
}

async function cambiarPasswordUsuario(id, usuario) {
    const nueva = prompt(`Nueva contraseña para @${usuario} (mínimo 8 caracteres):`);
    if (nueva === null) return;
    if (nueva.length < 8) return toast('La contraseña debe tener al menos 8 caracteres.', 'error');
    try {
        await DB.cambiarPassword(id, nueva);
        toast(`Contraseña de @${usuario} actualizada.`);
    } catch (err) { toast(err.message, 'error'); }
}

async function toggleUsuario(id) {
    const x = await DB.usuario(id);
    if (!x || !puedeGestionarUsuario(x)) return;
    try {
        await DB.setUsuarioActivo(id, !x.activo);
    } catch (err) { toast(err.message, 'error'); }
    renderUsuarios();
}

// ============================================================
// Equipos (rosters) y jugadores
// ============================================================
async function renderEquipos() {
    const form = $('#form-equipo');
    form.hidden = !Auth.puede('equipo.crear');
    if (!form.hidden) {
        const orgs = await Auth.orgsVisibles();
        form.orgId.innerHTML = orgs.map(o => `<option value="${o.id}">${esc(o.nombre)}</option>`).join('');
        form.orgId.closest('.form-group').hidden = !Auth.esAdmin();
    }

    const teams = await Auth.equiposVisibles();
    const orgs = await DB.orgs();
    const players = await DB.jugadores();
    const editables = {};
    for (const t of teams) editables[t.id] = await Auth.puedeEditarEquipo(t.id);

    $('#lista-equipos').innerHTML = teams.length ? teams.map(t => {
        const ps = players.filter(p => p.teamId === t.id);
        const org = orgs.find(o => o.id === t.orgId);
        return `
        <div class="card-box roster">
            <div class="roster-head">
                ${logoHTML(t.logo, t.nombre, 'logo-medio')}
                <div class="fila-info">
                    <h3>${esc(t.nombre)}</h3>
                    <p>${esc(org ? org.nombre : '')} · ${ps.length} jugadores</p>
                </div>
                ${editables[t.id] ? `
                <label class="btn-sec"><i class="fa-solid fa-image"></i> Logo
                    <input type="file" accept="image/*" hidden onchange="cambiarLogoEquipo('${t.id}', this)">
                </label>` : ''}
                ${Auth.puede('equipo.eliminar') ? `<button class="btn-sec btn-peligro" onclick="eliminarEquipo('${t.id}')"><i class="fa-solid fa-trash"></i></button>` : ''}
            </div>
            <div class="tabla-scroll"><table class="tabla-datos">
                <thead><tr><th>Nick</th><th>Nombre</th><th>Rol</th><th>IGL</th>${editables[t.id] ? '<th></th>' : ''}</tr></thead>
                <tbody>${ps.map(p => `
                    <tr class="${p.activo ? '' : 'inactivo'}">
                        <td><strong>${esc(p.nick)}</strong></td>
                        <td>${esc(p.nombre)}</td>
                        <td>${editables[t.id] ? `
                            <select onchange="cambiarRolJugador('${p.id}', this.value)">
                                ${CATALOGO.rolesJugador.map(r => `<option value="${r.id}" ${r.id === p.rol ? 'selected' : ''}>${r.nombre}</option>`).join('')}
                            </select>` : `<span class="rol-jugador rj-${p.rol}">${nombreRolJugador(p.rol)}</span>`}</td>
                        <td>${editables[t.id]
                            ? `<input type="radio" name="igl_${t.id}" ${p.igl ? 'checked' : ''} onchange="marcarIGL('${p.id}')" aria-label="IGL">`
                            : (p.igl ? '<span class="igl-tag">IGL</span>' : '')}</td>
                        ${editables[t.id] ? `<td><button class="btn-link" onclick="toggleJugador('${p.id}', ${!p.activo})">${p.activo ? 'Dar de baja' : 'Reactivar'}</button></td>` : ''}
                    </tr>`).join('') || `<tr><td colspan="5" class="vacio">Sin jugadores.</td></tr>`}
                </tbody>
            </table></div>
            ${editables[t.id] ? `
            <form class="form-jugador" onsubmit="onCrearJugador(event, '${t.id}')">
                <input name="nick" placeholder="Nick en el juego" required maxlength="24">
                <input name="nombre" placeholder="Nombre real (opcional)" maxlength="60">
                <select name="rol">${CATALOGO.rolesJugador.map(r => `<option value="${r.id}">${r.nombre}</option>`).join('')}</select>
                <label class="check"><input type="checkbox" name="igl"> IGL</label>
                <button type="submit" class="btn-generar"><i class="fa-solid fa-user-plus"></i> Agregar</button>
            </form>` : ''}
        </div>`;
    }).join('') : '<p class="vacio">No tienes rosters visibles todavía.</p>';
}

async function onCrearEquipo(e) {
    e.preventDefault();
    const f = e.target;
    const orgId = Auth.esAdmin() ? f.orgId.value : Auth.usuario.orgId;
    if (!orgId) return toast('Primero crea una organización.', 'error');
    try {
        await DB.crearEquipo({ orgId, nombre: f.nombre.value, logo: await leerLogo(f.logo), creadoPor: Auth.usuario.id });
        await Auth.refrescar();
        f.reset();
        toast('Roster creado.');
        renderEquipos();
    } catch (err) { toast(err.message, 'error'); }
}

async function cambiarLogoEquipo(id, input) {
    try {
        await DB.actualizarEquipo(id, { logo: await leerLogo(input) });
        renderEquipos();
    } catch (err) { toast(err.message, 'error'); }
}

async function eliminarEquipo(id) {
    if (!confirm('¿Eliminar este roster con sus jugadores y partidas? No se puede deshacer.')) return;
    try {
        await DB.eliminarEquipo(id);
        toast('Roster eliminado.');
    } catch (err) { toast(err.message, 'error'); }
    renderEquipos();
}

async function onCrearJugador(e, teamId) {
    e.preventDefault();
    if (!(await Auth.puedeEditarEquipo(teamId))) return;
    const f = e.target;
    try {
        await DB.crearJugador({ teamId, nick: f.nick.value, nombre: f.nombre.value, rol: f.rol.value, igl: f.igl.checked });
    } catch (err) { toast(err.message, 'error'); }
    renderEquipos();
}

async function marcarIGL(id) {
    try { await DB.marcarIGL(id); } catch (err) { toast(err.message, 'error'); renderEquipos(); }
}
async function cambiarRolJugador(id, rol) {
    try { await DB.actualizarJugador(id, { rol }); } catch (err) { toast(err.message, 'error'); renderEquipos(); }
}
async function toggleJugador(id, activo) {
    try { await DB.actualizarJugador(id, { activo }); } catch (err) { toast(err.message, 'error'); }
    renderEquipos();
}

// ============================================================
// Registro de partida
// ============================================================
let capturaActual = null;

const CAMPOS_STATS = [
    ['k', 'K'], ['d', 'D'], ['a', 'A'], ['dmg', 'DMG'], ['danoReal', 'Daño real'],
    ['noqueos', 'Noquear'], ['curacion', 'Curar'], ['levantar', 'Ayudar a levantarse'],
    ['resurreccion', 'Resurrección'], ['hs', 'HS %']
];

async function renderRegistroPartida() {
    const form = $('#form-partida');
    const teams = await Auth.equiposVisibles();
    const puede = Auth.puede('partida.registrar');
    form.hidden = !puede || !teams.length;
    $('#partida-sin-equipos').hidden = !puede || teams.length > 0;
    if (puede && teams.length) {
        const sel = form.teamId.value;
        form.teamId.innerHTML = teams.map(t => `<option value="${t.id}">${esc(t.nombre)}</option>`).join('');
        if (teams.some(t => t.id === sel)) form.teamId.value = sel;
        actualizarEstadoIA();
        if (!form.fecha.value) {
            const ahora = new Date();
            form.fecha.value = fechaLocal(ahora);
            form.hora.value = ahora.toTimeString().slice(0, 5);
        }
        await renderTablaStats();
    }
    renderPartidasRecientes();
}

async function renderTablaStats() {
    const form = $('#form-partida');
    const jugadores = (await DB.jugadores(form.teamId.value)).filter(p => p.activo);
    $('#tabla-stats').innerHTML = jugadores.length ? `
        <table class="tabla-datos tabla-input">
            <thead><tr><th>Jugó</th><th>Jugador</th>${CAMPOS_STATS.map(([, t]) => `<th>${t}</th>`).join('')}</tr></thead>
            <tbody>${jugadores.map((p, i) => `
                <tr data-player="${p.id}" data-nick="${esc(p.nick)}">
                    <td><input type="checkbox" class="jugo" ${i < 4 ? 'checked' : ''} aria-label="Jugó ${esc(p.nick)}"></td>
                    <td><strong>${esc(p.nick)}</strong><br><small>${nombreRolJugador(p.rol)}${p.igl ? ' · IGL' : ''}</small></td>
                    ${CAMPOS_STATS.map(([c, t]) => `<td><input type="number" min="0" ${c === 'hs' ? 'max="100" step="0.01"' : 'step="1"'} data-campo="${c}" aria-label="${t} ${esc(p.nick)}" value="0"></td>`).join('')}
                </tr>`).join('')}
            </tbody>
        </table>` : '<p class="vacio">Este roster no tiene jugadores activos. Regístralos en Equipos.</p>';

    const opciones = '<option value="">— Sin dato —</option>' + jugadores.map(p => `<option value="${p.id}">${esc(p.nick)}</option>`).join('');
    form.primerDerribo.innerHTML = opciones;
    form.primeraCaida.innerHTML = opciones;
    await actualizarCaidaPartida();
}

// Lista las zonas del mapa elegido y preselecciona la caída del roster
async function actualizarCaidaPartida() {
    const form = $('#form-partida');
    const mapa = form.mapa.value;
    let definida = null;
    try {
        definida = (await DB.caidas([form.teamId.value])).find(c => c.mapa === mapa) || null;
    } catch (err) { /* sin caídas configuradas */ }
    form.caida.innerHTML = '<option value="">— Sin dato —</option>' +
        (CATALOGO.caidas[mapa] || []).map(z => `<option value="${esc(z)}">${esc(z)}${definida && z === definida.zona ? ' (principal)' : definida && z === definida.alterna ? ' (alterna)' : ''}</option>`).join('');
    form.caida.value = definida?.zona || '';
}

// Muestra el botón de IA solo a quien tiene permiso, con su cupo del día
let estadoIA = null;
async function actualizarEstadoIA() {
    const btn = $('#btn-leer-ia');
    const info = $('#ia-cupo');
    try {
        estadoIA = await DB.iaEstado();
    } catch (err) {
        estadoIA = null;
    }
    const permitida = !!estadoIA?.permitida;
    btn.hidden = !permitida;
    info.hidden = !permitida;
    if (permitida) {
        info.textContent = `Lecturas con IA disponibles hoy: ${estadoIA.restantes} de ${estadoIA.limite}`;
        btn.disabled = !capturaActual || estadoIA.restantes <= 0;
    }
}

async function onCaptura(input) {
    const f = input.files && input.files[0];
    if (!f) return;
    capturaActual = await comprimirImagen(f, 1600, 0.8);
    $('#preview-captura').innerHTML = `<img src="${capturaActual}" alt="Captura del marcador">`;
    $('#btn-leer-ia').disabled = !estadoIA?.permitida || estadoIA.restantes <= 0;
}

// Lectura automática con IA (requiere desplegar supabase/functions/leer-captura)
async function leerCapturaIA() {
    if (!capturaActual) return;
    if (typeof supabaseClient === 'undefined' || !supabaseClient) return toast('Supabase no está disponible.', 'error');
    const btn = $('#btn-leer-ia');
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Leyendo...';
    try {
        const filas = $$('#tabla-stats tbody tr');
        const { data, error } = await supabaseClient.functions.invoke(FUNCION_LEER_CAPTURA, {
            body: { imagen: capturaActual, jugadores: filas.map(tr => tr.dataset.nick) }
        });
        if (error) {
            // La función responde { error: "..." } con el motivo real
            let motivo = error.message;
            try { motivo = (await error.context.json()).error || motivo; } catch (e) { /* sin detalle */ }
            throw new Error(motivo);
        }
        aplicarLecturaIA(data);
        toast(`Datos cargados. Revísalos antes de guardar. Te quedan ${data.restantes} lecturas hoy.`);
    } catch (err) {
        toast('No se pudo leer la captura: ' + (err.message || err) + '.', 'error');
    } finally {
        btn.innerHTML = '<i class="fa-solid fa-wand-magic-sparkles"></i> Leer con IA';
        await actualizarEstadoIA();
    }
}

function normalizarNick(n) {
    // Quita prefijos de clan tipo "Xz." o "CSUR." y espacios
    return String(n || '').toLowerCase().replace(/^[a-z0-9]{1,5}[.\s]+/i, '').replace(/[^a-z0-9]/g, '');
}

function aplicarLecturaIA(data) {
    const form = $('#form-partida');
    if (data.posicion) form.posicion.value = data.posicion;
    if (data.totalEquipos) form.totalEquipos.value = data.totalEquipos;
    if (data.mapa && CATALOGO.mapas.includes(data.mapa)) { form.mapa.value = data.mapa; actualizarCaidaPartida(); }
    const filas = $$('#tabla-stats tbody tr');
    filas.forEach(tr => { tr.querySelector('.jugo').checked = false; });
    (data.jugadores || []).forEach(j => {
        const n = normalizarNick(j.nick);
        const tr = filas.find(r => {
            const m = normalizarNick(r.dataset.nick);
            return m && n && (m === n || m.includes(n) || n.includes(m));
        });
        if (!tr) return;
        tr.querySelector('.jugo').checked = true;
        CAMPOS_STATS.forEach(([c]) => {
            if (j[c] !== undefined && j[c] !== null) tr.querySelector(`[data-campo="${c}"]`).value = j[c];
        });
    });
}

async function onGuardarPartida(e) {
    e.preventDefault();
    const f = e.target;
    if (!Auth.puede('partida.registrar')) return;
    const stats = $$('#tabla-stats tbody tr').filter(tr => tr.querySelector('.jugo').checked).map(tr => {
        const s = { playerId: tr.dataset.player };
        CAMPOS_STATS.forEach(([c]) => { s[c] = Number(tr.querySelector(`[data-campo="${c}"]`).value) || 0; });
        return s;
    });
    if (!stats.length) return toast('Marca al menos un jugador que haya jugado.', 'error');
    const posicion = Number(f.posicion.value), total = Number(f.totalEquipos.value);
    if (posicion < 1 || posicion > total) return toast('La posición debe estar entre 1 y el total de equipos.', 'error');
    try {
        await DB.crearPartida({
            teamId: f.teamId.value, fecha: f.fecha.value, hora: f.hora.value,
            mapa: f.mapa.value, evento: f.evento.value, posicion, totalEquipos: total,
            primerDerribo: f.primerDerribo.value || null, primeraCaida: f.primeraCaida.value || null,
            notas: f.notas.value.trim(), caida: f.caida.value || null, captura: capturaActual, stats, creadoPor: Auth.usuario.id
        });
        toast('Partida guardada.');
        capturaActual = null;
        $('#preview-captura').innerHTML = '';
        $('#btn-leer-ia').disabled = true;
        f.captura.value = '';
        f.notas.value = '';
        await renderTablaStats();
        renderPartidasRecientes();
    } catch (err) { toast(err.message, 'error'); }
}

async function renderPartidasRecientes() {
    const teams = await Auth.equiposVisibles();
    const partidas = ordenarCronologico(await DB.partidas(teams.map(t => t.id))).reverse().slice(0, 25);
    const puedeBorrar = Auth.puede('partida.eliminar');
    $('#lista-partidas').innerHTML = partidas.length ? `
        <div class="tabla-scroll"><table class="tabla-datos">
            <thead><tr><th>Fecha</th><th>Roster</th><th>Mapa</th><th>Caída</th><th>Evento</th><th>Pos.</th><th>Bajas</th><th>Pts</th><th>Captura</th>${puedeBorrar ? '<th></th>' : ''}</tr></thead>
            <tbody>${partidas.map(m => `
                <tr>
                    <td>${esc(m.fecha)} ${esc(m.hora)}</td>
                    <td>${esc((teams.find(t => t.id === m.teamId) || {}).nombre)}</td>
                    <td>${esc(m.mapa)}</td>
                    <td>${esc(m.caida || '—')}</td>
                    <td>${esc(nombreEvento(m.evento))}</td>
                    <td>#${m.posicion}/${m.totalEquipos}</td>
                    <td>${bajasPartida(m)}</td>
                    <td><strong>${puntosPartida(m)}</strong></td>
                    <td>${m.tieneCaptura ? `<button class="btn-link" onclick="verCaptura('${m.id}')">Ver</button>` : '—'}</td>
                    ${puedeBorrar ? `<td><button class="btn-link" onclick="borrarPartida('${m.id}')">Eliminar</button></td>` : ''}
                </tr>`).join('')}</tbody>
        </table></div>` : '<p class="vacio">Aún no hay partidas registradas.</p>';
}

async function verCaptura(id) {
    try {
        const src = await DB.captura(id);
        if (!src) return;
        $('#modal-captura img').src = src;
        $('#modal-captura').hidden = false;
    } catch (err) { toast(err.message, 'error'); }
}

async function borrarPartida(id) {
    if (!confirm('¿Eliminar esta partida? No se puede deshacer.')) return;
    try {
        await DB.eliminarPartida(id);
    } catch (err) { toast(err.message, 'error'); }
    renderPartidasRecientes();
}

// ============================================================
// Informe de rendimiento
// ============================================================
async function renderFiltrosInforme() {
    const f = $('#filtros-informe');
    const teams = await Auth.equiposVisibles();
    const orgs = await Auth.orgsVisibles();
    const sel = f.alcance.value;
    let opciones = '';
    if (Auth.puede('informe.organizacion')) {
        opciones += orgs.map(o => `<option value="org:${o.id}">Toda la organización · ${esc(o.nombre)}</option>`).join('');
    }
    opciones += teams.map(t => `<option value="team:${t.id}">${esc(t.nombre)}</option>`).join('');
    f.alcance.innerHTML = opciones || '<option value="">Sin rosters</option>';
    if (sel && [...f.alcance.options].some(o => o.value === sel)) f.alcance.value = sel;
    if (!f.desde.value) {
        const hoy = new Date();
        const ini = new Date(hoy); ini.setDate(ini.getDate() - 6);
        f.hasta.value = fechaLocal(hoy);
        f.desde.value = fechaLocal(ini);
    }
    generarInforme();
}

async function generarInforme() {
    const f = $('#filtros-informe');
    const out = $('#informe');
    if (!f.alcance.value) { out.innerHTML = '<p class="vacio">No hay rosters para analizar.</p>'; return; }

    const [tipo, id] = f.alcance.value.split(':');
    const visibles = await Auth.equiposVisibles();
    const teams = tipo === 'org' ? visibles.filter(t => t.orgId === id) : visibles.filter(t => t.id === id);
    const teamIds = teams.map(t => t.id);
    const orgs = await DB.orgs();
    const org = orgs.find(o => o.id === (tipo === 'org' ? id : teams[0]?.orgId));
    const titulo = tipo === 'org' ? org?.nombre : teams[0]?.nombre;
    const logo = tipo === 'org' ? org?.logo : (teams[0]?.logo || org?.logo);

    const filtros = { desde: f.desde.value, hasta: f.hasta.value, mapa: f.mapa.value, evento: f.evento.value, teamIds };
    const todas = await DB.partidas(teamIds);
    const partidas = filtrarPartidas(todas, filtros);
    const ant = periodoAnterior(f.desde.value, f.hasta.value);
    const previas = ant ? filtrarPartidas(todas, { ...filtros, desde: ant.desde, hasta: ant.hasta }) : [];
    const jugadores = (await DB.jugadores()).filter(p => teamIds.includes(p.teamId));

    const r = resumenEquipo(partidas);
    const rPrev = resumenEquipo(previas);
    const porMapa = desglosePor(partidas, 'mapa', CATALOGO.mapas);
    const porEvento = desglosePor(partidas, 'evento', CATALOGO.eventos.map(e => e.id));
    const porCaida = desglosePor(partidas.map(m => ({ ...m, caidaMapa: m.caida ? `${m.caida} · ${m.mapa}` : null })), 'caidaMapa');
    const porPos = puntosPorPosicion(partidas);
    const plantilla = estadisticasJugadores(partidas, jugadores);
    const tend = tendencia(partidas);
    const notas = diagnostico(partidas, plantilla, porMapa);
    const filtroTxt = [f.mapa.value, f.evento.value && nombreEvento(f.evento.value)].filter(Boolean).join(' · ') || 'Todas las partidas';

    if (!partidas.length) {
        out.innerHTML = cabeceraInforme(titulo, logo, 'Equipo', f) + '<p class="vacio">No hay partidas con estos filtros.</p>';
        return;
    }

    out.innerHTML = `
    <div class="pagina-informe" id="inf-equipo">
        ${cabeceraInforme(titulo, logo, 'Informe del equipo', f)}
        <h2 class="inf-titulo">${esc(titulo)}</h2>
        <p class="inf-sub">${esc(filtroTxt)} · comparado con los ${ant ? ant.dias : 0} día(s) anteriores (${previas.length} partida(s))</p>

        <div class="kpi-grid">
            ${kpi(r.partidas, 'Partidas', r.partidas - rPrev.partidas, previas.length, 0)}
            ${kpi(pct(r.tasaBooyah), 'Tasa de Booyah', (r.tasaBooyah - rPrev.tasaBooyah) * 100, previas.length, 0, '%')}
            ${kpi(pct(r.tasaTop3), 'Top 3', (r.tasaTop3 - rPrev.tasaTop3) * 100, previas.length, 0, '%')}
            ${kpi(fmt(r.posMedia), 'Posición media', rPrev.posMedia - r.posMedia, previas.length, 1)}
            ${kpi(r.bajas, 'Bajas totales', r.bajas - rPrev.bajas, previas.length, 0)}
            ${kpi(fmt(r.bajasPorPartida), 'Bajas por partida', r.bajasPorPartida - rPrev.bajasPorPartida, previas.length, 1)}
            ${kpi(r.kd === null ? '—' : fmt(r.kd, 2), 'K/D del equipo', r.kd !== null && rPrev.kd !== null ? r.kd - rPrev.kd : null, previas.length, 2)}
            ${kpi(r.booyahs, 'Booyahs', r.booyahs - rPrev.booyahs, previas.length, 0)}
        </div>

        ${tipo === 'org' && teams.length > 1 ? seccion('Comparativa de rosters', tablaRosters(teams, partidas)) : ''}

        ${seccion('Dónde puntúa', grafica('Puntuación por mapa', 'Posición + 1 punto por baja, el estándar de campeonato',
            barras(porMapa.map(m => ({ etiqueta: m.clave, valor: m.puntos, texto: `${m.puntos} pts` })))))}

        ${seccion('Mapa a mapa', tablaDesglose(porMapa, 'Mapa'))}

        ${seccion('Poder de fuego por mapa', grafica('Bajas por partida en cada mapa', 'Puntuación alta sin bajas altas significa que el equipo puntuó por posición',
            barras(porMapa.map(m => ({ etiqueta: m.clave, valor: m.bajasPorPartida, texto: `${fmt(m.bajasPorPartida)} por partida` })))))}

        ${seccion('Puntuación por posición', grafica('Puntos promedio por posición alcanzada', 'Cuántos puntos rindió, en promedio, cada posición',
            barras(porPos.map(p => ({ etiqueta: `${p.posicion}º`, valor: p.promPuntos, texto: `${fmt(p.promPuntos)} pts · ${p.partidas} partida(s)` })))))}

        ${porCaida.length ? seccion('Rendimiento por caída', tablaDesglose(porCaida, 'Caída · mapa')) : ''}

        ${porEvento.length > 1 ? seccion('Por tipo de evento', tablaDesglose(porEvento.map(e => ({ ...e, clave: nombreEvento(e.clave) })), 'Evento')) : ''}

        ${seccion('Tendencia', grafica(`Puntos por partida en orden cronológico · ${tend.lectura}`,
            `Regresión lineal: ${tend.pendiente >= 0 ? '+' : ''}${fmt(tend.pendiente, 2)} pts por partida · R² ${fmt(tend.r2, 2)}`, sparkline(tend)))}
    </div>

    <div class="pagina-informe" id="inf-plantilla">
        ${cabeceraInforme(titulo, logo, 'Plantilla', f)}
        <h2 class="inf-titulo">Plantilla</h2>
        <p class="inf-sub">Ranking a partir de ${MIN_PARTIDAS_RANKING} partidas en el período</p>

        ${grafica(`Participación en ${r.bajas} bajas`, 'Cuánto del poder de fuego pasa por cada uno', participacion(plantilla))}

        <div class="dos-col">
            ${grafica('Promedio de bajas por partida', 'La línea punteada es el promedio de la plantilla', columnasPromedio(plantilla))}
            ${grafica('Daño medio por partida', 'Volumen de combate, sin importar quién finaliza',
                barras([...plantilla].sort((a, b) => b.dmgMedio - a.dmgMedio).map(p => ({ etiqueta: p.jugador.nick, valor: p.dmgMedio, texto: Math.round(p.dmgMedio) }))))}
        </div>

        ${seccion('La plantilla', tablaPlantilla(plantilla))}

        ${seccion('Eficiencia', grafica('Daño gastado por baja', 'Menor es mejor: convierte el combate en bajas más rápido',
            barras(plantilla.filter(p => p.danoPorBaja !== null).sort((a, b) => a.danoPorBaja - b.danoPorBaja)
                .map(p => ({ etiqueta: p.jugador.nick, valor: p.danoPorBaja, texto: `${Math.round(p.danoPorBaja)} de daño` })))))}

        ${seccion('Índice de rendimiento por rol', grafica('Índice 0-100 ponderado según el rol del jugador',
            'Rusher: bajas, noqueos, daño, HS · Granadero: daño y daño real · Soporte: curar, levantar, resurrección. Relativo al mejor de la plantilla.',
            barras([...plantilla].sort((a, b) => b.indiceRol - a.indiceRol).map(p => ({
                etiqueta: `${p.jugador.nick} · ${nombreRolJugador(p.jugador.rol)}${p.jugador.igl ? ' · IGL' : ''}`, valor: p.indiceRol, max: 100,
                texto: `${p.indiceRol}${p.consistencia !== null ? ` · consistencia ${Math.round(p.consistencia)}` : ''}`
            })))))}

        ${seccion('Diagnóstico', notas.map(n => `
            <div class="nota nota-${n.nivel}">
                <i class="fa-solid ${n.nivel === 'alerta' ? 'fa-triangle-exclamation' : n.nivel === 'bien' ? 'fa-circle-check' : 'fa-circle-info'}"></i>
                <div><strong>${esc(n.titulo)}</strong><p>${esc(n.texto)}</p></div>
            </div>`).join(''), 'inf-diagnostico')}
    </div>

    <div class="pagina-informe" id="inf-combate">
        ${cabeceraInforme(titulo, logo, 'Combate', f)}
        <h2 class="inf-titulo">Cómo pelea ${esc(titulo)}</h2>
        <p class="inf-sub">Primer intercambio · dato ingresado a mano en el registro de partida</p>
        ${grafica('Primero en derribar frente a primero en caer', 'En cuántas partidas cada uno abrió o entregó el primer intercambio', primerIntercambio(plantilla))}
        ${grafica('Apoyo al equipo por partida', 'Curación, levantamientos y resurrecciones promedio', tablaApoyo(plantilla))}
        <p class="pie-informe">${esc(titulo)} · generado por Pumas Dev Lab · ${new Date().toLocaleDateString('es')}</p>
    </div>`;
}

function cabeceraInforme(titulo, logo, etiqueta, f) {
    return `
        <div class="inf-cabecera">
            <div class="inf-marca">${logoHTML(logo, titulo, 'logo-mini')} PUMAS DEV LAB</div>
            <div class="inf-meta">${esc(etiqueta)}<br>${esc(f.desde.value)} a ${esc(f.hasta.value)}</div>
        </div>`;
}

function kpi(valor, etiqueta, delta, nPrev, dec, sufijo = '') {
    let d = '';
    if (nPrev && delta !== null && !isNaN(delta) && Math.abs(delta) > 1e-9) {
        d = `<span class="delta ${delta > 0 ? 'sube' : 'baja'}">${delta > 0 ? '▲' : '▼'} ${Math.abs(delta).toFixed(dec)}${sufijo}</span>`;
    }
    return `<div class="kpi"><div class="kpi-valor">${valor}</div><div class="kpi-etiqueta">${esc(etiqueta)}</div>${d}</div>`;
}

function seccion(titulo, contenido, id = '') {
    return `<section class="inf-seccion"${id ? ` id="${id}"` : ''}><h4>${esc(titulo)}</h4>${contenido}</section>`;
}

function grafica(titulo, subtitulo, contenido) {
    return `<div class="grafica"><h5>${esc(titulo)}</h5><p class="grafica-sub">${esc(subtitulo)}</p>${contenido}</div>`;
}

function barras(filas) {
    if (!filas.length) return '<p class="vacio">Sin datos.</p>';
    const max = Math.max(...filas.map(f => f.max || f.valor), 0) || 1;
    return `<div class="barras">${filas.map(f => `
        <div class="barra-fila" title="${esc(f.etiqueta)}: ${esc(f.texto)}">
            <span class="barra-etq">${esc(f.etiqueta)}</span>
            <span class="barra-pista"><span class="barra" style="width: ${Math.max(0.5, (f.valor / max) * 100)}%"></span></span>
            <span class="barra-val">${esc(f.texto)}</span>
        </div>`).join('')}</div>`;
}

const SERIES = ['var(--serie-1)', 'var(--serie-2)', 'var(--serie-3)', 'var(--serie-4)', 'var(--serie-5)', 'var(--serie-6)'];

function participacion(plantilla) {
    const filas = [...plantilla].sort((a, b) => b.participacion - a.participacion).filter(p => p.bajas > 0);
    if (!filas.length) return '<p class="vacio">Sin bajas registradas.</p>';
    // Más de 6 jugadores: el resto se agrupa en "Otros"
    const visibles = filas.slice(0, 5);
    if (filas.length > 6) {
        const resto = filas.slice(5);
        visibles.push({ jugador: { nick: 'Otros' }, participacion: Stats.sum(resto.map(p => p.participacion)), bajas: Stats.sum(resto.map(p => p.bajas)) });
    } else if (filas[5]) visibles.push(filas[5]);
    return `
        <div class="stack">${visibles.map((p, i) => `
            <span class="stack-seg" style="flex: ${p.participacion}; background: ${SERIES[i]}" title="${esc(p.jugador.nick)}: ${p.bajas} bajas (${pct(p.participacion)})">${p.participacion >= 0.08 ? pct(p.participacion) : ''}</span>`).join('')}
        </div>
        <div class="stack-leyenda">${visibles.map((p, i) => `
            <div style="flex: ${p.participacion}"><i style="background: ${SERIES[i]}"></i>${esc(p.jugador.nick)}<small>${p.bajas} · ${pct(p.participacion)}</small></div>`).join('')}
        </div>`;
}

function columnasPromedio(plantilla) {
    if (!plantilla.length) return '<p class="vacio">Sin datos.</p>';
    const max = Math.max(...plantilla.map(p => p.bajasPorPartida)) || 1;
    const prom = Stats.mean(plantilla.map(p => p.bajasPorPartida));
    return `
        <div class="columnas">
            <div class="linea-prom" style="bottom: ${(prom / max) * 100}%"><span>promedio ${fmt(prom)}</span></div>
            ${plantilla.map(p => `
                <div class="col" title="${esc(p.jugador.nick)}: ${fmt(p.bajasPorPartida)} bajas por partida">
                    <span class="col-val">${fmt(p.bajasPorPartida)}</span>
                    <span class="col-barra" style="height: ${(p.bajasPorPartida / max) * 100}%"></span>
                </div>`).join('')}
        </div>
        <div class="columnas-etq">${plantilla.map(p => `<span>${esc(p.jugador.nick)}</span>`).join('')}</div>`;
}

function primerIntercambio(plantilla) {
    const filas = plantilla.filter(p => p.primerDerribo || p.primeraCaida);
    if (!filas.length) return '<p class="vacio">Aún no se registró el primer intercambio en las partidas.</p>';
    const max = Math.max(...filas.flatMap(p => [p.primerDerribo, p.primeraCaida])) || 1;
    return `
        <div class="leyenda"><span><i style="background: var(--serie-3)"></i>Primero en derribar</span><span><i style="background: var(--serie-2)"></i>Primero en caer</span></div>
        <div class="grupos">${filas.map(p => `
            <div class="grupo">
                <div class="grupo-barras">
                    <div class="col" title="${esc(p.jugador.nick)} abrió con derribo ${p.primerDerribo} vez/veces"><span class="col-val">${p.primerDerribo}</span><span class="col-barra" style="height: ${(p.primerDerribo / max) * 100}%; background: var(--serie-3)"></span></div>
                    <div class="col" title="${esc(p.jugador.nick)} cayó primero ${p.primeraCaida} vez/veces"><span class="col-val">${p.primeraCaida}</span><span class="col-barra" style="height: ${(p.primeraCaida / max) * 100}%; background: var(--serie-2)"></span></div>
                </div>
                <span class="grupo-etq">${esc(p.jugador.nick)}</span>
            </div>`).join('')}
        </div>`;
}

function sparkline(tend) {
    const s = tend.serie;
    if (s.length < 2) return '<p class="vacio">Se necesitan al menos 2 partidas.</p>';
    const W = 600, H = 140, P = 12;
    const max = Math.max(...s, 1);
    const x = i => P + (i / (s.length - 1)) * (W - 2 * P);
    const y = v => H - P - (v / max) * (H - 2 * P);
    const puntos = s.map((v, i) => `${x(i)},${y(v)}`).join(' ');
    const m = Stats.mean(s), xm = (s.length + 1) / 2;
    const yReg = i => m + tend.pendiente * ((i + 1) - xm);
    return `
        <svg viewBox="0 0 ${W} ${H}" class="sparkline" role="img" aria-label="Puntos por partida">
            <line x1="${P}" y1="${H - P}" x2="${W - P}" y2="${H - P}" class="eje"/>
            <line x1="${x(0)}" y1="${y(Math.max(0, yReg(0)))}" x2="${x(s.length - 1)}" y2="${y(Math.max(0, yReg(s.length - 1)))}" class="regresion"/>
            <polyline points="${puntos}" class="serie"/>
            ${s.map((v, i) => `<circle cx="${x(i)}" cy="${y(v)}" r="4"><title>${esc(tend.ordenadas[i].fecha)} · ${esc(tend.ordenadas[i].mapa)} · #${tend.ordenadas[i].posicion} · ${v} pts</title></circle>`).join('')}
        </svg>`;
}

function tablaDesglose(filas, nombre) {
    return `<div class="tabla-scroll"><table class="tabla-informe">
        <thead><tr><th>${nombre}</th><th>Partidas</th><th>Bajas</th><th>Por partida</th><th>Posición</th><th>Booyahs</th><th>Prom. pts</th><th>Puntos</th></tr></thead>
        <tbody>${filas.map(m => `
            <tr${m.partidas < MIN_PARTIDAS_MAPA ? ' class="muestra-baja" title="Menos de ' + MIN_PARTIDAS_MAPA + ' partidas: muestra pequeña"' : ''}>
                <td><strong>${esc(m.clave)}</strong></td><td>${m.partidas}</td><td>${m.bajas}</td><td>${fmt(m.bajasPorPartida)}</td>
                <td>${fmt(m.posMedia)}</td><td>${m.booyahs || '—'}</td><td>${fmt(m.promPuntos)}</td><td><strong>${m.puntos}</strong></td>
            </tr>`).join('')}</tbody>
    </table></div>`;
}

function tablaPlantilla(plantilla) {
    return `<div class="tabla-scroll"><table class="tabla-informe">
        <thead><tr><th>Jugador</th><th>Partidas</th><th>Bajas/partida</th><th>Bajas</th><th>KDA</th><th>Daño medio</th><th>Daño real</th><th>Derribos</th><th>HS %</th><th>Posición</th></tr></thead>
        <tbody>${plantilla.map(p => `
            <tr${p.partidas < MIN_PARTIDAS_RANKING ? ' class="muestra-baja"' : ''}>
                <td><strong>${esc(p.jugador.nick)}</strong>${p.jugador.igl ? ' <span class="igl-tag">IGL</span>' : ''}<br><small>${nombreRolJugador(p.jugador.rol)}</small></td>
                <td>${p.partidas}</td><td><strong>${fmt(p.bajasPorPartida)}</strong></td><td>${p.bajas}</td><td>${fmt(p.kda, 2)}</td>
                <td>${Math.round(p.dmgMedio)}</td><td>${Math.round(p.danoRealMedio)}</td><td>${fmt(p.noqueosPorPartida)}</td>
                <td>${fmt(p.hsMedio)}</td><td>${fmt(p.posMedia)}</td>
            </tr>`).join('')}</tbody>
    </table></div>`;
}

function tablaApoyo(plantilla) {
    return `<div class="tabla-scroll"><table class="tabla-informe">
        <thead><tr><th>Jugador</th><th>Curación</th><th>Ayudar a levantarse</th><th>Resurrección</th><th>Asistencias</th></tr></thead>
        <tbody>${plantilla.map(p => `
            <tr><td><strong>${esc(p.jugador.nick)}</strong><br><small>${nombreRolJugador(p.jugador.rol)}</small></td>
            <td>${Math.round(p.curacionMedia)}</td><td>${fmt(p.levantarPorPartida)}</td><td>${fmt(p.resurreccionPorPartida)}</td>
            <td>${fmt(p.partidas ? p.asistencias / p.partidas : 0)}</td></tr>`).join('')}</tbody>
    </table></div>`;
}

function tablaRosters(teams, partidas) {
    const filas = teams.map(t => ({ t, r: resumenEquipo(partidas.filter(m => m.teamId === t.id)) }))
        .filter(x => x.r.partidas).sort((a, b) => b.r.puntosPorPartida - a.r.puntosPorPartida);
    if (!filas.length) return '<p class="vacio">Sin partidas.</p>';
    return `<div class="tabla-scroll"><table class="tabla-informe">
        <thead><tr><th>Roster</th><th>Partidas</th><th>Booyahs</th><th>Top 3</th><th>Posición media</th><th>Bajas/partida</th><th>K/D</th><th>Pts/partida</th></tr></thead>
        <tbody>${filas.map(({ t, r }) => `
            <tr><td>${logoHTML(t.logo, t.nombre, 'logo-mini')} <strong>${esc(t.nombre)}</strong></td><td>${r.partidas}</td><td>${r.booyahs}</td>
            <td>${pct(r.tasaTop3)}</td><td>${fmt(r.posMedia)}</td><td>${fmt(r.bajasPorPartida)}</td><td>${r.kd === null ? '—' : fmt(r.kd, 2)}</td>
            <td><strong>${fmt(r.puntosPorPartida)}</strong></td></tr>`).join('')}</tbody>
    </table></div>`;
}

function imprimirInforme() {
    window.print();
}

// ============================================================
// Respaldo: descarga en JSON todo lo que el usuario puede ver
// ============================================================
async function exportarDatos() {
    const equipos = await Auth.equiposVisibles();
    const datos = {
        exportado: new Date().toISOString(),
        orgs: await Auth.orgsVisibles(),
        equipos,
        jugadores: (await DB.jugadores()).filter(p => equipos.some(t => t.id === p.teamId)),
        partidas: await DB.partidas(equipos.map(t => t.id))
    };
    const blob = new Blob([JSON.stringify(datos, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `pumas-devlab-${fechaLocal(new Date())}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
}

window.addEventListener('DOMContentLoaded', () => {
    try {
        if (localStorage.getItem('pumasDevLab.menuColapsado')) document.body.classList.add('sb-colapsado');
    } catch (e) { /* sin almacenamiento */ }
    // Catálogos en los selects
    const opcMapas = CATALOGO.mapas.map(m => `<option value="${m}">${m}</option>`).join('');
    const opcEventos = CATALOGO.eventos.map(e => `<option value="${e.id}">${e.nombre}</option>`).join('');
    $('#form-partida').mapa.innerHTML = opcMapas;
    $('#form-partida').evento.innerHTML = opcEventos;
    $('#filtros-informe').mapa.innerHTML = '<option value="">Todos los mapas</option>' + opcMapas;
    $('#filtros-informe').evento.innerHTML = '<option value="">Todos los eventos</option>' + opcEventos;
    iniciarApp();
});
