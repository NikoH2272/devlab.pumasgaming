// Mapeador de caídas por escuadra y mapa. Los spots se guardan por equipo.
(() => {
    const KEY = 'pumasDevLab.mapeadorCaidas.v1';
    const SHELF_KEY = 'pumasDevLab.repisaMapeadorCaidas.v1';
    const MAPAS = [
        { id: 'BERMUDA', nombre: 'Bermuda', app: 'Bermuda' },
        { id: 'PURGATORIO', nombre: 'Purgatorio', app: 'Purgatorio' },
        { id: 'NEXTERRA', nombre: 'Nexterra', app: 'Nexterra' },
        { id: 'KALAHARI', nombre: 'Kalahari', app: 'Kalahari' },
        { id: 'SOLARA', nombre: 'Solara', app: 'Solara' }
    ];
    const COORDS = window.PUMAS_CAIDAS_COORDENADAS;
    const CATALOG = window.PUMAS_CAIDAS_CATALOGO;
    const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[c]);
    const norm = s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').toUpperCase().trim();
    const blank = n => Array.from({ length: n }, () => ({ equipo: '', logo: '', caidas: MAPAS.map(() => ''), posiciones: {} }));
    let state = loadState();
    let shelf = loadShelf();

    function loadState() {
        try {
            const saved = JSON.parse(localStorage.getItem(KEY));
            if ([12, 15].includes(saved?.n) && Array.isArray(saved.filas)) return normalize(saved);
            // Trae automáticamente las tablas de caídas del portal anterior si comparten origen.
            const n = [15, 12].find(size => Array.isArray(JSON.parse(localStorage.getItem(`pg_caidas_${size}`) || 'null')));
            if (n) return normalize({ n, filas: JSON.parse(localStorage.getItem(`pg_caidas_${n}`)) });
        } catch (_) { /* empezar vacío */ }
        return { n: 12, miEquipo: null, modoPosicion: 'esquina', filas: blank(12) };
    }

    function normalize(value) {
        const filas = blank(value.n);
        (value.filas || []).slice(0, value.n).forEach((f, i) => {
            filas[i].equipo = String(f?.equipo || '');
            filas[i].logo = String(f?.logo || '');
            const oldPositions = f?.posiciones && typeof f.posiciones === 'object' ? f.posiciones : {};
            filas[i].posiciones = {};
            MAPAS.forEach((mapa, j) => {
                filas[i].caidas[j] = canonicalSpot(mapa.id, f?.caidas?.[j]);
                const pos = oldPositions[j] || oldPositions[`${j}:principal`];
                if (pos && Number.isFinite(pos.x) && Number.isFinite(pos.y)) filas[i].posiciones[j] = pos;
            });
        });
        return { n: value.n, miEquipo: Number.isInteger(value.miEquipo) && value.miEquipo >= 0 && value.miEquipo < value.n ? value.miEquipo : null, modoPosicion: value.modoPosicion === 'caida' ? 'caida' : 'esquina', filas };
    }

    function save() { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (_) { setStatus('No se pudo guardar: el almacenamiento del navegador está lleno.'); } }
    function loadShelf() { try { const value = JSON.parse(localStorage.getItem(SHELF_KEY) || '[]'); return Array.isArray(value) ? value : []; } catch (_) { return []; } }
    function saveShelf() { try { localStorage.setItem(SHELF_KEY, JSON.stringify(shelf)); return true; } catch (_) { setStatus('No se pudo guardar la repisa: el almacenamiento del navegador está lleno.'); return false; } }
    function coordsFor(mapa, spot) {
        const obj = COORDS?.[mapa];
        const key = obj && Object.keys(obj).find(k => norm(k) === norm(spot));
        return key ? obj[key] : null;
    }

    function canonicalSpot(mapa, spot) {
        const value = String(spot || '');
        return (CATALOG?.[mapa] || []).find(name => norm(name) === norm(value)) || '';
    }

    function detectarSpotCercano(mapa, x, y) {
        const obj = COORDS?.[mapa]; if (!obj) return null;
        let closest = null;
        Object.entries(obj).forEach(([nombre, pos]) => {
            const distancia = Math.hypot(pos[0] - x, pos[1] - y);
            if (!closest || distancia < closest.distancia) closest = { nombre, pos, distancia };
        });
        return closest && closest.distancia <= 5.5 ? closest : null;
    }

    function groupsFor(j) {
        const groups = new Map();
        state.filas.forEach((row, idx) => {
            if (!row.equipo.trim()) return;
            const spot = String(row.caidas[j] || '').trim(), pos = coordsFor(MAPAS[j].id, spot), k = norm(spot);
            if (!spot || !pos) return;
            if (!groups.has(k)) groups.set(k, { spot, pos, teams: [] });
            const manual = row.posiciones?.[j];
            groups.get(k).teams.push({ idx, nombre: row.equipo.trim(), logo: row.logo, manual: manual && Number.isFinite(manual.x) && Number.isFinite(manual.y) ? manual : null });
        });
        return groups;
    }

    function mapStageWidth() {
        return document.querySelector('#mapeador-caidas .mca-map-stage')?.clientWidth || Math.max(280, window.innerWidth * .8);
    }

    function groupOffsets(count, index, stageWidth = mapStageWidth()) {
        if (count < 2) return { x:0, y:0 };
        const separationPx = 44;
        const radiusPx = count === 2 ? separationPx / 2 : separationPx / (2 * Math.sin(Math.PI / count));
        const radius = radiusPx / stageWidth * 100;
        const rotation = count === 2 ? 0 : count === 4 ? -Math.PI / 4 : -Math.PI / 2;
        const angle = rotation + Math.PI * 2 * index / count;
        return { x:Math.cos(angle) * radius, y:Math.sin(angle) * radius };
    }

    function groupCircleSize(count, widthPx = 0, markerPx = 38) {
        const stageWidth = widthPx || mapStageWidth();
        const radiusPx = count === 2 ? 22 : 44 / (2 * Math.sin(Math.PI / Math.max(3, count)));
        return Math.max(9, (radiusPx * 2 + markerPx + 10) / stageWidth * 100);
    }

    function teamPosition(row, idx, j, assigned) {
        if (assigned?.group.teams.length > 1) {
            const offset = groupOffsets(assigned.group.teams.length, assigned.ix);
            return { x: Math.max(3, Math.min(97, assigned.group.pos[0] + offset.x)), y: Math.max(3, Math.min(97, assigned.group.pos[1] + offset.y)) };
        }
        if (row.posiciones?.[j]) return row.posiciones[j];
        if (assigned) return { x: assigned.group.pos[0], y: assigned.group.pos[1] };
        return { x: 13, y: Math.min(94, 5 + idx * 5.7) };
    }

    function render() {
        const host = document.getElementById('mapeador-caidas');
        if (!host) return;
        host.innerHTML = `
            <header class="mca-head">
                <div><span class="tb-kicker">// Mapeador de caídas</span><h2>Análisis de spots</h2><p>Asigna una caída por mapa y agrega los logos de los equipos. Los nombres se muestran ordenados en una esquina o junto al spot elegido; puedes arrastrarlos para moverlos.</p></div>
                <div class="mca-head-actions"><button type="button" class="btn-sec" onclick="mapeadorAbrirPlano()" title="Abrir el plano con herramientas UAV y tiempos"><i class="fa-solid fa-crosshairs"></i> UAV y tiempos</button><label>Equipos<select data-mca="count"><option value="12" ${state.n === 12 ? 'selected' : ''}>12 equipos</option><option value="15" ${state.n === 15 ? 'selected' : ''}>15 equipos</option></select></label><label>Colocación<select data-mca="position-mode"><option value="esquina" ${state.modoPosicion === 'esquina' ? 'selected' : ''}>Esquina ordenada · mover manualmente</option><option value="caida" ${state.modoPosicion === 'caida' ? 'selected' : ''}>Automático al spot · también mover</option></select></label><button type="button" class="btn-sec" data-mca="save-shelf"><i class="fa-solid fa-box-archive"></i> Guardar en repisa</button><button type="button" class="btn-sec" data-mca="clear-spots">Vaciar caídas</button></div>
            </header>
            <div class="mca-input-tools"><label for="mca-team-list">Cargar nombres de equipos, uno por línea</label><div><textarea id="mca-team-list" rows="3" placeholder="PUMAS E7&#10;Equipo 2&#10;..."></textarea><button type="button" class="btn-sec" data-mca="paste-teams">Aplicar lista</button></div><small>La tabla conserva las caídas guardadas al cambiar entre 12 y 15 equipos.</small></div>
            <div class="mca-table-wrap"><table class="mca-table"><thead><tr><th>#</th><th>Equipo / logo</th><th>Mi equipo</th>${MAPAS.map(m => `<th>${m.nombre}</th>`).join('')}</tr></thead><tbody>${state.filas.map((row, i) => `<tr><td>${i + 1}</td><td class="mca-team-cell"><label class="mca-logo-input" title="Cargar logo de ${esc(row.equipo || `equipo ${i + 1}`)}"><img data-logo-preview="${i}" src="${esc(row.logo)}" alt="" ${row.logo ? '' : 'hidden'}><i class="fa-solid fa-camera" ${row.logo ? 'hidden' : ''}></i><input type="file" data-logo="${i}" accept="image/png,image/jpeg,image/webp" hidden></label><input data-team="${i}" value="${esc(row.equipo)}" placeholder="Equipo ${i + 1}" aria-label="Equipo ${i + 1}"><button type="button" class="mca-remove-logo" data-remove-logo="${i}" ${row.logo ? '' : 'hidden'} title="Quitar logo">×</button></td><td class="mca-mi-equipo"><label><input type="checkbox" data-own-team="${i}" ${state.miEquipo === i ? 'checked' : ''}><span>Mi equipo</span></label></td>${MAPAS.map((m, j) => `<td class="mca-drop-cell"><select data-drop="${i}:${j}" aria-label="Caída de ${esc(row.equipo || `equipo ${i + 1}`)} en ${m.nombre}"><option value="">Sin caída</option>${(CATALOG[m.id] || []).map(spot => `<option value="${esc(spot)}" ${norm(row.caidas[j]) === norm(spot) ? 'selected' : ''}>${esc(spot)}</option>`).join('')}</select><small class="mca-conflict-label" data-conflict="${i}:${j}" aria-live="polite"></small></td>`).join('')}</tr>`).join('')}</tbody></table></div>
            <div class="mca-help"><span class="mca-red-sample"></span> El círculo rojo marca spots repetidos y la tabla indica cuántos equipos coinciden. Usa «Mi equipo» para resaltarlo con una estrella; elige colocación ordenada en esquina o automática al asignar una caída.</div>
            <div class="mca-maps">${MAPAS.map((m, j) => renderMapCard(m, j)).join('')}</div>
            <section id="mca-analysis" class="mca-analysis"></section>
            <section class="mca-shelf"><h3>Repisa de análisis de caídas</h3><div id="mca-repisa-lista"></div></section>
            <p class="mca-status" role="status" aria-live="polite"></p>`;
        renderShelf('mca-repisa-lista');

        host.querySelector('[data-mca="count"]').addEventListener('change', e => {
            const n = Number(e.target.value), next = blank(n);
            state.filas.slice(0, n).forEach((row, i) => { next[i] = row; });
            state = { n, miEquipo: state.miEquipo !== null && state.miEquipo < n ? state.miEquipo : null, modoPosicion: state.modoPosicion, filas: next }; save(); render();
        });
        host.querySelector('[data-mca="position-mode"]').addEventListener('change', e => {
            state.modoPosicion = e.target.value === 'caida' ? 'caida' : 'esquina';
            state.filas.forEach(row => { row.posiciones = {}; });
            save(); render(); setStatus('Los equipos se recolocaron según el modo elegido. Puedes arrastrarlos manualmente.');
        });
        host.querySelector('[data-mca="paste-teams"]').addEventListener('click', () => {
            const names = host.querySelector('#mca-team-list').value.split(/\r?\n/).map(x => x.replace(/^\s*\d+\s*[.)\-:]\s*/, '').trim()).filter(Boolean);
            if (!names.length) return setStatus('Pega primero los nombres de los equipos.');
            names.slice(0, state.n).forEach((name, i) => { state.filas[i].equipo = name; });
            save(); render(); setStatus(`${Math.min(names.length, state.n)} nombres cargados${names.length > state.n ? `; se omitieron ${names.length - state.n}` : ''}.`);
        });
        host.querySelector('[data-mca="clear-spots"]').addEventListener('click', () => {
            state.filas.forEach(row => { row.caidas = MAPAS.map(() => ''); row.posiciones = {}; }); save(); render();
        });
        host.querySelectorAll('[data-team]').forEach(input => input.addEventListener('input', () => {
            state.filas[Number(input.dataset.team)].equipo = input.value; save(); updateMaps();
        }));
        host.querySelectorAll('[data-own-team]').forEach(input => input.addEventListener('change', () => {
            state.miEquipo = input.checked ? Number(input.dataset.ownTeam) : null;
            host.querySelectorAll('[data-own-team]').forEach(box => { box.checked = state.miEquipo === Number(box.dataset.ownTeam); });
            save(); updateMaps();
        }));
        host.querySelectorAll('[data-drop]').forEach(input => {
            const actualizarCaida = () => {
                const [i, j] = input.dataset.drop.split(':').map(Number), row = state.filas[i];
                const spot = canonicalSpot(MAPAS[j].id, input.value), pos = coordsFor(MAPAS[j].id, spot);
                const manual = row.posiciones?.[j];
                if (row.caidas[j] === spot && (pos ? manual?.x === pos[0] && manual?.y === pos[1] : !manual)) return;
                row.caidas[j] = spot;
                if (pos) row.posiciones[j] = { x:pos[0], y:pos[1] };
                else delete row.posiciones[j];
                save(); updateMaps();
            };
            input.addEventListener('input', actualizarCaida);
            input.addEventListener('change', actualizarCaida);
        });
        host.querySelectorAll('[data-logo]').forEach(input => input.addEventListener('change', () => {
            const file = input.files?.[0]; if (!file) return;
            readLogo(file).then(data => { const i = Number(input.dataset.logo); state.filas[i].logo = data; save(); render(); }).catch(error => setStatus(error.message));
        }));
        host.querySelectorAll('[data-remove-logo]').forEach(button => button.addEventListener('click', () => { state.filas[Number(button.dataset.removeLogo)].logo = ''; save(); render(); }));
        host.querySelectorAll('[data-mca-print]').forEach(btn => btn.addEventListener('click', () => printMap(btn.dataset.mcaPrint)));
        host.querySelectorAll('[data-mca-png]').forEach(btn => btn.addEventListener('click', () => downloadMap(btn.dataset.mcaPng)));
        host.querySelector('[data-mca="save-shelf"]').addEventListener('click', saveCurrentToShelf);
        updateMaps();
    }

    function renderMapCard(mapa, j) {
        const src = Tablero.imagenMapa(mapa.app);
        return `<article class="mca-map-card" data-mapa-card="${mapa.id}"><header><h3>${mapa.nombre}</h3><div><button type="button" class="btn-sec" data-mca-print="${mapa.id}"><i class="fa-solid fa-print"></i> Imprimir</button><button type="button" class="btn-sec" data-mca-png="${mapa.id}"><i class="fa-solid fa-image"></i> Descargar PNG</button></div></header><div class="mca-map-layout"><div class="mca-map-stage"><img src="${esc(src || '')}" alt="Mapa ${mapa.nombre}" loading="lazy">${cuadrantesHTML()}${pinsHTML(mapa.id, j)}</div>${legendHTML(j)}</div></article>`;
    }

    function cuadrantesHTML() {
        return '<span class="mca-cuadrante-linea mca-cuadrante-vertical"></span><span class="mca-cuadrante-linea mca-cuadrante-horizontal"></span><span class="mca-cuadrante-letra mca-letra-a">A</span><span class="mca-cuadrante-letra mca-letra-b">B</span><span class="mca-cuadrante-letra mca-letra-c">C</span><span class="mca-cuadrante-letra mca-letra-d">D</span>';
    }

    function pinsHTML(mapa, j) {
        const groups = [...groupsFor(j).values()], porEquipo = new Map();
        const halos = groups.map(group => {
            const [x, y] = group.pos;
            group.teams.forEach((team, ix) => { porEquipo.set(team.idx, { group, ix }); });
            return group.teams.length > 1 ? `<span class="mca-clash" style="left:${x}%;top:${y}%;width:${groupCircleSize(group.teams.length)}%" title="${group.teams.length} equipos en ${esc(group.spot)}"></span>` : '';
        }).join('');
        const labels = state.filas.map((row, idx) => {
            if (!row.equipo.trim()) return '';
            const assigned = porEquipo.get(idx);
            const { x, y } = teamPosition(row, idx, j, assigned);
            const spot = assigned?.group.spot || '';
            const esPropio = state.miEquipo === idx;
            return `<span class="mca-pin ${esPropio ? 'mca-pin-propio' : ''}" data-pin="${idx}:${j}" style="left:${x}%;top:${y}%" title="Arrastra para mover · ${esPropio ? 'Mi equipo · ' : ''}Equipo ${idx + 1}${spot ? ` · ${esc(spot)}` : ''}">${row.logo ? `<img src="${esc(row.logo)}" alt="">` : ''}${esPropio ? '<b class="mca-own-star">★</b>' : ''}</span>`;
        }).join('');
        return halos + labels;
    }

    function legendHTML(j) {
        const entries = state.filas.map((row, i) => ({ row, i })).filter(x => x.row.equipo.trim());
        return `<ol class="mca-legend">${entries.length ? entries.map(({ row, i }) => `<li class="${state.miEquipo === i ? 'mca-legend-propio' : ''}"><span>${row.logo ? `<img src="${esc(row.logo)}" alt="">` : i + 1}</span><b>${state.miEquipo === i ? '★ ' : ''}${esc(row.equipo)}</b><small>${esc(row.caidas[j] || 'Sin spot')}</small></li>`).join('') : '<li class="mca-legend-empty">Agrega equipos para crear la leyenda.</li>'}</ol>`;
    }

    function updateMaps() {
        const host = document.getElementById('mapeador-caidas');
        if (!host) return;
        MAPAS.forEach((m, j) => {
            const card = host.querySelector(`[data-mapa-card="${m.id}"]`);
            if (!card) return;
            card.querySelector('.mca-map-stage').innerHTML = `<img src="${esc(Tablero.imagenMapa(m.app) || '')}" alt="Mapa ${m.nombre}" loading="lazy">${cuadrantesHTML()}${pinsHTML(m.id, j)}`;
            card.querySelector('.mca-legend').outerHTML = legendHTML(j);
        });
        updateConflictCells(host);
        bindDragging(host);
        if (typeof window.mapeadorAnalisisRender === 'function') window.mapeadorAnalisisRender(state, MAPAS, COORDS);
    }

    function updateConflictCells(host) {
        MAPAS.forEach((_, j) => {
            const conflictByTeam = new Map();
            for (const group of groupsFor(j).values()) {
                if (group.teams.length < 2) continue;
                group.teams.forEach(team => conflictByTeam.set(team.idx, { cantidad: group.teams.length, spot: group.spot }));
            }
            state.filas.forEach((_, i) => {
                const cell = host.querySelector(`[data-drop="${i}:${j}"]`)?.closest('.mca-drop-cell');
                const label = host.querySelector(`[data-conflict="${i}:${j}"]`), issue = conflictByTeam.get(i);
                if (!cell || !label) return;
                cell.classList.toggle('is-conflict', !!issue);
                label.textContent = issue ? `⚠ Disputa · ${issue.cantidad} equipos` : '';
                label.title = issue ? `${issue.cantidad} equipos asignados a ${issue.spot}` : '';
            });
        });
    }

    function bindDragging(host) {
        host.querySelectorAll('.mca-pin[data-pin]').forEach(pin => pin.addEventListener('pointerdown', event => {
            event.preventDefault(); event.stopPropagation();
            const [rowIndex, mapIndex] = pin.dataset.pin.split(':'), row = state.filas[Number(rowIndex)];
            const stage = pin.closest('.mca-map-stage'), bounds = stage.getBoundingClientRect(), pointerId = event.pointerId;
            const dropInput = host.querySelector(`[data-drop="${rowIndex}:${mapIndex}"]`);
            pin.setPointerCapture(pointerId); pin.classList.add('is-dragging');
            const move = e => {
                if (e.pointerId !== pointerId) return;
                const x = Math.max(1, Math.min(99, (e.clientX - bounds.left) / bounds.width * 100));
                const y = Math.max(1, Math.min(99, (e.clientY - bounds.top) / bounds.height * 100));
                row.posiciones[mapIndex] = { x, y }; pin.style.left = `${x}%`; pin.style.top = `${y}%`; save();
            };
            const end = () => {
                pin.classList.remove('is-dragging'); pin.removeEventListener('pointermove', move); pin.removeEventListener('pointerup', end); pin.removeEventListener('pointercancel', end);
                const current = row.posiciones[mapIndex], spot = current && detectarSpotCercano(MAPAS[Number(mapIndex)].id, current.x, current.y);
                if (spot) {
                    row.caidas[Number(mapIndex)] = spot.nombre;
                    row.posiciones[mapIndex] = { x: spot.pos[0], y: spot.pos[1] };
                    if (dropInput) dropInput.value = spot.nombre;
                    setStatus(`Caída de ${row.equipo}: ${spot.nombre} · ${MAPAS[Number(mapIndex)].nombre}.`);
                    save();
                }
                updateMaps();
            };
            pin.addEventListener('pointermove', move); pin.addEventListener('pointerup', end, { once: true }); pin.addEventListener('pointercancel', end, { once: true });
        }));
    }

    function readLogo(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onerror = () => reject(new Error('No se pudo leer el logo.'));
            reader.onload = () => {
                const image = new Image();
                image.onerror = () => reject(new Error('El archivo no es una imagen válida.'));
                image.onload = () => {
                    const canvas = document.createElement('canvas'); canvas.width = 160; canvas.height = 160;
                    const ctx = canvas.getContext('2d'), scale = Math.min(160 / image.width, 160 / image.height);
                    const w = image.width * scale, h = image.height * scale;
                    ctx.drawImage(image, (160 - w) / 2, (160 - h) / 2, w, h);
                    resolve(canvas.toDataURL('image/png'));
                };
                image.src = reader.result;
            };
            reader.readAsDataURL(file);
        });
    }

    function saveCurrentToShelf() {
        const name = prompt('Nombre de este análisis de caídas:', `Análisis ${new Date().toLocaleDateString('es-CO')}`);
        if (!name?.trim()) return;
        shelf.unshift({ id: crypto.randomUUID(), nombre: name.trim().slice(0, 70), state: JSON.parse(JSON.stringify(state)), actualizado: new Date().toISOString() });
        if (!saveShelf()) { shelf.shift(); return; }
        renderShelf('mca-repisa-lista'); window.mapeadorRepisaRender?.(); setStatus('Análisis guardado en la Repisa.');
    }

    function renderShelf(hostId) {
        const host = document.getElementById(hostId); if (!host) return;
        host.innerHTML = shelf.length ? shelf.map(item => `<article class="mca-shelf-row"><span><b>${esc(item.nombre)}</b><small>${item.state?.n || 12} equipos · ${new Date(item.actualizado).toLocaleDateString('es-CO')}</small></span><button type="button" class="btn-sec" onclick="mapeadorCargarGuardado('${esc(item.id)}')">Abrir</button><button type="button" class="btn-sec" onclick="mapeadorEliminarGuardado('${esc(item.id)}')">Eliminar</button></article>`).join('') : '<p class="mca-empty">Todavía no hay análisis guardados.</p>';
    }

    function loadSaved(id) {
        const saved = shelf.find(item => item.id === id); if (!saved?.state) return;
        state = normalize(saved.state); save();
        abrirMapeador().then(() => { render(); setStatus(`“${saved.nombre}” abierto desde la Repisa.`); });
    }

    function deleteSaved(id) {
        const saved = shelf.find(item => item.id === id); if (!saved || !confirm(`¿Eliminar “${saved.nombre}” de la Repisa?`)) return;
        shelf = shelf.filter(item => item.id !== id); saveShelf(); renderShelf('mca-repisa-lista'); window.mapeadorRepisaRender?.();
    }

    function renderRepisaPublica() { renderShelf('mapeador-caidas-repisa'); }

    function setStatus(message) {
        const el = document.querySelector('#mapeador-caidas .mca-status');
        if (el) el.textContent = message;
    }

    function printMap(id) {
        const host = document.getElementById('mapeador-caidas');
        host.dataset.printMap = id;
        document.body.classList.add('mca-printing');
        const cleanup = () => {
            document.body.classList.remove('mca-printing');
            delete host.dataset.printMap;
        };
        window.addEventListener('afterprint', cleanup, { once: true });
        window.print();
    }

    function loadImage(src) {
        return new Promise((resolve, reject) => {
            const image = new Image(); image.onload = () => resolve(image); image.onerror = reject; image.src = src;
        });
    }

    async function downloadMap(id) {
        const mapa = MAPAS.find(m => m.id === id), j = MAPAS.indexOf(mapa);
        if (!mapa) return;
        const canvas = document.createElement('canvas'); canvas.width = 1600; canvas.height = 1200;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#08121b'; ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = '#f1f6f8'; ctx.font = '700 38px Arial'; ctx.fillText(`CAÍDAS · ${mapa.nombre.toUpperCase()}`, 55, 62);
        ctx.fillStyle = '#9aabb6'; ctx.font = '18px Arial'; ctx.fillText('Número en el mapa = equipo de la leyenda', 58, 94);
        let img;
        try { img = await loadImage(Tablero.imagenMapa(mapa.app)); }
        catch (_) { setStatus(`No se pudo cargar el mapa de ${mapa.nombre}.`); return; }
        const mx = 55, my = 125, mw = 1040, mh = 1040;
        ctx.drawImage(img, mx, my, mw, mh);
        ctx.save();
        ctx.strokeStyle = 'rgba(232,247,255,.78)'; ctx.lineWidth = 2; ctx.setLineDash([12, 9]);
        ctx.beginPath(); ctx.moveTo(mx + mw / 2, my); ctx.lineTo(mx + mw / 2, my + mh); ctx.moveTo(mx, my + mh / 2); ctx.lineTo(mx + mw, my + mh / 2); ctx.stroke();
        ctx.setLineDash([]); ctx.font = '700 20px Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        [[ 'A', mx + 24, my + 24 ], [ 'B', mx + mw - 24, my + 24 ], [ 'C', mx + 24, my + mh - 24 ], [ 'D', mx + mw - 24, my + mh - 24 ]].forEach(([letter, x, y]) => {
            ctx.fillStyle = 'rgba(8,42,70,.88)'; ctx.strokeStyle = '#11d9e7'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, y, 17, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
            ctx.fillStyle = '#eaf7ff'; ctx.fillText(letter, x, y + 1);
        });
        ctx.restore();
        const logoImages = new Map();
        await Promise.all(state.filas.map(async (row, i) => { if (row.logo) { try { logoImages.set(i, await loadImage(row.logo)); } catch (_) {} } }));
        const groups = groupsFor(j), placements = new Map();
        for (const group of groups.values()) {
            const [x, y] = group.pos, px = mx + x / 100 * mw, py = my + y / 100 * mh;
            if (group.teams.length > 1) { ctx.beginPath(); ctx.arc(px, py, groupCircleSize(group.teams.length, mw, 44) / 200 * mw, 0, Math.PI * 2); ctx.fillStyle = 'rgba(239, 36, 48, 0.4)'; ctx.fill(); }
            group.teams.forEach((team, ix) => placements.set(team.idx, { group, ix }));
        }
        state.filas.forEach((row, i) => {
            if (!row.equipo.trim()) return;
            const pos = teamPosition(row, i, j, placements.get(i)), { x, y } = pos;
            const cx = mx + x / 100 * mw, cy = my + y / 100 * mh, logo = logoImages.get(i);
            ctx.beginPath(); ctx.arc(cx, cy, 21, 0, Math.PI * 2); ctx.fillStyle = '#082a46'; ctx.fill(); ctx.lineWidth = state.miEquipo === i ? 5 : 3; ctx.strokeStyle = state.miEquipo === i ? '#ffd166' : '#11d9e7'; ctx.stroke();
            if (logo) { ctx.save(); ctx.beginPath(); ctx.arc(cx, cy, 16, 0, Math.PI * 2); ctx.clip(); ctx.drawImage(logo, cx - 16, cy - 16, 32, 32); ctx.restore(); }
            if (state.miEquipo === i) { ctx.fillStyle = '#ffd166'; ctx.font = '700 16px Arial'; ctx.textAlign = 'center'; ctx.fillText('★', cx + 19, cy - 17); }
        });
        ctx.fillStyle = '#11d9e7'; ctx.font = '700 23px Arial'; ctx.fillText('EQUIPOS', 1150, 150);
        for (const [i, data] of state.filas.entries()) {
            if (!data.equipo.trim()) continue;
            const y = 198 + i * 62;
            ctx.beginPath(); ctx.arc(1168, y - 7, 17, 0, Math.PI * 2); ctx.fillStyle = '#f5f7f8'; ctx.fill();
            const logo = logoImages.get(i);
            if (logo) { ctx.save(); ctx.beginPath(); ctx.arc(1168, y - 7, 16, 0, Math.PI * 2); ctx.clip(); ctx.drawImage(logo, 1152, y - 23, 32, 32); ctx.restore(); }
            else { ctx.fillStyle = '#101820'; ctx.font = '700 14px Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(String(i + 1), 1168, y - 7); ctx.textAlign = 'left'; }
            ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
            ctx.fillStyle = state.miEquipo === i ? '#ffd166' : '#f1f6f8'; ctx.font = '600 16px Arial'; fitText(ctx, `${state.miEquipo === i ? '★ ' : ''}${data.equipo}`, 1195, y - 13, 365);
            ctx.fillStyle = '#9aabb6'; ctx.font = '13px Arial'; fitText(ctx, data.caidas[j] || 'Sin spot', 1195, y + 7, 365);
        }
        canvas.toBlob(blob => {
            if (!blob) return setStatus('No se pudo crear el PNG.');
            const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `caidas-${mapa.nombre.toLowerCase()}.png`; a.click();
            setTimeout(() => URL.revokeObjectURL(a.href), 1500); setStatus(`PNG de ${mapa.nombre} descargado.`);
        }, 'image/png');
    }

    function fitText(ctx, text, x, y, maxWidth) {
        let out = String(text || '');
        while (out.length && ctx.measureText(out).width > maxWidth) out = out.slice(0, -2);
        if (out !== String(text || '') && out.length) out = out.slice(0, -1) + '…';
        ctx.fillText(out, x, y);
    }

    window.mapeadorRenderCaidas = render;
    window.mapeadorRepisaRender = renderRepisaPublica;
    window.mapeadorCargarGuardado = loadSaved;
    window.mapeadorEliminarGuardado = deleteSaved;
})();
