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

if (typeof module !== 'undefined') module.exports = FFReplay;
