// Arma el paquete de un solo archivo a partir del código actual del Dev Lab.
// Uso:  node exportar/mapeador-ff/construir.js
const fs = require('fs');
const path = require('path');
const raiz = path.join(__dirname, '..', '..');
const partes = ['js/mapstream.js', 'js/mapstream-replay.js'];
const quitarExport = s => s.replace(/^if \(typeof module !== 'undefined'\) module\.exports = \w+;\s*$/m, '');
const cuerpo = partes.map((p, i) => {
    const s = fs.readFileSync(path.join(raiz, p), 'utf8');
    return `// ----- ${p} -----\n` + (i < partes.length - 1 ? quitarExport(s) : s);
}).join('\n');
const cabecera = `/*!
 * Mapeador FF · Pumas Gaming  (generado ${new Date().toISOString().slice(0, 10)})
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
`;
const pie = `
if (typeof window !== 'undefined') { window.MapStream = MapStream; window.FFReplay = FFReplay; }
if (typeof module !== 'undefined') module.exports = { MapStream, FFReplay };
})();
`;
const destino = path.join(__dirname, 'mapeador-ff.js');
fs.writeFileSync(destino, cabecera + cuerpo.replace(/^if \(typeof (window|module) !== 'undefined'\).*$/gm, '') + pie);
console.log('Paquete listo:', destino, Math.round(fs.statSync(destino).size / 1024) + ' KB');
