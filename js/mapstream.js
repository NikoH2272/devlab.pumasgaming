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
