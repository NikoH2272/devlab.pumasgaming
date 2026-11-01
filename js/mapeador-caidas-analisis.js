// Analisis espacial de caidas. Los tiempos son estimaciones calibrables, no rutas de juego reales.
(() => {
    const SETTINGS_KEY = 'pumasDevLab.mapeadorAnalisisConfig.v1';
    const MAP_SIDE_METERS = { BERMUDA:1840, PURGATORIO:1827, KALAHARI:1420, NEXTERRA:1269, SOLARA:1496 };
    const SPEEDS = { pie:6.5, vehiculo:31 };
    const defaults = { modoVelocidad:'pie', radioMetros:250 };
    const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[c]);
    const norm = s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').toUpperCase().trim();
    let settings = (() => {
        try {
            const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}');
            return { ...defaults, modoVelocidad:['pie','vehiculo'].includes(saved.modoVelocidad) ? saved.modoVelocidad : 'pie', radioMetros:Number(saved.radioMetros) > 0 ? Number(saved.radioMetros) : defaults.radioMetros };
        } catch (_) { return { ...defaults }; }
    })();

    function persist() { try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch (_) {} }
    function minutes(distanceMeters) { return distanceMeters / SPEEDS[settings.modoVelocidad] / 60; }
    function distance(mapaId, a, b) { return Math.hypot(a[0] - b[0], a[1] - b[1]) / 100 * MAP_SIDE_METERS[mapaId]; }
    function quadrantName(pos) { return pos[1] < 50 ? (pos[0] < 50 ? 'A' : 'B') : (pos[0] < 50 ? 'C' : 'D'); }
    function coordsFor(coords, mapa, spot) {
        const obj = coords?.[mapa]; if (!obj || !spot) return null;
        const key = Object.keys(obj).find(k => norm(k) === norm(spot));
        return key ? obj[key] : null;
    }
    function fmtDistance(value) { return value >= 1000 ? `${(value / 1000).toFixed(2)} km` : `${Math.round(value)} m`; }
    function fmtTime(value) { return `${Math.max(1, Math.round(value))} min`; }

    function analyze(state, mapa, coords) {
        const teams = state.filas.map((row, idx) => ({ idx, name: row.equipo.trim(), spot: row.caidas[mapa.index] || '', pos: coordsFor(coords, mapa.id, row.caidas[mapa.index] || '') }))
            .filter(x => x.name && x.pos);
        const groups = new Map();
        teams.forEach(t => { const key = norm(t.spot); if (!groups.has(key)) groups.set(key, []); groups.get(key).push(t); });
        const own = teams.find(t => t.idx === state.miEquipo);
        const conflictGroups = [...groups.values()].filter(g => g.length > 1);
        const occupancy = [...groups.values()].map(g => ({ spot:g[0].spot, pos:g[0].pos, count:g.length, teams:g }));
        const soloSpots = Object.entries(coords?.[mapa.id] || {}).map(([name, pos]) => ({ name, pos, count:groups.get(norm(name))?.length || 0, team:groups.get(norm(name))?.[0]?.name || '' }))
            .filter(s => s.count === 1 && (!own || norm(s.name) !== norm(own.spot)))
            .sort((a,b) => own ? distance(mapa.id,own.pos,a.pos)-distance(mapa.id,own.pos,b.pos) : a.count-b.count);
        const byQuadrant = { A:0, B:0, C:0, D:0 };
        teams.forEach(t => byQuadrant[quadrantName(t.pos)]++);
        const near = own ? teams.filter(t => t.idx !== own.idx && distance(mapa.id,own.pos,t.pos) <= settings.radioMetros).sort((a,b) => distance(mapa.id,own.pos,a.pos)-distance(mapa.id,own.pos,b.pos)) : [];
        const ownGroup = own ? groups.get(norm(own.spot)) || [] : [];
        const ownQ = own ? quadrantName(own.pos) : null;
        const inOwnQuadrant = own ? teams.filter(t => t.idx !== own.idx && quadrantName(t.pos) === ownQ) : [];
        const availableNear = own ? Object.entries(coords?.[mapa.id] || {}).map(([name,pos]) => ({name,pos,count:groups.get(norm(name))?.length||0,d:distance(mapa.id,own.pos,pos)}))
            .filter(s => !s.count && s.d > 0).sort((a,b) => a.d-b.d).slice(0,3) : [];
        return { teams, groups, own, conflictGroups, occupancy, soloSpots, byQuadrant, near, ownGroup, ownQ, inOwnQuadrant, availableNear };
    }

    function render(state, mapas, coords) {
        const host = document.getElementById('mca-analysis'); if (!host) return;
        host.innerHTML = `<header class="mca-analysis-head"><div><span class="tb-kicker">// Lectura espacial</span><h3>Análisis automático de zonas y rotaciones</h3><p>Distancias calculadas con la escala individual de cada mapa.</p></div><div class="mca-analysis-config"><label>Velocidad para estimar rotación<select data-analysis-setting="modoVelocidad"><option value="pie" ${settings.modoVelocidad === 'pie' ? 'selected' : ''}>A pie · 6,5 m/s</option><option value="vehiculo" ${settings.modoVelocidad === 'vehiculo' ? 'selected' : ''}>Vehículo · 31 m/s</option></select></label><label>Radio para detectar rivales cercanos<input type="number" min="50" max="1500" step="50" data-analysis-setting="radioMetros" value="${settings.radioMetros}"></label></div></header><p class="mca-analysis-note">Escala tomada de los datos de análisis de mapas del proyecto. Distancias en línea recta; el tiempo no incluye terreno, tráfico, zona ni aceleración del vehículo.</p><div class="mca-analysis-grid">${mapas.map((mapa, index) => renderMap(state, { ...mapa, index }, coords)).join('')}</div>`;
        host.querySelectorAll('[data-analysis-setting]').forEach(input => input.addEventListener('change', () => {
            const key = input.dataset.analysisSetting;
            if (key === 'modoVelocidad') settings.modoVelocidad = input.value === 'vehiculo' ? 'vehiculo' : 'pie';
            else {
                const value = Number(input.value);
                if (!Number.isFinite(value) || value <= 0) { input.value = settings[key]; return; }
                settings[key] = value;
            }
            persist(); render(state, mapas, coords);
        }));
    }

    function renderMap(state, mapa, coords) {
        const a = analyze(state, mapa, coords), q = a.byQuadrant;
        const density = ['A','B','C','D'].map(k => `<span><b>${k}</b> ${q[k]}</span>`).join('');
        const shared = a.conflictGroups.length ? a.conflictGroups.map(g => `<li><b>${esc(g[0].spot)}</b> · ${g.length} equipos: ${g.map(t => esc(t.name)).join(', ')}</li>`).join('') : '<li>Sin disputas exactas de spot.</li>';
        let ownInfo = '<p>Marca «Mi equipo» en la tabla para ver rivales cercanos y sugerencias de rotación.</p>';
        if (a.own) {
            const nearText = a.near.length ? a.near.map(t => `${esc(t.name)} (${fmtDistance(distance(mapa.id,a.own.pos,t.pos))} · ${fmtTime(minutes(distance(mapa.id,a.own.pos,t.pos)))})`).join(', ') : 'Ningún equipo dentro del radio cercano configurado.';
            const qText = a.inOwnQuadrant.length ? a.inOwnQuadrant.map(t => esc(t.name)).join(', ') : 'sin otros equipos registrados';
            const rotateText = a.availableNear.length ? a.availableNear.map(s => `<li><b>${esc(s.name)}</b> · ${fmtDistance(s.d)} · ${fmtTime(minutes(s.d))}</li>`).join('') : '<li>No hay spots libres cercanos en el catálogo.</li>';
            ownInfo = `<p><b>Tu caída:</b> ${esc(a.own.spot)} · cuadrante ${a.ownQ} · ${a.ownGroup.length > 1 ? `disputa con ${a.ownGroup.length - 1} equipo(s)` : 'sin disputa exacta'}.</p><p><b>En el cuadrante ${a.ownQ}:</b> ${qText} (${a.inOwnQuadrant.length} rival(es)).</p><p><b>Enemigos a ${fmtDistance(settings.radioMetros)}:</b> ${nearText}</p><div><b>Spots libres para rotar:</b><ul>${rotateText}</ul></div>`;
        }
        const solos = a.soloSpots.slice(0,5).map(s => `<li><b>${esc(s.name)}</b> · ${s.team === a.own?.name ? 'tu equipo' : esc(s.team)}${a.own ? ` · ${fmtDistance(distance(mapa.id,a.own.pos,s.pos))} / ${fmtTime(minutes(distance(mapa.id,a.own.pos,s.pos)))}` : ''}</li>`).join('') || '<li>No hay spots ocupados por un solo equipo.</li>';
        return `<article class="mca-analysis-card"><h4>${esc(mapa.nombre)} <small>· escala ${fmtDistance(MAP_SIDE_METERS[mapa.id])} × ${fmtDistance(MAP_SIDE_METERS[mapa.id])}</small></h4><div class="mca-analysis-quads">${density}</div><div class="mca-analysis-columns"><section><b>Spots disputados</b><ul>${shared}</ul></section><section><b>Lectura de Mi equipo</b>${ownInfo}</section><section><b>Spots con un solo equipo</b><ul>${solos}</ul></section></div></article>`;
    }

    window.mapeadorAnalisisRender = render;
})();
