# Lector de estadísticas de Free Fire · portal de resultados de Pumas Gaming

Te paso un lector ya hecho y probado. Quiero integrarlo en la página de **resultados del portal de Pumas Gaming** (solo resultados: tablas de partidas, torneo, jugadores y armas). Responde y escribe todo en español.

## Qué es
Un archivo JavaScript autónomo, `lector-estadisticas-pumas.js` (~60 KB, sin dependencias, funciona en el navegador y en Node). Lee dos tipos de entrada:
1. **CSV oficial de estadísticas** (106 columnas: `match_id, account_id, nickname, team_name, kills, damage, weapon_usages, …`).
2. **Replay del juego**: el par `ReplayInfo_<id>_<fecha>.bin` + `.json` (mismo nombre) que guarda Free Fire. Con él genera las mismas estadísticas que el CSV.

No hay que modificar ese archivo: se regenera desde el proyecto Pumas Dev Lab con `node exportar/lector-estadisticas-pumas/construir.js`. Con él viene `ejemplo.html`, una página funcional que puedes usar como base.

## Cómo se usa
```html
<script src="lector-estadisticas-pumas.js"></script>
<script>
  // archivos: FileList de un <input type="file" multiple> o de arrastrar y soltar
  const { partidas, avisos } = await LectorPumas.leerArchivos(archivos);
  const torneo = LectorPumas.tablaTorneo(partidas);   // acumulado de varias partidas
  const csv = LectorPumas.aCSV(partidas[0]);           // texto CSV para descargar
  // Otras entradas: LectorPumas.desdeCSV(texto) · LectorPumas.desdeReplay(uint8ArrayBin, textoJson)
  // Puntos por posición (editable): LectorPumas.puntos = { 1: 12, 2: 9, 3: 8, 4: 7, 5: 6, 6: 5, 7: 4, 8: 3, 9: 2, 10: 1 }
</script>
```

## Qué devuelve
**Partida** (`partidas[i]`):
- `id`, `mapa` (Bermuda, Purgatorio, Kalahari, Nexterra, Solara), `fecha` (ISO o null), `fuente` (`'csv'` oficial o `'replay'`), `zonas` (círculos de zona).
- `equipos[]`: `{ posicion, equipo, jugadores[], bajas, puntosPosicion, total, dano, booyah, eliminadoPor }`, ya ordenados (1.º = Booyah).
- `jugadores[]`: `{ jugador, cuenta, equipo, equipoId, bajas, derribos, asistencias, dano, danoRecibido, balance, impactos, disparos, precision, headshots, pctCabeza, armaMasUsada, armas[], derribado, revivido, rescates, gloo, tiempoVivo, tiempoMovimiento, distancia, booyah, eliminadoPor, personaje, mascota }`.
  - Tiempos en segundos; distancia en metros; `precision` y `pctCabeza` entre 0 y 1; `balance` = daño − daño recibido.
  - `armas[]` del jugador: `{ id, nombre, bajas, dano, impactos, headshots, disparos }`, ordenadas por daño.
- `armas[]` de la partida: `{ nombre, id, jugadores, bajas, dano, impactos, headshots, disparos, precision }`, ordenadas por bajas.

**Torneo** (`LectorPumas.tablaTorneo(partidas)`):
- `{ partidas, equipos[], jugadores[], armas[] }`.
- `equipos`: `{ posicion, equipo, partidas, booyahs, puntosPosicion, bajas, total }` ordenados por total.
- `jugadores`: `{ jugador, equipo, partidas, bajas, bajasPorPartida, dano, danoPorPartida, danoRecibido, derribos, asistencias, headshots }`.
- `armas`: lo mismo que en la partida, sumado.
- Si una misma partida está como CSV oficial y como replay, cuenta una sola vez (vale la oficial).

## Valores que pueden venir en `null` (muéstralos como "—", nunca como 0)
- Desde el **replay** no existen los disparos totales → `disparos` y `precision` son `null`. Tampoco `personaje` ni `mascota`.
- Desde el **CSV oficial** no existe `tiempoMovimiento` (y `distancia` es la suma de a pie + vehículo).

## Exactitud del replay (validado contra 20 partidas oficiales, 960 jugadores)
- Exactas o casi: jugador, equipo, bajas (99 %), headshots (99,9 %), veces derribado (100 %), gloo (100 %), revivido (99 %), puntos y posición.
- Daño y daño recibido: dentro de ±10 % en el 99,9 % de los jugadores. Daño e impactos por arma: iguales al oficial.
- Impactos 91 % exactos (97 % dentro de ±10 %). Arma más usada igual a la oficial en el 97 %.
- Derribos 81 %, asistencias 58 % (aproximados). Tiempo en movimiento y distancia: estimaciones propias.
Cuando haya CSV oficial, es preferible usarlo; el replay sirve cuando no lo hay.

## Lo que necesito en el portal
- Página de resultados: subir archivos (CSV o replays), tabla del torneo, tabla por partida, estadísticas por jugador y estadísticas de armas (como en `ejemplo.html`), con el estilo del portal de Pumas.
- Todo en español. No inventar datos: lo que venga `null` se muestra como "—".
