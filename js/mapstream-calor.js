// ============================================================
// PUMAS DEV LAB · MapStream – Análisis de zonas calientes
// ------------------------------------------------------------
// MSCalor.dibujar(ctx, W, H, base, fondo, replay, tipo, opts)
//   tipo: 'movimiento' | 'peleas'
//   opts: { equipos: [id,...], fase: n (1-based), sinMarcas: bool }
// MSCalor.analizarZona(replay) → array de stats por fase
// ============================================================

const MSCalor = (() => {
    const RES = 160; // resolución de la grilla de densidad

    function nuevaGrilla() { return new Float32Array(RES * RES); }

    // Acumula un punto gaussiano en coordenadas 0–1000
    function agregarPunto(g, px, py, sigma) {
        const gx = px / 1000 * RES;
        const gy = py / 1000 * RES;
        const rMax = sigma * 3;
        const s2 = sigma * sigma * 2;
        const x0 = Math.max(0, Math.floor(gx - rMax));
        const x1 = Math.min(RES - 1, Math.ceil(gx + rMax));
        const y0 = Math.max(0, Math.floor(gy - rMax));
        const y1 = Math.min(RES - 1, Math.ceil(gy + rMax));
        for (let cy = y0; cy <= y1; cy++) {
            for (let cx = x0; cx <= x1; cx++) {
                const dx = cx + 0.5 - gx, dy = cy + 0.5 - gy;
                g[cy * RES + cx] += Math.exp(-(dx * dx + dy * dy) / s2);
            }
        }
    }

    // Gradiente: azul frío → verde → amarillo → rojo
    function colorizar(t) {
        if (t < 0.015) return null;
        const paradas = [
            [0.015, [0,   100, 255,  50]],
            [0.15,  [0,   180, 255, 110]],
            [0.35,  [0,   255, 150, 160]],
            [0.60,  [160, 255,   0, 200]],
            [0.80,  [255, 230,   0, 230]],
            [1.00,  [255,  20,   0, 255]]
        ];
        for (let i = 0; i < paradas.length - 1; i++) {
            const [t0, c0] = paradas[i], [t1, c1] = paradas[i + 1];
            if (t <= t1) {
                const f = (t - t0) / (t1 - t0);
                return [
                    Math.round(c0[0] + (c1[0] - c0[0]) * f),
                    Math.round(c0[1] + (c1[1] - c0[1]) * f),
                    Math.round(c0[2] + (c1[2] - c0[2]) * f),
                    Math.round(c0[3] + (c1[3] - c0[3]) * f)
                ];
            }
        }
        return paradas[paradas.length - 1][1];
    }

    // Puntos de movimiento: todas las posiciones de todos los jugadores
    function puntosMovimiento(replay, { equipos, fase } = {}) {
        const pts = [];
        const fases = (replay.zonas || []).filter(z => !z.inicial);
        replay.equipos.forEach(e => {
            if (equipos?.length && !equipos.includes(e.id)) return;
            e.jugadores.forEach(j => {
                j.pos.forEach(([t, x, y]) => {
                    if (fase != null) {
                        const tMin = fase > 1 ? (fases[fase - 2]?.finCierre ?? 0) : 0;
                        const tMax = fases[fase - 1]?.finCierre ?? replay.duracion;
                        if (t < tMin || t > tMax) return;
                    }
                    pts.push([x, y]);
                });
            });
        });
        return pts;
    }

    // Puntos de pelea: impactos (golpes del highlight) → bajas como respaldo
    function puntosPeleas(replay, { equipos, fase } = {}) {
        const fases = (replay.zonas || []).filter(z => !z.inicial);
        const enRango = t => {
            if (fase == null) return true;
            const tMin = fase > 1 ? (fases[fase - 2]?.finCierre ?? 0) : 0;
            const tMax = fases[fase - 1]?.finCierre ?? replay.duracion;
            return t >= tMin && t <= tMax;
        };
        const equipoIds = equipos?.length
            ? new Set(replay.equipos?.filter(e => equipos.includes(e.id)).map(e => e.nombre))
            : null;
        // Preferir impactos (todos los golpes, incluyendo derribos) sobre solo bajas
        if ((replay.impactos || []).length) {
            return replay.impactos
                .filter(imp => imp.v && (!equipoIds || equipoIds.has(imp.equipo)) && enRango(imp.t))
                .map(imp => imp.v);
        }
        return (replay.bajas || [])
            .filter(b => b.x != null && (!equipoIds || equipoIds.has(b.equipoMatador)) && enRango(b.t))
            .map(b => [b.x, b.y]);
    }

    function _dibujarZonasOverlay(c, replay, k, OX, OY) {
        (replay.zonas || []).filter(z => !z.inicial).forEach(z => {
            const px = OX + z.x * k, py = OY + z.y * k;
            c.save();
            c.strokeStyle = 'rgba(80, 140, 255, 0.45)';
            c.lineWidth = 1.5;
            c.setLineDash([6, 4]);
            c.beginPath();
            c.arc(px, py, z.r * k, 0, Math.PI * 2);
            c.stroke();
            c.restore();
        });
    }

    function _dibujarMarcasBajas(c, replay, k, OX, OY) {
        const color = n => (replay.equipos?.find(e => e.nombre === n) || {}).color || '#ff4444';
        (replay.bajas || []).forEach(b => {
            if (b.x == null) return;
            const px = OX + b.x * k, py = OY + b.y * k;
            const col = color(b.equipoMatador);
            const d = 4;
            c.save();
            c.strokeStyle = col; c.lineWidth = 1.5;
            c.beginPath();
            c.moveTo(px - d, py - d); c.lineTo(px + d, py + d);
            c.moveTo(px + d, py - d); c.lineTo(px - d, py + d);
            c.stroke();
            c.restore();
        });
    }

    // Renderiza el mapa de calor sobre ctx (ya transformado por DPR)
    function dibujar(ctx, W, H, base, fondo, replay, tipo, opciones = {}) {
        ctx.clearRect(0, 0, W, H);
        ctx.fillStyle = '#04050a';
        ctx.fillRect(0, 0, W, H);

        const k = base;
        const OX = (W - 1000 * k) / 2;
        const OY = (H - 1000 * k) / 2;
        const L = 1000 * k;

        if (fondo) {
            ctx.globalAlpha = 0.30;
            ctx.drawImage(fondo, OX, OY, L, L);
            ctx.globalAlpha = 1;
        } else {
            ctx.fillStyle = '#0c0d12';
            ctx.fillRect(OX, OY, L, L);
        }
        ctx.strokeStyle = 'rgba(0, 240, 255, 0.25)';
        ctx.lineWidth = 1;
        ctx.strokeRect(OX, OY, L, L);

        // Construir grilla de densidad
        const g = nuevaGrilla();
        const pts = tipo === 'peleas' ? puntosPeleas(replay, opciones) : puntosMovimiento(replay, opciones);
        const sigma = tipo === 'peleas' ? 5 : 9;
        pts.forEach(([x, y]) => agregarPunto(g, x, y, sigma));

        const max = g.reduce((m, v) => v > m ? v : m, 0);
        if (!max) {
            ctx.font = '14px sans-serif';
            ctx.fillStyle = 'rgba(255,255,255,0.4)';
            ctx.textAlign = 'center';
            ctx.fillText('Sin datos para los filtros seleccionados', W / 2, H / 2);
            return;
        }

        // Volcar a ImageData
        const IW = Math.round(L), IH = Math.round(L);
        const img = ctx.createImageData(IW, IH);
        const d = img.data;
        const escX = RES / IW, escY = RES / IH;
        for (let py = 0; py < IH; py++) {
            for (let px = 0; px < IW; px++) {
                const cx = Math.min(RES - 1, Math.floor(px * escX));
                const cy = Math.min(RES - 1, Math.floor(py * escY));
                const v = g[cy * RES + cx] / max;
                const col = colorizar(v);
                if (!col) continue;
                const idx = (py * IW + px) * 4;
                d[idx] = col[0]; d[idx + 1] = col[1]; d[idx + 2] = col[2]; d[idx + 3] = col[3];
            }
        }
        ctx.putImageData(img, Math.round(OX), Math.round(OY));

        // Overlay: círculos de zona y marcas de bajas
        if (opciones.mostrarZona !== false) _dibujarZonasOverlay(ctx, replay, k, OX, OY);
        if (tipo === 'peleas' && !opciones.sinMarcas) _dibujarMarcasBajas(ctx, replay, k, OX, OY);
    }

    // Estadísticas por fase de zona
    function analizarZona(replay) {
        const fases = (replay.zonas || []).filter(z => !z.inicial);
        if (!fases.length) return [];
        const bajas = replay.bajas || [];
        const otrasMuertes = replay.otrasMuertes || [];

        return fases.map((f, i) => {
            const tMin = i === 0 ? 0 : (fases[i - 1].finCierre ?? 0);
            const tMax = f.finCierre ?? f.anunciadaEn ?? 999999;

            // Kills ocurridas mientras esta fue la zona activa
            const bs = bajas.filter(b => {
                if (b.t < tMin || b.t > tMax) return false;
                // ¿en qué fase cayó? La fase activa mientras este intervalo
                return true;
            });
            const ms = otrasMuertes.filter(m => m.t >= tMin && m.t <= tMax);

            // Top killers en esta fase
            const conteo = {};
            bs.forEach(b => { conteo[b.equipoMatador] = (conteo[b.equipoMatador] || 0) + 1; });
            const top = Object.entries(conteo).sort((a, c) => c[1] - a[1]).slice(0, 3);

            return {
                fase: i + 1,
                anunciadaEn: f.anunciadaEn,
                inicioCierre: f.inicioCierre,
                finCierre: f.finCierre,
                radio: Math.round(f.r),
                kills: bs.length,
                muertesZona: ms.length,
                top
            };
        });
    }

    return { dibujar, analizarZona };
})();
