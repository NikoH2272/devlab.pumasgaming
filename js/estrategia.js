// ============================================================
// PUMAS DEV LAB · Estrategia (Mapas, Vistas aéreas y Repisa)
// ============================================================

let tablero = null;            // instancia de Tablero
let tbActual = null;           // { id, tipo, orgId, fondo } del plano abierto
let tbSinGuardar = false;

const TB_RADIO = 90;           // a partir de qué distancia (unidades) se cruzan dos equipos
const TB_VEL_PIE = 6.5;        // m/s en sprint
const TB_VEHICULOS = [
    ['pie', 'A pie', null], ['deportivo', 'Deportivo', 137.5], ['moto', 'Motocicleta', 125],
    ['camioneta', 'Camioneta', 112.5], ['monster', 'Monster', 102.5], ['anfibio', 'Anfibio', 80], ['tuktuk', 'Tuk-Tuk', 67.5]
];
const TB_PALETA = ['#00f0ff', '#e66767', '#f5c542', '#4ade80', '#a78bfa', '#ff8a3d', '#3987e5', '#d55181', '#9ca3af', '#ffffff'];

function orgDeTrabajo() {
    return Auth.usuario.orgId || (tbActual && tbActual.orgId) || null;
}

// ---------- Apertura ----------
async function abrirEstrategia(tipo, registro = null) {
    if (tbSinGuardar && !confirm('Hay cambios sin guardar en el plano abierto. ¿Descartarlos?')) return;
    await irA('vista-tablero');
    if (!tablero) {
        tablero = new Tablero($('#tb-canvas'), { alCambiar: alCambiarTablero, alSeleccionarEquipo: pintarEquiposTablero });
        pintarHerramientas();
        pintarIconos();
        $('#tb-vehiculo').innerHTML = TB_VEHICULOS.map(([id, n, kmh]) => `<option value="${id}">${n}${kmh ? ` · ${kmh} km/h` : ''}</option>`).join('');
        $('#tb-mapa').innerHTML = CATALOGO.mapas.map(m => `<option value="${m}">${m}</option>`).join('');
        $('#tb-paleta').innerHTML = TB_PALETA.map(c => `<button type="button" class="tb-color" style="background:${c}" title="${c}" onclick="ponerColor('${c}')"></button>`).join('');
    }
    tablero.modo = tipo;
    $('#vista-tablero').dataset.modo = tipo;
    $$('.sb-nav > button[data-vista="vista-tablero"]').forEach(b => b.classList.toggle('activo', b.dataset.modo === tipo));
    $('#tb-titulo').textContent = tipo === 'mapa' ? 'Mapas · caídas y rotaciones' : 'Vistas aéreas';

    const orgs = await Auth.orgsVisibles();
    tbActual = { id: registro?.id || null, tipo, orgId: registro?.orgId || Auth.usuario.orgId || orgs[0]?.id || null, fondo: registro?.fondo || null };
    $('#tb-nombre').value = registro?.nombre || '';
    $('#tb-img-mapa-caja').hidden = !['admin', 'ceo', 'coach'].includes(Auth.usuario.rol);

    const rosters = (await Auth.equiposVisibles()).filter(t => t.orgId === tbActual.orgId);
    $('#tb-roster').innerHTML = '<option value="">— Toda la organización —</option>' + rosters.map(t => `<option value="${t.id}">${esc(t.nombre)}</option>`).join('');
    $('#tb-roster').value = registro?.teamId || '';
    await pintarLogosDisponibles(rosters);

    const mapa = registro?.mapa || $('#tb-mapa').value || CATALOGO.mapas[0];
    $('#tb-mapa').value = mapa;
    tablero.mapaActual = mapa;
    tablero.etiquetaFondo = tipo === 'mapa' ? mapa : 'Vista aérea';
    tablero.cargar(registro?.datos || Tablero.docVacio(), tipo === 'aerea' ? tbActual.fondo : await fondoDelMapa(mapa));
    elegirHerramienta(tipo === 'mapa' ? 'caida' : 'flecha');
    tbSinGuardar = false;
    $('#tb-estado').textContent = registro?.id ? 'Abierto desde la Repisa' : 'Sin guardar';
    pintarEquiposTablero();
    pintarAnalisisTablero();
}

async function fondoDelMapa(mapa) {
    try { return tbActual.orgId ? await DB.mapaImagen(tbActual.orgId, mapa) : null; }
    catch (err) { return null; }
}

async function cambiarMapaTablero(mapa) {
    tablero.mapaActual = mapa;
    tablero.etiquetaFondo = mapa;
    tablero.ponerFondo(await fondoDelMapa(mapa));
    marcarCambio();
    pintarAnalisisTablero();
}

function alCambiarTablero(evento) {
    if (evento && evento.aviso) return mostrarPista(evento.aviso, true);
    marcarCambio();
    pintarEquiposTablero();
    pintarAnalisisTablero();
}

function marcarCambio() {
    tbSinGuardar = true;
    $('#tb-estado').textContent = 'Cambios sin guardar';
}

function mostrarPista(txt, alerta = false) {
    const p = $('#tb-pista');
    p.textContent = txt;
    p.classList.toggle('alerta', alerta);
    if (alerta) setTimeout(() => { p.textContent = TB_HERRAMIENTAS[tablero.herr].pista; p.classList.remove('alerta'); }, 3200);
}

// ---------- Herramientas y estilo ----------
function pintarHerramientas() {
    $('#tb-herr').innerHTML = Object.entries(TB_HERRAMIENTAS).map(([id, h]) => `
        <button type="button" class="tb-herr ${h.mapa ? 'solo-mapa' : ''}" data-h="${id}" onclick="elegirHerramienta('${id}')" title="${h.n}">
            <i class="fa-solid ${h.i}"></i><span>${h.n}</span>
        </button>`).join('');
}

function elegirHerramienta(id) {
    tablero.herr = id;
    tablero.seleccion = null;
    $$('.tb-herr').forEach(b => b.classList.toggle('activo', b.dataset.h === id));
    $('#tb-opc-icono').hidden = id !== 'icono';
    $('#tb-opc-logo').hidden = id !== 'logo';
    $('#tb-canvas').style.cursor = id === 'mover' ? 'grab' : 'crosshair';
    mostrarPista(TB_HERRAMIENTAS[id].pista);
    tablero.dibujar();
}

function pintarIconos() {
    $('#tb-iconos').innerHTML = Object.entries(TB_ICONOS).map(([id, ic]) => `
        <button type="button" class="tb-icono ${id === tablero.estilo.icono ? 'activo' : ''}" data-ic="${id}" title="${ic.n}" onclick="elegirIcono('${id}')">
            <span class="fa-solid">${ic.u}</span>
        </button>`).join('');
}

function elegirIcono(id) {
    tablero.estilo.icono = id;
    $$('.tb-icono').forEach(b => b.classList.toggle('activo', b.dataset.ic === id));
}

function ponerColor(c) {
    tablero.estilo.color = c;
    $('#tb-color').value = c;
}

async function pintarLogosDisponibles(rosters) {
    const orgs = await Auth.orgsVisibles();
    const org = orgs.find(o => o.id === tbActual.orgId);
    const logos = [org, ...rosters].filter(x => x && x.logo);
    tbLogosSubidos.forEach(src => logos.push({ nombre: 'Subido', logo: src }));
    $('#tb-logos').innerHTML = logos.map((x, i) => `
        <button type="button" class="tb-logo ${tablero && tablero.estilo.logo === x.logo ? 'activo' : ''}" title="${esc(x.nombre)}" onclick="elegirLogo(${i})">
            <img src="${esc(x.logo)}" alt="${esc(x.nombre)}">
        </button>`).join('') || '<p class="ayuda">Los rosters no tienen logo. Sube uno.</p>';
    tbLogosLista = logos.map(x => x.logo);
}
let tbLogosLista = [];
const tbLogosSubidos = [];

function elegirLogo(i) {
    tablero.estilo.logo = tbLogosLista[i];
    $$('.tb-logo').forEach((b, j) => b.classList.toggle('activo', j === i));
}

async function subirLogoTablero(input) {
    const f = input.files && input.files[0];
    if (!f) return;
    tbLogosSubidos.push(await comprimirImagen(f, 256, 0.9));
    input.value = '';
    await pintarLogosDisponibles((await Auth.equiposVisibles()).filter(t => t.orgId === tbActual.orgId));
    elegirLogo(tbLogosLista.length - 1);
}

// ---------- Fondos ----------
async function subirImagenMapa(input) {
    const f = input.files && input.files[0];
    if (!f) return;
    try {
        const img = await comprimirImagen(f, 1400, 0.85);
        await DB.guardarMapaImagen(tbActual.orgId, tablero.mapaActual, img);
        tablero.ponerFondo(img);
        toast(`Imagen de ${tablero.mapaActual} guardada para toda la organización.`);
    } catch (err) { toast(err.message, 'error'); }
    input.value = '';
}

async function subirImagenAerea(input) {
    const f = input.files && input.files[0];
    if (!f) return;
    tbActual.fondo = await comprimirImagen(f, 1600, 0.82);
    tablero.ponerFondo(tbActual.fondo);
    marcarCambio();
    input.value = '';
}

// ---------- Equipos del plano (modo mapa) ----------
function pintarEquiposTablero() {
    if (!tablero || tablero.modo !== 'mapa') return;
    const eqs = tablero.doc.equipos;
    $('#tb-n-equipos').textContent = eqs.length;
    $('#tb-equipos').innerHTML = eqs.length ? eqs.map(e => `
        <div class="tb-eq ${e.id === tablero.equipoSel ? 'sel' : ''}" style="border-left-color:${e.color}" onclick="tablero.seleccionarEquipo('${e.id}')">
            ${e.logo ? `<img src="${esc(e.logo)}" alt="">` : `<span class="tb-eq-ini" style="color:${e.color}">${esc(iniciales(e.nombre))}</span>`}
            <div class="tb-eq-n"><strong>${esc(e.nombre)}</strong>
                <small>${tablero.caidaDe(e.id) ? 'caída ✓' : 'sin caída'} · ${(tablero.rutaDe(e.id)?.pts.length || 0)} paradas${e.propio ? ' · propio' : ''}</small></div>
            <button type="button" class="btn-link" onclick="event.stopPropagation(); tablero.quitarEquipo('${e.id}')" aria-label="Quitar ${esc(e.nombre)}">✕</button>
        </div>`).join('') : '<p class="ayuda">Agrega tus rosters y los rivales de la partida.</p>';
}

async function agregarMisRosters() {
    const rosters = (await Auth.equiposVisibles()).filter(t => t.orgId === tbActual.orgId);
    rosters.forEach((t, i) => tablero.agregarEquipo({ id: 'r_' + t.id, nombre: t.nombre, color: TB_PALETA[i % TB_PALETA.length], logo: t.logo, propio: true }));
    if (!rosters.length) toast('No tienes rosters visibles en esta organización.', 'error');
}

function agregarRival(e) {
    e.preventDefault();
    const f = e.target;
    const nombre = f.nombre.value.trim();
    if (!nombre) return;
    if (tablero.doc.equipos.length >= 24) return toast('Máximo 24 equipos por plano.', 'error');
    tablero.agregarEquipo({ id: 'x_' + Date.now().toString(36), nombre: nombre.slice(0, 22), color: f.color.value, logo: null, propio: false });
    f.nombre.value = '';
    f.color.value = TB_PALETA[tablero.doc.equipos.length % TB_PALETA.length];
}

// ---------- Análisis táctico (modo mapa) ----------
// No predice bajas: mide a cuántos rivales te expones y si los tiempos te dan
function analizarPlano() {
    const doc = tablero.doc, mapa = tablero.mapaActual;
    const yo = tablero.equipo(tablero.equipoSel);
    if (!yo) return null;
    const caida = tablero.caidaDe(yo.id);
    if (!caida) return { yo };
    const m = u => u * metrosPorUnidad(mapa);
    const vehiculo = TB_VEHICULOS.find(v => v[0] === $('#tb-vehiculo').value) || TB_VEHICULOS[0];
    const vel = vehiculo[2] ? vehiculo[2] / 3.6 : TB_VEL_PIE;

    const otros = doc.equipos.filter(e => e.id !== yo.id).map(e => ({ e, c: tablero.caidaDe(e.id) })).filter(x => x.c);
    const ruta = tablero.rutaDe(yo.id);
    const camino = [caida, ...(ruta ? ruta.pts : [])];

    const vecinos = otros.filter(x => Math.hypot(x.c.x - caida.x, x.c.y - caida.y) < TB_RADIO);
    const cruces = camino.length > 1 ? otros.filter(x => {
        if (vecinos.includes(x)) return false;
        for (let i = 0; i < camino.length - 1; i++) if (distSegmento(x.c, camino[i], camino[i + 1]) < TB_RADIO) return true;
        return false;
    }) : [];
    const masCerca = otros.map(x => ({ n: x.e.nombre, d: Math.hypot(x.c.x - caida.x, x.c.y - caida.y) })).sort((a, b) => a.d - b.d)[0];

    let largo = 0;
    for (let i = 0; i < camino.length - 1; i++) largo += Math.hypot(camino[i + 1].x - camino[i].x, camino[i + 1].y - camino[i].y);

    const franjas = [0, 0, 0];
    doc.equipos.forEach(e => { const c = tablero.caidaDe(e.id); if (c) franjas[Math.min(2, Math.floor(c.x / (TB_ANCHO / 3)))]++; });

    const fases = doc.objetos.filter(o => o.t === 'segura').sort((a, b) => a.n - b.n).map(z => {
        const fase = TB_ZONAS[z.n - 1];
        const fuera = Math.max(0, Math.hypot(z.x - caida.x, z.y - caida.y) - z.r);
        const viaje = m(fuera) / vel;
        return { n: z.n, fase, dentro: fuera === 0, metros: Math.round(m(fuera)), viaje, margen: fase.fin - viaje };
    });

    // Distancia a la ruta del avión (planeo estimado: 45 m/s, alcance ~900 m)
    let avion = null;
    const av = doc.objetos.find(o => o.t === 'avion' && o.a && o.b);
    if (av) {
        const vx = av.b.x - av.a.x, vy = av.b.y - av.a.y, L2 = vx * vx + vy * vy || 1;
        const t = ((caida.x - av.a.x) * vx + (caida.y - av.a.y) * vy) / L2;
        const d = Math.hypot(caida.x - (av.a.x + t * vx), caida.y - (av.a.y + t * vy));
        avion = { metros: Math.round(m(d)), planeo: m(d) / 45, lejos: m(d) > 900 };
    }

    const exp = vecinos.length + cruces.length;
    return { yo, caida, vecinos, cruces, exp, masCerca, largo, franjas, fases, avion, vehiculo, vel, m };
}

function pintarAnalisisTablero() {
    if (!tablero || tablero.modo !== 'mapa') return;
    const a = analizarPlano();
    const cont = $('#tb-analisis');
    if (!a) { cont.innerHTML = '<p class="ayuda">Elige tu equipo en la lista para analizar su plan.</p>'; return; }
    if (!a.caida) { cont.innerHTML = `<p class="ayuda">Coloca la caída de ${esc(a.yo.nombre)} para ver el análisis.</p>`; return; }

    const lectura = a.exp === 0 ? ['ZONA', 'bien', 'Nadie a tu alcance: no hay bajas que buscar aquí. Juega el cierre y rota temprano.']
        : a.exp <= 2 ? ['SELECTIVO', 'info', `Te expones a ${a.exp} equipo(s). Pelea solo lo que puedas ganar rápido.`]
        : a.exp <= 4 ? ['AGRESIVO', 'alerta', `${a.exp} equipos a tu alcance. Hay bajas de sobra, pero necesitas ventaja de posición antes de abrir.`]
        : ['SATURADO', 'alerta', `${a.exp} equipos encima: aquí no eliges la pelea, te la eligen. Considera mover la caída o la ruta.`];
    const nombres = ['Izquierda', 'Centro', 'Derecha'];
    const maxF = Math.max(1, ...a.franjas);

    cont.innerHTML = `
        <div class="nota nota-${lectura[1]}"><div><strong>${lectura[0]}</strong><p>${esc(lectura[2])}</p>
            <p><small>${a.vecinos.length} en la caída · ${a.cruces.length} en la rotación${a.masCerca ? ` · más cerca: ${esc(a.masCerca.n)} a ${Math.round(a.m(a.masCerca.d))} m` : ''}</small></p></div></div>
        <div class="tb-dato"><span>Equipos por zona</span></div>
        ${a.franjas.map((v, i) => `<div class="tb-barra"><span>${nombres[i]}</span><i><b style="width:${v / maxF * 100}%"></b></i><strong>${v}</strong></div>`).join('')}
        ${a.largo ? `
        <div class="tb-dato"><span>Rotación (${TB_LADO_MAPA[tablero.mapaActual]} m de mapa)</span></div>
        <div class="tb-fila"><span>Distancia</span><strong>${Math.round(a.m(a.largo))} m</strong></div>
        <div class="tb-fila"><span>${esc(a.vehiculo[1])}</span><strong>${relojTxt(a.m(a.largo) / a.vel)}</strong></div>
        ${a.vehiculo[2] ? `<div class="tb-fila"><span>A pie</span><strong>${relojTxt(a.m(a.largo) / TB_VEL_PIE)}</strong></div>` : ''}` : ''}
        ${a.avion ? `
        <div class="tb-dato"><span>Salto desde el avión (estimado)</span></div>
        <div class="tb-fila"><span>Planeo</span><strong class="${a.avion.lejos ? 'mal' : ''}">${a.avion.metros} m${a.avion.lejos ? ' · fuera de alcance' : ''}</strong></div>
        <div class="tb-fila"><span>En el aire</span><strong>${relojTxt(a.avion.planeo)}</strong></div>` : ''}
        ${a.fases.length ? `
        <div class="tb-dato"><span>Fases de zona · llegada desde la caída</span></div>
        ${a.fases.map(f => `<div class="tb-fila"><span>Z${f.n} · cierra ${relojTxt(f.fase.fin)} · ${f.fase.dano} HP/s</span>
            <strong class="${f.dentro || f.margen > 45 ? 'bien' : f.margen > 0 ? '' : 'mal'}">${f.dentro ? 'dentro ✓' : `${f.metros} m · ${f.margen > 0 ? 'sobran ' + relojTxt(f.margen) : 'tarde ' + relojTxt(-f.margen)}`}</strong></div>`).join('')}` : ''}
        ${a.cruces.length ? `<div class="tb-dato"><span>Tu rotación cruza con</span></div>
            ${a.cruces.map(x => `<div class="tb-fila"><span><i class="tb-punto" style="background:${x.e.color}"></i>${esc(x.e.nombre)}</span></div>`).join('')}` : ''}
        <p class="ayuda" style="margin-top:8px">Medidas y tiempos aproximados del juego; el planeo es una estimación.</p>`;
}

// ---------- Guardar, exportar, nuevo ----------
async function guardarTablero() {
    const nombre = $('#tb-nombre').value.trim();
    if (!nombre) { $('#tb-nombre').focus(); return toast('Ponle un nombre al plano.', 'error'); }
    if (!tbActual.orgId) return toast('Primero crea una organización.', 'error');
    if (tbActual.tipo === 'aerea' && !tbActual.fondo) return toast('Sube primero la imagen aérea.', 'error');
    const mini = tablero.lienzoExportado(360);
    const registro = {
        id: tbActual.id, orgId: tbActual.orgId, teamId: $('#tb-roster').value || null, tipo: tbActual.tipo, nombre,
        mapa: tbActual.tipo === 'mapa' ? tablero.mapaActual : null,
        fondo: tbActual.tipo === 'aerea' ? tbActual.fondo : null,
        miniatura: mini.toDataURL('image/jpeg', 0.7),
        datos: tablero.doc
    };
    try {
        tbActual.id = await DB.guardarTablero(registro);
        tbSinGuardar = false;
        $('#tb-estado').textContent = 'Guardado en la Repisa';
        toast('Plano guardado en la Repisa.');
    } catch (err) { toast(err.message, 'error'); }
}

function descargarTablero() {
    const c = tablero.lienzoExportado(1600);
    const nombre = ($('#tb-nombre').value.trim() || (tbActual.tipo === 'mapa' ? tablero.mapaActual : 'vista-aerea'))
        .toLowerCase().replace(/[^a-z0-9áéíóúñ]+/gi, '-');
    c.toBlob(b => {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(b);
        a.download = `pumas-${nombre}-${fechaLocal(new Date())}.png`;
        document.body.appendChild(a);
        a.click();
        setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
    }, 'image/png');
}

function nuevoTablero() {
    abrirEstrategia(tbActual ? tbActual.tipo : 'mapa');
}

function limpiarTablero() {
    if (!confirm('¿Borrar todas las marcas del plano? Los equipos se mantienen.')) return;
    tablero.instantanea();
    tablero.doc.objetos = [];
    tablero.cambio();
}

// ---------- Repisa ----------
async function renderRepisa() {
    const f = $('#repisa-filtros');
    if (!f.mapa.options.length) {
        f.mapa.innerHTML = '<option value="">Todos los mapas</option>' + CATALOGO.mapas.map(m => `<option value="${m}">${m}</option>`).join('');
    }
    const rosters = await Auth.equiposVisibles();
    const sel = f.roster.value;
    f.roster.innerHTML = '<option value="">Todos los rosters</option>' + rosters.map(t => `<option value="${t.id}">${esc(t.nombre)}</option>`).join('');
    f.roster.value = sel;

    let lista;
    try { lista = await DB.tableros(); }
    catch (err) {
        $('#repisa-lista').innerHTML = `<p class="vacio">${esc(/tableros/.test(err.message) ? 'Falta ejecutar la migración 006_estrategia.sql en Supabase.' : err.message)}</p>`;
        return;
    }
    const usuarios = await DB.usuarios().catch(() => []);
    lista = lista.filter(t => (!f.tipo.value || t.tipo === f.tipo.value) && (!f.mapa.value || t.mapa === f.mapa.value) && (!f.roster.value || t.teamId === f.roster.value));

    $('#repisa-lista').innerHTML = lista.length ? lista.map(t => {
        const autor = usuarios.find(u => u.id === t.creadoPor);
        const roster = rosters.find(r => r.id === t.teamId);
        const puedeBorrar = t.creadoPor === Auth.usuario.id || ['admin', 'ceo'].includes(Auth.usuario.rol);
        return `
        <div class="repisa-card">
            <button type="button" class="repisa-mini" onclick="abrirDeRepisa('${t.id}')" title="Abrir">
                ${t.miniatura ? `<img src="${esc(t.miniatura)}" alt="Vista previa de ${esc(t.nombre)}">` : '<i class="fa-solid fa-map"></i>'}
            </button>
            <div class="repisa-info">
                <span class="repisa-tipo">${t.tipo === 'mapa' ? esc(t.mapa || 'Mapa') : 'Vista aérea'}</span>
                <strong>${esc(t.nombre)}</strong>
                <small>${roster ? esc(roster.nombre) + ' · ' : ''}${autor ? '@' + esc(autor.usuario) + ' · ' : ''}${new Date(t.actualizado).toLocaleDateString('es')}</small>
            </div>
            <div class="repisa-acciones">
                <button type="button" class="btn-link" onclick="abrirDeRepisa('${t.id}')">Abrir</button>
                <button type="button" class="btn-link" onclick="duplicarDeRepisa('${t.id}')">Duplicar</button>
                ${puedeBorrar ? `<button type="button" class="btn-link" onclick="borrarDeRepisa('${t.id}')">Eliminar</button>` : ''}
            </div>
        </div>`;
    }).join('') : '<p class="vacio">La repisa está vacía. Guarda un mapa o una vista aérea para verlo aquí.</p>';
}

async function abrirDeRepisa(id) {
    try {
        const t = await DB.tablero(id);
        await abrirEstrategia(t.tipo, t);
    } catch (err) { toast(err.message, 'error'); }
}

async function duplicarDeRepisa(id) {
    try {
        const t = await DB.tablero(id);
        await abrirEstrategia(t.tipo, { ...t, id: null, nombre: t.nombre + ' (copia)' });
        marcarCambio();
    } catch (err) { toast(err.message, 'error'); }
}

async function borrarDeRepisa(id) {
    if (!confirm('¿Eliminar este plano de la repisa? No se puede deshacer.')) return;
    try {
        await DB.eliminarTablero(id);
        renderRepisa();
    } catch (err) { toast(err.message, 'error'); }
}

// Avisar antes de salir con cambios sin guardar
window.addEventListener('beforeunload', ev => {
    if (tbSinGuardar) { ev.preventDefault(); ev.returnValue = ''; }
});
