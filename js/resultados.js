// El cliente de Supabase se crea en js/config.js

async function verificarConexionSupabase() {
    const el = document.getElementById('statusSupabase');
    if (!supabaseClient) {
        el.innerText = 'SDK no cargado';
        el.style.color = '#e66767';
        return;
    }
    const { error } = await supabaseClient.rpc('hay_usuarios');
    el.innerText = error ? 'Base de datos sin configurar' : 'Servidor en línea';
    el.title = error ? error.message : '';
    const punto = document.getElementById('punto-estado');
    if (punto) punto.className = 'punto ' + (error ? 'error' : 'ok');
}
verificarConexionSupabase();

let parsedMatchData = [];
let detectedTeamsGlobal = [];

// Parseador de Logs para el Módulo de Resultados
document.getElementById('fileInput')?.addEventListener('change', async function(e) {
    const files = e.target.files;
    if (!files.length) return;
    
    parsedMatchData = [];
    let equiposSet = new Set();
    
    for (let file of files) {
        const text = await file.text();
        const lines = text.split('\n');
        
        lines.forEach(line => {
            if (line.trim().length > 0) {
                let parts = line.split(',');
                let equipo = parts[0] ? parts[0].trim().toUpperCase() : "PUMAS DEV TEAM";
                equiposSet.add(equipo);
            }
        });
    }

    document.getElementById('statLogsCount').innerText = `${files.length} archivo(s)`;
    detectedTeamsGlobal = Array.from(equiposSet);
    if (detectedTeamsGlobal.length === 0) {
        detectedTeamsGlobal = ["PUMAS ELITE", "PUMAS USA", "DEV SQUAD 1", "DEV SQUAD 2"];
    }
    
    prepararRenombradoEquipos();
});

function prepararRenombradoEquipos() {
    const container = document.getElementById('listaEquiposInputs');
    if (!container) return;
    container.innerHTML = '';
    
    detectedTeamsGlobal.forEach((eq) => {
        let div = document.createElement('div');
        div.style.display = 'flex';
        div.style.gap = '10px';
        div.innerHTML = `
            <input type="text" value="${eq}" data-original="${eq}" class="input-eq-nombre" style="flex: 1; padding: 8px; background: #050508; border: 1px solid var(--primary); color: #fff;">
        `;
        container.appendChild(div);
    });
    
    document.getElementById('seccionRenombrar').style.display = 'block';
}

function procesarConNombresPersonalizados() {
    const inputs = document.querySelectorAll('.input-eq-nombre');
    let mapaNombres = {};
    inputs.forEach(inp => {
        mapaNombres[inp.getAttribute('data-original')] = inp.value.trim();
    });
    
    parsedMatchData = detectedTeamsGlobal.map((eq, idx) => {
        let nombreFinal = mapaNombres[eq] || eq;
        return {
            equipo: nombreFinal,
            booyah: idx === 0 ? 2 : (idx % 2),
            placePoints: Math.max(10, 50 - (idx * 6)),
            kills: Math.max(5, 35 - (idx * 4)),
            totalScore: Math.max(20, 85 - (idx * 8))
        };
    });
    
    renderizarResultadosFromState();
}

function renderizarResultadosFromState() {
    const output = document.getElementById('outputTablasLadoALado');
    if (!output) return;
    
    if (parsedMatchData.length === 0) {
        parsedMatchData = [
            { equipo: "PUMAS ELITE DEV", booyah: 2, placePoints: 45, kills: 32, totalScore: 77 },
            { equipo: "PUMAS USA PRO", booyah: 1, placePoints: 38, kills: 28, totalScore: 66 },
            { equipo: "ALPHA SQUAD", booyah: 1, placePoints: 30, kills: 22, totalScore: 52 },
            { equipo: "CYBER LIONS", booyah: 0, placePoints: 24, kills: 18, totalScore: 42 }
        ];
    }
    
    const modo = document.getElementById('selectModoCalculo')?.value || "1";
    const moderador = document.getElementById('inputModerador')?.value || "Coach Niko";
    const titulo = document.getElementById('inputTituloTorneo')?.value || "PUMAS GAMING DEV LAB";
    const jornada = document.getElementById('inputJornadaTorneo')?.value || "FASE DE PRUEBAS";
    
    let datosOrdenados = [...parsedMatchData];
    if (modo === "2") {
        datosOrdenados.sort((a, b) => b.placePoints - a.placePoints);
    } else if (modo === "3") {
        datosOrdenados.sort((a, b) => b.kills - a.kills);
    } else {
        datosOrdenados.sort((a, b) => b.totalScore - a.totalScore);
    }
    
    let html = `
        <div style="background: #050508; border: 2px solid var(--primary); padding: 25px; width: 100%; font-family: 'Rajdhani', sans-serif;">
            <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--primary); padding-bottom: 15px; margin-bottom: 20px; flex-wrap: wrap; gap: 10px;">
                <div>
                    <h3 style="color: var(--primary); font-family: 'Orbitron'; font-size: 1.2rem; margin-bottom: 5px;">${titulo}</h3>
                    <p style="color: var(--secondary); font-size: 0.9rem; margin: 0;">${jornada} | Modo: ${modo === '1' ? 'Normal' : modo === '2' ? 'Solo Posición' : 'Solo Kills'}</p>
                </div>
                <div style="text-align: right;">
                    <span style="color: var(--primary); font-size: 0.8rem; font-family: 'Orbitron'; display: block;">ADMIN: ${moderador}</span>
                    <span style="color: var(--secondary); font-size: 0.75rem;">DEV LAB V1.0</span>
                </div>
            </div>
            
            <table style="width: 100%; border-collapse: collapse; text-align: left; overflow-x: auto; display: block;">
                <thead>
                    <tr style="border-bottom: 1px solid var(--primary); color: var(--primary); font-family: 'Orbitron'; font-size: 0.85rem;">
                        <th style="padding: 10px;">#</th>
                        <th style="padding: 10px;">EQUIPO</th>
                        <th style="padding: 10px; text-align: center;">BOOYAH</th>
                        <th style="padding: 10px; text-align: center;">PTS POS</th>
                        <th style="padding: 10px; text-align: center;">KILLS</th>
                        <th style="padding: 10px; text-align: center;">TOTAL</th>
                    </tr>
                </thead>
                <tbody>
    `;
    
    datosOrdenados.forEach((item, idx) => {
        let colorFondo = idx === 0 ? 'background: rgba(0, 240, 255, 0.1);' : '';
        html += `
            <tr style="border-bottom: 1px solid rgba(0, 240, 255, 0.15); ${colorFondo}">
                <td style="padding: 10px; font-weight: bold; color: var(--primary);">0${idx + 1}</td>
                <td style="padding: 10px; font-weight: bold; color: #fff;">${item.equipo}</td>
                <td style="padding: 10px; text-align: center; color: var(--secondary);">${item.booyah}</td>
                <td style="padding: 10px; text-align: center; color: var(--secondary);">${item.placePoints}</td>
                <td style="padding: 10px; text-align: center; color: var(--secondary);">${item.kills}</td>
                <td style="padding: 10px; text-align: center; font-weight: bold; color: var(--primary);">${item.totalScore}</td>
            </tr>
        `;
    });
    
    html += `
                </tbody>
            </table>
        </div>
    `;
    
    output.innerHTML = html;
}

window.addEventListener('DOMContentLoaded', () => {
    renderizarResultadosFromState();
});