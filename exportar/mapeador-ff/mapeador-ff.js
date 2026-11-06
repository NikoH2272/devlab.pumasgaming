/*!
 * Mapeador FF · Pumas Gaming  (generado 2026-11-06)
 * Motor de mapas Free Fire — MapStream + lector de replays.
 * Archivo autónomo: sin dependencias, funciona en el navegador.
 * No editar a mano: se genera con exportar/mapeador-ff/construir.js
 *
 * Uso rápido:
 *   <canvas id="mapa"></canvas>
 *   <script src="mapeador-ff.js"></script>
 *   <script>
 *     MapStream.rutaMapas = 'iconosobs/mapas/';          // ruta a las imágenes
 *     const ms = new MapStream(document.getElementById('mapa'));
 *     ms.cargar(MapStream.demo());                       // datos de prueba
 *     ms.reproducir();
 *   </script>
 *
 * Para cargar un replay real (.bin + .json del juego):
 *   const replay = FFReplay.leerVarios([[binUint8Array, jsonParsed]]);
 *   ms.cargar(replay);
 *   ms.ir(0);    // snapshot en t=0 (sin reproducir)
 */
(function () {
// ----- js/mapstream.js -----
// ============================================================
// PUMAS DEV LAB · MapStream (motor de repetición de partidas)
// ------------------------------------------------------------
// Reproduce una partida sobre el mapa: jugadores con su estela,
// zona segura cerrándose, bajas y equipos eliminados.
//
// MÓDULO PORTABLE: no depende del resto de la app. Para llevarlo
// a otro proyecto copia js/mapstream.js y la carpeta de mapas.
//   const ms = new MapStream(canvas, { alCambiarTiempo: t => {} });
//   ms.cargar(replay);           // formato de abajo
//   ms.reproducir(); ms.pausar(); ms.ir(segundos); ms.velocidad = 4;
//
// FORMATO DE PARTIDA (coordenadas lógicas 0-1000 sobre el mapa,
// tiempos en segundos desde el inicio):
// {
//   mapa: 'Bermuda', nombre: 'Scrim J3', fecha: '2026-10-10', duracion: 1100,
//   equipos: [{ id, nombre, color?, posicion?, eliminadoEn?,
//               jugadores: [{ nombre, muerteEn?, pos: [[t, x, y], ...] }] }],
//   zonas:  [{ fase, anunciadaEn, inicioCierre, finCierre, x, y, r }],
//   bajas:  [{ t, matador, equipoMatador, victima, equipoVictima, arma?, x?, y? }],
//   avion?: { a: { x, y }, b: { x, y } }
// }
// MapStream.desdeQGPro(replay) convierte una partida exportada de QG Pro.
// ============================================================

const MS_ANCHO = 1000;
const MS_HUECO = 4;          // segundos sin datos a partir de los cuales se oculta al jugador
const MS_FUENTE = "'Orbitron', sans-serif";
const MS_COLORES = ['#00f0ff', '#e66767', '#f5c542', '#4ade80', '#a78bfa', '#ff8a3d', '#3987e5', '#d55181',
    '#2dd4bf', '#facc15', '#f472b6', '#94a3b8', '#84cc16', '#fb7185', '#38bdf8', '#c084fc'];
const MS_MAPAS = { Bermuda: 'bermuda.png', Purgatorio: 'purgatorio.png', Kalahari: 'kalahari.png', Nexterra: 'nexterra.png', Solara: 'solara.png' };

class MapStream {
    static rutaMapas = 'iconosobs/mapas/';

    constructor(canvas, { alCambiarTiempo = () => {}, alTerminar = () => {} } = {}) {
        this.cv = canvas;
        this.cx = canvas.getContext('2d');
        this.alCambiarTiempo = alCambiarTiempo;
        this.alTerminar = alTerminar;
        this.replay = null;
        this.fondo = null;
        this.tiempo = 0;
        this.velocidad = 1;
        this.reproduciendo = false;
        this.estela = 25;                 // segundos de estela detrás de cada jugador
        this.ocultos = new Set();         // equipos que no se dibujan
        this.foco = new Set();            // equipos resaltados (el resto se atenúa)
        this.seguir = null;               // equipo que sigue la cámara
        this.capas = { estelas: true, nombres: true, bajas: true, zona: true, fasesPrevias: true, avion: true };
        this.vista = { z: 1, x: 0, y: 0 };
        this._ultimo = 0;
        this._cuadro = this._cuadro.bind(this);
        this.medir = this.medir.bind(this);
        this._eventos();
        new ResizeObserver(this.medir).observe(canvas.parentElement);
    }

    static imagenMapa(mapa) {
        return MS_MAPAS[mapa] ? MapStream.rutaMapas + MS_MAPAS[mapa] : null;
    }

    // ---------- Carga ----------
    cargar(replay) {
        this.pausar();
        this.replay = MapStream.normalizar(replay);
        this.ocultos.clear(); this.foco.clear(); this.seguir = null;
        this.vista = { z: 1, x: 0, y: 0 };
        this.tiempo = this.inicioAccion;
        this.fondo = null;
        const src = MapStream.imagenMapa(this.replay.mapa);
        if (src) {
            const im = new Image();
            im.onload = () => { this.fondo = im; this.dibujar(); };
            im.src = src;
        }
        this.medir();
        this.alCambiarTiempo(this.tiempo);
    }

    // Completa colores, ordena muestras y calcula datos derivados
    static normalizar(r) {
        const rep = JSON.parse(JSON.stringify(r));
        rep.equipos = (rep.equipos || []).map((e, i) => ({
            ...e, id: e.id ?? i, color: e.color || MS_COLORES[i % MS_COLORES.length],
            jugadores: (e.jugadores || []).map(j => ({ ...j, pos: (j.pos || []).slice().sort((a, b) => a[0] - b[0]) }))
        }));
        rep.zonas = (rep.zonas || []).slice().sort((a, b) => a.fase - b.fase);
        rep.bajas = (rep.bajas || []).slice().sort((a, b) => a.t - b.t);
        if (!rep.duracion) {
            rep.duracion = Math.max(1, ...rep.equipos.flatMap(e => e.jugadores.map(j => (j.pos[j.pos.length - 1] || [0])[0])));
        }
        return rep;
    }

    // Primer instante con jugadores en el mapa (se salta la espera en el avión)
    get inicioAccion() {
        if (!this.replay) return 0;
        const t = Math.min(...this.replay.equipos.flatMap(e => e.jugadores.map(j => (j.pos[0] || [Infinity])[0])));
        return isFinite(t) ? Math.max(0, t - 2) : 0;
    }

    // ---------- Reproducción ----------
    reproducir() {
        if (!this.replay || this.reproduciendo) return;
        if (this.tiempo >= this.replay.duracion) this.tiempo = this.inicioAccion;
        this.reproduciendo = true;
        this._ultimo = performance.now();
        requestAnimationFrame(this._cuadro);
    }

    pausar() { this.reproduciendo = false; }

    alternar() { this.reproduciendo ? this.pausar() : this.reproducir(); }

    ir(t) {
        if (!this.replay) return;
        this.tiempo = Math.max(0, Math.min(this.replay.duracion, t));
        this.dibujar();
        this.alCambiarTiempo(this.tiempo);
    }

    _cuadro(ahora) {
        if (!this.reproduciendo) return;
        const dt = Math.min(0.25, (ahora - this._ultimo) / 1000);
        this._ultimo = ahora;
        this.tiempo = Math.min(this.replay.duracion, this.tiempo + dt * this.velocidad);
        this.dibujar();
        this.alCambiarTiempo(this.tiempo);
        if (this.tiempo >= this.replay.duracion) { this.reproduciendo = false; this.alTerminar(); return; }
        requestAnimationFrame(this._cuadro);
    }

    // ---------- Consultas sobre la partida ----------
    // Posición interpolada de un jugador en el instante t (null si no está en el mapa)
    // Sin datos durante más de MS_HUECO segundos = fuera de la vista de quien
    // grabó: no se inventa un camino recto entre dos puntos lejanos.
    posicion(j, t = this.tiempo) {
        const p = j.pos;
        if (!p.length || t < p[0][0]) return null;
        if (j.muerteEn != null && t > j.muerteEn) return null;
        let lo = 0, hi = p.length - 1;
        if (t >= p[hi][0]) return t - p[hi][0] <= MS_HUECO ? { x: p[hi][1], y: p[hi][2] } : null;
        while (hi - lo > 1) { const m = (lo + hi) >> 1; if (p[m][0] <= t) lo = m; else hi = m; }
        const a = p[lo], b = p[hi];
        if (b[0] - a[0] > MS_HUECO) return t - a[0] <= MS_HUECO ? { x: a[1], y: a[2] } : null;
        const f = (t - a[0]) / ((b[0] - a[0]) || 1);
        return { x: a[1] + (b[1] - a[1]) * f, y: a[2] + (b[2] - a[2]) * f };
    }

    vivo(e, j, t = this.tiempo) {
        if (e.eliminadoEn != null && t >= e.eliminadoEn) return false;
        return j.muerteEn == null || t < j.muerteEn;
    }

    equipoVivo(e, t = this.tiempo) {
        return e.jugadores.some(j => this.vivo(e, j, t));
    }

    // Bajas de cada equipo hasta el instante t
    bajasHasta(t = this.tiempo) {
        const n = {};
        this.replay.equipos.forEach(e => { n[e.id] = 0; });
        const porNombre = {};
        this.replay.equipos.forEach(e => { porNombre[e.nombre] = e.id; });
        this.replay.bajas.forEach(b => { if (b.t <= t && porNombre[b.equipoMatador] != null) n[porNombre[b.equipoMatador]]++; });
        return n;
    }

    // Zona azul (la que hace daño) en el instante t
    // Mientras el juego no anuncia la primera zona no hay zona que mostrar.
    // Al cerrarse, el círculo azul pasa del círculo anterior al nuevo
    // interpolando centro y radio a la vez: se encoge de forma pareja y
    // siempre contiene al círculo nuevo (el nuevo está dentro del anterior).
    zonaActual(t = this.tiempo) {
        const z = this.replay.zonas;
        const primera = z.find(x => !x.inicial);
        if (!primera || t < primera.anunciadaEn) return null;
        let previa = null;
        for (const zona of z) {
            const ini = zona.inicioCierre ?? zona.anunciadaEn, fin = zona.finCierre ?? ini;
            if (t < ini) return previa;
            if (t <= fin) {
                if (!previa) return zona;
                const f = (t - ini) / ((fin - ini) || 1);
                return { x: previa.x + (zona.x - previa.x) * f, y: previa.y + (zona.y - previa.y) * f, r: previa.r + (zona.r - previa.r) * f, fase: zona.fase };
            }
            previa = zona;
        }
        return previa;
    }

    // Próxima zona segura anunciada (círculo blanco)
    zonaSiguiente(t = this.tiempo) {
        return [...this.replay.zonas].reverse().find(z => !z.inicial && z.anunciadaEn <= t && t < (z.finCierre ?? z.anunciadaEn)) || null;
    }

    faseActual(t = this.tiempo) {
        return [...this.replay.zonas].reverse().find(z => !z.inicial && z.anunciadaEn <= t) || null;
    }

    // ---------- Cámara ----------
    medir() {
        const r = this.cv.parentElement.getBoundingClientRect();
        if (!r.width || !r.height) return;
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        this.cv.width = Math.round(r.width * dpr);
        this.cv.height = Math.round(r.height * dpr);
        this.cv.style.width = r.width + 'px';
        this.cv.style.height = r.height + 'px';
        this.cx.setTransform(dpr, 0, 0, dpr, 0, 0);
        this.W = r.width; this.H = r.height;
        this.base = Math.min(r.width, r.height) / MS_ANCHO * 0.98;
        this.dibujar();
    }

    get k() { return this.base * this.vista.z; }
    get ox() { return (this.W - MS_ANCHO * this.base) / 2 + this.vista.x; }
    get oy() { return (this.H - MS_ANCHO * this.base) / 2 + this.vista.y; }

    zoom(f, sx = this.W / 2, sy = this.H / 2) {
        const lx = (sx - this.ox) / this.k, ly = (sy - this.oy) / this.k;
        this.vista.z = Math.min(10, Math.max(1, this.vista.z * f));
        this.vista.x += sx - (this.ox + lx * this.k);
        this.vista.y += sy - (this.oy + ly * this.k);
        this.dibujar();
    }

    centrar() { this.vista = { z: 1, x: 0, y: 0 }; this.seguir = null; this.dibujar(); }

    // Centra la cámara en el promedio de los jugadores vivos del equipo seguido
    _seguirCamara() {
        const e = this.replay.equipos.find(x => x.id === this.seguir);
        if (!e) return;
        const ps = e.jugadores.filter(j => this.vivo(e, j)).map(j => this.posicion(j)).filter(Boolean);
        if (!ps.length) return;
        const cx = ps.reduce((s, p) => s + p.x, 0) / ps.length, cy = ps.reduce((s, p) => s + p.y, 0) / ps.length;
        if (this.vista.z < 2.5) this.vista.z = 2.5;
        const k = this.k;
        const objX = this.W / 2 - ((this.W - MS_ANCHO * this.base) / 2 + cx * k);
        const objY = this.H / 2 - ((this.H - MS_ANCHO * this.base) / 2 + cy * k);
        this.vista.x += (objX - this.vista.x) * 0.15;
        this.vista.y += (objY - this.vista.y) * 0.15;
    }

    // ---------- Dibujo ----------
    dibujar() {
        const c = this.cx;
        if (!this.W) return;
        c.clearRect(0, 0, this.W, this.H);
        c.fillStyle = '#04050a';
        c.fillRect(0, 0, this.W, this.H);
        if (!this.replay) return;
        if (this.seguir != null) this._seguirCamara();
        const k = this.k, OX = this.ox, OY = this.oy, L = MS_ANCHO * k;
        const P = p => ({ x: OX + p.x * k, y: OY + p.y * k });
        const t = this.tiempo;

        if (this.fondo) c.drawImage(this.fondo, OX, OY, L, L);
        else { c.fillStyle = '#0c0d12'; c.fillRect(OX, OY, L, L); }
        c.strokeStyle = 'rgba(0, 240, 255, 0.35)'; c.lineWidth = 1; c.strokeRect(OX, OY, L, L);

        // Avión
        const av = this.replay.avion;
        if (this.capas.avion && av && av.a && av.b && t < this.inicioAccion + 60) {
            const a = P(av.a), b = P(av.b);
            c.save();
            c.strokeStyle = 'rgba(255,255,255,0.5)'; c.setLineDash([10, 8]); c.lineWidth = 2;
            c.beginPath(); c.moveTo(a.x, a.y); c.lineTo(b.x, b.y); c.stroke();
            c.restore();
        }

        // Zona: fuera de la zona azul se oscurece; la siguiente en blanco
        if (this.capas.zona) {
            const z = this.zonaActual(), s = this.zonaSiguiente();
            // Fases ya cerradas: anillos tenues numerados
            if (this.capas.fasesPrevias) {
                this.replay.zonas.filter(x => !x.inicial && x.finCierre != null && x.finCierre <= t).forEach(x => {
                    const p = P(x);
                    c.save();
                    c.strokeStyle = 'rgba(255, 255, 255, 0.28)'; c.lineWidth = 1;
                    c.beginPath(); c.arc(p.x, p.y, x.r * k, 0, Math.PI * 2); c.stroke();
                    c.restore();
                });
            }
            if (z) {
                const p = P(z);
                c.save();
                c.beginPath(); c.rect(OX, OY, L, L); c.arc(p.x, p.y, z.r * k, 0, Math.PI * 2, true);
                c.fillStyle = 'rgba(40, 70, 200, 0.28)'; c.fill('evenodd');
                c.strokeStyle = 'rgba(80, 140, 255, 0.95)'; c.lineWidth = 2.5;
                c.beginPath(); c.arc(p.x, p.y, z.r * k, 0, Math.PI * 2); c.stroke();
                c.restore();
            }
            if (s) {
                const p = P(s);
                c.save();
                c.strokeStyle = 'rgba(255, 255, 255, 0.95)'; c.lineWidth = 2; c.setLineDash([8, 6]);
                c.beginPath(); c.arc(p.x, p.y, s.r * k, 0, Math.PI * 2); c.stroke();
                c.restore();
            }
        }

        const atenuar = e => this.foco.size && !this.foco.has(e.id);
        const visibles = this.replay.equipos.filter(e => !this.ocultos.has(e.id));

        // Bajas recientes: anillo que se apaga en 4 s; las viejas quedan como una cruz tenue
        if (this.capas.bajas) {
            this.replay.bajas.forEach(b => {
                if (b.t > t || b.x == null) return;
                const p = P(b), edad = t - b.t;
                c.save();
                if (edad < 4) {
                    c.strokeStyle = `rgba(255, 80, 80, ${1 - edad / 4})`; c.lineWidth = 2;
                    c.beginPath(); c.arc(p.x, p.y, 6 + edad * 6, 0, Math.PI * 2); c.stroke();
                }
                c.strokeStyle = 'rgba(255, 90, 90, 0.55)'; c.lineWidth = 1.5;
                const d = 4;
                c.beginPath(); c.moveTo(p.x - d, p.y - d); c.lineTo(p.x + d, p.y + d); c.moveTo(p.x + d, p.y - d); c.lineTo(p.x - d, p.y + d); c.stroke();
                c.restore();
            });
        }

        // Estelas
        if (this.capas.estelas) {
            visibles.forEach(e => {
                c.save();
                c.globalAlpha = atenuar(e) ? 0.12 : 0.55;
                c.strokeStyle = e.color; c.lineWidth = Math.max(1.5, k * 1.6); c.lineJoin = c.lineCap = 'round';
                e.jugadores.forEach(j => {
                    if (!this.vivo(e, j)) return;
                    const desde = t - this.estela;
                    const qs = j.pos.filter(q => q[0] >= desde && q[0] <= t);
                    const ahora = this.posicion(j);
                    if (ahora) qs.push([t, ahora.x, ahora.y]);
                    if (qs.length < 2) return;
                    c.beginPath();
                    qs.forEach((q, i) => {
                        const p = P({ x: q[1], y: q[2] });
                        if (i === 0 || q[0] - qs[i - 1][0] > MS_HUECO) c.moveTo(p.x, p.y); else c.lineTo(p.x, p.y);
                    });
                    c.stroke();
                });
                c.restore();
            });
        }

        // Jugadores
        const R = Math.max(4.5, Math.min(9, k * 6));
        visibles.forEach(e => {
            const tenue = atenuar(e);
            const ps = [];
            e.jugadores.forEach(j => {
                if (!this.vivo(e, j)) return;
                const q = this.posicion(j);
                if (!q) return;
                const p = P(q);
                ps.push(p);
                c.save();
                c.globalAlpha = tenue ? 0.25 : 1;
                c.shadowColor = e.color; c.shadowBlur = tenue ? 0 : 8;
                c.fillStyle = e.color;
                c.beginPath(); c.arc(p.x, p.y, R, 0, Math.PI * 2); c.fill();
                c.shadowBlur = 0;
                c.lineWidth = 1.5; c.strokeStyle = '#04050a'; c.stroke();
                c.restore();
            });
            // Nombre del equipo sobre el grupo (con zoom o si está en foco/seguido)
            if (this.capas.nombres && ps.length && !tenue && (this.vista.z >= 1.8 || this.foco.has(e.id) || this.seguir === e.id)) {
                const cx = ps.reduce((s, p) => s + p.x, 0) / ps.length, cy = Math.min(...ps.map(p => p.y)) - R - 10;
                this._etiqueta(c, e.nombre, cx, cy, e.color);
            }
        });
    }

    _etiqueta(c, txt, x, y, color) {
        c.save();
        c.font = `700 11px ${MS_FUENTE}`;
        c.textAlign = 'center'; c.textBaseline = 'middle';
        const w = c.measureText(txt).width + 12;
        c.fillStyle = 'rgba(4, 5, 10, 0.88)';
        c.fillRect(x - w / 2, y - 9, w, 18);
        c.fillStyle = color; c.fillRect(x - w / 2, y - 9, 3, 18);
        c.fillStyle = '#fff'; c.fillText(txt, x + 1, y + 0.5);
        c.restore();
    }

    // ---------- Interacción: zoom con rueda/pellizco, arrastrar para mover ----------
    _eventos() {
        const cv = this.cv;
        let arr = null;
        const dedos = new Map();
        let pellizco = null;
        cv.addEventListener('pointerdown', ev => {
            dedos.set(ev.pointerId, ev);
            cv.setPointerCapture(ev.pointerId);
            arr = { x: ev.clientX, y: ev.clientY, vx: this.vista.x, vy: this.vista.y };
            this.seguir = null;
        });
        cv.addEventListener('pointermove', ev => {
            if (dedos.has(ev.pointerId)) dedos.set(ev.pointerId, ev);
            if (dedos.size === 2) {
                const [a, b] = [...dedos.values()];
                const d = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
                if (pellizco) { this.vista.z = Math.min(10, Math.max(1, pellizco.z * d / pellizco.d)); this.dibujar(); }
                else pellizco = { d, z: this.vista.z };
                return;
            }
            if (!arr) return;
            this.vista.x = arr.vx + ev.clientX - arr.x;
            this.vista.y = arr.vy + ev.clientY - arr.y;
            this.dibujar();
        });
        const soltar = ev => { dedos.delete(ev.pointerId); if (dedos.size < 2) pellizco = null; arr = null; };
        cv.addEventListener('pointerup', soltar);
        cv.addEventListener('pointercancel', soltar);
        cv.addEventListener('wheel', ev => {
            ev.preventDefault();
            const r = cv.getBoundingClientRect();
            this.zoom(ev.deltaY < 0 ? 1.15 : 0.87, ev.clientX - r.left, ev.clientY - r.top);
        }, { passive: false });
    }

    // ---------- Exportar el cuadro actual ----------
    capturaPNG() {
        return new Promise(res => this.cv.toBlob(res, 'image/png'));
    }

    // ---------- Conversión desde QG Pro ----------
    // Lo conocido del formato de QG Pro: times/jogadores, safes (anunciada_em),
    // killfeed y duracao. Las posiciones las arma su servidor a partir del .bin;
    // si vienen en jogadores[].posicoes como [[t, x, y]] se usan tal cual.
    static desdeQGPro(r) {
        const mapas = { bermuda: 'Bermuda', purgatorio: 'Purgatorio', kalahari: 'Kalahari', 'nova terra': 'Nexterra', nexterra: 'Nexterra', solara: 'Solara' };
        const muertes = r.mortes || [];
        return {
            mapa: mapas[String(r.map_key || '').toLowerCase()] || r.map_key || 'Bermuda',
            nombre: r.room_name || (r.match_id ? `Partida ${r.match_id}` : 'Partida'),
            fecha: r.match_date_time || '',
            duracion: r.duracao,
            equipos: (r.times || []).map(tm => ({
                id: tm.id, nombre: tm.nome, eliminadoEn: tm.eliminado_em ?? null,
                jugadores: (tm.jogadores || []).map(j => ({
                    nombre: j.nome ?? j,
                    muerteEn: (muertes.find(m => m.time === tm.nome && m.jogador === (j.nome ?? j)) || {}).tempo ?? null,
                    pos: j.posicoes || j.pos || []
                }))
            })),
            zonas: (r.safes || []).map(s => ({
                fase: s.fase, anunciadaEn: s.anunciada_em, inicioCierre: s.inicio_fechamento ?? s.anunciada_em,
                finCierre: s.fim_fechamento ?? s.anunciada_em, x: s.x, y: s.y, r: s.r ?? s.raio
            })).filter(z => z.x != null && z.r != null),
            bajas: (r.killfeed || []).map(k => ({
                t: k.tempo, matador: k.matador, equipoMatador: k.time_matador, victima: k.vitima, equipoVictima: k.time_vitima, arma: k.arma, x: k.x, y: k.y
            }))
        };
    }

    // ---------- Partida de demostración ----------
    // Datos inventados (deterministas) solo para probar el visor
    static demo(mapa = 'Bermuda', equipos = 12) {
        let s = 20261010;
        const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
        const entre = (a, b) => a + rnd() * (b - a);
        const fases = [[300, 360, 290], [480, 540, 190], [620, 670, 105], [740, 780, 52], [840, 870, 22], [920, 950, 5]];
        const zonas = [];
        let zx = entre(380, 620), zy = entre(380, 620);
        fases.forEach(([ini, fin, r], i) => {
            zx += entre(-0.4, 0.4) * (i ? fases[i - 1][2] - r : 120);
            zy += entre(-0.4, 0.4) * (i ? fases[i - 1][2] - r : 120);
            zonas.push({ fase: i + 1, anunciadaEn: ini - 60, inicioCierre: ini, finCierre: fin, x: zx, y: zy, r });
        });
        const duracion = 1000;
        const avion = { a: { x: entre(50, 200), y: entre(80, 300) }, b: { x: entre(800, 950), y: entre(700, 920) } };
        const nombres = ['Pumas Elite', 'Pumas Academy', 'Rivales A', 'Fénix', 'Lobos', 'Titanes', 'Cobra', 'Nova', 'Vortex', 'Orión', 'Spartans', 'Kraken'];
        // Orden de eliminación: el último sobreviviente es el ganador
        const salida = Array.from({ length: equipos }, (_, i) => i).sort(() => rnd() - 0.5);
        const finEquipo = {};
        salida.forEach((id, n) => { finEquipo[id] = n === equipos - 1 ? null : Math.round(180 + (n / (equipos - 1)) * 760 + entre(-20, 20)); });

        const lista = [], bajas = [];
        for (let id = 0; id < equipos; id++) {
            const f = entre(0.1, 0.9);
            const caida = { x: avion.a.x + (avion.b.x - avion.a.x) * f + entre(-160, 160), y: avion.a.y + (avion.b.y - avion.a.y) * f + entre(-160, 160) };
            caida.x = Math.min(950, Math.max(50, caida.x)); caida.y = Math.min(950, Math.max(50, caida.y));
            const tCaida = 40 + f * 50;
            const fin = finEquipo[id];
            const jugadores = [0, 1, 2, 3].map(n => {
                // Algunos caen antes que su equipo
                const muerteEn = fin == null ? (n === 3 && rnd() < 0.5 ? Math.round(entre(500, 900)) : null)
                    : (n === 0 ? fin : Math.round(Math.max(tCaida + 30, fin - entre(0, 140))));
                const pos = [];
                let x = caida.x + entre(-15, 15), y = caida.y + entre(-15, 15);
                for (let t = tCaida; t <= (muerteEn ?? duracion); t += 5) {
                    const z = zonas.find(zz => t < zz.finCierre) || zonas[zonas.length - 1];
                    const dx = z.x - x, dy = z.y - y, d = Math.hypot(dx, dy) || 1;
                    const vel = t < 160 ? 0.6 : d > z.r * 0.6 ? 9 : 2;
                    x += dx / d * vel * 5 * entre(0.3, 1) + entre(-6, 6);
                    y += dy / d * vel * 5 * entre(0.3, 1) + entre(-6, 6);
                    pos.push([Math.round(t), Math.round(x * 10) / 10, Math.round(y * 10) / 10]);
                }
                return { nombre: `${nombres[id].split(' ')[0].slice(0, 4).toUpperCase()}.${['Rush', 'Sniper', 'Gran', 'Sop'][n]}`, muerteEn, pos };
            });
            lista.push({ id, nombre: nombres[id] || `Equipo ${id + 1}`, posicion: equipos - salida.indexOf(id), eliminadoEn: fin, jugadores });
        }
        // Cada muerte se la anota un equipo que siga vivo en ese momento
        const armas = ['M1887', 'MP40', 'AWM', 'Granada', 'Woodpecker', 'UMP', 'SCAR'];
        lista.forEach(e => e.jugadores.forEach(j => {
            if (j.muerteEn == null) return;
            const vivos = lista.filter(o => o.id !== e.id && (o.eliminadoEn == null || o.eliminadoEn > j.muerteEn));
            const asesino = vivos[Math.floor(rnd() * vivos.length)] || lista[0];
            const ult = j.pos[j.pos.length - 1] || [0, 500, 500];
            bajas.push({ t: j.muerteEn, matador: asesino.jugadores[Math.floor(rnd() * 4)].nombre, equipoMatador: asesino.nombre,
                victima: j.nombre, equipoVictima: e.nombre, arma: armas[Math.floor(rnd() * armas.length)], x: ult[1], y: ult[2] });
        }));
        return { mapa, nombre: `Demo · ${mapa}`, fecha: new Date().toISOString().slice(0, 10), duracion, avion, equipos: lista, zonas, bajas, demo: true };
    }
}

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



if (typeof window !== 'undefined') { window.MapStream = MapStream; window.FFReplay = FFReplay; }
if (typeof module !== 'undefined') module.exports = { MapStream, FFReplay };
})();
