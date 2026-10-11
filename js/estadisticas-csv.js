// ============================================================
// PUMAS DEV LAB · Estadísticas CSV (generador y lector)
// ------------------------------------------------------------
// · generar(): arma, desde el replay del juego (.bin + .json), el CSV
//   de estadísticas por jugador con las mismas 106 columnas y el mismo
//   orden del CSV oficial. Solo llena las columnas que salen del replay
//   con exactitud (validadas contra 96 CSV oficiales); el resto queda
//   vacío: el replay de cliente no trae daño total, disparos ni curación.
// · leer(): interpreta un CSV oficial o generado (incluye los campos con
//   formato de Python: comillas simples, True/False, None).
// Depende de js/mapstream-replay.js (FFReplay). Funciona en Node.
// ============================================================

const EstadCSV = (() => {
    const F = typeof FFReplay !== 'undefined' ? FFReplay : (typeof require !== 'undefined' ? require('./mapstream-replay.js') : null);

    const COLUMNAS = ['match_id', 'game_mode', 'account_id', 'moving_distance', 'create_time', 'skyler_ice_wall_destroy', 'booyah', 'pet_skill_id', 'damage', 'alok_heal_hP', 'icewall_use', 'hits', 'skill_ids', 'kills', 'ranking_score', 'vehicle_kill', 'medkit_use', 'bag_inv', 'vest_inv', 'revive_teammate_times', 'assists', 'weapon_usages', 'final', 'group_mode', 'avatar_id', 'chrono_block_damage', 'helmet_inv', 'revived_times', 'knock_down', 'match_mode', 'rescue_times', 'hp_added', 'icewall_destroyed_times', 'grenade_use', 'headshots', 'headshot_killtimes', 'nickname', 'map_id', 'shoots', 'skill_info', 'survival_time', 'team_name', 'killing_score', 'end_time', 'oil_kill', 'be_killed_time', 'is_win', 'item_nums', 'purchased_items', 'round_index', 'kill_times', 'is_dead', 'pet_skill_name', 'player_state', 'is_in_safe_zone', 'is_in_bomb_zone', 'revive_teammate_nums', 'knock_down_damage_info', 'skill_autoflightbomb_hit_num', 'skill_markicewall_damage', 'skill_resist_exploded_num', 'skill_silence_num', 'kill_distance', 'vehicle_move_distance', 'loadouts', 'skill_clu_scan_nums', 'skill_kenta_reduce_damage', 'skill_dimitri_revived_nums', 'skill_villain_damage', 'skill_villain_recover', 'skill_sonia_fatal_revival_nums', 'weapon_skin_ids', 'enable_emulator_check', 'kill_info', 'coordinate_info', 'hp_info', 'grenade_kill', 'ice_grenade_kill', 'dragon_grenade_kill', 'knockdown_real_damage', 'torso_hits', 'leg_hits', 'clothes_skin', 'nb_skill_usages', 'team_id', 'win_rate', 'kill_count', 'is_focus', 'is_double_kill_score', 'is_eliminated', 'eliminated_team_name', 'match_stats_extra', 'picked_coin_count', 'direct_airdrop_picks', 'lock_airdrop_picks', 'vault_open_by_key_count', 'vault_open_by_purchase_count', 'healing_to_self', 'healing_to_teammates', 'engage_count', 'match_duration_after_cabin', 'damage_taken', 'knockdown_real_damage_taken', 'grenade_usages', 'be_knocked_down_count', 'alive_duration'];

    // Puntos por posición (estándar de campeonato)
    const PUNTOS = { 1: 12, 2: 9, 3: 8, 4: 7, 5: 6, 6: 5, 7: 4, 8: 3, 9: 2, 10: 1 };

    // La cabina (despegue del avión) es 53 s antes del primer anuncio de zona.
    // Medido: los tiempos de las bajas coinciden con el CSV oficial ±0,05 s.
    const CABINA_ANTES_DE_ZONA = 53.0;

    const mmss = s => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(Math.round(s % 60)).padStart(2, '0')}`;
    // Formato de Python (como el CSV oficial): comillas simples y True/False
    const py = v => {
        if (v === true) return 'True';
        if (v === false) return 'False';
        if (v === null || v === undefined) return 'None';
        if (typeof v === 'number') return String(v);
        if (typeof v === 'string') return `'${v.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
        if (Array.isArray(v)) return `[${v.map(py).join(', ')}]`;
        return `{${Object.entries(v).map(([k, x]) => `'${k}': ${py(x)}`).join(', ')}}`;
    };

    // ---------- Datos crudos del replay que no están en FFReplay.leer ----------
    function cuentas(bin, pids) {
        const { varint } = F._interno;
        const res = new Map();
        const tope = Math.min(bin.length - 8, 3_000_000);
        for (const pid of pids) {
            const p0 = (pid & 0x7f) | 0x80, p3 = (pid >>> 24) << 3;
            for (let i = 6; i < tope; i++) {
                if (bin[i] !== p0 || bin[i + 1] !== 0x80 || bin[i + 2] !== 0x80 || bin[i + 3] !== p3 || bin[i - 1] !== 0) continue;
                let s = i - 2;
                if (bin[s] & 0x80) continue;
                while (s > 0 && (bin[s - 1] & 0x80)) s--;
                if (i - 1 - s < 3) continue;
                res.set(pid, String(varint(bin, s)[0]));
                break;
            }
        }
        return res;
    }

    // Mensajes de zona crudos (02 75) → circle_info del CSV oficial
    function circulos(bin) {
        const { varint, zz } = F._interno;
        const dv = new DataView(bin.buffer, bin.byteOffset, bin.byteLength);
        const msgs = [];
        for (let p = 4; p < bin.length - 8; p++) {
            if (bin[p] !== 0x02 || bin[p + 1] !== 0x75 || bin[p + 2] !== 0x00) continue;
            const i = p - 4, t = dv.getFloat32(i, true);
            if (!(t > 1 && t < 3000)) continue;
            try {
                let [n, j] = varint(bin, i + 7);
                if (bin[j] !== 0 || bin[j + 1 + n] !== 0) continue;
                const f = []; let k = j + 1, v;
                while (k < j + 1 + n) { [v, k] = varint(bin, k); f.push(v); }
                if (f.length >= 10) msgs.push({ t, actual: [zz(f[1]) / 1000, zz(f[2]) / 1000, f[3]], sig: [zz(f[4]) / 1000, zz(f[5]) / 1000, f[6]], estado: f[7], dur: (zz(f[9]) - zz(f[8])) / 500 });
                p = j + n;
            } catch (e) { /* incompleto */ }
        }
        // Recorrido en orden: cada círculo espera (estados 0/1/6) y luego se cierra (2/7) hacia el siguiente
        const lista = [];
        let actual = null, cerrando = false;
        msgs.forEach(m => {
            if (!actual) { actual = { c: m.actual, espera: 0, cierre: 0 }; lista.push(actual); }
            if ([2, 7].includes(m.estado)) { actual.cierre += m.dur; cerrando = true; return; }
            if (cerrando) {
                // terminó el cierre anterior: el círculo actual pasa a ser el que se anunció
                actual = { c: m.actual, espera: 0, cierre: 0 };
                lista.push(actual);
                cerrando = false;
            }
            actual.espera += m.dur;
            actual.sig = m.sig;
        });
        if (actual && actual.sig && cerrando) lista.push({ c: actual.sig, espera: 0, cierre: 0 });
        const primerAnuncio = msgs.find(m => m.estado === 1);
        return {
            circulos: lista.map((x, i) => ({ circle_name: `Circle ${i}`, circle_continue_time: mmss(x.espera), circle_remain_time: mmss(x.cierre), x_coordinate: Math.trunc(x.c[0]), y_coordinate: Math.trunc(x.c[1]), radius: x.c[2] })),
            cabina: primerAnuncio ? primerAnuncio.t - CABINA_ANTES_DE_ZONA : 0
        };
    }

    // Columnas propias que se agregan al final del CSV generado (no existen en el oficial)
    const EXTRA = ['tiempo_en_movimiento', 'distancia_estimada', 'arma_mas_usada'];

    // Mensajes enmarcados [t][tipo][id][00][largo][00][contenido][00] → lista de { t, f: [varints] }
    function mensajesCrudos(bin, tipo, id) {
        const { varint } = F._interno;
        const dv = new DataView(bin.buffer, bin.byteOffset, bin.byteLength);
        const out = [];
        for (let p = 4; p < bin.length - 8; p++) {
            if (bin[p] !== tipo || bin[p + 1] !== id || bin[p + 2] !== 0) continue;
            const t = dv.getFloat32(p - 4, true);
            if (!(t > 1 && t < 3000)) continue;
            try {
                const [n, j] = varint(bin, p + 3);
                if (j + 1 + n >= bin.length || bin[j] !== 0 || bin[j + 1 + n] !== 0) continue;
                const f = []; let k = j + 1, v;
                while (k < j + 1 + n) { [v, k] = varint(bin, k); f.push(v); }
                out.push({ t, f });
                p = j + n;
            } catch (e) { /* incompleto */ }
        }
        return out;
    }

    // Combate desde el .bin (validado contra 8 partidas / 384 jugadores del CSV oficial):
    // · 02 6a  impacto: [atacante, víctima, daño, daño al escudo, zz(arma), ?, ?, parte]
    //          parte 1 = cabeza, 2 = torso, 3 = piernas; arma -1 = zona.
    // · 02 8b  derribo: [derribado, quien derriba, …]
    // · 02 dd  muro gloo (el jugador en el campo 15) · 02 8e  rescate (quien levanta en el campo 1)
    function combate(bin, info, pids) {
        const { zz } = F._interno;
        const imp = mensajesCrudos(bin, 0x02, 0x6a).map(m => ({ t: m.t, a: m.f[0], v: m.f[1], d: (m.f[2] || 0) + (m.f[3] || 0), arma: zz(m.f[4] || 0), parte: m.f[7] || 0 }));
        const der = mensajesCrudos(bin, 0x02, 0x8b);
        const gloo = mensajesCrudos(bin, 0x02, 0xdd);
        const resc = mensajesCrudos(bin, 0x02, 0x8e);
        // Granadas (600–628) y habilidades (negativas o ≥ 80000) suman daño pero no impactos.
        // Ojo: 629–638 son armas de fuego (Groza, M249, SVD, AWM, Thompson).
        const esArma = w => w > 0 && !(w >= 600 && w <= 628) && w < 80000;
        const eq = p => p >>> 24;
        const ev = info.Events || [];
        const ev3 = ev.filter(e => e.Event === 3), ev4 = ev.filter(e => e.Event === 4);
        const res = new Map();
        pids.forEach(p => {
            const hechos = imp.filter(m => m.a === p && m.v !== p && m.arma !== -1);
            const armas = new Map();
            hechos.forEach(m => {
                const a = armas.get(m.arma) || { weapon_id: m.arma, hits: 0, headshots: 0, kills: 0, damage: 0, weapon_name: F.nombreArma(m.arma) || `Arma ${m.arma}` };
                a.damage += m.d; if (esArma(m.arma)) a.hits++; if (m.parte === 1) a.headshots++;
                armas.set(m.arma, a);
            });
            // Asistencia: dañó a la víctima en los 20 s antes de que un compañero la eliminara
            const asist = ev3.filter(e => {
                if (e.PlayerID === p || eq(e.PlayerID) !== eq(p)) return false;
                const v = ev4.find(x => Math.abs(x.Time - e.Time) < 0.01);
                return v && imp.some(m => m.a === p && m.v === v.PlayerID && m.t <= e.Time && m.t >= e.Time - 20);
            }).length;
            res.set(p, {
                damage: Math.round(hechos.reduce((s, m) => s + m.d, 0)),
                damage_taken: Math.round(imp.filter(m => m.v === p).reduce((s, m) => s + m.d, 0)),
                hits: hechos.filter(m => esArma(m.arma)).length,
                headshots: imp.filter(m => m.a === p && m.parte === 1).length,
                torso_hits: imp.filter(m => m.a === p && m.parte === 2).length,
                leg_hits: imp.filter(m => m.a === p && m.parte === 3).length,
                knock_down: der.filter(m => m.f[1] === p).length,
                be_knocked_down_count: der.filter(m => m.f[0] === p).length,
                icewall_use: gloo.filter(m => m.f[15] === p).length,
                rescue_times: resc.filter(m => m.f[1] === p).length,
                assists: asist,
                armas: [...armas.values()].sort((a, c) => c.damage - a.damage)
            });
        });
        return res;
    }

    // ---------- Generador ----------
    function generar(bin, json) {
        if (!F) throw new Error('Falta js/mapstream-replay.js');
        const b = bin instanceof Uint8Array ? bin : new Uint8Array(bin);
        const info = typeof json === 'string' ? JSON.parse(json.replace(/^﻿/, '')) : json;
        // El MatchID no cabe en un número de JavaScript (pierde los últimos dígitos): se toma del texto
        const idTexto = typeof json === 'string' ? (/"MatchID"\s*:\s*(\d+)/.exec(json) || [])[1] : null;
        const matchId = idTexto || String(info.MatchID);
        const r = F.leer(b, info);
        const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
        const { porEntidad } = F._interno.instantaneas(b, dv);
        const { circulos: circle_info, cabina } = circulos(b);
        const ev = info.Events || [];
        const finPartida = Math.max(0, ...ev.map(e => e.Time));
        const jugadores = r.equipos.flatMap(e => e.jugadores.map(j => ({ ...j, eq: e })));
        const cuenta = cuentas(b, jugadores.map(j => j.id));
        const ms = t => Math.round((t - cabina) * 1000);

        // Muertes (puede haber varias si lo reviven) y si terminó vivo
        const muertes = new Map();
        ev.filter(e => e.Event === 4).forEach(e => { if (!muertes.has(e.PlayerID)) muertes.set(e.PlayerID, []); muertes.get(e.PlayerID).push(e.Time); });
        const serie = pid => (porEntidad.get(pid & 0xff) || []).filter(q => q[2] < 300);
        const estado = j => {
            const ms2 = (muertes.get(j.id) || []).sort((a, c) => a - c);
            const ultima = ms2[ms2.length - 1];
            const s = serie(j.id);
            const revividoDespues = ultima != null && s.some(q => q[0] > ultima + 15);
            const muerto = ultima != null && !revividoDespues && j.eq.eliminadoEn != null;
            return { muertes: ms2, muerto, fin: muerto ? ultima : finPartida };
        };

        // Posición final del equipo y quién lo eliminó
        const orden = [...r.equipos].sort((a, c) => (c.eliminadoEn ?? Infinity) - (a.eliminadoEn ?? Infinity));
        const posicion = new Map(orden.map((eq, i) => [eq.id, i + 1]));
        const bajasEquipo = new Map();
        r.bajas.forEach(bj => bajasEquipo.set(bj.equipoMatador, (bajasEquipo.get(bj.equipoMatador) || 0) + 1));
        const eliminadoPor = new Map();
        r.equipos.forEach(eq => {
            if (eq.eliminadoEn == null) return;
            const ult = [...r.bajas].filter(bj => bj.equipoVictima === eq.nombre && bj.t <= eq.eliminadoEn + 0.5).sort((a, c) => c.t - a.t)[0];
            if (ult) eliminadoPor.set(eq.id, ult.equipoMatador);
        });

        // Distancia entre matador y víctima en el instante de la baja (metros)
        const posEn = (pid, t) => {
            let m = null;
            for (const q of porEntidad.get(pid & 0xff) || []) if (Math.abs(q[0] - t) <= 1 && (!m || Math.abs(q[0] - t) < Math.abs(m[0] - t))) m = q;
            return m;
        };
        const ev3 = ev.filter(e => e.Event === 3);
        const killInfo = new Map();
        r.bajas.forEach((bj, i) => {
            const e = ev3[i];
            const a = posEn(bj.idMatador, e.Time), v = bj.idVictima ? posEn(bj.idVictima, e.Time) : null;
            const dist = a && v ? Math.round(Math.hypot(a[1] - v[1], a[2] - v[2], a[3] - v[3])) : null;

            const fila = {
                killer_id: cuenta.get(bj.idMatador) || '', player_killed_id: bj.idVictima ? (cuenta.get(bj.idVictima) || '') : '',
                weapon_used_id: bj.armaId > 0 ? bj.armaId : 0, kill_timestamp: String(ms(e.Time)), kill_distance: dist ?? 0
            };
            if (!killInfo.has(bj.idMatador)) killInfo.set(bj.idMatador, []);
            killInfo.get(bj.idMatador).push(fila);
        });

        const pelea = combate(b, info, jugadores.map(j => j.id));
        const filas = jugadores.map(j => {
            const st = estado(j);
            const pos = posicion.get(j.eq.id);
            const ganador = j.eq.eliminadoEn == null;
            const s = serie(j.id).filter(q => q[0] <= st.fin);
            const ult = s[s.length - 1];
            const ki = killInfo.get(j.id) || [];
            const fila = Object.fromEntries(COLUMNAS.map(c => [c, '']));
            Object.assign(fila, {
                match_id: `id${matchId}`, game_mode: info.GameMode ?? '', match_mode: info.MatchMode ?? '', group_mode: info.GroupMode ?? '',
                map_id: info.MapID, account_id: cuenta.get(j.id) || '', nickname: j.nombre, team_id: j.id >>> 24, team_name: j.eq.nombre,
                kills: ki.length, kill_distance: py(ki.map(k => k.kill_distance)), kill_info: py(ki),
                ranking_score: PUNTOS[pos] || 0, killing_score: bajasEquipo.get(j.eq.nombre) || 0, kill_count: bajasEquipo.get(j.eq.nombre) || 0,
                booyah: ganador ? 'True' : 'False', win_rate: ganador ? 100 : 0, final: 'True',
                is_eliminated: ganador ? 'False' : 'True', eliminated_team_name: ganador ? '' : (eliminadoPor.get(j.eq.id) || ''),
                player_state: st.muerto ? 1 : 0,
                survival_time: Math.round(st.fin - cabina),
                // Última muerte aunque luego lo hayan revivido (así lo da el CSV oficial)
                be_killed_time: st.muertes.length ? Math.round(st.muertes[st.muertes.length - 1] - cabina) : 0,
                match_duration_after_cabin: Math.round(st.fin - cabina),
                // alive_duration y be_knocked_down_count quedan vacíos: el replay no los da con exactitud
                revived_times: Math.max(0, st.muertes.length - (st.muerto ? 1 : 0)),
                coordinate_info: ult ? py({ x_coordinate: Math.round(ult[1]), y_coordinate: Math.round(ult[3]) }) : '',
                match_stats_extra: py({ circle_info, spector_info: [], round_stats: [] })
            });
            // Combate
            const c = pelea.get(j.id);
            ki.forEach(k => { const a = c.armas.find(x => x.weapon_id === k.weapon_used_id); if (a) a.kills++; });
            Object.assign(fila, {
                damage: c.damage, damage_taken: c.damage_taken, hits: c.hits, headshots: c.headshots,
                torso_hits: c.torso_hits, leg_hits: c.leg_hits, knock_down: c.knock_down,
                be_knocked_down_count: c.be_knocked_down_count, icewall_use: c.icewall_use,
                rescue_times: c.rescue_times, assists: c.assists,
                weapon_usages: JSON.stringify(c.armas)
            });
            // Movimiento (propio de Pumas Dev Lab): tiempo y distancia con datos seguidos y velocidad posible
            let tMov = 0, dist = 0;
            for (let i = 1; i < s.length; i++) {
                const a = s[i - 1], q = s[i], dt = q[0] - a[0], d = Math.hypot(q[1] - a[1], q[3] - a[3]);
                if (dt <= 0 || dt > 4 || d / dt > 45) continue;
                dist += d;
                if (d / dt > 0.8) tMov += dt;
            }
            const masUsada = [...c.armas].filter(a => a.hits).sort((a, x) => x.hits - a.hits)[0];
            Object.assign(fila, {
                tiempo_en_movimiento: Math.round(tMov), distancia_estimada: Math.round(dist),
                arma_mas_usada: masUsada ? masUsada.weapon_name : ''
            });
            return fila;
        });
        return { filas, partida: r };
    }

    // ---------- CSV ----------
    function aCSV(filas) {
        const celda = v => {
            const s = String(v ?? '');
            return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
        };
        // Las columnas propias (EXTRA) van al final y solo si hay datos: así el CSV sigue el orden oficial
        const cols = filas.some(f => EXTRA.some(c => f[c] !== undefined && f[c] !== '')) ? [...COLUMNAS, ...EXTRA] : COLUMNAS;
        return '﻿' + [cols.join(','), ...filas.map(f => cols.map(c => celda(f[c])).join(','))].join('\r\n') + '\r\n';
    }

    function partirCSV(texto) {
        const filas = []; let fila = [], campo = '', comillas = false;
        texto = texto.replace(/^﻿/, '');
        for (let i = 0; i < texto.length; i++) {
            const c = texto[i];
            if (comillas) {
                if (c === '"') { if (texto[i + 1] === '"') { campo += '"'; i++; } else comillas = false; }
                else campo += c;
            } else if (c === '"') comillas = true;
            else if (c === ',') { fila.push(campo); campo = ''; }
            else if (c === '\n' || c === '\r') {
                if (c === '\r' && texto[i + 1] === '\n') i++;
                fila.push(campo); campo = '';
                if (fila.length > 1 || fila[0] !== '') filas.push(fila);
                fila = [];
            } else campo += c;
        }
        if (campo !== '' || fila.length) { fila.push(campo); filas.push(fila); }
        return filas;
    }

    // Valor de Python (dict/list con comillas simples) o JSON → objeto JS
    function valorPython(s) {
        if (s == null) return null;
        const t = String(s).trim();
        if (t === '' ) return null;
        if (t === 'True') return true;
        if (t === 'False') return false;
        if (t === 'None') return null;
        if (/^-?\d+(\.\d+)?$/.test(t)) return Number(t);
        if (!/^[[{]/.test(t)) return t;
        try { return JSON.parse(t); } catch (e) { /* formato Python */ }
        let out = '', enCadena = null;
        for (let i = 0; i < t.length; i++) {
            const c = t[i];
            if (enCadena) {
                if (c === '\\' && i + 1 < t.length) { const n = t[++i]; out += n === "'" ? "'" : n === '"' ? '\\"' : '\\' + n; continue; }
                if (c === enCadena) { out += '"'; enCadena = null; continue; }
                out += c === '"' ? '\\"' : c;
                continue;
            }
            if (c === "'" || c === '"') { enCadena = c; out += '"'; continue; }
            if (t.startsWith('True', i)) { out += 'true'; i += 3; continue; }
            if (t.startsWith('False', i)) { out += 'false'; i += 4; continue; }
            if (t.startsWith('None', i)) { out += 'null'; i += 3; continue; }
            out += c;
        }
        try { return JSON.parse(out); } catch (e) { return t; }
    }

    // Lee un CSV (oficial o generado) → filas con los campos ya interpretados
    function leer(texto) {
        const [cab, ...resto] = partirCSV(texto);
        if (!cab || !cab.includes('nickname')) throw new Error('El archivo no tiene el formato del CSV de estadísticas (falta la columna nickname).');
        return resto.map(v => {
            const o = {};
            cab.forEach((c, i) => { o[c] = valorPython(v[i]); });
            return o;
        });
    }

    return { generar, aCSV, leer, COLUMNAS, EXTRA, valorPython, _interno: { circulos, cuentas, combate, mensajesCrudos } };
})();

if (typeof module !== 'undefined') module.exports = EstadCSV;
