// Arma el paquete de un solo archivo a partir del código actual del Dev Lab.
// Uso:  node exportar/lector-estadisticas-pumas/construir.js
const fs = require('fs');
const path = require('path');
const raiz = path.join(__dirname, '..', '..');
const partes = ['js/mapstream-replay.js', 'js/estadisticas-csv.js', 'exportar/lector-estadisticas-pumas/api.js'];
const quitarExport = s => s.replace(/^if \(typeof module !== 'undefined'\) module\.exports = \w+;\s*$/m, '');
const cuerpo = partes.map((p, i) => {
    const s = fs.readFileSync(path.join(raiz, p), 'utf8');
    return `// ----- ${p} -----\n` + (i < partes.length - 1 ? quitarExport(s) : s);
}).join('\n');
const cabecera = `/*!
 * Lector de estadísticas · Pumas Gaming  (generado ${new Date().toISOString().slice(0, 10)})
 * Lee el replay de Free Fire (.bin + .json) y los CSV de estadísticas.
 * Archivo autónomo: sin dependencias, funciona en el navegador y en Node.
 * No editar a mano: se genera con exportar/lector-estadisticas-pumas/construir.js
 */
(function () {
`;
const pie = `
if (typeof window !== 'undefined') { window.LectorPumas = LectorPumas; window.FFReplay = FFReplay; window.EstadCSV = EstadCSV; }
if (typeof module !== 'undefined') module.exports = LectorPumas;
})();
`;
const destino = path.join(__dirname, 'lector-estadisticas-pumas.js');
fs.writeFileSync(destino, cabecera + cuerpo.replace(/^if \(typeof (window|module) !== 'undefined'\).*$/gm, '') + pie);
console.log('Paquete listo:', destino, Math.round(fs.statSync(destino).size / 1024) + ' KB');
