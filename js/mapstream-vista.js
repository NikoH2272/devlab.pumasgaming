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
    const modos = { replay: '#ms-modo-replay', 'calor-movimiento': '#ms-modo-calor', 'calor-peleas': '#ms-modo-calor', zona: '#ms-modo-zona', stats: '#ms-modo-stats' };
    Object.values([...new Set(Object.values(modos))]).forEach(sel => { const el = $(sel); if (el) el.hidden = true; });
    const activo = modos[modo];
    if (activo) { const el = $(activo); if (el) el.hidden = false; }
    $$('.ms-tab').forEach(b => b.classList.toggle('activo', b.dataset.vista === modo));
    const blq = $('#ms-bloque-analisis');
    if (blq) blq.hidden = modo === 'replay' || modo === 'stats';
    const tit = $('#ms-analisis-titulo');
    if (tit) tit.textContent = modo === 'calor-movimiento' ? '— Movimiento' : modo === 'calor-peleas' ? '— Peleas' : '';
    if (modo === 'calor-movimiento') msCalorRenderizar('movimiento');
    else if (modo === 'calor-peleas') msCalorRenderizar('peleas');
    else if (modo === 'zona') msZonaPintar();
    else if (modo === 'stats') msEstadisticasPintar();
    if (modo === 'replay' && mapstream) mapstream.medir();
}

function msCalorRenderizar(tipo) {
    if (typeof MSCalor === 'undefined') return;
    const cv = $('#ms-calor');
    if (!cv || !mapstream || !mapstream.replay) return;
    const rect = cv.parentElement.getBoundingClientRect();
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

// Atajos: espacio reproduce/pausa · ← → mueven 5 s · F sigue al equipo en foco
document.addEventListener('keydown', ev => {
    if (!mapstream || !mapstream.replay || !$('#vista-mapstream').classList.contains('active-view')) return;
    if (ev.target.closest?.('input:not([type="range"]), textarea, select')) return;
    if (ev.key === ' ') { ev.preventDefault(); msPlay(); }
    else if (ev.key === 'ArrowRight') { ev.preventDefault(); msSaltar(5); }
    else if (ev.key === 'ArrowLeft') { ev.preventDefault(); msSaltar(-5); }
});
