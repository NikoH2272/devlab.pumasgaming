// ============================================================
// PUMAS DEV LAB · Estrategia (Mapas, Vistas aéreas y Repisa)
// ============================================================

let tablero = null;            // instancia de Tablero
let tbActual = null;           // { id, tipo, orgId, fondo } del plano abierto
let tbSinGuardar = false;

const TB_RADIO = 90;           // a partir de qué distancia (unidades) se cruzan dos equipos
const TB_VEL_PIE = 6.5;        // m/s en sprint
const TB_VEHICULOS = [
    ['pie', 'A pie', null], ['deportivo', 'Deportivo', 137.5], ['moto', 'Motocicleta', 125],
    ['camioneta', 'Camioneta', 112.5], ['monster', 'Monster', 102.5], ['anfibio', 'Anfibio', 80], ['tuktuk', 'Tuk-Tuk', 67.5]
];
const TB_PALETA = ['#00f0ff', '#e66767', '#f5c542', '#4ade80', '#a78bfa', '#ff8a3d', '#3987e5', '#d55181', '#9ca3af', '#ffffff'];

function orgDeTrabajo() {
    return Auth.orgActivaId;
}

// ---------- Apertura ----------
async function abrirEstrategia(tipo, registro = null) {
    if (tbSinGuardar && !confirm('Hay cambios sin guardar en el plano abierto. ¿Descartarlos?')) return;
    await irA('vista-tablero');
    if (!tablero) {
        tablero = new Tablero($('#tb-canvas'), { alCambiar: alCambiarTablero, alSeleccionarEquipo: pintarEquiposTablero, alSeleccionar: () => { sincronizarPausa(); sincronizarJugador(); } });
        pintarHerramientas();
        pintarIconos();
        $('#tb-vehiculo').innerHTML = TB_VEHICULOS.map(([id, n, kmh]) => `<option value="${id}">${n}${kmh ? ` · ${kmh} km/h` : ''}</option>`).join('');
        $('#tb-mapa').innerHTML = CATALOGO.mapas.map(m => `<option value="${m}">${m}</option>`).join('');
        $('#tb-paleta').innerHTML = TB_PALETA.map(c => `<button type="button" class="tb-color" style="background:${c}" title="${c}" onclick="ponerColor('${c}')"></button>`).join('');
    }
    tablero.modo = tipo;
    $('#vista-tablero').dataset.modo = tipo;
    $$('.sb-nav > button[data-vista="vista-tablero"]').forEach(b => b.classList.toggle('activo', b.dataset.modo === tipo));
    $('#tb-titulo').textContent = tipo === 'mapa' ? 'Mapas · caídas y rotaciones' : 'Vistas aéreas';

    // Un plano siempre vive en la organización activa
    if (registro && registro.orgId !== Auth.orgActivaId) return toast('Ese plano es de otra organización.', 'error');
    tbActual = { id: registro?.id || null, tipo, orgId: Auth.orgActivaId, fondo: registro?.fondo || null };
    $('#tb-nombre').value = registro?.nombre || '';
    $('#tb-img-mapa-caja').hidden = !['admin', 'ceo', 'coach'].includes(Auth.usuario.rol);

    const rosters = (await Auth.equiposVisibles()).filter(t => t.orgId === tbActual.orgId);
    $('#tb-roster').innerHTML = '<option value="">— Toda la organización —</option>' + rosters.map(t => `<option value="${t.id}">${esc(t.nombre)}</option>`).join('');
    $('#tb-roster').value = registro?.teamId || '';
    await pintarLogosDisponibles(rosters);

    const mapa = registro?.mapa || $('#tb-mapa').value || CATALOGO.mapas[0];
    $('#tb-mapa').value = mapa;
    tablero.mapaActual = mapa;
    tablero.etiquetaFondo = tipo === 'mapa' ? mapa : 'Vista aérea';
    tablero.cargar(registro?.datos || Tablero.docVacio(), tipo === 'aerea' ? tbActual.fondo : await fondoDelMapa(mapa));
    elegirHerramienta(tipo === 'mapa' ? 'caida' : 'flecha');
    tbSinGuardar = false;
    $('#tb-estado').textContent = registro?.id ? 'Abierto desde la Repisa' : 'Sin guardar';
    pintarEquiposTablero();
    pintarAnalisisTablero();
    tbActual.recortes = [];
    setTimeout(pintarFormatoInforme, 150);
}

// Imagen subida por la organización; si no hay, la incluida en iconosobs/mapas
async function fondoDelMapa(mapa) {
    let propia = null;
    try { propia = tbActual.orgId ? await DB.mapaImagen(tbActual.orgId, mapa) : null; }
    catch (err) { /* sin tabla o sin conexión: se usa la incluida */ }
    return propia || Tablero.imagenMapa(mapa);
}

async function cambiarMapaTablero(mapa) {
    tablero.mapaActual = mapa;
    tablero.etiquetaFondo = mapa;
    tablero.ponerFondo(await fondoDelMapa(mapa));
    marcarCambio();
    pintarAnalisisTablero();
}

function alCambiarTablero(evento) {
    if (evento && evento.aviso) return mostrarPista(evento.aviso, true);
    sincronizarApertura();
    sincronizarPausa();
    sincronizarJugador();
    marcarCambio();
    pintarEquiposTablero();
    pintarAnalisisTablero();
}

// El control de apertura muestra la del cono seleccionado
function sincronizarApertura() {
    const o = tablero.seleccion && tablero.seleccion.o;
    if (o && o.t === 'caliente') marcarCalor(o.nivel || 2);
    if (!o || o.t !== 'vision') return;
    $('#tb-apertura').value = o.ap;
    $('#tb-apertura-txt').textContent = o.ap + '°';
}

function marcarCambio() {
    tbSinGuardar = true;
    $('#tb-estado').textContent = 'Cambios sin guardar';
}

function mostrarPista(txt, alerta = false) {
    const p = $('#tb-pista');
    p.textContent = txt;
    p.classList.toggle('alerta', alerta);
    if (alerta) setTimeout(() => { p.textContent = TB_HERRAMIENTAS[tablero.herr].pista; p.classList.remove('alerta'); }, 3200);
}

// ---------- Herramientas y estilo ----------
function pintarHerramientas() {
    $('#tb-herr').innerHTML = Object.entries(TB_HERRAMIENTAS).map(([id, h]) => `
        <button type="button" class="tb-herr ${h.mapa ? 'solo-mapa' : h.aerea ? 'solo-aerea' : ''}" data-h="${id}" onclick="elegirHerramienta('${id}')" title="${h.n}">
            <i class="fa-solid ${h.i}"></i><span>${h.n}</span>${atajoDe(id) ? `<kbd>${atajoDe(id)}</kbd>` : ''}
        </button>`).join('');
}

function atajoDe(herr) {
    return (Object.entries(TB_ATAJOS).find(([, h]) => h === herr) || [])[0]?.toUpperCase() || '';
}

function elegirHerramienta(id) {
    if (id !== tablero.herr || id !== 'mover') tablero.seleccion = null;
    tablero.herr = id;
    $$('.tb-herr').forEach(b => b.classList.toggle('activo', b.dataset.h === id));
    $('#tb-opc-icono').hidden = id !== 'icono';
    $('#tb-opc-logo').hidden = id !== 'logo';
    $('#tb-opc-vision').hidden = !['vision', 'mover'].includes(id);
    $('#tb-opc-calor').hidden = !['caliente', 'mover'].includes(id);
    sincronizarPausa();
    sincronizarJugador();
    $('#tb-canvas').style.cursor = id === 'mover' ? 'grab' : 'crosshair';
    mostrarPista(TB_HERRAMIENTAS[id].pista);
    tablero.dibujar();
}

function pintarIconos() {
    $('#tb-iconos').innerHTML = Object.entries(TB_ICONOS).map(([id, ic]) => `
        <button type="button" class="tb-icono ${id === tablero.estilo.icono ? 'activo' : ''}" data-ic="${id}" title="${ic.n}" onclick="elegirIcono('${id}')">
            <span class="fa-solid">${ic.u}</span>
        </button>`).join('');
}

function ponerApertura(grados) {
    $('#tb-apertura-txt').textContent = grados + '°';
    tablero.ponerApertura(grados);
}

// ---------- Pausa en un punto (caída, parada o visor) ----------
const TB_ACCIONES = ['Explorar', 'Lootear', 'Esperar zona', 'Curarse', 'Vigilar', 'Buscar vehículo', 'Pelear', 'Tomar casa'];

function sincronizarPausa() {
    const caja = $('#tb-opc-pausa');
    if (!caja) return;
    const sel = tablero && tablero.puntoPausa;
    caja.hidden = !sel;
    if (!sel) return;
    const titulo = sel.tipo === 'caida' ? 'En la caída' : sel.tipo === 'vision' ? 'Tiempo activo del visor' : sel.tipo === 'binoculares' ? 'En los binoculares' : sel.tipo === 'reposicion' ? 'En la reposición' : sel.tipo === 'uav' ? 'Escaneo del UAV' : sel.tipo === 'jugador' ? `Antes de salir · ${tablero.nombreJugador(sel.p.slot ?? 0)}` : `En la parada ${sel.b ? 'B' : ''}${sel.n}`;
    $('#tb-pausa-titulo').textContent = titulo;
    // No pisar lo que el usuario está escribiendo
    if (document.activeElement !== $('#tb-pausa-nota')) $('#tb-pausa-nota').value = sel.p.nota || '';
    if (document.activeElement !== $('#tb-pausa-seg')) $('#tb-pausa-seg').value = sel.p.pausa || '';
}

function ponerPausaTablero() {
    tablero.ponerPausa($('#tb-pausa-nota').value, $('#tb-pausa-seg').value);
}

function accionPausa(nombre) {
    $('#tb-pausa-nota').value = nombre;
    // "Activar ataque" marca desde dónde la rotación es de ataque; no necesita pausa
    if (nombre !== 'Activar ataque' && !Number($('#tb-pausa-seg').value)) $('#tb-pausa-seg').value = 30;
    ponerPausaTablero();
}

function sumarPausa(seg) {
    const el = $('#tb-pausa-seg');
    el.value = Math.max(0, (Number(el.value) || 0) + seg);
    ponerPausaTablero();
}

function quitarPausa() {
    $('#tb-pausa-nota').value = '';
    $('#tb-pausa-seg').value = '';
    ponerPausaTablero();
}

// ---------- Etiqueta del jugador (L1, L2, L3, L4, SP…) ----------
function sincronizarJugador() {
    const caja = $('#tb-opc-jugador');
    if (!caja || !tablero) return;
    const sel = tablero.marcaSeleccionada;
    const esSel = sel && sel.t === 'jugador';
    caja.hidden = tablero.modo !== 'aerea' || !(['jugador', 'rutaJ'].includes(tablero.herr) || esSel);
    if (caja.hidden) return;
    if (esSel && sel.slot !== undefined) tablero.estilo.slot = sel.slot;
    const activo = tablero.estilo.slot;
    $('#tb-jugador-titulo').textContent = tablero.herr === 'rutaJ' ? `Rotación de ${tablero.nombreJugador(activo ?? 0)}`
        : esSel ? 'Jugador seleccionado' : activo === null ? 'Los 4 jugadores están puestos' : 'Toca la imagen para poner';
    // No repintar mientras se escribe un nombre
    if (!$('#tb-slots').contains(document.activeElement)) {
        $('#tb-slots').innerHTML = TB_SLOTS.map((x, s) => {
            const puesto = !!tablero.jugadorDeSlot(s);
            const rot = tablero.doc.objetos.find(o => o.t === 'rutaJ' && o.slot === s);
            return `<div class="tb-slot ${s === activo ? 'activo' : ''}" style="--c:${x.color}" onclick="elegirSlotJugador(${s})">
                <i class="tb-slot-color"></i>
                <input value="${esc(tablero.nombreJugador(s))}" maxlength="10" aria-label="Nombre del jugador ${s + 1}" onclick="event.stopPropagation()" onchange="tablero.renombrarJugador(${s}, this.value)">
                <small>${puesto ? (rot ? `${rot.pts.length} parada${rot.pts.length > 1 ? 's' : ''}` : '✓ puesto') : 'libre'}</small>
            </div>`;
        }).join('');
    }
    const foto = esSel ? sel.foto : tablero.estilo.fotoJugador;
    $('#tb-jugador-foto').innerHTML = foto ? `<img src="${esc(foto)}" alt="">` : '<i class="fa-solid fa-user"></i>';
    $('#tb-jugador-quitar').hidden = !foto;
    $('#tb-jugador-foto-txt').textContent = esSel ? (foto ? 'Cambiar foto' : 'Poner foto') : (foto ? 'Foto lista para el próximo' : 'Foto para el próximo');
}

function elegirSlotJugador(s) {
    tablero.estilo.slot = s;
    if (!['jugador', 'rutaJ'].includes(tablero.herr)) elegirHerramienta('jugador');
    if (tablero.herr === 'rutaJ') {
        sincronizarJugador();
        return mostrarPista(tablero.jugadorDeSlot(s) ? `Toca las paradas de ${tablero.nombreJugador(s)}` : `Pon primero a ${tablero.nombreJugador(s)} con la herramienta Jugador`);
    }
    sincronizarJugador();
    mostrarPista(`Toca la imagen para poner a ${tablero.nombreJugador(s)}${tablero.jugadorDeSlot(s) ? ' (ya está: se mueve)' : ''}`);
}

async function fotoJugadorTablero(input) {
    const f = input && input.files && input.files[0];
    if (input && !f) return;
    const src = f ? await comprimirImagen(f, 256, 0.88) : null;
    const a = tablero.ponerFotoJugador(src);
    if (input) input.value = '';
    sincronizarJugador();
    if (src && a === 'siguiente') mostrarPista('Toca la imagen para poner al jugador con su foto');
}

function ponerJugadorTablero(et) {
    et = String(et || '').trim().toUpperCase().slice(0, 3);
    if (!et) return;
    tablero.ponerJugador(et);
    sincronizarJugador();
}

// Intensidad de la zona caliente (nuevas y la seleccionada)
function ponerCalor(nivel) {
    tablero.ponerCalor(nivel);
    marcarCalor(nivel);
}

function marcarCalor(nivel) {
    $$('#tb-calor button').forEach(b => b.classList.toggle('activo', Number(b.dataset.n) === nivel));
}

// ---------- Estilo de trazo y acciones de selección ----------
function ponerOpacidad(v) {
    tablero.estilo.opacidad = v / 100;
    $('#tb-opacidad-txt').textContent = v + '%';
}

function accionSeleccion(accion) {
    if (accion === 'deshacer') return tablero.deshacer();
    const hecho = tablero[accion]();
    if (!hecho && accion !== 'pegar') mostrarPista('Primero elige una marca con Mover (V)', true);
    if (hecho && accion === 'copiar') toast('Marca copiada. Pégala con Ctrl+V.');
}

// Atajos: V mover · L línea · F flecha · M jugador · T texto · C visión · R rectángulo
// O círculo · P lápiz · B borrar · Supr borra la selección · Ctrl+Z/C/V/D
document.addEventListener('keydown', ev => {
    if (!tablero || !$('#vista-tablero').classList.contains('active-view')) return;
    if (ev.target.closest?.('input, textarea, select, [contenteditable]')) return;
    const k = ev.key.toLowerCase();
    if (ev.ctrlKey || ev.metaKey) {
        const acciones = { z: 'deshacer', c: 'copiar', v: 'pegar', d: 'duplicar' };
        if (!acciones[k]) return;
        ev.preventDefault();
        if (k === 'v' || k === 'd') elegirHerramienta('mover');
        accionSeleccion(acciones[k]);
        return;
    }
    if (k === 'delete' || k === 'backspace') { ev.preventDefault(); tablero.borrarSeleccion(); return; }
    if (k === 'escape') return elegirHerramienta('mover');
    const herr = TB_ATAJOS[k];
    if (herr && TB_HERRAMIENTAS[herr] && (!TB_HERRAMIENTAS[herr].mapa || tablero.modo === 'mapa')) {
        ev.preventDefault();
        elegirHerramienta(herr);
    }
});

function elegirIcono(id) {
    tablero.estilo.icono = id;
    $$('.tb-icono').forEach(b => b.classList.toggle('activo', b.dataset.ic === id));
}

function ponerColor(c) {
    tablero.estilo.color = c;
    $('#tb-color').value = c;
}

async function pintarLogosDisponibles(rosters) {
    const orgs = await Auth.orgsVisibles();
    const org = orgs.find(o => o.id === tbActual.orgId);
    const logos = [org, ...rosters].filter(x => x && x.logo);
    tbLogosSubidos.forEach(src => logos.push({ nombre: 'Subido', logo: src }));
    $('#tb-logos').innerHTML = logos.map((x, i) => `
        <button type="button" class="tb-logo ${tablero && tablero.estilo.logo === x.logo ? 'activo' : ''}" title="${esc(x.nombre)}" onclick="elegirLogo(${i})">
            <img src="${esc(x.logo)}" alt="${esc(x.nombre)}">
        </button>`).join('') || '<p class="ayuda">Los rosters no tienen logo. Sube uno.</p>';
    tbLogosLista = logos.map(x => x.logo);
}
let tbLogosLista = [];
const tbLogosSubidos = [];

function elegirLogo(i) {
    tablero.estilo.logo = tbLogosLista[i];
    $$('.tb-logo').forEach((b, j) => b.classList.toggle('activo', j === i));
}

async function subirLogoTablero(input) {
    const f = input.files && input.files[0];
    if (!f) return;
    tbLogosSubidos.push(await comprimirImagen(f, 256, 0.9));
    input.value = '';
    await pintarLogosDisponibles((await Auth.equiposVisibles()).filter(t => t.orgId === tbActual.orgId));
    elegirLogo(tbLogosLista.length - 1);
}

// ---------- Fondos ----------
async function subirImagenMapa(input) {
    const f = input.files && input.files[0];
    if (!f) return;
    try {
        const img = await comprimirImagen(f, 1400, 0.85);
        await DB.guardarMapaImagen(tbActual.orgId, tablero.mapaActual, img);
        tablero.ponerFondo(img);
        toast(`Imagen de ${tablero.mapaActual} guardada para toda la organización.`);
    } catch (err) { toast(err.message, 'error'); }
    input.value = '';
}

async function subirImagenAerea(input) {
    const f = input.files && input.files[0];
    if (!f) return;
    tbActual.fondo = await comprimirImagen(f, 2000, 0.85);
    tbActual.recortes = [];
    tablero.ponerFondo(tbActual.fondo);
    marcarCambio();
    input.value = '';
    pintarFormatoInforme();
}

// ---------- Recortar la imagen aérea ----------
// El recuadro se mueve y se agranda con el mouse o el dedo; las marcas
// se reacomodan para quedar en el mismo lugar de la imagen.
const rc = { img: null, sel: null, prop: null, arrastre: null };

function abrirRecorte() {
    if (!tbActual || !tbActual.fondo) return toast('Primero sube la imagen aérea.', 'error');
    const im = new Image();
    im.onload = () => {
        rc.img = im;
        rc.prop = null;
        rc.sel = { x: im.naturalWidth * 0.05, y: im.naturalHeight * 0.05, w: im.naturalWidth * 0.9, h: im.naturalHeight * 0.9 };
        $('#tb-recorte-img').src = im.src;
        $('#tb-recorte').hidden = false;
        $('#tb-recorte-deshacer').hidden = !(tbActual.recortes && tbActual.recortes.length);
        $$('#tb-recorte-prop button').forEach(b => b.classList.toggle('activo', b.dataset.p === 'libre'));
        requestAnimationFrame(pintarRecorte);
    };
    im.src = tbActual.fondo;
}

function cerrarRecorte() { $('#tb-recorte').hidden = true; }

// Escala entre píxeles de la imagen y píxeles en pantalla
function escalaRecorte() {
    const img = $('#tb-recorte-img');
    return img.clientWidth / rc.img.naturalWidth || 1;
}

function pintarRecorte() {
    if (!rc.img) return;
    const s = escalaRecorte(), q = rc.sel, el = $('#tb-recorte-sel');
    el.style.left = q.x * s + 'px'; el.style.top = q.y * s + 'px';
    el.style.width = q.w * s + 'px'; el.style.height = q.h * s + 'px';
    $('#tb-recorte-medida').textContent = `${Math.round(q.w)} × ${Math.round(q.h)} px · ${(q.w / q.h).toFixed(2)}:1`;
    $$('#tb-recorte-sel i[data-h]').forEach(h => { h.hidden = !!rc.prop && h.dataset.h.length === 1; });
}

function proporcionRecorte(p) {
    $$('#tb-recorte-prop button').forEach(b => b.classList.toggle('activo', b.dataset.p === p));
    const W = rc.img.naturalWidth, H = rc.img.naturalHeight;
    if (p === 'libre') { rc.prop = null; return pintarRecorte(); }
    const [a, b] = p.split(':').map(Number);
    rc.prop = a / b;
    // El recuadro más grande con esa proporción, centrado en el actual
    let w = Math.min(W, H * rc.prop), h = w / rc.prop;
    const cx = rc.sel.x + rc.sel.w / 2, cy = rc.sel.y + rc.sel.h / 2;
    rc.sel = { x: Math.max(0, Math.min(W - w, cx - w / 2)), y: Math.max(0, Math.min(H - h, cy - h / 2)), w, h };
    pintarRecorte();
}

function iniciarArrastreRecorte(ev) {
    const h = ev.target.dataset.h || (ev.target.id === 'tb-recorte-sel' ? 'mover' : null);
    if (!h) return;
    ev.preventDefault();
    ev.target.setPointerCapture && ev.target.setPointerCapture(ev.pointerId);
    rc.arrastre = { h, x: ev.clientX, y: ev.clientY, sel: { ...rc.sel } };
}

function moverArrastreRecorte(ev) {
    const a = rc.arrastre;
    if (!a) return;
    const s = escalaRecorte(), W = rc.img.naturalWidth, H = rc.img.naturalHeight, min = 40;
    const dx = (ev.clientX - a.x) / s, dy = (ev.clientY - a.y) / s;
    let { x, y, w, h } = a.sel;
    if (a.h === 'mover') {
        x = Math.max(0, Math.min(W - w, x + dx)); y = Math.max(0, Math.min(H - h, y + dy));
    } else {
        let x2 = x + w, y2 = y + h;
        if (a.h.includes('w')) x = Math.min(x2 - min, Math.max(0, x + dx));
        if (a.h.includes('e')) x2 = Math.max(x + min, Math.min(W, x2 + dx));
        if (a.h.includes('n')) y = Math.min(y2 - min, Math.max(0, y + dy));
        if (a.h.includes('s')) y2 = Math.max(y + min, Math.min(H, y2 + dy));
        w = x2 - x; h = y2 - y;
        if (rc.prop) {
            // Con proporción fija manda el lado que más cambió; la esquina contraria queda quieta
            if (Math.abs(dx) >= Math.abs(dy)) h = w / rc.prop; else w = h * rc.prop;
            if (a.h.includes('w')) x = x2 - w;
            if (a.h.includes('n')) y = y2 - h;
            if (x < 0 || y < 0 || x + w > W || y + h > H) return;
        }
    }
    rc.sel = { x, y, w, h };
    pintarRecorte();
}

function soltarArrastreRecorte() { rc.arrastre = null; }

async function aplicarRecorte() {
    const q = rc.sel, im = rc.img;
    const lado = Math.max(q.w, q.h), escala = Math.min(1, 2000 / lado);
    const cv = document.createElement('canvas');
    cv.width = Math.round(q.w * escala); cv.height = Math.round(q.h * escala);
    const c = cv.getContext('2d');
    c.imageSmoothingQuality = 'high';
    c.drawImage(im, q.x, q.y, q.w, q.h, 0, 0, cv.width, cv.height);
    const nuevo = cv.toDataURL('image/jpeg', 0.88);
    // Las marcas se mueven con la imagen (1000 unidades = ancho de la imagen)
    const u = TB_ANCHO / im.naturalWidth, cx = q.x * u, cy = q.y * u, f = TB_ANCHO / (q.w * u);
    tablero.instantanea();
    tablero.transformarMarcas(cx, cy, f);
    (tbActual.recortes = tbActual.recortes || []).push({ fondo: tbActual.fondo, cx, cy, f });
    tbActual.fondo = nuevo;
    tablero.ponerFondo(nuevo);
    tablero.vista = { z: 1, x: 0, y: 0 };
    cerrarRecorte();
    marcarCambio();
    setTimeout(pintarFormatoInforme, 120);
    toast('Imagen recortada. Las marcas se acomodaron al recorte.');
}

function deshacerRecorte() {
    const r = tbActual.recortes && tbActual.recortes.pop();
    if (!r) return;
    tablero.instantanea();
    tablero.transformarMarcas(-r.cx * r.f, -r.cy * r.f, 1 / r.f);
    tbActual.fondo = r.fondo;
    tablero.ponerFondo(r.fondo);
    cerrarRecorte();
    marcarCambio();
    setTimeout(pintarFormatoInforme, 120);
    toast('Se volvió a la imagen anterior.');
}

// ---------- Formato del video: informe al lado o debajo ----------
function ponerFormatoInforme(v) {
    tablero.instantanea();
    tablero.doc.informe = v;
    marcarCambio();
    pintarFormatoInforme();
}

function pintarFormatoInforme() {
    const sel = $('#tb-informe');
    if (!sel || !tablero) return;
    sel.value = tablero.doc.informe || 'auto';
    const f = tablero.formatoInforme();
    $('#tb-informe-txt').textContent = f === 'abajo' ? 'Video vertical 9:16 · informe debajo' : 'Video horizontal 16:9 · informe al lado';
}

// ---------- Equipos del plano (modo mapa) ----------
function pintarEquiposTablero() {
    if (!tablero || tablero.modo !== 'mapa') return;
    const eqs = tablero.doc.equipos;
    $('#tb-n-equipos').textContent = eqs.length;
    $('#tb-equipos').innerHTML = eqs.length ? eqs.map(e => `
        <div class="tb-eq ${e.id === tablero.equipoSel ? 'sel' : ''}" style="border-left-color:${e.color}" onclick="tablero.seleccionarEquipo('${e.id}')">
            <label class="tb-eq-logo" title="Cambiar el ícono de ${esc(e.nombre)}" onclick="event.stopPropagation()">
                ${e.logo ? `<img src="${esc(e.logo)}" alt="">` : `<span class="tb-eq-ini" style="color:${e.color}">${esc(iniciales(e.nombre))}</span>`}
                <i class="fa-solid fa-camera"></i>
                <input type="file" accept="image/*" hidden onchange="logoEquipoTablero('${e.id}', this)">
            </label>
            <div class="tb-eq-n"><strong>${esc(e.nombre)}</strong>
                <small>${tablero.caidaDe(e.id) ? 'caída ✓' : 'sin caída'} · ${(tablero.rutaDe(e.id)?.pts.length || 0)} paradas${tablero.rutaDe(e.id, 'rutaB') ? ' · plan B' : ''}${e.propio ? ' · propio' : ''}</small></div>
            ${e.logo ? `<button type="button" class="btn-link" onclick="event.stopPropagation(); logoEquipoTablero('${e.id}', null)" title="Quitar ícono" aria-label="Quitar ícono de ${esc(e.nombre)}"><i class="fa-solid fa-image"></i></button>` : ''}
            <button type="button" class="btn-link" onclick="event.stopPropagation(); tablero.quitarEquipo('${e.id}')" aria-label="Quitar ${esc(e.nombre)}">✕</button>
        </div>`).join('') : '<p class="ayuda">Agrega tus rosters y los rivales de la partida.</p>';
}

async function agregarMisRosters() {
    const rosters = (await Auth.equiposVisibles()).filter(t => t.orgId === tbActual.orgId);
    rosters.forEach((t, i) => tablero.agregarEquipo({ id: 'r_' + t.id, nombre: t.nombre, color: TB_PALETA[i % TB_PALETA.length], logo: t.logo, propio: true }));
    if (!rosters.length) toast('No tienes rosters visibles en esta organización.', 'error');
}

async function agregarRival(e) {
    e.preventDefault();
    const f = e.target;
    const nombre = f.nombre.value.trim();
    if (!nombre) return;
    if (tablero.doc.equipos.length >= 24) return toast('Máximo 24 equipos por plano.', 'error');
    const archivo = f.logo.files && f.logo.files[0];
    const logo = archivo ? await comprimirImagen(archivo, 256, 0.9) : null;
    tablero.agregarEquipo({ id: 'x_' + Date.now().toString(36), nombre: nombre.slice(0, 22), color: f.color.value, logo, propio: false });
    f.nombre.value = '';
    f.logo.value = '';
    $('#tb-rival-logo').classList.remove('listo');
    f.color.value = TB_PALETA[tablero.doc.equipos.length % TB_PALETA.length];
}

// Ícono de un equipo ya creado (input = null lo quita)
async function logoEquipoTablero(id, input) {
    const eq = tablero.equipo(id);
    if (!eq) return;
    const f = input && input.files && input.files[0];
    if (input && !f) return;
    const logo = f ? await comprimirImagen(f, 256, 0.9) : null;
    tablero.instantanea();
    eq.logo = logo;
    tablero.cambio();
    if (input) input.value = '';
}

// ---------- Análisis táctico (modo mapa) ----------
// No predice bajas: mide a cuántos rivales te expones y si los tiempos te dan
function analizarPlano() {
    const doc = tablero.doc, mapa = tablero.mapaActual;
    const yo = tablero.equipo(tablero.equipoSel);
    if (!yo) return null;
    const caida = tablero.caidaDe(yo.id);
    if (!caida) return { yo };
    const m = u => u * metrosPorUnidad(mapa);
    const vehiculo = TB_VEHICULOS.find(v => v[0] === $('#tb-vehiculo').value) || TB_VEHICULOS[0];
    const vel = vehiculo[2] ? vehiculo[2] / 3.6 : TB_VEL_PIE;
    const largoDe = pts => { let s = 0; for (let i = 0; i < pts.length - 1; i++) s += Math.hypot(pts[i + 1].x - pts[i].x, pts[i + 1].y - pts[i].y); return s; };

    const otros = doc.equipos.filter(e => e.id !== yo.id).map(e => ({ e, c: tablero.caidaDe(e.id) })).filter(x => x.c);
    const ruta = tablero.rutaDe(yo.id);
    const camino = [caida, ...(ruta ? ruta.pts : [])];

    const vecinos = otros.filter(x => Math.hypot(x.c.x - caida.x, x.c.y - caida.y) < TB_RADIO);
    const cruces = camino.length > 1 ? otros.filter(x => {
        if (vecinos.includes(x)) return false;
        for (let i = 0; i < camino.length - 1; i++) if (distSegmento(x.c, camino[i], camino[i + 1]) < TB_RADIO) return true;
        return false;
    }) : [];
    const masCerca = otros.map(x => ({ n: x.e.nombre, d: Math.hypot(x.c.x - caida.x, x.c.y - caida.y) })).sort((a, b) => a.d - b.d)[0];

    const largo = largoDe(camino);
    const rutaB = tablero.rutaDe(yo.id, 'rutaB');
    const caminoB = rutaB ? [caida, ...rutaB.pts] : null;

    // Zonas calientes que toca cada plan (y las que rodean la caída)
    const calientesDe = pts => {
        const s = new Set();
        for (let i = 0; i < pts.length - 1; i++) tablero.calientesEnTramo(pts[i], pts[i + 1]).forEach(o => s.add(o));
        return [...s];
    };
    const enCaida = doc.objetos.filter(o => o.t === 'caliente' && Math.hypot(o.x - caida.x, o.y - caida.y) < o.r);
    const calA = camino.length > 1 ? calientesDe(camino).filter(o => !enCaida.includes(o)) : [];
    const planB = caminoB && caminoB.length > 1 ? {
        largo: largoDe(caminoB),
        calientes: calientesDe(caminoB).filter(o => !enCaida.includes(o)),
        cruces: otros.filter(x => !vecinos.includes(x) && caminoB.some((p, i) => i < caminoB.length - 1 && distSegmento(x.c, p, caminoB[i + 1]) < TB_RADIO))
    } : null;

    const franjas = [0, 0, 0];
    doc.equipos.forEach(e => { const c = tablero.caidaDe(e.id); if (c) franjas[Math.min(2, Math.floor(c.x / (TB_ANCHO / 3)))]++; });

    const fases = doc.objetos.filter(o => o.t === 'segura').sort((a, b) => a.n - b.n).map(z => {
        const fase = zonasDe(mapa)[z.n - 1];
        if (!fase) return null;
        const fuera = Math.max(0, Math.hypot(z.x - caida.x, z.y - caida.y) - z.r);
        const viaje = m(fuera) / vel;
        return { n: z.n, fase, dentro: fuera === 0, metros: Math.round(m(fuera)), viaje, margen: fase.fin - viaje };
    }).filter(Boolean);

    // Distancia a la ruta del avión (planeo estimado: 45 m/s, alcance ~900 m)
    let avion = null;
    const av = doc.objetos.find(o => o.t === 'avion' && o.a && o.b);
    if (av) {
        const vx = av.b.x - av.a.x, vy = av.b.y - av.a.y, L2 = vx * vx + vy * vy || 1;
        const t = ((caida.x - av.a.x) * vx + (caida.y - av.a.y) * vy) / L2;
        const d = Math.hypot(caida.x - (av.a.x + t * vx), caida.y - (av.a.y + t * vy));
        avion = { metros: Math.round(m(d)), planeo: m(d) / 45, lejos: m(d) > 900 };
    }

    const exp = vecinos.length + cruces.length;
    return { yo, caida, vecinos, cruces, exp, masCerca, largo, franjas, fases, avion, vehiculo, vel, m, enCaida, calA, planB };
}

function pintarAnalisisTablero() {
    if (!tablero || tablero.modo !== 'mapa') return;
    // Los tiempos de cada parada en el mapa usan el transporte elegido
    const v = TB_VEHICULOS.find(x => x[0] === $('#tb-vehiculo').value) || TB_VEHICULOS[0];
    const vel = v[2] ? v[2] / 3.6 : TB_VEL_PIE;
    if (tablero.velocidadRuta !== vel) { tablero.velocidadRuta = vel; tablero.dibujar(); }
    const a = analizarPlano();
    const cont = $('#tb-analisis');
    if (!a) { cont.innerHTML = '<p class="ayuda">Elige tu equipo en la lista para analizar su plan.</p>'; return; }
    if (!a.caida) { cont.innerHTML = `<p class="ayuda">Coloca la caída de ${esc(a.yo.nombre)} para ver el análisis.</p>`; return; }

    const lectura = a.exp === 0 ? ['ZONA', 'bien', 'Nadie a tu alcance: no hay bajas que buscar aquí. Juega el cierre y rota temprano.']
        : a.exp <= 2 ? ['SELECTIVO', 'info', `Te expones a ${a.exp} equipo(s). Pelea solo lo que puedas ganar rápido.`]
        : a.exp <= 4 ? ['AGRESIVO', 'alerta', `${a.exp} equipos a tu alcance. Hay bajas de sobra, pero necesitas ventaja de posición antes de abrir.`]
        : ['SATURADO', 'alerta', `${a.exp} equipos encima: aquí no eliges la pelea, te la eligen. Considera mover la caída o la ruta.`];
    const nombres = ['Izquierda', 'Centro', 'Derecha'];
    const maxF = Math.max(1, ...a.franjas);

    cont.innerHTML = `
        <div class="nota nota-${lectura[1]}"><div><strong>${lectura[0]}</strong><p>${esc(lectura[2])}</p>
            <p><small>${a.vecinos.length} en la caída · ${a.cruces.length} en la rotación${a.masCerca ? ` · más cerca: ${esc(a.masCerca.n)} a ${Math.round(a.m(a.masCerca.d))} m` : ''}</small></p></div></div>
        <div class="tb-dato"><span>Equipos por zona</span></div>
        ${a.franjas.map((v, i) => `<div class="tb-barra"><span>${nombres[i]}</span><i><b style="width:${v / maxF * 100}%"></b></i><strong>${v}</strong></div>`).join('')}
        ${a.largo ? `
        <div class="tb-dato"><span>Rotación${a.planB ? ' A' : ''} (mapa de ${TB_LADO_MAPA[tablero.mapaActual]} m)</span></div>
        <div class="tb-fila"><span>Distancia</span><strong>${Math.round(a.m(a.largo))} m</strong></div>
        <div class="tb-fila"><span>${esc(a.vehiculo[1])}</span><strong>${relojTxt(a.m(a.largo) / a.vel)}</strong></div>
        ${a.vehiculo[2] ? `<div class="tb-fila"><span>A pie</span><strong>${relojTxt(a.m(a.largo) / TB_VEL_PIE)}</strong></div>` : ''}` : ''}
        ${a.planB ? `
        <div class="tb-dato"><span>Plan A vs plan B</span></div>
        <div class="tb-fila"><span></span><span><strong>A</strong> · <strong>B</strong></span></div>
        <div class="tb-fila"><span>Distancia</span><strong>${Math.round(a.m(a.largo))} m · ${Math.round(a.m(a.planB.largo))} m</strong></div>
        <div class="tb-fila"><span>${esc(a.vehiculo[1])}</span><strong>${relojTxt(a.m(a.largo) / a.vel)} · ${relojTxt(a.m(a.planB.largo) / a.vel)}</strong></div>
        <div class="tb-fila"><span>Equipos que cruza</span><strong>${a.cruces.length} · ${a.planB.cruces.length}</strong></div>
        <div class="tb-fila"><span>Zonas calientes</span><strong>${a.calA.length} · ${a.planB.calientes.length}</strong></div>
        <p class="ayuda">${(() => {
            const pa = a.cruces.length + a.calA.length * 2, pb = a.planB.cruces.length + a.planB.calientes.length * 2;
            return pa === pb ? (a.largo <= a.planB.largo ? 'Mismo riesgo: A es más corta.' : 'Mismo riesgo: B es más corta.') : pa < pb ? 'A es la rotación más limpia.' : 'B es la rotación más limpia: úsala si llegan tarde o la caída se complica.';
        })()}</p>` : ''}
        ${a.enCaida.length || a.calA.length ? `
        <div class="tb-dato"><span>Zonas calientes</span></div>
        ${a.enCaida.map(o => `<div class="tb-fila"><span><i class="tb-punto" style="background:${TB_CALOR[o.nivel || 2].color}"></i>Caes dentro de una zona ${TB_CALOR[o.nivel || 2].n.toLowerCase()}</span></div>`).join('')}
        ${a.calA.map(o => `<div class="tb-fila"><span><i class="tb-punto" style="background:${TB_CALOR[o.nivel || 2].color}"></i>La rotación cruza una zona ${TB_CALOR[o.nivel || 2].n.toLowerCase()}</span><strong class="${(o.nivel || 2) === 3 ? 'mal' : ''}">${(o.nivel || 2) === 3 ? 'evítala' : 'con cuidado'}</strong></div>`).join('')}` : ''}
        ${a.avion ? `
        <div class="tb-dato"><span>Salto desde el avión (estimado)</span></div>
        <div class="tb-fila"><span>Planeo</span><strong class="${a.avion.lejos ? 'mal' : ''}">${a.avion.metros} m${a.avion.lejos ? ' · fuera de alcance' : ''}</strong></div>
        <div class="tb-fila"><span>En el aire</span><strong>${relojTxt(a.avion.planeo)}</strong></div>` : ''}
        ${a.fases.length ? `
        <div class="tb-dato"><span>Fases de zona · llegada desde la caída</span></div>
        ${a.fases.map(f => `<div class="tb-fila"><span>Z${f.n} · ⌀ ${f.fase.r * 2} m · cierra ${relojTxt(f.fase.fin)} · ${f.fase.dano} HP/s</span>
            <strong class="${f.dentro || f.margen > 45 ? 'bien' : f.margen > 0 ? '' : 'mal'}">${f.dentro ? 'dentro ✓' : `${f.metros} m · ${f.margen > 0 ? 'sobran ' + relojTxt(f.margen) : 'tarde ' + relojTxt(-f.margen)}`}</strong></div>`).join('')}` : ''}
        ${a.cruces.length ? `<div class="tb-dato"><span>Tu rotación cruza con</span></div>
            ${a.cruces.map(x => `<div class="tb-fila"><span><i class="tb-punto" style="background:${x.e.color}"></i>${esc(x.e.nombre)}</span></div>`).join('')}` : ''}
        <p class="ayuda" style="margin-top:8px">Escala y fases de zona calibradas con partidas oficiales (tiempos desde que despega el avión). El planeo es una estimación.</p>`;
}

// ---------- Guardar, exportar, nuevo ----------
async function guardarTablero() {
    const nombre = $('#tb-nombre').value.trim();
    if (!nombre) { $('#tb-nombre').focus(); return toast('Ponle un nombre al plano.', 'error'); }
    if (!tbActual.orgId) return toast('Primero crea una organización.', 'error');
    if (tbActual.tipo === 'aerea' && !tbActual.fondo) return toast('Sube primero la imagen aérea.', 'error');
    const mini = tablero.lienzoExportado(360);
    const registro = {
        id: tbActual.id, orgId: tbActual.orgId, teamId: $('#tb-roster').value || null, tipo: tbActual.tipo, nombre,
        mapa: tbActual.tipo === 'mapa' ? tablero.mapaActual : null,
        fondo: tbActual.tipo === 'aerea' ? tbActual.fondo : null,
        miniatura: mini.toDataURL('image/jpeg', 0.7),
        datos: tablero.doc
    };
    try {
        tbActual.id = await DB.guardarTablero(registro);
        tbSinGuardar = false;
        $('#tb-estado').textContent = 'Guardado en la Repisa';
        toast('Plano guardado en la Repisa.');
    } catch (err) { toast(err.message, 'error'); }
}

// Título de las descargas: roster · mapa (· nombre del plano)
function partesDescarga() {
    const sel = $('#tb-roster');
    const propio = tablero.equipo(tablero.equipoSel);
    const roster = sel.value ? sel.options[sel.selectedIndex].text : propio && propio.propio ? propio.nombre : '';
    const mapa = tbActual.tipo === 'mapa' ? tablero.mapaActual : 'Vista aérea';
    return [roster, mapa, $('#tb-nombre').value.trim()].filter(Boolean);
}

function tituloDescarga() {
    return partesDescarga().join(' · ').toUpperCase();
}

function archivoDescarga() {
    return partesDescarga().join('-').toLowerCase().replace(/[^a-z0-9áéíóúñ]+/gi, '-').replace(/^-|-$/g, '');
}

async function descargarTablero() {
    const c = await tablero.lienzoDescarga(1600, tituloDescarga());
    const nombre = archivoDescarga();
    c.toBlob(b => {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(b);
        a.download = `pumas-${nombre}-${fechaLocal(new Date())}.png`;
        document.body.appendChild(a);
        a.click();
        setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
    }, 'image/png');
}

let tbGrabando = false;
async function descargarVideoTablero(btn, hd = false) {
    if (tbGrabando) return;
    if (!tablero.doc.objetos.length) return toast('El plano está vacío: no hay nada que animar.', 'error');
    tbGrabando = true;
    const html = btn.innerHTML;
    btn.disabled = true;
    const titulo = tituloDescarga();
    toast('Grabando el video… deja esta pestaña abierta y a la vista.');
    try {
        const { blob, ext } = await tablero.grabarVideo({
            hd, titulo,
            alProgreso: f => { btn.innerHTML = `<i class="fa-solid fa-circle" style="color:#ff3b30"></i> ${Math.round(f * 100)}%`; }
        });
        const nombre = archivoDescarga();
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `pumas-${nombre}-${fechaLocal(new Date())}${hd ? '-hd' : ''}.${ext}`;
        document.body.appendChild(a);
        a.click();
        setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 3000);

        if (ext === 'mp4') toast(`Video${hd ? ' HD' : ''} listo (${(blob.size / 1048576).toFixed(1)} MB).`);
        else toast('Tu navegador grabó en WebM: WhatsApp no lo reproduce. Usa Chrome o Edge actualizados para MP4.', 'error');
    } catch (err) {
        toast(err.message, 'error');
    } finally {
        tbGrabando = false;
        btn.disabled = false;
        btn.innerHTML = html;
    }
}

function nuevoTablero() {
    abrirEstrategia(tbActual ? tbActual.tipo : 'mapa');
}

function limpiarTablero() {
    if (!confirm('¿Borrar todas las marcas del plano? Los equipos se mantienen.')) return;
    tablero.instantanea();
    tablero.doc.objetos = [];
    tablero.cambio();
}

// ---------- Repisa ----------
async function renderRepisa() {
    const f = $('#repisa-filtros');
    if (!f.mapa.options.length) {
        f.mapa.innerHTML = '<option value="">Todos los mapas</option>' + CATALOGO.mapas.map(m => `<option value="${m}">${m}</option>`).join('');
    }
    const rosters = await Auth.equiposVisibles();
    const sel = f.roster.value;
    f.roster.innerHTML = '<option value="">Todos los rosters</option>' + rosters.map(t => `<option value="${t.id}">${esc(t.nombre)}</option>`).join('');
    f.roster.value = sel;

    let lista;
    try { lista = (await DB.tableros()).filter(t => t.orgId === Auth.orgActivaId); }
    catch (err) {
        $('#repisa-lista').innerHTML = `<p class="vacio">${esc(/tableros/.test(err.message) ? 'Falta ejecutar la migración 006_estrategia.sql en Supabase.' : err.message)}</p>`;
        return;
    }
    const usuarios = await DB.usuarios().catch(() => []);
    lista = lista.filter(t => (!f.tipo.value || t.tipo === f.tipo.value) && (!f.mapa.value || t.mapa === f.mapa.value) && (!f.roster.value || t.teamId === f.roster.value));

    $('#repisa-lista').innerHTML = lista.length ? lista.map(t => {
        const autor = usuarios.find(u => u.id === t.creadoPor);
        const roster = rosters.find(r => r.id === t.teamId);
        const puedeBorrar = t.creadoPor === Auth.usuario.id || ['admin', 'ceo'].includes(Auth.usuario.rol);
        return `
        <div class="repisa-card">
            <button type="button" class="repisa-mini" onclick="abrirDeRepisa('${t.id}')" title="Abrir">
                ${t.miniatura ? `<img src="${esc(t.miniatura)}" alt="Vista previa de ${esc(t.nombre)}">` : '<i class="fa-solid fa-map"></i>'}
            </button>
            <div class="repisa-info">
                <span class="repisa-tipo">${t.tipo === 'mapa' ? esc(t.mapa || 'Mapa') : 'Vista aérea'}</span>
                <strong>${esc(t.nombre)}</strong>
                <small>${roster ? esc(roster.nombre) + ' · ' : ''}${autor ? '@' + esc(autor.usuario) + ' · ' : ''}${new Date(t.actualizado).toLocaleDateString('es')}</small>
            </div>
            <div class="repisa-acciones">
                <button type="button" class="btn-link" onclick="abrirDeRepisa('${t.id}')">Abrir</button>
                <button type="button" class="btn-link" onclick="duplicarDeRepisa('${t.id}')">Duplicar</button>
                ${puedeBorrar ? `<button type="button" class="btn-link" onclick="borrarDeRepisa('${t.id}')">Eliminar</button>` : ''}
            </div>
        </div>`;
    }).join('') : '<p class="vacio">La repisa está vacía. Guarda un mapa o una vista aérea para verlo aquí.</p>';
}

async function abrirDeRepisa(id) {
    try {
        const t = await DB.tablero(id);
        await abrirEstrategia(t.tipo, t);
    } catch (err) { toast(err.message, 'error'); }
}

async function duplicarDeRepisa(id) {
    try {
        const t = await DB.tablero(id);
        await abrirEstrategia(t.tipo, { ...t, id: null, nombre: t.nombre + ' (copia)' });
        marcarCambio();
    } catch (err) { toast(err.message, 'error'); }
}

async function borrarDeRepisa(id) {
    if (!confirm('¿Eliminar este plano de la repisa? No se puede deshacer.')) return;
    try {
        await DB.eliminarTablero(id);
        renderRepisa();
    } catch (err) { toast(err.message, 'error'); }
}

// Avisar antes de salir con cambios sin guardar
window.addEventListener('beforeunload', ev => {
    if (tbSinGuardar) { ev.preventDefault(); ev.returnValue = ''; }
});
