// ============================================================
// Edge Function: calendario (calendario compartido de torneos)
// Devuelve un .ics con los torneos (cada fase) y relámpagos de una
// organización. Google Calendar se suscribe a esta dirección y se
// actualiza solo: jugadores y staff ven siempre las fechas al día.
//
// Uso: https://<proyecto>.supabase.co/functions/v1/calendario?t=<código>
// El código lo crea el módulo Administrativo (Torneos > Calendario).
//
// Al crear la función en Supabase desactiva "Verify JWT"
// (Google Calendar no envía sesión). Usa SUPABASE_URL y
// SUPABASE_SERVICE_ROLE_KEY, que Supabase ya define solo.
// ============================================================
import { createClient } from "npm:@supabase/supabase-js@2";

const esc = (s: unknown) => String(s ?? "").replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
const utc = (iso: string) => new Date(iso).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");

// Corta las líneas largas como pide el formato iCalendar
const plegar = (linea: string) => {
    const partes = [];
    for (let i = 0; i < linea.length; i += 70) partes.push((i ? " " : "") + linea.slice(i, i + 70));
    return partes.join("\r\n");
};

Deno.serve(async (req) => {
    const t = new URL(req.url).searchParams.get("t") || "";
    if (!/^[a-f0-9]{32}$/.test(t)) return new Response("Calendario no encontrado", { status: 404 });

    const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: cal } = await db.from("admin_registros").select("org_id").eq("tipo", "calendario").eq("datos->>token", t).maybeSingle();
    if (!cal) return new Response("Calendario no encontrado", { status: 404 });

    const [{ data: org }, { data: filas }] = await Promise.all([
        db.from("orgs").select("nombre").eq("id", cal.org_id).maybeSingle(),
        db.from("admin_registros").select("id, tipo, datos").eq("org_id", cal.org_id).in("tipo", ["torneo", "relampago"]),
    ]);

    const ahora = utc(new Date().toISOString());
    const eventos: string[] = [];
    for (const f of filas || []) {
        const d = f.datos || {};
        const lista = f.tipo === "torneo"
            ? (d.fases || []).filter((x: any) => x.utc).map((x: any, i: number) => ({
                uid: `${f.id}-${i}`, inicio: x.utc, horas: 3,
                titulo: `🏆 ${d.nombre || "Torneo"} · ${x.nombre || "Fase " + (i + 1)}`,
                detalle: [d.organizador && `Organiza: ${d.organizador}`, d.premio && `Premio: ${d.premio}`, d.enlace].filter(Boolean).join("\n"),
            }))
            : d.utc ? [{
                uid: f.id, inicio: d.utc, horas: 1,
                titulo: `⚡ Relámpago · ${d.corp || ""}`.trim(),
                detalle: [d.costo != null && `Costo: ${d.costo} USD`, d.premio != null && `Premio: ${d.premio} USD`].filter(Boolean).join("\n"),
            }] : [];
        for (const e of lista) {
            const fin = new Date(new Date(e.inicio).getTime() + e.horas * 3600e3).toISOString();
            eventos.push([
                "BEGIN:VEVENT",
                `UID:${e.uid}@pumasdevlab`,
                `DTSTAMP:${ahora}`,
                `DTSTART:${utc(e.inicio)}`,
                `DTEND:${utc(fin)}`,
                plegar(`SUMMARY:${esc(e.titulo)}`),
                e.detalle ? plegar(`DESCRIPTION:${esc(e.detalle)}`) : "",
                "END:VEVENT",
            ].filter(Boolean).join("\r\n"));
        }
    }

    const ics = [
        "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Pumas Dev Lab//Torneos//ES", "CALSCALE:GREGORIAN", "METHOD:PUBLISH",
        plegar(`X-WR-CALNAME:${esc((org?.nombre || "Equipo") + " · Torneos")}`),
        "X-PUBLISHED-TTL:PT1H",
        ...eventos,
        "END:VCALENDAR",
    ].join("\r\n");

    return new Response(ics, {
        headers: { "Content-Type": "text/calendar; charset=utf-8", "Cache-Control": "public, max-age=900", "Access-Control-Allow-Origin": "*" },
    });
});
