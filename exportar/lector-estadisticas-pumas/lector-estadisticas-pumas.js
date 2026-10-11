/*!
 * Lector de estadísticas · Pumas Gaming  (generado 2026-10-11)
 * Lee el replay de Free Fire (.bin + .json) y los CSV de estadísticas.
 * Archivo autónomo: sin dependencias, funciona en el navegador y en Node.
 * No editar a mano: se genera con exportar/lector-estadisticas-pumas/construir.js
 */
(function () {
// ----- js/mapstream-replay.js -----
// ============================================================
// PUMAS DEV LAB · Lector de replays de Free Fire (.bin + .json)
// ------------------------------------------------------------
// Convierte el par ReplayInfo_<id>_<fecha>.bin / .json que guarda
// el juego en una partida del formato de MapStream (js/mapstream.js).
// Funciona en el navegador y en Node (sin dependencias).
//
// Formato del .bin (descifrado y validado sobre 240 replays de FFWS
// contra las posiciones exactas de las bajas del .json):
// · Flujo de mensajes: [tiempo f32 LE][tipo u8][id u8][bandera u8]...
//   Los enteros son varint (LEB128); los con signo, zigzag.
// · 00 06 (bandera 08)  INSTANTÁNEA DE TODOS LOS JUGADORES:
//   [secuencia][1–2 campos][zz(cantidad)] y por jugador 19 varints:
//   entidad, zz(x·1000), zz(y·1000), zz(z·1000), 10 de estado,
//   3 de rotación, 0, 0. entidad = byte bajo del PlayerID.
//   Error mediano frente al .json: 0,1–0,3 m. Es la fuente principal.
// · 00 db (bandera 07, enmarcado [largo][00][contenido][00])  posiciones
//   de alta frecuencia solo de los jugadores cerca de quien grabó;
//   entidad = orden del PlayerID. Se usa si falta 00 06.
// · 00 07 (bandera 08)  comandos de control de cada jugador (no se usa).
// · 02 75  zona segura: fase, círculo actual (x, z, radio), círculo
//   siguiente, estado (1 espera, 2 cierre) y duración ·500.
// · 02 32  tabla de equipos (nombre y siglas).
// · Ficha de jugador: [PlayerID varint][zz(largo)][nombre UTF-8].
// Del .json salen bajas (eventos 3 = mató, 4 = murió, emparejados por
// tiempo y nombre), equipos eliminados (evento 1), arma y posición
// exacta de cada baja, y la duración.
// ============================================================

const FFReplay = (() => {
    // MapID del juego → imagen y calibración (mundo → plano 0-1000).
    // u = (x - x0) / lado · 1000 ;  v = (z0 + lado - z) / lado · 1000
    const MAPAS = {
        1:  { mapa: 'Bermuda',    x0: -397.9,  z0: -816.8,  lado: 1840.0 },
        3:  { mapa: 'Purgatorio', x0: -1000.3, z0: -1079.8, lado: 1826.7 },
        4:  { mapa: 'Kalahari',   x0: -710.2,  z0: -709.3,  lado: 1419.8 },
        22: { mapa: 'Nexterra',   x0: -632.9,  z0: -632.4,  lado: 1268.9 },
        29: { mapa: 'Solara',     x0: -709.7,  z0: -716.9,  lado: 1496.3 }
    };
    const ALTURA_LOBBY = 300;      // por encima: isla de espera / avión

    // weaponDataID del juego → nombre. Sale de los CSV oficiales (96 partidas: weapon_id +
    // weapon_name); se suman Skorp, Hawk, RPK y Habilidad, que se identificaron con QG Pro.
    // Los id son globales del juego: sirven para cualquier partida.
    const ARMAS = {
        '-40': "Winchester", '-31': "Habilidad", 1: "FIST", 2: "M4A1", 5: "M1014", 6: "AK", 7: "UMP", 8: "MP5",
        9: "EAGLE", 11: "M14", 12: "SCAR", 13: "VSS", 15: "MP40", 16: "PAN", 17: "MACHETE", 18: "SKS", 20: "M1873",
        21: "KAR98K", 23: "M79", 24: "FAMAS", 27: "BASEBALLPOLE", 28: "XM8", 29: "SPAS12", 30: "M60", 32: "P90",
        33: "AN94", 34: "KATANA", 36: "RGS50", 38: "HOOK GUN", 39: "PLASMA", 41: "M1887", 45: "M82B", 46: "AUG",
        47: "PARAFAL", 48: "WOODPECKER", 49: "VECTOR", 50: "MAG7", 51: "SICKLE", 53: "FF KNIFE", 54: "KORD",
        55: "M1917", 57: "KINGFISHER", 58: "UZI", 60: "MP5-I", 61: "M60-I", 63: "M14-I", 73: "G36", 74: "G36",
        75: "M24", 80: "M4A1-I", 81: "M4A1-II", 82: "M4A1-III", 86: "CHARGE BUSTER", 88: "MAC10", 89: "AC80",
        93: "TREATMENT PISTOL", 120: "MP5-II", 121: "MP5-III", 122: "M60-II", 123: "M60-III", 126: "M14-II",
        127: "M14-III", 150: "BIZON", 178: "SCAR-I", 179: "SCAR-II", 181: "TROGON(SHOTGUN)", 182: "TROGON(GRENADE)",
        184: "M1014-I", 185: "M1014-II", 186: "M1014-III", 193: "AUG-I", 194: "AUG-II", 195: "AUG-III", 196: "FGL24",
        197: "VSK94", 228: "MAC10-I", 229: "MAC10-II", 601: "GRENADE", 608: "FLASH FREEZE", 629: "GROZA",
        630: "GoldGROZA-X", 631: "M249", 632: "GoldM249-X", 633: "SVD", 634: "GoldSVD-Y", 635: "AWM",
        636: "GoldAWM-Y", 637: "Thompson-Gold", 638: "Thompson-X", 805: "M24-I", 806: "M24-II", 807: "M24-III",
        812: "Hawk", 814: "Skorp", 815: "RPK", 21001: "HEALING PISTOL-Y", 21002: "M590", 21006: "Winchester",
        21007: "Winchester-I", 21008: "Winchester-II", 21009: "Winchester-III"
    };
    const nombreArma = id => (id === null || id === undefined || id === 0) ? null : (ARMAS[id] || `Arma ${id}`);

    // ---------- Lectura binaria ----------
    // Varint hasta 2^53 sin operadores de bits (que truncan a 32)
    function varint(b, i) {
        let r = 0, m = 1, c;
        do {
            if (i >= b.length) throw new RangeError('fin de datos');
            c = b[i++];
            r += (c & 0x7f) * m;
            m *= 128;
        } while (c & 0x80);
        return [r, i];
    }
    const zz = v => (v % 2 ? -(v + 1) / 2 : v / 2);

    // Recorre los mensajes [tiempo][tipo][id][bandera] con su largo validado
    function* mensajes(b, dv, tipo, id, bandera) {
        const L = b.length;
        for (let p = 4; p < L - 8; p++) {
            if (b[p] !== tipo || b[p + 1] !== id || b[p + 2] !== bandera) continue;
            const i = p - 4;
            const t = dv.getFloat32(i, true);
            if (!(t >= 0 && t < 3000)) continue;
            let n, j;
            try { [n, j] = varint(b, i + 7); } catch (e) { continue; }
            if (j + 1 + n >= L || b[j] !== 0 || b[j + 1 + n] !== 0) continue;
            yield [t, j + 1, j + 1 + n];
            p = j + n;      // saltar el contenido
        }
    }

    // ---------- Instantáneas de todos los jugadores (00 06) ----------
    function instantaneas(b, dv) {
        const porEntidad = new Map();
        let buenos = 0;
        const L = b.length;
        for (let p = 4; p < L - 12; p++) {
            if (b[p] !== 0x00 || b[p + 1] !== 0x06 || b[p + 2] !== 0x08) continue;
            const i = p - 4;
            const t = dv.getFloat32(i, true);
            if (!(t > 0 && t < 3000)) continue;
            // Cabecera: [secuencia] y uno o dos campos antes de la cantidad
            for (const salto of [1, 2]) {
                try {
                    let k = i + 7, v;
                    [v, k] = varint(b, k);
                    for (let s = 0; s < salto; s++) [v, k] = varint(b, k);
                    [v, k] = varint(b, k);
                    const n = zz(v);
                    if (!(n > 0 && n <= 64)) continue;
                    const regs = [];
                    for (let r = 0; r < n; r++) {
                        const f = [];
                        for (let c = 0; c < 19; c++) { [v, k] = varint(b, k); f.push(v); }
                        const y = zz(f[2]) / 1000;
                        if (f[0] < 1 || f[0] > 64 || y < -100 || y > 2000 || f[17] !== 0 || f[18] !== 0
                            || Math.abs(zz(f[1])) > 4e6 || Math.abs(zz(f[3])) > 4e6) throw new RangeError('registro inválido');
                        regs.push(f);
                    }
                    buenos++;
                    for (const f of regs) {
                        if (!porEntidad.has(f[0])) porEntidad.set(f[0], []);
                        porEntidad.get(f[0]).push([t, zz(f[1]) / 1000, zz(f[2]) / 1000, zz(f[3]) / 1000]);
                    }
                    p = k - 1;
                    break;
                } catch (e) { /* probar la otra cabecera */ }
            }
        }
        porEntidad.forEach(s => s.sort((a, c) => a[0] - c[0]));
        return { porEntidad, buenos };
    }

    // ---------- Bajas del .bin (02 8b): [víctima][matador][zz(largo) nombre][zz(arma)]… ----------
    // El arma sale exacta de aquí (validado contra el CSV oficial).
    function bajasBin(b, dv) {
        const lista = [];
        for (const [t, ini, fin] of mensajes(b, dv, 0x02, 0x8b, 0x00)) {
            try {
                let k = ini, v, victima, matador;
                [victima, k] = varint(b, k);
                [matador, k] = varint(b, k);
                [v, k] = varint(b, k);
                k += zz(v);
                [v, k] = varint(b, k);
                if (k <= fin) lista.push({ t, victima, matador, arma: zz(v) });
            } catch (e) { /* incompleto */ }
        }
        return lista;
    }

    // ---------- Posiciones de alta frecuencia (00 db) ----------
    function posiciones(b, dv) {
        const porEntidad = new Map();
        let buenos = 0, malos = 0;
        for (const [t, ini, fin] of mensajes(b, dv, 0x00, 0xdb, 0x07)) {
            try {
                let k = ini, v;
                [v, k] = varint(b, k);
                [v, k] = varint(b, k);
                const n = zz(v);
                const regs = [];
                for (let r = 0; r < n; r++) {
                    const f = [];
                    for (let c = 0; c < 10; c++) { [v, k] = varint(b, k); f.push(v); }
                    regs.push(f);
                }
                if (k !== fin) { malos++; continue; }
                buenos++;
                for (const f of regs) {
                    if (f[1] < 1) continue;                    // posición vieja (fuera de vista)
                    if (!porEntidad.has(f[0])) porEntidad.set(f[0], []);
                    porEntidad.get(f[0]).push([t, zz(f[4]) / 1000, zz(f[5]) / 1000, zz(f[6]) / 1000]);
                }
            } catch (e) { malos++; }
        }
        porEntidad.forEach(s => s.sort((a, c) => a[0] - c[0]));
        return { porEntidad, buenos, malos };
    }

    // ---------- Zona segura ----------
    function zonas(b, dv) {
        const msgs = [];
        for (const [t, ini, fin] of mensajes(b, dv, 0x02, 0x75, 0x00)) {
            if (t < 1) continue;
            try {
                const f = [];
                let k = ini, v;
                while (k < fin) { [v, k] = varint(b, k); f.push(v); }
                if (f.length < 10) continue;
                msgs.push({
                    t, fase: f[0],
                    actual: { x: zz(f[1]) / 1000, z: zz(f[2]) / 1000, r: f[3] },
                    siguiente: { x: zz(f[4]) / 1000, z: zz(f[5]) / 1000, r: f[6] },
                    estado: f[7], dur: (zz(f[9]) - zz(f[8])) / 500
                });
            } catch (e) { /* mensaje incompleto */ }
        }
        // Cada fase: anunciada (estado 1) y luego se cierra (estado 2).
        // La última es la zona que se mueve: mismo radio, otro centro (estados 6 y 7).
        const fases = [];
        msgs.forEach(m => {
            if (![1, 6].includes(m.estado) || !m.siguiente.r) return;
            const cierre = msgs.find(c => [2, 7].includes(c.estado) && c.t > m.t && c.fase === m.fase);
            fases.push({
                anunciadaEn: m.t,
                inicioCierre: cierre ? cierre.t : m.t + m.dur,
                finCierre: cierre ? cierre.t + cierre.dur : m.t + m.dur,
                ...m.siguiente
            });
        });
        const inicial = msgs.find(m => m.actual.r);
        return { inicial: inicial ? inicial.actual : null, fases };
    }

    // ---------- Nombres ----------
    const decodificador = typeof TextDecoder !== 'undefined' ? new TextDecoder('utf-8', { fatal: true }) : null;
    function texto(b, i, n) {
        try { return decodificador.decode(b.subarray(i, i + n)); } catch (e) { return null; }
    }
    const imprimible = s => s && /^[^\u0000-\u001f]+$/.test(s);

    // Ficha de jugador: PlayerID (4 bytes: xx 80 80 yy) + zz(largo) + nombre
    function fichasJugadores(b, idsValidos) {
        const nombres = new Map();
        const tope = Math.min(b.length - 50, 3_000_000);
        for (let i = 0; i < tope; i++) {
            if (b[i] < 0x81 || b[i + 1] !== 0x80 || b[i + 2] !== 0x80 || (b[i + 3] & 0x07) || b[i + 3] < 0x08 || b[i + 3] > 0x7f) continue;
            const pid = (b[i] & 0x7f) + (b[i + 3] << 21);
            if (idsValidos && !idsValidos.has(pid)) continue;
            const ln = zz(b[i + 4]);
            if (ln < 2 || ln > 48) continue;
            const s = texto(b, i + 5, ln);
            if (imprimible(s) && !nombres.has(pid)) nombres.set(pid, s);
        }
        return nombres;
    }

    // Tabla de equipos: [n][00][00][zz(largo)][nombre][zz(largo)][siglas]
    function tablaEquipos(b) {
        const tope = Math.min(b.length - 60, 2_000_000);
        const lista = [];
        for (let i = 0; i < tope; i++) {
            if (b[i] < 1 || b[i] > 64 || b[i + 1] !== 0 || b[i + 2] !== 0) continue;
            const ln = zz(b[i + 3]);
            if (ln < 2 || ln > 40) continue;
            const nombre = texto(b, i + 4, ln);
            if (!imprimible(nombre)) continue;
            const lt = zz(b[i + 4 + ln]);
            if (lt < 1 || lt > 8) continue;
            const siglas = texto(b, i + 5 + ln, lt);
            if (!imprimible(siglas)) continue;
            lista.push({ n: b[i], nombre, siglas, pos: i });
        }
        // La tabla buena es la racha más larga de índices consecutivos 1, 2, 3…
        let mejor = [];
        for (let a = 0; a < lista.length; a++) {
            if (lista[a].n !== 1) continue;
            const racha = [lista[a]];
            for (let c = a + 1; c < lista.length && lista[c].pos - racha[racha.length - 1].pos < 120; c++) {
                if (lista[c].n === racha.length + 1) racha.push(lista[c]);
            }
            if (racha.length > mejor.length) mejor = racha;
        }
        return mejor;
    }

    // Clanes que aparecen en las fichas: [zz(largo)][nombre][zz(largo)][siglas]
    function clanes(b) {
        const tope = Math.min(b.length - 60, 2_000_000);
        const porSiglas = new Map();
        for (let i = 0; i < tope; i++) {
            const ln = zz(b[i]);
            if (ln < 3 || ln > 40 || b[i] % 2) continue;
            const nombre = texto(b, i + 1, ln);
            if (!imprimible(nombre) || !/[A-ZÁÉÍÓÚÑ]{2}/.test(nombre)) continue;
            const lt = zz(b[i + 1 + ln]);
            if (lt < 1 || lt > 8) continue;
            const siglas = texto(b, i + 2 + ln, lt);
            if (!imprimible(siglas)) continue;
            const k = siglas.toUpperCase();
            if (!porSiglas.has(k)) porSiglas.set(k, new Map());
            porSiglas.get(k).set(nombre, (porSiglas.get(k).get(nombre) || 0) + 1);
        }
        return porSiglas;
    }
    // Siglas que usan los jugadores de un equipo como prefijo ("MÍA.Teff444" → MÍA)
    function siglasDeEquipo(nombres) {
        const cuenta = new Map();
        nombres.forEach(n => {
            const m = /^([^\s.ㅤ_|]+)[\s.ㅤ_|]/.exec(String(n).trim());
            if (m) cuenta.set(m[1].toUpperCase(), (cuenta.get(m[1].toUpperCase()) || 0) + 1);
        });
        return [...cuenta].sort((a, c) => c[1] - a[1]).map(x => x[0]);
    }

    // ---------- Conversión principal ----------
    function leer(bin, json) {
        const b = bin instanceof Uint8Array ? bin : new Uint8Array(bin);
        const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
        const info = typeof json === 'string' ? JSON.parse(json.replace(/^﻿/, '')) : json;
        const idTexto = typeof json === 'string' ? (/"MatchID"\s*:\s*(\d+)/.exec(json) || [])[1] : null;
        const cal = MAPAS[info.MapID];
        if (!cal) throw new Error(`Mapa del juego desconocido (MapID ${info.MapID}).`);

        // Todos los PlayerID que menciona el .json
        const ids = new Set();
        (info.Events || []).forEach(e => ids.add(e.PlayerID));
        (info.PlayerHighlightInfos || []).forEach(h => {
            ids.add(h.PlayerID);
            [...(h.KillEvents || []), ...(h.DeadEvents || [])].forEach(k => ids.add(k.PlayerID));
        });
        // Si al .json le falta algún jugador (sin eventos), se completa con las
        // fichas del .bin, solo de equipos que ya existen y hasta PlayerCount
        const fichas = fichasJugadores(b, null);
        const equiposJson = new Set([...ids].map(p => p >>> 24));
        if (info.PlayerCount && ids.size < info.PlayerCount) {
            [...fichas.keys()].filter(p => !ids.has(p) && equiposJson.has(p >>> 24))
                .sort((a, c) => (a & 0xffffff) - (c & 0xffffff))
                .slice(0, info.PlayerCount - ids.size).forEach(p => ids.add(p));
        }

        const orden = [...ids].filter(p => (p & 0xffffff) > 0).sort((a, c) => (a & 0xffffff) - (c & 0xffffff));

        // Fuente principal: instantáneas 00 06 (todos los jugadores, entidad = byte bajo del PlayerID).
        // Respaldo: 00 db (solo jugadores cercanos, entidad = orden del PlayerID).
        let { porEntidad, buenos } = instantaneas(b, dv);
        let entidadDe = new Map(orden.map(pid => [pid, pid & 0xff]));
        let fuente = '00 06';
        if (!buenos) {
            ({ porEntidad, buenos } = posiciones(b, dv));
            entidadDe = new Map(orden.map((pid, n) => [pid, n + 1]));
            fuente = '00 db';
        }
        if (!buenos) throw new Error('El .bin no tiene posiciones reconocibles.');

        // Nombres: ficha del .bin, si no, los de las bajas del .json
        const nombre = new Map(fichas);
        const ev = info.Events || [];
        // Evento 3: PlayerID = quien mató, SParam = nombre de la víctima.
        // Evento 4: PlayerID = quien murió, SParam = nombre de quien lo mató.
        // Con dos bajas en el mismo instante (granada) se empareja por nombre.
        const victimaDe = e => {
            const mismas = ev.filter(d => d.Event === 4 && Math.abs(d.Time - e.Time) < 0.01);
            return mismas.find(d => nombre.get(d.PlayerID) === e.SParam)
                || mismas.find(d => d.SParam === nombre.get(e.PlayerID))
                || (mismas.length === 1 ? mismas[0] : null);
        };
        ev.forEach(e => {
            if (e.Event !== 3) return;
            const vict = victimaDe(e);
            if (vict && !nombre.has(vict.PlayerID)) nombre.set(vict.PlayerID, e.SParam);
            if (vict && !nombre.has(e.PlayerID)) nombre.set(e.PlayerID, vict.SParam);
        });

        // Equipos: índice = PlayerID >> 24; nombre por el evento de eliminación
        const nombreEquipo = new Map();
        const elim = new Map();
        ev.filter(e => e.Event === 1).forEach(e => {
            const eq = e.PlayerID >>> 24;
            nombreEquipo.set(eq, e.SParam);
            elim.set(eq, e.Time);
        });
        const tabla = tablaEquipos(b);
        const sinUsar = tabla.filter(x => ![...nombreEquipo.values()].includes(x.nombre));
        const equiposIdx = [...new Set(orden.map(p => p >>> 24))].sort((a, c) => a - c);
        // El equipo que nunca fue eliminado (el ganador) toma el nombre que sobra de la tabla
        const sinNombre = equiposIdx.filter(eq => !nombreEquipo.has(eq));
        if (sinNombre.length === 1 && sinUsar.length === 1) nombreEquipo.set(sinNombre[0], sinUsar[0].nombre);
        // Si no alcanzó la tabla: por las siglas de clan que usan sus jugadores
        const faltan = equiposIdx.filter(eq => !nombreEquipo.has(eq));
        if (faltan.length) {
            const porSiglas = clanes(b);
            const usados = new Set(nombreEquipo.values());
            faltan.forEach(eq => {
                const nombresJug = orden.filter(p => (p >>> 24) === eq).map(p => nombre.get(p)).filter(Boolean);
                for (const s of siglasDeEquipo(nombresJug)) {
                    const cand = [...(porSiglas.get(s) || new Map())].filter(([n]) => !usados.has(n)).sort((a, c) => c[1] - a[1]);
                    if (cand.length) { nombreEquipo.set(eq, cand[0][0]); usados.add(cand[0][0]); break; }
                }
            });
        }

        const muerte = new Map();
        ev.filter(e => e.Event === 4).forEach(e => { if (!muerte.has(e.PlayerID)) muerte.set(e.PlayerID, e.Time); });

        const aPlano = (x, z) => [
            Math.round((x - cal.x0) / cal.lado * 10000) / 10,
            Math.round((cal.z0 + cal.lado - z) / cal.lado * 10000) / 10
        ];

        const equipos = equiposIdx.map(eq => {
            const jugadores = orden.filter(p => (p >>> 24) === eq).map(pid => {
                const serie = porEntidad.get(entidadDe.get(pid)) || [];
                const pos = [];
                let ultimo = -1;
                serie.forEach(([t, x, y, z]) => {
                    if (y > ALTURA_LOBBY || t - ultimo < 0.45) return;   // ~2 muestras por segundo
                    ultimo = t;
                    const [u, v] = aPlano(x, z);
                    pos.push([Math.round(t * 10) / 10, u, v]);
                });
                return { id: pid, nombre: nombre.get(pid) || `Jugador ${pid & 0xff}`, muerteEn: muerte.get(pid) ?? null, pos };
            });
            return {
                id: eq, nombre: nombreEquipo.get(eq) || `Equipo ${eq}`,
                eliminadoEn: elim.get(eq) ?? null, jugadores
            };
        });

        // Bajas: posición exacta y arma (KillEvents del .json, del mismo matador y momento)
        const golpes = [];
        (info.PlayerHighlightInfos || []).forEach(h => (h.KillEvents || []).forEach(k => golpes.push(k)));
        const equipoDe = pid => nombreEquipo.get(pid >>> 24) || '';
        const usados = new Set();
        const trayecto = new Map(equipos.flatMap(eq => eq.jugadores.map(j => [j.id, j.pos])));
        const posEn = (pid, t) => {
            let mejor = null;
            for (const q of trayecto.get(pid) || []) if (Math.abs(q[0] - t) <= 1.5 && (!mejor || Math.abs(q[0] - t) < Math.abs(mejor[0] - t))) mejor = q;
            return mejor;
        };
        const unidadesPorMetro = 1000 / cal.lado;
        const bajasDelBin = bajasBin(b, dv);
        const bajas = ev.filter(e => e.Event === 3).map(e => {
            const vict = victimaDe(e);
            // El arma está en el "golpe" del matador: el mismo instante (baja directa) o el
            // derribo previo a esa víctima (remate), que se reconoce porque la posición del
            // golpe coincide con donde estaba la víctima en ese momento.
            const propios = golpes.filter(k => k.PlayerID === e.PlayerID && !usados.has(k) && k.TriggerPoint <= e.Time + 2 && k.TriggerPoint >= e.Time - 45);
            let g = null, mejorD = Infinity;
            if (vict) propios.forEach(k => {
                const pv = k.beKilledPlayerPos; if (!pv) return;
                const q = posEn(vict.PlayerID, k.TriggerPoint); if (!q) return;
                const [u, v] = aPlano(pv.x, pv.z);
                // Se prefiere el golpe con arma (el remate final a veces viene con arma 0)
                const d = Math.hypot(u - q[1], v - q[2]) / unidadesPorMetro + (k.weaponDataID ? 0 : 6);
                if (d < 14 && d < mejorD) { mejorD = d; g = k; }
            });
            if (!g) g = propios.filter(k => Math.abs(k.TriggerPoint - e.Time) < 2)
                .sort((a, c) => Math.abs(a.TriggerPoint - e.Time) - Math.abs(c.TriggerPoint - e.Time))[0] || null;
            if (g) usados.add(g);
            const p = g && (g.beKilledPlayerPos || g.position);
            const q = p ? aPlano(p.x, p.z) : null;
            return {
                t: Math.round(e.Time * 10) / 10,
                matador: nombre.get(e.PlayerID) || '?', idMatador: e.PlayerID, equipoMatador: equipoDe(e.PlayerID),
                victima: vict ? (nombre.get(vict.PlayerID) || e.SParam) : e.SParam, idVictima: vict ? vict.PlayerID : null,
                equipoVictima: vict ? equipoDe(vict.PlayerID) : '',
                ...(() => {
                    // Arma: del mensaje de baja del .bin; si falta, del highlight
                    // 1) mensaje de baja del .bin  2) derribo de esa víctima  3) última arma que usó (≤ 90 s)
                    const m = bajasDelBin.find(x => x.matador === e.PlayerID && vict && x.victima === vict.PlayerID && x.t <= e.Time + 0.6 && x.t >= e.Time - 5);
                    let id = m ? m.arma : (g ? (g.weaponDataID ?? g.WeaponDataID ?? null) : null);
                    if (!id) {
                        const previas = [
                            ...bajasDelBin.filter(x => x.matador === e.PlayerID && x.arma).map(x => [x.t, x.arma]),
                            ...golpes.filter(k => k.PlayerID === e.PlayerID && k.weaponDataID > 0).map(k => [k.TriggerPoint, k.weaponDataID])
                        ].filter(([t]) => t <= e.Time + 0.6 && t >= e.Time - 90).sort((a, c) => c[0] - a[0]);
                        if (previas.length) id = previas[0][1];
                    }
                    return { arma: nombreArma(id), armaId: id };
                })(),
                x: q ? q[0] : undefined, y: q ? q[1] : undefined
            };
        });
        // Bajas sin posición exacta (rematar a un derribado: el highlight queda
        // a nombre de quien derribó): se usa la trayectoria de la víctima
        const jugadorDe = new Map(equipos.flatMap(e => e.jugadores.map(j => [j.id, j])));
        bajas.forEach(bj => {
            if (bj.x != null || !bj.idVictima) return;
            const s = jugadorDe.get(bj.idVictima)?.pos || [];
            let mejor = null;
            for (const q of s) if (Math.abs(q[0] - bj.t) <= 3 && (!mejor || Math.abs(q[0] - bj.t) < Math.abs(mejor[0] - bj.t))) mejor = q;
            if (mejor) { bj.x = mejor[1]; bj.y = mejor[2]; bj.posAprox = true; }
        });

        // Impactos (derribos y bajas de los highlights del .json): posición de
        // quien disparó y de quien recibió, para el mapa de calor de tiroteos
        const impactos = golpes.map(k => {
            const a = k.position ? aPlano(k.position.x, k.position.z) : null;
            const v = k.beKilledPlayerPos ? aPlano(k.beKilledPlayerPos.x, k.beKilledPlayerPos.z) : null;
            return { t: Math.round(k.TriggerPoint * 10) / 10, quien: nombre.get(k.PlayerID) || '?', equipo: equipoDe(k.PlayerID), arma: nombreArma(k.weaponDataID), a, v };
        });

        // Muertes sin matador (zona, caída, abandono)
        const conMatador = new Set(bajas.map(b => b.idVictima).filter(Boolean));
        const otrasMuertes = ev.filter(e => e.Event === 4 && !conMatador.has(e.PlayerID))
            .map(e => ({ t: Math.round(e.Time * 10) / 10, victima: nombre.get(e.PlayerID) || '?', equipoVictima: equipoDe(e.PlayerID) }));

        // Zona, en coordenadas del plano
        const z = zonas(b, dv);
        const escala = 1000 / cal.lado;
        const zonasPlano = z.fases.map((f, i) => {
            const [x, y] = aPlano(f.x, f.z);
            return { fase: i + 1, anunciadaEn: f.anunciadaEn, inicioCierre: f.inicioCierre, finCierre: f.finCierre, x, y, r: f.r * escala };
        });
        if (z.inicial && zonasPlano.length) {
            const [x, y] = aPlano(z.inicial.x, z.inicial.z);
            zonasPlano.unshift({ fase: 0, anunciadaEn: 0, inicioCierre: 0, finCierre: 0, x, y, r: z.inicial.r * escala, inicial: true });
        }

        // Ruta del avión: jugadores en el aire antes del salto
        const enAire = [];
        porEntidad.forEach(s => s.forEach(([t, x, y, zz2]) => { if (y > 120 && y < 1300 && t < 200) enAire.push([t, x, zz2]); }));
        // (con 00 06 todos los jugadores aparecen en el avión: la ruta sale completa)
        enAire.sort((a, c) => a[0] - c[0]);
        let avion = null;
        if (enAire.length > 10) {
            const a = enAire[0], c = enAire[enAire.length - 1];
            const [ax, ay] = aPlano(a[1], a[2]), [cx, cy] = aPlano(c[1], c[2]);
            if (Math.hypot(cx - ax, cy - ay) > 150) avion = { a: { x: ax, y: ay }, b: { x: cx, y: cy } };
        }

        return {
            mapa: cal.mapa,
            nombre: info.RoomName || `Partida ${info.MatchID}`,
            fecha: String(info.MatchDateTime || '').replace(/^(\d{4}-\d{2}-\d{2})-(\d{2})-(\d{2})-\d{2}$/, '$1 $2:$3'),
            duracion: Math.ceil(info.GameTotalTime || 0),
            idPartida: idTexto || String(info.MatchID || ''),   // sin redondeo si llegó como texto
            equipos, bajas, otrasMuertes, impactos, zonas: zonasPlano, avion,
            origen: 'replay', fuentePosiciones: fuente, lado: cal.lado
        };
    }

    // Un replay de cliente solo trae a los jugadores cercanos a quien grabó.
    // Con varios replays de la MISMA partida (cada equipo sube el suyo) se
    // juntan las posiciones de todos: el PlayerID es el mismo en todos.
    function leerVarios(pares) {
        if (!pares.length) throw new Error('No hay replays para leer.');
        const partidas = pares.map(([bin, json]) => leer(bin, json));
        const ids = new Set(partidas.map(p => p.idPartida));
        if (ids.size > 1) throw new Error('Esos replays son de partidas distintas.');
        const base = partidas[0];
        if (partidas.length === 1) return { ...base, replays: 1 };
        const jugadorDe = new Map();
        base.equipos.forEach(e => e.jugadores.forEach(j => jugadorDe.set(j.id, j)));
        partidas.slice(1).forEach(p => p.equipos.forEach(e => e.jugadores.forEach(j => {
            const destino = jugadorDe.get(j.id);
            if (!destino) return;
            if (destino.pos.length === 0) { destino.pos = j.pos; return; }
            // Mezcla ordenada, sin duplicar instantes muy cercanos
            const todo = [...destino.pos, ...j.pos].sort((a, c) => a[0] - c[0]);
            destino.pos = todo.filter((q, i) => i === 0 || q[0] - todo[i - 1][0] >= 0.3);
        })));
        // Bajas: se completa la posición de las que no la traían
        const clave = b => `${b.t}|${b.matador}|${b.victima}`;
        const otras = new Map(partidas.slice(1).flatMap(p => p.bajas).filter(b => b.x != null).map(b => [clave(b), b]));
        base.bajas.forEach(b => { if (b.x == null && otras.has(clave(b))) Object.assign(b, { x: otras.get(clave(b)).x, y: otras.get(clave(b)).y }); });
        if (!base.avion) base.avion = partidas.find(p => p.avion)?.avion || null;
        return { ...base, replays: partidas.length };
    }

    return { leer, leerVarios, MAPAS, ARMAS, nombreArma, _interno: { varint, zz, posiciones, instantaneas, bajasBin, zonas, tablaEquipos, fichasJugadores } };
})();


// ----- js/estadisticas-csv.js -----
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


// ----- exportar/lector-estadisticas-pumas/api.js -----
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




if (typeof window !== 'undefined') { window.LectorPumas = LectorPumas; window.FFReplay = FFReplay; window.EstadCSV = EstadCSV; }
if (typeof module !== 'undefined') module.exports = LectorPumas;
})();
