/* =====================================================================
   Entrenos PROYECTN · CAÍDAS por equipo
   · 12 o 15 equipos; a cada equipo se le asigna una caída por mapa.
   · Caídas repetidas se marcan con 💀 del mismo color (equipos que chocan).
   · Mapa visual: marca en cada mapa dónde cae cada equipo.
   · Reglas de sesión: pelea de caída y zonas.
   · Descarga imagen y copia texto para WhatsApp.
   ===================================================================== */
(function () {
    const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/\s+/g, ' ').trim();

    const MAPAS = ['BERMUDA', 'PURGATORIO', 'NEXTERRA', 'KALAHARI', 'SOLARA'];
    const MAPAS_IMG = {
        BERMUDA:    'iconosobs/mapas/bermuda.png',
        PURGATORIO: 'iconosobs/mapas/purgatorio.png',
        NEXTERRA:   'iconosobs/mapas/nexterra.png',
        KALAHARI:   'iconosobs/mapas/kalahari.png',
        SOLARA:     'iconosobs/mapas/solara.png'
    };

    const CLASH_COLORS = ['#ff4d4d','#4da6ff','#ffb84d','#d94dff','#4dfff0','#ff4dbb','#c8ff4d','#ff8c00'];
    const ARSENAL_COLOR = '#4dff91'; // verde para caídas con arsenal

    // Coordenadas calibradas manualmente (% x, % y desde esquina superior-izquierda del mapa)
    const COORDENADAS = {
        BERMUDA: {
            'RIM NAM VILLA': [12.5, 71.7],
            'OBSERVATORIO':  [13.4, 34.8],
            'HANGAR':        [20.4, 52.6],
            'GRAVEYARD':     [23.4, 27.3],
            'BULLSEYE':      [25.6, 19.7],
            'SHYRPIARD':     [39.5, 14.3],
            'KATULISTIWA':   [31.1, 37],
            'PLANTATION':    [44.6, 29],
            'BIMASAKTI':     [45.7, 44.5],
            'RIVERSIDE':     [59.3, 28.4],
            'MARS ELECTRIC': [52, 85.1],
            'POCHINOK':      [55.4, 71.7],
            'PEAK':          [57.3, 51.4],
            'CLOCK TOWER':   [31.6, 62.6],
            'KOTA TUA':      [68.9, 61.2],
            'SENTOSA':       [85.6, 79],
            'CAPETOWN':      [91.2, 52.1],
            'KERATON':       [86.3, 39.1],
            'MILL':          [71.1, 29.1],
            'FACTORY':       [44.7, 68.3]
        },
        PURGATORIO: {
            'MOATHOUSE':     [61.5, 13.6],
            'CROSSROADS':    [28.2, 20.7],
            'MARBLEWORKS':   [26.2, 44.9],
            'QUARY':         [9.7, 59.3],
            'GOLF':          [27.8, 70.7],
            'MT. VILLA':     [19.5, 75.1],
            'CENTRAL':       [41.5, 78.3],
            'BOMBEROS':      [51.3, 79.6],
            'LUMBER MILL':   [67.9, 82.8],
            'CAMPSITE':      [71.1, 61.6],
            'FORGE':         [84.3, 56.2],
            'SKI LODGE':     [85.8, 36.7],
            'BRASILIA ALTA': [45.3, 51.6],
            'BRASILIA BAJA': [51.7, 59.2],
            'FIELS':         [67.8, 41.2]
        },
        NEXTERRA: {
            'CENTRO DE INTELIGENCIA': [43.3, 20.4],
            'PUENTES GEMELOS':        [65.8, 23],
            'CONSTRUCCION EN RUINAS': [78.3, 34.3],
            'CUIDAD FANTASMA':        [79.3, 50.1],
            'PANTANAL':               [73.4, 72.4],
            'DECAGONO':               [55.6, 79.4],
            'GIMNASIO DE BOXEO':      [53.3, 63.2],
            'TIROLESA':               [63.5, 47.9],
            'PLAZARIA':               [39.6, 71.9],
            'GRATIVACION':            [19.7, 76.3],
            'INVERNADEROS':           [36.9, 49.9],
            'EOLICAS':                [16.1, 53.9],
            'MUSEO':                  [16.2, 36.3]
        },
        KALAHARI: {
            'ASENTAMIENTO':      [23.8, 18.7],
            'RUINAS':            [29.8, 37.8],
            'LABERINTO':         [15.1, 53.8],
            'C.ELEFANTE':        [25.1, 78.6],
            'REFINERIA':         [44.7, 51.9],
            'EL SUB':            [44.2, 79.6],
            'BAHIA':             [61.1, 38.2],
            'SANTUARIO':         [45.6, 21.2],
            'EL CONSEJO':        [73.2, 20.7],
            'RECLUSORIO':        [82.2, 35.7],
            'SANTA CATARINA':    [79.9, 54.3],
            'CANTO DE PIEDRA':   [80.9, 77.3],
            'PUESTO DE COMANDO': [60.3, 64.2]
        },
        SOLARA: {
            'MOLINO':           [78.5, 20],
            'ISLA DELTA':       [88.6, 42.2],
            'ACUARIO':          [92, 65],
            'BAHIA':            [83.6, 85],
            'PLANTA ECOLOGICA': [51.6, 88.8],
            'FLORISTERIA':      [40.7, 65.7],
            'ESTUDIO':          [23.1, 77.7],
            'EL CENTRO':        [13, 42.2],
            'CASCADA':          [27.9, 27.4],
            'CENTRO HIPICO':    [41.6, 13.5],
            'FERIA':            [53.1, 36.8],
            'ARCOS':            [36.9, 42.4],
            'TORRE DE TV':      [57, 60.5],
            'CASA VISTA':       [69.7, 69]
        }
    };

    const ARSENALES = {
        BERMUDA: {
            'HANGAR':    [23.1, 61],
            'POCHINOK':  [50.4, 73.7],
            'FACTORY':   [45.6, 59.8],
            'PEAK':      [60, 44.7],
            'CAPETOWN':  [82.1, 54.9],
            'SHYRPIARD': [35.6, 28.8]
        },
        PURGATORIO: {
            'MOATHOUSE':     [59.1, 26.3],
            'CROSSROADS':    [38.2, 31.1],
            'GOLF':          [27.5, 60.9],
            'BOMBEROS':      [54.8, 81.6],
            'CAMPSITE':      [72.1, 58.8],
            'BRASILIA ALTA': [42.3, 45.9]
        },
        NEXTERRA: {
            'INVERNADEROS':           [45.6, 38.4],
            'CONSTRUCCION EN RUINAS': [72.9, 42.1],
            'PANTANAL':               [64.4, 70.7],
            'PLAZARIA':               [45.3, 63.5],
            'EOLICAS':                [18.4, 55.3]
        },
        KALAHARI: {
            'BAHIA':             [67.7, 47.5],
            'SANTUARIO':         [50.4, 30],
            'RUINAS':            [36.8, 39.8],
            'C.ELEFANTE':        [25.8, 67.6],
            'PUESTO DE COMANDO': [67, 65.7]
        },
        SOLARA: {
            'CASA VISTA':       [72.2, 56.8],
            'ARCOS':            [42.9, 35],
            'ESTUDIO':          [17.5, 64],
            'MOLINO':           [67.8, 34.5],
            'PLANTA ECOLOGICA': [56.8, 76.7]
        }
    };

    const CATALOGO = {
        BERMUDA: ['RIM NAM VILLA','OBSERVATORIO','HANGAR','GRAVEYARD','BULLSEYE','SHYRPIARD','KATULISTIWA','PLANTATION','BIMASAKTI','RIVERSIDE','MARS ELECTRIC','POCHINOK','PEAK','CLOCK TOWER','KOTA TUA','SENTOSA','CAPETOWN','KERATON','MILL','FACTORY'],
        PURGATORIO: ['MOATHOUSE','CROSSROADS','MARBLEWORKS','QUARY','GOLF','MT. VILLA','CENTRAL','BOMBEROS','LUMBER MILL','CAMPSITE','FORGE','SKI LODGE','BRASILIA ALTA','BRASILIA BAJA','FIELS'],
        NEXTERRA: ['CENTRO DE INTELIGENCIA','PUENTES GEMELOS','CONSTRUCCION EN RUINAS','CUIDAD FANTASMA','PANTANAL','DECAGONO','GIMNASIO DE BOXEO','TIROLESA','PLAZARIA','GRATIVACION','INVERNADEROS','EOLICAS','MUSEO'],
        KALAHARI: ['ASENTAMIENTO','RUINAS','LABERINTO','C.ELEFANTE','REFINERIA','EL SUB','BAHIA','SANTUARIO','EL CONSEJO','RECLUSORIO','SANTA CATARINA','CANTO DE PIEDRA','PUESTO DE COMANDO'],
        SOLARA: ['MOLINO','ISLA DELTA','ACUARIO','BAHIA','PLANTA ECOLOGICA','FLORISTERIA','ESTUDIO','EL CENTRO','CASCADA','CENTRO HIPICO','FERIA','ARCOS','TORRE DE TV','CASA VISTA']
    };

    // Plantillas de ejemplo (12 y 15 equipos)
    const PLANTILLAS = {
        12: [
            ['PUMAS E7',          'RIM NAM VILLA',  'LUMBER MILL', 'INVERNADEROS',           'LABERINTO',          'BAHIA'],
            ['PROYECTN',          'CLOCK TOWER',    'CENTRAL',     'MUSEO',                  'SANTA CATARINA',     'TORRE DE TV'],
            ['LY GAMER',          'GRAVEYARD',      'QUARY',       'CENTRO DE INTELIGENCIA', 'RUINAS',             'MOLINO'],
            ['ROYAL GAMING SQUAD','OBSERVATORIO',   'GOLF',        'PUENTES GEMELOS',        'RECLUSORIO',         'ISLA DELTA'],
            ['INTI ESPORTS',      'PLANTATION',     'MT. VILLA',   'CONSTRUCCION EN RUINAS', 'C.ELEFANTE',         'ARCOS'],
            ['XPECTER BLUE',      'KATULISTIWA',    'CROSSROADS',  'CUIDAD FANTASMA',        'REFINERIA',          'FERIA'],
            ['X9',                'BIMASAKTI',      'BOMBEROS',    'EOLICAS',                'EL SUB',             'PLANTA ECOLOGICA'],
            ['DZ CLAN',           'BULLSEYE',       'LUMBER MILL', 'DECAGONO',               'BAHIA',              'EL CENTRO'],
            ['HZ MOVISTAR',       'SHYRPIARD',      'CAMPSITE',    'GIMNASIO DE BOXEO',      'SANTUARIO',          'ARCOS'],
            ['FS ESPORT',         'MILL',           'FORGE',       'TIROLESA',               'EL CONSEJO',         'ACUARIO'],
            ['FN CLAN',           'CAPETOWN',       'SKI LODGE',   'PLAZARIA',               'ASENTAMIENTO',       'CASCADA'],
            ['IDV ESPORT',        'SENTOSA',        'BRASILIA ALTA','GRATIVACION',            'PUESTO DE COMANDO',  'CASA VISTA']
        ],
        15: [
            ['PUMAS E7',          'RIM NAM VILLA',  'LUMBER MILL', 'INVERNADEROS',           'RECLUSORIO',         'BAHIA'],
            ['PROYECTN',          'CLOCK TOWER',    'CENTRAL',     'MUSEO',                  'SANTA CATARINA',     'TORRE DE TV'],
            ['LY GAMER',          'GRAVEYARD',      'QUARY',       'CENTRO DE INTELIGENCIA', 'RUINAS',             'MOLINO'],
            ['ROYAL GAMING SQUAD','OBSERVATORIO',   'GOLF',        'PUENTES GEMELOS',        'LABERINTO',          'ISLA DELTA'],
            ['INTI ESPORTS',      'PLANTATION',     'MT. VILLA',   'CONSTRUCCION EN RUINAS', 'C.ELEFANTE',         'ARCOS'],
            ['XPECTER BLUE',      'KATULISTIWA',    'CROSSROADS',  'CUIDAD FANTASMA',        'REFINERIA',          'FERIA'],
            ['X9',                'BIMASAKTI',      'BOMBEROS',    'PANTANAL',               'EL SUB',             'PLANTA ECOLOGICA'],
            ['DZ CLAN',           'BULLSEYE',       'LUMBER MILL', 'DECAGONO',               'REFINERIA',          'EL CENTRO'],
            ['HZ MOVISTAR',       'SHYRPIARD',      'CAMPSITE',    'GIMNASIO DE BOXEO',      'SANTUARIO',          'ARCOS'],
            ['FS ESPORT',         'MILL',           'FORGE',       'TIROLESA',               'EL CONSEJO',         'ACUARIO'],
            ['FN CLAN',           'CAPETOWN',       'SKI LODGE',   'PLAZARIA',               'ASENTAMIENTO',       'CASCADA'],
            ['IDV ESPORT',        'SENTOSA',        'BRASILIA ALTA','GRATIVACION',            'LABERINTO',          'CASA VISTA'],
            ['BASTION ESPORT',    'POCHINOK',       'BRASILIA BAJA','PANTANAL',               'CANTO DE PIEDRA',    'CENTRO HIPICO'],
            ['BEE E-SPORT',       'MARS ELECTRIC',  'FIELS',       'EOLICAS',                'PUESTO DE COMANDO',  'ESTUDIO'],
            ['INTI ACD',          'KERATON',        'MARBLEWORKS', 'CENTRO DE INTELIGENCIA', 'BAHIA',              'FLORISTERIA']
        ]
    };

    const CLAVE = n => 'pg_caidas_privados_' + n;
    const CLAVE_REGLAS = 'pg_caidas_privados_reglas';
    const vacio = n => Array.from({ length: n }, () => ({ equipo: '', caidas: MAPAS.map(() => '') }));
    let rostersDisponibles = [], caidasRosters = [];

    let logoData = null;
    let equipoLogos = [];

    function leer(n) {
        try { const d = JSON.parse(localStorage.getItem(CLAVE(n))); if (Array.isArray(d) && d.length === n) return d; } catch (e) {}
        return vacio(n);
    }
    const guardar = (n, filas) => { try { localStorage.setItem(CLAVE(n), JSON.stringify(filas)); } catch (e) {} };
    function leerReglas() { try { return JSON.parse(localStorage.getItem(CLAVE_REGLAS)) || {}; } catch (e) { return {}; } }
    const guardarReglas = r => { try { localStorage.setItem(CLAVE_REGLAS, JSON.stringify(r)); } catch (e) {} };

    function calcClashColors(filas) {
        return MAPAS.map((m, j) => {
            const cuenta = {};
            filas.forEach(f => { const k = norm(f.caidas[j]); if (k) cuenta[k] = (cuenta[k] || 0) + 1; });
            const clashColor = {};
            let ci = 0;
            Object.keys(cuenta).forEach(k => { if (cuenta[k] > 1) clashColor[k] = CLASH_COLORS[ci++ % CLASH_COLORS.length]; });
            return clashColor;
        });
    }

    function buscarCoords(mapa, caida) {
        const coords = COORDENADAS[mapa];
        if (!coords) return null;
        const cn = norm(caida);
        const key = Object.keys(coords).find(k => norm(k) === cn);
        return key ? coords[key] : null;
    }

    const CSS = `
.cd-barra{display:flex;flex-wrap:wrap;align-items:flex-end;gap:12px;margin-bottom:16px}
.cd-barra .form-group{margin:0}
.cd-wrap{overflow-x:auto;border:1px solid rgba(216,195,149,.25);border-radius:4px}
.cd-tabla{width:100%;min-width:900px;border-collapse:collapse}
.cd-tabla th{position:sticky;top:0;z-index:1;padding:8px 6px;background:#15161b;color:#D8C395;font:800 .66rem 'Michroma',sans-serif;letter-spacing:.06em;text-align:center}
.cd-th-mapa{display:flex;flex-direction:column;align-items:center;gap:4px}
.cd-th-mapa img{width:72px;height:46px;object-fit:cover;border-radius:3px;display:block}
.cd-th-mapa span{font:800 .62rem 'Michroma',sans-serif;letter-spacing:.06em;color:#D8C395}
.cd-tabla td{padding:6px;border-top:1px solid rgba(255,255,255,.06);vertical-align:middle}
.cd-tabla td.cd-n{width:42px;color:#D8C395;font-weight:800;text-align:center}
.cd-tabla input{width:100%;min-width:120px;padding:9px 10px;border:1px solid rgba(216,195,149,.22);border-radius:3px;background:#0a0b10;color:#fff;font-size:14px;text-transform:uppercase}
.cd-tabla input:focus{outline:none;border-color:#D8C395}
.cd-tabla td.cd-eq{padding:3px 6px}.cd-tabla td.cd-eq input{min-width:140px;font-weight:700}
.cd-celda{position:relative}
.cd-celda.libre input::placeholder{color:#666}
.cd-skull{position:absolute;top:3px;right:6px;font-size:13px;line-height:1;pointer-events:none;display:none}
.cd-acciones{display:flex;flex-wrap:wrap;gap:10px;margin-top:16px}
.cd-acciones .btn-generar{flex:1 1 210px}
.cd-msg{min-height:1.2em;margin:10px 0 0;font-size:.9rem}
.cd-leyenda{display:flex;flex-wrap:wrap;gap:16px;margin:8px 0 0;color:#9a9a9a;font-size:.8rem}
.cd-previa{margin-top:22px;overflow-x:auto}
.cd-reglas{margin-top:20px;padding:14px 18px;background:#0d0e14;border:1px solid rgba(216,195,149,.2);border-radius:6px}
.cd-reglas h4{margin:0 0 12px;font-family:'Michroma',sans-serif;font-size:.75rem;letter-spacing:.08em;color:#D8C395}
.cd-reglas-grid{display:flex;flex-wrap:wrap;gap:14px}
.cd-reglas-grid .form-group{margin:0;flex:1;min-width:160px}
.cd-mapas-wrap{margin-top:22px}
.cd-mapas-wrap h4{font-family:'Michroma',sans-serif;font-size:.72rem;letter-spacing:.08em;color:#D8C395;margin:0 0 10px}
.cd-mapas-grid{display:flex;flex-wrap:wrap;gap:8px}
.cd-mapa-item{flex:1;min-width:180px;max-width:calc(33.33% - 6px);background:#0c0d12;border:1px solid rgba(216,195,149,.15);border-radius:4px;overflow:hidden}
.cd-mapa-item .cd-mapa-nombre{background:#15161b;padding:5px 8px;font:700 .6rem 'Michroma',sans-serif;letter-spacing:.06em;color:#D8C395;text-align:center}
.cd-mapa-item .cd-mapa-img-wrap{position:relative}
.cd-mapa-item img{display:block;width:100%}
.cd-pin{position:absolute;transform:translate(-50%,-50%);width:22px;height:22px;border-radius:50%;border:2px solid #000;display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:800;color:#000;box-shadow:0 2px 6px rgba(0,0,0,.7);z-index:2;cursor:default}
.cd-pin:hover .cd-pin-tip{display:block}
.cd-pin-tip{display:none;position:absolute;bottom:calc(100% + 4px);left:50%;transform:translateX(-50%);background:#1a1b22;color:#F4EEDC;font-size:10px;white-space:nowrap;padding:3px 7px;border-radius:3px;border:1px solid rgba(216,195,149,.3);pointer-events:none;z-index:10}
.cd-pin-logo{background-size:cover;background-position:center;background-repeat:no-repeat;color:transparent}
.cd-arsenal{position:absolute;transform:translate(-50%,-50%);font-size:15px;line-height:1;cursor:default;z-index:3}
.cd-arsenal:hover .cd-pin-tip{display:block}
.cd-eq-wrap{display:flex;align-items:center;gap:4px}
.cd-logo-eq-btn{flex:0 0 26px;width:26px;height:26px;border-radius:50%;background:rgba(216,195,149,.07);border:1px solid rgba(216,195,149,.18);cursor:pointer;display:flex;align-items:center;justify-content:center;overflow:hidden;transition:border-color .15s}
.cd-logo-eq-btn:hover{border-color:#D8C395}
.cd-logo-eq-mini{width:100%;height:100%;object-fit:cover;border-radius:50%;display:block}
@media(max-width:640px){.cd-tabla{min-width:760px}.cd-tabla input{min-width:104px;font-size:13px}.cd-mapa-item{max-width:calc(50% - 4px)}}`;

    function montar(contId) {
        const cont = document.getElementById(contId);
        if (!cont || cont.dataset.listo) return;
        cont.dataset.listo = '1';
        if (!document.getElementById('pgCaidasCss')) {
            const st = document.createElement('style'); st.id = 'pgCaidasCss'; st.textContent = CSS; document.head.appendChild(st);
        }
        let n = 12, filas = leer(12);
        let reglas = leerReglas();

        cont.innerHTML = `
            <p class="tool-desc">Asigna a cada equipo su caída en cada mapa. Los equipos con la misma caída se marcan con 💀 del mismo color. El mapa visual se actualiza en tiempo real.</p>
            <div class="cd-barra">
                <div class="form-group"><label>Equipos</label><select data-c="n"><option value="12">12 equipos</option><option value="15">15 equipos</option></select></div>
                <div class="form-group"><label>Título de la imagen</label><input data-c="titulo" maxlength="60" placeholder="Ej: SCRIM 8PM · 13/10" style="min-width:240px"></div>
                <div class="form-group" style="flex:0 0 auto">
                    <label>Logo (opcional)</label>
                    <div style="display:flex;align-items:center;gap:6px">
                        <label class="btn-mini" style="cursor:pointer;margin:0;display:inline-flex;align-items:center;gap:6px">
                            <i class="fa-solid fa-image"></i> Subir logo
                            <input type="file" accept="image/*" data-c="logoInput" style="display:none">
                        </label>
                        <img data-c="logoPrevia" alt="logo" style="display:none;height:36px;border-radius:3px;border:1px solid rgba(216,195,149,.3)">
                        <button class="btn-mini peligro" type="button" data-c="logoQuitar" style="display:none;padding:4px 8px">✕</button>
                    </div>
                </div>
            </div>
            <details open style="margin-bottom:14px">
                <summary style="cursor:pointer;color:#D8C395">Cargar rosters de la organización</summary>
                <p data-c="rostersInfo" style="font-size:12px;color:#aeb9c4;margin:8px 0">Cargando rosters disponibles...</p>
                <select data-c="rosters" multiple size="5" aria-label="Selecciona uno o varios rosters" style="width:100%;max-width:540px"></select>
                <div><button class="btn-mini" type="button" data-c="cargarRosters" style="margin-top:8px"><i class="fa-solid fa-people-group"></i> Cargar seleccionados con sus spots guardados</button></div>
            </details>
            <details open style="margin-bottom:14px">
                <summary style="cursor:pointer;color:#D8C395">Pegar lista de equipos (uno por línea)</summary>
                <textarea data-c="lista" rows="5" style="width:100%;margin-top:8px" placeholder="PUMAS E7&#10;PROYECTN&#10;..."></textarea>
                <button class="btn-mini" type="button" data-c="usarLista" style="margin-top:8px"><i class="fa-solid fa-list-check"></i> Poner estos equipos</button>
            </details>
            <details style="margin-bottom:14px">
                <summary style="cursor:pointer;color:#D8C395">Cargar spots directamente desde una tabla o CSV</summary>
                <p style="font-size:12px;color:#aeb9c4;margin:8px 0">Usa columnas en este orden: Equipo, Bermuda, Purgatorio, Nexterra, Kalahari, Solara. Puedes pegar desde Excel o importar un CSV/TSV.</p>
                <input type="file" accept=".csv,.tsv,.txt,text/csv,text/tab-separated-values" data-c="archivoSpots" style="margin:4px 0 8px">
                <textarea data-c="spotsDirectos" rows="5" style="width:100%" placeholder="PUMAS E7\tRIM NAM VILLA\tCENTRAL\tMUSEO\tRUINAS\tMOLINO"></textarea>
                <button class="btn-mini" type="button" data-c="importarSpots" style="margin-top:8px"><i class="fa-solid fa-file-import"></i> Cargar equipos y spots</button>
            </details>
            <div class="cd-wrap"><table class="cd-tabla"><thead><tr>
                <th>NO</th><th style="text-align:left">EQUIPO</th>
                ${MAPAS.map(m => `<th><div class="cd-th-mapa"><img src="${MAPAS_IMG[m]}" alt="${m}"><span>${m}</span></div></th>`).join('')}
            </tr></thead><tbody data-c="cuerpo"></tbody></table></div>
            ${MAPAS.map(m => `<datalist id="cdLista${m}">${CATALOGO[m].map(c => `<option value="${esc(c)}"></option>`).join('')}</datalist>`).join('')}
            <div class="cd-leyenda">
                <span style="display:flex;align-items:center;gap:5px"><span style="font-size:14px">💀</span> mismo color = equipos que chocan en esa caída</span>
                <em style="font-style:italic">Vacío = sin asignar</em>
            </div>

            <!-- REGLAS -->
            <div class="cd-reglas">
                <h4><i class="fa-solid fa-scroll" style="margin-right:6px"></i>REGLAS DE LA SESIÓN</h4>
                <div class="cd-reglas-grid">
                    <div class="form-group">
                        <label>Pelea de caída</label>
                        <select data-c="regla_pelea">
                            <option value="">— no especificado —</option>
                            <option value="SI">✅ Sí hay pelea de caída</option>
                            <option value="NO">❌ No hay pelea de caída</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label>Zonas marcadas</label>
                        <select data-c="regla_zonas">
                            <option value="">— no especificado —</option>
                            <option value="2">2 zonas</option>
                            <option value="3">3 zonas</option>
                            <option value="4">4 zonas</option>
                        </select>
                    </div>
                    <div class="form-group" style="flex:2;min-width:220px">
                        <label>Regla adicional (opcional)</label>
                        <input data-c="regla_extra" maxlength="120" placeholder="Ej: No kill en zona hasta círculo 2...">
                    </div>
                </div>
            </div>

            <!-- MAPA VISUAL -->
            <div class="cd-mapas-wrap">
                <h4><i class="fa-solid fa-map-location-dot" style="margin-right:6px"></i>MAPA VISUAL DE CAÍDAS</h4>
                <div class="cd-mapas-grid" data-c="mapaGrid"></div>
            </div>

            <div class="cd-acciones">
                <button class="btn-generar" type="button" data-c="azarNormal"><i class="fa-solid fa-shuffle"></i> Generar normal</button>
                <button class="btn-generar" type="button" data-c="azarPelada" style="border-color:#ff6b6b;color:#ff6b6b"><i class="fa-solid fa-skull-crossbones"></i> Generar pelada</button>
                <button class="btn-generar" type="button" data-c="imprimirAmbas"><i class="fa-solid fa-download"></i> Descargar las 2 imágenes</button>
                <button class="btn-mini" type="button" data-c="imagen"><i class="fa-solid fa-image"></i> Descargar tabla</button>
                <button class="btn-mini" type="button" data-c="descargarMapas"><i class="fa-solid fa-map"></i> Descargar 5 mapas</button>
                <button class="btn-generar" type="button" data-c="copiar"><i class="fa-brands fa-whatsapp"></i> Copiar texto</button>
            </div>
            <div class="cd-acciones">
                <button class="btn-mini" type="button" data-c="rellenar"><i class="fa-solid fa-fill-drip"></i> Rellenar vacíos (sin pelea)</button>
                <button class="btn-mini" type="button" data-c="plantilla"><i class="fa-solid fa-file-excel"></i> Cargar plantilla del Excel</button>
                <button class="btn-mini" type="button" data-c="soloCaidas"><i class="fa-solid fa-eraser"></i> Vaciar caídas (dejar equipos)</button>
                <button class="btn-mini peligro" type="button" data-c="limpiar"><i class="fa-solid fa-trash"></i> Limpiar todo</button>
            </div>
            <p class="cd-msg" data-c="msg" role="status"></p>
            <div class="cd-previa" data-c="previa"></div>`;

        const $ = k => cont.querySelector(`[data-c="${k}"]`);
        const msg = (t, c) => { $('msg').textContent = t; $('msg').style.color = c || ''; };

        if (reglas.pelea) $('regla_pelea').value = reglas.pelea;
        if (reglas.zonas) $('regla_zonas').value = reglas.zonas;
        if (reglas.extra) $('regla_extra').value = reglas.extra;

        function getReglas() {
            return { pelea: $('regla_pelea').value, zonas: $('regla_zonas').value, extra: $('regla_extra').value.trim() };
        }
        ['regla_pelea','regla_zonas','regla_extra'].forEach(k => {
            cont.querySelector(`[data-c="${k}"]`).addEventListener('change', () => guardarReglas(getReglas()));
            cont.querySelector(`[data-c="${k}"]`).addEventListener('input',  () => guardarReglas(getReglas()));
        });

        function pintarTabla() {
            $('cuerpo').innerHTML = filas.map((f, i) => `<tr data-i="${i}">
                <td class="cd-n">${i + 1}</td>
                <td class="cd-eq">
                    <div class="cd-eq-wrap">
                        <label class="cd-logo-eq-btn" title="Subir logo del equipo">
                            <img class="cd-logo-eq-mini" data-lp="${i}" style="display:none">
                            <span data-lp-icon="${i}" style="font-size:11px;opacity:.45;line-height:1">📷</span>
                            <input type="file" accept="image/*" data-logo-eq="${i}" style="display:none">
                        </label>
                        <input data-eq value="${esc(f.equipo)}" placeholder="Equipo ${i + 1}" aria-label="Equipo ${i + 1}" style="flex:1">
                    </div>
                </td>
                ${MAPAS.map((m, j) => `<td class="cd-celda"><input data-m="${j}" list="cdLista${m}" value="${esc(f.caidas[j])}" placeholder="sin asignar" aria-label="${m} · equipo ${i + 1}"><span class="cd-skull"></span></td>`).join('')}
            </tr>`).join('');
            // Restore logo previews after rebuild
            filas.forEach((f, i) => {
                if (!equipoLogos[i]) return;
                const img  = $('cuerpo').querySelector(`[data-lp="${i}"]`);
                const icon = $('cuerpo').querySelector(`[data-lp-icon="${i}"]`);
                if (img)  { img.src = equipoLogos[i]; img.style.display = 'block'; }
                if (icon) icon.style.display = 'none';
            });
            marcarRepetidas();
            actualizarMapas();
        }

        function marcarRepetidas() {
            const clashMaps = calcClashColors(filas);
            MAPAS.forEach((m, j) => {
                const clashColor = clashMaps[j];
                const cuenta = {};
                filas.forEach(f => { const k = norm(f.caidas[j]); if (k) cuenta[k] = (cuenta[k] || 0) + 1; });
                $('cuerpo').querySelectorAll(`[data-m="${j}"]`).forEach((inp, i) => {
                    const k = norm(filas[i].caidas[j]);
                    const cell = inp.parentElement;
                    const skull = cell.querySelector('.cd-skull');
                    const isRepeat = !!k && cuenta[k] > 1;
                    cell.classList.toggle('repetida', isRepeat);
                    cell.classList.toggle('libre', !k);
                    inp.style.borderColor = isRepeat ? clashColor[k] : '';
                    if (skull) {
                        skull.style.display = isRepeat ? 'block' : 'none';
                        skull.textContent = isRepeat ? '💀' : '';
                        skull.style.color = isRepeat ? clashColor[k] : '';
                    }
                });
            });
        }

        function actualizarMapas() {
            const clashMaps = calcClashColors(filas);
            const mostrarArsenales = getReglas().pelea === 'NO';
            $('mapaGrid').innerHTML = MAPAS.map((mapa, j) => {
                const porCaida = {};
                filas.forEach((f, i) => {
                    const caida = norm(f.caidas[j]);
                    if (!caida || !f.equipo.trim()) return;
                    const coords = buscarCoords(mapa, f.caidas[j]);
                    if (!coords) return;
                    if (!porCaida[caida]) porCaida[caida] = [];
                    porCaida[caida].push({ idx: i, equipo: f.equipo, caida: f.caidas[j], coords });
                });
                // Arsenal map for quick lookup
                const arsenMapa = ARSENALES[mapa] || {};
                const arsenNorms = mostrarArsenales ? new Set(Object.keys(arsenMapa).map(k => norm(k))) : new Set();
                const pinsHTML = Object.entries(porCaida).map(([caida, grupo]) => {
                    const isClash = grupo.length > 1;
                    const hasArsenal = arsenNorms.has(caida);
                    const color = hasArsenal ? ARSENAL_COLOR : (isClash ? (clashMaps[j][caida] || CLASH_COLORS[0]) : '#D8C395');
                    return grupo.map((item, gi) => {
                        let [bx, by] = item.coords;
                        if (isClash) {
                            const angle = (gi / grupo.length) * 2 * Math.PI - Math.PI / 2;
                            bx += Math.cos(angle) * 3.5;
                            by += Math.sin(angle) * 3.5;
                        }
                        const logo = !isClash && equipoLogos[item.idx];
                        const pinCls = logo ? 'cd-pin cd-pin-logo' : 'cd-pin';
                        const pinStyle = logo
                            ? `left:${bx}%;top:${by}%;background-image:url(${logo});border-color:${color}`
                            : `left:${bx}%;top:${by}%;background:${color}`;
                        return `<div class="${pinCls}" style="${pinStyle}">${logo ? '' : item.idx+1}<span class="cd-pin-tip">${item.idx+1}. ${esc(item.equipo)}<br>${esc(item.caida)}</span></div>`;
                    }).join('');
                }).join('');
                // Arsenal markers — only when pelea=NO, only for drops with a team assigned
                const arsenalHTML = mostrarArsenales ? Object.entries(arsenMapa).map(([caida, [ax, ay]]) => {
                    const cn = norm(caida);
                    const teams = filas.filter(f => f.equipo.trim() && norm(f.caidas[j]) === cn);
                    if (!teams.length) return '';
                    return `<span class="cd-arsenal" style="left:${ax}%;top:${ay}%;color:${ARSENAL_COLOR};text-shadow:0 1px 5px rgba(0,0,0,.9),0 0 6px ${ARSENAL_COLOR}40"><i class="fa-solid fa-chess-rook"></i><span class="cd-pin-tip">🏰 Arsenal: ${esc(caida)}</span></span>`;
                }).join('') : '';
                return `<div class="cd-mapa-item"><div class="cd-mapa-nombre">${mapa}</div><div class="cd-mapa-img-wrap" style="position:relative"><img src="${MAPAS_IMG[mapa]}" alt="${mapa}" loading="lazy">${pinsHTML}${arsenalHTML}</div></div>`;
            }).join('');
        }

        $('cuerpo').addEventListener('input', e => {
            const tr = e.target.closest('[data-i]');
            if (!tr) return;
            const f = filas[Number(tr.dataset.i)];
            if (e.target.matches('[data-eq]')) {
                const nombre = e.target.value.toUpperCase();
                if (f.equipo !== nombre) delete f.rosterId;
                f.equipo = nombre;
            }
            else f.caidas[Number(e.target.dataset.m)] = e.target.value.toUpperCase();
            guardar(n, filas); marcarRepetidas(); actualizarMapas();
        });
        $('cuerpo').addEventListener('change', e => {
            if (!e.target.matches('[data-logo-eq]')) return;
            const idx = Number(e.target.dataset.logoEq);
            const file = e.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = ev => {
                equipoLogos[idx] = ev.target.result;
                const img  = $('cuerpo').querySelector(`[data-lp="${idx}"]`);
                const icon = $('cuerpo').querySelector(`[data-lp-icon="${idx}"]`);
                if (img)  { img.src = equipoLogos[idx]; img.style.display = 'block'; }
                if (icon) icon.style.display = 'none';
                actualizarMapas();
            };
            reader.readAsDataURL(file);
        });
        $('n').addEventListener('change', () => { n = Number($('n').value); filas = leer(n); pintarTabla(); $('previa').innerHTML = ''; msg(''); });
        $('usarLista').onclick = () => {
            const l = $('lista').value.split(/\r?\n/).map(x => x.replace(/^\s*\d+\s*[.)\-:]\s*/, '').trim()).filter(Boolean);
            if (!l.length) { msg('Pega los equipos, uno por línea.', '#ff8a8d'); return; }
            l.slice(0, n).forEach((eq, i) => { filas[i].equipo = eq.toUpperCase(); });
            guardar(n, filas); pintarTabla();
            msg(`✔ ${Math.min(l.length, n)} equipo(s) puestos${l.length > n ? ` (sobraron ${l.length - n})` : ''}.`, '#6ee7a8');
        };
        $('cargarRosters').onclick = () => {
            const elegidos = [...$('rosters').selectedOptions]
                .map(option => rostersDisponibles.find(equipo => equipo.id === option.value))
                .filter(Boolean);
            if (!elegidos.length) { msg('Selecciona uno o varios rosters de la organización.', '#ff8a8d'); return; }
            let cargados = 0;
            const sinEspacio = [];
            elegidos.forEach(equipo => {
                let idx = filas.findIndex(fila => fila.rosterId === equipo.id);
                if (idx < 0) idx = filas.findIndex(fila => !fila.equipo.trim());
                if (idx < 0) { sinEspacio.push(equipo.nombre); return; }
                const filaCaidas = caidasRosters.filter(caida => caida.teamId === equipo.id);
                const spots = MAPAS.map(mapa => {
                    const guardada = filaCaidas.find(caida => norm(caida.mapa) === norm(mapa));
                    return guardada?.zona || '';
                });
                filas[idx] = { ...filas[idx], rosterId: equipo.id, equipo: equipo.nombre, caidas: spots };
                equipoLogos[idx] = equipo.logo || null;
                cargados++;
            });
            if (!cargados) { msg(`No hay filas libres. Cambia el límite a ${Math.min(15, filas.length + elegidos.length)} equipos o vacía espacios.`, '#ff8a8d'); return; }
            guardar(n, filas); pintarTabla();
            msg(`✔ ${cargados} roster(s) cargados con sus spots guardados.${sinEspacio.length ? ` Sin espacio: ${sinEspacio.join(', ')}.` : ''}`, sinEspacio.length ? '#FFD54A' : '#6ee7a8');
        };
        $('archivoSpots').addEventListener('change', async function () {
            const file = this.files?.[0]; if (!file) return;
            $('spotsDirectos').value = await file.text();
            msg(`Archivo cargado: ${file.name}. Revisa las columnas y confirma la importación.`, '#FFD54A');
        });
        $('importarSpots').onclick = () => {
            const text = $('spotsDirectos').value.trim();
            if (!text) { msg('Pega una tabla o selecciona un archivo de spots.', '#ff8a8d'); return; }
            const rows = text.split(/\r?\n/).map(line => line.trim()).filter(Boolean)
                .map(line => line.includes('\t') ? line.split('\t') : line.split(/[;,]/))
                .map(cols => cols.map(value => value.trim().replace(/^"|"$/g, '')));
            const first = rows[0].map(norm);
            const hasHeader = first.some(v => ['EQUIPO','TEAM','NOMBRE'].includes(v));
            if (hasHeader) rows.shift();
            let loaded = 0, invalid = 0;
            rows.slice(0, n).forEach((cols, i) => {
                if (!cols[0]) return;
                const row = filas[i];
                row.equipo = cols[0].toLocaleUpperCase('es');
                MAPAS.forEach((mapa, j) => {
                    const raw = cols[j + 1] || '';
                    if (!raw) { row.caidas[j] = ''; return; }
                    const canon = CATALOGO[mapa].find(spot => norm(spot) === norm(raw));
                    if (canon) row.caidas[j] = canon;
                    else { row.caidas[j] = raw; invalid++; }
                });
                loaded++;
            });
            if (!loaded) { msg('No encontré filas con equipo. Revisa el formato de seis columnas.', '#ff8a8d'); return; }
            guardar(n, filas); pintarTabla();
            msg(`✔ ${loaded} equipo(s) y sus spots cargados.${invalid ? ` ${invalid} spot(s) no coinciden con el catálogo y quedaron escritos para revisión.` : ''}`, invalid ? '#FFD54A' : '#6ee7a8');
        };
        function mezclar(arr) {
            for (let i = arr.length - 1; i > 0; i--) {
                const k = Math.floor(Math.random() * (i + 1));
                [arr[i], arr[k]] = [arr[k], arr[i]];
            }
            return arr;
        }
        $('rellenar').onclick = () => {
            let puestas = 0;
            MAPAS.forEach((m, j) => {
                const usadas = new Set(filas.map(f => norm(f.caidas[j])).filter(Boolean));
                let libres = mezclar(CATALOGO[m].filter(c => !usadas.has(norm(c))));
                filas.forEach(f => {
                    if (norm(f.caidas[j])) return;
                    if (!libres.length) libres = mezclar(CATALOGO[m].slice());
                    f.caidas[j] = libres.shift(); puestas++;
                });
            });
            guardar(n, filas); pintarTabla();
            msg(puestas ? `✔ ${puestas} caída(s) rellenadas (sin pelea).` : 'No había casillas vacías.', '#6ee7a8');
        };
        $('azarNormal').onclick = () => {
            MAPAS.forEach((m, j) => {
                const lista = mezclar(CATALOGO[m].slice());
                filas.forEach((f, i) => { f.caidas[j] = lista[i % lista.length]; });
            });
            guardar(n, filas); pintarTabla();
            msg('✔ Caídas generadas al azar (sin pelea).', '#6ee7a8');
        };
        $('azarPelada').onclick = () => {
            const nPeleas = Math.max(1, Math.round(n / 4));
            MAPAS.forEach((m, j) => {
                const lista = mezclar(CATALOGO[m].slice());
                const asigs = [];
                for (let p = 0; p < nPeleas; p++) { asigs.push(lista[p]); asigs.push(lista[p]); }
                for (let i = nPeleas * 2; i < n; i++) asigs.push(lista[Math.min(nPeleas + (i - nPeleas * 2), lista.length - 1)]);
                mezclar(asigs);
                filas.forEach((f, i) => { f.caidas[j] = asigs[i] || lista[i % lista.length]; });
            });
            if (!$('regla_pelea').value) { $('regla_pelea').value = 'SI'; guardarReglas(getReglas()); }
            guardar(n, filas); pintarTabla();
            msg(`⚔️ Pelada generada — ${nPeleas} zona(s) de choque por mapa.`, '#ff8a8d');
        };
        $('plantilla').onclick = () => {
            if (!confirm(`¿Cargar la plantilla de ${n} equipos del Excel? Reemplaza lo que hay en la tabla.`)) return;
            filas = PLANTILLAS[n].map(r => ({ equipo: r[0], caidas: r.slice(1) }));
            guardar(n, filas); pintarTabla(); msg('✔ Plantilla cargada.', '#6ee7a8');
        };
        $('soloCaidas').onclick = () => { filas.forEach(f => { f.caidas = MAPAS.map(() => ''); }); guardar(n, filas); pintarTabla(); msg('Caídas vaciadas; los equipos se mantienen.'); };
        $('limpiar').onclick = () => { if (!confirm('¿Limpiar equipos y caídas?')) return; filas = vacio(n); guardar(n, filas); pintarTabla(); $('previa').innerHTML = ''; msg(''); };
        $('copiar').onclick = async () => {
            const r = getReglas();
            const lineas = filas.filter(f => f.equipo.trim()).map((f, i) => `${i + 1}. *${f.equipo.trim()}*\n` + MAPAS.map((m, j) => `   ${m[0] + m.slice(1).toLowerCase()}: ${f.caidas[j].trim() || 'sin asignar'}`).join('\n'));
            if (!lineas.length) { msg('Pon al menos un equipo.', '#ff8a8d'); return; }
            let reglasTexto = '';
            if (r.pelea) reglasTexto += `\n⚔️ Pelea de caída: ${r.pelea === 'SI' ? 'SÍ' : 'NO'}`;
            if (r.zonas) reglasTexto += `\n🗺️ Zonas marcadas: ${r.zonas}`;
            if (r.extra) reglasTexto += `\n📌 ${r.extra}`;
            const texto = `*CAÍDAS PROYECTN*${$('titulo').value.trim() ? ' · ' + $('titulo').value.trim() : ''}${reglasTexto}\n\n` + lineas.join('\n\n');
            try { await navigator.clipboard.writeText(texto); msg('✔ Texto copiado.', '#6ee7a8'); } catch (e) { window.prompt('Copia el texto:', texto); }
        };
        $('logoInput').addEventListener('change', function () {
            if (!this.files[0]) return;
            const reader = new FileReader();
            reader.onload = e => {
                logoData = e.target.result;
                $('logoPrevia').src = logoData;
                $('logoPrevia').style.display = 'inline';
                $('logoQuitar').style.display = 'inline-block';
            };
            reader.readAsDataURL(this.files[0]);
        });
        $('logoQuitar').onclick = () => {
            logoData = null;
            $('logoPrevia').src = '';
            $('logoPrevia').style.display = 'none';
            $('logoQuitar').style.display = 'none';
            $('logoInput').value = '';
        };

        const descargarMapas = async () => {
            if (!filas.some(f => f.equipo.trim())) { msg('Pon al menos un equipo.', '#ff8a8d'); return false; }
            msg('Generando mapas...', '#FFD54A');
            const clashMaps = calcClashColors(filas);
            const titulo = $('titulo').value.trim();

            const CELL_W = 533, LABEL_H = 30, MAP_W = CELL_W - 20, MAP_H = MAP_W;
            const CELL_H = LABEL_H + MAP_H + 10;
            const HEADER_H = 72, CANVAS_W = CELL_W * 3;
            const CANVAS_H = HEADER_H + CELL_H * 2 + 30;

            const imgs = {};
            await Promise.all(MAPAS.map(m => new Promise(res => {
                const im = new Image(); im.crossOrigin = 'anonymous';
                im.onload = () => { imgs[m] = im; res(); };
                im.onerror = () => res();
                im.src = MAPAS_IMG[m];
            })));
            // Load per-team logos for canvas drawing
            const logoImgs = {};
            await Promise.all(equipoLogos.map((data, i) => {
                if (!data) return Promise.resolve();
                return new Promise(res => {
                    const im = new Image(); im.onload = () => { logoImgs[i] = im; res(); }; im.onerror = () => res(); im.src = data;
                });
            }));
            let logoImg = null;
            if (logoData) await new Promise(res => {
                const im = new Image(); im.onload = () => { logoImg = im; res(); }; im.onerror = () => res(); im.src = logoData;
            });

            const canvas = document.createElement('canvas');
            canvas.width = CANVAS_W; canvas.height = CANVAS_H;
            const ctx = canvas.getContext('2d');

            ctx.fillStyle = '#0b0b10'; ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
            ctx.fillStyle = '#15161b'; ctx.fillRect(0, 0, CANVAS_W, HEADER_H);
            ctx.strokeStyle = 'rgba(216,195,149,0.4)'; ctx.lineWidth = 1;
            ctx.beginPath(); ctx.moveTo(0, HEADER_H); ctx.lineTo(CANVAS_W, HEADER_H); ctx.stroke();

            if (logoImg) {
                const lh = HEADER_H - 14, lw = (logoImg.width / logoImg.height) * lh;
                ctx.drawImage(logoImg, 10, 7, lw, lh);
            }
            ctx.fillStyle = '#D8C395';
            ctx.font = 'bold 20px Michroma, sans-serif';
            ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            ctx.fillText((titulo || 'CAÍDAS PROYECTN').toUpperCase(), CANVAS_W / 2, HEADER_H / 2);
            ctx.textBaseline = 'alphabetic';

            MAPAS.forEach((mapa, j) => {
                const row = j < 3 ? 0 : 1;
                const col = row === 0 ? j : (j - 3);
                const xBase = row === 1 ? CELL_W / 2 + col * CELL_W : col * CELL_W;
                const yBase = HEADER_H + row * CELL_H;
                const mapX = xBase + 10, mapY = yBase + LABEL_H + 5;

                ctx.fillStyle = '#15161b'; ctx.fillRect(xBase, yBase, CELL_W, LABEL_H);
                ctx.fillStyle = '#D8C395'; ctx.font = 'bold 12px Michroma, sans-serif';
                ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
                ctx.fillText(mapa, xBase + CELL_W / 2, yBase + LABEL_H / 2);
                ctx.textBaseline = 'alphabetic';

                if (imgs[mapa]) ctx.drawImage(imgs[mapa], mapX, mapY, MAP_W, MAP_H);
                else { ctx.fillStyle = '#1a1b22'; ctx.fillRect(mapX, mapY, MAP_W, MAP_H); }

                const porCaida = {};
                filas.forEach((f, i) => {
                    const caida = norm(f.caidas[j]);
                    if (!caida || !f.equipo.trim()) return;
                    const coords = buscarCoords(mapa, f.caidas[j]);
                    if (!coords) return;
                    if (!porCaida[caida]) porCaida[caida] = [];
                    porCaida[caida].push({ idx: i, equipo: f.equipo, caida: f.caidas[j], coords });
                });
                const mostrarArsenalesC = $('regla_pelea').value === 'NO';
                const arsenMapaC = ARSENALES[mapa] || {};
                const arsenNormsC = mostrarArsenalesC ? new Set(Object.keys(arsenMapaC).map(k => norm(k))) : new Set();
                Object.entries(porCaida).forEach(([caida, grupo]) => {
                    const isClash = grupo.length > 1;
                    const hasArsenalC = arsenNormsC.has(caida);
                    const color = hasArsenalC ? ARSENAL_COLOR : (isClash ? (clashMaps[j][caida] || CLASH_COLORS[0]) : '#D8C395');
                    grupo.forEach((item, gi) => {
                        let [bx, by] = item.coords;
                        if (isClash) {
                            const angle = (gi / grupo.length) * 2 * Math.PI - Math.PI / 2;
                            bx += Math.cos(angle) * 3.5; by += Math.sin(angle) * 3.5;
                        }
                        const px = mapX + (bx / 100) * MAP_W, py = mapY + (by / 100) * MAP_H;
                        const logo = !isClash && logoImgs[item.idx];
                        if (logo) {
                            ctx.save();
                            ctx.beginPath(); ctx.arc(px, py, 13, 0, 2 * Math.PI); ctx.clip();
                            ctx.drawImage(logo, px - 13, py - 13, 26, 26);
                            ctx.restore();
                            ctx.beginPath(); ctx.arc(px, py, 13, 0, 2 * Math.PI);
                            ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.stroke();
                        } else {
                            ctx.beginPath(); ctx.arc(px, py, 13, 0, 2 * Math.PI);
                            ctx.fillStyle = color; ctx.fill();
                            ctx.strokeStyle = '#000'; ctx.lineWidth = 2; ctx.stroke();
                            ctx.fillStyle = '#000'; ctx.font = 'bold 11px sans-serif';
                            ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
                            ctx.fillText(String(item.idx + 1), px, py);
                            ctx.textBaseline = 'alphabetic';
                        }
                    });
                });
                // Canvas castle helper — always green
                const drawCastle = (px, py) => {
                    ctx.save();
                    ctx.fillStyle = ARSENAL_COLOR;
                    ctx.shadowColor = 'rgba(0,0,0,.85)'; ctx.shadowBlur = 4;
                    const w = 13, h = 15;
                    const bx = Math.round(px - w / 2), by = Math.round(py - h / 2);
                    const mH = 5, mW = 4, bodyY = by + mH;
                    ctx.fillRect(bx, bodyY, w, h - mH);
                    ctx.fillRect(bx, by, mW, mH);
                    ctx.fillRect(bx + Math.round((w - mW) / 2), by, mW, mH);
                    ctx.fillRect(bx + w - mW, by, mW, mH);
                    ctx.fillStyle = 'rgba(0,0,0,.5)'; ctx.shadowBlur = 0;
                    ctx.fillRect(bx + Math.round((w - mW) / 2), bodyY + (h - mH) - mH, mW, mH);
                    ctx.restore();
                };
                // Arsenal markers — only when pelea=NO, only for drops with a team assigned
                if (mostrarArsenalesC) {
                    Object.entries(arsenMapaC).forEach(([caida, [ax, ay]]) => {
                        const cn = norm(caida);
                        const teams = filas.filter(f => f.equipo.trim() && norm(f.caidas[j]) === cn);
                        if (!teams.length) return;
                        const px = mapX + (ax / 100) * MAP_W, py = mapY + (ay / 100) * MAP_H;
                        drawCastle(px, py);
                    });
                }
            });

            ctx.fillStyle = '#6d6760'; ctx.font = '11px sans-serif';
            ctx.textAlign = 'right'; ctx.textBaseline = 'alphabetic';
            ctx.fillText('PROYECTN · mismo color = equipos que chocan', CANVAS_W - 12, CANVAS_H - 10);

            try {
                const a = document.createElement('a');
                a.download = `Mapas_Caidas_Pumas_${n}_equipos.png`;
                a.href = canvas.toDataURL('image/png');
                a.click();
                msg('✔ Imagen de mapas descargada.', '#6ee7a8');
                return true;
            } catch (e) { msg('Error al generar: ' + e.message, '#ff8a8d'); return false; }
        };
        $('descargarMapas').onclick = descargarMapas;

        const descargarTabla = async () => {
            if (!filas.some(f => f.equipo.trim())) { msg('Pon al menos un equipo.', '#ff8a8d'); return false; }
            $('previa').innerHTML = imagenHTML(filas, $('titulo').value.trim(), getReglas());
            if (typeof html2canvas !== 'function') { msg('Vista lista abajo (no se pudo cargar el generador de imágenes).', '#FFD54A'); return; }
            msg('Generando imagen...');
            try {
                const c = await html2canvas(document.getElementById('capturaCaidas'), { scale: 2, useCORS: true, backgroundColor: '#0a0a0a' });
                const a = document.createElement('a');
                a.download = `Caidas_Pumas_${n}_equipos.png`; a.href = c.toDataURL('image/png'); a.click();
                msg('✔ Imagen de la tabla descargada.', '#6ee7a8');
                return true;
            } catch (e) { msg('No se pudo generar la imagen: ' + e.message, '#ff8a8d'); return false; }
        };
        $('imagen').onclick = descargarTabla;
        $('imprimirAmbas').onclick = async () => {
            if (!filas.some(f => f.equipo.trim())) { msg('Pon al menos un equipo.', '#ff8a8d'); return; }
            if (typeof html2canvas !== 'function') { msg('No se pudo cargar el generador de imágenes.', '#ff8a8d'); return; }
            msg('Generando y descargando tabla y mapas en orden...', '#FFD54A');
            if (!await descargarTabla()) return;
            await new Promise(resolve => setTimeout(resolve, 700));
            if (!await descargarMapas()) return;
            msg('✔ Se descargaron la tabla y los cinco mapas.', '#6ee7a8');
        };
        pintarTabla();
    }

    function imagenHTML(filas, titulo, reglas) {
        const usadas = filas.filter(f => f.equipo.trim());
        const clashMaps = calcClashColors(usadas);
        const td = 'padding:9px 10px;border-top:1px solid rgba(216,195,149,.14);font-size:15px;white-space:nowrap';
        const reglaItems = [];
        if (reglas.pelea) reglaItems.push(`⚔️ Pelea de caída: <b>${reglas.pelea === 'SI' ? 'SÍ' : 'NO'}</b>`);
        if (reglas.zonas) reglaItems.push(`🗺️ Zonas marcadas: <b>${reglas.zonas}</b>`);
        if (reglas.extra) reglaItems.push(`📌 ${esc(reglas.extra)}`);
        const reglasBand = reglaItems.length
            ? `<div style="display:flex;flex-wrap:wrap;gap:16px;padding:10px 18px;background:rgba(216,195,149,.07);border-bottom:1px solid rgba(216,195,149,.2);font-size:13px;color:#F4EEDC">${reglaItems.map(r => `<span>${r}</span>`).join('')}</div>`
            : '';
        return `<div id="capturaCaidas" style="width:1280px;background:#0b0b0b;color:#F4EEDC;font-family:'Trebuchet MS',sans-serif;border:1px solid rgba(216,195,149,.3)">
            <div style="min-height:92px;display:flex;align-items:end;justify-content:space-between;padding:20px 28px;background:linear-gradient(120deg,#131923,#092b40);border-bottom:2px solid #00d9ff">
                <strong style="font-family:Michroma,sans-serif;font-size:27px;color:#f4eedc">CAÍDAS · PARTIDA PRIVADA</strong>
                ${titulo ? `<span style="font-family:Michroma,sans-serif;font-size:20px;color:#00d9ff;letter-spacing:2px">${esc(titulo.toUpperCase())}</span>` : ''}
            </div>
            ${reglasBand}
            <table style="width:100%;border-collapse:collapse">
                <thead><tr style="background:linear-gradient(90deg,#1a1b22,#0e0f14);color:#D8C395;border-bottom:2px solid rgba(216,195,149,.4)">
                    <th style="padding:12px 10px;width:56px;text-align:center;font-family:Michroma,sans-serif;font-size:12px">NO</th>
                    <th style="padding:12px 10px;text-align:left;font-family:Michroma,sans-serif;font-size:12px">EQUIPOS</th>
                    ${MAPAS.map(m => `<th style="padding:8px 10px;text-align:center"><img src="${MAPAS_IMG[m]}" alt="${m}" style="display:block;width:90px;height:56px;object-fit:cover;border-radius:4px;margin:0 auto 5px;border:1px solid rgba(216,195,149,.3)"><span style="font-family:Michroma,sans-serif;font-size:11px;letter-spacing:1px;color:#D8C395">${m}</span></th>`).join('')}
                </tr></thead>
                <tbody>${usadas.map((f, i) => {
                    return `<tr style="background:${i % 2 ? 'rgba(255,255,255,.03)' : 'transparent'}">
                    <td style="${td};text-align:center;color:#D8C395;font-weight:800">${i + 1}</td>
                    <td style="${td};font-weight:800">${esc(f.equipo.trim())}</td>
                    ${f.caidas.map((c, j) => {
                        const k = norm(c);
                        const color = k ? clashMaps[j][k] : null;
                        return `<td style="${td};text-align:center;${color ? `border-left:2px solid ${color}` : ''}${!c.trim() ? ';color:#6b6b6b' : ''}">
                            ${c.trim() ? esc(c.trim()) : '—'}${color ? `<span style="margin-left:4px;font-size:12px">💀</span>` : ''}
                        </td>`;
                    }).join('')}</tr>`;
                }).join('')}</tbody>
            </table>
            <div style="padding:12px 18px;color:#8d877a;font-size:12px;text-align:right">PROYECTN · 💀 mismo color = equipos que chocan</div>
        </div>`;
    }

    function actualizarRosters(equipos, caidas) {
        rostersDisponibles = Array.isArray(equipos) ? equipos : [];
        caidasRosters = Array.isArray(caidas) ? caidas : [];
        const cont = document.getElementById('caidas-privados-mount');
        const select = cont?.querySelector('[data-c="rosters"]');
        const info = cont?.querySelector('[data-c="rostersInfo"]');
        if (!select || !info) return;
        select.innerHTML = rostersDisponibles.map(equipo => `<option value="${esc(equipo.id)}">${esc(equipo.nombre)}</option>`).join('');
        info.textContent = rostersDisponibles.length
            ? `${rostersDisponibles.length} roster(s) disponibles en la organización activa. Puedes elegir varios; selecciona primero 12 o 15 filas según necesites.`
            : 'No hay rosters visibles en la organización activa.';
    }

    window.PumasCaidas = { montar, actualizarRosters, CATALOGO, MAPAS, COORDENADAS, ARSENALES };
})();
