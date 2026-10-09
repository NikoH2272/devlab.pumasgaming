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

// Módulos visibles en el menú (false = oculto, el código queda listo)
const MODULOS = {
    estrategia: false   // Mapas, Vistas aéreas y Repisa
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
