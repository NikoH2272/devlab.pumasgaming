// ============================================================
// Edge Function: leer-captura (Gemini)
// Lee la captura del marcador de Free Fire con Gemini y devuelve
// las estadísticas en JSON para precargar el formulario.
//
// Secretos (Supabase > Edge Functions > Secrets):
//   GEMINI_API_KEY  clave creada en aistudio.google.com
//   GEMINI_MODEL    opcional; por defecto gemini-3-flash-preview
//
// Solo la usan quienes tienen permiso y cupo del día
// (supabase/migrations/004_limites_ia.sql).
// ============================================================
import { GoogleGenAI } from "npm:@google/genai";
import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MAPAS = ["Bermuda", "Purgatorio", "Kalahari", "Nexterra", "Solara"];

const INSTRUCCIONES = `Esta es la pantalla de resultados de una partida de Free Fire.
Extrae los datos exactamente como aparecen y responde SOLO con JSON con esta forma:
{
  "mapa": "Bermuda" | "Purgatorio" | "Kalahari" | "Nexterra" | "Solara" | "Otro",
  "posicion": número,          // de "#N/M" toma N
  "totalEquipos": número,      // de "#N/M" toma M
  "jugadores": [{
    "nick": texto tal cual (incluye prefijos de clan, pero NO insignias ni letras sueltas que aparecen después del nick),
    "k": número, "d": número, "a": número,   // de K/D/A
    "dmg": número,            // DMG
    "danoReal": número,       // DAÑO REAL
    "noqueos": número,        // NOQUEAR
    "curacion": número,       // CURAR
    "levantar": número,       // AYUDAR A LEVANTARSE
    "resurreccion": número,   // RESURRECCIÓN
    "hs": número              // TASA DE DISPAROS A LA CABEZA, sin el símbolo %
  }]
}
Nueva Tierra = Nexterra. Usa el número grande de cada celda, no el porcentaje de la barra.`;

const CLAVE = (Deno.env.get("GEMINI_API_KEY") ?? "").trim();
const ai = new GoogleGenAI({ apiKey: CLAVE });
const MODELO = (Deno.env.get("GEMINI_MODEL") ?? "").trim() || "gemini-3-flash-preview";

Deno.serve(async (req) => {
    if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

    if (!CLAVE) {
        return json({ error: "Falta el secreto GEMINI_API_KEY en Supabase (Edge Functions > Secrets)" }, 500);
    }

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
        global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
    });
    let reserva: { id: string; restantes: number } | null = null;

    try {
        const { imagen, jugadores = [] } = await req.json();
        const m = /^data:(image\/(?:jpeg|png|webp));base64,(.+)$/.exec(imagen ?? "");
        if (!m) return json({ error: "Imagen inválida" }, 400);

        // Permiso y cupo: lo decide la base de datos (migración 004_limites_ia.sql)
        const { data, error } = await supabase.rpc("ia_reservar");
        if (error) {
            const e = error.message;
            if (/IA_SIN_PERMISO/.test(e)) return json({ error: "No tienes permiso para usar la lectura con IA. Pídeselo al administrador." }, 403);
            if (/IA_LIMITE_USUARIO/.test(e)) return json({ error: `Llegaste a tu límite de ${e.split(":").pop()} lecturas de hoy. Mañana se renueva.` }, 429);
            if (/IA_LIMITE_GLOBAL/.test(e)) return json({ error: "Se alcanzó el límite diario de lecturas de toda la plataforma. Mañana se renueva." }, 429);
            return json({ error: "No autorizado" }, 401);
        }
        reserva = data;

        const pista = jugadores.length ? `\nNicks registrados en el roster (para referencia): ${jugadores.join(", ")}` : "";

        const respuesta = await ai.models.generateContent({
            model: MODELO,
            contents: [{
                role: "user",
                parts: [
                    { inlineData: { mimeType: m[1], data: m[2] } },
                    { text: INSTRUCCIONES + pista },
                ],
            }],
            config: { responseMimeType: "application/json", temperature: 0 },
        });

        const datos = normalizar(JSON.parse(respuesta.text ?? "{}"));
        if (!datos.jugadores.length) {
            await finalizar(supabase, reserva, false);
            return json({ error: "No se encontraron jugadores en la captura" }, 422);
        }
        await finalizar(supabase, reserva, true);
        return json({ ...datos, restantes: reserva!.restantes }, 200);
    } catch (err) {
        // Si la lectura falló, no se descuenta del límite
        await finalizar(supabase, reserva, false);
        const msg = String((err as Error)?.message ?? err);
        if (/429|quota|RESOURCE_EXHAUSTED/i.test(msg)) return json({ error: "Se alcanzó el límite gratuito de Gemini, intenta más tarde" }, 429);
        if (/API key|API_KEY|PERMISSION_DENIED|UNAUTHENTICATED/i.test(msg)) {
            // Incluye el inicio de la clave (nunca completa) para comprobar que es la correcta
            return json({ error: `Google rechazó la clave de Gemini (empieza por "${CLAVE.slice(0, 6)}…", ${CLAVE.length} caracteres): ${msg.slice(0, 200)}` }, 502);
        }
        if (/not found|NOT_FOUND/i.test(msg)) return json({ error: `El modelo "${MODELO}" no está disponible para esta clave` }, 502);
        return json({ error: msg }, 500);
    }
});

// deno-lint-ignore no-explicit-any
async function finalizar(supabase: any, reserva: { id: string } | null, ok: boolean) {
    if (!reserva) return;
    try { await supabase.rpc("ia_finalizar", { p_id: reserva.id, p_ok: ok }); } catch { /* no bloquea la respuesta */ }
}

// Asegura tipos y nombres aunque el modelo devuelva algo ligeramente distinto
function normalizar(d: Record<string, unknown>) {
    const n = (v: unknown) => {
        const x = Number(String(v ?? 0).replace("%", "").replace(",", "."));
        return Number.isFinite(x) ? x : 0;
    };
    const mapa = MAPAS.find((x) => x.toLowerCase() === String(d.mapa ?? "").toLowerCase()) ?? "Otro";
    const jugadores = (Array.isArray(d.jugadores) ? d.jugadores : []).map((j: Record<string, unknown>) => ({
        nick: String(j.nick ?? ""),
        k: n(j.k), d: n(j.d), a: n(j.a),
        dmg: n(j.dmg), danoReal: n(j.danoReal), noqueos: n(j.noqueos), curacion: n(j.curacion),
        levantar: n(j.levantar), resurreccion: n(j.resurreccion), hs: n(j.hs),
    })).filter((j) => j.nick);
    return { mapa, posicion: n(d.posicion) || null, totalEquipos: n(d.totalEquipos) || null, jugadores };
}

function json(body: unknown, status: number) {
    return new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
}
