// ============================================================
// PUMAS DEV LAB · Tablero (motor de dibujo sobre lienzo)
// ------------------------------------------------------------
// Lo usan Estrategia > Mapas y Estrategia > Vistas aéreas.
// Todo se guarda en coordenadas lógicas (1000 de ancho), no en
// píxeles: el plano se ve igual en un celular y en un monitor, y al
// exportar en alta resolución nada se descoloca.
// ============================================================

const TB_ANCHO = 1000;
const TB_FUENTE = "'Orbitron', sans-serif";
const TB_FA = '"Font Awesome 6 Free"';

const TB_HERRAMIENTAS = {
    mover:    { n: 'Mover',         i: 'fa-up-down-left-right', pista: 'Arrastra una marca para moverla · doble clic en un texto para editarlo · arrastra el fondo para desplazarte' },
    caida:    { n: 'Caída',         i: 'fa-location-dot',  mapa: true, pista: 'Elige un equipo en la lista y toca el mapa donde cae' },
    ruta:     { n: 'Rotación',      i: 'fa-route',         mapa: true, pista: 'La rotación sale de la caída del equipo · toca las paradas en orden' },
    caliente: { n: 'Zona caliente', i: 'fa-fire',          pista: 'Toca y arrastra para marcar el radio de una zona disputada' },
    segura:   { n: 'Zona segura',   i: 'fa-circle-dot',    mapa: true, pista: 'Marca las fases de zona en orden (máx. 6) · el radio sale de la medida real' },
    avion:    { n: 'Avión',         i: 'fa-plane',         mapa: true, pista: 'Toca la entrada del avión y luego la salida' },
    jugador:  { n: 'Jugador',       i: 'fa-user',          pista: 'Toca para colocar a tus jugadores numerados' },
    icono:    { n: 'Ícono',         i: 'fa-icons',         pista: 'Elige un ícono abajo y toca el mapa para colocarlo' },
    texto:    { n: 'Texto',         i: 'fa-font',          pista: 'Toca donde quieras escribir' },
    rect:     { n: 'Rectángulo',    i: 'fa-square',        pista: 'Arrastra para dibujar un rectángulo' },
    elipse:   { n: 'Círculo',       i: 'fa-circle',        pista: 'Arrastra para dibujar un círculo' },
    flecha:   { n: 'Flecha',        i: 'fa-arrow-right-long', pista: 'Arrastra desde el inicio hasta la punta' },
    linea:    { n: 'Línea',         i: 'fa-minus',         pista: 'Arrastra para trazar una línea recta' },
    trazo:    { n: 'Lápiz',         i: 'fa-pen',           pista: 'Dibuja a mano alzada' },
    logo:     { n: 'Logo',          i: 'fa-image',         pista: 'Elige un logo abajo y toca para colocarlo' },
    borrar:   { n: 'Borrar',        i: 'fa-eraser',        pista: 'Toca una marca para eliminarla' }
};

// Íconos de Font Awesome que se dibujan en el lienzo
const TB_ICONOS = {
    lanzadera: { n: 'Lanzadera',  u: '' },
    portal:    { n: 'Portal',     u: '' },
    vehiculo:  { n: 'Vehículo',   u: '' },
    moto:      { n: 'Moto',       u: '' },
    tienda:    { n: 'Tienda',     u: '' },
    airdrop:   { n: 'Airdrop',    u: '' },
    botiquin:  { n: 'Botiquín',   u: '' },
    casa:      { n: 'Edificio',   u: '' },
    objetivo:  { n: 'Objetivo',   u: '' },
    peligro:   { n: 'Peligro',    u: '' },
    calavera:  { n: 'Baja',       u: '' },
    escudo:    { n: 'Defensa',    u: '' },
    ojo:       { n: 'Vigía',      u: '' },
    bandera:   { n: 'Bandera',    u: '' },
    estrella:  { n: 'Clave',      u: '' }
};

class Tablero {
    constructor(canvas, { modo = 'mapa', alCambiar = () => {}, alSeleccionarEquipo = () => {} } = {}) {
        this.cv = canvas;
        this.cx = canvas.getContext('2d');
        this.modo = modo;
        this.alCambiar = alCambiar;
        this.alSeleccionarEquipo = alSeleccionarEquipo;
        this.doc = Tablero.docVacio();
        this.fondo = null;              // Image del fondo
        this.etiquetaFondo = '';        // texto en la cuadrícula si no hay imagen
        this.herr = 'mover';
        this.estilo = { color: '#00f0ff', grosor: 4, relleno: false, icono: 'objetivo', logo: null };
        this.equipoSel = null;
        this.vista = { z: 1, x: 0, y: 0 };
        this.historial = [];
        this.arrastre = null;
        this.seleccion = null;
        this.imagenes = {};             // cache de logos (src -> Image)
        this.dedos = new Map();
        this.pellizco = null;
        this.medir = this.medir.bind(this);
        this._eventos();
        new ResizeObserver(this.medir).observe(canvas.parentElement);
        if (document.fonts) document.fonts.load(`900 20px ${TB_FA}`).then(() => this.dibujar()).catch(() => {});
    }

    static docVacio(alto = TB_ANCHO) {
        return { alto, objetos: [], equipos: [] };
    }

    // ---------- Documento ----------
    cargar(doc, fondoSrc) {
        this.doc = Object.assign(Tablero.docVacio(), JSON.parse(JSON.stringify(doc || {})));
        this.historial = [];
        this.seleccion = null;
        this.vista = { z: 1, x: 0, y: 0 };
        this.equipoSel = this.doc.equipos[0]?.id || null;
        this.ponerFondo(fondoSrc);
        this.alSeleccionarEquipo(this.equipoSel);
    }

    ponerFondo(src) {
        this.fondo = null;
        // Se mide en el siguiente cuadro: la vista pudo hacerse visible recién
        if (!src) { this.medir(); requestAnimationFrame(this.medir); return; }
        const im = new Image();
        im.onload = () => {
            this.fondo = im;
            // Las vistas aéreas conservan la proporción de su imagen
            if (this.modo === 'aerea') this.doc.alto = Math.round(TB_ANCHO * im.naturalHeight / im.naturalWidth);
            this.medir();
        };
        im.src = src;
    }

    imagen(src) {
        if (!src) return null;
        if (!this.imagenes[src]) {
            const im = new Image();
            im.onload = () => this.dibujar();
            im.src = src;
            this.imagenes[src] = im;
        }
        const im = this.imagenes[src];
        return im.complete && im.naturalWidth ? im : null;
    }

    instantanea() {
        this.historial.push(JSON.stringify({ objetos: this.doc.objetos, equipos: this.doc.equipos }));
        if (this.historial.length > 50) this.historial.shift();
    }

    deshacer() {
        const s = this.historial.pop();
        if (!s) return;
        Object.assign(this.doc, JSON.parse(s));
        this.seleccion = null;
        this.cambio();
    }

    cambio() {
        this.dibujar();
        this.alCambiar();
    }

    // ---------- Equipos (modo mapa) ----------
    agregarEquipo(eq) {
        if (this.doc.equipos.some(e => e.id === eq.id)) return;
        this.instantanea();
        this.doc.equipos.push(eq);
        if (!this.equipoSel) this.seleccionarEquipo(eq.id);
        this.cambio();
    }

    quitarEquipo(id) {
        this.instantanea();
        this.doc.equipos = this.doc.equipos.filter(e => e.id !== id);
        this.doc.objetos = this.doc.objetos.filter(o => o.eq !== id);
        if (this.equipoSel === id) this.seleccionarEquipo(this.doc.equipos[0]?.id || null);
        this.cambio();
    }

    seleccionarEquipo(id) {
        this.equipoSel = id;
        this.alSeleccionarEquipo(id);
        this.dibujar();
    }

    equipo(id) {
        return this.doc.equipos.find(e => e.id === id) || null;
    }

    caidaDe(id) {
        return this.doc.objetos.find(o => o.t === 'caida' && o.eq === id) || null;
    }

    rutaDe(id) {
        return this.doc.objetos.find(o => o.t === 'ruta' && o.eq === id) || null;
    }

    // ---------- Medidas y transformación ----------
    medir() {
        const r = this.cv.parentElement.getBoundingClientRect();
        if (!r.width || !r.height) return;
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        this.cv.width = Math.round(r.width * dpr);
        this.cv.height = Math.round(r.height * dpr);
        this.cv.style.width = r.width + 'px';
        this.cv.style.height = r.height + 'px';
        this.cx.setTransform(dpr, 0, 0, dpr, 0, 0);
        this.W = r.width;
        this.H = r.height;
        this.base = Math.min(r.width / TB_ANCHO, r.height / this.doc.alto) * 0.96;
        this.dibujar();
    }

    get k() { return this.base * this.vista.z; }
    get ox() { return (this.W - TB_ANCHO * this.base) / 2 + this.vista.x; }
    get oy() { return (this.H - this.doc.alto * this.base) / 2 + this.vista.y; }

    aLogico(sx, sy) {
        return { x: (sx - this.ox) / this.k, y: (sy - this.oy) / this.k };
    }

    zoom(factor, sx = this.W / 2, sy = this.H / 2) {
        const antes = this.aLogico(sx, sy);
        this.vista.z = Math.min(8, Math.max(1, this.vista.z * factor));
        this.vista.x += sx - (this.ox + antes.x * this.k);
        this.vista.y += sy - (this.oy + antes.y * this.k);
        this.dibujar();
    }

    centrar() {
        this.vista = { z: 1, x: 0, y: 0 };
        this.dibujar();
    }

    // ---------- Dibujo ----------
    dibujar(ctx, exportar) {
        const c = ctx || this.cx;
        const k = exportar ? exportar.k : this.k;
        const OX = exportar ? 0 : this.ox;
        const OY = exportar ? 0 : this.oy;
        const W = exportar ? exportar.W : this.W;
        const H = exportar ? exportar.H : this.H;
        if (!W || !H) return;
        const P = p => ({ x: OX + p.x * k, y: OY + p.y * k });
        const L = TB_ANCHO * k, A = this.doc.alto * k;

        c.clearRect(0, 0, W, H);
        c.fillStyle = '#050508';
        c.fillRect(0, 0, W, H);

        if (this.fondo) c.drawImage(this.fondo, OX, OY, L, A);
        else this._cuadricula(c, OX, OY, L, A);
        c.strokeStyle = 'rgba(0, 240, 255, 0.35)';
        c.lineWidth = 1;
        c.strokeRect(OX, OY, L, A);

        // Orden de capas: zonas debajo, marcas de equipos y jugadores encima
        const orden = ['caliente', 'segura', 'avion', 'rect', 'elipse', 'trazo', 'linea', 'flecha', 'ruta', 'icono', 'logo', 'caida', 'jugador', 'texto'];
        const objs = [...this.doc.objetos].sort((a, b) => orden.indexOf(a.t) - orden.indexOf(b.t));
        objs.forEach(o => this._objeto(c, o, P, k));

        if (!exportar && this.seleccion) this._marcoSeleccion(c, this.seleccion, P, k);
    }

    _cuadricula(c, OX, OY, L, A) {
        c.fillStyle = '#0c0d12';
        c.fillRect(OX, OY, L, A);
        c.strokeStyle = 'rgba(0, 240, 255, 0.08)';
        c.lineWidth = 1;
        const filas = Math.round(10 * A / L);
        for (let i = 0; i <= 10; i++) {
            const x = OX + L / 10 * i;
            c.beginPath(); c.moveTo(x, OY); c.lineTo(x, OY + A); c.stroke();
        }
        for (let j = 0; j <= filas; j++) {
            const y = OY + A / filas * j;
            c.beginPath(); c.moveTo(OX, y); c.lineTo(OX + L, y); c.stroke();
        }
        c.fillStyle = 'rgba(176, 181, 192, 0.35)';
        c.font = `${Math.max(9, L * 0.016)}px ${TB_FUENTE}`;
        c.textAlign = 'center';
        c.textBaseline = 'middle';
        for (let i = 0; i < 10; i++) c.fillText('ABCDEFGHIJ'[i], OX + L / 10 * (i + 0.5), OY + L * 0.025);
        for (let j = 0; j < filas; j++) c.fillText(String(j + 1), OX + L * 0.022, OY + A / filas * (j + 0.5));
        c.fillStyle = 'rgba(0, 240, 255, 0.25)';
        c.font = `900 ${Math.max(14, L * 0.05)}px ${TB_FUENTE}`;
        c.fillText(this.etiquetaFondo.toUpperCase(), OX + L / 2, OY + A / 2 - L * 0.02);
        c.fillStyle = 'rgba(176, 181, 192, 0.35)';
        c.font = `${Math.max(9, L * 0.016)}px ${TB_FUENTE}`;
        c.fillText(this.modo === 'mapa' ? 'SUBE LA IMAGEN DEL MAPA EN EL PANEL' : 'SUBE UNA IMAGEN AÉREA EN EL PANEL', OX + L / 2, OY + A / 2 + L * 0.04);
    }

    _etiqueta(c, texto, x, y, k, colorBorde) {
        const t = Math.max(9, k * 11);
        c.font = `700 ${t}px ${TB_FUENTE}`;
        c.textAlign = 'center';
        c.textBaseline = 'middle';
        const w = c.measureText(texto).width + t;
        c.fillStyle = 'rgba(5, 5, 8, 0.88)';
        c.fillRect(x - w / 2, y - t * 0.75, w, t * 1.5);
        if (colorBorde) {
            c.fillStyle = colorBorde;
            c.fillRect(x - w / 2, y - t * 0.75, Math.max(2, k * 2.5), t * 1.5);
        }
        c.fillStyle = '#ffffff';
        c.fillText(texto, x, y + 0.5);
    }

    _objeto(c, o, P, k) {
        c.save();
        c.lineJoin = c.lineCap = 'round';
        switch (o.t) {
            case 'caliente': {
                const p = P(o), r = o.r * k;
                const g = c.createRadialGradient(p.x, p.y, 0, p.x, p.y, r);
                g.addColorStop(0, 'rgba(230, 70, 70, 0.45)');
                g.addColorStop(0.65, 'rgba(230, 70, 70, 0.16)');
                g.addColorStop(1, 'rgba(230, 70, 70, 0)');
                c.fillStyle = g;
                c.beginPath(); c.arc(p.x, p.y, r, 0, 7); c.fill();
                c.strokeStyle = 'rgba(255, 110, 100, 0.6)';
                c.lineWidth = 1.5;
                c.setLineDash([5, 4]);
                c.beginPath(); c.arc(p.x, p.y, r, 0, 7); c.stroke();
                break;
            }
            case 'segura': {
                const p = P(o), r = o.r * k;
                c.strokeStyle = 'rgba(255, 255, 255, 0.85)';
                c.lineWidth = Math.max(1.5, k * 2.2);
                c.setLineDash([k * 9, k * 6]);
                c.beginPath(); c.arc(p.x, p.y, r, 0, 7); c.stroke();
                c.setLineDash([]);
                c.fillStyle = 'rgba(255, 255, 255, 0.05)';
                c.fill();
                const fase = TB_ZONAS[o.n - 1];
                const txt = `Z${o.n}` + (fase && this.modo === 'mapa' ? `  ${Math.round(diametroZona(o.n, this.mapaActual))} m  ${relojTxt(fase.fin)}` : '');
                this._etiqueta(c, txt, p.x, p.y - r - Math.max(9, k * 11), k, '#00f0ff');
                break;
            }
            case 'avion': {
                if (!o.a) break;
                const A = P(o.a);
                if (!o.b) {
                    c.fillStyle = '#ffffff';
                    c.beginPath(); c.arc(A.x, A.y, Math.max(5, k * 6), 0, 7); c.fill();
                    break;
                }
                const B = P(o.b);
                const dx = B.x - A.x, dy = B.y - A.y, ln = Math.hypot(dx, dy) || 1;
                const ext = TB_ANCHO * k * 1.5;
                c.strokeStyle = 'rgba(255, 255, 255, 0.55)';
                c.lineWidth = Math.max(1.5, k * 2.2);
                c.setLineDash([k * 14, k * 9]);
                c.beginPath();
                c.moveTo(A.x - dx / ln * ext, A.y - dy / ln * ext);
                c.lineTo(B.x + dx / ln * ext, B.y + dy / ln * ext);
                c.stroke();
                c.setLineDash([]);
                this._icono(c, '', B.x, B.y, Math.max(12, k * 18), '#ffffff', Math.atan2(dy, dx) - Math.PI / 4);
                this._etiqueta(c, 'RUTA DEL AVIÓN', A.x, A.y - Math.max(12, k * 16), k);
                break;
            }
            case 'rect': {
                const a = P(o.a), b = P(o.b);
                c.strokeStyle = o.color;
                c.lineWidth = Math.max(1, o.grosor * k);
                if (o.relleno) {
                    c.globalAlpha = 0.35; c.fillStyle = o.color;
                    c.fillRect(a.x, a.y, b.x - a.x, b.y - a.y);
                    c.globalAlpha = 1;
                }
                c.strokeRect(a.x, a.y, b.x - a.x, b.y - a.y);
                break;
            }
            case 'elipse': {
                const a = P(o.a), b = P(o.b);
                c.strokeStyle = o.color;
                c.lineWidth = Math.max(1, o.grosor * k);
                c.beginPath();
                c.ellipse((a.x + b.x) / 2, (a.y + b.y) / 2, Math.abs(b.x - a.x) / 2, Math.abs(b.y - a.y) / 2, 0, 0, 7);
                if (o.relleno) { c.globalAlpha = 0.35; c.fillStyle = o.color; c.fill(); c.globalAlpha = 1; }
                c.stroke();
                break;
            }
            case 'linea':
            case 'flecha': {
                const a = P(o.a), b = P(o.b);
                c.strokeStyle = c.fillStyle = o.color;
                c.lineWidth = Math.max(1, o.grosor * k);
                c.shadowColor = 'rgba(0,0,0,0.7)'; c.shadowBlur = k * 4;
                c.beginPath(); c.moveTo(a.x, a.y); c.lineTo(b.x, b.y); c.stroke();
                if (o.t === 'flecha') this._punta(c, a, b, Math.max(8, o.grosor * k * 3.5));
                break;
            }
            case 'trazo': {
                if (o.pts.length < 2) break;
                const pts = o.pts.map(P);
                c.strokeStyle = o.color;
                c.lineWidth = Math.max(1, o.grosor * k);
                c.beginPath(); c.moveTo(pts[0].x, pts[0].y);
                pts.slice(1).forEach(p => c.lineTo(p.x, p.y));
                c.stroke();
                break;
            }
            case 'ruta': {
                const eq = this.equipo(o.eq);
                const caida = this.caidaDe(o.eq);
                const camino = (caida ? [caida, ...o.pts] : o.pts).map(P);
                if (!eq || camino.length < 2) break;
                c.strokeStyle = c.fillStyle = eq.color;
                c.lineWidth = Math.max(2, k * 4.5);
                c.shadowColor = 'rgba(0,0,0,0.8)'; c.shadowBlur = k * 6;
                c.beginPath(); c.moveTo(camino[0].x, camino[0].y);
                camino.slice(1).forEach(p => c.lineTo(p.x, p.y));
                c.stroke();
                c.shadowBlur = 0;
                this._punta(c, camino[camino.length - 2], camino[camino.length - 1], Math.max(8, k * 13));
                camino.slice(1, -1).forEach((p, i) => {
                    const r = Math.max(6, k * 8);
                    c.fillStyle = '#050508';
                    c.beginPath(); c.arc(p.x, p.y, r, 0, 7); c.fill();
                    c.strokeStyle = eq.color; c.lineWidth = 2; c.stroke();
                    c.fillStyle = '#ffffff';
                    c.font = `700 ${Math.max(8, k * 9)}px ${TB_FUENTE}`;
                    c.textAlign = 'center'; c.textBaseline = 'middle';
                    c.fillText(String(i + 2), p.x, p.y + 0.5);
                });
                break;
            }
            case 'icono': {
                const p = P(o), r = Math.max(9, (o.s || 14) * k);
                c.fillStyle = 'rgba(5, 5, 8, 0.85)';
                c.beginPath(); c.arc(p.x, p.y, r, 0, 7); c.fill();
                c.strokeStyle = o.color; c.lineWidth = Math.max(1.5, k * 2); c.stroke();
                this._icono(c, (TB_ICONOS[o.ic] || TB_ICONOS.objetivo).u, p.x, p.y, r * 1.05, o.color);
                break;
            }
            case 'logo': {
                const im = this.imagen(o.src);
                const a = P({ x: o.x - o.w / 2, y: o.y - o.h / 2 });
                if (im) c.drawImage(im, a.x, a.y, o.w * k, o.h * k);
                else { c.strokeStyle = '#8a8d9b'; c.strokeRect(a.x, a.y, o.w * k, o.h * k); }
                break;
            }
            case 'caida': {
                const eq = this.equipo(o.eq);
                if (!eq) break;
                const p = P(o), R = Math.max(13, k * 20);
                c.shadowColor = 'rgba(0,0,0,0.85)'; c.shadowBlur = k * 8;
                c.fillStyle = '#050508';
                c.beginPath(); c.arc(p.x, p.y, R, 0, 7); c.fill();
                c.shadowBlur = 0;
                c.strokeStyle = eq.color;
                c.lineWidth = Math.max(2.5, k * 3.6);
                c.stroke();
                const im = this.imagen(eq.logo);
                if (im) {
                    c.save();
                    c.beginPath(); c.arc(p.x, p.y, R - Math.max(2, k * 3), 0, 7); c.clip();
                    const d = (R - Math.max(2, k * 3)) * 2;
                    c.drawImage(im, p.x - d / 2, p.y - d / 2, d, d);
                    c.restore();
                } else {
                    c.fillStyle = eq.color;
                    c.font = `700 ${Math.max(9, k * 12)}px ${TB_FUENTE}`;
                    c.textAlign = 'center'; c.textBaseline = 'middle';
                    c.fillText(iniciales(eq.nombre), p.x, p.y + 0.5);
                }
                this._etiqueta(c, eq.nombre.toUpperCase(), p.x, p.y + R + Math.max(10, k * 12), k, eq.color);
                if (eq.id === this.equipoSel && !this._exportando) {
                    c.strokeStyle = 'rgba(0, 240, 255, 0.9)';
                    c.lineWidth = 1.5;
                    c.setLineDash([4, 3]);
                    c.beginPath(); c.arc(p.x, p.y, R + 6, 0, 7); c.stroke();
                }
                break;
            }
            case 'jugador': {
                const p = P(o), r = Math.max(9, k * 12);
                c.fillStyle = o.color || '#00f0ff';
                c.strokeStyle = '#050508';
                c.lineWidth = Math.max(2, k * 2.5);
                c.beginPath(); c.arc(p.x, p.y, r, 0, 7); c.fill(); c.stroke();
                c.fillStyle = '#050508';
                c.font = `900 ${Math.max(9, k * 11)}px ${TB_FUENTE}`;
                c.textAlign = 'center'; c.textBaseline = 'middle';
                c.fillText(String(o.n), p.x, p.y + 0.5);
                break;
            }
            case 'texto': {
                const p = P(o), t = Math.max(8, (o.s || 18) * k);
                c.font = `700 ${t}px ${TB_FUENTE}`;
                c.textAlign = 'left'; c.textBaseline = 'top';
                c.lineWidth = Math.max(2, t * 0.18);
                c.strokeStyle = 'rgba(5, 5, 8, 0.9)';
                c.strokeText(o.txt, p.x, p.y);
                c.fillStyle = o.color;
                c.fillText(o.txt, p.x, p.y);
                break;
            }
        }
        c.restore();
    }

    _punta(c, a, b, t) {
        const ang = Math.atan2(b.y - a.y, b.x - a.x);
        c.beginPath();
        c.moveTo(b.x, b.y);
        c.lineTo(b.x - t * Math.cos(ang - 0.42), b.y - t * Math.sin(ang - 0.42));
        c.lineTo(b.x - t * Math.cos(ang + 0.42), b.y - t * Math.sin(ang + 0.42));
        c.closePath();
        c.fill();
    }

    _icono(c, glifo, x, y, tam, color, giro = 0) {
        c.save();
        c.translate(x, y);
        c.rotate(giro);
        c.fillStyle = color;
        c.font = `900 ${tam}px ${TB_FA}`;
        c.textAlign = 'center';
        c.textBaseline = 'middle';
        c.fillText(glifo, 0, 0);
        c.restore();
    }

    _caja(o) {
        switch (o.t) {
            case 'rect': case 'elipse': case 'linea': case 'flecha':
                return { x1: Math.min(o.a.x, o.b.x), y1: Math.min(o.a.y, o.b.y), x2: Math.max(o.a.x, o.b.x), y2: Math.max(o.a.y, o.b.y) };
            case 'trazo': {
                const xs = o.pts.map(p => p.x), ys = o.pts.map(p => p.y);
                return { x1: Math.min(...xs), y1: Math.min(...ys), x2: Math.max(...xs), y2: Math.max(...ys) };
            }
            case 'logo': return { x1: o.x - o.w / 2, y1: o.y - o.h / 2, x2: o.x + o.w / 2, y2: o.y + o.h / 2 };
            case 'texto': {
                this.cx.font = `700 ${o.s || 18}px ${TB_FUENTE}`;
                const w = this.cx.measureText(o.txt).width;
                return { x1: o.x, y1: o.y, x2: o.x + w, y2: o.y + (o.s || 18) };
            }
            case 'caliente': case 'segura': return { x1: o.x - o.r, y1: o.y - o.r, x2: o.x + o.r, y2: o.y + o.r };
            default: {
                const r = o.t === 'icono' ? (o.s || 14) : 16;
                return o.x !== undefined ? { x1: o.x - r, y1: o.y - r, x2: o.x + r, y2: o.y + r } : null;
            }
        }
    }

    _marcoSeleccion(c, sel, P, k) {
        const caja = this._caja(sel.o);
        if (!caja) return;
        const a = P({ x: caja.x1, y: caja.y1 }), b = P({ x: caja.x2, y: caja.y2 });
        c.save();
        c.strokeStyle = '#00f0ff';
        c.lineWidth = 1;
        c.setLineDash([4, 3]);
        c.strokeRect(a.x - 5, a.y - 5, b.x - a.x + 10, b.y - a.y + 10);
        c.restore();
    }

    // ---------- Búsqueda de la marca bajo el puntero ----------
    marcaEn(l) {
        const tol = 14 / this.k;
        const cerca = (p, r = tol) => Math.hypot(p.x - l.x, p.y - l.y) < r;
        for (let i = this.doc.objetos.length - 1; i >= 0; i--) {
            const o = this.doc.objetos[i];
            switch (o.t) {
                case 'caida': if (cerca(o, 22 / this.k)) return { o }; break;
                case 'jugador': case 'icono': if (cerca(o, 18 / this.k)) return { o }; break;
                case 'ruta': {
                    const j = o.pts.findIndex(p => cerca(p));
                    if (j >= 0) return { o, j };
                    break;
                }
                case 'segura': if (Math.abs(Math.hypot(o.x - l.x, o.y - l.y) - o.r) < tol) return { o }; break;
                case 'caliente': if (cerca(o, o.r)) return { o }; break;
                case 'linea': case 'flecha': if (distSegmento(l, o.a, o.b) < tol) return { o }; break;
                case 'avion': if (o.a && o.b && distSegmento(l, o.a, o.b) < tol) return { o }; break;
                case 'trazo':
                    for (let j = 0; j < o.pts.length - 1; j++) if (distSegmento(l, o.pts[j], o.pts[j + 1]) < tol) return { o };
                    break;
                case 'elipse': {
                    const cx = (o.a.x + o.b.x) / 2, cy = (o.a.y + o.b.y) / 2;
                    const rx = Math.abs(o.b.x - o.a.x) / 2 || 1, ry = Math.abs(o.b.y - o.a.y) / 2 || 1;
                    const d = ((l.x - cx) / rx) ** 2 + ((l.y - cy) / ry) ** 2;
                    if (o.relleno ? d <= 1 : Math.abs(Math.sqrt(d) - 1) * Math.min(rx, ry) < tol) return { o };
                    break;
                }
                default: {
                    const caja = this._caja(o);
                    if (caja && l.x >= caja.x1 - tol && l.x <= caja.x2 + tol && l.y >= caja.y1 - tol && l.y <= caja.y2 + tol) {
                        if (o.t !== 'rect' || o.relleno || Math.min(l.x - caja.x1, caja.x2 - l.x, l.y - caja.y1, caja.y2 - l.y) < tol) return { o };
                    }
                }
            }
        }
        return null;
    }

    // ---------- Interacción ----------
    _eventos() {
        const cv = this.cv;
        const pos = ev => {
            const r = cv.getBoundingClientRect();
            return { sx: ev.clientX - r.left, sy: ev.clientY - r.top };
        };

        cv.addEventListener('pointerdown', ev => {
            this.dedos.set(ev.pointerId, ev);
            if (this.dedos.size > 1) { this.arrastre = null; return; }
            cv.setPointerCapture(ev.pointerId);
            const { sx, sy } = pos(ev);
            this._presionar(this.aLogico(sx, sy), ev, sx, sy);
        });

        cv.addEventListener('pointermove', ev => {
            if (this.dedos.has(ev.pointerId)) this.dedos.set(ev.pointerId, ev);
            if (this.dedos.size === 2) {
                const [a, b] = [...this.dedos.values()];
                const d = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
                if (this.pellizco) {
                    this.vista.z = Math.min(8, Math.max(1, this.pellizco.z * d / this.pellizco.d));
                    this.dibujar();
                } else this.pellizco = { d, z: this.vista.z };
                return;
            }
            if (!this.arrastre) return;
            const { sx, sy } = pos(ev);
            this._arrastrar(this.aLogico(sx, sy), ev);
        });

        const soltar = ev => {
            this.dedos.delete(ev.pointerId);
            if (this.dedos.size < 2) this.pellizco = null;
            if (!this.arrastre) return;
            const a = this.arrastre;
            this.arrastre = null;
            // Formas demasiado pequeñas: se descartan (fue un clic, no un trazo)
            if (a.nuevo && ['rect', 'elipse', 'linea', 'flecha'].includes(a.nuevo.t)
                && Math.hypot(a.nuevo.b.x - a.nuevo.a.x, a.nuevo.b.y - a.nuevo.a.y) < 6) {
                this.doc.objetos = this.doc.objetos.filter(o => o !== a.nuevo);
                this.historial.pop();
            }
            if (a.t !== 'pan') this.cambio();
        };
        cv.addEventListener('pointerup', soltar);
        cv.addEventListener('pointercancel', soltar);

        cv.addEventListener('wheel', ev => {
            ev.preventDefault();
            const { sx, sy } = pos(ev);
            this.zoom(ev.deltaY < 0 ? 1.14 : 0.88, sx, sy);
        }, { passive: false });

        cv.addEventListener('dblclick', ev => {
            const { sx, sy } = pos(ev);
            const m = this.marcaEn(this.aLogico(sx, sy));
            if (m && m.o.t === 'texto') {
                const nuevo = prompt('Editar texto:', m.o.txt);
                if (nuevo !== null && nuevo.trim()) {
                    this.instantanea();
                    m.o.txt = nuevo.trim().slice(0, 80);
                    this.cambio();
                }
            }
        });
    }

    _presionar(l, ev, sx, sy) {
        const h = this.herr;
        const pan = () => { this.arrastre = { t: 'pan', x: ev.clientX, y: ev.clientY, vx: this.vista.x, vy: this.vista.y }; };
        if (ev.button === 1 || ev.shiftKey) return pan();

        if (h === 'mover') {
            const m = this.marcaEn(l);
            this.seleccion = m;
            if (m) {
                this.instantanea();
                this.arrastre = { t: 'mover', m, ultimo: l };
                if (m.o.eq && m.o.t === 'caida') this.seleccionarEquipo(m.o.eq);
            } else pan();
            this.dibujar();
            return;
        }
        if (h === 'borrar') {
            const m = this.marcaEn(l);
            if (!m) return;
            this.instantanea();
            if (m.o.t === 'ruta' && m.j !== undefined) {
                m.o.pts.splice(m.j, 1);
                if (!m.o.pts.length) this.doc.objetos = this.doc.objetos.filter(o => o !== m.o);
            } else this.doc.objetos = this.doc.objetos.filter(o => o !== m.o);
            this.seleccion = null;
            this.cambio();
            return;
        }

        const agregar = o => { this.instantanea(); this.doc.objetos.push(o); return o; };
        const { color, grosor, relleno } = this.estilo;

        if (h === 'caida' || h === 'ruta') {
            const eq = this.equipo(this.equipoSel);
            if (!eq) return this.avisar('Primero elige o agrega un equipo en la lista');
            if (h === 'caida') {
                this.instantanea();
                const previa = this.caidaDe(eq.id);
                if (previa) { previa.x = l.x; previa.y = l.y; }
                else this.doc.objetos.push({ t: 'caida', eq: eq.id, x: l.x, y: l.y });
            } else {
                if (!this.caidaDe(eq.id)) return this.avisar(`Marca antes la caída de ${eq.nombre}: la rotación sale de ahí`);
                this.instantanea();
                const ruta = this.rutaDe(eq.id);
                if (ruta) ruta.pts.push(l);
                else this.doc.objetos.push({ t: 'ruta', eq: eq.id, pts: [l] });
            }
            this.cambio();
            return;
        }
        if (h === 'caliente') {
            const o = agregar({ t: 'caliente', x: l.x, y: l.y, r: 50 });
            this.arrastre = { t: 'radio', o, min: 20 };
            this.dibujar();
            return;
        }
        if (h === 'segura') {
            const n = this.doc.objetos.filter(o => o.t === 'segura').length + 1;
            if (n > 6) return this.avisar('Ya están las 6 fases de zona');
            const r = Math.max(10, metrosAUnidades(diametroZona(n, this.mapaActual) / 2, this.mapaActual));
            const o = agregar({ t: 'segura', n, x: l.x, y: l.y, r });
            this.arrastre = { t: 'radio', o, min: 8 };
            this.cambio();
            return;
        }
        if (h === 'avion') {
            let av = this.doc.objetos.find(o => o.t === 'avion');
            this.instantanea();
            if (!av || av.b) {
                this.doc.objetos = this.doc.objetos.filter(o => o.t !== 'avion');
                this.doc.objetos.push({ t: 'avion', a: l, b: null });
            } else av.b = l;
            this.cambio();
            return;
        }
        if (h === 'jugador') {
            const n = this.doc.objetos.filter(o => o.t === 'jugador').length + 1;
            if (this.modo === 'mapa' && n > 4) return this.avisar('Ya están tus 4 jugadores. Usa Mover o Borrar.');
            agregar({ t: 'jugador', n, x: l.x, y: l.y, color });
            this.cambio();
            return;
        }
        if (h === 'icono') {
            agregar({ t: 'icono', ic: this.estilo.icono, x: l.x, y: l.y, color, s: 10 + grosor });
            this.cambio();
            return;
        }
        if (h === 'logo') {
            if (!this.estilo.logo) return this.avisar('Primero elige o sube un logo en el panel');
            const im = this.imagen(this.estilo.logo);
            const prop = im ? im.naturalHeight / im.naturalWidth : 1;
            agregar({ t: 'logo', src: this.estilo.logo, x: l.x, y: l.y, w: 70, h: 70 * prop });
            this.cambio();
            return;
        }
        if (h === 'texto') {
            const txt = prompt('Texto:');
            if (!txt || !txt.trim()) return;
            agregar({ t: 'texto', txt: txt.trim().slice(0, 80), x: l.x, y: l.y, color, s: 12 + grosor * 2 });
            this.cambio();
            return;
        }
        if (['rect', 'elipse', 'linea', 'flecha'].includes(h)) {
            const o = agregar({ t: h, a: l, b: { ...l }, color, grosor, relleno });
            this.arrastre = { t: 'forma', nuevo: o };
            return;
        }
        if (h === 'trazo') {
            const o = agregar({ t: 'trazo', pts: [l], color, grosor });
            this.arrastre = { t: 'trazo', o };
        }
    }

    _arrastrar(l, ev) {
        const a = this.arrastre;
        if (a.t === 'pan') {
            this.vista.x = a.vx + (ev.clientX - a.x);
            this.vista.y = a.vy + (ev.clientY - a.y);
        } else if (a.t === 'mover') {
            const dx = l.x - a.ultimo.x, dy = l.y - a.ultimo.y;
            a.ultimo = l;
            if (a.m.o.t === 'ruta' && a.m.j !== undefined) {
                a.m.o.pts[a.m.j].x += dx; a.m.o.pts[a.m.j].y += dy;
            } else desplazar(a.m.o, dx, dy);
        } else if (a.t === 'radio') {
            a.o.r = Math.max(a.min, Math.hypot(l.x - a.o.x, l.y - a.o.y));
        } else if (a.t === 'forma') {
            a.nuevo.b = l;
        } else if (a.t === 'trazo') {
            const u = a.o.pts[a.o.pts.length - 1];
            if (Math.hypot(u.x - l.x, u.y - l.y) > 2) a.o.pts.push(l);
        }
        this.dibujar();
    }

    avisar(txt) {
        this.alCambiar({ aviso: txt });
    }

    // ---------- Exportar ----------
    // Devuelve un canvas con el plano completo a la resolución pedida
    lienzoExportado(ancho = 1600) {
        const c = document.createElement('canvas');
        c.width = ancho;
        c.height = Math.round(ancho * this.doc.alto / TB_ANCHO);
        this._exportando = true;
        this.dibujar(c.getContext('2d'), { k: ancho / TB_ANCHO, W: c.width, H: c.height });
        this._exportando = false;
        return c;
    }
}

// ---------- Utilidades geométricas ----------
function distSegmento(p, a, b) {
    const vx = b.x - a.x, vy = b.y - a.y, wx = p.x - a.x, wy = p.y - a.y;
    const L = vx * vx + vy * vy;
    const t = L ? Math.max(0, Math.min(1, (wx * vx + wy * vy) / L)) : 0;
    return Math.hypot(p.x - (a.x + t * vx), p.y - (a.y + t * vy));
}

function desplazar(o, dx, dy) {
    ['', 'a', 'b'].forEach(k => {
        const p = k ? o[k] : o;
        if (p && p.x !== undefined) { p.x += dx; p.y += dy; }
    });
    if (o.pts) o.pts.forEach(p => { p.x += dx; p.y += dy; });
}

function iniciales(n) {
    const p = String(n || '').trim().split(/\s+/).filter(Boolean);
    if (!p.length) return '??';
    return (p.length === 1 ? p[0].slice(0, 3) : p[0][0] + p[1][0]).toUpperCase();
}

// ---------- Datos de juego para el análisis ----------
// Lado aproximado de cada mapa en metros (escala del plano 1000 × 1000)
const TB_LADO_MAPA = { Bermuda: 2400, Purgatorio: 2800, Kalahari: 2000, Nexterra: 2400, Solara: 1400 };

// Fases de zona medidas sobre un mapa de 2400 m; en otros mapas se escalan
const TB_ZONAS = (() => {
    const fases = [
        { diam: 1400, espera: 255, cierre: 120, dano: 1 },
        { diam: 900, espera: 140, cierre: 90, dano: 2 },
        { diam: 500, espera: 105, cierre: 60, dano: 4 },
        { diam: 250, espera: 75, cierre: 45, dano: 7 },
        { diam: 100, espera: 45, cierre: 30, dano: 10 },
        { diam: 0, espera: 30, cierre: 20, dano: 20 }
    ];
    let t = 0;
    return fases.map((f, i) => {
        const ini = t + f.espera, fin = ini + f.cierre;
        t = fin;
        return { n: i + 1, ...f, ini, fin };
    });
})();

function metrosPorUnidad(mapa) { return (TB_LADO_MAPA[mapa] || 2400) / TB_ANCHO; }
function metrosAUnidades(m, mapa) { return m / metrosPorUnidad(mapa); }
function diametroZona(n, mapa) {
    const z = TB_ZONAS[n - 1];
    return z ? z.diam * (TB_LADO_MAPA[mapa] || 2400) / 2400 : 0;
}
function relojTxt(seg) {
    seg = Math.max(0, Math.round(seg));
    return seg < 60 ? `${seg}s` : `${Math.floor(seg / 60)}m ${String(seg % 60).padStart(2, '0')}s`;
}
