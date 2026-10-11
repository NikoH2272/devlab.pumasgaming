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
    if (visor) { mapstream.medir(); requestAnimationFrame(() => mapstream.medir()); }
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
    msAviso('');
    msMostrar(true);
    msAlCambiarTiempo(mapstream.tiempo, true);
    msPintarBotonPlay();
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
        return `
        <div class="ms-eq ${vivo ? '' : 'fuera'} ${foco ? 'foco' : ''}" style="--c:${e.color}">
            <span class="ms-eq-n">${i + 1}</span>
            <label class="ms-eq-info">
                <input type="checkbox" ${oculto ? '' : 'checked'} onchange="msMostrarEquipo('${e.id}', this.checked)" aria-label="Mostrar ${esc(e.nombre)}">
                <span><strong>${esc(e.nombre)}</strong>
                <small>${bajas[e.id]} bajas${!vivo && e.eliminadoEn != null ? ` · fuera ${relojMs(e.eliminadoEn)}` : ''}${e.jugadores.every(j => !j.pos.length) ? ' · sin posición' : ''}</small></span>
            </label>
            <span class="ms-vidas">${e.jugadores.map(j => `<i class="${mapstream.vivo(e, j, t) ? '' : 'muerto'} ${j.pos.length ? '' : 'sinpos'}" title="${esc(j.nombre)}${j.pos.length ? '' : ' · sin posición en el replay'}"></i>`).join('')}</span>
            <button type="button" class="ms-btn ${foco ? 'activo' : ''}" title="${foco ? 'Quitar foco' : 'Resaltar equipo'}" onclick="msFoco('${e.id}')"><i class="fa-solid fa-star"></i></button>
            <button type="button" class="ms-btn ${sigue ? 'activo' : ''}" title="${sigue ? 'Dejar de seguir' : 'Seguir con la cámara'}" onclick="msSeguir('${e.id}')"><i class="fa-solid fa-video"></i></button>
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
const MS_CAPAS = [['estelas', 'Estelas'], ['nombres', 'Nombres'], ['bajas', 'Bajas en el mapa'], ['zona', 'Zona'], ['fasesPrevias', 'Fases de zona ya cerradas'], ['avion', 'Avión']];

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

// Atajos: espacio reproduce/pausa · ← → mueven 5 s · F sigue al equipo en foco
document.addEventListener('keydown', ev => {
    if (!mapstream || !mapstream.replay || !$('#vista-mapstream').classList.contains('active-view')) return;
    if (ev.target.closest?.('input:not([type="range"]), textarea, select')) return;
    if (ev.key === ' ') { ev.preventDefault(); msPlay(); }
    else if (ev.key === 'ArrowRight') { ev.preventDefault(); msSaltar(5); }
    else if (ev.key === 'ArrowLeft') { ev.preventDefault(); msSaltar(-5); }
});
