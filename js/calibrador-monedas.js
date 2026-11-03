// Biblioteca local de ubicaciones de monedas por mapa.
const MONEDAS_BIBLIOTECA_KEY = 'pumasDevLab.ubicacionesMonedas.v1';
let monedasCalibrador = { mapa: '', imagen: null, puntos: [], borrar: false, sucio: false };

function leerBibliotecaMonedas() {
    try {
        const datos = JSON.parse(localStorage.getItem(MONEDAS_BIBLIOTECA_KEY) || '{}');
        return datos && typeof datos === 'object' ? datos : {};
    } catch (_) { return {}; }
}

function contarUbicacionesMonedas(mapa) {
    if (!mapa) return 0;
    const puntos = leerBibliotecaMonedas()[mapa];
    return Array.isArray(puntos) ? puntos.length : 0;
}

function abrirCalibradorMonedas() {
    let modal = document.getElementById('cal-monedas-modal');
    if (!modal) {
        document.body.insertAdjacentHTML('beforeend', `<div id="cal-monedas-modal" class="cal-monedas-backdrop" hidden>
            <section class="cal-monedas-dialog" role="dialog" aria-modal="true" aria-labelledby="cal-monedas-titulo">
                <header><div><h2 id="cal-monedas-titulo">Calibrador de monedas</h2><p>Haz clic en el mapa para registrar cada ubicación. Los puntos se guardan en la biblioteca del mapa seleccionado.</p></div>
                    <button type="button" class="btn-sec" onclick="cerrarCalibradorMonedas()" aria-label="Cerrar">×</button></header>
                <label class="cal-monedas-mapa">Mapa<select id="cal-monedas-mapa" onchange="cambiarMapaCalibrador(this.value)"></select></label>
                <div class="cal-monedas-canvas-wrap"><canvas id="cal-monedas-canvas" aria-label="Mapa para calibrar las ubicaciones de monedas"></canvas></div>
                <div class="cal-monedas-actions">
                    <button type="button" class="btn-sec" id="cal-monedas-borrar-modo" onclick="alternarBorradoMonedas()"><i class="fa-solid fa-eraser"></i> Borrar punto</button>
                    <button type="button" class="btn-sec" onclick="deshacerPuntoMoneda()"><i class="fa-solid fa-rotate-left"></i> Deshacer último</button>
                    <button type="button" class="btn-sec" onclick="limpiarPuntosMoneda()"><i class="fa-solid fa-trash"></i> Limpiar mapa</button>
                    <button type="button" class="btn-generar" onclick="guardarPuntosMoneda()"><i class="fa-solid fa-floppy-disk"></i> Guardar biblioteca</button>
                </div>
                <p id="cal-monedas-estado" class="cal-monedas-estado" aria-live="polite"></p>
            </section></div>`);
        modal = document.getElementById('cal-monedas-modal');
        modal.addEventListener('click', ev => { if (ev.target === modal) cerrarCalibradorMonedas(); });
        document.getElementById('cal-monedas-canvas').addEventListener('click', clickCalibradorMonedas);
        document.getElementById('cal-monedas-canvas').addEventListener('contextmenu', ev => ev.preventDefault());
    }
    const select = document.getElementById('cal-monedas-mapa');
    select.innerHTML = CATALOGO.mapas.map(m => `<option value="${esc(m)}">${esc(m)}</option>`).join('');
    select.value = tablero?.mapaActual && CATALOGO.mapas.includes(tablero.mapaActual) ? tablero.mapaActual : CATALOGO.mapas[0];
    modal.hidden = false;
    document.body.classList.add('cal-monedas-abierto');
    cambiarMapaCalibrador(select.value);
}

function cerrarCalibradorMonedas() {
    const modal = document.getElementById('cal-monedas-modal');
    if (!modal) return;
    if (monedasCalibrador.sucio && !confirm('Hay ubicaciones sin guardar. ¿Cerrar y descartarlas?')) return;
    modal.hidden = true;
    document.body.classList.remove('cal-monedas-abierto');
    monedasCalibrador.sucio = false;
}

async function cambiarMapaCalibrador(mapa) {
    if (monedasCalibrador.sucio && !confirm('Hay ubicaciones sin guardar. ¿Descartar los cambios?')) {
        document.getElementById('cal-monedas-mapa').value = monedasCalibrador.mapa;
        return;
    }
    monedasCalibrador = { mapa, imagen: null, puntos: (leerBibliotecaMonedas()[mapa] || []).map(p => ({ x: p.x, y: p.y })), borrar: false, sucio: false };
    const canvas = document.getElementById('cal-monedas-canvas');
    const estado = document.getElementById('cal-monedas-estado');
    estado.textContent = 'Cargando mapa…';
    try {
        const src = typeof fondoDelMapa === 'function' ? await fondoDelMapa(mapa) : Tablero.imagenMapa(mapa);
        if (!src) throw new Error('Este mapa no tiene una imagen disponible.');
        const img = new Image();
        await new Promise((resolve, reject) => { img.onload = resolve; img.onerror = () => reject(new Error('No se pudo cargar la imagen del mapa.')); img.src = src; });
        if (monedasCalibrador.mapa !== mapa) return;
        monedasCalibrador.imagen = img;
        canvas.width = 1000;
        canvas.height = Math.max(1, Math.round(1000 * img.naturalHeight / img.naturalWidth));
        dibujarCalibradorMonedas();
        actualizarEstadoCalibrador();
    } catch (err) { estado.textContent = err.message; }
}

function dibujarCalibradorMonedas() {
    const canvas = document.getElementById('cal-monedas-canvas'), ctx = canvas?.getContext('2d');
    if (!ctx || !monedasCalibrador.imagen) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(monedasCalibrador.imagen, 0, 0, canvas.width, canvas.height);
    monedasCalibrador.puntos.forEach((p, i) => {
        const x = p.x * canvas.width, y = p.y * canvas.height, r = 15;
        ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fillStyle = 'rgba(5,5,8,.82)'; ctx.fill();
        ctx.lineWidth = 2; ctx.strokeStyle = '#00f0ff'; ctx.stroke();
        ctx.font = '20px "Segoe UI Emoji", sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#fff'; ctx.fillText('\u{1FA99}', x, y + 1);
        ctx.font = '700 11px Arial'; ctx.textAlign = 'left'; ctx.fillStyle = '#fff'; ctx.fillText(String(i + 1), x + 17, y - 13);
    });
}

function clickCalibradorMonedas(ev) {
    const canvas = ev.currentTarget, rect = canvas.getBoundingClientRect();
    const x = (ev.clientX - rect.left) / rect.width, y = (ev.clientY - rect.top) / rect.height;
    if (monedasCalibrador.borrar) {
        let cercano = -1, distancia = Infinity;
        monedasCalibrador.puntos.forEach((p, i) => { const d = Math.hypot((p.x - x) * canvas.width, (p.y - y) * canvas.height); if (d < distancia) { distancia = d; cercano = i; } });
        if (cercano >= 0 && distancia < 30) { monedasCalibrador.puntos.splice(cercano, 1); monedasCalibrador.sucio = true; }
    } else {
        monedasCalibrador.puntos.push({ x, y });
        monedasCalibrador.sucio = true;
    }
    dibujarCalibradorMonedas();
    actualizarEstadoCalibrador();
}

function alternarBorradoMonedas() {
    monedasCalibrador.borrar = !monedasCalibrador.borrar;
    document.getElementById('cal-monedas-borrar-modo')?.classList.toggle('activo', monedasCalibrador.borrar);
    actualizarEstadoCalibrador();
}

function deshacerPuntoMoneda() {
    if (!monedasCalibrador.puntos.length) return;
    monedasCalibrador.puntos.pop(); monedasCalibrador.sucio = true;
    dibujarCalibradorMonedas(); actualizarEstadoCalibrador();
}

function limpiarPuntosMoneda() {
    if (!monedasCalibrador.puntos.length) return;
    monedasCalibrador.puntos = []; monedasCalibrador.sucio = true;
    dibujarCalibradorMonedas(); actualizarEstadoCalibrador();
}

function guardarPuntosMoneda() {
    const biblioteca = leerBibliotecaMonedas();
    biblioteca[monedasCalibrador.mapa] = monedasCalibrador.puntos;
    try {
        localStorage.setItem(MONEDAS_BIBLIOTECA_KEY, JSON.stringify(biblioteca));
        monedasCalibrador.sucio = false;
        actualizarEstadoCalibrador();
        if (typeof actualizarCalculadoraMonedas === 'function') actualizarCalculadoraMonedas();
        if (typeof toast === 'function') toast(`Biblioteca de monedas guardada para ${monedasCalibrador.mapa}.`);
    } catch (_) { document.getElementById('cal-monedas-estado').textContent = 'No se pudo guardar la biblioteca en este navegador.'; }
}

function actualizarEstadoCalibrador() {
    const estado = document.getElementById('cal-monedas-estado');
    if (!estado) return;
    const n = monedasCalibrador.puntos.length;
    estado.textContent = `${n} ${n === 1 ? 'ubicación marcada' : 'ubicaciones marcadas'}${monedasCalibrador.sucio ? ' · cambios sin guardar' : ' · biblioteca guardada'}${monedasCalibrador.borrar ? ' · toca un punto para borrarlo' : ' · toca el mapa para agregar'}`;
}
