// ============================================================
// PUMAS DEV LAB · Módulo Administrativo
// ------------------------------------------------------------
// Equipo · Miembros · Presupuesto (USD) · Torneos · Resultados
// Todo vive en admin_registros (supabase/migrations/009_administrativo.sql)
// y solo lo ven admin, CEO y manager de la organización.
// Es la entrada por defecto del manager.
// ============================================================

const ADM_TABS = [
    { id: 'equipo', n: 'Equipo', i: 'fa-shield-cat' },
    { id: 'miembros', n: 'Miembros', i: 'fa-id-card-clip' },
    { id: 'presupuesto', n: 'Presupuesto', i: 'fa-wallet' },
    { id: 'torneos', n: 'Torneos', i: 'fa-trophy' },
    { id: 'resultados', n: 'Resultados', i: 'fa-chart-pie' }
];
const ADM_ROLES_EXT = ['Editor', 'Diseñador', 'Community manager', 'Creador de contenido', 'Staff', 'Analista externo', 'Otro'];
const ADM_CATEGORIAS = ['Sueldos', 'Inscripciones', 'Premios', 'Patrocinio', 'Hardware', 'Viáticos', 'Internet / servicios', 'Publicidad', 'Otro'];
const ADM_TIPOS_PAGO = ['PayPal', 'Binance', 'Zinli', 'Transferencia', 'Nequi / Daviplata', 'Western Union', 'Efectivo', 'Otro'];
const ADM_FASES = ['Clasificatoria', 'Grupos', 'Cuartos', 'Semifinal', 'Final'];

const adm = { tab: 'equipo', regs: [], usuarios: [], teams: [], jugadores: [], org: null, filtroMiembros: 'todos', buscar: '', mes: null, torneosVista: 'torneo', res: { esport: '', roster: '', tipo: '' } };

// ---------- Utilidades ----------
const usd = n => (Number(n) || 0).toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 });
const admDe = tipo => adm.regs.filter(r => r.tipo === tipo);
const admPerfil = () => admDe('perfil')[0] || {};
const hoyISO = () => fechaLocal(new Date());
const mesISO = (f = new Date()) => fechaLocal(f).slice(0, 7);
const aUTC = (fecha, hora) => fecha ? new Date(`${fecha}T${hora || '00:00'}`).toISOString() : null;
const fechaCorta = f => f ? new Date(f + 'T12:00').toLocaleDateString('es', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
const soloDigitos = s => String(s || '').replace(/\D/g, '');
const nombreRoster = id => (adm.teams.find(t => t.id === id) || {}).nombre || '';
const topTxt = t => t ? `TOP ${t}` : 'Sin resultado';

function admNumero(v) {
    const n = Number(String(v ?? '').replace(',', '.'));
    return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
}

// ---------- Carga ----------
async function renderAdmin() {
    const cont = $('#adm-contenido');
    $('#adm-tabs').innerHTML = ADM_TABS.map(t => `
        <button type="button" class="${t.id === adm.tab ? 'activo' : ''}" onclick="admTab('${t.id}')"><i class="fa-solid ${t.i}"></i><span>${t.n}</span></button>`).join('');
    cont.innerHTML = '<p class="ayuda">Cargando…</p>';
    try {
        const orgId = Auth.orgActivaId;
        if (!orgId) { cont.innerHTML = '<p class="ayuda">Primero crea una organización.</p>'; return; }
        const [regs, usuarios, teams, jugadores, orgs] = await Promise.all([
            DB.adminRegistros(orgId), Auth.usuariosVisibles(), Auth.equiposVisibles(), DB.jugadores(), Auth.orgsVisibles()
        ]);
        adm.regs = regs;
        adm.usuarios = usuarios.filter(u => u.orgId === orgId);
        adm.teams = teams;
        adm.jugadores = jugadores.filter(j => teams.some(t => t.id === j.teamId));
        adm.org = orgs[0] || null;
        admPintar();
    } catch (err) {
        cont.innerHTML = `<div class="nota nota-alerta"><div><strong>No se pudo abrir el módulo</strong><p>${esc(err.message)}</p></div></div>`;
    }
}

function admTab(id) {
    adm.tab = id;
    $$('#adm-tabs button').forEach((b, i) => b.classList.toggle('activo', ADM_TABS[i].id === id));
    admPintar();
}

function admPintar() {
    const f = { equipo: admEquipo, miembros: admMiembros, presupuesto: admPresupuesto, torneos: admTorneos, resultados: admResultados }[adm.tab];
    $('#adm-contenido').innerHTML = f();
}

async function admGuardar(tipo, datos, id = null) {
    try {
        const nuevoId = await DB.guardarAdmin(Auth.orgActivaId, tipo, datos, id);
        const fila = { ...datos, id: nuevoId, tipo };
        const i = adm.regs.findIndex(r => r.id === nuevoId);
        if (i >= 0) adm.regs[i] = { ...adm.regs[i], ...fila }; else adm.regs.push(fila);
        return nuevoId;
    } catch (err) { toast(err.message, 'error'); throw err; }
}

async function admBorrar(id, pregunta = '¿Borrar este registro?') {
    if (!confirm(pregunta)) return;
    try {
        await DB.borrarAdmin(id);
        adm.regs = adm.regs.filter(r => r.id !== id);
        admCerrarHoja();
        admPintar();
        toast('Borrado.');
    } catch (err) { toast(err.message, 'error'); }
}

// ---------- Hoja (formulario emergente; en el celular sube desde abajo) ----------
function admAbrirHoja(html) {
    $('#adm-hoja-cont').innerHTML = html;
    $('#adm-hoja').hidden = false;
    document.body.classList.add('adm-hoja-abierta');
    const primero = $('#adm-hoja-cont input:not([type=hidden]), #adm-hoja-cont select');
    if (primero && window.innerWidth > 700) primero.focus();
}

function admCerrarHoja() {
    $('#adm-hoja').hidden = true;
    document.body.classList.remove('adm-hoja-abierta');
}

const campo = (label, input, extra = '') => `<label class="adm-campo ${extra}"><span>${label}</span>${input}</label>`;
const opciones = (lista, actual, vacio = '') => (vacio ? `<option value="">${vacio}</option>` : '') +
    lista.map(x => { const v = typeof x === 'string' ? x : x.v, n = typeof x === 'string' ? x : x.n; return `<option value="${esc(v)}" ${String(v) === String(actual ?? '') ? 'selected' : ''}>${esc(n)}</option>`; }).join('');
const kpiAdm = (valor, etiqueta, clase = '') => `<div class="adm-kpi ${clase}"><strong>${valor}</strong><span>${etiqueta}</span></div>`;

// ============================================================
// EQUIPO
// ============================================================
function admEquipo() {
    const p = admPerfil(), org = adm.org || {};
    const redes = [['instagram', 'fa-instagram', 'https://instagram.com/'], ['tiktok', 'fa-tiktok', 'https://tiktok.com/@'], ['youtube', 'fa-youtube', 'https://youtube.com/@'], ['discord', 'fa-discord', ''], ['whatsapp', 'fa-whatsapp', 'https://wa.me/']]
        .filter(([k]) => p[k]).map(([k, i, base]) => {
            const v = p[k];
            const url = /^https?:\/\//.test(v) ? v : base ? base + (k === 'whatsapp' ? soloDigitos(v) : v.replace(/^@/, '')) : '';
            return url ? `<a class="btn-sec" href="${esc(url)}" target="_blank" rel="noopener noreferrer"><i class="fa-brands ${i}"></i> ${esc(v)}</a>` : `<span class="btn-sec"><i class="fa-brands ${i}"></i> ${esc(v)}</span>`;
        }).join('');
    const torneos = admDe('torneo').length + admDe('relampago').length;
    return `
    <div class="adm-kpis">
        ${kpiAdm(adm.teams.length, 'Rosters')}
        ${kpiAdm(adm.jugadores.filter(j => j.activo !== false).length, 'Jugadores activos')}
        ${kpiAdm(admListaMiembros().length, 'Miembros')}
        ${kpiAdm(torneos, 'Torneos y relámpagos')}
    </div>
    <div class="card-box adm-perfil">
        <div class="adm-perfil-cab">
            ${logoHTML(org.logo, org.nombre || 'Equipo', 'logo-grande')}
            <div><h3>${esc(org.nombre || 'Equipo')}</h3>
                <p class="ayuda">${[p.pais, p.fundacion && 'Desde ' + fechaCorta(p.fundacion), (p.esports || 'Free Fire')].filter(Boolean).map(esc).join(' · ')}</p></div>
            <button type="button" class="btn-sec" onclick="admEditarPerfil()"><i class="fa-solid fa-pen"></i> Editar</button>
        </div>
        ${p.descripcion ? `<p>${esc(p.descripcion)}</p>` : '<p class="ayuda">Agrega la descripción, el país, la fecha de fundación y las redes del equipo con Editar.</p>'}
        ${redes ? `<div class="adm-redes">${redes}</div>` : ''}
    </div>
    <div class="card-box">
        <h3 class="card-titulo"><i class="fa-solid fa-people-group"></i> Rosters</h3>
        ${adm.teams.length ? `<div class="adm-rosters">${adm.teams.map(t => {
            const js = adm.jugadores.filter(j => j.teamId === t.id && j.activo !== false);
            const staff = adm.usuarios.filter(u => u.equipos.includes(t.id));
            return `<div class="adm-roster">${logoHTML(t.logo, t.nombre)}<div><strong>${esc(t.nombre)}</strong>
                <small>${js.length} jugador${js.length === 1 ? '' : 'es'}${staff.length ? ` · ${staff.length} staff` : ''}</small>
                <small class="ayuda">${js.map(j => esc(j.nick)).join(', ') || 'Sin jugadores'}</small></div></div>`;
        }).join('')}</div>` : '<p class="ayuda">Aún no hay rosters. Créalos en Equipos y jugadores.</p>'}
    </div>`;
}

function admEditarPerfil() {
    const p = admPerfil();
    admAbrirHoja(`
    <form class="adm-form" onsubmit="admGuardarPerfil(event)">
        <h3><i class="fa-solid fa-shield-cat"></i> Datos del equipo</h3>
        ${campo('Descripción', `<textarea name="descripcion" rows="3" maxlength="600">${esc(p.descripcion || '')}</textarea>`, 'ancho')}
        <div class="adm-grid">
            ${campo('País', `<input name="pais" maxlength="40" value="${esc(p.pais || '')}">`)}
            ${campo('Fundación', `<input name="fundacion" type="date" value="${esc(p.fundacion || '')}">`)}
            ${campo('E-sports (separados por coma)', `<input name="esports" maxlength="120" value="${esc(p.esports || 'Free Fire')}">`, 'ancho')}
            ${campo('Instagram', `<input name="instagram" maxlength="80" placeholder="@usuario" value="${esc(p.instagram || '')}">`)}
            ${campo('TikTok', `<input name="tiktok" maxlength="80" placeholder="@usuario" value="${esc(p.tiktok || '')}">`)}
            ${campo('YouTube', `<input name="youtube" maxlength="80" placeholder="@canal" value="${esc(p.youtube || '')}">`)}
            ${campo('Discord', `<input name="discord" maxlength="120" placeholder="Enlace o servidor" value="${esc(p.discord || '')}">`)}
            ${campo('WhatsApp', `<input name="whatsapp" maxlength="30" inputmode="tel" placeholder="+57 300 000 0000" value="${esc(p.whatsapp || '')}">`)}
            ${campo('Presupuesto mensual (USD)', `<input name="presupuestoMensual" type="number" min="0" step="0.01" inputmode="decimal" value="${esc(p.presupuestoMensual ?? '')}">`)}
        </div>
        <div class="adm-botones"><button type="submit" class="btn-generar">GUARDAR</button><button type="button" class="btn-sec" onclick="admCerrarHoja()">Cancelar</button></div>
    </form>`);
}

async function admGuardarPerfil(e) {
    e.preventDefault();
    const d = Object.fromEntries(new FormData(e.target));
    d.presupuestoMensual = d.presupuestoMensual === '' ? null : admNumero(d.presupuestoMensual);
    const p = admPerfil();
    await admGuardar('perfil', { ...p, ...d }, p.id || null);
    admCerrarHoja(); admPintar(); toast('Datos del equipo guardados.');
}

// ============================================================
// MIEMBROS: usuarios del sistema + jugadores + externos (editores…)
// ============================================================
function admFicha(ref) {
    return admDe('miembro').find(m => m.ref === ref) || null;
}

function admListaMiembros() {
    const lista = [];
    adm.usuarios.forEach(u => lista.push({ ref: 'u:' + u.id, nombre: u.nombre, sub: `@${u.usuario} · ${ROLES[u.rol]?.nombre || u.rol}`, origen: 'usuario', activo: u.activo !== false, ficha: admFicha('u:' + u.id) }));
    adm.jugadores.forEach(j => lista.push({ ref: 'p:' + j.id, nombre: j.nick, sub: [j.nombre, nombreRoster(j.teamId), nombreRolJugador(j.rol), j.igl ? 'IGL' : ''].filter(Boolean).join(' · '), origen: 'jugador', activo: j.activo !== false, ficha: admFicha('p:' + j.id) }));
    admDe('miembro').filter(m => !m.ref).forEach(m => lista.push({ ref: 'x:' + m.id, nombre: m.nombre || 'Sin nombre', sub: m.rolExt || 'Externo', origen: 'externo', activo: m.activo !== false, ficha: m }));
    return lista;
}

function admMiembros() {
    const filtros = [['todos', 'Todos'], ['usuario', 'Usuarios'], ['jugador', 'Jugadores'], ['externo', 'Externos']];
    const q = adm.buscar.trim().toLowerCase();
    const todos = admListaMiembros();
    const lista = todos.filter(m => (adm.filtroMiembros === 'todos' || m.origen === adm.filtroMiembros) && (!q || (m.nombre + ' ' + m.sub).toLowerCase().includes(q)));
    const nomina = todos.reduce((s, m) => s + (Number(m.ficha?.sueldo) || 0), 0);
    return `
    <div class="adm-barra">
        <div class="adm-chips">${filtros.map(([id, n]) => `<button type="button" class="${adm.filtroMiembros === id ? 'activo' : ''}" onclick="adm.filtroMiembros='${id}'; admPintar()">${n} <em>${id === 'todos' ? todos.length : todos.filter(m => m.origen === id).length}</em></button>`).join('')}</div>
        <input type="search" placeholder="Buscar miembro" value="${esc(adm.buscar)}" oninput="adm.buscar=this.value; admRepintarMiembros()" aria-label="Buscar miembro">
        <button type="button" class="btn-generar" onclick="admEditarMiembro(null)"><i class="fa-solid fa-user-plus"></i> Externo</button>
    </div>
    <p class="ayuda">Usuarios del sistema y jugadores salen solos; agrega aquí a quienes no tienen usuario (editores, diseñadores…). Nómina mensual: <strong>${usd(nomina)}</strong></p>
    <div id="adm-miembros" class="adm-miembros">${admTarjetasMiembros(lista)}</div>`;
}

function admRepintarMiembros() {
    const q = adm.buscar.trim().toLowerCase();
    const lista = admListaMiembros().filter(m => (adm.filtroMiembros === 'todos' || m.origen === adm.filtroMiembros) && (!q || (m.nombre + ' ' + m.sub).toLowerCase().includes(q)));
    $('#adm-miembros').innerHTML = admTarjetasMiembros(lista);
}

function admTarjetasMiembros(lista) {
    if (!lista.length) return '<p class="ayuda">No hay miembros con ese filtro.</p>';
    const etiqueta = { usuario: 'Usuario', jugador: 'Jugador', externo: 'Externo' };
    return lista.map(m => {
        const f = m.ficha || {};
        const metodo = admDe('metodo_pago').find(x => x.id === f.metodoPago);
        const contactos = [
            f.whatsapp && `<a class="adm-ico wa" href="https://wa.me/${soloDigitos(f.whatsapp)}" target="_blank" rel="noopener noreferrer" title="WhatsApp ${esc(f.whatsapp)}"><i class="fa-brands fa-whatsapp"></i></a>`,
            f.correo && `<a class="adm-ico" href="mailto:${esc(f.correo)}" title="${esc(f.correo)}"><i class="fa-solid fa-envelope"></i></a>`,
            f.discord && `<button type="button" class="adm-ico" onclick="admCopiar('${esc(f.discord)}', 'Discord copiado')" title="Discord: ${esc(f.discord)}"><i class="fa-brands fa-discord"></i></button>`,
            f.instagram && `<a class="adm-ico" href="https://instagram.com/${esc(f.instagram.replace(/^@/, ''))}" target="_blank" rel="noopener noreferrer" title="${esc(f.instagram)}"><i class="fa-brands fa-instagram"></i></a>`
        ].filter(Boolean).join('');
        return `<div class="adm-miembro ${m.activo ? '' : 'inactivo'}">
            <div class="adm-avatar o-${m.origen}">${esc(iniciales(m.nombre))}</div>
            <div class="adm-miembro-txt">
                <strong>${esc(m.nombre)}</strong>
                <small>${esc(m.sub)}</small>
                <div class="adm-etiquetas"><span class="adm-tag o-${m.origen}">${etiqueta[m.origen]}</span>
                    ${f.idJuego ? `<span class="adm-tag">ID ${esc(f.idJuego)}</span>` : ''}
                    ${Number(f.sueldo) ? `<span class="adm-tag dinero">${usd(f.sueldo)}/mes${metodo ? ' · ' + esc(metodo.nombre) : ''}</span>` : ''}
                    ${m.activo ? '' : '<span class="adm-tag">Inactivo</span>'}</div>
            </div>
            <div class="adm-miembro-acc">${contactos}<button type="button" class="adm-ico" onclick="admEditarMiembro('${m.ref}')" title="Editar ficha"><i class="fa-solid fa-pen"></i></button></div>
        </div>`;
    }).join('');
}

function admEditarMiembro(ref) {
    const m = ref ? admListaMiembros().find(x => x.ref === ref) : null;
    const externo = !m || m.origen === 'externo';
    const f = (m && m.ficha) || {};
    admAbrirHoja(`
    <form class="adm-form" onsubmit="admGuardarMiembro(event, '${ref || ''}')">
        <h3><i class="fa-solid fa-id-card"></i> ${m ? esc(m.nombre) : 'Nuevo miembro externo'}</h3>
        ${m && !externo ? `<p class="ayuda">${esc(m.sub)}</p>` : ''}
        <div class="adm-grid">
            ${externo ? campo('Nombre', `<input name="nombre" required maxlength="60" value="${esc(f.nombre || '')}">`) + campo('Rol', `<select name="rolExt">${opciones(ADM_ROLES_EXT, f.rolExt || 'Editor')}</select>`) : ''}
            ${campo('WhatsApp', `<input name="whatsapp" inputmode="tel" maxlength="30" placeholder="+57 300 000 0000" value="${esc(f.whatsapp || '')}">`)}
            ${campo('Correo', `<input name="correo" type="email" maxlength="80" value="${esc(f.correo || '')}">`)}
            ${campo('Discord', `<input name="discord" maxlength="60" value="${esc(f.discord || '')}">`)}
            ${campo('Instagram', `<input name="instagram" maxlength="60" placeholder="@usuario" value="${esc(f.instagram || '')}">`)}
            ${campo('ID de juego', `<input name="idJuego" maxlength="30" inputmode="numeric" placeholder="ID de Free Fire" value="${esc(f.idJuego || '')}">`)}
            ${campo('Sueldo mensual (USD)', `<input name="sueldo" type="number" min="0" step="0.01" inputmode="decimal" value="${esc(f.sueldo ?? '')}">`)}
            ${campo('Método de pago', `<select name="metodoPago">${opciones(admDe('metodo_pago').map(x => ({ v: x.id, n: x.nombre })), f.metodoPago, '— Sin definir —')}</select>`)}
            ${externo ? campo('Estado', `<select name="activo">${opciones([{ v: 'true', n: 'Activo' }, { v: 'false', n: 'Inactivo' }], String(f.activo !== false))}</select>`) : ''}
            ${campo('Notas', `<textarea name="notas" rows="2" maxlength="400">${esc(f.notas || '')}</textarea>`, 'ancho')}
        </div>
        <div class="adm-botones">
            <button type="submit" class="btn-generar">GUARDAR</button>
            <button type="button" class="btn-sec" onclick="admCerrarHoja()">Cancelar</button>
            ${f.id ? `<button type="button" class="btn-sec btn-peligro" onclick="admBorrar('${f.id}', '${externo ? '¿Borrar este miembro?' : '¿Borrar la ficha (contacto y sueldo)? El usuario o jugador no se borra.'}')"><i class="fa-solid fa-trash"></i></button>` : ''}
        </div>
    </form>`);
}

async function admGuardarMiembro(e, ref) {
    e.preventDefault();
    const d = Object.fromEntries(new FormData(e.target));
    d.sueldo = d.sueldo === '' ? null : admNumero(d.sueldo);
    if ('activo' in d) d.activo = d.activo === 'true';
    const m = ref ? admListaMiembros().find(x => x.ref === ref) : null;
    const previa = m && m.ficha;
    if (m && m.origen !== 'externo') d.ref = ref;
    await admGuardar('miembro', { ...(previa || {}), ...d }, previa ? previa.id : null);
    admCerrarHoja(); admPintar(); toast('Ficha guardada.');
}

function admCopiar(texto, aviso = 'Copiado') {
    navigator.clipboard.writeText(texto).then(() => toast(aviso), () => prompt('Copia el texto:', texto));
}

// ============================================================
// PRESUPUESTO (USD): movimientos, sueldos y métodos de pago
// ============================================================
function admPresupuesto() {
    const mes = adm.mes || mesISO();
    const movs = admDe('movimiento').filter(m => (m.fecha || '').startsWith(mes)).sort((a, b) => (b.fecha || '').localeCompare(a.fecha || ''));
    const ingresos = movs.filter(m => m.clase === 'ingreso').reduce((s, m) => s + (Number(m.monto) || 0), 0);
    const egresos = movs.filter(m => m.clase !== 'ingreso').reduce((s, m) => s + (Number(m.monto) || 0), 0);
    const presupuesto = Number(admPerfil().presupuestoMensual) || 0;
    const conSueldo = admListaMiembros().filter(m => Number(m.ficha?.sueldo) > 0 && m.activo);
    const nomina = conSueldo.reduce((s, m) => s + Number(m.ficha.sueldo), 0);
    const usado = presupuesto ? Math.min(100, egresos / presupuesto * 100) : 0;
    const porCategoria = {};
    movs.filter(m => m.clase !== 'ingreso').forEach(m => { porCategoria[m.categoria || 'Otro'] = (porCategoria[m.categoria || 'Otro'] || 0) + (Number(m.monto) || 0); });
    const maxCat = Math.max(1, ...Object.values(porCategoria));
    const metodos = admDe('metodo_pago');
    const nombreMetodo = id => (metodos.find(x => x.id === id) || {}).nombre || '';

    return `
    <div class="adm-barra">
        <label class="adm-mes"><i class="fa-solid fa-calendar"></i><input type="month" value="${mes}" onchange="adm.mes=this.value; admPintar()" aria-label="Mes"></label>
        <button type="button" class="btn-generar" onclick="admEditarMovimiento(null, 'egreso')"><i class="fa-solid fa-minus"></i> Egreso</button>
        <button type="button" class="btn-sec" onclick="admEditarMovimiento(null, 'ingreso')"><i class="fa-solid fa-plus"></i> Ingreso</button>
    </div>
    <div class="adm-kpis">
        ${kpiAdm(presupuesto ? usd(presupuesto) : '—', 'Presupuesto del mes')}
        ${kpiAdm(usd(ingresos), 'Ingresos', 'bien')}
        ${kpiAdm(usd(egresos), 'Egresos', 'mal')}
        ${kpiAdm(usd(ingresos - egresos), 'Balance', ingresos - egresos >= 0 ? 'bien' : 'mal')}
        ${kpiAdm(usd(nomina), 'Sueldos por mes')}
        ${presupuesto ? kpiAdm(usd(presupuesto - egresos), 'Disponible', presupuesto - egresos >= 0 ? 'bien' : 'mal') : ''}
    </div>
    ${presupuesto ? `<div class="adm-progreso ${usado >= 100 ? 'mal' : usado > 80 ? 'alerta' : ''}"><i style="width:${usado}%"></i><span>${Math.round(egresos / presupuesto * 100)}% del presupuesto usado</span></div>`
        : `<p class="ayuda">Define el presupuesto mensual en <a href="#" onclick="admTab('equipo'); admEditarPerfil(); return false">Equipo → Editar</a>.</p>`}

    <div class="adm-dos">
        <div class="card-box">
            <h3 class="card-titulo"><i class="fa-solid fa-receipt"></i> Movimientos del mes</h3>
            ${movs.length ? `<div class="adm-lista">${movs.map(m => `
                <button type="button" class="adm-fila" onclick="admEditarMovimiento('${m.id}')">
                    <span class="adm-fila-ico ${m.clase === 'ingreso' ? 'bien' : 'mal'}"><i class="fa-solid ${m.clase === 'ingreso' ? 'fa-arrow-down' : 'fa-arrow-up'}"></i></span>
                    <span class="adm-fila-txt"><strong>${esc(m.concepto || m.categoria || 'Movimiento')}</strong><small>${fechaCorta(m.fecha)} · ${esc(m.categoria || '')}${m.metodoPago ? ' · ' + esc(nombreMetodo(m.metodoPago)) : ''}</small></span>
                    <span class="adm-monto ${m.clase === 'ingreso' ? 'bien' : 'mal'}">${m.clase === 'ingreso' ? '+' : '−'}${usd(m.monto)}</span>
                </button>`).join('')}</div>` : '<p class="ayuda">Sin movimientos este mes.</p>'}
            ${Object.keys(porCategoria).length ? `<h4 class="adm-sub">Egresos por categoría</h4>${Object.entries(porCategoria).sort((a, b) => b[1] - a[1]).map(([c, v]) => `
                <div class="tb-barra"><span>${esc(c)}</span><i><b style="width:${v / maxCat * 100}%"></b></i><strong>${usd(v)}</strong></div>`).join('')}` : ''}
        </div>
        <div>
            <div class="card-box">
                <h3 class="card-titulo"><i class="fa-solid fa-money-check-dollar"></i> Sueldos de ${new Date(mes + '-15').toLocaleDateString('es', { month: 'long' })}</h3>
                ${conSueldo.length ? `<div class="adm-lista">${conSueldo.map(m => {
                    const pagado = admDe('movimiento').some(x => x.pagoSueldo === `${m.ref}|${mes}`);
                    return `<div class="adm-fila"><span class="adm-fila-txt"><strong>${esc(m.nombre)}</strong><small>${esc(nombreMetodo(m.ficha.metodoPago) || 'Sin método')}</small></span>
                        <span class="adm-monto">${usd(m.ficha.sueldo)}</span>
                        ${pagado ? '<span class="adm-tag bien">Pagado</span>' : `<button type="button" class="btn-sec" onclick="admPagarSueldo('${m.ref}')">Pagar</button>`}</div>`;
                }).join('')}</div>
                <button type="button" class="btn-sec tb-ancho" style="margin-top:8px" onclick="admPagarSueldos()"><i class="fa-solid fa-check-double"></i> Registrar todos los pendientes</button>`
                : '<p class="ayuda">Nadie tiene sueldo. Ponlo en la ficha de cada miembro (Miembros → ✎).</p>'}
            </div>
            <div class="card-box">
                <h3 class="card-titulo"><i class="fa-solid fa-credit-card"></i> Métodos de pago</h3>
                ${metodos.length ? `<div class="adm-lista">${metodos.map(x => `
                    <button type="button" class="adm-fila" onclick="admEditarMetodo('${x.id}')">
                        <span class="adm-fila-ico"><i class="fa-solid ${x.tipo === 'Binance' ? 'fa-coins' : x.tipo === 'Efectivo' ? 'fa-money-bill' : 'fa-building-columns'}"></i></span>
                        <span class="adm-fila-txt"><strong>${esc(x.nombre)}</strong><small>${esc([x.tipo, x.detalle].filter(Boolean).join(' · '))}</small></span>
                    </button>`).join('')}</div>` : '<p class="ayuda">Agrega cómo pagas y cobras (PayPal, Binance, transferencia…).</p>'}
                <button type="button" class="btn-sec tb-ancho" style="margin-top:8px" onclick="admEditarMetodo(null)"><i class="fa-solid fa-plus"></i> Método de pago</button>
            </div>
        </div>
    </div>`;
}

function admEditarMovimiento(id, clase = 'egreso') {
    const m = id ? admDe('movimiento').find(x => x.id === id) : { clase, fecha: hoyISO(), categoria: clase === 'ingreso' ? 'Premios' : 'Otro' };
    admAbrirHoja(`
    <form class="adm-form" onsubmit="admGuardarMovimiento(event, '${id || ''}')">
        <h3><i class="fa-solid fa-receipt"></i> ${id ? 'Movimiento' : m.clase === 'ingreso' ? 'Nuevo ingreso' : 'Nuevo egreso'}</h3>
        <div class="adm-segmento">
            <label><input type="radio" name="clase" value="egreso" ${m.clase !== 'ingreso' ? 'checked' : ''}><span>Egreso</span></label>
            <label><input type="radio" name="clase" value="ingreso" ${m.clase === 'ingreso' ? 'checked' : ''}><span>Ingreso</span></label>
        </div>
        <div class="adm-grid">
            ${campo('Monto (USD)', `<input name="monto" type="number" min="0" step="0.01" inputmode="decimal" required value="${esc(m.monto ?? '')}" class="adm-grande">`)}
            ${campo('Fecha', `<input name="fecha" type="date" required value="${esc(m.fecha || hoyISO())}">`)}
            ${campo('Concepto', `<input name="concepto" maxlength="80" value="${esc(m.concepto || '')}" placeholder="Ej. Inscripción liga">`, 'ancho')}
            ${campo('Categoría', `<select name="categoria">${opciones(ADM_CATEGORIAS, m.categoria)}</select>`)}
            ${campo('Método de pago', `<select name="metodoPago">${opciones(admDe('metodo_pago').map(x => ({ v: x.id, n: x.nombre })), m.metodoPago, '— Sin definir —')}</select>`)}
        </div>
        <div class="adm-botones">
            <button type="submit" class="btn-generar">GUARDAR</button>
            <button type="button" class="btn-sec" onclick="admCerrarHoja()">Cancelar</button>
            ${id ? `<button type="button" class="btn-sec btn-peligro" onclick="admBorrar('${id}')"><i class="fa-solid fa-trash"></i></button>` : ''}
        </div>
    </form>`);
}

async function admGuardarMovimiento(e, id) {
    e.preventDefault();
    const d = Object.fromEntries(new FormData(e.target));
    d.monto = admNumero(d.monto);
    const previo = id ? admDe('movimiento').find(x => x.id === id) : {};
    await admGuardar('movimiento', { ...previo, ...d }, id || null);
    adm.mes = d.fecha.slice(0, 7);
    admCerrarHoja(); admPintar(); toast('Movimiento guardado.');
}

async function admPagarSueldo(ref, silencioso = false) {
    const mes = adm.mes || mesISO();
    const m = admListaMiembros().find(x => x.ref === ref);
    if (!m || !Number(m.ficha?.sueldo)) return;
    if (admDe('movimiento').some(x => x.pagoSueldo === `${ref}|${mes}`)) return;
    const fecha = mes === mesISO() ? hoyISO() : `${mes}-28`;
    await admGuardar('movimiento', { clase: 'egreso', monto: Number(m.ficha.sueldo), fecha, concepto: `Sueldo ${m.nombre}`, categoria: 'Sueldos', metodoPago: m.ficha.metodoPago || '', pagoSueldo: `${ref}|${mes}` });
    if (!silencioso) { admPintar(); toast(`Sueldo de ${m.nombre} registrado.`); }
}

async function admPagarSueldos() {
    const mes = adm.mes || mesISO();
    const pendientes = admListaMiembros().filter(m => Number(m.ficha?.sueldo) > 0 && m.activo && !admDe('movimiento').some(x => x.pagoSueldo === `${m.ref}|${mes}`));
    if (!pendientes.length) return toast('No hay sueldos pendientes este mes.');
    const total = pendientes.reduce((s, m) => s + Number(m.ficha.sueldo), 0);
    if (!confirm(`¿Registrar ${pendientes.length} sueldo(s) por ${usd(total)} como pagados?`)) return;
    for (const m of pendientes) await admPagarSueldo(m.ref, true);
    admPintar(); toast('Sueldos registrados.');
}

function admEditarMetodo(id) {
    const m = id ? admDe('metodo_pago').find(x => x.id === id) : { tipo: 'PayPal' };
    admAbrirHoja(`
    <form class="adm-form" onsubmit="admGuardarMetodo(event, '${id || ''}')">
        <h3><i class="fa-solid fa-credit-card"></i> Método de pago</h3>
        <div class="adm-grid">
            ${campo('Tipo', `<select name="tipo">${opciones(ADM_TIPOS_PAGO, m.tipo)}</select>`)}
            ${campo('Nombre', `<input name="nombre" required maxlength="40" value="${esc(m.nombre || '')}" placeholder="Ej. PayPal del equipo">`)}
            ${campo('Detalle', `<input name="detalle" maxlength="80" value="${esc(m.detalle || '')}" placeholder="Titular o correo (sin claves)">`, 'ancho')}
        </div>
        <p class="ayuda">No guardes contraseñas ni números completos de tarjeta.</p>
        <div class="adm-botones">
            <button type="submit" class="btn-generar">GUARDAR</button>
            <button type="button" class="btn-sec" onclick="admCerrarHoja()">Cancelar</button>
            ${id ? `<button type="button" class="btn-sec btn-peligro" onclick="admBorrar('${id}')"><i class="fa-solid fa-trash"></i></button>` : ''}
        </div>
    </form>`);
}

async function admGuardarMetodo(e, id) {
    e.preventDefault();
    const d = Object.fromEntries(new FormData(e.target));
    await admGuardar('metodo_pago', d, id || null);
    admCerrarHoja(); admPintar(); toast('Método de pago guardado.');
}

// ============================================================
// TORNEOS y RELÁMPAGOS + calendario compartido
// ============================================================
function admEstadoTorneo(t) {
    const hoy = hoyISO();
    const fechas = (t.fases || []).map(f => f.fecha).filter(Boolean).sort();
    const ini = t.inicio || fechas[0], fin = t.fin || fechas[fechas.length - 1] || ini;
    if (t.top) return ['Finalizado', 'fin'];
    if (!ini || ini > hoy) return ['Próximo', 'prox'];
    if (fin && fin < hoy) return ['Finalizado', 'fin'];
    return ['En curso', 'curso'];
}

// Enlace "Agregar a Google Calendar" de un evento
function admLinkGoogle(titulo, utc, horas = 2, detalle = '') {
    if (!utc) return '';
    const f = d => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
    const ini = new Date(utc), fin = new Date(ini.getTime() + horas * 3600e3);
    return 'https://calendar.google.com/calendar/render?action=TEMPLATE&text=' + encodeURIComponent(titulo) +
        '&dates=' + f(ini) + '/' + f(fin) + '&details=' + encodeURIComponent(detalle);
}

function admEventos() {
    const ev = [];
    admDe('torneo').forEach(t => (t.fases || []).forEach((f, i) => f.utc && ev.push({
        utc: f.utc, fecha: f.fecha, hora: f.hora, horas: 3, id: t.id, tipo: 'torneo',
        titulo: `🏆 ${t.nombre || 'Torneo'} · ${f.nombre || 'Fase ' + (i + 1)}`,
        detalle: [t.organizador && 'Organiza: ' + t.organizador, t.premio && 'Premio: ' + t.premio, t.enlace].filter(Boolean).join('\n')
    })));
    admDe('relampago').forEach(r => r.utc && ev.push({
        utc: r.utc, fecha: r.fecha, hora: r.hora, horas: 1, id: r.id, tipo: 'relampago',
        titulo: `⚡ Relámpago · ${r.corp || ''}`.trim(),
        detalle: [r.costo != null && `Costo: ${usd(r.costo)}`, r.premio != null && `Premio: ${usd(r.premio)}`].filter(Boolean).join('\n')
    }));
    return ev.sort((a, b) => a.utc.localeCompare(b.utc));
}

function admUrlCalendario() {
    const c = admDe('calendario')[0];
    return c && c.token ? `${SUPABASE_URL}/functions/v1/calendario?t=${c.token}` : null;
}

function admTorneos() {
    const proximos = admEventos().filter(e => new Date(e.utc).getTime() > Date.now() - 3 * 3600e3).slice(0, 6);
    const url = admUrlCalendario();
    const torneos = admDe('torneo').sort((a, b) => (b.inicio || '').localeCompare(a.inicio || ''));
    const relampagos = admDe('relampago').sort((a, b) => (b.fecha || '').localeCompare(a.fecha || '') || (b.hora || '').localeCompare(a.hora || ''));
    return `
    <div class="adm-acciones-grandes">
        <button type="button" class="adm-gran relampago" onclick="admEditarRelampago(null)"><i class="fa-solid fa-bolt"></i><strong>Registrar relámpago</strong><small>Corp, costo, top y premio en segundos</small></button>
        <button type="button" class="adm-gran" onclick="admEditarTorneo(null)"><i class="fa-solid fa-trophy"></i><strong>Nuevo torneo</strong><small>Fases, fecha de inicio, premio y top</small></button>
    </div>

    <div class="card-box adm-calendario">
        <h3 class="card-titulo"><i class="fa-brands fa-google"></i> Calendario para jugadores y staff</h3>
        ${url ? `
            <p class="ayuda">Quien abra este enlace se suscribe en Google Calendar y verá cada torneo y relámpago que registres aquí, siempre actualizado.</p>
            <div class="adm-url"><input readonly value="${esc(url)}" onclick="this.select()" aria-label="Enlace del calendario"></div>
            <div class="adm-redes">
                <a class="btn-generar" href="https://calendar.google.com/calendar/r?cid=${encodeURIComponent(url.replace(/^https:/, 'webcal:'))}" target="_blank" rel="noopener noreferrer"><i class="fa-brands fa-google"></i> Abrir en Google Calendar</a>
                <a class="btn-sec" href="https://wa.me/?text=${encodeURIComponent(`📅 Calendario de torneos de ${adm.org?.nombre || 'el equipo'}. Ábrelo y agrégalo a tu Google Calendar: https://calendar.google.com/calendar/r?cid=${encodeURIComponent(url.replace(/^https:/, 'webcal:'))}`)}" target="_blank" rel="noopener noreferrer"><i class="fa-brands fa-whatsapp"></i> Enviar por WhatsApp</a>
                <button type="button" class="btn-sec" onclick="admCopiar('${esc(url)}', 'Enlace copiado')"><i class="fa-solid fa-copy"></i> Copiar</button>
                <button type="button" class="btn-sec" onclick="admDescargarICS()"><i class="fa-solid fa-download"></i> .ics</button>
            </div>`
        : `<p class="ayuda">Crea un enlace para que jugadores y staff vean los torneos en su Google Calendar (se actualiza solo).</p>
            <div class="adm-redes"><button type="button" class="btn-generar" onclick="admCrearCalendario()"><i class="fa-solid fa-link"></i> Crear calendario compartido</button>
            <button type="button" class="btn-sec" onclick="admDescargarICS()"><i class="fa-solid fa-download"></i> Descargar .ics</button></div>`}
        ${proximos.length ? `<h4 class="adm-sub">Próximos</h4><div class="adm-lista">${proximos.map(e => `
            <div class="adm-fila"><span class="adm-fila-ico ${e.tipo === 'relampago' ? 'rel' : ''}"><i class="fa-solid ${e.tipo === 'relampago' ? 'fa-bolt' : 'fa-trophy'}"></i></span>
                <span class="adm-fila-txt"><strong>${esc(e.titulo.replace(/^\S+\s/, ''))}</strong><small>${new Date(e.utc).toLocaleString('es', { weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</small></span>
                <a class="adm-ico" href="${esc(admLinkGoogle(e.titulo, e.utc, e.horas, e.detalle))}" target="_blank" rel="noopener noreferrer" title="Agregar a Google Calendar"><i class="fa-solid fa-calendar-plus"></i></a></div>`).join('')}</div>` : ''}
    </div>

    <div class="adm-chips">
        <button type="button" class="${adm.torneosVista === 'torneo' ? 'activo' : ''}" onclick="adm.torneosVista='torneo'; admPintar()"><i class="fa-solid fa-trophy"></i> Torneos <em>${torneos.length}</em></button>
        <button type="button" class="${adm.torneosVista === 'relampago' ? 'activo' : ''}" onclick="adm.torneosVista='relampago'; admPintar()"><i class="fa-solid fa-bolt"></i> Relámpagos <em>${relampagos.length}</em></button>
    </div>
    ${adm.torneosVista === 'torneo' ? (torneos.length ? `<div class="adm-torneos">${torneos.map(t => {
        const [estado, clase] = admEstadoTorneo(t);
        return `<button type="button" class="adm-torneo" onclick="admEditarTorneo('${t.id}')">
            <div class="adm-torneo-cab"><strong>${esc(t.nombre || 'Torneo')}</strong><span class="adm-estado ${clase}">${estado}</span></div>
            <small>${esc([t.esport || 'Free Fire', nombreRoster(t.roster), t.organizador].filter(Boolean).join(' · '))}</small>
            <div class="adm-torneo-datos">
                <span><i class="fa-solid fa-calendar"></i> ${fechaCorta(t.inicio)}</span>
                <span><i class="fa-solid fa-layer-group"></i> ${(t.fases || []).length} fase${(t.fases || []).length === 1 ? '' : 's'}</span>
                ${t.premio ? `<span><i class="fa-solid fa-sack-dollar"></i> ${esc(t.premio)}</span>` : ''}
                <span class="adm-top ${t.top && t.top <= 3 ? 'podio' : ''}">${topTxt(t.top)}</span>
            </div>
        </button>`;
    }).join('')}</div>` : '<p class="ayuda">Aún no hay torneos.</p>')
    : (relampagos.length ? `<div class="adm-lista">${relampagos.map(r => `
        <button type="button" class="adm-fila" onclick="admEditarRelampago('${r.id}')">
            <span class="adm-fila-ico rel"><i class="fa-solid fa-bolt"></i></span>
            <span class="adm-fila-txt"><strong>${esc(r.corp || 'Relámpago')}</strong><small>${fechaCorta(r.fecha)}${r.hora ? ' · ' + esc(r.hora) : ''}${r.roster ? ' · ' + esc(nombreRoster(r.roster)) : ''} · costo ${usd(r.costo)}</small></span>
            <span class="adm-top ${r.top && r.top <= 3 ? 'podio' : ''}">${topTxt(r.top)}</span>
            <span class="adm-monto ${Number(r.premio) ? 'bien' : ''}">${Number(r.premio) ? '+' + usd(r.premio) : ''}</span>
        </button>`).join('')}</div>` : '<p class="ayuda">Aún no hay relámpagos.</p>')}`;
}

// ----- Relámpago: formulario rápido pensado para el celular -----
function admEditarRelampago(id) {
    const r = id ? admDe('relampago').find(x => x.id === id) : { fecha: hoyISO(), hora: new Date().toTimeString().slice(0, 5), esport: 'Free Fire', roster: adm.teams[0]?.id || '', costo: 0 };
    const corps = [...new Set(admDe('relampago').map(x => x.corp).filter(Boolean))];
    admAbrirHoja(`
    <form class="adm-form" onsubmit="admGuardarRelampago(event, '${id || ''}')">
        <h3><i class="fa-solid fa-bolt"></i> ${id ? 'Relámpago' : 'Registrar relámpago'}</h3>
        ${campo('Corp / organizador', `<input name="corp" required maxlength="50" list="adm-corps" value="${esc(r.corp || '')}" class="adm-grande" autocomplete="off"><datalist id="adm-corps">${corps.map(c => `<option value="${esc(c)}">`).join('')}</datalist>`, 'ancho')}
        <div class="adm-grid">
            ${campo('Fecha', `<input name="fecha" type="date" required value="${esc(r.fecha || '')}">`)}
            ${campo('Hora', `<input name="hora" type="time" value="${esc(r.hora || '')}">`)}
            ${campo('Costo (USD)', `<input name="costo" type="number" min="0" step="0.01" inputmode="decimal" value="${esc(r.costo ?? 0)}" class="adm-grande">`)}
            ${campo('Premio ganado (USD)', `<input name="premio" type="number" min="0" step="0.01" inputmode="decimal" value="${esc(r.premio ?? '')}" class="adm-grande">`)}
        </div>
        <div class="adm-campo ancho"><span>Top alcanzado</span>
            <div class="adm-tops">${[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(n => `<label><input type="radio" name="top" value="${n}" ${Number(r.top) === n ? 'checked' : ''}><span>${n}</span></label>`).join('')}
            <label><input type="radio" name="top" value="" ${!r.top ? 'checked' : ''}><span>—</span></label></div></div>
        <div class="adm-grid">
            ${campo('Roster', `<select name="roster">${opciones(adm.teams.map(t => ({ v: t.id, n: t.nombre })), r.roster, '— Sin roster —')}</select>`)}
            ${campo('E-sport', `<input name="esport" maxlength="30" value="${esc(r.esport || 'Free Fire')}">`)}
        </div>
        <div class="adm-botones">
            <button type="submit" class="btn-generar">GUARDAR</button>
            ${id ? '' : '<button type="submit" class="btn-sec" name="otro" value="1">Guardar y otro</button>'}
            <button type="button" class="btn-sec" onclick="admCerrarHoja()">Cancelar</button>
            ${id ? `<button type="button" class="btn-sec btn-peligro" onclick="admBorrar('${id}')"><i class="fa-solid fa-trash"></i></button>` : ''}
        </div>
    </form>`);
}

async function admGuardarRelampago(e, id) {
    e.preventDefault();
    const otro = e.submitter && e.submitter.name === 'otro';
    const d = Object.fromEntries(new FormData(e.target));
    d.costo = admNumero(d.costo);
    d.premio = d.premio === '' ? null : admNumero(d.premio);
    d.top = d.top ? Number(d.top) : null;
    d.utc = aUTC(d.fecha, d.hora);
    const previo = id ? admDe('relampago').find(x => x.id === id) : {};
    await admGuardar('relampago', { ...previo, ...d }, id || null);
    adm.torneosVista = 'relampago';
    toast('Relámpago guardado.');
    if (otro) { admEditarRelampago(null); admPintar(); return; }
    admCerrarHoja(); admPintar();
}

// ----- Torneo con fases -----
function admFilaFase(f = {}) {
    return `<div class="adm-fase">
        <input name="faseNombre" list="adm-fases" maxlength="40" placeholder="Fase" value="${esc(f.nombre || '')}" aria-label="Nombre de la fase">
        <input name="faseFecha" type="date" value="${esc(f.fecha || '')}" aria-label="Fecha de la fase">
        <input name="faseHora" type="time" value="${esc(f.hora || '')}" aria-label="Hora de la fase">
        <button type="button" class="adm-ico" onclick="this.parentElement.remove()" title="Quitar fase"><i class="fa-solid fa-xmark"></i></button>
    </div>`;
}

function admEditarTorneo(id) {
    const t = id ? admDe('torneo').find(x => x.id === id) : { esport: 'Free Fire', roster: adm.teams[0]?.id || '', fases: [{ nombre: 'Clasificatoria', fecha: hoyISO(), hora: '' }] };
    admAbrirHoja(`
    <form class="adm-form" onsubmit="admGuardarTorneo(event, '${id || ''}')">
        <h3><i class="fa-solid fa-trophy"></i> ${id ? esc(t.nombre || 'Torneo') : 'Nuevo torneo'}</h3>
        <div class="adm-grid">
            ${campo('Nombre del torneo', `<input name="nombre" required maxlength="80" value="${esc(t.nombre || '')}" class="adm-grande">`, 'ancho')}
            ${campo('Organizador', `<input name="organizador" maxlength="60" value="${esc(t.organizador || '')}">`)}
            ${campo('E-sport', `<input name="esport" maxlength="30" value="${esc(t.esport || 'Free Fire')}">`)}
            ${campo('Roster', `<select name="roster">${opciones(adm.teams.map(x => ({ v: x.id, n: x.nombre })), t.roster, '— Sin roster —')}</select>`)}
            ${campo('Fecha de inicio', `<input name="inicio" type="date" value="${esc(t.inicio || '')}">`)}
            ${campo('Premio del torneo', `<input name="premio" maxlength="60" placeholder="Ej. 500 USD o diamantes" value="${esc(t.premio || '')}">`)}
            ${campo('Inscripción (USD)', `<input name="costo" type="number" min="0" step="0.01" inputmode="decimal" value="${esc(t.costo ?? '')}">`)}
            ${campo('Enlace (bases, grupo…)', `<input name="enlace" type="url" maxlength="200" placeholder="https://" value="${esc(t.enlace || '')}">`, 'ancho')}
        </div>
        <div class="adm-campo ancho"><span>Fases</span>
            <datalist id="adm-fases">${ADM_FASES.map(f => `<option value="${f}">`).join('')}</datalist>
            <div id="adm-fases-lista">${(t.fases || []).map(admFilaFase).join('')}</div>
            <button type="button" class="btn-sec" onclick="$('#adm-fases-lista').insertAdjacentHTML('beforeend', admFilaFase())"><i class="fa-solid fa-plus"></i> Fase</button>
        </div>
        <h4 class="adm-sub">Resultado</h4>
        <div class="adm-grid">
            ${campo('Top alcanzado', `<input name="top" type="number" min="1" max="200" inputmode="numeric" value="${esc(t.top ?? '')}" class="adm-grande">`)}
            ${campo('Premio ganado (USD)', `<input name="premioGanado" type="number" min="0" step="0.01" inputmode="decimal" value="${esc(t.premioGanado ?? '')}" class="adm-grande">`)}
            ${campo('Notas', `<textarea name="notas" rows="2" maxlength="400">${esc(t.notas || '')}</textarea>`, 'ancho')}
        </div>
        <div class="adm-botones">
            <button type="submit" class="btn-generar">GUARDAR</button>
            <button type="button" class="btn-sec" onclick="admCerrarHoja()">Cancelar</button>
            ${id ? `<button type="button" class="btn-sec btn-peligro" onclick="admBorrar('${id}', '¿Borrar este torneo?')"><i class="fa-solid fa-trash"></i></button>` : ''}
        </div>
    </form>`);
}

async function admGuardarTorneo(e, id) {
    e.preventDefault();
    const fd = new FormData(e.target);
    const d = {};
    ['nombre', 'organizador', 'esport', 'roster', 'inicio', 'premio', 'enlace', 'notas'].forEach(k => d[k] = String(fd.get(k) || '').trim());
    d.costo = fd.get('costo') === '' ? null : admNumero(fd.get('costo'));
    d.top = fd.get('top') ? Number(fd.get('top')) : null;
    d.premioGanado = fd.get('premioGanado') === '' ? null : admNumero(fd.get('premioGanado'));
    const nombres = fd.getAll('faseNombre'), fechas = fd.getAll('faseFecha'), horas = fd.getAll('faseHora');
    d.fases = nombres.map((n, i) => ({ nombre: String(n).trim(), fecha: fechas[i], hora: horas[i], utc: aUTC(fechas[i], horas[i]) }))
        .filter(f => f.nombre || f.fecha).sort((a, b) => (a.fecha || '').localeCompare(b.fecha || ''));
    if (!d.inicio && d.fases[0]?.fecha) d.inicio = d.fases[0].fecha;
    const previo = id ? admDe('torneo').find(x => x.id === id) : {};
    await admGuardar('torneo', { ...previo, ...d }, id || null);
    adm.torneosVista = 'torneo';
    admCerrarHoja(); admPintar(); toast('Torneo guardado.');
}

async function admCrearCalendario() {
    const b = new Uint8Array(16);
    crypto.getRandomValues(b);
    const token = [...b].map(x => x.toString(16).padStart(2, '0')).join('');
    await admGuardar('calendario', { token });
    admPintar();
    toast('Calendario creado. Comparte el enlace con jugadores y staff.');
}

// Archivo .ics con todo (sirve aunque la función del calendario no esté publicada)
function admDescargarICS() {
    const ev = admEventos();
    if (!ev.length) return toast('No hay torneos ni relámpagos con fecha.', 'error');
    const f = iso => new Date(iso).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
    const e = s => String(s || '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
    const ics = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Pumas Dev Lab//Torneos//ES', `X-WR-CALNAME:${e((adm.org?.nombre || 'Equipo') + ' · Torneos')}`,
        ...ev.map((x, i) => ['BEGIN:VEVENT', `UID:${x.id}-${i}@pumasdevlab`, `DTSTAMP:${f(new Date().toISOString())}`, `DTSTART:${f(x.utc)}`,
            `DTEND:${f(new Date(new Date(x.utc).getTime() + x.horas * 3600e3).toISOString())}`, `SUMMARY:${e(x.titulo)}`, x.detalle ? `DESCRIPTION:${e(x.detalle)}` : '', 'END:VEVENT'].filter(Boolean).join('\r\n')),
        'END:VCALENDAR'].join('\r\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([ics], { type: 'text/calendar' }));
    a.download = `torneos-${(adm.org?.nombre || 'equipo').toLowerCase().replace(/[^a-z0-9]+/g, '-')}.ics`;
    document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
}

// ============================================================
// RESULTADOS POR E-SPORT (torneos + relámpagos)
// ============================================================
function admParticipaciones() {
    return [
        ...admDe('torneo').map(t => ({ id: t.id, tipo: 'torneo', fecha: t.inicio || (t.fases || [])[0]?.fecha || '', nombre: t.nombre || 'Torneo', esport: t.esport || 'Free Fire', roster: t.roster, top: t.top, premio: Number(t.premioGanado) || 0, costo: Number(t.costo) || 0 })),
        ...admDe('relampago').map(r => ({ id: r.id, tipo: 'relampago', fecha: r.fecha || '', nombre: r.corp || 'Relámpago', esport: r.esport || 'Free Fire', roster: r.roster, top: r.top, premio: Number(r.premio) || 0, costo: Number(r.costo) || 0 }))
    ].sort((a, b) => b.fecha.localeCompare(a.fecha));
}

function admResumen(lista) {
    const conTop = lista.filter(x => x.top);
    return {
        jugados: lista.length,
        victorias: conTop.filter(x => x.top === 1).length,
        podios: conTop.filter(x => x.top <= 3).length,
        top10: conTop.filter(x => x.top <= 10).length,
        mejor: conTop.length ? Math.min(...conTop.map(x => x.top)) : null,
        premios: lista.reduce((s, x) => s + x.premio, 0),
        costos: lista.reduce((s, x) => s + x.costo, 0)
    };
}

function admResultados() {
    const todas = admParticipaciones();
    const esports = [...new Set(todas.map(x => x.esport))];
    const f = adm.res;
    const lista = todas.filter(x => (!f.esport || x.esport === f.esport) && (!f.roster || x.roster === f.roster) && (!f.tipo || x.tipo === f.tipo));
    const r = admResumen(lista);
    return `
    <div class="adm-barra">
        <select onchange="adm.res.esport=this.value; admPintar()" aria-label="E-sport">${opciones(esports, f.esport, 'Todos los e-sports')}</select>
        <select onchange="adm.res.roster=this.value; admPintar()" aria-label="Roster">${opciones(adm.teams.map(t => ({ v: t.id, n: t.nombre })), f.roster, 'Todos los rosters')}</select>
        <select onchange="adm.res.tipo=this.value; admPintar()" aria-label="Tipo">${opciones([{ v: 'torneo', n: 'Torneos' }, { v: 'relampago', n: 'Relámpagos' }], f.tipo, 'Torneos y relámpagos')}</select>
        <button type="button" class="btn-generar" onclick="admEditarRelampago(null)"><i class="fa-solid fa-bolt"></i> Relámpago</button>
        <button type="button" class="btn-sec" onclick="admEditarTorneo(null)"><i class="fa-solid fa-plus"></i> Torneo</button>
    </div>
    <div class="adm-kpis">
        ${kpiAdm(r.jugados, 'Participaciones')}
        ${kpiAdm(r.victorias, 'Victorias (Top 1)', r.victorias ? 'bien' : '')}
        ${kpiAdm(r.podios, 'Podios (Top 3)')}
        ${kpiAdm(r.top10, 'Top 10')}
        ${kpiAdm(r.mejor ? 'TOP ' + r.mejor : '—', 'Mejor resultado')}
        ${kpiAdm(usd(r.premios), 'Premios ganados', 'bien')}
        ${kpiAdm(usd(r.costos), 'Inversión (inscripciones)')}
        ${kpiAdm(usd(r.premios - r.costos), 'Balance', r.premios - r.costos >= 0 ? 'bien' : 'mal')}
    </div>
    ${esports.length > 1 && !f.esport ? `<div class="card-box"><h3 class="card-titulo"><i class="fa-solid fa-gamepad"></i> Por e-sport</h3>
        <div class="tabla-scroll"><table class="tabla-datos"><thead><tr><th>E-sport</th><th>Jugados</th><th>Top 1</th><th>Podios</th><th>Mejor</th><th>Premios</th><th>Balance</th></tr></thead><tbody>
        ${esports.map(e => { const s = admResumen(lista.filter(x => x.esport === e)); return `<tr><td><strong>${esc(e)}</strong></td><td>${s.jugados}</td><td>${s.victorias}</td><td>${s.podios}</td><td>${s.mejor ? 'TOP ' + s.mejor : '—'}</td><td>${usd(s.premios)}</td><td class="${s.premios - s.costos >= 0 ? 'bien' : 'mal'}">${usd(s.premios - s.costos)}</td></tr>`; }).join('')}
        </tbody></table></div></div>` : ''}
    <div class="card-box">
        <h3 class="card-titulo"><i class="fa-solid fa-list-ol"></i> Historial</h3>
        <p class="ayuda">Escribe el top y el premio directo en la tabla; se guarda solo.</p>
        ${lista.length ? `<div class="tabla-scroll"><table class="tabla-datos adm-tabla-res"><thead><tr><th>Fecha</th><th>Torneo / corp</th><th>Roster</th><th>Top</th><th>Premio USD</th><th>Costo</th></tr></thead><tbody>
        ${lista.map(x => `<tr class="${x.top ? '' : 'sin-res'}">
            <td>${fechaCorta(x.fecha)}</td>
            <td><i class="fa-solid ${x.tipo === 'relampago' ? 'fa-bolt' : 'fa-trophy'}"></i> <a href="#" onclick="${x.tipo === 'relampago' ? 'admEditarRelampago' : 'admEditarTorneo'}('${x.id}'); return false">${esc(x.nombre)}</a><br><small class="ayuda">${esc(x.esport)}</small></td>
            <td>${esc(nombreRoster(x.roster) || '—')}</td>
            <td><input type="number" min="1" max="200" inputmode="numeric" value="${x.top || ''}" class="adm-mini ${x.top && x.top <= 3 ? 'podio' : ''}" onchange="admResultadoRapido('${x.id}', 'top', this.value)" aria-label="Top"></td>
            <td><input type="number" min="0" step="0.01" inputmode="decimal" value="${x.premio || ''}" class="adm-mini" onchange="admResultadoRapido('${x.id}', 'premio', this.value)" aria-label="Premio"></td>
            <td>${usd(x.costo)}</td>
        </tr>`).join('')}</tbody></table></div>` : '<p class="ayuda">Registra torneos o relámpagos para ver los resultados.</p>'}
    </div>`;
}

async function admResultadoRapido(id, campoRes, valor) {
    const reg = adm.regs.find(x => x.id === id);
    if (!reg) return;
    const cambios = { ...reg };
    if (campoRes === 'top') cambios.top = valor ? Number(valor) : null;
    else if (reg.tipo === 'torneo') cambios.premioGanado = valor === '' ? null : admNumero(valor);
    else cambios.premio = valor === '' ? null : admNumero(valor);
    await admGuardar(reg.tipo, cambios, id);
    admPintar();
    toast('Resultado guardado.');
}
