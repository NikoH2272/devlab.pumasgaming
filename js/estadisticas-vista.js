// ============================================================
// PUMAS DEV LAB · Estadísticas CSV (interfaz)
// ------------------------------------------------------------
// · Cargar CSV oficiales o generar el CSV desde el replay (.bin + .json).
// · Ver cada partida: posiciones, jugadores, armas, personajes y zonas.
// · Ver el torneo: suma de todas las partidas cargadas.
// Las columnas que un CSV no trae (p. ej. daño en uno generado desde el
// replay) se muestran como "—", nunca como 0 inventado.
// ============================================================

const est = { partidas: [], vista: 'partida', sel: 0, orden: { col: 'kills', desc: true } };

const ESTAD_PUNTOS = { 1: 12, 2: 9, 3: 8, 4: 7, 5: 6, 6: 5, 7: 4, 8: 3, 9: 2, 10: 1 };

function abrirEstadisticas() {
    irA('vista-estadisticas');
    estPintar();
}

// ---------- Carga ----------
async function estArchivos(lista) {
    const archivos = [...(lista || [])];
    if (!archivos.length) return;
    const base = n => n.replace(/\.(bin|json|csv)$/i, '');
    const avisos = [];
    // CSV (oficiales o generados antes)
    for (const f of archivos.filter(x => /\.csv$/i.test(x.name))) {
        try {
            const filas = EstadCSV.leer(await f.text());
            estAgregar(filas, f.name.toLowerCase().includes('generado') ? 'generado' : 'csv', f.name);
        } catch (err) { avisos.push(`${f.name}: ${err.message}`); }
    }
    // Replays: .bin con su .json del mismo nombre
    const jsons = archivos.filter(x => /\.json$/i.test(x.name));
    for (const b of archivos.filter(x => /\.bin$/i.test(x.name))) {
        const j = jsons.find(x => base(x.name) === base(b.name));
        if (!j) { avisos.push(`Falta el .json de ${b.name}.`); continue; }
        try {
            estAviso(`Generando estadísticas de ${b.name}…`);
            await new Promise(r => setTimeout(r, 20));
            const { filas } = EstadCSV.generar(new Uint8Array(await b.arrayBuffer()), await j.text());
            estAgregar(filas.map(f => Object.fromEntries(Object.entries(f).map(([k, v]) => [k, EstadCSV.valorPython(v)]))), 'generado', b.name, filas);
        } catch (err) { avisos.push(`${b.name}: ${err.message}`); }
    }
    estAviso(avisos.join(' · '), avisos.length > 0);
    estPintar();
}

// fuente: 'csv' (oficial) o 'generado' (desde replay); crudas = filas listas para exportar
function estAgregar(filas, fuente, archivo, crudas = null) {
    if (!filas.length) return;
    const id = String(filas[0].match_id || archivo);
    // La misma partida con la misma fuente se reemplaza; oficial y generada pueden convivir para compararlas
    est.partidas = est.partidas.filter(p => !(p.id === id && p.fuente === fuente));
    const mapaId = filas[0].map_id;
    est.partidas.push({
        id, fuente, archivo, filas, crudas,
        mapa: (typeof FFReplay !== 'undefined' && FFReplay.MAPAS[mapaId]?.mapa) || `Mapa ${mapaId ?? '?'}`,
        fecha: filas[0].create_time ? new Date(Number(filas[0].create_time) * 1000).toLocaleString('es') : ''
    });
    est.sel = est.partidas.length - 1;
}

function estQuitar(i) {
    est.partidas.splice(i, 1);
    est.sel = Math.max(0, Math.min(est.sel, est.partidas.length - 1));
    estPintar();
}

function estDescargar(i) {
    const p = est.partidas[i];
    const filas = p.crudas || p.filas.map(f => Object.fromEntries(EstadCSV.COLUMNAS.map(c => [c, estPy(f[c])])));
    const blob = new Blob([EstadCSV.aCSV(filas)], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${p.id.replace(/^id/, '')}${p.fuente === 'generado' ? '-generado' : ''}.csv`;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
}

// Valor ya interpretado → texto como en el CSV oficial
function estPy(v) {
    if (v === null || v === undefined) return '';
    if (v === true) return 'True';
    if (v === false) return 'False';
    if (typeof v === 'object') return JSON.stringify(v).replace(/"/g, "'").replace(/\btrue\b/g, 'True').replace(/\bfalse\b/g, 'False').replace(/\bnull\b/g, 'None');
    return String(v);
}

function estAviso(txt, error = false) {
    const el = $('#est-aviso');
    el.textContent = txt;
    el.hidden = !txt;
    el.classList.toggle('nota-alerta', error);
}

// ---------- Utilidades ----------
const estN = v => (v === null || v === undefined || v === '' || Number.isNaN(Number(v))) ? null : Number(v);
const estFmt = (v, d = 0) => v === null || v === undefined ? '—' : Number(v).toLocaleString('es', { maximumFractionDigits: d, minimumFractionDigits: d });
const estReloj = s => s == null ? '—' : `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;
const estSum = (filas, c) => {
    const vals = filas.map(f => estN(f[c])).filter(v => v !== null);
    return vals.length ? vals.reduce((a, b) => a + b, 0) : null;
};

function estBarras(filas, color = 'var(--primary)') {
    const max = Math.max(1, ...filas.map(f => f[1]));
    return `<div class="barras">${filas.map(([n, v, txt]) => `
        <div class="barra-fila"><span class="barra-etq">${esc(n)}</span>
        <span class="barra-pista"><span class="barra" style="width:${Math.max(0.5, v / max * 100)}%;background:${color}"></span></span>
        <span class="barra-val">${txt ?? estFmt(v)}</span></div>`).join('')}</div>`;
}

// Equipos de una partida con su posición (por puntos de posición y luego por quién duró más)
function estEquipos(filas) {
    const porEquipo = new Map();
    filas.forEach(f => {
        const k = f.team_name || `Equipo ${f.team_id}`;
        if (!porEquipo.has(k)) porEquipo.set(k, []);
        porEquipo.get(k).push(f);
    });
    const lista = [...porEquipo].map(([nombre, jug]) => {
        const kills = estSum(jug, 'kills') ?? 0;
        const rank = estN(jug[0].ranking_score) ?? 0;
        return {
            nombre, jug, kills, rank, total: rank + kills,
            booyah: jug.some(j => j.booyah === true || j.booyah === 'True'),
            vida: Math.max(...jug.map(j => estN(j.survival_time) ?? 0)),
            dano: estSum(jug, 'damage'), elimPor: jug[0].eliminated_team_name || ''
        };
    });
    lista.sort((a, c) => c.booyah - a.booyah || c.rank - a.rank || c.vida - a.vida);
    lista.forEach((e, i) => { e.pos = i + 1; });
    return lista;
}

// ---------- Pintado ----------
function estPintar() {
    const hay = est.partidas.length > 0;
    $('#est-vacio').hidden = hay;
    $('#est-contenido').hidden = !hay;
    $$('#est-pestanas button').forEach(b => b.classList.toggle('activo', b.dataset.v === est.vista));
    if (!hay) return;
    $('#est-partidas').innerHTML = est.partidas.map((p, i) => `
        <div class="est-chip ${i === est.sel && est.vista === 'partida' ? 'activo' : ''}">
            <button type="button" class="est-chip-n" onclick="est.sel=${i}; est.vista='partida'; estPintar()">
                <strong>${esc(p.mapa)}</strong><small>${esc(p.fecha || p.id)} · ${p.fuente === 'generado' ? 'desde replay' : 'CSV oficial'}</small>
            </button>
            <button type="button" class="ms-btn" title="Descargar CSV" onclick="estDescargar(${i})"><i class="fa-solid fa-download"></i></button>
            <button type="button" class="ms-btn" title="Quitar" onclick="estQuitar(${i})"><i class="fa-solid fa-xmark"></i></button>
        </div>`).join('');
    $('#est-cuerpo').innerHTML = est.vista === 'torneo' ? estTorneo() : estPartida(est.partidas[est.sel]);
    if (est.vista === 'partida') estDibujarZonas(est.partidas[est.sel]);
}

function estOrdenar(col) {
    est.orden = { col, desc: est.orden.col === col ? !est.orden.desc : true };
    estPintar();
}

function estTablaJugadores(filas, columnas) {
    const { col, desc } = est.orden;
    const val = f => typeof columnas.find(c => c[0] === col)?.[2] === 'function' ? columnas.find(c => c[0] === col)[2](f) : estN(f[col]);
    const orden = [...filas].sort((a, c) => ((val(c) ?? -Infinity) - (val(a) ?? -Infinity)) * (desc ? 1 : -1));
    return `<div class="tabla-scroll"><table class="tabla-informe est-tabla"><thead><tr>
        ${columnas.map(([k, n]) => `<th class="${k === col ? 'ord' : ''}" onclick="estOrdenar('${k}')">${esc(n)}${k === col ? (desc ? ' ▾' : ' ▴') : ''}</th>`).join('')}
        </tr></thead><tbody>${orden.map(f => `<tr>${columnas.map(([k, , fn, fmt]) => {
            const v = typeof fn === 'function' ? fn(f) : f[k];
            return `<td>${fmt ? fmt(v, f) : (typeof v === 'number' || /^-?\d+(\.\d+)?$/.test(String(v ?? '')) ? estFmt(estN(v), 0) : esc(v ?? '—'))}</td>`;
        }).join('')}</tr>`).join('')}</tbody></table></div>`;
}

function estPartida(p) {
    if (!p) return '';
    const filas = p.filas;
    const equipos = estEquipos(filas);
    const kills = estSum(filas, 'kills') ?? 0;
    const mvp = [...filas].sort((a, c) => (estN(c.kills) ?? 0) - (estN(a.kills) ?? 0) || (estN(c.damage) ?? 0) - (estN(a.damage) ?? 0))[0];
    const conDano = filas.some(f => estN(f.damage) !== null);

    const armasOrden = estArmas(filas);
    // Personajes (habilidad activa) y mascotas
    const cuenta = (lista) => { const m = new Map(); lista.filter(Boolean).forEach(x => m.set(x, (m.get(x) || 0) + 1)); return [...m].sort((a, c) => c[1] - a[1]); };
    const personajes = cuenta(filas.flatMap(f => (f.skill_info || []).map(s => s.skill_name)));
    const mascotas = cuenta(filas.map(f => f.pet_skill_name));

    // Arma más usada: la columna propia del CSV generado o, en el oficial, la de más impactos
    const armaTop = f => f.arma_mas_usada || ((f.weapon_usages || []).filter(w => !/SUM$/i.test(w.weapon_name || '') && w.hits).sort((a, c) => c.hits - a.hits)[0]?.weapon_name) || null;
    const columnas = [
        ['nickname', 'Jugador', null, (v, f) => `<strong>${esc(v)}</strong><br><small>${esc(f.team_name || '')}</small>`],
        ['kills', 'Bajas'], ['knock_down', 'Derribos'], ['assists', 'Asist.'],
        ['damage', 'Daño'], ['damage_taken', 'Daño recibido'],
        ['balance', 'Balance', f => { const d = estN(f.damage), r = estN(f.damage_taken); return d === null || r === null ? null : d - r; },
            v => v == null ? '—' : `<span class="${v >= 0 ? 'est-pos' : 'est-neg'}">${v > 0 ? '+' : ''}${estFmt(v)}</span>`],
        ['hits', 'Impactos'],
        ['precision', 'Precisión', f => { const s = estN(f.shoots), h = estN(f.hits); return s ? h / s : null; }, v => v == null ? '—' : `${Math.round(v * 100)}%`],
        ['headshots', 'HS'],
        ['pct_hs', '% cabeza', f => { const h = estN(f.hits), c = estN(f.headshots); return h ? c / h : null; }, v => v == null ? '—' : `${Math.round(v * 100)}%`],
        ['arma', 'Arma más usada', armaTop, v => esc(v || '—')],
        ['be_knocked_down_count', 'Derribado'], ['revived_times', 'Revivido'], ['rescue_times', 'Rescates'], ['icewall_use', 'Gloo'],
        ['survival_time', 'Vivo', null, v => estReloj(estN(v))],
        ['tiempo_en_movimiento', 'En movimiento', null, v => estReloj(estN(v))],
        ['distancia', 'Distancia (m)', f => estN(f.distancia_estimada) ?? ((estN(f.moving_distance) ?? 0) + (estN(f.vehicle_move_distance) ?? 0) || null)]
    ];

    return `
    <div class="kpi-grid est-kpis">
        <div class="kpi"><div class="kpi-valor">${kills}</div><div class="kpi-etiqueta">Bajas en la sala</div></div>
        <div class="kpi"><div class="kpi-valor">${equipos.length}</div><div class="kpi-etiqueta">Equipos · ${filas.length} jugadores</div></div>
        <div class="kpi"><div class="kpi-valor est-txt">${esc(equipos[0]?.nombre || '—')}</div><div class="kpi-etiqueta">Booyah</div></div>
        <div class="kpi"><div class="kpi-valor est-txt">${esc(mvp?.nickname || '—')}</div><div class="kpi-etiqueta">Más bajas (${estFmt(estN(mvp?.kills))})</div></div>
    </div>
    ${p.fuente === 'generado' ? '<p class="nota">Generado desde el replay. Daño, daño recibido, headshots, derribos, gloo y arma más usada salen del replay (validados contra 20 partidas oficiales: daño y daño recibido dentro de ±10 % en el 99,9 % de los jugadores). Los disparos totales no vienen en el replay, por eso la precisión (impactos ÷ disparos) solo aparece con el CSV oficial; "% cabeza" sí se calcula. Tiempo en movimiento y distancia son estimaciones propias.</p>' : ''}

    <section class="inf-seccion"><h4>Tabla de la partida</h4>
    <div class="tabla-scroll"><table class="tabla-informe"><thead><tr><th>Pos.</th><th>Equipo</th><th>Bajas</th><th>Pts posición</th><th>Total</th>${conDano ? '<th>Daño</th>' : ''}<th>Eliminado por</th></tr></thead><tbody>
    ${equipos.map(e => `<tr class="${e.booyah ? 'est-oro' : ''}"><td>${e.booyah ? '🏆 ' : ''}${e.pos}</td><td><strong>${esc(e.nombre)}</strong><br><small>${e.jug.map(j => esc(j.nickname)).join(' · ')}</small></td>
        <td>${e.kills}</td><td>${e.rank}</td><td><strong>${e.total}</strong></td>${conDano ? `<td>${estFmt(e.dano)}</td>` : ''}<td>${esc(e.elimPor || (e.booyah ? '—' : ''))}</td></tr>`).join('')}
    </tbody></table></div></section>

    <section class="inf-seccion"><h4>Jugadores <small>· toca una columna para ordenar</small></h4>${estTablaJugadores(filas, columnas)}</section>

    <div class="dos-col">
        <section class="inf-seccion"><h4>Armas usadas</h4>${estTablaArmas(armasOrden)}</section>
        <section class="inf-seccion"><h4>Zonas de la partida</h4>
            <canvas id="est-zonas" width="600" height="600" class="est-mapa" aria-label="Zonas seguras"></canvas>
        </section>
    </div>

    <section class="inf-seccion"><h4>Armas por jugador</h4>${estArmasPorJugador(filas)}</section>

    ${personajes.length || mascotas.length ? `<div class="dos-col">
        <section class="inf-seccion"><h4>Personajes (habilidad activa)</h4>${personajes.length ? estBarras(personajes.slice(0, 12).map(([n, v]) => [n, v, `${v} jugador(es)`]), '#a78bfa') : '<p class="vacio">—</p>'}</section>
        <section class="inf-seccion"><h4>Mascotas</h4>${mascotas.length ? estBarras(mascotas.slice(0, 12).map(([n, v]) => [n, v, `${v} jugador(es)`]), '#4ade80') : '<p class="vacio">—</p>'}</section>
    </div>` : ''}`;
}

// ---------- Armas ----------
function estUsos(f) {
    if (Array.isArray(f.weapon_usages) && f.weapon_usages.length) return f.weapon_usages.filter(w => !/SUM$/i.test(w.weapon_name || ''));
    // CSV sin weapon_usages: solo las bajas por arma de kill_info
    const m = new Map();
    (f.kill_info || []).forEach(k => {
        const n = (typeof FFReplay !== 'undefined' && FFReplay.nombreArma(k.weapon_used_id)) || 'Sin identificar';
        const a = m.get(n) || { weapon_name: n, kills: 0, damage: null, hits: null, headshots: null, shoots: null };
        a.kills++; m.set(n, a);
    });
    return [...m.values()];
}

function estArmas(filas) {
    const m = new Map();
    filas.forEach(f => estUsos(f).forEach(w => {
        const a = m.get(w.weapon_name) || { nombre: w.weapon_name, jugadores: 0, kills: 0, dano: null, hits: null, hs: null, shoots: null };
        a.jugadores++; a.kills += w.kills || 0;
        if (w.damage != null) a.dano = (a.dano ?? 0) + w.damage;
        if (w.hits != null) a.hits = (a.hits ?? 0) + w.hits;
        if (w.headshots != null) a.hs = (a.hs ?? 0) + w.headshots;
        if (w.shoots != null) a.shoots = (a.shoots ?? 0) + w.shoots;
        m.set(w.weapon_name, a);
    }));
    return [...m.values()].filter(a => a.kills || a.dano || a.hits).sort((a, c) => c.kills - a.kills || (c.dano ?? 0) - (a.dano ?? 0));
}

function estTablaArmas(armas) {
    if (!armas.length) return '<p class="vacio">Sin datos de armas.</p>';
    const p = v => v == null ? '—' : `${Math.round(v * 100)}%`;
    return `<div class="tabla-scroll"><table class="tabla-informe"><thead><tr><th>Arma</th><th>Jugadores</th><th>Bajas</th><th>Daño</th><th>Impactos</th><th>HS</th><th>% cabeza</th><th>Precisión</th></tr></thead><tbody>
    ${armas.map(a => `<tr><td><strong>${esc(a.nombre)}</strong></td><td>${a.jugadores}</td><td>${a.kills}</td><td>${estFmt(a.dano)}</td><td>${estFmt(a.hits)}</td><td>${estFmt(a.hs)}</td>
        <td>${p(a.hits ? (a.hs ?? 0) / a.hits : null)}</td><td>${p(a.shoots ? a.hits / a.shoots : null)}</td></tr>`).join('')}
    </tbody></table></div>`;
}

function estArmasPorJugador(filas) {
    const orden = [...filas].sort((a, c) => (estN(c.damage) ?? estN(c.kills) ?? 0) - (estN(a.damage) ?? estN(a.kills) ?? 0));
    return `<div class="tabla-scroll"><table class="tabla-informe"><thead><tr><th>Jugador</th><th>Arma</th><th>Bajas</th><th>Daño</th><th>Impactos</th><th>HS</th><th>Precisión</th></tr></thead><tbody>
    ${orden.flatMap(f => estUsos(f).filter(w => w.kills || w.damage || w.hits).sort((a, c) => (c.damage ?? 0) - (a.damage ?? 0) || c.kills - a.kills).map((w, k) => `<tr>
        <td>${k === 0 ? `<strong>${esc(f.nickname)}</strong><br><small>${esc(f.team_name || '')}</small>` : ''}</td><td>${esc(w.weapon_name)}</td><td>${w.kills ?? 0}</td>
        <td>${estFmt(estN(w.damage))}</td><td>${estFmt(estN(w.hits))}</td><td>${estFmt(estN(w.headshots))}</td><td>${w.shoots ? Math.round(w.hits / w.shoots * 100) + '%' : '—'}</td></tr>`)).join('')}
    </tbody></table></div>`;
}

// Círculos de zona (match_stats_extra.circle_info) sobre la imagen del mapa
async function estDibujarZonas(p) {
    const cv = document.getElementById('est-zonas');
    if (!cv || !p) return;
    const x = cv.getContext('2d');
    const cal = typeof FFReplay !== 'undefined' ? FFReplay.MAPAS[p.filas[0].map_id] : null;
    const circulos = p.filas[0].match_stats_extra?.circle_info || [];
    x.fillStyle = '#05060a'; x.fillRect(0, 0, 600, 600);
    if (!cal) { x.fillStyle = '#8a8d9b'; x.font = '14px Rajdhani'; x.fillText('Mapa sin calibrar', 20, 30); return; }
    const src = MapStream.imagenMapa(cal.mapa);
    if (src) {
        const im = await new Promise(r => { const i = new Image(); i.onload = () => r(i); i.onerror = () => r(null); i.src = src; });
        if (im && document.getElementById('est-zonas') === cv) { x.drawImage(im, 0, 0, 600, 600); x.fillStyle = 'rgba(4,5,10,.35)'; x.fillRect(0, 0, 600, 600); }
    }
    const k = 600 / cal.lado;
    circulos.filter(c => c.radius > 0).forEach((c, i) => {
        const u = (c.x_coordinate - cal.x0) * k, v = (cal.z0 + cal.lado - c.y_coordinate) * k;
        x.strokeStyle = 'rgba(255,255,255,.9)'; x.lineWidth = 2;
        x.beginPath(); x.arc(u, v, c.radius * k, 0, Math.PI * 2); x.stroke();
        const ny = Math.max(12, v - c.radius * k);
        x.fillStyle = '#05060a'; x.beginPath(); x.arc(u, ny, 10, 0, Math.PI * 2); x.fill();
        x.strokeStyle = '#00f0ff'; x.stroke();
        x.fillStyle = '#fff'; x.font = '700 11px Orbitron, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
        x.fillText(String(i + 1), u, ny + 1);
    });
}

// ---------- Torneo: suma de todas las partidas ----------
function estTorneo() {
    const equipos = new Map(), jugadores = new Map();
    // Cada partida cuenta una vez: si está oficial y generada, vale la oficial
    const unicas = [...new Map([...est.partidas].sort((a, c) => (a.fuente === 'csv') - (c.fuente === 'csv')).map(p => [p.id, p])).values()];
    unicas.forEach(p => {
        estEquipos(p.filas).forEach(e => {
            const t = equipos.get(e.nombre) || { nombre: e.nombre, partidas: 0, booyahs: 0, rank: 0, kills: 0, posiciones: [] };
            t.partidas++; t.booyahs += e.booyah ? 1 : 0; t.rank += e.rank; t.kills += e.kills; t.posiciones.push(e.pos);
            equipos.set(e.nombre, t);
        });
        p.filas.forEach(f => {
            const k = String(f.account_id || f.nickname);
            const j = jugadores.get(k) || { nickname: f.nickname, team_name: f.team_name, partidas: 0, kills: 0, damage: null, knock_down: null, assists: null, vivo: 0 };
            j.partidas++; j.kills += estN(f.kills) ?? 0; j.vivo += estN(f.survival_time) ?? 0; j.nickname = f.nickname; j.team_name = f.team_name;
            ['damage', 'knock_down', 'assists'].forEach(c => { if (estN(f[c]) !== null) j[c] = (j[c] ?? 0) + estN(f[c]); });
            jugadores.set(k, j);
        });
    });
    const tabla = [...equipos.values()].map(t => ({ ...t, total: t.rank + t.kills, media: t.posiciones.reduce((a, b) => a + b, 0) / t.posiciones.length }))
        .sort((a, c) => c.total - a.total || c.booyahs - a.booyahs);
    const lista = [...jugadores.values()].map(j => ({ ...j, kpp: j.kills / j.partidas, dpp: j.damage === null ? null : j.damage / j.partidas }));
    const columnas = [
        ['nickname', 'Jugador', null, (v, f) => `<strong>${esc(v)}</strong><br><small>${esc(f.team_name || '')}</small>`],
        ['partidas', 'Partidas'], ['kills', 'Bajas'], ['kpp', 'Bajas/partida', f => f.kpp, v => estFmt(v, 2)],
        ['damage', 'Daño'], ['dpp', 'Daño/partida', f => f.dpp, v => estFmt(v, 0)],
        ['knock_down', 'Derribos'], ['assists', 'Asist.'], ['vivo', 'Tiempo vivo', f => f.vivo, v => estReloj(v)]
    ];
    return `
    <div class="kpi-grid est-kpis">
        <div class="kpi"><div class="kpi-valor">${unicas.length}</div><div class="kpi-etiqueta">Partidas distintas</div></div>
        <div class="kpi"><div class="kpi-valor est-txt">${esc(tabla[0]?.nombre || '—')}</div><div class="kpi-etiqueta">Líder (${tabla[0]?.total ?? 0} pts)</div></div>
        <div class="kpi"><div class="kpi-valor">${tabla.reduce((a, t) => a + t.kills, 0)}</div><div class="kpi-etiqueta">Bajas totales</div></div>
        <div class="kpi"><div class="kpi-valor est-txt">${esc([...lista].sort((a, c) => c.kills - a.kills)[0]?.nickname || '—')}</div><div class="kpi-etiqueta">Más bajas del torneo</div></div>
    </div>
    <section class="inf-seccion"><h4>Tabla general</h4>
    <div class="tabla-scroll"><table class="tabla-informe"><thead><tr><th>#</th><th>Equipo</th><th>Partidas</th><th>Booyahs</th><th>Pts posición</th><th>Bajas</th><th>Total</th><th>Posición media</th></tr></thead><tbody>
    ${tabla.map((t, i) => `<tr class="${i === 0 ? 'est-oro' : ''}"><td>${i + 1}</td><td><strong>${esc(t.nombre)}</strong></td><td>${t.partidas}</td><td>${t.booyahs || '—'}</td><td>${t.rank}</td><td>${t.kills}</td><td><strong>${t.total}</strong></td><td>${estFmt(t.media, 1)}</td></tr>`).join('')}
    </tbody></table></div></section>
    <section class="inf-seccion"><h4>Jugadores del torneo</h4>${estTablaJugadores(lista, columnas)}</section>
    <section class="inf-seccion"><h4>Armas del torneo</h4>${estTablaArmas(estArmas(unicas.flatMap(p => p.filas)))}</section>
    <section class="inf-seccion"><h4>Puntos por equipo</h4>${estBarras(tabla.slice(0, 16).map(t => [t.nombre, t.total, `${t.total} pts · ${t.kills} bajas`]))}</section>`;
}

// Arrastrar y soltar
document.addEventListener('DOMContentLoaded', () => {
    const zona = $('#est-drop');
    if (!zona) return;
    ['dragenter', 'dragover'].forEach(t => zona.addEventListener(t, ev => { ev.preventDefault(); zona.classList.add('encima'); }));
    ['dragleave', 'drop'].forEach(t => zona.addEventListener(t, ev => { ev.preventDefault(); zona.classList.remove('encima'); }));
    zona.addEventListener('drop', ev => estArchivos(ev.dataTransfer.files));
});
