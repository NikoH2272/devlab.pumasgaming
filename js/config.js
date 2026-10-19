// ============================================================
// PUMAS DEV LAB · Conexión a Supabase
// ------------------------------------------------------------
// Solo la clave "anon public" va aquí: es pública por diseño y la
// seguridad la imponen las políticas RLS (supabase/schema.sql).
// NUNCA pongas la clave service_role en el navegador.
// ============================================================
const SUPABASE_URL = 'https://zkvzepskhjsfgucpibpx.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InprdnplcHNraGpzZmd1Y3BpYnB4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTE1MDk3NTUsImV4cCI6MjEwNzA4NTc1NX0.SM3ujtg_CQhlEtObIlztG1ARlxYN70fiqHpAf_MjA-o';

// Se entra con nombre de usuario. Supabase Auth guarda internamente un
// identificador usuario@este-dominio que nadie ve ni recibe mensajes.
// Debe coincidir con supabase/migrations/002_usuarios_sin_correo.sql.
const DOMINIO_USUARIOS = 'usuarios.pumasgaming.com';

// Módulos del menú que el admin puede prender o apagar en Ajustes > Módulos.
// "roles" es el valor por defecto (si la migración 008 no corrió o el
// módulo no se ha configurado). El admin siempre ve todo para probar.
const TODOS_LOS_ROLES = ['admin', 'ceo', 'manager', 'coach', 'analista'];
const MODULOS = {
    vision:       { n: 'Visión del equipo',   detalle: 'Dashboard, jugadores, combate, diagnóstico y partidas', vistas: ['vista-informe'], roles: TODOS_LOS_ROLES },
    caidas:       { n: 'Caídas',              detalle: 'Zona principal y alterna por mapa', vistas: ['vista-caidas'], roles: TODOS_LOS_ROLES },
    partidas:     { n: 'Partidas',            detalle: 'Registro de partidas y lectura con IA', vistas: ['vista-partida'], roles: TODOS_LOS_ROLES },
    equipos:      { n: 'Equipos y jugadores', detalle: 'Rosters y jugadores', vistas: ['vista-equipos'], roles: TODOS_LOS_ROLES },
    estrategia:   { n: 'Estrategia',          detalle: 'Mapas, vistas aéreas y repisa', vistas: ['vista-tablero', 'vista-repisa'], roles: ['admin'] },
    mapstream:    { n: 'MapStream',           detalle: 'Repetición de partidas desde el replay del juego', vistas: ['vista-mapstream'], roles: ['admin'] },
    estadisticas: { n: 'Estadísticas CSV',    detalle: 'Generar el CSV desde el replay y ver estadísticas por partida y torneo', vistas: ['vista-estadisticas'], roles: ['admin'] },
    administrativo: { n: 'Administrativo',    detalle: 'Equipo, miembros, presupuesto en USD, torneos, relámpagos y resultados (entrada del manager)', vistas: ['vista-admin'], roles: ['admin', 'ceo', 'manager'] },
    herramientas: { n: 'Herramientas',        detalle: 'Resultados (logs), módulos informativos y respaldo', vistas: ['modulo-resultados', 'modulo-rendimiento', 'modulo-analisis'], roles: TODOS_LOS_ROLES }
};

// Nombre de la Edge Function que lee las capturas con Gemini
// (código en supabase/functions/leer-captura/index.ts)
const FUNCION_LEER_CAPTURA = 'dynamic-action';

const supabaseClient = window.supabase ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;

// Dirección limpia: quita "index.html", parámetros y "#" de la barra de direcciones
(function limpiarDireccion() {
    const ruta = location.pathname.replace(/index\.html$/i, '');
    if (ruta !== location.pathname || location.search || location.hash) {
        history.replaceState(null, '', ruta);
    }
})();
