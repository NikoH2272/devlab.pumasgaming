// ============================================================
// PUMAS DEV LAB · Informe de la partida (MapStream)
// ------------------------------------------------------------
// Arma un informe imprimible (Guardar como PDF) con todo lo que sale
// del replay: resumen, equipos, jugadores, zonas, mapa de calor de
// tiroteos, mapa de bajas, bajas por arma y por fase, y el registro
// completo. Los mapas se dibujan aquí y viajan al informe como imagen.
// Depende de js/mapstream.js (rutas de mapas) y js/mapstream-replay.js
// (nombres de armas).
// ============================================================

const MSInforme = (() => {
    const reloj = s => {
        s = Math.max(0, Math.round(s || 0));
        return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
    };
    const e = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const COLORES = ['#00f0ff', '#e66767', '#f5c542', '#4ade80', '#a78bfa', '#ff8a3d', '#3987e5', '#d55181',
        '#2dd4bf', '#facc15', '#f472b6', '#94a3b8', '#84cc16', '#fb7185', '#38bdf8', '#c084fc'];

    // ---------- Cálculos ----------
    function analizar(r) {
        const fases = r.zonas.filter(z => !z.inicial);
        const faseDe = t => {
            const i = fases.findIndex(z => t <= z.finCierre);
            return i < 0 ? fases.length + 1 : i + 1;
        };
        const metros = r.lado ? r.lado / 1000 : 2.4;

        const bajasEquipo = {}, bajasJugador = {}, armasJugador = {}, armas = {};
        r.bajas.forEach(b => {
            bajasEquipo[b.equipoMatador] = (bajasEquipo[b.equipoMatador] || 0) + 1;
            bajasJugador[b.matador] = (bajasJugador[b.matador] || 0) + 1;
            const a = b.arma || 'Sin identificar';
            armas[a] = (armas[a] || 0) + 1;
            (armasJugador[b.matador] = armasJugador[b.matador] || {})[a] = (armasJugador[b.matador][a] || 0) + 1;
        });

        // Posición final: el que nunca fue eliminado es 1.º; el resto por orden inverso de eliminación
        const equipos = [...r.equipos].sort((a, c) => (a.eliminadoEn ?? Infinity) > (c.eliminadoEn ?? Infinity) ? -1 : 1)
            .map((eq, i) => ({ ...eq, pos: i + 1, bajas: bajasEquipo[eq.nombre] || 0, color: COLORES[i % COLORES.length] }));

        const matadorDe = new Map(r.bajas.filter(b => b.idVictima).map(b => [b.idVictima, b]));
        const jugadores = equipos.flatMap(eq => eq.jugadores.map(j => {
            const fin = j.muerteEn ?? eq.eliminadoEn ?? r.duracion;
            // Distancia: tramos con datos seguidos (≤ 4 s) y a velocidad posible (≤ 40 m/s)
            let dist = 0;
            for (let i = 1; i < j.pos.length; i++) {
                const a = j.pos[i - 1], c = j.pos[i];
                if (c[0] > fin) break;
                const dt = c[0] - a[0], d = Math.hypot(c[1] - a[1], c[2] - a[2]) * metros;
                if (dt > 0 && dt <= 4 && d / dt <= 40) dist += d;
            }
            const m = matadorDe.get(j.id);
            return {
                nombre: j.nombre, equipo: eq.nombre, pos: eq.pos, color: eq.color,
                bajas: bajasJugador[j.nombre] || 0, armas: armasJugador[j.nombre] || {},
                muerte: j.muerteEn, por: m ? `${m.matador} (${m.equipoMatador})` : (j.muerteEn != null ? 'Zona / caída' : ''),
                vivo: fin - (j.pos[0]?.[0] ?? 0), dist
            };
        })).sort((a, c) => c.bajas - a.bajas || a.pos - c.pos);

        const porFase = {};
        r.bajas.forEach(b => { const f = faseDe(b.t); porFase[f] = (porFase[f] || 0) + 1; });
        const porFaseEquipo = {};
        r.bajas.forEach(b => {
            const f = faseDe(b.t);
            (porFaseEquipo[b.equipoMatador] = porFaseEquipo[b.equipoMatador] || {})[f] = (porFaseEquipo[b.equipoMatador][f] || 0) + 1;
        });

        const topEquipo = Object.entries(bajasEquipo).sort((a, c) => c[1] - a[1])[0];
        const topJugador = Object.entries(bajasJugador).sort((a, c) => c[1] - a[1])[0];
        return { fases, faseDe, metros, equipos, jugadores, armas, porFase, porFaseEquipo, topEquipo, topJugador };
    }

    // ---------- Figuras (canvas → imagen) ----------
    function cargarImagen(src) {
        return new Promise(res => {
            if (!src) return res(null);
            const im = new Image();
            im.onload = () => res(im);
            im.onerror = () => res(null);
            im.src = src;
        });
    }

    function lienzo(fondo, oscurecer = 0.35) {
        const c = document.createElement('canvas');
        c.width = c.height = 1000;
        const x = c.getContext('2d');
        x.fillStyle = '#05060a'; x.fillRect(0, 0, 1000, 1000);
        if (fondo) x.drawImage(fondo, 0, 0, 1000, 1000);
        if (oscurecer) { x.fillStyle = `rgba(4, 5, 10, ${oscurecer})`; x.fillRect(0, 0, 1000, 1000); }
        return [c, x];
    }

    function figuraZonas(r, a, fondo) {
        const [c, x] = lienzo(fondo, 0.25);
        a.fases.forEach((z, i) => {
            x.strokeStyle = 'rgba(255,255,255,0.9)'; x.lineWidth = 2.5;
            x.beginPath(); x.arc(z.x, z.y, z.r, 0, Math.PI * 2); x.stroke();
            // número de fase arriba del círculo
            const ny = Math.max(16, z.y - z.r);
            x.fillStyle = '#05060a'; x.beginPath(); x.arc(z.x, ny, 14, 0, Math.PI * 2); x.fill();
            x.strokeStyle = '#00f0ff'; x.lineWidth = 2; x.stroke();
            x.fillStyle = '#fff'; x.font = '700 16px Orbitron, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
            x.fillText(String(i + 1), z.x, ny + 1);
        });
        if (r.avion) {
            x.setLineDash([12, 9]); x.strokeStyle = 'rgba(255,255,255,0.55)'; x.lineWidth = 2;
            x.beginPath(); x.moveTo(r.avion.a.x, r.avion.a.y); x.lineTo(r.avion.b.x, r.avion.b.y); x.stroke(); x.setLineDash([]);
        }
        return c.toDataURL('image/jpeg', 0.85);
    }

    // Cada impacto suma brillo donde estaba quien disparó y donde estaba quien lo recibió
    function figuraCalor(r, fondo) {
        const [c, x] = lienzo(fondo, 0.5);
        const capa = document.createElement('canvas'); capa.width = capa.height = 1000;
        const k = capa.getContext('2d');
        k.globalCompositeOperation = 'lighter';
        const punto = (p, rad, alfa) => {
            const g = k.createRadialGradient(p[0], p[1], 0, p[0], p[1], rad);
            g.addColorStop(0, `rgba(255, 200, 40, ${alfa})`); g.addColorStop(1, 'rgba(255, 120, 0, 0)');
            k.fillStyle = g; k.beginPath(); k.arc(p[0], p[1], rad, 0, Math.PI * 2); k.fill();
        };
        const lista = (r.impactos && r.impactos.length) ? r.impactos : r.bajas.filter(b => b.x != null).map(b => ({ v: [b.x, b.y] }));
        lista.forEach(i => { if (i.a) punto(i.a, 22, 0.22); if (i.v) punto(i.v, 26, 0.3); });
        x.drawImage(capa, 0, 0);
        return c.toDataURL('image/jpeg', 0.85);
    }

    function figuraBajas(r, a, fondo) {
        const [c, x] = lienzo(fondo, 0.45);
        const colorFase = ['#4ade80', '#00f0ff', '#a78bfa', '#f5c542', '#ff8a3d', '#e66767', '#ffffff'];
        r.bajas.forEach(b => {
            if (b.x == null) return;
            const col = colorFase[(a.faseDe(b.t) - 1) % colorFase.length];
            x.fillStyle = col; x.strokeStyle = '#05060a'; x.lineWidth = 2;
            x.beginPath(); x.arc(b.x, b.y, 7, 0, Math.PI * 2); x.fill(); x.stroke();
        });
        return c.toDataURL('image/jpeg', 0.85);
    }

    // ---------- HTML ----------
    function barras(filas, total, color = '#00f0ff') {
        const max = Math.max(1, ...filas.map(f => f[1]));
        return `<div class="barras">${filas.map(([n, v]) => `
            <div class="b-fila"><span class="b-etq">${e(n)}</span>
            <span class="b-pista"><i style="width:${v / max * 100}%;background:${color}"></i></span>
            <b>${v}${total ? ` <small>${Math.round(v / total * 100)}%</small>` : ''}</b></div>`).join('')}</div>`;
    }

    function apiladas(porEquipo, nFases, equipos) {
        const colores = ['#4ade80', '#00f0ff', '#a78bfa', '#f5c542', '#ff8a3d', '#e66767', '#ffffff'];
        const filas = equipos.map(eq => [eq.nombre, porEquipo[eq.nombre] || {}]).filter(([, f]) => Object.keys(f).length);
        const max = Math.max(1, ...filas.map(([, f]) => Object.values(f).reduce((s, v) => s + v, 0)));
        return `<div class="leyenda">${Array.from({ length: nFases + 1 }, (_, i) => `<span><i style="background:${colores[i % colores.length]}"></i>${i < nFases ? 'Fase ' + (i + 1) : 'Final'}</span>`).join('')}</div>
        <div class="barras">${filas.map(([n, f]) => {
            const tot = Object.values(f).reduce((s, v) => s + v, 0);
            return `<div class="b-fila"><span class="b-etq">${e(n)}</span><span class="b-pista apilada">${Array.from({ length: nFases + 1 }, (_, i) => f[i + 1]
                ? `<i style="width:${f[i + 1] / max * 100}%;background:${colores[i % colores.length]}" title="Fase ${i + 1}: ${f[i + 1]}">${f[i + 1]}</i>` : '').join('')}</span><b>${tot}</b></div>`;
        }).join('')}</div>`;
    }

    // Arma el HTML completo del informe (también sirve para guardarlo como archivo)
    async function generar(r) {
        const a = analizar(r);
        const src = typeof MapStream !== 'undefined' ? MapStream.imagenMapa(r.mapa) : null;
        const fondo = await cargarImagen(src ? new URL(src, location.href).href : null);
        const imgZonas = figuraZonas(r, a, fondo), imgCalor = figuraCalor(r, fondo), imgBajas = figuraBajas(r, a, fondo);
        const totalBajas = r.bajas.length;
        const armasOrden = Object.entries(a.armas).sort((x, c) => c[1] - x[1]);
        const nF = a.fases.length;
        const fasesFilas = Array.from({ length: nF + 1 }, (_, i) => [i < nF ? `Fase ${i + 1}` : 'Final', a.porFase[i + 1] || 0]).filter(([, v], i) => i < nF || v);
        const armasTxt = o => Object.entries(o).sort((x, c) => c[1] - x[1]).map(([n, v]) => `${e(n)} ${v}`).join(' · ') || '—';

        const html = `<!doctype html><html lang="es"><head><meta charset="utf-8">
<title>Informe · ${e(r.nombre)} · ${e(r.mapa)}</title>
<link href="https://fonts.googleapis.com/css2?family=Orbitron:wght@500;700;900&family=Rajdhani:wght@500;600;700&display=swap" rel="stylesheet">
<style>
:root { --c:#00f0ff; --t:#e8f6f8; --s:#9aa3b2; --g:#5d6577; --f:#05060a; --p:#0b0d14; --l:rgba(0,240,255,.16); }
* { box-sizing:border-box; margin:0; padding:0; }
body { background:var(--f); color:var(--t); font-family:'Rajdhani',sans-serif; font-size:14px; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
.hoja { max-width:1060px; margin:0 auto; padding:28px 32px; }
.barra-sup { position:sticky; top:0; z-index:5; display:flex; justify-content:space-between; align-items:center; gap:12px; padding:10px 32px; background:rgba(5,6,10,.92); border-bottom:1px solid var(--l); }
.barra-sup button { font-family:'Orbitron',sans-serif; font-size:12px; letter-spacing:1px; padding:9px 16px; border:0; background:linear-gradient(120deg,#00f0ff,#3d7bff); color:#03060a; cursor:pointer; font-weight:700; }
.marca { font-family:'Orbitron',sans-serif; color:var(--c); letter-spacing:3px; font-size:12px; }
h1 { font-family:'Orbitron',sans-serif; font-size:30px; letter-spacing:1px; margin:6px 0 2px; }
h2 { font-family:'Orbitron',sans-serif; font-size:12px; letter-spacing:3px; color:var(--c); text-transform:uppercase; margin:30px 0 12px; padding-left:10px; border-left:3px solid var(--c); }
.sub { color:var(--s); font-size:15px; }
.kpis { display:grid; grid-template-columns:repeat(4,1fr); gap:10px; margin-top:18px; }
.kpi { background:var(--p); border:1px solid var(--l); padding:14px 16px; }
.kpi b { display:block; font-family:'Orbitron',sans-serif; font-size:24px; color:var(--c); }
.kpi span { color:var(--s); font-size:11px; letter-spacing:1.5px; text-transform:uppercase; }
table { width:100%; border-collapse:collapse; font-size:13px; }
th { text-align:left; font-family:'Orbitron',sans-serif; font-size:9.5px; letter-spacing:1.2px; color:var(--s); text-transform:uppercase; padding:7px 8px; border-bottom:1px solid var(--c); }
td { padding:7px 8px; border-bottom:1px solid var(--l); vertical-align:top; }
td.n, th.n { text-align:right; font-variant-numeric:tabular-nums; }
tr.oro td:first-child { color:#f5c542; font-weight:700; }
.eq { display:inline-block; width:9px; height:9px; margin-right:6px; vertical-align:middle; }
small { color:var(--g); }
.dos { display:grid; grid-template-columns:1fr 1fr; gap:16px; }
.figura { background:var(--p); border:1px solid var(--l); padding:10px; }
.figura img { width:100%; display:block; }
.figura p { color:var(--s); font-size:12px; margin-top:6px; }
.barras { display:flex; flex-direction:column; gap:6px; }
.b-fila { display:grid; grid-template-columns:170px 1fr 70px; gap:10px; align-items:center; }
.b-etq { text-align:right; color:var(--s); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.b-pista { height:16px; background:rgba(255,255,255,.04); display:flex; }
.b-pista i { display:block; height:100%; font-style:normal; font-size:10px; color:#03060a; font-weight:700; text-align:center; line-height:16px; overflow:hidden; }
.b-fila b { font-variant-numeric:tabular-nums; }
.leyenda { display:flex; gap:14px; flex-wrap:wrap; color:var(--s); font-size:12px; margin-bottom:10px; }
.leyenda i { display:inline-block; width:10px; height:10px; margin-right:5px; vertical-align:middle; }
.nota { color:var(--s); font-size:12px; border-left:2px solid var(--g); padding:6px 10px; margin-top:10px; background:rgba(255,255,255,.02); }
.registro td:first-child { color:var(--c); font-family:'Orbitron',sans-serif; font-size:11px; white-space:nowrap; }
.pie { margin-top:26px; padding-top:10px; border-top:1px solid var(--l); color:var(--g); font-size:11px; display:flex; justify-content:space-between; }
.salto { break-before:page; }
@media print {
  @page { size:A4; margin:10mm; }
  .barra-sup { display:none; }
  .hoja { padding:0; max-width:none; }
  tr, .figura, .kpi, .b-fila { break-inside:avoid; }
}
@media (max-width:760px) { .kpis { grid-template-columns:1fr 1fr; } .dos { grid-template-columns:1fr; } .b-fila { grid-template-columns:110px 1fr 56px; } .hoja { padding:16px; } }
</style></head><body>
<div class="barra-sup"><span class="marca">PUMAS DEV LAB · MAPSTREAM</span><span><button onclick="print()">GUARDAR COMO PDF</button> <button onclick="parent.MSInforme && parent.MSInforme.cerrar()" style="background:#1a1d28;color:#e8f6f8">CERRAR</button></span></div>
<div class="hoja">
  <span class="marca">Informe de la partida</span>
  <h1>${e(r.nombre)}</h1>
  <p class="sub">${e(r.mapa)} · ${e(r.fecha)} · duración ${reloj(r.duracion)}${r.replays > 1 ? ` · ${r.replays} replays combinados` : ''}</p>
  <div class="kpis">
    <div class="kpi"><b>${totalBajas}</b><span>Bajas en la sala</span></div>
    <div class="kpi"><b>${r.equipos.length}</b><span>Equipos · ${a.jugadores.length} jugadores</span></div>
    <div class="kpi"><b>${a.topEquipo ? `${e(a.topEquipo[0])} (${a.topEquipo[1]})` : '—'}</b><span>Equipo con más bajas</span></div>
    <div class="kpi"><b>${a.topJugador ? `${e(a.topJugador[0])} (${a.topJugador[1]})` : '—'}</b><span>Jugador con más bajas</span></div>
  </div>

  <h2>Equipos</h2>
  <table><thead><tr><th>Pos.</th><th>Equipo</th><th class="n">Bajas</th><th>Eliminado</th><th>Jugadores (bajas)</th></tr></thead><tbody>
  ${a.equipos.map(eq => `<tr class="${eq.pos === 1 ? 'oro' : ''}"><td>${eq.pos === 1 ? '🏆 1' : eq.pos}</td>
    <td><span class="eq" style="background:${eq.color}"></span><b>${e(eq.nombre)}</b></td><td class="n">${eq.bajas}</td>
    <td>${eq.eliminadoEn != null ? reloj(eq.eliminadoEn) : '<b>Ganador</b>'}</td>
    <td>${eq.jugadores.map(j => `${e(j.nombre)} <small>(${a.jugadores.find(x => x.nombre === j.nombre)?.bajas || 0})</small>`).join(' · ')}</td></tr>`).join('')}
  </tbody></table>

  <h2 class="salto">Estadísticas por jugador</h2>
  <table><thead><tr><th>Jugador</th><th>Equipo</th><th class="n">Bajas</th><th>Bajas por arma</th><th>Cayó</th><th>Eliminado por</th><th class="n">Tiempo vivo</th><th class="n">Recorrido</th></tr></thead><tbody>
  ${a.jugadores.map(j => `<tr><td><b>${e(j.nombre)}</b></td><td><span class="eq" style="background:${j.color}"></span>${e(j.equipo)}</td>
    <td class="n"><b>${j.bajas}</b></td><td>${armasTxt(j.armas)}</td>
    <td>${j.muerte != null ? reloj(j.muerte) : '<small>sobrevivió</small>'}</td><td>${e(j.por) || '—'}</td>
    <td class="n">${reloj(j.vivo)}</td><td class="n">${(j.dist / 1000).toFixed(2)} km</td></tr>`).join('')}
  </tbody></table>
  <p class="nota">Bajas = las que registra el juego para quien remata. "Recorrido" suma los tramos con datos seguidos de cada jugador (a pie y en vehículo).</p>

  <h2 class="salto">Zona segura</h2>
  <div class="dos">
    <div class="figura"><img src="${imgZonas}" alt="Zonas seguras de la partida"><p>Dibujo de las zonas seguras en orden${r.avion ? ' · línea punteada: ruta del avión' : ''}.</p></div>
    <div>
      <table><thead><tr><th>Fase</th><th>Anunciada</th><th>Empieza a cerrar</th><th>Termina de cerrar</th><th class="n">Radio</th></tr></thead><tbody>
      ${a.fases.map((z, i) => `<tr><td><b>${i + 1}</b></td><td>${reloj(z.anunciadaEn)}</td><td>${reloj(z.inicioCierre)}</td><td>${reloj(z.finCierre)}</td><td class="n">${Math.round(z.r * a.metros)} m</td></tr>`).join('')}
      </tbody></table>
      <p class="nota">Tiempos del juego. Entre "anunciada" y "empieza a cerrar" la zona espera; después el borde azul se cierra de forma continua hasta el círculo nuevo.</p>
      <h2>Bajas por fase de la zona</h2>
      ${barras(fasesFilas, totalBajas, '#00f0ff')}
      <p class="nota">Fase N = desde que terminó de cerrar la zona anterior hasta que termina de cerrar la zona N.</p>
    </div>
  </div>

  <h2 class="salto">Mapa de calor de tiroteos</h2>
  <div class="dos">
    <div class="figura"><img src="${imgCalor}" alt="Mapa de calor de tiroteos"><p>Cada derribo o baja suma brillo donde estaba quien disparó y donde estaba quien lo recibió: más brillo, más pelea.</p></div>
    <div class="figura"><img src="${imgBajas}" alt="Mapa de bajas"><p>Dónde cayó cada jugador, por fase de zona: <span style="color:#4ade80">1</span> · <span style="color:#00f0ff">2</span> · <span style="color:#a78bfa">3</span> · <span style="color:#f5c542">4</span> · <span style="color:#ff8a3d">5</span> · <span style="color:#e66767">6</span>.</p></div>
  </div>

  <h2>Bajas por arma</h2>
  ${barras(armasOrden.slice(0, 16), totalBajas, '#3d7bff')}

  <h2 class="salto">Bajas por fase de la zona, por equipo</h2>
  ${apiladas(a.porFaseEquipo, nF, a.equipos)}

  ${r.otrasMuertes && r.otrasMuertes.length ? `<h2>Muertes sin matador</h2>
  <table><thead><tr><th>Hora</th><th>Jugador</th><th>Equipo</th></tr></thead><tbody>
  ${r.otrasMuertes.map(m => `<tr><td>${reloj(m.t)}</td><td>${e(m.victima)}</td><td>${e(m.equipoVictima)}</td></tr>`).join('')}</tbody></table>
  <p class="nota">Zona, caída o abandono: el juego registra la muerte sin un rival que la cause.</p>` : ''}

  <h2 class="salto">Registro de bajas</h2>
  <table class="registro"><thead><tr><th>Hora</th><th>Baja</th><th>Arma</th><th>Fase</th></tr></thead><tbody>
  ${r.bajas.map(b => `<tr><td>${reloj(b.t)}</td><td><b>${e(b.matador)}</b> <small>(${e(b.equipoMatador)})</small> → ${e(b.victima)} <small>(${e(b.equipoVictima)})</small></td>
    <td>${e(b.arma || '—')}</td><td>${a.faseDe(b.t) <= nF ? a.faseDe(b.t) : 'Final'}</td></tr>`).join('')}
  </tbody></table>

  <div class="pie"><span>PUMAS DEV LAB · MapStream · creado por <a href="https://www.instagram.com/coach.nikoh/" target="_blank" rel="noopener noreferrer" style="color:#00f0ff;text-decoration:none">@coach.nikoh</a></span><span>Generado el ${new Date().toLocaleString('es')} · partida ${e(r.idPartida || '')}</span></div>
</div></body></html>`;
        return html;
    }

    // Se muestra dentro de la app (sin ventanas emergentes, que muchos navegadores bloquean)
    async function abrir(r) {
        if (!r) return;
        cerrar();
        const capa = document.createElement('div');
        capa.id = 'ms-informe';
        capa.innerHTML = '<p class="ms-informe-cargando">Generando el informe…</p>';
        document.body.appendChild(capa);
        document.body.classList.add('con-informe');
        const marco = document.createElement('iframe');
        marco.title = 'Informe de la partida';
        marco.srcdoc = await generar(r);
        capa.innerHTML = '';
        capa.appendChild(marco);
    }

    function cerrar() {
        document.getElementById('ms-informe')?.remove();
        document.body.classList.remove('con-informe');
    }

    document.addEventListener('keydown', ev => { if (ev.key === 'Escape' && document.getElementById('ms-informe')) cerrar(); });

    return { abrir, cerrar, generar, analizar };
})();
