// ============================================================
// PUMAS DEV LAB · Modelos estadísticos
// ------------------------------------------------------------
// Funciones puras: reciben partidas/jugadores y devuelven
// métricas. No tocan el DOM.
// ============================================================

const MIN_PARTIDAS_MAPA = 3;      // por debajo, comparar mapas es engañoso
const MIN_PARTIDAS_RANKING = 10;  // por debajo, el jugador no entra al ranking

// Pesos del índice de rendimiento según el rol del jugador
const PESOS_ROL = {
    rusher:    { bajas: 0.35, noqueos: 0.25, dmg: 0.25, hs: 0.15 },
    granadero: { dmg: 0.40, danoReal: 0.25, bajas: 0.20, noqueos: 0.15 },
    soporte:   { curacion: 0.30, levantar: 0.25, resurreccion: 0.20, asistencias: 0.15, danoReal: 0.10 }
};

const Stats = {
    sum: arr => arr.reduce((a, b) => a + b, 0),
    mean: arr => arr.length ? Stats.sum(arr) / arr.length : 0,
    std(arr) {
        if (arr.length < 2) return 0;
        const m = Stats.mean(arr);
        return Math.sqrt(Stats.sum(arr.map(x => (x - m) ** 2)) / (arr.length - 1));
    },
    // Regresión lineal simple y = a + b·x
    regresion(ys) {
        const n = ys.length;
        if (n < 2) return { pendiente: 0, r2: 0 };
        const xs = ys.map((_, i) => i + 1);
        const mx = Stats.mean(xs), my = Stats.mean(ys);
        let sxy = 0, sxx = 0, syy = 0;
        for (let i = 0; i < n; i++) {
            sxy += (xs[i] - mx) * (ys[i] - my);
            sxx += (xs[i] - mx) ** 2;
            syy += (ys[i] - my) ** 2;
        }
        const pendiente = sxx ? sxy / sxx : 0;
        const r2 = sxx && syy ? (sxy * sxy) / (sxx * syy) : 0;
        return { pendiente, r2 };
    },
    pearson(xs, ys) {
        if (xs.length < 3) return null;
        const mx = Stats.mean(xs), my = Stats.mean(ys);
        let sxy = 0, sxx = 0, syy = 0;
        for (let i = 0; i < xs.length; i++) {
            sxy += (xs[i] - mx) * (ys[i] - my);
            sxx += (xs[i] - mx) ** 2;
            syy += (ys[i] - my) ** 2;
        }
        return sxx && syy ? sxy / Math.sqrt(sxx * syy) : null;
    }
};

function puntosPosicion(pos) {
    return CATALOGO.puntosPosicion[pos] ?? 0;
}

function bajasPartida(m) {
    return Stats.sum(m.stats.map(s => s.k || 0));
}

function puntosPartida(m) {
    return puntosPosicion(m.posicion) + bajasPartida(m);
}

function ordenarCronologico(partidas) {
    return [...partidas].sort((a, b) => (a.fecha + a.hora).localeCompare(b.fecha + b.hora));
}

// ---------- Resumen del equipo ----------
function resumenEquipo(partidas) {
    const n = partidas.length;
    const bajas = Stats.sum(partidas.map(bajasPartida));
    const muertes = Stats.sum(partidas.flatMap(m => m.stats.map(s => s.d || 0)));
    const booyahs = partidas.filter(m => m.posicion === 1).length;
    const top3 = partidas.filter(m => m.posicion <= 3).length;
    const puntos = Stats.sum(partidas.map(puntosPartida));
    return {
        partidas: n,
        booyahs,
        tasaBooyah: n ? booyahs / n : 0,
        tasaTop3: n ? top3 / n : 0,
        posMedia: n ? Stats.mean(partidas.map(m => m.posicion)) : 0,
        bajas,
        bajasPorPartida: n ? bajas / n : 0,
        kd: muertes ? bajas / muertes : null,
        puntos,
        puntosPorPartida: n ? puntos / n : 0
    };
}

// ---------- Desglose por una dimensión (mapa, evento) ----------
function desglosePor(partidas, clave, orden) {
    const grupos = {};
    partidas.filter(m => m[clave]).forEach(m => { (grupos[m[clave]] = grupos[m[clave]] || []).push(m); });
    const filas = (orden || Object.keys(grupos)).filter(k => grupos[k]).map(k => {
        const ms = grupos[k];
        const bajas = Stats.sum(ms.map(bajasPartida));
        const puntos = Stats.sum(ms.map(puntosPartida));
        return {
            clave: k,
            partidas: ms.length,
            bajas,
            bajasPorPartida: bajas / ms.length,
            posMedia: Stats.mean(ms.map(m => m.posicion)),
            booyahs: ms.filter(m => m.posicion === 1).length,
            promPuntos: puntos / ms.length,
            puntos
        };
    });
    return filas.sort((a, b) => b.puntos - a.puntos);
}

// ---------- Puntos promedio por posición alcanzada ----------
function puntosPorPosicion(partidas) {
    const grupos = {};
    partidas.forEach(m => { (grupos[m.posicion] = grupos[m.posicion] || []).push(puntosPartida(m)); });
    return Object.keys(grupos).map(Number).sort((a, b) => a - b)
        .map(pos => ({ posicion: pos, partidas: grupos[pos].length, promPuntos: Stats.mean(grupos[pos]) }));
}

// ---------- Plantilla: métricas por jugador ----------
function estadisticasJugadores(partidas, jugadores) {
    const bajasEquipo = Stats.sum(partidas.map(bajasPartida));
    const filas = jugadores.map(j => {
        const registros = [];
        partidas.forEach(m => {
            const s = m.stats.find(x => x.playerId === j.id);
            if (s) registros.push({ s, m });
        });
        const n = registros.length;
        const col = f => registros.map(r => Number(r.s[f]) || 0);
        const bajas = Stats.sum(col('k'));
        const muertes = Stats.sum(col('d'));
        const asist = Stats.sum(col('a'));
        const dmgs = col('dmg');
        const dmgMedio = Stats.mean(dmgs);
        return {
            jugador: j,
            partidas: n,
            bajas, muertes, asistencias: asist,
            bajasPorPartida: n ? bajas / n : 0,
            kda: muertes ? (bajas + asist) / muertes : bajas + asist,
            dmgMedio,
            danoRealMedio: Stats.mean(col('danoReal')),
            noqueosPorPartida: Stats.mean(col('noqueos')),
            curacionMedia: Stats.mean(col('curacion')),
            levantarPorPartida: Stats.mean(col('levantar')),
            resurreccionPorPartida: Stats.mean(col('resurreccion')),
            hsMedio: Stats.mean(col('hs')),
            posMedia: n ? Stats.mean(registros.map(r => r.m.posicion)) : 0,
            participacion: bajasEquipo ? bajas / bajasEquipo : 0,
            danoPorBaja: bajas ? Stats.sum(dmgs) / bajas : null,
            // Consistencia: 100 = daño idéntico en todas las partidas
            consistencia: n >= 3 && dmgMedio ? Math.max(0, 100 * (1 - Math.min(1, Stats.std(dmgs) / dmgMedio))) : null,
            primerDerribo: partidas.filter(m => m.primerDerribo === j.id).length,
            primeraCaida: partidas.filter(m => m.primeraCaida === j.id).length
        };
    }).filter(f => f.partidas > 0);

    // Índice de rendimiento por rol (0-100), relativo al mejor de la plantilla
    const metricas = {
        bajas: f => f.bajasPorPartida, noqueos: f => f.noqueosPorPartida, dmg: f => f.dmgMedio,
        danoReal: f => f.danoRealMedio, hs: f => f.hsMedio, curacion: f => f.curacionMedia,
        levantar: f => f.levantarPorPartida, resurreccion: f => f.resurreccionPorPartida,
        asistencias: f => f.partidas ? f.asistencias / f.partidas : 0
    };
    const maximos = {};
    Object.keys(metricas).forEach(k => { maximos[k] = Math.max(0, ...filas.map(metricas[k])); });
    filas.forEach(f => {
        const pesos = PESOS_ROL[f.jugador.rol] || PESOS_ROL.rusher;
        let indice = 0;
        Object.entries(pesos).forEach(([k, w]) => {
            indice += w * (maximos[k] ? metricas[k](f) / maximos[k] : 0);
        });
        f.indiceRol = Math.round(indice * 100);
    });

    return filas.sort((a, b) => b.bajasPorPartida - a.bajasPorPartida);
}

// ---------- Tendencia de puntos ----------
function tendencia(partidas) {
    const ordenadas = ordenarCronologico(partidas);
    const serie = ordenadas.map(puntosPartida);
    const { pendiente, r2 } = Stats.regresion(serie);
    let lectura = 'Estable';
    if (serie.length >= 4 && r2 >= 0.2) lectura = pendiente > 0 ? 'Mejorando' : 'Empeorando';
    return { serie, ordenadas, pendiente, r2, lectura };
}

// ---------- Estilo de juego: ¿puntúa por pelear o por sobrevivir? ----------
function estiloJuego(partidas) {
    const kills = partidas.map(bajasPartida);
    const pos = partidas.map(m => puntosPosicion(m.posicion));
    const totalKills = Stats.sum(kills), totalPos = Stats.sum(pos);
    return {
        pctBajas: totalKills + totalPos ? totalKills / (totalKills + totalPos) : 0,
        correlacion: Stats.pearson(kills, pos)
    };
}

// ---------- Diagnóstico automático (reglas) ----------
function diagnostico(partidas, plantilla, porMapa) {
    const notas = [];
    const resumen = resumenEquipo(partidas);
    if (!partidas.length) return notas;

    const lider = [...plantilla].sort((a, b) => b.participacion - a.participacion)[0];
    if (lider && lider.participacion >= 0.3) {
        notas.push({ nivel: 'alerta', titulo: `${lider.jugador.nick} concentra el ${Math.round(lider.participacion * 100)}% de las bajas`,
            texto: 'Si cae temprano, el equipo pierde poder de fuego. Vale la pena distribuirlo.' });
    }

    const mapasValidos = porMapa.filter(m => m.partidas >= MIN_PARTIDAS_MAPA);
    if (mapasValidos.length < 2) {
        notas.push({ nivel: 'info', titulo: 'Sin comparación confiable entre mapas',
            texto: `Se necesitan al menos ${MIN_PARTIDAS_MAPA} partidas por mapa; comparar un mapa jugado una vez con otro jugado tres sería engañoso.` });
    } else {
        const mejor = [...mapasValidos].sort((a, b) => b.promPuntos - a.promPuntos);
        notas.push({ nivel: 'bien', titulo: `Mapa más fuerte: ${mejor[0].clave} (${mejor[0].promPuntos.toFixed(1)} pts/partida)`,
            texto: `El más débil es ${mejor[mejor.length - 1].clave} con ${mejor[mejor.length - 1].promPuntos.toFixed(1)} pts/partida. Prioriza ahí el entreno de rotaciones.` });
    }

    const pocas = plantilla.filter(p => p.partidas < MIN_PARTIDAS_RANKING);
    if (pocas.length) {
        notas.push({ nivel: 'info', titulo: 'Jugadores con pocas partidas',
            texto: pocas.map(p => `${p.jugador.nick} (${p.partidas})`).join(', ') + ` — por debajo de ${MIN_PARTIDAS_RANKING} partidas el número aparece pero no es concluyente.` });
    }

    const caidas = plantilla.filter(p => p.primeraCaida >= 2 && p.primeraCaida > p.primerDerribo);
    caidas.forEach(p => {
        notas.push({ nivel: 'alerta', titulo: `${p.jugador.nick} entrega el primer intercambio con frecuencia`,
            texto: `Fue el primero en caer ${p.primeraCaida} veces y abrió con derribo ${p.primerDerribo}. Revisar posicionamiento de entrada.` });
    });

    plantilla.filter(p => p.jugador.rol === 'soporte').forEach(p => {
        const maxCura = Math.max(...plantilla.map(x => x.curacionMedia));
        if (maxCura && p.curacionMedia < maxCura * 0.5) {
            notas.push({ nivel: 'alerta', titulo: `${p.jugador.nick} (soporte) cura menos que el resto`,
                texto: `Promedia ${Math.round(p.curacionMedia)} de curación por partida frente a ${Math.round(maxCura)} del que más cura.` });
        }
    });

    const est = estiloJuego(partidas);
    notas.push({ nivel: 'info', titulo: `El ${Math.round(est.pctBajas * 100)}% de los puntos viene de bajas`,
        texto: est.pctBajas > 0.6 ? 'Equipo de pelea: puntúa matando más que sobreviviendo. Ojo con las partidas donde cae temprano.'
            : est.pctBajas < 0.4 ? 'Equipo de posición: puntúa sobreviviendo. Hay margen para buscar más pelea en zona media.'
            : 'Balance entre pelea y posición.' });

    const t = tendencia(partidas);
    if (t.lectura !== 'Estable') {
        notas.push({ nivel: t.lectura === 'Mejorando' ? 'bien' : 'alerta', titulo: `Tendencia: ${t.lectura.toLowerCase()}`,
            texto: `La regresión sobre ${t.serie.length} partidas da ${t.pendiente >= 0 ? '+' : ''}${t.pendiente.toFixed(2)} pts por partida (R² ${t.r2.toFixed(2)}).` });
    }

    if (resumen.kd !== null && resumen.kd < 1) {
        notas.push({ nivel: 'alerta', titulo: `K/D del equipo por debajo de 1 (${resumen.kd.toFixed(2)})`,
            texto: 'El equipo muere más de lo que elimina. Revisar toma de peleas y trades.' });
    }
    return notas;
}

// ---------- Filtros ----------
function filtrarPartidas(partidas, { desde, hasta, mapa, evento, teamIds } = {}) {
    return partidas.filter(m =>
        (!desde || m.fecha >= desde) &&
        (!hasta || m.fecha <= hasta) &&
        (!mapa || m.mapa === mapa) &&
        (!evento || m.evento === evento) &&
        (!teamIds || teamIds.includes(m.teamId)));
}

// YYYY-MM-DD en hora local (toISOString usaría UTC)
function fechaLocal(d) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Periodo anterior de la misma duración, para comparar
function periodoAnterior(desde, hasta) {
    if (!desde || !hasta) return null;
    const d = new Date(desde + 'T00:00:00'), h = new Date(hasta + 'T00:00:00');
    const dias = Math.round((h - d) / 86400000) + 1;
    const fin = new Date(d); fin.setDate(fin.getDate() - 1);
    const ini = new Date(fin); ini.setDate(ini.getDate() - dias + 1);
    return { desde: fechaLocal(ini), hasta: fechaLocal(fin), dias };
}
