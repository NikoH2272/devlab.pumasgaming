-- ============================================================
-- PUMAS DEV LAB · 003 · Caídas por roster
-- ------------------------------------------------------------
-- Ejecutar en Supabase > SQL Editor (después de 002).
-- Cada roster define su caída principal y una alterna por mapa.
-- La ven todos los que pueden ver el roster (CEO y manager: toda
-- la organización); la editan admin, CEO y el coach del roster.
-- ============================================================

create table caidas (
    team_id uuid not null references teams on delete cascade,
    mapa mapa_ff not null,
    zona text,
    alterna text,
    notas text,
    actualizado timestamptz not null default now(),
    actualizado_por uuid references profiles on delete set null,
    primary key (team_id, mapa)
);

alter table caidas enable row level security;

create policy caidas_ver on caidas for select using (puede_ver_team(team_id));
create policy caidas_crear on caidas for insert with check (puede_editar_team(team_id));
create policy caidas_editar on caidas for update using (puede_editar_team(team_id)) with check (puede_editar_team(team_id));
create policy caidas_borrar on caidas for delete using (puede_editar_team(team_id));

-- Caída usada en cada partida, para medir qué zona rinde más
alter table matches add column if not exists caida text;
