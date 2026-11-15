// ============================================================
// PUMAS DEV LAB · MapStream (interfaz)
// ------------------------------------------------------------
// Carga de partidas, controles de reproducción, equipos y bajas.
// El motor está en js/mapstream.js.
// ============================================================

let mapstream = null;
let msUltimoPanel = 0;

function abrirMapStream() {
    irA('vista-mapstream');
    if (!mapstream) {
        mapstream = new MapStream($('#ms-canvas'), { alCambiarTiempo: msAlCambiarTiempo, alTerminar: msPintarBotonPlay });
        $('#ms-demo-mapa').innerHTML = CATALOGO.mapas.map(m => `<option value="${m}">${m}</option>`).join('');
    }
    msMostrar(!!mapstream.replay);
}

// Alterna entre la pantalla de carga y el visor
function msMostrar(visor) {
    $('#ms-carga').hidden = visor;
    $('#ms-visor').hidden = !visor;
    if (visor) { msVista('replay'); mapstream.medir(); requestAnimationFrame(() => mapstream.medir()); }
}

// ---------- Carga ----------
// Acepta los replays del juego (ReplayInfo_<id>_<fecha>.bin + .json, uno o
// varios de la misma partida) o un .json ya exportado por MapStream.
let msPendientes = null;     // partidas detectadas al soltar varios archivos

async function msArchivos(lista) {
    const archivos = [...(lista || [])];
    if (!archivos.length) return;
    const base = n => n.replace(/\.(bin|json)$/i, '');
    const bins = archivos.filter(f => /\.bin$/i.test(f.name));
    const jsons = archivos.filter(f => /\.json$/i.test(f.name));

    // Replays del juego: cada .bin con su .json del mismo nombre
    if (bins.length) {
        const pares = bins.map(b => [b, jsons.find(j => base(j.name) === base(b.name))]);
        const sinJson = pares.filter(p => !p[1]).map(p => p[0].name);
        if (sinJson.length === pares.length) return msAviso(`Falta el .json de ${sinJson[0]}: el juego guarda los dos archivos con el mismo nombre; súbelos juntos.`, true);
        msAviso('Leyendo el replay…');
        try {
            // Agrupar por partida (MatchID del .json)
            const grupos = new Map();
            for (const [b, j] of pares.filter(p => p[1])) {
                const info = JSON.parse((await j.text()).replace(/^\uFEFF/, ''));
                const id = String(info.MatchID || base(b.name));
                if (!grupos.has(id)) grupos.set(id, { info, pares: [] });
                grupos.get(id).pares.push([b, info]);
            }
            if (grupos.size > 1) return msElegirPartida(grupos);
            await msLeerGrupo([...grupos.values()][0], sinJson);
        } catch (err) {
            msAviso('No se pudo leer el replay: ' + (err.message || err), true);
        }
        return;
    }

    const json = jsons[0];
    if (!json) return msAviso('Elige el .bin y el .json del replay, o un .json de MapStream.', true);
    try {
        const datos = JSON.parse((await json.text()).replace(/^\uFEFF/, ''));
        msCargar(msInterpretar(datos), json.name);
    } catch (err) {
        msAviso(err.message || 'No se pudo leer el archivo.', true);
    }
}

async function msLeerGrupo(grupo, sinJson = []) {
    const pares = [];
    for (const [b, info] of grupo.pares) pares.push([new Uint8Array(await b.arrayBuffer()), info]);
    const replay = FFReplay.leerVarios(pares);
    msCargar(replay, `${replay.replays} replay(s)`);
    const jug = replay.equipos.flatMap(e => e.jugadores);
    const conPos = jug.filter(j => j.pos.length).length;
    const avisos = [];
    if (conPos < jug.length) avisos.push(`Hay posiciones de ${conPos} de ${jug.length} jugadores: el replay solo guarda a los que estaban cerca de quien grabó. Sube también el replay de otros equipos de esta misma partida para ver a todos.`);
    if (sinJson.length) avisos.push(`Sin .json, no se usaron: ${sinJson.join(', ')}.`);
    if (avisos.length) toast(avisos[0]);
}

// Varias partidas a la vez: se elige cuál ver
function msElegirPartida(grupos) {
    msPendientes = [...grupos.values()];
    const el = $('#ms-aviso');
    el.hidden = false;
    el.classList.remove('nota-alerta');
    el.innerHTML = `<div><strong>Soltaste ${grupos.size} partidas distintas. ¿Cuál quieres ver?</strong>
        <div class="ms-elegir">${msPendientes.map((g, i) => `
            <button type="button" class="btn-sec" onclick="msElegir(${i})">${esc(g.info.RoomName || 'Partida')} · ${esc(FFReplay.MAPAS[g.info.MapID]?.mapa || 'mapa ' + g.info.MapID)} · ${esc(String(g.info.MatchDateTime || '').slice(0, 16))}${g.pares.length > 1 ? ` · ${g.pares.length} replays` : ''}</button>`).join('')}
        </div></div>`;
}

async function msElegir(i) {
    try { await msLeerGrupo(msPendientes[i]); }
    catch (err) { msAviso('No se pudo leer el replay: ' + (err.message || err), true); }
}

// Acepta el formato propio, una partida exportada de QG Pro o el envoltorio { replay }
function msInterpretar(d) {
    const r = d && d.replay ? d.replay : d;
    if (r && Array.isArray(r.equipos)) return r;
    if (r && Array.isArray(r.times)) {
        const conv = MapStream.desdeQGPro(r);
        const conPos = conv.equipos.some(e => e.jugadores.some(j => j.pos.length));
        if (!conPos) throw new Error('Esa partida no trae posiciones de los jugadores (solo metadatos del .json del juego). Hace falta el .bin decodificado.');
        return conv;
    }
    if (d && 'MatchID' in d) throw new Error('Ese es el .json del replay del juego: súbelo junto con su .bin (mismo nombre).');
    throw new Error('El archivo no tiene el formato de una partida de MapStream.');
}

function msCargar(replay, origen = '') {
    mapstream.cargar(replay);
    const r = mapstream.replay;
    $('#ms-titulo').textContent = r.nombre || 'Partida';
    $('#ms-meta').textContent = [r.mapa, relojMs(r.duracion), r.fecha, r.demo ? 'datos de demostración' : origen].filter(Boolean).join(' · ');
    const tl = $('#ms-linea');
    tl.min = Math.floor(mapstream.inicioAccion);
    tl.max = Math.ceil(r.duracion);
    $('#ms-total').textContent = relojMs(r.duracion);
    msPintarFases();
    msPintarCapas();
    msPintarFiltrosAnalisis();
    msFiltrosArmasActualizar();
    msFiltrosRutasActualizar();
    msFiltrosIndivActualizar();
    msAviso('');
    msMostrar(true);
    msAlCambiarTiempo(mapstream.tiempo, true);
    msPintarBotonPlay();
    // Enriquecer equipos con logos del roster de la organización
    if (typeof Auth !== 'undefined') {
        Auth.equiposVisibles().then(equiposOrg => {
            const norm = s => s.toLowerCase().trim().normalize('NFD').replace(/[̀-ͯ]/g, '');
            r.equipos.forEach(eq => {
                const eqN = norm(eq.nombre);
                const match = equiposOrg.find(t => norm(t.nombre) === eqN);
                if (match?.logo) eq.logoUrl = match.logo;
            });
            console.log('[MapStream] Roster:', equiposOrg.map(t => t.nombre), '| Replay:', r.equipos.map(e => e.nombre));
            msAlCambiarTiempo(mapstream.tiempo, true);
        }).catch(err => console.warn('[MapStream] No se pudo obtener roster:', err));
    }
}

function msDemo() {
    msCargar(MapStream.demo($('#ms-demo-mapa').value));
}

function msOtra() {
    mapstream.pausar();
    msPintarBotonPlay();
    msMostrar(false);
}

function msAviso(txt, error = false) {
    const el = $('#ms-aviso');
    el.textContent = txt;
    el.hidden = !txt;
    el.classList.toggle('nota-alerta', error);
}

// ---------- Reproducción ----------
function msPlay() {
    mapstream.alternar();
    msPintarBotonPlay();
}

function msPintarBotonPlay() {
    const b = $('#ms-play');
    if (!b || !mapstream) return;
    b.innerHTML = mapstream.reproduciendo ? '<i class="fa-solid fa-pause"></i>' : '<i class="fa-solid fa-play"></i>';
    b.title = mapstream.reproduciendo ? 'Pausar (espacio)' : 'Reproducir (espacio)';
}

function msSaltar(seg) {
    mapstream.ir(mapstream.tiempo + seg);
}

function msVelocidad(v) {
    mapstream.velocidad = Number(v);
}

function msAlCambiarTiempo(t, forzar = false) {
    const r = mapstream.replay;
    if (!r) return;
    $('#ms-linea').value = t;
    $('#ms-reloj').textContent = relojMs(t);
    const ahora = performance.now();
    if (!forzar && mapstream.reproduciendo && ahora - msUltimoPanel < 350) return;
    msUltimoPanel = ahora;
    const vivos = r.equipos.filter(e => mapstream.equipoVivo(e, t));
    const jugVivos = r.equipos.reduce((n, e) => n + e.jugadores.filter(j => mapstream.vivo(e, j, t)).length, 0);
    const fase = mapstream.faseActual(t);
    const fases = r.zonas.filter(z => !z.inicial).length;
    $('#ms-stats').innerHTML = `
        <div><strong>${vivos.length}/${r.equipos.length}</strong><span>Equipos vivos</span></div>
        <div><strong>${jugVivos}/${r.equipos.reduce((n, e) => n + e.jugadores.length, 0)}</strong><span>Jugadores</span></div>
        <div><strong>${fase && !fase.inicial ? fase.fase : 0}/${fases}</strong><span>Zona</span></div>`;
    $$('#ms-fases button').forEach(b => b.classList.toggle('activo', fase && Number(b.dataset.fase) === fase.fase));
    msPintarEquipos(t);
    msPintarBajas(t);
    msPintarEventos(t);
}

// ---------- Línea de tiempo ----------
function msPintarFases() {
    const r = mapstream.replay;
    const ini = mapstream.inicioAccion, rango = (r.duracion - ini) || 1;
    const zonas = r.zonas.filter(z => !z.inicial);
    $('#ms-marcas').innerHTML = zonas.map(z =>
        `<span class="ms-marca" style="left:${Math.max(0, (z.anunciadaEn - ini) / rango * 100)}%" title="Zona ${z.fase} anunciada · ${relojMs(z.anunciadaEn)}"></span>`).join('');
    $('#ms-fases').innerHTML = `<button type="button" class="btn-sec" onclick="mapstream.ir(mapstream.inicioAccion)" title="Ir a la caída"><i class="fa-solid fa-parachute-box"></i></button>` +
        zonas.map(z => `<button type="button" class="btn-sec" data-fase="${z.fase}" onclick="mapstream.ir(${z.anunciadaEn})" title="Ir a la zona ${z.fase}">Z${z.fase}</button>`).join('');
}

// ---------- Equipos ----------
function msPintarEquipos(t) {
    const r = mapstream.replay;
    const bajas = mapstream.bajasHasta(t);
    const orden = [...r.equipos].sort((a, b) => (mapstream.equipoVivo(b, t) - mapstream.equipoVivo(a, t)) || (bajas[b.id] - bajas[a.id]));
    $('#ms-equipos').innerHTML = orden.map((e, i) => {
        const vivo = mapstream.equipoVivo(e, t);
        const oculto = mapstream.ocultos.has(e.id), foco = mapstream.foco.has(e.id), sigue = mapstream.seguir === e.id;
        // Jugadores con kills individuales y arma top
        const jugHtml = e.jugadores.map(j => {
            const vj = mapstream.vivo(e, j, t);
            const kills = mapstream.killsJugador(j, t);
            const arma = j.armaTop ? `<small class="ms-jug-arma" title="Arma más usada">${esc(j.armaTop)}</small>` : '';
            return `<div class="ms-jugador ${vj ? '' : 'muerto'}">
                <i class="ms-jug-dot ${j.pos.length ? '' : 'sinpos'}" title="${esc(j.nombre)}${j.pos.length ? '' : ' · sin posición'}"></i>
                <span class="ms-jug-nombre">${esc(j.nombre)}</span>
                ${kills > 0 ? `<span class="ms-jug-kills">×${kills}</span>` : ''}
                ${arma}
            </div>`;
        }).join('');
        const logoEl = e.logoUrl
            ? `<img src="${esc(e.logoUrl)}" class="ms-eq-logo" alt="${esc(e.nombre)}">`
            : `<span class="ms-eq-n">${i + 1}</span>`;
        return `
        <div class="ms-eq ${vivo ? '' : 'fuera'} ${foco ? 'foco' : ''}" style="--c:${e.color}">
            <div class="ms-eq-cabeza">
                ${logoEl}
                <label class="ms-eq-info">
                    <input type="checkbox" ${oculto ? '' : 'checked'} onchange="msMostrarEquipo('${e.id}', this.checked)" aria-label="Mostrar ${esc(e.nombre)}">
                    <span><strong>${esc(e.nombre)}</strong>
                    <small>${bajas[e.id]} bajas${!vivo && e.eliminadoEn != null ? ` · fuera ${relojMs(e.eliminadoEn)}` : ''}${e.jugadores.every(j => !j.pos.length) ? ' · sin pos.' : ''}</small></span>
                </label>
                <button type="button" class="ms-btn ${foco ? 'activo' : ''}" title="${foco ? 'Quitar foco' : 'Resaltar equipo'}" onclick="msFoco('${e.id}')"><i class="fa-solid fa-star"></i></button>
                <button type="button" class="ms-btn ${sigue ? 'activo' : ''}" title="${sigue ? 'Dejar de seguir' : 'Seguir con la cámara'}" onclick="msSeguir('${e.id}')"><i class="fa-solid fa-video"></i></button>
            </div>
            <div class="ms-jugadores">${jugHtml}</div>
        </div>`;
    }).join('');
}

// Los id pueden venir como número o texto según el origen de la partida
const msId = id => (mapstream.replay.equipos.find(e => String(e.id) === String(id)) || {}).id;

function msMostrarEquipo(id, ver) {
    const real = msId(id);
    ver ? mapstream.ocultos.delete(real) : mapstream.ocultos.add(real);
    mapstream.dibujar();
}

function msFoco(id) {
    const real = msId(id);
    mapstream.foco.has(real) ? mapstream.foco.delete(real) : mapstream.foco.add(real);
    mapstream.dibujar();
    msAlCambiarTiempo(mapstream.tiempo, true);
}

function msSeguir(id) {
    const real = msId(id);
    mapstream.seguir = mapstream.seguir === real ? null : real;
    if (mapstream.seguir == null) mapstream.centrar();
    mapstream.dibujar();
    msAlCambiarTiempo(mapstream.tiempo, true);
}

// ---------- Panel de eventos (rescates, gloos) ----------
function msPintarEventos(t) {
    const r = mapstream?.replay;
    const el = $('#ms-eventos');
    if (!el || !r) return;
    const resc = (r.rescates || []).filter(x => x.t <= t).length;
    const gloo = (r.gloos || []).filter(x => x.t <= t).length;
    if (!resc && !gloo) { el.hidden = true; return; }
    el.hidden = false;
    // Top rescatadores
    const rescTop = new Map();
    (r.rescates || []).filter(x => x.t <= t).forEach(x => {
        const eq = r.equipos.find(e => e.jugadores.some(j => j.id === x.revividor));
        const nombre = eq?.jugadores.find(j => j.id === x.revividor)?.nombre || '?';
        rescTop.set(nombre, (rescTop.get(nombre) || 0) + 1);
    });
    const topResc = [...rescTop].sort((a, b) => b[1] - a[1]).slice(0, 3);
    el.innerHTML = `
        <div class="ms-ev-row"><i class="fa-solid fa-heart-pulse" style="color:#00ff99"></i> Rescates: <strong>${resc}</strong>
            ${topResc.length ? `<span class="ayuda"> · ${topResc.map(([n, v]) => `${esc(n)} ×${v}`).join(', ')}</span>` : ''}</div>
        ${gloo ? `<div class="ms-ev-row"><i class="fa-solid fa-shield-halved" style="color:#00e5ff"></i> Muros gloo: <strong>${gloo}</strong></div>` : ''}`;
}

// ---------- Bajas ----------
function msPintarBajas(t) {
    const r = mapstream.replay;
    const color = n => (r.equipos.find(e => e.nombre === n) || {}).color || 'var(--secondary)';
    const lista = r.bajas.filter(b => b.t <= t).slice(-40).reverse();
    $('#ms-bajas').innerHTML = lista.length ? lista.map(b => `
        <div class="ms-baja">
            <span><b style="color:${color(b.equipoMatador)}">${esc(b.matador)}</b> <i class="fa-solid fa-skull"></i> <b style="color:${color(b.equipoVictima)}">${esc(b.victima)}</b>
            ${b.arma ? `<small>${esc(b.arma)}</small>` : ''}</span>
            <button type="button" class="btn-link" onclick="mapstream.ir(${b.t - 3})">${relojMs(b.t)}</button>
        </div>`).join('') : '<p class="ayuda">Aún no hay bajas.</p>';
}

// ---------- Capas ----------
const MS_CAPAS = [
    ['estelas', 'Estelas'],
    ['nombres', 'Nombres de equipo'],
    ['etiquetas', 'Nombre + kills de cada jugador'],
    ['bajas', 'Bajas en el mapa'],
    ['acciones', 'Eventos (rescates, muros gloo)'],
    ['caidas', 'Zonas de caída'],
    ['rutaCompleta', 'Ruta completa del equipo en foco'],
    ['zona', 'Zona'],
    ['fasesPrevias', 'Fases de zona ya cerradas'],
    ['avion', 'Avión'],
    ['rotacion', 'Flechas de rotación']
];

function msPintarCapas() {
    $('#ms-capas').innerHTML = MS_CAPAS.map(([id, n]) =>
        `<label class="check"><input type="checkbox" ${mapstream.capas[id] ? 'checked' : ''} onchange="mapstream.capas.${id} = this.checked; mapstream.dibujar()"> ${n}</label>`).join('');
}

async function msCaptura() {
    const blob = await mapstream.capturaPNG();
    if (!blob) return;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `mapstream-${(mapstream.replay.nombre || 'partida').toLowerCase().replace(/[^a-z0-9áéíóúñ]+/gi, '-')}-${Math.round(mapstream.tiempo)}s.png`;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
}

function relojMs(seg) {
    seg = Math.max(0, Math.round(seg || 0));
    return `${String(Math.floor(seg / 60)).padStart(2, '0')}:${String(seg % 60).padStart(2, '0')}`;
}

// Arrastrar y soltar archivos
document.addEventListener('DOMContentLoaded', () => {
    const zona = $('#ms-drop');
    if (!zona) return;
    ['dragenter', 'dragover'].forEach(t => zona.addEventListener(t, ev => { ev.preventDefault(); zona.classList.add('encima'); }));
    ['dragleave', 'drop'].forEach(t => zona.addEventListener(t, ev => { ev.preventDefault(); zona.classList.remove('encima'); }));
    zona.addEventListener('drop', ev => msArchivos(ev.dataTransfer.files));
});

// ---------- Análisis: tabs, mapa de calor y estadísticas de zona ----------
let msVistaActual = 'replay';

function msVista(modo) {
    msVistaActual = modo;
    const modos = { replay: '#ms-modo-replay', 'calor-movimiento': '#ms-modo-calor', 'calor-peleas': '#ms-modo-calor', zona: '#ms-modo-zona', stats: '#ms-modo-stats', escuadras: '#ms-modo-escuadras', armas: '#ms-modo-armas', rutas: '#ms-modo-rutas', individual: '#ms-modo-individual' };
    Object.values([...new Set(Object.values(modos))]).forEach(sel => { const el = $(sel); if (el) el.hidden = true; });
    const activo = modos[modo];
    if (activo) { const el = $(activo); if (el) el.hidden = false; }
    $$('.ms-tab').forEach(b => b.classList.toggle('activo', b.dataset.vista === modo));
    const blq = $('#ms-bloque-analisis');
    if (blq) blq.hidden = !['calor-movimiento', 'calor-peleas'].includes(modo);
    const tit = $('#ms-analisis-titulo');
    if (tit) tit.textContent = modo === 'calor-movimiento' ? '— Movimiento' : modo === 'calor-peleas' ? '— Peleas' : '';
    if (modo === 'calor-movimiento') msCalorRenderizar('movimiento');
    else if (modo === 'calor-peleas') msCalorRenderizar('peleas');
    else if (modo === 'zona') msZonaPintar();
    else if (modo === 'stats') msEstadisticasPintar();
    else if (modo === 'escuadras') msEscudrasPintar();
    else if (modo === 'armas') { msFiltrosArmasActualizar(); msArmasPintar(); }
    else if (modo === 'rutas') { msFiltrosRutasActualizar(); msRutasPintar(); }
    else if (modo === 'individual') { msFiltrosIndivActualizar(); msIndividualPintar(); }
    if (modo === 'replay' && mapstream) mapstream.medir();
}

// Obtiene dimensiones del canvas forzando altura si el layout flex falla
function msLienzoRect(cv) {
    const r = cv.parentElement.getBoundingClientRect();
    if (r.width > 0 && r.height > 50) return r;
    // Fallback: calcula desde el visor (solo si está visible)
    const visor = $('#ms-visor');
    if (!visor || visor.hidden) return r;
    const vr = visor.getBoundingClientRect();
    if (!vr.width) return r;
    const tabsH = $('.ms-tabs-bar')?.offsetHeight || 48;
    const filtersEl = cv.closest('[id^="ms-modo-"]')?.querySelector('.ms-analisis-filtros');
    const filtersH = filtersEl ? filtersEl.offsetHeight : 0;
    const h = Math.max(300, vr.height - tabsH - filtersH);
    return { width: Math.max(300, vr.width), height: h };
}

// Garantiza que mapstream.fondo esté cargado; llama cb() cuando esté listo
function msConFondo(cb) {
    if (mapstream.fondo) { cb(); return; }
    const src = typeof MapStream !== 'undefined' ? MapStream.imagenMapa?.(mapstream.replay?.mapa) : null;
    if (!src) { cb(); return; }  // sin imagen: renderiza igual
    const im = new Image();
    im.onload = () => { mapstream.fondo = im; cb(); };
    im.onerror = () => cb();
    im.src = src;
}

function msCalorRenderizar(tipo) {
    if (typeof MSCalor === 'undefined') return;
    const cv = $('#ms-calor');
    if (!cv || !mapstream || !mapstream.replay) return;
    msConFondo(() => _msCalorRenderizar(tipo));
}
function _msCalorRenderizar(tipo) {
    const cv = $('#ms-calor');
    if (!cv || !mapstream?.replay) return;
    const rect = msLienzoRect(cv);
    if (!rect.width || !rect.height) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    cv.width = Math.round(rect.width * dpr);
    cv.height = Math.round(rect.height * dpr);
    cv.style.width = rect.width + 'px';
    cv.style.height = rect.height + 'px';
    const ctx = cv.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const W = rect.width, H = rect.height;
    const base = Math.min(W, H) / 1000 * 0.98;
    const opciones = {};
    const eqSel = $('#ms-calor-equipo')?.value;
    if (eqSel) opciones.equipos = [Number(eqSel)];
    const faseSel = $('#ms-calor-fase')?.value;
    if (faseSel) opciones.fase = Number(faseSel);
    MSCalor.dibujar(ctx, W, H, base, mapstream.fondo, mapstream.replay, tipo, opciones);
}

function msPintarFiltrosAnalisis() {
    const r = mapstream?.replay;
    if (!r) return;
    const selEq = $('#ms-calor-equipo');
    if (selEq) selEq.innerHTML = `<option value="">Todos</option>` + r.equipos.map(e => `<option value="${e.id}">${esc(e.nombre)}</option>`).join('');
    const selFase = $('#ms-calor-fase');
    if (selFase) {
        const fases = (r.zonas || []).filter(z => !z.inicial);
        selFase.innerHTML = `<option value="">Todas</option>` + fases.map((z, i) => `<option value="${i + 1}">Zona ${i + 1}</option>`).join('');
    }
}

function msZonaPintar() {
    if (typeof MSCalor === 'undefined') return;
    const el = $('#ms-zona-stats');
    if (!el || !mapstream?.replay) return;
    const stats = MSCalor.analizarZona(mapstream.replay);
    if (!stats.length) {
        el.innerHTML = '<p class="ayuda">Esta partida no tiene datos de zona.</p>';
        return;
    }
    const color = n => (mapstream.replay.equipos?.find(e => e.nombre === n) || {}).color || 'var(--secondary)';
    el.innerHTML = stats.map(s => `
        <div class="ms-zona-fase">
            <div class="ms-zona-cabeza">
                <strong>Zona ${s.fase}</strong>
                <span class="ayuda">${relojMs(s.anunciadaEn)} → ${relojMs(s.finCierre)} · r=${s.radio}</span>
            </div>
            <div class="ms-zona-datos">
                <span><strong>${s.kills}</strong> kills en zona</span>
                <span><strong>${s.muertesZona}</strong> muertes de zona</span>
            </div>
            ${s.top.length ? `<div class="ayuda ms-zona-top">${s.top.map(([eq, k]) => `<span style="color:${color(eq)}">${esc(eq)} ×${k}</span>`).join(' · ')}</div>` : ''}
        </div>`).join('');
}

// ---------- Estadísticas ----------
function msEstadisticasPintar() {
    const el = $('#ms-stats-cont');
    if (!el || !mapstream?.replay) { if (el) el.innerHTML = '<p class="ayuda">Carga una partida para ver estadísticas.</p>'; return; }
    const r = mapstream.replay;
    const tTotal = r.bajas.length ? Math.max(...r.bajas.map(b => b.t)) : 0;

    // Precalcular por jugador
    const kills = new Map(), muertes = new Map(), rescates = new Map(), tMuerte = new Map();
    r.bajas.forEach(b => {
        if (b.idMatador) kills.set(b.idMatador, (kills.get(b.idMatador) || 0) + 1);
        if (b.idVictima) {
            muertes.set(b.idVictima, (muertes.get(b.idVictima) || 0) + 1);
            tMuerte.set(b.idVictima, b.t);
        }
    });
    (r.rescates || []).forEach(x => rescates.set(x.revividor, (rescates.get(x.revividor) || 0) + 1));

    el.innerHTML = r.equipos.map(e => {
        const eKills = e.jugadores.reduce((s, j) => s + (kills.get(j.id) || 0), 0);
        const eMuertes = e.jugadores.filter(j => muertes.get(j.id)).length;
        const rows = e.jugadores.map(j => {
            const k = kills.get(j.id) || 0;
            const murio = !!muertes.get(j.id);
            const t = tMuerte.get(j.id);
            const resc = rescates.get(j.id) || 0;
            return `<tr class="${murio ? 'ms-st-muerto' : ''}">
                <td><i class="ms-jug-dot" style="background:${e.color};box-shadow:0 0 5px ${e.color}66;width:8px;height:8px;border-radius:50%;display:inline-block;flex-shrink:0"></i> ${esc(j.nombre)}</td>
                <td class="ms-st-num">${k > 0 ? `<b>${k}</b>` : '—'}</td>
                <td class="ms-st-num">${resc > 0 ? resc : '—'}</td>
                <td class="ms-st-arma">${j.armaTop ? esc(j.armaTop) : '—'}</td>
                <td class="ms-st-t">${t != null ? relojMs(t) : murio ? '?' : '<span class="ms-st-vivo">vivo</span>'}</td>
            </tr>`;
        }).join('');
        return `<div class="ms-st-equipo">
            <div class="ms-st-eq-cab" style="border-left:3px solid ${e.color}">
                <strong>${esc(e.nombre)}</strong>
                <span class="ms-st-eq-resumen">
                    <span title="Kills totales"><i class="fa-solid fa-skull"></i> ${eKills}</span>
                    <span title="Jugadores eliminados" class="${eMuertes === e.jugadores.length ? 'ms-st-elim' : ''}">${eMuertes}/${e.jugadores.length} elim.</span>
                </span>
            </div>
            <table class="ms-st-tabla">
                <thead><tr><th>Jugador</th><th>Kills</th><th>Rescates</th><th>Arma</th><th>Eliminado</th></tr></thead>
                <tbody>${rows}</tbody>
            </table>
        </div>`;
    }).join('');
}

// ─────────────────────────────────────────────────────────────
// Tab ESCUADRAS: matrix de kills equipo vs equipo + resumen
// ─────────────────────────────────────────────────────────────
function msEscudrasPintar() {
    const el = $('#ms-escuadras-cont');
    if (!el || !mapstream?.replay) { if (el) el.innerHTML = '<p class="ayuda">Carga una partida para ver el análisis de escuadras.</p>'; return; }
    const r = mapstream.replay;

    // Orden de equipos: por posición final (menos eliminados primero, luego por kill count)
    const orden = [...r.equipos].sort((a, b) => {
        const aElim = a.eliminadoEn ?? Infinity, bElim = b.eliminadoEn ?? Infinity;
        if (bElim !== aElim) return bElim - aElim;
        const ak = r.bajas.filter(x => x.equipoMatador === a.nombre).length;
        const bk = r.bajas.filter(x => x.equipoMatador === b.nombre).length;
        return bk - ak;
    });

    // Matrix kills[atacante][víctima]
    const matrix = {};
    orden.forEach(a => { matrix[a.nombre] = {}; orden.forEach(v => { matrix[a.nombre][v.nombre] = 0; }); });
    r.bajas.forEach(b => {
        if (b.equipoMatador && b.equipoVictima && matrix[b.equipoMatador]) {
            matrix[b.equipoMatador][b.equipoVictima] = (matrix[b.equipoMatador][b.equipoVictima] || 0) + 1;
        }
    });

    const colorEq = nombre => (r.equipos.find(e => e.nombre === nombre) || {}).color || 'var(--secondary)';

    // Tabla matrix
    const headerCells = orden.map(e => `<th style="color:${colorEq(e.nombre)};max-width:70px;font-size:0.7rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${esc(e.nombre)}">${esc(e.nombre)}</th>`).join('');
    const rows = orden.map(atk => {
        const atkTotal = orden.reduce((s, v) => s + (matrix[atk.nombre][v.nombre] || 0), 0);
        const cells = orden.map(vic => {
            const n = matrix[atk.nombre][vic.nombre] || 0;
            const self = atk.nombre === vic.nombre;
            return self
                ? `<td class="ms-mx-self">—</td>`
                : n ? `<td class="ms-mx-kill" style="background:${colorEq(atk.nombre)}22;font-weight:700">${n}</td>`
                : `<td class="ms-mx-zero">0</td>`;
        }).join('');
        const murio = atk.eliminadoEn != null;
        return `<tr class="${murio ? 'ms-st-muerto' : ''}">
            <td class="ms-mx-eq" style="color:${colorEq(atk.nombre)};font-weight:600">${esc(atk.nombre)}</td>
            ${cells}
            <td class="ms-mx-total"><b>${atkTotal}</b></td>
        </tr>`;
    }).join('');

    // Tabla top killers
    const killerMap = {};
    r.bajas.forEach(b => { if (b.matador) killerMap[b.matador] = (killerMap[b.matador] || 0) + 1; });
    const topKillers = Object.entries(killerMap).sort((a, b) => b[1] - a[1]).slice(0, 10);

    // Tabla de stats de combate por jugador (del .bin)
    const todosJugadores = r.equipos.flatMap(e => e.jugadores.map(j => ({ ...j, equipoNombre: e.nombre, equipoColor: e.color })));
    const hayDano = todosJugadores.some(j => j.dano > 0);
    const hayDerribos = todosJugadores.some(j => j.derribosHechos > 0);
    const hayGloos = (r.gloos || []).length > 0;
    const hayRescates = (r.rescates || []).length > 0;

    // Contadores de gloos/rescates por jugador
    const gloosPor = {};
    (r.gloos || []).forEach(g => { gloosPor[g.jugador] = (gloosPor[g.jugador] || 0) + 1; });
    const rescatesPor = {};
    (r.rescates || []).forEach(rv => { rescatesPor[rv.revividor] = (rescatesPor[rv.revividor] || 0) + 1; });

    const combatFilas = [...todosJugadores].sort((a, b) => (b.dano || 0) - (a.dano || 0));

    let tablaStats = '';
    if (hayDano) {
        const ths = [
            '<th>Jugador</th>',
            '<th title="Bajas">Bajas</th>',
            hayDerribos ? '<th title="Derribos">Derrib.</th>' : '',
            '<th title="Daño causado">Daño</th>',
            '<th title="Daño recibido">Rec.</th>',
            '<th title="Impactos causados">Golpes</th>',
            '<th title="Headshots">HS</th>',
            '<th title="% Headshots">%HS</th>',
            hayGloos ? '<th title="Muros Gloo colocados">Gloo</th>' : '',
            hayRescates ? '<th title="Rescates realizados">Rev.</th>' : '',
            '<th title="Arma principal">Arma</th>',
        ].filter(Boolean).join('');

        const filas = combatFilas.map(j => {
            const kills = r.bajas.filter(b => b.idMatador === j.id).length;
            const pct = j.hitsHechos > 0 ? Math.round((j.headshots || 0) / j.hitsHechos * 100) : null;
            const armaTop = (j.danoArma || [])[0]?.nombre || j.armaTop || '—';
            return `<tr>
                <td class="ms-mx-eq" style="color:${j.equipoColor || 'var(--secondary)'}">${esc(j.nombre)}<br><small style="opacity:.55">${esc(j.equipoNombre)}</small></td>
                <td>${kills || 0}</td>
                ${hayDerribos ? `<td>${j.derribosHechos || 0}</td>` : ''}
                <td class="ms-st-dano">${j.dano ? j.dano.toLocaleString() : '—'}</td>
                <td class="ms-st-rec">${j.danoRecibido ? j.danoRecibido.toLocaleString() : '—'}</td>
                <td>${j.hitsHechos || 0}</td>
                <td>${j.headshots || 0}</td>
                <td>${pct != null ? pct + '%' : '—'}</td>
                ${hayGloos ? `<td>${gloosPor[j.id] || 0}</td>` : ''}
                ${hayRescates ? `<td>${rescatesPor[j.id] || 0}</td>` : ''}
                <td class="ms-st-arma">${esc(armaTop)}</td>
            </tr>`;
        }).join('');

        tablaStats = `<div style="padding:12px 16px 6px"><h4 style="margin-bottom:8px;font-size:0.75rem;text-transform:uppercase;letter-spacing:.08em;color:var(--secondary)"><i class="fa-solid fa-chart-bar"></i> Stats por jugador</h4>
        <div class="ms-mx-wrap"><table class="ms-mx-tabla"><thead><tr>${ths}</tr></thead><tbody>${filas}</tbody></table></div>
        <div style="margin-top:6px;font-size:0.65rem;color:rgba(255,255,255,0.3)">Daño, impactos y HS del replay (.bin). El daño puede diferir ±10% del oficial.</div></div>`;
    }

    el.innerHTML = `
    <div style="padding:12px 16px 0;font-size:0.7rem;color:var(--secondary)">Filas = quien mató · Columnas = quién fue eliminado · Total en la última columna.</div>
    <div class="ms-mx-wrap">
        <table class="ms-mx-tabla">
            <thead><tr><th></th>${headerCells}<th>Total</th></tr></thead>
            <tbody>${rows}</tbody>
        </table>
    </div>
    <div style="padding:12px 16px 6px"><h4 style="margin-bottom:8px;font-size:0.75rem;text-transform:uppercase;letter-spacing:.08em;color:var(--secondary)"><i class="fa-solid fa-trophy"></i> Top killers</h4>
        <div class="ms-top-killers">${topKillers.map(([nombre, k]) => {
            const eq = r.equipos.find(e => e.jugadores.some(j => j.nombre === nombre));
            return `<div class="ms-top-row"><span style="color:${colorEq(eq?.nombre)}">${esc(nombre)}</span><span class="ms-st-num"><b>${k}</b></span></div>`;
        }).join('')}
        </div>
    </div>
    ${tablaStats}`;
}

// ─────────────────────────────────────────────────────────────
// Tab ARMAS: frecuencia de armas en kills, filtrable por equipo
// ─────────────────────────────────────────────────────────────
function msFiltrosArmasActualizar() {
    const r = mapstream?.replay;
    const sel = $('#ms-armas-equipo');
    if (!sel || !r) return;
    sel.innerHTML = `<option value="">Todos</option>` + r.equipos.map(e => `<option value="${esc(e.nombre)}">${esc(e.nombre)}</option>`).join('');
}

function msArmasPintar() {
    const el = $('#ms-armas-cont');
    if (!el || !mapstream?.replay) { if (el) el.innerHTML = '<p class="ayuda">Carga una partida.</p>'; return; }
    const r = mapstream.replay;
    const eqFiltro = $('#ms-armas-equipo')?.value || '';

    const conteo = {};
    r.bajas.forEach(b => {
        if (eqFiltro && b.equipoMatador !== eqFiltro) return;
        const a = b.arma || 'Sin identificar';
        conteo[a] = (conteo[a] || 0) + 1;
    });
    const lista = Object.entries(conteo).filter(([a]) => a !== 'Sin identificar').sort((a, b) => b[1] - a[1]);
    const sinId = conteo['Sin identificar'] || 0;
    if (lista.length === 0 && !sinId) { el.innerHTML = '<p class="ayuda">No hay datos de armas para este filtro.</p>'; return; }

    // Daño por arma (del .bin, si está disponible)
    const danoArmaTotal = {};
    r.equipos.forEach(e => {
        if (eqFiltro && e.nombre !== eqFiltro) return;
        e.jugadores.forEach(j => {
            (j.danoArma || []).forEach(a => {
                if (a.nombre && a.dano > 0) danoArmaTotal[a.nombre] = (danoArmaTotal[a.nombre] || 0) + a.dano;
            });
        });
    });
    const hayDanoBin = Object.keys(danoArmaTotal).length > 0;

    const max = lista[0]?.[1] || 1;
    const maxDano = hayDanoBin ? Math.max(...lista.map(([a]) => danoArmaTotal[a] || 0), 1) : 1;
    const colorEq = nombre => (r.equipos.find(e => e.nombre === nombre) || {}).color || null;
    const barColor = eqFiltro ? (colorEq(eqFiltro) || 'var(--primary)') : 'var(--primary)';

    // Desglose por equipo para cada arma si no hay filtro
    const desglose = !eqFiltro;
    const eqColores = Object.fromEntries(r.equipos.map(e => [e.nombre, e.color]));

    el.innerHTML = `<div class="ms-armas-lista">${lista.map(([arma, total]) => {
        let detalle = '';
        if (desglose) {
            const porEq = {};
            r.bajas.filter(b => b.arma === arma).forEach(b => { porEq[b.equipoMatador] = (porEq[b.equipoMatador] || 0) + 1; });
            detalle = `<div class="ms-arma-desglose">${Object.entries(porEq).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([eq, n]) => `<span style="color:${eqColores[eq] || 'var(--secondary)'}">${esc(eq)} ×${n}</span>`).join(' · ')}</div>`;
        }
        const pct = total / max * 100;
        const dano = danoArmaTotal[arma] || 0;
        const danoPct = dano > 0 ? dano / maxDano * 100 : 0;
        return `<div class="ms-arma-fila">
            <div class="ms-arma-nombre">${esc(arma)}</div>
            <div class="ms-arma-barra-wrap">
                <div class="ms-arma-barra" style="width:${pct.toFixed(1)}%;background:${barColor}"></div>
            </div>
            <div class="ms-arma-num">${total} kills</div>
            ${hayDanoBin && dano > 0 ? `<div class="ms-arma-barra-wrap" style="grid-column:2"><div class="ms-arma-barra" style="width:${danoPct.toFixed(1)}%;background:#f9c74f88"></div></div><div class="ms-arma-num" style="color:#f9c74f88">${dano.toLocaleString()}</div>` : ''}
            ${detalle}
        </div>`;
    }).join('')}${sinId ? `<div class="ms-arma-fila" style="opacity:.5"><div class="ms-arma-nombre">Sin identificar</div><div class="ms-arma-barra-wrap"><div class="ms-arma-barra" style="width:${sinId / max * 100}%"></div></div><div class="ms-arma-num">${sinId}</div></div>` : ''}</div>`;
}

// ─────────────────────────────────────────────────────────────
// Tab RUTAS: ruta de un equipo sobre el mapa (canvas)
// ─────────────────────────────────────────────────────────────
function msFiltrosRutasActualizar() {
    const r = mapstream?.replay;
    if (!r) return;
    const selEq = $('#ms-rutas-equipo');
    if (selEq) selEq.innerHTML = `<option value="">Todos</option>` + r.equipos.map(e => `<option value="${e.id}">${esc(e.nombre)}</option>`).join('');
    const selFase = $('#ms-rutas-fase');
    if (selFase) {
        const fases = (r.zonas || []).filter(z => !z.inicial);
        selFase.innerHTML = `<option value="">Todo</option>` + fases.map((z, i) => `<option value="${i + 1}">Zona ${i + 1}</option>`).join('');
    }
}

function msRutasPintar() {
    const cv = $('#ms-rutas-canvas');
    if (!cv || !mapstream?.replay) return;
    msConFondo(() => _msRutasPintar());
}
function _msRutasPintar() {
    const cv = $('#ms-rutas-canvas');
    if (!cv || !mapstream?.replay) return;
    const r = mapstream.replay;
    const rect = msLienzoRect(cv);
    if (!rect.width || !rect.height) { requestAnimationFrame(_msRutasPintar); return; }
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    cv.width = Math.round(rect.width * dpr);
    cv.height = Math.round(rect.height * dpr);
    cv.style.width = rect.width + 'px';
    cv.style.height = rect.height + 'px';
    const ctx = cv.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const W = rect.width, H = rect.height;

    // Fondo mapa
    const side = Math.min(W, H);
    const OX = (W - side) / 2, OY = (H - side) / 2;
    const k = side / 1000;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#04050a'; ctx.fillRect(0, 0, W, H);
    if (mapstream.fondo) {
        ctx.drawImage(mapstream.fondo, OX, OY, side, side);
        ctx.fillStyle = 'rgba(0,0,0,0.3)';
        ctx.fillRect(OX, OY, side, side);
    } else {
        ctx.fillStyle = '#0c0d12'; ctx.fillRect(OX, OY, side, side);
        ctx.strokeStyle = 'rgba(0,240,255,0.15)'; ctx.lineWidth = 1;
        ctx.strokeRect(OX, OY, side, side);
    }

    const eqIdFiltro = $('#ms-rutas-equipo')?.value ? Number($('#ms-rutas-equipo').value) : null;
    const faseFiltro = $('#ms-rutas-fase')?.value ? Number($('#ms-rutas-fase').value) : null;
    const mostrarBajas = $('#ms-rutas-bajas')?.checked;

    // Rango de tiempo según fase
    let tMin = 0, tMax = r.duracion;
    if (faseFiltro) {
        const fases = (r.zonas || []).filter(z => !z.inicial);
        const fase = fases[faseFiltro - 1];
        if (fase) { tMin = fase.anunciadaEn; tMax = fase.finCierre; }
    }

    const equipos = eqIdFiltro != null ? r.equipos.filter(e => e.id === eqIdFiltro) : r.equipos;

    equipos.forEach(eq => {
        const color = eq.color || '#00f0ff';
        eq.jugadores.forEach(j => {
            const pts = j.pos.filter(p => p[0] >= tMin && p[0] <= tMax);
            if (pts.length < 2) return;
            // Gradiente temporal: inicio opaco → final claro
            ctx.lineWidth = 1.5;
            ctx.lineJoin = 'round';
            ctx.lineCap = 'round';
            const n = pts.length;
            for (let i = 1; i < n; i++) {
                const alpha = 0.3 + 0.7 * (i / n);
                ctx.strokeStyle = color + Math.round(alpha * 255).toString(16).padStart(2, '0');
                ctx.beginPath();
                ctx.moveTo(OX + pts[i - 1][1] * k, OY + pts[i - 1][2] * k);
                ctx.lineTo(OX + pts[i][1] * k, OY + pts[i][2] * k);
                ctx.stroke();
            }
            // Punto inicio
            const p0 = pts[0], pN = pts[n - 1];
            ctx.fillStyle = color;
            ctx.beginPath(); ctx.arc(OX + p0[1] * k, OY + p0[2] * k, 3, 0, Math.PI * 2); ctx.fill();
            // Punto final / muerte
            const murio = j.muerteEn != null && j.muerteEn <= tMax;
            ctx.fillStyle = murio ? '#ff4444' : color;
            ctx.beginPath(); ctx.arc(OX + pN[1] * k, OY + pN[2] * k, murio ? 4 : 3, 0, Math.PI * 2); ctx.fill();
        });
        // Label de equipo en la última posición conocida
        const ultimaPos = (() => {
            const posiciones = eq.jugadores.flatMap(j => j.pos.filter(p => p[0] <= tMax));
            return posiciones.sort((a, b) => b[0] - a[0])[0];
        })();
        if (ultimaPos) {
            ctx.font = `bold ${Math.round(10 * dpr) / dpr}px 'Orbitron', sans-serif`;
            ctx.fillStyle = '#fff';
            ctx.strokeStyle = 'rgba(0,0,0,0.6)';
            ctx.lineWidth = 3;
            const lx = OX + ultimaPos[1] * k + 6, ly = OY + ultimaPos[2] * k - 4;
            ctx.strokeText(eq.nombre.slice(0, 8), lx, ly);
            ctx.fillStyle = color;
            ctx.fillText(eq.nombre.slice(0, 8), lx, ly);
        }
    });

    // Bajas en el rango
    if (mostrarBajas) {
        r.bajas.filter(b => b.x != null && b.t >= tMin && b.t <= tMax && (eqIdFiltro == null || (r.equipos.find(e => e.nombre === b.equipoVictima)?.id === eqIdFiltro))).forEach(b => {
            const px = OX + b.x * k, py = OY + b.y * k;
            ctx.strokeStyle = '#ff4444'; ctx.lineWidth = 1.5;
            ctx.beginPath(); ctx.moveTo(px - 4, py - 4); ctx.lineTo(px + 4, py + 4); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(px + 4, py - 4); ctx.lineTo(px - 4, py + 4); ctx.stroke();
        });
    }
}

// ─────────────────────────────────────────────────────────────
// Tab JUGADOR: movimiento individual
// ─────────────────────────────────────────────────────────────
function msFiltrosIndivActualizar() {
    const r = mapstream?.replay;
    if (!r) return;
    const selEq = $('#ms-indiv-equipo');
    if (selEq) {
        selEq.innerHTML = `<option value="">—</option>` + r.equipos.map(e => `<option value="${e.id}">${esc(e.nombre)}</option>`).join('');
        if (r.equipos[0]) selEq.value = r.equipos[0].id;
    }
    msIndivEquipoCambio();
}

function msIndivEquipoCambio() {
    const r = mapstream?.replay;
    const eqId = Number($('#ms-indiv-equipo')?.value);
    const sel = $('#ms-indiv-jugador');
    if (!sel || !r) return;
    const eq = r.equipos.find(e => e.id === eqId);
    sel.innerHTML = eq ? eq.jugadores.map(j => `<option value="${esc(j.nombre)}">${esc(j.nombre)}</option>`).join('') : '<option>—</option>';
    if (eq && msVistaActual === 'individual') msIndividualPintar();
}

function msIndividualPintar() {
    const cv = $('#ms-indiv-canvas');
    if (!cv || !mapstream?.replay) return;
    msConFondo(() => _msIndividualPintar());
}
function _msIndividualPintar() {
    const cv = $('#ms-indiv-canvas');
    if (!cv || !mapstream?.replay) return;
    const r = mapstream.replay;
    const rect = msLienzoRect(cv);
    if (!rect.width || !rect.height) { requestAnimationFrame(_msIndividualPintar); return; }
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    cv.width = Math.round(rect.width * dpr);
    cv.height = Math.round(rect.height * dpr);
    cv.style.width = rect.width + 'px';
    cv.style.height = rect.height + 'px';
    const ctx = cv.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const W = rect.width, H = rect.height;
    const side = Math.min(W, H);
    const OX = (W - side) / 2, OY = (H - side) / 2;
    const k = side / 1000;

    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#04050a'; ctx.fillRect(0, 0, W, H);
    if (mapstream.fondo) {
        ctx.drawImage(mapstream.fondo, OX, OY, side, side);
        ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(OX, OY, side, side);
    } else {
        ctx.fillStyle = '#0c0d12'; ctx.fillRect(OX, OY, side, side);
        ctx.strokeStyle = 'rgba(0,240,255,0.15)'; ctx.lineWidth = 1;
        ctx.strokeRect(OX, OY, side, side);
    }

    const nombreJug = $('#ms-indiv-jugador')?.value;
    const mostrarBajas = $('#ms-indiv-bajas')?.checked;
    if (!nombreJug) return;

    const eq = r.equipos.find(e => e.jugadores.some(j => j.nombre === nombreJug));
    const j = eq?.jugadores.find(j => j.nombre === nombreJug);
    if (!j || j.pos.length < 2) {
        ctx.fillStyle = '#fff'; ctx.font = '14px Inter, sans-serif';
        ctx.fillText('Sin datos de posición para este jugador.', OX + 20, OY + 40);
        return;
    }

    const color = eq.color || '#00f0ff';
    const pts = j.pos;
    const n = pts.length;
    const tTotal = pts[n - 1][0] - pts[0][0] || 1;

    // Colores del gradiente temporal (cyan → dorado)
    for (let i = 1; i < n; i++) {
        const frac = (pts[i][0] - pts[0][0]) / tTotal;
        // Interpolación cyan→verde→dorado
        const r2 = Math.round(frac < 0.5 ? frac * 2 * 100 : 100 + (frac - 0.5) * 2 * 155);
        const g2 = Math.round(frac < 0.5 ? 200 + frac * 55 : 255 - (frac - 0.5) * 155);
        const b2 = Math.round(frac < 0.5 ? 255 - frac * 2 * 155 : 100 - (frac - 0.5) * 100);
        ctx.strokeStyle = `rgba(${r2},${g2},${b2},0.85)`;
        ctx.lineWidth = 2;
        ctx.lineJoin = 'round'; ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(OX + pts[i - 1][1] * k, OY + pts[i - 1][2] * k);
        ctx.lineTo(OX + pts[i][1] * k, OY + pts[i][2] * k);
        ctx.stroke();
    }

    // Inicio
    ctx.fillStyle = '#00ff88'; ctx.beginPath(); ctx.arc(OX + pts[0][1] * k, OY + pts[0][2] * k, 5, 0, Math.PI * 2); ctx.fill();
    // Final / muerte
    const ultP = pts[n - 1];
    ctx.fillStyle = j.muerteEn != null ? '#ff4444' : '#ffdd55';
    ctx.beginPath(); ctx.arc(OX + ultP[1] * k, OY + ultP[2] * k, 5, 0, Math.PI * 2); ctx.fill();

    // Nombre
    ctx.font = `bold 11px 'Orbitron', sans-serif`;
    ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,0.7)';
    ctx.strokeText(j.nombre, OX + pts[0][1] * k + 7, OY + pts[0][2] * k - 5);
    ctx.fillStyle = '#fff';
    ctx.fillText(j.nombre, OX + pts[0][1] * k + 7, OY + pts[0][2] * k - 5);

    // Marks de kills que hizo
    if (mostrarBajas) {
        r.bajas.filter(b => b.idMatador === j.id && b.x != null).forEach(b => {
            ctx.fillStyle = '#ffcc00'; ctx.strokeStyle = '#000'; ctx.lineWidth = 1;
            const px = OX + b.x * k, py = OY + b.y * k;
            ctx.beginPath(); ctx.arc(px, py, 4, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
            ctx.font = `9px Inter, sans-serif`; ctx.fillStyle = '#fff';
            ctx.fillText(b.arma || '?', px + 5, py - 3);
        });
        // Muerte propia
        if (j.muerteEn != null) {
            const mp = j.pos.filter(p => p[0] <= j.muerteEn + 1).sort((a, b) => b[0] - a[0])[0];
            if (mp) {
                ctx.fillStyle = '#ff4444'; ctx.strokeStyle = '#000'; ctx.lineWidth = 1.5;
                const px = OX + mp[1] * k, py = OY + mp[2] * k;
                ctx.beginPath(); ctx.moveTo(px - 5, py - 5); ctx.lineTo(px + 5, py + 5);
                ctx.moveTo(px + 5, py - 5); ctx.lineTo(px - 5, py + 5); ctx.stroke();
            }
        }
    }

    // Leyenda
    const leyenda = [['#00ff88', 'Inicio'], [j.muerteEn != null ? '#ff4444' : '#ffdd55', j.muerteEn != null ? 'Muerte' : 'Vivo al final']];
    leyenda.forEach(([col, txt], i) => {
        ctx.fillStyle = col; ctx.beginPath(); ctx.arc(OX + 12, OY + H - 30 + i * 16, 4, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#fff'; ctx.font = '10px Inter, sans-serif'; ctx.fillText(txt, OX + 20, OY + H - 26 + i * 16);
    });
}

// ─────────────────────────────────────────────────────────────
// Atajos: espacio reproduce/pausa · ← → mueven 5 s · F sigue al equipo en foco
document.addEventListener('keydown', ev => {
    if (!mapstream || !mapstream.replay || !$('#vista-mapstream').classList.contains('active-view')) return;
    if (ev.target.closest?.('input:not([type="range"]), textarea, select')) return;
    if (ev.key === ' ') { ev.preventDefault(); msPlay(); }
    else if (ev.key === 'ArrowRight') { ev.preventDefault(); msSaltar(5); }
    else if (ev.key === 'ArrowLeft') { ev.preventDefault(); msSaltar(-5); }
});
