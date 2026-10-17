// ============================================================
// PUMAS DEV LAB · Tablero (motor de dibujo sobre lienzo)
// ------------------------------------------------------------
// Lo usan Estrategia > Mapas y Estrategia > Vistas aéreas.
// Todo se guarda en coordenadas lógicas (1000 de ancho), no en
// píxeles: el plano se ve igual en un celular y en un monitor, y al
// exportar en alta resolución nada se descoloca.
//
// MÓDULO PORTABLE: este archivo no depende del resto de la app.
// Para llevarlo a otro proyecto copia:
//   · js/tablero.js
//   · la carpeta de imágenes de mapas (iconosobs/mapas/*.png)
//   · Font Awesome 6 (íconos) y la fuente Orbitron (opcional)
// y úsalo así:
//   Tablero.rutaMapas = 'ruta/a/mapas/';      // si cambia la carpeta
//   const t = new Tablero(canvas, { alCambiar: ev => {} });
//   t.cargar(Tablero.docVacio(), Tablero.imagenMapa('Bermuda'));
//   t.herr = 'vision';                         // cualquier clave de TB_HERRAMIENTAS
//   t.doc -> JSON para guardar · t.lienzoExportado(1600) -> canvas para PNG
// El canvas debe estar dentro de un contenedor con alto definido.
// ============================================================

const TB_ANCHO = 1000;
const TB_FUENTE = "'Orbitron', sans-serif";
const TB_FA = '"Font Awesome 6 Free"';
// Marca de agua de las descargas (PNG y video)
const TB_CREADOR = { usuario: '@coach.nikoh', url: 'https://www.instagram.com/coach.nikoh/' };

const TB_HERRAMIENTAS = {
    mover:    { n: 'Mover',         i: 'fa-up-down-left-right', pista: 'Arrastra una marca para moverla · doble clic en un texto para editarlo · arrastra el fondo para desplazarte' },
    caida:    { n: 'Caída',         i: 'fa-location-dot',  mapa: true, pista: 'Elige un equipo en la lista y toca el mapa donde cae' },
    ruta:     { n: 'Rotación',      i: 'fa-route',         mapa: true, pista: 'La rotación sale de la caída del equipo · toca las paradas en orden · cada parada muestra el tiempo de llegada' },
    rutaB:    { n: 'Ruta B',        i: 'fa-code-branch',   mapa: true, pista: 'Rotación alterna (plan B) del equipo elegido · sale de la caída, igual que la principal' },
    medir:    { n: 'Medir',         i: 'fa-ruler',         mapa: true, pista: 'Arrastra entre dos puntos: distancia real y tiempo a pie y en vehículo' },
    reposicion: { n: 'Reposición', i: 'fa-feather', pista: 'Punto de reposición (verde, alas de ángel) del tamaño de la caída · con Mover anota el tiempo' },
    binoculares: { n: 'Binoculares', i: 'fa-binoculars', pista: 'Zona amarilla donde los binoculares revelan enemigos (del tamaño de la caída) · con Mover anota el tiempo' },
    caliente: { n: 'Zona caliente', i: 'fa-fire',          pista: 'Toca y arrastra el radio de una zona disputada · elige la intensidad en el panel' },
    segura:   { n: 'Zona segura',   i: 'fa-circle-dot',    mapa: true, pista: 'Marca las fases de zona en orden (máx. 6) · el radio sale de la medida real' },
    avion:    { n: 'Avión',         i: 'fa-plane',         mapa: true, pista: 'Toca la entrada del avión y luego la salida' },
    vision:   { n: 'Visión',        i: 'fa-eye',           pista: 'Toca el punto de vista y arrastra hacia donde mira · con Mover: tirador azul = dirección/alcance, amarillo = apertura' },
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

// Marcas que admiten línea punteada / que no se copian ni restilizan
const TB_CON_LINEA = ['rect', 'elipse', 'linea', 'flecha', 'trazo'];
const TB_NO_COPIABLES = ['caida', 'ruta', 'rutaB', 'segura', 'avion'];

// Puntos del tamaño de la caída con color fijo
const TB_PUNTOS = {
    binoculares: { col: '#f5c542', rgb: '245, 197, 66', glifo: '', n: 'BINOCULARES', ley: 'Binoculares · revelan enemigos' },
    reposicion:  { col: '#4ade80', rgb: '74, 222, 128', alas: true, n: 'REPOSICIÓN', ley: 'Punto de reposición' }
};

// Zona caliente: intensidad 1 baja · 2 media · 3 alta
const TB_CALOR = {
    1: { n: 'BAJA', color: '#f5c542', rgb: '245, 197, 66' },
    2: { n: 'MEDIA', color: '#ff8a3d', rgb: '255, 138, 61' },
    3: { n: 'ALTA', color: '#ff3b30', rgb: '255, 59, 48' }
};
const TB_VEL_A_PIE = 6.5;       // m/s corriendo
const TB_VEL_VEHICULO = 31;     // m/s (~110 km/h, camioneta)

// Atajos de teclado → herramienta
const TB_ATAJOS = { v: 'mover', l: 'linea', f: 'flecha', m: 'jugador', t: 'texto', c: 'vision', r: 'rect', o: 'elipse', p: 'trazo', b: 'borrar' };

// Imágenes de los mapas incluidas en el proyecto
const TB_MAPAS_ARCHIVO = { Bermuda: 'bermuda.png', Purgatorio: 'purgatorio.png', Kalahari: 'kalahari.png', Nexterra: 'nexterra.png', Solara: 'solara.png' };

class Tablero {
    static rutaMapas = 'iconosobs/mapas/';

    // Fondo por defecto de un mapa (null si no hay imagen incluida)
    static imagenMapa(mapa) {
        const archivo = TB_MAPAS_ARCHIVO[mapa];
        return archivo ? Tablero.rutaMapas + archivo : null;
    }

    constructor(canvas, { modo = 'mapa', alCambiar = () => {}, alSeleccionarEquipo = () => {}, alSeleccionar = () => {} } = {}) {
        this.cv = canvas;
        this.cx = canvas.getContext('2d');
        this.modo = modo;
        this.alCambiar = alCambiar;
        this.alSeleccionar = alSeleccionar;
        this.alSeleccionarEquipo = alSeleccionarEquipo;
        this.doc = Tablero.docVacio();
        this.fondo = null;              // Image del fondo
        this.etiquetaFondo = '';        // texto en la cuadrícula si no hay imagen
        this.herr = 'mover';
        this.estilo = { color: '#00f0ff', grosor: 4, relleno: false, icono: 'objetivo', logo: null, apertura: 70, opacidad: 1, punteado: false, rayado: false, calor: 2 };
        this.velocidadRuta = TB_VEL_A_PIE;   // m/s para los tiempos de la rotación (lo cambia el panel)
        this.portapapeles = null;
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

    rutaDe(id, tipo = 'ruta') {
        return this.doc.objetos.find(o => o.t === tipo && o.eq === id) || null;
    }

    // Zonas calientes que toca un tramo (centro a menos de su radio del segmento)
    calientesEnTramo(a, b) {
        return this.doc.objetos.filter(o => o.t === 'caliente' && distSegmento(o, a, b) < o.r);
    }

    // Punto que admite pausa: caída, parada de una rotación o cono de visión
    get puntoPausa() {
        const o = this.marcaSeleccionada;
        if (!o) return null;
        if (o.t === 'caida' || o.t === 'vision' || TB_PUNTOS[o.t]) return { p: o, tipo: o.t };
        if ((o.t === 'ruta' || o.t === 'rutaB') && o.pts[this.seleccion.j]) return { p: o.pts[this.seleccion.j], tipo: 'parada', n: this.seleccion.j + 2, b: o.t === 'rutaB' };
        return null;
    }

    // Anota qué hace el equipo en ese punto y cuánto tiempo (en segundos de juego)
    ponerPausa(nota, segundos) {
        const sel = this.puntoPausa;
        if (!sel) return false;
        if (this._pausaEn !== sel.p) { this.instantanea(); this._pausaEn = sel.p; }
        const p = sel.p;
        const n = String(nota || '').trim().slice(0, 24);
        const s = Math.max(0, Math.min(900, Math.round(Number(segundos) || 0)));
        if (n) p.nota = n; else delete p.nota;
        if (s) p.pausa = s; else delete p.pausa;
        this.cambio();
        return true;
    }

    // Intensidad de las zonas calientes nuevas y de la seleccionada
    ponerCalor(nivel) {
        this.estilo.calor = nivel;
        const o = this.seleccion && this.seleccion.o;
        if (o && o.t === 'caliente') { this.instantanea(); o.nivel = nivel; this.cambio(); }
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
        const OX = exportar ? (exportar.ox || 0) : this.ox;
        const OY = exportar ? (exportar.oy || 0) : this.oy;
        const W = exportar ? exportar.W : this.W;
        const H = exportar ? exportar.H : this.H;
        if (!W || !H) return;
        const P = p => ({ x: OX + p.x * k, y: OY + p.y * k });
        const L = TB_ANCHO * k, A = this.doc.alto * k;

        c.clearRect(0, 0, W, H);
        c.fillStyle = '#050508';
        c.fillRect(0, 0, W, H);

        if (this.fondo) { c.imageSmoothingEnabled = true; c.imageSmoothingQuality = 'high'; c.drawImage(this.fondo, OX, OY, L, A); }
        else this._cuadricula(c, OX, OY, L, A);
        c.strokeStyle = 'rgba(0, 240, 255, 0.35)';
        c.lineWidth = 1;
        c.strokeRect(OX, OY, L, A);

        // Orden de capas: zonas debajo, marcas de equipos y jugadores encima
        const orden = ['caliente', 'segura', 'vision', 'avion', 'rect', 'elipse', 'trazo', 'linea', 'flecha', 'rutaB', 'ruta', 'medida', 'icono', 'logo', 'reposicion', 'binoculares', 'caida', 'jugador', 'texto'];
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

    static textoPausa(p, resta) {
        const s = resta !== undefined ? resta : p.pausa;
        return ((p.nota || (p.pausa ? 'Pausa' : '')).toUpperCase() + (p.pausa ? ` · ${relojTxt(s)}` : '')).trim();
    }

    _cartel(c, texto, x, y, k, color, progreso = null) {
        c.save();
        c.globalAlpha = 1;
        const t = Math.max(9, k * 9.5);
        c.font = `800 ${t}px ${TB_FUENTE}`;
        const w = c.measureText(texto).width + t * 1.6, h = t * 2;
        const x0 = x - w / 2, y0 = y - h - t * 0.6;
        c.shadowColor = 'rgba(0,0,0,0.7)'; c.shadowBlur = k * 6;
        c.fillStyle = 'rgba(5, 5, 8, 0.92)';
        c.beginPath();
        c.moveTo(x0, y0); c.lineTo(x0 + w, y0); c.lineTo(x0 + w, y0 + h);
        c.lineTo(x + t * 0.5, y0 + h); c.lineTo(x, y); c.lineTo(x - t * 0.5, y0 + h);
        c.lineTo(x0, y0 + h); c.closePath();
        c.fill();
        c.shadowBlur = 0;
        c.strokeStyle = color; c.lineWidth = Math.max(1.5, k * 1.6); c.stroke();
        c.fillStyle = color; c.fillRect(x0, y0, Math.max(3, t * 0.3), h);
        if (progreso !== null) {
            c.fillStyle = color;
            c.fillRect(x0, y0 + h - Math.max(2, t * 0.22), w * Math.max(0, Math.min(1, progreso)), Math.max(2, t * 0.22));
        }
        c.fillStyle = '#ffffff'; c.textAlign = 'center'; c.textBaseline = 'middle';
        c.fillText(texto, x + t * 0.15, y0 + h / 2 + 0.5);
        c.restore();
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
        const op = o.op ?? 1;
        c.globalAlpha = op;
        switch (o.t) {
            case 'caliente': {
                const p = P(o), r = o.r * k, cal = TB_CALOR[o.nivel || 2];
                // Núcleo con degradado
                const g = c.createRadialGradient(p.x, p.y, 0, p.x, p.y, r);
                g.addColorStop(0, `rgba(${cal.rgb}, 0.55)`);
                g.addColorStop(0.55, `rgba(${cal.rgb}, 0.22)`);
                g.addColorStop(1, `rgba(${cal.rgb}, 0.05)`);
                c.fillStyle = g;
                c.beginPath(); c.arc(p.x, p.y, r, 0, 7); c.fill();
                // Rayado diagonal dentro del círculo
                c.save();
                c.beginPath(); c.arc(p.x, p.y, r, 0, 7); c.clip();
                c.globalAlpha = op * 0.28;
                c.fillStyle = this._rayas(c, cal.color, k);
                c.fillRect(p.x - r, p.y - r, r * 2, r * 2);
                c.restore();
                // Borde firme y anillo interior punteado
                c.strokeStyle = cal.color; c.lineWidth = Math.max(1.5, k * 2.4);
                c.shadowColor = cal.color; c.shadowBlur = k * 8;
                c.beginPath(); c.arc(p.x, p.y, r, 0, 7); c.stroke();
                c.shadowBlur = 0;
                c.setLineDash([k * 6, k * 5]); c.lineWidth = Math.max(1, k * 1.2);
                c.beginPath(); c.arc(p.x, p.y, r * 0.6, 0, 7); c.stroke();
                c.setLineDash([]);
                // Insignia con fuego
                const ri = Math.max(8, k * 11);
                c.fillStyle = 'rgba(5, 5, 8, 0.9)';
                c.beginPath(); c.arc(p.x, p.y, ri, 0, 7); c.fill();
                c.strokeStyle = cal.color; c.lineWidth = Math.max(1.5, k * 2); c.stroke();
                this._icono(c, '',p.x, p.y, ri * 1.1, cal.color);
                const metros = this.modo === 'mapa' ? ` · ${Math.round(o.r * metrosPorUnidad(this.mapaActual))} m` : '';
                this._etiqueta(c, `ZONA CALIENTE · ${cal.n}${metros}`, p.x, p.y + r + Math.max(11, k * 13), k, cal.color);
                break;
            }
            case 'medida': {
                const a = P(o.a), b = P(o.b);
                c.strokeStyle = '#ffffff'; c.fillStyle = '#ffffff';
                c.lineWidth = Math.max(1.5, k * 2);
                c.setLineDash([k * 8, k * 5]);
                c.beginPath(); c.moveTo(a.x, a.y); c.lineTo(b.x, b.y); c.stroke();
                c.setLineDash([]);
                // Topes perpendiculares en los extremos
                const ang = Math.atan2(b.y - a.y, b.x - a.x) + Math.PI / 2, tl = Math.max(5, k * 7);
                [a, b].forEach(q => { c.beginPath(); c.moveTo(q.x - Math.cos(ang) * tl, q.y - Math.sin(ang) * tl); c.lineTo(q.x + Math.cos(ang) * tl, q.y + Math.sin(ang) * tl); c.stroke(); });
                const m = Math.hypot(o.b.x - o.a.x, o.b.y - o.a.y) * metrosPorUnidad(this.mapaActual);
                this._etiqueta(c, `${Math.round(m)} m · a pie ${relojTxt(m / TB_VEL_A_PIE)} · vehículo ${relojTxt(m / TB_VEL_VEHICULO)}`, (a.x + b.x) / 2, (a.y + b.y) / 2 - Math.max(12, k * 14), k, '#ffffff');
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
                const fase = zonasDe(this.mapaActual)[o.n - 1];
                const txt = `Z${o.n}` + (fase && this.modo === 'mapa' ? `  ⌀ ${fase.r * 2} m  cierra ${relojTxt(fase.fin)}` : '');
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
            case 'vision': {
                const p = P(o), r = o.r * k, med = o.ap * Math.PI / 360;
                const g = c.createRadialGradient(p.x, p.y, 0, p.x, p.y, Math.max(1, r));
                g.addColorStop(0, hexAlfa(o.color, 0.55));
                g.addColorStop(0.7, hexAlfa(o.color, 0.22));
                g.addColorStop(1, hexAlfa(o.color, 0.04));
                c.fillStyle = g;
                c.beginPath();
                c.moveTo(p.x, p.y);
                c.arc(p.x, p.y, r, o.ang - med, o.ang + med);
                c.closePath();
                c.fill();
                c.strokeStyle = hexAlfa(o.color, 0.9);
                c.lineWidth = Math.max(1, k * 1.6);
                c.stroke();
                // Línea central de la mirada
                c.setLineDash([k * 6, k * 5]);
                c.lineWidth = Math.max(1, k * 1.2);
                c.beginPath(); c.moveTo(p.x, p.y); c.lineTo(p.x + Math.cos(o.ang) * r, p.y + Math.sin(o.ang) * r); c.stroke();
                c.setLineDash([]);
                const ro = Math.max(7, k * 9);
                c.fillStyle = 'rgba(5, 5, 8, 0.9)';
                c.beginPath(); c.arc(p.x, p.y, ro, 0, 7); c.fill();
                c.strokeStyle = o.color; c.lineWidth = Math.max(1.5, k * 2); c.stroke();
                this._icono(c, TB_ICONOS.ojo.u, p.x, p.y, ro * 1.05, o.color);
                if (o._barrido !== undefined && r > 4) {
                    const f = o._barrido < 0.5 ? o._barrido * 2 : 2 - o._barrido * 2;
                    const an = o.ang - med + med * 2 * f;
                    c.strokeStyle = '#ffffff'; c.globalAlpha = op * 0.85;
                    c.lineWidth = Math.max(1.5, k * 2.2);
                    c.shadowColor = o.color; c.shadowBlur = k * 10;
                    c.beginPath(); c.moveTo(p.x, p.y); c.lineTo(p.x + Math.cos(an) * r, p.y + Math.sin(an) * r); c.stroke();
                    c.shadowBlur = 0; c.globalAlpha = op;
                }
                if (o.nota || o.pausa) this._cartel(c, Tablero.textoPausa(o, o._resta), p.x, p.y - ro - 2, k, o.color,
                    o._resta !== undefined && o.pausa ? o._resta / o.pausa : null);
                break;
            }
            case 'rect': {
                const a = P(o.a), b = P(o.b);
                c.strokeStyle = o.color;
                c.lineWidth = Math.max(1, o.grosor * k);
                if (o.relleno) {
                    c.globalAlpha = op * (o.rayado ? 0.9 : 0.35);
                    c.fillStyle = o.rayado ? this._rayas(c, o.color, k) : o.color;
                    c.fillRect(a.x, a.y, b.x - a.x, b.y - a.y);
                    c.globalAlpha = op;
                }
                this._trazoPunteado(c, o, k);
                c.strokeRect(a.x, a.y, b.x - a.x, b.y - a.y);
                break;
            }
            case 'elipse': {
                const a = P(o.a), b = P(o.b);
                c.strokeStyle = o.color;
                c.lineWidth = Math.max(1, o.grosor * k);
                c.beginPath();
                c.ellipse((a.x + b.x) / 2, (a.y + b.y) / 2, Math.abs(b.x - a.x) / 2, Math.abs(b.y - a.y) / 2, 0, 0, 7);
                if (o.relleno) {
                    c.globalAlpha = op * (o.rayado ? 0.9 : 0.35);
                    c.fillStyle = o.rayado ? this._rayas(c, o.color, k) : o.color;
                    c.fill();
                    c.globalAlpha = op;
                }
                this._trazoPunteado(c, o, k);
                c.stroke();
                break;
            }
            case 'linea':
            case 'flecha': {
                const a = P(o.a), b = P(o.b);
                c.strokeStyle = c.fillStyle = o.color;
                c.lineWidth = Math.max(1, o.grosor * k);
                c.shadowColor = 'rgba(0,0,0,0.7)'; c.shadowBlur = k * 4;
                this._trazoPunteado(c, o, k);
                c.beginPath(); c.moveTo(a.x, a.y); c.lineTo(b.x, b.y); c.stroke();
                c.setLineDash([]);
                if (o.t === 'flecha') this._punta(c, a, b, Math.max(8, o.grosor * k * 3.5));
                break;
            }
            case 'trazo': {
                if (o.pts.length < 2) break;
                const pts = o.pts.map(P);
                c.strokeStyle = o.color;
                c.lineWidth = Math.max(1, o.grosor * k);
                this._trazoPunteado(c, o, k);
                c.beginPath(); c.moveTo(pts[0].x, pts[0].y);
                pts.slice(1).forEach(p => c.lineTo(p.x, p.y));
                c.stroke();
                break;
            }
            case 'ruta':
            case 'rutaB': {
                const eq = this.equipo(o.eq);
                const caida = this.caidaDe(o.eq);
                const logico = caida ? [caida, ...o.pts] : o.pts;
                const camino = logico.map(P);
                if (!eq || camino.length < 2) break;
                const esB = o.t === 'rutaB';
                // Tramos que cruzan una zona caliente: halo rojo debajo
                for (let i = 0; i < logico.length - 1; i++) {
                    if (!this.calientesEnTramo(logico[i], logico[i + 1]).length) continue;
                    c.strokeStyle = 'rgba(255, 59, 48, 0.55)'; c.lineWidth = Math.max(6, k * 11);
                    c.beginPath(); c.moveTo(camino[i].x, camino[i].y); c.lineTo(camino[i + 1].x, camino[i + 1].y); c.stroke();
                }
                c.strokeStyle = c.fillStyle = eq.color;
                c.lineWidth = Math.max(esB ? 1.5 : 2, k * (esB ? 3 : 4.5));
                if (esB) { c.globalAlpha = op * 0.8; c.setLineDash([k * 12, k * 8]); }
                c.shadowColor = 'rgba(0,0,0,0.8)'; c.shadowBlur = k * 6;
                c.beginPath(); c.moveTo(camino[0].x, camino[0].y);
                camino.slice(1).forEach(p => c.lineTo(p.x, p.y));
                c.stroke();
                c.setLineDash([]);
                c.shadowBlur = 0;
                this._punta(c, camino[camino.length - 2], camino[camino.length - 1], Math.max(8, k * (esB ? 10 : 13)));
                // Paradas con número (B1, B2… en la ruta B) y tiempo de llegada acumulado
                const mpu = this.modo === 'mapa' ? metrosPorUnidad(this.mapaActual) : 0;
                const velR = this.velocidadRuta || TB_VEL_A_PIE;
                // Segundos de juego: viaje + pausas anotadas (la de la caída cuenta desde el inicio)
                let reloj = caida && caida.pausa ? caida.pausa : 0;
                camino.slice(1).forEach((p, i) => {
                    reloj += Math.hypot(logico[i + 1].x - logico[i].x, logico[i + 1].y - logico[i].y) * mpu / velR;
                    const acumulado = reloj * velR;
                    const parada = logico[i + 1];
                    if (parada.nota || parada.pausa) {
                        this._cartel(c, Tablero.textoPausa(parada), p.x, p.y - Math.max(8, k * 10), k, eq.color);
                        reloj += parada.pausa || 0;
                    }
                    const r = Math.max(6, k * 8);
                    if (i < camino.length - 2) {
                        c.fillStyle = '#050508';
                        c.beginPath(); c.arc(p.x, p.y, r, 0, 7); c.fill();
                        c.strokeStyle = eq.color; c.lineWidth = 2; c.stroke();
                        c.fillStyle = '#ffffff';
                        c.font = `700 ${Math.max(8, k * 9)}px ${TB_FUENTE}`;
                        c.textAlign = 'center'; c.textBaseline = 'middle';
                        c.fillText(esB ? `B${i + 2}` : String(i + 2), p.x, p.y + 0.5);
                    }
                    if (mpu && !this._exportandoSinTiempos) {
                        const t = relojTxt(acumulado / (this.velocidadRuta || TB_VEL_A_PIE));
                        c.font = `700 ${Math.max(8, k * 8.5)}px ${TB_FUENTE}`;
                        const w = c.measureText(t).width + 8;
                        c.fillStyle = 'rgba(5, 5, 8, 0.85)';
                        c.fillRect(p.x + r + 3, p.y - 8, w, 16);
                        c.fillStyle = eq.color; c.textAlign = 'left'; c.textBaseline = 'middle';
                        c.fillText(t, p.x + r + 7, p.y + 0.5);
                    }
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
                if (!o._movil) this._etiqueta(c, eq.nombre.toUpperCase(), p.x, p.y + R + Math.max(10, k * 12), k, eq.color);
                if (o._pausa) {
                    // Detenido en un punto: anillo que se vacía y cartel con la cuenta atrás
                    const f = o._pausa.resta / o._pausa.total;
                    c.strokeStyle = '#ffffff'; c.lineWidth = Math.max(2, k * 3);
                    c.beginPath(); c.arc(p.x, p.y, R + Math.max(4, k * 6), -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * f); c.stroke();
                    this._cartel(c, Tablero.textoPausa(o._pausa.p, o._pausa.resta), p.x, p.y - R - Math.max(6, k * 9), k, eq.color, f);
                } else if (!o._movil && !o._sinCartel && (o.nota || o.pausa)) {
                    this._cartel(c, Tablero.textoPausa(o), p.x, p.y - R - 2, k, eq.color);
                }
                if (eq.id === this.equipoSel && !this._exportando) {
                    c.strokeStyle = 'rgba(0, 240, 255, 0.9)';
                    c.lineWidth = 1.5;
                    c.setLineDash([4, 3]);
                    c.beginPath(); c.arc(p.x, p.y, R + 6, 0, 7); c.stroke();
                }
                break;
            }
            case 'binoculares':
            case 'reposicion': {
                // Binoculares: círculo amarillo donde se revelan enemigos · Reposición: círculo verde con alas de ángel
                const tipo = TB_PUNTOS[o.t];
                const p = P(o), R = Math.max(13, k * 20), col = tipo.col;
                c.fillStyle = `rgba(${tipo.rgb}, 0.38)`;
                c.beginPath(); c.arc(p.x, p.y, R, 0, 7); c.fill();
                c.strokeStyle = col; c.lineWidth = Math.max(2, k * 3);
                c.shadowColor = col; c.shadowBlur = k * 8;
                c.stroke();
                c.shadowBlur = 0;
                // Pulso de radar en el video
                if (o._pulso !== undefined) {
                    c.globalAlpha = op * (1 - o._pulso);
                    c.lineWidth = Math.max(1.5, k * 2);
                    c.beginPath(); c.arc(p.x, p.y, R * (0.3 + o._pulso * 0.7), 0, 7); c.stroke();
                    c.globalAlpha = op;
                }
                c.fillStyle = 'rgba(5, 5, 8, 0.85)';
                c.beginPath(); c.arc(p.x, p.y, R * (tipo.alas ? 0.62 : 0.42), 0, 7); c.fill();
                if (tipo.alas) this._alas(c, p.x, p.y + R * 0.08, R * 0.46, col);
                else this._icono(c, tipo.glifo, p.x, p.y, R * 0.48, col);
                if (o._resta !== undefined && o.pausa) {
                    c.strokeStyle = '#ffffff'; c.lineWidth = Math.max(2, k * 3);
                    c.beginPath(); c.arc(p.x, p.y, R + Math.max(4, k * 6), -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (o._resta / o.pausa)); c.stroke();
                }
                this._etiqueta(c, tipo.n, p.x, p.y + R + Math.max(10, k * 12), k, col);
                if (o.nota || o.pausa) this._cartel(c, Tablero.textoPausa(o, o._resta), p.x, p.y - R - 2, k, col,
                    o._resta !== undefined && o.pausa ? o._resta / o.pausa : null);
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

    _trazoPunteado(c, o, k) {
        if (!o.dash) return;
        const g = Math.max(1, o.grosor * k);
        c.setLineDash([g * 3, g * 2.2]);
    }

    // Patrón de rayas diagonales para zonas rayadas
    _rayas(c, color, k) {
        const paso = Math.max(6, Math.round(k * 10));
        const clave = color + paso;
        this._patrones = this._patrones || {};
        if (!this._patrones[clave]) {
            const t = document.createElement('canvas');
            t.width = t.height = paso;
            const x = t.getContext('2d');
            x.strokeStyle = color;
            x.lineWidth = Math.max(1.5, paso / 5);
            x.beginPath();
            x.moveTo(-1, paso + 1); x.lineTo(paso + 1, -1);
            x.moveTo(-1, 1); x.lineTo(1, -1);
            x.moveTo(paso - 1, paso + 1); x.lineTo(paso + 1, paso - 1);
            x.stroke();
            this._patrones[clave] = t;
        }
        return c.createPattern(this._patrones[clave], 'repeat');
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

    // Alas de ángel con aureola (centro del punto de reposición); s = media anchura
    _alas(c, x, y, s, color) {
        c.save();
        c.fillStyle = color;
        [-1, 1].forEach(d => {
            c.beginPath();
            c.moveTo(x + d * s * 0.1, y + s * 0.25);
            c.bezierCurveTo(x + d * s * 0.2, y - s * 0.55, x + d * s * 0.75, y - s * 0.75, x + d * s * 1.15, y - s * 0.6);
            // Borde inferior con tres plumas
            c.quadraticCurveTo(x + d * s * 1.05, y - s * 0.2, x + d * s * 0.95, y - s * 0.12);
            c.quadraticCurveTo(x + d * s * 0.95, y + s * 0.15, x + d * s * 0.7, y + s * 0.18);
            c.quadraticCurveTo(x + d * s * 0.62, y + s * 0.45, x + d * s * 0.42, y + s * 0.42);
            c.quadraticCurveTo(x + d * s * 0.3, y + s * 0.6, x + d * s * 0.1, y + s * 0.25);
            c.fill();
        });
        // Aureola
        c.strokeStyle = color; c.lineWidth = Math.max(1, s * 0.14);
        c.beginPath(); c.ellipse(x, y - s * 0.62, s * 0.3, s * 0.1, 0, 0, 7); c.stroke();
        c.restore();
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
            case 'rect': case 'elipse': case 'linea': case 'flecha': case 'medida':
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
            case 'vision': return { x1: o.x - o.r, y1: o.y - o.r, x2: o.x + o.r, y2: o.y + o.r };
            case 'binoculares': case 'reposicion': return { x1: o.x - 20, y1: o.y - 20, x2: o.x + 20, y2: o.y + 20 };
            default: {
                const r = o.t === 'icono' ? (o.s || 14) : 16;
                return o.x !== undefined ? { x1: o.x - r, y1: o.y - r, x2: o.x + r, y2: o.y + r } : null;
            }
        }
    }

    // Tiradores del cono: punta (dirección y alcance) y borde (apertura)
    static puntaCono(o) { return { x: o.x + Math.cos(o.ang) * o.r, y: o.y + Math.sin(o.ang) * o.r }; }
    static bordeCono(o) {
        const a = o.ang + o.ap * Math.PI / 360;
        return { x: o.x + Math.cos(a) * o.r, y: o.y + Math.sin(a) * o.r };
    }

    _marcoSeleccion(c, sel, P, k) {
        if ((sel.o.t === 'ruta' || sel.o.t === 'rutaB') && sel.o.pts[sel.j]) {
            const p = P(sel.o.pts[sel.j]);
            c.save();
            c.strokeStyle = '#00f0ff'; c.lineWidth = 1.5; c.setLineDash([4, 3]);
            c.beginPath(); c.arc(p.x, p.y, Math.max(11, k * 13), 0, 7); c.stroke();
            c.restore();
            return;
        }
        if (sel.o.t === 'vision') {
            c.save();
            [[Tablero.puntaCono(sel.o), '#00f0ff'], [Tablero.bordeCono(sel.o), '#f5c542']].forEach(([q, col]) => {
                const p = P(q);
                c.fillStyle = col;
                c.strokeStyle = '#050508';
                c.lineWidth = 2;
                c.beginPath(); c.arc(p.x, p.y, 7, 0, 7); c.fill(); c.stroke();
            });
            c.restore();
            return;
        }
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
        // Primero los tiradores del cono seleccionado
        const sel = this.seleccion && this.seleccion.o;
        if (sel && sel.t === 'vision' && this.doc.objetos.includes(sel)) {
            if (cerca(Tablero.puntaCono(sel), 12 / this.k)) return { o: sel, tirador: 'punta' };
            if (cerca(Tablero.bordeCono(sel), 12 / this.k)) return { o: sel, tirador: 'borde' };
        }
        for (let i = this.doc.objetos.length - 1; i >= 0; i--) {
            const o = this.doc.objetos[i];
            switch (o.t) {
                case 'caida': case 'binoculares': case 'reposicion': if (cerca(o, 22 / this.k)) return { o }; break;
                case 'jugador': case 'icono': if (cerca(o, 18 / this.k)) return { o }; break;
                case 'ruta': case 'rutaB': {
                    const j = o.pts.findIndex(p => cerca(p));
                    if (j >= 0) return { o, j };
                    break;
                }
                case 'segura': if (Math.abs(Math.hypot(o.x - l.x, o.y - l.y) - o.r) < tol) return { o }; break;
                case 'caliente': if (cerca(o, o.r)) return { o }; break;
                case 'vision': {
                    if (cerca(o, 16 / this.k)) return { o };
                    const dif = difAngulo(Math.atan2(l.y - o.y, l.x - o.x), o.ang);
                    if (Math.hypot(l.x - o.x, l.y - o.y) <= o.r && Math.abs(dif) <= o.ap * Math.PI / 360) return { o };
                    break;
                }
                case 'linea': case 'flecha': case 'medida': if (distSegmento(l, o.a, o.b) < tol) return { o }; break;
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
            if (a.nuevo && ['rect', 'elipse', 'linea', 'flecha', 'medida'].includes(a.nuevo.t)
                && Math.hypot(a.nuevo.b.x - a.nuevo.a.x, a.nuevo.b.y - a.nuevo.a.y) < 6) {
                this.doc.objetos = this.doc.objetos.filter(o => o !== a.nuevo);
                this.historial.pop();
            }
            // Cono puesto con un toque, sin arrastrar: alcance por defecto
            if (a.t === 'cono' && a.o.r < 15) a.o.r = 120;
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
                this.arrastre = m.tirador ? { t: 'cono-' + m.tirador, o: m.o } : { t: 'mover', m, ultimo: l };
                if (m.o.eq && m.o.t === 'caida') this.seleccionarEquipo(m.o.eq);
            } else pan();
            this.dibujar();
            this.alSeleccionar(m);
            return;
        }
        if (h === 'borrar') {
            const m = this.marcaEn(l);
            if (!m) return;
            this.instantanea();
            if ((m.o.t === 'ruta' || m.o.t === 'rutaB') && m.j !== undefined) {
                m.o.pts.splice(m.j, 1);
                if (!m.o.pts.length) this.doc.objetos = this.doc.objetos.filter(o => o !== m.o);
            } else this.doc.objetos = this.doc.objetos.filter(o => o !== m.o);
            this.seleccion = null;
            this.cambio();
            return;
        }

        const agregar = o => {
            const e = this.estilo;
            if (e.opacidad < 1 && !['caida', 'ruta', 'segura', 'avion'].includes(o.t)) o.op = e.opacidad;
            if (e.punteado && TB_CON_LINEA.includes(o.t)) o.dash = true;
            if (e.rayado && ['rect', 'elipse'].includes(o.t)) o.rayado = true;
            this.instantanea();
            this.doc.objetos.push(o);
            return o;
        };
        const { color, grosor, relleno } = this.estilo;

        if (h === 'caida' || h === 'ruta' || h === 'rutaB') {
            const eq = this.equipo(this.equipoSel);
            if (!eq) return this.avisar('Primero elige o agrega un equipo en la lista');
            if (h === 'caida') {
                this.instantanea();
                let caida = this.caidaDe(eq.id);
                if (caida) { caida.x = l.x; caida.y = l.y; }
                else this.doc.objetos.push(caida = { t: 'caida', eq: eq.id, x: l.x, y: l.y });
                this.seleccion = { o: caida };
            } else {
                if (!this.caidaDe(eq.id)) return this.avisar(`Marca antes la caída de ${eq.nombre}: la rotación sale de ahí`);
                this.instantanea();
                let ruta = this.rutaDe(eq.id, h);
                if (ruta) ruta.pts.push(l);
                else this.doc.objetos.push(ruta = { t: h, eq: eq.id, pts: [l] });
                this.seleccion = { o: ruta, j: ruta.pts.length - 1 };
            }
            this.cambio();
            this.alSeleccionar(this.seleccion);
            return;
        }
        if (h === 'caliente') {
            const o = agregar({ t: 'caliente', x: l.x, y: l.y, r: 50, nivel: this.estilo.calor || 2 });
            this.arrastre = { t: 'radio', o, min: 20 };
            this.dibujar();
            return;
        }
        if (h === 'segura') {
            const n = this.doc.objetos.filter(o => o.t === 'segura').length + 1;
            const fases = zonasDe(this.mapaActual);
            if (n > fases.length) return this.avisar(`Ya están las ${fases.length} fases de zona de ${this.mapaActual}`);
            const r = Math.max(4, metrosAUnidades(fases[n - 1].r, this.mapaActual));
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
        if (h === 'vision') {
            const o = agregar({ t: 'vision', x: l.x, y: l.y, ang: -Math.PI / 2, r: 0, ap: this.estilo.apertura, color });
            this.arrastre = { t: 'cono', o };
            this.dibujar();
            return;
        }
        if (TB_PUNTOS[h]) {
            const o = agregar({ t: h, x: l.x, y: l.y });
            this.seleccion = { o };
            this.cambio();
            this.alSeleccionar(this.seleccion);
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
        if (h === 'medir') {
            const o = agregar({ t: 'medida', a: l, b: { ...l } });
            this.arrastre = { t: 'forma', nuevo: o };
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
            if ((a.m.o.t === 'ruta' || a.m.o.t === 'rutaB') && a.m.j !== undefined) {
                a.m.o.pts[a.m.j].x += dx; a.m.o.pts[a.m.j].y += dy;
            } else desplazar(a.m.o, dx, dy);
        } else if (a.t === 'radio') {
            a.o.r = Math.max(a.min, Math.hypot(l.x - a.o.x, l.y - a.o.y));
        } else if (a.t === 'cono' || a.t === 'cono-punta') {
            const d = Math.hypot(l.x - a.o.x, l.y - a.o.y);
            if (d > 3) { a.o.ang = Math.atan2(l.y - a.o.y, l.x - a.o.x); a.o.r = Math.max(a.t === 'cono' ? 0 : 15, d); }
        } else if (a.t === 'cono-borde') {
            const dif = Math.abs(difAngulo(Math.atan2(l.y - a.o.y, l.x - a.o.x), a.o.ang));
            a.o.ap = Math.round(Math.min(360, Math.max(10, dif * 360 / Math.PI)));
        } else if (a.t === 'forma') {
            a.nuevo.b = l;
        } else if (a.t === 'trazo') {
            const u = a.o.pts[a.o.pts.length - 1];
            if (Math.hypot(u.x - l.x, u.y - l.y) > 2) a.o.pts.push(l);
        }
        this.dibujar();
    }

    // ---------- Acciones sobre la marca seleccionada (herramienta Mover) ----------
    get marcaSeleccionada() {
        const o = this.seleccion && this.seleccion.o;
        return o && this.doc.objetos.includes(o) ? o : null;
    }

    borrarSeleccion() {
        const o = this.marcaSeleccionada;
        if (!o) return false;
        this.instantanea();
        const j = this.seleccion.j;
        if ((o.t === 'ruta' || o.t === 'rutaB') && j !== undefined && o.pts.length > 1) o.pts.splice(j, 1);
        else this.doc.objetos = this.doc.objetos.filter(x => x !== o);
        this.seleccion = null;
        this.cambio();
        return true;
    }

    copiar() {
        const o = this.marcaSeleccionada;
        if (!o) return false;
        if (TB_NO_COPIABLES.includes(o.t)) { this.avisar('Las marcas de equipos, zonas y avión no se copian'); return false; }
        this.portapapeles = JSON.stringify(o);
        return true;
    }

    pegar() {
        if (!this.portapapeles) return false;
        const o = JSON.parse(this.portapapeles);
        desplazar(o, 20, 20);
        this.portapapeles = JSON.stringify(o);   // el siguiente pegado sale corrido otra vez
        if (o.t === 'jugador') o.n = this.doc.objetos.filter(x => x.t === 'jugador').length + 1;
        this.instantanea();
        this.doc.objetos.push(o);
        this.seleccion = { o };
        this.cambio();
        return true;
    }

    duplicar() {
        return this.copiar() && this.pegar();
    }

    // Aplica color, grosor, opacidad y trazo actuales a la marca seleccionada
    aplicarEstilo() {
        const o = this.marcaSeleccionada;
        if (!o || TB_NO_COPIABLES.includes(o.t)) return false;
        const e = this.estilo;
        this.instantanea();
        if ('color' in o) o.color = e.color;
        if ('grosor' in o) o.grosor = e.grosor;
        if ('relleno' in o) o.relleno = e.relleno;
        if (e.opacidad < 1) o.op = e.opacidad; else delete o.op;
        if (TB_CON_LINEA.includes(o.t)) { if (e.punteado) o.dash = true; else delete o.dash; }
        if (['rect', 'elipse'].includes(o.t)) { if (e.rayado) o.rayado = true; else delete o.rayado; }
        this.cambio();
        return true;
    }

    // Apertura (grados) de los conos nuevos y del cono seleccionado
    ponerApertura(grados) {
        this.estilo.apertura = grados;
        const o = this.seleccion && this.seleccion.o;
        if (o && o.t === 'vision') {
            this.instantanea();
            o.ap = grados;
            this.cambio();
        }
    }

    avisar(txt) {
        this.alCambiar({ aviso: txt });
    }

    // ---------- Exportar ----------
    // Devuelve un canvas con el plano completo a la resolución pedida
    // ---------- Video: las marcas aparecen en orden y cada equipo recorre su rotación ----------
    // Devuelve la línea de tiempo (segundos de video) y una función que arma el documento de cada instante.
    _guionVideo() {
        const objs = this.doc.objetos;
        const esRuta = o => o.t === 'ruta' || o.t === 'rutaB';
        // Primero zonas y marcas generales, luego caídas; las rotaciones al final se animan aparte
        const peso = o => o.t === 'caida' ? 1 : 0;
        const apariciones = objs.filter(o => !esRuta(o) && !((o.t === 'vision' || TB_PUNTOS[o.t]) && this._visorDeRuta(o))).map((o, i) => ({ o, i })).sort((a, b) => peso(a.o) - peso(b.o) || a.i - b.i).map(x => x.o);
        const INICIO = 0.8, FUNDIDO = 0.45;
        const paso = apariciones.length ? Math.min(0.4, 7 / apariciones.length) : 0;
        const entrada = new Map(apariciones.map((o, i) => [o, INICIO + i * paso]));
        const finEntrada = INICIO + (apariciones.length ? (apariciones.length - 1) * paso + FUNDIDO : 0);

        // Rotaciones en segundos de juego: pausa en la caída, viajes y pausas en cada parada
        const mpu = this.modo === 'mapa' ? metrosPorUnidad(this.mapaActual) : 0;
        const vel = this.velocidadRuta || TB_VEL_A_PIE;
        const rutas = objs.filter(esRuta).map(o => {
            const caida = this.caidaDe(o.eq);
            const pts = caida ? [caida, ...o.pts] : o.pts;
            const pasos = [];
            if (caida && caida.pausa) pasos.push({ tipo: 'pausa', dur: caida.pausa, p: caida });
            for (let i = 0; i < pts.length - 1; i++) {
                const a = pts[i], b = pts[i + 1], L = Math.hypot(b.x - a.x, b.y - a.y);
                if (L > 0) pasos.push({ tipo: 'viaje', dur: mpu ? L * mpu / vel : L / 40, a, b });
                if (b.pausa) pasos.push({ tipo: 'pausa', dur: b.pausa, p: b });
            }
            return { o, caida, pts, pasos, real: pasos.reduce((s, p) => s + p.dur, 0) };
        }).filter(r => r.pts.length > 1 && r.real > 0);
        // Un visor junto a la caída o a una parada se abre cuando el equipo llega ahí
        const llegadas = new Map();
        rutas.forEach(r => {
            let tr = 0;
            const marcar = p => { if (!llegadas.has(p) || llegadas.get(p) > tr) llegadas.set(p, tr); };
            marcar(r.pts[0]);
            r.pasos.forEach(s => { tr += s.dur; if (s.tipo === 'viaje') marcar(s.b); });
        });
        const visores = new Map();
        objs.filter(o => o.t === 'vision' || TB_PUNTOS[o.t]).forEach(v => {
            let mejor = null;
            llegadas.forEach((tr, p) => {
                const d = Math.hypot(p.x - v.x, p.y - v.y);
                if (d < 40 && (!mejor || d < mejor.d)) mejor = { d, tr };
            });
            if (mejor) visores.set(v, mejor.tr);
        });
        const maxReal = Math.max(1, ...rutas.map(r => r.real), ...[...visores].map(([v, tr]) => tr + (v.pausa || 0)));
        const escala = Math.min(10 / maxReal, 1);   // la más larga dura ~10 s; nunca más lento que el juego
        const finRutas = finEntrada + (rutas.length ? 0.4 + maxReal * escala : 0);
        // Al final: la cámara vuelve a todo el mapa (1.4 s) y después sale el cartel de cierre
        const total = finRutas + (rutas.length ? 6.5 : 2.5);
        const tiempos = rutas.map(r => ({ eq: r.o.eq, b: r.o.t === 'rutaB', real: r.real }));
        const t0r = finEntrada + 0.4;

        // Dónde va el equipo a los `tr` segundos de juego
        const avance = (r, tr) => {
            const out = [r.pts[0]];
            for (const s of r.pasos) {
                if (s.tipo === 'pausa') {
                    if (tr < s.dur) return { pts: out, cabeza: out[out.length - 1], pausa: { p: s.p, resta: s.dur - tr, total: s.dur } };
                } else if (tr < s.dur) {
                    const f = tr / s.dur;
                    out.push({ x: s.a.x + (s.b.x - s.a.x) * f, y: s.a.y + (s.b.y - s.a.y) * f });
                    return { pts: out, cabeza: out[out.length - 1] };
                } else out.push(s.b);
                tr -= s.dur;
            }
            return { pts: out, cabeza: out[out.length - 1], completa: true };
        };

        const estado = t => {
            const lista = [], cabezas = [];
            const reloj = rutas.length && t >= t0r ? Math.min(t - t0r, maxReal * escala) / escala : null;
            apariciones.forEach(o => {
                const t0 = entrada.get(o);
                if (t < t0) return;
                const a = Math.min(1, (t - t0) / FUNDIDO);
                if (o.t === 'vision') {
                    // El visor se abre, barre su ángulo y cuenta su tiempo junto con la rotación
                    const e = Math.min(1, (t - t0) / 0.9), suave = 1 - (1 - e) ** 3;
                    const v = { ...o, r: o.r * suave, ap: Math.max(1, o.ap * suave), _barrido: ((t - t0) / 2.4) % 1 };
                    if (o.pausa) {
                        v._resta = Math.max(0, o.pausa - (reloj ?? 0));
                        if (!v._resta) { v.op = (o.op ?? 1) * 0.35; delete v._barrido; }
                    }
                    lista.push(v);
                    return;
                }
                if (TB_PUNTOS[o.t] && o.pausa) {
                    const restaB = Math.max(0, o.pausa - (reloj ?? 0));
                    lista.push({ ...o, op: (o.op ?? 1) * a * (restaB ? 1 : 0.45), _resta: restaB, ...(restaB ? { _pulso: ((t - t0) / 1.4) % 1 } : {}) });
                    return;
                }
                if (o.t === 'caida' && rutas.some(r => r.caida === o)) {
                    lista.push({ ...o, op: (o.op ?? 1) * a, _sinCartel: reloj !== null && reloj < (o.pausa || 0) });
                    return;
                }
                lista.push(a >= 1 ? o : { ...o, op: (o.op ?? 1) * a });
            });
            // Visores ligados a un punto de la rotación
            if (reloj !== null) visores.forEach((tr, o) => {
                if (reloj < tr) return;
                const e = Math.min(1, (reloj - tr) * escala / 0.9), suave = 1 - (1 - e) ** 3;
                const v = TB_PUNTOS[o.t] ? { ...o, op: (o.op ?? 1) * suave, _pulso: ((reloj - tr) * escala / 1.4) % 1 }
                    : { ...o, r: o.r * suave, ap: Math.max(1, o.ap * suave), _barrido: ((reloj - tr) * escala / 2.4) % 1 };
                if (o.pausa) {
                    v._resta = Math.max(0, o.pausa - (reloj - tr));
                    if (!v._resta) { v.op = (o.op ?? 1) * 0.35; delete v._barrido; }
                }
                lista.unshift(v);
            });
            if (reloj !== null) rutas.forEach(r => {
                const parte = avance(r, reloj);
                // El punto donde está detenido no repite su cartel (lo lleva el escudo con la cuenta atrás)
                const pts = (r.caida ? parte.pts.slice(1) : parte.pts).map(p => parte.pausa && p === parte.pausa.p ? { x: p.x, y: p.y } : p);
                if (pts.length) lista.push({ ...r.o, pts });
                if (!parte.completa) cabezas.push(parte.cabeza);
                if (!parte.completa && r.caida) lista.push({ ...r.caida, x: parte.cabeza.x, y: parte.cabeza.y, _movil: true, _pausa: parte.pausa || null });
            });
            return { objetos: lista, reloj, cabezas };
        };
        return { total, estado, finRutas, tiempos };
    }

    // ¿Este visor está junto a la caída o a una parada de alguna rotación?
    _visorDeRuta(v) {
        return this.doc.objetos.some(o => {
            if (o.t !== 'ruta' && o.t !== 'rutaB') return false;
            const caida = this.caidaDe(o.eq);
            return [...(caida ? [caida] : []), ...o.pts].some(p => Math.hypot(p.x - v.x, p.y - v.y) < 40);
        });
    }

    // Graba el video en el navegador (MP4 si lo soporta, si no WebM)
    // hd = false → 1080 px, 30 fps, ~4 Mbps: liviano y compatible con WhatsApp
    // hd = true  → 1920 px, 60 fps, alta tasa: máxima calidad
    grabarVideo({ hd = false, titulo = '', alProgreso = () => {} } = {}) {
        const ancho = hd ? 1920 : 1080, fps = hd ? 60 : 30;
        if (typeof MediaRecorder === 'undefined') return Promise.reject(new Error('Este navegador no puede grabar video.'));
        const cv = document.createElement('canvas');
        cv.width = ancho - ancho % 2;
        cv.height = Math.round(cv.width * this.doc.alto / TB_ANCHO / 2) * 2;
        const c = cv.getContext('2d');
        const k = cv.width / TB_ANCHO;
        // Full HD a 60 fps: H.264 High (nivel 5.1) si el navegador lo tiene; si no, el siguiente que pueda
        const tipos = hd
            ? ['video/mp4;codecs=avc1.640033', 'video/mp4;codecs=avc1.640028', 'video/mp4;codecs=avc1.42E01F', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm']
            : ['video/mp4;codecs=avc1.4D4028', 'video/mp4;codecs=avc1.42E01F', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm'];
        const tipo = tipos.find(t => MediaRecorder.isTypeSupported(t));
        if (!tipo) return Promise.reject(new Error('Este navegador no puede grabar video.'));
        const { total, estado, finRutas, tiempos } = this._guionVideo();
        const lugar = this.modo === 'mapa' ? this.mapaActual.toUpperCase() : 'VISTA AÉREA';
        const leyenda = Object.keys(TB_PUNTOS).filter(t => this.doc.objetos.some(o => o.t === t));
        try { document.fonts.load(`400 20px "Font Awesome 6 Brands"`); } catch (e) {}
        const real = this.doc;

        // Cámara: sigue a los equipos en movimiento y al terminar vuelve a mostrar todo el mapa
        const alto = this.doc.alto;
        const cam = { x: TB_ANCHO / 2, y: alto / 2, z: 1 };
        let tPrevio = 0;
        let salida = null;   // vuelta final a todo el mapa: interpolación exacta, no aproximada
        const camara = (e, t) => {
            if (t >= finRutas && !e.cabezas.length) {
                if (!salida) salida = { t, x: cam.x, y: cam.y, z: cam.z };
                const f = Math.min(1, (t - salida.t) / 1.4), s = f < 0.5 ? 2 * f * f : 1 - (-2 * f + 2) ** 2 / 2;
                cam.x = salida.x + (TB_ANCHO / 2 - salida.x) * s;
                cam.y = salida.y + (alto / 2 - salida.y) * s;
                cam.z = salida.z + (1 - salida.z) * s;
                const kk = k * cam.z;
                return { k: kk, W: cv.width, H: cv.height, ox: cv.width / 2 - cam.x * kk, oy: cv.height / 2 - cam.y * kk };
            }
            let obj = { x: TB_ANCHO / 2, y: alto / 2, z: 1 };
            if (e.cabezas.length) {
                const xs = e.cabezas.map(p => p.x), ys = e.cabezas.map(p => p.y), mg = 150;
                const x1 = Math.min(...xs) - mg, x2 = Math.max(...xs) + mg, y1 = Math.min(...ys) - mg, y2 = Math.max(...ys) + mg;
                obj = { x: (x1 + x2) / 2, y: (y1 + y2) / 2, z: Math.max(1, Math.min(2.6, TB_ANCHO / (x2 - x1), alto / (y2 - y1))) };
            }
            const dt = Math.max(0, t - tPrevio);
            tPrevio = t;
            const a = 1 - Math.exp(-dt * 2.4);
            cam.x += (obj.x - cam.x) * a;
            cam.y += (obj.y - cam.y) * a;
            cam.z = Math.exp(Math.log(cam.z) + (Math.log(obj.z) - Math.log(cam.z)) * a);
            // Que la vista no se salga del mapa
            const mw = TB_ANCHO / cam.z / 2, mh = alto / cam.z / 2;
            cam.x = Math.max(mw, Math.min(TB_ANCHO - mw, cam.x));
            cam.y = Math.max(mh, Math.min(alto - mh, cam.y));
            const kk = k * cam.z;
            return { k: kk, W: cv.width, H: cv.height, ox: cv.width / 2 - cam.x * kk, oy: cv.height / 2 - cam.y * kk };
        };

        const cuadro = t => {
            const e = estado(t);
            const vista = camara(e, t);
            this.doc = { ...real, objetos: e.objetos };
            this._exportando = true;
            try { this.dibujar(c, vista); }
            finally { this.doc = real; this._exportando = false; }
            if (leyenda.length) this._leyendaVideo(c, cv.width, cv.height, leyenda);
            if (tiempos.length && t >= finRutas + 2) this._cierreVideo(c, cv.width, cv.height, Math.min(1, (t - finRutas - 2) / 0.6), lugar, tiempos);
            this._rotulos(c, cv.width, cv.height, titulo, e.reloj !== null ? `ROTACIÓN ${relojTxt(e.reloj)}` : '');
        };

        return new Promise((resolve, reject) => {
            const flujo = cv.captureStream(fps);
            const rec = new MediaRecorder(flujo, { mimeType: tipo, videoBitsPerSecond: hd ? Math.round(cv.width * cv.height * fps * 0.06) : 4e6 });
            const trozos = [];
            rec.ondataavailable = ev => { if (ev.data.size) trozos.push(ev.data); };
            rec.onerror = ev => reject(ev.error || new Error('Falló la grabación'));
            rec.onstop = () => {
                flujo.getTracks().forEach(tr => tr.stop());
                resolve({ blob: new Blob(trozos, { type: tipo.split(';')[0] }), ext: tipo.includes('mp4') ? 'mp4' : 'webm', segundos: total });
            };
            cuadro(0);
            rec.start(250);
            const inicio = performance.now();
            const tic = () => {
                const t = (performance.now() - inicio) / 1000;
                cuadro(Math.min(t, total));
                alProgreso(Math.min(1, t / total));
                // Se sigue pintando el cuadro final un momento para que quede grabado el mapa completo
                if (t >= total + 0.6) return setTimeout(() => rec.stop(), 150);
                setTimeout(tic, 1000 / fps);
            };
            setTimeout(tic, 1000 / fps);
        });
    }

    // Leyenda abajo a la izquierda: qué significa cada punto especial del plano
    _leyendaVideo(c, W, H, tipos) {
        c.save();
        const t = Math.round(H * 0.017), m = Math.round(H * 0.018), fila = t * 2.3, ic = t * 0.85, pad = t * 0.7;
        c.font = `700 ${t}px ${TB_FUENTE}`;
        const w = pad * 2 + ic * 2 + pad + Math.max(...tipos.map(x => c.measureText(TB_PUNTOS[x].ley.toUpperCase()).width));
        const h = pad * 2 + fila * tipos.length - (fila - ic * 2);
        const x0 = m, y0 = H - m - h;
        c.globalAlpha = 0.9;
        c.fillStyle = 'rgba(5, 5, 8, 0.78)';
        c.fillRect(x0, y0, w, h);
        c.fillStyle = '#00f0ff'; c.fillRect(x0, y0, Math.max(2, t * 0.15), h);
        tipos.forEach((x, i) => {
            const d = TB_PUNTOS[x], cx = x0 + pad + ic, cy = y0 + pad + ic + i * fila;
            c.fillStyle = `rgba(${d.rgb}, 0.38)`;
            c.beginPath(); c.arc(cx, cy, ic, 0, 7); c.fill();
            c.strokeStyle = d.col; c.lineWidth = Math.max(1.5, t * 0.15); c.stroke();
            if (d.alas) this._alas(c, cx, cy + ic * 0.1, ic * 0.55, d.col);
            else this._icono(c, d.glifo, cx, cy, ic * 0.95, d.col);
            c.fillStyle = '#ffffff'; c.font = `700 ${t}px ${TB_FUENTE}`;
            c.textAlign = 'left'; c.textBaseline = 'middle';
            c.fillText(d.ley.toUpperCase(), cx + ic + pad, cy + 0.5);
        });
        c.restore();
    }

    // Cartel final del video: ROTACIÓN <MAPA> y el tiempo total (por equipo si hay varios)
    _cierreVideo(c, W, H, a, lugar, tiempos) {
        c.save();
        c.globalAlpha = a;
        c.fillStyle = 'rgba(5, 5, 8, 0.6)';
        c.fillRect(0, 0, W, H);
        const filas = tiempos.map(x => {
            const eq = this.equipo(x.eq);
            return { n: (eq ? eq.nombre : 'Equipo').toUpperCase() + (x.b ? ' · PLAN B' : ''), t: relojTxt(x.real), color: eq ? eq.color : '#00f0ff' };
        });
        const u = H / 100, varios = filas.length > 1;
        // El título manda el ancho; si no cabe, se achica la letra
        let tam = u * 5.2;
        c.font = `900 ${tam}px ${TB_FUENTE}`;
        const anchoTit = c.measureText(`ROTACIÓN ${lugar}`).width;
        if (anchoTit > W * 0.84) tam *= W * 0.84 / anchoTit;
        c.font = `900 ${tam}px ${TB_FUENTE}`;
        const w = Math.min(W * 0.94, Math.max(W * 0.6, c.measureText(`ROTACIÓN ${lugar}`).width + u * 10));
        const h = u * (varios ? 22 + filas.length * 5.5 : 26);
        const x0 = (W - w) / 2, y0 = (H - h) / 2 + (1 - a) * u * 3;
        c.fillStyle = 'rgba(5, 5, 8, 0.94)';
        c.fillRect(x0, y0, w, h);
        c.strokeStyle = '#00f0ff'; c.lineWidth = Math.max(2, u * 0.3);
        c.strokeRect(x0, y0, w, h);
        c.fillStyle = '#00f0ff'; c.fillRect(x0, y0, w, u * 0.8);
        c.textAlign = 'center'; c.textBaseline = 'middle';
        c.fillStyle = '#ffffff';
        c.font = `900 ${tam}px ${TB_FUENTE}`;
        c.fillText(`ROTACIÓN ${lugar}`, W / 2, y0 + u * 8);
        if (!varios) {
            c.font = `700 ${u * 3.6}px ${TB_FUENTE}`;
            c.fillStyle = '#00f0ff';
            c.fillText(`TIEMPO: ${filas[0].t}`, W / 2, y0 + u * 17);
        } else {
            c.font = `700 ${u * 2.6}px ${TB_FUENTE}`;
            c.fillStyle = 'rgba(255, 255, 255, 0.6)';
            c.fillText('TIEMPO', W / 2, y0 + u * 14);
            filas.forEach((f, i) => {
                const y = y0 + u * (19.5 + i * 5.5);
                c.font = `700 ${u * 2.9}px ${TB_FUENTE}`;
                c.textAlign = 'left'; c.fillStyle = f.color;
                c.fillText(f.n, x0 + w * 0.1, y);
                c.textAlign = 'right'; c.fillStyle = '#ffffff';
                c.fillText(f.t, x0 + w * 0.9, y);
            });
        }
        c.restore();
    }

    // Banda con el título (roster · mapa) y marca de agua del creador abajo a la derecha
    _rotulos(c, W, H, titulo, derecha = '') {
        c.save();
        const h = Math.round(H * 0.055);
        if (titulo || derecha) {
            c.fillStyle = 'rgba(5, 5, 8, 0.82)';
            c.fillRect(0, 0, W, h);
            c.fillStyle = '#00f0ff'; c.fillRect(0, h - 2, W, 2);
            c.font = `700 ${Math.round(h * 0.42)}px ${TB_FUENTE}`;
            c.textBaseline = 'middle'; c.textAlign = 'left'; c.fillStyle = '#ffffff';
            c.fillText(titulo, h * 0.4, h / 2);
            if (derecha) { c.textAlign = 'right'; c.fillStyle = '#00f0ff'; c.fillText(derecha, W - h * 0.4, h / 2); }
        }
        // Marca de agua
        const t = Math.round(H * 0.02), m = Math.round(H * 0.018);
        c.font = `700 ${t}px ${TB_FUENTE}`;
        const usuario = TB_CREADOR.usuario;
        const anchoTxt = c.measureText(usuario).width;
        c.font = `600 ${Math.round(t * 0.62)}px ${TB_FUENTE}`;
        const anchoSub = c.measureText('CREADO POR').width;
        const ic = t * 1.5, pad = t * 0.6;
        const w = pad + ic + pad * 0.7 + Math.max(anchoTxt, anchoSub) + pad, alto = t * 2.6;
        const x0 = W - m - w, y0 = H - m - alto;
        c.globalAlpha = 0.85;
        c.fillStyle = 'rgba(5, 5, 8, 0.75)';
        c.fillRect(x0, y0, w, alto);
        c.fillStyle = '#00f0ff'; c.fillRect(x0, y0, Math.max(2, t * 0.15), alto);
        c.fillStyle = '#ffffff';
        c.font = `400 ${ic}px "Font Awesome 6 Brands"`;
        c.textAlign = 'center'; c.textBaseline = 'middle';
        c.fillText('', x0 + pad + ic / 2, y0 + alto / 2);
        c.textAlign = 'left'; c.textBaseline = 'alphabetic';
        c.fillStyle = 'rgba(255, 255, 255, 0.65)';
        c.font = `600 ${Math.round(t * 0.62)}px ${TB_FUENTE}`;
        c.fillText('CREADO POR', x0 + pad + ic + pad * 0.7, y0 + alto * 0.42);
        c.fillStyle = '#ffffff';
        c.font = `700 ${t}px ${TB_FUENTE}`;
        c.fillText(usuario, x0 + pad + ic + pad * 0.7, y0 + alto * 0.8);
        c.restore();
    }

    // Imagen para descargar: plano + título + marca de agua
    async lienzoDescarga(ancho = 1600, titulo = '') {
        try { await document.fonts.load(`400 20px "Font Awesome 6 Brands"`); } catch (e) {}
        const c = this.lienzoExportado(ancho);
        this._rotulos(c.getContext('2d'), c.width, c.height, titulo);
        return c;
    }

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

// Diferencia entre dos ángulos en (-π, π]
function difAngulo(a, b) {
    const d = a - b;
    return Math.atan2(Math.sin(d), Math.cos(d));
}

function hexAlfa(hex, a) {
    const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
    if (!m) return `rgba(0, 240, 255, ${a})`;
    const n = parseInt(m[1], 16);
    return `rgba(${n >> 16}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}

function iniciales(n) {
    const p = String(n || '').trim().split(/\s+/).filter(Boolean);
    if (!p.length) return '??';
    return (p.length === 1 ? p[0].slice(0, 3) : p[0][0] + p[1][0]).toUpperCase();
}

// ---------- Datos de juego para el análisis ----------
// Lado real de cada imagen de mapa en metros (calibrado con las posiciones de 240 replays)
const TB_LADO_MAPA = { Bermuda: 1840, Purgatorio: 1827, Kalahari: 1420, Nexterra: 1269, Solara: 1496 };

// Reglas de zona por mapa (FFWS, iguales en las 96 partidas oficiales revisadas):
// por círculo [radio en m, espera en s, cierre en s]; el primero es el inicial.
const TB_REGLAS_ZONA = {
    Bermuda:    [[1000, 170, 240], [550, 40, 150], [300, 50, 90], [150, 50, 75], [75, 30, 60], [30, 30, 80], [30, 30, 120], [0, 0, 0]],
    Purgatorio: [[1000, 170, 240], [550, 40, 150], [300, 50, 90], [150, 50, 75], [75, 30, 60], [30, 30, 80], [30, 30, 120], [0, 0, 0]],
    Kalahari:   [[1000, 170, 240], [550, 40, 150], [300, 50, 90], [150, 50, 75], [75, 30, 60], [30, 30, 80], [30, 30, 120], [0, 0, 0]],
    Nexterra:   [[700, 210, 200], [450, 40, 150], [225, 40, 110], [115, 40, 90], [45, 30, 90], [45, 30, 120], [0, 0, 0]],
    Solara:     [[850, 190, 230], [500, 60, 115], [250, 50, 110], [125, 30, 105], [45, 30, 120], [45, 30, 120], [0, 0, 0]]
};
const TB_DANO_ZONA = [1, 2, 4, 7, 10, 15, 20];

// Fases de zona de un mapa, con tiempos desde que despega el avión.
// La fase 1 se anuncia ~50 s después del despegue; cada fase se anuncia al cerrar la anterior.
function zonasDe(mapa) {
    const reglas = TB_REGLAS_ZONA[mapa] || TB_REGLAS_ZONA.Bermuda;
    const fases = [];
    let anuncio = 50;
    for (let i = 1; i < reglas.length; i++) {
        const [, espera, cierre] = reglas[i - 1];
        const esperaReal = i === 1 ? espera - 50 : espera;
        const ini = anuncio + esperaReal, fin = ini + cierre;
        fases.push({ n: i, r: reglas[i][0], anuncio, espera: esperaReal, cierre, ini, fin, dano: TB_DANO_ZONA[i - 1] || 20 });
        anuncio = fin;
    }
    return fases;
}

// Compatibilidad: fases genéricas (Bermuda) para quien todavía use TB_ZONAS
const TB_ZONAS_ANTIGUAS = (() => {
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
const TB_ZONAS = zonasDe('Bermuda');
function diametroZona(n, mapa) {
    const z = zonasDe(mapa)[n - 1];
    return z ? z.r * 2 : 0;
}
function relojTxt(seg) {
    seg = Math.max(0, Math.round(seg));
    return seg < 60 ? `${seg}s` : `${Math.floor(seg / 60)}m ${String(seg % 60).padStart(2, '0')}s`;
}
