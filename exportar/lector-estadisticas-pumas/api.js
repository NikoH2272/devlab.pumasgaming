// ============================================================
// LECTOR DE ESTADÍSTICAS · PUMAS GAMING (API pública)
// ------------------------------------------------------------
// Va al final del paquete, después de FFReplay (lector del .bin) y
// EstadCSV (generador/lector del CSV). Convierte todo a objetos en
// español, listos para pintar la página de resultados.
//
//   const r = await LectorPumas.leerArchivos(input.files);
//   r.partidas[0].equipos   → tabla de la partida
//   r.partidas[0].jugadores → estadísticas por jugador
//   LectorPumas.tablaTorneo(r.partidas) → acumulado de varias partidas
// ============================================================

const LectorPumas = (() => {
    const VERSION = '1.0.0';

    // Puntos por posición (cámbialos si el portal usa otra tabla)
    const puntos = { 1: 12, 2: 9, 3: 8, 4: 7, 5: 6, 6: 5, 7: 4, 8: 3, 9: 2, 10: 1 };

    const n = v => (v === null || v === undefined || v === '' || Number.isNaN(Number(v))) ? null : Number(v);
    const MAPAS_ID = { 1: 'Bermuda', 3: 'Purgatorio', 4: 'Kalahari', 22: 'Nexterra', 29: 'Solara' };

    // Fila del CSV (oficial o generada) → jugador en español
    function jugador(f) {
        const usos = Array.isArray(f.weapon_usages) ? f.weapon_usages.filter(w => !/SUM$/i.test(w.weapon_name || '')) : [];
        const masUsada = f.arma_mas_usada || ([...usos].filter(w => w.hits).sort((a, c) => c.hits - a.hits)[0]?.weapon_name) || null;
        const dano = n(f.damage), recibido = n(f.damage_taken), impactos = n(f.hits), disparos = n(f.shoots), cabeza = n(f.headshots);
        return {
            jugador: f.nickname, cuenta: f.account_id != null ? String(f.account_id) : null,
            equipo: f.team_name || null, equipoId: n(f.team_id),
            bajas: n(f.kills) ?? 0, derribos: n(f.knock_down), asistencias: n(f.assists),
            dano, danoRecibido: recibido, balance: dano !== null && recibido !== null ? dano - recibido : null,
            impactos, disparos, precision: disparos ? impactos / disparos : null,
            headshots: cabeza, pctCabeza: impactos ? (cabeza ?? 0) / impactos : null,
            armaMasUsada: masUsada,
            armas: usos.map(w => ({ id: w.weapon_id, nombre: w.weapon_name, bajas: w.kills ?? 0, dano: w.damage ?? 0, impactos: w.hits ?? 0, headshots: w.headshots ?? 0, disparos: w.shoots ?? null }))
                .sort((a, c) => c.dano - a.dano),
            derribado: n(f.be_knocked_down_count), revivido: n(f.revived_times), rescates: n(f.rescue_times), gloo: n(f.icewall_use),
            tiempoVivo: n(f.survival_time), tiempoMovimiento: n(f.tiempo_en_movimiento),
            distancia: n(f.distancia_estimada) ?? ((n(f.moving_distance) ?? 0) + (n(f.vehicle_move_distance) ?? 0) || null),
            booyah: f.booyah === true || f.booyah === 'True',
            eliminadoPor: f.eliminated_team_name || null,
            personaje: (f.skill_info || [])[0]?.skill_name || null, mascota: f.pet_skill_name || null
        };
    }

    // Filas de una partida → { id, mapa, fecha, equipos, jugadores }
    function partida(filas, fuente) {
        const jugadores = filas.map(jugador);
        const porEquipo = new Map();
        jugadores.forEach(j => {
            const k = j.equipo || `Equipo ${j.equipoId}`;
            if (!porEquipo.has(k)) porEquipo.set(k, []);
            porEquipo.get(k).push(j);
        });
        const equipos = [...porEquipo].map(([nombre, js]) => ({
            equipo: nombre,
            jugadores: js.map(j => j.jugador),
            bajas: js.reduce((s, j) => s + j.bajas, 0),
            dano: js.some(j => j.dano !== null) ? js.reduce((s, j) => s + (j.dano ?? 0), 0) : null,
            booyah: js.some(j => j.booyah),
            vida: Math.max(...js.map(j => j.tiempoVivo ?? 0)),
            eliminadoPor: js[0].eliminadoPor
        })).sort((a, c) => c.booyah - a.booyah || c.vida - a.vida);
        equipos.forEach((e, i) => {
            e.posicion = i + 1;
            e.puntosPosicion = puntos[i + 1] || 0;
            e.total = e.puntosPosicion + e.bajas;
            delete e.vida;
        });
        const f0 = filas[0] || {};
        return {
            armas: sumarArmas(jugadores),
            id: String(f0.match_id || '').replace(/^id/, ''),
            mapa: MAPAS_ID[f0.map_id] || `Mapa ${f0.map_id ?? '?'}`,
            fecha: f0.create_time ? new Date(Number(f0.create_time) * 1000).toISOString() : null,
            fuente,                       // 'csv' = oficial · 'replay' = generado desde .bin + .json
            equipos, jugadores,
            zonas: f0.match_stats_extra?.circle_info || [],
            filas                         // filas originales (para exportar el CSV)
        };
    }

    // Estadísticas por arma sumando a los jugadores
    function sumarArmas(jugadores) {
        const m = new Map();
        jugadores.forEach(j => j.armas.forEach(a => {
            const t = m.get(a.nombre) || { nombre: a.nombre, id: a.id, jugadores: 0, bajas: 0, dano: 0, impactos: 0, headshots: 0, disparos: null };
            t.jugadores++; t.bajas += a.bajas; t.dano += a.dano; t.impactos += a.impactos; t.headshots += a.headshots || 0;
            if (a.disparos !== null) t.disparos = (t.disparos ?? 0) + a.disparos;
            m.set(a.nombre, t);
        }));
        // Solo armas que hicieron algo (las recogidas y nunca usadas no cuentan)
        return [...m.values()].filter(a => a.bajas || a.dano || a.impactos).map(a => ({ ...a, precision: a.disparos ? a.impactos / a.disparos : null }))
            .sort((a, c) => c.bajas - a.bajas || c.dano - a.dano);
    }

    // ---------- Entradas ----------
    function desdeCSV(texto) {
        return partida(EstadCSV.leer(texto), 'csv');
    }

    function desdeReplay(bin, jsonTexto) {
        const { filas } = EstadCSV.generar(bin instanceof Uint8Array ? bin : new Uint8Array(bin), jsonTexto);
        const p = partida(filas.map(f => Object.fromEntries(Object.entries(f).map(([k, v]) => [k, EstadCSV.valorPython(v)]))), 'replay');
        p.csvGenerado = EstadCSV.aCSV(filas);
        return p;
    }

    // Lista de File (input o arrastrar): CSV sueltos y pares .bin + .json del mismo nombre
    async function leerArchivos(lista) {
        const archivos = [...(lista || [])];
        const base = s => s.replace(/\.(bin|json|csv)$/i, '');
        const partidas = [], avisos = [];
        for (const f of archivos.filter(x => /\.csv$/i.test(x.name))) {
            try { partidas.push(desdeCSV(await f.text())); } catch (e) { avisos.push(`${f.name}: ${e.message}`); }
        }
        const jsons = archivos.filter(x => /\.json$/i.test(x.name));
        for (const b of archivos.filter(x => /\.bin$/i.test(x.name))) {
            const j = jsons.find(x => base(x.name) === base(b.name));
            if (!j) { avisos.push(`Falta el .json de ${b.name}`); continue; }
            try { partidas.push(desdeReplay(new Uint8Array(await b.arrayBuffer()), await j.text())); }
            catch (e) { avisos.push(`${b.name}: ${e.message}`); }
        }
        return { partidas, avisos };
    }

    // ---------- Torneo: varias partidas ----------
    function tablaTorneo(partidas) {
        // Una partida cuenta una vez; si está oficial y generada, vale la oficial
        const unicas = [...new Map([...partidas].sort((a, c) => (a.fuente === 'csv') - (c.fuente === 'csv')).map(p => [p.id, p])).values()];
        const eq = new Map(), jug = new Map();
        unicas.forEach(p => {
            p.equipos.forEach(e => {
                const t = eq.get(e.equipo) || { equipo: e.equipo, partidas: 0, booyahs: 0, puntosPosicion: 0, bajas: 0, total: 0 };
                t.partidas++; t.booyahs += e.booyah ? 1 : 0; t.puntosPosicion += e.puntosPosicion; t.bajas += e.bajas; t.total += e.total;
                eq.set(e.equipo, t);
            });
            p.jugadores.forEach(j => {
                const k = j.cuenta || j.jugador;
                const t = jug.get(k) || { jugador: j.jugador, equipo: j.equipo, partidas: 0, bajas: 0, dano: null, danoRecibido: null, derribos: null, asistencias: null, headshots: null };
                t.partidas++; t.bajas += j.bajas; t.jugador = j.jugador; t.equipo = j.equipo;
                ['dano', 'danoRecibido', 'derribos', 'asistencias', 'headshots'].forEach(c => { if (j[c] !== null) t[c] = (t[c] ?? 0) + j[c]; });
                jug.set(k, t);
            });
        });
        const equipos = [...eq.values()].sort((a, c) => c.total - a.total || c.booyahs - a.booyahs).map((e, i) => ({ posicion: i + 1, ...e }));
        const jugadores = [...jug.values()].map(j => ({ ...j, bajasPorPartida: j.bajas / j.partidas, danoPorPartida: j.dano === null ? null : j.dano / j.partidas }))
            .sort((a, c) => c.bajas - a.bajas || (c.dano ?? 0) - (a.dano ?? 0));
        return { partidas: unicas.length, equipos, jugadores, armas: sumarArmas(unicas.flatMap(p => p.jugadores)) };
    }

    return { VERSION, puntos, leerArchivos, desdeCSV, desdeReplay, tablaTorneo, aCSV: p => p.csvGenerado || EstadCSV.aCSV(p.filas) };
})();

if (typeof window !== 'undefined') window.LectorPumas = LectorPumas;
if (typeof module !== 'undefined') module.exports = LectorPumas;
